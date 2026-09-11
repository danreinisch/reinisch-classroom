const assert = require('node:assert/strict');
const fs = require('node:fs');

const wrapper = fs.readFileSync('site/web/tc-overview.js', 'utf8');
const ui = fs.readFileSync('site/web/tc-overview-ui.js', 'utf8');
const css = fs.readFileSync('site/assets/css/teacher-overview-v2.css', 'utf8');

// Preserve the proven dashboard logic as an isolated core instead of rewriting it.
assert.match(wrapper, /tc-overview-core\.js/);
assert.match(wrapper, /tc-overview-ui\.js/);
assert.match(ui, /existing tc-overview-core\.js remains the owner/);

// Approved overview hierarchy.
assert.match(ui, /Needs Attention/);
assert.match(ui, /Today/);
assert.match(ui, /Student Alerts/);
assert.match(ui, /Classroom Pulse/);
assert.match(ui, /Quick Access/);

// Today stays compact, category-driven, and system-aware rather than exposing
// the legacy manual checklist checkboxes.
assert.match(ui, /Progress\/Data/);
assert.match(ui, /classifyTodayItem/);
assert.match(css, /\.checklist-checkbox \{ display: none !important; \}/);

// Recent Activity and Calendar Snapshot remain in the proven core for now but
// their legacy top-level shells are removed from the Overview presentation.
assert.match(ui, /ov-v2-legacy-shell/);
assert.match(css, /ov-v2-legacy-shell\[hidden\]/);

// Quick-access links must jump to substantive teacher workflows.
for (const route of [
  '/teacher/work/',
  '/teacher/review/',
  '/teacher/observations/',
  '/teacher/gradebook/',
  '/teacher/reporting/',
]) {
  assert.ok(ui.includes(route), `missing quick-access route ${route}`);
}

// Student-alert and pulse drill-down destinations stay in teacher-owned routes.
assert.match(ui, /href=\"\/teacher\/students\/\"/);
assert.match(ui, /href=\"\/teacher\/calendar\/\"/);

console.log('teacher overview command-center contract: ok');
