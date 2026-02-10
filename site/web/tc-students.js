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
    "Language Arts 1 S1",
    "Language Arts 2 SC",
    "Language Arts 2 S1",
    "Language Arts 3 SC",
    "Language Arts 3 S1",
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
    "Language Arts 1 S1": "LA1S1",
    "Language Arts 2 SC": "LA2SC",
    "Language Arts 2 S1": "LA2S1",
    "Language Arts 3 SC": "LA3SC",
    "Language Arts 3 S1": "LA3S1",
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
  let filteredStudents = [];
  let selectedStudent = null;
  let selectedClassFilter = 'All';
  let selectedGoalAreaFilter = 'All';
  let searchQuery = '';
  let isSyncing = false;

  // Load data
  async function loadData() {
    try {
      console.log('[tc-students] Loading data...');
      isSyncing = true;
      updateSyncIndicator();

      const [students, goals, enrollments] = await Promise.all([
        db.listStudents(),
        db.listGoalsAll(),
        db.listClassEnrollments()
      ]);

      allStudents = students.filter(s => s.status === 'active');
      allGoals = goals;
      allEnrollments = enrollments;

      console.log('[tc-students] Loaded:', allStudents.length, 'students,', allGoals.length, 'goals');
      
      filterStudents();
      renderStudentList();
      
      if (filteredStudents.length > 0 && !selectedStudent) {
        selectStudent(filteredStudents[0].code);
      }

      isSyncing = false;
      updateSyncIndicator();
    } catch (error) {
      console.error('[tc-students] Error loading data:', error);
      isSyncing = false;
      updateSyncIndicator();
    }
  }

  function updateSyncIndicator() {
    const indicator = document.getElementById('sync-indicator');
    if (indicator) {
      if (isSyncing) {
        indicator.textContent = '🔄 Syncing...';
        indicator.className = 'syncing';
      } else {
        indicator.textContent = '✓ Synced';
        indicator.className = 'synced';
      }
    }
  }

  function filterStudents() {
    let filtered = allStudents;

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

    filteredStudents = filtered;
  }

  // Render functions
  function renderStudentList() {
    const container = document.getElementById('student-list');
    if (!container) return;

    const html = filteredStudents.map(student => {
      const enrollments = allEnrollments.filter(e => e.student_code === student.code);
      const studentGoals = allGoals.filter(g => g.student_code === student.code);
      const classes = enrollments.map(e => abbreviateClass(e.class_name)).join(', ');
      const isSelected = selectedStudent === student.code;

      return `
        <div class="student-item ${isSelected ? 'selected' : ''}" data-code="${escapeHtml(student.code)}">
          <div class="student-status">🟢</div>
          <div class="student-info">
            <div class="student-code">${escapeHtml(student.code)}</div>
            <div class="student-classes">${escapeHtml(classes)}</div>
            <div class="student-goals">${studentGoals.length} goals</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
    updateStudentCount();
  }

  function updateStudentCount() {
    const countEl = document.getElementById('student-count');
    if (countEl) {
      countEl.textContent = `${filteredStudents.length} ${filteredStudents.length === 1 ? 'student' : 'students'}`;
    }
  }

  function renderClassFilters() {
    const container = document.getElementById('class-filters');
    if (!container) return;

    const allButton = `
      <button class="filter-btn ${selectedClassFilter === 'All' ? 'active' : ''}" data-class="All">
        All
      </button>
    `;

    const classButtons = FULL_CLASS_NAMES.map(className => `
      <button class="filter-btn ${selectedClassFilter === className ? 'active' : ''}" data-class="${escapeHtml(className)}">
        ${escapeHtml(className)}
      </button>
    `).join('');

    container.innerHTML = allButton + classButtons;
  }

  function renderStudentDetail() {
    const container = document.getElementById('student-detail');
    if (!container) return;

    if (!selectedStudent) {
      container.innerHTML = '<div class="empty-state">Select a student to view details</div>';
      return;
    }

    const student = allStudents.find(s => s.code === selectedStudent);
    if (!student) {
      container.innerHTML = '<div class="empty-state">Student not found</div>';
      return;
    }

    const enrollments = allEnrollments.filter(e => e.student_code === student.code);
    const studentGoals = allGoals.filter(g => g.student_code === student.code);

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

    const html = `
      <div class="student-detail-content">
        ${renderStudentHeader(student)}
        ${renderStudentClasses(student, enrollments)}
        ${renderStudentGoals(inContextGoals, outsideGoals)}
        ${renderStudentPassword(student)}
        ${renderStudentStats(student, studentGoals)}
      </div>
    `;

    container.innerHTML = html;
  }

  function renderStudentHeader(student) {
    return `
      <div class="detail-section">
        <div class="student-header">
          <div class="student-header-left">
            <h2>${escapeHtml(student.code)}</h2>
            <span class="badge badge-success">🟢 Active</span>
          </div>
          <button class="btn btn-danger" id="archive-student-btn">Archive</button>
        </div>
        <div class="student-meta">
          <div class="meta-item">
            <span class="meta-label">Primary Case Manager:</span>
            <span class="meta-value">${escapeHtml(student.primary_case_manager || 'N/A')}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">IEP Due:</span>
            <span class="meta-value">${formatDate(student.iep_due)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Eval Due:</span>
            <span class="meta-value">${formatDate(student.eval_due)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderStudentClasses(student, enrollments) {
    const classItems = FULL_CLASS_NAMES.map(className => {
      const isEnrolled = enrollments.some(e => e.class_name === className);
      return `
        <div class="class-item">
          <span class="class-checkbox">${isEnrolled ? '✓' : ''}</span>
          <span class="class-name">${escapeHtml(className)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="detail-section">
        <div class="section-header">
          <h3>Classes</h3>
          <button class="btn btn-secondary" id="manage-enrollments-btn">Manage Enrollments</button>
        </div>
        <div class="class-list">
          ${classItems}
        </div>
      </div>
    `;
  }

  function renderStudentGoals(inContextGoals, outsideGoals) {
    const goalAreaFilter = `
      <select id="goal-area-filter" class="filter-select">
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
        <div class="outside-categories">
          <details>
            <summary>Outside Categories (${outsideGoals.length} goals from other classes)</summary>
            <div class="goal-cards">
              ${outsideGoals.map(goal => renderGoalCard(goal)).join('')}
            </div>
          </details>
        </div>
      `;
    }

    return `
      <div class="detail-section">
        <div class="section-header">
          <h3>IEP Goals</h3>
          <div class="section-actions">
            ${goalAreaFilter}
            <button class="btn btn-primary" id="add-goal-btn">+ Add Goal</button>
          </div>
        </div>
        <div class="goal-cards">
          ${inContextHtml || '<div class="empty-state">No goals in this category</div>'}
        </div>
        ${outsideHtml}
      </div>
    `;
  }

  function renderGoalCard(goal) {
    const icon = GOAL_AREA_ICONS[goal.goal_area] || '📌';
    const dataCollectorWarning = goal.data_collector && goal.data_collector !== 'Dan Reinisch' ? '⚠️ ' : '';
    const classContext = goal.class_context ? `<div class="goal-class">📚 ${escapeHtml(goal.class_context)}</div>` : '';

    return `
      <div class="goal-card" data-goal-id="${goal.id}">
        <div class="goal-header">
          <div class="goal-area">
            <span class="goal-icon">${icon}</span>
            <span class="goal-area-name">${escapeHtml(goal.goal_area || 'N/A')}</span>
            <span class="goal-code">${escapeHtml(goal.goal_code || '')}</span>
          </div>
          <span class="badge badge-measurement">${escapeHtml(goal.measurement_type || 'N/A')}</span>
        </div>
        <div class="goal-description">${escapeHtml(goal.desc || goal.goal_text || '(No goal description provided)')}</div>
        <div class="goal-metrics">
          <div class="metric">
            <span class="metric-label">Baseline:</span>
            <span class="metric-value">${escapeHtml(goal.baseline || 'N/A')}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Target:</span>
            <span class="metric-value">${escapeHtml(goal.target || 'N/A')}</span>
          </div>
        </div>
        <div class="goal-meta">
          <div class="goal-manager">👤 ${escapeHtml(goal.case_manager || 'N/A')}</div>
          <div class="goal-collector">${dataCollectorWarning}📊 ${escapeHtml(goal.data_collector || 'N/A')}</div>
          ${classContext}
        </div>
        ${goal.version ? `<div class="goal-version">v${goal.version}</div>` : ''}
        <div class="goal-actions">
          <button class="btn btn-sm btn-secondary edit-goal-btn" data-goal-id="${goal.id}">Edit</button>
          <button class="btn btn-sm btn-secondary version-goal-btn" data-goal-id="${goal.id}">Version</button>
          <button class="btn btn-sm btn-danger archive-goal-btn" data-goal-id="${goal.id}">Archive</button>
        </div>
      </div>
    `;
  }

  function renderStudentPassword(student) {
    return `
      <div class="detail-section">
        <div class="section-header">
          <h3>Password</h3>
          <button class="btn btn-secondary" id="reset-password-btn">🔑 Reset Password</button>
        </div>
      </div>
    `;
  }

  function renderStudentStats(student, goals) {
    return `
      <div class="detail-section">
        <h3>Quick Stats</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Submissions</div>
            <div class="stat-value">-</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Average Score</div>
            <div class="stat-value">-</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Last Active</div>
            <div class="stat-value">-</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Goals On Track</div>
            <div class="stat-value">-</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Days Since Last</div>
            <div class="stat-value">-</div>
          </div>
        </div>
      </div>
    `;
  }

  // Event handlers
  function setupEventHandlers() {
    const searchInput = document.getElementById('student-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        filterStudents();
        renderStudentList();
      });
    }

    const classFilters = document.getElementById('class-filters');
    if (classFilters) {
      classFilters.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
          selectedClassFilter = e.target.dataset.class;
          renderClassFilters();
          filterStudents();
          renderStudentList();
          renderStudentDetail();
        }
      });
    }

    const studentList = document.getElementById('student-list');
    if (studentList) {
      studentList.addEventListener('click', (e) => {
        const item = e.target.closest('.student-item');
        if (item) {
          selectStudent(item.dataset.code);
        }
      });
    }

    const studentDetail = document.getElementById('student-detail');
    if (studentDetail) {
      studentDetail.addEventListener('click', async (e) => {
        if (e.target.id === 'archive-student-btn') {
          await handleArchiveStudent();
        } else if (e.target.id === 'manage-enrollments-btn') {
          showManageEnrollmentsModal();
        } else if (e.target.id === 'add-goal-btn') {
          showAddGoalModal();
        } else if (e.target.id === 'reset-password-btn') {
          showResetPasswordModal();
        } else if (e.target.classList.contains('edit-goal-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          showEditGoalModal(goalId);
        } else if (e.target.classList.contains('version-goal-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          await handleVersionGoal(goalId);
        } else if (e.target.classList.contains('archive-goal-btn')) {
          const goalId = parseInt(e.target.dataset.goalId);
          await handleArchiveGoal(goalId);
        }
      });

      studentDetail.addEventListener('change', (e) => {
        if (e.target.id === 'goal-area-filter') {
          selectedGoalAreaFilter = e.target.value;
          renderStudentDetail();
        }
      });
    }

    const addStudentBtn = document.getElementById('add-student-btn');
    if (addStudentBtn) {
      addStudentBtn.addEventListener('click', showAddStudentWizard);
    }

    const importCsvBtn = document.getElementById('import-csv-btn');
    if (importCsvBtn) {
      importCsvBtn.addEventListener('click', showImportCsvModal);
    }
  }

  function selectStudent(code) {
    selectedStudent = code;
    selectedGoalAreaFilter = 'All';
    renderStudentList();
    renderStudentDetail();
  }

  async function handleArchiveStudent() {
    if (!selectedStudent) return;
    
    if (!confirm(`Archive student ${selectedStudent}? This will hide them from the active list.`)) {
      return;
    }

    try {
      await db.upsertStudent({ code: selectedStudent, status: 'archived' });
      console.log('[tc-students] Archived student:', selectedStudent);
      await loadData();
      selectedStudent = null;
      renderStudentDetail();
    } catch (error) {
      console.error('[tc-students] Error archiving student:', error);
      alert('Failed to archive student');
    }
  }

  async function handleArchiveGoal(goalId) {
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) return;

    if (!confirm(`Archive goal "${goal.goal_code}"?`)) {
      return;
    }

    try {
      await db.upsertGoal({ id: goalId, status: 'archived' });
      console.log('[tc-students] Archived goal:', goalId);
      await loadData();
      renderStudentDetail();
    } catch (error) {
      console.error('[tc-students] Error archiving goal:', error);
      alert('Failed to archive goal');
    }
  }

  async function handleVersionGoal(goalId) {
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) return;

    if (!confirm(`Create a new version of goal "${goal.goal_code}"? The current goal will be archived.`)) {
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
      renderStudentDetail();
    } catch (error) {
      console.error('[tc-students] Error versioning goal:', error);
      alert('Failed to create new version');
    }
  }

  // Modals
  function showManageEnrollmentsModal() {
    const student = allStudents.find(s => s.code === selectedStudent);
    if (!student) return;

    const enrollments = allEnrollments.filter(e => e.student_code === student.code);
    
    const checkboxes = FULL_CLASS_NAMES.map(className => {
      const isEnrolled = enrollments.some(e => e.class_name === className);
      return `
        <label class="checkbox-label">
          <input type="checkbox" name="enrollment" value="${escapeHtml(className)}" ${isEnrolled ? 'checked' : ''}>
          ${escapeHtml(className)}
        </label>
      `;
    }).join('');

    const modal = createModal('Manage Enrollments', `
      <form id="enrollments-form">
        <div class="form-group">
          <label>Select Classes:</label>
          <div class="checkbox-group">
            ${checkboxes}
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="cancel-enrollments">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
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
      renderStudentDetail();
    } catch (error) {
      console.error('[tc-students] Error saving enrollments:', error);
      alert('Failed to save enrollments');
    }
  }

  function showAddGoalModal() {
    const student = allStudents.find(s => s.code === selectedStudent);
    if (!student) return;

    const modal = createModal('Add IEP Goal', `
      <form id="add-goal-form">
        <div class="form-group">
          <label>Goal Area:</label>
          <select name="goal_area" required>
            <option value="">Select...</option>
            ${GOAL_AREAS.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Goal Code:</label>
          <input type="text" name="goal_code" required>
        </div>
        <div class="form-group">
          <label>Description:</label>
          <textarea name="goal_text" rows="4" required></textarea>
        </div>
        <div class="form-group">
          <label>Measurement Type:</label>
          <select name="measurement_type" required>
            <option value="">Select...</option>
            <option value="Accuracy">Accuracy</option>
            <option value="Frequency">Frequency</option>
            <option value="Duration">Duration</option>
            <option value="Rate">Rate</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Baseline:</label>
            <input type="text" name="baseline" required>
          </div>
          <div class="form-group">
            <label>Target:</label>
            <input type="text" name="target" required>
          </div>
        </div>
        <div class="form-group">
          <label>Case Manager:</label>
          <input type="text" name="case_manager" value="${escapeHtml(student.primary_case_manager || '')}" required>
        </div>
        <div class="form-group">
          <label>Data Collector:</label>
          <input type="text" name="data_collector" value="Dan Reinisch" required>
        </div>
        <div class="form-group">
          <label>Class Context:</label>
          <select name="class_context">
            <option value="">Select...</option>
            ${FULL_CLASS_NAMES.map(cn => `<option value="${escapeHtml(cn)}">${escapeHtml(cn)}</option>`).join('')}
          </select>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="cancel-goal">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Goal</button>
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
      student_code: selectedStudent,
      goal_area: formData.get('goal_area'),
      goal_code: formData.get('goal_code'),
      goal_text: formData.get('goal_text'),
      measurement_type: formData.get('measurement_type'),
      baseline: formData.get('baseline'),
      target: formData.get('target'),
      case_manager: formData.get('case_manager'),
      data_collector: formData.get('data_collector'),
      class_context: formData.get('class_context') || null,
      status: 'active',
      version: 1
    };

    try {
      await db.upsertGoal(goal);
      console.log('[tc-students] Added goal');
      await loadData();
      renderStudentDetail();
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
        <div class="form-group">
          <label>Goal Area:</label>
          <select name="goal_area" required>
            ${GOAL_AREAS.map(area => `
              <option value="${escapeHtml(area)}" ${goal.goal_area === area ? 'selected' : ''}>
                ${escapeHtml(area)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Goal Code:</label>
          <input type="text" name="goal_code" value="${escapeHtml(goal.goal_code || '')}" required>
        </div>
        <div class="form-group">
          <label>Description:</label>
          <textarea name="goal_text" rows="4" required>${escapeHtml(goal.goal_text || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Measurement Type:</label>
          <select name="measurement_type" required>
            <option value="Accuracy" ${goal.measurement_type === 'Accuracy' ? 'selected' : ''}>Accuracy</option>
            <option value="Frequency" ${goal.measurement_type === 'Frequency' ? 'selected' : ''}>Frequency</option>
            <option value="Duration" ${goal.measurement_type === 'Duration' ? 'selected' : ''}>Duration</option>
            <option value="Rate" ${goal.measurement_type === 'Rate' ? 'selected' : ''}>Rate</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Baseline:</label>
            <input type="text" name="baseline" value="${escapeHtml(goal.baseline || '')}" required>
          </div>
          <div class="form-group">
            <label>Target:</label>
            <input type="text" name="target" value="${escapeHtml(goal.target || '')}" required>
          </div>
        </div>
        <div class="form-group">
          <label>Case Manager:</label>
          <input type="text" name="case_manager" value="${escapeHtml(goal.case_manager || '')}" required>
        </div>
        <div class="form-group">
          <label>Data Collector:</label>
          <input type="text" name="data_collector" value="${escapeHtml(goal.data_collector || '')}" required>
        </div>
        <div class="form-group">
          <label>Class Context:</label>
          <select name="class_context">
            <option value="">None</option>
            ${FULL_CLASS_NAMES.map(cn => `
              <option value="${escapeHtml(cn)}" ${goal.class_context === cn ? 'selected' : ''}>
                ${escapeHtml(cn)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="cancel-edit-goal">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Changes</button>
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
    const updates = {
      id: goalId,
      goal_area: formData.get('goal_area'),
      goal_code: formData.get('goal_code'),
      goal_text: formData.get('goal_text'),
      measurement_type: formData.get('measurement_type'),
      baseline: formData.get('baseline'),
      target: formData.get('target'),
      case_manager: formData.get('case_manager'),
      data_collector: formData.get('data_collector'),
      class_context: formData.get('class_context') || null
    };

    try {
      await db.upsertGoal(updates);
      console.log('[tc-students] Updated goal');
      await loadData();
      renderStudentDetail();
    } catch (error) {
      console.error('[tc-students] Error updating goal:', error);
      alert('Failed to update goal');
    }
  }

  function showResetPasswordModal() {
    const student = allStudents.find(s => s.code === selectedStudent);
    if (!student) return;

    const modal = createModal('Reset Password', `
      <form id="reset-password-form">
        <div class="form-group">
          <label>New Password for ${escapeHtml(student.code)}:</label>
          <input type="text" name="password" required>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="cancel-password">Cancel</button>
          <button type="submit" class="btn btn-primary">Reset Password</button>
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
      await db.upsertStudent({ code: selectedStudent, password_hash: password });
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
      else if (normalized.includes('iep due')) columnMap.iep_due = index;
      else if (normalized.includes('eval due')) columnMap.eval_due = index;
    });

    const studentsMap = new Map();
    const existingCodes = new Set(allStudents.map(s => s.code));
    let skippedCount = 0;

    for (const row of rows) {
      const code = row[columnMap.code]?.trim();
      if (!code) continue;

      if (existingCodes.has(code)) {
        skippedCount++;
        continue;
      }

      if (!studentsMap.has(code)) {
        studentsMap.set(code, {
          code,
          primary_case_manager: row[columnMap.case_manager]?.trim() || null,
          iep_due: parseDateFromCSV(row[columnMap.iep_due]),
          eval_due: parseDateFromCSV(row[columnMap.eval_due]),
          enrollments: new Set(),
          goals: []
        });
      }

      const student = studentsMap.get(code);

      const className = row[columnMap.class]?.trim();
      if (className) {
        student.enrollments.add(className);
      }

      if (row[columnMap.goal_text]?.trim()) {
        student.goals.push({
          goal_text: row[columnMap.goal_text]?.trim(),
          goal_code: row[columnMap.goal_code]?.trim(),
          goal_area: row[columnMap.goal_area]?.trim(),
          measurement_type: row[columnMap.measurement_type]?.trim(),
          case_manager: row[columnMap.case_manager]?.trim(),
          data_collector: row[columnMap.data_collector]?.trim(),
          class_context: className
        });
      }
    }

    window.csvImportData = Array.from(studentsMap.values()).map(s => ({
      ...s,
      enrollments: Array.from(s.enrollments)
    }));

    displayCsvPreview(window.csvImportData, skippedCount);
  }

  function parseDateFromCSV(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return null;
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  function displayCsvPreview(data, skippedCount) {
    const preview = document.getElementById('csv-preview');
    const content = document.getElementById('csv-preview-content');
    
    const summary = `
      <p><strong>${data.length}</strong> students will be imported</p>
      <p><strong>${skippedCount}</strong> students skipped (already exist)</p>
      <p><strong>${data.reduce((sum, s) => sum + s.goals.length, 0)}</strong> total goals</p>
      <details>
        <summary>Show Details</summary>
        <ul>
          ${data.slice(0, 5).map(s => `
            <li>${escapeHtml(s.code)}: ${s.enrollments.length} classes, ${s.goals.length} goals</li>
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
            ...goal,
            status: 'active',
            version: 1
          });
        }
      }

      console.log('[tc-students] Imported', data.length, 'students');
      await loadData();
      document.querySelector('.modal').remove();
      alert(`Successfully imported ${data.length} students`);
    } catch (error) {
      console.error('[tc-students] Error importing CSV:', error);
      alert('Failed to import CSV');
    }
  }

  function createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-dialog">
        <div class="modal-content">
          <h2>${escapeHtml(title)}</h2>
          ${content}
        </div>
      </div>
    `;

    modal.querySelector('.modal-backdrop').addEventListener('click', () => {
      modal.remove();
    });

    return modal;
  }

  // Initialize
  function init() {
    console.log('[tc-students] Initializing...');
    
    renderClassFilters();
    setupEventHandlers();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
