// Student submit answer endpoint
// POST /.netlify/functions/student-submit-answer
// Auth: Requires valid student code (from query param or body)
// Body: { instance_id, answers, writing_response }
// Returns: { ok: true }

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { getSupabaseConfig } = require('./_lib/supa');

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-submit-answer] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'POST') {
    console.log(`[student-submit-answer] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Validate Content-Type
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json')) {
    console.log(`[student-submit-answer] [${requestId}] Invalid Content-Type: ${contentType}`);
    return jsonResponse(event, 400, { ok: false, error: 'Content-Type must be application/json' }, {}, requestId);
  }

  // Validate body size (allow up to 50KB for answers)
  const bodySizeCheck = validateBodySize(event.body, 50);
  if (!bodySizeCheck.valid) {
    console.log(`[student-submit-answer] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[student-submit-answer] [${requestId}] Supabase not configured`);
    return jsonResponse(
      event, 
      503, 
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Parse JSON safely
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[student-submit-answer] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { instance_id, answers, writing_response, student_code } = parseResult.data;

  // Validate instance_id
  if (!instance_id || typeof instance_id !== 'string') {
    console.log(`[student-submit-answer] [${requestId}] Missing or invalid instance_id`);
    return jsonResponse(event, 400, { ok: false, error: 'instance_id is required and must be a string' }, {}, requestId);
  }

  // Get student_code from query param or body
  const queryParams = event.queryStringParameters || {};
  const code = student_code || queryParams.student_code || queryParams.code;

  if (!code || typeof code !== 'string') {
    console.log(`[student-submit-answer] [${requestId}] Missing student_code`);
    return jsonResponse(event, 400, { ok: false, error: 'student_code is required' }, {}, requestId);
  }

  console.log(`[student-submit-answer] [${requestId}] Submitting answers for instance ${instance_id}, student code: ${code}`);

  try {
    // Step 1: Verify student exists and get student ID
    const studentUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code&code=eq.${encodeURIComponent(code)}`;
    
    const studentResponse = await fetch(studentUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!studentResponse.ok) {
      console.error(`[student-submit-answer] [${requestId}] Student lookup failed with status: ${studentResponse.status}`);
      return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
    }

    const students = await studentResponse.json();
    if (!students || students.length === 0) {
      console.log(`[student-submit-answer] [${requestId}] Student not found for code: ${code}`);
      return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
    }

    const student = students[0];

    // Step 2: Verify assignment instance exists and belongs to this student
    const instanceUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,student_id,settings,status&id=eq.${encodeURIComponent(instance_id)}`;
    
    const instanceResponse = await fetch(instanceUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!instanceResponse.ok) {
      console.error(`[student-submit-answer] [${requestId}] Instance lookup failed with status: ${instanceResponse.status}`);
      return jsonResponse(event, 404, { ok: false, error: 'Assignment not found' }, {}, requestId);
    }

    const instances = await instanceResponse.json();
    if (!instances || instances.length === 0) {
      console.log(`[student-submit-answer] [${requestId}] Instance not found: ${instance_id}`);
      return jsonResponse(event, 404, { ok: false, error: 'Assignment not found' }, {}, requestId);
    }

    const instance = instances[0];

    // Verify instance belongs to this student
    if (instance.student_id !== student.id) {
      console.log(`[student-submit-answer] [${requestId}] Instance does not belong to student`);
      return jsonResponse(event, 403, { ok: false, error: 'Forbidden' }, {}, requestId);
    }

    // Step 3: Build updated settings object
    const currentSettings = instance.settings || {};
    const updatedSettings = {
      ...currentSettings,
      answers: answers || currentSettings.answers || {},
      writing_response: writing_response || currentSettings.writing_response || '',
      submitted_at: new Date().toISOString()
    };

    // Step 4: Determine new status
    // If writing_response is provided or answers are complete, mark as "Submitted"
    // Otherwise mark as "In Progress"
    let newStatus = 'In Progress';
    if (writing_response || (answers && Object.keys(answers).length > 0)) {
      newStatus = 'Submitted';
    }

    // Step 5: Update assignment instance
    const updateUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?id=eq.${encodeURIComponent(instance_id)}`;
    
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        settings: updatedSettings,
        status: newStatus
      })
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[student-submit-answer] [${requestId}] Update failed: ${updateResponse.status} - ${errorText}`);
      return jsonResponse(event, 500, { ok: false, error: 'Failed to save answers' }, {}, requestId);
    }

    console.log(`[student-submit-answer] [${requestId}] Successfully saved answers for instance ${instance_id}`);
    
    return jsonResponse(
      event,
      200,
      { ok: true },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-submit-answer] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: err.message || 'Failed to submit answer' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
