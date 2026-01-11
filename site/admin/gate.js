// Legacy Admin Gate (non-bouncy)
// Kept for backwards compatibility.
// IMPORTANT: This file MUST NOT hard-redirect to /hub. Admin UX should stay on /admin/ and show the Admin shell.

(function(){
  'use strict';

  async function gate(){
    try{
      const r = await fetch('/.netlify/functions/teacher-session', {
        cache: 'no-store',
        credentials: 'same-origin'
      });

      if (!r.ok) {
        if (window.__rcShowAdminShell) window.__rcShowAdminShell({ reason: 'missing_teacher_session', next: '/admin/' });
        return;
      }

      const data = await r.json().catch(() => null);
      const raw = data && (data.raw_role || data.role);

      if (raw !== 'admin') {
        if (window.__rcShowAdminShell) window.__rcShowAdminShell({ reason: 'not_admin', next: '/admin/' });
        return;
      }

      const app = document.getElementById('app');
      const gateEl = document.getElementById('gate');
      if (app) app.style.display = 'block';
      if (gateEl) gateEl.style.display = 'none';
    } catch (_) {
      if (window.__rcShowAdminShell) window.__rcShowAdminShell({ reason: 'gate_error', next: '/admin/' });
    }
  }

  gate();
})();
