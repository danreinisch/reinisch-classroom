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
  assert.match(refineCss + cinematicCss + premiumCss + finalCss + referenceCss, /prefers-reduced-motion/);
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

test('Phase 2A legacy scenic layers stay presentation-only while the reference layer owns the effective scene', () => {
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

test('Phase 2A visual gate uses one crisp registered scene per approved Dashboard, Goals, and Login surface', () => {
  assert.match(referenceCss, /--stcpl-main-left:\s*var\(--tc-side-w/);
  assert.match(referenceCss, /html\.tc-collapsed body\.rc-student-canyonpath[\s\S]*--stcpl-main-left:\s*var\(--tc-rail-w/);
  assert.match(referenceCss, /\.st-dashboard-content[\s\S]*width:\s*min\(100%,\s*1380px\)/);
  assert.match(referenceCss, /--stcpl-scene-image:\s*var\(--stcp-premium-3\)/);
  assert.match(referenceCss, /#tabDashboard\.active[\s\S]*--stcpl-scene-image:\s*var\(--stcp-premium-2\)/);
  assert.match(referenceCss, /#tabGoals\.active[\s\S]*--stcpl-scene-image:\s*var\(--stcp-premium-3\)/);
  assert.match(referenceCss, /#loginView:not\(\.hidden\)[\s\S]*--stcpl-scene-image:\s*var\(--stcp-premium-4\)/);
  assert.match(referenceCss, /\.tc-main::before[\s\S]*position:\s*fixed/);
  assert.match(referenceCss, /\.tc-main::before[\s\S]*inset:\s*var\(--tc-topbar-h,[\s\S]*var\(--stcpl-main-left\)/);
  assert.match(referenceCss, /\.tc-main::before[\s\S]*var\(--stcpl-scene-image\)[\s\S]*cover no-repeat/);
  assert.doesNotMatch(referenceCss, /var\(--stcp-premium-2\) 0% 0 \/ 33\.334%/);
  assert.doesNotMatch(referenceCss, /backdrop-filter:\s*blur\((1[0-9]|[2-9][0-9])px\)/);
});

test('Phase 2A approved dashboard hero uses a balanced greeting and compact 2x2 status panel', () => {
  assert.match(referenceCss, /\.stcp-hero\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(350px, 390px\)/);
  assert.match(referenceCss, /\.stcp-hero\s*\{[\s\S]*min-height:\s*320px/);
  assert.match(referenceCss, /\.stcp-hero__aside[\s\S]*align-self:\s*center/);
  assert.match(referenceCss, /\.stcp-hero \.st-summary-cards[\s\S]*repeat\(2/);
  assert.match(referenceCss, /\.stcp-hero \.st-summary-card:nth-child\(odd\)/);
});

test('Phase 2A keeps the Student Portal top bar visible while long pages scroll', () => {
  assert.match(referenceCss, /--tc-topbar-h:\s*58px/);
  assert.match(referenceCss, /\.tc-topbar[\s\S]*position:\s*fixed/);
  assert.match(referenceCss, /\.tc-topbar[\s\S]*top:\s*0/);
  assert.match(referenceCss, /\.tc-topbar[\s\S]*z-index:\s*120/);
  assert.match(referenceCss, /\.tc-shell[\s\S]*margin-top:\s*var\(--tc-topbar-h\)/);
  assert.match(referenceCss, /\.tc-sidebar[\s\S]*top:\s*var\(--tc-topbar-h\)/);
});

test('Phase 2A final standard removes rainy-window page blur and keeps restrained card glass only', () => {
  assert.match(finalCss, /\.tc-main,[\s\S]*backdrop-filter:\s*none/);
  assert.match(finalCss, /\.stcp-hero \.st-summary-cards[\s\S]*blur\(4px\)/);
  assert.match(finalCss, /\.stcp-quick__link[\s\S]*blur\(3px\)/);
  assert.doesNotMatch(finalCss, /blur\((1[0-9]|[2-9][0-9])px\)/);
  assert.match(referenceCss, /\.st-login-container[\s\S]*blur\(3px\)/);
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
  assert.match(referenceCss, /stcp-goal-card--reference[\s\S]*'header aside'[\s\S]*'official aside'/);
  assert.match(referenceCss, /stcp-goal-aside__open::before[\s\S]*View progress evidence/);
  assert.match(refineJs, /Progress evidence/);
  assert.match(refineJs, /No Progress Checks Yet/);
  assert.match(finalCss, /#loginView[\s\S]*place-items:\s*center/);
  assert.match(referenceCss, /#loginView:not\(\.hidden\)[\s\S]*min-height:\s*calc\(100vh/);
  assert.match(referenceCss, /\.st-login-container[\s\S]*max-width:\s*460px/);
  assert.match(referenceCss, /\.stcp-footer[\s\S]*var\(--stcpl-scene-image\)/);
});

test('Phase 2A light mode keeps an accessible dark focus accent', () => {
  assert.match(fixesCss, /--stcp-mint: #0b6f5c/);
  assert.match(fixesCss, /outline-color: #0b6f5c/);
  assert.match(finalCss, /html\[data-theme='light'\] body\.rc-student-canyonpath \.tc-main/);
  assert.match(referenceCss, /html\[data-theme='light'\] body\.rc-student-canyonpath \.tc-main::before/);
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
  assert.match(sidebar, /student-canyonpath-reference-match\.css\?v=20260907-2a9/);
  assert.match(sidebar, /student-canyonpath\.js\?v=20260907-2a3/);
  assert.match(sidebar, /student-canyonpath-refine\.js\?v=20260907-2a4/);
  assert.ok(sidebar.indexOf('student-canyonpath-reference-match.css') > sidebar.indexOf('student-canyonpath-final.css'));
});
