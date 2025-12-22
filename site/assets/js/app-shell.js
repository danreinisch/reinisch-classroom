/**
 * Global App Shell - Left-side Navigation Rail
 * Provides consistent navigation across reinischclassroom.com
 */

(function () {
  'use strict';

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

    // Setup event handlers
    setupEventHandlers();

    // Update auth state
    updateAuthState();
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
          <span class="app-shell-item-icon">📚</span>
          <span class="app-shell-item-label">Lessons</span>
          <span class="app-shell-item-arrow">▶</span>
        </button>
        <div class="app-shell-submenu" data-shell-submenu="lessons">
          <a href="/language-arts/" class="app-shell-submenu-item">Language Arts</a>
          <a href="/life-skills/" class="app-shell-submenu-item">Life Skills</a>
        </div>

        <!-- Toolkits -->
        <button class="app-shell-item" data-shell-nav="toolkits" aria-expanded="false">
          <span class="app-shell-item-icon">🔧</span>
          <span class="app-shell-item-label">Toolkits</span>
          <span class="app-shell-item-arrow">▶</span>
        </button>
        <div class="app-shell-submenu" data-shell-submenu="toolkits">
          <a href="/language-arts/toolkit/" class="app-shell-submenu-item">Language Arts Toolkit</a>
          <a href="/math-toolkit/" class="app-shell-submenu-item">Math Toolkit</a>
        </div>

        <!-- Teacher -->
        <button class="app-shell-item" data-shell-nav="teacher" data-requires-auth="teacher" aria-expanded="false">
          <span class="app-shell-item-icon">👨‍🏫</span>
          <span class="app-shell-item-label">Teacher</span>
          <span class="app-shell-item-arrow">▶</span>
        </button>
        <div class="app-shell-submenu" data-shell-submenu="teacher">
          <a href="/hub/" class="app-shell-submenu-item">Teacher Center</a>
          <a href="/admin/" class="app-shell-submenu-item app-shell-hidden" data-admin-only>Admin</a>
        </div>

        <!-- Student -->
        <button class="app-shell-item" data-shell-nav="student" data-requires-auth="student">
          <span class="app-shell-item-icon">👨‍🎓</span>
          <span class="app-shell-item-label">Student</span>
        </button>

        <!-- Substitute -->
        <button class="app-shell-item" data-shell-nav="substitute" data-requires-auth="substitute">
          <span class="app-shell-item-icon">📋</span>
          <span class="app-shell-item-label">Substitute</span>
        </button>
      </div>

      <div class="app-shell-footer">
        <button class="app-shell-footer-btn app-shell-hidden" data-shell-action="signout">
          <span>🚪</span>
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
   */
  function setupEventHandlers() {
    const rail = document.querySelector('.app-shell-rail');
    if (!rail) return;

    // Toggle button handler (mobile)
    const toggle = document.querySelector('.app-shell-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        rail.classList.toggle('open');
      });
    }

    // Close rail when clicking outside (mobile)
    document.addEventListener('click', (e) => {
      if (window.innerWidth > 768) return;
      if (!rail.contains(e.target) && !toggle.contains(e.target)) {
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

    // Sign out button
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
      // Redirect to hub which will show teacher login
      window.location.href = '/hub/';
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
   */
  function updateAuthState() {
    const rail = document.querySelector('.app-shell-rail');
    if (!rail) return;

    try {
      const authStr = localStorage.getItem('rc_auth');
      const auth = authStr ? JSON.parse(authStr) : null;
      const isAuthed = auth && auth.role && auth.code && (!auth.expiresAt || Date.now() < auth.expiresAt);

      // Update sign out button visibility
      const signOutBtn = rail.querySelector('[data-shell-action="signout"]');
      if (signOutBtn) {
        if (isAuthed) {
          signOutBtn.classList.remove('app-shell-hidden');
        } else {
          signOutBtn.classList.add('app-shell-hidden');
        }
      }

      // Update admin link visibility (only for admin role)
      const adminLink = rail.querySelector('[data-admin-only]');
      if (adminLink) {
        if (auth && auth.role === 'admin') {
          adminLink.classList.remove('app-shell-hidden');
        } else {
          adminLink.classList.add('app-shell-hidden');
        }
      }

      // Update status
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
   * Public API
   */
  window.AppShell = {
    init: initAppShell,
    updateAuthState: updateAuthState,
    togglePresentationMode: togglePresentationMode,
    requestFullscreen: requestFullscreen,
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
