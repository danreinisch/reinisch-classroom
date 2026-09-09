'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.SESSION_SECRET = 'week2-day4-diagnostic-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';

const diagnosticPath = path.join(
  __dirname,
  '..',
  'netlify',
  'functions',
  'teacher-week2-day4-diagnostic.js'
);

const source = fs.readFileSync(diagnosticPath, 'utf8');

assert.doesNotMatch(
  source,
  /method:\s*['"](?:POST|PATCH|DELETE|PUT)['"]/i,
  'diagnostic endpoint must remain read-only'
);
assert.doesNotMatch(
  source,
  /patchJson|deleteRows|insert|upsert/i,
  'diagnostic endpoint must not contain mutation helpers'
);

const {
  dayShape,
  isWeek2Like,
  redactTitle,
  summarizeClass,
} = require('../netlify/functions/teacher-week2-day4-diagnostic')._test;

assert.strictEqual(
  redactTitle('WEEK 2 — 1984 — Truth, Language & Memory — S069'),
  'WEEK 2 — 1984 — Truth, Language & Memory — S###'
);

assert.strictEqual(
  isWeek2Like({
    title: 'Something else',
    meta: { source_file: 'WEEK_02_UPLOAD.txt' },
  }),
  true
);
assert.strictEqual(
  isWeek2Like({
    title: 'WEEK 2 — Something',
    meta: {},
  }),
  true
);
assert.strictEqual(
  isWeek2Like({
    title: 'WEEK 3 — Something',
    meta: { source_file: 'WEEK_03_UPLOAD.txt' },
  }),
  false
);

assert.strictEqual(
  dayShape({ days: [
    { day_number: 1 },
    { day_number: 2 },
    { day_number: 3 },
    { day_number: 4 },
  ] }),
  '1,2,3,4'
);

const target = {
  className: 'Language Arts 3 SC',
  expectedCount: 2,
  title: 'WEEK 2 — 1984 — Truth, Language & Memory',
};
const classRow = { id: 'class-3', name: target.className };
const assignments = [
  {
    id: 1,
    class_id: 'class-3',
    title: 'WEEK 2 — 1984 — Truth, Language & Memory — S001',
    school_year: null,
    meta: {
      source_file: 'WEEK_02_UPLOAD.txt',
      class_name: 'LA 3 SC',
      days: [
        { day_number: 1 },
        { day_number: 2 },
        { day_number: 3 },
        { day_number: 4 },
      ],
    },
  },
  {
    id: 2,
    class_id: 'class-3',
    title: 'Week 2 - legacy title - S002',
    school_year: 2025,
    meta: {
      source_file: 'week2.txt',
      days: [
        { day_number: 1 },
        { day_number: 2 },
        { day_number: 3 },
      ],
    },
  },
  {
    id: 3,
    class_id: 'class-3',
    title: 'WEEK 3 — not relevant — S003',
    school_year: 2026,
    meta: { source_file: 'WEEK_03_UPLOAD.txt', days: [{ day_number: 1 }] },
  },
];
const instances = [
  { assignment_id: 1, assigned_at: '2026-09-01', due_at: '2026-09-11T23:59:59' },
  { assignment_id: 2, assigned_at: '2026-09-02', due_at: '2026-09-11T23:59:59' },
  { assignment_id: 3, assigned_at: '2026-09-07', due_at: '2026-09-18T23:59:59' },
];

const summary = summarizeClass(target, classRow, assignments, instances);
assert.strictEqual(summary.total_assignments_in_class, 3);
assert.strictEqual(summary.week2_like_assignments, 2);
assert.strictEqual(
  summary.week2_identity.title_patterns[
    'WEEK 2 — 1984 — Truth, Language & Memory — S###'
  ],
  1
);
assert.strictEqual(summary.week2_identity.school_years['(blank)'], 1);
assert.strictEqual(summary.week2_identity.school_years['2025'], 1);
assert.strictEqual(summary.week2_identity.day_shapes['1,2,3,4'], 1);
assert.strictEqual(summary.week2_identity.day_shapes['1,2,3'], 1);
assert.strictEqual(summary.week2_identity.due_dates['2026-09-11'], 2);

console.log('week2-day4-diagnostic regression tests passed');
