(async () => {
  'use strict';

  // Only run on the spreadsheet page
  if (!location.pathname.startsWith('/teacher/students/spreadsheet')) return;

  const { db } = await import('/web/data-adapter.js');
  const { getSupabase } = await import('/web/supabase-client.js');

  // ─── Constants ─────────────────────────────────────────────────────────────

  const GOAL_AREAS = [
    'Reading Comprehension', 'Written Expression', 'Basic Reading', 'Behavior',
    'Life Skills Transition', 'Life Skills Reading Skills', 'Life Skills Writing Skills',
    'Math Calculation', 'Math Problem Solving', 'Reading Fluency', 'Social Skills',
    'Language', 'Life Skills', 'Emotional Regulation', 'Reading Skills',
    'OT', 'Readiness Skills',
  ];

  const MEASUREMENT_TYPES = ['Percent', 'x/y', 'Number'];

  const CLASS_NAMES = [
    'Language Arts 1 SC', 'Language Arts 2 SC', 'Language Arts 3 SC', 'Language Arts 4 SC',
    'Life Skills Language Arts SC', 'Life Skills', 'Life Skills SC', 'Life Skills Math SC',
    'Algebra 1', 'Consumer Math', 'Geometry SC', 'Speech/Language', 'Warrior Academy', 'Related Services',
  ];

  // Column definitions: key, label, source, editable, type
  const COLUMNS = [
    { key: 'student_code',      label: 'Student Code Name',                   editable: 'new-only', type: 'text' },
    { key: 'goal_desc',         label: 'IEP Goal',                             editable: true,       type: 'textarea' },
    { key: 'goal_code',         label: 'Student Code IEP Goal Code',           editable: 'new-only', type: 'text' },
    { key: 'active',            label: 'Student: Active/Inactive',             editable: true,       type: 'select', options: ['Active', 'Inactive'], cascade: true },
    { key: 'baseline',          label: 'Baseline',                             editable: true,       type: 'text' },
    { key: 'mastery',           label: 'Mastery',                              editable: true,       type: 'text' },
    { key: 'class_context',     label: 'Class',                                editable: true,       type: 'select-custom', options: CLASS_NAMES },
    { key: 'goal_area',         label: 'Goal Area',                            editable: true,       type: 'select-custom', options: GOAL_AREAS },
    { key: 'case_manager',      label: 'Case Manager',                         editable: true,       type: 'text', cascade: true },
    { key: 'data_collector',    label: 'Teacher to Collect Data',              editable: true,       type: 'text' },
    { key: 'data_collector_email', label: 'Teacher to Collect Data Email Address', editable: true,  type: 'text' },
    { key: 'measurement_type',  label: 'Measurement Type',                     editable: true,       type: 'select-custom', options: MEASUREMENT_TYPES },
    { key: 'iep_due',           label: 'IEP Due',                              editable: true,       type: 'date', cascade: true },
    { key: 'eval_due',          label: 'Eval Due',                             editable: true,       type: 'date', cascade: true },
    { key: 'progress',          label: 'Progress %',                           editable: false,      type: 'progress' },
    { key: '_actions',          label: '',                                     editable: false,      type: 'actions' },
  ];

  const CSV_HEADERS = [
    'Student Code Name', 'IEP Goal', 'Student Code IEP Goal Code',
    'Student: Active/Inactive', 'Baseline', 'Mastery', 'Class', 'Goal Area',
    'Case Manager', 'Teacher to Collect Data', 'Teacher to Collect Data Email Address',
    'Measurement Type', 'IEP Due', 'Eval Due',
  ];

  const SAVE_DEBOUNCE_MS = 1500;
  const TODAY = new Date().toISOString().slice(0, 10);

  // ─── State ──────────────────────────────────────────────────────────────────

  let allRows = [];          // flat array: one entry per goal
  let filteredRows = [];     // after search/filter
  let progressMap = {};      // goal_code → latest progress %
  let hiddenCols = new Set();
  let sortKey = 'student_code';
  let sortDir = 'asc';
  let searchQuery = '';
  let classFilter = '';
  let goalAreaFilter = '';
  let showArchived = false;
  let draftRows = [];        // local-only draft rows not yet in DB
  let _saveTimers = {};      // reserved for per-cell debounce timer handles
  let lastSavedAt = null;
  let pendingDraftCount = 0;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
  }

  function showToast(message, color = '#22c55e') {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:20px;right:20px;background:${color};color:#fff;padding:14px 20px;
      border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);z-index:9999;font-size:14px;max-width:320px;`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, 3000);
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  function formatDate(val) {
    if (!val) return '';
    // val may be 'YYYY-MM-DD'
    const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return val;
    return `${m[2]}/${m[3]}/${m[1]}`;
  }

  function toIsoDate(val) {
    if (!val) return null;
    // Accept MM/DD/YYYY or YYYY-MM-DD
    const slash = String(val).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
    const slash2 = String(val).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (slash2) return `20${slash2[3]}-${slash2[1].padStart(2, '0')}-${slash2[2].padStart(2, '0')}`;
    const iso = String(val).match(/^\d{4}-\d{2}-\d{2}$/);
    if (iso) return val;
    return null;
  }

  function csvEscape(val) {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function setStatusSaving() {
    const el = document.getElementById('sprStatusSave');
    if (el) { el.className = 'spr-status-saving'; el.textContent = '⏳ Saving…'; }
  }

  function setStatusSaved() {
    lastSavedAt = new Date();
    const el = document.getElementById('sprStatusSave');
    const timeEl = document.getElementById('sprStatusTime');
    if (el) { el.className = 'spr-status-saved'; el.textContent = 'Auto-saved ✓'; }
    if (timeEl) { timeEl.textContent = `Last saved: ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; }
  }

  function setStatusError(msg) {
    const el = document.getElementById('sprStatusSave');
    if (el) { el.className = 'spr-status-error'; el.textContent = `⚠ Save error: ${msg}`; }
  }

  function updateCountStatus() {
    const el = document.getElementById('sprStatusCount');
    if (!el) return;
    const goalCount = filteredRows.filter(r => !r._draft).length;
    const stuCount = new Set(filteredRows.filter(r => !r._draft).map(r => r.student_code)).size;
    pendingDraftCount = draftRows.length;
    let txt = `${goalCount} goal${goalCount !== 1 ? 's' : ''} · ${stuCount} student${stuCount !== 1 ? 's' : ''}`;
    if (pendingDraftCount > 0) txt += ` · 📝 ${pendingDraftCount} draft row${pendingDraftCount !== 1 ? 's' : ''} pending`;
    el.textContent = txt;
  }

  function flashCell(td) {
    if (!td) return;
    td.classList.remove('spr-cell-saved');
    void td.offsetWidth;
    td.classList.add('spr-cell-saved');
  }

  // ─── Data Loading ────────────────────────────────────────────────────────────

  async function loadData() {
    showLoading(true);
    try {
      const [students, goals] = await Promise.all([db.listStudents(), db.listGoalsAll()]);

      // Build student map
      const stuMap = {};
      for (const s of (students || [])) stuMap[s.code] = s;

      // Try loading goal progress
      let progressData = [];
      try {
        progressData = await db.listGoalProgress({});
      } catch (_e) {
        console.warn('[tc-spreadsheet] Could not load progress data', _e);
      }

      // Build progress map: goal_code → latest % value
      progressMap = {};
      for (const p of (progressData || [])) {
        const gc = p.goals?.code || p.goal_code;
        if (!gc) continue;
        if (!progressMap[gc] || p.date > (progressMap[gc].date || '')) {
          progressMap[gc] = { value: p.value, date: p.date };
        }
      }

      // Merge: one row per goal
      allRows = (goals || []).map(g => {
        const stu = stuMap[g.student_code] || {};
        return {
          student_code:         g.student_code,
          goal_id:              g.id,
          goal_desc:            g.desc || '',
          goal_code:            g.code || '',
          active:               stu.active !== false,
          baseline:             g.baseline || '',
          mastery:              g.mastery || '',
          class_context:        g.class_context || '',
          goal_area:            g.goal_area || '',
          case_manager:         g.case_manager || stu.primary_case_manager || '',
          data_collector:       g.data_collector || '',
          data_collector_email: g.data_collector_email || '',
          measurement_type:     g.measurement_type || 'Percent',
          iep_due:              stu.iep_due || '',
          eval_due:             stu.eval_due || '',
          _goal_active:         g.status !== 'archived' && g.status !== 'Archived',
        };
      });

      applyFilters();
      renderSpreadsheet();
      updateCountStatus();
    } catch (err) {
      console.error('[tc-spreadsheet] loadData error', err);
      showError('Failed to load data: ' + (err.message || err));
    } finally {
      showLoading(false);
    }
  }

  function showLoading(on) {
    const loading = document.getElementById('sprLoading');
    const table = document.getElementById('sprTable');
    if (loading) loading.style.display = on ? 'flex' : 'none';
    if (table) table.style.display = on ? 'none' : '';
  }

  function showError(msg) {
    const wrap = document.getElementById('sprTableWrap');
    if (!wrap) return;
    wrap.innerHTML = `<div style="padding:40px;color:#f87171;font-size:14px;">⚠ ${escapeHtml(msg)}</div>`;
  }

  // ─── Filtering & Sorting ─────────────────────────────────────────────────────

  function applyFilters() {
    const q = searchQuery.toLowerCase();
    filteredRows = allRows.filter(r => {
      if (!showArchived && (!r.active || !r._goal_active)) return false;
      if (q && !r.student_code.toLowerCase().includes(q) &&
               !r.goal_desc.toLowerCase().includes(q) &&
               !r.goal_code.toLowerCase().includes(q)) return false;
      if (classFilter && r.class_context !== classFilter) return false;
      if (goalAreaFilter && r.goal_area !== goalAreaFilter) return false;
      return true;
    });

    // Sort
    filteredRows.sort((a, b) => {
      const va = (a[sortKey] || '').toString().toLowerCase();
      const vb = (b[sortKey] || '').toString().toLowerCase();
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  function visibleColumns() {
    return COLUMNS.filter(c => !hiddenCols.has(c.key));
  }

  function renderSpreadsheet() {
    renderHeaders();
    renderRows();
    updateColumnVisibilityPanel();
  }

  function renderHeaders() {
    const tr = document.getElementById('sprHeaderRow');
    if (!tr) return;
    tr.innerHTML = '';
    for (const col of visibleColumns()) {
      const th = document.createElement('th');
      th.textContent = col.label;
      th.dataset.key = col.key;
      if (col.key === sortKey) th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      if (col.key !== '_actions' && col.key !== 'progress' && col.editable !== false) {
        th.addEventListener('click', () => handleHeaderSort(col.key, th));
      }
      tr.appendChild(th);
    }
  }

  function handleHeaderSort(key, _th) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
    applyFilters();
    renderSpreadsheet();
  }

  function renderRows() {
    const tbody = document.getElementById('sprTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rows = [...filteredRows, ...draftRows];
    let bandIndex = 0;
    let lastStudentCode = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const isFirst = row.student_code !== lastStudentCode;
      if (isFirst && lastStudentCode !== null) bandIndex++;
      if (isFirst) lastStudentCode = row.student_code;

      const tr = document.createElement('tr');
      tr.dataset.rowIdx = i;
      tr.dataset.studentCode = row.student_code || '';
      tr.dataset.goalCode = row.goal_code || '';

      if (row._draft) {
        tr.classList.add('spr-row-draft');
      } else {
        tr.classList.add(bandIndex % 2 === 0 ? 'spr-row-band-a' : 'spr-row-band-b');
        if (isFirst && i > 0) tr.classList.add('spr-group-sep');
        if (!row.active) tr.classList.add('spr-row-inactive');
        if (!row._goal_active) tr.classList.add('spr-row-archived');
      }

      for (const col of visibleColumns()) {
        const td = document.createElement('td');
        td.dataset.col = col.key;
        renderCell(td, col, row, i);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }
  }

  function renderCell(td, col, row, rowIdx) {
    const val = row[col.key];

    if (col.key === '_actions') {
      td.innerHTML = buildMoreMenu(row, rowIdx);
      attachMoreMenuListeners(td, row, rowIdx);
      return;
    }

    if (col.key === 'progress') {
      const p = progressMap[row.goal_code];
      if (p) {
        const pct = typeof p.value === 'number' ? p.value : parseFloat(p.value) || 0;
        const display = Number.isFinite(pct) ? `${Math.round(pct)}%` : String(p.value || '—');
        const barWidth = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
        td.innerHTML = `<div class="spr-progress-cell">
          <span style="min-width:38px;text-align:right;font-size:12px;">${escapeHtml(display)}</span>
          <div class="spr-progress-bar-wrap"><div class="spr-progress-bar" style="width:${barWidth}%"></div></div>
        </div>`;
      } else {
        td.textContent = '—';
        td.style.color = 'rgba(255,255,255,0.3)';
      }
      return;
    }

    if (col.key === 'active') {
      const label = val ? 'Active' : 'Inactive';
      td.innerHTML = `<span style="color:${val ? '#22c55e' : '#f87171'}">${escapeHtml(label)}</span>`;
    } else if (col.key === 'iep_due' || col.key === 'eval_due') {
      td.textContent = formatDate(val);
    } else if (col.key === 'student_code') {
      let html = `<strong>${escapeHtml(val || '')}</strong>`;
      if (row._draft) html += `<span class="spr-draft-badge">draft</span>`;
      td.innerHTML = html;
    } else {
      td.textContent = val || '';
    }

    // Make editable
    const canEdit = col.editable === true || (col.editable === 'new-only' && row._draft);
    if (canEdit) {
      td.classList.add('spr-cell-editable');
      td.title = 'Click to edit';
      td.addEventListener('click', () => activateCellEditor(td, col, row, rowIdx));
    }
  }

  function activateCellEditor(td, col, row, rowIdx) {
    // Prevent double-activating
    if (td.querySelector('input,select,textarea')) return;

    const prevContent = td.innerHTML;
    const currentVal = row[col.key];

    let editor;

    if (col.type === 'select') {
      editor = document.createElement('select');
      for (const opt of (col.options || [])) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (String(currentVal) === opt || (col.key === 'active' && (currentVal ? 'Active' : 'Inactive') === opt)) {
          o.selected = true;
        }
        editor.appendChild(o);
      }
    } else if (col.type === 'select-custom') {
      editor = document.createElement('select');
      const blankOpt = document.createElement('option');
      blankOpt.value = ''; blankOpt.textContent = '— Select —';
      if (!currentVal) blankOpt.selected = true;
      editor.appendChild(blankOpt);
      for (const opt of (col.options || [])) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (currentVal === opt) o.selected = true;
        editor.appendChild(o);
      }
      // Allow custom value
      if (currentVal && !(col.options || []).includes(currentVal)) {
        const custom = document.createElement('option');
        custom.value = currentVal; custom.textContent = currentVal; custom.selected = true;
        editor.insertBefore(custom, editor.children[1]);
      }
    } else if (col.type === 'date') {
      editor = document.createElement('input');
      editor.type = 'date';
      editor.value = toIsoDate(currentVal) || '';
    } else if (col.type === 'textarea') {
      editor = document.createElement('textarea');
      editor.value = currentVal || '';
      editor.rows = 3;
    } else {
      editor = document.createElement('input');
      editor.type = 'text';
      editor.value = currentVal || '';
    }

    td.innerHTML = '';
    td.appendChild(editor);
    editor.focus();
    if (editor.select) editor.select();

    const commit = () => {
      const newVal = editor.tagName === 'SELECT' ? editor.value
                   : editor.type === 'date'      ? editor.value
                   : editor.value.trim();
      td.innerHTML = '';
      td.classList.add('spr-cell-editable');
      td.title = 'Click to edit';

      // Re-attach click listener
      td.replaceWith(td.cloneNode(false));
      const newTd = document.querySelector(`tr[data-row-idx="${rowIdx}"] td[data-col="${col.key}"]`);
      const targetTd = newTd || td;

      handleCellCommit(col, row, rowIdx, newVal, prevContent, targetTd);
    };

    const cancel = () => {
      td.innerHTML = prevContent;
      td.classList.add('spr-cell-editable');
      td.addEventListener('click', () => activateCellEditor(td, col, row, rowIdx));
    };

    if (editor.tagName === 'SELECT') {
      editor.addEventListener('change', commit);
      editor.addEventListener('blur', commit);
    } else if (editor.tagName === 'TEXTAREA') {
      editor.addEventListener('blur', commit);
      editor.addEventListener('keydown', e => {
        if (e.key === 'Escape') cancel();
      });
    } else {
      editor.addEventListener('blur', commit);
      editor.addEventListener('keydown', e => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') cancel();
        else if (e.key === 'Tab') { e.preventDefault(); commit(); }
      });
    }
  }

  function handleCellCommit(col, row, rowIdx, newVal, _prevContent, td) {
    // Convert active dropdown value
    let finalVal = newVal;
    if (col.key === 'active') finalVal = newVal === 'Active';
    if (col.key === 'iep_due' || col.key === 'eval_due') finalVal = newVal || null;

    // No change
    if (String(row[col.key] ?? '') === String(finalVal ?? '')) {
      renderSingleCell(td, col, row, rowIdx);
      return;
    }

    // Update local state
    row[col.key] = finalVal;

    // Cascade student-level fields to all rows for this student
    if (col.cascade && !row._draft) {
      for (const r of allRows) {
        if (r.student_code === row.student_code) r[col.key] = finalVal;
      }
      for (const r of filteredRows) {
        if (r.student_code === row.student_code) r[col.key] = finalVal;
      }
    }

    // Re-render cell
    renderSingleCell(td, col, row, rowIdx);
    flashCell(td);

    if (row._draft) {
      checkDraftReadyToSave(row, rowIdx);
    } else {
      scheduleAutoSave(row, rowIdx, td);
    }
  }

  function renderSingleCell(td, col, row, rowIdx) {
    td.innerHTML = '';
    td.className = '';
    td.removeAttribute('title');
    renderCell(td, col, row, rowIdx);
  }

  // ─── More-actions menu ───────────────────────────────────────────────────────

  function buildMoreMenu(row, rowIdx) {
    return `<div class="spr-more-wrap">
      <button class="spr-more-btn" aria-label="More actions" data-rowIdx="${rowIdx}">⋯</button>
      <div class="spr-more-menu" role="menu">
        <button data-action="copy-row" data-row-idx="${rowIdx}">📋 Copy Row</button>
        <button data-action="copy-goal-text" data-row-idx="${rowIdx}">📝 Copy Goal Text</button>
        <button data-action="add-goal" data-row-idx="${rowIdx}">➕ Add Goal for ${escapeHtml(row.student_code)}</button>
        <button data-action="archive-goal" data-row-idx="${rowIdx}" class="danger">🗄 Archive This Goal</button>
      </div>
    </div>`;
  }

  function attachMoreMenuListeners(td, row, rowIdx) {
    const btn = td.querySelector('.spr-more-btn');
    const menu = td.querySelector('.spr-more-menu');
    if (!btn || !menu) return;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      document.querySelectorAll('.spr-more-menu.open').forEach(m => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    });

    td.querySelectorAll('.spr-more-menu button').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        menu.classList.remove('open');
        const action = b.dataset.action;
        if (action === 'archive-goal') handleArchiveGoal(row, rowIdx);
        else if (action === 'copy-row') handleCopyRow(row);
        else if (action === 'copy-goal-text') handleCopyGoalText(row);
        else if (action === 'add-goal') handleAddGoalForStudent(row.student_code);
      });
    });
  }

  async function handleArchiveGoal(row, rowIdx) {
    if (row._draft) {
      draftRows = draftRows.filter((_, i) => i !== (rowIdx - filteredRows.length));
      applyFilters();
      renderSpreadsheet();
      updateCountStatus();
      return;
    }
    const confirmed = await rcConfirm(
      'Archive Goal',
      `Archive goal "${row.goal_code}" for ${row.student_code}? This will hide the goal from data collection and reporting.`,
      'Archive'
    );
    if (!confirmed) return;
    try {
      setStatusSaving();
      const supabase = await getSupabase();
      if (supabase) {
        await supabase.from('goals').update({ active: false, status: 'archived' }).eq('id', row.goal_id);
      }
      row._goal_active = false;
      applyFilters();
      renderSpreadsheet();
      updateCountStatus();
      setStatusSaved();
      showToast(`Goal ${row.goal_code} archived`);
    } catch (err) {
      setStatusError(err.message);
      showToast('Failed to archive goal: ' + err.message, '#ef4444');
    }
  }

  function handleCopyRow(row) {
    const vals = COLUMNS
      .filter(c => c.key !== '_actions' && c.key !== 'progress')
      .map(c => {
        if (c.key === 'active') return row.active ? 'Active' : 'Inactive';
        return row[c.key] || '';
      });
    navigator.clipboard.writeText(vals.join('\t')).then(() => showToast('Row copied to clipboard')).catch(() => {});
  }

  function handleCopyGoalText(row) {
    navigator.clipboard.writeText(row.goal_desc || '').then(() => showToast('Goal text copied')).catch(() => {});
  }

  function handleAddGoalForStudent(studentCode) {
    const draft = makeDraftRow(studentCode);
    draftRows.push(draft);
    renderRows();
    updateCountStatus();
    // Focus the goal_code cell of the new row
    const lastTr = document.querySelector('#sprTableBody tr:last-child');
    if (lastTr) {
      const goalCodeTd = lastTr.querySelector('td[data-col="goal_code"]');
      if (goalCodeTd) goalCodeTd.click();
    }
  }

  // ─── Draft rows ──────────────────────────────────────────────────────────────

  function makeDraftRow(studentCode) {
    return {
      student_code:         studentCode || '',
      goal_id:              null,
      goal_desc:            '',
      goal_code:            '',
      active:               true,
      baseline:             '',
      mastery:              '',
      class_context:        '',
      goal_area:            '',
      case_manager:         '',
      data_collector:       '',
      data_collector_email: '',
      measurement_type:     'Percent',
      iep_due:              null,
      eval_due:             null,
      _goal_active:         true,
      _draft:               true,
    };
  }

  function checkDraftReadyToSave(draftRow, _rowIdx) {
    if (draftRow.student_code && draftRow.goal_code) {
      saveDraftRow(draftRow);
    }
  }

  async function saveDraftRow(draftRow) {
    try {
      setStatusSaving();
      // Pre-populate student-level fields from existing student if code matches
      const existing = allRows.find(r => r.student_code === draftRow.student_code);
      if (existing) {
        draftRow.iep_due          = draftRow.iep_due  || existing.iep_due;
        draftRow.eval_due         = draftRow.eval_due || existing.eval_due;
        draftRow.case_manager     = draftRow.case_manager || existing.case_manager;
      }
      // Upsert student
      await db.upsertStudent({
        code:                  draftRow.student_code,
        name:                  draftRow.student_code,
        iep_due:               draftRow.iep_due,
        eval_due:              draftRow.eval_due,
        primary_case_manager:  draftRow.case_manager,
        active:                draftRow.active,
      });
      // Upsert goal
      const saved = await db.upsertGoal({
        student_code:        draftRow.student_code,
        code:                draftRow.goal_code,
        desc:                draftRow.goal_desc,
        goal_area:           draftRow.goal_area,
        baseline:            draftRow.baseline,
        mastery:             draftRow.mastery,
        measurement_type:    draftRow.measurement_type,
        data_collector:      draftRow.data_collector,
        data_collector_email: draftRow.data_collector_email,
        class_context:       draftRow.class_context,
        case_manager:        draftRow.case_manager,
      });
      // Move from draft to allRows
      draftRow._draft = false;
      draftRow.goal_id = saved?.id || null;
      draftRows = draftRows.filter(r => r !== draftRow);
      allRows.push(draftRow);
      applyFilters();
      renderSpreadsheet();
      updateCountStatus();
      setStatusSaved();
      showToast(`Saved: ${draftRow.student_code} / ${draftRow.goal_code}`);
    } catch (err) {
      console.error('[tc-spreadsheet] saveDraftRow error', err);
      setStatusError(err.message);
      showToast('Save failed: ' + err.message, '#ef4444');
    }
  }

  // ─── Auto-save for existing rows ─────────────────────────────────────────────

  const debouncedSave = debounce(async (row, td) => {
    try {
      setStatusSaving();
      // Save student-level fields
      await db.upsertStudent({
        code:                 row.student_code,
        iep_due:              row.iep_due,
        eval_due:             row.eval_due,
        primary_case_manager: row.case_manager,
        active:               row.active,
      });
      // Save goal-level fields
      await db.upsertGoal({
        student_code:        row.student_code,
        code:                row.goal_code,
        desc:                row.goal_desc,
        goal_area:           row.goal_area,
        baseline:            row.baseline,
        mastery:             row.mastery,
        measurement_type:    row.measurement_type,
        data_collector:      row.data_collector,
        data_collector_email: row.data_collector_email,
        class_context:       row.class_context,
        case_manager:        row.case_manager,
      });
      flashCell(td);
      setStatusSaved();
    } catch (err) {
      console.error('[tc-spreadsheet] auto-save error', err);
      setStatusError(err.message);
    }
  }, SAVE_DEBOUNCE_MS);

  function scheduleAutoSave(row, _rowIdx, td) {
    debouncedSave(row, td);
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  function dateTag() { return TODAY; }

  function exportCsv() {
    const lines = [CSV_HEADERS.join(',')];
    for (const r of allRows) {
      if (!showArchived && (!r.active || !r._goal_active)) continue;
      lines.push([
        r.student_code, r.goal_desc, r.goal_code,
        r.active ? 'Active' : 'Inactive',
        r.baseline, r.mastery, r.class_context, r.goal_area, r.case_manager,
        r.data_collector, r.data_collector_email, r.measurement_type,
        r.iep_due ? formatDate(r.iep_due) : '', r.eval_due ? formatDate(r.eval_due) : '',
      ].map(csvEscape).join(','));
    }
    downloadFile(lines.join('\n'), `master_spreadsheet_export_${dateTag()}.csv`, 'text/csv;charset=utf-8;');
    showToast('CSV exported');
  }

  function exportJson() {
    const byStudent = {};
    for (const r of allRows) {
      if (!showArchived && (!r.active || !r._goal_active)) continue;
      if (!byStudent[r.student_code]) {
        byStudent[r.student_code] = {
          code: r.student_code,
          active: r.active,
          case_manager: r.case_manager,
          iep_due: r.iep_due,
          eval_due: r.eval_due,
          goals: [],
        };
      }
      byStudent[r.student_code].goals.push({
        code: r.goal_code, desc: r.goal_desc, goal_area: r.goal_area,
        baseline: r.baseline, mastery: r.mastery, class_context: r.class_context,
        measurement_type: r.measurement_type, data_collector: r.data_collector,
        data_collector_email: r.data_collector_email, case_manager: r.case_manager,
      });
    }
    downloadFile(JSON.stringify(Object.values(byStudent), null, 2), `master_spreadsheet_export_${dateTag()}.json`, 'application/json');
    showToast('JSON exported');
  }

  function exportMarkdown() {
    const cols = CSV_HEADERS;
    let md = `| ${cols.join(' | ')} |\n`;
    md += `| ${cols.map(() => '---').join(' | ')} |\n`;
    for (const r of allRows) {
      if (!showArchived && (!r.active || !r._goal_active)) continue;
      const cells = [
        r.student_code, r.goal_desc, r.goal_code,
        r.active ? 'Active' : 'Inactive',
        r.baseline, r.mastery, r.class_context, r.goal_area, r.case_manager,
        r.data_collector, r.data_collector_email, r.measurement_type,
        r.iep_due ? formatDate(r.iep_due) : '', r.eval_due ? formatDate(r.eval_due) : '',
      ].map(v => String(v || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' '));
      md += `| ${cells.join(' | ')} |\n`;
    }
    downloadFile(md, `master_spreadsheet_export_${dateTag()}.md`, 'text/markdown');
    showToast('Markdown exported');
  }

  function exportPdf() {
    window.print();
  }

  // ─── Import CSV ──────────────────────────────────────────────────────────────

  let importParsedRows = [];

  function openImportModal() {
    const overlay = document.getElementById('sprImportOverlay');
    const preview = document.getElementById('sprImportPreview');
    const confirmBtn = document.getElementById('sprImportConfirmBtn');
    const fileInput = document.getElementById('sprFileInput');
    if (!overlay) return;
    if (preview) preview.style.display = 'none';
    if (confirmBtn) confirmBtn.style.display = 'none';
    if (fileInput) fileInput.value = '';
    importParsedRows = [];
    overlay.classList.add('open');
  }

  function closeImportModal() {
    const overlay = document.getElementById('sprImportOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const rows = [];
    for (const line of lines) {
      const cells = [];
      let cur = ''; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          cells.push(cur); cur = '';
        } else { cur += ch; }
      }
      cells.push(cur);
      rows.push(cells.map(c => c.trim()));
    }
    return rows;
  }

  function handleCsvFile(file) {
    const reader = new FileReader();
    reader.onload = e => processCsvText(e.target.result);
    reader.readAsText(file);
  }

  function processCsvText(text) {
    const rows = parseCsv(text);
    if (!rows.length) { showToast('No data found in CSV', '#ef4444'); return; }

    // Detect header row
    const firstRow = rows[0];
    const hasHeader = firstRow.some(c => c === 'Student Code Name' || c === 'IEP Goal');
    const dataRows = hasHeader ? rows.slice(1) : rows;

    // Map to objects
    importParsedRows = dataRows.map(r => ({
      student_code:         r[0] || '',
      goal_desc:            r[1] || '',
      goal_code:            r[2] || '',
      active:               (r[3] || 'Active').toLowerCase() !== 'inactive',
      baseline:             r[4] || '',
      mastery:              r[5] || '',
      class_context:        r[6] || '',
      goal_area:            r[7] || '',
      case_manager:         r[8] || '',
      data_collector:       r[9] || '',
      data_collector_email: r[10] || '',
      measurement_type:     r[11] || 'Percent',
      iep_due:              toIsoDate(r[12]),
      eval_due:             toIsoDate(r[13]),
    })).filter(r => r.student_code && r.goal_code);

    buildDiffPreview();
  }

  function buildDiffPreview() {
    const existingMap = {};
    for (const r of allRows) existingMap[r.goal_code] = r;

    let newCount = 0; let changedCount = 0; let unchangedCount = 0;

    const preview = document.getElementById('sprImportPreview');
    const confirmBtn = document.getElementById('sprImportConfirmBtn');
    const diffBody = document.getElementById('sprDiffBody');
    const diffHeader = document.getElementById('sprDiffHeaderRow');
    if (!diffBody || !diffHeader) return;

    // Build header
    const hCols = ['Status', 'Student', 'Goal Code', 'Goal Area', 'Baseline', 'Mastery'];
    diffHeader.innerHTML = hCols.map(h => `<th>${escapeHtml(h)}</th>`).join('');

    diffBody.innerHTML = '';
    for (const r of importParsedRows) {
      const existing = existingMap[r.goal_code];
      let rowClass = '';
      let status = '';
      if (!existing) {
        rowClass = 'spr-diff-new'; status = '🟢 New'; newCount++;
      } else {
        const changed = existing.goal_desc !== r.goal_desc || existing.baseline !== r.baseline ||
                        existing.mastery !== r.mastery || existing.goal_area !== r.goal_area;
        if (changed) { rowClass = 'spr-diff-changed'; status = '🟡 Changed'; changedCount++; }
        else { rowClass = 'spr-diff-unchanged'; status = '⚪'; unchangedCount++; }
      }
      const tr = document.createElement('tr');
      tr.className = rowClass;
      [status, r.student_code, r.goal_code, r.goal_area, r.baseline, r.mastery].forEach(v => {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
      diffBody.appendChild(tr);
    }

    const newEl = document.getElementById('sprDiffNewCount');
    const changedEl = document.getElementById('sprDiffChangedCount');
    const unchangedEl = document.getElementById('sprDiffUnchangedCount');
    if (newEl) newEl.textContent = newCount;
    if (changedEl) changedEl.textContent = changedCount;
    if (unchangedEl) unchangedEl.textContent = unchangedCount;

    if (preview) preview.style.display = '';
    if (confirmBtn) confirmBtn.style.display = (newCount + changedCount > 0) ? '' : 'none';
  }

  async function commitImport() {
    const confirmed = await rcConfirm(
      'Import CSV',
      `This will write ${importParsedRows.length} rows to the database. Continue?`,
      'Import'
    );
    if (!confirmed) return;

    closeImportModal();
    setStatusSaving();
    let saved = 0;
    let failed = 0;
    for (const r of importParsedRows) {
      try {
        await db.upsertStudent({
          code: r.student_code, name: r.student_code,
          iep_due: r.iep_due, eval_due: r.eval_due,
          primary_case_manager: r.case_manager, active: r.active,
        });
        await db.upsertGoal({
          student_code: r.student_code, code: r.goal_code,
          desc: r.goal_desc, goal_area: r.goal_area,
          baseline: r.baseline, mastery: r.mastery,
          measurement_type: r.measurement_type,
          data_collector: r.data_collector,
          data_collector_email: r.data_collector_email,
          class_context: r.class_context,
          case_manager: r.case_manager,
        });
        saved++;
      } catch (_err) { failed++; }
    }
    setStatusSaved();
    showToast(`Imported ${saved} rows${failed > 0 ? ` (${failed} failed)` : ''}`);
    await loadData();
  }

  // ─── Column visibility panel ─────────────────────────────────────────────────

  function updateColumnVisibilityPanel() {
    const panel = document.getElementById('sprColDropdown');
    if (!panel) return;
    panel.innerHTML = '';
    for (const col of COLUMNS) {
      if (col.key === '_actions') continue;
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !hiddenCols.has(col.key);
      cb.dataset.colKey = col.key;
      cb.addEventListener('change', () => {
        if (cb.checked) hiddenCols.delete(col.key);
        else hiddenCols.add(col.key);
        renderSpreadsheet();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + (col.label || col.key)));
      panel.appendChild(label);
    }
  }

  function buildClassFilterOptions() {
    const sel = document.getElementById('sprClassFilter');
    if (!sel) return;
    const classes = new Set(allRows.map(r => r.class_context).filter(Boolean));
    sel.innerHTML = '<option value="">All Classes</option>';
    for (const c of [...CLASS_NAMES, ...classes].filter((v, i, a) => a.indexOf(v) === i)) {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    }
  }

  function buildGoalAreaFilterOptions() {
    const sel = document.getElementById('sprGoalAreaFilter');
    if (!sel) return;
    const areas = new Set(allRows.map(r => r.goal_area).filter(Boolean));
    sel.innerHTML = '<option value="">All Goal Areas</option>';
    for (const a of [...GOAL_AREAS, ...areas].filter((v, i, arr) => arr.indexOf(v) === i)) {
      const o = document.createElement('option');
      o.value = a; o.textContent = a;
      sel.appendChild(o);
    }
  }

  // ─── Event wiring ─────────────────────────────────────────────────────────────

  function setupEventHandlers() {
    // Search
    const searchEl = document.getElementById('sprSearch');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        searchQuery = searchEl.value;
        applyFilters();
        renderRows();
        updateCountStatus();
      });
    }

    // Class filter
    const classEl = document.getElementById('sprClassFilter');
    if (classEl) {
      classEl.addEventListener('change', () => {
        classFilter = classEl.value;
        applyFilters();
        renderRows();
        updateCountStatus();
      });
    }

    // Goal area filter
    const goalAreaEl = document.getElementById('sprGoalAreaFilter');
    if (goalAreaEl) {
      goalAreaEl.addEventListener('change', () => {
        goalAreaFilter = goalAreaEl.value;
        applyFilters();
        renderRows();
        updateCountStatus();
      });
    }

    // Show archived
    const archivedEl = document.getElementById('sprShowArchived');
    if (archivedEl) {
      archivedEl.addEventListener('change', () => {
        showArchived = archivedEl.checked;
        applyFilters();
        renderRows();
        updateCountStatus();
      });
    }

    // Add row
    const addRowBtn = document.getElementById('sprAddRowBtn');
    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => {
        const draft = makeDraftRow('');
        draftRows.push(draft);
        renderRows();
        updateCountStatus();
        const lastTr = document.querySelector('#sprTableBody tr:last-child');
        if (lastTr) {
          const codeCell = lastTr.querySelector('td[data-col="student_code"]');
          if (codeCell) codeCell.click();
        }
      });
    }

    // Column toggle dropdown
    const colToggleBtn = document.getElementById('sprColToggleBtn');
    const colDropdown = document.getElementById('sprColDropdown');
    if (colToggleBtn && colDropdown) {
      colToggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        colDropdown.classList.toggle('open');
      });
    }

    // Export dropdown
    const exportBtn = document.getElementById('sprExportBtn');
    const exportDropdown = document.getElementById('sprExportDropdown');
    if (exportBtn && exportDropdown) {
      exportBtn.addEventListener('click', e => {
        e.stopPropagation();
        exportDropdown.classList.toggle('open');
      });
    }
    const exportCsvBtn = document.getElementById('sprExportCsv');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCsv);
    const exportJsonBtn = document.getElementById('sprExportJson');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportJson);
    const exportMdBtn = document.getElementById('sprExportMd');
    if (exportMdBtn) exportMdBtn.addEventListener('click', exportMarkdown);
    const exportPdfBtn = document.getElementById('sprExportPdf');
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportPdf);

    // Import
    const importBtn = document.getElementById('sprImportBtn');
    if (importBtn) importBtn.addEventListener('click', openImportModal);

    const importCancelBtn = document.getElementById('sprImportCancelBtn');
    if (importCancelBtn) importCancelBtn.addEventListener('click', closeImportModal);

    const importConfirmBtn = document.getElementById('sprImportConfirmBtn');
    if (importConfirmBtn) importConfirmBtn.addEventListener('click', commitImport);

    const dropZone = document.getElementById('sprDropZone');
    const fileInput = document.getElementById('sprFileInput');

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
      dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
      dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files[0];
        if (file) handleCsvFile(file);
      });
      fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleCsvFile(fileInput.files[0]);
      });
    }

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.spr-col-dropdown.open,.spr-export-dropdown.open,.spr-more-menu.open')
        .forEach(el => el.classList.remove('open'));
    });

    // Close import modal on backdrop click
    const importOverlay = document.getElementById('sprImportOverlay');
    if (importOverlay) {
      importOverlay.addEventListener('click', e => {
        if (e.target === importOverlay) closeImportModal();
      });
    }

    // Beforeunload warning for pending drafts
    window.addEventListener('beforeunload', e => {
      if (draftRows.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    setupEventHandlers();
    loadData().then(() => {
      buildClassFilterOptions();
      buildGoalAreaFilterOptions();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
