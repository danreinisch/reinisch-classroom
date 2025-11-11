// Auth health check endpoint
// Returns boolean/length checks for required environment variables
// Does NOT expose actual secret values
//
// Response format:
// {
//   ok: boolean,        // Overall health status
//   supabase: boolean,  // Supabase configuration present
//   secrets: boolean,   // Session secrets configured
//   details: {
//     supabase_url: boolean,
//     supabase_key: boolean,
//     session_secret: boolean,
//     admin_secret: boolean
//   }
// }

const SUPABASE_URL = process.env.SUPABASE_URL_RUNTIME || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY_RUNTIME || process.env.SUPABASE_SERVICE_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;

// CORS configuration
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  try {
    // Check configuration (boolean checks only, no values)
    const details = {
      supabase_url: !!(SUPABASE_URL && SUPABASE_URL.length > 0),
      supabase_key: !!(SUPABASE_SERVICE_KEY && SUPABASE_SERVICE_KEY.length > 0),
      session_secret: !!(SESSION_SECRET && SESSION_SECRET.length >= 32),
      admin_secret: !!(ADMIN_SESSION_SECRET && ADMIN_SESSION_SECRET.length >= 32)
    };

    const supabase = details.supabase_url && details.supabase_key;
    const secrets = details.session_secret && details.admin_secret;
    const ok = supabase && secrets;

    // Optionally test Supabase connectivity
    let supabase_reachable = null;
    if (supabase && event.queryStringParameters?.test_connectivity === 'true') {
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
          method: 'HEAD',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY
          }
        });
        supabase_reachable = response.ok;
      } catch (err) {
        supabase_reachable = false;
      }
    }

    const result = {
      ok,
      supabase,
      secrets,
      details
    };

    if (supabase_reachable !== null) {
      result.supabase_reachable = supabase_reachable;
    }

    return {
      statusCode: 200,
      headers: { 
        ...CORS, 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify(result, null, 2)
    };
  } catch (err) {
    console.error('[auth-health] Error:', err.message);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        ok: false, 
        error: 'Health check failed' 
      })
    };
  }
};
