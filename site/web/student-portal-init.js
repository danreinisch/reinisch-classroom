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
      // Check if dashboard is visible and healthy
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
      
      // Dashboard is not visible - show login form in-place as fallback
      // This preserves the session and avoids redirect loops
      console.warn(
        LOG_PREFIX,
        `Boot watchdog: dashboard not visible after ${WATCHDOG_MS}ms, showing login form as fallback`
      );
      
      // Show login view in-place (non-destructive fallback)
      const loginView = document.getElementById('loginView');
      if (loginView) {
        loginView.classList.remove('hidden');
      }
      if (dashboardView) {
        dashboardView.classList.add('hidden');
      }
      
      // Show helpful message to user about the timeout
      try {
        showMessage('Dashboard took too long to load. Please sign in to try again.', 'info');
      } catch (err) {
        console.error(LOG_PREFIX, 'Failed to show timeout message:', err);
      }
      
      console.log(LOG_PREFIX, 'Login form displayed - session preserved, user can retry');
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
    currentDay: 0,
    answers: new Map(),
  };
  
  // Constants
  const PANEL_TRANSITION_MS = 300; // Must match CSS transition duration
  
  /**
   * Text-to-speech utility function for accessibility
   * Reads text aloud using browser's built-in speech synthesis
   */
  function speakText(text) {
    // Check if speech synthesis is supported
    if (!('speechSynthesis' in window)) {
      console.warn(LOG_PREFIX, 'Speech synthesis not supported in this browser');
      return;
    }
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Speak
    window.speechSynthesis.speak(utterance);
  }
  
  /**
   * Load and render student assignments
   */
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
      card.addEventListener('click', function(e) {
        // Prevent event from bubbling to portal-b-ui.js delegation handler
        // which would navigate away and destroy the overlay
        e.stopPropagation();
        e.preventDefault();
        const instanceId = this.getAttribute('data-instance-id');
        const instance = instances.find(i => i.id === instanceId);
        if (instance) {
          openAssignmentViewer(instance);
        }
      });
    });
  }
  
  /**
   * Open the assignment viewer as a right-slide panel
   */
  function openAssignmentViewer(instance) {
    console.log(LOG_PREFIX, 'Opening assignment viewer for:', instance.id);
    
    assignmentViewerState.currentAssignment = instance;
    assignmentViewerState.currentQuestionIndex = 0;
    assignmentViewerState.answers = new Map();
    assignmentViewerState.currentDay = 0;
    
    // Check if assignment is submitted or graded (read-only mode)
    const isReadOnly = instance.status === 'Submitted' || instance.status === 'Graded';
    assignmentViewerState.isReadOnly = isReadOnly;
    
    // Load saved answers from instance settings if in read-only mode
    if (isReadOnly && instance.settings && instance.settings.answers) {
      Object.entries(instance.settings.answers).forEach(([key, value]) => {
        assignmentViewerState.answers.set(key, value);
      });
    }
    
    const assignment = instance.assignment || {};
    const meta = assignment.meta || {};
    
    // Debug logging for meta content
    console.log(LOG_PREFIX, 'Assignment meta:', JSON.stringify(meta).substring(0, 200));
    console.log(LOG_PREFIX, 'Assignment status:', instance.status, 'Read-only:', isReadOnly);
    if (!meta.days || meta.days.length === 0) {
      console.warn(LOG_PREFIX, 'Assignment has no structured content (meta.days is empty)');
    }
    
    // Create backdrop (now the flex container)
    const backdrop = document.createElement('div');
    backdrop.className = 'st-panel-backdrop';
    backdrop.id = 'assignmentPanelBackdrop';
    
    // Create panel as a child of backdrop
    const panel = document.createElement('div');
    panel.className = 'st-assignment-panel';
    panel.id = 'assignmentPanel';
    
    // Build the panel UI
    if (!meta.days || meta.days.length === 0) {
      // No structured content - show fallback
      renderNoContentPanel(panel, instance);
    } else {
      // Render structured assignment with days
      renderStructuredAssignment(panel, instance);
    }
    
    // Append panel to backdrop, then backdrop to body
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    
    // Add backdrop click handler (but not on panel clicks)
    backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop) {
        closeAssignmentViewer();
      }
    });
    
    // Trigger animation
    requestAnimationFrame(() => {
      backdrop.classList.add('open');
      panel.classList.add('open');
    });
  }
  
  /**
   * Render no content message in panel
   */
  function renderNoContentPanel(panel, instance) {
    const assignment = instance.assignment || {};
    const title = escapeHtml(assignment.title || 'Assignment');
    
    panel.innerHTML = `
      <button class="st-panel-back-btn" id="panelBackBtn">
        ← Back to Dashboard
      </button>
      <div class="st-panel-header">
        <h2>${title}</h2>
        <button class="st-panel-close-btn" id="panelCloseBtn">✕</button>
      </div>
      <div style="text-align: center; padding: 60px 24px;">
        <div style="font-size: 72px; margin-bottom: 24px;">📭</div>
        <h3 style="font-size: 1.5rem; font-weight: 700; margin: 0 0 16px 0;">
          No Content Available
        </h3>
        <p style="font-size: 1rem; opacity: 0.8; margin: 0 0 12px 0;">
          This assignment has no content yet. Please check back later or contact your teacher.
        </p>
        <p style="font-size: 0.875rem; opacity: 0.6; margin: 0;">
          Note: If this assignment was recently created, your teacher may need to re-issue it to load the content.
        </p>
      </div>
    `;
    
    panel.querySelector('#panelBackBtn').addEventListener('click', closeAssignmentViewer);
    panel.querySelector('#panelCloseBtn').addEventListener('click', closeAssignmentViewer);
  }
  
  /**
   * Render structured assignment with days/questions/writing prompts
   */
  function renderStructuredAssignment(panel, instance) {
    const assignment = instance.assignment || {};
    const meta = assignment.meta || {};
    const title = escapeHtml(assignment.title || 'Assignment');
    const days = meta.days || [];
    
    // Build day tabs
    const dayTabsHtml = days.map((day, idx) => {
      const active = idx === assignmentViewerState.currentDay ? 'active' : '';
      return `
        <button class="st-day-tab ${active}" data-day-index="${idx}">
          Day ${day.day_number}
        </button>
      `;
    }).join('');
    
    panel.innerHTML = `
      <button class="st-panel-back-btn" id="panelBackBtn">
        ← Back to Dashboard
      </button>
      <div class="st-panel-header">
        <h2>${title}</h2>
        <button class="st-panel-close-btn" id="panelCloseBtn">✕</button>
      </div>
      ${days.length > 1 ? `<div class="st-day-tabs" id="dayTabs">${dayTabsHtml}</div>` : ''}
      <div id="dayContent"></div>
    `;
    
    panel.querySelector('#panelBackBtn').addEventListener('click', closeAssignmentViewer);
    panel.querySelector('#panelCloseBtn').addEventListener('click', closeAssignmentViewer);
    
    // Attach day tab handlers
    const dayTabs = panel.querySelectorAll('.st-day-tab');
    dayTabs.forEach((tab, idx) => {
      tab.addEventListener('click', () => {
        assignmentViewerState.currentDay = idx;
        dayTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderCurrentDay(panel, instance);
      });
    });
    
    // Render first day
    renderCurrentDay(panel, instance);
  }
  
  /**
   * Render the current day's content
   */
  function renderCurrentDay(panel, instance) {
    const assignment = instance.assignment || {};
    const meta = assignment.meta || {};
    const days = meta.days || [];
    const dayData = days[assignmentViewerState.currentDay];
    
    if (!dayData) return;
    
    const dayContent = panel.querySelector('#dayContent');
    if (!dayContent) return;
    
    if (dayData.type === 'questions') {
      renderQuestionsDay(dayContent, dayData, instance);
    } else if (dayData.type === 'writing_prompt') {
      renderWritingPromptDay(dayContent, dayData, instance);
    }
  }
  
  /**
   * Render questions day
   */
  function renderQuestionsDay(container, dayData, instance) {
    const questions = dayData.questions || [];
    const isReadOnly = assignmentViewerState.isReadOnly;
    
    const questionsHtml = questions.map((q) => {
      const questionId = `${dayData.day_number}_${q.number}`;
      const choices = q.choices || [];
      const savedAnswer = assignmentViewerState.answers.get(questionId);
      
      const choicesHtml = choices.map(choice => {
        const isChecked = savedAnswer === choice.letter ? 'checked' : '';
        const disabledAttr = isReadOnly ? 'disabled' : '';
        return `
          <div class="st-choice" data-question-id="${questionId}" data-letter="${choice.letter}">
            <input type="radio" name="q_${questionId}" id="q_${questionId}_${choice.letter}" value="${choice.letter}" ${isChecked} ${disabledAttr}>
            <label class="st-choice-label" for="q_${questionId}_${choice.letter}">
              <strong>${choice.letter})</strong> ${escapeHtml(choice.text)}
              <button class="st-tts-btn" data-text="${escapeHtml(choice.text)}" title="Read this answer aloud" aria-label="Read answer ${choice.letter} aloud">🔊</button>
            </label>
          </div>
        `;
      }).join('');
      
      const hintHtml = q.hint ? `
        <div class="st-hint-section">
          <button class="st-hint-btn" data-hint-id="hint_${questionId}">💡 Show Hint</button>
          <div class="st-hint-content" id="hint_${questionId}">
            ${escapeHtml(q.hint)}
            <button class="st-tts-btn" data-text="${q.hint}" title="Read this hint aloud" aria-label="Read hint aloud">🔊</button>
          </div>
        </div>
      ` : '';
      
      return `
        <div class="st-question-container">
          <div class="st-question-number">Question ${q.number}</div>
          <div class="st-question-text">
            ${escapeHtml(q.text)}
            <button class="st-tts-btn" data-text="${escapeHtml(q.text)}" title="Read this question aloud" aria-label="Read question ${q.number} aloud">🔊</button>
          </div>
          <div class="st-choices">
            ${choicesHtml}
          </div>
          ${hintHtml}
        </div>
      `;
    }).join('');
    
    const readOnlyBanner = isReadOnly ? `
      <div class="st-submitted-banner">
        ✓ Submitted — Waiting for teacher review
      </div>
    ` : '';
    
    container.innerHTML = `
      <h3 style="margin-top: 0; margin-bottom: 20px; font-size: 18px;">
        ${escapeHtml(dayData.label)}
      </h3>
      ${readOnlyBanner}
      ${questionsHtml}
    `;
    
    // Attach choice handlers (only if not read-only)
    if (!isReadOnly) {
      container.querySelectorAll('.st-choice').forEach(choiceEl => {
        const input = choiceEl.querySelector('input[type="radio"]');
        
        choiceEl.addEventListener('click', function(e) {
          if (e.target.tagName === 'INPUT') return; // Let radio handle its own click
          
          const questionId = this.getAttribute('data-question-id');
          const letter = this.getAttribute('data-letter');
          const choicesContainer = this.closest('.st-choices');
          
          // Mark the selected answer
          input.checked = true;
          
          // Remove previous selection styling
          choicesContainer.querySelectorAll('.st-choice').forEach(c => {
            c.classList.remove('selected');
          });
          
          // Mark this choice as selected (neutral styling)
          this.classList.add('selected');
          
          // Save answer
          assignmentViewerState.answers.set(questionId, letter);
          saveAnswersToServer(instance);
        });
      });
    }
    
    // Attach hint handlers
    container.querySelectorAll('.st-hint-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const hintId = this.getAttribute('data-hint-id');
        const hintContent = document.getElementById(hintId);
        if (hintContent) {
          hintContent.classList.toggle('show');
          this.textContent = hintContent.classList.contains('show') ? '💡 Hide Hint' : '💡 Show Hint';
        }
      });
    });
    
    // Attach TTS handlers
    container.querySelectorAll('.st-tts-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation(); // Don't trigger parent click handlers
        const text = this.getAttribute('data-text');
        if (text) {
          speakText(text);
        }
      });
    });
  }
  
  /**
   * Render writing prompt day
   */
  function renderWritingPromptDay(container, dayData, instance) {
    const isReadOnly = assignmentViewerState.isReadOnly;
    
    const structureHtml = dayData.structure && dayData.structure.length > 0 ? `
      <div class="st-writing-structure">
        <h4>Writing Structure:</h4>
        <ul>
          ${dayData.structure.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    ` : '';
    
    const hintsHtml = dayData.hints && dayData.hints.length > 0 ? `
      <div class="st-hint-section">
        <button class="st-hint-btn" id="writingHintsBtn">💡 Show Writing Hints</button>
        <div class="st-hint-content" id="writingHints">
          <ul style="margin: 0; padding-left: 20px;">
            ${dayData.hints.map(hint => `
              <li>
                ${escapeHtml(hint)}
                <button class="st-tts-btn" data-text="${hint}" title="Read this hint aloud" aria-label="Read hint aloud">🔊</button>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    ` : '';
    
    // Get saved writing response from instance settings
    const savedResponse = (instance.settings && instance.settings.writing_response) || '';
    
    const readOnlyBanner = isReadOnly ? `
      <div class="st-submitted-banner">
        ✓ Submitted — Waiting for teacher review
      </div>
    ` : '';
    
    const submitButtonHtml = isReadOnly ? `
      <div class="st-submitted-message">✓ Submitted — Waiting for teacher review</div>
    ` : `
      <button class="st-submit-btn" id="submitWritingBtn">Submit Response</button>
    `;
    
    // Builder toggle button (only show if not read-only)
    const builderToggleHtml = !isReadOnly ? `
      <button class="st-builder-toggle-btn" id="builderToggleBtn">📝 Use Writing Builder</button>
    ` : '';
    
    // Builder tips from structure
    const builderTipsHtml = dayData.structure && dayData.structure.length > 0 ? 
      dayData.structure.map(item => `<div class="st-builder-tip">${escapeHtml(item)}</div>`).join('') : '';
    
    // Builder UI
    const builderHtml = !isReadOnly ? `
      <div class="st-writing-builder" id="writingBuilder">
        ${builderTipsHtml}
        
        <!-- Topic Sentence Section -->
        <div class="st-builder-section" data-section="topic">
          <div class="st-builder-section-header">
            <span>Topic Sentence</span>
            <span class="st-builder-word-count" id="builderTopicCount">0 words</span>
          </div>
          <textarea 
            class="st-builder-textarea" 
            id="builderTopicSentence"
            placeholder="Write your main claim or thesis statement here..."></textarea>
          <div class="st-builder-feedback" id="builderTopicFeedback"></div>
        </div>
        
        <!-- Supporting Detail 1 -->
        <div class="st-builder-section" data-section="detail">
          <div class="st-builder-section-header">
            <span>Supporting Detail 1</span>
            <span class="st-builder-word-count" id="builderDetail1Count">0 words</span>
          </div>
          <select class="st-builder-select" id="builderTransition1">
            <option value="">Choose a transition...</option>
            <option value="First,">First,</option>
            <option value="To begin with,">To begin with,</option>
            <option value="For instance,">For instance,</option>
            <option value="For example,">For example,</option>
            <option value="One reason is that">One reason is that</option>
          </select>
          <textarea 
            class="st-builder-textarea" 
            id="builderDetail1"
            placeholder="Provide evidence or an example that supports your topic sentence..."></textarea>
          <div class="st-builder-feedback" id="builderDetail1Feedback"></div>
        </div>
        
        <!-- Supporting Detail 2 -->
        <div class="st-builder-section" data-section="detail">
          <div class="st-builder-section-header">
            <span>Supporting Detail 2</span>
            <span class="st-builder-word-count" id="builderDetail2Count">0 words</span>
          </div>
          <select class="st-builder-select" id="builderTransition2">
            <option value="">Choose a transition...</option>
            <option value="Additionally,">Additionally,</option>
            <option value="Furthermore,">Furthermore,</option>
            <option value="Moreover,">Moreover,</option>
            <option value="Another reason is">Another reason is</option>
            <option value="In addition,">In addition,</option>
            <option value="Also,">Also,</option>
          </select>
          <textarea 
            class="st-builder-textarea" 
            id="builderDetail2"
            placeholder="Provide a second piece of evidence or example..."></textarea>
          <div class="st-builder-feedback" id="builderDetail2Feedback"></div>
        </div>
        
        <!-- Add Detail 3 Button -->
        <button class="st-builder-add-detail-btn" id="builderAddDetail3Btn">+ Add Third Detail (Optional)</button>
        
        <!-- Supporting Detail 3 (Hidden by default) -->
        <div class="st-builder-section" data-section="detail" id="builderDetail3Section" style="display: none;">
          <div class="st-builder-section-header">
            <span>Supporting Detail 3 (Optional)</span>
            <span class="st-builder-word-count" id="builderDetail3Count">0 words</span>
          </div>
          <select class="st-builder-select" id="builderTransition3">
            <option value="">Choose a transition...</option>
            <option value="Finally,">Finally,</option>
            <option value="Lastly,">Lastly,</option>
            <option value="Most importantly,">Most importantly,</option>
            <option value="The most significant">The most significant</option>
          </select>
          <textarea 
            class="st-builder-textarea" 
            id="builderDetail3"
            placeholder="Provide a third piece of evidence or example (optional)..."></textarea>
          <div class="st-builder-feedback" id="builderDetail3Feedback"></div>
        </div>
        
        <!-- Conclusion Section -->
        <div class="st-builder-section" data-section="conclusion">
          <div class="st-builder-section-header">
            <span>Conclusion</span>
            <span class="st-builder-word-count" id="builderConclusionCount">0 words</span>
          </div>
          <select class="st-builder-select" id="builderTransitionConc">
            <option value="">Choose a transition...</option>
            <option value="In conclusion,">In conclusion,</option>
            <option value="To summarize,">To summarize,</option>
            <option value="Overall,">Overall,</option>
            <option value="Therefore,">Therefore,</option>
            <option value="Ultimately,">Ultimately,</option>
          </select>
          <textarea 
            class="st-builder-textarea" 
            id="builderConclusion"
            placeholder="Restate your main point and summarize why it matters..."></textarea>
          <div class="st-builder-feedback" id="builderConclusionFeedback"></div>
        </div>
        
        <!-- Builder Actions -->
        <div class="st-builder-actions">
          <button class="st-builder-transfer-btn" id="builderTransferBtn">Transfer to Response ↓</button>
          <button class="st-builder-clear-btn" id="builderClearBtn">Clear Builder</button>
        </div>
      </div>
    ` : '';
    
    container.innerHTML = `
      <h3 style="margin-top: 0; margin-bottom: 20px; font-size: 18px;">
        ${escapeHtml(dayData.label)}
      </h3>
      ${readOnlyBanner}
      <div class="st-writing-section">
        <div class="st-writing-prompt">
          ${escapeHtml(dayData.prompt)}
          <button class="st-tts-btn" data-text="${escapeHtml(dayData.prompt)}" title="Read this writing prompt aloud" aria-label="Read writing prompt aloud">🔊</button>
        </div>
        ${structureHtml}
        ${builderToggleHtml}
        ${builderHtml}
        <textarea 
          class="st-writing-textarea" 
          id="writingResponse" 
          placeholder="Type your response here..."
          ${isReadOnly ? 'disabled' : ''}
        >${escapeHtml(savedResponse)}</textarea>
        ${hintsHtml}
        ${submitButtonHtml}
      </div>
    `;
    
    // Attach builder toggle handler
    const toggleBtn = container.querySelector('#builderToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function() {
        const builder = document.getElementById('writingBuilder');
        if (builder) {
          builder.classList.toggle('show');
          this.textContent = builder.classList.contains('show') ? '📝 Hide Writing Builder' : '📝 Use Writing Builder';
        }
      });
    }
    
    // Attach builder event handlers
    if (!isReadOnly) {
      // Word count and validation for topic sentence
      const topicInput = container.querySelector('#builderTopicSentence');
      if (topicInput) {
        const handler = () => {
          updateBuilderWordCount('builderTopicSentence', 'builderTopicCount');
          validateTopicSentence();
        };
        topicInput.addEventListener('input', handler);
      }
      
      // Word count and validation for detail 1
      const detail1Input = container.querySelector('#builderDetail1');
      if (detail1Input) {
        const handler = () => {
          updateBuilderWordCount('builderDetail1', 'builderDetail1Count');
          validateSupportingDetail('builderDetail1', 'builderDetail1Feedback');
        };
        detail1Input.addEventListener('input', handler);
      }
      
      // Word count and validation for detail 2
      const detail2Input = container.querySelector('#builderDetail2');
      if (detail2Input) {
        const handler = () => {
          updateBuilderWordCount('builderDetail2', 'builderDetail2Count');
          validateSupportingDetail('builderDetail2', 'builderDetail2Feedback');
        };
        detail2Input.addEventListener('input', handler);
      }
      
      // Word count and validation for detail 3
      const detail3Input = container.querySelector('#builderDetail3');
      if (detail3Input) {
        const handler = () => {
          updateBuilderWordCount('builderDetail3', 'builderDetail3Count');
          validateSupportingDetail('builderDetail3', 'builderDetail3Feedback');
        };
        detail3Input.addEventListener('input', handler);
      }
      
      // Word count and validation for conclusion
      const conclusionInput = container.querySelector('#builderConclusion');
      if (conclusionInput) {
        const handler = () => {
          updateBuilderWordCount('builderConclusion', 'builderConclusionCount');
          validateConclusion();
        };
        conclusionInput.addEventListener('input', handler);
      }
      
      // Add detail 3 button
      const addDetail3Btn = container.querySelector('#builderAddDetail3Btn');
      if (addDetail3Btn) {
        addDetail3Btn.addEventListener('click', toggleDetail3);
      }
      
      // Transfer button
      const transferBtn = container.querySelector('#builderTransferBtn');
      if (transferBtn) {
        transferBtn.addEventListener('click', transferBuilderToResponse);
      }
      
      // Clear button
      const clearBtn = container.querySelector('#builderClearBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', clearBuilder);
      }
    }
    
    // Attach hint handler
    const hintsBtn = container.querySelector('#writingHintsBtn');
    if (hintsBtn) {
      hintsBtn.addEventListener('click', function() {
        const hintsContent = document.getElementById('writingHints');
        if (hintsContent) {
          hintsContent.classList.toggle('show');
          this.textContent = hintsContent.classList.contains('show') ? '💡 Hide Writing Hints' : '💡 Show Writing Hints';
        }
      });
    }
    
    // Attach TTS handlers for writing prompt and hints
    container.querySelectorAll('.st-tts-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const text = this.getAttribute('data-text');
        if (text) {
          speakText(text);
        }
      });
    });
    
    // Attach submit handler
    const submitBtn = container.querySelector('#submitWritingBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async function() {
        const textarea = document.getElementById('writingResponse');
        const response = textarea ? textarea.value : '';
        
        if (!response.trim()) {
          // Show inline error instead of alert
          let errorMsg = container.querySelector('.st-writing-error');
          if (!errorMsg) {
            errorMsg = document.createElement('div');
            errorMsg.className = 'st-writing-error';
            errorMsg.style.cssText = 'color: #fca5a5; margin-top: 8px; font-size: 14px;';
            errorMsg.textContent = 'Please write a response before submitting.';
            textarea.parentElement.insertBefore(errorMsg, submitBtn);
          }
          textarea.focus();
          return;
        }
        
        // Remove any previous error message
        const errorMsg = container.querySelector('.st-writing-error');
        if (errorMsg) errorMsg.remove();
        
        this.disabled = true;
        this.textContent = 'Submitting...';
        
        try {
          await saveWritingResponseToServer(instance, response);
          this.textContent = '✓ Submitted!';
          setTimeout(() => {
            this.textContent = 'Submit Response';
            this.disabled = false;
          }, 2000);
        } catch (err) {
          console.error(LOG_PREFIX, 'Failed to submit writing response:', err);
          // Show inline error instead of alert
          let errorMsg = container.querySelector('.st-writing-error');
          if (!errorMsg) {
            errorMsg = document.createElement('div');
            errorMsg.className = 'st-writing-error';
            errorMsg.style.cssText = 'color: #fca5a5; margin-top: 8px; font-size: 14px;';
            this.parentElement.insertBefore(errorMsg, this.nextSibling);
          }
          errorMsg.textContent = 'Failed to submit response. Please try again.';
          this.textContent = 'Submit Response';
          this.disabled = false;
        }
      });
    }
    
    // Attach TTS handlers for writing prompt
    container.querySelectorAll('.st-tts-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const text = this.getAttribute('data-text');
        if (text) {
          speakText(text);
        }
      });
    });
  }
  
  /**
   * Save answers to server
   */
  async function saveAnswersToServer(instance) {
    const studentCode = sessionStorage.getItem('rc_user_code');
    if (!studentCode) {
      console.warn(LOG_PREFIX, 'No student code in session, cannot save answers');
      return;
    }
    
    const answersObj = {};
    assignmentViewerState.answers.forEach((value, key) => {
      answersObj[key] = value;
    });
    
    try {
      const response = await fetch('/.netlify/functions/student-submit-answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instance_id: instance.id,
          student_code: studentCode,
          answers: answersObj
        })
      });
      
      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }
      
      console.log(LOG_PREFIX, 'Answers saved successfully');
    } catch (err) {
      console.error(LOG_PREFIX, 'Failed to save answers:', err);
      // Don't alert - let the student continue working
    }
  }
  
  /**
   * Save writing response to server
   */
  async function saveWritingResponseToServer(instance, writingResponse) {
    const studentCode = sessionStorage.getItem('rc_user_code');
    if (!studentCode) {
      throw new Error('No student code in session');
    }
    
    const response = await fetch('/.netlify/functions/student-submit-answer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instance_id: instance.id,
        student_code: studentCode,
        writing_response: writingResponse
      })
    });
    
    if (!response.ok) {
      throw new Error(`Submit failed: ${response.status}`);
    }
    
    console.log(LOG_PREFIX, 'Writing response submitted successfully');
  }
  
  /**
   * Writing Builder Functions - Ported from written-response-builder.js
   */
  
  function updateBuilderWordCount(textareaId, countId) {
    const textarea = document.getElementById(textareaId);
    const countElement = document.getElementById(countId);
    if (!textarea || !countElement) return;
    
    const text = textarea.value.trim();
    const wordCount = text === '' ? 0 : text.split(/\s+/).length;
    countElement.textContent = `${wordCount} words`;
  }
  
  function validateTopicSentence() {
    const input = document.getElementById('builderTopicSentence');
    const feedback = document.getElementById('builderTopicFeedback');
    if (!input || !feedback) return;
    
    const text = input.value.trim();
    const messages = [];
    if (!text) { feedback.innerHTML = ''; return; }
    
    if (text[0] === text[0].toLowerCase()) messages.push('<p class="error">Your sentence should start with a capital letter.</p>');
    if (!/[.!?]$/.test(text)) messages.push('<p class="error">Your sentence should end with proper punctuation (. ! or ?).</p>');
    if (text.endsWith('?')) messages.push('<p class="error">Topic sentences should be statements, not questions. Make a claim instead of asking.</p>');
    
    const words = text.split(/\s+/);
    if (text.length < 15) messages.push('<p class="error">Too short. A strong topic sentence needs more development (aim for at least 10-15 words).</p>');
    else if (words.length < 8) messages.push('<p class="warn">Your sentence is quite brief. Consider adding more detail about your main point.</p>');
    else if (words.length <= 25) messages.push('<p>✔️ Good sentence length.</p>');
    else messages.push('<p class="warn">Your sentence is quite long. Consider breaking it into two sentences or simplifying.</p>');
    
    const weakStarters = /^(i think|i believe|i feel|in my opinion|i guess|i would say|this essay|this paragraph|this paper)/i;
    if (weakStarters.test(text)) messages.push('<p class="error">Avoid weak starters like "I think," "I believe," or "This essay." State your claim directly and confidently.</p>');
    
    if (/^(yes|no|maybe|sure|not really|kind of|sort of)/i.test(text)) messages.push('<p class="error">This sounds like a simple answer, not a topic sentence. Restate the question as a complete claim in your own words.</p>');
    
    const pronouns = ["he","she","they","it","we","you","i"];
    const contentWords = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
    const mainWords = contentWords.filter(w => w.length > 3 && !pronouns.includes(w));
    if (mainWords.length === 0) messages.push('<p class="error">Your sentence needs a clear, specific subject. What exactly are you writing about?</p>');
    else if (mainWords.length < 3) messages.push('<p class="warn">Your topic sentence could be more specific. Add more detail about your subject.</p>');
    else messages.push('<p>✔️ Your sentence has a clear subject.</p>');
    
    const vagueWords = /(thing|stuff|good|bad|nice|interesting|a lot|very|really|some|many)/i;
    if (vagueWords.test(text)) messages.push('<p class="warn">Try to be more specific. Avoid vague words like "thing," "stuff," "good," "bad," "nice," "interesting," etc.</p>');
    
    const purposefulPatterns = /(should|must|because|since|therefore|demonstrates|proves|shows|reveals|argues|suggests|explains|indicates|illustrates|the main reason|one reason|the primary|the key|the most important)/i;
    if (purposefulPatterns.test(text)) messages.push('<p>✔️ Your sentence has clear direction and purpose. Excellent!</p>');
    else messages.push('<p class="warn">Your sentence needs stronger direction. Include words that show your position or reasoning (e.g., "because," "demonstrates," "proves," "should").</p>');
    
    if (/will (discuss|talk about|explain|write about|tell you)/i.test(text)) messages.push(`<p class="error">Don't announce what you'll do ("I will discuss..."). Instead, make your claim directly.</p>`);
    
    const sentenceCount = (text.match(/[.!?]+/g) || []).length;
    if (sentenceCount > 1) messages.push('<p class="warn">A topic sentence should typically be ONE sentence. Consider combining your ideas or using only the strongest one.</p>');
    
    if (/n't|'re|'ve|'ll|'d|'s/.test(text)) messages.push('<p class="warn">Avoid contractions in formal writing. Write out "don\'t" as "do not," etc.</p>');
    
    const errorCount = messages.filter(m => m.includes('class="error"')).length;
    const warnCount = messages.filter(m => m.includes('class="warn"')).length;
    if (errorCount === 0 && warnCount === 0) messages.push('<p style="background: rgba(16,185,129,.2); font-weight: bold;">🌟 Excellent topic sentence! This is ready to use.</p>');
    else if (errorCount === 0 && warnCount <= 2) messages.push('<p style="background: rgba(34,197,94,.15);">✅ Good topic sentence! Consider addressing the suggestions above to make it even stronger.</p>');
    else if (errorCount > 0) messages.push('<p style="background: rgba(239,68,68,.2); font-weight: bold;">⚠️ This needs revision. Please address the errors above before continuing.</p>');
    
    feedback.innerHTML = messages.join('');
  }
  
  function validateSupportingDetail(detailId, feedbackId) {
    const detail = document.getElementById(detailId);
    const feedback = document.getElementById(feedbackId);
    const topicSentence = document.getElementById('builderTopicSentence');
    if (!detail || !feedback) return;
    
    const text = detail.value.trim();
    const messages = [];
    if (!text) { feedback.innerHTML = ''; return; }
    
    const words = text.split(/\s+/);
    if (words.length < 15) messages.push('<p class="error">Too short. Supporting details need substantial development (aim for at least 15-20 words).</p>');
    else if (words.length < 20) messages.push('<p class="warn">Consider adding more detail. Strong supporting details typically have 20+ words.</p>');
    else if (words.length <= 75) messages.push('<p>✔️ Good detail length.</p>');
    else messages.push('<p class="warn">Your detail is quite long. Consider breaking it into multiple sentences or being more concise.</p>');
    
    const hasEvidence = /(for example|for instance|such as|specifically|according to|shows that|demonstrates|proves|illustrates|evidence|data|study|research|")/i.test(text);
    if (hasEvidence) messages.push('<p>✔️ Good! You included specific evidence or examples.</p>');
    else messages.push('<p class="warn">Try to include specific evidence, examples, or data to support your claim.</p>');
    
    const hasExplanation = /(this shows|this demonstrates|this means|this proves|this illustrates|because|therefore|as a result|consequently|thus)/i.test(text);
    if (hasExplanation) messages.push('<p>✔️ Good! You explained how your evidence supports your point.</p>');
    else messages.push('<p class="warn">Explain how your evidence connects to your topic sentence.</p>');
    
    if (topicSentence && topicSentence.value.trim()) {
      const topicKeyWords = topicSentence.value.trim().toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 4);
      const detailLower = text.toLowerCase();
      const hasConnection = topicKeyWords.some(word => detailLower.includes(word));
      if (!hasConnection && topicKeyWords.length > 0) messages.push('<p class="warn">This detail doesn\'t clearly connect to your topic sentence. Make sure it supports your main argument.</p>');
    }
    
    if (!/[.!?]$/.test(text)) messages.push('<p class="error">Your detail should end with proper punctuation.</p>');
    
    const errorCount = messages.filter(m => m.includes('class="error"')).length;
    if (errorCount === 0 && messages.length <= 3) messages.push('<p style="background: rgba(16,185,129,.2);">✅ Strong supporting detail!</p>');
    
    feedback.innerHTML = messages.join('');
  }
  
  function validateConclusion() {
    const conclusion = document.getElementById('builderConclusion');
    const feedback = document.getElementById('builderConclusionFeedback');
    const topicSentence = document.getElementById('builderTopicSentence');
    if (!conclusion || !feedback) return;
    
    const text = conclusion.value.trim();
    const messages = [];
    if (!text) { feedback.innerHTML = ''; return; }
    
    const words = text.split(/\s+/);
    if (words.length < 20) messages.push('<p class="error">Too short. Conclusions should restate your thesis and summarize key points (aim for at least 20 words).</p>');
    else if (words.length <= 60) messages.push('<p>✔️ Good conclusion length.</p>');
    else messages.push('<p class="warn">Your conclusion is quite long. Keep it concise while restating your main points.</p>');
    
    if (!/[.!?]$/.test(text)) messages.push('<p class="error">Your conclusion should end with proper punctuation.</p>');
    
    const introducesNew = /(new|another|also|additionally|furthermore|first time|never mentioned)/i.test(text);
    if (introducesNew) messages.push('<p class="warn">Avoid introducing completely new ideas in your conclusion. Focus on summarizing what you already discussed.</p>');
    
    if (topicSentence && topicSentence.value.trim()) {
      const topicLower = topicSentence.value.trim().toLowerCase();
      const conclusionLower = text.toLowerCase();
      const topicWords = topicLower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 4);
      const sharedWords = topicWords.filter(word => conclusionLower.includes(word));
      if (sharedWords.length === 0 && topicWords.length > 0) {
        messages.push('<p class="error">Your conclusion doesn\'t connect to your topic sentence. Restate your main argument in different words.</p>');
      } else if (sharedWords.length > 0) {
        const similarity = sharedWords.length / topicWords.length;
        if (similarity > 0.7 && topicSentence.value.trim().length > 30) {
          const maxCompareLength = Math.min(40, topicLower.length, conclusionLower.length);
          const topicStart = topicLower.substring(0, maxCompareLength);
          const conclusionStart = conclusionLower.substring(0, maxCompareLength);
          if (topicStart === conclusionStart) {
            messages.push('<p class="warn">Your conclusion is too similar to your topic sentence. Restate your thesis using different words.</p>');
          } else {
            messages.push('<p>✔️ Good! Your conclusion restates your main argument.</p>');
          }
        } else {
          messages.push('<p>✔️ Good! Your conclusion connects to your topic sentence.</p>');
        }
      }
    }
    
    const hasSummary = /(in conclusion|to summarize|in summary|overall|ultimately|therefore|thus|as shown|as demonstrated)/i.test(text);
    if (hasSummary) messages.push('<p>✔️ Good use of concluding language.</p>');
    
    const weakEndings = /(that is all|the end|that's it|i'm done|this concludes|in this essay i|i have shown)/i;
    if (weakEndings.test(text)) messages.push('<p class="warn">Avoid weak endings. End with a strong statement or thought-provoking insight.</p>');
    
    const hasImpact = /(important|significant|matters|crucial|essential|should|must|needs|future|impact|consequence)/i.test(text);
    if (hasImpact) messages.push('<p>✔️ Good! You emphasized the importance or broader implications of your argument.</p>');
    else messages.push('<p class="warn">Consider ending with why your argument matters or what readers should take away.</p>');
    
    const errorCount = messages.filter(m => m.includes('class="error"')).length;
    if (errorCount === 0 && messages.length <= 4) messages.push('<p style="background: rgba(16,185,129,.2);">✅ Strong conclusion!</p>');
    
    feedback.innerHTML = messages.join('');
  }
  
  function transferBuilderToResponse() {
    const topic = document.getElementById('builderTopicSentence');
    const detail1 = document.getElementById('builderDetail1');
    const detail2 = document.getElementById('builderDetail2');
    const detail3 = document.getElementById('builderDetail3');
    const conclusion = document.getElementById('builderConclusion');
    
    const transition1 = document.getElementById('builderTransition1');
    const transition2 = document.getElementById('builderTransition2');
    const transition3 = document.getElementById('builderTransition3');
    const transitionConc = document.getElementById('builderTransitionConc');
    
    const mainTextarea = document.getElementById('writingResponse');
    if (!mainTextarea) return;
    
    let response = '';
    if (topic && topic.value.trim()) response += `${topic.value.trim()} `;
    if (detail1 && detail1.value.trim()) {
      const trans1 = transition1 ? transition1.value : '';
      response += `${trans1 ? trans1 + ' ' : ''}${detail1.value.trim()} `;
    }
    if (detail2 && detail2.value.trim()) {
      const trans2 = transition2 ? transition2.value : '';
      response += `${trans2 ? trans2 + ' ' : ''}${detail2.value.trim()} `;
    }
    if (detail3 && detail3.value.trim()) {
      const trans3 = transition3 ? transition3.value : '';
      response += `${trans3 ? trans3 + ' ' : ''}${detail3.value.trim()} `;
    }
    if (conclusion && conclusion.value.trim()) {
      const transC = transitionConc ? transitionConc.value : '';
      response += `${transC ? transC + ' ' : ''}${conclusion.value.trim()}`;
    }
    
    mainTextarea.value = response.trim();
    
    // Show success message briefly
    const transferBtn = document.getElementById('builderTransferBtn');
    if (transferBtn) {
      const originalText = transferBtn.textContent;
      transferBtn.textContent = '✓ Transferred!';
      transferBtn.style.background = 'rgba(34, 197, 94, 0.3)';
      setTimeout(() => {
        transferBtn.textContent = originalText;
        transferBtn.style.background = '';
      }, 2000);
    }
  }
  
  function clearBuilder() {
    if (!confirm('Are you sure you want to clear all builder content?')) return;
    
    const fields = ['builderTopicSentence', 'builderDetail1', 'builderDetail2', 'builderDetail3', 'builderConclusion'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    
    const selects = ['builderTransition1', 'builderTransition2', 'builderTransition3', 'builderTransitionConc'];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    
    const feedbacks = ['builderTopicFeedback', 'builderDetail1Feedback', 'builderDetail2Feedback', 'builderDetail3Feedback', 'builderConclusionFeedback'];
    feedbacks.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    
    const counts = ['builderTopicCount', 'builderDetail1Count', 'builderDetail2Count', 'builderDetail3Count', 'builderConclusionCount'];
    counts.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0 words';
    });
  }
  
  function toggleDetail3() {
    const detail3Section = document.getElementById('builderDetail3Section');
    const addBtn = document.getElementById('builderAddDetail3Btn');
    if (!detail3Section || !addBtn) return;
    
    if (detail3Section.style.display === 'none' || !detail3Section.style.display) {
      detail3Section.style.display = 'block';
      addBtn.style.display = 'none';
    }
  }
  
  /**
   * Close the assignment viewer
   */
  function closeAssignmentViewer() {
    const panel = document.getElementById('assignmentPanel');
    const backdrop = document.getElementById('assignmentPanelBackdrop');
    
    if (panel) {
      panel.classList.remove('open');
      setTimeout(() => panel.remove(), PANEL_TRANSITION_MS);
    }
    
    if (backdrop) {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), PANEL_TRANSITION_MS);
    }
    
    // Reload assignments to reflect updated status
    const studentCode = sessionStorage.getItem('rc_user_code');
    if (studentCode) {
      loadStudentAssignmentsForTabs(studentCode).catch(err => {
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
      
      // Setup tab switching
      setupTabSwitching();
      
      state.dashboardHandlersAttached = true;
    }
    
    console.log(LOG_PREFIX, 'Dashboard view shown for:', studentCode);
    
    // Load student data for all tabs
    if (studentCode) {
      loadAllStudentData(studentCode);
    }
  }

  /**
   * Tab switching state
   */
  const tabState = {
    currentTab: 'dashboard',
    assignmentsData: [],
    goalsData: [],
    gradesData: [],
  };

  /**
   * Setup tab switching functionality
   */
  function setupTabSwitching() {
    const tabLinks = document.querySelectorAll('[data-tab]');
    
    tabLinks.forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const tabName = this.getAttribute('data-tab');
        switchToTab(tabName);
      });
    });
  }

  /**
   * Switch to a specific tab
   */
  function switchToTab(tabName) {
    console.log(LOG_PREFIX, 'Switching to tab:', tabName);
    
    // Update tab state
    tabState.currentTab = tabName;
    
    // Hide all tab panels
    const allPanels = document.querySelectorAll('.st-tab-panel');
    allPanels.forEach(panel => panel.classList.remove('active'));
    
    // Show target panel
    const targetPanel = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
    
    // Update sidebar active state
    const allLinks = document.querySelectorAll('[data-tab]');
    allLinks.forEach(link => link.classList.remove('active'));
    
    const activeLink = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }
  }

  /**
   * Load all student data for all tabs
   */
  async function loadAllStudentData(studentCode) {
    try {
      // Load goals
      loadStudentGoals(studentCode).catch(err => {
        console.error(LOG_PREFIX, 'Failed to load student goals:', err);
      });
      
      // Load assignments
      loadStudentAssignmentsForTabs(studentCode).catch(err => {
        console.error(LOG_PREFIX, 'Failed to load student assignments:', err);
      });
      
      // Load grades
      loadStudentGrades(studentCode).catch(err => {
        console.error(LOG_PREFIX, 'Failed to load student grades:', err);
      });
    } catch (err) {
      console.error(LOG_PREFIX, 'Error loading student data:', err);
    }
  }

  /**
   * Load assignments and populate both Assignments tab and Dashboard
   */
  async function loadStudentAssignmentsForTabs(studentCode) {
    console.log(LOG_PREFIX, 'Loading assignments for tabs:', studentCode);
    
    const assignmentsContainer = document.getElementById('assignmentsContent');
    const dashRecentContainer = document.getElementById('dashRecentAssignments');
    
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
      tabState.assignmentsData = instances;
      
      // Render assignments tab (with all status)
      renderAssignmentsTab(instances);
      
      // Populate dashboard summary cards
      populateDashboardSummary(instances);
      
      // Populate dashboard recent assignments (max 5)
      if (dashRecentContainer) {
        const recent = instances.slice(0, 5);
        if (recent.length === 0) {
          dashRecentContainer.innerHTML = '<p style="opacity:0.7;">No assignments yet</p>';
        } else {
          dashRecentContainer.innerHTML = recent.map(inst => renderAssignmentCard(inst)).join('');
          attachAssignmentCardHandlers(recent);
        }
      }
      
      // Setup status filter handlers
      setupStatusFilters();
      
    } catch (err) {
      console.error(LOG_PREFIX, 'Error loading assignments:', err);
      assignmentsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <div style="color: var(--ink);">Assignments temporarily unavailable</div>
          <div style="margin-top: 8px; font-size: 14px;">Please try refreshing the page or contact your teacher if this persists.</div>
        </div>
      `;
    }
  }

  /**
   * Render assignments in the Assignments tab
   */
  function renderAssignmentsTab(instances, statusFilter = 'all') {
    const assignmentsContainer = document.getElementById('assignmentsContent');
    if (!assignmentsContainer) return;
    
    // Filter by status
    const filtered = filterAssignmentsByStatus(instances, statusFilter);
    
    if (filtered.length === 0) {
      assignmentsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">📚</div>
          <div>No ${statusFilter !== 'all' ? statusFilter.replace('-', ' ') : ''} assignments</div>
        </div>
      `;
    } else {
      assignmentsContainer.innerHTML = filtered.map(inst => renderAssignmentCard(inst)).join('');
      attachAssignmentCardHandlers(filtered);
    }
  }

  /**
   * Filter assignments by status
   */
  function filterAssignmentsByStatus(instances, status) {
    if (status === 'all') return instances;
    
    const now = new Date();
    
    return instances.filter(inst => {
      const instStatus = getAssignmentStatus(inst, now);
      return instStatus === status;
    });
  }

  /**
   * Get assignment status
   */
  function getAssignmentStatus(instance, now = new Date()) {
    const status = (instance.status || 'Assigned').toLowerCase();
    
    // Check if graded
    if (status === 'graded') return 'completed';
    
    // Check if submitted
    if (status === 'submitted') return 'submitted';
    
    // Check if overdue (assigned but past due date)
    if (instance.due_at) {
      const dueDate = new Date(instance.due_at);
      if (dueDate < now && status !== 'submitted' && status !== 'graded') {
        return 'overdue';
      }
    }
    
    // Otherwise it's in progress (assigned)
    return 'in-progress';
  }

  /**
   * Setup status filter handlers
   */
  function setupStatusFilters() {
    const filterTabs = document.querySelectorAll('.st-status-tab');
    
    filterTabs.forEach(tab => {
      tab.addEventListener('click', function() {
        const status = this.getAttribute('data-status');
        
        // Update active state
        filterTabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        
        // Re-render with filter
        renderAssignmentsTab(tabState.assignmentsData, status);
      });
    });
  }

  /**
   * Populate dashboard summary cards
   */
  function populateDashboardSummary(instances) {
    const now = new Date();
    
    // Count by status
    let inProgressCount = 0;
    let overdueCount = 0;
    
    instances.forEach(inst => {
      const status = getAssignmentStatus(inst, now);
      if (status === 'in-progress') inProgressCount++;
      if (status === 'overdue') overdueCount++;
    });
    
    // Update counts
    const dashUpcoming = document.getElementById('dashUpcomingCount');
    const dashOverdue = document.getElementById('dashOverdueCount');
    
    if (dashUpcoming) dashUpcoming.textContent = inProgressCount;
    if (dashOverdue) dashOverdue.textContent = overdueCount;
  }

  /**
   * Load student grades
   */
  async function loadStudentGrades(studentCode) {
    console.log(LOG_PREFIX, 'Loading grades for:', studentCode);
    
    const gradesContainer = document.getElementById('gradesContent');
    const dashAvgGrade = document.getElementById('dashAvgGrade');
    
    if (!gradesContainer) {
      console.warn(LOG_PREFIX, 'Grades container not found');
      return;
    }
    
    // Show loading state
    gradesContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--muted);">
        <div style="font-size: 48px; margin-bottom: 16px;">⏳</div>
        <div>Loading your grades...</div>
      </div>
    `;
    
    try {
      // Fetch submissions with scores
      const submissionsUrl = `/.netlify/functions/student-submissions?code=${encodeURIComponent(studentCode)}`;
      const response = await fetch(submissionsUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch submissions: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to load grades');
      }
      
      const submissions = data.submissions || [];
      tabState.gradesData = submissions;
      
      // Filter to only graded submissions
      const graded = submissions.filter(sub => sub.score !== null && sub.score !== undefined);
      
      // Calculate average
      let avgGrade = '—';
      if (graded.length > 0) {
        const sum = graded.reduce((acc, sub) => acc + (sub.score || 0), 0);
        avgGrade = Math.round(sum / graded.length) + '%';
      }
      
      // Update dashboard
      if (dashAvgGrade) {
        dashAvgGrade.textContent = avgGrade;
      }
      
      // Render grades
      if (graded.length === 0) {
        gradesContainer.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--muted);">
            <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
            <div>No grades yet — keep working on your assignments!</div>
          </div>
        `;
      } else {
        // Show average at top
        let html = `
          <div class="st-average-display">
            <h3>Your Overall Average</h3>
            <div class="st-average-value">${avgGrade}</div>
          </div>
        `;
        
        // Show graded assignments
        html += graded.map(sub => renderGradeRow(sub)).join('');
        gradesContainer.innerHTML = html;
      }
      
    } catch (err) {
      console.error(LOG_PREFIX, 'Error loading grades:', err);
      gradesContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <div style="color: var(--ink);">Grades temporarily unavailable</div>
          <div style="margin-top: 8px; font-size: 14px;">Please try refreshing the page or contact your teacher if this persists.</div>
        </div>
      `;
      if (dashAvgGrade) {
        dashAvgGrade.textContent = '—';
      }
    }
  }

  /**
   * Render a grade row
   */
  function renderGradeRow(submission) {
    const title = escapeHtml(submission.assignment_title || 'Untitled Assignment');
    const score = submission.score !== null ? submission.score : 0;
    const scoreClass = score >= 70 ? 'good' : 'poor';
    const submittedDate = submission.submitted_at ? formatDate(submission.submitted_at) : 'N/A';
    const className = escapeHtml(submission.class_name || 'General');
    
    return `
      <div class="st-grade-row">
        <div class="st-grade-info">
          <h4>${title}</h4>
          <div class="st-grade-meta">${className} • Submitted: ${submittedDate}</div>
        </div>
        <div class="st-grade-score ${scoreClass}">${Math.round(score)}%</div>
      </div>
    `;
  }

  /**
   * Update goals display for dashboard snapshot
   */
  async function loadStudentGoals(studentCode) {
    console.log(LOG_PREFIX, 'Loading goals for:', studentCode);
    
    const goalsContainer = document.getElementById('goalsContent');
    const dashGoalsSnapshot = document.getElementById('dashGoalsSnapshot');
    const dashGoalsCount = document.getElementById('dashGoalsCount');
    
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
      tabState.goalsData = goals;
      
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
      
      // Update dashboard goals count
      if (dashGoalsCount) {
        dashGoalsCount.textContent = goals.length;
      }
      
      // Render goals in Goals tab
      if (goals.length === 0) {
        goalsContainer.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--muted);">
            <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
            <div>No goals found for your account.</div>
          </div>
        `;
      } else {
        goalsContainer.innerHTML = goals.map(goal => renderGoalCard(goal, progressMap)).join('');
        
        // Attach event listeners to "Show more" buttons
        attachShowMoreListeners();
      }
      
      // Render goals snapshot for dashboard (max 3)
      if (dashGoalsSnapshot) {
        const snapshot = goals.slice(0, 3);
        if (snapshot.length === 0) {
          dashGoalsSnapshot.innerHTML = '<p style="opacity:0.7;">No goals yet</p>';
        } else {
          dashGoalsSnapshot.innerHTML = snapshot.map(goal => renderGoalCard(goal, progressMap)).join('');
        }
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
      if (dashGoalsCount) {
        dashGoalsCount.textContent = '0';
      }
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
