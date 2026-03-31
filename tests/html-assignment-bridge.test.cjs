// Unit tests for html-assignment-bridge logic
// Run with: node tests/html-assignment-bridge.test.cjs

'use strict';

const assert = require('assert');

// ── Inline the pure logic from html-assignment-bridge.js ─────────────────────
// (The module uses ES-module syntax so we mirror the validation helper here.)

function validatePayload(data, expectedInstanceId) {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'payload must be an object' };
  }

  if (data.type !== 'rc-assignment-submit' && data.type !== 'rc-assignment-autosave') {
    return { valid: false, reason: `unexpected type: ${data.type}` };
  }

  if (data.instance_id !== undefined && data.instance_id !== expectedInstanceId) {
    return { valid: false, reason: 'instance_id mismatch' };
  }

  if (!data.answers || typeof data.answers !== 'object' || Array.isArray(data.answers)) {
    return { valid: false, reason: 'answers must be a non-array object' };
  }

  if (Object.keys(data.answers).length === 0) {
    return { valid: false, reason: 'answers object is empty' };
  }

  return { valid: true };
}

const INSTANCE_ID = 'test-instance-uuid-1234';

// ── Payload validation ────────────────────────────────────────────────────────

console.log('--- validatePayload ---');

{
  // Valid minimal payload (no instance_id field)
  const result = validatePayload(
    { type: 'rc-assignment-submit', answers: { Q1: 'B' } },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, true, 'valid minimal payload should pass');
  console.log('✓ valid minimal payload passes');
}

{
  // Valid payload with matching instance_id
  const result = validatePayload(
    { type: 'rc-assignment-submit', instance_id: INSTANCE_ID, answers: { Q1: 'B', Q2: 'true' } },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, true, 'valid payload with matching instance_id should pass');
  console.log('✓ valid payload with matching instance_id passes');
}

{
  // Wrong type field
  const result = validatePayload(
    { type: 'rc-wrong-type', answers: { Q1: 'A' } },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('unexpected type'), 'reason should mention unexpected type');
  console.log('✓ wrong type field is rejected');
}

{
  // Missing type field
  const result = validatePayload({ answers: { Q1: 'A' } }, INSTANCE_ID);
  assert.strictEqual(result.valid, false);
  console.log('✓ missing type field is rejected');
}

{
  // Missing answers field
  const result = validatePayload({ type: 'rc-assignment-submit' }, INSTANCE_ID);
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('answers'), 'reason should mention answers');
  console.log('✓ missing answers field is rejected');
}

{
  // Empty answers object
  const result = validatePayload(
    { type: 'rc-assignment-submit', answers: {} },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('empty'), 'reason should say answers is empty');
  console.log('✓ empty answers object is rejected');
}

{
  // answers is an array (invalid)
  const result = validatePayload(
    { type: 'rc-assignment-submit', answers: ['A', 'B'] },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('answers'), 'reason should mention answers');
  console.log('✓ array answers is rejected');
}

{
  // instance_id mismatch
  const result = validatePayload(
    { type: 'rc-assignment-submit', instance_id: 'different-uuid', answers: { Q1: 'A' } },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('instance_id'), 'reason should mention instance_id');
  console.log('✓ instance_id mismatch is rejected');
}

{
  // null data
  const result = validatePayload(null, INSTANCE_ID);
  assert.strictEqual(result.valid, false);
  console.log('✓ null payload is rejected');
}

{
  // Non-object data
  const result = validatePayload('hello', INSTANCE_ID);
  assert.strictEqual(result.valid, false);
  console.log('✓ string payload is rejected');
}

// ── Multi-answer payloads ──────────────────────────────────────────────────────

console.log('--- multi-answer payloads ---');
{
  const answers = { Q1: 'A', Q2: 'false', Q3: 'Some written response' };
  const result = validatePayload(
    { type: 'rc-assignment-submit', answers },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, true, 'multi-answer payload should be valid');
  assert.strictEqual(Object.keys(answers).length, 3);
  console.log('✓ multi-answer payload with MCQ, boolean, and constructed passes');
}

{
  // Optional scores field does not affect validity
  const result = validatePayload(
    {
      type: 'rc-assignment-submit',
      answers: { Q1: 'B' },
      scores: { correct: 1, total: 1 },
    },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, true, 'optional scores field should not invalidate payload');
  console.log('✓ optional scores field is ignored in validation');
}

// ── rc-assignment-autosave type ───────────────────────────────────────────────

console.log('--- rc-assignment-autosave ---');

{
  // Valid autosave payload (no instance_id field)
  const result = validatePayload(
    { type: 'rc-assignment-autosave', answers: { q1_1: '2' } },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, true, 'valid autosave payload should pass');
  console.log('✓ valid autosave payload passes');
}

{
  // Valid autosave payload with matching instance_id
  const result = validatePayload(
    { type: 'rc-assignment-autosave', instance_id: INSTANCE_ID, answers: { q1_1: '2', q1_2: '1' } },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, true, 'autosave with matching instance_id should pass');
  console.log('✓ autosave with matching instance_id passes');
}

{
  // Autosave with instance_id mismatch
  const result = validatePayload(
    { type: 'rc-assignment-autosave', instance_id: 'different-uuid', answers: { q1_1: '2' } },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.reason.includes('instance_id'), 'reason should mention instance_id');
  console.log('✓ autosave instance_id mismatch is rejected');
}

{
  // Autosave with empty answers
  const result = validatePayload(
    { type: 'rc-assignment-autosave', answers: {} },
    INSTANCE_ID
  );
  assert.strictEqual(result.valid, false);
  console.log('✓ autosave with empty answers is rejected');
}

console.log('\nAll html-assignment-bridge tests passed ✓');
