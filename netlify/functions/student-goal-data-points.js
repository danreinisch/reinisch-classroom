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

const {
  getStudentVisibleSchoolYears,
} = require('./_lib/student-visible-school-years');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

function dedupeAssignmentGoalDataPoints(rows) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  const output = [];
  const assignmentRows =
    new Map();

  safeRows.forEach((row, index) => {
    if (
      !row ||
      !row.assignment_instance_id ||
      row.item_id === null ||
      row.item_id === undefined ||
      !row.goal_id
    ) {
      output.push({
        index,
        row,
      });

      return;
    }

    const key = [
      row.assignment_instance_id,
      row.item_id,
      row.goal_id,
    ].join('|');

    const stamp =
      String(row.created_at || '');

    const id =
      String(row.id || '');

    const existing =
      assignmentRows.get(key);

    if (
      !existing ||
      stamp > existing.stamp ||
      (
        stamp === existing.stamp &&
        id > existing.id
      )
    ) {
      assignmentRows.set(
        key,
        {
          index,
          row,
          stamp,
          id,
        },
      );
    }
  });

  output.push(
    ...assignmentRows.values(),
  );

  output.sort(
    (a, b) =>
      a.index - b.index,
  );

  return output.map(
    entry => entry.row,
  );
}

async function filterInstructionalEvidenceRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const instanceIds = [
    ...new Set(
      safeRows
        .map(row => row?.assignment_instance_id)
        .filter(Boolean)
    )
  ];

  if (instanceIds.length === 0) return safeRows;

  const instancesUrl =
    `${SUPABASE_URL}/rest/v1/assignment_instances` +
    `?select=id,settings` +
    `&id=in.(${instanceIds.map(encodeURIComponent).join(',')})`;

  const instancesResponse = await fetch(instancesUrl, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!instancesResponse.ok) {
    throw new Error(
      `Assignment-instance marker lookup failed: ${instancesResponse.status}`
    );
  }

  const instances = await instancesResponse.json();
  const nonInstructionalIds = new Set(
    (instances || [])
      .filter(instance => instance?.settings?.non_instructional === true)
      .map(instance => instance.id)
  );

  return safeRows.filter(
    row =>
      !row.assignment_instance_id ||
      !nonInstructionalIds.has(row.assignment_instance_id)
  );
}

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

    // Student Portal question-level goal evidence follows the same
    // school-year visibility contract as aggregate goal progress.
    // Historical evidence remains stored for teacher/history readers.
    const visibleSchoolYears =
      getStudentVisibleSchoolYears();

    const schoolYearFilters =
      visibleSchoolYears
        .map(year => `school_year.eq.${year}`)
        .join(',');

    // Build query — optionally filter by goal_id
    let dataPointsUrl = `${SUPABASE_URL}/rest/v1/goal_data_points?student_id=eq.${encodeURIComponent(studentId)}&or=(${schoolYearFilters})&order=date.asc,created_at.asc`;
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

    const rowsRaw = await dpResponse.json();
    const rows =
      dedupeAssignmentGoalDataPoints(await filterInstructionalEvidenceRows(rowsRaw));

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
