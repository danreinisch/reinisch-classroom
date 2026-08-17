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
  const { isRosterLoaded, loadRoster, translateAndDownload } = await import("/web/district-translator.js");
  const { getSupabase } = await import("/web/supabase-client.js");
  const { getCurrentQuarter, getQuarterDateRange, getQuarterLabel, getSchoolYearDateRange, getPeriodLabel, getDateRangeForPeriod } = await import("/web/quarter-utils.js");
  const {
    parseGoalValue,
    isGoalActive,
    formatGoalValue,
    hasCriterionConflict
  } = await import("/web/goal-utils.js");
  const { parseObservationNotes } = await import("/web/obs-utils.js");
  const { buildItemsFromMeta } = await import("/web/shared-build-items.js");

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
  let tab3State = { classFilter: "All Classes", compareQuarters: false, typeFilter: "All Types" };
  let tab4State = { classFilter: "All Classes", quarter: getCurrentQuarter() };
  let tab5State = { quarter: getCurrentQuarter() };
  let tab6State = {
    selectionMode: 'single',
    studentCode: null,
    selectedStudents: [],
    audienceMode: 'parent',
    dateRange: 'current-quarter',
    customStart: null,
    customEnd: null,
    outputFormat: 'print',  // 'print' | 'zip'
    dataSource: 'auto',     // 'auto' | 'local' | 'school'
  };

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
   * Fetch cached AI skills summary for a student from the ai_jobs table.
   * Returns an array of skill objects (may be empty) or null on error.
   * Only returns results cached within the last 24 hours.
   */
  async function fetchCachedSkillsForStudent(studentCode) {
    if (!studentCode) return null;
    try {
      const supabase = await getSupabase();
      if (!supabase) return null;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('ai_jobs')
        .select('result')
        .eq('student_code', studentCode)
        .eq('status', 'complete')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error || !data || data.length === 0) return null;
      return data[0].result?.skills || null;
    } catch (err) {
      console.warn('[tc-reporting] fetchCachedSkillsForStudent failed:', err);
      return null;
    }
  }

  /**
   * Build a rich per-question answer detail HTML block for the evidence report.
   * Shows question text, choices, student answer, correct answer, DESE codes, and IEP goal descriptions.
   * @param {Object} submission - submission row (has .answers JSONB)
   * @param {Object} assignment - assignment row (has .meta.days[])
   * @param {Array}  goalsData  - all goals (to resolve goal codes → descriptions)
   * @param {boolean} isParent  - if true, hide answer keys
   */
  function buildRichAnswerDetailHtml(submission, assignment, goalsData, isParent, studentCode) {
    if (!submission) return '';

    // Score breakdown (auto vs manual)
    let html = '';
    const hasAuto = submission.score_auto != null;
    const hasManual = submission.score_manual != null;
    if (hasAuto && hasManual) {
      html += `<div class="rp-ev-score-breakdown">Auto-graded: ${submission.score_auto}% &nbsp;|&nbsp; Manual: ${submission.score_manual}%</div>`;
    }

    // Build items from meta for context
    const items = buildItemsFromMeta(assignment?.id, assignment?.meta);
    const rawAnswers = submission.answers || {};
    const hasRawAnswers = rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers);

    if (items.length > 0 && hasRawAnswers) {
      let correctCount = 0;
      let gradableCount = 0;
      const questionCards = items.map((item) => {
        const ref = item.item_ref;
        const studentAns = rawAnswers[ref];
        const correctAns = item.meta?.correct ?? item.correct;
        const isCorrect = correctAns !== undefined && correctAns !== null && studentAns !== undefined && String(studentAns) === String(correctAns);
        if (item.answer_type !== 'constructed' && correctAns !== undefined && studentAns !== undefined) {
          gradableCount++;
          if (isCorrect) correctCount++;
        }

        // Resolve IEP goal descriptions from goal codes
        // FERPA: only look up goals that belong to this student.
        // If studentCode is unknown, show no IEP badges rather than leaking.
        const goalDescs = (item.goal_codes || []).map((code) => {
          if (!studentCode) return null;
          const goal = goalsData.find((g) => g.code === code && g.student_code === studentCode);
          if (!goal) return null;
          const area = goal.area || goal.skill_area;
          const desc = goal.desc || goal.description;
          if (desc) return `${area ? escapeHtml(area) + ' — ' : ''}${escapeHtml(desc)}`;
          return escapeHtml(goal.code || code);
        }).filter(Boolean);
        // Use item-level DESE codes; fall back to assignment-level tags when not set per-item
        // (per-item codes come from TXT meta; assignment-level codes come from DB mappings)
        const deseCodesArr = (item.dese_codes && item.dese_codes.length > 0)
          ? item.dese_codes
          : (() => {
              const raw = assignment?.dese_tags || assignment?.dese_standards || '';
              if (!raw) return [];
              return Array.isArray(raw)
                ? raw.map(s => String(s).trim()).filter(Boolean)
                : String(raw).split(',').map(s => s.trim()).filter(Boolean);
            })();

        const badgesHtml = [
          deseCodesArr.length > 0
            ? `<span class="rp-ev-badge rp-ev-badge-dese">DESE: ${escapeHtml(deseCodesArr.join(', '))}</span>`
            : '',
          ...goalDescs.map((d) => `<span class="rp-ev-badge rp-ev-badge-goal">IEP: ${d}</span>`),
        ].filter(Boolean).join(' ');

        if (item.answer_type === 'constructed') {
          // Distinguish fill-in-blank (keyword-auto-scored) from true writing prompts
          const fibKeywords = item.meta?.keywords || item.scoring?.keywords || item.meta?.scoring?.keywords || [];
          const isFillInBlank = fibKeywords.length > 0;

          let studentText = '';
          if (typeof studentAns === 'string') studentText = studentAns;
          else if (studentAns && typeof studentAns === 'object') studentText = studentAns.value || JSON.stringify(studentAns);

          if (isFillInBlank) {
            // Fill-in-blank: compute keyword match result and show with partial credit info
            const minKeywords = item.meta?.min_keywords ?? item.scoring?.min_keywords ?? item.meta?.scoring?.min_keywords ?? 1;
            const caseSensitive = item.meta?.case_sensitive === true || item.scoring?.case_sensitive === true || item.meta?.scoring?.case_sensitive === true;
            const answerForMatch = caseSensitive ? studentText : studentText.toLowerCase();
            let foundCount = 0;
            const foundList = [];
            for (const kw of fibKeywords) {
              const kwForMatch = caseSensitive ? String(kw) : String(kw).toLowerCase();
              if (answerForMatch.includes(kwForMatch)) {
                foundCount++;
                foundList.push(kw);
              }
            }
            const fibCorrect = foundCount >= minKeywords;
            const fibRatio = fibKeywords.length > 0 ? Math.round((foundCount / fibKeywords.length) * 100) : 0;
            gradableCount++;
            if (fibCorrect) correctCount++;
            const ref2 = item.item_ref;
            const day2 = item.meta?.day || '';
            const qNum2 = item.meta?.question_number || ref2;
            const questionText2 = item.meta?.text || '';
            const keywordSummary = `Keywords: ${foundCount}/${fibKeywords.length} found (${fibRatio}%)${foundList.length > 0 ? ' — ' + foundList.map(k => escapeHtml(String(k))).join(', ') : ''}`;
            return `<div class="rp-ev-q-card">
              <div class="rp-ev-q-header">
                <span class="rp-ev-q-label">Q${qNum2}${day2 ? ` (Day ${day2})` : ''}</span>
                ${badgesHtml ? `<div class="rp-ev-q-badges">${badgesHtml}</div>` : ''}
              </div>
              ${questionText2 ? `<div class="rp-ev-q-text">${escapeHtml(questionText2)}</div>` : ''}
              <div class="rp-ev-q-choices">
                <div class="rp-ev-choice ${fibCorrect ? 'rp-ev-choice-correct' : 'rp-ev-choice-wrong'}">
                  ${studentText ? escapeHtml(studentText) : '<em>No response</em>'}
                  <span class="rp-ev-choice-mark">${fibCorrect ? ' ✓' : ' ✗'}</span>
                </div>
                <div class="rp-ev-keyword-summary">${keywordSummary}</div>
              </div>
            </div>`;
          }

          // True writing prompt (no keywords)
          const prompt = item.meta?.prompt || '';
          const score = submission.score_manual ?? submission.score_total ?? submission.score;
          const teacherNote = submission.teacher_note || '';
          return `<div class="rp-ev-q-card">
            <div class="rp-ev-q-header">
              <span class="rp-ev-q-label">Writing Prompt (Day ${item.meta?.day || ref})</span>
              ${badgesHtml ? `<div class="rp-ev-q-badges">${badgesHtml}</div>` : ''}
            </div>
            ${prompt ? `<div class="rp-ev-q-text">&ldquo;${escapeHtml(prompt)}&rdquo;</div>` : ''}
            <div class="rp-ev-q-writing">
              <div class="rp-ev-q-writing-label">Student Response:</div>
              <div class="rp-ev-q-writing-text">${studentText ? escapeHtml(studentText) : '<em>No response recorded</em>'}</div>
            </div>
            ${!isParent && score != null ? `<div class="rp-ev-q-score">Score: ${escapeHtml(String(score))} (${hasManual ? 'Teacher scored' : 'Auto-graded'})</div>` : ''}
            ${teacherNote ? `<div class="rp-ev-teacher-note"><strong>Teacher Note:</strong> ${escapeHtml(teacherNote)}</div>` : ''}
          </div>`;
        }

        // MCQ / boolean
        const questionText = item.meta?.text || '';
        const day = item.meta?.day || '';
        const qNum = item.meta?.question_number || ref;
        const choices = item.meta?.choices || [];
        const choicesHtml = choices.length > 0
          ? choices.map((c) => {
              const letter = c.letter || c.key || '';
              const text = c.text || c.value || '';
              const isStudentAns = studentAns !== undefined && String(studentAns) === String(letter);
              const isCorrectAns = !isParent && correctAns !== undefined && String(correctAns) === String(letter);
              const marker = isStudentAns && isCorrectAns ? ' ✓' : isStudentAns && !isCorrectAns ? ' ✗' : isCorrectAns ? ' ← correct' : '';
              const rowClass = isStudentAns && isCorrectAns ? 'rp-ev-choice-correct' : isStudentAns ? 'rp-ev-choice-wrong' : isCorrectAns ? 'rp-ev-choice-answer' : '';
              return `<div class="rp-ev-choice ${rowClass}">${escapeHtml(letter ? letter + ')' : '')} ${escapeHtml(text)}${marker ? `<span class="rp-ev-choice-mark">${marker}</span>` : ''}</div>`;
            }).join('')
          : studentAns !== undefined
            ? `<div class="rp-ev-choice ${isCorrect ? 'rp-ev-choice-correct' : (correctAns !== undefined ? 'rp-ev-choice-wrong' : '')}">Answer: ${escapeHtml(String(studentAns))}${!isParent && correctAns !== undefined ? ` (Correct: ${escapeHtml(String(correctAns))})` : ''}${isCorrect ? ' ✓' : (correctAns !== undefined ? ' ✗' : '')}</div>`
            : '<div class="rp-ev-choice rp-ev-choice-none"><em>No response</em></div>';

        return `<div class="rp-ev-q-card">
          <div class="rp-ev-q-header">
            <span class="rp-ev-q-label">Q${qNum}${day ? ` (Day ${day})` : ''}</span>
            ${badgesHtml ? `<div class="rp-ev-q-badges">${badgesHtml}</div>` : ''}
          </div>
          ${questionText ? `<div class="rp-ev-q-text">${escapeHtml(questionText)}</div>` : ''}
          <div class="rp-ev-q-choices">${choicesHtml}</div>
        </div>`;
      }).join('');

      const summaryHtml = !isParent && gradableCount > 0
        ? `<div class="rp-ev-q-summary">${correctCount}/${gradableCount} correct (${Math.round((correctCount / gradableCount) * 100)}%)</div>`
        : '';

      html += `<div class="rp-ev-answers">
        <div class="rp-ev-answers-label">Student Responses (${items.length} item${items.length !== 1 ? 's' : ''})</div>
        ${summaryHtml}
        ${questionCards}
      </div>`;

    } else if (hasRawAnswers) {
      // Fallback: flat ref → value table when no item metadata available
      const entries = Object.entries(rawAnswers);
      if (entries.length > 0) {
        const rows = entries.map(([ref, ans]) => {
          let displayAns;
          if (typeof ans === 'object' && ans !== null) {
            displayAns = ans.value != null ? escapeHtml(String(ans.value)) : escapeHtml(JSON.stringify(ans));
          } else {
            displayAns = escapeHtml(String(ans));
          }
          return `<tr><td class="rp-ev-ans-ref">${escapeHtml(ref)}</td><td class="rp-ev-ans-val">${displayAns}</td></tr>`;
        }).join('');
        html += `<div class="rp-ev-answers">
          <div class="rp-ev-answers-label">Student Responses (${entries.length} item${entries.length !== 1 ? 's' : ''})</div>
          <table class="rp-ev-ans-table">
            <thead><tr><th>Item</th><th>Response</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      }
    }

    // Teacher note if present (for non-writing, non-parent view)
    if (submission.teacher_note && !isParent) {
      html += `<div class="rp-ev-teacher-note"><strong>Teacher Note:</strong> ${escapeHtml(submission.teacher_note)}</div>`;
    }

    return html;
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
   * Infer a display label for an assignment's type.
   * - 'html' + meta.questions  → 'HTML'
   * - 'html' + meta.days       → 'TXT'
   * - 'html' (neither)         → 'File'
   * - 'link' | 'google_form'   → 'Link'
   * - null / undefined         → null (caller renders '—')
   * @param {Object} assignment
   * @returns {string|null}
   */
  function getAssignmentTypeLabel(assignment) {
    const t = assignment?.type;
    if (t === 'html') {
      if (assignment.meta?.questions) return 'HTML';
      if (assignment.meta?.days) return 'TXT';
      return 'File';
    }
    if (t === 'link' || t === 'google_form') return 'Link';
    return null;
  }

  /**
   * Return a colored badge <span> for the assignment type, or '—' if unknown.
   * @param {Object} assignment
   * @returns {string}
   */
  function getAssignmentTypeBadgeHtml(assignment) {
    const label = getAssignmentTypeLabel(assignment);
    if (!label) return '—';
    const cls = label.toLowerCase(); // 'html' | 'txt' | 'link' | 'file'
    return `<span class="rp-badge rp-badge-${cls}">${label}</span>`;
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
        pillMode.textContent = usingSupabase ? "School Database" : "My Device";
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
      pillMode.textContent = usingSupabase ? "School Database" : "My Device";
    }
  }

  /**
   * Switch active tab
   */
  function switchTab(tabId) {
    currentTab = tabId;

    // Update tab buttons
    document.querySelectorAll(".rp-tab").forEach((btn) => {
      const active = btn.dataset.tab === tabId;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
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
    try {
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
      case "student-evidence":
        renderTab6();
        break;
    }
    } catch (err) {
      console.error('[tc-reporting] Error in renderCurrentTab:', err);
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
            <div><strong>Reporting Period:</strong> ${getPeriodLabel(tab1State.quarter)}</div>
            <div><strong>Eval Due:</strong> ${formatDate(student.eval_due)}</div>
          </div>
        </div>
    `;

    if (studentGoals.length === 0) {
      html += '<div class="rp-empty">No active IEP goals found for this student.</div>';
    } else {
      // Pre-compute progress for all goals to build the summary panel
      const prevQuarterRange = getPreviousQuarterRange(tab1State.quarter);
      const goalSummaryData = studentGoals.map((g) => {
        const gp = getGoalProgressForQuarter(g.code, tab1State.studentCode, quarterRange);
        const prevGp = prevQuarterRange
          ? getGoalProgressForQuarter(g.code, tab1State.studentCode, prevQuarterRange)
          : null;
        const { status, narrative } = buildRichProgressNarrative(student, g, gp, prevGp, tab1State.quarter);
        return { goal: g, progress: gp, prevProgress: prevGp, status, narrative };
      });

      // Aggregate stats for summary panel
      const totalDataPoints = goalSummaryData.reduce((s, d) => s + d.progress.count, 0);
      const goalsWithData = goalSummaryData.filter((d) => d.progress.count > 0);
      const overallAvg =
        goalsWithData.length > 0
          ? (goalsWithData.reduce((s, d) => s + d.progress.average, 0) / goalsWithData.length).toFixed(0)
          : null;
      const onTrackCount = goalSummaryData.filter(
        (d) => d.status === "Goal Met" || d.status === "Making Adequate Progress"
      ).length;
      const needsSupportCount = goalSummaryData.filter(
        (d) =>
          d.status === "Progressing but Not Sufficient" || d.status === "Not Making Progress"
      ).length;

      const manualReviewCount = goalSummaryData.filter(
        (d) =>
          d.status === "Manual Criterion Review Required"
      ).length;

      const noDataCount = goalSummaryData.filter(
        (d) => d.progress.count === 0
      ).length;

      // Quarterly IEP Progress Summary panel
      const goalDetailRowsHtml = goalSummaryData.map(({ goal, progress, status, narrative }) => {
        const isObs = goal.measurement_type === 'Observation';
        const avgDisplay = isObs
          ? (progress.count > 0 ? status : 'No Data')
          : formatGoalValue(progress.average, goal.measurement_type, goal);
        const statusClass =
          status === "Manual Criterion Review Required"
            ? "rp-qs-goal-status--manual-review"
            : status === "Goal Met"
              ? "rp-qs-goal-status--met"
              : status === "Making Adequate Progress"
                ? "rp-qs-goal-status--adequate"
                : status === "Progressing but Not Sufficient"
                  ? "rp-qs-goal-status--insufficient"
                  : "rp-qs-goal-status--not-progressing";
        return `
          <div class="rp-qs-goal-row">
            <div class="rp-qs-goal-header">
              <span class="rp-qs-goal-code">${escapeHtml(goal.code)}</span>
              <span class="rp-qs-goal-desc">${escapeHtml(goal.desc || "No description")}</span>
              <span class="rp-qs-goal-status ${statusClass}">${escapeHtml(status)}</span>
            </div>
            <div class="rp-qs-goal-metrics">
              <span class="rp-qs-goal-metric"><strong>${progress.count}</strong> Data Points</span>
              <span class="rp-qs-goal-metric"><strong>${avgDisplay}</strong> Avg</span>
            </div>
            <div class="rp-qs-goal-narrative">${escapeHtml(narrative)}</div>
          </div>`;
      }).join("");
      html += `
        <div class="rp-quarter-summary">
          <div class="rp-quarter-summary-title">Quarterly IEP Progress Summary — ${escapeHtml(getPeriodLabel(tab1State.quarter))}</div>
          <div class="rp-quarter-summary-stats">
            <div class="rp-qs-stat">
              <span class="rp-qs-value">${studentGoals.length}</span>
              <span class="rp-qs-label">Active Goals</span>
            </div>
            <div class="rp-qs-stat rp-qs-on-track">
              <span class="rp-qs-value">${onTrackCount}</span>
              <span class="rp-qs-label">On Track</span>
            </div>
            <div class="rp-qs-stat rp-qs-needs-support">
              <span class="rp-qs-value">${needsSupportCount}</span>
              <span class="rp-qs-label">Needs Support</span>
            </div>
            <div class="rp-qs-stat">
              <span class="rp-qs-value">${manualReviewCount}</span>
              <span class="rp-qs-label">Manual Review</span>
            </div>
            <div class="rp-qs-stat rp-qs-no-data">
              <span class="rp-qs-value">${noDataCount}</span>
              <span class="rp-qs-label">No Data</span>
            </div>
            <div class="rp-qs-stat">
              <span class="rp-qs-value">${overallAvg != null ? overallAvg + "%" : "N/A"}</span>
              <span class="rp-qs-label">Avg Score (%)</span>
            </div>
            <div class="rp-qs-stat">
              <span class="rp-qs-value">${totalDataPoints}</span>
              <span class="rp-qs-label">Data Points</span>
            </div>
          </div>
          <div class="rp-qs-goals-detail">${goalDetailRowsHtml}</div>
        </div>
      `;

      html += '<div class="rp-goals-section">';

      // Status-value mapping for select pre-selection
      const statusValueMap = {
        "Goal Met": "met",
        "Making Adequate Progress": "adequate",
        "Progressing but Not Sufficient": "insufficient",
        "Not Making Progress": "not-progressing",
      };

      // Process each goal
      for (const { goal, progress: goalProgressData, prevProgress: prevGoalProgressData, status } of goalSummaryData) {
        const narrative = generateNarrative(student, goal, goalProgressData, prevGoalProgressData);
        const trend = getTrendIndicator(goalProgressData, prevGoalProgressData);

        const criterionConflict =
          hasCriterionConflict(goal);

        const selectedStatusValue =
          criterionConflict
            ? "manual-review"
            : (statusValueMap[status] || "adequate");

        const currentDisplay =
          goal.measurement_type === 'Observation'
            ? (
                goalProgressData.count > 0
                  ? (
                      criterionConflict
                        ? `${goalProgressData.count} observation data point${goalProgressData.count !== 1 ? 's' : ''}`
                        : status
                    )
                  : 'No Data'
              )
            : formatGoalValue(
                goalProgressData.average,
                goal.measurement_type,
                goal
              );

        const makeOption = (val, label) =>
          `<option value="${val}"${selectedStatusValue === val ? " selected" : ""}>${label}</option>`;

        const criterionTargetsHtml =
          criterionConflict
            ? `<div><strong>Header Mastery:</strong> ${escapeHtml(String(goal.mastery ?? 'N/A'))}</div>
               <div><strong>Goal-Text Target:</strong> ${escapeHtml(String(goal.target ?? 'N/A'))}</div>
               <div><strong>Criterion Status:</strong> Manual Criterion Review Required</div>`
            : `<div><strong>Mastery:</strong> ${escapeHtml(String(goal.mastery || goal.target || 'N/A'))}</div>`;

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
              <div><strong>Baseline:</strong> ${escapeHtml(String(goal.baseline || 'N/A'))}</div>
              ${criterionTargetsHtml}
              <div><strong>Current:</strong> ${currentDisplay}</div>
              <div><strong>Data Points:</strong> ${goalProgressData.count}</div>
            </div>
            <div class="rp-goal-narrative">
              <label><strong>Progress Narrative:</strong></label>
              <textarea class="rp-narrative-edit" data-goal="${escapeHtml(goal.code)}" rows="4">${narrative}</textarea>
            </div>
            <div class="rp-goal-status">
              <label><strong>Progress Status:</strong></label>
              <select class="rp-status-select" data-goal="${escapeHtml(goal.code)}">
                ${criterionConflict
                  ? makeOption(
                      "manual-review",
                      "Manual Criterion Review Required"
                    )
                  : ""}
                ${makeOption("adequate", "Making Adequate Progress")}
                ${makeOption("insufficient", "Progressing but Not Sufficient")}
                ${makeOption("not-progressing", "Not Making Progress")}
                ${makeOption("met", "Goal Met")}
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
        <button class="tc-btn" id="btnCopyEmailBody" type="button">📋 Copy as Email Body</button>
      </div>
    `;

    // AI Narrative section
    html += `
      <div class="rp-ai-narrative-section" id="aiNarrativeSection">
        <h3 class="rp-section-heading">✨ AI-Generated Narrative</h3>
        <div class="rp-ai-narrative-controls">
          <label for="aiNarrativeAudience"><strong>Audience:</strong></label>
          <select id="aiNarrativeAudience" class="rp-select" style="width:auto;margin:0 8px;">
            <option value="admin">Administrator / IEP Team</option>
            <option value="parent">Parent / Guardian</option>
          </select>
          <button class="tc-btn" id="btnGenerateNarrative" type="button" data-student-code="${escapeHtml(student.code)}">✨ Generate Narrative</button>
        </div>
        <div id="aiNarrativeStatus" style="display:none;margin:8px 0;color:#555;font-style:italic;"></div>
        <div id="aiNarrativeResult" style="display:none;margin-top:10px;">
          <textarea id="aiNarrativeText" class="rp-narrative-edit" rows="8" style="width:100%;"></textarea>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="tc-btn tc-btn-small" id="btnCopyNarrative" type="button">📋 Copy</button>
            <button class="tc-btn tc-btn-small" id="btnRegenerateNarrative" type="button">🔄 Regenerate</button>
          </div>
        </div>
      </div>
      </div>
    `;

    return html;
  }

  /**
   * Render Parent-Facing Summary template (simplified)
   */
  function renderParentSummaryTemplate(student, studentGoals, quarterRange, cachedSkills) {
    let html = `
      <div class="rp-report-card" id="parentReportCard">
        <div class="rp-report-header">
          <h2>Progress Report for ${escapeHtml(student.name || student.code)}</h2>
          <div class="rp-report-meta">
            <div><strong>Reporting Period:</strong> ${getPeriodLabel(tab1State.quarter)}</div>
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
        const criterionConflict =
          hasCriterionConflict(goal);

        let statusText =
          "No data collected yet";

        let statusColor =
          "#9ca3af";

        if (criterionConflict) {
          statusText =
            "Manual Criterion Review Required";

          statusColor =
            "#6b7280";
        } else if (
          goalProgressData.average != null
        ) {
          const baselineNum =
            parseGoalValue(goal.baseline) ?? 0;

          const masteryNum =
            parseGoalValue(
              goal.mastery || goal.target
            ) ?? 100;
          const progressRange = masteryNum - baselineNum;
          
          // Avoid division by zero when target equals baseline
          if (progressRange !== 0) {
            const progress = ((goalProgressData.average - baselineNum) / progressRange) * 100;
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
            if (goalProgressData.average >= masteryNum) {
              statusText = "At target";
              statusColor = "#22c55e";
            } else {
              statusText = "Below target";
              statusColor = "#fbbf24";
            }
          }
        }

        const parentCriterionHtml =
          criterionConflict
            ? `<div><strong>Header Mastery:</strong> ${escapeHtml(String(goal.mastery ?? 'N/A'))}</div>
               <div><strong>Goal-Text Target:</strong> ${escapeHtml(String(goal.target ?? 'N/A'))}</div>`
            : `<div><strong>Goal:</strong> ${escapeHtml(String(goal.mastery || goal.target || 'N/A'))}</div>`;

        html += `
          <div class="rp-goal-card">
            <h3 style="margin: 0 0 12px 0; font-size: 16px;">${escapeHtml(goal.goal_area || "Goal")}</h3>
            <div style="background: rgba(255,255,255,0.04); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
              <strong>What we're working on:</strong><br/>
              ${escapeHtml(goal.desc || "No description")}
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 12px;">
              <div><strong>Starting point:</strong> ${escapeHtml(String(goal.baseline || 'N/A'))}</div>
              <div><strong>Current:</strong> ${formatGoalValue(goalProgressData.average, goal.measurement_type, goal)}</div>
              ${parentCriterionHtml}
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
            ${(() => {
              if (criterionConflict) return '';
              if (!cachedSkills || !Array.isArray(cachedSkills)) return '';
              const skill = cachedSkills.find(s =>
                s.plain_language && s.code === goal.code
              );
              if (!skill || !skill.plain_language) return '';
              return `<div class="rp-ai-plain-note">💡 ${escapeHtml(skill.plain_language)}</div>`;
            })()}
          </div>
        `;
      }

      html += "</div>";
    }

    html += `
      <div class="rp-export-actions">
        <button class="tc-btn" id="btnExportPDF" type="button">📄 Export as PDF</button>
        <button class="tc-btn" id="btnCopyEmailBody" type="button">📋 Copy as Email Body</button>
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
            <div><strong>Reporting Period:</strong> ${getPeriodLabel(tab1State.quarter)}</div>
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
          <caption>IEP Goal Progress Summary</caption>
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
        
        const criterionConflict =
          hasCriterionConflict(goal);

        let status =
          "❌ No Data";

        let rowClass =
          "";

        if (criterionConflict) {
          status =
            "Manual Criterion Review Required";

          rowClass =
            "rp-status-manual-review";
        } else if (
          goalProgressData.average != null
        ) {
          if (
            goalProgressData.average >=
            (
              parseGoalValue(
                goal.mastery || goal.target
              ) ?? 80
            )
          ) {
            status = "✅ At Target";
            rowClass = "rp-status-good";
          } else if (goalProgressData.average >= (parseGoalValue(goal.baseline) ?? 0)) {
            status = "⚠️ Progressing";
            rowClass = "rp-status-warning";
          } else {
            status = "🔴 Below Baseline";
            rowClass = "rp-status-critical";
          }
        }

        const adminCriterionHtml =
          criterionConflict
            ? `<div><strong>Header Mastery:</strong> ${escapeHtml(String(goal.mastery ?? 'N/A'))}</div>
               <div><strong>Goal-Text Target:</strong> ${escapeHtml(String(goal.target ?? 'N/A'))}</div>`
            : escapeHtml(
                String(
                  goal.mastery ||
                  goal.target ||
                  'N/A'
                )
              );

        html += `
          <tr class="${rowClass}">
            <td><strong>${escapeHtml(goal.code)}</strong></td>
            <td>${escapeHtml(goal.goal_area || "N/A")}</td>
            <td>${escapeHtml(String(goal.baseline || 'N/A'))}</td>
            <td>${formatGoalValue(goalProgressData.average, goal.measurement_type, goal)}</td>
            <td>${adminCriterionHtml}</td>
            <td>${goalProgressData.count}</td>
            <td>${escapeHtml(status)}</td>
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
        <button class="tc-btn" id="btnCopyEmailBody" type="button">📋 Copy as Email Body</button>
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

    const quarterLabel = getPeriodLabel(tab1State.quarter);
    const quarterDates = getDateRangeForPeriod(tab1State.quarter);
    const current =
      formatGoalValue(
        goalProgressData.average,
        goal.measurement_type,
        goal
      );

    const baseline =
      goal.baseline || "N/A";

    const criterionConflict =
      hasCriterionConflict(goal);

    const headerMastery =
      goal.mastery != null &&
      goal.mastery !== ""
        ? String(goal.mastery)
        : "N/A";

    const goalTextTarget =
      goal.target != null &&
      goal.target !== ""
        ? String(goal.target)
        : "N/A";

    const criterionLines =
      criterionConflict
        ? `Baseline: ${baseline} | Current: ${current}
Header Mastery: ${headerMastery}
Goal-Text Target: ${goalTextTarget}
Criterion Status: Manual Criterion Review Required`
        : `Baseline: ${baseline} | Current: ${current} | Target: ${goalTextTarget}`;

    // Calculate previous quarter data for trend and narrative
    const prevQuarterRange = getPreviousQuarterRange(tab1State.quarter);
    const prevGoalProgressData = prevQuarterRange
      ? getGoalProgressForQuarter(goalCode, studentCode, prevQuarterRange)
      : null;

    // Use rich narrative engine for both narrative and status
    const { narrative, status: richStatus } = buildRichProgressNarrative(
      student || { name: studentCode, code: studentCode },
      goal,
      goalProgressData,
      prevGoalProgressData,
      tab1State.quarter
    );

    // Format data points
    const dataPointsStr = dataPoints.length > 0
      ? dataPoints.map(dp => {
          const value = parseFloat(dp.value);
          const formattedValue = !isNaN(value) ? formatGoalValue(value, goal.measurement_type, goal) : 'N/A';
          return `${formatDate(dp.date)} (${formattedValue})`;
        }).join(', ')
      : "No data collected";

    const method = goal.measurement_type || "N/A";

    return `[Goal Code: ${goalCode}] ${goal.goal_area || ""}
Reporting Period: ${quarterLabel} (${formatDateYYYYMMDD(quarterDates.start)} - ${formatDateYYYYMMDD(quarterDates.end)})
${criterionLines}
Data Points (${goalProgressData.count}): ${dataPointsStr}
Method: ${method}
Status: ${richStatus}

Progress Summary:
${narrative}`;
  }

  /**
   * Build plain-text email body for a Tab 1 IEP Quarterly Progress report.
   * For parent-audience reports, raw scores are omitted (isParent flag).
   * @param {Object} student - student object
   * @param {Array} studentGoals - active IEP goals for this student
   * @param {Object} quarterRange - { start, end } date range
   * @param {boolean} isParent - whether to use parent-friendly (simplified) view
   * @returns {string} plain-text email body
   */
  function buildTab1EmailBodyText(student, studentGoals, quarterRange, isParent) {
    const quarterLabel = getQuarterLabel(tab1State.quarter);
    const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const studentName = student.name || student.code;
    const lines = [];

    // Header
    lines.push('IEP Quarterly Progress Update');
    lines.push(`Student: ${studentName}`);
    lines.push(`Reporting Period: ${quarterLabel}`);
    lines.push(`Date: ${todayLabel}`);
    lines.push('');
    lines.push('─'.repeat(50));
    lines.push('');

    // IEP Goal Progress — FERPA: only this student's goals
    lines.push('IEP GOAL PROGRESS');
    lines.push('');

    if (studentGoals.length === 0) {
      lines.push('  No active IEP goals found for this student.');
    } else {
      const prevQuarterRange = getPreviousQuarterRange(tab1State.quarter);
      for (const goal of studentGoals) {
        const gp = getGoalProgressForQuarter(goal.code, tab1State.studentCode, quarterRange);
        const prevGp = prevQuarterRange
          ? getGoalProgressForQuarter(goal.code, tab1State.studentCode, prevQuarterRange)
          : null;
        const { status, narrative } =
          buildRichProgressNarrative(
            student,
            goal,
            gp,
            prevGp,
            tab1State.quarter
          );

        const criterionConflict =
          hasCriterionConflict(goal);

        const headerMastery =
          goal.mastery != null &&
          goal.mastery !== ''
            ? String(goal.mastery)
            : 'N/A';

        const goalTextTarget =
          goal.target != null &&
          goal.target !== ''
            ? String(goal.target)
            : 'N/A';

        // Parent copies remain score-simplified. A conflict must not be
        // translated into a fixed-threshold "On track" style judgment.
        let progressText;

        if (criterionConflict && isParent) {
          progressText =
            gp.average == null
              ? 'No data yet'
              : 'Data collected';
        } else if (isParent) {
          if (gp.average == null) {
            progressText = 'No data yet';
          } else if (gp.average >= 80) {
            progressText = 'On track';
          } else if (gp.average >= 60) {
            progressText = 'Making progress';
          } else {
            progressText = 'Needs support';
          }
        } else {
          progressText = gp.average != null
            ? formatGoalValue(gp.average, goal.measurement_type, goal)
            : 'No data';
        }

        const areaLabel =
          goal.goal_area ||
          goal.area ||
          '';

        lines.push(
          `\u2022 ${goal.code}${areaLabel ? ` \u2014 ${areaLabel}` : ''}`
        );

        if (goal.desc) {
          lines.push(
            `  ${goal.desc}`
          );
        }

        if (criterionConflict) {
          lines.push(
            `  Header Mastery: ${headerMastery}`
          );

          lines.push(
            `  Goal-Text Target: ${goalTextTarget}`
          );

          lines.push(
            '  Criterion Status: Manual Criterion Review Required'
          );
        }

        lines.push(
          `  Progress: ${progressText}  |  Status: ${status}`
        );
        if (!isParent) {
          lines.push(`  ${narrative}`);
          lines.push(`  Data points: ${gp.count}`);
        }
        lines.push('');
      }
    }

    lines.push('─'.repeat(50));
    lines.push('');
    lines.push('Please contact me if you have any questions about this progress update.');
    lines.push('');

    return lines.join('\n');
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
   * Render an error card inside a tab container (used by error boundaries)
   */
  function renderTabErrorCard(container, tabFn, err) {
    console.error('[tc-reporting] Error rendering tab:', err);
    container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'text-align:center; padding:32px 24px; color:rgba(255,255,255,.7);';
    const msg = document.createElement('p');
    msg.textContent = 'Something went wrong rendering this section.';
    card.appendChild(msg);
    const detail = document.createElement('p');
    detail.style.cssText = 'font-size:12px; color:rgba(255,255,255,.4); margin-top:8px;';
    detail.textContent = err.message || 'Unknown error';
    card.appendChild(detail);
    const retryBtn = document.createElement('button');
    retryBtn.className = 'tc-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.style.marginTop = '16px';
    retryBtn.addEventListener('click', () => tabFn());
    card.appendChild(retryBtn);
    container.appendChild(card);
  }

  /**
   * Handle AI narrative generation for a student's IEP goals.
   * Called from Tab 1 when the "✨ Generate Narrative" button is clicked.
   * Must be declared at IIFE root — never inside try/catch or if blocks.
   */
  async function handleGenerateNarrative(student, studentGoals, quarterRange, audience, isRegenerate) {
    const statusEl = $("aiNarrativeStatus");
    const resultEl = $("aiNarrativeResult");
    const textareaEl = $("aiNarrativeText");
    const btnGen = $("btnGenerateNarrative");
    const btnRegen = $("btnRegenerateNarrative");

    if (!statusEl || !resultEl || !textareaEl) return;

    // Show loading state
    statusEl.style.display = '';
    statusEl.textContent = isRegenerate ? '🔄 Regenerating narrative…' : '✨ Generating narrative…';
    resultEl.style.display = 'none';
    if (btnGen) btnGen.disabled = true;
    if (btnRegen) btnRegen.disabled = true;

    // Build goals payload from current state
    const prevQuarterRange = getPreviousQuarterRange(tab1State.quarter);
    const goalsPayload = studentGoals.map((goal) => {
      const gp = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
      const prevGp = prevQuarterRange
        ? getGoalProgressForQuarter(goal.code, student.code, prevQuarterRange)
        : null;
      const trend = getTrendIndicator(gp, prevGp);
      const currentDisplay = goal.measurement_type === 'Observation'
        ? (gp.count > 0 ? 'Data collected' : 'No data')
        : (gp.average != null ? String(gp.average.toFixed(1)) : 'No data');

      const criterionConflict =
        hasCriterionConflict(goal);

      return {
        code: goal.code || '',
        area: goal.goal_area || '',
        description: goal.desc || '',
        baseline: String(goal.baseline || ''),
        criterion_conflict: criterionConflict,
        header_mastery: String(goal.mastery ?? ''),
        goal_text_target: String(goal.target ?? ''),
        target:
          criterionConflict
            ? ''
            : String(goal.mastery || goal.target || ''),
        currentValue: currentDisplay,
        trend: trend,
        dataCount: gp.count || 0,
      };
    });

    // Build scores payload from cached submissions
    const studentInstances = instancesData.filter(
      (inst) => inst.student_code === student.code || inst.student_id === student.code
    );
    const scoresPayload = [];
    studentInstances.slice(0, 15).forEach((inst) => {
      const sub = submissionsData.find((s) => s.instance_id === inst.id);
      if (sub && sub.score_total != null) {
        const asgn = assignmentsData.find((a) => a.id === inst.assignment_id);
        scoresPayload.push({
          title: asgn ? (asgn.title || '') : '',
          score: sub.score_total,
          date: sub.submitted_at ? sub.submitted_at.slice(0, 10) : '',
          type: asgn ? (asgn.type || '') : '',
        });
      }
    });

    try {
      const res = await fetch('/.netlify/functions/teacher-ai-report-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentCode: student.code,
          studentName: student.name || student.code,
          goals: goalsPayload,
          quarterLabel: getPeriodLabel(tab1State.quarter),
          scores: scoresPayload,
          audience: audience,
        }),
        credentials: 'same-origin',
      });

      const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));

      if (!data.ok) {
        statusEl.textContent = '❌ Error: ' + (data.error || 'Generation failed');
        if (btnGen) btnGen.disabled = false;
        if (btnRegen) btnRegen.disabled = false;
        return;
      }

      statusEl.style.display = 'none';
      textareaEl.value = data.narrative || '';
      resultEl.style.display = '';
      if (btnGen) btnGen.disabled = false;
      if (btnRegen) btnRegen.disabled = false;
    } catch (err) {
      console.error('[tc-reporting] handleGenerateNarrative failed:', err);
      statusEl.textContent = '❌ Network error: ' + err.message;
      if (btnGen) btnGen.disabled = false;
      if (btnRegen) btnRegen.disabled = false;
    }
  }

  /**
   * Handle AI executive summary generation for a student's evidence report.
   * Called from Tab 6 when the "✨ Generate Executive Summary" button is clicked.
   * Must be declared at IIFE root — never inside try/catch or if blocks.
   */
  async function handleGenerateExecutiveSummary(student, quarterRange, audience, isRegenerate) {
    const statusEl = $("tab6AiSummaryStatus");
    const resultEl = $("tab6AiSummaryResult");
    const textareaEl = $("tab6AiSummaryText");
    const btnGen = $("tab6BtnGenerateSummary");
    const btnRegen = $("tab6BtnRegenerateSummary");

    if (!statusEl || !resultEl || !textareaEl) return;

    // Show loading state
    statusEl.style.display = '';
    statusEl.textContent = isRegenerate ? '🔄 Regenerating summary…' : '✨ Generating summary…';
    resultEl.style.display = 'none';
    if (btnGen) btnGen.disabled = true;
    if (btnRegen) btnRegen.disabled = true;

    // Build goals payload from current data
    const activeGoals = goalsData.filter(
      (g) => g.student_code === student.code && isGoalActive(g)
    );
    const goalsPayload = activeGoals.map((goal) => {
      const gp = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
      const currentDisplay = goal.measurement_type === 'Observation'
        ? (gp.count > 0 ? 'Data collected' : 'No data')
        : (gp.average != null ? String(gp.average.toFixed(1)) : 'No data');

      const criterionConflict =
        hasCriterionConflict(goal);

      return {
        code: goal.code || '',
        area: goal.goal_area || goal.area || '',
        description: goal.desc || '',
        baseline: String(goal.baseline || ''),
        criterion_conflict: criterionConflict,
        header_mastery: String(goal.mastery ?? ''),
        goal_text_target: String(goal.target ?? ''),
        target:
          criterionConflict
            ? ''
            : String(goal.mastery || goal.target || ''),
        currentValue: currentDisplay,
        trend: '—',
        dataCount: gp.count || 0,
      };
    });

    // Build assignment summary from cached data
    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);
    const studentInstances = instancesData.filter(
      (inst) => inst.student_code === student.code || inst.student_id === student.code
    );
    const rangedInstances = studentInstances.filter((inst) => {
      const d = new Date(inst.assigned_at || inst.created_at || '');
      return !isNaN(d.getTime()) && (d >= startDate && d <= endDate);
    });
    const total = rangedInstances.length;
    let completed = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    rangedInstances.forEach((inst) => {
      const sub = submissionsData.find((s) => s.instance_id === inst.id);
      if (sub) {
        completed++;
        const score = sub.score_total != null ? parseFloat(sub.score_total)
          : sub.score != null ? parseFloat(sub.score) : null;
        if (score != null && !isNaN(score)) {
          scoreSum += score;
          scoreCount++;
        }
      }
    });
    const completionRate = total > 0 ? Math.round((completed / total) * 100) + '%' : '0%';
    const averageScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;
    const assignmentSummary = { total, completed, completionRate, averageScore };

    try {
      const res = await fetch('/.netlify/functions/teacher-ai-report-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentCode: student.code,
          studentName: student.name || student.code,
          goals: goalsPayload,
          quarterLabel: getTab6PeriodLabel(),
          assignmentSummary: assignmentSummary,
          audience: audience,
        }),
        credentials: 'same-origin',
      });

      const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));

      if (!data.ok) {
        statusEl.textContent = '❌ Error: ' + (data.error || 'Generation failed');
        if (btnGen) btnGen.disabled = false;
        if (btnRegen) btnRegen.disabled = false;
        return;
      }

      statusEl.style.display = 'none';
      textareaEl.value = data.summary || '';
      resultEl.style.display = '';
      if (btnGen) btnGen.disabled = false;
      if (btnRegen) btnRegen.disabled = false;
    } catch (err) {
      console.error('[tc-reporting] handleGenerateExecutiveSummary failed:', err);
      statusEl.textContent = '❌ Network error: ' + err.message;
      if (btnGen) btnGen.disabled = false;
      if (btnRegen) btnRegen.disabled = false;
    }
  }

  /**
   * Handle AI trend analysis for the Class Performance tab (Tab 3).
   * Collects goal data across filtered students and POSTs to teacher-ai-analyze-trends.
   * Must be declared at IIFE root — never inside try/catch or if blocks.
   */
  async function handleAnalyzeTrends(isRegenerate) {
    const statusEl = $("tab3AiTrendsStatus");
    const resultEl = $("tab3AiTrendsResult");
    const textareaEl = $("tab3AiTrendsText");
    const btnGen = $("tab3BtnAnalyzeTrends");
    const btnRegen = $("tab3BtnReanalyzeTrends");

    if (!statusEl || !resultEl || !textareaEl) return;

    // Show loading state
    statusEl.style.display = '';
    statusEl.textContent = isRegenerate ? '🔄 Re-analyzing trends…' : '✨ Analyzing trends…';
    resultEl.style.display = 'none';
    if (btnGen) btnGen.disabled = true;
    if (btnRegen) btnRegen.disabled = true;

    // Build filtered student list from current tab3 state
    let filteredStudents = studentsData.filter((s) => s.active !== false);
    if (tab3State.classFilter !== "All Classes") {
      const classEnrollments = enrollmentsData.filter((e) => e.class_name === tab3State.classFilter);
      const enrolledCodes = classEnrollments.map((e) => e.student_code);
      filteredStudents = filteredStudents.filter((s) => enrolledCodes.includes(s.code));
    }

    const currentQuarter = getCurrentQuarter();
    const quarterRange = getQuarterDateRange(currentQuarter);

    // Aggregate goals across all filtered students
    const classGoals = [];
    filteredStudents.forEach((student) => {
      const studentGoals = goalsData.filter((g) => g.student_code === student.code && isGoalActive(g));
      studentGoals.forEach((goal) => {
        const gp =
          getGoalProgressForQuarter(
            goal.code,
            student.code,
            quarterRange
          );

        const criterionConflict =
          hasCriterionConflict(goal);

        classGoals.push({
          code: goal.code || '',
          area: goal.goal_area || '',
          description: goal.desc || '',
          baseline: String(goal.baseline || ''),
          criterion_conflict: criterionConflict,
          header_mastery: String(goal.mastery ?? ''),
          goal_text_target: String(goal.target ?? ''),
          target:
            criterionConflict
              ? ''
              : String(goal.mastery || goal.target || ''),
          currentValue:
            gp.average != null
              ? String(gp.average.toFixed(1))
              : 'No data',
          trend: '—',
          dataCount: gp.count || 0,
        });
      });
    });

    // Build data points payload from progressData for those goals
    const goalCodes = new Set(classGoals.map((g) => g.code));
    const dataPointsPayload = progressData
      .filter((p) => goalCodes.has(p.goal_code))
      .slice(0, 200)
      .map((p) => ({
        goalCode: p.goal_code,
        date: p.recorded_at ? p.recorded_at.slice(0, 10) : '',
        value: p.value != null ? String(p.value) : '',
      }));

    const classLabel = tab3State.classFilter === "All Classes" ? "All Classes" : tab3State.classFilter;
    const classCode = "class:" + classLabel.replace(/\s+/g, '-');
    const startStr = quarterRange.start instanceof Date ? quarterRange.start.toISOString().slice(0, 10) : String(quarterRange.start || '');
    const endStr = quarterRange.end instanceof Date ? quarterRange.end.toISOString().slice(0, 10) : String(quarterRange.end || '');

    try {
      const audienceSelect = $("tab3AiTrendsAudience");
      const audience = audienceSelect ? audienceSelect.value : 'admin';
      const res = await fetch('/.netlify/functions/teacher-ai-analyze-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentCode: classCode,
          studentName: "Class: " + classLabel,
          goals: classGoals.slice(0, 50),
          dateRange: { start: startStr, end: endStr },
          dataPoints: dataPointsPayload,
          audience: audience,
        }),
        credentials: 'same-origin',
      });

      const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));

      if (!data.ok) {
        statusEl.textContent = '❌ Error: ' + (data.error || 'Analysis failed');
        if (btnGen) btnGen.disabled = false;
        if (btnRegen) btnRegen.disabled = false;
        return;
      }

      statusEl.style.display = 'none';
      textareaEl.value = data.analysis || '';
      resultEl.style.display = '';
      if (btnGen) btnGen.disabled = false;
      if (btnRegen) btnRegen.disabled = false;
    } catch (err) {
      console.error('[tc-reporting] handleAnalyzeTrends failed:', err);
      statusEl.textContent = '❌ Network error: ' + err.message;
      if (btnGen) btnGen.disabled = false;
      if (btnRegen) btnRegen.disabled = false;
    }
  }

  /**
   * Handle AI compliance notes drafting for the Compliance tab (Tab 4).
   * Collects compliance data from current tab4 state and POSTs to teacher-ai-compliance-notes.
   * Must be declared at IIFE root — never inside try/catch or if blocks.
   */
  async function handleDraftComplianceNotes(isRegenerate) {
    const statusEl = $("tab4AiNotesStatus");
    const resultEl = $("tab4AiNotesResult");
    const textareaEl = $("tab4AiNotesText");
    const btnGen = $("tab4BtnDraftNotes");
    const btnRegen = $("tab4BtnRedraftNotes");

    if (!statusEl || !resultEl || !textareaEl) return;

    // Show loading state
    statusEl.style.display = '';
    statusEl.textContent = isRegenerate ? '🔄 Re-drafting compliance notes…' : '✨ Drafting compliance notes…';
    resultEl.style.display = 'none';
    if (btnGen) btnGen.disabled = true;
    if (btnRegen) btnRegen.disabled = true;

    // Build filtered student list from current tab4 state
    const quarterRange = getDateRangeForPeriod(tab4State.quarter);
    const quarterLabel = getPeriodLabel(tab4State.quarter);

    let filteredStudents = studentsData.filter((s) => s.active !== false);
    if (tab4State.classFilter !== "All Classes") {
      const classEnrollments = enrollmentsData.filter((e) => e.class_name === tab4State.classFilter);
      const enrolledCodes = classEnrollments.map((e) => e.student_code);
      filteredStudents = filteredStudents.filter((s) => enrolledCodes.includes(s.code));
    }

    // Aggregate goals and compliance metrics
    const allGoalsList = [];
    filteredStudents.forEach((student) => {
      const studentGoals = goalsData.filter((g) => g.student_code === student.code && isGoalActive(g));
      studentGoals.forEach((goal) => {
        const goalData =
          getGoalProgressForQuarter(
            goal.code,
            student.code,
            quarterRange
          );

        const criterionConflict =
          hasCriterionConflict(goal);

        allGoalsList.push({
          code: goal.code || '',
          area: goal.goal_area || '',
          description: goal.desc || '',
          baseline: String(goal.baseline || ''),
          criterion_conflict: criterionConflict,
          header_mastery: String(goal.mastery ?? ''),
          goal_text_target: String(goal.target ?? ''),
          target:
            criterionConflict
              ? ''
              : String(goal.mastery || goal.target || ''),
          currentValue:
            goalData.average != null
              ? String(goalData.average.toFixed(1))
              : 'No data',
          trend: '—',
          dataCount: goalData.count || 0,
        });
      });
    });

    const totalGoals = allGoalsList.length;
    const totalDataPoints = allGoalsList.reduce((sum, g) => sum + g.dataCount, 0);
    const goalsWithNoData = allGoalsList.filter((g) => g.dataCount === 0).length;
    const goalsWithAdequateData = allGoalsList.filter((g) => g.dataCount >= 3).length;

    const complianceData = {
      totalAssignments: totalGoals * 3,
      completedAssignments: totalDataPoints,
      dataCollectionFrequency: '3+ data points per goal per quarter',
      missedDataPoints: goalsWithNoData,
      accommodationsProvided: 'Per IEP specifications',
    };

    const classLabel = tab4State.classFilter === "All Classes" ? "All Classes" : tab4State.classFilter;
    const classCode = "class:" + classLabel.replace(/\s+/g, '-');

    try {
      const res = await fetch('/.netlify/functions/teacher-ai-compliance-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentCode: classCode,
          studentName: "Class: " + classLabel,
          goals: allGoalsList.slice(0, 50),
          complianceData: complianceData,
          quarterLabel: quarterLabel,
        }),
        credentials: 'same-origin',
      });

      const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));

      if (!data.ok) {
        statusEl.textContent = '❌ Error: ' + (data.error || 'Generation failed');
        if (btnGen) btnGen.disabled = false;
        if (btnRegen) btnRegen.disabled = false;
        return;
      }

      statusEl.style.display = 'none';
      textareaEl.value = data.notes || '';
      resultEl.style.display = '';
      if (btnGen) btnGen.disabled = false;
      if (btnRegen) btnRegen.disabled = false;
    } catch (err) {
      console.error('[tc-reporting] handleDraftComplianceNotes failed:', err);
      statusEl.textContent = '❌ Network error: ' + err.message;
      if (btnGen) btnGen.disabled = false;
      if (btnRegen) btnRegen.disabled = false;
    }
  }

  /**
   * TAB 1: IEP Quarterly Progress Report
   */
  async function renderTab1() {
    const container = $("tab1Content");
    if (!container) return;
    try {
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
            <option value="semester-1" ${tab1State.quarter === "semester-1" ? "selected" : ""}>Semester 1 (Aug–Jan)</option>
            <option value="semester-2" ${tab1State.quarter === "semester-2" ? "selected" : ""}>Semester 2 (Feb–Jun)</option>
            <option value="full-year" ${tab1State.quarter === "full-year" ? "selected" : ""}>Full Year (Aug–Jun)</option>
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
          try {
            localStorage.setItem('rc_report_template', e.target.value);
          } catch (err) {
            if (err.name === 'QuotaExceededError' || err.code === 22) {
              console.warn('[tc-reporting] localStorage quota exceeded');
            } else {
              console.warn('[tc-reporting] Error saving template preference:', err.message);
            }
          }
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
    const quarterRange = getDateRangeForPeriod(tab1State.quarter);

    // Get student's goals
    const studentGoals = goalsData.filter(
      (g) => g.student_code === tab1State.studentCode && isGoalActive(g)
    );

    // Render based on template selection
    let reportContent = '';
    switch (tab1State.template) {
      case 'parent-summary': {
        // Fetch cached AI skills for plain_language notes.
        // plain_language is always parent-friendly; audience filtering happens at generation time.
        const cachedSkills = await fetchCachedSkillsForStudent(tab1State.studentCode);
        reportContent = renderParentSummaryTemplate(student, studentGoals, quarterRange, cachedSkills);
        break;
      }
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

    // SAFETY: all dynamic values in reportHtml pass through escapeHtml(); static HTML only otherwise
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
        try {
          localStorage.setItem('rc_report_template', e.target.value);
        } catch (err) {
          if (err.name === 'QuotaExceededError' || err.code === 22) {
            console.warn('[tc-reporting] localStorage quota exceeded');
          } else {
            console.warn('[tc-reporting] Error saving template preference:', err.message);
          }
        }
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

    const btnCopyEmailBody = $("btnCopyEmailBody");
    if (btnCopyEmailBody) {
      const isParentView = tab1State.template === 'parent-summary';
      btnCopyEmailBody.addEventListener('click', () => {
        const emailText = buildTab1EmailBodyText(student, studentGoals, quarterRange, isParentView);
        navigator.clipboard.writeText(emailText).then(() => {
          const original = btnCopyEmailBody.textContent;
          btnCopyEmailBody.textContent = '\u2713 Copied!';
          setTimeout(() => { btnCopyEmailBody.textContent = original; }, 2000);
        }).catch((err) => {
          console.error('[tc-reporting] Failed to copy email body:', err);
          const original = btnCopyEmailBody.textContent;
          btnCopyEmailBody.textContent = 'Copy failed';
          setTimeout(() => { btnCopyEmailBody.textContent = original; }, 2000);
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

    // Attach AI narrative button listeners (only for IEP progress template)
    const btnGenNarrative = $("btnGenerateNarrative");
    if (btnGenNarrative) {
      btnGenNarrative.addEventListener('click', () => {
        const audienceSelect = $("aiNarrativeAudience");
        const audience = audienceSelect ? audienceSelect.value : 'admin';
        handleGenerateNarrative(student, studentGoals, quarterRange, audience, false);
      });
    }
    const btnRegenNarrative = $("btnRegenerateNarrative");
    if (btnRegenNarrative) {
      btnRegenNarrative.addEventListener('click', () => {
        const audienceSelect = $("aiNarrativeAudience");
        const audience = audienceSelect ? audienceSelect.value : 'admin';
        handleGenerateNarrative(student, studentGoals, quarterRange, audience, true);
      });
    }
    const btnCopyNarrative = $("btnCopyNarrative");
    if (btnCopyNarrative) {
      btnCopyNarrative.addEventListener('click', () => {
        const textarea = $("aiNarrativeText");
        const text = textarea ? textarea.value : '';
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          const original = btnCopyNarrative.textContent;
          btnCopyNarrative.textContent = '✓ Copied!';
          setTimeout(() => { btnCopyNarrative.textContent = original; }, 2000);
        }).catch((err) => {
          console.error('[tc-reporting] Failed to copy narrative:', err);
          const original = btnCopyNarrative.textContent;
          btnCopyNarrative.textContent = '❌ Copy failed';
          setTimeout(() => { btnCopyNarrative.textContent = original; }, 2000);
        });
      });
    }
    } catch (err) {
      renderTabErrorCard(container, renderTab1, err);
    }
  }

  /**
   * Get progress data for a goal in a specific quarter
   */
  function getGoalProgressForQuarter(goalCode, studentCode, quarterRange) {
    if (!quarterRange.start || !quarterRange.end) {
      return { average: null, count: 0, values: [], entries: [] };
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
      return { average: null, count: 0, values: [], entries: [] };
    }

    const values = relevantProgress.map((p) => parseFloat(p.value)).filter((v) => !isNaN(v));
    const average =
      values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

    return { average, count: values.length, values, entries: relevantProgress };
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
   * Rich narrative engine for IEP progress statements.
   * Generates professional, varied progress narratives based on goal data dimensions:
   *   - Trend direction (improving / maintaining / declining / new)
   *   - Baseline comparison (above / at / below baseline)
   *   - Target proximity (met / approaching / far)
   *   - Data density (sufficient ≥3 / limited 1-2 / none)
   *   - Score range (high ≥80% / moderate 60-79% / low <60%)
   *
   * Phrase selection is deterministic per goal code so that the same goal always
   * gets the same phrasing, but different goals get varied language.
   *
   * @param {Object} student          - { name, code }
   * @param {Object} goal             - { code, goal_area, desc, baseline, target }
   * @param {Object} quarterData      - { average, count, values }
   * @param {Object|null} prevData    - Previous quarter { average, count, values }
   * @param {string} quarterLabel     - e.g. "Q3"
   * @returns {{ narrative: string, status: string }}
   */
  function buildRichProgressNarrative(student, goal, quarterData, prevData, quarterLabel) {
    const name = ((student.name || student.code || "Student").split(" ")[0]);
    const area = goal.goal_area || goal.code || "this goal area";
    const baselineVal = parseGoalValue(goal.baseline) ?? 0;
    const targetVal = parseGoalValue(goal.mastery || goal.target) ?? 80;
    const avg = quarterData.average;
    const count = quarterData.count;
    const quarter = quarterLabel || "this quarter";

    // Contextual suffix appended to all narrative paths
    const _ctxParts = [];
    if (goal.class_context) _ctxParts.push(`Data collected in ${goal.class_context}`);
    if (goal.data_collector && goal.data_collector !== (student.primary_case_manager || '')) {
      _ctxParts.push(`data collected by ${goal.data_collector}`);
    }
    const _ctx = _ctxParts.length > 0 ? ' ' + _ctxParts.join('; ') + '.' : '';

    // An explicitly source-conflicted goal has no approved controlling
    // criterion. Preserve both official values and raw evidence, but do
    // not produce an automatic target/mastery status.
    if (hasCriterionConflict(goal)) {
      const headerMastery =
        goal.mastery != null &&
        goal.mastery !== ''
          ? String(goal.mastery)
          : 'Not stated';

      const goalTextTarget =
        goal.target != null &&
        goal.target !== ''
          ? String(goal.target)
          : 'Not stated';

      const criterionStatement =
        `Header Mastery: ${headerMastery}; Goal-Text Target: ${goalTextTarget}. ` +
        'Manual Criterion Review Required. Reinisch Classroom does not select either value as the controlling criterion.';

      if (count === 0) {
        return {
          narrative:
            `No performance data was collected for ${name} in the area of ${area} during ${quarter}. ` +
            criterionStatement +
            _ctx,
          status:
            'Manual Criterion Review Required',
        };
      }

      if (
        goal.measurement_type ===
        'Observation'
      ) {
        return {
          narrative:
            `${count} observation data point${count !== 1 ? 's were' : ' was'} recorded for ${name} in the area of ${area} during ${quarter}. ` +
            criterionStatement +
            _ctx,
          status:
            'Manual Criterion Review Required',
        };
      }

      if (avg == null) {
        return {
          narrative:
            `Data was collected for ${name} in the area of ${area} during ${quarter} (${count} data point${count !== 1 ? 's' : ''}), but the recorded values could not be summarized numerically. ` +
            criterionStatement +
            _ctx,
          status:
            'Manual Criterion Review Required',
        };
      }

      const avgDisplay =
        formatGoalValue(
          avg,
          goal.measurement_type,
          goal
        );

      const baselineDisplay =
        goal.baseline != null &&
        goal.baseline !== ''
          ? String(goal.baseline)
          : 'Not stated';

      const prevAvg =
        prevData &&
        prevData.average != null
          ? prevData.average
          : null;

      let trendStatement =
        'No previous-period comparison is available.';

      if (prevAvg != null) {
        const trendDiff =
          avg - prevAvg;

        if (trendDiff > 2) {
          trendStatement =
            'The current-period average is higher than the previous-period average.';
        } else if (trendDiff < -2) {
          trendStatement =
            'The current-period average is lower than the previous-period average.';
        } else {
          trendStatement =
            'The current-period average is generally consistent with the previous-period average.';
        }
      }

      return {
        narrative:
          `${name} recorded an average of ${avgDisplay} across ${count} data point${count !== 1 ? 's' : ''} during ${quarter}. ` +
          `Baseline: ${baselineDisplay}. ` +
          trendStatement +
          ' ' +
          criterionStatement +
          _ctx,
        status:
          'Manual Criterion Review Required',
      };
    }

    // Deterministic phrase picker: same goal → same index variation across templates.
    // Fall back to goal_area + desc when code is missing to preserve uniqueness.
    const hashCode = (str) => {
      let h = 0;
      for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
      }
      return Math.abs(h);
    };
    const seedStr = goal.code || `${goal.goal_area || ""}${goal.desc || ""}` || "goal";
    const seed = hashCode(seedStr);
    const pick = (arr) => arr[seed % arr.length];

    // ── Observation branch ────────────────────────────────────────────────────
    // Goals with measurement_type === 'Observation' get category-specific narrative
    // language rather than percentage-based copy.
    if (goal.measurement_type === 'Observation') {
      const obsConfig = goal.observation_config || {};
      const category = obsConfig.category || '';

      // Helper: parse [obs:category:payload] prefix — provided by obs-utils.js as parseObservationNotes

      const entries = quarterData.entries || [];

      if (count === 0) {
        return {
          narrative: `No observation data was collected for ${name} in the area of ${area} during ${quarter}. Increased observation opportunities are recommended.` + _ctx,
          status: 'Not Making Progress',
        };
      }

      // ── session_outcome ──
      if (category === 'session_outcome') {
        const validEntries = entries.filter(e => {
          const p = parseObservationNotes(e.notes);
          return p && p.category === 'session_outcome' && p.rawData !== 'na';
        });
        const metEntries = validEntries.filter(e => {
          const p = parseObservationNotes(e.notes);
          return p && p.rawData === 'met';
        });
        const metCount = metEntries.length;
        const validCount = validEntries.length;
        const targetSessions = parseGoalValue(goal.mastery || goal.target) ?? 3;
        let status;
        if (validCount === 0) {
          status = 'Not Making Progress';
        } else if (metCount >= targetSessions) {
          status = 'Goal Met';
        } else if (metCount >= targetSessions * 0.6) {
          status = 'Making Adequate Progress';
        } else if (metCount > 0) {
          status = 'Progressing but Not Sufficient';
        } else {
          status = 'Not Making Progress';
        }
        const narrative = validCount > 0
          ? pick([
              `${name} met the behavioral target in ${metCount} of ${validCount} observed session${validCount !== 1 ? 's' : ''} during ${quarter}.`,
              `During ${quarter}, ${name} demonstrated the target behavior in ${metCount} out of ${validCount} recorded session${validCount !== 1 ? 's' : ''}.`,
              `Observation data from ${quarter} indicates ${name} met the session target ${metCount} of ${validCount} time${validCount !== 1 ? 's' : ''}.`,
            ])
          : `No evaluable observation sessions were recorded for ${name} in ${area} during ${quarter}.`;
        return { narrative: narrative + _ctx, status };
      }

      // ── tally ──
      if (category === 'tally') {
        const prevAvg = prevData ? prevData.average : null;
        const trendDiff = prevAvg != null ? avg - prevAvg : null;
        const trend = trendDiff == null ? 'new' : trendDiff > 2 ? 'improving' : trendDiff < -2 ? 'declining' : 'maintaining';
        let status;
        if (avg == null) {
          status = 'Not Making Progress';
        } else if (avg >= targetVal) {
          status = 'Goal Met';
        } else if (trend === 'improving') {
          status = 'Making Adequate Progress';
        } else if (avg >= baselineVal) {
          status = 'Progressing but Not Sufficient';
        } else {
          status = 'Not Making Progress';
        }
        const avgStr = avg != null ? avg.toFixed(0) : '—';
        const countDesc = `${count} observed opportunit${count !== 1 ? 'ies' : 'y'}`;
        const narrative = pick([
          `${name} demonstrated the target behavior in an average of ${avgStr}% of opportunities across ${countDesc} during ${quarter}.`,
          `Across ${countDesc} in ${quarter}, ${name} averaged a ${avgStr}% success rate for this observational goal.`,
          `Tally data collected over ${countDesc} this quarter shows ${name} achieved the target ${avgStr}% of the time.`,
        ]);
        return { narrative: narrative + _ctx, status };
      }

      // ── prompt_count ──
      if (category === 'prompt_count') {
        const targetMax = obsConfig.target_max_prompts != null ? obsConfig.target_max_prompts : (parseGoalValue(goal.mastery || goal.target) ?? 2);
        // avg stores the numeric prompt count average (raw values, not %)
        const avgPrompts = avg != null ? avg : null;
        let status;
        if (avgPrompts == null) {
          status = 'Not Making Progress';
        } else if (avgPrompts <= targetMax) {
          status = 'Goal Met';
        } else if (avgPrompts <= targetMax * 1.5) {
          status = 'Making Adequate Progress';
        } else {
          status = 'Progressing but Not Sufficient';
        }
        const avgStr = avgPrompts != null ? avgPrompts.toFixed(1) : '—';
        const countDesc = `${count} session${count !== 1 ? 's' : ''}`;
        const narrative = pick([
          `${name} required an average of ${avgStr} prompt${avgStr !== '1.0' ? 's' : ''} to initiate the target behavior across ${countDesc} during ${quarter}. The goal target is ${targetMax} or fewer prompt${targetMax !== 1 ? 's' : ''}.`,
          `Across ${countDesc} in ${quarter}, ${name} averaged ${avgStr} prompt${avgStr !== '1.0' ? 's' : ''} per observation. The target maximum is ${targetMax} prompt${targetMax !== 1 ? 's' : ''}.`,
          `Data collected over ${countDesc} this quarter indicates ${name} needed an average of ${avgStr} prompt${avgStr !== '1.0' ? 's' : ''} (target: ${targetMax} or fewer).`,
        ]);
        return { narrative: narrative + _ctx, status };
      }

      // ── behavior_checklist ──
      if (category === 'behavior_checklist') {
        const subBehaviors = obsConfig.sub_behaviors || [];
        const totalBehaviors = subBehaviors.length || 1;
        const behaviorCounts = {};
        for (const e of entries) {
          const p = parseObservationNotes(e.notes);
          if (!p || p.category !== 'checklist') continue;
          const items = p.rawData ? p.rawData.split(',') : [];
          for (const item of items) {
            const eqIdx = item.lastIndexOf('=');
            if (eqIdx === -1) continue;
            const bName = item.slice(0, eqIdx).trim();
            const outcome = item.slice(eqIdx + 1).trim();
            if (!behaviorCounts[bName]) behaviorCounts[bName] = { met: 0, total: 0 };
            behaviorCounts[bName].total++;
            if (outcome === 'met') behaviorCounts[bName].met++;
          }
        }
        const consistentlyMet = Object.keys(behaviorCounts).filter(b => {
          const bc = behaviorCounts[b];
          return bc.total > 0 && (bc.met / bc.total) >= 0.75;
        });
        const avgMet = avg != null ? ((avg / 100) * totalBehaviors).toFixed(1) : '—';
        let status;
        if (avg == null) {
          status = 'Not Making Progress';
        } else if (avg >= targetVal) {
          status = 'Goal Met';
        } else if (avg >= baselineVal) {
          status = 'Making Adequate Progress';
        } else {
          status = 'Not Making Progress';
        }
        const countDesc = `${count} observation${count !== 1 ? 's' : ''}`;
        const consistentNote = consistentlyMet.length > 0
          ? ` ${name} consistently demonstrated: ${consistentlyMet.slice(0, 3).join(', ')}.`
          : '';
        const narrative = pick([
          `${name} met an average of ${avgMet} of ${totalBehaviors} target behaviors per session across ${countDesc} during ${quarter}.${consistentNote}`,
          `Across ${countDesc} in ${quarter}, ${name} demonstrated an average of ${avgMet}/${totalBehaviors} checklist behaviors.${consistentNote}`,
          `Behavior checklist data from ${countDesc} this quarter shows ${name} averaged ${avgMet} of ${totalBehaviors} behaviors met per session.${consistentNote}`,
        ]);
        return { narrative: narrative + _ctx, status };
      }

      // Fallback for unknown observation category
      const avgStr = avg != null ? avg.toFixed(0) : '—';
      return {
        narrative: `${name} worked on the observational goal in the area of ${area} during ${quarter}, with ${count} recorded session${count !== 1 ? 's' : ''} and an average value of ${avgStr}.` + _ctx,
        status: avg != null && avg >= targetVal ? 'Goal Met' : 'Progressing but Not Sufficient',
      };
    }
    // ── End observation branch ────────────────────────────────────────────────

    // --- Determine data density ---
    const dataLevel = count === 0 ? "none" : count <= 2 ? "limited" : "sufficient";

    // --- No-data path ---
    if (dataLevel === "none") {
      const openings = [
        `No performance data was collected for ${name} in the area of ${area} during ${quarter}.`,
        `Data collection for ${area} was not recorded for ${name} during the ${quarter} reporting period.`,
        `${name}'s progress on this goal was not measured during ${quarter}.`,
      ];
      const closings = [
        `Increased data collection opportunities are recommended for the next quarter.`,
        `Additional data points should be gathered to accurately measure progress toward the ${goal.mastery || goal.target || targetVal.toFixed(0)} criterion.`,
        `It is recommended that data collection for this goal be prioritized in the upcoming quarter.`,
      ];
      return {
        narrative: `${pick(openings)} ${pick(closings)}` + _ctx,
        status: "Not Making Progress",
      };
    }

    // --- Baseline comparison ---
    const baselineDiff = avg - baselineVal;
    const baselineComp =
      baselineDiff > 5 ? "above" : baselineDiff >= -5 ? "at" : "below";

    // --- Target proximity ---
    const targetDiff = avg - targetVal;
    const targetProx =
      targetDiff >= 0 ? "met" : targetDiff >= -10 ? "approaching" : "far";

    // --- Trend direction ---
    const prevAvg = prevData ? prevData.average : null;
    const trendDiff = prevAvg != null ? avg - prevAvg : null;
    const trend =
      trendDiff == null
        ? "new"
        : trendDiff > 2
        ? "improving"
        : trendDiff < -2
        ? "declining"
        : "maintaining";

    // --- Determine progress status ---
    let status;
    if (targetProx === "met") {
      status = "Goal Met";
    } else if (
      trend === "improving" &&
      baselineComp !== "below"
    ) {
      status = "Making Adequate Progress";
    } else if (
      trend === "maintaining" &&
      (baselineComp === "above" || baselineComp === "at")
    ) {
      status = "Making Adequate Progress";
    } else if (baselineComp === "above" && targetProx !== "far") {
      status = "Making Adequate Progress";
    } else if (baselineComp !== "below") {
      status = "Progressing but Not Sufficient";
    } else {
      status = "Not Making Progress";
    }

    // --- Opening sentence (based on trend) ---
    let opening;
    if (trend === "improving") {
      opening = pick([
        `${name} demonstrated growth in ${area} during ${quarter}.`,
        `${name} showed measurable improvement in ${area} this reporting period.`,
        `${name} made meaningful progress in ${area} during ${quarter}.`,
        `${name}'s performance in ${area} improved during the ${quarter} quarter.`,
      ]);
    } else if (trend === "declining") {
      opening = pick([
        `${name} experienced some challenges in ${area} during ${quarter}.`,
        `${name}'s performance in ${area} showed a decline this reporting period.`,
        `${name} required additional support in ${area} during the ${quarter} quarter.`,
      ]);
    } else if (trend === "maintaining") {
      opening = pick([
        `${name} continued to work on ${area} during ${quarter}.`,
        `${name} maintained consistent performance in ${area} this quarter.`,
        `${name}'s performance in ${area} remained steady during the ${quarter} reporting period.`,
      ]);
    } else {
      // "new" — data exists but no previous quarter for comparison
      opening = pick([
        `${name} worked on ${area} during ${quarter}.`,
        `During ${quarter}, ${name} engaged with goals in the area of ${area}.`,
        `${name} demonstrated performance in ${area} during the ${quarter} reporting period.`,
      ]);
    }

    // --- Middle sentence (data summary) ---
    // Bug 10: guard against null avg (can happen when count > 0 but values failed to parse)
    if (avg == null) {
      // avg can be null when count > 0 but all recorded values failed to parse (e.g.
      // non-numeric entries).  Return a graceful fallback instead of crashing on
      // avg.toFixed(0).
      return {
        narrative: `Data was collected for ${name} in the area of ${area} during ${quarter} (${count} data point${count !== 1 ? 's' : ''}), but values could not be calculated. Please verify the recorded data.` + _ctx,
        status: 'Not Making Progress',
      };
    }
    // Bug 1: use formatGoalValue so x/y, Number, etc. display correctly (no hardcoded %)
    const avgStr = formatGoalValue(avg, goal.measurement_type, goal);
    // Display the raw text baseline value (e.g. "1/5", "60%"); fall back to numeric string
    const baselineStr = (goal.baseline != null && goal.baseline !== '') ? String(goal.baseline) : baselineVal.toFixed(0);
    const countDesc = `${count} data point${count !== 1 ? "s" : ""}`;
    const comparison =
      baselineComp === "above"
        ? `up from a baseline of ${baselineStr}`
        : baselineComp === "below"
        ? `compared to a baseline of ${baselineStr}`
        : `consistent with a baseline of ${baselineStr}`;

    let middle;
    if (dataLevel === "limited") {
      middle = pick([
        `With ${countDesc} collected, ${name} achieved an average of ${avgStr}, ${comparison}.`,
        `Based on ${countDesc}, ${name} scored an average of ${avgStr}, ${comparison}.`,
        `Data from ${countDesc} this quarter shows an average score of ${avgStr}, ${comparison}.`,
      ]);
    } else {
      middle = pick([
        `With ${countDesc} collected, ${name} achieved an average of ${avgStr}, ${comparison}.`,
        `Across ${countDesc} this quarter, ${name} averaged ${avgStr}, ${comparison}.`,
        `Performance across ${countDesc} reflects an average of ${avgStr}, ${comparison}.`,
      ]);
    }

    // --- Closing sentence (target proximity) ---
    // Bug 2: strip any trailing % already present in raw mastery/target fields to avoid
    // double-suffix (e.g. "80%%"), then re-append % only for percent-like measurement types.
    const rawTargetStr = (goal.mastery != null && goal.mastery !== '') ? String(goal.mastery)
      : (goal.target != null && goal.target !== '') ? String(goal.target)
      : targetVal.toFixed(0);
    const targetStrClean = rawTargetStr.replace(/%$/, '');
    // Goals without an explicit measurement_type are treated as Percent (the historical
    // default).  Only Percent and Accuracy goals append a % suffix.
    const isPercentType = !goal.measurement_type || ['Percent', 'Accuracy'].includes(goal.measurement_type);
    const targetStr = isPercentType ? `${targetStrClean}%` : rawTargetStr;
    let closing;
    if (targetProx === "met") {
      closing = pick([
        `${name} has met the target criterion of ${targetStr} and is demonstrating mastery of this goal.`,
        `With an average exceeding the ${targetStr} criterion, ${name} has demonstrated mastery on this goal.`,
        `${name} has achieved the annual goal target of ${targetStr}, indicating successful mastery.`,
      ]);
    } else if (targetProx === "approaching") {
      closing = pick([
        `${name} is making adequate progress toward the annual target of ${targetStr}.`,
        `${name} is on track to meet the ${targetStr} mastery criterion with continued support.`,
        `With continued effort, ${name} is progressing toward the ${targetStr} annual target.`,
      ]);
    } else {
      // far from target
      if (trend === "declining") {
        closing = pick([
          `Progress toward the ${targetStr} annual criterion requires additional intervention and support.`,
          `${name} continues to work toward the ${targetStr} target; a review of current supports is recommended.`,
          `Additional targeted intervention is recommended to help ${name} progress toward the ${targetStr} criterion.`,
        ]);
      } else {
        closing = pick([
          `${name} continues to work toward the target criterion of ${targetStr}. Continued practice and support are recommended.`,
          `Additional instructional support will help ${name} reach the ${targetStr} annual target.`,
          `${name} is working toward the ${targetStr} goal criterion and will benefit from continued focused instruction.`,
        ]);
      }
    }

    // Optional caveat for limited data
    const caveat =
      dataLevel === "limited"
        ? pick([
            " Note: This summary is based on limited data; additional collection will provide a clearer picture.",
            " These results are based on limited data and should be interpreted with caution.",
          ])
        : "";

    return {
      narrative: `${opening} ${middle} ${closing}${caveat}` + _ctx,
      status,
    };
  }

  /**
   * Generate narrative for goal progress (uses rich narrative engine)
   */
  function generateNarrative(student, goal, quarterData, prevQuarterData) {
    const { narrative } = buildRichProgressNarrative(
      student,
      goal,
      quarterData,
      prevQuarterData,
      tab1State ? tab1State.quarter : "this quarter"
    );
    return narrative;
  }

  /**
   * Render grades for a specific quarter
   */
  function renderGradesForQuarter(studentCode, quarterRange) {
    if (!quarterRange.start || !quarterRange.end) {
      return '<div class="rp-grades-section"><h3 class="rp-section-heading" style="margin-top:24px;">Grades This Quarter</h3><div class="rp-empty">Invalid quarter range.</div></div>';
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
      return '<div class="rp-grades-section"><h3 class="rp-section-heading" style="margin-top:24px;">Grades This Quarter</h3><div class="rp-empty">No assignments found for this quarter.</div></div>';
    }

    // Build grades table
    let html =
      '<div class="rp-grades-section"><h3 class="rp-section-heading" style="margin-top:24px;">Grades This Quarter</h3><table class="rp-table"><caption>Grades This Quarter</caption><thead><tr><th>Assignment</th><th>Due Date</th><th>Status</th><th>Score</th></tr></thead><tbody>';

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
          body { font-family: 'Calibri', Georgia, Arial, sans-serif; margin: 0.75in 1in; color: #000; background: #fff; font-size: 11pt; line-height: 1.5; }
          h2 { font-size: 20pt; font-weight: 700; margin: 0 0 12px 0; letter-spacing: -0.02em; }
          h3 { font-size: 14pt; font-weight: 700; margin: 18pt 0 8pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          .rp-report-meta { margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 12px; background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 4px; }
          .rp-report-meta div { margin: 3px 0; font-size: 10.5pt; }
          .rp-goal-card { border: 1px solid #ccc; border-left: 3px solid #2563eb; padding: 14px 16px; margin-bottom: 14px; page-break-inside: avoid; border-radius: 4px; }
          .rp-goal-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
          .rp-goal-code { font-weight: 700; color: #1e3a5f; margin-right: 10px; }
          .rp-goal-area { color: #666; }
          .rp-goal-desc { margin: 8px 0; line-height: 1.6; }
          .rp-goal-targets { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin: 10px 0; font-size: 10pt; }
          .rp-goal-narrative, .rp-goal-status { margin: 10px 0; }
          .rp-narrative-edit { width: 100%; border: 1px solid #ccc; padding: 8px; font-family: inherit; font-size: 10.5pt; }
          .rp-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
          .rp-table th, .rp-table td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
          .rp-table th { background-color: #f0f0f0; font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; }
          .rp-grades-summary { margin: 14px 0; display: flex; gap: 30px; font-size: 10.5pt; }
          .rp-trend-up { color: #15803d; }
          .rp-trend-down { color: #dc2626; }
          .rp-trend-neutral { color: #6b7280; }
        </style>
      </head>
      <body>
        ${cleanedContent}
        <p style="margin-top: 30px; font-size: 9pt; color: #666;"><em>Generated on ${generatedDate}</em></p>
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
    body { font-family: 'Calibri', Georgia, Arial, sans-serif; margin: 1in; font-size: 11pt; line-height: 1.5; color: #000; }
    h1 { font-size: 20pt; font-weight: 700; margin-bottom: 16px; letter-spacing: -0.02em; }
    h2 { font-size: 16pt; font-weight: 700; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    h3 { font-size: 13pt; font-weight: 700; margin-top: 16px; margin-bottom: 8px; }
    p { margin: 5px 0; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10pt; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background-color: #f0f0f0; font-weight: 700; }
    .rp-goal-card { border: 1px solid #ccc; border-left: 3px solid #2563eb; padding: 12px 14px; margin-bottom: 12px; }
    .rp-goal-code { font-weight: 700; color: #1e3a5f; }
    .rp-trend-up { color: #15803d; }
    .rp-trend-down { color: #dc2626; }
    .rp-trend-neutral { color: #6b7280; }
  </style>
</head>
<body>
  ${cleanedContent}
  <p style="margin-top: 30px; font-size: 9pt; color: #666;"><em>Generated on ${escapeXml(generatedDate)}</em></p>
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
    try {

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

        <h3 class="rp-section-heading">IEP Goals Overview</h3>
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
              <div><strong>Baseline:</strong> ${escapeHtml(String(goal.baseline || 'N/A'))}</div>
              <div><strong>Latest:</strong> ${formatGoalValue(latestValue, goal.measurement_type, goal)}</div>
              <div><strong>Mastery:</strong> ${escapeHtml(String(goal.mastery || goal.target || 'N/A'))}</div>
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

    // AI Skills Summary placeholder — populated asynchronously after render
    summaryHtml += `<div id="rpAiSkillsPlaceholder"><h3 class="rp-section-heading">🤖 AI Skills Summary</h3><div class="rp-empty" style="font-style:italic;opacity:0.6;">Loading cached skills summary…</div></div>`;

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
    } catch (err) {
      renderTabErrorCard(container, renderTab2, err);
    }

    // Load and inject AI skills summary asynchronously (read-only, no new AI calls)
    // Runs outside the try/catch because it handles its own errors and updates the DOM directly.
    loadAISkillsForTab2(tab2State.studentCode);
  }

  /**
   * Fetch cached AI skills and populate the #rpAiSkillsPlaceholder element in Tab 2.
   */
  async function loadAISkillsForTab2(studentCode) {
    const placeholder = document.getElementById("rpAiSkillsPlaceholder");
    if (!placeholder) return;
    const skills = await fetchCachedSkillsForStudent(studentCode);
    if (!skills || skills.length === 0) {
      placeholder.innerHTML = `<h3 class="rp-section-heading">🤖 AI Skills Summary</h3><div class="rp-empty rp-ai-skills-note">No AI skills summary available — generate one from the Students page.</div>`;
      return;
    }
    const TIER_LABELS = { excellent: 'Excellent', 'on-track': 'On Track', 'needs-support': 'Needs Support', critical: 'Critical' };
    let html = `<h3 class="rp-section-heading">🤖 AI Skills Summary</h3><div class="rp-ai-skills-list">`;
    for (const skill of skills) {
      const tierLabel = TIER_LABELS[skill.tier] || skill.tier || '';
      html += `<div class="rp-ai-skill-item">
        <div class="rp-ai-skill-header">
          <span class="rp-ai-skill-code">${escapeHtml(skill.code)}</span>
          <span class="rp-skill-tier-badge rp-skill-tier-${escapeHtml(skill.tier || '')}">${escapeHtml(tierLabel)}</span>
        </div>`;
      if (skill.plain_language) {
        html += `<div class="rp-ai-skill-plain">${escapeHtml(skill.plain_language)}</div>`;
      }
      if (skill.goal_recommendation && (skill.tier === 'needs-support' || skill.tier === 'critical')) {
        html += `<div class="rp-ai-skill-rec">💡 ${escapeHtml(skill.goal_recommendation)}</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    placeholder.innerHTML = html;
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
        <caption>Grades Overview</caption>
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
          <td>${latestPoint ? formatGoalValue(parseFloat(latestPoint.value), goal.measurement_type, goal) : "N/A"}</td>
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
          <caption>IEP Goal Progress by Quarter</caption>
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
    try {
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
    html += renderAssignmentPerformanceTable(tab3State.classFilter, tab3State.typeFilter);

    // Item difficulty analytics
    html += renderItemAnalysis(tab3State.classFilter);

    // Student performance table
    html += renderStudentPerformanceTable(filteredStudents, quarterRange);

    // Quarter comparison section (if enabled)
    if (tab3State.compareQuarters) {
      html += renderQuarterComparison(filteredStudents);
    }

    // AI Trends section
    html += `
      <div style="margin-top:20px;padding:16px;border:2px solid #c4b5fd;border-radius:8px;background:#faf5ff;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <strong style="color:#6d28d9;">✨ AI Trend Analysis</strong>
          <label for="tab3AiTrendsAudience" style="color:#6d28d9;font-weight:600;">Audience:</label>
          <select id="tab3AiTrendsAudience" class="rp-select" style="width:auto;margin:0 8px;">
            <option value="admin">Administrator / IEP Team</option>
            <option value="parent">Parent / Guardian</option>
          </select>
          <button class="tc-btn" id="tab3BtnAnalyzeTrends" type="button">✨ Analyze Trends</button>
        </div>
        <span id="tab3AiTrendsStatus" style="display:none;margin-top:8px;color:#555;font-style:italic;"></span>
        <div id="tab3AiTrendsResult" style="display:none;margin-top:12px;">
          <textarea id="tab3AiTrendsText" rows="10" style="width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;line-height:1.6;border:1px solid #c4b5fd;border-radius:4px;padding:8px;background:#fff;resize:vertical;"></textarea>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="tc-btn tc-btn-small" id="tab3BtnCopyTrends" type="button">📋 Copy</button>
            <button class="tc-btn tc-btn-small" id="tab3BtnReanalyzeTrends" type="button">🔄 Regenerate</button>
          </div>
        </div>
      </div>
    `;

    // Export actions
    html += `
      <div class="rp-export-actions">
        <button class="tc-btn" id="btnExportClassCSV" type="button">⬇️ Export CSV</button>
        <button class="tc-btn" id="btnExportClassDistrictCSV" type="button">🏫 Export for District</button>
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

    const typeFilterSelect = $("rpTypeFilter");
    if (typeFilterSelect) {
      typeFilterSelect.addEventListener("change", (e) => {
        tab3State.typeFilter = e.target.value;
        renderTab3();
      });
    }

    const btnExportCSV = $("btnExportClassCSV");
    if (btnExportCSV) {
      btnExportCSV.addEventListener("click", () => exportClassPerformanceCSV());
    }

    const btnExportClassDistrict = $("btnExportClassDistrictCSV");
    if (btnExportClassDistrict) {
      btnExportClassDistrict.addEventListener("click", () => exportClassPerformanceDistrictCSV());
    }

    const btnPrint = $("btnPrintClass");
    if (btnPrint) {
      btnPrint.addEventListener("click", () => window.print());
    }

    const btnAnalyzeTrends = $("tab3BtnAnalyzeTrends");
    if (btnAnalyzeTrends) {
      btnAnalyzeTrends.addEventListener("click", () => handleAnalyzeTrends(false));
    }

    const btnReanalyzeTrends = $("tab3BtnReanalyzeTrends");
    if (btnReanalyzeTrends) {
      btnReanalyzeTrends.addEventListener("click", () => handleAnalyzeTrends(true));
    }

    const btnCopyTrends = $("tab3BtnCopyTrends");
    if (btnCopyTrends) {
      btnCopyTrends.addEventListener("click", () => {
        const textarea = $("tab3AiTrendsText");
        const text = textarea ? textarea.value : '';
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          const original = btnCopyTrends.textContent;
          btnCopyTrends.textContent = '\u2713 Copied!';
          setTimeout(() => { btnCopyTrends.textContent = original; }, 2000);
        }).catch((err) => {
          console.error('[tc-reporting] Failed to copy trend analysis:', err);
          const original = btnCopyTrends.textContent;
          btnCopyTrends.textContent = '❌ Copy failed';
          setTimeout(() => { btnCopyTrends.textContent = original; }, 2000);
        });
      });
    }
    } catch (err) {
      renderTabErrorCard(container, renderTab3, err);
    }
  }

  /**
   * Render assignment performance table
   */
  function renderAssignmentPerformanceTable(classFilter, typeFilter) {
    // Filter assignments by class if needed
    let relevantAssignments = assignmentsData;
    if (classFilter !== "All Classes") {
      relevantAssignments = assignmentsData.filter((a) => a.class_id === classFilter);
    }

    // Filter by type if specified
    const activeTypeFilter = typeFilter || 'All Types';
    if (activeTypeFilter !== 'All Types') {
      relevantAssignments = relevantAssignments.filter(
        (a) => getAssignmentTypeLabel(a) === activeTypeFilter
      );
    }

    if (relevantAssignments.length === 0 && assignmentsData.length === 0) {
      return '<h3 class="rp-section-heading">Assignment Performance</h3><div class="rp-empty">No assignments found.</div>';
    }

    const typeFilterHtml = `
      <div style="margin-bottom:10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <label for="rpTypeFilter" style="font-size:13px; font-weight:600; color:#334155;">Filter by type:</label>
        <select id="rpTypeFilter" style="padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; background:#fff; color:#111;">
          <option value="All Types"${activeTypeFilter === 'All Types' ? ' selected' : ''}>All Types</option>
          <option value="HTML"${activeTypeFilter === 'HTML' ? ' selected' : ''}>HTML</option>
          <option value="TXT"${activeTypeFilter === 'TXT' ? ' selected' : ''}>TXT</option>
          <option value="Link"${activeTypeFilter === 'Link' ? ' selected' : ''}>Link</option>
          <option value="File"${activeTypeFilter === 'File' ? ' selected' : ''}>File</option>
        </select>
        ${relevantAssignments.length !== assignmentsData.length ? `<span style="font-size:12px; color:#64748b;">Showing ${relevantAssignments.length} of ${assignmentsData.length}</span>` : ''}
      </div>`;

    if (relevantAssignments.length === 0) {
      return `<h3 class="rp-section-heading">Assignment Performance</h3>${typeFilterHtml}<div class="rp-empty">No assignments match the current filter.</div>`;
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
          typeBadge: getAssignmentTypeBadgeHtml(assignment),
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
        <td>${stat.typeBadge}</td>
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
      <h3 class="rp-section-heading">Assignment Performance</h3>
      ${typeFilterHtml}
      <div class="rp-table-container">
        <table class="rp-table rp-sortable">
          <caption>Assignment Performance</caption>
          <thead>
            <tr>
              <th>Assignment Title</th>
              <th>Type</th>
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
   * Render item difficulty analytics for a given class filter.
   * Aggregates submission answer data to show per-question difficulty rates,
   * most common wrong answers (MCQ/boolean), and type labels (constructed).
   */
  function renderItemAnalysis(classFilter) {
    // Filter assignments by class
    let relevantAssignments = assignmentsData;
    if (classFilter !== 'All Classes') {
      relevantAssignments = assignmentsData.filter((a) => a.class_id === classFilter);
    }

    // Only include assignments that have item metadata and at least one submission
    const analysisData = [];

    for (const assignment of relevantAssignments) {
      const items = buildItemsFromMeta(assignment.id, assignment.meta);
      if (!items || items.length === 0) continue;

      // Gather all submissions for this assignment
      const instances = instancesData.filter((inst) => inst.assignment_id === assignment.id);
      const submissions = instances
        .map((inst) => submissionsData.find((s) => s.instance_id === inst.id))
        .filter((s) => s && s.answers && typeof s.answers === 'object');

      if (submissions.length === 0) continue;

      const assignmentTitle = assignment.title || `Assignment ${assignment.id}`;
      const itemStats = [];

      for (const item of items) {
        const ref = item.item_ref || item.ref;
        if (!ref) continue;

        const answerType = item.answer_type || 'constructed';
        const correctAns = item.meta?.correct ?? item.correct;
        const qNum = item.meta?.question_number || ref;
        const label = `Q${qNum}`;

        if (answerType === 'constructed') {
          itemStats.push({ label, type: 'Written', difficulty: null, wrongAnswer: null });
          continue;
        }

        // MCQ / boolean — compute difficulty rate and most common wrong answer
        let correctCount = 0;
        let totalResponses = 0;
        const wrongAnswerCounts = {};

        for (const sub of submissions) {
          const studentAns = sub.answers[ref];
          if (studentAns === undefined || studentAns === null || studentAns === '') continue;
          totalResponses++;
          const normalizedStudent = String(studentAns).trim().toLowerCase();
          const normalizedCorrect = correctAns !== undefined && correctAns !== null
            ? String(correctAns).trim().toLowerCase()
            : null;
          if (normalizedCorrect !== null && normalizedStudent === normalizedCorrect) {
            correctCount++;
          } else {
            const wrong = String(studentAns).trim();
            wrongAnswerCounts[wrong] = (wrongAnswerCounts[wrong] || 0) + 1;
          }
        }

        const difficultyPct = totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : null;

        // Find most common wrong answer
        let mostCommonWrong = null;
        let mostCommonWrongCount = 0;
        for (const [ans, cnt] of Object.entries(wrongAnswerCounts)) {
          if (cnt > mostCommonWrongCount) {
            mostCommonWrong = ans;
            mostCommonWrongCount = cnt;
          }
        }

        itemStats.push({
          label,
          type: answerType === 'boolean' ? 'Boolean' : 'MCQ',
          difficulty: difficultyPct,
          totalResponses,
          wrongAnswer: mostCommonWrong,
          wrongAnswerPct: totalResponses > 0 ? Math.round((mostCommonWrongCount / totalResponses) * 100) : 0,
        });
      }

      if (itemStats.length > 0) {
        analysisData.push({ assignmentTitle, itemStats });
      }
    }

    if (analysisData.length === 0) {
      return '<h3 class="rp-section-heading">📊 Item Analysis</h3><div class="rp-empty">No item-level data available. Item analysis requires graded assignments with answer metadata.</div>';
    }

    let html = '<h3 class="rp-section-heading">📊 Item Analysis</h3>';

    const displayData = analysisData.slice(0, 10);
    if (analysisData.length > 10) {
      html += `<div style="margin-bottom:12px;font-size:12px;opacity:0.65;">Showing 10 of ${analysisData.length} assignments. Use the class or type filter above to narrow the view.</div>`;
    }

    for (const { assignmentTitle, itemStats } of displayData) {
      const rows = itemStats.map((stat) => {
        let difficultyCell;
        if (stat.type === 'Written') {
          difficultyCell = '<span class="rp-difficulty-badge rp-difficulty-written">Written</span>';
        } else if (stat.difficulty === null) {
          difficultyCell = '<span style="opacity:0.5">—</span>';
        } else {
          let badgeClass;
          let emoji;
          if (stat.difficulty >= 80) {
            badgeClass = 'rp-difficulty-easy';
            emoji = '✅';
          } else if (stat.difficulty >= 50) {
            badgeClass = 'rp-difficulty-moderate';
            emoji = '🟡';
          } else {
            badgeClass = 'rp-difficulty-hard';
            emoji = '🔴';
          }
          difficultyCell = `<span class="rp-difficulty-badge ${badgeClass}">${stat.difficulty}% ${emoji}</span>`;
        }

        let wrongCell;
        if (stat.wrongAnswer && stat.wrongAnswerPct > 0) {
          wrongCell = `${escapeHtml(stat.wrongAnswer)} <span style="opacity:0.6;font-size:11px;">(${stat.wrongAnswerPct}%)</span>`;
        } else {
          wrongCell = '<span style="opacity:0.5">—</span>';
        }

        return `
          <tr>
            <td>${escapeHtml(stat.label)}</td>
            <td>${escapeHtml(stat.type)}</td>
            <td>${difficultyCell}</td>
            <td>${stat.type === 'Written' ? '<span style="opacity:0.5">—</span>' : wrongCell}</td>
          </tr>
        `;
      }).join('');

      html += `
        <div style="margin-bottom:20px;">
          <div style="font-size:13px;font-weight:600;opacity:0.75;margin-bottom:8px;padding-left:2px;">${escapeHtml(assignmentTitle)}</div>
          <div class="rp-table-container">
            <table class="rp-table">
              <caption>Item Analysis — ${escapeHtml(assignmentTitle)}</caption>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Difficulty</th>
                  <th>Most Common Wrong Answer</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    return html;
  }

  /**
   * Render student performance table
   */
  function renderStudentPerformanceTable(students, quarterRange) {
    if (students.length === 0) {
      return '<h3 class="rp-section-heading">Student Performance</h3><div class="rp-empty">No students found.</div>';
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
        return goalData.average != null && goalData.average >= (parseGoalValue(goal.baseline) ?? 0);
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
      <h3 class="rp-section-heading">Student Performance</h3>
      <div class="rp-table-container">
        <table class="rp-table rp-sortable">
          <caption>Student Performance</caption>
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
      return '<h3 class="rp-section-heading">📊 Quarter Comparison</h3><div class="rp-empty">No students to compare.</div>';
    }

    let html = '<h3 class="rp-section-heading">📊 Quarter Comparison — Goal Progress Across Quarters</h3>';
    
    // Build comparison table
    html += `
      <div class="rp-table-container">
        <table class="rp-table">
          <caption>Goal Progress Across Quarters</caption>
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
      const studentGoals = goalsData.filter(g => g.student_code === student.code && isGoalActive(g));
      
      for (const goal of studentGoals) {
        const q1Data = getGoalProgressForQuarter(goal.code, student.code, getQuarterDateRange('Q1'));
        const q2Data = getGoalProgressForQuarter(goal.code, student.code, getQuarterDateRange('Q2'));
        const q3Data = getGoalProgressForQuarter(goal.code, student.code, getQuarterDateRange('Q3'));
        const q4Data = getGoalProgressForQuarter(goal.code, student.code, getQuarterDateRange('Q4'));

        const q1Avg = q1Data.average != null ? formatGoalValue(q1Data.average, goal.measurement_type, goal) : '—';
        const q2Avg = q2Data.average != null ? formatGoalValue(q2Data.average, goal.measurement_type, goal) : '—';
        const q3Avg = q3Data.average != null ? formatGoalValue(q3Data.average, goal.measurement_type, goal) : '—';
        const q4Avg = q4Data.average != null ? formatGoalValue(q4Data.average, goal.measurement_type, goal) : '—';

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
        return goalData.average != null && goalData.average >= (parseGoalValue(goal.baseline) ?? 0);
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
    try {
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
            <option value="semester-1" ${tab4State.quarter === "semester-1" ? "selected" : ""}>Semester 1 (Aug–Jan)</option>
            <option value="semester-2" ${tab4State.quarter === "semester-2" ? "selected" : ""}>Semester 2 (Feb–Jun)</option>
            <option value="full-year" ${tab4State.quarter === "full-year" ? "selected" : ""}>Full Year (Aug–Jun)</option>
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

    const quarterRange = getDateRangeForPeriod(tab4State.quarter);
    const allGoals = [];
    filteredStudents.forEach((student) => {
      const studentGoals = goalsData.filter(
        (g) => g.student_code === student.code && isGoalActive(g)
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
          <caption>Data Collection Compliance Log</caption>
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

    // AI Compliance Notes section
    html += `
      <div style="margin-top:20px;padding:16px;border:2px solid #c4b5fd;border-radius:8px;background:#faf5ff;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <strong style="color:#6d28d9;">✨ AI Compliance Notes</strong>
          <button class="tc-btn" id="tab4BtnDraftNotes" type="button">✨ Draft Compliance Notes</button>
        </div>
        <span id="tab4AiNotesStatus" style="display:none;margin-top:8px;color:#555;font-style:italic;"></span>
        <div id="tab4AiNotesResult" style="display:none;margin-top:12px;">
          <textarea id="tab4AiNotesText" rows="12" style="width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;line-height:1.6;border:1px solid #c4b5fd;border-radius:4px;padding:8px;background:#fff;resize:vertical;"></textarea>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="tc-btn tc-btn-small" id="tab4BtnCopyNotes" type="button">📋 Copy</button>
            <button class="tc-btn tc-btn-small" id="tab4BtnRedraftNotes" type="button">🔄 Regenerate</button>
          </div>
        </div>
      </div>
    `;

    // Export actions
    html += `
      <div class="rp-export-actions">
        <button class="tc-btn" id="btnExportComplianceCSV" type="button">⬇️ Export CSV</button>
        <button class="tc-btn" id="btnExportComplianceDistrictCSV" type="button">🏫 Export for District</button>
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

    const btnExportComplianceDistrict = $("btnExportComplianceDistrictCSV");
    if (btnExportComplianceDistrict) {
      btnExportComplianceDistrict.addEventListener("click", () => exportComplianceDistrictCSV());
    }

    const btnPrint = $("btnPrintCompliance");
    if (btnPrint) {
      btnPrint.addEventListener("click", () => window.print());
    }

    const btnDraftNotes = $("tab4BtnDraftNotes");
    if (btnDraftNotes) {
      btnDraftNotes.addEventListener("click", () => handleDraftComplianceNotes(false));
    }

    const btnRedraftNotes = $("tab4BtnRedraftNotes");
    if (btnRedraftNotes) {
      btnRedraftNotes.addEventListener("click", () => handleDraftComplianceNotes(true));
    }

    const btnCopyNotes = $("tab4BtnCopyNotes");
    if (btnCopyNotes) {
      btnCopyNotes.addEventListener("click", () => {
        const textarea = $("tab4AiNotesText");
        const text = textarea ? textarea.value : '';
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          const original = btnCopyNotes.textContent;
          btnCopyNotes.textContent = '\u2713 Copied!';
          setTimeout(() => { btnCopyNotes.textContent = original; }, 2000);
        }).catch((err) => {
          console.error('[tc-reporting] Failed to copy compliance notes:', err);
          const original = btnCopyNotes.textContent;
          btnCopyNotes.textContent = '❌ Copy failed';
          setTimeout(() => { btnCopyNotes.textContent = original; }, 2000);
        });
      });
    }
    } catch (err) {
      renderTabErrorCard(container, renderTab4, err);
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
          <caption>Grade Completion Gaps</caption>
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

    const quarterRange = getDateRangeForPeriod(tab4State.quarter);

    filteredStudents.forEach((student) => {
      const studentGoals = goalsData.filter(
        (g) => g.student_code === student.code && isGoalActive(g)
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
   * Escape a value for CSV output: wrap in quotes if it contains commas, quotes, or newlines.
   * @param {*} val
   * @returns {string}
   */
  function csvField(val) {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  /**
   * Prompt the user to select a roster CSV file and load it into district-translator.
   * Returns true if roster was loaded successfully, false if cancelled.
   * @returns {Promise<boolean>}
   */
  async function loadRosterIfNeeded() {
    if (isRosterLoaded()) return true;
    await rcAlert(
      'No Roster Loaded',
      'To export with real names, please select your student roster CSV file (code,real_name) in the next dialog.'
    );
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      input.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) { resolve(false); return; }
        const text = await file.text();
        const count = loadRoster(text);
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
  }

  /**
   * Export class performance CSV with student codes translated to real names.
   */
  async function exportClassPerformanceDistrictCSV() {
    const ready = await loadRosterIfNeeded();
    if (!ready) return;

    let csv = "Student Code,Name,Avg Grade,Assignments Complete,Missing,Goals On Track\n";
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
        return goalData.average != null && goalData.average >= (parseGoalValue(goal.baseline) ?? 0);
      }).length;
      csv += [student.code, csvField(student.name || student.code), avgGrade, complete, missing, `${goalsOnTrack}/${studentGoals.length}`].join(',') + '\n';
    });
    translateAndDownload(
      csv,
      `class_performance_district_${tab3State.classFilter.replace(/\s+/g, "_")}_${formatDateYYYYMMDD()}.csv`,
      'text/csv;charset=utf-8;'
    );
  }

  /**
   * Export compliance CSV with student codes translated to real names.
   */
  async function exportComplianceDistrictCSV() {
    const ready = await loadRosterIfNeeded();
    if (!ready) return;

    let csv =
      "Student Code,Student Name,Goal Code,Goal Area,Data Points (Q),Last Collected,Status\n";
    let filteredStudents = studentsData.filter((s) => s.active !== false);
    if (tab4State.classFilter !== "All Classes") {
      const classEnrollments = enrollmentsData.filter(
        (e) => e.class_name === tab4State.classFilter
      );
      const enrolledCodes = classEnrollments.map((e) => e.student_code);
      filteredStudents = filteredStudents.filter((s) => enrolledCodes.includes(s.code));
    }
    const quarterRange = getDateRangeForPeriod(tab4State.quarter);
    filteredStudents.forEach((student) => {
      const studentGoals = goalsData.filter(
        (g) => g.student_code === student.code && isGoalActive(g)
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
        csv += [student.code, csvField(student.name || student.code), goal.code, csvField(goal.goal_area || 'N/A'), goalData.count, lastCollected, status].join(',') + '\n';
      });
    });
    translateAndDownload(
      csv,
      `compliance_district_${tab4State.quarter}_${formatDateYYYYMMDD()}.csv`,
      'text/csv;charset=utf-8;'
    );
  }

  /**
   * Load saved report templates from localStorage
   * @returns {Array<Object>}
   */
  function loadReportTemplates() {
    try {
      const raw = localStorage.getItem('rc_report_templates');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[tc-reporting] Error loading report templates:', err.message);
      return [];
    }
  }

  /**
   * Save a named report template to localStorage (max 20)
   * @param {string} name
   * @param {Object} config
   * @returns {boolean} success
   */
  function saveReportTemplate(name, config) {
    // Only persist known template fields to avoid storing unintended properties
    const entry = {
      name,
      tab: config.tab || '',
      quarter: config.quarter || null,
      selectionMode: config.selectionMode || null,
      studentCode: config.studentCode !== undefined ? config.studentCode : null,
      selectedStudents: Array.isArray(config.selectedStudents) ? config.selectedStudents.slice() : [],
      audienceMode: config.audienceMode || null,
      dateRange: config.dateRange || null,
      customStart: config.customStart || null,
      customEnd: config.customEnd || null,
      outputFormat: config.outputFormat || null,
      dataSource: config.dataSource || null,
    };
    const templates = loadReportTemplates();
    const existingIdx = templates.findIndex((t) => t.name === name);
    if (existingIdx !== -1) {
      templates[existingIdx] = entry;
    } else {
      if (templates.length >= 20) {
        return false;
      }
      templates.push(entry);
    }
    try {
      localStorage.setItem('rc_report_templates', JSON.stringify(templates));
      return true;
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.code === 22) {
        console.warn('[tc-reporting] localStorage quota exceeded — template not saved');
      } else {
        console.warn('[tc-reporting] Error saving report template:', err.message);
      }
      return false;
    }
  }

  /**
   * Delete a named report template from localStorage
   * @param {string} name
   */
  function deleteReportTemplate(name) {
    const templates = loadReportTemplates().filter((t) => t.name !== name);
    try {
      localStorage.setItem('rc_report_templates', JSON.stringify(templates));
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.code === 22) {
        console.warn('[tc-reporting] localStorage quota exceeded');
      } else {
        console.warn('[tc-reporting] Error deleting report template:', err.message);
      }
    }
  }

  /**
   * TAB 5: Batch Reports - Generate Quarterly Progress Reports for All Students
   */
  function renderTab5() {
    try {
    // Render template controls
    const templateArea = $("tab5TemplateArea");
    if (templateArea) {
      const templates = loadReportTemplates().filter((t) => t.tab === 'tab5');
      const templateOptions = templates
        .map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`)
        .join('');
      templateArea.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">
          <select id="tab5TemplateSelect" class="rp-select" style="min-width:160px;" aria-label="Load saved template">
            <option value="">-- Load Template --</option>
            ${templateOptions}
          </select>
          <button class="tc-btn" id="tab5LoadTemplateBtn" type="button">Load</button>
          <button class="tc-btn" id="tab5DeleteTemplateBtn" type="button">Delete</button>
          <span style="margin:0 4px;opacity:0.4;">|</span>
          <input type="text" id="tab5TemplateNameInput" class="rp-select" placeholder="Template name..." style="min-width:140px;" aria-label="New template name">
          <button class="tc-btn" id="tab5SaveTemplateBtn" type="button">💾 Save</button>
        </div>
      `;

      const saveBtn = $("tab5SaveTemplateBtn");
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const nameInput = $("tab5TemplateNameInput");
          const tplName = nameInput ? nameInput.value.trim() : '';
          if (!tplName) return;
          const saved = saveReportTemplate(tplName, { tab: 'tab5', quarter: tab5State.quarter });
          if (saved) {
            if (nameInput) nameInput.value = '';
            renderTab5();
          } else {
            console.warn('[tc-reporting] Could not save template (max 20 reached or storage error)');
          }
        });
      }

      const loadBtn = $("tab5LoadTemplateBtn");
      if (loadBtn) {
        loadBtn.addEventListener('click', () => {
          const sel = $("tab5TemplateSelect");
          const tplName = sel ? sel.value : '';
          if (!tplName) return;
          const tpl = loadReportTemplates().find((t) => t.name === tplName);
          if (tpl && tpl.quarter) {
            tab5State.quarter = tpl.quarter;
            const quarterSelect = $("batchQuarterSelect");
            if (quarterSelect) quarterSelect.value = tab5State.quarter;
          }
        });
      }

      const deleteBtn = $("tab5DeleteTemplateBtn");
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          const sel = $("tab5TemplateSelect");
          const tplName = sel ? sel.value : '';
          if (!tplName) return;
          deleteReportTemplate(tplName);
          renderTab5();
        });
      }
    }

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
    } catch (err) {
      console.error('[tc-reporting] Error rendering batch reports tab:', err);
    }
  }

  /**
   * Generate batch quarterly progress reports for all students
   */
  async function generateBatchReports() {
    const quarter = tab5State.quarter;
    const quarterRange = getDateRangeForPeriod(quarter);
    const quarterLabel = getPeriodLabel(quarter);

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

    const _progContainer = $('tab5ProgressContainer');
    const _progLabel = $('tab5ProgressLabel');
    const _progFill = $('tab5ProgressFill');
    const _progBar = $('tab5ProgressBar');
    const _total = activeStudents.length;
    if (_progContainer) _progContainer.style.display = '';
    if (_progBar) _progBar.setAttribute('aria-valuemax', _total);

    // Generate HTML for all students
    let allStudentReportsHTML = "";
    let errorCount = 0;

    for (let index = 0; index < _total; index++) {
      const student = activeStudents[index];
      if (_progLabel) _progLabel.textContent = `Generating report ${index + 1} of ${_total}...`;
      if (_progFill) _progFill.style.width = `${Math.round(((index + 1) / _total) * 100)}%`;
      if (_progBar) _progBar.setAttribute('aria-valuenow', index + 1);
      await new Promise(r => setTimeout(r, 0));
      try {
      // Get student's goals
      const studentGoals = goalsData.filter(
        (g) => g.student_code === student.code && isGoalActive(g)
      );

      if (studentGoals.length === 0) {
        // Skip students with no goals
        continue;
      }

      // Get student's grade from enrollments
      const enrollment = enrollmentsData.find((e) => e.student_code === student.code);
      const grade = enrollment?.class_name || "N/A";

      // Pre-compute all goal progress for the summary panel
      const goalSummaries = studentGoals.map((g) => {
        const gp = getGoalProgressForQuarter(g.code, student.code, quarterRange);
        const prevRange = getPreviousQuarterRange(quarter);
        const prevGp = prevRange ? getGoalProgressForQuarter(g.code, student.code, prevRange) : null;
        const { status, narrative } = buildRichProgressNarrative(student, g, gp, prevGp, quarter);
        return { goal: g, progress: gp, status, narrative };
      });
      const totalDataPoints = goalSummaries.reduce((s, gs) => s + gs.progress.count, 0);
      const goalsWithData = goalSummaries.filter((gs) => gs.progress.count > 0);
      const overallAvg = goalsWithData.length > 0
        ? (goalsWithData.reduce((s, gs) => s + gs.progress.average, 0) / goalsWithData.length).toFixed(0)
        : null;
      const onTrackCount = goalSummaries.filter((gs) =>
        gs.status === "Goal Met" || gs.status === "Making Adequate Progress"
      ).length;
      const needsSupportCount = goalSummaries.filter((gs) =>
        gs.status === "Progressing but Not Sufficient" || gs.status === "Not Making Progress"
      ).length;
      const noDataCount = goalSummaries.filter((gs) => gs.progress.count === 0).length;

      // Start student section with page break (except for first student)
      const pageBreakStyle = index > 0 ? "page-break-before: always;" : "";
      const batchGoalDetailRowsHtml = goalSummaries.map(({ goal, progress, status, narrative }) => {
        const avgDisplay = formatGoalValue(progress.average, goal.measurement_type, goal);
        const statusColor =
          status === "Goal Met" ? "#16a34a" :
          status === "Making Adequate Progress" ? "#2563eb" :
          status === "Progressing but Not Sufficient" ? "#d97706" :
          "#dc2626";
        return `
          <div style="border-top:1px solid #c7d7f0; padding:10px 0;">
            <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
              <span style="font-weight:700; font-size:13px; color:#1e3a5f;">${escapeHtml(goal.code)}</span>
              <span style="font-size:13px; color:#333; word-break:break-word; overflow-wrap:break-word; flex:1; min-width:0;">${escapeHtml(goal.desc || "No description")}</span>
              <span style="margin-left:auto; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; background:${statusColor}; color:#fff; white-space:nowrap;">${escapeHtml(status)}</span>
            </div>
            <div style="font-size:12px; color:#555; margin-bottom:4px;">
              <strong>${progress.count}</strong> Data Points &nbsp;|&nbsp; <strong>${avgDisplay}</strong> Avg
            </div>
            <div style="font-size:12px; color:#444; font-style:italic; line-height:1.5; word-break:break-word; overflow-wrap:break-word;">${escapeHtml(narrative)}</div>
          </div>`;
      }).join("");
      allStudentReportsHTML += `
        <div class="student-section" style="${pageBreakStyle}">
          <div style="border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 16px;">
            <div style="font-size: 20px; font-weight: bold; color: #1e3a5f;">Reinisch Classroom — IEP Quarterly Progress Report</div>
            <div style="display:flex; justify-content:space-between; margin-top: 6px; font-size: 14px;">
              <span><strong>Student:</strong> ${escapeHtml(student.name || student.code)}</span>
              <span><strong>Grade/Class:</strong> ${escapeHtml(grade)}</span>
              <span><strong>School Year:</strong> ${escapeHtml(schoolYearLabel)}</span>
            </div>
          </div>

          <div style="background:#f0f4ff; border:1px solid #b8c9f0; border-radius:8px; padding:14px; margin-bottom:20px;">
            <div style="font-size:15px; font-weight:bold; color:#1e3a5f; margin-bottom:10px;">
              Quarterly IEP Progress Summary — ${escapeHtml(quarterLabel)}
            </div>
            <div style="display:flex; gap:20px; flex-wrap:wrap; font-size:13px; margin-bottom:12px;">
              <div style="text-align:center; min-width:80px;">
                <div style="font-size:22px; font-weight:bold; color:#1e3a5f;">${studentGoals.length}</div>
                <div style="color:#555;">Active Goals</div>
              </div>
              <div style="text-align:center; min-width:80px;">
                <div style="font-size:22px; font-weight:bold; color:#16a34a;">${onTrackCount}</div>
                <div style="color:#555;">On Track</div>
              </div>
              <div style="text-align:center; min-width:80px;">
                <div style="font-size:22px; font-weight:bold; color:#d97706;">${needsSupportCount}</div>
                <div style="color:#555;">Needs Support</div>
              </div>
              <div style="text-align:center; min-width:80px;">
                <div style="font-size:22px; font-weight:bold; color:#9ca3af;">${noDataCount}</div>
                <div style="color:#555;">No Data</div>
              </div>
              <div style="text-align:center; min-width:80px;">
                <div style="font-size:22px; font-weight:bold; color:#1e3a5f;">${overallAvg != null ? overallAvg + "%" : "N/A"}</div>
                <div style="color:#555;">Avg Score (%)</div>
              </div>
              <div style="text-align:center; min-width:80px;">
                <div style="font-size:22px; font-weight:bold; color:#1e3a5f;">${totalDataPoints}</div>
                <div style="color:#555;">Data Points</div>
              </div>
            </div>
            ${batchGoalDetailRowsHtml}
          </div>
      `;

      // Generate report for each goal using pre-computed summaries
      goalSummaries.forEach(({ goal, progress: goalProgress, status }) => {
        const dataPoints = getGoalDataPoints(goal.code, student.code, quarterRange);

        // Re-derive narrative (uses same deterministic engine as summary panel)
        const prevRange2 = getPreviousQuarterRange(quarter);
        const prevProgress2 = prevRange2 ? getGoalProgressForQuarter(goal.code, student.code, prevRange2) : null;
        const { narrative } = buildRichProgressNarrative(student, goal, goalProgress, prevProgress2, quarter);

        // Status badge colors
        const statusBadgeStyle =
          status === "Goal Met"
            ? "background:#16a34a;color:#fff;"
            : status === "Making Adequate Progress"
            ? "background:#2563eb;color:#fff;"
            : status === "Progressing but Not Sufficient"
            ? "background:#d97706;color:#fff;"
            : "background:#dc2626;color:#fff;";

        allStudentReportsHTML += `
          <div style="border-bottom: 2px solid #000; margin: 20px 0; padding-bottom: 20px; break-inside: avoid;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 10px;">
              <div>
                <strong style="font-size:15px;">${escapeHtml(goal.code)}</strong>
                &nbsp;&mdash;&nbsp;
                <em>${escapeHtml(goal.goal_area || "N/A")}</em>
              </div>
              <span style="padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600; ${statusBadgeStyle}">${escapeHtml(status)}</span>
            </div>

            <div style="margin-bottom: 10px; font-style: italic; color: #333;">
              ${escapeHtml(goal.desc || "N/A")}
            </div>

            <div style="display:flex; gap:24px; margin-bottom: 10px; font-size:13px;">
              <span><strong>Baseline:</strong> ${escapeHtml(String(goal.baseline || "N/A"))}</span>
              <span><strong>Current Avg:</strong> ${formatGoalValue(goalProgress.average, goal.measurement_type, goal)}</span>
              <span><strong>Mastery:</strong> ${escapeHtml(String(goal.mastery || goal.target || "N/A"))}</span>
              <span><strong>Data Points:</strong> ${goalProgress.count}</span>
            </div>

            <div style="margin-bottom: 10px;">
              <strong>Snapshot of data collected:</strong><br/>
              ${generateDataPointsList(dataPoints, goal)}
            </div>

            <div style="margin-top: 10px; padding: 10px; background: #f9f9f9; border-left: 3px solid #2563eb;">
              <strong>Progress Summary:</strong><br/>
              ${escapeHtml(narrative)}
            </div>
          </div>
        `;
      });

      allStudentReportsHTML += `</div>`; // Close student section
      } catch (err) {
        console.error(`[tc-reporting] Error generating report for ${student.code}:`, err);
        errorCount++;
      }
    }

    // Update progress to complete state
    if (_progContainer) {
      const done = _total - errorCount;
      if (_progLabel) _progLabel.textContent = errorCount > 0
        ? `Complete — ${done} of ${_total} reports generated (${errorCount} error${errorCount !== 1 ? 's' : ''})`
        : `Complete — ${_total} report${_total !== 1 ? 's' : ''} generated`;
      if (_progFill) _progFill.style.width = '100%';
      if (_progBar) {
        _progBar.setAttribute('aria-valuenow', String(_total));
        _progBar.setAttribute('aria-valuetext', 'Complete');
      }
    }

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
            font-family: 'Calibri', Georgia, Arial, sans-serif; 
            margin: 0.75in 1in; 
            color: #000; 
            background: #fff; 
            font-size: 11pt;
            line-height: 1.5;
          }
          .print-header {
            margin-bottom: 28px;
            padding-bottom: 16px;
            border-bottom: 2px solid #1e3a5f;
          }
          .print-header h1 {
            margin: 0 0 8px 0;
            font-size: 22pt;
            font-weight: 700;
            color: #1e3a5f;
            letter-spacing: -0.02em;
          }
          .print-header div {
            font-size: 10.5pt;
            color: #444;
            margin: 2px 0;
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
            font-size: 13px;
            font-weight: 700;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          }
          .print-btn:hover {
            background: #2563eb;
          }
          .student-section {
            margin-bottom: 48px;
          }
          @media print {
            body { margin: 0.75in 1in; }
            .print-btn {
              display: none;
            }
            .student-section {
              page-break-inside: avoid;
            }
            h2, h3 { page-break-after: avoid; }
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
  /**
   * TAB 6: Student Evidence Report
   * Generates comprehensive, printable evidence packets for IEP meetings / parent conferences.
   */
  function renderTab6() {
    const container = $("tab6Content");
    if (!container) return;
    try {
    const currentQ = getCurrentQuarter();
    const currentQLabel = getQuarterLabel(currentQ);

    const activeStudents = studentsData.filter((s) => s.active !== false);

    // Build student dropdown options
    const studentOptions = activeStudents
      .map(
        (s) =>
          `<option value="${escapeHtml(s.code)}" ${s.code === tab6State.studentCode ? "selected" : ""}>${escapeHtml(s.name || s.code)}</option>`
      )
      .join("");

    // Build mode buttons
    const modes = [
      { id: 'single', label: 'Single' },
      { id: 'multi', label: 'Multi-Select' },
      { id: 'all', label: 'All Students' },
    ];
    const modeBtns = modes
      .map(
        (m) =>
          `<button class="rp-ev-mode-btn${tab6State.selectionMode === m.id ? ' active' : ''}" data-mode="${escapeHtml(m.id)}" type="button">${escapeHtml(m.label)}</button>`
      )
      .join("");

    // Build audience buttons
    const audienceBtns = `
      <button class="rp-ev-mode-btn${tab6State.audienceMode === 'parent' ? ' active' : ''}" data-audience="parent" type="button">Parent</button>
      <button class="rp-ev-mode-btn${tab6State.audienceMode === 'admin' ? ' active' : ''}" data-audience="admin" type="button">Admin</button>
    `;

    // Single student selector
    const singleSelector = tab6State.selectionMode === 'single' ? `
      <div class="rp-filter-group">
        <label for="tab6Student">Student:</label>
        <select id="tab6Student" class="rp-select">
          <option value="">-- Select Student --</option>
          ${studentOptions}
        </select>
      </div>
    ` : '';

    // Multi-select panel
    const multiPanel = tab6State.selectionMode === 'multi' ? `
      <div class="rp-filter-group" style="flex-direction:column;align-items:flex-start;">
        <label>Select Students:</label>
        <div style="display:flex;gap:8px;margin-bottom:6px;">
          <button class="rp-ev-mode-btn" id="tab6SelectAll" type="button">Select All</button>
          <button class="rp-ev-mode-btn" id="tab6ClearAll" type="button">Clear All</button>
        </div>
        <div class="rp-ev-multi-list" id="tab6MultiList">
          ${activeStudents.map((s) => `
            <label class="rp-ev-multi-item">
              <input type="checkbox" value="${escapeHtml(s.code)}" ${tab6State.selectedStudents.includes(s.code) ? 'checked' : ''}>
              ${escapeHtml(s.name || s.code)}
            </label>
          `).join('')}
        </div>
        <div class="rp-ev-counter" id="tab6Counter">${tab6State.selectedStudents.length} of ${activeStudents.length} selected</div>
      </div>
    ` : '';

    // Date range selector
    const dateRangeOptions = [
      { value: 'current-quarter', label: `Current Quarter (${currentQLabel})` },
      { value: 'Q1', label: getQuarterLabel('Q1') },
      { value: 'Q2', label: getQuarterLabel('Q2') },
      { value: 'Q3', label: getQuarterLabel('Q3') },
      { value: 'Q4', label: getQuarterLabel('Q4') },
      { value: 'semester-1', label: 'Semester 1 (Aug–Jan)' },
      { value: 'semester-2', label: 'Semester 2 (Feb–Jun)' },
      { value: 'full-year', label: 'Full Year (Aug–Jun)' },
      { value: 'all-time', label: 'All Time' },
      { value: 'custom', label: 'Custom Range...' },
    ];
    const dateRangeHtml = dateRangeOptions
      .map(
        (o) =>
          `<option value="${escapeHtml(o.value)}" ${tab6State.dateRange === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
      )
      .join("");

    const customRangeHtml = tab6State.dateRange === 'custom' ? `
      <div class="rp-filter-group">
        <label for="tab6CustomStart">From:</label>
        <input type="date" id="tab6CustomStart" class="rp-select" value="${escapeHtml(tab6State.customStart || '')}">
      </div>
      <div class="rp-filter-group">
        <label for="tab6CustomEnd">To:</label>
        <input type="date" id="tab6CustomEnd" class="rp-select" value="${escapeHtml(tab6State.customEnd || '')}">
      </div>
    ` : '';

    // Build output format buttons
    const outputFormatBtns = `
      <button class="rp-ev-mode-btn${tab6State.outputFormat === 'print' ? ' active' : ''}" data-format="print" id="tab6FormatPrint" type="button">🖨️ Print / PDF</button>
      <button class="rp-ev-mode-btn${tab6State.outputFormat === 'zip' ? ' active' : ''}" data-format="zip" id="tab6FormatZip" type="button">📦 ZIP Download</button>
    `;

    // Data source label — shown next to toggle when 'auto' is selected
    const currentSourceLabel = usingSupabase ? 'School Database' : 'My Device';
    const dataSourceBtns = `
      <button class="rp-ev-mode-btn${tab6State.dataSource === 'local' ? ' active' : ''}" data-datasource="local" type="button">My Device</button>
      <button class="rp-ev-mode-btn${tab6State.dataSource === 'school' ? ' active' : ''}" data-datasource="school" type="button">School Database</button>
      ${tab6State.dataSource === 'auto' ? `<span style="font-size:12px;color:rgba(255,255,255,.5);margin-left:6px;">Auto: ${escapeHtml(currentSourceLabel)}</span>` : ''}
    `;

    // Build template selector options for Tab 6
    const tab6Templates = loadReportTemplates().filter((t) => t.tab === 'tab6');
    const tab6TemplateOptions = tab6Templates
      .map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`)
      .join('');

    container.innerHTML = `
      <div class="rp-ev-controls">
        <div class="rp-filter-group" style="grid-column:span 2;">
          <div class="rp-ev-ctrl-label">Templates</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <select id="tab6TemplateSelect" class="rp-select" style="min-width:160px;" aria-label="Load saved template">
              <option value="">-- Load Template --</option>
              ${tab6TemplateOptions}
            </select>
            <button class="tc-btn" id="tab6LoadTemplateBtn" type="button">Load</button>
            <button class="tc-btn" id="tab6DeleteTemplateBtn" type="button">Delete</button>
            <span style="margin:0 4px;opacity:0.4;">|</span>
            <input type="text" id="tab6TemplateNameInput" class="rp-select" placeholder="Template name..." style="min-width:140px;" aria-label="New template name">
            <button class="tc-btn" id="tab6SaveTemplateBtn" type="button">💾 Save</button>
          </div>
        </div>
        <div class="rp-filter-group">
          <div class="rp-ev-ctrl-label">Selection Mode</div>
          <div class="rp-ev-mode-group" id="tab6ModeGroup">${modeBtns}</div>
        </div>
        ${singleSelector}
        ${multiPanel}
        <div class="rp-filter-group">
          <div class="rp-ev-ctrl-label">Audience</div>
          <div class="rp-ev-mode-group" id="tab6AudienceGroup">${audienceBtns}</div>
        </div>
        <div class="rp-filter-group">
          <label class="rp-ev-ctrl-label" for="tab6DateRange">Date Range</label>
          <select id="tab6DateRange" class="rp-select">
            ${dateRangeHtml}
          </select>
        </div>
        ${customRangeHtml}
        <div class="rp-filter-group">
          <div class="rp-ev-ctrl-label">Output Format</div>
          <div class="rp-ev-mode-group" id="tab6FormatGroup">${outputFormatBtns}</div>
        </div>
        <div class="rp-filter-group">
          <div class="rp-ev-ctrl-label">Data Source</div>
          <div class="rp-ev-mode-group" id="tab6DataSourceGroup">${dataSourceBtns}</div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:8px;grid-column:span 1;">
          <button class="tc-btn" id="tab6PreviewBtn" type="button" style="flex:0 0 auto;justify-content:center;padding:10px 16px;">👁️ Preview</button>
          <button class="tc-btn" id="tab6GenerateBtn" type="button" style="flex:1;justify-content:center;padding:10px 20px;font-weight:700;">Generate Report</button>
        </div>
      </div>
      <div id="tab6ReportOutput"></div>
    `;

    // Wire up mode buttons
    container.querySelectorAll('#tab6ModeGroup .rp-ev-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab6State.selectionMode = btn.dataset.mode;
        renderTab6();
      });
    });

    // Wire up audience buttons
    container.querySelectorAll('#tab6AudienceGroup .rp-ev-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab6State.audienceMode = btn.dataset.audience;
        renderTab6();
      });
    });

    // Wire up single student selector
    const studentSelect = $("tab6Student");
    if (studentSelect) {
      studentSelect.addEventListener('change', (e) => {
        tab6State.studentCode = e.target.value || null;
      });
    }

    // Wire up multi-select checkboxes
    const multiList = $("tab6MultiList");
    if (multiList) {
      multiList.addEventListener('change', () => {
        tab6State.selectedStudents = Array.from(
          multiList.querySelectorAll('input[type=checkbox]:checked')
        ).map((cb) => cb.value);
        const counter = $("tab6Counter");
        if (counter) counter.textContent = `${tab6State.selectedStudents.length} of ${activeStudents.length} selected`;
      });
    }
    const selectAllBtn = $("tab6SelectAll");
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        tab6State.selectedStudents = activeStudents.map((s) => s.code);
        renderTab6();
      });
    }
    const clearAllBtn = $("tab6ClearAll");
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        tab6State.selectedStudents = [];
        renderTab6();
      });
    }

    // Wire up date range selector
    const dateRangeSelect = $("tab6DateRange");
    if (dateRangeSelect) {
      dateRangeSelect.addEventListener('change', (e) => {
        tab6State.dateRange = e.target.value;
        renderTab6();
      });
    }

    // Wire up custom date inputs
    const customStart = $("tab6CustomStart");
    if (customStart) {
      customStart.addEventListener('change', (e) => { tab6State.customStart = e.target.value; });
    }
    const customEnd = $("tab6CustomEnd");
    if (customEnd) {
      customEnd.addEventListener('change', (e) => { tab6State.customEnd = e.target.value; });
    }

    // Wire up output format buttons
    container.querySelectorAll('#tab6FormatGroup .rp-ev-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab6State.outputFormat = btn.dataset.format;
        renderTab6();
      });
    });

    // Wire up data source buttons
    container.querySelectorAll('#tab6DataSourceGroup .rp-ev-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab6State.dataSource = btn.dataset.datasource;
        renderTab6();
      });
    });

    // Wire up preview button
    const previewBtn = $("tab6PreviewBtn");
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        generateTab6Preview();
      });
    }

    // Wire up generate button
    const generateBtn = $("tab6GenerateBtn");
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        generateEvidenceReport().catch((err) => {
          console.error('[tc-reporting] Error generating evidence report:', err);
        });
      });
    }

    // Wire up template controls
    const tab6SaveBtn = $("tab6SaveTemplateBtn");
    if (tab6SaveBtn) {
      tab6SaveBtn.addEventListener('click', () => {
        const nameInput = $("tab6TemplateNameInput");
        const tplName = nameInput ? nameInput.value.trim() : '';
        if (!tplName) return;
        const saved = saveReportTemplate(tplName, {
          tab: 'tab6',
          selectionMode: tab6State.selectionMode,
          studentCode: tab6State.studentCode,
          selectedStudents: tab6State.selectedStudents.slice(),
          audienceMode: tab6State.audienceMode,
          dateRange: tab6State.dateRange,
          customStart: tab6State.customStart,
          customEnd: tab6State.customEnd,
          outputFormat: tab6State.outputFormat,
          dataSource: tab6State.dataSource,
        });
        if (saved) {
          if (nameInput) nameInput.value = '';
          renderTab6();
        } else {
          console.warn('[tc-reporting] Could not save template (max 20 reached or storage error)');
        }
      });
    }

    const tab6LoadBtn = $("tab6LoadTemplateBtn");
    if (tab6LoadBtn) {
      tab6LoadBtn.addEventListener('click', () => {
        const sel = $("tab6TemplateSelect");
        const tplName = sel ? sel.value : '';
        if (!tplName) return;
        const tpl = loadReportTemplates().find((t) => t.name === tplName);
        if (tpl) {
          if (tpl.selectionMode) tab6State.selectionMode = tpl.selectionMode;
          // Validate studentCode still exists in current dataset
          if (tpl.studentCode !== undefined) {
            const validCode = tpl.studentCode && studentsData.some((s) => s.code === tpl.studentCode);
            tab6State.studentCode = validCode ? tpl.studentCode : null;
          }
          // Validate selectedStudents against current dataset
          if (Array.isArray(tpl.selectedStudents)) {
            const validCodes = new Set(studentsData.map((s) => s.code));
            tab6State.selectedStudents = tpl.selectedStudents.filter((c) => validCodes.has(c));
          }
          if (tpl.audienceMode) tab6State.audienceMode = tpl.audienceMode;
          if (tpl.dateRange) tab6State.dateRange = tpl.dateRange;
          tab6State.customStart = tpl.customStart || null;
          tab6State.customEnd = tpl.customEnd || null;
          if (tpl.outputFormat) tab6State.outputFormat = tpl.outputFormat;
          if (tpl.dataSource) tab6State.dataSource = tpl.dataSource;
          renderTab6();
        }
      });
    }

    const tab6DeleteBtn = $("tab6DeleteTemplateBtn");
    if (tab6DeleteBtn) {
      tab6DeleteBtn.addEventListener('click', () => {
        const sel = $("tab6TemplateSelect");
        const tplName = sel ? sel.value : '';
        if (!tplName) return;
        deleteReportTemplate(tplName);
        renderTab6();
      });
    }
    } catch (err) {
      renderTabErrorCard(container, renderTab6, err);
    }
  }

  /**
   * Resolve the quarter range for tab6State
   */
  function getTab6DateRange() {
    const dr = tab6State.dateRange;
    if (dr === 'current-quarter') return getQuarterDateRange(getCurrentQuarter());
    if (dr === 'all-time') return { start: '2000-01-01', end: '2099-12-31' };
    if (dr === 'custom') return { start: tab6State.customStart || '2000-01-01', end: tab6State.customEnd || '2099-12-31' };
    if (dr === 'semester-1' || dr === 'semester-2' || dr === 'full-year') return getSchoolYearDateRange(dr);
    // Q1..Q4
    return getQuarterDateRange(dr);
  }

  /**
   * Get display label for the selected date range
   */
  function getTab6PeriodLabel() {
    const dr = tab6State.dateRange;
    if (dr === 'all-time') return 'All Time';
    if (dr === 'custom') return `${tab6State.customStart || '?'} – ${tab6State.customEnd || '?'}`;
    if (dr === 'current-quarter') return getQuarterLabel(getCurrentQuarter());
    if (dr === 'semester-1') return 'Semester 1 (Aug–Jan)';
    if (dr === 'semester-2') return 'Semester 2 (Feb–Jun)';
    if (dr === 'full-year') return 'Full Year (Aug–Jun)';
    return getQuarterLabel(dr);
  }

  /**
   * Build the evidence report HTML for a single student
   */
  function buildStudentEvidenceHtml(student, quarterRange, isParent) {
    const periodLabel = getTab6PeriodLabel();
    const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const audienceLabel = isParent ? 'Parent' : 'Admin';

    // Classes from enrollments
    const studentEnrollments = enrollmentsData.filter(
      (e) => e.student_code === student.code || e.student_id === student.code
    );
    const classNames = studentEnrollments.length > 0
      ? studentEnrollments.map((e) => escapeHtml(e.class_name || e.class_code || '')).filter(Boolean).join(', ')
      : 'N/A';

    const statusLabel = student.active !== false ? 'Active' : 'Inactive';

    // ── Profile Header ────────────────────────────────────────────────────────
    const profileHtml = `
      <div class="rp-ev-profile-card">
        <div class="rp-ev-profile-header">Student Evidence Report</div>
        <div class="rp-ev-profile-grid">
          <div><strong>Student:</strong> ${escapeHtml(student.name || student.code)} (${escapeHtml(student.code)})</div>
          <div><strong>Report Date:</strong> ${escapeHtml(todayLabel)}</div>
          <div><strong>Classes:</strong> ${classNames}</div>
          <div><strong>Period:</strong> ${escapeHtml(periodLabel)}</div>
          <div><strong>Status:</strong> ${escapeHtml(statusLabel)}</div>
          <div><strong>Mode:</strong> ${escapeHtml(audienceLabel)}</div>
        </div>
        <div class="rp-ev-confidential-banner">⚠️ CONFIDENTIAL — For authorized personnel only (FERPA)</div>
      </div>
    `;

    // ── IEP Goal Progress Summary ─────────────────────────────────────────────
    const activeGoals = goalsData.filter(
      (g) => g.student_code === student.code && isGoalActive(g)
    );

    let goalsHtml = '';
    if (activeGoals.length === 0) {
      goalsHtml = '<div class="rp-empty">No active IEP goals found for this student.</div>';
    } else {
      const goalRows = activeGoals.map((goal) => {
        const data = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
        const sparkline = data.values.length > 0 ? renderSparkline(data.values) : '—';
        const avgRaw = data.average != null ? data.average.toFixed(1) : null;
        let progressCell = '';
        if (isParent) {
          if (avgRaw == null) {
            progressCell = 'No data yet';
          } else if (data.average >= 80) {
            progressCell = '✅ On track';
          } else if (data.average >= 60) {
            progressCell = '📈 Making progress';
          } else {
            progressCell = '⚠️ Needs support';
          }
        } else {
          progressCell = data.average != null ? formatGoalValue(data.average, goal.measurement_type, goal) : '—';
        }
        const targetDisplay = goal.target != null ? escapeHtml(String(goal.target)) : '—';
        const masteryDisplay = goal.mastery != null ? escapeHtml(String(goal.mastery)) : targetDisplay;
        const baselineDisplay = goal.baseline != null ? escapeHtml(String(goal.baseline)) : '—';

        return `
          <tr>
            <td>${escapeHtml(goal.code || goal.id || '—')}</td>
            <td>${escapeHtml(goal.area || goal.skill_area || '—')}</td>
            <td>${baselineDisplay}</td>
            <td style="color:${avgRaw != null ? scoreColor(parseFloat(avgRaw)) : 'inherit'}">${progressCell}</td>
            <td>${masteryDisplay}</td>
            <td>${targetDisplay}</td>
            <td>${isParent ? '' : `${data.count} pts`}</td>
            <td>${sparkline}</td>
          </tr>
        `;
      }).join('');

      const adminHeaders = isParent ? '' : '<th>Data Pts</th>';
      goalsHtml = `
        <table class="rp-table" style="width:100%">
          <caption>IEP Goal Progress</caption>
          <thead>
            <tr>
              <th>Goal</th><th>Area</th><th>Baseline</th><th>Progress</th><th>Mastery</th><th>Target</th>${adminHeaders}<th>Trend</th>
            </tr>
          </thead>
          <tbody>${goalRows}</tbody>
        </table>
      `;
    }

    // ── Assignment Detail Trail ───────────────────────────────────────────────
    const studentInstances = instancesData.filter(
      (inst) => inst.student_code === student.code || inst.student_id === student.code
    );

    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);

    // Filter instances by date range
    const rangedInstances = studentInstances.filter((inst) => {
      const d = new Date(inst.assigned_at || inst.created_at || '');
      if (isNaN(d.getTime())) return true; // Include if no date
      return d >= startDate && d <= endDate;
    });

    let assignmentHtml = '';
    if (assignmentsData.length === 0 && instancesData.length === 0) {
      assignmentHtml = '<div class="rp-empty">Assignment detail data not available. Score-only view shown.</div>';
    } else if (rangedInstances.length === 0) {
      assignmentHtml = '<div class="rp-empty">No assignments found for this period.</div>';
    } else {
      assignmentHtml = rangedInstances.map((inst) => {
        const assignment = assignmentsData.find((a) => a.id === inst.assignment_id);
        const submission = submissionsData.find(
          (s) => s.instance_id === inst.id || (s.assignment_instances && s.assignment_instances.id === inst.id)
        );

        const title = assignment?.title || `Assignment ${inst.assignment_id}`;
        const category = assignment?.category || '—';
        const type = assignment?.type || '—';
        const score = submission?.score_total ?? submission?.score;
        const status = submission ? (score != null ? 'Graded' : 'Submitted') : 'Pending';
        const assignedDate = formatDate(inst.assigned_at || inst.created_at);
        const deseTags = assignment?.dese_tags || assignment?.dese_standards || '';
        const iepTags = assignment?.iep_tags || assignment?.iep_goals || '';

        const scoreDisplay = score != null
          ? `<span style="color:${scoreColor(score)}">${score}%</span>`
          : '—';

        const metaRow = isParent
          ? `Category: ${escapeHtml(category)} | Assigned: ${escapeHtml(assignedDate)} | Status: ${escapeHtml(status)}`
          : `Type: ${escapeHtml(type)} | Category: ${escapeHtml(category)} | Assigned: ${escapeHtml(assignedDate)} | Status: ${escapeHtml(status)} | Score: ${scoreDisplay}`;

        const tagRow = !isParent && (deseTags || iepTags) ? `
          <div class="rp-ev-tag-row">
            ${deseTags ? `<strong>DESE Tags:</strong> ${escapeHtml(Array.isArray(deseTags) ? deseTags.join(', ') : String(deseTags))}` : ''}
            ${iepTags ? ` &nbsp; <strong>IEP Tags:</strong> ${escapeHtml(Array.isArray(iepTags) ? iepTags.join(', ') : String(iepTags))}` : ''}
          </div>
        ` : '';

        // ── Answer detail ─────────────────────────────────────────────────────
        // Pre-filter goals to this student only (FERPA: never show another
        // student's IEP goal on this student's report).
        const studentGoalsData = student.code
          ? goalsData.filter((g) => g.student_code === student.code)
          : [];
        const answerDetailHtml = buildRichAnswerDetailHtml(
          submission,
          assignment,
          studentGoalsData,
          isParent,
          student.code
        );

        return `
          <div class="rp-ev-assignment-card">
            <div class="rp-ev-assignment-title">${escapeHtml(title)}</div>
            <div class="rp-ev-assignment-meta">${metaRow}</div>
            ${tagRow}
            ${answerDetailHtml}
          </div>
        `;
      }).join('');
    }

    // ── Overall Statistics ────────────────────────────────────────────────────
    const scores = rangedInstances
      .map((inst) => {
        const sub = submissionsData.find(
          (s) => s.instance_id === inst.id || (s.assignment_instances && s.assignment_instances.id === inst.id)
        );
        return sub?.score_total ?? sub?.score ?? null;
      })
      .filter((s) => s != null);

    const totalAssignments = rangedInstances.length;
    const gradedCount = scores.length;
    const pendingCount = totalAssignments - gradedCount;
    const avgScore = gradedCount > 0 ? (scores.reduce((a, b) => a + b, 0) / gradedCount).toFixed(1) : 'N/A';
    const maxScore = gradedCount > 0 ? Math.max(...scores) : 'N/A';
    const minScore = gradedCount > 0 ? Math.min(...scores) : 'N/A';
    const goalsOnTrack = activeGoals.filter((goal) => {
      const data = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
      return data.average != null && data.average >= 70;
    }).length;

    const statsHtml = `
      <div class="rp-ev-stats-card">
        <div class="rp-ev-stats-title">📊 Overall Statistics</div>
        <div class="rp-ev-stats-grid">
          <div><strong>Total Assignments:</strong> ${totalAssignments}</div>
          <div><strong>Graded:</strong> ${gradedCount}</div>
          <div><strong>Pending:</strong> ${pendingCount}</div>
          <div><strong>Average Score:</strong> ${avgScore !== 'N/A' ? `<span style="color:${scoreColor(parseFloat(avgScore))}">${avgScore}%</span>` : 'N/A'}</div>
          <div><strong>Highest:</strong> ${maxScore !== 'N/A' ? `${maxScore}%` : 'N/A'}</div>
          <div><strong>Lowest:</strong> ${minScore !== 'N/A' ? `${minScore}%` : 'N/A'}</div>
          <div><strong>Goals on Track:</strong> ${goalsOnTrack}/${activeGoals.length}</div>
          <div><strong>Data Points This Period:</strong> ${activeGoals.reduce((acc, g) => acc + getGoalProgressForQuarter(g.code, student.code, quarterRange).count, 0)}</div>
        </div>
      </div>
    `;

    return `
      <div class="rp-ev-student-section">
        ${profileHtml}
        <div class="rp-ev-section-title">IEP Goal Progress Summary</div>
        ${goalsHtml}
        <div class="rp-ev-section-title rp-ev-section-break">Assignment Detail Trail</div>
        ${assignmentHtml}
        ${statsHtml}
      </div>
    `;
  }

  /**
   * Build plain-text email body for a student's evidence report (Tab 6).
   * Extracts key information from already-computed report data and formats
   * it as clean plain text suitable for pasting into an email.
   * For parent-audience reports, raw scores are omitted (respects isParent flag).
   * @param {Object} student - student object
   * @param {Object} quarterRange - { start, end } date range
   * @param {boolean} isParent - whether to use parent-friendly (simplified) view
   * @returns {string} plain-text email body
   */
  function buildEvidenceEmailBodyText(student, quarterRange, isParent) {
    const periodLabel = getTab6PeriodLabel();
    const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const studentName = student.name || student.code;
    const lines = [];

    // Header
    lines.push('Student Progress Update');
    lines.push(`Student: ${studentName}`);
    lines.push(`Report Period: ${periodLabel}`);
    lines.push(`Date: ${todayLabel}`);
    lines.push('');
    lines.push('─'.repeat(50));
    lines.push('');

    // IEP Goal Progress — FERPA: only this student's goals
    const activeGoals = goalsData.filter(
      (g) => g.student_code === student.code && isGoalActive(g)
    );
    lines.push('IEP GOAL PROGRESS');
    lines.push('');

    if (activeGoals.length === 0) {
      lines.push('  No active IEP goals found for this student.');
    } else {
      // Determine previous period for trend calculation
      const dr = tab6State.dateRange;
      let prevRange = null;
      if (dr === 'current-quarter') {
        prevRange = getPreviousQuarterRange(getCurrentQuarter());
      } else if (dr === 'Q1' || dr === 'Q2' || dr === 'Q3' || dr === 'Q4') {
        prevRange = getPreviousQuarterRange(dr);
      }

      for (const goal of activeGoals) {
        const data =
          getGoalProgressForQuarter(
            goal.code,
            student.code,
            quarterRange
          );

        const prevData =
          prevRange
            ? getGoalProgressForQuarter(
                goal.code,
                student.code,
                prevRange
              )
            : null;

        const criterionConflict =
          hasCriterionConflict(goal);

        const headerMastery =
          goal.mastery != null &&
          goal.mastery !== ''
            ? String(goal.mastery)
            : 'N/A';

        const goalTextTarget =
          goal.target != null &&
          goal.target !== ''
            ? String(goal.target)
            : 'N/A';

        // Trend
        let trendText = 'No data';
        if (data.average != null) {
          if (!prevData || prevData.average == null) {
            trendText = 'New data';
          } else if (data.average > prevData.average) {
            trendText = 'Improving \u2191';
          } else if (data.average < prevData.average) {
            trendText = 'Declining \u2193';
          } else {
            trendText = 'Maintaining \u2192';
          }
        }

        // Progress display — respect isParent flag
        let progressText;

        if (
          criterionConflict &&
          isParent
        ) {
          progressText =
            data.average == null
              ? 'No data yet'
              : 'Data collected';
        } else if (isParent) {
          if (data.average == null) {
            progressText = 'No data yet';
          } else if (data.average >= 80) {
            progressText = 'On track';
          } else if (data.average >= 60) {
            progressText = 'Making progress';
          } else {
            progressText = 'Needs support';
          }
        } else {
          progressText = data.average != null
            ? formatGoalValue(data.average, goal.measurement_type, goal)
            : 'No data';
        }

        const areaLabel =
          goal.goal_area ||
          goal.area ||
          goal.skill_area ||
          '';

        lines.push(
          `\u2022 ${goal.code}${areaLabel ? ` \u2014 ${areaLabel}` : ''}`
        );

        if (goal.desc) {
          lines.push(
            `  ${goal.desc}`
          );
        }

        if (criterionConflict) {
          lines.push(
            `  Header Mastery: ${headerMastery}`
          );

          lines.push(
            `  Goal-Text Target: ${goalTextTarget}`
          );

          lines.push(
            '  Criterion Status: Manual Criterion Review Required'
          );
        }

        lines.push(
          `  Progress: ${progressText}  |  Trend: ${trendText}`
        );
        if (!isParent) lines.push(`  Data points this period: ${data.count}`);
        lines.push('');
      }
    }

    lines.push('─'.repeat(50));
    lines.push('');

    // Assignment Summary
    const studentInstances = instancesData.filter(
      (inst) => inst.student_code === student.code || inst.student_id === student.code
    );
    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);
    const rangedInstances = studentInstances.filter((inst) => {
      const d = new Date(inst.assigned_at || inst.created_at || '');
      if (isNaN(d.getTime())) return true;
      return d >= startDate && d <= endDate;
    });

    const scores = rangedInstances
      .map((inst) => {
        const sub = submissionsData.find(
          (s) => s.instance_id === inst.id || (s.assignment_instances && s.assignment_instances.id === inst.id)
        );
        return sub?.score_total ?? sub?.score ?? null;
      })
      .filter((s) => s != null);

    const totalAssignments = rangedInstances.length;
    const gradedCount = scores.length;
    const avgScore = gradedCount > 0
      ? (scores.reduce((a, b) => a + b, 0) / gradedCount).toFixed(1)
      : null;
    const completionRate = totalAssignments > 0 ? Math.round((gradedCount / totalAssignments) * 100) : null;

    lines.push('ASSIGNMENT SUMMARY');
    lines.push('');
    lines.push(`  Total assignments this period: ${totalAssignments}`);
    if (completionRate != null) {
      lines.push(`  Completion rate: ${completionRate}%`);
    }
    if (!isParent && avgScore != null) {
      lines.push(`  Average score: ${avgScore}%`);
    }
    if (activeGoals.length > 0) {
      const manualReviewGoals =
        activeGoals.filter(
          (goal) =>
            hasCriterionConflict(goal)
        );

      const evaluableGoals =
        activeGoals.filter(
          (goal) =>
            !hasCriterionConflict(goal)
        );

      const goalsOnTrack =
        evaluableGoals.filter(
          (goal) => {
            const data =
              getGoalProgressForQuarter(
                goal.code,
                student.code,
                quarterRange
              );

            return (
              data.average != null &&
              data.average >= 70
            );
          }
        ).length;

      if (
        manualReviewGoals.length === 0
      ) {
        lines.push(
          `  Goals on track: ${goalsOnTrack} of ${activeGoals.length}`
        );
      } else {
        if (
          evaluableGoals.length > 0
        ) {
          lines.push(
            `  Goals on track: ${goalsOnTrack} of ${evaluableGoals.length} evaluable goals`
          );
        }

        lines.push(
          `  Goals requiring manual criterion review: ${manualReviewGoals.length}`
        );
      }
    }
    lines.push('');
    lines.push('─'.repeat(50));
    lines.push('');
    lines.push('Please contact me if you have any questions about this progress update.');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Render a lightweight preview summary card for the current Tab 6 selection.
   * Shows student(s), date range, assignment/goal counts, audience, and format
   * without generating the full evidence HTML.
   */
  function generateTab6Preview() {
    var output = $("tab6ReportOutput");
    if (!output) return;

    var quarterRange = getTab6DateRange();

    // Resolve target students
    var targetStudents = [];
    if (tab6State.selectionMode === 'single') {
      if (!tab6State.studentCode) {
        output.innerHTML = '<div class="rp-empty">No student selected. Please choose a student before previewing.</div>';
        return;
      }
      var singleStudent = studentsData.find(function(s) { return s.code === tab6State.studentCode; });
      if (!singleStudent) {
        output.innerHTML = '<div class="rp-empty">Selected student not found.</div>';
        return;
      }
      targetStudents = [singleStudent];
    } else if (tab6State.selectionMode === 'multi') {
      targetStudents = studentsData.filter(function(s) {
        return tab6State.selectedStudents.includes(s.code) && s.active !== false;
      });
      if (targetStudents.length === 0) {
        output.innerHTML = '<div class="rp-empty">No students selected. Please select at least one student before previewing.</div>';
        return;
      }
    } else {
      targetStudents = studentsData.filter(function(s) { return s.active !== false; });
      if (targetStudents.length === 0) {
        output.innerHTML = '<div class="rp-empty">No active students found.</div>';
        return;
      }
    }

    // Format date range nicely
    var startDate = new Date(quarterRange.start);
    var endDate = new Date(quarterRange.end);
    var fmtOpts = { month: 'short', day: 'numeric', year: 'numeric' };
    var startLabel = isNaN(startDate.getTime()) ? quarterRange.start
      : startDate.toLocaleDateString('en-US', fmtOpts);
    var endLabel = isNaN(endDate.getTime()) ? quarterRange.end
      : endDate.toLocaleDateString('en-US', fmtOpts);
    var dateRangeLabel = startLabel + ' \u2014 ' + endLabel;

    // Count assignments in range across all target students
    var totalAssignments = 0;
    targetStudents.forEach(function(student) {
      var studentInstances = instancesData.filter(function(inst) {
        return inst.student_code === student.code || inst.student_id === student.code;
      });
      studentInstances.forEach(function(inst) {
        var d = new Date(inst.assigned_at || inst.created_at || '');
        // Include if no date (matches buildStudentEvidenceHtml behavior), or if within range
        if (isNaN(d.getTime())) { totalAssignments++; return; }
        if (d >= startDate && d <= endDate) { totalAssignments++; }
      });
    });

    // Count IEP goals across all target students
    var totalGoals = 0;
    targetStudents.forEach(function(student) {
      totalGoals += goalsData.filter(function(g) {
        return g.student_code === student.code && isGoalActive(g);
      }).length;
    });

    // Audience and format labels
    var audienceLabel = tab6State.audienceMode === 'parent' ? 'Parent'
      : tab6State.audienceMode === 'admin' ? 'Admin'
      : 'IEP Progress';
    var formatLabel = tab6State.outputFormat === 'zip' ? '📦 ZIP Download' : '🖨️ Print / PDF';

    // Student name list (up to 5 shown, then "+ N more")
    var studentNames = targetStudents.map(function(s) {
      return escapeHtml(s.name || s.code) + ' (' + escapeHtml(s.code) + ')';
    });
    var studentListHtml;
    if (studentNames.length <= 5) {
      studentListHtml = studentNames.join(', ');
    } else {
      studentListHtml = studentNames.slice(0, 5).join(', ') + ', +' + (studentNames.length - 5) + ' more';
    }

    output.innerHTML = '<div class="tc-card" style="padding:20px;">'
      + '<div style="font-size:1.1em;font-weight:700;margin-bottom:16px;">👁️ Preview — Student Evidence Report</div>'
      + '<div class="rp-kpis" style="margin-bottom:16px;">'
      + '<div class="rp-kpi-card"><div class="rp-kpi-label">Students</div><div class="rp-kpi-value">' + escapeHtml(String(targetStudents.length)) + '</div></div>'
      + '<div class="rp-kpi-card"><div class="rp-kpi-label">Date Range</div><div class="rp-kpi-value" style="font-size:.85em;">' + escapeHtml(dateRangeLabel) + '</div></div>'
      + '<div class="rp-kpi-card"><div class="rp-kpi-label">Assignments</div><div class="rp-kpi-value">' + escapeHtml(String(totalAssignments)) + '</div></div>'
      + '<div class="rp-kpi-card"><div class="rp-kpi-label">IEP Goals</div><div class="rp-kpi-value">' + escapeHtml(String(totalGoals)) + '</div></div>'
      + '<div class="rp-kpi-card"><div class="rp-kpi-label">Audience</div><div class="rp-kpi-value">' + escapeHtml(audienceLabel) + '</div></div>'
      + '<div class="rp-kpi-card"><div class="rp-kpi-label">Format</div><div class="rp-kpi-value" style="font-size:.85em;">' + escapeHtml(formatLabel) + '</div></div>'
      + '</div>'
      + '<div style="margin-bottom:12px;font-size:.9em;color:rgba(255,255,255,.7);">'
      + '<strong>Student(s):</strong> ' + studentListHtml
      + '</div>'
      + '<button class="tc-btn" id="tab6PreviewGenerateBtn" type="button" style="font-weight:700;padding:10px 24px;">✅ Looks good — Generate Full Report</button>'
      + '</div>';

    var previewGenBtn = $("tab6PreviewGenerateBtn");
    if (previewGenBtn) {
      previewGenBtn.addEventListener('click', function() {
        generateEvidenceReport().catch(function(err) {
          console.error('[tc-reporting] Error generating evidence report:', err);
        });
      });
    }
  }

  /**
   * Generate and render the evidence report for selected students
   */
  async function generateEvidenceReport() {
    const output = $("tab6ReportOutput");
    if (!output) return;

    const quarterRange = getTab6DateRange();
    const isParent = tab6State.audienceMode === 'parent';

    // Determine which students to report on
    let targetStudents = [];
    if (tab6State.selectionMode === 'single') {
      if (!tab6State.studentCode) {
        await rcAlert('No Student Selected', 'Please select a student to generate a report.');
        return;
      }
      const student = studentsData.find((s) => s.code === tab6State.studentCode);
      if (!student) {
        output.innerHTML = '<div class="rp-empty">Student not found.</div>';
        return;
      }
      targetStudents = [student];
    } else if (tab6State.selectionMode === 'multi') {
      if (tab6State.selectedStudents.length === 0) {
        await rcAlert('No Students Selected', 'Please select at least one student.');
        return;
      }
      targetStudents = studentsData.filter(
        (s) => tab6State.selectedStudents.includes(s.code) && s.active !== false
      );
    } else {
      // all
      targetStudents = studentsData.filter((s) => s.active !== false);
      if (targetStudents.length === 0) {
        await rcAlert('No Data', 'No active students found.');
        return;
      }
    }

    // Resolve data source label
    const sourceLabel = tab6State.dataSource === 'local' ? 'My Device'
      : tab6State.dataSource === 'school' ? 'School Database'
      : (usingSupabase ? 'School Database' : 'My Device');

    if (tab6State.outputFormat === 'zip') {
      // ZIP download mode
      output.innerHTML = '<div class="rp-empty" id="tab6ZipProgress">Preparing ZIP package...</div>';
      try {
        await exportEvidenceZip(targetStudents, quarterRange, isParent, sourceLabel);
        output.innerHTML = `
          <div class="rp-ev-export-bar">
            <span style="color:rgba(34,197,94,.9);">✅ ZIP package downloaded successfully.</span>
            <button class="tc-btn" id="tab6CsvBtn" type="button">📊 Export CSV</button>
          </div>`;
        const csvBtn2 = $("tab6CsvBtn");
        if (csvBtn2) csvBtn2.addEventListener('click', () => exportEvidenceCSV(targetStudents, quarterRange));
      } catch (err) {
        console.error('[tc-reporting] ZIP export error:', err);
        output.innerHTML = `<div class="rp-empty">ZIP export failed: ${escapeHtml(String(err.message || err))}</div>`;
      }
      return;
    }

    // Print / PDF mode (default)
    // Build report HTML for each student
    const sections = targetStudents.map((student, idx) => {
      const sectionHtml = buildStudentEvidenceHtml(student, quarterRange, isParent);
      const separator = idx > 0 ? '<div class="rp-ev-page-break"></div>' : '';
      return separator + sectionHtml;
    });

    // Show AI summary button only when there is exactly one student
    const aiSummaryBarHtml = targetStudents.length === 1 ? `
      <div id="tab6AiSummaryBar" style="margin-bottom:12px;">
        <button class="tc-btn" id="tab6BtnGenerateSummary" type="button">✨ Generate Executive Summary</button>
        <span id="tab6AiSummaryStatus" style="display:none;margin-left:12px;color:#555;font-style:italic;"></span>
        <div id="tab6AiSummaryResult" style="display:none;margin-top:12px;padding:16px;border:2px solid #93c5fd;border-radius:8px;background:#eff6ff;">
          <div style="font-weight:700;margin-bottom:8px;color:#1d4ed8;">📋 Executive Summary</div>
          <textarea id="tab6AiSummaryText" rows="8" style="width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;line-height:1.6;border:1px solid #bfdbfe;border-radius:4px;padding:8px;background:#fff;resize:vertical;"></textarea>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="tc-btn tc-btn-small" id="tab6BtnCopySummary" type="button">📋 Copy</button>
            <button class="tc-btn tc-btn-small" id="tab6BtnRegenerateSummary" type="button">🔄 Regenerate</button>
          </div>
        </div>
      </div>
    ` : '';

    output.innerHTML = `
      ${aiSummaryBarHtml}
      ${sections.join('')}
      <div class="rp-ev-export-bar">
        <button class="tc-btn" id="tab6PrintBtn" type="button">🖨️ Print / PDF</button>
        <button class="tc-btn" id="tab6PrintWindowBtn" type="button">🗗 Open in New Window</button>
        <button class="tc-btn" id="tab6CsvBtn" type="button">📊 Export CSV</button>
        <button class="tc-btn" id="tab6CopyEmailBtn" type="button">📋 Copy as Email Body</button>
      </div>
    `;

    // Wire AI summary buttons (single-student mode only)
    if (targetStudents.length === 1) {
      const singleStudent = targetStudents[0];
      const audience = tab6State.audienceMode || 'parent';

      const btnGenSummary = $("tab6BtnGenerateSummary");
      if (btnGenSummary) {
        btnGenSummary.addEventListener('click', () => {
          handleGenerateExecutiveSummary(singleStudent, quarterRange, audience, false);
        });
      }

      const btnRegenSummary = $("tab6BtnRegenerateSummary");
      if (btnRegenSummary) {
        btnRegenSummary.addEventListener('click', () => {
          handleGenerateExecutiveSummary(singleStudent, quarterRange, audience, true);
        });
      }

      const btnCopySummary = $("tab6BtnCopySummary");
      if (btnCopySummary) {
        btnCopySummary.addEventListener('click', () => {
          const textarea = $("tab6AiSummaryText");
          const text = textarea ? textarea.value : '';
          if (!text) return;
          navigator.clipboard.writeText(text).then(() => {
            const original = btnCopySummary.textContent;
            btnCopySummary.textContent = '\u2713 Copied!';
            setTimeout(() => { btnCopySummary.textContent = original; }, 2000);
          }).catch((err) => {
            console.error('[tc-reporting] Failed to copy executive summary:', err);
            const original = btnCopySummary.textContent;
            btnCopySummary.textContent = '❌ Copy failed';
            setTimeout(() => { btnCopySummary.textContent = original; }, 2000);
          });
        });
      }
    }

    // Wire export buttons
    const printBtn = $("tab6PrintBtn");
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        generateEvidencePrintWindow(targetStudents, quarterRange, isParent, sourceLabel);
      });
    }

    const printWindowBtn = $("tab6PrintWindowBtn");
    if (printWindowBtn) {
      printWindowBtn.addEventListener('click', () => {
        generateEvidencePrintWindow(targetStudents, quarterRange, isParent, sourceLabel);
      });
    }

    const csvBtn = $("tab6CsvBtn");
    if (csvBtn) {
      csvBtn.addEventListener('click', () => exportEvidenceCSV(targetStudents, quarterRange));
    }

    const copyEmailBtn = $("tab6CopyEmailBtn");
    if (copyEmailBtn) {
      copyEmailBtn.addEventListener('click', () => {
        // Build email text for all target students (FERPA: one section per student)
        const sep = '\n\n' + '\u2550'.repeat(50) + '\n\n';
        const emailText = targetStudents
          .map((student) => buildEvidenceEmailBodyText(student, quarterRange, isParent))
          .join(sep);
        navigator.clipboard.writeText(emailText).then(() => {
          const original = copyEmailBtn.textContent;
          copyEmailBtn.textContent = '\u2713 Copied!';
          setTimeout(() => { copyEmailBtn.textContent = original; }, 2000);
        }).catch((err) => {
          console.error('[tc-reporting] Failed to copy email body:', err);
          const original = copyEmailBtn.textContent;
          copyEmailBtn.textContent = 'Copy failed';
          setTimeout(() => { copyEmailBtn.textContent = original; }, 2000);
        });
      });
    }
  }

  /**
   * Build a complete print-friendly HTML document for evidence packets
   */
  function buildEvidenceDocumentHtml(targetStudents, quarterRange, isParent, sourceLabel, styleOverrides) {
    const periodLabel = getTab6PeriodLabel();
    const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const studentNames = targetStudents.map((s) => escapeHtml(s.name || s.code)).join(', ');

    // Build per-student sections
    const sections = targetStudents.map((student, idx) => {
      const sectionHtml = buildStudentEvidenceHtml(student, quarterRange, isParent);
      const separator = idx > 0 ? '<div style="page-break-before:always;"></div>' : '';
      return separator + sectionHtml;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Student Evidence Report — ${escapeHtml(studentNames)}</title>
  <style>
    @page { margin: 1.5cm 2cm; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #111; margin: 0; padding: 20px; font-size: 13px; line-height: 1.45; }
    .rp-ev-student-section { margin-bottom: 32px; }
    .rp-ev-profile-card { background: #f8f9fa; border: 2px solid #334155; border-radius: 8px; padding: 14px 18px; margin-bottom: 14px; }
    .rp-ev-profile-header { font-size: 18px; font-weight: 700; margin-bottom: 8px; color: #111; letter-spacing: -0.3px; }
    .rp-ev-profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 13px; margin-bottom: 10px; }
    .rp-ev-confidential-banner { background: #fff3cd; border: 2px solid #856404; border-radius: 6px; padding: 6px 12px; font-size: 12px; color: #000; font-weight: bold; margin-top: 8px; }
    .rp-ev-section-title { font-size: 15px; font-weight: 700; margin: 16px 0 8px; border-bottom: 2px solid #334155; padding-bottom: 4px; color: #111; text-transform: uppercase; letter-spacing: 0.4px; }
    .rp-ev-section-break { break-before: page; page-break-before: always; }
    .rp-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }
    .rp-table caption { font-size: 11px; font-weight: 600; color: #555; text-align: left; margin-bottom: 4px; }
    .rp-table th, .rp-table td { padding: 6px 8px; border: 1px solid #ccc; text-align: left; vertical-align: top; }
    .rp-table th { background: #f0f0f0; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
    .rp-table tbody tr:nth-child(even) td { background: #fafafa; }
    .rp-table tr { break-inside: avoid; page-break-inside: avoid; }
    .rp-ev-assignment-card { background: #fff; border: 1px solid #cbd5e1; border-left: 4px solid #334155; border-radius: 0 6px 6px 0; padding: 10px 14px; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
    .rp-ev-assignment-title { font-weight: 700; font-size: 14px; margin-bottom: 3px; color: #111; }
    .rp-ev-assignment-meta { font-size: 12px; color: #555; line-height: 1.4; }
    .rp-ev-tag-row { font-size: 11px; color: #555; margin-top: 3px; }
    .rp-ev-score-breakdown { font-size: 11px; color: #444; margin-top: 4px; }
    .rp-ev-answers { margin-top: 8px; }
    .rp-ev-answers-label { font-size: 11px; font-weight: 700; color: #444; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .6px; }
    .rp-ev-q-summary { font-size: 13px; font-weight: 600; color: #111; margin-bottom: 6px; }
    .rp-ev-q-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 5px; padding: 8px 10px; margin-bottom: 6px; break-inside: avoid; page-break-inside: avoid; }
    .rp-ev-q-header { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; margin-bottom: 5px; }
    .rp-ev-q-label { font-weight: 700; font-size: 12px; color: #111; white-space: nowrap; }
    .rp-ev-q-badges { display: flex; flex-wrap: wrap; gap: 3px; }
    .rp-ev-badge { font-size: 10px; padding: 1px 5px; border-radius: 10px; white-space: nowrap; font-weight: 600; }
    .rp-ev-badge-dese { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
    .rp-ev-badge-goal { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .rp-ev-q-text { font-size: 12px; color: #222; margin-bottom: 5px; font-style: italic; line-height: 1.4; }
    .rp-ev-q-choices { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
    .rp-ev-choice { padding: 2px 6px; border-radius: 3px; color: #333; }
    .rp-ev-choice-correct { background: #dcfce7; color: #166534; font-weight: 600; }
    .rp-ev-choice-wrong { background: #fee2e2; color: #991b1b; font-weight: 600; }
    .rp-ev-choice-answer { background: #f0fdf4; color: #166534; }
    .rp-ev-choice-none { color: #888; font-style: italic; }
    .rp-ev-choice-mark { margin-left: 5px; font-weight: 700; }
    .rp-ev-q-writing { margin-top: 5px; }
    .rp-ev-q-writing-label { font-size: 10px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
    .rp-ev-q-writing-text { font-size: 12px; color: #222; background: #f8f9fa; border: 1px solid #ddd; border-radius: 3px; padding: 5px 8px; white-space: pre-wrap; line-height: 1.4; }
    .rp-ev-q-score { font-size: 11px; color: #444; margin-top: 3px; }
    .rp-ev-ans-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .rp-ev-ans-table th, .rp-ev-ans-table td { padding: 3px 7px; border: 1px solid #ddd; text-align: left; }
    .rp-ev-ans-table th { background: #f0f0f0; font-weight: 600; font-size: 10px; text-transform: uppercase; }
    .rp-ev-ans-ref { color: #555; white-space: nowrap; }
    .rp-ev-ans-val { color: #111; word-break: break-word; }
    .rp-ev-teacher-note { font-size: 11px; color: #555; margin-top: 4px; font-style: italic; }
    .rp-ev-stats-card { background: #f8f9fa; border: 1px solid #ccc; border-radius: 6px; padding: 12px 16px; margin-top: 14px; break-inside: avoid; page-break-inside: avoid; }
    .rp-ev-stats-title { font-weight: 700; margin-bottom: 8px; color: #111; font-size: 13px; }
    .rp-ev-stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 5px; font-size: 12px; color: #111; }
    .rp-empty { color: #888; font-style: italic; padding: 8px 0; font-size: 12px; }
    .rp-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .rp-badge-html { background: #e3f2fd; color: #1565c0; }
    .rp-badge-txt { background: #f3e5f5; color: #7b1fa2; }
    .rp-badge-link { background: #e8f5e9; color: #2e7d32; }
    .rp-badge-file { background: #fff3e0; color: #e65100; }
    .rp-ev-doc-footer { margin-top: 28px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 11px; color: #666; }
    @media print {
      @page { margin: 1.5cm 2cm; }
      body { background: white !important; color: #111 !important; padding: 0 !important; }
      .rp-ev-profile-card { background: #f8f9fa !important; border-color: #334155 !important; color: #000 !important; }
      .rp-ev-assignment-card { background: #fff !important; border-color: #cbd5e1 !important; color: #000 !important; }
      .rp-ev-stats-card { background: #f8f9fa !important; border-color: #ccc !important; color: #000 !important; }
      .rp-ev-profile-header,
      .rp-ev-section-title,
      .rp-ev-stats-grid div,
      .rp-ev-assignment-title { color: #000 !important; }
      .rp-ev-assignment-meta { color: #333 !important; }
      .rp-ev-tag-row { color: #444 !important; }
      .rp-ev-score-breakdown { color: #333 !important; }
      .rp-ev-answers-label { color: #333 !important; }
      .rp-ev-q-card { background: #fff !important; border-color: #ccc !important; }
      .rp-ev-q-label { color: #000 !important; }
      .rp-ev-q-text { color: #111 !important; }
      .rp-ev-badge-dese { background: #dbeafe !important; color: #1e40af !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rp-ev-badge-goal { background: #dcfce7 !important; color: #166534 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rp-ev-choice { color: #111 !important; }
      .rp-ev-choice-correct { background: #dcfce7 !important; color: #166534 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rp-ev-choice-wrong { background: #fee2e2 !important; color: #991b1b !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rp-ev-choice-answer { background: #f0fdf4 !important; color: #166534 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rp-ev-q-writing-text { background: #f8f9fa !important; border-color: #ccc !important; color: #111 !important; }
      .rp-ev-q-summary { color: #000 !important; }
      .rp-ev-ans-table th { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rp-ev-ans-table th, .rp-ev-ans-table td { border-color: #ddd !important; color: #000 !important; }
      .rp-ev-ans-ref { color: #444 !important; }
      .rp-ev-teacher-note { color: #444 !important; }
      .rp-ev-confidential-banner { background: #fff3cd !important; border: 2px solid #856404 !important; color: #000 !important; display: block !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rp-table th { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rp-table th, .rp-table td { border-color: #ccc !important; color: #000 !important; }
      .rp-table tbody tr:nth-child(even) td { background: #fafafa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rp-ev-doc-footer { border-top-color: #ccc !important; color: #444 !important; }
      .rp-ev-page-break, [style*="page-break-before"] { page-break-before: always; break-before: page; }
      /* NOTE: .rp-ev-student-section intentionally has NO page-break-inside:avoid here.
         Student sections span multiple pages; constraining them causes a blank first page. */
      .rp-ev-assignment-card { break-inside: avoid; page-break-inside: avoid; }
      .rp-ev-q-card { break-inside: avoid; page-break-inside: avoid; }
      .rp-ev-stats-card { break-inside: avoid; page-break-inside: avoid; }
      .rp-table tr { break-inside: avoid; page-break-inside: avoid; }
    }
    ${styleOverrides || ''}
  </style>
</head>
<body>
  <div style="margin-bottom:20px; padding-bottom:12px; border-bottom:2px solid #334155;">
    <div style="font-size:20px; font-weight:700; margin-bottom:4px; letter-spacing:-0.3px;">Reinisch Classroom — Student Evidence Report</div>
    <div style="font-size:12px; color:#555;">Period: ${escapeHtml(periodLabel)} &nbsp;|&nbsp; Generated: ${escapeHtml(generatedDate)} &nbsp;|&nbsp; Data Source: ${escapeHtml(sourceLabel)}</div>
  </div>
  ${sections}
  <div class="rp-ev-doc-footer">
    Reinisch Classroom &mdash; Student Evidence Report &mdash; ${escapeHtml(generatedDate)}
  </div>
</body>
</html>`;
  }

  /**
   * Open evidence report in a new print window
   */
  function generateEvidencePrintWindow(targetStudents, quarterRange, isParent, sourceLabel) {
    const docHtml = buildEvidenceDocumentHtml(targetStudents, quarterRange, isParent, sourceLabel, '');
    const win = window.open('', '_blank');
    if (!win) {
      console.warn('[tc-reporting] Could not open print window (blocked by browser).');
      return;
    }
    win.document.write(docHtml);
    win.document.close();
    win.focus();
    // Delay allows the browser to fully render the document before triggering the print dialog
    setTimeout(() => win.print(), 500);
  }

  /**
   * Export evidence as a ZIP package using JSZip (loaded from CDN)
   */
  async function exportEvidenceZip(targetStudents, quarterRange, isParent, sourceLabel) {
    /* global JSZip */
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip is not loaded. Please check your network connection and try again.');
    }
    // eslint-disable-next-line no-undef
    const zip = new JSZip();
    const today = formatDateYYYYMMDD();
    const folderName = `evidence-report-${today}`;
    const root = zip.folder(folderName);
    const periodLabel = getTab6PeriodLabel();
    const generatedTs = new Date().toISOString();
    const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Compute per-student summary stats for TOC and CSV
    const studentStats = targetStudents.map((s) => {
      const studentInstances = instancesData.filter(
        (inst) => inst.student_code === s.code || inst.student_id === s.code
      );
      const startDate = new Date(quarterRange.start);
      const endDate = new Date(quarterRange.end);
      const rangedInstances = studentInstances.filter((inst) => {
        const d = new Date(inst.assigned_at || inst.created_at || '');
        return isNaN(d.getTime()) || (d >= startDate && d <= endDate);
      });
      const totalAssignments = rangedInstances.length;
      let graded = 0;
      let pending = 0;
      let scoreSum = 0;
      let scoreCount = 0;
      for (const inst of rangedInstances) {
        const submission = submissionsData.find(
          (sub) => sub.instance_id === inst.id || (sub.assignment_instances && sub.assignment_instances.id === inst.id)
        );
        const score = submission?.score_total ?? submission?.score;
        if (submission && score != null) {
          graded++;
          scoreSum += score;
          scoreCount++;
        } else {
          pending++;
        }
      }
      const avgScore = scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : null;
      const activeGoals = goalsData.filter((g) => g.student_code === s.code && isGoalActive(g));
      let goalsOnTrack = 0;
      let dpCount = 0;
      for (const g of activeGoals) {
        const data = getGoalProgressForQuarter(g.code, s.code, quarterRange);
        dpCount += data.count;
        if (data.average != null && data.average >= 80) goalsOnTrack++;
      }
      return {
        student: s,
        totalAssignments,
        graded,
        pending,
        avgScore,
        activeGoals: activeGoals.length,
        goalsOnTrack,
        dpCount,
      };
    });

    // manifest.json
    const manifest = {
      generated: generatedTs,
      period: periodLabel,
      audience: isParent ? 'Parent' : 'Admin',
      dataSource: sourceLabel,
      students: targetStudents.map((s) => ({
        code: s.code,
        name: s.name || s.code,
        active: s.active !== false,
      })),
      dateRange: quarterRange,
    };
    root.file('manifest.json', JSON.stringify(manifest, null, 2));

    // index.html — master TOC with summary stats
    const tocRows = studentStats.map(({ student: s, totalAssignments, graded, avgScore }) => {
      const code = escapeHtml(s.code);
      const name = escapeHtml(s.name || s.code);
      const scoreText = avgScore != null ? ` &mdash; Avg: ${escapeHtml(String(avgScore))}%` : '';
      return `<tr>
        <td><a href="${code}/cover.html">${name}</a></td>
        <td>${escapeHtml(s.code)}</td>
        <td>${totalAssignments}</td>
        <td>${graded}${scoreText}</td>
        <td><a href="${code}/assignments.html">Assignments</a></td>
        <td><a href="${code}/goals.html">Goals</a></td>
      </tr>`;
    }).join('\n');
    const indexHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Evidence Report Index — ${escapeHtml(periodLabel)}</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:20px;}h1{margin-bottom:6px;}table{border-collapse:collapse;width:100%;margin-top:16px;}th,td{padding:9px 12px;border:1px solid #ddd;text-align:left;}th{background:#f5f5f5;font-weight:600;}tr:nth-child(even){background:#fafafa;}</style></head>
<body>
  <h1>Student Evidence Report</h1>
  <p>Period: ${escapeHtml(periodLabel)} &nbsp;|&nbsp; Generated: ${escapeHtml(generatedDate)} &nbsp;|&nbsp; Data Source: ${escapeHtml(sourceLabel)} &nbsp;|&nbsp; Students: ${targetStudents.length}</p>
  <p><a href="all-students.html">📄 View All Students (combined document)</a></p>
  <table>
    <thead><tr><th>Student</th><th>Code</th><th>Total Assignments</th><th>Graded (Avg Score)</th><th>Assignments</th><th>Goals</th></tr></thead>
    <tbody>${tocRows}</tbody>
  </table>
  <p style="color:#666;font-size:12px;margin-top:32px;">Reinisch Classroom &mdash; CONFIDENTIAL (FERPA)</p>
</body></html>`;
    root.file('index.html', indexHtml);

    // all-students.html — combined document for all students
    const allStudentsHtml = buildEvidenceDocumentHtml(targetStudents, quarterRange, isParent, sourceLabel, '');
    root.file('all-students.html', allStudentsHtml);

    // summary.csv — one row per student
    const csvHeader = 'Student Name,Student Code,Total Assignments,Graded,Pending,Average Score,Goals on Track,Data Points';
    const csvRows = studentStats.map(({ student: s, totalAssignments, graded, pending, avgScore, goalsOnTrack, dpCount }) => {
      const name = (s.name || s.code).replace(/"/g, '""');
      const code = s.code.replace(/"/g, '""');
      const avg = avgScore != null ? avgScore : '';
      return `"${name}","${code}",${totalAssignments},${graded},${pending},${avg},${goalsOnTrack},${dpCount}`;
    }).join('\n');
    root.file('summary.csv', `${csvHeader}\n${csvRows}`);

    // Per-student folders
    for (const student of targetStudents) {
      const sCode = student.code;
      const sFolder = root.folder(sCode);

      // cover.html
      const coverHtml = buildEvidenceCoverHtml(student, quarterRange, isParent, sourceLabel);
      sFolder.file('cover.html', coverHtml);

      // assignments.html
      const assignmentsHtml = buildEvidenceAssignmentsHtml(student, quarterRange, isParent);
      sFolder.file('assignments.html', assignmentsHtml);

      // goals.html
      const goalsHtml = buildEvidenceGoalsHtml(student, quarterRange, isParent);
      sFolder.file('goals.html', goalsHtml);
    }

    // Generate and download
    const zipBlob = await root.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }


  /**
   * Build cover page HTML for one student (ZIP use)
   */
  function buildEvidenceCoverHtml(student, quarterRange, isParent, sourceLabel) {
    const periodLabel = getTab6PeriodLabel();
    const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const audienceLabel = isParent ? 'Parent' : 'Admin';
    const activeGoals = goalsData.filter((g) => g.student_code === student.code && isGoalActive(g));
    const goalAreas = [...new Set(activeGoals.map((g) => g.area || g.skill_area || '—'))].join(', ') || '—';
    const studentInstances = instancesData.filter(
      (inst) => inst.student_code === student.code || inst.student_id === student.code
    );
    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);
    const rangedInstances = studentInstances.filter((inst) => {
      const d = new Date(inst.assigned_at || inst.created_at || '');
      return isNaN(d.getTime()) || (d >= startDate && d <= endDate);
    });
    const dpCount = activeGoals.reduce(
      (acc, g) => acc + getGoalProgressForQuarter(g.code, student.code, quarterRange).count, 0
    );

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Cover — ${escapeHtml(student.name || student.code)}</title>
<style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#111;}h1{font-size:26px;margin-bottom:4px;}table{border-collapse:collapse;width:100%;margin:16px 0;}td,th{padding:10px 14px;border:1px solid #ddd;text-align:left;}th{background:#f5f5f5;font-weight:600;}.conf{background:#fff3f3;border:1px solid #f87171;border-radius:6px;padding:10px;font-size:13px;color:#b91c1c;margin-top:20px;}</style>
</head><body>
  <h1>Student Evidence Report</h1>
  <h2>${escapeHtml(student.name || student.code)}</h2>
  <table>
    <tr><th>Student Code</th><td>${escapeHtml(student.code)}</td></tr>
    <tr><th>Period</th><td>${escapeHtml(periodLabel)}</td></tr>
    <tr><th>Audience</th><td>${escapeHtml(audienceLabel)}</td></tr>
    <tr><th>Goal Areas</th><td>${escapeHtml(goalAreas)}</td></tr>
    <tr><th>Active Goals</th><td>${activeGoals.length}</td></tr>
    <tr><th>Assignments This Period</th><td>${rangedInstances.length}</td></tr>
    <tr><th>Data Points This Period</th><td>${dpCount}</td></tr>
    <tr><th>Data Source</th><td>${escapeHtml(sourceLabel)}</td></tr>
    <tr><th>Generated</th><td>${escapeHtml(generatedDate)}</td></tr>
  </table>
  <div class="conf">&#9888; CONFIDENTIAL &mdash; For authorized personnel only (FERPA)</div>
  <p style="margin-top:20px;"><a href="assignments.html">View Assignments</a> | <a href="goals.html">View Goal Progress</a></p>
</body></html>`;
  }

  /**
   * Build assignments evidence HTML for one student (ZIP use)
   */
  function buildEvidenceAssignmentsHtml(student, quarterRange, isParent) {
    const periodLabel = getTab6PeriodLabel();
    const studentInstances = instancesData.filter(
      (inst) => inst.student_code === student.code || inst.student_id === student.code
    );
    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);
    const rangedInstances = studentInstances.filter((inst) => {
      const d = new Date(inst.assigned_at || inst.created_at || '');
      return isNaN(d.getTime()) || (d >= startDate && d <= endDate);
    });

    let rows = '';
    if (rangedInstances.length === 0) {
      rows = '<tr><td colspan="6" style="color:#888;font-style:italic;">No assignments found for this period.</td></tr>';
    } else {
      rows = rangedInstances.map((inst) => {
        const assignment = assignmentsData.find((a) => a.id === inst.assignment_id);
        const submission = submissionsData.find(
          (s) => s.instance_id === inst.id || (s.assignment_instances && s.assignment_instances.id === inst.id)
        );
        const title = escapeHtml(assignment?.title || `Assignment ${inst.assignment_id}`);
        const category = escapeHtml(assignment?.category || '—');
        const typeBadge = getAssignmentTypeBadgeHtml(assignment);
        const score = submission?.score_total ?? submission?.score;
        const status = submission ? (score != null ? 'Graded' : 'Submitted') : 'Pending';
        const scoreDisplay = score != null ? `${score}%` : '—';
        const assignedDate = escapeHtml(formatDate(inst.assigned_at || inst.created_at));
        const paperUrl = assignment?.paper_upload_url || submission?.paper_upload_url || '';
        const paperCell = paperUrl
          ? `<a href="${escapeHtml(paperUrl)}" target="_blank">View Upload</a>`
          : '—';
        return `<tr>
          <td>${title}</td>
          ${isParent ? '' : `<td>${typeBadge}</td>`}
          <td>${category}</td>
          <td>${assignedDate}</td>
          <td>${escapeHtml(status)}</td>
          <td>${isParent ? '' : escapeHtml(scoreDisplay)}</td>
          ${isParent ? '' : `<td>${paperCell}</td>`}
        </tr>`;
      }).join('');
    }

    const adminCols = isParent ? '' : '<th>Type</th>';
    const adminScoreCol = isParent ? '' : '<th>Score</th><th>Paper Upload</th>';

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Assignments — ${escapeHtml(student.name || student.code)}</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:20px;color:#111;}h1{font-size:22px;}table{border-collapse:collapse;width:100%;}td,th{padding:9px 12px;border:1px solid #ddd;text-align:left;}th{background:#f5f5f5;font-weight:600;}tr:nth-child(even){background:#fafafa;}</style>
</head><body>
  <h1>Assignment Evidence — ${escapeHtml(student.name || student.code)}</h1>
  <p style="color:#555;">Period: ${escapeHtml(periodLabel)} | <a href="cover.html">Back to Cover</a></p>
  <table>
    <thead><tr>${adminCols}<th>Title</th><th>Category</th><th>Assigned</th><th>Status</th>${adminScoreCol}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;
  }

  /**
   * Build goal progress HTML for one student (ZIP use)
   */
  function buildEvidenceGoalsHtml(student, quarterRange, isParent) {
    const periodLabel = getTab6PeriodLabel();
    const activeGoals = goalsData.filter(
      (g) => g.student_code === student.code && isGoalActive(g)
    );

    let rows = '';
    if (activeGoals.length === 0) {
      rows = '<tr><td colspan="6" style="color:#888;font-style:italic;">No active IEP goals found.</td></tr>';
    } else {
      rows = activeGoals.map((goal) => {
        const data = getGoalProgressForQuarter(goal.code, student.code, quarterRange);
        const avgRaw = data.average != null ? data.average.toFixed(1) : null;
        const progressCell = isParent
          ? (avgRaw == null ? 'No data yet' : data.average >= 80 ? 'On track' : data.average >= 60 ? 'Making progress' : 'Needs support')
          : (data.average != null ? formatGoalValue(data.average, goal.measurement_type, goal) : '—');
        const targetDisplay = goal.target != null ? escapeHtml(String(goal.target)) : '—';
        const masteryDisplay = goal.mastery != null ? escapeHtml(String(goal.mastery)) : targetDisplay;
        const baselineDisplay = goal.baseline != null ? escapeHtml(String(goal.baseline)) : '—';
        const goalDesc = escapeHtml(goal.desc || goal.description || '—');
        const dpCol = isParent ? '' : `<td>${data.count} pts</td>`;
        return `<tr>
          <td>${escapeHtml(goal.code || goal.id || '—')}</td>
          <td>${escapeHtml(goal.area || goal.skill_area || '—')}</td>
          <td style="font-size:12px; max-width:300px; word-break:break-word; line-height:1.45;">${goalDesc}</td>
          <td>${baselineDisplay}</td>
          <td>${escapeHtml(progressCell)}</td>
          <td>${masteryDisplay}</td>
          <td>${targetDisplay}</td>
          ${dpCol}
        </tr>`;
      }).join('');
    }

    const adminDpCol = isParent ? '' : '<th>Data Pts</th>';

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Goal Progress — ${escapeHtml(student.name || student.code)}</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:20px;color:#111;}h1{font-size:22px;}table{border-collapse:collapse;width:100%;}td,th{padding:9px 12px;border:1px solid #ddd;text-align:left;}th{background:#f5f5f5;font-weight:600;}tr:nth-child(even){background:#fafafa;}</style>
</head><body>
  <h1>IEP Goal Progress — ${escapeHtml(student.name || student.code)}</h1>
  <p style="color:#555;">Period: ${escapeHtml(periodLabel)} | <a href="cover.html">Back to Cover</a></p>
  <table>
    <thead><tr><th>Goal</th><th>Area</th><th>Description</th><th>Baseline</th><th>Progress</th><th>Mastery</th><th>Target</th>${adminDpCol}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;
  }

  /**
   * Export evidence data as CSV
   */
  function exportEvidenceCSV(targetStudents, quarterRange) {
    const rows = [['Student', 'Assignment', 'Score', 'Date', 'Category', 'DESE Tags', 'IEP Tags', 'Status']];

    const startDate = new Date(quarterRange.start);
    const endDate = new Date(quarterRange.end);

    targetStudents.forEach((student) => {
      const studentInstances = instancesData.filter(
        (inst) => inst.student_code === student.code || inst.student_id === student.code
      );

      const rangedInstances = studentInstances.filter((inst) => {
        const d = new Date(inst.assigned_at || inst.created_at || '');
        if (isNaN(d.getTime())) return true;
        return d >= startDate && d <= endDate;
      });

      if (rangedInstances.length === 0) {
        rows.push([student.name || student.code, '(no assignments)', '', '', '', '', '', '']);
        return;
      }

      rangedInstances.forEach((inst) => {
        const assignment = assignmentsData.find((a) => a.id === inst.assignment_id);
        const submission = submissionsData.find(
          (s) => s.instance_id === inst.id || (s.assignment_instances && s.assignment_instances.id === inst.id)
        );

        const title = assignment?.title || `Assignment ${inst.assignment_id}`;
        const score = submission?.score_total ?? submission?.score ?? '';
        const date = formatDate(submission?.submitted_at || inst.assigned_at || inst.created_at);
        const category = assignment?.category || '';
        const deseTags = assignment?.dese_tags || assignment?.dese_standards || '';
        const iepTags = assignment?.iep_tags || assignment?.iep_goals || '';
        const status = submission ? (score !== '' ? 'Graded' : 'Submitted') : 'Pending';

        rows.push([
          student.name || student.code,
          title,
          score !== '' ? `${score}%` : '',
          date,
          category,
          Array.isArray(deseTags) ? deseTags.join('; ') : String(deseTags),
          Array.isArray(iepTags) ? iepTags.join('; ') : String(iepTags),
          status,
        ]);
      });
    });

    const csvContent = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-evidence-${formatDateYYYYMMDD()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Get goal data points (helper for TAB 5 / TAB 6)
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
   * @param {Array} dataPoints
   * @param {Object} [goal] - Optional goal object for measurement-type-aware formatting
   */
  function generateDataPointsList(dataPoints, goal) {
    if (dataPoints.length === 0) {
      return "No data collected for this quarter.";
    }

    return dataPoints
      .map((dp, index) => {
        const date = formatDate(dp.date);
        const value = parseFloat(dp.value) || 0;
        const source = dp.source || "Manual entry";
        const displayValue = goal ? formatGoalValue(value, goal.measurement_type, goal) : `${value}%`;
        return `${index + 1}. ${date} — ${displayValue} (${source})`;
      })
      .join("<br/>\n    ");
  }

  /**
   * Generate progress narrative using the rich narrative engine.
   * Backward-compatible wrapper used by Tab 5 (batch reports) and SpedTrack copy.
   *
   * @param {string} studentName
   * @param {Object} goal
   * @param {string} quarter         - Quarter label, e.g. "Q3"
   * @param {number|null} avgValue   - Average score (percentage, may be null)
   * @param {number} dataPointCount  - Number of individual data points collected
   * @param {Object|null} prevData   - Previous quarter { average, count, values } (optional)
   * @returns {string} narrative text
   */
  function generateProgressNarrative(studentName, goal, quarter, avgValue, dataPointCount, prevData) {
    const actualStudent = studentsData.find(s => s.name === studentName || s.code === studentName);
    const student = actualStudent || { name: studentName, code: studentName };
    const quarterData = {
      average: avgValue != null ? parseFloat(avgValue) : null,
      count: dataPointCount || 0,
      values: [],
    };
    const { narrative } = buildRichProgressNarrative(student, goal, quarterData, prevData || null, quarter);
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

    // Handle URL params: ?tab=evidence&student=X
    const urlParams = new URLSearchParams(window.location.search);
    const evidenceTab = urlParams.get('tab');
    const evidenceStudent = urlParams.get('student');
    if (evidenceTab === 'evidence' && evidenceStudent) {
      tab6State.studentCode = evidenceStudent;
      tab6State.selectionMode = 'single';
      switchTab('student-evidence');
    }

    console.log("[tc-reporting] Initialization complete");
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
