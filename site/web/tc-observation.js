// tc-observation.js
// Always-visible observation tray for the Teacher Center.
// Teachers click the clipboard icon in the topbar to open a lightweight tray
// showing all observation goals for today, grouped by student, with inline
// data-entry forms. No schedule dependency — records one entry per goal per day.

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
.obs-tray-backdrop { position: fixed; inset: 0; z-index: 9990; }
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
.obs-tray-title { font-weight: 700; font-size: 14px; flex: 1; }
.obs-tray-close-btn {
  padding: 4px; border: none; background: none;
  color: rgba(255,255,255,0.5); cursor: pointer;
  border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;
}
.obs-tray-close-btn:hover { background: rgba(255,255,255,0.08); color: var(--rc-ink, #e8edf4); }
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

  // ─── State ────────────────────────────────────────────────────────────────
  let allGoals = [];
  let allStudents = [];
  let trayIconEl = null;
  let trayEl = null;
  let trayBackdropEl = null;
  let isTrayOpen = false;
  // Set of "studentCode|goalCode" for goals recorded today (populated from Supabase on init)
  const todayRecordedSet = new Set();

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
          via: 'observation_tray',
          notes: entry.notes || ''
        });
        markSynced(entry.saved_at, entry.student_code, entry.goal_code);
      } catch (err) {
        console.warn('[tc-observation] Sync failed for', entry.goal_code, err.message);
      }
    }
    pruneQueue();
  }

  // ─── Duplicate Check (date-only, no period label) ─────────────────────────
  function isAlreadyRecorded(studentCode, goalCode, date) {
    // Check Supabase pre-load set first
    if (todayRecordedSet.has(`${studentCode}|${goalCode}`)) return true;
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
      return Math.round((s / o) * 10000) / 100;
    }

    if (category === 'prompt_count') {
      return promptCount != null ? Number(promptCount) : null;
    }

    if (category === 'behavior_checklist') {
      if (!subBehaviors || subBehaviors.length === 0) return null;
      if (response === 'not_addressed') return null;
      const checked = (checkedBehaviors || []).filter(Boolean).length;
      return Math.round((checked / subBehaviors.length) * 10000) / 100;
    }

    return null;
  }

  // ─── Save Observation ─────────────────────────────────────────────────────
  async function saveObservation(goal, responseData, noteText, saveIndicatorEl, onSave) {
    const category = goal.observation_config?.category;
    const value = calcValue(category, responseData);
    const notes = buildObservationNotes(category, responseData, noteText);
    const date = todayStr();

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
    // Mark in the recorded set so future checks reflect this immediately
    todayRecordedSet.add(`${goal.student_code}|${goal.code}`);
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
        via: 'observation_tray',
        notes
      });
      markSynced(savedAt, goal.student_code, goal.code);
      console.log('[tc-observation] Supabase save succeeded: goal=', goal.code);
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

  function renderSessionOutcomeForm(goal, cardEl, saveIndicatorEl, preRecorded, onSave) {
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
        await saveObservation(goal, { response }, noteInput.value, saveIndicatorEl, onSave);
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
        await saveObservation(goal, { response: selectedResponse }, noteInput.value, saveIndicatorEl, onSave);
      }
    });
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        const queueEntry = getQueueEntry(goal.student_code, goal.code, todayStr());
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

  function renderTallyForm(goal, cardEl, saveIndicatorEl, preRecorded, onSave) {
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
        await saveObservation(goal, { successful: s, opportunities: o }, noteInput.value, saveIndicatorEl, onSave);
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
        await saveObservation(goal, { response }, noteInput.value, saveIndicatorEl, onSave);
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
        await saveObservation(goal, { response: noOppResponse }, noteInput.value, saveIndicatorEl, onSave);
      } else if (o > 0) {
        await saveObservation(goal, { successful: s, opportunities: o }, noteInput.value, saveIndicatorEl, onSave);
      }
    });
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        const queueEntry = getQueueEntry(goal.student_code, goal.code, todayStr());
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

  function renderPromptCountForm(goal, cardEl, saveIndicatorEl, preRecorded, onSave) {
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
        await saveObservation(goal, { promptCount: numVal }, noteInput.value, saveIndicatorEl, onSave);
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
        await saveObservation(goal, { promptCount: selectedCount }, noteInput.value, saveIndicatorEl, onSave);
      }
    });
    formWrapper.appendChild(noteInput);
    container.appendChild(formWrapper);

    if (preRecorded && badgeEl) {
      const editBtn = badgeEl.querySelector('.obs-edit-link');
      editBtn.addEventListener('click', () => {
        badgeEl.style.display = 'none';
        formWrapper.style.display = '';
        const queueEntry = getQueueEntry(goal.student_code, goal.code, todayStr());
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

  function renderBehaviorChecklistForm(goal, cardEl, saveIndicatorEl, preRecorded, onSave) {
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
        onSave
      );
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
        const queueEntry = getQueueEntry(goal.student_code, goal.code, todayStr());
        const parsed = queueEntry ? parseObservationNotes(queueEntry.notes) : null;
        if (parsed && parsed.category === 'checklist') {
          if (parsed.rawData === 'not_addressed') {
            notAddressedBtn.classList.add('active');
          } else {
            const items = parsed.rawData ? parsed.rawData.split(',') : [];
            const cbs = formWrapper.querySelectorAll('input[type="checkbox"]');
            items.forEach((item, i) => {
              const isMet = item.endsWith('=met');
              if (isMet && cbs[i]) { cbs[i].checked = true; checkedStates[i] = true; }
            });
            updateSummary();
          }
          if (parsed.userNote) noteInput.value = parsed.userNote;
        }
      });
    }

    cardEl.appendChild(container);
  }

  // ─── Build Goal Card ──────────────────────────────────────────────────────
  function buildGoalCard(goal, date, onAnyRecorded) {
    const config = goal.observation_config || {};
    const category = config.category;
    const isRecorded = isAlreadyRecorded(goal.student_code, goal.code, date);

    const cardEl = document.createElement('div');
    cardEl.className = 'obs-goal-card';

    // ── Card header (always visible) ──
    const header = document.createElement('div');
    header.className = 'obs-card-header';

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
    if (isRecorded) {
      statusBadge.innerHTML = OBS_CHECK_SVG + ' Recorded';
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

    // onSave callback — updates card status and collapses if newly recorded
    const onSave = () => {
      const nowRecorded = isAlreadyRecorded(goal.student_code, goal.code, date);
      if (nowRecorded && !statusBadge.innerHTML) {
        statusBadge.innerHTML = OBS_CHECK_SVG + ' Recorded';
      }
      if (nowRecorded) {
        applyExpanded(false);
      }
      onAnyRecorded();
    };

    if (category === 'session_outcome') {
      renderSessionOutcomeForm(goal, body, saveIndicatorEl, isRecorded, onSave);
    } else if (category === 'tally') {
      renderTallyForm(goal, body, saveIndicatorEl, isRecorded, onSave);
    } else if (category === 'prompt_count') {
      renderPromptCountForm(goal, body, saveIndicatorEl, isRecorded, onSave);
    } else if (category === 'behavior_checklist') {
      renderBehaviorChecklistForm(goal, body, saveIndicatorEl, isRecorded, onSave);
    } else {
      const unknownMsg = document.createElement('div');
      unknownMsg.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.4);padding:4px 0;';
      unknownMsg.textContent = `Unknown category: ${escapeHtml(category || '(none)')}`;
      body.appendChild(unknownMsg);
    }

    body.appendChild(saveIndicatorEl);
    cardEl.appendChild(body);

    // ── Collapse/expand logic ──
    let isExpanded = !isRecorded; // Unrecorded starts expanded

    const applyExpanded = (expanded) => {
      isExpanded = expanded;
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
  function countUnrecorded(date) {
    return allGoals.filter(g => !isAlreadyRecorded(g.student_code, g.code, date)).length;
  }

  function buildTrayContent(date, onAnyRecorded) {
    const studentsMap = new Map(allStudents.map(s => [s.code, s]));
    const fragment = document.createDocumentFragment();

    // Group goals by student
    const byStudent = new Map();
    for (const goal of allGoals) {
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
      nameEl.textContent = `${studentName} (${studentCode})`;
      section.appendChild(nameEl);

      for (const goal of goals) {
        section.appendChild(buildGoalCard(goal, date, onAnyRecorded));
      }

      fragment.appendChild(section);
    }

    return fragment;
  }

  // ─── Tray Badge ───────────────────────────────────────────────────────────
  function updateTrayBadge() {
    if (!trayIconEl) return;
    const badge = trayIconEl.querySelector('.obs-tray-badge');
    if (!badge) return;

    if (allGoals.length === 0) {
      badge.style.display = 'none';
      return;
    }

    const date = todayStr();
    const unrecorded = countUnrecorded(date);

    if (unrecorded === 0) {
      badge.className = 'obs-tray-badge all-done';
      badge.innerHTML = OBS_CHECK_SVG;
      badge.style.display = '';
    } else {
      badge.className = 'obs-tray-badge has-unrecorded';
      badge.textContent = String(unrecorded);
      badge.style.display = '';
    }
  }

  // ─── Open / Close Tray ───────────────────────────────────────────────────
  function openTray() {
    if (isTrayOpen) return;
    isTrayOpen = true;

    const date = todayStr();

    // Semi-transparent backdrop — click outside closes tray
    trayBackdropEl = document.createElement('div');
    trayBackdropEl.className = 'obs-tray-backdrop';
    trayBackdropEl.addEventListener('click', closeTray);
    document.body.appendChild(trayBackdropEl);

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

    const title = document.createElement('div');
    title.className = 'obs-tray-title';
    const dateDisplay = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    title.innerHTML = OBS_CLIPBOARD_SVG + ' <span>Observation Goals — ' + escapeHtml(dateDisplay) + '</span>';
    title.querySelector('svg').style.cssText = 'vertical-align:middle;margin-right:6px;opacity:0.7;';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'obs-tray-close-btn tc-btn';
    closeBtn.setAttribute('aria-label', 'Close observation tray');
    closeBtn.innerHTML = OBS_CLOSE_SVG;
    closeBtn.addEventListener('click', closeTray);

    header.appendChild(title);
    header.appendChild(closeBtn);
    trayEl.appendChild(header);

    // Body (scrollable)
    const bodyEl = document.createElement('div');
    bodyEl.className = 'obs-tray-body';

    if (allGoals.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'obs-tray-empty';
      empty.textContent = 'No observation goals configured for your students.';
      bodyEl.appendChild(empty);
    } else {
      const onAnyRecorded = () => {
        updateTrayBadge();
        updateFooterText();
      };
      bodyEl.appendChild(buildTrayContent(date, onAnyRecorded));
    }
    trayEl.appendChild(bodyEl);

    // Footer
    const footerEl = document.createElement('div');
    footerEl.className = 'obs-tray-footer';
    const updateFooterText = () => {
      const total = allGoals.length;
      const recorded = total - countUnrecorded(date);
      if (recorded >= total && total > 0) {
        footerEl.innerHTML = OBS_CHECK_SVG + ` <span style="color:#22c55e;">${recorded} of ${total} recorded — all done!</span>`;
      } else {
        footerEl.textContent = total > 0 ? `${recorded} of ${total} recorded` : '';
      }
    };
    updateFooterText();
    trayEl.appendChild(footerEl);

    document.body.appendChild(trayEl);

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
      const [goals, students] = await Promise.all([
        db.listGoalsAll(),
        db.listStudents()
      ]);

      const rawGoals = goals || [];
      const obsTypeGoals = rawGoals.filter(g => g.measurement_type === 'Observation');
      const withConfig = obsTypeGoals.filter(g => g.observation_config != null);

      allGoals = withConfig;
      allStudents = students || [];

      console.log(
        '[tc-observation] loadData: total goals=', rawGoals.length,
        'observation=', obsTypeGoals.length,
        'with config=', withConfig.length
      );
    } catch (err) {
      console.warn('[tc-observation] loadData error:', err.message);
    }
  }

  // ─── Pre-load Today's Supabase Entries ────────────────────────────────────
  // Populates todayRecordedSet so the tray accurately reflects recorded state
  // even if localStorage was cleared or the teacher is on a different device.
  async function loadTodaySupabaseEntries() {
    if (allGoals.length === 0) return;
    const date = todayStr();
    try {
      const goalCodes = allGoals.map(g => g.code);
      const entries = await db.listGoalProgress({
        startDate: date,
        endDate: date,
        goalCodes
      });
      let count = 0;
      for (const entry of (entries || [])) {
        if (entry.student_code && entry.goal_code) {
          const key = `${entry.student_code}|${entry.goal_code}`;
          if (!todayRecordedSet.has(key)) {
            todayRecordedSet.add(key);
            count++;
          }
        }
      }
      if (count > 0) {
        console.log('[tc-observation] Pre-loaded', count, 'already-recorded goal(s) from Supabase for today');
      }
    } catch (err) {
      console.warn('[tc-observation] Could not pre-load today\'s Supabase entries:', err.message);
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  await loadData();
  await loadTodaySupabaseEntries();
  await syncQueue();

  // Inject the tray icon into the topbar
  injectTrayIcon();
  updateTrayBadge();

  // Reload data every 5 minutes
  const _dataInterval = setInterval(async () => {
    await loadData();
    await loadTodaySupabaseEntries();
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
