(() => {
  const DEBUG = (() => {
    try { return new URLSearchParams(location.search).get("rc_debug") === "1"; }
    catch (_) { return false; }
  })();

  const next = encodeURIComponent(location.pathname + location.search + location.hash);

  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* noop */ } };

  const isPreviewHost = () => {
    const h = String(location.hostname || "");
    return h === "localhost" || h === "127.0.0.1" || (h.endsWith(".netlify.app") && h.includes("--"));
  };

  const ensureTeacherRole = () => {
    try { sessionStorage.setItem("rc_user_role", "teacher"); } catch (_) { /* noop */ }
  };

  const isTeacherSession = async () => {
    // ✅ Deploy previews / localhost: bypass the Netlify function gate entirely
    if (isPreviewHost()) {
      ensureTeacherRole();
      if (DEBUG) console.warn("[teacher-shell] preview bypass: teacher-session gate");
      return true;
    }

    // ✅ Production: real gate
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

  (async () => {
    const ok = await isTeacherSession();
    if (!ok) {
      if (DEBUG) console.warn("[teacher-shell] redirecting: missing_teacher_session");
      location.replace(`/hub/?reason=missing_teacher_session&next=${next}`);
      return;
    }

    window.RC_TEACHER_SHELL = window.RC_TEACHER_SHELL || {};
    window.RC_TEACHER_SHELL.isTeacherSession = () => true;

    const NAV_KEY = "rc_teacher_nav";
    const DEFAULT_NAV = "expanded";
    const lsGetSafe = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

    window.RC_TEACHER_SHELL.getNavState = () => lsGetSafe(NAV_KEY) || DEFAULT_NAV;
    window.RC_TEACHER_SHELL.setNavState = (collapsed) =>
      lsSet(NAV_KEY, collapsed ? "collapsed" : "expanded");
  })();
})();
