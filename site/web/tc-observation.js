// tc-observation.js
// End-of-period observation pop-up engine for the Teacher Center.
// Automatically shows a data-collection modal when class periods are about to end
// and there are students with observational goals in that period.

(async () => {
  'use strict';

  // Only run on Teacher Center pages
  if (!location.pathname.startsWith('/teacher/')) return;

  console.log('[tc-observation] Initializing observation engine');

  // ─── Configuration ────────────────────────────────────────────────────────
  // How many seconds before period end to trigger the observation popup.
  // 600 = 10 minutes, giving a wider window than the original 5 minutes.
  const POPUP_TRIGGER_SECONDS = 600;

  // ─── SVG Icon Constants ───────────────────────────────────────────────────
  const OBS_MET_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  const OBS_NOT_MET_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  const OBS_NOT_ADDRESSED_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
  const OBS_NOT_APPLICABLE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
  const OBS_CLOCK_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const OBS_CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  const OBS_CLIPBOARD_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';

  // ─── Inject Styles ────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = `
/* Observation pop-up overlay */
.obs-overlay { position: fixed; inset: 0; background: rgba(5,7,9,0.75); z-index: 9999; display: flex; align-items: center; justify-content: center; }
.obs-modal { background: var(--rc-bg, #0b1220); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; max-width: 640px; width: 95vw; max-height: 85vh; overflow-y: auto; padding: 24px; color: var(--rc-ink, #e8edf4); }
.obs-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.obs-header-text { display: flex; flex-direction: column; }
.obs-header-title { font-weight: 700; font-size: 16px; display: flex; align-items: center; gap: 8px; }
.obs-header-subtitle { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 2px; }
.obs-countdown { font-variant-numeric: tabular-nums; font-weight: 700; }
.obs-student-section { margin-bottom: 20px; }
.obs-student-name { font-weight: 700; font-size: 15px; margin-bottom: 8px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.obs-goal-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; margin-bottom: 12px; }
.obs-goal-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.obs-goal-desc { font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 10px; }
.obs-response-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.obs-response-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; background: rgba(255,255,255,0.04); color: var(--rc-ink, #e8edf4); cursor: pointer; font-size: 13px; min-height: 44px; min-width: 44px; transition: all 0.15s; }
.obs-response-btn:hover { background: rgba(255,255,255,0.08); }
.obs-response-btn.active[data-response="met"] { background: rgba(34,197,94,0.15); border-color: #22c55e; color: #22c55e; }
.obs-response-btn.active[data-response="not_met"] { background: rgba(239,68,68,0.15); border-color: #ef4444; color: #ef4444; }
.obs-response-btn.active[data-response="not_addressed"] { background: rgba(107,114,128,0.15); border-color: #6b7280; color: #6b7280; }
.obs-response-btn.active[data-response="not_applicable"] { background: rgba(156,163,175,0.15); border-color: #9ca3af; color: #9ca3af; }
.obs-rolling { font-size: 12px; margin-top: 6px; color: rgba(255,255,255,0.5); }
.obs-rolling.on-track { color: #22c55e; }
.obs-rolling.close { color: #f59e0b; }
.obs-rolling.behind { color: #ef4444; }
.obs-note-input { width: 100%; padding: 6px 10px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.04); color: var(--rc-ink, #e8edf4); font-size: 12px; margin-top: 6px; box-sizing: border-box; }
.obs-save-indicator { font-size: 12px; color: #22c55e; }
.obs-save-indicator.offline { color: #f59e0b; }
.obs-dismiss-btn { padding: 10px 24px; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; background: rgba(255,255,255,0.04); color: var(--rc-ink, #e8edf4); cursor: pointer; font-size: 14px; }
.obs-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); }
/* Prompt count buttons */
.obs-prompt-btn { min-width: 48px; text-align: center; justify-content: center; }
.obs-prompt-btn.active { background: rgba(34,197,94,0.15); border-color: #22c55e; }
.obs-prompt-btn.active.over-target { background: rgba(239,68,68,0.15); border-color: #ef4444; }
/* Behavior checklist */
.obs-checklist-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; cursor: pointer; }
.obs-checklist-item input[type="checkbox"] { width: 18px; height: 18px; margin: 0; cursor: pointer; accent-color: #22c55e; }
.obs-checklist-summary { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 4px; }
.obs-not-addressed-btn { font-size: 12px; margin-top: 6px; }
/* Tally inputs */
.obs-tally-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.obs-tally-input { width: 60px; padding: 8px; text-align: center; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.04); color: var(--rc-ink, #e8edf4); font-size: 16px; }
.obs-tally-label { font-size: 13px; color: rgba(255,255,255,0.6); }
.obs-tally-result { font-size: 13px; font-weight: 600; margin-top: 4px; }
.obs-no-opp-link { font-size: 12px; color: rgba(255,255,255,0.5); background: none; border: none; cursor: pointer; text-decoration: underline; margin-top: 4px; padding: 0; }
.obs-no-opp-btns { margin-top: 8px; }
.obs-already-recorded { font-size: 12px; color: #22c55e; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
.obs-edit-link { font-size: 12px; color: rgba(255,255,255,0.5); background: none; border: none; cursor: pointer; text-decoration: underline; padding: 0; }
.obs-completion-summary { font-size: 12px; color: rgba(255,255,255,0.6); display: flex; align-items: center; gap: 4px; }
.obs-done-btn { padding: 10px 20px; border: 1px solid #22c55e; border-radius: 10px; background: rgba(34,197,94,0.1); color: #22c55e; cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
.obs-done-btn:hover { background: rgba(34,197,94,0.2); }
@media (max-width: 640px) {
  .obs-modal { max-width: 100vw; border-radius: 0; }
}
@media (max-width: 480px) {
  .obs-modal { padding: 16px; }
  .obs-response-row { flex-direction: column; }
  .obs-tally-input { width: 50px; }
}
/* Notification icon in topbar */
.obs-notif-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; opacity: 0.75; transition: opacity 0.2s; }
.obs-notif-btn:hover { opacity: 1; }
.obs-notif-badge { position: absolute; top: -4px; right: -4px; background: #ef4444; color: #fff; font-size: 10px; font-weight: 700; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 3px; line-height: 1; pointer-events: none; }
`;
  document.head.appendChild(styleEl);

  // ─── Imports ──────────────────────────────────────────────────────────────
  const { db } = await import('/web/data-adapter.js');
  const { getSchedule, getCurrentPeriod } = await import('/web/class-schedule.js');
  const { buildObservationNotes, parseObservationNotes } = await import('/web/obs-utils.js');

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  function fmtSeconds(s) {
    if (s <= 0) return 'Period ended';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  // ─── State ────────────────────────────────────────────────────────────────
  let allGoals = [];
  let allStudents = [];
  let allEnrollments = [];
  let schedule = null;
  const shownPopups = new Set(); // "YYYY-MM-DD|Period Label"
  let activeOverlay = null;
  let countdownInterval = null;
  let activePopupPeriodLabel = null; // period label of the currently open popup
  let lastInClassPeriodLabel = null; // tracks period transitions for missed-popup detection
  const missedPeriods = [];          // [{key, date, periodLabel, goals}]
  let notifIconEl = null;            // notification icon DOM element
  let missedPopupAutoCloseTimer = null; // auto-close timer for missed-period popups (Issue 5)
  let missedPopupDoneObs = null;        // MutationObserver watching done button (Issue 5)
  let _firstCheck = true;               // diagnostic: log extra detail on first checkPeriod() call

  // ─── localStorage Queue ───────────────────────────────────────────────────
  const QUEUE_KEY = 'rc_obs_pending';

  // ─── sessionStorage — Missed Periods Persistence ─────────────────────────
  const MISSED_PERIODS_KEY = 'rc_obs_missed_periods';

  function readMissedPeriodsFromStorage() {
    try {
      return JSON.parse(sessionStorage.getItem(MISSED_PERIODS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function writeMissedPeriodsToStorage() {
    try {
      sessionStorage.setItem(MISSED_PERIODS_KEY, JSON.stringify(missedPeriods));
    } catch (err) {
      console.warn('[tc-observation] sessionStorage write failed:', err.message);
    }
  }

  // ─── Time Helper ──────────────────────────────────────────────────────────
  // Converts an "HH:MM" time string to total seconds since midnight.
  // Returns 0 for any invalid input so callers can safely guard with !endSecs.
  function parseTimeToSeconds(hhmm) {
    if (!hhmm) return 0;
    const parts = String(hhmm).split(':');
    if (parts.length !== 2) return 0;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return 0;
    return h * 3600 + m * 60;
  }

  function readQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function writeQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  function markSynced(savedAt, studentCode, goalCode) {
    const queue = readQueue();
    for (const e of queue) {
      if (e.saved_at === savedAt && e.student_code === studentCode && e.goal_code === goalCode) {
        e.synced = true;
      }
    }
    writeQueue(queue);
  }

  function pruneQueue() {
    const queue = readQueue();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const pruned = queue.filter(e => {
      if (!e.synced) return true;
      return new Date(e.saved_at).getTime() > cutoff;
    });
    writeQueue(pruned);
  }

  async function syncQueue() {
    const queue = readQueue();
    const unsynced = queue.filter(e => !e.synced);
    if (unsynced.length === 0) return;

    for (const entry of unsynced) {
      try {
        const goal = allGoals.find(g => g.code === entry.goal_code);
        if (!goal) continue;
        await db.addProgress({
          student_code: entry.student_code,
          goal_id: goal.id,
          date: entry.date,
          percent: entry.value,
          method: 'Observation',
          by_name: 'Teacher',
          via: 'observation_popup',
          notes: entry.notes || ''
        });
        markSynced(entry.saved_at, entry.student_code, entry.goal_code);
      } catch (err) {
        // Silently fail — will retry on next sync cycle
        console.warn('[tc-observation] Sync failed for', entry.goal_code, err.message);
      }
    }
    pruneQueue();
  }

  // ─── Data Loading ─────────────────────────────────────────────────────────
  async function loadData() {
    try {
      const [goals, students, enrollments, sched] = await Promise.all([
        db.listGoalsAll(),
        db.listStudents(),
        db.listClassEnrollments(),
        getSchedule()
      ]);

      const rawGoals = goals || [];
      const obsTypeGoals = rawGoals.filter(g => g.measurement_type === 'Observation');
      const withConfig = obsTypeGoals.filter(g => g.observation_config != null);
      const withPeriods = withConfig.filter(g =>
        Array.isArray(g.observation_config.class_periods) &&
        g.observation_config.class_periods.length > 0
      );

      allGoals = withConfig;
      allStudents = students || [];
      allEnrollments = enrollments || [];
      schedule = sched;

      console.group('[tc-observation] loadData: data summary');
      console.log('Total goals (all types):', rawGoals.length);
      console.log('  → measurement_type === "Observation":', obsTypeGoals.length);
      console.log('  → have non-null observation_config:', withConfig.length);
      console.log('  → have non-empty class_periods:', withPeriods.length);
      if (withConfig.length > 0) {
        console.group('Observation goals detail');
        for (const g of withConfig) {
          console.log(
            `goal=${g.code} student=${g.student_code}`,
            `category=${g.observation_config?.category ?? '(none)'}`,
            `class_periods=${JSON.stringify(g.observation_config?.class_periods ?? [])}`
          );
        }
        console.groupEnd();
      }
      if (!sched) {
        console.warn('[tc-observation] ⚠️ No class schedule configured. Go to Settings → Class Schedule to set up your period times.');
      } else if (!Array.isArray(sched.periods) || sched.periods.length === 0) {
        console.warn('[tc-observation] ⚠️ Schedule loaded but schedule.periods is empty. Go to Settings → Class Schedule to add period times.');
      } else {
        console.log('Schedule loaded successfully —', sched.periods.length, 'period(s):');
        console.group('Schedule periods');
        for (const p of sched.periods) {
          console.log(`label="${p.label}" start=${p.start} end=${p.end}`);
        }
        console.groupEnd();
      }
      console.log('Total students loaded:', allStudents.length);
      console.log('Total enrollments loaded:', allEnrollments.length);
      console.groupEnd();

      // ── Period label cross-reference check ───────────────────────────────
      if (sched && Array.isArray(sched.periods) && sched.periods.length > 0 && withConfig.length > 0) {
        const scheduledLabels = new Set(sched.periods.map(p => p.label));
        const referencedLabels = new Set(
          withConfig.flatMap(g => g.observation_config?.class_periods ?? [])
        );

        const orphaned = [...referencedLabels].filter(l => !scheduledLabels.has(l));
        const uncovered = [...scheduledLabels].filter(l => !referencedLabels.has(l));

        console.group('[tc-observation] Period label cross-reference check');
        if (orphaned.length > 0) {
          console.warn(
            '⚠️ Orphaned period references (in goals but NOT in schedule) — these goals will NEVER trigger a popup:',
            orphaned
          );
          console.warn('  Schedule has:', [...scheduledLabels]);
          console.warn('  Goals reference:', [...referencedLabels]);
        } else {
          console.log('✓ All goal class_periods match a schedule label');
        }
        if (uncovered.length > 0) {
          console.log('Uncovered schedule periods (no observation goals assigned):', uncovered);
        } else {
          console.log('✓ Every schedule period has at least one observation goal');
        }
        console.groupEnd();
      }
    } catch (err) {
      console.warn('[tc-observation] Data load error:', err.message);
    }
  }

  // ─── Rolling Progress ─────────────────────────────────────────────────────
  async function loadRollingProgress(goal) {
    try {
      const config = goal.observation_config || {};
      const window_ = config.target_window || 5;

      // Load recent progress entries for this goal
      const entries = await db.listGoalProgress({
        goalCodes: [goal.code],
        studentCodes: [goal.student_code],
        limit: window_ * 3
      });

      if (!entries || entries.length === 0) return { met: 0, window: window_, target: config.target_met || 3 };

      // Sort descending and take last N
      const sorted = entries
        .filter(e => e.value !== null)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, window_);

      const metCount = sorted.filter(e => e.value === 100).length;
      return { met: metCount, window: sorted.length, target: config.target_met || 3 };
    } catch {
      return null;
    }
  }

  // ─── Duplicate Check ──────────────────────────────────────────────────────
  function isAlreadyRecorded(studentCode, goalCode, date, periodLabel) {
    const queue = readQueue();
    return queue.some(e =>
      e.student_code === studentCode &&
      e.goal_code === goalCode &&
      e.date === date &&
      e.period_label === periodLabel
    );
  }

  function getQueueEntry(studentCode, goalCode, date, periodLabel) {
    const queue = readQueue();
    return queue.find(e =>
      e.student_code === studentCode &&
      e.goal_code === goalCode &&
      e.date === date &&
      e.period_label === periodLabel
    ) || null;
  }

  function replaceOrPushToQueue(entry) {
    const queue = readQueue();
    const idx = queue.findIndex(e =>
      e.student_code === entry.student_code &&
      e.goal_code === entry.goal_code &&
      e.date === entry.date &&
      e.period_label === entry.period_label
    );
    if (idx >= 0) {
      queue[idx] = entry;
    } else {
      queue.push(entry);
    }
    writeQueue(queue);
  }

  // buildNotes is now provided by obs-utils.js (imported as buildObservationNotes)

  // ─── Calculate Value ──────────────────────────────────────────────────────
  function calcValue(category, responseData) {
    const { response, successful, opportunities, promptCount, checkedBehaviors, subBehaviors } = responseData;

    if (category === 'session_outcome') {
      if (response === 'met') return 100;
      if (response === 'not_met') return 0;
      return null; // not_addressed / not_applicable
    }

    if (category === 'tally') {
      if (response) return null; // special status button (not_addressed etc.)
      const s = Number(successful) || 0;
      const o = Number(opportunities) || 0;
      if (o === 0) return null;
      return Math.round((s / o) * 10000) / 100; // percentage with 2 decimal places
    }

    if (category === 'prompt_count') {
      return promptCount != null ? Number(promptCount) : null;
    }

    if (category === 'behavior_checklist') {
      if (!subBehaviors || subBehaviors.length === 0) return null;
      if (response === 'not_addressed') return null;
      const checked = (checkedBehaviors || []).filter(Boolean).length;
      return Math.round((checked / subBehaviors.length) * 10000) / 100; // percentage with 2 decimal places
    }

    return null;
  }

  // ─── Save Observation ─────────────────────────────────────────────────────
  async function saveObservation(goal, responseData, noteText, periodLabel, saveIndicatorEl, onSave) {
    const category = goal.observation_config?.category;
    const value = calcValue(category, responseData);
    const notes = buildObservationNotes(category, responseData, noteText);
    const date = todayStr();

    console.log(
      '[tc-observation] saveObservation: goal=', goal.code,
      'student=', goal.student_code,
      'category=', category,
      'value=', value,
      'period=', periodLabel
    );

    const savedAt = new Date().toISOString();
    const queueEntry = {
      student_code: goal.student_code,
      goal_code: goal.code,
      date,
      value,
      notes,
      period_label: periodLabel,
      saved_at: savedAt,
      synced: false
    };

    replaceOrPushToQueue(queueEntry);
    if (onSave) onSave();

    // Attempt Supabase save
    try {
      await db.addProgress({
        student_code: goal.student_code,
        goal_id: goal.id,
        date,
        percent: value,
        method: 'Observation',
        by_name: 'Teacher',
        via: 'observation_popup',
        notes
      });
      markSynced(savedAt, goal.student_code, goal.code);
      console.log('[tc-observation] Supabase save succeeded: goal=', goal.code, 'student=', goal.student_code);
      if (saveIndicatorEl) {
        saveIndicatorEl.textContent = 'Auto-saved ✓';
        saveIndicatorEl.className = 'obs-save-indicator';
      }
    } catch (err) {
      console.warn('[tc-observation] Supabase save failed — queued locally:', err.message);
      if (saveIndicatorEl) {
        saveIndicatorEl.textContent = 'Saved locally — will sync when connected';
        saveIndicatorEl.className = 'obs-save-indicator offline';
      }
    }
  }

  // ─── Render Category Form ─────────────────────────────────────────────────
  function renderSessionOutcomeForm(goal, cardEl, saveIndicatorEl, periodLabel, preRecorded, onSave) {
    const config = goal.observation_config || {};
    const container = document.createElement('div');

    // Already recorded badge
    let badgeEl = null;
    if (preRecorded) {
      badgeEl = document.createElement('div');
      badgeEl.className = 'obs-already-recorded';
      badgeEl.innerHTML = OBS_MET_SVG + ' Already recorded today';
      const editBtn = document.createElement('button');
      editBtn.className = 'obs-edit-link';
      editBtn.textContent = 'Edit';
      badgeEl.appendChild(editBtn);
      container.appendChild(badgeEl);
    }

    // Form wrapper (hidden when preRecorded, revealed by Edit)
    const formWrapper = document.createElement('div');
    if (preRecorded) formWrapper.style.display = 'none';

    // Response buttons
    const row = document.createElement('div');
    row.className = 'obs-response-row';
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', 'Session outcome');
    const buttons = [
      { label: 'Met', response: 'met', ariaLabel: 'Mark as Met', svg: OBS_MET_SVG },
      { label: 'Not Met', response: 'not_met', ariaLabel: 'Mark as Not Met', svg: OBS_NOT_MET_SVG },
      { label: 'Not Addressed', response: 'not_addressed', ariaLabel: 'Mark as Not Addressed', svg: OBS_NOT_ADDRESSED_SVG },
      { label: 'Not Applicable', response: 'not_applicable', ariaLabel: 'Mark as Not Applicable', svg: OBS_NOT_APPLICABLE_SVG }
    ];

    let selectedResponse = null;

    buttons.forEach(({ label, response, ariaLabel, svg }) => {
      const btn = document.createElement('button');
      btn.className = 'obs-response-btn';
      btn.dataset.response = response;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.setAttribute('aria-label', ariaLabel);
      btn.innerHTML = svg + ' ' + label;
      btn.addEventListener('click', async () => {
        row.querySelectorAll('.obs-response-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
        selectedResponse = response;
        await saveObservation(goal, { response }, noteInput.value, periodLabel, saveIndicatorEl, onSave);
      });
      row.appendChild(btn);
    });
    formWrapper.appendChild(row);

    // Rolling progress (async)
    const rollingEl = document.createElement('div');
    rollingEl.className = 'obs-rolling';
    rollingEl.textContent = 'Loading progress…';
    formWrapper.appendChild(rollingEl);

    loadRollingProgress(goal).then(prog => {
      if (!prog) {
        rollingEl.textContent = '';
        return;
      }
      const { met, window: w, target } = prog;
      rollingEl.textContent = `Rolling: ${met} of last ${w} → target ${target} of ${config.target_window || w}`;
      const diff = met - target;
      if (diff >= 0) rollingEl.className = 'obs-rolling on-track';
      else if (diff >= -1) rollingEl.className = 'obs-rolling close';
      else rollingEl.className = 'obs-rolling behind';
    });

    // Note input
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'obs-note-input';
    noteInput.placeholder = 'Optional note…';
    noteInput.addEventListener('change', async () => {
      if (selectedResponse) {
        await saveObservation(goal, { response: selectedResponse }, noteInput.value, periodLabel, saveIndicatorEl, onSave);
      }
    });
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    // Wire up Edit button
    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        // Pre-populate from queue
        const queueEntry = getQueueEntry(goal.student_code, goal.code, todayStr(), periodLabel);
        const parsed = queueEntry ? parseObservationNotes(queueEntry.notes) : null;
        if (parsed && parsed.category === 'session_outcome') {
          const matchingBtn = row.querySelector(`[data-response="${parsed.rawData}"]`);
          if (matchingBtn) {
            row.querySelectorAll('.obs-response-btn').forEach(b => {
              b.classList.remove('active');
              b.setAttribute('aria-checked', 'false');
            });
            matchingBtn.classList.add('active');
            matchingBtn.setAttribute('aria-checked', 'true');
            selectedResponse = parsed.rawData;
          }
          if (parsed.userNote) noteInput.value = parsed.userNote;
        }
        noteInput.focus();
      });
    }

    cardEl.appendChild(container);
  }

  function renderTallyForm(goal, cardEl, saveIndicatorEl, periodLabel, preRecorded, onSave) {
    const container = document.createElement('div');

    let badgeEl = null;
    if (preRecorded) {
      badgeEl = document.createElement('div');
      badgeEl.className = 'obs-already-recorded';
      badgeEl.innerHTML = OBS_MET_SVG + ' Already recorded today';
      const editBtn = document.createElement('button');
      editBtn.className = 'obs-edit-link';
      editBtn.textContent = 'Edit';
      badgeEl.appendChild(editBtn);
      container.appendChild(badgeEl);
    }

    const formWrapper = document.createElement('div');
    if (preRecorded) formWrapper.style.display = 'none';

    // Tally inputs
    const tallyRow = document.createElement('div');
    tallyRow.className = 'obs-tally-row';

    const succInput = document.createElement('input');
    succInput.type = 'number';
    succInput.min = '0';
    succInput.className = 'obs-tally-input';
    succInput.placeholder = '0';

    const ofLabel = document.createElement('span');
    ofLabel.className = 'obs-tally-label';
    ofLabel.textContent = 'of';

    const oppInput = document.createElement('input');
    oppInput.type = 'number';
    oppInput.min = '0';
    oppInput.className = 'obs-tally-input';
    oppInput.placeholder = '0';

    const oppLabel = document.createElement('span');
    oppLabel.className = 'obs-tally-label';
    oppLabel.textContent = 'opportunities';

    tallyRow.append(succInput, ofLabel, oppInput, oppLabel);
    formWrapper.appendChild(tallyRow);

    // Percentage display
    const resultEl = document.createElement('div');
    resultEl.className = 'obs-tally-result';
    formWrapper.appendChild(resultEl);

    let noOppResponse = null;

    const updateTally = async () => {
      const s = Number(succInput.value) || 0;
      const o = Number(oppInput.value) || 0;
      if (o > 0) {
        const pct = Math.round((s / o) * 100);
        resultEl.textContent = `${pct}%`;
        await saveObservation(goal, { successful: s, opportunities: o }, noteInput.value, periodLabel, saveIndicatorEl, onSave);
      } else {
        resultEl.textContent = '';
      }
    };

    succInput.addEventListener('change', updateTally);
    oppInput.addEventListener('change', updateTally);

    // No opportunities toggle
    const noOppLink = document.createElement('button');
    noOppLink.className = 'obs-no-opp-link';
    noOppLink.textContent = 'No opportunities today?';
    formWrapper.appendChild(noOppLink);

    const noOppBtns = document.createElement('div');
    noOppBtns.className = 'obs-no-opp-btns obs-response-row';
    noOppBtns.style.display = 'none';

    [
      { label: 'Met', response: 'met', svg: OBS_MET_SVG },
      { label: 'Not Met', response: 'not_met', svg: OBS_NOT_MET_SVG },
      { label: 'Not Addressed', response: 'not_addressed', svg: OBS_NOT_ADDRESSED_SVG },
      { label: 'Not Applicable', response: 'not_applicable', svg: OBS_NOT_APPLICABLE_SVG }
    ].forEach(({ label, response, svg }) => {
      const btn = document.createElement('button');
      btn.className = 'obs-response-btn';
      btn.dataset.response = response;
      btn.setAttribute('aria-label', label);
      btn.innerHTML = svg + ' ' + label;
      btn.addEventListener('click', async () => {
        noOppBtns.querySelectorAll('.obs-response-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        noOppResponse = response;
        await saveObservation(goal, { response }, noteInput.value, periodLabel, saveIndicatorEl, onSave);
      });
      noOppBtns.appendChild(btn);
    });

    noOppLink.addEventListener('click', () => {
      noOppBtns.style.display = noOppBtns.style.display === 'none' ? 'flex' : 'none';
    });

    formWrapper.appendChild(noOppBtns);

    // Note input
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'obs-note-input';
    noteInput.placeholder = 'Optional note…';
    noteInput.addEventListener('change', async () => {
      const s = Number(succInput.value) || 0;
      const o = Number(oppInput.value) || 0;
      if (noOppResponse) {
        await saveObservation(goal, { response: noOppResponse }, noteInput.value, periodLabel, saveIndicatorEl, onSave);
      } else if (o > 0) {
        await saveObservation(goal, { successful: s, opportunities: o }, noteInput.value, periodLabel, saveIndicatorEl, onSave);
      }
    });
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    // Wire up Edit button
    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        const queueEntry = getQueueEntry(goal.student_code, goal.code, todayStr(), periodLabel);
        const parsed = queueEntry ? parseObservationNotes(queueEntry.notes) : null;
        if (parsed && parsed.category === 'tally') {
          const parts = parsed.rawData.split('/');
          if (parts.length === 2) {
            succInput.value = parts[0];
            oppInput.value = parts[1];
            const s = Number(parts[0]) || 0;
            const o = Number(parts[1]) || 0;
            if (o > 0) resultEl.textContent = `${Math.round((s / o) * 100)}%`;
          }
          if (parsed.userNote) noteInput.value = parsed.userNote;
        }
        succInput.focus();
      });
    }

    cardEl.appendChild(container);
  }

  function renderPromptCountForm(goal, cardEl, saveIndicatorEl, periodLabel, preRecorded, onSave) {
    const config = goal.observation_config || {};
    const maxPrompts = config.target_max_prompts ?? 2;
    const container = document.createElement('div');

    let badgeEl = null;
    if (preRecorded) {
      badgeEl = document.createElement('div');
      badgeEl.className = 'obs-already-recorded';
      badgeEl.innerHTML = OBS_MET_SVG + ' Already recorded today';
      const editBtn = document.createElement('button');
      editBtn.className = 'obs-edit-link';
      editBtn.textContent = 'Edit';
      badgeEl.appendChild(editBtn);
      container.appendChild(badgeEl);
    }

    const formWrapper = document.createElement('div');
    if (preRecorded) formWrapper.style.display = 'none';

    const row = document.createElement('div');
    row.className = 'obs-response-row';

    let selectedCount = null;

    const statusEl = document.createElement('div');
    statusEl.className = 'obs-rolling';
    statusEl.textContent = `Target: ${maxPrompts} or fewer prompts`;

    [0, 1, 2, 3, '4+'].forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'obs-response-btn obs-prompt-btn';
      btn.textContent = String(val);
      btn.setAttribute('aria-label', `${val} prompts`);
      btn.addEventListener('click', async () => {
        row.querySelectorAll('.obs-prompt-btn').forEach(b => {
          b.classList.remove('active', 'over-target');
        });
        const numVal = val === '4+' ? 4 : Number(val);
        btn.classList.add('active');
        if (numVal > maxPrompts) btn.classList.add('over-target');
        selectedCount = numVal;

        statusEl.textContent = `Target: ${maxPrompts} or fewer prompts`;
        statusEl.style.color = numVal <= maxPrompts ? '#22c55e' : '#ef4444';

        await saveObservation(goal, { promptCount: numVal }, noteInput.value, periodLabel, saveIndicatorEl, onSave);
      });
      row.appendChild(btn);
    });
    formWrapper.appendChild(row);
    formWrapper.appendChild(statusEl);

    // Note input
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'obs-note-input';
    noteInput.placeholder = 'Optional note…';
    noteInput.addEventListener('change', async () => {
      if (selectedCount !== null) {
        await saveObservation(goal, { promptCount: selectedCount }, noteInput.value, periodLabel, saveIndicatorEl, onSave);
      }
    });
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    // Wire up Edit button
    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        const queueEntry = getQueueEntry(goal.student_code, goal.code, todayStr(), periodLabel);
        const parsed = queueEntry ? parseObservationNotes(queueEntry.notes) : null;
        if (parsed && parsed.category === 'prompt_count') {
          const preCount = parseInt(parsed.rawData, 10);
          if (!isNaN(preCount)) {
            const matchLabel = preCount >= 4 ? '4+' : String(preCount);
            const matchBtn = [...row.querySelectorAll('.obs-prompt-btn')].find(
              b => b.textContent.trim() === matchLabel
            );
            if (matchBtn) {
              row.querySelectorAll('.obs-prompt-btn').forEach(b => b.classList.remove('active', 'over-target'));
              matchBtn.classList.add('active');
              if (preCount > maxPrompts) matchBtn.classList.add('over-target');
              selectedCount = preCount;
              statusEl.style.color = preCount <= maxPrompts ? '#22c55e' : '#ef4444';
            }
          }
          if (parsed.userNote) noteInput.value = parsed.userNote;
        }
      });
    }

    cardEl.appendChild(container);
  }

  function renderBehaviorChecklistForm(goal, cardEl, saveIndicatorEl, periodLabel, preRecorded, onSave) {
    const config = goal.observation_config || {};
    const subBehaviors = Array.isArray(config.sub_behaviors) ? config.sub_behaviors : [];
    const container = document.createElement('div');

    let badgeEl = null;
    if (preRecorded) {
      badgeEl = document.createElement('div');
      badgeEl.className = 'obs-already-recorded';
      badgeEl.innerHTML = OBS_MET_SVG + ' Already recorded today';
      const editBtn = document.createElement('button');
      editBtn.className = 'obs-edit-link';
      editBtn.textContent = 'Edit';
      badgeEl.appendChild(editBtn);
      container.appendChild(badgeEl);
    }

    const formWrapper = document.createElement('div');
    if (preRecorded) formWrapper.style.display = 'none';

    if (subBehaviors.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.4);';
      msg.textContent = 'No sub-behaviors configured for this goal.';
      formWrapper.appendChild(msg);
      container.appendChild(formWrapper);
      cardEl.appendChild(container);
      return;
    }

    const checkedStates = subBehaviors.map(() => false);

    const summaryEl = document.createElement('div');
    summaryEl.className = 'obs-checklist-summary';

    const updateSummary = () => {
      const n = checkedStates.filter(Boolean).length;
      summaryEl.textContent = `${n} of ${subBehaviors.length} behaviors demonstrated`;
    };
    updateSummary();

    const saveChecklist = async () => {
      await saveObservation(
        goal,
        { checkedBehaviors: checkedStates, subBehaviors },
        noteInput.value,
        periodLabel,
        saveIndicatorEl,
        onSave
      );
    };

    subBehaviors.forEach((sb, idx) => {
      const item = document.createElement('label');
      item.className = 'obs-checklist-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', async () => {
        checkedStates[idx] = cb.checked;
        updateSummary();
        await saveChecklist();
      });

      item.appendChild(cb);
      item.appendChild(document.createTextNode(sb));
      formWrapper.appendChild(item);
    });

    formWrapper.appendChild(summaryEl);

    // Not Addressed button
    const notAddressedBtn = document.createElement('button');
    notAddressedBtn.className = 'obs-response-btn obs-not-addressed-btn';
    notAddressedBtn.dataset.response = 'not_addressed';
    notAddressedBtn.setAttribute('aria-label', 'Mark all behaviors as not addressed today');
    notAddressedBtn.innerHTML = OBS_NOT_ADDRESSED_SVG + ' Not Addressed Today';
    notAddressedBtn.addEventListener('click', async () => {
      notAddressedBtn.classList.toggle('active');
      await saveObservation(
        goal,
        { response: 'not_addressed', checkedBehaviors: checkedStates, subBehaviors },
        noteInput.value,
        periodLabel,
        saveIndicatorEl,
        onSave
      );
    });
    formWrapper.appendChild(notAddressedBtn);

    // Note input
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'obs-note-input';
    noteInput.placeholder = 'Optional note…';
    noteInput.addEventListener('change', saveChecklist);
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    // Wire up Edit button
    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        const queueEntry = getQueueEntry(goal.student_code, goal.code, todayStr(), periodLabel);
        const parsed = queueEntry ? parseObservationNotes(queueEntry.notes) : null;
        if (parsed && parsed.category === 'checklist') {
          if (parsed.rawData === 'not_addressed') {
            notAddressedBtn.classList.add('active');
          } else {
            const items = parsed.rawData ? parsed.rawData.split(',') : [];
            const cbs = formWrapper.querySelectorAll('input[type="checkbox"]');
            items.forEach((item, idx) => {
              const isMet = item.endsWith('=met');
              if (isMet && cbs[idx]) {
                cbs[idx].checked = true;
                checkedStates[idx] = true;
              }
            });
            updateSummary();
          }
          if (parsed.userNote) noteInput.value = parsed.userNote;
        }
      });
    }

    cardEl.appendChild(container);
  }

  // ─── Build Pop-Up Content ─────────────────────────────────────────────────
  function buildPopupContent(periodLabel, goalsForPeriod, studentsMap, overlayEl) {
    const modal = document.createElement('div');
    modal.className = 'obs-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'obs-modal-title');
    modal.setAttribute('tabindex', '-1');

    // Header
    const header = document.createElement('div');
    header.className = 'obs-header';
    header.innerHTML = OBS_CLOCK_SVG;

    const headerText = document.createElement('div');
    headerText.className = 'obs-header-text';

    const titleEl = document.createElement('div');
    titleEl.className = 'obs-header-title';
    titleEl.id = 'obs-modal-title';
    titleEl.innerHTML = escapeHtml(periodLabel) + ' — ending in <span class="obs-countdown" id="obs-countdown">…</span>';

    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'obs-header-subtitle';
    subtitleEl.textContent = 'Observational Data Collection';

    headerText.appendChild(titleEl);
    headerText.appendChild(subtitleEl);
    header.appendChild(headerText);
    modal.appendChild(header);

    // Save indicator (shared)
    const saveIndicatorEl = document.createElement('div');
    saveIndicatorEl.className = 'obs-save-indicator';
    saveIndicatorEl.style.minHeight = '18px';

    // Completion tracking elements (defined early for updateCompletion closure)
    const totalGoals = goalsForPeriod.length;
    const date = todayStr();

    const completionSummaryEl = document.createElement('span');
    completionSummaryEl.className = 'obs-completion-summary';

    const doneBtn = document.createElement('button');
    doneBtn.className = 'obs-done-btn';
    doneBtn.style.display = 'none';
    doneBtn.innerHTML = OBS_CHECK_SVG + ' Done — Save &amp; Close';
    doneBtn.addEventListener('click', closePopup);

    const updateCompletion = () => {
      const nowRecorded = goalsForPeriod.filter(g =>
        isAlreadyRecorded(g.student_code, g.code, date, periodLabel)
      ).length;
      if (nowRecorded >= totalGoals) {
        completionSummaryEl.innerHTML = OBS_CHECK_SVG + ' All goals recorded';
        completionSummaryEl.style.color = '#22c55e';
        doneBtn.style.display = '';
      } else {
        completionSummaryEl.textContent = `${nowRecorded} of ${totalGoals} goals recorded`;
        completionSummaryEl.style.color = 'rgba(255,255,255,0.6)';
        doneBtn.style.display = 'none';
      }
    };

    // Group goals by student
    const byStudent = new Map();
    for (const goal of goalsForPeriod) {
      if (!byStudent.has(goal.student_code)) byStudent.set(goal.student_code, []);
      byStudent.get(goal.student_code).push(goal);
    }

    for (const [studentCode, goals] of byStudent) {
      const studentInfo = studentsMap.get(studentCode);
      const studentName = studentInfo ? studentInfo.name : studentCode;

      const section = document.createElement('div');
      section.className = 'obs-student-section';

      const nameEl = document.createElement('div');
      nameEl.className = 'obs-student-name';
      nameEl.textContent = `▸ ${studentName} (${studentCode})`;
      section.appendChild(nameEl);

      for (const goal of goals) {
        const config = goal.observation_config || {};
        const category = config.category;
        const isRecorded = isAlreadyRecorded(studentCode, goal.code, date, periodLabel);

        const card = document.createElement('div');
        card.className = 'obs-goal-card';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'obs-goal-title';
        titleDiv.textContent = `${goal.code} — ${goal.goal_area || 'Goal'}`;
        card.appendChild(titleDiv);

        if (goal.desc) {
          const descDiv = document.createElement('div');
          descDiv.className = 'obs-goal-desc';
          // Truncate long descriptions
          const desc = goal.desc.length > 120 ? goal.desc.slice(0, 120) + '…' : goal.desc;
          descDiv.textContent = desc;
          card.appendChild(descDiv);
        }

        if (category === 'session_outcome') {
          renderSessionOutcomeForm(goal, card, saveIndicatorEl, periodLabel, isRecorded, updateCompletion);
        } else if (category === 'tally') {
          renderTallyForm(goal, card, saveIndicatorEl, periodLabel, isRecorded, updateCompletion);
        } else if (category === 'prompt_count') {
          renderPromptCountForm(goal, card, saveIndicatorEl, periodLabel, isRecorded, updateCompletion);
        } else if (category === 'behavior_checklist') {
          renderBehaviorChecklistForm(goal, card, saveIndicatorEl, periodLabel, isRecorded, updateCompletion);
        }

        section.appendChild(card);
      }

      modal.appendChild(section);
    }

    // Initial completion count
    updateCompletion();

    // Footer
    const footer = document.createElement('div');
    footer.className = 'obs-footer';
    footer.appendChild(saveIndicatorEl);
    footer.appendChild(completionSummaryEl);
    footer.appendChild(doneBtn);

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'obs-dismiss-btn';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss observation data collection');
    dismissBtn.addEventListener('click', () => {
      closePopup();
    });
    footer.appendChild(dismissBtn);
    modal.appendChild(footer);

    // Keyboard accessibility: Escape + Tab trap
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePopup();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = [...modal.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !modal.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modal.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    });

    overlayEl.appendChild(modal);
  }

  // ─── Show / Close Pop-Up ──────────────────────────────────────────────────
  function showPopup(periodInfo) {
    const { period, remainingSeconds } = periodInfo;
    const periodLabel = period.label;
    const date = todayStr();
    const popupKey = `${date}|${periodLabel}`;

    if (shownPopups.has(popupKey)) {
      console.log('[tc-observation] showPopup: suppressed (already shown this session) —', periodLabel);
      return;
    }
    shownPopups.add(popupKey);

    // Find goals for this period — log match details
    console.group('[tc-observation] showPopup: goal-period matching for "' + periodLabel + '"');
    const goalsForPeriod = [];
    for (const g of allGoals) {
      const cfg = g.observation_config;
      const periods = cfg?.class_periods ?? [];
      if (Array.isArray(periods) && periods.includes(periodLabel)) {
        goalsForPeriod.push(g);
        console.log(`  ✓ MATCH  goal=${g.code} student=${g.student_code} class_periods=${JSON.stringify(periods)}`);
      } else {
        console.log(
          `  ✗ NO MATCH  goal=${g.code} student=${g.student_code}`,
          `class_periods=${JSON.stringify(periods)} — does not include "${periodLabel}"`
        );
      }
    }
    console.log(`Total matched: ${goalsForPeriod.length} / ${allGoals.length}`);

    if (goalsForPeriod.length === 0) {
      console.warn('[tc-observation] showPopup: no observation goals for period —', periodLabel);
      console.groupEnd();
      return;
    }

    // Check if ALL goals already have data; if so, don't show — log per-goal allRecorded check
    console.group('allRecorded check per goal');
    const recordedFlags = goalsForPeriod.map(g => {
      const recorded = isAlreadyRecorded(g.student_code, g.code, date, periodLabel);
      console.log(`  goal=${g.code} student=${g.student_code} already recorded=${recorded}`);
      return recorded;
    });
    const allRecorded = recordedFlags.every(Boolean);
    console.log('allRecorded (all goals recorded):', allRecorded);
    console.groupEnd();
    console.groupEnd();

    if (allRecorded) {
      console.log('[tc-observation] showPopup: suppressed (all goals already recorded) —', periodLabel);
      return;
    }

    console.log(
      '[tc-observation] showPopup: opening popup for', periodLabel,
      '—', goalsForPeriod.length, 'goals,', fmtSeconds(remainingSeconds), 'remaining'
    );

    activePopupPeriodLabel = periodLabel;

    // Build student map
    const studentsMap = new Map(allStudents.map(s => [s.code, s]));

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'obs-overlay';
    overlay.setAttribute('role', 'presentation');

    buildPopupContent(periodLabel, goalsForPeriod, studentsMap, overlay);
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    // Focus the modal for keyboard accessibility
    const modal = overlay.querySelector('.obs-modal');
    if (modal) modal.focus();

    // Start countdown with color transitions
    let remaining = remainingSeconds;
    const countdownEl = overlay.querySelector('#obs-countdown');
    const titleEl = overlay.querySelector('#obs-modal-title');

    const setCountdownColor = (secs) => {
      if (!countdownEl) return;
      if (secs <= 0) countdownEl.style.color = 'rgba(255,255,255,0.4)';
      else if (secs > 120) countdownEl.style.color = '#22c55e';
      else if (secs > 60) countdownEl.style.color = '#f59e0b';
      else countdownEl.style.color = '#ef4444';
    };

    if (countdownEl) {
      countdownEl.textContent = fmtSeconds(remaining);
      setCountdownColor(remaining);
    }

    let periodEnded = false;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      remaining--;
      if (countdownEl) {
        countdownEl.textContent = fmtSeconds(remaining);
        setCountdownColor(remaining);
      }
      if (remaining <= 0 && !periodEnded) {
        periodEnded = true;
        if (titleEl) {
          titleEl.innerHTML = escapeHtml(periodLabel) + ' — <span style="color:rgba(255,255,255,0.5);font-weight:400;">Period ended — finish recording</span>';
        }
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);
  }

  function closePopup() {
    console.log('[tc-observation] closePopup: popup dismissed for period —', activePopupPeriodLabel || '(unknown)');

    const closedPeriodLabel = activePopupPeriodLabel;

    // Issue 5: Cancel any pending auto-close timer and disconnect the done-button observer
    // so they don't fire after the popup has already been closed manually.
    if (missedPopupAutoCloseTimer) {
      clearTimeout(missedPopupAutoCloseTimer);
      missedPopupAutoCloseTimer = null;
    }
    if (missedPopupDoneObs) {
      missedPopupDoneObs.disconnect();
      missedPopupDoneObs = null;
    }

    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (activeOverlay) {
      activeOverlay.remove();
      activeOverlay = null;
    }

    // Issue 1: After removing the overlay, check if the closed period is a missed-period
    // entry. If so, remove it from the missed list and update the badge. This enables
    // cycling — the teacher opens one missed period, closes it (recorded or not), and the
    // badge decrements so the next click shows the next oldest missed period.
    if (closedPeriodLabel) {
      const date = todayStr();
      const missedKey = `${date}|${closedPeriodLabel}`;
      const wasMissed = missedPeriods.some(m => m.key === missedKey);

      if (wasMissed) {
        // Missed-period popup was closed — remove it from the notification list.
        // The goals data has already been saved (or is still pending); removing from the
        // list just dismisses the notification so the teacher can cycle to the next one.
        console.log(
          '[tc-observation] closePopup: removing missed period', closedPeriodLabel,
          'from notification list'
        );
        removeMissedPeriod(missedKey);
      } else {
        // Regular (live) popup close — check if any goals are still unrecorded and add
        // them to the missed list so the teacher can come back via the notification icon.
        const unrecordedGoals = allGoals.filter(g => {
          const cfg = g.observation_config;
          return Array.isArray(cfg?.class_periods) &&
                 cfg.class_periods.includes(closedPeriodLabel) &&
                 !isAlreadyRecorded(g.student_code, g.code, date, closedPeriodLabel);
        });
        if (unrecordedGoals.length > 0) {
          console.log(
            '[tc-observation] closePopup:', unrecordedGoals.length,
            'goals still unrecorded for', closedPeriodLabel, '— adding to missed list'
          );
          addMissedPeriod(date, closedPeriodLabel, unrecordedGoals);
        } else {
          // All recorded — remove from missed list in case it was there
          removeMissedPeriod(missedKey);
        }
      }
    }

    // Issue 1: Reset activePopupPeriodLabel at the end (after all missed-period logic)
    activePopupPeriodLabel = null;
  }

  // ─── Timer Engine ─────────────────────────────────────────────────────────
  async function checkPeriod() {
    if (!schedule) {
      console.log('[tc-observation] checkPeriod: no schedule loaded yet');
      return;
    }
    if (!allGoals.length) {
      console.log('[tc-observation] checkPeriod: no observation goals configured');
      return;
    }

    const now = new Date();
    const periodInfo = getCurrentPeriod(schedule, now);

    if (_firstCheck) {
      _firstCheck = false;
      const queue = readQueue();
      const goalsForCurrentPeriod = periodInfo.status === 'in-class'
        ? allGoals.filter(g => {
            const cfg = g.observation_config;
            return Array.isArray(cfg?.class_periods) &&
                   cfg.class_periods.includes(periodInfo.period.label);
          })
        : [];
      console.group('[tc-observation] checkPeriod: FIRST CHECK diagnostic');
      console.log('Current time:', now.toString());
      console.log('Day of week:', ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()]);
      const schoolDays = schedule.schoolDays ?? schedule.school_days ?? null;
      console.log(
        'Is school day per schedule.schoolDays:',
        Array.isArray(schoolDays)
          ? `${schoolDays.includes(now.getDay())} (schoolDays=${JSON.stringify(schoolDays)})`
          : '(schoolDays not defined on schedule)'
      );
      console.log('getCurrentPeriod() result:', JSON.stringify({
        status: periodInfo.status,
        periodLabel: periodInfo.period?.label ?? null,
        remainingSeconds: periodInfo.remainingSeconds ?? null
      }));
      if (periodInfo.status === 'in-class') {
        console.log(
          'remainingSeconds > POPUP_TRIGGER_SECONDS?',
          periodInfo.remainingSeconds > POPUP_TRIGGER_SECONDS,
          `(${periodInfo.remainingSeconds} > ${POPUP_TRIGGER_SECONDS})`
        );
        console.log('Goals matching current period:', goalsForCurrentPeriod.length);
      }
      console.log('shownPopups:', [...shownPopups]);
      console.log(
        'localStorage queue (rc_obs_pending): total=', queue.length,
        'synced=', queue.filter(e => e.synced).length,
        'unsynced=', queue.filter(e => !e.synced).length
      );
      console.groupEnd();
    }

    // Detect period-end transitions: if we were in a period and now we're not,
    // check whether there are unrecorded goals for that period.
    if (lastInClassPeriodLabel && periodInfo.status !== 'in-class') {
      const endedLabel = lastInClassPeriodLabel;
      lastInClassPeriodLabel = null;
      const date = todayStr();
      const unrecordedGoals = allGoals.filter(g => {
        const cfg = g.observation_config;
        return Array.isArray(cfg?.class_periods) &&
               cfg.class_periods.includes(endedLabel) &&
               !isAlreadyRecorded(g.student_code, g.code, date, endedLabel);
      });
      if (unrecordedGoals.length > 0) {
        console.log(
          '[tc-observation] checkPeriod: period ended with', unrecordedGoals.length,
          'unrecorded goals for', endedLabel, '— adding to missed list'
        );
        addMissedPeriod(date, endedLabel, unrecordedGoals);
      }
    }

    console.log(
      '[tc-observation] checkPeriod: status=', periodInfo.status,
      periodInfo.status === 'in-class'
        ? `remaining=${fmtSeconds(periodInfo.remainingSeconds)} period="${periodInfo.period.label}"`
        : ''
    );

    if (periodInfo.status !== 'in-class') return;

    lastInClassPeriodLabel = periodInfo.period.label;

    if (periodInfo.remainingSeconds > POPUP_TRIGGER_SECONDS) return;

    // Don't show a new popup if one is already open
    if (activeOverlay) {
      console.log('[tc-observation] checkPeriod: overlay already open — suppressing');
      return;
    }

    showPopup(periodInfo);
  }

  // ─── Missed Period Tracking ───────────────────────────────────────────────

  function addMissedPeriod(date, periodLabel, goals) {
    const key = `${date}|${periodLabel}`;
    const existing = missedPeriods.findIndex(m => m.key === key);
    if (existing < 0) {
      missedPeriods.push({ key, date, periodLabel, goals });
    } else {
      missedPeriods[existing].goals = goals; // refresh with current unrecorded list
    }
    writeMissedPeriodsToStorage(); // Issue 2: persist across navigations
    updateNotifBadge();
  }

  function removeMissedPeriod(key) {
    const idx = missedPeriods.findIndex(m => m.key === key);
    if (idx >= 0) {
      missedPeriods.splice(idx, 1);
      writeMissedPeriodsToStorage(); // Issue 2: persist across navigations
      updateNotifBadge();
    }
  }

  function updateNotifBadge() {
    if (!notifIconEl) return;
    const count = missedPeriods.length;
    const badge = notifIconEl.querySelector('.obs-notif-badge');
    if (count === 0) {
      notifIconEl.style.display = 'none';
      if (badge) badge.style.display = 'none';
    } else {
      notifIconEl.style.display = '';
      if (badge) {
        badge.textContent = String(count);
        badge.style.display = '';
      }
    }
    console.log('[tc-observation] updateNotifBadge: pending missed periods =', count);
  }

  // ─── Missed Period Popup ──────────────────────────────────────────────────

  function showMissedPopup(missed) {
    if (activeOverlay) return; // Don't open if a popup is already visible

    const { periodLabel, goals } = missed;
    console.log('[tc-observation] showMissedPopup:', periodLabel, '—', goals.length, 'goals');

    activePopupPeriodLabel = periodLabel;

    const studentsMap = new Map(allStudents.map(s => [s.code, s]));

    const overlay = document.createElement('div');
    overlay.className = 'obs-overlay';
    overlay.setAttribute('role', 'presentation');

    buildPopupContent(periodLabel, goals, studentsMap, overlay);
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    // Focus the modal for keyboard accessibility
    const modal = overlay.querySelector('.obs-modal');
    if (modal) modal.focus();

    // Update title to show period ended (no live countdown needed)
    const titleEl = overlay.querySelector('#obs-modal-title');
    const countdownEl = overlay.querySelector('#obs-countdown');
    if (titleEl) {
      titleEl.textContent = '';
      titleEl.appendChild(document.createTextNode(periodLabel + ' — '));
      const endedSpan = document.createElement('span');
      endedSpan.style.cssText = 'color:rgba(255,255,255,0.5);font-weight:400;';
      endedSpan.textContent = 'period ended — finish recording';
      titleEl.appendChild(endedSpan);
    }
    if (countdownEl) countdownEl.style.display = 'none';

    // Issue 5: Auto-close this missed-period popup when all goals are recorded.
    // Watch the "Done" button — when it becomes visible, all goals are recorded.
    // Show the existing "All goals recorded" indicator (already in the footer) and
    // automatically close after ~1.5 s so the badge decrements and the teacher can
    // cycle to the next missed period.
    //
    // buildPopupContent() controls the done button exclusively via style.display
    // ('none' = hidden, '' = visible), so checking style.display !== 'none' is correct.
    const doneBtn = overlay.querySelector('.obs-done-btn');
    if (doneBtn) {
      const scheduleAutoClose = () => {
        if (missedPopupAutoCloseTimer) return; // Already scheduled
        console.log('[tc-observation] showMissedPopup: all goals recorded — auto-closing in 1.5s');
        missedPopupAutoCloseTimer = setTimeout(() => {
          missedPopupAutoCloseTimer = null;
          closePopup();
        }, 1500);
      };

      // Check immediately in case all goals were already recorded before the popup opened
      if (doneBtn.style.display !== 'none') {
        scheduleAutoClose();
      } else {
        // Watch for the done button becoming visible (triggered by updateCompletion).
        // The observer reference is stored so closePopup() can disconnect it if the
        // teacher manually dismisses before all goals are recorded.
        missedPopupDoneObs = new MutationObserver(() => {
          if (doneBtn.style.display !== 'none') {
            if (missedPopupDoneObs) {
              missedPopupDoneObs.disconnect();
              missedPopupDoneObs = null;
            }
            scheduleAutoClose();
          }
        });
        missedPopupDoneObs.observe(doneBtn, { attributes: true, attributeFilter: ['style'] });
      }
    }
  }

  // ─── Notification Icon ────────────────────────────────────────────────────

  function injectNotifIcon() {
    const topbar = document.querySelector('.tc-topbar');
    if (!topbar) return;

    const btn = document.createElement('button');
    btn.className = 'tc-btn obs-notif-btn';
    btn.setAttribute('aria-label', 'Pending observation entries');
    btn.title = 'Pending observation entries';
    btn.style.display = 'none'; // Hidden until there are missed periods
    btn.innerHTML = OBS_CLIPBOARD_SVG + '<span class="obs-notif-badge" style="display:none;"></span>';

    btn.addEventListener('click', () => {
      if (missedPeriods.length === 0) return;
      // Open the most recently missed period
      showMissedPopup(missedPeriods[missedPeriods.length - 1]);
    });

    notifIconEl = btn;

    const tryInsert = () => {
      const signOutBtn = topbar.querySelector('.tc-btn[aria-label="Sign out"]');
      if (signOutBtn) {
        // Transfer auto-margin so the notif icon starts the right-aligned group
        signOutBtn.style.marginLeft = '';
        btn.style.marginLeft = 'auto';
        topbar.insertBefore(btn, signOutBtn);
        return true;
      }
      return false;
    };

    if (!tryInsert()) {
      // Sign Out button not yet added by teacher-shell.js; watch for it
      const observer = new MutationObserver(() => {
        if (tryInsert()) observer.disconnect();
      });
      observer.observe(topbar, { childList: true });
    }
  }

  // ─── Missed Period Init Scan ──────────────────────────────────────────────
  // Issue 4: On init, scan today's schedule for periods that have already ended
  // but have unrecorded observation goals. This handles the case where the teacher
  // was away for an entire period — the notification icon will appear immediately.

  function scanForMissedPeriodsOnInit() {
    if (!schedule || !allGoals.length) {
      console.log('[tc-observation] scanMissed: skipped — no schedule or goals loaded');
      return;
    }

    const { periods, schoolDays } = schedule;
    if (!Array.isArray(periods) || periods.length === 0) return;

    const now = new Date();
    const dayOfWeek = now.getDay();
    if (Array.isArray(schoolDays) && !schoolDays.includes(dayOfWeek)) {
      console.log('[tc-observation] scanMissed: not a school day — skipping');
      return;
    }

    const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const date = todayStr();
    let foundCount = 0;

    for (const period of periods) {
      const endSecs = parseTimeToSeconds(period.end);
      if (!endSecs || nowSecs < endSecs) continue; // Period hasn't ended yet

      const key = `${date}|${period.label}`;
      if (missedPeriods.some(m => m.key === key)) continue; // Already in list (from sessionStorage)

      const unrecordedGoals = allGoals.filter(g => {
        const cfg = g.observation_config;
        return Array.isArray(cfg?.class_periods) &&
               cfg.class_periods.includes(period.label) &&
               !isAlreadyRecorded(g.student_code, g.code, date, period.label);
      });

      if (unrecordedGoals.length > 0) {
        console.log(
          '[tc-observation] scanMissed: period', period.label,
          'ended with', unrecordedGoals.length, 'unrecorded goals — adding to missed list'
        );
        addMissedPeriod(date, period.label, unrecordedGoals);
        foundCount++;
      }
    }

    if (foundCount > 0) {
      console.log('[tc-observation] scanMissed: added', foundCount, 'missed period(s) to notification list');
    } else {
      console.log('[tc-observation] scanMissed: no new missed periods found');
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  await loadData();
  await syncQueue();

  // Inject the notification icon into the topbar
  injectNotifIcon();

  // Issue 2: Hydrate missed periods from sessionStorage so the notification icon
  // survives full page navigations within the same browser session.
  const _storedMissed = readMissedPeriodsFromStorage();
  if (_storedMissed.length > 0) {
    console.log('[tc-observation] Init: restored', _storedMissed.length, 'missed period(s) from sessionStorage');
    for (const entry of _storedMissed) {
      missedPeriods.push(entry);
    }
    updateNotifBadge(); // Show the badge immediately for restored entries
  }

  // Issue 4: Scan for periods that already ended today with unrecorded goals.
  // Must run after data is loaded and sessionStorage is hydrated (to avoid duplicates).
  scanForMissedPeriodsOnInit();

  // Start timer loop (check every 30 seconds)
  const _checkInterval = setInterval(checkPeriod, 30_000);
  checkPeriod(); // Also check immediately on load

  // Reload data every 5 minutes
  const _dataInterval = setInterval(async () => {
    await loadData();
    await syncQueue();
  }, 5 * 60_000);

  // Attempt queue sync every 60 seconds
  const _syncInterval = setInterval(syncQueue, 60_000);

  // Expose cleanup for potential future use (e.g., SPA navigation)
  window._obsCleanup = () => {
    clearInterval(_checkInterval);
    clearInterval(_dataInterval);
    clearInterval(_syncInterval);
    closePopup();
  };

  console.log('[tc-observation] Engine ready, watching', allGoals.length, 'observational goals, trigger window:', POPUP_TRIGGER_SECONDS, 'seconds');
})();
