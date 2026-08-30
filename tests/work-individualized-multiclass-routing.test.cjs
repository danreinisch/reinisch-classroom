'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const parseStudentSections =
  require(
    '../site/web/shared/parse-student-sections'
  );

const work =
  fs.readFileSync(
    'site/web/tc-work.js',
    'utf8'
  );

const html =
  fs.readFileSync(
    'site/teacher/work/index.html',
    'utf8'
  );

console.log(
  'Running individualized multi-class Work routing tests...\n'
);

const master = [
  '============================================================',
  'WEEK 1',
  'Student: S001 | Class: Language Arts 1 SC',
  '============================================================',
  'Question 1: Alpha?',
  'A) Yes',
  'B) No',
  'Correct: A',
  '============================================================',
  'WEEK 1',
  'Student: S002 | Class: Language Arts 2 SC',
  '============================================================',
  'Question 1: Beta?',
  'A) Yes',
  'B) No',
  'Correct: B',
].join('\n');

const sections =
  parseStudentSections(master);

assert.deepStrictEqual(
  sections.map(
    s => [
      s.studentCode,
      s.className,
    ]
  ),
  [
    [
      'S001',
      'Language Arts 1 SC',
    ],
    [
      'S002',
      'Language Arts 2 SC',
    ],
  ]
);

assert.strictEqual(
  sections[0].title,
  'WEEK 1'
);

assert.strictEqual(
  sections[1].title,
  'WEEK 1'
);

console.log(
  '✓ parser preserves embedded student/class/title identity'
);

assert.ok(
  work.includes(
    'function validateStudentSectionClasses(sections)'
  )
);

assert.ok(
  work.includes(
    '!allowedClasses.has('
  )
);

assert.ok(
  work.includes(
    '"Student Section Class Error"'
  )
);

console.log(
  '✓ missing/unrecognized embedded Class values fail closed'
);

assert.ok(
  work.includes(
    '"Individualized Multi-Class Upload"'
  )
);

assert.ok(
  work.includes(
    '"Classes detected from TXT"'
  )
);

assert.ok(
  work.includes(
    'form.dataset.rcIndividualizedStudentCount'
  )
);

assert.ok(
  work.includes(
    '`Create ${studentSections.length} Individualized Draft'
  )
);

assert.ok(
  work.includes(
    'splitStudentBtn.style.display ='
  )
);

console.log(
  '✓ detected master file visibly switches UI mode'
);

const megaRoutingMarker =
  work.indexOf(
    '// Existing class-section mega-TXT workflow.'
  );

const studentRoute =
  work.lastIndexOf(
    'splitByStudentFromCurrentForm()',
    megaRoutingMarker
  );

const routeStart =
  work.lastIndexOf(
    'const individualizedCount =',
    studentRoute
  );

const megaRoute =
  work.indexOf(
    'splitMegaFromCurrentForm()',
    megaRoutingMarker
  );

assert.ok(
  routeStart >= 0 &&
  studentRoute > routeStart &&
  megaRoutingMarker > studentRoute &&
  megaRoute > megaRoutingMarker
);

console.log(
  '✓ primary Save action routes individualized mode before legacy mega routing'
);

assert.ok(
  work.includes(
    'className: sec.className || ""'
  )
);

console.log(
  '✓ every generated student draft retains its own embedded class'
);

assert.ok(
  work.includes(
    'if (!className) return setMsg("err", "Class is required.");'
  )
);

console.log(
  '✓ ordinary single-class Save Draft still requires Class'
);

assert.ok(
  html.includes(
    "detect each student's embedded title and class automatically"
  )
);

assert.ok(
  html.includes(
    'tc-work.js?v=20260830-self-describing-titles'
  )
);

console.log(
  '✓ Work-page instructions and browser cache key updated'
);

console.log('');
console.log(
  'INDIVIDUALIZED MULTI-CLASS WORK ROUTING: PASS'
);

/*
 * Scoring safety:
 * a master TXT's aggregate point total must never be copied into
 * every individualized child draft.
 */

assert.ok(
  work.includes(
    'function calculateStudentSectionTotalPossible('
  ),
  'Work page must calculate a total for each student section'
);

assert.ok(
  work.includes(
    'const sectionTotalPossible ='
  ),
  'student splitter must calculate sectionTotalPossible'
);

assert.ok(
  work.includes(
    'total_possible:' +
      '\n            sectionTotalPossible'
  ),
  'child draft metadata must store the section-specific total'
);

const splitFunctionStart =
  work.indexOf(
    'async function splitByStudentFromCurrentForm()'
  );

const splitFunctionEnd =
  work.indexOf(
    '\n  function loadDrafts()',
    splitFunctionStart
  );

const splitFunctionSource =
  work.slice(
    splitFunctionStart,
    splitFunctionEnd
  );

assert.strictEqual(
  splitFunctionSource.includes(
    '__rcReadTotalPossible'
  ),
  false,
  'individualized splitter must not reuse the master-file aggregate total'
);

assert.ok(
  work.includes(
    'Individualized totals calculated per student'
  ),
  'individualized mode must not display the misleading aggregate master total'
);

console.log(
  '✓ individualized child drafts use per-student totals, never the master aggregate'
);

assert.ok(
  work.includes(
    'WRITTEN\\s+RESPONSE'
  ),
  'Day N WRITTEN RESPONSE must be counted as constructed work'
);

assert.ok(
  work.includes(
    'WRITING\\s+WORKSHOP'
  ),
  'legacy Writing Workshop headings must remain constructed work'
);

console.log(
  '✓ written-response/workshop headings count as constructed responses'
);


/*
 * Execute the actual helper code from tc-work.js rather than
 * merely checking strings. Both the current Week 1 heading
 * and the older em-dash heading must produce the same total.
 */
const vm =
  require('node:vm');

const helperStart =
  work.indexOf(
    '  function calculateStudentSectionTotalPossible('
  );

const helperEnd =
  work.indexOf(
    '  function updateClassDropdownLabel(',
    helperStart
  );

assert.ok(
  helperStart >= 0 &&
  helperEnd > helperStart,
  'must be able to isolate Work scoring helpers'
);

const helperSandbox = {};

vm.runInNewContext(
  work.slice(
    helperStart,
    helperEnd
  ) +
    '\nthis.calculateStudentSectionTotalPossible = calculateStudentSectionTotalPossible;',
  helperSandbox
);

function buildTwentySixPointSection(
  writtenHeading
) {
  const ordinary =
    Array.from(
      { length: 21 },
      (_, index) =>
        `Question ${index + 1}: Example question`
    );

  return [
    '--- DAY 1 QUESTIONS ---',
    ...ordinary,
    writtenHeading,
    'Question 1: [WRITTEN RESPONSE] Example response',
  ].join('\n');
}

const scoringDefaults = {
  mcq: 1,
  boolean: 1,
  constructed: 5,
  multi: 1,
};

const currentHeadingTotal =
  helperSandbox
    .calculateStudentSectionTotalPossible(
      buildTwentySixPointSection(
        '--- DAY 4 WRITTEN RESPONSE ---'
      ),
      scoringDefaults
    );

const legacyHeadingTotal =
  helperSandbox
    .calculateStudentSectionTotalPossible(
      buildTwentySixPointSection(
        '--- Day 4 — Written Response ---'
      ),
      scoringDefaults
    );

assert.strictEqual(
  currentHeadingTotal,
  26,
  'current Week 1 heading must calculate 21 + 5 = 26'
);

assert.strictEqual(
  legacyHeadingTotal,
  26,
  'legacy em-dash heading must calculate 21 + 5 = 26'
);

console.log(
  '✓ current and legacy Written Response headings both calculate 26 correctly'
);


/* -------------------------------------------------------------------------- */
/* Self-describing individualized TXT                                         */
/* -------------------------------------------------------------------------- */

assert.ok(
  work.includes(
    'const manualBaseTitle ='
  ),
  'legacy/manual individualized title fallback must remain available'
);

assert.ok(
  work.includes(
    'const sourceTitle ='
  ),
  'student splitter must consume each embedded source title'
);

assert.ok(
  work.includes(
    '`${sourceTitle || manualBaseTitle} — ${sec.studentCode}`'
  ),
  'student-specific draft title must be <TXT title> — S###'
);

assert.ok(
  work.includes(
    'titleInput.required = false'
  ),
  'self-describing individualized mode must not require typed Title'
);

assert.ok(
  work.includes(
    'titleInput.required = true'
  ),
  'ordinary/manual mode must restore the Title requirement'
);

assert.ok(
  work.includes(
    '"Titles detected from TXT"'
  ),
  'Work UI must identify automatic TXT-title mode'
);

assert.ok(
  work.includes(
    'if (!title) return setMsg("err", "Title is required.");'
  ),
  'ordinary Save Draft must still fail closed without Title'
);

console.log(
  '✓ self-describing titles preserve ordinary/manual Title behavior'
);


/*
 * Execute the real browser auto-mapper.
 *
 * This fixture permanently covers the production Week 1 failure:
 * - decorated DAY headings
 * - lazy implicit Assignment section preserving Day 1
 * - repeated Question 1 values staying day-qualified
 * - writing metadata mapping to D4.WP instead of phantom D4.Q1
 * - S009 parent goal remaining paired with the correct item
 */
const mapperStart =
  work.indexOf(
    '  function autoMapFromTeacherTxt(text) {'
  );

const mapperEnd =
  work.indexOf(
    '\n  function readScoringDefaults()',
    mapperStart
  );

assert.ok(
  mapperStart >= 0 &&
  mapperEnd > mapperStart,
  'must be able to isolate autoMapFromTeacherTxt()'
);

const mapperSandbox = {
  console: {
    log() {},
    warn() {},
    error() {},
  },
};

vm.runInNewContext(
  work.slice(
    mapperStart,
    mapperEnd
  ) +
    '\nthis.autoMapFromTeacherTxt = autoMapFromTeacherTxt;',
  mapperSandbox
);

const mapping =
  JSON.parse(
    JSON.stringify(
      mapperSandbox.autoMapFromTeacherTxt(
        [
          '--- DAY 1 QUESTIONS ---',
          'Question 1: [IG: S009.CG2] [IO: S009.CG2.O1] [MLS: 11-12.RL.1.A] First?',
          'A) One',
          'B) Two',
          'Correct: A',
          'Question 2: [IG: S009.CG2] [MLS: 11-12.RL.1.A] Second?',
          'A) One',
          'B) Two',
          'Correct: B',
          '',
          '--- DAY 2 QUESTIONS ---',
          'Question 1: [IG: S009.CG2] [IO: S009.CG2.O2] [MLS: 11-12.RL.1.A] Third?',
          'A) One',
          'B) Two',
          'Correct: A',
          '',
          '--- DAY 3 QUESTIONS ---',
          'Question 1: [IG: S009.CG2] [MLS: 11-12.RL.1.A] Fourth?',
          'A) One',
          'B) Two',
          'Correct: B',
          '',
          '--- DAY 4 WRITTEN RESPONSE ---',
          'Question 1: [IG: S009.CG4] [MLS: 11-12.RL.1.A] [MLS: 11-12.W.2.A] [WRITTEN RESPONSE]',
          'Writing Prompt: Explain Ben Kagan.',
          'Objective Components:',
          '[IO: S009.CG4.O1] Topic/claim | Objective Max: 1',
        ].join('\n')
      )
    )
  );

const mappedItems =
  (mapping.sections || [])
    .flatMap(
      section =>
        Array.isArray(section.items)
          ? section.items
          : []
    );

const mappedKeys =
  mappedItems.map(
    item =>
      item.key
  );

const mappedByKey =
  new Map(
    mappedItems.map(
      item => [
        item.key,
        item,
      ]
    )
  );

assert.deepStrictEqual(
  mappedKeys,
  [
    'D1.Q1',
    'D1.Q2',
    'D2.Q1',
    'D3.Q1',
    'D4.WP',
  ],
  'all structured questions must retain day-qualified mapping keys'
);

assert.strictEqual(
  new Set(mappedKeys).size,
  mappedKeys.length,
  'mapping keys must remain unique'
);

assert.strictEqual(
  mappedKeys.some(
    key =>
      /^Q\d+$/i.test(key)
  ),
  false,
  'structured Week-style assignments must never collapse to generic Qn'
);

assert.strictEqual(
  mappedByKey.has('D4.Q1'),
  false,
  'writing header metadata must not create phantom D4.Q1'
);

assert.deepStrictEqual(
  mappedByKey.get('D1.Q1').iep,
  ['S009.CG2']
);

assert.deepStrictEqual(
  mappedByKey.get('D1.Q2').iep,
  ['S009.CG2']
);

assert.deepStrictEqual(
  mappedByKey.get('D2.Q1').iep,
  ['S009.CG2']
);

assert.deepStrictEqual(
  mappedByKey.get('D3.Q1').iep,
  ['S009.CG2']
);

assert.deepStrictEqual(
  mappedByKey.get('D4.WP').iep,
  ['S009.CG4']
);

assert.deepStrictEqual(
  mappedByKey.get('D4.WP').dese,
  [
    '11-12.RL.1.A',
    '11-12.W.2.A',
  ],
  'writing artifact must retain canonical DESE identities'
);

console.log(
  '✓ decorated DAY + writing mapping permanently covers the S009 failure'
);

console.log('');
console.log(
  'SELF-DESCRIBING INDIVIDUALIZED TXT: PASS'
);
