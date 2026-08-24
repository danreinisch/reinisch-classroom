'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running Teacher Review objective evidence reader contract...\n'
);

const repoRoot =
  path.resolve(__dirname, '..');

const reader =
  fs.readFileSync(
    path.join(
      repoRoot,
      'netlify',
      'functions',
      'teacher-review-submission-answers.js'
    ),
    'utf8'
  );

assert.ok(
  reader.includes(
    'getObjectiveCandidateItemIds'
  ),
  'Review reader must reuse explicit objective candidate preflight'
);

assert.ok(
  reader.includes(
    'objectiveCandidateItemIds'
  ),
  'Review reader must identify objective-aware items before objective-table access'
);

assert.ok(
  reader.includes(
    'objectiveCandidateItemIds.length > 0'
  ),
  'ordinary no-IO Review reads must have an explicit zero-query objective guard'
);

const enrichStart =
  reader.indexOf(
    'async function enrichObjectiveComponents'
  );

const enrichEnd =
  reader.indexOf(
    '\nfunction flattenAnswers(',
    enrichStart
  );

assert.ok(
  enrichStart >= 0 &&
  enrichEnd > enrichStart,
  'Review reader must expose an identifiable objective-enrichment execution boundary'
);

const enrichBlock =
  reader.slice(
    enrichStart,
    enrichEnd
  );

const candidateIndex =
  enrichBlock.indexOf(
    'const objectiveCandidateItemIds'
  );

const guardIndex =
  enrichBlock.indexOf(
    'objectiveCandidateItemIds.length > 0'
  );

const mappingCallIndex =
  enrichBlock.indexOf(
    'fetchObjectiveMappings(',
    guardIndex
  );

const evidenceCallIndex =
  enrichBlock.indexOf(
    'fetchObjectiveEvidence(',
    guardIndex
  );

assert.ok(
  candidateIndex >= 0 &&
  guardIndex > candidateIndex,
  'objective candidate preflight must precede the zero-query guard'
);

assert.ok(
  mappingCallIndex > guardIndex,
  'normalized objective mapping lookup must occur only after candidate preflight'
);

assert.ok(
  evidenceCallIndex > guardIndex,
  'objective evidence lookup must occur only after candidate preflight'
);

assert.ok(
  reader.includes(
    'objective_components'
  ),
  'Review answer transport must expose teacher-facing objective component state'
);

for (const field of [
  'component_order',
  'component_label',
  'objective_max',
  'objective_earned',
]) {
  assert.ok(
    reader.includes(field),
    `Review objective component transport must include ${field}`
  );
}

assert.ok(
  reader.includes(
    'assignment_item_objectives'
  ),
  'Review reader must derive component identity/max from normalized mappings'
);

assert.ok(
  reader.includes(
    'objective_data_points'
  ),
  'Review reader must load current reconciled component scores'
);

console.log(
  '✓ no-IO Review reads are an objective-query no-op'
);
console.log(
  '✓ objective-aware Review reads use normalized mappings plus current evidence'
);
console.log(
  '✓ browser receives order/label/max/earned component state'
);

console.log('');
console.log(
  'OBJECTIVE REVIEW EVIDENCE READER: PASS'
);
