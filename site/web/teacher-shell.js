function __rcIsPreviewHost(){
  const h = String(location.hostname || '');
  return h.startsWith('deploy-preview-') || h.includes('--');
}

function __rcHasLocalTeacherAuth(){
  try{
    const a = JSON.parse(localStorage.getItem('rc_auth') || 'null');
    const role =
      (a && a.role) ||
      (a && a.auth && a.auth.role) ||
      (a && a.user && a.user.role) ||
      (a && a.session && a.session.role) || '';
    return role === 'teacher' || role === 'admin';
  }catch(_){
    return false;
  }
}

(function(){
  const KEY = 'rc_tc_sidebar';
  const DEFAULT = 'collapsed';

  function setCollapsed(isCollapsed){
    document.documentElement.classList.toggle('tc-collapsed', isCollapsed);
    try{ localStorage.setItem(KEY, isCollapsed ? 'collapsed' : 'expanded'); }catch(_){ /* noop */ }
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
    if (__rcIsPreviewHost() && __rcHasLocalTeacherAuth()) return true;
    // Same-origin is mandatory for preview deploys.
    const next = encodeURIComponent(location.pathname + location.search);
    try{
      const r = await fetch('/.netlify/functions/teacher-session', { cache:'no-store', credentials:'same-origin' });
      if(!r.ok){
        location.replace(`/hub/?entry=teacher&reason=missing_teacher_session&next=${next}`);
        return false;
      }
      return true;
    }catch(_){
      if (__rcIsPreviewHost() && __rcHasLocalTeacherAuth()) return true;
      location.replace(`/hub/?entry=teacher&reason=gate_error&next=${next}`);
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


/* NETLIFY DRAWER KILL SWITCH
   Deploy previews sometimes inject a CSP-blocked Netlify iframe ("Netlify Drawer")
   that renders as a white bar at the bottom. It uses inline !important styles,
   so CSS cannot reliably hide it. Remove it + keep removing it if re-injected.
*/
(function(){
  const isDrawer = (el) =>
    el && el.tagName === "IFRAME" &&
    typeof el.src === "string" &&
    el.src.includes("app.netlify.com/cdp");

  const nuke = (el) => {
    try { el.remove(); } catch(e) { /* noop */ }
    try {
      el.style.setProperty("display","none","important");
      el.style.setProperty("height","0","important");
      el.style.setProperty("width","0","important");
      el.style.setProperty("opacity","0","important");
      el.style.setProperty("pointer-events","none","important");
    } catch(e) { /* noop */ }
  };

  const run = () => {
    // Home button fallback: if the Home link is empty, give it a glyph.
    const home = document.querySelector('.tc-btn[aria-label="Home"]');
    if (home && !home.textContent.trim()) home.textContent = "⌂";

    document.querySelectorAll('iframe[src*="app.netlify.com/cdp"]').forEach(nuke);

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (isDrawer(node)) nuke(node);
          node.querySelectorAll?.('iframe[src*="app.netlify.com/cdp"]').forEach(nuke);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
