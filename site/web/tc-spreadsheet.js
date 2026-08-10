(async () => {
  'use strict';

  // Only run on the spreadsheet page
  if (!location.pathname.startsWith('/teacher/students/spreadsheet')) return;

  const { db } = await import('/web/data-adapter.js');
  const { getSupabase } = await import('/web/supabase-client.js');
  const { isRosterLoaded, loadRoster: loadDistrictRoster, translateAndDownload } = await import('/web/district-translator.js');

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
    'Life Skills Language Arts SC', 'Transitional Skills', 'Life Skills', 'Life Skills SC', 'Life Skills Math SC',
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
    { key: 'addressed_in_class', label: 'In-Class',                            editable: true,       type: 'select', options: ['Yes', 'No'] },
    { key: 'individual_delivery', label: 'Individual Delivery',                editable: true,       type: 'select', options: ['Yes', 'No'] },
    { key: 'iep_due',           label: 'IEP Due',                              editable: true,       type: 'date', cascade: true },
    { key: 'eval_due',          label: 'Eval Due',                             editable: true,       type: 'date', cascade: true },
    { key: 'progress',          label: 'Progress %',                           editable: false,      type: 'progress' },
    { key: 'notes',             label: 'Notes',                                editable: true,       type: 'textarea' },
    { key: '_actions',          label: '',                                     editable: false,      type: 'actions' },
  ];

  const CSV_HEADERS = [
    'Student Code Name', 'IEP Goal', 'Student Code IEP Goal Code',
    'Student: Active/Inactive', 'Baseline', 'Mastery', 'Class', 'Goal Area',
    'Case Manager', 'Teacher to Collect Data', 'Teacher to Collect Data Email Address',
    'Measurement Type', 'In-Class', 'Individual Delivery', 'IEP Due', 'Eval Due', 'Notes',
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

  // ─── UX Enhancement State ───────────────────────────────────────────────────
  let undoStack = [];        // [{col, row, rowIdx, oldVal, newVal, cascaded}]
  let redoStack = [];        // same structure
  const UNDO_MAX = 50;
  let selectedCells = [];    // [{rowIdx, colKey}]
  let selAnchor = null;      // {rowIdx, colKey} — anchor for range selection
  let colWidths = {};        // colKey → width px, persisted in localStorage
  const COL_WIDTHS_LS = 'spr_col_widths_v1';
  const MIN_COL_WIDTH = 80;   // minimum column width in px
  const COL_AUTOFIT_PAD = 4;  // extra padding added during auto-fit

  const RC_CUSTOM_COLS_LS = 'rc-spreadsheet-custom-columns';
  const RC_CUSTOM_DATA_LS = 'rc-spreadsheet-custom-data';
  const RC_ROW_ORDER_LS   = 'rc-spreadsheet-row-order';
  const RC_CHANGELOG_LS   = 'rc-spreadsheet-changelog';
  const RC_HIDDEN_COLS_LS = 'rc-spreadsheet-hidden-cols';
  const CHANGELOG_MAX     = 300;
  const RC_COLORS_LS      = 'rc-spreadsheet-colors-enabled';
  const RC_CUSTOM_OPTS_LS = 'rc-spreadsheet-custom-options';
  const CUSTOM_OPTS_MAX   = 20;
  const AUTO_BACKUP_INTERVAL_EDITS = 25;
  const RC_AUTO_BACKUP_LS    = 'rc-spreadsheet-auto-backup';
  const RC_AUTO_BACKUP_TS_LS = 'rc-spreadsheet-auto-backup-ts';
  const RECENTLY_EDITED_MS   = 600000; // 10 minutes in milliseconds
  const RC_COL_ORDER_LS        = 'rc-spreadsheet-col-order';
  const RC_VIEWS_LS            = 'rc-spreadsheet-views';
  const RC_COLLAPSED_LS        = 'rc-spreadsheet-collapsed-students';
  const RC_CELL_COMMENTS_LS    = 'rc-spreadsheet-cell-comments';
  const RC_CELL_TIMESTAMPS_LS  = 'rc-spreadsheet-cell-timestamps';
  const RC_PRINT_DARK_LS       = 'rc-spreadsheet-print-dark';
  const RC_CF_RULES_LS         = 'rc-spreadsheet-cf-rules';

  // ─── Custom Columns & Row Order State ────────────────────────────────────────

  let customColumns = [];  // [{key, label, type, options, _custom:true}]
  let customData = {};     // {goal_code: {colKey: value}} persisted in localStorage
  let rowOrder = [];       // [goal_code, ...] custom order, persisted in localStorage
  let dragState = null;    // {sourceIdx} during drag-and-drop

  // ─── PR 3: Data Integrity State ──────────────────────────────────────────────
  let caseManagerFilter = '';
  let dataCollectorFilter = '';
  let warningsOnlyFilter = false;
  let validationWarnings = {};  // goal_code → [{colKey, message, overdue}]
  let changeLog = [];           // array of log entries, persisted in localStorage

  // ─── PR 4: Polish State ───────────────────────────────────────────────────────
  let colorsEnabled = true;     // conditional formatting toggle
  let customOptions = {};       // {colKey: [val, ...]} remembered custom values per column
  let editsSinceBackup = 0;     // counter for auto-backup trigger
  let compareParsedRows = [];   // last CSV rows loaded in Compare modal
  let printDarkMode = false;    // dark print mode toggle

  const CF_RULES_DEFAULTS = {
    baselineGreenRatio: 0.9,    // baseline/mastery ratio >= this → green
    baselineRedRatio: 0.5,      // baseline/mastery ratio < this → red
    dateRedDays: 0,             // days until due < this → red (overdue)
    dateOrangeDays: 30,         // days until due < this → orange
    dateYellowDays: 60,         // days until due < this → yellow
  };
  let cfRules = { ...CF_RULES_DEFAULTS };
  let progressHistory = {};     // goal_code → [{value, date}, ...] sorted by date

  // ─── PR 2: Views & Navigation State ──────────────────────────────────────────
  let columnOrder = [];          // [colKey, ...] user-preferred column order
  let savedViews = [];           // [{name, filters}] preset filter combinations
  let collapsedStudents = new Set(); // student codes with collapsed goal rows
  let cellComments = {};         // {"goal_code::colKey": {text, timestamp}}
  let cellTimestamps = {};       // {"goal_code::colKey": "ISO string"}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
  }

  function showToast(message, color = '#22c55e', duration = 3000) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:20px;right:20px;background:${color};color:#fff;padding:14px 20px;
      border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);z-index:9999;font-size:14px;max-width:320px;`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, duration);
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

  function formatRelativeTime(isoString) {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString();
  }

  // ─── Column Widths ───────────────────────────────────────────────────────────

  function loadColWidths() {
    try { colWidths = JSON.parse(localStorage.getItem(COL_WIDTHS_LS) || '{}'); }
    catch (_e) { colWidths = {}; /* invalid JSON, reset */ }
  }

  function saveColWidths() {
    try { localStorage.setItem(COL_WIDTHS_LS, JSON.stringify(colWidths)); }
    catch (_e) { /* ignore localStorage quota or disabled errors */ }
    debouncedSyncToDb();
  }

  // ─── Custom Column Persistence ───────────────────────────────────────────────

  function loadCustomCols() {
    try { customColumns = JSON.parse(localStorage.getItem(RC_CUSTOM_COLS_LS) || '[]'); }
    catch (_e) { customColumns = []; }
  }

  function saveCustomCols() {
    try { localStorage.setItem(RC_CUSTOM_COLS_LS, JSON.stringify(customColumns)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  function loadCustomData() {
    try { customData = JSON.parse(localStorage.getItem(RC_CUSTOM_DATA_LS) || '{}'); }
    catch (_e) { customData = {}; }
  }

  function saveCustomData() {
    try { localStorage.setItem(RC_CUSTOM_DATA_LS, JSON.stringify(customData)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  function getCustomVal(row, colKey) {
    if (row._draft) return row._customData?.[colKey] || '';
    return customData[row.goal_code]?.[colKey] || '';
  }

  function setCustomVal(row, colKey, value) {
    if (row._draft) {
      if (!row._customData) row._customData = {};
      row._customData[colKey] = value;
      return;
    }
    if (!customData[row.goal_code]) customData[row.goal_code] = {};
    customData[row.goal_code][colKey] = value;
    saveCustomData();
  }

  // ─── Row Order Persistence ───────────────────────────────────────────────────

  function loadRowOrder() {
    try { rowOrder = JSON.parse(localStorage.getItem(RC_ROW_ORDER_LS) || '[]'); }
    catch (_e) { rowOrder = []; }
  }

  function saveRowOrder() {
    try { localStorage.setItem(RC_ROW_ORDER_LS, JSON.stringify(rowOrder)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  // ─── Hidden Columns Persistence ─────────────────────────────────────────────

  function loadHiddenCols() {
    try {
      const arr = JSON.parse(localStorage.getItem(RC_HIDDEN_COLS_LS) || '[]');
      hiddenCols = new Set(arr);
    } catch (_e) { hiddenCols = new Set(); }
  }

  function saveHiddenCols() {
    try { localStorage.setItem(RC_HIDDEN_COLS_LS, JSON.stringify([...hiddenCols])); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  // ─── Change Log ──────────────────────────────────────────────────────────────

  function loadChangeLog() {
    try { changeLog = JSON.parse(localStorage.getItem(RC_CHANGELOG_LS) || '[]'); }
    catch (_e) { changeLog = []; }
  }

  function saveChangeLog() {
    try { localStorage.setItem(RC_CHANGELOG_LS, JSON.stringify(changeLog)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  function appendChangeLog(entry) {
    changeLog.unshift({ ...entry, timestamp: new Date().toISOString() });
    if (changeLog.length > CHANGELOG_MAX) changeLog.length = CHANGELOG_MAX;
    saveChangeLog();
  }

  // ─── Colors Persistence ──────────────────────────────────────────────────────

  function loadColors() {
    const stored = localStorage.getItem(RC_COLORS_LS);
    colorsEnabled = stored === null ? true : stored === 'true';
  }

  function saveColors() {
    try { localStorage.setItem(RC_COLORS_LS, String(colorsEnabled)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  // ─── Custom Options Persistence ──────────────────────────────────────────────

  function loadCustomOptions() {
    try { customOptions = JSON.parse(localStorage.getItem(RC_CUSTOM_OPTS_LS) || '{}'); }
    catch (_e) { customOptions = {}; }
  }

  function saveCustomOptions() {
    try { localStorage.setItem(RC_CUSTOM_OPTS_LS, JSON.stringify(customOptions)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  function rememberCustomOption(colKey, value) {
    if (!value || !String(value).trim()) return;
    // Guard against prototype pollution via malicious column key
    if (!colKey || typeof colKey !== 'string' || Object.prototype.hasOwnProperty.call(Object.prototype, colKey)) return;
    const v = String(value).trim();
    if (!customOptions[colKey]) customOptions[colKey] = [];
    const arr = customOptions[colKey];
    const idx = arr.indexOf(v);
    if (idx >= 0) arr.splice(idx, 1); // remove duplicate to re-add at front
    arr.unshift(v);                    // most-recently-used first
    if (arr.length > CUSTOM_OPTS_MAX) arr.length = CUSTOM_OPTS_MAX;
    saveCustomOptions();
  }

  // ─── Column Order Persistence ────────────────────────────────────────────────

  function loadColumnOrder() {
    try { columnOrder = JSON.parse(localStorage.getItem(RC_COL_ORDER_LS) || '[]'); }
    catch (_e) { columnOrder = []; }
  }

  function saveColumnOrder() {
    try { localStorage.setItem(RC_COL_ORDER_LS, JSON.stringify(columnOrder)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  // ─── Saved Views Persistence ─────────────────────────────────────────────────

  function loadViews() {
    try { savedViews = JSON.parse(localStorage.getItem(RC_VIEWS_LS) || '[]'); }
    catch (_e) { savedViews = []; }
  }

  function saveViews() {
    try { localStorage.setItem(RC_VIEWS_LS, JSON.stringify(savedViews)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  // ─── Collapsed Students Persistence ─────────────────────────────────────────

  function loadCollapsedStudents() {
    try {
      const arr = JSON.parse(localStorage.getItem(RC_COLLAPSED_LS) || '[]');
      collapsedStudents = new Set(arr);
    } catch (_e) { collapsedStudents = new Set(); }
  }

  function saveCollapsedStudents() {
    try { localStorage.setItem(RC_COLLAPSED_LS, JSON.stringify([...collapsedStudents])); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  // ─── Cell Comments Persistence ───────────────────────────────────────────────

  function loadCellComments() {
    try { cellComments = JSON.parse(localStorage.getItem(RC_CELL_COMMENTS_LS) || '{}'); }
    catch (_e) { cellComments = {}; }
  }

  function saveCellComments() {
    try { localStorage.setItem(RC_CELL_COMMENTS_LS, JSON.stringify(cellComments)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  // ─── Cell Timestamps Persistence ────────────────────────────────────────────

  function loadCellTimestamps() {
    try { cellTimestamps = JSON.parse(localStorage.getItem(RC_CELL_TIMESTAMPS_LS) || '{}'); }
    catch (_e) { cellTimestamps = {}; }
  }

  function saveCellTimestamps() {
    try { localStorage.setItem(RC_CELL_TIMESTAMPS_LS, JSON.stringify(cellTimestamps)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  function loadPrintDark() {
    try { printDarkMode = localStorage.getItem(RC_PRINT_DARK_LS) === 'true'; }
    catch (_e) { printDarkMode = false; }
  }

  function savePrintDark() {
    try { localStorage.setItem(RC_PRINT_DARK_LS, String(printDarkMode)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  function loadCfRules() {
    try {
      const stored = JSON.parse(localStorage.getItem(RC_CF_RULES_LS) || '{}');
      cfRules = Object.assign({}, CF_RULES_DEFAULTS, stored);
    } catch (_e) {
      cfRules = { ...CF_RULES_DEFAULTS };
    }
  }

  function saveCfRules() {
    try { localStorage.setItem(RC_CF_RULES_LS, JSON.stringify(cfRules)); }
    catch (_e) { /* ignore */ }
    debouncedSyncToDb();
  }

  // ─── DB Settings Sync ────────────────────────────────────────────────────────

  async function syncSettingsToDb() {
    try {
      const settings = {};
      const keys = [
        COL_WIDTHS_LS, RC_CUSTOM_COLS_LS, RC_CUSTOM_DATA_LS, RC_ROW_ORDER_LS,
        RC_CHANGELOG_LS, RC_HIDDEN_COLS_LS, RC_COLORS_LS, RC_CUSTOM_OPTS_LS,
        RC_COL_ORDER_LS, RC_VIEWS_LS, RC_COLLAPSED_LS,
        RC_CELL_COMMENTS_LS, RC_CELL_TIMESTAMPS_LS,
        RC_PRINT_DARK_LS, RC_CF_RULES_LS,
      ];
      for (const k of keys) {
        const val = localStorage.getItem(k);
        if (val !== null) settings[k] = val;
      }
      const supabase = await getSupabase();
      if (!supabase) return;
      await supabase.from('spreadsheet_settings').upsert({ user_id: 'default', settings });
      const el = document.getElementById('sprSyncStatus');
      if (el) {
        el.textContent = '☁️ Synced';
        setTimeout(() => { if (el.textContent === '☁️ Synced') el.textContent = ''; }, 3000);
      }
    } catch (_e) {
      console.warn('[tc-spreadsheet] syncSettingsToDb failed (table may not exist yet):', _e);
    }
  }

  async function loadSettingsFromDb() {
    try {
      const supabase = await getSupabase();
      if (!supabase) return;
      const { data } = await supabase
        .from('spreadsheet_settings')
        .select('settings')
        .eq('user_id', 'default')
        .single();
      if (!data?.settings) return;
      const dbSettings = data.settings;
      const keys = [
        COL_WIDTHS_LS, RC_CUSTOM_COLS_LS, RC_CUSTOM_DATA_LS, RC_ROW_ORDER_LS,
        RC_CHANGELOG_LS, RC_HIDDEN_COLS_LS, RC_COLORS_LS, RC_CUSTOM_OPTS_LS,
        RC_COL_ORDER_LS, RC_VIEWS_LS, RC_COLLAPSED_LS,
        RC_CELL_COMMENTS_LS, RC_CELL_TIMESTAMPS_LS,
        RC_PRINT_DARK_LS, RC_CF_RULES_LS,
      ];
      let anyMissing = false;
      for (const k of keys) {
        if (!localStorage.getItem(k) && dbSettings[k] !== undefined) {
          try { localStorage.setItem(k, dbSettings[k]); } catch (_e) { /* ignore */ }
          anyMissing = true;
        }
      }
      if (anyMissing) {
        console.log('[tc-spreadsheet] Hydrated settings from DB — refreshing in-memory state');
        // Re-load all settings from the now-hydrated localStorage
        loadColWidths();
        loadCustomCols();
        loadCustomData();
        loadRowOrder();
        loadHiddenCols();
        loadChangeLog();
        loadColors();
        loadCustomOptions();
        loadColumnOrder();
        loadViews();
        loadCollapsedStudents();
        loadCellComments();
        loadCellTimestamps();
        loadPrintDark();
        loadCfRules();
        // Re-render to reflect the restored settings
        if (typeof renderSpreadsheet === 'function') renderSpreadsheet();
      } else {
        // localStorage already has data — sync it back to DB to keep it fresh
        syncSettingsToDb();
      }
    } catch (_e) {
      console.warn('[tc-spreadsheet] loadSettingsFromDb failed (table may not exist yet):', _e);
    }
  }

  const debouncedSyncToDb = debounce(syncSettingsToDb, 5000);

  // ─── Inline Validation ───────────────────────────────────────────────────────

  const scheduleValidation = debounce(() => runValidation(), 350);

  function runValidation() {
    validationWarnings = {};
    const today = new Date().toISOString().slice(0, 10);
    for (const row of allRows) {
      if (!row._goal_active || !row.active) continue; // only active goals of active students
      const issues = [];
      if (!row.baseline) {
        issues.push({ colKey: 'baseline', message: 'Missing baseline for active goal' });
      }
      if (!row.mastery) {
        issues.push({ colKey: 'mastery', message: 'Missing mastery target for active goal' });
      }
      // Baseline ≥ mastery check only applies to Percent type since x/y and Number
      // values are not directly comparable as percentages
      if (row.measurement_type === 'Percent' && row.baseline && row.mastery) {
        const b = parseFloat(row.baseline);
        const m = parseFloat(row.mastery);
        if (!isNaN(b) && !isNaN(m) && b >= m) {
          issues.push({ colKey: 'baseline', message: `Baseline (${row.baseline}) ≥ mastery (${row.mastery}) — goal may already be met` });
          issues.push({ colKey: 'mastery', message: `Baseline (${row.baseline}) ≥ mastery (${row.mastery}) — goal may already be met` });
        }
      }
      if (!row.iep_due) {
        issues.push({ colKey: 'iep_due', message: 'Missing IEP Due date' });
      } else if (row.iep_due < today) {
        issues.push({ colKey: 'iep_due', message: `IEP Due date is overdue (${formatDate(row.iep_due)})`, overdue: true });
      }
      if (!row.eval_due) {
        issues.push({ colKey: 'eval_due', message: 'Missing Eval Due date' });
      } else if (row.eval_due < today) {
        issues.push({ colKey: 'eval_due', message: `Eval Due date is overdue (${formatDate(row.eval_due)})`, overdue: true });
      }
      if (!row.measurement_type) {
        issues.push({ colKey: 'measurement_type', message: 'Missing measurement type' });
      }
      if (!row.goal_area) {
        issues.push({ colKey: 'goal_area', message: 'Missing goal area' });
      }
      if (issues.length > 0) validationWarnings[row.goal_code] = issues;
    }
    applyValidationWarnings();
  }

  function applyValidationWarnings() {
    // Clear existing warning decorations
    document.querySelectorAll('.spr-cell-warn, .spr-cell-warn-overdue').forEach(td => {
      td.classList.remove('spr-cell-warn', 'spr-cell-warn-overdue');
      const icon = td.querySelector('.spr-warn-icon');
      if (icon) icon.remove();
    });

    // Count total warning cells across all rows (unique colKeys per row, not total issues)
    let totalWarnCount = 0;
    for (const issues of Object.values(validationWarnings)) {
      // Count unique colKeys per row so multiple issues on the same cell count as one
      const cols = new Set(issues.map(i => i.colKey));
      totalWarnCount += cols.size;
    }

    // Apply to DOM for currently visible rows
    const displayRows = buildDisplayRows();
    for (const [goalCode, issues] of Object.entries(validationWarnings)) {
      const rowIdx = displayRows.findIndex(r => r.goal_code === goalCode);
      if (rowIdx < 0) continue;
      // Group issues by colKey
      const byCol = {};
      for (const issue of issues) {
        if (!byCol[issue.colKey]) byCol[issue.colKey] = { messages: [], overdue: false };
        byCol[issue.colKey].messages.push(issue.message);
        if (issue.overdue) byCol[issue.colKey].overdue = true;
      }
      for (const [colKey, warn] of Object.entries(byCol)) {
        const td = document.querySelector(`tr[data-row-idx="${rowIdx}"] td[data-col="${colKey}"]`);
        if (!td) continue;
        td.classList.add(warn.overdue ? 'spr-cell-warn-overdue' : 'spr-cell-warn');
        td.title = warn.messages.join('; ');
        const icon = document.createElement('span');
        icon.className = 'spr-warn-icon';
        icon.textContent = '⚠';
        td.appendChild(icon);
      }
    }

    updateWarningBadge(totalWarnCount);
  }

  function updateWarningBadge(count) {
    const btn = document.getElementById('sprWarningsBtn');
    if (!btn) return;
    btn.textContent = count > 0 ? `⚠️ ${count} warning${count !== 1 ? 's' : ''}` : '⚠️ No warnings';
    btn.style.color = count > 0 ? '#facc15' : '';
    btn.classList.toggle('spr-btn-active', warningsOnlyFilter);
  }

  // ─── Conditional Formatting ──────────────────────────────────────────────────

  function applyConditionalFormattingToCell(td, col, row) {
    if (!colorsEnabled || row._draft || col.key === '_actions' || col.key === 'progress') {
      td.style.backgroundColor = '';
      return;
    }
    // Don't clobber an active inline editor
    if (td.querySelector('input,select,textarea')) return;

    const COLOR_GREEN  = 'rgba(34,197,94,0.13)';
    const COLOR_RED    = 'rgba(248,113,113,0.13)';
    const COLOR_YELLOW = 'rgba(250,204,21,0.13)';
    const COLOR_ORANGE = 'rgba(249,115,22,0.15)';
    const COLOR_RED_DUE = 'rgba(248,113,113,0.18)';

    if (col.key === 'active') {
      td.style.backgroundColor = row.active ? COLOR_GREEN : COLOR_RED;
      return;
    }

    if (col.key === 'baseline' && row.measurement_type === 'Percent' && row.baseline && row.mastery) {
      const b = parseFloat(row.baseline);
      const m = parseFloat(row.mastery);
      if (!isNaN(b) && !isNaN(m) && m > 0) {
        const ratio = b / m;
        if (ratio >= cfRules.baselineGreenRatio) { td.style.backgroundColor = COLOR_GREEN; return; }
        if (ratio < cfRules.baselineRedRatio)    { td.style.backgroundColor = COLOR_RED;   return; }
        td.style.backgroundColor = '';
        return;
      }
    }

    if (col.key === 'iep_due' || col.key === 'eval_due') {
      const dateVal = row[col.key];
      if (dateVal) {
        const today = new Date();
        const due = new Date(dateVal + 'T00:00:00');
        const diffDays = Math.floor((due - today) / 86400000);
        if (diffDays < cfRules.dateRedDays)    { td.style.backgroundColor = COLOR_RED_DUE; return; }
        if (diffDays < cfRules.dateOrangeDays) { td.style.backgroundColor = COLOR_ORANGE;  return; }
        if (diffDays < cfRules.dateYellowDays) { td.style.backgroundColor = COLOR_YELLOW;  return; }
      }
      td.style.backgroundColor = '';
      return;
    }

    td.style.backgroundColor = '';
  }

  function applyRowOrder() {
    if (!rowOrder.length) return;
    const orderMap = {};
    rowOrder.forEach((code, idx) => { orderMap[code] = idx; });
    allRows.sort((a, b) => {
      const ai = orderMap[a.goal_code] !== undefined ? orderMap[a.goal_code] : Infinity;
      const bi = orderMap[b.goal_code] !== undefined ? orderMap[b.goal_code] : Infinity;
      return ai - bi;
    });
  }

  function applyColWidthToDOM(colKey) {
    const px = colWidths[colKey];
    if (!px) return;
    const styleVal = px + 'px';
    document.querySelectorAll(`th[data-key="${colKey}"], td[data-col="${colKey}"]`).forEach(el => {
      el.style.minWidth = styleVal;
      el.style.maxWidth = styleVal;
      el.style.width = styleVal;
    });
  }

  function applyAllColWidths() {
    for (const colKey of Object.keys(colWidths)) applyColWidthToDOM(colKey);
  }

  // ─── Undo / Redo ─────────────────────────────────────────────────────────────

  function pushUndo(action) {
    undoStack.push(action);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack = [];
  }

  function flashUndoRedoCells(action) {
    const colDef = allColumns().find(c => c.key === action.col.key);
    if (!colDef) return;
    const allVisible = [...filteredRows, ...draftRows];
    // Include main row + all cascaded rows
    const rows = [action.row, ...(action.cascaded || []).map(c => c.row)];
    for (const r of rows) {
      const idx = allVisible.indexOf(r);
      if (idx < 0) continue;
      const td = document.querySelector(`tr[data-row-idx="${idx}"] td[data-col="${action.col.key}"]`);
      if (!td) continue;
      td.classList.remove('spr-cell-undo-flash');
      void td.offsetWidth;
      td.classList.add('spr-cell-undo-flash');
      setTimeout(() => td.classList.remove('spr-cell-undo-flash'), 700);
    }
  }

  function performUndo() {
    const action = undoStack.pop();
    if (!action) { showToast('Nothing to undo', '#6366f1'); return; }

    if (action.type === 'reorder') {
      const newOrOld = action.oldOrder;
      const orderMap = {};
      newOrOld.forEach((code, idx) => { orderMap[code] = idx; });
      allRows.sort((a, b) => {
        const ai = orderMap[a.goal_code] !== undefined ? orderMap[a.goal_code] : Infinity;
        const bi = orderMap[b.goal_code] !== undefined ? orderMap[b.goal_code] : Infinity;
        return ai - bi;
      });
      rowOrder = newOrOld.filter(Boolean);
      saveRowOrder();
      redoStack.push(action);
      runValidation();
      applyFilters();
      renderSpreadsheet();
      updateCountStatus();
      showToast('Undo: row reorder', '#6366f1');
      return;
    }

    if (action.col?._custom) {
      setCustomVal(action.row, action.col.key, action.oldVal);
    } else {
      action.row[action.col.key] = action.oldVal;
      if (action.cascaded) {
        for (const c of action.cascaded) c.row[action.col.key] = c.oldVal;
      }
    }
    appendChangeLog({
      student_code: action.row.student_code, goal_code: action.row.goal_code,
      column: action.col.label, old_value: String(action.newVal ?? ''), new_value: String(action.oldVal ?? ''), edit_type: 'undo',
    });
    redoStack.push(action);
    runValidation();
    applyFilters();
    renderSpreadsheet();
    updateCountStatus();
    flashUndoRedoCells(action);
    scheduleAutoSave(action.row, action.rowIdx, null);
  }

  function performRedo() {
    const action = redoStack.pop();
    if (!action) { showToast('Nothing to redo', '#6366f1'); return; }

    if (action.type === 'reorder') {
      const newOrder = action.newOrder;
      const orderMap = {};
      newOrder.forEach((code, idx) => { orderMap[code] = idx; });
      allRows.sort((a, b) => {
        const ai = orderMap[a.goal_code] !== undefined ? orderMap[a.goal_code] : Infinity;
        const bi = orderMap[b.goal_code] !== undefined ? orderMap[b.goal_code] : Infinity;
        return ai - bi;
      });
      rowOrder = newOrder.filter(Boolean);
      saveRowOrder();
      undoStack.push(action);
      runValidation();
      applyFilters();
      renderSpreadsheet();
      updateCountStatus();
      showToast('Redo: row reorder', '#6366f1');
      return;
    }

    if (action.col?._custom) {
      setCustomVal(action.row, action.col.key, action.newVal);
    } else {
      action.row[action.col.key] = action.newVal;
      if (action.cascaded) {
        for (const c of action.cascaded) c.row[action.col.key] = action.newVal;
      }
    }
    appendChangeLog({
      student_code: action.row.student_code, goal_code: action.row.goal_code,
      column: action.col.label, old_value: String(action.oldVal ?? ''), new_value: String(action.newVal ?? ''), edit_type: 'redo',
    });
    undoStack.push(action);
    runValidation();
    applyFilters();
    renderSpreadsheet();
    updateCountStatus();
    flashUndoRedoCells(action);
    scheduleAutoSave(action.row, action.rowIdx, null);
  }

  // ─── Multi-Cell Selection ────────────────────────────────────────────────────

  function clearSelection() {
    document.querySelectorAll('.spr-cell-selected').forEach(td => td.classList.remove('spr-cell-selected'));
    selectedCells = [];
    hideBulkToolbar();
  }

  function selectSingleCell(rowIdx, colKey) {
    clearSelection();
    selAnchor = { rowIdx, colKey };
    const td = document.querySelector(`tr[data-row-idx="${rowIdx}"] td[data-col="${colKey}"]`);
    if (td) {
      selectedCells.push({ rowIdx, colKey });
      td.classList.add('spr-cell-selected');
    }
  }

  function selectRangeTo(toRowIdx, toColKey) {
    const anchor = selAnchor;
    // Clear visual selection but preserve anchor
    document.querySelectorAll('.spr-cell-selected').forEach(td => td.classList.remove('spr-cell-selected'));
    selectedCells = [];
    if (!anchor) {
      selAnchor = { rowIdx: toRowIdx, colKey: toColKey };
      const td = document.querySelector(`tr[data-row-idx="${toRowIdx}"] td[data-col="${toColKey}"]`);
      if (td) { selectedCells.push({ rowIdx: toRowIdx, colKey: toColKey }); td.classList.add('spr-cell-selected'); }
      return;
    }
    selAnchor = anchor; // restore

    const visCols = visibleColumns();
    const fromColIdx = visCols.findIndex(c => c.key === anchor.colKey);
    const toColIdx = visCols.findIndex(c => c.key === toColKey);
    const minRow = Math.min(anchor.rowIdx, toRowIdx);
    const maxRow = Math.max(anchor.rowIdx, toRowIdx);
    const minColIdx = Math.min(fromColIdx < 0 ? 0 : fromColIdx, toColIdx < 0 ? 0 : toColIdx);
    const maxColIdx = Math.max(fromColIdx < 0 ? 0 : fromColIdx, toColIdx < 0 ? 0 : toColIdx);

    for (let r = minRow; r <= maxRow; r++) {
      for (let ci = minColIdx; ci <= maxColIdx; ci++) {
        const ck = visCols[ci]?.key;
        if (!ck) continue;
        const td = document.querySelector(`tr[data-row-idx="${r}"] td[data-col="${ck}"]`);
        if (td) {
          selectedCells.push({ rowIdx: r, colKey: ck });
          td.classList.add('spr-cell-selected');
        }
      }
    }
    updateBulkToolbar();
  }

  function extendSelectionByKey(key) {
    if (!selAnchor) return;
    const last = selectedCells[selectedCells.length - 1];
    if (!last) return;
    const visCols = visibleColumns();
    const allVisible = [...filteredRows, ...draftRows];
    let { rowIdx, colKey } = last;
    const colIdx = visCols.findIndex(c => c.key === colKey);
    if (key === 'ArrowRight' && colIdx < visCols.length - 1) { colKey = visCols[colIdx + 1].key; }
    else if (key === 'ArrowLeft' && colIdx > 0) { colKey = visCols[colIdx - 1].key; }
    else if (key === 'ArrowDown' && rowIdx < allVisible.length - 1) { rowIdx++; }
    else if (key === 'ArrowUp' && rowIdx > 0) { rowIdx--; }
    else return;
    selectRangeTo(rowIdx, colKey);
  }

  // ─── Bulk Edit Toolbar ───────────────────────────────────────────────────────

  let bulkToolbarEl = null;
  let bulkFillMode = false;

  function getBulkToolbar() {
    if (!bulkToolbarEl) {
      bulkToolbarEl = document.createElement('div');
      bulkToolbarEl.className = 'spr-bulk-toolbar';
      bulkToolbarEl.innerHTML = `
        <span class="spr-bulk-label"></span>
        <div class="spr-bulk-fill-wrap">
          <input class="spr-bulk-fill-input" placeholder="New value…" />
          <button class="spr-btn spr-btn-sm spr-bulk-fill-apply-btn">Apply</button>
          <button class="spr-btn spr-btn-sm spr-bulk-fill-cancel-btn">Cancel</button>
        </div>
        <div class="spr-bulk-actions">
          <button class="spr-btn spr-btn-sm spr-bulk-fill-btn">✏️ Fill…</button>
          <button class="spr-btn spr-btn-sm spr-bulk-clear-btn">🗑 Clear</button>
          <button class="spr-btn spr-btn-sm spr-bulk-close-btn">✕</button>
        </div>
      `;
      bulkToolbarEl.querySelector('.spr-bulk-fill-btn').addEventListener('click', () => {
        bulkFillMode = true;
        bulkToolbarEl.querySelector('.spr-bulk-fill-wrap').style.display = 'flex';
        bulkToolbarEl.querySelector('.spr-bulk-actions').style.display = 'none';
        bulkToolbarEl.querySelector('.spr-bulk-fill-input').value = '';
        bulkToolbarEl.querySelector('.spr-bulk-fill-input').focus();
      });
      bulkToolbarEl.querySelector('.spr-bulk-fill-apply-btn').addEventListener('click', () => {
        const val = bulkToolbarEl.querySelector('.spr-bulk-fill-input').value;
        applyBulkValue(val);
      });
      bulkToolbarEl.querySelector('.spr-bulk-fill-cancel-btn').addEventListener('click', () => {
        bulkFillMode = false;
        bulkToolbarEl.querySelector('.spr-bulk-fill-wrap').style.display = 'none';
        bulkToolbarEl.querySelector('.spr-bulk-actions').style.display = 'flex';
      });
      bulkToolbarEl.querySelector('.spr-bulk-clear-btn').addEventListener('click', () => applyBulkValue(''));
      bulkToolbarEl.querySelector('.spr-bulk-close-btn').addEventListener('click', () => {
        clearSelection();
        selAnchor = null;
      });
      // Enter key in fill input applies
      bulkToolbarEl.querySelector('.spr-bulk-fill-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); applyBulkValue(e.target.value); }
        else if (e.key === 'Escape') { e.preventDefault(); bulkToolbarEl.querySelector('.spr-bulk-fill-cancel-btn').click(); }
      });
      document.body.appendChild(bulkToolbarEl);
    }
    return bulkToolbarEl;
  }

  function updateBulkToolbar() {
    if (selectedCells.length < 2) { hideBulkToolbar(); return; }
    const colKeys = new Set(selectedCells.map(c => c.colKey));
    if (colKeys.size !== 1) { hideBulkToolbar(); return; }
    const colKey = [...colKeys][0];
    const col = allColumns().find(c => c.key === colKey);
    if (!col || col.editable === false) { hideBulkToolbar(); return; }
    const tb = getBulkToolbar();
    const label = tb.querySelector('.spr-bulk-label');
    if (label) label.textContent = `${selectedCells.length} cells · ${col.label}`;
    tb.style.display = 'flex';
    if (!bulkFillMode) {
      tb.querySelector('.spr-bulk-fill-wrap').style.display = 'none';
      tb.querySelector('.spr-bulk-actions').style.display = 'flex';
    }
  }

  function hideBulkToolbar() {
    if (bulkToolbarEl) {
      bulkToolbarEl.style.display = 'none';
      bulkFillMode = false;
      const wrap = bulkToolbarEl.querySelector('.spr-bulk-fill-wrap');
      const actions = bulkToolbarEl.querySelector('.spr-bulk-actions');
      if (wrap) wrap.style.display = 'none';
      if (actions) actions.style.display = 'flex';
    }
  }

  function applyBulkValue(val) {
    if (!selectedCells.length) return;
    const colKey = selectedCells[0].colKey;
    const col = allColumns().find(c => c.key === colKey);
    if (!col || col.editable === false) return;
    const allVisible = [...filteredRows, ...draftRows];
    const undoEntries = [];
    for (const { rowIdx, colKey: ck } of selectedCells) {
      if (ck !== colKey) continue;
      const row = allVisible[rowIdx];
      if (!row) continue;
      let finalVal = val;
      if (col.key === 'active') finalVal = val === 'Active';
      if (col.key === 'addressed_in_class') finalVal = val === 'Yes';
      if (col.key === 'individual_delivery') finalVal = val === 'Yes';
      if ((col.key === 'iep_due' || col.key === 'eval_due') && val) finalVal = toIsoDate(val) || val;
      const oldVal = col._custom ? getCustomVal(row, col.key) : row[col.key];
      if (String(oldVal ?? '') === String(finalVal ?? '')) continue;
      undoEntries.push({ row, rowIdx, oldVal, newVal: finalVal });
      if (col._custom) {
        setCustomVal(row, col.key, finalVal);
      } else {
        row[col.key] = finalVal;
      }
      const td = document.querySelector(`tr[data-row-idx="${rowIdx}"] td[data-col="${colKey}"]`);
      if (td) {
        renderSingleCell(td, col, row, rowIdx);
        td.classList.add('spr-cell-selected');
        flashCell(td);
      }
      if (!row._draft && !col._custom) scheduleAutoSave(row, rowIdx, null);
    }
    if (undoEntries.length > 0) {
      const [first, ...rest] = undoEntries;
      pushUndo({
        col, row: first.row, rowIdx: first.rowIdx,
        oldVal: first.oldVal, newVal: first.newVal,
        cascaded: rest.length > 0 ? rest.map(e => ({ row: e.row, oldVal: e.oldVal })) : null,
      });
      // Log each affected cell and record timestamps
      for (const entry of undoEntries) {
        if (!entry.row._draft) {
          appendChangeLog({
            student_code: entry.row.student_code, goal_code: entry.row.goal_code,
            column: col.label, old_value: String(entry.oldVal ?? ''), new_value: String(entry.newVal ?? ''), edit_type: 'bulk',
          });
          const tsKey = `${entry.row.goal_code}::${col.key}`;
          cellTimestamps[tsKey] = new Date().toISOString();
        }
      }
      if (undoEntries.some(e => !e.row._draft)) saveCellTimestamps();
      scheduleValidation();
    }
    const count = undoEntries.length;
    showToast(count > 0 ? `Updated ${count} cell${count !== 1 ? 's' : ''}` : 'No changes');
    hideBulkToolbar();
    clearSelection();
    selAnchor = null;
    autoBackupIfNeeded();
  }

  // ─── Column Resizing ─────────────────────────────────────────────────────────

  function setupColumnResize(th, colKey) {
    const handle = th.querySelector('.spr-resize-handle');
    if (!handle) return;
    let startX = 0;
    let startWidth = 0;
    let dragging = false;

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startX = e.clientX;
      startWidth = th.offsetWidth;
      handle.classList.add('resizing');

      const onMove = moveEvt => {
        if (!dragging) return;
        const newWidth = Math.max(MIN_COL_WIDTH, startWidth + (moveEvt.clientX - startX));
        th.style.minWidth = newWidth + 'px';
        th.style.maxWidth = newWidth + 'px';
        th.style.width = newWidth + 'px';
        document.querySelectorAll(`td[data-col="${colKey}"]`).forEach(td => {
          td.style.minWidth = newWidth + 'px';
          td.style.maxWidth = newWidth + 'px';
          td.style.width = newWidth + 'px';
        });
      };

      const onUp = upEvt => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const newWidth = Math.max(MIN_COL_WIDTH, startWidth + (upEvt.clientX - startX));
        colWidths[colKey] = newWidth;
        saveColWidths();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Double-click to auto-fit column width
    handle.addEventListener('dblclick', e => {
      e.stopPropagation();
      e.preventDefault();
      const tds = document.querySelectorAll(`td[data-col="${colKey}"]`);
      let maxW = 80;
      // Temporarily reset width to measure content
      const prevStyle = th.getAttribute('style') || '';
      th.style.width = '';
      th.style.minWidth = '';
      th.style.maxWidth = '';
      maxW = th.scrollWidth;
      tds.forEach(td => {
        const prev = td.getAttribute('style') || '';
        td.style.width = '';
        td.style.minWidth = '';
        td.style.maxWidth = '';
        maxW = Math.max(maxW, td.scrollWidth);
        td.setAttribute('style', prev);
      });
      th.setAttribute('style', prevStyle);
      const newWidth = Math.max(MIN_COL_WIDTH, maxW + COL_AUTOFIT_PAD);
      th.style.minWidth = newWidth + 'px';
      th.style.maxWidth = newWidth + 'px';
      th.style.width = newWidth + 'px';
      tds.forEach(td => {
        td.style.minWidth = newWidth + 'px';
        td.style.maxWidth = newWidth + 'px';
        td.style.width = newWidth + 'px';
      });
      colWidths[colKey] = newWidth;
      saveColWidths();
    });
  }

  // ─── Keyboard Navigation ─────────────────────────────────────────────────────

  function setupKeyboardNavigation() {
    const tableWrap = document.getElementById('sprTableWrap');
    if (!tableWrap) return;

    tableWrap.addEventListener('keydown', e => {
      const target = e.target;
      if (!target) return;
      // Let editors handle their own keys
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const td = target.closest('td');
      if (!td) return;
      const tr = td.closest('tr');
      if (!tr) return;
      const table = tableWrap.querySelector('table');
      if (!table) return;

      const key = e.key;

      // Escape: clear selection and unfocus
      if (key === 'Escape') {
        e.preventDefault();
        clearSelection();
        selAnchor = null;
        td.blur();
        return;
      }

      // Enter: activate cell editor
      if (key === 'Enter') {
        e.preventDefault();
        const rowIdx = parseInt(tr.dataset.rowIdx);
        const colKey = td.dataset.col;
        const allVisible = [...filteredRows, ...draftRows];
        const row = allVisible[rowIdx];
        const col = COLUMNS.find(c => c.key === colKey);
        if (row && col && (col.editable === true || (col.editable === 'new-only' && row._draft))) {
          activateCellEditor(td, col, row, rowIdx);
        }
        return;
      }

      const isShift = e.shiftKey;
      const isNavKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key);
      if (!isNavKey) return;
      e.preventDefault();

      if (isShift) {
        // Set anchor to current cell if not set
        if (!selAnchor) {
          selAnchor = { rowIdx: parseInt(tr.dataset.rowIdx || '0'), colKey: td.dataset.col };
        }
        extendSelectionByKey(key);
        return;
      }

      // Plain arrow: move focus
      const allTableRows = [
        ...Array.from(table.tHead ? table.tHead.rows : []),
        ...Array.from(table.tBodies
          ? Array.from(table.tBodies).flatMap(b => Array.from(b.rows))
          : []),
      ];
      const rowIndex = allTableRows.indexOf(tr);
      if (rowIndex < 0) return;

      const visCells = Array.from(tr.cells).filter(c => c.tabIndex >= 0);
      const colIndex = visCells.indexOf(td);
      if (colIndex < 0) return;

      let targetCell = null;
      switch (key) {
        case 'ArrowRight':
          if (colIndex < visCells.length - 1) targetCell = visCells[colIndex + 1];
          break;
        case 'ArrowLeft':
          if (colIndex > 0) targetCell = visCells[colIndex - 1];
          break;
        case 'ArrowDown': {
          const nextTr = allTableRows[rowIndex + 1];
          if (nextTr) {
            const nextCells = Array.from(nextTr.cells).filter(c => c.tabIndex >= 0);
            targetCell = nextCells[Math.min(colIndex, nextCells.length - 1)] || null;
          }
          break;
        }
        case 'ArrowUp': {
          const prevTr = allTableRows[rowIndex - 1];
          if (prevTr) {
            const prevCells = Array.from(prevTr.cells).filter(c => c.tabIndex >= 0);
            targetCell = prevCells[Math.min(colIndex, prevCells.length - 1)] || null;
          }
          break;
        }
      }

      if (targetCell) {
        clearSelection();
        selAnchor = null;
        targetCell.focus();
      }
    });
  }

  // ─── Focus navigation helper (used by Tab/Shift+Tab in cell editors) ─────────

  function moveFocusFromCell(rowIdx, colKey, dir) {
    const wrap = document.getElementById('sprTableWrap');
    if (!wrap) return;
    const allNavTds = Array.from(wrap.querySelectorAll('tbody td')).filter(c => c.tabIndex >= 0);
    const currentIdx = allNavTds.findIndex(
      cell => cell.closest('tr')?.dataset.rowIdx == rowIdx && cell.dataset.col === colKey
    );
    if (currentIdx < 0) return;
    const nextIdx = currentIdx + dir;
    if (nextIdx >= 0 && nextIdx < allNavTds.length) {
      allNavTds[nextIdx].focus();
    }
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

      // Build progress map (latest) and history (all entries)
      progressMap = {};
      progressHistory = {};
      for (const p of (progressData || [])) {
        const gc = p.goals?.code || p.goal_code;
        if (!gc) continue;
        if (!progressMap[gc] || p.date > (progressMap[gc].date || '')) {
          progressMap[gc] = { value: p.value, date: p.date };
        }
        if (!progressHistory[gc]) progressHistory[gc] = [];
        progressHistory[gc].push({ value: parseFloat(p.value) || 0, date: p.date });
      }
      // Sort each history array by date ascending
      for (const gc of Object.keys(progressHistory)) {
        progressHistory[gc].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
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
          addressed_in_class:   g.addressed_in_class !== false,
          individual_delivery:  g.individual_delivery === true,
          iep_due:              stu.iep_due || '',
          eval_due:             stu.eval_due || '',
          notes:                g.notes || '',
          _goal_active:         g.status !== 'archived' && g.status !== 'Archived',
        };
      });

      // Apply custom row order (from localStorage) before filtering/rendering
      applyRowOrder();
      applyFilters();
      renderSpreadsheet();
      updateCountStatus();

      // Detect when columns that should have been imported are all blank —
      // this can happen when data was written before the schema migration
      // added these columns, leaving existing rows with NULL values.
      if (allRows.length > 0) {
        const activeRows = allRows.filter(r => r.active && r._goal_active);
        if (activeRows.length > 0) {
          const blankBoth = activeRows.filter(r => !r.baseline && !r.class_context).length;
          if (blankBoth / activeRows.length > 0.5) {
            showToast(
              '⚠ Most goals are missing Baseline / Class data. Use the Import CSV button (⬆) to re-import your CSV and backfill the missing data.',
              '#f59e0b',
              8000
            );
          }
        }
      }
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
      if (caseManagerFilter && r.case_manager !== caseManagerFilter) return false;
      if (dataCollectorFilter && r.data_collector !== dataCollectorFilter) return false;
      if (warningsOnlyFilter && !validationWarnings[r.goal_code]) return false;
      return true;
    });

    // Sort — skip when a custom row order is active and sort is still at its default (student_code asc)
    // In that case allRows already reflects the custom order and filteredRows inherits it.
    const hasCustomOrder = rowOrder.length > 0;
    const isDefaultSort = sortKey === 'student_code' && sortDir === 'asc';
    if (!hasCustomOrder || !isDefaultSort) {
      filteredRows.sort((a, b) => {
        const va = (a[sortKey] || '').toString().toLowerCase();
        const vb = (b[sortKey] || '').toString().toLowerCase();
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  function allColumns() {
    const combined = [...COLUMNS, ...customColumns];
    if (!columnOrder.length) return combined;
    const orderMap = {};
    columnOrder.forEach((key, idx) => { orderMap[key] = idx; });
    return combined.sort((a, b) => {
      const ai = orderMap[a.key] !== undefined ? orderMap[a.key] : Infinity;
      const bi = orderMap[b.key] !== undefined ? orderMap[b.key] : Infinity;
      return ai - bi;
    });
  }

  function visibleColumns() {
    return allColumns().filter(c => !hiddenCols.has(c.key));
  }

  function renderSpreadsheet() {
    renderHeaders();
    renderRows();
    updateColumnVisibilityPanel();
    applyAllColWidths();
  }

  function renderHeaders() {
    const tr = document.getElementById('sprHeaderRow');
    if (!tr) return;
    tr.innerHTML = '';
    for (const col of visibleColumns()) {
      const th = document.createElement('th');
      th.dataset.key = col.key;
      if (col.key === sortKey) th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      if (col.key !== '_actions' && col.key !== 'progress' && col.editable !== false) {
        th.addEventListener('click', () => handleHeaderSort(col.key, th));
      }

      // Label span (handles text truncation inside th)
      const labelSpan = document.createElement('span');
      labelSpan.className = 'spr-th-label';
      labelSpan.textContent = col.label;
      th.appendChild(labelSpan);

      // Resize handle (all columns except actions)
      if (col.key !== '_actions') {
        const handle = document.createElement('span');
        handle.className = 'spr-resize-handle';
        handle.draggable = false; // don't conflict with column drag
        handle.addEventListener('click', e => e.stopPropagation()); // don't trigger sort
        th.appendChild(handle);
        setupColumnResize(th, col.key);
      }

      // Column drag-and-drop (all columns except _actions)
      if (col.key !== '_actions') {
        th.draggable = true;
        th.addEventListener('dragstart', e => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', col.key);
          th.classList.add('spr-th-dragging');
        });
        th.addEventListener('dragover', e => {
          if (!Array.from(e.dataTransfer.types).includes('text/plain')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          document.querySelectorAll('.spr-th-drag-over').forEach(el => el.classList.remove('spr-th-drag-over'));
          if (!th.classList.contains('spr-th-dragging')) th.classList.add('spr-th-drag-over');
        });
        th.addEventListener('dragleave', () => th.classList.remove('spr-th-drag-over'));
        th.addEventListener('drop', e => {
          e.preventDefault();
          th.classList.remove('spr-th-drag-over');
          const sourceKey = e.dataTransfer.getData('text/plain');
          if (!sourceKey || sourceKey === col.key) return;
          const allCols = [...COLUMNS, ...customColumns];
          // Build current order array from all column keys
          const currentOrder = (columnOrder.length ? columnOrder : allCols.map(c => c.key));
          // Ensure all current column keys are represented
          const fullOrder = allCols.map(c => c.key).map(k => {
            const existingIdx = currentOrder.indexOf(k);
            return { key: k, idx: existingIdx >= 0 ? existingIdx : Infinity };
          }).sort((a, b) => a.idx - b.idx).map(x => x.key);
          const srcIdx = fullOrder.indexOf(sourceKey);
          const tgtIdx = fullOrder.indexOf(col.key);
          if (srcIdx < 0 || tgtIdx < 0) return;
          fullOrder.splice(srcIdx, 1);
          fullOrder.splice(tgtIdx, 0, sourceKey);
          columnOrder = fullOrder;
          saveColumnOrder();
          renderSpreadsheet();
        });
        th.addEventListener('dragend', () => {
          document.querySelectorAll('.spr-th-dragging, .spr-th-drag-over').forEach(el => {
            el.classList.remove('spr-th-dragging', 'spr-th-drag-over');
          });
        });
      }

      // Right-click context menu for custom columns (remove option)
      if (col._custom) {
        th.classList.add('spr-th-custom');
        th.addEventListener('contextmenu', e => {
          e.preventDefault();
          showCustomColContextMenu(e.clientX, e.clientY, col);
        });
      }

      // Apply stored column width
      if (colWidths[col.key]) {
        const px = colWidths[col.key];
        th.style.minWidth = px + 'px';
        th.style.maxWidth = px + 'px';
        th.style.width = px + 'px';
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

  function buildDisplayRows() {
    // Separate inline drafts (tied to a student) from free drafts
    const inlineDraftsByStudent = {};
    const freeDrafts = [];
    for (const d of draftRows) {
      if (d._afterStudentCode) {
        if (!inlineDraftsByStudent[d._afterStudentCode]) inlineDraftsByStudent[d._afterStudentCode] = [];
        inlineDraftsByStudent[d._afterStudentCode].push(d);
      } else {
        freeDrafts.push(d);
      }
    }
    // Build display list: filtered rows with inline drafts inserted after each student group
    const result = [];
    for (let i = 0; i < filteredRows.length; i++) {
      const row = filteredRows[i];
      result.push(row);
      const nextRow = filteredRows[i + 1];
      if (!nextRow || nextRow.student_code !== row.student_code) {
        const inline = inlineDraftsByStudent[row.student_code] || [];
        result.push(...inline);
      }
    }
    result.push(...freeDrafts);
    return result;
  }

  function renderRows() {
    const tbody = document.getElementById('sprTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rows = buildDisplayRows();
    let bandIndex = 0;
    let lastStudentCode = null;
    const seenStudents = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const isFirst = row.student_code !== lastStudentCode;
      if (isFirst && lastStudentCode !== null) bandIndex++;
      if (isFirst) lastStudentCode = row.student_code;

      // Skip collapsed non-first rows (except draft rows)
      if (!row._draft && !isFirst && collapsedStudents.has(row.student_code)) continue;

      const tr = document.createElement('tr');
      tr.dataset.rowIdx = i;
      tr.dataset.studentCode = row.student_code || '';
      tr.dataset.goalCode = row.goal_code || '';

      // Track first occurrence of each student for goal count badge
      const isFirstOfStudent = !row._draft && !seenStudents.has(row.student_code) && !!row.student_code;
      if (isFirstOfStudent) {
        seenStudents.add(row.student_code);
        const goalCount = allRows.filter(r => r.student_code === row.student_code && r._goal_active !== false).length;
        tr.dataset.firstOfStudent = '1';
        tr.dataset.studentGoalCount = String(goalCount);
      }

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
    // Re-apply validation warning decorations to the freshly-rendered DOM
    applyValidationWarnings();
  }

  function renderCell(td, col, row, rowIdx) {
    // For custom columns, get value from custom data store; otherwise from row object
    const val = col._custom ? getCustomVal(row, col.key) : row[col.key];

    if (col.key === '_actions') {
      td.innerHTML = buildMoreMenu(row, rowIdx);
      attachMoreMenuListeners(td, row, rowIdx);
      return;
    }

    if (col.key === 'progress') {
      const p = progressMap[row.goal_code];
      const history = progressHistory[row.goal_code] || [];
      if (p) {
        const pct = typeof p.value === 'number' ? p.value : parseFloat(p.value) || 0;
        const display = Number.isFinite(pct) ? `${Math.round(pct)}%` : String(p.value || '—');
        const barWidth = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;

        let sparklineHtml = '';
        if (history.length >= 2) {
          sparklineHtml = buildSparklineSvg(history);
        }

        td.innerHTML = `<div class="spr-progress-cell">
          <span style="min-width:38px;text-align:right;font-size:12px;">${escapeHtml(display)}</span>
          <div class="spr-progress-bar-wrap"><div class="spr-progress-bar" style="width:${barWidth}%"></div></div>
          ${sparklineHtml}
        </div>`;
      } else {
        td.textContent = '—';
        td.style.color = 'rgba(255,255,255,0.3)';
      }
      td.tabIndex = 0;
      return;
    }

    if (col.key === 'active') {
      const label = val ? 'Active' : 'Inactive';
      td.innerHTML = `<span style="color:${val ? '#22c55e' : '#f87171'}">${escapeHtml(label)}</span>`;
    } else if (col.key === 'addressed_in_class') {
      const label = val !== false ? 'Yes' : 'No';
      td.innerHTML = `<span style="color:${val !== false ? '#22c55e' : '#f87171'}">${escapeHtml(label)}</span>`;
    } else if (col.key === 'individual_delivery') {
      const label = val ? 'Yes' : 'No';
      td.innerHTML = `<span style="color:${val ? '#818cf8' : 'rgba(255,255,255,0.4)'}">${escapeHtml(label)}</span>`;
    } else if (col.key === 'iep_due' || col.key === 'eval_due') {
      td.textContent = formatDate(val);
    } else if (col.key === 'student_code') {
      // Drag handle: show only for non-draft rows
      const dragHandleHtml = !row._draft
        ? `<span class="spr-drag-handle" draggable="true" title="Drag to reorder">⠿</span>`
        : '';
      // Goal count badge: show on first row of each student group
      const tr = td.closest('tr') || { dataset: {} };
      const isFirstOfStudent = tr.dataset && tr.dataset.firstOfStudent === '1';
      const goalCount = tr.dataset ? parseInt(tr.dataset.studentGoalCount || '0', 10) : 0;
      const isCollapsed = collapsedStudents.has(row.student_code);
      // Collapse toggle: show on first row only when student has more than 1 goal
      const toggleHtml = (isFirstOfStudent && goalCount > 1)
        ? `<span class="spr-collapse-toggle" data-student="${escapeHtml(row.student_code)}" title="${isCollapsed ? 'Expand' : 'Collapse'}">${isCollapsed ? '▶' : '▼'}</span>`
        : '';
      const collapsedIndicator = (isCollapsed && goalCount > 1)
        ? `<span style="font-size:10px;opacity:0.5;"> (+${goalCount - 1} more)</span>`
        : '';
      const countBadge = (isFirstOfStudent && goalCount > 0)
        ? ` <span class="spr-goal-count-badge" title="${goalCount} goal${goalCount !== 1 ? 's' : ''}">×${goalCount}</span>${collapsedIndicator}`
        : '';
      let html = `${toggleHtml}${dragHandleHtml}<strong>${escapeHtml(val || '')}</strong>${countBadge}`;
      if (row._draft) html += `<span class="spr-draft-badge">draft</span>`;
      td.innerHTML = html;
      // Prevent drag handle click from opening cell editor
      const handle = td.querySelector('.spr-drag-handle');
      if (handle) handle.addEventListener('click', e => e.stopPropagation());
      // Collapse toggle: handle click fully here (stopPropagation prevents cell selection)
      const toggle = td.querySelector('.spr-collapse-toggle');
      if (toggle) {
        toggle.addEventListener('click', e => {
          e.stopPropagation();
          const studentCode = toggle.dataset.student;
          if (collapsedStudents.has(studentCode)) {
            collapsedStudents.delete(studentCode);
          } else {
            collapsedStudents.add(studentCode);
          }
          saveCollapsedStudents();
          renderRows();
          updateCountStatus();
        });
      }
    } else if (col.key === 'data_collector_email' && val) {
      // Validate email format before constructing mailto link (prevent URL injection)
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const link = document.createElement('a');
      if (emailPattern.test(String(val))) {
        link.href = `mailto:${val}`;
      }
      link.textContent = val;
      link.style.cssText = 'color: #818cf8; text-decoration: underline; font-size: 13px;';
      link.addEventListener('click', e => e.stopPropagation()); // don't trigger cell editor
      td.appendChild(link);
    } else {
      td.textContent = val || '';
    }

    // Comment indicator
    if (col.key !== '_actions' && col.key !== 'progress' && !row._draft) {
      const commentKey = `${row.goal_code}::${col.key}`;
      if (cellComments[commentKey]) {
        const commentDot = document.createElement('span');
        commentDot.className = 'spr-comment-dot';
        commentDot.title = cellComments[commentKey].text;
        td.appendChild(commentDot);
        td.classList.add('spr-has-comment');
      }
    }

    // Last-edited timestamp tooltip
    if (col.key !== '_actions' && col.key !== 'progress' && !row._draft) {
      const tsKey = `${row.goal_code}::${col.key}`;
      const cellTs = cellTimestamps[tsKey];
      if (cellTs) {
        const ago = formatRelativeTime(cellTs);
        const existingTitle = td.title || '';
        td.title = existingTitle ? `${existingTitle}\n✏️ Edited ${ago}` : `✏️ Edited ${ago}`;
        const diffMs = Date.now() - new Date(cellTs).getTime();
        if (diffMs < RECENTLY_EDITED_MS) {
          td.classList.add('spr-recently-edited');
        }
      }
    }

    // Right-click: cell comment menu (not for actions or progress columns)
    if (col.key !== '_actions' && col.key !== 'progress' && !row._draft) {
      td.addEventListener('contextmenu', e => {
        e.preventDefault();
        showCellCommentMenu(e.clientX, e.clientY, row, col);
      });
    }

    // All data cells are keyboard-navigable
    td.tabIndex = 0;

    // Make editable (custom columns are always editable)
    const canEdit = col._custom || col.editable === true || (col.editable === 'new-only' && row._draft);
    if (canEdit) {
      td.classList.add('spr-cell-editable');
      const prevTitle = td.title || '';
      td.title = prevTitle ? `${prevTitle}\nClick to edit` : 'Click to edit';
      td.addEventListener('click', e => {
        if (e.target.closest('.spr-drag-handle')) return; // don't open editor for drag handle
        if (e.shiftKey) {
          // Shift+click: extend selection (don't open editor)
          const activeEl = document.activeElement;
          if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;
          e.preventDefault();
          if (!selAnchor) selAnchor = { rowIdx, colKey: col.key };
          selectRangeTo(rowIdx, col.key);
        } else {
          clearSelection();
          selAnchor = { rowIdx, colKey: col.key };
          activateCellEditor(td, col, row, rowIdx);
        }
      });
    } else {
      // Non-editable data cells: click selects them for navigation
      td.addEventListener('click', e => {
        if (e.shiftKey && selAnchor) {
          const activeEl = document.activeElement;
          if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;
          e.preventDefault();
          selectRangeTo(rowIdx, col.key);
        } else {
          selectSingleCell(rowIdx, col.key);
          selAnchor = { rowIdx, colKey: col.key };
        }
      });
    }

    // Apply stored column width
    if (colWidths[col.key]) {
      const px = colWidths[col.key];
      td.style.minWidth = px + 'px';
      td.style.maxWidth = px + 'px';
      td.style.width = px + 'px';
    }

    // Apply conditional formatting (colors)
    applyConditionalFormattingToCell(td, col, row);
  }

  function activateCellEditor(td, col, row, rowIdx) {
    // Prevent double-activating
    if (td.querySelector('input,select,textarea')) return;

    clearSelection(); // exit multi-cell selection mode

    const prevContent = td.innerHTML;
    // For custom columns use the custom data store; otherwise use the row object
    const currentVal = col._custom ? getCustomVal(row, col.key) : (row[col.key] ?? '');

    // ── Select-Custom: custom dropdown with remembered options ────────────────
    if (col.type === 'select-custom') {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:100%;';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = String(currentVal || '');
      input.style.cssText = 'width:100%;padding:3px 6px;border-radius:5px;border:1px solid rgba(99,102,241,.5);background:rgba(30,33,51,.97);color:inherit;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;';
      wrap.appendChild(input);

      // Floating dropdown appended to body for correct stacking
      const ddEl = document.createElement('div');
      ddEl.style.cssText = 'position:fixed;z-index:9999;background:#1e2133;border:1px solid var(--rc-glass-border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.4);max-height:200px;overflow-y:auto;min-width:160px;display:none;font-size:13px;';
      document.body.appendChild(ddEl);

      const predefOpts = col.options || [];
      const remArr = customOptions[col.key] || [];
      // Live reference to remembered opts not in predefined list
      const remOpts = remArr.filter(v => !predefOpts.includes(v));

      let scCommitted = false;

      const repositionDd = () => {
        const rect = input.getBoundingClientRect();
        ddEl.style.left  = rect.left + 'px';
        ddEl.style.top   = (rect.bottom + 2) + 'px';
        ddEl.style.width = Math.max(rect.width, 160) + 'px';
      };

      const renderDd = (filter) => {
        ddEl.innerHTML = '';
        const q = (filter || '').toLowerCase();
        const fp = predefOpts.filter(o => !q || o.toLowerCase().includes(q));
        const fr = remOpts.filter(o => !q || o.toLowerCase().includes(q));
        if (!fp.length && !fr.length) { ddEl.style.display = 'none'; return; }

        fp.forEach(opt => {
          const d = document.createElement('div');
          d.textContent = opt;
          d.style.cssText = 'padding:6px 12px;cursor:pointer;';
          d.onmouseenter = () => { d.style.background = 'rgba(255,255,255,.08)'; };
          d.onmouseleave = () => { d.style.background = ''; };
          d.addEventListener('mousedown', e => { e.preventDefault(); input.value = opt; scCommitVal(); });
          ddEl.appendChild(d);
        });

        if (fr.length) {
          const sep = document.createElement('div');
          sep.textContent = '── remembered ──';
          sep.style.cssText = 'padding:3px 10px;font-size:10px;color:rgba(255,255,255,.35);text-align:center;border-top:1px solid rgba(255,255,255,.06);margin-top:3px;pointer-events:none;';
          ddEl.appendChild(sep);

          fr.forEach(opt => {
            const d = document.createElement('div');
            d.style.cssText = 'padding:5px 12px;cursor:pointer;display:flex;align-items:center;gap:4px;';
            const span = document.createElement('span');
            span.textContent = opt;
            span.style.flex = '1';
            const xb = document.createElement('button');
            xb.textContent = '×';
            xb.title = 'Forget this option';
            xb.style.cssText = 'background:none;border:none;color:rgba(248,113,113,.7);cursor:pointer;padding:0;font-size:14px;line-height:1;flex-shrink:0;';
            xb.addEventListener('mousedown', e => {
              e.preventDefault(); e.stopPropagation();
              const ix = remArr.indexOf(opt); if (ix >= 0) remArr.splice(ix, 1);
              const ri = remOpts.indexOf(opt); if (ri >= 0) remOpts.splice(ri, 1);
              saveCustomOptions();
              renderDd(input.value);
            });
            d.appendChild(span); d.appendChild(xb);
            d.onmouseenter = () => { d.style.background = 'rgba(255,255,255,.08)'; };
            d.onmouseleave = () => { d.style.background = ''; };
            d.addEventListener('mousedown', e => {
              if (e.target === xb) return;
              e.preventDefault(); input.value = opt; scCommitVal();
            });
            ddEl.appendChild(d);
          });
        }

        ddEl.style.display = '';
        repositionDd();
      };

      const scCommitVal = (moveDir = 0) => {
        if (scCommitted) return;
        scCommitted = true;
        ddEl.remove();
        const newVal = input.value.trim();
        td.innerHTML = '';
        td.classList.add('spr-cell-editable');
        td.title = 'Click to edit';
        td.replaceWith(td.cloneNode(false));
        const newTd = document.querySelector(`tr[data-row-idx="${rowIdx}"] td[data-col="${col.key}"]`);
        const targetTd = newTd || td;
        handleCellCommit(col, row, rowIdx, newVal, prevContent, targetTd);
        if (moveDir !== 0) {
          moveFocusFromCell(rowIdx, col.key, moveDir);
        } else if (targetTd) {
          targetTd.focus();
        }
      };

      const scCancelVal = () => {
        if (scCommitted) return;
        scCommitted = true;
        ddEl.remove();
        td.innerHTML = prevContent;
        td.classList.add('spr-cell-editable');
        td.addEventListener('click', e => {
          if (e.shiftKey) {
            if (!selAnchor) selAnchor = { rowIdx, colKey: col.key };
            selectRangeTo(rowIdx, col.key);
          } else {
            clearSelection();
            selAnchor = { rowIdx, colKey: col.key };
            activateCellEditor(td, col, row, rowIdx);
          }
        });
        td.focus();
      };

      input.addEventListener('focus', () => renderDd(input.value));
      input.addEventListener('input', () => renderDd(input.value));
      input.addEventListener('blur', () => { setTimeout(() => { if (!scCommitted) scCommitVal(); }, 120); });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); scCommitVal(); }
        else if (e.key === 'Escape') { e.preventDefault(); scCancelVal(); }
        else if (e.key === 'Tab')    { e.preventDefault(); scCommitVal(e.shiftKey ? -1 : 1); }
      });

      td.innerHTML = '';
      td.appendChild(wrap);
      input.focus();
      if (input.select) input.select();
      return; // early return — handled entirely above
    }

    let editor;
    let committed = false;

    if (col.type === 'select') {
      editor = document.createElement('select');
      for (const opt of (col.options || [])) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (String(currentVal) === opt || (col.key === 'active' && (currentVal ? 'Active' : 'Inactive') === opt) || (col.key === 'addressed_in_class' && (currentVal !== false ? 'Yes' : 'No') === opt) || (col.key === 'individual_delivery' && (currentVal ? 'Yes' : 'No') === opt)) {
          o.selected = true;
        }
        editor.appendChild(o);
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

    const commit = (moveDir = 0) => {
      if (committed) return;
      committed = true;
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

      if (moveDir !== 0) {
        moveFocusFromCell(rowIdx, col.key, moveDir);
      } else {
        if (targetTd) targetTd.focus();
      }
    };

    const cancel = () => {
      if (committed) return;
      committed = true;
      td.innerHTML = prevContent;
      td.classList.add('spr-cell-editable');
      td.addEventListener('click', e => {
        if (e.shiftKey) {
          if (!selAnchor) selAnchor = { rowIdx, colKey: col.key };
          selectRangeTo(rowIdx, col.key);
        } else {
          clearSelection();
          selAnchor = { rowIdx, colKey: col.key };
          activateCellEditor(td, col, row, rowIdx);
        }
      });
      td.focus();
    };

    if (editor.tagName === 'SELECT') {
      editor.addEventListener('change', () => commit());
      editor.addEventListener('blur', () => commit());
      editor.addEventListener('keydown', e => {
        if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? -1 : 1); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
    } else if (editor.tagName === 'TEXTAREA') {
      editor.addEventListener('blur', () => commit());
      editor.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        else if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? -1 : 1); }
      });
    } else {
      editor.addEventListener('blur', () => commit());
      editor.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        else if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? -1 : 1); }
      });
    }
  }

  function handleCellCommit(col, row, rowIdx, newVal, _prevContent, td) {
    // Handle custom column saves separately (localStorage, not DB)
    if (col._custom) {
      const oldVal = getCustomVal(row, col.key);
      if (String(oldVal ?? '') === String(newVal ?? '')) {
        renderSingleCell(td, col, row, rowIdx);
        return;
      }
      // Remember custom option for select-custom columns
      if (col.type === 'select-custom' && newVal && !(col.options || []).includes(newVal)) {
        rememberCustomOption(col.key, newVal);
      }
      setCustomVal(row, col.key, newVal);
      pushUndo({ col, row, rowIdx, oldVal, newVal, cascaded: null });
      appendChangeLog({
        student_code: row.student_code, goal_code: row.goal_code,
        column: col.label, old_value: String(oldVal ?? ''), new_value: String(newVal ?? ''), edit_type: 'manual',
      });
      renderSingleCell(td, col, row, rowIdx);
      flashCell(td);
      scheduleValidation();
      autoBackupIfNeeded();
      return;
    }

    // Convert active dropdown value
    let finalVal = newVal;
    if (col.key === 'active') finalVal = newVal === 'Active';
    if (col.key === 'addressed_in_class') finalVal = newVal === 'Yes';
    if (col.key === 'individual_delivery') finalVal = newVal === 'Yes';
    if (col.key === 'iep_due' || col.key === 'eval_due') finalVal = newVal || null;

    // Remember custom option for select-custom columns (built-in)
    if (col.type === 'select-custom' && finalVal && !(col.options || []).includes(String(finalVal))) {
      rememberCustomOption(col.key, String(finalVal));
    }

    // No change
    if (String(row[col.key] ?? '') === String(finalVal ?? '')) {
      renderSingleCell(td, col, row, rowIdx);
      return;
    }

    // Record old value for undo BEFORE cascading
    const oldVal = row[col.key];
    const cascadeOld = [];
    if (col.cascade && !row._draft) {
      for (const r of allRows) {
        if (r.student_code === row.student_code && r !== row) {
          cascadeOld.push({ row: r, oldVal: r[col.key] });
        }
      }
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

    // Push to undo stack (not for draft rows)
    if (!row._draft) {
      pushUndo({
        col, row, rowIdx, oldVal, newVal: finalVal,
        cascaded: cascadeOld.length > 0 ? cascadeOld : null,
      });
    }

    // Log the change (including any cascade rows)
    if (!row._draft) {
      appendChangeLog({
        student_code: row.student_code, goal_code: row.goal_code,
        column: col.label, old_value: String(oldVal ?? ''), new_value: String(finalVal ?? ''), edit_type: 'manual',
      });
      for (const { row: cr, oldVal: cOld } of cascadeOld) {
        appendChangeLog({
          student_code: cr.student_code, goal_code: cr.goal_code,
          column: col.label, old_value: String(cOld ?? ''), new_value: String(finalVal ?? ''), edit_type: 'manual',
        });
      }
    }

    // Re-render cell
    renderSingleCell(td, col, row, rowIdx);
    flashCell(td);

    if (row._draft) {
      checkDraftReadyToSave(row, rowIdx);
    } else {
      const tsKey = `${row.goal_code}::${col.key}`;
      cellTimestamps[tsKey] = new Date().toISOString();
      saveCellTimestamps();
      scheduleAutoSave(row, rowIdx, td);
      scheduleValidation();
      autoBackupIfNeeded();
    }
  }

  function renderSingleCell(td, col, row, rowIdx) {
    td.innerHTML = '';
    td.className = '';
    td.removeAttribute('title');
    renderCell(td, col, row, rowIdx);
  }

  function buildSparklineSvg(history) {
    const W = 40, H = 16, PAD = 1;
    const values = history.map(h => h.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
      const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const trend = values[values.length - 1] - values[0];
    const color = trend > 0 ? '#22c55e' : trend < 0 ? '#f87171' : '#94a3b8';

    const titleText = values.map((v, i) => `${history[i].date || ''}: ${Math.round(v)}%`).join(' → ');

    return `<svg class="spr-sparkline" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      `<title>${escapeHtml(titleText)}</title>` +
      `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`;
  }

  // ─── More-actions menu ───────────────────────────────────────────────────────

  function buildMoreMenu(row, rowIdx) {
    return `<div class="spr-more-wrap">
      <button class="spr-more-btn" aria-label="More actions" data-rowIdx="${rowIdx}">⋯</button>
      <div class="spr-more-menu" role="menu">
        <button data-action="copy-row" data-row-idx="${rowIdx}">📋 Copy Row</button>
        <button data-action="copy-goal-text" data-row-idx="${rowIdx}">📝 Copy Goal Text</button>
        <button data-action="add-goal" data-row-idx="${rowIdx}">➕ Add Goal for ${escapeHtml(row.student_code)}</button>
        <button data-action="duplicate-student" data-row-idx="${rowIdx}">👥 Duplicate Student</button>
        <button data-action="archive-goal" data-row-idx="${rowIdx}" class="danger">🗄 Archive This Goal</button>
      </div>
    </div>`;
  }

  function attachMoreMenuListeners(td, row, _rowIdx) {
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
        if (action === 'archive-goal') handleArchiveGoal(row);
        else if (action === 'copy-row') handleCopyRow(row);
        else if (action === 'copy-goal-text') handleCopyGoalText(row);
        else if (action === 'add-goal') handleAddGoalForStudent(row.student_code);
        else if (action === 'duplicate-student') handleDuplicateStudent(row);
      });
    });
  }

  async function handleArchiveGoal(row) {
    if (row._draft) {
      draftRows = draftRows.filter(d => d !== row);
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
      appendChangeLog({
        student_code: row.student_code, goal_code: row.goal_code,
        column: 'Status', old_value: 'Active', new_value: 'Archived', edit_type: 'manual',
      });
      applyFilters();
      runValidation();
      renderSpreadsheet();
      updateCountStatus();
      setStatusSaved();
      showToast(`Goal ${row.goal_code} archived`);
      autoBackupIfNeeded();
    } catch (err) {
      setStatusError(err.message);
      showToast('Failed to archive goal: ' + err.message, '#ef4444');
    }
  }

  function handleCopyRow(row) {
    const vals = allColumns()
      .filter(c => c.key !== '_actions' && c.key !== 'progress')
      .map(c => {
        if (c.key === 'active') return row.active ? 'Active' : 'Inactive';
        if (c.key === 'addressed_in_class') return row.addressed_in_class !== false ? 'Yes' : 'No';
        if (c.key === 'individual_delivery') return row.individual_delivery ? 'Yes' : 'No';
        if (c._custom) return getCustomVal(row, c.key) || '';
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

  function handleDuplicateStudent(row) {
    const studentRows = allRows.filter(r => r.student_code === row.student_code && r._goal_active !== false);
    if (studentRows.length === 0) {
      showToast('No active goals found for this student', '#ef4444');
      return;
    }
    // Create draft rows for the new student, placed after this student's rows
    const drafts = studentRows.map(r => ({
      ...makeDraftRow(''),
      goal_desc:        r.goal_desc,
      goal_area:        r.goal_area,
      baseline:         r.baseline,
      mastery:          r.mastery,
      measurement_type: r.measurement_type,
      class_context:    r.class_context,
      case_manager:     r.case_manager,
      iep_due:          r.iep_due,
      eval_due:         r.eval_due,
      _afterStudentCode: row.student_code,
    }));
    draftRows.push(...drafts);
    renderRows();
    updateCountStatus();
    showToast(`${studentRows.length} goal${studentRows.length !== 1 ? 's' : ''} duplicated — enter new student code`);
    // Focus the student_code cell of the first duplicate row
    setTimeout(() => {
      const allTrs = document.querySelectorAll('#sprTableBody tr.spr-row-draft');
      for (const tr of allTrs) {
        const codeTd = tr.querySelector('td[data-col="student_code"]');
        if (codeTd) { codeTd.click(); break; }
      }
    }, 50);
  }

  // ─── Custom Columns ──────────────────────────────────────────────────────────

  function openAddColumnModal() {
    const overlay = document.getElementById('sprAddColOverlay');
    if (!overlay) return;
    const nameInput = overlay.querySelector('#sprColName');
    const typeSelect = overlay.querySelector('#sprColType');
    const optionsWrap = overlay.querySelector('#sprColOptionsWrap');
    if (nameInput) nameInput.value = '';
    if (typeSelect) { typeSelect.value = 'text'; }
    if (optionsWrap) optionsWrap.style.display = 'none';
    overlay.classList.add('open');
    if (nameInput) nameInput.focus();
  }

  function closeAddColumnModal() {
    const overlay = document.getElementById('sprAddColOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function handleAddColumn() {
    const overlay = document.getElementById('sprAddColOverlay');
    if (!overlay) return;
    const nameInput = overlay.querySelector('#sprColName');
    const typeSelect = overlay.querySelector('#sprColType');
    const optionsInput = overlay.querySelector('#sprColOptions');
    const name = nameInput?.value.trim();
    const type = typeSelect?.value || 'text';
    if (!name) { showToast('Column name is required', '#ef4444'); return; }
    const key = 'custom_' + (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
    const col = { key, label: name, type, _custom: true, editable: true };
    if (type === 'select' || type === 'select-custom') {
      col.options = (optionsInput?.value || '').split(',').map(o => o.trim()).filter(Boolean);
    }
    customColumns.push(col);
    saveCustomCols();
    closeAddColumnModal();
    renderSpreadsheet();
    updateColumnVisibilityPanel();
    showToast(`Column "${name}" added`);
  }

  async function removeCustomColumn(colKey) {
    const col = customColumns.find(c => c.key === colKey);
    if (!col) return;
    const confirmed = await rcConfirm(
      'Remove Column',
      `Remove the custom column "${col.label}"? All data in this column will be lost.`,
      'Remove',
      { danger: true }
    );
    if (!confirmed) return;
    customColumns = customColumns.filter(c => c.key !== colKey);
    saveCustomCols();
    // Remove data for this column from customData
    for (const rowKey of Object.keys(customData)) {
      delete customData[rowKey][colKey];
    }
    saveCustomData();
    renderSpreadsheet();
    updateColumnVisibilityPanel();
    showToast(`Column "${col.label}" removed`);
  }

  function showCustomColContextMenu(x, y, col) {
    // Remove any existing context menu
    document.querySelectorAll('.spr-col-ctx-menu').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'spr-col-ctx-menu';
    menu.innerHTML = `<button data-action="remove">🗑 Remove Column</button>`;
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9000;background:#1e2133;
      border:1px solid var(--rc-glass-border);border-radius:8px;padding:4px 0;box-shadow:0 8px 24px rgba(0,0,0,.45);`;
    menu.querySelector('[data-action="remove"]').style.cssText =
      'display:block;width:100%;padding:8px 14px;text-align:left;background:none;border:none;color:#f87171;font-size:13px;cursor:pointer;white-space:nowrap;';
    menu.querySelector('[data-action="remove"]').addEventListener('click', () => {
      menu.remove();
      removeCustomColumn(col.key);
    });
    document.body.appendChild(menu);
    const dismiss = () => { menu.remove(); document.removeEventListener('click', dismiss); };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  }

  function showCellCommentMenu(x, y, row, col) {
    // Remove any existing comment menus
    document.querySelectorAll('.spr-cell-comment-menu').forEach(el => el.remove());

    const commentKey = `${row.goal_code}::${col.key}`;
    const existing = cellComments[commentKey];

    const menu = document.createElement('div');
    menu.className = 'spr-cell-comment-menu';
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9100;background:#1e2133;
      border:1px solid var(--rc-glass-border);border-radius:10px;padding:12px;
      box-shadow:0 8px 24px rgba(0,0,0,.5);min-width:260px;`;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:rgba(255,255,255,.5);margin-bottom:8px;';
    header.textContent = `💬 Comment — ${escapeHtml(col.label)}`;
    menu.appendChild(header);

    // Timestamp label (if existing)
    if (existing?.timestamp) {
      const tsLabel = document.createElement('div');
      tsLabel.style.cssText = 'font-size:11px;color:rgba(255,255,255,.35);margin-bottom:6px;';
      tsLabel.textContent = `Added ${formatRelativeTime(existing.timestamp)}`;
      menu.appendChild(tsLabel);
    }

    // Textarea
    const ta = document.createElement('textarea');
    ta.value = existing?.text || '';
    ta.placeholder = 'Add a comment…';
    ta.rows = 3;
    ta.style.cssText = 'width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--rc-glass-border);background:rgba(255,255,255,.07);color:inherit;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;outline:none;';
    menu.appendChild(ta);

    // Buttons row
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;margin-top:8px;';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💬 Save';
    saveBtn.className = 'spr-btn spr-btn-sm spr-btn-primary';
    saveBtn.addEventListener('click', () => {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      cellComments[commentKey] = { text, timestamp: new Date().toISOString() };
      saveCellComments();
      menu.remove();
      const tr = document.querySelector(`tr[data-goal-code="${row.goal_code}"]`);
      if (tr) {
        const rowIdx = parseInt(tr.dataset.rowIdx, 10);
        const cellTd = tr.querySelector(`td[data-col="${col.key}"]`);
        if (cellTd && !isNaN(rowIdx)) renderSingleCell(cellTd, col, row, rowIdx);
      }
    });
    btns.appendChild(saveBtn);

    if (existing) {
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '🗑 Remove';
      removeBtn.className = 'spr-btn spr-btn-sm';
      removeBtn.style.color = '#f87171';
      removeBtn.addEventListener('click', () => {
        delete cellComments[commentKey];
        saveCellComments();
        menu.remove();
        const tr = document.querySelector(`tr[data-goal-code="${row.goal_code}"]`);
        if (tr) {
          const rowIdx = parseInt(tr.dataset.rowIdx, 10);
          const cellTd = tr.querySelector(`td[data-col="${col.key}"]`);
          if (cellTd && !isNaN(rowIdx)) renderSingleCell(cellTd, col, row, rowIdx);
        }
      });
      btns.appendChild(removeBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '✕';
    cancelBtn.className = 'spr-btn spr-btn-sm';
    cancelBtn.addEventListener('click', () => menu.remove());
    btns.appendChild(cancelBtn);

    menu.appendChild(btns);
    document.body.appendChild(menu);

    // Adjust position to stay within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

    ta.focus();

    const dismiss = e => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', dismiss);
      }
    };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  }

  // ─── Row Drag-and-Drop ───────────────────────────────────────────────────────

  function setupRowDragHandlers() {
    const tbody = document.getElementById('sprTableBody');
    if (!tbody) return;

    tbody.addEventListener('dragstart', e => {
      const handle = e.target.closest('.spr-drag-handle');
      if (!handle) { e.preventDefault(); return; }
      const tr = handle.closest('tr[data-row-idx]');
      if (!tr) return;
      const rowIdx = parseInt(tr.dataset.rowIdx, 10);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(rowIdx));
      tr.classList.add('spr-row-dragging');
      dragState = { sourceIdx: rowIdx };
    });

    tbody.addEventListener('dragover', e => {
      if (!dragState) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const tr = e.target.closest('tr[data-row-idx]');
      if (!tr) return;
      document.querySelectorAll('.spr-row-drag-over').forEach(r => r.classList.remove('spr-row-drag-over'));
      if (!tr.classList.contains('spr-row-dragging')) tr.classList.add('spr-row-drag-over');
    });

    tbody.addEventListener('dragleave', e => {
      const tr = e.target.closest('tr[data-row-idx]');
      if (tr) tr.classList.remove('spr-row-drag-over');
    });

    tbody.addEventListener('drop', async e => {
      e.preventDefault();
      if (!dragState) return;
      const targetTr = e.target.closest('tr[data-row-idx]');
      document.querySelectorAll('.spr-row-drag-over, .spr-row-dragging').forEach(r => {
        r.classList.remove('spr-row-drag-over', 'spr-row-dragging');
      });
      if (!targetTr) { dragState = null; return; }
      const targetIdx = parseInt(targetTr.dataset.rowIdx, 10);
      const sourceIdx = dragState.sourceIdx;
      dragState = null;
      if (sourceIdx !== targetIdx) await reorderRows(sourceIdx, targetIdx);
    });

    tbody.addEventListener('dragend', () => {
      document.querySelectorAll('.spr-row-drag-over, .spr-row-dragging').forEach(r => {
        r.classList.remove('spr-row-drag-over', 'spr-row-dragging');
      });
      dragState = null;
    });
  }

  async function reorderRows(sourceIdx, targetIdx) {
    const displayRows = buildDisplayRows();
    const sourceRow = displayRows[sourceIdx];
    const targetRow = displayRows[targetIdx];
    if (!sourceRow || !targetRow) return;
    if (sourceRow._draft || targetRow._draft) {
      showToast('Cannot reorder draft rows', '#ef4444');
      return;
    }

    // Check if student has multiple rows
    const studentRows = allRows.filter(r => r.student_code === sourceRow.student_code);
    let moveAllStudent = false;
    if (studentRows.length > 1) {
      moveAllStudent = await rcConfirm(
        'Move Student Rows',
        `${sourceRow.student_code} has ${studentRows.length} goals. Move all rows for this student together?`,
        'Move All'
      );
    }

    // Save old order for undo
    const oldOrder = allRows.map(r => r.goal_code).filter(Boolean);

    if (moveAllStudent) {
      const others = allRows.filter(r => r.student_code !== sourceRow.student_code);
      const studentRowsInOrder = allRows.filter(r => r.student_code === sourceRow.student_code);
      const targetInAll = allRows.findIndex(r => r === targetRow);
      const sourceInAll = allRows.findIndex(r => r === sourceRow);
      const insertBefore = targetInAll < sourceInAll;
      const targetInOthers = others.findIndex(r => r === targetRow);
      const insertAt = targetInOthers >= 0 ? (insertBefore ? targetInOthers : targetInOthers + 1) : others.length;
      const newAllRows = [...others];
      newAllRows.splice(insertAt, 0, ...studentRowsInOrder);
      allRows.length = 0;
      allRows.push(...newAllRows);
    } else {
      const srcInAll = allRows.findIndex(r => r === sourceRow);
      const tgtInAll = allRows.findIndex(r => r === targetRow);
      if (srcInAll < 0 || tgtInAll < 0) return;
      allRows.splice(srcInAll, 1);
      const newTgtInAll = allRows.findIndex(r => r === targetRow);
      const insertPos = tgtInAll > srcInAll ? newTgtInAll + 1 : newTgtInAll;
      allRows.splice(insertPos, 0, sourceRow);
    }

    rowOrder = allRows.map(r => r.goal_code).filter(Boolean);
    saveRowOrder();
    pushUndo({ type: 'reorder', oldOrder, newOrder: [...rowOrder] });
    applyFilters();
    renderSpreadsheet();
    updateCountStatus();
    showToast('Rows reordered');
  }

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
      notes:                '',
      addressed_in_class:   true,
      individual_delivery:  false,
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
        notes:               draftRow.notes,
        addressed_in_class:  draftRow.addressed_in_class !== false,
        individual_delivery: draftRow.individual_delivery === true,
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
        notes:               row.notes,
        addressed_in_class:  row.addressed_in_class,
        individual_delivery: row.individual_delivery,
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
    const customCols = customColumns;
    const headers = [...CSV_HEADERS, ...customCols.map(c => c.label)];
    const lines = [headers.join(',')];
    for (const r of allRows) {
      if (!showArchived && (!r.active || !r._goal_active)) continue;
      const baseCells = [
        r.student_code, r.goal_desc, r.goal_code,
        r.active ? 'Active' : 'Inactive',
        r.baseline, r.mastery, r.class_context, r.goal_area, r.case_manager,
        r.data_collector, r.data_collector_email, r.measurement_type,
        r.addressed_in_class !== false ? 'Yes' : 'No',
        r.individual_delivery ? 'Yes' : 'No',
        r.iep_due ? formatDate(r.iep_due) : '', r.eval_due ? formatDate(r.eval_due) : '',
        r.notes || '',
      ];
      const customCells = customCols.map(c => getCustomVal(r, c.key));
      lines.push([...baseCells, ...customCells].map(csvEscape).join(','));
    }
    downloadFile(lines.join('\n'), `master_spreadsheet_export_${dateTag()}.csv`, 'text/csv;charset=utf-8;');
    showToast('CSV exported');
  }

  async function loadSpreadsheetRosterIfNeeded() {
    if (isRosterLoaded()) return true;
    await rcAlert(
      'No Roster Loaded',
      'To export with real names, please select your student roster CSV file (code,real_name) in the next dialog.'
    );
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      input.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) { resolve(false); return; }
        const text = await file.text();
        const count = loadDistrictRoster(text);
        if (count === 0) {
          await rcAlert('Empty Roster', 'No valid entries found. The roster CSV must have two columns: code,real_name.');
          resolve(false);
        } else {
          resolve(true);
        }
      });
      input.addEventListener('cancel', () => resolve(false));
      input.click();
    });
  }

  async function exportDistrictCsv() {
    const ready = await loadSpreadsheetRosterIfNeeded();
    if (!ready) return;
    const customCols = customColumns;
    const headers = [...CSV_HEADERS, ...customCols.map(c => c.label)];
    const lines = [headers.join(',')];
    for (const r of allRows) {
      if (!showArchived && (!r.active || !r._goal_active)) continue;
      const baseCells = [
        r.student_code, r.goal_desc, r.goal_code,
        r.active ? 'Active' : 'Inactive',
        r.baseline, r.mastery, r.class_context, r.goal_area, r.case_manager,
        r.data_collector, r.data_collector_email, r.measurement_type,
        r.addressed_in_class !== false ? 'Yes' : 'No',
        r.individual_delivery ? 'Yes' : 'No',
        r.iep_due ? formatDate(r.iep_due) : '', r.eval_due ? formatDate(r.eval_due) : '',
        r.notes || '',
      ];
      const customCells = customCols.map(c => getCustomVal(r, c.key));
      lines.push([...baseCells, ...customCells].map(csvEscape).join(','));
    }
    translateAndDownload(lines.join('\n'), `master_spreadsheet_district_${dateTag()}.csv`, 'text/csv;charset=utf-8;');
    showToast('District CSV exported');
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
        addressed_in_class: r.addressed_in_class !== false,
        individual_delivery: r.individual_delivery === true,
        notes: r.notes || '',
      });
    }
    downloadFile(JSON.stringify(Object.values(byStudent), null, 2), `master_spreadsheet_export_${dateTag()}.json`, 'application/json');
    showToast('JSON exported');
  }

  function exportMarkdown() {
    const customCols = customColumns;
    const cols = [...CSV_HEADERS, ...customCols.map(c => c.label)];
    let md = `| ${cols.join(' | ')} |\n`;
    md += `| ${cols.map(() => '---').join(' | ')} |\n`;
    for (const r of allRows) {
      if (!showArchived && (!r.active || !r._goal_active)) continue;
      const baseCells = [
        r.student_code, r.goal_desc, r.goal_code,
        r.active ? 'Active' : 'Inactive',
        r.baseline, r.mastery, r.class_context, r.goal_area, r.case_manager,
        r.data_collector, r.data_collector_email, r.measurement_type,
        r.addressed_in_class !== false ? 'Yes' : 'No',
        r.individual_delivery ? 'Yes' : 'No',
        r.iep_due ? formatDate(r.iep_due) : '', r.eval_due ? formatDate(r.eval_due) : '',
        r.notes || '',
      ];
      const customCells = customCols.map(c => getCustomVal(r, c.key));
      const cells = [...baseCells, ...customCells].map(v => String(v || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' '));
      md += `| ${cells.join(' | ')} |\n`;
    }
    downloadFile(md, `master_spreadsheet_export_${dateTag()}.md`, 'text/markdown');
    showToast('Markdown exported');
  }

  function exportPdf() {
    const el = document.getElementById('sprPrintHeaderDate');
    if (el) el.textContent = `Printed: ${new Date().toLocaleDateString()}`;
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
      notes:                r[14] || '',
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
          notes: r.notes,
        });
        saved++;
      } catch (_err) { failed++; }
    }
    setStatusSaved();
    showToast(`Imported ${saved} rows${failed > 0 ? ` (${failed} failed)` : ''}`);
    // Log one entry per imported row
    for (const r of importParsedRows) {
      appendChangeLog({
        student_code: r.student_code, goal_code: r.goal_code,
        column: 'CSV Import', old_value: '', new_value: 'imported', edit_type: 'csv-import',
      });
    }
    await loadData();
    runValidation();
    autoBackupIfNeeded();
  }

  // ─── Views Dropdown ──────────────────────────────────────────────────────────

  function renderViewsDropdown() {
    const panel = document.getElementById('sprViewsDropdown');
    if (!panel) return;
    panel.innerHTML = '';

    // Save Current View button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Save Current View…';
    saveBtn.style.fontWeight = '600';
    saveBtn.addEventListener('click', e => {
      e.stopPropagation();
      // Show inline input
      panel.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'padding:8px 14px;display:flex;flex-direction:column;gap:8px;';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'View name…';
      input.style.cssText = 'padding:6px 10px;border-radius:7px;border:1px solid var(--rc-glass-border);background:rgba(255,255,255,0.07);color:inherit;font-size:13px;outline:none;width:100%;box-sizing:border-box;';
      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = '💾 Save';
      confirmBtn.className = 'spr-btn spr-btn-sm';
      const doSave = () => {
        const name = input.value.trim();
        if (!name) { showToast('Please enter a view name', '#ef4444'); return; }
        savedViews.push({
          name,
          filters: {
            searchQuery, classFilter, goalAreaFilter, caseManagerFilter,
            dataCollectorFilter, showArchived, warningsOnlyFilter, sortKey, sortDir,
          },
        });
        saveViews();
        panel.classList.remove('open');
        renderViewsDropdown();
        showToast(`View "${name}" saved`);
      };
      confirmBtn.addEventListener('click', e2 => { e2.stopPropagation(); doSave(); });
      input.addEventListener('keydown', e2 => {
        if (e2.key === 'Enter') { e2.preventDefault(); doSave(); }
        else if (e2.key === 'Escape') { e2.preventDefault(); panel.classList.remove('open'); renderViewsDropdown(); }
      });
      wrap.appendChild(input);
      wrap.appendChild(confirmBtn);
      panel.appendChild(wrap);
      input.focus();
    });
    panel.appendChild(saveBtn);

    // Separator
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--rc-glass-border);margin:4px 0;';
    panel.appendChild(sep);

    // Saved views list
    if (!savedViews.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No saved views';
      empty.style.cssText = 'padding:8px 14px;font-size:12px;color:rgba(255,255,255,0.35);';
      panel.appendChild(empty);
    } else {
      savedViews.forEach((view, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:0 4px 0 0;';
        const viewBtn = document.createElement('button');
        viewBtn.textContent = view.name;
        viewBtn.style.cssText = 'flex:1;text-align:left;background:none;border:none;color:inherit;font-size:13px;cursor:pointer;padding:6px 14px;transition:background 0.1s;';
        viewBtn.addEventListener('click', () => {
          applyView(view);
          panel.classList.remove('open');
        });
        viewBtn.addEventListener('mouseenter', () => { viewBtn.style.background = 'rgba(255,255,255,0.07)'; });
        viewBtn.addEventListener('mouseleave', () => { viewBtn.style.background = ''; });
        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.title = 'Delete view';
        delBtn.style.cssText = 'background:none;border:none;color:rgba(248,113,113,0.7);cursor:pointer;padding:2px 8px;font-size:14px;line-height:1;flex-shrink:0;';
        delBtn.addEventListener('click', e => {
          e.stopPropagation();
          savedViews.splice(i, 1);
          saveViews();
          renderViewsDropdown();
        });
        row.appendChild(viewBtn);
        row.appendChild(delBtn);
        panel.appendChild(row);
      });
    }
  }

  function applyView(view) {
    const f = view.filters;
    searchQuery        = f.searchQuery || '';
    classFilter        = f.classFilter || '';
    goalAreaFilter     = f.goalAreaFilter || '';
    caseManagerFilter  = f.caseManagerFilter || '';
    dataCollectorFilter = f.dataCollectorFilter || '';
    showArchived       = !!f.showArchived;
    warningsOnlyFilter = !!f.warningsOnlyFilter;
    sortKey            = f.sortKey || 'student_code';
    sortDir            = f.sortDir || 'asc';

    // Update DOM controls to reflect restored filter values
    const searchEl = document.getElementById('sprSearch');
    if (searchEl) searchEl.value = searchQuery;
    const classEl = document.getElementById('sprClassFilter');
    if (classEl) classEl.value = classFilter;
    const goalAreaEl = document.getElementById('sprGoalAreaFilter');
    if (goalAreaEl) goalAreaEl.value = goalAreaFilter;
    const caseManagerEl = document.getElementById('sprCaseManagerFilter');
    if (caseManagerEl) caseManagerEl.value = caseManagerFilter;
    const dataCollectorEl = document.getElementById('sprDataCollectorFilter');
    if (dataCollectorEl) dataCollectorEl.value = dataCollectorFilter;
    const archivedEl = document.getElementById('sprShowArchived');
    if (archivedEl) archivedEl.checked = showArchived;

    applyFilters();
    renderRows();
    updateCountStatus();
    showToast(`View "${view.name}" applied`);
  }

  // ─── Column visibility panel ─────────────────────────────────────────────────

  function updateColumnVisibilityPanel() {
    const panel = document.getElementById('sprColDropdown');
    if (!panel) return;
    panel.innerHTML = '';
    for (const col of allColumns()) {
      if (col.key === '_actions') continue;
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !hiddenCols.has(col.key);
      cb.dataset.colKey = col.key;
      cb.addEventListener('change', () => {
        if (cb.checked) hiddenCols.delete(col.key);
        else hiddenCols.add(col.key);
        saveHiddenCols();
        renderSpreadsheet();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + (col.label || col.key)));
      if (col._custom) {
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '🗑';
        removeBtn.title = 'Remove column';
        removeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#f87171;margin-left:4px;font-size:12px;';
        removeBtn.addEventListener('click', e => { e.stopPropagation(); removeCustomColumn(col.key); });
        label.appendChild(removeBtn);
      }
      panel.appendChild(label);
    }

    // Reset Column Order button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '↩ Reset Column Order';
    resetBtn.className = 'spr-btn spr-btn-sm';
    resetBtn.style.cssText = 'margin:8px 14px;font-size:11px;';
    resetBtn.addEventListener('click', () => {
      columnOrder = [];
      saveColumnOrder();
      renderSpreadsheet();
      showToast('Column order reset');
    });
    panel.appendChild(resetBtn);
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

  function buildCaseManagerFilterOptions() {
    const sel = document.getElementById('sprCaseManagerFilter');
    if (!sel) return;
    const managers = new Set(allRows.map(r => r.case_manager).filter(Boolean));
    sel.innerHTML = '<option value="">All Case Managers</option>';
    for (const m of [...managers].sort()) {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      sel.appendChild(o);
    }
  }

  function buildDataCollectorFilterOptions() {
    const sel = document.getElementById('sprDataCollectorFilter');
    if (!sel) return;
    const collectors = new Set(allRows.map(r => r.data_collector).filter(Boolean));
    sel.innerHTML = '<option value="">All Data Collectors</option>';
    for (const c of [...collectors].sort()) {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    }
  }

  // ─── Compare CSV (Read-Only Diff) ─────────────────────────────────────────────

  const COMPARE_FIELDS = [
    { key: 'student_code',    label: 'Student'      },
    { key: 'goal_desc',       label: 'IEP Goal'     },
    { key: 'goal_area',       label: 'Goal Area'    },
    { key: 'baseline',        label: 'Baseline'     },
    { key: 'mastery',         label: 'Mastery'      },
    { key: 'measurement_type',label: 'Meas. Type'   },
    { key: 'class_context',   label: 'Class'        },
    { key: 'iep_due',         label: 'IEP Due'      },
    { key: 'eval_due',        label: 'Eval Due'     },
    { key: 'notes',           label: 'Notes'        },
  ];

  function openCompareCsvModal() {
    const overlay = document.getElementById('sprCompareOverlay');
    const preview = document.getElementById('sprComparePreview');
    const fileInput = document.getElementById('sprCompareFileInput');
    if (!overlay) return;
    if (preview) preview.style.display = 'none';
    if (fileInput) fileInput.value = '';
    overlay.classList.add('open');
  }

  function closeCompareCsvModal() {
    const overlay = document.getElementById('sprCompareOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function handleCompareCsvFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const rows = parseCsv(e.target.result);
      if (!rows.length) { showToast('No data found in CSV', '#ef4444'); return; }
      const firstRow = rows[0];
      const hasHeader = firstRow.some(c => c === 'Student Code Name' || c === 'IEP Goal');
      const dataRows = hasHeader ? rows.slice(1) : rows;
      const parsed = dataRows.map(r => ({
        student_code:      r[0] || '',
        goal_desc:         r[1] || '',
        goal_code:         r[2] || '',
        active:            (r[3] || 'Active').toLowerCase() !== 'inactive',
        baseline:          r[4] || '',
        mastery:           r[5] || '',
        class_context:     r[6] || '',
        goal_area:         r[7] || '',
        case_manager:      r[8] || '',
        data_collector:    r[9] || '',
        data_collector_email: r[10] || '',
        measurement_type:  r[11] || 'Percent',
        iep_due:           toIsoDate(r[12]) || '',
        eval_due:          toIsoDate(r[13]) || '',
        notes:             r[14] || '',
      })).filter(r => r.student_code && r.goal_code);
      buildCompareDiff(parsed);
    };
    reader.readAsText(file);
  }

  function buildCompareDiff(csvRows) {
    const csvMap = {};
    for (const r of csvRows) { if (r.goal_code) csvMap[r.goal_code] = r; }
    const sprMap = {};
    for (const r of allRows)  { if (r.goal_code) sprMap[r.goal_code] = r; }

    let addedCount = 0, removedCount = 0, changedCount = 0, unchangedCount = 0;
    const diffItems = []; // {type, csvRow, sprRow, changedCells}

    // Added / Changed / Unchanged (from CSV perspective)
    for (const csvRow of csvRows) {
      const sprRow = sprMap[csvRow.goal_code];
      if (!sprRow) {
        addedCount++;
        diffItems.push({ type: 'added', csvRow, sprRow: null, changedCells: {} });
      } else {
        const changedCells = {};
        for (const { key } of COMPARE_FIELDS) {
          const cv = String(csvRow[key] ?? '');
          const sv = String(sprRow[key] ?? '');
          if (cv !== sv) changedCells[key] = { old: sv, new: cv };
        }
        if (Object.keys(changedCells).length > 0) {
          changedCount++;
          diffItems.push({ type: 'changed', csvRow, sprRow, changedCells });
        } else {
          unchangedCount++;
          diffItems.push({ type: 'unchanged', csvRow, sprRow, changedCells: {} });
        }
      }
    }

    // Removed (in spreadsheet but not in CSV)
    for (const sprRow of allRows) {
      if (!csvMap[sprRow.goal_code]) {
        removedCount++;
        diffItems.push({ type: 'removed', csvRow: null, sprRow, changedCells: {} });
      }
    }

    // Summary
    const summaryEl = document.getElementById('sprCompareSummary');
    if (summaryEl) {
      summaryEl.textContent =
        `${addedCount} added · ${removedCount} removed · ${changedCount} changed · ${unchangedCount} unchanged`;
    }

    // Build table header
    const table = document.getElementById('sprCompareTable');
    if (!table) return;
    const headerTr = table.querySelector('thead tr');
    if (headerTr) {
      headerTr.innerHTML = `<th>Status</th><th>Goal Code</th>` +
        COMPARE_FIELDS.map(f => `<th>${escapeHtml(f.label)}</th>`).join('');
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    let showUnchanged = false;

    function renderCompareRows() {
      tbody.innerHTML = '';
      for (const item of diffItems) {
        if (item.type === 'unchanged' && !showUnchanged) continue;
        const tr = document.createElement('tr');
        tr.dataset.diffType = item.type;

        let statusText = '';
        if (item.type === 'added')     { statusText = '🟢 Added';   tr.classList.add('spr-diff-added'); }
        if (item.type === 'removed')   { statusText = '🔴 Removed'; tr.classList.add('spr-diff-removed'); }
        if (item.type === 'changed')   { statusText = '🟡 Changed'; tr.classList.add('spr-diff-changed'); }
        if (item.type === 'unchanged') { statusText = '─';          tr.classList.add('spr-diff-unchanged'); }

        const statusTd = document.createElement('td');
        statusTd.textContent = statusText;
        tr.appendChild(statusTd);

        const rowData = item.csvRow || item.sprRow;
        const goalTd = document.createElement('td');
        goalTd.textContent = rowData.goal_code || '';
        tr.appendChild(goalTd);

        for (const { key } of COMPARE_FIELDS) {
          const td = document.createElement('td');
          if (item.type === 'removed') {
            td.textContent = item.sprRow[key] || '';
          } else if (item.type === 'changed' && item.changedCells[key]) {
            const diff = item.changedCells[key];
            td.style.background = 'rgba(250,204,21,.18)';
            td.innerHTML =
              `<span style="text-decoration:line-through;opacity:.55;font-size:11px;display:block;">${escapeHtml(diff.old)}</span>` +
              `<span>${escapeHtml(diff.new)}</span>`;
            td.title = `${diff.old} → ${diff.new}`;
          } else {
            td.textContent = (item.csvRow || item.sprRow)[key] || '';
          }
          tr.appendChild(td);
        }

        tbody.appendChild(tr);
      }
    }

    renderCompareRows();

    // Store parsed rows so applyCompareChanges() can use them
    compareParsedRows = csvRows;

    // Show/hide Apply button based on actionable changes
    const applyBtn = document.getElementById('sprCompareApplyBtn');
    if (applyBtn) {
      const actionableCount = addedCount + changedCount;
      if (actionableCount > 0) {
        applyBtn.style.display = '';
        applyBtn.textContent = `✅ Apply ${actionableCount} change${actionableCount !== 1 ? 's' : ''}`;
      } else {
        applyBtn.style.display = 'none';
      }
    }

    const toggleBtn = document.getElementById('sprCompareShowUnchangedBtn');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        showUnchanged = !showUnchanged;
        const label = showUnchanged ? '👁 Hide Unchanged' : '👁 Show Unchanged';
        toggleBtn.textContent = label;
        toggleBtn.setAttribute('aria-label', showUnchanged ? 'Hide unchanged rows' : 'Show unchanged rows');
        renderCompareRows();
      };
      toggleBtn.textContent = '👁 Show Unchanged';
      toggleBtn.setAttribute('aria-label', 'Show unchanged rows');
    }

    const preview = document.getElementById('sprComparePreview');
    if (preview) preview.style.display = '';
  }

  async function applyCompareChanges() {
    const csvMap = {};
    for (const r of compareParsedRows) { if (r.goal_code) csvMap[r.goal_code] = r; }
    const sprMap = {};
    for (const r of allRows) { if (r.goal_code) sprMap[r.goal_code] = r; }

    // Determine added/changed rows (same logic as buildCompareDiff)
    const toApply = [];
    for (const csvRow of compareParsedRows) {
      const sprRow = sprMap[csvRow.goal_code];
      if (!sprRow) {
        toApply.push(csvRow); // added
      } else {
        const hasChanges = COMPARE_FIELDS.some(({ key }) => String(csvRow[key] ?? '') !== String(sprRow[key] ?? ''));
        if (hasChanges) toApply.push(csvRow); // changed
      }
    }

    const count = toApply.length;
    if (count === 0) { showToast('No changes to apply'); return; }

    const confirmed = await rcConfirm(
      'Apply CSV Changes',
      `Apply ${count} added/changed row${count !== 1 ? 's' : ''} from the compared CSV? This will update the database.`,
      'Apply'
    );
    if (!confirmed) return;

    closeCompareCsvModal();
    setStatusSaving();
    let saved = 0; let failed = 0;
    for (const r of toApply) {
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
          notes: r.notes,
        });
        appendChangeLog({
          student_code: r.student_code, goal_code: r.goal_code,
          column: 'CSV Compare Apply', old_value: '', new_value: 'applied', edit_type: 'csv-compare-apply',
        });
        saved++;
      } catch (_err) { failed++; }
    }
    setStatusSaved();
    autoBackupIfNeeded();
    await loadData();
    showToast(`Applied ${saved} row${saved !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`);
  }

  // ─── Change Log Modal ────────────────────────────────────────────────────────

  function openChangeLogModal() {
    const overlay = document.getElementById('sprChangeLogOverlay');
    if (!overlay) return;
    renderChangeLogContent();
    overlay.classList.add('open');
  }

  function closeChangeLogModal() {
    const overlay = document.getElementById('sprChangeLogOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function renderChangeLogContent() {
    const container = document.getElementById('sprChangeLogContent');
    if (!container) return;
    if (!changeLog.length) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:rgba(255,255,255,0.4);font-size:13px;">No changes recorded yet.</div>';
      return;
    }
    const table = document.createElement('table');
    table.className = 'spr-diff-table spr-changelog-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${['Timestamp','Student','Goal Code','Column','Old Value','New Value','Type'].map(h => `<th>${h}</th>`).join('')}</tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const entry of changeLog) {
      const tr = document.createElement('tr');
      const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
      [ts, entry.student_code || '', entry.goal_code || '', entry.column || '',
       entry.old_value || '', entry.new_value || '', entry.edit_type || ''].forEach(v => {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
  }

  async function clearChangeLog() {
    const confirmed = await rcConfirm('Clear Change Log', 'Clear all change log entries? This cannot be undone.', 'Clear');
    if (!confirmed) return;
    changeLog = [];
    saveChangeLog();
    renderChangeLogContent();
    showToast('Change log cleared');
  }

  function downloadChangeLog() {
    const headers = ['Timestamp', 'Student', 'Goal Code', 'Column', 'Old Value', 'New Value', 'Type'];
    const lines = [headers.join(',')];
    for (const entry of changeLog) {
      const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
      lines.push([ts, entry.student_code || '', entry.goal_code || '', entry.column || '',
        entry.old_value || '', entry.new_value || '', entry.edit_type || ''].map(csvEscape).join(','));
    }
    downloadFile(lines.join('\n'), `spreadsheet_changelog_${dateTag()}.csv`, 'text/csv;charset=utf-8;');
    showToast('Change log downloaded');
  }

  // ─── Backup & Restore ────────────────────────────────────────────────────────

  function buildBackupObject() {
    return {
      backup_version: 1,
      timestamp: new Date().toISOString(),
      rows: allRows,
      customColumns,
      customData,
      rowOrder,
      colWidths,
      hiddenCols: [...hiddenCols],
      changeLog,
      columnOrder,
      savedViews,
      collapsedStudents: [...collapsedStudents],
      cellComments,
      cellTimestamps,
      printDarkMode,
      cfRules,
    };
  }

  function backupData(filenamePrefix = 'spreadsheet_backup') {
    const backup = buildBackupObject();
    downloadFile(JSON.stringify(backup, null, 2), `${filenamePrefix}_${dateTag()}.json`, 'application/json');
    showToast('Backup downloaded');
  }

  function triggerRestore() {
    const input = document.getElementById('sprRestoreInput');
    if (input) { input.value = ''; input.click(); }
  }

  async function applyBackupObject(backup) {
    // Restore localStorage state
    if (Array.isArray(backup.customColumns)) { customColumns = backup.customColumns; saveCustomCols(); }
    if (backup.customData && typeof backup.customData === 'object') { customData = backup.customData; saveCustomData(); }
    if (Array.isArray(backup.rowOrder)) { rowOrder = backup.rowOrder; saveRowOrder(); }
    if (backup.colWidths && typeof backup.colWidths === 'object') { colWidths = backup.colWidths; saveColWidths(); }
    if (Array.isArray(backup.hiddenCols)) { hiddenCols = new Set(backup.hiddenCols); saveHiddenCols(); }
    if (Array.isArray(backup.changeLog)) { changeLog = backup.changeLog; saveChangeLog(); }
    if (Array.isArray(backup.columnOrder)) { columnOrder = backup.columnOrder; saveColumnOrder(); }
    if (Array.isArray(backup.savedViews)) { savedViews = backup.savedViews; saveViews(); }
    if (Array.isArray(backup.collapsedStudents)) { collapsedStudents = new Set(backup.collapsedStudents); saveCollapsedStudents(); }
    if (backup.cellComments && typeof backup.cellComments === 'object') { cellComments = backup.cellComments; saveCellComments(); }
    if (backup.cellTimestamps && typeof backup.cellTimestamps === 'object') { cellTimestamps = backup.cellTimestamps; saveCellTimestamps(); }
    if (typeof backup.printDarkMode === 'boolean') { printDarkMode = backup.printDarkMode; savePrintDark(); document.body.classList.toggle('spr-print-dark', printDarkMode); }
    if (backup.cfRules && typeof backup.cfRules === 'object') {
      cfRules = Object.assign({}, cfRules, backup.cfRules);
      saveCfRules();
    }

    // Re-import rows to DB using same logic as CSV import
    if (Array.isArray(backup.rows) && backup.rows.length > 0) {
      setStatusSaving();
      let saved = 0; let failed = 0;
      for (const r of backup.rows) {
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
            notes: r.notes,
          });
          saved++;
        } catch (_err) { failed++; }
      }
      appendChangeLog({
        student_code: '', goal_code: '', column: 'Backup Restore',
        old_value: '', new_value: `Restored ${saved} rows from backup`, edit_type: 'backup-restore',
      });
      setStatusSaved();
      showToast(`Restore complete: ${saved} row${saved !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`);
    } else {
      showToast('Restore complete (no rows to re-import)');
    }

    await loadData();
    buildClassFilterOptions();
    buildGoalAreaFilterOptions();
    buildCaseManagerFilterOptions();
    buildDataCollectorFilterOptions();
    runValidation();
  }

  async function handleRestoreFile(file) {
    let backup;
    try {
      const text = await file.text();
      backup = JSON.parse(text);
    } catch (_e) {
      showToast('Invalid JSON backup file', '#ef4444');
      return;
    }
    if (!backup || !backup.backup_version) {
      showToast('Invalid backup file — missing backup_version', '#ef4444');
      return;
    }
    const studentCount = new Set((backup.rows || []).map(r => r.student_code).filter(Boolean)).size;
    const goalCount = (backup.rows || []).length;
    const customColCount = (backup.customColumns || []).length;

    // Auto-create pre-restore backup before asking for confirmation
    const preBackup = buildBackupObject();
    downloadFile(JSON.stringify(preBackup, null, 2), `spreadsheet_pre_restore_backup_${dateTag()}.json`, 'application/json');

    const confirmed = await rcConfirm(
      'Restore Backup',
      `Restore ${studentCount} student${studentCount !== 1 ? 's' : ''}, ${goalCount} goal${goalCount !== 1 ? 's' : ''}, and ${customColCount} custom column${customColCount !== 1 ? 's' : ''}?\n\nA pre-restore backup has been downloaded automatically. Your current data will be overwritten.`,
      'Restore'
    );
    if (!confirmed) return;

    await applyBackupObject(backup);
  }

  async function restoreAutoBackup() {
    let json;
    try {
      json = localStorage.getItem(RC_AUTO_BACKUP_LS);
    } catch (_e) {
      showToast('No auto-backup available', '#ef4444');
      return;
    }
    if (!json) {
      showToast('No auto-backup available', '#ef4444');
      return;
    }
    let backup;
    try {
      backup = JSON.parse(json);
    } catch (_e) {
      showToast('Auto-backup data is corrupted', '#ef4444');
      return;
    }
    const rawTimestamp = localStorage.getItem(RC_AUTO_BACKUP_TS_LS) || '';
    const timestamp = rawTimestamp ? new Date(rawTimestamp).toLocaleString() : 'unknown';

    // Auto-create pre-restore backup before confirmation
    const preBackup = buildBackupObject();
    downloadFile(JSON.stringify(preBackup, null, 2), `spreadsheet_pre_restore_backup_${dateTag()}.json`, 'application/json');

    const confirmed = await rcConfirm(
      'Restore Auto-Backup',
      `Restore from auto-backup saved at ${timestamp}? A pre-restore backup will be downloaded first.`,
      'Restore'
    );
    if (!confirmed) return;

    await applyBackupObject(backup);
  }

  function autoBackupIfNeeded() {
    try {
      editsSinceBackup++;
      if (editsSinceBackup >= AUTO_BACKUP_INTERVAL_EDITS) {
        const backup = buildBackupObject();
        localStorage.setItem(RC_AUTO_BACKUP_LS, JSON.stringify(backup));
        localStorage.setItem(RC_AUTO_BACKUP_TS_LS, new Date().toISOString());
        editsSinceBackup = 0;
        showToast('💾 Auto-backup saved', '#6366f1');
      }
    } catch (_e) { /* ignore localStorage errors (e.g. quota exceeded) */ }
  }

  // ─── Email Data Collectors ───────────────────────────────────────────────────

  function emailDataCollectors() {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emails = [...new Set(
      filteredRows
        .filter(r => !r._draft && r.data_collector_email)
        .map(r => r.data_collector_email.trim())
        .filter(e => emailPattern.test(e))
    )];
    if (!emails.length) {
      showToast('No data collector emails in current view', '#ef4444');
      return;
    }
    window.open('mailto:' + emails.join(','));
    showToast(`Opening email to ${emails.length} data collector${emails.length !== 1 ? 's' : ''}`);
  }

  // ─── CF Rules Modal ──────────────────────────────────────────────────────────

  function openCfRulesModal() {
    const overlay = document.getElementById('sprCfRulesOverlay');
    if (!overlay) return;
    // Populate inputs from current cfRules
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('sprCfGreenRatio',   cfRules.baselineGreenRatio);
    setVal('sprCfRedRatio',     cfRules.baselineRedRatio);
    setVal('sprCfRedDays',      cfRules.dateRedDays);
    setVal('sprCfOrangeDays',   cfRules.dateOrangeDays);
    setVal('sprCfYellowDays',   cfRules.dateYellowDays);
    overlay.classList.add('open');
  }

  function closeCfRulesModal() {
    const overlay = document.getElementById('sprCfRulesOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function saveCfRulesFromModal() {
    const getNum = (id, min, max) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const v = parseFloat(el.value);
      if (!Number.isFinite(v) || v < min || v > max) return null;
      return v;
    };
    const greenRatio   = getNum('sprCfGreenRatio',   0, 1);
    const redRatio     = getNum('sprCfRedRatio',     0, 1);
    const redDays      = getNum('sprCfRedDays',     -365, 365);
    const orangeDays   = getNum('sprCfOrangeDays',   0, 730);
    const yellowDays   = getNum('sprCfYellowDays',   0, 730);

    if (greenRatio === null || redRatio === null || redDays === null || orangeDays === null || yellowDays === null) {
      showToast('Please enter valid numbers in all fields', '#ef4444');
      return;
    }
    if (redRatio >= greenRatio) {
      showToast('Green ratio must be greater than red ratio', '#ef4444');
      return;
    }
    if (orangeDays >= yellowDays) {
      showToast('Orange days threshold must be less than yellow days threshold', '#ef4444');
      return;
    }

    cfRules = {
      baselineGreenRatio: greenRatio,
      baselineRedRatio:   redRatio,
      dateRedDays:        redDays,
      dateOrangeDays:     orangeDays,
      dateYellowDays:     yellowDays,
    };
    saveCfRules();
    renderSpreadsheet();
    closeCfRulesModal();
    showToast('Conditional formatting rules saved');
  }

  function resetCfRules() {
    cfRules = { ...CF_RULES_DEFAULTS };
    saveCfRules();
    renderSpreadsheet();
    closeCfRulesModal();
    showToast('Conditional formatting rules reset to defaults');
  }

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

    // Case manager filter
    const caseManagerEl = document.getElementById('sprCaseManagerFilter');
    if (caseManagerEl) {
      caseManagerEl.addEventListener('change', () => {
        caseManagerFilter = caseManagerEl.value;
        applyFilters();
        renderRows();
        updateCountStatus();
      });
    }

    // Data collector filter
    const dataCollectorEl = document.getElementById('sprDataCollectorFilter');
    if (dataCollectorEl) {
      dataCollectorEl.addEventListener('change', () => {
        dataCollectorFilter = dataCollectorEl.value;
        applyFilters();
        renderRows();
        updateCountStatus();
      });
    }

    // Warnings filter button
    const warningsBtn = document.getElementById('sprWarningsBtn');
    if (warningsBtn) {
      warningsBtn.addEventListener('click', () => {
        warningsOnlyFilter = !warningsOnlyFilter;
        warningsBtn.classList.toggle('spr-btn-active', warningsOnlyFilter);
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
    const moreToolsBtn = document.getElementById('sprMoreToolsBtn');
    const moreToolsDropdown = document.getElementById('sprMoreToolsDropdown');
    if (moreToolsBtn && moreToolsDropdown) {
      moreToolsBtn.addEventListener('click', e => {
        e.stopPropagation();
        moreToolsDropdown.classList.toggle('open');
      });
    }

    // Views dropdown
    const viewsBtn = document.getElementById('sprViewsBtn');
    const viewsDropdown = document.getElementById('sprViewsDropdown');
    if (viewsBtn && viewsDropdown) {
      viewsBtn.addEventListener('click', e => {
        e.stopPropagation();
        viewsDropdown.classList.toggle('open');
      });
    }
    const exportCsvBtn = document.getElementById('sprExportCsv');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCsv);
    const exportDistrictCsvBtn = document.getElementById('sprExportDistrictCsv');
    if (exportDistrictCsvBtn) exportDistrictCsvBtn.addEventListener('click', exportDistrictCsv);
    const exportJsonBtn = document.getElementById('sprExportJson');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportJson);
    const exportMdBtn = document.getElementById('sprExportMd');
    if (exportMdBtn) exportMdBtn.addEventListener('click', exportMarkdown);
    const exportPdfBtn = document.getElementById('sprExportPdf');
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportPdf);

    // Import
    const importBtn = document.getElementById('sprImportBtn');
    if (importBtn) {
      importBtn.title = 'Import CSV data (Ctrl+Shift+I)';
      importBtn.addEventListener('click', openImportModal);
    }

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
      document.querySelectorAll('.spr-col-dropdown.open,.spr-export-dropdown.open,.spr-more-menu.open,.spr-more-tools-dropdown.open,.spr-views-dropdown.open')
        .forEach(el => el.classList.remove('open'));
    });

    // Clear cell selection on outside click (outside the table)
    document.addEventListener('click', e => {
      if (!e.target.closest('#sprTableWrap') && !e.target.closest('.spr-bulk-toolbar')) {
        clearSelection();
        selAnchor = null;
      }
    });

    // Undo / Redo keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key.toLowerCase() !== 'z') return;
      // Let browser handle undo within active text inputs/textareas
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
          !activeEl.readOnly && !activeEl.disabled) return;
      e.preventDefault();
      if (e.shiftKey) {
        performRedo();
      } else {
        performUndo();
      }
    });

    // Close import modal on backdrop click
    const importOverlay = document.getElementById('sprImportOverlay');
    if (importOverlay) {
      importOverlay.addEventListener('click', e => {
        if (e.target === importOverlay) closeImportModal();
      });
    }

    // Add Column button
    const addColBtn = document.getElementById('sprAddColBtn');
    if (addColBtn) addColBtn.addEventListener('click', openAddColumnModal);

    // Add Column modal
    const addColOverlay = document.getElementById('sprAddColOverlay');
    if (addColOverlay) {
      addColOverlay.addEventListener('click', e => { if (e.target === addColOverlay) closeAddColumnModal(); });
      const cancelBtn = addColOverlay.querySelector('#sprAddColCancelBtn');
      const confirmBtn = addColOverlay.querySelector('#sprAddColConfirmBtn');
      const typeSelect = addColOverlay.querySelector('#sprColType');
      const optionsWrap = addColOverlay.querySelector('#sprColOptionsWrap');
      if (cancelBtn) cancelBtn.addEventListener('click', closeAddColumnModal);
      if (confirmBtn) confirmBtn.addEventListener('click', handleAddColumn);
      if (typeSelect && optionsWrap) {
        typeSelect.addEventListener('change', () => {
          optionsWrap.style.display = (typeSelect.value === 'select' || typeSelect.value === 'select-custom') ? '' : 'none';
        });
      }
      addColOverlay.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeAddColumnModal();
      });
    }

    // Change Log button
    const changeLogBtn = document.getElementById('sprChangeLogBtn');
    if (changeLogBtn) {
      changeLogBtn.title = 'View change history (Ctrl+Shift+L)';
      changeLogBtn.addEventListener('click', openChangeLogModal);
    }

    // Change Log modal
    const changeLogOverlay = document.getElementById('sprChangeLogOverlay');
    if (changeLogOverlay) {
      changeLogOverlay.addEventListener('click', e => { if (e.target === changeLogOverlay) closeChangeLogModal(); });
      changeLogOverlay.addEventListener('keydown', e => { if (e.key === 'Escape') closeChangeLogModal(); });
      const closeBtn = changeLogOverlay.querySelector('#sprChangeLogCloseBtn');
      const clearBtn = changeLogOverlay.querySelector('#sprChangeLogClearBtn');
      const downloadBtn = changeLogOverlay.querySelector('#sprChangeLogDownloadBtn');
      if (closeBtn) closeBtn.addEventListener('click', closeChangeLogModal);
      if (clearBtn) clearBtn.addEventListener('click', clearChangeLog);
      if (downloadBtn) downloadBtn.addEventListener('click', downloadChangeLog);
    }

    // Backup button
    const backupBtn = document.getElementById('sprBackupBtn');
    if (backupBtn) {
      backupBtn.title = 'Download full backup as JSON (Ctrl+Shift+B)';
      backupBtn.addEventListener('click', () => backupData());
    }

    // Restore button + hidden file input
    const restoreBtn = document.getElementById('sprRestoreBtn');
    if (restoreBtn) restoreBtn.addEventListener('click', triggerRestore);
    const restoreInput = document.getElementById('sprRestoreInput');
    if (restoreInput) {
      restoreInput.addEventListener('change', () => {
        if (restoreInput.files[0]) handleRestoreFile(restoreInput.files[0]);
      });
    }

    // Restore Auto-Backup button
    const restoreAutoBackupBtn = document.getElementById('sprRestoreAutoBackupBtn');
    if (restoreAutoBackupBtn) restoreAutoBackupBtn.addEventListener('click', restoreAutoBackup);

    // Email Data Collectors button
    const emailDataCollectorsBtn = document.getElementById('sprEmailDataCollectorsBtn');
    if (emailDataCollectorsBtn) emailDataCollectorsBtn.addEventListener('click', emailDataCollectors);

    // Colors toggle button
    const colorsBtn = document.getElementById('sprColorsBtn');
    if (colorsBtn) {
      // Set initial state
      colorsBtn.style.opacity = colorsEnabled ? '' : '0.5';
      colorsBtn.title = colorsEnabled
        ? 'Click to disable conditional formatting'
        : 'Click to enable conditional formatting';
      colorsBtn.addEventListener('click', () => {
        colorsEnabled = !colorsEnabled;
        saveColors();
        colorsBtn.style.opacity = colorsEnabled ? '' : '0.5';
        colorsBtn.title = colorsEnabled
          ? 'Click to disable conditional formatting'
          : 'Click to enable conditional formatting';
        renderSpreadsheet();
      });
    }

    // Compare CSV button + modal
    const compareCsvBtn = document.getElementById('sprCompareCsvBtn');
    if (compareCsvBtn) {
      compareCsvBtn.title = 'Compare a CSV file against current data (read-only) (Ctrl+Shift+D)';
      compareCsvBtn.addEventListener('click', openCompareCsvModal);
    }

    const compareOverlay = document.getElementById('sprCompareOverlay');
    if (compareOverlay) {
      compareOverlay.addEventListener('click', e => { if (e.target === compareOverlay) closeCompareCsvModal(); });
      compareOverlay.addEventListener('keydown', e => { if (e.key === 'Escape') closeCompareCsvModal(); });
      const closeBtn = compareOverlay.querySelector('#sprCompareCloseBtn');
      if (closeBtn) closeBtn.addEventListener('click', closeCompareCsvModal);
    }

    const compareDropZone = document.getElementById('sprCompareDropZone');
    const compareFileInput = document.getElementById('sprCompareFileInput');
    if (compareDropZone && compareFileInput) {
      compareDropZone.addEventListener('click', () => compareFileInput.click());
      compareDropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') compareFileInput.click(); });
      compareDropZone.addEventListener('dragover', e => { e.preventDefault(); compareDropZone.classList.add('drag-over'); });
      compareDropZone.addEventListener('dragleave', () => compareDropZone.classList.remove('drag-over'));
      compareDropZone.addEventListener('drop', e => {
        e.preventDefault();
        compareDropZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files[0];
        if (file) handleCompareCsvFile(file);
      });
      compareFileInput.addEventListener('change', () => {
        if (compareFileInput.files[0]) handleCompareCsvFile(compareFileInput.files[0]);
      });
    }

    // Collapse All / Expand All button
    const collapseAllBtn = document.getElementById('sprCollapseAllBtn');
    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => {
        // Build goal count map in a single pass
        const goalCountMap = {};
        for (const r of allRows) {
          if (r.student_code && r._goal_active !== false) {
            goalCountMap[r.student_code] = (goalCountMap[r.student_code] || 0) + 1;
          }
        }
        const studentsWithMultipleGoals = Object.keys(goalCountMap).filter(code => goalCountMap[code] > 1);
        const anyExpanded = studentsWithMultipleGoals.some(code => !collapsedStudents.has(code));
        if (anyExpanded) {
          studentsWithMultipleGoals.forEach(code => collapsedStudents.add(code));
          collapseAllBtn.textContent = '⊞ Expand All';
        } else {
          collapsedStudents.clear();
          collapseAllBtn.textContent = '⊟ Collapse All';
        }
        saveCollapsedStudents();
        renderRows();
        updateCountStatus();
      });
    }

    // Global keyboard shortcuts (Ctrl/Cmd+Shift+key)
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;
      const key = e.key.toUpperCase();
      if (key === 'L') { e.preventDefault(); openChangeLogModal(); }
      else if (key === 'B') { e.preventDefault(); backupData(); }
      else if (key === 'I') { e.preventDefault(); openImportModal(); }
      else if (key === 'D') { e.preventDefault(); openCompareCsvModal(); }
      else if (key === 'V') {
        e.preventDefault();
        const vd = document.getElementById('sprViewsDropdown');
        if (vd) vd.classList.toggle('open');
      }
    });

    // Beforeunload warning for pending drafts
    window.addEventListener('beforeunload', e => {
      if (draftRows.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Compare Apply button
    const compareApplyBtn = document.getElementById('sprCompareApplyBtn');
    if (compareApplyBtn) compareApplyBtn.addEventListener('click', applyCompareChanges);

    // Print Dark Mode toggle
    const printDarkToggle = document.getElementById('sprPrintDarkToggle');
    if (printDarkToggle) {
      printDarkToggle.textContent = printDarkMode ? '🌙 Print Dark Mode: On' : '🌙 Print Dark Mode: Off';
      printDarkToggle.addEventListener('click', e => {
        e.stopPropagation(); // keep dropdown open
        printDarkMode = !printDarkMode;
        savePrintDark();
        printDarkToggle.textContent = printDarkMode ? '🌙 Print Dark Mode: On' : '🌙 Print Dark Mode: Off';
        document.body.classList.toggle('spr-print-dark', printDarkMode);
        showToast(printDarkMode ? 'Print will use dark theme' : 'Print will use light theme');
      });
      if (printDarkMode) document.body.classList.add('spr-print-dark');
    }

    // CF Rules button + modal
    const cfRulesBtn = document.getElementById('sprCfRulesBtn');
    if (cfRulesBtn) cfRulesBtn.addEventListener('click', openCfRulesModal);

    const cfRulesOverlay = document.getElementById('sprCfRulesOverlay');
    if (cfRulesOverlay) {
      cfRulesOverlay.addEventListener('click', e => { if (e.target === cfRulesOverlay) closeCfRulesModal(); });
      cfRulesOverlay.addEventListener('keydown', e => { if (e.key === 'Escape') closeCfRulesModal(); });
      const saveBtn = cfRulesOverlay.querySelector('#sprCfRulesSaveBtn');
      const cancelBtn = cfRulesOverlay.querySelector('#sprCfRulesCancelBtn');
      const resetBtn = cfRulesOverlay.querySelector('#sprCfRulesResetBtn');
      if (saveBtn)   saveBtn.addEventListener('click', saveCfRulesFromModal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeCfRulesModal);
      if (resetBtn)  resetBtn.addEventListener('click', resetCfRules);
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────

  function checkLocalStorageUsage() {
    try {
      const keys = [COL_WIDTHS_LS, RC_CUSTOM_COLS_LS, RC_CUSTOM_DATA_LS, RC_ROW_ORDER_LS,
                    RC_CHANGELOG_LS, RC_HIDDEN_COLS_LS, RC_COLORS_LS, RC_CUSTOM_OPTS_LS,
                    RC_AUTO_BACKUP_LS, RC_AUTO_BACKUP_TS_LS, RC_COL_ORDER_LS, RC_VIEWS_LS, RC_COLLAPSED_LS,
                    RC_CELL_COMMENTS_LS, RC_CELL_TIMESTAMPS_LS, RC_PRINT_DARK_LS, RC_CF_RULES_LS];
      let totalBytes = 0;
      for (const k of keys) {
        const val = localStorage.getItem(k);
        if (val) totalBytes += k.length + val.length;
      }
      const totalMB = (totalBytes * 2) / (1024 * 1024); // ~2 bytes per char (UTF-16 approximation)
      if (totalMB > 4) {
        console.warn(`[tc-spreadsheet] localStorage usage is ${totalMB.toFixed(2)} MB — approaching browser limit`);
        showToast('⚠️ Storage is getting full. Consider clearing the change log.', '#f97316');
      }
    } catch (_e) { /* ignore */ }
  }

  async function init() {
    await loadSettingsFromDb();
    loadColWidths();
    loadCustomCols();
    loadCustomData();
    loadRowOrder();
    loadHiddenCols();
    loadChangeLog();
    loadColors();
    loadCustomOptions();
    loadColumnOrder();
    loadViews();
    loadCollapsedStudents();
    loadCellComments();
    loadCellTimestamps();
    loadPrintDark();
    loadCfRules();
    renderViewsDropdown();
    setupEventHandlers();
    setupKeyboardNavigation();
    setupRowDragHandlers();
    loadData().then(() => {
      buildClassFilterOptions();
      buildGoalAreaFilterOptions();
      buildCaseManagerFilterOptions();
      buildDataCollectorFilterOptions();
      runValidation();
      checkLocalStorageUsage();
      // Capture initial state as auto-backup on first load
      editsSinceBackup = AUTO_BACKUP_INTERVAL_EDITS;
      autoBackupIfNeeded();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
