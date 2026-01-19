'use strict';

const crypto = require('crypto');

/**
 * Secrets: we SIGN with the first present secret, but we VERIFY with any present secret.
 * This prevents "secret order changed" from invalidating existing cookies.
 */
const SECRET_KEYS = [
  'RC_TC_SECRET',
  'RC_AUTH_SECRET',
  'RC_JWT_SECRET',
  'RC_SECRET',
  'TC_SECRET',
  'JWT_SECRET',
  'SESSION_SECRET'
];

const CONTEXT = process.env.CONTEXT || process.env.NETLIFY_CONTEXT || '';
const IS_PROD = CONTEXT === 'production';

function presentSecrets() {
  return SECRET_KEYS
    .map((k) => process.env[k])
    .filter((v) => typeof v === 'string' && v.length > 0);
}

/**
 * In deploy previews/local, we allow an empty secret so dev isn’t hard-blocked
 * if preview-context env vars weren’t configured. In production we fail closed.
 */
function signingSecretOrNull() {
  const secrets = presentSecrets();
  if (secrets.length) return secrets[0];
  if (IS_PROD) return null;
  return '';
}

function verificationSecrets() {
  const secrets = presentSecrets();
  if (secrets.length) return secrets;
  if (IS_PROD) return [];
  return [''];
}

function b64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  const padded = pad ? s + '='.repeat(4 - pad) : s;
  return Buffer.from(padded, 'base64');
}

function safeEqualStr(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function parseJson(buf) {
  try {
    return JSON.parse(Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf));
  } catch {
    return null;
  }
}

function jwtSignHS256(payloadObj, secret) {
  const headerObj = { alg: 'HS256', typ: 'JWT' };
  const h = b64urlEncode(JSON.stringify(headerObj));
  const p = b64urlEncode(JSON.stringify(payloadObj));
  const data = `${h}.${p}`;
  const sig = b64urlEncode(crypto.createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

function jwtVerifyHS256(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;

  const [h, p, sig] = parts;
  const data = `${h}.${p}`;
  const expected = b64urlEncode(crypto.createHmac('sha256', secret).update(data).digest());
  if (!safeEqualStr(expected, sig)) return null;

  const header = parseJson(b64urlDecode(h));
  if (!header || header.alg !== 'HS256') return null;

  const payload = parseJson(b64urlDecode(p));
  if (!payload || typeof payload !== 'object') return null;

  // Match your prior behavior: exp must exist and must be in the future
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number') return null;
  if (now > payload.exp) return null;

  return payload;
}

/** Public API: sign + verify */
function sign(payload, expSec = 60 * 60 * 8) {
  const secret = signingSecretOrNull();
  if (secret === null) return null; // prod fail-closed

  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expSec };
  return jwtSignHS256(body, secret);
}

function verify(token) {
  const secrets = verificationSecrets();
  if (!secrets.length) return null; // prod fail-closed

  for (const s of secrets) {
    const payload = jwtVerifyHS256(token, s);
    if (payload) return payload;
  }
  return null;
}

/** Cookie helpers */
function getCookieFromHeader(header, name) {
  if (!header || !name) return null;
  const parts = String(header).split(';');
  for (const part of parts) {
    const t = part.trim();
    if (t.startsWith(name + '=')) return t.slice(name.length + 1);
  }
  return null;
}

/**
 * getCookie can accept:
 * - (event, name) OR
 * - (headerString, name)
 */
function getCookie(eventOrHeader, name) {
  if (typeof eventOrHeader === 'string') return getCookieFromHeader(eventOrHeader, name);
  const h = eventOrHeader && eventOrHeader.headers ? eventOrHeader.headers : {};
  const header = h.cookie || h.Cookie || '';
  return getCookieFromHeader(header, name);
}

function teacherCookie(name, value, { domain, secure = true, maxAge = 60 * 60 * 8, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [];
  parts.push(`${name}=${value || ''}`);

  // __Host- rules: Secure, Path=/, and NO Domain
  const hostPrefix = typeof name === 'string' && name.startsWith('__Host-');
  const finalPath = hostPrefix ? '/' : (path || '/');
  parts.push(`Path=${finalPath}`);

  if (!hostPrefix && domain) parts.push(`Domain=${domain}`);

  parts.push('HttpOnly');
  parts.push(`SameSite=${sameSite}`);

  if (hostPrefix || secure) parts.push('Secure');
  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);

  return parts.join('; ');
}

function requireTeacher(event) {
  const h = event && event.headers ? event.headers : {};
  const header = h.cookie || h.Cookie || '';

  // Prefer __Host-tc if present, else tc
  const token =
    getCookieFromHeader(header, '__Host-tc') ||
    getCookieFromHeader(header, 'tc');

  if (!token) return null;
  const payload = verify(token);
  if (!payload) return null;

  // Minimal sanity (prevents “valid JWT but junk payload”)
  if (!payload.u) return null;

  return payload;
}

module.exports = {
  SECRET_KEYS,
  sign,
  verify,
  teacherCookie,
  getCookie,
  requireTeacher
};
