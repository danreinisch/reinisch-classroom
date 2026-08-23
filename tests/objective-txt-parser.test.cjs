'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('Running objective TXT parser tests...\n');

const sourcePath = path.join(
  __dirname,
  '..',
  'netlify',
  'functions',
  'teacher-issue-draft.js'
);

const source = fs.readFileSync(sourcePath, 'utf8');

const functionStart =
  source.indexOf('function parseTxtToMeta(');

const functionEnd =
  source.indexOf(
    '\n/**\n * Core logic for issuing a draft assignment.',
    functionStart
  );

assert.ok(
  functionStart >= 0,
  'Could not locate production parseTxtToMeta()'
);

assert.ok(
  functionEnd > functionStart,
  'Could not isolate production parseTxtToMeta()'
);

const functionSource =
  source.slice(functionStart, functionEnd);

const sandbox = {
  console,
  REVERSE_ALIASES: {
    'Language Arts 1 SC': 'LA 1 SC',
    'Language Arts 2 SC': 'LA 2 SC',
    'Language Arts 3 SC': 'LA 3 SC',
    'Language Arts 4 SC': 'LA 4 SC',
    'Life Skills Language Arts SC':
      'Life Skills LA',
  },
};

vm.createContext(sandbox);

vm.runInContext(
  `${functionSource}
this.parseTxtToMeta = parseTxtToMeta;`,
  sandbox
);

const parseTxtToMeta =
  sandbox.parseTxtToMeta;

function parse(txt, studentCode = 'S009') {
  const result = parseTxtToMeta(
    txt,
    'Language Arts 3 SC',
    'objective-test.txt',
    studentCode
  );

  return JSON.parse(
    JSON.stringify(result)
  );
}

function getFirstQuestion(meta) {
  assert.ok(meta);
  assert.ok(Array.isArray(meta.days));
  assert.ok(meta.days[0]);
  assert.ok(
    Array.isArray(meta.days[0].questions)
  );
  assert.ok(meta.days[0].questions[0]);

  return meta.days[0].questions[0];
}

/* -------------------------------------------------------------------------- */
/* Existing no-IO behavior                                                    */
/* -------------------------------------------------------------------------- */

{
  const meta = parse(`
DAY 1 QUESTIONS
Question 1: [IG: S009.CG1] What does the prefix mean?
A) Before
B) After
ANSWER: A
`);

  const q = getFirstQuestion(meta);

  assert.deepStrictEqual(
    q.goal_codes,
    ['S009.CG1']
  );

  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      q,
      'objective_components'
    ),
    false,
    'Legacy no-IO question must not gain objective metadata'
  );

  assert.strictEqual(
    q.text,
    'What does the prefix mean?'
  );

  console.log(
    '✓ legacy no-IO question remains unchanged'
  );
}

/* -------------------------------------------------------------------------- */
/* Simple inline IO                                                           */
/* -------------------------------------------------------------------------- */

{
  const meta = parse(`
DAY 1 QUESTIONS
Question 1: [IG: S009.CG1] [IO: S009.CG1.O1] What does the prefix mean?
A) Before
B) After
ANSWER: A
`);

  const q = getFirstQuestion(meta);

  assert.deepStrictEqual(
    q.goal_codes,
    ['S009.CG1']
  );

  assert.deepStrictEqual(
    q.objective_components,
    [
      {
        code: 'S009.CG1.O1',
        label: null,
        max: 1,
        order: 1,
      },
    ],
    'inline [IO:] objective_components must be parsed'
  );

  assert.strictEqual(
    q.text,
    'What does the prefix mean?',
    '[IO:] must be stripped from student-visible question text'
  );

  console.log(
    '✓ simple inline [IO:] becomes one objective component'
  );
}

/* -------------------------------------------------------------------------- */
/* Independent Objective Max                                                  */
/* -------------------------------------------------------------------------- */

{
  const meta = parse(`
DAY 1 QUESTIONS
Question 1: [IG: S008.CG2] [IO: S008.CG2.O1] Identify the key details.
Objective Max: 3
A) One detail
B) Three details
ANSWER: B
`, 'S008');

  const q = getFirstQuestion(meta);

  assert.deepStrictEqual(
    q.objective_components,
    [
      {
        code: 'S008.CG2.O1',
        label: null,
        max: 3,
        order: 1,
      },
    ],
    'Objective Max must override the default objective denominator'
  );

  assert.strictEqual(
    q.text,
    'Identify the key details.',
    'Objective Max line must not become student-visible question text'
  );

  console.log(
    '✓ Objective Max is independent parser metadata'
  );
}

/* -------------------------------------------------------------------------- */
/* Malformed Objective Max must remain machine-detectable                     */
/* -------------------------------------------------------------------------- */

for (const badMax of ['0', '-1', 'banana']) {
  const meta = parse(`
DAY 1 QUESTIONS
Question 1: [IG: S008.CG2] [IO: S008.CG2.O1] Identify the key details.
Objective Max: ${badMax}
A) One detail
B) Three details
ANSWER: B
`, 'S008');

  const q = getFirstQuestion(meta);

  assert.strictEqual(
    q.text,
    'Identify the key details.',
    `Malformed Objective Max "${badMax}" must not leak into student-visible text`
  );

  assert.strictEqual(
    q.objective_max_invalid_raw,
    badMax,
    `Malformed Objective Max "${badMax}" must be preserved for fail-loud issuance validation`
  );
}

console.log(
  '✓ malformed Objective Max remains machine-detectable and hidden from student text'
);

/* -------------------------------------------------------------------------- */
/* Multi-component writing artifact                                           */
/* -------------------------------------------------------------------------- */

{
  const meta = parse(`
DAY 4 WRITING PROMPT
Question 1: [IG: S053.CG2] [WRITTEN RESPONSE]
Writing Prompt: Write one organized paragraph about the topic.

Objective Components:
[IO: S053.CG2.O1] Compound sentence | Objective Max: 1
[IO: S053.CG2.O2] Transition word | Objective Max: 1
[IO: S053.CG2.O3] Conclusion sentence | Objective Max: 1
[IO: S053.CG2.O4] Adjective use | Objective Max: 1
`, 'S053');

  assert.ok(meta);
  assert.strictEqual(meta.days.length, 1);

  const day = meta.days[0];

  assert.strictEqual(
    day.type,
    'writing_prompt'
  );

  assert.deepStrictEqual(
    day.goal_codes,
    ['S053.CG2']
  );

  assert.strictEqual(
    day.objective_components_explicit,
    true,
    'Objective Components block must be marked explicit'
  );

  assert.deepStrictEqual(
    day.objective_components,
    [
      {
        code: 'S053.CG2.O1',
        label: 'Compound sentence',
        max: 1,
        order: 1,
      },
      {
        code: 'S053.CG2.O2',
        label: 'Transition word',
        max: 1,
        order: 2,
      },
      {
        code: 'S053.CG2.O3',
        label: 'Conclusion sentence',
        max: 1,
        order: 3,
      },
      {
        code: 'S053.CG2.O4',
        label: 'Adjective use',
        max: 1,
        order: 4,
      },
    ],
    'Explicit writing block must preserve four independent components'
  );

  assert.strictEqual(
    day.prompt,
    'Write one organized paragraph about the topic.',
    'Objective Components block must not pollute the writing prompt'
  );

  console.log(
    '✓ explicit writing Objective Components block parses independently'
  );
}

console.log('');
console.log('OBJECTIVE TXT PARSER: PASS');
