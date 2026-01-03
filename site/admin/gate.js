/* rc: admin gate (deploy-preview safe) */
(() => {
  if (!location.pathname.startswith) {
    // nothing — defensive
  }
  if (!location.pathname.startsWith("/admin")) return;

  const params = new URLSearchParams(location.search);
  if (params.get("nogate") === "1") return;

  const debug = localStorage.getItem("rc_debug_auth") === "1";
  const next = encodeURIComponent(location.pathname + location.search);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function checkTeacherSession() {
    let lastStatus = 0;
    let lastBody = "";

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await fetch("/.netlify/functions/teacher-session", {
          cache: "no-store",
          credentials: "include",
        });

        lastStatus = r.status;

        const txt = await r.text();
        lastBody = (txt || "").slice(0, 200);

        if (r.status === 200) {
          try {
            const j = JSON.parse(txt);
            if (j && j.ok) return { ok: true, status: 200, body: j };
          } catch (e) { void e; }
          return { ok: true, status: 200, body: txt };
        }
      } catch (err) {
        lastStatus = 0;
        lastBody = String(err && err.message || err).slice(0, 200);
      }

      if (debug) console.warn("[admin-gate] teacher-session attempt", attempt, "failed:", lastStatus, lastBody);
      await sleep(250);
    }

    return { ok: false, status: lastStatus, body: lastBody };
  }

  (async () => {
    const res = await checkTeacherSession();

    if (res.ok) {
      if (debug) console.info("[admin-gate] teacher-session OK");
      return;
    }

    try { window.__clearAllAuthState?.(); } catch (e) { void e; }
    try { window.__clearAllAuth?.(); } catch (e) { void e; }

    const reason = "missing_teacher_session_" + (res.status || "net");
    if (debug) console.warn("[admin-gate] redirect -> /hub/", reason, res.body);

    location.replace(`/hub/?reason=${encodeURIComponent(reason)}&next=${next}`);
  })();
})();
