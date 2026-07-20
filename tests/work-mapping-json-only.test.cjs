'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'site',
    'teacher',
    'work',
    'index.html'
  ),
  'utf8'
);

const workSource = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'site',
    'web',
    'tc-work.js'
  ),
  'utf8'
);

const mappingInputMatch = html.match(
  /id="mappingFile"[\s\S]*?accept="([^"]+)"/
);

assert.ok(
  mappingInputMatch,
  'Mapping file input accept attribute not found'
);

const accepted = mappingInputMatch[1];

assert.ok(
  accepted.includes('.json'),
  'Mapping input must accept JSON'
);

assert.ok(
  accepted.includes('application/json'),
  'Mapping input must accept application/json'
);

assert.ok(
  !accepted.includes('.csv'),
  'Mapping input must not advertise CSV'
);

assert.ok(
  !accepted.includes('text/csv'),
  'Mapping input must not advertise text/csv'
);

assert.ok(
  html.includes(
    'Accepts JSON format for question-to-standard tag mapping.'
  ),
  'Work UI must document JSON-only explicit mappings'
);

assert.ok(
  !html.includes(
    'Accepts CSV or JSON'
  ),
  'Work UI must not advertise CSV mapping support'
);

assert.ok(
  !html.includes(
    'CSV (recommended):'
  ),
  'Work UI must not show a CSV mapping example'
);

assert.ok(
  !workSource.includes(
    'Not JSON (CSV or other)'
  ),
  'Mapping preview must not imply CSV support'
);

console.log(
  '✓ Work mapping picker advertises JSON only'
);

console.log(
  '✓ CSV mapping support is no longer advertised'
);

console.log(
  '✓ JSON remains the explicit mapping contract'
);

console.log('');
console.log(
  'WORK MAPPING JSON-ONLY CONTRACT: PASS'
);
