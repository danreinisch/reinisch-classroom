// Server-side session gate
(function(){
  async function gate(){
    try{
      const r = await fetch('/.netlify/functions/admin-session-check', { cache:'no-store', credentials:'same-origin' });
      if (!r.ok) {
        // Redirect to admin-login with return parameter
        const returnUrl = encodeURIComponent(location.pathname + location.search);
        location.replace('/admin-login/?return=' + returnUrl);
        return;
      }
      document.getElementById('app').style.display='block';
      document.getElementById('gate').style.display='none';
    }catch{
      // Redirect to admin-login with return parameter
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      location.replace('/admin-login/?return=' + returnUrl);
    }
  }
  gate();
})();
