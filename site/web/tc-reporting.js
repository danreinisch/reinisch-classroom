/**
 * Teacher Center Reporting Module
 * Comprehensive reporting engine for IEP compliance, grades, and admin oversight
 */

(async () => {
  "use strict";

  // Only run on reporting page
  if (!location.pathname.startsWith("/teacher/reporting")) return;

  console.log("[tc-reporting] Initializing reporting engine");

  // Import data adapter and Supabase client
  const { db, isRemote } = await import("/web/data-adapter.js");
  const { getSupabase } = await import("/web/supabase-client.js");
  const { getCurrentQuarter, getQuarterDateRange, getQuarterLabel } = await import("/web/quarter-utils.js");

  // Constants - keep in sync with other teacher pages
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
    "Warrior Academy",
  ];

  // Reserved for future use - display abbreviations for space constraints
  // const CLASS_DISPLAY = {
  //   "Language Arts 1 SC": "LA 1 SC",
  //   "Language Arts 2 SC": "LA 2 SC",
  //   "Language Arts 3 SC": "LA 3 SC",
  //   "Language Arts 4 SC": "LA 4 SC",
  //   "Life Skills Language Arts SC": "Life Skills LA",
  //   "Life Skills": "Life Skills",
  //   "Consumer Math": "Consumer Math",
  //   "Geometry SC": "Geometry SC",
  //   "Speech/Language": "Speech/Language",
  //   "Warrior Academy": "Warrior Academy",
  // };

  // DOM helper
  const $ = (id) => document.getElementById(id);

  // State
  let studentsData = [];
  let goalsData = [];
  let progressData = [];
  let assignmentsData = [];
  let instancesData = [];
  let submissionsData = [];
  let enrollmentsData = [];
  let usingSupabase = false;
  let currentTab = "iep-quarterly";

  // Tab state
  let tab1State = { 
    studentCode: null, 
    quarter: getCurrentQuarter(), 
    template: localStorage.getItem('rc_report_template') || 'iep-progress' 
  };
  let tab2State = { studentCode: null };
  let tab3State = { classFilter: "All Classes", compareQuarters: false };
  let tab4State = { classFilter: "All Classes", quarter: getCurrentQuarter() };
  let tab5State = { quarter: getCurrentQuarter() };

  /**
   * Escape HTML for XSS prevention
   */
  function escapeHtml(text) {
    if (!text && text !== 0) return "";
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  /**
   * Escape XML for DOCX export
   */
  function escapeXml(text) {
    if (!text && text !== 0) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Format date as "Jan 15, 2026"
   */
  function formatDate(dateStr) {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  /**
   * Format date as YYYY-MM-DD
   */
  function formatDateYYYYMMDD(date = new Date()) {
    return date.toISOString().split("T")[0];
  }

  /**
   * Get score color for visual feedback
   */
  function scoreColor(score) {
    if (score == null || isNaN(score)) return "rgba(200,200,200,0.6)";
    if (score >= 80) return "rgba(34,197,94,0.8)";
    if (score >= 60) return "rgba(234,179,8,0.8)";
    return "rgba(239,68,68,0.8)";
  }

  /**
   * Load all data from Supabase or localStorage
   */
  async function loadData() {
    try {
      console.log("[tc-reporting] Loading data...");

      usingSupabase = await isRemote();

      const pillMode = $("pillMode");
      if (pillMode) {
        pillMode.textContent = usingSupabase ? "Supabase" : "Local (browser)";
      }

      // Load all data in parallel
      const [students, goals, assignments, instances, submissions, enrollments] = await Promise.all(
        [
          db.listStudents(),
          db.listGoalsAll ? db.listGoalsAll() : [],
          db.listAssignments ? db.listAssignments() : [],
          db.listAssignmentInstances ? db.listAssignmentInstances() : [],
          db.listSubmissions ? db.listSubmissions() : [],
          db.listClassEnrollments ? db.listClassEnrollments() : [],
        ]
      );

      studentsData = students || [];
      goalsData = goals || [];
      assignmentsData = assignments || [];
      instancesData = instances || [];
      submissionsData = submissions || [];
      enrollmentsData = enrollments || [];

      console.log("[tc-reporting] Data loaded:", {
        students: studentsData.length,
        goals: goalsData.length,
        assignments: assignmentsData.length,
        instances: instancesData.length,
        submissions: submissionsData.length,
      });

      // Update UI
      updateSyncStatus();
      renderCurrentTab();
    } catch (err) {
      console.error("[tc-reporting] Error loading data:", err);
      await rcAlert('Error', 'Error loading data. Please check console for details.');
    }
  }

  /**
   * Update sync status indicator
   */
  function updateSyncStatus() {
    const pillMode = $("pillMode");
    if (pillMode) {
      pillMode.textContent = usingSupabase ? "Supabase" : "Local (browser)";
    }
  }

  /**
   * Switch active tab
   */
  function switchTab(tabId) {
    currentTab = tabId;

    // Update tab buttons
    document.querySelectorAll(".rp-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });

    // Update tab content
    document.querySelectorAll(".rp-tab-content").forEach((content) => {
      content.classList.toggle("active", content.dataset.tab === tabId);
    });

    // Render current tab content
    renderCurrentTab();
  }

  /**
   * Render current active tab
   */
  function renderCurrentTab() {
    switch (currentTab) {
      case "iep-quarterly":
        renderTab1();
        break;
      case "student-summary":
        renderTab2();
        break;
      case "class-performance":
        renderTab3();
        break;
      case "compliance-log":
        renderTab4();
        break;
      case "batch-reports":
        renderTab5();
        break;
    }
  }

  /**
   * Render IEP Progress Report template (detailed)
   */
  function renderIEPProgressTemplate(student, studentGoals, quarterRange) {
    let html = `
      <div class="rp-report-card" id="iepReportCard">
        <div class="rp-report-header">
          <h2>IEP Quarterly Progress Report</h2>
          <div class="rp-report-meta">
            <div><strong>Student:</strong> ${escapeHtml(student.name || student.code)}</div>
            <div><strong>Code:</strong> ${escapeHtml(student.code)}</div>
            <div><strong>Quarter:</strong> ${getQuarterLabel(tab1State.quarter)}</div>
            <div><strong>IEP Due:</strong> ${formatDate(student.iep_due)}</div>
            <div><strong>Eval Due:</strong> ${formatDate(student.eval_due)}</div>
          </div>
        </div>
    `;

    if (studentGoals.length === 0) {
      html += '<div class="rp-empty">No active IEP goals found for this student.</div>';
    } else {
      html += '<div class="rp-goals-section">';

      // Process each goal
      for (const goal of studentGoals) {
        const goalProgressData = getGoalProgressForQuarter(
          goal.code,
          tab1State.studentCode,
          quarterRange
        );
        const prevQuarterRange = getPreviousQuarterRange(tab1State.quarter);
        const prevGoalProgressData = prevQuarterRange
          ? getGoalProgressForQuarter(goal.code, tab1State.studentCode, prevQuarterRange)
          : null;

        const narrative = generateNarrative(student, goal, goalProgressData, prevGoalProgressData);
        const trend = getTrendIndicator(goalProgressData, prevGoalProgressData);

        html += `
          <div class="rp-goal-card">
            <div class="rp-goal-header">
              <div class="rp-goal-title">
                <span class="rp-goal-code">${escapeHtml(goal.code)}</span>
                <span class="rp-goal-area">${escapeHtml(goal.goal_area || "N/A")}</span>
              </div>
              <div class="rp-goal-trend">${trend}</div>
            </div>
            <div class="rp-goal-desc">${escapeHtml(goal.desc || "No description")}</div>
            <div class="rp-goal-targets">
              <div><strong>Baseline:</strong> ${goal.baseline || 0}%</div>
              <div><strong>Target:</strong> ${goal.target || 100}%</div>
              <div><strong>Current:</strong> ${goalProgressData.average != null ? goalProgressData.average.toFixed(0) : "N/A"}%</div>
              <div><strong>Data Points:</strong> ${goalProgressData.count}</div>
            </div>
            <div class="rp-goal-narrative">
              <label><strong>Progress Narrative:</strong></label>
              <textarea class="rp-narrative-edit" data-goal="${escapeHtml(goal.code)}" rows="4">${narrative}</textarea>
            </div>
            <div class="rp-goal-status">
              <label><strong>Progress Status:</strong></label>
              <select class="rp-status-select" data-goal="${escapeHtml(goal.code)}">
                <option value="adequate">Making Adequate Progress</option>
                <option value="insufficient">Progressing but Not Sufficient</option>
                <option value="not-progressing">Not Making Progress</option>
                <option value="met">Goal Met</option>
              </select>
            </div>
            <div style="margin-top: 12px;">
              <button class="tc-btn tc-btn-small copy-spedtrack-btn" data-goal-code="${escapeHtml(goal.code)}" data-student-code="${escapeHtml(student.code)}">
                📋 Copy for SpedTrack
              </button>
            </div>
          </div>
        `;
      }

      html += "</div>";
    }

    // Grades section
    html += renderGradesForQuarter(tab1State.studentCode, quarterRange);

    // Export buttons
    html += `
      <div class="rp-export-actions">
        <button class="tc-btn" id="btnCopyAllSpedTrack" type="button">📋 Copy All Goals for SpedTrack</button>
        <button class="tc-btn" id="btnExportPDF" type="button">📄 Export as PDF</button>
        <button class="tc-btn" id="btnExportDOCX" type="button">📄 Export as DOCX</button>
      </div>
      </div>
    `;

    return html;
  }

  /**
   * Render Parent-Facing Summary template (simplified)
   */
  function renderParentSummaryTemplate(student, studentGoals, quarterRange) {
    let html = `
      <div class="rp-report-card" id="parentReportCard">
        <div class="rp-report-header">
          <h2>Progress Report for ${escapeHtml(student.name || student.code)}</h2>
          <div class="rp-report-meta">
            <div><strong>Reporting Period:</strong> ${getQuarterLabel(tab1State.quarter)}</div>
            <div><strong>Next IEP Review:</strong> ${formatDate(student.iep_due)}</div>
          </div>
        </div>
        <p style="margin: 20px 0; opacity: 0.9;">This report provides an overview of your child's progress on their Individualized Education Program (IEP) goals.</p>
    `;

    if (studentGoals.length === 0) {
      html += '<div class="rp-empty">No active IEP goals found for this student.</div>';
    } else {
      html += '<div class="rp-goals-section">';

      for (const goal of studentGoals) {
        const goalProgressData = getGoalProgressForQuarter(
          goal.code,
          tab1State.studentCode,
          quarterRange
        );
        const prevQuarterRange = getPreviousQuarterRange(tab1State.quarter);
        const prevGoalProgressData = prevQuarterRange
          ? getGoalProgressForQuarter(goal.code, tab1State.studentCode, prevQuarterRange)
          : null;

        // Simplified language
        let statusText = "No data collected yet";
        let statusColor = "#9ca3af";
        
        if (goalProgressData.average != null) {
          const baseline = goal.baseline || 0;
          const target = goal.target || 100;
          const progressRange = target - baseline;
          
          // Avoid division by zero when target equals baseline
          if (progressRange !== 0) {
            const progress = ((goalProgressData.average - baseline) / progressRange) * 100;
            if (progress >= 80) {
              statusText = "Excellent progress";
              statusColor = "#22c55e";
            } else if (progress >= 50) {
              statusText = "Good progress";
              statusColor = "#22c55e";
            } else if (progress >= 0) {
              statusText = "Making progress";
              statusColor = "#fbbf24";
            } else {
              statusText = "Needs support";
              statusColor = "#ef4444";
            }
          } else {
            // When target equals baseline, check if at or above target
            if (goalProgressData.average >= target) {
              statusText = "At target";
              statusColor = "#22c55e";
            } else {
              statusText = "Below target";
              statusColor = "#fbbf24";
            }
          }
        }

        html += `
          <div class="rp-goal-card">
            <h3 style="margin: 0 0 12px 0; font-size: 16px;">${escapeHtml(goal.goal_area || "Goal")}</h3>
            <div style="background: rgba(255,255,255,0.04); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
              <strong>What we're working on:</strong><br/>
              ${escapeHtml(goal.desc || "No description")}
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div><strong>Starting point:</strong> ${goal.baseline || 0}%</div>
              <div><strong>Current:</strong> ${goalProgressData.average != null ? goalProgressData.average.toFixed(0) : "N/A"}%</div>
              <div><strong>Goal:</strong> ${goal.target || 100}%</div>
            </div>
            <div style="padding: 12px; background: rgba(255,255,255,0.04); border-radius: 8px; border-left: 4px solid ${statusColor};">
              <strong style="color: ${statusColor};">${statusText}</strong>
            </div>
            <div style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 8px;">
              <strong>Teacher Comments:</strong><br/>
              <div style="min-height: 60px; margin-top: 8px; font-style: italic; opacity: 0.9;">
                (Add comments here)
              </div>
            </div>
          </div>
        `;
      }

      html += "</div>";
    }

    html += `
      <div class="rp-export-actions">
        <button class="tc-btn" id="btnExportPDF" type="button">📄 Export as PDF</button>
      </div>
      </div>
    `;

    return html;
  }

  /**
   * Render Admin Summary template (compact table format)
   */
  function renderAdminSummaryTemplate(student, studentGoals, quarterRange) {
    let html = `
      <div class="rp-report-card" id="adminReportCard">
        <div class="rp-report-header">
          <h2>Admin Summary — ${escapeHtml(student.code)}</h2>
          <div class="rp-report-meta">
            <div><strong>Student:</strong> ${escapeHtml(student.name || student.code)}</div>
            <div><strong>Quarter:</strong> ${getQuarterLabel(tab1State.quarter)}</div>
            <div><strong>Case Manager:</strong> ${escapeHtml(student.primary_case_manager || "N/A")}</div>
          </div>
        </div>
    `;

    if (studentGoals.length === 0) {
      html += '<div class="rp-empty">No active IEP goals found.</div>';
    } else {
      // Compact table format
      html += `
        <table class="rp-table" style="margin-top: 20px;">
          <thead>
            <tr>
              <th>Goal Code</th>
              <th>Area</th>
              <th>Baseline</th>
              <th>Current</th>
              <th>Target</th>
              <th>Data Points</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const goal of studentGoals) {
        const goalProgressData = getGoalProgressForQuarter(
          goal.code,
          tab1State.studentCode,
          quarterRange
        );
        
        let status = "❌ No Data";
        let rowClass = "";
        
        if (goalProgressData.average != null) {
          if (goalProgressData.average >= (goal.target || 80)) {
            status = "✅ At Target";
            rowClass = "rp-status-good";
          } else if (goalProgressData.average >= (goal.baseline || 0)) {
            status = "⚠️ Progressing";
            rowClass = "rp-status-warning";
          } else {
            status = "🔴 Below Baseline";
            rowClass = "rp-status-critical";
          }
        }

        html += `
          <tr class="${rowClass}">
            <td><strong>${escapeHtml(goal.code)}</strong></td>
            <td>${escapeHtml(goal.goal_area || "N/A")}</td>
            <td>${goal.baseline || 0}%</td>
            <td>${goalProgressData.average != null ? goalProgressData.average.toFixed(0) : "N/A"}%</td>
            <td>${goal.target || 100}%</td>
            <td>${goalProgressData.count}</td>
            <td>${status}</td>
          </tr>
        `;
      }

      html += `
          </tbody>
        </table>
      `;

      // Compliance summary
      const goalsWithData = studentGoals.filter(g => {
        const data = getGoalProgressForQuarter(g.code, student.code, quarterRange);
        return data.count > 0;
      }).length;
      const compliancePercent = studentGoals.length > 0 
        ? Math.round((goalsWithData / studentGoals.length) * 100) 
        : 0;

      html += `
        <div style="margin-top: 20px; padding: 16px; background: rgba(59,130,246,0.15); border-radius: 8px; border: 1px solid rgba(59,130,246,0.35);">
          <strong>Compliance:</strong> ${goalsWithData}/${studentGoals.length} goals with data this quarter 
          (<strong>${compliancePercent}%</strong>)
        </div>
      `;
    }

    html += `
      <div class="rp-export-actions">
        <button class="tc-btn" id="btnExportPDF" type="button">📄 Export as PDF</button>
      </div>
      </div>
    `;

    return html;
  }

  /**
   * Generate SpedTrack format text for a goal
   */
  function generateSpedTrackText(goalCode, studentCode, quarterRange) {
    const goal = goalsData.find(g => g.code === goalCode && g.student_code === studentCode);
    if (!goal) return "";

    const student = studentsData.find(s => s.code === studentCode);
    const goalProgressData = getGoalProgressForQuarter(goalCode, studentCode, quarterRange);
    const dataPoints = getGoalDataPoints(goalCode, studentCode, quarterRange);

    const quarterLabel = getQuarterLabel(tab1State.quarter);
    const quarterDates = getQuarterDateRange(tab1State.quarter);
    const current = goalProgressData.average != null ? goalProgressData.average.toFixed(1) : "N/A";
    const baseline = goal.baseline || "N/A";
    const target = goal.target || "N/A";

    // Calculate trend
    const prevQuarterRange = getPreviousQuarterRange(tab1State.quarter);
    const prevGoalProgressData = prevQuarterRange
      ? getGoalProgressForQuarter(goalCode, studentCode, prevQuarterRange)
      : null;

    let trend = "N/A";
    if (goalProgressData.average != null && prevGoalProgressData?.average != null) {
      const diff = goalProgressData.average - prevGoalProgressData.average;
      if (diff > 0) {
        trend = `Improving (+${diff.toFixed(1)}% over quarter)`;
      } else if (diff < 0) {
        trend = `Declining (${diff.toFixed(1)}% over quarter)`;
      } else {
        trend = "Maintaining (no change)";
      }
    } else if (goalProgressData.average != null) {
      trend = "New data this quarter";
    }

    // Format data points
    const dataPointsStr = dataPoints.length > 0
      ? dataPoints.map(dp => {
          const value = parseFloat(dp.value);
          const formattedValue = !isNaN(value) ? value.toFixed(1) : 'N/A';
          return `${formatDate(dp.date)} (${formattedValue}%)`;
        }).join(', ')
      : "No data collected";

    // Determine status
    let status = "No data collected";
    if (goalProgressData.average != null) {
      if (goalProgressData.average >= (goal.target || 80)) {
        status = "Met mastery criteria";
      } else if (goalProgressData.average >= (goal.baseline || 0)) {
        status = "Progressing toward mastery";
      } else {
        status = "Below baseline — review needed";
      }
    }

    const method = goal.measurement_type || "N/A";

    return `[Goal Code: ${goalCode}] ${goal.goal_area || ""}
Reporting Period: ${quarterLabel} (${formatDateYYYYMMDD(quarterDates.start)} - ${formatDateYYYYMMDD(quarterDates.end)})
Baseline: ${baseline}% | Current: ${current}% | Target: ${target}%
Data Points: ${dataPointsStr}
Trend: ${trend}
Method: ${method}
Status: ${status}`;
  }

  /**
   * Show toast notification
   */
  function showToast(message) {
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

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(() => {
        // Check if toast is still in DOM before removing
        if (toast.parentNode) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  /**
   * TAB 1: IEP Quarterly Progress Report
   */
  function renderTab1() {
    const container = $("tab1Content");
    if (!container) return;

    // Render filters
    const studentsHtml = studentsData
      .filter((s) => s.active !== false)
      .map(
        (s) =>
          `<option value="${escapeHtml(s.code)}" ${s.code === tab1State.studentCode ? "selected" : ""}>${escapeHtml(s.name || s.code)}</option>`
      )
      .join("");

    const filtersHtml = `
      <div class="rp-filters">
        <div class="rp-filter-group">
          <label for="tab1Student">Student:</label>
          <select id="tab1Student" class="rp-select">
            <option value="">-- Select Student --</option>
            ${studentsHtml}
          </select>
        </div>
        <div class="rp-filter-group">
          <label for="tab1Quarter">Quarter:</label>
          <select id="tab1Quarter" class="rp-select">
            <option value="Q1" ${tab1State.quarter === "Q1" ? "selected" : ""}>${getQuarterLabel("Q1")}</option>
            <option value="Q2" ${tab1State.quarter === "Q2" ? "selected" : ""}>${getQuarterLabel("Q2")}</option>
            <option value="Q3" ${tab1State.quarter === "Q3" ? "selected" : ""}>${getQuarterLabel("Q3")}</option>
            <option value="Q4" ${tab1State.quarter === "Q4" ? "selected" : ""}>${getQuarterLabel("Q4")}</option>
          </select>
        </div>
        <div class="rp-filter-group">
          <label for="tab1Template">Report Template:</label>
          <select id="tab1Template" class="rp-select">
            <option value="iep-progress" ${tab1State.template === "iep-progress" ? "selected" : ""}>IEP Progress Report</option>
            <option value="parent-summary" ${tab1State.template === "parent-summary" ? "selected" : ""}>Parent-Facing Summary</option>
            <option value="admin-summary" ${tab1State.template === "admin-summary" ? "selected" : ""}>Admin Summary</option>
          </select>
        </div>
      </div>
    `;

    if (!tab1State.studentCode) {
      container.innerHTML =
        filtersHtml +
        '<div class="rp-empty">Select a student and quarter to view IEP progress report.</div>';

      // Attach event listeners
      const studentSelect = $("tab1Student");
      const quarterSelect = $("tab1Quarter");
      const templateSelect = $("tab1Template");
      if (studentSelect) {
        studentSelect.addEventListener("change", (e) => {
          tab1State.studentCode = e.target.value || null;
          renderTab1();
        });
      }
      if (quarterSelect) {
        quarterSelect.addEventListener("change", (e) => {
          tab1State.quarter = e.target.value;
          renderTab1();
        });
      }
      if (templateSelect) {
        templateSelect.addEventListener("change", (e) => {
          tab1State.template = e.target.value;
          localStorage.setItem('rc_report_template', e.target.value);
          renderTab1();
        });
      }
      return;
    }

    // Load student data
    const student = studentsData.find((s) => s.code === tab1State.studentCode);
    if (!student) {
      container.innerHTML = filtersHtml + '<div class="rp-error">Student not found.</div>';
      return;
    }

    // Get quarter date range
    const quarterRange = getQuarterDateRange(tab1State.quarter);

    // Get student's goals
    const studentGoals = goalsData.filter(
      (g) => g.student_code === tab1State.studentCode && g.status === "active"
    );

    // Render based on template selection
    let reportContent = '';
    switch (tab1State.template) {
      case 'parent-summary':
        reportContent = renderParentSummaryTemplate(student, studentGoals, quarterRange);
        break;
      case 'admin-summary':
        reportContent = renderAdminSummaryTemplate(student, studentGoals, quarterRange);
        break;
      case 'iep-progress':
      default:
        reportContent = renderIEPProgressTemplate(student, studentGoals, quarterRange);
        break;
    }

    // Build report HTML with template content
    let reportHtml = `
      ${filtersHtml}
      ${reportContent}
    `;

    container.innerHTML = reportHtml;

    // Attach event listeners for filters
    const studentSelect = $("tab1Student");
    const quarterSelect = $("tab1Quarter");
    const templateSelect = $("tab1Template");
    if (studentSelect) {
      studentSelect.addEventListener("change", (e) => {
        tab1State.studentCode = e.target.value || null;
        renderTab1();
      });
    }
    if (quarterSelect) {
      quarterSelect.addEventListener("change", (e) => {
        tab1State.quarter = e.target.value;
        renderTab1();
      });
    }
    if (templateSelect) {
      templateSelect.addEventListener("change", (e) => {
        tab1State.template = e.target.value;
        localStorage.setItem('rc_report_template', e.target.value);
        renderTab1();
      });
    }

    // Attach export listeners
    const btnPDF = $("btnExportPDF");
    const btnDOCX = $("btnExportDOCX");
    const btnCopyAllSpedTrack = $("btnCopyAllSpedTrack");
    
    if (btnPDF) {
      btnPDF.addEventListener("click", () => exportReportAsPDF());
    }
    if (btnDOCX) {
      btnDOCX.addEventListener("click", () => exportReportAsDOCX());
    }
    if (btnCopyAllSpedTrack) {
      btnCopyAllSpedTrack.addEventListener("click", () => {
        const allText = studentGoals.map(g => 
          generateSpedTrackText(g.code, tab1State.studentCode, quarterRange)
        ).join('\n\n---\n\n');
        navigator.clipboard.writeText(allText).then(() => {
          showToast('✅ Copied all goals to clipboard!');
        }).catch(async err => {
          console.error('Failed to copy:', err);
          await rcAlert('Error', 'Failed to copy to clipboard');
        });
      });
    }

    // Attach SpedTrack copy listeners
    document.querySelectorAll('.copy-spedtrack-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const goalCode = e.target.dataset.goalCode;
        const studentCode = e.target.dataset.studentCode;
        const text = generateSpedTrackText(goalCode, studentCode, quarterRange);
        navigator.clipboard.writeText(text).then(() => {
          showToast('✅ Copied to clipboard!');
        }).catch(async err => {
          console.error('Failed to copy:', err);
          await rcAlert('Error', 'Failed to copy to clipboard');
        });
      });
    });
  }

  /**
   * Get progress data for a goal in a specific quarter
   */
  function getGoalProgressForQuarter(goalCode, studentCode, quarterRange) {
    if (!quarterRange.start || !quarterRange.end) {
      return { average: null, count: 0, values: [] };
    }

    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);

    // Filter progress data for this goal and quarter
    const relevantProgress = progressData.filter((p) => {
      if (p.goal_code !== goalCode) return false;
      if (p.student_code !== studentCode) return false;
      const pDate = new Date(p.date);
      return pDate >= startDate && pDate <= endDate;
    });

    if (relevantProgress.length === 0) {
      return { average: null, count: 0, values: [] };
    }

    const values = relevantProgress.map((p) => parseFloat(p.value)).filter((v) => !isNaN(v));
    const average =
      values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

    return { average, count: values.length, values };
  }

  /**
   * Get previous quarter range
   */
  function getPreviousQuarterRange(currentQuarter) {
    const quarters = ["Q1", "Q2", "Q3", "Q4"];
    const currentIndex = quarters.indexOf(currentQuarter);
    if (currentIndex <= 0) return null; // No previous quarter in same school year

    const prevQuarter = quarters[currentIndex - 1];
    return getQuarterDateRange(prevQuarter);
  }

  /**
   * Get trend indicator
   */
  function getTrendIndicator(currentData, prevData) {
    if (currentData.average == null) return '<span class="rp-trend-neutral">No Data</span>';
    if (!prevData || prevData.average == null) return '<span class="rp-trend-neutral">—</span>';

    if (currentData.average > prevData.average) {
      return '<span class="rp-trend-up">Improving ↑</span>';
    } else if (currentData.average < prevData.average) {
      return '<span class="rp-trend-down">Declining ↓</span>';
    } else {
      return '<span class="rp-trend-neutral">Maintaining →</span>';
    }
  }

  /**
   * Generate narrative for goal progress
   */
  function generateNarrative(student, goal, quarterData, prevQuarterData) {
    const name = student.name || student.code;
    const avg = quarterData.average != null ? quarterData.average.toFixed(0) : "N/A";
    const baseline = goal.baseline || "N/A";
    const target = goal.target || "N/A";
    const dataPoints = quarterData.count;
    const goalArea = goal.goal_area || goal.code;

    let progressStatement = "";
    if (quarterData.average != null && prevQuarterData?.average != null) {
      if (quarterData.average > prevQuarterData.average) {
        progressStatement = `${name} is making adequate progress toward the annual goal.`;
      } else if (quarterData.average === prevQuarterData.average) {
        progressStatement = `${name} is maintaining current performance levels.`;
      } else {
        progressStatement = `${name} has shown a decline in performance. Consider reviewing supports and interventions.`;
      }
    } else if (quarterData.average != null) {
      progressStatement = `${name} is working toward the annual goal.`;
    } else {
      progressStatement = `Insufficient data collected this quarter to determine progress.`;
    }

    if (quarterData.average != null) {
      return `${name} demonstrated ${avg}% accuracy in ${goalArea}, compared to a baseline of ${baseline}%. Based on ${dataPoints} data point${dataPoints !== 1 ? "s" : ""} collected this quarter, ${progressStatement} Annual goal target: ${target}%.`;
    } else {
      return `${name} has a baseline of ${baseline}% in ${goalArea}. ${progressStatement} Annual goal target: ${target}%.`;
    }
  }

  /**
   * Render grades for a specific quarter
   */
  function renderGradesForQuarter(studentCode, quarterRange) {
    if (!quarterRange.start || !quarterRange.end) {
      return '<div class="rp-grades-section"><h3>Grades This Quarter</h3><div class="rp-empty">Invalid quarter range.</div></div>';
    }

    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);

    // Get student's assignment instances for this quarter
    const studentInstances = instancesData.filter((inst) => {
      if (inst.student_code !== studentCode && inst.student_id !== studentCode) return false;
      if (!inst.assigned_at) return false;
      const assignedDate = new Date(inst.assigned_at);
      return assignedDate >= startDate && assignedDate <= endDate;
    });

    if (studentInstances.length === 0) {
      return '<div class="rp-grades-section"><h3>Grades This Quarter</h3><div class="rp-empty">No assignments found for this quarter.</div></div>';
    }

    // Build grades table
    let html =
      '<div class="rp-grades-section"><h3>Grades This Quarter</h3><table class="rp-table"><thead><tr><th>Assignment</th><th>Due Date</th><th>Status</th><th>Score</th></tr></thead><tbody>';

    let totalScore = 0;
    let scoredCount = 0;
    let submittedCount = 0;

    for (const inst of studentInstances) {
      const assignment = assignmentsData.find((a) => a.id === inst.assignment_id);
      const submission = submissionsData.find((s) => s.instance_id === inst.id);

      const title = assignment?.title || `Assignment ${inst.assignment_id}`;
      const dueDate = formatDate(inst.due_at);
      const status = submission ? "Submitted" : inst.status || "Assigned";
      const score = submission?.score_total != null ? submission.score_total : null;

      if (submission) submittedCount++;
      if (score != null) {
        totalScore += score;
        scoredCount++;
      }

      html += `
        <tr>
          <td>${escapeHtml(title)}</td>
          <td>${escapeHtml(dueDate)}</td>
          <td>${escapeHtml(status)}</td>
          <td style="color: ${scoreColor(score)}">${score != null ? score + "%" : "—"}</td>
        </tr>
      `;
    }

    html += "</tbody></table>";

    // Summary stats
    const avgScore = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : "N/A";
    const completionRate =
      studentInstances.length > 0
        ? ((submittedCount / studentInstances.length) * 100).toFixed(0)
        : "0";

    html += `
      <div class="rp-grades-summary">
        <div><strong>Average Grade:</strong> <span style="color: ${scoreColor(parseFloat(avgScore))}">${avgScore}${avgScore !== "N/A" ? "%" : ""}</span></div>
        <div><strong>Completion Rate:</strong> ${completionRate}% (${submittedCount}/${studentInstances.length})</div>
      </div>
      </div>
    `;

    return html;
  }

  /**
   * Export report as PDF (using browser print)
   */
  async function exportReportAsPDF() {
    // Create a print-friendly version
    const reportCard = $("iepReportCard");
    if (!reportCard) return;

    // Create new window with print-friendly content
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      await rcAlert('Popups Blocked', 'Please allow popups to export PDF');
      return;
    }

    // Clean the HTML content
    const cleanedContent = cleanHtmlForExport(reportCard.innerHTML);
    const generatedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>IEP Progress Report</title>
        <style>
          body { font-family: 'Calibri', Arial, sans-serif; margin: 40px; color: #000; background: #fff; }
          h2 { font-size: 24pt; margin-bottom: 10px; }
          h3 { font-size: 18pt; margin-top: 20px; margin-bottom: 10px; }
          .rp-report-meta { margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .rp-report-meta div { margin: 3px 0; }
          .rp-goal-card { border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; page-break-inside: avoid; }
          .rp-goal-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
          .rp-goal-code { font-weight: bold; margin-right: 10px; }
          .rp-goal-area { color: #666; }
          .rp-goal-desc { margin: 10px 0; }
          .rp-goal-targets { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin: 10px 0; }
          .rp-goal-narrative, .rp-goal-status { margin: 10px 0; }
          .rp-narrative-edit { width: 100%; border: 1px solid #ccc; padding: 8px; font-family: inherit; }
          .rp-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          .rp-table th, .rp-table td { border: 1px solid #000; padding: 8px; text-align: left; }
          .rp-table th { background-color: #f0f0f0; font-weight: bold; }
          .rp-grades-summary { margin: 15px 0; display: flex; gap: 30px; }
          .rp-trend-up { color: green; }
          .rp-trend-down { color: red; }
          .rp-trend-neutral { color: gray; }
        </style>
      </head>
      <body>
        ${cleanedContent}
        <p style="margin-top: 30px; font-size: 10pt; color: #666;"><em>Generated on ${generatedDate}</em></p>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
    }, 500);
  }

  /**
   * Clean HTML content for export by removing interactive elements
   */
  function cleanHtmlForExport(htmlString) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    // Remove all buttons
    tempDiv.querySelectorAll("button").forEach((btn) => btn.remove());

    // Replace select elements with their current selected text
    tempDiv.querySelectorAll("select").forEach((select) => {
      const selectedText = select.options[select.selectedIndex]?.text || "[Dropdown]";
      const span = document.createElement("span");
      span.textContent = selectedText;
      select.replaceWith(span);
    });

    return tempDiv.innerHTML;
  }

  /**
   * Export report as DOCX
   */
  function exportReportAsDOCX() {
    const reportCard = $("iepReportCard");
    if (!reportCard) return;

    const student = studentsData.find((s) => s.code === tab1State.studentCode);
    if (!student) return;

    // Clean the HTML content
    const cleanedContent = cleanHtmlForExport(reportCard.innerHTML);
    const generatedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const htmlContent = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <title>IEP Progress Report</title>
  <style>
    body { font-family: 'Calibri', Arial, sans-serif; margin: 40px; }
    h1 { font-size: 24pt; font-weight: bold; margin-bottom: 20px; }
    h2 { font-size: 18pt; font-weight: bold; margin-top: 20px; margin-bottom: 10px; }
    p { margin: 5px 0; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
    th { background-color: #f0f0f0; font-weight: bold; }
  </style>
</head>
<body>
  ${cleanedContent}
  <p style="margin-top: 30px;"><em>Generated on ${escapeXml(generatedDate)}</em></p>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${student.code}_IEP_Progress_${tab1State.quarter}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("[tc-reporting] DOCX export complete");
  }

  /**
   * TAB 2: Student Summary (One-Pager)
   */
  function renderTab2() {
    const container = $("tab2Content");
    if (!container) return;

    // Render student selector
    const studentsHtml = studentsData
      .filter((s) => s.active !== false)
      .map(
        (s) =>
          `<option value="${escapeHtml(s.code)}" ${s.code === tab2State.studentCode ? "selected" : ""}>${escapeHtml(s.name || s.code)}</option>`
      )
      .join("");

    const filterHtml = `
      <div class="rp-filters">
        <div class="rp-filter-group">
          <label for="tab2Student">Student:</label>
          <select id="tab2Student" class="rp-select">
            <option value="">-- Select Student --</option>
            ${studentsHtml}
          </select>
        </div>
      </div>
    `;

    if (!tab2State.studentCode) {
      container.innerHTML =
        filterHtml + '<div class="rp-empty">Select a student to view summary.</div>';

      const studentSelect = $("tab2Student");
      if (studentSelect) {
        studentSelect.addEventListener("change", (e) => {
          tab2State.studentCode = e.target.value || null;
          renderTab2();
        });
      }
      return;
    }

    const student = studentsData.find((s) => s.code === tab2State.studentCode);
    if (!student) {
      container.innerHTML = filterHtml + '<div class="rp-error">Student not found.</div>';
      return;
    }

    // Get student's goals
    const studentGoals = goalsData.filter((g) => g.student_code === tab2State.studentCode);

    // Get student's classes
    const studentEnrollments = enrollmentsData.filter(
      (e) => e.student_code === tab2State.studentCode
    );
    const studentClasses =
      studentEnrollments.map((e) => e.class_name || "Unknown").join(", ") || "None";

    // Build summary HTML
    let summaryHtml = `
      ${filterHtml}
      <div class="rp-summary-card" id="studentSummaryCard">
        <div class="rp-summary-header">
          <h2>Student Summary: ${escapeHtml(student.name || student.code)}</h2>
          <button class="tc-btn" id="btnPrintSummary" type="button">📄 Print / PDF</button>
        </div>

        <div class="rp-summary-identity">
          <div class="rp-summary-row">
            <div><strong>Student Code:</strong> ${escapeHtml(student.code)}</div>
            <div><strong>Name:</strong> ${escapeHtml(student.name || "N/A")}</div>
          </div>
          <div class="rp-summary-row">
            <div><strong>Classes:</strong> ${escapeHtml(studentClasses)}</div>
          </div>
          <div class="rp-summary-row">
            <div><strong>IEP Due:</strong> ${formatDate(student.iep_due)}</div>
            <div><strong>Eval Due:</strong> ${formatDate(student.eval_due)}</div>
          </div>
        </div>

        <h3>IEP Goals Overview</h3>
    `;

    if (studentGoals.length === 0) {
      summaryHtml += '<div class="rp-empty">No IEP goals found.</div>';
    } else {
      summaryHtml += '<div class="rp-goals-overview">';

      for (const goal of studentGoals) {
        // Get last 10 data points for sparkline
        const goalProgress = progressData
          .filter((p) => p.goal_code === goal.code && p.student_code === tab2State.studentCode)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(-10);

        const latestValue =
          goalProgress.length > 0 ? parseFloat(goalProgress[goalProgress.length - 1].value) : null;
        const sparkline = renderSparkline(goalProgress.map((p) => parseFloat(p.value)));

        summaryHtml += `
          <div class="rp-goal-summary-item">
            <div class="rp-goal-summary-header">
              <span class="rp-goal-code">${escapeHtml(goal.code)}</span>
              <span class="rp-goal-area">${escapeHtml(goal.goal_area || "N/A")}</span>
            </div>
            <div class="rp-goal-summary-stats">
              <div><strong>Baseline:</strong> ${goal.baseline || 0}%</div>
              <div><strong>Latest:</strong> ${latestValue != null ? latestValue.toFixed(0) : "N/A"}%</div>
              <div><strong>Target:</strong> ${goal.target || 100}%</div>
            </div>
            <div class="rp-sparkline">${sparkline}</div>
          </div>
        `;
      }

      summaryHtml += "</div>";
    }

    // Grades overview
    summaryHtml += renderGradesOverview(tab2State.studentCode);

    // Assignment completion
    summaryHtml += renderAssignmentCompletion(tab2State.studentCode);

    // Data collection summary
    summaryHtml += renderDataCollectionSummary(tab2State.studentCode);

    summaryHtml += "</div>";

    container.innerHTML = summaryHtml;

    // Attach event listeners
    const studentSelect = $("tab2Student");
    if (studentSelect) {
      studentSelect.addEventListener("change", (e) => {
        tab2State.studentCode = e.target.value || null;
        renderTab2();
      });
    }

    const btnPrint = $("btnPrintSummary");
    if (btnPrint) {
      btnPrint.addEventListener("click", () => {
        window.print();
      });
    }
  }

  /**
   * Render sparkline SVG
   */
  function renderSparkline(values) {
    if (!values || values.length === 0) {
      return '<svg width="80" height="24"><text x="5" y="16" font-size="10" fill="currentColor">No data</text></svg>';
    }

    const width = 80;
    const height = 24;
    const padding = 2;

    const max = Math.max(...values, 100);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const points = values
      .map((val, i) => {
        const x = padding + (i / (values.length - 1 || 1)) * (width - 2 * padding);
        const y = height - padding - ((val - min) / range) * (height - 2 * padding);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <polyline points="${points}" fill="none" stroke="rgba(59,130,246,0.8)" stroke-width="2"/>
    </svg>`;
  }

  /**
   * Render grades overview
   */
  function renderGradesOverview(studentCode) {
    const studentInstances = instancesData.filter(
      (inst) => inst.student_code === studentCode || inst.student_id === studentCode
    );

    if (studentInstances.length === 0) {
      return '<h3>Grades Overview</h3><div class="rp-empty">No assignments found.</div>';
    }

    let totalScore = 0;
    let scoredCount = 0;

    const gradeRows = studentInstances
      .slice(0, 10)
      .map((inst) => {
        const assignment = assignmentsData.find((a) => a.id === inst.assignment_id);
        const submission = submissionsData.find((s) => s.instance_id === inst.id);

        const title = assignment?.title || `Assignment ${inst.assignment_id}`;
        const score = submission?.score_total;
        const date = formatDate(submission?.submitted_at || inst.assigned_at);

        if (score != null) {
          totalScore += score;
          scoredCount++;
        }

        return `
        <tr>
          <td>${escapeHtml(title)}</td>
          <td style="color: ${scoreColor(score)}">${score != null ? score + "%" : "—"}</td>
          <td>${escapeHtml(date)}</td>
        </tr>
      `;
      })
      .join("");

    const avgScore = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : "N/A";

    return `
      <h3>Grades Overview</h3>
      <div class="rp-grades-stats">
        <div><strong>Overall Average:</strong> <span style="color: ${scoreColor(parseFloat(avgScore))}">${avgScore}${avgScore !== "N/A" ? "%" : ""}</span></div>
      </div>
      <table class="rp-table">
        <thead><tr><th>Assignment</th><th>Score</th><th>Date</th></tr></thead>
        <tbody>${gradeRows}</tbody>
      </table>
    `;
  }

  /**
   * Render assignment completion stats
   */
  function renderAssignmentCompletion(studentCode) {
    const studentInstances = instancesData.filter(
      (inst) => inst.student_code === studentCode || inst.student_id === studentCode
    );

    const totalAssigned = studentInstances.length;
    const submitted = studentInstances.filter((inst) => {
      return submissionsData.some((s) => s.instance_id === inst.id);
    }).length;
    const missing = totalAssigned - submitted;

    const onTime = studentInstances.filter((inst) => {
      const submission = submissionsData.find((s) => s.instance_id === inst.id);
      if (!submission) return false;
      if (!inst.due_at) return true;
      return new Date(submission.submitted_at) <= new Date(inst.due_at);
    }).length;

    const onTimeRate = submitted > 0 ? ((onTime / submitted) * 100).toFixed(0) : "0";

    return `
      <h3>Assignment Completion</h3>
      <div class="rp-completion-stats">
        <div><strong>Total Assigned:</strong> ${totalAssigned}</div>
        <div><strong>Submitted:</strong> ${submitted}</div>
        <div><strong>Missing:</strong> ${missing}</div>
        <div><strong>On-Time Rate:</strong> ${onTimeRate}%</div>
      </div>
      <div class="rp-completion-bar">
        <div class="rp-bar-segment rp-bar-complete" style="width: ${totalAssigned > 0 ? (submitted / totalAssigned) * 100 : 0}%"></div>
        <div class="rp-bar-segment rp-bar-missing" style="width: ${totalAssigned > 0 ? (missing / totalAssigned) * 100 : 0}%"></div>
      </div>
    `;
  }

  /**
   * Render data collection summary
   */
  function renderDataCollectionSummary(studentCode) {
    const studentGoals = goalsData.filter((g) => g.student_code === studentCode);
    const studentProgress = progressData.filter((p) => p.student_code === studentCode);

    const currentQuarter = getCurrentQuarter();
    const quarterRange = getQuarterDateRange(currentQuarter);
    const quarterStart = new Date(quarterRange.start);
    const quarterEnd = new Date(quarterRange.end);

    const quarterProgress = studentProgress.filter((p) => {
      const pDate = new Date(p.date);
      return pDate >= quarterStart && pDate <= quarterEnd;
    });

    const goalBreakdown = studentGoals
      .map((goal) => {
        const goalQuarterData = quarterProgress.filter((p) => p.goal_code === goal.code);
        const latestPoint = studentProgress
          .filter((p) => p.goal_code === goal.code)
          .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        return `
        <tr>
          <td>${escapeHtml(goal.code)}</td>
          <td>${escapeHtml(goal.goal_area || "N/A")}</td>
          <td>${goalQuarterData.length}</td>
          <td>${latestPoint ? parseFloat(latestPoint.value).toFixed(0) + "%" : "N/A"}</td>
        </tr>
      `;
      })
      .join("");

    return `
      <h3>Data Collection Summary</h3>
      <div class="rp-data-stats">
        <div><strong>Total Data Points (All Time):</strong> ${studentProgress.length}</div>
        <div><strong>Data Points This Quarter:</strong> ${quarterProgress.length}</div>
      </div>
      ${
        studentGoals.length > 0
          ? `
        <table class="rp-table">
          <thead><tr><th>Goal</th><th>Area</th><th>Points (Q)</th><th>Latest Value</th></tr></thead>
          <tbody>${goalBreakdown}</tbody>
        </table>
      `
          : '<div class="rp-empty">No goals found.</div>'
      }
    `;
  }

  /**
   * TAB 3: Class Performance Overview
   */
  function renderTab3() {
    const container = $("tab3Content");
    if (!container) return;

    // Render class selector
    const classOptions = ["All Classes", ...CANON_CLASSES]
      .map(
        (cls) =>
          `<option value="${escapeHtml(cls)}" ${cls === tab3State.classFilter ? "selected" : ""}>${escapeHtml(cls)}</option>`
      )
      .join("");

    let html = `
      <div class="rp-filters">
        <div class="rp-filter-group">
          <label for="tab3Class">Class:</label>
          <select id="tab3Class" class="rp-select">
            ${classOptions}
          </select>
        </div>
        <div class="rp-filter-group">
          <label>
            <input type="checkbox" id="tab3CompareQuarters" ${tab3State.compareQuarters ? 'checked' : ''}>
            Compare Quarters
          </label>
        </div>
      </div>
    `;

    // Filter students by class
    let filteredStudents = studentsData.filter((s) => s.active !== false);
    if (tab3State.classFilter !== "All Classes") {
      const classEnrollments = enrollmentsData.filter(
        (e) => e.class_name === tab3State.classFilter
      );
      const enrolledCodes = classEnrollments.map((e) => e.student_code);
      filteredStudents = filteredStudents.filter((s) => enrolledCodes.includes(s.code));
    }

    // Get current quarter for data points metric
    const currentQuarter = getCurrentQuarter();
    const quarterRange = getQuarterDateRange(currentQuarter);

    // Calculate KPIs
    const totalStudents = filteredStudents.length;

    // Calculate average grade
    let totalGradeSum = 0;
    let totalGradeCount = 0;
    filteredStudents.forEach((student) => {
      const studentInstances = instancesData.filter(
        (inst) => inst.student_code === student.code || inst.student_id === student.code
      );
      studentInstances.forEach((inst) => {
        const submission = submissionsData.find((s) => s.instance_id === inst.id);
        if (submission?.score_total != null) {
          totalGradeSum += submission.score_total;
          totalGradeCount++;
        }
      });
    });
    const avgGrade = totalGradeCount > 0 ? (totalGradeSum / totalGradeCount).toFixed(1) : "N/A";

    // Calculate completion rate
    let totalAssigned = 0;
    let totalSubmitted = 0;
    filteredStudents.forEach((student) => {
      const studentInstances = instancesData.filter(
        (inst) => inst.student_code === student.code || inst.student_id === student.code
      );
      totalAssigned += studentInstances.length;
      totalSubmitted += studentInstances.filter((inst) =>
        submissionsData.some((s) => s.instance_id === inst.id)
      ).length;
    });
    const completionRate =
      totalAssigned > 0 ? ((totalSubmitted / totalAssigned) * 100).toFixed(0) : "0";

    // Calculate avg data points per student per goal this quarter
    let totalDataPoints = 0;
    let totalGoals = 0;
    filteredStudents.forEach((student) => {
      const studentGoals = goalsData.filter((g) => g.student_code === student.code);
      totalGoals += studentGoals.length;
      studentGoals.forEach((goal) => {
        const goalData = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
        totalDataPoints += goalData.count;
      });
    });
    const avgDataPoints = totalGoals > 0 ? (totalDataPoints / totalGoals).toFixed(1) : "0";

    // KPI cards
    html += `
      <div class="rp-kpis">
        <div class="rp-kpi-card">
          <div class="rp-kpi-label">Total Students</div>
          <div class="rp-kpi-value">${totalStudents}</div>
        </div>
        <div class="rp-kpi-card">
          <div class="rp-kpi-label">Average Grade</div>
          <div class="rp-kpi-value" style="color: ${scoreColor(parseFloat(avgGrade))}">${avgGrade}${avgGrade !== "N/A" ? "%" : ""}</div>
        </div>
        <div class="rp-kpi-card">
          <div class="rp-kpi-label">Completion Rate</div>
          <div class="rp-kpi-value">${completionRate}%</div>
        </div>
        <div class="rp-kpi-card">
          <div class="rp-kpi-label">Avg Data Points/Goal (Q)</div>
          <div class="rp-kpi-value">${avgDataPoints}</div>
        </div>
      </div>
    `;

    // Assignment performance table
    html += renderAssignmentPerformanceTable(tab3State.classFilter);

    // Student performance table
    html += renderStudentPerformanceTable(filteredStudents, quarterRange);

    // Quarter comparison section (if enabled)
    if (tab3State.compareQuarters) {
      html += renderQuarterComparison(filteredStudents);
    }

    // Export actions
    html += `
      <div class="rp-export-actions">
        <button class="tc-btn" id="btnExportClassCSV" type="button">⬇️ Export CSV</button>
        <button class="tc-btn" id="btnPrintClass" type="button">📄 Print</button>
      </div>
    `;

    container.innerHTML = html;

    // Attach event listeners
    const classSelect = $("tab3Class");
    const compareCheckbox = $("tab3CompareQuarters");
    
    if (classSelect) {
      classSelect.addEventListener("change", (e) => {
        tab3State.classFilter = e.target.value;
        renderTab3();
      });
    }

    if (compareCheckbox) {
      compareCheckbox.addEventListener("change", (e) => {
        tab3State.compareQuarters = e.target.checked;
        renderTab3();
      });
    }

    const btnExportCSV = $("btnExportClassCSV");
    if (btnExportCSV) {
      btnExportCSV.addEventListener("click", () => exportClassPerformanceCSV());
    }

    const btnPrint = $("btnPrintClass");
    if (btnPrint) {
      btnPrint.addEventListener("click", () => window.print());
    }
  }

  /**
   * Render assignment performance table
   */
  function renderAssignmentPerformanceTable(classFilter) {
    // Filter assignments by class if needed
    let relevantAssignments = assignmentsData;
    if (classFilter !== "All Classes") {
      relevantAssignments = assignmentsData.filter((a) => a.class_id === classFilter);
    }

    if (relevantAssignments.length === 0) {
      return '<h3>Assignment Performance</h3><div class="rp-empty">No assignments found.</div>';
    }

    const assignmentStats = relevantAssignments
      .map((assignment) => {
        const instances = instancesData.filter((inst) => inst.assignment_id === assignment.id);
        const submissions = instances
          .map((inst) => submissionsData.find((s) => s.instance_id === inst.id))
          .filter((s) => s);

        const scores = submissions.map((s) => s.score_total).filter((s) => s != null);
        const avgScore =
          scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
        const completionRate =
          instances.length > 0 ? ((submissions.length / instances.length) * 100).toFixed(0) : 0;
        const highest = scores.length > 0 ? Math.max(...scores) : null;
        const lowest = scores.length > 0 ? Math.min(...scores) : null;

        return {
          title: assignment.title || `Assignment ${assignment.id}`,
          avgScore,
          completionRate,
          highest,
          lowest,
          submitted: submissions.length,
        };
      })
      .slice(0, 20); // Limit to 20 for performance

    const rows = assignmentStats
      .map(
        (stat) => `
      <tr>
        <td>${escapeHtml(stat.title)}</td>
        <td style="color: ${scoreColor(stat.avgScore)}">${stat.avgScore != null ? stat.avgScore.toFixed(1) + "%" : "—"}</td>
        <td>${stat.completionRate}%</td>
        <td>${stat.highest != null ? stat.highest + "%" : "—"}</td>
        <td>${stat.lowest != null ? stat.lowest + "%" : "—"}</td>
        <td>${stat.submitted}</td>
      </tr>
    `
      )
      .join("");

    return `
      <h3>Assignment Performance</h3>
      <div class="rp-table-container">
        <table class="rp-table rp-sortable">
          <thead>
            <tr>
              <th>Assignment Title</th>
              <th>Avg Score</th>
              <th>Completion Rate</th>
              <th>Highest</th>
              <th>Lowest</th>
              <th># Submitted</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render student performance table
   */
  function renderStudentPerformanceTable(students, quarterRange) {
    if (students.length === 0) {
      return '<h3>Student Performance</h3><div class="rp-empty">No students found.</div>';
    }

    const studentStats = students.map((student) => {
      const studentInstances = instancesData.filter(
        (inst) => inst.student_code === student.code || inst.student_id === student.code
      );

      const submissions = studentInstances
        .map((inst) => submissionsData.find((s) => s.instance_id === inst.id))
        .filter((s) => s);

      const scores = submissions.map((s) => s.score_total).filter((s) => s != null);
      const avgGrade =
        scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
      const complete = submissions.length;
      const missing = studentInstances.length - submissions.length;

      // Goals on track
      const studentGoals = goalsData.filter((g) => g.student_code === student.code);
      const goalsOnTrack = studentGoals.filter((goal) => {
        const goalData = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
        return goalData.average != null && goalData.average >= (goal.baseline || 0);
      }).length;

      return {
        code: student.code,
        name: student.name || student.code,
        avgGrade,
        complete,
        missing,
        goalsOnTrack,
        totalGoals: studentGoals.length,
      };
    });

    const rows = studentStats
      .map((stat) => {
        const needsAttention = (stat.avgGrade != null && stat.avgGrade < 60) || stat.missing > 2;
        const rowClass = needsAttention ? "rp-row-warning" : "";

        return `
        <tr class="${rowClass}">
          <td>${escapeHtml(stat.code)}</td>
          <td>${escapeHtml(stat.name)}</td>
          <td style="color: ${scoreColor(stat.avgGrade)}">${stat.avgGrade != null ? stat.avgGrade.toFixed(1) + "%" : "—"}</td>
          <td>${stat.complete}</td>
          <td>${stat.missing}</td>
          <td>${stat.goalsOnTrack}/${stat.totalGoals}</td>
        </tr>
      `;
      })
      .join("");

    return `
      <h3>Student Performance</h3>
      <div class="rp-table-container">
        <table class="rp-table rp-sortable">
          <thead>
            <tr>
              <th>Student Code</th>
              <th>Name</th>
              <th>Avg Grade</th>
              <th>Assignments Complete</th>
              <th>Missing</th>
              <th>Goals On Track</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render Quarter Comparison view (B3)
   */
  function renderQuarterComparison(students) {
    if (students.length === 0) {
      return '<h3>📊 Quarter Comparison</h3><div class="rp-empty">No students to compare.</div>';
    }

    let html = '<h3>📊 Quarter Comparison - Goal Progress Across Quarters</h3>';
    
    // Build comparison table
    html += `
      <div class="rp-table-container">
        <table class="rp-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Goal</th>
              <th>Q1 Avg</th>
              <th>Q2 Avg</th>
              <th>Q3 Avg</th>
              <th>Q4 Avg</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const student of students) {
      const studentGoals = goalsData.filter(g => g.student_code === student.code && g.status === 'active');
      
      for (const goal of studentGoals) {
        const q1Data = getGoalProgressForQuarter(goal.code, student.code, getQuarterDateRange('Q1'));
        const q2Data = getGoalProgressForQuarter(goal.code, student.code, getQuarterDateRange('Q2'));
        const q3Data = getGoalProgressForQuarter(goal.code, student.code, getQuarterDateRange('Q3'));
        const q4Data = getGoalProgressForQuarter(goal.code, student.code, getQuarterDateRange('Q4'));

        const q1Avg = q1Data.average != null ? q1Data.average.toFixed(0) + '%' : '—';
        const q2Avg = q2Data.average != null ? q2Data.average.toFixed(0) + '%' : '—';
        const q3Avg = q3Data.average != null ? q3Data.average.toFixed(0) + '%' : '—';
        const q4Avg = q4Data.average != null ? q4Data.average.toFixed(0) + '%' : '—';

        // Calculate trend
        const values = [q1Data.average, q2Data.average, q3Data.average, q4Data.average].filter(v => v != null);
        let trend = '—';
        let trendColor = '#9ca3af';
        
        if (values.length >= 2) {
          const first = values[0];
          const last = values[values.length - 1];
          if (last > first) {
            trend = `↗️ +${(last - first).toFixed(1)}%`;
            trendColor = '#22c55e';
          } else if (last < first) {
            trend = `↘️ ${(last - first).toFixed(1)}%`;
            trendColor = '#ef4444';
          } else {
            trend = '→ No change';
            trendColor = '#fbbf24';
          }
        }

        // Color-code cells based on improvement
        const q1Color = q1Data.average != null ? scoreColor(q1Data.average) : 'inherit';
        const q2Color = q2Data.average != null ? scoreColor(q2Data.average) : 'inherit';
        const q3Color = q3Data.average != null ? scoreColor(q3Data.average) : 'inherit';
        const q4Color = q4Data.average != null ? scoreColor(q4Data.average) : 'inherit';

        html += `
          <tr>
            <td>${escapeHtml(student.code)}</td>
            <td>${escapeHtml(goal.code)}</td>
            <td style="color: ${q1Color}">${q1Avg}</td>
            <td style="color: ${q2Color}">${q2Avg}</td>
            <td style="color: ${q3Color}">${q3Avg}</td>
            <td style="color: ${q4Color}">${q4Avg}</td>
            <td style="color: ${trendColor}; font-weight: 600;">${trend}</td>
          </tr>
        `;
      }
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    return html;
  }

  /**
   * Export class performance as CSV
   */
  function exportClassPerformanceCSV() {
    // Build CSV content
    let csv = "Student Code,Name,Avg Grade,Assignments Complete,Missing,Goals On Track\n";

    // Filter students by class
    let filteredStudents = studentsData.filter((s) => s.active !== false);
    if (tab3State.classFilter !== "All Classes") {
      const classEnrollments = enrollmentsData.filter(
        (e) => e.class_name === tab3State.classFilter
      );
      const enrolledCodes = classEnrollments.map((e) => e.student_code);
      filteredStudents = filteredStudents.filter((s) => enrolledCodes.includes(s.code));
    }

    const currentQuarter = getCurrentQuarter();
    const quarterRange = getQuarterDateRange(currentQuarter);

    filteredStudents.forEach((student) => {
      const studentInstances = instancesData.filter(
        (inst) => inst.student_code === student.code || inst.student_id === student.code
      );

      const submissions = studentInstances
        .map((inst) => submissionsData.find((s) => s.instance_id === inst.id))
        .filter((s) => s);

      const scores = submissions.map((s) => s.score_total).filter((s) => s != null);
      const avgGrade =
        scores.length > 0
          ? (scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(1)
          : "N/A";
      const complete = submissions.length;
      const missing = studentInstances.length - submissions.length;

      const studentGoals = goalsData.filter((g) => g.student_code === student.code);
      const goalsOnTrack = studentGoals.filter((goal) => {
        const goalData = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
        return goalData.average != null && goalData.average >= (goal.baseline || 0);
      }).length;

      csv += `${student.code},"${student.name || student.code}",${avgGrade},${complete},${missing},${goalsOnTrack}/${studentGoals.length}\n`;
    });

    // Download CSV
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `class_performance_${tab3State.classFilter.replace(/\s+/g, "_")}_${formatDateYYYYMMDD()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * TAB 4: Data Collection Compliance Log
   */
  function renderTab4() {
    const container = $("tab4Content");
    if (!container) return;

    // Render filters
    const classOptions = ["All Classes", ...CANON_CLASSES]
      .map(
        (cls) =>
          `<option value="${escapeHtml(cls)}" ${cls === tab4State.classFilter ? "selected" : ""}>${escapeHtml(cls)}</option>`
      )
      .join("");

    let html = `
      <div class="rp-filters">
        <div class="rp-filter-group">
          <label for="tab4Class">Class:</label>
          <select id="tab4Class" class="rp-select">
            ${classOptions}
          </select>
        </div>
        <div class="rp-filter-group">
          <label for="tab4Quarter">Quarter:</label>
          <select id="tab4Quarter" class="rp-select">
            <option value="Q1" ${tab4State.quarter === "Q1" ? "selected" : ""}>${getQuarterLabel("Q1")}</option>
            <option value="Q2" ${tab4State.quarter === "Q2" ? "selected" : ""}>${getQuarterLabel("Q2")}</option>
            <option value="Q3" ${tab4State.quarter === "Q3" ? "selected" : ""}>${getQuarterLabel("Q3")}</option>
            <option value="Q4" ${tab4State.quarter === "Q4" ? "selected" : ""}>${getQuarterLabel("Q4")}</option>
          </select>
        </div>
      </div>
    `;

    // Filter students by class
    let filteredStudents = studentsData.filter((s) => s.active !== false);
    if (tab4State.classFilter !== "All Classes") {
      const classEnrollments = enrollmentsData.filter(
        (e) => e.class_name === tab4State.classFilter
      );
      const enrolledCodes = classEnrollments.map((e) => e.student_code);
      filteredStudents = filteredStudents.filter((s) => enrolledCodes.includes(s.code));
    }

    const quarterRange = getQuarterDateRange(tab4State.quarter);

    // Calculate compliance metrics
    const allGoals = [];
    filteredStudents.forEach((student) => {
      const studentGoals = goalsData.filter(
        (g) => g.student_code === student.code && g.status === "active"
      );
      studentGoals.forEach((goal) => {
        const goalData = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
        allGoals.push({
          studentCode: student.code,
          studentName: student.name || student.code,
          goalCode: goal.code,
          goalArea: goal.goal_area || "N/A",
          dataPoints: goalData.count,
          lastCollected: getLastCollectedDate(goal.code, student.code),
        });
      });
    });

    const totalGoals = allGoals.length;
    const goalsWithAdequateData = allGoals.filter((g) => g.dataPoints >= 3).length;
    const goalsWithNoData = allGoals.filter((g) => g.dataPoints === 0).length;
    const compliancePercent =
      totalGoals > 0 ? ((goalsWithAdequateData / totalGoals) * 100).toFixed(0) : "0";

    // KPI cards
    html += `
      <div class="rp-kpis">
        <div class="rp-kpi-card">
          <div class="rp-kpi-label">Total Active Goals</div>
          <div class="rp-kpi-value">${totalGoals}</div>
        </div>
        <div class="rp-kpi-card">
          <div class="rp-kpi-label">Goals with ≥3 Data Points</div>
          <div class="rp-kpi-value" style="color: rgba(34,197,94,0.8)">${goalsWithAdequateData}</div>
        </div>
        <div class="rp-kpi-card">
          <div class="rp-kpi-label">Goals with No Data</div>
          <div class="rp-kpi-value" style="color: rgba(239,68,68,0.8)">${goalsWithNoData}</div>
        </div>
        <div class="rp-kpi-card">
          <div class="rp-kpi-label">Compliance %</div>
          <div class="rp-kpi-value">${compliancePercent}%</div>
        </div>
      </div>
    `;

    // Compliance table
    // Sort by data points ascending (least data collection first) to highlight gaps
    const complianceRows = allGoals
      .sort((a, b) => a.dataPoints - b.dataPoints)
      .map((goal) => {
        let status, statusClass;
        if (goal.dataPoints >= 3) {
          status = "✅ On Track";
          statusClass = "rp-status-good";
        } else if (goal.dataPoints > 0) {
          status = "⚠️ Needs Data";
          statusClass = "rp-status-warning";
        } else {
          status = "❌ No Data";
          statusClass = "rp-status-critical";
        }

        return `
          <tr class="${statusClass}">
            <td>${escapeHtml(goal.studentCode)}</td>
            <td>${escapeHtml(goal.studentName)}</td>
            <td>${escapeHtml(goal.goalCode)}</td>
            <td>${escapeHtml(goal.goalArea)}</td>
            <td>${goal.dataPoints}</td>
            <td>${escapeHtml(goal.lastCollected)}</td>
            <td>${status}</td>
          </tr>
        `;
      })
      .join("");

    html += `
      <h3>Compliance Table</h3>
      <div class="rp-table-container">
        <table class="rp-table">
          <thead>
            <tr>
              <th>Student Code</th>
              <th>Student Name</th>
              <th>Goal Code</th>
              <th>Goal Area</th>
              <th>Data Points (Q)</th>
              <th>Last Collected</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${complianceRows}</tbody>
        </table>
      </div>
    `;

    // Gaps list
    const gaps = allGoals.filter((g) => g.dataPoints === 0);
    if (gaps.length > 0) {
      html += `
        <div class="rp-gaps-section">
          <h3>⚠️ ${gaps.length} goal${gaps.length !== 1 ? "s" : ""} need data collection:</h3>
          <ul>
            ${gaps.map((g) => `<li><strong>${escapeHtml(g.studentCode)}</strong> (${escapeHtml(g.studentName)}) — <strong>${escapeHtml(g.goalCode)}:</strong> ${escapeHtml(g.goalArea)} — last collected: ${escapeHtml(g.lastCollected)}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    // Grade completion gaps
    html += renderGradeCompletionGaps(filteredStudents);

    // Export actions
    html += `
      <div class="rp-export-actions">
        <button class="tc-btn" id="btnExportComplianceCSV" type="button">⬇️ Export CSV</button>
        <button class="tc-btn" id="btnPrintCompliance" type="button">📄 Print</button>
      </div>
    `;

    container.innerHTML = html;

    // Attach event listeners
    const classSelect = $("tab4Class");
    const quarterSelect = $("tab4Quarter");
    if (classSelect) {
      classSelect.addEventListener("change", (e) => {
        tab4State.classFilter = e.target.value;
        renderTab4();
      });
    }
    if (quarterSelect) {
      quarterSelect.addEventListener("change", (e) => {
        tab4State.quarter = e.target.value;
        renderTab4();
      });
    }

    const btnExportCSV = $("btnExportComplianceCSV");
    if (btnExportCSV) {
      btnExportCSV.addEventListener("click", () => exportComplianceCSV());
    }

    const btnPrint = $("btnPrintCompliance");
    if (btnPrint) {
      btnPrint.addEventListener("click", () => window.print());
    }
  }

  /**
   * Get last collected date for a goal
   */
  function getLastCollectedDate(goalCode, studentCode) {
    const goalProgress = progressData
      .filter((p) => p.goal_code === goalCode && p.student_code === studentCode)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (goalProgress.length === 0) return "never";
    return formatDate(goalProgress[0].date);
  }

  /**
   * Render grade completion gaps
   */
  function renderGradeCompletionGaps(students) {
    const gaps = [];

    students.forEach((student) => {
      const studentInstances = instancesData.filter(
        (inst) =>
          (inst.student_code === student.code || inst.student_id === student.code) &&
          inst.status !== "Graded"
      );

      studentInstances.forEach((inst) => {
        const submission = submissionsData.find((s) => s.instance_id === inst.id);
        if (!submission) {
          const assignment = assignmentsData.find((a) => a.id === inst.assignment_id);
          gaps.push({
            studentCode: student.code,
            assignmentTitle: assignment?.title || `Assignment ${inst.assignment_id}`,
            assignedDate: formatDate(inst.assigned_at),
            dueDate: formatDate(inst.due_at),
            status: "Missing",
          });
        }
      });
    });

    if (gaps.length === 0) {
      return '<h3>Grade Completion Gaps</h3><div class="rp-empty">No missing assignments found.</div>';
    }

    const rows = gaps
      .slice(0, 20)
      .map(
        (gap) => `
      <tr>
        <td>${escapeHtml(gap.studentCode)}</td>
        <td>${escapeHtml(gap.assignmentTitle)}</td>
        <td>${escapeHtml(gap.assignedDate)}</td>
        <td>${escapeHtml(gap.dueDate)}</td>
        <td class="rp-status-critical">${escapeHtml(gap.status)}</td>
      </tr>
    `
      )
      .join("");

    return `
      <h3>Grade Completion Gaps</h3>
      <div class="rp-table-container">
        <table class="rp-table">
          <thead>
            <tr>
              <th>Student Code</th>
              <th>Assignment</th>
              <th>Assigned Date</th>
              <th>Due Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * Export compliance data as CSV
   */
  function exportComplianceCSV() {
    let csv =
      "Student Code,Student Name,Goal Code,Goal Area,Data Points (Q),Last Collected,Status\n";

    // Filter students by class
    let filteredStudents = studentsData.filter((s) => s.active !== false);
    if (tab4State.classFilter !== "All Classes") {
      const classEnrollments = enrollmentsData.filter(
        (e) => e.class_name === tab4State.classFilter
      );
      const enrolledCodes = classEnrollments.map((e) => e.student_code);
      filteredStudents = filteredStudents.filter((s) => enrolledCodes.includes(s.code));
    }

    const quarterRange = getQuarterDateRange(tab4State.quarter);

    filteredStudents.forEach((student) => {
      const studentGoals = goalsData.filter(
        (g) => g.student_code === student.code && g.status === "active"
      );
      studentGoals.forEach((goal) => {
        const goalData = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
        const lastCollected = getLastCollectedDate(goal.code, student.code);
        let status;
        if (goalData.count >= 3) {
          status = "On Track";
        } else if (goalData.count > 0) {
          status = "Needs Data";
        } else {
          status = "No Data";
        }

        csv += `${student.code},"${student.name || student.code}",${goal.code},"${goal.goal_area || "N/A"}",${goalData.count},${lastCollected},${status}\n`;
      });
    });

    // Download CSV
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance_log_${tab4State.quarter}_${formatDateYYYYMMDD()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * TAB 5: Batch Reports - Generate Quarterly Progress Reports for All Students
   */
  function renderTab5() {
    // Set quarter selector to current quarter
    const quarterSelect = $("batchQuarterSelect");
    if (quarterSelect && !quarterSelect.value) {
      quarterSelect.value = tab5State.quarter;
    }

    // Setup event listeners if not already done
    const generateBtn = $("generateBatchReportsBtn");
    if (generateBtn && !generateBtn.dataset.listenerAttached) {
      generateBtn.addEventListener("click", generateBatchReports);
      generateBtn.dataset.listenerAttached = "true";
    }

    if (quarterSelect && !quarterSelect.dataset.listenerAttached) {
      quarterSelect.addEventListener("change", (e) => {
        tab5State.quarter = e.target.value;
      });
      quarterSelect.dataset.listenerAttached = "true";
    }
  }

  /**
   * Generate batch quarterly progress reports for all students
   */
  async function generateBatchReports() {
    const quarter = tab5State.quarter;
    const quarterRange = getQuarterDateRange(quarter);
    const quarterLabel = getQuarterLabel(quarter);

    // Get school year
    const now = new Date();
    const month = now.getMonth() + 1;
    const schoolYear = month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const schoolYearLabel = `${schoolYear} - ${schoolYear + 1}`;

    // Get all active students
    const activeStudents = studentsData.filter((s) => s.active !== false);

    if (activeStudents.length === 0) {
      await rcAlert('No Data', 'No active students found.');
      return;
    }

    // Generate HTML for all students
    let allStudentReportsHTML = "";

    activeStudents.forEach((student, index) => {
      // Get student's goals
      const studentGoals = goalsData.filter(
        (g) => g.student_code === student.code && g.status === "active"
      );

      if (studentGoals.length === 0) {
        // Skip students with no goals
        return;
      }

      // Get student's grade from enrollments
      const enrollment = enrollmentsData.find((e) => e.student_code === student.code);
      const grade = enrollment?.class_name || "N/A";

      // Start student section with page break (except for first student)
      const pageBreakStyle = index > 0 ? "page-break-before: always;" : "";
      allStudentReportsHTML += `
        <div class="student-section" style="${pageBreakStyle}">
          <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px; display: flex; justify-content: space-between;">
            <span>Student Name: ${escapeHtml(student.name || student.code)}</span>
            <span>Grade: ${escapeHtml(grade)}</span>
          </div>
          <div style="font-size: 18px; font-weight: bold; margin-bottom: 20px;">
            Progress for ${escapeHtml(quarter)} Quarter of their ${escapeHtml(schoolYearLabel)} School Year
          </div>
      `;

      // Generate report for each goal
      studentGoals.forEach((goal) => {
        const goalProgress = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
        const dataPoints = getGoalDataPoints(goal.code, student.code, quarterRange);

        // Calculate min, max for narrative
        const values = dataPoints.map((dp) => parseFloat(dp.value) || 0);
        const minValue = values.length > 0 ? Math.min(...values) : 0;
        const maxValue = values.length > 0 ? Math.max(...values) : 0;

        // Generate narrative
        const narrative = generateProgressNarrative(
          student.name || student.code,
          goal,
          quarter,
          goalProgress.average,
          minValue,
          maxValue
        );

        allStudentReportsHTML += `
          <div style="border-bottom: 2px solid #000; margin: 20px 0; padding-bottom: 20px;">
            <div style="margin-bottom: 12px;">
              <strong>Goal Code:</strong> ${escapeHtml(goal.code)}
            </div>
            
            <div style="margin-bottom: 12px;">
              <strong>Goal Area:</strong> ${escapeHtml(goal.goal_area || "N/A")}
            </div>
            
            <div style="margin-bottom: 12px;">
              <strong>Goal Description:</strong><br/>
              ${escapeHtml(goal.desc || "N/A")}
            </div>
            
            <div style="margin-bottom: 12px;">
              <strong>Baseline:</strong> ${escapeHtml(goal.baseline || "N/A")}% &nbsp;&nbsp;&nbsp;&nbsp;
              <strong>Target/Mastery:</strong> ${escapeHtml(goal.target || "N/A")}%
            </div>
            
            <div style="margin-bottom: 12px;">
              <strong>Average of progress for the quarter:</strong> ${goalProgress.average}%<br/>
              (Based on ${goalProgress.count} data point${goalProgress.count !== 1 ? "s" : ""} collected)
            </div>
            
            <div style="margin-bottom: 12px;">
              <strong>Snapshot of data collected:</strong><br/>
              ${generateDataPointsList(dataPoints)}
            </div>
            
            <div style="margin-bottom: 12px;">
              <strong>Description of progress supporting selected summary statement:</strong><br/>
              ${escapeHtml(narrative)}
            </div>
          </div>
        `;
      });

      allStudentReportsHTML += `</div>`; // Close student section
    });

    // Open print window
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      await rcAlert('Popups Blocked', 'Please allow popups to generate reports');
      return;
    }

    const generatedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Quarterly Progress Reports - ${quarterLabel}</title>
        <style>
          body { 
            font-family: 'Calibri', Arial, sans-serif; 
            margin: 40px; 
            color: #000; 
            background: #fff; 
            font-size: 14px;
            line-height: 1.5;
          }
          .print-header {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #000;
          }
          .print-header h1 {
            margin: 0 0 10px 0;
            font-size: 24px;
          }
          .print-btn {
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 10px 20px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
          .print-btn:hover {
            background: #2563eb;
          }
          .student-section {
            margin-bottom: 40px;
          }
          @media print {
            .print-btn {
              display: none;
            }
            .student-section {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
        
        <div class="print-header">
          <h1>Quarterly Progress Reports</h1>
          <div><strong>Quarter:</strong> ${quarterLabel}</div>
          <div><strong>School Year:</strong> ${schoolYearLabel}</div>
          <div><strong>Generated:</strong> ${generatedDate}</div>
        </div>

        ${allStudentReportsHTML}
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  /**
   * Get goal data points for a quarter
   */
  function getGoalDataPoints(goalCode, studentCode, quarterRange) {
    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);

    const dataPoints = progressData.filter((p) => {
      if (p.goal_code !== goalCode) return false;
      if (p.student_code !== studentCode) return false;
      const pDate = new Date(p.date);
      return pDate >= startDate && pDate <= endDate;
    });

    // Sort by date
    dataPoints.sort((a, b) => new Date(a.date) - new Date(b.date));

    return dataPoints;
  }

  /**
   * Generate formatted list of data points
   */
  function generateDataPointsList(dataPoints) {
    if (dataPoints.length === 0) {
      return "No data collected for this quarter.";
    }

    return dataPoints
      .map((dp, index) => {
        const date = formatDate(dp.date);
        const value = parseFloat(dp.value) || 0;
        const source = dp.source || "Manual entry";
        return `${index + 1}. ${date} — ${value}% (${source})`;
      })
      .join("<br/>\n    ");
  }

  /**
   * Generate progress narrative
   */
  function generateProgressNarrative(studentName, goal, quarter, avgValue, minValue, maxValue) {
    const firstName = studentName.split(" ")[0];

    // Restate goal in past tense - simple heuristic
    // Note: This is a basic conversion that removes modal verbs but doesn't add proper past tense
    // Teachers can manually edit the narrative as needed in the generated report
    let goalPastTense = goal.desc || "";
    if (goalPastTense) {
      goalPastTense = goalPastTense
        .replace(/will be able to/gi, "")
        .replace(/will /gi, "")
        .replace(/can /gi, "")
        .trim();
    }

    // Handle empty goal descriptions
    if (!goalPastTense) {
      goalPastTense = "work on their IEP goal";
    }

    const narrative = `${firstName} was able to ${goalPastTense}. During the ${quarter} quarter, ${firstName}'s scores ranged from ${minValue}% to ${maxValue}%, with an average of ${avgValue}%.`;

    return narrative;
  }

  /**
   * Initialize the reporting module
   */
  async function init() {
    console.log("[tc-reporting] Initializing...");

    // Check if Supabase is configured
    const supabase = getSupabase();
    if (!supabase) {
      const mainContent = document.querySelector(".tc-main");
      if (mainContent) {
        mainContent.innerHTML =
          '<div class="rp-error">Reporting requires Supabase. Please configure your database connection in Settings.</div>';
      }
      return;
    }

    // Setup tab switching
    document.querySelectorAll(".rp-tab").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tabId = e.currentTarget.dataset.tab;
        switchTab(tabId);
      });
    });

    // Load progress data for all quarters (not just current)
    // Users can switch quarters in Tab 1 and Tab 4 dropdowns
    try {
      progressData = await db.listGoalProgress({
        // Load all progress data without date filtering
        // Filter by quarter date ranges will happen in report rendering
      });
      console.log("[tc-reporting] Loaded", progressData.length, "progress entries (all quarters)");
    } catch (err) {
      console.warn("[tc-reporting] Error loading progress data:", err);
      progressData = [];
    }

    // Load all data
    await loadData();

    console.log("[tc-reporting] Initialization complete");
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
