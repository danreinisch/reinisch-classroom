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
  '1984 uses its fixed private Storage object',
  () => {
    const source = read(
      'netlify/functions/student-book.js'
    );

    assert.match(
      source,
      /'1984': Object\.freeze\(\{[\s\S]*?objectPath:\s*'books\/1984\.epub'[\s\S]*?filename:\s*'1984\.epub'[\s\S]*?contentType:\s*'application\/epub\+zip'/
    );
  }
);

test(
  'Student Resource slot 6 maps 1984 into the secure EPUB reader',
  () => {
    const source = read(
      'site/web/student-portal-init.js'
    );

    assert.match(
      source,
      /['"]\/student\/resources\/presentation-06\/['"][\s\S]*?id:\s*['"]1984['"][\s\S]*?title:\s*['"]1984['"]/
    );

    assert.match(
      source,
      /supportPath:\s*['"]\/assets\/data\/student-book-support\/1984\.json['"]/
    );
  }
);

test(
  'Student Resources publishes 1984 as slot 6 while preserving slots 1 through 5',
  () => {
    const state = JSON.parse(
      read('site/assets/data/site-state.json')
    );

    const category =
      state.categories.student_resources;

    assert.deepEqual(
      category.titles.slice(0, 6),
      [
        'Language Arts Skill Builder',
        '"Lost in Kragdon-ah" by Shawn Inmon',
        '"A Door Into Time" by Shawn Inmon',
        '"Escape from Camp 14" by Blaine Harden',
        '"Seeker" by Douglas E. Richards',
        '"1984" by George Orwell'
      ]
    );

    assert.deepEqual(
      category.links.slice(0, 6),
      [
        '/student/resources/presentation-01/',
        '/student/resources/presentation-02/',
        '/student/resources/presentation-03/',
        '/student/resources/presentation-04/',
        '/student/resources/presentation-05/',
        '/student/resources/presentation-06/'
      ]
    );

    assert.ok(
      state.categories['1984-2026-27']
    );
  }
);

test(
  '1984 support metadata is minimal and contains no book prose',
  () => {
    const support = JSON.parse(
      read(
        'site/assets/data/student-book-support/1984.json'
      )
    );

    assert.deepEqual(
      support,
      {
        bookId: '1984',
        title: '1984',
        author: 'George Orwell',
        glossary: []
      }
    );
  }
);

test(
  'Student Portal cache key is at least the RC-LIBRARY-07 version',
  () => {
    const source = read(
      'site/student/index.html'
    );

    const matches = [
      ...source.matchAll(
        /\/web\/student-portal-init\.js\?v=(\d+)/g
      )
    ];

    assert.equal(
      matches.length,
      1,
      'expected exactly one Student Portal cache-key reference'
    );

    assert.ok(
      Number(matches[0][1]) >= 2026081404,
      'Student Portal cache key regressed below RC-LIBRARY-07'
    );

    assert.doesNotMatch(
      source,
      /\/web\/student-portal-init\.js\?v=2026081403/
    );
  }
);
