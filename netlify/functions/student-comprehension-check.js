// OpenAI-powered comprehension question generation endpoint
// POST /.netlify/functions/student-comprehension-check
// Auth: None (CORS-protected, student-facing endpoint)
// Body: { chapterTitle: "...", chapterText: "...", bookTitle: "..." }
// Returns: { ok: true, questions: [{ question, choices, correctIndex, explanation }] }

console.log('[student-comprehension-check] Module loaded');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const MAX_CHAPTER_TEXT_LENGTH = 50000;
const MAX_TITLE_LENGTH = 200;
const PROMPT_MAX_TEXT_LENGTH = 15000; // Truncated length sent to OpenAI
const TIMEOUT_MS = 30000;

/**
 * Truncate chapter text to fit within token limits, taking text from both
 * the beginning and end of the chapter to capture key context.
 * @param {string} text
 * @returns {string}
 */
function truncateChapterText(text) {
  if (text.length <= PROMPT_MAX_TEXT_LENGTH) return text;
  const half = Math.floor(PROMPT_MAX_TEXT_LENGTH / 2);
  const beginning = text.slice(0, half);
  const ending = text.slice(text.length - half);
  return beginning + '\n\n[...middle of chapter omitted...]\n\n' + ending;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-comprehension-check] [${requestId}] Request received - method: ${event.httpMethod}`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log(`[student-comprehension-check] [${requestId}] Handling CORS preflight`);
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[student-comprehension-check] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if OpenAI is configured
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[student-comprehension-check] [${requestId}] OPENAI_API_KEY is not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Comprehension check not configured' }, {}, requestId);
  }

  // Validate body size (100KB max — well above the 50K char chapter text limit)
  const bodySizeCheck = validateBodySize(event.body, 100);
  if (!bodySizeCheck.valid) {
    console.log(`[student-comprehension-check] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Parse JSON body
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[student-comprehension-check] [${requestId}] Invalid JSON body`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { chapterTitle, chapterText, bookTitle } = parseResult.data;

  // Validate chapterText (required, non-empty)
  if (!chapterText || typeof chapterText !== 'string' || chapterText.trim() === '') {
    console.log(`[student-comprehension-check] [${requestId}] Missing or empty chapterText`);
    return jsonResponse(event, 400, { ok: false, error: 'chapterText is required and must be a non-empty string' }, {}, requestId);
  }
  if (chapterText.length > MAX_CHAPTER_TEXT_LENGTH) {
    console.log(`[student-comprehension-check] [${requestId}] chapterText too long: ${chapterText.length} chars`);
    return jsonResponse(event, 400, { ok: false, error: `chapterText must be ${MAX_CHAPTER_TEXT_LENGTH} characters or fewer` }, {}, requestId);
  }

  // Validate chapterTitle (optional but bounded)
  const resolvedChapterTitle = (chapterTitle && typeof chapterTitle === 'string') ? chapterTitle.trim() : '';
  if (resolvedChapterTitle.length > MAX_TITLE_LENGTH) {
    console.log(`[student-comprehension-check] [${requestId}] chapterTitle too long: ${resolvedChapterTitle.length} chars`);
    return jsonResponse(event, 400, { ok: false, error: `chapterTitle must be ${MAX_TITLE_LENGTH} characters or fewer` }, {}, requestId);
  }

  // Validate bookTitle (optional but bounded)
  const resolvedBookTitle = (bookTitle && typeof bookTitle === 'string') ? bookTitle.trim() : '';
  if (resolvedBookTitle.length > MAX_TITLE_LENGTH) {
    console.log(`[student-comprehension-check] [${requestId}] bookTitle too long: ${resolvedBookTitle.length} chars`);
    return jsonResponse(event, 400, { ok: false, error: `bookTitle must be ${MAX_TITLE_LENGTH} characters or fewer` }, {}, requestId);
  }

  // Strip control characters to prevent prompt injection attempts
  const cleanChapterText = chapterText.trim().replace(/[\x00-\x1f\x7f]/g, ' ');
  const cleanChapterTitle = resolvedChapterTitle.replace(/[\x00-\x1f\x7f]/g, '');
  const cleanBookTitle = resolvedBookTitle.replace(/[\x00-\x1f\x7f]/g, '');

  if (!cleanChapterText) {
    console.log(`[student-comprehension-check] [${requestId}] chapterText empty after sanitization`);
    return jsonResponse(event, 400, { ok: false, error: 'chapterText must contain valid characters' }, {}, requestId);
  }

  // Truncate chapter text for the prompt if needed
  const promptText = truncateChapterText(cleanChapterText);

  const titleLine = cleanChapterTitle
    ? `Chapter: "${cleanChapterTitle}"${cleanBookTitle ? ` from "${cleanBookTitle}"` : ''}`
    : (cleanBookTitle ? `Book: "${cleanBookTitle}"` : 'a book chapter');

  const systemPrompt = `You are a reading comprehension assistant for struggling readers in grades 4–8.

Generate exactly 2 multiple-choice comprehension questions about the provided chapter text.

Requirements:
- Questions should test understanding of key events, character motivations, or important details from the chapter.
- Use clear, simple language appropriate for struggling readers.
- Each question must have exactly 4 answer choices (labeled 0–3 by array index).
- One choice must be clearly correct based on the chapter text.
- The other three choices should be plausible but incorrect distractors.
- Include a brief explanation (1–2 sentences) that references the chapter text.

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "question": "Question text here?",
      "choices": ["Choice A", "Choice B", "Choice C", "Choice D"],
      "correctIndex": 0,
      "explanation": "Brief explanation referencing the text."
    },
    {
      "question": "Second question text here?",
      "choices": ["Choice A", "Choice B", "Choice C", "Choice D"],
      "correctIndex": 2,
      "explanation": "Brief explanation referencing the text."
    }
  ]
}`;

  const userMessage = `Here is ${titleLine}:\n\n${promptText}\n\nPlease generate 2 comprehension questions about this chapter.`;

  console.log(`[student-comprehension-check] [${requestId}] Calling OpenAI API - chapter: "${cleanChapterTitle || '(untitled)'}"`);

  // Call OpenAI chat completions API with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let questions = null;
  try {
    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!openAiRes.ok) {
      const errText = await openAiRes.text().catch(() => '');
      console.error(`[student-comprehension-check] [${requestId}] OpenAI API error: ${openAiRes.status} ${errText}`);
      return jsonResponse(event, 502, { ok: false, error: 'Question generation failed' }, {}, requestId);
    }

    const responseJson = await openAiRes.json();
    const content = responseJson.choices &&
      responseJson.choices[0] &&
      responseJson.choices[0].message &&
      responseJson.choices[0].message.content;

    if (!content) {
      console.error(`[student-comprehension-check] [${requestId}] Unexpected OpenAI response shape`);
      return jsonResponse(event, 502, { ok: false, error: 'Question generation failed' }, {}, requestId);
    }

    // Parse the JSON content from OpenAI
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.error(`[student-comprehension-check] [${requestId}] Failed to parse OpenAI JSON response: ${parseErr.message}`);
      return jsonResponse(event, 502, { ok: false, error: 'Question generation failed' }, {}, requestId);
    }

    // Validate the response structure
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      console.error(`[student-comprehension-check] [${requestId}] OpenAI response missing questions array`);
      return jsonResponse(event, 502, { ok: false, error: 'Question generation failed' }, {}, requestId);
    }

    // Validate and sanitize each question
    questions = parsed.questions.slice(0, 2).filter(function (q) {
      return q &&
        typeof q.question === 'string' &&
        Array.isArray(q.choices) &&
        q.choices.length === 4 &&
        typeof q.correctIndex === 'number' &&
        q.correctIndex >= 0 &&
        q.correctIndex <= 3 &&
        typeof q.explanation === 'string';
    }).map(function (q) {
      return {
        question: q.question.trim(),
        choices: q.choices.map(function (c) { return String(c).trim(); }),
        correctIndex: Math.floor(q.correctIndex),
        explanation: q.explanation.trim(),
      };
    });

    if (questions.length === 0) {
      console.error(`[student-comprehension-check] [${requestId}] No valid questions in OpenAI response`);
      return jsonResponse(event, 502, { ok: false, error: 'Question generation failed' }, {}, requestId);
    }

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[student-comprehension-check] [${requestId}] OpenAI request timed out`);
      return jsonResponse(event, 504, { ok: false, error: 'Question generation request timed out' }, {}, requestId);
    }
    console.error(`[student-comprehension-check] [${requestId}] OpenAI request failed: ${err.message}`);
    return jsonResponse(event, 502, { ok: false, error: 'Question generation failed' }, {}, requestId);
  }

  console.log(`[student-comprehension-check] [${requestId}] Generated ${questions.length} question(s) for chapter: "${cleanChapterTitle || '(untitled)'}"`);

  return jsonResponse(
    event,
    200,
    { ok: true, questions },
    {},
    requestId
  );
};
