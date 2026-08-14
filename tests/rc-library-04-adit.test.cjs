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
  'ADIT is allowlisted only to its fixed private Storage object',
  () => {
    const source = read(
      'netlify/functions/student-book.js'
    );

    assert.match(
      source,
      /'a-door-into-time': Object\.freeze\(\{[\s\S]*?objectPath:\s*'books\/a-door-into-time\.epub'[\s\S]*?filename:\s*'A Door Into Time\.epub'[\s\S]*?contentType:\s*'application\/epub\+zip'/
    );
  }
);

test(
  'Student Resource slot 3 maps ADIT into the secure EPUB reader',
  () => {
    const source = read(
      'site/web/student-portal-init.js'
    );

    assert.match(
      source,
      /['"]\/student\/resources\/presentation-03\/['"][\s\S]*?id:\s*['"]a-door-into-time['"][\s\S]*?title:\s*['"]A Door Into Time['"]/
    );

    assert.match(
      source,
      /supportPath:\s*['"]\/assets\/data\/student-book-support\/a-door-into-time\.json['"]/
    );
  }
);

test(
  'Student Resources publishes ADIT as slot 3 without disturbing slots 1 or 2',
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
  }
);

test(
  'ADIT support metadata is minimal and contains no book prose',
  () => {
    const support = JSON.parse(
      read(
        'site/assets/data/student-book-support/a-door-into-time.json'
      )
    );

    assert.deepEqual(
      support,
      {
        bookId: 'a-door-into-time',
        title: 'A Door Into Time',
        author: 'Shawn Inmon',
        glossary: []
      }
    );
  }
);
