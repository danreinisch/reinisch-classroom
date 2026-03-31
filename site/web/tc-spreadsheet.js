/**
 * tc-spreadsheet.js — Master Spreadsheet for Teacher Center
 *
 * Route: /teacher/students/spreadsheet/
 * One row per IEP goal; mirrors the Google Sheets CSV structure.
 *
 * Depends on: data-adapter.js, supabase-client.js (loaded by the page)
 */
(async () => {
  'use strict';

  if (!location.pathname.startsWith('/teacher/students/spreadsheet')) return;

  // ── Imports ──────────────────────────────────────────────────────────────
  const { db } = await import('/web/data-adapter.js');

  // ── Constants ─────────────────────────────────────────────────────────────
  const DEBOUNCE_MS = 1500;

  const GOAL_AREAS = [
    'Reading Comprehension', 'Written Expression', 'Basic Reading',
    'Math Calculation', 'Math Reasoning', 'Behavior', 'Social Skills',
    'Executive Function', 'Speech/Language', 'Other',
  ];

  const MEASUREMENT_TYPES = ['Percent', 'x/y', 'Number'];

  const FULL_CLASS_NAMES = [
    'Language Arts 1 SC', 'Language Arts 2 SC', 'Language Arts 3 SC',
    'Language Arts 4 SC', 'Language Arts 5 SC', 'Language Arts 6 SC',
    'Language Arts 7 SC', 'Language Arts 8 SC',
    'Math 1 SC', 'Math 2 SC', 'Math 3 SC', 'Math 4 SC', 'Math 5 SC',
    'Math 6 SC', 'Math 7 SC', 'Math 8 SC',
    'Science 4 SC', 'Science 5 SC', 'Science 6 SC', 'Science 7 SC', 'Science 8 SC',
    'Social Studies 4 SC', 'Social Studies 5 SC', 'Social Studies 6 SC',
    'Social Studies 7 SC', 'Social Studies 8 SC',
  ];

  // Column definitions (order matches the spec)
  const COLUMNS = [
    { key: 'actions',          label: '',                  locked: true,  ro: true,   width: 40  },
    { key: 'student_code',     label: 'Student Code Name', locked: false, ro: false,  width: 110, frozen: true },
    { key: 'goal_text',        label: 'IEP Goal',          locked: false, ro: false,  width: 280, wide: true },
    { key: 'goal_code',        label: 'Goal Code',         locked: false, ro: false,  width: 120 },
    { key: 'active',           label: 'Active/Inactive',   locked: false, ro: false,  width: 110, type: 'select', options: ['Active', 'Inactive'] },
    { key: 'baseline',         label: 'Baseline',          locked: false, ro: false,  width: 90  },
    { key: 'mastery',          label: 'Mastery',           locked: false, ro: false,  width: 90  },
    { key: 'class_name',       label: 'Class',             locked: false, ro: false,  width: 170, type: 'select', options: FULL_CLASS_NAMES },
    { key: 'goal_area',        label: 'Goal Area',         locked: false, ro: false,  width: 160, type: 'select-custom', options: GOAL_AREAS },
    { key: 'case_manager',     label: 'Case Manager',      locked: false, ro: false,  width: 140 },
    { key: 'data_collector',   label: 'Teacher to Collect Data', locked: false, ro: false, width: 170 },
    { key: 'data_collector_email', label: 'Data Collector Email', locked: false, ro: false, width: 200 },
    { key: 'measurement_type', label: 'Measurement Type',  locked: false, ro: false,  width: 140, type: 'select', options: MEASUREMENT_TYPES },
    { key: 'iep_due',          label: 'IEP Due',           locked: false, ro: false,  width: 110, type: 'date' },
    { key: 'eval_due',         label: 'Eval Due',          locked: false, ro: false,  width: 110, type: 'date' },
    { key: 'progress',         label: 'Progress %',        locked: true,  ro: true,   width: 90  },
  ];

  // Which columns are visible (by key) — user can toggle
  const hiddenCols = new Set();

  // ── State ─────────────────────────────────────────────────────────────────
  let allRows   = [];   // master flat list of goal-rows
  let rows      = [];   // filtered/sorted view
  let students  = [];   // raw student records
  let progressMap = {}; // goal_code → latest progress value
  let saveTimers  = {}; // rowId → setTimeout handle
  let saveStatus  = 'idle'; // 'idle' | 'saving' | 'saved'
  let lastSaved   = null;
  let classes     = [];

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const $search     = document.getElementById('ssSearch');
  const $classFilter = document.getElementById('ssClassFilter');
  const $goalFilter  = document.getElementById('ssGoalAreaFilter');
  const $sortSelect  = document.getElementById('ssSortSelect');
  const $showArchived = document.getElementById('ssShowArchived');
  const $colToggleBtn = document.getElementById('ssColToggleBtn');
  const $colPanel    = document.getElementById('ssColPanel');
  const $exportBtn   = document.getElementById('ssExportBtn');
  const $exportPanel = document.getElementById('ssExportPanel');
  const $importBtn   = document.getElementById('ssImportBtn');
  const $importModal = document.getElementById('ssImportModal');
  const $importDropzone = document.getElementById('ssImportDropzone');
  const $importFile  = document.getElementById('ssImportFile');
  const $importPreview = document.getElementById('ssImportPreview');
  const $diffTable   = document.getElementById('ssDiffTable');
  const $importSummary = document.getElementById('ssImportSummary');
  const $importConfirmBtn = document.getElementById('ssImportConfirmBtn');
  const $importCancelBtn  = document.getElementById('ssImportCancelBtn');
  const $tableWrap   = document.getElementById('ssTableWrap');
  const $table       = document.getElementById('ssTable');
  const $thead       = document.getElementById('ssTableHead');
  const $tbody       = document.getElementById('ssTableBody');
  const $loading     = document.getElementById('ssLoading');
  const $empty       = document.getElementById('ssEmpty');
  const $countBadge  = document.getElementById('ssCountBadge');
  const $saveIndicator = document.getElementById('ssSaveIndicator');
  const $lastSavedEl = document.getElementById('ssLastSaved');
  const $draftWarning = document.getElementById('ssDraftWarning');

  // ── Helpers ───────────────────────────────────────────────────────────────
  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function uniqueId() {
    return 'draft_' + Math.random().toString(36).slice(2);
  }

  /** Parse a CSV line respecting quoted fields */
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  }

  /** Convert a value to quoted CSV field */
  function csvField(v) {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function formatDate(d) {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function showToast(msg, color = '#22c55e') {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:20px;right:20px;background:${color};color:#fff;padding:14px 22px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.4);z-index:10000;font-size:13px;max-width:320px;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
  }

  function setSaveStatus(status) {
    saveStatus = status;
    if (status === 'saving') {
      $saveIndicator.className = 'ss-save-indicator saving';
      $saveIndicator.innerHTML = '<span class="ss-spinner"></span> Saving…';
    } else if (status === 'saved') {
      lastSaved = new Date();
      $saveIndicator.className = 'ss-save-indicator saved';
      $saveIndicator.innerHTML = '✓ Auto-saved';
      $lastSavedEl.textContent = 'Last saved: ' + lastSaved.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else {
      $saveIndicator.className = 'ss-save-indicator';
      $saveIndicator.innerHTML = '';
    }
  }

  function hasDraftRows() {
    return allRows.some(r => r._draft);
  }

  function updateDraftWarning() {
    $draftWarning.style.display = hasDraftRows() ? '' : 'none';
  }

  // ── Data Loading ──────────────────────────────────────────────────────────
  async function loadData() {
    $loading.style.display = '';
    $table.classList.add('ss-hidden');
    $empty.classList.add('ss-hidden');

    try {
      // 1. Load students
      students = (await db.listStudents()) || [];

      // 2. Load all goals
      const goals = (await db.listGoalsAll()) || [];

      // 3. Load progress (best-effort)
      let progressEntries = [];
      try {
        progressEntries = (await db.listGoalProgress({})) || [];
      } catch { /* optional */ }

      // Build progressMap: goal_code → latest value string
      progressMap = {};
      for (const p of progressEntries) {
        const gc = p.goal_code || (p.goal && p.goal.code);
        if (!gc) continue;
        const existing = progressMap[gc];
        if (!existing || new Date(p.date) > new Date(existing.date)) {
          progressMap[gc] = p;
        }
      }

      // 4. Build class list for filters
      const classSet = new Set(FULL_CLASS_NAMES);
      for (const g of goals) {
        const c = g.class_context || g.class_name || g.class;
        if (c) classSet.add(c);
      }
      classes = [...classSet].sort();

      // 5. Build student map for quick lookup
      const studentMap = {};
      for (const s of students) { studentMap[s.code] = s; }

      // 6. Merge into flat rows (one per goal)
      allRows = goals.map(g => {
        const stu = studentMap[g.student_code] || {};
        const prog = progressMap[g.code];
        const progressVal = prog ? (prog.value !== undefined ? prog.value : prog.percent) : null;
        return {
          _id: g.id || g.code,
          _draft: false,
          _archived: (g.active === false) || (stu.active === false),
          student_code: g.student_code || '',
          goal_text: g.desc || g.goal_text || '',
          goal_code: g.code || '',
          active: stu.active === false ? 'Inactive' : 'Active',
          baseline: g.baseline || '',
          mastery: g.mastery || '',
          class_name: g.class_context || g.class_name || g.class || '',
          goal_area: g.goal_area || '',
          case_manager: g.case_manager || stu.primary_case_manager || '',
          data_collector: g.data_collector || '',
          data_collector_email: g.data_collector_email || '',
          measurement_type: g.measurement_type || '',
          iep_due: stu.iep_due || '',
          eval_due: stu.eval_due || '',
          progress: progressVal != null ? String(progressVal) + (String(progressVal).includes('%') ? '' : '%') : '',
          _goal_id: g.id,
          _student_id: stu.id,
        };
      });

      // Sort default: by student code
      allRows.sort((a, b) => a.student_code.localeCompare(b.student_code) || a.goal_code.localeCompare(b.goal_code));

      buildFilterOptions();
      applyFilters();
      renderTable();
      updateCountBadge();

    } catch (err) {
      console.error('[tc-spreadsheet] loadData error', err);
      $loading.innerHTML = '<span style="color:#f87171;">Failed to load data. Please refresh.</span>';
      return;
    }

    $loading.style.display = 'none';
  }

  // ── Filters & Sort ────────────────────────────────────────────────────────
  function buildFilterOptions() {
    // Classes
    $classFilter.innerHTML = '<option value="">All Classes</option>';
    const classesInUse = [...new Set(allRows.map(r => r.class_name).filter(Boolean))].sort();
    for (const c of classesInUse) {
      $classFilter.innerHTML += `<option value="${escHtml(c)}">${escHtml(c)}</option>`;
    }

    // Goal areas
    $goalFilter.innerHTML = '<option value="">All Goal Areas</option>';
    const areasInUse = [...new Set(allRows.map(r => r.goal_area).filter(Boolean))].sort();
    for (const a of areasInUse) {
      $goalFilter.innerHTML += `<option value="${escHtml(a)}">${escHtml(a)}</option>`;
    }

    // Column panel
    buildColPanel();
  }

  function applyFilters() {
    const q = $search.value.trim().toLowerCase();
    const cls = $classFilter.value;
    const area = $goalFilter.value;
    const showArch = $showArchived.checked;
    const sort = $sortSelect.value;

    rows = allRows.filter(r => {
      if (!showArch && r._archived) return false;
      if (cls && r.class_name !== cls) return false;
      if (area && r.goal_area !== area) return false;
      if (q) {
        const hay = (r.student_code + ' ' + r.goal_code + ' ' + r.goal_text).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sort === 'code') {
      rows.sort((a, b) => a.student_code.localeCompare(b.student_code) || a.goal_code.localeCompare(b.goal_code));
    } else if (sort === 'class') {
      rows.sort((a, b) => a.class_name.localeCompare(b.class_name) || a.student_code.localeCompare(b.student_code));
    } else if (sort === 'goal_area') {
      rows.sort((a, b) => a.goal_area.localeCompare(b.goal_area) || a.student_code.localeCompare(b.student_code));
    }
  }

  function updateCountBadge() {
    const studentCount = new Set(rows.map(r => r.student_code)).size;
    $countBadge.textContent = `${rows.length} goals · ${studentCount} students`;
  }

  // ── Column panel ──────────────────────────────────────────────────────────
  function buildColPanel() {
    $colPanel.innerHTML = '';
    for (const col of COLUMNS) {
      if (!col.label) continue;
      const checked = !hiddenCols.has(col.key);
      const lbl = document.createElement('label');
      lbl.innerHTML = `<input type="checkbox" data-col="${escHtml(col.key)}" ${checked ? 'checked' : ''} /> ${escHtml(col.label)}`;
      $colPanel.appendChild(lbl);
    }
  }

  // ── Render Table ──────────────────────────────────────────────────────────
  function renderTable() {
    if (rows.length === 0 && allRows.filter(r => !r._draft).length > 0) {
      $table.classList.add('ss-hidden');
      $empty.classList.remove('ss-hidden');
      $empty.textContent = 'No goals match the current filters.';
      return;
    }
    if (rows.length === 0) {
      $table.classList.add('ss-hidden');
      $empty.classList.remove('ss-hidden');
      $empty.textContent = 'No goals found. Click "+ Add Row" to get started.';
      return;
    }

    $table.classList.remove('ss-hidden');
    $empty.classList.add('ss-hidden');

    renderHead();
    renderBody();
    updateCountBadge();
    updateDraftWarning();
  }

  function visibleCols() {
    return COLUMNS.filter(c => !hiddenCols.has(c.key));
  }

  function renderHead() {
    const cols = visibleCols();
    $thead.innerHTML = `<tr>${cols.map(c =>
      `<th style="min-width:${c.width || 100}px;">${escHtml(c.label)}</th>`
    ).join('')}</tr>`;
  }

  function renderBody() {
    const cols = visibleCols();
    const frag = document.createDocumentFragment();

    let band = 0;
    let prevCode = null;
    let isFirst = true;

    for (const row of rows) {
      if (row.student_code !== prevCode) {
        band = band === 0 ? 1 : 0;
        if (!isFirst) {
          const sepTr = document.createElement('tr');
          sepTr.className = 'ss-group-sep';
          sepTr.innerHTML = `<td colspan="${cols.length}" style="padding:0;height:1px;"></td>`;
          frag.appendChild(sepTr);
        }
        prevCode = row.student_code;
        isFirst = false;
      }

      const tr = document.createElement('tr');
      tr.dataset.id = row._id;
      tr.dataset.band = band;
      if (row._archived) tr.classList.add('ss-archived');
      if (row._draft) tr.classList.add('ss-draft');

      for (const col of cols) {
        const td = document.createElement('td');
        td.appendChild(buildCell(row, col));
        tr.appendChild(td);
      }

      frag.appendChild(tr);
    }

    $tbody.innerHTML = '';
    $tbody.appendChild(frag);
  }

  function buildCell(row, col) {
    const div = document.createElement('div');
    div.className = 'ss-cell';
    div.dataset.rowId = row._id;
    div.dataset.col = col.key;

    if (col.key === 'actions') {
      div.style.cssText = 'min-width:36px;justify-content:center;padding:4px;';
      div.innerHTML = buildActionsBtn(row);
      return div;
    }

    if (col.ro) {
      div.classList.add('ss-cell-ro');
      if (col.key === 'progress') {
        div.innerHTML = buildProgressBadge(row.progress);
      } else {
        div.innerHTML = `<span class="ss-cell-val">${escHtml(row[col.key])}</span>`;
      }
      return div;
    }

    if (col.wide) div.classList.add('ss-cell-wide');

    // Locked after creation (student_code & goal_code on existing rows)
    const isLocked = (col.key === 'student_code' || col.key === 'goal_code') && !row._draft;
    if (isLocked) {
      div.classList.add('ss-cell-locked');
      div.innerHTML = `<span class="ss-cell-val">${escHtml(row[col.key])}</span><span class="ss-lock-icon">🔒</span>`;
      // Still allow click to show toast explanation
      div.addEventListener('click', () => showToast('This field is locked after initial creation.', '#6b7280'));
      return div;
    }

    // Show draft badge on student_code column
    if (col.key === 'student_code' && row._draft) {
      div.innerHTML = `<span class="ss-cell-val">${escHtml(row[col.key])}</span><span class="ss-draft-badge">📝 draft</span>`;
    } else {
      div.innerHTML = `<span class="ss-cell-val">${escHtml(row[col.key])}</span>`;
    }

    div.addEventListener('click', (e) => activateCell(e, div, row, col));
    div.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') activateCell(e, div, row, col); });
    div.tabIndex = 0;
    return div;
  }

  function buildProgressBadge(val) {
    if (!val) return '<span style="color:rgba(240,255,250,.3);font-size:12px;">—</span>';
    const num = parseFloat(val);
    let cls = 'ss-progress-badge';
    if (!isNaN(num)) {
      if (num < 50) cls += ' low';
      else if (num < 75) cls += ' mid';
    }
    return `<span class="${cls}">${escHtml(val)}</span>`;
  }

  function buildActionsBtn(row) {
    const id = row._id;
    return `<div class="ss-row-actions">
      <button class="ss-row-menu-btn" data-row-id="${escHtml(String(id))}" title="Row actions" aria-label="Row actions">⋯</button>
      <div class="ss-row-menu" id="rowMenu_${escHtml(String(id))}">
        <button data-action="add-goal" data-row-id="${escHtml(String(id))}">➕ Add Goal for ${escHtml(row.student_code)}</button>
        <button data-action="copy-row" data-row-id="${escHtml(String(id))}">📋 Copy Row</button>
        <button data-action="copy-goal-text" data-row-id="${escHtml(String(id))}">📄 Copy Goal Text</button>
        <button data-action="view-progress" data-row-id="${escHtml(String(id))}">📊 View Progress Data</button>
        <button data-action="archive-goal" data-row-id="${escHtml(String(id))}" class="danger">🗄 Archive This Goal</button>
      </div>
    </div>`;
  }

  // ── Cell Editing ──────────────────────────────────────────────────────────
  function activateCell(e, div, row, col) {
    e.stopPropagation();
    // Close any other active cell
    document.querySelectorAll('.ss-cell.editing').forEach(el => {
      if (el !== div) commitCell(el);
    });

    div.classList.add('editing');
    const val = row[col.key] || '';

    let input;
    if (col.type === 'select' || col.type === 'select-custom') {
      input = document.createElement('select');
      const opts = col.options || [];
      input.innerHTML = `<option value=""></option>` +
        opts.map(o => `<option value="${escHtml(o)}" ${o === val ? 'selected' : ''}>${escHtml(o)}</option>`).join('');
      if (col.type === 'select-custom') {
        // Add a "Custom…" option + custom text input support
        input.innerHTML += `<option value="__custom__">Custom…</option>`;
        if (val && !opts.includes(val)) {
          input.innerHTML += `<option value="${escHtml(val)}" selected>${escHtml(val)}</option>`;
          input.value = val;
        }
        input.addEventListener('change', () => {
          if (input.value === '__custom__') {
            const custom = prompt('Enter custom goal area:');
            if (custom) {
              const opt = document.createElement('option');
              opt.value = custom;
              opt.text = custom;
              opt.selected = true;
              input.insertBefore(opt, input.lastElementChild);
              input.value = custom;
            } else {
              input.value = val;
            }
          }
        });
      }
    } else if (col.type === 'date') {
      input = document.createElement('input');
      input.type = 'date';
      input.value = val;
    } else if (col.wide) {
      input = document.createElement('textarea');
      input.value = val;
      input.rows = 3;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.value = val;
    }

    div.innerHTML = '';
    div.appendChild(input);
    input.focus();
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') input.select();

    const finish = () => commitCell(div);
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (ke) => {
      if (ke.key === 'Enter' && !ke.shiftKey) { ke.preventDefault(); finish(); moveFocus(div, 'next'); }
      if (ke.key === 'Tab') { ke.preventDefault(); finish(); moveFocus(div, ke.shiftKey ? 'prev' : 'next'); }
      if (ke.key === 'Escape') { div.classList.remove('editing'); renderRowById(row._id); }
    });
  }

  function commitCell(div) {
    if (!div.classList.contains('editing')) return;
    div.classList.remove('editing');

    const rowId = div.dataset.rowId;
    const colKey = div.dataset.col;
    const input = div.querySelector('input,select,textarea');
    if (!input) return;

    const newVal = input.value;
    const row = allRows.find(r => String(r._id) === String(rowId));
    if (!row) return;

    const col = COLUMNS.find(c => c.key === colKey);
    const oldVal = row[colKey] || '';
    if (newVal === oldVal) {
      // No change — just re-render cell
      renderCellContent(div, row, col);
      return;
    }

    // Handle student-level cascade fields
    const studentLevelFields = ['case_manager', 'iep_due', 'eval_due', 'active'];
    if (studentLevelFields.includes(colKey)) {
      // Update ALL rows for this student
      const code = row.student_code;
      for (const r of allRows) {
        if (r.student_code === code) {
          r[colKey] = newVal;
          if (colKey === 'active') {
            r._archived = newVal === 'Inactive';
          }
        }
      }
    } else {
      row[colKey] = newVal;
    }

    renderCellContent(div, row, col);

    // Add saved pulse
    div.classList.add('saved');
    setTimeout(() => div.classList.remove('saved'), 800);

    // Trigger auto-save
    scheduleSave(row);
  }

  function renderCellContent(div, row, col) {
    if (col.key === 'student_code' && row._draft) {
      div.innerHTML = `<span class="ss-cell-val">${escHtml(row[col.key])}</span><span class="ss-draft-badge">📝 draft</span>`;
    } else if (col.key === 'progress') {
      div.innerHTML = buildProgressBadge(row.progress);
    } else {
      div.innerHTML = `<span class="ss-cell-val">${escHtml(row[col.key])}</span>`;
    }
  }

  function moveFocus(currentDiv, dir) {
    const cells = [...document.querySelectorAll('.ss-cell[tabindex="0"]')];
    const idx = cells.indexOf(currentDiv);
    const next = cells[dir === 'next' ? idx + 1 : idx - 1];
    if (next) next.click();
  }

  function renderRowById(rowId) {
    const row = allRows.find(r => String(r._id) === String(rowId));
    if (!row) return;
    const tr = $tbody.querySelector(`tr[data-id="${CSS.escape(String(rowId))}"]`);
    if (!tr) return;
    const cols = visibleCols();
    const tds = tr.querySelectorAll('td');
    cols.forEach((col, i) => {
      if (!tds[i]) return;
      tds[i].innerHTML = '';
      tds[i].appendChild(buildCell(row, col));
    });
  }

  // ── Auto-save ─────────────────────────────────────────────────────────────
  function scheduleSave(row) {
    const id = String(row._id);
    if (saveTimers[id]) clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(() => persistRow(row), DEBOUNCE_MS);
  }

  async function persistRow(row) {
    // For draft rows, wait until both student_code and goal_code are filled
    if (row._draft) {
      if (!row.student_code || !row.goal_code) return; // still incomplete
    }

    setSaveStatus('saving');
    try {
      // Upsert student
      const studentPayload = {
        code: row.student_code,
        active: row.active !== 'Inactive',
        primary_case_manager: row.case_manager || null,
        iep_due: row.iep_due || null,
        eval_due: row.eval_due || null,
      };
      await db.upsertStudent(studentPayload);

      // Upsert goal
      const goalPayload = {
        student_code: row.student_code,
        code: row.goal_code,
        goal_text: row.goal_text,
        desc: row.goal_text,
        baseline: row.baseline || null,
        mastery: row.mastery || null,
        class_context: row.class_name || null,
        goal_area: row.goal_area || null,
        case_manager: row.case_manager || null,
        data_collector: row.data_collector || null,
        data_collector_email: row.data_collector_email || null,
        measurement_type: row.measurement_type || null,
        active: !row._archived,
        version: 1,
      };
      await db.upsertGoal(goalPayload);

      // Mark as no longer draft
      if (row._draft) {
        row._draft = false;
        // Update the row in the DOM
        const tr = $tbody.querySelector(`tr[data-id="${CSS.escape(String(row._id))}"]`);
        if (tr) tr.classList.remove('ss-draft');
        renderRowById(row._id);
      }

      setSaveStatus('saved');
      updateDraftWarning();
    } catch (err) {
      console.error('[tc-spreadsheet] persistRow error', err);
      setSaveStatus('idle');
      showToast('Save failed: ' + (err.message || 'Unknown error'), '#ef4444');
    }
  }

  // ── Row Operations ────────────────────────────────────────────────────────
  function addRow(studentCode = '') {
    const newRow = {
      _id: uniqueId(),
      _draft: true,
      _archived: false,
      student_code: studentCode,
      goal_text: '',
      goal_code: '',
      active: 'Active',
      baseline: '',
      mastery: '',
      class_name: '',
      goal_area: '',
      case_manager: '',
      data_collector: '',
      data_collector_email: '',
      measurement_type: 'Percent',
      iep_due: '',
      eval_due: '',
      progress: '',
    };

    // Pre-fill student-level fields if student already exists
    const existing = allRows.find(r => r.student_code === studentCode && !r._draft);
    if (existing) {
      newRow.case_manager = existing.case_manager;
      newRow.iep_due = existing.iep_due;
      newRow.eval_due = existing.eval_due;
      newRow.active = existing.active;
    }

    allRows.push(newRow);
    applyFilters();
    renderTable();

    // Focus the student_code cell of the new row
    setTimeout(() => {
      const tr = $tbody.querySelector(`tr[data-id="${CSS.escape(String(newRow._id))}"]`);
      if (tr) {
        const cell = tr.querySelector('.ss-cell[data-col="student_code"]');
        if (cell) cell.click();
      }
    }, 50);

    updateDraftWarning();
  }

  async function archiveGoal(rowId) {
    const row = allRows.find(r => String(r._id) === String(rowId));
    if (!row) return;
    if (!confirm(`Archive goal "${row.goal_code}" for ${row.student_code}? It will be hidden (show archived to view it).`)) return;

    try {
      setSaveStatus('saving');
      await db.upsertGoal({
        student_code: row.student_code,
        code: row.goal_code,
        active: false,
      });
      row._archived = true;
      setSaveStatus('saved');
      applyFilters();
      renderTable();
      showToast('Goal archived.');
    } catch (err) {
      setSaveStatus('idle');
      showToast('Archive failed: ' + (err.message || ''), '#ef4444');
    }
  }

  async function archiveStudent(studentCode) {
    const studentRows = allRows.filter(r => r.student_code === studentCode);
    if (!studentRows.length) return;
    if (!confirm(`Archive ALL goals and mark ${studentCode} as Inactive?`)) return;

    try {
      setSaveStatus('saving');
      await db.upsertStudent({ code: studentCode, active: false });
      for (const r of studentRows) {
        r.active = 'Inactive';
        r._archived = true;
      }
      setSaveStatus('saved');
      applyFilters();
      renderTable();
      showToast(`${studentCode} archived.`);
    } catch (err) {
      setSaveStatus('idle');
      showToast('Archive failed: ' + (err.message || ''), '#ef4444');
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportData(fmt) {
    const date = todayIso();
    const filename = `master_spreadsheet_export_${date}`;

    if (fmt === 'csv') {
      const headers = COLUMNS.filter(c => c.key !== 'actions' && c.key !== 'progress').map(c => c.label);
      headers.push('Progress %');
      const csvCols = ['student_code','goal_text','goal_code','active','baseline','mastery','class_name','goal_area','case_manager','data_collector','data_collector_email','measurement_type','iep_due','eval_due','progress'];
      const lines = [headers.map(csvField).join(',')];
      for (const r of rows) {
        lines.push(csvCols.map(k => csvField(r[k])).join(','));
      }
      downloadText(lines.join('\n'), filename + '.csv', 'text/csv');

    } else if (fmt === 'json') {
      // Group by student
      const studentMap = {};
      for (const r of rows) {
        if (!studentMap[r.student_code]) {
          studentMap[r.student_code] = {
            code: r.student_code,
            active: r.active === 'Active',
            case_manager: r.case_manager,
            iep_due: r.iep_due,
            eval_due: r.eval_due,
            goals: [],
          };
        }
        studentMap[r.student_code].goals.push({
          code: r.goal_code,
          goal_text: r.goal_text,
          goal_area: r.goal_area,
          baseline: r.baseline,
          mastery: r.mastery,
          class: r.class_name,
          measurement_type: r.measurement_type,
          data_collector: r.data_collector,
          data_collector_email: r.data_collector_email,
          progress: r.progress,
        });
      }
      const output = {
        students: Object.values(studentMap),
        exported_at: new Date().toISOString(),
        total_students: Object.keys(studentMap).length,
        total_goals: rows.length,
      };
      downloadText(JSON.stringify(output, null, 2), filename + '.json', 'application/json');

    } else if (fmt === 'md') {
      const cols = COLUMNS.filter(c => c.key !== 'actions');
      const header = '| ' + cols.map(c => c.label || 'Actions').join(' | ') + ' |';
      const sep    = '| ' + cols.map(() => '---').join(' | ') + ' |';
      const lines  = [header, sep];
      for (const r of rows) {
        lines.push('| ' + cols.map(c => (r[c.key] || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |');
      }
      downloadText(lines.join('\n'), filename + '.md', 'text/markdown');

    } else if (fmt === 'pdf') {
      printTable();
    }
  }

  function downloadText(text, filename, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = filename;
    a.click();
  }

  function printTable() {
    const win = window.open('', '_blank');
    const colKeys = ['student_code','goal_text','goal_code','active','baseline','mastery','class_name','goal_area','case_manager','measurement_type','iep_due','eval_due','progress'];
    const colLabels = ['Student','IEP Goal','Goal Code','Status','Baseline','Mastery','Class','Goal Area','Case Manager','Meas. Type','IEP Due','Eval Due','Progress'];
    const thead = `<tr>${colLabels.map(l => `<th>${l}</th>`).join('')}</tr>`;
    const tbody = rows.map(r =>
      `<tr>${colKeys.map(k => `<td>${r[k] || ''}</td>`).join('')}</tr>`
    ).join('');
    win.document.write(`<!doctype html><html><head><title>Master Spreadsheet</title><style>
      body{font-family:Arial,sans-serif;font-size:10px;}
      table{border-collapse:collapse;width:100%;}
      th,td{border:1px solid #ccc;padding:4px 6px;}
      th{background:#f0f0f0;font-weight:bold;}
      tr:nth-child(even) td{background:#f9f9f9;}
    </style></head><body>
      <h2>Master Spreadsheet — ${todayIso()}</h2>
      <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
    </body></html>`);
    win.document.close();
    win.print();
  }

  // ── CSV Import ─────────────────────────────────────────────────────────────
  let parsedImportRows = [];

  function openImportModal() {
    parsedImportRows = [];
    $importPreview.style.display = 'none';
    $importConfirmBtn.classList.add('ss-hidden');
    $importDropzone.innerHTML = `<div style="font-size:32px;margin-bottom:8px;">📂</div>
      <div>Drop CSV here or <span style="color:#4ade80;text-decoration:underline;">browse</span></div>`;
    $importFile.value = '';
    $importModal.classList.add('active');
  }

  function closeImportModal() {
    $importModal.classList.remove('active');
  }

  function handleImportFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
      showToast('Please select a .csv file.', '#ef4444');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => processImportCSV(e.target.result);
    reader.readAsText(file);
  }

  function processImportCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { showToast('CSV must have a header row and at least one data row.', '#ef4444'); return; }

    const headers = parseCSVLine(lines[0]);
    const colIdx = {};
    headers.forEach((h, i) => {
      const n = h.trim().toLowerCase();
      if (n.includes('student code name')) colIdx.student_code = i;
      else if (n.includes('iep goal')) colIdx.goal_text = i;
      else if (n.includes('goal code') || n.includes('student code iep')) colIdx.goal_code = i;
      else if (n.includes('active') || n.includes('inactive')) colIdx.active = i;
      else if (n === 'baseline') colIdx.baseline = i;
      else if (n === 'mastery') colIdx.mastery = i;
      else if (n === 'class') colIdx.class_name = i;
      else if (n.includes('goal area')) colIdx.goal_area = i;
      else if (n.includes('case manager')) colIdx.case_manager = i;
      else if (n.includes('teacher to collect') && !n.includes('email')) colIdx.data_collector = i;
      else if (n.includes('email')) colIdx.data_collector_email = i;
      else if (n.includes('measurement')) colIdx.measurement_type = i;
      else if (n.includes('iep due') || n.includes('annual review')) colIdx.iep_due = i;
      else if (n.includes('eval due') || n.includes('evaluation')) colIdx.eval_due = i;
    });

    parsedImportRows = lines.slice(1).map(line => {
      const f = parseCSVLine(line);
      const get = (key) => (colIdx[key] !== undefined ? (f[colIdx[key]] || '') : '');
      return {
        student_code: get('student_code'),
        goal_text: get('goal_text'),
        goal_code: get('goal_code'),
        active: get('active') || 'Active',
        baseline: get('baseline'),
        mastery: get('mastery'),
        class_name: get('class_name'),
        goal_area: get('goal_area'),
        case_manager: get('case_manager'),
        data_collector: get('data_collector'),
        data_collector_email: get('data_collector_email'),
        measurement_type: get('measurement_type'),
        iep_due: get('iep_due'),
        eval_due: get('eval_due'),
      };
    }).filter(r => r.student_code || r.goal_code);

    buildDiffPreview();
  }

  function buildDiffPreview() {
    const existingMap = {};
    for (const r of allRows) existingMap[r.goal_code] = r;

    let newCount = 0, changedCount = 0, sameCount = 0;
    const diffRows = [];

    for (const imp of parsedImportRows) {
      const existing = existingMap[imp.goal_code];
      let status = 'new';
      if (existing) {
        const changed = ['goal_text','baseline','mastery','class_name','goal_area','case_manager','data_collector','data_collector_email','measurement_type','active'].some(k => (imp[k] || '') !== (existing[k] || ''));
        status = changed ? 'changed' : 'same';
      }
      if (status === 'new') newCount++;
      else if (status === 'changed') changedCount++;
      else sameCount++;
      diffRows.push({ ...imp, _status: status });
    }

    const PREVIEW_COLS = ['student_code','goal_code','active','baseline','mastery','class_name','goal_area','case_manager'];
    $diffTable.innerHTML = `
      <thead><tr><th>Status</th>${PREVIEW_COLS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${diffRows.map(r => {
        const cls = r._status === 'new' ? 'ss-diff-new' : r._status === 'changed' ? 'ss-diff-chg' : 'ss-diff-same';
        const badge = r._status === 'new' ? '🟢 New' : r._status === 'changed' ? '🟡 Changed' : '⚪ Same';
        return `<tr class="${cls}"><td>${badge}</td>${PREVIEW_COLS.map(c => `<td>${escHtml(r[c])}</td>`).join('')}</tr>`;
      }).join('')}</tbody>
    `;

    $importSummary.textContent = `${newCount} new · ${changedCount} changed · ${sameCount} unchanged`;
    $importPreview.style.display = '';
    $importConfirmBtn.classList.remove('ss-hidden');
  }

  async function commitImport() {
    if (!parsedImportRows.length) return;
    setSaveStatus('saving');
    let saved = 0;
    try {
      for (const imp of parsedImportRows) {
        await db.upsertStudent({
          code: imp.student_code,
          active: imp.active !== 'Inactive',
          primary_case_manager: imp.case_manager || null,
          iep_due: imp.iep_due || null,
          eval_due: imp.eval_due || null,
        });
        await db.upsertGoal({
          student_code: imp.student_code,
          code: imp.goal_code,
          goal_text: imp.goal_text,
          desc: imp.goal_text,
          baseline: imp.baseline || null,
          mastery: imp.mastery || null,
          class_context: imp.class_name || null,
          goal_area: imp.goal_area || null,
          case_manager: imp.case_manager || null,
          data_collector: imp.data_collector || null,
          data_collector_email: imp.data_collector_email || null,
          measurement_type: imp.measurement_type || null,
          active: true,
          version: 1,
        });
        saved++;
      }
      setSaveStatus('saved');
      showToast(`Import complete: ${saved} rows saved.`);
      closeImportModal();
      await loadData();
    } catch (err) {
      setSaveStatus('idle');
      showToast('Import failed: ' + (err.message || ''), '#ef4444');
    }
  }

  // ── Event Wiring ──────────────────────────────────────────────────────────
  function wireEvents() {
    // Filters
    const rerender = debounce(() => { applyFilters(); renderTable(); }, 250);
    $search.addEventListener('input', rerender);
    $classFilter.addEventListener('change', rerender);
    $goalFilter.addEventListener('change', rerender);
    $sortSelect.addEventListener('change', rerender);
    $showArchived.addEventListener('change', rerender);

    // Add row buttons
    document.getElementById('ssAddRowBtn').addEventListener('click', () => addRow());
    document.getElementById('ssAddRowBtnBottom').addEventListener('click', () => addRow());

    // Column toggle panel
    $colToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      $colPanel.classList.toggle('open');
    });
    $colPanel.addEventListener('change', (e) => {
      const cb = e.target;
      if (!cb.matches('input[type="checkbox"]')) return;
      const colKey = cb.dataset.col;
      if (cb.checked) hiddenCols.delete(colKey);
      else hiddenCols.add(colKey);
      renderTable();
    });

    // Export panel
    $exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      $exportPanel.classList.toggle('open');
    });
    $exportPanel.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-fmt]');
      if (!btn) return;
      $exportPanel.classList.remove('open');
      exportData(btn.dataset.fmt);
    });

    // Import
    $importBtn.addEventListener('click', openImportModal);
    $importCancelBtn.addEventListener('click', closeImportModal);
    $importConfirmBtn.addEventListener('click', commitImport);
    $importDropzone.addEventListener('click', () => $importFile.click());
    $importDropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') $importFile.click(); });
    $importFile.addEventListener('change', () => {
      if ($importFile.files[0]) handleImportFile($importFile.files[0]);
    });
    $importDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      $importDropzone.style.borderColor = '#22c55e';
    });
    $importDropzone.addEventListener('dragleave', () => {
      $importDropzone.style.borderColor = '';
    });
    $importDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      $importDropzone.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file) handleImportFile(file);
    });

    // Close modal on backdrop click
    $importModal.addEventListener('click', (e) => {
      if (e.target === $importModal) closeImportModal();
    });

    // Row action menus (delegated)
    $tbody.addEventListener('click', (e) => {
      // Toggle row menu
      const menuBtn = e.target.closest('.ss-row-menu-btn');
      if (menuBtn) {
        e.stopPropagation();
        const id = menuBtn.dataset.rowId;
        const menu = document.getElementById('rowMenu_' + id);
        if (!menu) return;
        const wasOpen = menu.classList.contains('open');
        // Close all menus
        document.querySelectorAll('.ss-row-menu.open').forEach(m => m.classList.remove('open'));
        if (!wasOpen) menu.classList.add('open');
        return;
      }

      // Row action buttons
      const actionBtn = e.target.closest('button[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const rowId = actionBtn.dataset.rowId;
        const action = actionBtn.dataset.action;
        document.querySelectorAll('.ss-row-menu.open').forEach(m => m.classList.remove('open'));

        const row = allRows.find(r => String(r._id) === String(rowId));
        if (!row) return;

        if (action === 'archive-goal') {
          archiveGoal(rowId);
        } else if (action === 'add-goal') {
          addRow(row.student_code);
        } else if (action === 'copy-row') {
          const text = COLUMNS.filter(c => c.key !== 'actions').map(c => `${c.label}: ${row[c.key] || ''}`).join('\n');
          navigator.clipboard.writeText(text).then(() => showToast('Row copied to clipboard.'));
        } else if (action === 'copy-goal-text') {
          navigator.clipboard.writeText(row.goal_text || '').then(() => showToast('Goal text copied.'));
        } else if (action === 'view-progress') {
          showToast(`Progress for ${row.goal_code}: ${row.progress || 'No data yet'}`);
        }
      }
    });

    // Close menus / panels on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.ss-row-menu.open').forEach(m => m.classList.remove('open'));
      $colPanel.classList.remove('open');
      $exportPanel.classList.remove('open');
    });

    // Warn before unload if draft rows
    window.addEventListener('beforeunload', (e) => {
      if (hasDraftRows()) {
        e.preventDefault();
        e.returnValue = 'You have unsaved draft rows. Leave anyway?';
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    wireEvents();
    await loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
