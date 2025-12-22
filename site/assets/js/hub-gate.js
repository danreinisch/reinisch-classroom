/**
 * Hub Gating Module
 * Ensures /hub/ shows a login/role chooser gate when user is not authenticated
 * Prevents teacher UI from auto-loading and avoids long scrolling document issues
 */

(function () {
  'use strict';

  const LOG_PREFIX = '[hub-gate]';

  /**
   * Check if user has valid teacher/admin session
   */
  function hasValidTeacherSession() {
    try {
      const authStr = localStorage.getItem('rc_auth');
      if (!authStr) return false;

      const auth = JSON.parse(authStr);
      if (!auth || !auth.role || !auth.code) return false;

      // Check expiry
      if (auth.expiresAt && Date.now() >= auth.expiresAt) return false;

      // Check role is teacher or admin
      if (auth.role !== 'teacher' && auth.role !== 'admin') return false;

      return true;
    } catch (err) {
      console.error(LOG_PREFIX, 'Error checking auth:', err);
      return false;
    }
  }

  /**
   * Check if user has pending teacher session cookie (from prior login)
   */
  async function hasPendingTeacherSession() {
    try {
      const response = await fetch('/.netlify/functions/teacher-session', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        return data.ok === true;
      }

      return false;
    } catch (err) {
      console.error(LOG_PREFIX, 'Error checking pending session:', err);
      return false;
    }
  }

  /**
   * Show the login/role chooser gate
   */
  function showGate() {
    console.log(LOG_PREFIX, 'Showing login gate');

    // Hide teacher view
    const teacherView = document.querySelector('#view-teacher');
    if (teacherView) {
      teacherView.style.display = 'none';
    }

    // Hide resume banner
    const resumeBanner = document.querySelector('#teacherResumeBanner');
    if (resumeBanner) {
      resumeBanner.style.display = 'none';
    }

    // Create and show gate panel
    const gatePanel = createGatePanel();
    const hubShell = document.querySelector('.hub-shell');
    if (hubShell) {
      // Insert gate after topbar
      const topbar = hubShell.querySelector('.hub-topbar');
      if (topbar && topbar.nextSibling) {
        hubShell.insertBefore(gatePanel, topbar.nextSibling);
      } else {
        hubShell.appendChild(gatePanel);
      }
    } else {
      document.body.appendChild(gatePanel);
    }
  }

  /**
   * Create the gate panel HTML
   */
  function createGatePanel() {
    const panel = document.createElement('div');
    panel.className = 'hub-gate-panel';
    panel.id = 'hubGatePanel';

    panel.innerHTML = `
      <div class="hub-gate-content">
        <div class="hub-gate-header">
          <div class="hub-gate-icon">🏫</div>
          <h1 class="hub-gate-title">Welcome to Classroom Hub</h1>
          <p class="hub-gate-subtitle">Choose your role to get started</p>
        </div>

        <div class="hub-gate-actions">
          <button class="hub-gate-btn hub-gate-btn-teacher" id="gateTeacherBtn">
            <span class="hub-gate-btn-icon">👨‍🏫</span>
            <span class="hub-gate-btn-label">Teacher Center</span>
            <span class="hub-gate-btn-desc">Manage students, goals, and assignments</span>
          </button>

          <a href="/student/" class="hub-gate-btn hub-gate-btn-student">
            <span class="hub-gate-btn-icon">👨‍🎓</span>
            <span class="hub-gate-btn-label">Student Portal</span>
            <span class="hub-gate-btn-desc">Access your assignments and goals</span>
          </a>

          <a href="/sub/" class="hub-gate-btn hub-gate-btn-substitute">
            <span class="hub-gate-btn-icon">📋</span>
            <span class="hub-gate-btn-label">Substitute</span>
            <span class="hub-gate-btn-desc">View today's lesson plans</span>
          </a>
        </div>

        <div class="hub-gate-footer">
          <a href="/" class="hub-gate-link">← Back to Home</a>
        </div>
      </div>
    `;

    // Add styles
    injectGateStyles();

    // Add event handler for teacher button
    setTimeout(() => {
      const teacherBtn = document.getElementById('gateTeacherBtn');
      if (teacherBtn) {
        teacherBtn.addEventListener('click', handleTeacherGateClick);
      }
    }, 0);

    return panel;
  }

  /**
   * Inject gate panel styles
   */
  function injectGateStyles() {
    if (document.getElementById('hub-gate-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'hub-gate-styles';
    style.textContent = `
      .hub-gate-panel {
        min-height: calc(100vh - 80px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        background: radial-gradient(1200px 800px at 50% 20%, rgba(34,197,94,.08), transparent 50%),
                    radial-gradient(1200px 800px at 50% 80%, rgba(6,182,212,.06), transparent 50%);
      }

      .hub-gate-content {
        max-width: 800px;
        width: 100%;
      }

      .hub-gate-header {
        text-align: center;
        margin-bottom: 48px;
      }

      .hub-gate-icon {
        font-size: 72px;
        margin-bottom: 24px;
      }

      .hub-gate-title {
        font-size: 36px;
        font-weight: 900;
        color: var(--ink, #e6edf3);
        margin: 0 0 12px 0;
        letter-spacing: -0.5px;
      }

      .hub-gate-subtitle {
        font-size: 18px;
        color: var(--ink-dim, #cbd5e1);
        margin: 0;
      }

      .hub-gate-actions {
        display: grid;
        gap: 20px;
        margin-bottom: 32px;
      }

      .hub-gate-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 32px 24px;
        background: rgba(15, 23, 42, 0.7);
        border: 2px solid rgba(255, 255, 255, 0.15);
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-decoration: none;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }

      .hub-gate-btn:hover {
        transform: translateY(-4px);
        border-color: rgba(34, 197, 94, 0.4);
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
        background: rgba(15, 23, 42, 0.85);
      }

      .hub-gate-btn-teacher {
        border-color: rgba(34, 197, 94, 0.3);
      }

      .hub-gate-btn-teacher:hover {
        border-color: rgba(34, 197, 94, 0.6);
      }

      .hub-gate-btn-icon {
        font-size: 48px;
      }

      .hub-gate-btn-label {
        font-size: 22px;
        font-weight: 800;
        color: var(--ink, #e6edf3);
      }

      .hub-gate-btn-desc {
        font-size: 14px;
        color: var(--ink-dim, #cbd5e1);
        text-align: center;
      }

      .hub-gate-footer {
        text-align: center;
      }

      .hub-gate-link {
        color: var(--brand-2, #06b6d4);
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
        transition: color 0.15s ease;
      }

      .hub-gate-link:hover {
        color: var(--brand, #22c55e);
      }

      @media (max-width: 768px) {
        .hub-gate-title {
          font-size: 28px;
        }

        .hub-gate-subtitle {
          font-size: 16px;
        }

        .hub-gate-btn {
          padding: 24px 20px;
        }

        .hub-gate-btn-icon {
          font-size: 40px;
        }

        .hub-gate-btn-label {
          font-size: 20px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Handle teacher gate button click
   */
  function handleTeacherGateClick() {
    console.log(LOG_PREFIX, 'Teacher gate clicked - triggering login');

    // Trigger the existing teacher login button click
    // The hub page already has login logic wired to #btnTeacher
    const btnTeacher = document.getElementById('btnTeacher');
    if (btnTeacher) {
      btnTeacher.click();
    } else {
      console.warn(LOG_PREFIX, 'Teacher button not found, redirecting to hub');
      window.location.reload();
    }
  }

  /**
   * Hide the gate panel
   */
  function hideGate() {
    const gatePanel = document.getElementById('hubGatePanel');
    if (gatePanel) {
      gatePanel.remove();
    }
  }

  /**
   * Show teacher resume banner
   */
  function showResumeBanner() {
    console.log(LOG_PREFIX, 'Showing resume banner');
    const banner = document.querySelector('#teacherResumeBanner');
    if (banner) {
      banner.style.display = 'block';
    }
  }

  /**
   * Initialize hub gating
   */
  async function initHubGate() {
    console.log(LOG_PREFIX, 'Initializing hub gate');

    // Check if user has valid local auth
    const hasLocalAuth = hasValidTeacherSession();

    if (hasLocalAuth) {
      // User has valid local auth - they're already logged in
      // Don't show gate, let hub load normally
      console.log(LOG_PREFIX, 'Valid local auth found - skipping gate');
      return;
    }

    // Check if user has pending server session
    const hasPendingSession = await hasPendingTeacherSession();

    if (hasPendingSession) {
      // User has server session but no local auth
      // Show resume banner instead of gate
      console.log(LOG_PREFIX, 'Pending server session found - showing resume banner');
      showResumeBanner();
      // Still show gate as primary view
      showGate();
    } else {
      // No auth at all - show gate
      console.log(LOG_PREFIX, 'No auth found - showing gate');
      showGate();
    }
  }

  /**
   * Public API
   */
  window.HubGate = {
    init: initHubGate,
    show: showGate,
    hide: hideGate,
  };

  // Listen for successful teacher login
  window.addEventListener('teacher:login-success', () => {
    console.log(LOG_PREFIX, 'Teacher login success detected - hiding gate');
    hideGate();
  });

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHubGate);
  } else {
    initHubGate();
  }
})();
