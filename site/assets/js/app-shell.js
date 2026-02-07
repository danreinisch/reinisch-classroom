/**
 * Global App Shell - Left-side Navigation Rail
 * Provides consistent navigation across reinischclassroom.com
 */

(function () {
  'use strict';

  // Debug logger helpers - fall back to console if DebugLogger not available
  const debugLog = (...args) => window.DebugLogger?.log(...args);
  const debugWarn = (...args) => window.DebugLogger?.warn(...args);
  const debugError = console.error.bind(console); // Always log errors

  // Constants
  const DEEP_LINK_CHECK_INTERVAL = 500; // ms
  const DEEP_LINK_TIMEOUT = 5000; // ms

  // State for lessons navigator
  let lessonsData = null;
  let viewerState = {
    isOpen: false,
    currentUrl: null,
    section: null,
    unit: null,
    presentation: null
  };

  // Shell collapse persistence
  const SHELL_COLLAPSE_KEY = 'app-shell-collapsed';
  let shellCollapsed = false;

  /**
   * Initialize the app shell
   */
  function initAppShell() {
    // Check if shell already exists
    if (document.querySelector('.app-shell-rail')) {
      return;
    }

    // Phase 1: Ensure global theme is loaded before shell initialization
    ensureGlobalTheme();

    // Create and inject shell
    const shell = createShell();
    document.body.appendChild(shell);

    // Add body class for layout adjustment
    document.body.classList.add('has-app-shell');

    // Detect if we're in a presentation context and add appropriate class
    detectPresentationContext();

    restoreShellCollapsed();
    window.addEventListener('resize', applyShellCollapsed);

    // Create lessons navigator panel
    createLessonsNavigator();

    // Create presentation viewer
    createPresentationViewer();

    // Setup event handlers
    setupEventHandlers();

    // Update auth state
    updateAuthState();

    // Load lessons data
    loadLessonsData();

    // Check URL params for deep linking
    initDeepLinking();
  }

  function applyShellCollapsed() {
    const rail = document.querySelector('.app-shell-rail');
    if (!rail) return;
    const shouldCollapse = shellCollapsed && window.innerWidth > 768;
    document.body.classList.toggle('app-shell-collapsed', shouldCollapse);
    if (!shouldCollapse) {
      rail.classList.remove('open');
    }
  }

  function saveShellCollapsed() {
    try {
      localStorage.setItem(SHELL_COLLAPSE_KEY, JSON.stringify(shellCollapsed));
    } catch (err) {
      debugWarn('[app-shell] Could not save shell state:', err);
    }
  }

  function restoreShellCollapsed() {
    try {
      const saved = localStorage.getItem(SHELL_COLLAPSE_KEY);
      shellCollapsed = saved ? JSON.parse(saved) : false;
    } catch (err) {
      shellCollapsed = false;
    }
    applyShellCollapsed();
  }

  /**
   * Phase 1: Ensure global Emerald theme CSS is loaded
   * Injects required theme CSS files if not already present
   * This ensures consistent GUI across all pages, not just /hub/
   */
  function ensureGlobalTheme() {
    // Set root theme marker if absent
    if (!document.documentElement.dataset.theme) {
      document.documentElement.dataset.theme = 'emerald';
    }

    // Define required theme CSS files
    // Note: These paths match the canonical theme assets used by /hub/
    // If these files are moved, update paths here and in hub HTML
    const themeFiles = [
      { href: '/assets/css/rc-emerald-dashboard-theme.css', id: 'rc-emerald-dashboard-theme' },
      { href: '/assets/css/rc-emerald-bridge.css', id: 'rc-emerald-bridge' },
      { href: '/assets/css/app-shell.css', id: 'app-shell-css' }
    ];

    // Inject each CSS file if not already loaded (idempotent)
    themeFiles.forEach(file => {
      // First check by ID (most reliable)
      const existingById = file.id ? document.getElementById(file.id) : null;
      if (existingById) {
        return; // Already loaded
      }
      
      // Check by href - iterate through link elements to avoid selector injection
      let existingByHref = false;
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      for (const link of links) {
        if (link.getAttribute('href') === file.href) {
          existingByHref = true;
          break;
        }
      }
      
      if (!existingByHref) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = file.href;
        if (file.id) {
          link.id = file.id;
        }
        document.head.appendChild(link);
        debugLog('[app-shell] Injected theme CSS:', file.href);
      }
    });
  }

  /**
   * Detect if current page is a presentation context and add appropriate body class
   */
  function detectPresentationContext() {
    const pathname = window.location.pathname;
    
    // Check if we're on a presentation page
    // Match: /presentations/... (but not exactly /presentations/)
    // Match: /life-skills/presentations/...
    // Note: /viewer/ paths are handled by viewer.js which adds 'viewer-sidebar-collapsed'
    if (pathname.includes('/presentations/') && pathname !== '/presentations/') {
      document.body.classList.add('rc-presentation-active');
      debugLog('[app-shell] Detected presentation context');
    } else if (pathname.includes('/life-skills/presentations/')) {
      document.body.classList.add('rc-presentation-active');
      debugLog('[app-shell] Detected life-skills presentation context');
    }
  }

  /**
   * Create the shell HTML structure
   */
  function createShell() {
    const rail = document.createElement('nav');
    rail.className = 'app-shell-rail';
    rail.setAttribute('aria-label', 'Main navigation');

    rail.innerHTML = `
      <div class="app-shell-header">
        <a href="/" class="app-shell-brand" aria-label="Return to Home" title="Return to Home">Reinisch Classroom</a>
        <div class="app-shell-tagline">Empowering Every Learner</div>
      </div>

      <div class="app-shell-nav">
        <!-- Lessons -->
        <button class="app-shell-item" data-shell-nav="lessons" aria-expanded="false">
          <span class="app-shell-item-label">Lessons</span>
          <span class="app-shell-item-arrow">▶</span>
        </button>
        <div class="app-shell-submenu" data-shell-submenu="lessons">
          <a href="/language-arts/" class="app-shell-submenu-item">Language Arts</a>
          <a href="/life-skills/" class="app-shell-submenu-item">Life Skills</a>
        </div>

        <!-- Toolkits -->
        <button class="app-shell-item" data-shell-nav="toolkits" aria-expanded="false">
          <span class="app-shell-item-label">Toolkits</span>
          <span class="app-shell-item-arrow">▶</span>
        </button>
        <div class="app-shell-submenu" data-shell-submenu="toolkits">
          <a href="/language-arts/toolkit/" class="app-shell-submenu-item">Language Arts Toolkit</a>
          <a href="/math-toolkit/" class="app-shell-submenu-item">Math Toolkit</a>
        </div>

        <!-- Teacher -->
        <button class="app-shell-item" data-shell-nav="teacher" data-requires-auth="teacher" aria-expanded="false">
          <span class="app-shell-item-label">Teacher</span>
          <span class="app-shell-item-arrow">▶</span>
        </button>
        <div class="app-shell-submenu" data-shell-submenu="teacher">
          <a href="/hub/" class="app-shell-submenu-item">Teacher Center</a>
          <a href="/admin/" class="app-shell-submenu-item app-shell-hidden" data-admin-only>Admin</a>
        </div>

        <!-- Student -->
        <button class="app-shell-item" data-shell-nav="student" data-requires-auth="student">
          <span class="app-shell-item-label">Student</span>
        </button>

        <!-- Substitute -->
        <button class="app-shell-item" data-shell-nav="substitute" data-requires-auth="substitute">
          <span class="app-shell-item-label">Substitute</span>
        </button>
      </div>

      <div class="app-shell-footer">
        <button class="app-shell-footer-btn app-shell-hidden" data-shell-action="signout">
          <span>Sign Out</span>
        </button>
      </div>

      <div class="app-shell-status" data-shell-status>
        <span>Ready</span>
      </div>
    `;

    // Create mobile toggle button
    const toggle = document.createElement('button');
    toggle.className = 'app-shell-toggle';
    toggle.setAttribute('aria-label', 'Toggle navigation');
    toggle.innerHTML = '<span class="app-shell-toggle-icon">☰</span>';
    document.body.appendChild(toggle);

    return rail;
  }

  /**
   * Setup event handlers
   * Phase 302C: Added defensive null-checks for toggle and rail elements
   */
  function setupEventHandlers() {
    const rail = document.querySelector('.app-shell-rail');
    if (!rail) return;

    // Phase 302C: Defensive - Toggle button handler (mobile)
    const toggle = document.querySelector('.app-shell-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        if (window.innerWidth > 768) {
          shellCollapsed = !shellCollapsed;
          saveShellCollapsed();
          applyShellCollapsed();
          return;
        }
        rail.classList.toggle('open');
      });
    }

    // Phase 302C: Defensive - Close rail when clicking outside (mobile)
    document.addEventListener('click', (e) => {
      if (window.innerWidth > 768) return;
      
      // Close if clicked outside rail and not on toggle (if toggle exists)
      if (!rail.contains(e.target) && (!toggle || !toggle.contains(e.target))) {
        rail.classList.remove('open');
      }
    });

    // Handle nav link clicks in viewer/presentation contexts (close + navigate pattern)
    rail.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      
      // Check if we're in a viewer/presentation context
      const isViewerContext = document.body.classList.contains('viewer-open') ||
                             document.body.classList.contains('viewer-sidebar-collapsed') ||
                             document.body.classList.contains('rc-presentation-active');
      
      if (isViewerContext) {
        e.preventDefault();
        
        // Close presentation viewer if it's open (function is defined in this file)
        if (viewerState.isOpen) {
          closePresentationViewer();
        }
        
        // Navigate to the link
        window.location.href = link.href;
      }
    });

    // Navigation item toggles
    rail.addEventListener('click', (e) => {
      const navButton = e.target.closest('[data-shell-nav]');
      if (!navButton) return;

      const navId = navButton.dataset.shellNav;
      const requiresAuth = navButton.dataset.requiresAuth;

      // Check if requires auth and user is not authenticated
      if (requiresAuth && !isAuthenticated(requiresAuth)) {
        handleAuthRequired(requiresAuth);
        return;
      }

      // Handle special cases (no submenu)
      if (navId === 'student') {
        window.location.href = '/student/';
        return;
      }

      if (navId === 'substitute') {
        window.location.href = '/sub/';
        return;
      }

      // Special handling for lessons - open navigator panel instead of submenu
      if (navId === 'lessons') {
        toggleLessonsNavigator();
        return;
      }

      // Toggle submenu
      const submenu = rail.querySelector(`[data-shell-submenu="${navId}"]`);
      if (submenu) {
        const isExpanded = navButton.getAttribute('aria-expanded') === 'true';
        
        // Close other submenus
        rail.querySelectorAll('.app-shell-item.expanded').forEach((item) => {
          if (item !== navButton) {
            item.classList.remove('expanded');
            item.setAttribute('aria-expanded', 'false');
          }
        });
        rail.querySelectorAll('.app-shell-submenu.show').forEach((menu) => {
          if (menu !== submenu) {
            menu.classList.remove('show');
          }
        });

        // Toggle this submenu
        navButton.classList.toggle('expanded');
        submenu.classList.toggle('show');
        navButton.setAttribute('aria-expanded', !isExpanded);
      }
    });

    // Phase 302C: Defensive - Sign out button may not exist
    const signOutBtn = rail.querySelector('[data-shell-action="signout"]');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', handleSignOut);
    }
  }

  /**
   * Check if user is authenticated for a specific role
   */
  function isAuthenticated(role) {
    try {
      const authStr = localStorage.getItem('rc_auth');
      if (!authStr) return false;

      const auth = JSON.parse(authStr);
      if (!auth || !auth.role || !auth.code) return false;

      // Check expiry
      if (auth.expiresAt && Date.now() >= auth.expiresAt) return false;

      // Check role match
      if (role && auth.role !== role) {
        // Special case: admin can access teacher
        if (role === 'teacher' && auth.role === 'admin') {
          return true;
        }
        return false;
      }

      return true;
    } catch (err) {
      debugError('[app-shell] Error checking auth:', err);
      return false;
    }
  }

  /**
   * Handle authentication required
   */
  function handleAuthRequired(role) {
    debugLog('[app-shell] Auth required for role:', role);
    
    if (role === 'teacher') {
      // Navigate to hub with entry parameter to auto-open teacher login
      window.location.href = '/hub/?entry=teacher';
    } else if (role === 'student') {
      window.location.href = '/student/';
    } else if (role === 'substitute') {
      window.location.href = '/sub/';
    }
  }

  /**
   * Handle sign out
   * Signs out of all roles (teacher, admin, substitute) and clears all auth state
   * P0.2: Role-aware logout - only calls appropriate endpoints based on current page/role
   */
  async function handleSignOut() {
    debugLog('[app-shell] Sign out requested - clearing all sessions');

    try {
      // Clear local auth immediately
      localStorage.removeItem('rc_auth');

      // P0.2: Role-based gate - determine which logout endpoints to call
      const pathname = window.location.pathname.toLowerCase();
      const logoutPromises = [];
      
      // Determine current surface/role from pathname
      const isSubPage = pathname.startsWith('/sub');
      const isAdminPage = pathname.startsWith('/admin');
      const isTeacherPage = pathname.startsWith('/hub') || pathname.startsWith('/teacher');
      // Note: Student pages only clear localStorage, no server-side logout needed
      
      // Only call logout endpoints relevant to current role/surface
      if (isTeacherPage || isAdminPage) {
        // Teacher and admin pages can call teacher/admin logout
        // Note: Admin users may have both teacher (tc) and admin cookies,
        // so we clear teacher cookie on both surfaces
        logoutPromises.push(
          fetch('/.netlify/functions/teacher-logout', {
            method: 'POST',
            credentials: 'include',
          }).catch(() => {})
        );
        
        if (isAdminPage) {
          // Also clear admin-specific cookie (rc_admin_session_v2) if present
          logoutPromises.push(
            fetch('/.netlify/functions/admin-logout', {
              method: 'POST',
              credentials: 'include',
            }).catch(() => {})
          );
        }
      } else if (isSubPage) {
        // Substitute pages only call substitute logout
        logoutPromises.push(
          fetch('/.netlify/functions/substitute-logout', {
            method: 'POST',
            credentials: 'include',
          }).catch(() => {})
        );
      }
      // P0.2: Student pages do NOT call any teacher/admin/substitute endpoints
      // They only clear local storage (already done above)
      
      debugLog(`[app-shell] Calling ${logoutPromises.length} role-appropriate logout endpoint(s)`);

      // Wait for all logout attempts (but don't block on errors)
      if (logoutPromises.length > 0) {
        await Promise.allSettled(logoutPromises);
      }

      // Redirect to home
      window.location.href = '/';
    } catch (err) {
      debugError('[app-shell] Error during sign out:', err);
      // Still redirect on error
      window.location.href = '/';
    }
  }

  /**
   * Get the current page role context based on pathname
   * This ensures student pages always show student context, even if user has teacher auth
   * @returns {string|null} Role string ('student', 'teacher', 'substitute', 'admin') or null
   */
  function getCurrentPageRole() {
    const pathname = window.location.pathname.toLowerCase();
    
    // Map of path prefixes to roles (order matters - checked sequentially)
    const pathRoleMap = [
      { prefix: '/student', role: 'student' },
      { prefix: '/sub', role: 'substitute' },
      { prefix: '/admin', role: 'admin' },
      { prefix: '/hub', role: 'teacher' },
      { prefix: '/teacher', role: 'teacher' }
    ];
    
    // Check page-based role first (highest priority)
    for (const { prefix, role } of pathRoleMap) {
      if (pathname.startsWith(prefix)) return role;
    }
    
    // For other pages, check sessionStorage for active role (student portal uses sessionStorage)
    try {
      const sessionRole = sessionStorage.getItem('rc_user_role');
      if (sessionRole) return sessionRole;
    } catch (err) {
      // sessionStorage not available
    }
    
    // Fall back to localStorage auth
    try {
      const authStr = localStorage.getItem('rc_auth');
      if (authStr) {
        const auth = JSON.parse(authStr);
        if (auth && auth.role) return auth.role;
      }
    } catch (err) {
      // localStorage not available or invalid
    }
    
    return null;
  }

  /**
   * Update auth state in UI
   * Phase 302C: Added defensive null-checks for optional UI elements
   * PR-student-portal-fallback: Use page context for role display (no teacher bleed on student pages)
   */
  function updateAuthState() {
    const rail = document.querySelector('.app-shell-rail');
    if (!rail) return;

    try {
      const authStr = localStorage.getItem('rc_auth');
      const auth = authStr ? JSON.parse(authStr) : null;
      const isAuthed = auth && auth.role && auth.code && (!auth.expiresAt || Date.now() < auth.expiresAt);
      
      // PR-student-portal-fallback: Get role from page context (not just auth)
      const pageRole = getCurrentPageRole();

      // Phase 302C: Defensive - Update sign out button visibility if present
      const signOutBtn = rail.querySelector('[data-shell-action="signout"]');
      if (signOutBtn) {
        // Show sign out if there's any authentication (page role or auth)
        // Note: pageRole alone means user is on a role-specific page (e.g., /student/)
        // and should have sign out available even if rc_auth isn't set (session-only auth)
        if (isAuthed || pageRole) {
          signOutBtn.classList.remove('app-shell-hidden');
        } else {
          signOutBtn.classList.add('app-shell-hidden');
        }
      }

      // Phase 302C: Defensive - Update admin link visibility if present (only for admin role)
      const adminLink = rail.querySelector('[data-admin-only]');
      if (adminLink) {
        // Show Admin link if authenticated as admin (or already on an admin page)
        const isAdminAuthed = isAuthed && auth && auth.role === 'admin';
        if (pageRole === 'admin' || isAdminAuthed) {
          adminLink.classList.remove('app-shell-hidden');
        } else {
          adminLink.classList.add('app-shell-hidden');
        }
      }
      // Phase 302C: Defensive - Update status if element present
      // PR-student-portal-fallback: Use page role for display (prevents "Signed in as Teacher" on student pages)
      const status = rail.querySelector('[data-shell-status]');
      if (status && (isAuthed || pageRole)) {
        // Use page role if available (overrides auth role), otherwise fall back to auth role
        const displayRole = pageRole || (auth && auth.role);
        if (displayRole) {
          const roleLabel = displayRole.charAt(0).toUpperCase() + displayRole.slice(1);
          status.innerHTML = `<span>Signed in as ${roleLabel}</span>`;
        }
      }
    } catch (err) {
      debugError('[app-shell] Error updating auth state:', err);
    }
  }

  /**
   * Toggle presentation mode
   */
  function togglePresentationMode() {
    const isActive = document.body.classList.contains('presentation-mode');
    
    if (isActive) {
      // Exit presentation mode
      document.body.classList.remove('presentation-mode');
      localStorage.removeItem('presentation-mode');
      
      // Exit fullscreen if active
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      
      debugLog('[app-shell] Exited presentation mode');
    } else {
      // Enter presentation mode
      document.body.classList.add('presentation-mode');
      localStorage.setItem('presentation-mode', 'true');
      
      debugLog('[app-shell] Entered presentation mode');
    }
    
    // Dispatch event for other components to react
    window.dispatchEvent(new CustomEvent('presentation-mode-changed', {
      detail: { active: !isActive }
    }));
  }

  /**
   * Request fullscreen mode
   */
  function requestFullscreen() {
    const elem = document.documentElement;
    
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err) => {
        debugWarn('[app-shell] Could not enter fullscreen:', err);
      });
    }
  }

  /**
   * Initialize presentation mode from localStorage
   */
  function initPresentationMode() {
    const isPresentationMode = localStorage.getItem('presentation-mode') === 'true';
    if (isPresentationMode) {
      document.body.classList.add('presentation-mode');
    }
  }

  /**
   * Load lessons data from manifest
   */
  async function loadLessonsData() {
    try {
      const response = await fetch('/assets/content/lessons-index.json?ts=' + Date.now(), { cache: 'no-store' });
      if (response.ok) {
        lessonsData = await response.json();
        debugLog('[app-shell] Loaded lessons data');
      } else {
        debugWarn('[app-shell] Failed to load lessons data:', response.status);
      }
    } catch (err) {
      debugWarn('[app-shell] Error loading lessons data:', err);
    }
  }

  /**
   * Create lessons navigator panel
   */
  function createLessonsNavigator() {
    const navigator = document.createElement('div');
    navigator.className = 'lessons-navigator';
    navigator.setAttribute('aria-label', 'Lessons navigator');
    navigator.innerHTML = `
      <div class="lessons-navigator-header">
        <h2 class="lessons-navigator-title">Lessons</h2>
        <button class="lessons-navigator-close" aria-label="Close navigator">×</button>
      </div>
      <div class="lessons-navigator-content">
        <div class="lessons-loading">Loading lessons...</div>
      </div>
    `;
    document.body.appendChild(navigator);

    // Close button handler
    const closeBtn = navigator.querySelector('.lessons-navigator-close');
    closeBtn.addEventListener('click', closeLessonsNavigator);

    // Close on outside click
    navigator.addEventListener('click', (e) => {
      if (e.target === navigator) {
        closeLessonsNavigator();
      }
    });
  }

  /**
   * Toggle lessons navigator visibility
   */
  function toggleLessonsNavigator() {
    const navigator = document.querySelector('.lessons-navigator');
    if (!navigator) return;

    const isOpen = navigator.classList.contains('open');
    
    if (isOpen) {
      closeLessonsNavigator();
    } else {
      openLessonsNavigator();
    }
  }

  /**
   * Open lessons navigator
   */
  function openLessonsNavigator() {
    const navigator = document.querySelector('.lessons-navigator');
    if (!navigator) return;

    navigator.classList.add('open');
    
    // Update rail button state
    const lessonsBtn = document.querySelector('[data-shell-nav="lessons"]');
    if (lessonsBtn) {
      lessonsBtn.classList.add('active');
      lessonsBtn.setAttribute('aria-expanded', 'true');
    }

    // Render content if we have data (hydrate titles + hide stale entries once)
    if (lessonsData) {
      if (lessonsDataHydrated) {
        renderLessonsContent();
      } else {
        const content = navigator.querySelector('.lessons-navigator-content');
        if (content) content.innerHTML = '<div class="lessons-loading">Loading lessons...</div>';

        normalizeLessonsData(lessonsData)
          .then((normalized) => {
            lessonsData = normalized;
            lessonsDataHydrated = true;
            renderLessonsContent();
          })
          .catch((err) => {
            lessonsDataHydrated = true;
            debugWarn('[app-shell] Lessons normalize failed:', err);
            renderLessonsContent();
          });
      }
    }
  }

  /**
   * Close lessons navigator
   */
  function closeLessonsNavigator() {
    const navigator = document.querySelector('.lessons-navigator');
    if (!navigator) return;

    navigator.classList.remove('open');
    
    // Update rail button state
    const lessonsBtn = document.querySelector('[data-shell-nav="lessons"]');
    if (lessonsBtn) {
      lessonsBtn.classList.remove('active');
      lessonsBtn.setAttribute('aria-expanded', 'false');
    }
  }

  /**
   * Render lessons navigator content
   */
  
  // Lessons sidebar hardening:
  // - Hide entries whose URLs no longer exist (stale index entries)
  // - Replace generic names ("Presentation 7") with the page <title>
  // - Hide units with zero existing presentations
  // - Run once per page load (cached in-memory)
  let lessonsDataHydrated = false;

  function decodeHtmlEntities(str) {
    try {
      const txt = document.createElement('textarea');
      txt.innerHTML = String(str || '');
      return txt.value;
    } catch (_) {
      return String(str || '');
    }
  }

  function looksGenericPresentationName(name) {
    const n = String(name || '').trim();
    return /^presentation\s+\d+$/i.test(n) || n.toLowerCase() === 'open' || n === '';
  }

  async function fetchTitleFromPage(url) {
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (!m) return null;
      return decodeHtmlEntities(m[1].trim());
    } catch (_) {
      return null;
    }
  }

  async function urlLooksAlive(url) {
    try {
      const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (head.ok) return true;
      if (head.status !== 405 && head.status !== 403) return false;
    } catch (_) {
      // fall through to GET
    }
    try {
      const get = await fetch(url, { method: 'GET', cache: 'no-store' });
      return !!get.ok;
    } catch (_) {
      return false;
    }
  }

  async function normalizeLessonsData(data) {
    const clone = JSON.parse(JSON.stringify(data || {}));
    const sections = Array.isArray(clone.sections) ? clone.sections : [];

    for (const section of sections) {
      const units = Array.isArray(section.units) ? section.units : [];
      const cleanedUnits = [];

      for (const unit of units) {
        const pres = Array.isArray(unit.presentations) ? unit.presentations : [];
        const cleanedPres = [];

        for (const presItem of pres) {
          const url = presItem && presItem.url ? String(presItem.url) : '';
          if (!url) continue;

          const exists = await urlLooksAlive(url);
          if (!exists) continue;

          if (looksGenericPresentationName(presItem.name)) {
            const title = await fetchTitleFromPage(url);
            if (title) presItem.name = title;
          }

          cleanedPres.push(presItem);
        }

        // Hide empty units (no existing presentations)
        if (cleanedPres.length > 0) {
          unit.presentations = cleanedPres;
          cleanedUnits.push(unit);
        }
      }

      section.units = cleanedUnits;
    }

    return clone;
  }

  function renderLessonsContent() {
    const content = document.querySelector('.lessons-navigator-content');
    if (!content || !lessonsData) return;

    // Clear content
    content.innerHTML = '';

    // Render sections
    for (const section of lessonsData.sections) {
      const sectionDiv = document.createElement('div');
      sectionDiv.className = 'lessons-section';
      
      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'lessons-section-title';
      sectionTitle.textContent = section.name;
      sectionDiv.appendChild(sectionTitle);
      
      // Render units
      if (section.units && section.units.length > 0) {
        for (const unit of section.units) {
          const unitDiv = document.createElement('div');
          unitDiv.className = 'lessons-unit';
          
          const unitTitle = document.createElement('div');
          unitTitle.className = 'lessons-unit-title';
          unitTitle.textContent = unit.name;
          unitDiv.appendChild(unitTitle);
          
          // Render presentations
          if (unit.presentations && unit.presentations.length > 0) {
            const presContainer = document.createElement('div');
            presContainer.className = 'lessons-presentations';
            
            for (const pres of unit.presentations) {
              const btn = document.createElement('button');
              btn.className = 'lessons-presentation';
              btn.textContent = pres.name;
              btn.dataset.section = section.id;
              btn.dataset.unit = unit.id;
              btn.dataset.presentation = pres.id;
              btn.dataset.url = pres.url;
              
              btn.addEventListener('click', () => {
                openPresentationViewer(pres.url, section.id, unit.id, pres.id);
              });
              
              presContainer.appendChild(btn);
            }
            
            unitDiv.appendChild(presContainer);
          }
          
          sectionDiv.appendChild(unitDiv);
        }
      } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'lessons-empty';
        emptyMsg.textContent = 'No units available yet';
        emptyMsg.setAttribute('role', 'status');
        sectionDiv.appendChild(emptyMsg);
      }
      
      content.appendChild(sectionDiv);
    }
  }

  /**
   * Create presentation viewer
   */
  function createPresentationViewer() {
    const viewer = document.createElement('div');
    viewer.className = 'presentation-viewer';
    viewer.innerHTML = `
      <div class="presentation-viewer-controls">
        <button class="presentation-viewer-btn" data-viewer-action="close">Close</button>
        <button class="presentation-viewer-btn" data-viewer-action="presentation-mode">Presentation Mode</button>
        <button class="presentation-viewer-btn" data-viewer-action="fullscreen">Full screen</button>
      </div>
      <div class="presentation-viewer-frame">
        <iframe class="presentation-iframe" 
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" 
          allowfullscreen
          title="Presentation content"></iframe>
      </div>
    `;
    document.body.appendChild(viewer);

    // Note: allow-same-origin is required because presentations are interactive HTML
    // from the same domain that need access to their resources and scripts.

    // Control button handlers
    viewer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-viewer-action]');
      if (!btn) return;

      const action = btn.dataset.viewerAction;
      
      if (action === 'close') {
        closePresentationViewer();
      } else if (action === 'presentation-mode') {
        togglePresentationMode();
      } else if (action === 'fullscreen') {
        requestFullscreen();
      }
    });
  }

  /**
   * Open presentation viewer
   */
  function openPresentationViewer(url, section, unit, presentation) {
    const viewer = document.querySelector('.presentation-viewer');
    if (!viewer) return;

    const iframe = viewer.querySelector('.presentation-iframe');
    if (!iframe) return;

    // Update state
    viewerState = {
      isOpen: true,
      currentUrl: url,
      section: section,
      unit: unit,
      presentation: presentation
    };

    // Load presentation in iframe
    iframe.src = url;

    // Show viewer
    viewer.classList.add('open');
    document.body.classList.add('viewer-open');

    // Update URL with query params
    updateViewerUrl();

    // Close navigator
    closeLessonsNavigator();

    debugLog('[app-shell] Opened presentation:', url);
  }

  /**
   * Close presentation viewer
   */
  function closePresentationViewer() {
    const viewer = document.querySelector('.presentation-viewer');
    if (!viewer) return;

    const iframe = viewer.querySelector('.presentation-iframe');
    if (!iframe) return;

    // Update state
    viewerState = {
      isOpen: false,
      currentUrl: null,
      section: null,
      unit: null,
      presentation: null
    };

    // Clear iframe
    iframe.src = '';

    // Hide viewer
    viewer.classList.remove('open');
    document.body.classList.remove('viewer-open');

    // Update URL (remove query params)
    const url = new URL(window.location);
    url.searchParams.delete('viewer');
    url.searchParams.delete('section');
    url.searchParams.delete('unit');
    url.searchParams.delete('presentation');
    window.history.pushState({}, '', url.toString());

    // PR 310: Dispatch event and cleanup scroll-lock (uses shared utility)
    window.dispatchEvent(new CustomEvent('viewer:closed'));
    if (window.ScrollLockCleanup) {
      window.ScrollLockCleanup.schedule();
    }

    debugLog('[app-shell] Closed presentation viewer');
  }

  /**
   * Update URL with viewer state
   */
  function updateViewerUrl() {
    if (!viewerState.isOpen) return;

    const url = new URL(window.location);
    url.searchParams.set('viewer', '1');
    url.searchParams.set('section', viewerState.section);
    url.searchParams.set('unit', viewerState.unit);
    url.searchParams.set('presentation', viewerState.presentation);
    
    window.history.pushState({ viewer: viewerState }, '', url.toString());
  }

  /**
   * Initialize deep linking (restore state from URL params)
   */
  function initDeepLinking() {
    const params = new URLSearchParams(window.location.search);
    const viewer = params.get('viewer');
    
    if (viewer === '1') {
      const section = params.get('section');
      const unit = params.get('unit');
      const presentation = params.get('presentation');
      
      // Wait for lessons data to load with less aggressive polling
      const checkData = setInterval(() => {
        if (lessonsData) {
          clearInterval(checkData);
          
          // Find the presentation URL
          const sectionData = lessonsData.sections.find(s => s.id === section);
          if (sectionData) {
            const unitData = sectionData.units.find(u => u.id === unit);
            if (unitData) {
              const presData = unitData.presentations.find(p => p.id === presentation);
              if (presData) {
                openPresentationViewer(presData.url, section, unit, presentation);
              }
            }
          }
        }
      }, DEEP_LINK_CHECK_INTERVAL);
      
      // Timeout to prevent infinite polling
      setTimeout(() => clearInterval(checkData), DEEP_LINK_TIMEOUT);
    }

    // Handle popstate for back/forward
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.viewer) {
        const { section, unit, presentation, currentUrl } = e.state.viewer;
        openPresentationViewer(currentUrl, section, unit, presentation);
      } else {
        // No viewer state, close if open
        if (viewerState.isOpen) {
          closePresentationViewer();
        }
      }
    });
  }

  /**
   * Public API
   */
  window.AppShell = {
    init: initAppShell,
    updateAuthState: updateAuthState,
    togglePresentationMode: togglePresentationMode,
    requestFullscreen: requestFullscreen,
    openPresentationViewer: openPresentationViewer,
    closePresentationViewer: closePresentationViewer,
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAppShell();
      initPresentationMode();
    });
  } else {
    initAppShell();
    initPresentationMode();
  }

  // Listen for auth changes
  window.addEventListener('storage', (e) => {
    if (e.key === 'rc_auth') {
      updateAuthState();
    }
  });
})();


// rc:auth-ui-verify-v1
// Goal: Don't lie about auth state based solely on localStorage. Verify server session before showing Sign Out.
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const findFooterEls = () => {
    const signOutBtn =
      document.querySelector('[data-rc-signout]') ||
      document.querySelector('#btnSignOut') ||
      document.querySelector('.btn-signout') ||
      document.querySelector('.signout-btn');
    const statusEl =
      document.querySelector('[data-rc-auth-status]') ||
      document.querySelector('#rcAuthStatus') ||
      document.querySelector('#authStatus') ||
      document.querySelector('.auth-status');
    return { signOutBtn, statusEl };
  };

  const setUI = (signedIn, label) => {
    const { signOutBtn, statusEl } = findFooterEls();
    if (signOutBtn) signOutBtn.style.display = signedIn ? '' : 'none';
    if (statusEl) statusEl.textContent = signedIn ? `Signed in as: ${label}` : 'Not signed in';
  };

  const checkSession = async (url) => {
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (res.status === 200) return true;
      if (res.status === 401 || res.status === 403) return false;
      return false;
    } catch {
      return false;
    }
  };

  const detectRoleSession = async () => {
    const path = location.pathname || '';
    const candidates = [];

    if (path.startsWith('/teacher')) candidates.push(['Teacher', '/.netlify/functions/teacher-session']);
    if (path.startsWith('/admin')) candidates.push(['Admin', '/.netlify/functions/admin-session']);
    if (path.startsWith('/sub')) candidates.push(['Substitute', '/.netlify/functions/substitute-session']);

    if (path.startsWith('/hub')) {
      candidates.push(['Teacher', '/.netlify/functions/teacher-session']);
      candidates.push(['Admin', '/.netlify/functions/admin-session']);
      candidates.push(['Substitute', '/.netlify/functions/substitute-session']);
    }

    if (candidates.length === 0) {
      candidates.push(['Teacher', '/.netlify/functions/teacher-session']);
    }

    for (const [label, url] of candidates) {
      const ok = await checkSession(url);
      if (ok) return { signedIn: true, label };
    }
    return { signedIn: false, label: '' };
  };

  const run = async () => {
    // Wait briefly for shell DOM to exist (app-shell injects itself)
    for (let i = 0; i < 10; i++) {
      const { signOutBtn, statusEl } = findFooterEls();
      if (signOutBtn || statusEl) break;
      await sleep(100);
    }

    const r = await detectRoleSession();
    setUI(r.signedIn, r.label || 'User');

    if (!r.signedIn) {
      localStorage.removeItem('rc_role');
      localStorage.removeItem('rcRole');
    }
  };

  run().catch((e) => {
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('[rc:auth-ui-verify-v1] boot error:', e);
    }
  });
})();
// ==== rc:auth-ui-verify-v1 ====
// Goal: Don't lie about auth state based only on localStorage.
// Default to signed-out UI; only show Sign Out after confirming a real session.


// rc:brand-home — Make the brand act like “Return to Home”
(function rcBrandHome(){
  try {
    const bind = () => {
      const brand = document.querySelector('.app-shell-brand');
      if (!brand) return;
      if (brand.dataset && brand.dataset.rcHomeBound === "1") return;
      if (brand.dataset) brand.dataset.rcHomeBound = "1";
      brand.style.cursor = 'pointer';
      brand.title = 'Return to Home';
      brand.addEventListener('click', () => { window.location.href = '/'; });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  } catch (e) {
    console.warn('[rc:brand-home] failed:', e);
  }
})();
