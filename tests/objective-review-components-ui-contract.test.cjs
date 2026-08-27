'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running Teacher Review objective component UI contract...\n'
);

const repoRoot =
  path.resolve(__dirname, '..');

const tcReview =
  fs.readFileSync(
    path.join(
      repoRoot,
      'site',
      'web',
      'tc-review.js'
    ),
    'utf8'
  );

assert.ok(
  tcReview.includes(
    'IEP Objective Evidence'
  ),
  'objective-aware written response card must label its separate IEP evidence section'
);

assert.ok(
  tcReview.includes(
    'rv-objective-component-input'
  ),
  'objective-aware Review card must render independent component score inputs'
);

assert.ok(
  tcReview.includes(
    'data-component-order'
  ),
  'browser must submit stable component order rather than objective UUID'
);

assert.ok(
  tcReview.includes(
    'rv-academic-score-input'
  ),
  'academic score input must have a selector identity distinct from objective component inputs'
);

assert.ok(
  !tcReview.includes(
    'input.rv-score-input[data-item-id='
  ),
  'academic handlers must never use the generic rv-score-input selector on objective-aware cards'
);

const academicSelectorCount =
  tcReview.split(
    'input.rv-academic-score-input[data-item-id='
  ).length - 1;

assert.strictEqual(
  academicSelectorCount,
  2,
  'Suggest Grade and manual Save must both target the dedicated academic score input'
);

assert.ok(
  tcReview.includes(
    'rv-score-input rv-objective-component-input'
  ),
  'objective component score inputs must remain independently identifiable'
);

assert.ok(
  tcReview.includes(
    'objective_components'
  ),
  'Review UI must consume server-projected objective component state'
);

assert.ok(
  tcReview.includes(
    'updateObjectiveComponents'
  ),
  'manual Review save must persist objective component scores separately'
);

assert.ok(
  tcReview.includes(
    'isReviewCompleteItem'
  ),
  'finalization must have a centralized academic-plus-objective completeness check'
);

const computeStart =
  tcReview.indexOf(
    'function computeScorePercentage'
  );

const computeEnd =
  tcReview.indexOf(
    '// Handle "Finalize All Scored"',
    computeStart
  );

assert.ok(
  computeStart >= 0 &&
  computeEnd > computeStart,
  'academic score calculation boundary must remain identifiable'
);

const computeBlock =
  tcReview.slice(
    computeStart,
    computeEnd
  );

assert.ok(
  !/objective/i.test(computeBlock),
  'objective component scores must never enter academic score percentage math'
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
  'AI and manual save boundaries must remain identifiable'
);

const manualSaveEnd =
  tcReview.indexOf(
    '// Handle finalizing a submission',
    manualSaveStart
  );

assert.ok(
  manualSaveEnd > manualSaveStart,
  'manual Save boundary must remain identifiable'
);

const manualSaveBlock =
  tcReview.slice(
    manualSaveStart,
    manualSaveEnd
  );

assert.ok(
  manualSaveBlock.includes(
    "button.closest(\n        '.rv-response-card'"
  ) ||
  manualSaveBlock.includes(
    "button.closest('.rv-response-card')"
  ),
  'manual Save must resolve the exact response card that owns the clicked button'
);

assert.ok(
  manualSaveBlock.includes(
    'card.querySelector(\n        `input.rv-academic-score-input'
  ),
  'manual Save must read academic Score from the clicked submission card'
);

assert.ok(
  manualSaveBlock.includes(
    'card.querySelector(\n        `textarea.rv-note-input'
  ),
  'manual Save must read Teacher Note from the clicked submission card'
);

assert.ok(
  manualSaveBlock.includes(
    'card.querySelector(\n        `.rv-save-status'
  ),
  'manual Save status must belong to the clicked submission card'
);

assert.ok(
  !manualSaveBlock.includes(
    'document.querySelector(`input.rv-academic-score-input'
  ) &&
  !manualSaveBlock.includes(
    'document.querySelector(`textarea.rv-note-input'
  ) &&
  !manualSaveBlock.includes(
    'document.querySelector(`.rv-save-status'
  ),
  'manual Save must never use submission-agnostic global field selectors'
);

const aiBlock =
  tcReview.slice(
    aiStart,
    manualSaveStart
  );

assert.ok(
  !aiBlock.includes(
    'rv-objective-component-input'
  ) &&
  !aiBlock.includes(
    'updateObjectiveComponents'
  ) &&
  !aiBlock.includes(
    'save_objective_components'
  ),
  'academic Suggest Grade must not fill or save objective component scores'
);

console.log(
  '✓ objective scoring is visually separate from academic score'
);
console.log(
  '✓ browser uses component order rather than objective UUID'
);
console.log(
  '✓ objective values cannot inflate academic grade math'
);
console.log(
  '✓ objective-aware writing cannot finalize until teacher components are complete'
);
console.log(
  '✓ academic Suggest Grade remains independent from objective AI'
);

console.log('');
console.log(
  'OBJECTIVE REVIEW COMPONENT UI: PASS'
);
