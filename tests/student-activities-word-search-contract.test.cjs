const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(
    path.join(root, rel),
    'utf8'
  );
}

const studentHtml =
  read('site/student/index.html');

const studentJs =
  read('site/web/student-portal-init.js');

const viewerHtml =
  read('site/viewer/index.html');

const viewerJs =
  read('site/assets/js/viewer.js');

const viewerCss =
  read('site/assets/css/viewer.css');

const viewerCompat =
  read('site/assets/css/viewer-display-compat.css');

const wordSearch =
  read(
    'site/presentations/language-arts-toolkit/presentation-03/wordsearch_optimized_classroom (1).html'
  );

test(
  'Student Portal exposes Activities in both navigation surfaces',
  () => {
    const tabs =
      studentHtml.match(
        /data-tab="activities"/g
      ) || [];

    assert.equal(tabs.length, 2);
    assert.match(
      studentHtml,
      /id="tabActivities"/
    );
  }
);

test(
  'Activities launches Word Search through Viewer with explicit return',
  () => {
    assert.match(
      studentHtml,
      /src=%2Fpresentations%2Flanguage-arts-toolkit%2Fpresentation-03%2F/
    );

    assert.match(
      studentHtml,
      /return=%2Fstudent%2F%3Ftab%3Dactivities/
    );

    assert.match(
      studentHtml,
      /activity=1/
    );
  }
);

test(
  'Student Portal restores Activities from tab query parameter',
  () => {
    assert.match(
      studentJs,
      /'activities': 'tabActivities'/
    );

    assert.match(
      studentJs,
      /new URLSearchParams\(window\.location\.search\)\.get\('tab'\)/
    );

    assert.match(
      studentJs,
      /switchToTab\(requestedTab\)/
    );
  }
);

test(
  'Viewer exposes a touch-friendly activity exit',
  () => {
    assert.match(
      viewerHtml,
      /id="exitActivityBtn"/
    );

    assert.match(
      viewerHtml,
      /← Exit Activity/
    );

    assert.match(
      viewerJs,
      /params\.get\('activity'\) === '1'/
    );

    assert.match(
      viewerJs,
      /language-arts-toolkit\/presentation-03/
    );

    assert.match(
      viewerJs,
      /exitActivityBtn\.addEventListener\('click', handleClose\)/
    );

    assert.match(
      viewerCss,
      /\.viewer-exit-activity\s*\{/
    );

    assert.match(
      viewerCss,
      /min-height:\s*44px/
    );

    assert.match(
      viewerCompat,
      /rc-display-safe \.viewer-exit-activity/
    );
  }
);

test(
  'Word Search puzzle navigation clearly returns to theme list',
  () => {
    assert.match(
      wordSearch,
      /id="homeBtn"[^>]*>← All Themes<\/button>/
    );
  }
);
