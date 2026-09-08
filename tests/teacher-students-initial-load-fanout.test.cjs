'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'site/web/tc-students.js');
const htmlPath = path.join(
  root,
  'site/teacher/students/index.html'
);
const hydrationPath = path.join(
  root,
  'site/web/tc-students-objective-hydration.js'
);
const sidebarInitPath = path.join(
  root,
  'site/web/sidebar-init.js'
);

const source = fs.readFileSync(sourcePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const hydration = fs.readFileSync(hydrationPath, 'utf8');
const sidebarInit = fs.readFileSync(sidebarInitPath, 'utf8');

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

  for (
    let index = braceStart;
    index < text.length;
    index += 1
  ) {
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

const loadData = extractNamedFunction(source, 'loadData');
const renderStudentList = extractNamedFunction(
  source,
  'renderStudentList'
);
const renderExpandedDetail = extractNamedFunction(
  source,
  'renderExpandedDetail'
);
const renderStudentGoalsTab = extractNamedFunction(
  source,
  'renderStudentGoalsTab'
);

assert.ok(
  loadData.includes(
    'const deferOptionalEnrichment ='
  ),
  'initial load must identify the automatic boot render'
);

assert.ok(
  loadData.includes(
    '!_initialLoadDone && autoExpandAlerts'
  ),
  'deferral must apply only to first-load auto-expansion'
);

assert.ok(
  loadData.includes(
    'await renderStudentList(deferOptionalEnrichment);'
  ),
  'initial roster rendering must be awaited with the deferral flag'
);

assert.ok(
  renderStudentList.includes(
    'deferOptionalEnrichment = false'
  ),
  'normal student-list rendering must enrich by default'
);

assert.ok(
  renderStudentList.includes(
    'renderExpandedDetail('
  ) &&
    renderStudentList.includes(
      'studentCode,\n        deferOptionalEnrichment'
    ),
  'expanded detail must receive the initial-load deferral flag'
);

assert.ok(
  renderExpandedDetail.includes(
    'deferOptionalEnrichment = false'
  ),
  'normal expanded-detail rendering must enrich by default'
);

assert.ok(
  renderExpandedDetail.includes(
    'renderStudentGoalsTab('
  ) &&
    renderExpandedDetail.includes(
      'studentGoals,\n        deferOptionalEnrichment'
    ),
  'Goals rendering must receive the deferral flag'
);

const guardIndex = renderExpandedDetail.indexOf(
  "if (selectedDetailTab === 'goals' && !deferOptionalEnrichment)"
);
const countIndex = renderExpandedDetail.indexOf(
  'batchUpdateGoalDataCounts('
);
const badgeIndex = renderExpandedDetail.indexOf(
  'injectSkillGapBadges('
);

assert.ok(
  guardIndex !== -1 &&
    countIndex > guardIndex &&
    badgeIndex > countIndex,
  'goal counts and skill-gap queries must remain inside the boot guard'
);

assert.ok(
  renderStudentGoalsTab.includes(
    'const activeTokens = deferOptionalEnrichment'
  ),
  'boot rendering must defer token-status lookup'
);

assert.ok(
  renderStudentGoalsTab.includes(
    ': await checkActiveTokens(student.code);'
  ),
  'normal later rendering must preserve token lookup'
);

assert.ok(
  !loadData.includes('listGoalDataPoints(') &&
    !loadData.includes('listAssignments(') &&
    !loadData.includes('listSubmissions(') &&
    !loadData.includes('listAssignmentGoalMappings('),
  'loadData must not directly launch optional evidence reads'
);

assert.ok(
  /\/web\/tc-students\.js\?v=[^"']+/.test(html),
  'Teacher Students HTML must cache-bust the repaired module'
);

assert.ok(
  !html.includes(
    '/web/tc-students.js?v=20260803-perf01"></script>'
  ),
  'the previous standalone cache URL must not remain'
);

/* ========================================================================== */
/* Deferred child-objective control hydration                                  */
/* ========================================================================== */

assert.ok(
  sidebarInit.includes(
    "if (path !== '/teacher/students') return;"
  ),
  'objective hydration loader must be scoped to Teacher Students only'
);

assert.ok(
  sidebarInit.includes(
    '/web/tc-students-objective-hydration.js?v=20260908-hydration1'
  ),
  'Teacher Students must load the dedicated boot-hydration companion'
);

for (
  const marker
  of [
    'IEP Objective Progress',
    '.st-tab.active[data-tab="goals"]',
    '.st-objective-manual-entry',
    'data-objective-hydration-requested',
    'MutationObserver',
    'activeGoalsTab.click()',
    'BOOT_WINDOW_MS',
  ]
) {
  assert.ok(
    hydration.includes(marker),
    `objective hydration companion must include ${marker}`
  );
}

for (
  const forbidden
  of [
    'saveManualObjectiveEvidence',
    'objective_data_points',
    'teacher-manual-objective-evidence',
    'fetch(',
    'localStorage',
  ]
) {
  assert.ok(
    !hydration.includes(forbidden),
    `boot hydration must not create a second evidence or eligibility path: ${forbidden}`
  );
}

function deferredMarkup({
  manualEntry = false,
} = {}) {
  return `<!doctype html>
    <html>
      <body>
        <table>
          <tbody id="stStudentTableBody">
            <tr class="st-expanded-row">
              <td>
                <div class="st-expanded-content" id="stExpandedDetail-S999">
                  <div class="st-tabs">
                    <button class="st-tab active" data-tab="goals">Goals</button>
                    <button class="st-tab" data-tab="progress">Progress</button>
                  </div>
                  <section>
                    <div>IEP Objective Progress</div>
                    <div>No Data</div>
                    ${manualEntry ? '<div class="st-objective-manual-entry"><button>Record Evidence</button></div>' : ''}
                  </section>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`;
}

async function exerciseHydration({
  manualEntry = false,
  url = 'https://reinischclassroom.com/teacher/students/',
} = {}) {
  const dom = new JSDOM(
    deferredMarkup({ manualEntry }),
    {
      url,
      runScripts: 'outside-only',
    }
  );

  const container =
    dom.window.document.querySelector(
      '.st-expanded-content'
    );

  const goalsTab =
    container.querySelector(
      '.st-tab.active[data-tab="goals"]'
    );

  let clicks = 0;

  goalsTab.addEventListener(
    'click',
    () => {
      clicks += 1;
    }
  );

  dom.window.eval(hydration);

  if (
    dom.window.document.readyState ===
    'loading'
  ) {
    dom.window.document.dispatchEvent(
      new dom.window.Event(
        'DOMContentLoaded',
        { bubbles: true }
      )
    );
  }

  await new Promise(resolve =>
    dom.window.setTimeout(resolve, 25)
  );

  // Simulate another boot-render mutation. The marker must make hydration
  // idempotent rather than creating a click/re-render loop.
  const mutation =
    dom.window.document.createElement('span');
  mutation.textContent = 'later mutation';
  container.appendChild(mutation);

  await new Promise(resolve =>
    dom.window.setTimeout(resolve, 25)
  );

  const marker =
    container.getAttribute(
      'data-objective-hydration-requested'
    );

  dom.window.close();

  return {
    clicks,
    marker,
  };
}

async function runHydrationBehavior() {
  const deferred =
    await exerciseHydration();

  assert.strictEqual(
    deferred.clicks,
    1,
    'deferred objective markup must re-enter the normal Goals render exactly once'
  );

  assert.strictEqual(
    deferred.marker,
    'true',
    'deferred objective markup must be marked before re-render to prevent loops'
  );

  const alreadyHydrated =
    await exerciseHydration({
      manualEntry: true,
    });

  assert.strictEqual(
    alreadyHydrated.clicks,
    0,
    'existing Record Evidence controls must never be re-hydrated'
  );

  const wrongRoute =
    await exerciseHydration({
      url:
        'https://reinischclassroom.com/teacher/review/',
    });

  assert.strictEqual(
    wrongRoute.clicks,
    0,
    'hydration companion must be inert outside Teacher Students'
  );

  console.log(
    '✓ Deferred child-objective controls hydrate once through the existing Goals render boundary'
  );
}

console.log(
  '✓ Initial alert students remain visibly auto-expanded'
);
console.log(
  '✓ Boot rendering defers per-goal evidence queries'
);
console.log(
  '✓ Boot rendering defers per-student assignment queries'
);
console.log(
  '✓ Boot rendering defers per-student token lookup'
);
console.log(
  '✓ Normal later renders preserve existing enrichment'
);
console.log(
  '✓ Initial roster render has an awaited completion boundary'
);
console.log(
  '✓ RC-PERF-02 cache marker is registered'
);

runHydrationBehavior().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
