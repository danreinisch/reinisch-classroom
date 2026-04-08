// AI-assisted overall assignment feedback suggestion endpoint
// POST /.netlify/functions/teacher-ai-suggest-feedback
// Auth: Requires teacher session cookie
// Body: { assignment_title, total_score, total_possible, total_percent, item_summaries, student_code, goal_codes?, goal_descriptions? }
// Returns: { ok: true, suggested_feedback: "...", rationale: "..." }

console.log('[teacher-ai-suggest-feedback] Module loaded successfully');

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
 * Build the system prompt for the holistic feedback assistant.
 */
function buildPrompt({ assignment_title, total_score, total_possible, total_percent, item_summaries, goal_codes, goal_descriptions }) {
  let prompt = `You are a compassionate grading assistant for a special education classroom.\n`;
  prompt += `Write 2-4 sentences of holistic assignment-level feedback for a student.\n\n`;

  if (assignment_title) {
    prompt += `Assignment: ${assignment_title}\n`;
  }

  if (total_possible > 0) {
    const score = typeof total_score === 'number' ? total_score : 0;
    const possible = typeof total_possible === 'number' ? total_possible : 0;
    const pct = typeof total_percent === 'number' ? total_percent : 0;
    prompt += `Overall Score: ${score}/${possible} (${pct}%)\n`;
  }

  if (Array.isArray(item_summaries) && item_summaries.length > 0) {
    prompt += `\nItem Breakdown:\n`;
    item_summaries.forEach(item => {
      const earned = item.earned != null ? item.earned : '?';
      const max = item.max != null ? item.max : '?';
      let line = `  - ${item.label || 'Item'}: ${earned}/${max}`;
      if (item.teacher_note) {
        line += ` — Note: ${item.teacher_note}`;
      }
      prompt += line + '\n';
    });
  }

  if (Array.isArray(goal_codes) && goal_codes.length > 0) {
    const codes = goal_codes.join(', ');
    prompt += `\nThis assignment is mapped to IEP Goal(s): ${codes}.\n`;
    const descs = Array.isArray(goal_descriptions) && goal_descriptions.length > 0
      ? goal_descriptions.join('; ')
      : '';
    if (descs) {
      prompt += `Goal descriptions: ${descs}\n`;
    }
    prompt += `Acknowledge the student's IEP goals when relevant. Highlight progress toward the goals.\n`;
  }

  prompt += `
Guidelines for the feedback:
- Summarize the student's overall performance on this assignment
- Highlight specific strengths
- Identify 1-2 areas for improvement in a constructive, encouraging way
- Be warm and supportive (special education context — students benefit from encouragement)
- Do NOT repeat per-item feedback verbatim (those are written separately per question)
- Keep it to 2-4 sentences total

Respond in JSON only: { "suggested_feedback": "<2-4 sentences of holistic, encouraging feedback>", "rationale": "<1 sentence internal note explaining your tone/emphasis choices>" }`;

  return prompt;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-ai-suggest-feedback] [${requestId}] Request received - method: ${event.httpMethod}`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log(`[teacher-ai-suggest-feedback] [${requestId}] Handling CORS preflight`);
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[teacher-ai-suggest-feedback] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Verify teacher session
  const auth = requireTeacher(event, SESSION_SECRET);
  if (!auth.ok) {
    console.log(`[teacher-ai-suggest-feedback] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-ai-suggest-feedback] [${requestId}] Authorized user: ${auth.user.username}`);

  // Check if OpenAI is configured
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[teacher-ai-suggest-feedback] [${requestId}] OPENAI_API_KEY is not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'AI suggestions not configured' }, {}, requestId);
  }

  // Validate body size (25KB max — item_summaries can be large for assignments with many items)
  const bodySizeCheck = validateBodySize(event.body, 25);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-ai-suggest-feedback] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Parse JSON body
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-ai-suggest-feedback] [${requestId}] Invalid JSON body`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { assignment_title, total_score, total_possible, total_percent, item_summaries, student_code, goal_codes, goal_descriptions } = parseResult.data;

  // Validate required fields — need at least total_possible or item_summaries to generate meaningful feedback
  if (total_possible == null && (!Array.isArray(item_summaries) || item_summaries.length === 0)) {
    console.log(`[teacher-ai-suggest-feedback] [${requestId}] Missing total_possible and item_summaries`);
    return jsonResponse(event, 400, { ok: false, error: 'total_possible or item_summaries is required' }, {}, requestId);
  }

  // Build the prompt
  const systemPrompt = buildPrompt({ assignment_title, total_score, total_possible, total_percent, item_summaries, goal_codes, goal_descriptions });

  console.log(`[teacher-ai-suggest-feedback] [${requestId}] Calling OpenAI API for student: ${student_code || 'unknown'}`);

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
        temperature: 0.4,
        max_tokens: 400,
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
      console.error(`[teacher-ai-suggest-feedback] [${requestId}] OpenAI API error: ${openAiRes.status} ${errText}`);
      return jsonResponse(event, 502, { ok: false, error: 'AI feedback generation failed — please write feedback manually' }, {}, requestId);
    }

    const openAiData = await openAiRes.json();
    const content = openAiData?.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`[teacher-ai-suggest-feedback] [${requestId}] OpenAI returned empty content`);
      return jsonResponse(event, 502, { ok: false, error: 'AI feedback generation failed — please write feedback manually' }, {}, requestId);
    }

    try {
      openAiResult = JSON.parse(content);
    } catch (parseErr) {
      console.error(`[teacher-ai-suggest-feedback] [${requestId}] OpenAI returned invalid JSON (first 100 chars): ${String(content).slice(0, 100)}`);
      return jsonResponse(event, 502, { ok: false, error: 'AI returned an invalid response — please try again or write feedback manually' }, {}, requestId);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[teacher-ai-suggest-feedback] [${requestId}] OpenAI request timed out`);
    } else {
      console.error(`[teacher-ai-suggest-feedback] [${requestId}] OpenAI request failed: ${err.message}`);
    }
    return jsonResponse(event, 502, { ok: false, error: 'AI feedback generation failed — please write feedback manually' }, {}, requestId);
  }

  const { suggested_feedback, rationale } = openAiResult;

  if (!suggested_feedback || typeof suggested_feedback !== 'string' || suggested_feedback.trim() === '') {
    console.error(`[teacher-ai-suggest-feedback] [${requestId}] OpenAI returned empty suggested_feedback`);
    return jsonResponse(event, 502, { ok: false, error: 'AI feedback generation failed — please write feedback manually' }, {}, requestId);
  }

  console.log(`[teacher-ai-suggest-feedback] [${requestId}] Feedback suggestion ready`);

  return jsonResponse(
    event,
    200,
    { ok: true, suggested_feedback: suggested_feedback.trim(), rationale: rationale || '' },
    {},
    requestId
  );
};
