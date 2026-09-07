'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'site', 'web', 'observation-evidence-contract.js');
const registryPath = path.join(root, 'site', 'data', 'observation-evidence-contracts-2026-27.json');

const rawSource = fs.readFileSync(sourcePath, 'utf8');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

const exportedNames = [
  'normalizeEvidenceContract',
  'validateEvidenceContract',
  'getEvidenceContract',
  'isObservationCenterContract',
  'isDirectParentCaptureContract',
  'contractAllowsDisposition',
  'evidenceContractSummary',
  'VALID_EVENT_TYPES',
  'VALID_CAPTURE_SOURCES',
  'VALID_DISPOSITIONS',
];

const cjsSource = rawSource
  .replace(/^export\s+function\s+/gm, 'function ')
  .replace(/^export\s+\{[\s\S]*?\};?\s*$/gm, '');

const sandbox = {
  module: { exports: {} },
  console,
  JSON,
  Set,
  Number,
  String,
};

vm.runInNewContext(
  `${cjsSource}\nmodule.exports = { ${exportedNames.join(', ')} };`,
  sandbox
);

const api = sandbox.module.exports;

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

function goal(code, observationConfig = null) {
  return { code, observation_config: observationConfig };
}

console.log('\n--- OBS-NQ1 reviewed registry ---');

test('registry is versioned for 2026-27', () => {
  assert.strictEqual(registry.version, 1);
  assert.strictEqual(registry.school_year, '2026-27');
  assert.strictEqual(registry.reviewed_on, '2026-09-07');
});

test('registry contains exactly the 20 reviewed non-question goals', () => {
  const expected = [
    'S025.CG3', 'S051.CG5', 'S055.CG2', 'S056.CG4', 'S058.CG1',
    'S059.CG5', 'S059.CG6', 'S060.CG1', 'S060.CG2', 'S061.CG1',
    'S061.CG2', 'S061.CG3', 'S061.CG4', 'S062.CG3', 'S063.CG3',
    'S069.CG1', 'S070.CG1', 'S070.CG4', 'S071.CG1', 'S071.CG2',
  ];
  assert.deepStrictEqual(Object.keys(registry.contracts).sort(), expected.sort());
});

test('every reviewed contract passes generic validation', () => {
  for (const [code, contract] of Object.entries(registry.contracts)) {
    const errors = api.validateEvidenceContract(contract);
    assert.deepStrictEqual(Array.from(errors), [], `${code}: ${errors.join('; ')}`);
  }
});

test('most reviewed contracts are Observation Center capture, but special sources remain special', () => {
  const observationCodes = Object.entries(registry.contracts)
    .filter(([, contract]) => contract.capture_source === 'observation_center')
    .map(([code]) => code);
  assert.strictEqual(observationCodes.length, 15);

  assert.strictEqual(registry.contracts['S055.CG2'].capture_source, 'teacher_review');
  assert.strictEqual(registry.contracts['S063.CG3'].capture_source, 'teacher_review');
  assert.strictEqual(registry.contracts['S069.CG1'].capture_source, 'benchmark');
  assert.strictEqual(registry.contracts['S070.CG1'].capture_source, 'objective_evidence');
  assert.strictEqual(registry.contracts['S070.CG4'].capture_source, 'objective_evidence');
});

test('S060.CG1 stays a three-part composite reading trial', () => {
  const contract = api.getEvidenceContract(goal('S060.CG1'), registry);
  assert.strictEqual(contract.event_type, 'composite');
  assert.strictEqual(contract.components.length, 3);
  assert.deepStrictEqual(
    Array.from(contract.components.map(component => component.key)),
    ['independent_reading', 'comprehension_participation', 'regulation_strategy']
  );
  assert.strictEqual(contract.success_rule.operator, 'all_required_met');
});

test('S060.CG2 records completion plus prompt count rather than a fake percent', () => {
  const contract = api.getEvidenceContract(goal('S060.CG2'), registry);
  assert.strictEqual(contract.event_type, 'count');
  assert.deepStrictEqual(
    Array.from(contract.fields.map(field => field.key)),
    ['completed', 'prompt_count']
  );
  assert.strictEqual(contract.success_rule.rules[1].value, 2);
});

test('S061.CG1 preserves both start latency and prompt count', () => {
  const contract = api.getEvidenceContract(goal('S061.CG1'), registry);
  assert.strictEqual(contract.event_type, 'composite');
  assert.deepStrictEqual(
    Array.from(contract.fields.map(field => field.key)),
    ['start_latency_minutes', 'prompt_count']
  );
});

test('S069.CG1 remains benchmark-only at the parent level', () => {
  const contract = api.getEvidenceContract(goal('S069.CG1'), registry);
  assert.strictEqual(contract.event_type, 'benchmark');
  assert.strictEqual(contract.metric, 'MAP Reading RIT');
  assert.strictEqual(contract.cadence, 'benchmark_only');
  assert.strictEqual(api.isObservationCenterContract(goal('S069.CG1'), registry), false);
  assert.strictEqual(api.isDirectParentCaptureContract(goal('S069.CG1'), registry), true);
});

test('S070 parent goals are objective-driven and reject generic parent capture', () => {
  for (const code of ['S070.CG1', 'S070.CG4']) {
    const contract = api.getEvidenceContract(goal(code), registry);
    assert.strictEqual(contract.event_type, 'objective_driven');
    assert.strictEqual(contract.capture_source, 'objective_evidence');
    assert.strictEqual(api.isDirectParentCaptureContract(goal(code), registry), false);
  }
});

test('S071.CG1 explicitly requires two fast evidence events per period', () => {
  const contract = api.getEvidenceContract(goal('S071.CG1'), registry);
  assert.strictEqual(contract.event_type, 'opportunity');
  assert.strictEqual(contract.high_frequency, true);
  assert.strictEqual(contract.events_per_period, 2);
});

test('No Opportunity is allowed only where the reviewed contract permits it', () => {
  assert.strictEqual(
    api.contractAllowsDisposition(goal('S071.CG2'), 'no_opportunity', registry),
    true
  );
  assert.strictEqual(
    api.contractAllowsDisposition(goal('S069.CG1'), 'no_opportunity', registry),
    false
  );
});

console.log('\n--- Legacy observation compatibility ---');

test('legacy session_outcome maps to opportunity contract', () => {
  const contract = api.getEvidenceContract(goal('LEGACY.1', {
    category: 'session_outcome',
    label: 'Legacy session',
  }));
  assert.strictEqual(contract.event_type, 'opportunity');
  assert.strictEqual(contract.capture_source, 'observation_center');
  assert.strictEqual(contract.legacy_category, 'session_outcome');
});

test('legacy prompt_count preserves target maximum', () => {
  const contract = api.getEvidenceContract(goal('LEGACY.2', {
    category: 'prompt_count',
    label: 'Legacy prompts',
    target_max_prompts: 2,
  }));
  assert.strictEqual(contract.event_type, 'count');
  assert.strictEqual(contract.success_rule.operator, 'lte');
  assert.strictEqual(contract.success_rule.value, 2);
});

test('legacy checklist becomes a required composite', () => {
  const contract = api.getEvidenceContract(goal('LEGACY.3', {
    category: 'behavior_checklist',
    sub_behaviors: ['Wait', 'Listen'],
  }));
  assert.strictEqual(contract.event_type, 'composite');
  assert.strictEqual(contract.components.length, 2);
  assert.strictEqual(contract.success_rule.operator, 'all_required_met');
});

test('embedded goal contract overrides reviewed registry and legacy category', () => {
  const embedded = {
    event_type: 'count',
    capture_source: 'observation_center',
    label: 'Embedded contract',
    fields: [{ key: 'score', kind: 'number' }],
  };
  const contract = api.getEvidenceContract(goal('S025.CG3', {
    category: 'session_outcome',
    evidence_contract: embedded,
  }), registry);
  assert.strictEqual(contract.label, 'Embedded contract');
  assert.strictEqual(contract.event_type, 'count');
});

test('invalid benchmark without metric is rejected', () => {
  const errors = api.validateEvidenceContract({
    event_type: 'benchmark',
    capture_source: 'benchmark',
  });
  assert.ok(errors.some(error => error.includes('metric')));
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('\n✅ OBS-NQ1 evidence contract tests passed');
