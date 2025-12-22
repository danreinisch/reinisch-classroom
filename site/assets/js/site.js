(function() {
  // Centralize the Classroom Hub URL here for easy changes later
  const HUB_URL = '/hub/';
  const STUDENT_PORTAL_URL = '/student/';
  
  /**
   * Check if there is a valid remembered student auth in localStorage
   * Returns true if user is a remembered student with valid, unexpired auth
   */
  function hasValidStudentAuth() {
    try {
      const authStr = localStorage.getItem('rc_auth');
      if (!authStr) return false;
      
      const auth = JSON.parse(authStr);
      if (!auth || typeof auth !== 'object') return false;
      
      // Check required fields
      if (auth.role !== 'student') return false;
      if (!auth.code) return false;
      if (typeof auth.expiresAt !== 'number') return false;
      
      // Check expiry
      if (Date.now() >= auth.expiresAt) return false;
      
      return true;
    } catch (err) {
      return false;
    }
  }

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
      .bg{display:none}
      body.video-fallback .bg{display:block}
      body.video-fallback .bg-video{display:none}
      @media (prefers-reduced-motion: reduce){ .bg-video{display:none}; .bg{display:block} }

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
    var webmSrc = root + 'assets/HomePageBackground.webm';
    var mp4Src = root + 'assets/HomePageBackground.mp4';
    var posterSrc = root + 'assets/HomePageBackground-poster.jpg';

    var v = document.createElement('video');
    v.className = 'bg-video';
    v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true; 
    v.setAttribute('preload','metadata');
    v.setAttribute('poster', posterSrc);

    // WebM first (better compression), then MP4 fallback
    var s1 = document.createElement('source');
    s1.src = webmSrc; s1.type = 'video/webm';
    v.appendChild(s1);

    var s2 = document.createElement('source');
    s2.src = mp4Src; s2.type = 'video/mp4';
    v.appendChild(s2);

    // Error handling: hide video and show fallback
    v.addEventListener('error', function() {
      v.style.display = 'none';
      document.body.classList.add('video-fallback');
    });

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
      'a[data-role="classroom-hub"], a[href="/hub/"]'
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
    // Check for existing Admin link by class or by href="/admin/"
    if (document.querySelector('.admin-link')) return;
    if (document.querySelector('a[href="/admin/"]')) return;

    const a = document.createElement('a');
    a.className = 'admin-link';
    a.href = '/admin/';
    a.textContent = 'Admin';
    a.setAttribute('aria-label', 'Open Admin Uploader');
    document.body.appendChild(a);
  }

  /**
   * Make "Classroom Hub" links role-aware
   * If user is a remembered student, route to /student/ instead of /hub/
   * Otherwise, route to /hub/ as normal
   */
  function makeClassroomHubLinksRoleAware() {
    // Find all "Classroom Hub" links by data-role attribute or href
    const hubLinks = document.querySelectorAll(
      'a[data-role="classroom-hub"], a[href="/hub/"]'
    );
    
    hubLinks.forEach(link => {
      // Skip links that already have been processed
      if (link.dataset.roleAwareProcessed) return;
      link.dataset.roleAwareProcessed = 'true';
      
      // Determine target URL based on auth
      const targetUrl = hasValidStudentAuth() ? STUDENT_PORTAL_URL : HUB_URL;
      
      // Update href attribute to reflect the correct destination
      // This allows the link to work naturally without JavaScript intervention
      link.setAttribute('href', targetUrl);
    });
  }

  // Handle error events for static #bg-video element (if present)
  function attachVideoErrorHandler() {
    const video = document.getElementById('bg-video');
    if (!video) return;
    
    // Error handling: hide video and show fallback
    video.addEventListener('error', function() {
      video.style.display = 'none';
      document.body.classList.add('video-fallback');
    });
  }

  function init() {
    injectMinimalStyles();
    attachVideoErrorHandler(); // Handle errors for static #bg-video
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
    
    // Make "Classroom Hub" links role-aware (route students to /student/)
    makeClassroomHubLinksRoleAware();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// Load app shell after site.js initializes
(function() {
  // Runtime check timeout (ms) - gives time for deferred scripts to load
  const ASSET_CHECK_TIMEOUT = 2000;
  
  function loadAppShell() {
    // Check if already loaded
    if (document.querySelector('link[href*="app-shell.css"]')) {
      return;
    }

    // Load CSS with error handling
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/assets/css/app-shell.css';
    css.onerror = () => {
      console.warn('[site.js] Failed to load app-shell.css');
    };
    document.head.appendChild(css);

    // Load JS with error handling
    const script = document.createElement('script');
    script.src = '/assets/js/app-shell.js';
    script.defer = true;
    script.onerror = () => {
      console.warn('[site.js] Failed to load app-shell.js');
    };
    document.head.appendChild(script);

    console.log('[site.js] App shell loaded');
    
    // Runtime self-check: verify assets loaded successfully
    // Waits for deferred scripts to execute before checking
    setTimeout(() => {
      const jsLoaded = typeof window.AppShell !== 'undefined';
      
      if (!jsLoaded) {
        console.warn('[site.js] App shell asset loading issue detected:', {
          js: 'failed - AppShell API not available'
        });
      }
    }, ASSET_CHECK_TIMEOUT);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAppShell);
  } else {
    loadAppShell();
  }
})();
