// AI-assisted grading suggestion endpoint
// POST /.netlify/functions/teacher-ai-suggest
// Auth: Requires teacher session cookie
// Body: { student_response, rubric_tiers, max_points, item_label, question_text?, goal_codes, goal_descriptions }
// Returns: { ok: true, suggested_score, suggested_note, rationale }

console.log('[teacher-ai-suggest] Module loaded successfully');

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
 * Build the system prompt for the OpenAI grading assistant.
 */
function buildPrompt({ student_response, rubric_tiers, max_points, item_label, question_text, goal_codes, goal_descriptions }) {
  const rubricLines = rubric_tiers
    .map((t) => `  ${t.points} — ${t.label}: ${t.desc}`)
    .join('\n');

  let prompt = `You are a grading assistant for a special education classroom.\n`;
  prompt += `Score a student's written response on a scale of 0–${max_points}.\n\n`;
  prompt += `Rubric:\n${rubricLines}\n`;

  if (Array.isArray(goal_codes) && goal_codes.length > 0) {
    const codes = goal_codes.join(', ');
    const descs = Array.isArray(goal_descriptions) && goal_descriptions.length > 0
      ? goal_descriptions.join('; ')
      : '';
    prompt += `\nThis item is mapped to IEP Goal(s): ${codes}.\n`;
    if (descs) {
      prompt += `Goal description: ${descs}.\n`;
    }
    prompt += `When evaluating, give credit for responses that demonstrate progress toward the IEP goal, even if the writing quality is imperfect. Prioritize evidence of understanding over grammar/mechanics.\n`;
  }

  if (item_label) {
    if (question_text) {
      prompt += `\nQuestion (${item_label}): ${question_text}\n`;
    } else {
      prompt += `\nQuestion: ${item_label}\n`;
    }
  } else if (question_text) {
    prompt += `\nQuestion: ${question_text}\n`;
  }

  prompt += `\nStudent Response:\n"${student_response}"\n`;
  prompt += `\nRespond in JSON only: { "suggested_score": <number 0-${max_points}>, "suggested_note": "<3-4 sentences of constructive feedback focused specifically on the student's written response to this question. Comment on what the student demonstrated, what could be improved, and any specific guidance. Do not comment on the overall assignment — overall feedback is handled separately by the teacher.>", "rationale": "<brief internal reasoning for the score, 1 sentence>" }`;

  return prompt;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-ai-suggest] [${requestId}] Request received - method: ${event.httpMethod}`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log(`[teacher-ai-suggest] [${requestId}] Handling CORS preflight`);
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[teacher-ai-suggest] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Verify teacher session
  const auth = requireTeacher(event, SESSION_SECRET);
  if (!auth.ok) {
    console.log(`[teacher-ai-suggest] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-ai-suggest] [${requestId}] Authorized user: ${auth.user.username}`);

  // Check if OpenAI is configured
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[teacher-ai-suggest] [${requestId}] OPENAI_API_KEY is not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'AI suggestions not configured' }, {}, requestId);
  }

  // Validate body size (10KB max)
  const bodySizeCheck = validateBodySize(event.body, 10);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-ai-suggest] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Parse JSON body
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-ai-suggest] [${requestId}] Invalid JSON body`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { student_response, rubric_tiers, max_points, item_label, question_text, goal_codes, goal_descriptions } = parseResult.data;

  // Validate required fields
  if (!student_response || typeof student_response !== 'string' || student_response.trim() === '') {
    console.log(`[teacher-ai-suggest] [${requestId}] Missing or empty student_response`);
    return jsonResponse(event, 400, { ok: false, error: 'student_response is required and must be a non-empty string' }, {}, requestId);
  }

  if (max_points === undefined || max_points === null || typeof max_points !== 'number' || max_points <= 0) {
    console.log(`[teacher-ai-suggest] [${requestId}] Invalid max_points: ${max_points}`);
    return jsonResponse(event, 400, { ok: false, error: 'max_points is required and must be a positive number' }, {}, requestId);
  }

  if (!Array.isArray(rubric_tiers) || rubric_tiers.length === 0) {
    console.log(`[teacher-ai-suggest] [${requestId}] Missing or empty rubric_tiers`);
    return jsonResponse(event, 400, { ok: false, error: 'rubric_tiers is required and must be a non-empty array' }, {}, requestId);
  }

  // Build the prompt
  const systemPrompt = buildPrompt({ student_response, rubric_tiers, max_points, item_label, question_text, goal_codes, goal_descriptions });

  console.log(`[teacher-ai-suggest] [${requestId}] Calling OpenAI API`);

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
        max_tokens: 500,
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
      console.error(`[teacher-ai-suggest] [${requestId}] OpenAI API error: ${openAiRes.status} ${errText}`);
      return jsonResponse(event, 502, { ok: false, error: 'AI suggestion failed — please score manually' }, {}, requestId);
    }

    const openAiData = await openAiRes.json();
    const content = openAiData?.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`[teacher-ai-suggest] [${requestId}] OpenAI returned empty content`);
      return jsonResponse(event, 502, { ok: false, error: 'AI suggestion failed — please score manually' }, {}, requestId);
    }

    try {
      openAiResult = JSON.parse(content);
    } catch (parseErr) {
      console.error(`[teacher-ai-suggest] [${requestId}] OpenAI returned invalid JSON (first 100 chars): ${String(content).slice(0, 100)}`);
      return jsonResponse(event, 502, { ok: false, error: 'AI returned an invalid response — please try again or score manually' }, {}, requestId);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[teacher-ai-suggest] [${requestId}] OpenAI request timed out`);
    } else {
      console.error(`[teacher-ai-suggest] [${requestId}] OpenAI request failed: ${err.message}`);
    }
    return jsonResponse(event, 502, { ok: false, error: 'AI suggestion failed — please score manually' }, {}, requestId);
  }

  // Validate and clamp suggested_score
  let { suggested_score, suggested_note, rationale } = openAiResult;
  if (typeof suggested_score !== 'number' || isNaN(suggested_score)) {
    suggested_score = 0;
  }
  suggested_score = Math.max(0, Math.min(max_points, suggested_score));

  console.log(`[teacher-ai-suggest] [${requestId}] Suggestion ready: score=${suggested_score}/${max_points}`);

  return jsonResponse(
    event,
    200,
    { ok: true, suggested_score, suggested_note: suggested_note || '', rationale: rationale || '' },
    {},
    requestId
  );
};
