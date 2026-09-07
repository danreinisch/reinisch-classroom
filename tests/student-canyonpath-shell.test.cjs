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
const sceneSvg = fs.readFileSync('site/assets/bg/rc-canyonpath-cinematic.svg', 'utf8');
const js = fs.readFileSync('site/web/student-canyonpath.js', 'utf8');
const refineJs = fs.readFileSync('site/web/student-canyonpath-refine.js', 'utf8');
const sidebar = fs.readFileSync('site/web/sidebar-init.js', 'utf8');
const allPresentationCss = css + refineCss + fixesCss + cinematicCss + premiumCss + finalCss + referenceCss;

// Read declarations from a specific rule instead of allowing an assertion to
// accidentally match a property in some unrelated later rule. This is a source
// contract helper, not a browser layout or full CSS-cascade implementation.
function declarationsFor(source, selector) {
  const uncommented = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [...uncommented.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const block = blocks.find((entry) => entry[1].split(',').some((part) => part.trim() === selector));
  assert.ok(block, `Missing CSS rule: ${selector}`);
  return Object.fromEntries(block[2].split(';').filter((part) => part.trim()).map((part) => {
    const colon = part.indexOf(':');
    assert.ok(colon > 0, `Invalid declaration: ${part}`);
    return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
  }));
}

function rgbFromHex(value) {
  assert.match(value, /^#[0-9a-f]{6}$/i);
  return [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
}

function luminance(rgb) {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

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

test('Phase 2A legacy scenery is overridden at the main canvas without changing hero composition', () => {
  // The legacy file uses custom properties, not literal JPEG filenames. Check
  // the actual contract, then require the last layer to replace its background.
  const legacyMain = declarationsFor(finalCss, 'body.rc-student-canyonpath .tc-main');
  for (let index = 1; index <= 4; index += 1) {
    assert.ok(legacyMain.background.includes(`var(--stcp-premium-${index})`));
  }
  assert.equal(legacyMain['background-attachment'], 'scroll');
  const main = declarationsFor(referenceCss, 'body.rc-student-canyonpath .tc-main');
  assert.equal(main.background, 'var(--stcpf-bg, #031714)');
  assert.match(finalCss, /\.stcp-hero[\s\S]*background:\s*transparent/);
  assert.match(finalCss, /\.stcp-page-hero[\s\S]*background:\s*transparent/);
});

test('Phase 2A scenery uses a full landscape vector rather than enlarging portrait JPEG tiles', () => {
  const tokens = declarationsFor(referenceCss, 'body.rc-student-canyonpath');
  assert.equal(tokens['--stcpl-scene-image'], "url('/assets/bg/rc-canyonpath-cinematic.svg')");
  assert.doesNotMatch(referenceCss, /var\(--stcp-premium-[1-4]\)|canyonpath-premium-[1-4]\.jpg/);
  assert.equal((referenceCss.match(/--stcpl-scene-image\s*:/g) || []).length, 1);

  const viewBox = sceneSvg.match(/viewBox=["']0 0 (\d+) (\d+)["']/);
  assert.ok(viewBox, 'Scene must have an explicit landscape viewBox');
  assert.ok(Number(viewBox[1]) >= 1600);
  assert.ok(Number(viewBox[1]) > Number(viewBox[2]));
  assert.doesNotMatch(sceneSvg, /<image\b|data:image\//i, 'Do not hide an enlarged raster inside an SVG');
});

test('Phase 2A vector scene stays registered to the main canvas on Dashboard, Goals, and Login', () => {
  assert.match(referenceCss, /--stcpl-main-left:\s*var\(--tc-side-w/);
  assert.match(referenceCss, /html\.tc-collapsed body\.rc-student-canyonpath[\s\S]*--stcpl-main-left:\s*var\(--tc-rail-w/);
  assert.match(referenceCss, /\.st-dashboard-content[\s\S]*width:\s*min\(100%,\s*1380px\)/);
  for (const selector of [
    'body.rc-student-canyonpath:has(#studentDashboardView:not(.hidden) #tabDashboard.active)',
    'body.rc-student-canyonpath:has(#studentDashboardView:not(.hidden) #tabGoals.active)',
    'body.rc-student-canyonpath:has(#loginView:not(.hidden))',
  ]) {
    const view = declarationsFor(referenceCss, selector);
    assert.match(view['--stcpl-scene-position'], /^center \d+%$/);
    assert.equal(view['--stcpl-scene-image'], undefined, 'Views must retain the full vector source');
  }
  const scene = declarationsFor(referenceCss, 'body.rc-student-canyonpath .tc-main::before');
  assert.equal(scene.position, 'fixed');
  assert.match(scene.inset, /var\(--stcpl-main-left\)/);
  assert.match(scene.background, /var\(--stcpl-scene-image\).*cover no-repeat/);
  assert.equal(scene.filter, 'none');
  assert.equal(scene['backdrop-filter'], 'none');
  assert.equal(scene['-webkit-backdrop-filter'], 'none');
});

test('Phase 2A goal-card frost overrides the earlier two-ID transparent-card selector', () => {
  // The child combinator changes matching, not specificity; both rules have
  // the same two IDs, and the reference rule loads after the legacy rule.
  const previous = declarationsFor(refineCss, 'body.rc-student-canyonpath #tabGoals #goalsContent > .sgp-card');
  assert.equal(previous.background, 'transparent');
  const card = declarationsFor(referenceCss, 'body.rc-student-canyonpath #tabGoals #goalsContent .sgp-card');
  assert.equal(card.background, 'var(--stcpl-reading-surface)');
  assert.equal(card.padding, '22px');
  assert.equal(card['border-radius'], '16px');
  assert.equal(card.border, '1px solid var(--stcpl-reading-border)');
  assert.equal(card.color, 'var(--stcpl-reading-ink)');
  assert.ok(sidebar.indexOf('student-canyonpath-reference-match.css') > sidebar.indexOf('student-canyonpath-refine.css'));

  for (const component of ['.sgp-official', '.sgp-progress', '.stcp-goal-aside']) {
    const inner = declarationsFor(referenceCss, `body.rc-student-canyonpath #tabGoals #goalsContent ${component}`);
    assert.equal(inner.background, 'var(--stcpl-reading-inner)');
  }
  const paragraph = declarationsFor(referenceCss, 'body.rc-student-canyonpath #tabGoals #goalsContent .sgp-official > p');
  assert.equal(paragraph.color, 'var(--stcpl-reading-muted)');
  assert.equal(paragraph.opacity, '1');
});

test('Phase 2A reading-surface text tokens retain 4.5:1 contrast without relying on blur', () => {
  for (const selector of ['body.rc-student-canyonpath', "html[data-theme='light'] body.rc-student-canyonpath"]) {
    const tokens = declarationsFor(referenceCss, selector);
    const rgba = tokens['--stcpl-reading-surface'].match(/^rgba\(([^)]+)\)$/);
    assert.ok(rgba, 'Reading surface must supply an explicit fallback tint');
    const [r, g, b, alpha] = rgba[1].split(',').map(Number);
    assert.ok([r, g, b, alpha].every(Number.isFinite));
    assert.ok(alpha >= 0.90 && alpha <= 1, 'Readable tint must work even without backdrop-filter');
    const surfaces = [
      // Test both extrema of possible scenery under the translucent surface.
      [r, g, b].map((channel) => channel * alpha),
      [r, g, b].map((channel) => channel * alpha + 255 * (1 - alpha)),
      rgbFromHex(tokens['--stcpl-reading-inner']),
    ];
    for (const name of ['ink', 'muted', 'label']) {
      const text = rgbFromHex(tokens[`--stcpl-reading-${name}`]);
      for (const surface of surfaces) {
        const contrast = contrastRatio(text, surface);
        assert.ok(contrast >= 4.5, `${selector} ${name}: ${contrast.toFixed(2)}:1`);
      }
    }
  }
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
  assert.doesNotMatch(finalCss + referenceCss, /blur\((1[0-9]|[2-9][0-9])px\)/);
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
  assert.match(sidebar, /student-canyonpath-reference-match\.css\?v=20260907-2a10/);
  assert.match(sidebar, /student-canyonpath\.js\?v=20260907-2a3/);
  assert.match(sidebar, /student-canyonpath-refine\.js\?v=20260907-2a4/);
  assert.ok(sidebar.indexOf('student-canyonpath-reference-match.css') > sidebar.indexOf('student-canyonpath-final.css'));
});
