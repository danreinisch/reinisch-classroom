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
    // Always send teachers through the Teacher entry so the TC cookie is minted for this host.
    const r = encodeURIComponent(reason || 'missing_admin_session');
    const n = encodeURIComponent(next || '/admin/');
    return `/hub/?entry=teacher&reason=${r}&next=${n}`;
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
    root.innerHTML = ``;
    root.innerHTML += `  <div class='rc-admin-shell-card'>`;
    root.innerHTML += `    <div class='rc-admin-shell-title'>Admin</div>`;
    root.innerHTML += `    <div class='rc-admin-shell-sub'>${msg}</div>`;
    root.innerHTML += `    <div class='rc-admin-shell-meta'>Reason: <code>${reason}</code></div>`;
    root.innerHTML += `    <div class='rc-admin-shell-actions'>`;
    root.innerHTML += `      <a class='rc-admin-shell-btn primary' href='${hubLink(reason)}'>Go to Classroom Hub (sign in)</a>`;
    root.innerHTML += `      <button class='rc-admin-shell-btn' id='rc-admin-shell-retry'>Retry</button>`;
    root.innerHTML += `    </div>`;
    root.innerHTML += `    <div class='rc-admin-shell-foot'>Stays on <code>/admin/</code>. No bounce-loops. No drama.</div>`;
    root.innerHTML += `  </div>`;

    const retry = el('rc-admin-shell-retry');
    if (retry) retry.onclick = () => {
      const u = new URL(location.href);
      u.searchParams.delete('reason');
      u.searchParams.delete('next');
      // Force reload to drop stale reason state.
      location.replace(u.pathname + (u.search || ''));
    };
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
      // NOTE: no return — still run the gate check (important for deploy-preview bypass + Retry).
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
      // RC_ADMIN_PREVIEW_BYPASS_V1
      // Deploy previews/local dev: allow loading /admin UI when preview bypass is enabled.
      // Production remains strict.
      const __rcIsDeployPreview = /deploy-preview-/.test(location.hostname) || location.hostname === 'localhost';
      const __rcAdminPreviewBypass = localStorage.getItem('rc_admin_preview_bypass') === '1';
      const __rcServerPreviewBypass = !!(data && data.previewBypass); // optional if server ever provides it
      const __rcAllowAdminUi = (role === 'admin') || (__rcIsDeployPreview && data && data.ok) || (__rcIsDeployPreview && __rcAdminPreviewBypass);


      if (!__rcAllowAdminUi) {
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
