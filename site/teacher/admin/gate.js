/* eslint-env browser */
// Server-side session gate - check Teacher Center session
// PR 335: Admin SSO via Teacher Center
(function(){
  function revealAdminUtilityCards(){
    ['unitScaffolderCard', 'unitManagerCard'].forEach(function(id){
      const card = document.getElementById(id);
      if (card) card.style.display='block';
    });
  }

  async function gate(){
    try{
      const r = await fetch('/.netlify/functions/teacher-session', { cache:'no-store', credentials:'same-origin' });
      if (!r.ok) {
        location.replace('/hub/?reason=missing_teacher_session&next=%2Fteacher%2Fadmin%2F');
        return;
      }

      const data = await r.json().catch(() => null);
      const raw = data && (data.raw_role || data.role);

      // Only allow real admins into /teacher/admin/
      if (raw !== 'admin') {
        location.replace('/hub/?reason=not_admin&next=%2Fteacher%2Fadmin%2F');
        return;
      }

      const app = document.getElementById('app');
      const gateEl = document.getElementById('gate');

      if (app) app.style.display='block';
      if (gateEl) gateEl.style.display='none';

      revealAdminUtilityCards();
    }catch{
      location.replace('/hub/?reason=gate_error&next=%2Fteacher%2Fadmin%2F');
    }
  }
  gate();
})();