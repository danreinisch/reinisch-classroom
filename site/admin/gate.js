// Server-side session gate
(function(){
  async function gate(){
    try{
      const r = await fetch('/.netlify/functions/admin-session-check', { cache:'no-store', credentials:'same-origin' });
      if (!r.ok) {
        // If admin not configured or session expired, redirect to admin-login
        // The login page will display appropriate setup or login message
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
