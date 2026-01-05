(() => {
  const DEBUG = (() => {
    try { return new URLSearchParams(location.search).get("rc_debug") === "1"; }
    catch (_) { return false; }
  })();

  const next = encodeURIComponent(location.pathname + location.search + location.hash);

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* noop */ } };

  const isPreviewHost = () => {
    const h = String(location.hostname || "");
    return h === "localhost" || h === "127.0.0.1" || (h.endsWith(".netlify.app") && h.includes("--"));
  };

  const hydrateTeacherFromAuth = () => {
    const raw = lsGet("rc_auth");
    if (!raw) return;

    try {
      sessionStorage.setItem("rc_user_role", "teacher");
    } catch (_) { /* noop */ }

    try {
      const auth = JSON.parse(raw);
      const code = auth && (auth.code || auth.userCode || auth.user_code);
      if (code) {
        try {
          if (!sessionStorage.getItem("rc_user_code")) sessionStorage.setItem("rc_user_code", String(code));
        } catch (_) { /* noop */ }
      }
    } catch (_) { /* noop */ }
  };

  const isTeacherSession = async () => {
    // In preview/localhost: if you have rc_auth, let teacher pages load.
    if (isPreviewHost() && !!lsGet("rc_auth")) {
      hydrateTeacherFromAuth();
      return true;
    }

    try {
      const r = await fetch("/.netlify/functions/teacher-session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      return !!(r && r.ok);
    } catch (_) {
      return false;
    }
  };

  // Small localStorage helpers (optional UI state)
  const NAV_KEY = "rc_teacher_nav";
  const DEFAULT_NAV = "expanded";
  const lsGetSafe = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

  (async () => {
    const ok = await isTeacherSession();
    if (!ok) {
      if (DEBUG) console.warn("[teacher-shell] redirecting: missing_teacher_session");
      location.replace(`/hub/?reason=missing_teacher_session&next=${next}`);
      return;
    }

    window.RC_TEACHER_SHELL = window.RC_TEACHER_SHELL || {};
    window.RC_TEACHER_SHELL.isTeacherSession = () => true;
    window.RC_TEACHER_SHELL.getNavState = () => lsGetSafe(NAV_KEY) || DEFAULT_NAV;
    window.RC_TEACHER_SHELL.setNavState = (collapsed) =>
      lsSet(NAV_KEY, collapsed ? "collapsed" : "expanded");
  })();
})();
