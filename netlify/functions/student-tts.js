// OpenAI TTS endpoint for book Read Aloud feature
// POST /.netlify/functions/student-tts
// Auth: None (CORS-protected, student-facing endpoint)
// Body: { text: "paragraph text", voice: "nova", speed: 1.0 }
// Returns: { ok: true, audio: "<base64 mp3>", format: "mp3" }

console.log('[student-tts] Module loaded');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const ALLOWED_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const MAX_TEXT_LENGTH = 5000;
const TIMEOUT_MS = 30000;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-tts] [${requestId}] Request received - method: ${event.httpMethod}`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log(`[student-tts] [${requestId}] Handling CORS preflight`);
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[student-tts] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if OpenAI is configured
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[student-tts] [${requestId}] OPENAI_API_KEY is not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'TTS not configured' }, {}, requestId);
  }

  // Validate body size (10KB max — well above 5000-char text limit)
  const bodySizeCheck = validateBodySize(event.body, 10);
  if (!bodySizeCheck.valid) {
    console.log(`[student-tts] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Parse JSON body
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[student-tts] [${requestId}] Invalid JSON body`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { text, voice, speed } = parseResult.data;

  // Validate text
  if (!text || typeof text !== 'string' || text.trim() === '') {
    console.log(`[student-tts] [${requestId}] Missing or empty text`);
    return jsonResponse(event, 400, { ok: false, error: 'text is required and must be a non-empty string' }, {}, requestId);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    console.log(`[student-tts] [${requestId}] Text too long: ${text.length} chars`);
    return jsonResponse(event, 400, { ok: false, error: `text must be ${MAX_TEXT_LENGTH} characters or fewer` }, {}, requestId);
  }

  // Validate voice (optional, defaults to nova)
  const resolvedVoice = voice || 'nova';
  if (!ALLOWED_VOICES.includes(resolvedVoice)) {
    console.log(`[student-tts] [${requestId}] Invalid voice: ${resolvedVoice}`);
    return jsonResponse(event, 400, { ok: false, error: `voice must be one of: ${ALLOWED_VOICES.join(', ')}` }, {}, requestId);
  }

  // Validate speed (optional, defaults to 1.0, range 0.25–4.0)
  let resolvedSpeed = 1.0;
  if (speed !== undefined && speed !== null) {
    const parsedSpeed = parseFloat(speed);
    if (isNaN(parsedSpeed) || parsedSpeed < 0.25 || parsedSpeed > 4.0) {
      console.log(`[student-tts] [${requestId}] Invalid speed: ${speed}`);
      return jsonResponse(event, 400, { ok: false, error: 'speed must be a number between 0.25 and 4.0' }, {}, requestId);
    }
    resolvedSpeed = parsedSpeed;
  }

  console.log(`[student-tts] [${requestId}] Calling OpenAI TTS API - voice: ${resolvedVoice}, speed: ${resolvedSpeed}, text length: ${text.length}`);

  // Call OpenAI TTS API with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let audioBuffer = null;
  try {
    const openAiRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: resolvedVoice,
        response_format: 'mp3',
        speed: resolvedSpeed,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!openAiRes.ok) {
      const errText = await openAiRes.text().catch(() => '');
      console.error(`[student-tts] [${requestId}] OpenAI API error: ${openAiRes.status} ${errText}`);
      return jsonResponse(event, 502, { ok: false, error: 'TTS generation failed' }, {}, requestId);
    }

    const arrayBuffer = await openAiRes.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[student-tts] [${requestId}] OpenAI TTS request timed out`);
      return jsonResponse(event, 504, { ok: false, error: 'TTS request timed out' }, {}, requestId);
    }
    console.error(`[student-tts] [${requestId}] OpenAI TTS request failed: ${err.message}`);
    return jsonResponse(event, 502, { ok: false, error: 'TTS generation failed' }, {}, requestId);
  }

  const audioBase64 = audioBuffer.toString('base64');
  console.log(`[student-tts] [${requestId}] TTS ready - audio size: ${audioBuffer.length} bytes`);

  return jsonResponse(
    event,
    200,
    { ok: true, audio: audioBase64, format: 'mp3' },
    {},
    requestId
  );
};
