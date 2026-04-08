// OpenAI DALL-E image generation endpoint for vocabulary preview illustrations
// POST /.netlify/functions/student-vocab-image
// Auth: None (CORS-protected, student-facing endpoint)
// Body: { term: "word", definition: "the definition" }
// Returns: { ok: true, image: "<base64 png>" } or { ok: false, error: "message" }

console.log('[student-vocab-image] Module loaded');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const MAX_TERM_LENGTH = 100;
const MAX_DEFINITION_LENGTH = 500;
const TIMEOUT_MS = 30000;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-vocab-image] [${requestId}] Request received - method: ${event.httpMethod}`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log(`[student-vocab-image] [${requestId}] Handling CORS preflight`);
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[student-vocab-image] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if OpenAI is configured
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[student-vocab-image] [${requestId}] OPENAI_API_KEY is not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Image generation not configured' }, {}, requestId);
  }

  // Validate body size (5KB max — well above combined term + definition limits)
  const bodySizeCheck = validateBodySize(event.body, 5);
  if (!bodySizeCheck.valid) {
    console.log(`[student-vocab-image] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Parse JSON body
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[student-vocab-image] [${requestId}] Invalid JSON body`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { term, definition } = parseResult.data;

  // Validate term
  if (!term || typeof term !== 'string' || term.trim() === '') {
    console.log(`[student-vocab-image] [${requestId}] Missing or empty term`);
    return jsonResponse(event, 400, { ok: false, error: 'term is required and must be a non-empty string' }, {}, requestId);
  }
  if (term.length > MAX_TERM_LENGTH) {
    console.log(`[student-vocab-image] [${requestId}] Term too long: ${term.length} chars`);
    return jsonResponse(event, 400, { ok: false, error: `term must be ${MAX_TERM_LENGTH} characters or fewer` }, {}, requestId);
  }

  // Validate definition (optional but bounded)
  const resolvedDefinition = (definition && typeof definition === 'string') ? definition.trim() : '';
  if (resolvedDefinition.length > MAX_DEFINITION_LENGTH) {
    console.log(`[student-vocab-image] [${requestId}] Definition too long: ${resolvedDefinition.length} chars`);
    return jsonResponse(event, 400, { ok: false, error: `definition must be ${MAX_DEFINITION_LENGTH} characters or fewer` }, {}, requestId);
  }

  // Strip control characters to prevent prompt injection attempts
  const cleanTerm = term.trim().replace(/[\x00-\x1f\x7f]/g, '');
  const cleanDefinition = resolvedDefinition.replace(/[\x00-\x1f\x7f]/g, '');

  if (!cleanTerm) {
    console.log(`[student-vocab-image] [${requestId}] Term empty after sanitization`);
    return jsonResponse(event, 400, { ok: false, error: 'term must contain valid characters' }, {}, requestId);
  }

  const promptDefinitionPart = cleanDefinition ? `: ${cleanDefinition}` : '';
  const prompt = `A clear, realistic, photographic-style illustration of ${cleanTerm}${promptDefinitionPart}. The image should accurately depict the real-world thing this word describes. Educational illustration style, clean white background, no text or labels in the image.`;

  console.log(`[student-vocab-image] [${requestId}] Calling OpenAI DALL-E API - term: "${cleanTerm}"`);

  // Call OpenAI image generation API with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let imageBase64 = null;
  try {
    const openAiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'b64_json',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!openAiRes.ok) {
      const errText = await openAiRes.text().catch(() => '');
      console.error(`[student-vocab-image] [${requestId}] OpenAI API error: ${openAiRes.status} ${errText}`);
      return jsonResponse(event, 502, { ok: false, error: 'Image generation failed' }, {}, requestId);
    }

    const responseJson = await openAiRes.json();
    imageBase64 = responseJson.data && responseJson.data[0] && responseJson.data[0].b64_json;
    if (!imageBase64) {
      console.error(`[student-vocab-image] [${requestId}] Unexpected OpenAI response shape`);
      return jsonResponse(event, 502, { ok: false, error: 'Image generation failed' }, {}, requestId);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[student-vocab-image] [${requestId}] OpenAI image request timed out`);
      return jsonResponse(event, 504, { ok: false, error: 'Image generation request timed out' }, {}, requestId);
    }
    console.error(`[student-vocab-image] [${requestId}] OpenAI image request failed: ${err.message}`);
    return jsonResponse(event, 502, { ok: false, error: 'Image generation failed' }, {}, requestId);
  }

  console.log(`[student-vocab-image] [${requestId}] Image ready for term: "${cleanTerm}"`);

  return jsonResponse(
    event,
    200,
    { ok: true, image: imageBase64 },
    {},
    requestId
  );
};
