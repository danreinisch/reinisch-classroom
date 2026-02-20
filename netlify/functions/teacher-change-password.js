// Teacher change password endpoint
// POST body: { currentPassword, newPassword }
// Requires valid teacher session cookie
// Changes the teacher's password via Supabase RPC

console.log('[teacher-change-password] Module loaded');

const { requireTeacher } = require('./_lib/auth');
const { rpc, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('./_lib/supa');
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

const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  try {
    return await handleChangePassword(event);
  } catch (error) {
    const requestId = generateRequestId();
    console.error(`[teacher-change-password] [${requestId}] Uncaught error:`, {
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

  // Verify teacher session
  if (!SESSION_SECRET) {
    console.error(`[teacher-change-password] [${requestId}] SESSION_SECRET missing`);
    return jsonResponse(event, 500, { error: 'Server not configured' }, {}, requestId);
  }

  const auth = requireTeacher(event, SESSION_SECRET);
  if (!auth.ok) {
    return jsonResponse(event, 401, { error: 'Unauthorized' }, {}, requestId);
  }

  const username = auth.user.username;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(event, 500, { error: 'Server not configured' }, {}, requestId);
  }

  // Validate body size
  const bodySizeCheck = validateBodySize(event.body, 10);
  if (!bodySizeCheck.valid) {
    return jsonResponse(event, 400, { error: 'Request body too large' }, {}, requestId);
  }

  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse(event, 400, { error: 'Content-Type must be application/json' }, {}, requestId);
  }

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return jsonResponse(event, 400, { error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { currentPassword, newPassword } = parseResult.data;

  const currentValidation = validateStringField(currentPassword, 'currentPassword', 1, 128);
  if (!currentValidation.valid) {
    return jsonResponse(event, 400, { error: currentValidation.error }, {}, requestId);
  }

  const newValidation = validateStringField(newPassword, 'newPassword', 8, 128);
  if (!newValidation.valid) {
    return jsonResponse(event, 400, { error: newValidation.error || 'New password must be at least 8 characters' }, {}, requestId);
  }

  try {
    // Verify current password first
    const verifyRes = await rpc('verify_user_password', {
      p_username: username,
      p_password: currentPassword,
    });

    if (!verifyRes.ok) {
      console.error(`[teacher-change-password] [${requestId}] Error verifying current password`);
      return jsonResponse(event, 500, { error: 'Authentication service unavailable' }, {}, requestId);
    }

    const users = await verifyRes.json();
    if (!Array.isArray(users) || users.length === 0) {
      return jsonResponse(event, 400, { error: 'Current password is incorrect' }, {}, requestId);
    }

    // Change the password via RPC
    const changeRes = await rpc('change_user_password', {
      p_username: username,
      p_new_password: newPassword,
    });

    if (!changeRes.ok) {
      console.error(`[teacher-change-password] [${requestId}] Error changing password`);
      return jsonResponse(event, 500, { error: 'Failed to change password' }, {}, requestId);
    }

    console.log(`[teacher-change-password] [${requestId}] Password changed for user:`, username);

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
    console.error(`[teacher-change-password] [${requestId}] Error:`, e.message);
    return jsonResponse(event, 500, { error: 'Password change service error' }, {}, requestId);
  }
}
