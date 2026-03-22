// Teacher recall library list endpoint
// GET /.netlify/functions/teacher-recall-library-list
// Auth: Requires teacher session cookie
// Returns: List of recall_library entries filtered to current school year

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

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-recall-library-list] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-recall-library-list] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[teacher-recall-library-list] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-recall-library-list] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-recall-library-list] [${requestId}] Authorized user: ${authResult.user.username}`);

  try {
    const currentYear = getCurrentSchoolYear();
    // Filter by current school year (allow null rows as fallback, matching PR 5 pattern)
    const recallUrl = `${SUPABASE_URL}/rest/v1/recall_library?select=id,assignment_id,title,type,series,meta,recalled_at,recalled_by,school_year,reason,category,created_at&or=(school_year.eq.${currentYear},school_year.is.null)&order=recalled_at.desc`;

    console.log(`[teacher-recall-library-list] [${requestId}] Fetching recall library entries for school_year=${currentYear}`);

    const recallResponse = await fetch(recallUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!recallResponse.ok) {
      const errorText = await recallResponse.text();
      console.error(`[teacher-recall-library-list] [${requestId}] Supabase query failed: ${recallResponse.status} - ${errorText}`);
      throw new Error(`Recall library query failed: ${recallResponse.status}`);
    }

    const entries = await recallResponse.json();

    console.log(`[teacher-recall-library-list] [${requestId}] Successfully fetched ${entries.length} recall library entries`);

    return jsonResponse(
      event,
      200,
      { ok: true, entries },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-recall-library-list] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to fetch recall library' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
