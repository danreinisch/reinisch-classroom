// Server-side session gate
(function(){
  async function gate(){
    try{
      const r = await fetch('/.netlify/functions/admin-session-check', { cache:'no-store', credentials:'same-origin' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({ code: null }));
        
        // If admin not configured, redirect to not-configured page
        if (data.code === 'ADMIN_NOT_CONFIGURED' || r.status === 503) {
          location.replace('/admin-not-configured/');
          return;
        }
        
        // Otherwise redirect to admin-login with return parameter
        const returnUrl = encodeURIComponent(location.pathname + location.search);
        location.replace('/admin-login/?return=' + returnUrl);
        return;
      }
      document.getElementById('app').style.display='block';
      document.getElementById('gate').style.display='none';
    }catch{
      // On error, redirect to admin-login with return parameter
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      location.replace('/admin-login/?return=' + returnUrl);
    }
  }
  gate();
})();
