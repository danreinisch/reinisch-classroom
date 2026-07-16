(function(){
  const KEY = 'rc_public_sidebar';
  const DEFAULT = 'collapsed';
  const MOBILE_BREAKPOINT = 768;

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

  function wireNavActive(){
    const path = location.pathname.replace(/\/+$/, '/') || '/';
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

  function normalizePath(pathname){
    const normalized = (pathname || '/')
      .replace(/index\.html$/i, '')
      .replace(/\/+$/, '');

    return normalized || '/';
  }

  function getContextualParent(){
    const path = normalizePath(location.pathname);

    if (
      path === '/language-arts' ||
      path === '/life-skills' ||
      path === '/toolkits'
    ) {
      return { label: 'Home', href: '/' };
    }

    if (
      path === '/language-arts/toolkit' ||
      path === '/math-toolkit'
    ) {
      return { label: 'Toolkits', href: '/toolkits/' };
    }

    if (path.startsWith('/language-arts/')) {
      return {
        label: 'Language Arts',
        href: '/language-arts/'
      };
    }

    if (path.startsWith('/life-skills/')) {
      return {
        label: 'Life Skills',
        href: '/life-skills/'
      };
    }

    if (path === '/math-toolkit/algebra') {
      return {
        label: 'Math Toolkit',
        href: '/math-toolkit/'
      };
    }

    if (path.startsWith('/math-toolkit/algebra/')) {
      return {
        label: 'Algebra',
        href: '/math-toolkit/algebra/'
      };
    }

    if (path.startsWith('/math-toolkit/')) {
      return {
        label: 'Math Toolkit',
        href: '/math-toolkit/'
      };
    }

    return null;
  }

  function insertContextualBackNavigation(){
    const parent = getContextualParent();
    if (!parent) return;

    if (document.querySelector('.tc-context-nav')) return;

    const main = document.querySelector('.tc-main');
    if (!main) return;

    const container =
      main.querySelector('.content-wrapper, .wrap') || main;

    const nav = document.createElement('nav');
    nav.className = 'tc-context-nav';
    nav.setAttribute('aria-label', 'Contextual navigation');

    let link = document.querySelector('.back-link');

    if (link) {
      link.remove();
      link.classList.remove('back-link');
    } else {
      link = document.createElement('a');
    }

    link.classList.add('tc-context-back');
    link.href = parent.href;
    link.setAttribute(
      'aria-label',
      'Back to ' + parent.label
    );
    link.innerHTML =
      '<span aria-hidden="true">←</span>' +
      '<span>Back to ' + parent.label + '</span>';

    nav.appendChild(link);
    container.insertBefore(nav, container.firstChild);
  }

  function init(){
    // Public pages - no authentication required

    // On mobile, always start collapsed regardless of saved preference
    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      setCollapsed(true);
    } else {
      // Only update if different from what the FOUC inline script already set
      const shouldCollapse = getCollapsed();
      const isAlreadyCollapsed = document.documentElement.classList.contains('tc-collapsed');
      if (shouldCollapse !== isAlreadyCollapsed) {
        setCollapsed(shouldCollapse);
      } else {
        // Sync the aria-expanded attribute without triggering a class toggle
        const btn = document.getElementById('tcSidebarToggle');
        if(btn) btn.setAttribute('aria-expanded', String(!shouldCollapse));
      }
    }

    // Use event delegation for hamburger toggle to avoid race condition with public-nav.js
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('#tcSidebarToggle');
      if (toggle) {
        const isCollapsed = document.documentElement.classList.contains('tc-collapsed');
        setCollapsed(!isCollapsed);
      }
    });

    // Close sidebar when clicking a nav link on mobile
    document.querySelectorAll('.tc-nav a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= MOBILE_BREAKPOINT) {
          setCollapsed(true);
        }
      });
    });

    // Close sidebar when clicking the overlay backdrop on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= MOBILE_BREAKPOINT && !document.documentElement.classList.contains('tc-collapsed')) {
        const sidebar = document.querySelector('.tc-sidebar');
        const toggle = document.getElementById('tcSidebarToggle');
        if (sidebar && !sidebar.contains(e.target) && toggle && !toggle.contains(e.target)) {
          setCollapsed(true);
        }
      }
    });

    insertContextualBackNavigation();
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
