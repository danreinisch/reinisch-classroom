'use strict';

const assert = require('assert');

const {
  getCurrentSchoolYear,
  resolveSchoolYear,
} = require('../netlify/functions/_lib/school-year');

console.log('Running school-year tests...\n');

assert.strictEqual(
  getCurrentSchoolYear(new Date('2026-07-18T12:00:00')),
  2025
);
console.log('✓ existing July behavior remains 2025');

assert.strictEqual(
  getCurrentSchoolYear(new Date('2026-08-01T12:00:00')),
  2026
);
console.log('✓ existing August behavior remains 2026');

assert.strictEqual(
  resolveSchoolYear(
    { schoolYear: 2026 },
    new Date('2026-07-18T12:00:00')
  ),
  2026
);
console.log('✓ explicit schoolYear: 2026 overrides July fallback');

assert.strictEqual(
  resolveSchoolYear(
    { school_year: '2026' },
    new Date('2026-07-18T12:00:00')
  ),
  2026
);
console.log('✓ explicit school_year string is accepted');

assert.strictEqual(
  resolveSchoolYear(
    {},
    new Date('2026-07-18T12:00:00')
  ),
  2025
);
console.log('✓ draft without override preserves existing behavior');

assert.strictEqual(
  resolveSchoolYear(
    { schoolYear: 'banana' },
    new Date('2026-07-18T12:00:00')
  ),
  2025
);
console.log('✓ invalid override safely falls back');

console.log('\n✓ All school-year tests passed!');
