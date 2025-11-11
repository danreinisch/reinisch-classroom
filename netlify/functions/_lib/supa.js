// Minimal REST helpers for Supabase (no supabase-js needed)
// Supports runtime-only env overrides for better security
const SUPABASE_URL = process.env.SUPABASE_URL_RUNTIME || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY_RUNTIME || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) console.warn('Missing SUPABASE_URL or SUPABASE_URL_RUNTIME');
if (!SUPABASE_SERVICE_ROLE_KEY) console.warn('Missing SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_KEY_RUNTIME');

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

module.exports = { rest, jsonRes };
