// AI skills summary — synchronous submit gateway
// POST /.netlify/functions/teacher-ai-skills-summary-submit
// Auth: Requires teacher session cookie
// Body: { job_id, student_code, iep_goals?, dese_standards?, language_mode?, audience? }
// Returns: { ok: true, job_id, cached?: true } or error (400 / 401 / 500)
//
// This function is the client-facing entry point for the background AI flow.
// It validates the request synchronously so errors are returned immediately, then
// fires the background function asynchronously and returns { ok: true, job_id }
// so the client can start polling the status endpoint.

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

// ── Payload hash (for caching) ───────────────────────────────────────────────

// Cache key includes `audience` so professional vs parent-friendly results are cached separately.
// Switching audience for the same student triggers a new OpenAI call — this is intentional
// since summaries differ in tone, terminology, and structure.
function computePayloadHash(student_code, iep_goals, dese_standards, audience) {
  const canonical = JSON.stringify({ student_code, iep_goals, dese_standards, audience: audience || 'internal' });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function findCachedJob(url, key, payload_hash) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${url}/rest/v1/ai_jobs?payload_hash=eq.${encodeURIComponent(payload_hash)}&status=eq.complete&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1&select=result`,
    {
      method: 'GET',
      headers: supabaseHeaders(key),
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0].result : null;
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

async function findPendingJobByHash(url, key, payload_hash) {
  const res = await fetch(
    `${url}/rest/v1/ai_jobs?payload_hash=eq.${encodeURIComponent(payload_hash)}&status=eq.pending&order=created_at.desc&limit=1&select=id`,
    {
      method: 'GET',
      headers: supabaseHeaders(key),
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
}

async function countPendingJobsByTeacher(url, key, created_by) {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const res = await fetch(
    `${url}/rest/v1/ai_jobs?created_by=eq.${encodeURIComponent(created_by)}&status=eq.pending&created_at=gte.${encodeURIComponent(since)}&select=id`,
    {
      method: 'GET',
      headers: { ...supabaseHeaders(key), Prefer: 'count=exact' },
    }
  );
  if (!res.ok) return 0;
  const countHeader = res.headers.get('content-range');
  if (countHeader) {
    const match = countHeader.match(/\/(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  // Fallback: count rows in body
  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

async function upsertJobComplete(url, key, { id, student_code, payload_hash, created_by, result }) {
  const res = await fetch(`${url}/rest/v1/ai_jobs`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(key),
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id,
      student_code,
      payload_hash,
      status: 'complete',
      created_by,
      result,
      updated_at: new Date().toISOString(),
    }),
  });
  return res.ok;
}

// ── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-ai-skills-summary-submit] [${requestId}] Request received - method: ${event.httpMethod}`);

  // Handle CORS preflight
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
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { job_id, student_code, iep_goals, dese_standards, language_mode, audience } = parseResult.data;

  // Validate job_id
  if (!job_id || typeof job_id !== 'string' || !UUID_V4_RE.test(job_id)) {
    return jsonResponse(event, 400, { ok: false, error: 'job_id must be a valid UUID v4' }, {}, requestId);
  }

  // Validate student_code
  if (!student_code || typeof student_code !== 'string' || student_code.trim() === '') {
    return jsonResponse(event, 400, { ok: false, error: 'student_code is required' }, {}, requestId);
  }

  // Validate at least one data source
  const hasGoals = Array.isArray(iep_goals) && iep_goals.length > 0;
  const hasStandards = Array.isArray(dese_standards) && dese_standards.length > 0;
  if (!hasGoals && !hasStandards) {
    return jsonResponse(event, 400, { ok: false, error: 'At least one of iep_goals or dese_standards must be provided' }, {}, requestId);
  }

  const resolvedAudience = audience === 'external' || language_mode === 'parent-friendly' ? 'external' : 'internal';
  const createdBy = auth.user.username;
  const payloadHash = computePayloadHash(student_code, iep_goals || [], dese_standards || [], resolvedAudience);

  // Check cache first
  try {
    const cached = await findCachedJob(SUPABASE_URL, SUPABASE_KEY, payloadHash);
    if (cached && Array.isArray(cached.skills) && cached.skills.length > 0) {
      console.log(`[teacher-ai-skills-summary-submit] [${requestId}] Cache hit for ${student_code} — returning cached result`);
      await upsertJobComplete(SUPABASE_URL, SUPABASE_KEY, {
        id: job_id,
        student_code,
        payload_hash: payloadHash,
        created_by: createdBy,
        result: cached,
      });
      return jsonResponse(event, 200, { ok: true, job_id, cached: true }, {}, requestId);
    }
  } catch (cacheErr) {
    console.warn(`[teacher-ai-skills-summary-submit] [${requestId}] Cache check failed: ${cacheErr.message} — proceeding`);
  }

  // Deduplication: return existing pending job if one already exists for this payload
  try {
    const existingJobId = await findPendingJobByHash(SUPABASE_URL, SUPABASE_KEY, payloadHash);
    if (existingJobId) {
      console.log(`[teacher-ai-skills-summary-submit] [${requestId}] Duplicate pending job found for ${student_code} — returning existing job ${existingJobId}`);
      return jsonResponse(event, 200, { ok: true, job_id: existingJobId }, {}, requestId);
    }
  } catch (dedupErr) {
    console.warn(`[teacher-ai-skills-summary-submit] [${requestId}] Dedup check failed: ${dedupErr.message} — proceeding`);
  }

  // Rate limiting: reject if teacher already has >= 3 pending jobs
  try {
    const pendingCount = await countPendingJobsByTeacher(SUPABASE_URL, SUPABASE_KEY, createdBy);
    if (pendingCount >= 3) {
      console.warn(`[teacher-ai-skills-summary-submit] [${requestId}] Rate limit: ${createdBy} has ${pendingCount} pending jobs`);
      return jsonResponse(event, 429, { ok: false, error: 'Too many pending AI jobs — please wait for current jobs to finish' }, {}, requestId);
    }
  } catch (rateErr) {
    console.warn(`[teacher-ai-skills-summary-submit] [${requestId}] Rate limit check failed: ${rateErr.message} — proceeding`);
  }

  // Insert pending job row
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

  console.log(`[teacher-ai-skills-summary-submit] [${requestId}] Job ${job_id} created for student ${student_code}`);

  // Fire background function asynchronously — do not await
  const backgroundUrl = process.env.URL
    ? `${process.env.URL}/.netlify/functions/teacher-ai-skills-summary-background`
    : `http://localhost:8888/.netlify/functions/teacher-ai-skills-summary-background`;

  const internalSecret = process.env.INTERNAL_FUNCTION_SECRET || process.env.SESSION_SECRET;

  fetch(backgroundUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(internalSecret ? { 'X-Internal-Secret': internalSecret } : {}),
    },
    body: JSON.stringify({
      job_id,
      student_code,
      iep_goals: iep_goals || [],
      dese_standards: dese_standards || [],
      language_mode,
      audience: resolvedAudience,
    }),
  }).catch(err => {
    console.warn(`[teacher-ai-skills-summary-submit] [${requestId}] Background fire-and-forget failed: ${err.message}`);
  });

  // Probabilistic cleanup: on ~1% of requests, fire-and-forget a DELETE of jobs older than 7 days
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    fetch(`${SUPABASE_URL}/rest/v1/ai_jobs?created_at=lt.${encodeURIComponent(cutoff)}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'return=minimal' },
    }).catch(() => {});
  }

  return jsonResponse(event, 200, { ok: true, job_id }, {}, requestId);
};
