/**
 * Admin Session Required Shell (non-bouncy)
 * - Never auto-redirects to /hub
 * - Hides the legacy #gate overlay so /admin/ doesn't hang on "Checking session..."
 * - Provides Sign in + Try again actions
 * - If session is valid admin, reveals the real admin app (#app)
 */
(function () {
  'use strict';

  const ROOT_ID = 'rc-admin-shell-root';

  function byId(id) { return document.getElementById(id); }

  function ensureRoot() {
    let el = byId(ROOT_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ROOT_ID;
      el.className = 'rc-admin-shell-root';
      document.body.appendChild(el);
    }
    return el;
  }

  function hideGate() {
    const gate = byId('gate');
    if (gate) gate.style.display = 'none';
  }

  function showGate(text) {
    const gate = byId('gate');
    if (!gate) return;
    gate.textContent = text || 'Checking session…';
    gate.style.display = 'grid';
    gate.style.placeItems = 'center';
    gate.style.minHeight = '100vh';
  }

  function hideApp() {
    const app = byId('app');
    if (app) app.style.display = 'none';
  }

  function showApp() {
    hideGate();
    const root = ensureRoot();
    root.innerHTML = '';
    const app = byId('app');
    if (app) app.style.display = 'block';
  }

  function isPreviewHost() {
    // Deploy previews / branch deploys look like: <something>--chipper-moonbeam-...netlify.app
    return String(location.hostname || '').includes('--');
  }

  function normalizeRole(data) {
    if (!data) return null;
    if (data.role) return data.role;
    if (data.raw_role) return data.raw_role;
    if (data.user && data.user.role) return data.user.role;
    return null;
  }

  async function fetchRole(url) {
    try {
      const r = await fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' });
      const data = await r.json().catch((_e) => ({}));
      const role = normalizeRole(data);
      return { ok: r.ok, role, data, source: url };
    } catch (_e) {
      return { ok: false, role: null, data: null, source: url };
    }
  }

  async function fetchAdminSession() {
    // Prefer admin-session if present; teacher-session can also surface role.
    const urls = [
      '/.netlify/functions/admin-session',
      '/.netlify/functions/teacher-session'
    ];

    for (const u of urls) {
      const res = await fetchRole(u);
      if (res.ok && res.role === 'admin') return { ok: true, role: res.role, source: res.source, data: res.data };
    }

    return { ok: false, role: null, source: null, data: null };
  }

  function hubSignInUrl(reason, next) {
    const qs = new URLSearchParams();
    qs.set('entry', 'admin');
    qs.set('reason', reason || 'missing_admin_session');
    qs.set('next', next || '/admin/');
    return `/hub/?${qs.toString()}`;
  }

  function renderShell(opts) {
    const root = ensureRoot();
    hideApp();
    hideGate(); // critical: do not hang on "Checking session…"

    const reason = (opts && opts.reason) || 'missing_admin_session';
    const next = (opts && opts.next) || (location.pathname + location.search);

    const detail = isPreviewHost()
      ? 'You’re in a deploy preview. Admin can load without bouncing to Hub, but you still need an admin session to use admin tools.'
      : 'You need an admin session to access admin tools.';

    root.innerHTML = `
      <div class="rc-admin-shell">
        <div class="rc-admin-shell-card">
          <div class="rc-admin-shell-title">Admin session required</div>
          <div class="rc-admin-shell-subtitle">${detail}</div>

          <div class="rc-admin-shell-meta">
            <div><span class="k">Reason:</span> <span class="v">${reason}</span></div>
            <div><span class="k">Next:</span> <span class="v">${next}</span></div>
          </div>

          <div class="rc-admin-shell-actions">
            <button class="rc-btn rc-btn-primary" id="rcAdminSignIn">Sign in</button>
            <button class="rc-btn" id="rcAdminTryAgain">Try again</button>
            <a class="rc-btn rc-btn-link" href="/teacher/">Back to Teacher Center</a>
          </div>

          ${isPreviewHost() ? `
            <div class="rc-admin-shell-preview">
              <label class="rc-admin-shell-toggle">
                <input type="checkbox" id="rcAdminPreviewBypass">
                <span>Preview bypass (keep /admin/ stable even without session)</span>
              </label>
              <div class="rc-admin-shell-hint">
                This only affects deploy previews / branch deploys (stored in localStorage).
              </div>
            </div>
          ` : ``}
        </div>
      </div>
    `;

    const btnSignIn = root.querySelector('#rcAdminSignIn');
    const btnTryAgain = root.querySelector('#rcAdminTryAgain');

    if (btnSignIn) {
      btnSignIn.addEventListener('click', () => {
        // User action is allowed to go to Hub for login flow.
        location.assign(hubSignInUrl(reason, '/admin/'));
      });
    }

    if (btnTryAgain) {
      btnTryAgain.addEventListener('click', async () => {
        await bootstrap(true);
      });
    }

    const cb = root.querySelector('#rcAdminPreviewBypass');
    if (cb) {
      const key = 'rc_admin_preview_bypass';
      try {
        cb.checked = localStorage.getItem(key) === '1';
      } catch (_e) {
        cb.checked = false;
      }
      cb.addEventListener('change', () => {
        try {
          localStorage.setItem(key, cb.checked ? '1' : '0');
        } catch (_e) {
          void _e;
        }
      });
    }
  }

  async function bootstrap(userInitiated) {
    const root = ensureRoot();

    if (!root.innerHTML) showGate('Checking admin session…');

    let bypass = false;
    try {
      bypass = localStorage.getItem('rc_admin_preview_bypass') === '1';
    } catch (_e) {
      bypass = false;
    }

    if (isPreviewHost() && bypass) {
      renderShell({ reason: 'missing_admin_session', next: '/admin/' });
      return;
    }

    const sess = await fetchAdminSession();
    if (sess.ok) {
      showApp();
      return;
    }

    // No session → show shell (never redirect)
    void userInitiated;
    renderShell({ reason: 'missing_admin_session', next: '/admin/' });
  }

  // Hook other scripts can call (gate.js/app.js) without hard redirects
  window.__rcShowAdminShell = function (opts) {
    renderShell(opts || {});
  };

  bootstrap(false);
})();
