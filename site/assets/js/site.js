(function() {
  function injectMinimalStyles() {
    if (document.getElementById('copilot-inline-site-css')) return;
    const css = `
      /* Minimal, non-destructive global styles */
      h1, h2, h3, h4 { text-align: center; line-height: 1.2; margin: 0.6em 0; }
      /* Back button styles (clear and accessible) */
      .back-nav { display: flex; justify-content: center; margin: 0.5rem 0 1rem; }
      .back-button { display: inline-flex; align-items: center; gap:.5rem; padding:.6rem 1rem; border:1px solid #1a73e8; border-radius:.5rem; background:#1a73e8; color:#ffffff; text-decoration:none }
      .back-button:hover { filter: brightness(1.05); }

      /* Background video and overlay (duplicated here as a safety net if CSS fails to load) */
      .bg-video{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
      .bg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:-1}
      @media (prefers-reduced-motion: reduce){ .bg-video{display:none} }

      /* Home quick links (Math Toolkit, Teacher Tools) - Glass style matching homepage buttons */
      .home-quick-links { display:flex; flex-wrap:wrap; gap:.6rem; justify-content:center; margin: 1rem 0; }
      .home-quick-links a { display:inline-flex; align-items:center; gap:.45rem; padding:.6rem 1rem; 
                            border:1px solid rgba(255,255,255,.28); border-radius:.55rem; 
                            background:rgba(255,255,255,.14); color:#fff; text-decoration:none;
                            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                            transition: background .2s, transform .2s; }
      .home-quick-links a:hover { background:rgba(255,255,255,.24); transform: translateY(-1px); }
    `;
    const style = document.createElement('style');
    style.id = 'copilot-inline-site-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getSection() {
    const meta = document.querySelector('meta[name="section"]');
    if (meta && meta.content) {
      const v = meta.content.toLowerCase();
      if (v.includes('language')) return 'language-arts';
      if (v.includes('life')) return 'life-skills';
    }
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
    if (isSectionLandingPage(section)) return; // no button on landing pages
    if (document.querySelector('.back-nav')) return; // avoid duplicates

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

  // New: Wire Week 7/8 links on the A Door Into Time hub page
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

  // Inject a full-bleed background video behind the content
  function injectBackgroundVideo() {
    // Respect reduced-motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.querySelector('.bg-video')) return; // already present

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

    // Insert before the static .bg so the z-index stack is clean
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

    // Robust looping and autoplay kick
    v.addEventListener('ended', function(){ this.currentTime = 0; this.play().catch(function(){}) });
    v.play && v.play().catch(function(){});
  }

  // Resolve the correct site prefix based on how assets are loaded
  function resolveSitePrefix() {
    // Check if any script or link element contains '/site/' in its src/href
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const links = Array.from(document.querySelectorAll('link[href]'));
    
    for (const el of [...scripts, ...links]) {
      const url = el.src || el.href;
      if (url && url.includes('/site/')) {
        return '/site/';
      }
    }
    
    // Fallback: check current pathname
    if (location.pathname.indexOf('/site/') >= 0) {
      return '/site/';
    }
    
    return '/';
  }

  // NEW: Add quick links to home pages for Math Toolkit and Teacher Tools
  function addHomeQuickLinks() {
    const p = location.pathname.replace(/index\.html$/i, '');
    const isRootHome = (p === '/' || p === '');
    const isSubSiteHome = (p === '/site/' || p === '/site');

    if (!isRootHome && !isSubSiteHome) return;

    // Detect the correct prefix for links
    const prefix = resolveSitePrefix();

    // Avoid duplicates if links already exist anywhere on the page (check both path forms)
    const hasMT = !!(
      document.querySelector('a[href="/site/math-toolkit/"]') ||
      document.querySelector('a[href="' + prefix + 'math-toolkit/"]') ||
      document.querySelector('a[href="/math-toolkit/"]')
    );
    const hasTT = !!(
      document.querySelector('a[href="/site/teacher-tools/"]') ||
      document.querySelector('a[href="' + prefix + 'teacher/"]') ||
      document.querySelector('a[href="/teacher/"]') ||
      document.querySelector('a[href="/site/teacher/"]')
    );
    if (hasMT && hasTT) return;

    // Choose a sensible mount point (prefer .content first as per requirements)
    const container =
      document.querySelector('.content') ||
      document.querySelector('.centered nav') ||
      document.querySelector('main nav') ||
      document.querySelector('.centered header') ||
      document.querySelector('header') ||
      document.querySelector('main') ||
      document.body;

    const bar = document.createElement('div');
    bar.className = 'home-quick-links';
    // Build anchors only if missing to avoid duplication
    const parts = [];
    if (!hasMT) {
      const a = document.createElement('a');
      a.href = prefix + 'math-toolkit/';
      a.textContent = 'Math Toolkit';
      a.setAttribute('aria-label', 'Open Math Toolkit');
      parts.push(a);
    }
    if (!hasTT) {
      const a = document.createElement('a');
      a.href = prefix + 'teacher/';
      a.textContent = 'Teacher Tools';
      a.setAttribute('aria-label', 'Open Teacher Tools');
      parts.push(a);
    }
    if (!parts.length) return;

    parts.forEach(a => bar.appendChild(a));

    // Insert near the top of main content
    if (container.firstChild) {
      container.insertBefore(bar, container.firstChild.nextSibling);
    } else {
      container.appendChild(bar);
    }
  }

  function init() {
    injectMinimalStyles();
    injectBackgroundVideo();
    const section = getSection();
    insertBackButton(section);
    centerHeadings();
    updateADITLinks();
    addHomeQuickLinks(); // <- ensure buttons appear on home pages
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();