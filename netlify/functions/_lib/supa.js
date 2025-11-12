// Minimal REST helpers for Supabase (no supabase-js needed)
// Supports runtime overrides via SUPABASE_URL_RUNTIME and SUPABASE_SERVICE_KEY_RUNTIME
// Uses native Node 18+ fetch (no polyfill required)
const SUPABASE_URL = process.env.SUPABASE_URL_RUNTIME || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY_RUNTIME || process.env.SUPABASE_SERVICE_ROLE_KEY;

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

module.exports = { rest, jsonRes, rpc, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };
