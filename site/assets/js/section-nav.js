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
    if (p === b) return false;           // exact index (not a subfolder)
    return p.startsWith(b);
  }

  function sectionFor(pathname){
    if (pathname.startsWith('/language-arts/')) return 'language-arts';
    if (pathname.startsWith('/life-skills/'))   return 'life-skills';
    return '';
  }

  function ensureNav(){
    const sec = sectionFor(location.pathname);
    if (!sec) return;

    const isLA = sec === 'language-arts';
    const base = isLA ? '/language-arts/' : '/life-skills/';
    if (!isSubpath(location.pathname, base)) return; // only subfolders

    // If a .glass-nav already exists, do not add a duplicate
    if (document.querySelector('.glass-nav')) return;

    const nav = makeEl('div', 'glass-nav');
    const left = makeEl('div', 'left');
    const right = makeEl('div', 'right');

    const home = makeEl('a', 'btn'); home.href = '/'; home.textContent = 'Home';
    const backSection = makeEl('a', 'btn');
    backSection.href = base;
    backSection.textContent = isLA ? 'Back to Language Arts' : 'Back to Life Skills';

    left.appendChild(home);
    left.appendChild(backSection);

    // You can add per-unit backlink if you provide window.UNIT_PAGE.pagePath
    try{
      const unitPath = (window.UNIT_PAGE && window.UNIT_PAGE.pagePath) || '';
      if (unitPath && isSubpath(location.pathname, unitPath)) {
        const backUnit = makeEl('a', 'btn');
        backUnit.href = unitPath;
        backUnit.textContent = 'Back to unit';
        right.appendChild(backUnit);
      }
    } catch {}

    nav.appendChild(left);
    nav.appendChild(right);

    // Insert at top of body
    const first = document.body.firstElementChild;
    if (first) document.body.insertBefore(nav, first);
    else document.body.appendChild(nav);
  }

  function addTheme(){
    // If theme.css not included, add it dynamically so background + glass styles are present
    if (!Array.from(document.styleSheets).some(s => (s.href||'').includes('/assets/css/theme.css'))){
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/assets/css/theme.css';
      document.head.appendChild(link);
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    addTheme();
    ensureNav();
  });
})();
