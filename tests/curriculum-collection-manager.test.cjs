/* eslint-env node */
'use strict';

const assert = require('assert');
const fs = require('fs');

const markup = fs.readFileSync('site/teacher/admin/index.html', 'utf8');
const manager = fs.readFileSync('site/teacher/admin/app.js', 'utf8');
const backend = fs.readFileSync('netlify/functions/admin-units-upsert.js', 'utf8');
const generator = fs.readFileSync('scripts/generate-lessons-index.mjs', 'utf8');

for (const id of [
  'unitMgrExisting',
  'btnUnitMgrNew',
  'unitMgrKind',
  'unitMgrDescription',
  'unitMgrStatusField',
  'unitMgrSortOrder',
]) {
  assert.ok(markup.includes('id="' + id + '"'), 'Missing Admin manager control: ' + id);
}

assert.ok(
  markup.includes('id="unitMgrSection"') &&
  markup.includes('value="language-arts"') &&
  markup.includes('This manager is currently scoped to the safe Language Arts collection workflow.'),
  'Curriculum Collection Manager must be visibly scoped to Language Arts'
);

assert.ok(
  !markup.includes('<option value="life-skills">Life Skills</option>'),
  'Curriculum Collection Manager must not offer a new Life Skills collection path'
);

assert.ok(
  manager.includes('Curriculum Collection Manager is currently scoped to Language Arts.'),
  'Curriculum Collection Manager must reject a forged non-Language-Arts section value'
);

assert.ok(
  manager.includes("pagePath = '/language-arts/collection/';"),
  'New Language Arts collections must default to the reusable collection route'
);

assert.ok(
  manager.includes("body: JSON.stringify({ ...payload, createPr: true })"),
  'Collection manager must retain the guarded draft-PR save path'
);

assert.ok(
  manager.includes('function loadKnownCollections()'),
  'Collection manager must load existing collections for editing'
);

assert.ok(
  manager.includes('function resetNewCollection()'),
  'Collection manager must support creating a new collection'
);

for (const field of ['kind', 'description', 'status', 'sortOrder']) {
  assert.ok(
    backend.includes(field),
    'Backend must preserve collection field: ' + field
  );
}

assert.ok(
  markup.includes('id="unitMgrBaseOut" class="input" placeholder="presentations/collection-id" readonly'),
  'Managed presentation folder must be read-only in the Admin manager'
);

assert.ok(
  markup.includes('id="unitMgrPagePath" class="input" placeholder="/language-arts/collection/" readonly'),
  'Managed collection route must be read-only in the Admin manager'
);

assert.ok(
  backend.includes('function validateUnitUpdatePolicy('),
  'Backend must enforce route and material-path preservation'
);

assert.ok(
  backend.includes('usesGenericCollectionRoute'),
  'Backend must recognize the reusable generic collection route'
);

assert.ok(
  backend.includes("unit.pagePath === '/language-arts/collection/'"),
  'Backend must avoid generating one static page per new Language Arts collection'
);

assert.ok(
  generator.includes("(u.status || 'active') === 'active'"),
  'Generated lessons index must omit archived collections'
);

assert.ok(
  generator.includes('if (!unitMeta) continue;'),
  'Filesystem scanning must not re-add archived Language Arts collections'
);

assert.ok(
  generator.includes("unit.section === 'life-skills'") &&
    generator.includes("(unit.status || 'active') === 'active'"),
  'Generated lessons index must include only active registered Life Skills collections'
);

assert.ok(
  generator.includes("const baseOut = String(unitMeta.baseOut || '')"),
  'Life Skills discovery must resolve presentation folders from registry baseOut'
);

assert.ok(
  !generator.includes("find(u => u.id === 'life')"),
  'Life Skills discovery must not depend on the legacy life collection ID'
);

assert.ok(
  generator.includes('units.sort((a, b) => {'),
  'Generated lessons index must respect registry ordering'
);

console.log('PASS: Curriculum Collection Registry v2 manager and backend contract');
