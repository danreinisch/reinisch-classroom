// AI-powered skills summary endpoint
// POST /.netlify/functions/teacher-ai-skills-summary
// Auth: Requires teacher session cookie
// Body: { student_code, iep_goals, dese_standards, audience? }
// Returns: { ok: true, skills: [{ code, description, summary, plain_language?, tier, source, goal_recommendation?, ai_edited? }] }
//
// @deprecated — For new integrations use the background-function flow:
//   POST /.netlify/functions/teacher-ai-skills-summary-submit  →  returns { ok: true, job_id }
//   GET  /.netlify/functions/teacher-ai-skills-summary-status?job_id=<id>
// This synchronous endpoint is kept as a fallback with an 8-second timeout.

console.log('[teacher-ai-skills-summary] Module loaded successfully');

const { requireTeacher } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');
const {
  findBannedPhrase,
  buildSkillsPrompt,
} = require('./_lib/ai-prompts');

const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-ai-skills-summary] [${requestId}] Request received - method: ${event.httpMethod}`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log(`[teacher-ai-skills-summary] [${requestId}] Handling CORS preflight`);
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[teacher-ai-skills-summary] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Verify teacher session
  const auth = requireTeacher(event, SESSION_SECRET);
  if (!auth.ok) {
    console.log(`[teacher-ai-skills-summary] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-ai-skills-summary] [${requestId}] Authorized user: ${auth.user.username}`);

  // Check if OpenAI is configured
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[teacher-ai-skills-summary] [${requestId}] OPENAI_API_KEY is not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'AI skills summary not configured' }, {}, requestId);
  }

  // Validate body size (30KB max — skills payloads can include per-question weakness data)
  const bodySizeCheck = validateBodySize(event.body, 30);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-ai-skills-summary] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Parse JSON body
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-ai-skills-summary] [${requestId}] Invalid JSON body`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { student_code, iep_goals, dese_standards, audience } = parseResult.data;
  const resolvedAudience = audience === 'external' ? 'external' : 'internal';

  // Validate required fields
  if (!student_code || typeof student_code !== 'string' || student_code.trim() === '') {
    console.log(`[teacher-ai-skills-summary] [${requestId}] Missing or empty student_code`);
    return jsonResponse(event, 400, { ok: false, error: 'student_code is required' }, {}, requestId);
  }

  const hasGoals = Array.isArray(iep_goals) && iep_goals.length > 0;
  const hasStandards = Array.isArray(dese_standards) && dese_standards.length > 0;

  if (!hasGoals && !hasStandards) {
    console.log(`[teacher-ai-skills-summary] [${requestId}] No skills data provided`);
    return jsonResponse(event, 400, { ok: false, error: 'At least one of iep_goals or dese_standards must be provided' }, {}, requestId);
  }

  /**
   * Call OpenAI with a given prompt. Returns { skills } or throws.
   */
  async function callOpenAI(systemPrompt) {
    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!openAiRes.ok) {
      const errText = await openAiRes.text().catch(() => '');
      throw new Error(`OpenAI API error: ${openAiRes.status} ${errText}`);
    }

    const openAiData = await openAiRes.json();
    const content = openAiData?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty content');

    return JSON.parse(content);
  }

  // First attempt
  const systemPrompt = buildSkillsPrompt({
    student_code,
    iep_goals: iep_goals || [],
    dese_standards: dese_standards || [],
    audience: resolvedAudience,
  });

  console.log(`[teacher-ai-skills-summary] [${requestId}] Calling OpenAI API for student ${student_code} (audience: ${resolvedAudience})`);

  let openAiResult;
  try {
    openAiResult = await callOpenAI(systemPrompt);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`[teacher-ai-skills-summary] [${requestId}] OpenAI request timed out`);
      return jsonResponse(event, 504, { ok: false, error: 'AI skills summary timed out' }, {}, requestId);
    }
    console.error(`[teacher-ai-skills-summary] [${requestId}] OpenAI request failed: ${err.message}`);
    return jsonResponse(event, 502, { ok: false, error: 'AI skills summary failed' }, {}, requestId);
  }

  // Validate response shape
  let skills = openAiResult?.skills;
  if (!Array.isArray(skills)) {
    console.error(`[teacher-ai-skills-summary] [${requestId}] OpenAI response missing skills array`);
    return jsonResponse(event, 502, { ok: false, error: 'AI skills summary returned unexpected format' }, {}, requestId);
  }

  // ── Banned-phrase check + one retry ─────────────────────────────────────────

  function checkSkillsForBannedPhrases(skillsArr) {
    for (const s of skillsArr) {
      const textToCheck = [s.summary, s.description, s.plain_language, s.goal_recommendation]
        .filter(Boolean)
        .join(' ');
      const found = findBannedPhrase(textToCheck);
      if (found) return found;
    }
    return null;
  }

  let foundBanned = checkSkillsForBannedPhrases(skills);

  if (foundBanned) {
    console.warn(`[teacher-ai-skills-summary] [${requestId}] Banned phrase found: "${foundBanned}" — retrying`);

    const retryPrompt = buildSkillsPrompt({
      student_code,
      iep_goals: iep_goals || [],
      dese_standards: dese_standards || [],
      audience: resolvedAudience,
      retry_hint: foundBanned,
    });

    let retryResult;
    try {
      retryResult = await callOpenAI(retryPrompt);
    } catch (err) {
      // If retry fails, fall through to strip-and-badge path
      console.warn(`[teacher-ai-skills-summary] [${requestId}] Retry call failed: ${err.message}`);
      retryResult = null;
    }

    if (retryResult && Array.isArray(retryResult.skills)) {
      const stillBanned = checkSkillsForBannedPhrases(retryResult.skills);
      if (!stillBanned) {
        skills = retryResult.skills;
      } else {
        // Still has banned phrase — log, keep retry results for per-skill flagging below
        console.warn(`[teacher-ai-skills-summary] [${requestId}] Banned phrase still present after retry: "${stillBanned}" — stripping and flagging`);
        skills = retryResult.skills;
      }
    }
    // If retryResult is null, skills remains the original (with banned phrases) for per-skill flagging below
  }

  const VALID_TIERS = new Set(['excellent', 'on-track', 'needs-support', 'critical']);

  // Sanitize and validate each skill entry; flag only skills whose text still contains a banned phrase.
  // Skip the per-skill banned-phrase check entirely when no banned phrase was ever found (common path).
  const sanitizedSkills = skills
    .filter(s => s && typeof s.code === 'string' && s.code.trim() !== '')
    .map(s => {
      const hasBanned = foundBanned !== null && findBannedPhrase(
        [s.summary, s.description, s.plain_language, s.goal_recommendation].filter(Boolean).join(' ')
      ) !== null;
      return {
        code: s.code.trim(),
        description: typeof s.description === 'string' ? s.description.trim() : '',
        summary: typeof s.summary === 'string' ? s.summary.trim() : '',
        ...(typeof s.plain_language === 'string' && s.plain_language.trim() !== ''
          ? { plain_language: s.plain_language.trim().slice(0, 300) }
          : {}),
        tier: VALID_TIERS.has(s.tier) ? s.tier : 'needs-support',
        source: s.source === 'dese' ? 'dese' : 'iep',
        ...(resolvedAudience === 'internal' && typeof s.goal_recommendation === 'string' && s.goal_recommendation.trim() !== ''
          ? { goal_recommendation: s.goal_recommendation.trim() }
          : {}),
        ...(hasBanned ? { ai_edited: true } : {}),
      };
    });

  console.log(`[teacher-ai-skills-summary] [${requestId}] Summary ready: ${sanitizedSkills.length} skills for ${student_code}`);

  return jsonResponse(
    event,
    200,
    { ok: true, skills: sanitizedSkills },
    {},
    requestId
  );
};

