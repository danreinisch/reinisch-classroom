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
    
    // Build lookup maps (available to all sections below)
    const assignmentMap = new Map(assignments.map(a => [a.id, a]));
    const instanceMap = new Map(myInstances.map(i => [i.id, i]));
    
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
    
    const overallAvgEl = qs('#overallAverage');
    if (overallAvgEl) overallAvgEl.textContent = overallAvg;
    
    const overallTrendEl = qs('#overallTrend');
    if (overallTrendEl && trend.direction) {
      const trendSpan = document.createElement('span');
      trendSpan.className = `grade-stat-trend ${trend.direction}`;
      trendSpan.textContent = trendIcons[trend.direction] || '';
      overallTrendEl.innerHTML = '';
      overallTrendEl.appendChild(trendSpan);
    }
    
    // Sparkline
    const sparklineData = helpers.getSparklineData(submissions);
    if (sparklineData.length > 0) {
      renderSparkline('#overallSparkline', sparklineData);
    }
    
    // Per-class averages (safe DOM construction)
    const classAverages = helpers.calculateClassAverages(submissions, myInstances, assignments);
    const classAveragesEl = qs('#classAverages');
    if (classAveragesEl && Object.keys(classAverages).length > 0) {
      classAveragesEl.innerHTML = '';
      for (const [classId, avg] of Object.entries(classAverages)) {
        const statDiv = document.createElement('div');
        statDiv.className = 'grade-stat';
        const labelDiv = document.createElement('div');
        labelDiv.className = 'grade-stat-label';
        labelDiv.textContent = classId;
        const valueDiv = document.createElement('div');
        valueDiv.className = 'grade-stat-value';
        valueDiv.textContent = `${avg}%`;
        statDiv.appendChild(labelDiv);
        statDiv.appendChild(valueDiv);
        classAveragesEl.appendChild(statDiv);
      }
    }
    
    // Quarterly Averages (if feature enabled)
    let quarterAverages = {};
    if (feature.portalQuarterAverages !== false) {
      quarterAverages = helpers.calculateQuarterAverages(submissions);
      // School-year quarter labels (Q1=Aug 16–Oct 17, Q2=Oct 18–Dec 19, Q3=Dec 20–Mar 6, Q4=Mar 7–May 20)
      const qLabels = {
        Q1: 'Q1 (Aug 16\u2013Oct 17)',
        Q2: 'Q2 (Oct 18\u2013Dec 19)',
        Q3: 'Q3 (Dec 20\u2013Mar 6)',
        Q4: 'Q4 (Mar 7\u2013May 20)',
      };
      const qContainer = document.createElement('div');
      qContainer.className = 'grade-stat';
      const qLabel = document.createElement('div');
      qLabel.className = 'grade-stat-label';
      qLabel.textContent = 'Quarterly Averages';
      qContainer.appendChild(qLabel);
      
      for (let q = 1; q <= 4; q++) {
        const key = `Q${q}`;
        const avg = quarterAverages[key];
        const avgDisplay = avg !== null ? `${avg}%` : '—';
        
        const field = document.createElement('div');
        field.className = 'assignment-detail-field';
        const fieldLabel = document.createElement('span');
        fieldLabel.className = 'assignment-detail-label';
        fieldLabel.textContent = qLabels[key] || key;
        const fieldValue = document.createElement('span');
        fieldValue.className = 'assignment-detail-value';
        fieldValue.textContent = avgDisplay;
        
        // Inline sparkline for the quarter
        if (avg !== null && helpers.getQuarterSparklineData) {
          const qData = helpers.getQuarterSparklineData(submissions, q);
          if (qData.length > 0) {
            const sparklineId = `quarter${q}Sparkline`;
            const svg = document.createElement('svg');
            svg.id = sparklineId;
            svg.className = 'quarter-sparkline';
            fieldValue.appendChild(svg);
            setTimeout(() => renderQuarterSparkline(`#${sparklineId}`, qData), 10);
          }
        }
        
        field.appendChild(fieldLabel);
        field.appendChild(fieldValue);
        qContainer.appendChild(field);
      }
      
      const classAveragesParent = qs('#classAverages');
      if (classAveragesParent) {
        classAveragesParent.insertAdjacentElement('afterend', qContainer);
      }
    }
    
    // Trend Insights section (week-over-week, score trend, streak)
    if (helpers.calculateWeekOverWeekTrend && helpers.calculateAverageScoreTrend) {
      const weekTrend = helpers.calculateWeekOverWeekTrend(submissions);
      const scoreTrend = helpers.calculateAverageScoreTrend(gradedSubmissions);
      const streakData = helpers.calculateStreakAbove ? helpers.calculateStreakAbove(gradedSubmissions, 80) : { streak: 0, threshold: 80 };
      
      const trendArrows = { up: '↗', down: '↘', flat: '→' };
      
      const trendSection = document.createElement('div');
      trendSection.className = 'grade-stat grade-trend-insights';
      
      const trendHeading = document.createElement('div');
      trendHeading.className = 'grade-stat-label';
      trendHeading.textContent = 'Trend Insights';
      trendSection.appendChild(trendHeading);
      
      // Week-over-week
      const weekRow = document.createElement('div');
      weekRow.className = 'grade-trend-row';
      const weekLabel = document.createElement('span');
      weekLabel.className = 'grade-trend-label';
      weekLabel.textContent = 'This week:';
      const weekVal = document.createElement('span');
      weekVal.className = `grade-trend-value grade-trend-${weekTrend.direction}`;
      weekVal.textContent = `${weekTrend.lastWeekCount} submission${weekTrend.lastWeekCount !== 1 ? 's' : ''} ${trendArrows[weekTrend.direction] || ''}`;
      if (weekTrend.prevWeekCount > 0 || weekTrend.lastWeekCount > 0) {
        const delta = document.createElement('span');
        delta.className = 'grade-trend-delta';
        delta.textContent = ` (${weekTrend.delta >= 0 ? '+' : ''}${weekTrend.delta} vs last week)`;
        weekVal.appendChild(delta);
      }
      weekRow.appendChild(weekLabel);
      weekRow.appendChild(weekVal);
      trendSection.appendChild(weekRow);
      
      // Score trend (only if enough data)
      if (gradedSubmissions.length >= 2) {
        const scoreRow = document.createElement('div');
        scoreRow.className = 'grade-trend-row';
        const scoreLabel = document.createElement('span');
        scoreLabel.className = 'grade-trend-label';
        scoreLabel.textContent = 'Score trend:';
        const scoreText = { up: '↗ Improving', down: '↘ Declining', flat: '→ Steady' };
        const scoreVal = document.createElement('span');
        scoreVal.className = `grade-trend-value grade-trend-${scoreTrend.direction}`;
        scoreVal.textContent = scoreText[scoreTrend.direction] || '→ Steady';
        scoreRow.appendChild(scoreLabel);
        scoreRow.appendChild(scoreVal);
        trendSection.appendChild(scoreRow);
      }
      
      // Streak (only if ≥ 2)
      if (streakData.streak >= 2) {
        const streakRow = document.createElement('div');
        streakRow.className = 'grade-trend-row';
        const streakLabel = document.createElement('span');
        streakLabel.className = 'grade-trend-label';
        streakLabel.textContent = 'Streak:';
        const streakVal = document.createElement('span');
        streakVal.className = 'grade-trend-value grade-trend-streak';
        streakVal.textContent = `\uD83D\uDD25 ${streakData.streak}-assignment streak above ${streakData.threshold}%`;
        streakRow.appendChild(streakLabel);
        streakRow.appendChild(streakVal);
        trendSection.appendChild(streakRow);
      }
      
      // Insert after quarterly averages (or class averages if quarterly disabled)
      const insertAfter = qs('[class*="grade-stat"]:last-of-type') || qs('#classAverages');
      if (insertAfter && insertAfter.parentNode) {
        insertAfter.parentNode.insertBefore(trendSection, insertAfter.nextSibling);
      }
    }
    
    // Graded Assignments List
    if (gradedSubmissions.length > 0) {
      // Build table section using safe DOM construction
      const tableSection = document.createElement('div');
      tableSection.className = 'grade-stat';
      tableSection.style.borderBottom = 'none';
      tableSection.style.paddingTop = '20px';
      
      const sectionLabel = document.createElement('div');
      sectionLabel.className = 'grade-stat-label';
      sectionLabel.style.marginBottom = '12px';
      sectionLabel.textContent = 'Graded Assignments';
      tableSection.appendChild(sectionLabel);
      
      // Quarter Filter (school-year labels)
      const filterDiv = document.createElement('div');
      filterDiv.className = 'quarter-filter';
      const filterLabel = document.createElement('label');
      filterLabel.htmlFor = 'gradeQuarterFilter';
      filterLabel.textContent = 'Filter by Quarter';
      const filterSelect = document.createElement('select');
      filterSelect.id = 'gradeQuarterFilter';
      filterSelect.className = 'btn small';
      filterSelect.style.cssText = 'width:auto; padding:6px 10px;';
      
      const quarterOptions = [
        { value: '', text: 'All Quarters' },
        { value: '1', text: 'Q1 (Aug 16\u2013Oct 17)' },
        { value: '2', text: 'Q2 (Oct 18\u2013Dec 19)' },
        { value: '3', text: 'Q3 (Dec 20\u2013Mar 6)' },
        { value: '4', text: 'Q4 (Mar 7\u2013May 20)' },
      ];
      for (const opt of quarterOptions) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        filterSelect.appendChild(option);
      }
      filterDiv.appendChild(filterLabel);
      filterDiv.appendChild(filterSelect);
      tableSection.appendChild(filterDiv);
      
      // Table
      const table = document.createElement('table');
      table.className = 'graded-assignments-table';
      table.id = 'gradedAssignmentsTable';
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      for (const col of ['Date', 'Quarter', 'Class', 'Assignment', 'Score']) {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      tbody.id = 'gradedAssignmentsBody';
      table.appendChild(tbody);
      tableSection.appendChild(table);
      
      const parentEl = qs('#classAverages');
      if (parentEl && parentEl.parentNode) {
        parentEl.parentNode.appendChild(tableSection);
        
        // Render table rows
        renderGradedAssignmentsTable(gradedSubmissions, instanceMap, assignmentMap, helpers);
        
        // Setup quarter filter
        filterSelect.addEventListener('change', () => {
          const quarter = filterSelect.value ? parseInt(filterSelect.value, 10) : null;
          const filtered = quarter
            ? helpers.filterSubmissionsByQuarter(gradedSubmissions, quarter)
            : gradedSubmissions;
          renderGradedAssignmentsTable(filtered, instanceMap, assignmentMap, helpers);
        });
      }
    }
    
    // Export buttons (if feature enabled)
    if (feature.portalQuarterlyExport !== false) {
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
 * Render graded assignments table using safe DOM construction (no innerHTML with user data)
 */
function renderGradedAssignmentsTable(submissions, instanceMap, assignmentMap, helpers) {
  const tbody = document.querySelector('#gradedAssignmentsBody');
  if (!tbody) return;
  
  // Sort by submitted_at desc
  const sorted = [...submissions].sort((a, b) => 
    new Date(b.submitted_at) - new Date(a.submitted_at)
  );
  
  tbody.innerHTML = '';
  
  if (sorted.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 5;
    emptyCell.style.cssText = 'text-align:center; color:var(--muted);';
    emptyCell.textContent = 'No graded assignments';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    return;
  }
  
  for (const submission of sorted) {
    const instance = instanceMap.get(submission.instance_id);
    if (!instance) continue;
    
    const assignment = assignmentMap.get(instance.assignment_id);
    const dateStr = submission.submitted_at
      ? helpers.formatDateTime(submission.submitted_at, 'date')
      : '—';
    const className = assignment?.meta?.class_name || assignment?.class_id || 'N/A';
    const title = assignment?.title || 'Unknown';
    const scoreNum = submission.score_total != null ? Math.round(submission.score_total) : null;
    const quarterNum = helpers.getQuarter ? helpers.getQuarter(submission.submitted_at) : null;
    const quarterStr = quarterNum ? `Q${quarterNum}` : '—';
    
    const tr = document.createElement('tr');
    tr.setAttribute('data-instance-id', instance.id);
    tr.style.cursor = 'pointer';
    
    const tdDate = document.createElement('td');
    tdDate.textContent = dateStr;
    
    const tdQuarter = document.createElement('td');
    tdQuarter.textContent = quarterStr;
    
    const tdClass = document.createElement('td');
    tdClass.textContent = className;
    
    const tdTitle = document.createElement('td');
    const link = document.createElement('a');
    link.href = `#assignment/${instance.id}`;
    link.className = 'assignment-link';
    link.textContent = title;
    tdTitle.appendChild(link);
    
    const tdScore = document.createElement('td');
    tdScore.textContent = scoreNum !== null ? `${scoreNum}%` : '—';
    
    tr.appendChild(tdDate);
    tr.appendChild(tdQuarter);
    tr.appendChild(tdClass);
    tr.appendChild(tdTitle);
    tr.appendChild(tdScore);
    tbody.appendChild(tr);
  }
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
