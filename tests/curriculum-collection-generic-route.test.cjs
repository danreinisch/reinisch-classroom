/* eslint-env node */
'use strict';

const assert = require('assert');
const fs = require('fs');

const unitGrid = fs.readFileSync('site/assets/js/unit-grid.js', 'utf8');
const nav = fs.readFileSync('site/web/public-nav.js', 'utf8');
const landingRenderer = fs.readFileSync(
  'site/assets/js/language-arts-collections.js',
  'utf8'
);
const genericRoute = fs.readFileSync(
  'site/language-arts/collection/index.html',
  'utf8'
);

assert.ok(
  unitGrid.includes('function requestedCollectionId()'),
  'unit-grid must read the collection query parameter'
);

assert.ok(
  unitGrid.includes('function resolveUnitId(units)'),
  'unit-grid must resolve a collection ID for the generic route'
);

assert.ok(
  unitGrid.includes("clean === '/language-arts/collection/'"),
  'unit-grid must limit query-based collection resolution to the generic route'
);

assert.ok(
  unitGrid.includes("(unit.status || 'active') === 'active'"),
  'generic route resolution must hide archived collections'
);

assert.ok(
  unitGrid.includes('const activeUnits = units.filter') &&
    unitGrid.includes('for (const u of activeUnits)') &&
    unitGrid.includes("(unit.status || 'active') === 'active'"),
  'path-based unit resolution must skip archived records before matching duplicate page paths'
);

assert.ok(
  unitGrid.includes('const inferredUnit = units.find') &&
    unitGrid.includes("return inferredUnit ? inferredUnit.id : '';"),
  'legacy collection grids must not actively resolve archived collections'
);

assert.ok(
  unitGrid.includes('applyGenericCollectionLabels(unit)'),
  'generic route must receive its registry title and description'
);

assert.ok(
  nav.includes("path === '/language-arts/collection/'") &&
  nav.includes("'?collection='"),
  'shared Language Arts navigation must include the collection query parameter'
);

assert.ok(
  landingRenderer.includes("path === '/language-arts/collection/'") &&
  landingRenderer.includes("'?collection='"),
  'Language Arts landing cards must include the collection query parameter'
);

assert.ok(
  genericRoute.includes('data-collection-title') &&
  genericRoute.includes('data-collection-description') &&
  genericRoute.includes('id="grid"') &&
  genericRoute.includes('/assets/js/unit-grid.js'),
  'generic collection page must contain dynamic labels and the shared grid'
);

console.log('PASS: Curriculum Collection Registry v2 generic collection route');
