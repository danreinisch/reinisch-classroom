(() => {
  // Teacher shell: guard + session hydration
  // Debug: add ?rc_debug=1 and check DevTools console.
  const DEBUG = (() => {
    try { return new URLSearchParams(location.search).get('rc_debug') === '1'; }
    catch (_) { return false; }
  })();

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* noop */ } };

  const isTeacherSession = () =>
    String(sessionStorage.getItem('rc_user_role') || '').toLowerCase() === 'teacher';

  const hydrateTeacherFromRcAuth = () => {
    try {
      if (isTeacherSession()) return true;

      const raw = lsGet('rc_auth');
      if (!raw) return false;

      const auth = JSON.parse(raw) || {};
      const role = String(
        auth.role || auth.userRole || auth.user_role || auth.rc_role || ''
      ).toLowerCase();

      const isTeacher =
        role === 'teacher' ||
        auth.isTeacher === true ||
        auth.teacher === true ||
        auth.admin === true;

      if (!isTeacher) return false;

      sessionStorage.setItem('rc_user_role', 'teacher');

      const code = String(auth.code || auth.userCode || auth.user_code || '');
      if (code && !sessionStorage.getItem('rc_user_code')) {
        sessionStorage.setItem('rc_user_code', code);
      }

      return true;
    } catch (_) {
      return false;
    }
  };

  const next = encodeURIComponent(location.pathname + location.search + location.hash);

  if (!isTeacherSession()) {
    const hydrated = hydrateTeacherFromRcAuth();
    if (DEBUG) {
      console.log('[teacher-shell] hydrated=', hydrated,
        'rc_user_role=', sessionStorage.getItem('rc_user_role'),
        'has rc_auth=', !!lsGet('rc_auth'));
    }
  }

  if (!isTeacherSession()) {
    if (DEBUG) console.warn('[teacher-shell] redirecting: missing_teacher_session');
    location.replace(`/hub/?reason=missing_teacher_session&next=${next}`);
    return;
  }

  // Expose tiny hook (optional)
  window.RC_TEACHER_SHELL = window.RC_TEACHER_SHELL || {};
  window.RC_TEACHER_SHELL.isTeacherSession = isTeacherSession;

  // Nav collapse state (harmless)
  const NAV_KEY = 'rc_teacher_nav';
  const DEFAULT_NAV = 'expanded';
  window.RC_TEACHER_SHELL.getNavState = () => lsGet(NAV_KEY) || DEFAULT_NAV;
  window.RC_TEACHER_SHELL.setNavState = (collapsed) =>
    lsSet(NAV_KEY, collapsed ? 'collapsed' : 'expanded');
})();
