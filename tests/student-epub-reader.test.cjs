'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source =
  fs.readFileSync(
    'site/web/student-portal-init.js',
    'utf8'
  );

test(
  'Lost maps to secure EPUB and support metadata',
  () => {
    assert.match(
      source,
      /['"]\/student\/resources\/presentation-02\/['"][\s\S]*?id:\s*['"]lost-in-kragdon-ah['"]/
    );

    assert.match(
      source,
      /supportPath:\s*['"]\/assets\/data\/student-book-support\/lost-in-kragdon-ah\.json['"]/
    );
  }
);

test(
  'secure Lost metadata path precedes legacy pseudo-book fallback',
  () => {
    const start =
      source.indexOf(
        'async function loadStudentBookMetadata('
      );

    const end =
      source.indexOf(
        'async function loadStudentResources()',
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block =
      source.slice(start, end);

    const securePos =
      block.indexOf(
        'getSecureEpubBook(link)'
      );

    const supportPos =
      block.indexOf(
        'secureBook.supportPath'
      );

    const legacyPos =
      block.indexOf(
        "fetch(base + 'book-index.json')"
      );

    assert.ok(securePos >= 0);
    assert.ok(supportPos > securePos);
    assert.ok(legacyPos > supportPos);
  }
);

test(
  'secure EPUB reader fetches only through student-book',
  () => {
    const start =
      source.indexOf(
        'async function openEpubReader('
      );

    const end =
      source.indexOf(
        '/**\n   * Open the inline book reader',
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block =
      source.slice(start, end);

    assert.match(
      block,
      /\/\.netlify\/functions\/student-book\?book=/
    );

    assert.match(
      block,
      /credentials:\s*['"]same-origin['"]/
    );

    assert.match(
      block,
      /cache:\s*['"]no-store['"]/
    );

    assert.equal(
      /book-index\.json|book-chunk-|book-pages\.json/
        .test(block),
      false,
      'secure EPUB path must not read public pseudo-book text'
    );
  }
);

test(
  'Lost uses EPUB.js while legacy books preserve old reader fallback',
  () => {
    assert.match(
      source,
      /if\s*\(getSecureEpubBook\(link\)\)\s*\{\s*openEpubReader\(link,\s*title\);\s*\}\s*else\s*\{\s*openBookReader\(link,\s*title\);/
    );
  }
);

test(
  'EPUB reader preserves publisher content with reflow and responsive spread',
  () => {
    assert.match(
      source,
      /window\.ePub\(epubBytes\)/
    );

    assert.match(
      source,
      /flow:\s*['"]paginated['"]/
    );

    assert.match(
      source,
      /spread:\s*['"]auto['"]/
    );
  }
);

test(
  'EPUB reader stores resume position as CFI rather than fake page number',
  () => {
    assert.match(
      source,
      /rc_epub_cfi_/
    );

    assert.match(
      source,
      /location\.start\.cfi/
    );

    assert.match(
      source,
      /_epubRendition\.display\(\s*savedCfi/
    );
  }
);

test(
  'EPUB reader includes chapter navigation and font controls',
  () => {
    assert.match(
      source,
      /loaded\.navigation/
    );

    assert.match(
      source,
      /chapter\.href/
    );

    assert.match(
      source,
      /themes\.fontSize/
    );

    assert.match(
      source,
      /_epubRendition\.prev\(\)/
    );

    assert.match(
      source,
      /_epubRendition\.next\(\)/
    );
  }
);
