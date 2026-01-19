const crypto = require('crypto');

function cookieHeader(event) {
  const h = (event && event.headers) ? event.headers : {};
  return h.cookie || h.Cookie || h.COOKIE || '';
}

function getCookieAll(header, name) {
  if (!header) return [];
  const out = [];
  for (const partRaw of String(header).split(';')) {
    const part = partRaw.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) out.push(part.slice(eq + 1));
  }
  return out;
}

// Prefer the LAST occurrence (handles duplicate tc= entries safely)
function getCookieLast(header, name) {
  const all = getCookieAll(header, name);
  return all.length ? all[all.length - 1] : null;
}

function decodeJwtNoVerify(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

// IMPORTANT: we don’t leak secrets; we only show presence + fingerprint
const SECRET_KEYS = [
  'RC_TC_SECRET',
  'RC_AUTH_SECRET',
  'RC_JWT_SECRET',
  'RC_SECRET',
  'TC_SECRET',
  'JWT_SECRET',
  'SESSION_SECRET'
];

function pickSecret() {
  for (const k of SECRET_KEYS) {
    const v = process.env[k];
    if (v) return { key: k, value: v };
  }
  return { key: null, value: '' };
}

function fp(s) {
  if (!s) return null;
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 10);
}

exports.handler = async (event) => {
  const header = cookieHeader(event);
  const now = Math.floor(Date.now() / 1000);

  const tcAll = getCookieAll(header, 'tc');
  const hostTcAll = getCookieAll(header, '__Host-tc');

  const tc = getCookieLast(header, 'tc') || getCookieLast(header, '__Host-tc');
  const decoded = tc ? decodeJwtNoVerify(tc) : null;

  // Try to verify using your existing auth lib if present
  let verified = false;
  let verifyReason = 'not_attempted';
  try {
    const auth = require('./_lib/auth');
    if (typeof auth.verify === 'function' && tc) {
      const payload = auth.verify(tc);
      verified = !!payload;
      verifyReason = verified ? 'ok' : 'verify_returned_null';
    } else {
      verifyReason = 'auth.verify_missing_or_no_tc';
    }
  } catch (e) {
    verifyReason = 'auth_verify_threw';
  }

  const secretPick = pickSecret();
  const present = {};
  for (const k of SECRET_KEYS) present[k] = !!process.env[k];

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify({
      now,
      cookieHeaderBytes: header.length,
      tcCount: tcAll.length,
      hostTcCount: hostTcAll.length,
      usingTokenFrom: tc ? (tcAll.length ? 'tc' : '__Host-tc') : null,
      decoded: decoded ? { exp: decoded.exp, iat: decoded.iat, u: decoded.u, roles: decoded.roles, ver: decoded.ver } : null,
      decodedLooksExpired: decoded && typeof decoded.exp === 'number' ? (decoded.exp <= now) : null,
      verified,
      verifyReason,
      secret: { pickedKey: secretPick.key, fingerprint: fp(secretPick.value), present }
    }, null, 2)
  };
};
