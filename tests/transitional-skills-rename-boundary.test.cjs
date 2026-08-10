const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(file, 'utf8');
const count = (text, needle) => text.split(needle).length - 1;

function walkHtml(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkHtml(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const currentRoot = 'site/life-skills/presentations-2026-27';

const currentFiles = fs.readdirSync(
  currentRoot,
  { withFileTypes: true }
)
  .filter(e => e.isDirectory() && /^presentation-\d+$/.test(e.name))
  .map(e => path.join(currentRoot, e.name, 'index.html'))
  .filter(file => fs.existsSync(file))
  .sort();

assert.strictEqual(currentFiles.length, 37);

let renamed = 0;

for (const file of currentFiles) {
  const text = read(file);

  assert(
    !text.includes('Life Skills SC'),
    `${file} retains Life Skills SC`
  );

  assert(
    text.includes('Transitional Skills'),
    `${file} lacks Transitional Skills`
  );

  renamed += count(text, 'Transitional Skills');
}

assert.strictEqual(renamed, 748);

let archivedRenamed = 0;

for (const file of walkHtml('site/life-skills/presentations')) {
  archivedRenamed += count(
    read(file),
    'Transitional Skills'
  );
}

assert.strictEqual(archivedRenamed, 0);

const units = JSON.parse(
  read('site/assets/data/units.json')
);

const archived = units.units.find(
  unit => unit.id === 'life'
);

const active = units.units.find(
  unit => unit.id === 'life-sc-2026-27'
);

assert(archived);
assert(active);

assert.strictEqual(
  archived.title,
  'Life Skills'
);

assert.strictEqual(
  archived.status,
  'archived'
);

assert.strictEqual(
  archived.pagePath,
  '/life-skills/'
);

assert.strictEqual(
  active.title,
  'Transitional Skills'
);

assert.strictEqual(
  active.description,
  '2026–27 weekly presentation collection for Transitional Skills.'
);

assert.strictEqual(
  active.status,
  'active'
);

assert.strictEqual(
  active.section,
  'life-skills'
);

assert.strictEqual(
  active.baseOut,
  'life-skills/presentations-2026-27'
);

assert.strictEqual(
  active.pagePath,
  '/life-skills/'
);

const siteState = JSON.parse(
  read('site/assets/data/site-state.json')
);

const labels = siteState.schedule.periods.map(
  p => p.label
);

assert(
  labels.includes('Life Skills Language Arts SC')
);

assert(
  labels.includes('Transitional Skills')
);

assert(
  !labels.includes('Life Skills SC')
);

const constants = read(
  'site/web/constants.js'
);

assert(
  constants.includes('"Transitional Skills",')
);

assert(
  constants.includes(
    '"Transitional Skills": "Transitional Skills"'
  )
);

assert(
  constants.includes(
    '"Life Skills": "Transitional Skills"'
  )
);

assert(
  constants.includes(
    '"Life Skills Language Arts SC"'
  )
);

const adapter = read(
  'site/web/data-adapter.js'
);

assert(
  adapter.includes(
    "'LS': ['Transitional Skills']"
  )
);

assert(
  adapter.includes(
    "name === 'Life Skills' || name === 'Transitional Skills'"
  )
);

assert(
  adapter.includes(
    "'LS-LA': ['Life Skills Language Arts SC']"
  )
);

const students = read(
  'site/web/tc-students.js'
);

assert(
  students.includes(
    '"Transitional Skills": "LS"'
  )
);

assert(
  students.includes(
    '"Life Skills": "LS"'
  )
);

assert(
  students.includes(
    "'LS': ['Transitional Skills']"
  )
);

assert(
  students.includes(
    "'LS-LA': ['Life Skills Language Arts SC']"
  )
);

assert(
  students.includes(
    '"Life Skills Transition"'
  )
);

assert(
  students.includes(
    '"Life Skills Reading Skills"'
  )
);

assert(
  students.includes(
    '"Life Skills Writing Skills"'
  )
);

const work = read(
  'site/web/tc-work.js'
);

assert(
  work.includes(
    '"Transitional Skills"'
  )
);

assert(
  work.includes(
    'const hasTransitionalSkills'
  )
);

assert(
  work.includes(
    'if (hasTransitionalSkills || hasLifeSkills) return "Transitional Skills";'
  )
);

assert(
  work.includes(
    'savedClassName === "Life Skills" || savedClassName === "Life Skills SC"'
  )
);

assert(
  work.includes(
    '? "Transitional Skills"'
  )
);

assert(
  work.includes(
    '"Life Skills Language Arts SC"'
  )
);

const workPage = read(
  'site/teacher/work/index.html'
);

assert(
  workPage.includes(
    '<option value="Transitional Skills">Transitional Skills</option>'
  )
);

assert(
  !workPage.includes(
    '<option value="Life Skills">Life Skills</option>'
  )
);

const spreadsheet = read(
  'site/web/tc-spreadsheet.js'
);

assert(
  spreadsheet.includes(
    "'Transitional Skills'"
  )
);

assert(
  spreadsheet.includes(
    "'Life Skills'"
  )
);

assert(
  spreadsheet.includes(
    "'Life Skills SC'"
  )
);

assert(
  spreadsheet.includes(
    "'Life Skills Language Arts SC'"
  )
);

assert(
  read('site/web/public-nav.js').includes(
    "label: 'Transitional Skills'"
  )
);

const homepage = read(
  'site/index.html'
);

assert(
  homepage.includes(
    'TRANSITIONAL SKILLS'
  )
);

assert(
  homepage.includes(
    'Open Transitional Skills'
  )
);

assert(
  homepage.includes(
    'href="/life-skills/"'
  )
);

const lifeHub = read(
  'site/life-skills/index.html'
);

assert(
  lifeHub.includes(
    'Transitional Skills'
  )
);

assert(
  !lifeHub.includes(
    '>Life Skills<'
  )
);

assert(
  lifeHub.includes(
    '/life-skills/'
  )
);

const hub = read(
  'site/hub/index.html'
);

assert(
  hub.includes(
    '{ id: "LS", name: "Transitional Skills" }'
  )
);

assert(
  hub.includes(
    'LS-LA'
  )
);

const homeConfig = read(
  'site/assets/data/home-config.json'
);

assert(
  homeConfig.includes(
    "Transitional Skills: Your Rights & Responsibilities — this week's topic"
  )
);

// Generated discovery index follows the active registry title.
const lessonsIndex = JSON.parse(
  read('site/assets/content/lessons-index.json')
);

const lifeSection = lessonsIndex.sections.find(
  section => section.name === 'LIFE SKILLS'
);

assert(lifeSection);

const activeLifeUnit = lifeSection.units.find(
  unit => unit.id === 'life-sc-2026-27'
);

assert(activeLifeUnit);

assert.strictEqual(
  activeLifeUnit.name,
  'Transitional Skills'
);

assert(
  activeLifeUnit.presentations.every(
    presentation =>
      presentation.url.startsWith(
        '/life-skills/presentations-2026-27/'
      )
  )
);

// AI Builder displays the new course name while preserving
// its established Life Skills subject protocol value.
const aiBuilderPage = read(
  'site/teacher/ai-builder/index.html'
);

assert.strictEqual(
  count(
    aiBuilderPage,
    '<option value="Life Skills">Transitional Skills</option>'
  ),
  2
);

assert.strictEqual(
  count(
    aiBuilderPage,
    '<option value="Life Skills">Life Skills</option>'
  ),
  0
);

const goalCsv = read(
  'data/student-goals-latest.csv'
);

assert(
  goalCsv.includes(
    'Life Skills Language Arts SC'
  )
);

assert(
  goalCsv.includes(
    'Life Skills Transition'
  )
);

console.log(
  'RC-NAME-02A TRANSITIONAL SKILLS BOUNDARY: PASS'
);

console.log(
  '✓ 37 current presentations renamed'
);

console.log(
  '✓ 748 current presentation labels converted'
);

console.log(
  '✓ archived Life Skills presentations preserved'
);

console.log(
  '✓ stable LS and /life-skills/ preserved'
);

console.log(
  '✓ old Life Skills class name remains compatible'
);

console.log(
  '✓ Life Skills Language Arts preserved'
);

console.log(
  '✓ IEP / goal terminology preserved'
);
