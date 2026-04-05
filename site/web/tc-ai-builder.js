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
    if (!isCreate) loadHistory();
  }

  if (aibTabCreate) aibTabCreate.addEventListener('click', () => switchTab('create'));
  if (aibTabManage) aibTabManage.addEventListener('click', () => switchTab('manage'));

  const aibHistoryRefreshBtn = document.getElementById('aibHistoryRefreshBtn');
  if (aibHistoryRefreshBtn) aibHistoryRefreshBtn.addEventListener('click', () => loadHistory());

  const aibHistoryStatus = document.getElementById('aibHistoryStatus');
  const aibHistorySubject = document.getElementById('aibHistorySubject');
  const aibHistoryWeek = document.getElementById('aibHistoryWeek');

  if (aibHistoryStatus) aibHistoryStatus.addEventListener('change', loadHistory);
  if (aibHistorySubject) aibHistorySubject.addEventListener('change', loadHistory);
  if (aibHistoryWeek) {
    let weekDebounce;
    aibHistoryWeek.addEventListener('input', () => {
      clearTimeout(weekDebounce);
      weekDebounce = setTimeout(loadHistory, 400);
    });
  }

  // ── School year helper ───────────────────────────────────────────────────────

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

  function renderHistoryCards(outputs) {
    const historyList = document.getElementById('aibHistoryList');
    if (!historyList) return;
    historyList.innerHTML = '';

    // Helper: fetch content for this record, using cache
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

      const statusClass = 'aib-badge-' + status;
      const typeClass = 'aib-badge-' + taskType;
      const taskLabel = taskLabels[taskType];
      const title = taskType === 'dataProbe'
        ? 'Data Probe' + (o.student_codes && o.student_codes.length ? ' — ' + esc(o.student_codes[0]) : '')
        : 'Week ' + esc(o.week) + (o.theme ? ' — ' + esc(o.theme) : '');

      const studentCount = Array.isArray(o.student_codes) ? o.student_codes.length : 0;
      const goalCount = Array.isArray(o.goal_codes) ? o.goal_codes.length : 0;

      card.innerHTML =
        '<div class="aib-history-meta">' +
          '<span class="aib-badge ' + typeClass + '">' + esc(taskLabel) + '</span>' +
          '<span class="aib-badge">' + esc(o.subject || 'ELA') + '</span>' +
          '<span class="aib-badge ' + statusClass + '">' + esc(status) + '</span>' +
          (o.scope ? '<span style="font-size:12px;color:var(--rc-ink-dim);">' + esc(o.scope) + '</span>' : '') +
          '<span style="font-size:12px;color:var(--rc-ink-dim);margin-left:auto;">' + esc(relativeTime(o.created_at)) + '</span>' +
        '</div>' +
        '<div class="aib-history-title">' + title + '</div>' +
        '<div class="aib-history-stats">' +
          '<span>' + studentCount + ' student' + (studentCount === 1 ? '' : 's') + '</span>' +
          '<span>' + goalCount + ' goal' + (goalCount === 1 ? '' : 's') + '</span>' +
          (o.chapters ? '<span>Ch. ' + esc(o.chapters) + '</span>' : '') +
          (o.model ? '<span>' + esc(o.model) + '</span>' : '') +
        '</div>' +
        (safeId ? '<div class="aib-history-preview" id="aibHistPreview_' + safeId + '"></div>' : '<div class="aib-history-preview"></div>') +
        '<div class="aib-history-actions">' +
          (safeId ? '<button class="aib-btn" type="button" data-id="' + safeId + '" data-action="expand">Expand</button>' : '') +
          '<button class="aib-btn" type="button"' + (safeId ? ' data-id="' + safeId + '"' : '') + ' data-action="copy">Copy Output</button>' +
        '</div>';

      // Set preview text safely via textContent (empty until expanded)

      // Expand/collapse/copy toggle
      card.addEventListener('click', (e) => {
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
            btn.textContent = 'Collapse';
            btn.dataset.action = 'collapse';
          } else {
            btn.disabled = true;
            btn.textContent = 'Loading…';
            fetchContent(id).then((content) => {
              previewEl2.classList.add('expanded');
              previewEl2.textContent = content;
              btn.textContent = 'Collapse';
              btn.dataset.action = 'collapse';
              btn.disabled = false;
            }).catch((err) => {
              btn.textContent = 'Expand';
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
          btn.textContent = 'Expand';
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
              btn.textContent = 'Copy Output';
              doCopy(content);
            }).catch((err) => {
              btn.disabled = false;
              btn.textContent = 'Copy Output';
              console.warn('[tc-ai-builder] Failed to load content for copy:', err.message);
            });
          } else {
            doCopy(historyContentCache.get(id));
          }
        }
      });

      historyList.appendChild(card);
    });
  }

  async function loadHistory() {
    const historyList = document.getElementById('aibHistoryList');
    if (!historyList) return;

    historyList.innerHTML = '<div style="color: var(--rc-ink-dim); padding: 20px; text-align: center;">Loading history…</div>';

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
      if (outputs.length === 0) {
        historyList.innerHTML = '<div style="color: var(--rc-ink-dim); padding: 40px 20px; text-align: center;">No generations yet. Create your first assignment or presentation in the <strong>Create</strong> tab.</div>';
        return;
      }

      renderHistoryCards(outputs);
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
          showMsg(aibMsg, 'Generation complete! (Note: history could not be saved.)', 'ok');
        } else {
          console.log('[tc-ai-builder] Output auto-saved to history');
        }
      } catch (saveErr) {
        console.warn('[tc-ai-builder] Auto-save failed (non-critical):', saveErr.message);
      }
    } catch (err) {
      console.error('[tc-ai-builder] Generation error:', err);
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
  })();

  console.log('[tc-ai-builder] Ready');
})();
