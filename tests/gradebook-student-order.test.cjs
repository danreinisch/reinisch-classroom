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

function makeGradebookDom(className, codes, { explicitSort = true } = {}) {
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
          <thead id="gbTableHead"><tr><th aria-sort="${explicitSort ? 'ascending' : 'none'}">Student</th></tr></thead>
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

function dispatchInput(dom, element) {
  element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

function addMissingWorkFilter(dom, checked = true) {
  const { document } = dom.window;
  const label = document.createElement('label');
  label.className = 'gb-missing-filter-label';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  label.appendChild(checkbox);
  label.appendChild(document.createTextNode('Show only students with missing work'));
  document.body.appendChild(label);
  return { label, checkbox };
}

async function wait(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const repoRoot = path.join(__dirname, '..');
  const helperPath = path.join(repoRoot, 'site', 'web', 'gradebook-roster-order.js');
  const safetyPath = path.join(repoRoot, 'site', 'web', 'gradebook-student-order-safety.js');
  const constantsPath = path.join(repoRoot, 'site', 'web', 'constants.js');
  const helper = await import(pathToFileURL(helperPath).href);
  const safety = await import(pathToFileURL(safetyPath).href);

  const {
    LOCKED_IC_ROSTER_ORDER,
    STUDENT_ORDER_STORAGE_KEY,
    getSavedStudentOrder,
    saveStudentOrder,
    resetStudentOrder,
    sortStudentsForGradebookClass,
    installGradebookStudentOrderControls,
  } = helper;
  const {
    getStudentOrderUnsafeReason,
    installGradebookStudentOrderSafety,
  } = safety;

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
  const safetyInstall = installGradebookStudentOrderSafety(document);
  installGradebookStudentOrderControls(document, uiStorage);

  const orderButton = document.querySelector('#gbStudentOrderButton');
  assert.ok(orderButton, 'individual class must expose Student Order button');
  assert.strictEqual(
    document.querySelector('#gbStudentOrderControls').hidden,
    false,
    'Student Order controls must be visible for an individual class'
  );
  orderButton.click();
  await wait(0);

  let editor = document.querySelector('#gbStudentOrderBackdrop');
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

  const search = document.querySelector('#gbStudentSearch');
  search.value = 'S019';
  dispatchInput(dom, search);
  orderButton.click();
  assert.strictEqual(
    document.querySelector('#gbStudentOrderBackdrop'),
    null,
    'nonempty search must not open the order editor'
  );
  assert.match(
    document.querySelector('.gb-student-order-status').textContent,
    /Clear the student search/i,
    'nonempty search must explain why editing is blocked'
  );

  search.value = '';
  dispatchInput(dom, search);
  orderButton.click();
  assert.strictEqual(
    document.querySelector('#gbStudentOrderBackdrop'),
    null,
    'cleared search must still be blocked while the Gradebook debounce can leave partial rows rendered'
  );
  assert.match(
    document.querySelector('.gb-student-order-status').textContent,
    /restoring the full roster/i,
    'search debounce guard must explain that the full roster is still restoring'
  );
  await wait(330);
  assert.strictEqual(getStudentOrderUnsafeReason(document), '');
  console.log('✓ search debounce race cannot save a partial roster');

  const missing = addMissingWorkFilter(dom, true);
  orderButton.click();
  assert.strictEqual(
    document.querySelector('#gbStudentOrderBackdrop'),
    null,
    'missing-work subset must not open the order editor'
  );
  assert.match(
    document.querySelector('.gb-student-order-status').textContent,
    /Show only students with missing work/i,
    'missing-work guard must explain which filter to turn off'
  );
  console.log('✓ Missing Work subset cannot become the saved class order');

  missing.checkbox.checked = false;
  orderButton.click();
  await wait(0);
  editor = document.querySelector('#gbStudentOrderBackdrop');
  assert.ok(editor, 'editor must open after partial-roster filters are cleared');

  const dialog = editor.querySelector('.gb-student-order-dialog');
  const focusable = Array.from(
    dialog.querySelectorAll('button:not([disabled])')
  );
  const firstFocusable = focusable[0];
  const lastFocusable = focusable[focusable.length - 1];
  lastFocusable.focus();
  dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
  }));
  assert.strictEqual(
    document.activeElement,
    firstFocusable,
    'Tab from the last control must wrap inside the modal'
  );
  console.log('✓ Student Order modal traps keyboard focus');

  editor
    .querySelector('[data-code="S057"] [data-order-action="down"]')
    .click();
  missing.checkbox.checked = true;
  editor.querySelector('[data-order-dialog-action="save"]').click();
  assert.strictEqual(
    getSavedStudentOrder(className, uiStorage),
    null,
    'Save must be blocked if a partial-roster filter becomes active while the editor is open'
  );
  assert.ok(
    document.querySelector('#gbStudentOrderBackdrop'),
    'blocked Save must keep the editor open for correction/cancel'
  );
  missing.checkbox.checked = false;
  document.querySelector('[data-order-dialog-action="cancel"]').click();
  console.log('✓ Save rechecks partial-roster safety before persistence');

  const unlockedStorage = new MemoryStorage();
  saveStudentOrder('Consumer Math', ['S902', 'S901'], unlockedStorage);
  const unlockedDom = makeGradebookDom(
    'Consumer Math',
    ['S902', 'S901'],
    { explicitSort: true }
  );
  const unlockedDocument = unlockedDom.window.document;
  const unlockedSafety = installGradebookStudentOrderSafety(unlockedDocument);
  installGradebookStudentOrderControls(unlockedDocument, unlockedStorage);
  unlockedDocument.querySelector('#gbStudentOrderButton').click();
  await wait(0);
  unlockedDocument
    .querySelector('[data-order-dialog-action="reset"]')
    .click();
  assert.deepStrictEqual(
    getSavedStudentOrder('Consumer Math', unlockedStorage),
    ['S902', 'S901'],
    'Reset to Default must not silently delete a custom order while an explicit column sort owns the visible stack'
  );
  assert.match(
    unlockedDocument.querySelector('.gb-student-order-status').textContent,
    /Clear the active Gradebook column sort/i
  );
  console.log('✓ unlocked-class reset cannot leave saved state and visible sorted state disagreeing');

  const helperSource = fs.readFileSync(helperPath, 'utf8');
  const safetySource = fs.readFileSync(safetyPath, 'utf8');
  const constantsSource = fs.readFileSync(constantsPath, 'utf8');
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
    assert.ok(helperSource.includes(marker), `missing Student Order UI contract marker: ${marker}`);
  }
  assert.ok(
    safetySource.includes('.gb-missing-filter-label input[type="checkbox"]:checked'),
    'safety guard must detect the existing Missing Work subset checkbox'
  );
  assert.ok(
    constantsSource.includes('/web/gradebook-student-order-safety.js?v=20260910-partial-roster-guard'),
    'Gradebook bootstrap must load the cache-busted Student Order safety guard'
  );
  console.log('✓ Gradebook bootstrap loads the partial-roster safety guard');

  safetyInstall?.dispose();
  unlockedSafety?.dispose();
  dom.window.close();
  unlockedDom.window.close();
  console.log('\nGRADEBOOK EDITABLE STUDENT ORDER: PASS');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
