(() => {
  const qs = new URLSearchParams(location.search);
const DEBUG = (
  localStorage.getItem("rc_debug_auth") === "1" ||
  qs.get("rc_debug_auth") === "1"
);

// If debug was enabled via URL param, strip it so it doesn’t linger.
if (qs.has("rc_debug_auth")) {
  qs.delete("rc_debug_auth");
  const q = qs.toString();
  history.replaceState({}, "", location.pathname + (q ? ("?" + q) : "") + location.hash);
}
const next = encodeURIComponent(location.pathname + location.search);
  const url = "/.netlify/functions/teacher-session";

  const log = (...args) => { if (DEBUG) console.warn("[admin-gate]", ...args); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function checkOnce() {
    const t0 = Date.now();
    const r = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      headers: { "x-rc-client": "admin-gate" },
    });
    let text = "";
    try { text = await r.text(); } catch (e) { void e; }
    log("teacher-session", r.status, (Date.now() - t0) + "ms", text.slice(0, 200));
    return { status: r.status, body: text };
  }

  (async () => {
    let last = { status: 0, body: "" };

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        last = await checkOnce();
        if (last.status === 200) return;
        if (last.status === 401 || last.status === 403) break;
      } catch (e) {
        log("fetch error", e && (e.message || String(e)));
      }
      await sleep(150 * attempt);
    }

    const status = last.status || "net";
    const reason = `missing_teacher_session_admin_${status}`;
    log("redirect -> /hub/", reason);
    location.replace(`/hub/?reason=${encodeURIComponent(reason)}&next=${next}`);
  })();
})();