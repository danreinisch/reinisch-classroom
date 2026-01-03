// Server-side session gate - check Teacher Center session
// PR 335: Admin SSO via Teacher Center
(function(){
  async function gate(){
    try{
      const r = await fetch('/.netlify/functions/teacher-session', { cache:'no-store', credentials:"include" });
      if (!r.ok) {
        location.replace('/hub/?reason=missing_teacher_session&next=%2Fadmin%2F');
        return;
      }

      const data = await r.json().catch(() => null);
      const raw = data && (data.raw_role || data.role);

      // Only allow real admins into /admin/
      if (raw !== 'admin') {
        location.replace('/hub/?reason=not_admin&next=%2Fadmin%2F');
        return;
      }

      document.getElementById('app').style.display='block';
      document.getElementById('gate').style.display='none';
    }catch{
      location.replace('/hub/?reason=gate_error&next=%2Fadmin%2F');
    }
  }
  gate();
})();