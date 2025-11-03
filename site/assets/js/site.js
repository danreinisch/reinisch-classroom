(function() {
  // Centralize the Classroom Hub URL here for easy changes later
  const HUB_URL = '/site/classroom-hub/';

  function injectMinimalStyles() {
    if (document.getElementById('copilot-inline-site-css')) return;
    const css = `
      /* Minimal, non-destructive global styles */
      h1, h2, h3, h4 { text-align: center; line-height: 1.2; margin: 0.6em 0; }
      /* Back button styles (clear and accessible) */
      .back-nav { display: flex; justify-content: center; margin: 0.5rem 0 1rem; }
      .back-button { display: inline-flex; align-items: center; gap:.5rem; padding:.6rem 1rem; border:1px solid #1a73e8; border-radius:.5rem; background:#1a73e8; color:#ffffff; text-decoration:none; cursor:pointer; }
      .back-button:hover { filter: brightness(1.05); }

      /* Background video and overlay (duplicated here as a safety net if CSS fails to load) */
      .bg-video{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
      .bg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:-1}
      @media (prefers-reduced-motion: reduce){ .bg-video{display:none} }

      /* Home quick links (Math Toolkit, Classroom Hub) - Glass style */
      .home-quick-links { display:flex; flex-wrap:wrap; gap:.6rem; justify-content:center; margin: 1rem 0; }
      .home-quick-links a { 
        display:inline-flex; 
        align-items:center; 
        gap:.45rem; 
        padding:.6rem .9rem; 
        border:1px solid rgba(255,255,255,.28);
        border-radius:.55rem; 
        background:rgba(255,255,255,.14);
        backdrop-filter:blur(12px);
        color:#fff; 
        text-decoration:none;
        transition: all 0.2s;
      }
      .home-quick-links a:hover { 
        background:rgba(255,255,255,.22);
        transform: translateY(-1px);
      }

      /* Admin link (top-right on home page) */
      .admin-link{
        position:fixed; top:1rem; right:1rem; z-index:1000;
        color:#fff; background:rgba(255,255,255,.12);
        border:1px solid rgba(255,255,255,.25);
        padding:.6rem 1rem; border-radius:.6rem; text-decoration:none;
        backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
        transition:background .2s, transform .2s;
      }
      .admin-link:hover{ background:rgba(255,255,255,.22); transform:translateY(-1px); }
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

  // Wire Week 7/8 links on the A Door Into Time hub page
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

  // Update any existing “Teacher Center” anchors on the page to “Classroom Hub”
  function updateTeacherCenterToClassroomHub() {
    document.querySelectorAll('a').forEach(a => {
      const label = (a.textContent || '').trim().toLowerCase();
      const aria = (a.getAttribute('aria-label') || '').toLowerCase();
      const href = a.getAttribute('href') || '';
      const looksLikeTeacherCenter =
        label === 'teacher center' ||
        aria.includes('teacher center') ||
        /teacher-tools\/??$/i.test(href) ||
        href.includes('/teacher-tools/');

      if (looksLikeTeacherCenter) {
        a.textContent = 'Classroom Hub';
        a.setAttribute('aria-label', 'Open Classroom Hub');
        a.setAttribute('href', HUB_URL);
        a.setAttribute('data-role', 'classroom-hub');
      }
    });
  }

  function addHomeQuickLinks() {
    const p = location.pathname.replace(/index\.html$/i, '');
    const isRootHome = (p === '/' || p === '');
    const isSubSiteHome = (p === '/site/' || p === '/site');

    if (!isRootHome && !isSubSiteHome) return;

    // prefer an absolute link to the hub so it works from any base
    const relativePath = isRootHome ? 'site/' : './';

    const hasMT = !!document.querySelector('a[href*="math-toolkit"]');
    // Detect existing hub link by data-role or exact href match
    const hasHub = !!document.querySelector(
      'a[data-role="classroom-hub"], a[href="/prototypes/teacher-center-unified.html"]'
    );
    if (hasMT && hasHub) return;

    const buttonsGrid = document.querySelector('.buttons');
    
    if (buttonsGrid) {
      if (!hasMT) {
        const a = document.createElement('a');
        a.className = 'btn';
        a.href = relativePath + 'math-toolkit/';
        a.textContent = 'Math Toolkit';
        a.setAttribute('aria-label', 'Open Math Toolkit');
        buttonsGrid.appendChild(a);
      }
      if (!hasHub) {
        const a = document.createElement('a');
        a.className = 'btn';
        a.href = HUB_URL;
        a.textContent = 'Classroom Hub';
        a.setAttribute('aria-label', 'Open Classroom Hub');
        a.setAttribute('data-role', 'classroom-hub');
        buttonsGrid.appendChild(a);
      }
    } else {
      const container =
        document.querySelector('.centered nav') ||
        document.querySelector('main nav') ||
        document.querySelector('.centered header') ||
        document.querySelector('header') ||
        document.querySelector('main') ||
        document.body;

      const bar = document.createElement('div');
      bar.className = 'home-quick-links';
      const parts = [];
      if (!hasMT) {
        const a = document.createElement('a');
        a.className = 'btn';
        a.href = relativePath + 'math-toolkit/';
        a.textContent = 'Math Toolkit';
        a.setAttribute('aria-label', 'Open Math Toolkit');
        parts.push(a);
      }
      if (!hasHub) {
        const a = document.createElement('a');
        a.className = 'btn';
        a.href = HUB_URL;
        a.textContent = 'Classroom Hub';
        a.setAttribute('aria-label', 'Open Classroom Hub');
        a.setAttribute('data-role', 'classroom-hub');
        parts.push(a);
      }
      if (!parts.length) return;

      parts.forEach(a => bar.appendChild(a));

      if (container.firstChild) {
        container.insertBefore(bar, container.firstChild.nextSibling);
      } else {
        container.appendChild(bar);
      }
    }
  }

  // Add an Admin link at top-right on home page
  function addAdminLink() {
    const p = location.pathname.replace(/index\.html$/i, '');
    const isRootHome = (p === '/' || p === '');
    const isSubSiteHome = (p === '/site/' || p === '/site');
    if (!isRootHome && !isSubSiteHome) return;
    if (document.querySelector('.admin-link')) return;

    const a = document.createElement('a');
    a.className = 'admin-link';
    a.href = '/admin/';
    a.textContent = 'Admin';
    a.setAttribute('aria-label', 'Open Admin Uploader');
    document.body.appendChild(a);
  }

  function init() {
    injectMinimalStyles();
    injectBackgroundVideo();
    const section = getSection();
    insertBackButton(section);
    centerHeadings();
    updateADITLinks();

    // First, upgrade any existing “Teacher Center” button to use Classroom Hub
    updateTeacherCenterToClassroomHub();

    // Then, inject the quick links if they’re missing
    addHomeQuickLinks();

    addAdminLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
