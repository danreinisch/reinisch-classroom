'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const polishPath = path.join(
  root,
  'site/web/tc-students-objective-evidence-polish.js'
);
const stalenessUtilsPath = path.join(
  root,
  'site/web/staleness-utils.js'
);

const polish = fs.readFileSync(polishPath, 'utf8');
const stalenessUtils = fs.readFileSync(stalenessUtilsPath, 'utf8');

assert.ok(
  stalenessUtils.includes(
    "import './tc-students-objective-evidence-polish.js';"
  ),
  'Teacher Students utilities must load the objective evidence polish companion'
);

for (
  const marker
  of [
    "if (path !== '/teacher/students')",
    'tc-students-objective-evidence-polish',
    '.st-objective-manual-grid input',
    '.st-objective-manual-grid select',
    '.st-objective-manual-wide textarea',
    'color-scheme: dark',
    ':focus',
    ':disabled',
    '::placeholder',
  ]
) {
  assert.ok(
    polish.includes(marker),
    `objective evidence polish must include ${marker}`
  );
}

assert.ok(
  !/\n\s*(?:input|select|textarea)\s*\{/.test(polish),
  'objective evidence polish must not introduce unscoped global field selectors'
);

function run(url) {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body></body></html>',
    {
      url,
      runScripts: 'outside-only',
    }
  );

  dom.window.eval(polish);
  dom.window.eval(polish);

  const styles = dom.window.document.querySelectorAll(
    '#tc-students-objective-evidence-polish'
  );

  const result = {
    count: styles.length,
    css: styles[0]?.textContent || '',
  };

  dom.window.close();
  return result;
}

const studentsPage = run(
  'https://reinischclassroom.com/teacher/students/'
);

assert.strictEqual(
  studentsPage.count,
  1,
  'Teacher Students must install the polish style exactly once'
);

assert.ok(
  studentsPage.css.includes(
    'background: rgba(25, 84, 69, 0.48)'
  ),
  'manual evidence fields must use the green-tinted surface'
);

assert.ok(
  studentsPage.css.includes(
    'border-color: rgba(74, 222, 128, 0.72)'
  ),
  'manual evidence fields must preserve a visible green focus state'
);

const otherPage = run(
  'https://reinischclassroom.com/teacher/review/'
);

assert.strictEqual(
  otherPage.count,
  0,
  'objective evidence polish must be inert outside Teacher Students'
);

console.log(
  '✓ Manual child-objective evidence fields use scoped Teacher Students green surfaces'
);
