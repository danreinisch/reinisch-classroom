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
  'Warrior of Kragdon-ah uses its fixed private Storage object',
  () => {
    const source = read(
      'netlify/functions/student-book.js'
    );

    assert.match(
      source,
      /'warrior-of-kragdon-ah': Object\.freeze\(\{[\s\S]*?objectPath:\s*'books\/warrior-of-kragdon-ah\.epub'[\s\S]*?filename:\s*'Warrior of Kragdon-ah\.epub'[\s\S]*?contentType:\s*'application\/epub\+zip'/
    );
  }
);

test(
  'Student Resource slot 8 maps Warrior into the secure EPUB reader',
  () => {
    const source = read(
      'site/web/student-portal-init.js'
    );

    assert.match(
      source,
      /['"]\/student\/resources\/presentation-08\/['"][\s\S]*?id:\s*['"]warrior-of-kragdon-ah['"][\s\S]*?title:\s*['"]Warrior of Kragdon-ah['"]/
    );

    assert.match(
      source,
      /supportPath:\s*['"]\/assets\/data\/student-book-support\/warrior-of-kragdon-ah\.json['"]/
    );
  }
);

test(
  'Student Resources consumes slot 8 for Warrior while preserving 40-slot topology',
  () => {
    const state = JSON.parse(
      read('site/assets/data/site-state.json')
    );

    const category =
      state.categories.student_resources;

    assert.equal(
      category.slots,
      40
    );

    assert.equal(
      category.titles.length,
      40
    );

    assert.equal(
      category.links.length,
      40
    );

    assert.deepEqual(
      category.titles.slice(0, 9),
      [
        'Language Arts Skill Builder',
        '"Lost in Kragdon-ah" by Shawn Inmon',
        '"A Door Into Time" by Shawn Inmon',
        '"Escape from Camp 14" by Blaine Harden',
        '"Seeker" by Douglas E. Richards',
        '"1984" by George Orwell',
        '"Return from Kragdon-ah" by Shawn Inmon',
        '"Warrior of Kragdon-ah" by Shawn Inmon',
        ''
      ]
    );

    assert.deepEqual(
      category.links.slice(0, 9),
      [
        '/student/resources/presentation-01/',
        '/student/resources/presentation-02/',
        '/student/resources/presentation-03/',
        '/student/resources/presentation-04/',
        '/student/resources/presentation-05/',
        '/student/resources/presentation-06/',
        '/student/resources/presentation-07/',
        '/student/resources/presentation-08/',
        ''
      ]
    );

    for (
      let index = 0;
      index < category.slots;
      index += 1
    ) {
      assert.equal(
        category.titles[index] === '',
        category.links[index] === '',
        `title/link pairing mismatch at slot ${index + 1}`
      );
    }
  }
);

test(
  'Warrior support metadata is minimal and contains no book prose',
  () => {
    const support = JSON.parse(
      read(
        'site/assets/data/student-book-support/warrior-of-kragdon-ah.json'
      )
    );

    assert.deepEqual(
      support,
      {
        bookId: 'warrior-of-kragdon-ah',
        title: 'Warrior of Kragdon-ah',
        author: 'Shawn Inmon',
        glossary: []
      }
    );
  }
);

test(
  'Student Portal cache key is at least the RC-LIBRARY-09 version',
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
      Number(matches[0][1]) >= 2026081406,
      'Student Portal cache key regressed below RC-LIBRARY-09'
    );

    assert.doesNotMatch(
      source,
      /\/web\/student-portal-init\.js\?v=2026081405/
    );
  }
);
