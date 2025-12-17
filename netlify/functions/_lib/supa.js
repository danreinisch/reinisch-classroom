// Minimal REST helpers for Supabase (no supabase-js needed)
// Supports runtime overrides via SUPABASE_URL_RUNTIME and SUPABASE_SERVICE_KEY_RUNTIME
// Uses native Node 18+ fetch (no polyfill required)

/**
 * Get Supabase configuration from environment variables
 * Supports both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SERVICE_KEY
 * and runtime variants
 * @returns {Object} { url, key } - Supabase URL and service role key
 */
function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL_RUNTIME || process.env.SUPABASE_URL;
  const key = 
    process.env.SUPABASE_SERVICE_KEY_RUNTIME || 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.SUPABASE_SERVICE_KEY;
  return { url, key };
}

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();

if (!SUPABASE_URL) console.warn('Missing SUPABASE_URL');
if (!SUPABASE_SERVICE_ROLE_KEY) console.warn('Missing SUPABASE_SERVICE_ROLE_KEY');

function rest(path, init = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...init.headers,
  };
  return fetch(url, { ...init, headers });
}

// RPC helper for calling Supabase functions
async function rpc(functionName, params = {}) {
  return rest('/rest/v1/rpc/' + functionName, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(params)
  });
}

async function jsonRes(res) {
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

/**
 * Parse RPC boolean response from PostgREST
 * PostgREST can return booleans in various formats:
 * - Direct boolean: true or false
 * - Array with single boolean: [true] or [false]
 * @param {*} data - Response data from RPC call
 * @returns {boolean} - Parsed boolean value
 */
function parseBooleanRpcResponse(data) {
  // Direct boolean
  if (typeof data === 'boolean') {
    return data;
  }
  
  // Array format (PostgREST sometimes returns [true] or [false])
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return false;
    }
    return Boolean(data[0]);
  }
  
  // Fallback: coerce to boolean
  return Boolean(data);
}

module.exports = { 
  rest, 
  jsonRes, 
  rpc, 
  parseBooleanRpcResponse,
  getSupabaseConfig,
  SUPABASE_URL, 
  SUPABASE_SERVICE_ROLE_KEY 
};
