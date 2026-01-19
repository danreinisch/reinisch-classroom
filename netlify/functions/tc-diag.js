'use strict';

const { verify, getCookie, SECRET_KEYS } = require('./_lib/auth');

function fp(secret) {
  if (!secret) return null;
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(String(secret)).digest('hex').slice(0, 12);
}

exports.handler = async (event) => {
  // Require an explicit env toggle + key
  const DIAG_KEY = process.env.RC_DIAG_KEY || '';
  if (!DIAG_KEY) return { statusCode: 404, body: 'not found' };

  const qs = event.queryStringParameters || {};
  if (qs.key !== DIAG_KEY) return { statusCode: 404, body: 'not found' };

  const header = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  const tc = getCookie(header, 'tc');
  const hostTc = getCookie(header, '__Host-tc');
  const token = hostTc || tc || null;

  const now = Math.floor(Date.now() / 1000);
  const decoded = token ? verify(token) : null;

  const present = {};
  for (const k of SECRET_KEYS) present[k] = !!process.env[k];

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify({
      now,
      cookieHeaderBytes: header.length,
      tcPresent: !!tc,
      hostTcPresent: !!hostTc,
      usingTokenFrom: hostTc ? '__Host-tc' : (tc ? 'tc' : null),
      decoded: decoded ? { exp: decoded.exp, iat: decoded.iat, u: decoded.u, roles: decoded.roles, ver: decoded.ver } : null,
      decodedLooksExpired: decoded && typeof decoded.exp === 'number' ? (decoded.exp <= now) : null,
      secretsPresent: present,
      // Optional: helps confirm “same secret across contexts” without exposing it
      primarySecretFp: fp((SECRET_KEYS.map((k) => process.env[k]).find(Boolean)) || '')
    }, null, 2)
  };
};
