// AI-powered skills summary endpoint
// POST /.netlify/functions/teacher-ai-skills-summary
// Auth: Requires teacher session cookie
// Body: { student_code, iep_goals, dese_standards, audience? }
// Returns: { ok: true, skills: [{ code, description, summary, plain_language?, tier, source, goal_recommendation?, ai_edited? }] }

console.log('[teacher-ai-skills-summary] Module loaded successfully');

const { requireTeacher } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { SESSION_SECRET } = process.env;

// ── Banned phrases (must match web/ai-prompts/banned-phrases.json) ────────────
const BANNED_PHRASES = [
  'targeted intervention',
  'targeted interventions',
  'continued monitoring',
  'continued support',
  'additional support',
  'ensure progress',
  'achieve and maintain',
  'appears to',
  'suggests that',
  'indicating that',
  'indicates a need',
  'demonstrate proficiency',
  'demonstrate mastery',
  'skill area',
  'this level of performance',
  'is recommended',
  'to develop effectively',
];

/**
 * Returns the first banned phrase found in `text`, or null if none.
 */
function findBannedPhrase(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) return phrase;
  }
  return null;
}

/**
 * Sanitize a string value for safe inclusion in a prompt.
 * Truncates long strings and removes newlines to prevent prompt injection.
 */
function sanitizeForPrompt(value, maxLen = 200) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n\t]/g, ' ').slice(0, maxLen);
}

/**
 * Sanitize a numeric value for safe inclusion in a prompt.
 */
function sanitizeNumber(value) {
  const n = parseFloat(value);
  return isNaN(n) ? 'N/A' : String(n);
}

/**
 * Build the system prompt for the OpenAI skills summary assistant.
 * @param {Object} params
 * @param {string} params.student_code
 * @param {Array} params.iep_goals
 * @param {Array} params.dese_standards
 * @param {string} [params.audience] - 'internal' (default) or 'external'
 * @param {string} [params.retry_hint] - Banned phrase from prior attempt, for retry
 */
function buildSkillsPrompt({ student_code, iep_goals, dese_standards, audience, retry_hint }) {
  const safeCode = sanitizeForPrompt(student_code, 20);
  const isExternal = audience === 'external';

  let prompt = `You are an educational data analyst for a special education teacher.\n`;
  prompt += `Analyze the following performance data for student ${safeCode} and write a structured summary for each skill.\n\n`;

  // Banned phrase enforcement
  prompt += `## BANNED PHRASES — NEVER USE ANY OF THESE:\n`;
  for (const phrase of BANNED_PHRASES) {
    prompt += `- "${phrase}"\n`;
  }
  if (retry_hint) {
    prompt += `\nIMPORTANT: Your previous draft contained the banned phrase "${retry_hint}". `;
    prompt += `Rewrite every sentence that contained it without using that phrase.\n`;
  }
  prompt += `\n`;

  // Required structure
  prompt += `## REQUIRED SUMMARY STRUCTURE (follow exactly, ~80 words per skill):\n\n`;
  prompt += `**WHAT HAPPENED** (1-2 sentences — MUST include at least one number AND one date or skill/chapter/assignment name)\n`;
  prompt += `**WHY IT MATTERS** (1 sentence — ties score to baseline/target/IEP context)\n`;
  prompt += `**DO THIS NEXT** (1-2 bullet points — concrete actions tied to a specific day or assignment)\n`;
  if (isExternal) {
    prompt += `  Each "DO THIS NEXT" bullet MUST be prefixed with: "Suggested — review before sending."\n`;
  }
  prompt += `\nThen add: **In plain words:** {one sentence a parent or student could read, < 200 characters}\n\n`;

  // Tone rules
  prompt += `## THREE RULES:\n`;
  prompt += `1. Specific, not generic: every sentence contains at least one number, date, chapter, or assignment name.\n`;
  prompt += `2. Active voice, named actor: "The student scored..." or "We will..." — never passive constructions.\n`;
  if (isExternal) {
    prompt += `3. Plain words (~6th-grade level): use do, get, miss, score, practice, try. Avoid all IEP/SPED jargon.\n\n`;
  } else {
    prompt += `3. Plain words (~8th-grade level): use do, get, miss, score, practice, reteach, try. Avoid: proficiency, mastery, monitoring, demonstrate, performance.\n\n`;
  }

  // Audience
  if (isExternal) {
    prompt += `## AUDIENCE: External (parents, guardians, official documents). Use warm, jargon-free language. "Do this next" must be prefixed with "Suggested — review before sending."\n\n`;
  } else {
    prompt += `## AUDIENCE: Internal (teacher-facing). "Do this next" should include 1-2 specific actions the teacher can take this week.\n\n`;
  }

  // Data
  if (Array.isArray(iep_goals) && iep_goals.length > 0) {
    prompt += `IEP Goals:\n`;
    for (const g of iep_goals) {
      const code = sanitizeForPrompt(g.code, 50);
      const area = sanitizeForPrompt(g.area, 100);
      const trend = sanitizeForPrompt(g.trend, 10);
      prompt += `- Code: ${code}, Area: ${area}, Current average: ${sanitizeNumber(g.current_avg)}%, Trend: ${trend}, Data points: ${sanitizeNumber(g.data_points)}, Target: ${sanitizeNumber(g.target)}%, Baseline: ${sanitizeNumber(g.baseline)}%\n`;

      // Include per-question weaknesses (< 60% accuracy) when available
      if (Array.isArray(g.question_weaknesses) && g.question_weaknesses.length > 0) {
        prompt += `  Specific skill struggles for ${code}:\n`;
        // Limit to top 5 worst-performing questions to keep prompt size manageable
        const limitedWeaknesses = g.question_weaknesses
          .slice()
          .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100))
          .slice(0, 5);
        for (const q of limitedWeaknesses) {
          const qText = sanitizeForPrompt(q.text, 100);
          const qAcc = sanitizeNumber(q.accuracy);
          const qAttempts = sanitizeNumber(q.attempts);
          prompt += `    * "${qText}" — ${qAcc}% accuracy over ${qAttempts} attempt${q.attempts === 1 ? '' : 's'}\n`;
        }
      }
    }
    prompt += `\n`;
  }

  if (Array.isArray(dese_standards) && dese_standards.length > 0) {
    prompt += `DESE Standards (from graded assignments):\n`;
    for (const d of dese_standards) {
      const code = sanitizeForPrompt(d.code, 50);
      prompt += `- Code: ${code}, Score: ${sanitizeNumber(d.percent_correct)}%, Items graded: ${sanitizeNumber(d.item_count)}\n`;
    }
    prompt += `\n`;
  }

  // Output format
  prompt += `Return a JSON object with a single "skills" array. Each element must have:\n`;
  prompt += `  "code": the goal or DESE code exactly as provided\n`;
  if (isExternal) {
    prompt += `  "description": a plain-English description of this skill (no acronyms/jargon; parent-friendly)\n`;
  } else {
    prompt += `  "description": a thorough, IEP-ready description of this skill area. For DESE/MLS standards, include the full strand name, cluster, and specific skill being measured. For IEP goals, include the goal area, a clear restatement of what the goal measures, and the specific skill deficit being addressed.\n`;
  }
  prompt += `  "summary": the full three-section summary (WHAT HAPPENED / WHY IT MATTERS / DO THIS NEXT + "In plain words:" line)\n`;
  prompt += `  "plain_language": the "In plain words:" one-liner extracted separately (< 200 characters)\n`;
  prompt += `  "tier": one of "excellent" (>=80%), "on-track" (60-79%), "needs-support" (40-59%), "critical" (<40%)\n`;
  prompt += `  "source": "iep" if from IEP Goals, or "dese" if from DESE Standards\n`;
  if (!isExternal) {
    prompt += `  "goal_recommendation": only for needs-support or critical tiers — 1-2 sentence IEP goal draft. Omit entirely for excellent/on-track.\n`;
  } else {
    prompt += `  Do NOT include "goal_recommendation" — external summaries omit this field.\n`;
  }
  prompt += `Include every IEP goal and every DESE standard provided. Do not add or remove entries.\n`;

  return prompt;
}

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 24000);

    try {
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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!openAiRes.ok) {
        const errText = await openAiRes.text().catch(() => '');
        throw new Error(`OpenAI API error: ${openAiRes.status} ${errText}`);
      }

      const openAiData = await openAiRes.json();
      const content = openAiData?.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenAI returned empty content');

      return JSON.parse(content);
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
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
  const bannedSkillCodes = new Set();

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
  let aiEdited = false;

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
        // Still has banned phrase — log, strip offending sentences, set ai_edited flag
        console.warn(`[teacher-ai-skills-summary] [${requestId}] Banned phrase still present after retry: "${stillBanned}" — stripping and flagging`);
        skills = retryResult.skills;
        aiEdited = true;
        for (const s of skills) {
          const textToCheck = [s.summary, s.description, s.plain_language, s.goal_recommendation]
            .filter(Boolean)
            .join(' ');
          if (findBannedPhrase(textToCheck)) {
            bannedSkillCodes.add(s.code);
          }
        }
      }
    } else {
      // Retry failed entirely — apply badge to original results
      aiEdited = true;
      for (const s of skills) {
        const textToCheck = [s.summary, s.description, s.plain_language, s.goal_recommendation]
          .filter(Boolean)
          .join(' ');
        if (findBannedPhrase(textToCheck)) {
          bannedSkillCodes.add(s.code);
        }
      }
    }
  }

  const VALID_TIERS = new Set(['excellent', 'on-track', 'needs-support', 'critical']);

  // Sanitize and validate each skill entry
  const sanitizedSkills = skills
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
      ...(resolvedAudience === 'internal' && typeof s.goal_recommendation === 'string' && s.goal_recommendation.trim() !== ''
        ? { goal_recommendation: s.goal_recommendation.trim() }
        : {}),
      ...(aiEdited || bannedSkillCodes.has(s.code ? s.code.trim() : '')
        ? { ai_edited: true }
        : {}),
    }));

  console.log(`[teacher-ai-skills-summary] [${requestId}] Summary ready: ${sanitizedSkills.length} skills for ${student_code}`);

  return jsonResponse(
    event,
    200,
    { ok: true, skills: sanitizedSkills },
    {},
    requestId
  );
};

