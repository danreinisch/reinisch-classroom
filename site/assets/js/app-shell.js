/**
 * Global App Shell - Left-side Navigation Rail
 * Provides consistent navigation across reinischclassroom.com
 */

(function () {
  'use strict';

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

  /**
   * Initialize the app shell
   */
  function initAppShell() {
    // Check if shell already exists
    if (document.querySelector('.app-shell-rail')) {
      return;
    }

    // Create and inject shell
    const shell = createShell();
    document.body.appendChild(shell);

    // Add body class for layout adjustment
    document.body.classList.add('has-app-shell');

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

  /**
   * Create the shell HTML structure
   */
  function createShell() {
    const rail = document.createElement('nav');
    rail.className = 'app-shell-rail';
    rail.setAttribute('aria-label', 'Main navigation');

    rail.innerHTML = `
      <div class="app-shell-header">
        <div class="app-shell-brand">Reinisch Classroom</div>
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
      console.error('[app-shell] Error checking auth:', err);
      return false;
    }
  }

  /**
   * Handle authentication required
   */
  function handleAuthRequired(role) {
    console.log('[app-shell] Auth required for role:', role);
    
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
   */
  async function handleSignOut() {
    console.log('[app-shell] Sign out requested - clearing all sessions');

    try {
      // Clear local auth immediately
      localStorage.removeItem('rc_auth');

      // Call all logout endpoints as best-effort (ignore errors, continue)
      const logoutPromises = [
        fetch('/.netlify/functions/teacher-logout', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => {}),
        fetch('/.netlify/functions/admin-logout', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => {}),
        fetch('/.netlify/functions/substitute-logout', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => {}),
      ];

      // Wait for all logout attempts (but don't block on errors)
      await Promise.allSettled(logoutPromises);

      // Redirect to home
      window.location.href = '/';
    } catch (err) {
      console.error('[app-shell] Error during sign out:', err);
      // Still redirect on error
      window.location.href = '/';
    }
  }

  /**
   * Update auth state in UI
   * Phase 302C: Added defensive null-checks for optional UI elements
   */
  function updateAuthState() {
    const rail = document.querySelector('.app-shell-rail');
    if (!rail) return;

    try {
      const authStr = localStorage.getItem('rc_auth');
      const auth = authStr ? JSON.parse(authStr) : null;
      const isAuthed = auth && auth.role && auth.code && (!auth.expiresAt || Date.now() < auth.expiresAt);

      // Phase 302C: Defensive - Update sign out button visibility if present
      const signOutBtn = rail.querySelector('[data-shell-action="signout"]');
      if (signOutBtn) {
        if (isAuthed) {
          signOutBtn.classList.remove('app-shell-hidden');
        } else {
          signOutBtn.classList.add('app-shell-hidden');
        }
      }

      // Phase 302C: Defensive - Update admin link visibility if present (only for admin role)
      const adminLink = rail.querySelector('[data-admin-only]');
      if (adminLink) {
        if (auth && auth.role === 'admin') {
          adminLink.classList.remove('app-shell-hidden');
        } else {
          adminLink.classList.add('app-shell-hidden');
        }
      }

      // Phase 302C: Defensive - Update status if element present
      const status = rail.querySelector('[data-shell-status]');
      if (status && isAuthed) {
        const roleLabel = auth.role.charAt(0).toUpperCase() + auth.role.slice(1);
        status.innerHTML = `<span>Signed in as ${roleLabel}</span>`;
      }
    } catch (err) {
      console.error('[app-shell] Error updating auth state:', err);
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
      
      console.log('[app-shell] Exited presentation mode');
    } else {
      // Enter presentation mode
      document.body.classList.add('presentation-mode');
      localStorage.setItem('presentation-mode', 'true');
      
      console.log('[app-shell] Entered presentation mode');
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
        console.warn('[app-shell] Could not enter fullscreen:', err);
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
      const response = await fetch('/assets/content/lessons-index.json');
      if (response.ok) {
        lessonsData = await response.json();
        console.log('[app-shell] Loaded lessons data');
      } else {
        console.warn('[app-shell] Failed to load lessons data:', response.status);
      }
    } catch (err) {
      console.warn('[app-shell] Error loading lessons data:', err);
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

    // Render content if we have data
    if (lessonsData) {
      renderLessonsContent();
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
    const iframe = viewer.querySelector('.presentation-iframe');
    
    if (!viewer || !iframe) return;

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

    console.log('[app-shell] Opened presentation:', url);
  }

  /**
   * Close presentation viewer
   */
  function closePresentationViewer() {
    const viewer = document.querySelector('.presentation-viewer');
    const iframe = viewer.querySelector('.presentation-iframe');
    
    if (!viewer || !iframe) return;

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

    console.log('[app-shell] Closed presentation viewer');
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
