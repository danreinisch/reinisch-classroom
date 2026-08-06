// Teacher issue assignment endpoint
// POST /.netlify/functions/teacher-issue-assignment
//   Auth: Requires teacher session cookie
//   Body: { assignment_id, student_ids[], due_at?, settings?, per_student_settings? }
//   Returns: { ok, inserted_count, skipped_count, instances[] }
// PATCH /.netlify/functions/teacher-issue-assignment
//   Body: { instance_id, settings_patch }
//   Returns: { ok, instance }
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

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-issue-assignment] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'PATCH', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'PATCH') {
    console.log(`[teacher-issue-assignment] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Validate Content-Type
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json')) {
    console.log(`[teacher-issue-assignment] [${requestId}] Invalid Content-Type: ${contentType}`);
    return jsonResponse(event, 400, { ok: false, error: 'Content-Type must be application/json' }, {}, requestId);
  }

  // Validate body size (allow up to 100KB for larger student lists)
  const bodySizeCheck = validateBodySize(event.body, 100);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-issue-assignment] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[teacher-issue-assignment] [${requestId}] Supabase not configured`);
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
    console.error(`[teacher-issue-assignment] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  // Verify teacher session
  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-issue-assignment] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-issue-assignment] [${requestId}] Authorized user: ${authResult.user.username}`);

  // Parse JSON safely
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-issue-assignment] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  // --- PATCH: Reconfigure an existing instance ---
  if (event.httpMethod === 'PATCH') {
    return handleReconfigure(event, parseResult.data, requestId);
  }

  const { assignment_id, student_ids, due_at, settings, per_student_settings } = parseResult.data;

  // Validate assignment_id
  if (!assignment_id) {
    console.log(`[teacher-issue-assignment] [${requestId}] Missing assignment_id`);
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id is required' }, {}, requestId);
  }

  // Validate assignment_id is a number (bigint in DB)
  if (typeof assignment_id !== 'number' || !Number.isInteger(assignment_id)) {
    console.log(`[teacher-issue-assignment] [${requestId}] Invalid assignment_id type: ${typeof assignment_id}`);
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id must be an integer' }, {}, requestId);
  }

  // Validate student_ids
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    console.log(`[teacher-issue-assignment] [${requestId}] Invalid student_ids: must be non-empty array`);
    return jsonResponse(event, 400, { ok: false, error: 'student_ids must be a non-empty array' }, {}, requestId);
  }

  // Validate each student_id is a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const studentId of student_ids) {
    if (typeof studentId !== 'string' || !uuidRegex.test(studentId)) {
      console.log(`[teacher-issue-assignment] [${requestId}] Invalid student_id format: ${studentId}`);
      return jsonResponse(event, 400, { ok: false, error: 'All student_ids must be valid UUIDs' }, {}, requestId);
    }
  }

  // Validate due_at if provided (should be ISO 8601 date string or null)
  if (due_at !== null && due_at !== undefined) {
    if (typeof due_at !== 'string') {
      console.log(`[teacher-issue-assignment] [${requestId}] Invalid due_at type: ${typeof due_at}`);
      return jsonResponse(event, 400, { ok: false, error: 'due_at must be a string or null' }, {}, requestId);
    }
    // Validate ISO 8601 format
    const date = new Date(due_at);
    if (isNaN(date.getTime())) {
      console.log(`[teacher-issue-assignment] [${requestId}] Invalid due_at format: ${due_at}`);
      return jsonResponse(event, 400, { ok: false, error: 'due_at must be a valid ISO 8601 date string' }, {}, requestId);
    }
  }

  // Validate settings if provided (should be an object)
  if (settings !== null && settings !== undefined) {
    if (typeof settings !== 'object' || Array.isArray(settings)) {
      console.log(`[teacher-issue-assignment] [${requestId}] Invalid settings type: ${typeof settings}`);
      return jsonResponse(event, 400, { ok: false, error: 'settings must be an object or null' }, {}, requestId);
    }
  }

  // Validate per_student_settings if provided
  let validatedPerStudentSettings = null;
  if (per_student_settings !== null && per_student_settings !== undefined) {
    if (typeof per_student_settings !== 'object' || Array.isArray(per_student_settings)) {
      return jsonResponse(event, 400, { ok: false, error: 'per_student_settings must be a plain object' }, {}, requestId);
    }
    validatedPerStudentSettings = {};
    for (const [code, overrides] of Object.entries(per_student_settings)) {
      if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
        return jsonResponse(event, 400, { ok: false, error: `per_student_settings["${code}"] must be a plain object` }, {}, requestId);
      }
      // Validate and clamp paragraph_count if present
      const perStudentEntry = { ...overrides };
      if (perStudentEntry.writing_config != null) {
        if (typeof perStudentEntry.writing_config !== 'object' || Array.isArray(perStudentEntry.writing_config)) {
          return jsonResponse(event, 400, { ok: false, error: `per_student_settings["${code}"].writing_config must be a plain object` }, {}, requestId);
        }
        if (perStudentEntry.writing_config.paragraph_count != null) {
          let pc = parseInt(perStudentEntry.writing_config.paragraph_count, 10);
          if (isNaN(pc)) pc = 1;
          pc = Math.min(5, Math.max(1, pc));
          perStudentEntry.writing_config = { ...perStudentEntry.writing_config, paragraph_count: pc };
        }
      }
      validatedPerStudentSettings[code] = perStudentEntry;
    }
  }

  console.log(`[teacher-issue-assignment] [${requestId}] Issuing assignment ${assignment_id} to ${student_ids.length} students`);

  try {
    // First, fetch student details to get student_code for each student_id
    const studentsUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code,name,active,archived_at&id=in.(${student_ids.map(id => `"${id}"`).join(',')})`;
    
    console.log(`[teacher-issue-assignment] [${requestId}] Fetching student details`);
    
    const studentsResponse = await fetch(studentsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!studentsResponse.ok) {
      console.error(`[teacher-issue-assignment] [${requestId}] Students query failed with status: ${studentsResponse.status}`);
      throw new Error(`Students query failed: ${studentsResponse.status}`);
    }

    const students = await studentsResponse.json();
    
    if (!students || students.length === 0) {
      console.log(`[teacher-issue-assignment] [${requestId}] No students found for provided IDs`);
      return jsonResponse(event, 404, { ok: false, error: 'No students found for provided IDs' }, {}, requestId);
    }

    const inactiveStudents = students.filter(
      student =>
        !student ||
        student.active === false ||
        Boolean(student.archived_at)
    );

    if (inactiveStudents.length > 0) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'One or more selected students are inactive or archived'
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    console.log(`[teacher-issue-assignment] [${requestId}] Found ${students.length} students`);

    // Build instances to upsert — apply per-student settings override where provided
    const baseSettings = settings || {};
    const instances = students.map(student => {
      const perStudentOverride = validatedPerStudentSettings && validatedPerStudentSettings[student.code];
      const instanceSettings = perStudentOverride
        ? { ...baseSettings, ...perStudentOverride }
        : baseSettings;
      return {
        assignment_id: assignment_id,
        student_id: student.id,
        student_code: student.code,
        student_name: student.name || student.code,
        assigned_at: new Date().toISOString(),
        due_at: due_at || null,
        status: 'Assigned',
        settings: instanceSettings,
      };
    });

    // Use upsert with resolution=merge-duplicates for idempotency
    // This will update existing records or insert new ones based on unique constraint
    const instancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances`;
    
    console.log(`[teacher-issue-assignment] [${requestId}] Upserting ${instances.length} assignment instances`);
    
    const upsertResponse = await fetch(instancesUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(instances)
    });

    if (!upsertResponse.ok) {
      const errorText = await upsertResponse.text();
      console.error(`[teacher-issue-assignment] [${requestId}] Upsert failed with status ${upsertResponse.status}: ${errorText}`);
      throw new Error(`Failed to issue assignments: ${upsertResponse.status}`);
    }

    const upsertedInstances = await upsertResponse.json();
    
    // Note: With resolution=merge-duplicates, we can't distinguish between new inserts and updates
    // from the response alone. All records are returned. For now, we report total as inserted_count
    // and skipped_count as 0. To get accurate counts, we would need to query existing instances first.
    const inserted_count = upsertedInstances.length;
    const skipped_count = 0;

    console.log(`[teacher-issue-assignment] [${requestId}] Successfully issued: ${inserted_count} instances created/updated`);
    
    return jsonResponse(
      event,
      200,
      { 
        ok: true, 
        inserted_count,
        skipped_count,
        instances: upsertedInstances
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-issue-assignment] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to issue assignments' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};

/**
 * PATCH handler: Reconfigure settings on an existing assignment instance.
 * Body: { instance_id: "uuid", settings_patch: { writing_config: { paragraph_count: 2 } } }
 */
async function handleReconfigure(event, body, requestId) {
  const { instance_id, settings_patch } = body || {};

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!instance_id || typeof instance_id !== 'string' || !uuidRegex.test(instance_id)) {
    return jsonResponse(event, 400, { ok: false, error: 'instance_id must be a valid UUID' }, {}, requestId);
  }

  if (!settings_patch || typeof settings_patch !== 'object' || Array.isArray(settings_patch)) {
    return jsonResponse(event, 400, { ok: false, error: 'settings_patch must be a plain object' }, {}, requestId);
  }

  // Validate and clamp paragraph_count if present in settings_patch
  const patch = { ...settings_patch };
  if (patch.writing_config != null) {
    if (typeof patch.writing_config !== 'object' || Array.isArray(patch.writing_config)) {
      return jsonResponse(event, 400, { ok: false, error: 'settings_patch.writing_config must be a plain object' }, {}, requestId);
    }
    if (patch.writing_config.paragraph_count != null) {
      let pc = parseInt(patch.writing_config.paragraph_count, 10);
      if (isNaN(pc)) pc = 1;
      pc = Math.min(5, Math.max(1, pc));
      patch.writing_config = { ...patch.writing_config, paragraph_count: pc };
    }
  }

  try {
    // Fetch existing instance settings
    const getUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,settings&id=eq.${instance_id}&limit=1`;
    const getResponse = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!getResponse.ok) throw new Error(`Failed to fetch instance: ${getResponse.status}`);
    const rows = await getResponse.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonResponse(event, 404, { ok: false, error: 'Instance not found' }, { 'Cache-Control': 'no-store' }, requestId);
    }

    // Deep-merge: existing settings + patch (one-level deep to preserve nested props)
    const existing = rows[0];
    const existingSettings = existing.settings || {};
    const mergedSettings = { ...existingSettings };
    for (const [key, val] of Object.entries(patch)) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) &&
          typeof mergedSettings[key] === 'object' && mergedSettings[key] !== null && !Array.isArray(mergedSettings[key])) {
        mergedSettings[key] = { ...mergedSettings[key], ...val };
      } else {
        mergedSettings[key] = val;
      }
    }

    // PATCH the instance
    const patchUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?id=eq.${instance_id}`;
    const patchResponse = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ settings: mergedSettings }),
    });
    if (!patchResponse.ok) {
      const errText = await patchResponse.text();
      throw new Error(`Failed to patch instance: ${patchResponse.status} - ${errText}`);
    }
    const updated = await patchResponse.json();
    const updatedInstance = Array.isArray(updated) ? updated[0] : updated;

    console.log(`[teacher-issue-assignment] [${requestId}] Reconfigured instance ${instance_id}`);
    return jsonResponse(event, 200, { ok: true, instance: updatedInstance }, { 'Cache-Control': 'no-store' }, requestId);
  } catch (err) {
    console.error(`[teacher-issue-assignment] [${requestId}] Reconfigure error:`, err);
    return jsonResponse(event, 500, { ok: false, error: 'Failed to reconfigure instance' }, { 'Cache-Control': 'no-store' }, requestId);
  }
}
