// Teacher sync observations endpoint
// POST /.netlify/functions/teacher-sync-observations
// Auth: Requires teacher session cookie
// Body: { entries: [{ student_code, goal_code, date, percent, method, by_name, via, notes }] }
// Inserts observation entries into progress_entries using the service role key (bypasses RLS).
// Returns: { ok, synced, failed }

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-sync-observations] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-sync-observations] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[teacher-sync-observations] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const sizeCheck = validateBodySize(event.body, 1);
  if (!sizeCheck.valid) {
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.warn(`[teacher-sync-observations] [${requestId}] Unauthorized: ${authResult.error}`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const body = safeJsonParse(event.body);
  if (!body) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { entries } = body;
  if (!Array.isArray(entries) || entries.length === 0) {
    return jsonResponse(event, 400, { ok: false, error: 'entries must be a non-empty array' }, {}, requestId);
  }

  let synced = 0;
  const failed = [];

  for (const entry of entries) {
    const { student_code, goal_id, date, percent, method, by_name, via, notes } = entry || {};

    if (!student_code || !goal_id || !date) {
      failed.push({ entry, reason: 'Missing required fields: student_code, goal_id, date' });
      continue;
    }

    // Validate percent is an integer
    const percentInt = Number.isFinite(percent) ? Math.round(percent) : null;

    try {
      const insertUrl = `${SUPABASE_URL}/rest/v1/progress_entries`;
      const insertResponse = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          student_code,
          goal_id,
          date,
          percent: percentInt,
          method: method || 'Observation',
          by_name: by_name || 'Teacher',
          via: via || 'observation_tray',
          notes: notes || ''
        })
      });

      if (!insertResponse.ok) {
        const errorText = await insertResponse.text();
        console.warn(`[teacher-sync-observations] [${requestId}] Insert failed for ${student_code}/${goal_id}: ${insertResponse.status} - ${errorText}`);
        failed.push({ entry, reason: `Insert failed: ${insertResponse.status}` });
      } else {
        synced++;
        console.log(`[teacher-sync-observations] [${requestId}] Synced observation: ${student_code}/${goal_id}/${date}`);
      }
    } catch (err) {
      console.error(`[teacher-sync-observations] [${requestId}] Exception for ${student_code}/${goal_id}:`, err.message);
      failed.push({ entry, reason: err.message });
    }
  }

  console.log(`[teacher-sync-observations] [${requestId}] Done: ${synced} synced, ${failed.length} failed`);
  return jsonResponse(
    event,
    200,
    { ok: true, synced, failed },
    { 'Cache-Control': 'no-store' },
    requestId
  );
};
