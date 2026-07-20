'use strict';

const assert = require('assert');

const {
  createStudentSessionCookie,
  requireStudent,
} = require(
  '../netlify/functions/_lib/student-auth'
);

const secret =
  'student-auth-test-secret-that-is-long-enough';

function eventWithCookie(cookie) {
  return {
    headers: {
      cookie,
    },
  };
}

console.log(
  'Running student-auth tests...\n'
);

const cookie =
  createStudentSessionCookie(
    's001',
    secret,
    {
      secure: false,
      maxAge: 3600,
    }
  );

assert.match(
  cookie,
  /^sc=/
);

assert.match(
  cookie,
  /HttpOnly/
);

assert.match(
  cookie,
  /SameSite=Lax/
);

assert.doesNotMatch(
  cookie,
  /Secure/
);

console.log(
  '✓ signed HttpOnly student cookie created'
);

const valid =
  requireStudent(
    eventWithCookie(cookie),
    secret
  );

assert.strictEqual(
  valid.ok,
  true
);

assert.strictEqual(
  valid.student.code,
  'S001'
);

console.log(
  '✓ valid student session authenticates'
);

const matching =
  requireStudent(
    eventWithCookie(cookie),
    secret,
    's001'
  );

assert.strictEqual(
  matching.ok,
  true
);

console.log(
  '✓ matching requested student code is allowed'
);

const mismatched =
  requireStudent(
    eventWithCookie(cookie),
    secret,
    'S002'
  );

assert.strictEqual(
  mismatched.ok,
  false
);

assert.strictEqual(
  mismatched.statusCode,
  403
);

console.log(
  '✓ cross-student code mismatch is forbidden'
);

const missing =
  requireStudent(
    { headers: {} },
    secret
  );

assert.strictEqual(
  missing.ok,
  false
);

assert.strictEqual(
  missing.statusCode,
  401
);

console.log(
  '✓ missing student session is unauthorized'
);

const cookieTokenMatch =
  cookie.match(/^sc=([^;]+)/);

assert.ok(
  cookieTokenMatch,
  'Expected sc cookie token'
);

const originalToken =
  cookieTokenMatch[1];

const tokenParts =
  originalToken.split('.');

assert.strictEqual(
  tokenParts.length,
  3,
  'Expected JWT-style three-part token'
);

const originalSignature =
  tokenParts[2];

const tamperedSignature =
  (
    originalSignature[0] === 'A'
      ? 'B'
      : 'A'
  ) + originalSignature.slice(1);

const tamperedToken = [
  tokenParts[0],
  tokenParts[1],
  tamperedSignature,
].join('.');

const tamperedCookie =
  cookie.replace(
    `sc=${originalToken}`,
    `sc=${tamperedToken}`
  );

const tampered =
  requireStudent(
    eventWithCookie(tamperedCookie),
    secret
  );

assert.strictEqual(
  tampered.ok,
  false
);

assert.strictEqual(
  tampered.statusCode,
  401
);

console.log(
  '✓ tampered student session signature is rejected'
);

console.log(
  '\n✓ All student-auth tests passed!'
);
