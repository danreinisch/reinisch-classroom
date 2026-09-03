// Unit tests for the pure Observation due-state foundation.
//
// OBS-1 scope:
// - instructional-day eligibility
// - weekly collection cadence
// - configured class-period eligibility
// - collected observation count
// - Absent / No Opportunity dispositions
// - due / urgent / satisfied / excused / upcoming states
//
// Foundation implementation:
//   site/web/observation-due-state.js
//
// Run with:
//   node tests/observation-due-state.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const helperPath = path.join(
  __dirname,
  '..',
  'site',
  'web',
  'observation-due-state.js'
);

const instructionalPath = path.join(
  __dirname,
  '..',
  'site',
  'web',
  'instructional-day.js'
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

function loadHelper() {
  if (!fs.existsSync(helperPath)) {
    return null;
  }

  const instructionalRaw = fs.readFileSync(
    instructionalPath,
    'utf8'
  );

  const helperRaw = fs.readFileSync(
    helperPath,
    'utf8'
  );

  const instructionalCjs = instructionalRaw
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+function\s+/gm, 'function ')
    .replace(/^export\s+/gm, '');

  const instructionalSandbox = {
    module: { exports: {} },
  };

  vm.runInNewContext(
    instructionalCjs +
      `
      module.exports = {
        isInstructionalDay
      };
      `,
    instructionalSandbox
  );

  const {
    isInstructionalDay,
  } = instructionalSandbox.module.exports;

  const helperCjs = helperRaw
    .replace(
      /^import\s+\{[^}]+\}\s+from\s+['"]\/web\/instructional-day\.js['"];\s*$/gm,
      ''
    )
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+function\s+/gm, 'function ')
    .replace(/^export\s+/gm, '');

  const helperSandbox = {
    module: { exports: {} },
    isInstructionalDay,
  };

  vm.runInNewContext(
    helperCjs +
      `
      module.exports = {
        computeObservationDueState
      };
      `,
    helperSandbox
  );

  return (
    helperSandbox.module.exports
      .computeObservationDueState
  );
}

const computeObservationDueState = loadHelper();

function evaluate(overrides = {}) {
  if (typeof computeObservationDueState !== 'function') {
    throw new Error(
      'site/web/observation-due-state.js is not implemented yet'
    );
  }

  return computeObservationDueState({
    date: '2026-09-14',
    requiredPerWeek: 2,
    classPeriods: ['Language Arts 3 SC'],
    currentPeriod: 'Language Arts 3 SC',
    entries: [],
    ...overrides,
  });
}

function observation(
  date,
  classPeriod = 'Language Arts 3 SC'
) {
  return {
    date,
    classPeriod,
    kind: 'observation',
  };
}

function disposition(
  date,
  value,
  classPeriod = 'Language Arts 3 SC'
) {
  return {
    date,
    classPeriod,
    kind: 'disposition',
    disposition: value,
  };
}

console.log(
  '\n--- OBS-1 Observation due-state contract ---'
);

test(
  'pure due-state helper exists',
  () => {
    assert.strictEqual(
      typeof computeObservationDueState,
      'function',
      'site/web/observation-due-state.js must export computeObservationDueState()'
    );
  }
);

if (typeof computeObservationDueState === 'function') {
  test(
    'non-instructional date is not scheduled',
    () => {
      const result = evaluate({
        date: '2026-09-12',
      });

      assert.strictEqual(
        result.state,
        'not_scheduled'
      );
      assert.strictEqual(
        result.remaining,
        0
      );
    }
  );

  test(
    'two-per-week goal with no Monday data is due but not urgent',
    () => {
      const result = evaluate();

      assert.strictEqual(result.state, 'due');
      assert.strictEqual(result.required, 2);
      assert.strictEqual(result.collected, 0);
      assert.strictEqual(result.remaining, 2);
      assert.strictEqual(result.urgent, false);
    }
  );

  test(
    'one of two collected by Thursday leaves one due but not yet urgent',
    () => {
      const result = evaluate({
        date: '2026-09-17',
        entries: [
          observation('2026-09-15'),
        ],
      });

      assert.strictEqual(result.state, 'due');
      assert.strictEqual(result.collected, 1);
      assert.strictEqual(result.remaining, 1);
      assert.strictEqual(result.urgent, false);
    }
  );

  test(
    'one of two collected by Friday makes the remaining observation urgent',
    () => {
      const result = evaluate({
        date: '2026-09-18',
        entries: [
          observation('2026-09-15'),
        ],
      });

      assert.strictEqual(result.state, 'urgent');
      assert.strictEqual(result.collected, 1);
      assert.strictEqual(result.remaining, 1);
      assert.strictEqual(result.urgent, true);
    }
  );

  test(
    'shortened school week advances urgency before the final calendar weekday',
    () => {
      const result = evaluate({
        date: '2026-10-28',
        entries: [
          observation('2026-10-27'),
        ],
      });

      assert.strictEqual(result.state, 'urgent');
      assert.strictEqual(result.collected, 1);
      assert.strictEqual(result.remaining, 1);
      assert.strictEqual(result.urgent, true);
      assert.strictEqual(result.futureInstructionalDays, 0);
    }
  );

  test(
    'weekly cadence is satisfied after the required evidence count',
    () => {
      const result = evaluate({
        date: '2026-09-17',
        entries: [
          observation('2026-09-14'),
          observation('2026-09-16'),
        ],
      });

      assert.strictEqual(
        result.state,
        'satisfied'
      );
      assert.strictEqual(result.collected, 2);
      assert.strictEqual(result.remaining, 0);
    }
  );

  test(
    'prior-week observations do not satisfy the current instructional week',
    () => {
      const result = evaluate({
        entries: [
          observation('2026-09-10'),
          observation('2026-09-11'),
        ],
      });

      assert.strictEqual(result.state, 'due');
      assert.strictEqual(result.collected, 0);
      assert.strictEqual(result.remaining, 2);
    }
  );

  test(
    'goal configured for another class period is upcoming rather than currently due',
    () => {
      const result = evaluate({
        currentPeriod: 'Language Arts 1 SC',
      });

      assert.strictEqual(
        result.state,
        'upcoming'
      );
      assert.strictEqual(
        result.currentPeriodEligible,
        false
      );
      assert.strictEqual(result.remaining, 2);
    }
  );

  test(
    'Absent resolves the current opportunity without becoming evidence',
    () => {
      const result = evaluate({
        entries: [
          disposition(
            '2026-09-14',
            'absent'
          ),
        ],
      });

      assert.strictEqual(result.state, 'excused');
      assert.strictEqual(
        result.disposition,
        'absent'
      );
      assert.strictEqual(result.collected, 0);
      assert.strictEqual(result.remaining, 2);
    }
  );

  test(
    'No Opportunity resolves the current opportunity without becoming evidence',
    () => {
      const result = evaluate({
        entries: [
          disposition(
            '2026-09-14',
            'no_opportunity'
          ),
        ],
      });

      assert.strictEqual(result.state, 'excused');
      assert.strictEqual(
        result.disposition,
        'no_opportunity'
      );
      assert.strictEqual(result.collected, 0);
      assert.strictEqual(result.remaining, 2);
    }
  );

  test(
    'a disposition in another class period does not excuse the current opportunity',
    () => {
      const result = evaluate({
        entries: [
          disposition(
            '2026-09-14',
            'absent',
            'Transitional Skills'
          ),
        ],
      });

      assert.strictEqual(result.state, 'due');
      assert.strictEqual(result.collected, 0);
      assert.strictEqual(result.remaining, 2);
    }
  );
}

console.log(
  `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.log(
    '\n✗ OBS-1 due-state contract is RED as expected'
  );
  process.exit(1);
}

console.log(
  '\n✅ OBS-1 Observation due-state contract passed'
);
