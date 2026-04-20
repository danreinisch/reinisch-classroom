// AI-powered skills summary — Netlify Background Function
// POST /.netlify/functions/teacher-ai-skills-summary-background
// Internal only — called by teacher-ai-skills-summary-submit (the sync gateway).
// Auth and validation are handled by the submit function; do not call this directly.
// Body: { job_id, student_code, iep_goals, dese_standards, language_mode?, audience? }
//
// Netlify background functions run for up to 15 minutes and always return 202
// to the client immediately.
//
// Flow:
//   1. Parse body (job_id + payload)
//   2. Call OpenAI (up to 3 retries with backoff)
//   3. Update ai_jobs row with complete/error status

console.log('[teacher-ai-skills-summary-background] Module loaded');

const {
  generateRequestId,
  safeJsonParse,
} = require('./_lib/http');
const { getSupabaseConfig } = require('./_lib/supa');
const {
  findBannedPhrase,
  buildSkillsPrompt,
} = require('./_lib/ai-prompts');

// ── Supabase helpers ─────────────────────────────────────────────────────────

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
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

  // Auth and input validation are handled by teacher-ai-skills-summary-submit.
  // Parse the body and proceed directly to OpenAI processing.
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { job_id, student_code, iep_goals, dese_standards, language_mode, audience } = parseResult.data;

  if (!job_id) {
    return { statusCode: 400, body: 'job_id is required' };
  }

  // Support both legacy language_mode and new audience parameter
  // audience takes precedence; language_mode kept for backward compatibility
  const resolvedAudience = audience === 'external' || language_mode === 'parent-friendly' ? 'external' : 'internal';
  const isExternal = resolvedAudience === 'external';

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

  console.log(`[teacher-ai-skills-summary-background] [${requestId}] Processing job ${job_id} for student ${student_code}`);

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
