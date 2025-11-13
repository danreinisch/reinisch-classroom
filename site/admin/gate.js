// Admin session gate
// Checks for valid admin session and redirects to login if needed
(function() {
  async function gate() {
    try {
      const r = await fetch('/.netlify/functions/admin-session-check', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (!r.ok) {
        location.replace('/admin-login');
        return;
      }
      document.getElementById('app').style.display = 'block';
      document.getElementById('gate').style.display = 'none';
    } catch {
      location.replace('/admin-login');
    }
  }

  // Run gate check when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', gate);
  } else {
    gate();
  }
})();
