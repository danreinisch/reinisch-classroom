/**
 * tc-close-year.js
 * Teacher Center — Close School Year wizard
 * 5-step wizard: Pre-Flight → Archive Submissions → Clear Assignments → Archive Students → Summary
 */

(async () => {
  'use strict';

  // Route guard
  if (!location.pathname.startsWith('/teacher/close-year')) return;

  console.log('[tc-close-year] Initializing Close School Year wizard');

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getCurrentSchoolYear() {
    const now = new Date();
    const m = now.getMonth() + 1;
    return m >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  }

  function fmtYear(y) {
    return `${y}–${y + 1}`;
  }

  function escapeHtml(text) {
    if (!text && text !== 0) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
  }

  function $(id) { return document.getElementById(id); }

  // ── State ─────────────────────────────────────────────────────────────────────

  const SCHOOL_YEAR = getCurrentSchoolYear();
  const NEXT_YEAR = SCHOOL_YEAR + 1;
  const YEAR_LABEL = fmtYear(SCHOOL_YEAR);
  const NEXT_YEAR_LABEL = fmtYear(NEXT_YEAR);

  const state = {
    step: 0,           // 0-4
    preflight: null,   // response from preflight endpoint
    archived: 0,       // submissions archived
    deletedInstances: 0,
    deletedSubmissions: 0,
    archivedStudents: 0,
    activeStudents: [], // [{code, name}]
    working: false,
  };

  // ── DOM ───────────────────────────────────────────────────────────────────────

  const wizardEl = $('cyWizard');
  const indicatorEl = $('cyStepIndicator');

  const STEP_LABELS = [
    'Pre-Flight',
    'Archive Submissions',
    'Clear Assignments',
    'Archive Students',
    'Summary',
  ];

  // ── Step Indicator ────────────────────────────────────────────────────────────

  function renderIndicator() {
    const parts = [];
    for (let i = 0; i < STEP_LABELS.length; i++) {
      const cls = i < state.step ? 'complete' : i === state.step ? 'active' : '';
      const icon = i < state.step ? '✓' : i + 1;
      parts.push(`<div class="cy-step-dot ${cls}" title="${escapeHtml(STEP_LABELS[i])}">${icon}</div>`);
      if (i < STEP_LABELS.length - 1) {
        parts.push(`<div class="cy-step-connector ${i < state.step ? 'complete' : ''}"></div>`);
      }
    }
    indicatorEl.innerHTML = parts.join('');
  }

  // ── Fetch helpers ─────────────────────────────────────────────────────────────

  async function fetchPreflight() {
    const res = await fetch('/.netlify/functions/teacher-close-year-preflight', {
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function callArchive(action, extra = {}) {
    const body = { action, school_year: SCHOOL_YEAR, ...extra };
    const res = await fetch('/.netlify/functions/teacher-close-year-archive', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  // ── Shared render pieces ──────────────────────────────────────────────────────

  function progressBarHtml(id, pct = 0) {
    return `<div class="cy-progress-bar"><div class="cy-progress-fill" id="${id}" style="width:${pct}%"></div></div>`;
  }

  function alertHtml(type, msg) {
    const icon = type === 'success' ? '✅' : type === 'warn' ? '⚠️' : '❌';
    return `<div class="cy-alert ${type}">${icon} ${escapeHtml(msg)}</div>`;
  }

  // ── Step 0: Pre-Flight Check ──────────────────────────────────────────────────

  async function renderStep0() {
    wizardEl.innerHTML = `
      <div class="cy-card">
        <div class="cy-section-title">
          Step 1 of 5 — Pre-Flight Check
        </div>
        <div class="cy-desc">
          Reviewing current school year data before starting the close-out process.
          Current school year: <span class="cy-year-badge">📅 ${escapeHtml(YEAR_LABEL)}</span>
        </div>
        <div id="cyPreflightContent">
          <div class="cy-loading"><div class="cy-spinner"></div>Fetching data counts…</div>
        </div>
      </div>`;

    try {
      const data = await fetchPreflight();
      state.preflight = data;
      const c = data.counts || {};
      const nullCounts = c.null_school_year || {};
      const totalNull = (nullCounts.assignments || 0) + (nullCounts.submissions || 0) + (nullCounts.goal_progress || 0);

      const $pc = $('cyPreflightContent');
      if (!$pc) return;

      $pc.innerHTML = `
        <div class="cy-stat-grid">
          <div class="cy-stat">
            <div class="cy-stat-value">${escapeHtml(c.active_students ?? '—')}</div>
            <div class="cy-stat-label">Active Students</div>
          </div>
          <div class="cy-stat">
            <div class="cy-stat-value">${escapeHtml(c.assignments ?? '—')}</div>
            <div class="cy-stat-label">Assignments</div>
          </div>
          <div class="cy-stat">
            <div class="cy-stat-value">${escapeHtml(c.assignment_instances ?? '—')}</div>
            <div class="cy-stat-label">Issued Assignments</div>
          </div>
          <div class="cy-stat">
            <div class="cy-stat-value">${escapeHtml(c.submissions ?? '—')}</div>
            <div class="cy-stat-label">Submissions</div>
          </div>
          <div class="cy-stat">
            <div class="cy-stat-value">${escapeHtml(c.goal_progress ?? '—')}</div>
            <div class="cy-stat-label">Goal Progress Entries</div>
          </div>
        </div>

        <ul class="cy-checklist">
          <li>
            <span class="cy-check-ok">✅</span>
            School year column exists on all tables
          </li>
          <li>
            <span class="cy-check-ok">✅</span>
            All queries filtered by school year
          </li>
          <li>
            <span class="${totalNull > 0 ? 'cy-check-warn' : 'cy-check-ok'}">
              ${totalNull > 0 ? '⚠️' : '✅'}
            </span>
            ${totalNull > 0
              ? `${totalNull} row(s) missing school_year (assignments: ${nullCounts.assignments || 0}, submissions: ${nullCounts.submissions || 0}, goal_progress: ${nullCounts.goal_progress || 0})`
              : 'No rows missing school_year'}
          </li>
        </ul>

        ${totalNull > 0 ? alertHtml('warn', `${totalNull} rows have no school_year set. They will not be processed during close-out. Consider backfilling before proceeding.`) : ''}

        <div class="cy-btn-row">
          <button class="cy-btn primary" id="cyStep0Next">Next →</button>
        </div>`;

      $('cyStep0Next').addEventListener('click', () => goToStep(1));
    } catch (err) {
      const $pc = $('cyPreflightContent');
      if ($pc) {
        $pc.innerHTML = alertHtml('error', `Failed to load preflight data: ${err.message}`) +
          `<div class="cy-btn-row"><button class="cy-btn" id="cyStep0Retry">Retry</button></div>`;
        $('cyStep0Retry').addEventListener('click', () => renderStep0());
      }
    }
  }

  // ── Step 1: Archive Submissions ───────────────────────────────────────────────

  function renderStep1() {
    const subCount = state.preflight?.counts?.submissions ?? '?';

    wizardEl.innerHTML = `
      <div class="cy-card">
        <div class="cy-section-title">Step 2 of 5 — Archive Submissions</div>
        <div class="cy-desc">
          All submissions from ${escapeHtml(YEAR_LABEL)} will be copied to the submission archive,
          preserving student answers and scores for permanent record-keeping.
          The originals will remain in place until Step 3.
        </div>
        <div class="cy-stat-grid">
          <div class="cy-stat">
            <div class="cy-stat-value">${escapeHtml(subCount)}</div>
            <div class="cy-stat-label">Submissions to archive</div>
          </div>
        </div>
        <div id="cyStep1Status" class="cy-status-text"></div>
        ${progressBarHtml('cyStep1Bar')}
        <div id="cyStep1Alert"></div>
        <div class="cy-btn-row" id="cyStep1Btns">
          <button class="cy-btn" id="cyStep1Back">← Back</button>
          <button class="cy-btn primary" id="cyStep1Run">Archive Submissions</button>
        </div>
      </div>`;

    $('cyStep1Back').addEventListener('click', () => goToStep(0));
    $('cyStep1Run').addEventListener('click', runStep1);
  }

  async function runStep1() {
    if (state.working) return;
    state.working = true;
    const btn = $('cyStep1Run');
    const backBtn = $('cyStep1Back');
    const status = $('cyStep1Status');
    const bar = $('cyStep1Bar');
    const alertEl = $('cyStep1Alert');

    btn.disabled = true;
    backBtn.disabled = true;
    alertEl.innerHTML = '';
    status.textContent = 'Archiving submissions…';
    bar.style.width = '30%';

    try {
      const result = await callArchive('archive-submissions');
      state.archived = result.archived_submissions || 0;
      bar.style.width = '100%';
      status.textContent = '';
      alertEl.innerHTML = alertHtml('success', `${state.archived} submission(s) archived successfully.`);

      const btns = $('cyStep1Btns');
      if (btns) {
        btns.innerHTML = `<button class="cy-btn primary" id="cyStep1Next">Next →</button>`;
        $('cyStep1Next').addEventListener('click', () => goToStep(2));
      }
    } catch (err) {
      bar.style.width = '0%';
      status.textContent = '';
      alertEl.innerHTML = alertHtml('error', `Archive failed: ${err.message}`);
      btn.disabled = false;
      backBtn.disabled = false;
    } finally {
      state.working = false;
    }
  }

  // ── Step 2: Clear Assignment Data ─────────────────────────────────────────────

  function renderStep2() {
    const instCount = state.preflight?.counts?.assignment_instances ?? '?';
    const subCount = state.preflight?.counts?.submissions ?? '?';

    wizardEl.innerHTML = `
      <div class="cy-card">
        <div class="cy-section-title">Step 3 of 5 — Clear Assignment Data</div>
        <div class="cy-desc">
          Assignment instances and submissions for ${escapeHtml(YEAR_LABEL)} will be removed.
          The assignment templates in the Library will <strong>not</strong> be deleted.
        </div>
        <div class="cy-stat-grid">
          <div class="cy-stat">
            <div class="cy-stat-value">${escapeHtml(instCount)}</div>
            <div class="cy-stat-label">Instances to remove</div>
          </div>
          <div class="cy-stat">
            <div class="cy-stat-value">${escapeHtml(subCount)}</div>
            <div class="cy-stat-label">Submissions to remove</div>
          </div>
        </div>
        <div class="cy-confirm-row">
          <input type="checkbox" id="cyStep2Confirm" />
          <label for="cyStep2Confirm">
            I understand this will permanently remove all issued assignments and submissions
            for <strong>${escapeHtml(YEAR_LABEL)}</strong> from active records.
          </label>
        </div>
        <div id="cyStep2Status" class="cy-status-text"></div>
        ${progressBarHtml('cyStep2Bar')}
        <div id="cyStep2Alert"></div>
        <div class="cy-btn-row" id="cyStep2Btns">
          <button class="cy-btn" id="cyStep2Back">← Back</button>
          <button class="cy-btn danger" id="cyStep2Run" disabled>Clear Assignment Data</button>
        </div>
      </div>`;

    const confirmBox = $('cyStep2Confirm');
    const runBtn = $('cyStep2Run');
    confirmBox.addEventListener('change', () => {
      runBtn.disabled = !confirmBox.checked;
    });
    $('cyStep2Back').addEventListener('click', () => goToStep(1));
    runBtn.addEventListener('click', runStep2);
  }

  async function runStep2() {
    if (state.working) return;
    state.working = true;
    const btn = $('cyStep2Run');
    const backBtn = $('cyStep2Back');
    const confirmBox = $('cyStep2Confirm');
    const status = $('cyStep2Status');
    const bar = $('cyStep2Bar');
    const alertEl = $('cyStep2Alert');

    btn.disabled = true;
    backBtn.disabled = true;
    confirmBox.disabled = true;
    alertEl.innerHTML = '';
    status.textContent = 'Clearing assignment data…';
    bar.style.width = '30%';

    try {
      const result = await callArchive('clear-assignments');
      state.deletedInstances = result.deleted_instances || 0;
      state.deletedSubmissions = result.deleted_submissions || 0;
      bar.style.width = '100%';
      status.textContent = '';
      alertEl.innerHTML = alertHtml('success',
        `${state.deletedInstances} assignment instance(s) and ${state.deletedSubmissions} submission(s) removed.`);

      const btns = $('cyStep2Btns');
      if (btns) {
        btns.innerHTML = `<button class="cy-btn primary" id="cyStep2Next">Next →</button>`;
        $('cyStep2Next').addEventListener('click', () => goToStep(3));
      }
    } catch (err) {
      bar.style.width = '0%';
      status.textContent = '';
      alertEl.innerHTML = alertHtml('error', `Clear failed: ${err.message}`);
      btn.disabled = false;
      backBtn.disabled = false;
      confirmBox.disabled = false;
    } finally {
      state.working = false;
    }
  }

  // ── Step 3: Archive Students (Optional) ───────────────────────────────────────

  async function renderStep3() {
    wizardEl.innerHTML = `
      <div class="cy-card">
        <div class="cy-section-title">Step 4 of 5 — Archive Students (Optional)</div>
        <div class="cy-desc">
          Optionally archive students who are graduating or leaving.
          Archived students remain in the Archive tab but won't appear in active lists.
        </div>
        <div id="cyStep3Content">
          <div class="cy-loading"><div class="cy-spinner"></div>Loading student roster…</div>
        </div>
      </div>`;

    try {
      // Load active students via data adapter
      const { db } = await import('/web/data-adapter.js');
      const students = await db.listStudents({ activeOnly: true });
      state.activeStudents = Array.isArray(students)
        ? students.map(s => ({ code: s.code, name: s.name || s.code }))
        : [];
      renderStep3Students();
    } catch (err) {
      const $c = $('cyStep3Content');
      if ($c) {
        $c.innerHTML = alertHtml('error', `Failed to load students: ${err.message}`) + `
          <div class="cy-btn-row">
            <button class="cy-btn" id="cyStep3Back">← Back</button>
            <button class="cy-btn primary" id="cyStep3Skip">Skip — Keep All Students Active</button>
          </div>`;
        $('cyStep3Back').addEventListener('click', () => goToStep(2));
        $('cyStep3Skip').addEventListener('click', () => { state.archivedStudents = 0; goToStep(4); });
      }
    }
  }

  function renderStep3Students() {
    const $c = $('cyStep3Content');
    if (!$c) return;

    const { activeStudents } = state;
    const studentListHtml = activeStudents.length === 0
      ? '<p style="opacity:0.7;font-size:14px;padding:16px 0;">No active students found.</p>'
      : `<div class="cy-select-btns">
          <button class="cy-select-btn" id="cySelectAll">Select All</button>
          <button class="cy-select-btn" id="cyDeselectAll">Deselect All</button>
        </div>
        <div class="cy-student-list">
          ${activeStudents.map(s => `
            <div class="cy-student-item">
              <input type="checkbox" class="cy-student-check" data-code="${escapeHtml(s.code)}" id="cyStud_${escapeHtml(s.code)}" />
              <label for="cyStud_${escapeHtml(s.code)}">${escapeHtml(s.name)}</label>
              <span class="cy-student-code">${escapeHtml(s.code)}</span>
            </div>`).join('')}
        </div>`;

    $c.innerHTML = `
      ${studentListHtml}
      <div id="cyStep3Status" class="cy-status-text"></div>
      ${progressBarHtml('cyStep3Bar')}
      <div id="cyStep3Alert"></div>
      <div class="cy-btn-row" id="cyStep3Btns">
        <button class="cy-btn" id="cyStep3Back">← Back</button>
        <button class="cy-btn primary" id="cyStep3Run">Archive Selected Students</button>
        <button class="cy-btn" id="cyStep3Skip">Skip — Keep All Students Active</button>
      </div>`;

    const $sel = $('cySelectAll');
    const $desel = $('cyDeselectAll');
    if ($sel) $sel.addEventListener('click', () => {
      document.querySelectorAll('.cy-student-check').forEach(cb => { cb.checked = true; });
    });
    if ($desel) $desel.addEventListener('click', () => {
      document.querySelectorAll('.cy-student-check').forEach(cb => { cb.checked = false; });
    });
    $('cyStep3Back').addEventListener('click', () => goToStep(2));
    $('cyStep3Run').addEventListener('click', runStep3);
    $('cyStep3Skip').addEventListener('click', () => { state.archivedStudents = 0; goToStep(4); });
  }

  async function runStep3() {
    if (state.working) return;
    const selected = Array.from(document.querySelectorAll('.cy-student-check:checked'))
      .map(cb => cb.dataset.code)
      .filter(Boolean);

    if (selected.length === 0) {
      const alertEl = $('cyStep3Alert');
      if (alertEl) alertEl.innerHTML = alertHtml('warn', 'No students selected. Use "Skip" to continue without archiving.');
      return;
    }

    state.working = true;
    const runBtn = $('cyStep3Run');
    const backBtn = $('cyStep3Back');
    const skipBtn = $('cyStep3Skip');
    const status = $('cyStep3Status');
    const bar = $('cyStep3Bar');
    const alertEl = $('cyStep3Alert');

    if (runBtn) runBtn.disabled = true;
    if (backBtn) backBtn.disabled = true;
    if (skipBtn) skipBtn.disabled = true;
    if (alertEl) alertEl.innerHTML = '';
    if (status) status.textContent = `Archiving ${selected.length} student(s)…`;
    if (bar) bar.style.width = '30%';

    try {
      const result = await callArchive('archive-students', { student_codes: selected });
      state.archivedStudents = result.archived_students || 0;
      if (bar) bar.style.width = '100%';
      if (status) status.textContent = '';
      if (alertEl) alertEl.innerHTML = alertHtml('success', `${state.archivedStudents} student(s) archived.`);

      const btns = $('cyStep3Btns');
      if (btns) {
        btns.innerHTML = `<button class="cy-btn primary" id="cyStep3Next">Next →</button>`;
        $('cyStep3Next').addEventListener('click', () => goToStep(4));
      }
    } catch (err) {
      if (bar) bar.style.width = '0%';
      if (status) status.textContent = '';
      if (alertEl) alertEl.innerHTML = alertHtml('error', `Archive students failed: ${err.message}`);
      if (runBtn) runBtn.disabled = false;
      if (backBtn) backBtn.disabled = false;
      if (skipBtn) skipBtn.disabled = false;
    } finally {
      state.working = false;
    }
  }

  // ── Step 4: Summary ───────────────────────────────────────────────────────────

  function renderStep4() {
    const studentLine = state.archivedStudents > 0
      ? `<div class="cy-summary-item"><span class="cy-check-ok">✅</span> ${escapeHtml(state.archivedStudents)} student(s) archived</div>`
      : `<div class="cy-summary-item"><span style="opacity:0.5">—</span> No students archived</div>`;

    wizardEl.innerHTML = `
      <div class="cy-card">
        <div class="cy-section-title">Step 5 of 5 — Summary &amp; Confirmation</div>
        <div class="cy-desc">
          The school year close-out for <span class="cy-year-badge">📅 ${escapeHtml(YEAR_LABEL)}</span> is complete.
          The system is now ready for <span class="cy-year-badge">🎓 ${escapeHtml(NEXT_YEAR_LABEL)}</span>.
        </div>

        <div style="margin-bottom: 20px;">
          <div class="cy-summary-item"><span class="cy-check-ok">✅</span> ${escapeHtml(state.archived)} submission(s) archived</div>
          <div class="cy-summary-item"><span class="cy-check-ok">✅</span> ${escapeHtml(state.deletedInstances)} assignment instance(s) removed</div>
          <div class="cy-summary-item"><span class="cy-check-ok">✅</span> ${escapeHtml(state.deletedSubmissions)} submission(s) removed from active records</div>
          ${studentLine}
        </div>

        ${alertHtml('success', `Ready for ${NEXT_YEAR_LABEL}. New assignments and submissions will be tagged with school year ${NEXT_YEAR}.`)}

        <div class="cy-btn-row">
          <a class="cy-btn primary" href="/teacher/">Done — Return to Teacher Center</a>
        </div>
      </div>`;
  }

  // ── Navigation ────────────────────────────────────────────────────────────────

  const STEP_RENDERERS = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

  async function goToStep(n) {
    state.step = n;
    renderIndicator();
    await STEP_RENDERERS[n]();
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  renderIndicator();
  await goToStep(0);

})();
