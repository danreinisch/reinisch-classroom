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
 * Load and display grades card
 */
export async function loadGradesCard(db, currentUser, qs, helpers) {
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
    
  } catch (err) {
    console.error('Failed to load grades card:', err);
  }
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
export function startClock(qs) {
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
