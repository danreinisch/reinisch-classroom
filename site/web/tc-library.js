/**
 * tc-library.js
 * Teacher Center Library page - browse, search, and manage assignments and lessons
 */

(async () => {
  "use strict";

  // Page guard - only run on library page
  if (!location.pathname.startsWith("/teacher/library")) return;

  // Import data adapter
  const { db, isRemote } = await import('/web/data-adapter.js');
  const { CANON_CLASSES } = await import('/web/constants.js');

  // DOM helper
  const $ = (id) => document.getElementById(id);

  // State
  let _currentTab = "assignments";
  let assignmentsData = [];
  let lessonsData = null;
  let syncStatus = "loading";

  // Filter state
  let filters = {
    assignments: {
      classFilter: "All Classes",
      searchQuery: "",
      typeFilter: "All"
    },
    lessons: {
      searchQuery: ""
    }
  };

  // Initialize
  async function init() {
    console.log("[tc-library] Initializing...");
    
    // Render UI structure
    renderTabBar();
    renderTabContent();
    
    // Load data
    await loadAssignments();
    await loadLessons();
    
    // Attach event listeners
    attachEventListeners();
    
    // Show initial tab
    switchTab("assignments");
  }

  // Render tab bar
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

  // Render tab content containers
  function renderTabContent() {
    const main = $("tcLibraryMain");
    if (!main) return;

    const contentHtml = `
      <div id="assignmentsTab" class="tc-lib-tab-content" style="display: none;"></div>
      <div id="lessonsTab" class="tc-lib-tab-content" style="display: none;"></div>
    `;

    main.insertAdjacentHTML('beforeend', contentHtml);
  }

  // Switch tabs
  function switchTab(tabName) {
    _currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tc-lib-tab-btn').forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
    });

    // Show/hide tab content
    const assignmentsTab = $("assignmentsTab");
    const lessonsTab = $("lessonsTab");

    if (assignmentsTab && lessonsTab) {
      assignmentsTab.style.display = tabName === "assignments" ? "block" : "none";
      lessonsTab.style.display = tabName === "lessons" ? "block" : "none";
    }

    // Render content
    if (tabName === "assignments") {
      renderAssignmentsTab();
    } else if (tabName === "lessons") {
      renderLessonsTab();
    }
  }

  // Load assignments from Supabase/localStorage
  async function loadAssignments() {
    console.log("[tc-library] Loading assignments...");
    
    try {
      const remote = await isRemote();
      
      // Try Supabase first
      if (remote) {
        console.log("[tc-library] Fetching from Supabase...");
        assignmentsData = await db.listAssignments();
        syncStatus = "synced";
      } else {
        // Fall back to localStorage drafts
        console.log("[tc-library] Falling back to localStorage...");
        const draftsJson = localStorage.getItem("rc_tc_work_drafts_v1");
        if (draftsJson) {
          const drafts = JSON.parse(draftsJson);
          assignmentsData = drafts.map(draft => ({
            id: draft.id,
            title: draft.title,
            type: draft.assignment?.kind || "file",
            series: draft.className || "",
            created_at: draft.submittedAt || new Date().toISOString(),
            meta: draft.mapping?.text || "",
            page: draft.assignment?.text || ""
          }));
        } else {
          assignmentsData = [];
        }
        syncStatus = "local";
      }

      console.log(`[tc-library] Loaded ${assignmentsData.length} assignments`);
    } catch (err) {
      console.error("[tc-library] Error loading assignments:", err);
      syncStatus = "error";
      assignmentsData = [];
    }
  }

  // Load lessons from lessons-index.json
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

  // Render Assignments tab
  function renderAssignmentsTab() {
    const container = $("assignmentsTab");
    if (!container) return;

    // Clear previous content
    container.innerHTML = '';

    // Filter assignments
    const filtered = filterAssignments();

    // Calculate KPIs
    const kpis = calculateAssignmentKPIs();

    // Sync status row
    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 14px; color: rgba(255,255,255,.60);';
    const statusLabel = document.createElement('span');
    statusLabel.textContent = 'Status:';
    statusRow.appendChild(statusLabel);
    statusRow.appendChild(getSyncStatusBadge());
    container.appendChild(statusRow);

    // KPI grid
    const kpiGrid = document.createElement('div');
    kpiGrid.className = 'tc-lib-kpi-grid';
    kpiGrid.appendChild(renderKPI('Total Assignments', kpis.total));
    kpiGrid.appendChild(renderKPI('File Assignments', kpis.fileCount));
    kpiGrid.appendChild(renderKPI('Link Assignments', kpis.linkCount));
    kpiGrid.appendChild(renderKPI('With Mapping', kpis.withMeta));
    container.appendChild(kpiGrid);

    // Filter bar
    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'margin-bottom: 24px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center;';

    // Class filter buttons
    const classBtnWrap = document.createElement('div');
    classBtnWrap.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';
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
    searchInput.style.cssText = 'flex: 1; min-width: 200px; padding: 8px 12px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: white;';
    filterBar.appendChild(searchInput);

    // Type filter select
    const typeFilter = document.createElement('select');
    typeFilter.id = 'assignmentTypeFilter';
    typeFilter.className = 'tc-input';
    typeFilter.style.cssText = 'padding: 8px 12px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: white;';
    [['All', 'All Types'], ['file', 'File'], ['link', 'Link']].forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      typeFilter.appendChild(opt);
    });
    typeFilter.value = filters.assignments.typeFilter;
    filterBar.appendChild(typeFilter);

    container.appendChild(filterBar);

    // Assignment cards or empty state
    if (filtered.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'tc-card';
      emptyCard.style.cssText = 'text-align: center; padding: 48px 24px;';
      const emptyIcon = document.createElement('div');
      emptyIcon.style.cssText = 'font-size: 48px; margin-bottom: 16px;';
      emptyIcon.textContent = '📭';
      const emptyTitle = document.createElement('h3');
      emptyTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 20px;';
      emptyTitle.textContent = 'No assignments found';
      emptyCard.appendChild(emptyIcon);
      emptyCard.appendChild(emptyTitle);
      const emptyMsg = document.createElement('p');
      emptyMsg.style.cssText = 'margin: 0; color: rgba(255,255,255,.60);';
      if (assignmentsData.length === 0) {
        // SAFETY: static text + static link, no user data
        emptyMsg.innerHTML = 'Create one in <a href="/teacher/work/" style="color: #60a5fa;">Work →</a>';
      } else {
        emptyMsg.textContent = 'Try adjusting your filters';
      }
      emptyCard.appendChild(emptyMsg);
      container.appendChild(emptyCard);
    } else {
      const grid = document.createElement('div');
      grid.className = 'tc-lib-grid';
      filtered.forEach(a => grid.appendChild(renderAssignmentCard(a)));
      container.appendChild(grid);
    }

    // Update active filter button
    updateActiveClassFilter();
  }

  // Filter assignments based on current filters
  function filterAssignments() {
    let filtered = [...assignmentsData];

    // Class filter
    if (filters.assignments.classFilter !== "All Classes") {
      filtered = filtered.filter(a => a.series === filters.assignments.classFilter);
    }

    // Search filter
    if (filters.assignments.searchQuery.trim()) {
      const query = filters.assignments.searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        (a.title || "").toLowerCase().includes(query)
      );
    }

    // Type filter
    if (filters.assignments.typeFilter !== "All") {
      filtered = filtered.filter(a => a.type === filters.assignments.typeFilter);
    }

    return filtered;
  }

  // Calculate assignment KPIs
  function calculateAssignmentKPIs() {
    return {
      total: assignmentsData.length,
      fileCount: assignmentsData.filter(a => a.type === "file").length,
      linkCount: assignmentsData.filter(a => a.type === "link").length,
      withMeta: assignmentsData.filter(a => a.meta && (typeof a.meta === 'string' ? a.meta.trim() : true)).length
    };
  }

  // Render a KPI card — returns a DOM element
  function renderKPI(label, value) {
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'padding: 20px; text-align: center;';
    const labelEl = document.createElement('div');
    labelEl.style.cssText = 'font-size: 14px; color: rgba(255,255,255,.60); margin-bottom: 8px;';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.style.cssText = 'font-size: 32px; font-weight: 600;';
    valueEl.textContent = String(value);
    card.appendChild(labelEl);
    card.appendChild(valueEl);
    return card;
  }

  // Get sync status badge — returns a DOM element
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

  // Render an assignment card — returns a DOM element
  function renderAssignmentCard(assignment) {
    const createdDate = assignment.created_at
      ? new Date(assignment.created_at).toLocaleDateString()
      : 'Unknown';

    const card = document.createElement('div');
    card.className = 'tc-card assignment-card';
    card.dataset.id = assignment.id || '';
    card.style.cssText = 'padding: 20px; cursor: pointer; transition: transform 0.2s, border-color 0.2s;';

    // Header row
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;';
    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'margin: 0; font-size: 18px; flex: 1;';
    titleEl.textContent = assignment.title || 'Untitled';
    const typePill = document.createElement('span');
    typePill.className = 'tc-pill';
    typePill.style.cssText = 'background: rgba(96,165,250,.20); color: #60a5fa; padding: 4px 12px; border-radius: 12px; font-size: 12px; white-space: nowrap;';
    typePill.textContent = assignment.type || 'file';
    headerRow.appendChild(titleEl);
    headerRow.appendChild(typePill);
    card.appendChild(headerRow);

    if (assignment.series) {
      const seriesEl = document.createElement('div');
      seriesEl.style.cssText = 'color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 8px;';
      seriesEl.textContent = '📚 ' + assignment.series;
      card.appendChild(seriesEl);
    }

    const dateEl = document.createElement('div');
    dateEl.style.cssText = 'color: rgba(255,255,255,.40); font-size: 13px; margin-bottom: 16px;';
    dateEl.textContent = 'Created: ' + createdDate;
    card.appendChild(dateEl);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 8px;';
    const issueBtn = document.createElement('button');
    issueBtn.className = 'tc-btn issue-btn';
    issueBtn.dataset.id = assignment.id || '';
    issueBtn.style.cssText = 'flex: 1; font-size: 14px;';
    issueBtn.textContent = 'Issue to Class';
    btnRow.appendChild(issueBtn);
    card.appendChild(btnRow);

    return card;
  }

  // Update active class filter button
  function updateActiveClassFilter() {
    document.querySelectorAll('.tc-lib-class-filter').forEach(btn => {
      const isActive = btn.dataset.class === filters.assignments.classFilter;
      btn.classList.toggle('active', isActive);
    });
  }

  // Render Lessons tab
  function renderLessonsTab() {
    const container = $("lessonsTab");
    if (!container) return;

    // Clear previous content
    container.innerHTML = '';

    // Search bar — use createElement so .value is set safely
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

    // Empty state or lessons
    if (!lessonsData || !lessonsData.sections) {
      // SAFETY: static text, no user data
      const emptyCard = document.createElement('div');
      emptyCard.className = 'tc-card';
      emptyCard.style.cssText = 'text-align: center; padding: 48px 24px;';
      emptyCard.innerHTML = '<div style="font-size: 48px; margin-bottom: 16px;">📚</div><h3 style="margin: 0 0 8px 0; font-size: 20px;">Lessons index not available</h3><p style="margin: 0; color: rgba(255,255,255,.60);">Run the generator script to build the lessons index.</p>';
      container.appendChild(emptyCard);
    } else {
      // Filter lessons based on search
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

  // Filter lessons based on search query
  function filterLessons() {
    if (!lessonsData || !lessonsData.sections) return [];

    const query = filters.lessons.searchQuery.toLowerCase().trim();
    if (!query) return lessonsData.sections;

    // Filter sections, units, and presentations
    return lessonsData.sections
      .map(section => {
        // Check if section name matches
        if (section.name.toLowerCase().includes(query)) {
          return section;
        }

        // Filter units
        const filteredUnits = section.units
          .map(unit => {
            // Check if unit name matches
            if (unit.name.toLowerCase().includes(query)) {
              return unit;
            }

            // Filter presentations
            const filteredPresentations = unit.presentations.filter(pres =>
              pres.name.toLowerCase().includes(query)
            );

            if (filteredPresentations.length > 0) {
              return { ...unit, presentations: filteredPresentations };
            }

            return null;
          })
          .filter(unit => unit !== null);

        if (filteredUnits.length > 0) {
          return { ...section, units: filteredUnits };
        }

        return null;
      })
      .filter(section => section !== null);
  }

  // Render a lesson section — returns a DOM element
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
    iconSpan.textContent = '▼';

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

  // Render a lesson unit — returns a DOM element
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
    iconSpan.textContent = '▶';

    toggleBtn.appendChild(nameSpan);
    toggleBtn.appendChild(iconSpan);
    wrapper.appendChild(toggleBtn);

    const contentDiv = document.createElement('div');
    contentDiv.id = unitId;
    contentDiv.className = 'lesson-unit-content';
    contentDiv.style.cssText = 'display: none; margin-top: 12px;';

    unit.presentations.forEach(pres => {
      contentDiv.appendChild(renderPresentation(pres));
    });

    wrapper.appendChild(contentDiv);
    return wrapper;
  }

  // Render a presentation — returns a DOM element
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

  // Attach event listeners
  function attachEventListeners() {
    // Tab switching
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.tc-lib-tab-btn');
      if (tabBtn) {
        switchTab(tabBtn.dataset.tab);
      }
    });

    // Class filter
    document.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('.tc-lib-class-filter');
      if (filterBtn) {
        filters.assignments.classFilter = filterBtn.dataset.class;
        renderAssignmentsTab();
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

    // Lesson search
    document.addEventListener('input', (e) => {
      if (e.target.id === 'lessonSearch') {
        filters.lessons.searchQuery = e.target.value;
        renderLessonsTab();
      }
    });

    // Section/unit toggle
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

    // Assignment card click (show detail)
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.assignment-card');
      // Don't trigger if clicking the issue button
      if (card && !e.target.closest('.issue-btn')) {
        const assignmentId = card.dataset.id;
        showAssignmentDetail(assignmentId);
      }
    });

    // Issue button
    document.addEventListener('click', (e) => {
      const issueBtn = e.target.closest('.issue-btn');
      if (issueBtn) {
        e.stopPropagation();
        const assignmentId = issueBtn.dataset.id;
        // Link to Work page with assignment pre-selected
        window.location.href = `/teacher/work/?assignment=${encodeURIComponent(assignmentId)}`;
      }
    });

    // Export button
    const exportBtn = $('exportLibraryBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportLibraryJSON);
    }

    // Upload Paper Assignment button
    const uploadBtn = $('uploadPaperBtn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', openUploadPaperModal);
    }
  }

  // Show assignment detail modal
  function showAssignmentDetail(assignmentId) {
    const assignment = assignmentsData.find(a => a.id === assignmentId);
    if (!assignment) return;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'assignmentDetailOverlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,.80);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 24px;
    `;

    const createdDate = assignment.created_at
      ? new Date(assignment.created_at).toLocaleString()
      : 'Unknown';

    // Card
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px;';

    // Header row
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px;';
    const titleEl = document.createElement('h2');
    titleEl.style.cssText = 'margin: 0; font-size: 24px;';
    titleEl.textContent = assignment.title || 'Untitled';
    const closeBtn = document.createElement('button');
    closeBtn.id = 'closeDetailBtn';
    closeBtn.className = 'tc-btn';
    closeBtn.style.cssText = 'padding: 8px 16px;';
    closeBtn.textContent = '✕ Close';
    headerRow.appendChild(titleEl);
    headerRow.appendChild(closeBtn);
    card.appendChild(headerRow);

    // Detail grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; gap: 16px; margin-bottom: 24px;';

    function makeDetailRow(labelText, valueText) {
      const row = document.createElement('div');
      const lbl = document.createElement('div');
      lbl.style.cssText = 'color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 4px;';
      lbl.textContent = labelText;
      const val = document.createElement('div');
      val.textContent = valueText;
      row.appendChild(lbl);
      row.appendChild(val);
      return row;
    }

    grid.appendChild(makeDetailRow('Type', assignment.type || 'file'));
    if (assignment.series) {
      grid.appendChild(makeDetailRow('Class', assignment.series));
    }
    grid.appendChild(makeDetailRow('Created', createdDate));

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

    // Action buttons
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

    // Close button
    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });

    // Issue button in detail
    issueBtn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      window.location.href = `/teacher/work/?assignment=${encodeURIComponent(id)}`;
    });

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }

  // Open the Upload Paper Assignment modal
  async function openUploadPaperModal() {
    // Build today's date string (YYYY-MM-DD) for default value
    const todayStr = new Date().toISOString().split('T')[0];

    const overlay = document.createElement('div');
    overlay.id = 'uploadPaperOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'uploadPaperTitle');
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.80);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 24px;
    `;

    // Build the modal card
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width: 560px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px;';

    // Header row
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
    closeBtn.textContent = '✕ Close';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Form
    const form = document.createElement('form');
    form.id = 'uploadPaperForm';
    form.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

    const fieldStyle = 'width:100%; padding:8px 12px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.2); border-radius:8px; color:white; font-size:15px; box-sizing:border-box;';
    const labelStyle = 'display:block; font-size:14px; color:rgba(255,255,255,.70); margin-bottom:6px;';

    // Helper to build a labeled field wrapper
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

    // Title field
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'up_title';
    titleInput.required = true;
    titleInput.style.cssText = fieldStyle;
    titleInput.placeholder = 'Assignment title';
    form.appendChild(makeField('Title', true, titleInput));

    // Class field
    const classSelect = document.createElement('select');
    classSelect.id = 'up_class';
    classSelect.style.cssText = fieldStyle;
    const defaultClassOpt = document.createElement('option');
    defaultClassOpt.value = '';
    defaultClassOpt.textContent = '— Select class (optional) —';
    classSelect.appendChild(defaultClassOpt);
    CANON_CLASSES.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls;
      opt.textContent = cls;
      classSelect.appendChild(opt);
    });
    form.appendChild(makeField('Class', false, classSelect));

    // Student Code field (optional free text)
    const studentInput = document.createElement('input');
    studentInput.type = 'text';
    studentInput.id = 'up_student_code';
    studentInput.style.cssText = fieldStyle;
    studentInput.placeholder = 'e.g. S001 (optional)';
    const studentHint = document.createElement('div');
    studentHint.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40); margin-top:4px;';
    studentHint.textContent = 'If provided, links this upload to the student\'s history. Code is uppercased automatically.';
    const studentWrap = makeField('Student Code', false, studentInput);
    studentWrap.appendChild(studentHint);
    form.appendChild(studentWrap);

    // Date Completed field
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'up_date';
    dateInput.style.cssText = fieldStyle;
    dateInput.value = todayStr;
    form.appendChild(makeField('Date Completed', false, dateInput));

    // Score Earned field (optional)
    const scoreInput = document.createElement('input');
    scoreInput.type = 'number';
    scoreInput.id = 'up_score';
    scoreInput.min = '0';
    scoreInput.max = '100';
    scoreInput.step = '1';
    scoreInput.style.cssText = fieldStyle;
    scoreInput.placeholder = 'e.g. 85';
    form.appendChild(makeField('Score Earned', false, scoreInput));

    // Total Possible field (optional)
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

    // Notes field
    const notesArea = document.createElement('textarea');
    notesArea.id = 'up_notes';
    notesArea.rows = 3;
    notesArea.style.cssText = fieldStyle + ' resize:vertical;';
    notesArea.placeholder = 'Teacher notes / comments (optional)';
    form.appendChild(makeField('Notes', false, notesArea));

    // File upload field
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'up_file';
    fileInput.required = true;
    fileInput.accept = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.gif,.webp';
    fileInput.style.cssText = 'width:100%; color:white; font-size:14px; cursor:pointer;';

    const fileHint = document.createElement('div');
    fileHint.style.cssText = 'font-size:12px; color:rgba(255,255,255,.40); margin-top:4px;';
    fileHint.textContent = 'PDF, JPG, PNG, HEIC/HEIF, GIF, WEBP — max 10 MB';

    const fileInfo = document.createElement('div');
    fileInfo.id = 'up_file_info';
    fileInfo.style.cssText = 'display:none; margin-top:8px; padding:8px 12px; background:rgba(34,197,94,.10); border:1px solid rgba(34,197,94,.25); border-radius:8px; font-size:13px; color:rgba(255,255,255,.80);';

    const fileWrap = makeField('File', true, fileInput);
    fileWrap.appendChild(fileHint);
    fileWrap.appendChild(fileInfo);
    form.appendChild(fileWrap);

    // Error display
    const errorEl = document.createElement('div');
    errorEl.id = 'up_error';
    errorEl.style.cssText = 'display:none; padding:10px 14px; background:rgba(248,113,113,.15); border:1px solid rgba(248,113,113,.4); border-radius:8px; color:#fca5a5; font-size:14px;';
    form.appendChild(errorEl);

    // Submit button
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

    // File selection → show info
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const f = fileInput.files[0];
        const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
        fileInfo.style.display = 'block';
        fileInfo.textContent = '';
        const nameSpan = document.createElement('strong');
        nameSpan.textContent = f.name;
        fileInfo.appendChild(nameSpan);
        fileInfo.appendChild(document.createTextNode(` — ${sizeMB} MB`));
        // Warn if over 10MB
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

    // Close button
    closeBtn.addEventListener('click', () => overlay.remove());

    // Click outside to close
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Keyboard: Escape to close, focus trap
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

    // Remove keydown listener when overlay is removed
    const observer = new MutationObserver(() => {
      if (!document.body.contains(overlay)) {
        document.removeEventListener('keydown', onKeyDown);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });

    // Form submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await uploadPaperAssignment(overlay);
    });

    // Focus first field
    titleInput.focus();
  }

  // Upload a paper assignment via data-adapter
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

    // Score fields
    const scoreRaw = overlay.querySelector('#up_score').value.trim();
    const totalPossibleRaw = overlay.querySelector('#up_total_possible').value.trim();
    const scoreEarned = scoreRaw !== '' ? Number(scoreRaw) : null;
    const totalPossible = totalPossibleRaw !== '' ? Number(totalPossibleRaw) : 100;

    // Validation
    if (!title) {
      showInlineError('Title is required.');
      overlay.querySelector('#up_title').focus();
      return;
    }

    // Score validation
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

    // File type validation
    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/gif', 'image/webp']);
    const allowedExts = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.gif', '.webp']);
    const fileExt = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedTypes.has(file.type) && !allowedExts.has(fileExt)) {
      showInlineError('Unsupported file type. Please upload a PDF, JPG, PNG, HEIC, HEIF, GIF, or WEBP file.');
      return;
    }

    // File size validation (max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      showInlineError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`);
      return;
    }

    submitBtn.disabled = true;
    const originalBtnHtml = submitBtn.innerHTML;
    // SAFETY: static SVG spinner, no user data
    submitBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Uploading…';

    // Add spin animation if not already present
    if (!document.getElementById('rcSpinStyle')) {
      const style = document.createElement('style');
      style.id = 'rcSpinStyle';
      style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    try {
      let paperUploadUrl = null;
      let gradeRecorded = false;

      if (isRemote) {
        // ── Supabase mode: upload file, then create assignment record ──
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

        // Build assignment meta — include score if provided
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
          // Attempt cleanup of uploaded file (non-critical)
          try { await db.deletePaperFile(storagePath); } catch (_) { /* ignore */ }
          showInlineError('Failed to save assignment record. Please try again.');
          submitBtn.disabled = false;
          // SAFETY: restoring original static button content, no user data
          submitBtn.innerHTML = originalBtnHtml;
          return;
        }

        console.log('[tc-library] Paper assignment created:', newAssignment.id);

        // Optionally create a submission_archives record if student code is provided
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
            // Non-critical — warn but don't fail
            console.warn('[tc-library] Could not create submission archive record (non-critical):', archiveErr.message);
          }
        }

        // Auto-create gradebook entry if score + student code provided
        if (scoreEarned !== null && studentCode && newAssignment) {
          try {
            const scorePercent = Math.round((scoreEarned / totalPossible) * 100);
            const instance = await db.upsertAssignmentInstance({
              id: newAssignment.id + '-' + studentCode,
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
            // Non-critical — warn but don't fail the upload
            console.warn('[tc-library] Could not create gradebook entry (non-critical):', gradeErr.message);
          }
        }

      } else {
        // ── Local mode: metadata-only (no file storage) ──
        console.log('[tc-library] Local mode — storing paper assignment metadata only (file not stored)');

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

        // Store archive metadata in localStorage if student code provided
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

        // Auto-create gradebook entry in local mode if score + student code provided
        if (scoreEarned !== null && studentCode && newAssignment) {
          try {
            const scorePercent = Math.round((scoreEarned / totalPossible) * 100);
            const instanceId = newAssignment.id + '-' + studentCode;
            await db.upsertAssignmentInstance({
              id: instanceId,
              assignment_id: newAssignment.id,
              student_code: studentCode,
              assigned_at: dateCompleted || new Date().toISOString().split('T')[0],
              status: 'Graded'
            });
            await db.addSubmission({
              instance_id: instanceId,
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

      // Success — close modal, refresh list, show toast
      overlay.remove();
      console.log('[tc-library] Paper assignment uploaded successfully');
      const scorePercent = gradeRecorded ? Math.round((scoreEarned / totalPossible) * 100) : null;
      const toastSuffix = !isRemote ? ' (metadata only — local mode)' : '';
      const gradeNote = gradeRecorded ? ` — ${scorePercent}% recorded in Gradebook` : '';
      showToast(`📄 "${title}" saved to Library${gradeNote}${toastSuffix}`);
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

  // Show a brief toast notification
  function showToast(text, bg = '#22c55e', color = '#0b1220') {
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = `position:fixed;bottom:24px;right:24px;background:${bg};color:${color};padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3500);
  }

  // Export library as JSON
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

  // Start initialization
  init();
})();
