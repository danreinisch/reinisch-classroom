(() => {
  "use strict";

  const DEBUG = (() => {
    try { return new URLSearchParams(location.search).get("rc_debug") === "1"; }
    catch (_) { return false; }
  })();

  const log = (...args) => { if (DEBUG) console.log("[teacher-shell]", ...args); };

  const next = encodeURIComponent(location.pathname + location.search + location.hash);

  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const safeSetSession = (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) { /* noop */ } };
  const safeGetLS = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const safeSetLS = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* noop */ } };

  const parseAuth = () => {
    const raw = safeGet("rc_auth");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return { error: "bad_json" }; }
  };

  const authExpired = (auth) => {
    try {
      if (!auth) return true;
      if (auth.isExpired === true) return true;

      const exp = auth.expiresAt ?? auth.expires ?? auth.exp ?? null;
      if (!exp) return false; // compat: missing exp => treat as valid
      const t = (typeof exp === "number") ? exp : Date.parse(exp);
      if (!Number.isFinite(t)) return false;
      return Date.now() > t;
    } catch (_) {
      return false;
    }
  };

  const hasTeacherAuth = () => {
    const auth = parseAuth();
    if (!auth || auth.error) return false;
    if (auth.role !== "teacher") return false;
    if (authExpired(auth)) return false;
    return true;
  };

  const isPreviewHost = () => {
    const h = (location.hostname || "").toLowerCase();
    return h.endsWith(".netlify.app") || h.endsWith(".netlify.live") || h.includes("--");
  };

  // Optional fallback: if rc_auth is missing, try server session.
  const serverTeacherSessionOk = async () => {
    try {
      const r = await fetch("/.netlify/functions/teacher-session", { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) return false;
      const j = await r.json().catch(() => ({}));
      return !!(j && (j.ok === true || j.role === "teacher"));
    } catch (_) {
      return false;
    }
  };

  (async () => {
    // Primary: rc_auth
    if (hasTeacherAuth()) {
      safeSetSession("rc_user_role", "teacher");
      log("teacher auth ok (rc_auth)");
      return;
    }

    // Deploy preview: allow UI load if preview + rc_auth exists at all (helps iteration)
    if (isPreviewHost()) {
      const raw = safeGet("rc_auth");
      if (raw) {
        safeSetSession("rc_user_role", "teacher");
        log("preview host + rc_auth present: allowing teacher UI");
        return;
      }
    }

    // Fallback: server session (only when rc_auth isn't available)
    const ok = await serverTeacherSessionOk();
    if (!ok) {
      log("redirecting: missing_teacher_session");
      location.replace(`/hub/?entry=teacher&reason=missing_teacher_session&next=${next}`);
      return;
    }

    safeSetSession("rc_user_role", "teacher");
    log("teacher auth ok (server session)");
  })();

  // Expose tiny hook + nav collapse state (harmless)
  window.RC_TEACHER_SHELL = window.RC_TEACHER_SHELL || {};
  window.RC_TEACHER_SHELL.isTeacherSession = () => true;

  const NAV_KEY = "rc_teacher_nav";
  const DEFAULT_NAV = "expanded";
  window.RC_TEACHER_SHELL.getNavState = () => safeGetLS(NAV_KEY) || DEFAULT_NAV;
  window.RC_TEACHER_SHELL.setNavState = (collapsed) => safeSetLS(NAV_KEY, collapsed ? "collapsed" : "expanded");
})();