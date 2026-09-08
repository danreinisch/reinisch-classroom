// Sidebar FOUC prevention — must run synchronously in <head>
// Reads saved sidebar state and applies tc-collapsed class before first paint
try {
  var saved = localStorage.getItem('rc_public_sidebar');
  if (saved === 'expanded') {
    // User explicitly chose expanded — keep it
  } else if (saved === 'collapsed') {
    document.documentElement.classList.add('tc-collapsed');
  } else {
    // No saved preference: default to expanded on large screens, collapsed on mobile
    if (window.innerWidth <= 1024) {
      document.documentElement.classList.add('tc-collapsed');
    }
  }
} catch (_) {
  document.documentElement.classList.add('tc-collapsed');
}

// Student Portal presentation layers are intentionally scoped to /student/.
// Loading them here avoids coupling presentation work to the large portal runtime
// and leaves Teacher Center / public pages untouched.
if (window.location.pathname === '/student/' || window.location.pathname.startsWith('/student/')) {
  var addStudentStylesheetOnce = function (href, marker) {
    if (document.querySelector('link[' + marker + ']')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(marker, 'true');
    document.head.appendChild(link);
  };

  var loadPolishCss = function () {
    addStudentStylesheetOnce('/assets/css/student-portal-polish.css?v=20260907-polish1', 'data-student-portal-polish');
    addStudentStylesheetOnce('/assets/css/student-goal-evidence-timeline.css?v=20260907-evidence1', 'data-student-goal-evidence-timeline');

    // Phase 2A: opt the Student Portal shell/dashboard into the shared CanyonPath
    // visual foundation. Student-specific layers load last so they can adapt the
    // established portal DOM without changing portal behavior.
    addStudentStylesheetOnce('/assets/css/rc-canyonpath.css?v=20260907-cp1', 'data-rc-canyonpath');
    addStudentStylesheetOnce('/assets/css/rc-canyonpath-detail.css?v=20260907-cp1', 'data-rc-canyonpath-detail');
    addStudentStylesheetOnce('/assets/css/student-canyonpath.css?v=20260907-2a1', 'data-student-canyonpath');
    addStudentStylesheetOnce('/assets/css/student-canyonpath-refine.css?v=20260907-2a2', 'data-student-canyonpath-refine');
    addStudentStylesheetOnce('/assets/css/student-canyonpath-fixes.css?v=20260907-2a3', 'data-student-canyonpath-fixes');
    addStudentStylesheetOnce('/assets/css/student-canyonpath-cinematic.css?v=20260907-2a4', 'data-student-canyonpath-cinematic');
    addStudentStylesheetOnce('/assets/css/student-canyonpath-premium.css?v=20260907-2a5', 'data-student-canyonpath-premium');
    // Final Phase 2A visual contract. These two layers intentionally load after
    // every exploratory pass so the approved Dashboard / Goals / Login images
    // define the effective presentation standard.
    addStudentStylesheetOnce('/assets/css/student-canyonpath-final.css?v=20260907-2a6', 'data-student-canyonpath-final');
    addStudentStylesheetOnce('/assets/css/student-canyonpath-reference-match.css?v=20260907-2a11', 'data-student-canyonpath-reference-match');
  };

  // Append after the page's inline styles so the scoped polish layers are the
  // final presentation rule set without using a forest of !important rules.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPolishCss, { once: true });
  } else {
    loadPolishCss();
  }

  var polishScript = document.createElement('script');
  polishScript.src = '/web/student-portal-polish.js?v=20260907-polish1';
  polishScript.async = false;
  document.head.appendChild(polishScript);

  var evidenceScript = document.createElement('script');
  evidenceScript.src = '/web/student-goal-evidence-timeline.js?v=20260907-evidence2';
  evidenceScript.async = false;
  document.head.appendChild(evidenceScript);

  var canyonPathScript = document.createElement('script');
  canyonPathScript.src = '/web/student-canyonpath.js?v=20260907-2a3';
  canyonPathScript.async = false;
  document.head.appendChild(canyonPathScript);

  var canyonPathRefineScript = document.createElement('script');
  canyonPathRefineScript.src = '/web/student-canyonpath-refine.js?v=20260907-2a4';
  canyonPathRefineScript.async = false;
  document.head.appendChild(canyonPathRefineScript);
}

// Public CanyonPath browsing surfaces. Presentation-only, explicit opt-in:
// do not load this theme in Teacher Center, Student Portal, viewers, or lessons.
(function () {
  var path = window.location.pathname.replace(/\/index\.html$/i, '/').replace(/\/+$/, '') || '/';
  var publicPages = [
    '/classroom-resources', '/language-arts', '/language-arts/collection',
    '/language-arts/toolkit', '/life-skills', '/life-skills/collection',
    '/toolkits', '/math-toolkit', '/math-toolkit/algebra',
    '/language-arts/a-door-into-time', '/language-arts/lost-in-kragdon-ah',
    '/language-arts/return-from-kragdon-ah', '/language-arts/warrior-of-kragdon-ah'
  ];
  var isHome = path === '/';
  if (!isHome && publicPages.indexOf(path) === -1) return;

  // Match public-shell.js before the first paint. Previously its late default
  // could collapse an already-painted desktop rail (or a saved-open mobile one).
  // Read only the existing presentation preference; never write storage here.
  var collapsed = true;
  try {
    collapsed = window.innerWidth <= 768 || localStorage.getItem('rc_public_sidebar') !== 'expanded';
  } catch (_) { /* Keep the existing collapsed fallback when storage is denied. */ }
  document.documentElement.classList.toggle('tc-collapsed', collapsed);
  document.documentElement.classList.add('rc-public-navigation');

  function addStyle(href, attribute) {
    if (document.querySelector('link[' + attribute + ']')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    // Dynamically inserted stylesheets are not implicitly render-blocking.
    // Set this before insertion so supported browsers never paint the old skin.
    link.setAttribute('blocking', 'render');
    link.setAttribute(attribute, 'true');
    document.head.appendChild(link);
  }
  addStyle('/assets/css/public-navigation.css?v=20260908-nav1', 'data-public-navigation');

  // Start the same small, cacheable decorative asset during head parsing,
  // rather than first discovering it in the DOMContentLoaded scenery callback.
  var scene = '/assets/bg/moonlit-canyon.webp?v=20260907-moonlit1';
  if (!document.querySelector('link[data-canyon-scene-preload]')) {
    var preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'image';
    preload.href = scene;
    preload.setAttribute('data-canyon-scene-preload', 'true');
    document.head.appendChild(preload);
  }
  // Home keeps its existing, parser-discovered stylesheet and landscape markup.
  if (isHome) return;

  document.documentElement.classList.add('rc-public-canyonpath');
  addStyle('/assets/css/public-canyonpath.css?v=20260907-moonlit1', 'data-public-canyonpath');

  function addScenery() {
    var main = document.querySelector('.tc-main');
    if (!main) return;
    if (main.querySelector('.cp-public-landscape')) return;
    var landscape = document.createElement('div');
    landscape.className = 'cp-public-landscape';
    landscape.setAttribute('aria-hidden', 'true');
    var image = document.createElement('img');
    image.src = scene;
    image.alt = '';
    image.width = 912;
    image.height = 579;
    image.decoding = 'async';
    landscape.appendChild(image);
    main.insertBefore(landscape, main.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addScenery, { once: true });
  } else {
    addScenery();
  }
})();
