// Unit tests for sanitizeForPrompt and sanitizeSourceForPrompt in teacher-ai-builder.js
// Covers Issues #15 (preserve newlines in source) and #16 (regression guard on sanitizeForPrompt).
// Run with: node tests/teacher-ai-builder-sanitize.test.cjs

'use strict';

const assert = require('assert');

// ── Mock setup ────────────────────────────────────────────────────────────────

const mockHttpLib = {
  generateRequestId: () => 'test-req-id',
  jsonResponse: (_event, status, body) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  handleCorsPreFlight: (_event, methods, headers) => ({
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Methods': methods.join(', '),
      'Access-Control-Allow-Headers': (headers || []).join(', '),
    },
    body: '',
  }),
  validateBodySize: (_body, _maxKb) => ({ valid: true }),
  safeJsonParse: (str) => {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

// Inject mocks into require cache before loading the module
require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = {
  exports: { requireTeacher: () => ({ ok: true, user: { username: 'test' } }) },
};
// Mock supa and ai-builder-rules to avoid network calls
require.cache[require.resolve('../netlify/functions/_lib/supa')] = {
  exports: {
    rest: async () => ({ ok: true, status: 200 }),
    jsonRes: async () => ({ ok: true, data: [] }),
  },
};
require.cache[require.resolve('../netlify/functions/_lib/ai-builder-rules')] = {
  exports: { buildSystemPrompt: () => 'mock system prompt' },
};

process.env.SESSION_SECRET = 'test-session-secret-32-chars-long!!';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-fake-key';

// Load the module — test exports are attached for direct unit testing
const { _sanitizeForPrompt: sanitizeForPrompt, _sanitizeSourceForPrompt: sanitizeSourceForPrompt } =
  require('../netlify/functions/teacher-ai-builder');

// ── Test runner ───────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  console.log('Running teacher-ai-builder sanitize unit tests...\n');
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
  console.log('\n✓ All teacher-ai-builder-sanitize tests passed!');
}

// ── Tests for sanitizeSourceForPrompt ────────────────────────────────────────

test('sanitizeSourceForPrompt preserves \\n newlines', () => {
  const input = 'Paragraph one.\nParagraph two.\nParagraph three.';
  const result = sanitizeSourceForPrompt(input);
  assert.ok(result.includes('\n'), 'Expected \\n to be preserved');
  assert.strictEqual(result, input);
});

test('sanitizeSourceForPrompt preserves \\t tabs', () => {
  const input = 'Column A\tColumn B\tColumn C';
  const result = sanitizeSourceForPrompt(input);
  assert.ok(result.includes('\t'), 'Expected \\t to be preserved');
  assert.strictEqual(result, input);
});

test('sanitizeSourceForPrompt normalizes \\r\\n to \\n', () => {
  const input = 'Line one\r\nLine two\r\nLine three';
  const result = sanitizeSourceForPrompt(input);
  assert.ok(!result.includes('\r'), 'Expected \\r to be removed');
  assert.ok(result.includes('\n'), 'Expected \\n to be present');
  assert.strictEqual(result, 'Line one\nLine two\nLine three');
});

test('sanitizeSourceForPrompt strips dangerous control characters (\\x00, \\x0B)', () => {
  const input = 'Hello\x00World\x0BGoodbye';
  const result = sanitizeSourceForPrompt(input);
  assert.ok(!result.includes('\x00'), 'Expected NUL (\\x00) to be stripped');
  assert.ok(!result.includes('\x0B'), 'Expected VT (\\x0B) to be stripped');
  assert.strictEqual(result, 'HelloWorldGoodbye');
});

test('sanitizeSourceForPrompt truncates to maxLen', () => {
  const input = 'a'.repeat(500);
  const result = sanitizeSourceForPrompt(input, 100);
  assert.strictEqual(result.length, 100);
});

test('sanitizeSourceForPrompt returns empty string for null', () => {
  assert.strictEqual(sanitizeSourceForPrompt(null), '');
});

test('sanitizeSourceForPrompt returns empty string for undefined', () => {
  assert.strictEqual(sanitizeSourceForPrompt(undefined), '');
});

// ── Regression guard: sanitizeForPrompt still strips \\n and \\t ─────────────

test('sanitizeForPrompt (regression) still strips \\n', () => {
  const input = 'Hello\nWorld';
  const result = sanitizeForPrompt(input);
  assert.ok(!result.includes('\n'), 'Expected \\n to be stripped by sanitizeForPrompt');
  assert.strictEqual(result, 'Hello World');
});

test('sanitizeForPrompt (regression) still strips \\t', () => {
  const input = 'Hello\tWorld';
  const result = sanitizeForPrompt(input);
  assert.ok(!result.includes('\t'), 'Expected \\t to be stripped by sanitizeForPrompt');
  assert.strictEqual(result, 'Hello World');
});

runAll();
