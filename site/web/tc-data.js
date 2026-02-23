(async () => {
  "use strict";

  // Only run on data page
  if (!location.pathname.startsWith("/teacher/data")) return;

  // Import data adapter for Supabase/localStorage abstraction
  const { db, isRemote } = await import('/web/data-adapter.js');

  // NOTE: Keep in sync with CANON_CLASSES in tc-work.js and tc-gradebook.js
  // Full class names matching CSV data
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
  
  // Display abbreviations for space constraints
  const CLASS_DISPLAY = {
    "Language Arts 1 SC": "LA 1 SC",
    "Language Arts 2 SC": "LA 2 SC",
    "Language Arts 3 SC": "LA 3 SC",
    "Language Arts 4 SC": "LA 4 SC",
    "Life Skills Language Arts SC": "Life Skills LA",
    "Life Skills": "Life Skills",
    "Consumer Math": "Consumer Math",
    "Geometry SC": "Geometry SC",
    "Speech/Language": "Speech/Language",
    "Warrior Academy": "Warrior Academy"
  };

  const $ = (id) => document.getElementById(id);

  // State
  let currentClassFilter = "All Classes";
  let currentQuarterFilter = getCurrentQuarter(); // Default to current quarter
  let currentGoalAreaFilter = "All";
  let currentDataCollectorFilter = "All"; // "All" or "My Goals Only"
  // TODO: Get current teacher name from auth context instead of hardcoding
  let currentTeacherName = "Dan Reinisch"; // Hardcoded for now - should be from getSupabase() auth
  let searchText = "";
  let studentsData = [];
  let goalsData = [];
  let progressData = [];
  let classEnrollmentsData = [];
  let assignmentsData = [];
  let submissionsData = [];
  let assignmentGoalMappingsData = [];
  let usingSupabase = false;
  let syncStatus = "local";
  let expandedStudents = new Set(); // Track which students are expanded
  let hasAutoExpanded = false; // Track if we've auto-expanded on initial load

  // Helper to format date as YYYY-MM-DD
  function formatDateYYYYMMDD(date = new Date()) {
    return date.toISOString().split("T")[0];
  }

  // Helper to determine score color class based on percentage
  function scoreColorClass(score) {
    if (score == null || isNaN(score)) return "";
    if (score >= 80) return "dt-score-green";
    if (score >= 60) return "dt-score-amber";
    return "dt-score-red";
  }

  // Helper to get current quarter based on today's date
  // TODO: Make quarter dates configurable from /teacher/overview/ settings
  function getCurrentQuarter() {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    
    // Q1: August 16 - October 17
    if ((month === 8 && day >= 16) || month === 9 || (month === 10 && day <= 17)) return 'Q1';
    
    // Q2: October 18 - December 19
    if ((month === 10 && day >= 18) || month === 11 || (month === 12 && day <= 19)) return 'Q2';
    
    // Q3: December 20 - March 6 (spans year boundary)
    if ((month === 12 && day >= 20) || month === 1 || month === 2 || (month === 3 && day <= 6)) return 'Q3';
    
    // Q4: March 7 - May 20
    if ((month === 3 && day >= 7) || month === 4 || (month === 5 && day <= 20)) return 'Q4';
    
    // Summer months (May 21-Aug 15)
    if ((month === 5 && day > 20) || month === 6 || month === 7 || (month === 8 && day < 16)) return 'Q4';
    
    return 'Q1'; // default
  }

  // Helper to get quarter date range
  function getQuarterDateRange(quarter) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Determine school year
    const schoolYear = month >= 8 ? year : year - 1;
    
    const ranges = {
      'Q1': { start: `${schoolYear}-08-16`, end: `${schoolYear}-10-17` },
      'Q2': { start: `${schoolYear}-10-18`, end: `${schoolYear}-12-19` },
      'Q3': { start: `${schoolYear}-12-20`, end: `${schoolYear + 1}-03-06` },
      'Q4': { start: `${schoolYear + 1}-03-07`, end: `${schoolYear + 1}-05-20` }
    };
    
    return ranges[quarter] || { start: null, end: null };
  }

  // Helper to get quarter label
  function getQuarterLabel(quarter) {
    const labels = {
      'Q1': 'Q1 (Aug 16-Oct 17)',
      'Q2': 'Q2 (Oct 18-Dec 19)',
      'Q3': 'Q3 (Dec 20-Mar 6)',
      'Q4': 'Q4 (Mar 7-May 20)'
    };
    return labels[quarter] || quarter;
  }

  // Load data from Supabase or localStorage
  async function loadData() {
    try {
      usingSupabase = await isRemote();
      
      if (usingSupabase) {
        console.log('[data] Loading data from Supabase');
        syncStatus = "synced";
      } else {
        console.log('[data] Loading data from localStorage');
        syncStatus = "local";
      }
      
      // Load students, goals, enrollments, assignments, submissions, and mappings
      const [students, goals, enrollments, assignments, submissions] = await Promise.all([
        db.listStudents(),
        db.listGoalsAll ? db.listGoalsAll() : [],
        db.listClassEnrollments ? db.listClassEnrollments() : [],
        db.listAssignments ? db.listAssignments() : [],
        db.listSubmissions ? db.listSubmissions() : []
      ]);
      
      studentsData = students || [];
      goalsData = goals || [];
      classEnrollmentsData = enrollments || [];
      assignmentsData = assignments || [];
      submissionsData = submissions || [];
      
      // Load assignment goal mappings if available
      try {
        if (db.listAssignmentGoalMappings) {
          assignmentGoalMappingsData = await db.listAssignmentGoalMappings();
        }
      } catch (err) {
        console.warn('[data] Error loading assignment goal mappings:', err);
        assignmentGoalMappingsData = [];
      }
      
      // Group goals by student
      const goalsByStudent = {};
      goalsData.forEach(goal => {
        if (!goalsByStudent[goal.student_code]) {
          goalsByStudent[goal.student_code] = [];
        }
        goalsByStudent[goal.student_code].push(goal);
      });
      
      // Enrich students with goal counts
      studentsData = studentsData.map(student => ({
        ...student,
        goals: goalsByStudent[student.code] || [],
        goalCount: (goalsByStudent[student.code] || []).length
      }));
      
      // Load progress data for current quarter
      await loadProgressForQuarter(currentQuarterFilter);
      
      updateSyncStatus();
      render();
    } catch (err) {
      console.error('[data] Error loading data:', err);
      syncStatus = "error";
      updateSyncStatus();
    }
  }

  // Load progress data for a specific quarter
  async function loadProgressForQuarter(quarter) {
    try {
      const range = getQuarterDateRange(quarter);
      
      progressData = await db.listGoalProgress({
        startDate: range.start,
        endDate: range.end
      });
      
      console.log(`[data] Loaded ${progressData.length} progress entries for ${quarter}`);
    } catch (err) {
      console.error('[data] Error loading progress:', err);
      progressData = [];
    }
  }

  // Update sync status indicator
  function updateSyncStatus() {
    const statusEl = $('dtSyncStatus');
    const iconEl = $('dtSyncIcon');
    const textEl = $('dtSyncText');
    
    if (!statusEl) return;
    
    statusEl.style.display = 'inline-flex';
    statusEl.className = `dt-sync-status ${syncStatus}`;
    
    if (syncStatus === 'synced') {
      iconEl.innerHTML = '<span class="rc-status-dot rc-status-dot--ok"></span>';
      textEl.textContent = 'Synced';
    } else if (syncStatus === 'local') {
      iconEl.innerHTML = '<span class="rc-status-dot rc-status-dot--warn"></span>';
      textEl.textContent = 'Local mode';
    } else {
      iconEl.innerHTML = '<span class="rc-status-dot rc-status-dot--error"></span>';
      textEl.textContent = 'Error';
    }
  }

  // Render class filter buttons
  function renderClassFilters() {
    const container = $('dtClassFilterBar');
    if (!container) return;
    
    const allBtn = `<button class="dt-filter-btn ${currentClassFilter === 'All Classes' ? 'active' : ''}" data-class="All Classes">All Classes</button>`;
    
    const classButtons = CANON_CLASSES.map(cls => 
      `<button class="dt-filter-btn ${currentClassFilter === cls ? 'active' : ''}" data-class="${cls}">${cls}</button>`
    ).join('');
    
    container.innerHTML = allBtn + classButtons;
    
    // Add click handlers
    container.querySelectorAll('.dt-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentClassFilter = btn.dataset.class;
        render();
      });
    });
  }

  // Render quarter filter buttons
  function renderQuarterFilters() {
    const container = $('dtQuarterFilterBar');
    if (!container) return;
    
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const currentQ = getCurrentQuarter();
    
    const buttons = quarters.map(q => {
      const label = getQuarterLabel(q);
      const isCurrent = q === currentQ;
      const isActive = currentQuarterFilter === q;
      return `<button class="dt-filter-btn ${isActive ? 'active' : ''}" data-quarter="${q}">${label}${isCurrent ? ' *' : ''}</button>`;
    }).join('');
    
    container.innerHTML = buttons;
    
    // Add click handlers
    container.querySelectorAll('.dt-filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        currentQuarterFilter = btn.dataset.quarter;
        await loadProgressForQuarter(currentQuarterFilter);
        render();
      });
    });
  }

  // Render goal area filter buttons
  async function renderGoalAreaFilters() {
    const container = $('dtGoalAreaFilterBar');
    if (!container) return;
    
    // Get unique goal areas from goals data
    const goalAreas = [...new Set(goalsData.map(g => g.goal_area || 'Uncategorized').filter(Boolean))].sort();
    
    const allBtn = `<button class="dt-filter-btn ${currentGoalAreaFilter === 'All' ? 'active' : ''}" data-area="All">All Goal Areas</button>`;
    
    const areaButtons = goalAreas.map(area => 
      `<button class="dt-filter-btn ${currentGoalAreaFilter === area ? 'active' : ''}" data-area="${area}">${area}</button>`
    ).join('');
    
    container.innerHTML = allBtn + areaButtons;
    
    // Add click handlers
    container.querySelectorAll('.dt-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentGoalAreaFilter = btn.dataset.area;
        render();
      });
    });
  }

  // Render data collector filter buttons (My Goals Only vs All Goals)
  function renderDataCollectorFilter() {
    const container = $('dtDataCollectorFilterBar');
    if (!container) return;
    
    const allBtn = `<button class="dt-filter-btn ${currentDataCollectorFilter === 'All' ? 'active' : ''}" data-collector="All">All Goals</button>`;
    const myBtn = `<button class="dt-filter-btn ${currentDataCollectorFilter === 'My Goals Only' ? 'active' : ''}" data-collector="My Goals Only">My Goals Only</button>`;
    
    container.innerHTML = allBtn + myBtn;
    
    // Add click handlers
    container.querySelectorAll('.dt-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentDataCollectorFilter = btn.dataset.collector;
        render();
      });
    });
  }

  // Filter students based on current filters
  function getFilteredStudents() {
    let filtered = studentsData;
    
    // Filter by class
    if (currentClassFilter !== 'All Classes') {
      filtered = filtered.filter(student => {
        // Check enrollments using class_name
        const enrollment = classEnrollmentsData.find(e => 
          e.student_code === student.code && e.class_name === currentClassFilter
        );
        return !!enrollment;
      });
    }
    
    // Filter by data collector (My Goals Only)
    if (currentDataCollectorFilter === 'My Goals Only') {
      filtered = filtered.filter(student => {
        return student.goals.some(goal => {
          // Match if data_collector is current teacher or if not set (assume current teacher)
          if (!goal.data_collector) return true;
          return goal.data_collector.includes(currentTeacherName);
        });
      });
    }
    
    // Filter by goal area
    if (currentGoalAreaFilter !== 'All') {
      filtered = filtered.filter(student => {
        return student.goals.some(goal => 
          (goal.goal_area || 'Uncategorized') === currentGoalAreaFilter
        );
      });
    }
    
    // Filter by search text
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(student => {
        const nameMatch = student.name?.toLowerCase().includes(search);
        const codeMatch = student.code?.toLowerCase().includes(search);
        const goalMatch = student.goals.some(goal => 
          goal.desc?.toLowerCase().includes(search) || 
          goal.code?.toLowerCase().includes(search)
        );
        return nameMatch || codeMatch || goalMatch;
      });
    }
    
    return filtered;
  }

  // Calculate rolling average for a goal in current quarter
  function calculateGoalAverage(goalCode, studentCode) {
    const entries = progressData.filter(p => 
      p.goal_code === goalCode && p.student_code === studentCode && p.value != null
    );
    
    if (entries.length === 0) return null;
    
    const sum = entries.reduce((acc, e) => acc + parseFloat(e.value), 0);
    return Math.round(sum / entries.length);
  }

  // Get progress entries for a goal
  function getGoalProgressEntries(goalCode, studentCode) {
    return progressData.filter(p => 
      p.goal_code === goalCode && p.student_code === studentCode
    ).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // Render data points table for a goal
  function renderDataPointsTable(goal, studentCode) {
    const entries = getGoalProgressEntries(goal.code, studentCode);
    
    if (entries.length === 0) {
      return `<div style="padding: 10px; opacity: 0.7; font-size: 13px;">No data points recorded for this quarter.</div>`;
    }
    
    const rows = entries.map(entry => {
      const scoreClass = scoreColorClass(entry.value);
      return `
        <tr>
          <td>${new Date(entry.date).toLocaleDateString()}</td>
          <td class="dt-data-value ${scoreClass} editable" data-entry-id="${entry.id}" data-goal="${goal.code}" data-student="${studentCode}" data-value="${entry.value}">${entry.value}%</td>
          <td>${entry.source || 'manual'}</td>
        </tr>
      `;
    }).join('');
    
    return `
      <div class="dt-data-grid">
        <table class="dt-data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Value</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  // Render goal statistics
  function renderGoalStats(goal, studentCode) {
    const entries = getGoalProgressEntries(goal.code, studentCode);
    const avg = calculateGoalAverage(goal.code, studentCode);
    
    const baseline = goal.baseline || 0;
    const target = goal.target || 100;
    const current = entries.length > 0 ? parseFloat(entries[entries.length - 1].value) : null;
    const delta = current != null ? current - baseline : null;
    
    // Determine trend
    let trend = '→';
    if (entries.length >= 2) {
      const firstHalf = entries.slice(0, Math.floor(entries.length / 2));
      const secondHalf = entries.slice(Math.floor(entries.length / 2));
      const firstAvg = firstHalf.reduce((acc, e) => acc + parseFloat(e.value), 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((acc, e) => acc + parseFloat(e.value), 0) / secondHalf.length;
      if (secondAvg > firstAvg + 5) trend = '↗';
      else if (secondAvg < firstAvg - 5) trend = '↘';
    }
    
    const avgClass = scoreColorClass(avg);
    const currentClass = scoreColorClass(current);
    
    return `
      <div class="dt-stats">
        <span>Baseline: <strong>${baseline}%</strong></span>
        <span>Target: <strong>${target}%</strong></span>
        <span>Current: <strong class="${currentClass}">${current != null ? current + '%' : 'N/A'}</strong></span>
        <span>Rolling Avg: <strong class="${avgClass}">${avg != null ? avg + '%' : 'N/A'}</strong></span>
        <span>Delta: <strong>${delta != null ? (delta >= 0 ? '+' : '') + delta : 'N/A'}</strong></span>
        <span>Trend: <strong>${trend}</strong></span>
      </div>
    `;
  }

  /**
   * Render sparkline SVG for goal progress visualization
   * @param {Object} goal - Goal object with code, desc, etc.
   * @param {string} studentCode - Student code
   * @returns {string} HTML string containing SVG sparkline, or empty string if fewer than 2 data points
   */
  function renderSparkline(goal, studentCode) {
    const entries = getGoalProgressEntries(goal.code, studentCode);
    
    // Need at least 2 points to draw a line
    if (entries.length < 2) {
      return '';
    }
    
    const width = 200;
    const height = 40;
    const padding = 4;
    
    // Get values sorted by date
    const values = entries.map(e => parseFloat(e.value));
    const max = Math.max(...values, 100);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    
    const stepX = (width - 2 * padding) / (values.length - 1);
    
    // Build polyline points
    let points = '';
    let circles = '';
    values.forEach((val, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((val - min) / range) * (height - 2 * padding);
      points += `${x},${y} `;
      circles += `<circle cx="${x}" cy="${y}" r="2" fill="rgba(34, 197, 94, 0.9)" />`;
    });
    
    // Build polygon points for fill area (add bottom corners)
    const firstX = padding;
    const lastX = padding + (values.length - 1) * stepX;
    const bottomY = height - padding;
    const polygonPoints = points + `${lastX},${bottomY} ${firstX},${bottomY}`;
    
    // Create unique gradient ID (sanitize goal code to prevent XSS)
    const safeGradientId = `sparkGradient-${goal.code.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
    
    return `
      <div class="dt-sparkline">
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          <defs>
            <linearGradient id="${safeGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:rgba(34, 197, 94, 0.2);stop-opacity:1" />
              <stop offset="100%" style="stop-color:rgba(34, 197, 94, 0.02);stop-opacity:1" />
            </linearGradient>
          </defs>
          <polygon 
            points="${polygonPoints.trim()}" 
            fill="url(#${safeGradientId})"
          />
          <polyline 
            points="${points.trim()}" 
            fill="none" 
            stroke="rgba(34, 197, 94, 0.8)" 
            stroke-width="2" 
            stroke-linecap="round" 
            stroke-linejoin="round"
          />
          ${circles}
        </svg>
      </div>
    `;
  }

  // Render a single goal row
  function renderGoalRow(goal, studentCode) {
    // Build metadata badges - show case manager and data collector if available
    const metaBadges = [];
    metaBadges.push(`<span>Area: <strong>${goal.goal_area || 'Uncategorized'}</strong></span>`);
    
    // Show case manager if available
    if (goal.case_manager) {
      metaBadges.push(`<span>Case Mgr: <strong>${goal.case_manager}</strong></span>`);
    }
    
    // Show data collector if different from case manager
    if (goal.data_collector) {
      // If data collector is same as case manager, don't show duplicate
      if (goal.data_collector !== goal.case_manager) {
        metaBadges.push(`<span>Data: <strong>${goal.data_collector}</strong></span>`);
      }
    }
    
    return `
      <div class="dt-goal-row" data-goal="${goal.code}" data-student="${studentCode}">
        <div class="dt-goal-header">
          <div>
            <strong>${goal.code}</strong> — ${goal.desc || 'No description'}
          </div>
          <button class="dt-btn" data-goal="${goal.code}" data-student="${studentCode}">📎 Samples</button>
        </div>
        <div class="dt-goal-meta">
          ${metaBadges.join(' ')}
        </div>
        ${renderGoalStats(goal, studentCode)}
        ${renderSparkline(goal, studentCode)}
        ${renderDataPointsTable(goal, studentCode)}
        <button class="dt-btn primary" data-action="add-data" data-goal="${goal.code}" data-student="${studentCode}">+ Add Data Point</button>
        <div class="dt-inline-form" style="display: none;" data-goal="${goal.code}" data-student="${studentCode}">
          <label style="font-size: 13px; opacity: 0.9;">Date:</label>
          <input type="date" class="dt-date-input" value="${formatDateYYYYMMDD()}" />
          <label style="font-size: 13px; opacity: 0.9;">Value:</label>
          <input type="number" class="dt-value-input" min="0" max="100" step="1" placeholder="0-100" />
          <button class="dt-btn primary dt-save-btn">Save</button>
          <button class="dt-btn dt-cancel-btn">Cancel</button>
        </div>
      </div>
    `;
  }

  // Render accordion
  function renderAccordion() {
    const container = $('dtAccordion');
    const emptyEl = $('dtEmpty');
    
    if (!container || !emptyEl) return;
    
    const filtered = getFilteredStudents();
    
    if (filtered.length === 0) {
      emptyEl.style.display = 'block';
      container.innerHTML = '';
      return;
    }
    
    emptyEl.style.display = 'none';
    
    // Filter student goals by goal area and data collector if needed
    const studentsWithFilteredGoals = filtered.map(student => {
      let goals = student.goals;
      
      // Filter by goal area
      if (currentGoalAreaFilter !== 'All') {
        goals = goals.filter(goal => (goal.goal_area || 'Uncategorized') === currentGoalAreaFilter);
      }
      
      // Filter by data collector (My Goals Only)
      if (currentDataCollectorFilter === 'My Goals Only') {
        goals = goals.filter(goal => {
          // Include if data_collector is current teacher or if not set (assume current teacher)
          if (!goal.data_collector) return true;
          return goal.data_collector.includes(currentTeacherName);
        });
      }
      
      return { ...student, goals };
    }).filter(student => student.goals.length > 0); // Remove students with no matching goals
    
    // Calculate quarter averages for each student
    const studentsWithAverages = studentsWithFilteredGoals.map(student => {
      const goalAverages = student.goals.map(goal => 
        calculateGoalAverage(goal.code, student.code)
      ).filter(avg => avg != null);
      
      const quarterAvg = goalAverages.length > 0
        ? Math.round(goalAverages.reduce((a, b) => a + b, 0) / goalAverages.length)
        : null;
      
      return { ...student, quarterAvg };
    });
    
    // Auto-expand first student on initial load only
    if (!hasAutoExpanded && expandedStudents.size === 0 && studentsWithAverages.length > 0) {
      expandedStudents.add(studentsWithAverages[0].code);
      hasAutoExpanded = true;
    }
    
    const html = studentsWithAverages.map(student => {
      const isExpanded = expandedStudents.has(student.code);
      const avgClass = scoreColorClass(student.quarterAvg);
      
      return `
        <div class="dt-accordion-item ${isExpanded ? 'expanded' : ''}" data-student="${student.code}">
          <div class="dt-accordion-header">
            <div class="dt-accordion-title">
              <span class="dt-accordion-icon">▶</span>
              <span><strong>${student.name || student.code}</strong> (${student.code})</span>
            </div>
            <div>
              <span>${student.goals.length} goal${student.goals.length !== 1 ? 's' : ''}</span>
              ${student.quarterAvg != null ? `<span>, ${getQuarterLabel(currentQuarterFilter)} avg: <strong class="${avgClass}">${student.quarterAvg}%</strong></span>` : ''}
            </div>
          </div>
          <div class="dt-accordion-content">
            ${student.goals.map(goal => renderGoalRow(goal, student.code)).join('')}
          </div>
        </div>
      `;
    }).join('');
    
    container.innerHTML = html;
    
    // Add accordion click handlers
    container.querySelectorAll('.dt-accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const item = header.closest('.dt-accordion-item');
        const studentCode = item.dataset.student;
        
        if (expandedStudents.has(studentCode)) {
          expandedStudents.delete(studentCode);
          item.classList.remove('expanded');
        } else {
          expandedStudents.add(studentCode);
          item.classList.add('expanded');
        }
      });
    });
    
    // Add "Samples" button handlers
    container.querySelectorAll('[data-goal]').forEach(btn => {
      if (btn.textContent.includes('Samples')) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const goalCode = btn.dataset.goal;
          const studentCode = btn.dataset.student;
          openSamplesModal(goalCode, studentCode);
        });
      }
    });
    
    // Add "Add Data Point" button handlers - show inline form
    container.querySelectorAll('[data-action="add-data"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const goalCode = btn.dataset.goal;
        const studentCode = btn.dataset.student;
        showInlineForm(goalCode, studentCode);
      });
    });
    
    // Add inline cell editing handlers
    container.querySelectorAll('.dt-data-value.editable').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        startCellEdit(cell);
      });
    });
    
    // Add inline form handlers
    container.querySelectorAll('.dt-inline-form').forEach(form => {
      const goalCode = form.dataset.goal;
      const studentCode = form.dataset.student;
      
      const saveBtn = form.querySelector('.dt-save-btn');
      const cancelBtn = form.querySelector('.dt-cancel-btn');
      const dateInput = form.querySelector('.dt-date-input');
      const valueInput = form.querySelector('.dt-value-input');
      
      saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await saveInlineDataPoint(goalCode, studentCode, dateInput.value, valueInput.value, form);
      });
      
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideInlineForm(form);
      });
      
      // Enter key saves
      valueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveBtn.click();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelBtn.click();
        }
      });
    });
  }
  
  /**
   * Show inline form for adding a new data point to a goal
   * @param {string} goalCode - Goal code
   * @param {string} studentCode - Student code
   */
  function showInlineForm(goalCode, studentCode) {
    const goalRow = document.querySelector(`.dt-goal-row[data-goal="${goalCode}"][data-student="${studentCode}"]`);
    if (!goalRow) return;
    
    const form = goalRow.querySelector('.dt-inline-form');
    if (!form) return;
    
    // Reset form to default values
    form.querySelector('.dt-date-input').value = formatDateYYYYMMDD();
    form.querySelector('.dt-value-input').value = '';
    form.style.display = 'flex';
    
    // Focus value input
    setTimeout(() => form.querySelector('.dt-value-input').focus(), 100);
  }
  
  /**
   * Hide inline form and reset its values
   * @param {HTMLElement} form - The form element to hide
   */
  function hideInlineForm(form) {
    form.style.display = 'none';
    form.querySelector('.dt-value-input').value = '';
  }
  
  /**
   * Save a new data point from the inline form
   * @param {string} goalCode - Goal code
   * @param {string} studentCode - Student code
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} value - Progress value (0-100)
   * @param {HTMLElement} form - The form element to hide after save
   * Validates input, saves via db.upsertGoalProgress, reloads data, and hides form
   */
  async function saveInlineDataPoint(goalCode, studentCode, date, value, form) {
    if (!date) {
      alert('Please enter a date');
      return;
    }
    
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      alert('Please enter a valid number between 0 and 100');
      return;
    }
    
    try {
      await db.upsertGoalProgress({
        goal_code: goalCode,
        student_code: studentCode,
        date,
        value: numValue,
        source: 'manual'
      });
      
      // Reload progress data and re-render
      await loadProgressForQuarter(currentQuarterFilter);
      render();
      
      hideInlineForm(form);
    } catch (err) {
      console.error('[data] Error adding data point:', err);
      alert('Error adding data point: ' + err.message);
    }
  }
  
  /**
   * Start inline editing of a data point cell
   * @param {HTMLElement} cell - The table cell to edit
   * Replaces cell content with input, handles keyboard shortcuts:
   * - Enter/blur: save changes
   * - Escape: cancel editing
   * - ArrowUp/Down: adjust value by ±1 (±5 with Shift)
   */
  function startCellEdit(cell) {
    // Don't allow multiple edits at once
    if (document.querySelector('.dt-data-value.editing')) return;
    
    const currentValue = parseFloat(cell.dataset.value);
    const entryId = cell.dataset.entryId;
    const goalCode = cell.dataset.goal;
    const studentCode = cell.dataset.student;
    
    // Create input
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = currentValue;
    
    // Store original value for cancel
    cell.dataset.originalValue = currentValue;
    
    // Replace cell content
    const originalContent = cell.innerHTML;
    cell.innerHTML = '';
    cell.appendChild(input);
    cell.classList.add('editing');
    
    input.focus();
    input.select();
    
    // Save on Enter or blur
    const save = async () => {
      const newValue = parseFloat(input.value);
      
      if (isNaN(newValue) || newValue < 0 || newValue > 100) {
        alert('Please enter a valid number between 0 and 100');
        input.focus();
        return;
      }
      
      // Don't save if value hasn't changed
      if (newValue === currentValue) {
        cancel();
        return;
      }
      
      // Show saving state
      cell.classList.add('saving');
      input.disabled = true;
      
      try {
        // Find the entry to get its date
        const entry = progressData.find(p => p.id === entryId);
        if (!entry) throw new Error('Entry not found');
        
        await db.upsertGoalProgress({
          goal_code: goalCode,
          student_code: studentCode,
          date: entry.date,
          value: newValue,
          source: entry.source || 'manual'
        });
        
        // Reload and re-render
        await loadProgressForQuarter(currentQuarterFilter);
        render();
      } catch (err) {
        console.error('[data] Error updating data point:', err);
        alert('Error updating data point: ' + err.message);
        cell.classList.remove('saving');
        input.disabled = false;
        input.focus();
      }
    };
    
    const cancel = () => {
      cell.classList.remove('editing');
      cell.innerHTML = originalContent;
    };
    
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        input.value = Math.min(100, parseFloat(input.value || 0) + step);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        input.value = Math.max(0, parseFloat(input.value || 0) - step);
      }
    });
  }

  // Add a data point (legacy - now replaced by inline form)
  async function addDataPoint(goalCode, studentCode) {
    // This function is no longer used but kept for compatibility
    showInlineForm(goalCode, studentCode);
  }

  // Open work samples modal
  async function openSamplesModal(goalCode, studentCode) {
    const modal = $('dtSamplesModal');
    const modalBody = $('dtModalBody');
    
    if (!modal || !modalBody) return;
    
    // Find the goal
    const goal = goalsData.find(g => g.code === goalCode && g.student_code === studentCode);
    const student = studentsData.find(s => s.code === studentCode);
    
    if (!goal || !student) {
      alert('Goal or student not found');
      return;
    }
    
    // Find relevant work samples
    // 1. Find assignments mapped to this goal
    const mappedAssignmentIds = assignmentGoalMappingsData
      .filter(m => m.goal_code === goalCode && m.student_code === studentCode)
      .map(m => m.assignment_id);
    
    // 2. Find submissions for these assignments by this student
    const relevantSubmissions = submissionsData.filter(sub => 
      sub.student_code === studentCode && 
      mappedAssignmentIds.includes(sub.assignment_id)
    );
    
    // Build work samples HTML
    let samplesHTML = '';
    if (relevantSubmissions.length === 0) {
      samplesHTML = `
        <div class="dt-sample-item">
          <p><em>No work samples found for this goal</em></p>
          <p style="font-size: 13px; opacity: 0.7;">Work samples appear here when assignments are mapped to this IEP goal and the student submits them.</p>
        </div>
      `;
    } else {
      samplesHTML = relevantSubmissions.map(sub => {
        const assignment = assignmentsData.find(a => a.id === sub.assignment_id);
        const assignmentTitle = assignment ? assignment.title : `Assignment ${sub.assignment_id}`;
        const submittedDate = new Date(sub.submitted_at).toLocaleDateString();
        const score = sub.score_total != null ? `${sub.score_total}%` : 'Not graded';
        
        return `
          <div class="dt-sample-item">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <strong>${assignmentTitle}</strong>
              <span style="opacity: 0.8;">${submittedDate}</span>
            </div>
            <div style="font-size: 13px; opacity: 0.85; margin-bottom: 4px;">
              <strong>Score:</strong> ${score}
            </div>
            <div style="font-size: 13px; opacity: 0.7;">
              <em>Submission ID: ${sub.submission_id}</em>
            </div>
          </div>
        `;
      }).join('');
    }
    
    modalBody.innerHTML = `
      <div>
        <h3 style="margin-top: 0">${goal.code} — ${goal.desc}</h3>
        <p><strong>Student:</strong> ${student.name} (${student.code})</p>
        <p><strong>Goal Area:</strong> ${goal.goal_area || 'Uncategorized'}</p>
        <p><strong>Baseline:</strong> ${goal.baseline || 0}%</p>
        <p><strong>Target:</strong> ${goal.target || 100}%</p>
        
        <h4 style="margin-top: 20px">Data Points (${getQuarterLabel(currentQuarterFilter)})</h4>
        ${renderDataPointsTable(goal, studentCode)}
        
        <h4 style="margin-top: 20px">Work Samples</h4>
        ${samplesHTML}
      </div>
    `;
    
    modal.classList.add('active');
    
    // Store current context for DOCX export
    modal.dataset.goalCode = goalCode;
    modal.dataset.studentCode = studentCode;
  }

  // Close work samples modal
  function closeSamplesModal() {
    const modal = $('dtSamplesModal');
    if (modal) modal.classList.remove('active');
  }

  /**
   * Escape XML/HTML special characters to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string safe for XML/HTML insertion
   * Escapes: & < > " '
   */
  function escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Export IEP goal progress report as DOCX file
   * Generates an HTML-based .docx file that Microsoft Word can open
   * Requires: dtSamplesModal with goalCode and studentCode in dataset
   * Includes: Header, Summary (stats), Data Points table, Work Samples, Footer
   * Downloads file as: {student_code}_{goal_code}_progress_report.docx
   */
  async function exportToDocx() {
    const modal = $('dtSamplesModal');
    if (!modal) return;
    
    const goalCode = modal.dataset.goalCode;
    const studentCode = modal.dataset.studentCode;
    
    const goal = goalsData.find(g => g.code === goalCode && g.student_code === studentCode);
    const student = studentsData.find(s => s.code === studentCode);
    
    if (!goal || !student) return;
    
    // Get data entries and work samples
    const entries = getGoalProgressEntries(goal.code, studentCode);
    const avg = calculateGoalAverage(goal.code, studentCode);
    const baseline = goal.baseline || 0;
    const target = goal.target || 100;
    const current = entries.length > 0 ? parseFloat(entries[entries.length - 1].value) : null;
    
    // Calculate trend
    let trend = '→';
    if (entries.length >= 2) {
      const firstHalf = entries.slice(0, Math.floor(entries.length / 2));
      const secondHalf = entries.slice(Math.floor(entries.length / 2));
      const firstAvg = firstHalf.reduce((acc, e) => acc + parseFloat(e.value), 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((acc, e) => acc + parseFloat(e.value), 0) / secondHalf.length;
      if (secondAvg > firstAvg + 5) trend = '↗';
      else if (secondAvg < firstAvg - 5) trend = '↘';
    }
    
    // Find relevant work samples
    const mappedAssignmentIds = assignmentGoalMappingsData
      .filter(m => m.goal_code === goalCode && m.student_code === studentCode)
      .map(m => m.assignment_id);
    
    const relevantSubmissions = submissionsData.filter(sub => 
      sub.student_code === studentCode && 
      mappedAssignmentIds.includes(sub.assignment_id)
    );
    
    // Create HTML-based DOCX that Word can open
    // Word supports opening HTML files with .docx extension
    const htmlContent = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <title>IEP Goal Progress Report</title>
  <style>
    body { font-family: 'Calibri', Arial, sans-serif; margin: 40px; }
    h1 { font-size: 24pt; font-weight: bold; margin-bottom: 20px; }
    h2 { font-size: 16pt; font-weight: bold; margin-top: 20px; margin-bottom: 10px; }
    p { margin: 5px 0; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
    th { background-color: #f0f0f0; font-weight: bold; }
  </style>
</head>
<body>
  <h1>IEP GOAL PROGRESS REPORT</h1>
  
  <p><strong>Student:</strong> ${escapeXml(student.name)} (${escapeXml(student.code)})</p>
  <p><strong>Goal Code:</strong> ${escapeXml(goal.code)}</p>
  <p><strong>Goal Description:</strong> ${escapeXml(goal.desc || 'No description')}</p>
  <p><strong>Goal Area:</strong> ${escapeXml(goal.goal_area || 'Uncategorized')}</p>
  ${goal.case_manager ? `<p><strong>Case Manager:</strong> ${escapeXml(goal.case_manager)}</p>` : ''}
  ${goal.data_collector ? `<p><strong>Data Collector:</strong> ${escapeXml(goal.data_collector)}</p>` : ''}
  <p><strong>Report Date:</strong> ${new Date().toLocaleDateString()}</p>
  <p><strong>Quarter:</strong> ${getQuarterLabel(currentQuarterFilter)}</p>
  
  <h2>Summary</h2>
  <p><strong>Baseline:</strong> ${baseline}%</p>
  <p><strong>Target:</strong> ${target}%</p>
  <p><strong>Current Value:</strong> ${current != null ? current + '%' : 'N/A'}</p>
  <p><strong>Rolling Average (${escapeXml(getQuarterLabel(currentQuarterFilter))}):</strong> ${avg != null ? avg + '%' : 'N/A'}</p>
  <p><strong>Trend:</strong> ${escapeXml(trend)}</p>
  
  <h2>Data Points</h2>
  ${entries.length === 0 ? '<p>No data points recorded for this quarter.</p>' : `
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Value</th>
        <th>Source</th>
      </tr>
    </thead>
    <tbody>
      ${entries.map(e => `
      <tr>
        <td>${escapeXml(new Date(e.date).toLocaleDateString())}</td>
        <td>${e.value}%</td>
        <td>${escapeXml(e.source || 'manual')}</td>
      </tr>`).join('')}
    </tbody>
  </table>`}
  
  <h2>Work Samples</h2>
  ${relevantSubmissions.length === 0 ? '<p>No work samples found for this goal.</p>' : 
    relevantSubmissions.map(sub => {
      const assignment = assignmentsData.find(a => a.id === sub.assignment_id);
      const assignmentTitle = assignment ? assignment.title : `Assignment ${sub.assignment_id}`;
      const submittedDate = new Date(sub.submitted_at).toLocaleDateString();
      const score = sub.score_total != null ? `${sub.score_total}%` : 'Not graded';
      return `
      <p><strong>• ${escapeXml(assignmentTitle)}</strong></p>
      <p style="margin-left: 20px;"><strong>Date Submitted:</strong> ${escapeXml(submittedDate)}</p>
      <p style="margin-left: 20px;"><strong>Score:</strong> ${escapeXml(score)}</p>`;
    }).join('')}
  
  <p style="margin-top: 30px;"><em>Generated on ${escapeXml(new Date().toLocaleString())}</em></p>
</body>
</html>`;

    // Create blob and download
    const blob = new Blob([htmlContent], { 
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${studentCode}_${goalCode}_progress_report.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export visible data as CSV
  function exportToCsv() {
    const filtered = getFilteredStudents();
    
    // Build CSV rows
    const rows = [['Student', 'Student Code', 'Goal Code', 'Goal Area', 'Date', 'Value', 'Source', 'Quarter']];
    
    filtered.forEach(student => {
      let goals = student.goals;
      if (currentGoalAreaFilter !== 'All') {
        goals = goals.filter(goal => (goal.goal_area || 'Uncategorized') === currentGoalAreaFilter);
      }
      
      goals.forEach(goal => {
        const entries = getGoalProgressEntries(goal.code, student.code);
        if (entries.length === 0) {
          // Add a row even if no data points
          rows.push([
            student.name,
            student.code,
            goal.code,
            goal.goal_area || 'Uncategorized',
            '',
            '',
            '',
            currentQuarterFilter
          ]);
        } else {
          entries.forEach(entry => {
            rows.push([
              student.name,
              student.code,
              goal.code,
              goal.goal_area || 'Uncategorized',
              entry.date,
              entry.value,
              entry.source || 'manual',
              currentQuarterFilter
            ]);
          });
        }
      });
    });
    
    // Convert to CSV string
    const csvContent = rows.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iep_goal_progress_${currentQuarterFilter}_${formatDateYYYYMMDD()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Bulk add progress (placeholder)
  function bulkAddProgress() {
    alert('Bulk Add Progress feature coming soon!\n\nThis will allow you to quickly add progress data for multiple students/goals at once.');
  }

  // ===== SPEDTRACK IMPORT FUNCTIONALITY =====
  
  const IMPORT_HISTORY_KEY = 'rc_import_history';
  
  // Helper to escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      rows.push(row);
    }
    return { headers, rows };
  }
  
  function validateImportRow(row) {
    // Map common column names
    const student = row.student || row.student_code || row['student code'] || '';
    const goal = row.goal || row.goal_code || row['goal code'] || '';
    const date = row.date || '';
    const percent = row.percent || row.score || row.value || '';
    const notes = row.notes || row.note || row.comments || '';
    
    // Validate student exists
    const studentMatch = studentsData.find(s => 
      s.code === student || s.name.toLowerCase().includes(student.toLowerCase())
    );
    
    // Validate goal exists for student
    let goalMatch = null;
    if (studentMatch) {
      goalMatch = goalsData.find(g => 
        g.student_code === studentMatch.code && g.code === goal
      );
    }
    
    // Validate date format
    const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date);
    
    // Validate percent range
    const percentNum = parseInt(percent);
    const percentValid = !isNaN(percentNum) && percentNum >= 0 && percentNum <= 100;
    
    let status = 'valid';
    let message = '';
    
    if (!studentMatch) {
      status = 'error';
      message = 'Student not found';
    } else if (!goalMatch) {
      status = 'error';
      message = 'Goal not found for student';
    } else if (!dateValid) {
      status = 'warning';
      message = 'Invalid date format (use YYYY-MM-DD)';
    } else if (!percentValid) {
      status = 'error';
      message = 'Invalid percent value (must be 0-100)';
    }
    
    return {
      status,
      message,
      student: studentMatch ? studentMatch.code : student,
      studentName: studentMatch ? studentMatch.name : student,
      goal,
      date,
      percent: percentNum,
      notes,
      valid: status === 'valid'
    };
  }
  
  let importPreviewData = [];
  
  function setupImportHandlers() {
    const togglePasteBtn = $('dtImportTogglePaste');
    const toggleFileBtn = $('dtImportToggleFile');
    const pasteArea = $('dtImportPasteArea');
    const fileArea = $('dtImportFileArea');
    const parseBtn = $('dtImportParse');
    const uploadBtn = $('dtImportUpload');
    const confirmBtn = $('dtImportConfirm');
    const cancelBtn = $('dtImportCancel');
    
    if (togglePasteBtn) {
      togglePasteBtn.addEventListener('click', () => {
        pasteArea.style.display = 'block';
        fileArea.style.display = 'none';
        $('dtImportPreview').style.display = 'none';
      });
    }
    
    if (toggleFileBtn) {
      toggleFileBtn.addEventListener('click', () => {
        pasteArea.style.display = 'none';
        fileArea.style.display = 'block';
        $('dtImportPreview').style.display = 'none';
      });
    }
    
    if (parseBtn) {
      parseBtn.addEventListener('click', () => {
        const text = $('dtImportTextarea').value;
        if (!text.trim()) {
          alert('Please paste CSV data first');
          return;
        }
        processImportCSV(text);
      });
    }
    
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        const fileInput = $('dtImportFile');
        const file = fileInput.files[0];
        if (!file) {
          alert('Please select a file first');
          return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
          processImportCSV(e.target.result);
        };
        reader.readAsText(file);
      });
    }
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const validEntries = importPreviewData.filter(row => row.valid);
        
        if (validEntries.length === 0) {
          alert('No valid entries to import');
          return;
        }
        
        try {
          // Import each entry
          for (const entry of validEntries) {
            const progressEntry = {
              student_code: entry.student,
              goal_code: entry.goal,
              date: entry.date,
              percent: entry.percent,
              notes: entry.notes,
              source: 'spedtrack_import',
              timestamp: new Date().toISOString()
            };
            
            // Try to add to database
            try {
              await db.addGoalProgress(progressEntry);
            } catch (err) {
              console.error('Error adding progress entry:', err);
              // Also add to localStorage as fallback
              const progressData = JSON.parse(localStorage.getItem('rc_goal_progress') || '[]');
              progressData.push(progressEntry);
              localStorage.setItem('rc_goal_progress', JSON.stringify(progressData));
            }
          }
          
          // Save import history
          const history = JSON.parse(localStorage.getItem(IMPORT_HISTORY_KEY) || '[]');
          history.unshift({
            date: new Date().toISOString(),
            records: validEntries.length,
            source: 'CSV Import'
          });
          // Keep only last 5
          localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
          
          // Reload data and close preview
          await loadData();
          $('dtImportPreview').style.display = 'none';
          $('dtImportTextarea').value = '';
          if ($('dtImportFile')) $('dtImportFile').value = '';
          renderImportHistory();
          
          alert(`✓ Successfully imported ${validEntries.length} records!`);
        } catch (err) {
          console.error('Import error:', err);
          alert('Error importing data: ' + err.message);
        }
      });
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        $('dtImportPreview').style.display = 'none';
        importPreviewData = [];
      });
    }
    
    renderImportHistory();
  }
  
  function processImportCSV(text) {
    try {
      const { rows } = parseCSV(text);
      
      if (rows.length === 0) {
        alert('No data found in CSV');
        return;
      }
      
      // Validate each row
      importPreviewData = rows.map(validateImportRow);
      
      // Render preview
      const previewBody = $('dtImportPreviewBody');
      previewBody.innerHTML = importPreviewData.map(row => {
        const statusClass = row.status === 'valid' ? 'dt-score-green' : 
                           row.status === 'warning' ? 'dt-score-amber' : 'dt-score-red';
        const statusText = row.status === 'valid' ? '✓' : 
                          row.status === 'warning' ? '⚠' : '✗';
        
        return `
          <tr>
            <td class="${statusClass}">${statusText} ${row.message || 'Valid'}</td>
            <td>${escapeHtml(row.studentName)} <small>(${escapeHtml(row.student)})</small></td>
            <td>${escapeHtml(row.goal)}</td>
            <td>${escapeHtml(row.date)}</td>
            <td>${row.percent}%</td>
            <td><small>${escapeHtml(row.notes)}</small></td>
          </tr>
        `;
      }).join('');
      
      const validCount = importPreviewData.filter(r => r.valid).length;
      $('dtImportCount').textContent = validCount;
      $('dtImportPreview').style.display = 'block';
      
    } catch (err) {
      console.error('CSV parse error:', err);
      alert('Error parsing CSV: ' + err.message);
    }
  }
  
  function renderImportHistory() {
    const historyList = $('dtImportHistoryList');
    if (!historyList) return;
    
    const history = JSON.parse(localStorage.getItem(IMPORT_HISTORY_KEY) || '[]');
    
    if (history.length === 0) {
      historyList.innerHTML = '<p style="opacity: 0.7; text-align: center;">No imports yet</p>';
      return;
    }
    
    historyList.innerHTML = history.map(h => `
      <div style="padding: 8px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(0,0,0,.2);">
        <strong>${new Date(h.date).toLocaleDateString()} ${new Date(h.date).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</strong>
        - ${h.records} records from ${h.source}
      </div>
    `).join('');
  }

  // ===== DATA QUALITY VALIDATION FUNCTIONALITY =====
  
  const DISMISSED_VALIDATIONS_KEY = 'rc_dismissed_validations';
  let validationIssues = [];
  
  function validateProgressData() {
    const issues = [];
    const dismissed = new Set(JSON.parse(localStorage.getItem(DISMISSED_VALIDATIONS_KEY) || '[]'));
    
    // Build lookup maps
    const goalMap = new Map();
    for (const g of goalsData) {
      goalMap.set(`${g.student_code}_${g.code}`, g);
    }
    
    // Check each progress entry
    for (const p of progressData) {
      const goal = goalMap.get(`${p.student_code}_${p.goal_code}`);
      const issueKey = `${p.student_code}_${p.goal_code}_${p.date}`;
      
      // Progress > Mastery (using goal.target field which represents mastery threshold percentage)
      if (goal && goal.target && p.percent > goal.target) {
        const key = `exceeds_mastery_${issueKey}`;
        if (!dismissed.has(key)) {
          issues.push({
            id: key,
            type: 'exceeds_mastery',
            severity: 'warning',
            student_code: p.student_code,
            goal_code: p.goal_code,
            message: `Progress (${p.percent}%) exceeds mastery target (${goal.target}%)`,
            date: p.date
          });
        }
      }
      
      // Future date
      if (new Date(p.date) > new Date()) {
        const key = `future_date_${issueKey}`;
        if (!dismissed.has(key)) {
          issues.push({
            id: key,
            type: 'future_date',
            severity: 'error',
            student_code: p.student_code,
            goal_code: p.goal_code,
            message: `Entry dated in the future: ${p.date}`,
            date: p.date
          });
        }
      }
      
      // Out of range
      if (p.percent < 0 || p.percent > 100) {
        const key = `out_of_range_${issueKey}`;
        if (!dismissed.has(key)) {
          issues.push({
            id: key,
            type: 'out_of_range',
            severity: 'error',
            student_code: p.student_code,
            goal_code: p.goal_code,
            message: `Value out of range: ${p.percent}%`,
            date: p.date
          });
        }
      }
    }
    
    // Check for duplicate entries
    const seen = new Map();
    for (const p of progressData) {
      const key = `${p.student_code}_${p.goal_code}_${p.date}_${p.percent}`;
      if (seen.has(key)) {
        const issueKey = `duplicate_${key}`;
        if (!dismissed.has(issueKey)) {
          issues.push({
            id: issueKey,
            type: 'duplicate',
            severity: 'warning',
            student_code: p.student_code,
            goal_code: p.goal_code,
            message: 'Duplicate entry detected',
            date: p.date
          });
        }
      }
      seen.set(key, true);
    }
    
    // Check for missing baselines
    const goalsWithProgress = new Set(progressData.map(p => `${p.student_code}_${p.goal_code}`));
    for (const g of goalsData) {
      const key = `${g.student_code}_${g.code}`;
      if (goalsWithProgress.has(key) && g.baseline == null) {
        const issueKey = `missing_baseline_${key}`;
        if (!dismissed.has(issueKey)) {
          issues.push({
            id: issueKey,
            type: 'missing_baseline',
            severity: 'warning',
            student_code: g.student_code,
            goal_code: g.code,
            message: 'Goal has progress data but no baseline set'
          });
        }
      }
    }
    
    // Check for stale goals (no data in 60+ days)
    const now = new Date();
    for (const g of goalsData) {
      const goalProgress = progressData
        .filter(p => p.student_code === g.student_code && p.goal_code === g.code)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (goalProgress.length > 0) {
        const lastDate = new Date(goalProgress[0].date);
        const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
        if (daysSince > 60) {
          const issueKey = `stale_${g.student_code}_${g.code}`;
          if (!dismissed.has(issueKey)) {
            issues.push({
              id: issueKey,
              type: 'stale',
              severity: 'warning',
              student_code: g.student_code,
              goal_code: g.code,
              message: `No data collected in ${daysSince} days`
            });
          }
        }
      }
    }
    
    validationIssues = issues;
    return issues;
  }
  
  function renderValidationDashboard() {
    const issues = validateProgressData();
    const summaryEl = $('dtValidationSummary');
    const issuesEl = $('dtValidationIssues');
    const emptyEl = $('dtValidationEmpty');
    
    if (!summaryEl) return;
    
    if (issues.length === 0) {
      summaryEl.innerHTML = '';
      issuesEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }
    
    emptyEl.style.display = 'none';
    issuesEl.style.display = 'block';
    
    // Count by type
    const counts = {};
    issues.forEach(i => {
      counts[i.type] = (counts[i.type] || 0) + 1;
    });
    
    // Summary cards
    summaryEl.innerHTML = Object.entries(counts).map(([type, count]) => {
      const labels = {
        exceeds_mastery: 'Progress > Mastery',
        future_date: 'Future Dates',
        out_of_range: 'Out of Range',
        duplicate: 'Duplicates',
        missing_baseline: 'Missing Baseline',
        stale: 'Stale Goals (60+ days)'
      };
      return `
        <div style="padding: 12px; border: 1px solid rgba(245,158,11,.35); border-radius: 10px; background: rgba(245,158,11,.08);">
          <div style="font-size: 20px; font-weight: 700;">${count}</div>
          <div style="font-size: 12px; opacity: 0.85;">${labels[type] || type}</div>
        </div>
      `;
    }).join('');
    
    // Issues list
    const accordion = $('dtValidationAccordion');
    if (!accordion) return;
    
    accordion.innerHTML = issues.map((issue, idx) => {
      const student = studentsData.find(s => s.code === issue.student_code);
      const icon = issue.severity === 'error' ? '🔴' : '⚠️';
      
      return `
        <div class="dt-accordion-item">
          <div class="dt-accordion-header" data-toggle-issue="${idx}">
            <div class="dt-accordion-title">
              <span>${icon}</span>
              <span><strong>${student ? student.name : issue.student_code}</strong> - Goal ${escapeHtml(issue.goal_code)}</span>
            </div>
            <span class="dt-accordion-icon">▶</span>
          </div>
          <div class="dt-accordion-content">
            <p style="margin: 0 0 12px 0;">${escapeHtml(issue.message)}</p>
            ${issue.date ? `<p style="margin: 0 0 12px 0; opacity: 0.7;"><small>Date: ${issue.date}</small></p>` : ''}
            <div style="display: flex; gap: 8px;">
              <button class="dt-btn" data-dismiss-issue="${issue.id}">Dismiss</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    // Add event listeners for issue toggles
    accordion.querySelectorAll('[data-toggle-issue]').forEach(el => {
      el.addEventListener('click', () => {
        el.closest('.dt-accordion-item').classList.toggle('expanded');
      });
    });
    
    // Add event listeners for dismiss buttons
    accordion.querySelectorAll('[data-dismiss-issue]').forEach(btn => {
      btn.addEventListener('click', () => {
        const issueId = btn.dataset.dismissIssue;
        const dismissed = JSON.parse(localStorage.getItem(DISMISSED_VALIDATIONS_KEY) || '[]');
        dismissed.push(issueId);
        localStorage.setItem(DISMISSED_VALIDATIONS_KEY, JSON.stringify(dismissed));
        renderValidationDashboard();
      });
    });
  }
  
  function setupValidationHandlers() {
    const refreshBtn = $('dtValidationRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        renderValidationDashboard();
      });
    }
    
    renderValidationDashboard();
  }

  // ===== DATA COLLECTION SCHEDULE FUNCTIONALITY =====
  
  const SCHEDULE_KEY = 'rc_data_schedule';
  
  function getScheduleFrequency(studentCode, goalCode) {
    const schedules = JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '{}');
    return schedules[`${studentCode}_${goalCode}`] || 'quarterly';
  }
  
  function setScheduleFrequency(studentCode, goalCode, frequency) {
    const schedules = JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '{}');
    schedules[`${studentCode}_${goalCode}`] = frequency;
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedules));
  }
  
  function calculateNextDue(lastCollected, frequency) {
    if (!lastCollected) {
      return new Date(); // Return current date to indicate immediate collection needed
    }
    
    const last = new Date(lastCollected);
    const next = new Date(last);
    
    switch (frequency) {
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'biweekly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'quarterly':
      default:
        next.setMonth(next.getMonth() + 3);
        break;
    }
    
    return next;
  }
  
  function getCollectionStatus(nextDue) {
    const now = new Date();
    const daysUntil = Math.floor((nextDue - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntil < 0) {
      return { status: 'overdue', icon: '🔴', label: 'Overdue' };
    } else if (daysUntil <= 3) {
      return { status: 'due_soon', icon: '🟡', label: 'Due Soon' };
    } else {
      return { status: 'on_track', icon: '🟢', label: 'On Track' };
    }
  }
  
  function renderCollectionSchedule() {
    const scheduleBody = $('dtScheduleTableBody');
    const thisWeekList = $('dtScheduleThisWeekList');
    
    if (!scheduleBody || !thisWeekList) return;
    
    const scheduleItems = [];
    const thisWeekItems = [];
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Build schedule for each goal
    goalsData.forEach(goal => {
      const student = studentsData.find(s => s.code === goal.student_code);
      if (!student) return;
      
      const frequency = getScheduleFrequency(goal.student_code, goal.code);
      
      // Find last collected date
      const goalProgress = progressData
        .filter(p => p.student_code === goal.student_code && p.goal_code === goal.code)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      
      const lastCollected = goalProgress.length > 0 ? goalProgress[0].date : null;
      const nextDue = calculateNextDue(lastCollected, frequency);
      const { status, icon, label } = getCollectionStatus(nextDue);
      
      const item = {
        student,
        goal,
        frequency,
        lastCollected,
        nextDue,
        status,
        icon,
        label
      };
      
      scheduleItems.push(item);
      
      // Add to this week if due within 7 days
      if (nextDue <= weekFromNow) {
        thisWeekItems.push(item);
      }
    });
    
    // Sort by next due date
    scheduleItems.sort((a, b) => a.nextDue - b.nextDue);
    thisWeekItems.sort((a, b) => a.nextDue - b.nextDue);
    
    // Render this week
    if (thisWeekItems.length === 0) {
      thisWeekList.innerHTML = '<p style="margin: 0; opacity: 0.7;">No data collection due this week</p>';
    } else {
      thisWeekList.innerHTML = thisWeekItems.map(item => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; margin-bottom: 8px; border-radius: 8px; background: rgba(0,0,0,.2);">
          <div>
            <strong>${escapeHtml(item.student.name)}</strong> - Goal ${escapeHtml(item.goal.code)}
            <br><small style="opacity: 0.7;">Due: ${item.nextDue.toLocaleDateString()}</small>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${item.icon}</span>
            <button class="dt-btn" data-collect-student="${item.student.code}">
              Collect Now
            </button>
          </div>
        </div>
      `).join('');
    }
    
    // Render full schedule
    scheduleBody.innerHTML = scheduleItems.map(item => `
      <tr>
        <td>${escapeHtml(item.student.name)}<br><small style="opacity: 0.7;">${item.student.code}</small></td>
        <td>${escapeHtml(item.goal.code)}<br><small style="opacity: 0.7;">${escapeHtml(item.goal.description || '')}</small></td>
        <td>
          <select 
            class="dt-search-input" 
            style="padding: 6px 8px; font-size: 13px; width: auto;"
            data-schedule-student="${item.student.code}"
            data-schedule-goal="${item.goal.code}"
          >
            <option value="weekly" ${item.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="biweekly" ${item.frequency === 'biweekly' ? 'selected' : ''}>Biweekly</option>
            <option value="monthly" ${item.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="quarterly" ${item.frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
          </select>
        </td>
        <td>${item.lastCollected ? new Date(item.lastCollected).toLocaleDateString() : 'Never'}</td>
        <td>${item.nextDue.toLocaleDateString()}</td>
        <td>${item.icon} ${item.label}</td>
        <td>
          <button class="dt-btn" data-collect-student="${item.student.code}">
            Collect
          </button>
        </td>
      </tr>
    `).join('');
    
    // Add event listeners for collect buttons
    document.querySelectorAll('[data-collect-student]').forEach(btn => {
      btn.addEventListener('click', () => {
        const studentCode = btn.dataset.collectStudent;
        window.location.href = `/teacher/students/?student=${studentCode}`;
      });
    });
    
    // Add event listeners for frequency dropdowns
    scheduleBody.querySelectorAll('[data-schedule-student]').forEach(select => {
      select.addEventListener('change', () => {
        const studentCode = select.dataset.scheduleStudent;
        const goalCode = select.dataset.scheduleGoal;
        const frequency = select.value;
        setScheduleFrequency(studentCode, goalCode, frequency);
        renderCollectionSchedule();
      });
    });
  }
  
  function setupScheduleHandlers() {
    const settingsBtn = $('dtScheduleSettings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        alert('Schedule Settings\n\nYou can set collection frequency for each goal in the table below.');
      });
    }
    
    renderCollectionSchedule();
  }

  // Main render function
  function render() {
    renderClassFilters();
    renderQuarterFilters();
    renderGoalAreaFilters();
    renderAccordion();
  }

  // Initialize
  async function init() {
    await loadData();

    // Sub-tab navigation
    const TAB_KEY = 'rc_data_active_tab';
    function activateTab(tabName) {
      document.querySelectorAll('.dt-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
      });
      document.querySelectorAll('.dt-tab-section').forEach(section => {
        section.classList.toggle('active', section.dataset.tab === tabName);
      });
      localStorage.setItem(TAB_KEY, tabName);
    }
    document.querySelectorAll('.dt-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
    activateTab(localStorage.getItem(TAB_KEY) || 'progress');
    
    // Set up search input
    const searchInput = $('dtSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchText = e.target.value;
        render();
      });
    }
    
    // Set up modal close handlers
    const modalClose = $('dtModalClose');
    if (modalClose) {
      modalClose.addEventListener('click', closeSamplesModal);
    }
    
    const modal = $('dtSamplesModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSamplesModal();
      });
    }
    
    // Set up DOCX export button
    const exportBtn = $('dtExportDocx');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportToDocx);
    }
    
    // Set up CSV export button
    const csvBtn = $('dtExportCsv');
    if (csvBtn) {
      csvBtn.addEventListener('click', exportToCsv);
    }
    
    // Set up Bulk Add Progress button
    const bulkAddBtn = $('dtBulkAdd');
    if (bulkAddBtn) {
      bulkAddBtn.addEventListener('click', bulkAddProgress);
    }
    
    // Set up new feature handlers
    setupImportHandlers();
    setupValidationHandlers();
    setupScheduleHandlers();
  }

  // Start the app
  init();
})();
