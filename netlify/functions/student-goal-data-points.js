// Student goal data points endpoint - returns per-question data points for a student
// GET /.netlify/functions/student-goal-data-points?code=XXX[&goal_id=YYY]
// Auth: Requires student code parameter
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  requireStudent,
} = require('./_lib/student-auth');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-goal-data-points] [${requestId}] Request received`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      event,
      200,
      { ok: true, data_points: [], unavailable: true, reason: 'supabase_not_configured' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const params = event.queryStringParameters || {};
  const code = params.code;
  const goalId = params.goal_id || null;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Student code is required' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const codeNorm = code.trim().toUpperCase();

  const studentAuth =
    requireStudent(
      event,
      SESSION_SECRET,
      codeNorm
    );

  if (!studentAuth.ok) {
    return jsonResponse(
      event,
      studentAuth.statusCode,
      {
        ok: false,
        error: studentAuth.error,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  try {
    // Resolve student ID from code
    const studentUrl = `${SUPABASE_URL}/rest/v1/students?select=id&code=eq.${encodeURIComponent(codeNorm)}&limit=1`;
    const studentResponse = await fetch(studentUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!studentResponse.ok) {
      throw new Error(`Student lookup failed: ${studentResponse.status}`);
    }

    const studentData = await studentResponse.json();
    if (!studentData || studentData.length === 0) {
      return jsonResponse(
        event,
        404,
        { ok: false, error: 'Student not found' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const studentId = studentData[0].id;

    // Build query — optionally filter by goal_id
    let dataPointsUrl = `${SUPABASE_URL}/rest/v1/goal_data_points?student_id=eq.${encodeURIComponent(studentId)}&order=date.asc,created_at.asc`;
    if (goalId) {
      dataPointsUrl += `&goal_id=eq.${encodeURIComponent(goalId)}`;
    }

    const dpResponse = await fetch(dataPointsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!dpResponse.ok) {
      const errBody = await dpResponse.text();
      // If the table doesn't exist yet, return empty gracefully
      if (dpResponse.status === 404 || dpResponse.status === 400) {
        console.warn(`[student-goal-data-points] [${requestId}] Table may not exist yet: ${errBody}`);
        return jsonResponse(
          event,
          200,
          { ok: true, data_points: [], unavailable: true, reason: 'schema_unavailable' },
          { 'Cache-Control': 'no-store' },
          requestId
        );
      }
      throw new Error(`Data points query failed: ${dpResponse.status} - ${errBody}`);
    }

    const rows = await dpResponse.json();

    console.log(`[student-goal-data-points] [${requestId}] Fetched ${(rows || []).length} data point(s) for student ${codeNorm}`);

    return jsonResponse(
      event,
      200,
      { ok: true, data_points: rows || [] },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-goal-data-points] [${requestId}] Unexpected error:`, err);
    return jsonResponse(
      event,
      200,
      { ok: true, data_points: [], unavailable: true, error: 'Service temporarily unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
