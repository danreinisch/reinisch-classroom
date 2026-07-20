'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const parserFiles = [
  'netlify/functions/teacher-issue-draft.js',
  'site/web/tc-work.js',
];

const accepted = [
  ['Correct: B', 'B'],
  ['Correct B', 'B'],
  ['Correct    B', 'B'],
  ['Correct:B', 'B'],
  ['Correct Answer: C', 'C'],
  ['Correct Answer C', 'C'],
  ['Answer: D', 'D'],
  ['Answer D', 'D'],
];

const rejected = [
  'CorrectB',
  'AnswerC',
];

let regexCount = 0;

for (const relativeFile of parserFiles) {
  const absoluteFile = path.resolve(relativeFile);

  if (!fs.existsSync(absoluteFile)) {
    continue;
  }

  const source = fs.readFileSync(
    absoluteFile,
    'utf8'
  );

  const lines = source.split('\n');

  for (const line of lines) {
    if (
      !line.includes('const correctMatch') ||
      !line.includes('trimmed.match(')
    ) {
      continue;
    }

    const match = line.match(
      /trimmed\.match\((\/.*\/[a-z]*)\)/
    );

    assert(
      match,
      `${relativeFile}: could not extract correctMatch regex`
    );

    const regexLiteral = match[1];

    // Test-controlled source extraction.
    const answerRegex = Function(
      `"use strict"; return (${regexLiteral});`
    )();

    regexCount += 1;

    for (const [input, expected] of accepted) {
      const result = input.match(answerRegex);

      assert(
        result,
        `${relativeFile}: expected "${input}" to match`
      );

      assert.strictEqual(
        result[1].toUpperCase(),
        expected,
        `${relativeFile}: "${input}" should parse as ${expected}`
      );
    }

    for (const input of rejected) {
      assert.strictEqual(
        input.match(answerRegex),
        null,
        `${relativeFile}: "${input}" must not match`
      );
    }

    console.log(
      `✓ ${relativeFile}: colon and no-colon answer keys supported`
    );
  }
}

assert(
  regexCount > 0,
  'No answer-key correctMatch parser regex was found'
);

console.log('');
console.log('ANSWER-KEY OPTIONAL-COLON CONTRACT: PASS');
