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

/**
 * Check if an error response indicates a schema-related issue
 * @param {string} errorText - The error response text
 * @returns {boolean} True if error is schema-related
 */
function isSchemaError(errorText) {
  const text = (errorText || '').toLowerCase();
  return (
    text.includes('column') && text.includes('does not exist') ||
    text.includes('relation') && text.includes('does not exist') ||
    text.includes('undefined column') ||
    text.includes('42703') || // PostgreSQL undefined_column error code
    text.includes('42p01')    // PostgreSQL undefined_table error code (lowercased for comparison)
  );
}

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
    // Include new fields if provided (avoids schema errors on old DBs)
    const studentsToUpsert = students.map(s => {
      const record = {
        code: s.code,
        name: s.name || s.code, // Default name to code if not provided
        class_id: s.class_id || null
      };
      // Include new fields only if provided
      if (s.iep_due !== undefined) record.iep_due = s.iep_due;
      if (s.eval_due !== undefined) record.eval_due = s.eval_due;
      if (s.primary_case_manager !== undefined) record.primary_case_manager = s.primary_case_manager;
      if (s.archived_at !== undefined) record.archived_at = s.archived_at;
      if (s.active !== undefined) record.active = s.active;
      return record;
    });

    // Use upsert with resolution=merge-duplicates for idempotency
    // This will update existing records or insert new ones based on the 'code' unique constraint
    // TC-3.1: Add on_conflict parameter to enable true upsert (fix 409 errors)
    const studentsUrl = `${SUPABASE_URL}/rest/v1/students?on_conflict=code`;
    
    console.log(`[teacher-students-upsert] [${requestId}] Upserting students to Supabase with on_conflict=code`);
    
    let upsertResponse = await fetch(studentsUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(studentsToUpsert)
    });

    // If 400 error, check if it's a schema error and retry with basic fields only
    if (upsertResponse.status === 400) {
      const errorText = await upsertResponse.text();
      
      // Only retry if the error is actually schema-related
      if (isSchemaError(errorText)) {
        console.warn(`[teacher-students-upsert] [${requestId}] Schema error detected, retrying with basic fields only: ${errorText}`);
        
        // Retry with basic fields only
        const basicStudents = students.map(s => ({
          code: s.code,
          name: s.name || s.code,
          class_id: s.class_id || null
        }));
        
        upsertResponse = await fetch(studentsUrl, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(basicStudents)
        });
        
        console.log(`[teacher-students-upsert] [${requestId}] Retry with basic fields resulted in status ${upsertResponse.status}`);
      } else {
        // Not a schema error, so we need to handle it normally
        // Re-create response for error handling below since we consumed the body
        console.error(`[teacher-students-upsert] [${requestId}] Non-schema 400 error: ${errorText}`);
        return jsonResponse(
          event,
          400,
          { ok: false, error: 'Failed to upsert students', detail: errorText },
          { 'Cache-Control': 'no-store' },
          requestId
        );
      }
    }

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
