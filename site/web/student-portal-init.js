/**
 * Student Portal Initialization
 * Handles student login form, roster loading, and authentication
 * 
 * Phase 3: Uses canonical endpoint /.netlify/functions/student-login
 * - student-signin remains available as backwards-compatible alias
 * - Enhanced error messages for common failure scenarios
 * - No teacher/admin/substitute endpoints called from student pages
 * 
 * Note: "Cannot read properties of null (reading 'includes')" errors visible in
 * DevTools (from bootstrap-autofill-overlay.js) are injected by browser password
 * manager extensions and are harmless — they are not application errors.
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
  const _STUDENT_PORTAL_PATH = '/student/';
  
  // Feature constants
  const MIN_WRITING_ANSWER_LENGTH = 10;
  const AUTO_SAVE_DEBOUNCE_MS = 1000;
  const AUTO_SAVE_ERROR_TOAST_COOLDOWN_MS = 10000;
  const WRITER_BADGE_WORD_THRESHOLD = 50;
  const SPEECH_PAUSE_MS = 300;
  const TOAST_DISPLAY_DURATION_MS = 5000;
  const TOAST_FADE_OUT_DURATION_MS = 300;
  const TIMER_INIT_DELAY_MS = 100;

  /** Shared inline-SVG icon map — single source of truth for Student Portal icons.
   *  All use stroke="currentColor" so they inherit text color and respond to
   *  the glow system (filter: drop-shadow) from rc-theme.css. */
  const ICONS = {
    grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
    clipboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>',
    barChart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    target: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
    gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    upload: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path></svg>',
    alertTriangle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    checkCircle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    list: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
    bookOpen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
    user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    key: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>',
    alertClock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline><line x1="1" y1="1" x2="3" y2="3"></line><line x1="21" y1="1" x2="23" y2="3"></line></svg>',
    document: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    arrowRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>',
  };

  // State management
  const state = {
    bootWatchdogTimer: null,
    dashboardHandlersAttached: false,
    goalClickHandlersAttached: false,
  };

  // Cached quarter-utils module (loaded lazily in loadStudentGoals/loadStudentGrades).
  // Used by renderGoalCard and the grades quarterly-averages section.
  // Remains null if the module cannot be loaded; calendar quarters are used as fallback.
  let quarterUtils = null;

  // Cleanup function returned by initHtmlAssignmentBridge(); called in closeAssignmentViewer().
  let htmlBridgeCleanup = null;

  // Keyboard handler for Escape-to-close the assignment panel; stored so it can be removed.
  let assignmentPanelEscapeHandler = null;

  // Timestamp of the last auto-save error toast; used to suppress duplicate toasts (10 s cooldown).
  let lastAutoSaveErrorToastAt = 0;

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

  // Dot-grid chart icon paths (24×24 viewBox) — check-circle and x-circle
  const _DOT_CHECK_PATHS = '<circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/>';
  const _DOT_X_PATHS     = '<circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>';

  // Accordion pagination / display constants
  const _ACC_PAGE_SIZE = 5;        // assignments shown per page in accordion
  const ACC_Q_TEXT_CARD_MAX = 55; // max chars of question text shown on the inline card
  const ACC_Q_TEXT_ARIA_MAX = 40; // max chars of question text used in aria-label

  // Registry: maps catalog idBase → sorted assignment groups array.
  // Populated by buildDotGridChart; read by setupDotGridPopup's lazy-render logic.
  const QCAT_GROUPS_REGISTRY = new Map();
  
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
   * Escape text for use in HTML attributes (specifically for data-text attributes)
   * This escapes quotes and other characters that could break attribute boundaries
   */
  function escapeAttr(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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

  // ============================================================================
  // Feature 1 & 3: Auto-Save and Progress Tracking Helpers
  // ============================================================================
  
  /**
   * Get total question count for an assignment
   */
  function getTotalQuestionCount(instance) {
    const assignment = instance.assignment || {};
    const meta = assignment.meta || {};
    const days = meta.days || [];
    
    let total = 0;
    days.forEach(day => {
      if (day.type === 'questions' && day.questions) {
        total += day.questions.length;
      } else if (day.type === 'writing_prompt') {
        total += 1; // Count writing prompt as 1 question
      }
    });
    
    return total;
  }

  /**
   * Get answered question count from localStorage
   */
  function getAnsweredCount(instanceId) {
    try {
      const savedAnswers = getSavedAnswers(instanceId);
      if (!savedAnswers) return 0;
      
      // Count non-empty answers
      return Object.values(savedAnswers).filter(ans => {
        if (typeof ans === 'string') {
          return ans.trim().length > MIN_WRITING_ANSWER_LENGTH;
        }
        return ans !== null && ans !== undefined;
      }).length;
    } catch (err) {
      console.error(LOG_PREFIX, 'Error getting answered count:', err);
      return 0;
    }
  }

  /**
   * Get saved answers for an instance from localStorage
   */
  function getSavedAnswers(instanceId) {
    try {
      const key = `rc_student_answers_${instanceId}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error(LOG_PREFIX, 'Error getting saved answers:', err);
      return null;
    }
  }

  /**
   * Save answer to localStorage (debounced for textareas)
   */
  function saveAnswer(instanceId, questionId, answer) {
    try {
      const key = `rc_student_answers_${instanceId}`;
      const existing = getSavedAnswers(instanceId) || {};
      existing[questionId] = answer;
      localStorage.setItem(key, JSON.stringify(existing));
      
      // Show save indicator
      showToast('✓ Progress saved', 'success');
    } catch (err) {
      console.error(LOG_PREFIX, 'Error saving answer:', err);
    }
  }

  /**
   * Clear saved answers for an instance
   */
  function clearSavedAnswers(instanceId) {
    try {
      const key = `rc_student_answers_${instanceId}`;
      localStorage.removeItem(key);
    } catch (err) {
      console.error(LOG_PREFIX, 'Error clearing saved answers:', err);
    }
  }

  // ============================================================================
  // Feature 11: Vocabulary Word Bank
  // ============================================================================
  function extractVocabulary(content) {
    const vocab = new Set();
    
    // Extract words in ALL CAPS (at least 3 chars)
    const capsMatches = content.match(/\b[A-Z]{3,}\b/g);
    if (capsMatches) {
      capsMatches.forEach(word => vocab.add(word));
    }
    
    // Extract words in quotes
    const quoteMatches = content.match(/"([^"]+)"/g);
    if (quoteMatches) {
      quoteMatches.forEach(match => {
        const word = match.replace(/"/g, '').trim();
        if (word.length >= 3) vocab.add(word);
      });
    }
    
    // Look for "Vocabulary:" or "Key Terms:" sections
    const vocabSection = content.match(/(?:Vocabulary|Key Terms):\s*(.+?)(?:\n\n|\n[A-Z]|$)/s);
    if (vocabSection && vocabSection[1]) {
      const terms = vocabSection[1].split(/[,;\n]/).map(t => t.trim()).filter(t => t.length >= 3);
      terms.forEach(term => vocab.add(term));
    }
    
    return Array.from(vocab);
  }

  function renderVocabularySection(dayData) {
    // Collect all text from day
    let allText = dayData.label || '';
    
    if (dayData.type === 'questions' && dayData.questions) {
      dayData.questions.forEach(q => {
        allText += ' ' + (q.text || '');
        if (q.choices) {
          q.choices.forEach(c => allText += ' ' + (c.text || ''));
        }
      });
    } else if (dayData.type === 'writing_prompt') {
      allText += ' ' + (dayData.prompt || '');
      if (dayData.structure) {
        allText += ' ' + dayData.structure.join(' ');
      }
    }
    
    const vocab = extractVocabulary(allText);
    
    if (vocab.length === 0) return '';
    
    const vocabWordsHtml = vocab.map(word => `
      <div class="st-vocab-word">
        ${escapeHtml(word)}
        <button class="st-tts-btn" data-text="${escapeHtml(word)}" title="Hear pronunciation" aria-label="Hear pronunciation of ${escapeHtml(word)}" style="font-size: 12px; padding: 2px 4px;">🔊</button>
      </div>
    `).join('');
    
    return `
      <details class="st-vocab-section">
        <summary>📖 Vocabulary (${vocab.length} terms)</summary>
        <div class="st-vocab-list">
          ${vocabWordsHtml}
        </div>
      </details>
    `;
  }

  /**
   * Update progress display in viewer
   */
  function updateViewerProgress(instance) {
    const progressEl = document.getElementById('viewerProgress');
    if (!progressEl) return;
    
    const totalQuestions = getTotalQuestionCount(instance);
    const answeredCount = getAnsweredCount(instance.id);
    const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    
    const textEl = progressEl.querySelector('.st-viewer-progress-text');
    const fillEl = progressEl.querySelector('.fill');
    
    if (textEl) {
      textEl.textContent = `Progress: ${answeredCount} of ${totalQuestions} questions answered`;
    }
    if (fillEl) {
      fillEl.style.width = `${progressPercent}%`;
    }
  }
  
  /**
   * Format a progress value for display based on measurement type
   */
  function formatProgressValue(value, measurementType) {
    if (value == null) return '—';
    const num = parseFloat(value);
    if (isNaN(num)) return String(value);
    if (measurementType === 'percent' || measurementType === 'Percent') return `${Math.round(num * 10) / 10}%`;
    if (measurementType === 'x_of_y') return String(num);
    return String(num);
  }

  /**
   * Compute a SPED-friendly status from the latest numeric value vs target/baseline.
   * Returns a status descriptor object with key, emoji, label, and CSS modifier.
   * @param {number} latest - Latest recorded numeric value
   * @param {number|null} target - Goal target value (null if unset)
   * @param {number|null} baseline - Goal baseline value (null if unset)
   * @returns {{ key: string, emoji: string, label: string, modifier: string }}
   */
  function computeGoalStatus(latest, target, baseline) {
    if (target == null || isNaN(target)) {
      return { key: 'in-progress', emoji: '📊', label: 'In Progress', modifier: 'in-progress' };
    }
    if (latest >= target) {
      return { key: 'on-track', emoji: '🟢', label: 'On Track!', modifier: 'on-track' };
    }
    if (latest >= target - 10) {
      return { key: 'almost-there', emoji: '🟡', label: 'Almost There', modifier: 'almost-there' };
    }
    if (baseline == null || isNaN(baseline) || latest > baseline) {
      return { key: 'keep-practicing', emoji: '🟠', label: 'Keep Practicing', modifier: 'keep-practicing' };
    }
    return { key: 'needs-support', emoji: '🔴', label: 'Needs Support', modifier: 'needs-support' };
  }

  /**
   * Compute trend direction from the last 2–3 chronologically sorted progress entries.
   * @param {Array} sortedEntries - Entries sorted ascending by date, with .value fields
   * @returns {{ arrow: string, label: string, cssClass: string }}
   */
  function computeTrendArrow(sortedEntries) {
    const nums = sortedEntries.map(e => parseFloat(e.value)).filter(v => !isNaN(v));
    if (nums.length < 2) {
      return { arrow: '—', label: 'Not enough data', cssClass: 'st-goal-trend-flat' };
    }
    const last = nums[nums.length - 1];
    // Compare last value with the one 3 positions earlier (or first if fewer points exist)
    const prev = nums[Math.max(0, nums.length - 4)];
    const diff = last - prev;
    if (diff > 2) return { arrow: '↑', label: 'Improving', cssClass: 'st-goal-trend-up' };
    if (diff < -2) return { arrow: '↓', label: 'Declining', cssClass: 'st-goal-trend-down' };
    return { arrow: '→', label: 'Steady', cssClass: 'st-goal-trend-flat' };
  }

  /**
   * Build the SPED-friendly plain-language status banner HTML.
   * Displays icon + color-coded label + short sentence about current standing.
   * @param {number} latestNumeric - Latest numeric progress value
   * @param {number|null} targetNumeric - Numeric target (or null)
   * @param {number|null} baselineNumeric - Numeric baseline (or null)
   * @param {string} [measurementType] - Measurement type for formatting
   * @returns {string} HTML string for the banner, or '' if latest is unavailable
   */
  function buildStatusBannerHtml(latestNumeric, targetNumeric, baselineNumeric, measurementType) {
    if (latestNumeric == null || isNaN(latestNumeric)) return '';
    const status = computeGoalStatus(latestNumeric, targetNumeric, baselineNumeric);
    const latestFmt = escapeHtml(formatProgressValue(latestNumeric, measurementType));
    const targetFmt = (targetNumeric != null && !isNaN(targetNumeric))
      ? escapeHtml(formatProgressValue(targetNumeric, measurementType))
      : null;

    let sentence;
    if (status.key === 'on-track') {
      sentence = `You scored ${latestFmt} — great work, you met your goal!`;
    } else if (status.key === 'almost-there') {
      sentence = targetFmt
        ? `You scored ${latestFmt}, just a bit away from your goal of ${targetFmt}. Keep going!`
        : `You scored ${latestFmt}. Keep going!`;
    } else if (status.key === 'keep-practicing') {
      sentence = targetFmt
        ? `You scored ${latestFmt}. Your goal is ${targetFmt} — let's keep practicing!`
        : `You scored ${latestFmt} — let's keep practicing!`;
    } else if (status.key === 'needs-support') {
      sentence = `You scored ${latestFmt}. Let's work together to build these skills.`;
    } else {
      sentence = `Latest score: ${latestFmt}.`;
    }

    return `<div class="st-goal-status-banner st-goal-status-banner--${escapeHtml(status.modifier)}" role="status" aria-live="polite">
      <span class="st-goal-status-banner__icon" aria-hidden="true">${status.emoji}</span>
      <div class="st-goal-status-banner__text">
        <div class="st-goal-status-banner__label">${escapeHtml(status.label)}</div>
        <div class="st-goal-status-banner__sentence">${sentence}</div>
      </div>
    </div>`;
  }

  /**
   * Build the summary stats row HTML (Latest / Quarter Avg / Target / Trend).
   * @param {number|null} latestVal - Latest numeric value
   * @param {number|null} qAvgVal - This-quarter average (or null)
   * @param {number|null} targetVal - Target numeric value (or null)
   * @param {{ arrow: string, label: string, cssClass: string }|null} trend - Trend descriptor
   * @param {string} [measurementType] - For formatting
   * @returns {string} HTML string for the stats row
   */
  function buildStatsRowHtml(latestVal, qAvgVal, targetVal, trend, measurementType) {
    const stats = [];
    if (latestVal != null && !isNaN(latestVal)) {
      stats.push({ label: 'Latest', value: escapeHtml(formatProgressValue(latestVal, measurementType)) });
    }
    if (qAvgVal != null && !isNaN(qAvgVal)) {
      stats.push({ label: 'Avg This Quarter', value: escapeHtml(formatProgressValue(qAvgVal, measurementType)) });
    }
    if (targetVal != null && !isNaN(targetVal)) {
      stats.push({ label: 'Target', value: escapeHtml(formatProgressValue(targetVal, measurementType)) });
    }
    if (trend) {
      stats.push({ label: 'Trend', value: `<span class="${escapeHtml(trend.cssClass)}" aria-label="${escapeHtml(trend.label)}">${trend.arrow}</span>` });
    }
    if (stats.length === 0) return '';
    return `<div class="st-goal-stats-row" aria-label="Goal progress summary">
      ${stats.map(s => `<div class="st-goal-stat">
        <span class="st-goal-stat__label">${s.label}</span>
        <span class="st-goal-stat__value">${s.value}</span>
      </div>`).join('')}
    </div>`;
  }

  /**
   * Build an inline SVG line chart for goal progress entries.
   * Sorts data chronologically, deduplicates same-day entries by averaging,
   * places all reference-line labels inside the chart area to prevent clipping,
   * and returns SVG + an accessible collapsible data table.
   * @param {Array} entries - Progress entries with .date and .value fields
   * @param {Object} goal - Goal object with .baseline, .target, .measurement_type, .code
   * @returns {string} HTML containing the SVG chart and a screen-reader data table
   */
  function buildProgressSVG(entries, goal) {
    const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sorted.length === 0) {
      return `<div class="st-goal-chart-empty" role="status">No progress data to chart yet.</div>`;
    }
    if (sorted.length === 1) {
      const val = formatProgressValue(sorted[0].value, goal.measurement_type);
      const dateStr = formatDate(sorted[0].date);
      return `<div class="st-goal-chart-empty" role="status">Only one data point recorded (${dateStr}: ${val}). Add more to see a chart.</div>`;
    }

    // Deduplicate same-day entries by averaging their values
    const dedupMap = new Map();
    for (const e of sorted) {
      const dateKey = String(e.date).substring(0, 10);
      if (!dedupMap.has(dateKey)) {
        dedupMap.set(dateKey, { ...e, _vals: [parseFloat(e.value)] });
      } else {
        dedupMap.get(dateKey)._vals.push(parseFloat(e.value));
      }
    }
    const deduped = Array.from(dedupMap.values()).map(entry => ({
      ...entry,
      value: entry._vals.filter(v => !isNaN(v)).reduce((s, v) => s + v, 0) /
             Math.max(1, entry._vals.filter(v => !isNaN(v)).length),
    }));

    const values = deduped.map(e => parseFloat(e.value)).filter(v => !isNaN(v));
    if (values.length < 2) {
      return `<div class="st-goal-chart-empty" role="status">Progress values are not numeric; chart unavailable.</div>`;
    }

    const baseline = goal.baseline != null ? parseFloat(goal.baseline) : null;
    const target = goal.target != null ? parseFloat(goal.target) : null;

    const allNums = [...values];
    if (baseline != null && !isNaN(baseline)) allNums.push(baseline);
    if (target != null && !isNaN(target)) allNums.push(target);

    const minV = Math.min(...allNums);
    const maxV = Math.max(...allNums);
    const rangeV = maxV - minV || 1;

    const W = 340, H = 120;
    const PAD = { top: 14, right: 16, bottom: 28, left: 38 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const dates = deduped.map(e => new Date(e.date).getTime());
    const minD = Math.min(...dates);
    const maxD = Math.max(...dates);
    const rangeD = maxD - minD || 1;

    const toX = d => PAD.left + ((new Date(d).getTime() - minD) / rangeD) * chartW;
    const toY = v => PAD.top + chartH - ((v - minV) / rangeV) * chartH;

    const numericEntries = deduped.filter(e => !isNaN(parseFloat(e.value)));
    const points = numericEntries.map(e => ({ x: toX(e.date), y: toY(parseFloat(e.value)), e }));

    const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const mt = goal.measurement_type;

    // X-axis labels (first and last date)
    const firstLabel = formatDate(deduped[0].date);
    const lastLabel = formatDate(deduped[deduped.length - 1].date);

    // Y-axis labels (min and max)
    const yMinLabel = formatProgressValue(minV, mt);
    const yMaxLabel = formatProgressValue(maxV, mt);

    // Mastery zone: shaded area above the target line
    let masteryZone = '';
    let refLines = '';
    if (target != null && !isNaN(target) && target >= minV && target <= maxV) {
      const ty = toY(target);
      masteryZone = `<rect class="st-chart-mastery-zone" x="${PAD.left}" y="${PAD.top}" width="${chartW}" height="${(ty - PAD.top).toFixed(1)}" aria-hidden="true"/>`;
      // Reference line label placed INSIDE the chart area (text-anchor="end") to avoid clipping
      refLines += `<line class="st-chart-ref st-chart-target" x1="${PAD.left}" y1="${ty.toFixed(1)}" x2="${W - PAD.right}" y2="${ty.toFixed(1)}" />`;
      refLines += `<text class="st-chart-ref-label st-chart-target-label" x="${W - PAD.right - 3}" y="${ty.toFixed(1)}" dy="-3" font-size="9" text-anchor="end">target</text>`;
    }
    if (baseline != null && !isNaN(baseline) && baseline >= minV && baseline <= maxV) {
      const by = toY(baseline);
      refLines += `<line class="st-chart-ref st-chart-baseline" x1="${PAD.left}" y1="${by.toFixed(1)}" x2="${W - PAD.right}" y2="${by.toFixed(1)}" />`;
      refLines += `<text class="st-chart-ref-label st-chart-baseline-label" x="${W - PAD.right - 3}" y="${by.toFixed(1)}" dy="-3" font-size="9" text-anchor="end">baseline</text>`;
    }

    const dots = points.map(p => {
      const val = formatProgressValue(parseFloat(p.e.value), mt);
      const dt = formatDate(p.e.date);
      return `<circle class="st-chart-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5"><title>${escapeHtml(dt)}: ${escapeHtml(val)}</title></circle>`;
    }).join('');

    const latestPt = points[points.length - 1];
    const latestLabel = formatProgressValue(parseFloat(latestPt.e.value), mt);
    const latestLabelX = Math.min(latestPt.x + 6, W - PAD.right - 4);

    // Accessible data table (screen-reader/keyboard toggle)
    const tableRows = deduped.map(e => {
      const val = escapeHtml(formatProgressValue(parseFloat(e.value), mt));
      const dt = escapeHtml(formatDate(e.date));
      return `<tr><td>${dt}</td><td>${val}</td></tr>`;
    }).join('');
    const srTable = `<details class="st-chart-sr-table">
      <summary>Show data table (${deduped.length} data ${deduped.length === 1 ? 'point' : 'points'})</summary>
      <table aria-label="Progress data for goal ${escapeHtml(goal.code || '')}">
        <thead><tr><th>Date</th><th>Score</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </details>`;

    return `
      <svg class="st-goal-chart-svg" role="img" viewBox="0 0 ${W} ${H}" width="100%" aria-label="Progress chart for goal ${escapeHtml(goal.code || '')}: ${deduped.length} data points from ${escapeHtml(firstLabel)} to ${escapeHtml(lastLabel)}">
        <rect width="${W}" height="${H}" fill="none"/>
        ${masteryZone}
        <!-- Axes -->
        <line class="st-chart-axis" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + chartH}" />
        <line class="st-chart-axis" x1="${PAD.left}" y1="${PAD.top + chartH}" x2="${W - PAD.right}" y2="${PAD.top + chartH}" />
        <!-- Reference lines (target/baseline) -->
        ${refLines}
        <!-- Progress line -->
        <polyline class="st-chart-line" points="${polyline}" />
        <!-- Data dots -->
        ${dots}
        <!-- Latest value label -->
        <text class="st-chart-latest-label" x="${latestLabelX.toFixed(1)}" y="${(latestPt.y - 6).toFixed(1)}" font-size="10">${escapeHtml(latestLabel)}</text>
        <!-- X-axis labels -->
        <text class="st-chart-axis-label" x="${PAD.left}" y="${H - 4}" font-size="9" text-anchor="start">${escapeHtml(firstLabel)}</text>
        <text class="st-chart-axis-label" x="${W - PAD.right}" y="${H - 4}" font-size="9" text-anchor="end">${escapeHtml(lastLabel)}</text>
        <!-- Y-axis labels -->
        <text class="st-chart-axis-label" x="${PAD.left - 4}" y="${(PAD.top + chartH).toFixed(1)}" font-size="9" text-anchor="end" dy="4">${escapeHtml(yMinLabel)}</text>
        <text class="st-chart-axis-label" x="${PAD.left - 4}" y="${PAD.top}" font-size="9" text-anchor="end" dy="4">${escapeHtml(yMaxLabel)}</text>
      </svg>${srTable}`
;
  }

  // ── Question Catalog helpers ─────────────────────────────────────────────────

  /**
   * Compute a percentage score for a single data point.
   * Returns a 0-100 number, or null if the point has no scoreable information.
   */
  function dpScore(pt) {
    if (pt.score != null) return Number(pt.score);
    if (pt.is_correct === true)  return 100;
    if (pt.is_correct === false) return 0;
    return null;
  }

  /** Return a fill color for a 0–100 score. */
  const SCORE_TO_COLOR = (score) => {
    if (score >= 100) return '#22c55e';
    if (score >= 80)  return '#3b82f6';
    if (score >= 60)  return '#eab308';
    return '#ef4444';
  };

  /** Return the border-left color for a question card. */
  function cardBorderColor(pt) {
    const s = dpScore(pt);
    return s != null ? SCORE_TO_COLOR(s) : '#94a3b8';
  }

  /** Return the dot background color for a question card. */
  function dotColor(pt) {
    const s = dpScore(pt);
    return s != null ? SCORE_TO_COLOR(s) : '#94a3b8';
  }

  /**
   * Compute average score for an array of data points.
   * Returns null if no scoreable data.
   */
  function avgScore(points) {
    const scores = points.map(dpScore).filter(s => s != null);
    if (!scores.length) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Build a mini stacked distribution bar HTML for an array of data points.
   * Segments: 100% / 80–99% / 60–79% / 0–59%
   */
  function buildDistBar(points) {
    const total = points.length;
    if (!total) return '';
    const n100 = points.filter(p => dpScore(p) === 100).length;
    const n80  = points.filter(p => { const s = dpScore(p); return s != null && s >= 80 && s < 100; }).length;
    const n60  = points.filter(p => { const s = dpScore(p); return s != null && s >= 60 && s < 80; }).length;
    const n0   = points.filter(p => { const s = dpScore(p); return s != null && s < 60; }).length;
    const pct = (n) => ((n / total) * 100).toFixed(1);
    const seg = (cls, n) => n > 0 ? `<div class="st-qcat-distbar__seg ${cls}" style="width:${pct(n)}%;" aria-hidden="true"></div>` : '';
    return `<div class="st-qcat-distbar" aria-hidden="true" title="100%: ${n100} · 80-99%: ${n80} · 60-79%: ${n60} · 0-59%: ${n0}">` +
      seg('st-qcat-distbar__seg--100', n100) +
      seg('st-qcat-distbar__seg--80', n80) +
      seg('st-qcat-distbar__seg--60', n60) +
      seg('st-qcat-distbar__seg--0', n0) +
      `</div>`;
  }

  /**
   * Build the inline detail HTML for an expanded question card.
   * Handles MC choices, fill-in-blank, and missing metadata gracefully.
   */
  function buildCardDetail(pt) {
    const questionText = pt.question_text || null;
    const choices = Array.isArray(pt.choices) ? pt.choices : null;
    const studentAnswer = pt.student_answer || null;
    const correctAnswer = pt.correct_answer || null;
    const isCorrect = pt.is_correct;
    const score = dpScore(pt);
    const dateLabel = pt.date ? formatDate(pt.date) : null;

    let html = '';

    // Full question text
    if (questionText) {
      html += `<div class="st-qcat-card__question">${escapeHtml(questionText)}</div>`;
    }

    // Verdict line
    let verdictHtml = '';
    if (score === 100 || isCorrect === true) {
      verdictHtml = `<div class="st-qcat-card__verdict st-qcat-card__verdict--correct">✅ You got this one right!</div>`;
    } else if (score != null && score >= 60) {
      verdictHtml = `<div class="st-qcat-card__verdict st-qcat-card__verdict--partial">⚠️ Partial credit: ${score}%</div>`;
    } else if (score != null) {
      verdictHtml = `<div class="st-qcat-card__verdict st-qcat-card__verdict--wrong">❌ Missed (${score}%)</div>`;
    } else if (isCorrect === false) {
      verdictHtml = `<div class="st-qcat-card__verdict st-qcat-card__verdict--wrong">❌ You missed this one.</div>`;
    }
    html += verdictHtml;

    if (choices && choices.length > 0) {
      // Multiple-choice: render all options with highlighting
      const studentAnswerUpper = studentAnswer ? String(studentAnswer).trim().toUpperCase() : null;
      const correctAnswerUpper = correctAnswer ? String(correctAnswer).trim().toUpperCase() : null;

      const choiceItems = choices.map((choice, idx) => {
        let choiceKey;
        let choiceText;
        if (typeof choice === 'object' && choice !== null) {
          choiceKey = choice.key ? String(choice.key).toUpperCase() : (idx < 26 ? String.fromCharCode(65 + idx) : null);
          const displayKey = choice.key || (idx < 26 ? String.fromCharCode(65 + idx) : '');
          choiceText = `${displayKey ? displayKey + ') ' : ''}${choice.text || choice.label || choice.value || ''}`;
        } else {
          const str = String(choice);
          const letterMatch = str.match(/^([A-Za-z])[).\s]/);
          choiceKey = letterMatch ? letterMatch[1].toUpperCase() : (idx < 26 ? String.fromCharCode(65 + idx) : null);
          choiceText = str;
        }

        // Also try full-text matching for correct_answer / student_answer stored as text
        const choiceTextUpper = typeof choice === 'object' && choice !== null
          ? String(choice.text || choice.label || choice.value || '').trim().toUpperCase()
          : String(choice).replace(/^[A-Za-z][).\s]+/, '').trim().toUpperCase();

        const isCorrectChoice = (choiceKey && choiceKey === correctAnswerUpper) ||
          (choiceTextUpper && correctAnswerUpper && choiceTextUpper === correctAnswerUpper);
        const isStudentWrong = !isCorrectChoice &&
          ((choiceKey && choiceKey === studentAnswerUpper) ||
          (choiceTextUpper && studentAnswerUpper && choiceTextUpper === studentAnswerUpper)) &&
          isCorrect !== true;

        let cls = 'st-qcat-choice';
        let badges = '';
        if (isCorrectChoice) {
          cls += ' st-qcat-choice--correct';
          badges += '<span class="st-qcat-choice__badge" aria-label="Correct answer">✅ Correct</span>';
        }
        if (isStudentWrong) {
          cls += ' st-qcat-choice--student-wrong';
          badges += '<span class="st-qcat-choice__badge" aria-label="Your answer">👤 You picked this</span>';
        }

        return `<li class="${cls}">` +
          `<span class="st-qcat-choice__label" aria-hidden="true"></span>` +
          `<span class="st-qcat-choice__text">${escapeHtml(choiceText)}</span>` +
          badges +
          `</li>`;
      }).join('');

      html += `<ul class="st-qcat-card__choices" aria-label="Answer choices">${choiceItems}</ul>`;
    } else if (studentAnswer !== null && studentAnswer !== undefined) {
      // Fill-in-blank / written answer — show what the student wrote inline
      html += `<div class="st-qcat-card__fib">${escapeHtml(String(studentAnswer))}</div>`;
      if (correctAnswer && !isCorrect) {
        html += `<div class="st-qcat-card__verdict st-qcat-card__verdict--wrong">Correct answer: "${escapeHtml(String(correctAnswer))}".</div>`;
      }
    } else if (!questionText) {
      html += `<div class="st-qcat-card__no-detail">Details not captured for this question.</div>`;
    }

    if (dateLabel) {
      html += `<div class="st-qcat-card__meta">Date: ${escapeHtml(dateLabel)}</div>`;
    }

    return html;
  }

  /**
   * Build a single question card HTML (collapsed summary + hidden inline detail).
   * The detail panel is pre-rendered but hidden via `hidden` attribute for performance.
   * JS reveals it on click without needing to re-render.
   */
  function buildQuestionCard(pt, qNum, cardId) {
    const rawText = pt.question_text || null;
    const cardText = rawText
      ? (rawText.length > ACC_Q_TEXT_CARD_MAX ? rawText.substring(0, ACC_Q_TEXT_CARD_MAX) + '…' : rawText)
      : null;
    const ariaText = rawText
      ? (rawText.length > ACC_Q_TEXT_ARIA_MAX ? rawText.substring(0, ACC_Q_TEXT_ARIA_MAX) + '…' : rawText)
      : `Question ${qNum}`;

    const borderColor = cardBorderColor(pt);
    const dot = `<span class="st-qcat-card__dot" style="background:${dotColor(pt)};" aria-hidden="true"></span>`;

    const score = dpScore(pt);
    let scoreDisplay;
    if (pt.score != null) {
      scoreDisplay = `<span class="st-qcat-card__score" style="color:${SCORE_TO_COLOR(score)};">${score}%</span>`;
    } else if (pt.is_correct === true) {
      scoreDisplay = `<span class="st-qcat-card__score" style="color:#22c55e;">✅</span>`;
    } else if (pt.is_correct === false) {
      scoreDisplay = `<span class="st-qcat-card__score" style="color:#f87171;">❌</span>`;
    } else {
      scoreDisplay = '';
    }

    const chevronSvg = '<svg class="st-qcat-card__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    const detailId = `${cardId}-detail`;
    const summaryLabel = `Q${qNum}: ${ariaText}`;

    return `<div class="st-qcat-card" style="border-left-color:${borderColor};" data-qcat-card>` +
      `<button class="st-qcat-card__summary" aria-expanded="false" aria-controls="${detailId}" aria-label="${escapeHtml(summaryLabel)}">` +
        `<span class="st-qcat-card__num" aria-hidden="true">Q${qNum}</span>` +
        dot +
        `<span class="st-qcat-card__text">${cardText ? escapeHtml(cardText) : '<em style="opacity:.55">No question text</em>'}</span>` +
        scoreDisplay +
        chevronSvg +
      `</button>` +
      `<div class="st-qcat-card__detail" id="${detailId}" hidden>` +
        buildCardDetail(pt) +
      `</div>` +
      `</div>`;
  }

  /**
   * Compute which data points pass the active filter.
   * filter: 'all' | 'correct' | 'missed' | 'partial'
   */
  function filterDataPoints(points, filter) {
    if (!filter || filter === 'all') return points;
    return points.filter(pt => {
      const s = dpScore(pt);
      if (filter === 'correct') return s === 100 || pt.is_correct === true;
      if (filter === 'missed')  return (s != null && s < 60) || pt.is_correct === false;
      if (filter === 'partial') return s != null && s >= 60 && s < 100 && pt.is_correct !== true;
      return true;
    });
  }

  /**
   * Choose the default filter based on the goal status derived from progress entries.
   * Returns 'missed' if the goal is not on track, otherwise 'all'.
   */
  function defaultFilter(dataPoints) {
    if (!dataPoints || !dataPoints.length) return 'all';
    const s = avgScore(dataPoints);
    if (s == null) return 'all';
    // 'missed' default when overall score is below 80 (not on track)
    return s < 80 ? 'missed' : 'all';
  }

  /**
   * Compute quarter summary statistics for a set of data points.
   * Returns { total, correct, pct, missedByChapter, bestByChapter, streak, assignmentCount }
   */
  function computeQuarterSummary(dataPoints, groups) {
    const total = dataPoints.length;
    const correct = dataPoints.filter(p => dpScore(p) === 100 || p.is_correct === true).length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const assignmentCount = groups.length;

    // Streak: consecutive fully-correct assignments (newest-first groups already sorted)
    let streak = 0;
    for (const g of groups) {
      const allCorrect = g.points.every(p => dpScore(p) === 100 || p.is_correct === true);
      if (allCorrect) { streak++; } else { break; }
    }

    return { total, correct, pct, streak, assignmentCount };
  }

  /**
   * Build the Quarter Catalog Summary section HTML.
   */
  function buildQuarterSummaryHtml(summary) {
    const { total, correct, pct, streak, assignmentCount } = summary;
    const scoreColor = SCORE_TO_COLOR(pct);
    const missed = total - correct;

    const celebrateHtml = missed === 0 && total > 0
      ? `<div class="st-qcat-celebrate" role="status">🎉 You got every question right this quarter!</div>`
      : '';

    return `<div class="st-qcat-summary" aria-label="Quarter summary">
      <div class="st-qcat-kpi">
        <div class="st-qcat-kpi__value">${total}</div>
        <div class="st-qcat-kpi__label">Questions</div>
      </div>
      <div class="st-qcat-kpi">
        <div class="st-qcat-kpi__value" style="color:${scoreColor};">${pct}%</div>
        <div class="st-qcat-kpi__label">Correct</div>
      </div>
      <div class="st-qcat-kpi">
        <div class="st-qcat-kpi__value" style="color:#f87171;">${missed}</div>
        <div class="st-qcat-kpi__label">Missed</div>
      </div>
      <div class="st-qcat-kpi">
        <div class="st-qcat-kpi__value">${streak > 0 ? streak + ' 🔥' : '—'}</div>
        <div class="st-qcat-kpi__label">Streak</div>
      </div>
      <div class="st-qcat-kpi">
        <div class="st-qcat-kpi__value">${assignmentCount}</div>
        <div class="st-qcat-kpi__label">Assignments</div>
      </div>
    </div>${celebrateHtml}`;
  }

  /**
   * Build question cards HTML for a filtered list of data points in a group.
   * Cards are numbered sequentially by their position in the group (qNumOffset = 1-based start).
   */
  function buildCardsHtml(points, idBase, filter, qNumOffset) {
    const filtered = filterDataPoints(points, filter);
    if (!filtered.length) {
      const msg = filter === 'missed'    ? 'No missed questions — great work! 🎉'
                : filter === 'correct'   ? 'No correct questions in this group.'
                : filter === 'partial'   ? 'No partial-credit questions here.'
                : 'No questions in this group.';
      return `<div class="st-qcat-group-empty">${msg}</div>`;
    }
    return `<div class="st-qcat-cards">` +
      filtered.map((pt, i) => {
        const origIdx = points.indexOf(pt);
        const qNum = (origIdx >= 0 ? origIdx : i) + qNumOffset;
        const cardId = `${idBase}-q${qNum}`;
        return buildQuestionCard(pt, qNum, cardId);
      }).join('') +
      `</div>`;
  }

  /**
   * Build a single assignment-group header + body HTML.
   */
  function buildGroupHtml(group, groupIdx, idBase, filter, isExpanded) {
    if (!group.points.length) return '';
    const dateLabel = escapeHtml(formatDate(group.date));
    const qCount = group.points.length;
    const avg = avgScore(group.points);
    const groupPct = avg != null ? Math.round(avg) : null;
    const scoreColor = groupPct != null ? SCORE_TO_COLOR(groupPct) : '#94a3b8';
    const groupCorrect = group.points.filter(p => dpScore(p) === 100 || p.is_correct === true).length;
    const groupMissed = qCount - groupCorrect;
    const distBar = buildDistBar(group.points);

    const headerId = `${idBase}-gh${groupIdx}`;
    const bodyId   = `${idBase}-gb${groupIdx}`;
    const chevronSvg = '<svg class="st-qcat-group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

    const cardsHtml = isExpanded
      ? buildCardsHtml(group.points, `${idBase}-g${groupIdx}`, filter, 1)
      : '';

    return `<div class="st-qcat-group" data-qcat-group>` +
      `<button class="st-qcat-group-header" id="${headerId}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-controls="${bodyId}">` +
        `<span class="st-qcat-group-title">${dateLabel}</span>` +
        `<span class="st-qcat-group-meta">${qCount} question${qCount !== 1 ? 's' : ''}</span>` +
        distBar +
        `<span class="st-qcat-group-score" style="color:${scoreColor};">${groupPct != null ? groupPct + '%' : '—'}</span>` +
        `<span class="st-qcat-group-counts">` +
          `<span class="st-qcat-group-correct" aria-label="${groupCorrect} correct">✅ ${groupCorrect}</span>` +
          `<span class="st-qcat-group-missed" aria-label="${groupMissed} missed">❌ ${groupMissed}</span>` +
        `</span>` +
        chevronSvg +
      `</button>` +
      `<div class="st-qcat-group-body" id="${bodyId}" ${isExpanded ? '' : 'hidden'} data-qcat-group-body data-loaded="${isExpanded ? 'true' : 'false'}">` +
        cardsHtml +
      `</div>` +
      `</div>`;
  }

  /**
   * Build the filter chips HTML.
   */
  function buildFilterChipsHtml(activeFilter, idBase) {
    const chips = [
      { key: 'all',     label: 'All' },
      { key: 'correct', label: '✅ Correct' },
      { key: 'missed',  label: '❌ Missed' },
      { key: 'partial', label: '⚠️ Partial' },
    ];
    return `<div class="st-qcat-filters" role="group" aria-label="Filter questions" data-qcat-filters data-catalog="${idBase}">` +
      chips.map(c =>
        `<button class="st-qcat-chip" data-filter="${c.key}" aria-pressed="${activeFilter === c.key ? 'true' : 'false'}" aria-label="Show ${c.label} questions">${c.label}</button>`
      ).join('') +
      `</div>`;
  }

  /**
   * Build the group-by toolbar HTML.
   */
  function buildGroupByToolbarHtml(activeGroupBy, idBase) {
    const opts = [
      { key: 'assignment',  label: 'Assignment' },
      { key: 'none',        label: 'None' },
    ];
    return `<div class="st-qcat-toolbar" role="group" aria-label="Group questions by" data-qcat-groupby data-catalog="${idBase}">` +
      `<span class="st-qcat-groupby-label">Group by:</span>` +
      opts.map(o =>
        `<button class="st-qcat-groupby-btn" data-groupby="${o.key}" aria-pressed="${activeGroupBy === o.key ? 'true' : 'false'}">${o.label}</button>`
      ).join('') +
      `</div>`;
  }

  /**
   * Build the full question catalog HTML (groups list).
   */
  function buildGroupsHtml(groups, idBase, filter, groupBy) {
    if (groupBy === 'assignment') {
      return groups
        .map((g, i) => buildGroupHtml(g, i, idBase, filter, false))
        .join('');
    }
    // Flat (no grouping) — render all filtered points as a single card list
    const allPoints = groups.flatMap(g => g.points);
    const filtered = filterDataPoints(allPoints, filter);
    if (!filtered.length) {
      const msg = filter === 'missed'    ? '🎉 No missed questions — great work!'
                : filter === 'correct'   ? 'No correct questions found.'
                : filter === 'partial'   ? 'No partial-credit questions found.'
                : 'No questions found.';
      return `<div class="st-qcat-no-results"><span class="st-qcat-no-results__emoji">🔍</span>${msg}</div>`;
    }
    return `<div class="st-qcat-cards">` +
      filtered.map((pt, i) => {
        const cardId = `${idBase}-qf${i + 1}`;
        return buildQuestionCard(pt, i + 1, cardId);
      }).join('') +
      `</div>`;
  }

  /**
   * Build a collapsible question catalog for per-question goal data points.
   * Replaces the old hover-tooltip accordion with a three-level:
   *   Level 1 — Quarter Catalog Summary (always visible)
   *   Level 2 — Assignment rows (collapsed by default, expand on click)
   *   Level 3 — Question cards with inline expand (no hover required)
   *
   * @param {Array}  dataPoints  - rows from goal_data_points table for this goal
   * @param {string} goalId      - goal UUID (used as id prefix for aria/interaction)
   * @param {string} [suffix]    - optional suffix to ensure unique DOM IDs
   * @returns {{ html: string, hasData: boolean }}
   */
  function buildDotGridChart(dataPoints, goalId, suffix) {
    if (!dataPoints || dataPoints.length === 0) {
      return { html: '', hasData: false };
    }

    // Group by instance (assignment_instance_id or date as fallback)
    const groupsMap = new Map();
    for (const pt of dataPoints) {
      const key = pt.assignment_instance_id || pt.date;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { key, date: pt.date, points: [] });
      }
      groupsMap.get(key).points.push(pt);
    }

    // Sort groups newest-first
    const sortedGroups = [...groupsMap.values()].sort((a, b) => new Date(b.date) - new Date(a.date));

    const idBase = `qcat-${(goalId || 'g').replace(/[^a-z0-9]/gi, '_')}${suffix || ''}`;

    // Sanitise goalId for use in localStorage keys — only allow alphanumerics and hyphens
    // (UUIDs are always in this format; this guards against unexpected input).
    const safeGoalId = String(goalId || '').replace(/[^a-z0-9-]/gi, '_');

    // Retrieve persisted groupBy preference (localStorage) or choose sensible default
    let savedGroupBy = 'assignment';
    try { savedGroupBy = localStorage.getItem(`rc_goal_groupby_${safeGoalId}`) || 'assignment'; } catch (_) { /* ignore */ }
    // Validate to only allow known values; reject any tampered/unknown value
    if (savedGroupBy !== 'none' && savedGroupBy !== 'assignment') savedGroupBy = 'assignment';

    // Choose default filter: 'missed' if goal is struggling, else 'all'
    const activeFilter = defaultFilter(dataPoints);

    const summary = computeQuarterSummary(dataPoints, sortedGroups);
    const summaryHtml  = buildQuarterSummaryHtml(summary);
    const filterHtml   = buildFilterChipsHtml(activeFilter, idBase);
    const groupByHtml  = buildGroupByToolbarHtml(savedGroupBy, idBase);
    const groupsHtml   = buildGroupsHtml(sortedGroups, idBase, activeFilter, savedGroupBy);

    // Store groups in registry so the lazy-render handler can access them later
    QCAT_GROUPS_REGISTRY.set(idBase, sortedGroups);

    const html = `
      <div class="st-dot-grid-wrap" id="${idBase}" data-qcat-catalog data-goal-id="${escapeHtml(goalId || '')}" data-filter="${activeFilter}" data-groupby="${savedGroupBy}" data-idbase="${escapeHtml(idBase)}">
        <div class="st-dot-grid-header">Question Catalog</div>
        ${summaryHtml}
        ${filterHtml}
        ${groupByHtml}
        <div class="st-qcat-group-list" data-qcat-list>
          ${groupsHtml}
        </div>
      </div>`;

    return { html, hasData: true, groups: sortedGroups };
  }

  /**
   * Render a single goal card
   */
  function renderGoalCard(goal, progressMap, dataPointsMap, containerSuffix = '') {
    const colorCategory = goalAreaToColorCategory(goal.goal_area);
    // Clean up any "Baseline: XX%" text that leaked into the description field
    let fullDesc = (goal.desc || goal.goal_text || '(No goal description provided)').replace(/\s*Baseline:?\s*\d+%?\s*$/i, '').trim();
    
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
    
    // Calculate this quarter's data points using school-year quarters from quarter-utils.
    // Falls back to calendar quarters (Jan/Apr/Jul/Oct) if quarter-utils is unavailable.
    let thisQuarterEntries = [];
    if (quarterUtils) {
      try {
        const currentQ = quarterUtils.getCurrentQuarter();
        const range = quarterUtils.getQuarterDateRange(currentQ);
        if (range) {
          thisQuarterEntries = progressEntries.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate >= range.start && entryDate <= range.end;
          });
        }
      } catch (e) {
        console.warn(LOG_PREFIX, 'quarter-utils error, falling back to calendar quarters:', e);
      }
    }
    // Fallback: use calendar quarters only if quarter-utils could not be loaded
    if (!quarterUtils) {
      const now = new Date();
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / MONTHS_PER_QUARTER) * MONTHS_PER_QUARTER, 1);
      thisQuarterEntries = progressEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= quarterStart;
      });
    }
    
    // Get last data collection date
    let lastDate = 'Never';
    if (progressEntries.length > 0) {
      const sortedEntries = [...progressEntries].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
      );
      lastDate = formatDate(sortedEntries[0].date);
    }
    
    // Count per-question data points for this quarter (from goal_data_points)
    const goalDataPointsAll = dataPointsMap ? (dataPointsMap.get(goal.id) || []) : [];
    let thisQuarterDataPoints = [];
    if (quarterUtils) {
      try {
        const currentQ = quarterUtils.getCurrentQuarter();
        const range = quarterUtils.getQuarterDateRange(currentQ);
        if (range) {
          thisQuarterDataPoints = goalDataPointsAll.filter(dp => {
            const d = new Date(dp.date);
            return d >= range.start && d <= range.end;
          });
        }
      } catch (e) { /* fallback below */ }
    }
    if (thisQuarterDataPoints.length === 0 && !quarterUtils) {
      const now = new Date();
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / MONTHS_PER_QUARTER) * MONTHS_PER_QUARTER, 1);
      thisQuarterDataPoints = goalDataPointsAll.filter(dp => new Date(dp.date) >= quarterStart);
    }

    const dpCount = thisQuarterDataPoints.length;
    const statusSvg = (dpCount > 0 || thisQuarterEntries.length > 0)
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
    const statusText = dpCount > 0
      ? `${dpCount} data ${dpCount === 1 ? 'point' : 'points'} this quarter`
      : (thisQuarterEntries.length > 0
          ? `${thisQuarterEntries.length} data ${thisQuarterEntries.length === 1 ? 'point' : 'points'} this quarter`
          : 'No data this quarter');
    
    // Measurement badge: show map-pin SVG + text, or hide if no measurement type
    const measurementBadgeHtml = goal.measurement_type
      ? `<span class="st-badge st-badge-measurement"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:3px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>${escapeHtml(goal.measurement_type)}</span>`
      : '';
    
    // Baseline, mastery, and target display with friendly empty states
    const baselineHtml = (goal.baseline != null && goal.baseline !== '')
      ? escapeHtml(String(goal.baseline))
      : '<span class="st-metric-empty">Not yet set</span>';
    const masteryHtml = (goal.mastery != null && goal.mastery !== '')
      ? escapeHtml(String(goal.mastery))
      : (goal.target != null && goal.target !== '')
        ? escapeHtml(formatProgressValue(goal.target, goal.measurement_type))
        : '<span class="st-metric-empty">Not yet set</span>';
    const targetHtml = (goal.target != null && goal.target !== '')
      ? escapeHtml(formatProgressValue(goal.target, goal.measurement_type))
      : '<span class="st-metric-empty">Not yet set</span>';
    
    // Build progress detail section (if there are entries to show)
    const progressDetailId = `st-goal-progress-${(goal.code ?? goal.id).replace(/[^a-z0-9]/gi, '_')}${containerSuffix ? '-' + containerSuffix : ''}`;
    let progressDetailHtml = '';
    // Note: progressTowardTargetHtml intentionally omitted — the dot-grid chart
    // replaces the "You're at X% → Target Y%" bar.
    if (progressEntries.length > 0) {
      const sortedForDisplay = [...progressEntries].sort((a, b) => new Date(b.date) - new Date(a.date));
      const latestEntry = sortedForDisplay[0];
      const latestNumeric = parseFloat(latestEntry.value);

      const chartHtml = buildProgressSVG(progressEntries, goal);

      // Quarter average
      const qAvgVal = thisQuarterEntries.length > 0
        ? thisQuarterEntries.reduce((sum, e) => sum + parseFloat(e.value || 0), 0) / thisQuarterEntries.length
        : null;

      // SPED-friendly status banner and summary stats
      const targetNumeric = goal.target != null ? parseFloat(goal.target) : null;
      const baselineNumeric = goal.baseline != null ? parseFloat(goal.baseline) : null;
      const sortedAsc = [...progressEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
      const trend = computeTrendArrow(sortedAsc);
      const statusBannerHtml = buildStatusBannerHtml(latestNumeric, targetNumeric, baselineNumeric, goal.measurement_type);
      const statsRowHtml = buildStatsRowHtml(latestNumeric, qAvgVal, targetNumeric, trend, goal.measurement_type);

      // Dot grid chart (per-question data points)
      const goalDataPoints = dataPointsMap ? (dataPointsMap.get(goal.id) || []) : [];
      const { html: dotGridHtml, hasData: hasDotGrid, groups: _dotGridGroups } = buildDotGridChart(goalDataPoints, goal.id, containerSuffix);
      // When per-question dot-grid data exists, show it instead of the legacy line chart
      const chartSectionHtml = hasDotGrid
        ? dotGridHtml
        : `<div class="st-goal-chart-container">${chartHtml}</div>`;

      progressDetailHtml = `
        <div class="st-goal-progress-detail" id="${progressDetailId}">
          ${statusBannerHtml}
          ${statsRowHtml}
          ${chartSectionHtml}
        </div>`;
    }

    // Toggle button starts as "Hide Progress" since the panel is expanded by default (Item 2)
    const toggleBtn = progressEntries.length > 0
      ? `<button class="st-goal-progress-toggle" data-progress-id="${progressDetailId}" aria-expanded="true" aria-controls="${progressDetailId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events:none;transform:rotate(180deg)"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg><span class="st-goal-progress-toggle-label" style="pointer-events:none">Hide Progress</span></button>`
      : '';

    return `
      <div class="st-goal-card" data-goal-id="${goal.id}" data-area="${colorCategory}">
        <div class="st-goal-header">
          <div class="st-goal-title-line">
            <span class="st-goal-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg></span>
            <span class="st-goal-area-name">${escapeHtml(goal.goal_area || 'Goal')}</span>
            <span class="st-goal-code">${escapeHtml(goal.code || '')}</span>
            ${measurementBadgeHtml}
          </div>
        </div>
        ${descHtml}
        <div class="st-goal-metrics">
          <div class="st-metric">
            <span class="st-metric-label">Baseline:</span>
            <span class="st-metric-value">${baselineHtml}</span>
          </div>
          <div class="st-metric">
            <span class="st-metric-label">Mastery:</span>
            <span class="st-metric-value">${masteryHtml}</span>
          </div>
          <div class="st-metric">
            <span class="st-metric-label">Target:</span>
            <span class="st-metric-value">${targetHtml}</span>
          </div>
        </div>
        <div class="st-goal-data-status">
          <div class="st-data-status-item">
            <span>${statusSvg}</span>
            <span>${statusText}</span>
          </div>
          <div class="st-data-status-item">
            <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></span>
            <span>Last: ${lastDate}</span>
          </div>
          ${toggleBtn ? `<div class="st-data-status-item st-data-status-item--toggle">${toggleBtn}</div>` : ''}
        </div>
        ${progressDetailHtml}
      </div>
    `;
  }
  
  /**
   * Attach event listeners to "Show more" and progress toggle buttons.
   * Uses event delegation on stable tab-panel containers (#tabGoals and
   * #tabDashboard) so that listeners survive any innerHTML replacements
   * inside those panels (e.g. after goals are re-rendered).
   *
   * A module-level flag (state.goalClickHandlersAttached) ensures the
   * handler is attached only once per page load, preventing duplicate
   * listeners across multiple loadStudentGoals() calls.
   */
  function attachShowMoreListeners() {
    if (state.goalClickHandlersAttached) return;

    const stableContainers = [
      document.getElementById('tabGoals'),
      document.getElementById('tabDashboard'),
    ];

    // Shared handler for both containers — defined once and reused
    function handleGoalClick(e) {
      // Handle "Show more / Show less" description toggle
      const showMoreBtn = e.target.closest('.st-goal-show-more');
      if (showMoreBtn) {
        const descContainer = showMoreBtn.parentElement;
        descContainer.classList.toggle('expanded');
        showMoreBtn.textContent = descContainer.classList.contains('expanded') ? 'Show less' : 'Show more';
        return;
      }

      // Handle "View Progress / Hide Progress" panel toggle
      const toggleBtn = e.target.closest('.st-goal-progress-toggle')
        || e.target.closest('button[data-progress-id]');
      if (toggleBtn) {
        const targetId = toggleBtn.dataset.progressId;
        // Scope lookup to the parent goal card to avoid matching duplicate IDs
        // that exist when the same goal is rendered in both #tabGoals and #tabDashboard.
        const card = toggleBtn.closest('.st-goal-card');
        const panel = (card ? card.querySelector('.st-goal-progress-detail') : null)
          || document.getElementById(targetId);
        if (!panel) {
          console.warn('[student-portal] Progress panel not found for id:', targetId);
          return;
        }
        // Use aria-expanded as the source of truth — it is always set on render
        // and stays in sync regardless of how panel.hidden was last set.
        const wasExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        const nowExpanded = !wasExpanded;
        panel.hidden = !nowExpanded;
        panel.style.display = nowExpanded ? '' : 'none';
        panel.setAttribute('aria-hidden', String(!nowExpanded));
        toggleBtn.setAttribute('aria-expanded', String(nowExpanded));
        const svgEl = toggleBtn.querySelector('svg');
        if (svgEl) svgEl.style.transform = nowExpanded ? 'rotate(180deg)' : '';
        const labelEl = toggleBtn.querySelector('.st-goal-progress-toggle-label');
        if (labelEl) labelEl.textContent = nowExpanded ? 'Hide Progress' : 'View Progress';
      }
    }

    let attached = false;
    stableContainers.forEach(container => {
      if (!container) return;
      container.addEventListener('click', handleGoalClick);
      attached = true;
    });

    // Mark as attached only if at least one container was found so that
    // a retry is possible if the DOM is not yet ready on first call.
    if (attached) {
      state.goalClickHandlersAttached = true;
    }
  }

  /**
   * Set up delegated event handlers for the Question Catalog.
   * Handles:
   *  - Filter chip clicks (All / Correct / Missed / Partial)
   *  - Group-by button clicks (Assignment / None)
   *  - Assignment group header expand/collapse
   *  - Question card inline expand/collapse
   *  - Keyboard navigation (Enter/Space to toggle, Escape to collapse)
   * Called once on DOMContentLoaded. Works via delegation so it handles
   * dynamically-rendered catalogs without re-attaching.
   */
  function setupDotGridPopup() {
    // ── Helper: find closest ancestor matching selector ───────────────────
    // (same as .closest() but uses manual loop for robustness across all elements)
    function findClosest(el, selector) {
      let node = el;
      while (node && node !== document.body) {
        if (node.matches && node.matches(selector)) return node;
        node = node.parentNode;
      }
      return null;
    }

    // ── Helper: get the catalog root for a given element ─────────────────
    function getCatalog(el) {
      return findClosest(el, '[data-qcat-catalog]');
    }

    // ── Re-render the group list inside a catalog ─────────────────────────
    // Reads current filter & groupBy from the catalog element, then rebuilds
    // just the group list area in-place (avoids full card re-render).
    // Allowed values for filter and groupBy (allowlist for XSS prevention)
    const ALLOWED_FILTERS  = new Set(['all', 'correct', 'missed', 'partial']);
    const ALLOWED_GROUPBYS = new Set(['assignment', 'none']);

    function sanitizeFilter(v) {
      return ALLOWED_FILTERS.has(v) ? v : 'all';
    }
    function sanitizeGroupBy(v) {
      return ALLOWED_GROUPBYS.has(v) ? v : 'assignment';
    }
    // idBase is always `qcat-` + alphanumeric only (from the registry key lookup).
    // We use the registry key directly rather than the DOM attribute to avoid any
    // potential DOM-injection attack.
    function safeIdBaseFromCatalog(catalog) {
      const idAttr = catalog ? (catalog.getAttribute('data-idbase') || '') : '';
      // The registry is keyed by idBase values we generated ourselves — only return
      // idAttr if the registry actually contains it (prevents spoofing).
      return QCAT_GROUPS_REGISTRY.has(idAttr) ? idAttr : '';
    }

    function rerenderCatalogGroups(catalog) {
      if (!catalog) return;
      const idBase  = safeIdBaseFromCatalog(catalog);
      const filter  = sanitizeFilter(catalog.getAttribute('data-filter') || '');
      const groupBy = sanitizeGroupBy(catalog.getAttribute('data-groupby') || '');
      const listEl  = catalog.querySelector('[data-qcat-list]');
      if (!listEl || !idBase) return;

      // Look up the original groups from the in-memory registry
      const rawGroups = QCAT_GROUPS_REGISTRY.get(idBase);
      if (!rawGroups) return;

      listEl.innerHTML = buildGroupsHtml(rawGroups, idBase, filter, groupBy);
    }

    // ── Filter chip click ─────────────────────────────────────────────────
    document.addEventListener('click', e => {
      const chip = findClosest(e.target, '[data-qcat-filters] [data-filter]');
      if (chip) {
        const catalog = getCatalog(chip);
        if (!catalog) return;
        const filter = sanitizeFilter(chip.getAttribute('data-filter') || '');
        catalog.setAttribute('data-filter', filter);
        // Update aria-pressed on all chips in this catalog
        catalog.querySelectorAll('[data-qcat-filters] [data-filter]').forEach(c => {
          c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
        });
        rerenderCatalogGroups(catalog);
        return;
      }

      // ── Group-by button click ───────────────────────────────────────────
      const gbBtn = findClosest(e.target, '[data-qcat-groupby] [data-groupby]');
      if (gbBtn) {
        const catalog = getCatalog(gbBtn);
        if (!catalog) return;
        const groupBy = sanitizeGroupBy(gbBtn.getAttribute('data-groupby') || '');
        catalog.setAttribute('data-groupby', groupBy);
        // Persist to localStorage (sanitize goal ID before use as key)
        try {
          const gid = String(catalog.getAttribute('data-goal-id') || '').replace(/[^a-z0-9-]/gi, '_');
          if (gid) localStorage.setItem(`rc_goal_groupby_${gid}`, groupBy);
        } catch (_) { /* ignore */ }
        // Update aria-pressed
        catalog.querySelectorAll('[data-qcat-groupby] [data-groupby]').forEach(b => {
          b.setAttribute('aria-pressed', b === gbBtn ? 'true' : 'false');
        });
        rerenderCatalogGroups(catalog);
        return;
      }

      // ── Assignment group header toggle ──────────────────────────────────
      const groupHeader = findClosest(e.target, '.st-qcat-group-header');
      if (groupHeader) {
        const groupEl  = findClosest(groupHeader, '[data-qcat-group]');
        const bodyEl   = groupEl ? groupEl.querySelector('[data-qcat-group-body]') : null;
        if (!bodyEl) return;

        const expanded = groupHeader.getAttribute('aria-expanded') === 'true';
        const nowOpen  = !expanded;
        groupHeader.setAttribute('aria-expanded', String(nowOpen));
        bodyEl.hidden = !nowOpen;

        // Lazy-render question cards on first open
        if (nowOpen && bodyEl.getAttribute('data-loaded') !== 'true') {
          const catalog  = getCatalog(groupHeader);
          const filter   = sanitizeFilter(catalog ? catalog.getAttribute('data-filter') || '' : '');
          const idBase   = safeIdBaseFromCatalog(catalog);

          // Get group index from header id (e.g. qcat-xxx-gh0 → 0)
          const headerId = groupHeader.id || '';
          const idxMatch = headerId.match(/-gh(\d+)$/);
          const groupIdx = idxMatch ? Number(idxMatch[1]) : -1;
          const rawGroups = idBase ? QCAT_GROUPS_REGISTRY.get(idBase) : null;
          const group     = rawGroups && groupIdx >= 0 ? rawGroups[groupIdx] : null;

          if (group && idBase) {
            bodyEl.innerHTML = buildCardsHtml(group.points, `${idBase}-g${groupIdx}`, filter, 1);
            bodyEl.setAttribute('data-loaded', 'true');
          }
        }
        return;
      }

      // ── Question card summary toggle ────────────────────────────────────
      const cardSummary = findClosest(e.target, '.st-qcat-card__summary');
      if (cardSummary) {
        const detailId = cardSummary.getAttribute('aria-controls');
        const detailEl = detailId ? document.getElementById(detailId) : null;
        const expanded = cardSummary.getAttribute('aria-expanded') === 'true';
        const nowOpen  = !expanded;
        cardSummary.setAttribute('aria-expanded', String(nowOpen));
        if (detailEl) detailEl.hidden = !nowOpen;
        return;
      }
    });

    // ── Keyboard: Enter/Space activates focused buttons; Esc collapses ────
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        // Collapse the nearest open card detail
        const active = document.activeElement;
        if (!active) return;
        const cardSummary = findClosest(active, '.st-qcat-card__summary');
        if (cardSummary && cardSummary.getAttribute('aria-expanded') === 'true') {
          cardSummary.setAttribute('aria-expanded', 'false');
          const detailId = cardSummary.getAttribute('aria-controls');
          const detailEl = detailId ? document.getElementById(detailId) : null;
          if (detailEl) detailEl.hidden = true;
          cardSummary.focus();
          e.preventDefault();
          return;
        }
        const groupHeader = findClosest(active, '.st-qcat-group-header');
        if (groupHeader && groupHeader.getAttribute('aria-expanded') === 'true') {
          groupHeader.setAttribute('aria-expanded', 'false');
          const bodyId = groupHeader.getAttribute('aria-controls');
          const bodyEl = bodyId ? document.getElementById(bodyId) : null;
          if (bodyEl) bodyEl.hidden = true;
          groupHeader.focus();
          e.preventDefault();
        }
      }
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
    isRetryMode: false,
    retryLockedQuestionIds: new Set(),
    scoringResults: [],
    submissionAnswers: [],
    submissionFeedback: null,
  };
  
  // Constants
  const PANEL_TRANSITION_MS = 300; // Must match CSS transition duration

  /**
   * Check if the retry-below-60% feature is enabled via feature flag (localStorage).
   */
  function isRetryFeatureEnabled() {
    const stored = localStorage.getItem('rc_feature_retry_below_sixty');
    return stored === null ? true : stored === 'true';
  }
  
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
    
    // Get score from submissions if already loaded in tabState
    const submissions = tabState.gradesData || [];
    const sub = submissions.find(s => s.instance_id === instance.id);
    let score = null;
    if (sub && sub.review_status === 'reviewed') {
      if (sub.score_total != null) score = sub.score_total;
      else if (sub.score_manual != null) score = sub.score_manual;
      else if (sub.score_auto != null) score = sub.score_auto;
    }
    const scoreColorClass = score !== null ? (score >= 80 ? 'good' : score >= 60 ? 'ok' : 'poor') : '';
    const scoreHtml = score !== null ? `
      <span class="st-assignment-score ${scoreColorClass}">
        ${Math.round(score)}%
      </span>
    ` : '';
    
    // Feature 3: Progress tracking
    const totalQuestions = getTotalQuestionCount(instance);
    const answeredCount = getAnsweredCount(instance.id);
    const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    const progressHtml = totalQuestions > 0 && status !== 'submitted' && status !== 'graded' && status !== 'reviewed' ? `
      <div class="st-progress-mini">
        ${answeredCount} of ${totalQuestions} answered
      </div>
      <div class="st-progress-bar-mini">
        <div class="fill" style="width: ${progressPercent}%"></div>
      </div>
    ` : '';
    
    const statusIconMap = {
      'submitted': ICONS.upload,
      'graded': ICONS.checkCircle,
      'reviewed': ICONS.checkCircle,
      'overdue': ICONS.alertTriangle,
      'in-progress': ICONS.clock,
    };
    const statusIcon = statusIconMap[status] || '';

    return `
      <div class="st-assignment-card" data-instance-id="${escapeHtml(instance.id)}">
        <h3 class="st-assignment-title">${ICONS.document}${title}</h3>
        <div class="st-assignment-meta">
          <span>${series}</span>
          <span>•</span>
          <span>Due: ${dueDate}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="st-assignment-status ${status}">${statusIcon}${statusText}</span>
          ${scoreHtml}
        </div>
        ${progressHtml}
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
  async function openAssignmentViewer(instance) {
    console.log(LOG_PREFIX, 'Opening assignment viewer for:', instance.id);
    
    assignmentViewerState.currentAssignment = instance;
    assignmentViewerState.currentQuestionIndex = 0;
    assignmentViewerState.answers = new Map();
    assignmentViewerState.currentDay = 0;
    assignmentViewerState.scoringResults = [];
    assignmentViewerState.submissionAnswers = [];
    assignmentViewerState.submissionFeedback = null;
    
    // Check if assignment is submitted or graded (read-only mode)
    const isReadOnly = instance.status === 'Submitted' || instance.status === 'Graded' || instance.status === 'Reviewed';
    const isGraded = instance.status === 'Graded' || instance.status === 'Reviewed';
    assignmentViewerState.isReadOnly = isReadOnly;
    assignmentViewerState.isGraded = isGraded;

    // Detect retry mode from re-issued assignment settings
    const retryConfig = instance.settings && instance.settings.retry_config;
    if (retryConfig && !isReadOnly && Array.isArray(retryConfig.locked_question_ids) && retryConfig.locked_question_ids.length > 0) {
      assignmentViewerState.isRetryMode = true;
      assignmentViewerState.retryLockedQuestionIds = new Set(retryConfig.locked_question_ids);
      console.log(LOG_PREFIX, 'Retry mode activated from instance retry_config:', retryConfig.locked_question_ids.length, 'locked question(s)');
    } else {
      assignmentViewerState.isRetryMode = false;
      assignmentViewerState.retryLockedQuestionIds = new Set();
    }
    
    // Feature 1: Load saved answers from instance settings
    if (instance.settings && instance.settings.answers) {
      Object.entries(instance.settings.answers).forEach(([key, value]) => {
        assignmentViewerState.answers.set(key, value);
      });
    }
    if (!isReadOnly) {
      // Feature 1: Load saved answers from localStorage for in-progress assignments (overrides server)
      const savedAnswers = getSavedAnswers(instance.id);
      if (savedAnswers) {
        console.log(LOG_PREFIX, 'Resuming progress from localStorage');
        Object.entries(savedAnswers).forEach(([key, value]) => {
          assignmentViewerState.answers.set(key, value);
        });
        // Show "resuming" toast
        showToast('📌 Resuming your progress...');
      }
    }

    // Fetch submission details (teacher feedback + per-item grading data) for graded assignments
    if (isGraded) {
      const studentCode = sessionStorage.getItem('rc_user_code');
      if (studentCode) {
        try {
          const detailsUrl = `/.netlify/functions/student-submission-details?code=${encodeURIComponent(studentCode)}&instance_id=${encodeURIComponent(instance.id)}`;
          const detailsResp = await fetch(detailsUrl);
          if (detailsResp.ok) {
            const detailsData = await detailsResp.json();
            if (detailsData.ok) {
              assignmentViewerState.submissionAnswers = detailsData.answers || [];
              assignmentViewerState.submissionFeedback = detailsData.feedback || null;
              console.log(LOG_PREFIX, 'Loaded submission details:', assignmentViewerState.submissionAnswers.length, 'answers, feedback:', !!assignmentViewerState.submissionFeedback);
            }
          }
        } catch (e) {
          console.warn(LOG_PREFIX, 'Could not fetch submission details (non-fatal):', e);
        }
      }
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
    if (assignment.page) {
      // URL-based HTML assignment - render in iframe via src
      renderHtmlAssignmentPanel(panel, instance);
    } else if (meta.html_src) {
      // File-uploaded HTML assignment - render inline via srcdoc
      renderHtmlSrcdocPanel(panel, instance);
    } else if (!meta.days || meta.days.length === 0) {
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

    // Escape key closes the panel (but not when an rcModal is open on top)
    assignmentPanelEscapeHandler = function(e) {
      if (e.key === 'Escape' && !document.querySelector('.rc-modal-backdrop')) {
        closeAssignmentViewer();
      }
    };
    document.addEventListener('keydown', assignmentPanelEscapeHandler);
    
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
   * Render an HTML page assignment inside an iframe
   */
  function renderHtmlAssignmentPanel(panel, instance) {
    const assignment = instance.assignment || {};
    const title = escapeHtml(assignment.title || 'Assignment');
    const studentName = sessionStorage.getItem('rc_user_name') || instance.student_name || '';
    
    const pageUrl = assignment.page;
    const iframeSrc = studentName
      ? pageUrl + (pageUrl.includes('?') ? '&' : '?') + 'student=' + encodeURIComponent(studentName)
      : pageUrl;
    
    panel.innerHTML = `
      <button class="st-panel-back-btn" id="panelBackBtn">
        ← Back to Dashboard
      </button>
      <div class="st-panel-header">
        <h2>${title}</h2>
        <button class="st-panel-close-btn" id="panelCloseBtn">✕</button>
      </div>
      <iframe
        src="${escapeHtml(iframeSrc)}"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        style="width: 100%; flex: 1; border: none; min-height: 0;"
        title="${title}"
      ></iframe>
    `;
    
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    // Make panel near-full-screen for HTML assignments
    panel.style.width = '95vw';
    panel.style.maxWidth = '1200px';
    panel.style.height = '92vh';
    panel.style.maxHeight = '92vh';
    
    panel.querySelector('#panelBackBtn').addEventListener('click', closeAssignmentViewer);
    panel.querySelector('#panelCloseBtn').addEventListener('click', closeAssignmentViewer);

    // Initialise the postMessage bridge so the iframe can submit answers
    const studentCode = sessionStorage.getItem('rc_user_code');
    import('/web/html-assignment-bridge.js').then(({ initHtmlAssignmentBridge }) => {
      htmlBridgeCleanup = initHtmlAssignmentBridge(instance.id, studentCode);
    }).catch(err => {
      console.warn(LOG_PREFIX, 'Could not load html-assignment-bridge:', err);
    });
  }

  /**
   * Render a file-uploaded HTML assignment inside a sandboxed iframe using srcdoc.
   * The full HTML source is stored in assignment.meta.html_src.
   */
  function renderHtmlSrcdocPanel(panel, instance) {
    const assignment = instance.assignment || {};
    const meta = assignment.meta || {};
    const title = escapeHtml(assignment.title || 'Assignment');
    const htmlSrc = meta.html_src || '';

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    iframe.style.cssText = 'width: 100%; flex: 1; border: none; min-height: 0;';
    iframe.title = assignment.title || 'Assignment';
    iframe.srcdoc = htmlSrc;

    const backBtn = document.createElement('button');
    backBtn.className = 'st-panel-back-btn';
    backBtn.id = 'panelBackBtn';
    backBtn.textContent = '← Back to Dashboard';

    const header = document.createElement('div');
    header.className = 'st-panel-header';
    const headerTitle = document.createElement('h2');
    headerTitle.textContent = assignment.title || 'Assignment';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'st-panel-close-btn';
    closeBtn.id = 'panelCloseBtn';
    closeBtn.textContent = '✕';
    header.appendChild(headerTitle);
    header.appendChild(closeBtn);

    panel.appendChild(backBtn);
    panel.appendChild(header);
    panel.appendChild(iframe);

    panel.style.cssText = 'display: flex; flex-direction: column; width: 95vw; max-width: 1200px; height: 92vh; max-height: 92vh;';

    backBtn.addEventListener('click', closeAssignmentViewer);
    closeBtn.addEventListener('click', closeAssignmentViewer);

    // Initialise the postMessage bridge so the iframe can submit answers
    const studentCode = sessionStorage.getItem('rc_user_code');
    import('/web/html-assignment-bridge.js').then(({ initHtmlAssignmentBridge }) => {
      htmlBridgeCleanup = initHtmlAssignmentBridge(instance.id, studentCode);
    }).catch(err => {
      console.warn(LOG_PREFIX, 'Could not load html-assignment-bridge:', err);
    });
  }


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
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="st-timer hidden" id="assignmentTimer">⏱️ <span id="timerDisplay">00:00</span></span>
          <button class="st-btn secondary" id="btnToggleTimer" title="Show/hide timer" style="padding: 6px 12px;">⏱️</button>
          <button class="st-btn secondary st-read-aloud-btn" id="btnReadAloud" style="padding: 6px 12px;">🔊 Read Aloud</button>
          <button class="st-btn secondary" id="btnPrint" title="Print assignment" style="padding: 6px 12px;">🖨️</button>
          <button class="st-panel-close-btn" id="panelCloseBtn">✕</button>
        </div>
      </div>
      ${days.length > 1 ? `<div class="st-day-tabs" id="dayTabs">${dayTabsHtml}</div>` : ''}
      <div id="dayContent"></div>
    `;
    
    panel.querySelector('#panelBackBtn').addEventListener('click', closeAssignmentViewer);
    panel.querySelector('#panelCloseBtn').addEventListener('click', closeAssignmentViewer);
    
    // Feature 8: Print button
    const btnPrint = panel.querySelector('#btnPrint');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => window.print());
    }
    
    // Feature 12: Read Aloud button
    const btnReadAloud = panel.querySelector('#btnReadAloud');
    if (btnReadAloud) {
      btnReadAloud.addEventListener('click', () => toggleReadAloud(panel));
    }
    
    // Feature 13: Timer toggle
    const btnToggleTimer = panel.querySelector('#btnToggleTimer');
    if (btnToggleTimer) {
      btnToggleTimer.addEventListener('click', () => toggleTimer(instance));
    }
    
    // Initialize timer if previously enabled
    initTimer(instance);
    
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
    } else {
      // Fallback for unrecognized day types
      dayContent.innerHTML = `
        <div style="text-align: center; padding: 40px 24px;">
          <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
          <h3 style="margin: 0 0 8px 0;">${escapeHtml(dayData.label || 'Day ' + dayData.day_number)}</h3>
          <p style="opacity: 0.7; margin: 0;">This day's content could not be loaded. Your teacher may need to re-issue this assignment.</p>
        </div>
      `;
    }
  }
  
  /**
   * Render questions day
   */
  function renderQuestionsDay(container, dayData, instance) {
    const questions = dayData.questions || [];
    const isReadOnly = assignmentViewerState.isReadOnly;
    const isGraded = assignmentViewerState.isGraded;
    const isRetryMode = assignmentViewerState.isRetryMode;
    const retryLockedIds = assignmentViewerState.retryLockedQuestionIds || new Set();
    const scoringResults = assignmentViewerState.scoringResults || [];
    const submissionAnswers = assignmentViewerState.submissionAnswers || [];
    
    const questionsHtml = questions.map((q) => {
      const questionId = `${dayData.day_number}_${q.number}`;
      const choices = q.choices || [];
      const savedAnswer = assignmentViewerState.answers.get(questionId);
      const isLocked = isRetryMode && retryLockedIds.has(questionId);

      // Look up per-item submission data for graded mode (correct/incorrect highlighting + teacher note)
      const subAnswer = submissionAnswers.find(a => a.item_ref === questionId) || null;
      const correctAnswer = subAnswer ? subAnswer.correct_answer : null;
      const studentAnswerFromSub = subAnswer && subAnswer.raw_answer ? (subAnswer.raw_answer.value || null) : null;
      
      const choicesHtml = choices.map(choice => {
        const isChecked = savedAnswer === choice.letter ? 'checked' : '';
        const disabledAttr = (isReadOnly || isLocked) ? 'disabled' : '';
        let choiceClass = '';
        if (isGraded && subAnswer && correctAnswer != null) {
          // Always highlight the correct answer in green; highlight the student's wrong choice in red
          const choiceLetter = String(choice.letter).toUpperCase();
          const isCorrectAnswer = choiceLetter === String(correctAnswer).toUpperCase();
          const isStudentChoice = studentAnswerFromSub != null && choiceLetter === String(studentAnswerFromSub).toUpperCase();
          if (isCorrectAnswer) {
            choiceClass = 'correct';
          } else if (isStudentChoice && !subAnswer.is_correct) {
            choiceClass = 'incorrect';
          }
        } else {
          // In retry mode, mark the selected choice of a locked question with the locked-correct style
          const isSelectedLockedChoice = isLocked && savedAnswer === choice.letter;
          choiceClass = isSelectedLockedChoice ? 'locked-correct' : (isLocked ? 'locked-disabled' : '');
        }
        return `
          <div class="st-choice ${choiceClass}" data-question-id="${questionId}" data-letter="${choice.letter}">
            <input type="radio" name="q_${questionId}" id="q_${questionId}_${choice.letter}" value="${choice.letter}" ${isChecked} ${disabledAttr}>
            <label class="st-choice-label" for="q_${questionId}_${choice.letter}">
              <strong>${choice.letter})</strong> ${escapeHtml(choice.text)}
              <button class="st-tts-btn" data-text="${escapeHtml(choice.text)}" title="Read this answer aloud" aria-label="Read answer ${choice.letter} aloud">🔊</button>
            </label>
          </div>
        `;
      }).join('');

      // Fill-in-blank: questions with no predefined choices render a textarea.
      // When in read-only mode and scoring results are available, show ✓/✗ feedback.
      // scoringResults covers freshly-submitted sessions; subAnswer covers pre-graded assignments.
      let answerInputHtml;
      if (choices.length === 0) {
        const scoringResult = scoringResults.find(r => r.item_ref === questionId);
        const isCorrectFib = scoringResult != null ? scoringResult.is_correct : (subAnswer != null ? subAnswer.is_correct : null);
        const feedbackHtml = (isReadOnly || isLocked) && isCorrectFib !== null
          ? `<div class="st-fib-feedback ${isCorrectFib ? 'st-fib-correct' : 'st-fib-incorrect'}">${isCorrectFib ? '✓ Correct' : '✗ Incorrect'}</div>`
          : '';
        answerInputHtml = `<textarea class="st-text-answer" data-question-id="${questionId}" rows="2" placeholder="Type your answer here..." aria-label="Answer for question ${q.number}"${(isReadOnly || isLocked) ? ' disabled' : ''}>${escapeHtml(savedAnswer || '')}</textarea>${feedbackHtml}`;
      } else {
        answerInputHtml = `<div class="st-choices">${choicesHtml}</div>`;
      }

      const retryLockedBadge = isLocked ? `<div class="st-retry-correct-badge">✓ Correct</div>` : '';

      // Per-item earned score (shown in graded mode for constructed-response items)
      const earnedPointsHtml = (isGraded && subAnswer && subAnswer.earned_points != null)
        ? `<div class="st-item-score">🎯 Score: ${escapeHtml(String(subAnswer.earned_points))}/${escapeHtml(String(q.points || 5))} pts</div>`
        : '';

      // Per-item teacher note (shown in graded mode when teacher has provided feedback)
      const teacherNoteHtml = (isGraded && subAnswer && subAnswer.teacher_note)
        ? `<div class="st-teacher-note">📝 <strong>Teacher note:</strong> ${escapeHtml(subAnswer.teacher_note)}</div>`
        : '';

      // AI rationale (shown in graded mode when AI-assisted grading was used)
      const aiRationaleHtml = (isGraded && subAnswer && subAnswer.rationale)
        ? `<div class="st-ai-rationale">🤖 <strong>AI feedback:</strong> ${escapeHtml(subAnswer.rationale)}</div>`
        : '';
      
      const hintHtml = q.hint ? `
        <div class="st-hint-section">
          <button class="st-hint-btn" data-hint-id="hint_${questionId}">💡 Show Hint</button>
          <div class="st-hint-content" id="hint_${questionId}">
            ${escapeHtml(q.hint)}
            <button class="st-tts-btn" data-text="${escapeAttr(q.hint)}" title="Read this hint aloud" aria-label="Read hint aloud">🔊</button>
          </div>
        </div>
      ` : '';
      
      return `
        <div class="st-question-container${isLocked ? ' retry-locked' : ''}">
          <div class="st-question-number">Question ${q.number}${retryLockedBadge}</div>
          <div class="st-question-text">
            ${escapeHtml(q.text)}
            <button class="st-tts-btn" data-text="${escapeHtml(q.text)}" title="Read this question aloud" aria-label="Read question ${q.number} aloud">🔊</button>
          </div>
          ${answerInputHtml}
          ${earnedPointsHtml}
          ${teacherNoteHtml}
          ${aiRationaleHtml}
          ${hintHtml}
        </div>
      `;
    }).join('');
    
    const readOnlyBanner = isReadOnly ? `
      <div class="st-submitted-banner">
        ${isGraded ? '✓ Graded — Teacher has reviewed your submission' : '✓ Submitted — Waiting for teacher review'}
      </div>
    ` : '';

    // Overall teacher feedback banner (shown below the graded banner when feedback was provided)
    const feedbackBannerHtml = (isGraded && assignmentViewerState.submissionFeedback)
      ? `<div class="st-overall-feedback">
          <div class="st-overall-feedback-label">💬 Teacher Feedback</div>
          <div class="st-overall-feedback-text">${escapeHtml(assignmentViewerState.submissionFeedback)}</div>
        </div>`
      : '';

    const retryBanner = isRetryMode ? `
      <div class="st-retry-banner">
        🔄 Retry Mode — Correct answers are locked. Only your incorrect answers can be changed.
      </div>
    ` : '';

    // Feature 3: Progress tracker in viewer
    const totalQuestions = getTotalQuestionCount(instance);
    const answeredCount = getAnsweredCount(instance.id);
    const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    const progressHtml = totalQuestions > 0 && !isReadOnly ? `
      <div class="st-viewer-progress" id="viewerProgress">
        <div class="st-viewer-progress-text">Progress: ${answeredCount} of ${totalQuestions} questions answered</div>
        <div class="st-viewer-progress-bar">
          <div class="fill" style="width: ${progressPercent}%"></div>
        </div>
      </div>
    ` : '';

    // Feature 11: Vocabulary section
    const vocabHtml = renderVocabularySection(dayData);
    
    const assignment = instance.assignment || {};
    const meta = assignment.meta || {};
    const days = meta.days || [];
    const isLastDay = assignmentViewerState.currentDay === days.length - 1;

    const submitQuestionsHtml = (!isReadOnly && isLastDay) ? `
      <button class="st-submit-btn" id="submitQuestionsBtn">${isRetryMode ? 'Re-submit Answers' : 'Submit Assignment'}</button>
    ` : '';

    const bottomDayTabsHtml = (!isLastDay && days.length > 1) ? `
      <div class="st-day-tabs st-day-tabs-bottom" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--rc-glass-border, rgba(255,255,255,0.1));">
        ${days.map((day, idx) => {
          const active = idx === assignmentViewerState.currentDay ? 'active' : '';
          return `<button class="st-day-tab bottom-day-tab ${active}" data-day-index="${idx}">Day ${day.day_number}</button>`;
        }).join('')}
      </div>
    ` : '';

    container.innerHTML = `
      <h3 style="margin-top: 0; margin-bottom: 20px; font-size: 18px;">
        ${escapeHtml(dayData.label)}
      </h3>
      ${readOnlyBanner}
      ${feedbackBannerHtml}
      ${retryBanner}
      ${progressHtml}
      ${vocabHtml}
      ${questionsHtml}
      ${submitQuestionsHtml}
      ${bottomDayTabsHtml}
    `;

    // Inject book deep-link buttons into hint content areas
    container.querySelectorAll('.st-hint-content').forEach(function (hintEl) {
      injectBookDeepLinks(hintEl);
    });
    
    // Attach choice handlers (only if not read-only and question is not retry-locked)
    if (!isReadOnly) {
      container.querySelectorAll('.st-choice').forEach(choiceEl => {
        const input = choiceEl.querySelector('input[type="radio"]');
        // Skip locked choices in retry mode
        if (choiceEl.classList.contains('locked-correct') || choiceEl.classList.contains('locked-disabled')) {
          return;
        }
        
        choiceEl.addEventListener('click', function(e) {
          // Handle all clicks uniformly — don't bail out for INPUT clicks
          // The label's for= attribute causes synthetic clicks that need handling too
          
          const questionId = this.getAttribute('data-question-id');
          const letter = this.getAttribute('data-letter');
          const choicesContainer = this.closest('.st-choices');
          
          // Mark the selected answer
          input.checked = true;
          
          // Remove previous selection styling and retry-mode incorrect highlight
          choicesContainer.querySelectorAll('.st-choice').forEach(c => {
            c.classList.remove('selected', 'incorrect');
          });
          
          // Mark this choice as selected (neutral styling)
          this.classList.add('selected');
          
          // Save answer
          assignmentViewerState.answers.set(questionId, letter);
          
          // Feature 1: Auto-save to localStorage (if not read-only)
          if (!assignmentViewerState.isReadOnly) {
            saveAnswer(instance.id, questionId, letter);
          }
          
          // Feature 3: Update progress display in real-time
          updateViewerProgress(instance);
          
          // Save to server
          saveAnswersToServer(instance);
        });
      });
    }
    
    // Attach fill-in-blank text answer handlers
    const fillInSaveTimeouts = new Map();
    container.querySelectorAll('.st-text-answer').forEach(textarea => {
      if (textarea.disabled) return;
      textarea.addEventListener('input', function() {
        const qId = this.getAttribute('data-question-id');
        const value = this.value;
        assignmentViewerState.answers.set(qId, value);
        clearTimeout(fillInSaveTimeouts.get(qId));
        fillInSaveTimeouts.set(qId, setTimeout(() => {
          saveAnswer(instance.id, qId, value);
          updateViewerProgress(instance);
          saveAnswersToServer(instance);
        }, AUTO_SAVE_DEBOUNCE_MS));
      });
    });

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
    
    // Attach submit handler for MCQ questions day
    const submitQuestionsBtn = container.querySelector('#submitQuestionsBtn');
    if (submitQuestionsBtn) {
      submitQuestionsBtn.addEventListener('click', async function() {
        const currentlyRetrying = assignmentViewerState.isRetryMode;
        const confirmMsg = currentlyRetrying
          ? "Re-submit your updated answers?"
          : "Are you sure? You won't be able to change your answers.";
        if (!await rcConfirm('Submit Assignment', confirmMsg, 'Submit', { danger: true })) {
          return;
        }
        
        this.disabled = true;
        this.textContent = 'Submitting...';
        
        const submitResult = await saveAnswersToServer(instance, true);

        if (submitResult === null) {
          // Server error — restore button so student can retry
          let errorMsg = container.querySelector('.st-submit-error');
          if (!errorMsg) {
            errorMsg = document.createElement('div');
            errorMsg.className = 'st-submit-error';
            errorMsg.style.cssText = 'color: #fca5a5; margin-top: 8px; font-size: 14px;';
            this.parentElement.insertBefore(errorMsg, this.nextSibling);
          }
          errorMsg.textContent = 'Failed to submit — please check your connection and try again. If this keeps happening, tell your teacher.';
          this.textContent = currentlyRetrying ? 'Re-submit Answers' : 'Submit Assignment';
          this.disabled = false;
          return;
        }

        // Check retry eligibility: score ≤ 60% on a fully-scored submission
        const scoreTotal = submitResult.score_total;
        const hasAutoScore = scoreTotal !== null && scoreTotal !== undefined;
        if (hasAutoScore && scoreTotal <= 60 && isRetryFeatureEnabled()) {
          const wantRetry = await rcConfirm(
            'Try Again?',
            `You scored ${Math.round(scoreTotal)}%. Would you like to retry the questions you got wrong? Your correct answers will be locked.`,
            'Retry Incorrect Answers',
            { cancelLabel: 'Submit Anyway' }
          );
          if (wantRetry) {
            // Enter (or update) retry mode
            const results = submitResult.results || [];
            assignmentViewerState.isRetryMode = true;
            assignmentViewerState.retryLockedQuestionIds = new Set(
              results.filter(r => r.is_correct === true).map(r => r.item_ref)
            );
            renderQuestionsDay(container, dayData, instance);
            // Highlight incorrect choices in retry mode so students can see what to fix
            results.forEach(r => {
              if (r.is_correct === false && r.item_ref) {
                const savedAnswer = assignmentViewerState.answers.get(r.item_ref);
                if (savedAnswer) {
                  const choiceEl = container.querySelector(
                    `.st-choice[data-question-id="${r.item_ref}"][data-letter="${savedAnswer}"]`
                  );
                  if (choiceEl) {
                    choiceEl.classList.add('incorrect');
                  }
                }
              }
            });
            showToast('Retry mode active — only your incorrect answers are editable.', 'info');
            return;
          }
        }

        await rcAlert('Assignment Submitted', hasAutoScore
          ? `You scored ${Math.round(scoreTotal)}%! Your answers have been saved and your teacher will review them soon.`
          : 'Your answers have been saved! Your teacher will review them soon.');

        // No retry — lock the existing DOM in place without re-rendering to
        // avoid a flash of blank content while the view rebuilds.
        assignmentViewerState.isRetryMode = false;
        assignmentViewerState.retryLockedQuestionIds = new Set();
        // Store scoring results for later reference when the viewer is re-opened
        assignmentViewerState.scoringResults = submitResult.results || [];
        assignmentViewerState.isReadOnly = true;

        // Disable all interactive inputs so answers remain visible exactly as entered
        container.querySelectorAll('input, textarea, select, button').forEach(el => {
          el.disabled = true;
        });

        // Replace the submit button with a submitted banner (no DOM flash)
        const submittedBanner = document.createElement('div');
        submittedBanner.className = 'st-submitted-banner';
        submittedBanner.textContent = '✓ Submitted!';
        this.replaceWith(submittedBanner);
        // clearSavedAnswers is deferred to closeAssignmentViewer so answers stay
        // visible until the student closes the panel.
      });
    }

    // Attach bottom day tab handlers
    container.querySelectorAll('.bottom-day-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const idx = parseInt(tab.getAttribute('data-day-index'), 10);
        assignmentViewerState.currentDay = idx;
        // Update top tabs too
        const panel = container.closest('.st-assignment-panel');
        if (panel) {
          panel.querySelectorAll('.st-day-tab:not(.bottom-day-tab)').forEach(t => t.classList.remove('active'));
          const topTab = panel.querySelector(`.st-day-tab[data-day-index="${idx}"]:not(.bottom-day-tab)`);
          if (topTab) topTab.classList.add('active');
          renderCurrentDay(panel, instance);
        }
      });
    });
  }
  /**
   * Determine the number of paragraphs for a writing prompt day.
   * Priority: instance override > day-level config > default (1)
   */
  function getWritingParagraphCount(dayData, instance) {
    const writingConfig = instance.settings?.writing_config;
    let count = 1;
    if (writingConfig?.paragraph_count != null) {
      count = parseInt(writingConfig.paragraph_count, 10);
    } else if (dayData.paragraph_count != null) {
      count = parseInt(dayData.paragraph_count, 10);
    }
    if (isNaN(count) || count < 1) count = 1;
    if (count > 5) count = 5;
    return count;
  }

  function renderWritingPromptDay(container, dayData, instance) {
    // Graceful fallback if writing prompt data is missing or empty
    if (!dayData.prompt && (!dayData.structure || dayData.structure.length === 0)) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 24px;">
          <div style="font-size: 48px; margin-bottom: 16px;">✍️</div>
          <h3 style="margin: 0 0 8px 0;">${escapeHtml(dayData.label || 'Writing Day')}</h3>
          <p style="opacity: 0.7; margin: 0;">The writing prompt for this day hasn't been loaded yet. Your teacher may need to re-issue this assignment to include the prompt content.</p>
        </div>
      `;
      return;
    }

    const isReadOnly = assignmentViewerState.isReadOnly;
    const isGraded = assignmentViewerState.isGraded;
    const paragraphCount = getWritingParagraphCount(dayData, instance);

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
                <button class="st-tts-btn" data-text="${escapeAttr(hint)}" title="Read this hint aloud" aria-label="Read hint aloud">🔊</button>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    ` : '';
    
    // Get saved writing response from instance settings or localStorage
    let savedResponse = (instance.settings && instance.settings.writing_response) || '';
    
    // Feature 1: If not read-only and no saved response from server, check localStorage
    if (!isReadOnly && !savedResponse) {
      const questionId = `writing_${dayData.day_number}`;
      const savedAnswers = getSavedAnswers(instance.id);
      if (savedAnswers && savedAnswers[questionId]) {
        savedResponse = savedAnswers[questionId];
      }
    }
    
    const readOnlyBanner = isReadOnly ? `
      <div class="st-submitted-banner">
        ${isGraded ? '✓ Graded — Teacher has reviewed your submission' : '✓ Submitted — Waiting for teacher review'}
      </div>
    ` : '';
    
    // Feature 3: Progress tracker in viewer
    const totalQuestions = getTotalQuestionCount(instance);
    const answeredCount = getAnsweredCount(instance.id);
    const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    const progressHtml = totalQuestions > 0 && !isReadOnly ? `
      <div class="st-viewer-progress" id="viewerProgress">
        <div class="st-viewer-progress-text">Progress: ${answeredCount} of ${totalQuestions} questions answered</div>
        <div class="st-viewer-progress-bar">
          <div class="fill" style="width: ${progressPercent}%"></div>
        </div>
      </div>
    ` : '';


    // Feature 11: Vocabulary section
    const vocabHtml = renderVocabularySection(dayData);

    const assignment = instance.assignment || {};
    const meta = assignment.meta || {};
    const days = meta.days || [];
    const isLastDay = assignmentViewerState.currentDay === days.length - 1;

    const submitButtonHtml = isReadOnly ? `
      <div class="st-submitted-message">${isGraded ? '✓ Graded — Teacher has reviewed your submission' : '✓ Submitted — Waiting for teacher review'}</div>
    ` : (isLastDay ? `
      <button class="st-submit-btn" id="submitWritingBtn">Submit Assignment</button>
    ` : '');

    const bottomDayTabsHtml = (!isLastDay && days.length > 1) ? `
      <div class="st-day-tabs st-day-tabs-bottom" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--rc-glass-border, rgba(255,255,255,0.1));">
        ${days.map((day, idx) => {
          const active = idx === assignmentViewerState.currentDay ? 'active' : '';
          return `<button class="st-day-tab bottom-day-tab ${active}" data-day-index="${idx}">Day ${day.day_number}</button>`;
        }).join('')}
      </div>
    ` : '';
    
    // Builder toggle button (only show if not read-only)
    const builderToggleHtml = !isReadOnly ? `
      <button class="st-builder-toggle-btn" id="builderToggleBtn">📝 Use Writing Builder</button>
    ` : '';
    
    // Builder tips from structure
    const builderTipsHtml = dayData.structure && dayData.structure.length > 0 ? 
      dayData.structure.map(item => `<div class="st-builder-tip">${escapeHtml(item)}</div>`).join('') : '';
    
    // Builder UI — dynamically generate sections based on paragraphCount
    let builderParagraphSectionsHtml = '';
    if (paragraphCount <= 1) {
      builderParagraphSectionsHtml = `
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
      `;
    } else {
      for (let p = 1; p <= paragraphCount; p++) {
        builderParagraphSectionsHtml += `
          <div class="st-builder-paragraph-section">
            <div class="st-builder-paragraph-header">Paragraph ${p}</div>

            <!-- Topic Sentence -->
            <div class="st-builder-section" data-section="topic">
              <div class="st-builder-section-header">
                <span>Topic Sentence</span>
                <span class="st-builder-word-count" id="builderTopicCount_p${p}">0 words</span>
              </div>
              <textarea
                class="st-builder-textarea"
                id="builderTopicSentence_p${p}"
                placeholder="Write your main claim or thesis statement here..."></textarea>
              <div class="st-builder-feedback" id="builderTopicFeedback_p${p}"></div>
            </div>

            <!-- Supporting Detail 1 -->
            <div class="st-builder-section" data-section="detail">
              <div class="st-builder-section-header">
                <span>Supporting Detail 1</span>
                <span class="st-builder-word-count" id="builderDetail1Count_p${p}">0 words</span>
              </div>
              <select class="st-builder-select" id="builderTransition1_p${p}">
                <option value="">Choose a transition...</option>
                <option value="First,">First,</option>
                <option value="To begin with,">To begin with,</option>
                <option value="For instance,">For instance,</option>
                <option value="For example,">For example,</option>
                <option value="One reason is that">One reason is that</option>
              </select>
              <textarea
                class="st-builder-textarea"
                id="builderDetail1_p${p}"
                placeholder="Provide evidence or an example that supports your topic sentence..."></textarea>
              <div class="st-builder-feedback" id="builderDetail1Feedback_p${p}"></div>
            </div>

            <!-- Supporting Detail 2 -->
            <div class="st-builder-section" data-section="detail">
              <div class="st-builder-section-header">
                <span>Supporting Detail 2</span>
                <span class="st-builder-word-count" id="builderDetail2Count_p${p}">0 words</span>
              </div>
              <select class="st-builder-select" id="builderTransition2_p${p}">
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
                id="builderDetail2_p${p}"
                placeholder="Provide a second piece of evidence or example..."></textarea>
              <div class="st-builder-feedback" id="builderDetail2Feedback_p${p}"></div>
            </div>

            <!-- Add Detail 3 Button -->
            <button class="st-builder-add-detail-btn" id="builderAddDetail3Btn_p${p}">+ Add Third Detail (Optional)</button>

            <!-- Supporting Detail 3 (Hidden by default) -->
            <div class="st-builder-section" data-section="detail" id="builderDetail3Section_p${p}" style="display: none;">
              <div class="st-builder-section-header">
                <span>Supporting Detail 3 (Optional)</span>
                <span class="st-builder-word-count" id="builderDetail3Count_p${p}">0 words</span>
              </div>
              <select class="st-builder-select" id="builderTransition3_p${p}">
                <option value="">Choose a transition...</option>
                <option value="Finally,">Finally,</option>
                <option value="Lastly,">Lastly,</option>
                <option value="Most importantly,">Most importantly,</option>
                <option value="The most significant">The most significant</option>
              </select>
              <textarea
                class="st-builder-textarea"
                id="builderDetail3_p${p}"
                placeholder="Provide a third piece of evidence or example (optional)..."></textarea>
              <div class="st-builder-feedback" id="builderDetail3Feedback_p${p}"></div>
            </div>

            <!-- Conclusion -->
            <div class="st-builder-section" data-section="conclusion">
              <div class="st-builder-section-header">
                <span>Conclusion</span>
                <span class="st-builder-word-count" id="builderConclusionCount_p${p}">0 words</span>
              </div>
              <select class="st-builder-select" id="builderTransitionConc_p${p}">
                <option value="">Choose a transition...</option>
                <option value="In conclusion,">In conclusion,</option>
                <option value="To summarize,">To summarize,</option>
                <option value="Overall,">Overall,</option>
                <option value="Therefore,">Therefore,</option>
                <option value="Ultimately,">Ultimately,</option>
              </select>
              <textarea
                class="st-builder-textarea"
                id="builderConclusion_p${p}"
                placeholder="Restate your main point and summarize why it matters..."></textarea>
              <div class="st-builder-feedback" id="builderConclusionFeedback_p${p}"></div>
            </div>
          </div>
        `;
      }
    }

    const builderHtml = !isReadOnly ? `
      <div class="st-writing-builder" id="writingBuilder" data-paragraph-count="${paragraphCount}">
        ${builderTipsHtml}
        ${builderParagraphSectionsHtml}
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
      ${progressHtml}
      ${vocabHtml}
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
      ${bottomDayTabsHtml}
    `;

    // Inject book deep-link buttons into writing hint content areas
    container.querySelectorAll('.st-hint-content').forEach(function (hintEl) {
      injectBookDeepLinks(hintEl);
    });
    
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
      if (paragraphCount <= 1) {
        // Single-paragraph event handlers (original behavior)
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
          addDetail3Btn.addEventListener('click', () => toggleDetail3());
        }
      } else {
        // Multi-paragraph event handlers — iterate over all paragraph sections
        for (let p = 1; p <= paragraphCount; p++) {
          const pSuffix = `_p${p}`;

          const topicInput = container.querySelector(`#builderTopicSentence${pSuffix}`);
          if (topicInput) {
            topicInput.addEventListener('input', () => {
              updateBuilderWordCount(`builderTopicSentence_p${p}`, `builderTopicCount_p${p}`);
              validateTopicSentence(`builderTopicSentence_p${p}`, `builderTopicFeedback_p${p}`);
            });
          }

          const detail1Input = container.querySelector(`#builderDetail1${pSuffix}`);
          if (detail1Input) {
            detail1Input.addEventListener('input', () => {
              updateBuilderWordCount(`builderDetail1_p${p}`, `builderDetail1Count_p${p}`);
              validateSupportingDetail(`builderDetail1_p${p}`, `builderDetail1Feedback_p${p}`, `builderTopicSentence_p${p}`);
            });
          }

          const detail2Input = container.querySelector(`#builderDetail2${pSuffix}`);
          if (detail2Input) {
            detail2Input.addEventListener('input', () => {
              updateBuilderWordCount(`builderDetail2_p${p}`, `builderDetail2Count_p${p}`);
              validateSupportingDetail(`builderDetail2_p${p}`, `builderDetail2Feedback_p${p}`, `builderTopicSentence_p${p}`);
            });
          }

          const detail3Input = container.querySelector(`#builderDetail3${pSuffix}`);
          if (detail3Input) {
            detail3Input.addEventListener('input', () => {
              updateBuilderWordCount(`builderDetail3_p${p}`, `builderDetail3Count_p${p}`);
              validateSupportingDetail(`builderDetail3_p${p}`, `builderDetail3Feedback_p${p}`, `builderTopicSentence_p${p}`);
            });
          }

          const conclusionInput = container.querySelector(`#builderConclusion${pSuffix}`);
          if (conclusionInput) {
            conclusionInput.addEventListener('input', () => {
              updateBuilderWordCount(`builderConclusion_p${p}`, `builderConclusionCount_p${p}`);
              validateConclusion(`builderConclusion_p${p}`, `builderConclusionFeedback_p${p}`, `builderTopicSentence_p${p}`);
            });
          }

          const addDetail3Btn = container.querySelector(`#builderAddDetail3Btn${pSuffix}`);
          if (addDetail3Btn) {
            addDetail3Btn.addEventListener('click', () => toggleDetail3(`_p${p}`));
          }
        }
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

        if (!await rcConfirm('Submit Assignment', "Are you sure? You won't be able to change your response.", 'Submit', { danger: true })) {
          return;
        }

        this.disabled = true;
        this.textContent = 'Submitting...';
        
        try {
          const submitResult = await saveWritingResponseToServer(instance, response);

          // Future-proof: check retry eligibility (mirrors MCQ flow)
          // Writing prompts are typically teacher-scored, so score_total
          // will usually be null here, but this handles the case where
          // auto-scoring metadata is returned.
          const scoreTotal = submitResult?.score_total;
          const hasAutoScore = scoreTotal !== null && scoreTotal !== undefined;
          if (hasAutoScore && scoreTotal <= 60 && isRetryFeatureEnabled()) {
            const wantRetry = await rcConfirm(
              'Try Again?',
              `You scored ${Math.round(scoreTotal)}%. Would you like to retry?`,
              'Retry',
              { cancelLabel: 'Submit Anyway' }
            );
            if (wantRetry) {
              assignmentViewerState.isRetryMode = true;
              renderWritingPromptDay(container, dayData, instance);
              showToast('Retry mode active — you can edit your response.', 'info');
              return;
            }
          }

          await rcAlert('Assignment Submitted', hasAutoScore
            ? `You scored ${Math.round(scoreTotal)}%! Your response has been saved and your teacher will review it soon.`
            : 'Your response has been saved! Your teacher will review it soon.');

          // Lock the existing DOM in place without re-rendering to avoid a
          // flash of blank content while the view rebuilds.
          assignmentViewerState.isReadOnly = true;

          // Disable all interactive inputs so the response stays visible
          container.querySelectorAll('input, textarea, select, button').forEach(el => {
            el.disabled = true;
          });

          // Replace the submit button with a submitted banner (no DOM flash)
          const submittedBanner = document.createElement('div');
          submittedBanner.className = 'st-submitted-banner';
          submittedBanner.textContent = '✓ Submitted — Waiting for teacher review';
          this.replaceWith(submittedBanner);
          // clearSavedAnswers is deferred to closeAssignmentViewer so the
          // response stays visible until the student closes the panel.
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
          errorMsg.textContent = 'Failed to submit — please check your connection and try again. If this keeps happening, tell your teacher.';
          this.textContent = 'Submit Assignment';
          this.disabled = false;
        }
      });
    }
    
    // Feature 1: Auto-save writing textarea with debounce
    const writingTextarea = container.querySelector('#writingResponse');
    if (writingTextarea && !isReadOnly) {
      let saveTimeout;
      writingTextarea.addEventListener('input', function() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          const questionId = `writing_${dayData.day_number}`;
          saveAnswer(instance.id, questionId, this.value);
          updateViewerProgress(instance);
        }, AUTO_SAVE_DEBOUNCE_MS);
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
    // Attach bottom day tab handlers
    container.querySelectorAll('.bottom-day-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const idx = parseInt(tab.getAttribute('data-day-index'), 10);
        assignmentViewerState.currentDay = idx;
        // Update top tabs too
        const panel = container.closest('.st-assignment-panel');
        if (panel) {
          panel.querySelectorAll('.st-day-tab:not(.bottom-day-tab)').forEach(t => t.classList.remove('active'));
          const topTab = panel.querySelector(`.st-day-tab[data-day-index="${idx}"]:not(.bottom-day-tab)`);
          if (topTab) topTab.classList.add('active');
          renderCurrentDay(panel, instance);
        }
      });
    });
  }
  
  /**
   * Save answers to server
   */
  async function saveAnswersToServer(instance, submit = false) {
    const studentCode = sessionStorage.getItem('rc_user_code');
    if (!studentCode) {
      console.warn(LOG_PREFIX, 'No student code in session, cannot save answers');
      return null;
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
          answers: answersObj,
          submit: submit
        })
      });
      
      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(LOG_PREFIX, 'Answers saved successfully');
      return data;
    } catch (err) {
      console.error(LOG_PREFIX, 'Failed to save answers:', err);
      if (!submit) {
        const now = Date.now();
        if (now - lastAutoSaveErrorToastAt > AUTO_SAVE_ERROR_TOAST_COOLDOWN_MS) {
          lastAutoSaveErrorToastAt = now;
          showToast('⚠️ Could not save — check your connection', 'error');
        }
      }
      // Don't alert - let the student continue working
      return null;
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
    
    const answersObj = {};
    assignmentViewerState.answers.forEach((value, key) => {
      answersObj[key] = value;
    });

    const response = await fetch('/.netlify/functions/student-submit-answer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instance_id: instance.id,
        student_code: studentCode,
        writing_response: writingResponse,
        answers: answersObj,
        submit: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`Submit failed: ${response.status}`);
    }
    const data = await response.json();
    console.log(LOG_PREFIX, 'Writing response submitted successfully');
    return data;
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
  
  function validateTopicSentence(topicId = 'builderTopicSentence', feedbackId = 'builderTopicFeedback') {
    const input = document.getElementById(topicId);
    const feedback = document.getElementById(feedbackId);
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
  
  function validateSupportingDetail(detailId, feedbackId, topicId = 'builderTopicSentence') {
    const detail = document.getElementById(detailId);
    const feedback = document.getElementById(feedbackId);
    const topicSentence = document.getElementById(topicId);
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
  
  function validateConclusion(conclusionId = 'builderConclusion', feedbackId = 'builderConclusionFeedback', topicId = 'builderTopicSentence') {
    const conclusion = document.getElementById(conclusionId);
    const feedback = document.getElementById(feedbackId);
    const topicSentence = document.getElementById(topicId);
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
    const builder = document.getElementById('writingBuilder');
    const mainTextarea = document.getElementById('writingResponse');
    if (!mainTextarea) return;

    const paragraphCount = builder ? parseInt(builder.dataset.paragraphCount || '1', 10) : 1;
    let response = '';

    if (paragraphCount <= 1) {
      // Single-paragraph (original behavior)
      const topic = document.getElementById('builderTopicSentence');
      const detail1 = document.getElementById('builderDetail1');
      const detail2 = document.getElementById('builderDetail2');
      const detail3 = document.getElementById('builderDetail3');
      const conclusion = document.getElementById('builderConclusion');

      const transition1 = document.getElementById('builderTransition1');
      const transition2 = document.getElementById('builderTransition2');
      const transition3 = document.getElementById('builderTransition3');
      const transitionConc = document.getElementById('builderTransitionConc');

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
      response = response.trim();
    } else {
      // Multi-paragraph: build each paragraph and join with double newline
      const paragraphs = [];
      for (let p = 1; p <= paragraphCount; p++) {
        let para = '';
        const topic = document.getElementById(`builderTopicSentence_p${p}`);
        const detail1 = document.getElementById(`builderDetail1_p${p}`);
        const detail2 = document.getElementById(`builderDetail2_p${p}`);
        const detail3 = document.getElementById(`builderDetail3_p${p}`);
        const conclusion = document.getElementById(`builderConclusion_p${p}`);

        const transition1 = document.getElementById(`builderTransition1_p${p}`);
        const transition2 = document.getElementById(`builderTransition2_p${p}`);
        const transition3 = document.getElementById(`builderTransition3_p${p}`);
        const transitionConc = document.getElementById(`builderTransitionConc_p${p}`);

        if (topic && topic.value.trim()) para += `${topic.value.trim()} `;
        if (detail1 && detail1.value.trim()) {
          const trans1 = transition1 ? transition1.value : '';
          para += `${trans1 ? trans1 + ' ' : ''}${detail1.value.trim()} `;
        }
        if (detail2 && detail2.value.trim()) {
          const trans2 = transition2 ? transition2.value : '';
          para += `${trans2 ? trans2 + ' ' : ''}${detail2.value.trim()} `;
        }
        if (detail3 && detail3.value.trim()) {
          const trans3 = transition3 ? transition3.value : '';
          para += `${trans3 ? trans3 + ' ' : ''}${detail3.value.trim()} `;
        }
        if (conclusion && conclusion.value.trim()) {
          const transC = transitionConc ? transitionConc.value : '';
          para += `${transC ? transC + ' ' : ''}${conclusion.value.trim()}`;
        }
        if (para.trim()) paragraphs.push(para.trim());
      }
      response = paragraphs.join('\n\n');
    }

    mainTextarea.value = response;
    
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
  
  async function clearBuilder() {
    if (!await rcConfirm('Clear Builder', 'Are you sure you want to clear all builder content?', 'Clear', { danger: true })) return;
    
    const builder = document.getElementById('writingBuilder');
    const paragraphCount = builder ? parseInt(builder.dataset.paragraphCount || '1', 10) : 1;

    if (paragraphCount <= 1) {
      // Single-paragraph (original behavior)
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

      // Reset optional detail 3 to hidden
      const detail3Section = document.getElementById('builderDetail3Section');
      if (detail3Section) detail3Section.style.display = 'none';
      const addDetail3Btn = document.getElementById('builderAddDetail3Btn');
      if (addDetail3Btn) addDetail3Btn.style.display = '';
    } else {
      // Multi-paragraph: iterate over all paragraph sections
      for (let p = 1; p <= paragraphCount; p++) {
        const fields = [`builderTopicSentence_p${p}`, `builderDetail1_p${p}`, `builderDetail2_p${p}`, `builderDetail3_p${p}`, `builderConclusion_p${p}`];
        fields.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });

        const selects = [`builderTransition1_p${p}`, `builderTransition2_p${p}`, `builderTransition3_p${p}`, `builderTransitionConc_p${p}`];
        selects.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });

        const feedbacks = [`builderTopicFeedback_p${p}`, `builderDetail1Feedback_p${p}`, `builderDetail2Feedback_p${p}`, `builderDetail3Feedback_p${p}`, `builderConclusionFeedback_p${p}`];
        feedbacks.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = '';
        });

        const counts = [`builderTopicCount_p${p}`, `builderDetail1Count_p${p}`, `builderDetail2Count_p${p}`, `builderDetail3Count_p${p}`, `builderConclusionCount_p${p}`];
        counts.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '0 words';
        });

        // Reset optional detail 3 to hidden
        const detail3Section = document.getElementById(`builderDetail3Section_p${p}`);
        if (detail3Section) detail3Section.style.display = 'none';
        const addDetail3Btn = document.getElementById(`builderAddDetail3Btn_p${p}`);
        if (addDetail3Btn) addDetail3Btn.style.display = '';
      }
    }
  }
  
  function toggleDetail3(suffix = '') {
    const detail3Section = document.getElementById(`builderDetail3Section${suffix}`);
    const addBtn = document.getElementById(`builderAddDetail3Btn${suffix}`);
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
    // Remove the HTML assignment postMessage bridge if one is active
    if (htmlBridgeCleanup) {
      htmlBridgeCleanup();
      htmlBridgeCleanup = null;
    }

    // Remove the Escape key listener added in openAssignmentViewer
    if (assignmentPanelEscapeHandler) {
      document.removeEventListener('keydown', assignmentPanelEscapeHandler);
      assignmentPanelEscapeHandler = null;
    }

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

    // Clear any locally-saved draft answers now that the viewer is closed.
    // If the assignment was submitted (isReadOnly=true), this deferred cleanup
    // ensures answers stayed visible on screen until the panel closed rather
    // than disappearing immediately after submit.
    if (assignmentViewerState.isReadOnly && assignmentViewerState.currentAssignment?.id) {
      clearSavedAnswers(assignmentViewerState.currentAssignment.id);
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
      
      // Set up dot-grid glass popup (singleton, document-level delegation)
      setupDotGridPopup();

      // Initialize quality-of-life features
      initThemeToggle();
      initFontSizeControls();
      
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
    
    document.documentElement.classList.remove('st-authenticated');
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
    
    document.documentElement.classList.add('st-authenticated');
    const studentCode = sessionStorage.getItem('rc_user_code');
    if (studentCodeDisplay && studentCode) {
      studentCodeDisplay.textContent = studentCode;
    }
    
    // Update profile card
    updateProfileCard(studentCode);
    
    // Setup event handlers only once to prevent duplicates
    if (!state.dashboardHandlersAttached) {
      if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
      }
      
      // Setup tab switching
      setupTabSwitching();

      // Setup student settings (change password)
      initStudentSettings();
      
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
    
    // Tab name to ID mapping
    const tabIdMap = {
      'dashboard': 'tabDashboard',
      'goals': 'tabGoals',
      'assignments': 'tabAssignments',
      'resources': 'tabResources',
      'grades': 'tabGrades',
      'settings': 'tabSettings'
    };
    
    const targetPanelId = tabIdMap[tabName];
    if (!targetPanelId) {
      console.warn(LOG_PREFIX, 'Invalid tab name:', tabName);
      return;
    }
    
    // Update tab state
    tabState.currentTab = tabName;
    
    // Hide all tab panels
    const allPanels = document.querySelectorAll('.st-tab-panel');
    allPanels.forEach(panel => panel.classList.remove('active'));
    
    // Show target panel
    const targetPanel = document.getElementById(targetPanelId);
    if (targetPanel) {
      targetPanel.classList.add('active');
    } else {
      console.error(LOG_PREFIX, 'Tab panel not found:', targetPanelId);
    }
    
    // Update active state on all matching [data-tab] elements (sidebar + tab nav)
    const allLinks = document.querySelectorAll('[data-tab]');
    allLinks.forEach(link => link.classList.remove('active'));
    
    document.querySelectorAll(`[data-tab="${tabName}"]`).forEach(link => link.classList.add('active'));
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

      // Load resources
      loadStudentResources().catch(err => {
        console.error(LOG_PREFIX, 'Failed to load student resources:', err);
      });
    } catch (err) {
      console.error(LOG_PREFIX, 'Error loading student data:', err);
    }
  }

  // ============================================================================
  // Book Reader Panel
  // ============================================================================

  /**
   * Returns the stored boolean for a Reading Helper feature toggle.
   * Keys are stored as 'rc_book_helper_<key>' in localStorage.
   */
  function getBookHelper(key) {
    try {
      return localStorage.getItem('rc_book_helper_' + key) === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * Saves a Reading Helper feature toggle state to localStorage.
   */
  function setBookHelper(key, value) {
    try {
      localStorage.setItem('rc_book_helper_' + key, value ? 'true' : 'false');
    } catch (e) { /* ignore */ }
  }

  /**
   * Speaks a word aloud using the browser's built-in SpeechSynthesis API.
   * Uses a slightly slower rate for struggling readers.
   */
  function speakWord(word) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(word);
    utter.rate = 0.85;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
  }

  /**
   * Tracks a heard word in localStorage for the Words Mastered feature (PR 6).
   * Caps the list at 500 words to avoid localStorage bloat.
   */
  function trackHeardWord(word) {
    try {
      const key = 'rc_book_helper_heard_words';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const lower = word.toLowerCase().replace(/[^a-z'-]/g, '');
      if (lower && !existing.includes(lower)) {
        existing.push(lower);
        if (existing.length > 500) existing.shift();
        localStorage.setItem(key, JSON.stringify(existing));
      }
      // Update badge counter on the My Words nav button if it exists
      const badge = document.getElementById('myWordsBadge');
      if (badge) {
        const count = existing.length;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Splits paragraph text into individual sentences for sentence-mode TTS.
   * Handles common abbreviations to avoid false splits.
   */
  function splitIntoSentences(text) {
    var abbrevs = /(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|dept|govt|inc|corp)\./g;
    var temp = text.replace(abbrevs, function (m) { return m.replace('.', '\u3008DOT\u3009'); });
    var parts = temp.split(/(?<=[.!?])\s+/);
    return parts.map(function (s) { return s.replace(/\u3008DOT\u3009/g, '.').trim(); }).filter(function (s) { return s.length > 0; });
  }

  const DEFAULT_TTS_RATE = 0.92;
  let bookReaderState = null;
  let bookPanelEscapeHandler = null;
  let bookTtsAudio = null;       // current Audio element for OpenAI TTS playback
  let bookTtsAudioUrl = null;    // object URL to revoke when done
  let bookTtsActive = false;
  let bookTtsPaused = false;
  let bookTtsTimeout = null;
  let bookTtsNextSentenceCallback = null; // set when waiting between sentences in sentence mode
  let _lastSpokenText = '';              // text of the last spoken paragraph or sentence
  let _lastSpokenType = 'paragraph';     // 'paragraph' or 'sentence'
  let _lastSpokenWordOffset = 0;         // word span offset for the last spoken chunk
  let _lastSpokenSpanCount = 0;          // word span count for the last spoken chunk
  // New feature state
  const _wordDefCache = new Map(); // session-level dictionary API cache
  let _bookLink = '';              // current book link (used for localStorage keys)
  let _bookGlossaryMap = null;     // Map<normalized_term, definition>
  let _knownBookResources = [];    // populated by loadStudentResources; each: { link, title, chapters, totalPages }
  let _bookSelectionChangeHandler = null; // stored so it can be removed on close
  let _bookReadingHelperOutsideClickHandler = null; // stored so it can be removed on close
  let _bookMyWordsOutsideClickHandler = null; // stored so it can be removed on close
  const _bookChunkCache = new Map(); // chunkId -> chunkData (pages array)
  const _vocabPreviewedChapters = new Set(); // chapter startPages previewed this session
  const _vocabImageCache = new Map();        // lowercase term -> base64 image data URL
  const _comprehensionCheckedChapters = new Set(); // chapter startPages checked this session

  // Reading Time Tracker state
  let _readingTimerInterval = null;
  let _readingTimerSeconds = 0;
  let _readingTimerLastFlush = 0;
  let _readingTimerVisibilityHandler = null;
  let _readingTimerPillUpdateInterval = null;

  // ============================================================================
  // Book Deep-link Helpers
  // ============================================================================

  const _NUMBER_WORDS = {
    one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
    eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,
    seventeen:17,eighteen:18,nineteen:19,twenty:20,'twenty-one':21,
    'twenty-two':22,'twenty-three':23,'twenty-four':24,'twenty-five':25,
    'twenty-six':26,'twenty-seven':27,'twenty-eight':28,'twenty-nine':29,
    thirty:30,'thirty-one':31,'thirty-two':32,'thirty-three':33,'thirty-four':34,
    'thirty-five':35,'thirty-six':36,'thirty-seven':37,'thirty-eight':38,
    'thirty-nine':39,forty:40,'forty-one':41,'forty-two':42,'forty-three':43,
    'forty-four':44,'forty-five':45,'forty-six':46,'forty-seven':47,
    'forty-eight':48,'forty-nine':49,fifty:50
  };

  // Pre-computed regex part for number words (longest-first to avoid partial matches)
  const _NUM_WORDS_RE_PART = Object.keys(_NUMBER_WORDS)
    .sort(function (a, b) { return b.length - a.length; }).join('|');

  const BOOK_EMOJI = '\uD83D\uDCDA';

  /**
   * Detect a book chapter or page reference in hint text.
   * Returns { type: 'chapter'|'page', value: number, label: string } or null.
   */
  function detectBookReference(text) {
    if (!text) return null;
    // Chapter N / Ch. N — numeric or written-out word
    const chapterRe = new RegExp('\\b(?:chapter|ch\\.?)\\s+(' + '\\d+|' + _NUM_WORDS_RE_PART + ')\\b', 'i');
    const chapterMatch = text.match(chapterRe);
    if (chapterMatch) {
      const raw = chapterMatch[1].toLowerCase();
      const num = parseInt(raw, 10) || _NUMBER_WORDS[raw] || null;
      if (num) return { type: 'chapter', value: num, label: chapterMatch[0] };
    }
    // Page N / pg. N / pg N / p. N
    const pageRe = /\b(?:page|pg\.?|p\.)\s*(\d+)\b/i;
    const pageMatch = text.match(pageRe);
    if (pageMatch) {
      const num = parseInt(pageMatch[1], 10);
      if (num > 0) return { type: 'page', value: num, label: pageMatch[0] };
    }
    return null;
  }

  /**
   * Find the best matching known book resource for a detected reference.
   * Returns { resource, targetPage } or null.
   * Uses the first known book resource; single-book-per-class is the common case.
   */
  function findBookForReference(ref) {
    if (!_knownBookResources.length) return null;
    const resource = _knownBookResources[0];
    if (ref.type === 'page') {
      const pg = Math.max(1, Math.min(ref.value, resource.totalPages || ref.value));
      return { resource, targetPage: pg };
    }
    if (ref.type === 'chapter') {
      const chapters = resource.chapters || [];
      // Match by 1-indexed position first
      if (chapters[ref.value - 1]) {
        return { resource, targetPage: chapters[ref.value - 1].startPage };
      }
      // Fuzzy match by name using the original label text (e.g. "chapter one" inside "Chapter One | Alex's Oath")
      const refLabel = ref.label.toLowerCase();
      for (var ci = 0; ci < chapters.length; ci++) {
        if ((chapters[ci].name || '').toLowerCase().includes(refLabel)) {
          return { resource, targetPage: chapters[ci].startPage };
        }
      }
    }
    return null;
  }

  /**
   * Scan a hint element for book chapter/page references and append a subtle
   * "📖 Go to …" button linking into the book reader.
   */
  function injectBookDeepLinks(element) {
    if (!element || !_knownBookResources.length) return;
    if (element.querySelector('.st-hint-book-link')) return; // already injected
    const ref = detectBookReference(element.textContent || '');
    if (!ref) return;
    const match = findBookForReference(ref);
    if (!match) return;
    const { resource, targetPage } = match;
    const label = ref.type === 'chapter'
      ? BOOK_EMOJI + ' Go to ' + ref.label
      : BOOK_EMOJI + ' Go to Page ' + ref.value;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'st-hint-book-link';
    btn.textContent = label;
    btn.setAttribute('data-book-link', resource.link);
    btn.setAttribute('data-book-title', resource.title);
    btn.setAttribute('data-target-page', String(targetPage));
    btn.title = 'Open "' + resource.title + '" in the book reader';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openBookReader(
        this.getAttribute('data-book-link'),
        this.getAttribute('data-book-title'),
        parseInt(this.getAttribute('data-target-page'), 10) || 1
      );
    });
    element.appendChild(btn);
  }

  /**
   * Open the inline book reader for a resource with book-pages.json
   */
  async function openBookReader(link, title, targetPage) {
    // Fetch book data — ensure link ends with /
    const base = link.endsWith('/') ? link : link + '/';

    // Show a temporary loading backdrop immediately for feedback on slow connections
    let loadBackdrop = document.getElementById('bookLoadBackdrop');
    if (!loadBackdrop) {
      loadBackdrop = document.createElement('div');
      loadBackdrop.id = 'bookLoadBackdrop';
      loadBackdrop.className = 'st-panel-backdrop';
      loadBackdrop.innerHTML = '<div style="color:#e8edf5;font-size:16px;text-align:center;padding:40px;"><div style="font-size:32px;margin-bottom:12px;">📖</div><div>Loading book…</div></div>';
      document.body.appendChild(loadBackdrop);
      requestAnimationFrame(() => loadBackdrop.classList.add('open'));
    }

    let bookData;
    try {
      // Try chunked index first; fall back to legacy book-pages.json
      let r = await fetch(base + 'book-index.json');
      if (r.ok) {
        bookData = await r.json();
      } else {
        r = await fetch(base + 'book-pages.json');
        if (!r.ok) throw new Error('No book data found');
        bookData = await r.json();
      }
    } catch (err) {
      console.error(LOG_PREFIX, 'Could not load book data:', err);
      if (loadBackdrop) { loadBackdrop.classList.remove('open'); setTimeout(() => loadBackdrop.remove(), 300); }
      window.open(link, '_blank', 'noopener');
      return;
    }

    // Remove loading backdrop
    if (loadBackdrop) { loadBackdrop.classList.remove('open'); setTimeout(() => loadBackdrop.remove(), 300); }

    // Stop any existing TTS
    stopBookTts();

    // Clear chunk cache on new book open
    _bookChunkCache.clear();

    // For chunked books, pre-populate a sparse pages array (filled as chunks load)
    if (bookData.chunked && bookData.chunks) {
      bookData.pages = new Array(bookData.totalPages);
    }

    // Restore saved page from localStorage
    const storageKey = 'rc_book_page_' + encodeURIComponent(link);
    const savedPage = parseInt(localStorage.getItem(storageKey) || '1', 10);
    const useTarget = targetPage != null && !isNaN(targetPage);
    let startPage;
    if (useTarget) {
      startPage = Math.max(1, Math.min(targetPage, bookData.totalPages));
    } else {
      startPage = (savedPage >= 1 && savedPage <= bookData.totalPages) ? savedPage : 1;
    }

    bookReaderState = {
      bookData,
      currentPage: startPage,
      storageKey,
      resuming: !useTarget && savedPage > 1
    };
    _bookLink = link;
    _bookGlossaryMap = buildGlossaryMap(bookData);

    // Build UI
    const backdrop = document.createElement('div');
    backdrop.className = 'st-panel-backdrop';
    backdrop.id = 'bookPanelBackdrop';

    const panel = document.createElement('div');
    panel.className = 'st-book-panel';
    panel.id = 'bookPanel';

    renderBookPanel(panel, bookData, title);

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    // Render TOC and first page now that the panel is in the DOM so that
    // document.getElementById() lookups inside these functions resolve correctly.
    renderBookToc(bookData);
    renderBookPage();

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeBookReader();
    });

    bookPanelEscapeHandler = function (e) {
      if (e.key === 'Escape' && !document.querySelector('.rc-modal-backdrop')) closeBookReader();
      if (e.key === 'ArrowRight') navigateBookPage(1);
      if (e.key === 'ArrowLeft') navigateBookPage(-1);
      if ((e.key === 'r' || e.key === 'R') && getBookHelper('replay') && _lastSpokenText) {
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') replayLastSpoken();
      }
    };
    document.addEventListener('keydown', bookPanelEscapeHandler);

    requestAnimationFrame(() => {
      backdrop.classList.add('open');
      panel.classList.add('open');
    });

    // Show resume toast
    if (bookReaderState.resuming) {
      showToast(`📖 Resuming from page ${bookReaderState.currentPage}`);
    }

    // Start reading timer if enabled
    if (getBookHelper('reading_timer')) {
      startReadingTimer();
    }
  }

  function closeBookReader() {
    stopBookTts();
    stopReadingTimer();
    closeWordPopup();
    hideSelectionToolbar();
    _lastSpokenText = '';
    _lastSpokenType = 'paragraph';
    _lastSpokenWordOffset = 0;
    _lastSpokenSpanCount = 0;
    if (bookPanelEscapeHandler) {
      document.removeEventListener('keydown', bookPanelEscapeHandler);
      bookPanelEscapeHandler = null;
    }

    if (_bookSelectionChangeHandler) {
      document.removeEventListener('selectionchange', _bookSelectionChangeHandler);
      _bookSelectionChangeHandler = null;
    }

    if (_bookReadingHelperOutsideClickHandler) {
      document.removeEventListener('click', _bookReadingHelperOutsideClickHandler);
      _bookReadingHelperOutsideClickHandler = null;
    }

    if (_bookMyWordsOutsideClickHandler) {
      document.removeEventListener('click', _bookMyWordsOutsideClickHandler);
      _bookMyWordsOutsideClickHandler = null;
    }

    const panel = document.getElementById('bookPanel');
    const backdrop = document.getElementById('bookPanelBackdrop');

    if (panel) {
      panel.classList.remove('open');
      setTimeout(() => panel.remove(), PANEL_TRANSITION_MS);
    }
    if (backdrop) {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), PANEL_TRANSITION_MS);
    }

    bookReaderState = null;
    _vocabPreviewedChapters.clear();
    _comprehensionCheckedChapters.clear();
  }

  function renderBookPanel(panel, bookData, title) {
    const safeTitle = escapeHtml(title || bookData.title || 'Book');
    const hasSidebar = bookData.chapters && bookData.chapters.length > 0;
    const hasGlossary = Array.isArray(bookData.glossary) && bookData.glossary.length > 0;
    panel.innerHTML = `
      <div class="st-book-panel-header">
        <button class="st-panel-back-btn" id="bookBackBtn" style="margin-bottom:0;flex-shrink:0;">← Back</button>
        <h2 class="st-book-panel-title">${safeTitle}</h2>
        ${hasSidebar ? `<button class="st-book-nav-btn" id="bookTocToggle" title="Toggle chapters">☰ Chapters</button>` : ''}
        <button class="st-panel-close-btn" id="bookCloseBtn">✕</button>
      </div>
      <div class="st-book-body">
        ${hasSidebar ? `<aside class="st-book-sidebar" id="bookSidebar">
          <div class="st-book-sidebar-heading">Chapters</div>
          <div id="bookTocList"></div>
        </aside>` : ''}
        <div class="st-book-content" id="bookContent"></div>
      </div>
      <div class="st-book-nav">
        <button class="st-book-nav-btn" id="bookPrevBtn">← Previous</button>
        <div class="st-book-page-info" id="bookPageInfo"></div>
        <button class="st-book-nav-btn" id="bookNextBtn">Next →</button>
        <div class="st-book-font-controls" style="display:flex;align-items:center;gap:4px;">
          <button class="st-book-nav-btn" id="bookFontDecBtn" title="Decrease font size" style="padding:8px 10px;font-weight:700;">A-</button>
          <button class="st-book-nav-btn" id="bookFontIncBtn" title="Increase font size" style="padding:8px 10px;font-weight:700;">A+</button>
        </div>
        <div class="st-book-mode-btns" style="display:flex;align-items:center;gap:2px;">
          <button class="st-book-nav-btn st-book-mode-btn" data-mode="default" title="Default mode" style="padding:8px 10px;">🌙</button>
          <button class="st-book-nav-btn st-book-mode-btn" data-mode="warm" title="Warm (sepia) mode" style="padding:8px 10px;">📖</button>
          <button class="st-book-nav-btn st-book-mode-btn" data-mode="contrast" title="High contrast mode" style="padding:8px 10px;">◑</button>
          <button class="st-book-nav-btn st-book-mode-btn" data-mode="light" title="Light mode" style="padding:8px 10px;">☀️</button>
        </div>
        <div style="position:relative;">
          <button class="st-book-nav-btn" id="bookBookmarkBtn" title="Bookmark this page" style="padding:8px 10px;">🔖</button>
          <div class="st-book-bookmarks-panel" id="bookBookmarksPanel" style="display:none;"></div>
        </div>
        ${hasGlossary ? `<button class="st-book-nav-btn" id="bookGlossaryBtn" title="Glossary" style="padding:8px 10px;">📚 Glossary</button>` : ''}
        ${getBookHelper('word_tracker') ? `<div style="position:relative;"><button class="st-book-nav-btn" id="bookMyWordsBtn" title="My Words" style="padding:8px 10px;">📝 My Words <span class="st-mw-badge" id="myWordsBadge" style="display:none;"></span></button></div>` : ''}
        ${getBookHelper('reading_timer') ? `<span class="st-reading-timer-pill" id="bookReadingTimerPill">\u23F1 0m</span>` : ''}
        <div style="position:relative;">
          <button class="st-book-nav-btn" id="bookReadingHelperBtn" title="Reading Helper settings" style="padding:8px 10px;">🛟 Reading Helper</button>
          <div class="st-reading-helper-panel" id="bookReadingHelperPanel" style="display:none;"></div>
        </div>
        <div class="st-book-tts-wrapper" style="position:relative;display:flex;align-items:center;gap:6px;">
          ${getBookHelper('replay') ? `<button class="st-book-nav-btn st-book-tts-replay-btn" id="bookTtsReplayBtn" aria-label="Replay last spoken text" title="Replay last spoken text (R)" disabled>⏪ Replay</button>` : ''}
          <button class="st-book-nav-btn" id="bookTtsBtn">🔊 Read Aloud</button>
          <button class="st-book-nav-btn st-book-tts-settings-btn" id="bookTtsSettingsBtn" title="TTS settings" style="padding:8px 10px;">⚙️</button>
          <div class="st-book-tts-settings" id="bookTtsSettings" style="display:none;">
            <div class="st-book-tts-settings-row">
              <label class="st-book-tts-settings-label">Speed</label>
              <input type="range" id="bookTtsRate" class="st-book-tts-slider" min="0.25" max="4.0" step="0.05" value="${DEFAULT_TTS_RATE}"/>
              <span id="bookTtsRateVal">${DEFAULT_TTS_RATE}×</span>
            </div>
            <div class="st-book-tts-settings-row">
              <label class="st-book-tts-settings-label">Voice</label>
              <select id="bookTtsVoice" class="st-book-tts-voice-select"></select>
            </div>
          </div>
        </div>
        <div class="st-book-tts-controls" id="bookTtsControls" style="display:none;">
          <button class="st-book-nav-btn" id="bookTtsPause">⏸ Pause</button>
          <button class="st-book-nav-btn" id="bookTtsNextSentence" style="display:none;">▶ Next Sentence</button>
          <button class="st-book-nav-btn" id="bookTtsStop">⏹ Stop</button>
        </div>
      </div>
    `;

    // Wire events
    panel.querySelector('#bookBackBtn').addEventListener('click', closeBookReader);
    panel.querySelector('#bookCloseBtn').addEventListener('click', closeBookReader);
    panel.querySelector('#bookPrevBtn').addEventListener('click', () => navigateBookPage(-1));
    panel.querySelector('#bookNextBtn').addEventListener('click', () => navigateBookPage(1));
    panel.querySelector('#bookTtsBtn').addEventListener('click', function (e) {
      e.preventDefault();
      toggleBookTts();
    });
    panel.querySelector('#bookTtsPause').addEventListener('click', pauseResumeBookTts);
    panel.querySelector('#bookTtsNextSentence').addEventListener('click', function () {
      if (bookTtsNextSentenceCallback) bookTtsNextSentenceCallback();
    });
    panel.querySelector('#bookTtsStop').addEventListener('click', stopBookTts);

    if (getBookHelper('replay')) {
      const replayBtnEl = panel.querySelector('#bookTtsReplayBtn');
      if (replayBtnEl) replayBtnEl.addEventListener('click', replayLastSpoken);
    }

    const bookContent = panel.querySelector('#bookContent');
    if (bookContent) {
      let _tapToHearTimeout = null;

      bookContent.addEventListener('dblclick', function (e) {
        clearTimeout(_tapToHearTimeout); // cancel any pending tap-to-hear
        const wordEl = e.target.closest('.st-book-word');
        if (!wordEl) return;
        e.preventDefault();
        e.stopPropagation();
        const rawWord = wordEl.textContent || '';
        const cleanWord = rawWord.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
        if (!cleanWord) return;
        showWordPopup(cleanWord, rawWord, e.clientX, e.clientY, wordEl);
      });

      // Single-click tap-to-hear (only when tap_to_hear helper is enabled)
      bookContent.addEventListener('click', function (e) {
        if (!getBookHelper('tap_to_hear')) return;
        const wordEl = e.target.closest('.st-book-word');
        if (!wordEl) return;
        clearTimeout(_tapToHearTimeout);
        _tapToHearTimeout = setTimeout(function () {
          const rawWord = wordEl.textContent || '';
          const cleanWord = rawWord.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
          if (!cleanWord) return;
          speakWord(rawWord.trim());
          trackHeardWord(cleanWord);
          wordEl.classList.add('st-book-word-heard');
          setTimeout(function () { wordEl.classList.remove('st-book-word-heard'); }, 600);
        }, 250);
      });

      // Text selection toolbar
      bookContent.addEventListener('mouseup', function () {
        setTimeout(function () {
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) handleTextSelection();
        }, 10);
      });
      bookContent.addEventListener('touchend', function () {
        setTimeout(function () {
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) handleTextSelection();
        }, 10);
      });
    }

    // Hide selection toolbar when selection clears
    _bookSelectionChangeHandler = function () {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) hideSelectionToolbar();
    };
    document.addEventListener('selectionchange', _bookSelectionChangeHandler);

    // Bookmark button
    const bookmarkBtn = panel.querySelector('#bookBookmarkBtn');
    const bookmarksPanel = panel.querySelector('#bookBookmarksPanel');
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = bookmarksPanel && bookmarksPanel.style.display !== 'none';
        if (isOpen) {
          if (bookmarksPanel) bookmarksPanel.style.display = 'none';
        } else {
          toggleBookmark(bookmarkBtn, bookmarksPanel);
        }
      });
      document.addEventListener('click', function hideBookmarkPanel(e) {
        if (bookmarksPanel && !bookmarksPanel.contains(e.target) && e.target !== bookmarkBtn) {
          bookmarksPanel.style.display = 'none';
        }
      });
    }
    updateBookmarkButton();

    // Glossary button
    if (hasGlossary) {
      const glossaryBtn = panel.querySelector('#bookGlossaryBtn');
      if (glossaryBtn) {
        glossaryBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          showGlossaryPanel();
        });
      }
    }

    // My Words button
    const myWordsBtn = panel.querySelector('#bookMyWordsBtn');
    if (myWordsBtn) {
      // Initialize badge with current count
      const _mwKey = 'rc_book_helper_heard_words';
      try {
        const _mwWords = JSON.parse(localStorage.getItem(_mwKey) || '[]');
        const badge = panel.querySelector('#myWordsBadge');
        if (badge && _mwWords.length > 0) {
          badge.textContent = _mwWords.length;
          badge.style.display = 'inline-block';
        }
      } catch (e) { /* ignore */ }

      myWordsBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        showMyWordsPanel();
      });
      _bookMyWordsOutsideClickHandler = function (e) {
        const mwPanel = document.getElementById('bookMyWordsPanel');
        if (mwPanel && !mwPanel.contains(e.target) && e.target !== myWordsBtn && !myWordsBtn.contains(e.target)) {
          if (typeof mwPanel._closeMyWordsPanel === 'function') {
            mwPanel._closeMyWordsPanel();
          } else {
            mwPanel.remove();
          }
        }
      };
      document.addEventListener('click', _bookMyWordsOutsideClickHandler);
    }

    // Font size controls
    const FONT_MIN = 14, FONT_MAX = 28, FONT_STEP = 2, FONT_DEFAULT = 18;
    let currentFontSize = parseInt(localStorage.getItem('rc_book_font_size') || String(FONT_DEFAULT), 10);
    function applyFontSize(size) {
      currentFontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, size));
      if (bookContent) bookContent.style.fontSize = currentFontSize + 'px';
      localStorage.setItem('rc_book_font_size', String(currentFontSize));
    }
    applyFontSize(currentFontSize);
    panel.querySelector('#bookFontDecBtn').addEventListener('click', function () { applyFontSize(currentFontSize - FONT_STEP); });
    panel.querySelector('#bookFontIncBtn').addEventListener('click', function () { applyFontSize(currentFontSize + FONT_STEP); });

    // Reading mode controls
    const savedMode = localStorage.getItem('rc_book_reading_mode') || 'default';
    panel.setAttribute('data-book-mode', savedMode);
    panel.querySelectorAll('.st-book-mode-btn').forEach(function (btn) {
      const mode = btn.getAttribute('data-mode');
      btn.classList.toggle('st-book-mode-btn-active', mode === savedMode);
      btn.addEventListener('click', function () {
        const m = btn.getAttribute('data-mode');
        panel.setAttribute('data-book-mode', m);
        localStorage.setItem('rc_book_reading_mode', m);
        panel.querySelectorAll('.st-book-mode-btn').forEach(function (b) {
          b.classList.toggle('st-book-mode-btn-active', b.getAttribute('data-mode') === m);
        });
      });
    });

    // TTS settings popover
    const settingsBtn = panel.querySelector('#bookTtsSettingsBtn');
    const settingsPopover = panel.querySelector('#bookTtsSettings');
    if (settingsBtn && settingsPopover) {
      settingsBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = settingsPopover.style.display !== 'none';
        settingsPopover.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) populateTtsSettingsPopover(settingsPopover);
      });
      document.addEventListener('click', function hideTtsSettings(e) {
        if (!settingsPopover.contains(e.target) && e.target !== settingsBtn) {
          settingsPopover.style.display = 'none';
        }
      });
    }

    // Reading Helper panel
    const readingHelperBtn = panel.querySelector('#bookReadingHelperBtn');
    const readingHelperPanel = panel.querySelector('#bookReadingHelperPanel');
    if (readingHelperBtn && readingHelperPanel) {
      readingHelperBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = readingHelperPanel.style.display !== 'none';
        if (isOpen) {
          hideReadingHelperPanel(readingHelperPanel);
        } else {
          showReadingHelperPanel(readingHelperPanel);
        }
      });
      _bookReadingHelperOutsideClickHandler = function (e) {
        if (!readingHelperPanel.contains(e.target) && e.target !== readingHelperBtn) {
          hideReadingHelperPanel(readingHelperPanel);
        }
      };
      document.addEventListener('click', _bookReadingHelperOutsideClickHandler);
    }

    if (hasSidebar) {
      const tocToggle = panel.querySelector('#bookTocToggle');
      if (tocToggle) {
        tocToggle.addEventListener('click', function () {
          const sb = document.getElementById('bookSidebar');
          if (sb) {
            sb.classList.toggle('collapsed');
            sb.classList.toggle('open');
          }
        });
      }
    }
  }

  /**
   * Find which chunk contains the given page number (1-based).
   * Returns the chunk descriptor or null for non-chunked books.
   */
  function findChunkForPage(bookData, pageNum) {
    if (!bookData.chunked || !bookData.chunks) return null;
    for (const chunk of bookData.chunks) {
      if (pageNum >= chunk.startPage && pageNum <= chunk.endPage) return chunk;
    }
    return null;
  }

  /**
   * Fetch a book chunk and populate the sparse pages array.
   * Returns true on success, false on failure.
   */
  async function fetchBookChunk(chunkId) {
    if (_bookChunkCache.has(chunkId)) return true;
    const base = _bookLink.endsWith('/') ? _bookLink : _bookLink + '/';
    try {
      const r = await fetch(base + 'book-chunk-' + chunkId + '.json');
      if (!r.ok) throw new Error('Chunk not found: ' + chunkId);
      const chunkData = await r.json();
      _bookChunkCache.set(chunkId, true);
      // Populate the sparse pages array
      const state = bookReaderState;
      if (state && state.bookData && Array.isArray(chunkData.pages)) {
        const offset = chunkData.startPage - 1;
        for (let i = 0; i < chunkData.pages.length; i++) {
          state.bookData.pages[offset + i] = chunkData.pages[i];
        }
      }
      return true;
    } catch (e) {
      console.error(LOG_PREFIX, 'Failed to load book chunk', chunkId, e);
      return false;
    }
  }

  function renderBookToc(bookData) {
    const tocList = document.getElementById('bookTocList');
    if (!tocList) return;
    const state = bookReaderState;
    if (!bookData.chapters || !bookData.chapters.length) {
      tocList.innerHTML = '<p style="padding:8px 12px;opacity:0.5;font-size:13px;">No chapters found</p>';
      return;
    }

    let html = '';
    for (let i = 0; i < bookData.chapters.length; i++) {
      const ch = bookData.chapters[i];
      html += `<button class="st-book-toc-item" data-page="${ch.startPage}">${escapeHtml(ch.label)}</button>`;
    }
    tocList.innerHTML = html;

    tocList.querySelectorAll('.st-book-toc-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const pg = parseInt(btn.getAttribute('data-page'), 10);
        if (pg >= 1 && pg <= bookReaderState.bookData.totalPages) {
          stopBookTts();
          bookReaderState.currentPage = pg;
          renderBookPage();
        }
      });
    });
  }

  function renderBookPage() {
    const state = bookReaderState;
    if (!state) return;

    const { bookData, currentPage } = state;

    // Save progress
    localStorage.setItem(state.storageKey, String(currentPage));
    localStorage.setItem(state.storageKey + '_total', String(bookData.totalPages));

    // Update page info
    const pageInfo = document.getElementById('bookPageInfo');
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${bookData.totalPages}`;

    // Update nav buttons
    const prevBtn = document.getElementById('bookPrevBtn');
    const nextBtn = document.getElementById('bookNextBtn');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= bookData.totalPages;

    // Update TOC active state
    if (bookData.chapters && bookData.chapters.length > 0) {
      // Find the chapter for this page
      let activeChapter = bookData.chapters[0];
      for (const ch of bookData.chapters) {
        if (ch.startPage <= currentPage) activeChapter = ch;
      }
      document.querySelectorAll('.st-book-toc-item').forEach(function (btn) {
        const pg = parseInt(btn.getAttribute('data-page'), 10);
        btn.classList.toggle('active', pg === activeChapter.startPage);
      });
    }

    // Render page content
    const content = document.getElementById('bookContent');
    if (!content) return;

    // For chunked books: check if the needed chunk is loaded
    const chunk = findChunkForPage(bookData, currentPage);
    if (chunk && !_bookChunkCache.has(chunk.id)) {
      // Show loading state, then fetch the chunk and re-render
      content.innerHTML = '<p style="opacity:0.5;text-align:center;padding:24px;">⏳ Loading page…</p>';
      fetchBookChunk(chunk.id).then(function (ok) {
        if (!ok) {
          const c = document.getElementById('bookContent');
          if (c) c.innerHTML = '<p style="opacity:0.5;color:#f87171;">Could not load this section. Please try again.</p>';
          return;
        }
        // Re-render now that the chunk is loaded
        const s = bookReaderState;
        if (s && s.currentPage === currentPage) renderBookPage();
      });
      // Prefetch the next chunk in background while the current one loads
      const nextChunkDuringLoad = currentPage < bookData.totalPages ? findChunkForPage(bookData, currentPage + 1) : null;
      if (nextChunkDuringLoad && nextChunkDuringLoad.id !== chunk.id && !_bookChunkCache.has(nextChunkDuringLoad.id)) {
        fetchBookChunk(nextChunkDuringLoad.id);
      }
      return;
    }

    const pageObj = bookData.pages[currentPage - 1];
    if (!pageObj) {
      content.innerHTML = '<p style="opacity:0.5">Page not found.</p>';
      return;
    }

    let wordIdx = 0;
    let html = '';
    for (const para of (pageObj.paragraphs || [])) {
      const firstWord = para[0] || '';
      if (para.length === 1 && firstWord.startsWith('## ')) {
        // Sub-heading paragraph
        const headingText = firstWord.slice(3);
        html += `<h3 class="st-book-subheading"><span class="st-book-word" data-word-idx="${wordIdx}">${escapeHtml(headingText)}</span></h3>`;
        wordIdx++;
      } else {
        html += '<p>';
        for (let wi = 0; wi < para.length; wi++) {
          if (wi > 0) html += ' ';
          html += `<span class="st-book-word" data-word-idx="${wordIdx}">${escapeHtml(para[wi])}</span>`;
          wordIdx++;
        }
        html += '</p>';
      }
    }
    content.innerHTML = html || '<p style="opacity:0.5">No content.</p>';
    content.scrollTop = 0;
    // Apply glossary term underlines and persistent highlights
    applyGlossaryTerms(content);
    applyPageHighlights(content, currentPage);
    applyDisplayAccessibility();
    updateBookmarkButton();

    // Prefetch next chunk in background while reading current chunk
    const nextChunk = currentPage < bookData.totalPages ? findChunkForPage(bookData, currentPage + 1) : null;
    if (nextChunk && !_bookChunkCache.has(nextChunk.id)) {
      fetchBookChunk(nextChunk.id);
    }

    // Vocabulary Preview: show card before first page of each new chapter
    if (getBookHelper('vocab_preview') && _bookGlossaryMap && bookData.chapters && bookData.chapters.length > 0) {
      const chapterAtPage = bookData.chapters.find(function (ch) { return ch.startPage === currentPage; });
      if (chapterAtPage && !_vocabPreviewedChapters.has(currentPage)) {
        showVocabPreviewCard(chapterAtPage);
      }
    }
  }

  function navigateBookPage(delta) {
    const state = bookReaderState;
    if (!state) return;
    const prevPage = state.currentPage;
    const newPage = prevPage + delta;
    if (newPage < 1 || newPage > state.bookData.totalPages) return;
    stopBookTts();

    // Comprehension check: when moving forward into a new chapter, check the chapter just completed
    if (delta > 0 && getBookHelper('comprehension')) {
      const bookData = state.bookData;
      const chapters = (bookData.chapters && bookData.chapters.length > 0) ? bookData.chapters : null;
      if (chapters) {
        // Check if the new page starts a chapter
        const newChapter = chapters.find(function (ch) { return ch.startPage === newPage; });
        if (newChapter) {
          // Find the chapter that was just completed (contains prevPage)
          let prevChapter = null;
          for (let ci = chapters.length - 1; ci >= 0; ci--) {
            if (chapters[ci].startPage <= prevPage) {
              prevChapter = chapters[ci];
              break;
            }
          }
          if (prevChapter && !_comprehensionCheckedChapters.has(prevChapter.startPage)) {
            // Show comprehension check over the current chapter, then navigate to new chapter
            showComprehensionCheck(prevChapter, bookData).then(function () {
              state.currentPage = newPage;
              renderBookPage();
            });
            return;
          }
        }
      }
    }

    state.currentPage = newPage;
    renderBookPage();
  }

  /**
   * Selects up to 5 glossary terms that appear in the given chapter's page range,
   * prioritizing longer/less-common words. Returns between 0 and 5 terms.
   * @param {object} bookData
   * @param {object} chapter - { title, startPage }
   * @param {Map} glossaryMap - Map<normalized_term, definition>
   * @returns {Array<{term:string, definition:string}>}
   */
  function selectVocabTermsForChapter(bookData, chapter, glossaryMap) {
    if (!glossaryMap || !glossaryMap.size) return [];

    // Determine page range for this chapter
    const chapters = bookData.chapters || [];
    const chIdx = chapters.indexOf(chapter);
    const startPage = chapter.startPage;
    const endPage = (chIdx >= 0 && chIdx + 1 < chapters.length)
      ? chapters[chIdx + 1].startPage - 1
      : bookData.totalPages;

    // Count occurrences of each glossary term across the chapter's pages
    const termCounts = new Map(); // term -> occurrence count
    for (let pg = startPage; pg <= endPage; pg++) {
      const pageObj = bookData.pages[pg - 1];
      if (!pageObj) continue;
      for (const para of (pageObj.paragraphs || [])) {
        for (const word of para) {
          const normalized = word.toLowerCase().replace(/[^a-z'-]/g, '');
          if (glossaryMap.has(normalized)) {
            termCounts.set(normalized, (termCounts.get(normalized) || 0) + 1);
          }
        }
      }
    }

    if (!termCounts.size) return [];

    // Sort: prefer longer terms (rarer/more interesting vocab), then by frequency (less common = lower count)
    const sorted = Array.from(termCounts.entries()).sort(function (a, b) {
      // Primary: longer term first
      if (b[0].length !== a[0].length) return b[0].length - a[0].length;
      // Secondary: less frequent first (harder words)
      return a[1] - b[1];
    });

    // Pick up to 5, retrieving full term and definition from the original glossary
    const result = [];
    for (const [normalizedTerm] of sorted) {
      if (result.length >= 5) break;
      const definition = glossaryMap.get(normalizedTerm);
      // Find the canonical (original casing) term from the glossary
      const canonicalTerm = (function () {
        for (const entry of (bookData.glossary || [])) {
          if (entry.term && entry.term.toLowerCase() === normalizedTerm) return entry.term;
        }
        return normalizedTerm;
      }());
      result.push({ term: canonicalTerm, definition: definition || '' });
    }
    return result;
  }

  /**
   * Fetches an AI-generated illustration for a vocabulary term.
   * Results are cached in _vocabImageCache to avoid redundant API calls.
   * @param {string} term
   * @param {string} definition
   * @returns {Promise<string|null>} base64 data URL or null on failure
   */
  async function fetchVocabImage(term, definition) {
    const cacheKey = term.toLowerCase();
    if (_vocabImageCache.has(cacheKey)) return _vocabImageCache.get(cacheKey);

    try {
      const res = await fetch('/.netlify/functions/student-vocab-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, definition }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.ok || !data.image) return null;
      const dataUrl = 'data:image/png;base64,' + data.image;
      _vocabImageCache.set(cacheKey, dataUrl);
      return dataUrl;
    } catch (e) {
      return null;
    }
  }

  /**
   * Shows the Vocabulary Preview card as an overlay inside the book panel,
   * before the student starts reading a new chapter.
   * @param {object} chapter - { title, startPage }
   * @returns {Promise<void>} resolves when the student dismisses the card
   */
  function showVocabPreviewCard(chapter) {
    return new Promise(function (resolve) {
      const { bookData } = bookReaderState;
      const terms = selectVocabTermsForChapter(bookData, chapter, _bookGlossaryMap);

      // If there are no matching glossary terms, skip the preview entirely
      if (!terms.length) {
        _vocabPreviewedChapters.add(chapter.startPage);
        resolve();
        return;
      }

      const chapterTitle = escapeHtml(chapter.title || ('Chapter ' + chapter.startPage));

      // Build term cards HTML (images start as loading placeholders)
      const termCardsHtml = terms.map(function (t, i) {
        return `<div class="st-vp-term-card">
          <div class="st-vp-term-img-wrap" id="vpImg${i}">
            <div class="st-vp-term-img-placeholder"></div>
          </div>
          <div class="st-vp-term-body">
            <div class="st-vp-term-word">${escapeHtml(t.term)}</div>
            <div class="st-vp-term-def">${escapeHtml(t.definition)}</div>
            <button class="st-vp-hear-btn" data-vp-term="${escapeHtml(t.term)}" title="Hear it">🔊 Hear it</button>
          </div>
        </div>`;
      }).join('');

      // Find the book panel to anchor the overlay inside it
      const bookPanel = document.getElementById('bookPanel');
      if (!bookPanel) {
        _vocabPreviewedChapters.add(chapter.startPage);
        resolve();
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'st-vp-overlay';
      overlay.id = 'vocabPreviewOverlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'vpCardTitle');
      overlay.innerHTML = `
        <div class="st-vp-card">
          <div class="st-vp-header">
            <span class="st-vp-title" id="vpCardTitle">📚 Words to Know — ${chapterTitle}</span>
          </div>
          <div class="st-vp-terms">${termCardsHtml}</div>
          <div class="st-vp-footer">
            <button class="st-vp-start-btn" id="vpStartBtn">Start Reading →</button>
          </div>
        </div>
      `;

      bookPanel.appendChild(overlay);

      // Wire "Hear it" buttons
      overlay.addEventListener('click', function (e) {
        const hearBtn = e.target.closest('.st-vp-hear-btn');
        if (hearBtn) {
          const word = hearBtn.getAttribute('data-vp-term');
          if (word) speakWord(word);
        }
      });

      // Wire "Start Reading" button
      const startBtn = overlay.querySelector('#vpStartBtn');
      if (startBtn) {
        startBtn.addEventListener('click', function () {
          _vocabPreviewedChapters.add(chapter.startPage);
          overlay.classList.add('st-vp-overlay-out');
          setTimeout(function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            resolve();
          }, 250);
        });
        // Focus the start button for keyboard users
        setTimeout(function () { startBtn.focus(); }, 50);
      }

      // Load images asynchronously for each term
      terms.forEach(function (t, i) {
        fetchVocabImage(t.term, t.definition).then(function (dataUrl) {
          const wrap = document.getElementById('vpImg' + i);
          if (!wrap) return;
          // Validate that the dataUrl is a safe base64 PNG data URL before injecting into DOM
          if (dataUrl && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(dataUrl)) {
            const img = document.createElement('img');
            img.className = 'st-vp-term-img';
            img.src = dataUrl;
            img.alt = t.term + ' illustration';
            img.loading = 'lazy';
            wrap.innerHTML = '';
            wrap.appendChild(img);
          } else {
            // Hide the image area on failure or unexpected format
            wrap.style.display = 'none';
          }
        });
      });
    });
  }

  // Reading Helper panel feature definitions
  const BOOK_HELPER_FEATURES = [
    { key: 'tap_to_hear',      label: 'Tap-to-Hear Words',     desc: 'Tap any word to hear it read aloud' },
    { key: 'sentence_mode',    label: 'Sentence Mode',          desc: 'Read one sentence at a time' },
    { key: 'vocab_preview',    label: 'Vocabulary Preview',     desc: 'Show key words before each chapter' },
    { key: 'comprehension',    label: 'Comprehension Check',    desc: 'Quick questions at chapter ends' },
    { key: 'word_tracker',     label: 'Word Tracker',           desc: 'Track words I\u2019ve looked up' },
    { key: 'reading_timer',    label: 'Reading Timer',          desc: 'Show how long I\'ve been reading' },
    { key: 'replay',           label: 'Replay Button',          desc: 'Add a replay button to Read Aloud' }
  ];

  /**
   * Extracts the full text of a chapter by joining all paragraph words from the
   * chapter's page range. Returns an empty string if pages aren't loaded yet.
   * @param {object} bookData
   * @param {object} chapter - { title, startPage }
   * @param {Array}  chapters - full chapters array from bookData
   * @returns {string}
   */
  function getChapterText(bookData, chapter, chapters) {
    if (!bookData || !chapter || !Array.isArray(bookData.pages)) return '';
    const startPage = chapter.startPage;

    // Determine the end page (last page of this chapter)
    let endPage = bookData.totalPages;
    if (chapters && chapters.length > 0) {
      for (let i = 0; i < chapters.length; i++) {
        if (chapters[i].startPage === startPage && i + 1 < chapters.length) {
          endPage = chapters[i + 1].startPage - 1;
          break;
        }
      }
    }

    const parts = [];
    for (let p = startPage; p <= endPage; p++) {
      const page = bookData.pages[p - 1];
      if (!page || !Array.isArray(page.paragraphs)) continue;
      for (const para of page.paragraphs) {
        if (!para) continue;
        const words = Array.isArray(para) ? para : (para.words || []);
        if (words.length > 0) parts.push(words.join(' '));
      }
    }
    return parts.join(' ');
  }

  /**
   * Shows the comprehension check overlay after a chapter ends.
   * Calls the student-comprehension-check Netlify function to get questions,
   * displays them as an interactive overlay, and resolves when the student
   * finishes (or on error, to never block the student).
   * @param {object} chapter  - { title, startPage }
   * @param {object} bookData
   * @returns {Promise<void>}
   */
  function showComprehensionCheck(chapter, bookData) {
    return new Promise(function (resolve) {
      // Mark this chapter as checked immediately so re-triggers are prevented
      _comprehensionCheckedChapters.add(chapter.startPage);

      const bookPanel = document.getElementById('bookPanel');
      if (!bookPanel) {
        resolve();
        return;
      }

      const chapterTitle = chapter.title || ('Chapter ' + chapter.startPage);
      const safeChapterTitle = escapeHtml(chapterTitle);
      const chapters = bookData.chapters || [];
      const chapterText = getChapterText(bookData, chapter, chapters);

      // If we can't extract text (e.g., chunked pages not loaded), skip gracefully
      if (!chapterText.trim()) {
        resolve();
        return;
      }

      // --- Build loading overlay ---
      const overlay = document.createElement('div');
      overlay.className = 'st-cc-backdrop';
      overlay.id = 'comprehensionCheckOverlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'ccCardTitle');
      overlay.innerHTML = `
        <div class="st-cc-card">
          <div class="st-cc-header" id="ccCardTitle">🧠 Chapter Check — ${safeChapterTitle}</div>
          <div class="st-cc-loading">
            <div class="st-cc-spinner"></div>
            <span>Preparing comprehension check…</span>
          </div>
        </div>
      `;
      bookPanel.appendChild(overlay);

      // Fetch comprehension questions from the Netlify function
      const bookTitle = (bookData.title && typeof bookData.title === 'string') ? bookData.title : '';

      fetch('/.netlify/functions/student-comprehension-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterTitle: chapterTitle,
          chapterText: chapterText,
          bookTitle: bookTitle,
        }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data.ok || !Array.isArray(data.questions) || data.questions.length === 0) {
            throw new Error('Invalid response from server');
          }
          renderComprehensionQuestions(overlay, data.questions, safeChapterTitle, resolve);
        })
        .catch(function () {
          showToast('Could not load questions — continuing to next chapter', 'error');
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve();
        });
    });
  }

  /**
   * Renders the comprehension questions inside an existing overlay element.
   * @param {HTMLElement} overlay
   * @param {Array} questions
   * @param {string} safeChapterTitle - already HTML-escaped chapter title
   * @param {Function} resolve - Promise resolve callback
   */
  function renderComprehensionQuestions(overlay, questions, safeChapterTitle, resolve) {
    let answeredCount = 0;

    const questionsHtml = questions.map(function (q, qi) {
      const choicesHtml = q.choices.map(function (choice, ci) {
        return `<button class="st-cc-choice" data-qi="${qi}" data-ci="${ci}">${escapeHtml(choice)}</button>`;
      }).join('');
      return `
        <div class="st-cc-question-block" id="ccQ${qi}">
          <div class="st-cc-question">${escapeHtml(q.question)}</div>
          <div class="st-cc-choices">${choicesHtml}</div>
          <div class="st-cc-feedback" id="ccFeedback${qi}" style="display:none;">
            <div class="st-cc-result" id="ccResult${qi}"></div>
            <div class="st-cc-explanation" id="ccExplan${qi}"></div>
          </div>
        </div>`;
    }).join('');

    overlay.innerHTML = `
      <div class="st-cc-card">
        <div class="st-cc-header" id="ccCardTitle">🧠 Chapter Check — ${safeChapterTitle}</div>
        <div class="st-cc-body">
          ${questionsHtml}
        </div>
        <div class="st-cc-footer" id="ccFooter" style="display:none;">
          <button class="st-cc-continue-btn" id="ccContinueBtn">Continue Reading →</button>
        </div>
      </div>
    `;

    // Wire choice buttons
    overlay.addEventListener('click', function (e) {
      const btn = e.target.closest('.st-cc-choice');
      if (!btn || btn.classList.contains('disabled')) return;

      const qi = parseInt(btn.getAttribute('data-qi'), 10);
      const ci = parseInt(btn.getAttribute('data-ci'), 10);
      const q = questions[qi];
      if (!q) return;

      // Disable all choices for this question
      const block = document.getElementById('ccQ' + qi);
      if (!block) return;
      block.querySelectorAll('.st-cc-choice').forEach(function (b) {
        b.classList.add('disabled');
        b.setAttribute('disabled', 'disabled');
      });

      // Highlight correct / incorrect
      const correctBtn = block.querySelector('[data-ci="' + q.correctIndex + '"]');
      if (ci === q.correctIndex) {
        btn.classList.add('correct');
      } else {
        btn.classList.add('incorrect');
        if (correctBtn) correctBtn.classList.add('correct');
      }

      // Show feedback
      const feedbackEl = document.getElementById('ccFeedback' + qi);
      const resultEl = document.getElementById('ccResult' + qi);
      const explanEl = document.getElementById('ccExplan' + qi);
      if (feedbackEl) feedbackEl.style.display = '';
      if (resultEl) resultEl.textContent = ci === q.correctIndex ? '✅ Correct!' : '❌ Not quite';
      if (resultEl) resultEl.className = 'st-cc-result ' + (ci === q.correctIndex ? 'correct' : 'incorrect');
      if (explanEl) explanEl.textContent = q.explanation;

      answeredCount++;
      if (answeredCount >= questions.length) {
        const footer = document.getElementById('ccFooter');
        if (footer) footer.style.display = '';
        const continueBtn = document.getElementById('ccContinueBtn');
        if (continueBtn) {
          setTimeout(function () { continueBtn.focus(); }, 50);
        }
      }
    });

    // Wire "Continue Reading" button
    overlay.addEventListener('click', function (e) {
      const btn = e.target.closest('#ccContinueBtn');
      if (!btn) return;
      overlay.classList.add('st-cc-backdrop-out');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve();
      }, 220);
    });

    // Focus first choice for keyboard users
    setTimeout(function () {
      const firstChoice = overlay.querySelector('.st-cc-choice');
      if (firstChoice) firstChoice.focus();
    }, 50);
  }

  /**
   * Applies display accessibility settings (line spacing, dyslexic font,
   * letter spacing, high contrast) from localStorage to #bookContent.
   */
  function applyDisplayAccessibility() {
    var content = document.getElementById('bookContent');
    if (!content) return;

    // Line spacing (default 1.7, range 1.4–2.4)
    var lineSpacing = parseFloat(localStorage.getItem('rc_book_helper_line_spacing')) || 1.7;
    content.style.lineHeight = lineSpacing;

    // OpenDyslexic font toggle
    var dyslexic = getBookHelper('dyslexic_font');
    content.classList.toggle('dyslexic-font', dyslexic);

    // Letter spacing (default 0, range 0–0.15em)
    var letterSpacing = parseFloat(localStorage.getItem('rc_book_helper_letter_spacing')) || 0;
    content.style.letterSpacing = letterSpacing > 0 ? letterSpacing + 'em' : '';

    // High contrast toggle
    var highContrast = getBookHelper('high_contrast');
    content.classList.toggle('high-contrast', highContrast);
  }

  /**
   * Renders and shows the Reading Helper settings panel.
   */
  function showReadingHelperPanel(container) {
    const rows = BOOK_HELPER_FEATURES.map(function (f) {
      const checked = getBookHelper(f.key);
      return `<div class="st-rh-row">
        <div class="st-rh-row-text">
          <span class="st-rh-row-label">${escapeHtml(f.label)}</span>
          <span class="st-rh-row-desc">${escapeHtml(f.desc)}</span>
        </div>
        <label class="st-rh-toggle" title="${escapeHtml(f.label)}">
          <input type="checkbox" class="st-rh-toggle-input" data-helper-key="${escapeHtml(f.key)}"${checked ? ' checked' : ''}>
          <span class="st-rh-toggle-slider"></span>
        </label>
      </div>`;
    }).join('');

    // Display Accessibility section
    var lineSpacingVal = parseFloat(localStorage.getItem('rc_book_helper_line_spacing')) || 1.7;
    var letterSpacingVal = parseFloat(localStorage.getItem('rc_book_helper_letter_spacing')) || 0;
    var dyslexicChecked = getBookHelper('dyslexic_font');
    var highContrastChecked = getBookHelper('high_contrast');

    var displayAccessibilityRows = `
      <div class="st-rh-section-header">🎨 Display Accessibility</div>
      <div class="st-rh-slider-row">
        <div class="st-rh-row-text">
          <span class="st-rh-row-label">Line Spacing</span>
          <span class="st-rh-row-desc">Space between lines of text</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <input type="range" class="st-rh-slider" data-helper-key="line_spacing"
            min="1.4" max="2.4" step="0.1" value="${lineSpacingVal}">
          <span class="st-rh-slider-val">${lineSpacingVal.toFixed(1)}</span>
        </div>
      </div>
      <div class="st-rh-row">
        <div class="st-rh-row-text">
          <span class="st-rh-row-label">OpenDyslexic Font</span>
          <span class="st-rh-row-desc">Easier-to-read font for dyslexia</span>
        </div>
        <label class="st-rh-toggle" title="OpenDyslexic Font">
          <input type="checkbox" class="st-rh-toggle-input" data-helper-key="dyslexic_font"${dyslexicChecked ? ' checked' : ''}>
          <span class="st-rh-toggle-slider"></span>
        </label>
      </div>
      <div class="st-rh-slider-row">
        <div class="st-rh-row-text">
          <span class="st-rh-row-label">Letter Spacing</span>
          <span class="st-rh-row-desc">Extra space between letters</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <input type="range" class="st-rh-slider" data-helper-key="letter_spacing"
            min="0" max="0.15" step="0.01" value="${letterSpacingVal}">
          <span class="st-rh-slider-val">${letterSpacingVal.toFixed(2)}em</span>
        </div>
      </div>
      <div class="st-rh-row">
        <div class="st-rh-row-text">
          <span class="st-rh-row-label">High Contrast</span>
          <span class="st-rh-row-desc">Black background, white text</span>
        </div>
        <label class="st-rh-toggle" title="High Contrast">
          <input type="checkbox" class="st-rh-toggle-input" data-helper-key="high_contrast"${highContrastChecked ? ' checked' : ''}>
          <span class="st-rh-toggle-slider"></span>
        </label>
      </div>
    `;

    container.innerHTML = `
      <div class="st-rh-header">
        <span class="st-rh-title">📖 Reading Helper</span>
        <button class="st-rh-close" id="readingHelperCloseBtn" title="Close" aria-label="Close Reading Helper">✕</button>
      </div>
      <div class="st-rh-body">
        ${rows}
        ${displayAccessibilityRows}
      </div>
    `;

    container.style.display = 'block';

    // Append reading stats section if timer is enabled
    if (getBookHelper('reading_timer')) {
      var statsDiv = document.createElement('div');
      renderReadingStats(statsDiv);
      var rhBody = container.querySelector('.st-rh-body');
      if (rhBody) rhBody.appendChild(statsDiv);
    }

    // Wire toggle changes via event delegation (avoids duplicate listeners on re-open)
    container.onchange = function (e) {
      const input = e.target.closest('.st-rh-toggle-input');
      if (input) {
        setBookHelper(input.getAttribute('data-helper-key'), input.checked);
        applyDisplayAccessibility();
      }
    };

    // Wire slider input events via event delegation
    container.oninput = function (e) {
      const slider = e.target.closest('.st-rh-slider');
      if (!slider) return;
      var key = slider.getAttribute('data-helper-key');
      var val = slider.value;
      try {
        localStorage.setItem('rc_book_helper_' + key, val);
      } catch (_e) { /* ignore */ }
      var valDisplay = slider.parentElement.querySelector('.st-rh-slider-val');
      if (valDisplay) {
        valDisplay.textContent = key === 'line_spacing'
          ? parseFloat(val).toFixed(1)
          : parseFloat(val).toFixed(2) + 'em';
      }
      applyDisplayAccessibility();
    };

    // Close button
    const closeBtn = container.querySelector('#readingHelperCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        hideReadingHelperPanel(container);
      });
    }
  }

  /**
   * Hides the Reading Helper settings panel.
   */
  function hideReadingHelperPanel(container) {
    if (container) container.style.display = 'none';
  }

  // ============================================================================
  // Reading Time Tracker
  // ============================================================================

  function _readingTimerDateKey(date) {
    var d = date || new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return 'rc_book_helper_reading_time_' + yyyy + '-' + mm + '-' + dd;
  }

  function getReadingTimeForDate(dateStr) {
    var val = 0;
    try {
      val = parseInt(localStorage.getItem('rc_book_helper_reading_time_' + dateStr) || '0', 10) || 0;
    } catch (_e) { /* ignore */ }
    return val;
  }

  function formatReadingTime(seconds) {
    var mins = Math.floor(seconds / 60);
    var hrs = Math.floor(mins / 60);
    var remMins = mins % 60;
    if (hrs > 0) {
      return hrs + ' hr ' + remMins + ' min';
    }
    return mins + ' min';
  }

  function flushReadingTime() {
    var key = _readingTimerDateKey();
    var cap = 86400; // max seconds in a day — prevents runaway values
    try {
      var stored = parseInt(localStorage.getItem(key) || '0', 10) || 0;
      var total = Math.min(stored + (_readingTimerSeconds - _readingTimerLastFlush), cap);
      localStorage.setItem(key, String(total));
      _readingTimerLastFlush = _readingTimerSeconds;
    } catch (_e) { /* ignore */ }
  }

  function _updateReadingTimerPill() {
    var pill = document.getElementById('bookReadingTimerPill');
    if (!pill) return;
    var key = _readingTimerDateKey();
    var stored = 0;
    try {
      stored = parseInt(localStorage.getItem(key) || '0', 10) || 0;
    } catch (_e) { /* ignore */ }
    var current = stored + (_readingTimerSeconds - _readingTimerLastFlush);
    var mins = Math.floor(current / 60);
    pill.textContent = '\u23F1 ' + mins + 'm';
  }

  function startReadingTimer() {
    if (_readingTimerInterval) return;
    // _readingTimerSeconds tracks seconds accumulated this session (from 0)
    // _readingTimerLastFlush mirrors it so delta = 0 on flush
    // flushReadingTime reads today's stored value from localStorage and adds the delta
    _readingTimerSeconds = 0;
    _readingTimerLastFlush = 0;

    _readingTimerInterval = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      if (bookTtsPaused) return;
      _readingTimerSeconds += 1;
      // Flush every 10 seconds
      if (_readingTimerSeconds - _readingTimerLastFlush >= 10) {
        flushReadingTime();
      }
    }, 1000);

    // Pill update every 10 seconds
    _readingTimerPillUpdateInterval = setInterval(_updateReadingTimerPill, 10000);

    // Visibility change: resume pill update when tab becomes visible again
    _readingTimerVisibilityHandler = function () {
      if (document.visibilityState === 'visible') {
        _updateReadingTimerPill();
      }
    };
    document.addEventListener('visibilitychange', _readingTimerVisibilityHandler);

    // Initial pill update
    _updateReadingTimerPill();

    // Flush on page unload
    window.addEventListener('beforeunload', flushReadingTime);
  }

  function stopReadingTimer() {
    if (_readingTimerInterval) {
      clearInterval(_readingTimerInterval);
      _readingTimerInterval = null;
    }
    if (_readingTimerPillUpdateInterval) {
      clearInterval(_readingTimerPillUpdateInterval);
      _readingTimerPillUpdateInterval = null;
    }
    if (_readingTimerVisibilityHandler) {
      document.removeEventListener('visibilitychange', _readingTimerVisibilityHandler);
      _readingTimerVisibilityHandler = null;
    }
    window.removeEventListener('beforeunload', flushReadingTime);
    flushReadingTime();
    _readingTimerSeconds = 0;
    _readingTimerLastFlush = 0;
    // Remove pill
    var pill = document.getElementById('bookReadingTimerPill');
    if (pill) pill.remove();
  }

  function renderReadingStats(container) {
    var today = new Date();
    var todayKey = _readingTimerDateKey(today);
    var todayStored = 0;
    try {
      todayStored = parseInt(localStorage.getItem(todayKey) || '0', 10) || 0;
    } catch (_e) { /* ignore */ }
    var todayTotal = todayStored + (_readingTimerSeconds - _readingTimerLastFlush);
    var todayDisplay = formatReadingTime(todayTotal);

    // Build last 7 days data
    var days = [];
    var weekTotal = 0;
    var streak = 0;
    var streakBroken = false;
    for (var i = 6; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var yyyy = d.getFullYear();
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      var dateStr = yyyy + '-' + mm + '-' + dd;
      var secs = i === 0 ? todayTotal : getReadingTimeForDate(dateStr);
      var dayLabel = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()];
      days.push({ secs: secs, label: dayLabel });
      weekTotal += secs;
    }

    // Streak: count consecutive days backwards from today with > 0
    for (var j = 6; j >= 0; j--) {
      if (!streakBroken && days[j].secs > 0) {
        streak += 1;
      } else {
        streakBroken = true;
      }
    }

    // Max secs for bar scaling
    var maxSecs = 0;
    for (var k = 0; k < days.length; k++) {
      if (days[k].secs > maxSecs) maxSecs = days[k].secs;
    }

    var barsHtml = days.map(function (day) {
      var pct = maxSecs > 0 ? Math.round((day.secs / maxSecs) * 100) : 0;
      if (pct < 2 && day.secs > 0) pct = 2; // ensure minimum visible height for days with activity
      return '<div style="display:flex;flex-direction:column;align-items:center;flex:1;">' +
        '<div class="st-reading-bar" style="height:' + pct + '%;"></div>' +
        '<div class="st-reading-bar-label">' + day.label + '</div>' +
        '</div>';
    }).join('');

    container.innerHTML =
      '<div class="st-rh-section-header">📊 Reading Stats</div>' +
      '<div class="st-reading-stats">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<span style="font-size:12px;color:rgba(255,255,255,0.6);">Today</span>' +
          '<span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);">' + todayDisplay + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
          '<span style="font-size:12px;color:rgba(255,255,255,0.6);">This week</span>' +
          '<span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);">' + formatReadingTime(weekTotal) + '</span>' +
        '</div>' +
        (streak > 0 ? '<div class="st-reading-streak" style="margin-bottom:10px;">🔥 ' + streak + '-day streak</div>' : '') +
        '<div class="st-reading-bar-chart">' + barsHtml + '</div>' +
      '</div>';
  }

  function populateTtsSettingsPopover(container) {
    const rateSlider = container.querySelector('#bookTtsRate');
    const rateVal = container.querySelector('#bookTtsRateVal');
    const voiceSelect = container.querySelector('#bookTtsVoice');
    if (!rateSlider || !voiceSelect) return;

    // Restore saved rate
    const savedRate = localStorage.getItem('rc_book_tts_rate') || String(DEFAULT_TTS_RATE);
    rateSlider.value = savedRate;
    if (rateVal) rateVal.textContent = parseFloat(savedRate).toFixed(2) + '×';

    rateSlider.oninput = function () {
      const v = parseFloat(rateSlider.value).toFixed(2);
      if (rateVal) rateVal.textContent = v + '×';
      localStorage.setItem('rc_book_tts_rate', v);
    };

    // Populate OpenAI voice list
    const openAiVoices = [
      { value: 'nova',    label: 'Nova (warm, natural female)' },
      { value: 'alloy',   label: 'Alloy (neutral, balanced)' },
      { value: 'echo',    label: 'Echo (male, warm)' },
      { value: 'fable',   label: 'Fable (British, expressive)' },
      { value: 'onyx',    label: 'Onyx (deep male)' },
      { value: 'shimmer', label: 'Shimmer (bright female)' },
    ];
    const savedVoice = localStorage.getItem('rc_book_tts_voice') || 'nova';
    voiceSelect.innerHTML = '';
    for (const v of openAiVoices) {
      const opt = document.createElement('option');
      opt.value = v.value;
      opt.textContent = v.label;
      if (v.value === savedVoice) opt.selected = true;
      voiceSelect.appendChild(opt);
    }
    voiceSelect.onchange = function () {
      localStorage.setItem('rc_book_tts_voice', voiceSelect.value);
    };
  }

  function toggleBookTts() {
    if (bookTtsActive) {
      stopBookTts();
    } else {
      startBookTts();
    }
  }

  function startBookTts() {
    const state = bookReaderState;
    if (!state) return;

    const content = document.getElementById('bookContent');
    if (!content) return;

    const allWordSpans = Array.from(content.querySelectorAll('.st-book-word'));
    if (!allWordSpans.length) {
      // Page content not yet rendered (chunk still loading) — inform the user
      showToast('⏳ Page is still loading. Please try again in a moment.');
      return;
    }

    // Stop any currently playing audio and clear state
    if (bookTtsAudio) {
      bookTtsAudio.pause();
      bookTtsAudio = null;
    }
    if (bookTtsAudioUrl) {
      URL.revokeObjectURL(bookTtsAudioUrl);
      bookTtsAudioUrl = null;
    }
    if (bookTtsTimeout) { clearTimeout(bookTtsTimeout); bookTtsTimeout = null; }
    bookTtsActive = false;
    bookTtsPaused = false;
    document.querySelectorAll('.st-book-word.tts-active, .st-book-word.tts-read').forEach(function (el) {
      el.classList.remove('tts-active');
      el.classList.remove('tts-read');
    });

    // Build per-paragraph data: text, wordOffset (start of this para in allWordSpans), spanCount
    const paragraphEls = Array.from(content.querySelectorAll('p, h3.st-book-subheading'));
    const paraData = [];
    let globalOffset = 0;
    for (const p of paragraphEls) {
      const spans = Array.from(p.querySelectorAll('.st-book-word'));
      if (!spans.length) continue;
      const text = spans.map(function (s) { return s.textContent; }).join(' ');
      paraData.push({ text, wordOffset: globalOffset, spanCount: spans.length });
      globalOffset += spans.length;
    }
    if (!paraData.length) return;

    const rate = parseFloat(localStorage.getItem('rc_book_tts_rate') || String(DEFAULT_TTS_RATE));
    const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const rawVoice = localStorage.getItem('rc_book_tts_voice') || 'nova';
    const isValidVoice = OPENAI_VOICES.includes(rawVoice);
    const savedVoiceName = isValidVoice ? rawVoice : 'nova';
    if (!isValidVoice) {
      localStorage.setItem('rc_book_tts_voice', 'nova');
    }

    bookTtsActive = true;
    bookTtsPaused = false;

    const ttsBtn = document.getElementById('bookTtsBtn');
    const ttsControls = document.getElementById('bookTtsControls');
    if (ttsBtn) ttsBtn.classList.add('tts-active');
    if (ttsControls) ttsControls.style.display = 'flex';

    let lastHighlightedSpan = null;

    // ---- Sentence-mode inner function ----
    function speakSentence(paraIdx, sentIdx, sentences, sentenceSpanRanges) {
      if (!bookTtsActive || sentIdx >= sentences.length) {
        // All sentences in this paragraph done — proceed to next paragraph
        document.querySelectorAll('.st-book-sentence-active').forEach(function (el) {
          el.classList.remove('st-book-sentence-active');
        });
        bookTtsTimeout = setTimeout(function () {
          speakPara(paraIdx + 1);
        }, 100);
        return;
      }

      var sentText = sentences[sentIdx];
      var sentWordOffset = sentenceSpanRanges[sentIdx].offset;
      var sentSpanCount = sentenceSpanRanges[sentIdx].count;

      // Track last spoken chunk for replay
      _lastSpokenText = sentText;
      _lastSpokenType = 'sentence';
      _lastSpokenWordOffset = sentWordOffset;
      _lastSpokenSpanCount = sentSpanCount;
      updateReplayBtn();

      // Highlight current sentence spans
      document.querySelectorAll('.st-book-sentence-active').forEach(function (el) {
        el.classList.remove('st-book-sentence-active');
      });
      for (var wi = sentWordOffset; wi < sentWordOffset + sentSpanCount; wi++) {
        var sentSpan = allWordSpans[wi];
        if (sentSpan) sentSpan.classList.add('st-book-sentence-active');
      }

      fetch('/.netlify/functions/student-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentText, voice: savedVoiceName, speed: rate }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!bookTtsActive) return;

          if (!data.ok || !data.audio) {
            console.warn(LOG_PREFIX, 'TTS API error for sentence', sentIdx, data.error);
            speakSentence(paraIdx, sentIdx + 1, sentences, sentenceSpanRanges);
            return;
          }

          const binaryStr = atob(data.audio);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'audio/mpeg' });

          if (bookTtsAudioUrl) URL.revokeObjectURL(bookTtsAudioUrl);
          bookTtsAudioUrl = URL.createObjectURL(blob);

          const audio = new Audio(bookTtsAudioUrl);
          bookTtsAudio = audio;

          // Word highlighting scoped to this sentence's spans
          audio.ontimeupdate = function () {
            if (!audio.duration || !sentSpanCount) return;
            const wordDuration = audio.duration / sentSpanCount;
            const currentWordIdx = Math.min(
              Math.floor(audio.currentTime / wordDuration),
              sentSpanCount - 1
            );
            const span = allWordSpans[sentWordOffset + currentWordIdx];
            if (span && span !== lastHighlightedSpan) {
              if (lastHighlightedSpan) {
                lastHighlightedSpan.classList.remove('tts-active');
                lastHighlightedSpan.classList.add('tts-read');
              }
              span.classList.add('tts-active');
              lastHighlightedSpan = span;
              span.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
          };

          audio.onended = function () {
            if (!bookTtsActive) return;
            if (sentIdx >= sentences.length - 1) {
              // Last sentence — clear sentence highlight and proceed to next paragraph
              document.querySelectorAll('.st-book-sentence-active').forEach(function (el) {
                el.classList.remove('st-book-sentence-active');
              });
              bookTtsTimeout = setTimeout(function () {
                speakPara(paraIdx + 1);
              }, 100);
            } else {
              // Show "▶ Next Sentence" button and wait for student to advance
              var nextSentBtn = document.getElementById('bookTtsNextSentence');
              if (nextSentBtn) nextSentBtn.classList.add('visible');
              bookTtsNextSentenceCallback = function () {
                var btn = document.getElementById('bookTtsNextSentence');
                if (btn) btn.classList.remove('visible');
                bookTtsNextSentenceCallback = null;
                speakSentence(paraIdx, sentIdx + 1, sentences, sentenceSpanRanges);
              };
            }
          };

          audio.onerror = function () {
            if (!bookTtsActive) return;
            console.warn(LOG_PREFIX, 'Audio playback error for sentence', sentIdx);
            speakSentence(paraIdx, sentIdx + 1, sentences, sentenceSpanRanges);
          };

          // Highlight first word of sentence immediately as a visual cue
          var firstSentSpan = allWordSpans[sentWordOffset];
          if (firstSentSpan) {
            if (lastHighlightedSpan) {
              lastHighlightedSpan.classList.remove('tts-active');
              lastHighlightedSpan.classList.add('tts-read');
            }
            firstSentSpan.classList.add('tts-active');
            lastHighlightedSpan = firstSentSpan;
            firstSentSpan.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }

          audio.play().catch(function (err) {
            console.warn(LOG_PREFIX, 'Audio play() failed:', err);
            showToast('⚠️ Audio unavailable. Please try again.', 'error');
            bookTtsActive = false;
            bookTtsPaused = false;
            if (ttsBtn) ttsBtn.classList.remove('tts-active');
            if (ttsControls) ttsControls.style.display = 'none';
          });
        })
        .catch(function (err) {
          if (!bookTtsActive) return;
          console.warn(LOG_PREFIX, 'TTS fetch failed:', err);
          showToast('⚠️ Could not load audio. Check your connection.', 'error');
          bookTtsActive = false;
          bookTtsPaused = false;
          if (ttsBtn) ttsBtn.classList.remove('tts-active');
          if (ttsControls) ttsControls.style.display = 'none';
        });
    }

    function speakPara(idx) {
      if (!bookTtsActive || idx >= paraData.length) {
        // All paragraphs done (or TTS was manually stopped)
        if (lastHighlightedSpan) {
          lastHighlightedSpan.classList.remove('tts-active');
          lastHighlightedSpan.classList.add('tts-read');
        }
        // Auto-advance only when page finished naturally (not manually stopped)
        const pageFinished = bookTtsActive && idx >= paraData.length;
        if (pageFinished && state && state.currentPage < state.bookData.totalPages) {
          // Check if the next page starts a new chapter
          const chapters = (state.bookData.chapters && state.bookData.chapters.length > 0) ? state.bookData.chapters : null;
          const nextPage = state.currentPage + 1;
          let isChapterBoundary = false;
          let nextChapterLabel = '';
          if (chapters) {
            // Check if the next page starts a new chapter
            for (let ci = 0; ci < chapters.length; ci++) {
              if (chapters[ci].startPage === nextPage) {
                isChapterBoundary = true;
                nextChapterLabel = chapters[ci].label || ('Chapter ' + (ci + 1));
                break;
              }
            }
          }

          if (isChapterBoundary) {
            // Pause TTS and prompt user to continue to next chapter
            bookTtsActive = false;
            bookTtsPaused = false;
            if (ttsBtn) ttsBtn.classList.remove('tts-active');
            if (ttsControls) ttsControls.style.display = 'none';

            // Find the current chapter object (the chapter that just ended)
            let currentChapter = null;
            if (chapters) {
              for (let ci = chapters.length - 1; ci >= 0; ci--) {
                if (chapters[ci].startPage <= state.currentPage) {
                  currentChapter = chapters[ci];
                  break;
                }
              }
            }

            // Comprehension check: show before chapter-complete dialog if enabled
            const comprCheckPromise = (
              getBookHelper('comprehension') &&
              currentChapter &&
              !_comprehensionCheckedChapters.has(currentChapter.startPage)
            )
              ? showComprehensionCheck(currentChapter, state.bookData)
              : Promise.resolve();

            // 60-second auto-stop timeout (starts after any comprehension check)
            let chapterPromptTimeout = null;

            comprCheckPromise.then(function () {
              chapterPromptTimeout = setTimeout(function () {
                stopBookTts();
              }, 60000);

              return rcConfirm(
                '📖 Chapter Complete!',
                'Continue to: ' + nextChapterLabel + '?',
                'Continue Reading'
              );
            }).then(function (confirmed) {
              if (chapterPromptTimeout) clearTimeout(chapterPromptTimeout);
              if (confirmed) {
                state.currentPage = nextPage;
                const nextChunk = findChunkForPage(state.bookData, state.currentPage);
                if (nextChunk && !_bookChunkCache.has(nextChunk.id)) {
                  fetchBookChunk(nextChunk.id).then(function () {
                    renderBookPage();
                    startBookTts();
                  });
                } else {
                  renderBookPage();
                  setTimeout(startBookTts, 150);
                }
              } else {
                stopBookTts();
              }
            });
          } else {
            state.currentPage++;
            const nextChunk = findChunkForPage(state.bookData, state.currentPage);
            if (nextChunk && !_bookChunkCache.has(nextChunk.id)) {
              // Chunk not cached — clear TTS UI while chunk loads, restart after
              bookTtsActive = false;
              bookTtsPaused = false;
              if (ttsBtn) ttsBtn.classList.remove('tts-active');
              if (ttsControls) ttsControls.style.display = 'none';
              fetchBookChunk(nextChunk.id).then(function () {
                renderBookPage();
                startBookTts();
              });
            } else {
              // Chunk already cached — keep TTS UI active for seamless page transition
              bookTtsPaused = false;
              renderBookPage();
              setTimeout(startBookTts, 150);
            }
          }
        } else if (pageFinished && state && state.currentPage >= state.bookData.totalPages) {
          // Reached the end of the book — prompt user (handles books with no chapters too)
          bookTtsActive = false;
          bookTtsPaused = false;
          if (ttsBtn) ttsBtn.classList.remove('tts-active');
          if (ttsControls) ttsControls.style.display = 'none';
          showToast('📖 You have reached the end of the book!');
        } else {
          // Truly done or manually stopped — clear all TTS state
          bookTtsActive = false;
          bookTtsPaused = false;
          if (ttsBtn) ttsBtn.classList.remove('tts-active');
          if (ttsControls) ttsControls.style.display = 'none';
        }
        return;
      }

      const { text, wordOffset, spanCount } = paraData[idx];

      // Show loading indicator on first paragraph only
      if (idx === 0) showToast('🔊 Loading audio...');

      // Sentence mode: split paragraph into sentences and speak one at a time
      if (getBookHelper('sentence_mode')) {
        var sentences = splitIntoSentences(text);
        if (sentences.length > 1) {
          // Map each sentence to its corresponding word spans within this paragraph
          var sentenceSpanRanges = [];
          var spanCursor = wordOffset;
          for (var si = 0; si < sentences.length; si++) {
            var sentWordCount = sentences[si].split(/\s+/).filter(function (w) { return w.length > 0; }).length;
            var remaining = wordOffset + spanCount - spanCursor;
            var actualCount = (si === sentences.length - 1) ? remaining : Math.min(sentWordCount, remaining);
            sentenceSpanRanges.push({ offset: spanCursor, count: Math.max(0, actualCount) });
            spanCursor += actualCount;
          }
          speakSentence(idx, 0, sentences, sentenceSpanRanges);
          return;
        }
      }

      // Track last spoken chunk for replay
      _lastSpokenText = text;
      _lastSpokenType = 'paragraph';
      _lastSpokenWordOffset = wordOffset;
      _lastSpokenSpanCount = spanCount;
      updateReplayBtn();

      fetch('/.netlify/functions/student-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, voice: savedVoiceName, speed: rate }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!bookTtsActive) return; // user stopped while we were loading

          if (!data.ok || !data.audio) {
            console.warn(LOG_PREFIX, 'TTS API error for paragraph', idx, data.error);
            showToast('⚠️ Audio unavailable. Please try again.', 'error');
            bookTtsActive = false;
            bookTtsPaused = false;
            if (ttsBtn) ttsBtn.classList.remove('tts-active');
            if (ttsControls) ttsControls.style.display = 'none';
            return;
          }

          // Decode base64 audio and create playable object URL
          const binaryStr = atob(data.audio);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'audio/mpeg' });

          // Clean up previous URL
          if (bookTtsAudioUrl) URL.revokeObjectURL(bookTtsAudioUrl);
          bookTtsAudioUrl = URL.createObjectURL(blob);

          const audio = new Audio(bookTtsAudioUrl);
          bookTtsAudio = audio;

          // Word highlighting via timeupdate
          audio.ontimeupdate = function () {
            if (!audio.duration || !spanCount) return;
            const wordDuration = audio.duration / spanCount;
            const currentWordIdx = Math.min(
              Math.floor(audio.currentTime / wordDuration),
              spanCount - 1
            );
            const span = allWordSpans[wordOffset + currentWordIdx];
            if (span && span !== lastHighlightedSpan) {
              if (lastHighlightedSpan) {
                lastHighlightedSpan.classList.remove('tts-active');
                lastHighlightedSpan.classList.add('tts-read');
              }
              span.classList.add('tts-active');
              lastHighlightedSpan = span;
              span.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
          };

          audio.onended = function () {
            if (!bookTtsActive) return;
            // 100ms natural pause between paragraphs
            bookTtsTimeout = setTimeout(function () {
              speakPara(idx + 1);
            }, 100);
          };

          audio.onerror = function () {
            if (!bookTtsActive) return;
            console.warn(LOG_PREFIX, 'Audio playback error for paragraph', idx);
            // Try next paragraph on error
            bookTtsTimeout = setTimeout(function () {
              speakPara(idx + 1);
            }, 100);
          };

          // Highlight first word immediately as a visual cue
          var firstSpan = allWordSpans[wordOffset];
          if (firstSpan) {
            if (lastHighlightedSpan) {
              lastHighlightedSpan.classList.remove('tts-active');
              lastHighlightedSpan.classList.add('tts-read');
            }
            firstSpan.classList.add('tts-active');
            lastHighlightedSpan = firstSpan;
            firstSpan.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }

          audio.play().catch(function (err) {
            console.warn(LOG_PREFIX, 'Audio play() failed:', err);
            showToast('⚠️ Audio unavailable. Please try again.', 'error');
            bookTtsActive = false;
            bookTtsPaused = false;
            if (ttsBtn) ttsBtn.classList.remove('tts-active');
            if (ttsControls) ttsControls.style.display = 'none';
          });
        })
        .catch(function (err) {
          if (!bookTtsActive) return;
          console.warn(LOG_PREFIX, 'TTS fetch failed:', err);
          showToast('⚠️ Could not load audio. Check your connection.', 'error');
          bookTtsActive = false;
          bookTtsPaused = false;
          if (ttsBtn) ttsBtn.classList.remove('tts-active');
          if (ttsControls) ttsControls.style.display = 'none';
        });
    }

    speakPara(0);

    // Register Media Session API handlers for Bluetooth headphone button support
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: (state.bookData && state.bookData.title) ? state.bookData.title : 'Book Reader',
        artist: 'Read Aloud',
        album: 'Reinisch Classroom'
      });
      navigator.mediaSession.setActionHandler('play', function () { pauseResumeBookTts(); });
      navigator.mediaSession.setActionHandler('pause', function () { pauseResumeBookTts(); });
      navigator.mediaSession.setActionHandler('stop', function () { stopBookTts(); });
    }
  }

  function pauseResumeBookTts() {
    const pauseBtn = document.getElementById('bookTtsPause');
    if (bookTtsPaused) {
      if (bookTtsAudio) bookTtsAudio.play().catch(function (err) {
        console.warn(LOG_PREFIX, 'Audio resume failed:', err);
      });
      bookTtsPaused = false;
      if (pauseBtn) pauseBtn.textContent = '⏸ Pause';
    } else {
      if (bookTtsAudio) bookTtsAudio.pause();
      bookTtsPaused = true;
      if (pauseBtn) pauseBtn.textContent = '▶ Resume';
    }
  }

  function stopBookTts() {
    if (bookTtsAudio) {
      bookTtsAudio.pause();
      bookTtsAudio.ontimeupdate = null;
      bookTtsAudio.onended = null;
      bookTtsAudio.onerror = null;
      bookTtsAudio = null;
    }
    if (bookTtsAudioUrl) {
      URL.revokeObjectURL(bookTtsAudioUrl);
      bookTtsAudioUrl = null;
    }
    if (bookTtsTimeout) { clearTimeout(bookTtsTimeout); bookTtsTimeout = null; }
    bookTtsActive = false;
    bookTtsPaused = false;
    bookTtsNextSentenceCallback = null;

    const ttsBtn = document.getElementById('bookTtsBtn');
    const ttsControls = document.getElementById('bookTtsControls');
    const pauseBtn = document.getElementById('bookTtsPause');
    const nextSentBtn = document.getElementById('bookTtsNextSentence');
    if (ttsBtn) ttsBtn.classList.remove('tts-active');
    if (ttsControls) ttsControls.style.display = 'none';
    if (pauseBtn) pauseBtn.textContent = '⏸ Pause';
    if (nextSentBtn) nextSentBtn.classList.remove('visible');

    // Remove any active/read word highlights
    document.querySelectorAll('.st-book-word.tts-active, .st-book-word.tts-read').forEach(function (el) {
      el.classList.remove('tts-active');
      el.classList.remove('tts-read');
    });
    document.querySelectorAll('.st-book-sentence-active').forEach(function (el) {
      el.classList.remove('st-book-sentence-active');
    });

    // Clear Media Session API handlers
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
    }
  }

  function updateReplayBtn() {
    var btn = document.getElementById('bookTtsReplayBtn');
    if (btn) btn.disabled = !_lastSpokenText;
  }

  function replayLastSpoken() {
    if (!_lastSpokenText) return;

    // Stop any current playback
    stopBookTts();

    const content = document.getElementById('bookContent');
    if (!content) return;
    const allWordSpans = Array.from(content.querySelectorAll('.st-book-word'));

    const rate = parseFloat(localStorage.getItem('rc_book_tts_rate') || String(DEFAULT_TTS_RATE));
    const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const rawVoice = localStorage.getItem('rc_book_tts_voice') || 'nova';
    const savedVoiceName = OPENAI_VOICES.includes(rawVoice) ? rawVoice : 'nova';

    const replayBtn = document.getElementById('bookTtsReplayBtn');
    if (replayBtn) {
      replayBtn.classList.add('replaying');
      setTimeout(function () { replayBtn.classList.remove('replaying'); }, 1300);
    }

    const ttsBtn = document.getElementById('bookTtsBtn');
    const ttsControls = document.getElementById('bookTtsControls');
    bookTtsActive = true;
    bookTtsPaused = false;
    if (ttsBtn) ttsBtn.classList.add('tts-active');
    if (ttsControls) ttsControls.style.display = 'flex';

    const replayText = _lastSpokenText;
    const wordOffset = _lastSpokenWordOffset;
    const spanCount = _lastSpokenSpanCount;
    let lastHighlightedSpan = null;

    fetch('/.netlify/functions/student-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: replayText, voice: savedVoiceName, speed: rate }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!bookTtsActive) return;

        if (!data.ok || !data.audio) {
          console.warn(LOG_PREFIX, 'Replay TTS API error', data.error);
          showToast('⚠️ Could not replay audio. Try again.', 'error');
          bookTtsActive = false;
          bookTtsPaused = false;
          if (ttsBtn) ttsBtn.classList.remove('tts-active');
          if (ttsControls) ttsControls.style.display = 'none';
          return;
        }

        const binaryStr = atob(data.audio);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/mpeg' });

        if (bookTtsAudioUrl) URL.revokeObjectURL(bookTtsAudioUrl);
        bookTtsAudioUrl = URL.createObjectURL(blob);

        const audio = new Audio(bookTtsAudioUrl);
        bookTtsAudio = audio;

        audio.ontimeupdate = function () {
          if (!audio.duration || !spanCount) return;
          const wordDuration = audio.duration / spanCount;
          const currentWordIdx = Math.min(Math.floor(audio.currentTime / wordDuration), spanCount - 1);
          const span = allWordSpans[wordOffset + currentWordIdx];
          if (span && span !== lastHighlightedSpan) {
            if (lastHighlightedSpan) {
              lastHighlightedSpan.classList.remove('tts-active');
              lastHighlightedSpan.classList.add('tts-read');
            }
            span.classList.add('tts-active');
            lastHighlightedSpan = span;
            span.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        };

        audio.onended = function () {
          if (lastHighlightedSpan) {
            lastHighlightedSpan.classList.remove('tts-active');
            lastHighlightedSpan.classList.add('tts-read');
          }
          bookTtsActive = false;
          bookTtsPaused = false;
          if (ttsBtn) ttsBtn.classList.remove('tts-active');
          if (ttsControls) ttsControls.style.display = 'none';
          document.querySelectorAll('.st-book-word.tts-active, .st-book-word.tts-read').forEach(function (el) {
            el.classList.remove('tts-active');
            el.classList.remove('tts-read');
          });
        };

        audio.onerror = function () {
          if (!bookTtsActive) return;
          console.warn(LOG_PREFIX, 'Replay audio playback error');
          bookTtsActive = false;
          bookTtsPaused = false;
          if (ttsBtn) ttsBtn.classList.remove('tts-active');
          if (ttsControls) ttsControls.style.display = 'none';
        };

        var firstSpan = allWordSpans[wordOffset];
        if (firstSpan) {
          firstSpan.classList.add('tts-active');
          lastHighlightedSpan = firstSpan;
          firstSpan.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }

        audio.play().catch(function (err) {
          console.warn(LOG_PREFIX, 'Replay audio play() failed:', err);
          showToast('⚠️ Audio unavailable. Please try again.', 'error');
          bookTtsActive = false;
          bookTtsPaused = false;
          if (ttsBtn) ttsBtn.classList.remove('tts-active');
          if (ttsControls) ttsControls.style.display = 'none';
        });
      })
      .catch(function (err) {
        if (!bookTtsActive) return;
        console.warn(LOG_PREFIX, 'Replay TTS fetch failed:', err);
        showToast('⚠️ Could not load audio. Check your connection.', 'error');
        bookTtsActive = false;
        bookTtsPaused = false;
        if (ttsBtn) ttsBtn.classList.remove('tts-active');
        if (ttsControls) ttsControls.style.display = 'none';
      });
  }

  // ============================================================================
  // Feature: Word lookup popup
  // ============================================================================

  const WORD_PREFIXES = {
    'un': 'not', 're': 'again', 'pre': 'before', 'dis': 'not/opposite',
    'mis': 'wrongly', 'over': 'too much', 'under': 'too little', 'out': 'surpassing',
    'inter': 'between', 'trans': 'across', 'super': 'above', 'semi': 'half',
    'anti': 'against', 'non': 'not', 'multi': 'many', 'bi': 'two', 'tri': 'three'
  };
  const WORD_SUFFIXES = {
    'ing': 'action/process', 'tion': 'state/action', 'sion': 'state/action',
    'ment': 'result/state', 'ness': 'state/quality', 'able': 'capable of',
    'ible': 'capable of', 'ful': 'full of', 'less': 'without', 'ous': 'having quality of',
    'ive': 'tending to', 'al': 'relating to', 'ly': 'in a manner', 'er': 'one who/more',
    'est': 'most', 'ed': 'past tense', 'en': 'made of/cause to', 'ize': 'to make',
    'ify': 'to make'
  };

  function analyzeWordMorphology(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    const found = { prefixes: [], suffixes: [] };
    // Check prefixes (longest match first)
    const prefixKeys = Object.keys(WORD_PREFIXES).sort((a, b) => b.length - a.length);
    for (const p of prefixKeys) {
      if (w.startsWith(p) && w.length > p.length + 2) {
        found.prefixes.push({ affix: p + '-', meaning: WORD_PREFIXES[p] });
        break; // one prefix at a time
      }
    }
    // Check suffixes (longest match first)
    const suffixKeys = Object.keys(WORD_SUFFIXES).sort((a, b) => b.length - a.length);
    for (const s of suffixKeys) {
      if (w.endsWith(s) && w.length > s.length + 2) {
        found.suffixes.push({ affix: '-' + s, meaning: WORD_SUFFIXES[s] });
        break; // one suffix at a time
      }
    }
    return found;
  }

  async function fetchWordDefinition(word) {
    const key = word.toLowerCase();
    if (_wordDefCache.has(key)) return _wordDefCache.get(key);
    try {
      const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(key));
      if (!r.ok) { _wordDefCache.set(key, null); return null; }
      const data = await r.json();
      _wordDefCache.set(key, data);
      return data;
    } catch (e) {
      _wordDefCache.set(key, null);
      return null;
    }
  }

  function closeWordPopup() {
    const existing = document.getElementById('bookWordPopup');
    if (existing) existing.remove();
  }

  async function showWordPopup(cleanWord, displayWord, clientX, clientY, wordEl) {
    closeWordPopup();

    // Track this word lookup in My Words
    trackHeardWord(cleanWord);

    // Check if word is highlighted — offer remove option
    const isHighlighted = wordEl.classList.contains('st-book-word-highlighted');

    const popup = document.createElement('div');
    popup.id = 'bookWordPopup';
    popup.className = 'st-word-popup-card';

    // Initial loading state
    const morph = analyzeWordMorphology(cleanWord);
    const glossaryDef = _bookGlossaryMap ? _bookGlossaryMap.get(cleanWord.toLowerCase()) : null;

    popup.innerHTML = `
      <div class="st-word-popup-header">
        <span class="st-word-popup-word">${escapeHtml(displayWord)}</span>
        <button class="st-word-popup-close" aria-label="Close">✕</button>
      </div>
      <div class="st-word-popup-body">
        <div class="st-word-popup-spinner" id="wordPopupSpinner">Looking up...</div>
        <div id="wordPopupContent" style="display:none;"></div>
        ${morph.prefixes.length || morph.suffixes.length ? `
          <div class="st-word-popup-morphology">
            ${morph.prefixes.map(p => `<span class="st-word-popup-badge st-word-popup-badge-prefix">Prefix: ${escapeHtml(p.affix)} <em>(${escapeHtml(p.meaning)})</em></span>`).join('')}
            ${morph.suffixes.map(s => `<span class="st-word-popup-badge st-word-popup-badge-suffix">Suffix: ${escapeHtml(s.affix)} <em>(${escapeHtml(s.meaning)})</em></span>`).join('')}
          </div>` : ''}
        ${glossaryDef ? `<div class="st-word-popup-glossary"><strong>📚 Glossary:</strong> ${escapeHtml(glossaryDef)}</div>` : ''}
        <div class="st-word-popup-actions">
          <button class="st-word-popup-readit" id="wordPopupReadIt">🔊 Read it</button>
          ${isHighlighted ? `<button class="st-word-popup-remove-hl" id="wordPopupRemoveHl">Remove highlight</button>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(popup);

    // Position popup near click, clamped to viewport
    const pw = popup.offsetWidth || 320;
    const ph = popup.offsetHeight || 280;
    let left = clientX + 10;
    let top = clientY + 10;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    // Close button — also removes the outside-click listener
    function onOutsideClick(e) {
      if (!popup.contains(e.target)) { closeWordPopup(); document.removeEventListener('click', onOutsideClick); }
    }
    popup.querySelector('.st-word-popup-close').addEventListener('click', function () {
      document.removeEventListener('click', onOutsideClick);
      closeWordPopup();
    });

    // Close on outside click
    setTimeout(function () { document.addEventListener('click', onOutsideClick); }, 50);

    // Read it button
    const readItBtn = popup.querySelector('#wordPopupReadIt');
    if (readItBtn) {
      readItBtn.addEventListener('click', function () {
        if (!window.speechSynthesis) return;
        const utt = new SpeechSynthesisUtterance(cleanWord);
        utt.rate = 0.75;
        utt.onend = function () { readItBtn.textContent = '🔊 Read it'; };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utt);
        readItBtn.textContent = '🔊 Playing...';
      });
    }

    // Remove highlight button
    const removeHlBtn = popup.querySelector('#wordPopupRemoveHl');
    if (removeHlBtn) {
      removeHlBtn.addEventListener('click', function () {
        const widx = parseInt(wordEl.getAttribute('data-word-idx'), 10);
        removeHighlightContaining(widx);
        closeWordPopup();
      });
    }

    // Fetch definition asynchronously
    const data = await fetchWordDefinition(cleanWord);
    const spinner = document.getElementById('wordPopupSpinner');
    const contentEl = document.getElementById('wordPopupContent');
    if (!spinner || !contentEl) return; // popup was closed

    spinner.style.display = 'none';
    contentEl.style.display = 'block';

    if (!data || !Array.isArray(data) || !data[0]) {
      contentEl.innerHTML = '<div class="st-word-popup-no-result">No definition found.</div>';
      return;
    }

    const entry = data[0];
    const phoneticsMatch = entry.phonetics && entry.phonetics.find(p => p.text);
    const phonetic = entry.phonetic || (phoneticsMatch && phoneticsMatch.text) || '';
    const meanings = (entry.meanings || []).slice(0, 2);

    let defHtml = '';
    if (phonetic) defHtml += `<div class="st-word-popup-phonetic">${escapeHtml(phonetic)}</div>`;
    for (const m of meanings) {
      defHtml += `<div class="st-word-popup-pos">${escapeHtml(m.partOfSpeech || '')}</div>`;
      const defs = (m.definitions || []).slice(0, 2);
      for (const d of defs) {
        defHtml += `<div class="st-word-popup-def">${escapeHtml(d.definition || '')}</div>`;
      }
    }
    contentEl.innerHTML = defHtml || '<div class="st-word-popup-no-result">No definition found.</div>';

    // Re-position after content fills in
    const newPh = popup.offsetHeight;
    let newTop = clientY + 10;
    if (newTop + newPh > window.innerHeight - 8) newTop = window.innerHeight - newPh - 8;
    if (newTop < 8) newTop = 8;
    popup.style.top = newTop + 'px';
  }

  // ============================================================================
  // Feature: Glossary
  // ============================================================================

  function buildGlossaryMap(bookData) {
    if (!Array.isArray(bookData.glossary) || !bookData.glossary.length) return null;
    const map = new Map();
    for (const entry of bookData.glossary) {
      if (entry.term) map.set(entry.term.toLowerCase(), entry.definition || '');
    }
    return map.size ? map : null;
  }

  function applyGlossaryTerms(content) {
    if (!_bookGlossaryMap || !_bookGlossaryMap.size) return;
    content.querySelectorAll('.st-book-word').forEach(function (span) {
      const w = span.textContent.toLowerCase().replace(/[^a-z'-]/g, '');
      if (_bookGlossaryMap.has(w)) {
        span.classList.add('st-book-word-glossary');
        span.title = _bookGlossaryMap.get(w);
      }
    });
  }

  function showGlossaryPanel() {
    const existing = document.getElementById('bookGlossaryModal');
    if (existing) { existing.remove(); return; }

    const state = bookReaderState;
    if (!state || !Array.isArray(state.bookData.glossary)) return;
    const entries = state.bookData.glossary;

    const modal = document.createElement('div');
    modal.id = 'bookGlossaryModal';
    modal.className = 'st-glossary-panel';
    modal.innerHTML = `
      <div class="st-glossary-header">
        <span class="st-glossary-title">📚 Glossary</span>
        <input class="st-glossary-search" id="glossarySearch" type="text" placeholder="Search terms..." aria-label="Search glossary"/>
        <button class="st-glossary-close" id="glossaryClose" aria-label="Close glossary">✕</button>
      </div>
      <div class="st-glossary-list" id="glossaryList"></div>
    `;
    document.body.appendChild(modal);

    function renderGlossaryList(filter) {
      const list = modal.querySelector('#glossaryList');
      const f = (filter || '').toLowerCase();
      const filtered = entries.filter(e => !f || e.term.toLowerCase().includes(f) || (e.definition || '').toLowerCase().includes(f));
      if (!filtered.length) { list.innerHTML = '<div class="st-glossary-empty">No matching terms.</div>'; return; }
      list.innerHTML = filtered.map(e => `<div class="st-glossary-entry"><div class="st-glossary-term">${escapeHtml(e.term)}</div><div class="st-glossary-def">${escapeHtml(e.definition || '')}</div></div>`).join('');
    }
    renderGlossaryList('');

    modal.querySelector('#glossaryClose').addEventListener('click', function () { modal.remove(); });
    modal.querySelector('#glossarySearch').addEventListener('input', function (e) { renderGlossaryList(e.target.value); });

    // Close on outside click
    function onOutside(e) { if (!modal.contains(e.target)) { modal.remove(); document.removeEventListener('click', onOutside); } }
    setTimeout(function () { document.addEventListener('click', onOutside); }, 50);
  }

  // ============================================================================
  // Feature: My Words panel (Word Tracker)
  // ============================================================================

  function showMyWordsPanel() {
    // Toggle: if already open, close it (use stored closePanel if available)
    const existing = document.getElementById('bookMyWordsPanel');
    if (existing) {
      if (typeof existing._closeMyWordsPanel === 'function') {
        existing._closeMyWordsPanel();
      } else {
        existing.remove();
      }
      return;
    }

    const bookPanel = document.getElementById('bookPanel');
    if (!bookPanel) return;

    const key = 'rc_book_helper_heard_words';

    function getWords() {
      try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
    }

    function saveWords(arr) {
      try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { /* ignore */ }
    }

    function updateBadge(count) {
      const badge = document.getElementById('myWordsBadge');
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
      }
    }

    const panel = document.createElement('div');
    panel.id = 'bookMyWordsPanel';
    panel.className = 'st-mw-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'My Words');

    panel.innerHTML = `
      <div class="st-mw-header">
        <span class="st-mw-title">📝 My Words</span>
        <span class="st-mw-count" id="myWordsPanelCount"></span>
        <input class="st-mw-search" id="myWordsSearch" type="text" placeholder="Search words..." aria-label="Search my words"/>
        <button class="st-mw-close" id="myWordsClose" aria-label="Close My Words">✕</button>
      </div>
      <div class="st-mw-list" id="myWordsList"></div>
      <div class="st-mw-footer">
        <span class="st-mw-footer-count" id="myWordsFooterCount"></span>
        <button class="st-mw-clear-btn" id="myWordsClearAll">🗑️ Clear All</button>
      </div>
    `;

    bookPanel.appendChild(panel);

    function renderWordList(filter) {
      const words = getWords();
      // Reverse to show most recently added first
      const reversed = words.slice().reverse();
      const f = (filter || '').toLowerCase();
      const filtered = f ? reversed.filter(function (w) { return w.includes(f); }) : reversed;

      const count = words.length;
      const countEl = panel.querySelector('#myWordsPanelCount');
      const footerCount = panel.querySelector('#myWordsFooterCount');
      if (countEl) countEl.textContent = '(' + count + ' ' + (count === 1 ? 'word' : 'words') + ')';
      if (footerCount) footerCount.textContent = count + ' ' + (count === 1 ? 'word' : 'words') + ' tracked';
      updateBadge(count);

      const list = panel.querySelector('#myWordsList');
      if (!list) return;

      if (!filtered.length) {
        list.innerHTML = '<div class="st-mw-empty">' + (f ? 'No words match your search.' : 'No words tracked yet. Tap any word while reading to add it here!') + '</div>';
        return;
      }

      list.innerHTML = filtered.map(function (word) {
        // Look up definition: glossary first, then cached dict
        let defHtml = '';
        const glossDef = _bookGlossaryMap ? _bookGlossaryMap.get(word) : null;
        if (glossDef) {
          defHtml = '<div class="st-mw-def">📚 ' + escapeHtml(glossDef) + '</div>';
        } else {
          const dictData = _wordDefCache.get(word);
          if (dictData && Array.isArray(dictData) && dictData[0]) {
            const firstMeaning = dictData[0].meanings && dictData[0].meanings[0];
            const firstDef = firstMeaning && firstMeaning.definitions && firstMeaning.definitions[0];
            if (firstDef && firstDef.definition) {
              defHtml = '<div class="st-mw-def">' + escapeHtml(firstDef.definition) + '</div>';
            }
          }
        }
        return `<div class="st-mw-entry" data-mw-word="${escapeHtml(word)}">
          <div class="st-mw-entry-main">
            <span class="st-mw-word">${escapeHtml(word)}</span>
            <button class="st-mw-hear-btn" data-mw-hear="${escapeHtml(word)}" title="Hear word" aria-label="Hear pronunciation of ${escapeHtml(word)}">🔊</button>
            <button class="st-mw-remove-btn" data-mw-remove="${escapeHtml(word)}" title="Remove from My Words" aria-label="Remove ${escapeHtml(word)} from My Words">❌</button>
          </div>
          ${defHtml}
        </div>`;
      }).join('');
    }

    renderWordList('');

    // Search handler
    panel.querySelector('#myWordsSearch').addEventListener('input', function (e) {
      renderWordList(e.target.value);
    });

    // Close on Escape - store reference for explicit cleanup
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        closePanel();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    function closePanel() {
      document.removeEventListener('keydown', onKeyDown);
      panel.remove();
    }

    // Expose closePanel so external removal (e.g. outside-click) can clean up too
    panel._closeMyWordsPanel = closePanel;

    // Close button
    panel.querySelector('#myWordsClose').addEventListener('click', closePanel);

    // Event delegation for hear/remove buttons
    panel.querySelector('#myWordsList').addEventListener('click', function (e) {
      const hearBtn = e.target.closest('[data-mw-hear]');
      if (hearBtn) {
        const word = hearBtn.getAttribute('data-mw-hear');
        if (word) speakWord(word);
        return;
      }
      const removeBtn = e.target.closest('[data-mw-remove]');
      if (removeBtn) {
        const word = removeBtn.getAttribute('data-mw-remove');
        if (word) {
          const words = getWords().filter(function (w) { return w !== word; });
          saveWords(words);
          const filter = panel.querySelector('#myWordsSearch') ? panel.querySelector('#myWordsSearch').value : '';
          renderWordList(filter);
        }
      }
    });

    // Clear All button
    panel.querySelector('#myWordsClearAll').addEventListener('click', async function () {
      const words = getWords();
      if (!words.length) return;
      const confirmed = await rcConfirm('Clear My Words', 'Remove all ' + words.length + ' tracked words? This cannot be undone.', 'Clear All', { danger: true });
      if (confirmed) {
        saveWords([]);
        updateBadge(0);
        renderWordList('');
      }
    });
  }

  // ============================================================================
  // Feature: Text selection — copy + highlight toolbar
  // ============================================================================

  const HIGHLIGHT_COLORS = [
    { name: 'yellow', color: 'rgba(253,224,71,0.55)', label: '🟡' },
    { name: 'green',  color: 'rgba(74,222,128,0.45)', label: '🟢' },
    { name: 'blue',   color: 'rgba(96,165,250,0.45)', label: '🔵' },
    { name: 'pink',   color: 'rgba(249,168,212,0.55)', label: '🩷' }
  ];

  function getHighlightKey(link) {
    return 'rc_book_highlights_' + encodeURIComponent(link || _bookLink);
  }

  function loadHighlights(link) {
    try { return JSON.parse(localStorage.getItem(getHighlightKey(link)) || '[]'); } catch (e) { return []; }
  }

  function saveHighlights(link, data) {
    localStorage.setItem(getHighlightKey(link), JSON.stringify(data));
  }

  function applyPageHighlights(content, pageNum) {
    if (!_bookLink) return;
    const highlights = loadHighlights(_bookLink);
    const pageHls = highlights.filter(h => h.page === pageNum);
    if (!pageHls.length) return;
    const colorMap = Object.fromEntries(HIGHLIGHT_COLORS.map(c => [c.name, c.color]));
    for (const hl of pageHls) {
      for (let idx = hl.startWordIdx; idx <= hl.endWordIdx; idx++) {
        const span = content.querySelector(`[data-word-idx="${idx}"]`);
        if (span) {
          span.classList.add('st-book-word-highlighted');
          span.style.setProperty('--hl-color', colorMap[hl.color] || colorMap.yellow);
        }
      }
    }
  }

  function addHighlight(color) {
    const state = bookReaderState;
    if (!state || !_bookLink) return;
    const content = document.getElementById('bookContent');
    if (!content) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    // Find word spans in selection
    const allSpans = Array.from(content.querySelectorAll('.st-book-word'));
    const range = sel.getRangeAt(0);
    const hasIntersects = typeof range.intersectsNode === 'function';
    const selectedSpans = allSpans.filter(function (s) {
      if (hasIntersects) return range.intersectsNode(s);
      // Fallback: span end >= range start && span start <= range end
      const sr = document.createRange();
      sr.selectNode(s);
      return sr.compareBoundaryPoints(Range.START_TO_END, range) >= 0 &&
             sr.compareBoundaryPoints(Range.END_TO_START, range) <= 0;
    });
    if (!selectedSpans.length) return;

    const indices = selectedSpans.map(s => parseInt(s.getAttribute('data-word-idx'), 10)).filter(n => !isNaN(n));
    const startWordIdx = Math.min(...indices);
    const endWordIdx = Math.max(...indices);
    const page = state.currentPage;

    const highlights = loadHighlights(_bookLink);
    highlights.push({ page, startWordIdx, endWordIdx, color: color || 'yellow' });
    saveHighlights(_bookLink, highlights);

    applyPageHighlights(content, page);
    sel.removeAllRanges();
    hideSelectionToolbar();
  }

  function removeHighlightContaining(wordIdx) {
    const state = bookReaderState;
    if (!state || !_bookLink) return;
    const page = state.currentPage;
    const highlights = loadHighlights(_bookLink);
    const updated = highlights.filter(h => !(h.page === page && h.startWordIdx <= wordIdx && h.endWordIdx >= wordIdx));
    saveHighlights(_bookLink, updated);
    const content = document.getElementById('bookContent');
    if (content) {
      content.querySelectorAll('.st-book-word-highlighted').forEach(function (s) { s.classList.remove('st-book-word-highlighted'); s.style.removeProperty('--hl-color'); });
      applyPageHighlights(content, page);
    }
  }

  function hideSelectionToolbar() {
    const tb = document.getElementById('bookSelectionToolbar');
    if (tb) tb.remove();
  }

  function handleTextSelection() {
    hideSelectionToolbar();
    const content = document.getElementById('bookContent');
    if (!content) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!content.contains(range.commonAncestorContainer)) return;
    const selectedText = sel.toString().trim();
    if (!selectedText || selectedText.length < 2) return;

    // Build toolbar
    const rect = range.getBoundingClientRect();
    const toolbar = document.createElement('div');
    toolbar.id = 'bookSelectionToolbar';
    toolbar.className = 'st-selection-toolbar';

    const colorDotsHtml = HIGHLIGHT_COLORS.map(c =>
      `<button class="st-sel-color-dot" data-color="${c.name}" style="background:${c.color};" title="Highlight ${c.name}" aria-label="Highlight ${c.name}"></button>`
    ).join('');

    toolbar.innerHTML = `
      <button class="st-sel-toolbar-btn" id="selCopyBtn">📋 Copy</button>
      <button class="st-sel-toolbar-btn" id="selHighlightBtn">🖊 Highlight</button>
      <div class="st-sel-colors" id="selColors" style="display:none;">${colorDotsHtml}</div>
    `;
    document.body.appendChild(toolbar);

    // Position above selection
    let left = rect.left + rect.width / 2 - 80;
    let top = rect.top + window.scrollY - 50;
    if (left < 8) left = 8;
    if (left + 200 > window.innerWidth - 8) left = window.innerWidth - 208;
    if (top < 8) top = rect.bottom + window.scrollY + 8;
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';

    // Copy button
    toolbar.querySelector('#selCopyBtn').addEventListener('click', function () {
      const state = bookReaderState;
      const bk = state && state.bookData;
      const pg = state && state.currentPage;
      const chapter = bk && bk.pages && bk.pages[pg - 1] ? bk.pages[pg - 1].chapter : '';
      const bookTitle = bk ? bk.title : '';
      const citation = `\u201C${selectedText}\u201D (${bookTitle}${chapter ? ', ' + chapter : ''}, Page ${pg})`;
      navigator.clipboard.writeText(citation).then(function () {
        showToast('📋 Copied as text evidence!');
      }).catch(function () {
        showToast('Copy failed. Please use Ctrl+C.', 'error');
      });
      sel.removeAllRanges();
      hideSelectionToolbar();
    });

    // Highlight button — show color dots
    const colorsDiv = toolbar.querySelector('#selColors');
    toolbar.querySelector('#selHighlightBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      colorsDiv.style.display = colorsDiv.style.display === 'none' ? 'flex' : 'none';
    });

    toolbar.querySelectorAll('.st-sel-color-dot').forEach(function (dot) {
      dot.addEventListener('click', function (e) {
        e.stopPropagation();
        addHighlight(dot.getAttribute('data-color'));
      });
    });
  }

  // ============================================================================
  // Feature: Bookmarks
  // ============================================================================

  function getBookmarkKey(link) {
    return 'rc_book_bookmarks_' + encodeURIComponent(link || _bookLink);
  }

  function loadBookmarks(link) {
    try { return JSON.parse(localStorage.getItem(getBookmarkKey(link)) || '[]'); } catch (e) { return []; }
  }

  function saveBookmarks(link, data) {
    localStorage.setItem(getBookmarkKey(link), JSON.stringify(data));
  }

  function updateBookmarkButton() {
    const state = bookReaderState;
    const btn = document.getElementById('bookBookmarkBtn');
    if (!btn || !state) return;
    const bms = loadBookmarks(_bookLink);
    const isBookmarked = bms.some(b => b.page === state.currentPage);
    btn.title = isBookmarked ? 'Remove bookmark from this page' : 'Bookmark this page';
    btn.style.opacity = isBookmarked ? '1' : '0.55';
  }

  function toggleBookmark(bookmarkBtn, bookmarksPanel) {
    const state = bookReaderState;
    if (!state || !_bookLink) return;
    const page = state.currentPage;
    const bms = loadBookmarks(_bookLink);
    const existingIdx = bms.findIndex(b => b.page === page);

    if (existingIdx !== -1) {
      // Already bookmarked — remove it
      bms.splice(existingIdx, 1);
      saveBookmarks(_bookLink, bms);
      updateBookmarkButton();
      if (bookmarksPanel) renderBookmarksPanel(bookmarksPanel);
      if (bookmarksPanel) bookmarksPanel.style.display = 'block';
      showToast('Bookmark removed.');
    } else {
      // Not bookmarked — add it (with optional note via a prompt-like inline input)
      if (bookmarksPanel) {
        bookmarksPanel.style.display = 'block';
        renderBookmarksPanel(bookmarksPanel, true /* showAddNote */);
      }
    }
  }

  function renderBookmarksPanel(panel, showAddNote) {
    const state = bookReaderState;
    if (!state || !_bookLink) { panel.style.display = 'none'; return; }
    const page = state.currentPage;
    const bookData = state.bookData;
    const chapter = bookData.pages && bookData.pages[page - 1] ? bookData.pages[page - 1].chapter : '';
    const bms = loadBookmarks(_bookLink);

    let addNoteHtml = '';
    if (showAddNote) {
      addNoteHtml = `
        <div class="st-bm-add">
          <div class="st-bm-add-label">Page ${page}${chapter ? ' · ' + escapeHtml(chapter) : ''}</div>
          <input class="st-bm-note-input" id="bmNoteInput" type="text" maxlength="100" placeholder="Optional note..." aria-label="Bookmark note"/>
          <button class="st-bm-save-btn" id="bmSaveBtn">🔖 Save Bookmark</button>
        </div>`;
    }

    const listHtml = bms.length
      ? bms.map((b, i) => `<div class="st-bm-item" data-page="${b.page}">
          <div class="st-bm-item-info">
            <span class="st-bm-page">Page ${b.page}</span>${b.chapter ? ` <span class="st-bm-chapter">${escapeHtml(b.chapter)}</span>` : ''}
            ${b.note ? `<div class="st-bm-note">${escapeHtml(b.note)}</div>` : ''}
          </div>
          <button class="st-bm-remove" data-idx="${i}" aria-label="Remove bookmark">✕</button>
        </div>`).join('')
      : '<div class="st-bm-empty">No bookmarks yet.</div>';

    panel.innerHTML = `
      <div class="st-bm-panel-header">Bookmarks</div>
      ${addNoteHtml}
      <div class="st-bm-list">${listHtml}</div>
    `;

    // Save bookmark
    const saveBtn = panel.querySelector('#bmSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        const note = (panel.querySelector('#bmNoteInput') || {}).value || '';
        bms.push({ page, chapter, note: note.slice(0, 100), timestamp: Date.now() });
        saveBookmarks(_bookLink, bms);
        updateBookmarkButton();
        renderBookmarksPanel(panel, false);
        showToast('🔖 Bookmark saved!');
      });
    }

    // Navigate to bookmark
    panel.querySelectorAll('.st-bm-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        if (e.target.classList.contains('st-bm-remove')) return;
        const pg = parseInt(item.getAttribute('data-page'), 10);
        if (pg >= 1) {
          stopBookTts();
          state.currentPage = pg;
          renderBookPage();
          panel.style.display = 'none';
        }
      });
    });

    // Remove bookmark
    panel.querySelectorAll('.st-bm-remove').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        bms.splice(idx, 1);
        saveBookmarks(_bookLink, bms);
        updateBookmarkButton();
        renderBookmarksPanel(panel, false);
      });
    });
  }

  /**
   * Load and render student resources from site-state.json
   */
  async function loadStudentResources() {
    const el = document.getElementById('resourcesContent');
    if (!el) return;

    try {
      const res = await fetch('/assets/data/site-state.json');
      if (!res.ok) throw new Error('Failed to load');
      const state = await res.json();

      const cat = state.categories && state.categories.student_resources;
      if (!cat) {
        el.innerHTML = '<div class="st-resources-empty"><div class="st-resources-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div><div class="st-resources-empty-msg">No resources available yet.</div><div style="font-size:14px;opacity:0.6;">Your teacher hasn\'t uploaded any reading materials.</div></div>';
        return;
      }

      const titles = cat.titles || [];
      const links = cat.links || [];

      // Collect non-empty slots
      const resources = [];
      for (let i = 0; i < titles.length; i++) {
        const title = (titles[i] || '').trim();
        const link = (links[i] || '').trim();
        if (title && link) {
          resources.push({ title, link, index: i });
        }
      }

      if (!resources.length) {
        el.innerHTML = '<div class="st-resources-empty"><div class="st-resources-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div><div class="st-resources-empty-msg">No resources available yet.</div><div style="font-size:14px;opacity:0.6;">Your teacher hasn\'t uploaded any reading materials.</div></div>';
        return;
      }

      // Build card grid
      let html = '<div class="st-resources-grid">';
      for (const r of resources) {
        const svg = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>';
        const safeTitle = r.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        html += '<a class="st-resource-card" href="' + r.link + '" target="_blank" rel="noopener" data-resource-link="' + r.link + '" data-resource-title="' + safeTitle + '">' + svg + '<div class="st-resource-card-title">' + safeTitle + '</div><div class="st-resource-card-badge" style="display:none;font-size:12px;margin-top:6px;opacity:0.75;">📖 Read inline</div><div class="st-resource-progress" style="display:none;margin-top:8px;"></div></a>';
      }
      html += '</div>';
      el.innerHTML = html;

      // After rendering, check each card for book-pages.json (async, non-blocking)
      const cards = el.querySelectorAll('.st-resource-card[data-resource-link]');
      cards.forEach(function (card) {
        const link = card.getAttribute('data-resource-link');
        const title = card.getAttribute('data-resource-title');
        const base = link.endsWith('/') ? link : link + '/';
        // Attempt HEAD request first to avoid downloading the full file
        fetch(base + 'book-pages.json', { method: 'HEAD' }).then(function (r) {
          if (r.ok) {
            // Has book-pages.json — switch card to inline reader
            card.removeAttribute('href');
            card.removeAttribute('target');
            card.removeAttribute('rel');
            card.style.cursor = 'pointer';
            const badge = card.querySelector('.st-resource-card-badge');
            if (badge) badge.style.display = 'block';
            card.addEventListener('click', function (e) {
              e.preventDefault();
              openBookReader(link, title);
            });
            // Show reading progress if available
            const storageKey = 'rc_book_page_' + encodeURIComponent(link);
            const savedPage = parseInt(localStorage.getItem(storageKey) || '0', 10);
            const savedTotal = parseInt(localStorage.getItem(storageKey + '_total') || '0', 10);
            if (savedPage > 0 && savedTotal > 0) {
              const pct = Math.round(savedPage / Math.max(1, savedTotal) * 100);
              const progressEl = card.querySelector('.st-resource-progress');
              if (progressEl) {
                progressEl.innerHTML = `<div class="st-resource-progress-text">Page ${savedPage} of ${savedTotal} \u00b7 ${pct}% read</div><div class="st-resource-progress-bar"><div class="st-resource-progress-fill" style="width:${pct}%"></div></div>`;
                progressEl.style.display = 'block';
              }
            }
            // Populate _knownBookResources for hint deep-links (fetch full JSON)
            if (!_knownBookResources.find(function (x) { return x.link === link; })) {
              fetch(base + 'book-pages.json').then(function (r2) {
                return r2.ok ? r2.json() : null;
              }).then(function (bd) {
                if (bd && bd.chapters && !_knownBookResources.find(function (x) { return x.link === link; })) {
                  _knownBookResources.push({ link: link, title: title, chapters: bd.chapters, totalPages: bd.totalPages || 0 });
                }
              }).catch(function () {});
            }
          }
        }).catch(function () { /* no book-pages.json, leave as external link */ });
      });

    } catch (err) {
      console.error(LOG_PREFIX, 'Failed to load resources:', err);
      el.innerHTML = '<div class="st-resources-empty"><div class="st-resources-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div><div class="st-resources-empty-msg">Unable to load resources</div><div style="font-size:14px;opacity:0.6;">Please try again later.</div></div>';
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
        <div style="margin-bottom: 16px; opacity: 0.5;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>
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
      
      // Feature 2: Check for due soon assignments and show banner
      checkDueSoonBanner(instances);
      
      // Feature 6: Check for new assignments and show toasts
      checkNewAssignments(instances);
      
      // Feature 10: Calculate and render badges
      renderBadges(instances);
      
      // Render assignments tab (with all status)
      renderAssignmentsTab(instances);
      
      // Populate dashboard summary cards
      populateDashboardSummary(instances);
      
      // Populate dashboard recent assignments (4 most recent by assigned_at)
      if (dashRecentContainer) {
        const recent = [...instances].sort((a, b) => new Date(b.assigned_at ?? 0) - new Date(a.assigned_at ?? 0)).slice(0, 4);
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
          <div style="margin-bottom: 16px; opacity: 0.5;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
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
    
    // Create friendly message based on filter
    const filterMessage = statusFilter === 'all' ? 'No assignments' : `No ${statusFilter.replaceAll('-', ' ')} assignments`;
    
    if (filtered.length === 0) {
      assignmentsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="margin-bottom: 16px; opacity: 0.5;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div>
          <div>${filterMessage}</div>
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
    if (status === 'graded' || status === 'reviewed') return 'completed';
    
    // Check if submitted
    if (status === 'submitted') return 'submitted';
    
    // Check if overdue (assigned but past due date)
    if (instance.due_at) {
      const dueDate = new Date(instance.due_at);
      if (dueDate < now && status !== 'submitted' && status !== 'graded' && status !== 'reviewed') {
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
    gradesContainer.innerHTML = '';
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'st-grades-loading';
    loadingDiv.setAttribute('aria-live', 'polite');
    const loadingIcon = document.createElement('div');
    loadingIcon.setAttribute('aria-hidden', 'true');
    // Static SVG markup — no user data interpolated, safe to use innerHTML
    loadingIcon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Loading your grades…';
    loadingDiv.appendChild(loadingIcon);
    loadingDiv.appendChild(loadingText);
    gradesContainer.appendChild(loadingDiv);
    
    // Ensure quarter-utils is available for school-year quarter logic
    if (!quarterUtils) {
      try {
        quarterUtils = await import('/web/quarter-utils.js');
      } catch (e) {
        console.warn(LOG_PREFIX, 'Could not load quarter-utils, using calendar quarters as fallback');
      }
    }
    
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
      const graded = submissions.filter(sub => sub.score_total !== null && sub.score_total !== undefined);
      
      // Update dashboard streak badge and performance trend chart
      renderDashboardStreakBadge(graded);
      renderDashboardTrendChart(graded);
      
      // Calculate average
      let avgGrade = '—';
      if (graded.length > 0) {
        const sum = graded.reduce((acc, sub) => acc + (sub.score_total || 0), 0);
        avgGrade = Math.round(sum / graded.length) + '%';
      }
      
      // Update dashboard
      if (dashAvgGrade) {
        dashAvgGrade.textContent = avgGrade;
      }
      
      // Clear loading state
      gradesContainer.innerHTML = '';
      
      // Render grades
      if (graded.length === 0) {
        // Enhanced empty state
        const empty = document.createElement('div');
        empty.className = 'st-grades-empty';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'st-grades-empty-icon';
        iconDiv.setAttribute('aria-hidden', 'true');
        // Static SVG markup — no user data interpolated, safe to use innerHTML
        iconDiv.innerHTML = '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>';
        
        const msgDiv = document.createElement('div');
        msgDiv.className = 'st-grades-empty-msg';
        msgDiv.textContent = 'No grades yet — keep working on your assignments!';
        
        const linkDiv = document.createElement('div');
        linkDiv.className = 'st-grades-empty-link';
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'st-btn';
        link.setAttribute('data-tab', 'assignments');
        // Static SVG strings — no user data interpolated
        link.innerHTML = `${ICONS.clipboard} View My Assignments`;
        linkDiv.appendChild(link);
        
        empty.appendChild(iconDiv);
        empty.appendChild(msgDiv);
        empty.appendChild(linkDiv);
        gradesContainer.appendChild(empty);
        
        // Attach tab-switch handler
        link.addEventListener('click', () => switchToTab('assignments'));
        return;
      }
      
      // ── Overall Average Card ──────────────────────────────────────────────
      const avgCard = document.createElement('div');
      avgCard.className = 'st-average-display';
      
      const avgHeading = document.createElement('h3');
      avgHeading.textContent = 'Your Overall Average';
      
      const avgValue = document.createElement('div');
      avgValue.className = 'st-average-value';
      avgValue.textContent = avgGrade;
      
      avgCard.appendChild(avgHeading);
      avgCard.appendChild(avgValue);
      gradesContainer.appendChild(avgCard);
      
      // ── Quarterly Averages ────────────────────────────────────────────────
      const quarterAverages = calculateGradeQuarterAverages(graded);
      const hasAnyQuarter = Object.values(quarterAverages).some(q => q.avg !== null);
      
      if (hasAnyQuarter) {
        const qSection = document.createElement('div');
        qSection.className = 'st-quarter-section';
        
        const qHeading = document.createElement('h4');
        qHeading.className = 'st-quarter-section-title';
        qHeading.textContent = 'Quarterly Averages';
        qSection.appendChild(qHeading);
        
        const qGrid = document.createElement('div');
        qGrid.className = 'st-quarter-grid';
        
        for (let q = 1; q <= 4; q++) {
          const key = `Q${q}`;
          const { avg, count } = quarterAverages[key];
          
          let label = key;
          if (quarterUtils && quarterUtils.getQuarterLabel) {
            label = quarterUtils.getQuarterLabel(key);
          }
          
          const pill = document.createElement('div');
          pill.className = 'st-quarter-pill';
          if (avg !== null) {
            pill.classList.add(avg >= 70 ? 'st-quarter-green' : avg >= 50 ? 'st-quarter-yellow' : 'st-quarter-red');
          } else {
            pill.classList.add('st-quarter-muted');
          }
          
          const pillLabel = document.createElement('div');
          pillLabel.className = 'st-quarter-label';
          pillLabel.textContent = label;
          
          const pillAvg = document.createElement('div');
          pillAvg.className = 'st-quarter-avg';
          pillAvg.textContent = avg !== null ? `${avg}%` : '—';
          
          const pillCount = document.createElement('div');
          pillCount.className = 'st-quarter-count';
          pillCount.textContent = avg !== null ? `${count} graded` : 'No data';
          
          pill.appendChild(pillLabel);
          pill.appendChild(pillAvg);
          pill.appendChild(pillCount);
          qGrid.appendChild(pill);
        }
        
        qSection.appendChild(qGrid);
        gradesContainer.appendChild(qSection);
      }
      
      // ── Trend Insights ────────────────────────────────────────────────────
      const weekTrend = calculateGradeWeekTrend(submissions);
      const scoreTrend = calculateGradeTrend(graded);
      const { streak, threshold: streakThreshold } = calculateGradeStreak(graded, 80);
      
      const trendSection = document.createElement('div');
      trendSection.className = 'st-trend-section';
      
      const trendHeading = document.createElement('h4');
      trendHeading.className = 'st-trend-section-title';
      trendHeading.textContent = 'Trend Insights';
      trendSection.appendChild(trendHeading);
      
      const trendItems = document.createElement('div');
      trendItems.className = 'st-trend-items';
      
      // Week-over-week
      const weekItem = document.createElement('div');
      weekItem.className = 'st-trend-item';
      const weekLabel = document.createElement('span');
      weekLabel.className = 'st-trend-label';
      weekLabel.textContent = 'This week:';
      const weekArrows = { up: '↗', down: '↘', flat: '→' };
      const weekValue = document.createElement('span');
      weekValue.className = `st-trend-value st-trend-${weekTrend.direction}`;
      weekValue.textContent = `${weekTrend.lastWeekCount} submission${weekTrend.lastWeekCount !== 1 ? 's' : ''} ${weekArrows[weekTrend.direction]}`;
      if (weekTrend.prevWeekCount > 0 || weekTrend.lastWeekCount > 0) {
        const weekDelta = document.createElement('span');
        weekDelta.className = 'st-trend-delta';
        weekDelta.textContent = ` (${weekTrend.delta >= 0 ? '+' : ''}${weekTrend.delta} vs last week)`;
        weekValue.appendChild(weekDelta);
      }
      weekItem.appendChild(weekLabel);
      weekItem.appendChild(weekValue);
      trendItems.appendChild(weekItem);
      
      // Score trend (only meaningful with ≥ 2 graded)
      if (graded.length >= 2) {
        const scoreItem = document.createElement('div');
        scoreItem.className = 'st-trend-item';
        const scoreLabel = document.createElement('span');
        scoreLabel.className = 'st-trend-label';
        scoreLabel.textContent = 'Score trend:';
        const scoreArrows = { up: '↗ Improving', down: '↘ Declining', flat: '→ Steady' };
        const scoreValue = document.createElement('span');
        scoreValue.className = `st-trend-value st-trend-${scoreTrend.direction}`;
        scoreValue.textContent = scoreArrows[scoreTrend.direction] || '→ Steady';
        scoreItem.appendChild(scoreLabel);
        scoreItem.appendChild(scoreValue);
        trendItems.appendChild(scoreItem);
      }
      
      // Streak indicator (only show if ≥ 2 streak)
      if (streak >= 2) {
        const streakItem = document.createElement('div');
        streakItem.className = 'st-trend-item';
        const streakLabel = document.createElement('span');
        streakLabel.className = 'st-trend-label';
        streakLabel.textContent = 'Streak:';
        const streakValue = document.createElement('span');
        streakValue.className = 'st-trend-value st-trend-streak';
        streakValue.textContent = `🔥 ${streak}-assignment streak above ${streakThreshold}%`;
        streakItem.appendChild(streakLabel);
        streakItem.appendChild(streakValue);
        trendItems.appendChild(streakItem);
      }
      
      trendSection.appendChild(trendItems);
      gradesContainer.appendChild(trendSection);
      
      // ── Grade Rows ────────────────────────────────────────────────────────
      const rowsHeading = document.createElement('h4');
      rowsHeading.className = 'st-grades-list-title';
      rowsHeading.textContent = 'All Graded Assignments';
      gradesContainer.appendChild(rowsHeading);
      
      for (const sub of graded) {
        gradesContainer.appendChild(renderGradeRow(sub));
      }
      
      // Attach "View Details" button handlers
      gradesContainer.querySelectorAll('.st-grade-view-details').forEach(btn => {
        btn.addEventListener('click', () => {
          const instanceId = btn.getAttribute('data-instance-id');
          const instance = (tabState.assignmentsData || []).find(i => i.id === instanceId);
          if (instance) {
            openAssignmentViewer(instance);
          } else {
            // Fallback: switch to assignments tab so the student can find it
            switchToTab('assignments');
          }
        });
      });
      
    } catch (err) {
      console.error(LOG_PREFIX, 'Error loading grades:', err);
      gradesContainer.innerHTML = '';
      const errDiv = document.createElement('div');
      errDiv.className = 'st-grades-loading';
      const errIcon = document.createElement('div');
      errIcon.setAttribute('aria-hidden', 'true');
      // Static SVG markup — no user data interpolated, safe to use innerHTML
      errIcon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
      const errTitle = document.createElement('div');
      errTitle.style.color = 'var(--ink)';
      errTitle.textContent = 'Grades temporarily unavailable';
      const errMsg = document.createElement('div');
      errMsg.style.cssText = 'margin-top: 8px; font-size: 14px;';
      errMsg.textContent = 'Please try refreshing the page or contact your teacher if this persists.';
      errDiv.appendChild(errIcon);
      errDiv.appendChild(errTitle);
      errDiv.appendChild(errMsg);
      gradesContainer.appendChild(errDiv);
      if (dashAvgGrade) {
        dashAvgGrade.textContent = '—';
      }
    }
  }

  /**
   * Calculate per-quarter averages and counts for graded submissions.
   * Uses school-year quarters via quarterUtils (Q1=Aug-Oct, Q2=Oct-Dec, Q3=Dec-Mar, Q4=Mar-May).
   * Falls back to calendar quarters when quarterUtils is not available.
   * @param {Array} graded - Graded submissions (score_total != null)
   * @returns {{ Q1, Q2, Q3, Q4 }} Each key: { avg: number|null, count: number }
   */
  function calculateGradeQuarterAverages(graded) {
    const buckets = { Q1: { sum: 0, count: 0 }, Q2: { sum: 0, count: 0 }, Q3: { sum: 0, count: 0 }, Q4: { sum: 0, count: 0 } };
    
    for (const sub of graded) {
      if (!sub.submitted_at) continue;
      const date = new Date(sub.submitted_at);
      if (isNaN(date.getTime())) continue;
      let qKey = null;
      if (quarterUtils && quarterUtils.getQuarterForDate) {
        qKey = quarterUtils.getQuarterForDate(sub.submitted_at);
      } else {
        // Calendar quarter fallback
        const month = date.getMonth() + 1; // 1-12
        if (month >= 1 && month <= 3) qKey = 'Q1';
        else if (month >= 4 && month <= 6) qKey = 'Q2';
        else if (month >= 7 && month <= 9) qKey = 'Q3';
        else qKey = 'Q4';
      }
      if (qKey && buckets[qKey]) {
        buckets[qKey].sum += sub.score_total;
        buckets[qKey].count++;
      }
    }
    
    const result = {};
    for (const key of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const b = buckets[key];
      result[key] = b.count > 0 ? { avg: Math.round(b.sum / b.count), count: b.count } : { avg: null, count: 0 };
    }
    return result;
  }

  /**
   * Calculate week-over-week submission count trend.
   * @param {Array} submissions - All submissions (graded or not)
   * @param {Date} now - Current date (default: new Date())
   * @returns {{ lastWeekCount, prevWeekCount, delta, direction }}
   */
  function calculateGradeWeekTrend(submissions, now = new Date()) {
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const lastWeek = submissions.filter(s => {
      if (!s.submitted_at) return false;
      const d = new Date(s.submitted_at);
      if (isNaN(d.getTime())) return false;
      return d >= oneWeekAgo && d < now;
    });
    const prevWeek = submissions.filter(s => {
      if (!s.submitted_at) return false;
      const d = new Date(s.submitted_at);
      if (isNaN(d.getTime())) return false;
      return d >= twoWeeksAgo && d < oneWeekAgo;
    });
    const delta = lastWeek.length - prevWeek.length;
    return {
      lastWeekCount: lastWeek.length,
      prevWeekCount: prevWeek.length,
      delta,
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
    };
  }

  /**
   * Calculate score trend: last 5 graded vs previous 5 graded (±3% threshold).
   * @param {Array} graded - Graded submissions (score_total != null)
   * @returns {{ direction: 'up'|'down'|'flat', delta: number }}
   */
  function calculateGradeTrend(graded) {
    const sorted = [...graded]
      .filter(s => s.submitted_at && !isNaN(new Date(s.submitted_at).getTime()))
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
    if (sorted.length < 2) return { direction: 'flat', delta: 0 };
    const last5 = sorted.slice(0, 5);
    const prev5 = sorted.slice(5, 10);
    const lastAvg = last5.reduce((s, x) => s + x.score_total, 0) / last5.length;
    const prevAvg = prev5.length > 0
      ? prev5.reduce((s, x) => s + x.score_total, 0) / prev5.length
      : lastAvg;
    const delta = lastAvg - prevAvg;
    const direction = delta > 3 ? 'up' : delta < -3 ? 'down' : 'flat';
    return { direction, delta };
  }

  /**
   * Calculate the streak of consecutive recent graded submissions at or above threshold.
   * @param {Array} graded - Graded submissions (score_total != null)
   * @param {number} threshold - Score threshold (default 80)
   * @returns {{ streak: number, threshold: number }}
   */
  function calculateGradeStreak(graded, threshold = 80) {
    const sorted = [...graded]
      .filter(s => s.submitted_at && !isNaN(new Date(s.submitted_at).getTime()))
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
    let streak = 0;
    for (const sub of sorted) {
      if (sub.score_total >= threshold) {
        streak++;
      } else {
        break;
      }
    }
    return { streak, threshold };
  }

  /**
   * Check whether a submission has a valid (non-null, parseable) submitted_at date.
   * @param {{ submitted_at: string|null }} s
   * @returns {boolean}
   */
  function hasValidSubmittedAt(s) {
    return Boolean(s.submitted_at) && !isNaN(new Date(s.submitted_at).getTime());
  }

  /**
   * Build a performance trend SVG line chart for the student's recent graded submissions.
   * Plots score_total (%) over time using submitted_at as the x-axis.
   * Shows up to 15 most recent graded submissions, with a 70% passing reference line.
   * Uses the same shared visual tokens and layout as buildProgressSVG.
   * Includes a SPED-friendly status banner and accessible data table.
   * @param {Array} graded - Graded submissions (score_total != null, submitted_at set)
   * @returns {string} HTML string containing banner, SVG chart and legend, or empty message
   */
  function buildScoreTrendSVG(graded) {
    const PASSING_THRESHOLD = 70;
    const MAX_POINTS = 15;

    const sorted = [...graded]
      .filter(hasValidSubmittedAt)
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))
      .slice(-MAX_POINTS);

    if (sorted.length < 2) {
      return `<div class="st-goal-chart-empty" role="status">Not enough graded assignments yet — keep going!</div>`;
    }

    const W = 340, H = 120;
    const PAD = { top: 14, right: 16, bottom: 28, left: 38 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const minV = 0;
    const maxV = 100;
    const rangeV = maxV - minV;

    const dates = sorted.map(s => new Date(s.submitted_at).getTime());
    const minD = Math.min(...dates);
    const maxD = Math.max(...dates);
    const rangeD = maxD - minD || 1;

    const toX = d => PAD.left + ((new Date(d).getTime() - minD) / rangeD) * chartW;
    const toY = v => PAD.top + chartH - ((v - minV) / rangeV) * chartH;

    const points = sorted.map(s => ({ x: toX(s.submitted_at), y: toY(s.score_total), s }));
    const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // X-axis date labels
    const firstLabel = formatDate(sorted[0].submitted_at);
    const lastLabel = formatDate(sorted[sorted.length - 1].submitted_at);

    // 70% passing reference line — label placed INSIDE chart area to prevent clipping
    const refY = toY(PASSING_THRESHOLD).toFixed(1);
    const refLine = `<line class="st-perf-chart-reference" x1="${PAD.left}" y1="${refY}" x2="${W - PAD.right}" y2="${refY}" />`;
    const refLabel = `<text class="st-perf-chart-reference-label" aria-hidden="true" x="${W - PAD.right - 3}" y="${refY}" dy="-3" font-size="9" text-anchor="end">${PASSING_THRESHOLD}%</text>`;

    // Mastery zone shading above passing threshold
    const masteryZoneY = toY(PASSING_THRESHOLD);
    const masteryZone = `<rect class="st-chart-mastery-zone" x="${PAD.left}" y="${PAD.top}" width="${chartW}" height="${(masteryZoneY - PAD.top).toFixed(1)}" aria-hidden="true"/>`;

    // Data dots with tooltips (larger radius for readability)
    const dots = points.map(p => {
      const scoreText = Math.round(p.s.score_total) + '%';
      const dateDisplay = formatDate(p.s.submitted_at);
      return `<circle class="st-chart-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5"><title>${escapeHtml(dateDisplay)}: ${escapeHtml(scoreText)}</title></circle>`;
    }).join('');

    // Latest value label
    const latestPt = points[points.length - 1];
    const latestScore = Math.round(latestPt.s.score_total);
    const latestLabelX = Math.min(latestPt.x + 6, W - PAD.right - 4);

    // SPED-friendly status banner based on latest score vs passing threshold
    const statusBannerHtml = buildStatusBannerHtml(latestScore, PASSING_THRESHOLD, null, 'Percent');

    // Trend arrow from last few submissions (treat as progress entries with .value)
    const gradedAsEntries = sorted.map(s => ({ value: s.score_total }));
    const trend = computeTrendArrow(gradedAsEntries);
    const statsRowHtml = buildStatsRowHtml(latestScore, null, PASSING_THRESHOLD, trend, 'Percent');

    // Accessible data table
    const tableRows = sorted.map(s => {
      const dt = escapeHtml(formatDate(s.submitted_at));
      const sc = escapeHtml(Math.round(s.score_total) + '%');
      return `<tr><td>${dt}</td><td>${sc}</td></tr>`;
    }).join('');
    const srTable = `<details class="st-chart-sr-table">
      <summary>Show data table (${sorted.length} assignments)</summary>
      <table aria-label="Performance data for recent graded assignments">
        <thead><tr><th>Date</th><th>Score</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </details>`;

    return `
      ${statusBannerHtml}
      ${statsRowHtml}
      <div class="st-goal-chart-container">
        <svg class="st-perf-chart-svg" role="img" viewBox="0 0 ${W} ${H}" width="100%" aria-label="Performance trend chart showing your last ${sorted.length} graded assignments, from ${escapeHtml(firstLabel)} to ${escapeHtml(lastLabel)}">
          <rect width="${W}" height="${H}" fill="none"/>
          ${masteryZone}
          <line class="st-chart-axis" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + chartH}" />
          <line class="st-chart-axis" x1="${PAD.left}" y1="${PAD.top + chartH}" x2="${W - PAD.right}" y2="${PAD.top + chartH}" />
          ${refLine}
          ${refLabel}
          <polyline class="st-chart-line" points="${polyline}" />
          ${dots}
          <text class="st-chart-latest-label" aria-hidden="true" x="${latestLabelX.toFixed(1)}" y="${(latestPt.y - 6).toFixed(1)}" font-size="10">${escapeHtml(latestScore + '%')}</text>
          <text class="st-chart-axis-label" x="${PAD.left}" y="${H - 4}" font-size="9" text-anchor="start">${escapeHtml(firstLabel)}</text>
          <text class="st-chart-axis-label" x="${W - PAD.right}" y="${H - 4}" font-size="9" text-anchor="end">${escapeHtml(lastLabel)}</text>
          <text class="st-chart-axis-label" x="${PAD.left - 4}" y="${(PAD.top + chartH).toFixed(1)}" font-size="9" text-anchor="end" dy="4">0%</text>
          <text class="st-chart-axis-label" x="${PAD.left - 4}" y="${PAD.top}" font-size="9" text-anchor="end" dy="4">100%</text>
        </svg>
      </div>
      <div class="st-perf-chart-legend">
        <span class="st-perf-chart-legend-item">
          <svg width="20" height="3" aria-hidden="true"><line x1="0" y1="1.5" x2="20" y2="1.5" stroke="var(--accent,#60a5fa)" stroke-width="2.5"/></svg>
          Score over time
        </span>
        <span class="st-perf-chart-legend-item">
          <svg width="20" height="3" aria-hidden="true"><line x1="0" y1="1.5" x2="20" y2="1.5" stroke="var(--green,#4ade80)" stroke-width="1.5" stroke-dasharray="4 3" stroke-opacity="0.8"/></svg>
          Passing goal (${PASSING_THRESHOLD}%)
        </span>
      </div>
      ${srTable}`;
  }

  /**
   * Render the streak badge on the dashboard (#dashStreakBanner).
   * Shows a motivational fire badge when streak ≥ 1, or an encouraging message when 0.
   * Uses calculateGradeStreak() (threshold 70%) for grade-based streaks.
   * @param {Array} graded - Graded submissions (score_total != null)
   */
  function renderDashboardStreakBadge(graded) {
    const container = document.getElementById('dashStreakBanner');
    if (!container) return;

    // Don't show any streak message for students who have never submitted anything.
    if (!graded || graded.length === 0) {
      container.innerHTML = '';
      return;
    }

    const { streak, threshold } = calculateGradeStreak(graded, 70);

    if (streak === 0) {
      container.innerHTML = `
        <div class="st-streak-banner st-streak-zero">
          <div class="st-streak-banner-fire" aria-hidden="true">💪</div>
          <div class="st-streak-banner-text">
            <div class="st-streak-banner-title">Keep going!</div>
            <div class="st-streak-banner-sub">Your next great streak starts now — score ${threshold}% or above to build momentum.</div>
          </div>
        </div>`;
    } else {
      const assignmentWord = streak === 1 ? 'assignment' : 'assignments';
      container.innerHTML = `
        <div class="st-streak-banner">
          <div class="st-streak-banner-fire" aria-hidden="true">🔥</div>
          <div class="st-streak-banner-text">
            <div class="st-streak-banner-title">${streak} ${assignmentWord} in a row above ${threshold}%!</div>
            <div class="st-streak-banner-sub">You're on a roll — keep it up!</div>
          </div>
        </div>`;
    }
  }

  /**
   * Render the performance trend chart on the dashboard (#dashPerfChart).
   * Shows a line chart of score_total over time for recent graded submissions.
   * Hides the chart section when there is insufficient data.
   * @param {Array} graded - Graded submissions (score_total != null)
   */
  function renderDashboardTrendChart(graded) {
    const container = document.getElementById('dashPerfChart');
    const section = document.getElementById('dashPerfChartSection');
    if (!container || !section) return;

    const chartHtml = buildScoreTrendSVG(graded);
    // Show the section only when there are at least 2 submissions with valid dates.
    // Uses the same hasValidSubmittedAt guard as buildScoreTrendSVG.
    const hasChart = graded.filter(hasValidSubmittedAt).length >= 2;
    if (hasChart) {
      section.style.display = '';
    } else {
      section.style.display = 'none';
    }
    container.innerHTML = chartHtml;
  }

  /**
   * Render a grade row as a DOM element (safe — no innerHTML with user data)
   * @param {Object} submission - Submission object from student-submissions API
   * @returns {HTMLElement}
   */
  function renderGradeRow(submission) {
    const score = submission.score_total != null ? Math.round(submission.score_total) : null;
    const scoreNum = score !== null ? score : 0;
    
    // Border and score color: green ≥70%, yellow 50–69%, red <50%
    const borderColor = scoreNum >= 70 ? '#22c55e' : scoreNum >= 50 ? '#eab308' : '#ef4444';
    const scoreClass = scoreNum >= 70 ? 'good' : scoreNum >= 50 ? 'mid' : 'poor';
    
    const row = document.createElement('div');
    row.className = 'st-grade-row';
    row.style.borderLeftColor = borderColor;
    
    // Left: info
    const info = document.createElement('div');
    info.className = 'st-grade-info';
    
    const title = document.createElement('h4');
    title.textContent = submission.assignment_title || 'Untitled Assignment';
    info.appendChild(title);
    
    const meta = document.createElement('div');
    meta.className = 'st-grade-meta';
    
    if (submission.class_name) {
      const badge = document.createElement('span');
      badge.className = 'st-class-badge';
      badge.textContent = submission.class_name;
      meta.appendChild(badge);
    }
    
    const submittedSpan = document.createElement('span');
    submittedSpan.textContent = 'Submitted: ' + (submission.submitted_at ? formatDate(submission.submitted_at) : 'N/A');
    meta.appendChild(submittedSpan);
    info.appendChild(meta);
    row.appendChild(info);
    
    // Right: score + actions
    const actions = document.createElement('div');
    actions.className = 'st-grade-actions';
    
    const scoreEl = document.createElement('div');
    scoreEl.className = `st-grade-score ${scoreClass}`;
    scoreEl.textContent = score !== null ? `${score}%` : '—';

    if (score !== null) {
      const letterGrade = scoreNum >= 90 ? 'A' : scoreNum >= 80 ? 'B' : scoreNum >= 70 ? 'C' : scoreNum >= 60 ? 'D' : 'F';
      const letterEl = document.createElement('span');
      letterEl.className = `st-letter-grade st-letter-grade-${letterGrade.toLowerCase()}`;
      letterEl.textContent = letterGrade;
      scoreEl.appendChild(letterEl);
    }

    actions.appendChild(scoreEl);
    
    if (submission.instance_id) {
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'st-btn st-grade-view-details';
      viewBtn.setAttribute('data-instance-id', submission.instance_id);
      viewBtn.textContent = 'View Details';
      actions.appendChild(viewBtn);
    }
    
    row.appendChild(actions);
    return row;
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
      <div class="st-goals-loading">
        <div class="st-goals-loading-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>
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

      // Safety-net filter: exclude inactive/archived goals (mirrors isGoalActive from goal-utils.js)
      const activeGoals = goals.filter(g => {
        // Exclude goals explicitly marked inactive (goal versioning)
        if (g.active === false) return false;
        // Exclude goals with closed/archived status
        if (g.status) {
          const s = g.status.toLowerCase();
          if (s === 'closed' || s === 'archived') return false;
        }
        return true;
      });
      console.log(LOG_PREFIX, 'Filtered goals:', goals.length, '->', activeGoals.length, 'active');

      tabState.goalsData = activeGoals;
      
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

      // Fetch per-question data points for the dot grid chart
      let dataPointsMap = new Map();
      try {
        const dpUrl = `/.netlify/functions/student-goal-data-points?code=${encodeURIComponent(studentCode)}`;
        const dpResponse = await fetch(dpUrl);
        if (dpResponse.ok) {
          const dpData = await dpResponse.json();
          if (dpData.ok && dpData.data_points && dpData.data_points.length > 0) {
            dpData.data_points.forEach(pt => {
              if (!dataPointsMap.has(pt.goal_id)) {
                dataPointsMap.set(pt.goal_id, []);
              }
              dataPointsMap.get(pt.goal_id).push(pt);
            });
          }
        }
      } catch (err) {
        console.warn(LOG_PREFIX, 'Failed to load goal data points:', err);
        // Continue without data points — dot grid will be omitted
      }

      // Load quarter-utils for school-year quarter date ranges (lazy, once)
      if (!quarterUtils) {
        try {
          quarterUtils = await import('/web/quarter-utils.js');
        } catch (e) {
          console.warn(LOG_PREFIX, 'Could not load quarter-utils, using calendar quarters as fallback');
        }
      }
      
      // Update dashboard goals count
      if (dashGoalsCount) {
        dashGoalsCount.textContent = activeGoals.length;
      }
      
      // Render goals in Goals tab
      if (activeGoals.length === 0) {
        goalsContainer.innerHTML = `
          <div class="st-goals-empty">
            <div class="st-goals-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg></div>
            <div class="st-goals-empty-msg">No goals found for your account.</div>
          </div>
        `;
      } else {
        goalsContainer.innerHTML = activeGoals.map(goal => renderGoalCard(goal, progressMap, dataPointsMap, 'goals')).join('');
      }
      
      // Render goals snapshot for dashboard (max 3)
      if (dashGoalsSnapshot) {
        const snapshot = activeGoals.slice(0, 3);
        if (snapshot.length === 0) {
          dashGoalsSnapshot.innerHTML = '<p style="opacity:0.7;">No goals yet</p>';
        } else {
          dashGoalsSnapshot.innerHTML = snapshot.map(goal => renderGoalCard(goal, progressMap, dataPointsMap, 'dash')).join('');
        }
      }
      
      // Attach event listeners to "Show more" buttons in both Goals tab and Dashboard snapshot
      if (activeGoals.length > 0) {
        attachShowMoreListeners();
      }
      
    } catch (err) {
      console.error(LOG_PREFIX, 'Error loading goals:', err);
      goalsContainer.innerHTML = `
        <div class="st-goals-error">
          <div class="st-goals-error-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
          <div class="st-goals-error-title">Goals temporarily unavailable</div>
          <div class="st-goals-error-detail">Please try refreshing the page or contact your teacher if this persists.</div>
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

    // Forgot password / Reset password handlers
    const btnForgotPassword = document.getElementById('btnForgotPassword');
    const btnBackToLogin = document.getElementById('btnBackToLogin');
    const btnResetPassword = document.getElementById('btnResetPassword');
    const resetPasswordSection = document.getElementById('resetPasswordSection');

    if (btnForgotPassword) {
      btnForgotPassword.addEventListener('click', () => {
        showResetPasswordSection(true);
      });
    }

    if (btnBackToLogin) {
      btnBackToLogin.addEventListener('click', () => {
        showResetPasswordSection(false);
      });
    }

    if (btnResetPassword) {
      btnResetPassword.addEventListener('click', handleResetPassword);
    }
  }

  /**
   * Show or hide the reset password section vs login forms
   */
  function showResetPasswordSection(show) {
    const resetSection = document.getElementById('resetPasswordSection');
    const loginForm = document.getElementById('studentLoginForm');
    const manualEntrySection = document.getElementById('manualEntrySection');
    const toggleBtn = document.getElementById('btnToggleManualEntry');
    const divider = document.querySelector('.st-divider');
    const forgotBtn = document.getElementById('btnForgotPassword');
    const resetMsg = document.getElementById('resetPasswordMsg');

    if (show) {
      if (resetSection) resetSection.classList.add('show');
      if (loginForm) loginForm.style.display = 'none';
      if (manualEntrySection) manualEntrySection.classList.remove('show');
      if (toggleBtn) toggleBtn.style.display = 'none';
      if (divider) divider.style.display = 'none';
      if (forgotBtn) forgotBtn.style.display = 'none';
      // Clear previous messages
      if (resetMsg) { resetMsg.style.display = 'none'; resetMsg.textContent = ''; resetMsg.className = 'st-reset-msg'; }
      const codeInput = document.getElementById('resetStudentCode');
      if (codeInput) codeInput.value = '';
    } else {
      if (resetSection) resetSection.classList.remove('show');
      if (loginForm) loginForm.style.display = '';
      if (toggleBtn) toggleBtn.style.display = '';
      if (divider) divider.style.display = '';
      if (forgotBtn) forgotBtn.style.display = '';
    }
  }

  /**
   * Handle "Reset Password" button click
   */
  async function handleResetPassword() {
    const codeInput = document.getElementById('resetStudentCode');
    const btnReset = document.getElementById('btnResetPassword');
    const resetMsg = document.getElementById('resetPasswordMsg');

    if (!codeInput || !resetMsg) return;

    const code = codeInput.value.trim();
    if (!code) {
      resetMsg.textContent = 'Please enter your student code.';
      resetMsg.className = 'st-reset-msg error';
      resetMsg.style.display = 'block';
      return;
    }

    if (btnReset) { btnReset.disabled = true; btnReset.textContent = 'Resetting...'; }
    resetMsg.style.display = 'none';

    try {
      const res = await fetch('/.netlify/functions/student-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        resetMsg.textContent = 'Your password has been reset to your default password (your student code + "!"). Please log in with that password and then change it in Settings.';
        resetMsg.className = 'st-reset-msg success';
        resetMsg.style.display = 'block';
        // Auto-return to login after 3 seconds
        setTimeout(() => showResetPasswordSection(false), 3000);
      } else {
        resetMsg.textContent = data.error || 'Could not reset your password. Please ask your teacher for help.';
        resetMsg.className = 'st-reset-msg error';
        resetMsg.style.display = 'block';
      }
    } catch (err) {
      console.error(LOG_PREFIX, 'Reset password error:', err);
      resetMsg.textContent = 'Unable to reach the server. Please check your connection and try again.';
      resetMsg.className = 'st-reset-msg error';
      resetMsg.style.display = 'block';
    } finally {
      if (btnReset) { btnReset.disabled = false; btnReset.textContent = 'Reset Password'; }
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

  // ============================================================================
  // Feature 2: Due Soon Banner
  // ============================================================================
  function checkDueSoonBanner(instances) {
    const bannerContainer = document.getElementById('dueSoonBanner');
    if (!bannerContainer) return;

    const now = new Date();
    const dueSoon = instances.filter(inst => {
      if (!inst.due_at) return false;
      const dueDate = new Date(inst.due_at);
      const hoursUntilDue = (dueDate - now) / (1000 * 60 * 60);
      const status = (inst.status || 'Assigned').toLowerCase();
      const isNotSubmitted = status !== 'submitted' && status !== 'graded' && status !== 'reviewed';
      return hoursUntilDue > 0 && hoursUntilDue <= 48 && isNotSubmitted;
    });

    if (dueSoon.length === 0) {
      bannerContainer.innerHTML = '';
      return;
    }

    // Check if any are urgent (within 24 hours)
    const urgent = dueSoon.some(inst => {
      const dueDate = new Date(inst.due_at);
      const hoursUntilDue = (dueDate - now) / (1000 * 60 * 60);
      return hoursUntilDue <= 24;
    });

    const bannerClass = urgent ? 'urgent' : 'warning';
    // Static SVG strings — no user data interpolated
    const icon = urgent ? ICONS.alertClock : ICONS.alertTriangle;
    const title = urgent ? 'Urgent: Assignments Due Soon!' : 'Heads Up: Assignments Due Soon';
    const message = `You have ${dueSoon.length} assignment${dueSoon.length > 1 ? 's' : ''} due within ${urgent ? '24 hours' : '48 hours'}.`;

    bannerContainer.innerHTML = `
      <div class="st-due-soon-banner ${bannerClass}" id="dueSoonBannerEl">
        <div class="st-due-soon-icon">${icon}</div>
        <div class="st-due-soon-text">
          <strong>${escapeHtml(title)}</strong>
          <div>${escapeHtml(message)}</div>
        </div>
      </div>
    `;

    // Make banner clickable to switch to Assignments tab
    const bannerEl = document.getElementById('dueSoonBannerEl');
    if (bannerEl) {
      bannerEl.addEventListener('click', () => {
        switchToTab('assignments');
      });
    }
  }

  // ============================================================================
  // Feature 6: New Assignment Notifications
  // ============================================================================
  function checkNewAssignments(instances) {
    try {
      const seenKey = 'rc_student_seen_assignments';
      const seenStr = localStorage.getItem(seenKey);
      const seenSet = seenStr ? new Set(JSON.parse(seenStr)) : new Set();
      
      const newAssignments = instances.filter(inst => !seenSet.has(inst.id));
      
      // Add all current IDs to seen set
      instances.forEach(inst => seenSet.add(inst.id));
      localStorage.setItem(seenKey, JSON.stringify([...seenSet]));
      
      // Show toasts for new assignments
      newAssignments.forEach(inst => {
        const title = (inst.assignment && inst.assignment.title) || 'Untitled Assignment';
        showToast(`📬 New assignment: ${title}`);
      });
    } catch (err) {
      console.error(LOG_PREFIX, 'Error checking new assignments:', err);
    }
  }

  // ============================================================================
  // Feature 10: Achievement Badges
  // ============================================================================
  function renderBadges(instances) {
    const badgesContainer = document.getElementById('badgesContainer');
    if (!badgesContainer) return;

    const badges = [];
    const now = new Date();

    // On Time badge: assignments submitted before due date
    const onTimeCount = instances.filter(inst => {
      if (!inst.due_at || !inst.submitted_at) return false;
      const status = (inst.status || '').toLowerCase();
      if (status !== 'submitted' && status !== 'graded' && status !== 'reviewed') return false;
      return new Date(inst.submitted_at) <= new Date(inst.due_at);
    }).length;

    if (onTimeCount > 0) {
      badges.push({
        icon: '⏰',
        label: `On Time: ${onTimeCount}`,
        color: 'green'
      });
    }

    // Perfect score badge
    const perfectCount = instances.filter(inst => {
      return inst.grade === 100;
    }).length;

    if (perfectCount > 0) {
      badges.push({
        icon: '💯',
        label: `Perfect: ${perfectCount}`,
        color: 'gold'
      });
    }

    // Streak badge: consecutive on-time submissions
    const sortedSubmitted = instances
      .filter(inst => {
        const status = (inst.status || '').toLowerCase();
        return (status === 'submitted' || status === 'graded' || status === 'reviewed') && inst.submitted_at && inst.due_at;
      })
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

    let streak = 0;
    for (const inst of sortedSubmitted) {
      if (new Date(inst.submitted_at) <= new Date(inst.due_at)) {
        streak++;
      } else {
        break;
      }
    }

    if (streak >= 3) {
      badges.push({
        icon: '🔥',
        label: `Streak: ${streak}`,
        color: 'blue'
      });
    }

    // Writer badge: writing prompts completed with >50 words
    const writerCount = instances.filter(inst => {
      if (!inst.settings || !inst.settings.answers) return false;
      const answers = inst.settings.answers;
      return Object.values(answers).some(ans => {
        if (typeof ans === 'string') {
          const wordCount = ans.trim().split(/\s+/).length;
          return wordCount > WRITER_BADGE_WORD_THRESHOLD;
        }
        return false;
      });
    }).length;

    if (writerCount > 0) {
      badges.push({
        icon: '✍️',
        label: `Writer: ${writerCount}`,
        color: 'purple'
      });
    }

    // Render badges
    if (badges.length === 0) {
      badgesContainer.innerHTML = '';
      return;
    }

    const badgesHtml = badges.map(badge => `
      <div class="st-badge ${badge.color}" style="display:inline-flex;align-items:center;gap:6px;">
        <span class="badge-icon">${badge.icon}</span>
        <span>${escapeHtml(badge.label)}</span>
      </div>
    `).join('');

    badgesContainer.innerHTML = `<div class="st-badges">${badgesHtml}</div>`;
  }

  // ============================================================================
  // Feature 12: Read Aloud Mode
  // ============================================================================
  let readAloudState = {
    speaking: false,
    utterances: [],
    currentIndex: 0
  };

  function toggleReadAloud(panel) {
    const btn = document.getElementById('btnReadAloud');
    if (!btn) return;

    if (readAloudState.speaking) {
      // Stop reading
      window.speechSynthesis.cancel();
      readAloudState.speaking = false;
      readAloudState.utterances = [];
      readAloudState.currentIndex = 0;
      btn.textContent = '🔊 Read Aloud';
      
      // Remove reading highlights
      panel.querySelectorAll('.reading').forEach(el => el.classList.remove('reading'));
    } else {
      // Start reading
      const dayContent = panel.querySelector('#dayContent');
      if (!dayContent) return;

      // Collect all text to read
      const textElements = [];
      
      // Day label
      const dayLabel = dayContent.querySelector('h3');
      if (dayLabel) {
        textElements.push({ element: dayLabel, text: dayLabel.textContent });
      }
      
      // Questions and choices
      dayContent.querySelectorAll('.st-question-container').forEach(container => {
        const questionText = container.querySelector('.st-question-text');
        if (questionText) {
          const text = questionText.textContent.replace(/🔊/g, '').trim();
          textElements.push({ element: container, text });
        }
        
        container.querySelectorAll('.st-choice-label').forEach(choice => {
          const text = choice.textContent.replace(/🔊/g, '').trim();
          textElements.push({ element: choice.closest('.st-choice'), text });
        });
      });
      
      // Writing prompts
      const writingPrompt = dayContent.querySelector('.st-writing-prompt');
      if (writingPrompt) {
        const text = writingPrompt.textContent.replace(/🔊/g, '').trim();
        textElements.push({ element: writingPrompt, text });
      }

      if (textElements.length === 0) return;

      readAloudState.speaking = true;
      readAloudState.utterances = textElements;
      readAloudState.currentIndex = 0;
      btn.textContent = '⏹ Stop Reading';

      speakNext(panel);
    }
  }

  function speakNext(panel) {
    if (!readAloudState.speaking || readAloudState.currentIndex >= readAloudState.utterances.length) {
      readAloudState.speaking = false;
      const btn = document.getElementById('btnReadAloud');
      if (btn) btn.textContent = '🔊 Read Aloud';
      panel.querySelectorAll('.reading').forEach(el => el.classList.remove('reading'));
      return;
    }

    const item = readAloudState.utterances[readAloudState.currentIndex];
    
    // Remove previous highlight
    panel.querySelectorAll('.reading').forEach(el => el.classList.remove('reading'));
    
    // Highlight current element
    if (item.element) {
      item.element.classList.add('reading');
    }

    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.onend = () => {
      readAloudState.currentIndex++;
      setTimeout(() => speakNext(panel), SPEECH_PAUSE_MS);
    };
    utterance.onerror = () => {
      readAloudState.speaking = false;
      const btn = document.getElementById('btnReadAloud');
      if (btn) btn.textContent = '🔊 Read Aloud';
      panel.querySelectorAll('.reading').forEach(el => el.classList.remove('reading'));
    };
    
    window.speechSynthesis.speak(utterance);
  }

  // ============================================================================
  // Feature 13: Visual Timer
  // ============================================================================
  let timerState = {
    startTime: null,
    elapsed: 0,
    interval: null,
    instanceId: null
  };

  function toggleTimer(instance) {
    const timerEl = document.getElementById('assignmentTimer');
    if (!timerEl) return;

    const isVisible = !timerEl.classList.contains('hidden');
    
    if (isVisible) {
      // Hide timer
      timerEl.classList.add('hidden');
      if (timerState.interval) {
        clearInterval(timerState.interval);
        timerState.interval = null;
      }
      // Save preference
      localStorage.setItem('rc_student_timer_enabled', 'false');
    } else {
      // Show timer
      timerEl.classList.remove('hidden');
      timerState.instanceId = instance.id;
      
      // Load elapsed time from localStorage
      const savedTime = localStorage.getItem(`rc_student_timer_${instance.id}`);
      if (savedTime) {
        timerState.elapsed = parseInt(savedTime, 10) || 0;
      } else {
        timerState.elapsed = 0;
      }
      
      timerState.startTime = Date.now() - timerState.elapsed;
      
      // Start interval
      updateTimerDisplay();
      timerState.interval = setInterval(updateTimerDisplay, 1000);
      
      // Save preference
      localStorage.setItem('rc_student_timer_enabled', 'true');
    }
  }

  function updateTimerDisplay() {
    const displayEl = document.getElementById('timerDisplay');
    if (!displayEl) return;

    timerState.elapsed = Date.now() - timerState.startTime;
    
    const totalSeconds = Math.floor(timerState.elapsed / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    displayEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    // Save to localStorage
    if (timerState.instanceId) {
      localStorage.setItem(`rc_student_timer_${timerState.instanceId}`, String(timerState.elapsed));
    }
  }

  function initTimer(instance) {
    // Check if timer was previously enabled
    const timerEnabled = localStorage.getItem('rc_student_timer_enabled') === 'true';
    if (timerEnabled) {
      // Auto-enable timer
      setTimeout(() => {
        const btn = document.getElementById('btnToggleTimer');
        if (btn) btn.click();
      }, TIMER_INIT_DELAY_MS);
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

  // ============================================================================
  // Feature 4: Light/Dark Mode Toggle
  // ============================================================================
  function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    // Restore saved theme
    const savedTheme = localStorage.getItem('rc_student_theme');
    if (savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      themeToggle.textContent = '☀️';
    }

    themeToggle.addEventListener('click', function() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      
      if (newTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        themeToggle.textContent = '☀️';
        localStorage.setItem('rc_student_theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
        themeToggle.textContent = '🌙';
        localStorage.setItem('rc_student_theme', 'dark');
      }
    });
  }

  // ============================================================================
  // Feature 5: Font Size Controls
  // ============================================================================
  function initFontSizeControls() {
    const fontDecrease = document.getElementById('fontDecrease');
    const fontIncrease = document.getElementById('fontIncrease');
    if (!fontDecrease || !fontIncrease) return;

    const sizes = ['small', 'normal', 'large', 'xlarge', 'xxlarge'];
    
    // Restore saved font size
    const savedSize = localStorage.getItem('rc_student_font_size') || 'normal';
    document.documentElement.setAttribute('data-font-size', savedSize);

    fontDecrease.addEventListener('click', function() {
      const current = document.documentElement.getAttribute('data-font-size') || 'normal';
      const currentIndex = sizes.indexOf(current);
      if (currentIndex > 0) {
        const newSize = sizes[currentIndex - 1];
        document.documentElement.setAttribute('data-font-size', newSize);
        localStorage.setItem('rc_student_font_size', newSize);
      }
    });

    fontIncrease.addEventListener('click', function() {
      const current = document.documentElement.getAttribute('data-font-size') || 'normal';
      const currentIndex = sizes.indexOf(current);
      if (currentIndex < sizes.length - 1) {
        const newSize = sizes[currentIndex + 1];
        document.documentElement.setAttribute('data-font-size', newSize);
        localStorage.setItem('rc_student_font_size', newSize);
      }
    });
  }

  // ============================================================================
  // Feature 6: Toast Notifications
  // ============================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `st-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode === container) {
          container.removeChild(toast);
        }
      }, TOAST_FADE_OUT_DURATION_MS);
    }, TOAST_DISPLAY_DURATION_MS);
  }

  // ============================================================================
  // Feature 9: Student Profile Card
  // ============================================================================
  function updateProfileCard(studentCode) {
    const profileCard = document.getElementById('profileCard');
    const profileAvatar = document.getElementById('profileAvatar');
    const profileName = document.getElementById('profileName');
    const profileCodeEl = document.getElementById('profileCode');
    const profileClass = document.getElementById('profileClass');

    if (!profileCard) return;

    profileCard.style.display = 'block';
    // Static SVG — no user data interpolated; scale up to 32px for avatar display
    if (profileAvatar) {
      profileAvatar.innerHTML = ICONS.user.replace('width="16" height="16"', 'width="32" height="32"');
    }
    if (profileCodeEl) {
      profileCodeEl.textContent = studentCode || '—';
    }
    if (profileName) {
      profileName.textContent = 'Student'; // Could be enhanced with actual name from DB
    }
    if (profileClass) {
      profileClass.textContent = '—'; // Could be enhanced with class info
    }
  }

  // ============================================================================
  // Student Settings: Self-Service Password Change
  // ============================================================================
  function initStudentSettings() {
    const toggleBtn = document.getElementById('btnToggleStudentSettings');
    const settingsPanel = document.getElementById('studentSettingsPanel');
    const changeBtn = document.getElementById('btnStudentChangePassword');

    if (toggleBtn && settingsPanel) {
      toggleBtn.addEventListener('click', function () {
        settingsPanel.classList.toggle('hidden');
      });
    }

    if (changeBtn) {
      changeBtn.addEventListener('click', handleStudentChangePassword);
    }
  }

  async function handleStudentChangePassword() {
    const currentPassword = document.getElementById('stCurrentPassword');
    const newPassword = document.getElementById('stNewPassword');
    const confirmPassword = document.getElementById('stConfirmPassword');
    const msgEl = document.getElementById('stPasswordMsg');
    const changeBtn = document.getElementById('btnStudentChangePassword');

    function setMsg(text, type) {
      if (!msgEl) return;
      msgEl.textContent = text;
      msgEl.className = type || '';
    }

    if (!currentPassword || !newPassword || !confirmPassword) return;

    setMsg('', '');

    const currentVal = currentPassword.value;
    const newVal = newPassword.value;
    const confirmVal = confirmPassword.value;

    if (!currentVal || !newVal || !confirmVal) {
      setMsg('Please fill in all fields.', 'error');
      return;
    }

    if (newVal !== confirmVal) {
      setMsg('New passwords do not match.', 'error');
      return;
    }

    if (newVal.length < 6) {
      setMsg('New password must be at least 6 characters.', 'error');
      return;
    }

    if (newVal === currentVal) {
      setMsg('New password must be different from current password.', 'error');
      return;
    }

    const studentCode = sessionStorage.getItem('rc_user_code');
    if (!studentCode) {
      setMsg('Session expired. Please log in again.', 'error');
      return;
    }

    if (changeBtn) changeBtn.disabled = true;

    try {
      const res = await fetch('/.netlify/functions/student-change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentCode, currentPassword: currentVal, newPassword: newVal }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setMsg('Password changed successfully.', 'success');
        currentPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
      } else {
        setMsg(data.error || 'Failed to change password.', 'error');
      }
    } catch (err) {
      console.error(LOG_PREFIX, 'Error changing password:', err);
      setMsg('Network error. Please try again.', 'error');
    } finally {
      if (changeBtn) changeBtn.disabled = false;
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
