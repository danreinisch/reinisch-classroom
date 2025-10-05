(function() {
  function injectMinimalStyles() {
    if (document.getElementById('copilot-inline-site-css')) return;
    const css = `
      h1, h2, h3, h4 { text-align: center; line-height: 1.2; margin: 0.6em 0; }
      .back-nav { display: flex; justify-content: center; margin: 0.5rem 0 1rem; }
      .back-button { display: inline-flex; align-items: center; gap:.5rem; padding:.6rem 1rem; border:1px solid #1a73e8; border-radius:.5rem; background:#1a73e8; color:#ffffff; text-decoration:none; font-weight:700; letter-spacing:.2px; box-shadow:0 1px 2px rgba(0,0,0,.08); }
      .back-button:hover { filter: brightness(1.05); }
      .bg-video{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
      .bg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:-1}
      @media (prefers-reduced-motion: reduce){ .bg-video{display:none} }

      /* Glass grid injected on LA/LS pages */
      .injected-grid { max-width:1100px; margin: 1rem auto 2rem; padding: 0 1rem; }
      .injected-grid h2 { text-align:left; margin:.25rem 0 .5rem; color:#e8edf5 }
      .ig-grid { display:grid; gap:1rem; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); }
      .ig-card { display:block; text-decoration:none; color:#e8edf5; background: rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.28); border-radius:1rem; overflow:hidden; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); transition: background .2s, transform .2s }
      .ig-card:hover{ background:rgba(255,255,255,.22); transform: translateY(-2px) }
      .ig-thumb { width:100%; aspect-ratio:16/9; object-fit:cover; display:block; background:rgba(0,0,0,.25) }
      .ig-title { padding:.75rem 1rem }
    `;
    const style = document.createElement('style');
    style.id = 'copilot-inline-site-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getSection() {
    const p = location.pathname.toLowerCase();
    if (p.includes('/language-arts/')) return 'language-arts';
    if (p.includes('/life-skills/')) return 'life-skills';
    if (p.includes('/presentations/')) return 'language-arts';
    return null;
  }

  function isSectionLandingPage(section) {
    const p = location.pathname.replace(/index\.html$/i, '').toLowerCase();
    const expected = '/' + section + '/';
    return p === expected;
  }

  function insertBackButton(section) {
    if (!section) return;
    if (isSectionLandingPage(section)) return;
    if (document.querySelector('.back-nav')) return;

    const label = section === 'language-arts' ? 'Language Arts' : 'Life Skills';
    const href = '/' + (section === 'language-arts' ? 'language-arts/' : 'life-skills/');

    const nav = document.createElement('nav');
    nav.className = 'back-nav';
    const a = document.createElement('a');
    a.className = 'back-button';
    a.href = href;
    a.setAttribute('aria-label', 'Back to ' + label);
    a.innerHTML = '<span aria-hidden="true">←</span><span>Back to ' + label + '</span>';
    nav.appendChild(a);

    const target = document.querySelector('main') || document.body;
    target.insertBefore(nav, target.firstChild);
  }

  function centerHeadings() {
    document.querySelectorAll('h1,h2,h3,h4').forEach(h => { h.style.textAlign = 'center'; });
  }

  function updateADITLinks() {
    if (!location.pathname.toLowerCase().includes('/language-arts/a-door-into-time/')) return;
    const mapping = {
      'Presentation 7': '/presentations/a-door-into-time/presentation-07/',
      'Presentation 8': '/presentations/a-door-into-time/presentation-08/'
    };
    document.querySelectorAll('a.slot').forEach(a => {
      const strong = a.querySelector('strong');
      if (!strong) return;
      const key = (strong.textContent || '').trim();
      if (mapping[key]) {
        a.href = mapping[key];
        const small = a.querySelector('small');
        if (small && /placeholder/i.test(small.textContent || '')) {
          small.textContent = 'Open presentation';
        }
      }
    });
  }

  function injectBackgroundVideo() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.querySelector('.bg-video')) return;

    var root = location.pathname.indexOf('/site/') >= 0
      ? location.pathname.slice(0, location.pathname.indexOf('/site/') + 6)
      : '/';
    var src = root + 'assets/HomePageBackground.mp4';

    var v = document.createElement('video');
    v.className = 'bg-video';
    v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('preload','metadata');

    var s = document.createElement('source');
    s.src = src; s.type = 'video/mp4';
    v.appendChild(s);

    var bg = document.querySelector('.bg');
    if (bg && bg.parentNode) {
      bg.parentNode.insertBefore(v, bg);
      var overlay = document.createElement('div');
      overlay.className = 'bg-overlay';
      bg.parentNode.insertBefore(overlay, bg);
    } else {
      document.body.insertBefore(v, document.body.firstChild);
      var overlay2 = document.createElement('div');
      overlay2.className = 'bg-overlay';
      document.body.insertBefore(overlay2, document.body.firstChild.nextSibling);
    }

    v.addEventListener('ended', function(){ this.currentTime = 0; this.play().catch(function(){}) });
    v.play && v.play().catch(function(){});
  }

  // Render glass grid on LA or LS landing pages
  async function injectSectionGrid() {
    const p = location.pathname.replace(/index\.html$/i, '').toLowerCase();
    let section = null, jsonPath = null, title = 'Modules & Presentations';
    if (p === '/language-arts/') { section = 'language-arts'; jsonPath = '/language-arts/modules.json'; }
    if (p === '/life-skills/') { section = 'life-skills'; jsonPath = '/life-skills/modules.json'; }
    if (!section) return;

    try {
      const res = await fetch(jsonPath + '?' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.modules || []);
      if (!items.length) return;

      const container = document.createElement('section');
      container.className = 'injected-grid';
      container.innerHTML = '<h2>' + title + '</h2><div class="ig-grid" id="ig-grid"></div>';
      const mount = document.querySelector('main') || document.querySelector('.centered') || document.body;
      mount.appendChild(container);

      const grid = container.querySelector('#ig-grid');
      grid.innerHTML = items.map(m => {
        const thumb = m.thumbnail ? `<img class="ig-thumb" src="${m.thumbnail}" alt="">` : `<div class="ig-thumb" aria-hidden="true"></div>`;
        return `<a class="ig-card" href="${m.url}">${thumb}<div class="ig-title">${m.title || 'Item'}</div></a>`;
      }).join('');
    } catch {}
  }

  // Add a Math Toolkit button to /site home if missing
  function addMathToolkitButtonToSubSiteHome() {
    var p = location.pathname.replace(/index\.html$/i,'');
    var isSubHome = (p === '/site/' || p === '/site');
    if (!isSubHome) return;
    if (document.querySelector('a[href="/site/math-toolkit/"]')) return;

    var container =
      document.querySelector('.centered nav') ||
      document.querySelector('nav') ||
      document.querySelector('.centered header') ||
      document.querySelector('header') ||
      document.body;

    var a = document.createElement('a');
    a.href = '/site/math-toolkit/';
    a.textContent = 'Math Toolkit';
    a.className = (container && container.querySelector('.btn')) ? 'btn' : '';
    container.appendChild(a);
  }

  function init() {
    injectMinimalStyles();
    injectBackgroundVideo();
    const section = getSection();
    insertBackButton(section);
    centerHeadings();
    updateADITLinks();
    addMathToolkitButtonToSubSiteHome();
    injectSectionGrid();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
