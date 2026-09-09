import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  sortStudentsLikeInfiniteCampus,
  reorderGradebookRows,
} from '../site/web/gradebook-roster-order.js';

function makeGradebookDom(className, students, { explicitSort = false } = {}) {
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

  for (const student of students) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'gb-student-cell';
    cell.textContent = student.name || student.code;
    cell.dataset.tooltip = JSON.stringify(student);
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

test('students sort alphabetically by runtime display name like Infinite Campus', () => {
  const students = [
    { code: 'S903', name: 'Zimmer, Zoe' },
    { code: 'S901', name: 'Baker, Bea' },
    { code: 'S902', name: 'Miller, Max' },
    { code: 'S900', name: 'Adams, Ava' },
  ];

  expect(sortStudentsLikeInfiniteCampus(students).map((student) => student.code))
    .toEqual(['S900', 'S901', 'S902', 'S903']);
});

test('new students automatically land in alphabetical position with no roster-map update', () => {
  const students = [
    { code: 'S901', name: 'Baker, Bea' },
    { code: 'S999', name: 'Clark, Casey' },
    { code: 'S902', name: 'Davis, Drew' },
  ];

  expect(sortStudentsLikeInfiniteCampus(students).map((student) => student.code))
    .toEqual(['S901', 'S999', 'S902']);
});

test('students without a display name fall back to student code deterministically', () => {
  const students = [
    { code: 'S010', name: '' },
    { code: 'S002', name: '' },
  ];

  expect(sortStudentsLikeInfiniteCampus(students).map((student) => student.code))
    .toEqual(['S002', 'S010']);
});

test('rendered class rows are reordered while the Class Average row remains last', () => {
  const students = [
    { code: 'S903', name: 'Zimmer, Zoe' },
    { code: 'S901', name: 'Baker, Bea' },
    { code: 'S902', name: 'Miller, Max' },
    { code: 'S900', name: 'Adams, Ava' },
  ];
  const document = makeGradebookDom('Language Arts 3 SC', students);

  expect(reorderGradebookRows(document)).toBe(true);
  expect(renderedCodes(document)).toEqual(['S900', 'S901', 'S902', 'S903']);
  expect(document.querySelector('#gbTableBody tr:last-child').classList.contains('gb-summary-row')).toBe(true);
  expect(document.querySelector('#gbTableBody tr:first-child').classList.contains('gb-highlighted')).toBe(true);
});

test('All Classes is left alone because one student can belong to multiple class rosters', () => {
  const students = [
    { code: 'S903', name: 'Zimmer, Zoe' },
    { code: 'S900', name: 'Adams, Ava' },
  ];
  const document = makeGradebookDom('All Classes', students);

  expect(reorderGradebookRows(document)).toBe(false);
  expect(renderedCodes(document)).toEqual(['S903', 'S900']);
});

test('an explicit teacher column sort is not overridden', () => {
  const students = [
    { code: 'S903', name: 'Zimmer, Zoe' },
    { code: 'S900', name: 'Adams, Ava' },
  ];
  const document = makeGradebookDom('Language Arts 2 SC', students, { explicitSort: true });

  expect(reorderGradebookRows(document)).toBe(false);
  expect(renderedCodes(document)).toEqual(['S903', 'S900']);
});
