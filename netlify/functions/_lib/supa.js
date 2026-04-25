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

/**
 * Look up the single active teacher record and return its UUID.
 * This deployment runs a single teacher, so querying by active=eq.true is correct.
 * Using active=eq.true avoids depending on teacher_code matching the login username
 * (teacher_code is auto-generated as TEACHER001, TEACHER002 etc. by a DB trigger,
 * and has no relationship to the app_users.username used for login).
 * @returns {Promise<string|null>} teacher UUID, or null if not found or on error
 */
async function lookupActiveTeacherId() {
  console.warn('[supa] DEPRECATION: lookupActiveTeacherId() assumes a single active teacher. Use teacherId from JWT instead. This fallback will be removed in a future release.');
  try {
    const res = await rest('/rest/v1/teacher?select=id&active=eq.true&limit=1', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return (Array.isArray(rows) && rows.length > 0) ? rows[0].id : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a teacher UUID by username. Returns null if no active teacher matches.
 * Used by the scheduled auto-release function, where there is no JWT to read teacherId from.
 * Usernames are stored lower-cased in public.teacher.username; the input is lowercased
 * before the query so the partial unique index (lower(username)) is used correctly.
 * @param {string} username - The teacher's login username to look up.
 * @returns {Promise<string|null>} teacher UUID, or null if not found or on error
 */
async function lookupTeacherIdByUsername(username) {
  if (!username) return null;
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  const lowercased = username.toLowerCase();
  try {
    const lookupUrl = `${url}/rest/v1/teacher?select=id&username=eq.${encodeURIComponent(lowercased)}&active=eq.true&limit=1`;
    const res = await fetch(lookupUrl, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const snippet = await res.text().catch(() => '');
      console.warn(
        `[supa] lookupTeacherIdByUsername: query failed (status ${res.status}) for username "${lowercased}" — ` +
        `response: ${snippet.slice(0, 200)}`
      );
      return null;
    }
    const rows = await res.json();
    return (Array.isArray(rows) && rows.length > 0) ? rows[0].id : null;
  } catch (err) {
    console.warn(`[supa] lookupTeacherIdByUsername: unexpected error for username "${lowercased}" — ${err.message}`);
    return null;
  }
}

module.exports = { 
  rest, 
  jsonRes, 
  rpc, 
  parseBooleanRpcResponse,
  getSupabaseConfig,
  lookupActiveTeacherId,
  lookupTeacherIdByUsername,
  SUPABASE_URL, 
  SUPABASE_SERVICE_ROLE_KEY 
};
