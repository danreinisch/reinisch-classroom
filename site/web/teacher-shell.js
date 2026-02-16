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
    // Same-origin is mandatory for preview deploys.
    // Session check with redirect to /hub/ on auth failure.
    // Loop prevention safeguards:
    // 1. Don't redirect if already on /hub/ (the login page)
    // 2. Use sessionStorage flag to prevent repeated redirect attempts
    // 3. Network errors don't trigger redirect (may be temporary)
    
    const REDIRECT_FLAG_KEY = 'tc_auth_redirect_attempted';
    const currentPath = location.pathname;
    
    try{
      const r = await fetch('/.netlify/functions/teacher-session', { cache:'no-store', credentials:'same-origin' });
      if(!r.ok){
        console.warn('[teacher-shell] Session check returned', r.status);
        
        // Redirect to login page with safeguards to prevent loops
        if(r.status === 401){
          // Don't redirect if already on /hub/ (the login page)
          if(currentPath === '/hub/' || currentPath === '/hub'){
            console.warn('[teacher-shell] Already on login page, not redirecting');
            return true;
          }
          
          // Check if we've already tried redirecting in this session
          try{
            const alreadyRedirected = sessionStorage.getItem(REDIRECT_FLAG_KEY);
            if(alreadyRedirected){
              console.warn('[teacher-shell] Redirect already attempted in this session, not redirecting again to prevent loop');
              return true;
            }
            
            // Set flag to prevent redirect loop
            sessionStorage.setItem(REDIRECT_FLAG_KEY, 'true');
          }catch(_){
            // sessionStorage may not be available, continue with redirect
          }
          
          // Redirect to login page with reason parameter
          console.log('[teacher-shell] Redirecting to /hub/ for authentication');
          location.href = '/hub/?reason=session_expired';
          return false;
        }
        
        // Non-401 errors: let page load, server functions will enforce auth
        console.warn('[teacher-shell] Non-401 status, continuing without redirect');
        return true;
      }
      
      // Session is valid - clear redirect flag if it exists
      try{
        sessionStorage.removeItem(REDIRECT_FLAG_KEY);
      }catch(_){
        // sessionStorage may not be available, ignore
      }
      
      return true;
    }catch(err){
      console.warn('[teacher-shell] Session check failed:', err.message, '— continuing without redirect');
      return true; // Network error — don't block the UI
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
