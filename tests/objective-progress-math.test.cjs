'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Running objective progress math tests...\n');

const helperPath = path.join(
  __dirname,
  '..',
  'netlify',
  'functions',
  '_lib',
  'objective-progress.js'
);

assert.ok(
  fs.existsSync(helperPath),
  'Slice 5A objective progress helper must exist'
);

const {
  summarizeObjectiveEvidence,
  rollUpParentObjectives,
  selectParentDisplayProgress,
} = require(helperPath);

assert.strictEqual(
  typeof summarizeObjectiveEvidence,
  'function',
  'summarizeObjectiveEvidence must be exported'
);

assert.strictEqual(
  typeof rollUpParentObjectives,
  'function',
  'rollUpParentObjectives must be exported'
);

assert.strictEqual(
  typeof selectParentDisplayProgress,
  'function',
  'selectParentDisplayProgress must be exported'
);

/* -------------------------------------------------------------------------- */
/* One objective: numerator / denominator semantics                           */
/* -------------------------------------------------------------------------- */

{
  const summary = summarizeObjectiveEvidence([
    {
      objective_earned: 5,
      objective_max: 20,
    },
  ]);

  assert.deepStrictEqual(
    summary,
    {
      earned: 5,
      max: 20,
      percentage: 25,
      evidence_count: 1,
    }
  );

  console.log(
    '✓ 5/20 objective evidence = 25%'
  );
}

{
  const summary = summarizeObjectiveEvidence([
    {
      objective_earned: 1,
      objective_max: 2,
    },
    {
      objective_earned: 3,
      objective_max: 3,
    },
  ]);

  /*
   * Within ONE objective, evidence is denominator-aware:
   * 4 earned / 5 possible = 80%.
   */
  assert.strictEqual(
    summary.earned,
    4
  );

  assert.strictEqual(
    summary.max,
    5
  );

  assert.strictEqual(
    summary.percentage,
    80
  );

  assert.strictEqual(
    summary.evidence_count,
    2
  );

  console.log(
    '✓ one objective aggregates earned/max across its own evidence'
  );
}

{
  const summary = summarizeObjectiveEvidence([]);

  assert.deepStrictEqual(
    summary,
    {
      earned: 0,
      max: 0,
      percentage: null,
      evidence_count: 0,
    }
  );

  console.log(
    '✓ no objective evidence is No data, never 0%'
  );
}

/* -------------------------------------------------------------------------- */
/* Parent roll-up: siblings are equally weighted                              */
/* -------------------------------------------------------------------------- */

{
  const rollup = rollUpParentObjectives([
    {
      code: 'S009.CG1.O1',
      percentage: 25,
      evidence_count: 20,
    },
    {
      code: 'S009.CG1.O2',
      percentage: 75,
      evidence_count: 20,
    },
  ]);

  assert.deepStrictEqual(
    rollup,
    {
      percentage: 50,
      objectives_with_data: 2,
      total_objectives: 2,
    }
  );

  console.log(
    '✓ 25% + 75% sibling objectives roll up to parent 50%'
  );
}

{
  const rollup = rollUpParentObjectives([
    {
      code: 'S009.CG1.O1',
      percentage: 25,
      evidence_count: 20,
    },
    {
      code: 'S009.CG1.O2',
      percentage: 75,
      evidence_count: 4,
    },
  ]);

  assert.strictEqual(
    rollup.percentage,
    50,
    'evidence volume must not weight one sibling objective more heavily'
  );

  console.log(
    '✓ parent roll-up is equal-weighted across objectives, not evidence volume'
  );
}

{
  const rollup = rollUpParentObjectives([
    {
      code: 'S015.CG1.O1',
      percentage: 60,
      evidence_count: 3,
    },
    {
      code: 'S015.CG1.O2',
      percentage: null,
      evidence_count: 0,
    },
    {
      code: 'S015.CG1.O3',
      percentage: null,
      evidence_count: 0,
    },
  ]);

  assert.deepStrictEqual(
    rollup,
    {
      percentage: 60,
      objectives_with_data: 1,
      total_objectives: 3,
    }
  );

  console.log(
    '✓ missing sibling evidence is excluded and coverage remains explicit'
  );
}

{
  const rollup = rollUpParentObjectives([
    {
      code: 'S009.CG1.O1',
      percentage: 0,
      evidence_count: 5,
    },
    {
      code: 'S009.CG1.O2',
      percentage: 100,
      evidence_count: 5,
    },
  ]);

  assert.deepStrictEqual(
    rollup,
    {
      percentage: 50,
      objectives_with_data: 2,
      total_objectives: 2,
    }
  );

  console.log(
    '✓ measured 0% is real evidence and participates in parent roll-up'
  );
}

{
  const rollup = rollUpParentObjectives([
    {
      code: 'S009.CG1.O1',
      percentage: 0,
      evidence_count: 0,
    },
    {
      code: 'S009.CG1.O2',
      percentage: 80,
      evidence_count: 4,
    },
  ]);

  assert.deepStrictEqual(
    rollup,
    {
      percentage: 80,
      objectives_with_data: 1,
      total_objectives: 2,
    }
  );

  console.log(
    '✓ zero with zero evidence is excluded as No data'
  );
}

{
  const rollup = rollUpParentObjectives([
    {
      code: 'S015.CG1.O1',
      percentage: null,
      evidence_count: 0,
    },
    {
      code: 'S015.CG1.O2',
      percentage: null,
      evidence_count: 0,
    },
  ]);

  assert.deepStrictEqual(
    rollup,
    {
      percentage: null,
      objectives_with_data: 0,
      total_objectives: 2,
    }
  );

  console.log(
    '✓ zero child evidence yields no synthetic parent percentage'
  );
}

/* -------------------------------------------------------------------------- */
/* Parent display precedence                                                  */
/* -------------------------------------------------------------------------- */

{
  const selected = selectParentDisplayProgress({
    objective_rollup: {
      percentage: 50,
      objectives_with_data: 2,
      total_objectives: 2,
    },
    existing_parent_percentage: 82,
  });

  assert.deepStrictEqual(
    selected,
    {
      percentage: 50,
      source: 'objective_rollup',
      objectives_with_data: 2,
      total_objectives: 2,
    }
  );

  console.log(
    '✓ child-objective roll-up drives parent display when child data exists'
  );
}

{
  const selected = selectParentDisplayProgress({
    objective_rollup: {
      percentage: null,
      objectives_with_data: 0,
      total_objectives: 3,
    },
    existing_parent_percentage: 82,
  });

  assert.deepStrictEqual(
    selected,
    {
      percentage: 82,
      source: 'existing_parent',
      objectives_with_data: 0,
      total_objectives: 3,
    }
  );

  console.log(
    '✓ existing parent behavior remains fallback when no child has data'
  );
}

console.log('');
console.log('OBJECTIVE PROGRESS MATH: PASS');
