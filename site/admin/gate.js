// Server-side session gate - check Teacher Center session
// PR 335: Admin SSO via Teacher Center
(function(){
  async function gate(){
    try{
      // Check Teacher Center session instead of admin session
      // Use 'include' for credentials to ensure cookies are sent
      const r = await fetch('/.netlify/functions/teacher-session', { cache:'no-store', credentials:'include' });
      if (!r.ok) {
        // If Teacher Center session not valid, redirect to hub
        location.replace('/hub/');
        return;
      }
      document.getElementById('app').style.display='block';
      document.getElementById('gate').style.display='none';
    }catch{
      // On error, redirect to Teacher Center
      location.replace('/hub/');
    }
  }
  gate();
})();
