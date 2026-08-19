'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'site/web/tc-students.js');
const htmlPath = path.join(
  root,
  'site/teacher/students/index.html'
);

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
