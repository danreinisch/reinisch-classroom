(async () => {
  "use strict";

  // Only run on data page
  if (!location.pathname.startsWith("/teacher/data")) return;

  // Import data adapter for Supabase/localStorage abstraction
  const { db, isRemote } = await import('/web/data-adapter.js');

  // NOTE: Keep in sync with CANON_CLASSES in tc-work.js and tc-gradebook.js
  const CANON_CLASSES = [
    "LA 1 SC",
    "LA 2 SC",
    "LA 3 SC",
    "LA 4 SC",
    "Life Skills",
    "Life Skills LA",
  ];

  const $ = (id) => document.getElementById(id);

  // State
  let currentClassFilter = "All Classes";
  let currentQuarterFilter = getCurrentQuarter(); // Default to current quarter
  let currentGoalAreaFilter = "All";
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
      iconEl.textContent = '🟢';
      textEl.textContent = 'Synced';
    } else if (syncStatus === 'local') {
      iconEl.textContent = '🟡';
      textEl.textContent = 'Local mode';
    } else {
      iconEl.textContent = '🔴';
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

  // Filter students based on current filters
  function getFilteredStudents() {
    let filtered = studentsData;
    
    // Filter by class
    if (currentClassFilter !== 'All Classes') {
      filtered = filtered.filter(student => {
        // Check student.class_id
        if (student.class_id === currentClassFilter) return true;
        
        // Check enrollments
        const enrollment = classEnrollmentsData.find(e => 
          e.student_code === student.code && e.class_id === currentClassFilter
        );
        return !!enrollment;
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

  // Render sparkline SVG for goal progress
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
    
    return `
      <div class="dt-sparkline">
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          <defs>
            <linearGradient id="sparkGradient-${goal.code}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:rgba(34, 197, 94, 0.2);stop-opacity:1" />
              <stop offset="100%" style="stop-color:rgba(34, 197, 94, 0.02);stop-opacity:1" />
            </linearGradient>
          </defs>
          <polygon 
            points="${polygonPoints.trim()}" 
            fill="url(#sparkGradient-${goal.code})"
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
    return `
      <div class="dt-goal-row" data-goal="${goal.code}" data-student="${studentCode}">
        <div class="dt-goal-header">
          <div>
            <strong>${goal.code}</strong> — ${goal.desc || 'No description'}
          </div>
          <button class="dt-btn" data-goal="${goal.code}" data-student="${studentCode}">📎 Samples</button>
        </div>
        <div class="dt-goal-meta">
          <span>Area: <strong>${goal.goal_area || 'Uncategorized'}</strong></span>
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
    
    // Filter student goals by goal area if needed
    const studentsWithFilteredGoals = filtered.map(student => {
      let goals = student.goals;
      if (currentGoalAreaFilter !== 'All') {
        goals = goals.filter(goal => (goal.goal_area || 'Uncategorized') === currentGoalAreaFilter);
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
  
  // Show inline form for adding data point
  function showInlineForm(goalCode, studentCode) {
    const goalRow = document.querySelector(`.dt-goal-row[data-goal="${goalCode}"][data-student="${studentCode}"]`);
    if (!goalRow) return;
    
    const form = goalRow.querySelector('.dt-inline-form');
    if (!form) return;
    
    // Reset form
    form.querySelector('.dt-date-input').value = formatDateYYYYMMDD();
    form.querySelector('.dt-value-input').value = '';
    form.style.display = 'flex';
    
    // Focus value input
    setTimeout(() => form.querySelector('.dt-value-input').focus(), 100);
  }
  
  // Hide inline form
  function hideInlineForm(form) {
    form.style.display = 'none';
    form.querySelector('.dt-value-input').value = '';
  }
  
  // Save inline data point
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
  
  // Start cell editing
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

  // Export to DOCX (simplified implementation)
  // Helper function to escape XML/HTML special characters
  function escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Export to DOCX using HTML format (Word-compatible)
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
  
  <h2>Summary</h2>
  <p><strong>Goal Area:</strong> ${escapeXml(goal.goal_area || 'Uncategorized')}</p>
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
  }

  // Start the app
  init();
})();
