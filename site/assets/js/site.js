(function() {
  function injectMinimalStyles() {
    if (document.getElementById('copilot-inline-site-css')) return;
    const css = `
      /* Minimal, non-destructive global styles */
      h1, h2, h3, h4 { text-align: center; line-height: 1.2; margin: 0.6em 0; }
      /* Back button styles (clear and accessible) */
      .back-nav { display: flex; justify-content: center; margin: 0.5rem 0 1rem; }
      .back-button { display: inline-flex; align-items: center; gap:.5rem; padding:.6rem 1rem; border:1px solid #1a73e8; border-radius:.5rem; background:#1a73e8; color:#ffffff; text-decoration:none; font-weight:700; letter-spacing:.2px; box-shadow:0 1px 2px rgba(0,0,0,.08); }
      .back-button:hover { filter: brightness(1.05); }

      /* Background video and overlay (duplicated here as a safety net if CSS fails to load) */
      .bg-video{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
      .bg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:-1}
      @media (prefers-reduced-motion: reduce){ .bg-video{display:none} }
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

  // New: Add a “Math Toolkit” button to the sub-site homepage without editing its minified HTML
  function addMathToolkitButtonToSubSiteHome() {
    var p = location.pathname.replace(/index\.html$/i,'');
    var isSubHome = (p === '/site/' || p === '/site');
    if (!isSubHome) return;

    // Avoid duplicates
    if (document.querySelector('a[href="/site/math-toolkit/"]')) return;

    // Prefer an existing nav inside the centered layout; fall back gracefully
    var container =
      document.querySelector('.centered nav') ||
      document.querySelector('nav') ||
      document.querySelector('.centered header') ||
      document.querySelector('header') ||
      document.body;

    var a = document.createElement('a');
    a.href = '/site/math-toolkit/';
    a.textContent = 'Math Toolkit';
    // Use the site’s existing button class if present
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();