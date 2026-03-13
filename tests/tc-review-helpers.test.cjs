// Unit tests for tc-review.js helper logic
// Tests: date validation in queue sorting, escapeHtml XSS vectors
// Run with: node tests/tc-review-helpers.test.cjs

'use strict';

const assert = require('assert');

// ── Inline helpers (mirror site/web/tc-review.js) ────────────────────────────

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mirror of the NaN-guarded sort comparator used in buildReviewQueue()
function sortBySubmittedAt(items) {
  return [...items].sort((a, b) => {
    const dateA = new Date(a.submitted_at || 0);
    const dateB = new Date(b.submitted_at || 0);
    const tA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
    const tB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
    return tB - tA;
  });
}

// ── Date validation in queue sorting ─────────────────────────────────────────

console.log('--- Date validation in buildReviewQueue sort ---');

{
  // Normal dates should sort newest-first
  const items = [
    { id: 'a', submitted_at: '2026-01-01T00:00:00Z' },
    { id: 'b', submitted_at: '2026-03-01T00:00:00Z' },
    { id: 'c', submitted_at: '2026-02-01T00:00:00Z' },
  ];
  const sorted = sortBySubmittedAt(items);
  assert.strictEqual(sorted[0].id, 'b', 'most recent should be first');
  assert.strictEqual(sorted[1].id, 'c', 'middle date should be second');
  assert.strictEqual(sorted[2].id, 'a', 'oldest should be last');
  console.log('✓ valid dates sort newest-first');
}

{
  // Unparseable date string should not throw and should sort to end (treated as epoch 0)
  const items = [
    { id: 'valid', submitted_at: '2026-03-01T00:00:00Z' },
    { id: 'invalid', submitted_at: 'not-a-date' },
  ];
  let sorted;
  assert.doesNotThrow(() => {
    sorted = sortBySubmittedAt(items);
  }, 'sort should not throw for unparseable date');
  assert.strictEqual(sorted[0].id, 'valid', 'valid date should sort first (is newer than epoch)');
  assert.strictEqual(sorted[1].id, 'invalid', 'invalid date should sort to end');
  console.log('✓ unparseable date does not throw and sorts to end');
}

{
  // null submitted_at should be treated as epoch 0 (not throw)
  const items = [
    { id: 'recent', submitted_at: '2026-03-01T00:00:00Z' },
    { id: 'null_date', submitted_at: null },
  ];
  let sorted;
  assert.doesNotThrow(() => {
    sorted = sortBySubmittedAt(items);
  }, 'sort should not throw for null submitted_at');
  assert.strictEqual(sorted[0].id, 'recent', 'recent should be first');
  assert.strictEqual(sorted[1].id, 'null_date', 'null date should sort last');
  console.log('✓ null submitted_at treated as epoch 0 and sorts last');
}

{
  // undefined submitted_at should be treated as epoch 0
  const items = [
    { id: 'recent', submitted_at: '2026-03-01T00:00:00Z' },
    { id: 'undef', /* no submitted_at */ },
  ];
  let sorted;
  assert.doesNotThrow(() => {
    sorted = sortBySubmittedAt(items);
  }, 'sort should not throw for missing submitted_at');
  assert.strictEqual(sorted[0].id, 'recent', 'recent should be first');
  assert.strictEqual(sorted[1].id, 'undef', 'undefined date should sort last');
  console.log('✓ undefined submitted_at treated as epoch 0 and sorts last');
}

{
  // All invalid dates — should not throw, order is stable (all epoch 0)
  const items = [
    { id: 'a', submitted_at: 'bad' },
    { id: 'b', submitted_at: 'also-bad' },
  ];
  assert.doesNotThrow(() => {
    sortBySubmittedAt(items);
  }, 'sort of all-invalid dates should not throw');
  console.log('✓ all-invalid dates do not throw');
}

// ── escapeHtml XSS vectors ────────────────────────────────────────────────────

console.log('\n--- escapeHtml XSS coverage ---');

{
  assert.strictEqual(escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    'script tag should be escaped');
  console.log('✓ <script> tag is escaped');
}

{
  assert.strictEqual(escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    'img onerror payload should be escaped');
  console.log('✓ img onerror payload is escaped');
}

{
  assert.strictEqual(escapeHtml('" onmouseover="alert(1)'),
    '&quot; onmouseover=&quot;alert(1)',
    'attribute injection should be escaped');
  console.log('✓ attribute injection quotes are escaped');
}

{
  assert.strictEqual(escapeHtml("' onclick='alert(1)"),
    '&#39; onclick=&#39;alert(1)',
    'single-quote injection should be escaped');
  console.log('✓ single-quote injection is escaped');
}

{
  assert.strictEqual(escapeHtml('&amp; already encoded'),
    '&amp;amp; already encoded',
    'ampersand should be double-escaped');
  console.log('✓ ampersand is escaped');
}

{
  // null/undefined should return empty string
  assert.strictEqual(escapeHtml(null), '', 'null returns empty string');
  assert.strictEqual(escapeHtml(undefined), '', 'undefined returns empty string');
  console.log('✓ null/undefined return empty string');
}

{
  // Numbers should pass through as strings
  assert.strictEqual(escapeHtml(42), '42', 'number coerced to string');
  console.log('✓ numeric input is coerced to string safely');
}

{
  // Safe content should be returned unchanged
  assert.strictEqual(escapeHtml('Hello, World!'), 'Hello, World!',
    'safe content is unchanged');
  console.log('✓ safe content passes through unchanged');
}

console.log('\n✓ All tc-review-helpers tests passed!');
