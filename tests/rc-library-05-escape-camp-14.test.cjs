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
  'Escape from Camp 14 uses its fixed private Storage object',
  () => {
    const source = read(
      'netlify/functions/student-book.js'
    );

    assert.match(
      source,
      /'escape-from-camp-14': Object\.freeze\(\{[\s\S]*?objectPath:\s*'books\/escape-from-camp-14\.epub'[\s\S]*?filename:\s*'Escape from Camp 14\.epub'[\s\S]*?contentType:\s*'application\/epub\+zip'/
    );
  }
);

test(
  'Student Resource slot 4 maps Escape from Camp 14 into the secure EPUB reader',
  () => {
    const source = read(
      'site/web/student-portal-init.js'
    );

    assert.match(
      source,
      /['"]\/student\/resources\/presentation-04\/['"][\s\S]*?id:\s*['"]escape-from-camp-14['"][\s\S]*?title:\s*['"]Escape from Camp 14['"]/
    );

    assert.match(
      source,
      /supportPath:\s*['"]\/assets\/data\/student-book-support\/escape-from-camp-14\.json['"]/
    );
  }
);

test(
  'Student Resources publishes Escape as slot 4 while preserving slots 1 through 3',
  () => {
    const state = JSON.parse(
      read('site/assets/data/site-state.json')
    );

    const category =
      state.categories.student_resources;

    assert.equal(
      category.titles[0],
      'Language Arts Skill Builder'
    );

    assert.equal(
      category.links[0],
      '/student/resources/presentation-01/'
    );

    assert.equal(
      category.titles[1],
      '"Lost in Kragdon-ah" by Shawn Inmon'
    );

    assert.equal(
      category.links[1],
      '/student/resources/presentation-02/'
    );

    assert.equal(
      category.titles[2],
      '"A Door Into Time" by Shawn Inmon'
    );

    assert.equal(
      category.links[2],
      '/student/resources/presentation-03/'
    );

    assert.equal(
      category.titles[3],
      '"Escape from Camp 14" by Blaine Harden'
    );

    assert.equal(
      category.links[3],
      '/student/resources/presentation-04/'
    );
  }
);

test(
  'Escape support metadata is minimal and contains no book prose',
  () => {
    const support = JSON.parse(
      read(
        'site/assets/data/student-book-support/escape-from-camp-14.json'
      )
    );

    assert.deepEqual(
      support,
      {
        bookId: 'escape-from-camp-14',
        title: 'Escape from Camp 14',
        author: 'Blaine Harden',
        glossary: []
      }
    );
  }
);
