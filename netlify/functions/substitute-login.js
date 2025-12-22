// Substitute login endpoint
// POST body: { pin, password }
// Verifies against environment variable SUBSTITUTE_PIN and SUBSTITUTE_PASSWORD
// Sets HttpOnly cookie if credentials are valid

console.log('[substitute-login] Module loaded successfully');

const { sign, teacherCookie } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
  validateStringField,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

// Session configuration
const SESSION_DURATION_HOURS = 8;
const SESSION_DURATION_SECONDS = SESSION_DURATION_HOURS * 60 * 60;
const INVALID_CREDS_DELAY_MS = 150 + Math.floor(Math.random() * 150); // 150-300ms delay

const { SESSION_SECRET, SUBSTITUTE_PIN, SUBSTITUTE_PASSWORD } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[substitute-login] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[substitute-login] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Validate Content-Type
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json')) {
    console.log(`[substitute-login] [${requestId}] Invalid Content-Type: ${contentType}`);
    return jsonResponse(event, 400, { error: 'Content-Type must be application/json' }, {}, requestId);
  }

  // Validate body size
  const bodySizeCheck = validateBodySize(event.body, 10);
  if (!bodySizeCheck.valid) {
    console.log(`[substitute-login] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { error: 'Request body too large' }, {}, requestId);
  }

  // Check if substitute credentials are configured
  if (!SESSION_SECRET || !SUBSTITUTE_PIN || !SUBSTITUTE_PASSWORD) {
    console.error(`[substitute-login] [${requestId}] Server not configured: Missing substitute credentials`);
    return jsonResponse(event, 500, { error: 'Server not configured' }, {}, requestId);
  }

  // Parse JSON safely
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[substitute-login] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { pin, password } = parseResult.data;

  // Validate PIN field
  const pinValidation = validateStringField(pin, 'pin', 1, 64);
  if (!pinValidation.valid) {
    console.log(`[substitute-login] [${requestId}] Invalid PIN: ${pinValidation.error}`);
    return jsonResponse(event, 400, { error: pinValidation.error }, {}, requestId);
  }

  // Validate password field
  const passwordValidation = validateStringField(password, 'password', 1, 64);
  if (!passwordValidation.valid) {
    console.log(`[substitute-login] [${requestId}] Invalid password field format`);
    return jsonResponse(event, 400, { error: passwordValidation.error }, {}, requestId);
  }

  try {
    // Verify credentials against environment variables
    const pinMatch = pin === SUBSTITUTE_PIN;
    const passwordMatch = password === SUBSTITUTE_PASSWORD;

    if (!pinMatch || !passwordMatch) {
      console.log(`[substitute-login] [${requestId}] Invalid credentials attempt`);

      // Add fixed delay to reduce brute-force timing attacks
      await new Promise((resolve) => setTimeout(resolve, INVALID_CREDS_DELAY_MS));

      return jsonResponse(event, 401, { error: 'Invalid PIN or password' }, {}, requestId);
    }

    // Credentials valid - create session token
    const token = sign({ role: 'substitute', username: 'substitute' }, SESSION_SECRET, {
      expSec: SESSION_DURATION_SECONDS,
    });
    const setCookie = teacherCookie('sub_session', token, {
      secure: true,
      maxAge: SESSION_DURATION_SECONDS,
    });

    console.log(`[substitute-login] [${requestId}] Successful substitute login`);

    const securityHeaders = getSecurityHeaders(requestId);
    const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type']);

    return {
      statusCode: 200,
      headers: {
        ...securityHeaders,
        ...corsHeaders,
        'Set-Cookie': setCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ok: true, role: 'substitute' }),
    };
  } catch (e) {
    console.error(`[substitute-login] [${requestId}] Error processing request:`, e.message);
    return jsonResponse(event, 500, { error: 'Authentication service error' }, {}, requestId);
  }
};
