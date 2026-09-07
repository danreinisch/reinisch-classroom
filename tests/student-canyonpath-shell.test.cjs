const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('site/assets/css/student-canyonpath.css', 'utf8');
const refineCss = fs.readFileSync('site/assets/css/student-canyonpath-refine.css', 'utf8');
const fixesCss = fs.readFileSync('site/assets/css/student-canyonpath-fixes.css', 'utf8');
const cinematicCss = fs.readFileSync('site/assets/css/student-canyonpath-cinematic.css', 'utf8');
const premiumCss = fs.readFileSync('site/assets/css/student-canyonpath-premium.css', 'utf8');
const js = fs.readFileSync('site/web/student-canyonpath.js', 'utf8');
const refineJs = fs.readFileSync('site/web/student-canyonpath-refine.js', 'utf8');
const sidebar = fs.readFileSync('site/web/sidebar-init.js', 'utf8');

test('Student Portal Phase 2A CanyonPath layer stays presentation-only and scoped', () => {
  assert.match(css, /body\.rc-student-canyonpath/);
  assert.match(refineCss, /body\.rc-student-canyonpath/);
  assert.match(cinematicCss, /body\.rc-student-canyonpath/);
  assert.match(premiumCss, /body\.rc-student-canyonpath/);
  assert.match(refineCss + fixesCss, /rc-canyonpath-landscape-rich\.svg/);
  assert.match(cinematicCss, /rc-canyonpath-cinematic\.svg/);
  assert.match(refineCss + cinematicCss + premiumCss, /prefers-reduced-motion/);
  assert.match(refineCss + fixesCss + cinematicCss + premiumCss, /html\[data-theme='light'\]/);
  assert.doesNotMatch(css + refineCss + fixesCss + cinematicCss + premiumCss, /supabase|fetch\(|localStorage|sessionStorage/);

  assert.match(js, /rc-student-canyonpath/);
  assert.match(js, /stcp-hero/);
  assert.match(js, /stcp-quick/);
  assert.match(js, /stcp-dashboard-grid/);
  assert.match(js, /stcp-footer/);
  assert.match(refineJs, /stcp-page-hero/);
  assert.match(refineJs, /stcp-goals-more/);
  assert.match(js, /observer\.observe\(portalRoot/);
  assert.match(refineJs, /observer\.observe\(portalRoot/);
  assert.doesNotMatch(js + refineJs, /supabase|\.insert\(|\.update\(|\.delete\(|fetch\(/);
});

test('Phase 2A navigation and activity surfaces use SVG icons instead of emoji UI art', () => {
  assert.match(js, /<svg viewBox=/);
  assert.match(refineJs, /<svg viewBox=/);
  assert.doesNotMatch(js + refineJs, /[🔎📚♞🎯🏆🔥🎮📝]/u);
  assert.match(js, /Skill Builder/);
  assert.match(js, /Word Search/);
  assert.match(js, /Classroom Chess/);
  assert.match(js, /Four in a Row/);
  assert.match(refineJs, /Language Arts Skill Builder/);
});

test('Phase 2A refinement addresses collapsed rail alignment and dashboard density', () => {
  assert.match(refineCss, /html\.tc-collapsed body\.rc-student-canyonpath \.tc-sidebar \.tc-nav a/);
  assert.match(refineCss, /width: 44px/);
  assert.match(refineCss, /grid-template-areas:/);
  assert.match(refineCss, /#dashGoalsSnapshot \.sgp-card details/);
  assert.match(refineJs, /visibleLimit = 2/);
  assert.match(refineJs, /View all \$\{cards\.length\} goals/);
});

test('Phase 2A premium scene replaces fixed wallpaper with a naturally scrolling painterly top landscape', () => {
  assert.match(premiumCss, /canyonpath-premium-1\.jpg/);
  assert.match(premiumCss, /canyonpath-premium-2\.jpg/);
  assert.match(premiumCss, /canyonpath-premium-3\.jpg/);
  assert.match(premiumCss, /canyonpath-premium-4\.jpg/);
  assert.match(premiumCss, /background-attachment:\s*scroll/);
  assert.match(premiumCss, /\.tc-app::before[\s\S]*content:\s*none/);
  assert.match(premiumCss, /\.stcp-hero[\s\S]*background:\s*transparent/);
  assert.match(premiumCss, /\.stcp-page-hero[\s\S]*background:\s*transparent/);
  assert.doesNotMatch(premiumCss, /position:\s*fixed/);
});

test('Phase 2A premium polish strengthens card hierarchy without returning to boxitis', () => {
  assert.match(premiumCss, /--stcp-card-bg/);
  assert.match(premiumCss, /\.stcp-quick__grid[\s\S]*gap:\s*10px/);
  assert.match(premiumCss, /\.stcp-quick__link[\s\S]*border-radius:\s*14px/);
  assert.match(premiumCss, /#tabLibrary \.st-resources-grid[\s\S]*grid-template-columns:\s*repeat\(4/);
  assert.match(premiumCss, /#tabActivities \.st-activity-grid[\s\S]*grid-template-columns:\s*repeat\(4/);
});

test('Phase 2A light mode keeps an accessible dark focus accent', () => {
  assert.match(fixesCss, /--stcp-mint: #0b6f5c/);
  assert.match(fixesCss, /outline-color: #0b6f5c/);
});

test('Student route loads CanyonPath foundation and premium 2A assets in final override order', () => {
  assert.match(sidebar, /student-portal-polish\.css\?v=20260907-polish1/);
  assert.match(sidebar, /rc-canyonpath\.css\?v=20260907-cp1/);
  assert.match(sidebar, /rc-canyonpath-detail\.css\?v=20260907-cp1/);
  assert.match(sidebar, /student-canyonpath\.css\?v=20260907-2a1/);
  assert.match(sidebar, /student-canyonpath-refine\.css\?v=20260907-2a2/);
  assert.match(sidebar, /student-canyonpath-fixes\.css\?v=20260907-2a3/);
  assert.match(sidebar, /student-canyonpath-cinematic\.css\?v=20260907-2a4/);
  assert.match(sidebar, /student-canyonpath-premium\.css\?v=20260907-2a5/);
  assert.match(sidebar, /student-canyonpath\.js\?v=20260907-2a3/);
  assert.match(sidebar, /student-canyonpath-refine\.js\?v=20260907-2a3/);
  assert.ok(sidebar.indexOf('student-canyonpath-premium.css') > sidebar.indexOf('student-canyonpath-cinematic.css'));
});
