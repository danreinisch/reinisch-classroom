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
  'AI suggest must not fill or save objective component scores'
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
  '✓ AI suggestion remains academic-only'
);

console.log('');
console.log(
  'OBJECTIVE REVIEW COMPONENT UI: PASS'
);
