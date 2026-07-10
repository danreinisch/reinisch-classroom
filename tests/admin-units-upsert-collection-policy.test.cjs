/* eslint-env node */
'use strict';

const assert = require('assert');

const {
  validateUnitUpdatePolicy,
} = require('../netlify/functions/admin-units-upsert.js');

const legacy = {
  id: 'adit',
  section: 'language-arts',
  baseOut: 'presentations/a-door-into-time',
  pagePath: '/language-arts/a-door-into-time/',
};

const metadataOnlyEdit = {
  ...legacy,
  title: 'A Door Into Time — Revised Title',
  kind: 'book',
  description: 'Teacher-facing description only.',
  status: 'archived',
  sortOrder: 999,
  slots: 16,
};

assert.strictEqual(
  validateUnitUpdatePolicy(legacy, metadataOnlyEdit),
  '',
  'Metadata-only edits must remain allowed for an existing collection'
);

assert.strictEqual(
  validateUnitUpdatePolicy(legacy, {
    ...metadataOnlyEdit,
    baseOut: 'presentations/something-else',
  }),
  'Existing collection baseOut is locked to preserve live routes and materials.'
);

assert.strictEqual(
  validateUnitUpdatePolicy(legacy, {
    ...metadataOnlyEdit,
    pagePath: '/language-arts/something-else/',
  }),
  'Existing collection pagePath is locked to preserve live routes and materials.'
);

assert.strictEqual(
  validateUnitUpdatePolicy(legacy, {
    ...metadataOnlyEdit,
    section: 'life-skills',
  }),
  'Existing collection section is locked to preserve live routes and materials.'
);

const newLanguageArtsCollection = {
  id: 'long-way-down',
  section: 'language-arts',
  baseOut: 'presentations/long-way-down',
  pagePath: '/language-arts/collection/',
};

assert.strictEqual(
  validateUnitUpdatePolicy(null, newLanguageArtsCollection),
  '',
  'A new Language Arts collection must accept the managed folder and shared route'
);

assert.strictEqual(
  validateUnitUpdatePolicy(null, {
    ...newLanguageArtsCollection,
    pagePath: '/language-arts/long-way-down/',
  }),
  'New Language Arts collections must use the shared collection route.'
);

assert.strictEqual(
  validateUnitUpdatePolicy(null, {
    ...newLanguageArtsCollection,
    baseOut: 'presentations/not-the-id',
  }),
  'New Language Arts collections must use the managed presentation folder.'
);

console.log('PASS: admin-units-upsert collection route/material policy');
