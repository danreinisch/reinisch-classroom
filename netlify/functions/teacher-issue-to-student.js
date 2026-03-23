// Teacher issue-to-student endpoint
// POST /.netlify/functions/teacher-issue-to-student
// Auth: Requires teacher session cookie
// Body: { assignment_id, student_codes: ["S017", "S019"], due_at? }
// Creates assignment_instances for the named students on an existing assignment.
// Uses ON CONFLICT DO NOTHING so repeated calls are safe.
// Returns: { ok, issued_count }

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-issue-to-student] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-issue-to-student] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[teacher-issue-to-student] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const sizeCheck = validateBodySize(event.body, 10);
  if (!sizeCheck.valid) {
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-issue-to-student] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-issue-to-student] [${requestId}] Authorized user: ${authResult.user.username}`);

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { assignment_id, student_codes, due_at } = parseResult.data;

  // Validate assignment_id
  if (!assignment_id) {
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id is required' }, {}, requestId);
  }
  const assignmentIdStr = String(assignment_id).trim();
  if (!/^\d+$/.test(assignmentIdStr)) {
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id must be a positive integer' }, {}, requestId);
  }

  // Validate student_codes
  if (!Array.isArray(student_codes) || student_codes.length === 0) {
    return jsonResponse(event, 400, { ok: false, error: 'student_codes must be a non-empty array' }, {}, requestId);
  }
  // Basic code format validation — codes are short alphanumeric strings like "S017"
  for (const code of student_codes) {
    if (typeof code !== 'string' || code.trim().length === 0 || code.length > 20) {
      return jsonResponse(event, 400, { ok: false, error: 'Each student_code must be a non-empty string (max 20 chars)' }, {}, requestId);
    }
  }

  // Validate optional due_at
  if (due_at !== null && due_at !== undefined) {
    if (typeof due_at !== 'string' || isNaN(new Date(due_at).getTime())) {
      return jsonResponse(event, 400, { ok: false, error: 'due_at must be a valid ISO 8601 date string' }, {}, requestId);
    }
  }

  console.log(`[teacher-issue-to-student] [${requestId}] Issuing assignment ${assignmentIdStr} to student codes: ${student_codes.join(', ')}`);

  try {
    // Step 1: Verify the assignment exists
    const assignmentUrl = `${SUPABASE_URL}/rest/v1/assignments?select=id,title&id=eq.${assignmentIdStr}&limit=1`;
    const assignmentResponse = await fetch(assignmentUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!assignmentResponse.ok) {
      throw new Error(`Failed to verify assignment: ${assignmentResponse.status}`);
    }
    const assignmentRows = await assignmentResponse.json();
    if (!Array.isArray(assignmentRows) || assignmentRows.length === 0) {
      return jsonResponse(event, 404, { ok: false, error: `Assignment ${assignmentIdStr} not found` }, { 'Cache-Control': 'no-store' }, requestId);
    }

    console.log(`[teacher-issue-to-student] [${requestId}] Assignment verified: "${assignmentRows[0].title}"`);

    // Step 2: Look up student UUIDs from codes
    const quotedCodes = student_codes.map(c => `"${c.trim()}"`).join(',');
    const studentsUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code,name&code=in.(${quotedCodes})`;
    const studentsResponse = await fetch(studentsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!studentsResponse.ok) {
      throw new Error(`Failed to look up students: ${studentsResponse.status}`);
    }
    const students = await studentsResponse.json();

    if (!Array.isArray(students) || students.length === 0) {
      return jsonResponse(event, 404, { ok: false, error: `No students found for codes: ${student_codes.join(', ')}` }, { 'Cache-Control': 'no-store' }, requestId);
    }

    // Warn about any codes not found
    const foundCodes = new Set(students.map(s => s.code));
    const notFound = student_codes.filter(c => !foundCodes.has(c));
    if (notFound.length > 0) {
      console.warn(`[teacher-issue-to-student] [${requestId}] Student codes not found: ${notFound.join(', ')}`);
    }

    console.log(`[teacher-issue-to-student] [${requestId}] Found ${students.length} student(s)`);

    // Step 3: Build instance rows and upsert with ON CONFLICT DO NOTHING
    const instances = students.map(student => ({
      assignment_id: parseInt(assignmentIdStr, 10),
      student_id: student.id,
      assigned_at: new Date().toISOString().slice(0, 10), // date only (CURRENT_DATE format)
      status: 'Assigned',
      settings: {},
      ...(due_at ? { due_at } : {}),
    }));

    const instancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances`;
    const upsertResponse = await fetch(instancesUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify(instances),
    });

    if (!upsertResponse.ok) {
      const errorText = await upsertResponse.text();
      console.error(`[teacher-issue-to-student] [${requestId}] Upsert failed: ${upsertResponse.status} - ${errorText}`);
      throw new Error(`Failed to create assignment instances: ${upsertResponse.status}`);
    }

    const createdInstances = await upsertResponse.json().catch(() => []);
    const issued_count = Array.isArray(createdInstances) ? createdInstances.length : 0;

    console.log(`[teacher-issue-to-student] [${requestId}] Issued ${issued_count} new instance(s)`);

    return jsonResponse(
      event,
      200,
      { ok: true, issued_count },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-issue-to-student] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: err.message || 'Failed to issue assignment to student(s)' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
