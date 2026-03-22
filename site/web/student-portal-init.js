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
  const STUDENT_PORTAL_PATH = '/student/';
  
  // Feature constants
  const MIN_WRITING_ANSWER_LENGTH = 10;
  const AUTO_SAVE_DEBOUNCE_MS = 1000;
  const WRITER_BADGE_WORD_THRESHOLD = 50;
  const SPEECH_PAUSE_MS = 300;
  const TOAST_DISPLAY_DURATION_MS = 5000;
  const TOAST_FADE_OUT_DURATION_MS = 300;
  const TIMER_INIT_DELAY_MS = 100;
  
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
   * Build an inline SVG line chart for goal progress entries
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

    const W = 340, H = 120;
    const PAD = { top: 14, right: 16, bottom: 28, left: 38 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const values = sorted.map(e => parseFloat(e.value)).filter(v => !isNaN(v));
    if (values.length < 2) {
      return `<div class="st-goal-chart-empty" role="status">Progress values are not numeric; chart unavailable.</div>`;
    }

    const baseline = goal.baseline != null ? parseFloat(goal.baseline) : null;
    const target = goal.target != null ? parseFloat(goal.target) : null;

    const allNums = [...values];
    if (!isNaN(baseline)) allNums.push(baseline);
    if (!isNaN(target)) allNums.push(target);

    const minV = Math.min(...allNums);
    const maxV = Math.max(...allNums);
    const rangeV = maxV - minV || 1;

    const dates = sorted.map(e => new Date(e.date).getTime());
    const minD = Math.min(...dates);
    const maxD = Math.max(...dates);
    const rangeD = maxD - minD || 1;

    const toX = d => PAD.left + ((new Date(d).getTime() - minD) / rangeD) * chartW;
    const toY = v => PAD.top + chartH - ((v - minV) / rangeV) * chartH;

    const numericEntries = sorted.filter(e => !isNaN(parseFloat(e.value)));
    const points = numericEntries.map(e => ({ x: toX(e.date), y: toY(parseFloat(e.value)), e }));

    const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // X-axis labels (first and last date)
    const firstLabel = formatDate(sorted[0].date);
    const lastLabel = formatDate(sorted[sorted.length - 1].date);

    // Y-axis labels (min and max)
    const mt = goal.measurement_type;
    const yMinLabel = formatProgressValue(minV, mt);
    const yMaxLabel = formatProgressValue(maxV, mt);

    let refLines = '';
    if (!isNaN(baseline) && baseline >= minV && baseline <= maxV) {
      const by = toY(baseline).toFixed(1);
      refLines += `<line class="st-chart-ref st-chart-baseline" x1="${PAD.left}" y1="${by}" x2="${W - PAD.right}" y2="${by}" />`;
      refLines += `<text class="st-chart-ref-label" x="${W - PAD.right + 2}" y="${by}" dy="4" font-size="9" fill="var(--muted)">base</text>`;
    }
    if (!isNaN(target) && target >= minV && target <= maxV) {
      const ty = toY(target).toFixed(1);
      refLines += `<line class="st-chart-ref st-chart-target" x1="${PAD.left}" y1="${ty}" x2="${W - PAD.right}" y2="${ty}" />`;
      refLines += `<text class="st-chart-ref-label" x="${W - PAD.right + 2}" y="${ty}" dy="4" font-size="9" fill="var(--accent)">target</text>`;
    }

    const dots = points.map(p => {
      const val = formatProgressValue(parseFloat(p.e.value), mt);
      const dt = formatDate(p.e.date);
      return `<circle class="st-chart-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" role="img" aria-label="${dt}: ${val}"><title>${dt}: ${val}</title></circle>`;
    }).join('');

    const latestPt = points[points.length - 1];
    const latestLabel = formatProgressValue(parseFloat(latestPt.e.value), mt);
    const latestLabelX = Math.min(latestPt.x + 6, W - PAD.right - 4);

    return `
      <svg class="st-goal-chart-svg" role="img" viewBox="0 0 ${W} ${H}" width="100%" aria-label="Progress chart for goal ${escapeHtml(goal.code || '')}">
        <rect width="${W}" height="${H}" fill="none"/>
        <!-- Axes -->
        <line class="st-chart-axis" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + chartH}" />
        <line class="st-chart-axis" x1="${PAD.left}" y1="${PAD.top + chartH}" x2="${W - PAD.right}" y2="${PAD.top + chartH}" />
        <!-- Reference lines -->
        ${refLines}
        <!-- Progress line -->
        <polyline class="st-chart-line" points="${polyline}" />
        <!-- Data dots -->
        ${dots}
        <!-- Latest value label -->
        <text class="st-chart-latest-label" x="${latestLabelX}" y="${(latestPt.y - 6).toFixed(1)}" font-size="10">${escapeHtml(latestLabel)}</text>
        <!-- X-axis labels -->
        <text class="st-chart-axis-label" x="${PAD.left}" y="${H - 4}" font-size="9" text-anchor="start">${escapeHtml(firstLabel)}</text>
        <text class="st-chart-axis-label" x="${W - PAD.right}" y="${H - 4}" font-size="9" text-anchor="end">${escapeHtml(lastLabel)}</text>
        <!-- Y-axis labels -->
        <text class="st-chart-axis-label" x="${PAD.left - 4}" y="${(PAD.top + chartH).toFixed(1)}" font-size="9" text-anchor="end" dy="4">${escapeHtml(yMinLabel)}</text>
        <text class="st-chart-axis-label" x="${PAD.left - 4}" y="${PAD.top}" font-size="9" text-anchor="end" dy="4">${escapeHtml(yMaxLabel)}</text>
      </svg>`;
  }

  /**
   * Render a single goal card
   */
  function renderGoalCard(goal, progressMap) {
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
    
    const statusSvg = thisQuarterEntries.length > 0
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
    const statusText = thisQuarterEntries.length > 0 
      ? `${thisQuarterEntries.length} data ${thisQuarterEntries.length === 1 ? 'point' : 'points'} this quarter`
      : 'No data this quarter';
    
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
    const progressDetailId = `st-goal-progress-${(goal.code ?? goal.id).replace(/[^a-z0-9]/gi, '_')}`;
    let progressDetailHtml = '';
    let progressTowardTargetHtml = '';
    if (progressEntries.length > 0) {
      const sortedForDisplay = [...progressEntries].sort((a, b) => new Date(b.date) - new Date(a.date));
      const latestEntry = sortedForDisplay[0];
      const latestVal = formatProgressValue(latestEntry.value, goal.measurement_type);
      const latestNumeric = parseFloat(latestEntry.value);

      // Build friendly "progress toward target" visual (Item 3)
      const targetNumeric = goal.target ? parseFloat(goal.target) : NaN;
      if (!isNaN(targetNumeric) && targetNumeric > 0 && !isNaN(latestNumeric)) {
        const pct = Math.min(100, Math.max(0, Math.round((latestNumeric / targetNumeric) * 100)));
        // Trend indicator: compare newest vs oldest of last 3 entries (non-overlapping)
        // Threshold of 2 points avoids noise from minor measurement variation
        const TREND_THRESHOLD = 2;
        let trendHtml = '';
        if (sortedForDisplay.length >= 3) {
          const newestVal = parseFloat(sortedForDisplay[0].value);
          const oldestOfRecent = parseFloat(sortedForDisplay[2].value);
          if (newestVal > oldestOfRecent + TREND_THRESHOLD) {
            trendHtml = `<span class="st-progress-trend st-progress-trend--up">↑ Improving</span>`;
          } else if (newestVal < oldestOfRecent - TREND_THRESHOLD) {
            trendHtml = `<span class="st-progress-trend st-progress-trend--down">↓ Needs work</span>`;
          } else {
            trendHtml = `<span class="st-progress-trend st-progress-trend--steady">→ Steady</span>`;
          }
        }
        const barColor = pct >= 100 ? '#22c55e' : pct >= 75 ? '#86efac' : pct >= 50 ? '#fbbf24' : '#f87171';
        progressTowardTargetHtml = `
          <div class="st-progress-toward-target">
            <div class="st-progress-toward-text">
              <span>You're at <strong>${escapeHtml(latestVal)}</strong> → Target: <strong>${escapeHtml(goal.target)}</strong></span>
              ${trendHtml}
            </div>
            <div class="st-progress-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${pct}% toward goal">
              <div class="st-progress-bar-fill" style="width:${pct}%;background:${barColor};"></div>
            </div>
            <div class="st-progress-bar-pct">${pct}% toward goal</div>
          </div>`;
      }

      const allRows = sortedForDisplay.map(e => {
        const val = formatProgressValue(e.value, goal.measurement_type);
        const dt = formatDate(e.date);
        return `<tr><td class="st-progress-td-date">${escapeHtml(dt)}</td><td class="st-progress-td-value">${escapeHtml(val)}</td></tr>`;
      }).join('');

      const chartHtml = buildProgressSVG(progressEntries, goal);

      // Quarter average
      const qAvgVal = thisQuarterEntries.length > 0
        ? thisQuarterEntries.reduce((sum, e) => sum + parseFloat(e.value || 0), 0) / thisQuarterEntries.length
        : null;
      const qAvgHtml = qAvgVal !== null
        ? `<div class="st-goal-latest-value" style="margin-top:8px;">
            <span class="st-goal-latest-label">This Quarter Avg:</span>
            <span class="st-goal-latest-num" style="font-size:16px;">${escapeHtml(formatProgressValue(qAvgVal, goal.measurement_type))}</span>
            <span style="font-size:12px;opacity:0.6;">(${thisQuarterEntries.length} ${thisQuarterEntries.length === 1 ? 'entry' : 'entries'})</span>
          </div>`
        : '';

      // Progress detail panel — expanded by default (Item 2)
      progressDetailHtml = `
        <div class="st-goal-progress-detail" id="${progressDetailId}">
          <div class="st-goal-latest-value" aria-label="Latest progress value: ${escapeHtml(latestVal)}">
            <span class="st-goal-latest-label">Latest:</span>
            <span class="st-goal-latest-num">${escapeHtml(latestVal)}</span>
          </div>
          ${qAvgHtml}
          <div class="st-goal-chart-container" aria-hidden="true">
            ${chartHtml}
          </div>
          <table class="st-progress-table" aria-label="All progress data (${sortedForDisplay.length} ${sortedForDisplay.length === 1 ? 'entry' : 'entries'})">
            <thead><tr><th>Date</th><th>Value</th></tr></thead>
            <tbody>${allRows}</tbody>
          </table>
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
        ${progressTowardTargetHtml}
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
        const panel = document.getElementById(targetId);
        if (!panel) {
          console.warn('[student-portal] Progress panel not found for id:', targetId);
          return;
        }
        const isExpanded = !panel.hidden;
        panel.hidden = isExpanded;
        panel.style.display = isExpanded ? 'none' : '';
        panel.setAttribute('aria-hidden', String(isExpanded));
        toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
        const svgEl = toggleBtn.querySelector('svg');
        if (svgEl) svgEl.style.transform = isExpanded ? '' : 'rotate(180deg)';
        const labelEl = toggleBtn.querySelector('.st-goal-progress-toggle-label');
        if (labelEl) labelEl.textContent = isExpanded ? 'View Progress' : 'Hide Progress';
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
  function openAssignmentViewer(instance) {
    console.log(LOG_PREFIX, 'Opening assignment viewer for:', instance.id);
    
    assignmentViewerState.currentAssignment = instance;
    assignmentViewerState.currentQuestionIndex = 0;
    assignmentViewerState.answers = new Map();
    assignmentViewerState.currentDay = 0;
    
    // Check if assignment is submitted or graded (read-only mode)
    const isReadOnly = instance.status === 'Submitted' || instance.status === 'Graded' || instance.status === 'Reviewed';
    const isGraded = instance.status === 'Graded' || instance.status === 'Reviewed';
    assignmentViewerState.isReadOnly = isReadOnly;
    assignmentViewerState.isGraded = isGraded;
    
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
      // HTML page assignment - render in iframe
      renderHtmlAssignmentPanel(panel, instance);
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
    
    const questionsHtml = questions.map((q) => {
      const questionId = `${dayData.day_number}_${q.number}`;
      const choices = q.choices || [];
      const savedAnswer = assignmentViewerState.answers.get(questionId);
      const isLocked = isRetryMode && retryLockedIds.has(questionId);
      
      const choicesHtml = choices.map(choice => {
        const isChecked = savedAnswer === choice.letter ? 'checked' : '';
        const disabledAttr = (isReadOnly || isLocked) ? 'disabled' : '';
        // In retry mode, mark the correct (selected) choice of a locked question
        const isCorrectLockedChoice = isLocked && savedAnswer === choice.letter;
        const choiceClass = isCorrectLockedChoice ? 'locked-correct' : (isLocked ? 'locked-disabled' : '');
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

      const retryLockedBadge = isLocked ? `<div class="st-retry-correct-badge">✓ Correct</div>` : '';
      
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
          <div class="st-choices">
            ${choicesHtml}
          </div>
          ${hintHtml}
        </div>
      `;
    }).join('');
    
    const readOnlyBanner = isReadOnly ? `
      <div class="st-submitted-banner">
        ${isGraded ? '✓ Graded — Teacher has reviewed your submission' : '✓ Submitted — Waiting for teacher review'}
      </div>
    ` : '';

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
      ${retryBanner}
      ${progressHtml}
      ${vocabHtml}
      ${questionsHtml}
      ${submitQuestionsHtml}
      ${bottomDayTabsHtml}
    `;
    
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
          
          // Remove previous selection styling
          choicesContainer.querySelectorAll('.st-choice').forEach(c => {
            c.classList.remove('selected');
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
          errorMsg.textContent = 'Failed to submit. Please try again.';
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
            'Try Again'
          );
          if (wantRetry) {
            // Enter (or update) retry mode
            const results = submitResult.results || [];
            assignmentViewerState.isRetryMode = true;
            assignmentViewerState.retryLockedQuestionIds = new Set(
              results.filter(r => r.is_correct === true).map(r => r.item_ref)
            );
            renderQuestionsDay(container, dayData, instance);
            showToast('Retry mode active — only your incorrect answers are editable.', 'info');
            return;
          }
        }

        // No retry (score > 60% or student declined) — mark as read-only
        clearSavedAnswers(instance.id);
        assignmentViewerState.isRetryMode = false;
        assignmentViewerState.retryLockedQuestionIds = new Set();
        this.textContent = '✓ Submitted!';
        setTimeout(() => {
          assignmentViewerState.isReadOnly = true;
          renderQuestionsDay(container, dayData, instance);
        }, 1000);
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
      <button class="st-submit-btn" id="submitWritingBtn">Submit Response</button>
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
          
          // Feature 1: Clear saved answers after successful submit
          clearSavedAnswers(instance.id);
          
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
  
  async function clearBuilder() {
    if (!await rcConfirm('Clear Builder', 'Are you sure you want to clear all builder content?', 'Clear', { danger: true })) return;
    
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
        link.textContent = 'View My Assignments';
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
        goalsContainer.innerHTML = activeGoals.map(goal => renderGoalCard(goal, progressMap)).join('');
      }
      
      // Render goals snapshot for dashboard (max 3)
      if (dashGoalsSnapshot) {
        const snapshot = activeGoals.slice(0, 3);
        if (snapshot.length === 0) {
          dashGoalsSnapshot.innerHTML = '<p style="opacity:0.7;">No goals yet</p>';
        } else {
          dashGoalsSnapshot.innerHTML = snapshot.map(goal => renderGoalCard(goal, progressMap)).join('');
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
    const icon = urgent ? '🔴' : '⚠️';
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
      <div class="st-badge ${badge.color}">
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
    const profileName = document.getElementById('profileName');
    const profileCodeEl = document.getElementById('profileCode');
    const profileClass = document.getElementById('profileClass');

    if (!profileCard) return;

    profileCard.style.display = 'block';
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
