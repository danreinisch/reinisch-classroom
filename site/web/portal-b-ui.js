/* eslint-disable no-undef */
// Portal B Student Dashboard JavaScript
// Handles assignment grouping, grades, resubmissions, toasts, and UI interactions

import { isRosterLoaded, loadRoster as loadDistrictRoster, translateAndDownload } from '/web/district-translator.js';

/** Book-open SVG icon for class subheaders — static markup, no user data */
const BOOK_OPEN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>';

/**
 * Convert a numeric percentage to a letter grade
 * @param {number} pct - Score percentage (0-100)
 * @returns {string} Letter grade (A, B, C, D, or F)
 */
function percentToLetterGrade(pct) {
  if (pct == null || isNaN(pct)) return '—';
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

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

    // Extract unique class names and populate filter dropdown
    const classNames = new Set();
    for (const instance of myInstances) {
      const assignment = assignmentMap.get(instance.assignment_id);
      const name = assignment?.meta?.class_name || assignment?.class_id || null;
      if (name) classNames.add(name);
    }

    const classFilterSelect = qs('#assignmentClassFilter');
    if (classFilterSelect && classNames.size > 0) {
      // Reset to just the default option
      classFilterSelect.innerHTML = '<option value="">All Classes</option>';
      for (const name of [...classNames].sort()) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        classFilterSelect.appendChild(opt);
      }

      // Replace element to remove any previously attached listeners before adding new one
      const freshSelect = classFilterSelect.cloneNode(true);
      classFilterSelect.parentNode.replaceChild(freshSelect, classFilterSelect);

      // Re-render when filter changes
      freshSelect.addEventListener('change', () => {
        const selectedClass = freshSelect.value;
        const filtered = selectedClass
          ? myInstances.filter(i => {
              const a = assignmentMap.get(i.assignment_id);
              return (a?.meta?.class_name || a?.class_id) === selectedClass;
            })
          : myInstances;
        renderAllSections(filtered, submissionsMap, assignmentMap, qs, helpers, feature);
      });
    }

    renderAllSections(myInstances, submissionsMap, assignmentMap, qs, helpers, feature);

    return { groups: helpers.groupAssignmentsByStatus(myInstances, submissionsMap), submissionsMap };
    
  } catch (err) {
    console.error('Failed to load assignments:', err);
    renderErrorState(qs);
    return { groups: {}, submissionsMap: {} };
  }
}

/**
 * Group and render all status sections
 */
function renderAllSections(instances, submissionsMap, assignmentMap, qs, helpers, feature) {
  const groups = helpers.groupAssignmentsByStatus(instances, submissionsMap);

  renderSection('upcoming', groups[helpers.AssignmentStatus.UPCOMING], assignmentMap, qs, helpers, feature);
  renderSection('in-progress', groups[helpers.AssignmentStatus.IN_PROGRESS], assignmentMap, qs, helpers, feature);
  renderSection('late', groups[helpers.AssignmentStatus.LATE], assignmentMap, qs, helpers, feature);
  renderSection('missing', groups[helpers.AssignmentStatus.MISSING], assignmentMap, qs, helpers, feature);
  renderSection('submitted', groups[helpers.AssignmentStatus.SUBMITTED], assignmentMap, qs, helpers, feature);
  renderSection('graded', groups[helpers.AssignmentStatus.GRADED], assignmentMap, qs, helpers, feature);

  // All section
  const allAssignments = Object.values(groups).flat();
  renderAllSection(allAssignments, assignmentMap, qs, helpers, feature);
}

/**
 * Render a status section, grouping assignments by class name
 */
function renderSection(sectionId, assignments, assignmentMap, qs, helpers, feature) {
  const container = qs(`#${sectionId}Content`);
  if (!container) return;
  
  container.innerHTML = '';
  if (!assignments || assignments.length === 0) {
    // SAFETY: static message — no user data interpolated
    container.innerHTML = '<div class="subtle" style="text-align:center; padding:20px">No assignments in this category</div>';
    return;
  }

  // Group by class name
  const byClass = new Map();
  for (const item of assignments) {
    const assignment = assignmentMap.get(item.instance.assignment_id) || {};
    const className = assignment.meta?.class_name || assignment.class_id || '';
    if (!byClass.has(className)) byClass.set(className, []);
    byClass.get(className).push(item);
  }

  const hasMultipleClasses = byClass.size > 1;

  for (const [className, items] of byClass) {
    if (hasMultipleClasses && className) {
      const subheader = document.createElement('h3');
      subheader.className = 'st-class-subheader';
      subheader.style.display = 'flex';
      subheader.style.alignItems = 'center';
      subheader.style.gap = '6px';
      // Static SVG — no user data interpolated
      const iconSpan = document.createElement('span');
      iconSpan.innerHTML = BOOK_OPEN_SVG;
      iconSpan.style.flexShrink = '0';
      subheader.appendChild(iconSpan);
      subheader.appendChild(document.createTextNode(className));
      container.appendChild(subheader);
    }
    for (const item of items) {
      container.appendChild(renderAssignmentCard(item, assignmentMap, helpers, feature));
    }
  }
}

/**
 * Render the All tab with all assignments, grouped by class name
 */
function renderAllSection(assignments, assignmentMap, qs, helpers, feature) {
  const container = qs('#allContent');
  if (!container) return;
  
  container.innerHTML = '';
  if (!assignments || assignments.length === 0) {
    // SAFETY: static message — no user data interpolated
    container.innerHTML = '<div class="subtle" style="text-align:center; padding:20px">No assignments</div>';
    return;
  }

  // Group by class name
  const byClass = new Map();
  for (const item of assignments) {
    const assignment = assignmentMap.get(item.instance.assignment_id) || {};
    const className = assignment.meta?.class_name || assignment.class_id || '';
    if (!byClass.has(className)) byClass.set(className, []);
    byClass.get(className).push(item);
  }

  const hasMultipleClasses = byClass.size > 1;

  for (const [className, items] of byClass) {
    if (hasMultipleClasses && className) {
      const subheader = document.createElement('h3');
      subheader.className = 'st-class-subheader';
      subheader.style.display = 'flex';
      subheader.style.alignItems = 'center';
      subheader.style.gap = '6px';
      // Static SVG — no user data interpolated
      const iconSpan = document.createElement('span');
      iconSpan.innerHTML = BOOK_OPEN_SVG;
      iconSpan.style.flexShrink = '0';
      subheader.appendChild(iconSpan);
      subheader.appendChild(document.createTextNode(className));
      container.appendChild(subheader);
    }
    for (const item of items) {
      container.appendChild(renderAssignmentCard(item, assignmentMap, helpers, feature));
    }
  }
}

/**
 * Render an assignment card — returns a DOM element (no innerHTML with user data)
 */
function renderAssignmentCard(item, assignmentMap, helpers, feature) {
  const { instance, latestSubmission, status } = item;
  const assignment = assignmentMap.get(instance.assignment_id) || {};
  
  const titleText = helpers.truncateText(assignment.title || 'Unknown Assignment', 60);
  const className = assignment.meta?.class_name || assignment.class_id || 'N/A';
  const dueDate = instance.due_at ? helpers.formatDateTime(instance.due_at, 'date') : '—';
  const statusClass = status.toLowerCase().replace(' ', '-');

  const card = document.createElement('div');
  card.className = 'assignment-card';
  card.dataset.instanceId = instance.id;

  // Header
  const headerDiv = document.createElement('div');
  headerDiv.className = 'assignment-card-header';

  const infoDiv = document.createElement('div');
  const titleDiv = document.createElement('div');
  titleDiv.className = 'assignment-card-title';
  titleDiv.textContent = titleText;
  const metaDiv = document.createElement('div');
  metaDiv.className = 'assignment-card-meta';
  const classSpan = document.createElement('span');
  const classBold = document.createElement('strong');
  classBold.textContent = 'Class:';
  classSpan.appendChild(classBold);
  classSpan.append(' ' + className);
  const dueSpan = document.createElement('span');
  const dueBold = document.createElement('strong');
  dueBold.textContent = 'Due:';
  dueSpan.appendChild(dueBold);
  dueSpan.append(' ' + dueDate);
  metaDiv.appendChild(classSpan);
  metaDiv.appendChild(dueSpan);
  infoDiv.appendChild(titleDiv);
  infoDiv.appendChild(metaDiv);

  const pill = document.createElement('span');
  pill.className = `status-pill ${statusClass}`;
  pill.textContent = status;

  headerDiv.appendChild(infoDiv);
  headerDiv.appendChild(pill);
  card.appendChild(headerDiv);

  // Score (graded)
  if (status === helpers.AssignmentStatus.GRADED && latestSubmission && latestSubmission.score_total != null) {
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'assignment-card-meta';
    const scoreBold = document.createElement('strong');
    scoreBold.textContent = 'Score:';
    scoreDiv.appendChild(scoreBold);
    scoreDiv.append(` ${latestSubmission.score_total}%`);
    card.appendChild(scoreDiv);
  }

  // Submitted date
  if (latestSubmission && latestSubmission.submitted_at) {
    const subDiv = document.createElement('div');
    subDiv.className = 'assignment-card-meta';
    const subBold = document.createElement('strong');
    subBold.textContent = 'Submitted:';
    subDiv.appendChild(subBold);
    subDiv.append(' ' + helpers.formatDateTime(latestSubmission.submitted_at, 'date'));
    card.appendChild(subDiv);
  }

  // Footer
  const footerDiv = document.createElement('div');
  footerDiv.className = 'assignment-card-footer';
  footerDiv.appendChild(document.createElement('div'));
  const footerRight = document.createElement('div');

  if (feature.portalResubmission && status === helpers.AssignmentStatus.GRADED) {
    const resubmissionCount = instance.resubmission_count || 0;
    if (resubmissionCount < 1) {
      const resubBtn = document.createElement('button');
      resubBtn.className = 'btn small primary';
      resubBtn.dataset.action = 'resubmit';
      resubBtn.dataset.instanceId = instance.id;
      resubBtn.dataset.submissionId = latestSubmission?.id;
      resubBtn.textContent = 'Resubmit';
      footerRight.appendChild(resubBtn);
    } else {
      const usedSpan = document.createElement('span');
      usedSpan.className = 'subtle';
      usedSpan.textContent = 'Revision used';
      footerRight.appendChild(usedSpan);
    }
  }

  footerDiv.appendChild(footerRight);
  card.appendChild(footerDiv);

  return card;
}

/**
 * Load and display grades card with quarterly averages and graded assignments
 */
export async function loadGradesCard(db, currentUser, qs, helpers, feature = {}) {
  try {
    const container = qs('#gradesCardContainer');
    if (!container) return;
    
    // Lazily load quarter-utils for dynamic labels (shared by quarterly averages and filter)
    let quarterUtils = null;
    try {
      quarterUtils = await import('/web/quarter-utils.js');
    } catch (_e) { /* fall back to generic labels */ }
    const getQLabel = (key) => {
      try { return quarterUtils ? quarterUtils.getQuarterLabel(key) : key; } catch (_e) { return key; }
    };

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
    if (overallAvgEl) {
      overallAvgEl.textContent = overallAvg;
      // Add letter grade badge next to the numeric average
      const letterGrade = percentToLetterGrade(overallAvg);
      const gradeClass = `st-letter-grade-${letterGrade.toLowerCase().replace('+', '').replace('-', '')}`;
      const badge = document.createElement('span');
      badge.className = `st-letter-grade ${gradeClass}`;
      badge.textContent = letterGrade;
      overallAvgEl.parentNode.appendChild(badge);
    }
    
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
        const gradeKey = percentToLetterGrade(avg).charAt(0).toLowerCase();
        statDiv.className = `grade-stat grade-avg-${gradeKey}`;
        const labelDiv = document.createElement('div');
        labelDiv.className = 'grade-stat-label';
        labelDiv.textContent = classId;
        const valueDiv = document.createElement('div');
        valueDiv.className = 'grade-stat-value';
        valueDiv.textContent = `${avg}%`;
        const letterSpan = document.createElement('span');
        letterSpan.className = `st-letter-grade st-letter-grade-${gradeKey} st-class-avg-letter`;
        letterSpan.textContent = percentToLetterGrade(avg);
        valueDiv.appendChild(letterSpan);
        statDiv.appendChild(labelDiv);
        statDiv.appendChild(valueDiv);
        classAveragesEl.appendChild(statDiv);
      }
    }
    
    // Quarterly Averages (if feature enabled)
    let quarterAverages = {};
    let qContainer = null;
    if (feature.portalQuarterAverages !== false) {
      quarterAverages = helpers.calculateQuarterAverages(submissions);
      qContainer = document.createElement('div');
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
        fieldLabel.textContent = getQLabel(key);
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
        streakVal.textContent = `🔥 ${streakData.streak}-assignment streak above ${streakData.threshold}%`;
        streakRow.appendChild(streakLabel);
        streakRow.appendChild(streakVal);
        trendSection.appendChild(streakRow);
      }
      
      // Insert after quarterly averages (or class averages if quarterly disabled)
      const insertAfter = qContainer || qs('#classAverages');
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
        { value: '1', text: getQLabel('Q1') },
        { value: '2', text: getQLabel('Q2') },
        { value: '3', text: getQLabel('Q3') },
        { value: '4', text: getQLabel('Q4') },
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
      
      // Table (wrapped for mobile horizontal scrolling)
      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'graded-table-wrapper';
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
      tableWrapper.appendChild(table);
      tableSection.appendChild(tableWrapper);
      
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

        // Insert "Export for District" button after the CSV button
        const btnExportDistrict = document.createElement('button');
        btnExportDistrict.id = 'btnExportGradesDistrictCSV';
        btnExportDistrict.className = btnExportCSV.className;
        btnExportDistrict.textContent = '🏫 Export for District';
        btnExportCSV.insertAdjacentElement('afterend', btnExportDistrict);
        btnExportDistrict.addEventListener('click', async () => {
          if (!isRosterLoaded()) {
            await rcAlert(
              'No Roster Loaded',
              'To export with real names, please select your student roster CSV file (code,real_name) in the next dialog.'
            );
            const loaded = await new Promise((resolve) => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv';
              input.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) { resolve(false); return; }
                const text = await file.text();
                const count = loadDistrictRoster(text);
                if (count === 0) {
                  await rcAlert('Empty Roster', 'No valid entries found. The roster CSV must have two columns: code,real_name.');
                  resolve(false);
                } else {
                  resolve(true);
                }
              });
              input.addEventListener('cancel', () => resolve(false));
              input.click();
            });
            if (!loaded) return;
          }

          // Build grades CSV content then translate and download
          const rows = [['Date', 'Class', 'Assignment', 'Score', 'Quarter']];
          const sortedSubs = [...gradedSubmissions].sort((a, b) =>
            new Date(b.submitted_at) - new Date(a.submitted_at)
          );
          for (const submission of sortedSubs) {
            const instance = instanceMap.get(submission.instance_id);
            if (!instance) continue;
            const assignment = assignmentMap.get(instance.assignment_id);
            const date = submission.submitted_at
              ? new Date(submission.submitted_at).toLocaleDateString() : '';
            const className = assignment?.meta?.class_name || assignment?.class_id || 'N/A';
            const title = assignment?.title || 'Unknown';
            const score = submission.score_total != null ? submission.score_total : '';
            const quarter = submission.submitted_at
              ? `Q${helpers.getQuarter(submission.submitted_at)}` : '';
            rows.push([date, className, title, score, quarter]);
          }
          rows.push([], ['Quarterly Summary'], ['Quarter', 'Average']);
          for (let q = 1; q <= 4; q++) {
            const avg = quarterAverages[`Q${q}`];
            rows.push([`Q${q}`, avg !== null ? avg : 'N/A']);
          }
          const csv = rows.map(row =>
            row.map(cell => {
              const str = String(cell);
              return str.includes(',') || str.includes('"')
                ? `"${str.replace(/"/g, '""')}"` : str;
            }).join(',')
          ).join('\n');
          translateAndDownload(
            csv,
            `grades_district_${new Date().toISOString().split('T')[0]}.csv`,
            'text/csv;charset=utf-8;'
          );
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
  
  // SAFETY: static SVG markup with computed coordinates only — no user data
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
  
  // SAFETY: static SVG markup with computed coordinates only — no user data
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
  
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className = `toast ${type}`;

  const header = document.createElement('div');
  header.className = 'toast-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.dataset.toastClose = toastId;
  closeBtn.textContent = '×';
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'toast-body';
  body.textContent = message;

  if (link) {
    const linkEl = document.createElement('a');
    linkEl.className = 'toast-link';
    linkEl.dataset.toastLink = toastId;
    linkEl.textContent = link.text;
    body.appendChild(linkEl);
    linkEl.addEventListener('click', () => {
      link.action();
      toast.remove();
    });
  }

  toast.appendChild(header);
  toast.appendChild(body);
  
  container.appendChild(toast);
  
  // Close button handler
  closeBtn.addEventListener('click', () => {
    toast.remove();
  });
  
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
 * Render assignment detail modal content — returns DOM elements (no innerHTML with user data)
 * @param {Object} instance - Assignment instance
 * @param {Object} assignment - Assignment data
 * @param {Object} latestSubmission - Latest submission (or null)
 * @param {Object} feature - Feature flags
 * @param {Object} helpers - Helper functions
 * @returns {{ title: string, metaEl: DocumentFragment, bodyEl: DocumentFragment, actionsEl: DocumentFragment }}
 */
export function renderAssignmentDetail(instance, assignment, latestSubmission, feature, helpers) {
  const title = assignment?.title || 'Assignment';
  const className = assignment?.meta?.class_name || assignment?.class_id || 'N/A';
  const dueDate = instance.due_at ? helpers.formatDateTime(instance.due_at, 'full') : 'No due date';

  // Meta fragment
  const metaEl = document.createDocumentFragment();
  const classSpan = document.createElement('span');
  const classBold = document.createElement('strong');
  classBold.textContent = 'Class:';
  classSpan.appendChild(classBold);
  classSpan.append(' ' + className);
  const dueSpan = document.createElement('span');
  const dueBold = document.createElement('strong');
  dueBold.textContent = 'Due:';
  dueSpan.appendChild(dueBold);
  dueSpan.append(' ' + dueDate);
  metaEl.appendChild(classSpan);
  metaEl.appendChild(dueSpan);

  // Body fragment
  const bodyEl = document.createDocumentFragment();

  // Description section
  const descSection = document.createElement('div');
  descSection.className = 'assignment-detail-section';
  const descTitle = document.createElement('div');
  descTitle.className = 'assignment-detail-section-title';
  descTitle.textContent = 'Description';
  const descBody = document.createElement('div');
  descBody.className = 'assignment-detail-description';
  descBody.textContent = assignment?.description || assignment?.meta?.description || 'No description available.';
  descSection.appendChild(descTitle);
  descSection.appendChild(descBody);
  bodyEl.appendChild(descSection);

  // Submission details section
  const subSection = document.createElement('div');
  subSection.className = 'assignment-detail-section';
  const subTitle = document.createElement('div');
  subTitle.className = 'assignment-detail-section-title';

  if (latestSubmission) {
    subTitle.textContent = 'Latest Submission';
    subSection.appendChild(subTitle);

    const submittedAt = latestSubmission.submitted_at
      ? helpers.formatDateTime(latestSubmission.submitted_at, 'full') : 'Unknown';
    const scoreText = latestSubmission.score_total != null
      ? `${latestSubmission.score_total}%` : 'Not graded';
    const notesText = latestSubmission.notes || 'No notes';

    const makeField = (labelText, valueText) => {
      const field = document.createElement('div');
      field.className = 'assignment-detail-field';
      const lbl = document.createElement('span');
      lbl.className = 'assignment-detail-label';
      lbl.textContent = labelText;
      const val = document.createElement('span');
      val.className = 'assignment-detail-value';
      val.textContent = valueText;
      field.appendChild(lbl);
      field.appendChild(val);
      return field;
    };

    subSection.appendChild(makeField('Submitted', submittedAt));
    subSection.appendChild(makeField('Score', scoreText));
    const notesField = makeField('Notes', notesText);
    notesField.querySelector('.assignment-detail-value').style.cssText = 'max-width:300px; text-align:right;';
    subSection.appendChild(notesField);
  } else {
    subTitle.textContent = 'Submission Status';
    subSection.appendChild(subTitle);
    const notYet = document.createElement('div');
    notYet.style.cssText = 'color:var(--muted); font-style:italic;';
    notYet.textContent = 'Not yet submitted';
    subSection.appendChild(notYet);
  }
  bodyEl.appendChild(subSection);

  // Actions fragment
  const actionsEl = document.createDocumentFragment();

  if (feature.portalResubmission && latestSubmission && latestSubmission.score_total != null) {
    const resubmissionCount = instance.resubmission_count || 0;
    if (resubmissionCount < 1) {
      const resubBtn = document.createElement('button');
      resubBtn.dataset.action = 'resubmit';
      resubBtn.dataset.instanceId = instance.id;
      resubBtn.dataset.submissionId = latestSubmission.id;
      resubBtn.className = 'btn primary';
      resubBtn.textContent = 'Resubmit';
      actionsEl.appendChild(resubBtn);
    }
  }
  const closeBtn2 = document.createElement('button');
  closeBtn2.id = 'assignmentDetailClose2';
  closeBtn2.className = 'btn';
  closeBtn2.textContent = 'Close';
  actionsEl.appendChild(closeBtn2);

  return { title, metaEl, bodyEl, actionsEl };
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
  const metaEl = document.querySelector('#assignmentDetailMeta');
  if (metaEl) { metaEl.innerHTML = ''; metaEl.appendChild(content.metaEl); }
  const bodyEl = document.querySelector('#assignmentDetailBody');
  if (bodyEl) { bodyEl.innerHTML = ''; bodyEl.appendChild(content.bodyEl); }
  const actionsEl = document.querySelector('#assignmentDetailActions');
  if (actionsEl) { actionsEl.innerHTML = ''; actionsEl.appendChild(content.actionsEl); }
  
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
      // SAFETY: static message — no user data interpolated
      container.innerHTML = '<div class="subtle" style="text-align:center; padding:20px">No assignments yet</div>';
    }
  });
}

function renderErrorState(qs) {
  const sections = ['upcoming', 'in-progress', 'late', 'missing', 'submitted', 'graded', 'all'];
  sections.forEach(section => {
    const container = qs(`#${section}Content`);
    if (container) {
      // SAFETY: static message — no user data interpolated
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
    // SAFETY: static message — no user data interpolated
    qs('#upcomingContent').innerHTML = '<div class="subtle" style="text-align:center; padding:20px">No assignments yet</div>';
    return { groups: {}, submissionsMap: {} };
  }
  
  const assignmentList = await db.listAssignments();
  const assignmentMap = new Map(assignmentList.map(a => [a.id, a]));
  
  const table = document.createElement('table');
  table.className = 'table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of ['Assignment', 'Status', 'Due']) {
    const th = document.createElement('th');
    th.textContent = col;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const inst of myInstances.slice(0, 10)) {
    const assignment = assignmentMap.get(inst.assignment_id);
    const tr = document.createElement('tr');

    const tdTitle = document.createElement('td');
    tdTitle.textContent = assignment ? assignment.title : 'Unknown';

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge info';
    badge.textContent = inst.status || 'Assigned';
    tdStatus.appendChild(badge);

    const tdDue = document.createElement('td');
    tdDue.textContent = inst.due_at ? new Date(inst.due_at).toLocaleDateString() : '—';

    tr.appendChild(tdTitle);
    tr.appendChild(tdStatus);
    tr.appendChild(tdDue);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const upcomingContent = qs('#upcomingContent');
  upcomingContent.innerHTML = '';
  upcomingContent.appendChild(table);
  
  return { groups: {}, submissionsMap: {} };
}
