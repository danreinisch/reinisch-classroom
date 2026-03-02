(function(){
  'use strict';

  function makeEl(tag, cls, text){
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  function isSubpath(path, base){
    const clean = (s)=> s.replace(/index\.html$/,'').replace(/\/+$/,'/') || '/';
    const p = clean(path), b = clean(base);
    if (p === b) return false;
    return p.startsWith(b);
  }
  function sectionFor(pathname){
    if (pathname.startsWith('/language-arts/')) return 'language-arts';
    if (pathname.startsWith('/life-skills/'))   return 'life-skills';
    if (pathname.startsWith('/math-toolkit/'))  return 'math-toolkit';
    if (pathname.startsWith('/admin')) return 'admin';
    return '';
  }
  function addThemeOnce(){
    const hasTheme = Array.from(document.styleSheets).some(s => (s.href||'').includes('/assets/css/rc-theme.css'));
    if (!hasTheme){
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/assets/css/rc-theme.css';
      document.head.appendChild(link);
    }
  }

  function ensureNav(){
    const sec = sectionFor(location.pathname);
    if (!sec) return;
    
    // Don't inject nav on section landing pages
    const cleanPath = location.pathname.replace(/index\.html$/, '').replace(/\/+$/, '/');
    if (cleanPath === '/' + sec + '/') return;
    
    if (document.querySelector('.glass-nav')) return;

    const nav = makeEl('div', 'glass-nav');
    const left = makeEl('div', 'left');
    const right = makeEl('div', 'right');

    const home = makeEl('a', 'btn', 'Home'); home.href = '/';
    left.appendChild(home);

    if (sec === 'language-arts'){
      const backLA = makeEl('a', 'btn', 'Back to Language Arts'); backLA.href = '/language-arts/';
      left.appendChild(backLA);
    } else if (sec === 'life-skills'){
      const backLS = makeEl('a', 'btn', 'Back to Life Skills'); backLS.href = '/life-skills/';
      left.appendChild(backLS);
    } else if (sec === 'math-toolkit'){
      const backMT = makeEl('a', 'btn', 'Back to Math Toolkit'); backMT.href = '/math-toolkit/';
      left.appendChild(backMT);
    }

    // Optional “Back to unit” if the page sets window.UNIT_PAGE.pagePath
    try{
      const unitPath = (window.UNIT_PAGE && window.UNIT_PAGE.pagePath) || '';
      if (unitPath && isSubpath(location.pathname, unitPath)) {
        const backUnit = makeEl('a', 'btn', 'Back to unit'); backUnit.href = unitPath;
        right.appendChild(backUnit);
      }
    } catch {
      // Ignore errors in unit path detection
    }

    nav.appendChild(left);
    nav.appendChild(right);
    const first = document.body.firstElementChild;
    if (first) document.body.insertBefore(nav, first); else document.body.appendChild(nav);
  }

  document.addEventListener('DOMContentLoaded', function(){
    addThemeOnce();
    ensureNav();
  });
})();
