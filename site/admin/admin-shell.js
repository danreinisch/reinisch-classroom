(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const initialReason = qs.get('reason') || '';
  const next = qs.get('next') || '/admin/';

  const el = (id) => document.getElementById(id);

  function hideAppShowGate() {
    const app = el('app');
    const gate = el('gate');
    if (app) app.style.display = 'none';
    if (gate) gate.style.display = 'grid';
  }

  function showAppHideGate() {
    const app = el('app');
    const gate = el('gate');
    if (gate) gate.style.display = 'none';
    if (app) app.style.display = 'block';
  }

  function hubLink(reason) {
    const r = encodeURIComponent(reason || 'missing_admin_session');
    const n = encodeURIComponent(next || '/admin/');
    return `/hub/?entry=admin&reason=${r}&next=${n}`;
  }

  function renderShell(opts) {
    const root = el('rc-admin-shell-root');
    if (!root) return;

    const reason = (opts && opts.reason) || initialReason || 'missing_admin_session';
    const msg =
      reason === 'not_admin' ? 'You’re signed in, but not as an Admin.' :
      reason === 'tc_session_expired' ? 'Your Teacher Center session expired.' :
      reason === 'gate_error' ? 'Could not verify your session (gate error).' :
      'Admin session required.';

    hideAppShowGate();
    root.style.display = 'block';
    root.innerHTML = `
      <div class="rc-admin-shell-card">
        <div class="rc-admin-shell-title">Admin</div>
        <div class="rc-admin-shell-sub">${msg}</div>
        <div class="rc-admin-shell-meta">Reason: <code>${reason}</code></div>
        <div class="rc-admin-shell-actions">
          <a class="rc-admin-shell-btn primary" href="${hubLink(reason)}">Go to Classroom Hub (sign in)</a>
          <button class="rc-admin-shell-btn" id="rc-admin-shell-retry">Retry</button>
        </div>
        <div class="rc-admin-shell-foot">Stays on <code>/admin/</code>. No bounce-loops. No drama.</div>
      </div>
    `;

    const retry = el('rc-admin-shell-retry');
    if (retry) retry.onclick = () => location.reload();
  }

  function loadAdminApp() {
    if (window.__rcAdminAppLoaded) return;
    window.__rcAdminAppLoaded = true;

    const s = document.createElement('script');
    s.src = '/admin/app.js';
    s.defer = true;
    document.body.appendChild(s);
  }

  async function bootstrap() {
    // If we were redirected here with a reason, just show the shell.
    if (initialReason) {
      renderShell({ reason: initialReason, next });
      return;
    }

    // Default: hide app until proven admin.
    hideAppShowGate();

    try {
      const r = await fetch('/.netlify/functions/teacher-session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (!r.ok) {
        renderShell({ reason: 'missing_admin_session', next });
        return;
      }

      const data = await r.json().catch(() => null);
      const role = data && (data.raw_role || data.role);

      if (role !== 'admin') {
        renderShell({ reason: 'not_admin', next });
        return;
      }

      // ✅ Admin session confirmed — load the real admin app
      const root = el('rc-admin-shell-root');
      if (root) root.style.display = 'none';
      showAppHideGate();
      loadAdminApp();
    } catch (e) {
      void e;
      renderShell({ reason: 'gate_error', next });
    }
  }

  // Hook: other scripts (gate.js/app.js) can request the shell without redirecting.
  window.__rcShowAdminShell = function (opts) {
    renderShell(opts || {});
  };

  bootstrap();
})();