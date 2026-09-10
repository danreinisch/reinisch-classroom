'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM } = require('jsdom');

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

function makeGradebookDom(className, codes) {
  const dom = new JSDOM(`
    <!doctype html>
    <html>
      <head></head>
      <body>
        <input id="gbStudentSearch" value="" />
        <div id="classFilterBar">
          <button class="gb-filter-btn active"></button>
        </div>
        <div id="gbA11yStatus"></div>
        <table>
          <thead id="gbTableHead"><tr><th aria-sort="ascending">Student</th></tr></thead>
          <tbody id="gbTableBody"></tbody>
        </table>
      </body>
    </html>
  `, { url: 'https://gradebook.test/teacher/gradebook/' });

  const { document } = dom.window;
  document.querySelector('.gb-filter-btn.active').textContent = className;
  const body = document.querySelector('#gbTableBody');

  for (const code of codes) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'gb-student-cell';
    cell.dataset.tooltip = JSON.stringify({ code, name: code });
    cell.textContent = code;
    row.appendChild(cell);
    body.appendChild(row);
  }

  const summary = document.createElement('tr');
  summary.className = 'gb-summary-row';
  summary.innerHTML = '<td>Class Average</td>';
  body.appendChild(summary);

  return dom;
}

function renderedCodes(document) {
  return Array.from(
    document.querySelectorAll('#gbTableBody tr:not(.gb-summary-row)')
  ).map(row => JSON.parse(
    row.querySelector('.gb-student-cell').dataset.tooltip
  ).code);
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
    installGradebookStudentOrderControls,
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

  const uiStorage = new MemoryStorage();
  const dom = makeGradebookDom(
    className,
    ['S069', 'S075', 'S057', 'S019']
  );
  const { document } = dom.window;
  installGradebookStudentOrderControls(document, uiStorage);

  const orderButton = document.querySelector('#gbStudentOrderButton');
  assert.ok(orderButton, 'individual class must expose Student Order button');
  assert.strictEqual(
    document.querySelector('#gbStudentOrderControls').hidden,
    false,
    'Student Order controls must be visible for an individual class'
  );
  orderButton.click();

  const editor = document.querySelector('#gbStudentOrderBackdrop');
  assert.ok(editor, 'Student Order button must open the order editor');
  assert.deepStrictEqual(
    Array.from(editor.querySelectorAll('.gb-student-order-item'))
      .map(item => item.dataset.code),
    ['S057', 'S019', 'S069', 'S075'],
    'editor must begin in current Infinite Campus default order with new student last'
  );
  assert.strictEqual(
    editor.querySelector('[data-code="S075"] .gb-student-order-new')?.textContent,
    'New',
    'unmapped student must be clearly marked New'
  );

  editor
    .querySelector('[data-code="S057"] [data-order-action="down"]')
    .click();
  editor.querySelector('[data-order-dialog-action="save"]').click();

  assert.deepStrictEqual(
    getSavedStudentOrder(className, uiStorage),
    ['S019', 'S057', 'S069', 'S075'],
    'arrow move + Save Order must persist the exact visible sequence'
  );
  assert.deepStrictEqual(
    renderedCodes(document),
    ['S019', 'S057', 'S069', 'S075'],
    'saved custom order must immediately reorder the Gradebook grid'
  );
  console.log('✓ editor arrow controls save and immediately apply the custom stack');

  orderButton.click();
  document
    .querySelector('[data-order-dialog-action="reset"]')
    .click();
  assert.strictEqual(getSavedStudentOrder(className, uiStorage), null);
  assert.deepStrictEqual(
    renderedCodes(document),
    ['S057', 'S019', 'S069', 'S075'],
    'Reset to Infinite Campus Default must restore the shipped default subset'
  );
  console.log('✓ reset control restores the verified Infinite Campus stack');

  document.querySelector('#gbStudentSearch').value = 'S019';
  orderButton.click();
  assert.strictEqual(
    document.querySelector('#gbStudentOrderBackdrop'),
    null,
    'filtered roster must not open the order editor'
  );
  assert.match(
    document.querySelector('.gb-student-order-status').textContent,
    /Clear the student search/i,
    'filtered roster must explain why editing is blocked'
  );
  console.log('✓ filtered student list cannot accidentally become the saved class order');

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

  dom.window.close();
  console.log('\nGRADEBOOK EDITABLE STUDENT ORDER: PASS');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
