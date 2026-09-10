import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  LOCKED_IC_ROSTER_ORDER,
  infiniteCampusSortLabel,
  sortStudentsLikeInfiniteCampus,
  sortStudentsByLockedInfiniteCampusOrder,
  reorderGradebookRows,
} from '../site/web/gradebook-roster-order.js';

const EXPECTED_IC_ORDER = {
  'Language Arts 1 SC': [
    'S062', 'S049', 'S071', 'S063', 'S060', 'S064', 'S056', 'S067', 'S055',
    'S052', 'S061', 'S065', 'S053', 'S041', 'S072', 'S054', 'S051',
  ],
  'Language Arts 2 SC': [
    'S025', 'S047', 'S048', 'S040', 'S026', 'S042', 'S066', 'S041', 'S074',
    'S028', 'S036',
  ],
  'Language Arts 3 SC': [
    'S057', 'S019', 'S069', 'S023', 'S070', 'S040', 'S033', 'S036',
  ],
  'Language Arts 4 SC': [
    'S016', 'S031', 'S003', 'S004', 'S039', 'S009',
  ],
  'Life Skills Language Arts SC': [
    'S015', 'S059', 'S017', 'S018', 'S073', 'S020', 'S058',
  ],
  'Transitional Skills': [
    'S015', 'S059', 'S017', 'S018', 'S031', 'S003', 'S073', 'S020', 'S004',
    'S006', 'S058', 'S008', 'S009',
  ],
};

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
  replaceRows(document, students);
  return document;
}

function replaceRows(document, students) {
  const body = document.querySelector('#gbTableBody');
  body.textContent = '';

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
}

function renderedCodes(document) {
  return Array.from(document.querySelectorAll('#gbTableBody tr:not(.gb-summary-row)'))
    .map((row) => JSON.parse(row.querySelector('.gb-student-cell').dataset.tooltip).code);
}

function asCodeStudents(codes) {
  return codes.map(code => ({ code, name: code }));
}

test('the six 2026-27 Gradebook rosters are locked to the captured Infinite Campus code stack', () => {
  expect(LOCKED_IC_ROSTER_ORDER).toEqual(EXPECTED_IC_ORDER);
  expect(Object.values(LOCKED_IC_ROSTER_ORDER).reduce((sum, codes) => sum + codes.length, 0))
    .toBe(62);
});

test('every locked class restores exact Infinite Campus order from a scrambled code-only roster', () => {
  for (const [className, expectedCodes] of Object.entries(EXPECTED_IC_ORDER)) {
    const scrambled = asCodeStudents([...expectedCodes].reverse());
    expect(sortStudentsByLockedInfiniteCampusOrder(className, scrambled).map(student => student.code))
      .toEqual(expectedCodes);
  }
});

test('a filtered subset keeps the same relative Infinite Campus stack', () => {
  const className = 'Language Arts 1 SC';
  const subset = asCodeStudents(['S054', 'S060', 'S049', 'S041']);
  expect(sortStudentsByLockedInfiniteCampusOrder(className, subset).map(student => student.code))
    .toEqual(['S049', 'S060', 'S041', 'S054']);
});

test('new or unmapped student codes stay visible after the locked roster in deterministic code order', () => {
  const className = 'Language Arts 4 SC';
  const students = asCodeStudents(['S900', 'S039', 'S016', 'S075', 'S003']);
  expect(sortStudentsByLockedInfiniteCampusOrder(className, students).map(student => student.code))
    .toEqual(['S016', 'S003', 'S039', 'S075', 'S900']);
});

test('locked class rows are restored even when a Gradebook column sort is active', () => {
  const className = 'Language Arts 3 SC';
  const expected = EXPECTED_IC_ORDER[className];
  const document = makeGradebookDom(
    className,
    asCodeStudents([...expected].reverse()),
    { explicitSort: true }
  );

  expect(reorderGradebookRows(document)).toBe(true);
  expect(renderedCodes(document)).toEqual(expected);
  expect(document.querySelector('#gbTableBody tr:last-child').classList.contains('gb-summary-row'))
    .toBe(true);
});

test('re-rendered locked rows return to Infinite Campus order after score entry or view changes', () => {
  const className = 'Transitional Skills';
  const expected = EXPECTED_IC_ORDER[className];
  const document = makeGradebookDom(className, asCodeStudents(expected));

  replaceRows(document, asCodeStudents([
    'S009', 'S003', 'S058', 'S015', 'S006', 'S059', 'S004',
    'S020', 'S017', 'S008', 'S018', 'S073', 'S031',
  ]));

  expect(reorderGradebookRows(document)).toBe(true);
  expect(renderedCodes(document)).toEqual(expected);
});

test('All Classes remains untouched because it has no single Infinite Campus roster', () => {
  const students = asCodeStudents(['S903', 'S900']);
  const document = makeGradebookDom('All Classes', students);

  expect(reorderGradebookRows(document)).toBe(false);
  expect(renderedCodes(document)).toEqual(['S903', 'S900']);
});

test('unlocked classes preserve explicit teacher column sorting behavior', () => {
  const students = [
    { code: 'S903', name: 'Aaron Zimmer' },
    { code: 'S900', name: 'Zoe Adams' },
  ];
  const document = makeGradebookDom('Consumer Math', students, { explicitSort: true });

  expect(reorderGradebookRows(document)).toBe(false);
  expect(renderedCodes(document)).toEqual(['S903', 'S900']);
});

test('unlocked classes retain the family-name fallback from the earlier roster-order repair', () => {
  expect(infiniteCampusSortLabel({ code: 'S900', name: 'Zoe Adams' }))
    .toBe('Adams, Zoe');
  expect(infiniteCampusSortLabel({ code: 'S901', name: 'Casey De Marco' }))
    .toBe('De Marco, Casey');

  const students = [
    { code: 'S903', name: 'Aaron Zimmer' },
    { code: 'S901', name: 'Yara Baker' },
    { code: 'S902', name: 'Max Miller' },
    { code: 'S900', name: 'Zoe Adams' },
  ];

  expect(sortStudentsLikeInfiniteCampus(students).map(student => student.code))
    .toEqual(['S900', 'S901', 'S902', 'S903']);
});
