// Unit tests for netlify/functions/teacher-ai-report-narrative.js
// Run with: node tests/teacher-ai-report-narrative.test.cjs

'use strict';

const assert = require('assert');

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockHttpLib = {
  generateRequestId: () => 'test-request-id',
  jsonResponse: (_event, statusCode, body, _headers = {}, _requestId = '') => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  handleCorsPreFlight: (_event, methods, headers) => ({
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': methods.join(', '),
      'Access-Control-Allow-Headers': (headers || []).join(', '),
    },
    body: '',
  }),
  validateBodySize: (_body, _maxKb) => ({ valid: true }),
  safeJsonParse: (body) => {
    if (!body) return { ok: false, error: 'Empty request body' };
    try {
      return { ok: true, data: JSON.parse(body) };
    } catch (e) {
      return { ok: false, error: 'JSON parse error' };
    }
  },
};

const mockAuthLib = {
  requireTeacher: (event, _secret) => {
    const cookie = (event.headers && event.headers.cookie) || '';
    if (cookie.includes('tc=valid')) {
      return { ok: true, user: { username: 'teacher1' } };
    }
    return { ok: false };
  },
};

// Register mocks in require.cache before loading the handler
require.cache[require.resolve('../netlify/functions/_lib/http')] = {
  id: require.resolve('../netlify/functions/_lib/http'),
  filename: require.resolve('../netlify/functions/_lib/http'),
  loaded: true,
  exports: mockHttpLib,
};

require.cache[require.resolve('../netlify/functions/_lib/auth')] = {
  id: require.resolve('../netlify/functions/_lib/auth'),
  filename: require.resolve('../netlify/functions/_lib/auth'),
  loaded: true,
  exports: mockAuthLib,
};

// Set environment variables before loading module
process.env.SESSION_SECRET = 'test-session-secret-32-chars-long!!';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-fake-key';

const { handler, _sanitizeForPrompt: sanitizeForPrompt } = require('../netlify/functions/teacher-ai-report-narrative');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      cookie: 'tc=valid',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      studentCode: 'STU001',
      studentName: 'Alex Smith',
      goals: [
        {
          code: 'ELA.1.A',
          description: 'Student will correctly identify inference in reading passages',
          area: 'Reading',
          baseline: '30%',
          target: '80%',
          currentValue: 65,
          trend: 'up',
          dataPoints: [
            { date: '2025-01-10', value: 45 },
            { date: '2025-01-17', value: 55 },
            { date: '2025-01-24', value: 65 },
          ],
        },
      ],
      assignments: { total: 10, completed: 8, averageScore: 72.5 },
      quarter: 'Q3 2024-2025',
      audience: 'admin',
    }),
    ...overrides,
  };
}

function makeAnthropicOkResponse(narrative) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      content: [{ type: 'text', text: narrative }],
    }),
    text: () => Promise.resolve(''),
  });
}

function makeAnthropicErrorResponse(status, text) {
  return Promise.resolve({
    ok: false,
    status: status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(text || 'Internal Server Error'),
  });
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  console.log('Running teacher-ai-report-narrative unit tests...\n');
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (e) {
      console.error(`✗ ${name}`);
      console.error('  Error:', e.message);
      if (e.stack) console.error('  Stack:', e.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
  }
  console.log('\n✓ All teacher-ai-report-narrative tests passed!');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('CORS preflight returns 204', async () => {
  const res = await handler({ httpMethod: 'OPTIONS', headers: {}, body: '' });
  assert.strictEqual(res.statusCode, 204);
});

test('Rejects non-POST with 405', async () => {
  const res = await handler({ httpMethod: 'GET', headers: {}, body: '' });
  assert.strictEqual(res.statusCode, 405);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('Rejects missing auth with 401', async () => {
  const event = makeEvent({ headers: { cookie: '', 'content-type': 'application/json' } });
  const res = await handler(event);
  assert.strictEqual(res.statusCode, 401);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.toLowerCase().includes('unauthorized'));
});

test('Rejects missing studentCode with 400', async () => {
  global.fetch = async () => makeAnthropicOkResponse('test narrative');
  const event = makeEvent({
    body: JSON.stringify({
      studentName: 'Alex',
      goals: [{ code: 'ELA.1.A', description: 'desc', area: 'Reading', baseline: '30%', target: '80%' }],
      quarter: 'Q3',
      audience: 'admin',
    }),
  });
  const res = await handler(event);
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.toLowerCase().includes('studentcode'));
});

test('Rejects missing goals array with 400', async () => {
  global.fetch = async () => makeAnthropicOkResponse('test narrative');
  const event = makeEvent({
    body: JSON.stringify({
      studentCode: 'STU001',
      studentName: 'Alex',
      goals: [],
      quarter: 'Q3',
      audience: 'admin',
    }),
  });
  const res = await handler(event);
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.toLowerCase().includes('goals'));
});

test('Rejects missing goals field with 400', async () => {
  global.fetch = async () => makeAnthropicOkResponse('test narrative');
  const event = makeEvent({
    body: JSON.stringify({
      studentCode: 'STU001',
      studentName: 'Alex',
      quarter: 'Q3',
      audience: 'admin',
    }),
  });
  const res = await handler(event);
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('Returns narrative on successful Anthropic API response', async () => {
  const expectedNarrative = 'During Q3 2024-2025, Alex demonstrated consistent growth in reading inference skills (ELA.1.A), improving from 45% to 65% accuracy across 3 data collection opportunities.';
  global.fetch = async () => makeAnthropicOkResponse(expectedNarrative);

  const res = await handler(makeEvent());
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.narrative, expectedNarrative);
});

test('Returns 500 when Anthropic API returns error status', async () => {
  global.fetch = async () => makeAnthropicErrorResponse(500, 'Internal Server Error');

  const res = await handler(makeEvent());
  assert.strictEqual(res.statusCode, 500);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error);
});

test('Returns 500 when Anthropic API returns empty content', async () => {
  global.fetch = async () => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ content: [] }),
    text: () => Promise.resolve(''),
  });

  const res = await handler(makeEvent());
  assert.strictEqual(res.statusCode, 500);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('Handles Anthropic API timeout gracefully with 504', async () => {
  global.fetch = async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };

  const res = await handler(makeEvent());
  assert.strictEqual(res.statusCode, 504);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.toLowerCase().includes('timed out'));
});

test('Handles Anthropic API network failure gracefully with 500', async () => {
  global.fetch = async () => {
    throw new Error('Network connection refused');
  };

  const res = await handler(makeEvent());
  assert.strictEqual(res.statusCode, 500);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('Sanitizes input: removes control characters from studentCode', async () => {
  global.fetch = async (url, opts) => {
    // Capture the request body to verify sanitization
    const reqBody = JSON.parse(opts.body);
    const msg = reqBody.messages[0].content;
    // Control characters should not appear in the prompt
    assert.ok(!msg.includes('\x00'), 'NUL character should be stripped');
    assert.ok(!msg.includes('\x01'), 'SOH character should be stripped');
    assert.ok(!msg.includes('\x1F'), 'US character should be stripped');
    return makeAnthropicOkResponse('sanitized narrative');
  };

  const event = makeEvent({
    body: JSON.stringify({
      studentCode: 'STU\x00001\x01',
      studentName: 'Alex\x1FSmith',
      goals: [
        {
          code: 'ELA\x001',
          description: 'desc\x01with\x1Fcontrol\x00chars',
          area: 'Reading',
          baseline: '30%',
          target: '80%',
          currentValue: 65,
          trend: 'up',
          dataPoints: [],
        },
      ],
      quarter: 'Q3\x002024',
      audience: 'admin',
    }),
  });

  const res = await handler(event);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
});

test('sanitizeForPrompt removes control characters', () => {
  const input = 'Hello\x00World\x01Test\x1FEnd';
  const result = sanitizeForPrompt(input, 500);
  assert.ok(!result.includes('\x00'), 'NUL should be stripped');
  assert.ok(!result.includes('\x01'), 'SOH should be stripped');
  assert.ok(!result.includes('\x1F'), 'US should be stripped');
  assert.ok(result.includes('Hello'), 'printable text should remain');
});

test('sanitizeForPrompt truncates to maxLen', () => {
  const input = 'a'.repeat(1000);
  const result = sanitizeForPrompt(input, 100);
  assert.strictEqual(result.length, 100);
});

test('sanitizeForPrompt handles null and undefined', () => {
  assert.strictEqual(sanitizeForPrompt(null, 100), '');
  assert.strictEqual(sanitizeForPrompt(undefined, 100), '');
});

test('Returns 415 for wrong Content-Type', async () => {
  const event = makeEvent({
    headers: {
      cookie: 'tc=valid',
      'content-type': 'text/plain',
    },
  });
  const res = await handler(event);
  assert.strictEqual(res.statusCode, 415);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, false);
});

test('parent audience results in a successful request', async () => {
  global.fetch = async () => makeAnthropicOkResponse('Parent-friendly narrative for Alex.');
  const event = makeEvent({
    body: JSON.stringify({
      studentCode: 'STU001',
      studentName: 'Alex Smith',
      goals: [
        {
          code: 'ELA.1.A',
          description: 'Student will correctly identify inference in reading passages',
          area: 'Reading',
          baseline: '30%',
          target: '80%',
          currentValue: 65,
          trend: 'up',
          dataPoints: [],
        },
      ],
      assignments: { total: 10, completed: 8, averageScore: 72.5 },
      quarter: 'Q3 2024-2025',
      audience: 'parent',
    }),
  });
  const res = await handler(event);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.ok(body.narrative);
});

test('Uses first name only in prompt (PII protection)', async () => {
  global.fetch = async (url, opts) => {
    const reqBody = JSON.parse(opts.body);
    const msg = reqBody.messages[0].content;
    // First name should appear
    assert.ok(msg.includes('Alex'), 'First name should appear in prompt');
    // Last name should NOT appear (PII protection)
    assert.ok(!msg.includes('Johnson'), 'Last name should not appear in prompt');
    return makeAnthropicOkResponse('Narrative text.');
  };

  const event = makeEvent({
    body: JSON.stringify({
      studentCode: 'STU001',
      studentName: 'Alex Johnson',
      goals: [
        {
          code: 'ELA.1.A',
          description: 'desc',
          area: 'Reading',
          baseline: '30%',
          target: '80%',
          currentValue: 65,
          trend: 'up',
          dataPoints: [],
        },
      ],
      quarter: 'Q3 2024-2025',
      audience: 'admin',
    }),
  });
  const res = await handler(event);
  assert.strictEqual(res.statusCode, 200);
});

runAll();
