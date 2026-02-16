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
  
  // State management
  const state = {
    bootWatchdogTimer: null,
    dashboardHandlersAttached: false,
    redirectingToHub: false,
  };

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
    
    // PR fix-student-watchdog-login: Check if we recently failed resume (loop prevention)
    // This is the PRIMARY guard against infinite loops
    try {
      const resumeFailedAt = sessionStorage.getItem('portal_resume_failed_at');
      if (resumeFailedAt) {
        const failedTime = parseInt(resumeFailedAt, 10);
        const elapsed = Date.now() - failedTime;
        if (elapsed < 60000) { // Within last 60 seconds
          if (DEBUG_MODE) {
            console.log(LOG_PREFIX, `Boot watchdog disabled: resume failed ${Math.round(elapsed/1000)}s ago (loop prevention)`);
          }
          return;
        } else {
          // Expired, clear the flag
          sessionStorage.removeItem('portal_resume_failed_at');
        }
      }
    } catch (err) {
      console.error(LOG_PREFIX, 'Failed to check resume failure flag:', err);
    }
    
    // PR fix-student-watchdog-login: Check URL for reason parameter (came from watchdog redirect)
    // Skip if already on resume failed page to avoid re-triggering
    const reason = urlParams.get('reason');
    if (reason === 'portal_resume_failed') {
      if (DEBUG_MODE) {
        console.log(LOG_PREFIX, 'Boot watchdog disabled: already on resume failed page');
      }
      return;
    }
    
    // Watchdog timeout: 8 seconds default, can be overridden with ?watchdog_ms=N
    const WATCHDOG_MS = parseInt(urlParams.get('watchdog_ms'), 10) || 8000;
    
    // In debug mode, disable watchdog by default (unless explicitly set)
    if (DEBUG_MODE && !urlParams.has('watchdog_ms')) {
      console.log(LOG_PREFIX, 'Boot watchdog disabled in debug mode');
      return;
    }
    
    if (DEBUG_MODE) {
      console.log(LOG_PREFIX, `Boot watchdog starting (timeout: ${WATCHDOG_MS}ms)`);
    }
    
    state.bootWatchdogTimer = setTimeout(() => {
      // Skip if already redirecting
      if (state.redirectingToHub) {
        if (DEBUG_MODE) {
          console.log(LOG_PREFIX, 'Boot watchdog: redirect already in progress');
        }
        return;
      }
      
      // Skip if dashboard is visible and healthy
      const dashboardView = document.getElementById('studentDashboardView');
      const isDashboardVisible = 
        dashboardView && 
        !dashboardView.classList.contains('hidden') &&
        dashboardView.offsetParent !== null;
      
      if (isDashboardVisible) {
        if (DEBUG_MODE) {
          console.log(LOG_PREFIX, 'Boot watchdog: dashboard is visible, all good');
        }
        return;
      }
      
      // Dashboard is not visible - unhealthy state detected
      // PR fix-student-watchdog-login: Single warning (watchdog fires once then redirects)
      console.warn(
        LOG_PREFIX,
        `Boot watchdog: dashboard not visible after ${WATCHDOG_MS}ms, clearing auth and redirecting to login`
      );
      
      // Clear auth and session
      try {
        sessionStorage.removeItem('rc_user_code');
        sessionStorage.removeItem('rc_user_role');
        localStorage.removeItem('rc_auth');
        if (DEBUG_MODE) {
          console.log(LOG_PREFIX, 'Boot watchdog: auth cleared');
        }
      } catch (err) {
        console.error(LOG_PREFIX, 'Boot watchdog: failed to clear auth:', err);
      }
      
      // PR fix-student-watchdog-login: Set timestamp flag to prevent loop
      try {
        sessionStorage.setItem('portal_resume_failed_at', Date.now().toString());
      } catch (err) {
        console.error(LOG_PREFIX, 'Failed to set resume failure flag:', err);
      }
      
      // Set redirect flag to prevent loops
      state.redirectingToHub = true;
      
      // Redirect to student portal root with reason parameter
      window.location.replace(STUDENT_PORTAL_PATH + '?reason=portal_resume_failed');
    }, WATCHDOG_MS);
  }

  // ============================================================================
  // PR fix-student-watchdog-login: Form input preservation
  // ============================================================================
  // Save form inputs to sessionStorage to preserve during re-renders
  function saveFormInputs() {
    try {
      const formData = {
        studentCode: document.getElementById('studentCodeSelect')?.value || '',
        studentPassword: document.getElementById('studentPassword')?.value || '',
        manualCode: document.getElementById('manualStudentCode')?.value || '',
        manualPassword: document.getElementById('manualPassword')?.value || '',
        manualEntryVisible: document.getElementById('manualEntrySection')?.classList.contains('show') || false,
        timestamp: Date.now()
      };
      sessionStorage.setItem('rc_student_form_inputs', JSON.stringify(formData));
    } catch (err) {
      console.error(LOG_PREFIX, 'Failed to save form inputs:', err);
    }
  }
  
  // Restore form inputs from sessionStorage
  function restoreFormInputs() {
    try {
      const saved = sessionStorage.getItem('rc_student_form_inputs');
      if (!saved) return false;
      
      const formData = JSON.parse(saved);
      
      // Only restore if saved within last 5 minutes (avoid stale data)
      if (Date.now() - formData.timestamp > 300000) {
        sessionStorage.removeItem('rc_student_form_inputs');
        return false;
      }
      
      // Restore dropdown form
      const studentCodeSelect = document.getElementById('studentCodeSelect');
      const studentPassword = document.getElementById('studentPassword');
      if (studentCodeSelect && formData.studentCode) {
        studentCodeSelect.value = formData.studentCode;
      }
      if (studentPassword && formData.studentPassword) {
        studentPassword.value = formData.studentPassword;
      }
      
      // Restore manual entry form
      const manualCode = document.getElementById('manualStudentCode');
      const manualPassword = document.getElementById('manualPassword');
      if (manualCode && formData.manualCode) {
        manualCode.value = formData.manualCode;
      }
      if (manualPassword && formData.manualPassword) {
        manualPassword.value = formData.manualPassword;
      }
      
      // Restore manual entry visibility
      if (formData.manualEntryVisible) {
        const manualSection = document.getElementById('manualEntrySection');
        const toggleBtn = document.getElementById('btnToggleManualEntry');
        if (manualSection) {
          manualSection.classList.add('show');
        }
        if (toggleBtn) {
          toggleBtn.textContent = 'Use dropdown instead';
        }
      }
      
      return true;
    } catch (err) {
      console.error(LOG_PREFIX, 'Failed to restore form inputs:', err);
      return false;
    }
  }
  
  // Clear saved form inputs (after successful login)
  function clearSavedFormInputs() {
    try {
      sessionStorage.removeItem('rc_student_form_inputs');
    } catch (err) {
      console.error(LOG_PREFIX, 'Failed to clear saved form inputs:', err);
    }
  }

  // ============================================================================
  // PR fix-student-dashboard: Goals & Progress Loading
  // ============================================================================
  
  // Constants for goal rendering
  const MAX_DESC_LENGTH = 120; // Max characters before truncating description
  const MONTHS_PER_QUARTER = 3; // Number of months in a quarter
  
  // Goal area icons (matching teacher center)
  const GOAL_AREA_ICONS = {
    "Reading Comprehension": "📖",
    "Written Expression": "✍️",
    "Basic Reading": "📚",
    "Behavior": "🎯",
    "Life Skills Transition": "🚀",
    "Life Skills Reading Skills": "📖",
    "Life Skills Writing Skills": "✍️",
    "Math Calculation": "🔢",
    "Math Problem Solving": "🧮",
    "Reading Fluency": "📝",
    "Social Skills": "🤝",
    "Language": "💬",
    "Life Skills": "🛠️",
    "Emotional Regulation": "😌",
    "Reading Skills": "📕"
  };
  
  /**
   * Map a goal area to a color category for the left border
   */
  function goalAreaToColorCategory(goalArea) {
    const area = (goalArea || '').toLowerCase();
    if (area.includes('reading')) return 'Reading';
    if (area.includes('writ')) return 'Writing';
    if (area.includes('math')) return 'Math';
    if (area.includes('behavior')) return 'Behavior';
    if (area.includes('life')) return 'LifeSkills';  // Matches all "Life Skills" variations
    if (area.includes('social')) return 'Social';
    if (area.includes('language')) return 'Language';
    if (area.includes('emotional')) return 'Emotional';
    return 'Other';
  }
  
  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Format date for display
   */
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (err) {
      return 'N/A';
    }
  }
  
  /**
   * Load and render student goals
   */
  async function loadStudentGoals(studentCode) {
    console.log(LOG_PREFIX, 'Loading goals for:', studentCode);
    
    const goalsContainer = document.getElementById('goalsContent');
    const goalsCount = document.getElementById('goalsCount');
    
    if (!goalsContainer) {
      console.warn(LOG_PREFIX, 'Goals container not found');
      return;
    }
    
    // Show loading state
    goalsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--muted);">
        <div style="font-size: 48px; margin-bottom: 16px;">⏳</div>
        <div>Loading your goals...</div>
      </div>
    `;
    
    try {
      // Fetch goals
      const goalsUrl = `/.netlify/functions/student-goals?code=${encodeURIComponent(studentCode)}`;
      const goalsResponse = await fetch(goalsUrl);
      
      if (!goalsResponse.ok) {
        throw new Error(`Failed to fetch goals: ${goalsResponse.status}`);
      }
      
      const goalsData = await goalsResponse.json();
      
      if (!goalsData.ok) {
        throw new Error(goalsData.error || 'Failed to load goals');
      }
      
      const goals = goalsData.goals || [];
      
      // Fetch progress data
      let progressMap = new Map();
      try {
        const progressUrl = `/.netlify/functions/student-goal-progress?code=${encodeURIComponent(studentCode)}`;
        const progressResponse = await fetch(progressUrl);
        
        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          if (progressData.ok && progressData.progress) {
            // Build map of goal_id -> progress entries
            progressData.progress.forEach(entry => {
              if (!progressMap.has(entry.goal_id)) {
                progressMap.set(entry.goal_id, []);
              }
              progressMap.get(entry.goal_id).push(entry);
            });
          }
        }
      } catch (err) {
        console.warn(LOG_PREFIX, 'Failed to load progress data:', err);
        // Continue without progress data
      }
      
      // Render goals
      if (goals.length === 0) {
        goalsContainer.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--muted);">
            <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
            <div>No goals found for your account.</div>
          </div>
        `;
        if (goalsCount) {
          goalsCount.textContent = '0 goals';
        }
      } else {
        goalsContainer.innerHTML = goals.map(goal => renderGoalCard(goal, progressMap)).join('');
        if (goalsCount) {
          goalsCount.textContent = goals.length === 1 ? '1 goal' : `${goals.length} goals`;
        }
        
        // Attach event listeners to "Show more" buttons
        attachShowMoreListeners();
      }
      
    } catch (err) {
      console.error(LOG_PREFIX, 'Error loading goals:', err);
      goalsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <div style="color: var(--ink);">Goals temporarily unavailable</div>
          <div style="margin-top: 8px; font-size: 14px;">Please try refreshing the page or contact your teacher if this persists.</div>
        </div>
      `;
      if (goalsCount) {
        goalsCount.textContent = 'Unavailable';
      }
    }
  }
  
  /**
   * Render a single goal card
   */
  function renderGoalCard(goal, progressMap) {
    const icon = GOAL_AREA_ICONS[goal.goal_area] || '📌';
    const colorCategory = goalAreaToColorCategory(goal.goal_area);
    const fullDesc = goal.desc || goal.goal_text || '(No goal description provided)';
    
    // Truncate description to MAX_DESC_LENGTH chars
    let descHtml = '';
    if (fullDesc.length > MAX_DESC_LENGTH) {
      const truncated = fullDesc.substring(0, MAX_DESC_LENGTH);
      descHtml = `
        <div class="st-goal-desc">
          <span class="st-goal-desc-short">${escapeHtml(truncated)}...</span>
          <button class="st-goal-show-more" data-goal-id="${goal.id}">Show more</button>
          <span class="st-goal-desc-full" style="display: none;">${escapeHtml(fullDesc)}</span>
        </div>
      `;
    } else {
      descHtml = `<div class="st-goal-desc">${escapeHtml(fullDesc)}</div>`;
    }
    
    // Get progress data for this goal
    const progressEntries = progressMap.get(goal.id) || [];
    
    // Calculate this quarter's data points
    // Quarters: Q1=Jan-Mar (0-2), Q2=Apr-Jun (3-5), Q3=Jul-Sep (6-8), Q4=Oct-Dec (9-11)
    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / MONTHS_PER_QUARTER) * MONTHS_PER_QUARTER, 1);
    const thisQuarterEntries = progressEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      return entryDate >= quarterStart;
    });
    
    // Get last data collection date
    let lastDate = 'Never';
    if (progressEntries.length > 0) {
      const sortedEntries = [...progressEntries].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
      );
      lastDate = formatDate(sortedEntries[0].date);
    }
    
    const statusEmoji = thisQuarterEntries.length > 0 ? '✅' : '⏸️';
    const statusText = thisQuarterEntries.length > 0 
      ? `${thisQuarterEntries.length} data ${thisQuarterEntries.length === 1 ? 'point' : 'points'} this quarter`
      : 'No data this quarter';
    
    return `
      <div class="st-goal-card" data-goal-id="${goal.id}" data-area="${colorCategory}">
        <div class="st-goal-header">
          <div class="st-goal-title-line">
            <span class="st-goal-icon">${icon}</span>
            <span class="st-goal-area-name">${escapeHtml(goal.goal_area || 'N/A')}</span>
            <span class="st-goal-code">${escapeHtml(goal.code || '')}</span>
            <span class="st-badge st-badge-measurement">${escapeHtml(goal.measurement_type || 'N/A')}</span>
          </div>
        </div>
        ${descHtml}
        <div class="st-goal-metrics">
          <div class="st-metric">
            <span class="st-metric-label">Baseline:</span>
            <span class="st-metric-value">${escapeHtml(goal.baseline || 'N/A')}</span>
          </div>
          <div class="st-metric">
            <span class="st-metric-label">Target:</span>
            <span class="st-metric-value">${escapeHtml(goal.target || 'N/A')}</span>
          </div>
        </div>
        <div class="st-goal-data-status">
          <div class="st-data-status-item">
            <span>${statusEmoji}</span>
            <span>${statusText}</span>
          </div>
          <div class="st-data-status-item">
            <span>📅</span>
            <span>Last: ${lastDate}</span>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Attach event listeners to "Show more" buttons
   */
  function attachShowMoreListeners() {
    const showMoreButtons = document.querySelectorAll('.st-goal-show-more');
    showMoreButtons.forEach(button => {
      button.addEventListener('click', function() {
        const descContainer = this.parentElement;
        descContainer.classList.toggle('expanded');
        this.textContent = descContainer.classList.contains('expanded') ? 'Show less' : 'Show more';
      });
    });
  }

  // ============================================================================
  // Student Assignments Loading and Viewer
  // ============================================================================
  
  // Assignment viewer state
  const assignmentViewerState = {
    currentAssignment: null,
    currentQuestionIndex: 0,
    answers: new Map(),
  };
  
  /**
   * Load and render student assignments
   */
  async function loadStudentAssignments(studentCode) {
    console.log(LOG_PREFIX, 'Loading assignments for:', studentCode);
    
    const assignmentsContainer = document.getElementById('assignmentsContent');
    const assignmentsCount = document.getElementById('assignmentsCount');
    
    if (!assignmentsContainer) {
      console.warn(LOG_PREFIX, 'Assignments container not found');
      return;
    }
    
    // Show loading state
    assignmentsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--muted);">
        <div style="font-size: 48px; margin-bottom: 16px;">⏳</div>
        <div>Loading your assignments...</div>
      </div>
    `;
    
    try {
      const assignmentsUrl = `/.netlify/functions/student-assignments?code=${encodeURIComponent(studentCode)}`;
      const response = await fetch(assignmentsUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch assignments: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to load assignments');
      }
      
      const instances = data.instances || [];
      
      // Render assignments
      if (instances.length === 0) {
        assignmentsContainer.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--muted);">
            <div style="font-size: 48px; margin-bottom: 16px;">📚</div>
            <div>No assignments yet</div>
          </div>
        `;
        if (assignmentsCount) {
          assignmentsCount.textContent = '0 assignments';
        }
      } else {
        assignmentsContainer.innerHTML = instances.map(inst => renderAssignmentCard(inst)).join('');
        if (assignmentsCount) {
          assignmentsCount.textContent = instances.length === 1 ? '1 assignment' : `${instances.length} assignments`;
        }
        
        // Attach click handlers
        attachAssignmentCardHandlers(instances);
      }
      
    } catch (err) {
      console.error(LOG_PREFIX, 'Error loading assignments:', err);
      assignmentsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <div style="color: var(--ink);">Assignments temporarily unavailable</div>
          <div style="margin-top: 8px; font-size: 14px;">Please try refreshing the page or contact your teacher if this persists.</div>
        </div>
      `;
      if (assignmentsCount) {
        assignmentsCount.textContent = 'Unavailable';
      }
    }
  }
  
  /**
   * Render an assignment card
   */
  function renderAssignmentCard(instance) {
    const assignment = instance.assignment || {};
    const title = escapeHtml(assignment.title || 'Untitled Assignment');
    const series = escapeHtml(assignment.series || 'General');
    const dueDate = instance.due_at ? formatDate(instance.due_at) : 'No due date';
    const status = (instance.status || 'Assigned').toLowerCase().replace(/\s+/g, '-');
    const statusText = escapeHtml(instance.status || 'Assigned');
    
    // TODO: Get score from submissions when available
    const score = null;
    const scoreHtml = score !== null ? `
      <span class="st-assignment-score ${score >= 70 ? 'good' : 'poor'}">
        ${Math.round(score)}%
      </span>
    ` : '';
    
    return `
      <div class="st-assignment-card" data-instance-id="${escapeHtml(instance.id)}">
        <h3 class="st-assignment-title">${title}</h3>
        <div class="st-assignment-meta">
          <span>${series}</span>
          <span>•</span>
          <span>Due: ${dueDate}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="st-assignment-status ${status}">${statusText}</span>
          ${scoreHtml}
        </div>
      </div>
    `;
  }
  
  /**
   * Attach click handlers to assignment cards
   */
  function attachAssignmentCardHandlers(instances) {
    const cards = document.querySelectorAll('.st-assignment-card');
    cards.forEach(card => {
      card.addEventListener('click', function() {
        const instanceId = this.getAttribute('data-instance-id');
        const instance = instances.find(i => i.id === instanceId);
        if (instance) {
          openAssignmentViewer(instance);
        }
      });
    });
  }
  
  /**
   * Open the assignment viewer overlay
   */
  function openAssignmentViewer(instance) {
    console.log(LOG_PREFIX, 'Opening assignment viewer for:', instance.id);
    
    assignmentViewerState.currentAssignment = instance;
    assignmentViewerState.currentQuestionIndex = 0;
    assignmentViewerState.answers = new Map();
    
    const assignment = instance.assignment || {};
    const questions = (assignment.meta && assignment.meta.questions) || [];
    
    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = 'assignment-viewer-overlay';
    overlay.id = 'assignmentViewerOverlay';
    
    // Build the viewer UI
    if (questions.length === 0 && assignment.page) {
      // URL-based assignment
      renderUrlAssignment(overlay, instance);
    } else if (questions.length === 0) {
      // No content
      renderNoContent(overlay, instance);
    } else {
      // Question-based assignment
      renderQuestionViewer(overlay, instance);
    }
    
    document.body.appendChild(overlay);
  }
  
  /**
   * Render URL-based assignment
   */
  function renderUrlAssignment(overlay, instance) {
    const assignment = instance.assignment || {};
    const title = escapeHtml(assignment.title || 'Assignment');
    const url = assignment.page || '';
    
    overlay.innerHTML = `
      <div class="assignment-viewer-header">
        <button class="assignment-viewer-back" id="viewerBackBtn">
          ← Back to Dashboard
        </button>
        <h1 class="assignment-viewer-title">${title}</h1>
      </div>
      <div class="assignment-viewer-content">
        <div style="text-align: center; padding: 60px 24px;">
          <div style="font-size: 72px; margin-bottom: 24px;">🔗</div>
          <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--ink); margin: 0 0 16px 0;">
            External Assignment
          </h2>
          <p style="font-size: 1rem; color: var(--ink-dim); margin: 0 0 32px 0;">
            This assignment is hosted on an external website. Click the button below to open it.
          </p>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="assignment-url-link">
            Open Assignment
          </a>
          <div style="margin-top: 32px;">
            <button class="btn" id="markCompleteBtn">Mark as Complete</button>
          </div>
        </div>
      </div>
    `;
    
    // Attach handlers
    overlay.querySelector('#viewerBackBtn').addEventListener('click', closeAssignmentViewer);
    overlay.querySelector('#markCompleteBtn').addEventListener('click', () => {
      // TODO: Mark as complete
      alert('This feature will be implemented when submission tracking is added.');
    });
  }
  
  /**
   * Render no content message
   */
  function renderNoContent(overlay, instance) {
    const assignment = instance.assignment || {};
    const title = escapeHtml(assignment.title || 'Assignment');
    
    overlay.innerHTML = `
      <div class="assignment-viewer-header">
        <button class="assignment-viewer-back" id="viewerBackBtn">
          ← Back to Dashboard
        </button>
        <h1 class="assignment-viewer-title">${title}</h1>
      </div>
      <div class="assignment-viewer-content">
        <div style="text-align: center; padding: 60px 24px;">
          <div style="font-size: 72px; margin-bottom: 24px;">📭</div>
          <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--ink); margin: 0 0 16px 0;">
            No Content Available
          </h2>
          <p style="font-size: 1rem; color: var(--ink-dim); margin: 0;">
            This assignment has no content yet. Please check back later or contact your teacher.
          </p>
        </div>
      </div>
    `;
    
    overlay.querySelector('#viewerBackBtn').addEventListener('click', closeAssignmentViewer);
  }
  
  /**
   * Render question-based viewer
   */
  function renderQuestionViewer(overlay, instance) {
    const assignment = instance.assignment || {};
    const title = escapeHtml(assignment.title || 'Assignment');
    const dueDate = instance.due_at ? formatDate(instance.due_at) : '';
    
    overlay.innerHTML = `
      <div class="assignment-viewer-header">
        <button class="assignment-viewer-back" id="viewerBackBtn">
          ← Back to Dashboard
        </button>
        <h1 class="assignment-viewer-title">${title}</h1>
        ${dueDate ? `<span class="assignment-viewer-due">Due: ${dueDate}</span>` : ''}
      </div>
      <div class="assignment-viewer-content" id="viewerContent">
        <!-- Content will be rendered here -->
      </div>
    `;
    
    overlay.querySelector('#viewerBackBtn').addEventListener('click', closeAssignmentViewer);
    
    // Render current question
    renderCurrentQuestion();
  }
  
  /**
   * Render the current question
   */
  function renderCurrentQuestion() {
    const instance = assignmentViewerState.currentAssignment;
    const assignment = instance.assignment || {};
    const questions = (assignment.meta && assignment.meta.questions) || [];
    const currentIndex = assignmentViewerState.currentQuestionIndex;
    const question = questions[currentIndex];
    
    if (!question) return;
    
    const viewerContent = document.getElementById('viewerContent');
    if (!viewerContent) return;
    
    const totalQuestions = questions.length;
    const progressPercent = ((currentIndex + 1) / totalQuestions) * 100;
    
    viewerContent.innerHTML = `
      <div class="assignment-viewer-progress">
        <div class="assignment-viewer-progress-text">Question ${currentIndex + 1} of ${totalQuestions}</div>
        <div class="assignment-viewer-progress-bar">
          <div class="assignment-viewer-progress-fill" style="width: ${progressPercent}%"></div>
        </div>
      </div>
      
      <div class="assignment-question-container">
        <div class="assignment-question-text">${escapeHtml(question.text || '')}</div>
        <div id="answerArea">
          <!-- Answer inputs will be rendered here -->
        </div>
      </div>
      
      <div class="assignment-viewer-nav">
        <button class="btn" id="prevBtn" ${currentIndex === 0 ? 'disabled' : ''}>
          Previous
        </button>
        <button class="btn" id="nextBtn">
          ${currentIndex === totalQuestions - 1 ? 'Submit' : 'Next'}
        </button>
      </div>
    `;
    
    // Render answer inputs based on question type
    renderAnswerInput(question);
    
    // Attach navigation handlers
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', handlePreviousQuestion);
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const questions = (instance.assignment.meta && instance.assignment.meta.questions) || [];
        if (currentIndex === questions.length - 1) {
          handleSubmitAssignment();
        } else {
          handleNextQuestion();
        }
      });
    }
  }
  
  /**
   * Render answer input based on question type
   */
  function renderAnswerInput(question) {
    const answerArea = document.getElementById('answerArea');
    if (!answerArea) return;
    
    const questionId = question.question_id || `q${assignmentViewerState.currentQuestionIndex}`;
    const answerType = (question.answer_type || 'mcq').toLowerCase();
    const choices = question.choices || [];
    const savedAnswer = assignmentViewerState.answers.get(questionId);
    
    if (answerType === 'mcq') {
      // Multiple choice
      answerArea.innerHTML = choices.map((choice, idx) => {
        const choiceId = `choice_${idx}`;
        const isChecked = savedAnswer === choice;
        return `
          <div class="assignment-answer-choice ${isChecked ? 'selected' : ''}" data-choice="${escapeHtml(choice)}">
            <input 
              type="radio" 
              name="answer" 
              id="${choiceId}" 
              value="${escapeHtml(choice)}"
              ${isChecked ? 'checked' : ''}
            />
            <label for="${choiceId}">${escapeHtml(choice)}</label>
          </div>
        `;
      }).join('');
      
      // Add click handlers
      answerArea.querySelectorAll('.assignment-answer-choice').forEach(choiceEl => {
        choiceEl.addEventListener('click', function() {
          const radio = this.querySelector('input[type="radio"]');
          if (radio) {
            radio.checked = true;
            // Update visual state
            answerArea.querySelectorAll('.assignment-answer-choice').forEach(el => {
              el.classList.remove('selected');
            });
            this.classList.add('selected');
            // Save answer
            const choice = this.getAttribute('data-choice');
            assignmentViewerState.answers.set(questionId, choice);
          }
        });
      });
      
    } else if (answerType === 'boolean' || answerType === 'true-false') {
      // True/False
      const trueChecked = savedAnswer === 'True';
      const falseChecked = savedAnswer === 'False';
      
      answerArea.innerHTML = `
        <div class="assignment-answer-choice ${trueChecked ? 'selected' : ''}" data-choice="True">
          <input 
            type="radio" 
            name="answer" 
            id="choice_true" 
            value="True"
            ${trueChecked ? 'checked' : ''}
          />
          <label for="choice_true">True</label>
        </div>
        <div class="assignment-answer-choice ${falseChecked ? 'selected' : ''}" data-choice="False">
          <input 
            type="radio" 
            name="answer" 
            id="choice_false" 
            value="False"
            ${falseChecked ? 'checked' : ''}
          />
          <label for="choice_false">False</label>
        </div>
      `;
      
      answerArea.querySelectorAll('.assignment-answer-choice').forEach(choiceEl => {
        choiceEl.addEventListener('click', function() {
          const radio = this.querySelector('input[type="radio"]');
          if (radio) {
            radio.checked = true;
            answerArea.querySelectorAll('.assignment-answer-choice').forEach(el => {
              el.classList.remove('selected');
            });
            this.classList.add('selected');
            const choice = this.getAttribute('data-choice');
            assignmentViewerState.answers.set(questionId, choice);
          }
        });
      });
      
    } else if (answerType === 'multiselect' || answerType === 'multi-select') {
      // Multiple select
      const savedAnswers = savedAnswer ? (Array.isArray(savedAnswer) ? savedAnswer : [savedAnswer]) : [];
      
      answerArea.innerHTML = choices.map((choice, idx) => {
        const choiceId = `choice_${idx}`;
        const isChecked = savedAnswers.includes(choice);
        return `
          <div class="assignment-answer-choice ${isChecked ? 'selected' : ''}" data-choice="${escapeHtml(choice)}">
            <input 
              type="checkbox" 
              name="answer[]" 
              id="${choiceId}" 
              value="${escapeHtml(choice)}"
              ${isChecked ? 'checked' : ''}
            />
            <label for="${choiceId}">${escapeHtml(choice)}</label>
          </div>
        `;
      }).join('');
      
      answerArea.querySelectorAll('.assignment-answer-choice').forEach(choiceEl => {
        choiceEl.addEventListener('click', function(e) {
          const checkbox = this.querySelector('input[type="checkbox"]');
          if (!checkbox) return;
          
          if (e.target.tagName !== 'INPUT') {
            checkbox.checked = !checkbox.checked;
          }
          
          if (checkbox.checked) {
            this.classList.add('selected');
          } else {
            this.classList.remove('selected');
          }
          
          // Save all checked answers
          const checked = Array.from(answerArea.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);
          assignmentViewerState.answers.set(questionId, checked);
        });
      });
      
    } else {
      // Constructed response (text area)
      const savedText = savedAnswer || '';
      answerArea.innerHTML = `
        <textarea 
          class="assignment-textarea" 
          id="answerTextarea" 
          placeholder="Type your answer..."
        ></textarea>
      `;
      
      const textarea = document.getElementById('answerTextarea');
      if (textarea) {
        // Set value via DOM property to preserve special characters
        textarea.value = savedText;
        textarea.addEventListener('input', function() {
          assignmentViewerState.answers.set(questionId, this.value);
        });
      }
    }
  }
  
  /**
   * Handle previous question
   */
  function handlePreviousQuestion() {
    if (assignmentViewerState.currentQuestionIndex > 0) {
      assignmentViewerState.currentQuestionIndex--;
      renderCurrentQuestion();
    }
  }
  
  /**
   * Handle next question
   */
  function handleNextQuestion() {
    const instance = assignmentViewerState.currentAssignment;
    const questions = (instance.assignment.meta && instance.assignment.meta.questions) || [];
    
    if (assignmentViewerState.currentQuestionIndex < questions.length - 1) {
      assignmentViewerState.currentQuestionIndex++;
      renderCurrentQuestion();
    }
  }
  
  /**
   * Handle assignment submission
   */
  async function handleSubmitAssignment() {
    const instance = assignmentViewerState.currentAssignment;
    const studentCode = sessionStorage.getItem('rc_user_code');
    
    if (!instance || !studentCode) {
      console.error(LOG_PREFIX, 'Missing instance or student code');
      return;
    }
    
    // Convert answers Map to object
    const answersObj = {};
    assignmentViewerState.answers.forEach((value, key) => {
      answersObj[key] = value;
    });
    
    try {
      // Show loading state
      const viewerContent = document.getElementById('viewerContent');
      if (viewerContent) {
        viewerContent.innerHTML = `
          <div style="text-align: center; padding: 60px 24px;">
            <div style="font-size: 72px; margin-bottom: 24px;">⏳</div>
            <div style="font-size: 1.2rem; color: var(--ink);">Submitting your work...</div>
          </div>
        `;
      }
      
      // Submit to server
      // Note: API field is called 'student_name' but accepts student code
      const response = await fetch('/.netlify/functions/submissions-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignment_id: instance.assignment_id,
          student_name: studentCode, // API accepts code in student_name field
          content: JSON.stringify(answersObj),
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Submission failed: ${response.status}`);
      }
      
      // Show success screen
      renderSuccessScreen(instance);
      
    } catch (err) {
      console.error(LOG_PREFIX, 'Error submitting assignment:', err);
      alert('Failed to submit assignment. Please try again or contact your teacher.');
    }
  }
  
  /**
   * Render success screen after submission
   */
  function renderSuccessScreen(instance) {
    const viewerContent = document.getElementById('viewerContent');
    if (!viewerContent) return;
    
    const assignment = instance.assignment || {};
    const questions = (assignment.meta && assignment.meta.questions) || [];
    
    // Simple client-side scoring for MCQ/boolean
    let score = null;
    let correctCount = 0;
    let totalCount = 0;
    
    questions.forEach((q, idx) => {
      const questionId = q.question_id || `q${idx}`;
      const userAnswer = assignmentViewerState.answers.get(questionId);
      const correctAnswer = q.correct;
      
      if (correctAnswer && (q.answer_type === 'mcq' || q.answer_type === 'boolean' || q.answer_type === 'true-false')) {
        totalCount++;
        if (userAnswer === correctAnswer) {
          correctCount++;
        }
      }
    });
    
    if (totalCount > 0) {
      score = (correctCount / totalCount) * 100;
    }
    
    viewerContent.innerHTML = `
      <div class="assignment-success-screen">
        <div class="assignment-success-icon">✅</div>
        <h2 class="assignment-success-title">Assignment Submitted!</h2>
        ${score !== null ? `
          <div class="assignment-success-score">
            <p class="assignment-success-score-value">${Math.round(score)}%</p>
          </div>
        ` : ''}
        <p class="assignment-success-message">
          ${score !== null ? 
            `You got ${correctCount} out of ${totalCount} questions correct.` : 
            'Your teacher will review your work.'}
        </p>
        <button class="btn" id="backToDashboardBtn">Back to Dashboard</button>
      </div>
    `;
    
    document.getElementById('backToDashboardBtn').addEventListener('click', closeAssignmentViewer);
  }
  
  /**
   * Close the assignment viewer
   */
  function closeAssignmentViewer() {
    const overlay = document.getElementById('assignmentViewerOverlay');
    if (overlay) {
      overlay.remove();
    }
    
    // Reload assignments to reflect updated status
    const studentCode = sessionStorage.getItem('rc_user_code');
    if (studentCode) {
      loadStudentAssignments(studentCode).catch(err => {
        console.error(LOG_PREFIX, 'Failed to reload assignments:', err);
      });
    }
  }

  // ============================================================================
  // PR student-portal-reliability: Network guardrails
  // ============================================================================
  // Block or warn about calls to teacher/admin/substitute endpoints from student pages
  function initNetworkGuardrails() {
    if (!window.fetch) return; // No fetch API support
    
    const originalFetch = window.fetch;
    const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === '1';
    
    window.fetch = function(...args) {
      const url = args[0];
      // Handle both string URLs and Request objects with robust type checking
      let urlString = '';
      if (typeof url === 'string') {
        urlString = url;
      } else if (url instanceof Request) {
        urlString = url.url;
      } else if (url && typeof url === 'object' && url.href) {
        urlString = url.href;
      }
      
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
            'BLOCKED: Unauthorized endpoint access attempt:',
            pathname
          );
          
          // Return a rejected promise to prevent the call
          return Promise.reject(new Error('Access denied: Student pages cannot access privileged endpoints'));
        }
      } catch (parseErr) {
        // If URL parsing fails, fall back to substring check
        if (urlString.includes('/.netlify/functions/teacher-') ||
            urlString.includes('/.netlify/functions/admin-') ||
            urlString.includes('/.netlify/functions/substitute-')) {
          console.error(
            LOG_PREFIX,
            'BLOCKED: Unauthorized endpoint access attempt'
          );
          return Promise.reject(new Error('Access denied: Student pages cannot access privileged endpoints'));
        }
      }
      
      // Allow the call
      return originalFetch.apply(this, args);
    };
    
    if (DEBUG_MODE) {
      console.log(LOG_PREFIX, 'Network guardrails initialized');
    }
  }

  /**
   * Initialize the portal
   * PR 315: Handle authenticated state and show dashboard
   * PR student-portal-reliability: Added try/catch and error handling
   * PR fix-student-watchdog-login: Handle resume failure and preserve form inputs
   */
  async function init() {
    try {
      console.log(LOG_PREFIX, 'Initializing student portal');

      // Initialize guardrails
      initNetworkGuardrails();
      
      // PR fix-student-watchdog-login: Check for resume failure reason
      const urlParams = new URLSearchParams(window.location.search);
      const reason = urlParams.get('reason');
      
      if (reason === 'portal_resume_failed') {
        // Resume failed - show login without starting watchdog
        // Show one-time warning message
        console.warn(LOG_PREFIX, 'Portal resume failed, please sign in again');
        
        // Clear the reason parameter from URL (don't propagate it)
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', newUrl);
        
        // Show login form (watchdog won't start due to reason param check)
        showLogin();
        
        // Show friendly message to user
        showMessage('Your session could not be restored. Please sign in again.', 'info');
        
        // Load student roster with error handling
        try {
          await loadStudentRoster();
        } catch (err) {
          console.error(LOG_PREFIX, 'Failed to load student roster:', err);
          // Continue - manual entry will be available
        }

        // Setup event handlers
        setupEventHandlers();
        return;
      }
      
      // Check if already authenticated (from auto-login or existing session)
      if (isAuthenticated()) {
        console.log(LOG_PREFIX, 'Already authenticated, showing dashboard');
        // Initialize boot watchdog ONLY for authenticated users
        initBootWatchdog();
        showDashboard();
        return;
      }

      // Not authenticated - show login form (no watchdog needed)
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
      // Clear any existing watchdog timer before reinitializing
      if (state.bootWatchdogTimer) {
        clearTimeout(state.bootWatchdogTimer);
        state.bootWatchdogTimer = null;
      }
      init();
    });
    
    btnReload.addEventListener('click', () => {
      window.location.reload();
    });
  }

  /**
   * Show login view
   * PR student-portal-reliability: Added null checks
   * PR fix-student-watchdog-login: Restore form inputs if available
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
    
    // PR fix-student-watchdog-login: Try to restore form inputs
    // This preserves user input during re-renders
    setTimeout(() => {
      const restored = restoreFormInputs();
      if (restored) {
        console.log(LOG_PREFIX, 'Form inputs restored from previous session');
      }
    }, 100); // Small delay to ensure DOM is ready
  }

  /**
   * Show dashboard view (PR 315)
   * PR student-portal-reliability: Added null checks and proper cleanup
   * PR fix-student-dashboard: Load real IEP goals data
   */
  function showDashboard() {
    // Clear watchdog now that dashboard is successfully showing
    if (state.bootWatchdogTimer) {
      clearTimeout(state.bootWatchdogTimer);
      state.bootWatchdogTimer = null;
      console.log(LOG_PREFIX, 'Boot watchdog cleared - dashboard visible');
    }
    
    // Clear the portal_resume_failed_at flag on successful dashboard show
    try {
      sessionStorage.removeItem('portal_resume_failed_at');
    } catch (err) {
      console.error(LOG_PREFIX, 'Failed to clear resume failure flag:', err);
    }
    
    const loginView = document.getElementById('loginView');
    const dashboardView = document.getElementById('studentDashboardView');
    const studentCodeDisplay = document.getElementById('studentCodeDisplay');
    const btnLogout = document.getElementById('btnLogout');
    
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
    
    // Setup event handlers only once to prevent duplicates
    if (!state.dashboardHandlersAttached) {
      if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
      }
      
      state.dashboardHandlersAttached = true;
    }
    
    console.log(LOG_PREFIX, 'Dashboard view shown for:', studentCode);
    
    // Load student goals and progress data
    if (studentCode) {
      loadStudentGoals(studentCode).catch(err => {
        console.error(LOG_PREFIX, 'Failed to load student goals:', err);
      });
      
      // Load student assignments
      loadStudentAssignments(studentCode).catch(err => {
        console.error(LOG_PREFIX, 'Failed to load student assignments:', err);
      });
    }
  }

  /**
   * Handle logout (PR 315)
   * PR-student-portal-fallback: Also clear localStorage rc_auth and legacy keys
   */
  function handleLogout() {
    console.log(LOG_PREFIX, 'Logout requested');
    
    // Clear watchdog timer if active
    if (state.bootWatchdogTimer) {
      clearTimeout(state.bootWatchdogTimer);
      state.bootWatchdogTimer = null;
    }
    
    // Clear session storage (student portal uses sessionStorage)
    sessionStorage.removeItem('rc_user_code');
    sessionStorage.removeItem('rc_user_role');
    
    // PR-student-portal-fallback: Clear localStorage rc_auth (prevents role bleed from teacher/admin)
    localStorage.removeItem('rc_auth');
    
    // Clear any legacy role keys that might exist
    localStorage.removeItem('rc_user_code');
    localStorage.removeItem('rc_user_role');
    
    // Reset state flags for next login
    state.dashboardHandlersAttached = false;
    state.redirectingToHub = false;
    
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
   * PR fix-student-watchdog-login: Preserve inputs on error, clear on success
   */
  async function performLogin(studentCode, password) {
    console.log(LOG_PREFIX, 'Attempting login for:', studentCode);

    // PR fix-student-watchdog-login: Save form inputs before login attempt
    saveFormInputs();

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
        // PR fix-student-watchdog-login: Keep form inputs on error (already saved)
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
        
        // PR fix-student-watchdog-login: Clear saved form inputs on success
        clearSavedFormInputs();
        
        // PR fix-student-watchdog-login: Clear resume failure flag on successful login
        sessionStorage.removeItem('portal_resume_failed_at');
        
        // PR 335: Clear auto-login attempted flag so redirect with ?auto=1 works
        sessionStorage.removeItem('studentAutoLoginAttempted');

        showMessage('Login successful! Loading your portal...', 'success');

        // FIX: Show dashboard directly instead of redirecting
        // This avoids unnecessary page reload and ensures session persists
        // The redirect was causing issues with session persistence and watchdog timing
        setTimeout(() => {
          console.log(LOG_PREFIX, 'Showing dashboard for:', studentCode);
          showDashboard();
        }, 500);
      } else {
        // Login failed with ok: false
        const errorMsg = data.error || 'Invalid student code or password';
        console.error(LOG_PREFIX, 'Login failed:', errorMsg);
        showMessage(errorMsg, 'error');
        // PR fix-student-watchdog-login: Keep form inputs on error (already saved)
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
      // PR fix-student-watchdog-login: Keep form inputs on error (already saved)
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
