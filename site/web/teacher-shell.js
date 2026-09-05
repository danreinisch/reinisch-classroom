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
    const currentPath = location.pathname;
    
    // Don't gate the login page itself (it doesn't include this script,
    // but guard anyway for safety)
    if(currentPath.startsWith('/teacher/login/')){
      return true;
    }
    
    // credentials:'include' ensures the HttpOnly tc cookie is sent on deploy previews.
    try{
      const r = await fetch('/.netlify/functions/teacher-session', { cache:'no-store', credentials:'include' });
      if(r.ok) return true; // Authenticated
      
      if(r.status === 401){
        // Hide page content immediately to prevent flash of teacher data
        document.body.style.display = 'none';
        
        // Build login URL with return path (including query params and hash)
        const returnPath = location.pathname + location.search + location.hash;
        const loginUrl = '/teacher/login/?next=' + encodeURIComponent(returnPath);
        
        console.log('[teacher-shell] Not authenticated, redirecting to', loginUrl);
        location.replace(loginUrl);
        return false;
      }
      
      // Non-401 errors: log and continue (server functions enforce auth independently)
      console.warn('[teacher-shell] Session check returned', r.status, '— continuing');
      return true;
    }catch(err){
      console.warn('[teacher-shell] Session check failed:', err.message, '— continuing');
      return true;
    }
  }

  function ensureObservationNav(){
    const nav = document.querySelector('.tc-nav');
    if(!nav) return;

    const existing =
      nav.querySelector(
        'a[data-href="/teacher/observations/"]'
      );

    if(existing) return;

    const studentsLink =
      nav.querySelector(
        'a[data-href="/teacher/students/"]'
      );

    if(!studentsLink) return;

    const link = document.createElement('a');
    link.href = '/teacher/observations/';
    link.setAttribute(
      'data-href',
      '/teacher/observations/'
    );

    link.innerHTML =
      '<span class="tc-icon">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" ' +
          'fill="none" stroke="currentColor" stroke-width="1.5" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>' +
          '<rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>' +
          '<line x1="9" y1="12" x2="15" y2="12"></line>' +
          '<line x1="9" y1="16" x2="15" y2="16"></line>' +
        '</svg>' +
      '</span>' +
      '<span class="tc-label">Observations</span>';

    studentsLink.insertAdjacentElement(
      'afterend',
      link
    );
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

    // Add sign-out button to topbar
    const topbar = document.querySelector('.tc-topbar');
    if(topbar){
      const signOutBtn = document.createElement('button');
      signOutBtn.className = 'tc-btn';
      signOutBtn.textContent = 'Sign Out';
      signOutBtn.style.marginLeft = 'auto';
      signOutBtn.setAttribute('aria-label', 'Sign out');
      signOutBtn.addEventListener('click', async ()=>{
        try{
          await fetch('/.netlify/functions/teacher-logout', {
            method: 'POST',
            credentials: 'same-origin'
          });
        }catch(err){
          console.warn('[teacher-shell] Logout request failed:', err.message);
        }
        // Always redirect to login, even if logout call fails
        location.replace('/teacher/login/');
      });
      topbar.appendChild(signOutBtn);
    }

    ensureObservationNav();
    wireNavActive();
    loadUngradedBadge();
  }

  async function loadUngradedBadge(){
    try{
      const r = await fetch('/.netlify/functions/teacher-ungraded-count', { cache:'no-store', credentials:'include' });
      if(!r.ok) return;
      const data = await r.json();
      const count = data && data.count > 0 ? data.count : 0;
      if(count === 0) return;
      const reviewLink = document.querySelector('.tc-nav a[data-href="/teacher/review/"]');
      if(!reviewLink) return;
      const badge = document.createElement('span');
      badge.className = 'tc-badge';
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.setAttribute('aria-label', count + ' ungraded submission' + (count === 1 ? '' : 's'));
      reviewLink.appendChild(badge);
    }catch(_){ /* noop — badge is non-critical */ }
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
