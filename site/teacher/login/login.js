(() => {
  "use strict";

  const qs = (s) => document.querySelector(s);
  const form = qs("#loginForm");
  const uEl = qs("#username");
  const pEl = qs("#password");
  const msgEl = qs("#msg");
  const reasonEl = qs("#reason");
  const nextLabel = qs("#nextLabel");
  const btn = qs("#submitBtn");

  function setMsg(s) { if (msgEl) msgEl.textContent = s || ""; }

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

  function sanitizeNext(next) {
    let n = decodeMaybeTwice(next || "");
    if (!n) return "/teacher/";
    if (n.startsWith("http://") || n.startsWith("https://")) return "/teacher/";
    if (!n.startsWith("/")) return "/teacher/";
    // Only allow staff destinations
    if (!(n.startsWith("/teacher") || n.startsWith("/admin"))) return "/teacher/";
    return n;
  }

  const params = new URLSearchParams(location.search);
  const reason = params.get("reason") || "";
  const safeNext = sanitizeNext(params.get("next"));

  if (nextLabel) nextLabel.textContent = safeNext;
  if (reasonEl) reasonEl.textContent = reason ? `Reason: ${reason}` : "";

  async function teacherSessionOk() {
    try {
      const r = await fetch("/.netlify/functions/teacher-session", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { "Accept": "application/json" },
      });
      return !!(r && r.ok);
    } catch (e) {
      void e;
      return false;
    }
  }

  async function doLogin(ev) {
    if (ev) ev.preventDefault();
    setMsg("");

    const username = (uEl && uEl.value ? uEl.value : "").trim();
    const password = (pEl && pEl.value ? pEl.value : "");

    if (!username || !password) {
      setMsg("Enter username and password.");
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = "Signing in..."; }

    let r, data;
    try {
      r = await fetch("/.netlify/functions/teacher-login", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      data = await r.json().catch((e) => (void e, {}));
    } catch (e) {
      void e;
      setMsg("Login request failed.");
      if (btn) { btn.disabled = false; btn.textContent = "Sign In"; }
      return;
    }

    if (r && r.ok && data && data.ok !== false) {
      location.replace(safeNext);
      return;
    }

    setMsg((data && data.error) ? String(data.error) : "Invalid username/password.");
    if (btn) { btn.disabled = false; btn.textContent = "Sign In"; }
  }

  // If already authed, go straight through
  teacherSessionOk().then((ok) => {
    if (ok) location.replace(safeNext);
  });

  if (form) form.addEventListener("submit", doLogin);
})();
