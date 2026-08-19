'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const root =
  path.resolve(
    __dirname,
    '..'
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath
    ),
    'utf8'
  );
}

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

const students =
  read(
    'site/web/tc-students.js'
  );

const promptSource =
  read(
    'netlify/functions/_lib/ai-prompts.js'
  );

const packageJson =
  JSON.parse(
    read('package.json')
  );

const {
  buildSkillsPrompt,
} = require(
  '../netlify/functions/_lib/ai-prompts'
);

console.log(
  'Running Skills Summary AI criterion-conflict tests...\n'
);


// -----------------------------------------------------------------
// CARD FOUNDATION
// -----------------------------------------------------------------

assert.strictEqual(
  occurrences(
    students,
    'criterionConflict: hasCriterionConflict(goal)'
  ),
  2,
  'both IEP skill-card builders must retain explicit conflict metadata'
);

assert.strictEqual(
  occurrences(
    students,
    "headerMastery: goal.mastery !== undefined && goal.mastery !== null ? String(goal.mastery) : ''"
  ),
  2,
  'both skill-card builders must retain Header Mastery'
);

assert.strictEqual(
  occurrences(
    students,
    "goalTextTarget: goal.target !== undefined && goal.target !== null ? String(goal.target) : ''"
  ),
  2,
  'both skill-card builders must retain Goal-Text Target'
);

assert.strictEqual(
  occurrences(
    students,
    'target: goal.mastery !== undefined && goal.mastery !== null ? parseFloat(goal.mastery) : null'
  ),
  2,
  'ordinary card target behavior must remain unchanged'
);


// -----------------------------------------------------------------
// FIVE CLIENT PAYLOADS
// -----------------------------------------------------------------

assert.strictEqual(
  occurrences(
    students,
    'criterion_conflict: c.criterionConflict === true'
  ),
  5,
  'all five IEP AI payloads must carry criterion_conflict'
);

assert.strictEqual(
  occurrences(
    students,
    'header_mastery: c.headerMastery'
  ),
  5,
  'all five IEP AI payloads must carry Header Mastery'
);

assert.strictEqual(
  occurrences(
    students,
    'goal_text_target: c.goalTextTarget'
  ),
  5,
  'all five IEP AI payloads must carry Goal-Text Target'
);

assert.strictEqual(
  occurrences(
    students,
    'target: c.criterionConflict === true ? null : c.target'
  ),
  5,
  'all five IEP AI payloads must suppress generic target on explicit conflict'
);


// -----------------------------------------------------------------
// PROMPT RUNTIME SEMANTICS
// -----------------------------------------------------------------

const ordinaryGoal = {
  code: 'SYN.CG1',
  area: 'Reading',
  current_avg: 75,
  previous_avg: 70,
  trend: 'up',
  data_points: 4,
  target: 80,
  baseline: 40,
  criterion_conflict: false,
  header_mastery: '80%',
  goal_text_target: '60%',
};

const ordinaryPrompt =
  buildSkillsPrompt({
    student_code: 'SYN',
    iep_goals: [
      ordinaryGoal,
    ],
    dese_standards: [],
    audience: 'internal',
  });

const ordinaryIepStart =
  ordinaryPrompt.indexOf(
    'IEP Goals:'
  );

const ordinaryIepEnd =
  ordinaryPrompt.indexOf(
    'Return a JSON object',
    ordinaryIepStart
  );

assert.ok(
  ordinaryIepStart >= 0 &&
  ordinaryIepEnd > ordinaryIepStart
);

const ordinaryIepSection =
  ordinaryPrompt.slice(
    ordinaryIepStart,
    ordinaryIepEnd
  );

assert.ok(
  ordinaryIepSection.includes(
    'STATUS: BELOW_TARGET'
  ),
  'ordinary goal must retain historical target classification'
);

assert.ok(
  ordinaryIepSection.includes(
    'Target: 80%'
  ),
  'ordinary goal must retain generic Target'
);

assert.ok(
  !ordinaryIepSection.includes(
    'STATUS: CRITERION_CONFLICT'
  ),
  'unequal source values alone must not create a conflict'
);


const conflictGoal = {
  code: 'SYN.CG2',
  area: 'Writing',
  current_avg: 85,
  previous_avg: 80,
  trend: 'up',
  data_points: 4,
  target: null,
  baseline: 30,
  criterion_conflict: true,
  header_mastery: '80%',
  goal_text_target: '60%',
};

const conflictPrompt =
  buildSkillsPrompt({
    student_code: 'SYN',
    iep_goals: [
      conflictGoal,
    ],
    dese_standards: [],
    audience: 'internal',
  });

const conflictIepStart =
  conflictPrompt.indexOf(
    'IEP Goals:'
  );

const conflictIepEnd =
  conflictPrompt.indexOf(
    'Return a JSON object',
    conflictIepStart
  );

assert.ok(
  conflictIepStart >= 0 &&
  conflictIepEnd > conflictIepStart
);

const conflictIepSection =
  conflictPrompt.slice(
    conflictIepStart,
    conflictIepEnd
  );

assert.ok(
  conflictIepSection.includes(
    'STATUS: CRITERION_CONFLICT'
  )
);

assert.ok(
  conflictIepSection.includes(
    'Header Mastery: 80%'
  )
);

assert.ok(
  conflictIepSection.includes(
    'Goal-Text Target: 60%'
  )
);

assert.ok(
  conflictIepSection.includes(
    'Criterion Status: Manual Criterion Review Required'
  )
);

assert.ok(
  !conflictIepSection.includes(
    ', Target: '
  ),
  'conflict goal line must not expose a generic controlling Target'
);

assert.ok(
  promptSource.includes(
    'CRITERION_CONFLICT is used only when criterion_conflict is explicitly true'
  )
);

assert.ok(
  promptSource.includes(
    'Never infer a conflict merely because Header Mastery and Goal-Text Target differ.'
  )
);

assert.ok(
  promptSource.includes(
    'do not describe the goal as above target, below target, met, mastered, on track, at target, near mastery'
  )
);

assert.ok(
  promptSource.includes(
    'plain_language" must preserve Header Mastery and Goal-Text Target as separate values'
  )
);

assert.ok(
  promptSource.includes(
    'This is only a raw score-band display field and is not an IEP criterion-status judgment'
  )
);


// -----------------------------------------------------------------
// TEST WIRING
// -----------------------------------------------------------------

const unit =
  String(
    packageJson.scripts?.['test:unit'] ||
    ''
  );

const testName =
  'tests/criterion-conflict-skills-summary-ai.test.cjs';

assert.strictEqual(
  occurrences(
    unit,
    testName
  ),
  1,
  'Skills Summary conflict regression must be wired exactly once'
);

assert.ok(
  unit.indexOf(testName) <
  unit.indexOf(
    'tests/tc-library-helpers.test.cjs'
  )
);

console.log(
  'PASS: both skill-card builders preserve explicit criterion metadata'
);

console.log(
  'PASS: all five Teacher Students AI payloads preserve both source criteria'
);

console.log(
  'PASS: generic target is suppressed only for explicitly conflicted goals'
);

console.log(
  'PASS: canonical prompt uses CRITERION_CONFLICT instead of above/below-target classification'
);

console.log(
  'PASS: ordinary unequal criteria remain ordinary when the explicit flag is false'
);

console.log(
  'PASS: conflict AI prose requires Manual Criterion Review Required'
);

console.log();
console.log(
  'SKILLS SUMMARY AI CRITERION-CONFLICT HANDLING: PASS'
);
