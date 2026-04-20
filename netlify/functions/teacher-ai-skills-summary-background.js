// AI-powered skills summary — Netlify Background Function (async worker)
// POST /.netlify/functions/teacher-ai-skills-summary-background
// Internal use only — called by teacher-ai-skills-summary-submit.js
// Body: { job_id, student_code, iep_goals, dese_standards, audience? }
//
// Netlify background functions run for up to 15 minutes and always return 202
// to the client immediately.  Auth and input validation are performed by the
// synchronous gateway (teacher-ai-skills-summary-submit.js) before this
// function is invoked.  The job row already exists in Supabase as 'pending'.
//
// Flow:
//   1. Parse body to get job_id and prompt inputs
//   2. Check for a recent cached result (same payload_hash, last 24h)
//   3. If cache hit → update job to 'complete' immediately
//   4. Otherwise → call OpenAI (up to 3 retries with backoff) → update job

console.log('[teacher-ai-skills-summary-background] Module loaded');

const {
  generateRequestId,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');
const { getSupabaseConfig } = require('./_lib/supa');
const {
  findBannedPhrase,
  buildSkillsPrompt,
} = require('./_lib/ai-prompts');
const crypto = require('crypto');

// ── Payload hash (for caching) ───────────────────────────────────────────────

function computePayloadHash(student_code, iep_goals, dese_standards, audience) {
  // audience is included in the hash intentionally: internal and external summaries
  // use different prompts and produce different output, so they must not share cache entries.
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
  // audience is part of payload_hash (see computePayloadHash), so cache lookups
  // are automatically scoped to the same audience without extra filtering.
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

async function updateJob(url, key, id, patch) {
  const res = await fetch(
    `${url}/rest/v1/ai_jobs?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(key),
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    }
  );
  return res.ok;
}

// ── OpenAI call with retries ─────────────────────────────────────────────────

/** Per-attempt timeout for OpenAI API calls.
 * Background functions have a 15-minute ceiling, so we allow 90 seconds per attempt
 * and up to 3 attempts (worst case: ~96s total including 2s + 4s backoff delays).
 */
const OPENAI_TIMEOUT_MS = 90000;

const VALID_TIERS = new Set(['excellent', 'on-track', 'needs-support', 'critical']);

function sanitizeSkills(skills, isExternal) {
  if (!Array.isArray(skills)) return null;
  return skills
    .filter(s => s && typeof s.code === 'string' && s.code.trim() !== '')
    .map(s => ({
      code: s.code.trim(),
      description: typeof s.description === 'string' ? s.description.trim() : '',
      summary: typeof s.summary === 'string' ? s.summary.trim() : '',
      ...(typeof s.plain_language === 'string' && s.plain_language.trim() !== ''
        ? { plain_language: s.plain_language.trim().slice(0, 300) }
        : {}),
      tier: VALID_TIERS.has(s.tier) ? s.tier : 'needs-support',
      source: s.source === 'dese' ? 'dese' : 'iep',
      ...(!isExternal && typeof s.goal_recommendation === 'string' && s.goal_recommendation.trim() !== ''
        ? { goal_recommendation: s.goal_recommendation.trim() }
        : {}),
    }));
}

async function callOpenAiWithRetries(prompt, apiKey, requestId, maxAttempts = 3, isExternal = false) {
  let lastError = 'Unknown error';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[teacher-ai-skills-summary-background] [${requestId}] OpenAI attempt ${attempt}/${maxAttempts}`);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: prompt }],
        }),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = `OpenAI API error: ${res.status} ${errText}`;
        console.error(`[teacher-ai-skills-summary-background] [${requestId}] ${lastError}`);
        // Don't retry on 4xx (bad request / auth) — only retry on 5xx / network errors
        if (res.status >= 400 && res.status < 500) break;
      } else {
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
          lastError = 'OpenAI returned empty content';
          console.error(`[teacher-ai-skills-summary-background] [${requestId}] ${lastError}`);
        } else {
          const parsed = JSON.parse(content);
          const sanitized = sanitizeSkills(parsed?.skills, isExternal);
          if (!sanitized) {
            lastError = 'OpenAI response missing skills array';
            console.error(`[teacher-ai-skills-summary-background] [${requestId}] ${lastError}`);
          } else {
            return { ok: true, skills: sanitized };
          }
        }
      }
    } catch (err) {
      lastError = err.message || 'Fetch failed';
      console.error(`[teacher-ai-skills-summary-background] [${requestId}] Attempt ${attempt} failed: ${lastError}`);
    }

    if (attempt < maxAttempts) {
      const backoffMs = Math.min(Math.pow(2, attempt) * 1000, 30000);
      console.log(`[teacher-ai-skills-summary-background] [${requestId}] Retrying in ${backoffMs}ms…`);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
  return { ok: false, error: lastError };
}

// ── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-ai-skills-summary-background] [${requestId}] Request received - method: ${event.httpMethod}`);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[teacher-ai-skills-summary-background] [${requestId}] OPENAI_API_KEY not configured`);
    return { statusCode: 503, body: 'AI not configured' };
  }

  const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfig();
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(`[teacher-ai-skills-summary-background] [${requestId}] Supabase not configured`);
    return { statusCode: 503, body: 'Persistence layer not configured' };
  }

  // Parse body — basic size and format check only; full validation was done by the gateway
  const bodySizeCheck = validateBodySize(event.body, 30);
  if (!bodySizeCheck.valid) {
    return { statusCode: 400, body: 'Request body too large' };
  }

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { job_id, student_code, iep_goals, dese_standards, language_mode, audience } = parseResult.data;

  if (!job_id || !student_code) {
    return { statusCode: 400, body: 'job_id and student_code are required' };
  }

  // Support both legacy language_mode and new audience parameter
  const resolvedAudience = audience === 'external' || language_mode === 'parent-friendly' ? 'external' : 'internal';
  const isExternal = resolvedAudience === 'external';

  const payloadHash = computePayloadHash(student_code, iep_goals || [], dese_standards || [], resolvedAudience);

  // Background work — client already received 200 from the gateway

  // Check cache first
  try {
    const cached = await findCachedJob(SUPABASE_URL, SUPABASE_KEY, payloadHash);
    if (cached) {
      console.log(`[teacher-ai-skills-summary-background] [${requestId}] Cache hit for ${student_code} — using cached result`);
      await updateJob(SUPABASE_URL, SUPABASE_KEY, job_id, {
        status: 'complete',
        result: cached,
      });
      return { statusCode: 202, body: '' };
    }
  } catch (cacheErr) {
    console.warn(`[teacher-ai-skills-summary-background] [${requestId}] Cache check failed: ${cacheErr.message} — proceeding to OpenAI`);
  }

  // Call OpenAI
  const systemPrompt = buildSkillsPrompt({
    student_code,
    iep_goals: iep_goals || [],
    dese_standards: dese_standards || [],
    audience: resolvedAudience,
  });

  const aiResult = await callOpenAiWithRetries(systemPrompt, OPENAI_API_KEY, requestId, 3, isExternal);

  if (aiResult.ok) {
    // Banned-phrase check
    let skills = aiResult.skills;

    const checkForBanned = (skillsArr) => {
      for (const s of skillsArr) {
        const textToCheck = [s.summary, s.description, s.plain_language, s.goal_recommendation]
          .filter(Boolean)
          .join(' ');
        const found = findBannedPhrase(textToCheck);
        if (found) return found;
      }
      return null;
    };

    const foundBanned = checkForBanned(skills);
    if (foundBanned) {
      console.warn(`[teacher-ai-skills-summary-background] [${requestId}] Banned phrase found: "${foundBanned}" — retrying once`);
      const retryPrompt = buildSkillsPrompt({
        student_code,
        iep_goals: iep_goals || [],
        dese_standards: dese_standards || [],
        audience: resolvedAudience,
        retry_hint: foundBanned,
      });
      const retryResult = await callOpenAiWithRetries(retryPrompt, OPENAI_API_KEY, requestId, 1, isExternal);
      if (retryResult.ok && !checkForBanned(retryResult.skills)) {
        skills = retryResult.skills;
      } else {
        console.warn(`[teacher-ai-skills-summary-background] [${requestId}] Banned phrase still present after retry — flagging ai_edited per skill`);
      }
    }

    // Flag only the individual skills whose text still contains a banned phrase.
    // Skip the per-skill check entirely when no banned phrase was found (common path).
    const finalSkills = foundBanned === null
      ? skills
      : skills.map(s => {
          const hasBanned = findBannedPhrase(
            [s.summary, s.description, s.plain_language, s.goal_recommendation].filter(Boolean).join(' ')
          ) !== null;
          return hasBanned ? { ...s, ai_edited: true } : s;
        });

    console.log(`[teacher-ai-skills-summary-background] [${requestId}] Job ${job_id} complete — ${finalSkills.length} skills`);
    await updateJob(SUPABASE_URL, SUPABASE_KEY, job_id, {
      status: 'complete',
      result: { skills: finalSkills },
    });
  } else {
    console.error(`[teacher-ai-skills-summary-background] [${requestId}] Job ${job_id} failed: ${aiResult.error}`);
    await updateJob(SUPABASE_URL, SUPABASE_KEY, job_id, {
      status: 'error',
      error: aiResult.error,
    });
  }

  return { statusCode: 202, body: '' };
};
