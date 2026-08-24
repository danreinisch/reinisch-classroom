'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running Teacher Review objective evidence writer integration contract...\n'
);

const repoRoot =
  path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      repoRoot,
      ...relativePath.split('/')
    ),
    'utf8'
  );
}

const reviewSave =
  read(
    'netlify/functions/teacher-review-save.js'
  );

const dataAdapter =
  read(
    'site/web/data-adapter.js'
  );

const tcReview =
  read(
    'site/web/tc-review.js'
  );

const helperPath =
  path.join(
    repoRoot,
    'netlify',
    'functions',
    '_lib',
    'objective-review-evidence-writer.js'
  );

assert.ok(
  fs.existsSync(helperPath),
  '5B2 server must use a dedicated server-only objective review writer'
);

assert.ok(
  reviewSave.includes(
    "'save_objective_components'"
  ) ||
  reviewSave.includes(
    '"save_objective_components"'
  ),
  '5B2 server must add an explicit save_objective_components action'
);

assert.ok(
  reviewSave.includes(
    'handleSaveObjectiveComponents'
  ),
  '5B2 server must isolate objective component mutation from academic save_score'
);

assert.ok(
  reviewSave.includes(
    'objective-review-evidence-writer'
  ),
  'teacher-review-save must delegate child-objective writes to the dedicated helper'
);

assert.ok(
  !reviewSave.includes(
    '/rest/v1/objective_data_points'
  ),
  'teacher-review-save must not directly write objective_data_points'
);

assert.ok(
  reviewSave.includes(
    'studentId: authorization.context.studentId'
  ),
  'authorized student identity must overwrite any caller-supplied student identity'
);

assert.ok(
  reviewSave.includes(
    'instanceId: authorization.context.instanceId'
  ),
  'authorized assignment instance must remain canonical'
);

assert.ok(
  dataAdapter.includes(
    'updateObjectiveComponents'
  ),
  'browser adapter must expose a dedicated objective-component save method'
);

assert.match(
  dataAdapter,
  /action\s*:\s*['"]save_objective_components['"]/,
  'browser adapter objective save must use the dedicated signed action'
);

const saveScoreStart =
  reviewSave.indexOf(
    'async function handleSaveScore'
  );

const saveGradeStart =
  reviewSave.indexOf(
    'async function handleSaveGrade',
    saveScoreStart
  );

assert.ok(
  saveScoreStart >= 0 &&
  saveGradeStart > saveScoreStart,
  'existing academic save_score boundary must remain identifiable'
);

const academicSaveBlock =
  reviewSave.slice(
    saveScoreStart,
    saveGradeStart
  );

assert.ok(
  !academicSaveBlock.includes(
    'objective_data_points'
  ) &&
  !academicSaveBlock.includes(
    'objective_earned'
  ) &&
  !academicSaveBlock.includes(
    'save_objective_components'
  ),
  'academic save_score must remain independent from objective component scoring'
);

const aiStart =
  tcReview.indexOf(
    'async function handleAiSuggest(button)'
  );

const manualSaveStart =
  tcReview.indexOf(
    'async function handleSaveScore(button)',
    aiStart
  );

assert.ok(
  aiStart >= 0 &&
  manualSaveStart > aiStart,
  'AI suggest and manual save boundaries must remain identifiable'
);

const aiBlock =
  tcReview.slice(
    aiStart,
    manualSaveStart
  );

assert.ok(
  !aiBlock.includes(
    'updateObjectiveComponents'
  ) &&
  !aiBlock.includes(
    'save_objective_components'
  ),
  'AI grade suggestion must never save objective-component evidence'
);

console.log(
  '✓ objective components use a separate signed server mutation'
);
console.log(
  '✓ academic save_score remains independent'
);
console.log(
  '✓ canonical signed student/instance identity owns the write'
);
console.log(
  '✓ AI suggestion path cannot create objective evidence'
);

console.log('');
console.log(
  'OBJECTIVE REVIEW EVIDENCE WRITER INTEGRATION: PASS'
);
