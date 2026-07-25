// Teacher ungraded count endpoint
// GET /.netlify/functions/teacher-ungraded-count
// Auth: Requires teacher session cookie
// Returns: Count of assignment instances with status 'Submitted' (awaiting grading)
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');
const { getOperationalSchoolYear } = require('./_lib/school-year');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(event, 503, { ok: false, count: 0 }, { 'Cache-Control': 'no-store' }, requestId);
  }

  if (!SESSION_SECRET) {
    return jsonResponse(event, 500, { ok: false, count: 0 }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(event, 401, { ok: false, count: 0 }, {}, requestId);
  }

  try {
    // Count only current operational-year instances awaiting grading.
    // Historical and legacy NULL-year records remain preserved but do not
    // inflate the active Teacher Center count.
    const operationalYear = getOperationalSchoolYear();
    const url = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,settings&status=eq.Submitted&school_year=eq.${operationalYear}`;

    const pageSize = 1000;
    let offset = 0;
    let count = 0;

    while (true) {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Range': `${offset}-${offset + pageSize - 1}`,
        },
      });

      if (!resp.ok) {
        throw new Error(`Ungraded instances query failed: ${resp.status}`);
      }

      const rows = await resp.json();
      const page = Array.isArray(rows) ? rows : [];

      count += page.filter(
        inst => inst?.settings?.non_instructional !== true
      ).length;

      if (page.length < pageSize) break;
      offset += pageSize;
    }

    return jsonResponse(
      event,
      200,
      { ok: true, count },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-ungraded-count] [${requestId}] Error:`, err);
    return jsonResponse(event, 500, { ok: false, count: 0 }, {}, requestId);
  }
};
