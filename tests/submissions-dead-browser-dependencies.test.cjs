'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function extractAsyncMethod(source, methodName) {
  const startNeedle = `  async ${methodName}(`;
  const start = source.indexOf(startNeedle);

  assert.notEqual(
    start,
    -1,
    `Expected remote method ${methodName} to exist`
  );

  const remainder = source.slice(start + startNeedle.length);
  const nextMatch = remainder.match(/\n {2}async [A-Za-z0-9_$]+\(/);

  const end = nextMatch
    ? start + startNeedle.length + nextMatch.index
    : source.length;

  return source.slice(start, end);
}

const adapter = read('site/web/data-adapter.js');
const mapping = read('site/web/assignment-mapping-db.js');
const review = read('site/web/tc-review.js');

const remoteStart = adapter.indexOf('const remote = {');
assert.ok(remoteStart >= 0, 'Expected canonical remote adapter object');

const remote = adapter.slice(remoteStart);

const addSubmission = extractAsyncMethod(remote, 'addSubmission');
const finalizeSubmission = extractAsyncMethod(remote, 'finalizeSubmission');
const getStudentArchiveData =
  extractAsyncMethod(remote, 'getStudentArchiveData');

// Production-dead scoring mutator must stay retired.
assert.equal(
  mapping.includes('export async function saveSubmissionAnswers('),
  false,
  'saveSubmissionAnswers must remain absent from published runtime'
);

// Finalize must use signed server boundary without anonymous DB fallback.
assert.ok(
  finalizeSubmission.includes(
    "/.netlify/functions/teacher-review-save"
  ),
  'finalizeSubmission must use teacher-review-save'
);

assert.equal(
  finalizeSubmission.includes(".from('submissions')"),
  false,
  'finalizeSubmission must not read submissions directly'
);

assert.equal(
  finalizeSubmission.includes('getSupabase()'),
  false,
  'finalizeSubmission must not acquire browser Supabase for fallback lookup'
);

assert.ok(
  finalizeSubmission.includes(
    'const instanceId = callerInstanceId || null;'
  ),
  'finalizeSubmission must preserve caller instanceId contract'
);

// The two intentionally-live dependencies must remain present for later slices.
assert.ok(
  addSubmission.includes(".from('submissions')"),
  'live addSubmission mutation must remain untouched in D1C1'
);

assert.ok(
  addSubmission.includes("rpc('process_submission'"),
  'live process_submission call must remain untouched in D1C1'
);

assert.ok(
  addSubmission.includes(".from('assignment_instances')"),
  'live addSubmission instance status mutation must remain untouched in D1C1'
);

assert.ok(
  getStudentArchiveData.includes(".from('submissions')"),
  'live Teacher Archive reader must remain untouched in D1C1'
);

// Exactly two published browser submissions accesses should remain.
const publishedDirectSubmissionHits =
  (adapter.match(/\.from\(['"]submissions['"]\)/g) || []).length +
  (mapping.match(/\.from\(['"]submissions['"]\)/g) || []).length;

assert.equal(
  publishedDirectSubmissionHits,
  2,
  'published direct browser submissions dependencies must be exactly 2'
);

// All live Teacher Review finalize callers must continue supplying instanceId.
const finalizeCalls = [
  ...review.matchAll(/db\.finalizeSubmission\s*\(/g)
];

assert.equal(
  finalizeCalls.length,
  4,
  'expected exactly four live Teacher Review finalize callers'
);

for (const match of finalizeCalls) {
  const context = review.slice(match.index, match.index + 1200);

  assert.ok(
    context.includes('instanceId'),
    'every live finalizeSubmission caller must supply instanceId'
  );
}

console.log(
  'PASS: D1C1 dead submissions dependencies remain retired; live paths preserved'
);
