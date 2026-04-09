/**
 * tc-library.js
 * Teacher Center Library page — 3-lane lifecycle layout (Upcoming / Active / Finalized)
 * with hierarchical Finalized cataloging and updated KPIs.
 */

(async () => {
  "use strict";

  // Page guard - only run on library page
  if (!location.pathname.startsWith("/teacher/library")) return;

  // Import data adapter and constants
  const { db, isRemote } = await import('/web/data-adapter.js');
  const { CANON_CLASSES } = await import('/web/constants.js');
  const { buildItemsFromMeta } = await import('/web/shared-build-items.js');
  const { formatGoalValue } = await import('/web/goal-utils.js');

  // DOM helper
  const $ = (id) => document.getElementById(id);

  // Assignment type options: [value, label]
  const ASSIGNMENT_TYPE_OPTIONS = [
    ['All', 'All Types'],
    ['file', 'File'],
    ['link', 'Link'],
    ['paper', 'Paper']
  ];

  // Sort options: [value, label]
  const ASSIGNMENT_SORT_OPTIONS = [
    ['newest', 'Newest First'],
    ['oldest', 'Oldest First'],
    ['titleAZ', 'Title A\u2013Z'],
    ['titleZA', 'Title Z\u2013A'],
    ['avgScore', 'Avg Score'],
    ['custom', 'Custom Order']
  ];

  // ── SVG Icon System ───────────────────────────────────────────────────────────

  const ICON_PATHS = {
    fileText: [
      { tag: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
      { tag: 'polyline', points: '14 2 14 8 20 8' },
      { tag: 'line', x1: '16', y1: '13', x2: '8', y2: '13' },
      { tag: 'line', x1: '16', y1: '17', x2: '8', y2: '17' },
      { tag: 'polyline', points: '10 9 9 9 8 9' }
    ],
    bookOpen: [
      { tag: 'path', d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' },
      { tag: 'path', d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' }
    ],
    clipboard: [
      { tag: 'rect', x: '9', y: '2', width: '6', height: '4', rx: '1' },
      { tag: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }
    ],
    clipboardPlus: [
      { tag: 'rect', x: '9', y: '2', width: '6', height: '4', rx: '1' },
      { tag: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
      { tag: 'path', d: 'M12 11v6' },
      { tag: 'path', d: 'M9 14h6' }
    ],
    refreshCw: [
      { tag: 'polyline', points: '23 4 23 10 17 10' },
      { tag: 'polyline', points: '1 20 1 14 7 14' },
      { tag: 'path', d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }
    ],
    checkCircle: [
      { tag: 'path', d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' },
      { tag: 'polyline', points: '22 4 12 14.01 9 11.01' }
    ],
    inbox: [
      { tag: 'polyline', points: '22 12 16 12 14 15 10 15 8 12 2 12' },
      { tag: 'path', d: 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' }
    ],
    upload: [
      { tag: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
      { tag: 'polyline', points: '17 8 12 3 7 8' },
      { tag: 'line', x1: '12', y1: '3', x2: '12', y2: '15' }
    ],
    download: [
      { tag: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
      { tag: 'polyline', points: '7 10 12 15 17 10' },
      { tag: 'line', x1: '12', y1: '15', x2: '12', y2: '3' }
    ],
    search: [
      { tag: 'circle', cx: '11', cy: '11', r: '8' },
      { tag: 'line', x1: '21', y1: '21', x2: '16.65', y2: '16.65' }
    ],
    filter: [
      { tag: 'path', d: 'M22 3H2l8 9.46V19l4 2V12.46L22 3z' }
    ],
    chevronDown: [
      { tag: 'polyline', points: '6 9 12 15 18 9' }
    ],
    chevronRight: [
      { tag: 'polyline', points: '9 18 15 12 9 6' }
    ],
    folder: [
      { tag: 'path', d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }
    ],
    folderOpen: [
      { tag: 'path', d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
      { tag: 'path', d: 'M2 10h20' }
    ],
    barChart: [
      { tag: 'line', x1: '18', y1: '20', x2: '18', y2: '10' },
      { tag: 'line', x1: '12', y1: '20', x2: '12', y2: '4' },
      { tag: 'line', x1: '6', y1: '20', x2: '6', y2: '14' },
      { tag: 'line', x1: '2', y1: '20', x2: '22', y2: '20' }
    ],
    arrowRight: [
      { tag: 'line', x1: '5', y1: '12', x2: '19', y2: '12' },
      { tag: 'polyline', points: '12 5 19 12 12 19' }
    ],
    x: [
      { tag: 'line', x1: '18', y1: '6', x2: '6', y2: '18' },
      { tag: 'line', x1: '6', y1: '6', x2: '18', y2: '18' }
    ],
    calendar: [
      { tag: 'rect', x: '3', y: '4', width: '18', height: '18', rx: '2', ry: '2' },
      { tag: 'line', x1: '16', y1: '2', x2: '16', y2: '6' },
      { tag: 'line', x1: '8', y1: '2', x2: '8', y2: '6' },
      { tag: 'line', x1: '3', y1: '10', x2: '21', y2: '10' }
    ],
    users: [
      { tag: 'path', d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
      { tag: 'circle', cx: '9', cy: '7', r: '4' },
      { tag: 'path', d: 'M23 21v-2a4 4 0 0 0-3-3.87' },
      { tag: 'path', d: 'M16 3.13a4 4 0 0 1 0 7.75' }
    ],
    table: [
      { tag: 'rect', x: '3', y: '3', width: '18', height: '18', rx: '2', ry: '2' },
      { tag: 'line', x1: '3', y1: '9', x2: '21', y2: '9' },
      { tag: 'line', x1: '3', y1: '15', x2: '21', y2: '15' },
      { tag: 'line', x1: '9', y1: '3', x2: '9', y2: '21' }
    ],
    printer: [
      { tag: 'path', d: 'M6 9V2h12v7' },
      { tag: 'path', d: 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' },
      { tag: 'rect', x: '6', y: '14', width: '12', height: '8' }
    ],
    fileCsv: [
      { tag: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
      { tag: 'polyline', points: '14 2 14 8 20 8' },
      { tag: 'line', x1: '16', y1: '13', x2: '8', y2: '13' },
      { tag: 'line', x1: '14', y1: '17', x2: '8', y2: '17' }
    ],
    alertTriangle: [
      { tag: 'path', d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' },
      { tag: 'line', x1: '12', y1: '9', x2: '12', y2: '13' },
      { tag: 'line', x1: '12', y1: '17', x2: '12.01', y2: '17' }
    ],
    copy: [
      { tag: 'rect', x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' },
      { tag: 'path', d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }
    ],
    send: [
      { tag: 'line', x1: '22', y1: '2', x2: '11', y2: '13' },
      { tag: 'polygon', points: '22 2 15 22 11 13 2 9 22 2' }
    ]
  };

  function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function createIcon(name, size = 16) {
    const shapes = ICON_PATHS[name];
    if (!shapes) {
      console.warn(`[tc-library] createIcon: unknown icon "${name}"`);
      return document.createTextNode('?');
    }
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    shapes.forEach(shape => {
      const el = document.createElementNS(NS, shape.tag);
      Object.keys(shape).forEach(attr => {
        if (attr !== 'tag') el.setAttribute(attr, shape[attr]);
      });
      svg.appendChild(el);
    });
    return svg;
  }

  // ── Style Normalization ───────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('tc-lib-normalized')) return;
    const style = document.createElement('style');
    style.id = 'tc-lib-normalized';
    style.textContent = `
      .tc-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.06); color:white; font-size:13px; font-weight:500; cursor:pointer; transition:background .15s ease, transform .1s ease; user-select:none; }
      .tc-btn:hover { background:rgba(255,255,255,.12); transform:translateY(-1px); }
      .tc-btn:active { transform:translateY(0); }
      .tc-btn:disabled { opacity:.45; pointer-events:none; }
      .tc-btn.active { background:rgba(96,165,250,.18); border-color:rgba(96,165,250,.35); }
      .tc-card { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.10); border-radius:10px; transition:border-color .15s ease, transform .15s ease; }
      .tc-card.interactive:hover { border-color:rgba(255,255,255,.18); transform:translateY(-1px); }
      @keyframes rc-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      .tc-lib-shimmer { background: linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%); background-size: 200% 100%; animation: rc-shimmer 1.5s ease-in-out infinite; border-radius: 8px; }
      .assignment-card.dragging { opacity: 0.4; }
      .assignment-card.drag-over { border-top: 3px solid #60a5fa; }
      @keyframes tc-lib-finalize-pulse { 0%,100% { box-shadow:0 0 0 0 rgba(52,211,153,.0); } 40% { box-shadow:0 0 0 6px rgba(52,211,153,.30); } }
      .tc-lib-recently-finalized { animation: tc-lib-finalize-pulse 1.4s ease 0.2s 3; border-color: rgba(52,211,153,.40) !important; }
    `;
    document.head.appendChild(style);
  }

  // ── Loading Skeleton ──────────────────────────────────────────────────────────

  function renderLoadingSkeleton() {
    const main = $("tcLibraryMain");
    if (!main) return;
    const skeleton = document.createElement('div');
    skeleton.id = 'tcLibSkeleton';
    for (let i = 0; i < 3; i++) {
      const section = document.createElement('div');
      section.style.cssText = 'margin-bottom:16px;';
      const header = document.createElement('div');
      header.className = 'tc-lib-shimmer';
      header.style.cssText = 'height:44px; margin-bottom:12px;';
      section.appendChild(header);
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;';
      for (let j = 0; j < 2; j++) {
        const card = document.createElement('div');
        card.className = 'tc-lib-shimmer';
        card.style.cssText = 'height:120px;';
        grid.appendChild(card);
      }
      section.appendChild(grid);
      skeleton.appendChild(section);
    }
    main.appendChild(skeleton);
  }

  // ── Filter Persistence ────────────────────────────────────────────────────────

  function saveFilters() {
    try {
      const {assignments: a, lessons: l, finalized: f, reserve: r, active: ac} = filters;
      const data = {
        globalSearchQuery,
        assignments: {classFilter: a.classFilter, searchQuery: a.searchQuery, typeFilter: a.typeFilter, sortBy: a.sortBy},
        lessons: {searchQuery: l.searchQuery},
        finalized: {classFilter: f.classFilter, studentFilter: f.studentFilter, weekFilter: f.weekFilter, dateFrom: f.dateFrom, dateTo: f.dateTo, viewMode: f.viewMode, sortColumn: f.sortColumn, sortDirection: f.sortDirection, selectedTags: f.selectedTags, filtersExpanded: f.filtersExpanded},
        reserve: {presentationsExpanded: r.presentationsExpanded, presentationsSearch: r.presentationsSearch, viewMode: r.viewMode, selectedTags: r.selectedTags, filtersExpanded: r.filtersExpanded},
        active: {viewMode: ac.viewMode, selectedTags: ac.selectedTags, filtersExpanded: ac.filtersExpanded},
        collapsedLanes: [...collapsedLanes],
        hierarchyExpandState: [...hierarchyExpandState.entries()]
      };
      localStorage.setItem('rc_tc_library_filters_v1', JSON.stringify(data));
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('[tc-library] localStorage quota exceeded — filter preferences not saved');
      } else {
        console.warn('[tc-library] Error saving filters:', e.message);
      }
    }
  }

  function loadFilters() {
    try {
      const raw = localStorage.getItem('rc_tc_library_filters_v1');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;

      if (typeof data.globalSearchQuery === 'string') {
        globalSearchQuery = data.globalSearchQuery;
      }

      if (data.assignments && typeof data.assignments === 'object') {
        if (typeof data.assignments.classFilter === 'string') {
          filters.assignments.classFilter = data.assignments.classFilter;
        }
        if (typeof data.assignments.searchQuery === 'string') {
          filters.assignments.searchQuery = data.assignments.searchQuery;
        }
        if (typeof data.assignments.typeFilter === 'string') {
          filters.assignments.typeFilter = data.assignments.typeFilter;
        }
        if (typeof data.assignments.sortBy === 'string') {
          filters.assignments.sortBy = data.assignments.sortBy;
        }
      }

      if (data.lessons && typeof data.lessons === 'object') {
        if (typeof data.lessons.searchQuery === 'string') {
          filters.lessons.searchQuery = data.lessons.searchQuery;
        }
      }

      if (data.finalized && typeof data.finalized === 'object') {
        if (typeof data.finalized.classFilter === 'string') {
          filters.finalized.classFilter = data.finalized.classFilter;
        }
        if (typeof data.finalized.studentFilter === 'string') {
          filters.finalized.studentFilter = data.finalized.studentFilter;
        }
        if (typeof data.finalized.weekFilter === 'string') {
          filters.finalized.weekFilter = data.finalized.weekFilter;
        }
        if (typeof data.finalized.dateFrom === 'string') {
          filters.finalized.dateFrom = data.finalized.dateFrom;
        }
        if (typeof data.finalized.dateTo === 'string') {
          filters.finalized.dateTo = data.finalized.dateTo;
        }
        if (typeof data.finalized.viewMode === 'string') {
          filters.finalized.viewMode = data.finalized.viewMode;
        }
        if (typeof data.finalized.sortColumn === 'string') {
          filters.finalized.sortColumn = data.finalized.sortColumn;
        }
        if (typeof data.finalized.sortDirection === 'string') {
          filters.finalized.sortDirection = data.finalized.sortDirection;
        }
        if (Array.isArray(data.finalized.selectedTags)) filters.finalized.selectedTags = data.finalized.selectedTags.filter(t => typeof t === 'string');
        if (typeof data.finalized.filtersExpanded === 'boolean') {
          filters.finalized.filtersExpanded = data.finalized.filtersExpanded;
        }
      }

      if (data.reserve && typeof data.reserve === 'object') {
        if (typeof data.reserve.presentationsExpanded === 'boolean') {
          filters.reserve.presentationsExpanded = data.reserve.presentationsExpanded;
        }
        if (typeof data.reserve.presentationsSearch === 'string') {
          filters.reserve.presentationsSearch = data.reserve.presentationsSearch;
        }
        if (typeof data.reserve.viewMode === 'string') {
          filters.reserve.viewMode = data.reserve.viewMode;
        }
        if (Array.isArray(data.reserve.selectedTags)) {
          filters.reserve.selectedTags = data.reserve.selectedTags.filter(t => typeof t === 'string');
        }
        if (typeof data.reserve.filtersExpanded === 'boolean') {
          filters.reserve.filtersExpanded = data.reserve.filtersExpanded;
        }
      }

      if (data.active && typeof data.active === 'object') {
        if (typeof data.active.viewMode === 'string') {
          filters.active.viewMode = data.active.viewMode;
        }
        if (Array.isArray(data.active.selectedTags)) {
          filters.active.selectedTags = data.active.selectedTags.filter(t => typeof t === 'string');
        }
        if (typeof data.active.filtersExpanded === 'boolean') {
          filters.active.filtersExpanded = data.active.filtersExpanded;
        }
      }

      if (Array.isArray(data.collapsedLanes)) {
        collapsedLanes.clear();
        data.collapsedLanes.forEach(id => {
          if (typeof id === 'string') collapsedLanes.add(id);
        });
      }

      if (Array.isArray(data.hierarchyExpandState)) {
        hierarchyExpandState.clear();
        data.hierarchyExpandState.forEach(entry => {
          if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'boolean') {
            hierarchyExpandState.set(entry[0], entry[1]);
          }
        });
      }
    } catch (e) {
      console.warn('[tc-library] Could not load filters:', e.message);
    }
  }

  // ── State ─────────────────────────────────────────────────────────────────────

  let _currentTab = "reserve";
  const tabScrollPositions = {};
  let globalSearchQuery = '';
  let assignmentsData = [];
  let instancesData = [];
  let submissionsData = [];
  let classEnrollmentsData = [];
  let lessonsData = null;
  let unitMap = new Map(); // unit_id → { unitName, sectionName, sectionId }
  let keywordToUnit = new Map(); // keyword → { unitId, sectionId }
  const laneCache = new Map(); // assignment.id → lane ('upcoming' | 'current' | 'finalized')
  const CATALOG_STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'from', 'this', 'that', 'have', 'will', 'been', 'then', 'them', 'they', 'each', 'were', 'some', 'such', 'when', 'your', 'week', 'chapter', 'chapters', 'day', 'days', 'part']);
  const extractCatalogKeywords = (text) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 4 && !CATALOG_STOP_WORDS.has(w));
  const getUnitInfo = (unitId) => unitMap.get(unitId) || null;
  let syncStatus = "loading";
  let _lessonsLoadFailed = false;

  // Recall Library state
  let _recallLibraryEntries = null;
  let _recallLibraryLoading = false;
  let _recallCategoryFilter = 'All';
  let _recallSearchQuery = '';

  // Evidence report modal — student data loaded lazily
  let _evidenceStudentsData = null;

  // Filter state
  let filters = {
    assignments: {
      classFilter: "All Classes",
      searchQuery: "",
      typeFilter: "All",
      sortBy: "newest"
    },
    lessons: {
      searchQuery: ""
    },
    finalized: {
      classFilter: "All Classes",
      studentFilter: "",
      weekFilter: "",
      dateFrom: "",
      dateTo: "",
      viewMode: "tree",
      sortColumn: "date",
      sortDirection: "desc",
      selectedTags: [],
      filtersExpanded: false
    },
    reserve: {
      presentationsExpanded: false,
      presentationsSearch: "",
      viewMode: "flat",
      selectedTags: [],
      filtersExpanded: false
    },
    active: {
      viewMode: "flat",
      selectedTags: [],
      filtersExpanded: false
    }
  };

  // Collapse state for lane headers (analytics is collapsed by default)
  const collapsedLanes = new Set(['analytics']); // lane IDs: 'upcoming', 'current', 'finalized', 'analytics'

  // Expand state for hierarchy nodes (nodeId → boolean)
  const hierarchyExpandState = new Map();

  // Bulk selection state for the Upcoming lane
  let selectedUpcoming = new Set();

  // Bulk selection state for the Active tab
  let selectedActive = new Set();

  // Recently finalized IDs for Issue #11 (Recently Finalized quick-view)
  const FINALIZED_HIGHLIGHT_DURATION_MS = 60000; // 60 seconds
  let lastFinalizedIds = new Set();
  let _lastFinalizedClearTimer = null;

  // ── Initialization ────────────────────────────────────────────────────────────

  async function init() {
    console.log("[tc-library] Initializing...");
    injectStyles();
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
    // Inject responsive charts row style once
    if (!document.getElementById('tc-lib-charts-responsive-style')) {
      const style = document.createElement('style');
      style.id = 'tc-lib-charts-responsive-style';
      style.textContent = [
        '@media (max-width: 768px) {',
        '  .tc-lib-charts-row {',
        '    grid-template-columns: 1fr !important;',
        '  }',
        '}'
      ].join('\n');
      document.head.appendChild(style);
    }
    loadFilters();
    renderTabBar();
    renderTabContent();
    renderLoadingSkeleton();
    await loadAssignments();
    updateMissingWorkBadge();
    await loadLessons();
    const skeleton = document.getElementById('tcLibSkeleton');
    if (skeleton) skeleton.remove();
    attachEventListeners();
    switchTab("reserve");

    // ── Issue #19: Offline/online resilience ─────────────────────────────────
    if (!navigator.onLine) showOfflineBanner();
    window.addEventListener('offline', showOfflineBanner);
    window.addEventListener('online', () => {
      hideOfflineBanner();
      showToast('Back online', '#22c55e', '#0b1220');
    });
  }

  // ── Tab Bar ───────────────────────────────────────────────────────────────────

  function renderTabBar() {
    const main = $("tcLibraryMain");
    if (!main) return;

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tc-lib-tabs';
    tabsContainer.setAttribute('role', 'tablist');

    const makeTabBtn = (tabId, iconName, label, selected) => {
      const btn = document.createElement('button');
      btn.className = 'tc-btn tc-lib-tab-btn';
      btn.dataset.tab = tabId;
      btn.style.cssText = 'display:flex; align-items:center; gap:8px;';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
      btn.appendChild(createIcon(iconName));
      btn.appendChild(document.createTextNode(' ' + label));
      return btn;
    };

    tabsContainer.appendChild(makeTabBtn('reserve',   'clipboard',   'Reserve',       true));
    const activeTabBtn = makeTabBtn('active', 'refreshCw', 'Active', false);
    const missingWorkBadge = document.createElement('span');
    missingWorkBadge.id = 'activeMissingBadge';
    missingWorkBadge.style.cssText = 'background:#ef4444; color:white; border-radius:9999px; font-size:10px; font-weight:700; padding:1px 6px; min-width:18px; text-align:center; line-height:1.6; display:none;';
    activeTabBtn.appendChild(missingWorkBadge);
    tabsContainer.appendChild(activeTabBtn);
    tabsContainer.appendChild(makeTabBtn('finalized', 'checkCircle', 'Finalized',     false));
    tabsContainer.appendChild(makeTabBtn('overview',  'barChart',    'Overview',      false));
    tabsContainer.appendChild(makeTabBtn('lessons',   'bookOpen',    'Lessons',       false));
    const recallTabBtn = makeTabBtn('recallLibrary', 'inbox',   'Recall Library', false);
    const recallBadge = document.createElement('span');
    recallBadge.id = 'recallLibraryBadge';
    recallBadge.style.cssText = 'background:#6366f1; color:white; border-radius:9999px; font-size:10px; font-weight:700; padding:1px 6px; min-width:18px; text-align:center; line-height:1.6; display:none;';
    recallTabBtn.appendChild(recallBadge);
    tabsContainer.appendChild(recallTabBtn);

    const spacer = document.createElement('div');
    spacer.style.cssText = 'flex:1;';
    tabsContainer.appendChild(spacer);

    const shortcutsHintBtn = document.createElement('button');
    shortcutsHintBtn.id = 'keyboardShortcutsBtn';
    shortcutsHintBtn.className = 'tc-btn';
    shortcutsHintBtn.setAttribute('aria-label', 'Keyboard shortcuts');
    shortcutsHintBtn.title = 'Keyboard shortcuts';
    shortcutsHintBtn.style.cssText = 'margin-right:8px; width:32px; height:32px; padding:0; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700;';
    shortcutsHintBtn.textContent = '?';
    tabsContainer.appendChild(shortcutsHintBtn);

    const uploadBtn = document.createElement('button');
    uploadBtn.id = 'uploadPaperBtn';
    uploadBtn.className = 'tc-btn';
    uploadBtn.style.cssText = 'margin-left:auto; display:flex; align-items:center; gap:6px;';
    uploadBtn.appendChild(createIcon('upload'));
    uploadBtn.appendChild(document.createTextNode(' Upload Paper Assignment'));
    tabsContainer.appendChild(uploadBtn);

    const exportBtn = document.createElement('button');
    exportBtn.id = 'exportLibraryBtn';
    exportBtn.className = 'tc-btn';
    exportBtn.style.cssText = 'margin-left:8px; display:flex; align-items:center; gap:6px;';
    exportBtn.appendChild(createIcon('download'));
    exportBtn.appendChild(document.createTextNode(' Export Library JSON'));
    tabsContainer.appendChild(exportBtn);

    const evidenceBtn = document.createElement('button');
    evidenceBtn.id = 'evidenceReportBtn';
    evidenceBtn.className = 'tc-btn';
    evidenceBtn.style.cssText = 'margin-left:8px; display:flex; align-items:center; gap:6px;';
    evidenceBtn.setAttribute('aria-label', 'Generate Student Evidence Report');
    evidenceBtn.appendChild(createIcon('fileText'));
    evidenceBtn.appendChild(document.createTextNode(' Evidence Report'));
    tabsContainer.appendChild(evidenceBtn);

    main.insertBefore(tabsContainer, main.firstChild);
  }

  function renderTabContent() {
    const main = $("tcLibraryMain");
    if (!main) return;

    const makePanel = (id) => {
      const div = document.createElement('div');
      div.id = id;
      div.className = 'tc-lib-tab-content';
      div.setAttribute('role', 'tabpanel');
      div.style.display = 'none';
      return div;
    };

    main.appendChild(makePanel('reserveTab'));
    main.appendChild(makePanel('activeTab'));
    main.appendChild(makePanel('finalizedTab'));
    main.appendChild(makePanel('overviewTab'));
    main.appendChild(makePanel('lessonsTab'));
    main.appendChild(makePanel('recallLibraryTab'));
    // Keep the legacy assignments tab for backward compatibility
    main.appendChild(makePanel('assignmentsTab'));
  }

  function switchTab(tabName) {
    const prevTab = _currentTab;
    _currentTab = tabName;
    document.querySelectorAll('.tc-lib-tab-btn').forEach(btn => {
      const active = btn.dataset.tab === tabName;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    // Issue #8: Save scroll position for outgoing tab
    tabScrollPositions[prevTab] = window.scrollY || document.documentElement.scrollTop;
    // Issue #9: Carry search query to incoming tab
    globalSearchQuery = filters.assignments.searchQuery;
    const allTabIds = ['reserveTab', 'activeTab', 'finalizedTab', 'overviewTab', 'lessonsTab', 'recallLibraryTab', 'assignmentsTab'];
    allTabIds.forEach(id => {
      const el = $(id);
      if (el) el.style.display = 'none';
    });
    const tabMap = {
      reserve:       'reserveTab',
      active:        'activeTab',
      finalized:     'finalizedTab',
      overview:      'overviewTab',
      lessons:       'lessonsTab',
      recallLibrary: 'recallLibraryTab',
      assignments:   'assignmentsTab'
    };
    const panelId = tabMap[tabName];
    if (panelId) {
      const panel = $(panelId);
      if (panel) panel.style.display = 'block';
    }
    // Pre-fill search query for the incoming tab (Reserve / Active share assignments.searchQuery)
    if ((tabName === 'reserve' || tabName === 'active') && globalSearchQuery) {
      filters.assignments.searchQuery = globalSearchQuery;
    }
    if (tabName === 'reserve') {
      renderReserveTab();
    } else if (tabName === 'active') {
      renderActiveTab();
    } else if (tabName === 'finalized') {
      renderFinalizedTab();
    } else if (tabName === 'overview') {
      renderOverviewTab();
    } else if (tabName === 'lessons') {
      renderLessonsTab();
    } else if (tabName === 'recallLibrary') {
      renderRecallLibraryTab();
    } else if (tabName === 'assignments') {
      renderAssignmentsTab();
    }
    // Issue #8: Restore scroll position for incoming tab after render
    const savedScroll = tabScrollPositions[tabName] || 0;
    requestAnimationFrame(() => window.scrollTo(0, savedScroll));
  }

  /**
   * Re-renders the currently active tab. Used by event handlers that need
   * to refresh the view after a data change.
   */
  function refreshCurrentTab() {
    switchTab(_currentTab);
  }

  // ── Data Loading ──────────────────────────────────────────────────────────────

  async function loadAssignments() {
    console.log("[tc-library] Loading assignments, instances, submissions...");
    try {
      const remote = await isRemote();
      if (remote) {
        console.log("[tc-library] Fetching from Supabase...");
        [assignmentsData, instancesData, submissionsData, classEnrollmentsData] = await Promise.all([
          db.listAssignments(),
          db.listAssignmentInstances().catch(err => {
            console.warn("[tc-library] Could not load instances:", err.message);
            return [];
          }),
          db.listSubmissions().catch(err => {
            console.warn("[tc-library] Could not load submissions:", err.message);
            return [];
          }),
          db.listClassEnrollments ? db.listClassEnrollments().catch(err => {
            console.warn("[tc-library] Could not load class enrollments:", err.message);
            return [];
          }) : Promise.resolve([])
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
    rebuildLaneCache();
  }

  async function loadLessons() {
    console.log("[tc-library] Loading lessons...");
    let loadFailed = false;
    try {
      const response = await fetch('/assets/content/lessons-index.json');
      if (response.ok) {
        lessonsData = await response.json();
        console.log(`[tc-library] Loaded ${lessonsData.sections?.length || 0} lesson sections`);
      } else {
        console.warn("[tc-library] Lessons index not found");
        lessonsData = null;
        loadFailed = true;
      }
    } catch (err) {
      console.error("[tc-library] Error loading lessons:", err);
      lessonsData = null;
      loadFailed = true;
    }
    // Build unit lookup map: unit_id → { unitName, sectionName, sectionId }
    // Also build keyword → unitId map for catalog inference
    unitMap.clear();
    keywordToUnit.clear();
    if (lessonsData && Array.isArray(lessonsData.sections)) {
      lessonsData.sections.forEach(section => {
        const sectionId = section.name.toLowerCase().replace(/[\s/]+/g, '-').replace(/[^a-z0-9-]/g, '');
        (section.units || []).forEach(unit => {
          unitMap.set(unit.id, { unitName: unit.name, sectionName: section.name, sectionId });
          keywordToUnit.set(unit.id, { unitId: unit.id, sectionId });
          extractCatalogKeywords(unit.name).forEach(w => {
            keywordToUnit.set(w, { unitId: unit.id, sectionId });
          });
          (unit.presentations || []).forEach(pres => {
            extractCatalogKeywords(pres.name || '').forEach(w => {
              keywordToUnit.set(w, { unitId: unit.id, sectionId });
            });
          });
        });
      });
    }
    // ── Issue #17: show or hide lessons error banner ──────────────────────────
    _lessonsLoadFailed = loadFailed;
    if (loadFailed) {
      showLessonsErrorBanner(retryLoadLessons);
    } else {
      hideLessonsErrorBanner();
    }
  }

  /** Retry helper for the lessons error banner [Retry] button. */
  async function retryLoadLessons() {
    await loadLessons();
    if (!_lessonsLoadFailed) {
      refreshCurrentTab();
    }
  }

  /**
   * Infer a unit_id from an assignment's title and page URL.
   * Returns { unitId, sectionId, confidence: 'high'|'medium'|'low', reason }.
   * @param {object} assignment
   */
  function inferUnitFromAssignment(assignment) {
    if (!lessonsData || !Array.isArray(lessonsData.sections)) {
      return { unitId: null, sectionId: null, confidence: 'low', reason: 'No lessons data' };
    }
    const title = (assignment.title || '').toLowerCase();
    const page = (assignment.page || '').toLowerCase();
    if (page) {
      for (const [uid, info] of unitMap.entries()) {
        if (page.includes(uid)) {
          return { unitId: uid, sectionId: info.sectionId, confidence: 'high', reason: 'URL matches unit ID' };
        }
      }
    }
    const titleWords = extractCatalogKeywords(title);
    const scores = new Map();
    titleWords.forEach(w => {
      const match = keywordToUnit.get(w);
      if (match) scores.set(match.unitId, (scores.get(match.unitId) || 0) + 1);
    });
    if (scores.size === 0) return { unitId: null, sectionId: null, confidence: 'low', reason: 'No keyword match' };
    let bestUnitId = null, bestScore = 0;
    scores.forEach((score, uid) => { if (score > bestScore) { bestScore = score; bestUnitId = uid; } });
    const info = unitMap.get(bestUnitId);
    if (!info) return { unitId: null, sectionId: null, confidence: 'low', reason: 'No keyword match' };
    const ratio = titleWords.length > 0 ? bestScore / titleWords.length : 0;
    const confidence = (ratio >= 0.5 || bestScore >= 3) ? 'high' : (ratio >= 0.25 || bestScore >= 2) ? 'medium' : 'low';
    return { unitId: bestUnitId, sectionId: info.sectionId, confidence, reason: bestScore + ' keyword match(es)' };
  }

  // ── Draft ID Helper ───────────────────────────────────────────────────────────

  /** Generate a unique draft ID using crypto.randomUUID() with a fallback. */
  function genDraftId() {
    return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : 'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  // ── Re-Issue Helpers ──────────────────────────────────────────────────────────

  /**
   * Returns the number of active students enrolled in the given class.
   * Uses `classEnrollmentsData` loaded at init time.
   * @param {string} className
   * @returns {number}
   */
  function getClassStudentCount(className) {
    return classEnrollmentsData.filter(
      e => e.class_name === className && e.active !== false
    ).length;
  }

  /**
   * Opens the Re-Issue class-picker modal.
   * The teacher can pick a target class and issue directly via the
   * `teacher-issue-draft` Netlify function, or fall back to saving a draft
   * in localStorage and redirecting to the Work tab.
   *
   * @param {object} assignment  – normalised assignment-like object with at minimum:
   *   { id, title, type, series, meta, assignment_id }
   * @param {'finalized'|'recallLibrary'} [tabContext]  – which tab to re-render on success
   */
  function showReIssueModal(assignment, tabContext) {
    const triggerEl = document.activeElement;

    // ── Overlay ────────────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'reissueModalTitle');
    overlay.style.cssText = [
      'position:fixed; top:0; left:0; right:0; bottom:0;',
      'background:rgba(0,0,0,.82); backdrop-filter:blur(4px);',
      'display:flex; align-items:center; justify-content:center;',
      'z-index:10010; padding:24px;'
    ].join('');

    // ── Card ───────────────────────────────────────────────────────────────────
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width:560px; width:100%; max-height:90vh; overflow-y:auto; padding:28px;';

    // ── Header ─────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; gap:12px;';

    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'display:flex; align-items:center; gap:8px;';
    titleWrap.appendChild(createIcon('refreshCw', 20));
    const titleEl = document.createElement('h2');
    titleEl.id = 'reissueModalTitle';
    titleEl.style.cssText = 'margin:0; font-size:20px; font-weight:700;';
    titleEl.textContent = 'Re-Issue Assignment';
    titleWrap.appendChild(titleEl);
    header.appendChild(titleWrap);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tc-btn';
    closeBtn.style.cssText = 'padding:6px 12px; flex-shrink:0;';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.appendChild(createIcon('x', 14));
    header.appendChild(closeBtn);
    card.appendChild(header);

    // ── Assignment title display ───────────────────────────────────────────────
    const assignmentLabel = document.createElement('div');
    assignmentLabel.style.cssText = [
      'background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12);',
      'border-radius:8px; padding:10px 14px; margin-bottom:20px; font-size:14px;',
      'color:rgba(255,255,255,.80);'
    ].join('');
    const assignmentLabelSpan = document.createElement('span');
    assignmentLabelSpan.style.cssText = 'color:rgba(255,255,255,.45); font-size:12px; display:block; margin-bottom:2px;';
    assignmentLabelSpan.textContent = 'Re-issuing:';
    assignmentLabel.appendChild(assignmentLabelSpan);
    const assignmentTitleSpan = document.createElement('span');
    assignmentTitleSpan.style.cssText = 'font-weight:600; color:#fff;';
    assignmentTitleSpan.textContent = assignment.title || '(Untitled)';
    assignmentLabel.appendChild(assignmentTitleSpan);
    card.appendChild(assignmentLabel);

    // ── Class picker section heading ───────────────────────────────────────────
    const pickHeading = document.createElement('div');
    pickHeading.style.cssText = 'font-size:13px; font-weight:600; color:rgba(255,255,255,.55); text-transform:uppercase; letter-spacing:.06em; margin-bottom:12px;';
    pickHeading.textContent = 'Select a class';
    card.appendChild(pickHeading);

    // ── Determine original class ───────────────────────────────────────────────
    const originalClass = inferClassName(assignment) || assignment.series || null;

    // ── Enrollment count note ──────────────────────────────────────────────────
    const noEnrollData = classEnrollmentsData.length === 0;
    if (noEnrollData) {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:12px; color:rgba(255,200,80,.75); margin-bottom:10px;';
      note.textContent = 'Enrollment data unavailable — student counts not shown.';
      card.appendChild(note);
    }

    // ── Class picker grid ──────────────────────────────────────────────────────
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:10px; margin-bottom:24px;';

    let selectedClassName = null;

    const classBtns = CANON_CLASSES.map(cls => {
      const btn = document.createElement('button');
      btn.style.cssText = [
        'display:flex; flex-direction:column; align-items:flex-start; gap:4px;',
        'background:rgba(255,255,255,.05); border:2px solid rgba(255,255,255,.12);',
        'border-radius:10px; padding:12px 14px; cursor:pointer; text-align:left;',
        'transition:border-color .15s, background .15s; color:#fff; font-family:inherit;'
      ].join('');

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'font-size:14px; font-weight:600;';
      nameSpan.textContent = cls;
      btn.appendChild(nameSpan);

      if (!noEnrollData) {
        const count = getClassStudentCount(cls);
        const countSpan = document.createElement('span');
        countSpan.style.cssText = 'font-size:12px; color:rgba(255,255,255,.45);';
        countSpan.textContent = count === 1 ? '1 student' : count + ' students';
        btn.appendChild(countSpan);
      }

      if (originalClass && cls === originalClass) {
        const badge = document.createElement('span');
        badge.style.cssText = [
          'font-size:10px; color:#60a5fa;',
          'background:rgba(96,165,250,.12); border:1px solid rgba(96,165,250,.25);',
          'border-radius:6px; padding:1px 6px; margin-top:2px;'
        ].join('');
        badge.textContent = 'original';
        btn.appendChild(badge);
      }

      btn.addEventListener('click', () => {
        selectedClassName = cls;
        classBtns.forEach(b => {
          b.style.borderColor = 'rgba(255,255,255,.12)';
          b.style.background = 'rgba(255,255,255,.05)';
          b.style.boxShadow = '';
        });
        btn.style.borderColor = '#3b82f6';
        btn.style.background = 'rgba(59,130,246,.12)';
        btn.style.boxShadow = '0 0 0 3px rgba(59,130,246,.20)';
        issueBtn.disabled = false;
        issueBtn.style.opacity = '1';
        errorDiv.style.display = 'none';
      });

      grid.appendChild(btn);
      return btn;
    });

    card.appendChild(grid);

    // ── Action row ─────────────────────────────────────────────────────────────
    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

    const issueBtn = document.createElement('button');
    issueBtn.className = 'tc-btn';
    issueBtn.style.cssText = 'font-weight:600; font-size:15px; padding:12px 20px; background:#3b82f6; border-color:#3b82f6; color:#fff; opacity:.45;';
    issueBtn.disabled = true;
    issueBtn.appendChild(createIcon('send', 16));
    issueBtn.appendChild(document.createTextNode(' Issue to Class'));
    actionRow.appendChild(issueBtn);

    // Error message div (hidden by default)
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'display:none; color:#f87171; font-size:13px; padding:8px 12px; background:rgba(248,113,113,.10); border:1px solid rgba(248,113,113,.25); border-radius:8px;';
    actionRow.appendChild(errorDiv);

    const draftBtn = document.createElement('button');
    draftBtn.className = 'tc-btn';
    draftBtn.style.cssText = 'font-size:13px; color:rgba(255,255,255,.55); border-color:rgba(255,255,255,.12); padding:8px 14px;';
    draftBtn.appendChild(createIcon('arrowRight', 13));
    draftBtn.appendChild(document.createTextNode(' Save as Draft Instead'));
    actionRow.appendChild(draftBtn);

    card.appendChild(actionRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // ── Focus management ───────────────────────────────────────────────────────
    function closeModal() {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
    }

    closeBtn.focus();

    // ── Issue to Class handler ─────────────────────────────────────────────────
    issueBtn.addEventListener('click', async () => {
      if (!selectedClassName) return;
      issueBtn.disabled = true;
      issueBtn.style.opacity = '.6';
      // Update button text to show spinner
      while (issueBtn.firstChild) issueBtn.removeChild(issueBtn.firstChild);
      issueBtn.appendChild(createIcon('refreshCw', 16));
      issueBtn.appendChild(document.createTextNode(' Issuing\u2026'));
      errorDiv.style.display = 'none';

      const draft = {
        id: genDraftId(),
        title: assignment.title || '(Untitled)',
        className: selectedClassName,
        batchId: null,
        assignment: {
          kind: assignment.type || 'file',
          text: assignment.meta?.page || '',
        },
        mapping: assignment.meta?.mapping || null,
        createdAt: new Date().toISOString(),
        submittedAt: null,
        issuedAt: null,
        assignmentId: null,
        reissuedFrom: assignment.id || assignment.assignment_id,
      };

      let result;
      try {
        const response = await fetch('/.netlify/functions/teacher-issue-draft', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft }),
        });

        result = await response.json().catch(() => ({}));

        if (!response.ok) {
          const status = response.status;
          let msg = result.error || result.message || 'Issue failed';
          if (status === 401) msg = 'Session expired — please reload the page and try again.';
          else if (status === 400) msg = 'Validation error: ' + msg;
          throw new Error(msg);
        }

        if (!result.ok) {
          throw new Error(result.error || result.message || 'Issue failed');
        }
      } catch (err) {
        console.error('[tc-library] Re-issue failed:', err);
        errorDiv.textContent = err.message || 'An unexpected error occurred.';
        errorDiv.style.display = 'block';
        // Re-enable button
        while (issueBtn.firstChild) issueBtn.removeChild(issueBtn.firstChild);
        issueBtn.appendChild(createIcon('send', 16));
        issueBtn.appendChild(document.createTextNode(' Issue to Class'));
        issueBtn.disabled = false;
        issueBtn.style.opacity = '1';
        return;
      }

      // Success
      const issued = result.issued_count ?? result.created_instances ?? 0;
      showToast('Issued to ' + issued + ' student' + (issued !== 1 ? 's' : '') + ' in ' + selectedClassName, '#22c55e', '#fff');
      closeModal();
      if (tabContext === 'recallLibrary') {
        renderRecallLibraryTab();
      } else {
        renderFinalizedTab();
      }
    });

    // ── Save as Draft fallback ─────────────────────────────────────────────────
    draftBtn.addEventListener('click', () => {
      const newDraft = {
        id: genDraftId(),
        title: assignment.title || '(Untitled)',
        className: selectedClassName || assignment.series || '',
        batchId: null,
        assignment: {
          kind: assignment.type || 'file',
          text: assignment.meta?.page || '',
        },
        mapping: assignment.meta?.mapping || null,
        createdAt: new Date().toISOString(),
        submittedAt: null,
        issuedAt: null,
        assignmentId: null,
        reissuedFrom: assignment.id || assignment.assignment_id,
      };
      try {
        const drafts = JSON.parse(localStorage.getItem('rc_tc_work_drafts_v1') || '[]');
        drafts.unshift(newDraft);
        localStorage.setItem('rc_tc_work_drafts_v1', JSON.stringify(drafts));
      } catch (err) {
        console.error('[tc-library] Failed to save re-issue draft:', err);
        showToast('Could not save draft \u2014 storage may be full.', '#ef4444', '#fff');
        return;
      }
      closeModal();
      showToast('Draft saved \u2014 redirecting to Work tab\u2026');
      window.location.href = '/teacher/work/';
    });

    // ── Dismiss handlers ───────────────────────────────────────────────────────
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        closeModal();
      } else if (e.key === 'Tab') {
        const focusable = Array.from(
          card.querySelectorAll('button:not([disabled]):not([hidden]), input:not([hidden]), select:not([hidden]), textarea:not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])')
        ).filter(el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
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
    }
    document.addEventListener('keydown', onKeyDown);
  }

  // ── Recall Library ────────────────────────────────────────────────────────────

  async function loadRecallLibrary() {
    if (_recallLibraryLoading) return;
    _recallLibraryLoading = true;
    console.log("[tc-library] Loading recall library...");
    try {
      const response = await fetch('/.netlify/functions/teacher-recall-library-list', {
        credentials: 'same-origin',
      });
      if (response.ok) {
        const data = await response.json();
        _recallLibraryEntries = Array.isArray(data.entries) ? data.entries : [];
        console.log(`[tc-library] Loaded ${_recallLibraryEntries.length} recall library entries`);
      } else {
        console.warn("[tc-library] Failed to load recall library:", response.status);
        _recallLibraryEntries = [];
      }
    } catch (err) {
      console.error("[tc-library] Error loading recall library:", err);
      _recallLibraryEntries = [];
    } finally {
      _recallLibraryLoading = false;
      updateRecallBadge();
    }
  }

  async function renderRecallLibraryTab() {
    const container = $("recallLibraryTab");
    if (!container) return;
    container.innerHTML = '';

    // Show shimmer while loading
    if (_recallLibraryEntries === null) {
      const shimmerWrap = document.createElement('div');
      shimmerWrap.style.cssText = 'display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:16px; padding:8px 0;';
      for (let i = 0; i < 4; i++) {
        const cell = document.createElement('div');
        cell.className = 'tc-lib-shimmer';
        cell.style.cssText = 'height:160px; border-radius:10px;';
        shimmerWrap.appendChild(cell);
      }
      container.appendChild(shimmerWrap);

      await loadRecallLibrary();
      container.innerHTML = '';
    }

    const entries = _recallLibraryEntries || [];

    // Toolbar: search + category filter
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:16px;';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'recallLibrarySearch';
    searchInput.placeholder = 'Search by title…';
    searchInput.value = _recallSearchQuery;
    searchInput.style.cssText = 'background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:#fff; font-size:13px; padding:7px 12px; outline:none; flex:1; min-width:180px; max-width:300px;';
    searchInput.addEventListener('input', () => {
      _recallSearchQuery = searchInput.value;
      _renderRecallCards(container, entries, filterBar);
    });
    toolbar.appendChild(searchInput);

    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; align-items:center;';
    _buildRecallCategoryFilter(filterBar, entries, container);
    toolbar.appendChild(filterBar);

    container.appendChild(toolbar);

    // Cards area
    const cardsArea = document.createElement('div');
    cardsArea.id = 'recallCardsArea';
    container.appendChild(cardsArea);

    _renderRecallCards(cardsArea, entries, filterBar);
  }

  function _buildRecallCategoryFilter(filterBar, entries, container) {
    filterBar.innerHTML = '';
    const uniqueCategories = Array.from(new Set(entries.map(e => e.category || 'Uncategorized')));
    const cats = ['All', ...uniqueCategories];
    cats.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = 'tc-btn';
      pill.style.cssText = 'font-size:12px; padding:4px 10px; border-radius:20px;';
      if (cat === _recallCategoryFilter) pill.classList.add('active');
      pill.textContent = cat;
      pill.addEventListener('click', () => {
        _recallCategoryFilter = cat;
        const cardsArea = $('recallCardsArea');
        if (cardsArea) _renderRecallCards(cardsArea, entries, filterBar);
        _buildRecallCategoryFilter(filterBar, entries, container);
      });
      filterBar.appendChild(pill);
    });
  }

  function _renderRecallCards(cardsArea, entries, _filterBar) {
    cardsArea.innerHTML = '';

    const query = _recallSearchQuery.toLowerCase();
    const filtered = entries.filter(e => {
      const matchCat = _recallCategoryFilter === 'All' || (e.category || 'Uncategorized') === _recallCategoryFilter;
      const matchSearch = !query || (e.title || '').toLowerCase().includes(query);
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center; padding:48px 24px; color:rgba(255,255,255,.45); font-size:14px;';
      if (entries.length === 0) {
        empty.textContent = 'No recalled assignments yet. When you recall an assignment from the Work tab, it will appear here.';
      } else {
        empty.textContent = 'No recalled assignments match your current filter.';
      }
      cardsArea.appendChild(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:16px;';

    filtered.forEach(entry => {
      grid.appendChild(_renderRecallCard(entry));
    });

    cardsArea.appendChild(grid);
  }

  function _renderRecallCard(entry) {
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'padding:16px; border-left:4px solid #f59e0b; display:flex; flex-direction:column; gap:8px;';

    // Title
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:15px; font-weight:600; color:#fff; line-height:1.3;';
    titleEl.textContent = entry.title || '(Untitled)';
    card.appendChild(titleEl);

    // Badges row
    const badgesRow = document.createElement('div');
    badgesRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; align-items:center;';

    // Recall Library entries have a server-side `category` field (separate from the
    // assignment category system that was removed). Display it here for browsing context.
    if (entry.category) {
      const catSpan = document.createElement('span');
      catSpan.style.cssText = 'background:rgba(148,163,184,.15);color:rgba(148,163,184,.80);padding:3px 10px;border-radius:12px;font-size:12px;white-space:nowrap;font-weight:500;display:inline-block;';
      catSpan.textContent = entry.category;
      badgesRow.appendChild(catSpan);
    }

    if (entry.type) {
      const typeBadge = document.createElement('span');
      typeBadge.style.cssText = 'background:rgba(255,255,255,.1); color:rgba(255,255,255,.7); padding:3px 10px; border-radius:12px; font-size:11px; white-space:nowrap;';
      typeBadge.textContent = entry.type;
      badgesRow.appendChild(typeBadge);
    }

    card.appendChild(badgesRow);

    // Series
    if (entry.series) {
      const seriesEl = document.createElement('div');
      seriesEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.5);';
      seriesEl.textContent = 'Series: ' + entry.series;
      card.appendChild(seriesEl);
    }

    // Meta row: recalled date + recalled by
    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'font-size:12px; color:rgba(255,255,255,.45); display:flex; flex-wrap:wrap; gap:8px;';

    if (entry.recalled_at) {
      const dateEl = document.createElement('span');
      const d = new Date(entry.recalled_at);
      dateEl.textContent = 'Recalled: ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      metaRow.appendChild(dateEl);
    }

    if (entry.recalled_by) {
      const byEl = document.createElement('span');
      byEl.textContent = 'By: ' + entry.recalled_by;
      metaRow.appendChild(byEl);
    }

    card.appendChild(metaRow);

    // Reason
    if (entry.reason) {
      const reasonEl = document.createElement('div');
      reasonEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.5); font-style:italic;';
      reasonEl.textContent = '\u201c' + entry.reason + '\u201d';
      card.appendChild(reasonEl);
    }

    // Re-Issue button
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'margin-top:4px; display:flex; gap:8px; flex-wrap:wrap;';
    const reIssueBtn = document.createElement('button');
    reIssueBtn.className = 'tc-btn';
    reIssueBtn.style.cssText = 'font-size:12px; padding:5px 12px;';
    reIssueBtn.appendChild(createIcon('refreshCw', 14));
    reIssueBtn.appendChild(document.createTextNode(' Re-Issue'));
    reIssueBtn.addEventListener('click', () => {
      showReIssueModal({
        id: entry.assignment_id,
        title: entry.title,
        type: entry.type,
        series: entry.series,
        meta: entry.meta,
        assignment_id: entry.assignment_id,
      }, 'recallLibrary');
    });
    btnRow.appendChild(reIssueBtn);

    const addToReserveBtn = document.createElement('button');
    addToReserveBtn.className = 'tc-btn';
    addToReserveBtn.style.cssText = 'font-size:12px; padding:5px 12px;';
    addToReserveBtn.appendChild(createIcon('clipboard', 14));
    addToReserveBtn.appendChild(document.createTextNode(' Create Draft'));
    addToReserveBtn.addEventListener('click', () => {
      const newDraft = {
        id: genDraftId(),
        title: entry.title || '(Untitled)',
        className: entry.series || '',
        batchId: null,
        assignment: { kind: entry.type || 'file', text: entry.meta?.page || '' },
        mapping: entry.meta?.mapping || null,
        createdAt: new Date().toISOString(),
        submittedAt: null,
        issuedAt: null,
        assignmentId: null,
        reissuedFrom: entry.assignment_id,
      };
      try {
        const drafts = JSON.parse(localStorage.getItem('rc_tc_work_drafts_v1') || '[]');
        drafts.unshift(newDraft);
        localStorage.setItem('rc_tc_work_drafts_v1', JSON.stringify(drafts));
        showToast('Draft created \u2014 go to Work tab to edit and issue.');
      } catch (err) {
        console.error('[tc-library] Failed to add to reserve:', err);
        showToast('Could not create draft \u2014 storage may be full.', '#ef4444', '#fff');
      }
    });
    btnRow.appendChild(addToReserveBtn);
    card.appendChild(btnRow);

    return card;
  }

  // ── Assignment Type Helpers ───────────────────────────────────────────────────

  /**
   * Infer a display label for an assignment's type.
   * - 'html' + meta.questions  → 'HTML'
   * - 'html' + meta.days       → 'TXT'
   * - 'html' (neither)         → 'File'
   * - 'link' | 'google_form'   → 'Link'
   * - null / undefined         → null
   * @param {Object} assignment
   * @returns {string|null}
   */
  function getAssignmentTypeLabel(assignment) {
    const t = assignment?.type;
    if (t === 'html') {
      if (assignment.meta?.questions) return 'HTML';
      if (assignment.meta?.days) return 'TXT';
      return 'File';
    }
    if (t === 'link' || t === 'google_form') return 'Link';
    return null;
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
    if (instances.length === 0) {
      if (assignment.active === false) return 'finalized';
      if (assignment.finalized_at) return 'finalized';
      return 'upcoming';
    }
    // Per-assignment: if the teacher marked the assignment inactive, it's finalized
    if (assignment.active === false) return 'finalized';
    // Explicitly finalized via timestamp (e.g. teacher pressed "Finalize")
    if (assignment.finalized_at) return 'finalized';
    const anyActive = instances.some(i =>
      ['Assigned', 'In Progress', 'Submitted'].includes(i.status)
    );
    if (anyActive) return 'current';
    const allTerminal = instances.every(i => i.status === 'Graded' || i.status === 'Reviewed');
    if (allTerminal) return 'finalized';
    return 'upcoming';
  }

  function rebuildLaneCache() {
    laneCache.clear();
    for (const a of assignmentsData) {
      laneCache.set(a.id, computeLane(a, instancesData));
    }
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
    const gradedCount = instances.filter(i => i.status === 'Graded' || i.status === 'Reviewed').length;
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

  // ── HTML Escape Helper ────────────────────────────────────────────────────────

  const esc = (v) => { if (!v && v !== 0) return ''; const d = document.createElement('div'); d.textContent = String(v); return d.innerHTML; };

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
      const lane = (laneCache.get(a.id) ?? computeLane(a, instancesData));
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
    labelEl.style.cssText = 'display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size: 14px; color: rgba(255,255,255,.60); margin-bottom: 8px;';
    if (typeof label === 'string') {
      labelEl.textContent = label;
    } else {
      labelEl.appendChild(label);
    }
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
    return filtered;
  }

  function sortAssignments(list) {
    const sortBy = filters.assignments.sortBy;
    const sorted = [...list];
    const dateOf = a => a.created_at ? new Date(a.created_at).getTime() : null;
    if (sortBy === 'oldest') {
      sorted.sort((a, b) => {
        const da = dateOf(a), db = dateOf(b);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    } else if (sortBy === 'titleAZ') {
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortBy === 'titleZA') {
      sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    } else if (sortBy === 'avgScore') {
      sorted.sort((a, b) => {
        const statsA = getAssignmentStats(a, instancesData, submissionsData);
        const statsB = getAssignmentStats(b, instancesData, submissionsData);
        const scoreA = statsA.avgScore != null ? statsA.avgScore : -1;
        const scoreB = statsB.avgScore != null ? statsB.avgScore : -1;
        return scoreB - scoreA;
      });
    } else if (sortBy === 'custom') {
      // Apply saved custom order from localStorage; items not in order array go to end
      let order = [];
      try {
        order = JSON.parse(localStorage.getItem('rc_tc_library_reserve_order_v1') || '[]');
      } catch (_) { /* ignore */ }
      if (order.length > 0) {
        const orderMap = new Map(order.map((id, i) => [id, i]));
        sorted.sort((a, b) => {
          const ia = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
          const ib = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
          return ia - ib;
        });
      }
    } else {
      // default: newest — items without dates sort to the end
      sorted.sort((a, b) => {
        const da = dateOf(a), db = dateOf(b);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return db - da;
      });
    }
    return sorted;
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
    refreshCurrentTab();
  }

  function isHierarchyExpanded(nodeId, defaultExpanded) {
    if (!hierarchyExpandState.has(nodeId)) hierarchyExpandState.set(nodeId, defaultExpanded);
    return hierarchyExpandState.get(nodeId);
  }

  function toggleHierarchy(nodeId) {
    const current = hierarchyExpandState.has(nodeId) ? hierarchyExpandState.get(nodeId) : true;
    hierarchyExpandState.set(nodeId, !current);
    refreshCurrentTab();
  }

  // ── Lane Section Wrapper ──────────────────────────────────────────────────────

  function renderLaneSection(laneId, iconName, title, count, renderContent) {
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

    header.setAttribute('aria-expanded', String(expanded));

    const toggleIcon = document.createElement('span');
    toggleIcon.style.cssText = `font-size:14px; transition:transform .2s ease; display:inline-block; transform:rotate(${expanded ? '0deg' : '-90deg'});`;
    toggleIcon.textContent = '\u25be';

    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-size:18px; font-weight:600;';
    titleEl.textContent = title;

    const badge = document.createElement('span');
    badge.style.cssText = 'background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:12px; padding:2px 10px; font-size:13px; font-weight:500;';
    badge.textContent = count;

    header.appendChild(toggleIcon);
    header.appendChild(createIcon(iconName));
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
   * Updates the Select All checkbox indeterminate state and shows/hides the
   * bulk-action buttons without triggering a full tab re-render.
   */
  function refreshUpcomingBulkControls() {
    const selectAllCb = document.getElementById('upcomingSelectAll');
    if (!selectAllCb) return;

    const allCardIds = Array.from(
      document.querySelectorAll('#upcomingGrid .assignment-card')
    ).map(c => c.dataset.id).filter(Boolean);

    const count = selectedUpcoming.size;
    const allSelected = allCardIds.length > 0 && allCardIds.every(id => selectedUpcoming.has(id));
    const someSelected = allCardIds.some(id => selectedUpcoming.has(id));
    selectAllCb.checked = allSelected;
    selectAllCb.indeterminate = someSelected && !allSelected;

    const countLabel = document.getElementById('upcomingSelectionCount');
    if (countLabel) {
      countLabel.textContent = count > 0 ? `${count} selected` : '';
      countLabel.style.display = count > 0 ? '' : 'none';
    }
    const bulkDeleteBtn = document.getElementById('upcomingBulkDeleteBtn');
    if (bulkDeleteBtn) bulkDeleteBtn.style.display = count > 0 ? '' : 'none';
    const bulkArchiveBtn = document.getElementById('upcomingBulkArchiveBtn');
    if (bulkArchiveBtn) bulkArchiveBtn.style.display = count > 0 ? '' : 'none';
    const bulkSetUnitBtn = document.getElementById('upcomingBulkSetUnitBtn');
    if (bulkSetUnitBtn) bulkSetUnitBtn.style.display = count > 0 ? '' : 'none';
  }

  /**
   * Updates the Active tab Select All checkbox and shows/hides bulk-action buttons
   * without triggering a full re-render.
   */
  function refreshActiveBulkControls() {
    const selectAllCb = document.getElementById('activeSelectAll');
    if (!selectAllCb) return;

    const allCardIds = Array.from(
      document.querySelectorAll('#activeTab .assignment-card')
    ).map(c => c.dataset.id).filter(Boolean);

    const count = selectedActive.size;
    const allSelected = allCardIds.length > 0 && allCardIds.every(id => selectedActive.has(id));
    const someSelected = allCardIds.some(id => selectedActive.has(id));
    selectAllCb.checked = allSelected;
    selectAllCb.indeterminate = someSelected && !allSelected;

    const countLabel = document.getElementById('activeSelectionCount');
    if (countLabel) {
      countLabel.textContent = count > 0 ? count + ' selected' : '';
      countLabel.style.display = count > 0 ? '' : 'none';
    }
    const finalizeBtn = document.getElementById('activeBulkFinalizeBtn');
    if (finalizeBtn) finalizeBtn.style.display = count > 0 ? '' : 'none';
    const reIssueBtn = document.getElementById('activeBulkReIssueBtn');
    if (reIssueBtn) reIssueBtn.style.display = count > 0 ? '' : 'none';
  }

  /** Clears the active selection and re-renders the Active tab. */
  function refreshActiveTab() {
    selectedActive.clear();
    renderActiveTab();
  }

  /**
   * Issue #7: Opens a modal that lets the teacher bulk-finalize active assignments
   * created before a chosen date, with a live preview of affected assignments.
   */
  function openBulkFinalizeByDateModal() {
    const triggerEl = document.activeElement;

    // Default cutoff: 2 weeks ago
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() - 14);
    const defaultDateStr = defaultDate.toISOString().split('T')[0];

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'bulkFinalizeDateTitle');
    overlay.style.cssText = [
      'position:fixed; top:0; left:0; right:0; bottom:0;',
      'background:rgba(0,0,0,.80); backdrop-filter:blur(4px);',
      'display:flex; align-items:center; justify-content:center;',
      'z-index:10000; padding:24px; overflow-y:auto;'
    ].join('');

    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width:540px; width:100%; padding:28px; display:flex; flex-direction:column; gap:16px;';

    // Title
    const titleEl = document.createElement('h2');
    titleEl.id = 'bulkFinalizeDateTitle';
    titleEl.style.cssText = 'margin:0; font-size:20px; display:flex; align-items:center; gap:8px;';
    const titleIcon = document.createElement('span');
    titleIcon.style.cssText = 'display:inline-flex; align-items:center; color:#34d399;';
    titleIcon.appendChild(createIcon('checkCircle', 18));
    titleEl.appendChild(titleIcon);
    titleEl.appendChild(document.createTextNode(' Bulk Finalize'));
    card.appendChild(titleEl);

    // Date picker row
    const dateRow = document.createElement('div');
    dateRow.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
    const dateLabel = document.createElement('label');
    dateLabel.htmlFor = 'bulkFinalizeCutoffDate';
    dateLabel.style.cssText = 'font-size:13px; color:rgba(255,255,255,.70); font-weight:500;';
    dateLabel.textContent = 'Finalize all active assignments created before:';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'bulkFinalizeCutoffDate';
    dateInput.value = defaultDateStr;
    dateInput.style.cssText = 'padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.20); border-radius:8px; color:white; font-size:14px; color-scheme:dark; width:200px;';
    dateInput.setAttribute('aria-label', 'Finalize active assignments created before this date');
    dateRow.appendChild(dateLabel);
    dateRow.appendChild(dateInput);
    card.appendChild(dateRow);

    // Preview count label
    const previewCountEl = document.createElement('div');
    previewCountEl.style.cssText = 'font-size:13px; font-weight:600; color:#60a5fa;';
    card.appendChild(previewCountEl);

    // Preview list
    const previewList = document.createElement('div');
    previewList.style.cssText = 'max-height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:4px;';
    card.appendChild(previewList);

    // Action buttons
    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display:flex; gap:10px; justify-content:flex-end; padding-top:4px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'tc-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      if (triggerEl && triggerEl.focus) triggerEl.focus();
    });

    const finalizeAllBtn = document.createElement('button');
    finalizeAllBtn.className = 'tc-btn';
    finalizeAllBtn.style.cssText = 'border-color:rgba(52,211,153,.40); color:#34d399;';
    finalizeAllBtn.setAttribute('aria-label', 'Finalize all matching assignments');
    const faIcon = document.createElement('span');
    faIcon.style.cssText = 'display:inline-flex; align-items:center;';
    faIcon.appendChild(createIcon('checkCircle', 14));
    finalizeAllBtn.appendChild(faIcon);
    finalizeAllBtn.appendChild(document.createTextNode(' Finalize All'));

    actionsRow.appendChild(cancelBtn);
    actionsRow.appendChild(finalizeAllBtn);
    card.appendChild(actionsRow);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Helper: get active assignments created before the cutoff date
    function getMatchingAssignments(cutoffDateStr) {
      if (!cutoffDateStr) return [];
      const cutoff = new Date(cutoffDateStr);
      cutoff.setHours(23, 59, 59, 999);
      if (isNaN(cutoff.getTime())) return [];
      return assignmentsData.filter(a => {
        if ((laneCache.get(a.id) ?? computeLane(a, instancesData)) !== 'current') return false;
        const created = a.created_at ? new Date(a.created_at) : null;
        if (!created || isNaN(created.getTime())) return false;
        return created <= cutoff;
      });
    }

    // Helper: refresh the preview list
    function refreshPreview() {
      const matches = getMatchingAssignments(dateInput.value);
      previewCountEl.textContent = 'This will finalize ' + matches.length + ' assignment' + (matches.length !== 1 ? 's' : '');
      previewList.innerHTML = '';
      finalizeAllBtn.disabled = matches.length === 0;

      if (matches.length === 0) {
        const noMatchEl = document.createElement('div');
        noMatchEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.35); padding:8px 0;';
        noMatchEl.textContent = 'No active assignments match this date.';
        previewList.appendChild(noMatchEl);
        return;
      }

      matches.forEach(a => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:8px 12px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:7px; display:flex; align-items:center; gap:8px; font-size:12px;';
        const itemIcon = document.createElement('span');
        itemIcon.style.cssText = 'color:rgba(255,255,255,.40); flex-shrink:0; display:inline-flex;';
        itemIcon.appendChild(createIcon('fileText', 13));
        const itemTitle = document.createElement('span');
        itemTitle.style.cssText = 'flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500;';
        itemTitle.textContent = a.title || 'Untitled';
        const itemClass = document.createElement('span');
        itemClass.style.cssText = 'color:rgba(255,255,255,.40); flex-shrink:0;';
        itemClass.textContent = inferClassName(a) || '';
        const itemDate = document.createElement('span');
        itemDate.style.cssText = 'color:rgba(255,255,255,.30); flex-shrink:0;';
        itemDate.textContent = a.created_at ? new Date(a.created_at).toLocaleDateString() : '';
        item.appendChild(itemIcon);
        item.appendChild(itemTitle);
        if (itemClass.textContent) item.appendChild(itemClass);
        item.appendChild(itemDate);
        previewList.appendChild(item);
      });
    }

    // Wire up date input to refresh preview dynamically
    dateInput.addEventListener('input', refreshPreview);
    dateInput.addEventListener('change', refreshPreview);

    // Finalize All handler with Promise.allSettled and progress
    finalizeAllBtn.addEventListener('click', async () => {
      const matches = getMatchingAssignments(dateInput.value);
      if (matches.length === 0) return;

      cancelBtn.disabled = true;
      finalizeAllBtn.disabled = true;
      finalizeAllBtn.textContent = 'Finalizing\u2026';

      const now = new Date().toISOString();
      const snapshots = new Map();
      matches.forEach(a => {
        const idx = assignmentsData.findIndex(x => x.id === a.id);
        if (idx !== -1) snapshots.set(a.id, { ...assignmentsData[idx] });
      });

      // Optimistic update
      matches.forEach(a => {
        const idx = assignmentsData.findIndex(x => x.id === a.id);
        if (idx !== -1) {
          assignmentsData[idx].active = false;
          assignmentsData[idx].finalized_at = now;
        }
      });
      rebuildLaneCache();

      let done = 0;
      const total = matches.length;
      const results = await Promise.allSettled(
        matches.map(async (a) => {
          await db.updateAssignment(a.id, { active: false, finalized_at: now });
          done++;
          finalizeAllBtn.textContent = 'Finalizing ' + done + ' of ' + total + '\u2026';
        })
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Roll back any that failed
      if (failed > 0) {
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const a = matches[i];
            const idx = assignmentsData.findIndex(x => x.id === a.id);
            const snap = snapshots.get(a.id);
            if (idx !== -1 && snap) assignmentsData[idx] = snap;
          }
        });
        rebuildLaneCache();
      }

      overlay.remove();
      if (triggerEl && triggerEl.focus) triggerEl.focus();
      refreshActiveTab();

      const succeededIds = results
        .map((r, i) => r.status === 'fulfilled' ? matches[i].id : null)
        .filter(Boolean);

      if (failed === 0) {
        showFinalizeToast('\u2713 Finalized ' + succeeded + ' assignment' + (succeeded !== 1 ? 's' : ''), succeededIds);
      } else {
        showToast('Finalized ' + succeeded + ' of ' + total + ' \u2014 ' + failed + ' failed', '#f59e0b', '#0b1220');
      }
    });

    // Escape key closes the modal
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKey);
        if (triggerEl && triggerEl.focus) triggerEl.focus();
      }
    };
    document.addEventListener('keydown', handleKey);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        document.removeEventListener('keydown', handleKey);
        if (triggerEl && triggerEl.focus) triggerEl.focus();
      }
    });

    // Initial preview render and focus
    refreshPreview();
    setTimeout(() => dateInput.focus(), 50);
  }

  /**
   * Opens a modal that lets the teacher pick a unit and bulk-assign it to the
   * selected upcoming assignments.
   * @param {string[]} ids - Assignment IDs to update.
   */
  function openBulkSetUnitModal(ids) {
    const triggerEl = document.activeElement;
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'bulkSetUnitTitle');
    overlay.style.cssText = [
      'position:fixed; top:0; left:0; right:0; bottom:0;',
      'background:rgba(0,0,0,.80); backdrop-filter:blur(4px);',
      'display:flex; align-items:center; justify-content:center;',
      'z-index:10000; padding:24px;'
    ].join('');

    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width:480px; width:100%; padding:28px;';

    const titleEl = document.createElement('h2');
    titleEl.id = 'bulkSetUnitTitle';
    titleEl.style.cssText = 'margin:0 0 16px; font-size:20px; display:flex; align-items:center; gap:8px;';
    const titleIcon = document.createElement('span');
    titleIcon.appendChild(createIcon('folderOpen', 18));
    titleEl.appendChild(titleIcon);
    titleEl.appendChild(document.createTextNode(' Set Unit'));
    card.appendChild(titleEl);

    const desc = document.createElement('p');
    desc.style.cssText = 'margin:0 0 16px; font-size:13px; color:rgba(255,255,255,.60);';
    desc.textContent = 'Assign ' + ids.length + ' selected assignment' + (ids.length !== 1 ? 's' : '') + ' to a unit:';
    card.appendChild(desc);

    const unitSelect = document.createElement('select');
    unitSelect.style.cssText = 'width:100%; padding:10px 12px; background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.20); border-radius:8px; color:white; font-size:14px; margin-bottom:20px;';

    const blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = 'Uncategorized';
    unitSelect.appendChild(blankOpt);

    if (lessonsData && Array.isArray(lessonsData.sections)) {
      lessonsData.sections.forEach(section => {
        const group = document.createElement('optgroup');
        group.label = section.name;
        (section.units || []).forEach(unit => {
          const opt = document.createElement('option');
          opt.value = unit.id;
          opt.textContent = unit.name;
          group.appendChild(opt);
        });
        unitSelect.appendChild(group);
      });
    }
    card.appendChild(unitSelect);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:10px; justify-content:flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'tc-btn';
    cancelBtn.style.cssText = 'color:rgba(255,255,255,.60);';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'tc-btn';
    confirmBtn.style.cssText = 'background:rgba(96,165,250,.25); border-color:rgba(96,165,250,.40);';
    confirmBtn.appendChild(createIcon('folderOpen', 14));
    confirmBtn.appendChild(document.createTextNode(' Apply'));

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    unitSelect.focus();

    const closeModal = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKeyDown);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    confirmBtn.addEventListener('click', async () => {
      const chosenUnitId = unitSelect.value;
      const unitInfo = getUnitInfo(chosenUnitId);
      const chosenSectionId = unitInfo ? unitInfo.sectionId : null;
      const unitLabel = unitInfo ? unitInfo.unitName : 'Uncategorized';
      closeModal();
      const snapshots = new Map();
      ids.forEach(id => {
        const idx = assignmentsData.findIndex(a => a.id === id);
        if (idx !== -1) snapshots.set(id, { ...assignmentsData[idx] });
      });
      try {
        await Promise.all(ids.map(id => db.updateAssignment(id, { unit_id: chosenUnitId || null, section_id: chosenSectionId })));
        ids.forEach(id => {
          const idx = assignmentsData.findIndex(a => a.id === id);
          if (idx !== -1) {
            assignmentsData[idx].unit_id = chosenUnitId || null;
            assignmentsData[idx].section_id = chosenSectionId;
          }
        });
        selectedUpcoming.clear();
        refreshCurrentTab();
        showToast(ids.length + ' assignment' + (ids.length !== 1 ? 's' : '') + ' cataloged to ' + unitLabel);
      } catch (err) {
        console.error('[tc-library] Bulk set unit failed:', err);
        snapshots.forEach((snap, id) => {
          const idx = assignmentsData.findIndex(a => a.id === id);
          if (idx !== -1) assignmentsData[idx] = snap;
        });
        refreshCurrentTab();
        showToast('Failed to set unit', '#ef4444', '#fff');
      }
    });
  }

  /**
   * Opens the Catalog Wizard — a full-screen modal for bulk-cataloging
   * uncategorized reserve assignments using auto-inference suggestions.
   */
  function openCatalogWizard() {
    const triggerEl = document.activeElement;
    const overlay = document.createElement('div');
    overlay.id = 'catalogWizardOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'catalogWizardTitle');
    overlay.style.cssText = [
      'position:fixed; top:0; left:0; right:0; bottom:0;',
      'background:rgba(0,0,0,.85); backdrop-filter:blur(4px);',
      'display:flex; align-items:center; justify-content:center;',
      'z-index:10020; padding:16px;'
    ].join('');

    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width:820px; width:100%; max-height:92vh; display:flex; flex-direction:column; padding:28px;';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-shrink:0;';
    const hdrLeft = document.createElement('div');
    hdrLeft.style.cssText = 'display:flex; align-items:center; gap:10px;';
    const hdrIcon = document.createElement('span');
    hdrIcon.style.cssText = 'font-size:20px;';
    hdrIcon.textContent = '📋';
    const hdrTitle = document.createElement('h2');
    hdrTitle.id = 'catalogWizardTitle';
    hdrTitle.style.cssText = 'margin:0; font-size:20px; font-weight:700;';
    hdrTitle.textContent = 'Catalog Wizard';
    hdrLeft.appendChild(hdrIcon);
    hdrLeft.appendChild(hdrTitle);
    const wzCloseBtn = document.createElement('button');
    wzCloseBtn.className = 'tc-btn';
    wzCloseBtn.setAttribute('aria-label', 'Close Catalog Wizard');
    wzCloseBtn.style.cssText = 'padding:6px 12px;';
    wzCloseBtn.appendChild(createIcon('x', 14));
    hdr.appendChild(hdrLeft);
    hdr.appendChild(wzCloseBtn);
    card.appendChild(hdr);

    const body = document.createElement('div');
    body.style.cssText = 'flex:1; overflow-y:auto; min-height:0;';
    card.appendChild(body);

    const ftr = document.createElement('div');
    ftr.style.cssText = 'display:flex; justify-content:flex-end; gap:10px; margin-top:16px; flex-shrink:0; border-top:1px solid rgba(255,255,255,.1); padding-top:16px;';
    card.appendChild(ftr);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const closeWizard = () => {
      overlay.remove();
      document.removeEventListener('keydown', onWizardKey);
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
    };
    const onWizardKey = (e) => { if (e.key === 'Escape') closeWizard(); };
    document.addEventListener('keydown', onWizardKey);
    wzCloseBtn.addEventListener('click', closeWizard);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWizard(); });

    // Build suggestions from uncategorized reserve assignments
    const suggestions = assignmentsData
      .filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'upcoming' && !a.unit_id)
      .map(a => {
        const inf = inferUnitFromAssignment(a);
        return { a, unitId: inf.unitId, sectionId: inf.sectionId, confidence: inf.confidence, override: inf.unitId };
      });

    const checked = new Set();

    const confMeta = {
      high: { label: 'High Confidence', color: '#86efac', bg: 'rgba(34,197,94,.2)', border: 'rgba(34,197,94,.3)' },
      medium: { label: 'Medium Confidence', color: '#fcd34d', bg: 'rgba(245,158,11,.2)', border: 'rgba(245,158,11,.3)' },
      low: { label: 'Low / No Match', color: 'rgba(255,255,255,.5)', bg: 'rgba(255,255,255,.07)', border: 'rgba(255,255,255,.12)' }
    };

    const buildUnitPicker = (labelText, currentValue) => {
      const picker = document.createElement('select');
      picker.style.cssText = 'padding:4px 8px; background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.18); border-radius:6px; color:white; font-size:12px; max-width:210px; flex-shrink:0;';
      picker.setAttribute('aria-label', labelText);
      const noOpt = document.createElement('option');
      noOpt.value = '';
      noOpt.textContent = '\u2014 No match \u2014';
      picker.appendChild(noOpt);
      if (lessonsData && Array.isArray(lessonsData.sections)) {
        lessonsData.sections.forEach(sec => {
          const grp = document.createElement('optgroup');
          grp.label = sec.name;
          (sec.units || []).forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.name;
            grp.appendChild(opt);
          });
          picker.appendChild(grp);
        });
      }
      picker.value = currentValue || '';
      return picker;
    };

    const renderStep1 = () => {
      while (body.firstChild) body.removeChild(body.firstChild);
      while (ftr.firstChild) ftr.removeChild(ftr.firstChild);

      if (!suggestions.length) {
        const okMsg = document.createElement('div');
        okMsg.style.cssText = 'padding:40px; text-align:center; color:rgba(255,255,255,.65);';
        okMsg.textContent = '\u2713 All reserve assignments are already cataloged!';
        body.appendChild(okMsg);
        const doneBtn = document.createElement('button');
        doneBtn.className = 'tc-btn';
        doneBtn.textContent = 'Done';
        doneBtn.addEventListener('click', closeWizard);
        ftr.appendChild(doneBtn);
        return;
      }

      const intro = document.createElement('p');
      intro.style.cssText = 'margin:0 0 14px; font-size:13px; color:rgba(255,255,255,.65);';
      intro.textContent = suggestions.length + ' uncategorized reserve assignment' + (suggestions.length !== 1 ? 's' : '') + ' found. Review suggestions below:';
      body.appendChild(intro);

      const qRow = document.createElement('div');
      qRow.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;';
      const highCount = suggestions.filter(s => s.confidence === 'high' && s.unitId).length;
      const withMatch = suggestions.filter(s => s.override).length;

      const selHighBtn = document.createElement('button');
      selHighBtn.className = 'tc-btn';
      selHighBtn.style.cssText = 'font-size:12px; padding:4px 12px;';
      selHighBtn.textContent = 'Select All High (' + highCount + ')';
      selHighBtn.addEventListener('click', () => {
        suggestions.forEach(s => {
          if (s.confidence === 'high' && s.unitId) checked.add(s.a.id);
          else checked.delete(s.a.id);
        });
        renderStep1();
      });
      qRow.appendChild(selHighBtn);

      const selAllBtn = document.createElement('button');
      selAllBtn.className = 'tc-btn';
      selAllBtn.style.cssText = 'font-size:12px; padding:4px 12px;';
      selAllBtn.textContent = 'Select All (' + withMatch + ')';
      selAllBtn.addEventListener('click', () => {
        suggestions.forEach(s => { if (s.override) checked.add(s.a.id); });
        renderStep1();
      });
      qRow.appendChild(selAllBtn);

      const clrBtn = document.createElement('button');
      clrBtn.className = 'tc-btn';
      clrBtn.style.cssText = 'font-size:12px; padding:4px 12px; color:rgba(255,255,255,.5);';
      clrBtn.textContent = 'Clear All';
      clrBtn.addEventListener('click', () => { checked.clear(); renderStep1(); });
      qRow.appendChild(clrBtn);
      body.appendChild(qRow);

      const confGroups = { high: [], medium: [], low: [] };
      suggestions.forEach(s => confGroups[s.confidence].push(s));

      ['high', 'medium', 'low'].forEach(conf => {
        const group = confGroups[conf];
        if (!group.length) return;
        const gHdr = document.createElement('div');
        gHdr.style.cssText = 'font-size:12px; font-weight:700; letter-spacing:.04em; padding:4px 2px; margin:10px 0 6px; color:' + confMeta[conf].color + ';';
        gHdr.textContent = confMeta[conf].label + ' (' + group.length + ')';
        body.appendChild(gHdr);

        const list = document.createElement('div');
        list.style.cssText = 'display:flex; flex-direction:column; gap:4px;';

        group.forEach(s => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:7px 10px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:8px;';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = checked.has(s.a.id);
          cb.disabled = !s.override;
          cb.style.cssText = 'cursor:pointer; width:14px; height:14px; accent-color:#60a5fa; flex-shrink:0;';
          cb.setAttribute('aria-label', 'Select ' + s.a.title);
          cb.addEventListener('change', () => { if (cb.checked) checked.add(s.a.id); else checked.delete(s.a.id); });
          row.appendChild(cb);

          const tSpan = document.createElement('span');
          tSpan.style.cssText = 'flex:1; font-size:13px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
          tSpan.title = s.a.title;
          tSpan.textContent = s.a.title;
          row.appendChild(tSpan);

          const arrSpan = document.createElement('span');
          arrSpan.style.cssText = 'color:rgba(255,255,255,.35); font-size:12px; flex-shrink:0;';
          arrSpan.textContent = '\u2192';
          row.appendChild(arrSpan);

          const picker = buildUnitPicker('Unit for ' + s.a.title, s.override);
          picker.addEventListener('change', () => {
            s.override = picker.value || null;
            cb.disabled = !s.override;
            if (!s.override) { checked.delete(s.a.id); cb.checked = false; }
          });
          row.appendChild(picker);

          const badge = document.createElement('span');
          badge.style.cssText = 'padding:2px 7px; border-radius:10px; font-size:11px; font-weight:700; flex-shrink:0; background:' + confMeta[conf].bg + '; color:' + confMeta[conf].color + '; border:1px solid ' + confMeta[conf].border + ';';
          badge.textContent = conf;
          row.appendChild(badge);

          list.appendChild(row);
        });
        body.appendChild(list);
      });

      const skipBtn = document.createElement('button');
      skipBtn.className = 'tc-btn';
      skipBtn.style.cssText = 'color:rgba(255,255,255,.5);';
      skipBtn.textContent = 'Skip';
      skipBtn.addEventListener('click', renderStep3);
      ftr.appendChild(skipBtn);

      const checkedCount = checked.size;
      const applyBtn = document.createElement('button');
      applyBtn.className = 'tc-btn';
      applyBtn.disabled = checkedCount === 0;
      applyBtn.style.cssText = 'background:rgba(96,165,250,.25); border-color:rgba(96,165,250,.4);' + (checkedCount === 0 ? ' opacity:.5;' : '');
      applyBtn.appendChild(createIcon('folderOpen', 14));
      applyBtn.appendChild(document.createTextNode(' Apply Selected (' + checkedCount + ')'));
      applyBtn.addEventListener('click', applySelected);
      ftr.appendChild(applyBtn);
    };

    const applySelected = async () => {
      const toApply = suggestions.filter(s => checked.has(s.a.id));
      if (!toApply.length) return;
      while (body.firstChild) body.removeChild(body.firstChild);
      while (ftr.firstChild) ftr.removeChild(ftr.firstChild);

      const progWrap = document.createElement('div');
      progWrap.style.cssText = 'padding:40px; text-align:center;';
      const progText = document.createElement('span');
      progText.style.cssText = 'color:rgba(255,255,255,.65); font-size:14px;';
      progText.textContent = 'Applying 0 / ' + toApply.length + '\u2026';
      progWrap.appendChild(progText);
      body.appendChild(progWrap);

      let done = 0, fails = 0;
      const CHUNK = 5;
      for (let i = 0; i < toApply.length; i += CHUNK) {
        const chunk = toApply.slice(i, i + CHUNK);
        const results = await Promise.allSettled(chunk.map(s => {
          const uid = s.override;
          const uInfo = getUnitInfo(uid);
          const sid = uInfo ? uInfo.sectionId : null;
          return db.updateAssignment(s.a.id, { unit_id: uid, section_id: sid }).then(() => {
            const idx = assignmentsData.findIndex(x => x.id === s.a.id);
            if (idx !== -1) { assignmentsData[idx].unit_id = uid; assignmentsData[idx].section_id = sid; }
          });
        }));
        results.forEach(r => { if (r.status === 'fulfilled') done++; else fails++; });
        progText.textContent = 'Applying ' + (done + fails) + ' / ' + toApply.length + '\u2026';
      }
      showToast(done + ' assignment' + (done !== 1 ? 's' : '') + ' cataloged' + (fails > 0 ? ' (' + fails + ' failed)' : ''));
      refreshCurrentTab();
      renderStep3();
    };

    const renderStep3 = () => {
      while (body.firstChild) body.removeChild(body.firstChild);
      while (ftr.firstChild) ftr.removeChild(ftr.firstChild);
      const remaining = assignmentsData.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'upcoming' && !a.unit_id);

      if (!remaining.length) {
        const okMsg2 = document.createElement('div');
        okMsg2.style.cssText = 'padding:40px; text-align:center; color:rgba(255,255,255,.65);';
        okMsg2.textContent = '\u2713 All reserve assignments are now cataloged!';
        body.appendChild(okMsg2);
      } else {
        const intro2 = document.createElement('p');
        intro2.style.cssText = 'margin:0 0 14px; font-size:13px; color:rgba(255,255,255,.65);';
        intro2.textContent = remaining.length + ' assignment' + (remaining.length !== 1 ? 's' : '') + ' still need a unit:';
        body.appendChild(intro2);

        const list2 = document.createElement('div');
        list2.style.cssText = 'display:flex; flex-direction:column; gap:6px;';

        remaining.forEach(a => {
          const row2 = document.createElement('div');
          row2.style.cssText = 'display:flex; align-items:center; gap:8px; padding:7px 10px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:8px;';

          const tSpan2 = document.createElement('span');
          tSpan2.style.cssText = 'flex:1; font-size:13px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
          tSpan2.title = a.title;
          tSpan2.textContent = a.title;
          row2.appendChild(tSpan2);

          const picker2 = buildUnitPicker('Set unit for ' + a.title, null);
          picker2.options[0].textContent = '\u2014 Select unit \u2014';
          row2.appendChild(picker2);

          const setBtn = document.createElement('button');
          setBtn.className = 'tc-btn';
          setBtn.style.cssText = 'font-size:12px; padding:4px 10px; flex-shrink:0;';
          setBtn.textContent = 'Set';
          setBtn.addEventListener('click', async () => {
            const uid2 = picker2.value;
            if (!uid2) return;
            const uInfo2 = getUnitInfo(uid2);
            const sid2 = uInfo2 ? uInfo2.sectionId : null;
            const idx2 = assignmentsData.findIndex(x => x.id === a.id);
            const snapshot2 = idx2 !== -1 ? { ...assignmentsData[idx2] } : null;
            if (idx2 !== -1) { assignmentsData[idx2].unit_id = uid2; assignmentsData[idx2].section_id = sid2; }
            try {
              setBtn.disabled = true;
              setBtn.textContent = '\u2026';
              await db.updateAssignment(a.id, { unit_id: uid2, section_id: sid2 });
              row2.remove();
              refreshCurrentTab();
            } catch (_e2) {
              if (idx2 !== -1 && snapshot2) assignmentsData[idx2] = snapshot2;
              setBtn.disabled = false;
              setBtn.textContent = 'Set';
              showToast('Failed to update assignment', '#ef4444', '#fff');
            }
          });
          row2.appendChild(setBtn);
          list2.appendChild(row2);
        });
        body.appendChild(list2);
      }

      const backBtn = document.createElement('button');
      backBtn.className = 'tc-btn';
      backBtn.style.cssText = 'color:rgba(255,255,255,.5);';
      backBtn.textContent = '\u2190 Back';
      backBtn.addEventListener('click', renderStep1);
      ftr.appendChild(backBtn);

      const doneBtn2 = document.createElement('button');
      doneBtn2.className = 'tc-btn';
      doneBtn2.textContent = 'Done';
      doneBtn2.addEventListener('click', closeWizard);
      ftr.appendChild(doneBtn2);
    };

    renderStep1();
    wzCloseBtn.focus();
  }

  function renderUpcomingLane(assignments) {
    if (assignments.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:32px 24px; text-align:center;';
      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:12px; color:rgba(255,255,255,.40);';
      iconWrap.appendChild(createIcon('clipboardPlus', 32));
      const title = document.createElement('div');
      title.style.cssText = 'font-size:16px; font-weight:600; margin-bottom:6px;';
      title.textContent = 'No upcoming assignments';
      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'font-size:13px; color:rgba(255,255,255,.50); margin-bottom:16px;';
      subtitle.textContent = 'Create one in Work \u2192 or upload a paper assignment';
      const tipEl = document.createElement('div');
      tipEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.35); margin-bottom:16px;';
      tipEl.textContent = 'Tip: Press ? to see keyboard shortcuts';
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex; gap:8px; justify-content:center; flex-wrap:wrap;';
      const uploadBtn = document.createElement('button');
      uploadBtn.className = 'tc-btn';
      uploadBtn.appendChild(createIcon('upload'));
      uploadBtn.appendChild(document.createTextNode(' Upload Paper'));
      uploadBtn.addEventListener('click', () => openUploadPaperModal());
      const workBtn = document.createElement('button');
      workBtn.className = 'tc-btn';
      workBtn.appendChild(createIcon('arrowRight'));
      workBtn.appendChild(document.createTextNode(' Go to Work \u2192'));
      workBtn.addEventListener('click', () => { window.location.href = '/teacher/work/'; });
      btnRow.appendChild(uploadBtn);
      btnRow.appendChild(workBtn);
      empty.appendChild(iconWrap);
      empty.appendChild(title);
      empty.appendChild(subtitle);
      empty.appendChild(tipEl);
      empty.appendChild(btnRow);
      return empty;
    }
    const grid = document.createElement('div');
    grid.id = 'upcomingGrid';
    grid.className = 'tc-lib-grid';

    // ── Bulk controls row ─────────────────────────────────────────────────────
    const container = document.createElement('div');

    const controlsRow = document.createElement('div');
    controlsRow.id = 'upcomingBulkControls';
    controlsRow.style.cssText = [
      'display:flex; align-items:center; gap:10px; flex-wrap:wrap;',
      'padding:8px 4px 12px 4px; border-bottom:1px solid rgba(255,255,255,.08); margin-bottom:12px;'
    ].join('');

    const selectAllLabel = document.createElement('label');
    selectAllLabel.style.cssText = 'display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; color:rgba(255,255,255,.70); user-select:none;';

    const selectAllCb = document.createElement('input');
    selectAllCb.type = 'checkbox';
    selectAllCb.id = 'upcomingSelectAll';
    selectAllCb.style.cssText = 'cursor:pointer; width:15px; height:15px; accent-color:#60a5fa;';

    selectAllCb.addEventListener('change', () => {
      if (selectAllCb.checked) {
        assignments.forEach(a => selectedUpcoming.add(a.id));
      } else {
        assignments.forEach(a => selectedUpcoming.delete(a.id));
      }
      grid.querySelectorAll('.assignment-card').forEach(c => {
        const isSelected = selectedUpcoming.has(c.dataset.id);
        c.style.outline = isSelected ? '2px solid #60a5fa' : '';
        c.style.boxShadow = isSelected ? '0 0 0 2px rgba(96,165,250,.25)' : '';
        const cb = c.querySelector('.upcoming-select-cb');
        if (cb) cb.checked = isSelected;
      });
      refreshUpcomingBulkControls();
    });

    selectAllLabel.appendChild(selectAllCb);
    selectAllLabel.appendChild(document.createTextNode('Select All'));
    controlsRow.appendChild(selectAllLabel);

    const countLabel = document.createElement('span');
    countLabel.id = 'upcomingSelectionCount';
    countLabel.style.cssText = 'font-size:13px; font-weight:600; color:#60a5fa; display:none;';
    controlsRow.appendChild(countLabel);

    /**
     * Shared helper for bulk delete/archive — deactivates all selected assignments,
     * clears selections, re-renders, and shows a toast.
     * @param {string} actionLabel - human-readable label for the toast (e.g. "deleted")
     * @param {string} logTag - tag for console.error on failure
     */
    async function executeBulkDeactivate(actionLabel, logTag) {
      const ids = [...selectedUpcoming];
      const count = ids.length;
      if (count === 0) return;
      const snapshots = new Map();
      ids.forEach(id => {
        const idx = assignmentsData.findIndex(a => a.id === id);
        if (idx !== -1) snapshots.set(id, { ...assignmentsData[idx] });
      });
      try {
        await Promise.all(ids.map(id => db.updateAssignment(id, { active: false })));
        ids.forEach(id => {
          const idx = assignmentsData.findIndex(a => a.id === id);
          if (idx !== -1) assignmentsData[idx].active = false;
        });
        selectedUpcoming.clear();
        rebuildLaneCache();
        refreshCurrentTab();
        showToast(count + ' assignment' + (count !== 1 ? 's' : '') + ' ' + actionLabel);
      } catch (err) {
        console.error('[tc-library] ' + logTag + ' failed:', err);
        snapshots.forEach((snap, id) => {
          const idx = assignmentsData.findIndex(a => a.id === id);
          if (idx !== -1) assignmentsData[idx] = snap;
        });
        rebuildLaneCache();
        refreshCurrentTab();
        showToast('Bulk ' + logTag + ' failed', '#ef4444', '#fff');
      }
    }

    const bulkDeleteBtn = document.createElement('button');
    bulkDeleteBtn.id = 'upcomingBulkDeleteBtn';
    bulkDeleteBtn.className = 'tc-btn';
    bulkDeleteBtn.style.cssText = 'display:none; font-size:12px; padding:5px 12px; color:#f87171; border-color:rgba(248,113,113,.3);';
    bulkDeleteBtn.appendChild(createIcon('x', 14));
    bulkDeleteBtn.appendChild(document.createTextNode(' Delete Selected'));
    bulkDeleteBtn.addEventListener('click', async () => {
      const ids = [...selectedUpcoming];
      const count = ids.length;
      if (count === 0) return;
      const confirmed = await rcConfirm(
        'Bulk Delete',
        'Delete ' + count + ' selected assignment' + (count !== 1 ? 's' : '') + '?\n\nThese assignments have never been issued to students. They will be archived.',
        'Delete All',
        { danger: true }
      );
      if (!confirmed) return;
      await executeBulkDeactivate('deleted', 'bulk delete');
    });
    controlsRow.appendChild(bulkDeleteBtn);

    const bulkArchiveBtn = document.createElement('button');
    bulkArchiveBtn.id = 'upcomingBulkArchiveBtn';
    bulkArchiveBtn.className = 'tc-btn';
    bulkArchiveBtn.style.cssText = 'display:none; font-size:12px; padding:5px 12px;';
    bulkArchiveBtn.appendChild(createIcon('inbox', 14));
    bulkArchiveBtn.appendChild(document.createTextNode(' Archive Selected'));
    bulkArchiveBtn.addEventListener('click', async () => {
      const ids = [...selectedUpcoming];
      const count = ids.length;
      if (count === 0) return;
      const confirmed = await rcConfirm(
        'Bulk Archive',
        'Archive ' + count + ' selected assignment' + (count !== 1 ? 's' : '') + '?\n\nThey will move to the Finalized section.',
        'Archive All'
      );
      if (!confirmed) return;
      await executeBulkDeactivate('archived', 'bulk archive');
    });
    controlsRow.appendChild(bulkArchiveBtn);

    const bulkSetUnitBtn = document.createElement('button');
    bulkSetUnitBtn.id = 'upcomingBulkSetUnitBtn';
    bulkSetUnitBtn.className = 'tc-btn';
    bulkSetUnitBtn.style.cssText = 'display:none; font-size:12px; padding:5px 12px;';
    bulkSetUnitBtn.appendChild(createIcon('folderOpen', 14));
    bulkSetUnitBtn.appendChild(document.createTextNode(' Set Unit'));
    bulkSetUnitBtn.addEventListener('click', () => {
      const ids = [...selectedUpcoming];
      if (ids.length === 0) return;
      openBulkSetUnitModal(ids);
    });
    controlsRow.appendChild(bulkSetUnitBtn);

    container.appendChild(controlsRow);

    assignments.forEach(a => grid.appendChild(renderUpcomingCard(a)));

    // ── Drag-and-drop reorder handlers ────────────────────────────────────
    let _dragSrcId = null;

    grid.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.assignment-card');
      if (!card || !card.dataset.id) return;
      _dragSrcId = card.dataset.id;
      e.dataTransfer.setData('text/plain', _dragSrcId);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => card.classList.add('dragging'));
    });

    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const card = e.target.closest('.assignment-card');
      grid.querySelectorAll('.assignment-card.drag-over').forEach(c => c.classList.remove('drag-over'));
      if (card && card.dataset.id && card.dataset.id !== _dragSrcId) {
        card.classList.add('drag-over');
      }
    });

    grid.addEventListener('dragleave', (e) => {
      const card = e.target.closest('.assignment-card');
      if (card) card.classList.remove('drag-over');
    });

    grid.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetCard = e.target.closest('.assignment-card');
      grid.querySelectorAll('.assignment-card.drag-over').forEach(c => c.classList.remove('drag-over'));
      if (!targetCard || !_dragSrcId || targetCard.dataset.id === _dragSrcId) return;
      const targetId = targetCard.dataset.id;
      const srcIdx = assignmentsData.findIndex(a => a.id === _dragSrcId);
      const tgtIdx = assignmentsData.findIndex(a => a.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return;
      const [moved] = assignmentsData.splice(srcIdx, 1);
      assignmentsData.splice(tgtIdx, 0, moved);
      // Persist custom order
      try {
        const order = assignmentsData.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'upcoming').map(a => a.id);
        localStorage.setItem('rc_tc_library_reserve_order_v1', JSON.stringify(order));
      } catch (_) { /* storage full */ }
      filters.assignments.sortBy = 'custom';
      saveFilters();
      renderReserveTab();
    });

    grid.addEventListener('dragend', (e) => {
      const card = e.target.closest('.assignment-card');
      if (card) card.classList.remove('dragging');
      grid.querySelectorAll('.assignment-card.drag-over').forEach(c => c.classList.remove('drag-over'));
      _dragSrcId = null;
    });

    container.appendChild(grid);

    // Sync initial toolbar state (e.g. after filter re-render with persisted selections)
    refreshUpcomingBulkControls();

    return container;
  }

  function renderUpcomingCard(assignment) {
    const createdDate = assignment.created_at
      ? new Date(assignment.created_at).toLocaleDateString()
      : 'Unknown';
    const card = document.createElement('div');
    card.className = 'tc-card assignment-card';
    card.dataset.id = assignment.id || '';
    card.setAttribute('draggable', 'true');
    card.setAttribute('aria-label', 'Drag to reorder: ' + (assignment.title || 'Untitled'));
    const isSelected = assignment.id != null && selectedUpcoming.has(assignment.id);
    card.style.cssText = [
      'padding:20px; cursor:pointer;',
      isSelected ? 'outline:2px solid #60a5fa; box-shadow:0 0 0 2px rgba(96,165,250,.25);' : ''
    ].join('');

    // ── Individual selection checkbox ────────────────────────────────────────
    const cbWrap = document.createElement('div');
    cbWrap.style.cssText = 'display:flex; justify-content:flex-end; margin-bottom:6px;';
    const selectCb = document.createElement('input');
    selectCb.type = 'checkbox';
    selectCb.className = 'upcoming-select-cb';
    selectCb.checked = isSelected;
    selectCb.disabled = assignment.id == null;
    selectCb.setAttribute('aria-label', 'Select ' + (assignment.title || 'Untitled'));
    selectCb.style.cssText = 'cursor:pointer; width:15px; height:15px; accent-color:#60a5fa;';
    selectCb.addEventListener('change', () => {
      if (assignment.id == null) return;
      if (selectCb.checked) {
        selectedUpcoming.add(assignment.id);
        card.style.outline = '2px solid #60a5fa';
        card.style.boxShadow = '0 0 0 2px rgba(96,165,250,.25)';
      } else {
        selectedUpcoming.delete(assignment.id);
        card.style.outline = '';
        card.style.boxShadow = '';
      }
      refreshUpcomingBulkControls();
    });
    cbWrap.appendChild(selectCb);
    card.appendChild(cbWrap);

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;';

    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'margin:0; font-size:16px; flex:1; line-height:1.3;';
    titleEl.textContent = assignment.title || 'Untitled';
    const typePill = document.createElement('span');
    typePill.style.cssText = 'background:rgba(96,165,250,.20);color:#60a5fa;padding:3px 10px;border-radius:12px;font-size:12px;white-space:nowrap;flex-shrink:0;';
    typePill.textContent = getAssignmentTypeLabel(assignment) || (assignment.type || 'file');
    headerRow.appendChild(titleEl);
    headerRow.appendChild(typePill);
    card.appendChild(headerRow);

    const instances = instancesData.filter(i => i.assignment_id === assignment.id);
    const instanceBadge = document.createElement('div');
    instanceBadge.style.cssText = 'font-size:13px; margin-bottom:6px; display:inline-flex; align-items:center; gap:4px;';
    const clipIcon = createIcon('clipboard', 13);
    clipIcon.style.cssText = 'flex-shrink:0;';
    instanceBadge.appendChild(clipIcon);
    if (instances.length === 0) {
      instanceBadge.style.color = 'rgba(251,191,36,.80)';
      instanceBadge.appendChild(document.createTextNode('0 students \u00b7 Not yet issued'));
    } else {
      instanceBadge.style.color = 'rgba(255,255,255,.60)';
      instanceBadge.appendChild(document.createTextNode(instances.length + ' student' + (instances.length === 1 ? '' : 's') + ' assigned'));
    }
    card.appendChild(instanceBadge);

    if (assignment.series && !assignment.series.startsWith('http')) {
      // Skip URL values (e.g. linked resources) — only show human-readable series/class names
      const seriesEl = document.createElement('div');
      seriesEl.style.cssText = 'margin-bottom:8px; display:inline-flex; align-items:center; gap:6px;';
      const seriesIcon = createIcon('users', 12);
      seriesIcon.style.cssText = 'flex-shrink:0; color:#60a5fa;';
      seriesEl.appendChild(seriesIcon);
      seriesEl.appendChild(createClassBadgeSpan(assignment.series));
      card.appendChild(seriesEl);
    }

    const cardTags = Array.isArray(assignment.tags) ? assignment.tags.filter(Boolean) : [];
    if (cardTags.length > 0) {
      const tagRow = document.createElement('div');
      tagRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;';
      cardTags.forEach(tag => {
        const tagPill = document.createElement('span');
        tagPill.style.cssText = 'background:rgba(255,255,255,.08); color:rgba(255,255,255,.50); padding:2px 8px; border-radius:10px; font-size:11px;';
        tagPill.textContent = tag;
        tagRow.appendChild(tagPill);
      });
      card.appendChild(tagRow);
    }

    const dueDates = instances.map(i => i.due_at).filter(Boolean);
    const nearestDue = dueDates.length > 0
      ? new Date(Math.min(...dueDates.map(d => new Date(d).getTime())))
      : null;
    if (nearestDue) {
      const dueEl = document.createElement('div');
      dueEl.style.cssText = 'color:rgba(255,255,255,.60); font-size:13px; margin-bottom:8px; display:inline-flex; align-items:center; gap:4px;';
      const calIcon = createIcon('calendar', 13);
      calIcon.style.cssText = 'flex-shrink:0;';
      dueEl.appendChild(calIcon);
      dueEl.appendChild(document.createTextNode('Due: ' + nearestDue.toLocaleDateString()));
      card.appendChild(dueEl);
    } else {
      const noDueEl = document.createElement('div');
      noDueEl.style.cssText = 'color:rgba(255,255,255,.35); font-size:13px; margin-bottom:8px;';
      noDueEl.textContent = 'No due date set';
      card.appendChild(noDueEl);
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
    issueBtn.style.cssText = 'flex:1; font-size:13px; display:inline-flex; align-items:center; justify-content:center; gap:6px;';
    issueBtn.appendChild(createIcon('arrowRight', 14));
    issueBtn.appendChild(document.createTextNode('Launch'));
    btnRow.appendChild(issueBtn);

    const dupBtn = document.createElement('button');
    dupBtn.className = 'tc-btn';
    dupBtn.title = 'Create a copy of this assignment';
    dupBtn.setAttribute('aria-label', 'Duplicate ' + (assignment.title || 'Untitled'));
    dupBtn.style.cssText = 'font-size:13px; display:inline-flex; align-items:center; justify-content:center; gap:6px;';
    dupBtn.appendChild(createIcon('copy', 14));
    dupBtn.appendChild(document.createTextNode('Duplicate'));
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newId = genDraftId();
      const newDraft = {
        id: newId,
        title: (assignment.title || 'Untitled') + ' (Copy)',
        className: assignment.series || '',
        batchId: null,
        assignment: {
          kind: assignment.type || 'file',
          text: assignment.page || assignment.meta || '',
        },
        createdAt: new Date().toISOString(),
        submittedAt: null,
        issuedAt: null,
        assignmentId: null,
      };
      try {
        const drafts = JSON.parse(localStorage.getItem('rc_tc_work_drafts_v1') || '[]');
        drafts.unshift(newDraft);
        localStorage.setItem('rc_tc_work_drafts_v1', JSON.stringify(drafts));
      } catch (err) {
        console.error('[tc-library] Failed to save duplicate draft:', err);
        showToast('Could not save duplicate \u2014 storage may be full.', '#ef4444', '#fff');
        return;
      }
      showToast('Assignment duplicated \u2014 new draft created');
      renderReserveTab();
    });
    btnRow.appendChild(dupBtn);
    card.appendChild(btnRow);

    if (instances.length === 0) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'tc-btn';
      deleteBtn.style.cssText = 'font-size:12px; padding:5px 12px; color:#f87171; border-color:rgba(248,113,113,.3); margin-top:8px;';
      deleteBtn.appendChild(createIcon('x', 14));
      deleteBtn.appendChild(document.createTextNode(' Delete'));
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await rcConfirm(
          'Delete Assignment',
          'Are you sure you want to delete "' + (assignment.title || 'Untitled') + '"?\n\nThis assignment has never been issued to students. It will be archived.',
          'Delete',
          { danger: true }
        );
        if (!confirmed) return;
        const idx = assignmentsData.findIndex(a => a.id === assignment.id);
        const snapshot = idx !== -1 ? { ...assignmentsData[idx] } : null;
        try {
          await db.updateAssignment(assignment.id, { active: false });
          if (idx !== -1) assignmentsData[idx].active = false;
          rebuildLaneCache();
          refreshCurrentTab();
          showToast('Assignment deleted');
        } catch (err) {
          console.error('[tc-library] Failed to delete assignment:', err);
          if (idx !== -1 && snapshot) assignmentsData[idx] = snapshot;
          rebuildLaneCache();
          refreshCurrentTab();
          showToast('Failed to delete assignment', '#ef4444', '#fff');
        }
      });
      card.appendChild(deleteBtn);
    }

    return card;
  }

  // ── Current / Active Lane ─────────────────────────────────────────────────────

  /**
   * Infer the class name for an assignment using classEnrollmentsData cross-reference,
   * falling back to assignment.series (when it's not a URL).
   * @param {Object} assignment
   * @returns {string|null}
   */
  function inferClassName(assignment) {
    // Strategy 1: cross-reference instances → classEnrollmentsData
    const instances = instancesData.filter(i => i.assignment_id === assignment.id);
    if (instances.length > 0) {
      const classCounts = new Map();
      for (const instance of instances) {
        const enrollment = classEnrollmentsData.find(
          e => e.student_code === instance.student_code && e.active !== false
        );
        if (enrollment && enrollment.class_name) {
          classCounts.set(enrollment.class_name, (classCounts.get(enrollment.class_name) || 0) + 1);
        }
      }
      if (classCounts.size > 0) {
        return [...classCounts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      }
    }
    // Strategy 2: assignment.series when it is not a URL
    if (assignment.series && !assignment.series.startsWith('http')) {
      return assignment.series;
    }
    return null;
  }

  /**
   * Computes which students are missing work across all active assignments.
   * Cross-references active assignments × classEnrollmentsData × instancesData.
   * Returns an array of { studentCode, studentName, className, missingAssignments }
   * for students who have at least one missing assignment.
   * A student is "missing" if they have no instance, or their instance status is 'Assigned'.
   */
  function computeMissingWork() {
    const activeList = assignmentsData.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'current');
    // Map: studentCode → { studentCode, studentName, className, missingAssignments: [] }
    const studentMap = new Map();

    for (const assignment of activeList) {
      const className = inferClassName(assignment);
      if (!className) continue;

      const enrolledStudents = classEnrollmentsData.filter(
        e => e.class_name === className && e.active !== false
      );

      for (const enrolled of enrolledStudents) {
        const studentCode = enrolled.student_code;
        if (!studentCode) continue;
        const studentName = enrolled.student_name || enrolled.name || studentCode;

        const instance = instancesData.find(
          i => i.assignment_id === assignment.id && i.student_code === studentCode
        );

        // Missing: no instance exists, or student hasn't started (status 'Assigned')
        if (!instance || instance.status === 'Assigned') {
          if (!studentMap.has(studentCode)) {
            studentMap.set(studentCode, { studentCode, studentName, className, missingAssignments: [] });
          }
          studentMap.get(studentCode).missingAssignments.push(assignment);
        }
      }
    }

    return [...studentMap.values()];
  }

  /**
   * Updates the missing work badge on the Active tab button.
   * Shows the count of students with missing work, or hides the badge when zero.
   */
  function updateMissingWorkBadge() {
    const badge = document.getElementById('activeMissingBadge');
    if (!badge) return;
    if (classEnrollmentsData.length === 0) {
      badge.style.display = 'none';
      return;
    }
    const missingStudents = computeMissingWork();
    const count = missingStudents.length;
    if (count === 0) {
      badge.style.display = 'none';
    } else {
      badge.textContent = String(count);
      badge.style.display = 'inline';
    }
  }

  function updateRecallBadge() {
    const badge = document.getElementById('recallLibraryBadge');
    if (!badge) return;
    const count = Array.isArray(_recallLibraryEntries) ? _recallLibraryEntries.length : 0;
    if (count === 0) {
      badge.style.display = 'none';
    } else {
      badge.textContent = String(count);
      badge.style.display = 'inline';
    }
  }

  /**
   * @param {string} className
   * @returns {HTMLElement}
   */
  function createClassBadgeSpan(className) {
    const span = document.createElement('span');
    span.style.cssText = 'background:rgba(96,165,250,.15); color:#60a5fa; padding:2px 8px; border-radius:10px; font-size:12px; white-space:nowrap; flex-shrink:0;';
    span.textContent = className;
    return span;
  }

  function renderCurrentLane(assignments) {
    if (assignments.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:32px 24px; text-align:center;';
      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:12px; color:rgba(255,255,255,.40);';
      iconWrap.appendChild(createIcon('refreshCw', 32));
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:14px; color:rgba(255,255,255,.40);';
      msg.textContent = 'No active assignments match the current filters.';
      empty.appendChild(iconWrap);
      empty.appendChild(msg);
      return empty;
    }
    const grid = document.createElement('div');
    grid.className = 'tc-lib-grid';
    assignments.forEach(a => grid.appendChild(renderCurrentCard(a)));
    return grid;
  }

  function renderCurrentCard(assignment) {
    const stats = getAssignmentStats(assignment, instancesData, submissionsData);
    const instances = instancesData.filter(i => i.assignment_id === assignment.id);
    const dueDates = instances.map(i => i.due_at).filter(Boolean);
    const nearestDue = dueDates.length > 0
      ? new Date(Math.min(...dueDates.map(d => new Date(d).getTime())))
      : null;

    const card = document.createElement('div');
    card.className = 'tc-card assignment-card';
    card.dataset.id = assignment.id || '';
    card.style.cssText = 'padding:20px; cursor:pointer;';

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;';

    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'margin:0; font-size:16px; flex:1; line-height:1.3;';
    titleEl.textContent = assignment.title || 'Untitled';
    const typePill = document.createElement('span');
    typePill.style.cssText = 'background:rgba(96,165,250,.20);color:#60a5fa;padding:3px 10px;border-radius:12px;font-size:12px;white-space:nowrap;flex-shrink:0;';
    typePill.textContent = getAssignmentTypeLabel(assignment) || (assignment.type || 'file');
    headerRow.appendChild(titleEl);
    headerRow.appendChild(typePill);
    card.appendChild(headerRow);

    const className = inferClassName(assignment);
    if (className) {
      const classEl = document.createElement('div');
      classEl.style.cssText = 'margin-bottom:8px; display:inline-flex; align-items:center; gap:4px;';
      const classIcon = createIcon('users', 12);
      classIcon.style.cssText = 'flex-shrink:0; color:#60a5fa;';
      classEl.appendChild(classIcon);
      classEl.appendChild(createClassBadgeSpan(className));
      card.appendChild(classEl);
    }

    if (assignment.series) {
      const seriesEl = document.createElement('div');
      seriesEl.style.cssText = 'color:rgba(255,255,255,.60); font-size:13px; margin-bottom:6px; display:inline-flex; align-items:center; gap:4px;';
      const seriesIcon = createIcon('bookOpen', 13);
      seriesIcon.style.cssText = 'flex-shrink:0;';
      seriesEl.appendChild(seriesIcon);
      seriesEl.appendChild(document.createTextNode(assignment.series));
      card.appendChild(seriesEl);
    }

    if (nearestDue) {
      const dueEl = document.createElement('div');
      dueEl.style.cssText = 'color:rgba(255,255,255,.60); font-size:13px; margin-bottom:8px; display:inline-flex; align-items:center; gap:4px;';
      const calIcon = createIcon('calendar', 13);
      calIcon.style.cssText = 'flex-shrink:0;';
      dueEl.appendChild(calIcon);
      dueEl.appendChild(document.createTextNode('Due: ' + nearestDue.toLocaleDateString()));
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
      empty.style.cssText = 'padding:32px 24px; text-align:center;';
      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:12px; color:rgba(255,255,255,.40);';
      iconWrap.appendChild(createIcon('checkCircle', 32));
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:14px; color:rgba(255,255,255,.40);';
      msg.textContent = 'No finalized assignments match the current filters.';
      empty.appendChild(iconWrap);
      empty.appendChild(msg);
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
      syIcon.style.cssText = 'display:inline-flex; align-items:center;';
      syIcon.setAttribute('aria-hidden', 'true');
      syIcon.appendChild(createIcon(syExpanded ? 'folderOpen' : 'folder', 16));
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
          monthIcon.style.cssText = 'display:inline-flex; align-items:center;';
          monthIcon.setAttribute('aria-hidden', 'true');
          monthIcon.appendChild(createIcon(monthExpanded ? 'folderOpen' : 'folder', 16));
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
              weekIcon.style.cssText = 'display:inline-flex; align-items:center;';
              weekIcon.setAttribute('aria-hidden', 'true');
              weekIcon.appendChild(createIcon(weekExpanded ? 'folderOpen' : 'folder', 16));
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
    const stats = getAssignmentStats(assignment, instancesData, submissionsData);
    const score = stats.avgScore;
    const sColor = scoreColor(score);

    const row = document.createElement('div');
    row.className = 'tc-card assignment-card';
    row.dataset.id = assignment.id || '';
    row.style.cssText = 'padding:12px 16px; display:flex; align-items:center; gap:12px; cursor:pointer; margin-bottom:4px;';

    const icon = document.createElement('span');
    icon.style.cssText = 'display:inline-flex; align-items:center; color:rgba(255,255,255,.50);';
    icon.setAttribute('aria-hidden', 'true');
    icon.appendChild(createIcon('fileText', 16));
    row.appendChild(icon);

    const titleSection = document.createElement('div');
    titleSection.style.cssText = 'flex:1; min-width:0; display:flex; align-items:center; gap:6px;';
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
    titleEl.textContent = assignment.title || 'Untitled';
    titleSection.appendChild(titleEl);
    if (assignment.active === false) {
      const archivedBadge = document.createElement('span');
      archivedBadge.style.cssText = 'background:rgba(255,255,255,.08); color:rgba(255,255,255,.40); padding:2px 8px; border-radius:8px; font-size:11px; white-space:nowrap; margin-left:8px;';
      archivedBadge.textContent = 'Archived';
      titleSection.appendChild(archivedBadge);
    }
    const finalizedClassName = inferClassName(assignment);
    if (finalizedClassName) {
      titleSection.appendChild(createClassBadgeSpan(finalizedClassName));
    }
    const finEntryTags = Array.isArray(assignment.tags) ? assignment.tags.filter(Boolean) : [];
    finEntryTags.forEach(tag => {
      const tagPill = document.createElement('span');
      tagPill.style.cssText = 'background:rgba(255,255,255,.08); color:rgba(255,255,255,.50); padding:2px 8px; border-radius:10px; font-size:11px; white-space:nowrap;';
      tagPill.textContent = tag;
      titleSection.appendChild(tagPill);
    });
    row.appendChild(titleSection);

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex; align-items:center; gap:6px; flex-shrink:0;';

    if (assignment.active !== false) {
      const archiveBtn = document.createElement('button');
      archiveBtn.className = 'tc-btn';
      archiveBtn.style.cssText = 'font-size:11px; padding:4px 10px; flex-shrink:0; color:rgba(255,255,255,.50);';
      archiveBtn.appendChild(createIcon('inbox', 12));
      archiveBtn.appendChild(document.createTextNode(' Archive'));
      archiveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await rcConfirm(
          'Archive Assignment',
          'Archive "' + (assignment.title || 'Untitled') + '"?\n\nIt will remain visible in the Finalized section for reference.',
          'Archive'
        );
        if (!confirmed) return;
        const idx = assignmentsData.findIndex(a => a.id === assignment.id);
        const snapshot = idx !== -1 ? { ...assignmentsData[idx] } : null;
        try {
          await db.updateAssignment(assignment.id, { active: false });
          if (idx !== -1) assignmentsData[idx].active = false;
          rebuildLaneCache();
          refreshCurrentTab();
          showToast('Assignment archived');
        } catch (err) {
          console.error('[tc-library] Failed to archive:', err);
          if (idx !== -1 && snapshot) assignmentsData[idx] = snapshot;
          rebuildLaneCache();
          refreshCurrentTab();
          showToast('Failed to archive assignment', '#ef4444', '#fff');
        }
      });
      btnGroup.appendChild(archiveBtn);
    } else {
      const unarchiveBtn = document.createElement('button');
      unarchiveBtn.className = 'tc-btn';
      unarchiveBtn.style.cssText = 'font-size:11px; padding:4px 10px; flex-shrink:0;';
      unarchiveBtn.appendChild(createIcon('inbox', 12));
      unarchiveBtn.appendChild(document.createTextNode(' Unarchive'));
      unarchiveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await rcConfirm(
          'Unarchive Assignment',
          'Restore "' + (assignment.title || 'Untitled') + '" to active status?',
          'Unarchive'
        );
        if (!confirmed) return;
        const idx = assignmentsData.findIndex(a => a.id === assignment.id);
        const snapshot = idx !== -1 ? { ...assignmentsData[idx] } : null;
        try {
          await db.updateAssignment(assignment.id, { active: true });
          if (idx !== -1) assignmentsData[idx].active = true;
          rebuildLaneCache();
          refreshCurrentTab();
          showToast('Assignment unarchived');
        } catch (err) {
          console.error('[tc-library] Failed to unarchive:', err);
          if (idx !== -1 && snapshot) assignmentsData[idx] = snapshot;
          rebuildLaneCache();
          refreshCurrentTab();
          showToast('Failed to unarchive assignment', '#ef4444', '#fff');
        }
      });
      btnGroup.appendChild(unarchiveBtn);
    }

    const reIssueBtn = document.createElement('button');
    reIssueBtn.className = 'tc-btn';
    reIssueBtn.style.cssText = 'font-size:11px; padding:4px 10px; flex-shrink:0;';
    reIssueBtn.appendChild(createIcon('refreshCw', 12));
    reIssueBtn.appendChild(document.createTextNode(' Re-Issue'));
    reIssueBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showReIssueModal(assignment, 'finalized');
    });
    btnGroup.appendChild(reIssueBtn);

    const gbFinalizedBtn = document.createElement('button');
    gbFinalizedBtn.className = 'tc-btn';
    gbFinalizedBtn.style.cssText = 'font-size:11px; padding:4px 10px; flex-shrink:0; color:rgba(255,255,255,.45); border-color:rgba(255,255,255,.10);';
    gbFinalizedBtn.setAttribute('title', 'View in Gradebook');
    gbFinalizedBtn.setAttribute('aria-label', 'View in Gradebook');
    gbFinalizedBtn.appendChild(createIcon('barChart', 12));
    gbFinalizedBtn.appendChild(document.createTextNode(' Gradebook'));
    gbFinalizedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gbUrl = finalizedClassName
        ? '/teacher/gradebook/?class=' + encodeURIComponent(finalizedClassName)
        : '/teacher/gradebook/';
      window.location.href = gbUrl;
    });
    btnGroup.appendChild(gbFinalizedBtn);

    row.appendChild(btnGroup);

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


  // ── Analytics Dashboard ───────────────────────────────────────────────────────

  function renderAnalyticsSection(filtered, upcomingList, currentList, finalizedList) {
    const laneId = 'analytics';
    const expanded = isLaneExpanded(laneId);
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:16px;';
    try {

    // Collapsible header
    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex; align-items:center; gap:10px; padding:10px 16px;',
      'background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10);',
      `border-radius:${expanded ? '10px 10px 0 0' : '10px'}; cursor:pointer; user-select:none;`,
      'transition:background .15s ease;'
    ].join('');
    header.setAttribute('aria-expanded', String(expanded));

    const toggleIcon = document.createElement('span');
    toggleIcon.style.cssText = `font-size:13px; display:inline-block; transform:rotate(${expanded ? '0deg' : '-90deg'}); transition:transform .2s;`;
    toggleIcon.textContent = '\u25be';
    header.appendChild(toggleIcon);

    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'display:inline-flex; align-items:center; gap:6px; font-size:14px; font-weight:600;';
    titleEl.appendChild(createIcon('barChart'));
    titleEl.appendChild(document.createTextNode(' Analytics'));
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
        ['clipboard', 'Upcoming',  upCount,  'rgba(255,255,255,.30)'],
        ['refreshCw', 'Active',    curCount, '#60a5fa'],
        ['checkCircle', 'Finalized', finCount, '#4ade80']
      ];
      const legend = document.createElement('div');
      legend.style.cssText = 'display:flex; flex-direction:column; gap:5px;';
      laneItems.forEach(([iconName, labelText, count, color]) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:12px;';
        const dot = document.createElement('span');
        dot.style.cssText = `width:8px; height:8px; border-radius:50%; background:${color}; flex-shrink:0;`;
        const lbl = document.createElement('span');
        lbl.style.cssText = 'color:rgba(255,255,255,.65); display:inline-flex; align-items:center; gap:4px;';
        const lblIcon = createIcon(iconName, 11);
        lblIcon.style.cssText = 'flex-shrink:0;';
        lbl.appendChild(lblIcon);
        lbl.appendChild(document.createTextNode(labelText));
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
        ['\u226580%',     greenCount,   '#4ade80'],
        ['60\u201379%', amberCount, '#fbbf24'],
        ['<60%',          redCount,     '#f87171'],
        ['No score',      noScoreCount, 'rgba(255,255,255,.30)']
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

      const makeTlLaneLabel = (lane) => {
        const laneMap = {
          upcoming:  { icon: 'clipboard',    text: 'Upcoming' },
          current:   { icon: 'refreshCw',    text: 'Active' },
          finalized: { icon: 'checkCircle',  text: 'Finalized' }
        };
        const def = laneMap[lane] || { icon: 'fileText', text: lane };
        const wrap = document.createElement('span');
        wrap.style.cssText = 'font-size:11px; color:rgba(255,255,255,.45); white-space:nowrap; display:inline-flex; align-items:center; gap:3px;';
        const ic = createIcon(def.icon, 11);
        ic.style.cssText = 'flex-shrink:0;';
        wrap.appendChild(ic);
        wrap.appendChild(document.createTextNode(def.text));
        return wrap;
      };
      recentSorted.forEach((a, i) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; align-items:center; gap:10px; padding:6px 0;' +
          (i < recentSorted.length - 1 ? ' border-bottom:1px solid rgba(255,255,255,.07);' : '');

        const titleSpan = document.createElement('span');
        titleSpan.style.cssText = 'flex:1; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        titleSpan.textContent = a.title || '(Untitled)';
        item.appendChild(titleSpan);

        const itemLane = laneById.get(a.id) || 'upcoming';
        item.appendChild(makeTlLaneLabel(itemLane));

        const dateSpan = document.createElement('span');
        dateSpan.style.cssText = 'font-size:11px; color:rgba(255,255,255,.35); white-space:nowrap;';
        dateSpan.textContent = relDate(a.created_at);
        item.appendChild(dateSpan);

        timelineCard.appendChild(item);
      });
      section.appendChild(timelineCard);
    }

    return section;
    } catch (err) {
      console.error('[tc-library] Error rendering analytics section:', err);
      const errDiv = document.createElement('div');
      errDiv.className = 'tc-card';
      errDiv.style.cssText = 'text-align:center; padding:16px; color:rgba(255,255,255,.5); font-size:13px; margin-bottom:16px;';
      errDiv.textContent = 'Analytics unavailable';
      return errDiv;
    }
  }

  // ── Main Assignments Tab Renderer ─────────────────────────────────────────────

  function renderAssignmentsTab() {
    const container = $("assignmentsTab");
    if (!container) return;
    try {
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
    const makeKpiLabel = (iconName, text) => {
      const span = document.createElement('span');
      span.style.cssText = 'display:inline-flex; align-items:center; gap:6px;';
      span.appendChild(createIcon(iconName, 14));
      span.appendChild(document.createTextNode(text));
      return span;
    };
    kpiGrid.appendChild(renderKPI(makeKpiLabel('clipboard', 'Upcoming'), kpis.upcomingCount));
    kpiGrid.appendChild(renderKPI(makeKpiLabel('refreshCw', 'In Progress'), kpis.currentCount, '#60a5fa'));
    kpiGrid.appendChild(renderKPI(makeKpiLabel('checkCircle', 'Finalized'), kpis.finalizedCount, '#4ade80'));
    const avgColor = kpis.avgScore != null ? scoreColor(kpis.avgScore) : 'rgba(255,255,255,.40)';
    kpiGrid.appendChild(renderKPI(makeKpiLabel('barChart', 'Avg Score'), kpis.avgScore != null ? kpis.avgScore + '%' : null, avgColor));
    container.appendChild(kpiGrid);

    // Pre-compute filtered + lane lists (shared by analytics section and lane rendering)
    const filtered = filterAssignments();
    const upcomingList   = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'upcoming'));
    const currentList    = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'current'));
    const finalizedList  = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'finalized'));

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

    // Sort dropdown
    const sortSelect = document.createElement('select');
    sortSelect.id = 'assignmentSortBy';
    sortSelect.className = 'tc-input';
    sortSelect.style.cssText = 'padding:8px 12px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white;';
    ASSIGNMENT_SORT_OPTIONS.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      sortSelect.appendChild(opt);
    });
    sortSelect.value = filters.assignments.sortBy;
    filterBar.appendChild(sortSelect);

    // Clear filters button — only visible when filters are active
    const hasActiveFilters = Boolean(filters.assignments.searchQuery.trim()) || filters.assignments.typeFilter !== 'All';
    if (hasActiveFilters) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'tc-btn';
      clearBtn.title = 'Clear filters';
      clearBtn.style.opacity = '0.7';
      clearBtn.textContent = '× Clear';
      clearBtn.addEventListener('click', () => {
        filters.assignments.searchQuery = '';
        filters.assignments.typeFilter = 'All';
        saveFilters();
        refreshCurrentTab();
      });
      filterBar.appendChild(clearBtn);
    }

    container.appendChild(filterBar);

    // Filter results live region — screen readers announce filtered count
    const filterStatus = document.createElement('div');
    filterStatus.id = 'tcLibFilterStatus';
    filterStatus.setAttribute('aria-live', 'polite');
    filterStatus.style.cssText = 'font-size:12px; color:rgba(255,255,255,.45); margin-bottom:8px;';
    if (assignmentsData.length > 0) {
      const filtered0 = filterAssignments();
      filterStatus.textContent = filtered0.length === assignmentsData.length
        ? `Showing all ${assignmentsData.length} assignment${assignmentsData.length !== 1 ? 's' : ''}`
        : `Showing ${filtered0.length} of ${assignmentsData.length} assignment${assignmentsData.length !== 1 ? 's' : ''}`;
    }
    container.appendChild(filterStatus);

    // Empty state if no assignments at all
    if (assignmentsData.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'tc-card';
      emptyCard.style.cssText = 'text-align:center; padding:48px 24px;';
      const emptyIconWrap = document.createElement('div');
      emptyIconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:16px; color:rgba(255,255,255,.40);';
      emptyIconWrap.appendChild(createIcon('inbox', 48));
      const emptyTitle = document.createElement('h3');
      emptyTitle.style.cssText = 'margin:0 0 8px 0; font-size:20px;';
      emptyTitle.textContent = 'No assignments yet';
      const emptyMsg = document.createElement('p');
      emptyMsg.style.cssText = 'margin:0; color:rgba(255,255,255,.60);';
      const workLink = document.createElement('a');
      workLink.href = '/teacher/work/';
      workLink.style.cssText = 'color:#60a5fa;';
      workLink.textContent = 'Work \u2192';
      emptyMsg.appendChild(document.createTextNode('Create one in '));
      emptyMsg.appendChild(workLink);
      emptyCard.appendChild(emptyIconWrap);
      emptyCard.appendChild(emptyTitle);
      emptyCard.appendChild(emptyMsg);
      container.appendChild(emptyCard);
    } else {
      container.appendChild(
        renderLaneSection('upcoming', 'clipboard', 'Upcoming', upcomingList.length, (div) => {
          div.appendChild(renderUpcomingLane(upcomingList));
        })
      );
      container.appendChild(
        renderLaneSection('current', 'refreshCw', 'Active', currentList.length, (div) => {
          div.appendChild(renderCurrentLane(currentList));
        })
      );
      container.appendChild(
        renderLaneSection('finalized', 'checkCircle', 'Finalized', finalizedList.length, (div) => {
          div.appendChild(renderFinalizedLane(finalizedList));
        })
      );

      if (filtered.length === 0) {
        const hint = document.createElement('div');
        hint.style.cssText = 'text-align:center; padding:24px; color:rgba(255,255,255,.40); font-size:14px;';
        hint.textContent = 'No assignments match the current filters.';
        container.appendChild(hint);
      }
    }

    updateActiveClassFilter();
    } catch (err) {
      console.error('[tc-library] Error rendering assignments tab:', err);
      container.textContent = '';
      const errorCard = document.createElement('div');
      errorCard.className = 'tc-card';
      errorCard.style.cssText = 'text-align:center; padding:32px 24px; color:rgba(255,255,255,.7);';
      const msg = document.createElement('p');
      msg.textContent = 'Something went wrong rendering this section.';
      errorCard.appendChild(msg);
      const detail = document.createElement('p');
      detail.style.cssText = 'font-size:12px; color:rgba(255,255,255,.4); margin-top:8px;';
      detail.textContent = err.message || 'Unknown error';
      errorCard.appendChild(detail);
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tc-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.style.marginTop = '16px';
      retryBtn.addEventListener('click', () => renderAssignmentsTab());
      errorCard.appendChild(retryBtn);
      container.appendChild(errorCard);
    }
  }

  // ── Sync Status Badge ─────────────────────────────────────────────────────────

  // ── Reserve Tab ──────────────────────────────────────────────────────────────

  /**
   * Renders a single presentation card for the Presentations & Lessons section.
   */
  function renderPresentationCard(presentation, section, unit) {
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'padding:20px;';

    // Header row: title + type badge
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;';
    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'margin:0; font-size:15px; flex:1; line-height:1.3;';
    titleEl.textContent = presentation.title || presentation.name || 'Untitled';
    const typeBadge = document.createElement('span');
    typeBadge.style.cssText = 'background:rgba(168,85,247,.20);color:#c084fc;padding:3px 10px;border-radius:12px;font-size:12px;white-space:nowrap;flex-shrink:0;';
    typeBadge.textContent = 'Presentation';
    headerRow.appendChild(titleEl);
    headerRow.appendChild(typeBadge);
    card.appendChild(headerRow);

    // Context label: section > unit
    const contextEl = document.createElement('div');
    contextEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.50); margin-bottom:14px;';
    const sectionName = section.title || section.name || '';
    const unitName = unit.title || unit.name || '';
    contextEl.textContent = sectionName + (unitName ? ' \u203a ' + unitName : '');
    card.appendChild(contextEl);

    // Button row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:8px;';

    const presTitle = presentation.title || presentation.name || 'Untitled';
    const presUrl = presentation.url || ('/assets/content/lessons/' + (presentation.path || ''));

    // Stage button
    const stageBtn = document.createElement('button');
    stageBtn.className = 'tc-btn';
    stageBtn.title = 'Stage as a draft assignment';
    stageBtn.setAttribute('aria-label', 'Stage ' + presTitle);
    stageBtn.style.cssText = 'flex:1; font-size:13px; display:inline-flex; align-items:center; justify-content:center; gap:6px;';
    stageBtn.appendChild(createIcon('clipboardPlus', 14));
    stageBtn.appendChild(document.createTextNode('Stage'));
    stageBtn.addEventListener('click', () => {
      const newId = genDraftId();
      const newDraft = {
        id: newId,
        title: presTitle,
        className: '',
        batchId: null,
        assignment: {
          kind: 'link',
          text: presUrl,
        },
        createdAt: new Date().toISOString(),
        submittedAt: null,
        issuedAt: null,
        assignmentId: null,
      };
      try {
        const drafts = JSON.parse(localStorage.getItem('rc_tc_work_drafts_v1') || '[]');
        drafts.unshift(newDraft);
        localStorage.setItem('rc_tc_work_drafts_v1', JSON.stringify(drafts));
      } catch (err) {
        console.error('[tc-library] Failed to stage presentation:', err);
        showToast('Could not save draft \u2014 storage may be full.', '#ef4444', '#fff');
        return;
      }
      showToast('\u201c' + presTitle + '\u201d staged as a draft assignment');
      renderReserveTab();
    });
    btnRow.appendChild(stageBtn);

    // Preview button
    const previewBtn = document.createElement('button');
    previewBtn.className = 'tc-btn';
    previewBtn.title = 'Preview this presentation';
    previewBtn.setAttribute('aria-label', 'Preview ' + presTitle);
    previewBtn.style.cssText = 'font-size:13px; display:inline-flex; align-items:center; justify-content:center; gap:6px;';
    previewBtn.appendChild(createIcon('arrowRight', 14));
    previewBtn.appendChild(document.createTextNode('Preview'));
    previewBtn.addEventListener('click', () => {
      window.open(presUrl, '_blank');
    });
    btnRow.appendChild(previewBtn);

    card.appendChild(btnRow);
    return card;
  }

  /**
   * Builds the collapsible "Presentations & Lessons" section for the Reserve tab.
   */
  function renderPresentationsSection() {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top:24px;';

    // ── Section header (toggle) ───────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex; align-items:center; gap:10px;',
      'padding:14px 20px;',
      'background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10);',
      'border-radius:' + (filters.reserve.presentationsExpanded ? '10px 10px 0 0' : '10px') + '; cursor:pointer; user-select:none;',
      'transition:background .15s ease;'
    ].join('');
    header.setAttribute('aria-expanded', String(filters.reserve.presentationsExpanded));

    const chevronWrap = document.createElement('span');
    chevronWrap.style.cssText = 'display:inline-flex; align-items:center; flex-shrink:0;';
    chevronWrap.appendChild(createIcon(
      filters.reserve.presentationsExpanded ? 'chevronDown' : 'chevronRight', 16
    ));

    const headerTitle = document.createElement('span');
    headerTitle.style.cssText = 'font-size:18px; font-weight:600;';
    headerTitle.textContent = 'Presentations & Lessons';

    header.appendChild(chevronWrap);
    header.appendChild(createIcon('bookOpen', 18));
    header.appendChild(headerTitle);
    wrapper.appendChild(header);

    // ── Collapsible content ───────────────────────────────────────────────────
    const content = document.createElement('div');
    content.style.cssText = [
      'padding:16px 20px;',
      'background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.10); border-top:none;',
      'border-radius:0 0 10px 10px;',
      'display:' + (filters.reserve.presentationsExpanded ? 'block' : 'none') + ';'
    ].join('');

    // Search input
    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'margin-bottom:14px;';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search presentations\u2026';
    searchInput.value = filters.reserve.presentationsSearch;
    searchInput.style.cssText = [
      'width:100%; padding:8px 12px; box-sizing:border-box;',
      'background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15);',
      'border-radius:8px; color:white; font-size:13px;'
    ].join('');
    const debouncedPresSearch = debounce(() => { renderPresGrid(); saveFilters(); }, 250);
    searchInput.addEventListener('input', () => {
      filters.reserve.presentationsSearch = searchInput.value;
      debouncedPresSearch();
    });
    searchWrap.appendChild(searchInput);
    content.appendChild(searchWrap);

    // Grid
    const presGrid = document.createElement('div');
    presGrid.className = 'tc-lib-grid';
    content.appendChild(presGrid);

    function renderPresGrid() {
      while (presGrid.firstChild) presGrid.removeChild(presGrid.firstChild);

      if (!lessonsData || !Array.isArray(lessonsData.sections) || lessonsData.sections.length === 0) {
        const noData = document.createElement('div');
        noData.style.cssText = 'padding:24px; text-align:center; color:rgba(255,255,255,.50); grid-column:1/-1;';
        noData.textContent = 'No lessons index available.';
        presGrid.appendChild(noData);
        return;
      }

      const searchQ = (filters.reserve.presentationsSearch || '').toLowerCase();

      // Build flat list of all presentations
      const allPres = [];
      lessonsData.sections.forEach(section => {
        (section.units || []).forEach(unit => {
          (unit.presentations || []).forEach(pres => {
            allPres.push({ presentation: pres, section, unit });
          });
        });
      });

      const filtered = searchQ
        ? allPres.filter(({ presentation }) =>
            (presentation.title || presentation.name || '').toLowerCase().includes(searchQ)
          )
        : allPres;

      if (filtered.length === 0) {
        const noResults = document.createElement('div');
        noResults.style.cssText = 'padding:24px; text-align:center; color:rgba(255,255,255,.50); grid-column:1/-1;';
        noResults.textContent = searchQ ? 'No presentations match your search.' : 'No presentations found.';
        presGrid.appendChild(noResults);
        return;
      }

      filtered.forEach(({ presentation, section, unit }) => {
        presGrid.appendChild(renderPresentationCard(presentation, section, unit));
      });
    }

    renderPresGrid();
    wrapper.appendChild(content);

    // ── Toggle handler ────────────────────────────────────────────────────────
    header.addEventListener('click', () => {
      filters.reserve.presentationsExpanded = !filters.reserve.presentationsExpanded;
      saveFilters();
      header.setAttribute('aria-expanded', String(filters.reserve.presentationsExpanded));
      // Swap chevron icon
      while (chevronWrap.firstChild) chevronWrap.removeChild(chevronWrap.firstChild);
      chevronWrap.appendChild(createIcon(
        filters.reserve.presentationsExpanded ? 'chevronDown' : 'chevronRight', 16
      ));
      // Update header border-radius
      header.style.borderRadius = filters.reserve.presentationsExpanded ? '10px 10px 0 0' : '10px';
      content.style.display = filters.reserve.presentationsExpanded ? 'block' : 'none';
    });

    return wrapper;
  }

  /**
   * Renders the Reserve tab assignments grouped by Section → Unit accordion.
   * Assignments without a unit_id are placed in an "UNCATEGORIZED" bucket at
   * the end. Each section/unit is collapsible via hierarchyExpandState.
   * @param {Array} assignments - Pre-filtered sorted reserve assignments.
   * @returns {HTMLElement}
   */
  function renderReserveByUnit(assignments) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom:24px;';

    if (assignments.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:32px 24px; text-align:center; color:rgba(255,255,255,.50);';
      empty.textContent = 'No reserved assignments';
      wrapper.appendChild(empty);
      return wrapper;
    }

    // Group assignments: section → unit → assignments[]
    // sectionGroups: Map<sectionId, { sectionName, units: Map<unitId, { unitName, items[] }> }>
    const sectionGroups = new Map();
    const uncategorized = [];

    assignments.forEach(a => {
      const uid = a.unit_id;
      if (!uid) {
        uncategorized.push(a);
        return;
      }
      const info = getUnitInfo(uid);
      if (!info) {
        uncategorized.push(a);
        return;
      }
      const { sectionName, sectionId, unitName } = info;
      if (!sectionGroups.has(sectionId)) {
        sectionGroups.set(sectionId, { sectionName, units: new Map() });
      }
      const sg = sectionGroups.get(sectionId);
      if (!sg.units.has(uid)) {
        sg.units.set(uid, { unitName, items: [] });
      }
      sg.units.get(uid).items.push(a);
    });

    // Build sections from lessonsData order (so sections appear in defined order)
    const orderedSectionIds = [];
    if (lessonsData && Array.isArray(lessonsData.sections)) {
      lessonsData.sections.forEach(sec => {
        const sid = sec.name.toLowerCase().replace(/[\s/]+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (sectionGroups.has(sid)) orderedSectionIds.push(sid);
      });
    }
    // Add any section IDs not in lessonsData order
    sectionGroups.forEach((_, sid) => {
      if (!orderedSectionIds.includes(sid)) orderedSectionIds.push(sid);
    });

    const renderSectionAccordion = (sectionId, sectionData) => {
      const secExpanded = isHierarchyExpanded('reserve-section-' + sectionId, true);
      const secWrapper = document.createElement('div');
      secWrapper.style.cssText = 'margin-bottom:16px;';

      const secHeader = document.createElement('div');
      secHeader.style.cssText = [
        'display:flex; align-items:center; gap:10px;',
        'padding:12px 16px;',
        'background:rgba(255,255,255,.06);',
        'border:1px solid rgba(255,255,255,.12);',
        'border-radius:' + (secExpanded ? '10px 10px 0 0' : '10px') + ';',
        'cursor:pointer; user-select:none;'
      ].join('');
      secHeader.setAttribute('aria-expanded', String(secExpanded));

      const secToggleIcon = document.createElement('span');
      secToggleIcon.style.cssText = 'font-size:13px; transition:transform .2s ease; display:inline-block; transform:rotate(' + (secExpanded ? '0deg' : '-90deg') + ');';
      secToggleIcon.textContent = '\u25be';

      const secTitle = document.createElement('span');
      secTitle.style.cssText = 'font-size:15px; font-weight:700; letter-spacing:.03em;';
      secTitle.textContent = sectionData.sectionName;

      const totalCount = [...sectionData.units.values()].reduce((n, u) => n + u.items.length, 0);
      const secBadge = document.createElement('span');
      secBadge.style.cssText = 'background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:12px; padding:2px 9px; font-size:12px;';
      secBadge.textContent = totalCount;

      secHeader.appendChild(secToggleIcon);
      secHeader.appendChild(createIcon('folder', 14));
      secHeader.appendChild(secTitle);
      secHeader.appendChild(secBadge);

      const secContent = document.createElement('div');
      secContent.style.cssText = [
        'display:' + (secExpanded ? 'block' : 'none') + ';',
        'border:1px solid rgba(255,255,255,.12); border-top:none;',
        'border-radius:0 0 10px 10px; padding:12px;',
        'background:rgba(255,255,255,.02);'
      ].join('');

      if (secExpanded) {
        // Build unit order from lessonsData
        const orderedUnitIds = [];
        if (lessonsData && Array.isArray(lessonsData.sections)) {
          lessonsData.sections.forEach(sec => {
            const sid = sec.name.toLowerCase().replace(/[\s/]+/g, '-').replace(/[^a-z0-9-]/g, '');
            if (sid === sectionId) {
              (sec.units || []).forEach(u => {
                if (sectionData.units.has(u.id)) orderedUnitIds.push(u.id);
              });
            }
          });
        }
        sectionData.units.forEach((_, uid) => {
          if (!orderedUnitIds.includes(uid)) orderedUnitIds.push(uid);
        });

        orderedUnitIds.forEach(uid => {
          const unitData = sectionData.units.get(uid);
          const unitExpanded = isHierarchyExpanded('reserve-unit-' + uid, true);

          const unitWrapper = document.createElement('div');
          unitWrapper.style.cssText = 'margin-bottom:10px;';

          const unitHeader = document.createElement('div');
          unitHeader.style.cssText = [
            'display:flex; align-items:center; gap:8px; padding:8px 12px;',
            'background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);',
            'border-radius:' + (unitExpanded ? '8px 8px 0 0' : '8px') + ';',
            'cursor:pointer; user-select:none;'
          ].join('');
          unitHeader.setAttribute('aria-expanded', String(unitExpanded));

          const unitToggle = document.createElement('span');
          unitToggle.style.cssText = 'font-size:12px; transition:transform .2s; display:inline-block; transform:rotate(' + (unitExpanded ? '0deg' : '-90deg') + ');';
          unitToggle.textContent = '\u25be';

          const unitTitle = document.createElement('span');
          unitTitle.style.cssText = 'font-size:14px; font-weight:600;';
          unitTitle.textContent = unitData.unitName;

          const unitBadge = document.createElement('span');
          unitBadge.style.cssText = 'background:rgba(96,165,250,.15); border:1px solid rgba(96,165,250,.25); border-radius:10px; padding:1px 8px; font-size:12px; color:#93c5fd;';
          unitBadge.textContent = unitData.items.length + ' assignment' + (unitData.items.length !== 1 ? 's' : '');

          unitHeader.appendChild(unitToggle);
          unitHeader.appendChild(createIcon('clipboard', 13));
          unitHeader.appendChild(unitTitle);
          unitHeader.appendChild(unitBadge);

          const unitContent = document.createElement('div');
          unitContent.style.cssText = [
            'display:' + (unitExpanded ? 'block' : 'none') + ';',
            'border:1px solid rgba(255,255,255,.08); border-top:none;',
            'border-radius:0 0 8px 8px; padding:10px;',
            'background:rgba(0,0,0,.1);'
          ].join('');

          if (unitExpanded) {
            const unitGrid = document.createElement('div');
            unitGrid.className = 'tc-lib-grid';
            unitData.items.forEach(a => unitGrid.appendChild(renderUpcomingCard(a)));
            unitContent.appendChild(unitGrid);
          }

          unitHeader.addEventListener('click', () => {
            hierarchyExpandState.set('reserve-unit-' + uid, !unitExpanded);
            saveFilters();
            renderReserveTab();
          });

          unitWrapper.appendChild(unitHeader);
          unitWrapper.appendChild(unitContent);
          secContent.appendChild(unitWrapper);
        });
      }

      secHeader.addEventListener('click', () => {
        hierarchyExpandState.set('reserve-section-' + sectionId, !secExpanded);
        saveFilters();
        renderReserveTab();
      });

      secWrapper.appendChild(secHeader);
      secWrapper.appendChild(secContent);
      return secWrapper;
    };

    orderedSectionIds.forEach(sid => {
      wrapper.appendChild(renderSectionAccordion(sid, sectionGroups.get(sid)));
    });

    // Uncategorized section
    const uncatExpanded = isHierarchyExpanded('reserve-section-uncategorized', true);
    const uncatWrapper = document.createElement('div');
    uncatWrapper.style.cssText = 'margin-bottom:16px;';

    const uncatHeader = document.createElement('div');
    uncatHeader.style.cssText = [
      'display:flex; align-items:center; gap:10px; padding:12px 16px;',
      'background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12);',
      'border-radius:' + (uncatExpanded ? '10px 10px 0 0' : '10px') + ';',
      'cursor:pointer; user-select:none;'
    ].join('');
    uncatHeader.setAttribute('aria-expanded', String(uncatExpanded));

    const uncatToggle = document.createElement('span');
    uncatToggle.style.cssText = 'font-size:13px; transition:transform .2s; display:inline-block; transform:rotate(' + (uncatExpanded ? '0deg' : '-90deg') + ');';
    uncatToggle.textContent = '\u25be';

    const uncatTitle = document.createElement('span');
    uncatTitle.style.cssText = 'font-size:15px; font-weight:700; letter-spacing:.03em; color:rgba(255,255,255,.65);';
    uncatTitle.textContent = 'UNCATEGORIZED';

    const uncatBadge = document.createElement('span');
    uncatBadge.style.cssText = 'background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:12px; padding:2px 9px; font-size:12px;';
    uncatBadge.textContent = uncategorized.length;

    uncatHeader.appendChild(uncatToggle);
    uncatHeader.appendChild(createIcon('clipboard', 14));
    uncatHeader.appendChild(uncatTitle);
    uncatHeader.appendChild(uncatBadge);

    if (uncategorized.length > 0) {
      const uncatWizBtn = document.createElement('button');
      uncatWizBtn.className = 'tc-btn';
      uncatWizBtn.style.cssText = 'font-size:11px; padding:3px 9px; margin-left:auto;';
      uncatWizBtn.setAttribute('aria-label', 'Open Catalog Wizard for uncategorized assignments');
      uncatWizBtn.textContent = '📋 Catalog Wizard';
      uncatWizBtn.addEventListener('click', (e) => { e.stopPropagation(); openCatalogWizard(); });
      uncatHeader.appendChild(uncatWizBtn);
    }

    const uncatContent = document.createElement('div');
    uncatContent.style.cssText = [
      'display:' + (uncatExpanded ? 'block' : 'none') + ';',
      'border:1px solid rgba(255,255,255,.12); border-top:none;',
      'border-radius:0 0 10px 10px; padding:12px;',
      'background:rgba(255,255,255,.02);'
    ].join('');

    if (uncatExpanded && uncategorized.length > 0) {
      const uncatGrid = document.createElement('div');
      uncatGrid.className = 'tc-lib-grid';
      uncategorized.forEach(a => uncatGrid.appendChild(renderUpcomingCard(a)));
      uncatContent.appendChild(uncatGrid);
    } else if (uncatExpanded) {
      const none = document.createElement('div');
      none.style.cssText = 'padding:16px; text-align:center; color:rgba(255,255,255,.40); font-size:13px;';
      none.textContent = 'All assignments are cataloged.';
      uncatContent.appendChild(none);
    }

    uncatHeader.addEventListener('click', () => {
      hierarchyExpandState.set('reserve-section-uncategorized', !uncatExpanded);
      saveFilters();
      renderReserveTab();
    });

    uncatWrapper.appendChild(uncatHeader);
    uncatWrapper.appendChild(uncatContent);
    wrapper.appendChild(uncatWrapper);

    return wrapper;
  }

  function renderReserveTab() {
    const container = $('reserveTab');
    if (!container) return;
    try {
      container.innerHTML = '';

      const filtered = filterAssignments();
      let reserveList = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'upcoming'));

      // Apply tag filter
      if (filters.reserve.selectedTags.length > 0) {
        reserveList = reserveList.filter(a => {
          const aTags = Array.isArray(a.tags) ? a.tags : [];
          return filters.reserve.selectedTags.some(t => aTags.includes(t));
        });
      }

      // ── Primary filter bar (always visible) ──────────────────────────────
      const filterBar = document.createElement('div');
      filterBar.style.cssText = 'margin-bottom:8px; display:flex; flex-wrap:wrap; gap:12px; align-items:center;';

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

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.id = 'assignmentSearch';
      searchInput.placeholder = 'Search assignments...';
      searchInput.value = filters.assignments.searchQuery;
      searchInput.style.cssText = 'flex:1; min-width:180px; padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white;';
      filterBar.appendChild(searchInput);

      // Count active secondary filters for badge
      const reserveSecondaryCount = (filters.assignments.typeFilter !== 'All' ? 1 : 0)
        + (filters.assignments.sortBy !== 'newest' ? 1 : 0)
        + (filters.reserve.selectedTags.length > 0 ? 1 : 0)
        + (filters.reserve.viewMode !== 'flat' ? 1 : 0);

      // More Filters toggle
      const moreFiltersBtn = document.createElement('button');
      moreFiltersBtn.className = 'tc-btn' + (reserveSecondaryCount > 0 ? ' active' : '');
      moreFiltersBtn.setAttribute('aria-expanded', filters.reserve.filtersExpanded ? 'true' : 'false');
      moreFiltersBtn.setAttribute('aria-controls', 'reserveSecondaryFilters');
      moreFiltersBtn.setAttribute('aria-label', reserveSecondaryCount > 0 ? `Filters (${reserveSecondaryCount} active)` : 'Filters');
      moreFiltersBtn.style.cssText = 'white-space:nowrap; display:inline-flex; align-items:center; gap:5px;';
      moreFiltersBtn.appendChild(createIcon('filter', 14));
      moreFiltersBtn.appendChild(document.createTextNode(reserveSecondaryCount > 0 ? ` Filters (${reserveSecondaryCount})` : ' Filters'));
      moreFiltersBtn.addEventListener('click', () => {
        filters.reserve.filtersExpanded = !filters.reserve.filtersExpanded;
        saveFilters();
        renderReserveTab();
      });
      filterBar.appendChild(moreFiltersBtn);
      container.appendChild(filterBar);

      // ── Secondary filter section (collapsible) ────────────────────────────
      const reserveFiltersExpanded = filters.reserve.filtersExpanded || window.innerWidth > 1200;
      const secondaryFilters = document.createElement('div');
      secondaryFilters.id = 'reserveSecondaryFilters';
      secondaryFilters.style.cssText = 'display:' + (reserveFiltersExpanded ? 'flex' : 'none') + '; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px;';

      const typeFilter = document.createElement('select');
      typeFilter.id = 'assignmentTypeFilter';
      typeFilter.style.cssText = 'padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white;';
      ASSIGNMENT_TYPE_OPTIONS.forEach(([val, label]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        typeFilter.appendChild(opt);
      });
      typeFilter.value = filters.assignments.typeFilter;
      secondaryFilters.appendChild(typeFilter);

      const sortSelect = document.createElement('select');
      sortSelect.id = 'assignmentSortBy';
      sortSelect.style.cssText = 'padding:8px 12px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white;';
      ASSIGNMENT_SORT_OPTIONS.forEach(([val, label]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        sortSelect.appendChild(opt);
      });
      sortSelect.value = filters.assignments.sortBy;
      secondaryFilters.appendChild(sortSelect);

      // View mode toggle (secondary)
      const viewToggleWrap = document.createElement('div');
      viewToggleWrap.style.cssText = 'display:inline-flex; border:1px solid rgba(255,255,255,.15); border-radius:8px; overflow:hidden;';
      const flatViewBtn = document.createElement('button');
      flatViewBtn.className = 'tc-btn';
      flatViewBtn.setAttribute('aria-pressed', filters.reserve.viewMode === 'flat' ? 'true' : 'false');
      flatViewBtn.style.cssText = 'border-radius:0; border:none; gap:6px; padding:7px 12px;'
        + (filters.reserve.viewMode === 'flat' ? 'background:rgba(96,165,250,.18);' : '');
      flatViewBtn.appendChild(createIcon('clipboard', 14));
      flatViewBtn.appendChild(document.createTextNode(' Flat List'));
      flatViewBtn.addEventListener('click', () => {
        if (filters.reserve.viewMode !== 'flat') {
          filters.reserve.viewMode = 'flat';
          saveFilters();
          renderReserveTab();
        }
      });
      const byUnitViewBtn = document.createElement('button');
      byUnitViewBtn.className = 'tc-btn';
      byUnitViewBtn.setAttribute('aria-pressed', filters.reserve.viewMode === 'byUnit' ? 'true' : 'false');
      byUnitViewBtn.style.cssText = 'border-radius:0; border:none; gap:6px; padding:7px 12px;'
        + (filters.reserve.viewMode === 'byUnit' ? 'background:rgba(96,165,250,.18);' : '');
      byUnitViewBtn.appendChild(createIcon('folderOpen', 14));
      byUnitViewBtn.appendChild(document.createTextNode(' By Unit'));
      byUnitViewBtn.addEventListener('click', () => {
        if (filters.reserve.viewMode !== 'byUnit') {
          filters.reserve.viewMode = 'byUnit';
          saveFilters();
          renderReserveTab();
        }
      });
      viewToggleWrap.appendChild(flatViewBtn);
      viewToggleWrap.appendChild(byUnitViewBtn);
      secondaryFilters.appendChild(viewToggleWrap);

      // Tag filter chips (secondary)
      const allReserveForTags = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'upcoming'));
      const reserveTagSet = new Set();
      allReserveForTags.forEach(a => { (Array.isArray(a.tags) ? a.tags : []).forEach(t => { if (t) reserveTagSet.add(t); }); });
      if (reserveTagSet.size > 0) {
        const allTagsBtn = document.createElement('button');
        allTagsBtn.className = 'tc-btn' + (filters.reserve.selectedTags.length === 0 ? ' active' : '');
        allTagsBtn.style.cssText = 'font-size:12px; padding:3px 10px; border-radius:10px;';
        allTagsBtn.textContent = 'All Tags';
        allTagsBtn.addEventListener('click', () => {
          filters.reserve.selectedTags = [];
          saveFilters();
          renderReserveTab();
        });
        secondaryFilters.appendChild(allTagsBtn);
        [...reserveTagSet].sort().forEach(tag => {
          const tagBtn = document.createElement('button');
          const isActive = filters.reserve.selectedTags.includes(tag);
          tagBtn.className = 'tc-btn' + (isActive ? ' active' : '');
          tagBtn.style.cssText = 'font-size:12px; padding:3px 10px; border-radius:10px;';
          tagBtn.textContent = tag;
          tagBtn.addEventListener('click', () => {
            const idx = filters.reserve.selectedTags.indexOf(tag);
            if (idx === -1) {
              filters.reserve.selectedTags = [...filters.reserve.selectedTags, tag];
            } else {
              filters.reserve.selectedTags = filters.reserve.selectedTags.filter(t => t !== tag);
            }
            saveFilters();
            renderReserveTab();
          });
          secondaryFilters.appendChild(tagBtn);
        });
      }

      const hasActiveFilters = Boolean(filters.assignments.searchQuery.trim()) || filters.assignments.typeFilter !== 'All';
      if (hasActiveFilters) {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'tc-btn';
        clearBtn.title = 'Clear filters';
        clearBtn.style.opacity = '0.7';
        clearBtn.textContent = '\u00d7 Clear';
        clearBtn.addEventListener('click', () => {
          filters.assignments.searchQuery = '';
          filters.assignments.typeFilter = 'All';
          globalSearchQuery = '';
          saveFilters();
          renderReserveTab();
        });
        secondaryFilters.appendChild(clearBtn);
      }
      container.appendChild(secondaryFilters);

      // ── Always-visible action row (uncategorized badge + catalog wizard) ──
      const viewToggleRow = document.createElement('div');
      viewToggleRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:14px;';

      // Uncategorized badge
      const allReserveItems = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'upcoming'));
      const uncatCount = allReserveItems.filter(a => !a.unit_id).length;
      if (uncatCount > 0) {
        const uncatBadgeEl = document.createElement('span');
        uncatBadgeEl.style.cssText = 'font-size:12px; padding:3px 10px; border-radius:12px; background:rgba(245,158,11,.2); border:1px solid rgba(245,158,11,.35); color:#fcd34d; cursor:pointer; user-select:none;';
        uncatBadgeEl.title = 'Click to view uncategorized in By Unit mode';
        uncatBadgeEl.textContent = '📚 ' + uncatCount + ' uncategorized';
        uncatBadgeEl.addEventListener('click', () => {
          filters.reserve.viewMode = 'byUnit';
          saveFilters();
          renderReserveTab();
        });
        viewToggleRow.appendChild(uncatBadgeEl);
      }

      // Catalog Wizard button (always visible)
      const wizardBtn = document.createElement('button');
      wizardBtn.className = 'tc-btn';
      wizardBtn.setAttribute('aria-label', 'Open Catalog Wizard');
      wizardBtn.style.cssText = 'font-size:12px; padding:5px 12px; margin-left:auto;';
      wizardBtn.textContent = '📋 Catalog Wizard';
      wizardBtn.addEventListener('click', () => openCatalogWizard());
      viewToggleRow.appendChild(wizardBtn);

      container.appendChild(viewToggleRow);

      // Count label
      const countEl = document.createElement('div');
      countEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.45); margin-bottom:12px;';
      countEl.textContent = reserveList.length === 0 ? 'No reserved assignments' :
        `${reserveList.length} assignment${reserveList.length !== 1 ? 's' : ''} in reserve`;
      container.appendChild(countEl);

      if (filters.reserve.viewMode === 'byUnit') {
        container.appendChild(renderReserveByUnit(reserveList));
      } else {
        container.appendChild(
          renderLaneSection('upcoming', 'clipboard', 'Reserve', reserveList.length, (div) => {
            div.appendChild(renderUpcomingLane(reserveList));
          })
        );
      }

      // Presentations & Lessons collapsible section
      container.appendChild(renderPresentationsSection());

      updateActiveClassFilter();
    } catch (err) {
      console.error('[tc-library] Error rendering Reserve tab:', err);
      container.innerHTML = '';
      const errCard = document.createElement('div');
      errCard.className = 'tc-card';
      errCard.style.cssText = 'padding:32px; text-align:center; color:rgba(255,255,255,.7);';
      const p = document.createElement('p');
      p.textContent = 'Something went wrong rendering this section.';
      errCard.appendChild(p);
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tc-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.style.marginTop = '16px';
      retryBtn.addEventListener('click', () => renderReserveTab());
      errCard.appendChild(retryBtn);
      container.appendChild(errCard);
    }
  }

  // ── Active Tab ────────────────────────────────────────────────────────────────

  /**
   * Opens the Missing Work Report modal — student-centric view of incomplete
   * assignments across all active assignments × class enrollments.
   */
  function renderMissingWorkModal() {
    const triggerEl = document.activeElement;

    const overlay = document.createElement('div');
    overlay.id = 'missingWorkOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'missingWorkTitle');
    overlay.style.cssText = [
      'position:fixed; top:0; left:0; right:0; bottom:0;',
      'background:rgba(0,0,0,.80); backdrop-filter:blur(4px);',
      'display:flex; align-items:center; justify-content:center;',
      'z-index:10000; padding:24px;'
    ].join('');

    function closeModal() {
      overlay.remove();
      document.removeEventListener('keydown', onMissingWorkKeyDown);
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
    }

    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width:900px; width:100%; max-height:90vh; overflow-y:auto; padding:32px;';

    // Header row
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;';

    const titleEl = document.createElement('h2');
    titleEl.id = 'missingWorkTitle';
    titleEl.style.cssText = 'margin:0; font-size:22px; display:flex; align-items:center; gap:10px;';
    const titleIcon = document.createElement('span');
    titleIcon.style.cssText = 'color:#f59e0b; display:inline-flex; align-items:center;';
    titleIcon.appendChild(createIcon('alertTriangle', 20));
    titleEl.appendChild(titleIcon);
    titleEl.appendChild(document.createTextNode(' Missing Work Report'));

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tc-btn';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.style.cssText = 'padding:8px 16px; flex-shrink:0;';
    closeBtn.appendChild(createIcon('x', 14));
    closeBtn.appendChild(document.createTextNode(' Close'));

    headerRow.appendChild(titleEl);
    headerRow.appendChild(closeBtn);
    card.appendChild(headerRow);

    // No enrollment data
    if (classEnrollmentsData.length === 0) {
      const info = document.createElement('div');
      info.style.cssText = 'padding:32px 24px; text-align:center; color:rgba(255,255,255,.55); font-size:14px;';
      info.textContent = 'No class enrollment data available. Enrollment data is needed to detect missing work.';
      card.appendChild(info);
    } else {
      const missingWork = computeMissingWork();

      if (missingWork.length === 0) {
        // All caught up
        const successWrap = document.createElement('div');
        successWrap.style.cssText = 'padding:48px 24px; text-align:center;';
        const iconWrap = document.createElement('div');
        iconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:12px; color:#4ade80;';
        iconWrap.appendChild(createIcon('checkCircle', 40));
        successWrap.appendChild(iconWrap);
        const successMsg = document.createElement('div');
        successMsg.style.cssText = 'font-size:18px; color:rgba(255,255,255,.80);';
        successMsg.textContent = 'All students are up to date!';
        successWrap.appendChild(successMsg);
        card.appendChild(successWrap);
      } else {
        // Summary banner
        const uniqueAssignments = new Set();
        missingWork.forEach(s => s.missingAssignments.forEach(a => uniqueAssignments.add(a.id)));
        const summary = document.createElement('div');
        summary.style.cssText = [
          'background:rgba(245,158,11,.10); border:1px solid rgba(245,158,11,.25);',
          'border-radius:8px; padding:12px 16px; margin-bottom:20px; font-size:14px;',
          'display:flex; align-items:center; gap:8px; color:#f59e0b;'
        ].join('');
        const summaryIcon = document.createElement('span');
        summaryIcon.style.cssText = 'flex-shrink:0; display:inline-flex;';
        summaryIcon.appendChild(createIcon('alertTriangle', 16));
        summary.appendChild(summaryIcon);
        const summaryText = document.createElement('span');
        summaryText.textContent = missingWork.length + ' student' + (missingWork.length !== 1 ? 's' : '') +
          ' have missing work across ' + uniqueAssignments.size + ' assignment' + (uniqueAssignments.size !== 1 ? 's' : '');
        summary.appendChild(summaryText);
        card.appendChild(summary);

        // Group by class
        const classMissingMap = new Map();
        missingWork.forEach(s => {
          if (!classMissingMap.has(s.className)) classMissingMap.set(s.className, []);
          classMissingMap.get(s.className).push(s);
        });

        const sortedClasses = [...classMissingMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

        sortedClasses.forEach(([className, students]) => {
          const classId = 'missing-class-' + className.replace(/[^a-zA-Z0-9]/g, '_');
          const defaultExpanded = isHierarchyExpanded(classId, true);

          const sectionWrapper = document.createElement('div');
          sectionWrapper.style.cssText = 'margin-bottom:8px;';

          const sectionHeader = document.createElement('div');
          sectionHeader.style.cssText = [
            'display:flex; align-items:center; gap:8px;',
            'padding:8px 12px;',
            'background:rgba(255,255,255,.04);',
            'border:1px solid rgba(255,255,255,.07);',
            'border-radius:6px; cursor:pointer; user-select:none;',
            'margin-bottom:' + (defaultExpanded ? '4px' : '0') + ';'
          ].join('');

          const toggleArrow = document.createElement('span');
          toggleArrow.style.cssText = 'font-size:11px; transition:transform .2s; display:inline-block; transform:rotate(' + (defaultExpanded ? '0deg' : '-90deg') + ');';
          toggleArrow.textContent = '\u25be';

          const sectionTitle = document.createElement('span');
          sectionTitle.style.cssText = 'font-size:14px; font-weight:600; flex:1;';
          sectionTitle.textContent = className;

          const sectionBadge = document.createElement('span');
          sectionBadge.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40);';
          sectionBadge.textContent = students.length + ' student' + (students.length !== 1 ? 's' : '');

          sectionHeader.appendChild(toggleArrow);
          sectionHeader.appendChild(sectionTitle);
          sectionHeader.appendChild(sectionBadge);

          const sectionContent = document.createElement('div');
          sectionContent.style.cssText = 'display:' + (defaultExpanded ? 'block' : 'none') + '; padding-left:8px;';

          // Build table content
          const table = document.createElement('table');
          table.style.cssText = 'width:100%; border-collapse:collapse; font-size:13px;';

          const thead = document.createElement('thead');
          const theadRow = document.createElement('tr');
          ['Student', '# Missing', 'Missing Assignments'].forEach(colLabel => {
            const th = document.createElement('th');
            th.style.cssText = 'text-align:left; padding:6px 12px; color:rgba(255,255,255,.50); font-size:12px; border-bottom:1px solid rgba(255,255,255,.07); font-weight:500;';
            th.textContent = colLabel;
            theadRow.appendChild(th);
          });
          thead.appendChild(theadRow);
          table.appendChild(thead);

          const tbody = document.createElement('tbody');
          const sortedStudents = [...students].sort((a, b) => b.missingAssignments.length - a.missingAssignments.length);
          sortedStudents.forEach((s, idx) => {
            const isWarning = s.missingAssignments.length >= 3;
            const tr = document.createElement('tr');
            tr.style.cssText = (isWarning
              ? 'background:rgba(245,158,11,.10);'
              : (idx % 2 === 1 ? 'background:rgba(255,255,255,.02);' : '')) +
              'border-bottom:1px solid rgba(255,255,255,.04);';

            const tdName = document.createElement('td');
            tdName.style.cssText = 'padding:8px 12px; font-weight:500;';
            tdName.textContent = s.studentName;

            const tdCount = document.createElement('td');
            tdCount.style.cssText = 'padding:8px 12px; white-space:nowrap;';
            const countSpan = document.createElement('span');
            countSpan.style.cssText = 'font-weight:700; color:' + (isWarning ? '#f59e0b' : '#f87171') + ';';
            countSpan.textContent = String(s.missingAssignments.length);
            tdCount.appendChild(countSpan);

            const tdTitles = document.createElement('td');
            tdTitles.style.cssText = 'padding:8px 12px;';
            const titlesWrap = document.createElement('div');
            titlesWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px;';
            s.missingAssignments.forEach(a => {
              const pill = document.createElement('span');
              pill.style.cssText = 'background:rgba(248,113,113,.12); color:#f87171; padding:2px 8px; border-radius:12px; font-size:11px;';
              pill.textContent = a.title || 'Untitled';
              titlesWrap.appendChild(pill);
            });
            tdTitles.appendChild(titlesWrap);

            tr.appendChild(tdName);
            tr.appendChild(tdCount);
            tr.appendChild(tdTitles);
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          sectionContent.appendChild(table);

          // Toggle handler — manipulates DOM directly (no full tab re-render)
          sectionHeader.addEventListener('click', () => {
            const isExpanded = sectionContent.style.display !== 'none';
            const nowExpanded = !isExpanded;
            hierarchyExpandState.set(classId, nowExpanded);
            saveFilters();
            sectionContent.style.display = nowExpanded ? 'block' : 'none';
            toggleArrow.style.transform = 'rotate(' + (nowExpanded ? '0deg' : '-90deg') + ')';
            sectionHeader.style.marginBottom = nowExpanded ? '4px' : '0';
          });

          sectionWrapper.appendChild(sectionHeader);
          sectionWrapper.appendChild(sectionContent);
          card.appendChild(sectionWrapper);
        });
      }
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    closeBtn.focus();

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    function onMissingWorkKeyDown(e) {
      if (e.key === 'Escape') {
        closeModal();
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
    }
    document.addEventListener('keydown', onMissingWorkKeyDown);
  }

  /**
   * Renders active assignments grouped by Section → Unit, matching the pattern
   * of renderReserveByUnit(). Uses renderActiveCard() for each card.
   * @param {Array} assignments - Pre-filtered sorted active assignments.
   * @returns {HTMLElement}
   */
  function renderActiveByUnit(assignments) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom:24px;';

    if (assignments.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:32px 24px; text-align:center; color:rgba(255,255,255,.50);';
      empty.textContent = 'No active assignments';
      wrapper.appendChild(empty);
      return wrapper;
    }

    // Group assignments: section → unit → assignments[]
    const sectionGroups = new Map();
    const uncategorized = [];

    assignments.forEach(a => {
      const uid = a.unit_id;
      if (!uid) { uncategorized.push(a); return; }
      const info = getUnitInfo(uid);
      if (!info) { uncategorized.push(a); return; }
      const { sectionName, sectionId, unitName } = info;
      if (!sectionGroups.has(sectionId)) {
        sectionGroups.set(sectionId, { sectionName, units: new Map() });
      }
      const sg = sectionGroups.get(sectionId);
      if (!sg.units.has(uid)) sg.units.set(uid, { unitName, items: [] });
      sg.units.get(uid).items.push(a);
    });

    // Build ordered section list from lessonsData
    const orderedSectionIds = [];
    if (lessonsData && Array.isArray(lessonsData.sections)) {
      lessonsData.sections.forEach(sec => {
        const sid = sec.name.toLowerCase().replace(/[\s/]+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (sectionGroups.has(sid)) orderedSectionIds.push(sid);
      });
    }
    sectionGroups.forEach((_, sid) => {
      if (!orderedSectionIds.includes(sid)) orderedSectionIds.push(sid);
    });

    const renderActiveSectionAccordion = (sectionId, sectionData) => {
      const secExpanded = isHierarchyExpanded('active-section-' + sectionId, true);
      const secWrapper = document.createElement('div');
      secWrapper.style.cssText = 'margin-bottom:16px;';

      const secHeader = document.createElement('div');
      secHeader.style.cssText = [
        'display:flex; align-items:center; gap:10px;',
        'padding:12px 16px;',
        'background:rgba(255,255,255,.06);',
        'border:1px solid rgba(255,255,255,.12);',
        'border-radius:' + (secExpanded ? '10px 10px 0 0' : '10px') + ';',
        'cursor:pointer; user-select:none;'
      ].join('');
      secHeader.setAttribute('aria-expanded', String(secExpanded));

      const secToggleIcon = document.createElement('span');
      secToggleIcon.style.cssText = 'font-size:13px; transition:transform .2s ease; display:inline-block; transform:rotate(' + (secExpanded ? '0deg' : '-90deg') + ');';
      secToggleIcon.textContent = '\u25be';

      const secTitle = document.createElement('span');
      secTitle.style.cssText = 'font-size:15px; font-weight:700; letter-spacing:.03em;';
      secTitle.textContent = sectionData.sectionName;

      const totalCount = [...sectionData.units.values()].reduce((n, u) => n + u.items.length, 0);
      const secBadge = document.createElement('span');
      secBadge.style.cssText = 'background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:12px; padding:2px 9px; font-size:12px;';
      secBadge.textContent = totalCount + ' active';

      secHeader.appendChild(secToggleIcon);
      secHeader.appendChild(createIcon('folder', 14));
      secHeader.appendChild(secTitle);
      secHeader.appendChild(secBadge);

      const secContent = document.createElement('div');
      secContent.style.cssText = [
        'display:' + (secExpanded ? 'block' : 'none') + ';',
        'border:1px solid rgba(255,255,255,.12); border-top:none;',
        'border-radius:0 0 10px 10px; padding:12px;',
        'background:rgba(255,255,255,.02);'
      ].join('');

      if (secExpanded) {
        const orderedUnitIds = [];
        if (lessonsData && Array.isArray(lessonsData.sections)) {
          lessonsData.sections.forEach(sec => {
            const sid = sec.name.toLowerCase().replace(/[\s/]+/g, '-').replace(/[^a-z0-9-]/g, '');
            if (sid === sectionId) {
              (sec.units || []).forEach(u => {
                if (sectionData.units.has(u.id)) orderedUnitIds.push(u.id);
              });
            }
          });
        }
        sectionData.units.forEach((_, uid) => {
          if (!orderedUnitIds.includes(uid)) orderedUnitIds.push(uid);
        });

        orderedUnitIds.forEach(uid => {
          const unitData = sectionData.units.get(uid);
          const unitExpanded = isHierarchyExpanded('active-unit-' + uid, true);

          const unitWrapper = document.createElement('div');
          unitWrapper.style.cssText = 'margin-bottom:10px;';

          const unitHeader = document.createElement('div');
          unitHeader.style.cssText = [
            'display:flex; align-items:center; gap:8px; padding:8px 12px;',
            'background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);',
            'border-radius:' + (unitExpanded ? '8px 8px 0 0' : '8px') + ';',
            'cursor:pointer; user-select:none;'
          ].join('');
          unitHeader.setAttribute('aria-expanded', String(unitExpanded));

          const unitToggle = document.createElement('span');
          unitToggle.style.cssText = 'font-size:12px; transition:transform .2s; display:inline-block; transform:rotate(' + (unitExpanded ? '0deg' : '-90deg') + ');';
          unitToggle.textContent = '\u25be';

          const unitTitle = document.createElement('span');
          unitTitle.style.cssText = 'font-size:14px; font-weight:600;';
          unitTitle.textContent = unitData.unitName;

          const unitBadge = document.createElement('span');
          unitBadge.style.cssText = 'background:rgba(52,211,153,.12); border:1px solid rgba(52,211,153,.22); border-radius:10px; padding:1px 8px; font-size:12px; color:#34d399;';
          unitBadge.textContent = unitData.items.length + ' active';

          unitHeader.appendChild(unitToggle);
          unitHeader.appendChild(createIcon('refreshCw', 13));
          unitHeader.appendChild(unitTitle);
          unitHeader.appendChild(unitBadge);

          const unitContent = document.createElement('div');
          unitContent.style.cssText = [
            'display:' + (unitExpanded ? 'block' : 'none') + ';',
            'border:1px solid rgba(255,255,255,.08); border-top:none;',
            'border-radius:0 0 8px 8px; padding:10px;',
            'background:rgba(0,0,0,.1);'
          ].join('');

          if (unitExpanded) {
            const unitGrid = document.createElement('div');
            unitGrid.className = 'tc-lib-grid';
            unitGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(310px, 1fr)); gap:16px;';
            unitData.items.forEach(a => unitGrid.appendChild(renderActiveCard(a)));
            unitContent.appendChild(unitGrid);
          }

          unitHeader.addEventListener('click', () => {
            hierarchyExpandState.set('active-unit-' + uid, !unitExpanded);
            saveFilters();
            renderActiveTab();
          });

          unitWrapper.appendChild(unitHeader);
          unitWrapper.appendChild(unitContent);
          secContent.appendChild(unitWrapper);
        });
      }

      secHeader.addEventListener('click', () => {
        hierarchyExpandState.set('active-section-' + sectionId, !secExpanded);
        saveFilters();
        renderActiveTab();
      });

      secWrapper.appendChild(secHeader);
      secWrapper.appendChild(secContent);
      return secWrapper;
    };

    orderedSectionIds.forEach(sid => {
      wrapper.appendChild(renderActiveSectionAccordion(sid, sectionGroups.get(sid)));
    });

    // Uncategorized section
    const uncatExpanded = isHierarchyExpanded('active-section-uncategorized', true);
    const uncatWrapper = document.createElement('div');
    uncatWrapper.style.cssText = 'margin-bottom:16px;';

    const uncatHeader = document.createElement('div');
    uncatHeader.style.cssText = [
      'display:flex; align-items:center; gap:10px; padding:12px 16px;',
      'background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12);',
      'border-radius:' + (uncatExpanded ? '10px 10px 0 0' : '10px') + ';',
      'cursor:pointer; user-select:none;'
    ].join('');
    uncatHeader.setAttribute('aria-expanded', String(uncatExpanded));

    const uncatToggle = document.createElement('span');
    uncatToggle.style.cssText = 'font-size:13px; transition:transform .2s; display:inline-block; transform:rotate(' + (uncatExpanded ? '0deg' : '-90deg') + ');';
    uncatToggle.textContent = '\u25be';

    const uncatTitle = document.createElement('span');
    uncatTitle.style.cssText = 'font-size:15px; font-weight:700; letter-spacing:.03em; color:rgba(255,255,255,.65);';
    uncatTitle.textContent = 'UNCATEGORIZED';

    const uncatBadge = document.createElement('span');
    uncatBadge.style.cssText = 'background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:12px; padding:2px 9px; font-size:12px;';
    uncatBadge.textContent = uncategorized.length + ' active';

    uncatHeader.appendChild(uncatToggle);
    uncatHeader.appendChild(createIcon('refreshCw', 14));
    uncatHeader.appendChild(uncatTitle);
    uncatHeader.appendChild(uncatBadge);

    const uncatContent = document.createElement('div');
    uncatContent.style.cssText = [
      'display:' + (uncatExpanded ? 'block' : 'none') + ';',
      'border:1px solid rgba(255,255,255,.12); border-top:none;',
      'border-radius:0 0 10px 10px; padding:12px;',
      'background:rgba(255,255,255,.02);'
    ].join('');

    if (uncatExpanded && uncategorized.length > 0) {
      const uncatGrid = document.createElement('div');
      uncatGrid.className = 'tc-lib-grid';
      uncatGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(310px, 1fr)); gap:16px;';
      uncategorized.forEach(a => uncatGrid.appendChild(renderActiveCard(a)));
      uncatContent.appendChild(uncatGrid);
    } else if (uncatExpanded) {
      const none = document.createElement('div');
      none.style.cssText = 'padding:16px; text-align:center; color:rgba(255,255,255,.40); font-size:13px;';
      none.textContent = 'All active assignments are cataloged.';
      uncatContent.appendChild(none);
    }

    uncatHeader.addEventListener('click', () => {
      hierarchyExpandState.set('active-section-uncategorized', !uncatExpanded);
      saveFilters();
      renderActiveTab();
    });

    uncatWrapper.appendChild(uncatHeader);
    uncatWrapper.appendChild(uncatContent);
    wrapper.appendChild(uncatWrapper);

    return wrapper;
  }

  function renderActiveTab() {
    const container = $('activeTab');
    if (!container) return;
    try {
      container.innerHTML = '';

      const filtered = filterAssignments();
      let activeList = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'current'));

      // Apply tag filter
      if (filters.active.selectedTags.length > 0) {
        activeList = activeList.filter(a => {
          const aTags = Array.isArray(a.tags) ? a.tags : [];
          return filters.active.selectedTags.some(t => aTags.includes(t));
        });
      }

      // ── Primary filter bar (always visible) ──────────────────────────────
      const filterBar = document.createElement('div');
      filterBar.style.cssText = 'margin-bottom:8px; display:flex; flex-wrap:wrap; gap:12px; align-items:center;';

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

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.id = 'assignmentSearch';
      searchInput.placeholder = 'Search assignments...';
      searchInput.value = filters.assignments.searchQuery;
      searchInput.style.cssText = 'flex:1; min-width:180px; padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white;';
      filterBar.appendChild(searchInput);

      // Missing Work button (action, always visible)
      const missingWorkBtn = document.createElement('button');
      missingWorkBtn.className = 'tc-btn';
      missingWorkBtn.style.cssText = 'white-space:nowrap; display:flex; align-items:center; gap:6px;';
      const mwIcon = document.createElement('span');
      mwIcon.style.cssText = 'color:#f59e0b; display:inline-flex; align-items:center;';
      mwIcon.appendChild(createIcon('alertTriangle', 14));
      missingWorkBtn.appendChild(mwIcon);
      missingWorkBtn.appendChild(document.createTextNode('Missing Work'));
      missingWorkBtn.addEventListener('click', () => renderMissingWorkModal());
      filterBar.appendChild(missingWorkBtn);

      // Issue #7: Bulk Finalize by date range button (action, always visible)
      const bulkFinalizeByDateBtn = document.createElement('button');
      bulkFinalizeByDateBtn.className = 'tc-btn';
      bulkFinalizeByDateBtn.style.cssText = 'white-space:nowrap; display:flex; align-items:center; gap:6px;';
      bulkFinalizeByDateBtn.setAttribute('aria-label', 'Bulk finalize active assignments by date range');
      const bfdIcon = document.createElement('span');
      bfdIcon.style.cssText = 'display:inline-flex; align-items:center;';
      bfdIcon.appendChild(createIcon('checkCircle', 14));
      bulkFinalizeByDateBtn.appendChild(bfdIcon);
      bulkFinalizeByDateBtn.appendChild(document.createTextNode(' Bulk Finalize…'));
      bulkFinalizeByDateBtn.addEventListener('click', () => openBulkFinalizeByDateModal());
      filterBar.appendChild(bulkFinalizeByDateBtn);

      // Count active secondary filters for badge
      const activeSecondaryCount = (filters.active.selectedTags.length > 0 ? 1 : 0)
        + (filters.active.viewMode !== 'flat' ? 1 : 0);

      // More Filters toggle
      const activeMoreFiltersBtn = document.createElement('button');
      activeMoreFiltersBtn.className = 'tc-btn' + (activeSecondaryCount > 0 ? ' active' : '');
      activeMoreFiltersBtn.setAttribute('aria-expanded', filters.active.filtersExpanded ? 'true' : 'false');
      activeMoreFiltersBtn.setAttribute('aria-controls', 'activeSecondaryFilters');
      activeMoreFiltersBtn.setAttribute('aria-label', activeSecondaryCount > 0 ? `Filters (${activeSecondaryCount} active)` : 'Filters');
      activeMoreFiltersBtn.style.cssText = 'white-space:nowrap; display:inline-flex; align-items:center; gap:5px;';
      activeMoreFiltersBtn.appendChild(createIcon('filter', 14));
      activeMoreFiltersBtn.appendChild(document.createTextNode(activeSecondaryCount > 0 ? ` Filters (${activeSecondaryCount})` : ' Filters'));
      activeMoreFiltersBtn.addEventListener('click', () => {
        filters.active.filtersExpanded = !filters.active.filtersExpanded;
        saveFilters();
        renderActiveTab();
      });
      filterBar.appendChild(activeMoreFiltersBtn);

      container.appendChild(filterBar);

      // ── Secondary filter section (collapsible) ────────────────────────────
      const activeFiltersExpanded = filters.active.filtersExpanded || window.innerWidth > 1200;
      const activeSecondaryFilters = document.createElement('div');
      activeSecondaryFilters.id = 'activeSecondaryFilters';
      activeSecondaryFilters.style.cssText = 'display:' + (activeFiltersExpanded ? 'flex' : 'none') + '; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px;';

      // View mode toggle (secondary)
      const activeViewToggleWrap = document.createElement('div');
      activeViewToggleWrap.style.cssText = 'display:inline-flex; border:1px solid rgba(255,255,255,.15); border-radius:8px; overflow:hidden;';
      const activeFlatViewBtn = document.createElement('button');
      activeFlatViewBtn.className = 'tc-btn';
      activeFlatViewBtn.setAttribute('aria-pressed', filters.active.viewMode === 'flat' ? 'true' : 'false');
      activeFlatViewBtn.style.cssText = 'border-radius:0; border:none; gap:6px; padding:7px 12px;'
        + (filters.active.viewMode === 'flat' ? 'background:rgba(96,165,250,.18);' : '');
      activeFlatViewBtn.appendChild(createIcon('clipboard', 14));
      activeFlatViewBtn.appendChild(document.createTextNode(' Flat List'));
      activeFlatViewBtn.addEventListener('click', () => {
        if (filters.active.viewMode !== 'flat') {
          filters.active.viewMode = 'flat';
          saveFilters();
          renderActiveTab();
        }
      });
      const activeByUnitViewBtn = document.createElement('button');
      activeByUnitViewBtn.className = 'tc-btn';
      activeByUnitViewBtn.setAttribute('aria-pressed', filters.active.viewMode === 'byUnit' ? 'true' : 'false');
      activeByUnitViewBtn.style.cssText = 'border-radius:0; border:none; gap:6px; padding:7px 12px;'
        + (filters.active.viewMode === 'byUnit' ? 'background:rgba(96,165,250,.18);' : '');
      activeByUnitViewBtn.appendChild(createIcon('folderOpen', 14));
      activeByUnitViewBtn.appendChild(document.createTextNode(' By Unit'));
      activeByUnitViewBtn.addEventListener('click', () => {
        if (filters.active.viewMode !== 'byUnit') {
          filters.active.viewMode = 'byUnit';
          saveFilters();
          renderActiveTab();
        }
      });
      activeViewToggleWrap.appendChild(activeFlatViewBtn);
      activeViewToggleWrap.appendChild(activeByUnitViewBtn);
      activeSecondaryFilters.appendChild(activeViewToggleWrap);

      // Tag filter chips (secondary)
      const allActiveForTags = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'current'));
      const activeTagSet = new Set();
      allActiveForTags.forEach(a => { (Array.isArray(a.tags) ? a.tags : []).forEach(t => { if (t) activeTagSet.add(t); }); });
      if (activeTagSet.size > 0) {
        const allActiveTagsBtn = document.createElement('button');
        allActiveTagsBtn.className = 'tc-btn' + (filters.active.selectedTags.length === 0 ? ' active' : '');
        allActiveTagsBtn.style.cssText = 'font-size:12px; padding:3px 10px; border-radius:10px;';
        allActiveTagsBtn.textContent = 'All Tags';
        allActiveTagsBtn.addEventListener('click', () => {
          filters.active.selectedTags = [];
          saveFilters();
          renderActiveTab();
        });
        activeSecondaryFilters.appendChild(allActiveTagsBtn);
        [...activeTagSet].sort().forEach(tag => {
          const tagBtn = document.createElement('button');
          const isActive = filters.active.selectedTags.includes(tag);
          tagBtn.className = 'tc-btn' + (isActive ? ' active' : '');
          tagBtn.style.cssText = 'font-size:12px; padding:3px 10px; border-radius:10px;';
          tagBtn.textContent = tag;
          tagBtn.addEventListener('click', () => {
            const idx = filters.active.selectedTags.indexOf(tag);
            if (idx === -1) {
              filters.active.selectedTags = [...filters.active.selectedTags, tag];
            } else {
              filters.active.selectedTags = filters.active.selectedTags.filter(t => t !== tag);
            }
            saveFilters();
            renderActiveTab();
          });
          activeSecondaryFilters.appendChild(tagBtn);
        });
      }
      container.appendChild(activeSecondaryFilters);

      // Count / status row
      const countEl = document.createElement('div');
      countEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.45); margin-bottom:16px;';
      countEl.textContent = activeList.length === 0 ? 'No active assignments' :
        `${activeList.length} active assignment${activeList.length !== 1 ? 's' : ''}`;
      container.appendChild(countEl);

      if (activeList.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:48px 24px; text-align:center;';
        const iconWrap = document.createElement('div');
        iconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:12px; color:rgba(255,255,255,.40);';
        iconWrap.appendChild(createIcon('refreshCw', 40));
        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:15px; color:rgba(255,255,255,.50);';
        msg.textContent = filters.assignments.classFilter !== 'All Classes' || filters.assignments.searchQuery
          ? 'No active assignments match the current filters.'
          : 'No active assignments. Issue an assignment from the Reserve tab.';
        empty.appendChild(iconWrap);
        empty.appendChild(msg);
        if (!filters.assignments.classFilter || filters.assignments.classFilter === 'All Classes') {
          const activeTipEl = document.createElement('div');
          activeTipEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.35); margin-top:10px;';
          activeTipEl.textContent = 'Tip: Launch assignments from the Reserve tab or press 1 to switch.';
          empty.appendChild(activeTipEl);
        }
        container.appendChild(empty);
        updateActiveClassFilter();
        return;
      }

      // ── Bulk controls row ─────────────────────────────────────────────────────
      const activeBulkRow = document.createElement('div');
      activeBulkRow.id = 'activeBulkControls';
      activeBulkRow.style.cssText = [
        'display:flex; align-items:center; gap:10px; flex-wrap:wrap;',
        'padding:8px 4px 12px 4px; border-bottom:1px solid rgba(255,255,255,.08); margin-bottom:12px;'
      ].join('');

      const activeSelectAllLabel = document.createElement('label');
      activeSelectAllLabel.style.cssText = 'display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; color:rgba(255,255,255,.70); user-select:none;';
      const activeSelectAllCb = document.createElement('input');
      activeSelectAllCb.type = 'checkbox';
      activeSelectAllCb.id = 'activeSelectAll';
      activeSelectAllCb.style.cssText = 'cursor:pointer; width:15px; height:15px; accent-color:#60a5fa;';
      activeSelectAllCb.addEventListener('change', () => {
        if (activeSelectAllCb.checked) {
          activeList.forEach(a => selectedActive.add(a.id));
        } else {
          activeList.forEach(a => selectedActive.delete(a.id));
        }
        document.querySelectorAll('#activeTab .assignment-card').forEach(c => {
          const isSelected = selectedActive.has(c.dataset.id);
          c.style.outline = isSelected ? '2px solid #60a5fa' : '';
          c.style.boxShadow = isSelected ? '0 0 0 2px rgba(96,165,250,.25)' : '';
          const cb = c.querySelector('.active-select-cb');
          if (cb) cb.checked = isSelected;
        });
        refreshActiveBulkControls();
      });
      activeSelectAllLabel.appendChild(activeSelectAllCb);
      activeSelectAllLabel.appendChild(document.createTextNode('Select All'));
      activeBulkRow.appendChild(activeSelectAllLabel);

      const activeCountLabel = document.createElement('span');
      activeCountLabel.id = 'activeSelectionCount';
      activeCountLabel.style.cssText = 'font-size:13px; font-weight:600; color:#60a5fa; display:none;';
      activeBulkRow.appendChild(activeCountLabel);

      const activeFinalizeBtn = document.createElement('button');
      activeFinalizeBtn.id = 'activeBulkFinalizeBtn';
      activeFinalizeBtn.className = 'tc-btn';
      activeFinalizeBtn.style.cssText = 'display:none; font-size:12px; padding:5px 12px;';
      activeFinalizeBtn.setAttribute('title', 'Finalize selected assignments');
      activeFinalizeBtn.setAttribute('aria-label', 'Finalize selected assignments');
      activeFinalizeBtn.appendChild(createIcon('checkCircle', 14));
      activeFinalizeBtn.appendChild(document.createTextNode(' Finalize Selected'));
      activeFinalizeBtn.addEventListener('click', async () => {
        const ids = [...selectedActive];
        const n = ids.length;
        if (n === 0) return;
        const confirmed = await rcConfirm(
          'Batch Finalize',
          'Finalize ' + n + ' selected assignment' + (n !== 1 ? 's' : '') + '?\n\nThey will move to the Finalized tab.',
          'Finalize'
        );
        if (!confirmed) return;
        const snapshots = new Map();
        ids.forEach(id => {
          const idx = assignmentsData.findIndex(a => a.id === id);
          if (idx !== -1) snapshots.set(id, { ...assignmentsData[idx] });
        });
        try {
          const now = new Date().toISOString();
          await Promise.all(ids.map(id => db.updateAssignment(id, { active: false, finalized_at: now })));
          ids.forEach(id => {
            const idx = assignmentsData.findIndex(a => a.id === id);
            if (idx !== -1) {
              assignmentsData[idx].active = false;
              assignmentsData[idx].finalized_at = now;
            }
          });
          rebuildLaneCache();
          refreshActiveTab();
          showFinalizeToast('\u2713 Finalized ' + n + ' assignment' + (n !== 1 ? 's' : ''), ids);
        } catch (err) {
          console.error('[tc-library] Batch finalize failed:', err);
          snapshots.forEach((snap, id) => {
            const idx = assignmentsData.findIndex(a => a.id === id);
            if (idx !== -1) assignmentsData[idx] = snap;
          });
          rebuildLaneCache();
          refreshActiveTab();
          showToast('Failed to finalize assignments', '#ef4444', '#fff');
        }
      });
      activeBulkRow.appendChild(activeFinalizeBtn);

      const activeBulkReIssueBtn = document.createElement('button');
      activeBulkReIssueBtn.id = 'activeBulkReIssueBtn';
      activeBulkReIssueBtn.className = 'tc-btn';
      activeBulkReIssueBtn.style.cssText = 'display:none; font-size:12px; padding:5px 12px;';
      activeBulkReIssueBtn.setAttribute('title', 'Re-issue selected assignments');
      activeBulkReIssueBtn.setAttribute('aria-label', 'Re-issue selected assignments');
      activeBulkReIssueBtn.appendChild(createIcon('refreshCw', 14));
      activeBulkReIssueBtn.appendChild(document.createTextNode(' Re-Issue Selected'));
      activeBulkReIssueBtn.addEventListener('click', () => {
        const ids = [...selectedActive];
        const n = ids.length;
        if (n === 0) return;
        if (n === 1) {
          const assignment = assignmentsData.find(a => a.id === ids[0]);
          if (assignment) showReIssueModal(assignment, 'active');
        } else {
          showToast('Select one assignment at a time for re-issue');
        }
      });
      activeBulkRow.appendChild(activeBulkReIssueBtn);

      container.appendChild(activeBulkRow);
      refreshActiveBulkControls();

      // ── Content: By Unit or Flat (week grouping) ──────────────────────────────
      if (filters.active.viewMode === 'byUnit') {
        container.appendChild(renderActiveByUnit(activeList));
      } else {
        // ── Week grouping ────────────────────────────────────────────────────────
        const currentWeekLabel = getWeekLabel(new Date());

        // Group assignments by week of their earliest instance assigned_at (or assignment created_at)
        const weekMap = new Map(); // weekLabel → { assignments: [], mondayMs: number }
        activeList.forEach(a => {
          // Determine reference date: earliest instance assigned_at (or created_at), fallback to assignment created_at
          const instDates = instancesData
            .filter(i => i.assignment_id === a.id)
            .map(i => i.assigned_at || i.created_at)
            .filter(Boolean)
            .map(d => new Date(d).getTime())
            .filter(t => !isNaN(t));
          const refDate = instDates.length > 0
            ? new Date(Math.min(...instDates))
            : (a.created_at ? new Date(a.created_at) : new Date());
          const weekLabel = getWeekLabel(refDate);

          if (!weekMap.has(weekLabel)) {
            // Compute Monday timestamp for sorting
            const d = new Date(refDate);
            const dow = d.getDay();
            const offset = dow === 0 ? -6 : 1 - dow;
            const monday = new Date(d);
            monday.setDate(d.getDate() + offset);
            monday.setHours(0, 0, 0, 0);
            weekMap.set(weekLabel, { assignments: [], mondayMs: monday.getTime() });
          }
          weekMap.get(weekLabel).assignments.push(a);
        });

        // Sort weeks newest-first
        const sortedWeeks = [...weekMap.entries()].sort((a, b) => b[1].mondayMs - a[1].mondayMs);
        const weeksContainer = document.createElement('div');
        weeksContainer.style.cssText = 'display:flex; flex-direction:column; gap:8px;';

        sortedWeeks.forEach(([weekLabel, { assignments: weekAssignments }]) => {
          const isCurrentWeek = weekLabel === currentWeekLabel;
          const weekId = 'active-week-' + weekLabel.replace(/[^a-zA-Z0-9]/g, '_');
          const weekExpanded = isHierarchyExpanded(weekId, isCurrentWeek);

          const weekWrapper = document.createElement('div');
          weekWrapper.style.cssText = 'margin-bottom:2px;';

          const weekHeader = document.createElement('div');
          weekHeader.className = 'tc-hier-node';
          weekHeader.dataset.hierNode = weekId;
          weekHeader.style.cssText = [
            'display:flex; align-items:center; gap:8px;',
            'padding:8px 14px;',
            'background:rgba(255,255,255,.03);',
            'border:1px solid rgba(255,255,255,.07);',
            'border-radius:7px; cursor:pointer; user-select:none;',
            'margin-bottom:' + (weekExpanded ? '6px' : '0') + ';'
          ].join('');

          const weekToggle = document.createElement('span');
          weekToggle.style.cssText = 'font-size:11px; transition:transform .2s; display:inline-block; transform:rotate(' + (weekExpanded ? '0deg' : '-90deg') + ');';
          weekToggle.textContent = '\u25be';

          const weekIconWrap = document.createElement('span');
          weekIconWrap.style.cssText = 'display:inline-flex; align-items:center; color:rgba(96,165,250,.70);';
          weekIconWrap.appendChild(createIcon(weekExpanded ? 'folderOpen' : 'folder', 14));

          const weekTitle = document.createElement('span');
          weekTitle.style.cssText = 'font-size:14px; font-weight:600; flex:1;';
          weekTitle.textContent = weekLabel;

          if (isCurrentWeek) {
            const currentPill = document.createElement('span');
            currentPill.style.cssText = 'background:rgba(52,211,153,.15); color:#34d399; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;';
            currentPill.textContent = 'Current Week';
            weekHeader.appendChild(weekToggle);
            weekHeader.appendChild(weekIconWrap);
            weekHeader.appendChild(weekTitle);
            weekHeader.appendChild(currentPill);
          } else {
            weekHeader.appendChild(weekToggle);
            weekHeader.appendChild(weekIconWrap);
            weekHeader.appendChild(weekTitle);
          }

          const weekBadge = document.createElement('span');
          weekBadge.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40); margin-left:4px;';
          weekBadge.textContent = String(weekAssignments.length);
          weekHeader.appendChild(weekBadge);

          weekHeader.addEventListener('click', () => toggleHierarchy(weekId));

          const weekContent = document.createElement('div');
          weekContent.style.cssText = 'display:' + (weekExpanded ? 'block' : 'none') + ';';

          if (weekExpanded) {
            const grid = document.createElement('div');
            grid.className = 'tc-lib-grid';
            grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(310px, 1fr)); gap:16px;';
            weekAssignments.forEach(a => grid.appendChild(renderActiveCard(a)));
            weekContent.appendChild(grid);
          }

          weekWrapper.appendChild(weekHeader);
          weekWrapper.appendChild(weekContent);
          weeksContainer.appendChild(weekWrapper);
        });

        container.appendChild(weeksContainer);
      }

      updateActiveClassFilter();
    } catch (err) {
      console.error('[tc-library] Error rendering Active tab:', err);
      container.innerHTML = '';
      const errCard = document.createElement('div');
      errCard.className = 'tc-card';
      errCard.style.cssText = 'padding:32px; text-align:center; color:rgba(255,255,255,.7);';
      const p = document.createElement('p');
      p.textContent = 'Something went wrong rendering this section.';
      errCard.appendChild(p);
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tc-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.style.marginTop = '16px';
      retryBtn.addEventListener('click', () => renderActiveTab());
      errCard.appendChild(retryBtn);
      container.appendChild(errCard);
    }
  }

  /**
   * Renders a card for an active assignment with missing-student detection.
   */
  function renderActiveCard(assignment) {
    const stats = getAssignmentStats(assignment, instancesData, submissionsData);
    const instances = instancesData.filter(i => i.assignment_id === assignment.id);
    const dueDates = instances.map(i => i.due_at).filter(Boolean);
    const nearestDue = dueDates.length > 0
      ? new Date(Math.min(...dueDates.map(d => new Date(d).getTime())))
      : null;

    // Missing-student detection
    const className = inferClassName(assignment);
    const enrolledStudents = className
      ? classEnrollmentsData.filter(e => e.class_name === className && e.active !== false)
      : [];
    const assignedCodes = new Set(instances.map(i => i.student_code).filter(Boolean));
    const missingStudents = enrolledStudents.filter(e => !assignedCodes.has(e.student_code));
    const notStarted = instances.filter(i => i.status === 'Assigned');

    const card = document.createElement('div');
    card.className = 'tc-card assignment-card';
    card.dataset.id = assignment.id || '';
    const isActiveSelected = assignment.id != null && selectedActive.has(assignment.id);
    card.style.cssText = [
      'padding:20px; cursor:pointer;',
      isActiveSelected ? 'outline:2px solid #60a5fa; box-shadow:0 0 0 2px rgba(96,165,250,.25);' : ''
    ].join('');

    // ── Individual selection checkbox ────────────────────────────────────────
    const cbWrap = document.createElement('div');
    cbWrap.style.cssText = 'display:flex; justify-content:flex-end; margin-bottom:6px;';
    const selectCb = document.createElement('input');
    selectCb.type = 'checkbox';
    selectCb.className = 'active-select-cb';
    selectCb.checked = isActiveSelected;
    selectCb.disabled = assignment.id == null;
    selectCb.setAttribute('aria-label', 'Select ' + (assignment.title || 'Untitled'));
    selectCb.style.cssText = 'cursor:pointer; width:15px; height:15px; accent-color:#60a5fa;';
    selectCb.addEventListener('change', () => {
      if (assignment.id == null) return;
      if (selectCb.checked) {
        selectedActive.add(assignment.id);
        card.style.outline = '2px solid #60a5fa';
        card.style.boxShadow = '0 0 0 2px rgba(96,165,250,.25)';
      } else {
        selectedActive.delete(assignment.id);
        card.style.outline = '';
        card.style.boxShadow = '';
      }
      refreshActiveBulkControls();
    });
    cbWrap.appendChild(selectCb);
    card.appendChild(cbWrap);

    // Header
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;';
    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'margin:0; font-size:16px; flex:1; line-height:1.3;';
    titleEl.textContent = assignment.title || 'Untitled';
    const typePill = document.createElement('span');
    typePill.style.cssText = 'background:rgba(96,165,250,.20);color:#60a5fa;padding:3px 10px;border-radius:12px;font-size:12px;white-space:nowrap;flex-shrink:0;';
    typePill.textContent = getAssignmentTypeLabel(assignment) || (assignment.type || 'file');
    headerRow.appendChild(titleEl);
    headerRow.appendChild(typePill);
    card.appendChild(headerRow);

    if (className) {
      const classEl = document.createElement('div');
      classEl.style.cssText = 'margin-bottom:8px; display:inline-flex; align-items:center; gap:4px;';
      const classIcon = createIcon('users', 12);
      classIcon.style.cssText = 'flex-shrink:0; color:#60a5fa;';
      classEl.appendChild(classIcon);
      classEl.appendChild(createClassBadgeSpan(className));
      card.appendChild(classEl);
    }

    const activeCardTags = Array.isArray(assignment.tags) ? assignment.tags.filter(Boolean) : [];
    if (activeCardTags.length > 0) {
      const tagRow = document.createElement('div');
      tagRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;';
      activeCardTags.forEach(tag => {
        const tagPill = document.createElement('span');
        tagPill.style.cssText = 'background:rgba(255,255,255,.08); color:rgba(255,255,255,.50); padding:2px 8px; border-radius:10px; font-size:11px;';
        tagPill.textContent = tag;
        tagRow.appendChild(tagPill);
      });
      card.appendChild(tagRow);
    }

    if (nearestDue) {
      const dueEl = document.createElement('div');
      dueEl.style.cssText = 'color:rgba(255,255,255,.60); font-size:13px; margin-bottom:8px; display:inline-flex; align-items:center; gap:4px;';
      const calIcon = createIcon('calendar', 13);
      calIcon.style.cssText = 'flex-shrink:0;';
      dueEl.appendChild(calIcon);
      dueEl.appendChild(document.createTextNode('Due: ' + nearestDue.toLocaleDateString()));
      card.appendChild(dueEl);
    }

    // Submission progress bar
    const progressRow = document.createElement('div');
    progressRow.style.cssText = 'margin-bottom:10px;';
    const total = stats.studentCount;
    const submitted = stats.submittedCount + stats.gradedCount;
    const progressLabel = document.createElement('div');
    progressLabel.style.cssText = 'font-size:12px; color:rgba(255,255,255,.50); margin-bottom:5px;';
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

    // Missing student alerts
    if (missingStudents.length > 0) {
      const alertEl = document.createElement('div');
      alertEl.style.cssText = 'background:rgba(251,191,36,.10); border:1px solid rgba(251,191,36,.25); border-radius:8px; padding:8px 12px; margin-bottom:10px;';
      const alertHeader = document.createElement('div');
      alertHeader.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#fbbf24; margin-bottom:4px;';
      alertHeader.appendChild(createIcon('users', 12));
      alertHeader.appendChild(document.createTextNode(
        missingStudents.length + ' student' + (missingStudents.length !== 1 ? 's' : '') + ' not assigned'
      ));
      alertEl.appendChild(alertHeader);
      const names = missingStudents.slice(0, 4).map(e => e.student_name || e.student_code).join(', ');
      const overflow = missingStudents.length > 4 ? ` +${missingStudents.length - 4} more` : '';
      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'font-size:11px; color:rgba(255,255,255,.50);';
      nameEl.textContent = names + overflow;
      alertEl.appendChild(nameEl);
      card.appendChild(alertEl);
    } else if (notStarted.length > 0) {
      const alertEl = document.createElement('div');
      alertEl.style.cssText = 'background:rgba(96,165,250,.08); border:1px solid rgba(96,165,250,.20); border-radius:8px; padding:8px 12px; margin-bottom:10px;';
      const alertHeader = document.createElement('div');
      alertHeader.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:rgba(96,165,250,.80);';
      alertHeader.appendChild(createIcon('users', 12));
      alertHeader.appendChild(document.createTextNode(
        notStarted.length + ' student' + (notStarted.length !== 1 ? 's' : '') + ' haven\'t started'
      ));
      alertEl.appendChild(alertHeader);
      card.appendChild(alertEl);
    }

    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:8px; margin-top:4px;';
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

    // Issue #6: Inline "✓ Finalize" quick-action button
    const quickFinalizeBtn = document.createElement('button');
    quickFinalizeBtn.className = 'tc-btn';
    quickFinalizeBtn.style.cssText = 'font-size:12px; padding:5px 10px; border-color:rgba(52,211,153,.35); color:#34d399;';
    quickFinalizeBtn.setAttribute('aria-label', 'Finalize ' + (assignment.title || 'Untitled'));
    quickFinalizeBtn.appendChild(createIcon('checkCircle', 13));
    quickFinalizeBtn.appendChild(document.createTextNode(' Finalize'));
    quickFinalizeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const title = assignment.title || 'Untitled';
      const confirmed = await rcConfirm(
        'Finalize Assignment',
        'Finalize \u201c' + title + '\u201d? This will move it to the Finalized tab.',
        'Finalize'
      );
      if (!confirmed) return;
      const idx = assignmentsData.findIndex(a => a.id === assignment.id);
      const snapshot = idx !== -1 ? { ...assignmentsData[idx] } : null;
      try {
        const now = new Date().toISOString();
        await db.updateAssignment(assignment.id, { active: false, finalized_at: now });
        if (idx !== -1) {
          assignmentsData[idx].active = false;
          assignmentsData[idx].finalized_at = now;
        }
        rebuildLaneCache();
        showFinalizeToast('\u2713 Finalized \u201c' + title + '\u201d', [assignment.id]);
        refreshActiveTab();
      } catch (err) {
        console.error('[tc-library] Quick finalize failed:', err);
        if (idx !== -1 && snapshot) assignmentsData[idx] = snapshot;
        rebuildLaneCache();
        showToast('Failed to finalize assignment', '#ef4444', '#fff');
      }
    });
    btnRow.appendChild(quickFinalizeBtn);

    card.appendChild(btnRow);

    // Gradebook cross-link
    const gbLink = document.createElement('button');
    gbLink.className = 'tc-btn';
    gbLink.style.cssText = 'margin-top:6px; font-size:11px; padding:4px 8px; color:rgba(255,255,255,.45); border-color:rgba(255,255,255,.10); width:100%; justify-content:center;';
    gbLink.setAttribute('title', 'View in Gradebook');
    gbLink.setAttribute('aria-label', 'View in Gradebook');
    gbLink.appendChild(createIcon('barChart', 12));
    gbLink.appendChild(document.createTextNode(' Gradebook'));
    gbLink.addEventListener('click', (e) => {
      e.stopPropagation();
      const gbUrl = className
        ? '/teacher/gradebook/?class=' + encodeURIComponent(className)
        : '/teacher/gradebook/';
      window.location.href = gbUrl;
    });
    card.appendChild(gbLink);

    return card;
  }

  // ── Finalized Tab ─────────────────────────────────────────────────────────────

  function renderFinalizedTab() {
    const container = $('finalizedTab');
    if (!container) return;
    try {
      container.innerHTML = '';

      // Declare early so export/print closures capture the variable binding
      let finalizedList = [];

      // ── Toolbar: view toggle + export buttons ──────────────────────────────
      const toolbarRow = document.createElement('div');
      toolbarRow.style.cssText = 'margin-bottom:12px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;';

      // View toggle group
      const viewToggleWrap = document.createElement('div');
      viewToggleWrap.style.cssText = 'display:inline-flex; border:1px solid rgba(255,255,255,.15); border-radius:8px; overflow:hidden;';

      const treeViewBtn = document.createElement('button');
      treeViewBtn.className = 'tc-btn';
      treeViewBtn.setAttribute('aria-pressed', filters.finalized.viewMode === 'tree' ? 'true' : 'false');
      treeViewBtn.style.cssText = 'border-radius:0; border:none; gap:6px; padding:7px 12px;'
        + (filters.finalized.viewMode === 'tree' ? 'background:rgba(96,165,250,.18);' : '');
      treeViewBtn.appendChild(createIcon('folderOpen', 14));
      treeViewBtn.appendChild(document.createTextNode(' Tree View'));
      treeViewBtn.addEventListener('click', () => {
        if (filters.finalized.viewMode !== 'tree') {
          filters.finalized.viewMode = 'tree';
          saveFilters();
          renderFinalizedTab();
        }
      });

      const tableViewBtn = document.createElement('button');
      tableViewBtn.className = 'tc-btn';
      tableViewBtn.setAttribute('aria-pressed', filters.finalized.viewMode === 'table' ? 'true' : 'false');
      tableViewBtn.style.cssText = 'border-radius:0; border:none; gap:6px; padding:7px 12px;'
        + (filters.finalized.viewMode === 'table' ? 'background:rgba(96,165,250,.18);' : '');
      tableViewBtn.appendChild(createIcon('table', 14));
      tableViewBtn.appendChild(document.createTextNode(' Table View'));
      tableViewBtn.addEventListener('click', () => {
        if (filters.finalized.viewMode !== 'table') {
          filters.finalized.viewMode = 'table';
          saveFilters();
          renderFinalizedTab();
        }
      });

      viewToggleWrap.appendChild(treeViewBtn);
      viewToggleWrap.appendChild(tableViewBtn);

      const byUnitViewBtn = document.createElement('button');
      byUnitViewBtn.className = 'tc-btn';
      byUnitViewBtn.setAttribute('aria-pressed', filters.finalized.viewMode === 'byUnit' ? 'true' : 'false');
      byUnitViewBtn.style.cssText = 'border-radius:0; border:none; gap:6px; padding:7px 12px;'
        + (filters.finalized.viewMode === 'byUnit' ? 'background:rgba(96,165,250,.18);' : '');
      byUnitViewBtn.appendChild(createIcon('folderOpen', 14));
      byUnitViewBtn.appendChild(document.createTextNode(' By Unit'));
      byUnitViewBtn.addEventListener('click', () => {
        if (filters.finalized.viewMode !== 'byUnit') {
          filters.finalized.viewMode = 'byUnit';
          saveFilters();
          renderFinalizedTab();
        }
      });
      viewToggleWrap.appendChild(byUnitViewBtn);

      toolbarRow.appendChild(viewToggleWrap);

      const toolbarSpacer = document.createElement('div');
      toolbarSpacer.style.flex = '1';
      toolbarRow.appendChild(toolbarSpacer);

      // Export CSV button
      const exportCsvBtn = document.createElement('button');
      exportCsvBtn.className = 'tc-btn';
      exportCsvBtn.style.cssText = 'display:inline-flex; align-items:center; gap:6px; font-size:13px;';
      exportCsvBtn.appendChild(createIcon('fileCsv', 14));
      exportCsvBtn.appendChild(document.createTextNode(' Export CSV'));
      exportCsvBtn.addEventListener('click', () => exportFinalizedCSV(finalizedList));
      toolbarRow.appendChild(exportCsvBtn);

      // Print button
      const printBtn = document.createElement('button');
      printBtn.className = 'tc-btn';
      printBtn.style.cssText = 'display:inline-flex; align-items:center; gap:6px; font-size:13px;';
      printBtn.appendChild(createIcon('printer', 14));
      printBtn.appendChild(document.createTextNode(' Print'));
      printBtn.addEventListener('click', () => printFinalizedReport(finalizedList));
      toolbarRow.appendChild(printBtn);

      container.appendChild(toolbarRow);

      // ── Multi-axis filter bar (primary: class filter + More Filters toggle) ──
      const filterBar = document.createElement('div');
      filterBar.style.cssText = 'margin-bottom:8px; display:flex; flex-wrap:wrap; gap:12px; align-items:center;';

      // Class filter pills (primary)
      const classBtnWrap = document.createElement('div');
      classBtnWrap.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';
      const allClassBtn = document.createElement('button');
      allClassBtn.className = 'tc-lib-fin-class-filter tc-btn';
      allClassBtn.dataset.class = 'All Classes';
      allClassBtn.textContent = 'All Classes';
      if (filters.finalized.classFilter === 'All Classes') allClassBtn.classList.add('active');
      classBtnWrap.appendChild(allClassBtn);
      CANON_CLASSES.forEach(cls => {
        const btn = document.createElement('button');
        btn.className = 'tc-lib-fin-class-filter tc-btn';
        btn.dataset.class = cls;
        btn.textContent = cls;
        if (filters.finalized.classFilter === cls) btn.classList.add('active');
        classBtnWrap.appendChild(btn);
      });
      filterBar.appendChild(classBtnWrap);

      // Count active secondary filters for badge
      const finalizedSecondaryCount = (filters.finalized.studentFilter.trim() ? 1 : 0)
        + (filters.finalized.weekFilter.trim() ? 1 : 0)
        + (filters.finalized.dateFrom.trim() ? 1 : 0)
        + (filters.finalized.dateTo.trim() ? 1 : 0);

      // More Filters toggle (primary)
      const finMoreFiltersBtn = document.createElement('button');
      finMoreFiltersBtn.className = 'tc-btn' + (finalizedSecondaryCount > 0 ? ' active' : '');
      finMoreFiltersBtn.setAttribute('aria-expanded', filters.finalized.filtersExpanded ? 'true' : 'false');
      finMoreFiltersBtn.setAttribute('aria-controls', 'finalizedSecondaryFilters');
      finMoreFiltersBtn.setAttribute('aria-label', finalizedSecondaryCount > 0 ? `Filters (${finalizedSecondaryCount} active)` : 'Filters');
      finMoreFiltersBtn.style.cssText = 'white-space:nowrap; display:inline-flex; align-items:center; gap:5px;';
      finMoreFiltersBtn.appendChild(createIcon('filter', 14));
      finMoreFiltersBtn.appendChild(document.createTextNode(finalizedSecondaryCount > 0 ? ` Filters (${finalizedSecondaryCount})` : ' Filters'));
      finMoreFiltersBtn.addEventListener('click', () => {
        filters.finalized.filtersExpanded = !filters.finalized.filtersExpanded;
        saveFilters();
        renderFinalizedTab();
      });
      filterBar.appendChild(finMoreFiltersBtn);
      container.appendChild(filterBar);

      // ── Secondary filter section (collapsible) ────────────────────────────
      const finalizedFiltersExpanded = filters.finalized.filtersExpanded || window.innerWidth > 1200;
      const finalizedSecondaryFilters = document.createElement('div');
      finalizedSecondaryFilters.id = 'finalizedSecondaryFilters';
      finalizedSecondaryFilters.style.cssText = 'display:' + (finalizedFiltersExpanded ? 'flex' : 'none') + '; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:12px;';

      // Student name filter (secondary)
      const studentInput = document.createElement('input');
      studentInput.type = 'text';
      studentInput.id = 'finalizedStudentFilter';
      studentInput.placeholder = 'Filter by student...';
      studentInput.value = filters.finalized.studentFilter;
      studentInput.style.cssText = 'flex:1; min-width:160px; max-width:220px; padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white; font-size:13px;';
      finalizedSecondaryFilters.appendChild(studentInput);

      // Week filter (secondary)
      const weekInput = document.createElement('input');
      weekInput.type = 'text';
      weekInput.id = 'finalizedWeekFilter';
      weekInput.placeholder = 'Filter by week...';
      weekInput.value = filters.finalized.weekFilter;
      weekInput.style.cssText = 'min-width:140px; max-width:180px; padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white; font-size:13px;';
      finalizedSecondaryFilters.appendChild(weekInput);

      // Date range filter (secondary)
      const dateRangeWrap = document.createElement('div');
      dateRangeWrap.style.cssText = 'display:inline-flex; align-items:center; gap:6px;';
      const dateIcon = document.createElement('span');
      dateIcon.style.cssText = 'display:inline-flex; align-items:center; color:rgba(255,255,255,.40);';
      dateIcon.setAttribute('aria-hidden', 'true');
      dateIcon.appendChild(createIcon('calendar', 13));
      dateRangeWrap.appendChild(dateIcon);
      const dateFromInput = document.createElement('input');
      dateFromInput.type = 'date';
      dateFromInput.id = 'finalizedDateFrom';
      dateFromInput.value = filters.finalized.dateFrom;
      dateFromInput.setAttribute('aria-label', 'From date');
      dateFromInput.style.cssText = 'padding:7px 10px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white; font-size:13px; color-scheme:dark;';
      dateRangeWrap.appendChild(dateFromInput);
      const dateSep = document.createElement('span');
      dateSep.style.cssText = 'color:rgba(255,255,255,.40); font-size:13px;';
      dateSep.textContent = '\u2013';
      dateRangeWrap.appendChild(dateSep);
      const dateToInput = document.createElement('input');
      dateToInput.type = 'date';
      dateToInput.id = 'finalizedDateTo';
      dateToInput.value = filters.finalized.dateTo;
      dateToInput.setAttribute('aria-label', 'To date');
      dateToInput.style.cssText = 'padding:7px 10px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.15); border-radius:8px; color:white; font-size:13px; color-scheme:dark;';
      dateRangeWrap.appendChild(dateToInput);
      finalizedSecondaryFilters.appendChild(dateRangeWrap);

      // Clear filters button (secondary, when active)
      const hasFilters = filters.finalized.classFilter !== 'All Classes' ||
        filters.finalized.studentFilter.trim() ||
        filters.finalized.weekFilter.trim() ||
        filters.finalized.dateFrom.trim() ||
        filters.finalized.dateTo.trim();
      if (hasFilters) {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'tc-btn';
        clearBtn.style.opacity = '0.7';
        clearBtn.textContent = '\u00d7 Clear';
        clearBtn.addEventListener('click', () => {
          filters.finalized.classFilter = 'All Classes';
          filters.finalized.studentFilter = '';
          filters.finalized.weekFilter = '';
          filters.finalized.dateFrom = '';
          filters.finalized.dateTo = '';
          saveFilters();
          renderFinalizedTab();
        });
        finalizedSecondaryFilters.appendChild(clearBtn);
      }
      container.appendChild(finalizedSecondaryFilters);

      // ── Compute and filter finalized list ─────────────────────────────────
      finalizedList = sortAssignments(
        assignmentsData.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'finalized')
      );

      // Apply class filter
      if (filters.finalized.classFilter !== 'All Classes') {
        finalizedList = finalizedList.filter(a => {
          const cls = inferClassName(a);
          return cls === filters.finalized.classFilter ||
            a.series === filters.finalized.classFilter;
        });
      }

      // Apply student filter (cross-reference instances by student_code/student_name)
      const studentQuery = filters.finalized.studentFilter.trim().toLowerCase();
      if (studentQuery) {
        finalizedList = finalizedList.filter(a => {
          const instances = instancesData.filter(i => i.assignment_id === a.id);
          return instances.some(inst => {
            const enroll = classEnrollmentsData.find(e => e.student_code === inst.student_code);
            const name = (enroll ? enroll.student_name : inst.student_code || '').toLowerCase();
            return name.includes(studentQuery) || (inst.student_code || '').toLowerCase().includes(studentQuery);
          });
        });
      }

      // Apply week filter
      const weekQuery = filters.finalized.weekFilter.trim().toLowerCase();
      if (weekQuery) {
        finalizedList = finalizedList.filter(a => {
          const date = getFinalizationDate(a, instancesData, submissionsData);
          const weekLabel = getWeekLabel(date).toLowerCase();
          const monthLabel = getMonthLabel(date).toLowerCase();
          return weekLabel.includes(weekQuery) || monthLabel.includes(weekQuery);
        });
      }

      // Apply date range filter
      if (filters.finalized.dateFrom.trim()) {
        const fromDate = new Date(filters.finalized.dateFrom);
        if (!isNaN(fromDate.getTime())) {
          finalizedList = finalizedList.filter(a => {
            const d = getFinalizationDate(a, instancesData, submissionsData);
            return d >= fromDate;
          });
        }
      }
      if (filters.finalized.dateTo.trim()) {
        const toDate = new Date(filters.finalized.dateTo);
        if (!isNaN(toDate.getTime())) {
          // Set to end of the "To" day so the filter is fully inclusive
          toDate.setHours(23, 59, 59, 999);
          finalizedList = finalizedList.filter(a => {
            const d = getFinalizationDate(a, instancesData, submissionsData);
            return d <= toDate;
          });
        }
      }

      // Tag filter chips (scan pre-tag-filtered list for available tags)
      const allFinalizedForTags = finalizedList.slice();
      const finalizedTagSet = new Set();
      allFinalizedForTags.forEach(a => { (Array.isArray(a.tags) ? a.tags : []).forEach(t => { if (t) finalizedTagSet.add(t); }); });
      if (finalizedTagSet.size > 0) {
        const finTagFilterRow = document.createElement('div');
        finTagFilterRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; align-items:center;';
        const allFinTagsBtn = document.createElement('button');
        allFinTagsBtn.className = 'tc-btn' + (filters.finalized.selectedTags.length === 0 ? ' active' : '');
        allFinTagsBtn.style.cssText = 'font-size:12px; padding:3px 10px; border-radius:10px;';
        allFinTagsBtn.textContent = 'All Tags';
        allFinTagsBtn.addEventListener('click', () => {
          filters.finalized.selectedTags = [];
          saveFilters();
          renderFinalizedTab();
        });
        finTagFilterRow.appendChild(allFinTagsBtn);
        [...finalizedTagSet].sort().forEach(tag => {
          const tagBtn = document.createElement('button');
          const isActive = filters.finalized.selectedTags.includes(tag);
          tagBtn.className = 'tc-btn' + (isActive ? ' active' : '');
          tagBtn.style.cssText = 'font-size:12px; padding:3px 10px; border-radius:10px;';
          tagBtn.textContent = tag;
          tagBtn.addEventListener('click', () => {
            const idx = filters.finalized.selectedTags.indexOf(tag);
            if (idx === -1) {
              filters.finalized.selectedTags = [...filters.finalized.selectedTags, tag];
            } else {
              filters.finalized.selectedTags = filters.finalized.selectedTags.filter(t => t !== tag);
            }
            saveFilters();
            renderFinalizedTab();
          });
          finTagFilterRow.appendChild(tagBtn);
        });
        container.appendChild(finTagFilterRow);
      }

      // Apply tag filter
      if (filters.finalized.selectedTags.length > 0) {
        finalizedList = finalizedList.filter(a => {
          const aTags = Array.isArray(a.tags) ? a.tags : [];
          return filters.finalized.selectedTags.some(t => aTags.includes(t));
        });
      }

      // Count label
      const countEl = document.createElement('div');
      countEl.setAttribute('aria-live', 'polite');
      countEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.45); margin-bottom:12px;';
      const total = assignmentsData.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'finalized').length;
      countEl.textContent = finalizedList.length === total
        ? `${total} finalized assignment${total !== 1 ? 's' : ''}`
        : `Showing ${finalizedList.length} of ${total} finalized assignment${total !== 1 ? 's' : ''}`;
      container.appendChild(countEl);

      if (finalizedList.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:48px 24px; text-align:center;';
        const iconWrap = document.createElement('div');
        iconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:12px; color:rgba(255,255,255,.40);';
        iconWrap.appendChild(createIcon('checkCircle', 40));
        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:15px; color:rgba(255,255,255,.50);';
        msg.textContent = hasFilters
          ? 'No finalized assignments match the current filters.'
          : 'No finalized assignments yet.';
        empty.appendChild(iconWrap);
        empty.appendChild(msg);
        container.appendChild(empty);
        return;
      }

      if (filters.finalized.viewMode === 'table') {
        const tableWrap = document.createElement('div');
        tableWrap.className = 'tc-card';
        tableWrap.style.cssText = 'padding:0; overflow-x:auto;';
        tableWrap.appendChild(renderFinalizedTable(finalizedList));
        container.appendChild(tableWrap);
      } else if (filters.finalized.viewMode === 'byUnit') {
        container.appendChild(renderFinalizedByUnit(finalizedList));
      } else {
        container.appendChild(
          renderLaneSection('finalized', 'checkCircle', 'Finalized', finalizedList.length, (div) => {
            div.appendChild(renderFinalizedLane(finalizedList));
          })
        );
      }

      // Issue #11: Highlight recently finalized assignments with a pulse animation
      if (lastFinalizedIds.size > 0) {
        requestAnimationFrame(() => {
          container.querySelectorAll('[data-id]').forEach(el => {
            if (lastFinalizedIds.has(el.dataset.id)) {
              el.classList.add('tc-lib-recently-finalized');
              el.addEventListener('animationend', () => el.classList.remove('tc-lib-recently-finalized'), { once: true });
            }
          });
        });
      }
    } catch (err) {
      console.error('[tc-library] Error rendering Finalized tab:', err);
      container.innerHTML = '';
      const errCard = document.createElement('div');
      errCard.className = 'tc-card';
      errCard.style.cssText = 'padding:32px; text-align:center; color:rgba(255,255,255,.7);';
      const p = document.createElement('p');
      p.textContent = 'Something went wrong rendering this section.';
      errCard.appendChild(p);
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tc-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.style.marginTop = '16px';
      retryBtn.addEventListener('click', () => renderFinalizedTab());
      errCard.appendChild(retryBtn);
      container.appendChild(errCard);
    }
  }

  // ── Finalized Table View ──────────────────────────────────────────────────────

  function renderFinalizedTable(assignments) {
    const col = filters.finalized.sortColumn || 'date';
    const dir = filters.finalized.sortDirection || 'desc';

    const sorted = [...assignments].sort((a, b) => {
      let aVal, bVal;
      switch (col) {
        case 'title':
          aVal = (a.title || '').toLowerCase();
          bVal = (b.title || '').toLowerCase();
          break;
        case 'class':
          aVal = (inferClassName(a) || '').toLowerCase();
          bVal = (inferClassName(b) || '').toLowerCase();
          break;
        case 'students': {
          const sa = getAssignmentStats(a, instancesData, submissionsData);
          const sb = getAssignmentStats(b, instancesData, submissionsData);
          aVal = sa.studentCount;
          bVal = sb.studentCount;
          break;
        }
        case 'avgScore': {
          const sa = getAssignmentStats(a, instancesData, submissionsData);
          const sb = getAssignmentStats(b, instancesData, submissionsData);
          aVal = sa.avgScore != null ? sa.avgScore : -1;
          bVal = sb.avgScore != null ? sb.avgScore : -1;
          break;
        }
        case 'status':
          aVal = a.active === false ? 'archived' : 'active';
          bVal = b.active === false ? 'archived' : 'active';
          break;
        default: // 'date'
          aVal = getFinalizationDate(a, instancesData, submissionsData).getTime();
          bVal = getFinalizationDate(b, instancesData, submissionsData).getTime();
          break;
      }
      if (aVal < bVal) return dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return dir === 'asc' ? 1 : -1;
      return 0;
    });

    const table = document.createElement('table');
    table.style.cssText = 'width:100%; border-collapse:collapse; font-size:14px;';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.cssText = 'background:rgba(255,255,255,.04);';

    const cols = [
      { key: 'title', label: 'Title' },
      { key: 'class', label: 'Class' },
      { key: 'students', label: 'Students' },
      { key: 'avgScore', label: 'Avg Score' },
      { key: 'date', label: 'Date Finalized' },
      { key: 'status', label: 'Status' }
    ];

    cols.forEach(({ key, label }) => {
      const th = document.createElement('th');
      th.style.cssText = 'padding:10px 14px; text-align:left; font-weight:600; font-size:13px; color:rgba(255,255,255,.70); cursor:pointer; user-select:none; white-space:nowrap; border-bottom:1px solid rgba(255,255,255,.10);';
      const thInner = document.createElement('span');
      thInner.style.cssText = 'display:inline-flex; align-items:center; gap:4px;';
      thInner.appendChild(document.createTextNode(label));
      if (col === key) {
        const indicator = document.createElement('span');
        indicator.style.cssText = 'font-size:10px; color:#60a5fa;';
        indicator.textContent = dir === 'asc' ? '\u25b2' : '\u25bc';
        thInner.appendChild(indicator);
      }
      th.appendChild(thInner);
      th.addEventListener('click', () => {
        if (filters.finalized.sortColumn === key) {
          filters.finalized.sortDirection = filters.finalized.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          filters.finalized.sortColumn = key;
          filters.finalized.sortDirection = 'asc';
        }
        saveFilters();
        renderFinalizedTab();
      });
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    sorted.forEach((a, idx) => {
      const stats = getAssignmentStats(a, instancesData, submissionsData);
      const className = inferClassName(a);
      const finalDate = getFinalizationDate(a, instancesData, submissionsData);
      const isArchived = a.active === false;
      const instances = instancesData.filter(i => i.assignment_id === a.id);
      const studentCodes = [...new Set(instances.map(i => i.student_code).filter(Boolean))];

      const tr = document.createElement('tr');
      tr.dataset.id = a.id || '';
      tr.style.cssText = 'cursor:pointer; transition:background .1s ease;'
        + (idx % 2 === 1 ? 'background:rgba(255,255,255,.02);' : '');
      tr.addEventListener('mouseenter', () => { tr.style.background = 'rgba(96,165,250,.08)'; });
      tr.addEventListener('mouseleave', () => { tr.style.background = idx % 2 === 1 ? 'rgba(255,255,255,.02)' : ''; });
      tr.addEventListener('click', () => showAssignmentDetail(a.id));

      const cellStyle = 'padding:10px 14px; border-bottom:1px solid rgba(255,255,255,.06); vertical-align:middle;';

      // Title
      const tdTitle = document.createElement('td');
      tdTitle.style.cssText = cellStyle;
      const titleSpan = document.createElement('span');
      titleSpan.style.cssText = 'font-weight:500; color:white;';
      titleSpan.textContent = a.title || 'Untitled';
      tdTitle.appendChild(titleSpan);
      tr.appendChild(tdTitle);

      // Class
      const tdClass = document.createElement('td');
      tdClass.style.cssText = cellStyle;
      if (className) {
        tdClass.appendChild(createClassBadgeSpan(className));
      } else {
        tdClass.style.color = 'rgba(255,255,255,.30)';
        tdClass.textContent = '\u2014';
      }
      tr.appendChild(tdClass);

      // Students
      const tdStudents = document.createElement('td');
      tdStudents.style.cssText = cellStyle;
      if (studentCodes.length > 0) {
        const badgesWrap = document.createElement('div');
        badgesWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; align-items:center;';
        studentCodes.slice(0, 3).forEach(code => {
          const enroll = classEnrollmentsData.find(e => e.student_code === code);
          const name = enroll ? (enroll.student_name || code) : code;
          const badge = document.createElement('span');
          badge.style.cssText = 'background:rgba(52,211,153,.12); color:#34d399; padding:2px 8px; border-radius:8px; font-size:11px; cursor:pointer; white-space:nowrap;';
          badge.textContent = name;
          badge.title = 'View student detail';
          badge.addEventListener('click', (e) => {
            e.stopPropagation();
            showStudentDetail(code, name);
          });
          badgesWrap.appendChild(badge);
        });
        if (studentCodes.length > 3) {
          const moreSpan = document.createElement('span');
          moreSpan.style.cssText = 'color:rgba(255,255,255,.40); font-size:11px;';
          moreSpan.textContent = '+' + (studentCodes.length - 3) + ' more';
          badgesWrap.appendChild(moreSpan);
        }
        tdStudents.appendChild(badgesWrap);
      } else {
        tdStudents.style.color = 'rgba(255,255,255,.30)';
        tdStudents.textContent = '\u2014';
      }
      tr.appendChild(tdStudents);

      // Avg Score
      const tdScore = document.createElement('td');
      tdScore.style.cssText = cellStyle;
      if (stats.avgScore != null) {
        const scoreSpan = document.createElement('span');
        scoreSpan.style.cssText = `font-weight:600; color:${scoreColor(stats.avgScore)};`;
        scoreSpan.textContent = stats.avgScore + '%';
        tdScore.appendChild(scoreSpan);
      } else {
        tdScore.style.color = 'rgba(255,255,255,.30)';
        tdScore.textContent = '\u2014';
      }
      tr.appendChild(tdScore);

      // Date Finalized
      const tdDate = document.createElement('td');
      tdDate.style.cssText = cellStyle + 'color:rgba(255,255,255,.60); white-space:nowrap;';
      tdDate.textContent = finalDate.toLocaleDateString();
      tr.appendChild(tdDate);

      // Status
      const tdStatus = document.createElement('td');
      tdStatus.style.cssText = cellStyle;
      const statusBadge = document.createElement('span');
      if (isArchived) {
        statusBadge.style.cssText = 'background:rgba(255,255,255,.08); color:rgba(255,255,255,.40); padding:2px 10px; border-radius:8px; font-size:12px;';
        statusBadge.textContent = 'Archived';
      } else {
        statusBadge.style.cssText = 'background:rgba(52,211,153,.12); color:#34d399; padding:2px 10px; border-radius:8px; font-size:12px;';
        statusBadge.textContent = 'Active';
      }
      tdStatus.appendChild(statusBadge);
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }


  // ── Finalized By Unit View ────────────────────────────────────────────────────

  function renderFinalizedByUnit(assignments) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom:24px;';

    if (assignments.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:32px 24px; text-align:center; color:rgba(255,255,255,.50);';
      empty.textContent = 'No finalized assignments';
      wrapper.appendChild(empty);
      return wrapper;
    }

    // Group assignments: section → unit → assignments[]
    const sectionGroups = new Map();
    const uncategorized = [];

    assignments.forEach(a => {
      const uid = a.unit_id;
      if (!uid) { uncategorized.push(a); return; }
      const info = getUnitInfo(uid);
      if (!info) { uncategorized.push(a); return; }
      const { sectionName, sectionId, unitName } = info;
      if (!sectionGroups.has(sectionId)) {
        sectionGroups.set(sectionId, { sectionName, units: new Map() });
      }
      const sg = sectionGroups.get(sectionId);
      if (!sg.units.has(uid)) sg.units.set(uid, { unitName, items: [] });
      sg.units.get(uid).items.push(a);
    });

    // Build ordered section list from lessonsData
    const orderedSectionIds = [];
    if (lessonsData && Array.isArray(lessonsData.sections)) {
      lessonsData.sections.forEach(sec => {
        const sid = sec.name.toLowerCase().replace(/[\s/]+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (sectionGroups.has(sid)) orderedSectionIds.push(sid);
      });
    }
    sectionGroups.forEach((_, sid) => {
      if (!orderedSectionIds.includes(sid)) orderedSectionIds.push(sid);
    });

    const renderFinSectionAccordion = (sectionId, sectionData) => {
      const secExpanded = isHierarchyExpanded('fin-section-' + sectionId, true);
      const secWrapper = document.createElement('div');
      secWrapper.style.cssText = 'margin-bottom:16px;';

      const secHeader = document.createElement('div');
      secHeader.style.cssText = [
        'display:flex; align-items:center; gap:10px;',
        'padding:12px 16px;',
        'background:rgba(255,255,255,.06);',
        'border:1px solid rgba(255,255,255,.12);',
        'border-radius:' + (secExpanded ? '10px 10px 0 0' : '10px') + ';',
        'cursor:pointer; user-select:none;'
      ].join('');
      secHeader.setAttribute('aria-expanded', String(secExpanded));

      const secToggleIcon = document.createElement('span');
      secToggleIcon.style.cssText = 'font-size:13px; transition:transform .2s ease; display:inline-block; transform:rotate(' + (secExpanded ? '0deg' : '-90deg') + ');';
      secToggleIcon.textContent = '\u25be';

      const secTitle = document.createElement('span');
      secTitle.style.cssText = 'font-size:15px; font-weight:700; letter-spacing:.03em;';
      secTitle.textContent = sectionData.sectionName;

      const totalCount = [...sectionData.units.values()].reduce((n, u) => n + u.items.length, 0);
      const secBadge = document.createElement('span');
      secBadge.style.cssText = 'background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:12px; padding:2px 9px; font-size:12px;';
      secBadge.textContent = totalCount + ' finalized';

      secHeader.appendChild(secToggleIcon);
      secHeader.appendChild(createIcon('folder', 14));
      secHeader.appendChild(secTitle);
      secHeader.appendChild(secBadge);

      const secContent = document.createElement('div');
      secContent.style.cssText = [
        'display:' + (secExpanded ? 'block' : 'none') + ';',
        'border:1px solid rgba(255,255,255,.12); border-top:none;',
        'border-radius:0 0 10px 10px; padding:12px;',
        'background:rgba(255,255,255,.02);'
      ].join('');

      if (secExpanded) {
        const orderedUnitIds = [];
        if (lessonsData && Array.isArray(lessonsData.sections)) {
          lessonsData.sections.forEach(sec => {
            const sid = sec.name.toLowerCase().replace(/[\s/]+/g, '-').replace(/[^a-z0-9-]/g, '');
            if (sid === sectionId) {
              (sec.units || []).forEach(u => {
                if (sectionData.units.has(u.id)) orderedUnitIds.push(u.id);
              });
            }
          });
        }
        sectionData.units.forEach((_, uid) => {
          if (!orderedUnitIds.includes(uid)) orderedUnitIds.push(uid);
        });

        orderedUnitIds.forEach(uid => {
          const unitData = sectionData.units.get(uid);
          const unitExpanded = isHierarchyExpanded('fin-unit-' + uid, true);

          const unitWrapper = document.createElement('div');
          unitWrapper.style.cssText = 'margin-bottom:10px;';

          const unitHeader = document.createElement('div');
          unitHeader.style.cssText = [
            'display:flex; align-items:center; gap:8px; padding:8px 12px;',
            'background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);',
            'border-radius:' + (unitExpanded ? '8px 8px 0 0' : '8px') + ';',
            'cursor:pointer; user-select:none;'
          ].join('');
          unitHeader.setAttribute('aria-expanded', String(unitExpanded));

          const unitToggle = document.createElement('span');
          unitToggle.style.cssText = 'font-size:12px; transition:transform .2s; display:inline-block; transform:rotate(' + (unitExpanded ? '0deg' : '-90deg') + ');';
          unitToggle.textContent = '\u25be';

          const unitTitle = document.createElement('span');
          unitTitle.style.cssText = 'font-size:14px; font-weight:600;';
          unitTitle.textContent = unitData.unitName;

          // Compute unit stats (count + avg score)
          const unitScores = unitData.items.map(a => getAssignmentStats(a, instancesData, submissionsData).avgScore).filter(s => s != null);
          const unitAvg = unitScores.length > 0 ? Math.round(unitScores.reduce((s, v) => s + v, 0) / unitScores.length) : null;
          const unitBadge = document.createElement('span');
          unitBadge.style.cssText = 'background:rgba(96,165,250,.15); border:1px solid rgba(96,165,250,.25); border-radius:10px; padding:1px 8px; font-size:12px; color:#93c5fd;';
          unitBadge.textContent = unitData.items.length + ' finalized' + (unitAvg != null ? ' \u2022 avg ' + unitAvg + '%' : '');

          unitHeader.appendChild(unitToggle);
          unitHeader.appendChild(createIcon('checkCircle', 13));
          unitHeader.appendChild(unitTitle);
          unitHeader.appendChild(unitBadge);

          const unitContent = document.createElement('div');
          unitContent.style.cssText = [
            'display:' + (unitExpanded ? 'block' : 'none') + ';',
            'border:1px solid rgba(255,255,255,.08); border-top:none;',
            'border-radius:0 0 8px 8px; padding:10px;',
            'background:rgba(0,0,0,.1);'
          ].join('');

          if (unitExpanded) {
            unitData.items.forEach(a => unitContent.appendChild(renderFinalizedEntry(a)));
          }

          unitHeader.addEventListener('click', () => {
            hierarchyExpandState.set('fin-unit-' + uid, !unitExpanded);
            saveFilters();
            renderFinalizedTab();
          });

          unitWrapper.appendChild(unitHeader);
          unitWrapper.appendChild(unitContent);
          secContent.appendChild(unitWrapper);
        });
      }

      secHeader.addEventListener('click', () => {
        hierarchyExpandState.set('fin-section-' + sectionId, !secExpanded);
        saveFilters();
        renderFinalizedTab();
      });

      secWrapper.appendChild(secHeader);
      secWrapper.appendChild(secContent);
      return secWrapper;
    };

    orderedSectionIds.forEach(sid => {
      wrapper.appendChild(renderFinSectionAccordion(sid, sectionGroups.get(sid)));
    });

    // Uncategorized section
    const uncatExpanded = isHierarchyExpanded('fin-section-uncategorized', true);
    const uncatWrapper = document.createElement('div');
    uncatWrapper.style.cssText = 'margin-bottom:16px;';

    const uncatHeader = document.createElement('div');
    uncatHeader.style.cssText = [
      'display:flex; align-items:center; gap:10px; padding:12px 16px;',
      'background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12);',
      'border-radius:' + (uncatExpanded ? '10px 10px 0 0' : '10px') + ';',
      'cursor:pointer; user-select:none;'
    ].join('');
    uncatHeader.setAttribute('aria-expanded', String(uncatExpanded));

    const uncatToggle = document.createElement('span');
    uncatToggle.style.cssText = 'font-size:13px; transition:transform .2s; display:inline-block; transform:rotate(' + (uncatExpanded ? '0deg' : '-90deg') + ');';
    uncatToggle.textContent = '\u25be';

    const uncatTitle = document.createElement('span');
    uncatTitle.style.cssText = 'font-size:15px; font-weight:700; letter-spacing:.03em; color:rgba(255,255,255,.65);';
    uncatTitle.textContent = 'UNCATEGORIZED';

    const uncatBadge = document.createElement('span');
    uncatBadge.style.cssText = 'background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:12px; padding:2px 9px; font-size:12px;';
    uncatBadge.textContent = uncategorized.length + ' finalized';

    uncatHeader.appendChild(uncatToggle);
    uncatHeader.appendChild(createIcon('checkCircle', 14));
    uncatHeader.appendChild(uncatTitle);
    uncatHeader.appendChild(uncatBadge);

    const uncatContent = document.createElement('div');
    uncatContent.style.cssText = [
      'display:' + (uncatExpanded ? 'block' : 'none') + ';',
      'border:1px solid rgba(255,255,255,.12); border-top:none;',
      'border-radius:0 0 10px 10px; padding:12px;',
      'background:rgba(255,255,255,.02);'
    ].join('');

    if (uncatExpanded && uncategorized.length > 0) {
      uncategorized.forEach(a => uncatContent.appendChild(renderFinalizedEntry(a)));
    } else if (uncatExpanded) {
      const none = document.createElement('div');
      none.style.cssText = 'padding:16px; text-align:center; color:rgba(255,255,255,.40); font-size:13px;';
      none.textContent = 'All finalized assignments are cataloged.';
      uncatContent.appendChild(none);
    }

    uncatHeader.addEventListener('click', () => {
      hierarchyExpandState.set('fin-section-uncategorized', !uncatExpanded);
      saveFilters();
      renderFinalizedTab();
    });

    uncatWrapper.appendChild(uncatHeader);
    uncatWrapper.appendChild(uncatContent);
    wrapper.appendChild(uncatWrapper);

    return wrapper;
  }

  // ── Student Detail Modal ──────────────────────────────────────────────────────

  function showStudentDetail(studentCode, studentName) {
    const triggerEl = document.activeElement;

    const overlay = document.createElement('div');
    overlay.id = 'studentDetailOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'studentDetailModalTitle');
    overlay.style.cssText = [
      'position:fixed; top:0; left:0; right:0; bottom:0;',
      'background:rgba(0,0,0,.80); backdrop-filter:blur(4px);',
      'display:flex; align-items:center; justify-content:center;',
      'z-index:10000; padding:24px;'
    ].join('');

    function closeStudentModal() {
      overlay.remove();
      document.removeEventListener('keydown', handleKeyDown);
      if (triggerEl && triggerEl.focus) triggerEl.focus();
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); closeStudentModal(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeStudentModal(); });

    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'padding:28px; max-width:720px; width:100%; max-height:80vh; overflow-y:auto; position:relative;';
    card.addEventListener('click', e => e.stopPropagation());

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tc-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.style.cssText = 'position:absolute; top:16px; right:16px; padding:6px 8px;';
    closeBtn.appendChild(createIcon('x', 16));
    closeBtn.addEventListener('click', closeStudentModal);
    card.appendChild(closeBtn);

    const titleEl = document.createElement('h2');
    titleEl.id = 'studentDetailModalTitle';
    titleEl.style.cssText = 'margin:0 0 4px 0; font-size:20px;';
    titleEl.textContent = studentName || studentCode;
    card.appendChild(titleEl);

    const codeEl = document.createElement('div');
    codeEl.style.cssText = 'font-size:13px; color:rgba(255,255,255,.50); margin-bottom:20px;';
    codeEl.textContent = 'Code: ' + studentCode;
    card.appendChild(codeEl);

    // All finalized assignments for this student
    const finalizedForStudent = assignmentsData.filter(a => {
      if ((laneCache.get(a.id) ?? computeLane(a, instancesData)) !== 'finalized') return false;
      return instancesData.some(i => i.assignment_id === a.id && i.student_code === studentCode);
    });

    // Compute per-student scores
    const studentScores = finalizedForStudent.map(a => {
      const instIds = new Set(
        instancesData.filter(i => i.assignment_id === a.id && i.student_code === studentCode).map(i => i.id)
      );
      const sub = submissionsData.find(s => {
        const iid = s.instance_id || (s.assignment_instances && s.assignment_instances.id);
        return instIds.has(iid) && (s.score_total != null || s.score != null);
      });
      return sub ? (sub.score_total != null ? sub.score_total : sub.score) : null;
    }).filter(v => v != null);

    const avgScore = studentScores.length > 0
      ? Math.round(studentScores.reduce((a, b) => a + b, 0) / studentScores.length)
      : null;

    // Summary stats grid
    const summaryGrid = document.createElement('div');
    summaryGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;';

    const makeStatCell = (label, value, valueColor) => {
      const cell = document.createElement('div');
      cell.style.cssText = 'background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:14px;';
      const labelEl = document.createElement('div');
      labelEl.style.cssText = 'font-size:11px; color:rgba(255,255,255,.45); text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px;';
      labelEl.textContent = label;
      const valueEl = document.createElement('div');
      valueEl.style.cssText = 'font-size:20px; font-weight:600;' + (valueColor ? 'color:' + valueColor + ';' : '');
      valueEl.textContent = value;
      cell.appendChild(labelEl);
      cell.appendChild(valueEl);
      return cell;
    };

    summaryGrid.appendChild(makeStatCell('Total Finalized', String(finalizedForStudent.length)));
    if (avgScore != null) {
      summaryGrid.appendChild(makeStatCell('Avg Score', avgScore + '%', scoreColor(avgScore)));
    }
    card.appendChild(summaryGrid);

    if (finalizedForStudent.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'text-align:center; padding:24px; color:rgba(255,255,255,.40); font-size:14px;';
      emptyMsg.textContent = 'No finalized assignments found for this student.';
      card.appendChild(emptyMsg);
    } else {
      const sectionTitle = document.createElement('div');
      sectionTitle.style.cssText = 'font-size:12px; font-weight:600; color:rgba(255,255,255,.50); text-transform:uppercase; letter-spacing:.5px; margin-bottom:10px;';
      sectionTitle.textContent = 'Finalized Assignments';
      card.appendChild(sectionTitle);

      const tableWrap = document.createElement('div');
      tableWrap.style.cssText = 'overflow-x:auto;';
      const table = document.createElement('table');
      table.style.cssText = 'width:100%; border-collapse:collapse; font-size:13px;';

      const thead = document.createElement('thead');
      const hRow = document.createElement('tr');
      ['Title', 'Score', 'Date Finalized', 'Class'].forEach(colLabel => {
        const th = document.createElement('th');
        th.style.cssText = 'padding:8px 12px; text-align:left; font-size:12px; color:rgba(255,255,255,.50); border-bottom:1px solid rgba(255,255,255,.10); white-space:nowrap;';
        th.textContent = colLabel;
        hRow.appendChild(th);
      });
      thead.appendChild(hRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      finalizedForStudent.forEach((a, idx) => {
        const instIds = new Set(
          instancesData.filter(i => i.assignment_id === a.id && i.student_code === studentCode).map(i => i.id)
        );
        const sub = submissionsData.find(s => {
          const iid = s.instance_id || (s.assignment_instances && s.assignment_instances.id);
          return instIds.has(iid) && (s.score_total != null || s.score != null);
        });
        const score = sub ? (sub.score_total != null ? sub.score_total : sub.score) : null;
        const finalDate = getFinalizationDate(a, instancesData, submissionsData);
        const className = inferClassName(a);

        const tr = document.createElement('tr');
        tr.style.cssText = 'cursor:pointer;' + (idx % 2 === 1 ? 'background:rgba(255,255,255,.02);' : '');
        tr.addEventListener('click', () => {
          closeStudentModal();
          showAssignmentDetail(a.id);
        });

        const cs = 'padding:8px 12px; border-bottom:1px solid rgba(255,255,255,.04); vertical-align:middle;';

        const tdTitle = document.createElement('td');
        tdTitle.style.cssText = cs;
        tdTitle.textContent = a.title || 'Untitled';
        tr.appendChild(tdTitle);

        const tdScore = document.createElement('td');
        tdScore.style.cssText = cs;
        if (score != null) {
          tdScore.style.color = scoreColor(score);
          tdScore.style.fontWeight = '600';
          tdScore.textContent = score + '%';
        } else {
          tdScore.style.color = 'rgba(255,255,255,.30)';
          tdScore.textContent = '\u2014';
        }
        tr.appendChild(tdScore);

        const tdDate = document.createElement('td');
        tdDate.style.cssText = cs + 'color:rgba(255,255,255,.60); white-space:nowrap;';
        tdDate.textContent = finalDate.toLocaleDateString();
        tr.appendChild(tdDate);

        const tdClass = document.createElement('td');
        tdClass.style.cssText = cs;
        if (className) {
          tdClass.appendChild(createClassBadgeSpan(className));
        } else {
          tdClass.style.color = 'rgba(255,255,255,.30)';
          tdClass.textContent = '\u2014';
        }
        tr.appendChild(tdClass);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      card.appendChild(tableWrap);
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    closeBtn.focus();
  }

  // ── Overview Tab ──────────────────────────────────────────────────────────────

  function renderOverviewTab() {
    const container = $('overviewTab');
    if (!container) return;
    try {
      container.innerHTML = '';

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
      const makeKpiLabel = (iconName, text) => {
        const span = document.createElement('span');
        span.style.cssText = 'display:inline-flex; align-items:center; gap:6px;';
        span.appendChild(createIcon(iconName, 14));
        span.appendChild(document.createTextNode(text));
        return span;
      };
      kpiGrid.appendChild(renderKPI(makeKpiLabel('clipboard', 'Reserve'), kpis.upcomingCount));
      kpiGrid.appendChild(renderKPI(makeKpiLabel('refreshCw', 'Active'), kpis.currentCount, '#60a5fa'));
      kpiGrid.appendChild(renderKPI(makeKpiLabel('checkCircle', 'Finalized'), kpis.finalizedCount, '#4ade80'));
      const avgColor = kpis.avgScore != null ? scoreColor(kpis.avgScore) : 'rgba(255,255,255,.40)';
      kpiGrid.appendChild(renderKPI(makeKpiLabel('barChart', 'Avg Score'), kpis.avgScore != null ? kpis.avgScore + '%' : null, avgColor));
      container.appendChild(kpiGrid);

      // Analytics section
      const filtered = filterAssignments();
      const upcomingList  = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'upcoming'));
      const currentList   = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'current'));
      const finalizedList = sortAssignments(filtered.filter(a => (laneCache.get(a.id) ?? computeLane(a, instancesData)) === 'finalized'));
      container.appendChild(renderAnalyticsSection(filtered, upcomingList, currentList, finalizedList));

      // Pre-compute weekly data once for both charts
      const weekMap = new Map(); // weekLabel → { count, scores, date }
      finalizedList.forEach(a => {
        const date = getFinalizationDate(a, instancesData, submissionsData);
        const label = getWeekLabel(date);
        if (!weekMap.has(label)) weekMap.set(label, { count: 0, scores: [], date });
        const entry = weekMap.get(label);
        entry.count++;
        const stats = getAssignmentStats(a, instancesData, submissionsData);
        if (stats.avgScore != null) entry.scores.push(stats.avgScore);
      });
      const weekEntries = [...weekMap.entries()]
        .sort((a, b) => a[1].date - b[1].date)
        .slice(-12);

      // Charts row (2-column on desktop, 1-column on mobile)
      const chartsRow = document.createElement('div');
      chartsRow.className = 'tc-lib-charts-row';
      chartsRow.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;';
      chartsRow.appendChild(renderFinalizedPerWeekChart(weekEntries));
      chartsRow.appendChild(renderAvgScoreTrendChart(weekEntries));
      container.appendChild(chartsRow);

      // Per-Class Breakdown (collapsible)
      container.appendChild(renderPerClassBreakdown());
    } catch (err) {
      console.error('[tc-library] Error rendering Overview tab:', err);
      container.innerHTML = '';
      const errCard = document.createElement('div');
      errCard.className = 'tc-card';
      errCard.style.cssText = 'padding:32px; text-align:center; color:rgba(255,255,255,.7);';
      const p = document.createElement('p');
      p.textContent = 'Something went wrong rendering this section.';
      errCard.appendChild(p);
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tc-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.style.marginTop = '16px';
      retryBtn.addEventListener('click', () => renderOverviewTab());
      errCard.appendChild(retryBtn);
      container.appendChild(errCard);
    }
  }

  // ── Overview Charts & Per-Class Breakdown ────────────────────────────────────

  /** Abbreviate "Week of Apr 7 – 11" → "Apr 7" for axis labels. */
  function abbrevWeekLabel(label) {
    const m = label.match(/^Week of (\w+ \d+)/);
    return m ? m[1] : label;
  }

  /**
   * Renders a vertical SVG bar chart showing finalized assignments per week.
   * @param {Array<[string, {count:number, scores:number[], date:Date}]>} weekEntries
   */
  function renderFinalizedPerWeekChart(weekEntries) {
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'padding:16px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,.45); margin-bottom:12px; display:flex; align-items:center; gap:6px;';
    titleEl.appendChild(createIcon('barChart', 13));
    titleEl.appendChild(document.createTextNode(' Assignments Finalized Per Week'));
    card.appendChild(titleEl);

    if (weekEntries.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:rgba(255,255,255,.40); font-size:13px; padding:20px 0; text-align:center;';
      empty.textContent = 'No finalized assignments to chart.';
      card.appendChild(empty);
      return card;
    }

    const NS = 'http://www.w3.org/2000/svg';
    const W = 460, H = 220;
    const ML = 36, MR = 10, MT = 16, MB = 48;
    const chartW = W - ML - MR;
    const chartH = H - MT - MB;

    const maxCount = Math.max(1, ...weekEntries.map(([, d]) => d.count));
    const n = weekEntries.length;
    const gap = 3;
    const barW = Math.max(6, (chartW - (n - 1) * gap) / n);

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + String(W) + ' ' + String(H));
    svg.setAttribute('width', '100%');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Finalized assignments per week bar chart');

    // Y-axis gridlines and tick labels
    const ySteps = Math.min(maxCount, 5);
    for (let i = 0; i <= ySteps; i++) {
      const yVal = Math.round(maxCount * i / ySteps);
      const yPos = MT + chartH - (yVal / maxCount) * chartH;

      const gridLine = document.createElementNS(NS, 'line');
      gridLine.setAttribute('x1', String(ML));
      gridLine.setAttribute('y1', String(yPos));
      gridLine.setAttribute('x2', String(ML + chartW));
      gridLine.setAttribute('y2', String(yPos));
      gridLine.setAttribute('stroke', 'rgba(255,255,255,.08)');
      gridLine.setAttribute('stroke-width', '1');
      svg.appendChild(gridLine);

      const yLabel = document.createElementNS(NS, 'text');
      yLabel.setAttribute('x', String(ML - 5));
      yLabel.setAttribute('y', String(yPos + 4));
      yLabel.setAttribute('text-anchor', 'end');
      yLabel.setAttribute('font-size', '10');
      yLabel.setAttribute('fill', 'rgba(255,255,255,.45)');
      yLabel.textContent = String(yVal);
      svg.appendChild(yLabel);
    }

    // X-axis baseline
    const xAxis = document.createElementNS(NS, 'line');
    xAxis.setAttribute('x1', String(ML));
    xAxis.setAttribute('y1', String(MT + chartH));
    xAxis.setAttribute('x2', String(ML + chartW));
    xAxis.setAttribute('y2', String(MT + chartH));
    xAxis.setAttribute('stroke', 'rgba(255,255,255,.20)');
    xAxis.setAttribute('stroke-width', '1');
    svg.appendChild(xAxis);

    // Bars and labels
    weekEntries.forEach(([label, data], i) => {
      const barH = data.count > 0 ? (data.count / maxCount) * chartH : 0;
      const x = ML + i * (barW + gap);
      const y = MT + chartH - barH;

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(barW));
      rect.setAttribute('height', String(Math.max(0, barH)));
      rect.setAttribute('fill', '#60a5fa');
      rect.setAttribute('rx', '2');

      const barTitle = document.createElementNS(NS, 'title');
      barTitle.textContent = abbrevWeekLabel(label) + ': ' + String(data.count);
      rect.appendChild(barTitle);
      svg.appendChild(rect);

      // Count label above bar
      if (data.count > 0) {
        const countText = document.createElementNS(NS, 'text');
        countText.setAttribute('x', String(x + barW / 2));
        countText.setAttribute('y', String(y - 3));
        countText.setAttribute('text-anchor', 'middle');
        countText.setAttribute('font-size', '9');
        countText.setAttribute('fill', 'white');
        countText.textContent = String(data.count);
        svg.appendChild(countText);
      }

      // X-axis label
      const xLabel = document.createElementNS(NS, 'text');
      xLabel.setAttribute('x', String(x + barW / 2));
      xLabel.setAttribute('y', String(MT + chartH + 13));
      xLabel.setAttribute('text-anchor', 'middle');
      xLabel.setAttribute('font-size', '9');
      xLabel.setAttribute('fill', 'rgba(255,255,255,.45)');
      xLabel.textContent = abbrevWeekLabel(label);
      svg.appendChild(xLabel);
    });

    card.appendChild(svg);
    return card;
  }

  /**
   * Renders a pure SVG line chart of weekly average scores.
   * @param {Array<[string, {count:number, scores:number[], date:Date}]>} weekEntries
   */
  function renderAvgScoreTrendChart(weekEntries) {
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'padding:16px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,.45); margin-bottom:12px; display:flex; align-items:center; gap:6px;';
    titleEl.appendChild(createIcon('arrowRight', 13));
    titleEl.appendChild(document.createTextNode(' Average Score Trend'));
    card.appendChild(titleEl);

    const scoredEntries = weekEntries
      .filter(([, weekData]) => weekData.scores.length > 0)
      .map(([label, weekData]) => {
        const avg = Math.round(weekData.scores.reduce((a, b) => a + b, 0) / weekData.scores.length);
        return [label, avg];
      });

    if (scoredEntries.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:rgba(255,255,255,.40); font-size:13px; padding:20px 0; text-align:center;';
      empty.textContent = 'No score data available.';
      card.appendChild(empty);
      return card;
    }

    const NS = 'http://www.w3.org/2000/svg';
    const W = 460, H = 220;
    const ML = 36, MR = 10, MT = 16, MB = 48;
    const chartW = W - ML - MR;
    const chartH = H - MT - MB;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + String(W) + ' ' + String(H));
    svg.setAttribute('width', '100%');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Average score trend line chart');

    // Y-axis gridlines (0–100 in 20% increments)
    for (let v = 0; v <= 100; v += 20) {
      const yPos = MT + chartH - (v / 100) * chartH;

      const gridLine = document.createElementNS(NS, 'line');
      gridLine.setAttribute('x1', String(ML));
      gridLine.setAttribute('y1', String(yPos));
      gridLine.setAttribute('x2', String(ML + chartW));
      gridLine.setAttribute('y2', String(yPos));
      gridLine.setAttribute('stroke', 'rgba(255,255,255,.08)');
      gridLine.setAttribute('stroke-width', '1');
      svg.appendChild(gridLine);

      const yLabel = document.createElementNS(NS, 'text');
      yLabel.setAttribute('x', String(ML - 5));
      yLabel.setAttribute('y', String(yPos + 4));
      yLabel.setAttribute('text-anchor', 'end');
      yLabel.setAttribute('font-size', '10');
      yLabel.setAttribute('fill', 'rgba(255,255,255,.45)');
      yLabel.textContent = String(v) + '%';
      svg.appendChild(yLabel);
    }

    // X-axis baseline
    const xAxis = document.createElementNS(NS, 'line');
    xAxis.setAttribute('x1', String(ML));
    xAxis.setAttribute('y1', String(MT + chartH));
    xAxis.setAttribute('x2', String(ML + chartW));
    xAxis.setAttribute('y2', String(MT + chartH));
    xAxis.setAttribute('stroke', 'rgba(255,255,255,.20)');
    xAxis.setAttribute('stroke-width', '1');
    svg.appendChild(xAxis);

    // 80% proficiency reference line (dashed, gray)
    const refY = MT + chartH - 0.8 * chartH;
    const refLine = document.createElementNS(NS, 'line');
    refLine.setAttribute('x1', String(ML));
    refLine.setAttribute('y1', String(refY));
    refLine.setAttribute('x2', String(ML + chartW));
    refLine.setAttribute('y2', String(refY));
    refLine.setAttribute('stroke', 'rgba(255,255,255,.25)');
    refLine.setAttribute('stroke-width', '1');
    refLine.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(refLine);

    const refLabel = document.createElementNS(NS, 'text');
    refLabel.setAttribute('x', String(ML + chartW + 3));
    refLabel.setAttribute('y', String(refY + 4));
    refLabel.setAttribute('font-size', '9');
    refLabel.setAttribute('fill', 'rgba(255,255,255,.30)');
    refLabel.textContent = '80%';
    svg.appendChild(refLabel);

    // Compute x positions
    const n = scoredEntries.length;
    const xPos = (i) => n === 1
      ? ML + chartW / 2
      : ML + i * (chartW / (n - 1));
    const yPos = (avg) => MT + chartH - (avg / 100) * chartH;

    // Polyline (line chart)
    const pointsStr = scoredEntries.map(([, avg], i) =>
      String(xPos(i)) + ',' + String(yPos(avg))
    ).join(' ');
    const polyline = document.createElementNS(NS, 'polyline');
    polyline.setAttribute('points', pointsStr);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#4ade80');
    polyline.setAttribute('stroke-width', '2');
    polyline.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(polyline);

    // Dots and X-axis labels
    scoredEntries.forEach(([label, avg], i) => {
      const cx = xPos(i);
      const cy = yPos(avg);

      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', '#4ade80');

      const dotTitle = document.createElementNS(NS, 'title');
      dotTitle.textContent = abbrevWeekLabel(label) + ': ' + String(avg) + '%';
      circle.appendChild(dotTitle);
      svg.appendChild(circle);

      // X-axis label
      const xLabel = document.createElementNS(NS, 'text');
      xLabel.setAttribute('x', String(cx));
      xLabel.setAttribute('y', String(MT + chartH + 13));
      xLabel.setAttribute('text-anchor', 'middle');
      xLabel.setAttribute('font-size', '9');
      xLabel.setAttribute('fill', 'rgba(255,255,255,.45)');
      xLabel.textContent = abbrevWeekLabel(label);
      svg.appendChild(xLabel);
    });

    card.appendChild(svg);
    return card;
  }

  /**
   * Renders a collapsible per-class KPI breakdown section.
   */
  function renderPerClassBreakdown() {
    const laneId = 'perClassBreakdown';
    const expanded = isLaneExpanded(laneId);

    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:16px;';

    // Collapsible header
    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex; align-items:center; gap:10px; padding:10px 16px;',
      'background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10);',
      'border-radius:' + (expanded ? '10px 10px 0 0' : '10px') + '; cursor:pointer; user-select:none;',
      'transition:background .15s ease;'
    ].join('');
    header.setAttribute('aria-expanded', String(expanded));

    const toggleIcon = document.createElement('span');
    toggleIcon.style.cssText = 'font-size:13px; display:inline-block; transform:rotate(' + (expanded ? '0deg' : '-90deg') + '); transition:transform .2s;';
    toggleIcon.textContent = '\u25be';
    header.appendChild(toggleIcon);

    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'display:inline-flex; align-items:center; gap:6px; font-size:14px; font-weight:600;';
    titleEl.appendChild(createIcon('users'));
    titleEl.appendChild(document.createTextNode(' Per-Class Breakdown'));
    header.appendChild(titleEl);

    header.addEventListener('click', () => toggleLane(laneId));
    section.appendChild(header);

    if (!expanded) return section;

    // Content card
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'padding:16px; border-top:none; border-radius:0 0 10px 10px;';

    // Pre-compute per-class metrics from all assignments (not filtered)
    const classDataMap = new Map();
    CANON_CLASSES.forEach(cls => {
      classDataMap.set(cls, { upcoming: 0, current: 0, finalized: 0, scores: [] });
    });
    assignmentsData.forEach(a => {
      const cls = inferClassName(a);
      if (!cls || !classDataMap.has(cls)) return;
      const lane = (laneCache.get(a.id) ?? computeLane(a, instancesData));
      const classMetrics = classDataMap.get(cls);
      if (lane === 'upcoming') {
        classMetrics.upcoming++;
      } else if (lane === 'current') {
        classMetrics.current++;
      } else if (lane === 'finalized') {
        classMetrics.finalized++;
        const stats = getAssignmentStats(a, instancesData, submissionsData);
        if (stats.avgScore != null) classMetrics.scores.push(stats.avgScore);
      }
    });

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;';

    CANON_CLASSES.forEach(cls => {
      const classMetrics = classDataMap.get(cls);
      const total = classMetrics.upcoming + classMetrics.current + classMetrics.finalized;
      const avgScore = classMetrics.scores.length > 0
        ? Math.round(classMetrics.scores.reduce((a, b) => a + b, 0) / classMetrics.scores.length)
        : null;
      const enrolledCount = classEnrollmentsData.filter(
        e => e.class_name === cls && e.active !== false
      ).length;

      const classCard = document.createElement('div');
      classCard.className = 'tc-card';
      classCard.style.cssText = 'padding:14px;' + (total === 0 ? ' opacity:.45;' : '');

      // Class name header
      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'font-size:13px; font-weight:700; margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
      nameEl.textContent = cls;
      nameEl.title = cls;
      classCard.appendChild(nameEl);

      // Student count
      const studEl = document.createElement('div');
      studEl.style.cssText = 'font-size:11px; color:rgba(255,255,255,.50); margin-bottom:10px; display:flex; align-items:center; gap:4px;';
      studEl.appendChild(createIcon('users', 11));
      studEl.appendChild(document.createTextNode(' ' + String(enrolledCount) + ' student' + (enrolledCount !== 1 ? 's' : '')));
      classCard.appendChild(studEl);

      // KPI pills row
      const pillRow = document.createElement('div');
      pillRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:5px;';

      const makeClickablePill = (labelText, valueText, color, tabName) => {
        const pill = document.createElement('button');
        pill.style.cssText = 'display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border-radius:10px; font-size:11px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); color:' + (color || 'rgba(255,255,255,.80)') + '; cursor:pointer;';
        pill.textContent = labelText + ': ' + valueText;
        if (tabName) {
          pill.title = 'View ' + cls + ' in ' + tabName + ' tab';
          pill.addEventListener('click', (e) => {
            e.stopPropagation();
            if (tabName === 'finalized') {
              filters.finalized.classFilter = cls;
            } else {
              filters.assignments.classFilter = cls;
            }
            saveFilters();
            switchTab(tabName);
          });
        }
        return pill;
      };

      const makeStaticPill = (labelText, valueText, color) => {
        const pill = document.createElement('span');
        pill.style.cssText = 'display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border-radius:10px; font-size:11px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); color:' + (color || 'rgba(255,255,255,.80)') + ';';
        pill.textContent = labelText + ': ' + valueText;
        return pill;
      };

      pillRow.appendChild(makeClickablePill('R', String(classMetrics.upcoming), 'rgba(255,255,255,.70)', 'reserve'));
      pillRow.appendChild(makeClickablePill('A', String(classMetrics.current), '#60a5fa', 'active'));
      pillRow.appendChild(makeClickablePill('F', String(classMetrics.finalized), '#4ade80', 'finalized'));
      if (avgScore != null) {
        pillRow.appendChild(makeStaticPill('Avg', String(avgScore) + '%', scoreColor(avgScore)));
      } else {
        pillRow.appendChild(makeStaticPill('Avg', '\u2014', 'rgba(255,255,255,.35)'));
      }

      classCard.appendChild(pillRow);
      grid.appendChild(classCard);
    });

    card.appendChild(grid);
    section.appendChild(card);
    return section;
  }

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
    try {
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
      const emptyCard = document.createElement('div');
      emptyCard.className = 'tc-card';
      emptyCard.style.cssText = 'text-align: center; padding: 48px 24px;';
      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:16px; color:rgba(255,255,255,.40);';
      iconWrap.appendChild(createIcon('bookOpen', 48));
      const heading = document.createElement('h3');
      heading.style.cssText = 'margin: 0 0 8px 0; font-size: 20px;';
      heading.textContent = 'Lessons index not available';
      const msg = document.createElement('p');
      msg.style.cssText = 'margin: 0; color: rgba(255,255,255,.60);';
      msg.textContent = 'Run the generator script to build the lessons index.';
      emptyCard.appendChild(iconWrap);
      emptyCard.appendChild(heading);
      emptyCard.appendChild(msg);
      container.appendChild(emptyCard);
    } else {
      const filteredSections = filterLessons();
      if (filteredSections.length === 0) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'tc-card';
        emptyCard.style.cssText = 'text-align: center; padding: 48px 24px;';
        const iconWrap = document.createElement('div');
        iconWrap.style.cssText = 'display:flex; justify-content:center; margin-bottom:16px; color:rgba(255,255,255,.40);';
        iconWrap.appendChild(createIcon('search', 32));
        const msg = document.createElement('p');
        msg.style.cssText = 'margin: 0; color: rgba(255,255,255,.60);';
        msg.textContent = 'No lessons match your search.';
        emptyCard.appendChild(iconWrap);
        emptyCard.appendChild(msg);
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
    } catch (err) {
      console.error('[tc-library] Error rendering lessons tab:', err);
      container.textContent = '';
      const errorCard = document.createElement('div');
      errorCard.className = 'tc-card';
      errorCard.style.cssText = 'text-align:center; padding:32px 24px; color:rgba(255,255,255,.7);';
      const msg = document.createElement('p');
      msg.textContent = 'Something went wrong rendering this section.';
      errorCard.appendChild(msg);
      const detail = document.createElement('p');
      detail.style.cssText = 'font-size:12px; color:rgba(255,255,255,.4); margin-top:8px;';
      detail.textContent = err.message || 'Unknown error';
      errorCard.appendChild(detail);
      const retryBtn = document.createElement('button');
      retryBtn.className = 'tc-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.style.marginTop = '16px';
      retryBtn.addEventListener('click', () => renderLessonsTab());
      errorCard.appendChild(retryBtn);
      container.appendChild(errorCard);
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
    toggleBtn.setAttribute('aria-expanded', 'false');
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
    toggleBtn.setAttribute('aria-expanded', 'false');
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

    // Class filter buttons (shared between reserve/active tabs)
    document.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('.tc-lib-class-filter');
      if (filterBtn) {
        filters.assignments.classFilter = filterBtn.dataset.class;
        refreshCurrentTab();
        saveFilters();
      }
    });

    // Finalized tab class filter buttons
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.tc-lib-fin-class-filter');
      if (btn) {
        filters.finalized.classFilter = btn.dataset.class;
        renderFinalizedTab();
        saveFilters();
      }
    });

    // Lane header collapse/expand
    document.addEventListener('click', (e) => {
      const laneHeader = e.target.closest('.tc-lib-lane-header');
      if (laneHeader) {
        const laneId = laneHeader.dataset.lane;
        if (laneId) { toggleLane(laneId); saveFilters(); }
      }
    });

    // Hierarchy node collapse/expand
    document.addEventListener('click', (e) => {
      const hierNode = e.target.closest('.tc-hier-node');
      if (hierNode) {
        const nodeId = hierNode.dataset.hierNode;
        if (nodeId) { toggleHierarchy(nodeId); saveFilters(); }
      }
    });

    // Assignment search
    const _debouncedRefreshWithSave = debounce(() => { refreshCurrentTab(); saveFilters(); }, 250);
    const _debouncedFinalizedTabWithSave = debounce(() => { renderFinalizedTab(); saveFilters(); }, 250);
    const _debouncedLessonsTabWithSave = debounce(() => { renderLessonsTab(); saveFilters(); }, 250);

    document.addEventListener('input', (e) => {
      if (e.target.id === 'assignmentSearch') {
        filters.assignments.searchQuery = e.target.value;
        _debouncedRefreshWithSave();
      }
      // Finalized tab student filter
      if (e.target.id === 'finalizedStudentFilter') {
        filters.finalized.studentFilter = e.target.value;
        _debouncedFinalizedTabWithSave();
      }
      // Finalized tab week filter
      if (e.target.id === 'finalizedWeekFilter') {
        filters.finalized.weekFilter = e.target.value;
        _debouncedFinalizedTabWithSave();
      }
    });

    // Type filter / sort (reserve/assignments tab)
    document.addEventListener('change', (e) => {
      if (e.target.id === 'assignmentTypeFilter') {
        filters.assignments.typeFilter = e.target.value;
        refreshCurrentTab();
        saveFilters();
      }
      if (e.target.id === 'assignmentSortBy') {
        filters.assignments.sortBy = e.target.value;
        refreshCurrentTab();
        saveFilters();
      }
      // Finalized tab date range filters
      if (e.target.id === 'finalizedDateFrom') {
        filters.finalized.dateFrom = e.target.value;
        renderFinalizedTab();
        saveFilters();
      }
      if (e.target.id === 'finalizedDateTo') {
        filters.finalized.dateTo = e.target.value;
        renderFinalizedTab();
        saveFilters();
      }
    });

    // Lesson search
    document.addEventListener('input', (e) => {
      if (e.target.id === 'lessonSearch') {
        filters.lessons.searchQuery = e.target.value;
        _debouncedLessonsTabWithSave();
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
          toggle.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
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
          showAssignmentDetail(card.dataset.id);
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

    // Evidence Report button
    const evidenceBtn = $('evidenceReportBtn');
    if (evidenceBtn) evidenceBtn.addEventListener('click', openEvidenceReportModal);

    // Keyboard shortcuts hint button
    const shortcutsBtn = $('keyboardShortcutsBtn');
    if (shortcutsBtn) shortcutsBtn.addEventListener('click', () => showKeyboardShortcutsModal());

    // Global keyboard shortcuts
    const TAB_KEY_MAP = { '1': 'reserve', '2': 'active', '3': 'finalized', '4': 'overview', '5': 'lessons', '6': 'recallLibrary' };
    document.addEventListener('keydown', (e) => {
      // Skip if a modifier key is held
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' ||
        (document.activeElement && document.activeElement.getAttribute('contenteditable') != null &&
          document.activeElement.getAttribute('contenteditable') !== 'false');

      if (e.key === 'Escape') {
        // Clear and blur known search inputs when focused
        if (isEditable) {
          const active = document.activeElement;
          if (active && (active.id === 'assignmentSearch' || active.id === 'lessonSearch' || active.id === 'recallLibrarySearch')) {
            active.value = '';
            active.dispatchEvent(new Event('input', { bubbles: true }));
            active.blur();
            e.preventDefault();
          }
        }
        return;
      }

      // All remaining shortcuts require no input to be focused
      if (isEditable) return;

      if (TAB_KEY_MAP[e.key]) {
        e.preventDefault();
        switchTab(TAB_KEY_MAP[e.key]);
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        // Find the visible search input on the current tab
        const searchIds = ['assignmentSearch', 'lessonSearch', 'recallLibrarySearch'];
        let focusTarget = null;
        for (const id of searchIds) {
          const el = document.getElementById(id);
          if (el && el.offsetParent !== null) { focusTarget = el; break; }
        }
        if (focusTarget) focusTarget.focus();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        showKeyboardShortcutsModal();
      }
    });
  }

  // ── Keyboard Shortcuts Modal ─────────────────────────────────────────────────

  function showKeyboardShortcutsModal() {
    if (document.getElementById('keyboardShortcutsOverlay')) return;
    const triggerEl = document.activeElement;

    const overlay = document.createElement('div');
    overlay.id = 'keyboardShortcutsOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'kbShortcutsTitle');
    overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.80); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:10001; padding:24px;';

    function closeModal() {
      overlay.remove();
      document.removeEventListener('keydown', onKbKeyDown);
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
    }

    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width:480px; width:100%; padding:28px; display:flex; flex-direction:column; gap:16px;';

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';

    const titleEl = document.createElement('h2');
    titleEl.id = 'kbShortcutsTitle';
    titleEl.style.cssText = 'margin:0; font-size:18px;';
    titleEl.textContent = 'Keyboard Shortcuts';
    headerRow.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.id = 'closeKbShortcutsBtn';
    closeBtn.className = 'tc-btn';
    closeBtn.style.cssText = 'padding:6px; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center;';
    closeBtn.setAttribute('aria-label', 'Close keyboard shortcuts');
    closeBtn.appendChild(createIcon('x', 16));
    closeBtn.addEventListener('click', closeModal);
    headerRow.appendChild(closeBtn);
    card.appendChild(headerRow);

    const shortcutsList = [
      ['1', 'Switch to Reserve tab'],
      ['2', 'Switch to Active tab'],
      ['3', 'Switch to Finalized tab'],
      ['4', 'Switch to Overview tab'],
      ['5', 'Switch to Lessons tab'],
      ['6', 'Switch to Recall Library tab'],
      ['/', 'Focus search on current tab'],
      ['Escape', 'Clear search and blur'],
      ['?', 'Show this help modal'],
    ];

    const table = document.createElement('table');
    table.style.cssText = 'width:100%; border-collapse:collapse; font-size:14px;';
    shortcutsList.forEach(([key, desc]) => {
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom:1px solid rgba(255,255,255,.07);';
      const tdKey = document.createElement('td');
      tdKey.style.cssText = 'padding:8px 12px 8px 0; width:90px; font-family:monospace;';
      const kbd = document.createElement('kbd');
      kbd.style.cssText = 'display:inline-block; background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.20); border-radius:5px; padding:2px 8px; font-size:13px; font-family:monospace; white-space:nowrap;';
      kbd.textContent = key;
      tdKey.appendChild(kbd);
      const tdDesc = document.createElement('td');
      tdDesc.style.cssText = 'padding:8px 0; color:rgba(255,255,255,.80);';
      tdDesc.textContent = desc;
      tr.appendChild(tdKey);
      tr.appendChild(tdDesc);
      table.appendChild(tr);
    });
    card.appendChild(table);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    closeBtn.focus();

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    function onKbKeyDown(e) {
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = Array.from(card.querySelectorAll('button:not([disabled]):not([hidden]), input:not([hidden]), [tabindex]:not([tabindex="-1"])'))
          .filter(el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
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
    }
    document.addEventListener('keydown', onKbKeyDown);
  }

  // ── Assignment Detail Modal ───────────────────────────────────────────────────

  function showAssignmentDetail(assignmentId) {
    const assignment = assignmentsData.find(a => a.id === assignmentId);
    if (!assignment) return;

    const triggerEl = document.activeElement;

    const overlay = document.createElement('div');
    overlay.id = 'assignmentDetailOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'detailModalTitle');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.80); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 24px;
    `;

    function closeModal() {
      overlay.remove();
      document.removeEventListener('keydown', onDetailKeyDown);
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
    }

    const createdDate = assignment.created_at
      ? new Date(assignment.created_at).toLocaleString()
      : 'Unknown';

    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px;';

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px;';
    const titleEl = document.createElement('h2');
    titleEl.id = 'detailModalTitle';
    titleEl.style.cssText = 'margin: 0; font-size: 24px;';
    titleEl.textContent = assignment.title || 'Untitled';
    const closeBtn = document.createElement('button');
    closeBtn.id = 'closeDetailBtn';
    closeBtn.className = 'tc-btn';
    closeBtn.style.cssText = 'padding: 8px 16px;';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.textContent = '\u2715 Close';
    headerRow.appendChild(titleEl);
    headerRow.appendChild(closeBtn);
    card.appendChild(headerRow);

    // Loading shimmer — shown immediately, replaced after stats compute
    const shimmerGrid = document.createElement('div');
    shimmerGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:24px;';
    for (let i = 0; i < 4; i++) {
      const cell = document.createElement('div');
      cell.className = 'tc-lib-shimmer';
      cell.style.cssText = 'height:48px; border-radius:8px;';
      shimmerGrid.appendChild(cell);
    }
    card.appendChild(shimmerGrid);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    closeBtn.focus();

    requestAnimationFrame(() => {
      shimmerGrid.remove();

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

      if (assignment.series) grid.appendChild(makeDetailRow('Class', assignment.series));
      grid.appendChild(makeDetailRow('Created', createdDate));

      const lane = (laneCache.get(assignment.id) ?? computeLane(assignment, instancesData));
      const laneTextMap = { upcoming: 'Upcoming', current: 'Active', finalized: 'Finalized' };
      grid.appendChild(makeDetailRow('Status', laneTextMap[lane] || lane));

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

      // ── Catalog Section: Unit Picker + Tags ───────────────────────────────
      const catalogSection = document.createElement('div');
      catalogSection.style.cssText = 'border-top:1px solid rgba(255,255,255,.10); margin:16px 0; padding-top:16px;';

      const catalogHeading = document.createElement('div');
      catalogHeading.style.cssText = 'font-size:14px; font-weight:600; color:rgba(255,255,255,.70); margin-bottom:12px; display:flex; align-items:center; gap:6px;';
      catalogHeading.appendChild(createIcon('folderOpen', 14));
      catalogHeading.appendChild(document.createTextNode(' Catalog'));
      catalogSection.appendChild(catalogHeading);

      // Unit picker
      const unitRow = document.createElement('div');
      unitRow.style.cssText = 'margin-bottom:14px;';
      const unitLbl = document.createElement('div');
      unitLbl.style.cssText = 'font-size:13px; color:rgba(255,255,255,.55); margin-bottom:6px;';
      unitLbl.textContent = 'Unit';
      unitRow.appendChild(unitLbl);

      const unitSelect = document.createElement('select');
      unitSelect.style.cssText = 'width:100%; padding:8px 10px; background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.20); border-radius:8px; color:white; font-size:13px;';

      const blankUnitOpt = document.createElement('option');
      blankUnitOpt.value = '';
      blankUnitOpt.textContent = 'Uncategorized';
      unitSelect.appendChild(blankUnitOpt);

      if (lessonsData && Array.isArray(lessonsData.sections)) {
        lessonsData.sections.forEach(section => {
          const group = document.createElement('optgroup');
          group.label = section.name;
          (section.units || []).forEach(unit => {
            const opt = document.createElement('option');
            opt.value = unit.id;
            opt.textContent = unit.name;
            group.appendChild(opt);
          });
          unitSelect.appendChild(group);
        });
      }
      unitSelect.value = assignment.unit_id || '';
      unitRow.appendChild(unitSelect);
      catalogSection.appendChild(unitRow);

      unitSelect.addEventListener('change', async () => {
        const newUnitId = unitSelect.value || null;
        const unitInfo = newUnitId ? getUnitInfo(newUnitId) : null;
        const newSectionId = unitInfo ? unitInfo.sectionId : null;
        const idx = assignmentsData.findIndex(a => a.id === assignment.id);
        const snapshot = idx !== -1 ? { ...assignmentsData[idx] } : null;
        if (idx !== -1) {
          assignmentsData[idx].unit_id = newUnitId;
          assignmentsData[idx].section_id = newSectionId;
        }
        try {
          await db.updateAssignment(assignment.id, { unit_id: newUnitId, section_id: newSectionId });
          showToast('Unit updated');
        } catch (err) {
          console.error('[tc-library] Failed to update unit:', err);
          if (idx !== -1 && snapshot) assignmentsData[idx] = snapshot;
          showToast('Failed to update unit', '#ef4444', '#fff');
        }
      });

      // Tag input
      const tagsRow = document.createElement('div');
      const tagsLbl = document.createElement('div');
      tagsLbl.style.cssText = 'font-size:13px; color:rgba(255,255,255,.55); margin-bottom:6px;';
      tagsLbl.textContent = 'Tags';
      tagsRow.appendChild(tagsLbl);

      const currentTags = Array.isArray(assignment.tags) ? [...assignment.tags] : [];

      const tagPillsWrap = document.createElement('div');
      tagPillsWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; min-height:28px;';

      const saveTags = async (newTags) => {
        const idx = assignmentsData.findIndex(a => a.id === assignment.id);
        const previousTags = idx !== -1 ? (Array.isArray(assignmentsData[idx].tags) ? [...assignmentsData[idx].tags] : []) : null;
        if (idx !== -1) assignmentsData[idx].tags = newTags;
        try {
          await db.updateAssignment(assignment.id, { tags: newTags });
        } catch (err) {
          console.error('[tc-library] Failed to update tags:', err);
          if (idx !== -1 && previousTags !== null) {
            assignmentsData[idx].tags = previousTags;
            // Mutate currentTags in place (not reassign) so that closures in
            // renderTagPills and the tag-removal handlers still reference the
            // same array instance and reflect the rolled-back state correctly.
            currentTags.length = 0;
            previousTags.forEach(t => currentTags.push(t));
            renderTagPills();
          }
          showToast('Failed to update tags', '#ef4444', '#fff');
        }
      };

      const renderTagPills = () => {
        tagPillsWrap.innerHTML = '';
        currentTags.forEach(tag => {
          const pill = document.createElement('span');
          pill.style.cssText = 'display:inline-flex; align-items:center; gap:4px; background:rgba(96,165,250,.20); border:1px solid rgba(96,165,250,.35); border-radius:12px; padding:2px 8px 2px 10px; font-size:12px; color:#93c5fd;';
          pill.appendChild(document.createTextNode(tag));
          const removeBtn = document.createElement('button');
          removeBtn.style.cssText = 'background:none; border:none; color:rgba(147,197,253,.70); cursor:pointer; padding:0; display:inline-flex; align-items:center; font-size:14px; line-height:1;';
          removeBtn.textContent = '\u00d7';
          removeBtn.setAttribute('aria-label', 'Remove tag ' + tag);
          removeBtn.addEventListener('click', async () => {
            const idx = currentTags.indexOf(tag);
            if (idx !== -1) currentTags.splice(idx, 1);
            renderTagPills();
            await saveTags([...currentTags]);
          });
          pill.appendChild(removeBtn);
          tagPillsWrap.appendChild(pill);
        });
      };
      renderTagPills();
      tagsRow.appendChild(tagPillsWrap);

      const tagInputRow = document.createElement('div');
      tagInputRow.style.cssText = 'display:flex; gap:6px; margin-bottom:8px;';
      const tagInput = document.createElement('input');
      tagInput.type = 'text';
      tagInput.placeholder = 'Add tag, press Enter...';
      tagInput.style.cssText = 'flex:1; padding:6px 10px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.18); border-radius:7px; color:white; font-size:13px;';
      tagInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = tagInput.value.trim().toLowerCase().replace(/\s+/g, '-');
          if (val && !currentTags.includes(val)) {
            currentTags.push(val);
            renderTagPills();
            await saveTags([...currentTags]);
          }
          tagInput.value = '';
        }
      });
      tagInputRow.appendChild(tagInput);
      tagsRow.appendChild(tagInputRow);

      const suggestedTagsWrap = document.createElement('div');
      suggestedTagsWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:5px;';
      const SUGGESTED_TAGS = ['quiz', 'homework', 'assessment', 'vocabulary', 'reading', 'writing', 'review', 'daily-work'];
      SUGGESTED_TAGS.forEach(tag => {
        const chip = document.createElement('button');
        chip.className = 'tc-btn';
        chip.style.cssText = 'font-size:11px; padding:3px 9px; opacity:' + (currentTags.includes(tag) ? '0.4' : '0.75') + ';';
        chip.textContent = '+ ' + tag;
        chip.setAttribute('aria-label', 'Add suggested tag ' + tag);
        chip.addEventListener('click', async () => {
          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            renderTagPills();
            chip.style.opacity = '0.4';
            await saveTags([...currentTags]);
          }
        });
        suggestedTagsWrap.appendChild(chip);
      });
      tagsRow.appendChild(suggestedTagsWrap);
      catalogSection.appendChild(tagsRow);

      card.appendChild(catalogSection);
      // ── End Catalog Section ───────────────────────────────────────────────

      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display: flex; gap: 12px;';
      const issueBtn = document.createElement('button');
      issueBtn.className = 'tc-btn issue-detail-btn';
      issueBtn.dataset.id = assignment.id || '';
      issueBtn.style.cssText = 'flex: 1;';
      issueBtn.textContent = 'Issue to Class';
      actionRow.appendChild(issueBtn);

      const detailInstances = instancesData.filter(i => i.assignment_id === assignment.id);
      if (lane === 'upcoming' && detailInstances.length === 0) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tc-btn';
        deleteBtn.style.cssText = 'font-size:13px; color:#f87171; border-color:rgba(248,113,113,.3);';
        deleteBtn.appendChild(createIcon('x', 14));
        deleteBtn.appendChild(document.createTextNode(' Delete'));
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await rcConfirm(
            'Delete Assignment',
            'Are you sure you want to delete "' + (assignment.title || 'Untitled') + '"?\n\nThis assignment has never been issued to students. It will be archived.',
            'Delete',
            { danger: true }
          );
          if (!confirmed) return;
          const idx = assignmentsData.findIndex(a => a.id === assignment.id);
          const snapshot = idx !== -1 ? { ...assignmentsData[idx] } : null;
          try {
            await db.updateAssignment(assignment.id, { active: false });
            if (idx !== -1) assignmentsData[idx].active = false;
            rebuildLaneCache();
            closeModal();
            refreshCurrentTab();
            showToast('Assignment deleted');
          } catch (err) {
            console.error('[tc-library] Failed to delete assignment:', err);
            if (idx !== -1 && snapshot) assignmentsData[idx] = snapshot;
            rebuildLaneCache();
            showToast('Failed to delete assignment', '#ef4444', '#fff');
          }
        });
        actionRow.appendChild(deleteBtn);
      } else if (lane === 'finalized' && assignment.active !== false) {
        const archiveBtn = document.createElement('button');
        archiveBtn.className = 'tc-btn';
        archiveBtn.style.cssText = 'font-size:13px; color:rgba(255,255,255,.50);';
        archiveBtn.appendChild(createIcon('inbox', 14));
        archiveBtn.appendChild(document.createTextNode(' Archive'));
        archiveBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await rcConfirm(
            'Archive Assignment',
            'Archive "' + (assignment.title || 'Untitled') + '"?\n\nIt will remain visible in the Finalized section for reference.',
            'Archive'
          );
          if (!confirmed) return;
          const idx = assignmentsData.findIndex(a => a.id === assignment.id);
          const snapshot = idx !== -1 ? { ...assignmentsData[idx] } : null;
          try {
            await db.updateAssignment(assignment.id, { active: false });
            if (idx !== -1) assignmentsData[idx].active = false;
            rebuildLaneCache();
            closeModal();
            refreshCurrentTab();
            showToast('Assignment archived');
          } catch (err) {
            console.error('[tc-library] Failed to archive:', err);
            if (idx !== -1 && snapshot) assignmentsData[idx] = snapshot;
            rebuildLaneCache();
            showToast('Failed to archive assignment', '#ef4444', '#fff');
          }
        });
        actionRow.appendChild(archiveBtn);
      } else if (assignment.active === false) {
        const archivedIndicator = document.createElement('span');
        archivedIndicator.style.cssText = 'font-size:13px; color:rgba(255,255,255,.40); display:inline-flex; align-items:center; padding:0 8px;';
        archivedIndicator.textContent = 'Archived \u2713';
        actionRow.appendChild(archivedIndicator);
      }

      card.appendChild(actionRow);

      issueBtn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        window.location.href = `/teacher/work/?assignment=${encodeURIComponent(id)}`;
      });
    });

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    function onDetailKeyDown(e) {
      if (e.key === 'Escape') {
        closeModal();
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
    }
    document.addEventListener('keydown', onDetailKeyDown);
  }

  // ── Upload Paper Assignment Modal ─────────────────────────────────────────────

  async function openUploadPaperModal() {
    const triggerEl = document.activeElement;
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

    closeBtn.addEventListener('click', closeUploadModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeUploadModal(); });

    function closeUploadModal() {
      overlay.remove();
      document.removeEventListener('keydown', onUploadKeyDown);
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
    }

    function onUploadKeyDown(e) {
      if (e.key === 'Escape') {
        closeUploadModal();
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
    }
    document.addEventListener('keydown', onUploadKeyDown);

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
      showToast(`"${title}" saved to Library${gradeNote}${toastSuffix}`);
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

  /**
   * Issue #11: Show a finalize toast with a "View in Finalized tab" action link.
   * Stores IDs in lastFinalizedIds and auto-applies a pulse highlight when
   * the teacher clicks through to the Finalized tab.
   * @param {string} text - Toast message
   * @param {string[]} ids - Assignment IDs that were just finalized
   */
  function showFinalizeToast(text, ids) {
    // Track the recently finalized IDs
    if (_lastFinalizedClearTimer) clearTimeout(_lastFinalizedClearTimer);
    lastFinalizedIds = new Set(ids);
    _lastFinalizedClearTimer = setTimeout(() => { lastFinalizedIds = new Set(); }, FINALIZED_HIGHLIGHT_DURATION_MS);

    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#22c55e;color:#0b1220;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;gap:10px;';

    const textNode = document.createTextNode(text + '\u00a0');
    toast.appendChild(textNode);

    const viewLink = document.createElement('button');
    viewLink.textContent = 'View in Finalized tab';
    viewLink.style.cssText = 'background:rgba(0,0,0,.20);border:1px solid rgba(0,0,0,.25);color:#0b1220;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;';
    viewLink.setAttribute('aria-label', 'View recently finalized assignments in Finalized tab');
    viewLink.addEventListener('click', () => {
      toast.remove();
      // Apply today-only date filter so teacher sees what they just finalized
      const today = new Date().toISOString().split('T')[0];
      filters.finalized.dateFrom = today;
      filters.finalized.dateTo = today;
      switchTab('finalized');
    });
    toast.appendChild(viewLink);

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  // ── Banners ───────────────────────────────────────────────────────────────────

  /** Issue #17: Show a persistent warning banner when lessonsData fails to load. */
  function showLessonsErrorBanner(retryFn) {
    const existing = document.getElementById('tcLibLessonsErrorBanner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.id = 'tcLibLessonsErrorBanner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.style.cssText = 'background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.40);border-radius:8px;padding:10px 16px;margin:0 0 12px;display:flex;align-items:center;gap:10px;font-size:13px;color:#fbbf24;';
    const icon = createIcon('alertTriangle', 16);
    icon.style.cssText = 'flex-shrink:0;';
    banner.appendChild(icon);
    const msg = document.createElement('span');
    msg.style.cssText = 'flex:1;';
    msg.textContent = 'Could not load unit data. "By Unit" views may be incomplete.';
    banner.appendChild(msg);
    const retryBtn = document.createElement('button');
    retryBtn.className = 'tc-btn';
    retryBtn.style.cssText = 'font-size:12px;padding:4px 10px;flex-shrink:0;';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', retryFn);
    banner.appendChild(retryBtn);
    const main = $('tcLibraryMain');
    if (main) main.insertBefore(banner, main.firstChild);
  }

  /** Issue #17: Dismiss the lessons error banner. */
  function hideLessonsErrorBanner() {
    const banner = document.getElementById('tcLibLessonsErrorBanner');
    if (banner) banner.remove();
  }

  /** Issue #19: Show a persistent offline warning banner. */
  function showOfflineBanner() {
    if (document.getElementById('tcLibOfflineBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'tcLibOfflineBanner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'assertive');
    banner.style.cssText = 'background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.40);border-radius:8px;padding:10px 16px;margin:0 0 12px;display:flex;align-items:center;gap:10px;font-size:13px;color:#fbbf24;';
    const icon = createIcon('alertTriangle', 16);
    icon.style.cssText = 'flex-shrink:0;';
    banner.appendChild(icon);
    const msg = document.createElement('span');
    msg.textContent = 'You appear to be offline. Changes may not be saved until your connection is restored.';
    banner.appendChild(msg);
    const main = $('tcLibraryMain');
    if (main) main.insertBefore(banner, main.firstChild);
  }

  /** Issue #19: Dismiss the offline warning banner. */
  function hideOfflineBanner() {
    const banner = document.getElementById('tcLibOfflineBanner');
    if (banner) banner.remove();
  }

  // ── Evidence Report Modal ─────────────────────────────────────────────────────

  async function openEvidenceReportModal() {
    const triggerEl = document.activeElement;

    const overlay = document.createElement('div');
    overlay.id = 'evidenceReportOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'evidenceReportTitle');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.80); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 24px;
    `;

    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width: 620px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px;';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;';
    const titleEl = document.createElement('h2');
    titleEl.id = 'evidenceReportTitle';
    titleEl.style.cssText = 'margin: 0; font-size: 22px;';
    titleEl.textContent = 'Student Evidence Report';
    const closeBtn = document.createElement('button');
    closeBtn.id = 'closeEvidenceReportBtn';
    closeBtn.className = 'tc-btn';
    closeBtn.style.cssText = 'padding: 8px 16px;';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.textContent = '\u2715 Close';
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    card.appendChild(header);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function closeModal() {
      document.removeEventListener('keydown', onEvidenceKeyDown);
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
    }
    closeBtn.addEventListener('click', closeModal);

    function onEvidenceKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key === 'Tab') {
        const focusable = Array.from(
          card.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
        ).filter((el) => el.offsetParent !== null);
        if (focusable.length < 2) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onEvidenceKeyDown);

    // Show loading indicator while fetching students
    const loadingEl = document.createElement('div');
    loadingEl.style.cssText = 'text-align:center; padding:24px; color:rgba(255,255,255,.6);';
    loadingEl.textContent = 'Loading student data\u2026';
    card.appendChild(loadingEl);
    closeBtn.focus();

    // Load students lazily
    if (!_evidenceStudentsData) {
      try {
        _evidenceStudentsData = (await db.listStudents()) || [];
      } catch (err) {
        console.warn('[tc-library] Could not load students for evidence report:', err);
        _evidenceStudentsData = [];
      }
    }

    card.removeChild(loadingEl);
    _buildEvidenceReportForm(card, closeModal);

    // Focus first focusable element in the form
    const firstInput = card.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled])');
    if (firstInput) firstInput.focus();
  }

  function _buildEvidenceReportForm(card, closeModal) {
    const fieldStyle = 'width:100%; padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.2); border-radius:8px; color:white; font-size:15px; box-sizing:border-box;';
    const labelStyle = 'display:block; font-size:14px; color:rgba(255,255,255,.70); margin-bottom:8px;';
    const sectionStyle = 'margin-bottom:18px;';
    const modeBtnStyle = 'padding:6px 14px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.15); border-radius:6px; color:white; cursor:pointer; font-size:13px; transition:background .15s;';
    const modeBtnActiveStyle = 'padding:6px 14px; background:rgba(34,197,94,.20); border:1px solid rgba(34,197,94,.35); border-radius:6px; color:white; cursor:pointer; font-size:13px;';

    // ── Evidence report form state ──
    const formState = {
      selectedStudents: [],        // array of student codes
      dateRange: 'current-quarter',
      customStart: '',
      customEnd: '',
      audience: 'parent',
      outputFormat: 'print',
    };

    const activeStudents = (_evidenceStudentsData || []).filter((s) => s.active !== false);

    // ── Section: Students ──
    const studentsSection = document.createElement('div');
    studentsSection.style.cssText = sectionStyle;
    const studentsLabel = document.createElement('div');
    studentsLabel.style.cssText = labelStyle;
    studentsLabel.textContent = 'Select Students:';
    studentsSection.appendChild(studentsLabel);

    if (activeStudents.length === 0) {
      const noStudents = document.createElement('div');
      noStudents.style.cssText = 'color:rgba(255,255,255,.5); font-style:italic; font-size:14px;';
      noStudents.textContent = 'No active students found.';
      studentsSection.appendChild(noStudents);
    } else {
      // Define counter element and updater first so they can be referenced by button callbacks
      const counterEl = document.createElement('div');
      counterEl.style.cssText = 'font-size:12px; color:rgba(255,255,255,.45); margin-top:4px;';
      counterEl.textContent = '0 of ' + activeStudents.length + ' selected';

      const updateCounter = () => {
        counterEl.textContent = `${formState.selectedStudents.length} of ${activeStudents.length} selected`;
      };

      const studentCheckboxes = [];

      const selectBtnRow = document.createElement('div');
      selectBtnRow.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';

      const selectAllBtn = document.createElement('button');
      selectAllBtn.type = 'button';
      selectAllBtn.textContent = 'Select All';
      selectAllBtn.style.cssText = modeBtnStyle;
      selectAllBtn.addEventListener('click', () => {
        formState.selectedStudents = activeStudents.map((s) => s.code);
        studentCheckboxes.forEach((cb) => { cb.checked = true; });
        updateCounter();
      });

      const clearAllBtn = document.createElement('button');
      clearAllBtn.type = 'button';
      clearAllBtn.textContent = 'Clear All';
      clearAllBtn.style.cssText = modeBtnStyle;
      clearAllBtn.addEventListener('click', () => {
        formState.selectedStudents = [];
        studentCheckboxes.forEach((cb) => { cb.checked = false; });
        updateCounter();
      });

      selectBtnRow.appendChild(selectAllBtn);
      selectBtnRow.appendChild(clearAllBtn);
      studentsSection.appendChild(selectBtnRow);

      const listEl = document.createElement('div');
      listEl.style.cssText = 'max-height:160px; overflow-y:auto; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); border-radius:8px; padding:8px;';

      activeStudents.forEach((student) => {
        const item = document.createElement('label');
        item.style.cssText = 'display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer; font-size:14px;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = student.code;
        cb.addEventListener('change', () => {
          if (cb.checked) {
            if (!formState.selectedStudents.includes(student.code)) formState.selectedStudents.push(student.code);
          } else {
            formState.selectedStudents = formState.selectedStudents.filter((c) => c !== student.code);
          }
          updateCounter();
        });
        studentCheckboxes.push(cb);
        item.appendChild(cb);
        item.appendChild(document.createTextNode(student.name || student.code));
        listEl.appendChild(item);
      });
      studentsSection.appendChild(listEl);
      studentsSection.appendChild(counterEl);
    }
    card.appendChild(studentsSection);

    // ── Section: Date Range ──
    const dateSection = document.createElement('div');
    dateSection.style.cssText = sectionStyle;
    const dateLabel = document.createElement('label');
    dateLabel.setAttribute('for', 'ev_dateRange');
    dateLabel.style.cssText = labelStyle;
    dateLabel.textContent = 'Date Range:';
    const dateSelect = document.createElement('select');
    dateSelect.id = 'ev_dateRange';
    dateSelect.style.cssText = fieldStyle;
    [
      ['current-quarter', 'Current Quarter'],
      ['Q1', 'Q1'],
      ['Q2', 'Q2'],
      ['Q3', 'Q3'],
      ['Q4', 'Q4'],
      ['all-time', 'All Time'],
      ['custom', 'Custom Range\u2026'],
    ].forEach(([val, lbl]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = lbl;
      if (val === formState.dateRange) opt.selected = true;
      dateSelect.appendChild(opt);
    });

    const customRangeEl = document.createElement('div');
    customRangeEl.id = 'ev_customRange';
    customRangeEl.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
    customRangeEl.style.display = 'none';

    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.id = 'ev_customStart';
    startInput.style.cssText = fieldStyle + 'flex:1;';
    const endInput = document.createElement('input');
    endInput.type = 'date';
    endInput.id = 'ev_customEnd';
    endInput.style.cssText = fieldStyle + 'flex:1;';
    customRangeEl.appendChild(startInput);
    customRangeEl.appendChild(endInput);

    dateSelect.addEventListener('change', (e) => {
      formState.dateRange = e.target.value;
      customRangeEl.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });
    startInput.addEventListener('change', (e) => { formState.customStart = e.target.value; });
    endInput.addEventListener('change', (e) => { formState.customEnd = e.target.value; });

    dateSection.appendChild(dateLabel);
    dateSection.appendChild(dateSelect);
    dateSection.appendChild(customRangeEl);
    card.appendChild(dateSection);

    // ── Section: Audience ──
    const audienceSection = document.createElement('div');
    audienceSection.style.cssText = sectionStyle;
    const audienceLabel = document.createElement('div');
    audienceLabel.style.cssText = labelStyle;
    audienceLabel.textContent = 'Audience:';
    const audienceGroup = document.createElement('div');
    audienceGroup.style.cssText = 'display:flex; gap:8px;';

    ['parent', 'admin'].forEach((aud) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = aud === 'parent' ? 'Parent / IEP Team' : 'Admin';
      btn.style.cssText = aud === formState.audience ? modeBtnActiveStyle : modeBtnStyle;
      btn.dataset.audience = aud;
      btn.addEventListener('click', () => {
        formState.audience = aud;
        audienceGroup.querySelectorAll('button').forEach((b) => {
          b.style.cssText = b.dataset.audience === aud ? modeBtnActiveStyle : modeBtnStyle;
        });
      });
      audienceGroup.appendChild(btn);
    });
    audienceSection.appendChild(audienceLabel);
    audienceSection.appendChild(audienceGroup);
    card.appendChild(audienceSection);

    // ── Section: Output Format ──
    const formatSection = document.createElement('div');
    formatSection.style.cssText = sectionStyle;
    const formatLabel = document.createElement('div');
    formatLabel.style.cssText = labelStyle;
    formatLabel.textContent = 'Output Format:';
    const formatGroup = document.createElement('div');
    formatGroup.style.cssText = 'display:flex; gap:8px;';

    [['print', 'Print / PDF'], ['zip', 'ZIP Download']].forEach(([fmt, lbl]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = lbl;
      btn.style.cssText = fmt === formState.outputFormat ? modeBtnActiveStyle : modeBtnStyle;
      btn.dataset.format = fmt;
      btn.addEventListener('click', () => {
        formState.outputFormat = fmt;
        formatGroup.querySelectorAll('button').forEach((b) => {
          b.style.cssText = b.dataset.format === fmt ? modeBtnActiveStyle : modeBtnStyle;
        });
      });
      formatGroup.appendChild(btn);
    });
    formatSection.appendChild(formatLabel);
    formatSection.appendChild(formatGroup);
    card.appendChild(formatSection);

    // ── Generate Button ──
    const generateBtn = document.createElement('button');
    generateBtn.id = 'ev_generateBtn';
    generateBtn.type = 'button';
    generateBtn.className = 'tc-btn';
    generateBtn.style.cssText = 'width:100%; padding:12px; font-size:16px; background:rgba(34,197,94,.20); border-color:rgba(34,197,94,.35); display:flex; align-items:center; justify-content:center; gap:8px; margin-top:8px;';
    generateBtn.appendChild(createIcon('fileText'));
    generateBtn.appendChild(document.createTextNode(' Generate'));
    generateBtn.addEventListener('click', () => {
      _runEvidenceGeneration(formState, card, closeModal).catch((err) => {
        console.error('[tc-library] Evidence generation error:', err);
      });
    });
    card.appendChild(generateBtn);
  }

  async function _runEvidenceGeneration(formState, card, closeModal) {
    if (formState.selectedStudents.length === 0) {
      await rcAlert('No Students Selected', 'Please select at least one student.');
      return;
    }

    const generateBtn = card.querySelector('#ev_generateBtn');
    if (generateBtn) { generateBtn.disabled = true; generateBtn.textContent = 'Generating\u2026'; }

    try {
      // Load additional data needed for the report
      const [goalsAll, progressAll, instancesAll, subsAll, enrollAll] = await Promise.all([
        db.listGoalsAll ? db.listGoalsAll() : Promise.resolve([]),
        db.listGoalProgress ? db.listGoalProgress({}) : Promise.resolve([]),
        instancesData.length > 0 ? Promise.resolve(instancesData) : (db.listAssignmentInstances ? db.listAssignmentInstances() : Promise.resolve([])),
        submissionsData.length > 0 ? Promise.resolve(submissionsData) : (db.listSubmissions ? db.listSubmissions() : Promise.resolve([])),
        db.listClassEnrollments ? db.listClassEnrollments() : Promise.resolve([]),
      ]);

      const targetStudents = (_evidenceStudentsData || []).filter(
        (s) => formState.selectedStudents.includes(s.code)
      );

      if (targetStudents.length === 0) {
        await rcAlert('No Data', 'No matching students found.');
        return;
      }

      const isParent = formState.audience === 'parent';
      const isRemoteNow = await isRemote();
      const sourceLabel = isRemoteNow ? 'School Database' : 'My Device';

      // Resolve date range
      let quarterRange;
      if (formState.dateRange === 'all-time') {
        quarterRange = { start: '2000-01-01', end: '2099-12-31' };
      } else if (formState.dateRange === 'custom') {
        quarterRange = { start: formState.customStart || '2000-01-01', end: formState.customEnd || '2099-12-31' };
      } else if (['Q1','Q2','Q3','Q4'].includes(formState.dateRange)) {
        quarterRange = _getLibraryQuarterRange(formState.dateRange);
      } else {
        // current-quarter
        quarterRange = _getLibraryQuarterRange('current');
      }

      const periodLabel = _getLibraryPeriodLabel(formState.dateRange, formState.customStart, formState.customEnd);

      if (formState.outputFormat === 'zip') {
        await _generateLibraryEvidenceZip(targetStudents, quarterRange, isParent, sourceLabel, periodLabel, goalsAll, progressAll, instancesAll, subsAll, enrollAll, assignmentsData);
        closeModal();
      } else {
        // Print mode
        _generateLibraryEvidencePrintWindow(targetStudents, quarterRange, isParent, sourceLabel, periodLabel, goalsAll, progressAll, instancesAll, subsAll, enrollAll, assignmentsData);
        closeModal();
      }
    } catch (err) {
      console.error('[tc-library] Evidence generation failed:', err);
      await rcAlert('Generation Failed', 'Could not generate the evidence report. Please try again.');
    } finally {
      if (generateBtn) { generateBtn.disabled = false; generateBtn.textContent = 'Generate'; }
    }
  }

  function _getLibraryQuarterRange(quarter) {
    // Attempt to read from localStorage (quarter-utils pattern)
    try {
      const stored = localStorage.getItem('rc_quarter_dates');
      if (stored) {
        const qDates = JSON.parse(stored);
        let qKey = quarter;
        if (quarter === 'current') {
          const now = new Date();
          const mm = now.getMonth() + 1;
          if (mm <= 2) qKey = 'Q2';
          else if (mm <= 5) qKey = 'Q3';
          else if (mm <= 8) qKey = 'Q4';
          else qKey = 'Q1';
        }
        if (qDates[qKey]) return { start: qDates[qKey].start, end: qDates[qKey].end };
      }
    } catch (_e) { /* ignore */ }
    // Fallback: broad calendar quarters
    const year = new Date().getFullYear();
    const ranges = {
      Q1: { start: `${year}-08-16`, end: `${year}-10-17` },
      Q2: { start: `${year}-10-18`, end: `${year}-12-20` },
      Q3: { start: `${year + 1}-01-06`, end: `${year + 1}-03-14` },
      Q4: { start: `${year + 1}-03-17`, end: `${year + 1}-06-06` },
    };
    if (quarter === 'current') {
      const now = new Date();
      const mm = now.getMonth() + 1;
      if (mm <= 2) return ranges.Q2;
      if (mm <= 5) return ranges.Q3;
      if (mm <= 8) return ranges.Q4;
      return ranges.Q1;
    }
    return ranges[quarter] || { start: '2000-01-01', end: '2099-12-31' };
  }

  function _getLibraryPeriodLabel(dateRange, customStart, customEnd) {
    if (dateRange === 'all-time') return 'All Time';
    if (dateRange === 'custom') return `${customStart || '?'} \u2013 ${customEnd || '?'}`;
    if (['Q1','Q2','Q3','Q4'].includes(dateRange)) return dateRange;
    return 'Current Quarter';
  }

  /**
   * Returns true if a goal is active/open (not closed or archived).
   * Case-insensitive; goals with missing status are treated as active.
   */
  function _isGoalActive(goal) {
    if (!goal) return false;
    if (!goal.status) return true;
    const s = goal.status.toLowerCase();
    return s !== 'closed' && s !== 'archived';
  }

  /**
   * Build rich per-question answer detail HTML for the library evidence report.
   * Works in both dark-theme (_buildLibraryEvidenceHtml) and print-safe contexts.
   * @param {Object}  submission - submission row
   * @param {Object}  assignment - assignment row (has .meta)
   * @param {Array}   goalsAll   - all goals (to resolve goal codes → descriptions)
   * @param {boolean} isParent   - hide answer keys when true
   * @param {boolean} darkTheme  - use dark-theme inline styles when true
   */
  function _buildLibraryRichAnswerHtml(submission, assignment, goalsAll, isParent, darkTheme, studentCode) {
    if (!submission) return '';

    let html = '';
    const hasAuto = submission.score_auto != null;
    const hasManual = submission.score_manual != null;
    if (hasAuto && hasManual) {
      const bStyle = darkTheme ? 'font-size:12px;color:rgba(255,255,255,.6);margin-top:5px;' : 'font-size:12px;color:#444;margin-top:5px;';
      html += `<div style="${bStyle}">Auto-graded: ${esc(String(submission.score_auto))}% &nbsp;|&nbsp; Manual: ${esc(String(submission.score_manual))}%</div>`;
    }

    const items = buildItemsFromMeta(assignment?.id, assignment?.meta);
    const rawAnswers = submission.answers || {};
    const hasRawAnswers = rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers);

    if (items.length > 0 && hasRawAnswers) {
      let correctCount = 0;
      let gradableCount = 0;

      const questionCards = items.map((item) => {
        const ref = item.item_ref;
        const studentAns = rawAnswers[ref];
        const correctAns = item.meta?.correct ?? item.correct;
        const isCorrect = correctAns !== undefined && correctAns !== null && studentAns !== undefined && String(studentAns) === String(correctAns);
        if (item.answer_type !== 'constructed' && correctAns !== undefined && studentAns !== undefined) {
          gradableCount++;
          if (isCorrect) correctCount++;
        }

        // Resolve IEP goal descriptions
        // FERPA: only look up goals that belong to this student.
        // If studentCode is unknown, show no IEP badges rather than leaking.
        const goalDescs = (item.goal_codes || []).map((code) => {
          if (!studentCode) return null;
          const goal = goalsAll.find((g) => g.code === code && g.student_code === studentCode);
          if (!goal) return null;
          const area = goal.area || goal.skill_area;
          const desc = goal.desc || goal.description;
          if (desc) return `${area ? esc(area) + ' — ' : ''}${esc(desc)}`;
          return esc(goal.code || code);
        }).filter(Boolean);

        const deseCodes = item.dese_codes || [];

        // Styles
        const cardBg = darkTheme ? 'rgba(255,255,255,.03)' : '#fff';
        const cardBorder = darkTheme ? 'rgba(255,255,255,.08)' : '#ddd';
        const labelColor = darkTheme ? 'rgba(255,255,255,.9)' : '#111';
        const textColor = darkTheme ? 'rgba(255,255,255,.75)' : '#222';
        const badgeDeseBg = darkTheme ? 'rgba(59,130,246,.2)' : '#dbeafe';
        const badgeDeseColor = darkTheme ? '#93c5fd' : '#1e40af';
        const badgeGoalBg = darkTheme ? 'rgba(34,197,94,.15)' : '#dcfce7';
        const badgeGoalColor = darkTheme ? '#86efac' : '#166534';

        const badgesHtml = [
          deseCodes.length > 0
            ? `<span style="font-size:11px;padding:1px 6px;border-radius:10px;background:${badgeDeseBg};color:${badgeDeseColor};">DESE: ${esc(deseCodes.join(', '))}</span>`
            : '',
          ...goalDescs.map((d) => `<span style="font-size:11px;padding:1px 6px;border-radius:10px;background:${badgeGoalBg};color:${badgeGoalColor};">IEP: ${d}</span>`),
        ].filter(Boolean).join(' ');

        if (item.answer_type === 'constructed') {
          // Distinguish fill-in-blank (keyword-auto-scored) from true writing prompts
          const fibKeywords = item.meta?.keywords || item.scoring?.keywords || item.meta?.scoring?.keywords || [];
          const isFillInBlank = fibKeywords.length > 0;

          let studentText = '';
          if (typeof studentAns === 'string') studentText = studentAns;
          else if (studentAns && typeof studentAns === 'object') studentText = studentAns.value || JSON.stringify(studentAns);

          if (isFillInBlank) {
            // Fill-in-blank: compute keyword match result and show with ✓/✗
            const minKeywords = item.meta?.min_keywords ?? item.scoring?.min_keywords ?? item.meta?.scoring?.min_keywords ?? 1;
            const caseSensitive = item.meta?.case_sensitive === true || item.scoring?.case_sensitive === true || item.meta?.scoring?.case_sensitive === true;
            const answerForMatch = caseSensitive ? studentText : studentText.toLowerCase();
            let foundCount = 0;
            for (const kw of fibKeywords) {
              const kwForMatch = caseSensitive ? String(kw) : String(kw).toLowerCase();
              if (answerForMatch.includes(kwForMatch)) foundCount++;
            }
            const fibCorrect = foundCount >= minKeywords;
            gradableCount++;
            if (fibCorrect) correctCount++;
            const day2 = item.meta?.day || '';
            const qNum2 = item.meta?.question_number || ref;
            const questionText2 = item.meta?.text || '';
            const correctBg = darkTheme ? 'rgba(34,197,94,.2)' : '#dcfce7';
            const correctColor = darkTheme ? '#86efac' : '#166534';
            const wrongBg = darkTheme ? 'rgba(239,68,68,.2)' : '#fee2e2';
            const wrongColor = darkTheme ? '#fca5a5' : '#991b1b';
            const rowBg = fibCorrect ? correctBg : wrongBg;
            const rowColor = fibCorrect ? correctColor : wrongColor;
            return `<div style="background:${cardBg};border:1px solid ${cardBorder};border-radius:6px;padding:10px 12px;margin-bottom:8px;">
              <div style="font-weight:600;font-size:13px;color:${labelColor};margin-bottom:4px;">Q${qNum2}${day2 ? ` (Day ${day2})` : ''}${badgesHtml ? ` &nbsp; ${badgesHtml}` : ''}</div>
              ${questionText2 ? `<div style="font-size:13px;font-style:italic;color:${textColor};margin-bottom:6px;">${esc(questionText2)}</div>` : ''}
              <div style="display:flex;flex-direction:column;gap:3px;">
                <div style="padding:3px 8px;border-radius:4px;background:${rowBg};color:${rowColor};font-size:13px;font-weight:600;">
                  ${studentText ? esc(studentText) : '<em style="font-weight:400;opacity:.6;">No response</em>'}
                  <span style="margin-left:6px;font-weight:700;">${fibCorrect ? '✓' : '✗'}</span>
                </div>
              </div>
            </div>`;
          }

          // True writing prompt (no keywords)
          const prompt = item.meta?.prompt || '';
          const score = submission.score_manual ?? submission.score_total ?? submission.score;
          return `<div style="background:${cardBg};border:1px solid ${cardBorder};border-radius:6px;padding:10px 12px;margin-bottom:8px;">
            <div style="font-weight:600;font-size:13px;color:${labelColor};margin-bottom:4px;">Writing Prompt (Day ${item.meta?.day || ref})${badgesHtml ? ` &nbsp; ${badgesHtml}` : ''}</div>
            ${prompt ? `<div style="font-size:13px;font-style:italic;color:${textColor};margin-bottom:6px;">&ldquo;${esc(prompt)}&rdquo;</div>` : ''}
            <div style="font-size:11px;font-weight:600;color:${textColor};opacity:.7;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Student Response:</div>
            <div style="font-size:13px;color:${textColor};background:${darkTheme ? 'rgba(255,255,255,.04)' : '#f8f9fa'};border:1px solid ${cardBorder};border-radius:4px;padding:6px 8px;white-space:pre-wrap;word-break:break-word;">${studentText ? esc(studentText) : '<em>No response recorded</em>'}</div>
            ${!isParent && score != null ? `<div style="font-size:12px;color:${textColor};opacity:.7;margin-top:4px;">Score: ${esc(String(score))} (${hasManual ? 'Teacher scored' : 'Auto-graded'})</div>` : ''}
            ${submission.teacher_note ? `<div style="font-size:12px;font-style:italic;color:${textColor};opacity:.65;margin-top:4px;"><strong>Teacher Note:</strong> ${esc(submission.teacher_note)}</div>` : ''}
          </div>`;
        }

        // MCQ
        const questionText = item.meta?.text || '';
        const day = item.meta?.day || '';
        const qNum = item.meta?.question_number || ref;
        const choices = item.meta?.choices || [];
        const choicesHtml = choices.length > 0
          ? choices.map((c) => {
              const letter = c.letter || c.key || '';
              const text = c.text || c.value || '';
              const isStudentAns = studentAns !== undefined && String(studentAns) === String(letter);
              const isCorrectAns = !isParent && correctAns !== undefined && String(correctAns) === String(letter);
              const marker = isStudentAns && isCorrectAns ? ' ✓' : isStudentAns && !isCorrectAns ? ' ✗' : isCorrectAns ? ' ← correct' : '';
              let rowBg = 'transparent', rowColor = textColor;
              if (isStudentAns && isCorrectAns) { rowBg = darkTheme ? 'rgba(34,197,94,.2)' : '#dcfce7'; rowColor = darkTheme ? '#86efac' : '#166534'; }
              else if (isStudentAns) { rowBg = darkTheme ? 'rgba(239,68,68,.2)' : '#fee2e2'; rowColor = darkTheme ? '#fca5a5' : '#991b1b'; }
              else if (isCorrectAns) { rowBg = darkTheme ? 'rgba(34,197,94,.1)' : '#f0fdf4'; rowColor = darkTheme ? '#86efac' : '#166534'; }
              return `<div style="padding:3px 8px;border-radius:4px;background:${rowBg};color:${rowColor};font-size:13px;${isStudentAns || isCorrectAns ? 'font-weight:600;' : ''}">${esc(letter ? letter + ')' : '')} ${esc(text)}${marker ? `<span style="margin-left:6px;font-weight:700;">${marker}</span>` : ''}</div>`;
            }).join('')
          : studentAns !== undefined
            ? `<div style="font-size:13px;color:${isCorrect ? (darkTheme ? '#86efac' : '#166534') : (correctAns !== undefined ? (darkTheme ? '#fca5a5' : '#991b1b') : textColor)};padding:3px 8px;">Answer: ${esc(String(studentAns))}${!isParent && correctAns !== undefined ? ` (Correct: ${esc(String(correctAns))})` : ''}${isCorrect ? ' ✓' : (correctAns !== undefined ? ' ✗' : '')}</div>`
            : `<div style="font-size:13px;color:${textColor};opacity:.5;font-style:italic;padding:3px 8px;">No response</div>`;

        return `<div style="background:${cardBg};border:1px solid ${cardBorder};border-radius:6px;padding:10px 12px;margin-bottom:8px;">
          <div style="font-weight:600;font-size:13px;color:${labelColor};margin-bottom:4px;">Q${qNum}${day ? ` (Day ${day})` : ''}${badgesHtml ? ` &nbsp; ${badgesHtml}` : ''}</div>
          ${questionText ? `<div style="font-size:13px;font-style:italic;color:${textColor};margin-bottom:6px;">${esc(questionText)}</div>` : ''}
          <div style="display:flex;flex-direction:column;gap:3px;">${choicesHtml}</div>
        </div>`;
      }).join('');

      const summaryStyle = darkTheme ? 'font-size:13px;font-weight:600;color:rgba(255,255,255,.85);margin-bottom:8px;' : 'font-size:13px;font-weight:600;color:#111;margin-bottom:8px;';
      const summaryHtml = !isParent && gradableCount > 0
        ? `<div style="${summaryStyle}">${correctCount}/${gradableCount} correct (${Math.round((correctCount / gradableCount) * 100)}%)</div>`
        : '';

      const labelStyle = darkTheme ? 'font-size:11px;font-weight:600;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;' : 'font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;';
      html += `<div style="margin-top:8px;">
        <div style="${labelStyle}">Student Responses (${items.length})</div>
        ${summaryHtml}
        ${questionCards}
      </div>`;

    } else if (hasRawAnswers) {
      // Fallback flat table
      const entries = Object.entries(rawAnswers);
      if (entries.length > 0) {
        const borderColor = darkTheme ? 'rgba(255,255,255,.1)' : '#ddd';
        const thBg = darkTheme ? 'rgba(255,255,255,.05)' : '#f0f0f0';
        const refColor = darkTheme ? 'rgba(255,255,255,.55)' : '#555';
        const rows = entries.map(([ref, ans]) => {
          let displayAns;
          if (typeof ans === 'object' && ans !== null) {
            displayAns = ans.value != null ? esc(String(ans.value)) : esc(JSON.stringify(ans));
          } else {
            displayAns = esc(String(ans));
          }
          return `<tr><td style="padding:3px 7px;border:1px solid ${borderColor};font-size:11px;color:${refColor};white-space:nowrap;">${esc(ref)}</td><td style="padding:3px 7px;border:1px solid ${borderColor};font-size:11px;word-break:break-word;">${displayAns}</td></tr>`;
        }).join('');
        const labelStyle = darkTheme ? 'font-size:11px;font-weight:600;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;' : 'font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;';
        html += `<div style="margin-top:8px;">
          <div style="${labelStyle}">Student Responses (${entries.length})</div>
          <table style="width:100%;border-collapse:collapse;"><thead><tr>
            <th style="padding:3px 7px;border:1px solid ${borderColor};background:${thBg};font-size:11px;text-align:left;">Item</th>
            <th style="padding:3px 7px;border:1px solid ${borderColor};background:${thBg};font-size:11px;text-align:left;">Response</th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>`;
      }
    }

    if (submission.teacher_note && !isParent) {
      const noteColor = darkTheme ? 'rgba(255,255,255,.6)' : '#555';
      html += `<div style="font-size:12px;font-style:italic;color:${noteColor};margin-top:5px;"><strong>Teacher Note:</strong> ${esc(submission.teacher_note)}</div>`;
    }

    return html;
  }

  function _buildLibraryEvidenceHtml(student, quarterRange, isParent, periodLabel, goalsAll, progressAll, instancesAll, subsAll, enrollAll, assignsAll) {

    const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const audienceLabel = isParent ? 'Parent' : 'Admin';

    const studentEnrollments = enrollAll.filter(
      (e) => e.student_code === student.code || e.student_id === student.code
    );
    const classNames = studentEnrollments.length > 0
      ? studentEnrollments.map((e) => esc(e.class_name || e.class_code || '')).filter(Boolean).join(', ')
      : 'N/A';

    const profileHtml = `
      <div style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="font-size:20px;font-weight:700;margin-bottom:12px;">Student Evidence Report</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px;margin-bottom:12px;">
          <div><strong>Student:</strong> ${esc(student.name || student.code)} (${esc(student.code)})</div>
          <div><strong>Report Date:</strong> ${esc(todayLabel)}</div>
          <div><strong>Classes:</strong> ${classNames || 'N/A'}</div>
          <div><strong>Period:</strong> ${esc(periodLabel)}</div>
          <div><strong>Status:</strong> ${student.active !== false ? 'Active' : 'Inactive'}</div>
          <div><strong>Mode:</strong> ${esc(audienceLabel)}</div>
        </div>
        <div style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:8px 14px;font-size:13px;color:#f87171;">
          &#9888; CONFIDENTIAL &mdash; For authorized personnel only (FERPA)
        </div>
      </div>`;

    // Goals
    const activeGoals = goalsAll.filter(
      (g) => g.student_code === student.code && _isGoalActive(g)
    );

    let goalsHtml = '';
    if (activeGoals.length === 0) {
      goalsHtml = '<div style="color:rgba(255,255,255,.5);font-style:italic;padding:8px 0;">No active IEP goals found for this student.</div>';
    } else {
      const startDate = new Date(quarterRange.start);
      const endDate = new Date(quarterRange.end);
      const goalRows = activeGoals.map((goal) => {
        const pts = progressAll.filter((p) => {
          if (p.goal_code !== goal.code || p.student_code !== student.code) return false;
          const pd = new Date(p.date);
          return pd >= startDate && pd <= endDate;
        });
        const vals = pts.map((p) => parseFloat(p.value)).filter((v) => !isNaN(v));
        const avg = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
        const progressCell = isParent
          ? (avg == null ? 'No data yet' : parseFloat(avg) >= 80 ? '✅ On track' : parseFloat(avg) >= 60 ? '📈 Making progress' : '⚠️ Needs support')
          : (avg != null ? formatGoalValue(parseFloat(avg), goal.measurement_type, goal) : '—');
        const target = goal.target != null ? esc(String(goal.target)) : '—';
        const mastery = goal.mastery != null ? esc(String(goal.mastery)) : (goal.target != null ? esc(String(goal.target)) : '—');
        const baseline = goal.baseline != null ? esc(String(goal.baseline)) : '—';
        const adminCols = isParent ? '' : `<td>${pts.length} pts</td>`;
        return `<tr><td>${esc(goal.code || goal.id || '—')}</td><td>${esc(goal.area || goal.skill_area || '—')}</td><td>${baseline}</td><td>${esc(progressCell)}</td><td>${mastery}</td><td>${target}</td>${adminCols}</tr>`;
      }).join('');
      const adminHeader = isParent ? '' : '<th>Data Pts</th>';
      goalsHtml = `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
        <caption style="text-align:left;font-weight:600;margin-bottom:6px;">IEP Goal Progress</caption>
        <thead><tr><th style="padding:6px 8px;border:1px solid rgba(255,255,255,.12);">Goal</th><th style="padding:6px 8px;border:1px solid rgba(255,255,255,.12);">Area</th><th style="padding:6px 8px;border:1px solid rgba(255,255,255,.12);">Baseline</th><th style="padding:6px 8px;border:1px solid rgba(255,255,255,.12);">Progress</th><th style="padding:6px 8px;border:1px solid rgba(255,255,255,.12);">Mastery</th><th style="padding:6px 8px;border:1px solid rgba(255,255,255,.12);">Target</th>${adminHeader}</tr></thead>
        <tbody style="font-size:13px;">${goalRows}</tbody>
      </table>`;
    }

    // Assignments
    const startDate2 = new Date(quarterRange.start);
    const endDate2 = new Date(quarterRange.end);
    const studentInsts = instancesAll.filter(
      (inst) => inst.student_code === student.code || inst.student_id === student.code
    );
    const rangedInsts = studentInsts.filter((inst) => {
      const d = new Date(inst.assigned_at || inst.created_at || '');
      return isNaN(d.getTime()) || (d >= startDate2 && d <= endDate2);
    });

    let assignHtml = '';
    if (rangedInsts.length === 0) {
      assignHtml = '<div style="color:rgba(255,255,255,.5);font-style:italic;padding:8px 0;">No assignments found for this period.</div>';
    } else {
      const cardStyle = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:12px 16px;margin-bottom:10px;';
      assignHtml = rangedInsts.map((inst) => {
        const assignment = assignsAll.find((a) => a.id === inst.assignment_id);
        const submission = subsAll.find(
          (s) => s.instance_id === inst.id || (s.assignment_instances && s.assignment_instances.id === inst.id)
        );
        const title = esc(assignment?.title || `Assignment ${inst.assignment_id}`);
        const type = esc(assignment?.type || '—');
        const score = submission?.score_total ?? submission?.score;
        const status = submission ? (score != null ? 'Graded' : 'Submitted') : 'Pending';
        const assignedDate = esc(_libFormatDate(inst.assigned_at || inst.created_at));
        const metaRow = isParent
          ? `Assigned: ${assignedDate} | Status: ${esc(status)}`
          : `Type: ${type} | Assigned: ${assignedDate} | Status: ${esc(status)} | Score: ${score != null ? score + '%' : '—'}`;

        // Pre-filter goals to this student only (FERPA: never show another
        // student's IEP goal on this student's report).
        const studentGoalsAll = student.code
          ? goalsAll.filter((g) => g.student_code === student.code)
          : [];
        const answerDetail = _buildLibraryRichAnswerHtml(
          submission,
          assignment,
          studentGoalsAll,
          isParent,
          true /* darkTheme */,
          student.code
        );

        return `<div style="${cardStyle}"><div style="font-weight:600;margin-bottom:4px;">${title}</div><div style="font-size:13px;color:rgba(255,255,255,.7);">${metaRow}</div>${answerDetail}</div>`;
      }).join('');
    }

    return `
      <div style="margin-bottom:32px;">
        ${profileHtml}
        <div style="font-size:16px;font-weight:600;margin:18px 0 10px;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:6px;">IEP Goal Progress Summary</div>
        ${goalsHtml}
        <div style="font-size:16px;font-weight:600;margin:18px 0 10px;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:6px;">Assignment Detail Trail</div>
        ${assignHtml}
      </div>`;
  }

  function _libFormatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function _generateLibraryEvidencePrintWindow(targetStudents, quarterRange, isParent, sourceLabel, periodLabel, goalsAll, progressAll, instancesAll, subsAll, enrollAll, assignsAll) {
    const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const sections = targetStudents.map((student, idx) => {
      const sep = idx > 0 ? '<div style="page-break-before:always;"></div>' : '';
      return sep + _buildLibraryEvidenceHtmlPrintSafe(student, quarterRange, isParent, periodLabel, goalsAll, progressAll, instancesAll, subsAll, enrollAll, assignsAll);
    }).join('');

    const docHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Student Evidence Report &mdash; ${periodLabel}</title>
<style>
  body{font-family:Arial,sans-serif;background:#fff;color:#111;margin:0;padding:24px;}
  table{border-collapse:collapse;width:100%;}
  table th,table td{padding:7px 10px;border:1px solid #ccc;text-align:left;}
  table th{background:#f5f5f5;font-weight:600;}
  .ev-profile{background:#f8f9fa;border:1px solid #ccc;border-radius:10px;padding:18px;margin-bottom:14px;}
  .ev-profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px;margin-bottom:10px;}
  .ev-section-title{font-size:15px;font-weight:600;margin:18px 0 10px;padding-bottom:6px;border-bottom:1px solid #ccc;color:#111;}
  .ev-card{background:#f8f9fa;border:1px solid #ccc;border-radius:8px;padding:12px 16px;margin-bottom:10px;}
  .ev-card-title{font-weight:600;margin-bottom:4px;color:#111;}
  .ev-card-meta{font-size:13px;color:#555;margin-bottom:6px;}
  .ev-score-breakdown{font-size:12px;color:#444;margin-top:4px;}
  .ev-answers{margin-top:8px;}
  .ev-answers-label{font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
  .ev-ans-table{width:100%;border-collapse:collapse;font-size:12px;}
  .ev-ans-table th,.ev-ans-table td{padding:3px 7px;border:1px solid #ddd;}
  .ev-ans-table th{background:#f0f0f0;}
  .ev-ans-ref{color:#555;white-space:nowrap;}
  .ev-ans-val{word-break:break-word;}
  .ev-teacher-note{font-size:12px;color:#555;font-style:italic;margin-top:4px;}
  .ev-conf{background:#fff3cd;border:2px solid #856404;border-radius:6px;padding:8px 14px;font-size:13px;color:#000;font-weight:bold;}
  .ev-empty{color:#888;font-style:italic;}
  .ev-footer{margin-top:28px;border-top:1px solid #ccc;padding-top:10px;font-size:12px;color:#666;}
  @media print{body{padding:0;} .ev-card{page-break-inside:avoid;} [style*="page-break-before"]{page-break-before:always;}}
</style>
</head><body>
  <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #ccc;">
    <div style="font-size:22px;font-weight:700;margin-bottom:6px;">Student Evidence Report</div>
    <div style="font-size:14px;color:#555;">Period: ${periodLabel} &nbsp;|&nbsp; Generated: ${generatedDate} &nbsp;|&nbsp; Data Source: ${sourceLabel}</div>
  </div>
  ${sections}
  <div class="ev-footer">
    Reinisch Classroom &mdash; Student Evidence Report &mdash; ${generatedDate}
  </div>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) { console.warn('[tc-library] Could not open print window.'); return; }
    win.document.write(docHtml);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  /**
   * Build print-safe (light theme) evidence HTML for one student — used by the print window.
   */
  function _buildLibraryEvidenceHtmlPrintSafe(student, quarterRange, isParent, periodLabel, goalsAll, progressAll, instancesAll, subsAll, enrollAll, assignsAll) {

    const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const audienceLabel = isParent ? 'Parent' : 'Admin';

    const studentEnrollments = enrollAll.filter(
      (e) => e.student_code === student.code || e.student_id === student.code
    );
    const classNames = studentEnrollments.length > 0
      ? studentEnrollments.map((e) => esc(e.class_name || e.class_code || '')).filter(Boolean).join(', ')
      : 'N/A';

    const profileHtml = `
      <div class="ev-profile">
        <div style="font-size:18px;font-weight:700;margin-bottom:10px;">Student Evidence Report</div>
        <div class="ev-profile-grid">
          <div><strong>Student:</strong> ${esc(student.name || student.code)} (${esc(student.code)})</div>
          <div><strong>Report Date:</strong> ${esc(todayLabel)}</div>
          <div><strong>Classes:</strong> ${classNames || 'N/A'}</div>
          <div><strong>Period:</strong> ${esc(periodLabel)}</div>
          <div><strong>Status:</strong> ${student.active !== false ? 'Active' : 'Inactive'}</div>
          <div><strong>Mode:</strong> ${esc(audienceLabel)}</div>
        </div>
        <div class="ev-conf">&#9888; CONFIDENTIAL &mdash; For authorized personnel only (FERPA)</div>
      </div>`;

    // Goals
    const activeGoals = goalsAll.filter(
      (g) => g.student_code === student.code && _isGoalActive(g)
    );

    let goalsHtml = '';
    if (activeGoals.length === 0) {
      goalsHtml = '<div class="ev-empty">No active IEP goals found for this student.</div>';
    } else {
      const startDate = new Date(quarterRange.start);
      const endDate = new Date(quarterRange.end);
      const goalRows = activeGoals.map((goal) => {
        const pts = progressAll.filter((p) => {
          if (p.goal_code !== goal.code || p.student_code !== student.code) return false;
          const pd = new Date(p.date);
          return pd >= startDate && pd <= endDate;
        });
        const vals = pts.map((p) => parseFloat(p.value)).filter((v) => !isNaN(v));
        const avg = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
        const progressCell = isParent
          ? (avg == null ? 'No data yet' : parseFloat(avg) >= 80 ? '✅ On track' : parseFloat(avg) >= 60 ? '📈 Making progress' : '⚠️ Needs support')
          : (avg != null ? formatGoalValue(parseFloat(avg), goal.measurement_type, goal) : '—');
        const target = goal.target != null ? esc(String(goal.target)) : '—';
        const mastery = goal.mastery != null ? esc(String(goal.mastery)) : (goal.target != null ? esc(String(goal.target)) : '—');
        const baseline = goal.baseline != null ? esc(String(goal.baseline)) : '—';
        const adminCols = isParent ? '' : `<td>${pts.length} pts</td>`;
        return `<tr><td>${esc(goal.code || goal.id || '—')}</td><td>${esc(goal.area || goal.skill_area || '—')}</td><td>${baseline}</td><td>${esc(progressCell)}</td><td>${mastery}</td><td>${target}</td>${adminCols}</tr>`;
      }).join('');
      const adminHeader = isParent ? '' : '<th>Data Pts</th>';
      goalsHtml = `<table>
        <caption style="text-align:left;font-weight:600;margin-bottom:6px;caption-side:top;">IEP Goal Progress</caption>
        <thead><tr><th>Goal</th><th>Area</th><th>Baseline</th><th>Progress</th><th>Mastery</th><th>Target</th>${adminHeader}</tr></thead>
        <tbody>${goalRows}</tbody>
      </table>`;
    }

    // Assignments
    const startDate2 = new Date(quarterRange.start);
    const endDate2 = new Date(quarterRange.end);
    const studentInsts = instancesAll.filter(
      (inst) => inst.student_code === student.code || inst.student_id === student.code
    );
    const rangedInsts = studentInsts.filter((inst) => {
      const d = new Date(inst.assigned_at || inst.created_at || '');
      return isNaN(d.getTime()) || (d >= startDate2 && d <= endDate2);
    });

    let assignHtml = '';
    if (rangedInsts.length === 0) {
      assignHtml = '<div class="ev-empty">No assignments found for this period.</div>';
    } else {
      assignHtml = rangedInsts.map((inst) => {
        const assignment = assignsAll.find((a) => a.id === inst.assignment_id);
        const submission = subsAll.find(
          (s) => s.instance_id === inst.id || (s.assignment_instances && s.assignment_instances.id === inst.id)
        );
        const title = esc(assignment?.title || `Assignment ${inst.assignment_id}`);
        const type = esc(assignment?.type || '—');
        const score = submission?.score_total ?? submission?.score;
        const status = submission ? (score != null ? 'Graded' : 'Submitted') : 'Pending';
        const assignedDate = esc(_libFormatDate(inst.assigned_at || inst.created_at));
        const metaRow = isParent
          ? `Assigned: ${assignedDate} | Status: ${esc(status)}`
          : `Type: ${type} | Assigned: ${assignedDate} | Status: ${esc(status)} | Score: ${score != null ? score + '%' : '—'}`;

        // Pre-filter goals to this student only (FERPA: never show another
        // student's IEP goal on this student's report).
        const studentGoalsAll = student.code
          ? goalsAll.filter((g) => g.student_code === student.code)
          : [];
        const answerDetail = _buildLibraryRichAnswerHtml(
          submission,
          assignment,
          studentGoalsAll,
          isParent,
          false /* lightTheme for print */,
          student.code
        );

        return `<div class="ev-card"><div class="ev-card-title">${title}</div><div class="ev-card-meta">${metaRow}</div>${answerDetail}</div>`;
      }).join('');
    }

    return `
      <div style="margin-bottom:32px;">
        ${profileHtml}
        <div class="ev-section-title">IEP Goal Progress Summary</div>
        ${goalsHtml}
        <div class="ev-section-title">Assignment Detail Trail</div>
        ${assignHtml}
      </div>`;
  }

  async function _generateLibraryEvidenceZip(targetStudents, quarterRange, isParent, sourceLabel, periodLabel, goalsAll, progressAll, instancesAll, subsAll, _enrollAll, assignsAll) {
    /* global JSZip */
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip is not loaded. Please check your network connection.');
    }
    // eslint-disable-next-line no-undef
    const zip = new JSZip();
    const today = new Date().toISOString().split('T')[0];
    const folderName = `evidence-report-${today}`;
    const root = zip.folder(folderName);
    const generatedTs = new Date().toISOString();

    // manifest.json
    const manifest = {
      generated: generatedTs,
      period: periodLabel,
      audience: isParent ? 'Parent' : 'Admin',
      dataSource: sourceLabel,
      students: targetStudents.map((s) => ({ code: s.code, name: s.name || s.code, active: s.active !== false })),
      dateRange: quarterRange,
    };
    root.file('manifest.json', JSON.stringify(manifest, null, 2));

    // index.html
    const esc2 = (v) => {
      if (!v && v !== 0) return '';
      const d = document.createElement('div');
      d.textContent = String(v);
      return d.innerHTML;
    };
    const tocRows = targetStudents.map((s) => {
      return `<li><a href="${esc2(s.code)}/cover.html">${esc2(s.name || s.code)}</a> &mdash; <a href="${esc2(s.code)}/assignments.html">Assignments</a> | <a href="${esc2(s.code)}/goals.html">Goals</a></li>`;
    }).join('\n');
    const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    root.file('index.html', `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Evidence Report &mdash; ${esc2(periodLabel)}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;}ul{line-height:2;}</style></head>
<body><h1>Student Evidence Report</h1>
<p>Period: ${esc2(periodLabel)} | Generated: ${esc2(generatedDate)} | Data Source: ${esc2(sourceLabel)}</p>
<ul>${tocRows}</ul>
<p style="color:#666;font-size:12px;margin-top:32px;">Reinisch Classroom &mdash; CONFIDENTIAL (FERPA)</p></body></html>`);

    // Per-student folders
    for (const student of targetStudents) {
      const sFolder = root.folder(student.code);
      sFolder.file('cover.html', _buildLibraryCoverHtml(student, quarterRange, isParent, sourceLabel, periodLabel, goalsAll, progressAll, instancesAll));
      sFolder.file('assignments.html', _buildLibraryAssignmentsHtml(student, quarterRange, isParent, periodLabel, instancesAll, subsAll, assignsAll));
      sFolder.file('goals.html', _buildLibraryGoalsHtml(student, quarterRange, isParent, periodLabel, goalsAll, progressAll));
    }

    const zipBlob = await root.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function _buildLibraryCoverHtml(student, quarterRange, isParent, sourceLabel, periodLabel, goalsAll, progressAll, instancesAll) {
    const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const activeGoals = goalsAll.filter((g) => g.student_code === student.code && _isGoalActive(g));
    const goalAreas = [...new Set(activeGoals.map((g) => g.area || g.skill_area || '—'))].join(', ') || '—';
    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);
    const rangedInsts = instancesAll.filter((inst) => {
      if (inst.student_code !== student.code && inst.student_id !== student.code) return false;
      const d = new Date(inst.assigned_at || inst.created_at || '');
      return isNaN(d.getTime()) || (d >= startDate && d <= endDate);
    });
    const dpCount = activeGoals.reduce((acc, g) => {
      return acc + progressAll.filter((p) => {
        if (p.goal_code !== g.code || p.student_code !== student.code) return false;
        const pd = new Date(p.date);
        return pd >= startDate && pd <= endDate;
      }).length;
    }, 0);
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<title>Cover &mdash; ${esc(student.name || student.code)}</title>
<style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;}table{border-collapse:collapse;width:100%;}td,th{padding:10px 14px;border:1px solid #ddd;}th{background:#f5f5f5;}.conf{background:#fff3f3;border:1px solid #f87171;border-radius:6px;padding:10px;font-size:13px;color:#b91c1c;margin-top:20px;}</style>
</head><body>
<h1>Student Evidence Report</h1><h2>${esc(student.name || student.code)}</h2>
<table>
<tr><th>Student Code</th><td>${esc(student.code)}</td></tr>
<tr><th>Period</th><td>${esc(periodLabel)}</td></tr>
<tr><th>Audience</th><td>${esc(isParent ? 'Parent' : 'Admin')}</td></tr>
<tr><th>Goal Areas</th><td>${esc(goalAreas)}</td></tr>
<tr><th>Active Goals</th><td>${activeGoals.length}</td></tr>
<tr><th>Assignments This Period</th><td>${rangedInsts.length}</td></tr>
<tr><th>Data Points This Period</th><td>${dpCount}</td></tr>
<tr><th>Data Source</th><td>${esc(sourceLabel)}</td></tr>
<tr><th>Generated</th><td>${esc(generatedDate)}</td></tr>
</table>
<div class="conf">&#9888; CONFIDENTIAL &mdash; For authorized personnel only (FERPA)</div>
<p style="margin-top:20px;"><a href="assignments.html">Assignments</a> | <a href="goals.html">Goal Progress</a></p>
</body></html>`;
  }

  function _buildLibraryAssignmentsHtml(student, quarterRange, isParent, periodLabel, instancesAll, subsAll, assignsAll) {
    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);
    const rangedInsts = instancesAll.filter((inst) => {
      if (inst.student_code !== student.code && inst.student_id !== student.code) return false;
      const d = new Date(inst.assigned_at || inst.created_at || '');
      return isNaN(d.getTime()) || (d >= startDate && d <= endDate);
    });
    let rows = rangedInsts.length === 0
      // parent: 3 cols (Title, Assigned, Status); admin: +Score +Paper = 5 cols
      ? `<tr><td colspan="${isParent ? 3 : 5}" style="color:#888;font-style:italic;">No assignments found.</td></tr>`
      : rangedInsts.map((inst) => {
          const a = assignsAll.find((x) => x.id === inst.assignment_id);
          const sub = subsAll.find((s) => s.instance_id === inst.id || (s.assignment_instances && s.assignment_instances.id === inst.id));
          const score = sub?.score_total ?? sub?.score;
          const status = sub ? (score != null ? 'Graded' : 'Submitted') : 'Pending';
          const paperUrl = a?.paper_upload_url || sub?.paper_upload_url || '';
          const paperCell = paperUrl ? `<a href="${esc(paperUrl)}" target="_blank">View Upload</a>` : '—';
          return `<tr>
            <td>${esc(a?.title || `Assignment ${inst.assignment_id}`)}</td>
            <td>${esc(_libFormatDate(inst.assigned_at || inst.created_at))}</td>
            <td>${esc(status)}</td>
            ${isParent ? '' : `<td>${score != null ? esc(score + '%') : '—'}</td><td>${paperCell}</td>`}
          </tr>`;
        }).join('');
    const adminCols = isParent ? '' : '<th>Score</th><th>Paper Upload</th>';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<title>Assignments &mdash; ${esc(student.name || student.code)}</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:20px;}table{border-collapse:collapse;width:100%;}td,th{padding:9px 12px;border:1px solid #ddd;}th{background:#f5f5f5;}</style>
</head><body>
<h1>Assignments &mdash; ${esc(student.name || student.code)}</h1>
<p>Period: ${esc(periodLabel)} | <a href="cover.html">Back to Cover</a></p>
<table><thead><tr><th>Title</th><th>Assigned</th><th>Status</th>${adminCols}</tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
  }

  function _buildLibraryGoalsHtml(student, quarterRange, isParent, periodLabel, goalsAll, progressAll) {
    const activeGoals = goalsAll.filter((g) => g.student_code === student.code && _isGoalActive(g));
    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);
    let rows = activeGoals.length === 0
      ? '<tr><td colspan="6" style="color:#888;font-style:italic;">No active IEP goals found.</td></tr>'
      : activeGoals.map((goal) => {
          const pts = progressAll.filter((p) => {
            if (p.goal_code !== goal.code || p.student_code !== student.code) return false;
            const pd = new Date(p.date);
            return pd >= startDate && pd <= endDate;
          });
          const vals = pts.map((p) => parseFloat(p.value)).filter((v) => !isNaN(v));
          const avg = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
          const progress = isParent
            ? (avg == null ? 'No data' : parseFloat(avg) >= 80 ? 'On track' : parseFloat(avg) >= 60 ? 'Making progress' : 'Needs support')
            : (avg != null ? formatGoalValue(parseFloat(avg), goal.measurement_type, goal) : '—');
          const dpCol = isParent ? '' : `<td>${pts.length} pts</td>`;
          return `<tr>
            <td>${esc(goal.code || goal.id || '—')}</td>
            <td>${esc(goal.area || goal.skill_area || '—')}</td>
            <td style="font-size:12px;">${esc(goal.desc || goal.description || '—')}</td>
            <td>${goal.baseline != null ? esc(String(goal.baseline)) : '—'}</td>
            <td>${esc(progress)}</td>
            <td>${goal.mastery != null ? esc(String(goal.mastery)) : (goal.target != null ? esc(String(goal.target)) : '—')}</td>
            <td>${goal.target != null ? esc(String(goal.target)) : '—'}</td>
            ${dpCol}
          </tr>`;
        }).join('');
    const adminDpCol = isParent ? '' : '<th>Data Pts</th>';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<title>Goals &mdash; ${esc(student.name || student.code)}</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:20px;}table{border-collapse:collapse;width:100%;}td,th{padding:9px 12px;border:1px solid #ddd;}th{background:#f5f5f5;}</style>
</head><body>
<h1>IEP Goal Progress &mdash; ${esc(student.name || student.code)}</h1>
<p>Period: ${esc(periodLabel)} | <a href="cover.html">Back to Cover</a></p>
<table><thead><tr><th>Goal</th><th>Area</th><th>Description</th><th>Baseline</th><th>Progress</th><th>Mastery</th><th>Target</th>${adminDpCol}</tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
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

  function exportFinalizedCSV(filteredList) {
    const escCsv = (v) => {
      const s = String(v != null ? v : '');
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };
    const rows = [['Title', 'Class', 'Student Count', 'Avg Score (%)', 'Date Finalized', 'Status']];
    filteredList.forEach(a => {
      const stats = getAssignmentStats(a, instancesData, submissionsData);
      const className = inferClassName(a) || '';
      const finalDate = getFinalizationDate(a, instancesData, submissionsData);
      const status = a.active === false ? 'Archived' : 'Active';
      rows.push([
        a.title || 'Untitled',
        className,
        String(stats.studentCount),
        stats.avgScore != null ? String(stats.avgScore) : '',
        finalDate.toLocaleDateString(),
        status
      ]);
    });
    const csv = rows.map(row => row.map(escCsv).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finalized-assignments-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('CSV exported');
  }

  function printFinalizedReport(filteredList) {
    const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const filterParts = [];
    if (filters.finalized.classFilter !== 'All Classes') filterParts.push('Class: ' + filters.finalized.classFilter);
    if (filters.finalized.studentFilter.trim()) filterParts.push('Student: ' + filters.finalized.studentFilter.trim());
    if (filters.finalized.weekFilter.trim()) filterParts.push('Week: ' + filters.finalized.weekFilter.trim());
    if (filters.finalized.dateFrom.trim()) filterParts.push('From: ' + filters.finalized.dateFrom);
    if (filters.finalized.dateTo.trim()) filterParts.push('To: ' + filters.finalized.dateTo);
    const filterSummary = filterParts.length > 0 ? filterParts.join(' | ') : 'All finalized assignments';
    const rows = filteredList.map(a => {
      const stats = getAssignmentStats(a, instancesData, submissionsData);
      const className = inferClassName(a) || '\u2014';
      const finalDate = getFinalizationDate(a, instancesData, submissionsData);
      const status = a.active === false ? 'Archived' : 'Active';
      return `<tr>
        <td>${esc(a.title || 'Untitled')}</td>
        <td>${esc(className)}</td>
        <td>${esc(stats.studentCount)}</td>
        <td>${stats.avgScore != null ? esc(stats.avgScore + '%') : '\u2014'}</td>
        <td>${esc(finalDate.toLocaleDateString())}</td>
        <td>${esc(status)}</td>
      </tr>`;
    }).join('');
    const docHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Finalized Assignments Report</title>
<style>
  body{font-family:Arial,sans-serif;background:#fff;color:#111;margin:0;padding:24px;}
  h1{font-size:22px;margin:0 0 6px 0;}
  .meta{font-size:13px;color:#555;margin-bottom:18px;border-bottom:1px solid #ddd;padding-bottom:10px;}
  table{border-collapse:collapse;width:100%;}
  th,td{padding:9px 12px;border:1px solid #ddd;text-align:left;}
  th{background:#f5f5f5;font-weight:600;}
  tr:nth-child(even){background:#fafafa;}
  @media print{body{padding:0;} table{page-break-inside:auto;} tr{page-break-inside:avoid;}}
</style>
</head><body>
<h1>Finalized Assignments Report</h1>
<div class="meta">Generated: ${esc(generatedDate)} &nbsp;|&nbsp; Filters: ${esc(filterSummary)} &nbsp;|&nbsp; Total: ${filteredList.length}</div>
<table>
  <thead><tr><th>Title</th><th>Class</th><th>Students</th><th>Avg Score (%)</th><th>Date Finalized</th><th>Status</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) {
      showToast('Could not open print window \u2014 please allow popups.', '#ef4444', '#fff');
      return;
    }
    win.document.write(docHtml);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  // ── Start ─────────────────────────────────────────────────────────────────────

  init();
})();
