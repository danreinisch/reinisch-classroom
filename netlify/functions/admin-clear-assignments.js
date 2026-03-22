// Admin diagnostic: returns assignment data counts from Supabase
// GET  /.netlify/functions/admin-clear-assignments  → returns counts (no deletion)
// POST /.netlify/functions/admin-clear-assignments  → disabled (returns 403); repurpose for Close School Year workflow when needed
// Auth: Requires teacher/admin session cookie

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

async function deleteFrom(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=not.is.null`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DELETE ${table} failed: ${res.status} ${text}`);
  }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows.length : 0;
}

async function countFrom(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=not.is.null&select=id`, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'count=exact',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`COUNT ${table} failed: ${res.status} ${text}`);
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
  console.log(`[admin-clear-assignments] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[admin-clear-assignments] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[admin-clear-assignments] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[admin-clear-assignments] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const user = authResult.user.username || 'unknown';

  // GET: return counts without deleting
  if (event.httpMethod === 'GET') {
    console.log(`[admin-clear-assignments] [${requestId}] Count request by ${user}`);
    try {
      const [submissions, assignment_instances, assignments] = await Promise.all([
        countFrom('submissions'),
        countFrom('assignment_instances'),
        countFrom('assignments'),
      ]);
      return jsonResponse(
        event,
        200,
        { ok: true, counts: { submissions, assignment_instances, assignments } },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    } catch (err) {
      console.error(`[admin-clear-assignments] [${requestId}] Count error:`, err);
      return jsonResponse(
        event,
        500,
        { ok: false, error: String(err?.message || err) },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }
  }

  // POST: disabled in production — use the Close School Year workflow instead
  console.log(`[admin-clear-assignments] [${requestId}] POST attempt by ${user} — rejected (disabled in production)`);
  return jsonResponse(
    event,
    403,
    { ok: false, error: 'Destructive bulk delete is disabled in production. Use the Close School Year workflow instead.' },
    { 'Cache-Control': 'no-store' },
    requestId
  );
};
