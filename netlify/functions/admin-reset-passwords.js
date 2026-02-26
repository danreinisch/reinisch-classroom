// Admin action: reset all student passwords to the default {code}! format
// POST /.netlify/functions/admin-reset-passwords
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

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[admin-reset-passwords] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[admin-reset-passwords] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[admin-reset-passwords] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[admin-reset-passwords] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const user = authResult.user.username || 'unknown';
  console.log(`[admin-reset-passwords] [${requestId}] Authorized user: ${user}`);

  try {
    // Use Supabase REST RPC to execute the password reset via pgcrypto
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reset_all_student_passwords`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Password reset failed: ${res.status} ${text}`);
    }

    const result = await res.json().catch(() => null);
    const resetCount = typeof result === 'number' ? result : (result?.reset_count ?? null);

    console.log(`[admin-reset-passwords] [${requestId}] Passwords reset by ${user}. Count: ${resetCount}`);

    return jsonResponse(
      event,
      200,
      { ok: true, reset_count: resetCount },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[admin-reset-passwords] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: String(err?.message || err) },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
