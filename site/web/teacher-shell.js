(function(){
  const KEY = 'rc_tc_sidebar';
  const DEFAULT = 'collapsed';

  function setCollapsed(isCollapsed){
    document.documentElement.classList.toggle('tc-collapsed', isCollapsed);
    try{ localStorage.setItem(KEY, isCollapsed ? 'collapsed' : 'expanded'); }catch(_){}
    const btn = document.getElementById('tcSidebarToggle');
    if(btn) btn.setAttribute('aria-expanded', String(!isCollapsed));
  }

  function getCollapsed(){
    try{
      const v = localStorage.getItem(KEY) || DEFAULT;
      return v !== 'expanded';
    }catch(_){ return true; }
  }

  async function gateTeacher(){
    // Same-origin is mandatory for preview deploys.
    const next = encodeURIComponent(location.pathname);
    try{
      const r = await fetch('/.netlify/functions/teacher-session', { cache:'no-store', credentials:'same-origin' });
      if(!r.ok){
        location.replace(`/hub/?reason=missing_teacher_session&next=${next}`);
        return false;
      }
      return true;
    }catch(_){
      location.replace(`/hub/?reason=gate_error&next=${next}`);
      return false;
    }
  }

  function wireNavActive(){
    const path = location.pathname.replace(/\/+$/, '/') || '/teacher/';
    document.querySelectorAll('.tc-nav a[data-href]').forEach(a=>{
      const href = a.getAttribute('data-href');
      const isActive = href === path;
      if(isActive) a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
      // Tooltips in collapsed mode
      const label = a.querySelector('.tc-label');
      if(label) a.title = label.textContent.trim();
    });
  }

  async function init(){
    const ok = await gateTeacher();
    if(!ok) return;

    setCollapsed(getCollapsed());

    const toggle = document.getElementById('tcSidebarToggle');
    if(toggle){
      toggle.addEventListener('click', ()=>{
        const isCollapsed = document.documentElement.classList.contains('tc-collapsed');
        setCollapsed(!isCollapsed);
      });
    }

    wireNavActive();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
