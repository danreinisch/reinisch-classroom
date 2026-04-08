// AI-powered skills summary endpoint
// POST /.netlify/functions/teacher-ai-skills-summary
// Auth: Requires teacher session cookie
// Body: { student_code, iep_goals, dese_standards }
// Returns: { ok: true, skills: [{ code, summary, tier, source }] }

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
 */
function buildSkillsPrompt({ student_code, iep_goals, dese_standards }) {
  const safeCode = sanitizeForPrompt(student_code, 20);
  let prompt = `You are an educational data analyst for a special education teacher.\n`;
  prompt += `Analyze the following performance data for student ${safeCode} and write a 2-3 sentence summary for each skill area.\n`;
  prompt += `Use encouraging but honest language. Be specific about the numbers.\n`;
  prompt += `If performance is below 40%, flag it as needing immediate attention.\n\n`;

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
        for (const q of g.question_weaknesses) {
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

  prompt += `Return a JSON object with a single "skills" array. Each element must have:\n`;
  prompt += `  "code": the goal or DESE code exactly as provided\n`;
  prompt += `  "summary": a 2-3 sentence narrative about performance in this skill area\n`;
  prompt += `  "tier": one of "excellent" (>=80%), "on-track" (60-79%), "needs-support" (40-59%), "critical" (<40%)\n`;
  prompt += `  "source": "iep" if the code came from the IEP Goals section, or "dese" if it came from the DESE Standards section\n`;
  prompt += `Include every IEP goal and every DESE standard provided. Do not add or remove entries.\n`;
  prompt += `Example: { "skills": [{ "code": "S023.10.1", "summary": "...", "tier": "on-track", "source": "iep" }] }`;

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

  const { student_code, iep_goals, dese_standards } = parseResult.data;

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

  // Build the prompt
  const systemPrompt = buildSkillsPrompt({ student_code, iep_goals: iep_goals || [], dese_standards: dese_standards || [] });

  console.log(`[teacher-ai-skills-summary] [${requestId}] Calling OpenAI API for student ${student_code}`);

  // Call OpenAI with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let openAiResult;
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
        max_tokens: 2000,
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
      console.error(`[teacher-ai-skills-summary] [${requestId}] OpenAI API error: ${openAiRes.status} ${errText}`);
      return jsonResponse(event, 502, { ok: false, error: 'AI skills summary failed' }, {}, requestId);
    }

    const openAiData = await openAiRes.json();
    const content = openAiData?.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`[teacher-ai-skills-summary] [${requestId}] OpenAI returned empty content`);
      return jsonResponse(event, 502, { ok: false, error: 'AI skills summary failed' }, {}, requestId);
    }

    openAiResult = JSON.parse(content);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[teacher-ai-skills-summary] [${requestId}] OpenAI request timed out`);
    } else {
      console.error(`[teacher-ai-skills-summary] [${requestId}] OpenAI request failed: ${err.message}`);
    }
    return jsonResponse(event, 502, { ok: false, error: 'AI skills summary failed' }, {}, requestId);
  }

  // Validate response shape
  const skills = openAiResult?.skills;
  if (!Array.isArray(skills)) {
    console.error(`[teacher-ai-skills-summary] [${requestId}] OpenAI response missing skills array`);
    return jsonResponse(event, 502, { ok: false, error: 'AI skills summary returned unexpected format' }, {}, requestId);
  }

  const VALID_TIERS = new Set(['excellent', 'on-track', 'needs-support', 'critical']);

  // Sanitize and validate each skill entry
  const sanitizedSkills = skills
    .filter(s => s && typeof s.code === 'string' && s.code.trim() !== '')
    .map(s => ({
      code: s.code.trim(),
      summary: typeof s.summary === 'string' ? s.summary.trim() : '',
      tier: VALID_TIERS.has(s.tier) ? s.tier : 'needs-support',
      source: s.source === 'dese' ? 'dese' : 'iep',
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
