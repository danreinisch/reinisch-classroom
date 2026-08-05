'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(repoRoot, relativePath),
    'utf8'
  );
}

const navigationFiles = [
  'site/teacher/admin/index.html',
  'site/teacher/ai-builder/index.html',
  'site/teacher/archive/index.html',
  'site/teacher/work/index.html',
  'site/teacher/close-year/index.html',
];

test('Close Year is absent from teacher navigation', () => {
  for (const relativePath of navigationFiles) {
    const html = read(relativePath);

    assert.doesNotMatch(
      html,
      /href="\/teacher\/close-year\/"/,
      `${relativePath} must not link to the retired Close Year route`
    );

    assert.doesNotMatch(
      html,
      /<span class="tc-label">Close Year<\/span>/,
      `${relativePath} must not display a Close Year navigation label`
    );
  }
});

test('direct Close Year route is non-operational', () => {
  const html = read('site/teacher/close-year/index.html');

  assert.match(
    html,
    /data-close-year-retired="true"/
  );

  assert.match(
    html,
    /School-Year Closeout Temporarily Unavailable/
  );

  assert.match(
    html,
    /No assignments, submissions, grades, or goal-progress records/
  );

  assert.doesNotMatch(
    html,
    /src="\/web\/tc-close-year\.js"/
  );

  assert.doesNotMatch(
    html,
    /id="cyWizard"/
  );

  assert.doesNotMatch(
    html,
    /id="cyStepIndicator"/
  );
});
