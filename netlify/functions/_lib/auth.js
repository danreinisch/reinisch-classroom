// Minimal JWT (HS256) utilities for Teacher auth
// Uses SESSION_SECRET to sign and verify an HttpOnly cookie
const crypto = require('crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jsonb64 = (obj) => b64url(JSON.stringify(obj));

function sign(payload, secret, { expSec = 60 * 60 * 8 } = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expSec };
  const data = `${jsonb64(header)}.${jsonb64(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

function verify(token, secret) {
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const data = `${h}.${p}`;
    const expected = b64url(crypto.createHmac('sha256', secret).update(data).digest());
    if (expected !== s) return null;
    const payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function teacherCookie(name, value, { domain, secure = true, maxAge = 60 * 60 * 8 }) {
  const parts = [
    `${name}=${value}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
}

function getCookie(event, name) {
  const cookie = event.headers?.cookie || event.headers?.Cookie || '';
  const m = cookie.split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.split('=').slice(1).join('=')) : '';
}

function requireTeacher(event, secret) {
  const token = getCookie(event, 'tc');
  const payload = token ? verify(token, secret) : null;
  if (!payload || payload.role !== 'teacher') {
    return { ok: false, res: { statusCode: 401, body: 'Unauthorized' } };
  }
  return { ok: true, user: payload };
}

module.exports = { sign, verify, teacherCookie, getCookie, requireTeacher };
