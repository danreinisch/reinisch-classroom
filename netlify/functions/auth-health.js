// Auth health check endpoint
// Returns presence/length booleans for required environment variables
// Does NOT expose actual secret values
//
// Usage: GET /.netlify/functions/auth-health
// Returns: { ok: true, env: { ... }, timestamp: ... }

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[auth-health] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  // Only allow GET
  if (event.httpMethod !== 'GET') {
    console.log(`[auth-health] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check for runtime overrides first, then regular env vars
  const supabaseUrl = process.env.SUPABASE_URL_RUNTIME || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY_RUNTIME || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sessionSecret = process.env.SESSION_SECRET;
  const adminSessionSecret = process.env.ADMIN_SESSION_SECRET;

  // Return presence and length info (safe to expose)
  const health = {
    ok: true,
    timestamp: new Date().toISOString(),
    runtime_node_version: process.version,
    env: {
      supabase_url: {
        present: !!supabaseUrl,
        length: supabaseUrl ? supabaseUrl.length : 0,
        runtime_override: !!process.env.SUPABASE_URL_RUNTIME
      },
      supabase_service_key: {
        present: !!supabaseKey,
        length: supabaseKey ? supabaseKey.length : 0,
        runtime_override: !!process.env.SUPABASE_SERVICE_KEY_RUNTIME
      },
      session_secret: {
        present: !!sessionSecret,
        length: sessionSecret ? sessionSecret.length : 0
      },
      admin_session_secret: {
        present: !!adminSessionSecret,
        length: adminSessionSecret ? adminSessionSecret.length : 0
      }
    },
    status: {
      supabase_configured: !!(supabaseUrl && supabaseKey),
      teacher_auth_ready: !!(supabaseUrl && supabaseKey && sessionSecret),
      admin_auth_ready: !!(supabaseUrl && supabaseKey && adminSessionSecret)
    }
  };

  // Overall health is OK if Supabase is configured
  health.ok = health.status.supabase_configured;

  console.log(`[auth-health] [${requestId}] Health check complete - ok:`, health.ok);
  return jsonResponse(event, 200, health, {}, requestId);
};
