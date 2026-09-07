const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('site/assets/css/student-canyonpath.css', 'utf8');
const refineCss = fs.readFileSync('site/assets/css/student-canyonpath-refine.css', 'utf8');
const fixesCss = fs.readFileSync('site/assets/css/student-canyonpath-fixes.css', 'utf8');
const cinematicCss = fs.readFileSync('site/assets/css/student-canyonpath-cinematic.css', 'utf8');
const premiumCss = fs.readFileSync('site/assets/css/student-canyonpath-premium.css', 'utf8');
const finalCss = fs.readFileSync('site/assets/css/student-canyonpath-final.css', 'utf8');
const referenceCss = fs.readFileSync('site/assets/css/student-canyonpath-reference-match.css', 'utf8');
const js = fs.readFileSync('site/web/student-canyonpath.js', 'utf8');
const refineJs = fs.readFileSync('site/web/student-canyonpath-refine.js', 'utf8');
const sidebar = fs.readFileSync('site/web/sidebar-init.js', 'utf8');
const allPresentationCss = css + refineCss + fixesCss + cinematicCss + premiumCss + finalCss + referenceCss;

test('Student Portal Phase 2A CanyonPath layer stays presentation-only and scoped', () => {
  assert.match(css, /body\.rc-student-canyonpath/);
  assert.match(refineCss, /body\.rc-student-canyonpath/);
  assert.match(cinematicCss, /body\.rc-student-canyonpath/);
  assert.match(premiumCss, /body\.rc-student-canyonpath/);
  assert.match(finalCss, /body\.rc-student-canyonpath/);
  assert.match(referenceCss, /body\.rc-student-canyonpath/);
  assert.match(refineCss + fixesCss, /rc-canyonpath-landscape-rich\.svg/);
  assert.match(cinematicCss, /rc-canyonpath-cinematic\.svg/);
  assert.match(refineCss + cinematicCss + premiumCss + finalCss, /prefers-reduced-motion/);
  assert.match(refineCss + fixesCss + cinematicCss + premiumCss + finalCss + referenceCss, /html\[data-theme='light'\]/);
  assert.doesNotMatch(allPresentationCss, /supabase|fetch\(|localStorage|sessionStorage/);

  assert.match(js, /rc-student-canyonpath/);
  assert.match(js, /stcp-hero/);
  assert.match(js, /stcp-quick/);
  assert.match(js, /stcp-dashboard-grid/);
  assert.match(js, /stcp-footer/);
  assert.match(refineJs, /stcp-page-hero/);
  assert.match(refineJs, /stcp-goals-more/);
  assert.match(refineJs, /stcp-goal-aside/);
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

test('Phase 2A final standard fixes collapsed rail alignment and dashboard density', () => {
  assert.match(finalCss, /html\.tc-collapsed body\.rc-student-canyonpath \.tc-sidebar \.tc-nav a/);
  assert.match(finalCss, /width:\s*44px/);
  assert.match(finalCss, /height:\s*44px/);
  assert.match(finalCss, /grid-template-areas:/);
  assert.match(finalCss, /'assignments goals'/);
  assert.match(finalCss, /#dashGoalsSnapshot \.sgp-card details/);
  assert.match(referenceCss, /#dashRecentAssignments[\s\S]*repeat\(2/);
  assert.match(referenceCss, /\.stcp-panel--progress[\s\S]*display:\s*none/);
  assert.match(refineJs, /visibleLimit = 2/);
  assert.match(refineJs, /View all \$\{cards\.length\} goals/);
});

test('Phase 2A final standard aligns one scrolling panorama to main content rather than the sidebar shell', () => {
  assert.match(finalCss, /body\.rc-student-canyonpath \.tc-app\s*\{[\s\S]*background:\s*var\(--stcpf-bg\)/);
  assert.match(finalCss, /body\.rc-student-canyonpath \.tc-main\s*\{[\s\S]*canyonpath-premium-1/);
  assert.match(finalCss, /canyonpath-premium-2/);
  assert.match(finalCss, /canyonpath-premium-3/);
  assert.match(finalCss, /canyonpath-premium-4/);
  assert.match(finalCss, /background-attachment:\s*scroll/);
  assert.doesNotMatch(finalCss, /background-attachment:\s*fixed/);
  assert.match(finalCss, /\.stcp-hero[\s\S]*background:\s*transparent/);
  assert.match(finalCss, /\.stcp-page-hero[\s\S]*background:\s*transparent/);
});

test('Phase 2A final standard removes rainy-window page blur and keeps restrained card glass only', () => {
  assert.match(finalCss, /\.tc-main,[\s\S]*backdrop-filter:\s*none/);
  assert.match(finalCss, /\.stcp-hero \.st-summary-cards[\s\S]*blur\(4px\)/);
  assert.match(finalCss, /\.stcp-quick__link[\s\S]*blur\(3px\)/);
  assert.doesNotMatch(finalCss, /blur\((1[0-9]|[2-9][0-9])px\)/);
});

test('Phase 2A final standard matches approved dashboard, goals, and login component contracts', () => {
  assert.match(finalCss, /\.stcp-hero[\s\S]*grid-template-columns/);
  assert.match(finalCss, /\.stcp-quick__grid[\s\S]*repeat\(4/);
  assert.match(finalCss, /#tabLibrary \.st-resources-grid[\s\S]*repeat\(4/);
  assert.match(finalCss, /#tabActivities \.st-activity-grid[\s\S]*repeat\(4/);
  assert.match(finalCss, /#tabGoals \.stcp-page-hero::after[\s\S]*Small steps add up to big possibilities/);
  assert.match(finalCss, /#tabGoals \.sgp-stats[\s\S]*repeat\(3/);
  assert.match(finalCss, /#tabGoals \.sgp-progress/);
  assert.match(referenceCss, /#tabGoals \.sgp-official/);
  assert.match(referenceCss, /stcp-goal-card--reference[\s\S]*grid-template-areas/);
  assert.match(referenceCss, /stcp-goal-aside/);
  assert.match(refineJs, /Progress evidence/);
  assert.match(refineJs, /No Progress Checks Yet/);
  assert.match(finalCss, /#loginView[\s\S]*place-items:\s*center/);
  assert.match(finalCss, /\.st-login-container[\s\S]*max-width:\s*500px/);
  assert.match(finalCss, /\.st-login-container[\s\S]*blur\(6px\)/);
  assert.match(finalCss, /\.stcp-footer/);
});

test('Phase 2A light mode keeps an accessible dark focus accent', () => {
  assert.match(fixesCss, /--stcp-mint: #0b6f5c/);
  assert.match(fixesCss, /outline-color: #0b6f5c/);
  assert.match(finalCss, /html\[data-theme='light'\] body\.rc-student-canyonpath \.tc-main/);
});

test('Student route loads CanyonPath foundation and approved-reference layers last', () => {
  assert.match(sidebar, /student-portal-polish\.css\?v=20260907-polish1/);
  assert.match(sidebar, /rc-canyonpath\.css\?v=20260907-cp1/);
  assert.match(sidebar, /rc-canyonpath-detail\.css\?v=20260907-cp1/);
  assert.match(sidebar, /student-canyonpath\.css\?v=20260907-2a1/);
  assert.match(sidebar, /student-canyonpath-refine\.css\?v=20260907-2a2/);
  assert.match(sidebar, /student-canyonpath-fixes\.css\?v=20260907-2a3/);
  assert.match(sidebar, /student-canyonpath-cinematic\.css\?v=20260907-2a4/);
  assert.match(sidebar, /student-canyonpath-premium\.css\?v=20260907-2a5/);
  assert.match(sidebar, /student-canyonpath-final\.css\?v=20260907-2a6/);
  assert.match(sidebar, /student-canyonpath-reference-match\.css\?v=20260907-2a7/);
  assert.match(sidebar, /student-canyonpath\.js\?v=20260907-2a3/);
  assert.match(sidebar, /student-canyonpath-refine\.js\?v=20260907-2a4/);
  assert.ok(sidebar.indexOf('student-canyonpath-reference-match.css') > sidebar.indexOf('student-canyonpath-final.css'));
});
