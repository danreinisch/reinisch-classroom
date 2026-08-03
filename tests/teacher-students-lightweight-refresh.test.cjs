'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'site/web/tc-students.js');
const htmlPath = path.join(root, 'site/teacher/students/index.html');

const source = fs.readFileSync(sourcePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractNamedFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);

  assert.notStrictEqual(
    start,
    -1,
    `${name} function must exist`
  );

  const braceStart = text.indexOf('{', start);

  assert.notStrictEqual(
    braceStart,
    -1,
    `${name} opening brace must exist`
  );

  let depth = 0;

  for (let index = braceStart; index < text.length; index += 1) {
    const char = text[index];

    if (char === '{') depth += 1;

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  throw new Error(`${name} closing brace was not found`);
}

const setup = extractNamedFunction(source, 'setupAutoRefresh');
const reload = extractNamedFunction(source, 'reloadProgressEntries');

assert.ok(
  source.includes('let autoRefreshInFlight = false;'),
  'auto-refresh must define an in-flight guard'
);

assert.ok(
  setup.includes('if (autoRefreshInFlight) return;'),
  'overlapping timer callbacks must be skipped'
);

assert.ok(
  setup.includes('autoRefreshInFlight = true;'),
  'timer must acquire the in-flight guard'
);

assert.ok(
  setup.includes(
    'const progressReloaded = await reloadProgressEntries();'
  ),
  'timer must capture the lightweight progress reload result'
);

assert.ok(
  setup.includes('if (!progressReloaded) return;'),
  'timer must stop when progress data could not be refreshed'
);

assert.ok(
  reload.includes('return true;'),
  'progress reload must report success'
);

assert.ok(
  reload.includes('return false;'),
  'progress reload must report failure after logging'
);

const reloadCallIndex = setup.indexOf(
  'const progressReloaded = await reloadProgressEntries();'
);
const failedReloadGuardIndex = setup.indexOf(
  'if (!progressReloaded) return;'
);
const summaryIndex = setup.indexOf('renderStudentKpiSummary();');
const successToastIndex = setup.indexOf('showRefreshToast();');

assert.ok(
  reloadCallIndex !== -1 &&
    failedReloadGuardIndex > reloadCallIndex &&
    summaryIndex > failedReloadGuardIndex &&
    successToastIndex > failedReloadGuardIndex,
  'failed reloads must stop before summaries and the success toast'
);

assert.ok(
  setup.includes('renderStudentKpiSummary();'),
  'timer must refresh the progress KPI summary'
);

assert.ok(
  setup.includes('renderDigestSummary();'),
  'timer must refresh the progress digest'
);

assert.ok(
  setup.includes('renderStudentQualityBanner();'),
  'timer must refresh progress-dependent quality output'
);

assert.ok(
  setup.includes(
    "(selectedDetailTabMap.get(code) || 'goals') === 'progress'"
  ),
  'timer must limit expanded-detail rendering to visible Progress tabs'
);

assert.ok(
  setup.includes('await Promise.allSettled('),
  'visible Progress tabs must tolerate an isolated render failure'
);

assert.ok(
  setup.includes('code => renderExpandedDetail(code)'),
  'visible Progress tabs must rerender from refreshed in-memory data'
);

assert.ok(
  !setup.includes('loadData('),
  'timed refresh must not perform a full Teacher Students data load'
);

assert.ok(
  !setup.includes('renderStudentList('),
  'timed refresh must not rerender the full student list'
);

assert.ok(
  setup.includes('} finally {'),
  'the in-flight guard must be released in finally'
);

const acquireIndex = setup.indexOf('autoRefreshInFlight = true;');
const tryIndex = setup.indexOf('try {');
const finallyIndex = setup.indexOf('} finally {');
const releaseIndex = setup.indexOf('autoRefreshInFlight = false;');

assert.ok(
  acquireIndex !== -1 &&
    tryIndex > acquireIndex &&
    finallyIndex > tryIndex &&
    releaseIndex > finallyIndex,
  'guard acquisition and release must have safe ordering'
);

assert.ok(
  setup.includes("icon.classList.remove('st-spin')"),
  'refresh icon cleanup must occur'
);

assert.ok(
  html.includes('/web/tc-students.js?v=20260803-perf01'),
  'Teacher Students HTML must cache-bust the repaired module'
);

assert.ok(
  !html.includes('/web/tc-students.js?v=20260802-1360'),
  'previous Teacher Students cache marker must be removed'
);

console.log(
  '✓ Teacher Students auto-refresh uses one guarded lightweight progress reload'
);
console.log(
  '✓ Timed refresh cannot trigger full roster or student-list fan-out'
);
console.log(
  '✓ Only visible Progress tabs rerender from refreshed in-memory data'
);
console.log(
  '✓ Failed progress reloads skip stale summaries and success toast'
);
console.log(
  '✓ Teacher Students module cache marker is updated'
);
