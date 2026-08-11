const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const studentHtml = fs.readFileSync(
  path.join(ROOT, 'site/student/index.html'),
  'utf8'
);
const portalJs = fs.readFileSync(
  path.join(ROOT, 'site/web/student-portal-init.js'),
  'utf8'
);

test('Student Portal exposes Library in both navigation surfaces', () => {
  const libraryLinks = studentHtml.match(/data-tab="library"/g) || [];
  assert.equal(libraryLinks.length, 2);
  assert.match(studentHtml, /id="tabLibrary"/);
  assert.match(studentHtml, /id="libraryContent"/);
});

test('Resources remains a separate Student Portal destination', () => {
  const resourceLinks = studentHtml.match(/data-tab="resources"/g) || [];
  assert.equal(resourceLinks.length, 2);
  assert.match(studentHtml, /id="tabResources"/);
  assert.match(studentHtml, /id="resourcesContent"/);
});

test('tab router maps Library independently from Resources', () => {
  assert.match(portalJs, /'library':\s*'tabLibrary'/);
  assert.match(portalJs, /'resources':\s*'tabResources'/);
});

test('secure EPUB classification bypasses public probes while legacy fallback remains', () => {
  const detectorStart = portalJs.indexOf(
    'async function detectStudentBookResource'
  );
  assert.notEqual(detectorStart, -1);

  const detectorEnd = portalJs.indexOf(
    'async function loadStudentBookMetadata',
    detectorStart
  );
  assert.notEqual(detectorEnd, -1);

  const detector = portalJs.slice(detectorStart, detectorEnd);

  const securePos = detector.indexOf(
    'getSecureEpubBook(link)'
  );
  const indexPos = detector.indexOf('book-index.json');
  const pagesPos = detector.indexOf('book-pages.json');

  assert.ok(securePos >= 0);
  assert.ok(indexPos >= 0);
  assert.ok(pagesPos >= 0);
  assert.ok(securePos < indexPos);
  assert.ok(indexPos < pagesPos);
});

test('Lost public pseudo-book assets are retired and support metadata is minimal', () => {
  const legacyDir = path.join(
    ROOT,
    'site/student/resources/presentation-02'
  );

  assert.equal(
    fs.existsSync(legacyDir),
    false,
    'retired Lost public directory must stay absent'
  );

  const supportPath = path.join(
    ROOT,
    'site/assets/data/student-book-support/lost-in-kragdon-ah.json'
  );

  assert.equal(
    fs.existsSync(supportPath),
    true
  );

  const support = JSON.parse(
    fs.readFileSync(
      supportPath,
      'utf8'
    )
  );

  assert.deepEqual(
    Object.keys(support),
    [
      'bookId',
      'title',
      'author',
      'glossary',
    ]
  );

  assert.equal(
    support.bookId,
    'lost-in-kragdon-ah'
  );

  assert.equal(
    support.glossary.length,
    67
  );

  for (const entry of support.glossary) {
    assert.ok(entry.term);
    assert.ok(entry.definition);
  }

  for (const forbidden of [
    'pages',
    'chapters',
    'chunks',
    'chunked',
    'totalPages',
    'wordsPerPage',
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        support,
        forbidden
      ),
      false,
      `support metadata must not contain ${forbidden}`
    );
  }
});

test('Library and Resources are rendered into separate containers', () => {
  assert.match(
    portalJs,
    /document\.getElementById\('libraryContent'\)/
  );
  assert.match(
    portalJs,
    /document\.getElementById\('resourcesContent'\)/
  );
  assert.match(
    portalJs,
    /const books = classified\.filter/
  );
  assert.match(
    portalJs,
    /const resources = classified\.filter/
  );
});

test('existing reader still prefers book-index with book-pages fallback', () => {
  const readerStart = portalJs.indexOf('async function openBookReader');
  assert.notEqual(readerStart, -1);

  const readerEnd = portalJs.indexOf(
    '// Remove loading backdrop',
    readerStart
  );
  assert.notEqual(readerEnd, -1);

  const reader = portalJs.slice(readerStart, readerEnd);

  const indexPos = reader.indexOf(
    "fetch(base + 'book-index.json')"
  );
  const pagesPos = reader.indexOf(
    "fetch(base + 'book-pages.json')"
  );

  assert.ok(indexPos >= 0);
  assert.ok(pagesPos >= 0);
  assert.ok(indexPos < pagesPos);
});
