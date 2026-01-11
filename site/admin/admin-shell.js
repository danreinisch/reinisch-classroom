(() => {
  const ROOT_ID = 'rc-admin-shell-root';

  const isPreviewHost = () => {
    const h = String(location.hostname || '');
    return /^deploy-preview-\d+--/.test(h) || h.includes('localhost') || h.includes('127.0.0.1');
  };

  const hasLocalTeacherAuth = () => {
    try {
      if (typeof window.__rcHasLocalTeacherAuth === 'function') return !!window.__rcHasLocalTeacherAuth();
      // Fallback: if you later standardize a key, this can be updated.
      return false;
    } catch {
      return false;
    }
  };

  const previewBypassEnabled = () => {
    try { return localStorage.getItem('rc_admin_preview_bypass') === '1'; } catch { return false; }
  };

  const setPreviewBypass = (on) => {
    try { localStorage.setItem('rc_admin_preview_bypass', on ? '1' : '0'); } catch { void 0; }
  };

  const ensureRoot = () => {
    let el = document.getElementById(ROOT_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ROOT_ID;
      el.className = 'rc-admin-shell-root';
      document.body.appendChild(el);
    }
    return el;
  };

  const hubUrl = (nextPath) => {
    const next = encodeURIComponent(nextPath || (location.pathname + location.search));
    return `/hub/?entry=admin&reason=missing_admin_session&next=${next}`;
  };

  async function hasAdminSession() {
    try {
      const r = await fetch('/.netlify/functions/admin-session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      return !!(r && r.ok);
    } catch {
      return false;
    }
  }

  function render(opts = {}) {
    const root = ensureRoot();
    const nextPath = opts.next || (location.pathname + location.search);
    const reason = opts.reason || 'missing_admin_session';
    const preview = isPreviewHost();
    const canPreviewBypass = preview && (hasLocalTeacherAuth() || previewBypassEnabled());

    root.style.display = 'flex';
    root.innerHTML = `
      <div class="rc-admin-shell-card">
        <div class="rc-admin-shell-top">
          <div>
            <h1 class="rc-admin-shell-title">Admin</h1>
            <p class="rc-admin-shell-sub">
              <strong>Admin session required.</strong> You can retry, go authenticate, or (on deploy previews) bypass to view the Admin shell without server cookies.
            </p>
          </div>
          <div class="rc-admin-shell-badge">reason: <span style="opacity:.9">${reason}</span></div>
        </div>

        <hr class="rc-admin-shell-hr" />

        <div class="rc-admin-shell-actions">
          <button class="rc-btn rc-btn-primary" data-action="retry">Retry</button>
          <button class="rc-btn" data-action="hub">Go to Hub (sign in)</button>
          ${canPreviewBypass ? `<button class="rc-btn rc-btn-good" data-action="preview-continue">Continue in Preview</button>` : ``}
          ${preview ? `<button class="rc-btn" data-action="preview-toggle">${previewBypassEnabled() ? 'Disable' : 'Enable'} preview bypass</button>` : ``}
        </div>

        <p class="rc-admin-shell-mini" style="margin-top:12px">
          next: <code style="opacity:.9">${nextPath.replace(/</g,'&lt;')}</code>
        </p>
      </div>
    `;

    root.querySelector('[data-action="retry"]')?.addEventListener('click', async () => {
      root.querySelector('.rc-admin-shell-sub').textContent = 'Re-checking admin session…';
      const ok = await hasAdminSession();
      if (ok) hide();
      else render({ reason, next: nextPath });
    });

    root.querySelector('[data-action="hub"]')?.addEventListener('click', () => {
      location.assign(hubUrl(nextPath));
    });

    root.querySelector('[data-action="preview-continue"]')?.addEventListener('click', () => {
      setPreviewBypass(true);
      hide();
    });

    root.querySelector('[data-action="preview-toggle"]')?.addEventListener('click', () => {
      setPreviewBypass(!previewBypassEnabled());
      render({ reason, next: nextPath });
    });
  }

  function hide() {
    const root = ensureRoot();
    root.style.display = 'none';
    root.innerHTML = '';
  }

  // Expose a tiny API so admin/app.js can call it instead of bouncing to /hub/
  window.__rcShowAdminShell = (opts) => render(opts || {});
  window.__rcHideAdminShell = () => hide();
  window.__rcAdminPreviewBypassEnabled = () => previewBypassEnabled();

  document.addEventListener('DOMContentLoaded', async () => {
    // If bypass is enabled, don't block page render.
    if (isPreviewHost() && previewBypassEnabled()) return;

    // If admin-session is valid, do nothing.
    const ok = await hasAdminSession();
    if (ok) return;

    // Otherwise, show the shell (no bounce).
    render({ reason: 'missing_admin_session', next: location.pathname + location.search });
  });
})();
