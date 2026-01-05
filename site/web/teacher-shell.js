(() => {
  const DEBUG = (() => {
    try { return new URLSearchParams(location.search).get('rc_debug') === '1'; }
    catch (_) { return false; }
  })();

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* noop */ } };

  const isPreviewHost = () => {
    const h = String(location.hostname || "");
    return (
      h.includes("--") ||
      h.startsWith("deploy-preview-") ||
      h === "localhost" ||
      h === "127.0.0.1"
    );
  };

  // Deploy previews often can't authorize Netlify session functions (401).
  // If teacher auth exists in localStorage, allow teacher pages to load for UI work.
  const teacherPreviewBypass = () => {
    try {
      if (!isPreviewHost()) return false;
      if (!localStorage.getItem("rc_auth")) return false;

      // Keep other code paths happy
      try { sessionStorage.setItem("rc_user_role", "teacher"); } catch (_) { /* noop */ }
      return true;
    } catch (_) {
      return false;
    }
  };

  const isTeacherSession = async () => {
    if (teacherPreviewBypass()) return true;

    try {
      const r = await fetch("/.netlify/functions/teacher-session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      return !!(r && r.ok);
    } catch (e) {
      if (DEBUG) console.warn("[teacher-shell] teacher-session fetch failed", e);
      return false;
    }
  };

  const next = encodeURIComponent(location.pathname + location.search + location.hash);

  (async () => {
    const ok = await isTeacherSession();
    if (!ok) {
      if (DEBUG) console.warn("[teacher-shell] redirecting: missing_teacher_session");
      location.replace(`/hub/?reason=missing_teacher_session&next=${next}`);
      return;
    }

    // Expose tiny hook (optional)
    window.RC_TEACHER_SHELL = window.RC_TEACHER_SHELL || {};
    window.RC_TEACHER_SHELL.isTeacherSession = () => true;

    // Nav collapse state (harmless)
    const NAV_KEY = "rc_teacher_nav";
    const DEFAULT_NAV = "expanded";
    window.RC_TEACHER_SHELL.getNavState = () => lsGet(NAV_KEY) || DEFAULT_NAV;
    window.RC_TEACHER_SHELL.setNavState = (collapsed) =>
      lsSet(NAV_KEY, collapsed ? "collapsed" : "expanded");
  })();
})();
