// Teacher students upsert endpoint
// POST /.netlify/functions/teacher-students-upsert
// Auth: Requires teacher session cookie
// Body: { students: [{ code, name?, class_id? }, ...] }
// Returns: { ok, upserted_count, students[] }
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

// Maximum batch size for student upserts (prevent abuse)
const MAX_BATCH_SIZE = 500;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-students-upsert] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'POST') {
    console.log(`[teacher-students-upsert] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Validate Content-Type
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json')) {
    console.log(`[teacher-students-upsert] [${requestId}] Invalid Content-Type: ${contentType}`);
    return jsonResponse(event, 400, { ok: false, error: 'Content-Type must be application/json' }, {}, requestId);
  }

  // Validate body size (allow up to 100KB for batch operations)
  const bodySizeCheck = validateBodySize(event.body, 100);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-students-upsert] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[teacher-students-upsert] [${requestId}] Supabase not configured`);
    return jsonResponse(
      event, 
      503, 
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Check if SESSION_SECRET is configured
  if (!SESSION_SECRET) {
    console.error(`[teacher-students-upsert] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  // Verify teacher session
  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-students-upsert] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-students-upsert] [${requestId}] Authorized user: ${authResult.user.username}`);

  // Parse JSON safely
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-students-upsert] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { students } = parseResult.data;

  // Validate students array
  if (!Array.isArray(students)) {
    console.log(`[teacher-students-upsert] [${requestId}] Invalid students: must be an array`);
    return jsonResponse(event, 400, { ok: false, error: 'students must be an array' }, {}, requestId);
  }

  if (students.length === 0) {
    console.log(`[teacher-students-upsert] [${requestId}] Empty students array`);
    return jsonResponse(event, 200, { ok: true, upserted_count: 0, students: [] }, {}, requestId);
  }

  // Check batch size limit
  if (students.length > MAX_BATCH_SIZE) {
    console.log(`[teacher-students-upsert] [${requestId}] Batch size too large: ${students.length} > ${MAX_BATCH_SIZE}`);
    return jsonResponse(
      event, 
      400, 
      { ok: false, error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} students` }, 
      {}, 
      requestId
    );
  }

  // Validate each student record
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    
    if (!student || typeof student !== 'object') {
      console.log(`[teacher-students-upsert] [${requestId}] Invalid student at index ${i}: not an object`);
      return jsonResponse(
        event, 
        400, 
        { ok: false, error: `Student at index ${i} must be an object` }, 
        {}, 
        requestId
      );
    }

    // code is required
    if (!student.code || typeof student.code !== 'string') {
      console.log(`[teacher-students-upsert] [${requestId}] Invalid student at index ${i}: missing or invalid code`);
      return jsonResponse(
        event, 
        400, 
        { ok: false, error: `Student at index ${i} must have a valid 'code' string` }, 
        {}, 
        requestId
      );
    }

    // name is optional but must be string if provided
    if (student.name !== undefined && student.name !== null && typeof student.name !== 'string') {
      console.log(`[teacher-students-upsert] [${requestId}] Invalid student at index ${i}: name must be string or null`);
      return jsonResponse(
        event, 
        400, 
        { ok: false, error: `Student at index ${i} has invalid 'name' (must be string or null)` }, 
        {}, 
        requestId
      );
    }

    // class_id is optional but must be string if provided
    if (student.class_id !== undefined && student.class_id !== null && typeof student.class_id !== 'string') {
      console.log(`[teacher-students-upsert] [${requestId}] Invalid student at index ${i}: class_id must be string or null`);
      return jsonResponse(
        event, 
        400, 
        { ok: false, error: `Student at index ${i} has invalid 'class_id' (must be string or null)` }, 
        {}, 
        requestId
      );
    }
  }

  console.log(`[teacher-students-upsert] [${requestId}] Upserting ${students.length} students`);

  try {
    // Prepare student records for upsert
    // Ensure all required fields are present
    const studentsToUpsert = students.map(s => ({
      code: s.code,
      name: s.name || s.code, // Default name to code if not provided
      class_id: s.class_id || null
    }));

    // Use upsert with resolution=merge-duplicates for idempotency
    // This will update existing records or insert new ones based on the 'code' unique constraint
    // TC-3.1: Add on_conflict parameter to enable true upsert (fix 409 errors)
    const studentsUrl = `${SUPABASE_URL}/rest/v1/students?on_conflict=code`;
    
    console.log(`[teacher-students-upsert] [${requestId}] Upserting students to Supabase with on_conflict=code`);
    
    const upsertResponse = await fetch(studentsUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(studentsToUpsert)
    });

    if (!upsertResponse.ok) {
      const errorText = await upsertResponse.text();
      console.error(`[teacher-students-upsert] [${requestId}] Upsert failed with status ${upsertResponse.status}: ${errorText}`);
      
      // Try to parse error details
      let errorDetail = 'Unknown error';
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.message || errorJson.hint || errorText;
      } catch {
        errorDetail = errorText;
      }
      
      return jsonResponse(
        event,
        upsertResponse.status,
        { ok: false, error: 'Failed to upsert students', detail: errorDetail },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const upsertedStudents = await upsertResponse.json();
    
    console.log(`[teacher-students-upsert] [${requestId}] Successfully upserted ${upsertedStudents.length} students`);
    
    return jsonResponse(
      event,
      200,
      { 
        ok: true, 
        upserted_count: upsertedStudents.length,
        students: upsertedStudents
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-students-upsert] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to upsert students', detail: err.message },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
