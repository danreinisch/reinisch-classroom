// Teacher Close Year — Pre-flight check endpoint
// GET /.netlify/functions/teacher-close-year-preflight
// Auth: Requires teacher session cookie
// Returns: summary counts for the current school year

function getCurrentSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

async function supaCount(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`COUNT ${path} failed: ${res.status} ${text}`);
  }
  const contentRange = res.headers.get('content-range');
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows.length : 0;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-close-year-preflight] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-close-year-preflight] [${requestId}] Server not configured`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[teacher-close-year-preflight] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-close-year-preflight] [${requestId}] Unauthorized`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const school_year = getCurrentSchoolYear();
  console.log(`[teacher-close-year-preflight] [${requestId}] Fetching counts for school_year=${school_year}`);

  try {
    const [
      active_students,
      assignments,
      assignment_instances,
      submissions,
      goal_progress,
      null_assignments,
      null_submissions,
      null_goal_progress,
    ] = await Promise.all([
      supaCount(`/rest/v1/students?select=id&active=eq.true`),
      supaCount(`/rest/v1/assignments?select=id&school_year=eq.${school_year}`),
      supaCount(`/rest/v1/assignment_instances?select=id&school_year=eq.${school_year}`),
      supaCount(`/rest/v1/submissions?select=id&school_year=eq.${school_year}`),
      supaCount(`/rest/v1/goal_progress?select=id&school_year=eq.${school_year}`),
      supaCount(`/rest/v1/assignments?select=id&school_year=is.null`),
      supaCount(`/rest/v1/submissions?select=id&school_year=is.null`),
      supaCount(`/rest/v1/goal_progress?select=id&school_year=is.null`),
    ]);

    console.log(`[teacher-close-year-preflight] [${requestId}] Counts retrieved successfully`);

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        school_year,
        counts: {
          active_students,
          assignments,
          assignment_instances,
          submissions,
          goal_progress,
          null_school_year: {
            assignments: null_assignments,
            submissions: null_submissions,
            goal_progress: null_goal_progress,
          },
        },
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-close-year-preflight] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: String(err?.message || err) },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
