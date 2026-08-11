'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const studentHtml =
  fs.readFileSync(
    'site/student/index.html',
    'utf8'
  );

const epubBundlePath =
  'site/assets/vendor/epubjs/epub.min.js';

test(
  'Student Portal loads local EPUB.js before student-portal-init',
  () => {
    const vendor =
      '/assets/vendor/epubjs/epub.min.js';

    const portal =
      '/web/student-portal-init.js';

    const vendorIndex =
      studentHtml.indexOf(vendor);

    const portalIndex =
      studentHtml.indexOf(portal);

    assert.ok(
      vendorIndex >= 0,
      'local EPUB.js script is present'
    );

    assert.ok(
      portalIndex >= 0,
      'student portal init script is present'
    );

    assert.ok(
      vendorIndex < portalIndex,
      'EPUB.js loads before Student Portal initialization'
    );
  }
);

test(
  'Student Portal does not depend on remote EPUB.js CDN',
  () => {
    assert.equal(
      /cdn\.jsdelivr\.net[^"' ]*epub/i
        .test(studentHtml),
      false
    );
  }
);

test(
  'vendored EPUB.js bundle exists and is non-empty',
  () => {
    const stat =
      fs.statSync(epubBundlePath);

    assert.ok(
      stat.isFile()
    );

    assert.ok(
      stat.size > 100000,
      'bundle has plausible EPUB.js size'
    );

    const bundle =
      fs.readFileSync(
        epubBundlePath,
        'utf8'
      );

    assert.ok(
      bundle.includes('ePub'),
      'bundle contains EPUB.js runtime symbol'
    );
  }
);

test(
  'archived EPUB runtime loads local JSZip before EPUB.js',
  () => {
    const jszip =
      '/assets/vendor/jszip/jszip.min.js';

    const epub =
      '/assets/vendor/epubjs/epub.min.js';

    const portal =
      '/web/student-portal-init.js';

    const jszipIndex =
      studentHtml.indexOf(jszip);

    const epubIndex =
      studentHtml.indexOf(epub);

    const portalIndex =
      studentHtml.indexOf(portal);

    assert.ok(
      jszipIndex >= 0,
      'local JSZip script is present'
    );

    assert.ok(
      epubIndex >= 0,
      'local EPUB.js script is present'
    );

    assert.ok(
      jszipIndex < epubIndex,
      'JSZip loads before EPUB.js'
    );

    assert.ok(
      epubIndex < portalIndex,
      'EPUB.js loads before Student Portal initialization'
    );
  }
);

test(
  'vendored JSZip exists and no remote JSZip dependency is used',
  () => {
    const jszipPath =
      'site/assets/vendor/jszip/jszip.min.js';

    const stat =
      fs.statSync(jszipPath);

    assert.ok(stat.isFile());
    assert.ok(stat.size > 50000);

    assert.equal(
      /cdnjs[^"' ]*jszip|jsdelivr[^"' ]*jszip|unpkg[^"' ]*jszip/i
        .test(studentHtml),
      false
    );
  }
);
