(() => {
  'use strict';

  const DEBUG = (() => {
    try {
      return new URLSearchParams(location.search).get('rc_debug') === '1';
    } catch (_) {
      return false;
    }
  })();

  const log = (...args) => { if (DEBUG) console.log('[teacher-shell]', ...args); };
  const warn = (...args) => { if (DEBUG) console.warn('[teacher-shell]', ...args); };

  const isDeployPreview = () => {
    const h = location.hostname || '';
    // Deploy preview URLs look like: <hash>--<site>.netlify.app
    return h === 'localhost' || h === '127.0.0.1' || h.includes('--');
  };

  const safeJson = (s) => {
    try { return JSON.parse(s); } catch (_) { return null; }
  };

  const hasTeacherHint = () => {
    // 1) sessionStorage role
    try {
      const r = (sessionStorage.getItem('rc_user_role') || '').toLowerCase();
      if (r === 'teacher' || r === 'admin') return true;
    } catch (_) { /* noop */ }

    // 2) localStorage rc_auth presence (role optional in previews)
    let authStr = null;
    try { authStr = localStorage.getItem('rc_auth'); } catch (_) { /* noop */ }
    if (!authStr) return false;

    const auth = safeJson(authStr);
    if (!auth) return true; // rc_auth exists but isn't JSON? still treat as "present"

    const role =
      (auth.role || auth.userRole || auth.user_role ||
       (auth.user && (auth.user.role || auth.user.userRole || auth.user.user_role)) ||
       ''
      ).toString().toLowerCase();

    if (role === 'teacher' || role === 'admin') return true;

    // If rc_auth exists but role isn't stored, allow in deploy previews only
    return isDeployPreview();
  };

  const setTeacherRole = () => {
    try { sessionStorage.setItem('rc_user_role', 'teacher'); } catch (_) { /* noop */ }
  };

  const fetchTeacherSession = async () => {
    try {
      const r = await fetch('/.netlify/functions/teacher-session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (r.ok) return true;

      // In deploy previews, this function commonly 401s. If we have local hints, allow.
      if (isDeployPreview() && (r.status === 401 || r.status === 404)) {
        return hasTeacherHint();
      }

      return false;
    } catch (_) {
      // In previews, treat fetch failures as bypassable *only if* we have local hints
      return isDeployPreview() && hasTeacherHint();
    }
  };

  const next = encodeURIComponent(location.pathname + location.search + location.hash);

  (async () => {
    // ✅ The actual gate: bypass BEFORE any redirect decision
    const previewBypass = isDeployPreview() && hasTeacherHint();

    let ok = false;
    if (previewBypass) {
      ok = true;
      setTeacherRole();
      warn('preview bypass active (skipping teacher-session function)');
    } else {
      ok = await fetchTeacherSession();
    }

    if (!ok) {
      warn('redirecting: missing_teacher_session');
      location.replace(`/hub/?reason=missing_teacher_session&next=${next}`);
      return;
    }

    // Expose tiny hook (optional)
    window.RC_TEACHER_SHELL = window.RC_TEACHER_SHELL || {};
    window.RC_TEACHER_SHELL.isTeacherSession = () => true;

    // Nav collapse state
    const NAV_KEY = 'rc_teacher_nav';
    const DEFAULT_NAV = 'expanded';

    const lsGetSafe = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const lsSetSafe = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* noop */ } };

    window.RC_TEACHER_SHELL.getNavState = () => lsGetSafe(NAV_KEY) || DEFAULT_NAV;
    window.RC_TEACHER_SHELL.setNavState = (collapsed) =>
      lsSetSafe(NAV_KEY, collapsed ? 'collapsed' : 'expanded');

    log('teacher shell ok');
  })();
})();
