/* eslint-env node */
'use strict';

const assert = require('assert');
const fs = require('fs');

const nav = fs.readFileSync('site/web/public-nav.js', 'utf8');
const landing = fs.readFileSync('site/language-arts/index.html', 'utf8');
const renderer = fs.readFileSync('site/assets/js/language-arts-collections.js', 'utf8');

assert.ok(
  landing.includes('/assets/js/language-arts-collections.js'),
  'Language Arts landing page must load the registry-backed collection renderer'
);

assert.ok(
  renderer.includes('/assets/data/units.json'),
  'Language Arts landing renderer must load the collection registry'
);

assert.ok(
  renderer.includes("unit.section === 'language-arts'"),
  'Language Arts landing renderer must filter to Language Arts collections'
);

assert.ok(
  renderer.includes("(unit.status || 'active') === 'active'"),
  'Language Arts landing renderer must exclude archived collections'
);

assert.ok(
  nav.includes('function appendLanguageArtsCollections'),
  'Shared navigation must append active Language Arts collections dynamically'
);

const laNavStart = nav.indexOf('var LA_NAV = [');
const laNavEnd = nav.indexOf('];', laNavStart);

assert.ok(laNavStart >= 0 && laNavEnd > laNavStart, 'LA_NAV block must exist');

const laNavBlock = nav.slice(laNavStart, laNavEnd);

assert.ok(
  !laNavBlock.includes('A Door Into Time') &&
  !laNavBlock.includes('Lost in Kragdon') &&
  !laNavBlock.includes('Return from Kragdon') &&
  !laNavBlock.includes('Warrior of Kragdon'),
  'LA_NAV must no longer hardcode the four legacy book titles'
);

console.log('PASS: Curriculum Collection Registry v2 navigation wiring');
