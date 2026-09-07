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

// Student Portal presentation polish is intentionally scoped to /student/.
// Loading it here avoids coupling the visual pass to the large portal runtime
// and leaves Teacher Center / public pages untouched.
if (window.location.pathname === '/student/' || window.location.pathname.startsWith('/student/')) {
  var polishCss = document.createElement('link');
  polishCss.rel = 'stylesheet';
  polishCss.href = '/assets/css/student-portal-polish.css?v=20260907-polish1';
  document.head.appendChild(polishCss);

  var polishScript = document.createElement('script');
  polishScript.src = '/web/student-portal-polish.js?v=20260907-polish1';
  polishScript.async = false;
  document.head.appendChild(polishScript);
}
