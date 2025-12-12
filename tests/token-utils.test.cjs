// Unit tests for token utilities
// Run with: node tests/token-utils.test.cjs

const crypto = require('crypto');
const assert = require('assert');

// Import the module to test
const {
  encodeToken,
  verifyToken,
  createTokenPair,
  refreshAccessToken,
  parseCookies,
  verifySession,
  serializeCookie,
  createTokenCookies,
  createErrorResponse,
  getCookie,
  b64url,
  b64urlDecode,
  COOKIE_V4_ACCESS,
  COOKIE_V1_REFRESH,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS
} = require('../netlify/functions/_lib/token-utils');

const TEST_SECRET = 'test-secret-key-for-unit-testing-minimum-32-chars';

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error('  Error:', e.message);
    process.exit(1);
  }
}

console.log('Running token-utils unit tests...\n');

// Test: encodeToken and verifyToken
test('encodeToken creates valid token', () => {
  const payload = { u: 'testuser', exp: Math.floor(Date.now() / 1000) + 3600, ver: 'v4', n: '12345678' };
  const token = encodeToken(payload, TEST_SECRET);
  
  assert(token, 'Token should be created');
  assert(token.includes('.'), 'Token should have payload and signature separated by dot');
  
  const parts = token.split('.');
  assert.strictEqual(parts.length, 2, 'Token should have exactly 2 parts');
});

test('verifyToken validates correct token', () => {
  const payload = { u: 'testuser', exp: Math.floor(Date.now() / 1000) + 3600, ver: 'v4', n: '12345678' };
  const token = encodeToken(payload, TEST_SECRET);
  
  const verified = verifyToken(token, TEST_SECRET);
  assert(verified, 'Token should be verified');
  assert.strictEqual(verified.u, 'testuser', 'Username should match');
  assert.strictEqual(verified.ver, 'v4', 'Version should match');
});

test('verifyToken rejects expired token', () => {
  const payload = { u: 'testuser', exp: Math.floor(Date.now() / 1000) - 10, ver: 'v4', n: '12345678' };
  const token = encodeToken(payload, TEST_SECRET);
  
  const verified = verifyToken(token, TEST_SECRET);
  assert.strictEqual(verified, null, 'Expired token should be rejected');
});

test('verifyToken rejects tampered token', () => {
  const payload = { u: 'testuser', exp: Math.floor(Date.now() / 1000) + 3600, ver: 'v4', n: '12345678' };
  const token = encodeToken(payload, TEST_SECRET);
  
  // Tamper with token
  const tampered = token.slice(0, -5) + 'xxxxx';
  
  const verified = verifyToken(tampered, TEST_SECRET);
  assert.strictEqual(verified, null, 'Tampered token should be rejected');
});

test('verifyToken rejects token with wrong secret', () => {
  const payload = { u: 'testuser', exp: Math.floor(Date.now() / 1000) + 3600, ver: 'v4', n: '12345678' };
  const token = encodeToken(payload, TEST_SECRET);
  
  const verified = verifyToken(token, 'wrong-secret-key');
  assert.strictEqual(verified, null, 'Token with wrong secret should be rejected');
});

// Test: createTokenPair
test('createTokenPair creates both tokens', () => {
  const result = createTokenPair('testuser', 'admin', TEST_SECRET);
  
  assert(result.accessToken, 'Access token should be created');
  assert(result.refreshToken, 'Refresh token should be created');
  assert.strictEqual(typeof result.accessExp, 'number', 'Access exp should be number');
  assert.strictEqual(typeof result.refreshExp, 'number', 'Refresh exp should be number');
  assert(result.refreshExp > result.accessExp, 'Refresh token should expire after access token');
});

test('createTokenPair creates valid tokens', () => {
  const result = createTokenPair('testuser', 'admin', TEST_SECRET);
  
  const accessPayload = verifyToken(result.accessToken, TEST_SECRET);
  assert(accessPayload, 'Access token should be valid');
  assert.strictEqual(accessPayload.u, 'testuser', 'Access token username should match');
  assert.strictEqual(accessPayload.role, 'admin', 'Access token role should match');
  assert.strictEqual(accessPayload.ver, 'v4', 'Access token version should be v4');
  
  const refreshPayload = verifyToken(result.refreshToken, TEST_SECRET);
  assert(refreshPayload, 'Refresh token should be valid');
  assert.strictEqual(refreshPayload.u, 'testuser', 'Refresh token username should match');
  assert.strictEqual(refreshPayload.role, 'admin', 'Refresh token role should match');
  assert.strictEqual(refreshPayload.ver, 'v1', 'Refresh token version should be v1');
  assert(refreshPayload.jti, 'Refresh token should have JTI');
});

// Test: refreshAccessToken
test('refreshAccessToken creates new access token', () => {
  const { refreshToken } = createTokenPair('testuser', 'admin', TEST_SECRET);
  
  const result = refreshAccessToken(refreshToken, TEST_SECRET);
  assert(result, 'Refresh should succeed');
  assert(result.accessToken, 'New access token should be created');
  assert.strictEqual(typeof result.accessExp, 'number', 'Access exp should be number');
  assert.strictEqual(typeof result.accessTTL, 'number', 'Access TTL should be number');
  
  const newAccessPayload = verifyToken(result.accessToken, TEST_SECRET);
  assert(newAccessPayload, 'New access token should be valid');
  assert.strictEqual(newAccessPayload.u, 'testuser', 'Username should match');
  assert.strictEqual(newAccessPayload.ver, 'v4', 'Version should be v4');
});

test('refreshAccessToken rejects invalid refresh token', () => {
  const result = refreshAccessToken('invalid-token', TEST_SECRET);
  assert.strictEqual(result, null, 'Invalid refresh token should be rejected');
});

test('refreshAccessToken rejects access token (wrong version)', () => {
  const { accessToken } = createTokenPair('testuser', 'admin', TEST_SECRET);
  
  const result = refreshAccessToken(accessToken, TEST_SECRET);
  assert.strictEqual(result, null, 'Access token should not work for refresh');
});

// Test: parseCookies
test('parseCookies extracts v4 access cookie', () => {
  const headers = {
    cookie: `${COOKIE_V4_ACCESS}=token123; other=value`
  };
  
  const result = parseCookies(headers);
  assert.strictEqual(result.access, 'token123', 'Access token should be extracted');
});

test('parseCookies extracts v1 refresh cookie', () => {
  const headers = {
    cookie: `${COOKIE_V1_REFRESH}=token456; other=value`
  };
  
  const result = parseCookies(headers);
  assert.strictEqual(result.refresh, 'token456', 'Refresh token should be extracted');
});

test('parseCookies extracts legacy cookies', () => {
  const headers = {
    cookie: 'rc_admin_session_v3=token789; rc_admin_session_v2=token012; rc_admin_session=token345'
  };
  
  const result = parseCookies(headers);
  assert.strictEqual(result.legacy.v3, 'token789', 'Legacy v3 should be extracted');
  assert.strictEqual(result.legacy.v2, 'token012', 'Legacy v2 should be extracted');
  assert.strictEqual(result.legacy.v1, 'token345', 'Legacy v1 should be extracted');
});

// Test: verifySession
test('verifySession accepts valid access token', () => {
  const { accessToken } = createTokenPair('testuser', 'admin', TEST_SECRET);
  const headers = {
    cookie: `${COOKIE_V4_ACCESS}=${accessToken}`
  };
  
  const result = verifySession(headers, TEST_SECRET);
  assert.strictEqual(result.valid, true, 'Session should be valid');
  assert.strictEqual(result.payload.u, 'testuser', 'Username should match');
  assert.strictEqual(result.needsUpgrade, false, 'Should not need upgrade');
  assert(result.remainingTTL > 0, 'Should have remaining TTL');
});

test('verifySession indicates need for refresh when access expired', () => {
  // Create tokens with short access TTL
  const result = createTokenPair('testuser', 'admin', TEST_SECRET, { accessTTL: -10 });
  const headers = {
    cookie: `${COOKIE_V1_REFRESH}=${result.refreshToken}`
  };
  
  const sessionResult = verifySession(headers, TEST_SECRET);
  assert.strictEqual(sessionResult.valid, true, 'Session should still be valid via refresh');
  assert.strictEqual(sessionResult.needsRefresh, true, 'Should need refresh');
});

test('verifySession rejects when all tokens expired', () => {
  const result = createTokenPair('testuser', 'admin', TEST_SECRET, { 
    accessTTL: -10, 
    refreshTTL: -10 
  });
  const headers = {
    cookie: `${COOKIE_V4_ACCESS}=${result.accessToken}; ${COOKIE_V1_REFRESH}=${result.refreshToken}`
  };
  
  const sessionResult = verifySession(headers, TEST_SECRET);
  assert.strictEqual(sessionResult.valid, false, 'Session should be invalid');
});

// Test: serializeCookie
test('serializeCookie creates valid cookie string', () => {
  const cookie = serializeCookie('testCookie', 'testValue', {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 3600
  });
  
  assert(cookie.includes('testCookie=testValue'), 'Cookie should have name=value');
  assert(cookie.includes('HttpOnly'), 'Cookie should be HttpOnly');
  assert(cookie.includes('Secure'), 'Cookie should be Secure');
  assert(cookie.includes('SameSite=Lax'), 'Cookie should have SameSite');
  assert(cookie.includes('Path=/'), 'Cookie should have Path');
  assert(cookie.includes('Max-Age=3600'), 'Cookie should have Max-Age');
});

// Test: createTokenCookies
test('createTokenCookies creates both cookie headers', () => {
  const { accessToken, refreshToken, accessTTL, refreshTTL } = createTokenPair('testuser', 'admin', TEST_SECRET);
  
  const cookies = createTokenCookies(accessToken, refreshToken, accessTTL, refreshTTL);
  assert.strictEqual(cookies.length, 2, 'Should create 2 cookies');
  assert(cookies[0].includes(COOKIE_V4_ACCESS), 'First cookie should be access');
  assert(cookies[1].includes(COOKIE_V1_REFRESH), 'Second cookie should be refresh');
  assert(cookies[0].includes('HttpOnly'), 'Access cookie should be HttpOnly');
  assert(cookies[1].includes('HttpOnly'), 'Refresh cookie should be HttpOnly');
});

// Test: createErrorResponse
test('createErrorResponse creates structured error', () => {
  const response = createErrorResponse('TEST_ERROR', 'Test error message', true, 400);
  
  assert.strictEqual(response.statusCode, 400, 'Status code should match');
  assert.strictEqual(response.headers['Content-Type'], 'application/json', 'Content-Type should be JSON');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.code, 'TEST_ERROR', 'Error code should match');
  assert.strictEqual(body.message, 'Test error message', 'Error message should match');
  assert.strictEqual(body.retryable, true, 'Retryable should match');
});

// Test: getCookie
test('getCookie extracts cookie value', () => {
  const header = 'cookie1=value1; cookie2=value2; cookie3=value3';
  assert.strictEqual(getCookie(header, 'cookie1'), 'value1', 'Should extract first cookie');
  assert.strictEqual(getCookie(header, 'cookie2'), 'value2', 'Should extract middle cookie');
  assert.strictEqual(getCookie(header, 'cookie3'), 'value3', 'Should extract last cookie');
});

test('getCookie handles missing cookie', () => {
  const header = 'cookie1=value1; cookie2=value2';
  assert.strictEqual(getCookie(header, 'missing'), '', 'Should return empty string for missing cookie');
});

test('getCookie handles cookie with = in value', () => {
  const header = 'cookie1=value=with=equals';
  assert.strictEqual(getCookie(header, 'cookie1'), 'value=with=equals', 'Should handle = in value');
});

// Test: b64url encoding/decoding
test('b64url encodes and decodes correctly', () => {
  const data = Buffer.from('test data with special chars: +/=', 'utf8');
  const encoded = b64url(data);
  
  assert(!encoded.includes('+'), 'Encoded should not contain +');
  assert(!encoded.includes('/'), 'Encoded should not contain /');
  assert(!encoded.includes('='), 'Encoded should not contain =');
  
  const decoded = b64urlDecode(encoded);
  assert.strictEqual(decoded.toString('utf8'), data.toString('utf8'), 'Decoded should match original');
});

console.log('\n✓ All tests passed!');
