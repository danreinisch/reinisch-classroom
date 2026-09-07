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
  canyonPathRefineScript.src = '/web/student-canyonpath-refine.js?v=20260907-2a2';
  canyonPathRefineScript.async = false;
  document.head.appendChild(canyonPathRefineScript);
}
