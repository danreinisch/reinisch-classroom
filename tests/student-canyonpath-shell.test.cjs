const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('site/assets/css/student-canyonpath.css', 'utf8');
const js = fs.readFileSync('site/web/student-canyonpath.js', 'utf8');
const sidebar = fs.readFileSync('site/web/sidebar-init.js', 'utf8');

test('Student Portal Phase 2A CanyonPath layer stays presentation-only and scoped', () => {
  assert.match(css, /body\.rc-student-canyonpath/);
  assert.match(css, /rc-canyonpath-landscape-detail\.svg/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /html\[data-theme='light'\]/);
  assert.doesNotMatch(css, /supabase|fetch\(|localStorage|sessionStorage/);

  assert.match(js, /rc-student-canyonpath/);
  assert.match(js, /stcp-hero/);
  assert.match(js, /stcp-quick/);
  assert.match(js, /stcp-dashboard-grid/);
  assert.match(js, /stcp-footer/);
  assert.doesNotMatch(js, /supabase|\.insert\(|\.update\(|\.delete\(|fetch\(/);
});

test('Phase 2A quick navigation uses SVG icons instead of emoji UI art', () => {
  assert.match(js, /<svg viewBox=/);
  assert.doesNotMatch(js, /[🔎📚♞🎯🏆🔥🎮📝]/u);
  assert.match(js, /Skill Builder/);
  assert.match(js, /Word Search/);
  assert.match(js, /Classroom Chess/);
  assert.match(js, /Four in a Row/);
});

test('Student route loads CanyonPath foundation and Phase 2A assets after existing polish', () => {
  assert.match(sidebar, /student-portal-polish\.css\?v=20260907-polish1/);
  assert.match(sidebar, /rc-canyonpath\.css\?v=20260907-cp1/);
  assert.match(sidebar, /rc-canyonpath-detail\.css\?v=20260907-cp1/);
  assert.match(sidebar, /student-canyonpath\.css\?v=20260907-2a1/);
  assert.match(sidebar, /student-canyonpath\.js\?v=20260907-2a1/);
});
