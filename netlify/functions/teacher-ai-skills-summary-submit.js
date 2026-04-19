// AI skills summary — synchronous submit gateway
// POST /.netlify/functions/teacher-ai-skills-summary-submit
// Auth: Requires teacher session cookie
// Body: { job_id, student_code, iep_goals, dese_standards, audience?, language_mode? }
// Returns: { ok: true, job_id } or { ok: false, error: '...' } (4xx/5xx)
//
// Flow:
//   1. Verify teacher auth
//   2. Validate input (job_id, student_code, iep_goals/dese_standards)
//   3. Insert a 'pending' job row into Supabase ai_jobs
//   4. Fire-and-forget: trigger the background function to do the OpenAI work
//   5. Return { ok: true, job_id } immediately — client can now poll the status endpoint
//
// This gateway pattern ensures validation errors (401, 400, etc.) reach the client
// synchronously instead of being silently swallowed by Netlify's background function model.

console.log('[teacher-ai-skills-summary-submit] Module loaded');

const { requireTeacher } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');
const { getSupabaseConfig } = require('./_lib/supa');
const crypto = require('crypto');

const { SESSION_SECRET } = process.env;

/** UUID v4 regex for validating client-supplied job_id values */
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Supabase helpers ─────────────────────────────────────────────────────────

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function computePayloadHash(student_code, iep_goals, dese_standards, audience) {
  const canonical = JSON.stringify({ student_code, iep_goals, dese_standards, audience: audience || 'internal' });
  return crypto.createHash('sha256').update(canonical).digest('hex');
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

// ── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-ai-skills-summary-submit] [${requestId}] Request received - method: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Verify teacher session
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

  // Validate body size
  const bodySizeCheck = validateBodySize(event.body, 30);
  if (!bodySizeCheck.valid) {
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Parse body
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON' }, {}, requestId);
  }

  const { job_id, student_code, iep_goals, dese_standards, language_mode, audience } = parseResult.data;

  // Support both legacy language_mode and new audience parameter
  const resolvedAudience = audience === 'external' || language_mode === 'parent-friendly' ? 'external' : 'internal';

  // Validate job_id (must be a UUID v4 from the client)
  if (!job_id || typeof job_id !== 'string' || !UUID_V4_RE.test(job_id)) {
    return jsonResponse(event, 400, { ok: false, error: 'job_id must be a valid UUID v4' }, {}, requestId);
  }

  if (!student_code || typeof student_code !== 'string' || student_code.trim() === '') {
    return jsonResponse(event, 400, { ok: false, error: 'student_code is required' }, {}, requestId);
  }

  const hasGoals = Array.isArray(iep_goals) && iep_goals.length > 0;
  const hasStandards = Array.isArray(dese_standards) && dese_standards.length > 0;
  if (!hasGoals && !hasStandards) {
    return jsonResponse(event, 400, { ok: false, error: 'At least one of iep_goals or dese_standards must be provided' }, {}, requestId);
  }

  const createdBy = auth.user.username;
  const payloadHash = computePayloadHash(student_code, iep_goals || [], dese_standards || [], resolvedAudience);

  // Insert the pending job record — this is the synchronous part that reaches the client
  const inserted = await insertJob(SUPABASE_URL, SUPABASE_KEY, {
    id: job_id,
    student_code,
    payload_hash: payloadHash,
    created_by: createdBy,
  });

  if (!inserted) {
    console.error(`[teacher-ai-skills-summary-submit] [${requestId}] Failed to insert job ${job_id}`);
    return jsonResponse(event, 500, { ok: false, error: 'Failed to create job' }, {}, requestId);
  }

  console.log(`[teacher-ai-skills-summary-submit] [${requestId}] Job ${job_id} created for student ${student_code} by ${createdBy}`);

  // Fire-and-forget: trigger the background function to do the OpenAI work.
  // We do not await the result — the background function always returns 202 immediately,
  // and the actual work happens asynchronously.
  const netlifyUrl = process.env.URL || 'http://localhost:8888';
  fetch(`${netlifyUrl}/.netlify/functions/teacher-ai-skills-summary-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_id,
      student_code,
      iep_goals: iep_goals || [],
      dese_standards: dese_standards || [],
      audience: resolvedAudience,
    }),
  }).catch(err => {
    console.error(`[teacher-ai-skills-summary-submit] [${requestId}] Failed to trigger background function: ${err.message}`);
  });

  // Return immediately — client will poll the status endpoint
  return jsonResponse(event, 200, { ok: true, job_id }, {}, requestId);
};
