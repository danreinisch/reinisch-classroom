/**
 * Student Portal Initialization
 * Handles student login form, roster loading, and authentication
 * 
 * Phase 3: Uses canonical endpoint /.netlify/functions/student-login
 * - student-signin remains available as backwards-compatible alias
 * - Enhanced error messages for common failure scenarios
 * - No teacher/admin/substitute endpoints called from student pages
 * 
 * PR student-portal-reliability: Added boot hardening and guardrails
 * - bfcache restore detection
 * - Boot watchdog to detect stuck UI
 * - Network request guardrails to block teacher/admin/substitute endpoints
 * - Graceful Supabase unavailability handling
 */

(function () {
  'use strict';

  // Constants
  const LOG_PREFIX = '[student-portal]';
  const STUDENT_PORTAL_PATH = '/student/';
  let bootWatchdogTimer = null;

  // ============================================================================
  // PR student-portal-reliability: bfcache restore hardening
  // ============================================================================
  // If the page is restored from browser back-forward cache (bfcache),
  // force a full reload to avoid half-restored JS state and phantom UI
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      console.log(LOG_PREFIX, 'bfcache restore detected, forcing reload');
      window.location.reload();
    }
  });

  // ============================================================================
  // PR student-portal-reliability: Boot watchdog (visibility-based)
  // ============================================================================
  // If the dashboard is not visible after a timeout, treat as unhealthy resume
  // and redirect to student login with return URL
  function initBootWatchdog() {
    const urlParams = new URLSearchParams(window.location.search);
    const DEBUG_MODE = urlParams.get('debug') === '1';
    
    // Watchdog timeout: 8 seconds default, can be overridden with ?watchdog_ms=N
    const WATCHDOG_MS = parseInt(urlParams.get('watchdog_ms'), 10) || 8000;
    
    // In debug mode, disable watchdog by default (unless explicitly set)
    if (DEBUG_MODE && !urlParams.has('watchdog_ms')) {
      console.log(LOG_PREFIX, 'Boot watchdog disabled in debug mode');
      return;
    }
    
    console.log(LOG_PREFIX, `Boot watchdog starting (timeout: ${WATCHDOG_MS}ms)`);
    
    bootWatchdogTimer = setTimeout(() => {
      // Skip if already redirecting (use window.__redirectingToHub for compatibility with Portal B)
      if (window.__redirectingToHub === true) {
        console.log(LOG_PREFIX, 'Boot watchdog: redirect already in progress');
        return;
      }
      
      // Skip if dashboard is visible and healthy
      const dashboardView = document.getElementById('studentDashboardView');
      const isDashboardVisible = 
        dashboardView && 
        !dashboardView.classList.contains('hidden') &&
        dashboardView.offsetParent !== null;
      
      if (isDashboardVisible) {
        console.log(LOG_PREFIX, 'Boot watchdog: dashboard is visible, all good');
        return;
      }
      
      // Dashboard is not visible - unhealthy state detected
      console.warn(
        LOG_PREFIX,
        `Boot watchdog: dashboard not visible after ${WATCHDOG_MS}ms, clearing auth and redirecting to login`
      );
      
      // Clear auth and session
      try {
        sessionStorage.removeItem('rc_user_code');
        sessionStorage.removeItem('rc_user_role');
        localStorage.removeItem('rc_auth');
        console.log(LOG_PREFIX, 'Boot watchdog: auth cleared');
      } catch (err) {
        console.error(LOG_PREFIX, 'Boot watchdog: failed to clear auth:', err);
      }
      
      // Set redirect flag to prevent loops
      window.__redirectingToHub = true;
      
      // Redirect to student portal root with reason parameter
      window.location.replace(STUDENT_PORTAL_PATH + '?reason=portal_resume_failed');
    }, WATCHDOG_MS);
  }

  // ============================================================================
  // PR student-portal-reliability: Network guardrails
  // ============================================================================
  // Block or warn about calls to teacher/admin/substitute endpoints from student pages
  function initNetworkGuardrails() {
    if (!window.fetch) return; // No fetch API support
    
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      // Handle both string URLs and Request objects
      const urlString = typeof url === 'string' ? url : (url instanceof Request ? url.url : (url?.href || ''));
      
      // Parse URL to check pathname (more secure than substring check)
      try {
        const parsedUrl = new URL(urlString, window.location.origin);
        const pathname = parsedUrl.pathname;
        
        // Check if pathname starts with privileged endpoint patterns
        if (pathname.startsWith('/.netlify/functions/teacher-') ||
            pathname.startsWith('/.netlify/functions/admin-') ||
            pathname.startsWith('/.netlify/functions/substitute-')) {
          console.error(
            LOG_PREFIX,
            'BLOCKED: Attempt to call privileged endpoint from student page:',
            pathname
          );
          
          // Return a rejected promise to prevent the call
          return Promise.reject(new Error('Unauthorized: Student pages cannot access teacher/admin/substitute endpoints'));
        }
      } catch (parseErr) {
        // If URL parsing fails, fall back to substring check
        if (urlString.includes('/.netlify/functions/teacher-') ||
            urlString.includes('/.netlify/functions/admin-') ||
            urlString.includes('/.netlify/functions/substitute-')) {
          console.error(
            LOG_PREFIX,
            'BLOCKED: Attempt to call privileged endpoint from student page:',
            urlString
          );
          return Promise.reject(new Error('Unauthorized: Student pages cannot access teacher/admin/substitute endpoints'));
        }
      }
      
      // Allow the call
      return originalFetch.apply(this, args);
    };
    
    console.log(LOG_PREFIX, 'Network guardrails initialized');
  }

  /**
   * Initialize the portal
   * PR 315: Handle authenticated state and show dashboard
   * PR student-portal-reliability: Added try/catch and error handling
   */
  async function init() {
    try {
      console.log(LOG_PREFIX, 'Initializing student portal');

      // Initialize guardrails
      initNetworkGuardrails();
      
      // Initialize boot watchdog
      initBootWatchdog();

      // Check if already authenticated (from auto-login or existing session)
      if (isAuthenticated()) {
        console.log(LOG_PREFIX, 'Already authenticated, showing dashboard');
        showDashboard();
        return;
      }

      // Not authenticated - show login form
      console.log(LOG_PREFIX, 'Not authenticated, showing login');
      showLogin();
      
      // Load student roster with error handling
      try {
        await loadStudentRoster();
      } catch (err) {
        console.error(LOG_PREFIX, 'Failed to load student roster:', err);
        // Continue - manual entry will be available
      }

      // Setup event handlers
      setupEventHandlers();
    } catch (err) {
      console.error(LOG_PREFIX, 'Critical initialization error:', err);
      showFatalError('Failed to initialize student portal. Please refresh the page or contact your teacher.');
    }
  }

  /**
   * Show fatal error with retry option
   * PR student-portal-reliability: Inline error panel with retry
   */
  function showFatalError(message) {
    const loginView = document.getElementById('loginView');
    const dashboardView = document.getElementById('studentDashboardView');
    
    // Hide everything first
    if (loginView) loginView.classList.add('hidden');
    if (dashboardView) dashboardView.classList.add('hidden');
    
    // Create error panel using DOM API to prevent XSS
    const errorPanel = document.createElement('div');
    errorPanel.id = 'fatalErrorPanel';
    errorPanel.className = 'portal-container';
    
    const card = document.createElement('div');
    card.className = 'portal-card';
    
    const header = document.createElement('header');
    header.className = 'portal-header';
    
    const title = document.createElement('h1');
    title.className = 'portal-title';
    title.textContent = '⚠️ Error';
    
    const subtitle = document.createElement('p');
    subtitle.className = 'portal-subtitle';
    subtitle.textContent = 'Something went wrong';
    
    header.appendChild(title);
    header.appendChild(subtitle);
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message error';
    messageDiv.textContent = message; // Use textContent to prevent XSS
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 12px; justify-content: center; margin-top: 24px;';
    
    const btnRetry = document.createElement('button');
    btnRetry.className = 'btn';
    btnRetry.id = 'btnRetryInit';
    btnRetry.textContent = 'Retry';
    
    const btnReload = document.createElement('button');
    btnReload.className = 'btn';
    btnReload.id = 'btnReload';
    btnReload.textContent = 'Reload Page';
    
    buttonContainer.appendChild(btnRetry);
    buttonContainer.appendChild(btnReload);
    
    card.appendChild(header);
    card.appendChild(messageDiv);
    card.appendChild(buttonContainer);
    
    errorPanel.appendChild(card);
    
    // Remove existing error panel if any
    const existingPanel = document.getElementById('fatalErrorPanel');
    if (existingPanel) {
      existingPanel.remove();
    }
    
    // Add to body
    document.body.appendChild(errorPanel);
    
    // Setup retry handlers
    btnRetry.addEventListener('click', () => {
      errorPanel.remove();
      init();
    });
    
    btnReload.addEventListener('click', () => {
      window.location.reload();
    });
  }

  /**
   * Show login view
   * PR student-portal-reliability: Added null checks
   * Note: Watchdog continues running to detect unhealthy states
   */
  function showLogin() {
    const loginView = document.getElementById('loginView');
    const dashboardView = document.getElementById('studentDashboardView');
    
    if (loginView) {
      loginView.classList.remove('hidden');
    } else {
      console.error(LOG_PREFIX, 'loginView element not found');
    }
    
    if (dashboardView) {
      dashboardView.classList.add('hidden');
    }
  }

  /**
   * Show dashboard view (PR 315)
   * PR student-portal-reliability: Added null checks
   * Note: Watchdog continues running in background to detect unhealthy state changes
   */
  function showDashboard() {
    const loginView = document.getElementById('loginView');
    const dashboardView = document.getElementById('studentDashboardView');
    const studentCodeDisplay = document.getElementById('studentCodeDisplay');
    const btnLogout = document.getElementById('btnLogout');
    const btnReturnHub = document.getElementById('btnReturnHub');
    
    // Hide login, show dashboard
    if (loginView) {
      loginView.classList.add('hidden');
    } else {
      console.warn(LOG_PREFIX, 'loginView element not found');
    }
    
    if (dashboardView) {
      dashboardView.classList.remove('hidden');
    } else {
      console.error(LOG_PREFIX, 'dashboardView element not found');
      showFatalError('Dashboard UI not found. Please refresh the page.');
      return;
    }
    
    // Display student code
    const studentCode = sessionStorage.getItem('rc_user_code');
    if (studentCodeDisplay && studentCode) {
      studentCodeDisplay.textContent = studentCode;
    }
    
    // Setup logout handler
    if (btnLogout) {
      btnLogout.addEventListener('click', handleLogout);
    }
    
    // Setup return to hub handler (PR 315: CSP-compliant, no inline onclick)
    if (btnReturnHub) {
      btnReturnHub.addEventListener('click', () => {
        window.location.href = '/hub/';
      });
    }
    
    console.log(LOG_PREFIX, 'Dashboard view shown for:', studentCode);
  }

  /**
   * Handle logout (PR 315)
   * PR-student-portal-fallback: Also clear localStorage rc_auth and legacy keys
   */
  function handleLogout() {
    console.log(LOG_PREFIX, 'Logout requested');
    
    // Clear session storage (student portal uses sessionStorage)
    sessionStorage.removeItem('rc_user_code');
    sessionStorage.removeItem('rc_user_role');
    
    // PR-student-portal-fallback: Clear localStorage rc_auth (prevents role bleed from teacher/admin)
    localStorage.removeItem('rc_auth');
    
    // Clear any legacy role keys that might exist
    localStorage.removeItem('rc_user_code');
    localStorage.removeItem('rc_user_role');
    
    // Redirect to home page as specified in requirements
    window.location.href = '/';
  }

  /**
   * Load student roster from Supabase
   * PR student-portal-reliability: Added graceful Supabase unavailability handling
   */
  async function loadStudentRoster() {
    console.log(LOG_PREFIX, 'Loading student roster...');
    const selectEl = document.getElementById('studentCodeSelect');
    
    if (!selectEl) {
      console.error(LOG_PREFIX, 'studentCodeSelect element not found');
      return;
    }

    try {
      const response = await fetch('/.netlify/functions/student-roster', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        // Check if this is a Supabase unavailability issue
        if (response.status === 503) {
          console.warn(LOG_PREFIX, 'Supabase unavailable, falling back to manual entry');
          showManualEntryFallback('Student database is temporarily unavailable. Please enter your code manually.');
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.ok && data.students && data.students.length > 0) {
        console.log(LOG_PREFIX, `Loaded ${data.students.length} students`);

        // Clear loading option
        selectEl.innerHTML = '<option value="">Select your student code</option>';

        // Add student codes
        data.students.forEach((student) => {
          const option = document.createElement('option');
          option.value = student.code;
          option.textContent = student.code;
          selectEl.appendChild(option);
        });
      } else if (data.ok && (!data.students || data.students.length === 0)) {
        // Roster is empty but service is available
        console.warn(LOG_PREFIX, 'No students in roster');
        showManualEntryFallback('No student roster available. Please enter your code manually.');
      } else {
        // Service returned error
        console.warn(LOG_PREFIX, 'Roster service returned error:', data.error);
        showManualEntryFallback('Could not load student codes. Please enter your code manually.');
      }
    } catch (err) {
      console.error(LOG_PREFIX, 'Error loading roster:', err);
      
      // Check if this is a network error (Supabase completely unreachable)
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        console.warn(LOG_PREFIX, 'Network error - Supabase may be unreachable');
        showManualEntryFallback('Unable to reach student database. Please enter your code manually or try again later.');
      } else {
        showManualEntryFallback('Could not load student codes. Please enter your code manually.');
      }
    }
  }

  /**
   * Show manual entry fallback
   * PR student-portal-reliability: Added null checks
   */
  function showManualEntryFallback(message) {
    showMessage(message, 'info');

    // Hide dropdown form
    const studentLoginForm = document.getElementById('studentLoginForm');
    const btnToggleManualEntry = document.getElementById('btnToggleManualEntry');
    const divider = document.querySelector('.divider');
    
    if (studentLoginForm) studentLoginForm.style.display = 'none';
    if (btnToggleManualEntry) btnToggleManualEntry.style.display = 'none';
    if (divider) divider.style.display = 'none';

    // Show manual entry
    const manualSection = document.getElementById('manualEntrySection');
    if (manualSection) {
      manualSection.classList.add('show');
    } else {
      console.error(LOG_PREFIX, 'manualEntrySection element not found');
    }
  }

  /**
   * Setup event handlers
   * PR student-portal-reliability: Added null checks before binding
   */
  function setupEventHandlers() {
    // Dropdown login form
    const loginForm = document.getElementById('studentLoginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', handleDropdownLogin);
    } else {
      console.warn(LOG_PREFIX, 'studentLoginForm element not found');
    }

    // Manual entry form
    const manualForm = document.getElementById('manualLoginForm');
    if (manualForm) {
      manualForm.addEventListener('submit', handleManualLogin);
    } else {
      console.warn(LOG_PREFIX, 'manualLoginForm element not found');
    }

    // Toggle manual entry
    const toggleBtn = document.getElementById('btnToggleManualEntry');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const manualSection = document.getElementById('manualEntrySection');
        if (!manualSection) {
          console.error(LOG_PREFIX, 'manualEntrySection element not found');
          return;
        }
        
        const isShown = manualSection.classList.contains('show');

        if (isShown) {
          manualSection.classList.remove('show');
          toggleBtn.textContent = 'Enter code manually';
        } else {
          manualSection.classList.add('show');
          toggleBtn.textContent = 'Use dropdown instead';
        }
      });
    }
  }

  /**
   * Handle dropdown login
   */
  async function handleDropdownLogin(e) {
    e.preventDefault();

    const studentCode = document.getElementById('studentCodeSelect').value;
    const password = document.getElementById('studentPassword').value;

    if (!studentCode) {
      showMessage('Please select your student code', 'error');
      return;
    }

    if (!password) {
      showMessage('Please enter your password', 'error');
      return;
    }

    await performLogin(studentCode, password);
  }

  /**
   * Handle manual login
   */
  async function handleManualLogin(e) {
    e.preventDefault();

    const studentCode = document.getElementById('manualStudentCode').value.trim();
    const password = document.getElementById('manualPassword').value;

    if (!studentCode) {
      showMessage('Please enter your student code', 'error');
      return;
    }

    if (!password) {
      showMessage('Please enter your password', 'error');
      return;
    }

    await performLogin(studentCode, password);
  }

  /**
   * Perform login
   * Phase 3: Enhanced error surfacing with clear, actionable messages
   * PR student-portal-reliability: Better Supabase unavailability handling
   */
  async function performLogin(studentCode, password) {
    console.log(LOG_PREFIX, 'Attempting login for:', studentCode);

    // Disable buttons
    const btns = document.querySelectorAll('.btn');
    btns.forEach((btn) => (btn.disabled = true));

    try {
      // Phase 3: Use canonical student-login endpoint
      const response = await fetch('/.netlify/functions/student-login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: studentCode,
          password: password,
        }),
      });

      // Phase 3: Enhanced error handling with clear messages
      if (!response.ok) {
        const data = await response.json().catch(() => ({ 
          error: 'Failed to parse server response. Please try again.' 
        }));
        
        // Provide specific error messages based on status code
        let errorMsg = 'Login failed. Please try again.';
        
        switch (response.status) {
          case 400:
            // Bad request - typically malformed input
            errorMsg = data.error || 'Request format error. Please ensure you entered a valid student code.';
            break;
          case 401:
            // Unauthorized - authentication failed
            errorMsg = data.error || 'Invalid student code or password. Please check your credentials and try again.';
            break;
          case 403:
            // Forbidden - account issue
            errorMsg = data.error || 'Your account is inactive. Please contact your teacher.';
            break;
          case 503:
            // Service unavailable - Supabase/backend issue
            errorMsg = 'Authentication service is temporarily unavailable. Please try again in a moment.';
            // Note: Manual entry form is available as a fallback option
            break;
          default:
            if (response.status >= 500) {
              // Server error
              errorMsg = 'Server error occurred. The system may be temporarily unavailable. Please try again or contact your teacher.';
            }
        }
        
        console.error(LOG_PREFIX, 'Login failed:', response.status, errorMsg);
        showMessage(errorMsg, 'error');
        return;
      }

      const data = await response.json();

      if (data.ok) {
        // Login successful
        console.log(LOG_PREFIX, 'Login successful');

        // Phase 4 (PR 315): Session-only auth - use sessionStorage instead of localStorage
        // This ensures students must re-login after closing tab/browser
        sessionStorage.setItem('rc_user_code', studentCode);
        sessionStorage.setItem('rc_user_role', 'student');

        showMessage('Login successful! Loading your portal...', 'success');

        // PR 315: Redirect to student portal with auto-login parameters
        // This triggers the full portal experience with authenticated UI
        setTimeout(() => {
          const portalUrl = `/student/?auto=1&code=${encodeURIComponent(studentCode)}`;
          console.log(LOG_PREFIX, 'Redirecting to:', portalUrl);
          window.location.href = portalUrl;
        }, 800);
      } else {
        // Login failed with ok: false
        const errorMsg = data.error || 'Invalid student code or password';
        console.error(LOG_PREFIX, 'Login failed:', errorMsg);
        showMessage(errorMsg, 'error');
      }
    } catch (err) {
      // Phase 3: Enhanced network error handling
      console.error(LOG_PREFIX, 'Login error:', err);
      
      let errorMsg = 'Unable to connect to authentication service. ';
      
      // Check for network/fetch errors more reliably
      if (err instanceof TypeError) {
        // Fetch API throws TypeError for network failures
        if (!navigator.onLine) {
          errorMsg += 'You appear to be offline. Please check your internet connection and try again.';
        } else {
          // Network error but browser thinks we're online - likely Supabase/backend unreachable
          errorMsg += 'The authentication database may be temporarily unavailable. Please try again in a moment.';
        }
      } else {
        errorMsg += 'Please try again or contact your teacher if this persists.';
      }
      
      showMessage(errorMsg, 'error');
    } finally {
      // Re-enable buttons
      btns.forEach((btn) => (btn.disabled = false));
    }
  }

  /**
   * Check if user is authenticated
   * PR 315: Session-only auth - check sessionStorage instead of localStorage
   * PR student-portal-reliability: Also check localStorage.rc_auth as fallback for compatibility
   */
  function isAuthenticated() {
    try {
      // Check sessionStorage for active session (primary method)
      const sessionRole = sessionStorage.getItem('rc_user_role');
      const sessionCode = sessionStorage.getItem('rc_user_code');

      if (sessionRole === 'student' && sessionCode && sessionCode.trim().length > 0) {
        return true;
      }

      // Fallback: Check localStorage.rc_auth for 24-hour auth handoff
      // This is used by hub auto-login and test scenarios
      try {
        const rcAuth = localStorage.getItem('rc_auth');
        if (rcAuth) {
          const auth = JSON.parse(rcAuth);
          if (auth.role === 'student' && auth.code && auth.code.trim().length > 0) {
            // Check if not expired
            if (auth.expiresAt && auth.expiresAt > Date.now()) {
              // Upgrade to sessionStorage for current session
              sessionStorage.setItem('rc_user_code', auth.code);
              sessionStorage.setItem('rc_user_role', 'student');
              return true;
            }
          }
        }
      } catch (parseErr) {
        // Invalid rc_auth JSON - ignore
        console.warn(LOG_PREFIX, 'Failed to parse rc_auth:', parseErr);
      }

      return false;
    } catch (err) {
      console.error(LOG_PREFIX, 'Error checking auth:', err);
      return false;
    }
  }

  /**
   * Show message
   * PR student-portal-reliability: Added null check
   */
  function showMessage(text, type = 'info') {
    const container = document.getElementById('messageContainer');
    
    if (!container) {
      console.error(LOG_PREFIX, 'messageContainer element not found');
      // Fallback to console for critical messages
      if (type === 'error') {
        console.error(LOG_PREFIX, 'ERROR:', text);
      }
      return;
    }

    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    messageEl.textContent = text;

    container.innerHTML = '';
    container.appendChild(messageEl);

    // Auto-hide after 5 seconds for non-error messages
    if (type !== 'error') {
      setTimeout(() => {
        if (messageEl.parentNode === container) {
          container.innerHTML = '';
        }
      }, 5000);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
