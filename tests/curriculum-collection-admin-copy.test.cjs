/* eslint-env node */
'use strict';

const assert = require('assert');
const fs = require('fs');

const adminIndex = fs.readFileSync('site/teacher/admin/index.html', 'utf8');

assert(
  adminIndex.includes('Legacy Local Scaffolder (Language Arts)'),
  'Old command-copy scaffolder must be labeled as legacy/local.'
);

assert(
  adminIndex.includes('For 2026–27 collection setup, use the Curriculum Collection Manager below.'),
  'Legacy scaffolder must point users to the new 2026–27 registry workflow.'
);

assert(
  adminIndex.includes('Recommended 2026–27 workflow: create, update, archive, and reorder Language Arts collections'),
  'Curriculum Collection Manager must be presented as the preferred 2026–27 workflow.'
);

assert(
  adminIndex.includes('New Language Arts collections land on the shared collection page and use a managed presentation folder.'),
  'Curriculum Collection Manager copy must explain where new collections land.'
);

assert(
  adminIndex.includes('Managed presentation folder'),
  'Curriculum Collection Manager must keep the managed folder field visible.'
);

assert(
  adminIndex.includes('Managed collection route'),
  'Curriculum Collection Manager must keep the managed route field visible.'
);

assert(
  adminIndex.includes('Save Collection Draft'),
  'Curriculum Collection Manager must keep the guarded draft save action visible.'
);

console.log('PASS: admin collection wording clearly separates legacy scaffolder from 2026–27 registry workflow');
