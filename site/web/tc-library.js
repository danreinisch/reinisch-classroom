/**
 * tc-library.js
 * Teacher Center Library page — 3-lane lifecycle layout (Upcoming / Active / Finalized)
 * with category badges, hierarchical Finalized cataloging, and updated KPIs.
 */

(async () => {
  "use strict";

  // Page guard - only run on library page
  if (!location.pathname.startsWith("/teacher/library")) return;

  // Import data adapter and constants
  const { db, isRemote } = await import('/web/data-adapter.js');
  const { CANON_CLASSES } = await import('/web/constants.js');

  // DOM helper
  const $ = (id) => document.getElementById(id);

  // ── Categories ────────────────────────────────────────────────────────────────

  const CATEGORIES = [
    'Reading Comprehension',
    'Vocabulary',
    'Writing',
    'Grammar',
    'Social Skills',
    'Daily Living',
    'Community',
    'Self-Advocacy',
    'Assessment',
    'Other'
  ];

  const CATEGORY_COLORS = {
    'Reading Comprehension': { bg: 'rgba(96,165,250,.22)',  color: '#60a5fa' },
    'Vocabulary':            { bg: 'rgba(167,139,250,.22)', color: '#a78bfa' },
    'Writing':               { bg: 'rgba(52,211,153,.22)',  color: '#34d399' },
    'Grammar':               { bg: 'rgba(45,212,191,.22)',  color: '#2dd4bf' },
    'Social Skills':         { bg: 'rgba(251,191,36,.22)',  color: '#fbbf24' },
    'Daily Living':          { bg: 'rgba(251,146,60,.22)',  color: '#fb923c' },
    'Community':             { bg: 'rgba(248,113,113,.22)', color: '#f87171' },
    'Self-Advocacy':         { bg: 'rgba(129,140,248,.22)', color: '#818cf8' },
    'Assessment':            { bg: 'rgba(244,63,94,.22)',   color: '#f43f5e' },
    'Other':                 { bg: 'rgba(148,163,184,.18)', color: '#94a3b8' }
  };

  // ── Category Keyword Mapping (used by Smart Category Suggest) ────────────────

  const CATEGORY_KEYWORDS = {
    'Reading Comprehension': ['reading', 'comprehension', 'read', 'passage', 'story', 'novel', 'book', 'chapter', 'literature', 'literary'],
    'Vocabulary':            ['vocabulary', 'vocab', 'word', 'words', 'spelling', 'definitions', 'glossary'],
    'Writing':               ['writing', 'write', 'essay', 'paragraph', 'journal', 'narrative', 'prompt', 'composition'],
    'Grammar':               ['grammar', 'punctuation', 'comma', 'sentence', 'syntax', 'capitalization', 'apostrophe', 'parts of speech'],
    'Social Skills':         ['social', 'friendship', 'cooperation', 'teamwork', 'conflict', 'communication', 'emotion', 'empathy', 'behavior'],
    'Daily Living':          ['daily living', 'cooking', 'hygiene', 'money', 'budget', 'time management', 'laundry', 'cleaning', 'safety', 'nutrition'],
    'Community':             ['community', 'field trip', 'volunteer', 'civic', 'neighborhood', 'public', 'transportation'],
    'Self-Advocacy':         ['self-advocacy', 'advocacy', 'self-determination', 'rights', 'accommodation', 'iep', 'transition', 'goal setting'],
    'Assessment':            ['assessment', 'quiz', 'test', 'exam', 'evaluation', 'benchmark', 'diagnostic', 'pre-test', 'post-test', 'final'],
    'Other':                 []
  };

  // Assignment type options: [value, label]
  const ASSIGNMENT_TYPE_OPTIONS = [
    ['All', 'All Types'],
    ['file', 'File'],
    ['link', 'Link'],
    ['paper', 'Paper']
  ];

  // ── State ─────────────────────────────────────────────────────────────────────

  let _currentTab = "assignments";
  let assignmentsData = [];
  let instancesData = [];
  let submissionsData = [];
  let lessonsData = null;
  let syncStatus = "loading";

  // Bulk edit state
  let bulkEditMode = false;
  const selectedAssignmentIds = new Set();

  // Filter state
  let filters = {
    assignments: {
      classFilter: "All Classes",
      searchQuery: "",
      typeFilter: "All",
      categoryFilter: "All"
    },
    lessons: {
      searchQuery: ""
    }
  };

  // Collapse state for lane headers (analytics is collapsed by default)
  const collapsedLanes = new Set(['analytics']); // lane IDs: 'upcoming', 'current', 'finalized', 'analytics'

  // Expand state for hierarchy nodes (nodeId → boolean)
  const hierarchyExpandState = new Map();

  // ── Initialization ────────────────────────────────────────────────────────────

  async function init() {
    console.log("[tc-library] Initializing...");
    // Inject responsive analytics grid style once
    if (!document.getElementById('tc-lib-analytics-responsive-style')) {
      const style = document.createElement('style');
      style.id = 'tc-lib-analytics-responsive-style';
      style.textContent = [
        '@media (max-width: 768px) {',
        '  .tc-lib-analytics-grid {',
        '    grid-template-columns: 1fr !important;',
        '  }',
        '}'
      ].join('\n');
      document.head.appendChild(style);
    }
    renderTabBar();
    renderTabContent();
    await loadAssignments();
    await loadLessons();
    attachEventListeners();
    switchTab("assignments");
  }

  // ── Tab Bar ───────────────────────────────────────────────────────────────────

  function renderTabBar() {
    const main = $("tcLibraryMain");
    if (!main) return;
    const tabBarHtml = `
      <div class="tc-lib-tabs">
        <button class="tc-btn tc-lib-tab-btn" data-tab="assignments" style="display: flex; align-items: center; gap: 8px;">
          <span>📝</span> Assignments
        </button>
        <button class="tc-btn tc-lib-tab-btn" data-tab="lessons" style="display: flex; align-items: center; gap: 8px;">
          <span>📖</span> Lessons
        </button>
        <div style="flex: 1;"></div>
        <button id="uploadPaperBtn" class="tc-btn" style="margin-left: auto; display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          Upload Paper Assignment
        </button>
        <button id="exportLibraryBtn" class="tc-btn" style="margin-left: 8px;">
          Export Library JSON
        </button>
      </div>
    `;
    main.insertAdjacentHTML('afterbegin', tabBarHtml);
  }

  function renderTabContent() {
    const main = $("tcLibraryMain");
    if (!main) return;
    const contentHtml = `
      <div id="assignmentsTab" class="tc-lib-tab-content" style="display: none;"></div>
      <div id="lessonsTab" class="tc-lib-tab-content" style="display: none;"></div>
    `;
    main.insertAdjacentHTML('beforeend', contentHtml);
  }

  function switchTab(tabName) {
    _currentTab = tabName;
    document.querySelectorAll('.tc-lib-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    const assignmentsTab = $("assignmentsTab");
    const lessonsTab = $("lessonsTab");
    if (assignmentsTab && lessonsTab) {
      assignmentsTab.style.display = tabName === "assignments" ? "block" : "none";
      lessonsTab.style.display = tabName === "lessons" ? "block" : "none";
    }
    if (tabName === "assignments") {
      renderAssignmentsTab();
    } else if (tabName === "lessons") {
      renderLessonsTab();
    }
  }

  // ── Data Loading ──────────────────────────────────────────────────────────────

  async function loadAssignments() {
    console.log("[tc-library] Loading assignments, instances, submissions...");
    try {
      const remote = await isRemote();
      if (remote) {
        console.log("[tc-library] Fetching from Supabase...");
        [assignmentsData, instancesData, submissionsData] = await Promise.all([
          db.listAssignments(),
          db.listAssignmentInstances().catch(err => {
            console.warn("[tc-library] Could not load instances:", err.message);
            return [];
          }),
          db.listSubmissions().catch(err => {
            console.warn("[tc-library] Could not load submissions:", err.message);
            return [];
          })
        ]);
        syncStatus = "synced";
      } else {
        console.log("[tc-library] Falling back to localStorage...");
        let localAssignments = await db.listAssignments().catch(() => []);
        if (localAssignments.length === 0) {
          const draftsJson = localStorage.getItem("rc_tc_work_drafts_v1");
          if (draftsJson) {
            const drafts = JSON.parse(draftsJson);
            localAssignments = drafts.map(draft => ({
              id: draft.id,
              title: draft.title,
              type: draft.assignment?.kind || "file",
              series: draft.className || "",
              created_at: draft.submittedAt || new Date().toISOString(),
              meta: draft.mapping?.text || "",
              page: draft.assignment?.text || ""
            }));
          }
        }
        assignmentsData = localAssignments;
        [instancesData, submissionsData] = await Promise.all([
          db.listAssignmentInstances().catch(() => []),
          db.listSubmissions().catch(() => [])
        ]);
        syncStatus = "local";
      }
      console.log(`[tc-library] Loaded ${assignmentsData.length} assignments, ${instancesData.length} instances, ${submissionsData.length} submissions`);
    } catch (err) {
      console.error("[tc-library] Error loading assignments:", err);
      syncStatus = "error";
      assignmentsData = [];
      instancesData = [];
      submissionsData = [];
    }
  }

  async function loadLessons() {
    console.log("[tc-library] Loading lessons...");
    try {
      const response = await fetch('/assets/content/lessons-index.json');
      if (response.ok) {
        lessonsData = await response.json();
        console.log(`[tc-library] Loaded ${lessonsData.sections?.length || 0} lesson sections`);
      } else {
        console.warn("[tc-library] Lessons index not found");
        lessonsData = null;
      }
    } catch (err) {
      console.error("[tc-library] Error loading lessons:", err);
      lessonsData = null;
    }
  }

  // ── Category Helpers ──────────────────────────────────────────────────────────

  function getAssignmentCategory(assignment) {
    const meta = assignment.meta;
    if (meta && typeof meta === 'object' && meta.category) return meta.category;
    if (meta && typeof meta === 'string') {
      try {
        const parsed = JSON.parse(meta);
        if (parsed && parsed.category) return parsed.category;
      } catch (_) { /* meta string is not valid JSON */ }
    }
    return 'Uncategorized';
  }

  function renderCategoryBadge(category) {
    const span = document.createElement('span');
    const colors = CATEGORY_COLORS[category];
    if (colors) {
      span.style.cssText = `background:${colors.bg};color:${colors.color};padding:3px 10px;border-radius:12px;font-size:12px;white-space:nowrap;font-weight:500;display:inline-block;`;
    } else {
      span.style.cssText = 'background:rgba(148,163,184,.15);color:rgba(148,163,184,.80);padding:3px 10px;border-radius:12px;font-size:12px;white-space:nowrap;font-weight:500;display:inline-block;';
    }
    span.textContent = category;
    return span;
  }

  /**
   * Renders a category badge + edit pencil button for an assignment card.
   * When the pencil is clicked, replaces the badge with an inline <select>.
   * On selection, calls db.updateAssignment and re-renders the tab.
   * @param {Object} assignment
   * @returns {HTMLElement} wrapper div containing badge + edit button
   */
  function renderCategoryEditor(assignment) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:inline-flex; align-items:center; gap:6px;';

    const category = getAssignmentCategory(assignment);
    const badge = renderCategoryBadge(category);
    wrapper.appendChild(badge);

    const editBtn = document.createElement('button');
    editBtn.title = 'Edit category';
    editBtn.setAttribute('aria-label', 'Edit category');
    editBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;color:rgba(255,255,255,.45);font-size:13px;line-height:1;border-radius:4px;transition:color .15s;';
    editBtn.textContent = '\u270f\ufe0f';
    wrapper.appendChild(editBtn);

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Replace badge + button with an inline select
      wrapper.replaceChildren();
      const sel = document.createElement('select');
      sel.style.cssText = 'padding:3px 8px; background:rgba(0,0,0,.5); border:1px solid rgba(255,255,255,.25); border-radius:8px; color:white; font-size:12px; cursor:pointer;';
      const uncatOpt = document.createElement('option');
      uncatOpt.value = '';
      uncatOpt.textContent = 'Uncategorized';
      sel.appendChild(uncatOpt);
      CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        sel.appendChild(opt);
      });
      sel.value = category === 'Uncategorized' ? '' : category;
      wrapper.appendChild(sel);

      const cancelBtn = document.createElement('button');
      cancelBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;color:rgba(255,255,255,.40);font-size:13px;line-height:1;';
      cancelBtn.textContent = '\u2715';
      cancelBtn.setAttribute('aria-label', 'Cancel');
      wrapper.appendChild(cancelBtn);

      sel.addEventListener('click', (ev) => ev.stopPropagation());
      cancelBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        renderAssignmentsTab();
      });

      sel.addEventListener('change', async (ev) => {
        ev.stopPropagation();
        const newCat = sel.value || null;
        const newLabel = newCat || 'Uncategorized';
        try {
          const existingMeta = assignment.meta && typeof assignment.meta === 'object' ? assignment.meta : {};
          const updatedMeta = { ...existingMeta, category: newCat };
          await db.updateAssignment(assignment.id, { meta: updatedMeta });
          // Patch local cache so re-render is instant
          const idx = assignmentsData.findIndex(a => a.id === assignment.id);
          if (idx !== -1) {
            assignmentsData[idx] = { ...assignmentsData[idx], meta: updatedMeta };
          }
          showToast(`Category updated to \u201c${newLabel}\u201d`);
          renderAssignmentsTab();
        } catch (err) {
          showToast(`Failed to update category: ${err.message}`, '#ef4444', '#fff');
        }
      });
    });

    return wrapper;
  }

  // ── Lane Computation ──────────────────────────────────────────────────────────

  /**
   * Computes which lifecycle lane an assignment belongs to.
   * @param {Object} assignment
   * @param {Array}  allInstances
   * @returns {'upcoming'|'current'|'finalized'}
   */
  function computeLane(assignment, allInstances) {
    const instances = allInstances.filter(i => i.assignment_id === assignment.id);
    if (instances.length === 0) return 'upcoming';
    const allGraded = instances.every(i => i.status === 'Graded');
    // Check active===false first so explicitly archived assignments are always finalized
    // even before the anyActive check below (both paths with allGraded lead to 'finalized').
    if (allGraded && assignment.active === false) return 'finalized';
    const anyActive = instances.some(i =>
      ['Assigned', 'In Progress', 'Submitted'].includes(i.status)
    );
    if (anyActive) return 'current';
    if (allGraded) return 'finalized';
    return 'upcoming';
  }

  // ── Assignment Stats ──────────────────────────────────────────────────────────

  function getAssignmentStats(assignment, allInstances, allSubmissions) {
    const instances = allInstances.filter(i => i.assignment_id === assignment.id);
    const instanceIds = new Set(instances.map(i => i.id));
    // Handle both remote (nested assignment_instances) and local (flat instance_id)
    const subs = allSubmissions.filter(s => {
      if (s.assignment_instances) return instanceIds.has(s.assignment_instances.id);
      return instanceIds.has(s.instance_id);
    });
    const scores = subs
      .map(s => s.score_total)
      .filter(s => s != null && !isNaN(Number(s)))
      .map(Number);
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
    const gradedCount = instances.filter(i => i.status === 'Graded').length;
    const submittedCount = instances.filter(i => i.status === 'Submitted').length;
    return { avgScore, studentCount: instances.length, gradedCount, submittedCount, scores };
  }

  // ── Score Color ───────────────────────────────────────────────────────────────

  function scoreColor(score) {
    if (score == null) return 'rgba(255,255,255,.40)';
    if (score >= 80) return '#4ade80';
    if (score >= 60) return '#fbbf24';
    return '#f87171';
  }

  // ── Hierarchical Cataloging Helpers ──────────────────────────────────────────

  /**
   * Returns the school year label for a date (Aug–Jul boundary).
   */
  function getSchoolYear(date) {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed; August = 7
    if (month >= 7) {
      return `${year}\u2013${year + 1} School Year`;
    }
    return `${year - 1}\u2013${year} School Year`;
  }

  function getCurrentSchoolYear() {
    return getSchoolYear(new Date());
  }

  function getMonthLabel(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function getCurrentMonthLabel() {
    return getMonthLabel(new Date());
  }

  /**
   * Returns a "Week of Mon D – Fri D" label for the ISO week containing the date.
   */
  function getWeekLabel(date) {
    const d = new Date(date);
    const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon
    const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + offsetToMonday);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monStr = `${MN[monday.getMonth()]} ${monday.getDate()}`;
    if (monday.getMonth() !== friday.getMonth()) {
      return `Week of ${monStr} \u2013 ${MN[friday.getMonth()]} ${friday.getDate()}`;
    }
    return `Week of ${monStr} \u2013 ${friday.getDate()}`;
  }

  /**
   * Returns a human-readable relative date string (e.g. "3 days ago", "2 months ago").
   * Returns 'Unknown' for null/undefined/invalid input.
   * @param {string|null|undefined} iso  ISO date string
   * @returns {string}
   */
  function relDate(iso) {
    if (iso == null) return 'Unknown';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Unknown';
    const diff = Date.now() - d.getTime();
    if (diff < 0) return 'just now';
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) { const w = Math.floor(days / 7); return `${w} week${w !== 1 ? 's' : ''} ago`; }
    if (days < 365) { const m = Math.floor(days / 30); return `${m} month${m !== 1 ? 's' : ''} ago`; }
    const y = Math.floor(days / 365);
    return `${y} year${y !== 1 ? 's' : ''} ago`;
  }

  /**
   * Suggests a category for an assignment title based on keyword matching.
   * Returns the first matching category (in CATEGORY_KEYWORDS priority order),
   * or null if no keyword matches.
   * @param {string|null|undefined} title
   * @returns {string|null}
   */
  function suggestCategory(title) {
    if (!title || typeof title !== 'string') return null;
    const lower = title.toLowerCase();
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (cat === 'Other') continue; // 'Other' is a fallback, never matched by keywords
      for (const kw of keywords) {
        if (lower.includes(kw)) return cat;
      }
    }
    return null;
  }

  /**
   * Returns the date used to catalog a finalized assignment
   * (latest submitted_at of its submissions, falling back to created_at).
   */
  function getFinalizationDate(assignment, allInstances, allSubmissions) {
    const instances = allInstances.filter(i => i.assignment_id === assignment.id);
    const instanceIds = new Set(instances.map(i => i.id));
    const subs = allSubmissions.filter(s => {
      if (s.assignment_instances) return instanceIds.has(s.assignment_instances.id);
      return instanceIds.has(s.instance_id);
    });
    const dates = subs
      .filter(s => s.submitted_at)
      .map(s => new Date(s.submitted_at))
      .filter(d => !isNaN(d.getTime()));
    if (dates.length > 0) {
      return new Date(Math.max(...dates.map(d => d.getTime())));
    }
    return new Date(assignment.created_at || Date.now());
  }

  /**
   * Groups finalized assignments into a nested Map:
   * Map<schoolYear, Map<monthLabel, Map<weekLabel, Array<{assignment, date}>>>>
   */
  function groupFinalizedAssignments(finalized) {
    const tree = new Map();
    finalized.forEach(assignment => {
      const date = getFinalizationDate(assignment, instancesData, submissionsData);
      const syLabel = getSchoolYear(date);
      const monthLabel = getMonthLabel(date);
      const weekLabel = getWeekLabel(date);
      if (!tree.has(syLabel)) tree.set(syLabel, new Map());
      const syMap = tree.get(syLabel);
      if (!syMap.has(monthLabel)) syMap.set(monthLabel, new Map());
      const monthMap = syMap.get(monthLabel);
      if (!monthMap.has(weekLabel)) monthMap.set(weekLabel, []);
      monthMap.get(weekLabel).push({ assignment, date });
    });
    // Sort entries within each week newest first
    for (const [, monthMap] of tree) {
      for (const [, weekMap] of monthMap) {
        for (const [, entries] of weekMap) {
          entries.sort((a, b) => b.date - a.date);
        }
      }
    }
    return tree;
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────────

  function calculateAssignmentKPIs() {
    let upcomingCount = 0, currentCount = 0, finalizedCount = 0;
    const finalizedScores = [];
    assignmentsData.forEach(a => {
      const lane = computeLane(a, instancesData);
      if (lane === 'upcoming') {
        upcomingCount++;
      } else if (lane === 'current') {
        currentCount++;
      } else if (lane === 'finalized') {
        finalizedCount++;
        const stats = getAssignmentStats(a, instancesData, submissionsData);
        if (stats.avgScore != null) finalizedScores.push(stats.avgScore);
      }
    });
    const avgScore = finalizedScores.length > 0
      ? Math.round(finalizedScores.reduce((a, b) => a + b, 0) / finalizedScores.length)
      : null;
    return { upcomingCount, currentCount, finalizedCount, avgScore };
  }

  function renderKPI(label, value, highlight) {
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'padding: 20px; text-align: center;';
    const labelEl = document.createElement('div');
    labelEl.style.cssText = 'font-size: 14px; color: rgba(255,255,255,.60); margin-bottom: 8px;';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.style.cssText = `font-size: 32px; font-weight: 600; color: ${highlight || 'white'};`;
    valueEl.textContent = value != null ? String(value) : '\u2014';
    card.appendChild(labelEl);
    card.appendChild(valueEl);
    return card;
  }

  // ── Filtering ─────────────────────────────────────────────────────────────────

  function filterAssignments() {
    let filtered = [...assignmentsData];
    if (filters.assignments.classFilter !== "All Classes") {
      filtered = filtered.filter(a => a.series === filters.assignments.classFilter);
    }
    if (filters.assignments.searchQuery.trim()) {
      const query = filters.assignments.searchQuery.toLowerCase();
      filtered = filtered.filter(a => (a.title || "").toLowerCase().includes(query));
    }
    if (filters.assignments.typeFilter !== "All") {
      filtered = filtered.filter(a => a.type === filters.assignments.typeFilter);
    }
    if (filters.assignments.categoryFilter !== "All") {
      if (filters.assignments.categoryFilter === "Uncategorized") {
        filtered = filtered.filter(a => getAssignmentCategory(a) === 'Uncategorized');
      } else {
        filtered = filtered.filter(a => getAssignmentCategory(a) === filters.assignments.categoryFilter);
      }
    }
    return filtered;
  }

  function updateActiveClassFilter() {
    document.querySelectorAll('.tc-lib-class-filter').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.class === filters.assignments.classFilter);
    });
  }

  // ── Collapse/Expand Helpers ───────────────────────────────────────────────────

  function isLaneExpanded(laneId) { return !collapsedLanes.has(laneId); }

  function toggleLane(laneId) {
    if (collapsedLanes.has(laneId)) { collapsedLanes.delete(laneId); }
    else { collapsedLanes.add(laneId); }
    renderAssignmentsTab();
  }

  function isHierarchyExpanded(nodeId, defaultExpanded) {
    if (!hierarchyExpandState.has(nodeId)) hierarchyExpandState.set(nodeId, defaultExpanded);
    return hierarchyExpandState.get(nodeId);
  }

  function toggleHierarchy(nodeId) {
    const current = hierarchyExpandState.has(nodeId) ? hierarchyExpandState.get(nodeId) : true;
    hierarchyExpandState.set(nodeId, !current);
    renderAssignmentsTab();
  }

  // ── Lane Section Wrapper ──────────────────────────────────────────────────────

  function renderLaneSection(laneId, emoji, title, count, renderContent) {
    const expanded = isLaneExpanded(laneId);
    const wrapper = document.createElement('div');
    wrapper.className = 'tc-lib-lane';
    wrapper.style.cssText = 'margin-bottom: 24px;';

    const header = document.createElement('div');
    header.className = 'tc-lib-lane-header';
    header.dataset.lane = laneId;
    header.style.cssText = [
      'display:flex; align-items:center; gap:12px;',
      'padding:14px 20px;',
      'background:rgba(255,255,255,.05);',
      'border:1px solid rgba(255,255,255,.10);',
      'border-radius:10px;',
      'cursor:pointer; user-select:none;',
      'transition:background .15s ease;',
      `margin-bottom:${expanded ? '12px' : '0'};`
    ].join('');

    const toggleIcon = document.createElement('span');
    toggleIcon.style.cssText = `font-size:14px; transition:transform .2s ease; display:inline-block; transform:rotate(${expanded ? '0deg' : '-90deg'});`;
    toggleIcon.textContent = '\u25be';

    const emojiEl = document.createElement('span');
    emojiEl.textContent = emoji;
    emojiEl.setAttribute('aria-hidden', 'true');

    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-size:18px; font-weight:600;';
    titleEl.textContent = title;

    const badge = document.createElement('span');
    badge.style.cssText = 'background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:12px; padding:2px 10px; font-size:13px; font-weight:500;';
    badge.textContent = count;

    header.appendChild(toggleIcon);
    header.appendChild(emojiEl);
    header.appendChild(titleEl);
    header.appendChild(badge);
    wrapper.appendChild(header);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'tc-lib-lane-content';
    contentDiv.style.cssText = `display:${expanded ? 'block' : 'none'};`;
    if (expanded) renderContent(contentDiv);
    wrapper.appendChild(contentDiv);
    return wrapper;
  }

  // ── Upcoming Lane ─────────────────────────────────────────────────────────────

  /**
   * Creates a bulk-select checkbox for the given assignment.
   * When clicked, toggles the assignment in selectedAssignmentIds and
   * updates the bulk action bar count. e.stopPropagation() prevents
   * triggering the card click handler.
   */
  function renderBulkCheckbox(assignment) {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none;';
    label.addEventListener('click', (e) => e.stopPropagation());
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedAssignmentIds.has(assignment.id);
    cb.style.cssText = 'width:16px; height:16px; cursor:pointer; accent-color:#60a5fa;';
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      if (cb.checked) selectedAssignmentIds.add(assignment.id);
      else selectedAssignmentIds.delete(assignment.id);
      // Update bar count without full re-render
      const barCountEl = document.querySelector('#tcLibBulkBar span');
      if (barCountEl) barCountEl.textContent = `${selectedAssignmentIds.size} selected`;
    });
    label.appendChild(cb);
    return label;
  }

  function renderUpcomingLane(assignments) {
    if (assignments.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:24px; text-align:center; color:rgba(255,255,255,.40); font-size:14px;';
      empty.textContent = 'No upcoming assignments match the current filters.';
      return empty;
    }
    const grid = document.createElement('div');
    grid.className = 'tc-lib-grid';
    assignments.forEach(a => grid.appendChild(renderUpcomingCard(a)));
    return grid;
  }

  function renderUpcomingCard(assignment) {
    const _category = getAssignmentCategory(assignment);
    const createdDate = assignment.created_at
      ? new Date(assignment.created_at).toLocaleDateString()
      : 'Unknown';
    const card = document.createElement('div');
    card.className = 'tc-card assignment-card';
    card.dataset.id = assignment.id || '';
    const isSelected = bulkEditMode && selectedAssignmentIds.has(assignment.id);
    card.style.cssText = 'padding:20px; cursor:pointer;' +
      (isSelected ? ' border-color:rgba(96,165,250,.60); background:rgba(96,165,250,.08);' : '');

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;';

    if (bulkEditMode) {
      headerRow.insertBefore(renderBulkCheckbox(assignment), headerRow.firstChild);
    }

    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'margin:0; font-size:16px; flex:1; line-height:1.3;';
    titleEl.textContent = assignment.title || 'Untitled';
    const typePill = document.createElement('span');
    typePill.style.cssText = 'background:rgba(96,165,250,.20);color:#60a5fa;padding:3px 10px;border-radius:12px;font-size:12px;white-space:nowrap;flex-shrink:0;';
    typePill.textContent = assignment.type || 'file';
    headerRow.appendChild(titleEl);
    headerRow.appendChild(typePill);
    card.appendChild(headerRow);

    const catRow = document.createElement('div');
    catRow.style.cssText = 'margin-bottom:8px;';
    catRow.appendChild(renderCategoryEditor(assignment));
    card.appendChild(catRow);

    if (assignment.series) {
      const seriesEl = document.createElement('div');
      seriesEl.style.cssText = 'color:rgba(255,255,255,.60); font-size:13px; margin-bottom:6px;';
      seriesEl.textContent = '\uD83D\uDCDA ' + assignment.series;
      card.appendChild(seriesEl);
    }

    const dateEl = document.createElement('div');
    dateEl.style.cssText = 'color:rgba(255,255,255,.40); font-size:12px; margin-bottom:14px;';
    dateEl.textContent = 'Created: ' + createdDate;
    card.appendChild(dateEl);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:8px;';
    const issueBtn = document.createElement('button');
    issueBtn.className = 'tc-btn issue-btn';
    issueBtn.dataset.id = assignment.id || '';
    issueBtn.style.cssText = 'flex:1; font-size:13px;';
    issueBtn.textContent = 'Issue to Class';
    btnRow.appendChild(issueBtn);
    card.appendChild(btnRow);
    return card;
  }

  // ── Current / Active Lane ─────────────────────────────────────────────────────

  function renderCurrentLane(assignments) {
    if (assignments.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:24px; text-align:center; color:rgba(255,255,255,.40); font-size:14px;';
      empty.textContent = 'No active assignments match the current filters.';
      return empty;
    }
    const grid = document.createElement('div');
    grid.className = 'tc-lib-grid';
    assignments.forEach(a => grid.appendChild(renderCurrentCard(a)));
    return grid;
  }

  function renderCurrentCard(assignment) {
    const _category = getAssignmentCategory(assignment);
    const stats = getAssignmentStats(assignment, instancesData, submissionsData);
    const instances = instancesData.filter(i => i.assignment_id === assignment.id);
    const dueDates = instances.map(i => i.due_at).filter(Boolean);
    const nearestDue = dueDates.length > 0
      ? new Date(Math.min(...dueDates.map(d => new Date(d).getTime())))
      : null;

    const card = document.createElement('div');
    card.className = 'tc-card assignment-card';
    card.dataset.id = assignment.id || '';
    const isSelected = bulkEditMode && selectedAssignmentIds.has(assignment.id);
    card.style.cssText = 'padding:20px; cursor:pointer;' +
      (isSelected ? ' border-color:rgba(96,165,250,.60); background:rgba(96,165,250,.08);' : '');

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;';

    if (bulkEditMode) {
      headerRow.insertBefore(renderBulkCheckbox(assignment), headerRow.firstChild);
    }

    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'margin:0; font-size:16px; flex:1; line-height:1.3;';
    titleEl.textContent = assignment.title || 'Untitled';
    const typePill = document.createElement('span');
    typePill.style.cssText = 'background:rgba(96,165,250,.20);color:#60a5fa;padding:3px 10px;border-radius:12px;font-size:12px;white-space:nowrap;flex-shrink:0;';
    typePill.textContent = assignment.type || 'file';
    headerRow.appendChild(titleEl);
    headerRow.appendChild(typePill);
    card.appendChild(headerRow);

    const catRow = document.createElement('div');
    catRow.style.cssText = 'margin-bottom:8px;';
    catRow.appendChild(renderCategoryEditor(assignment));
    card.appendChild(catRow);

    if (assignment.series) {
      const seriesEl = document.createElement('div');
      seriesEl.style.cssText = 'color:rgba(255,255,255,.60); font-size:13px; margin-bottom:6px;';
      seriesEl.textContent = '\uD83D\uDCDA ' + assignment.series;
      card.appendChild(seriesEl);
    }

    if (nearestDue) {
      const dueEl = document.createElement('div');
      dueEl.style.cssText = 'color:rgba(255,255,255,.60); font-size:13px; margin-bottom:8px;';
      dueEl.textContent = '\uD83D\uDCC5 Due: ' + nearestDue.toLocaleDateString();
      card.appendChild(dueEl);
    }

    const progressRow = document.createElement('div');
    progressRow.style.cssText = 'margin-bottom:14px;';
    const progressLabel = document.createElement('div');
    progressLabel.style.cssText = 'font-size:12px; color:rgba(255,255,255,.50); margin-bottom:5px;';
    const total = stats.studentCount;
    const submitted = stats.submittedCount + stats.gradedCount;
    progressLabel.textContent = `${submitted} / ${total} submitted`;
    progressRow.appendChild(progressLabel);
    const barOuter = document.createElement('div');
    barOuter.style.cssText = 'height:4px; background:rgba(255,255,255,.10); border-radius:2px; overflow:hidden;';
    const barInner = document.createElement('div');
    const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
    barInner.style.cssText = `height:100%; width:${pct}%; background:rgba(52,211,153,.70); border-radius:2px; transition:width .3s ease;`;
    barOuter.appendChild(barInner);
    progressRow.appendChild(barOuter);
    card.appendChild(progressRow);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:8px;';
    const viewBtn = document.createElement('button');
    viewBtn.className = 'tc-btn';
    viewBtn.style.cssText = 'flex:1; font-size:13px;';
    viewBtn.textContent = 'View Details';
    viewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showAssignmentDetail(assignment.id);
    });
    const issueBtn = document.createElement('button');
    issueBtn.className = 'tc-btn issue-btn';
    issueBtn.dataset.id = assignment.id || '';
    issueBtn.style.cssText = 'font-size:13px; padding:6px 12px;';
    issueBtn.textContent = '+ Issue';
    btnRow.appendChild(viewBtn);
    btnRow.appendChild(issueBtn);
    card.appendChild(btnRow);
    return card;
  }

  // ── Finalized Lane ────────────────────────────────────────────────────────────

  function renderFinalizedLane(assignments) {
    if (assignments.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:24px; text-align:center; color:rgba(255,255,255,.40); font-size:14px;';
      empty.textContent = 'No finalized assignments match the current filters.';
      return empty;
    }
    return renderFinalizedTree(assignments);
  }

  function renderFinalizedTree(assignments) {
    const tree = groupFinalizedAssignments(assignments);
    const currentSY = getCurrentSchoolYear();
    const currentMonth = getCurrentMonthLabel();
    const container = document.createElement('div');
    container.style.cssText = 'display:flex; flex-direction:column; gap:6px;';

    // Sort school years newest first
    const sortedYears = Array.from(tree.keys()).sort((a, b) => {
      const aYear = parseInt(a.split('\u2013')[0], 10) || 0;
      const bYear = parseInt(b.split('\u2013')[0], 10) || 0;
      return bYear - aYear;
    });

    sortedYears.forEach(syLabel => {
      const syDefaultExpanded = (syLabel === currentSY);
      const syId = 'sy-' + syLabel.replace(/[^a-zA-Z0-9]/g, '_');
      const syExpanded = isHierarchyExpanded(syId, syDefaultExpanded);
      const monthMap = tree.get(syLabel);
      let syCount = 0;
      for (const [, weekMap] of monthMap) {
        for (const [, entries] of weekMap) syCount += entries.length;
      }

      const syWrapper = document.createElement('div');
      const syHeader = document.createElement('div');
      syHeader.className = 'tc-hier-node';
      syHeader.dataset.hierNode = syId;
      syHeader.style.cssText = [
        'display:flex; align-items:center; gap:8px;',
        'padding:10px 14px;',
        'background:rgba(255,255,255,.06);',
        'border:1px solid rgba(255,255,255,.10);',
        'border-radius:8px; cursor:pointer; user-select:none;',
        `margin-bottom:${syExpanded ? '6px' : '0'};`
      ].join('');

      const syToggle = document.createElement('span');
      syToggle.style.cssText = `font-size:12px; transition:transform .2s; display:inline-block; transform:rotate(${syExpanded ? '0deg' : '-90deg'});`;
      syToggle.textContent = '\u25be';
      const syIcon = document.createElement('span');
      syIcon.setAttribute('aria-hidden', 'true');
      syIcon.textContent = syExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1';
      const syTitle = document.createElement('span');
      syTitle.style.cssText = 'font-size:15px; font-weight:600; flex:1;';
      syTitle.textContent = syLabel;
      const syBadge = document.createElement('span');
      syBadge.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40);';
      syBadge.textContent = `${syCount} assignment${syCount !== 1 ? 's' : ''}`;
      syHeader.appendChild(syToggle);
      syHeader.appendChild(syIcon);
      syHeader.appendChild(syTitle);
      syHeader.appendChild(syBadge);
      syWrapper.appendChild(syHeader);

      const syContent = document.createElement('div');
      syContent.style.cssText = `display:${syExpanded ? 'block' : 'none'}; padding-left:16px;`;

      if (syExpanded) {
        const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => new Date(b) - new Date(a));
        sortedMonths.forEach(monthLabel => {
          const monthDefaultExpanded = syDefaultExpanded && (monthLabel === currentMonth);
          const monthId = syId + '-m-' + monthLabel.replace(/[^a-zA-Z0-9]/g, '_');
          const monthExpanded = isHierarchyExpanded(monthId, monthDefaultExpanded);
          const weekMap = monthMap.get(monthLabel);
          let monthCount = 0;
          for (const [, entries] of weekMap) monthCount += entries.length;

          const monthWrapper = document.createElement('div');
          monthWrapper.style.cssText = 'margin-bottom:4px;';
          const monthHeader = document.createElement('div');
          monthHeader.className = 'tc-hier-node';
          monthHeader.dataset.hierNode = monthId;
          monthHeader.style.cssText = [
            'display:flex; align-items:center; gap:8px;',
            'padding:8px 12px;',
            'background:rgba(255,255,255,.04);',
            'border:1px solid rgba(255,255,255,.07);',
            'border-radius:6px; cursor:pointer; user-select:none;',
            `margin-bottom:${monthExpanded ? '4px' : '0'};`
          ].join('');

          const monthToggle = document.createElement('span');
          monthToggle.style.cssText = `font-size:11px; transition:transform .2s; display:inline-block; transform:rotate(${monthExpanded ? '0deg' : '-90deg'});`;
          monthToggle.textContent = '\u25be';
          const monthIcon = document.createElement('span');
          monthIcon.setAttribute('aria-hidden', 'true');
          monthIcon.textContent = monthExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1';
          const monthTitle = document.createElement('span');
          monthTitle.style.cssText = 'font-size:14px; font-weight:500; flex:1;';
          monthTitle.textContent = monthLabel;
          const monthBadge = document.createElement('span');
          monthBadge.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40);';
          monthBadge.textContent = String(monthCount);
          monthHeader.appendChild(monthToggle);
          monthHeader.appendChild(monthIcon);
          monthHeader.appendChild(monthTitle);
          monthHeader.appendChild(monthBadge);
          monthWrapper.appendChild(monthHeader);

          const monthContent = document.createElement('div');
          monthContent.style.cssText = `display:${monthExpanded ? 'block' : 'none'}; padding-left:16px;`;

          if (monthExpanded) {
            const yearInMonth = parseInt(monthLabel.match(/(\d{4})/)?.[1] ?? String(new Date().getFullYear()), 10);
            const sortedWeeks = Array.from(weekMap.keys()).sort((a, b) => {
              const extractDate = (wk) => {
                const m = wk.match(/Week of (\w+ \d+)/);
                return m ? new Date(`${m[1]} ${yearInMonth}`) : new Date(0);
              };
              return extractDate(b) - extractDate(a);
            });

            sortedWeeks.forEach(weekLabel => {
              const weekId = monthId + '-w-' + weekLabel.replace(/[^a-zA-Z0-9]/g, '_');
              const weekExpanded = isHierarchyExpanded(weekId, false);
              const entries = weekMap.get(weekLabel);

              const weekWrapper = document.createElement('div');
              weekWrapper.style.cssText = 'margin-bottom:4px;';
              const weekHeader = document.createElement('div');
              weekHeader.className = 'tc-hier-node';
              weekHeader.dataset.hierNode = weekId;
              weekHeader.style.cssText = [
                'display:flex; align-items:center; gap:8px;',
                'padding:7px 12px;',
                'background:rgba(255,255,255,.02);',
                'border:1px solid rgba(255,255,255,.05);',
                'border-radius:5px; cursor:pointer; user-select:none;',
                `margin-bottom:${weekExpanded ? '4px' : '0'};`
              ].join('');

              const weekToggle = document.createElement('span');
              weekToggle.style.cssText = `font-size:11px; transition:transform .2s; display:inline-block; transform:rotate(${weekExpanded ? '0deg' : '-90deg'});`;
              weekToggle.textContent = '\u25be';
              const weekIcon = document.createElement('span');
              weekIcon.setAttribute('aria-hidden', 'true');
              weekIcon.textContent = weekExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1';
              const weekTitle = document.createElement('span');
              weekTitle.style.cssText = 'font-size:13px; flex:1;';
              weekTitle.textContent = weekLabel;
              const weekBadge = document.createElement('span');
              weekBadge.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40);';
              weekBadge.textContent = String(entries.length);
              weekHeader.appendChild(weekToggle);
              weekHeader.appendChild(weekIcon);
              weekHeader.appendChild(weekTitle);
              weekHeader.appendChild(weekBadge);
              weekWrapper.appendChild(weekHeader);

              const weekContent = document.createElement('div');
              weekContent.style.cssText = `display:${weekExpanded ? 'block' : 'none'}; padding-left:12px; padding-top:4px;`;
              if (weekExpanded) {
                entries.forEach(({ assignment }) => {
                  weekContent.appendChild(renderFinalizedEntry(assignment));
                });
              }
              weekWrapper.appendChild(weekContent);
              monthContent.appendChild(weekWrapper);
            });
          }

          monthWrapper.appendChild(monthContent);
          syContent.appendChild(monthWrapper);
        });
      }

      syWrapper.appendChild(syContent);
      container.appendChild(syWrapper);
    });

    return container;
  }

  function renderFinalizedEntry(assignment) {
    const _category = getAssignmentCategory(assignment);
    const stats = getAssignmentStats(assignment, instancesData, submissionsData);
    const score = stats.avgScore;
    const sColor = scoreColor(score);

    const row = document.createElement('div');
    row.className = 'tc-card assignment-card';
    row.dataset.id = assignment.id || '';
    const isSelected = bulkEditMode && selectedAssignmentIds.has(assignment.id);
    row.style.cssText = 'padding:12px 16px; display:flex; align-items:center; gap:12px; cursor:pointer; margin-bottom:4px;' +
      (isSelected ? ' border-color:rgba(96,165,250,.60); background:rgba(96,165,250,.08);' : '');

    if (bulkEditMode) {
      row.appendChild(renderBulkCheckbox(assignment));
    }

    const icon = document.createElement('span');
    icon.textContent = '\uD83D\uDCC4';
    icon.setAttribute('aria-hidden', 'true');
    row.appendChild(icon);

    const titleSection = document.createElement('div');
    titleSection.style.cssText = 'flex:1; min-width:0;';
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:4px;';
    titleEl.textContent = assignment.title || 'Untitled';
    titleSection.appendChild(titleEl);
    titleSection.appendChild(renderCategoryEditor(assignment));
    row.appendChild(titleSection);

    const statsSection = document.createElement('div');
    statsSection.style.cssText = 'display:flex; flex-direction:column; align-items:flex-end; gap:2px; flex-shrink:0;';
    const scoreEl = document.createElement('div');
    scoreEl.style.cssText = `font-size:15px; font-weight:700; color:${sColor};`;
    scoreEl.textContent = score != null ? `${score}% avg` : '\u2014';
    statsSection.appendChild(scoreEl);
    const countEl = document.createElement('div');
    countEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40);';
    countEl.textContent = `${stats.studentCount} student${stats.studentCount !== 1 ? 's' : ''}`;
    statsSection.appendChild(countEl);
    row.appendChild(statsSection);
    return row;
  }

  // ── Bulk Action Bar ───────────────────────────────────────────────────────────

  function renderBulkActionBar() {
    // Remove any existing bar first
    const existing = document.getElementById('tcLibBulkBar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.id = 'tcLibBulkBar';
    bar.style.cssText = [
      'position:fixed; bottom:24px; left:50%; transform:translateX(-50%);',
      'background:#1e293b; border:1px solid rgba(255,255,255,.20);',
      'border-radius:14px; padding:12px 20px;',
      'display:flex; align-items:center; gap:14px; flex-wrap:wrap;',
      'box-shadow:0 8px 32px rgba(0,0,0,.50); z-index:9998;',
      'min-width:340px; max-width:90vw;'
    ].join('');

    const countEl = document.createElement('span');
    countEl.style.cssText = 'font-size:14px; font-weight:600; color:white; white-space:nowrap;';
    countEl.textContent = `${selectedAssignmentIds.size} selected`;
    bar.appendChild(countEl);

    // Select All Uncategorized
    const selectUncatBtn = document.createElement('button');
    selectUncatBtn.className = 'tc-btn';
    selectUncatBtn.style.cssText = 'font-size:12px; padding:5px 10px; white-space:nowrap;';
    selectUncatBtn.textContent = 'Select All Uncategorized';
    selectUncatBtn.addEventListener('click', () => {
      assignmentsData.forEach(a => {
        if (getAssignmentCategory(a) === 'Uncategorized') selectedAssignmentIds.add(a.id);
      });
      renderAssignmentsTab();
    });
    bar.appendChild(selectUncatBtn);

    // Category dropdown
    const catLabel = document.createElement('label');
    catLabel.style.cssText = 'font-size:13px; color:rgba(255,255,255,.70); white-space:nowrap;';
    catLabel.textContent = 'Category:';
    bar.appendChild(catLabel);

    const bulkCatSel = document.createElement('select');
    bulkCatSel.id = 'bulkCategorySelect';
    bulkCatSel.style.cssText = 'padding:6px 10px; background:rgba(0,0,0,.5); border:1px solid rgba(255,255,255,.25); border-radius:8px; color:white; font-size:13px;';
    const bulkUncatOpt = document.createElement('option');
    bulkUncatOpt.value = '';
    bulkUncatOpt.textContent = 'Uncategorized';
    bulkCatSel.appendChild(bulkUncatOpt);
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      bulkCatSel.appendChild(opt);
    });
    bar.appendChild(bulkCatSel);

    // Apply button
    const applyBtn = document.createElement('button');
    applyBtn.className = 'tc-btn';
    applyBtn.style.cssText = 'padding:6px 16px; font-size:13px; background:rgba(52,211,153,.20); border-color:rgba(52,211,153,.50); color:#34d399; white-space:nowrap;';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', async () => {
      const ids = Array.from(selectedAssignmentIds);
      if (ids.length === 0) {
        showToast('No assignments selected.', '#f59e0b', '#000');
        return;
      }
      const newCat = bulkCatSel.value || null;
      const newLabel = newCat || 'Uncategorized';
      applyBtn.disabled = true;
      applyBtn.textContent = 'Applying\u2026';
      let successCount = 0;
      for (const id of ids) {
        try {
          const assignment = assignmentsData.find(a => a.id === id);
          if (!assignment) continue;
          const existingMeta = assignment.meta && typeof assignment.meta === 'object' ? assignment.meta : {};
          const updatedMeta = { ...existingMeta, category: newCat };
          await db.updateAssignment(id, { meta: updatedMeta });
          const idx = assignmentsData.findIndex(a => a.id === id);
          if (idx !== -1) assignmentsData[idx] = { ...assignmentsData[idx], meta: updatedMeta };
          successCount++;
        } catch (_err) { console.warn('[tc-library] Failed to update assignment category:', id, _err); }
      }
      bulkEditMode = false;
      selectedAssignmentIds.clear();
      showToast(`Updated category to \u201c${newLabel}\u201d for ${successCount} assignment${successCount !== 1 ? 's' : ''}`);
      renderAssignmentsTab();
    });
    bar.appendChild(applyBtn);

    // Cancel
    const cancelBulkBtn = document.createElement('button');
    cancelBulkBtn.className = 'tc-btn';
    cancelBulkBtn.style.cssText = 'padding:6px 12px; font-size:13px; color:rgba(255,255,255,.60);';
    cancelBulkBtn.textContent = 'Cancel';
    cancelBulkBtn.addEventListener('click', () => {
      bulkEditMode = false;
      selectedAssignmentIds.clear();
      renderAssignmentsTab();
    });
    bar.appendChild(cancelBulkBtn);

    document.body.appendChild(bar);
  }

  // ── Smart Category Suggest Modal ──────────────────────────────────────────────

  /**
   * Shows a modal with AI-keyword-based category suggestions for all
   * uncategorized assignments. The teacher can confirm/change each suggestion
   * then click "Apply Selected" to batch-update.
   */
  function showSmartSuggestModal() {
    const uncategorized = assignmentsData.filter(a => getAssignmentCategory(a) === 'Uncategorized');
    if (uncategorized.length === 0) return;

    // Build suggestion list: [{assignment, suggested}]
    const suggestions = uncategorized.map(a => ({
      assignment: a,
      suggested: suggestCategory(a.title)
    }));

    // ── Overlay backdrop ──────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'tcLibSmartSuggestOverlay';
    overlay.style.cssText = [
      'position:fixed; inset:0; z-index:9000;',
      'background:rgba(0,0,0,.65); display:flex; align-items:center; justify-content:center;',
      'padding:16px;'
    ].join('');

    // ── Modal box ─────────────────────────────────────────────────────────────
    const modal = document.createElement('div');
    modal.style.cssText = [
      'background:#1a2236; border:1px solid rgba(255,255,255,.15); border-radius:14px;',
      'width:100%; max-width:640px; max-height:90vh; display:flex; flex-direction:column;',
      'box-shadow:0 24px 64px rgba(0,0,0,.60);'
    ].join('');
    overlay.appendChild(modal);

    // Header
    const modalHeader = document.createElement('div');
    modalHeader.style.cssText = 'padding:20px 24px 16px; border-bottom:1px solid rgba(255,255,255,.08);';
    const modalTitle = document.createElement('div');
    modalTitle.style.cssText = 'font-size:17px; font-weight:700; margin-bottom:4px;';
    modalTitle.textContent = '\uD83C\uDFF7\uFE0F Smart Category Suggestions';
    const matchCount = suggestions.filter(s => s.suggested !== null).length;
    const modalSubtitle = document.createElement('div');
    modalSubtitle.style.cssText = 'font-size:13px; color:rgba(255,255,255,.50);';
    modalSubtitle.textContent = `Found ${matchCount} assignment${matchCount !== 1 ? 's' : ''} that can be auto-categorized (out of ${uncategorized.length} uncategorized).`;
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(modalSubtitle);
    modal.appendChild(modalHeader);

    // Scrollable list
    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'flex:1; overflow-y:auto; padding:16px 24px;';

    // Per-row state: id → {checked, selectedCat}
    const rowState = new Map(suggestions.map(s => [
      s.assignment.id,
      { checked: s.suggested !== null, selectedCat: s.suggested }
    ]));

    const rows = [];
    suggestions.forEach(({ assignment, suggested }) => {
      const row = document.createElement('div');
      row.style.cssText = [
        'display:flex; align-items:center; gap:10px; padding:9px 0;',
        'border-bottom:1px solid rgba(255,255,255,.06);'
      ].join('');

      // Checkbox
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = suggested !== null;
      cb.style.cssText = 'width:16px; height:16px; cursor:pointer; flex-shrink:0;';
      cb.setAttribute('aria-label', `Include ${assignment.title || '(Untitled)'}`);
      row.appendChild(cb);

      // Title
      const titleEl = document.createElement('span');
      titleEl.style.cssText = 'flex:1; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
      titleEl.textContent = assignment.title || '(Untitled)';
      row.appendChild(titleEl);

      // Arrow
      const arrow = document.createElement('span');
      arrow.style.cssText = 'font-size:13px; color:rgba(255,255,255,.35); flex-shrink:0;';
      arrow.textContent = '\u2192';
      row.appendChild(arrow);

      // Category selector (dropdown)
      const sel = document.createElement('select');
      sel.style.cssText = [
        'padding:4px 8px; background:rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.20);',
        'border-radius:7px; color:white; font-size:12px; cursor:pointer; flex-shrink:0;'
      ].join('');
      const noMatchOpt = document.createElement('option');
      noMatchOpt.value = '';
      noMatchOpt.textContent = '(no match found)';
      noMatchOpt.style.cssText = 'color:rgba(255,255,255,.40);';
      sel.appendChild(noMatchOpt);
      CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        sel.appendChild(opt);
      });
      sel.value = suggested || '';
      row.appendChild(sel);

      // Wire up events
      cb.addEventListener('change', () => {
        rowState.get(assignment.id).checked = cb.checked;
      });
      sel.addEventListener('change', () => {
        rowState.get(assignment.id).selectedCat = sel.value || null;
        // Auto-check when the user picks a category
        if (sel.value) {
          cb.checked = true;
          rowState.get(assignment.id).checked = true;
        }
      });

      rows.push(row);
      listWrap.appendChild(row);
    });
    modal.appendChild(listWrap);

    // Footer buttons
    const footer = document.createElement('div');
    footer.style.cssText = [
      'padding:16px 24px; border-top:1px solid rgba(255,255,255,.08);',
      'display:flex; justify-content:flex-end; gap:10px;'
    ].join('');

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'tc-btn';
    cancelBtn.style.cssText = 'padding:9px 18px; font-size:13px;';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const applyBtn = document.createElement('button');
    applyBtn.className = 'tc-btn';
    applyBtn.style.cssText = 'padding:9px 18px; font-size:13px; background:rgba(96,165,250,.20); border-color:rgba(96,165,250,.50); color:#60a5fa;';
    applyBtn.textContent = 'Apply Selected';

    applyBtn.addEventListener('click', async () => {
      applyBtn.disabled = true;
      applyBtn.textContent = 'Applying\u2026';

      const toApply = [...rowState.entries()]
        .filter(([, s]) => s.checked && s.selectedCat)
        .map(([id, s]) => ({ id, category: s.selectedCat }));

      if (toApply.length === 0) {
        overlay.remove();
        return;
      }

      let successCount = 0;
      let failCount = 0;
      for (const { id, category } of toApply) {
        try {
          const a = assignmentsData.find(x => x.id === id);
          if (!a) continue;
          const existingMeta = a.meta && typeof a.meta === 'object' ? a.meta : {};
          const updatedMeta = { ...existingMeta, category };
          await db.updateAssignment(id, { meta: updatedMeta });
          // Patch local cache
          const idx = assignmentsData.findIndex(x => x.id === id);
          if (idx !== -1) assignmentsData[idx] = { ...assignmentsData[idx], meta: updatedMeta };
          successCount++;
        } catch (_e) { console.warn('[tc-library] Failed to update assignment category:', _e); failCount++; }
      }

      overlay.remove();

      if (failCount > 0 && successCount === 0) {
        showToast(`\u274c Failed to categorize assignments. Please try again.`, '#ef4444', '#fff');
      } else if (failCount > 0) {
        showToast(`\u2705 Categorized ${successCount} assignment${successCount !== 1 ? 's' : ''} (\u26a0\ufe0f ${failCount} failed)`, '#fbbf24', '#000');
      } else {
        showToast(`\u2705 Categorized ${successCount} assignment${successCount !== 1 ? 's' : ''}`);
      }
      renderAssignmentsTab();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(applyBtn);
    modal.appendChild(footer);

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  // ── Analytics Dashboard ───────────────────────────────────────────────────────

  function renderAnalyticsSection(filtered, upcomingList, currentList, finalizedList) {
    const laneId = 'analytics';
    const expanded = isLaneExpanded(laneId);

    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:16px;';

    // Collapsible header
    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex; align-items:center; gap:10px; padding:10px 16px;',
      'background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10);',
      `border-radius:${expanded ? '10px 10px 0 0' : '10px'}; cursor:pointer; user-select:none;`,
      'transition:background .15s ease;'
    ].join('');

    const toggleIcon = document.createElement('span');
    toggleIcon.style.cssText = `font-size:13px; display:inline-block; transform:rotate(${expanded ? '0deg' : '-90deg'}); transition:transform .2s;`;
    toggleIcon.textContent = '\u25be';
    header.appendChild(toggleIcon);

    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-size:14px; font-weight:600;';
    titleEl.textContent = '\uD83D\uDCCA Analytics';
    header.appendChild(titleEl);

    header.addEventListener('click', () => toggleLane(laneId));
    section.appendChild(header);

    if (!expanded) return section;

    // ── Content ───────────────────────────────────────────────────────────────
    const card = document.createElement('div');
    card.className = 'tc-card tc-lib-analytics-grid';
    card.style.cssText = [
      'padding:16px 20px; border-top:none; border-radius:0 0 10px 10px;',
      'display:grid; grid-template-columns:1fr 1fr; gap:20px;'
    ].join('');

    // ── 1. Category Distribution ──────────────────────────────────────────────
    const catPanel = document.createElement('div');
    const catPanelTitle = document.createElement('div');
    catPanelTitle.style.cssText = 'font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,.45); margin-bottom:10px;';
    catPanelTitle.textContent = 'Category Distribution';
    catPanel.appendChild(catPanelTitle);

    const catCounts = {};
    let uncatCount = 0;
    filtered.forEach(a => {
      const cat = getAssignmentCategory(a);
      if (cat === 'Uncategorized') {
        uncatCount++;
      } else {
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      }
    });
    const allCatValues = [...Object.values(catCounts)];
    if (uncatCount > 0) allCatValues.push(uncatCount);
    const maxCatVal = allCatValues.length > 0 ? Math.max(...allCatValues) : 0;

    if (maxCatVal === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:rgba(255,255,255,.40); font-size:13px;';
      empty.textContent = 'No assignments';
      catPanel.appendChild(empty);
    } else {
      const renderCatBar = (name, count) => {
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom:7px;';
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:3px;';
        topRow.appendChild(renderCategoryBadge(name));
        const countEl = document.createElement('span');
        countEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.55); margin-left:auto;';
        countEl.textContent = String(count);
        topRow.appendChild(countEl);
        row.appendChild(topRow);
        const barTrack = document.createElement('div');
        barTrack.style.cssText = 'height:4px; background:rgba(255,255,255,.10); border-radius:2px; overflow:hidden;';
        const barFill = document.createElement('div');
        const fillColor = CATEGORY_COLORS[name] ? CATEGORY_COLORS[name].color : 'rgba(255,255,255,.40)';
        const pct = maxCatVal > 0 ? Math.round(count / maxCatVal * 100) : 0;
        barFill.style.cssText = `height:100%; width:${pct}%; background:${fillColor}; border-radius:2px;`;
        barTrack.appendChild(barFill);
        row.appendChild(barTrack);
        return row;
      };
      Object.entries(catCounts)
        .sort(([, a], [, b]) => b - a)
        .forEach(([cat, count]) => catPanel.appendChild(renderCatBar(cat, count)));
      if (uncatCount > 0) catPanel.appendChild(renderCatBar('Uncategorized', uncatCount));
    }
    card.appendChild(catPanel);

    // ── 2. Lane Distribution ──────────────────────────────────────────────────
    const lanePanel = document.createElement('div');
    const lanePanelTitle = document.createElement('div');
    lanePanelTitle.style.cssText = 'font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,.45); margin-bottom:10px;';
    lanePanelTitle.textContent = 'Lane Distribution';
    lanePanel.appendChild(lanePanelTitle);

    const upCount = upcomingList.length;
    const curCount = currentList.length;
    const finCount = finalizedList.length;
    const laneTotal = upCount + curCount + finCount;

    if (laneTotal === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:rgba(255,255,255,.40); font-size:13px;';
      empty.textContent = 'No assignments';
      lanePanel.appendChild(empty);
    } else {
      const upPct  = Math.round(upCount  / laneTotal * 100);
      const curPct = Math.round(curCount / laneTotal * 100);
      const finPct = Math.max(0, 100 - upPct - curPct);
      const laneBarDef = [
        [upPct,  'rgba(255,255,255,.30)'],
        [curPct, '#60a5fa'],
        [finPct, '#4ade80']
      ];
      const stackedBar = document.createElement('div');
      stackedBar.style.cssText = 'display:flex; height:10px; border-radius:5px; overflow:hidden; gap:2px; margin-bottom:10px;';
      laneBarDef.forEach(([pct, color]) => {
        if (pct <= 0) return;
        const seg = document.createElement('div');
        seg.style.cssText = `flex:${pct}; background:${color}; height:100%; min-width:2px;`;
        stackedBar.appendChild(seg);
      });
      lanePanel.appendChild(stackedBar);

      const laneItems = [
        ['\uD83D\uDCCB Upcoming',  upCount,  'rgba(255,255,255,.30)'],
        ['\uD83D\uDD04 Active',    curCount, '#60a5fa'],
        ['\u2705 Finalized',       finCount, '#4ade80']
      ];
      const legend = document.createElement('div');
      legend.style.cssText = 'display:flex; flex-direction:column; gap:5px;';
      laneItems.forEach(([label, count, color]) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:12px;';
        const dot = document.createElement('span');
        dot.style.cssText = `width:8px; height:8px; border-radius:50%; background:${color}; flex-shrink:0;`;
        const lbl = document.createElement('span');
        lbl.style.cssText = 'color:rgba(255,255,255,.65);';
        lbl.textContent = label;
        const cnt = document.createElement('span');
        cnt.style.cssText = 'margin-left:auto; font-weight:500;';
        cnt.textContent = `${count}\u00a0(${laneTotal > 0 ? Math.round(count / laneTotal * 100) : 0}%)`;
        item.appendChild(dot);
        item.appendChild(lbl);
        item.appendChild(cnt);
        legend.appendChild(item);
      });
      lanePanel.appendChild(legend);
    }
    card.appendChild(lanePanel);

    // ── 3. Score Distribution (Finalized only) ────────────────────────────────
    const scorePanel = document.createElement('div');
    const scorePanelTitle = document.createElement('div');
    scorePanelTitle.style.cssText = 'font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,.45); margin-bottom:10px;';
    scorePanelTitle.textContent = 'Score Distribution (Finalized)';
    scorePanel.appendChild(scorePanelTitle);

    let greenCount = 0, amberCount = 0, redCount = 0, noScoreCount = 0;
    finalizedList.forEach(a => {
      const stats = getAssignmentStats(a, instancesData, submissionsData);
      if (stats.avgScore == null) noScoreCount++;
      else if (stats.avgScore >= 80) greenCount++;
      else if (stats.avgScore >= 60) amberCount++;
      else redCount++;
    });

    if (finalizedList.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:rgba(255,255,255,.40); font-size:13px;';
      empty.textContent = 'No finalized assignments';
      scorePanel.appendChild(empty);
    } else {
      const scoreDef = [
        ['\u2705 \u226580%',     greenCount,   '#4ade80'],
        ['\u26a0\ufe0f 60\u201379%', amberCount, '#fbbf24'],
        ['\u274c <60%',          redCount,     '#f87171'],
        ['\u2014 No score',      noScoreCount, 'rgba(255,255,255,.30)']
      ];
      const maxScoreVal = Math.max(0, greenCount, amberCount, redCount, noScoreCount);
      scoreDef.forEach(([label, count, color]) => {
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom:7px;';
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; align-items:center; margin-bottom:3px; font-size:12px;';
        const lbl = document.createElement('span');
        lbl.style.cssText = 'color:rgba(255,255,255,.65);';
        lbl.textContent = label;
        const cnt = document.createElement('span');
        cnt.style.cssText = 'margin-left:auto; font-weight:500;';
        cnt.textContent = String(count);
        topRow.appendChild(lbl);
        topRow.appendChild(cnt);
        row.appendChild(topRow);
        const barTrack = document.createElement('div');
        barTrack.style.cssText = 'height:4px; background:rgba(255,255,255,.10); border-radius:2px; overflow:hidden;';
        const barFill = document.createElement('div');
        const pct = maxScoreVal > 0 ? Math.round(count / maxScoreVal * 100) : 0;
        barFill.style.cssText = `height:100%; width:${pct}%; background:${color}; border-radius:2px;`;
        barTrack.appendChild(barFill);
        row.appendChild(barTrack);
        scorePanel.appendChild(row);
      });
    }
    card.appendChild(scorePanel);
    section.appendChild(card);

    // ── 4. Recent Activity Timeline ───────────────────────────────────────────
    const recentSorted = [...filtered]
      .filter(a => a.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    if (recentSorted.length > 0) {
      // Build a lookup: id → lane (using the pre-computed lists to avoid re-running computeLane)
      const laneById = new Map();
      upcomingList.forEach(a => laneById.set(a.id, 'upcoming'));
      currentList.forEach(a => laneById.set(a.id, 'current'));
      finalizedList.forEach(a => laneById.set(a.id, 'finalized'));

      const timelineCard = document.createElement('div');
      timelineCard.className = 'tc-card';
      timelineCard.style.cssText = 'padding:14px 20px; margin-top:8px;';
      const tlTitle = document.createElement('div');
      tlTitle.style.cssText = 'font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,.45); margin-bottom:10px;';
      tlTitle.textContent = 'Recent Activity';
      timelineCard.appendChild(tlTitle);

      const tlLaneLabels = { upcoming: '\uD83D\uDCCB Upcoming', current: '\uD83D\uDD04 Active', finalized: '\u2705 Finalized' };
      recentSorted.forEach((a, i) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; align-items:center; gap:10px; padding:6px 0;' +
          (i < recentSorted.length - 1 ? ' border-bottom:1px solid rgba(255,255,255,.07);' : '');

        const titleSpan = document.createElement('span');
        titleSpan.style.cssText = 'flex:1; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        titleSpan.textContent = a.title || '(Untitled)';
        item.appendChild(titleSpan);

        item.appendChild(renderCategoryBadge(getAssignmentCategory(a)));

        const laneSpan = document.createElement('span');
        laneSpan.style.cssText = 'font-size:11px; color:rgba(255,255,255,.45); white-space:nowrap;';
        const itemLane = laneById.get(a.id) || 'upcoming';
        laneSpan.textContent = tlLaneLabels[itemLane] || itemLane;
        item.appendChild(laneSpan);

        const dateSpan = document.createElement('span');
        dateSpan.style.cssText = 'font-size:11px; color:rgba(255,255,255,.35); white-space:nowrap;';
        dateSpan.textContent = relDate(a.created_at);
        item.appendChild(dateSpan);

        timelineCard.appendChild(item);
      });
      section.appendChild(timelineCard);
    }

    return section;
  }

  // ── Main Assignments Tab Renderer ─────────────────────────────────────────────

  function renderAssignmentsTab() {
    const container = $("assignmentsTab");
    if (!container) return;
    container.innerHTML = '';

    // Clean up any stale floating bulk bar from a previous render
    const staleBar = document.getElementById('tcLibBulkBar');
    if (staleBar) staleBar.remove();

    // Sync status row
    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:16px; font-size:14px; color:rgba(255,255,255,.60);';
    statusRow.appendChild(document.createTextNode('Status:\u00a0'));
    statusRow.appendChild(getSyncStatusBadge());
    container.appendChild(statusRow);

    // KPI grid
    const kpis = calculateAssignmentKPIs();
    const kpiGrid = document.createElement('div');
    kpiGrid.className = 'tc-lib-kpi-grid';
    kpiGrid.appendChild(renderKPI('\uD83D\uDCCB Upcoming', kpis.upcomingCount));
    kpiGrid.appendChild(renderKPI('\uD83D\uDD04 In Progress', kpis.currentCount, '#60a5fa'));
    kpiGrid.appendChild(renderKPI('\u2705 Finalized', kpis.finalizedCount, '#4ade80'));
    const avgColor = kpis.avgScore != null ? scoreColor(kpis.avgScore) : 'rgba(255,255,255,.40)';
    kpiGrid.appendChild(renderKPI('\uD83D\uDCCA Avg Score', kpis.avgScore != null ? kpis.avgScore + '%' : null, avgColor));
    container.appendChild(kpiGrid);

    // Pre-compute filtered + lane lists (shared by analytics section and lane rendering)
    const filtered = filterAssignments();
    const upcomingList   = filtered.filter(a => computeLane(a, instancesData) === 'upcoming');
    const currentList    = filtered.filter(a => computeLane(a, instancesData) === 'current');
    const finalizedList  = filtered.filter(a => computeLane(a, instancesData) === 'finalized');

    // Analytics section (between KPI row and filter bar)
    container.appendChild(renderAnalyticsSection(filtered, upcomingList, currentList, finalizedList));

    // Filter bar
    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'margin-bottom:16px; display:flex; flex-wrap:wrap; gap:12px; align-items:center;';

    // Class filter buttons
    const classBtnWrap = document.createElement('div');
    classBtnWrap.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';
    const allClassBtn = document.createElement('button');
    allClassBtn.className = 'tc-lib-class-filter tc-btn';
    allClassBtn.dataset.class = 'All Classes';
    allClassBtn.textContent = 'All Classes';
    classBtnWrap.appendChild(allClassBtn);
    CANON_CLASSES.forEach(cls => {
      const btn = document.createElement('button');
      btn.className = 'tc-lib-class-filter tc-btn';
      btn.dataset.class = cls;
      btn.textContent = cls;
      classBtnWrap.appendChild(btn);
    });
    filterBar.appendChild(classBtnWrap);

    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'assignmentSearch';
    searchInput.className = 'tc-input';
    searchInput.placeholder = 'Search assignments...';
    searchInput.value = filters.assignments.searchQuery;
    searchInput.style.cssText = 'flex:1; min-width:180px; padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white;';
    filterBar.appendChild(searchInput);

    // Type filter
    const typeFilter = document.createElement('select');
    typeFilter.id = 'assignmentTypeFilter';
    typeFilter.className = 'tc-input';
    typeFilter.style.cssText = 'padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white;';
    ASSIGNMENT_TYPE_OPTIONS.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      typeFilter.appendChild(opt);
    });
    typeFilter.value = filters.assignments.typeFilter;
    filterBar.appendChild(typeFilter);

    // Category filter
    const catFilter = document.createElement('select');
    catFilter.id = 'assignmentCategoryFilter';
    catFilter.className = 'tc-input';
    catFilter.style.cssText = 'padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white;';
    const allCatOpt = document.createElement('option');
    allCatOpt.value = 'All';
    allCatOpt.textContent = 'All Categories';
    catFilter.appendChild(allCatOpt);
    const uncatOpt = document.createElement('option');
    uncatOpt.value = 'Uncategorized';
    uncatOpt.textContent = 'Uncategorized';
    catFilter.appendChild(uncatOpt);
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catFilter.appendChild(opt);
    });
    catFilter.value = filters.assignments.categoryFilter;
    filterBar.appendChild(catFilter);

    // Bulk Categorize button
    const bulkBtn = document.createElement('button');
    bulkBtn.className = 'tc-btn';
    bulkBtn.id = 'bulkCategorizeBtn';
    bulkBtn.style.cssText = 'padding:8px 14px; font-size:13px; white-space:nowrap;' +
      (bulkEditMode ? ' background:rgba(251,191,36,.20); border-color:rgba(251,191,36,.50); color:#fbbf24;' : '');
    bulkBtn.textContent = bulkEditMode ? '\u2715 Exit Bulk Edit' : '\u270f\ufe0f Bulk Categorize';
    filterBar.appendChild(bulkBtn);

    // Auto-Categorize button — only shown when there are uncategorized assignments
    const uncategorizedCount = assignmentsData.filter(a => getAssignmentCategory(a) === 'Uncategorized').length;
    if (uncategorizedCount > 0) {
      const autoBtn = document.createElement('button');
      autoBtn.className = 'tc-btn';
      autoBtn.id = 'autoCategorizeBtn';
      autoBtn.style.cssText = 'padding:8px 14px; font-size:13px; white-space:nowrap;';
      autoBtn.textContent = `\uD83C\uDFF7\uFE0F Auto-Categorize (${uncategorizedCount})`;
      autoBtn.addEventListener('click', () => showSmartSuggestModal());
      filterBar.appendChild(autoBtn);
    }

    container.appendChild(filterBar);

    // Uncategorized banner (only when there are uncategorized assignments and not in bulk mode)
    if (uncategorizedCount > 0 && !bulkEditMode) {
      const banner = document.createElement('div');
      banner.style.cssText = [
        'display:flex; align-items:center; gap:10px;',
        'background:rgba(251,191,36,.12); border:1px solid rgba(251,191,36,.30);',
        'border-radius:8px; padding:10px 16px; margin-bottom:20px;',
        'font-size:13px; color:#fbbf24;'
      ].join('');
      const bannerText = document.createElement('span');
      bannerText.style.cssText = 'flex:1;';
      bannerText.textContent = `\u26a0\ufe0f You have ${uncategorizedCount} assignment${uncategorizedCount !== 1 ? 's' : ''} without a category.`;
      banner.appendChild(bannerText);
      const bannerBtn = document.createElement('button');
      bannerBtn.className = 'tc-btn';
      bannerBtn.style.cssText = 'font-size:12px; padding:4px 10px; color:#fbbf24; border-color:rgba(251,191,36,.40); background:rgba(251,191,36,.10);';
      bannerBtn.textContent = '\u270f\ufe0f Bulk Categorize \u2192';
      bannerBtn.addEventListener('click', () => {
        bulkEditMode = true;
        selectedAssignmentIds.clear();
        // Pre-select uncategorized
        assignmentsData.forEach(a => {
          if (getAssignmentCategory(a) === 'Uncategorized') selectedAssignmentIds.add(a.id);
        });
        renderAssignmentsTab();
      });
      banner.appendChild(bannerBtn);
      container.appendChild(banner);
    }

    // Empty state if no assignments at all
    if (assignmentsData.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'tc-card';
      emptyCard.style.cssText = 'text-align:center; padding:48px 24px;';
      const emptyIcon = document.createElement('div');
      emptyIcon.style.cssText = 'font-size:48px; margin-bottom:16px;';
      emptyIcon.textContent = '\uD83D\uDCED';
      const emptyTitle = document.createElement('h3');
      emptyTitle.style.cssText = 'margin:0 0 8px 0; font-size:20px;';
      emptyTitle.textContent = 'No assignments yet';
      emptyCard.appendChild(emptyIcon);
      emptyCard.appendChild(emptyTitle);
      const emptyMsg = document.createElement('p');
      emptyMsg.style.cssText = 'margin:0; color:rgba(255,255,255,.60);';
      // SAFETY: static text + static link, no user data
      emptyMsg.innerHTML = 'Create one in <a href="/teacher/work/" style="color:#60a5fa;">Work \u2192</a>';
      emptyCard.appendChild(emptyMsg);
      container.appendChild(emptyCard);
    } else {
      container.appendChild(
        renderLaneSection('upcoming', '\uD83D\uDCCB', 'Upcoming', upcomingList.length, (div) => {
          div.appendChild(renderUpcomingLane(upcomingList));
        })
      );
      container.appendChild(
        renderLaneSection('current', '\uD83D\uDD04', 'Active', currentList.length, (div) => {
          div.appendChild(renderCurrentLane(currentList));
        })
      );
      container.appendChild(
        renderLaneSection('finalized', '\u2705', 'Finalized', finalizedList.length, (div) => {
          div.appendChild(renderFinalizedLane(finalizedList));
        })
      );

      if (filtered.length === 0) {
        const hint = document.createElement('div');
        hint.style.cssText = 'text-align:center; padding:24px; color:rgba(255,255,255,.40); font-size:14px;';
        hint.textContent = 'No assignments match the current filters.';
        container.appendChild(hint);
      }

      // Floating bulk action bar
      if (bulkEditMode) {
        renderBulkActionBar();
      }
    }

    updateActiveClassFilter();
  }

  // ── Sync Status Badge ─────────────────────────────────────────────────────────

  function getSyncStatusBadge() {
    const span = document.createElement('span');
    span.style.cssText = 'display:inline-flex;align-items:center;gap:5px;color:#e8f1ec;';
    const dot = document.createElement('span');
    const text = document.createElement('span');
    if (syncStatus === 'synced') {
      dot.className = 'rc-status-dot rc-status-dot--ok';
      text.textContent = 'Synced';
    } else if (syncStatus === 'local') {
      dot.className = 'rc-status-dot rc-status-dot--warn';
      text.textContent = 'Local';
    } else if (syncStatus === 'error') {
      dot.className = 'rc-status-dot rc-status-dot--error';
      text.textContent = 'Error';
      span.style.color = '#e8f1ec';
    } else {
      dot.className = 'rc-status-dot rc-status-dot--loading';
      text.textContent = 'Loading...';
      span.style.color = 'rgba(255,255,255,.40)';
    }
    span.appendChild(dot);
    span.appendChild(text);
    return span;
  }

  // ── Lessons Tab ───────────────────────────────────────────────────────────────

  function renderLessonsTab() {
    const container = $("lessonsTab");
    if (!container) return;
    container.innerHTML = '';

    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'margin-bottom: 24px;';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'lessonSearch';
    searchInput.className = 'tc-input';
    searchInput.placeholder = 'Search lessons, units, sections...';
    searchInput.value = filters.lessons.searchQuery;
    searchInput.style.cssText = 'width: 100%; padding: 12px 16px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: white; font-size: 16px;';
    searchWrap.appendChild(searchInput);
    container.appendChild(searchWrap);

    if (!lessonsData || !lessonsData.sections) {
      // SAFETY: static text, no user data
      const emptyCard = document.createElement('div');
      emptyCard.className = 'tc-card';
      emptyCard.style.cssText = 'text-align: center; padding: 48px 24px;';
      emptyCard.innerHTML = '<div style="font-size: 48px; margin-bottom: 16px;">📚</div><h3 style="margin: 0 0 8px 0; font-size: 20px;">Lessons index not available</h3><p style="margin: 0; color: rgba(255,255,255,.60);">Run the generator script to build the lessons index.</p>';
      container.appendChild(emptyCard);
    } else {
      const filteredSections = filterLessons();
      if (filteredSections.length === 0) {
        // SAFETY: static text, no user data
        const emptyCard = document.createElement('div');
        emptyCard.className = 'tc-card';
        emptyCard.style.cssText = 'text-align: center; padding: 48px 24px;';
        emptyCard.innerHTML = '<div style="font-size: 48px; margin-bottom: 16px;">🔍</div><h3 style="margin: 0 0 8px 0; font-size: 20px;">No lessons found</h3><p style="margin: 0; color: rgba(255,255,255,.60);">Try a different search term</p>';
        container.appendChild(emptyCard);
      } else {
        const listWrap = document.createElement('div');
        listWrap.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
        filteredSections.forEach((section, sIdx) => {
          listWrap.appendChild(renderLessonSection(section, sIdx));
        });
        container.appendChild(listWrap);
      }
    }
  }

  function filterLessons() {
    if (!lessonsData || !lessonsData.sections) return [];
    const query = filters.lessons.searchQuery.toLowerCase().trim();
    if (!query) return lessonsData.sections;
    return lessonsData.sections
      .map(section => {
        if (section.name.toLowerCase().includes(query)) return section;
        const filteredUnits = section.units
          .map(unit => {
            if (unit.name.toLowerCase().includes(query)) return unit;
            const filteredPresentations = unit.presentations.filter(pres =>
              pres.name.toLowerCase().includes(query)
            );
            if (filteredPresentations.length > 0) return { ...unit, presentations: filteredPresentations };
            return null;
          })
          .filter(unit => unit !== null);
        if (filteredUnits.length > 0) return { ...section, units: filteredUnits };
        return null;
      })
      .filter(section => section !== null);
  }

  function renderLessonSection(section, sectionIndex) {
    const sectionId = `section-${sectionIndex}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'tc-card lesson-section';
    wrapper.style.cssText = 'padding: 0; overflow: hidden;';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'lesson-section-toggle';
    toggleBtn.dataset.target = sectionId;
    toggleBtn.style.cssText = 'width: 100%; padding: 20px; background: transparent; border: none; color: white; text-align: left; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 18px; font-weight: 600;';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = section.name;
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toggle-icon';
    iconSpan.style.cssText = 'font-size: 20px; transition: transform 0.2s;';
    iconSpan.textContent = '\u25bc';
    toggleBtn.appendChild(nameSpan);
    toggleBtn.appendChild(iconSpan);
    wrapper.appendChild(toggleBtn);
    const contentDiv = document.createElement('div');
    contentDiv.id = sectionId;
    contentDiv.className = 'lesson-section-content';
    contentDiv.style.cssText = 'display: none; padding: 0 20px 20px 20px;';
    section.units.forEach((unit, uIdx) => {
      contentDiv.appendChild(renderLessonUnit(unit, sectionIndex, uIdx));
    });
    wrapper.appendChild(contentDiv);
    return wrapper;
  }

  function renderLessonUnit(unit, sectionIndex, unitIndex) {
    const unitId = `unit-${sectionIndex}-${unitIndex}`;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top: 16px; border-left: 2px solid rgba(255,255,255,.10); padding-left: 16px;';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'lesson-unit-toggle';
    toggleBtn.dataset.target = unitId;
    toggleBtn.style.cssText = 'width: 100%; padding: 12px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.10); border-radius: 8px; color: white; text-align: left; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 500;';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = unit.name;
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toggle-icon';
    iconSpan.style.cssText = 'font-size: 16px; transition: transform 0.2s;';
    iconSpan.textContent = '\u25b6';
    toggleBtn.appendChild(nameSpan);
    toggleBtn.appendChild(iconSpan);
    wrapper.appendChild(toggleBtn);
    const contentDiv = document.createElement('div');
    contentDiv.id = unitId;
    contentDiv.className = 'lesson-unit-content';
    contentDiv.style.cssText = 'display: none; margin-top: 12px;';
    unit.presentations.forEach(pres => contentDiv.appendChild(renderPresentation(pres)));
    wrapper.appendChild(contentDiv);
    return wrapper;
  }

  function renderPresentation(presentation) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tc-card';
    wrapper.style.cssText = 'padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px;';
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'flex: 1; font-size: 15px;';
    nameSpan.textContent = presentation.name;
    wrapper.appendChild(nameSpan);
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 8px;';
    const openLink = document.createElement('a');
    // Safe href: only use the URL as-is; the browser will handle it
    openLink.href = presentation.url || '#';
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.className = 'tc-btn';
    openLink.style.cssText = 'font-size: 13px; padding: 6px 12px; text-decoration: none;';
    openLink.textContent = 'Open';
    btnGroup.appendChild(openLink);
    wrapper.appendChild(btnGroup);
    return wrapper;
  }

  // ── Event Listeners ───────────────────────────────────────────────────────────

  function attachEventListeners() {
    // Tab switching
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.tc-lib-tab-btn');
      if (tabBtn) switchTab(tabBtn.dataset.tab);
    });

    // Class filter buttons
    document.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('.tc-lib-class-filter');
      if (filterBtn) {
        filters.assignments.classFilter = filterBtn.dataset.class;
        renderAssignmentsTab();
      }
    });

    // Lane header collapse/expand
    document.addEventListener('click', (e) => {
      const laneHeader = e.target.closest('.tc-lib-lane-header');
      if (laneHeader) {
        const laneId = laneHeader.dataset.lane;
        if (laneId) toggleLane(laneId);
      }
    });

    // Hierarchy node collapse/expand
    document.addEventListener('click', (e) => {
      const hierNode = e.target.closest('.tc-hier-node');
      if (hierNode) {
        const nodeId = hierNode.dataset.hierNode;
        if (nodeId) toggleHierarchy(nodeId);
      }
    });

    // Assignment search
    document.addEventListener('input', (e) => {
      if (e.target.id === 'assignmentSearch') {
        filters.assignments.searchQuery = e.target.value;
        renderAssignmentsTab();
      }
    });

    // Type filter
    document.addEventListener('change', (e) => {
      if (e.target.id === 'assignmentTypeFilter') {
        filters.assignments.typeFilter = e.target.value;
        renderAssignmentsTab();
      }
    });

    // Category filter
    document.addEventListener('change', (e) => {
      if (e.target.id === 'assignmentCategoryFilter') {
        filters.assignments.categoryFilter = e.target.value;
        renderAssignmentsTab();
      }
    });

    // Lesson search
    document.addEventListener('input', (e) => {
      if (e.target.id === 'lessonSearch') {
        filters.lessons.searchQuery = e.target.value;
        renderLessonsTab();
      }
    });

    // Section/unit toggle (Lessons tab)
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('.lesson-section-toggle, .lesson-unit-toggle');
      if (toggle) {
        const targetId = toggle.dataset.target;
        const content = $(targetId);
        const icon = toggle.querySelector('.toggle-icon');
        if (content) {
          const isExpanded = content.style.display !== 'none';
          content.style.display = isExpanded ? 'none' : 'block';
          if (icon) {
            if (toggle.classList.contains('lesson-section-toggle')) {
              icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
            } else {
              icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(90deg)';
            }
          }
        }
      }
    });

    // Bulk Categorize button
    document.addEventListener('click', (e) => {
      if (e.target.closest('#bulkCategorizeBtn')) {
        e.stopPropagation();
        bulkEditMode = !bulkEditMode;
        if (!bulkEditMode) selectedAssignmentIds.clear();
        renderAssignmentsTab();
      }
    });

    // Assignment card click — avoid triggering on buttons/headers
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.assignment-card');
      if (
        card &&
        !e.target.closest('button') &&
        !e.target.closest('select') &&
        !e.target.closest('label') &&
        !e.target.closest('input[type="checkbox"]') &&
        !e.target.closest('.tc-lib-lane-header') &&
        !e.target.closest('.tc-hier-node')
      ) {
        if (bulkEditMode) {
          // Toggle selection
          const id = card.dataset.id;
          if (selectedAssignmentIds.has(id)) selectedAssignmentIds.delete(id);
          else selectedAssignmentIds.add(id);
          // Refresh card highlight and bar count
          const isNowSelected = selectedAssignmentIds.has(id);
          card.style.borderColor = isNowSelected ? 'rgba(96,165,250,.60)' : '';
          card.style.background = isNowSelected ? 'rgba(96,165,250,.08)' : '';
          const cb = card.querySelector('input[type="checkbox"]');
          if (cb) cb.checked = isNowSelected;
          const barCountEl = document.querySelector('#tcLibBulkBar span');
          if (barCountEl) barCountEl.textContent = `${selectedAssignmentIds.size} selected`;
        } else {
          showAssignmentDetail(card.dataset.id);
        }
      }
    });

    // Issue button
    document.addEventListener('click', (e) => {
      const issueBtn = e.target.closest('.issue-btn');
      if (issueBtn) {
        e.stopPropagation();
        const assignmentId = issueBtn.dataset.id;
        window.location.href = `/teacher/work/?assignment=${encodeURIComponent(assignmentId)}`;
      }
    });

    // Export button
    const exportBtn = $('exportLibraryBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportLibraryJSON);

    // Upload Paper Assignment button
    const uploadBtn = $('uploadPaperBtn');
    if (uploadBtn) uploadBtn.addEventListener('click', openUploadPaperModal);
  }

  // ── Assignment Detail Modal ───────────────────────────────────────────────────

  function showAssignmentDetail(assignmentId) {
    const assignment = assignmentsData.find(a => a.id === assignmentId);
    if (!assignment) return;

    const overlay = document.createElement('div');
    overlay.id = 'assignmentDetailOverlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.80); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 24px;
    `;

    const createdDate = assignment.created_at
      ? new Date(assignment.created_at).toLocaleString()
      : 'Unknown';

    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px;';

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px;';
    const titleEl = document.createElement('h2');
    titleEl.style.cssText = 'margin: 0; font-size: 24px;';
    titleEl.textContent = assignment.title || 'Untitled';
    const closeBtn = document.createElement('button');
    closeBtn.id = 'closeDetailBtn';
    closeBtn.className = 'tc-btn';
    closeBtn.style.cssText = 'padding: 8px 16px;';
    closeBtn.textContent = '\u2715 Close';
    headerRow.appendChild(titleEl);
    headerRow.appendChild(closeBtn);
    card.appendChild(headerRow);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; gap: 16px; margin-bottom: 24px;';

    function makeDetailRow(labelText, valueNode) {
      const row = document.createElement('div');
      const lbl = document.createElement('div');
      lbl.style.cssText = 'color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 4px;';
      lbl.textContent = labelText;
      row.appendChild(lbl);
      if (typeof valueNode === 'string') {
        const val = document.createElement('div');
        val.textContent = valueNode;
        row.appendChild(val);
      } else {
        row.appendChild(valueNode);
      }
      return row;
    }

    grid.appendChild(makeDetailRow('Type', assignment.type || 'file'));

    const category = getAssignmentCategory(assignment);
    grid.appendChild(makeDetailRow('Category', renderCategoryBadge(category)));

    if (assignment.series) grid.appendChild(makeDetailRow('Class', assignment.series));
    grid.appendChild(makeDetailRow('Created', createdDate));

    const lane = computeLane(assignment, instancesData);
    const laneLabels = { upcoming: '\uD83D\uDCCB Upcoming', current: '\uD83D\uDD04 Active', finalized: '\u2705 Finalized' };
    grid.appendChild(makeDetailRow('Status', laneLabels[lane] || lane));

    const stats = getAssignmentStats(assignment, instancesData, submissionsData);
    if (stats.studentCount > 0) {
      grid.appendChild(makeDetailRow('Students', String(stats.studentCount)));
      if (stats.avgScore != null) {
        const scoreSpan = document.createElement('span');
        scoreSpan.style.cssText = `font-weight:600; color:${scoreColor(stats.avgScore)};`;
        scoreSpan.textContent = `${stats.avgScore}%`;
        grid.appendChild(makeDetailRow('Average Score', scoreSpan));
      }
    }

    if (assignment.meta) {
      const metaRow = document.createElement('div');
      const metaLbl = document.createElement('div');
      metaLbl.style.cssText = 'color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 4px;';
      metaLbl.textContent = 'Mapping / Meta';
      const metaVal = document.createElement('div');
      metaVal.style.cssText = 'background: rgba(0,0,0,.3); padding: 12px; border-radius: 8px; white-space: pre-wrap; font-family: monospace; font-size: 13px;';
      metaVal.textContent = typeof assignment.meta === 'string'
        ? assignment.meta
        : JSON.stringify(assignment.meta, null, 2);
      metaRow.appendChild(metaLbl);
      metaRow.appendChild(metaVal);
      grid.appendChild(metaRow);
    }

    if (assignment.page) {
      const pageRow = document.createElement('div');
      const pageLbl = document.createElement('div');
      pageLbl.style.cssText = 'color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 4px;';
      pageLbl.textContent = 'Assignment Content Preview';
      const pageVal = document.createElement('div');
      pageVal.style.cssText = 'background: rgba(0,0,0,.3); padding: 12px; border-radius: 8px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-size: 14px;';
      const preview = String(assignment.page).substring(0, 1000);
      pageVal.textContent = preview + (String(assignment.page).length > 1000 ? '...' : '');
      pageRow.appendChild(pageLbl);
      pageRow.appendChild(pageVal);
      grid.appendChild(pageRow);
    }

    card.appendChild(grid);

    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display: flex; gap: 12px;';
    const issueBtn = document.createElement('button');
    issueBtn.className = 'tc-btn issue-detail-btn';
    issueBtn.dataset.id = assignment.id || '';
    issueBtn.style.cssText = 'flex: 1;';
    issueBtn.textContent = 'Issue to Class';
    actionRow.appendChild(issueBtn);
    card.appendChild(actionRow);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    closeBtn.addEventListener('click', () => overlay.remove());
    issueBtn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      window.location.href = `/teacher/work/?assignment=${encodeURIComponent(id)}`;
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ── Upload Paper Assignment Modal ─────────────────────────────────────────────

  async function openUploadPaperModal() {
    const todayStr = new Date().toISOString().split('T')[0];
    const overlay = document.createElement('div');
    overlay.id = 'uploadPaperOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'uploadPaperTitle');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.80); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 24px;
    `;

    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width: 560px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px;';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;';
    const titleEl = document.createElement('h2');
    titleEl.id = 'uploadPaperTitle';
    titleEl.style.cssText = 'margin: 0; font-size: 22px;';
    titleEl.textContent = 'Upload Paper Assignment';
    const closeBtn = document.createElement('button');
    closeBtn.id = 'closePaperUploadBtn';
    closeBtn.className = 'tc-btn';
    closeBtn.style.cssText = 'padding: 8px 16px;';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.textContent = '\u2715 Close';
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    card.appendChild(header);

    const form = document.createElement('form');
    form.id = 'uploadPaperForm';
    form.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

    const fieldStyle = 'width:100%; padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.2); border-radius:8px; color:white; font-size:15px; box-sizing:border-box;';
    const labelStyle = 'display:block; font-size:14px; color:rgba(255,255,255,.70); margin-bottom:6px;';

    function makeField(labelText, required, node) {
      const wrap = document.createElement('div');
      const lbl = document.createElement('label');
      lbl.style.cssText = labelStyle;
      lbl.textContent = labelText + ' ';
      if (required) {
        const req = document.createElement('span');
        req.style.color = '#f87171';
        req.setAttribute('aria-hidden', 'true');
        req.textContent = '*';
        lbl.appendChild(req);
      }
      if (node.id) lbl.setAttribute('for', node.id);
      wrap.appendChild(lbl);
      wrap.appendChild(node);
      return wrap;
    }

    // Title
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'up_title';
    titleInput.required = true;
    titleInput.style.cssText = fieldStyle;
    titleInput.placeholder = 'Assignment title';
    form.appendChild(makeField('Title', true, titleInput));

    // Class
    const classSelect = document.createElement('select');
    classSelect.id = 'up_class';
    classSelect.style.cssText = fieldStyle;
    const defaultClassOpt = document.createElement('option');
    defaultClassOpt.value = '';
    defaultClassOpt.textContent = '\u2014 Select class (optional) \u2014';
    classSelect.appendChild(defaultClassOpt);
    CANON_CLASSES.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls;
      opt.textContent = cls;
      classSelect.appendChild(opt);
    });
    form.appendChild(makeField('Class', false, classSelect));

    // Category
    const categorySelect = document.createElement('select');
    categorySelect.id = 'up_category';
    categorySelect.style.cssText = fieldStyle;
    const defaultCatOpt = document.createElement('option');
    defaultCatOpt.value = '';
    defaultCatOpt.textContent = '\u2014 Select category (optional) \u2014';
    categorySelect.appendChild(defaultCatOpt);
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      categorySelect.appendChild(opt);
    });
    form.appendChild(makeField('Category', false, categorySelect));

    // Student Code
    const studentInput = document.createElement('input');
    studentInput.type = 'text';
    studentInput.id = 'up_student_code';
    studentInput.style.cssText = fieldStyle;
    studentInput.placeholder = 'e.g. S001 (optional)';
    const studentHint = document.createElement('div');
    studentHint.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40); margin-top:4px;';
    studentHint.textContent = "If provided, links this upload to the student's history. Code is uppercased automatically.";
    const studentWrap = makeField('Student Code', false, studentInput);
    studentWrap.appendChild(studentHint);
    form.appendChild(studentWrap);

    // Date Completed
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'up_date';
    dateInput.style.cssText = fieldStyle;
    dateInput.value = todayStr;
    form.appendChild(makeField('Date Completed', false, dateInput));

    // Score Earned
    const scoreInput = document.createElement('input');
    scoreInput.type = 'number';
    scoreInput.id = 'up_score';
    scoreInput.min = '0';
    scoreInput.max = '100';
    scoreInput.step = '1';
    scoreInput.style.cssText = fieldStyle;
    scoreInput.placeholder = 'e.g. 85';
    form.appendChild(makeField('Score Earned', false, scoreInput));

    // Total Possible
    const totalPossibleInput = document.createElement('input');
    totalPossibleInput.type = 'number';
    totalPossibleInput.id = 'up_total_possible';
    totalPossibleInput.min = '1';
    totalPossibleInput.max = '1000';
    totalPossibleInput.step = '1';
    totalPossibleInput.value = '100';
    totalPossibleInput.style.cssText = fieldStyle;
    const totalPossibleWrap = makeField('Total Possible', false, totalPossibleInput);
    const gradeHint = document.createElement('div');
    gradeHint.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40); margin-top:4px;';
    gradeHint.textContent = 'Leave score blank to upload without grading.';
    totalPossibleWrap.appendChild(gradeHint);
    form.appendChild(totalPossibleWrap);

    // Notes
    const notesArea = document.createElement('textarea');
    notesArea.id = 'up_notes';
    notesArea.rows = 3;
    notesArea.style.cssText = fieldStyle + ' resize:vertical;';
    notesArea.placeholder = 'Teacher notes / comments (optional)';
    form.appendChild(makeField('Notes', false, notesArea));

    // File
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'up_file';
    fileInput.required = true;
    fileInput.accept = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.gif,.webp';
    fileInput.style.cssText = 'width:100%; color:white; font-size:14px; cursor:pointer;';
    const fileHint = document.createElement('div');
    fileHint.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40); margin-top:4px;';
    fileHint.textContent = 'PDF, JPG, PNG, HEIC/HEIF, GIF, WEBP \u2014 max 10 MB';
    const fileInfo = document.createElement('div');
    fileInfo.id = 'up_file_info';
    fileInfo.style.cssText = 'display:none; margin-top:8px; padding:8px 12px; background:rgba(34,197,94,.10); border:1px solid rgba(34,197,94,.25); border-radius:8px; font-size:13px; color:rgba(255,255,255,.80);';
    const fileWrap = makeField('File', true, fileInput);
    fileWrap.appendChild(fileHint);
    fileWrap.appendChild(fileInfo);
    form.appendChild(fileWrap);

    // Error
    const errorEl = document.createElement('div');
    errorEl.id = 'up_error';
    errorEl.style.cssText = 'display:none; padding:10px 14px; background:rgba(248,113,113,.15); border:1px solid rgba(248,113,113,.4); border-radius:8px; color:#fca5a5; font-size:14px;';
    form.appendChild(errorEl);

    // Submit
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.id = 'up_submit';
    submitBtn.className = 'tc-btn';
    submitBtn.style.cssText = 'width:100%; padding:12px; font-size:16px; background:rgba(34,197,94,.20); border-color:rgba(34,197,94,.35); display:flex; align-items:center; justify-content:center; gap:8px;';
    // SAFETY: static SVG icon + static label text, no user data
    submitBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> Upload &amp; Save';
    form.appendChild(submitBtn);

    card.appendChild(form);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const f = fileInput.files[0];
        const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
        fileInfo.style.display = 'block';
        fileInfo.textContent = '';
        const nameSpan = document.createElement('strong');
        nameSpan.textContent = f.name;
        fileInfo.appendChild(nameSpan);
        fileInfo.appendChild(document.createTextNode(` \u2014 ${sizeMB} MB`));
        if (f.size > 10 * 1024 * 1024) {
          const warn = document.createElement('span');
          warn.style.color = '#f87171';
          warn.textContent = ' (exceeds 10 MB limit)';
          fileInfo.appendChild(warn);
        }
      } else {
        fileInfo.style.display = 'none';
      }
    });

    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
      } else if (e.key === 'Tab') {
        const focusable = card.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const observer = new MutationObserver(() => {
      if (!document.body.contains(overlay)) {
        document.removeEventListener('keydown', onKeyDown);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await uploadPaperAssignment(overlay);
    });

    titleInput.focus();
  }

  // ── Upload Paper Assignment Logic ─────────────────────────────────────────────

  async function uploadPaperAssignment(overlay) {
    const errorEl = overlay.querySelector('#up_error');
    const submitBtn = overlay.querySelector('#up_submit');

    function showInlineError(msg) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
      errorEl.scrollIntoView({ block: 'nearest' });
    }
    function clearInlineError() {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }

    clearInlineError();

    const title = overlay.querySelector('#up_title').value.trim();
    const className = overlay.querySelector('#up_class').value;
    const category = overlay.querySelector('#up_category').value;
    const studentCode = overlay.querySelector('#up_student_code').value.trim().toUpperCase();
    const dateCompleted = overlay.querySelector('#up_date').value || new Date().toISOString().split('T')[0];
    const notes = overlay.querySelector('#up_notes').value.trim();
    const fileInput = overlay.querySelector('#up_file');

    const scoreRaw = overlay.querySelector('#up_score').value.trim();
    const totalPossibleRaw = overlay.querySelector('#up_total_possible').value.trim();
    const scoreEarned = scoreRaw !== '' ? Number(scoreRaw) : null;
    const totalPossible = totalPossibleRaw !== '' ? Number(totalPossibleRaw) : 100;

    if (!title) {
      showInlineError('Title is required.');
      overlay.querySelector('#up_title').focus();
      return;
    }

    if (scoreEarned !== null) {
      if (!studentCode) {
        showInlineError('Student Code is required when entering a grade.');
        overlay.querySelector('#up_student_code').focus();
        return;
      }
      if (!Number.isFinite(scoreEarned) || scoreEarned < 0) {
        showInlineError('Score Earned must be a non-negative number.');
        overlay.querySelector('#up_score').focus();
        return;
      }
      if (!Number.isFinite(totalPossible) || totalPossible < 1) {
        showInlineError('Total Possible must be at least 1.');
        overlay.querySelector('#up_total_possible').focus();
        return;
      }
      if (scoreEarned > totalPossible) {
        showInlineError('Score cannot exceed total possible points.');
        overlay.querySelector('#up_score').focus();
        return;
      }
    }

    if (!fileInput.files || fileInput.files.length === 0) {
      showInlineError('Please select a file to upload.');
      fileInput.focus();
      return;
    }

    const file = fileInput.files[0];
    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/gif', 'image/webp']);
    const allowedExts = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.gif', '.webp']);
    const fileExt = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedTypes.has(file.type) && !allowedExts.has(fileExt)) {
      showInlineError('Unsupported file type. Please upload a PDF, JPG, PNG, HEIC, HEIF, GIF, or WEBP file.');
      return;
    }
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      showInlineError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`);
      return;
    }

    submitBtn.disabled = true;
    const originalBtnHtml = submitBtn.innerHTML;
    // SAFETY: static SVG spinner, no user data
    submitBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Uploading\u2026';

    if (!document.getElementById('rcSpinStyle')) {
      const style = document.createElement('style');
      style.id = 'rcSpinStyle';
      style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    try {
      let paperUploadUrl = null;
      let gradeRecorded = false;
      const scorePercent = scoreEarned !== null ? Math.round((scoreEarned / totalPossible) * 100) : null;
      const instanceId = (assignmentId) => assignmentId + '-' + studentCode;

      if (isRemote) {
        // ── Supabase mode ──
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `paper-uploads/${Date.now()}_${safeFileName}`;
        console.log('[tc-library] Uploading paper file to storage:', storagePath);
        paperUploadUrl = await db.uploadPaperFile(file, storagePath);
        if (!paperUploadUrl) {
          showInlineError('File upload failed. Please try again.');
          submitBtn.disabled = false;
          // SAFETY: restoring original static button content, no user data
          submitBtn.innerHTML = originalBtnHtml;
          return;
        }
        console.log('[tc-library] Paper file uploaded:', paperUploadUrl);

        const assignmentMeta = {
          paper: true,
          paper_upload_url: paperUploadUrl,
          original_filename: file.name,
          date_completed: dateCompleted,
          notes: notes || null,
          student_code: studentCode || null,
        };
        if (category) assignmentMeta.category = category;
        if (scoreEarned !== null) {
          assignmentMeta.score_earned = scoreEarned;
          assignmentMeta.total_possible = totalPossible;
        }

        let newAssignment;
        try {
          newAssignment = await db.createAssignment({
            title,
            type: 'paper',
            series: className || null,
            page: paperUploadUrl,
            meta: assignmentMeta,
          });
        } catch (createErr) {
          console.error('[tc-library] Assignment create failed, cleaning up uploaded file:', createErr);
          try { await db.deletePaperFile(storagePath); } catch (_) { /* ignore */ }
          showInlineError('Failed to save assignment record. Please try again.');
          submitBtn.disabled = false;
          // SAFETY: restoring original static button content, no user data
          submitBtn.innerHTML = originalBtnHtml;
          return;
        }
        console.log('[tc-library] Paper assignment created:', newAssignment.id);

        if (studentCode && newAssignment) {
          try {
            await db.createSubmissionArchive({
              student_code: studentCode,
              assignment_id: newAssignment.id,
              title,
              class_name: className || null,
              feedback: notes || null,
              submitted_at: dateCompleted ? new Date(dateCompleted).toISOString() : new Date().toISOString(),
              archived_at: new Date().toISOString(),
              paper_upload_url: paperUploadUrl,
            });
            console.log('[tc-library] Submission archive record created for student:', studentCode);
          } catch (archiveErr) {
            console.warn('[tc-library] Could not create submission archive record (non-critical):', archiveErr.message);
          }
        }

        if (scoreEarned !== null && studentCode && newAssignment) {
          try {
            const instance = await db.upsertAssignmentInstance({
              id: instanceId(newAssignment.id),
              assignment_id: newAssignment.id,
              student_code: studentCode,
              assigned_at: dateCompleted || new Date().toISOString().split('T')[0],
              status: 'Graded'
            });
            await db.addSubmission({
              instance_id: instance.id,
              score_total: scorePercent,
              submitted_at: dateCompleted ? new Date(dateCompleted).toISOString() : new Date().toISOString()
            });
            gradeRecorded = true;
            console.log('[tc-library] Gradebook entry created:', scorePercent + '%');
          } catch (gradeErr) {
            console.warn('[tc-library] Could not create gradebook entry (non-critical):', gradeErr.message);
          }
        }

      } else {
        // ── Local mode ──
        console.log('[tc-library] Local mode \u2014 storing paper assignment metadata only');
        const assignmentMeta = {
          paper: true,
          paper_upload_url: null,
          original_filename: file.name,
          date_completed: dateCompleted,
          notes: notes || null,
          student_code: studentCode || null,
          local_note: 'File not stored in local mode',
        };
        if (category) assignmentMeta.category = category;
        if (scoreEarned !== null) {
          assignmentMeta.score_earned = scoreEarned;
          assignmentMeta.total_possible = totalPossible;
        }

        const newAssignment = await db.createAssignment({
          title,
          type: 'paper',
          series: className || null,
          page: null,
          meta: assignmentMeta,
        });

        if (studentCode) {
          try {
            await db.createSubmissionArchive({
              student_code: studentCode,
              assignment_id: newAssignment ? newAssignment.id : null,
              title,
              class_name: className || null,
              feedback: notes || null,
              submitted_at: dateCompleted ? new Date(dateCompleted).toISOString() : new Date().toISOString(),
              archived_at: new Date().toISOString(),
            });
          } catch (archiveErr) {
            console.warn('[tc-library] Could not create local archive record (non-critical):', archiveErr.message);
          }
        }

        if (scoreEarned !== null && studentCode && newAssignment) {
          try {
            const instId = instanceId(newAssignment.id);
            await db.upsertAssignmentInstance({
              id: instId,
              assignment_id: newAssignment.id,
              student_code: studentCode,
              assigned_at: dateCompleted || new Date().toISOString().split('T')[0],
              status: 'Graded'
            });
            await db.addSubmission({
              instance_id: instId,
              score_total: scorePercent,
              submitted_at: dateCompleted ? new Date(dateCompleted).toISOString() : new Date().toISOString()
            });
            gradeRecorded = true;
            console.log('[tc-library] Local gradebook entry created:', scorePercent + '%');
          } catch (gradeErr) {
            console.warn('[tc-library] Could not create local gradebook entry (non-critical):', gradeErr.message);
          }
        }
      }

      // Success
      overlay.remove();
      console.log('[tc-library] Paper assignment uploaded successfully');
      const toastSuffix = !isRemote ? ' (metadata only \u2014 local mode)' : '';
      const gradeNote = gradeRecorded ? ` \u2014 ${scorePercent}% recorded in Gradebook` : '';
      showToast(`\uD83D\uDCC4 "${title}" saved to Library${gradeNote}${toastSuffix}`);
      await loadAssignments();
      switchTab('assignments');

    } catch (err) {
      console.error('[tc-library] Paper upload error:', err);
      showInlineError('An unexpected error occurred. Please try again.');
      submitBtn.disabled = false;
      // SAFETY: restoring original static button content, no user data
      submitBtn.innerHTML = originalBtnHtml;
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────────

  function showToast(text, bg = '#22c55e', color = '#0b1220') {
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = `position:fixed;bottom:24px;right:24px;background:${bg};color:${color};padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3500);
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  function exportLibraryJSON() {
    const now = new Date();
    const exportData = {
      exported_at: now.toISOString(),
      sync_status: syncStatus,
      assignments: assignmentsData,
      lessons: lessonsData,
      stats: {
        total_assignments: assignmentsData.length,
        total_sections: lessonsData?.sections?.length || 0
      }
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `library-export-${now.toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("[tc-library] Library exported successfully");
  }

  // ── Start ─────────────────────────────────────────────────────────────────────

  init();
})();
