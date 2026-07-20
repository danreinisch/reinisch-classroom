// Student change password endpoint
// POST body: { studentCode, currentPassword, newPassword }
// Auth: Requires signed student session matching studentCode
// Current password is still verified before the password update

console.log('[student-change-password] Module loaded');

const { rpc } = require('./_lib/supa');
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

const {
  requireStudent,
} = require('./_lib/student-auth');

const { SESSION_SECRET } = process.env;

const INVALID_CREDS_DELAY_MS = 150 + Math.floor(Math.random() * 150); // 150-300ms

exports.handler = async (event) => {
  try {
    return await handleChangePassword(event);
  } catch (error) {
    const requestId = generateRequestId();
    console.error(`[student-change-password] [${requestId}] Uncaught error:`, {
      message: error.message,
      stack: error.stack,
    });
    return jsonResponse(event, 500, { error: 'Internal server error' }, {}, requestId);
  }
};

async function handleChangePassword(event) {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse(event, 400, { error: 'Content-Type must be application/json' }, {}, requestId);
  }

  const bodySizeCheck = validateBodySize(event.body, 10);
  if (!bodySizeCheck.valid) {
    return jsonResponse(event, 400, { error: 'Request body too large' }, {}, requestId);
  }

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return jsonResponse(event, 400, { error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { studentCode, currentPassword, newPassword } = parseResult.data;

  const codeValidation = validateStringField(studentCode, 'studentCode', 1, 64);
  if (!codeValidation.valid) {
    return jsonResponse(event, 400, { error: codeValidation.error }, {}, requestId);
  }

  const currentValidation = validateStringField(currentPassword, 'currentPassword', 1, 128);
  if (!currentValidation.valid) {
    return jsonResponse(event, 400, { error: currentValidation.error }, {}, requestId);
  }

  const newValidation = validateStringField(newPassword, 'newPassword', 6, 128);
  if (!newValidation.valid) {
    return jsonResponse(event, 400, { error: newValidation.error || 'New password must be at least 6 characters' }, {}, requestId);
  }

  if (newPassword === currentPassword) {
    return jsonResponse(event, 400, { error: 'New password must be different from current password' }, {}, requestId);
  }

  const requestedCode =
    String(studentCode)
      .trim()
      .toUpperCase();

  // The signed student session is the authoritative identity.
  // The studentCode supplied by the client must match that session.
  const studentAuth =
    requireStudent(
      event,
      SESSION_SECRET,
      requestedCode
    );

  if (!studentAuth.ok) {
    return jsonResponse(
      event,
      studentAuth.statusCode,
      {
        ok: false,
        error: studentAuth.error,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  const username =
    studentAuth.student.code;

  try {
    // Verify current password
    const verifyRes = await rpc('verify_user_password', {
      p_username: username,
      p_password: currentPassword,
    });

    if (!verifyRes.ok) {
      console.error(`[student-change-password] [${requestId}] Error verifying current password`);
      return jsonResponse(event, 500, { error: 'Authentication service unavailable' }, {}, requestId);
    }

    const users = await verifyRes.json();
    if (!Array.isArray(users) || users.length === 0) {
      // Add delay to slow brute-force attempts
      await new Promise((resolve) => setTimeout(resolve, INVALID_CREDS_DELAY_MS));
      return jsonResponse(event, 400, { error: 'Current password is incorrect' }, {}, requestId);
    }

    const userInfo = users[0];

    // Update the password via set_user_password RPC
    const changeRes = await rpc('set_user_password', {
      p_username: username,
      p_password: newPassword,
      p_role: userInfo.role || 'student',
      p_student_id: userInfo.student_id || null,
    });

    if (!changeRes.ok) {
      console.error(`[student-change-password] [${requestId}] Error updating password`);
      return jsonResponse(event, 500, { error: 'Failed to update password' }, {}, requestId);
    }

    // Also update student_passwords table for cross-system compatibility
    await rpc(
      'set_student_password',
      {
        p_code: username,
        p_password: newPassword,
      }
    ).catch(e =>
      console.warn(
        `[student-change-password] [${requestId}] ` +
        `set_student_password sync failed for ${username}:`,
        e?.message
      )
    );

    console.log(`[student-change-password] [${requestId}] Password changed for student:`, username);

    const securityHeaders = getSecurityHeaders(requestId);
    const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type']);

    return {
      statusCode: 200,
      headers: {
        ...securityHeaders,
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    console.error(`[student-change-password] [${requestId}] Error:`, e.message);
    return jsonResponse(event, 500, { error: 'Password change service error' }, {}, requestId);
  }
}
