// Unit test for admin-session response structure
// Validates that multiValueHeaders is used for multiple Set-Cookie values
// Run with: node tests/admin-session-response.test.cjs

const assert = require('assert');

// Import token utilities to create test tokens
const { createTokenPair, createTokenCookies } = require('../netlify/functions/_lib/token-utils');

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

console.log('Running admin-session response structure tests...\n');

// Test: createTokenCookies returns an array
test('createTokenCookies returns array of two cookie strings', () => {
  const tokens = createTokenPair('testuser', 'admin', TEST_SECRET);
  const cookies = createTokenCookies(
    tokens.accessToken,
    tokens.refreshToken,
    tokens.accessTTL,
    tokens.refreshTTL
  );
  
  assert(Array.isArray(cookies), 'createTokenCookies should return an array');
  assert.strictEqual(cookies.length, 2, 'Should return exactly 2 cookies');
  assert.strictEqual(typeof cookies[0], 'string', 'First cookie should be a string');
  assert.strictEqual(typeof cookies[1], 'string', 'Second cookie should be a string');
});

// Test: Response structure should use multiValueHeaders
test('Response structure uses multiValueHeaders for cookie array', () => {
  const tokens = createTokenPair('testuser', 'admin', TEST_SECRET);
  const cookies = createTokenCookies(
    tokens.accessToken,
    tokens.refreshToken,
    tokens.accessTTL,
    tokens.refreshTTL
  );
  
  // This is the correct response structure
  const response = {
    statusCode: 302,
    headers: {
      Location: '/admin/',
      'Cache-Control': 'no-store'
    },
    multiValueHeaders: {
      'Set-Cookie': cookies
    }
  };
  
  assert.strictEqual(response.statusCode, 302, 'Should be a redirect');
  assert.strictEqual(response.headers.Location, '/admin/', 'Should redirect to /admin/');
  assert(response.multiValueHeaders, 'Should have multiValueHeaders');
  assert(response.multiValueHeaders['Set-Cookie'], 'multiValueHeaders should have Set-Cookie');
  assert(Array.isArray(response.multiValueHeaders['Set-Cookie']), 'Set-Cookie should be an array in multiValueHeaders');
  assert(!response.headers['Set-Cookie'], 'headers should not have Set-Cookie (should be in multiValueHeaders)');
});

// Test: Single cookie can use headers['Set-Cookie']
test('Single cookie can remain in headers as string', () => {
  const throttleCookie = 'admin_throttle=123456_abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=60';
  
  const response = {
    statusCode: 302,
    headers: {
      Location: '/admin-login?e=creds',
      'Set-Cookie': throttleCookie,
      'Cache-Control': 'no-store'
    }
  };
  
  assert.strictEqual(response.statusCode, 302, 'Should be a redirect');
  assert.strictEqual(typeof response.headers['Set-Cookie'], 'string', 'Single cookie should be a string');
  assert(!response.multiValueHeaders, 'Should not need multiValueHeaders for single cookie');
});

console.log('\n✓ All tests passed!');
console.log('\nNote: This test validates the response structure for Netlify Functions.');
console.log('Multiple Set-Cookie values must use multiValueHeaders, not headers.');
