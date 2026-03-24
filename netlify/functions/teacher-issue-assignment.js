// Teacher issue assignment endpoint
// POST /.netlify/functions/teacher-issue-assignment
// Auth: Requires teacher session cookie
// Body: { assignment_id, student_ids[], due_at?, settings?, per_student_settings? }
// Returns: { ok, inserted_count, skipped_count, instances[] }
//
// PATCH /.netlify/functions/teacher-issue-assignment
// Auth: Requires teacher session cookie
// Body: { instance_id, settings_patch }
// Returns: { ok, instance }
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

  // -----------------------------------------------------------------------
  // PATCH — Reconfigure settings on an already-issued instance
  // -----------------------------------------------------------------------
  if (event.httpMethod === 'PATCH') {
    const { instance_id, settings_patch } = parseResult.data;
    const uuidRegexPatch = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!instance_id || typeof instance_id !== 'string' || !uuidRegexPatch.test(instance_id)) {
      return jsonResponse(event, 400, { ok: false, error: 'instance_id must be a valid UUID' }, {}, requestId);
    }

    if (!settings_patch || typeof settings_patch !== 'object' || Array.isArray(settings_patch)) {
      return jsonResponse(event, 400, { ok: false, error: 'settings_patch must be a plain object' }, {}, requestId);
    }

    // Clamp paragraph_count in settings_patch if present
    if (settings_patch.writing_config && settings_patch.writing_config.paragraph_count != null) {
      const parsed = parseInt(settings_patch.writing_config.paragraph_count, 10);
      if (!isNaN(parsed)) {
        settings_patch.writing_config.paragraph_count = Math.min(5, Math.max(1, parsed));
      } else {
        delete settings_patch.writing_config.paragraph_count;
      }
    }

    try {
      // Fetch current instance settings
      const fetchUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,settings&id=eq.${encodeURIComponent(instance_id)}&limit=1`;
      const fetchResponse = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch instance: ${fetchResponse.status}`);
      }
      const fetchRows = await fetchResponse.json();
      if (!Array.isArray(fetchRows) || fetchRows.length === 0) {
        return jsonResponse(event, 404, { ok: false, error: 'Instance not found' }, { 'Cache-Control': 'no-store' }, requestId);
      }

      const existingSettings = fetchRows[0].settings || {};

      // Deep-merge settings_patch into existing settings
      const mergedSettings = Object.assign({}, existingSettings);
      for (const [key, val] of Object.entries(settings_patch)) {
        if (val !== null && typeof val === 'object' && !Array.isArray(val) &&
            mergedSettings[key] !== null && typeof mergedSettings[key] === 'object' && !Array.isArray(mergedSettings[key])) {
          mergedSettings[key] = Object.assign({}, mergedSettings[key], val);
        } else {
          mergedSettings[key] = val;
        }
      }

      // PATCH the instance
      const patchUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?id=eq.${encodeURIComponent(instance_id)}`;
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
        const errorText = await patchResponse.text();
        throw new Error(`Failed to patch instance: ${patchResponse.status} - ${errorText}`);
      }

      const patchedRows = await patchResponse.json();
      const instance = Array.isArray(patchedRows) ? patchedRows[0] : patchedRows;

      console.log(`[teacher-issue-assignment] [${requestId}] Reconfigured instance ${instance_id}`);
      return jsonResponse(event, 200, { ok: true, instance }, { 'Cache-Control': 'no-store' }, requestId);
    } catch (err) {
      console.error(`[teacher-issue-assignment] [${requestId}] PATCH error:`, err);
      return jsonResponse(event, 500, { ok: false, error: err.message || 'Failed to reconfigure instance' }, { 'Cache-Control': 'no-store' }, requestId);
    }
  }

  // -----------------------------------------------------------------------
  // POST — Issue assignment to students
  // -----------------------------------------------------------------------
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

  // Validate per_student_settings if provided (must be a plain object of plain objects)
  const validatedPerStudentSettings = {};
  if (per_student_settings !== null && per_student_settings !== undefined) {
    if (typeof per_student_settings !== 'object' || Array.isArray(per_student_settings)) {
      return jsonResponse(event, 400, { ok: false, error: 'per_student_settings must be a plain object' }, {}, requestId);
    }
    for (const [key, val] of Object.entries(per_student_settings)) {
      if (typeof val !== 'object' || val === null || Array.isArray(val)) {
        return jsonResponse(event, 400, { ok: false, error: `per_student_settings["${key}"] must be a plain object` }, {}, requestId);
      }
      // Clamp paragraph_count if present
      const override = Object.assign({}, val);
      if (override.writing_config && override.writing_config.paragraph_count != null) {
        const parsedCount = parseInt(override.writing_config.paragraph_count, 10);
        if (!isNaN(parsedCount)) {
          override.writing_config = Object.assign({}, override.writing_config, {
            paragraph_count: Math.min(5, Math.max(1, parsedCount)),
          });
        } else {
          const wc = Object.assign({}, override.writing_config);
          delete wc.paragraph_count;
          override.writing_config = wc;
        }
      }
      validatedPerStudentSettings[key] = override;
    }
  }

  console.log(`[teacher-issue-assignment] [${requestId}] Issuing assignment ${assignment_id} to ${student_ids.length} students`);

  try {
    // First, fetch student details to get student_code for each student_id
    const studentsUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code,name&id=in.(${student_ids.map(id => `"${id}"`).join(',')})`;
    
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

    console.log(`[teacher-issue-assignment] [${requestId}] Found ${students.length} students`);

    // Build instances to upsert — apply per-student settings overrides if provided
    const baseSettings = settings || {};
    const instances = students.map(student => {
      const perStudentOverride = validatedPerStudentSettings[student.id];
      const instanceSettings = perStudentOverride
        ? Object.assign({}, baseSettings, perStudentOverride)
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
