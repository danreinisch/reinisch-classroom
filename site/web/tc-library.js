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

  // DOM helper
  const $ = (id) => document.getElementById(id);

  // Canon classes (must match tc-work.js, tc-gradebook.js, tc-reporting.js)
  const CANON_CLASSES = [
    "Language Arts 1 SC",
    "Language Arts 2 SC", 
    "Language Arts 3 SC",
    "Language Arts 4 SC",
    "Life Skills Language Arts SC",
    "Life Skills",
    "Consumer Math",
    "Geometry SC",
    "Speech/Language",
    "Warrior Academy"
  ];

  // State
  let currentTab = "assignments";
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
      <div class="tc-lib-tabs" style="display: flex; gap: 12px; margin-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,.10); padding-bottom: 12px;">
        <button class="tc-btn tc-lib-tab-btn" data-tab="assignments" style="display: flex; align-items: center; gap: 8px;">
          <span>📝</span> Assignments
        </button>
        <button class="tc-btn tc-lib-tab-btn" data-tab="lessons" style="display: flex; align-items: center; gap: 8px;">
          <span>📖</span> Lessons
        </button>
        <div style="flex: 1;"></div>
        <button id="exportLibraryBtn" class="tc-btn" style="margin-left: auto;">
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
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tc-lib-tab-btn').forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      btn.style.background = isActive ? 'rgba(255,255,255,.15)' : '';
      btn.style.borderColor = isActive ? 'rgba(255,255,255,.20)' : '';
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

    // Filter assignments
    const filtered = filterAssignments();

    // Calculate KPIs
    const kpis = calculateAssignmentKPIs();

    // Build HTML
    let html = `
      <!-- Sync Status -->
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 14px; color: rgba(255,255,255,.60);">
        <span>Status:</span>
        ${getSyncStatusBadge()}
      </div>

      <!-- KPI Row -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
        ${renderKPI("Total Assignments", kpis.total)}
        ${renderKPI("File Assignments", kpis.fileCount)}
        ${renderKPI("Link Assignments", kpis.linkCount)}
        ${renderKPI("With Mapping", kpis.withMeta)}
      </div>

      <!-- Filter Bar -->
      <div style="margin-bottom: 24px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
        <!-- Class Filter -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="tc-lib-class-filter tc-btn" data-class="All Classes">All Classes</button>
          ${CANON_CLASSES.map(cls => 
            `<button class="tc-lib-class-filter tc-btn" data-class="${escapeHtml(cls)}">${escapeHtml(cls)}</button>`
          ).join('')}
        </div>

        <!-- Search -->
        <input 
          type="text" 
          id="assignmentSearch" 
          class="tc-input" 
          placeholder="Search assignments..."
          value="${escapeHtml(filters.assignments.searchQuery)}"
          style="flex: 1; min-width: 200px; padding: 8px 12px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: white;">

        <!-- Type Filter -->
        <select id="assignmentTypeFilter" class="tc-input" style="padding: 8px 12px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: white;">
          <option value="All">All Types</option>
          <option value="file">File</option>
          <option value="link">Link</option>
        </select>
      </div>
    `;

    // Assignment cards or empty state
    if (filtered.length === 0) {
      html += `
        <div class="tc-card" style="text-align: center; padding: 48px 24px;">
          <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
          <h3 style="margin: 0 0 8px 0; font-size: 20px;">No assignments found</h3>
          <p style="margin: 0; color: rgba(255,255,255,.60);">
            ${assignmentsData.length === 0 
              ? 'Create one in <a href="/teacher/work/" style="color: #60a5fa;">Work →</a>'
              : 'Try adjusting your filters'
            }
          </p>
        </div>
      `;
    } else {
      html += `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
          ${filtered.map(renderAssignmentCard).join('')}
        </div>
      `;
    }

    container.innerHTML = html;

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
      withMeta: assignmentsData.filter(a => a.meta && a.meta.trim()).length
    };
  }

  // Render a KPI card
  function renderKPI(label, value) {
    return `
      <div class="tc-card" style="padding: 20px; text-align: center;">
        <div style="font-size: 14px; color: rgba(255,255,255,.60); margin-bottom: 8px;">${escapeHtml(label)}</div>
        <div style="font-size: 32px; font-weight: 600;">${value}</div>
      </div>
    `;
  }

  // Get sync status badge
  function getSyncStatusBadge() {
    if (syncStatus === "synced") {
      return '<span style="color: #10b981;">🟢 Synced</span>';
    } else if (syncStatus === "local") {
      return '<span style="color: #f59e0b;">🟡 Local</span>';
    } else if (syncStatus === "error") {
      return '<span style="color: #ef4444;">🔴 Error</span>';
    } else {
      return '<span style="color: rgba(255,255,255,.40);">⚪ Loading...</span>';
    }
  }

  // Render an assignment card
  function renderAssignmentCard(assignment) {
    const createdDate = assignment.created_at 
      ? new Date(assignment.created_at).toLocaleDateString()
      : "Unknown";

    return `
      <div class="tc-card assignment-card" data-id="${escapeHtml(assignment.id)}" style="padding: 20px; cursor: pointer; transition: transform 0.2s, border-color 0.2s;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 18px; flex: 1;">${escapeHtml(assignment.title || "Untitled")}</h3>
          <span class="tc-pill" style="background: rgba(96,165,250,.20); color: #60a5fa; padding: 4px 12px; border-radius: 12px; font-size: 12px; white-space: nowrap;">
            ${escapeHtml(assignment.type || "file")}
          </span>
        </div>
        
        ${assignment.series ? `
          <div style="color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 8px;">
            📚 ${escapeHtml(assignment.series)}
          </div>
        ` : ''}
        
        <div style="color: rgba(255,255,255,.40); font-size: 13px; margin-bottom: 16px;">
          Created: ${escapeHtml(createdDate)}
        </div>

        <div style="display: flex; gap: 8px;">
          <button class="tc-btn issue-btn" data-id="${escapeHtml(assignment.id)}" style="flex: 1; font-size: 14px;">
            Issue to Class
          </button>
        </div>
      </div>
    `;
  }

  // Update active class filter button
  function updateActiveClassFilter() {
    document.querySelectorAll('.tc-lib-class-filter').forEach(btn => {
      const isActive = btn.dataset.class === filters.assignments.classFilter;
      btn.style.background = isActive ? 'rgba(255,255,255,.15)' : '';
      btn.style.borderColor = isActive ? 'rgba(255,255,255,.20)' : '';
    });
  }

  // Render Lessons tab
  function renderLessonsTab() {
    const container = $("lessonsTab");
    if (!container) return;

    let html = '';

    // Search bar
    html += `
      <div style="margin-bottom: 24px;">
        <input 
          type="text" 
          id="lessonSearch" 
          class="tc-input" 
          placeholder="Search lessons, units, sections..."
          value="${escapeHtml(filters.lessons.searchQuery)}"
          style="width: 100%; padding: 12px 16px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: white; font-size: 16px;">
      </div>
    `;

    // Empty state or lessons
    if (!lessonsData || !lessonsData.sections) {
      html += `
        <div class="tc-card" style="text-align: center; padding: 48px 24px;">
          <div style="font-size: 48px; margin-bottom: 16px;">📚</div>
          <h3 style="margin: 0 0 8px 0; font-size: 20px;">Lessons index not available</h3>
          <p style="margin: 0; color: rgba(255,255,255,.60);">Run the generator script to build the lessons index.</p>
        </div>
      `;
    } else {
      // Filter lessons based on search
      const filteredSections = filterLessons();

      if (filteredSections.length === 0) {
        html += `
          <div class="tc-card" style="text-align: center; padding: 48px 24px;">
            <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
            <h3 style="margin: 0 0 8px 0; font-size: 20px;">No lessons found</h3>
            <p style="margin: 0; color: rgba(255,255,255,.60);">Try a different search term</p>
          </div>
        `;
      } else {
        html += '<div style="display: flex; flex-direction: column; gap: 16px;">';
        filteredSections.forEach((section, sIdx) => {
          html += renderLessonSection(section, sIdx);
        });
        html += '</div>';
      }
    }

    container.innerHTML = html;
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

  // Render a lesson section
  function renderLessonSection(section, sectionIndex) {
    const sectionId = `section-${sectionIndex}`;
    
    return `
      <div class="tc-card lesson-section" style="padding: 0; overflow: hidden;">
        <button 
          class="lesson-section-toggle" 
          data-target="${sectionId}"
          style="width: 100%; padding: 20px; background: transparent; border: none; color: white; text-align: left; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 18px; font-weight: 600;">
          <span>${escapeHtml(section.name)}</span>
          <span class="toggle-icon" style="font-size: 20px; transition: transform 0.2s;">▼</span>
        </button>
        
        <div id="${sectionId}" class="lesson-section-content" style="display: none; padding: 0 20px 20px 20px;">
          ${section.units.map((unit, uIdx) => renderLessonUnit(unit, sectionIndex, uIdx)).join('')}
        </div>
      </div>
    `;
  }

  // Render a lesson unit
  function renderLessonUnit(unit, sectionIndex, unitIndex) {
    const unitId = `unit-${sectionIndex}-${unitIndex}`;
    
    return `
      <div style="margin-top: 16px; border-left: 2px solid rgba(255,255,255,.10); padding-left: 16px;">
        <button 
          class="lesson-unit-toggle" 
          data-target="${unitId}"
          style="width: 100%; padding: 12px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.10); border-radius: 8px; color: white; text-align: left; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 500;">
          <span>${escapeHtml(unit.name)}</span>
          <span class="toggle-icon" style="font-size: 16px; transition: transform 0.2s;">▶</span>
        </button>
        
        <div id="${unitId}" class="lesson-unit-content" style="display: none; margin-top: 12px;">
          ${unit.presentations.map(pres => renderPresentation(pres)).join('')}
        </div>
      </div>
    `;
  }

  // Render a presentation
  function renderPresentation(presentation) {
    return `
      <div class="tc-card" style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
        <span style="flex: 1; font-size: 15px;">${escapeHtml(presentation.name)}</span>
        <div style="display: flex; gap: 8px;">
          <a 
            href="${escapeHtml(presentation.url)}" 
            target="_blank" 
            class="tc-btn" 
            style="font-size: 13px; padding: 6px 12px; text-decoration: none;">
            Open
          </a>
        </div>
      </div>
    `;
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
      : "Unknown";

    overlay.innerHTML = `
      <div class="tc-card" style="max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px;">
          <h2 style="margin: 0; font-size: 24px;">${escapeHtml(assignment.title || "Untitled")}</h2>
          <button id="closeDetailBtn" class="tc-btn" style="padding: 8px 16px;">✕ Close</button>
        </div>

        <div style="display: grid; gap: 16px; margin-bottom: 24px;">
          <div>
            <div style="color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 4px;">Type</div>
            <div>${escapeHtml(assignment.type || "file")}</div>
          </div>

          ${assignment.series ? `
            <div>
              <div style="color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 4px;">Class</div>
              <div>${escapeHtml(assignment.series)}</div>
            </div>
          ` : ''}

          <div>
            <div style="color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 4px;">Created</div>
            <div>${escapeHtml(createdDate)}</div>
          </div>

          ${assignment.meta ? `
            <div>
              <div style="color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 4px;">Mapping / Meta</div>
              <div style="background: rgba(0,0,0,.3); padding: 12px; border-radius: 8px; white-space: pre-wrap; font-family: monospace; font-size: 13px;">${escapeHtml(assignment.meta)}</div>
            </div>
          ` : ''}

          ${assignment.page ? `
            <div>
              <div style="color: rgba(255,255,255,.60); font-size: 14px; margin-bottom: 4px;">Assignment Content Preview</div>
              <div style="background: rgba(0,0,0,.3); padding: 12px; border-radius: 8px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-size: 14px;">${escapeHtml(assignment.page.substring(0, 1000))}${assignment.page.length > 1000 ? '...' : ''}</div>
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: 12px;">
          <button class="tc-btn issue-detail-btn" data-id="${escapeHtml(assignment.id)}" style="flex: 1;">
            Issue to Class
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close button
    overlay.querySelector('#closeDetailBtn').addEventListener('click', () => {
      overlay.remove();
    });

    // Issue button in detail
    overlay.querySelector('.issue-detail-btn').addEventListener('click', (e) => {
      const assignmentId = e.target.dataset.id;
      window.location.href = `/teacher/work/?assignment=${encodeURIComponent(assignmentId)}`;
    });

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
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

  // Utility: escape HTML
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Start initialization
  init();
})();
