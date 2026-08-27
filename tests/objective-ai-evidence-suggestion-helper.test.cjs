'use strict';

const assert =
  require('node:assert/strict');

let helper;

try {
  helper =
    require(
      '../netlify/functions/_lib/' +
      'objective-ai-evidence-suggester'
    );
} catch (error) {
  console.error(
    'RED: objective AI evidence helper does not exist yet.'
  );
  console.error(
    'Expected module: ' +
    'netlify/functions/_lib/' +
    'objective-ai-evidence-suggester.js'
  );
  process.exit(1);
}

const {
  validateObjectiveEvidenceSuggestions,
} = helper;

assert.equal(
  typeof validateObjectiveEvidenceSuggestions,
  'function',
  'helper must export validateObjectiveEvidenceSuggestions'
);

const mappings = [
  {
    component_order: 1,
    objective_id:
      '11111111-1111-4111-8111-111111111111',
    component_label: 'Topic/Claim',
    objective_max: 1,
  },
  {
    component_order: 2,
    objective_id:
      '22222222-2222-4222-8222-222222222222',
    component_label: 'Supporting Details',
    objective_max: 3,
  },
  {
    component_order: 3,
    objective_id:
      '33333333-3333-4333-8333-333333333333',
    component_label: 'Conclusion',
    objective_max: 1,
  },
];

function validate(suggestions) {
  return validateObjectiveEvidenceSuggestions({
    mappings,
    suggestions,
  });
}

function expectThrow(
  label,
  suggestions
) {
  assert.throws(
    () => validate(suggestions),
    Error,
    label
  );
}

/*
 * Happy path:
 * - component 1 is a measured 0
 * - component 2 receives partial evidence
 * - component 3 is explicitly Not Scorable
 */
const result =
  validate([
    {
      component_order: 1,
      suggested_disposition: 'scored',
      suggested_earned: 0,
      evidence_excerpt:
        'The response states a topic but not a defensible claim.',
      rationale:
        'A measurable attempt is present, but the component is not demonstrated.',
    },
    {
      component_order: 2,
      suggested_disposition: 'scored',
      suggested_earned: 2,
      evidence_excerpt:
        'Two relevant supporting details are present.',
      rationale:
        'The response demonstrates partial evidence for the mapped component.',
    },
    {
      component_order: 3,
      suggested_disposition:
        'not_scorable',
      evidence_excerpt: '',
      rationale:
        'The response does not contain a conclusion to evaluate.',
    },
  ]);

assert.equal(
  result.length,
  3,
  'all authoritative mappings must return exactly one suggestion'
);

assert.deepEqual(
  result.map(row => row.component_order),
  [1, 2, 3],
  'result must be ordered by authoritative component_order'
);

assert.equal(
  result[0].suggested_earned,
  0,
  'measured scored 0 must remain legitimate evidence'
);

assert.equal(
  result[0].objective_max,
  1,
  'objective max must come from authoritative mapping'
);

assert.equal(
  result[1].objective_max,
  3,
  'authoritative max must be projected by the server helper'
);

assert.equal(
  result[1].component_label,
  'Supporting Details',
  'component label must come from authoritative mapping'
);

assert.equal(
  result[2].suggested_disposition,
  'not_scorable',
  'Not Scorable must remain a distinct disposition'
);

assert.equal(
  result[2].suggested_earned,
  null,
  'Not Scorable must never become measured zero'
);

/*
 * AI output may never supply server-owned identity/max fields.
 */
expectThrow(
  'AI cannot supply objective_id',
  [
    {
      component_order: 1,
      suggested_disposition: 'scored',
      suggested_earned: 1,
      objective_id:
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
    {
      component_order: 2,
      suggested_disposition: 'scored',
      suggested_earned: 2,
    },
    {
      component_order: 3,
      suggested_disposition:
        'not_scorable',
    },
  ]
);

expectThrow(
  'AI cannot supply objective_max',
  [
    {
      component_order: 1,
      suggested_disposition: 'scored',
      suggested_earned: 1,
      objective_max: 999,
    },
    {
      component_order: 2,
      suggested_disposition: 'scored',
      suggested_earned: 2,
    },
    {
      component_order: 3,
      suggested_disposition:
        'not_scorable',
    },
  ]
);

/*
 * Complete, unique, authoritative component coverage is mandatory.
 */
expectThrow(
  'missing component must fail closed',
  [
    {
      component_order: 1,
      suggested_disposition: 'scored',
      suggested_earned: 1,
    },
    {
      component_order: 2,
      suggested_disposition: 'scored',
      suggested_earned: 2,
    },
  ]
);

expectThrow(
  'duplicate component order must fail closed',
  [
    {
      component_order: 1,
      suggested_disposition: 'scored',
      suggested_earned: 1,
    },
    {
      component_order: 1,
      suggested_disposition: 'scored',
      suggested_earned: 0,
    },
    {
      component_order: 3,
      suggested_disposition:
        'not_scorable',
    },
  ]
);

expectThrow(
  'unknown component order must fail closed',
  [
    {
      component_order: 1,
      suggested_disposition: 'scored',
      suggested_earned: 1,
    },
    {
      component_order: 2,
      suggested_disposition: 'scored',
      suggested_earned: 2,
    },
    {
      component_order: 99,
      suggested_disposition: 'scored',
      suggested_earned: 1,
    },
  ]
);

/*
 * Disposition rules.
 */
expectThrow(
  'invalid disposition must fail closed',
  [
    {
      component_order: 1,
      suggested_disposition: 'maybe',
      suggested_earned: 1,
    },
    {
      component_order: 2,
      suggested_disposition: 'scored',
      suggested_earned: 2,
    },
    {
      component_order: 3,
      suggested_disposition:
        'not_scorable',
    },
  ]
);

expectThrow(
  'Not Scorable cannot contain earned zero',
  [
    {
      component_order: 1,
      suggested_disposition:
        'not_scorable',
      suggested_earned: 0,
    },
    {
      component_order: 2,
      suggested_disposition: 'scored',
      suggested_earned: 2,
    },
    {
      component_order: 3,
      suggested_disposition:
        'not_scorable',
    },
  ]
);

expectThrow(
  'scored component requires earned value',
  [
    {
      component_order: 1,
      suggested_disposition: 'scored',
    },
    {
      component_order: 2,
      suggested_disposition: 'scored',
      suggested_earned: 2,
    },
    {
      component_order: 3,
      suggested_disposition:
        'not_scorable',
    },
  ]
);

expectThrow(
  'score above authoritative max must fail closed',
  [
    {
      component_order: 1,
      suggested_disposition: 'scored',
      suggested_earned: 2,
    },
    {
      component_order: 2,
      suggested_disposition: 'scored',
      suggested_earned: 2,
    },
    {
      component_order: 3,
      suggested_disposition:
        'not_scorable',
    },
  ]
);

expectThrow(
  'negative score must fail closed',
  [
    {
      component_order: 1,
      suggested_disposition: 'scored',
      suggested_earned: -1,
    },
    {
      component_order: 2,
      suggested_disposition: 'scored',
      suggested_earned: 2,
    },
    {
      component_order: 3,
      suggested_disposition:
        'not_scorable',
    },
  ]
);

console.log(
  '✓ objective AI evidence suggestion helper contract'
);

/*
 * Privacy contract:
 * objective-evidence AI receives the same common-pattern PII
 * protection as the existing academic Suggest Grade path.
 */
const {
  scrubPii,
} = helper;

const piiSample =
  'Email me at student@example.com or call 636-555-1212. ' +
  'My SSN is 123-45-6789 and I live at 123 Main Street.';

const scrubbed =
  scrubPii(piiSample);

assert.ok(
  !scrubbed.includes(
    'student@example.com'
  ),
  'email must be redacted before objective AI'
);

assert.ok(
  !scrubbed.includes(
    '636-555-1212'
  ),
  'phone must be redacted before objective AI'
);

assert.ok(
  !scrubbed.includes(
    '123-45-6789'
  ),
  'SSN-like pattern must be redacted before objective AI'
);

assert.ok(
  !scrubbed.includes(
    '123 Main Street'
  ),
  'street address must be redacted before objective AI'
);

assert.ok(
  scrubbed.includes(
    '[EMAIL REDACTED]'
  ) &&
  scrubbed.includes(
    '[PHONE REDACTED]'
  ) &&
  scrubbed.includes(
    '[ID REDACTED]'
  ) &&
  scrubbed.includes(
    '[ADDRESS REDACTED]'
  ),
  'PII redaction tokens must be explicit'
);

console.log(
  '✓ objective AI common-pattern PII scrubbing'
);

/*
 * Comprehensive prompt privacy contract:
 * every variable field that can be included in the OpenAI prompt
 * must pass through the PII scrubber.
 */
const {
  buildObjectiveEvidencePrompt,
} = helper;

const allContextPrompt =
  buildObjectiveEvidencePrompt({
    studentResponse:
      'Response email student1@example.com.',
    questionText:
      'Question contact teacher2@example.com at 636-555-1001.',
    itemLabel:
      '123 Label Avenue',
    objectives: [
      {
        component_order: 1,
        component_label:
          'Call 636-555-1002',
        objective_max: 1,
        code:
          'S999.CG1.O1',
        objective_text:
          'Objective contact objective@example.com',
        objective_wording_criterion:
          'Criterion address 321 Criterion Road',
        mastery_field:
          'Mastery 123-45-6789',
        parent_goal_criterion:
          'Parent contact 636-555-1003',
        measurement_method:
          'Measure at 444 Measure Street',
      },
    ],
  });

for (const rawPii of [
  'student1@example.com',
  'teacher2@example.com',
  '636-555-1001',
  '123 Label Avenue',
  '636-555-1002',
  'objective@example.com',
  '321 Criterion Road',
  '123-45-6789',
  '636-555-1003',
  '444 Measure Street',
]) {
  assert.ok(
    !allContextPrompt.includes(
      rawPii
    ),
    `AI prompt must not contain raw PII: ${rawPii}`
  );
}

for (const token of [
  '[EMAIL REDACTED]',
  '[PHONE REDACTED]',
  '[ADDRESS REDACTED]',
  '[ID REDACTED]',
]) {
  assert.ok(
    allContextPrompt.includes(
      token
    ),
    `AI prompt should preserve explicit redaction token ${token}`
  );
}

console.log(
  '✓ objective AI scrubs all variable prompt context'
);
