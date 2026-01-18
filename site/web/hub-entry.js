(function () {
  const params = new URLSearchParams(window.location.search);
  const entry = params.get("entry");
  if (entry !== "teacher") return;

  // 1) Kill the disruptive role chooser (the "menu") for teacher-entry flows.
  const style = document.createElement("style");
  style.id = "rc-entry-teacher-style";
  style.textContent = `
    #signInModal {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);

  function decodeMaybeTwice(v) {
    if (!v) return "";
    let out = v;
    for (let i = 0; i < 2; i++) {
      try {
        const d = decodeURIComponent(out);
        if (d === out) break;
        out = d;
      } catch {
        break;
      }
    }
    return out;
  }

  function sanitizeNext(v) {
    if (!v) return "";
    const s = String(v).trim();

    // Only allow same-origin *paths*
    if (!s.startsWith("/")) return "";
    if (s.startsWith("//")) return "";
    if (s.includes("://")) return "";

    // Avoid loops back into login shims
    if (s.startsWith("/teacher/login")) return "";
    return s;
  }

  const rawNext = params.get("next") || "";
  const nextDecoded = decodeMaybeTwice(rawNext);
  const safeNext = sanitizeNext(nextDecoded);

  // If next points at /teacher/ (legacy path), do NOT bounce there — it often drops you back into /hub/ without entry.
  // Keep teacher-entry UX inside Hub instead.
  const shouldRedirectAfterAuth =
    safeNext &&
    !safeNext.startsWith("/hub") &&
    !safeNext.startsWith("/teacher");

  function teacherSessionOk() {
    return fetch("/.netlify/functions/teacher-session", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((r) => !!(r && r.ok))
      .catch(() => false);
  }

  function showTeachModal() {
    const m = document.getElementById("teachModal");
    if (!m) return false;
    m.style.display = "flex";
    const u = document.getElementById("teachUser");
    if (u) u.focus();
    return true;
  }

  function activateTeacherUI() {
    // Best case: the Hub defines a global helper
    if (typeof window.showTeacher === "function") {
      window.showTeacher();
      return true;
    }

    // Fallback: click whatever "Teacher" control exists in the Hub shell
    const btn =
      document.querySelector('button[data-role="teacher"]') ||
      document.querySelector('[data-role="teacher"]') ||
      document.querySelector("#teacherTab") ||
      document.querySelector("#teacherBtn");
    if (btn && typeof btn.click === "function") {
      btn.click();
      return true;
    }
    return false;
  }

  teacherSessionOk().then((ok) => {
    if (ok) {
      if (shouldRedirectAfterAuth) {
        window.location.replace(safeNext);
        return;
      }

      // Try to enter Teacher UI once Hub scripts are ready
      const t = setInterval(() => {
        if (activateTeacherUI()) clearInterval(t);
      }, 50);
      setTimeout(() => clearInterval(t), 5000);
      return;
    }

    // No session: auto-open teacher login modal (no role chooser)
    const t = setInterval(() => {
      if (showTeachModal()) clearInterval(t);
    }, 50);
    setTimeout(() => clearInterval(t), 5000);
  });
})();
