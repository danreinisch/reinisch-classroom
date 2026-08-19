/**
 * Archive Tab Module
 * Read-only historical view of archived students with Goals, Gradebook, Data, and Submissions
 * Includes DOCX export and reactivate functionality
 */

(async () => {
  "use strict";

  // Route guard
  if (!location.pathname.startsWith("/teacher/archive")) return;

  console.log('[tc-archive] Initializing Archive tab');

  // Import data adapter
  const { db, isRemote } = await import('/web/data-adapter.js');
  const { getSupabase } = await import('/web/supabase-client.js');
  const { hasCriterionConflict } = await import('/web/goal-utils.js');

  // State
  let archivedStudents = [];
  let expandedStudents = new Set();
  let activeSubTabs = {}; // studentCode -> activeTab (goals|gradebook|data|submissions)
  let studentArchiveData = {}; // studentCode -> {goals, submissions, progress, gradebookScores}
  let searchText = '';
  let usingSupabase = false;
  let syncStatus = 'synced';
  let realtimeChannel = null;

  // DOM elements
  const $ = (id) => document.getElementById(id);
  const arSyncIcon = $('arSyncIcon');
  const arSyncText = $('arSyncText');
  const arSearchInput = $('arSearchInput');
  const arCount = $('arCount');
  const arAccordion = $('arAccordion');
  const arEmpty = $('arEmpty');

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Escape XML for DOCX export
   */
  function escapeXml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Format date as "Jan 15, 2026"
   */
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /**
   * Preserve official criterion values without choosing between them
   * when the source explicitly marks a conflict.
   */
  function getArchiveCriterionDisplay(goal) {
    const isConflict =
      hasCriterionConflict(goal);

    if (isConflict) {
      const masteryValue =
        goal?.mastery == null ||
        goal.mastery === ''
          ? 'N/A'
          : String(goal.mastery);

      const targetValue =
        goal?.target == null ||
        goal.target === ''
          ? 'N/A'
          : String(goal.target);

      return {
        isConflict: true,
        masteryLabel: 'Header Mastery',
        masteryValue,
        targetLabel: 'Goal-Text Target',
        targetValue,
        status: 'Manual Criterion Review Required',
      };
    }

    return {
      isConflict: false,
      masteryLabel: 'Mastery',
      masteryValue:
        String(
          goal?.mastery ||
          goal?.target ||
          'N/A'
        ),
      targetLabel: 'Target',
      targetValue:
        String(
          goal?.target ||
          'N/A'
        ),
      status: '',
    };
  }

  /**
   * Format date as YYYY-MM-DD
   */
  function formatDateYYYYMMDD(date = new Date()) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Load archived students
   */
  async function loadData() {
    console.log('[tc-archive] Loading archived students');
    
    try {
      usingSupabase = await isRemote();
      syncStatus = usingSupabase ? 'synced' : 'local';

      archivedStudents = await db.getArchivedStudents();
      console.log('[tc-archive] Loaded', archivedStudents.length, 'archived students');

      // Setup realtime if using Supabase
      if (usingSupabase && !realtimeChannel) {
        await setupRealtime();
      }

      render();

    } catch (err) {
      console.error('[tc-archive] Error loading data:', err);
      syncStatus = 'error';
      render();
    }
  }

  /**
   * Setup realtime updates
   */
  async function setupRealtime() {
    try {
      const supabase = await getSupabase();
      if (!supabase) return;

      realtimeChannel = supabase
        .channel('archive-updates')
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'students', filter: 'active=eq.false' },
          handleRealtimeUpdate
        )
        .subscribe();

      console.log('[tc-archive] Realtime subscribed');
    } catch (err) {
      console.warn('[tc-archive] Could not set up realtime:', err);
    }
  }

  let realtimeDebounceTimer;
  function handleRealtimeUpdate() {
    clearTimeout(realtimeDebounceTimer);
    realtimeDebounceTimer = setTimeout(() => {
      console.log('[tc-archive] Realtime update detected, reloading...');
      loadData();
    }, 1000);
  }

  /**
   * Load archive data for a specific student
   */
  async function loadStudentArchiveData(studentCode) {
    if (studentArchiveData[studentCode]) {
      return studentArchiveData[studentCode];
    }

    console.log('[tc-archive] Loading archive data for', studentCode);

    try {
      const data = await db.getStudentArchiveData(studentCode);
      studentArchiveData[studentCode] = data;
      return data;
    } catch (err) {
      console.error('[tc-archive] Error loading archive data:', err);
      return null;
    }
  }

  /**
   * Filter students by search text
   */
  function getFilteredStudents() {
    if (!searchText) return archivedStudents;
    
    const search = searchText.toLowerCase();
    return archivedStudents.filter(s => 
      s.code?.toLowerCase().includes(search) ||
      s.name?.toLowerCase().includes(search)
    );
  }

  /**
   * Update sync status display
   */
  function updateSyncStatus() {
    if (syncStatus === 'synced') {
      arSyncIcon.innerHTML = '<span class="rc-status-dot rc-status-dot--ok"></span>';
      arSyncText.textContent = 'Synced';
    } else if (syncStatus === 'local') {
      arSyncIcon.innerHTML = '<span class="rc-status-dot rc-status-dot--warn"></span>';
      arSyncText.textContent = 'Local mode';
    } else {
      arSyncIcon.innerHTML = '<span class="rc-status-dot rc-status-dot--error"></span>';
      arSyncText.textContent = 'Error';
    }
  }

  /**
   * Render the main view
   */
  function render() {
    updateSyncStatus();
    
    const filtered = getFilteredStudents();
    arCount.textContent = `${filtered.length} archived student${filtered.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
      arAccordion.innerHTML = '';
      arEmpty.style.display = 'block';
      return;
    }

    arEmpty.style.display = 'none';
    renderAccordion(filtered);
  }

  /**
   * Render accordion of archived students
   */
  function renderAccordion(students) {
    const html = students.map(student => {
      const isExpanded = expandedStudents.has(student.code);
      const activeTab = activeSubTabs[student.code] || 'goals';
      const archivedDate = formatDate(student.archived_at);

      return `
        <div class="ar-accordion-item" data-student="${escapeHtml(student.code)}">
          <div class="ar-accordion-header" data-action="toggle">
            <div>
              <div class="ar-accordion-title">
                <span class="ar-accordion-toggle ${isExpanded ? 'expanded' : ''}">▼</span>
                <span>${escapeHtml(student.code)}</span>
                <span style="opacity: 0.7;">—</span>
                <span style="opacity: 0.7;">Archived ${archivedDate}</span>
              </div>
              ${isExpanded ? `
                <div class="ar-accordion-meta">
                  ${student.name ? escapeHtml(student.name) + ' · ' : ''}
                  Case Manager: ${escapeHtml(student.primary_case_manager || 'N/A')} · 
                  IEP Due: ${formatDate(student.iep_due)} · 
                  Eval Due: ${formatDate(student.eval_due)}
                </div>
              ` : ''}
            </div>
          </div>
          <div class="ar-accordion-content ${isExpanded ? 'expanded' : ''}" data-student="${escapeHtml(student.code)}">
            ${isExpanded ? renderStudentContent(student, activeTab) : ''}
          </div>
        </div>
      `;
    }).join('');

    arAccordion.innerHTML = html;
  }

  /**
   * Render student accordion content with sub-tabs
   */
  function renderStudentContent(student, activeTab) {
    return `
      <div class="ar-tabs">
        <button class="ar-tab ${activeTab === 'goals' ? 'active' : ''}" data-action="switch-tab" data-tab="goals">Goals</button>
        <button class="ar-tab ${activeTab === 'gradebook' ? 'active' : ''}" data-action="switch-tab" data-tab="gradebook">Gradebook</button>
        <button class="ar-tab ${activeTab === 'data' ? 'active' : ''}" data-action="switch-tab" data-tab="data">Data</button>
        <button class="ar-tab ${activeTab === 'submissions' ? 'active' : ''}" data-action="switch-tab" data-tab="submissions">Submissions</button>
      </div>

      <div class="ar-tab-content ${activeTab === 'goals' ? 'active' : ''}" data-tab="goals">
        <div id="arGoalsContent-${escapeHtml(student.code)}">Loading...</div>
      </div>

      <div class="ar-tab-content ${activeTab === 'gradebook' ? 'active' : ''}" data-tab="gradebook">
        <div id="arGradebookContent-${escapeHtml(student.code)}">Loading...</div>
      </div>

      <div class="ar-tab-content ${activeTab === 'data' ? 'active' : ''}" data-tab="data">
        <div id="arDataContent-${escapeHtml(student.code)}">Loading...</div>
      </div>

      <div class="ar-tab-content ${activeTab === 'submissions' ? 'active' : ''}" data-tab="submissions">
        <div id="arSubmissionsContent-${escapeHtml(student.code)}">Loading...</div>
      </div>

      <div class="ar-actions">
        <button class="ar-btn" data-action="export-docx">📥 Export Report (DOCX)</button>
        <button class="ar-btn primary" data-action="reactivate">🔄 Reactivate Student</button>
      </div>
    `;
  }

  /**
   * Render Goals sub-tab
   */
  async function renderGoalsTab(studentCode) {
    const container = document.getElementById(`arGoalsContent-${studentCode}`);
    if (!container) return;

    const data = await loadStudentArchiveData(studentCode);
    if (!data || !data.goals || data.goals.length === 0) {
      container.innerHTML = '<div class="ar-empty">No goals found for this student.</div>';
      return;
    }

    // Group goals by code (for version history)
    const goalsByCode = {};
    data.goals.forEach(goal => {
      if (!goalsByCode[goal.code]) {
        goalsByCode[goal.code] = [];
      }
      goalsByCode[goal.code].push(goal);
    });

    const html = Object.entries(goalsByCode).map(([code, versions]) => {
      // Sort by version descending (latest first)
      versions.sort((a, b) => (b.version || 1) - (a.version || 1));
      const latest = versions[0];

      const criterion =
        getArchiveCriterionDisplay(
          latest
        );
      const hasVersions = versions.length > 1;

      // Calculate final average from progress data
      const goalProgress = data.progress.filter(p => p.goal_code === code || p.goal_id === latest.id);
      const finalAvg = goalProgress.length > 0
        ? (goalProgress.reduce((acc, p) => acc + parseFloat(p.value), 0) / goalProgress.length).toFixed(0)
        : 'N/A';

      return `
        <div class="ar-goal-item">
          <div class="ar-goal-header">
            <span class="ar-goal-code">
              ${escapeHtml(code)} 
              ${latest.goal_area ? `(${escapeHtml(latest.goal_area)})` : ''}
            </span>
            ${hasVersions ? `<span style="font-size: 12px; opacity: 0.7;">v${latest.version || 1}</span>` : ''}
          </div>
          <div class="ar-goal-desc">${escapeHtml(latest.desc || 'No description')}</div>
          <div class="ar-goal-stats">
            <span>Baseline: ${escapeHtml(String(latest.baseline || 'N/A'))}</span>
            <span>→</span>
            <span>${escapeHtml(criterion.masteryLabel)}: ${escapeHtml(criterion.masteryValue)}</span>
            ${criterion.isConflict
              ? `<span>→</span>
                 <span>${escapeHtml(criterion.targetLabel)}: ${escapeHtml(criterion.targetValue)}</span>
                 <span>→</span>
                 <span>Criterion Status: ${escapeHtml(criterion.status)}</span>`
              : ''}
            <span>→</span>
            <span>Final Avg: ${finalAvg}${finalAvg !== 'N/A' ? '%' : ''}</span>
          </div>
          ${hasVersions ? `
            <div style="margin-top: 8px; font-size: 12px; opacity: 0.7;">
              📜 Version History: ${versions.length} version${versions.length > 1 ? 's' : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  /**
   * Render Gradebook sub-tab
   */
  async function renderGradebookTab(studentCode) {
    const container = document.getElementById(`arGradebookContent-${studentCode}`);
    if (!container) return;

    const data = await loadStudentArchiveData(studentCode);
    
    // For now, show placeholder since gradebook scores might not be stored separately
    container.innerHTML = `
      <div class="ar-empty" style="padding: 20px;">
        Gradebook data for archived students will be displayed here.
        <br><br>
        (Feature coming soon - assignment scores and overall average)
      </div>
    `;
  }

  /**
   * Render Data sub-tab
   */
  async function renderDataTab(studentCode) {
    const container = document.getElementById(`arDataContent-${studentCode}`);
    if (!container) return;

    const data = await loadStudentArchiveData(studentCode);
    if (!data || !data.progress || data.progress.length === 0) {
      container.innerHTML = '<div class="ar-empty">No progress data found for this student.</div>';
      return;
    }

    // Group by goal
    const progressByGoal = {};
    data.progress.forEach(entry => {
      const key = entry.goal_code || entry.goal_id;
      if (!progressByGoal[key]) {
        progressByGoal[key] = [];
      }
      progressByGoal[key].push(entry);
    });

    const html = Object.entries(progressByGoal).map(([goalKey, entries]) => {
      // Sort by date
      entries.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Calculate rolling average
      const avg = entries.length > 0
        ? (entries.reduce((acc, e) => acc + parseFloat(e.value), 0) / entries.length).toFixed(0)
        : 0;

      return `
        <div class="ar-goal-item">
          <div class="ar-goal-header">
            <span class="ar-goal-code">Goal: ${escapeHtml(goalKey)}</span>
            <span style="font-size: 13px;">Rolling Avg: ${avg}%</span>
          </div>
          <table class="ar-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Value</th>
                <th>Source</th>
                <th>Collected By</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map(entry => `
                <tr>
                  <td>${formatDate(entry.date)}</td>
                  <td>${parseFloat(entry.value).toFixed(0)}%</td>
                  <td>${escapeHtml(entry.source || 'manual')}</td>
                  <td>${escapeHtml(entry.collected_by || 'N/A')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  /**
   * Render Submissions sub-tab
   */
  async function renderSubmissionsTab(studentCode) {
    const container = document.getElementById(`arSubmissionsContent-${studentCode}`);
    if (!container) return;

    const data = await loadStudentArchiveData(studentCode);
    if (!data || !data.submissions || data.submissions.length === 0) {
      container.innerHTML = '<div class="ar-empty">No submissions found for this student.</div>';
      return;
    }

    const html = `
      <table class="ar-table">
        <thead>
          <tr>
            <th>Assignment</th>
            <th>Submitted</th>
            <th>Auto Score</th>
            <th>Manual Score</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.submissions.map(sub => {
            const submittedDate = formatDate(sub.submitted_at);
            const autoScore = sub.score_auto != null ? `${sub.score_auto}%` : '—';
            const manualScore = sub.score_manual != null ? `${sub.score_manual}%` : '—';
            const totalScore = sub.score_total != null ? `${sub.score_total}%` : 'Not graded';
            const status = sub.review_status || 'pending';

            // Get assignment title (might be nested)
            let assignmentTitle = 'Assignment';
            if (sub.assignment_instances?.assignments?.title) {
              assignmentTitle = sub.assignment_instances.assignments.title;
            } else if (sub.assignment_id) {
              assignmentTitle = `Assignment ${sub.assignment_id}`;
            }

            return `
              <tr>
                <td>${escapeHtml(assignmentTitle)}</td>
                <td>${submittedDate}</td>
                <td>${autoScore}</td>
                <td>${manualScore}</td>
                <td>${totalScore}</td>
                <td style="text-transform: capitalize;">${escapeHtml(status)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  }

  /**
   * Load content for active tab
   */
  async function loadTabContent(studentCode, tab) {
    switch (tab) {
      case 'goals':
        await renderGoalsTab(studentCode);
        break;
      case 'gradebook':
        await renderGradebookTab(studentCode);
        break;
      case 'data':
        await renderDataTab(studentCode);
        break;
      case 'submissions':
        await renderSubmissionsTab(studentCode);
        break;
    }
  }

  /**
   * Handle accordion toggle
   */
  async function handleToggle(studentCode) {
    const isExpanded = expandedStudents.has(studentCode);
    
    if (isExpanded) {
      expandedStudents.delete(studentCode);
    } else {
      expandedStudents.add(studentCode);
      // Load the active tab content
      const activeTab = activeSubTabs[studentCode] || 'goals';
      activeSubTabs[studentCode] = activeTab;
    }

    render();

    // After render, load content if expanded
    if (!isExpanded) {
      const activeTab = activeSubTabs[studentCode] || 'goals';
      await loadTabContent(studentCode, activeTab);
    }
  }

  /**
   * Handle tab switch
   */
  async function handleTabSwitch(studentCode, tab) {
    activeSubTabs[studentCode] = tab;
    render();
    await loadTabContent(studentCode, tab);
  }

  /**
   * Export student archive report as DOCX
   */
  async function handleExportDocx(studentCode) {
    console.log('[tc-archive] Exporting DOCX for', studentCode);

    const data = await loadStudentArchiveData(studentCode);
    if (!data) {
      await rcAlert('Error', 'Error loading student data. Please try again.');
      return;
    }

    const student = data.student;
    const goals = data.goals || [];
    const progress = data.progress || [];
    const submissions = data.submissions || [];

    // Build DOCX HTML
    const htmlContent = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <title>Archive Report</title>
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
  <h1>STUDENT ARCHIVE REPORT</h1>
  
  <p><strong>Student Code:</strong> ${escapeXml(student.code)}</p>
  <p><strong>Student Name:</strong> ${escapeXml(student.name || 'N/A')}</p>
  <p><strong>Case Manager:</strong> ${escapeXml(student.primary_case_manager || 'N/A')}</p>
  <p><strong>IEP Due:</strong> ${escapeXml(formatDate(student.iep_due))}</p>
  <p><strong>Eval Due:</strong> ${escapeXml(formatDate(student.eval_due))}</p>
  <p><strong>Archived:</strong> ${escapeXml(formatDate(student.archived_at))}</p>
  
  <h2>Goals</h2>
  ${goals.length === 0 ? '<p>No goals found.</p>' : `
  <table>
    <thead>
      <tr>
        <th>Code</th>
        <th>Area</th>
        <th>Description</th>
        <th>Baseline</th>
        <th>Mastery</th>
        <th>Target</th>
      </tr>
    </thead>
    <tbody>
      ${goals.map(g => {
        const criterion =
          getArchiveCriterionDisplay(g);

        const masteryCell =
          criterion.isConflict
            ? `Header Mastery: ${escapeXml(criterion.masteryValue)}`
            : escapeXml(criterion.masteryValue);

        const targetCell =
          criterion.isConflict
            ? `Goal-Text Target: ${escapeXml(criterion.targetValue)}<br/><strong>Criterion Status:</strong> ${escapeXml(criterion.status)}`
            : escapeXml(criterion.targetValue);

        return `
      <tr>
        <td>${escapeXml(g.code)}</td>
        <td>${escapeXml(g.goal_area || 'N/A')}</td>
        <td>${escapeXml(g.desc || 'N/A')}</td>
        <td>${escapeXml(String(g.baseline || 'N/A'))}</td>
        <td>${masteryCell}</td>
        <td>${targetCell}</td>
      </tr>`;
      }).join('')}
    </tbody>
  </table>`}
  
  <h2>Progress Data</h2>
  ${progress.length === 0 ? '<p>No progress data found.</p>' : `
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Goal</th>
        <th>Value</th>
        <th>Source</th>
        <th>Collected By</th>
      </tr>
    </thead>
    <tbody>
      ${progress.map(p => `
      <tr>
        <td>${escapeXml(formatDate(p.date))}</td>
        <td>${escapeXml(p.goal_code || p.goal_id || 'N/A')}</td>
        <td>${parseFloat(p.value).toFixed(0)}%</td>
        <td>${escapeXml(p.source || 'manual')}</td>
        <td>${escapeXml(p.collected_by || 'N/A')}</td>
      </tr>`).join('')}
    </tbody>
  </table>`}
  
  <h2>Submissions</h2>
  ${submissions.length === 0 ? '<p>No submissions found.</p>' : `
  <table>
    <thead>
      <tr>
        <th>Assignment</th>
        <th>Submitted</th>
        <th>Score</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${submissions.map(sub => {
        let title = 'Assignment';
        if (sub.assignment_instances?.assignments?.title) {
          title = sub.assignment_instances.assignments.title;
        } else if (sub.assignment_id) {
          title = `Assignment ${sub.assignment_id}`;
        }
        return `
      <tr>
        <td>${escapeXml(title)}</td>
        <td>${escapeXml(formatDate(sub.submitted_at))}</td>
        <td>${sub.score_total != null ? sub.score_total + '%' : 'Not graded'}</td>
        <td>${escapeXml(sub.review_status || 'pending')}</td>
      </tr>`;
      }).join('')}
    </tbody>
  </table>`}
  
  <p style="margin-top: 30px;"><em>Generated on ${escapeXml(new Date().toLocaleString())}</em></p>
</body>
</html>
    `;

    // Create blob and download
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${studentCode}_archive_report.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[tc-archive] DOCX export complete');
  }

  /**
   * Handle reactivate student
   */
  async function handleReactivate(studentCode) {
    const confirmed = await rcConfirm(
      'Reactivate Student',
      `Reactivate this student?\n\nThey will appear in the active student list and can log into the portal.`,
      'Reactivate'
    );

    if (!confirmed) return;

    try {
      await db.reactivateStudent(studentCode);
      console.log('[tc-archive] Student reactivated:', studentCode);
      
      // Remove from local state
      archivedStudents = archivedStudents.filter(s => s.code !== studentCode);
      expandedStudents.delete(studentCode);
      delete activeSubTabs[studentCode];
      delete studentArchiveData[studentCode];

      render();
      await rcAlert('Success', 'Student reactivated successfully!');

    } catch (err) {
      console.error('[tc-archive] Error reactivating student:', err);
      await rcAlert('Error', 'Error reactivating student. Please try again.');
    }
  }

  /**
   * Setup event handlers
   */
  function setupEventHandlers() {
    // Search input
    arSearchInput.addEventListener('input', (e) => {
      searchText = e.target.value.trim();
      render();
    });

    // Event delegation for accordion
    arAccordion.addEventListener('click', async (e) => {
      const item = e.target.closest('.ar-accordion-item');
      if (!item) return;

      const studentCode = item.dataset.student;
      const action = e.target.closest('[data-action]')?.dataset.action;
      const tab = e.target.closest('[data-tab]')?.dataset.tab;

      if (action === 'toggle') {
        await handleToggle(studentCode);
      } else if (action === 'switch-tab' && tab) {
        await handleTabSwitch(studentCode, tab);
      } else if (action === 'export-docx') {
        await handleExportDocx(studentCode);
      } else if (action === 'reactivate') {
        await handleReactivate(studentCode);
      }
    });
  }

  /**
   * Initialize the module
   */
  async function init() {
    console.log('[tc-archive] Initializing...');
    
    setupEventHandlers();
    await loadData();

    console.log('[tc-archive] Initialization complete');
  }

  // Start initialization
  init();
})();
