/* eslint-disable no-undef */
// Portal B Student Dashboard JavaScript
// Handles assignment grouping, grades, resubmissions, toasts, and UI interactions

/**
 * Load and display assignments with Portal B grouping
 * @param {Object} db - Database adapter
 * @param {Object} currentUser - Current student user
 * @param {Object} feature - Feature flags
 * @param {Function} qs - Query selector helper
 * @param {Object} helpers - Portal B helper functions
 */
export async function loadStudentAssignmentsPortalB(db, currentUser, feature, qs, helpers) {
  try {
    if (!feature.portalAssignmentsStatus) {
      // Fall back to simple list if feature is disabled
      return await loadStudentAssignmentsSimple(db, currentUser, qs);
    }
    
    // Fetch data
    const [instances, assignmentsList, submissions] = await Promise.all([
      db.listAssignmentInstances(),
      db.listAssignments(),
      db.listSubmissions({ student_code: currentUser.code })
    ]);
    
    const myInstances = instances.filter(i => i.student_code === currentUser.code);
    
    // Update count
    if (qs('#assignmentsCount')) {
      qs('#assignmentsCount').textContent = myInstances.length;
    }
    
    if (myInstances.length === 0) {
      renderEmptyState(qs);
      return { groups: {}, submissionsMap: {} };
    }
    
    // Build maps
    const assignmentMap = new Map(assignmentsList.map(a => [a.id, a]));
    const submissionsMap = {};
    
    // Get latest submission per instance
    for (const instance of myInstances) {
      const instanceSubmissions = submissions
        .filter(s => s.instance_id === instance.id)
        .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      
      if (instanceSubmissions.length > 0) {
        submissionsMap[instance.id] = instanceSubmissions[0];
      }
    }
    
    // Group assignments by status
    const groups = helpers.groupAssignmentsByStatus(myInstances, submissionsMap);
    
    // Render each section
    renderSection('upcoming', groups[helpers.AssignmentStatus.UPCOMING], assignmentMap, qs, helpers, feature);
    renderSection('in-progress', groups[helpers.AssignmentStatus.IN_PROGRESS], assignmentMap, qs, helpers, feature);
    renderSection('late', groups[helpers.AssignmentStatus.LATE], assignmentMap, qs, helpers, feature);
    renderSection('missing', groups[helpers.AssignmentStatus.MISSING], assignmentMap, qs, helpers, feature);
    renderSection('submitted', groups[helpers.AssignmentStatus.SUBMITTED], assignmentMap, qs, helpers, feature);
    renderSection('graded', groups[helpers.AssignmentStatus.GRADED], assignmentMap, qs, helpers, feature);
    
    // Render All section (combines all)
    const allAssignments = Object.values(groups).flat();
    renderAllSection(allAssignments, assignmentMap, qs, helpers, feature);
    
    return { groups, submissionsMap };
    
  } catch (err) {
    console.error('Failed to load assignments:', err);
    renderErrorState(qs);
    return { groups: {}, submissionsMap: {} };
  }
}

/**
 * Render a status section
 */
function renderSection(sectionId, assignments, assignmentMap, qs, helpers, feature) {
  const container = qs(`#${sectionId}Content`);
  if (!container) return;
  
  if (!assignments || assignments.length === 0) {
    container.innerHTML = '<div class="subtle" style="text-align:center; padding:20px">No assignments in this category</div>';
    return;
  }
  
  let html = '';
  for (const item of assignments) {
    html += renderAssignmentCard(item, assignmentMap, helpers, feature);
  }
  
  container.innerHTML = html;
}

/**
 * Render the All tab with all assignments
 */
function renderAllSection(assignments, assignmentMap, qs, helpers, feature) {
  const container = qs('#allContent');
  if (!container) return;
  
  if (!assignments || assignments.length === 0) {
    container.innerHTML = '<div class="subtle" style="text-align:center; padding:20px">No assignments</div>';
    return;
  }
  
  let html = '';
  for (const item of assignments) {
    html += renderAssignmentCard(item, assignmentMap, helpers, feature);
  }
  
  container.innerHTML = html;
}

/**
 * Render an assignment card
 */
function renderAssignmentCard(item, assignmentMap, helpers, feature) {
  const { instance, latestSubmission, status } = item;
  const assignment = assignmentMap.get(instance.assignment_id) || {};
  
  const title = helpers.truncateText(assignment.title || 'Unknown Assignment', 60);
  const className = assignment.meta?.class_name || assignment.class_id || 'N/A';
  const dueDate = instance.due_at ? helpers.formatDateTime(instance.due_at, 'date') : '—';
  
  // Status pill
  const statusClass = status.toLowerCase().replace(' ', '-');
  const statusPill = `<span class="status-pill ${statusClass}">${status}</span>`;
  
  // Score for graded assignments
  let scoreHtml = '';
  if (status === helpers.AssignmentStatus.GRADED && latestSubmission && latestSubmission.score_total != null) {
    scoreHtml = `<div class="assignment-card-meta"><strong>Score:</strong> ${latestSubmission.score_total}%</div>`;
  }
  
  // Submitted date
  let submittedHtml = '';
  if (latestSubmission && latestSubmission.submitted_at) {
    submittedHtml = `<div class="assignment-card-meta"><strong>Submitted:</strong> ${helpers.formatDateTime(latestSubmission.submitted_at, 'date')}</div>`;
  }
  
  // Resubmission button (if graded and resubmission allowed)
  let resubmitHtml = '';
  if (feature.portalResubmission && status === helpers.AssignmentStatus.GRADED) {
    const resubmissionCount = instance.resubmission_count || 0;
    if (resubmissionCount < 1) {
      resubmitHtml = `<button class="btn small primary" data-action="resubmit" data-instance-id="${instance.id}" data-submission-id="${latestSubmission?.id}">Resubmit</button>`;
    } else {
      resubmitHtml = `<span class="subtle">Revision used</span>`;
    }
  }
  
  return `
    <div class="assignment-card" data-instance-id="${instance.id}">
      <div class="assignment-card-header">
        <div>
          <div class="assignment-card-title">${title}</div>
          <div class="assignment-card-meta">
            <span><strong>Class:</strong> ${className}</span>
            <span><strong>Due:</strong> ${dueDate}</span>
          </div>
        </div>
        ${statusPill}
      </div>
      ${scoreHtml}
      ${submittedHtml}
      <div class="assignment-card-footer">
        <div></div>
        <div>${resubmitHtml}</div>
      </div>
    </div>
  `;
}

/**
 * Load and display grades card with quarterly averages and graded assignments
 */
export async function loadGradesCard(db, currentUser, qs, helpers, feature = {}) {
  try {
    const container = qs('#gradesCardContainer');
    if (!container) return;
    
    // Fetch data
    const [submissions, instances, assignments] = await Promise.all([
      db.listSubmissions({ student_code: currentUser.code }),
      db.listAssignmentInstances(),
      db.listAssignments()
    ]);
    
    const myInstances = instances.filter(i => i.student_code === currentUser.code);
    const gradedSubmissions = submissions.filter(s => s.score_total != null);
    
    // Calculate overall average
    const overallAvg = helpers.calculateOverallAverage(submissions);
    
    if (overallAvg === null) {
      container.classList.add('hidden');
      return;
    }
    
    container.classList.remove('hidden');
    
    // Calculate trend
    const trend = helpers.calculateTrend(submissions);
    const trendIcons = { up: '↗', down: '↘', flat: '→' };
    const trendHtml = trend.direction ? 
      `<span class="grade-stat-trend ${trend.direction}">${trendIcons[trend.direction]}</span>` : '';
    
    qs('#overallAverage').textContent = overallAvg;
    qs('#overallTrend').innerHTML = trendHtml;
    
    // Sparkline
    const sparklineData = helpers.getSparklineData(submissions);
    if (sparklineData.length > 0) {
      renderSparkline('#overallSparkline', sparklineData);
    }
    
    // Per-class averages
    const classAverages = helpers.calculateClassAverages(submissions, myInstances, assignments);
    let classHtml = '';
    
    for (const [classId, avg] of Object.entries(classAverages)) {
      classHtml += `
        <div class="grade-stat">
          <div class="grade-stat-label">${classId}</div>
          <div class="grade-stat-value">${avg}%</div>
        </div>
      `;
    }
    
    if (classHtml) {
      qs('#classAverages').innerHTML = classHtml;
    }
    
    // Quarterly Averages (if feature enabled)
    if (feature.portalQuarterAverages !== false) {
      const quarterAverages = helpers.calculateQuarterAverages(submissions);
      let quarterHtml = '<div class="grade-stat"><div class="grade-stat-label">Quarterly Averages</div>';
      
      for (let q = 1; q <= 4; q++) {
        const avg = quarterAverages[`Q${q}`];
        const avgDisplay = avg !== null ? `${avg}%` : '—';
        
        // Get sparkline for quarter
        let sparklineHtml = '';
        if (avg !== null && helpers.getQuarterSparklineData) {
          const qData = helpers.getQuarterSparklineData(submissions, q);
          if (qData.length > 0) {
            const sparklineId = `quarter${q}Sparkline`;
            sparklineHtml = `<svg id="${sparklineId}" class="quarter-sparkline"></svg>`;
            // Render sparkline after DOM update
            setTimeout(() => renderQuarterSparkline(`#${sparklineId}`, qData), 10);
          }
        }
        
        quarterHtml += `
          <div class="assignment-detail-field">
            <span class="assignment-detail-label">Q${q}</span>
            <span class="assignment-detail-value">${avgDisplay}${sparklineHtml}</span>
          </div>
        `;
      }
      
      quarterHtml += '</div>';
      
      const classAveragesEl = qs('#classAverages');
      if (classAveragesEl) {
        classAveragesEl.insertAdjacentHTML('afterend', quarterHtml);
      }
    }
    
    // Graded Assignments List
    if (gradedSubmissions.length > 0) {
      const assignmentMap = new Map(assignments.map(a => [a.id, a]));
      const instanceMap = new Map(myInstances.map(i => [i.id, i]));
      
      let tableHtml = `
        <div class="grade-stat" style="border-bottom:none; padding-top:20px;">
          <div class="grade-stat-label" style="margin-bottom:12px;">Graded Assignments</div>
          
          <!-- Quarter Filter -->
          <div class="quarter-filter">
            <label for="gradeQuarterFilter">Filter by Quarter</label>
            <select id="gradeQuarterFilter" class="btn small" style="width:auto; padding:6px 10px;">
              <option value="">All Quarters</option>
              <option value="1">Q1 (Jan-Mar)</option>
              <option value="2">Q2 (Apr-Jun)</option>
              <option value="3">Q3 (Jul-Sep)</option>
              <option value="4">Q4 (Oct-Dec)</option>
            </select>
          </div>
          
          <table class="graded-assignments-table" id="gradedAssignmentsTable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Assignment</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody id="gradedAssignmentsBody">
            </tbody>
          </table>
        </div>
      `;
      
      const classAveragesEl = qs('#classAverages');
      if (classAveragesEl && classAveragesEl.parentNode) {
        classAveragesEl.parentNode.insertAdjacentHTML('beforeend', tableHtml);
        
        // Render table rows
        renderGradedAssignmentsTable(gradedSubmissions, instanceMap, assignmentMap, helpers);
        
        // Setup quarter filter
        const filterSelect = qs('#gradeQuarterFilter');
        if (filterSelect) {
          filterSelect.addEventListener('change', () => {
            const quarter = filterSelect.value ? parseInt(filterSelect.value) : null;
            const filtered = quarter ? 
              helpers.filterSubmissionsByQuarter(gradedSubmissions, quarter) : 
              gradedSubmissions;
            renderGradedAssignmentsTable(filtered, instanceMap, assignmentMap, helpers);
          });
        }
      }
    }
    
    // Export buttons (if feature enabled)
    if (feature.portalQuarterlyExport !== false) {
      // Show export buttons
      const btnExportCSV = qs('#btnExportGradesCSV');
      const btnExportPDF = qs('#btnExportGradesPDF');
      
      if (btnExportCSV) {
        btnExportCSV.classList.remove('hidden');
        btnExportCSV.addEventListener('click', () => {
          exportGradesCSV(gradedSubmissions, instanceMap, assignmentMap, helpers, quarterAverages);
        });
      }
      
      if (btnExportPDF) {
        btnExportPDF.classList.remove('hidden');
        btnExportPDF.addEventListener('click', () => {
          exportGradesPDF(gradedSubmissions, instanceMap, assignmentMap, helpers, quarterAverages, currentUser);
        });
      }
    }
    
  } catch (err) {
    console.error('Failed to load grades card:', err);
  }
}

/**
 * Render graded assignments table
 */
function renderGradedAssignmentsTable(submissions, instanceMap, assignmentMap, helpers) {
  const tbody = document.querySelector('#gradedAssignmentsBody');
  if (!tbody) return;
  
  // Sort by submitted_at desc
  const sorted = [...submissions].sort((a, b) => 
    new Date(b.submitted_at) - new Date(a.submitted_at)
  );
  
  let html = '';
  for (const submission of sorted) {
    const instance = instanceMap.get(submission.instance_id);
    if (!instance) continue;
    
    const assignment = assignmentMap.get(instance.assignment_id);
    const date = submission.submitted_at ? 
      helpers.formatDateTime(submission.submitted_at, 'date') : '—';
    const className = assignment?.meta?.class_name || assignment?.class_id || 'N/A';
    const title = assignment?.title || 'Unknown';
    const score = submission.score_total != null ? `${submission.score_total}%` : '—';
    
    html += `
      <tr data-instance-id="${instance.id}" style="cursor:pointer;">
        <td>${date}</td>
        <td>${className}</td>
        <td><a href="#assignment/${instance.id}" class="assignment-link">${title}</a></td>
        <td>${score}</td>
      </tr>
    `;
  }
  
  tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center; color:var(--muted);">No graded assignments</td></tr>';
}

/**
 * Render quarter sparkline (small inline version)
 */
function renderQuarterSparkline(selector, data) {
  const svg = document.querySelector(selector);
  if (!svg || data.length === 0) return;
  
  const width = 60;
  const height = 20;
  const padding = 2;
  
  const max = Math.max(...data, 100);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  
  const stepX = width / (data.length - 1 || 1);
  
  let points = '';
  data.forEach((val, i) => {
    const x = i * stepX;
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    points += `${x},${y} `;
  });
  
  svg.innerHTML = `
    <polyline 
      points="${points.trim()}" 
      fill="none" 
      stroke="rgba(34,197,94,0.8)" 
      stroke-width="1.5" 
      stroke-linecap="round" 
      stroke-linejoin="round"
    />
  `;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
}

/**
 * Export grades to CSV with quarterly summary
 */
function exportGradesCSV(submissions, instanceMap, assignmentMap, helpers, quarterAverages) {
  const rows = [];
  
  // Header
  rows.push(['Date', 'Class', 'Assignment', 'Score', 'Quarter']);
  
  // Graded assignments
  const sorted = [...submissions].sort((a, b) => 
    new Date(b.submitted_at) - new Date(a.submitted_at)
  );
  
  for (const submission of sorted) {
    const instance = instanceMap.get(submission.instance_id);
    if (!instance) continue;
    
    const assignment = assignmentMap.get(instance.assignment_id);
    const date = submission.submitted_at ? 
      new Date(submission.submitted_at).toLocaleDateString() : '';
    const className = assignment?.meta?.class_name || assignment?.class_id || 'N/A';
    const title = assignment?.title || 'Unknown';
    const score = submission.score_total != null ? submission.score_total : '';
    const quarter = submission.submitted_at ? `Q${helpers.getQuarter(submission.submitted_at)}` : '';
    
    rows.push([date, className, title, score, quarter]);
  }
  
  // Add quarterly summary
  rows.push([]);
  rows.push(['Quarterly Summary']);
  rows.push(['Quarter', 'Average']);
  
  for (let q = 1; q <= 4; q++) {
    const avg = quarterAverages[`Q${q}`];
    rows.push([`Q${q}`, avg !== null ? avg : 'N/A']);
  }
  
  // Convert to CSV
  const csv = rows.map(row => 
    row.map(cell => {
      const str = String(cell);
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  ).join('\n');
  
  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `grades_export_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export grades to PDF with quarterly summary
 */
function exportGradesPDF(submissions, instanceMap, assignmentMap, helpers, quarterAverages, currentUser) {
  // Simple HTML-based PDF generation (browser print to PDF)
  const sorted = [...submissions].sort((a, b) => 
    new Date(b.submitted_at) - new Date(a.submitted_at)
  );
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Grade Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { margin-bottom: 10px; }
        .meta { color: #666; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f5f5f5; font-weight: bold; }
        .summary { margin-top: 20px; }
        .summary h2 { margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <h1>Grade Report</h1>
      <div class="meta">
        <div><strong>Student:</strong> ${currentUser.name || currentUser.code}</div>
        <div><strong>Generated:</strong> ${new Date().toLocaleDateString()}</div>
      </div>
      
      <h2>Graded Assignments</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Class</th>
            <th>Assignment</th>
            <th>Score</th>
            <th>Quarter</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  for (const submission of sorted) {
    const instance = instanceMap.get(submission.instance_id);
    if (!instance) continue;
    
    const assignment = assignmentMap.get(instance.assignment_id);
    const date = submission.submitted_at ? 
      new Date(submission.submitted_at).toLocaleDateString() : '—';
    const className = assignment?.meta?.class_name || assignment?.class_id || 'N/A';
    const title = assignment?.title || 'Unknown';
    const score = submission.score_total != null ? `${submission.score_total}%` : '—';
    const quarter = submission.submitted_at ? `Q${helpers.getQuarter(submission.submitted_at)}` : '—';
    
    html += `
      <tr>
        <td>${date}</td>
        <td>${className}</td>
        <td>${title}</td>
        <td>${score}</td>
        <td>${quarter}</td>
      </tr>
    `;
  }
  
  html += `
        </tbody>
      </table>
      
      <div class="summary">
        <h2>Quarterly Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Quarter</th>
              <th>Average</th>
            </tr>
          </thead>
          <tbody>
  `;
  
  for (let q = 1; q <= 4; q++) {
    const avg = quarterAverages[`Q${q}`];
    const avgDisplay = avg !== null ? `${avg}%` : 'N/A';
    html += `
      <tr>
        <td>Q${q}</td>
        <td>${avgDisplay}</td>
      </tr>
    `;
  }
  
  html += `
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
  
  // Open in new window for printing
  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
}

/**
 * Render SVG sparkline
 */
function renderSparkline(selector, data) {
  const svg = document.querySelector(selector);
  if (!svg || data.length === 0) return;
  
  const width = svg.clientWidth || 300;
  const height = 30;
  const padding = 2;
  
  const max = Math.max(...data, 100);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  
  const stepX = width / (data.length - 1 || 1);
  
  let points = '';
  data.forEach((val, i) => {
    const x = i * stepX;
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    points += `${x},${y} `;
  });
  
  svg.innerHTML = `
    <polyline 
      points="${points.trim()}" 
      fill="none" 
      stroke="rgba(34,197,94,0.8)" 
      stroke-width="2" 
      stroke-linecap="round" 
      stroke-linejoin="round"
    />
  `;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
}

/**
 * Show toast notification
 */
export function showToast({ title, message, type = 'info', link = null, duration = 8000 }) {
  const container = document.querySelector('#toastContainer');
  if (!container) return;
  
  const toastId = 'toast-' + Date.now();
  
  const linkHtml = link ? 
    `<a class="toast-link" data-toast-link="${toastId}">${link.text}</a>` : '';
  
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-header">
      <div class="toast-title">${title}</div>
      <button class="toast-close" data-toast-close="${toastId}">×</button>
    </div>
    <div class="toast-body">
      ${message}
      ${linkHtml}
    </div>
  `;
  
  container.appendChild(toast);
  
  // Event handlers
  const closeBtn = toast.querySelector(`[data-toast-close="${toastId}"]`);
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      toast.remove();
    });
  }
  
  if (link) {
    const linkEl = toast.querySelector(`[data-toast-link="${toastId}"]`);
    if (linkEl) {
      linkEl.addEventListener('click', () => {
        link.action();
        toast.remove();
      });
    }
  }
  
  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, duration);
  }
}

/**
 * Start the live clock
 */
export function startClock(qs = (sel) => document.querySelector(sel)) {
  const updateClock = () => {
    const clockEl = qs('#portalClock');
    if (!clockEl) return;
    
    const now = new Date();
    const options = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    
    clockEl.textContent = now.toLocaleString('en-US', options);
  };
  
  // Update immediately
  updateClock();
  
  // Update every minute
  return setInterval(updateClock, 60000);
}

/**
 * Setup resubmission handlers
 */
export function setupResubmissionHandlers(db, qs, showToast, loadStudentAssignments) {
  let pendingResubmission = null;
  let isSubmitting = false;
  
  // Event delegation for resubmit buttons
  document.addEventListener('click', async (e) => {
    if (e.target.matches('[data-action="resubmit"]')) {
      e.preventDefault();
      
      const instanceId = e.target.dataset.instanceId;
      const submissionId = e.target.dataset.submissionId;
      
      if (!instanceId || !submissionId) return;
      
      pendingResubmission = { instanceId, submissionId };
      
      // Show modal
      const modal = qs('#resubmitModal');
      if (modal) {
        modal.classList.remove('hidden');
      }
    }
  });
  
  // Cancel resubmission
  const btnCancel = qs('#btnCancelResubmit');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      pendingResubmission = null;
      const modal = qs('#resubmitModal');
      if (modal) modal.classList.add('hidden');
    });
  }
  
  // Confirm resubmission
  const btnConfirm = qs('#btnConfirmResubmit');
  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      if (!pendingResubmission || isSubmitting) return;
      
      isSubmitting = true;
      btnConfirm.disabled = true;
      btnConfirm.textContent = 'Submitting...';
      
      try {
        const result = await db.createResubmission({
          instance_id: pendingResubmission.instanceId,
          original_submission_id: pendingResubmission.submissionId,
          answers: {}
        });
        
        showToast({
          title: 'Resubmission Created',
          message: 'Your resubmission has been created. You can now work on it.',
          type: 'info'
        });
        
        // Reload assignments
        await loadStudentAssignments();
        
      } catch (err) {
        console.error('Resubmission failed:', err);
        showToast({
          title: 'Resubmission Failed',
          message: err.message || 'Failed to create resubmission. Please try again.',
          type: 'warning'
        });
      } finally {
        isSubmitting = false;
        btnConfirm.disabled = false;
        btnConfirm.textContent = 'Confirm Resubmission';
        pendingResubmission = null;
        
        const modal = qs('#resubmitModal');
        if (modal) modal.classList.add('hidden');
      }
    });
  }
}

/**
 * Setup assignment tab switching
 */
export function setupAssignmentTabs(qs, qsa) {
  const tabs = qsa('[data-status-tab]');
  const filterContainer = qs('#assignmentFilters');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.statusTab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show/hide sections
      const sections = qsa('[id$="Section"]');
      sections.forEach(section => {
        section.classList.remove('active');
      });
      
      const targetSection = qs(`#${tabName}Section`);
      if (targetSection) {
        targetSection.classList.add('active');
      }
      
      // Show filters only in All tab
      if (filterContainer) {
        if (tabName === 'all') {
          filterContainer.classList.remove('hidden');
        } else {
          filterContainer.classList.add('hidden');
        }
      }
    });
  });
}

/**
 * Setup filters for All tab
 */
export function setupFilters(qs, helpers, allAssignments, assignmentMap, renderAllSection) {
  const btnApply = qs('#btnApplyFilters');
  const btnClear = qs('#btnClearFilters');
  
  if (btnApply) {
    btnApply.addEventListener('click', () => {
      const filters = {
        status: qs('#filterStatus')?.value ? [qs('#filterStatus').value] : [],
        dueDateFrom: qs('#filterDueFrom')?.value || null,
        dueDateTo: qs('#filterDueTo')?.value || null
      };
      
      const filtered = helpers.filterAssignments(allAssignments, filters);
      renderAllSection(filtered, assignmentMap, qs, helpers, { portalResubmission: true });
    });
  }
  
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (qs('#filterStatus')) qs('#filterStatus').value = '';
      if (qs('#filterDueFrom')) qs('#filterDueFrom').value = '';
      if (qs('#filterDueTo')) qs('#filterDueTo').value = '';
      
      renderAllSection(allAssignments, assignmentMap, qs, helpers, { portalResubmission: true });
    });
  }
}

/**
 * Render assignment detail modal content
 * @param {Object} instance - Assignment instance
 * @param {Object} assignment - Assignment data
 * @param {Object} latestSubmission - Latest submission (or null)
 * @param {Object} feature - Feature flags
 * @param {Object} helpers - Helper functions
 * @returns {Object} HTML strings for title, meta, body, actions
 */
export function renderAssignmentDetail(instance, assignment, latestSubmission, feature, helpers) {
  const title = assignment?.title || 'Assignment';
  const className = assignment?.meta?.class_name || assignment?.class_id || 'N/A';
  const dueDate = instance.due_at ? helpers.formatDateTime(instance.due_at, 'full') : 'No due date';
  
  const meta = `
    <span><strong>Class:</strong> ${className}</span>
    <span><strong>Due:</strong> ${dueDate}</span>
  `;
  
  // Description section
  const description = assignment?.description || assignment?.meta?.description || 'No description available.';
  
  // Submission details
  let submissionHtml = '';
  if (latestSubmission) {
    const submittedAt = latestSubmission.submitted_at ? 
      helpers.formatDateTime(latestSubmission.submitted_at, 'full') : 'Unknown';
    const score = latestSubmission.score_total != null ? 
      `${latestSubmission.score_total}%` : 'Not graded';
    const notes = latestSubmission.notes || 'No notes';
    
    submissionHtml = `
      <div class="assignment-detail-section">
        <div class="assignment-detail-section-title">Latest Submission</div>
        <div class="assignment-detail-field">
          <span class="assignment-detail-label">Submitted</span>
          <span class="assignment-detail-value">${submittedAt}</span>
        </div>
        <div class="assignment-detail-field">
          <span class="assignment-detail-label">Score</span>
          <span class="assignment-detail-value">${score}</span>
        </div>
        <div class="assignment-detail-field">
          <span class="assignment-detail-label">Notes</span>
          <span class="assignment-detail-value" style="max-width:300px; text-align:right;">${notes}</span>
        </div>
      </div>
    `;
  } else {
    submissionHtml = `
      <div class="assignment-detail-section">
        <div class="assignment-detail-section-title">Submission Status</div>
        <div style="color:var(--muted); font-style:italic;">Not yet submitted</div>
      </div>
    `;
  }
  
  // Goal linkage removed - students should not see IEP goal codes
  
  const body = `
    <div class="assignment-detail-section">
      <div class="assignment-detail-section-title">Description</div>
      <div class="assignment-detail-description">${description}</div>
    </div>
    ${submissionHtml}
  `;
  
  // Actions (resubmit button if applicable)
  let actionsHtml = '<button id="assignmentDetailClose2" class="btn">Close</button>';
  
  if (feature.portalResubmission && latestSubmission && latestSubmission.score_total != null) {
    const resubmissionCount = instance.resubmission_count || 0;
    if (resubmissionCount < 1) {
      actionsHtml = `
        <button data-action="resubmit" data-instance-id="${instance.id}" data-submission-id="${latestSubmission.id}" class="btn primary">Resubmit</button>
      ` + actionsHtml;
    }
  }
  
  return { title, meta, body, actions: actionsHtml };
}

/**
 * Open assignment detail modal
 * @param {string} instanceId - Instance ID to open
 * @param {Object} context - Context object with data and helpers
 */
export function openAssignmentDetail(instanceId, context) {
  const { assignmentGroups, submissionsMap, assignmentMap, feature, helpers, currentStatusTab } = context;
  
  // Find the instance in the current status group
  const allGroups = Object.values(assignmentGroups).flat();
  const item = allGroups.find(i => i.instance.id === instanceId);
  
  if (!item) {
    console.warn('[assignment-detail] Instance not found:', instanceId);
    return;
  }
  
  const { instance, latestSubmission } = item;
  const assignment = assignmentMap.get(instance.assignment_id) || {};
  
  // Render modal content
  const content = renderAssignmentDetail(instance, assignment, latestSubmission, feature, helpers);
  
  const modal = document.querySelector('#assignmentDetailModal');
  if (!modal) return;
  
  document.querySelector('#assignmentDetailTitle').textContent = content.title;
  document.querySelector('#assignmentDetailMeta').innerHTML = content.meta;
  document.querySelector('#assignmentDetailBody').innerHTML = content.body;
  document.querySelector('#assignmentDetailActions').innerHTML = content.actions;
  
  // Show modal
  modal.classList.remove('hidden');
  
  // Store current instance for navigation
  modal.dataset.currentInstanceId = instanceId;
  modal.dataset.currentStatusTab = currentStatusTab || 'all';
  
  // Focus trap
  const closeBtn = document.querySelector('#assignmentDetailClose');
  if (closeBtn) closeBtn.focus();
  
  // Update navigation buttons
  updateAssignmentNavigation(context);
}

/**
 * Close assignment detail modal
 */
export function closeAssignmentDetail() {
  const modal = document.querySelector('#assignmentDetailModal');
  if (modal) {
    modal.classList.add('hidden');
    delete modal.dataset.currentInstanceId;
    delete modal.dataset.currentStatusTab;
  }
}

/**
 * Navigate to previous assignment in current status group
 * @param {Object} context - Context object with data and helpers
 */
export function navigatePrevAssignment(context) {
  const modal = document.querySelector('#assignmentDetailModal');
  if (!modal || !modal.dataset.currentInstanceId) return;
  
  const currentId = modal.dataset.currentInstanceId;
  const currentTab = modal.dataset.currentStatusTab || 'all';
  
  const { assignmentGroups } = context;
  
  // Get assignments in current tab
  let assignments;
  if (currentTab === 'all') {
    assignments = Object.values(assignmentGroups).flat();
  } else {
    const statusKey = currentTab.split('-').map((word, i) => 
      i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    assignments = assignmentGroups[statusKey] || [];
  }
  
  const currentIndex = assignments.findIndex(a => a.instance.id === currentId);
  if (currentIndex === -1) return;
  
  // Wrap around to last if at beginning
  const prevIndex = currentIndex === 0 ? assignments.length - 1 : currentIndex - 1;
  const prevInstance = assignments[prevIndex];
  
  if (prevInstance) {
    openAssignmentDetail(prevInstance.instance.id, context);
  }
}

/**
 * Navigate to next assignment in current status group
 * @param {Object} context - Context object with data and helpers
 */
export function navigateNextAssignment(context) {
  const modal = document.querySelector('#assignmentDetailModal');
  if (!modal || !modal.dataset.currentInstanceId) return;
  
  const currentId = modal.dataset.currentInstanceId;
  const currentTab = modal.dataset.currentStatusTab || 'all';
  
  const { assignmentGroups } = context;
  
  // Get assignments in current tab
  let assignments;
  if (currentTab === 'all') {
    assignments = Object.values(assignmentGroups).flat();
  } else {
    const statusKey = currentTab.split('-').map((word, i) => 
      i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    assignments = assignmentGroups[statusKey] || [];
  }
  
  const currentIndex = assignments.findIndex(a => a.instance.id === currentId);
  if (currentIndex === -1) return;
  
  // Wrap around to first if at end
  const nextIndex = currentIndex === assignments.length - 1 ? 0 : currentIndex + 1;
  const nextInstance = assignments[nextIndex];
  
  if (nextInstance) {
    openAssignmentDetail(nextInstance.instance.id, context);
  }
}

/**
 * Update navigation button states
 */
function updateAssignmentNavigation(context) {
  const modal = document.querySelector('#assignmentDetailModal');
  if (!modal || !modal.dataset.currentInstanceId) return;
  
  const currentTab = modal.dataset.currentStatusTab || 'all';
  const { assignmentGroups } = context;
  
  // Get assignments in current tab
  let assignments;
  if (currentTab === 'all') {
    assignments = Object.values(assignmentGroups).flat();
  } else {
    const statusKey = currentTab.split('-').map((word, i) => 
      i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    assignments = assignmentGroups[statusKey] || [];
  }
  
  // Always enable navigation buttons (they wrap around)
  const prevBtn = document.querySelector('#assignmentDetailPrev');
  const nextBtn = document.querySelector('#assignmentDetailNext');
  
  if (prevBtn) prevBtn.disabled = assignments.length <= 1;
  if (nextBtn) nextBtn.disabled = assignments.length <= 1;
}

/**
 * Setup assignment detail modal event handlers
 * @param {Object} context - Context object with data and helpers
 */
export function setupAssignmentDetailHandlers(context) {
  const modal = document.querySelector('#assignmentDetailModal');
  if (!modal) return;
  
  // Close button
  const closeBtn = document.querySelector('#assignmentDetailClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAssignmentDetail);
  }
  
  // Secondary close button
  document.addEventListener('click', (e) => {
    if (e.target.id === 'assignmentDetailClose2') {
      closeAssignmentDetail();
    }
  });
  
  // Navigation buttons
  const prevBtn = document.querySelector('#assignmentDetailPrev');
  const nextBtn = document.querySelector('#assignmentDetailNext');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => navigatePrevAssignment(context));
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => navigateNextAssignment(context));
  }
  
  // Keyboard navigation
  modal.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;
    
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAssignmentDetail();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigatePrevAssignment(context);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateNextAssignment(context);
    }
  });
  
  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeAssignmentDetail();
    }
  });
  
  // Assignment card click delegation
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.assignment-card');
    if (card && !e.target.matches('[data-action]')) {
      const instanceId = card.dataset.instanceId;
      if (instanceId) {
        openAssignmentDetail(instanceId, context);
      }
    }
  });
}

// Helper functions for rendering states

function renderEmptyState(qs) {
  const sections = ['upcoming', 'in-progress', 'late', 'missing', 'submitted', 'graded', 'all'];
  sections.forEach(section => {
    const container = qs(`#${section}Content`);
    if (container) {
      container.innerHTML = '<div class="subtle" style="text-align:center; padding:20px">No assignments yet</div>';
    }
  });
}

function renderErrorState(qs) {
  const sections = ['upcoming', 'in-progress', 'late', 'missing', 'submitted', 'graded', 'all'];
  sections.forEach(section => {
    const container = qs(`#${section}Content`);
    if (container) {
      container.innerHTML = '<div class="subtle" style="text-align:center; padding:20px">Assignments temporarily unavailable.</div>';
    }
  });
}

async function loadStudentAssignmentsSimple(db, currentUser, qs) {
  // Fallback simple rendering when feature is disabled
  const instances = await db.listAssignmentInstances();
  const myInstances = instances.filter(i => i.student_code === currentUser.code);
  
  qs('#assignmentsCount').textContent = myInstances.length;
  
  if (myInstances.length === 0) {
    qs('#upcomingContent').innerHTML = '<div class="subtle" style="text-align:center; padding:20px">No assignments yet</div>';
    return { groups: {}, submissionsMap: {} };
  }
  
  const assignmentList = await db.listAssignments();
  const assignmentMap = new Map(assignmentList.map(a => [a.id, a]));
  
  let html = '<table class="table"><thead><tr><th>Assignment</th><th>Status</th><th>Due</th></tr></thead><tbody>';
  
  for (const inst of myInstances.slice(0, 10)) {
    const assignment = assignmentMap.get(inst.assignment_id);
    const title = assignment ? assignment.title : 'Unknown';
    const status = inst.status || 'Assigned';
    const dueDate = inst.due_at ? new Date(inst.due_at).toLocaleDateString() : '—';
    
    html += `<tr>
      <td>${title}</td>
      <td><span class="badge info">${status}</span></td>
      <td>${dueDate}</td>
    </tr>`;
  }
  
  html += '</tbody></table>';
  qs('#upcomingContent').innerHTML = html;
  
  return { groups: {}, submissionsMap: {} };
}
