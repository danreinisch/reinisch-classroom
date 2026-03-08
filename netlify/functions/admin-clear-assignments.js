// Admin action: clear all assignment data from Supabase
// GET  /.netlify/functions/admin-clear-assignments  → returns counts (no deletion)
// POST /.netlify/functions/admin-clear-assignments  → deletes everything
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

  // POST: delete everything
  console.log(`[admin-clear-assignments] [${requestId}] Authorized user: ${user}`);

  try {
    // Delete in child-first order to respect foreign key constraints
    const submissionsDeleted = await deleteFrom('submissions');
    console.log(`[admin-clear-assignments] [${requestId}] Deleted ${submissionsDeleted} submissions`);

    const instancesDeleted = await deleteFrom('assignment_instances');
    console.log(`[admin-clear-assignments] [${requestId}] Deleted ${instancesDeleted} assignment_instances`);

    const assignmentsDeleted = await deleteFrom('assignments');
    console.log(`[admin-clear-assignments] [${requestId}] Deleted ${assignmentsDeleted} assignments`);

    console.log(`[admin-clear-assignments] [${requestId}] Clear complete by ${user}`);

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        deleted: {
          submissions: submissionsDeleted,
          assignment_instances: instancesDeleted,
          assignments: assignmentsDeleted,
        },
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[admin-clear-assignments] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: String(err?.message || err) },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
