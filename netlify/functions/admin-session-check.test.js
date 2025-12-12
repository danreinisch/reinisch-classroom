// Unit tests for admin-session-check endpoint
// Run with: node netlify/functions/admin-session-check.test.js

const assert = require('assert');

// Mock environment variables
process.env.ADMIN_SESSION_SECRET = 'test-secret-key-for-unit-testing-minimum-32-chars';

// Import the handler
const { handler } = require('./admin-session-check');

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error('  Error:', e.message);
    process.exit(1);
  }
}

console.log('Running admin-session-check unit tests...\n');

// Helper to create mock event
function createEvent(options = {}) {
  return {
    httpMethod: options.method || 'GET',
    headers: options.headers || {},
    ...options
  };
}

async function runTests() {
  // Test: Missing headers object
  await test('Returns 400 when headers object is missing', async () => {
    const event = { httpMethod: 'GET' }; // No headers
    const response = await handler(event);
    
    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'INVALID_REQUEST');
  });

  // Test: Missing ADMIN_SESSION_SECRET
  await test('Returns 503 when ADMIN_SESSION_SECRET is missing', async () => {
    const originalSecret = process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_SESSION_SECRET = '';
    
    const event = createEvent();
    const response = await handler(event);
    
    process.env.ADMIN_SESSION_SECRET = originalSecret;
    
    assert.strictEqual(response.statusCode, 503);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'SERVER_NOT_CONFIGURED');
  });

  // Test: No session cookie
  await test('Returns 401 when no session cookie is present', async () => {
    const event = createEvent({
      headers: { cookie: '' }
    });
    const response = await handler(event);
    
    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'NO_VALID_SESSION');
  });

  // Test: Valid v4 access token
  await test('Returns 200 for valid v4 access token', async () => {
    const { createTokenPair } = require('./_lib/token-utils');
    const secret = process.env.ADMIN_SESSION_SECRET;
    const tokens = createTokenPair('testuser', 'admin', secret);
    
    const event = createEvent({
      headers: {
        cookie: `rc_admin_session_v4=${tokens.accessToken}`
      }
    });
    
    const response = await handler(event);
    
    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.needsUpgrade, undefined);
  });

  // Test: Valid refresh token (access expired)
  await test('Indicates refresh needed when access expired but refresh valid', async () => {
    const { encodeToken } = require('./_lib/token-utils');
    const secret = process.env.ADMIN_SESSION_SECRET;
    
    const now = Math.floor(Date.now() / 1000);
    
    // Create an expired access token (expired 1 second ago)
    const accessPayload = {
      u: 'testuser',
      role: 'admin',
      exp: now - 1,
      ver: 'v4',
      n: '12345678',
      iat: now - 3600
    };
    
    // Create a valid refresh token
    const refreshPayload = {
      u: 'testuser',
      role: 'admin',
      exp: now + 86400,
      ver: 'v1',
      jti: 'test-jti-12345678',
      iat: now - 3600
    };
    
    const accessToken = encodeToken(accessPayload, secret);
    const refreshToken = encodeToken(refreshPayload, secret);
    
    const event = createEvent({
      headers: {
        cookie: `rc_admin_session_v4=${accessToken}; rc_admin_refresh_v1=${refreshToken}`
      }
    });
    
    const response = await handler(event);
    
    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.needsRefresh, true);
  });

  // Test: Legacy v3 token (needs upgrade)
  await test('Indicates upgrade needed for legacy v3 token', async () => {
    const { encodeToken } = require('./_lib/token-utils');
    const secret = process.env.ADMIN_SESSION_SECRET;
    
    const now = Math.floor(Date.now() / 1000);
    const legacyPayload = {
      u: 'legacyuser',
      role: 'teacher',
      exp: now + 3600,
      ver: 'v3'
    };
    
    const legacyToken = encodeToken(legacyPayload, secret);
    
    const event = createEvent({
      headers: {
        cookie: `rc_admin_session_v3=${legacyToken}`
      }
    });
    
    const response = await handler(event);
    
    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.needsUpgrade, true);
    assert.strictEqual(body.legacyVersion, 'v3');
  });

  // Test: Cache-Control header is set
  await test('Sets Cache-Control: no-store header', async () => {
    const event = createEvent({
      headers: { cookie: '' }
    });
    const response = await handler(event);
    
    assert.strictEqual(response.headers['Cache-Control'], 'no-store');
  });

  // Test: Content-Type is application/json
  await test('Sets Content-Type: application/json header', async () => {
    const event = createEvent({
      headers: { cookie: '' }
    });
    const response = await handler(event);
    
    assert.strictEqual(response.headers['Content-Type'], 'application/json');
  });

  console.log('\n✓ All admin-session-check tests passed!');
}

runTests();
