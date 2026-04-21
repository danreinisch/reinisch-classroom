// AI skills summary job status endpoint
// GET /.netlify/functions/teacher-ai-skills-summary-status?job_id=<uuid>
// Auth: Requires teacher session cookie
// Returns: { ok: true, status: 'pending' | 'complete' | 'error', skills?: [...], error?: '...' }

console.log('[teacher-ai-skills-summary-status] Module loaded');

const { requireTeacher } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');
const { getSupabaseConfig } = require('./_lib/supa');

const { SESSION_SECRET } = process.env;

// ── UUID validation ──────────────────────────────────────────────────────────

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-ai-skills-summary-status] [${requestId}] Request received - method: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Verify teacher session
  const auth = requireTeacher(event, SESSION_SECRET);
  if (!auth.ok) {
    console.log(`[teacher-ai-skills-summary-status] [${requestId}] Unauthorized`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfig();
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(`[teacher-ai-skills-summary-status] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Persistence layer not configured' }, {}, requestId);
  }

  // Extract and validate job_id
  const job_id = event.queryStringParameters?.job_id;
  if (!job_id || !UUID_V4_RE.test(job_id)) {
    return jsonResponse(event, 400, { ok: false, error: 'job_id must be a valid UUID v4' }, {}, requestId);
  }

  // Probabilistic cleanup: on ~1% of requests, fire-and-forget a DELETE of jobs older than 7 days
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    fetch(`${SUPABASE_URL}/rest/v1/ai_jobs?created_at=lt.${encodeURIComponent(cutoff)}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'return=minimal' },
    }).catch(() => {});
  }

  // Query Supabase — scoped to created_by so teachers can only see their own jobs
  let row;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_jobs?id=eq.${encodeURIComponent(job_id)}&created_by=eq.${encodeURIComponent(auth.user.username)}&select=status,result,error,created_at&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[teacher-ai-skills-summary-status] [${requestId}] Supabase error: ${res.status} ${errText}`);
      return jsonResponse(event, 502, { ok: false, error: 'Failed to query job status' }, {}, requestId);
    }

    const rows = await res.json();
    row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error(`[teacher-ai-skills-summary-status] [${requestId}] Supabase fetch failed: ${err.message}`);
    return jsonResponse(event, 502, { ok: false, error: 'Failed to query job status' }, {}, requestId);
  }

  // Job not found yet — background function may not have inserted the row yet
  if (!row) {
    console.log(`[teacher-ai-skills-summary-status] [${requestId}] Job ${job_id} not found — returning pending`);
    return jsonResponse(event, 200, { ok: true, status: 'pending' }, {}, requestId);
  }

  if (row.status === 'complete') {
    const skills = row.result?.skills;
    console.log(`[teacher-ai-skills-summary-status] [${requestId}] Job ${job_id} complete — ${Array.isArray(skills) ? skills.length : 0} skills`);
    return jsonResponse(event, 200, { ok: true, status: 'complete', skills: skills || [] }, {}, requestId);
  }

  if (row.status === 'error') {
    console.log(`[teacher-ai-skills-summary-status] [${requestId}] Job ${job_id} error: ${row.error}`);
    return jsonResponse(event, 200, { ok: true, status: 'error', error: row.error || 'AI generation failed' }, {}, requestId);
  }

  // status === 'pending' — check for stuck job (> 5 minutes old)
  if (row.created_at) {
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    const STUCK_JOB_MS = 5 * 60 * 1000; // 5 minutes
    if (ageMs > STUCK_JOB_MS) {
      console.warn(`[teacher-ai-skills-summary-status] [${requestId}] Job ${job_id} has been pending for ${Math.round(ageMs / 1000)}s — marking as error`);
      // Fire-and-forget PATCH to mark job as error
      fetch(
        `${SUPABASE_URL}/rest/v1/ai_jobs?id=eq.${encodeURIComponent(job_id)}`,
        {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'error', error: 'Job timed out — background worker never completed' }),
        }
      ).catch(patchErr => console.warn(`[teacher-ai-skills-summary-status] [${requestId}] Stuck-job PATCH failed: ${patchErr.message}`));
      return jsonResponse(event, 200, { ok: true, status: 'error', error: 'Job timed out — background worker never completed' }, {}, requestId);
    }
  }

  return jsonResponse(event, 200, { ok: true, status: 'pending' }, {}, requestId);
};
