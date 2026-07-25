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

    // Count only instructional Submitted instances in the active operational year.
    // Missing non_instructional keys remain instructional; explicit true is excluded.
    const url =
      `${SUPABASE_URL}/rest/v1/assignment_instances` +
      `?select=id` +
      `&status=eq.Submitted` +
      `&school_year=eq.${operationalYear}` +
      `&or=(settings->>non_instructional.is.null,settings->>non_instructional.neq.true)`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact',
        'Range': '0-0',
      },
    });

    if (resp.ok === false) {
      throw new Error(`Ungraded instances query failed: ${resp.status}`);
    }

    let count = 0;
    const range = resp.headers.get('Content-Range') || '';
    const match = range.match(/\/(\d+)$/);

    if (match) {
      count = parseInt(match[1], 10);
    } else {
      const body = await resp.json();
      count = Array.isArray(body) ? body.length : 0;
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
