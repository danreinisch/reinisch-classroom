'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const root =
  path.resolve(__dirname, '..');

const observation =
  fs.readFileSync(
    path.join(
      root,
      'site/web/tc-observation.js'
    ),
    'utf8'
  );

function between(
  source,
  startMarker,
  endMarker
) {
  const start =
    source.indexOf(startMarker);

  assert.ok(
    start >= 0,
    `missing source marker: ${startMarker}`
  );

  const end =
    source.indexOf(
      endMarker,
      start + startMarker.length
    );

  assert.ok(
    end > start,
    `missing end marker after ${startMarker}: ${endMarker}`
  );

  return source.slice(
    start,
    end
  );
}

const center =
  between(
    observation,
    'async function initObservationCenter()',
    '\n  // ─── Init'
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
  '--- OBS-8B Observation Center card-deck contract ---'
);

test(
  'Center uses one persistent searchable student rail rather than separate search and select controls',
  () => {
    assert.match(
      center,
      /obs-center-student-rail-search/
    );

    assert.match(
      center,
      /obs-center-student-rail-list/
    );

    assert.doesNotMatch(
      center,
      /obs-center-student-search/
    );

    assert.doesNotMatch(
      center,
      /obs-center-student-select/
    );
  }
);

test(
  'legacy Find observations by prompt is replaced by a compact secondary view control',
  () => {
    assert.doesNotMatch(
      center,
      /Find observations by/
    );

    assert.match(
      center,
      /obs-center-view-toggle/
    );

    assert.match(
      center,
      /obs-center-view-period/
    );
  }
);

test(
  'date navigation is presented as a compact observation deck',
  () => {
    assert.match(
      center,
      /obs-center-date-deck/
    );

    assert.match(
      center,
      /obs-center-date-prev/
    );

    assert.match(
      center,
      /obs-center-date-next/
    );

    assert.match(
      center,
      /obs-center-date-current/
    );
  }
);

test(
  'deck arrows navigate to adjacent instructional days rather than raw calendar days',
  () => {
    assert.match(
      center,
      /getAdjacentInstructionalDate/
    );

    const helperStart =
      center.indexOf(
        'getAdjacentInstructionalDate'
      );

    assert.ok(
      helperStart >= 0
    );

    const helper =
      center.slice(
        helperStart,
        helperStart + 5000
      );

    assert.match(
      helper,
      /isInstructionalDay|getInstructionalDayStatus/
    );

    assert.match(
      center,
      /getAdjacentInstructionalDate\s*\(\s*selectedDate\s*,\s*-1\s*\)/
    );

    assert.match(
      center,
      /getAdjacentInstructionalDate\s*\(\s*selectedDate\s*,\s*1\s*\)/
    );
  }
);

test(
  'date changes carry deck direction so cards can animate left or right',
  () => {
    assert.match(
      center,
      /deckDirection/
    );

    assert.match(
      center,
      /obs-center-deck-back/
    );

    assert.match(
      center,
      /obs-center-deck-forward/
    );

    assert.match(
      center,
      /transition\s*:[^;]*(transform|opacity)/
    );
  }
);

test(
  'student observation goals render into a responsive capture-card grid',
  () => {
    assert.match(
      center,
      /obs-center-card-grid/
    );

    assert.match(
      center,
      /obs-center-capture-card/
    );

    assert.match(
      center,
      /grid-template-columns\s*:\s*repeat\s*\(\s*auto-(?:fit|fill)/
    );
  }
);

test(
  'Center has a reusable capture-card primitive around the existing goal card',
  () => {
    assert.match(
      center,
      /function\s+buildCenterCaptureCard|const\s+buildCenterCaptureCard/
    );

    const primitiveStart =
      center.search(
        /function\s+buildCenterCaptureCard|const\s+buildCenterCaptureCard/
      );

    assert.ok(
      primitiveStart >= 0
    );

    const primitive =
      center.slice(
        primitiveStart,
        primitiveStart + 9000
      );

    assert.match(
      primitive,
      /buildGoalCard\s*\(/
    );

    assert.match(
      primitive,
      /obs-center-capture-card/
    );
  }
);

test(
  'capture-card primitive carries student and goal identity for future multi-student layouts',
  () => {
    assert.match(
      center,
      /dataset\.studentCode|data-student-code/
    );

    assert.match(
      center,
      /dataset\.goalCode|data-goal-code/
    );
  }
);

test(
  'historical period safety is preserved as a compact deck-level gate',
  () => {
    assert.match(
      center,
      /obs-center-period-gate/
    );

    assert.match(
      center,
      /selectedDate\s*!==\s*todayStr\s*\(\)/
    );

    assert.match(
      center,
      /selectedPeriod/
    );

    assert.match(
      center,
      /historical/i
    );
  }
);

test(
  'Center continues to use the existing shared goal-card capture implementation',
  () => {
    assert.match(
      center,
      /buildGoalCard\s*\(/
    );

    assert.doesNotMatch(
      center,
      /function\s+renderSessionOutcomeForm/
    );

    assert.doesNotMatch(
      center,
      /function\s+renderTallyForm/
    );

    assert.doesNotMatch(
      center,
      /function\s+renderPromptCountForm/
    );

    assert.doesNotMatch(
      center,
      /function\s+renderBehaviorChecklistForm/
    );
  }
);

console.log();
console.log(
  `${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.error();
  console.error(
    '❌ OBS-8B card-deck contract RED as expected'
  );
  process.exit(1);
}

console.log();
console.log(
  '✅ OBS-8B Observation Center card-deck contract passed'
);
