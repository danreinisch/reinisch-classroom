// Student self-service password reset
// POST /.netlify/functions/student-reset-password
// Body: { code: "S001" }
// Resets the student's password to the default format: {CODE}!
// No session required — this is intentionally unauthenticated (classroom tool for minors).
// Rate-limited: max 3 resets per student code per hour (in-memory; resets on function cold-start).

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateStringField,
} = require('./_lib/http');

const { getSupabaseConfig } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();

// In-memory rate limit map: code.toUpperCase() → { count, windowStart }
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check and update rate limit for a given code.
 * Returns true if the request is within limits (allowed), false if exceeded.
 */
function checkRateLimit(code) {
  const now = Date.now();
  const entry = rateLimitMap.get(code);

  if (!entry || (now - entry.windowStart) > RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitMap.set(code, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-reset-password] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[student-reset-password] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_err) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid request body' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const { code } = body;

  // Validate code field
  const codeValidation = validateStringField(code, 'Student code', 1, 32);
  if (!codeValidation.valid) {
    return jsonResponse(event, 400, { ok: false, error: codeValidation.error }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const codeNorm = code.trim().toUpperCase();

  // Rate limit check
  if (!checkRateLimit(codeNorm)) {
    console.log(`[student-reset-password] [${requestId}] Rate limit exceeded for code: ${codeNorm}`);
    return jsonResponse(
      event,
      429,
      { ok: false, error: 'Too many reset attempts. Please wait and try again, or ask your teacher for help.' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  try {
    // Verify the student exists
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/students?code=eq.${encodeURIComponent(codeNorm)}&select=code&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!checkRes.ok) {
      const errText = await checkRes.text().catch(() => '');
      console.error(`[student-reset-password] [${requestId}] Student lookup failed: ${checkRes.status} ${errText}`);
      return jsonResponse(event, 500, { ok: false, error: 'Unable to verify student code' }, { 'Cache-Control': 'no-store' }, requestId);
    }

    const students = await checkRes.json();
    if (!Array.isArray(students) || students.length === 0) {
      console.log(`[student-reset-password] [${requestId}] Student not found: ${codeNorm}`);
      return jsonResponse(
        event,
        404,
        { ok: false, error: 'Student code not found. Please check your code or ask your teacher for help.' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    // Reset password to default: {CODE}!
    const defaultPassword = `${codeNorm}!`;

    const resetRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reset_student_password_to_default`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ p_code: codeNorm, p_password: defaultPassword }),
    });

    if (!resetRes.ok) {
      // Log why the first RPC failed before attempting the fallback
      const firstErrText = await resetRes.text().catch(() => '');
      console.warn(`[student-reset-password] [${requestId}] reset_student_password_to_default failed (${resetRes.status}): ${firstErrText}. Trying set_student_password fallback.`);

      // Fallback: try updating the student_passwords table directly via upsert
      const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_student_password`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ p_code: codeNorm, p_plain: defaultPassword }),
      });

      if (!upsertRes.ok) {
        const errText = await upsertRes.text().catch(() => '');
        console.error(`[student-reset-password] [${requestId}] Password reset failed: ${upsertRes.status} ${errText}`);
        return jsonResponse(event, 500, { ok: false, error: 'Password reset failed. Please ask your teacher for help.' }, { 'Cache-Control': 'no-store' }, requestId);
      }
    }

    console.log(`[student-reset-password] [${requestId}] Password reset successfully for: ${codeNorm}`);
    return jsonResponse(
      event,
      200,
      { ok: true, message: 'Password has been reset to your default password.' },
      { 'Cache-Control': 'no-store' },
      requestId
    );

  } catch (err) {
    console.error(`[student-reset-password] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'An error occurred. Please try again or contact your teacher.' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
