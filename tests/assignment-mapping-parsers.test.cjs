// Unit tests for parseTxtMapping in assignment-mapping-parsers.js
// Run with: node tests/assignment-mapping-parsers.test.cjs

'use strict';

const assert = require('assert');

// ── Inline parseTxtMapping (mirrors web/assignment-mapping-parsers.js) ─────────

function parseTxtMapping(txtContent) {
  const lines = txtContent.split('\n').map(l => l.trim());
  const items = [];
  const errors = [];
  const seenRefs = new Set();

  let lineNum = 0;
  for (const line of lines) {
    lineNum++;
    if (!line || (line.startsWith('#') && !line.includes('|'))) {
      continue;
    }
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 6) {
      errors.push({ line: lineNum, message: `Expected 6 fields, got ${parts.length}`, content: line });
      continue;
    }
    let [ref, points, correct, deseCodes, goalCodes, notes] = parts;
    const keywordsRaw = parts.length >= 7 ? parts[6] : '';

    ref = ref.replace(/^#+/, '').trim();
    if (!ref) { errors.push({ line: lineNum, message: 'Question ref is required', content: line }); continue; }
    if (seenRefs.has(ref)) { errors.push({ line: lineNum, message: `Duplicate question ref: ${ref}`, content: line }); continue; }
    seenRefs.add(ref);

    const pointsNum = parseFloat(points);
    if (isNaN(pointsNum) || pointsNum < 0) { errors.push({ line: lineNum, message: `Invalid points value: ${points}`, content: line }); continue; }

    const parseCodeArray = (codeStr) => {
      if (!codeStr || codeStr === '-' || codeStr === '') return [];
      return codeStr.split(';').map(c => c.trim()).filter(c => c.length > 0);
    };
    const deseArray = parseCodeArray(deseCodes);
    const goalArray = parseCodeArray(goalCodes);

    let answerType = 'mcq';
    let correctValue = correct.trim();
    if (!correctValue || correctValue === '-') {
      answerType = 'constructed';
      correctValue = null;
    } else if (correctValue.includes(';')) {
      answerType = 'multi';
      correctValue = correctValue.split(';').map(c => c.trim()).filter(c => c);
    } else if (/^(true|false)$/i.test(correctValue)) {
      answerType = 'boolean';
      correctValue = correctValue.toLowerCase() === 'true';
    }

    let scoring = {};
    if (keywordsRaw && answerType === 'constructed') {
      const keywordParts = keywordsRaw.split(';').map(k => k.trim()).filter(k => k.length > 0);
      let minKeywords = 1;
      const keywords = [];
      for (const part of keywordParts) {
        const minMatch = part.match(/^min:(\d+)$/i);
        if (minMatch) {
          minKeywords = parseInt(minMatch[1], 10);
        } else {
          keywords.push(part);
        }
      }
      if (keywords.length > 0) {
        scoring = { keywords, min_keywords: minKeywords };
        correctValue = keywords;
      }
    }

    items.push({ ref, answer_type: answerType, points: pointsNum, correct: correctValue, dese_codes: deseArray, goal_codes: goalArray, scoring, notes: notes || '' });
  }

  return { format: 'txt', items, errors, valid: errors.length === 0 };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;

console.log('--- parseTxtMapping: backward compatibility (6 fields) ---');

{
  const txt = 'Q1|1|A|MA.8.EE.1|MATH.1|MCQ note';
  const result = parseTxtMapping(txt);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.items.length, 1);
  assert.strictEqual(result.items[0].answer_type, 'mcq');
  assert.strictEqual(result.items[0].correct, 'A');
  assert.deepStrictEqual(result.items[0].scoring, {});
  console.log('  ✓ 6-field MCQ line parses without error');
  passed++;
}

{
  const txt = 'Q1|1|-|MA.8.EE.1|MATH.1|Constructed note';
  const result = parseTxtMapping(txt);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.items[0].answer_type, 'constructed');
  assert.strictEqual(result.items[0].correct, null);
  assert.deepStrictEqual(result.items[0].scoring, {});
  console.log('  ✓ 6-field constructed line (no keywords) parses correctly');
  passed++;
}

console.log('--- parseTxtMapping: 7th keywords field ---');

{
  const txt = 'Q5|1|-|MA.8.EE.1|MATH.1|Fill in blank|slope;intercept;linear;min:2';
  const result = parseTxtMapping(txt);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.items.length, 1);
  const item = result.items[0];
  assert.strictEqual(item.answer_type, 'constructed');
  assert.deepStrictEqual(item.scoring.keywords, ['slope', 'intercept', 'linear']);
  assert.strictEqual(item.scoring.min_keywords, 2);
  assert.deepStrictEqual(item.correct, ['slope', 'intercept', 'linear']);
  console.log('  ✓ 7-field line with keywords and min:N parsed correctly');
  passed++;
}

{
  const txt = 'Q1|1|-|MA.8.EE.1|MATH.1|Fill in blank|photosynthesis;chlorophyll';
  const result = parseTxtMapping(txt);
  const item = result.items[0];
  assert.strictEqual(item.scoring.min_keywords, 1, 'defaults to min_keywords=1 when no min:N is present');
  assert.deepStrictEqual(item.scoring.keywords, ['photosynthesis', 'chlorophyll']);
  console.log('  ✓ Keywords field without min:N defaults to min_keywords=1');
  passed++;
}

{
  const txt = 'Q1|1|A|MA.8.EE.1|MATH.1|MCQ note|slope;intercept';
  const result = parseTxtMapping(txt);
  const item = result.items[0];
  assert.strictEqual(item.answer_type, 'mcq', 'keywords field is ignored for non-constructed types');
  assert.deepStrictEqual(item.scoring, {}, 'scoring is empty for non-constructed types');
  assert.strictEqual(item.correct, 'A', 'correct is unchanged for MCQ');
  console.log('  ✓ Keywords field ignored when answer_type is not constructed');
  passed++;
}

console.log('--- parseTxtMapping: mixed 6 and 7 field lines ---');

{
  const txt = [
    'Q1|1|A|MA.8.EE.1|MATH.1|MCQ question',
    'Q2|1|-|MA.8.EE.1|MATH.1|Fill in blank|slope;intercept;min:2',
    'Q3|2|A;C|MA.8.EE.2|MATH.2|Multi question',
    'Q4|1|true|MA.8.G.1|MATH.3|Boolean question',
    'Q5|3|-||MATH.4|No DESE|capital;france'
  ].join('\n');
  const result = parseTxtMapping(txt);
  assert.strictEqual(result.valid, true, 'mixed file parses without errors');
  assert.strictEqual(result.items.length, 5);

  const byRef = {};
  result.items.forEach(i => { byRef[i.ref] = i; });

  assert.strictEqual(byRef['Q1'].answer_type, 'mcq');
  assert.deepStrictEqual(byRef['Q1'].scoring, {});

  assert.strictEqual(byRef['Q2'].answer_type, 'constructed');
  assert.deepStrictEqual(byRef['Q2'].scoring.keywords, ['slope', 'intercept']);
  assert.strictEqual(byRef['Q2'].scoring.min_keywords, 2);

  assert.strictEqual(byRef['Q3'].answer_type, 'multi');
  assert.deepStrictEqual(byRef['Q3'].scoring, {});

  assert.strictEqual(byRef['Q4'].answer_type, 'boolean');
  assert.deepStrictEqual(byRef['Q4'].scoring, {});

  assert.strictEqual(byRef['Q5'].answer_type, 'constructed');
  assert.deepStrictEqual(byRef['Q5'].scoring.keywords, ['capital', 'france']);
  assert.strictEqual(byRef['Q5'].scoring.min_keywords, 1);

  console.log('  ✓ Mixed 6-field and 7-field lines in same file parse correctly');
  passed++;
}

console.log(`\nAll ${passed} tests passed.`);
