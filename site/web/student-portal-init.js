/**
 * Student Portal Initialization
 * Handles student login form, roster loading, and authentication
 * 
 * Phase 3: Uses canonical endpoint /.netlify/functions/student-login
 * - student-signin remains available as backwards-compatible alias
 * - Enhanced error messages for common failure scenarios
 * - No teacher/admin/substitute endpoints called from student pages
 */

(function () {
  'use strict';

  const LOG_PREFIX = '[student-portal]';

  /**
   * Initialize the portal
   * PR 315: Handle authenticated state and show dashboard
   */
  async function init() {
    console.log(LOG_PREFIX, 'Initializing student portal');

    // Check if already authenticated (from auto-login or existing session)
    if (isAuthenticated()) {
      console.log(LOG_PREFIX, 'Already authenticated, showing dashboard');
      showDashboard();
      return;
    }

    // Not authenticated - show login form
    console.log(LOG_PREFIX, 'Not authenticated, showing login');
    showLogin();
    
    // Load student roster
    await loadStudentRoster();

    // Setup event handlers
    setupEventHandlers();
  }

  /**
   * Show login view
   */
  function showLogin() {
    const loginView = document.getElementById('loginView');
    const dashboardView = document.getElementById('studentDashboardView');
    
    if (loginView) loginView.classList.remove('hidden');
    if (dashboardView) dashboardView.classList.add('hidden');
  }

  /**
   * Show dashboard view (PR 315)
   */
  function showDashboard() {
    const loginView = document.getElementById('loginView');
    const dashboardView = document.getElementById('studentDashboardView');
    const studentCodeDisplay = document.getElementById('studentCodeDisplay');
    const btnLogout = document.getElementById('btnLogout');
    
    // Hide login, show dashboard
    if (loginView) loginView.classList.add('hidden');
    if (dashboardView) dashboardView.classList.remove('hidden');
    
    // Display student code
    const studentCode = sessionStorage.getItem('rc_user_code');
    if (studentCodeDisplay && studentCode) {
      studentCodeDisplay.textContent = studentCode;
    }
    
    // Setup logout handler
    if (btnLogout) {
      btnLogout.addEventListener('click', handleLogout);
    }
    
    console.log(LOG_PREFIX, 'Dashboard view shown for:', studentCode);
  }

  /**
   * Handle logout (PR 315)
   */
  function handleLogout() {
    console.log(LOG_PREFIX, 'Logout requested');
    
    // Clear session
    sessionStorage.removeItem('rc_user_code');
    sessionStorage.removeItem('rc_user_role');
    
    // Redirect to login page (removes auto-login params)
    window.location.href = '/student/';
  }

  /**
   * Load student roster from Supabase
   */
  async function loadStudentRoster() {
    console.log(LOG_PREFIX, 'Loading student roster...');
    const selectEl = document.getElementById('studentCodeSelect');

    try {
      const response = await fetch('/.netlify/functions/student-roster', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
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
      } else {
        // No students or roster unavailable
        console.warn(LOG_PREFIX, 'No students in roster');
        showManualEntryFallback('No student roster available. Please enter your code manually.');
      }
    } catch (err) {
      console.error(LOG_PREFIX, 'Error loading roster:', err);
      showManualEntryFallback('Could not load student codes. Please enter your code manually.');
    }
  }

  /**
   * Show manual entry fallback
   */
  function showManualEntryFallback(message) {
    showMessage(message, 'info');

    // Hide dropdown form
    document.getElementById('studentLoginForm').style.display = 'none';
    document.getElementById('btnToggleManualEntry').style.display = 'none';
    document.querySelector('.divider').style.display = 'none';

    // Show manual entry
    const manualSection = document.getElementById('manualEntrySection');
    manualSection.classList.add('show');
  }

  /**
   * Setup event handlers
   */
  function setupEventHandlers() {
    // Dropdown login form
    const loginForm = document.getElementById('studentLoginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', handleDropdownLogin);
    }

    // Manual entry form
    const manualForm = document.getElementById('manualLoginForm');
    if (manualForm) {
      manualForm.addEventListener('submit', handleManualLogin);
    }

    // Toggle manual entry
    const toggleBtn = document.getElementById('btnToggleManualEntry');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const manualSection = document.getElementById('manualEntrySection');
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
        // Check specific codes first, then ranges
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
            // Service unavailable
            errorMsg = 'Authentication service is currently unavailable. Please try again in a moment.';
            break;
          default:
            if (response.status >= 500) {
              // Server error
              errorMsg = 'Server error occurred. Please contact your teacher if this persists.';
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
        // Note: navigator.onLine is not always reliable but provides a basic check
        if (!navigator.onLine) {
          errorMsg += 'You appear to be offline. Please check your internet connection.';
        } else {
          errorMsg += 'Please check your network connection and try again.';
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
   */
  function isAuthenticated() {
    try {
      // Check sessionStorage for active session
      const sessionRole = sessionStorage.getItem('rc_user_role');
      const sessionCode = sessionStorage.getItem('rc_user_code');

      if (sessionRole === 'student' && sessionCode && sessionCode.trim().length > 0) {
        return true;
      }

      return false;
    } catch (err) {
      console.error(LOG_PREFIX, 'Error checking auth:', err);
      return false;
    }
  }

  /**
   * Show message
   */
  function showMessage(text, type = 'info') {
    const container = document.getElementById('messageContainer');

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
