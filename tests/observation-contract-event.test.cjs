'use strict';

const assert = require('assert');
const {
  getReviewedContract,
  normalizeContractData,
  evaluateSuccess,
  calculateContractValue,
  buildContractObservationNotes,
  parseContractObservationNotes,
  buildContractDispositionNotes,
  parseContractDispositionNotes,
} = require('../netlify/functions/_lib/observation-contract-event');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

console.log('\n--- OBS-NQ2 contract event semantics ---');

test('reviewed observation-center contracts resolve but deferred contracts do not', () => {
  assert.strictEqual(getReviewedContract('S060.CG1').event_type, 'composite');
  assert.strictEqual(getReviewedContract('S071.CG1').high_frequency, true);
  assert.strictEqual(getReviewedContract('S055.CG2'), null);
  assert.strictEqual(getReviewedContract('S069.CG1'), null);
  assert.strictEqual(getReviewedContract('S070.CG1'), null);
});

test('ordinary opportunity events are binary evidence', () => {
  const contract = getReviewedContract('S025.CG3');
  const met = normalizeContractData(contract, { result: 'met' });
  const miss = normalizeContractData(contract, { result: 'not_met' });
  assert.strictEqual(met.ok, true);
  assert.strictEqual(calculateContractValue(contract, met.data), 100);
  assert.strictEqual(evaluateSuccess(contract, met.data), true);
  assert.strictEqual(calculateContractValue(contract, miss.data), 0);
  assert.strictEqual(evaluateSuccess(contract, miss.data), false);
});

test('S058 composite requires all three explicit components', () => {
  const contract = getReviewedContract('S058.CG1');
  const incomplete = normalizeContractData(contract, {
    components: {
      identify_conflict: 'met',
      appropriate_regulation_response: 'met',
    },
  });
  assert.strictEqual(incomplete.ok, false);

  const complete = normalizeContractData(contract, {
    components: {
      identify_conflict: 'met',
      appropriate_regulation_response: 'met',
      inappropriate_response_to_avoid: 'not_met',
    },
  });
  assert.strictEqual(complete.ok, true);
  assert.strictEqual(evaluateSuccess(contract, complete.data), false);
  assert.strictEqual(calculateContractValue(contract, complete.data), 0);
});

test('S060 reading trial cannot be reduced to comprehension alone', () => {
  const contract = getReviewedContract('S060.CG1');
  const normalized = normalizeContractData(contract, {
    components: {
      independent_reading: 'met',
      comprehension_participation: 'met',
      regulation_strategy_use: 'met',
    },
  });
  assert.strictEqual(normalized.ok, true);
  assert.strictEqual(calculateContractValue(contract, normalized.data), 100);
});

test('S060 task event preserves raw prompt count while completion remains structured evidence', () => {
  const contract = getReviewedContract('S060.CG2');
  const successful = normalizeContractData(contract, { completed: true, prompt_count: 2 });
  const incomplete = normalizeContractData(contract, { completed: false, prompt_count: 1 });
  assert.strictEqual(successful.ok, true);
  assert.strictEqual(calculateContractValue(contract, successful.data), 2);
  assert.strictEqual(evaluateSuccess(contract, successful.data), true);
  assert.strictEqual(calculateContractValue(contract, incomplete.data), 1);
  assert.strictEqual(evaluateSuccess(contract, incomplete.data), false);
});

test('S061 task initiation requires both latency and prompt threshold', () => {
  const contract = getReviewedContract('S061.CG1');
  const met = normalizeContractData(contract, { start_latency_minutes: 5, prompt_count: 2 });
  const late = normalizeContractData(contract, { start_latency_minutes: 6, prompt_count: 1 });
  assert.strictEqual(calculateContractValue(contract, met.data), 100);
  assert.strictEqual(calculateContractValue(contract, late.data), 0);
});

test('S059 daily schedule trial stores the actual performance percentage', () => {
  const contract = getReviewedContract('S059.CG6');
  const normalized = normalizeContractData(contract, {
    successful_steps: 4,
    total_steps: 5,
    support_level: 'visual schedule only',
  });
  assert.strictEqual(normalized.ok, true);
  assert.strictEqual(calculateContractValue(contract, normalized.data), 80);
  assert.strictEqual(evaluateSuccess(contract, normalized.data), true);
});

test('S061 inappropriate-topic trial treats occurrence as not meeting the criterion', () => {
  const contract = getReviewedContract('S061.CG3');
  const clean = normalizeContractData(contract, { inappropriate_topic_or_comment_occurred: false });
  const occurred = normalizeContractData(contract, { inappropriate_topic_or_comment_occurred: true });
  assert.strictEqual(calculateContractValue(contract, clean.data), 100);
  assert.strictEqual(calculateContractValue(contract, occurred.data), 0);
});

test('S061 social-group rubric preserves the numeric score without inventing a max', () => {
  const contract = getReviewedContract('S061.CG4');
  const normalized = normalizeContractData(contract, { rubric_score: 3 });
  assert.strictEqual(normalized.ok, true);
  assert.strictEqual(calculateContractValue(contract, normalized.data), 3);
  assert.strictEqual(evaluateSuccess(contract, normalized.data), null);
});

test('contract observation notes round-trip structured data, period, event key, and note', () => {
  const contract = getReviewedContract('S071.CG1');
  const notes = buildContractObservationNotes({
    goalCode: 'S071.CG1',
    eventKey: 'period:Period 2:slot:1',
    contract,
    data: { result: 'met' },
    classPeriod: 'Period 2',
    noteText: 'First check',
  });
  const parsed = parseContractObservationNotes(notes);
  assert.strictEqual(parsed.goal_code, 'S071.CG1');
  assert.strictEqual(parsed.event_key, 'period:Period 2:slot:1');
  assert.strictEqual(parsed.classPeriod, 'Period 2');
  assert.deepStrictEqual(parsed.data, { result: 'met' });
  assert.strictEqual(parsed.userNote, 'First check');
});

test('contract dispositions round-trip without erasing event identity', () => {
  const notes = buildContractDispositionNotes({
    disposition: 'no_opportunity',
    eventKey: 'period:Period 2:slot:2',
    classPeriod: 'Period 2',
    noteText: 'Second check did not occur',
  });
  const parsed = parseContractDispositionNotes(notes);
  assert.strictEqual(parsed.disposition, 'no_opportunity');
  assert.strictEqual(parsed.event_key, 'period:Period 2:slot:2');
  assert.strictEqual(parsed.classPeriod, 'Period 2');
  assert.strictEqual(parsed.userNote, 'Second check did not occur');
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('\n✅ OBS-NQ2 contract event tests passed');
