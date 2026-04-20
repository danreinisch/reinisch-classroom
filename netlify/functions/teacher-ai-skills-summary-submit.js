// AI skills summary — synchronous gateway function
// POST /.netlify/functions/teacher-ai-skills-summary-submit
// Auth: Requires teacher session cookie
// Body: { student_code, iep_goals, dese_standards, audience?, language_mode? }
// Returns synchronously: { ok: true, job_id } or { ok: false, error } with 4xx/5xx
//
// Flow:
//   1. Validate auth and input
//   2. Insert a pending job row into Supabase ai_jobs
//   3. Fire-and-forget the background worker function
//   4. Return { ok: true, job_id } to the client immediately
//
// The client polls /.netlify/functions/teacher-ai-skills-summary-status?job_id=<id>
// for results.  Validation errors now reach the client synchronously instead of
// being silently swallowed by Netlify's 202 background-function response.

console.log('[teacher-ai-skills-summary-submit] Module loaded');

const crypto = require('crypto');
const { requireTeacher } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');
const { getSupabaseConfig } = require('./_lib/supa');

const { SESSION_SECRET } = process.env;

/** UUID v4 */
function generateJobId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ (crypto.randomBytes(1)[0] & (15 >> (c / 4)))).toString(16)
      );
}

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function insertJob(url, key, { id, student_code, payload_hash, created_by }) {
  const res = await fetch(`${url}/rest/v1/ai_jobs`, {
    method: 'POST',
    headers: supabaseHeaders(key),
    body: JSON.stringify({
      id,
      student_code,
      payload_hash,
      status: 'pending',
      created_by,
    }),
  });
  return res.ok;
}

function computePayloadHash(student_code, iep_goals, dese_standards, audience) {
  // audience is included in the hash intentionally: internal and external summaries
  // use different prompts and produce different output, so they must not share cache entries.
  const canonical = JSON.stringify({ student_code, iep_goals, dese_standards, audience: audience || 'internal' });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-ai-skills-summary-submit] [${requestId}] Request received - method: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = requireTeacher(event, SESSION_SECRET);
  if (!auth.ok) {
    console.log(`[teacher-ai-skills-summary-submit] [${requestId}] Unauthorized`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[teacher-ai-skills-summary-submit] [${requestId}] OPENAI_API_KEY not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'AI not configured' }, {}, requestId);
  }

  const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfig();
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(`[teacher-ai-skills-summary-submit] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Persistence layer not configured' }, {}, requestId);
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const bodySizeCheck = validateBodySize(event.body, 30);
  if (!bodySizeCheck.valid) {
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { student_code, iep_goals, dese_standards, language_mode, audience } = parseResult.data;

  // Support both legacy language_mode and new audience parameter
  const resolvedAudience = audience === 'external' || language_mode === 'parent-friendly' ? 'external' : 'internal';

  if (!student_code || typeof student_code !== 'string' || student_code.trim() === '') {
    return jsonResponse(event, 400, { ok: false, error: 'student_code is required' }, {}, requestId);
  }

  const hasGoals = Array.isArray(iep_goals) && iep_goals.length > 0;
  const hasStandards = Array.isArray(dese_standards) && dese_standards.length > 0;
  if (!hasGoals && !hasStandards) {
    return jsonResponse(event, 400, { ok: false, error: 'At least one of iep_goals or dese_standards must be provided' }, {}, requestId);
  }

  // ── Insert pending job ────────────────────────────────────────────────────
  const job_id = generateJobId();
  const createdBy = auth.user.username;
  const payloadHash = computePayloadHash(student_code, iep_goals || [], dese_standards || [], resolvedAudience);

  const inserted = await insertJob(SUPABASE_URL, SUPABASE_KEY, {
    id: job_id,
    student_code,
    payload_hash: payloadHash,
    created_by: createdBy,
  });

  if (!inserted) {
    console.error(`[teacher-ai-skills-summary-submit] [${requestId}] Failed to insert job for student ${student_code}`);
    return jsonResponse(event, 500, { ok: false, error: 'Failed to create job' }, {}, requestId);
  }

  console.log(`[teacher-ai-skills-summary-submit] [${requestId}] Job ${job_id} created for student ${student_code}`);

  // ── Fire-and-forget the background worker ────────────────────────────────
  const siteUrl = process.env.URL || 'http://localhost:8888';
  const backgroundUrl = `${siteUrl}/.netlify/functions/teacher-ai-skills-summary-background`;

  // Pass through the auth cookie so the background function can inherit it if needed
  const forwardedCookies = event.headers && (event.headers.cookie || event.headers.Cookie);
  const bgHeaders = {
    'Content-Type': 'application/json',
    ...(forwardedCookies ? { Cookie: forwardedCookies } : {}),
  };

  fetch(backgroundUrl, {
    method: 'POST',
    headers: bgHeaders,
    body: JSON.stringify({
      job_id,
      student_code,
      iep_goals: iep_goals || [],
      dese_standards: dese_standards || [],
      audience: resolvedAudience,
    }),
  }).catch(err => {
    console.warn(`[teacher-ai-skills-summary-submit] [${requestId}] Background trigger failed: ${err.message}`);
  });

  // ── Return job_id to client ───────────────────────────────────────────────
  return jsonResponse(event, 200, { ok: true, job_id }, {}, requestId);
};
