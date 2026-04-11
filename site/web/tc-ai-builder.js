/* global JSZip */
/**
 * tc-ai-builder.js
 * Teacher Center AI Builder — generate individualized ELA/Life Skills
 * assignments and presentations via Claude (Anthropic API).
 * Student and goal data is pulled live from Supabase via the Netlify function.
 */

(async () => {
  'use strict';

  // Page guard — only run on AI Builder page
  if (!location.pathname.startsWith('/teacher/ai-builder')) return;

  console.log('[tc-ai-builder] Initializing');

  // Import data adapter
  const { db } = await import('/web/data-adapter.js');

  // ── DOM references ──────────────────────────────────────────────────────────

  const typeBtnAssignments = document.getElementById('typeBtnAssignments');
  const typeBtnPresentations = document.getElementById('typeBtnPresentations');
  const typeBtnBoth = document.getElementById('typeBtnBoth');
  const typeBtnDataProbe = document.getElementById('typeBtnDataProbe');

  const aibWeek = document.getElementById('aibWeek');
  const aibChapters = document.getElementById('aibChapters');
  const aibSubject = document.getElementById('aibSubject');
  const aibTheme = document.getElementById('aibTheme');
  const aibScope = document.getElementById('aibScope');
  const aibPresScope = document.getElementById('aibPresScope');
  const aibPresentation = document.getElementById('aibPresentation');
  const aibAssignOptions = document.getElementById('aibAssignOptions');
  const aibAssignDays = document.getElementById('aibAssignDays');
  const aibAssignDifficulty = document.getElementById('aibAssignDifficulty');
  const aibAssignFormat = document.getElementById('aibAssignFormat');
  const aibAssignInstructions = document.getElementById('aibAssignInstructions');
  const aibPresOptions = document.getElementById('aibPresOptions');
  const aibPresSlides = document.getElementById('aibPresSlides');
  const aibPresStyle = document.getElementById('aibPresStyle');
  const aibPresAudience = document.getElementById('aibPresAudience');
  const aibPresInstructions = document.getElementById('aibPresInstructions');
  const aibModel = document.getElementById('aibModel');

  const aibProbeSection = document.getElementById('aibProbeSection');
  const aibProbeStudent = document.getElementById('aibProbeStudent');
  const aibProbeGoals = document.getElementById('aibProbeGoals');
  const aibProbeCount = document.getElementById('aibProbeCount');

  const aibExtraStudents = document.getElementById('aibExtraStudents');

  const aibSource = document.getElementById('aibSource');
  const aibSourceFile = document.getElementById('aibSourceFile');
  const aibSourceFileName = document.getElementById('aibSourceFileName');

  const aibImgSection = document.getElementById('aibImgSection');
  const aibImgDrop = document.getElementById('aibImgDrop');
  const aibImgInput = document.getElementById('aibImgInput');
  const aibImgThumbs = document.getElementById('aibImgThumbs');

  const aibLibSearch = document.getElementById('aibLibSearch');
  const aibLibSearchBtn = document.getElementById('aibLibSearchBtn');
  const aibLibResults = document.getElementById('aibLibResults');
  const aibLibSelected = document.getElementById('aibLibSelected');

  const aibGenerateBtn = document.getElementById('aibGenerateBtn');
  const aibProgress = document.getElementById('aibProgress');
  const aibProgressText = document.getElementById('aibProgressText');
  const aibMsg = document.getElementById('aibMsg');

  const aibOutputCard = document.getElementById('aibOutputCard');
  const aibOutput = document.getElementById('aibOutput');
  const aibOutputMsg = document.getElementById('aibOutputMsg');
  const aibSendToWorkBtn = document.getElementById('aibSendToWorkBtn');
  const aibDownloadZipBtn = document.getElementById('aibDownloadZipBtn');
  const aibCopyBtn = document.getElementById('aibCopyBtn');

  const aibIssueCard = document.getElementById('aibIssueCard');
  const aibIssueClass = document.getElementById('aibIssueClass');
  const aibIssueTitle = document.getElementById('aibIssueTitle');
  const aibIssueDue = document.getElementById('aibIssueDue');
  const aibIssueBtn = document.getElementById('aibIssueBtn');
  const aibIssueMsg = document.getElementById('aibIssueMsg');

  const aibSourceCount = document.getElementById('aibSourceCount');
  const aibExtraStudentsWarn = document.getElementById('aibExtraStudentsWarn');

  const aibStandardsCallout = document.getElementById('aibStandardsCallout');

  // Tab elements
  const aibTabCreate = document.getElementById('aibTabCreate');
  const aibTabManage = document.getElementById('aibTabManage');
  const aibCreatePanel = document.getElementById('aibCreatePanel');
  const aibManagePanel = document.getElementById('aibManagePanel');

  // ── State ───────────────────────────────────────────────────────────────────

  let currentTaskType = 'assignments';
  const uploadedImages = [];
  let selectedLibRef = null;
  let cachedStudents = [];
  let cachedGoals = [];
  const AIB_PREFS_KEY = 'rc_aib_prefs_v1';
  let savedScopeValue = null;
  let lastOutputs = [];
  let regeneratingFromId = null;
  const selectedIds = new Set();

  // UUID format validation pattern (reused throughout)
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'aib-msg ' + type;
    el.style.display = 'block';
  }

  function hideMsg(el) {
    el.style.display = 'none';
    el.textContent = '';
  }

  function setProgress(visible, text) {
    if (visible) {
      aibProgress.classList.add('visible');
      if (text) aibProgressText.textContent = text;
    } else {
      aibProgress.classList.remove('visible');
    }
  }

  function restorePrefs() {
    try {
      const raw = localStorage.getItem(AIB_PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs.week && aibWeek) aibWeek.value = prefs.week;
      if (prefs.chapters && aibChapters) aibChapters.value = prefs.chapters;
      if (prefs.subject && aibSubject) aibSubject.value = prefs.subject;
      if (prefs.theme && aibTheme) aibTheme.value = prefs.theme;
      // Scope options are populated asynchronously; save value for deferred restore
      if (prefs.scope) savedScopeValue = prefs.scope;
      if (prefs.model && aibModel) aibModel.value = prefs.model;
      if (prefs.taskType) {
        currentTaskType = prefs.taskType;
      }
    } catch (e) {
      console.warn('[tc-ai-builder] Could not restore preferences:', e.message);
    }
  }

  function savePrefs() {
    try {
      const prefs = {
        week: (aibWeek.value || '').trim(),
        chapters: (aibChapters.value || '').trim(),
        subject: aibSubject ? aibSubject.value : 'ELA',
        theme: (aibTheme.value || '').trim(),
        scope: aibScope.value,
        model: aibModel.value,
        taskType: currentTaskType,
      };
      localStorage.setItem(AIB_PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('[tc-ai-builder] localStorage quota exceeded');
        showMsg(aibMsg, '⚠ Preferences could not be saved (storage full).', 'err');
      }
    }
  }

  function updateTypeUI() {
    [typeBtnAssignments, typeBtnPresentations, typeBtnBoth, typeBtnDataProbe].forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === currentTaskType);
    });

    const showImages = currentTaskType === 'presentations' || currentTaskType === 'both';
    aibImgSection.style.display = showImages ? 'block' : 'none';

    const showPresScope = currentTaskType === 'presentations' || currentTaskType === 'both';
    aibPresScope.style.display = showPresScope ? 'block' : 'none';

    const showAssignOpts = currentTaskType === 'assignments' || currentTaskType === 'both';
    if (aibAssignOptions) aibAssignOptions.style.display = showAssignOpts ? 'block' : 'none';
    const showPresOpts = currentTaskType === 'presentations' || currentTaskType === 'both';
    if (aibPresOptions) aibPresOptions.style.display = showPresOpts ? 'block' : 'none';

    aibProbeSection.style.display = currentTaskType === 'dataProbe' ? 'block' : 'none';
  }

  // ── Tab Switching ────────────────────────────────────────────────────────────

  function switchTab(tab) {
    const isCreate = tab === 'create';
    if (aibTabCreate) aibTabCreate.classList.toggle('active', isCreate);
    if (aibTabManage) aibTabManage.classList.toggle('active', !isCreate);
    if (aibCreatePanel) aibCreatePanel.style.display = isCreate ? '' : 'none';
    if (aibManagePanel) aibManagePanel.style.display = isCreate ? 'none' : '';
    if (!isCreate) {
      if (regeneratingFromId) {
        regeneratingFromId = null;
        hideMsg(aibMsg);
      }
      loadHistory();
    }
  }

  if (aibTabCreate) aibTabCreate.addEventListener('click', () => switchTab('create'));
  if (aibTabManage) aibTabManage.addEventListener('click', () => switchTab('manage'));

  const aibHistoryRefreshBtn = document.getElementById('aibHistoryRefreshBtn');
  if (aibHistoryRefreshBtn) aibHistoryRefreshBtn.addEventListener('click', () => loadHistory());

  const aibHistoryStatus = document.getElementById('aibHistoryStatus');
  const aibHistorySubject = document.getElementById('aibHistorySubject');
  const aibHistoryWeek = document.getElementById('aibHistoryWeek');
  const aibHistoryType = document.getElementById('aibHistoryType');
  const aibHistorySort = document.getElementById('aibHistorySort');
  const aibHistoryClearFilters = document.getElementById('aibHistoryClearFilters');

  if (aibHistoryStatus) aibHistoryStatus.addEventListener('change', loadHistory);
  if (aibHistorySubject) aibHistorySubject.addEventListener('change', loadHistory);
  if (aibHistoryWeek) {
    let weekDebounce;
    aibHistoryWeek.addEventListener('input', () => {
      clearTimeout(weekDebounce);
      weekDebounce = setTimeout(loadHistory, 400);
    });
  }
  if (aibHistoryType) aibHistoryType.addEventListener('change', () => renderHistoryCards(applyClientFilters(lastOutputs)));
  if (aibHistorySort) aibHistorySort.addEventListener('change', () => renderHistoryCards(applyClientFilters(lastOutputs)));
  if (aibHistoryClearFilters) {
    aibHistoryClearFilters.addEventListener('click', () => {
      if (aibHistoryStatus) aibHistoryStatus.value = '';
      if (aibHistorySubject) aibHistorySubject.value = '';
      if (aibHistoryWeek) aibHistoryWeek.value = '';
      if (aibHistoryType) aibHistoryType.value = '';
      if (aibHistorySort) aibHistorySort.value = 'newest';
      loadHistory();
    });
  }

  // ── School year helper ───────────────────────────────────────────────────────

  // Compute current calendar week (Sunday-start, Jan 1 = week 1)
  function getCurrentCalendarWeek() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const startDay = Date.UTC(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((nowDay - startDay) / 86400000);
    return Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
  }

  function getSchoolYear() {
    const now = new Date();
    const month = now.getMonth() + 1; // 1–12
    const year = now.getFullYear();
    const startYear = month >= 8 ? year : year - 1;
    return startYear + '-' + (startYear + 1);
  }

  // ── hashSource helper ────────────────────────────────────────────────────────

  async function hashSource(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── History loading ──────────────────────────────────────────────────────────

  // In-memory cache for lazily-fetched content (keyed by output id)
  const historyContentCache = new Map();

  function relativeTime(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    const now = new Date();
    const diffMs = now - date;
    if (diffMs < 0) return 'just now';
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return diffMin + ' min ago';
    if (diffHr < 24) return diffHr + ' hour' + (diffHr === 1 ? '' : 's') + ' ago';
    if (diffDay < 7) return diffDay + ' day' + (diffDay === 1 ? '' : 's') + ' ago';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Helper: fetch content for a history record, using cache
  async function fetchContent(id) {
    if (historyContentCache.has(id)) return historyContentCache.get(id);
    const detailRes = await fetch('/.netlify/functions/teacher-ai-builder-history-detail?id=' + encodeURIComponent(id), { credentials: 'same-origin' });
    const detailData = await detailRes.json().catch(() => ({}));
    if (!detailRes.ok || !detailData.ok) throw new Error(detailData.error || 'Failed to load content');
    historyContentCache.set(id, detailData.content || '');
    return historyContentCache.get(id);
  }

  // Escape HTML entities to prevent XSS when injecting text into innerHTML
  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Shorten model name: strip "claude-" prefix and date suffix
  function shortModelName(model) {
    if (!model) return '';
    let s = String(model);
    s = s.replace(/^claude-/i, '');
    // Strip trailing date suffix like -20250514
    s = s.replace(/-\d{8}$/, '');
    // Capitalize first letter of each segment
    return s.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  // Apply client-side type and sort filters to an outputs array
  function applyClientFilters(outputs) {
    let result = outputs.slice();
    const typeEl = document.getElementById('aibHistoryType');
    const sortEl = document.getElementById('aibHistorySort');
    const typeVal = typeEl ? typeEl.value : '';
    const sortVal = sortEl ? sortEl.value : 'newest';

    if (typeVal) {
      result = result.filter((o) => o.task_type === typeVal);
    }

    if (sortVal === 'oldest') {
      result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortVal === 'week-desc') {
      result.sort((a, b) => (parseInt(b.week, 10) || 0) - (parseInt(a.week, 10) || 0));
    } else if (sortVal === 'week-asc') {
      result.sort((a, b) => (parseInt(a.week, 10) || 0) - (parseInt(b.week, 10) || 0));
    } else {
      // newest first (default)
      result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    return result;
  }

  function renderHistoryCards(outputs) {
    const historyList = document.getElementById('aibHistoryList');
    if (!historyList) return;
    historyList.innerHTML = '';

    if (!outputs || outputs.length === 0) {
      historyList.innerHTML =
        '<div class="aib-manage-empty">' +
          '<div class="aib-manage-empty-icon">📋</div>' +
          '<p style="margin:0 0 8px 0;font-weight:500;">No generations found for this school year.</p>' +
          '<p style="margin:0;opacity:0.7;">Create your first assignment or presentation in the <strong>Create</strong> tab.</p>' +
        '</div>';
      return;
    }

    // Validate a value against an allowlist; return fallback if not in list
    const allowedStatuses = ['active', 'superseded', 'archived'];
    const allowedTypes = ['assignments', 'presentations', 'both', 'dataProbe'];

    const taskLabels = { assignments: 'Assignments', presentations: 'Presentations', both: 'Both', dataProbe: 'Data Probe' };

    outputs.forEach((o) => {
      const card = document.createElement('div');
      card.className = 'aib-history-card';

      // Validate DB enum values before using in CSS class names or HTML attributes
      const taskType = allowedTypes.includes(o.task_type) ? o.task_type : 'assignments';
      const status = allowedStatuses.includes(o.status) ? o.status : 'active';
      // UUID format validation for use in element IDs and data attributes
      const safeId = /^[0-9a-f-_]{1,64}$/i.test(String(o.id || '')) ? String(o.id) : '';

      card.dataset.type = taskType;
      card.dataset.status = status;

      const statusClass = 'aib-badge-' + status;
      const typeClass = 'aib-badge-' + taskType;
      const taskLabel = taskLabels[taskType];

      // Build title based on task type
      let title;
      if (taskType === 'dataProbe') {
        title = 'Data Probe' + (o.student_codes && o.student_codes.length ? ' — ' + esc(o.student_codes[0]) : '');
      } else if (taskType === 'presentations') {
        title = 'Week ' + esc(o.week) + ' Presentation' + (o.theme ? ' — ' + esc(o.theme) : '');
      } else {
        title = 'Week ' + esc(o.week) + (o.theme ? ' — ' + esc(o.theme) : '');
      }

      const studentCount = Array.isArray(o.student_codes) ? o.student_codes.length : 0;
      const goalCount = Array.isArray(o.goal_codes) ? o.goal_codes.length : 0;
      const modelShort = shortModelName(o.model);

      // Build detail chips
      const chips =
        '<span class="aib-detail-chip">👥 ' + studentCount + ' student' + (studentCount === 1 ? '' : 's') + '</span>' +
        '<span class="aib-detail-chip">🎯 ' + goalCount + ' goal' + (goalCount === 1 ? '' : 's') + '</span>' +
        (o.chapters ? '<span class="aib-detail-chip">📚 Ch. ' + esc(o.chapters) + '</span>' : '') +
        (modelShort ? '<span class="aib-detail-chip">🤖 ' + esc(modelShort) + '</span>' : '') +
        (o.scope ? '<span class="aib-detail-chip">🏫 ' + esc(o.scope) + '</span>' : '') +
        (o.week ? '<span class="aib-detail-chip">📅 Week ' + esc(String(o.week)) + '</span>' : '');

      // Show Re-Issue button only for task types that produce issuable content
      const showReissue = taskType === 'assignments' || taskType === 'both' || taskType === 'dataProbe';

      // Validate superseded_by UUID for safe display
      const safeSupersededBy = o.superseded_by && UUID_PATTERN.test(String(o.superseded_by)) ? String(o.superseded_by) : '';

      card.innerHTML =
        '<div class="aib-history-meta">' +
          (safeId ? '<input type="checkbox" class="aib-card-checkbox" data-id="' + safeId + '" aria-label="Select this card" />' : '') +
          '<span class="aib-badge ' + typeClass + '">' + esc(taskLabel) + '</span>' +
          '<span class="aib-badge">' + esc(o.subject || 'ELA') + '</span>' +
          '<span class="aib-badge ' + statusClass + '">' + esc(status) + '</span>' +
          '<span style="font-size:12px;color:var(--rc-ink-dim);margin-left:auto;">' + esc(relativeTime(o.created_at)) + '</span>' +
        '</div>' +
        '<div class="aib-history-title" style="font-weight:600;font-size:16px;margin-bottom:8px;line-height:1.4;">' + title + '</div>' +
        (safeSupersededBy ? '<span class="aib-superseded-link">↪ Superseded by newer version</span>' : '') +
        '<div class="aib-detail-chips">' + chips + '</div>' +
        (safeId ? '<div class="aib-history-preview" id="aibHistPreview_' + safeId + '"></div>' : '<div class="aib-history-preview"></div>') +
        '<div class="aib-history-actions">' +
          (safeId ? '<button class="aib-btn" type="button" data-id="' + safeId + '" data-action="expand">🔍 Expand</button>' : '') +
          '<button class="aib-btn" type="button"' + (safeId ? ' data-id="' + safeId + '"' : '') + ' data-action="copy">📋 Copy</button>' +
          (safeId ? '<button class="aib-btn" type="button" data-id="' + safeId + '" data-action="regenerate">🔄 Regenerate</button>' : '') +
          (safeId && showReissue ? '<button class="aib-btn" type="button" data-id="' + safeId + '" data-action="reissue">📤 Re-Issue</button>' : '') +
          (safeId && status !== 'archived' ? '<button class="aib-btn" type="button" data-id="' + safeId + '" data-action="archive">🗄️ Archive</button>' : '') +
          (safeId ? '<button class="aib-btn" type="button" data-id="' + safeId + '" data-action="delete">🗑️ Delete</button>' : '') +
        '</div>';

      // Expand/collapse/copy/regenerate/reissue/archive/delete/checkbox handler
      card.addEventListener('click', async (e) => {
        // Handle checkbox separately (it's a change on input, but click bubbles here)
        const checkbox = e.target.closest('.aib-card-checkbox');
        if (checkbox) {
          const cbId = checkbox.dataset.id;
          if (!cbId) return;
          if (checkbox.checked) {
            selectedIds.add(cbId);
          } else {
            selectedIds.delete(cbId);
          }
          updateBulkBar();
          return;
        }

        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'expand') {
          const previewEl2 = document.getElementById('aibHistPreview_' + id);
          if (!previewEl2) return;
          if (historyContentCache.has(id)) {
            previewEl2.classList.add('expanded');
            previewEl2.textContent = historyContentCache.get(id);
            btn.textContent = '🔼 Collapse';
            btn.dataset.action = 'collapse';
          } else {
            btn.disabled = true;
            btn.textContent = 'Loading…';
            fetchContent(id).then((content) => {
              previewEl2.classList.add('expanded');
              previewEl2.textContent = content;
              btn.textContent = '🔼 Collapse';
              btn.dataset.action = 'collapse';
              btn.disabled = false;
            }).catch((err) => {
              btn.textContent = '🔍 Expand';
              btn.disabled = false;
              if (previewEl2) {
                previewEl2.textContent = '⚠ Failed to load — try again';
                previewEl2.classList.add('expanded');
                previewEl2.style.color = '#fca5a5';
                setTimeout(function() { previewEl2.textContent = ''; previewEl2.classList.remove('expanded'); previewEl2.style.color = ''; }, 3000);
              }
              console.warn('[tc-ai-builder] Failed to load content:', err.message);
            });
          }
        } else if (action === 'collapse') {
          const previewEl2 = document.getElementById('aibHistPreview_' + id);
          if (!previewEl2) return;
          previewEl2.classList.remove('expanded');
          previewEl2.textContent = '';
          btn.textContent = '🔍 Expand';
          btn.dataset.action = 'expand';
        } else if (action === 'copy') {
          if (!id) return;
          const doCopy = (content) => {
            navigator.clipboard.writeText(content || '').then(() => {
              const orig = btn.textContent;
              btn.textContent = '✅ Copied!';
              setTimeout(() => { btn.textContent = orig; }, 2000);
            }).catch(() => {
              btn.textContent = 'Copy failed';
            });
          };
          if (!historyContentCache.has(id)) {
            btn.disabled = true;
            btn.textContent = 'Loading…';
            fetchContent(id).then((content) => {
              btn.disabled = false;
              btn.textContent = '📋 Copy';
              doCopy(content);
            }).catch((err) => {
              btn.disabled = false;
              btn.textContent = '📋 Copy';
              console.warn('[tc-ai-builder] Failed to load content for copy:', err.message);
            });
          } else {
            doCopy(historyContentCache.get(id));
          }
        } else if (action === 'regenerate') {
          regeneratingFromId = id;
          const o = lastOutputs.find((x) => x.id === id);
          switchTab('create');
          if (o) {
            if (aibWeek && o.week) aibWeek.value = o.week;
            if (aibChapters && o.chapters) aibChapters.value = o.chapters;
            if (aibSubject && o.subject) aibSubject.value = o.subject;
            if (aibTheme && o.theme) aibTheme.value = o.theme;
            if (aibScope && o.scope) aibScope.value = o.scope;
            if (aibModel && o.model) aibModel.value = o.model;
            if (o.task_type) {
              currentTaskType = o.task_type;
              updateTypeUI();
            }
          }
          showMsg(aibMsg, '🔄 Regenerating — the next generation will supersede the previous version.', 'info');
          if (aibCreatePanel) aibCreatePanel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        } else if (action === 'reissue') {
          const loadAndReissue = async () => {
            btn.disabled = true;
            btn.textContent = 'Loading…';
            try {
              const content = await fetchContent(id);
              switchTab('create');
              if (aibOutput) aibOutput.value = content;
              if (aibOutputCard) aibOutputCard.style.display = 'block';
              const o = lastOutputs.find((x) => x.id === id);
              if (o && aibIssueTitle) {
                const reissueTitle = o.task_type === 'dataProbe'
                  ? 'Data Probe — ' + (o.student_codes?.[0] || '')
                  : 'Week ' + (o.week || '') + (o.theme ? ' — ' + o.theme : '') + ' — Re-Issued';
                aibIssueTitle.value = reissueTitle;
              }
              if (aibIssueCard) aibIssueCard.style.display = 'block';
              if (aibCopyBtn) aibCopyBtn.style.display = 'inline-flex';
              if (aibIssueCard) aibIssueCard.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            } catch (err) {
              console.warn('[tc-ai-builder] Re-issue load failed:', err.message);
            } finally {
              btn.disabled = false;
              btn.textContent = '📤 Re-Issue';
            }
          };
          loadAndReissue();
        } else if (action === 'archive') {
          const confirmed = await rcConfirm('Archive Generation', 'Archive this generation? It will be hidden from active view but not deleted.', 'Archive');
          if (!confirmed) return;
          btn.disabled = true;
          btn.textContent = '…';
          try {
            const archiveRes = await fetch('/.netlify/functions/teacher-ai-builder-update', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ ids: [id], status: 'archived' }),
            });
            const archiveData = await archiveRes.json().catch(() => ({}));
            if (!archiveRes.ok || !archiveData.ok) {
              console.warn('[tc-ai-builder] Archive failed:', archiveData.error || archiveRes.status);
            }
          } catch (err) {
            console.warn('[tc-ai-builder] Archive error:', err.message);
          }
          loadHistory();
        } else if (action === 'delete') {
          const confirmed = await rcConfirm('Delete Generation', 'Permanently delete this generation? This cannot be undone.', 'Delete', { danger: true });
          if (!confirmed) return;
          btn.disabled = true;
          btn.textContent = '…';
          try {
            const deleteRes = await fetch('/.netlify/functions/teacher-ai-builder-update', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ ids: [id] }),
            });
            const deleteData = await deleteRes.json().catch(() => ({}));
            if (!deleteRes.ok || !deleteData.ok) {
              console.warn('[tc-ai-builder] Delete failed:', deleteData.error || deleteRes.status);
            }
          } catch (err) {
            console.warn('[tc-ai-builder] Delete error:', err.message);
          }
          // Remove from selectedIds if present
          selectedIds.delete(id);
          updateBulkBar();
          loadHistory();
        }
      });

      historyList.appendChild(card);
    });
  }

  // ── Bulk bar helpers ─────────────────────────────────────────────────────────

  function updateBulkBar() {
    const bar = document.getElementById('aibBulkBar');
    const countEl = document.getElementById('aibBulkCount');
    if (!bar) return;
    if (selectedIds.size > 0) {
      bar.classList.add('visible');
      if (countEl) countEl.textContent = selectedIds.size + ' selected';
    } else {
      bar.classList.remove('visible');
    }
  }

  function clearSelection() {
    selectedIds.clear();
    // Uncheck all visible checkboxes
    const checkboxes = document.querySelectorAll('.aib-card-checkbox');
    checkboxes.forEach((cb) => { cb.checked = false; });
    updateBulkBar();
  }

  const aibBulkArchive = document.getElementById('aibBulkArchive');
  const aibBulkDelete = document.getElementById('aibBulkDelete');
  const aibBulkClear = document.getElementById('aibBulkClear');

  if (aibBulkClear) {
    aibBulkClear.addEventListener('click', clearSelection);
  }

  if (aibBulkArchive) {
    aibBulkArchive.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      const count = selectedIds.size;
      const confirmed = await rcConfirm('Archive Selected', 'Archive ' + count + ' generation' + (count === 1 ? '' : 's') + '? They will be hidden from active view but not deleted.', 'Archive');
      if (!confirmed) return;
      aibBulkArchive.disabled = true;
      try {
        const ids = Array.from(selectedIds);
        const res = await fetch('/.netlify/functions/teacher-ai-builder-update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ ids, status: 'archived' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          console.warn('[tc-ai-builder] Bulk archive failed:', data.error || res.status);
        }
      } catch (err) {
        console.warn('[tc-ai-builder] Bulk archive error:', err.message);
      } finally {
        aibBulkArchive.disabled = false;
      }
      clearSelection();
      loadHistory();
    });
  }

  if (aibBulkDelete) {
    aibBulkDelete.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      const count = selectedIds.size;
      const confirmed = await rcConfirm('Delete Selected', 'Permanently delete ' + count + ' generation' + (count === 1 ? '' : 's') + '? This cannot be undone.', 'Delete', { danger: true });
      if (!confirmed) return;
      aibBulkDelete.disabled = true;
      try {
        const ids = Array.from(selectedIds);
        const res = await fetch('/.netlify/functions/teacher-ai-builder-update', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ ids }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          console.warn('[tc-ai-builder] Bulk delete failed:', data.error || res.status);
        }
      } catch (err) {
        console.warn('[tc-ai-builder] Bulk delete error:', err.message);
      } finally {
        aibBulkDelete.disabled = false;
      }
      clearSelection();
      loadHistory();
    });
  }

  async function loadHistory() {
    const historyList = document.getElementById('aibHistoryList');
    if (!historyList) return;

    historyList.innerHTML = '<div style="color: var(--rc-ink-dim); padding: 20px; text-align: center;"><span style="display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,0.15);border-top-color:rgba(34,197,94,0.8);border-radius:50%;animation:aib-spin 0.75s linear infinite;vertical-align:middle;margin-right:8px;"></span>Loading history…</div>';

    try {
      const params = new URLSearchParams();
      const statusFilter = document.getElementById('aibHistoryStatus');
      const weekFilter = document.getElementById('aibHistoryWeek');
      const subjectFilter = document.getElementById('aibHistorySubject');
      if (statusFilter && statusFilter.value) params.set('status', statusFilter.value);
      if (weekFilter && weekFilter.value) params.set('week', weekFilter.value);
      if (subjectFilter && subjectFilter.value) params.set('subject', subjectFilter.value);

      const url = '/.netlify/functions/teacher-ai-builder-history' + (params.toString() ? '?' + params.toString() : '');
      const res = await fetch(url, { credentials: 'same-origin' });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        historyList.innerHTML = '<div class="aib-msg err" style="display:block;">Failed to load history: ' + (data.error || 'Unknown error') + '</div>';
        return;
      }

      const outputs = data.outputs || [];

      // Store unfiltered outputs for Regenerate/Re-Issue
      lastOutputs = outputs;

      // Compute stats from unfiltered outputs
      const currentWeek = getCurrentCalendarWeek();
      const total = outputs.length;
      const thisWeek = outputs.filter((o) => parseInt(o.week, 10) === currentWeek).length;
      const assignments = outputs.filter((o) => o.task_type === 'assignments' || o.task_type === 'both').length;
      const presentations = outputs.filter((o) => o.task_type === 'presentations' || o.task_type === 'both').length;
      const probes = outputs.filter((o) => o.task_type === 'dataProbe').length;

      const setStatEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setStatEl('aibStatTotal', total);
      setStatEl('aibStatThisWeek', thisWeek);
      setStatEl('aibStatAssignments', assignments);
      setStatEl('aibStatPresentations', presentations);
      setStatEl('aibStatProbes', probes);

      // Apply client-side type/sort filters then render
      renderHistoryCards(applyClientFilters(outputs));
    } catch (err) {
      historyList.innerHTML = '<div class="aib-msg err" style="display:block;">Failed to load history: ' + err.message + '</div>';
    }
  }

  // ── Subject Selector ────────────────────────────────────────────────────────

  const subjectThemePlaceholders = {
    ELA: 'e.g. Transition Words, Figurative Language',
    Math: 'e.g. Fractions, Geometry, Algebra',
    Science: 'e.g. Photosynthesis, Newton\'s Laws',
    'Social Studies': 'e.g. Civil War, Constitution',
    'Life Skills': 'e.g. Cooking Safety, Money Skills',
    Other: 'e.g. Topic or theme for this week',
  };

  function updateThemePlaceholder() {
    if (!aibSubject || !aibTheme) return;
    const placeholder = subjectThemePlaceholders[aibSubject.value] || 'e.g. Topic or theme for this week';
    aibTheme.placeholder = placeholder;
  }

  if (aibSubject) {
    aibSubject.addEventListener('change', updateThemePlaceholder);
  }

  // ── Task Type Selector ──────────────────────────────────────────────────────

  function handleTypeBtn(e) {
    const btn = e.currentTarget;
    currentTaskType = btn.dataset.type;
    updateTypeUI();
    if (regeneratingFromId) {
      regeneratingFromId = null;
      hideMsg(aibMsg);
    }
  }

  typeBtnAssignments.addEventListener('click', handleTypeBtn);
  typeBtnPresentations.addEventListener('click', handleTypeBtn);
  typeBtnBoth.addEventListener('click', handleTypeBtn);
  typeBtnDataProbe.addEventListener('click', handleTypeBtn);

  // ── Source File Upload ──────────────────────────────────────────────────────

  aibSourceFile.addEventListener('change', () => {
    const file = aibSourceFile.files[0];
    if (!file) return;
    const sizeKB = Math.max(1, Math.round(file.size / 1024));
    const sizeLabel = sizeKB >= 1024
      ? (sizeKB / 1024).toFixed(1) + ' MB'
      : sizeKB + ' KB';
    aibSourceFileName.textContent = file.name + ' (' + sizeLabel + ')';
    if (file.size > 200 * 1024) {
      showMsg(aibMsg, '⚠ File is ' + sizeLabel + ' — the backend limit is 200 KB. Large files may be rejected. Consider trimming the content.', 'info');
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      aibSource.value = e.target.result;
      aibSource.dispatchEvent(new Event('input'));
    };
    reader.readAsText(file);
  });

  // ── Source Character Count ──────────────────────────────────────────────────

  aibSource.addEventListener('input', () => {
    const len = (aibSource.value || '').length;
    const max = 40000;
    if (aibSourceCount) {
      aibSourceCount.textContent = len.toLocaleString() + ' / ' + max.toLocaleString() + ' characters';
      aibSourceCount.style.color = len > max ? '#fca5a5' : '';
    }
  });

  // ── Extra Students Blur Validation ──────────────────────────────────────────

  aibExtraStudents.addEventListener('blur', () => {
    if (aibExtraStudentsWarn) aibExtraStudentsWarn.style.display = 'none';
    const raw = (aibExtraStudents.value || '').trim();
    if (!raw || !cachedStudents.length) return;
    const codes = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const knownCodes = new Set(cachedStudents.map((s) => (s.code || '').toUpperCase()));
    const unknown = codes.filter((c) => !knownCodes.has(c));
    if (unknown.length > 0) {
      showMsg(aibExtraStudentsWarn, '⚠ Unknown codes: ' + unknown.join(', ') + ' — will be treated as external/DESE-only', 'info');
    }
  });

  // ── Goal Datalist Filter by Selected Student ────────────────────────────────

  if (aibProbeStudent) {
    aibProbeStudent.addEventListener('input', () => {
      const code = (aibProbeStudent.value || '').trim().toUpperCase();
      const goalList = document.getElementById('aibGoalList');
      if (!goalList) return;
      const filtered = code
        ? cachedGoals.filter((g) => {
            const studentCode = (g.student_code || '').toUpperCase();
            return studentCode === code;
          })
        : cachedGoals;
      const frag = document.createDocumentFragment();
      filtered.forEach((g) => {
        if (g.code) {
          const opt = document.createElement('option');
          opt.value = g.code;
          frag.appendChild(opt);
        }
      });
      goalList.innerHTML = '';
      goalList.appendChild(frag);
    });
  }

  // ── Image Upload ────────────────────────────────────────────────────────────

  function addImages(files) {
    for (let i = 0; i < files.length; i++) {
      if (uploadedImages.length >= 12) break;
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      uploadedImages.push(file);
      renderThumb(file, uploadedImages.length - 1);
    }
  }

  function renderThumb(file, idx) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wrap = document.createElement('div');
      wrap.className = 'aib-img-thumb';
      wrap.dataset.idx = idx;

      const img = document.createElement('img');
      img.src = e.target.result;
      img.alt = file.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', 'Remove image');
      removeBtn.addEventListener('click', () => {
        uploadedImages.splice(idx, 1);
        rebuildThumbs();
      });

      wrap.appendChild(img);
      wrap.appendChild(removeBtn);
      aibImgThumbs.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  }

  function rebuildThumbs() {
    aibImgThumbs.innerHTML = '';
    uploadedImages.forEach((file, i) => renderThumb(file, i));
  }

  aibImgDrop.addEventListener('click', () => aibImgInput.click());
  aibImgDrop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') aibImgInput.click();
  });

  aibImgDrop.addEventListener('dragover', (e) => {
    e.preventDefault();
    aibImgDrop.classList.add('over');
  });

  aibImgDrop.addEventListener('dragleave', () => {
    aibImgDrop.classList.remove('over');
  });

  aibImgDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    aibImgDrop.classList.remove('over');
    addImages(e.dataTransfer.files);
  });

  aibImgInput.addEventListener('change', () => {
    addImages(aibImgInput.files);
    aibImgInput.value = '';
  });

  // ── Library Reference Search ────────────────────────────────────────────────

  async function searchLibrary() {
    const query = (aibLibSearch.value || '').trim();
    if (!query) return;

    aibLibResults.textContent = 'Searching…';

    try {
      const assignments = await db.listAssignments();
      const lower = query.toLowerCase();
      const matches = (assignments || []).filter(
        (a) =>
          (a.title || '').toLowerCase().includes(lower) ||
          (a.notes || '').toLowerCase().includes(lower)
      );

      if (!matches.length) {
        aibLibResults.textContent = 'No matches found.';
        return;
      }

      aibLibResults.innerHTML = '';
      matches.slice(0, 8).forEach((a) => {
        const item = document.createElement('div');
        item.style.cssText =
          'padding: 6px 8px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; background: rgba(255,255,255,0.04);';
        item.textContent = a.title || '(untitled)';
        item.addEventListener('click', () => {
          selectedLibRef = a;
          aibLibSelected.textContent = '✓ Using: ' + (a.title || '(untitled)');
          aibLibResults.innerHTML = '';
        });
        aibLibResults.appendChild(item);
      });
    } catch (err) {
      aibLibResults.textContent = 'Search failed: ' + err.message;
    }
  }

  aibLibSearchBtn.addEventListener('click', searchLibrary);
  aibLibSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchLibrary();
  });

  // ── Generate ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    hideMsg(aibMsg);
    hideMsg(aibOutputMsg);

    const week = (aibWeek.value || '').trim();
    const chapters = (aibChapters.value || '').trim();
    const theme = (aibTheme.value || '').trim();
    const source = (aibSource.value || '').trim();
    const scope = aibScope.value;
    const model = aibModel.value;
    const taskType = currentTaskType;
    const presentationScope = aibPresentation.value;

    // Parse extra students (comma-separated, trim, uppercase, deduplicate)
    const extraStudentsRaw = (aibExtraStudents.value || '').trim();
    const extraStudents = extraStudentsRaw
      ? [...new Set(extraStudentsRaw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))]
      : [];

    if (source.length > 40000) {
      showMsg(aibMsg, 'Source material exceeds the 40,000 character limit (' + source.length.toLocaleString() + ' characters). Please shorten it before generating.', 'err');
      return;
    }

    if (!week) {
      showMsg(aibMsg, 'Please enter a week number.', 'err');
      return;
    }

    // Data Probe: probeStudent is required; source is NOT required
    if (taskType === 'dataProbe') {
      const probeStudent = (aibProbeStudent.value || '').trim();
      if (!probeStudent) {
        showMsg(aibMsg, 'Please enter a Target Student code for the Data Probe.', 'err');
        return;
      }
    } else if (!source) {
      showMsg(aibMsg, 'Please provide source material (paste text or upload a file).', 'err');
      return;
    }

    aibGenerateBtn.disabled = true;
    setProgress(true, 'Querying live student data from Supabase…');

    try {
      // Build images array for presentations
      const imageNames = uploadedImages.map((f) => f.name);

      const payload = {
        taskType,
        week,
        chapters,
        subject: aibSubject ? aibSubject.value : 'ELA',
        theme,
        source: source || undefined,
        scope,
        model,
        presentationScope: taskType !== 'assignments' && taskType !== 'dataProbe' ? presentationScope : undefined,
        imageNames: imageNames.length ? imageNames : undefined,
        libraryRef: selectedLibRef
          ? { title: selectedLibRef.title, id: selectedLibRef.id }
          : undefined,
        extraStudents: extraStudents.length ? extraStudents : undefined,
      };

      if (aibAssignDays && aibAssignDays.value.trim()) payload.assignDays = aibAssignDays.value.trim();
      if (aibAssignDifficulty && aibAssignDifficulty.value) payload.assignDifficulty = aibAssignDifficulty.value;
      if (aibAssignFormat && aibAssignFormat.value) payload.assignFormat = aibAssignFormat.value;
      if (aibAssignInstructions && aibAssignInstructions.value.trim()) payload.assignInstructions = aibAssignInstructions.value.trim();
      if (aibPresSlides && aibPresSlides.value.trim()) payload.presSlides = aibPresSlides.value.trim();
      if (aibPresStyle && aibPresStyle.value) payload.presStyle = aibPresStyle.value;
      if (aibPresAudience && aibPresAudience.value) payload.presAudience = aibPresAudience.value;
      if (aibPresInstructions && aibPresInstructions.value.trim()) payload.presInstructions = aibPresInstructions.value.trim();

      // Add probe-specific fields
      if (taskType === 'dataProbe') {
        payload.probeStudent = (aibProbeStudent.value || '').trim();
        payload.probeGoals = (aibProbeGoals.value || '').trim();
        payload.probeCount = parseInt(aibProbeCount.value, 10) || 5;
      }

      setProgress(true, 'Calling Claude — this may take 30–60 seconds…');

      const res = await fetch('/.netlify/functions/teacher-ai-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      aibOutput.value = typeof data.content === 'string'
        ? data.content
        : JSON.stringify(data.content, null, 2);

      aibOutputCard.style.display = 'block';

      // Show relevant action buttons
      if (taskType === 'dataProbe') {
        aibSendToWorkBtn.style.display = 'inline-flex';
        aibDownloadZipBtn.style.display = 'none';
      } else {
        aibSendToWorkBtn.style.display =
          taskType === 'assignments' || taskType === 'both' ? 'inline-flex' : 'none';
        aibDownloadZipBtn.style.display =
          taskType === 'presentations' || taskType === 'both' ? 'inline-flex' : 'none';
      }
      if (aibCopyBtn) aibCopyBtn.style.display = 'inline-flex';

      // Auto-populate issue title and show issue card
      if (aibIssueCard) {
        let issueTitle;
        if (taskType === 'dataProbe') {
          const studentCode = (aibProbeStudent.value || '').trim().toUpperCase();
          const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          issueTitle = ['Data Probe', studentCode ? '— ' + studentCode : '', '— ' + dateStr]
            .filter(Boolean)
            .join(' ');
        } else {
          issueTitle = ['Week', week, theme ? '— ' + theme : '', '— AI Generated']
            .filter(Boolean)
            .join(' ');
        }
        if (aibIssueTitle) aibIssueTitle.value = issueTitle;
        aibIssueCard.style.display = taskType === 'presentations' ? 'none' : 'block';
      }

      showMsg(aibMsg, 'Generation complete! Review and edit below.', 'ok');
      savePrefs();
      aibOutputCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Auto-save to history (non-blocking — don't let save failure block the UI)
      try {
        const sourceText = (aibSource.value || '').trim();
        const sourceHash = sourceText ? await hashSource(sourceText) : '';
        const studentCodes = cachedStudents.filter(s => s.active !== false).map(s => s.code);
        const goalCodes = cachedGoals.filter(g => g.active !== false).map(g => g.code).filter(Boolean);

        const saveRes = await fetch('/.netlify/functions/teacher-ai-builder-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            task_type: taskType,
            subject: aibSubject ? aibSubject.value : 'ELA',
            week,
            chapters,
            theme,
            scope,
            model,
            source_hash: sourceHash,
            content: aibOutput.value,
            student_codes: studentCodes,
            goal_codes: goalCodes,
            school_year: getSchoolYear(),
          }),
        });
        const saveData = await saveRes.json().catch(() => ({}));
        if (!saveRes.ok || !saveData.ok) {
          console.warn('[tc-ai-builder] Auto-save to history failed:', saveData.error || saveRes.status);
          regeneratingFromId = null;
          showMsg(aibMsg, 'Generation complete! (Note: history could not be saved.)', 'ok');
        } else {
          console.log('[tc-ai-builder] Output auto-saved to history');
          // Auto-supersede the source record if this was a Regenerate action
          const newSavedId = saveData.id;
          if (regeneratingFromId && newSavedId && UUID_PATTERN.test(String(regeneratingFromId)) && UUID_PATTERN.test(String(newSavedId))) {
            const oldId = regeneratingFromId;
            regeneratingFromId = null;
            try {
              await fetch('/.netlify/functions/teacher-ai-builder-update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ ids: [oldId], status: 'superseded', superseded_by: newSavedId }),
              });
            } catch (supersedeErr) {
              console.warn('[tc-ai-builder] Auto-supersede failed (non-critical):', supersedeErr.message);
            }
          } else {
            regeneratingFromId = null;
          }
        }
      } catch (saveErr) {
        console.warn('[tc-ai-builder] Auto-save failed (non-critical):', saveErr.message);
        regeneratingFromId = null;
      }
    } catch (err) {
      console.error('[tc-ai-builder] Generation error:', err);
      regeneratingFromId = null;
      showMsg(aibMsg, 'Error: ' + err.message, 'err');
    } finally {
      aibGenerateBtn.disabled = false;
      setProgress(false);
    }
  }

  aibGenerateBtn.addEventListener('click', handleGenerate);

  // ── Send to Work ────────────────────────────────────────────────────────────

  async function handleSendToWork() {
    const content = (aibOutput.value || '').trim();
    if (!content) {
      showMsg(aibOutputMsg, 'No content to send.', 'err');
      return;
    }

    aibSendToWorkBtn.disabled = true;

    try {
      const week = (aibWeek.value || '').trim();
      const theme = (aibTheme.value || '').trim();
      let title;
      if (currentTaskType === 'dataProbe') {
        const studentCode = (aibProbeStudent.value || '').trim().toUpperCase();
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        title = ['Data Probe', studentCode ? '— ' + studentCode : '', '— ' + dateStr]
          .filter(Boolean)
          .join(' ');
      } else {
        title = ['Week', week, theme ? '— ' + theme : '', '— AI Generated']
          .filter(Boolean)
          .join(' ');
      }

      const WORK_DRAFTS_KEY = 'rc_tc_work_drafts_v1';
      const existingRaw = localStorage.getItem(WORK_DRAFTS_KEY);
      let drafts = [];
      try {
        const parsed = existingRaw ? JSON.parse(existingRaw) : [];
        drafts = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        drafts = [];
      }

      const newDraft = {
        id: 'ai-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        title,
        class: '',
        assignment: content,
        notes: 'Generated by AI Builder',
        createdAt: new Date().toISOString(),
      };
      drafts.push(newDraft);
      localStorage.setItem(WORK_DRAFTS_KEY, JSON.stringify(drafts));
      showMsg(aibOutputMsg, 'Sent to Work drafts! Open the Work tab to review and issue.', 'ok');
    } catch (err) {
      console.error('[tc-ai-builder] Send to Work error:', err);
      showMsg(aibOutputMsg, 'Error sending to Work: ' + err.message, 'err');
    } finally {
      aibSendToWorkBtn.disabled = false;
    }
  }

  aibSendToWorkBtn.addEventListener('click', handleSendToWork);

  // ── Download ZIP (Presentations) ────────────────────────────────────────────

  async function handleDownloadZip() {
    if (typeof JSZip === 'undefined') {
      showMsg(aibOutputMsg, 'JSZip is not loaded. Check your network connection.', 'err');
      return;
    }

    const htmlContent = (aibOutput.value || '').trim();
    if (!htmlContent) {
      showMsg(aibOutputMsg, 'No content to download.', 'err');
      return;
    }

    aibDownloadZipBtn.disabled = true;

    try {
      const zip = new JSZip();
      const week = (aibWeek.value || 'presentation').trim();
      const folderName = 'presentation-week' + week;
      const folder = zip.folder(folderName);

      folder.file('presentation.html', htmlContent);

      // Bundle uploaded images
      for (let i = 0; i < uploadedImages.length; i++) {
        const file = uploadedImages[i];
        const arrayBuffer = await file.arrayBuffer();
        folder.file(file.name, arrayBuffer);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = folderName + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMsg(aibOutputMsg, 'ZIP downloaded! Upload images to the presentation folder.', 'ok');
    } catch (err) {
      console.error('[tc-ai-builder] ZIP error:', err);
      showMsg(aibOutputMsg, 'Error creating ZIP: ' + err.message, 'err');
    } finally {
      aibDownloadZipBtn.disabled = false;
    }
  }

  aibDownloadZipBtn.addEventListener('click', handleDownloadZip);

  // ── Copy to Clipboard ───────────────────────────────────────────────────────

  if (aibCopyBtn) {
    aibCopyBtn.addEventListener('click', async () => {
      const content = (aibOutput.value || '').trim();
      if (!content) {
        showMsg(aibOutputMsg, 'No content to copy.', 'err');
        return;
      }
      try {
        await navigator.clipboard.writeText(content);
        showMsg(aibOutputMsg, '✅ Copied to clipboard!', 'ok');
      } catch (err) {
        console.error('[tc-ai-builder] Clipboard error:', err);
        showMsg(aibOutputMsg, 'Failed to copy — try selecting text manually.', 'err');
      }
    });
  }

  // ── Issue to Class ──────────────────────────────────────────────────────────

  async function handleIssueToClass() {
    if (!aibIssueClass || !aibIssueTitle || !aibIssueBtn || !aibIssueMsg) return;

    const content = (aibOutput.value || '').trim();
    if (!content) {
      showMsg(aibIssueMsg, 'No content to issue.', 'err');
      return;
    }

    const className = aibIssueClass.value;
    if (!className) {
      showMsg(aibIssueMsg, 'Please select a class.', 'err');
      return;
    }

    const title = (aibIssueTitle.value || '').trim();
    if (!title) {
      showMsg(aibIssueMsg, 'Please enter a title.', 'err');
      return;
    }

    aibIssueBtn.disabled = true;
    hideMsg(aibIssueMsg);

    try {
      const dueAt = aibIssueDue && aibIssueDue.value ? aibIssueDue.value : undefined;

      const response = await fetch('/.netlify/functions/teacher-issue-draft', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: {
            title,
            className,
            assignment: {
              kind: 'file',
              text: content,
              name: 'ai-builder-output.txt',
            },
            notes: 'Generated by AI Builder',
            dueAt,
          },
        }),
      });

      const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));

      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Issue failed: ${response.status}`);
      }

      const issued = result.issued_count || 0;
      showMsg(aibIssueMsg, `✓ Issued to ${issued} student${issued !== 1 ? 's' : ''} — saved to Library`, 'ok');
    } catch (err) {
      console.error('[tc-ai-builder] Issue to Class error:', err);
      showMsg(aibIssueMsg, err.message, 'err');
    } finally {
      aibIssueBtn.disabled = false;
    }
  }

  if (aibIssueBtn) {
    aibIssueBtn.addEventListener('click', handleIssueToClass);
  }

  // ── Standards Needing Attention Callout ──────────────────────────────────────

  /** Tier constants and helpers (mirrors tc-overview.js Standards Pulse) */
  const AIB_SP_TIERS = {
    excellent:        { label: 'Excellent' },
    'on-track':       { label: 'On-Track' },
    'needs-support':  { label: 'Needs Support' },
    critical:         { label: 'Critical' },
  };

  function aibSpGetTier(pct) {
    if (pct >= 80) return 'excellent';
    if (pct >= 60) return 'on-track';
    if (pct >= 40) return 'needs-support';
    return 'critical';
  }

  function aibSpCurrentSchoolYear() {
    const now = new Date();
    return (now.getMonth() + 1) >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  }

  /** Session-level cache: null = not fetched yet */
  let aibRollupCache = null;

  async function aibFetchRollups() {
    if (aibRollupCache !== null) return aibRollupCache;
    try {
      const { getSupabase } = await import('/web/supabase-client.js');
      const supabase = await getSupabase();
      if (!supabase) { aibRollupCache = []; return aibRollupCache; }
      const { data, error } = await supabase.rpc('all_students_dese_rollups', {
        p_school_year: aibSpCurrentSchoolYear(),
      });
      aibRollupCache = error || !Array.isArray(data) ? [] : data;
      if (error) console.warn('[tc-ai-builder] all_students_dese_rollups error:', error.message);
    } catch (err) {
      console.warn('[tc-ai-builder] all_students_dese_rollups failed:', err);
      aibRollupCache = [];
    }
    return aibRollupCache;
  }

  /**
   * Build a studentCode→Set<className> map from enrollment data or student class_id.
   */
  async function aibBuildStudentClassMap(students) {
    const map = new Map();
    try {
      if (db.listClassEnrollments) {
        const enrollments = await db.listClassEnrollments();
        for (const e of (enrollments || [])) {
          if (!e.student_code) continue;
          if (!map.has(e.student_code)) map.set(e.student_code, new Set());
          if (e.class_name) map.get(e.student_code).add(e.class_name);
        }
      }
    } catch { /* fall through to student fallback */ }
    if (map.size === 0) {
      for (const s of students) {
        if (s.class_id || s.class_name) {
          const name = s.class_name || s.class_id;
          if (!map.has(s.code)) map.set(s.code, new Set());
          map.get(s.code).add(name);
        }
      }
    }
    return map;
  }

  /**
   * Render the "Standards Needing Attention" callout above the tab bar.
   * Only appears when there are critical or needs-support standards.
   */
  async function aibRenderStandardsCallout(students) {
    if (!aibStandardsCallout) return;

    // Skip if dismissed this session
    if (sessionStorage.getItem('aib_standards_callout_dismissed') === '1') return;

    let rows;
    try {
      rows = await aibFetchRollups();
    } catch { return; }

    if (!rows || rows.length === 0) return;

    // Filter to critical and needs-support rows only
    const attnRows = rows.filter(r => {
      const tier = aibSpGetTier(Number(r.percent_correct));
      return tier === 'critical' || tier === 'needs-support';
    });
    if (attnRows.length === 0) return;

    // Build student→class map for grouping
    const studentClassMap = await aibBuildStudentClassMap(students);

    // Aggregate per-(standard, class): best (lowest) percent to surface the worst
    const stdClassMap = new Map(); // key: `${desCode}||${className}` → {sum, count, tier}
    const noClassStds = new Map(); // fallback when class data isn't available

    for (const row of attnRows) {
      const std = row.dese_code;
      const pct = Number(row.percent_correct);
      const tier = aibSpGetTier(pct);
      if (!std || isNaN(pct)) continue;

      const classes = studentClassMap.get(row.student_code);
      if (!classes || classes.size === 0) {
        // No class data — track globally
        if (!noClassStds.has(std)) noClassStds.set(std, { sum: 0, count: 0 });
        const acc = noClassStds.get(std);
        acc.sum += pct;
        acc.count++;
        continue;
      }
      for (const cls of classes) {
        const key = JSON.stringify([std, cls]);
        if (!stdClassMap.has(key)) stdClassMap.set(key, { sum: 0, count: 0, cls });
        const acc = stdClassMap.get(key);
        acc.sum += pct;
        acc.count++;
      }
    }

    // Build display groups: { className, items: [{std, pct, tier}] }
    const groups = new Map();
    for (const [keyStr, acc] of stdClassMap) {
      const [std, cls] = JSON.parse(keyStr);
      const avg = Math.round(acc.sum / acc.count);
      const tier = aibSpGetTier(avg);
      if (tier !== 'critical' && tier !== 'needs-support') continue;
      if (!groups.has(cls)) groups.set(cls, []);
      groups.get(cls).push({ std, pct: avg, tier });
    }
    // Sort items within each group by pct ascending (worst first)
    for (const items of groups.values()) {
      items.sort((a, b) => a.pct - b.pct);
    }

    // Fallback: no class grouping — show ungrouped list
    if (groups.size === 0 && noClassStds.size > 0) {
      const items = [];
      for (const [std, acc] of noClassStds) {
        const avg = Math.round(acc.sum / acc.count);
        const tier = aibSpGetTier(avg);
        if (tier === 'critical' || tier === 'needs-support') items.push({ std, pct: avg, tier });
      }
      items.sort((a, b) => a.pct - b.pct);
      if (items.length > 0) groups.set('', items);
    }

    if (groups.size === 0) return;

    // Determine overall severity (critical wins over needs-support)
    let overallSeverity = 'needs-support';
    outer: for (const items of groups.values()) {
      for (const item of items) {
        if (item.tier === 'critical') { overallSeverity = 'critical'; break outer; }
      }
    }

    const warningIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    const critIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    const chevronIcon = '<svg class="aib-standards-callout-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

    // Build group HTML
    let groupsHtml = '';
    for (const [cls, items] of [...groups.entries()].sort()) {
      const itemsHtml = items.map(item => {
        const icon = item.tier === 'critical' ? critIcon : warningIcon;
        return `<span class="aib-sca-item tier-${item.tier}">${icon} ${item.std} (${item.pct}%)</span>`;
      }).join(' ');
      if (cls) {
        groupsHtml += `<div class="aib-standards-callout-group"><span class="aib-standards-callout-class">${cls}:</span> ${itemsHtml}</div>`;
      } else {
        groupsHtml += `<div class="aib-standards-callout-group">${itemsHtml}</div>`;
      }
    }

    const borderColor = overallSeverity === 'critical'
      ? 'rgba(239, 68, 68, 0.35)'
      : 'rgba(234, 179, 8, 0.35)';
    const bgColor = overallSeverity === 'critical'
      ? 'rgba(239, 68, 68, 0.07)'
      : 'rgba(234, 179, 8, 0.07)';
    const titleColor = overallSeverity === 'critical' ? '#fca5a5' : '#fde68a';

    aibStandardsCallout.innerHTML = `
      <div class="aib-standards-callout" style="border-color:${borderColor};background:${bgColor}">
        <div class="aib-standards-callout-header" role="button" tabindex="0" aria-expanded="true" aria-label="Standards Needing Attention — toggle">
          <span class="aib-standards-callout-title" style="color:${titleColor}">
            ${overallSeverity === 'critical' ? critIcon : warningIcon}
            Standards Needing Attention
          </span>
          ${chevronIcon}
        </div>
        <div class="aib-standards-callout-body">
          <p class="aib-standards-callout-tip">Consider adding more questions targeting these standards in this week's assignments.</p>
          <div class="aib-standards-callout-groups">${groupsHtml}</div>
          <div class="aib-standards-callout-footer">
            <a class="aib-standards-callout-link" href="/teacher/">View full Standards Pulse →</a>
            <button class="aib-standards-callout-dismiss" type="button">Dismiss</button>
          </div>
        </div>
      </div>
    `;

    aibStandardsCallout.style.display = '';

    // Toggle collapse on header click / keydown
    const calloutEl = aibStandardsCallout.querySelector('.aib-standards-callout');
    const headerEl = aibStandardsCallout.querySelector('.aib-standards-callout-header');
    function toggleCallout() {
      calloutEl.classList.toggle('collapsed');
      const expanded = !calloutEl.classList.contains('collapsed');
      headerEl.setAttribute('aria-expanded', String(expanded));
    }
    headerEl.addEventListener('click', toggleCallout);
    headerEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCallout(); }
    });

    // Dismiss permanently for this session
    const dismissBtn = aibStandardsCallout.querySelector('.aib-standards-callout-dismiss');
    dismissBtn.addEventListener('click', () => {
      aibStandardsCallout.style.display = 'none';
      try { sessionStorage.setItem('aib_standards_callout_dismissed', '1'); } catch { /* noop */ }
    });

    console.log('[tc-ai-builder] Standards callout rendered —', groups.size, 'class group(s)');
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  restorePrefs();
  updateTypeUI();
  updateThemePlaceholder();

  // ── Prefetch Students & Goals for Autocomplete ──────────────────────────────

  (async () => {
    try {
      const students = await db.listStudents();
      cachedStudents = Array.isArray(students) ? students : [];
      const studentList = document.getElementById('aibStudentList');
      if (studentList) {
        cachedStudents.forEach((s) => {
          if (s.code) {
            const opt = document.createElement('option');
            opt.value = s.code;
            studentList.appendChild(opt);
          }
        });
      }
    } catch (e) {
      console.warn('[tc-ai-builder] Could not prefetch students:', e.message);
    }
    try {
      const goals = await db.listGoalsAll();
      cachedGoals = Array.isArray(goals) ? goals : [];
      const goalList = document.getElementById('aibGoalList');
      if (goalList) {
        cachedGoals.forEach((g) => {
          if (g.code) {
            const opt = document.createElement('option');
            opt.value = g.code;
            goalList.appendChild(opt);
          }
        });
      }
    } catch (e) {
      console.warn('[tc-ai-builder] Could not prefetch goals:', e.message);
    }
    if (!cachedStudents.length && !cachedGoals.length) {
      console.warn('[tc-ai-builder] Autocomplete data unavailable — student/goal suggestions disabled');
      if (aibExtraStudentsWarn) {
        showMsg(aibExtraStudentsWarn, 'ℹ Student/goal autocomplete unavailable (database not connected)', 'info');
      }
    }
    try {
      const classes = await db.listClasses();
      const cachedClasses = Array.isArray(classes) ? classes : [];
      // Populate Issue Class dropdown
      if (aibIssueClass && cachedClasses.length > 0) {
        cachedClasses.forEach((c) => {
          const name = c.name || c.code || String(c.id);
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          aibIssueClass.appendChild(opt);
        });
      }
      // Populate Scope dropdown dynamically
      if (aibScope && cachedClasses.length > 0) {
        cachedClasses.forEach((c) => {
          if (c.name) {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.textContent = c.name;
            aibScope.appendChild(opt);
          }
        });
        // Re-apply saved scope preference now that dynamic options are available
        if (savedScopeValue) aibScope.value = savedScopeValue;
      }
    } catch (e) {
      console.warn('[tc-ai-builder] Could not prefetch classes:', e.message);
    }

    // Render standards callout after all prefetch data is available
    aibRenderStandardsCallout(cachedStudents).catch(() => { /* non-blocking */ });
  })();

  console.log('[tc-ai-builder] Ready');
})();
