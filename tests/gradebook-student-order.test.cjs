'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

async function main() {
  const repoRoot = path.join(__dirname, '..');
  const helperPath = path.join(repoRoot, 'site', 'web', 'gradebook-roster-order.js');
  const helper = await import(pathToFileURL(helperPath).href);

  const {
    LOCKED_IC_ROSTER_ORDER,
    STUDENT_ORDER_STORAGE_KEY,
    getSavedStudentOrder,
    saveStudentOrder,
    resetStudentOrder,
    sortStudentsForGradebookClass,
  } = helper;

  console.log('--- Gradebook editable student order ---');

  assert.strictEqual(
    Object.values(LOCKED_IC_ROSTER_ORDER).reduce(
      (sum, codes) => sum + codes.length,
      0
    ),
    62,
    'the six captured Infinite Campus defaults must retain all 62 grade-entry positions'
  );
  console.log('✓ six Infinite Campus defaults retain 62 grade-entry positions');

  const storage = new MemoryStorage();
  const className = 'Language Arts 3 SC';
  const defaultOrder = LOCKED_IC_ROSTER_ORDER[className];
  const customOrder = [defaultOrder[1], defaultOrder[0], ...defaultOrder.slice(2)];

  assert.strictEqual(getSavedStudentOrder(className, storage), null);
  assert.strictEqual(saveStudentOrder(className, customOrder, storage), true);
  assert.deepStrictEqual(getSavedStudentOrder(className, storage), customOrder);
  assert.ok(
    storage.getItem(STUDENT_ORDER_STORAGE_KEY),
    'custom order must be stored under the 2026–27 Gradebook-only key'
  );
  console.log('✓ teacher-saved order persists by class in browser storage');

  const scrambled = [...defaultOrder]
    .reverse()
    .map(code => ({ code, name: code }));
  scrambled.push({ code: 'S075', name: 'S075' });

  assert.deepStrictEqual(
    sortStudentsForGradebookClass(className, scrambled, storage)
      .map(student => student.code),
    [...customOrder, 'S075'],
    'saved order must win and a newly added student must remain visible at the bottom'
  );
  console.log('✓ saved order wins while new students append safely at the bottom');

  const otherClass = 'Language Arts 4 SC';
  const otherDefault = LOCKED_IC_ROSTER_ORDER[otherClass];
  assert.deepStrictEqual(
    sortStudentsForGradebookClass(
      otherClass,
      [...otherDefault].reverse().map(code => ({ code, name: code })),
      storage
    ).map(student => student.code),
    otherDefault,
    'one class custom order must not affect another class'
  );
  console.log('✓ student order preference is isolated per class');

  assert.strictEqual(resetStudentOrder(className, storage), true);
  assert.strictEqual(getSavedStudentOrder(className, storage), null);
  assert.deepStrictEqual(
    sortStudentsForGradebookClass(className, scrambled, storage)
      .map(student => student.code),
    [...defaultOrder, 'S075'],
    'reset must restore the captured Infinite Campus default and keep new students visible'
  );
  console.log('✓ reset restores Infinite Campus default without dropping a new student');

  storage.setItem(STUDENT_ORDER_STORAGE_KEY, '{not-json');
  assert.strictEqual(
    getSavedStudentOrder(className, storage),
    null,
    'corrupt browser storage must fail safely back to defaults'
  );
  console.log('✓ malformed browser storage fails safely');

  const source = fs.readFileSync(helperPath, 'utf8');
  for (const marker of [
    '↕ Student Order',
    'Save Order',
    'Reset to Infinite Campus Default',
    'item.draggable = true',
    'up.dataset.orderAction = "up"',
    'down.dataset.orderAction = "down"',
    'New students appear at the bottom',
    'saved only in this browser',
  ]) {
    assert.ok(source.includes(marker), `missing Student Order UI contract marker: ${marker}`);
  }
  console.log('✓ Gradebook editor exposes drag, arrow, save, reset, and new-student affordances');

  console.log('\nGRADEBOOK EDITABLE STUDENT ORDER: PASS');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
