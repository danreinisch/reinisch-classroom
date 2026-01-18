(() => {
  'use strict';

  const qs = new URLSearchParams(window.location.search);
  const nextParam = qs.get('next') || '/hub/';
  const reason = qs.get('reason') || '';

  const safeNext = (() => {
    try {
      const u = new URL(nextParam, window.location.origin);
      if (u.origin !== window.location.origin) return '/hub/';
      return u.pathname + u.search + u.hash;
    } catch (e) {
      void e;
      return '/hub/';
    }
  })();

  const form =
    document.getElementById('login-form') ||
    document.querySelector('form');

  const usernameInput =
    document.getElementById('username') ||
    document.querySelector('input[name="username"], input#user, input[type="text"]');

  const passwordInput =
    document.getElementById('password') ||
    document.querySelector('input[name="password"], input#pass, input[type="password"]');

  const msgEl =
    document.getElementById('msg') ||
    document.getElementById('message') ||
    document.querySelector('[data-role="msg"], .rc-msg, .message');

  const reasonEl = document.getElementById('reason');

  function setMsg(text) {
    if (msgEl) msgEl.textContent = text || '';
  }

  function setReason(text) {
    if (reasonEl) reasonEl.textContent = text || '';
  }

  async function checkSession() {
    try {
      const r = await fetch('/.netlify/functions/teacher-session', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include'
      });
      if (r.ok) window.location.replace(safeNext);
    } catch (e) {
      void e;
      // If session check fails, user can still try logging in.
    }
  }

  async function doLogin(ev) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

    const username = (usernameInput && usernameInput.value ? usernameInput.value : '').trim();
    const password = passwordInput && passwordInput.value ? String(passwordInput.value) : '';

    if (!username) return setMsg('Enter a username.');
    if (!password) return setMsg('Enter a password.');

    setMsg('');

    let r;
    let data = {};
    try {
      r = await fetch('/.netlify/functions/teacher-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });
      data = await r.json().catch(() => ({}));
    } catch (e) {
      void e;
      return setMsg('Login request failed.');
    }

    if (r && r.ok && data && data.ok !== false) {
      window.location.replace(safeNext);
    } else {
      setMsg((data && data.error) ? String(data.error) : 'Invalid username/password.');
    }
  }

  setReason(reason ? `Reason: ${reason}` : '');

  if (form) {
    form.addEventListener('submit', doLogin);
  } else {
    const btn = document.querySelector('button[type="submit"], input[type="submit"]');
    if (btn) btn.addEventListener('click', doLogin);
  }

  checkSession();
})();
