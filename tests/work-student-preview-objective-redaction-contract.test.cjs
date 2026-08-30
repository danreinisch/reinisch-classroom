'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const vm =
  require('node:vm');

const root =
  path.resolve(
    __dirname,
    '..'
  );

const workJsPath =
  path.join(
    root,
    'site/web/tc-work.js'
  );

const workHtmlPath =
  path.join(
    root,
    'site/teacher/work/index.html'
  );

const packagePath =
  path.join(
    root,
    'package.json'
  );

const workSource =
  fs.readFileSync(
    workJsPath,
    'utf8'
  );

const workHtml =
  fs.readFileSync(
    workHtmlPath,
    'utf8'
  );

const packageJson =
  JSON.parse(
    fs.readFileSync(
      packagePath,
      'utf8'
    )
  );

console.log(
  'Running Work Student Preview objective-metadata redaction contract...'
);

const functionStart =
  workSource.indexOf(
    '  function stripTeacherTags(text) {'
  );

const functionEnd =
  workSource.indexOf(
    '  // Join tag-only lines',
    functionStart
  );

assert.ok(
  functionStart >= 0,
  'Established stripTeacherTags() helper must remain present'
);

assert.ok(
  functionEnd > functionStart,
  'Could not isolate stripTeacherTags() from Work source'
);

const functionSource =
  workSource.slice(
    functionStart,
    functionEnd
  );

const sandbox = {};

vm.createContext(
  sandbox
);

vm.runInContext(
  `${functionSource}
this.stripTeacherTags = stripTeacherTags;`,
  sandbox
);

const stripTeacherTags =
  sandbox.stripTeacherTags;

assert.equal(
  typeof stripTeacherTags,
  'function',
  'stripTeacherTags() must be executable as a pure helper'
);

const pilotSource = [
  '--- DAY 4 WRITTEN RESPONSE ---',

  'Question 1: [IG: S009.CG4] [MLS: 11-12.W.2.A] [WRITTEN RESPONSE]',

  'Writing Prompt: The objective of this response is to explain what Kagan values.',

  'Writing Structure:',

  '- Sentence 1 — Topic/Claim: State a clear answer.',

  '- Sentence 2 — Supporting Detail #1: Give one accurate detail.',

  '- Sentence 3 — Supporting Detail #2: Give a second accurate detail.',

  '- Sentence 4 — Supporting Detail #3: Give a third accurate detail.',

  '- Sentence 5 — Conclusion: Bring the response to a close.',

  'Objective Components:',

  '[IO: S009.CG4.O1] Topic/Claim | Objective Max: 1',

  '[IO: S009.CG4.O2] Three Supporting Details | Objective Max: 3',

  '[IO: S009.CG4.O3] Conclusion | Objective Max: 1',

  '',

  'Hints:',

  '- Keep the objective of your claim clear.',

  '- Use three accurate supporting details.',
].join(
  '\n'
);

const originalPilotSource =
  pilotSource;

const studentPreview =
  stripTeacherTags(
    pilotSource
  );

assert.equal(
  pilotSource,
  originalPilotSource,
  'Student Preview redaction must not mutate the stored draft source'
);

assert.ok(
  !studentPreview.includes(
    '[IG:'
  ),
  'Established Student Preview must continue hiding [IG:] tags'
);

assert.ok(
  !studentPreview.includes(
    '[MLS:'
  ),
  'Established Student Preview must continue hiding [MLS:] tags'
);

assert.ok(
  studentPreview.includes(
    '[WRITTEN RESPONSE]'
  ),
  'Student-facing response-type marker must remain visible'
);

console.log(
  '✓ established IG/MLS redaction remains intact'
);

assert.ok(
  !studentPreview.includes(
    'Objective Components:'
  ),
  '5E2A-P RED: Student Preview still exposes the Objective Components heading'
);

assert.ok(
  !studentPreview.includes(
    '[IO:'
  ),
  'Student Preview must hide every child-objective [IO:] code'
);

assert.ok(
  !studentPreview.includes(
    'Objective Max:'
  ),
  'Student Preview must hide every objective denominator'
);

assert.ok(
  !studentPreview.includes(
    'S009.CG4.O1'
  ) &&
  !studentPreview.includes(
    'S009.CG4.O2'
  ) &&
  !studentPreview.includes(
    'S009.CG4.O3'
  ),
  'Student Preview must expose no child-objective identity'
);

assert.ok(
  studentPreview.includes(
    'Writing Structure:'
  ),
  'Student Preview must preserve the writing structure'
);

assert.ok(
  studentPreview.includes(
    'Sentence 1 — Topic/Claim'
  ),
  'Student Preview must preserve student-facing Topic/Claim directions'
);

assert.ok(
  studentPreview.includes(
    'Sentence 5 — Conclusion'
  ),
  'Student Preview must preserve student-facing Conclusion directions'
);

assert.ok(
  studentPreview.includes(
    'Hints:'
  ),
  'Student Preview must preserve the Hints section after redaction'
);

assert.ok(
  studentPreview.includes(
    'The objective of this response is to explain what Kagan values.'
  ),
  'Redaction must not remove ordinary student-facing uses of the word objective'
);

assert.ok(
  studentPreview.includes(
    'Keep the objective of your claim clear.'
  ),
  'Redaction must remain metadata-specific rather than deleting normal prose'
);

console.log(
  '✓ Objective Components block is hidden without damaging student directions'
);

const inlineObjectiveSource =
  'Question 2: [IO: S009.CG4.O1] Explain what Kagan values.';

const inlineObjectivePreview =
  stripTeacherTags(
    inlineObjectiveSource
  );

assert.ok(
  !inlineObjectivePreview.includes(
    '[IO:'
  ),
  'Inline [IO:] tags must be hidden from Student Preview'
);

assert.ok(
  inlineObjectivePreview.includes(
    'Question 2: Explain what Kagan values.'
  ),
  'Removing an inline [IO:] tag must preserve the surrounding question'
);

console.log(
  '✓ inline child-objective tags redact cleanly'
);

const studentPreviewStart =
  workSource.indexOf(
    '  function renderStudentPreviewHtml(d) {'
  );

const studentPreviewEnd =
  workSource.indexOf(
    '  function renderTeacherPreviewHtml(d) {',
    studentPreviewStart
  );

assert.ok(
  studentPreviewStart >= 0 &&
  studentPreviewEnd > studentPreviewStart,
  'Could not isolate Student Preview renderer'
);

const studentPreviewBlock =
  workSource.slice(
    studentPreviewStart,
    studentPreviewEnd
  );

const studentSanitizerCalls =
  (
    studentPreviewBlock.match(
      /stripTeacherTags\(text\)/g
    ) || []
  ).length;

assert.equal(
  studentSanitizerCalls,
  2,
  'Both TXT and HTML Student Preview paths must use the redaction helper'
);

const teacherPreviewStart =
  workSource.indexOf(
    '  function renderTeacherPreviewHtml(d) {'
  );

const teacherPreviewEnd =
  workSource.indexOf(
    '  // Section color palette',
    teacherPreviewStart
  );

assert.ok(
  teacherPreviewStart >= 0 &&
  teacherPreviewEnd > teacherPreviewStart,
  'Could not isolate Teacher Preview renderer'
);

const teacherPreviewBlock =
  workSource.slice(
    teacherPreviewStart,
    teacherPreviewEnd
  );

assert.ok(
  !teacherPreviewBlock.includes(
    'stripTeacherTags('
  ),
  'Teacher Preview must continue showing the complete source metadata'
);

assert.ok(
  teacherPreviewBlock.includes(
    'escapeHtml(text)'
  ),
  'Teacher Preview must continue rendering the raw stored source safely'
);

console.log(
  '✓ Teacher Preview remains complete and unchanged'
);

const cacheReferenceMatch =
  workHtml.match(
    /\/web\/tc-work\.js\?v=([A-Za-z0-9._-]+)/
  );

assert.ok(
  cacheReferenceMatch,
  'Teacher Work page must reference a cache-busted tc-work.js asset'
);

assert.notStrictEqual(
  cacheReferenceMatch[1],
  '202608261430',
  'Teacher Work page cache key must remain moved beyond the historical 5E2A-P production key'
);

const unitScript =
  (
    packageJson.scripts &&
    packageJson.scripts['test:unit']
  ) || '';

assert.ok(
  unitScript.includes(
    'node tests/work-student-preview-objective-redaction-contract.test.cjs'
  ),
  '5E2A-P contract must be permanently registered in test:unit'
);

console.log(
  '✓ production cache-bust and permanent test registration are locked'
);

console.log('');
console.log(
  'WORK STUDENT PREVIEW OBJECTIVE REDACTION CONTRACT: PASS'
);
