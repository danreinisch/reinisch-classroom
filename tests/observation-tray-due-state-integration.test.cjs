// Contract tests for OBS-2 Observation Tray due-state integration.
//
// OBS-2 changes tray selection/presentation only.
// It must not alter observation persistence, attendance writes,
// objective identity, or reporting.
//
// Run with:
//   node tests/observation-tray-due-state-integration.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const observationPath = path.join(
  __dirname,
  '..',
  'site',
  'web',
  'tc-observation.js'
);

const source = fs.readFileSync(
  observationPath,
  'utf8'
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

console.log(
  '\n--- OBS-2 Observation Tray integration contract ---'
);

test(
  'tray imports the OBS-1 due-state helper',
  () => {
    assert.ok(
      source.includes(
        "await import('/web/observation-due-state.js')"
      ),
      'tc-observation.js must dynamically import observation-due-state.js'
    );

    assert.ok(
      source.includes(
        'computeObservationDueState'
      ),
      'computeObservationDueState must be used by the tray'
    );
  }
);

test(
  'tray imports current-period schedule helpers',
  () => {
    assert.ok(
      source.includes(
        "await import('/web/class-schedule.js')"
      ),
      'tc-observation.js must dynamically import class-schedule.js'
    );

    assert.ok(
      source.includes('getSchedule'),
      'tray must load the class schedule'
    );

    assert.ok(
      source.includes('getCurrentPeriod'),
      'tray must resolve the current class period'
    );
  }
);

test(
  'tray keeps observation class-period configuration authoritative',
  () => {
    assert.ok(
      /observation_config[\s\S]{0,300}class_periods/.test(
        source
      ),
      'due-state integration must use observation_config.class_periods'
    );
  }
);

test(
  'legacy goals use one-observation daily projection without stealing target_window as cadence',
  () => {
    assert.ok(
      /requiredPerWeek\s*:\s*1/.test(source),
      'OBS-2 must preserve the legacy daily expectation with requiredPerWeek: 1'
    );

    assert.ok(
      !/requiredPerWeek\s*:\s*config\.target_window/.test(
        source
      ),
      'target_window is performance criterion data, not collection cadence'
    );

    assert.ok(
      !/requiredPerWeek\s*:\s*goal\.target_window/.test(
        source
      ),
      'goal target_window must not be repurposed as collection cadence'
    );
  }
);

test(
  'today recorded identity is projected into due-state evidence without changing persistence',
  () => {
    assert.ok(
      source.includes('isAlreadyRecorded('),
      'existing recorded identity must remain available'
    );

    assert.ok(
      /kind\s*:\s*['"]observation['"]/.test(
        source
      ),
      'recorded daily identity must be projected as observation evidence for due-state evaluation'
    );
  }
);

test(
  'tray has one central goal due-state resolver',
  () => {
    assert.ok(
      /function\s+getGoalDueState\s*\(/.test(
        source
      ),
      'tc-observation.js must centralize tray due-state evaluation'
    );
  }
);

test(
  'badge counts attention states instead of every unrecorded goal',
  () => {
    assert.ok(
      /function\s+countAttentionNeeded\s*\(/.test(
        source
      ),
      'tray needs a countAttentionNeeded() helper'
    );

    assert.ok(
      /state\s*===\s*['"]due['"]/.test(source),
      'attention count must recognize due state'
    );

    assert.ok(
      /state\s*===\s*['"]urgent['"]/.test(source),
      'attention count must recognize urgent state'
    );
  }
);

test(
  'old all-unrecorded badge calculation is retired',
  () => {
    const badgeStart = source.indexOf(
      'function updateTrayBadge()'
    );

    const badgeEnd = source.indexOf(
      'function openTray()',
      badgeStart
    );

    assert.ok(
      badgeStart >= 0 && badgeEnd > badgeStart,
      'updateTrayBadge section must exist'
    );

    const badgeSection = source.slice(
      badgeStart,
      badgeEnd
    );

    assert.ok(
      !badgeSection.includes(
        'const unrecorded = countUnrecorded(date);'
      ),
      'badge must no longer count every unrecorded goal'
    );

    assert.ok(
      badgeSection.includes(
        'countAttentionNeeded('
      ),
      'badge must use due-state attention count'
    );
  }
);

test(
  'tray content prioritizes due and urgent goals before upcoming goals',
  () => {
    assert.ok(
      /urgent[\s\S]{0,500}due[\s\S]{0,500}upcoming|due[\s\S]{0,500}urgent[\s\S]{0,500}upcoming/.test(
        source
      ),
      'tray ordering must explicitly rank urgent/due ahead of upcoming'
    );
  }
);

test(
  'upcoming cards do not open by default merely because they are unrecorded',
  () => {
    assert.ok(
      /state\s*===\s*['"]due['"]|state\s*===\s*['"]urgent['"]/.test(
        source
      ),
      'card expansion must be driven by attention state'
    );

    assert.ok(
      source.includes(
        'aria-expanded'
      ),
      'existing accessible card expansion contract must remain'
    );
  }
);

test(
  'historical navigation does not apply the live current-period filter',
  () => {
    assert.ok(
      /date\s*===\s*todayStr\(\)/.test(
        source
      ),
      'due-state resolver must distinguish today from historical dates'
    );
  }
);

test(
  'OBS-2 retains the existing observation sync endpoint',
  () => {
    assert.ok(
      source.includes(
        "/.netlify/functions/teacher-sync-observations"
      ),
      'OBS-2 must preserve the established observation persistence endpoint'
    );
  }
);

test(
  'OBS-2 does not introduce disposition persistence',
  () => {
    assert.ok(
      !source.includes(
        'no_opportunity'
      ),
      'No Opportunity persistence is outside OBS-2'
    );

    assert.ok(
      !source.includes(
        "disposition: 'absent'"
      ),
      'Absent disposition persistence is outside OBS-2'
    );
  }
);

console.log(
  `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.log(
    '\n✗ OBS-2 tray integration contract is RED as expected'
  );
  process.exit(1);
}

console.log(
  '\n✅ OBS-2 Observation Tray integration contract passed'
);
