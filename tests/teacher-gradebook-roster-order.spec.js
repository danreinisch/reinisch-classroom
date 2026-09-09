import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  INFINITE_CAMPUS_ROSTER_ORDER,
  sortStudentCodesForClass,
  reorderGradebookRows,
} from '../site/web/gradebook-roster-order.js';

function makeGradebookDom(className, codes, { explicitSort = false } = {}) {
  const dom = new JSDOM(`
    <div id="classFilterBar">
      <button class="gb-filter-btn active"></button>
    </div>
    <table>
      <thead id="gbTableHead"><tr><th aria-sort="${explicitSort ? 'ascending' : 'none'}">Student</th></tr></thead>
      <tbody id="gbTableBody"></tbody>
    </table>
  `);
  const { document } = dom.window;
  document.querySelector('.gb-filter-btn.active').textContent = className;
  const body = document.querySelector('#gbTableBody');

  for (const code of codes) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'gb-student-cell';
    cell.dataset.tooltip = JSON.stringify({ code });
    row.appendChild(cell);
    body.appendChild(row);
  }

  const summary = document.createElement('tr');
  summary.className = 'gb-summary-row';
  const summaryCell = document.createElement('td');
  summaryCell.className = 'gb-student-cell';
  summaryCell.textContent = 'Class Average';
  summary.appendChild(summaryCell);
  body.appendChild(summary);

  return document;
}

function renderedCodes(document) {
  return Array.from(document.querySelectorAll('#gbTableBody tr:not(.gb-summary-row)'))
    .map((row) => JSON.parse(row.querySelector('.gb-student-cell').dataset.tooltip).code);
}

test('configured class rosters sort to the exact Infinite Campus order', () => {
  for (const [className, expected] of Object.entries(INFINITE_CAMPUS_ROSTER_ORDER)) {
    const scrambled = [...expected].reverse();
    expect(sortStudentCodesForClass(scrambled, className)).toEqual(expected);
  }
});

test('a future unconfigured student stays after configured students without being dropped', () => {
  const sorted = sortStudentCodesForClass(
    ['S999', 'S036', 'S057', 'S998', 'S019'],
    'Language Arts 3 SC'
  );

  expect(sorted).toEqual(['S057', 'S019', 'S036', 'S999', 'S998']);
});

test('unconfigured classes keep their existing order', () => {
  const original = ['S003', 'S001', 'S002'];
  expect(sortStudentCodesForClass(original, 'Consumer Math')).toEqual(original);
});

test('rendered gradebook rows are reordered while the Class Average row remains last', () => {
  const expected = INFINITE_CAMPUS_ROSTER_ORDER['Language Arts 4 SC'];
  const document = makeGradebookDom('Language Arts 4 SC', [...expected].reverse());

  expect(reorderGradebookRows(document)).toBe(true);
  expect(renderedCodes(document)).toEqual(expected);
  expect(document.querySelector('#gbTableBody tr:last-child').classList.contains('gb-summary-row')).toBe(true);
  expect(document.querySelector('#gbTableBody tr:first-child').classList.contains('gb-highlighted')).toBe(true);
});

test('an explicit teacher column sort is not overridden', () => {
  const expected = INFINITE_CAMPUS_ROSTER_ORDER['Language Arts 2 SC'];
  const reversed = [...expected].reverse();
  const document = makeGradebookDom('Language Arts 2 SC', reversed, { explicitSort: true });

  expect(reorderGradebookRows(document)).toBe(false);
  expect(renderedCodes(document)).toEqual(reversed);
});
