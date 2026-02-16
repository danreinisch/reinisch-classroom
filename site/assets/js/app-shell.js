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
  const DESKTOP_BREAKPOINT = 768; // px - mobile/desktop threshold
  const SIDEBAR_AUTO_CLOSE_DURATION = 7000; // ms - time before sidebar auto-closes
  const SIDEBAR_FADE_DURATION = 300; // ms - opacity fade duration when closing

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

  // Sidebar auto-close state
  let sidebarAutoCloseTimer = null;
  let sidebarAutoCloseBar = null;

  // Lessons navigator accordion state persistence
  const LESSONS_NAV_STATE_KEY = 'rc_lessons_nav_state';
  
  // Helper to load lessons nav state from localStorage
  function loadLessonsNavState() {
    try {
      const stored = localStorage.getItem(LESSONS_NAV_STATE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      debugWarn('[app-shell] Failed to load lessons nav state:', e);
    }
    return { expandedSections: [], expandedUnits: {}, expandedGroups: {} };
  }

  // Helper to save lessons nav state to localStorage
  function saveLessonsNavState(state) {
    try {
      localStorage.setItem(LESSONS_NAV_STATE_KEY, JSON.stringify(state));
    } catch (e) {
      debugWarn('[app-shell] Failed to save lessons nav state:', e);
    }
  }

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

    // On viewer pages, ensure rail doesn't have .open class
    // This prevents CSS override (body.app-shell-icon-only .app-shell-rail.open sets width to 260px)
    // Even though createShell() doesn't add .open, we remove it as a safeguard against
    // other initialization paths or future changes
    if (isViewerPage()) {
      shell.classList.remove('open');
    }

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
      document.body.classList.remove('app-shell-rail-expanded');
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
   * Check if current page is a viewer page
   */
  function isViewerPage() {
    const pathname = window.location.pathname;
    return pathname === '/viewer' || pathname.startsWith('/viewer/');
  }

  /**
   * Check if inline viewer is active (via ?viewer=1 query parameter)
   */
  function isInlineViewer() {
    const params = new URLSearchParams(window.location.search);
    return params.get('viewer') === '1';
  }

  /**
   * Detect if current page is a presentation context and add appropriate body class
   */
  function detectPresentationContext() {
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const hasViewerParam = params.get('viewer') === '1';
    
    // Check if we're on a presentation page or viewer page
    // Match: /presentations/... or /life-skills/presentations/... (but not exactly /presentations/)
    // Also match: /viewer/ paths
    // Also match: ?viewer=1 query parameter (inline viewer)
    const isPresentation = 
      (pathname.includes('/presentations/') && pathname !== '/presentations/') ||
      pathname.includes('/life-skills/presentations/') ||
      isViewerPage() ||
      hasViewerParam;
    
    if (isPresentation) {
      document.body.classList.add('rc-presentation-active');
      // Only add icon-only on desktop; mobile keeps existing behavior
      if (window.innerWidth > DESKTOP_BREAKPOINT) {
        document.body.classList.add('app-shell-icon-only');
      }
      debugLog('[app-shell] Detected presentation context');
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
        <!-- Home -->
        <a href="/" class="app-shell-item" data-shell-nav="home">
          <span class="app-shell-item-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 10l7-7 7 7M4 9v9h4v-5h4v5h4V9"/>
            </svg>
          </span>
          <span class="app-shell-item-label">Home</span>
        </a>

        <!-- Lessons -->
        <button class="app-shell-item" data-shell-nav="lessons" aria-expanded="false">
          <span class="app-shell-item-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 4h12v12H4z M4 8h12"/>
            </svg>
          </span>
          <span class="app-shell-item-label">Lessons</span>
          <span class="app-shell-item-arrow">▶</span>
        </button>
        <div class="app-shell-submenu" data-shell-submenu="lessons">
          <a href="/language-arts/" class="app-shell-submenu-item">Language Arts</a>
          <a href="/life-skills/" class="app-shell-submenu-item">Life Skills</a>
        </div>

        <!-- Toolkits -->
        <button class="app-shell-item" data-shell-nav="toolkits" aria-expanded="false">
          <span class="app-shell-item-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </span>
          <span class="app-shell-item-label">Toolkits</span>
          <span class="app-shell-item-arrow">▶</span>
        </button>
        <div class="app-shell-submenu" data-shell-submenu="toolkits">
          <a href="/language-arts/toolkit/" class="app-shell-submenu-item">Language Arts Toolkit</a>
          <a href="/math-toolkit/" class="app-shell-submenu-item">Math Toolkit</a>
        </div>

        <!-- Teacher -->
        <button class="app-shell-item" data-shell-nav="teacher" data-requires-auth="teacher" aria-expanded="false">
          <span class="app-shell-item-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0"/>
            </svg>
          </span>
          <span class="app-shell-item-label">Teacher</span>
          <span class="app-shell-item-arrow">▶</span>
        </button>
        <div class="app-shell-submenu" data-shell-submenu="teacher">
          <a href="/teacher/work/" class="app-shell-submenu-item">Teacher Center</a>
          <a href="/teacher/admin/" class="app-shell-submenu-item app-shell-hidden" data-admin-only>Admin</a>
        </div>

        <!-- Student -->
        <button class="app-shell-item" data-shell-nav="student" data-requires-auth="student">
          <span class="app-shell-item-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 7l8-4 8 4M2 7l8 4M2 7v10l8 4m0-14l8 4m-8-4v14m8-10v10l-8 4"/>
            </svg>
          </span>
          <span class="app-shell-item-label">Student</span>
        </button>

        <!-- Substitute -->
        <button class="app-shell-item" data-shell-nav="substitute" data-requires-auth="substitute">
          <span class="app-shell-item-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V4a2 2 0 0 0-2-2z M10 8h4M10 12h4M6 8h.01M6 12h.01"/>
            </svg>
          </span>
          <span class="app-shell-item-label">Substitute</span>
        </button>
      </div>

      <div class="app-shell-footer">
        <button class="app-shell-footer-btn app-shell-hidden" data-shell-action="signout">
          <span class="app-shell-item-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </span>
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

    // Close rail when clicking outside (mobile + icon-only expanded mode)
    document.addEventListener('click', (e) => {
      const lessonsNav = document.querySelector('.lessons-navigator');
      
      // On mobile, close rail if clicked outside
      if (window.innerWidth <= 768) {
        if (!rail.contains(e.target) && (!toggle || !toggle.contains(e.target))) {
          rail.classList.remove('open');
        }
        return;
      }
      
      // On desktop in icon-only mode, close expanded rail if clicked outside
      if (document.body.classList.contains('app-shell-icon-only') && rail.classList.contains('open')) {
        if (!rail.contains(e.target) && (!toggle || !toggle.contains(e.target))) {
          rail.classList.remove('open');
          document.body.classList.remove('app-shell-rail-expanded');
          // Also close lessons navigator if open
          if (lessonsNav) {
            lessonsNav.classList.remove('open');
          }
          // Clear auto-close timer
          clearSidebarAutoClose();
        }
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

      // Check if we're in icon-only mode and rail is not expanded
      const isIconOnly = document.body.classList.contains('app-shell-icon-only') && !rail.classList.contains('open');
      
      if (isIconOnly) {
        // In icon-only mode, first click expands the rail
        rail.classList.add('open');
        document.body.classList.add('app-shell-rail-expanded');
        
        // Start auto-close timer
        startSidebarAutoClose();
        
        // For items with submenus (lessons, toolkits, teacher), just expand
        // For direct nav items (student, substitute), expand then proceed to navigate
        if (navId === 'student' || navId === 'substitute') {
          // Let these fall through to the navigation code below
        } else {
          // For lessons and toolkits, stop here - let them open submenu on next click
          return;
        }
      }

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

    // Add event listeners to reset auto-close timer on user interaction
    rail.addEventListener('mousemove', resetSidebarAutoClose);
    rail.addEventListener('click', resetSidebarAutoClose);
    rail.addEventListener('scroll', resetSidebarAutoClose);
    
    // Also reset on lessons navigator interaction
    const lessonsNav = document.querySelector('.lessons-navigator');
    if (lessonsNav) {
      lessonsNav.addEventListener('mousemove', resetSidebarAutoClose);
      lessonsNav.addEventListener('click', resetSidebarAutoClose);
      lessonsNav.addEventListener('scroll', resetSidebarAutoClose);
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
        
        // On viewer pages or inline viewer, skip normalization to avoid network race conditions
        // The viewer page is already displaying a presentation and doesn't need URL probing
        if (isViewerPage() || isInlineViewer()) {
          lessonsDataHydrated = true;
          debugLog('[app-shell] Viewer/inline viewer detected - skipping lessons normalization');
        }
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
      // On viewer pages or inline viewer, skip normalization entirely to avoid HEAD probes
      // even if user clicks Lessons before loadLessonsData completes
      if ((isViewerPage() || isInlineViewer()) && !lessonsDataHydrated) {
        lessonsDataHydrated = true;
        debugLog('[app-shell] Viewer/inline viewer - skipping normalization on Lessons click');
        renderLessonsContent();
        return;
      }
      
      if (lessonsDataHydrated) {
        renderLessonsContent();
      } else {
        // On viewer pages or inline viewer, skip normalization entirely to avoid HEAD probes
        if (isViewerPage() || isInlineViewer()) {
          lessonsDataHydrated = true;
          debugLog('[app-shell] Viewer/inline viewer - skipping normalization in openLessonsNavigator');
          renderLessonsContent();
          return;
        }
        
        const content = navigator.querySelector('.lessons-navigator-content');
        if (content) content.innerHTML = '<div class="lessons-loading">Loading lessons...</div>';

        // Add timeout fallback: if normalization takes longer than 3 seconds, render with un-normalized data
        const normalizeTimeout = setTimeout(() => {
          if (!lessonsDataHydrated) {
            lessonsDataHydrated = true;
            debugWarn('[app-shell] Lessons normalize timed out after 3s, rendering with un-normalized data');
            renderLessonsContent();
          }
        }, 3000);

        normalizeLessonsData(lessonsData)
          .then((normalized) => {
            clearTimeout(normalizeTimeout);
            if (!lessonsDataHydrated) {
              lessonsData = normalized;
              lessonsDataHydrated = true;
              renderLessonsContent();
            }
          })
          .catch((err) => {
            clearTimeout(normalizeTimeout);
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
   * Start the sidebar auto-close timer (7 seconds)
   */
  function startSidebarAutoClose() {
    clearSidebarAutoClose();
    
    // Create/reset progress bar
    const rail = document.querySelector('.app-shell-rail');
    if (!rail) return;
    
    // Remove existing progress bar if any
    const existing = rail.querySelector('.sidebar-auto-close-bar');
    if (existing) existing.remove();
    
    // Create progress bar element
    const bar = document.createElement('div');
    bar.className = 'sidebar-auto-close-bar';
    // Insert as first child of rail
    rail.insertBefore(bar, rail.firstChild);
    sidebarAutoCloseBar = bar;
    
    // Force reflow then start animation
    bar.offsetWidth;
    bar.classList.add('running');
    
    // Set timer
    sidebarAutoCloseTimer = setTimeout(() => {
      closeSidebarFromAutoClose();
    }, SIDEBAR_AUTO_CLOSE_DURATION);
  }

  /**
   * Clear the sidebar auto-close timer and remove progress bar
   */
  function clearSidebarAutoClose() {
    if (sidebarAutoCloseTimer) {
      clearTimeout(sidebarAutoCloseTimer);
      sidebarAutoCloseTimer = null;
    }
    // Remove progress bar
    if (sidebarAutoCloseBar) {
      sidebarAutoCloseBar.remove();
      sidebarAutoCloseBar = null;
    }
  }

  /**
   * Reset the sidebar auto-close timer (user interacted)
   */
  function resetSidebarAutoClose() {
    // Only reset if in icon-only mode with expanded sidebar
    const rail = document.querySelector('.app-shell-rail');
    if (document.body.classList.contains('app-shell-icon-only') && 
        rail && rail.classList.contains('open')) {
      startSidebarAutoClose();
    }
  }

  /**
   * Close sidebar from auto-close timer expiring
   */
  function closeSidebarFromAutoClose() {
    const rail = document.querySelector('.app-shell-rail');
    if (rail) {
      // Add a brief opacity fade class for the last moment
      rail.classList.add('auto-closing');
      
      setTimeout(() => {
        rail.classList.remove('open');
        document.body.classList.remove('app-shell-rail-expanded');
        rail.classList.remove('auto-closing');
        closeLessonsNavigator();
        clearSidebarAutoClose();
      }, SIDEBAR_FADE_DURATION); // Fade duration for the opacity fade
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

    // Load saved state
    const navState = loadLessonsNavState();

    // Clear content
    content.innerHTML = '';

    // Render sections with accordion behavior
    for (const section of lessonsData.sections) {
      // Generate section ID from name for state tracking
      const sectionId = section.name.toLowerCase().replace(/\s+/g, '-');
      const isSectionExpanded = navState.expandedSections.includes(sectionId);

      const sectionDiv = document.createElement('div');
      sectionDiv.className = 'lessons-section';
      sectionDiv.dataset.sectionId = sectionId;

      // Section header with arrow indicator
      const sectionHeader = document.createElement('button');
      sectionHeader.className = 'lessons-section-title';
      sectionHeader.setAttribute('aria-expanded', isSectionExpanded ? 'true' : 'false');
      
      const sectionArrow = document.createElement('span');
      sectionArrow.className = 'lessons-arrow';
      sectionArrow.textContent = '▸';
      if (isSectionExpanded) {
        sectionArrow.style.transform = 'rotate(90deg)';
      }
      
      const sectionName = document.createElement('span');
      sectionName.textContent = section.name;
      
      sectionHeader.appendChild(sectionArrow);
      sectionHeader.appendChild(sectionName);
      
      // Toggle section on click
      sectionHeader.addEventListener('click', () => {
        const isExpanded = sectionHeader.getAttribute('aria-expanded') === 'true';
        const newExpanded = !isExpanded;
        
        sectionHeader.setAttribute('aria-expanded', newExpanded ? 'true' : 'false');
        unitsContainer.classList.toggle('open', newExpanded);
        
        // Rotate arrow
        if (newExpanded) {
          sectionArrow.style.transform = 'rotate(90deg)';
        } else {
          sectionArrow.style.transform = 'rotate(0deg)';
        }
        
        // Save state
        const state = loadLessonsNavState();
        if (newExpanded) {
          if (!state.expandedSections.includes(sectionId)) {
            state.expandedSections.push(sectionId);
          }
        } else {
          state.expandedSections = state.expandedSections.filter(s => s !== sectionId);
          // Clear expanded unit for this section
          delete state.expandedUnits[sectionId];
          // Clear expanded groups for units in this section
          if (section.units) {
            for (const unit of section.units) {
              delete state.expandedGroups?.[unit.id];
            }
          }
        }
        saveLessonsNavState(state);
      });
      
      sectionDiv.appendChild(sectionHeader);

      // Container for units (collapsible)
      const unitsContainer = document.createElement('div');
      unitsContainer.className = 'lessons-units-container';
      if (isSectionExpanded) {
        unitsContainer.classList.add('open');
      }

      // Render units
      if (section.units && section.units.length > 0) {
        const expandedUnitId = navState.expandedUnits[sectionId];

        for (const unit of section.units) {
          const isUnitExpanded = expandedUnitId === unit.id;

          const unitDiv = document.createElement('div');
          unitDiv.className = 'lessons-unit';
          unitDiv.dataset.unitId = unit.id;

          // Unit header with arrow indicator
          const unitHeader = document.createElement('button');
          unitHeader.className = 'lessons-unit-title';
          unitHeader.setAttribute('aria-expanded', isUnitExpanded ? 'true' : 'false');
          
          const unitArrow = document.createElement('span');
          unitArrow.className = 'lessons-arrow';
          unitArrow.textContent = '▸';
          if (isUnitExpanded) {
            unitArrow.style.transform = 'rotate(90deg)';
          }
          
          const unitName = document.createElement('span');
          unitName.textContent = unit.name;
          
          unitHeader.appendChild(unitArrow);
          unitHeader.appendChild(unitName);

          unitDiv.appendChild(unitHeader);

          // Render presentations (collapsible) - create container first
          const presContainer = document.createElement('div');
          presContainer.className = 'lessons-unit-items';
          if (isUnitExpanded) {
            presContainer.classList.add('open');
          }

          // Check if unit has groups
          if (unit.groups && unit.groups.length > 0) {
            // Render groups with accordion behavior
            const expandedGroupId = navState.expandedGroups?.[unit.id];
            
            // Create a map of presentations for quick lookup
            const presMap = new Map();
            if (unit.presentations && unit.presentations.length > 0) {
              for (const pres of unit.presentations) {
                presMap.set(pres.id, pres);
              }
            }

            for (const group of unit.groups) {
              const isGroupExpanded = expandedGroupId === group.id;

              const groupDiv = document.createElement('div');
              groupDiv.className = 'lessons-group';
              groupDiv.dataset.groupId = group.id;

              // Group header with arrow indicator
              const groupHeader = document.createElement('button');
              groupHeader.className = 'lessons-group-title';
              groupHeader.setAttribute('aria-expanded', isGroupExpanded ? 'true' : 'false');
              
              const groupArrow = document.createElement('span');
              groupArrow.className = 'lessons-arrow';
              groupArrow.textContent = '▸';
              if (isGroupExpanded) {
                groupArrow.style.transform = 'rotate(90deg)';
              }
              
              const groupName = document.createElement('span');
              groupName.textContent = group.name;
              
              groupHeader.appendChild(groupArrow);
              groupHeader.appendChild(groupName);

              groupDiv.appendChild(groupHeader);

              // Container for presentations within this group
              const groupItemsContainer = document.createElement('div');
              groupItemsContainer.className = 'lessons-group-items';
              if (isGroupExpanded) {
                groupItemsContainer.classList.add('open');
              }

              // Render presentations in this group
              if (group.presentationIds && group.presentationIds.length > 0) {
                for (const presId of group.presentationIds) {
                  const pres = presMap.get(presId);
                  if (!pres) continue;

                  const btn = document.createElement('button');
                  btn.className = 'lessons-presentation';
                  btn.textContent = pres.name;
                  btn.dataset.section = sectionId;
                  btn.dataset.unit = unit.id;
                  btn.dataset.presentation = pres.id;
                  btn.dataset.url = pres.url;

                  btn.addEventListener('click', () => {
                    openPresentationViewer(pres.url, sectionId, unit.id, pres.id);
                  });

                  groupItemsContainer.appendChild(btn);
                }
              }

              groupDiv.appendChild(groupItemsContainer);

              // Toggle group on click (accordion-style: close others in same unit)
              groupHeader.addEventListener('click', () => {
                const isExpanded = groupHeader.getAttribute('aria-expanded') === 'true';
                const newExpanded = !isExpanded;

                // If opening this group, close any other open group in this unit (accordion behavior)
                if (newExpanded) {
                  const otherGroups = presContainer.querySelectorAll('.lessons-group');
                  otherGroups.forEach(otherGroup => {
                    if (otherGroup !== groupDiv) {
                      const otherHeader = otherGroup.querySelector('.lessons-group-title');
                      const otherArrow = otherGroup.querySelector('.lessons-arrow');
                      const otherItemsContainer = otherGroup.querySelector('.lessons-group-items');
                      
                      if (otherHeader) otherHeader.setAttribute('aria-expanded', 'false');
                      if (otherArrow) otherArrow.style.transform = 'rotate(0deg)';
                      if (otherItemsContainer) otherItemsContainer.classList.remove('open');
                    }
                  });
                }

                groupHeader.setAttribute('aria-expanded', newExpanded ? 'true' : 'false');
                groupItemsContainer.classList.toggle('open', newExpanded);

                // Rotate arrow
                if (newExpanded) {
                  groupArrow.style.transform = 'rotate(90deg)';
                } else {
                  groupArrow.style.transform = 'rotate(0deg)';
                }

                // Save state
                const state = loadLessonsNavState();
                if (!state.expandedGroups) state.expandedGroups = {};
                if (newExpanded) {
                  state.expandedGroups[unit.id] = group.id;
                } else {
                  delete state.expandedGroups[unit.id];
                }
                saveLessonsNavState(state);
              });

              presContainer.appendChild(groupDiv);
            }
          } else if (unit.presentations && unit.presentations.length > 0) {
            // No groups - render presentations directly (Language Arts behavior)
            for (const pres of unit.presentations) {
              const btn = document.createElement('button');
              btn.className = 'lessons-presentation';
              btn.textContent = pres.name;
              btn.dataset.section = sectionId;
              btn.dataset.unit = unit.id;
              btn.dataset.presentation = pres.id;
              btn.dataset.url = pres.url;

              btn.addEventListener('click', () => {
                openPresentationViewer(pres.url, sectionId, unit.id, pres.id);
              });

              presContainer.appendChild(btn);
            }
          }

          unitDiv.appendChild(presContainer);

          // Toggle unit on click (accordion-style: close others in same section)
          unitHeader.addEventListener('click', () => {
            const isExpanded = unitHeader.getAttribute('aria-expanded') === 'true';
            const newExpanded = !isExpanded;

            // If opening this unit, close any other open unit in this section (accordion behavior)
            if (newExpanded) {
              const otherUnits = unitsContainer.querySelectorAll('.lessons-unit');
              otherUnits.forEach(otherUnit => {
                if (otherUnit !== unitDiv) {
                  const otherHeader = otherUnit.querySelector('.lessons-unit-title');
                  const otherArrow = otherUnit.querySelector('.lessons-arrow');
                  const otherPresContainer = otherUnit.querySelector('.lessons-unit-items');
                  
                  if (otherHeader) otherHeader.setAttribute('aria-expanded', 'false');
                  if (otherArrow) otherArrow.style.transform = 'rotate(0deg)';
                  if (otherPresContainer) otherPresContainer.classList.remove('open');
                }
              });
            }

            unitHeader.setAttribute('aria-expanded', newExpanded ? 'true' : 'false');
            presContainer.classList.toggle('open', newExpanded);

            // Rotate arrow
            if (newExpanded) {
              unitArrow.style.transform = 'rotate(90deg)';
            } else {
              unitArrow.style.transform = 'rotate(0deg)';
            }

            // Save state
            const state = loadLessonsNavState();
            if (newExpanded) {
              state.expandedUnits[sectionId] = unit.id;
            } else {
              delete state.expandedUnits[sectionId];
              // Clear expanded group for this unit
              delete state.expandedGroups?.[unit.id];
            }
            saveLessonsNavState(state);
          });

          unitsContainer.appendChild(unitDiv);
        }
      } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'lessons-empty';
        emptyMsg.textContent = 'No units available yet';
        emptyMsg.setAttribute('role', 'status');
        unitsContainer.appendChild(emptyMsg);
      }

      sectionDiv.appendChild(unitsContainer);
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
    // If we're on the dedicated viewer page, navigate to a new viewer URL
    // instead of opening the inline overlay (which conflicts with viewer.js)
    if (isViewerPage()) {
      // Close the expanded sidebar and lessons navigator before navigating
      closeLessonsNavigator();
      const rail = document.querySelector('.app-shell-rail');
      if (rail) {
        rail.classList.remove('open');
        document.body.classList.remove('app-shell-rail-expanded');
      }
      clearSidebarAutoClose();
      
      // Navigate to new viewer URL
      // Use buildViewerUrl if available (from open-in-viewer.js), otherwise build manually
      // Preserve the original return URL from current viewer page
      const currentParams = new URLSearchParams(window.location.search);
      const returnUrl = currentParams.get('return') || '/';
      
      if (typeof window.buildViewerUrl === 'function') {
        const viewerUrl = window.buildViewerUrl(url, { return: returnUrl });
        if (viewerUrl) {
          window.location.href = viewerUrl;
          return;
        }
      }
      // Fallback: build viewer URL manually
      const params = new URLSearchParams();
      params.set('src', url);
      params.set('return', returnUrl);
      window.location.href = '/viewer/?' + params.toString();
      return;
    }

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
    document.body.classList.add('rc-presentation-active');
    
    // Add icon-only mode on desktop
    if (window.innerWidth > DESKTOP_BREAKPOINT) {
      document.body.classList.add('app-shell-icon-only');
    }
    
    // Close expanded rail overlay
    const rail = document.querySelector('.app-shell-rail');
    if (rail) {
      rail.classList.remove('open');
      document.body.classList.remove('app-shell-rail-expanded');
    }

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
    document.body.classList.remove('rc-presentation-active');
    document.body.classList.remove('app-shell-icon-only');

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
      
      // BUG FIX: Don't auto-open Lessons Navigator on viewer page
      // Only restore the viewer state (load presentation in iframe)
      const isOnViewerPage = isViewerPage();
      
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
                // On viewer page, only load in iframe, don't open lessons navigator
                if (isOnViewerPage) {
                  // Just update the viewer state without opening lessons navigator
                  viewerState = {
                    isOpen: false,
                    currentUrl: presData.url,
                    section: section,
                    unit: unit,
                    presentation: presentation
                  };
                } else {
                  // On other pages, open presentation viewer normally
                  openPresentationViewer(presData.url, section, unit, presentation);
                }
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
    
    // Skip auth check for public content pages (viewer, presentations, etc.)
    // These pages don't require authentication and shouldn't probe session endpoints
    if (path === '/' ||
        path === '/viewer' || 
        path.startsWith('/viewer/') || 
        path.startsWith('/presentations/') || 
        path.startsWith('/language-arts/') || 
        path.startsWith('/life-skills/')) {
      return { signedIn: false, label: '' };
    }
    
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
      // For unknown/public paths, don't probe any session endpoint
      // This prevents unnecessary 401 errors on public pages like root '/'
      return { signedIn: false, label: '' };
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
