'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const gradebookHtml = read('site/teacher/gradebook/index.html');
const headerTools = read('site/web/tc-gradebook-header-tools.js');
const packageJson = JSON.parse(read('package.json'));

console.log('--- Gradebook header copy/readability contract ---');

assert.match(
  gradebookHtml,
  /<script\s+defer\s+src="\/web\/tc-gradebook-header-tools\.js\?v=20260910-header-copy-readability"><\/script>/,
  'Gradebook page must load the page-scoped header enhancement with a cache key'
);
console.log('✓ Gradebook page loads the cache-busted header enhancement');

assert.match(
  headerTools,
  /location\.pathname\.startsWith\("\/teacher\/gradebook"\)/,
  'Header enhancement must be scoped to the Gradebook route'
);
assert.match(
  headerTools,
  /querySelectorAll\("\.gb-col-title"\)/,
  'Header enhancement must target assignment-title headers already produced by tc-gradebook.js'
);
console.log('✓ enhancement is route-scoped and reuses existing Gradebook title nodes');

assert.match(
  headerTools,
  /getAttribute\("title"\)/,
  'Displayed/copied text must come from the existing full canonical title attribute'
);
assert.match(
  headerTools,
  /titleEl\.textContent\s*=\s*fullTitle\s*\+\s*sortSuffix/,
  'Visible title must use the full title while preserving the existing sort indicator'
);
assert.doesNotMatch(
  headerTools,
  /substring\s*\(\s*0\s*,\s*(10|24)\s*\)/,
  'Enhancement must not introduce another short hard truncation'
);
console.log('✓ full assignment titles replace the 10/24-character visual truncation');

assert.match(
  headerTools,
  /className\s*=\s*"gb-header-copy-btn"/,
  'Each assignment header must receive a dedicated copy button'
);
assert.match(
  headerTools,
  /navigator\.clipboard\.writeText\(text\)/,
  'Copy button must use the Clipboard API when available'
);
assert.match(
  headerTools,
  /document\.execCommand\("copy"\)/,
  'Copy button must retain a fallback for browsers without Clipboard API support'
);
assert.match(
  headerTools,
  /event\.stopPropagation\(\)/,
  'Copy interaction must not bubble into the existing column-sort click handler'
);
assert.doesNotMatch(
  headerTools,
  /addEventListener\("dblclick"/,
  'Copying should use the explicit header button rather than colliding with double-click sorting'
);
console.log('✓ one-click copy is isolated from Gradebook sorting');

assert.match(
  headerTools,
  /white-space:\s*normal\s*!important/,
  'Assignment headers must be allowed to wrap'
);
assert.match(
  headerTools,
  /min-width:\s*180px\s*!important/,
  'Comfortable mode must provide a readable assignment-column minimum width'
);
assert.match(
  headerTools,
  /min-width:\s*132px\s*!important/,
  'Compact mode must stay denser while remaining more readable than the legacy 56/68px width'
);
assert.match(
  headerTools,
  /overflow-wrap:\s*anywhere/,
  'Long assignment titles must wrap safely rather than force layout overflow'
);
console.log('✓ readable wrapping works in both Comfortable and Compact modes');

assert.match(
  headerTools,
  /new MutationObserver/,
  'Enhancement must reapply after Gradebook rerenders its table head'
);
assert.match(
  headerTools,
  /observer\.observe\(tableHead/,
  'Mutation observer must watch the existing Gradebook table head only'
);
console.log('✓ header tools survive class/filter/sort rerenders');

assert.doesNotMatch(
  headerTools,
  /\bfetch\s*\(/,
  'Header enhancement must not add network or data-writing behavior'
);
assert.doesNotMatch(
  headerTools,
  /\b(db|supabase)\s*\./i,
  'Header enhancement must not touch Gradebook data adapters or Supabase'
);
console.log('✓ enhancement is presentation/clipboard-only with no data writes');

assert.ok(
  String(packageJson.scripts && packageJson.scripts['test:unit'] || '')
    .includes('tests/gradebook-header-copy-readability.test.cjs'),
  'Focused regression must be registered in test:unit'
);
console.log('✓ focused regression is registered in test:unit');

console.log('\n✓ Gradebook header copy/readability contract passed');
