// Minimal REST helpers for Supabase (no supabase-js needed)
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

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

async function jsonRes(res) {
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

// RPC call helper
async function rpc(functionName, params = {}) {
  const res = await rest(`/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return jsonRes(res);
}

module.exports = { rest, jsonRes, rpc };
