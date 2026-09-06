// tc-observation.js
// Always-visible observation tray for the Teacher Center.
// Teachers click the clipboard icon in the topbar to open a lightweight tray
// showing all observation goals for today, grouped by student, with inline
// data-entry forms. Shared instructional-day rules suppress no-student dates.

(async () => {
  'use strict';

  // Only run on Teacher Center pages
  if (!location.pathname.startsWith('/teacher/')) return;

  console.log('[tc-observation] Initializing observation tray');

  // ─── SVG Icon Constants ───────────────────────────────────────────────────
  const OBS_MET_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  const OBS_NOT_MET_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  const OBS_NOT_ADDRESSED_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
  const OBS_NOT_APPLICABLE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
  const OBS_CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  const OBS_CLIPBOARD_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
  const OBS_CHEVRON_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
  const OBS_CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  // ─── Inject Styles ────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = `
/* ── Observation Tray ─────────────────────────────────────────────────── */
.obs-tray-backdrop { position: fixed; inset: 0; z-index: 9990; background: rgba(5,7,9,0.5); opacity: 0; transition: opacity 0.15s ease; }
.obs-tray {
  position: fixed;
  top: calc(var(--tc-topbar-h, 56px) + 8px);
  right: 12px;
  width: min(480px, calc(100vw - 24px));
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--rc-bg, #0b1220);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  color: var(--rc-ink, #e8edf4);
  z-index: 9999;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3);
  backdrop-filter: blur(12px);
  transform-origin: top right;
  animation: obs-tray-slide-in 0.18s ease;
}
@keyframes obs-tray-slide-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
.obs-tray-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.obs-tray-title { font-weight: 700; font-size: 14px; flex: 1; display: flex; align-items: center; gap: 4px; }
.obs-tray-close-btn {
  padding: 4px; border: none; background: none;
  color: rgba(255,255,255,0.5); cursor: pointer;
  border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;
}
.obs-tray-close-btn:hover { background: rgba(255,255,255,0.08); color: var(--rc-ink, #e8edf4); }
.obs-tray-nav-btn {
  padding: 2px 6px; border: none; background: none;
  color: rgba(255,255,255,0.5); cursor: pointer;
  border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px;
}
.obs-tray-nav-btn:hover { background: rgba(255,255,255,0.08); color: var(--rc-ink, #e8edf4); }
.obs-tray-nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.obs-tray-today-btn {
  padding: 2px 8px; border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); cursor: pointer;
  border-radius: 6px; font-size: 11px; margin-left: 2px;
}
.obs-tray-today-btn:hover { background: rgba(255,255,255,0.12); }
.obs-tray-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
.obs-tray-empty { padding: 28px 0; text-align: center; color: rgba(255,255,255,0.35); font-size: 13px; }
.obs-tray-footer {
  flex-shrink: 0;
  padding: 10px 16px;
  border-top: 1px solid rgba(255,255,255,0.08);
  font-size: 12px; color: rgba(255,255,255,0.5);
  display: flex; align-items: center; gap: 6px;
}
/* ── Topbar Icon ──────────────────────────────────────────────────────── */
.obs-tray-icon-btn {
  position: relative; display: inline-flex;
  align-items: center; justify-content: center;
  transition: opacity 0.2s;
}
.obs-tray-icon-btn:hover { opacity: 0.85; }
.obs-tray-badge {
  position: absolute; top: -4px; right: -6px;
  min-width: 16px; height: 16px;
  border-radius: 8px; font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  padding: 0 3px; line-height: 1; pointer-events: none;
}
.obs-tray-badge.has-unrecorded { background: #ef4444; color: #fff; }
.obs-tray-badge.all-done { background: #22c55e; color: #fff; font-size: 11px; }
/* ── Student Section ──────────────────────────────────────────────────── */
.obs-student-section { margin-bottom: 20px; }
.obs-student-name {
  font-weight: 700; font-size: 14px;
  margin-bottom: 8px; padding: 4px 0 6px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
/* ── Goal Cards ───────────────────────────────────────────────────────── */
.obs-goal-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; margin-bottom: 10px; overflow: hidden;
}
.obs-card-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; cursor: pointer; user-select: none;
  transition: background 0.12s;
  background: none; border: none; width: 100%; text-align: left;
  color: inherit; font: inherit;
}
.obs-card-header:hover { background: rgba(255,255,255,0.04); }
.obs-card-chevron { transition: transform 0.2s; flex-shrink: 0; color: rgba(255,255,255,0.4); }
.obs-card-chevron.open { transform: rotate(90deg); }
.obs-card-title { flex: 1; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.obs-card-code { font-weight: 600; font-size: 13px; }
.obs-card-area { font-size: 12px; color: rgba(255,255,255,0.55); }
.obs-card-cat-badge {
  font-size: 10px; padding: 2px 7px; border-radius: 4px;
  background: rgba(99,102,241,0.15); color: #818cf8; white-space: nowrap;
}
.obs-card-status { font-size: 12px; color: #22c55e; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.obs-card-body { padding: 2px 14px 14px; }
/* ── Goal form internals (reused from previous version) ─────────────── */
.obs-goal-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.obs-goal-desc { font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 10px; }
.obs-response-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.obs-response-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 16px; border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px; background: rgba(255,255,255,0.04);
  color: var(--rc-ink, #e8edf4); cursor: pointer;
  font-size: 13px; min-height: 44px; min-width: 44px; transition: all 0.15s;
}
.obs-response-btn:hover { background: rgba(255,255,255,0.08); }
.obs-response-btn.active[data-response="met"]           { background: rgba(34,197,94,0.15);  border-color: #22c55e; color: #22c55e; }
.obs-response-btn.active[data-response="not_met"]       { background: rgba(239,68,68,0.15);  border-color: #ef4444; color: #ef4444; }
.obs-response-btn.active[data-response="not_addressed"] { background: rgba(107,114,128,0.15);border-color: #6b7280; color: #6b7280; }
.obs-response-btn.active[data-response="not_applicable"]{ background: rgba(156,163,175,0.15);border-color: #9ca3af; color: #9ca3af; }
.obs-rolling { font-size: 12px; margin-top: 6px; color: rgba(255,255,255,0.5); }
.obs-rolling.on-track { color: #22c55e; }
.obs-rolling.close     { color: #f59e0b; }
.obs-rolling.behind    { color: #ef4444; }
.obs-note-input {
  width: 100%; padding: 6px 10px; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; background: rgba(255,255,255,0.04);
  color: var(--rc-ink, #e8edf4); font-size: 12px; margin-top: 6px; box-sizing: border-box;
}
.obs-save-indicator        { font-size: 12px; color: #22c55e; min-height: 18px; margin-top: 4px; }
.obs-save-indicator.offline{ color: #f59e0b; }
/* Prompt count */
.obs-prompt-btn { min-width: 48px; text-align: center; justify-content: center; }
.obs-prompt-btn.active { background: rgba(34,197,94,0.15); border-color: #22c55e; }
.obs-prompt-btn.active.over-target { background: rgba(239,68,68,0.15); border-color: #ef4444; }
/* Behavior checklist */
.obs-checklist-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; cursor: pointer; }
.obs-checklist-item input[type="checkbox"] { width: 18px; height: 18px; margin: 0; cursor: pointer; accent-color: #22c55e; }
.obs-checklist-summary { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 4px; }
.obs-not-addressed-btn { font-size: 12px; margin-top: 6px; }
/* Tally */
.obs-tally-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.obs-tally-input { width: 60px; padding: 8px; text-align: center; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.04); color: var(--rc-ink, #e8edf4); font-size: 16px; }
.obs-tally-label  { font-size: 13px; color: rgba(255,255,255,0.6); }
.obs-tally-result { font-size: 13px; font-weight: 600; margin-top: 4px; }
.obs-no-opp-link  { font-size: 12px; color: rgba(255,255,255,0.5); background: none; border: none; cursor: pointer; text-decoration: underline; margin-top: 4px; padding: 0; }
.obs-no-opp-btns  { margin-top: 8px; }
.obs-already-recorded { font-size: 12px; color: #22c55e; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
.obs-edit-link    { font-size: 12px; color: rgba(255,255,255,0.5); background: none; border: none; cursor: pointer; text-decoration: underline; padding: 0; }
@media (max-width: 480px) {
  .obs-tray { right: 0; border-radius: 0 0 12px 12px; }
  .obs-response-row { flex-direction: column; }
  .obs-tally-input { width: 50px; }
}
`;
  document.head.appendChild(styleEl);

  // ─── Imports ──────────────────────────────────────────────────────────────
  const { db } = await import('/web/data-adapter.js');
  const {
    buildObservationNotes,
    parseObservationNotes,
    buildObservationDispositionNotes,
    parseObservationDispositionNotes,
  } = await import('/web/obs-utils.js?v=20260905-obs6-center');
  const { getInstructionalDayStatus, isInstructionalDay } =
    await import('/web/instructional-day.js');

  const { computeObservationDueState } =
    await import('/web/observation-due-state.js');

  const { getSchedule, getCurrentPeriod } =
    await import('/web/class-schedule.js');

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

  function addDays(dateString, days) {
    const d = new Date(dateString + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getWeekBounds(dateString) {
    const d =
      new Date(
        dateString + 'T00:00:00'
      );

    const day =
      d.getDay();

    const offsetToMonday =
      day === 0
        ? -6
        : 1 - day;

    const weekStart =
      addDays(
        dateString,
        offsetToMonday
      );

    return {
      weekStart,
      weekEnd:
        addDays(
          weekStart,
          6
        ),
    };
  }

  // ─── State ────────────────────────────────────────────────────────────────
  let allGoals = [];
  let allStudents = [];

  let currentSchedule = null;
  const observationEvidenceByDate =
    new Map();

  // date => Map<student|goal|date, exact observation class-period label>
  const observationEvidencePeriodsByDate =
    new Map();

  // date => Map<student|goal|date, due-state disposition entry>
  const observationDispositionsByDate =
    new Map();
  let trayIconEl = null;
  let trayEl = null;
  let trayBackdropEl = null;
  let isTrayOpen = false;
  // Map of date => Set<"studentCode|goalCode|date"> (populated from Supabase per date)
  const recordedByDate = new Map();
  let todayRecordedDate = null; // tracks the last date we fetched today's Supabase entries
  let currentTrayDate = null; // the date currently being viewed in the tray

  // ─── localStorage Queue ───────────────────────────────────────────────────
  const QUEUE_KEY = 'rc_obs_pending';

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

    // Build entries payload for the server-side function
    const entries = [];
    for (const entry of unsynced) {
      const goal = allGoals.find(g => g.code === entry.goal_code);
      if (!goal) continue;
      entries.push({
        student_code: entry.student_code,
        goal_id: goal.id,
        date: entry.date,
        percent: entry.value,
        method: 'Observation',
        by_name: 'Teacher',
        via: 'observation_tray',
        notes: entry.notes || '',
        // Keep saved_at and goal_code for tracking after response
        _saved_at: entry.saved_at,
        _goal_code: entry.goal_code
      });
    }

    if (entries.length === 0) return;

    try {
      const response = await fetch('/.netlify/functions/teacher-sync-observations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: entries.map(e => ({
          student_code: e.student_code,
          goal_id: e.goal_id,
          date: e.date,
          percent: e.percent,
          method: e.method,
          by_name: e.by_name,
          via: e.via,
          notes: e.notes
        })) })
      });

      if (response.ok) {
        const result = await response.json();
        // Mark synced for entries that succeeded (by position, server returns synced count)
        // Since the server processes in order, mark all as synced when all succeed
        if (result.ok) {
          for (const entry of entries) {
            markSynced(entry._saved_at, entry.student_code, entry._goal_code);
          }
          console.log('[tc-observation] Batch sync succeeded:', result.synced, 'synced,', result.failed?.length || 0, 'failed');
        }
      } else if (response.status === 400) {
        const errBody = await response.json().catch(() => ({}));
        console.error('[tc-observation] Batch sync rejected (400):', errBody);
        // Envelope-level errors (server/auth/parse issues) — leave entries queued for retry
        const ENVELOPE_ERRORS = new Set([
          'entries must be a non-empty array',
          'Invalid JSON in request body',
          'Content-Type must be application/json',
          'Request body too large',
          'Unauthorized',
          'Service unavailable',
          'Server not configured',
        ]);
        if (!ENVELOPE_ERRORS.has(errBody.error)) {
          // Per-entry rejection — mark as synced to prevent infinite retry
          for (const entry of entries) {
            markSynced(entry._saved_at, entry.student_code, entry._goal_code);
          }
        } else {
          console.warn('[tc-observation] Envelope error — keeping entries queued for retry:', errBody.error);
        }
      } else {
        console.warn('[tc-observation] Batch sync request failed:', response.status);
      }
    } catch (err) {
      console.warn('[tc-observation] Batch sync network error:', err.message);
    }
    pruneQueue();
  }

  // ─── Duplicate Check (date-only, no period label) ─────────────────────────
  function isAlreadyRecorded(studentCode, goalCode, date) {
    // Check Supabase pre-load map first (keyed with date to avoid midnight staleness)
    const dateSet = recordedByDate.get(date);
    if (dateSet && dateSet.has(`${studentCode}|${goalCode}|${date}`)) return true;
    // Then check localStorage queue
    const queue = readQueue();
    return queue.some(e =>
      e.student_code === studentCode &&
      e.goal_code === goalCode &&
      e.date === date
    );
  }

  function getQueueEntry(studentCode, goalCode, date) {
    const queue = readQueue();
    return queue.find(e =>
      e.student_code === studentCode &&
      e.goal_code === goalCode &&
      e.date === date
    ) || null;
  }

  function replaceOrPushToQueue(entry) {
    const queue = readQueue();
    const idx = queue.findIndex(e =>
      e.student_code === entry.student_code &&
      e.goal_code === entry.goal_code &&
      e.date === entry.date
    );
    if (idx >= 0) {
      queue[idx] = entry;
    } else {
      queue.push(entry);
    }
    writeQueue(queue);
  }

    function observationIdentityKey(studentCode, goalCode, date) {
    return `${studentCode}|${goalCode}|${date}`;
  }

    function setObservationDispositionEntry(entry) {
    if (!entry?.date || !entry.studentCode || !entry.goalCode) return;

    if (!observationDispositionsByDate.has(entry.date)) {
      observationDispositionsByDate.set(entry.date, new Map());
    }

    observationDispositionsByDate.get(entry.date).set(
      observationIdentityKey(entry.studentCode, entry.goalCode, entry.date),
      entry
    );
  }

    function clearObservationDispositionEntry(studentCode, goalCode, date) {
    observationDispositionsByDate
      .get(date)
      ?.delete(observationIdentityKey(studentCode, goalCode, date));
  }

    function clearObservationEvidenceForIdentity(studentCode, goalCode, date) {
    const identity =
      observationIdentityKey(studentCode, goalCode, date);

    observationEvidenceByDate
      .get(date)
      ?.delete(identity);

    observationEvidencePeriodsByDate
      .get(date)
      ?.delete(identity);
  }

  // ─── Calculate Value ──────────────────────────────────────────────────────
  function calcValue(category, responseData) {
    const { response, successful, opportunities, promptCount, checkedBehaviors, subBehaviors } = responseData;

    if (category === 'session_outcome') {
      if (response === 'met') return 100;
      if (response === 'not_met') return 0;
      return null;
    }

    if (category === 'tally') {
      if (response) return null;
      const s = Number(successful) || 0;
      const o = Number(opportunities) || 0;
      if (o === 0) return null;
      return Math.round((s / o) * 100);
    }

    if (category === 'prompt_count') {
      return promptCount != null ? Number(promptCount) : null;
    }

    if (category === 'behavior_checklist') {
      if (!subBehaviors || subBehaviors.length === 0) return null;
      if (response === 'not_addressed') return null;
      const checked = (checkedBehaviors || []).filter(Boolean).length;
      return Math.round((checked / subBehaviors.length) * 100);
    }

    return null;
  }

  // ─── Save Observation ─────────────────────────────────────────────────────
  async function saveObservation(
    goal,
    responseData,
    noteText,
    saveIndicatorEl,
    onSave,
    date,
    periodOverride = null
  ) {
    if (date == null) date = todayStr();

    const dayStatus = getInstructionalDayStatus(date);
    if (!dayStatus.instructional) {
      console.warn(
        '[tc-observation] Observation blocked on non-instructional date:',
        date,
        dayStatus.label
      );
      if (saveIndicatorEl) {
        saveIndicatorEl.textContent = `No school — ${dayStatus.label}`;
        saveIndicatorEl.className = 'obs-save-indicator offline';
      }
      return;
    }

    const category = goal.observation_config?.category;
    const value = calcValue(category, responseData);
    const notes =
      buildObservationNotes(
        category,
        responseData,
        noteText,
        periodOverride
      );

    console.log(
      '[tc-observation] saveObservation: goal=', goal.code,
      'student=', goal.student_code,
      'category=', category,
      'value=', value
    );

    const savedAt = new Date().toISOString();
    const queueEntry = {
      student_code: goal.student_code,
      goal_code: goal.code,
      date,
      value,
      notes,
      saved_at: savedAt,
      synced: false
    };

    replaceOrPushToQueue(queueEntry);

    // A normal observation replaces any same-day disposition projection.
    clearObservationDispositionEntry(
      goal.student_code,
      goal.code,
      date
    );

    // Mark in the recorded map so future checks reflect this immediately
    if (!recordedByDate.has(date)) recordedByDate.set(date, new Set());
    recordedByDate.get(date).add(`${goal.student_code}|${goal.code}|${date}`);

    if (Number.isFinite(value)) {
      if (!observationEvidenceByDate.has(date)) {
        observationEvidenceByDate.set(
          date,
          new Set()
        );
      }

      const evidenceKey =
        `${goal.student_code}|${goal.code}|${date}`;

      observationEvidenceByDate
        .get(date)
        .add(evidenceKey);

      if (!observationEvidencePeriodsByDate.has(date)) {
        observationEvidencePeriodsByDate.set(
          date,
          new Map()
        );
      }

      const normalizedPeriod =
        typeof periodOverride === 'string'
          ? periodOverride.trim()
          : '';

      if (normalizedPeriod) {
        observationEvidencePeriodsByDate
          .get(date)
          .set(
            evidenceKey,
            normalizedPeriod
          );
      } else {
        observationEvidencePeriodsByDate
          .get(date)
          .delete(evidenceKey);
      }
    }

    if (onSave) onSave();

    // Attempt server-side save via Netlify function (uses service role key, bypasses RLS)
    try {
      const syncResponse = await fetch('/.netlify/functions/teacher-sync-observations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{
            student_code: goal.student_code,
            goal_id: goal.id,
            date,
            percent: value,
            method: 'Observation',
            by_name: 'Teacher',
            via: 'observation_tray',
            notes
          }]
        })
      });
      if (syncResponse.ok) {
        const syncResult = await syncResponse.json();
        if (syncResult.ok && syncResult.synced > 0) {
          markSynced(savedAt, goal.student_code, goal.code);
          console.log('[tc-observation] Server save succeeded: goal=', goal.code);
          if (saveIndicatorEl) {
            saveIndicatorEl.textContent = 'Auto-saved ✓';
            saveIndicatorEl.className = 'obs-save-indicator';
          }
        } else {
          console.warn('[tc-observation] Server save returned no synced entries for', goal.code);
        }
      } else {
        console.warn('[tc-observation] Server save failed:', syncResponse.status, '— queued locally');
      }


    } catch (err) {
      console.warn('[tc-observation] Server save failed — queued locally:', err.message);
      if (saveIndicatorEl) {
        saveIndicatorEl.textContent = 'Saved locally — will sync when connected';
        saveIndicatorEl.className = 'obs-save-indicator offline';
      }
    }
  }

    async function saveObservationDisposition(
    goal,
    disposition,
    noteText,
    saveIndicatorEl,
    onSave,
    date
  ,
    classPeriodOverride = null
  ) {
    if (date == null) date = todayStr();

    const dayStatus = getInstructionalDayStatus(date);
    if (!dayStatus.instructional) {
      if (saveIndicatorEl) {
        saveIndicatorEl.textContent = `No school — ${dayStatus.label}`;
        saveIndicatorEl.className = 'obs-save-indicator offline';
      }
      return;
    }

    const classPeriod =
      classPeriodOverride ||
      getObservationOpportunityPeriod(goal, date);
    if (!classPeriod) {
      console.warn(
        '[tc-observation] Disposition blocked: observation period unavailable',
        goal.code,
        date
      );
      if (saveIndicatorEl) {
        saveIndicatorEl.textContent = 'Observation period unavailable';
        saveIndicatorEl.className = 'obs-save-indicator offline';
      }
      return;
    }

    const normalizedDisposition =
      ['absent', 'no_opportunity'].includes(disposition) ? disposition : '';
    const notes = buildObservationDispositionNotes(
      normalizedDisposition,
      classPeriod,
      noteText
    );

    if (!notes) {
      console.warn('[tc-observation] Invalid observation disposition ignored');
      return;
    }

    const savedAt = new Date().toISOString();
    replaceOrPushToQueue({
      student_code: goal.student_code,
      goal_code: goal.code,
      date,
      value: null,
      notes,
      saved_at: savedAt,
      synced: false,
    });

    setObservationDispositionEntry({
      studentCode: goal.student_code,
      goalCode: goal.code,
      date,
      classPeriod,
      kind: 'disposition',
      disposition: normalizedDisposition,
    });

    clearObservationEvidenceForIdentity(goal.student_code, goal.code, date);

    if (!recordedByDate.has(date)) recordedByDate.set(date, new Set());
    recordedByDate
      .get(date)
      .add(observationIdentityKey(goal.student_code, goal.code, date));

    if (onSave) onSave();

    try {
      const syncResponse = await fetch(
        '/.netlify/functions/teacher-sync-observations',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entries: [{
              student_code: goal.student_code,
              goal_id: goal.id,
              date,
              percent: null,
              method: 'Observation',
              by_name: 'Teacher',
              via: 'observation_tray',
              notes,
            }],
          }),
        }
      );

      if (syncResponse.ok) {
        const syncResult = await syncResponse.json();
        if (syncResult.ok && syncResult.synced > 0) {
          markSynced(savedAt, goal.student_code, goal.code);
          if (saveIndicatorEl) {
            saveIndicatorEl.textContent = 'Auto-saved ✓';
            saveIndicatorEl.className = 'obs-save-indicator';
          }
        }
      } else {
        console.warn(
          '[tc-observation] Disposition server save failed:',
          syncResponse.status,
          '— queued locally'
        );
      }
    } catch (err) {
      console.warn(
        '[tc-observation] Disposition server save failed — queued locally:',
        err.message
      );
      if (saveIndicatorEl) {
        saveIndicatorEl.textContent =
          'Saved locally — will sync when connected';
        saveIndicatorEl.className = 'obs-save-indicator offline';
      }
    }
  }

  // ─── Rolling Progress ─────────────────────────────────────────────────────
  async function loadRollingProgress(goal) {
    try {
      const config = goal.observation_config || {};
      const window_ = config.target_window || 5;
      const entries = await db.listGoalProgress({
        goalCodes: [goal.code],
        studentCodes: [goal.student_code],
        limit: window_ * 3
      });
      if (!entries || entries.length === 0) return { met: 0, window: window_, target: config.target_met || 3 };
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

  // ─── Render Category Forms ────────────────────────────────────────────────
  // All 4 forms take (goal, cardEl, saveIndicatorEl, preRecorded, onSave)
  // periodLabel has been removed — we now use date-only dedup.

  function renderSessionOutcomeForm(goal, cardEl, saveIndicatorEl, preRecorded, onSave, date, periodOverride = null) {
    const config = goal.observation_config || {};
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
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', 'Session outcome');
    const buttons = [
      { label: 'Met',          response: 'met',          ariaLabel: 'Mark as Met',          svg: OBS_MET_SVG },
      { label: 'Not Met',      response: 'not_met',      ariaLabel: 'Mark as Not Met',      svg: OBS_NOT_MET_SVG },
      { label: 'Not Addressed',response: 'not_addressed',ariaLabel: 'Mark as Not Addressed',svg: OBS_NOT_ADDRESSED_SVG },
      { label: 'Not Applicable',response: 'not_applicable',ariaLabel: 'Mark as Not Applicable',svg: OBS_NOT_APPLICABLE_SVG }
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
        await saveObservation(goal, { response }, noteInput.value, saveIndicatorEl, onSave, date, periodOverride);
      });
      row.appendChild(btn);
    });
    formWrapper.appendChild(row);

    const rollingEl = document.createElement('div');
    rollingEl.className = 'obs-rolling';
    rollingEl.textContent = 'Loading progress…';
    formWrapper.appendChild(rollingEl);

    loadRollingProgress(goal).then(prog => {
      if (!prog) { rollingEl.textContent = ''; return; }
      const { met, window: w, target } = prog;
      rollingEl.textContent = `Rolling: ${met} of last ${w} → target ${target} of ${config.target_window || w}`;
      const diff = met - target;
      if (diff >= 0) rollingEl.className = 'obs-rolling on-track';
      else if (diff >= -1) rollingEl.className = 'obs-rolling close';
      else rollingEl.className = 'obs-rolling behind';
    });

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'obs-note-input';
    noteInput.placeholder = 'Optional note…';
    noteInput.addEventListener('change', async () => {
      if (selectedResponse) {
        await saveObservation(goal, { response: selectedResponse }, noteInput.value, saveIndicatorEl, onSave, date, periodOverride);
      }
    });
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        const queueEntry = getQueueEntry(goal.student_code, goal.code, date);
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

  function renderTallyForm(goal, cardEl, saveIndicatorEl, preRecorded, onSave, date, periodOverride = null) {
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

    const tallyRow = document.createElement('div');
    tallyRow.className = 'obs-tally-row';

    const succInput = document.createElement('input');
    succInput.type = 'number'; succInput.min = '0';
    succInput.className = 'obs-tally-input'; succInput.placeholder = '0';

    const ofLabel = document.createElement('span');
    ofLabel.className = 'obs-tally-label'; ofLabel.textContent = 'of';

    const oppInput = document.createElement('input');
    oppInput.type = 'number'; oppInput.min = '0';
    oppInput.className = 'obs-tally-input'; oppInput.placeholder = '0';

    const oppLabel = document.createElement('span');
    oppLabel.className = 'obs-tally-label'; oppLabel.textContent = 'opportunities';

    tallyRow.append(succInput, ofLabel, oppInput, oppLabel);
    formWrapper.appendChild(tallyRow);

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
        await saveObservation(goal, { successful: s, opportunities: o }, noteInput.value, saveIndicatorEl, onSave, date, periodOverride);
      } else {
        resultEl.textContent = '';
      }
    };

    succInput.addEventListener('change', updateTally);
    oppInput.addEventListener('change', updateTally);

    const noOppLink = document.createElement('button');
    noOppLink.className = 'obs-no-opp-link';
    noOppLink.textContent = 'No opportunities today?';
    formWrapper.appendChild(noOppLink);

    const noOppBtns = document.createElement('div');
    noOppBtns.className = 'obs-no-opp-btns obs-response-row';
    noOppBtns.style.display = 'none';

    [
      { label: 'Met',          response: 'met',          svg: OBS_MET_SVG },
      { label: 'Not Met',      response: 'not_met',      svg: OBS_NOT_MET_SVG },
      { label: 'Not Addressed',response: 'not_addressed',svg: OBS_NOT_ADDRESSED_SVG },
      { label: 'Not Applicable',response: 'not_applicable',svg: OBS_NOT_APPLICABLE_SVG }
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
        await saveObservation(goal, { response }, noteInput.value, saveIndicatorEl, onSave, date, periodOverride);
      });
      noOppBtns.appendChild(btn);
    });

    noOppLink.addEventListener('click', () => {
      noOppBtns.style.display = noOppBtns.style.display === 'none' ? 'flex' : 'none';
    });
    formWrapper.appendChild(noOppBtns);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'obs-note-input';
    noteInput.placeholder = 'Optional note…';
    noteInput.addEventListener('change', async () => {
      const s = Number(succInput.value) || 0;
      const o = Number(oppInput.value) || 0;
      if (noOppResponse) {
        await saveObservation(goal, { response: noOppResponse }, noteInput.value, saveIndicatorEl, onSave, date, periodOverride);
      } else if (o > 0) {
        await saveObservation(goal, { successful: s, opportunities: o }, noteInput.value, saveIndicatorEl, onSave, date, periodOverride);
      }
    });
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        const queueEntry = getQueueEntry(goal.student_code, goal.code, date);
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

  function renderPromptCountForm(goal, cardEl, saveIndicatorEl, preRecorded, onSave, date, periodOverride = null) {
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
        row.querySelectorAll('.obs-prompt-btn').forEach(b => b.classList.remove('active', 'over-target'));
        const numVal = val === '4+' ? 4 : Number(val);
        btn.classList.add('active');
        if (numVal > maxPrompts) btn.classList.add('over-target');
        selectedCount = numVal;
        statusEl.textContent = `Target: ${maxPrompts} or fewer prompts`;
        statusEl.style.color = numVal <= maxPrompts ? '#22c55e' : '#ef4444';
        await saveObservation(goal, { promptCount: numVal }, noteInput.value, saveIndicatorEl, onSave, date, periodOverride);
      });
      row.appendChild(btn);
    });
    formWrapper.appendChild(row);
    formWrapper.appendChild(statusEl);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'obs-note-input';
    noteInput.placeholder = 'Optional note…';
    noteInput.addEventListener('change', async () => {
      if (selectedCount !== null) {
        await saveObservation(goal, { promptCount: selectedCount }, noteInput.value, saveIndicatorEl, onSave, date, periodOverride);
      }
    });
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        const queueEntry = getQueueEntry(goal.student_code, goal.code, date);
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

  function renderBehaviorChecklistForm(goal, cardEl, saveIndicatorEl, preRecorded, onSave, date, periodOverride = null) {
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
        saveIndicatorEl,
        onSave, date, periodOverride);
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
        saveIndicatorEl,
        onSave, date, periodOverride);
    });
    formWrapper.appendChild(notAddressedBtn);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'obs-note-input';
    noteInput.placeholder = 'Optional note…';
    noteInput.addEventListener('change', saveChecklist);
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        const queueEntry = getQueueEntry(goal.student_code, goal.code, date);
        const parsed = queueEntry ? parseObservationNotes(queueEntry.notes) : null;
        if (parsed && parsed.category === 'checklist') {
          if (parsed.rawData === 'not_addressed') {
            notAddressedBtn.classList.add('active');
          } else {
            const items = parsed.rawData ? parsed.rawData.split(',') : [];
            const cbs = formWrapper.querySelectorAll('input[type="checkbox"]');
            items.forEach((item, index) => {
              const isMet = item.endsWith('=met');
              if (isMet && cbs[index]) { cbs[index].checked = true; checkedStates[index] = true; }
            });
            updateSummary();
          }
          if (parsed.userNote) noteInput.value = parsed.userNote;
        }
      });
    }

    cardEl.appendChild(container);
  }

    function renderObservationDispositionActions(
    goal,
    cardEl,
    saveIndicatorEl,
    onSave,
    date,
    dueState
  ,
    periodOverride = null
  ) {
    const wrapper = document.createElement('div');
    wrapper.className = 'obs-no-opp-btns';

    const label = document.createElement('div');
    label.className = 'obs-rolling';
    label.textContent = 'Observation disposition';

    const row = document.createElement('div');
    row.className = 'obs-response-row';

    [
      { label: 'Absent', disposition: 'absent' },
      { label: 'No Opportunity', disposition: 'no_opportunity' },
    ].forEach(option => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'obs-response-btn';
      btn.dataset.disposition = option.disposition;
      btn.textContent = option.label;

      if (
        dueState?.state === 'excused' &&
        dueState.disposition === option.disposition
      ) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', async () => {
        row
          .querySelectorAll('.obs-response-btn')
          .forEach(other => other.classList.remove('active'));

        btn.classList.add('active');

        await saveObservationDisposition(
          goal,
          option.disposition,
          '',
          saveIndicatorEl,
          onSave,
          date,
          periodOverride
        );
      });

      row.appendChild(btn);
    });

    wrapper.append(label, row);
    cardEl.appendChild(wrapper);
  }

  // ─── Build Goal Card ──────────────────────────────────────────────────────
  function getConfiguredClassPeriods(goal) {

    const periods =
      goal?.observation_config?.class_periods;

    return Array.isArray(periods)
      ? periods.filter(period =>
          typeof period === 'string' &&
          period.trim()
        )
      : [];

  }

  function getRequiredPerWeek(goal) {

    const value =
      Number(
        goal?.observation_config
          ?.required_per_week
      );

    if (
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 5
    ) {
      return value;
    }

    return 1;
  }

    function getRecordedObservationEntriesForWeek(
    goal,
    date,
    classPeriods,
    currentPeriod
  ) {
    const { weekStart, weekEnd } = getWeekBounds(date);
    const identityFor = entryDate =>
      observationIdentityKey(goal.student_code, goal.code, entryDate);
    const evidenceDates = new Set();

    for (
      let cursor = weekStart;
      cursor <= weekEnd;
      cursor = addDays(cursor, 1)
    ) {
      if (observationEvidenceByDate.get(cursor)?.has(identityFor(cursor))) {
        evidenceDates.add(cursor);
      }
    }

    const queueEntries = readQueue().filter(entry =>
      entry.student_code === goal.student_code &&
      entry.goal_code === goal.code &&
      typeof entry.date === 'string' &&
      entry.date >= weekStart &&
      entry.date <= weekEnd
    );

    const localOverrides = new Set();
    const localDispositions = [];
    const localEvidencePeriods = new Map();

    for (const entry of queueEntries) {
      localOverrides.add(entry.date);

      const parsedObservation =
        parseObservationNotes(entry.notes);

      if (
        Number.isFinite(entry.value) &&
        parsedObservation
      ) {
        evidenceDates.add(entry.date);

        localEvidencePeriods.set(
          entry.date,
          parsedObservation.classPeriod || null
        );
      }

      const parsedDisposition =
        parseObservationDispositionNotes(entry.notes);

      if (parsedDisposition) {
        localDispositions.push({
          studentCode: goal.student_code,
          goalCode: goal.code,
          date: entry.date,
          classPeriod: parsedDisposition.classPeriod,
          kind: 'disposition',
          disposition: parsedDisposition.disposition,
        });
      }
    }

    const observationEntries =
      [...evidenceDates]
        .sort()
        .map(entryDate => {
          const identity =
            identityFor(entryDate);

          const localPeriodKnown =
            localEvidencePeriods.has(entryDate);

          const persistedPeriod =
            observationEvidencePeriodsByDate
              .get(entryDate)
              ?.get(identity) ||
            null;

          const storedPeriod =
            localPeriodKnown
              ? localEvidencePeriods.get(entryDate)
              : persistedPeriod;

          return {
            date: entryDate,
            classPeriod:
              storedPeriod ||
              (
                entryDate === date
                  ? (
                      currentPeriod ||
                      classPeriods[0] ||
                      null
                    )
                  : (
                      classPeriods[0] ||
                      null
                    )
              ),
            kind: 'observation',
          };
        });

const persistedDispositions = [];

    for (
      let cursor = weekStart;
      cursor <= weekEnd;
      cursor = addDays(cursor, 1)
    ) {
      if (localOverrides.has(cursor)) continue;

      const entry =
        observationDispositionsByDate.get(cursor)?.get(identityFor(cursor));

      if (entry) persistedDispositions.push(entry);
    }

    return [
      ...observationEntries,
      ...persistedDispositions,
      ...localDispositions,
    ];
  }

  function getLiveCurrentPeriodLabel() {

    if (!currentSchedule) return null;

    const periodState =
      getCurrentPeriod(
        currentSchedule,
        new Date()
      );

    if (periodState?.status !== 'in-class') {
      return null;
    }

    return (
      periodState.period?.label ||
      periodState.period?.name ||
      null
    );

  }

    function getObservationOpportunityPeriod(goal, date) {
    const classPeriods = getConfiguredClassPeriods(goal);

    return date === todayStr()
      ? (getLiveCurrentPeriodLabel() || classPeriods[0] || null)
      : (classPeriods[0] || null);
  }

  function getGoalDueState(
    goal,
    date,
    currentPeriodOverride = null
  ) {

    const classPeriods =
      getConfiguredClassPeriods(goal);

    /*
     * OBS-2 preserves the established daily collection expectation.
     *
     * Explicit weekly cadence is not stored yet.
     * target_met and target_window remain performance criteria.
     *
     * During a live class, that class period determines what needs
     * attention now. Outside a live class, fall back to broad tray
     * visibility instead of silently hiding unfinished observations.
     */

    const livePeriod =
      date === todayStr()
        ? getLiveCurrentPeriodLabel()
        : null;

    const currentPeriod =
      currentPeriodOverride ||
      (
        date === todayStr()
          ? (
              livePeriod ||
              classPeriods[0] ||
              null
            )
          : (
              classPeriods[0] ||
              null
            )
      );

    const requiredPerWeek =
      getRequiredPerWeek(goal);

    const entries =
      getRecordedObservationEntriesForWeek(
        goal,
        date,
        classPeriods,
        currentPeriod
      );

    return computeObservationDueState({
      date,
      requiredPerWeek,
      classPeriods,
      currentPeriod,
      entries,
    });

  }

  function buildGoalCard(
    goal,
    date,
    onAnyRecorded,
    dueState = null,
    periodOverride = null
  ) {
    const config = goal.observation_config || {};
    const category = config.category;
    const isRecorded =
      isAlreadyRecorded(
        goal.student_code,
        goal.code,
        date
      );

    const state =
      dueState ||
      getGoalDueState(goal, date, periodOverride);

    const needsAttention =
      state.state === 'due' ||
      state.state === 'urgent';

    const cardEl = document.createElement('div');
    cardEl.className = 'obs-goal-card';

    // ── Card header (always visible) ──
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'obs-card-header';
    header.setAttribute(
      'aria-expanded',
      needsAttention && !isRecorded
        ? 'true'
        : 'false'
    );

    const chevron = document.createElement('span');
    chevron.className = 'obs-card-chevron';
    chevron.innerHTML = OBS_CHEVRON_SVG;

    const titlePart = document.createElement('span');
    titlePart.className = 'obs-card-title';
    titlePart.innerHTML =
      `<span class="obs-card-code">${escapeHtml(goal.code)}</span>` +
      `<span class="obs-card-area">${escapeHtml(goal.goal_area || '')}</span>`;

    const catBadge = document.createElement('span');
    catBadge.className = 'obs-card-cat-badge';
    catBadge.textContent = category ? category.replace(/_/g, ' ') : '';

    const statusBadge = document.createElement('span');
    statusBadge.className = 'obs-card-status';

    if (state.state === 'excused') {
      statusBadge.textContent =
        state.disposition === 'absent'
          ? 'Absent'
          : 'No Opportunity';
    } else if (
      isRecorded ||
      state.state === 'satisfied'
    ) {
      statusBadge.innerHTML =
        OBS_CHECK_SVG + ' Recorded';
    } else if (
      state.state === 'urgent'
    ) {
      statusBadge.textContent =
        'Urgent';
    } else if (
      state.state === 'due'
    ) {
      statusBadge.textContent =
        'Due';
    } else if (
      state.state === 'upcoming'
    ) {
      statusBadge.textContent =
        'Upcoming';
    }

    header.appendChild(chevron);
    header.appendChild(titlePart);
    header.appendChild(catBadge);
    header.appendChild(statusBadge);
    cardEl.appendChild(header);

    // ── Card body (collapsible) ──
    const body = document.createElement('div');
    body.className = 'obs-card-body';

    const saveIndicatorEl = document.createElement('div');
    saveIndicatorEl.className = 'obs-save-indicator';

    // onSave callback — refreshes due/disposition status.
    const onSave = () => {
      const nowRecorded =
        isAlreadyRecorded(
          goal.student_code,
          goal.code,
          date
        );

      const refreshedState =
        getGoalDueState(goal, date, periodOverride);

      if (
        refreshedState.state ===
          'excused'
      ) {
        statusBadge.textContent =
          refreshedState.disposition ===
            'absent'
            ? 'Absent'
            : 'No Opportunity';
      } else if (nowRecorded) {
        statusBadge.innerHTML =
          OBS_CHECK_SVG +
          ' Recorded';
      }

      // Preserve the existing session-outcome collapse behavior.
      if (
        nowRecorded &&
        category ===
          'session_outcome'
      ) {
        applyExpanded(false);
      }

      onAnyRecorded();
    };

    renderObservationDispositionActions(
      goal,
      body,
      saveIndicatorEl,
      onSave,
      date,
      state,
      periodOverride
    );

    if (category === 'session_outcome') {
      renderSessionOutcomeForm(goal, body, saveIndicatorEl, isRecorded, onSave, date, periodOverride);
    } else if (category === 'tally') {
      renderTallyForm(goal, body, saveIndicatorEl, isRecorded, onSave, date, periodOverride);
    } else if (category === 'prompt_count') {
      renderPromptCountForm(goal, body, saveIndicatorEl, isRecorded, onSave, date, periodOverride);
    } else if (category === 'behavior_checklist') {
      renderBehaviorChecklistForm(goal, body, saveIndicatorEl, isRecorded, onSave, date, periodOverride);
    } else {
      const unknownMsg = document.createElement('div');
      unknownMsg.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.4);padding:4px 0;';
      unknownMsg.textContent = `Unknown category: ${escapeHtml(category || '(none)')}`;
      body.appendChild(unknownMsg);
    }

    body.appendChild(saveIndicatorEl);
    cardEl.appendChild(body);

    // ── Collapse/expand logic ──
    let isExpanded =
      needsAttention && !isRecorded;

    const applyExpanded = (expanded) => {
      isExpanded = expanded;
      header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (expanded) {
        chevron.classList.add('open');
        body.style.display = '';
      } else {
        chevron.classList.remove('open');
        body.style.display = 'none';
      }
    };
    applyExpanded(isExpanded);

    header.addEventListener('click', () => applyExpanded(!isExpanded));

    return cardEl;
  }

  // ─── Build Tray Content ───────────────────────────────────────────────────
  function countAttentionNeeded(date) {

    return allGoals.filter(goal => {

      const { state } =
        getGoalDueState(goal, date);

      return (
        state === 'due' ||
        state === 'urgent'
      );

    }).length;

  }

  function buildTrayContent(date, onAnyRecorded) {

    const studentsMap =
      new Map(
        allStudents.map(student => [
          student.code,
          student,
        ])
      );

    const fragment =
      document.createDocumentFragment();

    const stateRank = {
      urgent: 0,
      due: 1,
      upcoming: 2,
      satisfied: 3,
      excused: 4,
      not_scheduled: 5,
    };

    const rankedGoals =
      allGoals
        .map(goal => ({
          goal,
          dueState:
            getGoalDueState(goal, date),
        }))
        .sort((left, right) => {

          const leftRank =
            stateRank[left.dueState.state] ?? 99;

          const rightRank =
            stateRank[right.dueState.state] ?? 99;

          return leftRank - rightRank;

        });

    const byStudent = new Map();

    for (const item of rankedGoals) {

      const studentCode =
        item.goal.student_code;

      if (!byStudent.has(studentCode)) {
        byStudent.set(studentCode, []);
      }

      byStudent
        .get(studentCode)
        .push(item);

    }

    for (const [studentCode, items] of byStudent) {

      const studentInfo =
        studentsMap.get(studentCode);

      const studentName =
        studentInfo
          ? studentInfo.name
          : studentCode;

      const section =
        document.createElement('div');

      section.className =
        'obs-student-section';

      const nameEl =
        document.createElement('div');

      nameEl.className =
        'obs-student-name';

      nameEl.textContent =
        `${studentName} (${studentCode})`;

      section.appendChild(nameEl);

      for (const item of items) {

        section.appendChild(
          buildGoalCard(
            item.goal,
            date,
            onAnyRecorded,
            item.dueState
          )
        );

      }

      fragment.appendChild(section);

    }

    return fragment;

  }

  function updateTrayBadge() {

    if (!trayIconEl) return;

    const badge =
      trayIconEl.querySelector(
        '.obs-tray-badge'
      );

    if (!badge) return;

    const date = todayStr();

    if (allGoals.length === 0 || !isInstructionalDay(date)) {
      badge.style.display = 'none';
      return;
    }

    const attentionNeeded =
      countAttentionNeeded(date);

    if (attentionNeeded === 0) {

      badge.className =
        'obs-tray-badge all-done';

      badge.innerHTML =
        OBS_CHECK_SVG;

    } else {

      badge.className =
        'obs-tray-badge has-unrecorded';

      badge.textContent =
        String(attentionNeeded);

    }

    badge.style.display = '';

  }

  function openTray() {
    if (isTrayOpen) return;
    isTrayOpen = true;
    currentTrayDate = todayStr(); // reset to today on each open

    // Semi-transparent backdrop — click outside closes tray
    trayBackdropEl = document.createElement('div');
    trayBackdropEl.className = 'obs-tray-backdrop';
    trayBackdropEl.addEventListener('click', closeTray);
    document.body.appendChild(trayBackdropEl);
    // Trigger fade-in after paint
    requestAnimationFrame(() => { trayBackdropEl.style.opacity = '1'; });

    // Tray panel
    trayEl = document.createElement('div');
    trayEl.className = 'obs-tray';
    trayEl.setAttribute('role', 'dialog');
    trayEl.setAttribute('aria-modal', 'true');
    trayEl.setAttribute('aria-label', 'Observation Goals');
    trayEl.setAttribute('tabindex', '-1');

    // Header
    const header = document.createElement('div');
    header.className = 'obs-tray-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'obs-tray-title';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'obs-tray-nav-btn tc-btn';
    prevBtn.setAttribute('aria-label', 'Previous day');
    prevBtn.textContent = '◀';

    const titleIconEl = document.createElement('span');
    titleIconEl.innerHTML = OBS_CLIPBOARD_SVG;
    titleIconEl.querySelector('svg').style.cssText = 'vertical-align:middle;margin-right:4px;opacity:0.7;';

    const titleSpan = document.createElement('span');

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'obs-tray-nav-btn tc-btn';
    nextBtn.setAttribute('aria-label', 'Next day');
    nextBtn.textContent = '▶';

    const todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'obs-tray-today-btn tc-btn';
    todayBtn.textContent = 'Today';

    titleEl.appendChild(prevBtn);
    titleEl.appendChild(titleIconEl);
    titleEl.appendChild(titleSpan);
    titleEl.appendChild(nextBtn);
    titleEl.appendChild(todayBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'obs-tray-close-btn tc-btn';
    closeBtn.setAttribute('aria-label', 'Close observation tray');
    closeBtn.innerHTML = OBS_CLOSE_SVG;
    closeBtn.addEventListener('click', closeTray);

    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    trayEl.appendChild(header);

    // Body (scrollable)
    const bodyEl = document.createElement('div');
    bodyEl.className = 'obs-tray-body';
    trayEl.appendChild(bodyEl);

    // Footer
    const footerEl = document.createElement('div');
    footerEl.className = 'obs-tray-footer';
    trayEl.appendChild(footerEl);

    document.body.appendChild(trayEl);

    // ── Render helpers ──
    const getDateDisplay = (d) => {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const updateTitle = () => {
      titleSpan.textContent = 'Observation Goals \u2014 ' + getDateDisplay(currentTrayDate);
    };

    const updateNavButtons = () => {
      // YYYY-MM-DD strings compare correctly via lexicographic order (ISO 8601)
      nextBtn.disabled = currentTrayDate >= todayStr();
      todayBtn.style.display = currentTrayDate !== todayStr() ? '' : 'none';
    };

    const updateFooterText = () => {

      if (
        !isInstructionalDay(
          currentTrayDate
        )
      ) {
        footerEl.textContent = '';
        return;
      }

      const attentionNeeded =
        countAttentionNeeded(
          currentTrayDate
        );

      if (attentionNeeded === 0) {

        footerEl.innerHTML =
          OBS_CHECK_SVG +
          ' <span style="color:#22c55e;">' +
          'No observations need attention right now.' +
          '</span>';

      } else {

        footerEl.textContent =
          `${attentionNeeded} observation` +
          `${attentionNeeded !== 1 ? 's' : ''} ` +
          'need attention now';

      }

    };

    const onAnyRecorded = () => {
      updateTrayBadge();
      updateFooterText();
    };

    const renderBody = () => {
      bodyEl.innerHTML = '';
      const dayStatus = getInstructionalDayStatus(currentTrayDate);
      if (!dayStatus.instructional) {
        const empty = document.createElement('div');
        empty.className = 'obs-tray-empty';
        empty.textContent =
          `No observations scheduled — ${dayStatus.label}. ` +
          'Use the arrows to navigate to an instructional day.';
        bodyEl.appendChild(empty);
      } else if (allGoals.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'obs-tray-empty';
        empty.textContent = 'No observation goals configured for your students.';
        bodyEl.appendChild(empty);
      } else {
        bodyEl.appendChild(buildTrayContent(currentTrayDate, onAnyRecorded));
      }
      updateFooterText();
    };

    const navigateTo = async (newDate) => {
      currentTrayDate = newDate;
      updateTitle();
      updateNavButtons();
      if (isInstructionalDay(newDate) && !recordedByDate.has(newDate)) {
        bodyEl.innerHTML = '<div class="obs-tray-empty">Loading\u2026</div>';
        await loadRecordedEntriesForWeek(newDate);
      }
      renderBody();
    };

    prevBtn.addEventListener('click', () => { navigateTo(addDays(currentTrayDate, -1)); });
    nextBtn.addEventListener('click', () => {
      if (currentTrayDate >= todayStr()) return;
      navigateTo(addDays(currentTrayDate, 1));
    });
    todayBtn.addEventListener('click', () => { navigateTo(todayStr()); });

    // Initial render
    updateTitle();
    updateNavButtons();
    renderBody();

    // Keyboard: Escape closes tray; Tab stays within tray
    trayEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeTray(); return; }
      if (e.key === 'Tab') {
        const focusable = [...trayEl.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !trayEl.contains(document.activeElement)) {
            e.preventDefault(); last.focus();
          }
        } else {
          if (document.activeElement === last || !trayEl.contains(document.activeElement)) {
            e.preventDefault(); first.focus();
          }
        }
      }
    });

    // Focus the tray
    trayEl.focus();
  }

  function closeTray() {
    if (!isTrayOpen) return;
    isTrayOpen = false;
    if (trayBackdropEl) { trayBackdropEl.remove(); trayBackdropEl = null; }
    if (trayEl) { trayEl.remove(); trayEl = null; }
    // Return focus to icon
    if (trayIconEl) trayIconEl.focus();
  }

  // ─── Inject Topbar Icon ───────────────────────────────────────────────────
  function injectTrayIcon() {
    const topbar = document.querySelector('.tc-topbar');
    if (!topbar) return;

    const btn = document.createElement('button');
    btn.className = 'tc-btn obs-tray-icon-btn';
    btn.setAttribute('aria-label', 'Observation goals');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.title = 'Observation goals';
    btn.innerHTML = OBS_CLIPBOARD_SVG + '<span class="obs-tray-badge" style="display:none;"></span>';

    btn.addEventListener('click', () => {
      if (isTrayOpen) closeTray();
      else openTray();
    });

    trayIconEl = btn;

    const tryInsert = () => {
      const signOutBtn = topbar.querySelector('.tc-btn[aria-label="Sign out"]');
      if (signOutBtn) {
        // Transfer the auto-margin so the icon starts the right-aligned group
        signOutBtn.style.marginLeft = '';
        btn.style.marginLeft = 'auto';
        topbar.insertBefore(btn, signOutBtn);
        return true;
      }
      return false;
    };

    if (!tryInsert()) {
      // Sign Out button not yet added by teacher-shell.js; wait for it
      const observer = new MutationObserver(() => {
        if (tryInsert()) observer.disconnect();
      });
      observer.observe(topbar, { childList: true });
    }
  }

  // ─── Data Loading ─────────────────────────────────────────────────────────
  async function loadData() {
    try {
      const [goals, students, schedule] =
        await Promise.all([

          db.listGoalsAll(),

          db.listStudents(),

          getSchedule().catch(() => null)

        ]);

      currentSchedule = schedule;

      const rawGoals = goals || [];
      const obsTypeGoals = rawGoals.filter(g => g.measurement_type === 'Observation');
      const withConfig = obsTypeGoals.filter(g => g.observation_config != null);

      // S027 has exited the observation caseload — exclude from tray to avoid phantom entries.
      // Revisit if the student re-enters the observation programme.
      const EXCLUDED_STUDENT_CODES = new Set(['S027']);
      allGoals = withConfig.filter(g => !EXCLUDED_STUDENT_CODES.has(g.student_code));
      allStudents = (students || []).filter(s => !EXCLUDED_STUDENT_CODES.has(s.code));

      console.log(
        '[tc-observation] loadData: total goals=', rawGoals.length,
        'observation=', obsTypeGoals.length,
        'with config=', withConfig.length,
        'after exclusions=', allGoals.length
      );
    } catch (err) {
      console.warn('[tc-observation] loadData error:', err.message);
    }
  }

  // ─── Load Recorded Entries from Supabase (per date) ─────────────────────
  // Populates recordedByDate so the tray accurately reflects recorded state
  // even if localStorage was cleared or the teacher is on a different device.
    async function loadObservationDispositionsForWeek(date) {
    if (allGoals.length === 0) return;
    if (date == null) date = todayStr();
    if (!isInstructionalDay(date)) return;

    const { weekStart, weekEnd } = getWeekBounds(date);

    for (
      let cursor = weekStart;
      cursor <= weekEnd;
      cursor = addDays(cursor, 1)
    ) {
      observationDispositionsByDate.set(cursor, new Map());
    }

    const query = new URLSearchParams({
      start_date: weekStart,
      end_date: weekEnd,
    });

    try {
      const response = await fetch(
        '/.netlify/functions/teacher-sync-observations?' + query.toString(),
        {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        }
      );

      if (!response.ok) {
        console.warn(
          '[tc-observation] Could not load persisted dispositions:',
          response.status
        );
        return;
      }

      const payload = await response.json();
      const rows = Array.isArray(payload?.entries) ? payload.entries : [];
      let count = 0;

      for (const row of rows) {
        if (
          !row ||
          typeof row.student_code !== 'string' ||
          typeof row.goal_code !== 'string' ||
          typeof row.date !== 'string' ||
          !['absent', 'no_opportunity'].includes(row.disposition) ||
          typeof row.classPeriod !== 'string' ||
          !row.classPeriod.trim()
        ) {
          continue;
        }

        const goal = allGoals.find(candidate =>
          candidate.student_code === row.student_code &&
          candidate.code === row.goal_code
        );
        if (!goal) continue;

        setObservationDispositionEntry({
          studentCode: row.student_code,
          goalCode: row.goal_code,
          date: row.date,
          classPeriod: row.classPeriod,
          kind: 'disposition',
          disposition: row.disposition,
        });

        if (!recordedByDate.has(row.date)) {
          recordedByDate.set(row.date, new Set());
        }
        recordedByDate
          .get(row.date)
          .add(observationIdentityKey(
            row.student_code,
            row.goal_code,
            row.date
          ));

        count++;
      }

      if (count > 0) {
        console.log(
          '[tc-observation] Pre-loaded',
          count,
          'observation disposition row(s) for week',
          weekStart,
          'through',
          weekEnd
        );
      }
    } catch (err) {
      console.warn(
        '[tc-observation] Could not load persisted observation dispositions:',
        err.message
      );
    }
  }

  async function loadRecordedEntriesForWeek(date) {
    if (allGoals.length === 0) return;
    if (date == null) date = todayStr();
    if (!isInstructionalDay(date)) return;

    const {
      weekStart,
      weekEnd,
    } =
      getWeekBounds(date);

    try {
      const goalCodes =
        allGoals.map(
          goal => goal.code
        );

      const entries =
        await db.listGoalProgress({
          startDate: weekStart,
          endDate: weekEnd,
          goalCodes
        });

      for (
        let cursor = weekStart;
        cursor <= weekEnd;
        cursor = addDays(cursor, 1)
      ) {
        recordedByDate.set(
          cursor,
          new Set()
        );

        observationEvidenceByDate.set(
          cursor,
          new Set()
        );

        observationEvidencePeriodsByDate.set(
          cursor,
          new Map()
        );
      }

      let count = 0;

      for (
        const entry
        of (entries || [])
      ) {

        const parsed =
          parseObservationNotes(
            entry.notes
          );

        const parsedClassPeriod =
          parsed?.classPeriod || null;

        const rawValue =
          entry.value;

        const hasNumericValue =
          rawValue !== null &&
          rawValue !== undefined &&
          rawValue !== '' &&
          Number.isFinite(
            Number(rawValue)
          );

        if (
          !entry.student_code ||
          !entry.goal_code ||
          typeof entry.date !== 'string' ||
          entry.date < weekStart ||
          entry.date > weekEnd ||
          !parsed ||
          !hasNumericValue
        ) {
          continue;
        }

        if (
          !recordedByDate.has(
            entry.date
          )
        ) {
          recordedByDate.set(
            entry.date,
            new Set()
          );
        }

        if (
          !observationEvidenceByDate
            .has(entry.date)
        ) {
          observationEvidenceByDate.set(
            entry.date,
            new Set()
          );
        }

        const key =
          `${entry.student_code}|${entry.goal_code}|${entry.date}`;

        recordedByDate
          .get(entry.date)
          .add(key);

        observationEvidenceByDate
          .get(entry.date)
          .add(key);

        if (parsedClassPeriod) {
          observationEvidencePeriodsByDate
            .get(entry.date)
            .set(
              key,
              parsedClassPeriod
            );
        }

        count++;
      }

      const today =
        todayStr();

      if (
        today >= weekStart &&
        today <= weekEnd
      ) {
        todayRecordedDate =
          today;
      }

      if (count > 0) {
        console.log(
          '[tc-observation] Pre-loaded',
          count,
          'canonical observation evidence row(s) for week',
          weekStart,
          'through',
          weekEnd
        );
      }
    } catch (err) {
      console.warn(
        '[tc-observation] Could not pre-load weekly observation evidence for',
        date,
        ':',
        err.message
      );
    }
    await loadObservationDispositionsForWeek(
      date
    );
  }

  async function initObservationCenter() {
    const app =
      document.getElementById(
        'observationCenterApp'
      );

    if (!app) return;

    let selectedDate =
      todayStr();

    let selectedBrowseMode =
      'student';

    let selectedStudentCode =
      '';

    let selectedPeriod =
      '';

    let deckDirection =
      0;

    if (
      !document.getElementById(
        'obs-center-styles'
      )
    ) {
      const centerStyle =
        document.createElement(
          'style'
        );

      centerStyle.id =
        'obs-center-styles';

      centerStyle.textContent = `
        .obs-center {
          display:grid;
          gap:16px;
        }

        .obs-center-head {
          display:flex;
          gap:16px;
          justify-content:space-between;
          align-items:flex-start;
          flex-wrap:wrap;
        }

        .obs-center-head h1 {
          margin:0 0 6px;
        }

        .obs-center-head p {
          margin:0;
          color:rgba(240,255,250,.72);
          max-width:74ch;
        }

        .obs-center-controls,
        .obs-center-selectors {
          display:grid;
          grid-template-columns:minmax(280px,1fr) minmax(260px,1fr);
          gap:12px;
        }

        .obs-center-panel {
          border:1px solid rgba(255,255,255,.09);
          background:rgba(0,0,0,.20);
          border-radius:16px;
          padding:14px;
        }

        .obs-center-label {
          display:block;
          font-size:12px;
          font-weight:700;
          color:rgba(240,255,250,.72);
          margin-bottom:7px;
        }

        .obs-center-date-row,
        .obs-center-mode-row {
          display:flex;
          gap:8px;
          align-items:center;
          flex-wrap:wrap;
        }

        .obs-center-mode-btn.active {
          border-color:rgba(34,197,94,.72);
          background:rgba(34,197,94,.12);
          color:#dcfce7;
        }

        .obs-center-date-input,
        .obs-center-period-select,
        .obs-center-student-rail-search {
          min-height:42px;
          padding:8px 11px;
          border-radius:10px;
          border:1px solid rgba(255,255,255,.14);
          background:rgba(0,0,0,.30);
          color:inherit;
        }

        .obs-center-period-select,
        .obs-center-student-rail-search {
          width:100%;
        }

        .obs-center-helper {
          margin-top:7px;
          font-size:12px;
          line-height:1.45;
          color:rgba(240,255,250,.56);
        }

        .obs-center-status {
          min-height:22px;
          font-size:13px;
          color:#22c55e;
          font-weight:700;
        }

        .obs-center-hint {
          padding:18px;
          border:1px dashed rgba(255,255,255,.15);
          border-radius:14px;
          color:rgba(240,255,250,.68);
          background:rgba(255,255,255,.025);
        }

        .obs-center-period-heading {
          margin:0 0 12px;
          font-size:17px;
          font-weight:800;
        }

        .obs-center-goal-period {
          margin:0 0 9px;
          padding:7px 9px;
          border-radius:9px;
          background:rgba(59,130,246,.08);
          border:1px solid rgba(59,130,246,.16);
          color:rgba(219,234,254,.85);
          font-size:12px;
          line-height:1.4;
        }

        .obs-center-goal-description {
          margin:0 0 9px;
          padding:0 2px;
          color:rgba(240,255,250,.82);
          font-size:13px;
          line-height:1.5;
        }

        .obs-center-goal-locked {
          padding:14px;
          margin-bottom:10px;
        }

        .obs-center-goal-locked-title {
          font-size:14px;
          font-weight:750;
          margin-bottom:8px;
        }

        .obs-center-goal-lock {
          margin-top:8px;
          color:rgba(240,255,250,.66);
          font-size:13px;
          line-height:1.45;
        }

        .obs-center-date-deck {
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }

        .obs-center-date-prev,
        .obs-center-date-next {
          min-width:42px;
          min-height:42px;
          border-radius:12px;
          font-size:19px;
        }

        .obs-center-date-current {
          min-width:170px;
        }

        .obs-center-view-toggle {
          display:inline-flex;
          align-items:center;
          gap:4px;
          padding:4px;
          border:1px solid rgba(255,255,255,.10);
          border-radius:13px;
          background:rgba(0,0,0,.18);
        }

        .obs-center-view-toggle .obs-center-mode-btn {
          border-color:transparent;
          background:transparent;
          opacity:.68;
        }

        .obs-center-view-toggle .obs-center-mode-btn.active {
          opacity:1;
          border-color:rgba(34,197,94,.35);
          background:rgba(34,197,94,.11);
        }

        .obs-center-student-layout {
          display:grid;
          grid-template-columns:minmax(240px,300px) minmax(0,1fr);
          gap:14px;
          align-items:start;
        }

        .obs-center-student-layout.period-mode {
          grid-template-columns:minmax(0,1fr);
        }

        .obs-center-student-workspace {
          min-width:0;
        }

        .obs-center-student-rail {
          position:sticky;
          top:16px;
          min-width:0;
          padding:12px;
        }

        .obs-center-student-rail-search {
          min-height:44px;
          font-size:14px;
          font-weight:650;
        }

        .obs-center-student-rail-list {
          display:grid;
          gap:5px;
          margin-top:9px;
          max-height:520px;
          overflow-y:auto;
          overscroll-behavior:contain;
          padding:1px 4px 1px 1px;
        }

        .obs-center-student-rail-item {
          width:100%;
          min-width:0;
          padding:10px 11px;
          border:1px solid transparent;
          border-radius:10px;
          background:rgba(255,255,255,.025);
          color:rgba(240,255,250,.84);
          font:inherit;
          font-size:13px;
          line-height:1.35;
          text-align:left;
          cursor:pointer;
        }

        .obs-center-student-rail-item:hover {
          border-color:rgba(255,255,255,.10);
          background:rgba(255,255,255,.055);
          color:#f0fffa;
        }

        .obs-center-student-rail-item[aria-selected="true"] {
          border-color:rgba(34,197,94,.40);
          background:rgba(34,197,94,.12);
          color:#ecfdf5;
          box-shadow:inset 3px 0 0 rgba(34,197,94,.72);
        }

        .obs-center-student-empty {
          padding:11px;
          border:1px dashed rgba(255,255,255,.10);
          border-radius:10px;
          color:rgba(240,255,250,.56);
          font-size:13px;
        }

        .obs-center-period-gate {
          border-color:rgba(59,130,246,.18);
          background:rgba(59,130,246,.055);
        }

        .obs-center-period-gate[hidden] {
          display:none;
        }

        .obs-center-workspace {
          transition:transform .20s ease, opacity .20s ease;
        }

        .obs-center-workspace.obs-center-deck-back {
          animation:obsCenterDeckBack .22s ease;
        }

        .obs-center-workspace.obs-center-deck-forward {
          animation:obsCenterDeckForward .22s ease;
        }

        @keyframes obsCenterDeckBack {
          from {
            opacity:.45;
            transform:translateX(18px);
          }

          to {
            opacity:1;
            transform:translateX(0);
          }
        }

        @keyframes obsCenterDeckForward {
          from {
            opacity:.45;
            transform:translateX(-18px);
          }

          to {
            opacity:1;
            transform:translateX(0);
          }
        }

        .obs-center-card-grid {
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(300px,1fr));
          gap:14px;
          align-items:stretch;
        }

        .obs-center-capture-card {
          display:flex;
          min-width:0;
          border-radius:18px;
        }

        .obs-center-capture-card > .obs-goal-card {
          flex:1;
          min-width:0;
          margin:0;
        }

        @media (max-width: 760px) {
          .obs-center-controls,
          .obs-center-selectors,
          .obs-center-student-layout {
            grid-template-columns:1fr;
          }

          .obs-center-student-rail {
            position:static;
          }

          .obs-center-student-rail-list {
            max-height:260px;
          }
        }
      `;

      document.head.appendChild(
        centerStyle
      );
    }

    app.innerHTML =
      '';

    const center =
      document.createElement(
        'div'
      );

    center.className =
      'obs-center';

    const head =
      document.createElement(
        'div'
      );

    head.className =
      'obs-center-head';

    const intro =
      document.createElement(
        'div'
      );

    intro.innerHTML =
      '<h1>Observation Center</h1>' +
      '<p>Choose a student or class period, then enter observational data for today or a previous instructional day. ' +
      'The selected date is the observation date; the save time is only the audit timestamp.</p>';

    const saveStatus =
      document.createElement(
        'div'
      );

    saveStatus.className =
      'obs-center-status';

    saveStatus.setAttribute(
      'aria-live',
      'polite'
    );

    head.append(
      intro,
      saveStatus
    );

    const controls =
      document.createElement(
        'div'
      );

    controls.className =
      'obs-center-controls';

    const datePanel =
      document.createElement(
        'div'
      );

    datePanel.className =
      'obs-center-panel';

    const dateLabel =
      document.createElement(
        'label'
      );

    dateLabel.className =
      'obs-center-label';

    dateLabel.textContent =
      'Observation date';

    const dateRow =
      document.createElement(
        'div'
      );

    dateRow.className =
      'obs-center-date-row obs-center-date-deck';

    const previousBtn =
      document.createElement(
        'button'
      );

    previousBtn.type =
      'button';

    previousBtn.className =
      'tc-btn obs-center-date-prev';

    previousBtn.textContent =
      '← Previous';

    const dateInput =
      document.createElement(
        'input'
      );

    dateInput.type =
      'date';

    dateInput.className =
      'obs-center-date-input obs-center-date-current';

    dateInput.value =
      selectedDate;

    dateInput.max =
      todayStr();

    const todayBtn =
      document.createElement(
        'button'
      );

    todayBtn.type =
      'button';

    todayBtn.className =
      'tc-btn';

    todayBtn.textContent =
      'Today';

    const nextBtn =
      document.createElement(
        'button'
      );

    nextBtn.type =
      'button';

    nextBtn.className =
      'tc-btn obs-center-date-next';

    nextBtn.textContent =
      'Next →';

    dateRow.append(
      previousBtn,
      dateInput,
      todayBtn,
      nextBtn
    );

    datePanel.append(
      dateLabel,
      dateRow
    );

    const modePanel =
      document.createElement(
        'div'
      );

    modePanel.className =
      'obs-center-panel';

    const modeLabel =
      document.createElement(
        'div'
      );

    modeLabel.className =
      'obs-center-label';

    modeLabel.textContent =
      'View';

    const modeRow =
      document.createElement(
        'div'
      );

    modeRow.className =
      'obs-center-mode-row obs-center-view-toggle';

    const studentModeBtn =
      document.createElement(
        'button'
      );

    studentModeBtn.type =
      'button';

    studentModeBtn.className =
      'tc-btn obs-center-mode-btn obs-center-mode-student obs-center-view-student';

    studentModeBtn.textContent =
      'Student';

    const periodModeBtn =
      document.createElement(
        'button'
      );

    periodModeBtn.type =
      'button';

    periodModeBtn.className =
      'tc-btn obs-center-mode-btn obs-center-mode-period obs-center-view-period';

    periodModeBtn.textContent =
      'Class Period';

    modeRow.append(
      studentModeBtn,
      periodModeBtn
    );

    modePanel.append(
      modeLabel,
      modeRow
    );

    controls.append(
      datePanel,
      modePanel
    );

    const selectors =
      document.createElement(
        'div'
      );

    selectors.className =
      'obs-center-selectors';

    const studentPanel =
      document.createElement(
        'div'
      );

    studentPanel.className =
      'obs-center-panel obs-center-student-rail';

    const studentLabel =
      document.createElement(
        'label'
      );

    studentLabel.className =
      'obs-center-label';

    studentLabel.textContent =
      'Students';

    const studentRailSearch =
      document.createElement(
        'input'
      );

    studentRailSearch.type =
      'search';

    studentRailSearch.id =
      'obsCenterStudentRailSearch';

    studentRailSearch.className =
      'obs-center-student-rail-search';

    studentRailSearch.placeholder =
      'Search students…';

    studentRailSearch.setAttribute(
      'aria-label',
      'Search students'
    );

    studentLabel.htmlFor =
      'obsCenterStudentRailSearch';

    const studentRailList =
      document.createElement(
        'div'
      );

    studentRailList.className =
      'obs-center-student-rail-list';

    studentRailList.setAttribute(
      'role',
      'listbox'
    );

    studentRailList.setAttribute(
      'aria-label',
      'Students with observation goals'
    );

    const studentHelp =
      document.createElement(
        'div'
      );

    studentHelp.className =
      'obs-center-helper';

    studentHelp.textContent =
      'Only students with configured observational goals are shown.';

    studentPanel.append(
      studentLabel,
      studentRailSearch,
      studentRailList,
      studentHelp
    );

    const periodPanel =
      document.createElement(
        'div'
      );

    periodPanel.className =
      'obs-center-panel obs-center-period-gate';

    const periodLabel =
      document.createElement(
        'label'
      );

    periodLabel.className =
      'obs-center-label';

    const periodSelect =
      document.createElement(
        'select'
      );

    periodSelect.className =
      'obs-center-period-select';

    periodSelect.setAttribute(
      'aria-label',
      'Select class period'
    );

    const periodHelp =
      document.createElement(
        'div'
      );

    periodHelp.className =
      'obs-center-helper';

    periodPanel.append(
      periodLabel,
      periodSelect,
      periodHelp
    );

    selectors.append(
      periodPanel
    );

    const workspace =
      document.createElement(
        'div'
      );

    workspace.className =
      'obs-center-panel obs-center-workspace obs-center-student-workspace';

    const studentLayout =
      document.createElement(
        'div'
      );

    studentLayout.className =
      'obs-center-student-layout';

    studentLayout.append(
      studentPanel,
      workspace
    );

    center.append(
      head,
      controls,
      selectors,
      studentLayout
    );

    app.appendChild(
      center
    );

    const formatCenterDate =
      dateKey => {
        const [
          year,
          month,
          day,
        ] =
          dateKey
            .split('-')
            .map(Number);

        return new Date(
          year,
          month - 1,
          day
        ).toLocaleDateString(
          'en-US',
          {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }
        );
      };

    const getObservationCenterStudents =
      () => {
        const goalStudentCodes =
          new Set(
            allGoals
              .map(goal =>
                goal.student_code
              )
              .filter(Boolean)
          );

        const rosterByCode =
          new Map(
            allStudents.map(
              student => [
                student.code,
                student,
              ]
            )
          );

        return [
          ...goalStudentCodes,
        ]
          .map(code =>
            rosterByCode.get(code) || {
              code,
              name: code,
            }
          )
          .sort(
            (left, right) =>
              String(
                left.name ||
                left.code ||
                ''
              ).localeCompare(
                String(
                  right.name ||
                  right.code ||
                  ''
                ),
                undefined,
                {
                  numeric: true,
                  sensitivity: 'base',
                }
              )
          );
      };

    const configuredPeriods =
      () => {
        const periods =
          new Set();

        for (
          const period
          of (
            currentSchedule?.periods ||
            []
          )
        ) {
          if (
            period?.isPlanning === true ||
            period?.planning === true
          ) {
            continue;
          }

          const label =
            (
              period?.label ||
              period?.name ||
              ''
            ).trim();

          if (label) {
            periods.add(
              label
            );
          }
        }

        for (
          const goal
          of allGoals
        ) {
          for (
            const period
            of getConfiguredClassPeriods(
              goal
            )
          ) {
            periods.add(
              period
            );
          }
        }

        return [
          ...periods,
        ].sort(
          (left, right) =>
            left.localeCompare(
              right,
              undefined,
              {
                numeric: true,
              }
            )
        );
      };

    const studentDisplayLabel =
      student =>
        `${student.name || student.code} (${student.code})`;

    const refreshStudentRail =
      () => {
        const students =
          getObservationCenterStudents();

        if (
          selectedStudentCode &&
          !students.some(
            student =>
              student.code ===
                selectedStudentCode
          )
        ) {
          selectedStudentCode =
            '';
        }

        const query =
          studentRailSearch.value
            .trim()
            .toLowerCase();

        const visibleStudents =
          query
            ? students.filter(
                student =>
                  studentDisplayLabel(
                    student
                  )
                    .toLowerCase()
                    .includes(
                      query
                    )
              )
            : students;

        studentRailList.innerHTML =
          '';

        if (
          visibleStudents.length ===
          0
        ) {
          const empty =
            document.createElement(
              'div'
            );

          empty.className =
            'obs-center-student-empty';

          empty.textContent =
            students.length === 0
              ? 'No students with observation goals'
              : 'No matching students';

          studentRailList.appendChild(
            empty
          );
        } else {
          for (
            const student
            of visibleStudents
          ) {
            const item =
              document.createElement(
                'button'
              );

            item.type =
              'button';

            item.className =
              'obs-center-student-rail-item';

            item.setAttribute(
              'role',
              'option'
            );

            item.setAttribute(
              'aria-selected',
              String(
                student.code ===
                  selectedStudentCode
              )
            );

            item.dataset.studentCode =
              student.code;

            item.textContent =
              studentDisplayLabel(
                student
              );

            item.addEventListener(
              'click',
              async () => {
                selectedStudentCode =
                  student.code;

                saveStatus.textContent =
                  '';

                refreshStudentRail();

                await renderWorkspace();
              }
            );

            studentRailList.appendChild(
              item
            );
          }
        }

        return students;
      };

    const refreshPeriodOptions =
      () => {
        const periods =
          configuredPeriods();

        periodSelect.innerHTML =
          '';

        const placeholder =
          document.createElement(
            'option'
          );

        placeholder.value =
          '';

        if (
          periods.length === 0
        ) {
          placeholder.textContent =
            'No class periods available';
        } else if (
          selectedBrowseMode ===
          'period'
        ) {
          placeholder.textContent =
            'Select class period…';
        } else if (
          selectedDate !==
          todayStr()
        ) {
          placeholder.textContent =
            'Select the observation period for this historical entry…';
        } else {
          placeholder.textContent =
            'Select observation period…';
        }

        periodSelect.appendChild(
          placeholder
        );

        for (
          const period
          of periods
        ) {
          const option =
            document.createElement(
              'option'
            );

          option.value =
            period;

          option.textContent =
            period;

          periodSelect.appendChild(
            option
          );
        }

        if (
          selectedDate ===
            todayStr() &&
          !selectedPeriod
        ) {
          const livePeriod =
            getLiveCurrentPeriodLabel();

          if (
            livePeriod &&
            periods.includes(
              livePeriod
            )
          ) {
            selectedPeriod =
              livePeriod;
          }
        }

        if (
          selectedPeriod &&
          periods.includes(
            selectedPeriod
          )
        ) {
          periodSelect.value =
            selectedPeriod;
        } else {
          selectedPeriod =
            '';

          periodSelect.value =
            '';
        }

        return periods;
      };

    const syncBrowseControls =
      () => {
        const studentMode =
          selectedBrowseMode ===
          'student';

        const historical =
          selectedDate !==
          todayStr();

        studentModeBtn.classList.toggle(
          'active',
          studentMode
        );

        studentModeBtn.setAttribute(
          'aria-pressed',
          String(
            studentMode
          )
        );

        periodModeBtn.classList.toggle(
          'active',
          !studentMode
        );

        periodModeBtn.setAttribute(
          'aria-pressed',
          String(
            !studentMode
          )
        );

        studentPanel.hidden =
          !studentMode;

        studentLayout.classList.toggle(
          'period-mode',
          !studentMode
        );

        periodPanel.hidden =
          studentMode &&
          !historical;

        periodLabel.textContent =
          studentMode
            ? 'Observation period'
            : 'Class period';

        if (
          studentMode &&
          historical
        ) {
          periodHelp.textContent =
            'Historical capture requires the actual period when the observation occurred.';
        } else if (
          studentMode
        ) {
          periodHelp.textContent =
            'Today uses the current bell-schedule period when available.';
        } else {
          periodHelp.textContent =
            'Choose a period to see its configured observation cards.';
        }
      };

    const showHint =
      message => {
        workspace.innerHTML =
          '';

        const hint =
          document.createElement(
            'div'
          );

        hint.className =
          'obs-center-hint';

        hint.textContent =
          message;

        workspace.appendChild(
          hint
        );
      };

    const buildGoalPeriodMeta =
      (
        goal,
        recordingPeriod = null
      ) => {
        const periods =
          getConfiguredClassPeriods(
            goal
          );

        const meta =
          document.createElement(
            'div'
          );

        meta.className =
          'obs-center-goal-period';

        const configuredText =
          periods.length > 0
            ? `Configured period${periods.length === 1 ? '' : 's'}: ${periods.join(', ')}`
            : 'Configured period: not set';

        meta.textContent =
          recordingPeriod
            ? `${configuredText} · Recording as: ${recordingPeriod}`
            : configuredText;

        return meta;
      };

    const buildLockedHistoricalGoal =
      goal => {
        const card =
          document.createElement(
            'div'
          );

        card.className =
          'obs-goal-card obs-center-goal-locked';

        const title =
          document.createElement(
            'div'
          );

        title.className =
          'obs-center-goal-locked-title';

        title.textContent =
          goal.desc ||
          goal.goal_text ||
          goal.code ||
          'Observation goal';

        const lock =
          document.createElement(
            'div'
          );

        lock.className =
          'obs-center-goal-lock';

        lock.textContent =
          'Choose the observation period above before entering historical data. OBS-7 will not guess historical period identity.';

        card.append(
          buildGoalPeriodMeta(
            goal
          ),
          title,
          lock
        );

        return card;
      };

    const buildCenterCaptureCard =
      (
        goal,
        studentCode,
        periodOverride = null
      ) => {
        const wrapper =
          document.createElement(
            'article'
          );

        wrapper.className =
          'obs-center-capture-card';

        wrapper.dataset.studentCode =
          studentCode;

        wrapper.dataset.goalCode =
          goal.code ||
          '';

        const historical =
          selectedDate !==
          todayStr();

        if (
          historical &&
          !periodOverride
        ) {
          wrapper.appendChild(
            buildLockedHistoricalGoal(
              goal
            )
          );

          return wrapper;
        }

        const dueState =
          getGoalDueState(
            goal,
            selectedDate,
            periodOverride
          );

        const card =
          buildGoalCard(
            goal,
            selectedDate,
            () => {
              saveStatus.textContent =
                `Saved for ${formatCenterDate(selectedDate)}`;

              updateTrayBadge();
            },
            dueState,
            periodOverride
          );

        const goalDescription =
          document.createElement(
            'div'
          );

        goalDescription.className =
          'obs-center-goal-description';

        goalDescription.textContent =
          goal.desc ||
          goal.goal_text ||
          goal.code ||
          'Observation goal';

        card.insertBefore(
          goalDescription,
          card.firstChild
        );

        card.insertBefore(
          buildGoalPeriodMeta(
            goal,
            periodOverride
          ),
          card.firstChild
        );

        wrapper.appendChild(
          card
        );

        return wrapper;
      };

    const renderStudentSection =
      (
        studentCode,
        goals,
        periodOverride = null
      ) => {
        const student =
          allStudents.find(
            candidate =>
              candidate.code ===
              studentCode
          );

        const section =
          document.createElement(
            'section'
          );

        section.className =
          'obs-student-section';

        const name =
          document.createElement(
            'div'
          );

        name.className =
          'obs-student-name';

        name.textContent =
          `${student?.name || studentCode} (${studentCode})`;

        const grid =
          document.createElement(
            'div'
          );

        grid.className =
          'obs-center-card-grid';

        for (
          const goal
          of goals
        ) {
          grid.appendChild(
            buildCenterCaptureCard(
              goal,
              studentCode,
              periodOverride
            )
          );
        }

        section.append(
          name,
          grid
        );

        return section;
      };

    const renderWorkspace =
      async () => {
        const dayStatus =
          getInstructionalDayStatus(
            selectedDate
          );

        nextBtn.disabled =
          selectedDate >=
          todayStr();

        todayBtn.disabled =
          selectedDate ===
          todayStr();

        dateInput.value =
          selectedDate;

        const observationStudents =
          refreshStudentRail();

        refreshPeriodOptions();
        syncBrowseControls();

        if (
          !dayStatus.instructional
        ) {
          showHint(
            `No observations scheduled — ${dayStatus.label}.`
          );

          return;
        }

        await loadRecordedEntriesForWeek(
          selectedDate
        );

        if (
          selectedBrowseMode ===
            'student'
        ) {
          if (
            observationStudents.length ===
            0
          ) {
            if (
              selectedDate !==
                todayStr() &&
              !selectedPeriod
            ) {
              showHint(
                'Select a class period before entering historical observational data. The period is required so the entry is attached to the correct observation opportunity.'
              );
            } else {
              showHint(
                'No students with observation goals are available.'
              );
            }

            return;
          }

          if (
            !selectedStudentCode
          ) {
            showHint(
              'Select a student to view observational goals for this date.'
            );

            return;
          }

          const matchingGoals =
            allGoals.filter(
              goal =>
                goal.student_code ===
                selectedStudentCode
            );

          workspace.innerHTML =
            '';

          const student =
            allStudents.find(
              candidate =>
                candidate.code ===
                selectedStudentCode
            );

          const heading =
            document.createElement(
              'div'
            );

          heading.className =
            'obs-center-period-heading';

          heading.textContent =
            `${student?.name || selectedStudentCode} — ${formatCenterDate(selectedDate)}`;

          workspace.appendChild(
            heading
          );

          if (
            matchingGoals.length ===
            0
          ) {
            showHint(
              'No observation goals are configured for this student.'
            );

            return;
          }

          workspace.appendChild(
            renderStudentSection(
              selectedStudentCode,
              matchingGoals,
              selectedPeriod ||
                null
            )
          );

          return;
        }

        if (
          selectedBrowseMode ===
            'period' &&
          !selectedPeriod
        ) {
          showHint(
            selectedDate !==
              todayStr()
              ? 'Select a class period before entering historical observational data. The period is required so the entry is attached to the correct observation opportunity.'
              : 'Select a class period to view observational goals.'
          );

          return;
        }

        const matchingGoals =
          allGoals.filter(
            goal =>
              getConfiguredClassPeriods(
                goal
              ).includes(
                selectedPeriod
              )
          );

        workspace.innerHTML =
          '';

        const heading =
          document.createElement(
            'div'
          );

        heading.className =
          'obs-center-period-heading';

        heading.textContent =
          `${selectedPeriod} — ${formatCenterDate(selectedDate)}`;

        workspace.appendChild(
          heading
        );

        if (
          matchingGoals.length ===
          0
        ) {
          showHint(
            `No observation goals are configured for ${selectedPeriod}.`
          );

          return;
        }

        const grouped =
          new Map();

        for (
          const goal
          of matchingGoals
        ) {
          if (
            !grouped.has(
              goal.student_code
            )
          ) {
            grouped.set(
              goal.student_code,
              []
            );
          }

          grouped
            .get(
              goal.student_code
            )
            .push(
              goal
            );
        }

        for (
          const [
            studentCode,
            goals,
          ]
          of grouped
        ) {
          workspace.appendChild(
            renderStudentSection(
              studentCode,
              goals,
              selectedPeriod
            )
          );
        }
      };

    const getAdjacentInstructionalDate =
      (
        dateKey,
        direction
      ) => {
        if (
          direction !== -1 &&
          direction !== 1
        ) {
          return dateKey;
        }

        let candidate =
          dateKey;

        for (
          let attempt = 0;
          attempt < 21;
          attempt += 1
        ) {
          candidate =
            addDays(
              candidate,
              direction
            );

          if (
            direction > 0 &&
            candidate >
              todayStr()
          ) {
            return dateKey;
          }

          const dayStatus =
            getInstructionalDayStatus(
              candidate
            );

          if (
            dayStatus.instructional
          ) {
            return candidate;
          }
        }

        return dateKey;
      };

    const applyDeckDirection =
      () => {
        workspace.classList.remove(
          'obs-center-deck-back',
          'obs-center-deck-forward'
        );

        if (
          deckDirection === 0
        ) {
          return;
        }

        const motionClass =
          deckDirection < 0
            ? 'obs-center-deck-back'
            : 'obs-center-deck-forward';

        workspace.classList.add(
          motionClass
        );

        window.setTimeout(
          () => {
            workspace.classList.remove(
              motionClass
            );
          },
          260
        );
      };

    const navigateTo =
      async (
        newDate,
        direction = 0
      ) => {
        if (
          typeof newDate !==
            'string' ||
          !newDate ||
          newDate >
            todayStr()
        ) {
          return;
        }

        selectedDate =
          newDate;

        deckDirection =
          direction;

        saveStatus.textContent =
          '';

        /*
         * Historical entry must remain deliberate.
         * Never carry inferred period identity across dates.
         */
        selectedPeriod =
          '';

        await renderWorkspace();

        applyDeckDirection();

        deckDirection =
          0;
      };

    const setBrowseMode =
      async mode => {
        if (
          ![
            'student',
            'period',
          ].includes(
            mode
          )
        ) {
          return;
        }

        selectedBrowseMode =
          mode;

        selectedPeriod =
          '';

        saveStatus.textContent =
          '';

        await renderWorkspace();
      };

    previousBtn.addEventListener(
      'click',
      () => {
        navigateTo(
          getAdjacentInstructionalDate(
            selectedDate,
            -1
          ),
          -1
        );
      }
    );

    nextBtn.addEventListener(
      'click',
      () => {
        navigateTo(
          getAdjacentInstructionalDate(
            selectedDate,
            1
          ),
          1
        );
      }
    );

    todayBtn.addEventListener(
      'click',
      () => {
        navigateTo(
          todayStr(),
          selectedDate <
            todayStr()
            ? 1
            : 0
        );
      }
    );

    dateInput.addEventListener(
      'change',
      () => {
        const newDate =
          dateInput.value;

        if (
          !newDate ||
          newDate >
            todayStr()
        ) {
          dateInput.value =
            selectedDate;

          return;
        }

        const direction =
          newDate <
            selectedDate
            ? -1
            : newDate >
                selectedDate
              ? 1
              : 0;

        navigateTo(
          newDate,
          direction
        );
      }
    );

    studentModeBtn.addEventListener(
      'click',
      () => {
        setBrowseMode(
          'student'
        );
      }
    );

    periodModeBtn.addEventListener(
      'click',
      () => {
        setBrowseMode(
          'period'
        );
      }
    );

    studentRailSearch.addEventListener(
      'input',
      () => {
        refreshStudentRail();
      }
    );

    periodSelect.addEventListener(
      'change',
      async () => {
        selectedPeriod =
          periodSelect.value;

        saveStatus.textContent =
          '';

        await renderWorkspace();
      }
    );

    await renderWorkspace();
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  await loadData();
  await loadRecordedEntriesForWeek(todayStr());
  await syncQueue();

  await initObservationCenter();

  // Inject the tray icon into the topbar
  injectTrayIcon();
  updateTrayBadge();

  // Reload data every 5 minutes
  const _dataInterval = setInterval(async () => {
    // If the date has changed since the last Supabase load, clear the stale entry
    // so midnight-stale data doesn't hide newly-required observations.
    if (todayRecordedDate !== null && todayStr() !== todayRecordedDate) {
      recordedByDate.delete(todayRecordedDate);
      observationEvidenceByDate.delete(todayRecordedDate);
      observationDispositionsByDate.delete(todayRecordedDate);
      todayRecordedDate = null;
      console.log('[tc-observation] New day detected — cleared stale recorded set');
    }
    await loadData();
    await loadRecordedEntriesForWeek(todayStr());
    await syncQueue();
    updateTrayBadge();
    // If tray is open, refresh its content
    if (isTrayOpen) {
      closeTray();
      openTray();
    }
  }, 5 * 60_000);

  // Attempt queue sync every 60 seconds
  const _syncInterval = setInterval(syncQueue, 60_000);

  // Expose cleanup (e.g. for SPA navigation)
  window._obsCleanup = () => {
    clearInterval(_dataInterval);
    clearInterval(_syncInterval);
    closeTray();
  };

  console.log('[tc-observation] Tray ready —', allGoals.length, 'observation goal(s) configured');
})();
