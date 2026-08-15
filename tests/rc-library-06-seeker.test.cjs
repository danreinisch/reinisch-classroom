'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    'utf8'
  );
}

test(
  'Seeker uses its fixed private Storage object',
  () => {
    const source = read(
      'netlify/functions/student-book.js'
    );

    assert.match(
      source,
      /'seeker': Object\.freeze\(\{[\s\S]*?objectPath:\s*'books\/seeker\.epub'[\s\S]*?filename:\s*'Seeker\.epub'[\s\S]*?contentType:\s*'application\/epub\+zip'/
    );
  }
);

test(
  'Student Resource slot 5 maps Seeker into the secure EPUB reader',
  () => {
    const source = read(
      'site/web/student-portal-init.js'
    );

    assert.match(
      source,
      /['"]\/student\/resources\/presentation-05\/['"][\s\S]*?id:\s*['"]seeker['"][\s\S]*?title:\s*['"]Seeker['"]/
    );

    assert.match(
      source,
      /supportPath:\s*['"]\/assets\/data\/student-book-support\/seeker\.json['"]/
    );
  }
);

test(
  'Student Resources publishes Seeker as slot 5 while preserving slots 1 through 4',
  () => {
    const state = JSON.parse(
      read('site/assets/data/site-state.json')
    );

    const category =
      state.categories.student_resources;

    assert.deepEqual(
      category.titles.slice(0, 5),
      [
        'Language Arts Skill Builder',
        '"Lost in Kragdon-ah" by Shawn Inmon',
        '"A Door Into Time" by Shawn Inmon',
        '"Escape from Camp 14" by Blaine Harden',
        '"Seeker" by Douglas E. Richards'
      ]
    );

    assert.deepEqual(
      category.links.slice(0, 5),
      [
        '/student/resources/presentation-01/',
        '/student/resources/presentation-02/',
        '/student/resources/presentation-03/',
        '/student/resources/presentation-04/',
        '/student/resources/presentation-05/'
      ]
    );

    assert.ok(
      state.categories['seeker-2026-27']
    );
  }
);

test(
  'Seeker support metadata is minimal and contains no book prose',
  () => {
    const support = JSON.parse(
      read(
        'site/assets/data/student-book-support/seeker.json'
      )
    );

    assert.deepEqual(
      support,
      {
        bookId: 'seeker',
        title: 'Seeker',
        author: 'Douglas E. Richards',
        glossary: []
      }
    );
  }
);

test(
  'Student Portal cache key advances for RC-LIBRARY-06',
  () => {
    const source = read(
      'site/student/index.html'
    );

    assert.match(
      source,
      /\/web\/student-portal-init\.js\?v=2026081403/
    );

    assert.doesNotMatch(
      source,
      /\/web\/student-portal-init\.js\?v=2026081402/
    );
  }
);
