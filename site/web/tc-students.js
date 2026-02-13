(async () => {
  "use strict";

  // Only run on students page
  if (!location.pathname.startsWith("/teacher/students")) return;

  // Import data adapter for Supabase/localStorage abstraction
  const { db } = await import('/web/data-adapter.js');
  const { getSupabase } = await import('/web/supabase-client.js');

  // Constants
  const FULL_CLASS_NAMES = [
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

  const GOAL_AREAS = [
    "Reading Comprehension",
    "Written Expression",
    "Basic Reading",
    "Behavior",
    "Life Skills Transition",
    "Life Skills Reading Skills",
    "Life Skills Writing Skills",
    "Math Calculation",
    "Math Problem Solving",
    "Reading Fluency",
    "Social Skills",
    "Language",
    "Life Skills",
    "Emotional Regulation",
    "Reading Skills"
  ];

  const CLASS_ABBREVIATIONS = {
    "Language Arts 1 SC": "LA1SC",
    "Language Arts 2 SC": "LA2SC",
    "Language Arts 3 SC": "LA3SC",
    "Language Arts 4 SC": "LA4SC",
    "Life Skills Language Arts SC": "LSLASC",
    "Life Skills": "LS",
    "Consumer Math": "CM",
    "Geometry SC": "GeoSC",
    "Speech/Language": "S/L",
    "Warrior Academy": "WA"
  };

  const GOAL_AREA_ICONS = {
    "Reading Comprehension": "📖",
    "Written Expression": "✍️",
    "Basic Reading": "📚",
    "Behavior": "🎯",
    "Life Skills Transition": "🚀",
    "Life Skills Reading Skills": "📖",
    "Life Skills Writing Skills": "✍️",
    "Math Calculation": "🔢",
    "Math Problem Solving": "🧮",
    "Reading Fluency": "📝",
    "Social Skills": "🤝",
    "Language": "💬",
    "Life Skills": "🛠️",
    "Emotional Regulation": "😌",
    "Reading Skills": "📕"
  };

  // Mapping from DB class codes to UI canonical class names
  // Used to normalize enrollment data that may come with class_code instead of class_name
  const CLASS_CODE_TO_CANONICAL_NAMES = {
    'LA1': ['Language Arts 1 SC'],
    'LA2': ['Language Arts 2 SC'],
    'LA3': ['Language Arts 3 SC'],
    'LA4': ['Language Arts 4 SC'],
    'LS-LA': ['Life Skills Language Arts SC'],
    'LS': ['Life Skills'],
    'CM': ['Consumer Math'],
    'GEO-SC': ['Geometry SC'],
    'SL': ['Speech/Language'],
    'WA': ['Warrior Academy']
  };

  // Helpers
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function abbreviateClass(fullName) {
    return CLASS_ABBREVIATIONS[fullName] || fullName;
  }

  /**
   * Map a goal area to a color category for the left border
   */
  function goalAreaToColorCategory(goalArea) {
    const area = (goalArea || '').toLowerCase();
    if (area.includes('reading')) return 'Reading';
    if (area.includes('writ')) return 'Writing';
    if (area.includes('math')) return 'Math';
    if (area.includes('behavior')) return 'Behavior';
    if (area.includes('life skill')) return 'LifeSkills';
    if (area.includes('social')) return 'Social';
    if (area.includes('language')) return 'Language';
    if (area.includes('emotional')) return 'Emotional';
    return 'Other';
  }

  /**
   * Get date urgency class based on days until due
   */
  function getDateUrgency(dateStr) {
    if (!dateStr) return 'none';
    const due = new Date(dateStr);
    if (isNaN(due.getTime())) return 'none';
    const now = new Date();
    const daysUntil = (due - now) / (1000 * 60 * 60 * 24);
    if (daysUntil <= 30) return 'urgent';
    if (daysUntil <= 60) return 'warning';
    return 'ok';
  }

  /**
   * Check if IEP due date is urgent (within 30 days or overdue)
   */
  function isIepUrgent(iepDue) {
    if (!iepDue) return false;
    const due = new Date(iepDue);
    if (isNaN(due.getTime())) return false;
    const now = new Date();
    const daysUntil = (due - now) / (1000 * 60 * 60 * 24);
    return daysUntil <= 30;
  }

  /**
   * Normalize enrollment data to ensure class_name is present
   * If class_name is missing but class_code is present, derives class_name from class_code mapping
   */
  function normalizeEnrollments(enrollments) {
    return enrollments.map(enrollment => {
      // If class_name already exists, return as is
      if (enrollment.class_name) {
        return enrollment;
      }
      
      // If class_code exists, try to map it to canonical name(s)
      if (enrollment.class_code) {
        const mappedNames = CLASS_CODE_TO_CANONICAL_NAMES[enrollment.class_code];
        if (mappedNames && mappedNames.length > 0) {
          // Use first mapped name as the class_name
          return { ...enrollment, class_name: mappedNames[0] };
        }
        // If no mapping found, use class_code as fallback
        return { ...enrollment, class_name: enrollment.class_code };
      }
      
      // If neither exists, return with Unknown
      return { ...enrollment, class_name: 'Unknown' };
    });
  }

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // State
  let allStudents = [];
  let allGoals = [];
  let allEnrollments = [];
  let allProgressEntries = []; // Progress data for data collection status
  let filteredStudents = [];
  let selectedStudent = null;
  let expandedStudent = null; // For inline expand in table
  let selectedClassFilter = 'All';
  let selectedGoalAreaFilter = 'All';
  let searchQuery = '';
  let isSyncing = false;
  let sortBy = 'code'; // 'code', 'goals', 'iep_due', 'eval_due'
  let selectedDetailTab = 'goals'; // 'goals', 'classes', 'settings'
  let editingGoalId = null;
  let enteringDataGoalId = null; // Track which goal has the data entry form open
  let showArchived = false;
  let collapsedGoals = new Set(); // Track which goals are collapsed
  let truncatedGoals = new Set(); // Track which goals have truncated descriptions
  let iepWizardData = null; // { step: 1, studentCode: '', goalsToArchive: Set, newGoals: [], iepDue: '', evalDue: '' }

  // Quarter dates management
  const DEFAULT_QUARTER_DATES = {
    q1: { start: "2025-08-18", end: "2025-10-17" },
    q2: { start: "2025-10-20", end: "2026-01-23" },
    q3: { start: "2026-01-27", end: "2026-03-28" },
    q4: { start: "2026-03-30", end: "2026-05-22" }
  };

  function getQuarterDates() {
    try {
      const saved = localStorage.getItem('rc_quarter_dates');
      return saved ? JSON.parse(saved) : DEFAULT_QUARTER_DATES;
    } catch (e) {
      return DEFAULT_QUARTER_DATES;
    }
  }

  function saveQuarterDates(dates) {
    localStorage.setItem('rc_quarter_dates', JSON.stringify(dates));
  }

  function getCurrentQuarter() {
    const dates = getQuarterDates();
    const today = new Date();
    
    for (const [quarter, range] of Object.entries(dates)) {
      const start = new Date(range.start);
      const end = new Date(range.end);
      if (today >= start && today <= end) {
        return quarter.toUpperCase();
      }
    }
    return 'Q1'; // Default
  }

  function formatQuarterDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function renderQuarterBar() {
    const displayEl = document.getElementById('stQuarterDisplay');
    if (!displayEl) return;

    const dates = getQuarterDates();
    const current = getCurrentQuarter();

    const html = Object.entries(dates).map(([quarter, range]) => {
      const q = quarter.toUpperCase();
      const isCurrent = q === current;
      return `
        <div class="st-quarter-item ${isCurrent ? 'current' : ''}">
          ${q}: ${formatQuarterDate(range.start)}–${formatQuarterDate(range.end)}
        </div>
      `;
    }).join('');

    displayEl.innerHTML = html;
  }

  function renderQuarterEditForm() {
    const formEl = document.getElementById('stQuarterEditForm');
    if (!formEl) return;

    const dates = getQuarterDates();

    const html = Object.entries(dates).map(([quarter, range]) => `
      <div class="st-quarter-edit-row">
        <label>${quarter.toUpperCase()}:</label>
        <input type="date" name="${quarter}-start" value="${range.start}" />
        <span>to</span>
        <input type="date" name="${quarter}-end" value="${range.end}" />
      </div>
    `).join('') + `
      <div class="st-quarter-edit-row">
        <button type="button" class="st-btn st-btn-small" id="stCancelQuarterEdit">Cancel</button>
        <button type="button" class="st-btn st-btn-primary st-btn-small" id="stSaveQuarters">Save</button>
      </div>
    `;

    formEl.innerHTML = html;
  }

  function exportCaseload() {
    const rows = [['Code', 'Classes', 'Goals', 'IEP Due', 'Eval Due']];
    for (const student of filteredStudents) {
      const enrollments = allEnrollments.filter(e => e.student_code === student.code);
      const goals = allGoals.filter(g => g.student_code === student.code);
      const classes = enrollments.map(e => e.class_name).join('; ');
      rows.push([
        student.code,
        classes,
        goals.length,
        student.iep_due || '',
        student.eval_due || ''
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caseload_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Progress tracking functions
  async function loadProgressEntries() {
    try {
      const supabase = await getSupabase();
      if (supabase) {
        const { data, error } = await supabase.from('goal_progress').select('*');
        if (error) throw error;
        return data || [];
      }
    } catch (e) {
      console.warn('[tc-students] Could not load from goal_progress table, falling back to localStorage:', e);
    }
    
    // Fall back to localStorage
    try {
      const stored = localStorage.getItem('rc_goal_progress_v1');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('[tc-students] Error loading progress from localStorage:', e);
      return [];
    }
  }

  function getProgressForGoal(studentCode, goalCode) {
    return allProgressEntries.filter(p => 
      p.student_code === studentCode && p.goal_code === goalCode
    );
  }

  function getProgressThisQuarter(studentCode, goalCode) {
    const dates = getQuarterDates();
    const current = getCurrentQuarter().toLowerCase();
    const range = dates[current];
    if (!range) return [];
    
    const start = new Date(range.start);
    const end = new Date(range.end);
    
    return getProgressForGoal(studentCode, goalCode).filter(p => {
      const d = new Date(p.date);
      return d >= start && d <= end;
    });
  }

  function getLastProgressDate(studentCode, goalCode) {
    const entries = getProgressForGoal(studentCode, goalCode);
    if (entries.length === 0) return null;
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    return entries[0].date;
  }

  function getGoalDataStatus(studentCode, goalCode, expectedMin) {
    // If expectedMin not provided, look it up from the goal
    if (expectedMin === undefined) {
      const goal = allGoals.find(g => g.student_code === studentCode && g.code === goalCode);
      expectedMin = (goal && goal.expected_data_points) || 3;
    }
    
    const thisQuarter = getProgressThisQuarter(studentCode, goalCode);
    const count = thisQuarter.length;
    
    // Calculate how far through the quarter we are
    const dates = getQuarterDates();
    const current = getCurrentQuarter().toLowerCase();
    const range = dates[current];
    if (!range) return { status: 'ok', count, expected: expectedMin };
    
    const start = new Date(range.start);
    const end = new Date(range.end);
    const now = new Date();
    const totalDays = (end - start) / (1000 * 60 * 60 * 24);
    const daysPassed = (now - start) / (1000 * 60 * 60 * 24);
    const progress = Math.min(daysPassed / totalDays, 1);
    
    // Expected data points so far based on quarter progress
    const expectedSoFar = Math.ceil(expectedMin * progress);
    
    if (count >= expectedSoFar) return { status: 'ok', count, expected: expectedMin };
    if (count > 0) return { status: 'warning', count, expected: expectedMin };
    return { status: 'behind', count, expected: expectedMin };
  }

  function getStudentDataStatus(studentCode) {
    const studentGoals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
    if (studentGoals.length === 0) return '—';
    
    let allOk = true;
    let anyBehind = false;
    
    for (const goal of studentGoals) {
      const status = getGoalDataStatus(studentCode, goal.code);
      if (status.status === 'behind') anyBehind = true;
      if (status.status !== 'ok') allOk = false;
    }
    
    if (allOk) return '✅';
    if (anyBehind) return '🔴';
    return '⚠️';
  }

  // Load data
  async function loadData() {
    try {
      console.log('[tc-students] Loading data...');
      isSyncing = true;
      updateSyncIndicator();

      // Use Promise.allSettled to handle partial failures
      const results = await Promise.allSettled([
        db.listStudents(),
        db.listGoalsAll(),
        db.listClassEnrollments(),
        loadProgressEntries() // Load progress data
      ]);

      let schemaDriftDetected = false;
      
      // Extract successful results
      if (results[0].status === 'fulfilled') {
        allStudents = results[0].value.filter(s => !s.code.startsWith('TEACHER'));
      } else {
        console.error('[tc-students] Failed to load students:', results[0].reason);
        allStudents = [];
        schemaDriftDetected = true;
      }

      if (results[1].status === 'fulfilled') {
        allGoals = results[1].value;
      } else {
        console.error('[tc-students] Failed to load goals:', results[1].reason);
        allGoals = [];
        schemaDriftDetected = true;
      }

      if (results[2].status === 'fulfilled') {
        allEnrollments = normalizeEnrollments(results[2].value);
      } else {
        console.error('[tc-students] Failed to load enrollments:', results[2].reason);
        allEnrollments = [];
        schemaDriftDetected = true;
      }

      if (results[3].status === 'fulfilled') {
        allProgressEntries = results[3].value;
      } else {
        console.error('[tc-students] Failed to load progress entries:', results[3].reason);
        allProgressEntries = [];
      }

      console.log('[tc-students] Loaded:', allStudents.length, 'students,', allGoals.length, 'goals,', allProgressEntries.length, 'progress entries');
      
      // Show schema drift banner if any call failed
      if (schemaDriftDetected) {
        showSchemaDriftBanner();
      } else {
        hideSchemaDriftBanner();
      }
      
      filterStudents();
      renderStudentList();
      
      // Don't auto-expand first student - let user choose

      isSyncing = false;
      updateSyncIndicator();
    } catch (error) {
      console.error('[tc-students] Error loading data:', error);
      isSyncing = false;
      updateSyncIndicator();
      
      // Still try to render with whatever data we have
      filterStudents();
      renderStudentList();
    }
  }

  function updateSyncIndicator() {
    const indicator = document.getElementById('stSyncStatus');
    if (indicator) {
      if (isSyncing) {
        indicator.textContent = '🔄';
        indicator.title = 'Syncing...';
      } else {
        indicator.textContent = '🟢';
        indicator.title = 'Connected';
      }
    }
  }

  function showSchemaDriftBanner() {
    // Remove existing banner if present
    hideSchemaDriftBanner();
    
    // Find the student detail main container (right pane)
    const container = document.querySelector('.st-main');
    if (!container) return;
    
    // Create banner element
    const banner = document.createElement('div');
    banner.id = 'schema-drift-banner';
    banner.style.cssText = 'background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;';
    
    // Create warning icon
    const icon = document.createElement('span');
    icon.textContent = '⚠️';
    
    // Create content wrapper
    const content = document.createElement('div');
    
    // Create title
    const title = document.createElement('strong');
    title.textContent = 'Database schema is behind migrations';
    
    // Create description
    const description = document.createElement('div');
    description.style.cssText = 'font-size: 13px; opacity: 0.8;';
    description.textContent = 'Some columns are missing. Students loaded with basic fields only. Apply pending migrations to restore full functionality.';
    
    // Assemble the banner
    content.appendChild(title);
    content.appendChild(description);
    banner.appendChild(icon);
    banner.appendChild(content);
    
    // Insert at the top of the container
    container.insertBefore(banner, container.firstChild);
  }

  function hideSchemaDriftBanner() {
    const banner = document.getElementById('schema-drift-banner');
    if (banner) {
      banner.remove();
    }
  }

  function filterStudents() {
    let filtered = allStudents;

    // Filter out archived students unless showArchived is enabled
    if (!showArchived) {
      filtered = filtered.filter(s => s.status !== 'archived' && s.active !== false);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.code.toLowerCase().includes(query)
      );
    }

    if (selectedClassFilter !== 'All') {
      filtered = filtered.filter(s => {
        const enrollments = allEnrollments.filter(e => e.student_code === s.code);
        return enrollments.some(e => e.class_name === selectedClassFilter);
      });
    }

    // Sort the filtered students
    if (sortBy === 'code') {
      filtered.sort((a, b) => a.code.localeCompare(b.code));
    } else if (sortBy === 'goals') {
      filtered.sort((a, b) => {
        const aGoals = allGoals.filter(g => g.student_code === a.code).length;
        const bGoals = allGoals.filter(g => g.student_code === b.code).length;
        return bGoals - aGoals; // descending
      });
    } else if (sortBy === 'iep_due') {
      filtered.sort((a, b) => {
        const aDate = a.iep_due ? new Date(a.iep_due) : new Date('9999-12-31');
        const bDate = b.iep_due ? new Date(b.iep_due) : new Date('9999-12-31');
        return aDate - bDate; // ascending (soonest first, nulls last)
      });
    } else if (sortBy === 'eval_due') {
      filtered.sort((a, b) => {
        const aDate = a.eval_due ? new Date(a.eval_due) : new Date('9999-12-31');
        const bDate = b.eval_due ? new Date(b.eval_due) : new Date('9999-12-31');
        return aDate - bDate; // ascending (soonest first, nulls last)
      });
    }

    filteredStudents = filtered;
  }

  // Render functions
  function renderStudentList() {
    const tbody = document.getElementById('stStudentTableBody');
    if (!tbody) return;

    const html = filteredStudents.map(student => {
      const enrollments = allEnrollments.filter(e => e.student_code === student.code);
      const studentGoals = allGoals.filter(g => g.student_code === student.code);
      const classes = enrollments.map(e => abbreviateClass(e.class_name)).join(', ');
      const isExpanded = expandedStudent === student.code;
      const isArchived = student.status === 'archived' || student.active === false;
      
      const iepDue = student.iep_due ? formatDate(student.iep_due) : 'N/A';
      const iepUrgency = getDateUrgency(student.iep_due);
      
      const evalDue = student.eval_due ? formatDate(student.eval_due) : 'N/A';
      const evalUrgency = getDateUrgency(student.eval_due);

      let rows = `
        <tr class="${isExpanded ? 'expanded' : ''} ${isArchived ? 'st-row-archived' : ''}" data-code="${escapeHtml(student.code)}">
          <td class="st-chevron-cell">
            <span class="st-chevron ${isExpanded ? 'expanded' : ''}">▶</span>
          </td>
          <td class="st-code-cell">${escapeHtml(student.code)}</td>
          <td class="st-classes-cell">${escapeHtml(classes) || 'None'}</td>
          <td class="st-goals-cell">
            <span class="st-goals-badge">${studentGoals.length}</span>
          </td>
          <td class="st-date-${iepUrgency}">${escapeHtml(iepDue)}</td>
          <td class="st-date-${evalUrgency}">${escapeHtml(evalDue)}</td>
          <td>${getStudentDataStatus(student.code)}</td>
        </tr>
      `;

      // Add expanded detail row if this student is expanded
      if (isExpanded) {
        rows += `
          <tr class="st-expanded-row">
            <td colspan="7">
              <div class="st-expanded-content" id="stExpandedDetail-${escapeHtml(student.code)}">
                <!-- Detail content rendered separately -->
              </div>
            </td>
          </tr>
        `;
      }

      return rows;
    }).join('');

    tbody.innerHTML = html;

    // If a student is expanded, render their detail content
    if (expandedStudent) {
      renderExpandedDetail(expandedStudent);
    }
  }

  async function renderExpandedDetail(studentCode) {
    const container = document.getElementById(`stExpandedDetail-${studentCode}`);
    if (!container) return;

    const student = allStudents.find(s => s.code === studentCode);
    if (!student) {
      container.innerHTML = '<div class="empty-state">Student not found</div>';
      return;
    }

    const enrollments = allEnrollments.filter(e => e.student_code === student.code);
    const studentGoals = allGoals.filter(g => g.student_code === student.code);

    // Render header with tabs
    let tabContent = '';
    if (selectedDetailTab === 'goals') {
      tabContent = await renderStudentGoalsTab(student, studentGoals);
    } else if (selectedDetailTab === 'classes') {
      tabContent = renderStudentClassesTab(student, enrollments);
    } else if (selectedDetailTab === 'settings') {
      tabContent = renderStudentSettingsTab(student);
    }

    const isActive = student.status !== 'archived' && student.active !== false;
    const statusBadge = isActive 
      ? '<span class="st-badge st-badge-active">Active</span>' 
      : '<span class="st-badge">Archived</span>';

    container.innerHTML = `
      <div class="st-detail-header">
        <div>
          <h1 class="st-detail-title">${escapeHtml(student.code)}</h1>
          <div class="st-detail-meta">
            <span>👤 ${escapeHtml(student.primary_case_manager || 'N/A')}</span>
            <span class="st-date-${getDateUrgency(student.iep_due)}">📋 IEP: ${student.iep_due ? formatDate(student.iep_due) : 'N/A'}</span>
            <span class="st-date-${getDateUrgency(student.eval_due)}">📝 Eval: ${student.eval_due ? formatDate(student.eval_due) : 'N/A'}</span>
            ${statusBadge}
          </div>
        </div>
        <button class="st-btn st-btn-secondary" id="new-iep-btn">📋 New IEP</button>
      </div>

      <div class="st-tabs">
        <button class="st-tab ${selectedDetailTab === 'goals' ? 'active' : ''}" data-tab="goals">Goals</button>
        <button class="st-tab ${selectedDetailTab === 'classes' ? 'active' : ''}" data-tab="classes">Classes</button>
        <button class="st-tab ${selectedDetailTab === 'settings' ? 'active' : ''}" data-tab="settings">Settings</button>
      </div>

      <div class="st-tab-content">
        ${tabContent}
      </div>
    `;
  }

  async function renderStudentGoalsTab(student, studentGoals) {
    // Check for active tokens
    const activeTokens = await checkActiveTokens(student.code);

    // Mark goals with active tokens
    studentGoals.forEach(goal => {
      goal._hasActiveToken = !!activeTokens[goal.code];
    });

    let inContextGoals = studentGoals;
    let outsideGoals = [];

    if (selectedClassFilter !== 'All') {
      inContextGoals = studentGoals.filter(g => g.class_context === selectedClassFilter);
      outsideGoals = studentGoals.filter(g => g.class_context !== selectedClassFilter);
    }

    if (selectedGoalAreaFilter !== 'All') {
      inContextGoals = inContextGoals.filter(g => g.goal_area === selectedGoalAreaFilter);
      outsideGoals = outsideGoals.filter(g => g.goal_area === selectedGoalAreaFilter);
    }

    return renderStudentGoals(inContextGoals, outsideGoals);
  }

  function renderStudentClassesTab(student, enrollments) {
    return renderStudentClasses(student, enrollments);
  }

  function renderStudentSettingsTab(student) {
    const isActive = student.status !== 'archived' && student.active !== false;
    
    return `
      <div class="st-detail-section">
        <h3>Student Information</h3>
        <div class="st-form-group">
          <label class="st-form-label">Primary Case Manager</label>
          <input type="text" id="edit-case-manager" class="st-form-input" value="${escapeHtml(student.primary_case_manager || '')}" />
        </div>
        <div class="st-form-group">
          <label class="st-form-label">IEP Due Date</label>
          <input type="date" id="edit-iep-due" class="st-form-input" value="${student.iep_due || ''}" />
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Eval Due Date</label>
          <input type="date" id="edit-eval-due" class="st-form-input" value="${student.eval_due || ''}" />
        </div>
        <button class="st-btn st-btn-primary" id="save-student-info-btn">Save Changes</button>
      </div>

      <div class="st-detail-section">
        <h3>Actions</h3>
        ${renderStudentPassword(student)}
        ${isActive 
          ? '<button class="st-btn st-btn-danger" id="archive-student-btn">🗃️ Archive Student</button>'
          : '<button class="st-btn st-btn-primary" id="reactivate-student-btn">♻️ Reactivate Student</button>'
        }
      </div>
    `;
  }

  function renderClassFilterOptions() {
    const selectEl = document.getElementById('stClassFilter');
    if (!selectEl) return;

    const options = ['All', ...FULL_CLASS_NAMES].map(className => `
      <option value="${escapeHtml(className)}" ${selectedClassFilter === className ? 'selected' : ''}>
        ${className === 'All' ? 'All Classes' : escapeHtml(className)}
      </option>
    `).join('');

    selectEl.innerHTML = options;
  }

  /**
   * Check for active tokens for goals
   */
  async function checkActiveTokens(studentCode) {
    try {
      const tokens = await db.listDataEntryTokens(studentCode);
      const tokensByGoalCode = {};
      tokens.forEach(token => {
        tokensByGoalCode[token.goal_code] = token;
      });
      return tokensByGoalCode;
    } catch (err) {
      console.error('[tc-students] Error checking active tokens:', err);
      return {};
    }
  }

  /**
   * Handle copy data entry link
   */
  async function handleCopyDataEntryLink(goalId) {
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) {
      alert('Goal not found');
      return;
    }

    const student = allStudents.find(s => s.code === goal.student_code);
    if (!student) {
      alert('Student not found');
      return;
    }

    try {
      // Create token
      const tokenData = await db.createDataEntryToken({
        studentCode: student.code,
        goalCode: goal.code,
        dataCollector: goal.data_collector,
        dataCollectorEmail: goal.data_collector_email
      });

      // Build URL
      const url = `${window.location.origin}/data-entry/?token=${tokenData.token}`;

      // Copy to clipboard
      await navigator.clipboard.writeText(url);

      // Show toast notification
      showToast(`Link copied! Send it to ${goal.data_collector}.`);

      // Refresh display to show revoke button
      if (expandedStudent) {
        renderExpandedDetail(expandedStudent);
      }

    } catch (err) {
      console.error('[tc-students] Error creating token:', err);
      alert('Error creating data entry link. Please try again.');
    }
  }

  /**
   * Handle revoke data entry link
   */
  async function handleRevokeDataEntryLink(goalId) {
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) {
      alert('Goal not found');
      return;
    }

    const confirmed = confirm(`Revoke data entry link for ${goal.code}?\n\nThe current link will no longer work.`);
    if (!confirmed) return;

    try {
      // Get active tokens for this student
      const student = allStudents.find(s => s.code === goal.student_code);
      const tokens = await db.listDataEntryTokens(student.code);
      const token = tokens.find(t => t.goal_code === goal.code);

      if (!token) {
        alert('No active token found for this goal');
        return;
      }

      // Revoke token
      await db.revokeDataEntryToken(token.id);

      showToast('Link revoked successfully');

      // Refresh display to show copy button
      if (expandedStudent) {
        renderExpandedDetail(expandedStudent);
      }

    } catch (err) {
      console.error('[tc-students] Error revoking token:', err);
      alert('Error revoking link. Please try again.');
    }
  }

  /**
   * Show toast notification
   */
  function showToast(message) {
    // Create toast element
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(34, 197, 94, 0.95);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      font-size: 14px;
      max-width: 300px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }

  function renderStudentClasses(student, enrollments) {
    const classItems = FULL_CLASS_NAMES.map(className => {
      const isEnrolled = enrollments.some(e => e.class_name === className);
      return `
        <div class="st-class-item">
          <span class="st-class-checkbox">${isEnrolled ? '✓' : ''}</span>
          <span class="st-class-name">${escapeHtml(className)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="st-detail-section">
        <div class="st-section-header">
          <h3>Classes</h3>
          <button class="st-btn st-btn-secondary" id="manage-enrollments-btn">Manage Enrollments</button>
        </div>
        <div class="st-class-list">
          ${classItems}
        </div>
      </div>
    `;
  }

  function renderStudentGoals(inContextGoals, outsideGoals) {
    const goalAreaFilter = `
      <select id="goal-area-filter" class="st-form-select">
        <option value="All">All Goal Areas</option>
        ${GOAL_AREAS.map(area => `
          <option value="${escapeHtml(area)}" ${selectedGoalAreaFilter === area ? 'selected' : ''}>
            ${escapeHtml(area)}
          </option>
        `).join('')}
      </select>
    `;

    const inContextHtml = inContextGoals.map(goal => renderGoalCard(goal)).join('');
    
    let outsideHtml = '';
    if (selectedClassFilter !== 'All' && outsideGoals.length > 0) {
      outsideHtml = `
        <div class="st-outside-categories">
          <details>
            <summary>Outside Categories (${outsideGoals.length} goals from other classes)</summary>
            <div class="st-goal-cards">
              ${outsideGoals.map(goal => renderGoalCard(goal)).join('')}
            </div>
          </details>
        </div>
      `;
    }

    return `
      <div class="st-detail-section">
        <div class="st-section-header">
          <h3>IEP Goals</h3>
          <div class="st-section-actions">
            ${goalAreaFilter}
            <button class="st-btn st-btn-primary" id="add-goal-btn">+ Add Goal</button>
          </div>
        </div>
        <div class="st-goal-cards">
          ${inContextHtml || '<div class="st-empty">No goals in this category</div>'}
        </div>
        ${outsideHtml}
      </div>
    `;
  }

  function renderGoalCard(goal) {
    // Check if we're in inline edit mode for this goal
    if (editingGoalId === goal.id) {
      return renderGoalEditForm(goal);
    }

    // Check if we're in data entry mode for this goal
    if (enteringDataGoalId === goal.id) {
      return renderGoalCardWithDataEntry(goal);
    }

    const icon = GOAL_AREA_ICONS[goal.goal_area] || '📌';
    const dataCollectorWarning = goal.data_collector && goal.data_collector !== 'Dan Reinisch' ? '⚠️ ' : '';
    const classContext = goal.class_context ? `<div class="st-goal-class">📚 ${escapeHtml(goal.class_context)}</div>` : '';
    
    // Show token management for external data collectors (not Dan Reinisch)
    const showTokenBtn = goal.data_collector && goal.data_collector !== 'Dan Reinisch';
    const hasActiveToken = goal._hasActiveToken || false;
    
    // Get color category for the goal area
    const colorCategory = goalAreaToColorCategory(goal.goal_area);
    
    // Handle description truncation
    const fullDesc = goal.desc || goal.goal_text || '(No goal description provided)';
    const needsTruncation = fullDesc.length > 120;
    const descPreview = needsTruncation ? fullDesc.substring(0, 120) : fullDesc;
    
    const descHtml = needsTruncation
      ? `<div class="st-goal-description">
           <span class="st-desc-preview">${escapeHtml(descPreview)}…</span>
           <span class="st-desc-full" style="display:none">${escapeHtml(fullDesc)}</span>
           <button class="st-desc-toggle" style="background:none;border:none;color:rgba(59,130,246,1);cursor:pointer;font-size:13px;padding:0;margin-left:4px;">Show more</button>
         </div>`
      : `<div class="st-goal-description">${escapeHtml(fullDesc)}</div>`;

    // Get data collection status
    const lastDate = getLastProgressDate(goal.student_code, goal.code);
    const quarterProgress = getProgressThisQuarter(goal.student_code, goal.code);
    const dataStatus = getGoalDataStatus(goal.student_code, goal.code);

    const statusEmoji = dataStatus.status === 'ok' ? '✅' : dataStatus.status === 'warning' ? '⚠️' : '🔴';
    const statusText = `${quarterProgress.length} of ${dataStatus.expected} this quarter`;
    const lastText = lastDate ? `Last: ${formatDate(lastDate)}` : 'No data yet';

    return `
      <div class="st-goal-card collapsed" data-goal-id="${goal.id}" data-area="${colorCategory}">
        <div class="st-goal-header">
          <div class="st-goal-title-line">
            <span class="st-goal-icon">${icon}</span>
            <span class="st-goal-area-name">${escapeHtml(goal.goal_area || 'N/A')}</span>
            <span class="st-goal-code">${escapeHtml(goal.code || '')}</span>
            <span class="st-badge st-badge-measurement">${escapeHtml(goal.measurement_type || 'N/A')}</span>
          </div>
          <span class="st-goal-chevron">▶</span>
        </div>
        <div class="st-goal-body">
          ${descHtml}
          <div class="st-goal-metrics">
            <div class="st-metric">
              <span class="st-metric-label">Baseline:</span>
              <span class="st-metric-value">${escapeHtml(goal.baseline || 'N/A')}</span>
            </div>
            <div class="st-metric">
              <span class="st-metric-label">Target:</span>
              <span class="st-metric-value">${escapeHtml(goal.target || 'N/A')}</span>
            </div>
          </div>
          <div class="st-goal-data-status">
            <div class="st-data-status-item">
              <span>${statusEmoji}</span>
              <span>${statusText}</span>
            </div>
            <div class="st-data-status-item">
              <span>📅</span>
              <span>${lastText}</span>
            </div>
          </div>
        </div>
        <div class="st-goal-meta">
          <div class="st-goal-manager">👤 ${escapeHtml(goal.case_manager || 'N/A')}</div>
          <div class="st-goal-collector">${dataCollectorWarning}📊 ${escapeHtml(goal.data_collector || 'N/A')}</div>
          ${classContext}
        </div>
        ${goal.version ? `<div class="st-goal-version">v${goal.version}</div>` : ''}
        <div class="st-goal-actions">
          <button class="st-btn st-btn-small st-btn-primary enter-data-btn" data-goal-id="${goal.id}">📊 Enter Data</button>
          <button class="st-btn st-btn-small st-btn-secondary edit-goal-btn" data-goal-id="${goal.id}">Edit</button>
          <button class="st-btn st-btn-small st-btn-secondary version-goal-btn" data-goal-id="${goal.id}">Version</button>
          <button class="st-btn st-btn-small st-btn-danger archive-goal-btn" data-goal-id="${goal.id}">Archive</button>
          ${showTokenBtn ? `
            ${hasActiveToken 
              ? `<button class="st-btn st-btn-small st-btn-warning revoke-token-btn" data-goal-id="${goal.id}" title="Revoke data entry link">🗑️ Revoke Link</button>`
              : `<button class="st-btn st-btn-small st-btn-primary copy-token-btn" data-goal-id="${goal.id}" title="Copy data entry link for ${escapeHtml(goal.data_collector)}">🔗 Copy Link</button>`
            }
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderGoalCardWithDataEntry(goal) {
    const icon = GOAL_AREA_ICONS[goal.goal_area] || '📌';
    const colorCategory = goalAreaToColorCategory(goal.goal_area);
    const fullDesc = goal.desc || goal.goal_text || '(No goal description provided)';
    
    // Get today's date in ISO format
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];
    
    // Render measurement-specific fields
    let measurementFields = '';
    if (goal.measurement_type === 'Accuracy') {
      measurementFields = `
        <div class="st-form-group">
          <label class="st-form-label">Measurement</label>
          <div class="st-accuracy-group">
            <input type="number" class="st-form-input" name="correct" placeholder="Correct" min="0" required />
            <span>out of</span>
            <input type="number" class="st-form-input" name="total" placeholder="Total" min="1" required />
            <span class="st-accuracy-result"></span>
          </div>
        </div>
      `;
    } else if (goal.measurement_type === 'Frequency') {
      measurementFields = `
        <div class="st-form-group">
          <label class="st-form-label">Count</label>
          <input type="number" class="st-form-input" name="count" placeholder="Number of occurrences" min="0" required />
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Time Period</label>
          <select class="st-form-select" name="time_period">
            <option value="per session">Per Session</option>
            <option value="per day">Per Day</option>
            <option value="per week">Per Week</option>
          </select>
        </div>
      `;
    } else if (goal.measurement_type === 'Duration') {
      measurementFields = `
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">Minutes</label>
            <input type="number" class="st-form-input" name="minutes" placeholder="0" min="0" required />
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Seconds</label>
            <input type="number" class="st-form-input" name="seconds" placeholder="0" min="0" max="59" />
          </div>
        </div>
      `;
    } else if (goal.measurement_type === 'Rate') {
      measurementFields = `
        <div class="st-form-group">
          <label class="st-form-label">Rate</label>
          <div class="st-accuracy-group">
            <input type="number" class="st-form-input" name="count" placeholder="Count" min="0" required />
            <span>per</span>
            <input type="number" class="st-form-input" name="minutes" placeholder="Minutes" min="1" required />
            <span>minutes</span>
          </div>
        </div>
      `;
    } else {
      measurementFields = `
        <div class="st-form-group">
          <label class="st-form-label">Value</label>
          <input type="number" class="st-form-input" name="value" placeholder="Enter value" required />
        </div>
      `;
    }
    
    return `
      <div class="st-goal-card" data-goal-id="${goal.id}" data-area="${colorCategory}">
        <div class="st-goal-header">
          <div class="st-goal-title-line">
            <span class="st-goal-icon">${icon}</span>
            <span class="st-goal-area-name">${escapeHtml(goal.goal_area || 'N/A')}</span>
            <span class="st-goal-code">${escapeHtml(goal.code || '')}</span>
            <span class="st-badge st-badge-measurement">${escapeHtml(goal.measurement_type || 'N/A')}</span>
          </div>
        </div>
        <div class="st-goal-body">
          <div class="st-goal-description">${escapeHtml(fullDesc)}</div>
          <div class="st-goal-metrics">
            <div class="st-metric">
              <span class="st-metric-label">Baseline:</span>
              <span class="st-metric-value">${escapeHtml(goal.baseline || 'N/A')}</span>
            </div>
            <div class="st-metric">
              <span class="st-metric-label">Target:</span>
              <span class="st-metric-value">${escapeHtml(goal.target || 'N/A')}</span>
            </div>
          </div>
          
          <div class="st-data-entry-form">
            <h4 style="margin:0 0 12px 0; font-size:14px;">📊 Enter Progress Data</h4>
            
            ${measurementFields}
            
            <div class="st-form-group">
              <label class="st-form-label">Date</label>
              <input type="date" class="st-form-input" name="data_date" value="${todayISO}" required />
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Notes (optional)</label>
              <textarea class="st-form-textarea" name="data_notes" rows="2" placeholder="Any observations..."></textarea>
            </div>
            <div class="st-form-row" style="margin-top:12px;">
              <button class="st-btn st-btn-primary st-btn-small save-data-btn" data-goal-id="${goal.id}">Save Data</button>
              <button class="st-btn st-btn-secondary st-btn-small cancel-data-btn">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderGoalEditForm(goal) {
    const colorCategory = goalAreaToColorCategory(goal.goal_area);
    
    return `
      <div class="st-goal-card st-goal-edit-form" data-goal-id="${goal.id}" data-area="${colorCategory}">
        <div class="st-form-group">
          <label class="st-form-label">Goal Area</label>
          <select class="st-form-select" name="goal_area">
            ${GOAL_AREAS.map(area => `
              <option value="${escapeHtml(area)}" ${goal.goal_area === area ? 'selected' : ''}>
                ${escapeHtml(area)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Goal Code</label>
          <input type="text" class="st-form-input" name="goal_code" value="${escapeHtml(goal.code || '')}" />
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Description</label>
          <textarea class="st-form-textarea" name="goal_desc">${escapeHtml(goal.desc || goal.goal_text || '')}</textarea>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Measurement Type</label>
          <select class="st-form-select" name="measurement_type">
            <option value="Accuracy" ${goal.measurement_type === 'Accuracy' ? 'selected' : ''}>Accuracy</option>
            <option value="Frequency" ${goal.measurement_type === 'Frequency' ? 'selected' : ''}>Frequency</option>
            <option value="Duration" ${goal.measurement_type === 'Duration' ? 'selected' : ''}>Duration</option>
            <option value="Rate" ${goal.measurement_type === 'Rate' ? 'selected' : ''}>Rate</option>
            <option value="Other" ${goal.measurement_type === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">Baseline</label>
            <input type="text" class="st-form-input" name="baseline" value="${escapeHtml(goal.baseline || '')}" />
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Target</label>
            <input type="text" class="st-form-input" name="target" value="${escapeHtml(goal.target || '')}" />
          </div>
        </div>
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">Case Manager</label>
            <input type="text" class="st-form-input" name="case_manager" value="${escapeHtml(goal.case_manager || '')}" />
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Data Collector</label>
            <input type="text" class="st-form-input" name="data_collector" value="${escapeHtml(goal.data_collector || '')}" />
          </div>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Expected Data Points/Quarter</label>
          <input type="number" class="st-form-input" name="expected_data_points" min="1" max="20" value="${goal.expected_data_points || 3}" />
        </div>
        <div class="st-goal-actions">
          <button class="st-btn st-btn-primary save-goal-btn" data-goal-id="${goal.id}">Save</button>
          <button class="st-btn st-btn-secondary cancel-edit-btn">Cancel</button>
        </div>
      </div>
    `;
  }

  function renderStudentPassword(student) {
    return `
      <div class="st-detail-section">
        <div class="st-section-header">
          <h3>Password</h3>
          <button class="st-btn st-btn-secondary" id="reset-password-btn">🔑 Reset Password</button>
        </div>
      </div>
    `;
  }

  // Event handlers
  function setupEventHandlers() {
    // Search input
    const searchInput = document.getElementById('stSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        filterStudents();
        renderStudentList();
      });
    }

    // Class filter dropdown
    const classFilter = document.getElementById('stClassFilter');
    if (classFilter) {
      classFilter.addEventListener('change', (e) => {
        selectedClassFilter = e.target.value;
        filterStudents();
        renderStudentList();
      });
    }

    // Sort dropdown
    const sortSelect = document.getElementById('stSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        filterStudents();
        renderStudentList();
      });
    }

    // Show Archived checkbox
    const showArchivedCheckbox = document.getElementById('stShowArchived');
    if (showArchivedCheckbox) {
      showArchivedCheckbox.addEventListener('change', (e) => {
        showArchived = e.target.checked;
        filterStudents();
        renderStudentList();
      });
    }

    // Export button
    const exportBtn = document.getElementById('stExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportCaseload);
    }

    // Quarter date bar buttons
    const editQuartersBtn = document.getElementById('stEditQuarters');
    if (editQuartersBtn) {
      editQuartersBtn.addEventListener('click', () => {
        const displayEl = document.getElementById('stQuarterDisplay');
        const formEl = document.getElementById('stQuarterEditForm');
        if (displayEl && formEl) {
          displayEl.style.display = 'none';
          formEl.classList.add('active');
          renderQuarterEditForm();
        }
      });
    }

    // Table row clicks (for expanding/collapsing)
    const tableBody = document.getElementById('stStudentTableBody');
    if (tableBody) {
      tableBody.addEventListener('click', async (e) => {
        // Handle row click for expand/collapse
        const row = e.target.closest('tr:not(.st-expanded-row)');
        if (row && e.target.closest('.st-chevron-cell, .st-code-cell')) {
          const studentCode = row.dataset.code;
          if (expandedStudent === studentCode) {
            expandedStudent = null;
          } else {
            expandedStudent = studentCode;
            selectedDetailTab = 'goals';
            editingGoalId = null;
          }
          renderStudentList();
          return;
        }

        // Handle tab switching in expanded detail
        if (e.target.classList.contains('st-tab')) {
          selectedDetailTab = e.target.dataset.tab;
          if (expandedStudent) {
            renderExpandedDetail(expandedStudent);
          }
          return;
        }

        // Goal card collapsing - check if clicking on header but NOT on a button
        if (e.target.closest('.st-goal-header') && !e.target.closest('button')) {
          const card = e.target.closest('.st-goal-card');
          if (card && !card.classList.contains('st-goal-edit-form')) {
            card.classList.toggle('collapsed');
          }
          return;
        }

        // Description toggle
        if (e.target.classList.contains('st-desc-toggle')) {
          const desc = e.target.closest('.st-goal-description');
          const preview = desc.querySelector('.st-desc-preview');
          const full = desc.querySelector('.st-desc-full');
          const isShowing = full.style.display !== 'none';
          preview.style.display = isShowing ? '' : 'none';
          full.style.display = isShowing ? 'none' : '';
          e.target.textContent = isShowing ? 'Show more' : 'Show less';
          e.stopPropagation();
          return;
        }

        // Save student info button
        if (e.target.id === 'save-student-info-btn') {
          await handleSaveStudentInfo();
          return;
        }

        // Archive student
        if (e.target.id === 'archive-student-btn') {
          await handleArchiveStudent();
          return;
        }

        // Reactivate student
        if (e.target.id === 'reactivate-student-btn') {
          await handleReactivateStudent();
          return;
        }
        
        // Manage enrollments
        if (e.target.id === 'manage-enrollments-btn') {
          showManageEnrollmentsModal();
          return;
        } 
        
        // Add goal
        if (e.target.id === 'add-goal-btn') {
          showAddGoalModal();
          return;
        } 
        
        // Reset password
        if (e.target.id === 'reset-password-btn') {
          showResetPasswordModal();
          return;
        } 
        
        // Edit goal - inline editing
        if (e.target.classList.contains('edit-goal-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          editingGoalId = goalId;
          if (expandedStudent) {
            renderExpandedDetail(expandedStudent);
          }
          e.stopPropagation();
          return;
        } 
        
        // Cancel inline edit
        if (e.target.classList.contains('cancel-edit-btn')) {
          editingGoalId = null;
          if (expandedStudent) {
            renderExpandedDetail(expandedStudent);
          }
          e.stopPropagation();
          return;
        } 
        
        // Save inline edit
        if (e.target.classList.contains('save-goal-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          await handleSaveInlineEdit(goalId, e);
          e.stopPropagation();
          return;
        } 
        // Version goal
        if (e.target.classList.contains('version-goal-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          await handleVersionGoal(goalId);
          e.stopPropagation();
          return;
        } 
        // Archive goal
        if (e.target.classList.contains('archive-goal-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          await handleArchiveGoal(goalId);
          e.stopPropagation();
          return;
        } 
        // Copy token
        if (e.target.classList.contains('copy-token-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          await handleCopyDataEntryLink(goalId);
          e.stopPropagation();
          return;
        } 
        // Revoke token
        if (e.target.classList.contains('revoke-token-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          await handleRevokeDataEntryLink(goalId);
          e.stopPropagation();
          return;
        }
        
        // Enter Data button
        if (e.target.classList.contains('enter-data-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          enteringDataGoalId = goalId;
          if (expandedStudent) {
            renderExpandedDetail(expandedStudent);
            // After render, uncollapse the goal card
            setTimeout(() => {
              const card = document.querySelector(`[data-goal-id="${goalId}"]`);
              if (card) card.classList.remove('collapsed');
            }, 0);
          }
          e.stopPropagation();
          return;
        }

        // Save Data button
        if (e.target.classList.contains('save-data-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          await handleSaveProgressData(goalId, e);
          e.stopPropagation();
          return;
        }

        // Cancel Data button
        if (e.target.classList.contains('cancel-data-btn')) {
          enteringDataGoalId = null;
          if (expandedStudent) renderExpandedDetail(expandedStudent);
          e.stopPropagation();
          return;
        }
        
        // New IEP button
        if (e.target.id === 'new-iep-btn') {
          showNewIEPWizard(expandedStudent);
          return;
        }
      });

      // Change events in table (goal area filter)
      tableBody.addEventListener('change', (e) => {
        if (e.target.id === 'goal-area-filter') {
          selectedGoalAreaFilter = e.target.value;
          if (expandedStudent) {
            renderExpandedDetail(expandedStudent);
          }
        }
      });
    }

    // Quarter date form handling
    document.addEventListener('click', (e) => {
      if (e.target.id === 'stCancelQuarterEdit') {
        const displayEl = document.getElementById('stQuarterDisplay');
        const formEl = document.getElementById('stQuarterEditForm');
        if (displayEl && formEl) {
          displayEl.style.display = '';
          formEl.classList.remove('active');
        }
      } else if (e.target.id === 'stSaveQuarters') {
        const formEl = document.getElementById('stQuarterEditForm');
        if (formEl) {
          const dates = {
            q1: {
              start: formEl.querySelector('[name="q1-start"]').value,
              end: formEl.querySelector('[name="q1-end"]').value
            },
            q2: {
              start: formEl.querySelector('[name="q2-start"]').value,
              end: formEl.querySelector('[name="q2-end"]').value
            },
            q3: {
              start: formEl.querySelector('[name="q3-start"]').value,
              end: formEl.querySelector('[name="q3-end"]').value
            },
            q4: {
              start: formEl.querySelector('[name="q4-start"]').value,
              end: formEl.querySelector('[name="q4-end"]').value
            }
          };
          saveQuarterDates(dates);
          renderQuarterBar();
          const displayEl = document.getElementById('stQuarterDisplay');
          if (displayEl) {
            displayEl.style.display = '';
          }
          formEl.classList.remove('active');
          showToast('Quarter dates saved successfully');
        }
      }
    });

    const addStudentBtn = document.getElementById('stAddStudent');
    if (addStudentBtn) {
      addStudentBtn.addEventListener('click', showAddStudentWizard);
    }

    const importCsvBtn = document.getElementById('stImportCSV');
    if (importCsvBtn) {
      importCsvBtn.addEventListener('click', showImportCsvModal);
    }
  }

  async function handleSaveInlineEdit(goalId, e) {
    const form = e.target.closest('.st-goal-edit-form');
    if (!form) return;

    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) return;

    const formData = {
      id: goalId,
      student_code: goal.student_code,
      goal_area: form.querySelector('[name="goal_area"]').value,
      code: form.querySelector('[name="goal_code"]').value,
      desc: form.querySelector('[name="goal_desc"]').value,
      measurement_type: form.querySelector('[name="measurement_type"]').value,
      baseline: form.querySelector('[name="baseline"]').value,
      target: form.querySelector('[name="target"]').value,
      case_manager: form.querySelector('[name="case_manager"]').value,
      data_collector: form.querySelector('[name="data_collector"]').value,
      expected_data_points: parseInt(form.querySelector('[name="expected_data_points"]').value) || 3,
      class_context: goal.class_context,
      version: goal.version,
      status: goal.status
    };

    try {
      await db.upsertGoal(formData);
      console.log('[tc-students] Updated goal:', goalId);
      editingGoalId = null;
      await loadData();
      if (expandedStudent) {
        renderExpandedDetail(expandedStudent);
      }
    } catch (error) {
      console.error('[tc-students] Error updating goal:', error);
      alert('Failed to update goal');
    }
  }

  function selectStudent(code) {
    expandedStudent = code;
    selectedGoalAreaFilter = 'All';
    selectedDetailTab = 'goals';
    editingGoalId = null;
    renderStudentList();
  }

  async function handleArchiveStudent() {
    if (!expandedStudent) return;
    
    if (!confirm(`Archive student ${expandedStudent}? This will hide them from the active list.`)) {
      return;
    }

    try {
      await db.upsertStudent({ code: expandedStudent, status: 'archived', active: false });
      console.log('[tc-students] Archived student:', expandedStudent);
      await loadData();
      expandedStudent = null;
      renderStudentList();
    } catch (error) {
      console.error('[tc-students] Error archiving student:', error);
      alert('Failed to archive student');
    }
  }

  async function handleReactivateStudent() {
    if (!expandedStudent) return;
    
    if (!confirm(`Reactivate student ${expandedStudent}? They will reappear in the active list.`)) {
      return;
    }

    try {
      await db.upsertStudent({ code: expandedStudent, status: 'active', active: true });
      console.log('[tc-students] Reactivated student:', expandedStudent);
      await loadData();
      renderExpandedDetail(expandedStudent);
    } catch (error) {
      console.error('[tc-students] Error reactivating student:', error);
      alert('Failed to reactivate student');
    }
  }

  async function handleSaveStudentInfo() {
    if (!expandedStudent) return;

    const caseManager = document.getElementById('edit-case-manager')?.value;
    const iepDue = document.getElementById('edit-iep-due')?.value;
    const evalDue = document.getElementById('edit-eval-due')?.value;

    try {
      await db.upsertStudent({
        code: expandedStudent,
        primary_case_manager: caseManager,
        iep_due: iepDue || null,
        eval_due: evalDue || null
      });
      console.log('[tc-students] Updated student info:', expandedStudent);
      showToast('Student information saved successfully');
      await loadData();
      renderExpandedDetail(expandedStudent);
    } catch (error) {
      console.error('[tc-students] Error saving student info:', error);
      alert('Failed to save student information');
    }
  }

  async function handleArchiveGoal(goalId) {
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) return;

    if (!confirm(`Archive goal "${goal.code || goal.goal_code}"?`)) {
      return;
    }

    try {
      await db.upsertGoal({ id: goalId, status: 'archived' });
      console.log('[tc-students] Archived goal:', goalId);
      await loadData();
      if (expandedStudent) {
        renderExpandedDetail(expandedStudent);
      }
    } catch (error) {
      console.error('[tc-students] Error archiving goal:', error);
      alert('Failed to archive goal');
    }
  }

  async function handleVersionGoal(goalId) {
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) return;

    if (!confirm(`Create a new version of goal "${goal.code || goal.goal_code}"? The current goal will be archived.`)) {
      return;
    }

    try {
      await db.upsertGoal({ id: goalId, status: 'archived' });
      
      const newGoal = { ...goal };
      delete newGoal.id;
      newGoal.version = (goal.version || 1) + 1;
      newGoal.status = 'active';
      
      await db.upsertGoal(newGoal);
      console.log('[tc-students] Created new version of goal');
      await loadData();
      if (expandedStudent) {
        renderExpandedDetail(expandedStudent);
      }
    } catch (error) {
      console.error('[tc-students] Error versioning goal:', error);
      alert('Failed to create new version');
    }
  }

  async function handleSaveProgressData(goalId, e) {
    const card = e.target.closest('[data-goal-id]');
    if (!card) return;

    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) return;

    // Collect form values
    const dataDate = card.querySelector('[name="data_date"]').value;
    const dataNotes = card.querySelector('[name="data_notes"]').value;
    
    // Calculate value based on measurement type
    let calculatedValue = 0;
    let notes = dataNotes;
    
    try {
      if (goal.measurement_type === 'Accuracy') {
        const correct = parseFloat(card.querySelector('[name="correct"]').value);
        const total = parseFloat(card.querySelector('[name="total"]').value);
        if (isNaN(correct) || isNaN(total) || total === 0) {
          alert('Please enter valid correct and total values');
          return;
        }
        calculatedValue = (correct / total) * 100;
        notes = `${correct}/${total} = ${calculatedValue.toFixed(1)}%${notes ? '. ' + notes : ''}`;
      } else if (goal.measurement_type === 'Frequency') {
        const count = parseFloat(card.querySelector('[name="count"]').value);
        const timePeriod = card.querySelector('[name="time_period"]').value;
        if (isNaN(count)) {
          alert('Please enter a valid count');
          return;
        }
        calculatedValue = count;
        notes = `${count} (${timePeriod})${notes ? '. ' + notes : ''}`;
      } else if (goal.measurement_type === 'Duration') {
        const minutes = parseFloat(card.querySelector('[name="minutes"]').value) || 0;
        const seconds = parseFloat(card.querySelector('[name="seconds"]').value) || 0;
        calculatedValue = minutes + (seconds / 60);
        notes = `${minutes}m ${seconds}s${notes ? '. ' + notes : ''}`;
      } else if (goal.measurement_type === 'Rate') {
        const count = parseFloat(card.querySelector('[name="count"]').value);
        const minutes = parseFloat(card.querySelector('[name="minutes"]').value);
        if (isNaN(count) || isNaN(minutes) || minutes === 0) {
          alert('Please enter valid count and minutes values');
          return;
        }
        calculatedValue = count / minutes;
        notes = `${count} per ${minutes} minutes${notes ? '. ' + notes : ''}`;
      } else {
        const value = parseFloat(card.querySelector('[name="value"]').value);
        if (isNaN(value)) {
          alert('Please enter a valid value');
          return;
        }
        calculatedValue = value;
      }

      // Save to goal_progress table or localStorage
      const supabase = await getSupabase();
      if (supabase) {
        // Try to save to Supabase
        try {
          const { error } = await supabase.from('goal_progress').insert({
            student_code: goal.student_code,
            goal_code: goal.code,
            value: calculatedValue,
            date: dataDate,
            notes: notes,
            measurement_type: goal.measurement_type,
            collected_by: 'teacher'
          });
          if (error) throw error;
        } catch (err) {
          console.warn('[tc-students] Could not save to goal_progress, falling back to localStorage:', err);
          // Fall back to localStorage
          const KEY = 'rc_goal_progress_v1';
          const existing = JSON.parse(localStorage.getItem(KEY) || '[]');
          existing.push({
            student_code: goal.student_code,
            goal_code: goal.code,
            value: calculatedValue,
            date: dataDate,
            notes: notes,
            measurement_type: goal.measurement_type,
            collected_by: 'teacher',
            created_at: new Date().toISOString()
          });
          localStorage.setItem(KEY, JSON.stringify(existing));
        }
      } else {
        // No Supabase, use localStorage
        const KEY = 'rc_goal_progress_v1';
        const existing = JSON.parse(localStorage.getItem(KEY) || '[]');
        existing.push({
          student_code: goal.student_code,
          goal_code: goal.code,
          value: calculatedValue,
          date: dataDate,
          notes: notes,
          measurement_type: goal.measurement_type,
          collected_by: 'teacher',
          created_at: new Date().toISOString()
        });
        localStorage.setItem(KEY, JSON.stringify(existing));
      }

      // Show success message
      showToast(`Data saved for ${goal.code}`);
      
      // Reset state
      enteringDataGoalId = null;
      
      // Reload data and keep student expanded
      await loadData();
      if (expandedStudent) {
        renderExpandedDetail(expandedStudent);
      }
    } catch (error) {
      console.error('[tc-students] Error saving progress data:', error);
      alert('Failed to save progress data');
    }
  }

  // Modals
  function showManageEnrollmentsModal() {
    const student = allStudents.find(s => s.code === expandedStudent);
    if (!student) return;

    const enrollments = allEnrollments.filter(e => e.student_code === student.code);
    
    const checkboxes = FULL_CLASS_NAMES.map(className => {
      const isEnrolled = enrollments.some(e => e.class_name === className);
      return `
        <label class="st-checkbox-label">
          <input type="checkbox" name="enrollment" value="${escapeHtml(className)}" ${isEnrolled ? 'checked' : ''}>
          ${escapeHtml(className)}
        </label>
      `;
    }).join('');

    const modal = createModal('Manage Enrollments', `
      <form id="enrollments-form">
        <div class="st-form-group">
          <label class="st-form-label">Select Classes:</label>
          <div class="st-checkbox-group">
            ${checkboxes}
          </div>
        </div>
        <div class="st-modal-footer">
          <button type="button" class="st-btn st-btn-secondary" id="cancel-enrollments">Cancel</button>
          <button type="submit" class="st-btn st-btn-primary">Save</button>
        </div>
      </form>
    `);

    document.body.appendChild(modal);

    document.getElementById('cancel-enrollments').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('enrollments-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveEnrollments(student.code);
      modal.remove();
    });
  }

  async function handleSaveEnrollments(studentCode) {
    const form = document.getElementById('enrollments-form');
    const checkboxes = form.querySelectorAll('input[name="enrollment"]');
    const selected = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    try {
      const currentEnrollments = allEnrollments.filter(e => e.student_code === studentCode);
      
      for (const enrollment of currentEnrollments) {
        if (!selected.includes(enrollment.class_name)) {
          const supabase = await getSupabase();
          if (!supabase) continue;
          const { error } = await supabase
            .from('enrollments')
            .delete()
            .eq('student_code', studentCode)
            .eq('class_name', enrollment.class_name);
          
          if (error) throw error;
        }
      }

      for (const className of selected) {
        const exists = currentEnrollments.some(e => e.class_name === className);
        if (!exists) {
          const supabase = await getSupabase();
          if (!supabase) continue;
          const { error } = await supabase
            .from('enrollments')
            .insert({ student_code: studentCode, class_name: className });
          
          if (error) throw error;
        }
      }

      console.log('[tc-students] Updated enrollments');
      await loadData();
      if (expandedStudent) {
        renderExpandedDetail(expandedStudent);
      }
    } catch (error) {
      console.error('[tc-students] Error saving enrollments:', error);
      alert('Failed to save enrollments');
    }
  }

  function showAddGoalModal() {
    const student = allStudents.find(s => s.code === expandedStudent);
    if (!student) return;

    const modal = createModal('Add IEP Goal', `
      <form id="add-goal-form">
        <div class="st-form-group">
          <label class="st-form-label">Goal Area:</label>
          <select name="goal_area" class="st-form-select" required>
            <option value="">Select...</option>
            ${GOAL_AREAS.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('')}
          </select>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Goal Code:</label>
          <input type="text" name="goal_code" class="st-form-input" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Description:</label>
          <textarea name="goal_text" class="st-form-textarea" rows="4" required></textarea>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Measurement Type:</label>
          <select name="measurement_type" class="st-form-select" required>
            <option value="">Select...</option>
            <option value="Accuracy">Accuracy</option>
            <option value="Frequency">Frequency</option>
            <option value="Duration">Duration</option>
            <option value="Rate">Rate</option>
          </select>
        </div>
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">Baseline:</label>
            <input type="text" name="baseline" class="st-form-input" required>
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Target:</label>
            <input type="text" name="target" class="st-form-input" required>
          </div>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Case Manager:</label>
          <input type="text" name="case_manager" class="st-form-input" value="${escapeHtml(student.primary_case_manager || '')}" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Data Collector:</label>
          <input type="text" name="data_collector" class="st-form-input" value="Dan Reinisch" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Data Collector Email:</label>
          <input type="email" name="data_collector_email" class="st-form-input">
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Class Context:</label>
          <select name="class_context" class="st-form-select">
            <option value="">Select...</option>
            ${FULL_CLASS_NAMES.map(cn => `<option value="${escapeHtml(cn)}">${escapeHtml(cn)}</option>`).join('')}
          </select>
        </div>
        <div class="st-modal-footer">
          <button type="button" class="st-btn st-btn-secondary" id="cancel-goal">Cancel</button>
          <button type="submit" class="st-btn st-btn-primary">Add Goal</button>
        </div>
      </form>
    `);

    document.body.appendChild(modal);

    document.getElementById('cancel-goal').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('add-goal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleAddGoal(e.target);
      modal.remove();
    });
  }

  async function handleAddGoal(form) {
    const formData = new FormData(form);
    const goal = {
      student_code: expandedStudent,
      goal_area: formData.get('goal_area'),
      code: formData.get('goal_code'), // Form field is 'goal_code' but DB field is 'code'
      goal_text: formData.get('goal_text'),
      measurement_type: formData.get('measurement_type'),
      baseline: formData.get('baseline'),
      target: formData.get('target'),
      case_manager: formData.get('case_manager'),
      data_collector: formData.get('data_collector'),
      data_collector_email: formData.get('data_collector_email') || null,
      class_context: formData.get('class_context') || null,
      status: 'active',
      version: 1
    };

    try {
      await db.upsertGoal(goal);
      console.log('[tc-students] Added goal');
      await loadData();
      if (expandedStudent) {
        renderExpandedDetail(expandedStudent);
      }
    } catch (error) {
      console.error('[tc-students] Error adding goal:', error);
      alert('Failed to add goal');
    }
  }

  function showEditGoalModal(goalId) {
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) return;

    const modal = createModal('Edit IEP Goal', `
      <form id="edit-goal-form">
        <div class="st-form-group">
          <label class="st-form-label">Goal Area:</label>
          <select name="goal_area" class="st-form-select" required>
            ${GOAL_AREAS.map(area => `
              <option value="${escapeHtml(area)}" ${goal.goal_area === area ? 'selected' : ''}>
                ${escapeHtml(area)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Goal Code:</label>
          <input type="text" name="goal_code" class="st-form-input" value="${escapeHtml(goal.code || '')}" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Description:</label>
          <textarea name="goal_text" class="st-form-textarea" rows="4" required>${escapeHtml(goal.goal_text || '')}</textarea>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Measurement Type:</label>
          <select name="measurement_type" class="st-form-select" required>
            <option value="Accuracy" ${goal.measurement_type === 'Accuracy' ? 'selected' : ''}>Accuracy</option>
            <option value="Frequency" ${goal.measurement_type === 'Frequency' ? 'selected' : ''}>Frequency</option>
            <option value="Duration" ${goal.measurement_type === 'Duration' ? 'selected' : ''}>Duration</option>
            <option value="Rate" ${goal.measurement_type === 'Rate' ? 'selected' : ''}>Rate</option>
          </select>
        </div>
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">Baseline:</label>
            <input type="text" name="baseline" class="st-form-input" value="${escapeHtml(goal.baseline || '')}" required>
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Target:</label>
            <input type="text" name="target" class="st-form-input" value="${escapeHtml(goal.target || '')}" required>
          </div>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Case Manager:</label>
          <input type="text" name="case_manager" class="st-form-input" value="${escapeHtml(goal.case_manager || '')}" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Data Collector:</label>
          <input type="text" name="data_collector" class="st-form-input" value="${escapeHtml(goal.data_collector || '')}" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Data Collector Email:</label>
          <input type="email" name="data_collector_email" class="st-form-input" value="${escapeHtml(goal.data_collector_email || '')}">
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Class Context:</label>
          <select name="class_context" class="st-form-select">
            <option value="">None</option>
            ${FULL_CLASS_NAMES.map(cn => `
              <option value="${escapeHtml(cn)}" ${goal.class_context === cn ? 'selected' : ''}>
                ${escapeHtml(cn)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="st-modal-footer">
          <button type="button" class="st-btn st-btn-secondary" id="cancel-edit-goal">Cancel</button>
          <button type="submit" class="st-btn st-btn-primary">Save Changes</button>
        </div>
      </form>
    `);

    document.body.appendChild(modal);

    document.getElementById('cancel-edit-goal').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('edit-goal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleEditGoal(goalId, e.target);
      modal.remove();
    });
  }

  async function handleEditGoal(goalId, form) {
    const formData = new FormData(form);
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) {
      console.error('[tc-students] Goal not found:', goalId);
      alert('Goal not found');
      return;
    }
    
    const updates = {
      id: goalId,
      student_code: goal.student_code,
      goal_area: formData.get('goal_area'),
      code: formData.get('goal_code'), // Form field is 'goal_code' but DB field is 'code'
      goal_text: formData.get('goal_text'),
      measurement_type: formData.get('measurement_type'),
      baseline: formData.get('baseline'),
      target: formData.get('target'),
      case_manager: formData.get('case_manager'),
      data_collector: formData.get('data_collector'),
      data_collector_email: formData.get('data_collector_email') || null,
      class_context: formData.get('class_context') || null
    };

    try {
      await db.upsertGoal(updates);
      console.log('[tc-students] Updated goal');
      await loadData();
      if (expandedStudent) {
        renderExpandedDetail(expandedStudent);
      }
    } catch (error) {
      console.error('[tc-students] Error updating goal:', error);
      alert('Failed to update goal');
    }
  }

  function showResetPasswordModal() {
    const student = allStudents.find(s => s.code === expandedStudent);
    if (!student) return;

    const modal = createModal('Reset Password', `
      <form id="reset-password-form">
        <div class="st-form-group">
          <label class="st-form-label">New Password for ${escapeHtml(student.code)}:</label>
          <input type="text" name="password" class="st-form-input" required>
        </div>
        <div class="st-modal-footer">
          <button type="button" class="st-btn st-btn-secondary" id="cancel-password">Cancel</button>
          <button type="submit" class="st-btn st-btn-primary">Reset Password</button>
        </div>
      </form>
    `);

    document.body.appendChild(modal);

    document.getElementById('cancel-password').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleResetPassword(e.target);
      modal.remove();
    });
  }

  async function handleResetPassword(form) {
    const formData = new FormData(form);
    const password = formData.get('password');

    try {
      await db.upsertStudent({ code: expandedStudent, password_hash: password });
      console.log('[tc-students] Reset password');
      alert('Password reset successfully');
    } catch (error) {
      console.error('[tc-students] Error resetting password:', error);
      alert('Failed to reset password');
    }
  }

  function showAddStudentWizard() {
    let step = 1;
    let studentData = {};

    function renderStep() {
      let content = '';
      
      if (step === 1) {
        content = `
          <form id="wizard-step-1">
            <div class="form-group">
              <label>Student Code:</label>
              <input type="text" name="code" value="${escapeHtml(studentData.code || '')}" required>
            </div>
            <div class="form-group">
              <label>Password:</label>
              <input type="text" name="password" value="${escapeHtml(studentData.password || '')}" required>
            </div>
            <div class="form-group">
              <label>Primary Case Manager:</label>
              <input type="text" name="primary_case_manager" value="${escapeHtml(studentData.primary_case_manager || '')}">
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="wizard-cancel">Cancel</button>
              <button type="submit" class="btn btn-primary">Next</button>
            </div>
          </form>
        `;
      } else if (step === 2) {
        const checkboxes = FULL_CLASS_NAMES.map(className => `
          <label class="checkbox-label">
            <input type="checkbox" name="enrollment" value="${escapeHtml(className)}"
              ${studentData.enrollments && studentData.enrollments.includes(className) ? 'checked' : ''}>
            ${escapeHtml(className)}
          </label>
        `).join('');

        content = `
          <form id="wizard-step-2">
            <div class="form-group">
              <label>Select Classes:</label>
              <div class="checkbox-group">
                ${checkboxes}
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="wizard-back">Back</button>
              <button type="submit" class="btn btn-primary">Next</button>
            </div>
          </form>
        `;
      } else if (step === 3) {
        content = `
          <form id="wizard-step-3">
            <p>Student will be created with ${studentData.enrollments ? studentData.enrollments.length : 0} class enrollments.</p>
            <p>You can add goals after creating the student.</p>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="wizard-back">Back</button>
              <button type="submit" class="btn btn-primary">Create Student</button>
            </div>
          </form>
        `;
      }

      modal.querySelector('.modal-content').innerHTML = `
        <h2>Add Student - Step ${step} of 3</h2>
        ${content}
      `;

      const cancelBtn = document.getElementById('wizard-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.remove());
      }

      const backBtn = document.getElementById('wizard-back');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          step--;
          renderStep();
        });
      }

      const form = modal.querySelector('form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          if (step === 1) {
            const formData = new FormData(form);
            studentData.code = formData.get('code');
            studentData.password = formData.get('password');
            studentData.primary_case_manager = formData.get('primary_case_manager');
            step++;
            renderStep();
          } else if (step === 2) {
            const checkboxes = form.querySelectorAll('input[name="enrollment"]');
            studentData.enrollments = Array.from(checkboxes)
              .filter(cb => cb.checked)
              .map(cb => cb.value);
            step++;
            renderStep();
          } else if (step === 3) {
            await handleCreateStudent(studentData);
            modal.remove();
          }
        });
      }
    }

    const modal = createModal('Add Student', '');
    document.body.appendChild(modal);
    renderStep();
  }

  async function handleCreateStudent(data) {
    try {
      await db.upsertStudent({
        code: data.code,
        password_hash: data.password,
        primary_case_manager: data.primary_case_manager,
        status: 'active'
      });

      for (const className of data.enrollments || []) {
        const supabase = await getSupabase();
        if (!supabase) continue;
        await supabase
          .from('enrollments')
          .insert({ student_code: data.code, class_name: className });
      }

      console.log('[tc-students] Created student:', data.code);
      await loadData();
      selectStudent(data.code);
    } catch (error) {
      console.error('[tc-students] Error creating student:', error);
      alert('Failed to create student');
    }
  }

  function showNewIEPWizard(studentCode) {
    const student = allStudents.find(s => s.code === studentCode);
    if (!student) return;

    // Initialize wizard data
    if (!iepWizardData || iepWizardData.studentCode !== studentCode) {
      iepWizardData = {
        step: 1,
        studentCode: studentCode,
        goalsToArchive: new Set(),
        newGoals: [],
        iepDue: student.iep_due || '',
        evalDue: student.eval_due || ''
      };
    }

    function renderWizard() {
      let content = '';
      let title = `New IEP for ${studentCode}`;

      if (iepWizardData.step === 1) {
        // Step 1: Review Current Goals + Update Dates
        const studentGoals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
        
        const goalCheckboxes = studentGoals.map(goal => {
          const progressCount = getProgressForGoal(studentCode, goal.code).length;
          const isChecked = iepWizardData.goalsToArchive.has(goal.id);
          return `
            <label class="st-checkbox-label">
              <input type="checkbox" class="archive-goal-cb" data-goal-id="${goal.id}" ${isChecked ? 'checked' : ''}>
              ${escapeHtml(goal.code)} — ${escapeHtml(goal.goal_area)} (${escapeHtml(goal.measurement_type)}) — ${progressCount} data points
            </label>
          `;
        }).join('');

        content = `
          <div class="st-wizard-step-indicator">
            <span class="active">Step 1/3</span>
          </div>
          <form id="wizard-step-1-form">
            <div class="st-form-group">
              <label class="st-form-label">IEP Due Date:</label>
              <input type="date" class="st-form-input" name="iep_due" value="${iepWizardData.iepDue}" required>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Eval Due Date:</label>
              <input type="date" class="st-form-input" name="eval_due" value="${iepWizardData.evalDue}">
            </div>
            
            <div class="st-form-group">
              <label class="st-form-label">Select which current goals to ARCHIVE:</label>
              <div class="st-checkbox-group">
                ${goalCheckboxes || '<p>No active goals found.</p>'}
              </div>
            </div>
            
            ${iepWizardData.goalsToArchive.size > 0 ? `
              <p style="font-size:13px;opacity:0.8;margin-top:8px;">
                ${iepWizardData.goalsToArchive.size} goal(s) will be archived with their progress data
              </p>
            ` : ''}
            
            <div class="st-modal-footer">
              <button type="button" class="st-btn st-btn-secondary" id="wizard-cancel">Cancel</button>
              <button type="submit" class="st-btn st-btn-primary">Next →</button>
            </div>
          </form>
        `;
      } else if (iepWizardData.step === 2) {
        // Step 2: Add New Goals
        content = `
          <div class="st-wizard-step-indicator">
            <span>Step 1/3</span>
            <span class="active">Step 2/3</span>
          </div>
          
          <div class="st-form-group">
            <button type="button" class="st-btn st-btn-primary" id="add-wizard-goal-btn">+ Add Goal</button>
          </div>
          
          <div id="wizard-goals-container">
            ${renderWizardGoals()}
          </div>
          
          <div class="st-modal-footer">
            <button type="button" class="st-btn st-btn-secondary" id="wizard-back">← Back</button>
            <button type="button" class="st-btn st-btn-secondary" id="wizard-cancel">Cancel</button>
            <button type="button" class="st-btn st-btn-primary" id="wizard-next">Next →</button>
          </div>
        `;
      } else if (iepWizardData.step === 3) {
        // Step 3: Review & Confirm
        const studentGoals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
        const goalsToArchive = studentGoals.filter(g => iepWizardData.goalsToArchive.has(g.id));
        const goalsToKeep = studentGoals.filter(g => !iepWizardData.goalsToArchive.has(g.id));
        const newGoalCodes = iepWizardData.newGoals.map(g => g.code);
        const goalsToReplace = goalsToKeep.filter(g => newGoalCodes.includes(g.code));
        
        content = `
          <div class="st-wizard-step-indicator">
            <span>Step 1/3</span>
            <span>Step 2/3</span>
            <span class="active">Step 3/3</span>
          </div>
          
          <h3 style="font-size:16px;margin:16px 0 8px 0;">DATE CHANGES:</h3>
          <div style="font-size:14px;margin-bottom:16px;">
            <div>IEP Due: ${student.iep_due ? formatDate(student.iep_due) : 'Not set'} → ${formatDate(iepWizardData.iepDue)}</div>
            <div>Eval Due: ${student.eval_due ? formatDate(student.eval_due) : 'Not set'} → ${iepWizardData.evalDue ? formatDate(iepWizardData.evalDue) : 'Not set'}</div>
          </div>
          
          ${goalsToArchive.length > 0 ? `
            <h3 style="font-size:16px;margin:16px 0 8px 0;">ARCHIVING (${goalsToArchive.length} goals):</h3>
            <ul style="font-size:14px;margin-bottom:16px;">
              ${goalsToArchive.map(g => `<li>${escapeHtml(g.code)} — ${escapeHtml(g.goal_area)} (${getProgressForGoal(studentCode, g.code).length} data points preserved)</li>`).join('')}
            </ul>
          ` : ''}
          
          ${goalsToKeep.length > 0 && goalsToReplace.length === 0 ? `
            <h3 style="font-size:16px;margin:16px 0 8px 0;">KEEPING (${goalsToKeep.length} goals):</h3>
            <ul style="font-size:14px;margin-bottom:16px;">
              ${goalsToKeep.map(g => `<li>${escapeHtml(g.code)} — ${escapeHtml(g.goal_area)}</li>`).join('')}
            </ul>
          ` : ''}
          
          ${iepWizardData.newGoals.length > 0 ? `
            <h3 style="font-size:16px;margin:16px 0 8px 0;">ADDING (${iepWizardData.newGoals.length} new goals):</h3>
            <ul style="font-size:14px;margin-bottom:16px;">
              ${iepWizardData.newGoals.map(g => `<li>${escapeHtml(g.code)} — ${escapeHtml(g.goal_area)} (${escapeHtml(g.measurement_type)})</li>`).join('')}
            </ul>
          ` : ''}
          
          ${goalsToReplace.length > 0 ? `
            <h3 style="font-size:16px;margin:16px 0 8px 0;">REPLACING (auto-archived):</h3>
            <ul style="font-size:14px;margin-bottom:16px;">
              ${goalsToReplace.map(g => `<li>${escapeHtml(g.code)} will be archived (replaced by new goal with same code)</li>`).join('')}
            </ul>
          ` : ''}
          
          <div class="st-modal-footer">
            <button type="button" class="st-btn st-btn-secondary" id="wizard-back">← Back</button>
            <button type="button" class="st-btn st-btn-secondary" id="wizard-cancel">Cancel</button>
            <button type="button" class="st-btn st-btn-primary" id="wizard-confirm">Confirm ✓</button>
          </div>
        `;
      }

      return { title, content };
    }

    function renderWizardGoals() {
      if (iepWizardData.newGoals.length === 0) {
        return '<p style="font-size:14px;opacity:0.7;">No goals added yet. Click "+ Add Goal" to add a new goal.</p>';
      }
      
      return iepWizardData.newGoals.map((goal, index) => {
        const validation = validateGoalCode(studentCode, goal.code);
        return `
          <div class="st-wizard-goal-form" data-goal-index="${index}">
            <h4 style="font-size:14px;margin:0 0 12px 0;">Goal ${index + 1}</h4>
            <div class="st-form-group">
              <label class="st-form-label">Goal Code</label>
              <input type="text" class="st-form-input wizard-goal-code" data-index="${index}" value="${escapeHtml(goal.code)}" placeholder="e.g., S004.12.1" required>
              ${validation ? `<div class="st-goal-code-validation ${validation.status}">${validation.message}</div>` : ''}
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Goal Area</label>
              <select class="st-form-select wizard-field" data-index="${index}" data-field="goal_area">
                ${GOAL_AREAS.map(area => `<option value="${escapeHtml(area)}" ${goal.goal_area === area ? 'selected' : ''}>${escapeHtml(area)}</option>`).join('')}
              </select>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Description</label>
              <textarea class="st-form-textarea wizard-field" data-index="${index}" data-field="desc" rows="2" required>${escapeHtml(goal.desc || '')}</textarea>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Measurement</label>
              <select class="st-form-select wizard-field" data-index="${index}" data-field="measurement_type">
                <option value="Accuracy" ${goal.measurement_type === 'Accuracy' ? 'selected' : ''}>Accuracy</option>
                <option value="Frequency" ${goal.measurement_type === 'Frequency' ? 'selected' : ''}>Frequency</option>
                <option value="Duration" ${goal.measurement_type === 'Duration' ? 'selected' : ''}>Duration</option>
                <option value="Rate" ${goal.measurement_type === 'Rate' ? 'selected' : ''}>Rate</option>
              </select>
            </div>
            <div class="st-form-row">
              <div class="st-form-group">
                <label class="st-form-label">Baseline</label>
                <input type="text" class="st-form-input wizard-field" data-index="${index}" data-field="baseline" value="${escapeHtml(goal.baseline || '')}" required>
              </div>
              <div class="st-form-group">
                <label class="st-form-label">Target</label>
                <input type="text" class="st-form-input wizard-field" data-index="${index}" data-field="target" value="${escapeHtml(goal.target || '')}" required>
              </div>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Case Manager</label>
              <input type="text" class="st-form-input wizard-field" data-index="${index}" data-field="case_manager" value="${escapeHtml(goal.case_manager || '')}" required>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Data Collector</label>
              <input type="text" class="st-form-input wizard-field" data-index="${index}" data-field="data_collector" value="${escapeHtml(goal.data_collector || '')}" required>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Collector Email (if outside provider)</label>
              <input type="email" class="st-form-input wizard-field" data-index="${index}" data-field="data_collector_email" value="${escapeHtml(goal.data_collector_email || '')}">
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Class Context</label>
              <select class="st-form-select wizard-field" data-index="${index}" data-field="class_context">
                <option value="">None</option>
                ${FULL_CLASS_NAMES.map(cn => `<option value="${escapeHtml(cn)}" ${goal.class_context === cn ? 'selected' : ''}>${escapeHtml(cn)}</option>`).join('')}
              </select>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Expected Data Points/Quarter</label>
              <input type="number" class="st-form-input wizard-field" data-index="${index}" data-field="expected_data_points" min="1" max="20" value="${goal.expected_data_points || 3}">
            </div>
            <button type="button" class="st-btn st-btn-danger st-btn-small remove-wizard-goal-btn" data-index="${index}">Remove Goal</button>
          </div>
        `;
      }).join('');
    }

    function validateGoalCode(studentCode, goalCode) {
      if (!goalCode) return null;
      
      const existing = allGoals.filter(g => g.student_code === studentCode && g.code === goalCode);
      const activeMatch = existing.find(g => g.status !== 'archived');
      const archivedMatch = existing.find(g => g.status === 'archived');
      
      if (activeMatch) return { status: 'replace', message: '⚠️ This code is active. It will be archived and replaced.' };
      if (archivedMatch) return { status: 'reuse', message: 'ℹ️ This code was previously used (archived). OK to reuse.' };
      return { status: 'new', message: '✅ New goal code' };
    }

    const { title, content } = renderWizard();
    const modal = createModal(title, content);
    document.body.appendChild(modal);

    // Event handlers
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'wizard-cancel') {
        iepWizardData = null;
        modal.remove();
      } else if (e.target.id === 'wizard-back') {
        iepWizardData.step--;
        modal.remove();
        showNewIEPWizard(studentCode);
      } else if (e.target.id === 'wizard-next') {
        if (iepWizardData.step === 2) {
          iepWizardData.step++;
          modal.remove();
          showNewIEPWizard(studentCode);
        }
      } else if (e.target.id === 'wizard-confirm') {
        handleConfirmIEPWizard();
        modal.remove();
      } else if (e.target.id === 'add-wizard-goal-btn') {
        iepWizardData.newGoals.push({
          code: '',
          goal_area: 'Reading Comprehension',
          desc: '',
          measurement_type: 'Accuracy',
          baseline: '',
          target: '',
          case_manager: student.primary_case_manager || '',
          data_collector: 'Dan Reinisch',
          data_collector_email: '',
          class_context: '',
          expected_data_points: 3
        });
        modal.remove();
        showNewIEPWizard(studentCode);
      } else if (e.target.classList.contains('remove-wizard-goal-btn')) {
        const index = parseInt(e.target.dataset.index);
        iepWizardData.newGoals.splice(index, 1);
        modal.remove();
        showNewIEPWizard(studentCode);
      }
    });

    // Handle form submission for step 1
    const step1Form = modal.querySelector('#wizard-step-1-form');
    if (step1Form) {
      step1Form.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(step1Form);
        iepWizardData.iepDue = formData.get('iep_due');
        iepWizardData.evalDue = formData.get('eval_due');
        iepWizardData.step = 2;
        modal.remove();
        showNewIEPWizard(studentCode);
      });
    }

    // Handle checkbox changes for goals to archive
    modal.addEventListener('change', (e) => {
      if (e.target.classList.contains('archive-goal-cb')) {
        const goalId = parseInt(e.target.dataset.goalId);
        if (e.target.checked) {
          iepWizardData.goalsToArchive.add(goalId);
        } else {
          iepWizardData.goalsToArchive.delete(goalId);
        }
      }
    });

    // Handle wizard field changes
    modal.addEventListener('input', (e) => {
      if (e.target.classList.contains('wizard-field')) {
        const index = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        iepWizardData.newGoals[index][field] = e.target.value;
      } else if (e.target.classList.contains('wizard-goal-code')) {
        const index = parseInt(e.target.dataset.index);
        iepWizardData.newGoals[index].code = e.target.value;
      }
    });

    // Handle goal code validation on blur
    modal.addEventListener('blur', (e) => {
      if (e.target.classList.contains('wizard-goal-code')) {
        // Re-render to show validation
        modal.remove();
        showNewIEPWizard(studentCode);
      }
    }, true);
  }

  async function handleConfirmIEPWizard() {
    if (!iepWizardData) return;

    const { studentCode, goalsToArchive, newGoals, iepDue, evalDue } = iepWizardData;
    
    try {
      // 1. Update student's IEP and eval dates
      await db.upsertStudent({
        code: studentCode,
        iep_due: iepDue,
        eval_due: evalDue || null
      });

      // 2. Archive selected goals
      for (const goalId of goalsToArchive) {
        await db.upsertGoal({ id: goalId, status: 'archived' });
      }

      // 3. For new goals whose code matches an existing active goal: archive the existing one first
      const studentGoals = allGoals.filter(g => g.student_code === studentCode && g.status === 'active');
      for (const newGoal of newGoals) {
        const existingGoal = studentGoals.find(g => g.code === newGoal.code);
        if (existingGoal) {
          await db.upsertGoal({ id: existingGoal.id, status: 'archived' });
        }
      }

      // 4. Create all new goals
      for (const newGoal of newGoals) {
        await db.upsertGoal({
          student_code: studentCode,
          ...newGoal,
          status: 'active',
          version: 1
        });
      }

      // 5. Reload data
      await loadData();
      
      // 6. Show success message
      showToast('New IEP created successfully');
      
      // 7. Keep student expanded
      if (expandedStudent === studentCode) {
        renderExpandedDetail(studentCode);
      }
      
      // Reset wizard data
      iepWizardData = null;
    } catch (error) {
      console.error('[tc-students] Error creating new IEP:', error);
      alert('Failed to create new IEP');
    }
  }

  function showImportCsvModal() {
    const modal = createModal('Import Students from CSV', `
      <div id="csv-import-container">
        <div class="form-group">
          <label>Select CSV File:</label>
          <input type="file" id="csv-file-input" accept=".csv">
        </div>
        <div id="csv-preview" style="display: none;">
          <h3>Preview</h3>
          <div id="csv-preview-content"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="cancel-import">Cancel</button>
            <button type="button" class="btn btn-primary" id="confirm-import">Import</button>
          </div>
        </div>
      </div>
    `);

    document.body.appendChild(modal);

    const fileInput = document.getElementById('csv-file-input');
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await handleCsvFileSelected(file);
      }
    });

    const cancelBtn = document.getElementById('cancel-import');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => modal.remove());
    }
  }

  async function handleCsvFileSelected(file) {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      alert('CSV file must have at least a header row and one data row');
      return;
    }

    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(line => parseCSVLine(line));

    const columnMap = {};
    headers.forEach((header, index) => {
      const normalized = header.trim().toLowerCase();
      if (normalized.includes('student code name')) columnMap.code = index;
      else if (normalized.includes('iep goal with student code')) columnMap.goal_text = index;
      else if (normalized.includes('student code iep goal code')) columnMap.goal_code = index;
      else if (normalized === 'measurement type') columnMap.measurement_type = index;
      else if (normalized === 'class') columnMap.class = index;
      else if (normalized === 'goal area') columnMap.goal_area = index;
      else if (normalized === 'case manager') columnMap.case_manager = index;
      else if (normalized.includes('teacher to collect data') && !normalized.includes('email')) columnMap.data_collector = index;
      else if (normalized.includes('teacher to collect data email')) columnMap.data_collector_email = index;
      else if (normalized.includes('iep due')) columnMap.iep_due = index;
      else if (normalized.includes('eval due')) columnMap.eval_due = index;
    });

    const studentsMap = new Map();
    const existingCodes = new Set(allStudents.map(s => s.code));
    let newStudentCount = 0;
    let existingStudentCount = 0;

    for (const row of rows) {
      const code = row[columnMap.code]?.trim();
      if (!code) continue;

      // Track if this is a new or existing student
      if (existingCodes.has(code)) {
        existingStudentCount++;
      } else {
        newStudentCount++;
      }

      if (!studentsMap.has(code)) {
        studentsMap.set(code, {
          code,
          primary_case_manager: row[columnMap.case_manager]?.trim() || null,
          iep_due: parseDateFromCSV(row[columnMap.iep_due]),
          eval_due: parseDateFromCSV(row[columnMap.eval_due]),
          enrollments: new Set(),
          goals: [],
          isExisting: existingCodes.has(code)
        });
      }

      const student = studentsMap.get(code);

      const className = row[columnMap.class]?.trim();
      if (className) {
        student.enrollments.add(className);
      }

      if (row[columnMap.goal_text]?.trim() || row[columnMap.goal_code]?.trim()) {
        const goalText = row[columnMap.goal_text]?.trim();
        const goalCodeFromCSV = row[columnMap.goal_code]?.trim();
        
        // Handle empty description - use goal code as fallback, or empty string if no code
        const description = goalText || goalCodeFromCSV || '';
        
        // Handle malformed goal codes - use as-is or provide fallback
        // Examples: S00911.2 (missing period), S022.12. (trailing period) are kept as-is
        const finalGoalCode = goalCodeFromCSV || `${code}.UNKNOWN`;
        
        student.goals.push({
          goal_text: description,
          code: finalGoalCode, // CSV column is 'goal_code' but DB field is 'code'
          goal_area: row[columnMap.goal_area]?.trim(),
          measurement_type: row[columnMap.measurement_type]?.trim() || 'percent',
          case_manager: row[columnMap.case_manager]?.trim(),
          // Store multi-value data_collector as-is (don't split on commas)
          data_collector: row[columnMap.data_collector]?.trim(),
          data_collector_email: row[columnMap.data_collector_email]?.trim() || null,
          class_context: className
        });
      }
    }

    window.csvImportData = Array.from(studentsMap.values()).map(s => ({
      ...s,
      enrollments: Array.from(s.enrollments)
    }));

    displayCsvPreview(window.csvImportData, newStudentCount, existingStudentCount);
  }

  function parseDateFromCSV(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return null;
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  function displayCsvPreview(data, newStudentCount, existingStudentCount) {
    const preview = document.getElementById('csv-preview');
    const content = document.getElementById('csv-preview-content');
    
    const summary = `
      <p><strong>${newStudentCount}</strong> new students will be imported</p>
      <p><strong>${existingStudentCount}</strong> existing students will be updated</p>
      <p><strong>${data.reduce((sum, s) => sum + s.goals.length, 0)}</strong> total goals</p>
      <details>
        <summary>Show Details</summary>
        <ul>
          ${data.slice(0, 5).map(s => `
            <li>${escapeHtml(s.code)}${s.isExisting ? ' (existing)' : ' (new)'}: ${s.enrollments.length} classes, ${s.goals.length} goals</li>
          `).join('')}
          ${data.length > 5 ? `<li>...and ${data.length - 5} more</li>` : ''}
        </ul>
      </details>
    `;

    content.innerHTML = summary;
    preview.style.display = 'block';

    document.getElementById('confirm-import').addEventListener('click', async () => {
      await handleConfirmCsvImport(data);
    });
  }

  async function handleConfirmCsvImport(data) {
    try {
      for (const studentData of data) {
        await db.upsertStudent({
          code: studentData.code,
          primary_case_manager: studentData.primary_case_manager,
          iep_due: studentData.iep_due,
          eval_due: studentData.eval_due,
          status: 'active'
        });

        for (const className of studentData.enrollments) {
          const supabase = await getSupabase();
          if (!supabase) continue;
          await supabase
            .from('enrollments')
            .insert({ student_code: studentData.code, class_name: className });
        }

        for (const goal of studentData.goals) {
          await db.upsertGoal({
            student_code: studentData.code,
            code: goal.code,
            goal_text: goal.goal_text,
            goal_area: goal.goal_area,
            measurement_type: goal.measurement_type,
            case_manager: goal.case_manager,
            data_collector: goal.data_collector,
            data_collector_email: goal.data_collector_email,
            class_context: goal.class_context,
            status: 'active',
            version: 1
          });
        }
      }

      console.log('[tc-students] Imported', data.length, 'students');
      await loadData();
      document.querySelector('.modal').remove();
      alert(`Successfully imported/updated ${data.length} students`);
    } catch (error) {
      console.error('[tc-students] Error importing CSV:', error);
      alert('Failed to import CSV');
    }
  }

  function createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'st-modal-backdrop active';
    modal.innerHTML = `
      <div class="st-modal">
        <div class="st-modal-header">
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="st-modal-body">
          ${content}
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    return modal;
  }

  // Initialize
  function init() {
    console.log('[tc-students] Initializing...');
    
    renderQuarterBar();
    renderClassFilterOptions();
    setupEventHandlers();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
