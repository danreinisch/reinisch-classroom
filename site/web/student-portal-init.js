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
   */
  async function init() {
    console.log(LOG_PREFIX, 'Initializing student portal');

    // Check if already authenticated
    if (isAuthenticated()) {
      console.log(LOG_PREFIX, 'Already authenticated, redirecting to dashboard');
      // For now, just show a message. In production, redirect to actual dashboard.
      showMessage('You are already signed in!', 'success');
      return;
    }

    // Load student roster
    await loadStudentRoster();

    // Setup event handlers
    setupEventHandlers();
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
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // Provide specific error messages based on status
        let errorMsg = 'Login failed. Please try again.';
        
        if (response.status === 401) {
          errorMsg = data.error || 'Invalid student code or password. Please check your credentials.';
        } else if (response.status === 403) {
          errorMsg = data.error || 'Your account is inactive. Please contact your teacher.';
        } else if (response.status === 503) {
          errorMsg = 'Authentication service is currently unavailable. Please try again in a moment.';
        } else if (response.status >= 500) {
          errorMsg = 'Server error occurred. Please contact your teacher if this persists.';
        } else if (response.status === 400) {
          errorMsg = data.error || 'Invalid request. Please check your student code and password.';
        }
        
        console.error(LOG_PREFIX, 'Login failed:', response.status, errorMsg);
        showMessage(errorMsg, 'error');
        return;
      }

      const data = await response.json();

      if (data.ok) {
        // Login successful
        console.log(LOG_PREFIX, 'Login successful');

        // Store auth in localStorage
        const auth = {
          role: 'student',
          code: studentCode,
          timestamp: Date.now(),
        };
        localStorage.setItem('rc_auth', JSON.stringify(auth));

        showMessage('Login successful! Redirecting...', 'success');

        // Redirect to student dashboard
        // TODO: Implement student dashboard at /student/dashboard/ (tracked in issue #XXX)
        setTimeout(() => {
          // window.location.href = '/student/dashboard/';
          showMessage('Student dashboard would load here. (Feature in development)', 'info');
        }, 1500);
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
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          errorMsg += 'You appear to be offline. Please check your internet connection.';
        } else {
          errorMsg += 'Please check your internet connection and try again.';
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
   */
  function isAuthenticated() {
    try {
      const authStr = localStorage.getItem('rc_auth');
      if (!authStr) return false;

      const auth = JSON.parse(authStr);
      if (!auth || !auth.role || !auth.code) return false;

      // Check if student role
      if (auth.role !== 'student') return false;

      // Check expiry if present
      if (auth.expiresAt && Date.now() >= auth.expiresAt) return false;

      return true;
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
