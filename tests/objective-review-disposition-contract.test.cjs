'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const migrationPath = path.join(
  root,
  'supabase/migrations/20260827013500_objective_review_dispositions.sql'
);

const reviewPath = path.join(
  root,
  'site/web/tc-review.js'
);

const readerPath = path.join(
  root,
  'netlify/functions/teacher-review-submission-answers.js'
);

const savePath = path.join(
  root,
  'netlify/functions/teacher-review-save.js'
);

const migration = fs.readFileSync(migrationPath, 'utf8');
const review = fs.readFileSync(reviewPath, 'utf8');
const reader = fs.readFileSync(readerPath, 'utf8');
const save = fs.readFileSync(savePath, 'utf8');

console.log(
  'Running 5E2B objective Not Scorable contract...'
);

assert.match(
  migration,
  /CREATE TABLE IF NOT EXISTS public\.objective_review_dispositions/
);

assert.match(
  migration,
  /CHECK \(disposition = 'not_scorable'\)/
);

assert.match(
  migration,
  /UNIQUE \(\s*assignment_instance_id,\s*item_id,\s*objective_id\s*\)/
);

assert.match(
  migration,
  /REVOKE ALL PRIVILEGES[\s\S]*FROM anon/
);

assert.match(
  migration,
  /REVOKE ALL PRIVILEGES[\s\S]*FROM authenticated/
);

console.log(
  '✓ Not Scorable disposition storage is normalized and server-only'
);

assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION public\.reconcile_objective_review_outcomes/
);

assert.match(
  migration,
  /DELETE FROM public\.objective_review_dispositions/
);

assert.match(
  migration,
  /DELETE FROM public\.objective_data_points/
);

assert.match(
  migration,
  /WHERE outcome\.disposition = 'scored'/
);

assert.match(
  migration,
  /WHERE outcome\.disposition = 'not_scorable'/
);

assert.match(
  migration,
  /GRANT EXECUTE[\s\S]*TO service_role/
);

console.log(
  '✓ scored vs Not Scorable reconciliation is one server-only transaction'
);

assert.ok(
  !migration.includes(
    "objective_earned = 0"
  ),
  'Not Scorable must never be encoded as fake zero evidence'
);

assert.ok(
  !migration.includes(
    "objective_max = 0"
  ),
  'Not Scorable must never use a zero denominator sentinel'
);

console.log(
  '✓ Not Scorable cannot masquerade as measured 0%'
);

assert.ok(
  review.includes(
    'objective-review-not-scorable'
  ),
  '5E2B RED: Review UI is missing per-component Not Scorable controls'
);

assert.ok(
  reader.includes(
    'objective_review_dispositions'
  ),
  '5E2B RED: Review reader is missing persisted disposition enrichment'
);

assert.ok(
  save.includes(
    'reconcile_objective_review_outcomes'
  ),
  '5E2B RED: signed Review save is missing atomic outcome reconciliation'
);

console.log('');
console.log(
  '5E2B OBJECTIVE NOT-SCORABLE CONTRACT: PASS'
);
