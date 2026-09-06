const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const observation = fs.readFileSync(
  path.join(root, 'site/web/tc-observation.js'),
  'utf8'
);

function section(source, marker, length = 30000) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing source marker: ${marker}`);
  return source.slice(start, start + length);
}

const center = section(
  observation,
  'async function initObservationCenter',
  80000
);

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
  'Observation Center adds a Center-only quick-capture enhancer',
  () => {
    assert.match(center, /enhanceCenterQuickCaptureCard/);
    assert.doesNotMatch(
      observation.slice(0, observation.indexOf('async function initObservationCenter')),
      /enhanceCenterQuickCaptureCard/
    );
  }
);

test(
  'quick capture reuses the existing buildGoalCard capture engine',
  () => {
    const captureCard = section(center, 'const buildCenterCaptureCard', 12000);
    assert.match(captureCard, /buildGoalCard\s*\(/);
    assert.match(captureCard, /enhanceCenterQuickCaptureCard\s*\(/);
  }
);

test(
  'Center quick-capture cards expose their observation category',
  () => {
    assert.match(center, /obs-center-quick-capture/);
    assert.match(center, /dataset\.captureCategory/);
    assert.match(center, /observation_config\?\.category|observation_config\s*\|\|\s*\{\}/);
  }
);

test(
  'unfinished Center cards open ready for one-click capture',
  () => {
    const helper = section(center, 'enhanceCenterQuickCaptureCard', 12000);
    assert.match(helper, /aria-expanded/);
    assert.match(helper, /click\s*\(\s*\)/);
    assert.match(helper, /Recorded|recorded/i);
  }
);

test(
  'Center save feedback is immediate and keeps the capture card open',
  () => {
    const captureCard = section(center, 'const buildCenterCaptureCard', 12000);
    assert.match(captureCard, /Saved ✓/);
    assert.match(captureCard, /aria-expanded/);
    assert.match(captureCard, /click\s*\(\s*\)/);
  }
);

test(
  'Absent and No Opportunity are secondary rather than primary capture controls',
  () => {
    assert.match(center, /obs-center-quick-disposition/);
    assert.match(center, /Absent \/ No Opportunity/);
    assert.match(center, /details/);
    assert.match(center, /summary/);
  }
);

test(
  'optional notes are collapsed until the teacher asks for them',
  () => {
    assert.match(center, /obs-center-quick-note/);
    assert.match(center, /Add note/);
    assert.match(center, /obs-note-input/);
  }
);

test(
  'session outcome controls receive Center-specific quick-capture layout',
  () => {
    assert.match(center, /session_outcome/);
    assert.match(center, /obs-center-quick-session/);
  }
);

test(
  'tally controls receive Center-specific quick-capture layout',
  () => {
    assert.match(center, /tally/);
    assert.match(center, /obs-center-quick-tally/);
  }
);

test(
  'prompt-count controls receive Center-specific quick-capture layout',
  () => {
    assert.match(center, /prompt_count/);
    assert.match(center, /obs-center-quick-prompt/);
  }
);

test(
  'behavior checklist controls receive Center-specific quick-capture layout',
  () => {
    assert.match(center, /behavior_checklist/);
    assert.match(center, /obs-center-quick-checklist/);
  }
);

test(
  'capture cards are widened enough to avoid the cramped three-across layout',
  () => {
    assert.match(
      center,
      /obs-center-card-grid[\s\S]{0,500}minmax\((?:3[6-9]0|4\d{2})px,1fr\)/
    );
  }
);

test(
  'quick-capture presentation does not introduce a second persistence path',
  () => {
    const helper = section(center, 'enhanceCenterQuickCaptureCard', 12000);
    assert.doesNotMatch(helper, /fetch\s*\(/);
    assert.doesNotMatch(helper, /teacher-sync-observations/);
    assert.doesNotMatch(helper, /db\./);
  }
);

test(
  'historical period lock remains in the Center capture path',
  () => {
    const captureCard = section(center, 'const buildCenterCaptureCard', 12000);
    assert.match(captureCard, /historical/);
    assert.match(captureCard, /!periodOverride/);
    assert.match(captureCard, /buildLockedHistoricalGoal/);
  }
);

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exitCode = 1;
