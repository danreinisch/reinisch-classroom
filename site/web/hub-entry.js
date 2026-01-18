(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const entry = params.get("entry");
  if (!entry) return;

  function decodeMaybeTwice(v) {
    let out = v || "";
    for (let i = 0; i < 2; i++) {
      try {
        const d = decodeURIComponent(out);
        if (d === out) break;
        out = d;
      } catch (e) {
        void e;
        break;
      }
    }
    return out;
  }

  function sanitizeNext(next, fallback) {
    let n = decodeMaybeTwice(next || "");
    if (!n) return fallback;
    if (n.startsWith("http://") || n.startsWith("https://")) return fallback;
    if (!n.startsWith("/")) return fallback;
    return n;
  }

  async function sessionOk(url) {
    try {
      const r = await fetch(url, { cache: "no-store", credentials: "include" });
      return !!(r && r.ok);
    } catch (e) {
      void e;
      return false;
    }
  }

  // Teacher entry: route to Teacher Center, not Hub UI.
  if (entry === "teacher") {
    const reason = params.get("reason") || "missing_teacher_session";
    const safeNext = sanitizeNext(params.get("next"), "/teacher/");

    sessionOk("/.netlify/functions/teacher-session").then((ok) => {
      if (ok) {
        location.replace(safeNext.startsWith("/admin") ? safeNext : "/teacher/");
        return;
      }
      const u = new URL("/teacher/login/", location.origin);
      u.searchParams.set("reason", reason);
      u.searchParams.set("next", safeNext.startsWith("/admin") ? safeNext : "/teacher/");
      location.replace(u.pathname + u.search);
    });

    return;
  }

  // Admin entry: route to /admin/ (auth handled there)
  if (entry === "admin") {
    const reason = params.get("reason") || "missing_admin_session";
    const safeNext = sanitizeNext(params.get("next"), "/admin/");

    sessionOk("/.netlify/functions/admin-session").then((ok) => {
      if (ok) {
        location.replace("/admin/");
        return;
      }
      const u = new URL("/admin/", location.origin);
      if (reason) u.searchParams.set("reason", reason);
      location.replace(u.pathname + u.search);
    });

    return;
  }
})();
