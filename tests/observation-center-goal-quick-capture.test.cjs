const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const runtimePath = path.join(
  root,
  'site/web/tc-observation.js'
);

const quickCapturePath = path.join(
  root,
  'site/web/tc-observation-quick-capture.js'
);

const observationPagePath = path.join(
  root,
  'site/teacher/observations/index.html'
);

const domContractPath = path.join(
  root,
  'tests/observation-center-goal-quick-capture-dom.test.cjs'
);

const runtime = fs.readFileSync(runtimePath, 'utf8');
const page = fs.readFileSync(observationPagePath, 'utf8');
const quickCapture = fs.existsSync(quickCapturePath)
  ? fs.readFileSync(quickCapturePath, 'utf8')
  : '';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
  }
}

console.log('\n--- OBS-9B goal-driven quick capture contract ---');

test(
  'OBS-9B is a dedicated Observation-Center-only enhancer module',
  () => {
    assert.ok(
      fs.existsSync(quickCapturePath),
      'missing tc-observation-quick-capture.js'
    );
    assert.match(quickCapture, /\/teacher\/observations\/?/);
    assert.match(quickCapture, /obs-center-capture-card/);
  }
);

test(
  'Observation page loads the enhancer after the established observation runtime',
  () => {
    const runtimeIndex = page.indexOf('/web/tc-observation.js');
    const quickIndex = page.indexOf('/web/tc-observation-quick-capture.js');

    assert.notEqual(runtimeIndex, -1);
    assert.notEqual(quickIndex, -1);
    assert.ok(quickIndex > runtimeIndex);
    assert.match(page, /tc-observation-quick-capture\.js\?v=20260906-obs9b-quick-capture/);
  }
);

test(
  'existing tc-observation capture engine is not forked into OBS-9B',
  () => {
    assert.doesNotMatch(runtime, /obs-center-quick-capture/);
    assert.doesNotMatch(runtime, /tc-observation-quick-capture/);
    assert.doesNotMatch(quickCapture, /function\s+saveObservation\s*\(/);
    assert.doesNotMatch(quickCapture, /function\s+buildGoalCard\s*\(/);
  }
);

test(
  'quick capture only reshapes existing Center card controls',
  () => {
    assert.match(quickCapture, /obs-response-btn/);
    assert.match(quickCapture, /obs-prompt-btn/);
    assert.match(quickCapture, /obs-tally-input/);
    assert.match(quickCapture, /obs-checklist-item/);
    assert.match(quickCapture, /obs-note-input/);
  }
);

test(
  'unfinished Center cards open ready for capture while recorded cards stay collapsed',
  () => {
    assert.match(quickCapture, /aria-expanded/);
    assert.match(quickCapture, /Recorded/i);
    assert.match(quickCapture, /click\s*\(\s*\)/);
  }
);

test(
  'session save feedback is immediate and the Center card stays open',
  () => {
    assert.match(quickCapture, /Saved ✓/);
    assert.match(quickCapture, /keepOpen|keep-open|reopen/i);
    assert.match(quickCapture, /setTimeout/);
  }
);

test(
  'Absent and No Opportunity are secondary disclosure controls',
  () => {
    assert.match(quickCapture, /obs-center-quick-disposition/);
    assert.match(quickCapture, /Absent \/ No Opportunity/);
    assert.match(quickCapture, /details/);
    assert.match(quickCapture, /summary/);
  }
);

test(
  'optional note stays collapsed until requested',
  () => {
    assert.match(quickCapture, /obs-center-quick-note/);
    assert.match(quickCapture, /Add note/);
    assert.match(quickCapture, /obs-note-input/);
  }
);

test(
  'all four observation categories get distinct quick-capture presentation hooks',
  () => {
    assert.match(quickCapture, /obs-center-quick-session/);
    assert.match(quickCapture, /obs-center-quick-tally/);
    assert.match(quickCapture, /obs-center-quick-prompt/);
    assert.match(quickCapture, /obs-center-quick-checklist/);
  }
);

test(
  'capture cards are widened to avoid the cramped three-across layout',
  () => {
    assert.match(
      quickCapture,
      /obs-center-card-grid[\s\S]{0,500}minmax\((?:3[6-9]0|4\d{2})px,\s*1fr\)/
    );
  }
);

test(
  'OBS-9B reacts to Center rerenders without replacing the Center renderer',
  () => {
    assert.match(quickCapture, /MutationObserver/);
    assert.match(quickCapture, /data-obs9b|dataset\.obs9b/i);
    assert.doesNotMatch(quickCapture, /innerHTML\s*=\s*['"`]/);
  }
);

test(
  'historical locked goal cards are explicitly skipped',
  () => {
    assert.match(quickCapture, /obs-center-goal-locked/);
    assert.match(quickCapture, /return/);
  }
);

test(
  'quick-capture presentation introduces no API, database, or local persistence path',
  () => {
    assert.doesNotMatch(quickCapture, /fetch\s*\(/);
    assert.doesNotMatch(quickCapture, /teacher-sync-observations/);
    assert.doesNotMatch(quickCapture, /\bdb\./);
    assert.doesNotMatch(quickCapture, /localStorage|sessionStorage/);
  }
);

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  childProcess.execFileSync(
    process.execPath,
    [domContractPath],
    {
      cwd: root,
      stdio: 'inherit',
    }
  );
}
