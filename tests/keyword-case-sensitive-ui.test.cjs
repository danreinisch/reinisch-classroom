'use strict';

/**
 * Tests for UI-layer keyword matching that respects the case_sensitive flag.
 * Mirrors the logic in tc-library.js _buildLibraryRichAnswerHtml() and
 * tc-reporting.js buildRichAnswerDetailHtml().
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Inline implementation of the UI-layer keyword matching logic,
 * extracted from tc-library.js and tc-reporting.js.
 *
 * @param {string[]} fibKeywords
 * @param {string} studentText
 * @param {object} item - assignment item with scoring metadata
 * @returns {{ foundCount: number, foundList: string[] }}
 */
function matchKeywordsForDisplay(fibKeywords, studentText, item) {
  const caseSensitive =
    item.meta?.case_sensitive === true ||
    item.scoring?.case_sensitive === true ||
    item.meta?.scoring?.case_sensitive === true;

  const answerForMatch = caseSensitive ? studentText : studentText.toLowerCase();
  let foundCount = 0;
  const foundList = [];

  for (const kw of fibKeywords) {
    const kwForMatch = caseSensitive ? String(kw) : String(kw).toLowerCase();
    if (answerForMatch.includes(kwForMatch)) {
      foundCount++;
      foundList.push(kw);
    }
  }

  return { foundCount, foundList };
}

// --- Test scenarios ---

test('Default (case-insensitive): "dna and rna" matches ["DNA", "RNA"]', () => {
  const item = { scoring: { case_sensitive: false } };
  const { foundCount } = matchKeywordsForDisplay(['DNA', 'RNA'], 'dna and rna', item);
  assert.strictEqual(foundCount, 2);
});

test('Default (no flag): "dna and rna" matches ["DNA", "RNA"] case-insensitively', () => {
  const item = {};
  const { foundCount } = matchKeywordsForDisplay(['DNA', 'RNA'], 'dna and rna', item);
  assert.strictEqual(foundCount, 2);
});

test('Case-sensitive match: "DNA and RNA" matches ["DNA", "RNA"]', () => {
  const item = { scoring: { case_sensitive: true } };
  const { foundCount } = matchKeywordsForDisplay(['DNA', 'RNA'], 'DNA and RNA', item);
  assert.strictEqual(foundCount, 2);
});

test('Case-sensitive mismatch: "dna and rna" does NOT match ["DNA", "RNA"]', () => {
  const item = { scoring: { case_sensitive: true } };
  const { foundCount } = matchKeywordsForDisplay(['DNA', 'RNA'], 'dna and rna', item);
  assert.strictEqual(foundCount, 0);
});

test('Case-sensitive mixed: "The pH of the Acid" matches pH but not "acid"', () => {
  const item = { scoring: { case_sensitive: true } };
  const { foundCount, foundList } = matchKeywordsForDisplay(['pH', 'acid'], 'The pH of the Acid', item);
  assert.strictEqual(foundCount, 1);
  assert.deepStrictEqual(foundList, ['pH']);
});

test('Case-sensitive flag read from item.meta.case_sensitive', () => {
  const item = { meta: { case_sensitive: true } };
  const { foundCount } = matchKeywordsForDisplay(['DNA'], 'DNA test', item);
  assert.strictEqual(foundCount, 1);

  const { foundCount: foundLower } = matchKeywordsForDisplay(['DNA'], 'dna test', item);
  assert.strictEqual(foundLower, 0);
});

test('Case-sensitive flag read from item.meta.scoring.case_sensitive', () => {
  const item = { meta: { scoring: { case_sensitive: true } } };
  const { foundCount } = matchKeywordsForDisplay(['DNA'], 'DNA test', item);
  assert.strictEqual(foundCount, 1);

  const { foundCount: foundLower } = matchKeywordsForDisplay(['DNA'], 'dna test', item);
  assert.strictEqual(foundLower, 0);
});

test('Case-sensitive flag false in item.meta.scoring still allows case-insensitive match', () => {
  const item = { meta: { scoring: { case_sensitive: false } } };
  const { foundCount } = matchKeywordsForDisplay(['DNA'], 'dna test', item);
  assert.strictEqual(foundCount, 1);
});

test('Case-insensitive: partial match within a longer word works', () => {
  const item = {};
  const { foundCount } = matchKeywordsForDisplay(['DNA'], 'mDNA is present', item);
  assert.strictEqual(foundCount, 1);
});
