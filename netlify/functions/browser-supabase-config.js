'use strict';

/**
 * Return the public Supabase URL and anonymous key used by the current
 * Netlify Dev process. This endpoint is intentionally available only when
 * the request host is localhost.
 */

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function isLocalHost(hostHeader) {
  const host = String(hostHeader || '')
    .trim()
    .toLowerCase();

  return (
    host === 'localhost' ||
    host.startsWith('localhost:') ||
    host === '127.0.0.1' ||
    host.startsWith('127.0.0.1:') ||
    host === '[::1]' ||
    host.startsWith('[::1]:')
  );
}

exports.handler = async (event = {}) => {
  if (event.httpMethod !== 'GET') {
    return json(405, {
      ok: false,
      error: 'Method Not Allowed',
    });
  }

  const headers = event.headers || {};
  const requestHost =
    headers.host ||
    headers.Host ||
    headers['x-forwarded-host'] ||
    headers['X-Forwarded-Host'];

  if (!isLocalHost(requestHost)) {
    return json(404, {
      ok: false,
      error: 'Not Found',
    });
  }

  const url =
    process.env.SUPABASE_URL_RUNTIME ||
    process.env.SUPABASE_URL ||
    '';

  const anonKey =
    process.env.SUPABASE_ANON_KEY_RUNTIME ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  if (!url || !anonKey) {
    return json(503, {
      ok: false,
      error: 'Local Supabase browser configuration unavailable',
    });
  }

  return json(200, {
    ok: true,
    url,
    anonKey,
  });
};
