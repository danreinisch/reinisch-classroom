// Unit tests for netlify/functions/student-login.js
// Tests server-side password verification without requiring live Supabase
// Run with: node tests/student-login-function.test.cjs

const assert = require('assert');

// Successful login now creates a signed student session cookie.
// Set a test-only signing secret before student-login.js is required.
process.env.SESSION_SECRET =
  'test-only-student-login-session-secret';

// Mock the _lib modules before requiring the handler
const mockSupabaseConfig = {
  url: 'https://test.supabase.co',
  key: 'test-key-1234567890'
};

const mockHttpLib = {
  generateRequestId: () => 'test-request-id',
  jsonResponse: (event, status, body, headers = {}, requestId = '') => ({
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...headers
    },
    body: JSON.stringify(body)
  }),
  handleCorsPreFlight: (event, methods, headers) => ({
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': methods.join(', '),
      'Access-Control-Allow-Headers': headers.join(', ')
    },
    body: ''
  }),
  getSecurityHeaders: () => ({}),
  getCorsHeaders: () => ({
    'Access-Control-Allow-Origin': '*'
  })
};

const mockSupaLib = {
  getSupabaseConfig: () => mockSupabaseConfig,
  parseBooleanRpcResponse: (response) => {
    // Handle array response from PostgREST
    if (Array.isArray(response)) {
      return response.length > 0 ? !!response[0] : false;
    }
    // Handle direct boolean
    return !!response;
  }
};

// Mock the require calls
require.cache[require.resolve('../netlify/functions/_lib/http')] = {
  exports: mockHttpLib
};

require.cache[require.resolve('../netlify/functions/_lib/supa')] = {
  exports: mockSupaLib
};

// Global fetch mock
let mockFetchResponse = null;
global.fetch = async (url, options) => {
  if (!mockFetchResponse) {
    throw new Error('No mock response configured');
  }
  return mockFetchResponse();
};

// Now require the handler
const { handler } = require('../netlify/functions/student-login');

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (e) {
      console.error(`✗ ${name}`);
      console.error('  Error:', e.message);
      if (e.stack) {
        console.error('  Stack:', e.stack.split('\n').slice(1, 4).join('\n'));
      }
      process.exit(1);
    }
  };
}

console.log('Running student-login function unit tests...\n');

// Test: CORS preflight
test('handles CORS preflight request', async () => {
  const event = {
    httpMethod: 'OPTIONS',
    headers: {}
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 204, 'Should return 204 for OPTIONS');
  assert(response.headers['Access-Control-Allow-Methods'], 'Should have Allow-Methods header');
})();

// Test: Method validation
test('rejects non-POST requests', async () => {
  const event = {
    httpMethod: 'GET',
    headers: {}
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 405, 'Should return 405 for GET');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.error, 'Method Not Allowed', 'Should have error message');
})();

// Test: Supabase not configured - SKIPPED
// Note: This test is skipped because getSupabaseConfig is called at module load time,
// so we can't override it after the module is loaded. This scenario is tested in
// integration tests instead (student-portal-no-supabase.spec.js)
test('SKIPPED: returns 503 when Supabase is not configured', async () => {
  console.log('  (Skipped - tested in integration tests)');
})();

// Test: Invalid JSON body
test('returns 400 for invalid JSON body', async () => {
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: 'not-valid-json'
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 400, 'Should return 400 for invalid JSON');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false, 'Should have ok: false');
  assert(body.error.includes('Invalid request body'), 'Should mention invalid body');
})();

// Test: Missing code
test('returns 400 when code is missing', async () => {
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ password: 'test123' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 400, 'Should return 400 when code missing');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false, 'Should have ok: false');
  assert(body.error.includes('code'), 'Should mention code is required');
})();

// Test: Missing password
test('returns 400 when password is missing', async () => {
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ code: 'S001' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 400, 'Should return 400 when password missing');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false, 'Should have ok: false');
  assert(body.error.includes('Password'), 'Should mention password is required');
})();

// Test: Empty code
test('returns 400 when code is empty', async () => {
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ code: '  ', password: 'test123' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 400, 'Should return 400 when code is empty');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false, 'Should have ok: false');
})();

// Test: Successful login
test('returns 200 with valid credentials', async () => {
  // Mock successful Supabase RPC response
  mockFetchResponse = () => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([true]) // PostgREST returns array
  });
  
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ code: 'S001', password: 'validpass' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 200, 'Should return 200 for valid credentials');
  assert(
    response.headers &&
      response.headers['Set-Cookie'],
    'Successful login should return a signed student session cookie'
  );
  assert(
    response.headers['Set-Cookie'].includes('sc='),
    'Successful login should set the sc student-session cookie'
  );
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, true, 'Should have ok: true');
  assert.strictEqual(body.code, 'S001', 'Should return normalized code');
  assert.strictEqual(body.name, 'S001', 'Should return code as name');
})();

// Test: Invalid credentials
test('returns 401 with invalid credentials', async () => {
  // Mock failed Supabase RPC response
  mockFetchResponse = () => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([false]) // PostgREST returns array with false
  });
  
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ code: 'S001', password: 'wrongpass' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 401, 'Should return 401 for invalid credentials');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false, 'Should have ok: false');
  assert(body.error.includes('Invalid'), 'Should mention invalid credentials');
})();

// Test: Supabase server error
test('returns 503 when Supabase returns server error', async () => {
  // Mock Supabase server error
  mockFetchResponse = () => Promise.resolve({
    ok: false,
    status: 500,
    text: () => Promise.resolve('Internal server error')
  });
  
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ code: 'S001', password: 'test123' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 503, 'Should return 503 for Supabase server error');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false, 'Should have ok: false');
  assert(body.error.includes('unavailable'), 'Should mention service unavailable');
})();

// Test: Inactive account
test('returns 403 for inactive account', async () => {
  // Mock Supabase response with inactive account error
  mockFetchResponse = () => Promise.resolve({
    ok: false,
    status: 400,
    text: () => Promise.resolve('Account inactive')
  });
  
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ code: 'S002', password: 'test123' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 403, 'Should return 403 for inactive account');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false, 'Should have ok: false');
  assert(body.error.includes('inactive'), 'Should mention account inactive');
})();

// Test: Lowercase code normalization
test('normalizes lowercase code to uppercase', async () => {
  // Mock successful Supabase RPC response
  mockFetchResponse = () => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([true])
  });
  
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ code: 's001', password: 'test123' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 200, 'Should return 200');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.code, 'S001', 'Should normalize code to uppercase');
})();

// Test: Network error handling
test('returns 500 for network errors', async () => {
  // Mock network error
  mockFetchResponse = () => Promise.reject(new Error('Network error'));
  
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ code: 'S001', password: 'test123' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.statusCode, 500, 'Should return 500 for network error');
  
  const body = JSON.parse(response.body);
  assert.strictEqual(body.ok, false, 'Should have ok: false');
  assert(body.error.includes('failed'), 'Should mention authentication failed');
})();

// Test: Content-Type header
test('sets Content-Type to application/json', async () => {
  mockFetchResponse = () => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([true])
  });
  
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ code: 'S001', password: 'test123' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.headers['Content-Type'], 'application/json', 'Should set Content-Type');
})();

// Test: Cache-Control header
test('sets Cache-Control to no-store', async () => {
  mockFetchResponse = () => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([false])
  });
  
  const event = {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ code: 'S001', password: 'wrong' })
  };
  
  const response = await handler(event);
  assert.strictEqual(response.headers['Cache-Control'], 'no-store', 'Should set Cache-Control');
})();

console.log('\n✓ All student-login function tests passed!');
