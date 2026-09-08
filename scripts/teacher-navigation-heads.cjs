/* One-time, byte-preserving header wiring and permanent source-integrity check.
 * --stage is for an isolated candidate checkout only. Default verifies committed
 * wiring; this script never contacts GitHub, pushes, deploys, or reads user data.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const marker = '\n  <script src="/web/sidebar-init.js?v=20260908-teacher-nav1" data-teacher-first-paint></script>';
const originals = {
  'site/teacher/index.html': 'ea3c11255b6e5679707c23dcda56e3775ae09212',
  'site/teacher/work/index.html': '86866b81749a38e28d4bc9e2af9af96951286c8f',
  'site/teacher/ai-builder/index.html': '848f7de6fe35316c1ad7413b8c3ed51fe2ac0147',
  'site/teacher/library/index.html': 'cf207421bd76773c7608bb467574e9fbbc825546',
  'site/teacher/review/index.html': 'a00edcf7a5b380dae1ddfa032228d42bf5c8fb8d',
  'site/teacher/gradebook/index.html': '8cdb52c8923a0557033e5a9119cc79936c27b48a',
  'site/teacher/students/index.html': 'dfee33d9b17c06c0d578730d844084849b2fc5f6',
  'site/teacher/calendar/index.html': '9b3a80f0abfae44d4e3eda1e3223533260187688',
  'site/teacher/schedule/index.html': 'f74399fd36760ef28f78a19d562a878dceecef20',
  'site/teacher/substitute/index.html': 'ce391e77a7e478c1ea8054dfb152ef9d6d887e1a',
  'site/teacher/archive/index.html': 'e775bc61e4cc824374a926f0b76098bdf7f4b9cf',
  'site/teacher/admin/index.html': '4f3c94f308764b1b62f1b9f8b6e5e47fdf3397dc',
  'site/teacher/reporting/index.html': '4a6ce0bc98cb231b7a834af802b2cce7784bf649',
  'site/teacher/district-export/index.html': '7b3692c28990924a7e4f73af0cbd4d34ccc67ca0',
  'site/teacher/share/index.html': 'a993b59fadb7026c758e8a50dae9c49bba7c2cd4',
  'site/teacher/settings/index.html': '9afee8f5ea171421104b8f13523b76607f60c540',
  'site/teacher/close-year/index.html': 'b38fb95c058af5c7396cd4e823fedb3a557188ed',
  'site/teacher/students/spreadsheet/index.html': '3940e7460600e488ef2c7c107f8aa4761537c797',
};
function blob(value) {
  const bytes = Buffer.from(value);
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function prepare(path, current) {
  const count = current.split(marker).length - 1;
  assert(count <= 1, 'Duplicate early script: ' + path);
  const original = current.replace(marker, '');
  assert.equal(blob(original), originals[path], 'Unrelated HTML change: ' + path);
  assert.equal(original.split('</title>').length - 1, 1, 'Expected one title: ' + path);
  assert(original.includes('aria-label="Teacher navigation"'), 'Not the native Teacher shell: ' + path);
  const after = original.replace('</title>', '</title>' + marker);
  assert(after.indexOf('data-teacher-first-paint') < after.indexOf('</head>'));
  assert.equal(after.replace(marker, ''), original);
  return { path, before: originals[path], after: blob(after), content: after, missing: !count };
}
function checkUnchangedBoundaries() {
  const source = fs.readFileSync('site/web/sidebar-init.js', 'utf8');
  const removed = source.replace(/\/\/ BEGIN TEACHER FIRST PAINT\n[\s\S]*?\/\/ END TEACHER FIRST PAINT\n\n/, '');
  // Shared CanyonPath intentionally updates public/student presentation bootstrap.
  // This digest is the reviewed post-change boundary; future unrelated edits still fail closed.
  assert.equal(blob(removed), '31c14bfae7723e2a5df9f3671e1192119357e568', 'Public/Student initialization changed');
  assert.equal(blob(fs.readFileSync('site/web/teacher-shell.js')), 'afcbaa020f099c9a4b4b3b517092b56e5229498b', 'Teacher gate/runtime changed');
  const obs = fs.readFileSync('site/teacher/observations/index.html', 'utf8');
  assert(obs.split('</head>')[0].includes('<script src="/web/sidebar-init.js"></script>'), 'Observation head contract changed');
  assert(!obs.includes('data-teacher-first-paint'), 'Do not overlap active Observation markup');
}
if (require.main === module) {
  checkUnchangedBoundaries();
  const proposed = Object.keys(originals).map(path => prepare(path, fs.readFileSync(path, 'utf8')));
  if (process.argv.includes('--stage')) {
    for (const item of proposed) if (item.missing) fs.writeFileSync(item.path, item.content);
    console.log('CANDIDATE ONLY: staged ' + proposed.filter(p => p.missing).length + ' exact head insertions in this isolated checkout.');
  } else {
    assert(proposed.every(p => !p.missing), 'Head wiring is not committed yet. Do not claim the candidate as the deployed preview.');
    console.log('PASS: all eighteen committed head insertions preserve original page bodies and handlers.');
  }
  if (process.argv.includes('--manifest')) {
    fs.mkdirSync('navigation-review', { recursive: true });
    fs.writeFileSync('navigation-review/head-wiring-manifest.json', JSON.stringify(proposed.map(({path,before,after}) => ({path,before,after})), null, 2));
  }
}
module.exports = { marker, originals, blob, prepare };
