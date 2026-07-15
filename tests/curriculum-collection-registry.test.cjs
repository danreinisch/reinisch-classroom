/* eslint-env node */
'use strict';

const assert = require('assert');
const fs = require('fs');

const registry = JSON.parse(
  fs.readFileSync('site/assets/data/units.json', 'utf8')
);

assert.ok(Array.isArray(registry.units), 'units.json must expose a units array');

const expectedBooks = {
  adit: {
    sortOrder: 10,
    baseOut: 'presentations/a-door-into-time',
    pagePath: '/language-arts/a-door-into-time/',
  },
  lik: {
    sortOrder: 20,
    baseOut: 'presentations/lost-in-kragdon-ah',
    pagePath: '/language-arts/lost-in-kragdon-ah/',
  },
  rfk: {
    sortOrder: 30,
    baseOut: 'presentations/return-from-kragdon-ah',
    pagePath: '/language-arts/return-from-kragdon-ah/',
  },
  wok: {
    sortOrder: 40,
    baseOut: 'presentations/warrior-of-kragdon-ah',
    pagePath: '/language-arts/warrior-of-kragdon-ah/',
  },
};

const sortOrders = [];

for (const [id, expected] of Object.entries(expectedBooks)) {
  const unit = registry.units.find((item) => item && item.id === id);

  assert.ok(unit, 'Missing legacy collection: ' + id);
  assert.strictEqual(unit.section, 'language-arts', id + ' must remain Language Arts');
  assert.strictEqual(unit.kind, 'book', id + ' must be marked as a book');
  assert.strictEqual(unit.description, '', id + ' must retain an empty optional description');
  assert.strictEqual(unit.status, 'archived', id + ' must be retired from active discovery');
  assert.strictEqual(unit.sortOrder, expected.sortOrder, id + ' has an unexpected display order');
  assert.strictEqual(unit.slots, 16, id + ' must retain 16 presentation slots');
  assert.strictEqual(unit.baseOut, expected.baseOut, id + ' baseOut changed unexpectedly');
  assert.strictEqual(unit.pagePath, expected.pagePath, id + ' route changed unexpectedly');

  sortOrders.push(unit.sortOrder);
}

const toolkit = registry.units.find(unit => unit && unit.id === 'toolkit');
assert.ok(toolkit, 'Language Arts Toolkit must remain registered');
assert.notStrictEqual(
  toolkit.status,
  'archived',
  'Language Arts Toolkit must remain active'
);

const lifeSkills = registry.units.find(unit => unit && unit.id === 'life');
assert.ok(lifeSkills, 'Life Skills must remain registered');
assert.strictEqual(
  lifeSkills.status,
  'archived',
  'Legacy Life Skills presentations must be retired from active discovery'
);

assert.strictEqual(
  new Set(sortOrders).size,
  sortOrders.length,
  'Legacy collection display orders must remain unique'
);

console.log('PASS: Curriculum Collection Registry v2 legacy-book contract');
