/**
 * Teacher Center Overview Dashboard
 * Displays KPIs and quick links to key modules
 */

(async () => {
  "use strict";

  // Only run on overview page
  if (!location.pathname.startsWith("/teacher/")) return;
  if (location.pathname !== "/teacher/" && location.pathname !== "/teacher/index.html") return;

  console.log("[tc-overview] Initializing overview dashboard");

  // Import data adapter
  const { db, isRemote } = await import("/web/data-adapter.js");
  const { getCurrentQuarter, getQuarterDateRange } = await import("/web/quarter-utils.js");
  const {
    parseGoalValue,
    isGoalActive,
    hasCriterionConflict,
    getAutomaticCriterionValue
  } = await import("/web/goal-utils.js");
  const { getSchedule } = await import("/web/class-schedule.js");

  // DOM helper
  const $ = (id) => document.getElementById(id);

  /**
   * Parse an assignment deadline.
   *
   * assignment_instances.due_at is a DATE column. A bare YYYY-MM-DD
   * remains due through the end of that local calendar day. Full
   * timestamps retain their normal instant/timezone semantics.
   */
  function parseAssignmentDeadline(dateStr) {
    if (!dateStr) return null;

    const raw = String(dateStr).trim();
    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? new Date(`${raw}T23:59:59.999`)
        : new Date(raw);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  // SVG check-circle icon (14px inline)
  const SVG_CHECK =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

  // IEP/Eval deadline constants
  const IEP_WINDOW_DAYS = 30;
  const IEP_OVERDUE_CAP = 90;

  // State
  let syncStatus = "local";

  /**
   * Update sync status indicator
   */
  function updateSyncStatus() {
    const statusEl = $("ovSyncStatus");
    const iconEl = $("ovSyncIcon");
    const textEl = $("ovSyncText");

    if (!statusEl || !iconEl || !textEl) return;

    // Show the status indicator
    statusEl.style.display = "inline-flex";

    // Remove all status classes
    statusEl.classList.remove("synced", "local", "error");

    // Add appropriate class and set content
    if (syncStatus === "synced") {
      statusEl.classList.add("synced");
      iconEl.style.background = "#22c55e";
      textEl.textContent = "Synced with Supabase";
    } else if (syncStatus === "error") {
      statusEl.classList.add("error");
      iconEl.style.background = "#ef4444";
      textEl.textContent = "Sync error (using local data)";
    } else {
      statusEl.classList.add("local");
      iconEl.style.background = "#f59e0b";
      textEl.textContent = "Local mode";
    }
  }

  /**
   * Fetch all data resources exactly once and return them as a bundle.
   * Each render function receives this bundle instead of making its own calls.
   * Some methods (listSubmissions, listGoalProgress, listEvents) may not be
   * available in all adapter implementations; guard with existence checks.
   */
  async function loadAllData() {
    const [students, submissions, goals, instances, assignments, progress, events, schedule] =
      await Promise.all([
        db.listStudents(),
        db.listSubmissions ? db.listSubmissions({}) : Promise.resolve([]),
        db.listGoalsAll(),
        db.listAssignmentInstances(),
        db.listAssignments(),
        db.listGoalProgress ? db.listGoalProgress({}) : Promise.resolve([]),
        db.listEvents ? db.listEvents() : Promise.resolve([]),
        getSchedule().catch(() => ({ periods: [], schoolDays: [1, 2, 3, 4, 5], passingMinutes: 4 })),
      ]);
    return { students, submissions, goals, instances, assignments, progress, events, schedule };
  }

  /**
   * Load and display KPIs (uses pre-fetched data bundle)
   */
  function renderKPIs({ students, submissions, goals, instances, progress, schedule }) {
    const currentQuarter = getCurrentQuarter();
    const quarterRange = getQuarterDateRange(currentQuarter);

    // 1. Active Students
    const activeStudents = students.filter((s) => s.active !== false).length;
    const totalStudents = students.length;
    const inactiveStudents = totalStudents - activeStudents;

    // 2. Pending Reviews — pending + in_progress
    const pendingReview = submissions.filter(
      (s) => s.review_status === "pending" || s.review_status === "in_progress"
    ).length;

    // 3. Assignments This Quarter — instances assigned within the current quarter
    // Uses assigned_at (or due_at as fallback) since created_at is not returned by listAssignmentInstances.
    let assignmentsThisQuarter = 0;
    if (quarterRange) {
      assignmentsThisQuarter = instances.filter((inst) => {
        const d = inst.assigned_at
          ? new Date(inst.assigned_at)
          : parseAssignmentDeadline(inst.due_at);
        if (!d || Number.isNaN(d.getTime())) return false;
        return d >= quarterRange.start && d <= quarterRange.end;
      }).length;
    } else {
      // Fallback: if quarter dates are misconfigured and no range is available, count all instances
      assignmentsThisQuarter = instances.length;
    }

    // 4. Goal Progress — average progress across all active goals' latest entries this quarter
    const activeGoals = goals.filter((g) => isGoalActive(g));
    let avgProgress = null;
    if (activeGoals.length > 0) {
      let sumPercent = 0;
      let countWithProgress = 0;
      for (const goal of activeGoals) {
        // Exclude prompt_count observation goals — their raw values are counts, not percentages
        if (goal.measurement_type === 'Observation') {
          const obsConfig = goal.observation_config || {};
          if (obsConfig.category === 'prompt_count') continue;
        }
        const goalProgress = progress.filter(
          (p) =>
            p.goal_code === goal.code &&
            p.student_code === goal.student_code &&
            (!quarterRange ||
              (new Date(p.date) >= quarterRange.start && new Date(p.date) <= quarterRange.end))
        );
        if (goalProgress.length === 0) continue;
        goalProgress.sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest = goalProgress[0];
        const val = latest.percent != null ? latest.percent : latest.value != null ? latest.value : null;
        if (val != null) {
          sumPercent += val;
          countWithProgress++;
        }
      }
      if (countWithProgress > 0) {
        avgProgress = Math.round(sumPercent / countWithProgress);
      }
    }

    const kpiStudents = $("kpiStudents");
    const kpiStudentsSub = $("kpiStudentsSub");
    const kpiReview = $("kpiReview");
    const kpiReviewSub = $("kpiReviewSub");
    const kpiQuarter = $("kpiQuarter");
    const kpiQuarterSub = $("kpiQuarterSub");
    const kpiGoals = $("kpiGoals");
    const kpiGoalsSub = $("kpiGoalsSub");

    if (kpiStudents) kpiStudents.textContent = activeStudents;
    if (kpiStudentsSub)
      kpiStudentsSub.textContent =
        inactiveStudents > 0 ? `of ${totalStudents} total` : "";

    if (kpiReview) kpiReview.textContent = pendingReview;
    if (kpiReviewSub)
      kpiReviewSub.textContent = pendingReview > 0 ? "needs attention" : "";

    if (kpiQuarter) kpiQuarter.textContent = assignmentsThisQuarter;
    if (kpiQuarterSub) kpiQuarterSub.textContent = currentQuarter;

    if (kpiGoals) kpiGoals.textContent = avgProgress != null ? `${avgProgress}%` : "N/A";
    if (kpiGoalsSub)
      kpiGoalsSub.textContent =
        activeGoals.length > 0 ? `Avg across ${activeGoals.length} goal${activeGoals.length !== 1 ? "s" : ""}` : "";

    // 5. Observation Coverage KPI — % of observation goals with data in last 5 school days
    const kpiObsCoverageCard = $("kpiObsCoverageCard");
    const kpiObsCoverage = $("kpiObsCoverage");
    const kpiObsCoverageSub = $("kpiObsCoverageSub");

    if (kpiObsCoverageCard) {
      const obsGoals = activeGoals.filter(g => g.measurement_type === 'Observation');
      if (obsGoals.length === 0) {
        kpiObsCoverageCard.style.display = 'none';
      } else {
        kpiObsCoverageCard.style.display = '';
        const schoolDayNums = (schedule && schedule.schoolDays) ? schedule.schoolDays : [1, 2, 3, 4, 5];
        const last5Days = [];
        const iterDate = new Date();
        iterDate.setHours(0, 0, 0, 0);
        while (last5Days.length < 5) {
          if (schoolDayNums.includes(iterDate.getDay())) {
            last5Days.unshift(formatDateYMD(iterDate));
          }
          iterDate.setDate(iterDate.getDate() - 1);
        }
        const startDate = last5Days[0];

        let obsWithData = 0;
        for (const goal of obsGoals) {
          const hasData = progress.some(p =>
            p.goal_code === goal.code &&
            p.student_code === goal.student_code &&
            p.date >= startDate
          );
          if (hasData) obsWithData++;
        }

        const coveragePct = Math.round((obsWithData / obsGoals.length) * 100);
        const coverageColor = coveragePct >= 80 ? '#22c55e' : coveragePct >= 50 ? '#eab308' : '#ef4444';

        if (kpiObsCoverage) {
          kpiObsCoverage.textContent = `${coveragePct}%`;
          kpiObsCoverage.style.color = coverageColor;
        }
        if (kpiObsCoverageSub) {
          kpiObsCoverageSub.textContent = `${obsWithData} of ${obsGoals.length} goal${obsGoals.length !== 1 ? 's' : ''}`;
        }
      }
    }

    // 6. Near Mastery KPI — goals within 10% of an unambiguous
    // mastery–baseline range. Source-conflicted goals are excluded from
    // automatic near-mastery classification.
    const kpiNearMasteryCard = $("kpiNearMasteryCard");
    const kpiNearMastery = $("kpiNearMastery");
    const kpiNearMasterySub = $("kpiNearMasterySub");

    if (kpiNearMasteryCard) {
      let nearMasteryGoals = 0;
      const nearMasteryStudents = new Set();
      for (const goal of activeGoals) {
        if (goal.measurement_type === 'Observation') continue;
        const masteryNum =
          getAutomaticCriterionValue(goal);

        const baselineNum =
          parseGoalValue(goal.baseline);

        if (
          masteryNum == null ||
          baselineNum == null ||
          masteryNum < baselineNum
        ) {
          continue;
        }
        const range = masteryNum - baselineNum;
        const nearThreshold = masteryNum - range * 0.1;
        const latestProgress = progress
          .filter(p => p.goal_code === goal.code && p.student_code === goal.student_code && p.value != null)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (latestProgress.length === 0) continue;
        const currentVal = parseFloat(latestProgress[0].value);
        if (!isNaN(currentVal) && currentVal >= nearThreshold && currentVal < masteryNum) {
          nearMasteryGoals++;
          nearMasteryStudents.add(goal.student_code);
        }
      }
      if (nearMasteryGoals === 0) {
        kpiNearMasteryCard.style.display = 'none';
      } else {
        kpiNearMasteryCard.style.display = '';
        if (kpiNearMastery) kpiNearMastery.textContent = nearMasteryGoals;
        if (kpiNearMasterySub) {
          kpiNearMasterySub.textContent = `${nearMasteryStudents.size} student${nearMasteryStudents.size !== 1 ? 's' : ''}`;
        }
      }
    }

    // 7. IEP/Eval KPI — upcoming IEP and eval deadlines within IEP_WINDOW_DAYS days
    const kpiIepEvalCard = $("kpiIepEvalCard");
    const kpiIepEval = $("kpiIepEval");
    const kpiIepEvalSub = $("kpiIepEvalSub");

    if (kpiIepEvalCard) {
      const iepNow = new Date();
      iepNow.setHours(0, 0, 0, 0);
      const iepWindowEnd = new Date(iepNow);
      iepWindowEnd.setDate(iepWindowEnd.getDate() + IEP_WINDOW_DAYS);

      const activeStudentList = students.filter((s) => s.active !== false);
      const upcomingDeadlines = [];
      for (const student of activeStudentList) {
        for (const field of ['iep_due', 'eval_due']) {
          if (!student[field]) continue;
          const dueDate = new Date(student[field]);
          dueDate.setHours(0, 0, 0, 0);
          const diffDays = Math.round((dueDate - iepNow) / (1000 * 60 * 60 * 24));
          if (diffDays < -IEP_OVERDUE_CAP) continue; // stale
          if (dueDate > iepWindowEnd) continue;
          upcomingDeadlines.push({ dueDate, student, diffDays });
        }
      }

      if (upcomingDeadlines.length === 0) {
        kpiIepEvalCard.style.display = 'none';
      } else {
        kpiIepEvalCard.style.display = '';
        upcomingDeadlines.sort((a, b) => a.dueDate - b.dueDate);
        const nearest = upcomingDeadlines[0];
        const diffDays = Math.round((nearest.dueDate - iepNow) / (1000 * 60 * 60 * 24));
        const nearestLabel = diffDays < 0
          ? `${Math.abs(diffDays)}d overdue`
          : diffDays === 0
            ? 'Today'
            : `in ${diffDays}d`;
        const kpiColor = diffDays <= 7 ? '#ef4444' : diffDays <= 14 ? '#eab308' : '#7c3aed';
        if (kpiIepEval) {
          kpiIepEval.textContent = upcomingDeadlines.length;
          kpiIepEval.style.color = kpiColor;
        }
        if (kpiIepEvalSub) {
          kpiIepEvalSub.textContent = `Next: ${nearest.student.name} (${nearestLabel})`;
        }
      }
    }

    console.log("[tc-overview] KPIs rendered:", {
      activeStudents,
      pendingReview,
      assignmentsThisQuarter,
      avgProgress,
      currentQuarter,
    });
  }

  /**
   * Return a Date that is n school days before today.
   * @param {number} n
   * @param {number[]} schoolDayNums - day-of-week numbers that are school days (0=Sun…6=Sat)
   */
  function nSchoolDaysAgo(n, schoolDayNums) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    let counted = 0;
    while (counted < n) {
      d.setDate(d.getDate() - 1);
      if (schoolDayNums.includes(d.getDay())) counted++;
    }
    return d;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  function formatDateYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Get relative time string (e.g., "2 hours ago", "yesterday")
   */
  function getRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30)
      return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  }

  /**
   * Render mini calendar snapshot (uses pre-fetched data bundle)
   */
  function renderCalendarSnapshot({ students, instances, assignments }) {
    const miniCalEl = $("ovMiniCalendar");
    const upcomingEl = $("ovUpcomingEvents");

    if (!miniCalEl || !upcomingEl) return;

    const events = [];

    // Assignment due dates
    const assignmentMap = new Map(assignments.map((a) => [a.id, a]));
    for (const inst of instances) {
      if (inst.due_at) {
        const dueDate = parseAssignmentDeadline(inst.due_at);
        if (!dueDate) continue;
        const assignment = assignmentMap.get(inst.assignment_id);
        events.push({
          type: "assignment",
          date: dueDate,
          title: assignment ? assignment.title : "Assignment",
        });
      }
    }

    // IEP/eval dates from students
    for (const student of students) {
      if (student.iep_due) {
        events.push({ type: "iep", date: new Date(student.iep_due), title: `IEP: ${student.name}` });
      }
      if (student.eval_due) {
        events.push({ type: "eval", date: new Date(student.eval_due), title: `Eval: ${student.name}` });
      }
    }

    // Load drafts from localStorage
    const draftsJson = localStorage.getItem("rc_tc_work_drafts_v1");
    if (draftsJson) {
      try {
        const drafts = JSON.parse(draftsJson);
        for (const draft of drafts) {
          if (draft.dueDate) {
            events.push({
              type: "assignment",
              date: new Date(draft.dueDate),
              title: draft.title || "Draft Assignment",
            });
          }
        }
      } catch (e) {
        console.warn("[tc-overview] Failed to parse drafts:", e);
      }
    }

    // Build mini calendar
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));

    const dates = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    let html = '<div class="mini-cal-grid">';
    for (const day of ["S", "M", "T", "W", "T", "F", "S"]) {
      html += `<div class="mini-cal-header">${day}</div>`;
    }
    for (const date of dates) {
      const isOtherMonth = date.getMonth() !== currentMonth;
      const isToday = formatDateYMD(date) === formatDateYMD(today);
      const dateStr = formatDateYMD(date);
      const hasEvents = events.some((e) => formatDateYMD(e.date) === dateStr);

      let cellClass = "mini-cal-day";
      if (isOtherMonth) cellClass += " other-month";
      if (isToday) cellClass += " today";
      if (hasEvents) cellClass += " has-events";

      html += `<div class="${cellClass}">${date.getDate()}</div>`;
    }
    html += "</div>";
    miniCalEl.innerHTML = html;

    // Count upcoming events (next 7 days)
    const todayStr = formatDateYMD(today);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = formatDateYMD(nextWeek);

    const upcomingEvents = events.filter((e) => {
      const eventStr = formatDateYMD(e.date);
      return eventStr >= todayStr && eventStr <= nextWeekStr;
    });

    upcomingEl.innerHTML = `${upcomingEvents.length} event${upcomingEvents.length !== 1 ? "s" : ""} in the next 7 days`;

    console.log("[tc-overview] Calendar snapshot rendered:", upcomingEvents.length, "upcoming events");
  }

  /**
   * Render Action Required Panel (uses pre-fetched data bundle)
   */
  function renderOverdueItems({ instances, submissions, students, goals, progress, assignments, schedule }) {
    const contentEl = $("ovOverdueContent");
    if (!contentEl) return;

    const SECTION_CAP = 5; // max items shown before "Show all" toggle

    const assignmentMap = new Map(assignments.map((a) => [a.id, a]));
    const studentMap = new Map(students.map((s) => [s.code, s]));
    const instanceMap = new Map(instances.map((i) => [i.id, i]));
    const activeStudents = students.filter((s) => s.active !== false);

    // ── 0. IEP & Eval Deadlines ────────────────────────────────────────────
    // Show upcoming (within IEP_WINDOW_DAYS days) and past-due IEP/eval dates for active students.
    const iepNow = new Date();
    iepNow.setHours(0, 0, 0, 0);
    const iepWindowEnd = new Date(iepNow);
    iepWindowEnd.setDate(iepWindowEnd.getDate() + IEP_WINDOW_DAYS);

    const iepDeadlines = [];
    for (const student of activeStudents) {
      for (const [field, label] of [['iep_due', 'IEP'], ['eval_due', 'Eval']]) {
        if (!student[field]) continue;
        const dueDate = new Date(student[field]);
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate > iepWindowEnd) continue; // beyond 30-day future window
        const diffDays = Math.round((dueDate - iepNow) / (1000 * 60 * 60 * 24));
        if (diffDays < -IEP_OVERDUE_CAP) continue; // too far past-due; stale
        iepDeadlines.push({
          studentName: student.name,
          studentCode: student.code,
          type: label,
          dueDate,
          diffDays, // negative = overdue
        });
      }
    }
    iepDeadlines.sort((a, b) => a.dueDate - b.dueDate); // most urgent first

    // ── 1. Unreviewed Submissions ──────────────────────────────────────────
    // Fix undefined bug: resolve student_code via instance if direct lookup fails
    const unreviewed = submissions
      .filter((s) => s.review_status === "pending")
      .map((sub) => {
        let studentCode = sub.student_code;
        if (!studentCode || !studentMap.has(studentCode)) {
          const inst = instanceMap.get(sub.assignment_instance_id);
          if (inst) studentCode = inst.student_code || studentCode;
        }
        const student = studentMap.get(studentCode);
        const inst = instanceMap.get(sub.assignment_instance_id);
        const assignment = inst ? assignmentMap.get(inst.assignment_id) : null;
        return {
          studentName: student?.name || studentCode || 'Unknown',
          studentCode: student?.code || studentCode || '—',
          assignmentTitle: assignment?.title || 'Assignment',
          submittedAt: sub.submitted_at ? new Date(sub.submitted_at) : null,
        };
      });

    // ── 2. Data Collection Overdue ─────────────────────────────────────────
    // Flag goals whose most recent data collection is older than 14 school days.
    // Group results by student so one row covers all overdue goals for that student.
    const OVERDUE_SCHOOL_DAYS = 14;
    const schoolDayNums = (schedule && schedule.schoolDays) ? schedule.schoolDays : [1, 2, 3, 4, 5];

    // Compute the date that is OVERDUE_SCHOOL_DAYS school days ago
    const overdueThreshold = nSchoolDaysAgo(OVERDUE_SCHOOL_DAYS, schoolDayNums);

    // Map: studentCode → { studentName, studentCode, goals: [{ goalCode, goalArea, lastDate }] }
    const overdueByStudent = new Map();

    for (const student of activeStudents) {
      const studentGoals = goals.filter(
        (g) => g.student_code === student.code && isGoalActive(g)
      );
      for (const goal of studentGoals) {
        // Determine overdue threshold: use goal.collection_frequency if available
        let thresholdDate = overdueThreshold;
        if (goal.collection_frequency && typeof goal.collection_frequency === 'number') {
          thresholdDate = nSchoolDaysAgo(goal.collection_frequency, schoolDayNums);
        }
        const thresholdStr = formatDateYMD(thresholdDate);

        const recentEntries = progress.filter(
          (p) => p.student_code === student.code && p.goal_code === goal.code
        );
        recentEntries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const lastDate = recentEntries.length > 0 ? recentEntries[0].date : null;

        const isOverdue = !lastDate || lastDate < thresholdStr;
        if (!isOverdue) continue;

        if (!overdueByStudent.has(student.code)) {
          overdueByStudent.set(student.code, {
            studentName: student.name,
            studentCode: student.code,
            goals: [],
          });
        }
        overdueByStudent.get(student.code).goals.push({
          goalCode: goal.code,
          goalArea: goal.goal_area || '',
          lastDate,
        });
      }
    }

    const dataCollectionOverdue = Array.from(overdueByStudent.values())
      .sort((a, b) => b.goals.length - a.goals.length); // most overdue goals first

    // ── 3. Missing Submissions (past-due instances with no submission) ──────
    const submissionsByInstance = new Map();
    for (const sub of submissions) {
      const iid = sub.assignment_instance_id;
      if (iid) {
        if (!submissionsByInstance.has(iid)) submissionsByInstance.set(iid, []);
        submissionsByInstance.get(iid).push(sub);
      }
    }

    const now = new Date();
    // Map: studentCode → { studentName, studentCode, submissions: [{ assignmentTitle, daysOverdue }] }
    const missingByStudent = new Map();
    for (const inst of instances) {
      if (!inst.due_at) continue;
      const studentRecord = studentMap.get(inst.student_code);
      if (studentRecord && studentRecord.active === false) continue;
      const dueDate = parseAssignmentDeadline(inst.due_at);
      if (!dueDate || dueDate >= now) continue; // not yet overdue
      const hasSub = submissionsByInstance.has(inst.id) && submissionsByInstance.get(inst.id).length > 0;
      if (hasSub) continue;
      const student = studentMap.get(inst.student_code);
      const assignment = assignmentMap.get(inst.assignment_id);
      const daysOverdue = Math.max(
        1,
        Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24))
      );
      const studentCode = student?.code || inst.student_code || '—';
      const studentName = student?.name || inst.student_code || 'Unknown';
      if (!missingByStudent.has(studentCode)) {
        missingByStudent.set(studentCode, { studentName, studentCode, submissions: [] });
      }
      missingByStudent.get(studentCode).submissions.push({
        assignmentTitle: assignment?.title || 'Assignment',
        daysOverdue,
      });
    }
    // Sort by submission count descending (most missing first)
    const missingSubmissions = Array.from(missingByStudent.values())
      .sort((a, b) => b.submissions.length - a.submissions.length);

    // ── 4. Low Observation Coverage ───────────────────────────────────────
    // Surface observation goals missing recent data when coverage < 80%.
    const activeStudentCodes = new Set(activeStudents.map(s => s.code));
    const obsGoals = goals.filter(
      g => g.measurement_type === 'Observation' && isGoalActive(g) && activeStudentCodes.has(g.student_code)
    );
    let lowObsCoverage = [];
    let obsCoveragePct = 100;
    if (obsGoals.length > 0) {
      const obsSchoolDayNums = schoolDayNums; // reuse from Data Collection section
      const last5Days = [];
      const iterDate = new Date();
      iterDate.setHours(0, 0, 0, 0);
      while (last5Days.length < 5) {
        if (obsSchoolDayNums.includes(iterDate.getDay())) {
          last5Days.unshift(formatDateYMD(iterDate));
        }
        iterDate.setDate(iterDate.getDate() - 1);
      }
      const obsStartDate = last5Days[0];

      // Group missing obs goals by student
      const missingObsByStudent = new Map();
      for (const goal of obsGoals) {
        const hasData = progress.some(p =>
          p.goal_code === goal.code &&
          p.student_code === goal.student_code &&
          p.date >= obsStartDate
        );
        if (!hasData) {
          const student = studentMap.get(goal.student_code);
          const studentCode = student?.code || goal.student_code;
          const studentName = student?.name || goal.student_code || 'Unknown';
          if (!missingObsByStudent.has(studentCode)) {
            missingObsByStudent.set(studentCode, { studentName, studentCode, goals: [] });
          }
          missingObsByStudent.get(studentCode).goals.push({
            goalCode: goal.code,
            goalArea: goal.goal_area || '',
          });
        }
      }

      const obsWithData = obsGoals.length - Array.from(missingObsByStudent.values()).reduce((sum, s) => sum + s.goals.length, 0);
      obsCoveragePct = Math.round((obsWithData / obsGoals.length) * 100);

      if (obsCoveragePct < 80) {
        lowObsCoverage = Array.from(missingObsByStudent.values())
          .sort((a, b) => b.goals.length - a.goals.length);
      }
    }

    // ── Render ─────────────────────────────────────────────────────────────
    const hasItems = iepDeadlines.length > 0 || unreviewed.length > 0 || dataCollectionOverdue.length > 0 || missingSubmissions.length > 0 || lowObsCoverage.length > 0;

    if (!hasItems) {
      contentEl.innerHTML = `<div class="ov-card-empty">${SVG_CHECK} All caught up!</div>`;
      $("ovOverdueCard").classList.remove("alert-red");
      $("ovOverdueCard").classList.add("alert-green");
      return;
    }

    $("ovOverdueCard").classList.add("alert-red");
    $("ovOverdueCard").classList.remove("alert-green");

    const summaryParts = [];
    if (iepDeadlines.length > 0) summaryParts.push(`📅 ${iepDeadlines.length} IEP/eval deadline${iepDeadlines.length !== 1 ? 's' : ''}`);
    if (unreviewed.length > 0) summaryParts.push(`⚠️ ${unreviewed.length} unreviewed`);
    if (dataCollectionOverdue.length > 0) summaryParts.push(`📋 ${dataCollectionOverdue.length} students need data`);
    if (missingSubmissions.length > 0) summaryParts.push(`📭 ${missingSubmissions.length} student${missingSubmissions.length !== 1 ? 's' : ''} with missing submissions`);
    if (lowObsCoverage.length > 0) summaryParts.push(`👁️ Obs. coverage: ${obsCoveragePct}%`);

    let html = `<div class="ov-summary">${summaryParts.join(' · ')}</div>`;
    html += '<div class="ov-list-body">';

    // Helper: render a capped section with Show all toggle
    let toggleIdx = 0;
    function cappedSection(items, renderItem) {
      if (items.length === 0) return '';
      const toggleId = `ovToggle${++toggleIdx}`;
      const visible = items.slice(0, SECTION_CAP);
      const hidden = items.slice(SECTION_CAP);
      let s = '';
      for (const item of visible) s += renderItem(item);
      if (hidden.length > 0) {
        s += `<div id="${toggleId}_hidden" style="display:none;">`;
        for (const item of hidden) s += renderItem(item);
        s += `</div>`;
        s += `<div style="margin-top:6px;"><button class="ov-show-all-btn" data-toggle-target="${toggleId}_hidden" data-toggle-label="Show all ${items.length}">Show all ${items.length}</button></div>`;
      }
      return s;
    }

    // IEP & Eval Deadlines (most urgent first)
    if (iepDeadlines.length > 0) {
      const urgentCount = iepDeadlines.filter(d => d.diffDays <= 7).length;
      const badgeClass = urgentCount > 0 ? 'ov-badge-red' : 'ov-badge-purple';
      html += `<div class="ov-section-header"><span>IEP &amp; Eval Deadlines</span><span class="ov-count-badge ${badgeClass}">${iepDeadlines.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      html += cappedSection(iepDeadlines, (item) => {
        let cardClass = 'ov-row-card';
        let dotClass = 'ov-status-dot';
        let dateText = '';
        if (item.diffDays < -30) {
          // Very overdue (31–90 days) — muted red
          cardClass += ' ov-row-card--red ov-row-card--muted';
          dotClass += ' ov-dot-red';
          const days = Math.abs(item.diffDays);
          dateText = `${days} day${days !== 1 ? 's' : ''} overdue`;
        } else if (item.diffDays < 0) {
          cardClass += ' ov-row-card--red';
          dotClass += ' ov-dot-red';
          const days = Math.abs(item.diffDays);
          dateText = `${days} day${days !== 1 ? 's' : ''} overdue`;
        } else if (item.diffDays <= 7) {
          cardClass += ' ov-row-card--red';
          dotClass += ' ov-dot-red';
          dateText = item.diffDays === 0 ? 'Today' : `in ${item.diffDays} day${item.diffDays !== 1 ? 's' : ''}`;
        } else if (item.diffDays <= 14) {
          cardClass += ' ov-row-card--amber';
          dotClass += ' ov-dot-amber';
          dateText = `in ${item.diffDays} days`;
        } else {
          dateText = `in ${item.diffDays} days`;
        }
        const formattedDate = item.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `
        <a href="/teacher/students/?student=${item.studentCode}" class="${cardClass}">
          <span class="${dotClass}"></span>
          <div class="ov-row-body">
            <div class="ov-row-primary">
              <span class="ov-student-name">${item.studentName}</span>
              <span class="ov-student-code">${item.studentCode}</span>
              <span class="ov-row-meta" style="margin-left:auto;">${dateText}</span>
            </div>
            <div class="ov-row-secondary">
              <span class="ov-badge ov-badge-purple">${item.type}</span>
              <span class="ov-row-meta">${formattedDate}</span>
            </div>
          </div>
        </a>`;
      });
      html += '</div>';
    }

    // Unreviewed submissions
    if (unreviewed.length > 0) {
      html += `<div class="ov-section-header"${iepDeadlines.length > 0 ? ' style="margin-top:12px;"' : ''}><span>Unreviewed Submissions</span><span class="ov-count-badge ov-badge-red">${unreviewed.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      html += cappedSection(unreviewed, (sub) => `
        <a href="/teacher/review/" class="ov-row-card ov-row-card--red">
          <span class="ov-status-dot ov-dot-red"></span>
          <div class="ov-row-body">
            <div class="ov-row-primary">
              <span class="ov-student-name">${sub.studentName}</span>
              <span class="ov-student-code">${sub.studentCode}</span>
            </div>
            <div class="ov-row-secondary">
              <span class="ov-badge">${sub.assignmentTitle}</span>
              ${sub.submittedAt ? `<span class="ov-row-meta">${getRelativeTime(sub.submittedAt)}</span>` : ''}
            </div>
          </div>
        </a>`);
      html += '</div>';
    }

    // Data collection overdue — grouped by student
    if (dataCollectionOverdue.length > 0) {
      html += `<div class="ov-section-header"${(iepDeadlines.length > 0 || unreviewed.length > 0) ? ' style="margin-top:12px;"' : ''}><span>Data Collection Overdue</span><span class="ov-count-badge ov-badge-amber">${dataCollectionOverdue.length} student${dataCollectionOverdue.length !== 1 ? 's' : ''}</span></div>`;
      html += '<div class="ov-scroll-body">';
      html += cappedSection(dataCollectionOverdue, (item) => {
        const goalBadges = item.goals.map(g =>
          `<span class="ov-badge" title="${g.goalArea || g.goalCode}">${g.goalCode}</span>`
        ).join(' ');
        return `
        <a href="/teacher/students/?student=${item.studentCode}" class="ov-row-card ov-row-card--amber" style="border-left: 3px solid #f59e0b;">
          <span class="ov-status-dot ov-dot-amber"></span>
          <div class="ov-row-body">
            <div class="ov-row-primary">
              <span class="ov-student-name">${item.studentName}</span>
              <span class="ov-student-code">${item.studentCode}</span>
              <span class="ov-row-meta" style="margin-left:auto;">${item.goals.length} goal${item.goals.length !== 1 ? 's' : ''} overdue</span>
            </div>
            <div class="ov-row-secondary">${goalBadges}</div>
          </div>
        </a>`;
      });
      html += '</div>';
    }

    // Missing submissions (grouped by student)
    if (missingSubmissions.length > 0) {
      const prevSections = iepDeadlines.length + unreviewed.length + dataCollectionOverdue.length;
      html += `<div class="ov-section-header"${prevSections > 0 ? ' style="margin-top:12px;"' : ''}><span>Missing Submissions</span><span class="ov-count-badge ov-badge-red">${missingSubmissions.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      html += cappedSection(missingSubmissions, (item) => {
        const maxDays = Math.max(...item.submissions.map(s => s.daysOverdue));
        const assignmentBadges = item.submissions.map(s => `<span class="ov-badge">${s.assignmentTitle}</span>`).join('');
        return `
        <a href="/teacher/work/" class="ov-row-card ov-row-card--red" style="border-left: 3px solid #ef4444;">
          <span class="ov-status-dot ov-dot-red"></span>
          <div class="ov-row-body">
            <div class="ov-row-primary">
              <span class="ov-student-name">${item.studentName}</span>
              <span class="ov-student-code">${item.studentCode}</span>
              <span class="ov-row-meta" style="margin-left:auto;">${item.submissions.length} missing · up to ${maxDays}d overdue</span>
            </div>
            <div class="ov-row-secondary">${assignmentBadges}</div>
          </div>
        </a>`;
      });
      html += '</div>';
    }

    // Low Observation Coverage
    if (lowObsCoverage.length > 0) {
      const prevSectionCount = iepDeadlines.length + unreviewed.length + dataCollectionOverdue.length + missingSubmissions.length;
      const obsBadgeClass = obsCoveragePct < 50 ? 'ov-badge-red' : 'ov-badge-amber';
      html += `<div class="ov-section-header"${prevSectionCount > 0 ? ' style="margin-top:12px;"' : ''}><span>Low Observation Coverage</span><span class="ov-count-badge ${obsBadgeClass}">${obsCoveragePct}%</span></div>`;
      html += '<div class="ov-scroll-body">';
      html += cappedSection(lowObsCoverage, (item) => {
        const goalBadges = item.goals.map(g =>
          `<span class="ov-badge" title="${g.goalArea || g.goalCode}">${g.goalCode}</span>`
        ).join(' ');
        return `
        <a href="/teacher/students/?student=${item.studentCode}" class="ov-row-card ov-row-card--amber" style="border-left: 3px solid #f59e0b;">
          <span class="ov-status-dot ov-dot-amber"></span>
          <div class="ov-row-body">
            <div class="ov-row-primary">
              <span class="ov-student-name">${item.studentName}</span>
              <span class="ov-student-code">${item.studentCode}</span>
              <span class="ov-row-meta" style="margin-left:auto;">${item.goals.length} goal${item.goals.length !== 1 ? 's' : ''} missing</span>
            </div>
            <div class="ov-row-secondary">
              ${goalBadges}
              <span class="ov-row-meta">No data in last 5 school days</span>
            </div>
          </div>
        </a>`;
      });
      html += '</div>';
    }

    html += '</div>';
    contentEl.innerHTML = html;

    // Attach toggle handlers via delegation
    contentEl.querySelectorAll('button[data-toggle-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.toggleTarget);
        if (!target) return;
        if (target.style.display === 'none') {
          target.style.display = '';
          btn.textContent = 'Show less';
        } else {
          target.style.display = 'none';
          btn.textContent = btn.dataset.toggleLabel;
        }
      });
    });
  }
  function renderAtRiskStudents({ students, goals, progress }) {
    const contentEl = $("ovAtRiskContent");
    if (!contentEl) return;

    const SECTION_CAP = 5;          // max student rows shown before "Show all" toggle
    const BAR_PADDING = 1.1;        // 10% padding above max value for progress bar scale
    const TREND_WINDOW = 30;        // analyse data from last 30 days
    const STALLED_BAND = 5;         // last 3+ points within ≤5% range = stalled
    const NO_DATA_CAP = 5;          // max "No Data" entries shown inline

    const trendCutoff = new Date();
    trendCutoff.setDate(trendCutoff.getDate() - TREND_WINDOW);
    const trendCutoffStr = formatDateYMD(trendCutoff);

    // Maps: studentCode → { studentName, studentCode, regressingGoals[], stalledGoals[] }
    const alertByStudent = new Map();
    const noDataStudentCodes = new Set();

    function ensureStudentEntry(student) {
      if (!alertByStudent.has(student.code)) {
        alertByStudent.set(student.code, {
          studentName: student.name,
          studentCode: student.code,
          regressingGoals: [],
          stalledGoals: [],
          goalItems: {},
        });
      }
      return alertByStudent.get(student.code);
    }

    for (const student of students.filter((s) => s.active !== false)) {
      const studentGoals = goals.filter(
        (g) => g.student_code === student.code && isGoalActive(g)
      );
      if (studentGoals.length === 0) continue;

      let hasAnyData = false;

      for (const goal of studentGoals) {
        const allGoalProgress = progress.filter(
          (p) => p.student_code === student.code && p.goal_code === goal.code
        );
        if (allGoalProgress.length > 0) hasAnyData = true;

        // Time-scope to last 30 days
        const recentProgress = allGoalProgress
          .filter((p) => p.date && p.date >= trendCutoffStr)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (recentProgress.length === 0) continue;

        // ── Observation goals ─────────────────────────────────────────────
        if (goal.measurement_type === 'Observation') {
          const obsConfig = goal.observation_config || {};
          const category = obsConfig.category || '';

          if (category === 'session_outcome') {
            const window5 = recentProgress.slice(0, 5);
            const metCount = window5.filter(e => {
              const notes = e.notes || '';
              return notes.includes('[obs:session_outcome:met]');
            }).length;
            const criterionConflict =
              hasCriterionConflict(goal);

            const automaticCriterion =
              getAutomaticCriterionValue(goal);

            const targetSessions =
              obsConfig.target_met != null
                ? obsConfig.target_met
                : (
                    automaticCriterion != null
                      ? automaticCriterion
                      : (
                          criterionConflict
                            ? null
                            : 3
                        )
                  );

            if (targetSessions == null) {
              continue;
            }

            if (metCount < targetSessions * 0.5) {
              const entry = ensureStudentEntry(student);
              const item = {
                goalCode: goal.code,
                goalArea: goal.goal_area || '',
                current: metCount,
                baseline: 0,
                mastery: null,
                baselineRaw: goal.baseline || '0',
                criterionConflict,
                headerMasteryRaw:
                  goal.mastery ?? null,
                goalTextTargetRaw:
                  goal.target ?? null,
                masteryRaw:
                  criterionConflict
                    ? null
                    : (goal.mastery || goal.target || null),
                currentRaw: `${metCount}/${window5.length} sessions met`,
              };
              entry.stalledGoals.push(goal.code);
              entry.goalItems[goal.code] = { item, severity: 'amber' };
            }
            continue;
          }

          if (category === 'prompt_count') {
            const recentValues = recentProgress.slice(0, 5).map(e => parseFloat(e.value)).filter(v => !isNaN(v));
            if (recentValues.length === 0) continue;
            const avgPrompts = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
            const criterionConflict =
              hasCriterionConflict(goal);

            const automaticCriterion =
              getAutomaticCriterionValue(goal);

            const targetMax =
              obsConfig.target_max_prompts != null
                ? obsConfig.target_max_prompts
                : (
                    automaticCriterion != null
                      ? automaticCriterion
                      : (
                          criterionConflict
                            ? null
                            : 2
                        )
                  );

            if (targetMax == null) {
              continue;
            }

            if (avgPrompts > targetMax * 1.5) {
              const entry = ensureStudentEntry(student);
              const item = {
                goalCode: goal.code,
                goalArea: goal.goal_area || '',
                current: Math.round(avgPrompts * 10) / 10,
                baseline: 0,
                mastery: null,
                baselineRaw: goal.baseline || '0',
                criterionConflict,
                headerMasteryRaw:
                  goal.mastery ?? null,
                goalTextTargetRaw:
                  goal.target ?? null,
                masteryRaw:
                  criterionConflict
                    ? null
                    : (goal.mastery || goal.target || null),
                currentRaw: `Avg ${avgPrompts.toFixed(1)} prompts (target: ${targetMax})`,
              };
              entry.stalledGoals.push(goal.code);
              entry.goalItems[goal.code] = { item, severity: 'amber' };
            }
            continue;
          }
        }

        // ── Numeric percentage goals ───────────────────────────────────────
        const criterionConflict =
          hasCriterionConflict(goal);

        const baselineNum =
          parseGoalValue(goal.baseline);

        const masteryNum =
          getAutomaticCriterionValue(goal);

        const values = recentProgress
          .map(p => p.value != null ? parseFloat(p.value) : null)
          .filter(v => v != null);

        if (values.length === 0 || baselineNum == null) continue;

        const currentNum = values[0];

        const item = {
          goalCode: goal.code,
          goalArea: goal.goal_area || '',
          current: Math.round(currentNum * 10) / 10,
          baseline: Math.round(baselineNum * 10) / 10,
          mastery:
            masteryNum != null
              ? Math.round(masteryNum * 10) / 10
              : null,
          baselineRaw: goal.baseline,
          criterionConflict,
          headerMasteryRaw:
            goal.mastery ?? null,
          goalTextTargetRaw:
            goal.target ?? null,
          masteryRaw:
            criterionConflict
              ? null
              : (goal.mastery || goal.target || null),
          currentRaw: recentProgress[0].value,
        };

        // Trend: check last 3 data points for consistent decline
        const last3 = values.slice(0, 3);
        let isRegressing = false;
        let isStalled = false;

        if (currentNum < baselineNum) {
          // Current is below baseline — always regressing
          isRegressing = true;
        } else if (last3.length >= 2) {
          // Check if every consecutive pair shows a decline
          // newest-first: [60, 55, 50] for a declining trend
          // each older value (higher index) should be greater than the newer one before it
          const allDecline = last3.every((v, i) => i === 0 || v > last3[i - 1]);
          if (allDecline) isRegressing = true;
        }

        if (!isRegressing) {
          if (last3.length >= 3) {
            const rangeSpan = Math.max(...last3) - Math.min(...last3);
            if (rangeSpan <= STALLED_BAND) isStalled = true;
          } else if (currentNum <= baselineNum + STALLED_BAND) {
            isStalled = true;
          }
        }

        if (isRegressing) {
          const entry = ensureStudentEntry(student);
          entry.regressingGoals.push(goal.code);
          entry.goalItems[goal.code] = { item, severity: 'red' };
        } else if (isStalled) {
          const entry = ensureStudentEntry(student);
          entry.stalledGoals.push(goal.code);
          entry.goalItems[goal.code] = { item, severity: 'amber' };
        }
      }

      // No Data: student has active goals but zero progress data ever
      if (!hasAnyData && studentGoals.length > 0) {
        noDataStudentCodes.add(student.code);
      }
    }

    // Sort: regressing first, then more goals first
    const alertStudents = Array.from(alertByStudent.values()).sort((a, b) => {
      const aScore = a.regressingGoals.length * 10 + a.stalledGoals.length;
      const bScore = b.regressingGoals.length * 10 + b.stalledGoals.length;
      return bScore - aScore;
    });

    const noDataStudents = students.filter(s => noDataStudentCodes.has(s.code));

    const hasAlerts = alertStudents.length > 0 || noDataStudents.length > 0;

    if (!hasAlerts) {
      contentEl.innerHTML = `<div class="ov-card-empty">${SVG_CHECK} All students progressing above baseline</div>`;
      $("ovAtRiskCard").classList.remove("alert-amber");
      $("ovAtRiskCard").classList.add("alert-green");
      return;
    }

    $("ovAtRiskCard").classList.add("alert-amber");
    $("ovAtRiskCard").classList.remove("alert-green");

    const totalRegressing = alertStudents.filter(s => s.regressingGoals.length > 0).length;
    const totalStalled = alertStudents.filter(s => s.stalledGoals.length > 0 && s.regressingGoals.length === 0).length;

    const summaryParts = [];
    if (totalRegressing > 0) summaryParts.push(`🔴 ${totalRegressing} regressing`);
    if (totalStalled > 0) summaryParts.push(`🟡 ${totalStalled} stalled`);
    if (noDataStudents.length > 0) summaryParts.push(`⚫ ${noDataStudents.length} no data`);

    let html = `<div class="ov-summary">${summaryParts.join(' · ')}</div>`;
    html += '<div class="ov-list-body">';

    function buildProgressBar(item, fillClass) {
      if (
        item.mastery == null &&
        !item.criterionConflict
      ) {
        return '';
      }

      const maxVal =
        Math.max(
          item.current,
          item.baseline,
          item.mastery ?? 0
        ) * BAR_PADDING || 100;

      const currentPct =
        Math.min(
          100,
          (item.current / maxVal) * 100
        ).toFixed(1);

      const baselinePct =
        Math.min(
          100,
          (item.baseline / maxVal) * 100
        ).toFixed(1);

      const masteryMarker =
        item.mastery != null
          ? `<div class="ov-progress-marker ov-marker-mastery" style="left:${Math.min(
              100,
              (item.mastery / maxVal) * 100
            ).toFixed(1)}%" title="Mastery: ${item.masteryRaw}"></div>`
          : '';

      const trackTitle =
        item.criterionConflict
          ? `Current: ${item.currentRaw} | Baseline: ${item.baselineRaw} | Manual Criterion Review Required`
          : `Current: ${item.currentRaw} | Baseline: ${item.baselineRaw} | Mastery: ${item.masteryRaw}`;

      return `
        <div class="ov-progress-track" title="${trackTitle}">
          <div class="ov-progress-fill ${fillClass}" style="width:${currentPct}%"></div>
          <div class="ov-progress-marker ov-marker-baseline" style="left:${baselinePct}%" title="Baseline: ${item.baselineRaw}"></div>
          ${masteryMarker}
        </div>`;
    }

    // Render a student row with expandable goal details
    let detailIdx = 0;
    function buildStudentAlertRow(entry) {
      const regressCount = entry.regressingGoals.length;
      const stalledCount = entry.stalledGoals.length;
      const dominantSeverity = regressCount > 0 ? 'red' : 'amber';
      const cardClass = dominantSeverity === 'red' ? 'ov-row-card--red' : 'ov-row-card--amber';
      const dotClass = dominantSeverity === 'red' ? 'ov-dot-red' : 'ov-dot-amber';
      const borderColor = dominantSeverity === 'red' ? '#ef4444' : '#f59e0b';

      const metaParts = [];
      if (regressCount > 0) metaParts.push(`${regressCount} regressing`);
      if (stalledCount > 0) metaParts.push(`${stalledCount} stalled`);

      const allGoalCodes = [...entry.regressingGoals, ...entry.stalledGoals];
      const goalBadges = allGoalCodes.map(gc => `<span class="ov-badge">${gc}</span>`).join(' ');

      const detailId = `ovAlertDetail${++detailIdx}`;
      const hasDetails = Object.keys(entry.goalItems).length > 0;

      let detailHtml = '';
      if (hasDetails) {
        detailHtml = `<div id="${detailId}" style="display:none; margin-top:6px; padding-left:4px;">`;
        for (const goalCode of allGoalCodes) {
          const gi = entry.goalItems[goalCode];
          if (!gi) continue;
          const fillClass = gi.severity === 'red' ? 'ov-fill-red' : 'ov-fill-amber';
          const metaText =
            gi.item.criterionConflict
              ? `${gi.item.currentRaw} current · baseline: ${gi.item.baselineRaw} · Header Mastery: ${gi.item.headerMasteryRaw ?? 'N/A'} · Goal-Text Target: ${gi.item.goalTextTargetRaw ?? 'N/A'} · Manual Criterion Review Required`
              : (
                  gi.item.masteryRaw
                    ? `${gi.item.currentRaw} current · baseline: ${gi.item.baselineRaw} · mastery: ${gi.item.masteryRaw}`
                    : `${gi.item.currentRaw} current · baseline: ${gi.item.baselineRaw}`
                );
          detailHtml += `
            <div style="margin-bottom:6px; padding:4px 0; border-top:1px solid rgba(0,0,0,0.06);">
              <div class="ov-row-secondary" style="margin-bottom:4px;">
                <span class="ov-badge">${gi.item.goalCode}</span>
                ${gi.item.goalArea ? `<span class="ov-badge ov-badge-area">${gi.item.goalArea}</span>` : ''}
              </div>
              ${buildProgressBar(gi.item, fillClass)}
              <div class="ov-row-meta">${metaText}</div>
            </div>`;
        }
        detailHtml += '</div>';
      }

      const toggleBtn = hasDetails ? `<button class="ov-show-all-btn" style="margin-top:4px;" data-toggle-target="${detailId}" data-toggle-label="▼ Show details" data-toggle-open-label="▲ Hide details">▼ Show details</button>` : '';

      return `
      <a href="/teacher/students/?student=${entry.studentCode}" class="ov-row-card ${cardClass}" style="border-left: 3px solid ${borderColor};">
        <span class="ov-status-dot ${dotClass}"></span>
        <div class="ov-row-body">
          <div class="ov-row-primary">
            <span class="ov-student-name">${entry.studentName}</span>
            <span class="ov-student-code">${entry.studentCode}</span>
            <span class="ov-row-meta" style="margin-left:auto;">${metaParts.join(' · ')}</span>
          </div>
          <div class="ov-row-secondary">${goalBadges}</div>
          ${detailHtml}
          ${toggleBtn}
        </div>
      </a>`;
    }

    // Helper: Show-all toggle for student rows
    let saIdx = 0;
    function cappedStudentSection(items, renderFn) {
      if (items.length === 0) return '';
      const saId = `ovSA${++saIdx}`;
      const visible = items.slice(0, SECTION_CAP);
      const hidden = items.slice(SECTION_CAP);
      let s = '';
      for (const item of visible) s += renderFn(item);
      if (hidden.length > 0) {
        s += `<div id="${saId}_hidden" style="display:none;">`;
        for (const item of hidden) s += renderFn(item);
        s += `</div>`;
        s += `<div style="margin-top:6px;"><button class="ov-show-all-btn" data-toggle-target="${saId}_hidden" data-toggle-label="Show all ${items.length}">Show all ${items.length}</button></div>`;
      }
      return s;
    }

    // Regressing students
    const regressingStudents = alertStudents.filter(s => s.regressingGoals.length > 0);
    if (regressingStudents.length > 0) {
      html += `<div class="ov-section-header"><span>Regressing</span><span class="ov-count-badge ov-badge-red">${regressingStudents.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      html += cappedStudentSection(regressingStudents, buildStudentAlertRow);
      html += '</div>';
    }

    // Stalled students (stalled but not regressing)
    const stalledStudents = alertStudents.filter(s => s.stalledGoals.length > 0 && s.regressingGoals.length === 0);
    if (stalledStudents.length > 0) {
      html += `<div class="ov-section-header"${regressingStudents.length > 0 ? ' style="margin-top:12px;"' : ''}><span>Stalled</span><span class="ov-count-badge ov-badge-amber">${stalledStudents.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      html += cappedStudentSection(stalledStudents, buildStudentAlertRow);
      html += '</div>';
    }

    // No Data students
    if (noDataStudents.length > 0) {
      const prevCount = regressingStudents.length + stalledStudents.length;
      html += `<div class="ov-section-header"${prevCount > 0 ? ' style="margin-top:12px;"' : ''}><span>No Data Collected</span><span class="ov-count-badge" style="background:#6b7280;color:#fff;">${noDataStudents.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      const shown = noDataStudents.slice(0, NO_DATA_CAP);
      for (const s of shown) {
        html += `
        <a href="/teacher/students/?student=${s.code}" class="ov-row-card" style="border-left: 3px solid #6b7280;">
          <span class="ov-status-dot" style="background:#9ca3af;"></span>
          <div class="ov-row-body">
            <div class="ov-row-primary">
              <span class="ov-student-name">${s.name}</span>
              <span class="ov-student-code">${s.code}</span>
            </div>
            <div class="ov-row-secondary"><span class="ov-row-meta">No progress data recorded</span></div>
          </div>
        </a>`;
      }
      if (noDataStudents.length > NO_DATA_CAP) {
        html += `<div class="ov-row-meta" style="padding:6px 4px;">…and ${noDataStudents.length - NO_DATA_CAP} more</div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    contentEl.innerHTML = html;

    // Attach toggle handlers via delegation (avoids inline onclick)
    contentEl.querySelectorAll('button[data-toggle-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.toggleTarget);
        if (!target) return;
        if (target.style.display === 'none') {
          target.style.display = '';
          btn.textContent = btn.dataset.toggleOpenLabel || 'Show less';
        } else {
          target.style.display = 'none';
          btn.textContent = btn.dataset.toggleLabel;
        }
      });
    });
  }

  /**
   * Render Today's Checklist (uses pre-fetched data bundle)
   */
  async function renderChecklist({ submissions, instances, goals, progress, students, schedule }) {
    const contentEl = $("ovChecklistContent");
    if (!contentEl) return;

    const today = formatDateYMD(new Date());
    const checklistKey = `rc_overview_checklist_${today}`;
    const configKey = `checklist_${today}`;

    // Load saved state: try Supabase first if remote, fall back to localStorage
    let savedChecklist = JSON.parse(localStorage.getItem(checklistKey) || "{}");
    const useRemote = await isRemote();
    if (useRemote) {
      try {
        const remoteState = await db.getAppConfig(configKey);
        if (remoteState && typeof remoteState === "object") {
          savedChecklist = remoteState;
          // Keep localStorage in sync as an offline cache
          localStorage.setItem(checklistKey, JSON.stringify(savedChecklist));
        }
      } catch {
        // Supabase unavailable — keep using localStorage fallback
      }
    }

    const checklist = [];

    // Unreviewed submissions
    const unreviewedCount = submissions.filter((s) => s.review_status === "pending").length;
    if (unreviewedCount > 0) {
      checklist.push({
        id: "review-submissions",
        text: `Review ${unreviewedCount} unreviewed submission${unreviewedCount !== 1 ? "s" : ""}`,
        link: "/teacher/review/",
        checked: savedChecklist["review-submissions"] || false,
      });
    }

    // Missing progress data — aligned with Command Center rolling-window approach
    const scheduleSchoolDays = (schedule && schedule.schoolDays) ? schedule.schoolDays : [1, 2, 3, 4, 5];
    let overdueGoalsCount = 0;

    const activeStudentsForChecklist = students.filter((s) => s.active !== false);
    for (const student of activeStudentsForChecklist) {
      const studentGoals = goals.filter(
        (g) => g.student_code === student.code && isGoalActive(g)
      );
      for (const goal of studentGoals) {
        const effectiveDays = (goal.collection_frequency && typeof goal.collection_frequency === 'number')
          ? goal.collection_frequency
          : 14;
        const goalThreshold = formatDateYMD(nSchoolDaysAgo(effectiveDays, scheduleSchoolDays));
        const recentEntries = progress.filter(
          (p) => p.student_code === student.code && p.goal_code === goal.code
        );
        recentEntries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const lastDate = recentEntries.length > 0 ? recentEntries[0].date : null;
        if (!lastDate || lastDate < goalThreshold) overdueGoalsCount++;
      }
    }

    if (overdueGoalsCount > 0) {
      checklist.push({
        id: "collect-progress",
        text: `Collect progress data for ${overdueGoalsCount} goal${overdueGoalsCount !== 1 ? "s" : ""} (data collection overdue)`,
        link: "/teacher/students/",
        checked: savedChecklist["collect-progress"] || false,
      });
    }

    // Assignments due this week
    const nowDate = new Date();
    const weekFromNow = new Date(nowDate);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    weekFromNow.setHours(23, 59, 59, 999);

    const dueThisWeek = instances.filter((i) => {
      if (!i.due_at) return false;
      const dueDate = parseAssignmentDeadline(i.due_at);
      return Boolean(dueDate && dueDate >= nowDate && dueDate <= weekFromNow);
    });

    if (dueThisWeek.length > 0) {
      checklist.push({
        id: "assignments-due",
        text: `${dueThisWeek.length} assignment${dueThisWeek.length !== 1 ? "s" : ""} due this week`,
        link: "/teacher/calendar/",
        checked: savedChecklist["assignments-due"] || false,
      });
    }

    // Upcoming IEP meetings (within IEP_WINDOW_DAYS days)
    const iepWindowEnd = new Date(nowDate);
    iepWindowEnd.setDate(iepWindowEnd.getDate() + IEP_WINDOW_DAYS);

    let upcomingIEPs = 0;
    for (const student of students) {
      if (student.iep_due) {
        const iepDate = new Date(student.iep_due);
        if (iepDate >= nowDate && iepDate <= iepWindowEnd) upcomingIEPs++;
      }
    }

    if (upcomingIEPs > 0) {
      checklist.push({
        id: "iep-meetings",
        text: `${upcomingIEPs} IEP meeting${upcomingIEPs !== 1 ? "s" : ""} coming up within ${IEP_WINDOW_DAYS} days`,
        link: "/teacher/students/",
        checked: savedChecklist["iep-meetings"] || false,
      });
    }

    if (checklist.length === 0) {
      contentEl.innerHTML = `<div class="ov-card-empty">${SVG_CHECK} All tasks complete!</div>`;
      return;
    }

    let html = "<div>";
    for (const item of checklist) {
      html += `
        <div class="checklist-item">
          <input type="checkbox" class="checklist-checkbox" data-id="${item.id}" ${item.checked ? "checked" : ""}>
          <div class="checklist-text">
            ${item.link ? `<a href="${item.link}">${item.text}</a>` : item.text}
          </div>
        </div>
      `;
    }
    html += "</div>";

    contentEl.innerHTML = html;

    // Persist checkbox state
    let saveTimer = null;
    contentEl.querySelectorAll(".checklist-checkbox").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const currentDay = formatDateYMD(new Date());
        const currentKey = `rc_overview_checklist_${currentDay}`;
        const currentConfigKey = `checklist_${currentDay}`;
        const currentSaved = JSON.parse(localStorage.getItem(currentKey) || "{}");
        const id = e.target.dataset.id;
        currentSaved[id] = e.target.checked;
        // Always save to localStorage immediately (offline-safe)
        localStorage.setItem(currentKey, JSON.stringify(currentSaved));
        // Debounce Supabase writes to avoid in-flight race conditions on rapid toggles
        if (useRemote) {
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            db.setAppConfig(currentConfigKey, currentSaved).catch(() => {});
          }, 500);
        }
      });
    });
  }

  /**
   * Arms a 60-second interval date-check and a visibilitychange listener so the checklist
   * re-renders whenever the day rolls over. Whichever fires first cancels the other to
   * prevent double re-renders. After re-rendering, fresh data is fetched and both
   * mechanisms are re-armed so the page is always ready for the next day boundary.
   * If the fresh-data fetch fails, the watch re-arms with the existing stale data as a
   * last resort so the midnight watch never permanently dies.
   */
  function armChecklistMidnightWatch(data) {
    const renderedDay = formatDateYMD(new Date());
    const ac = new AbortController();

    // Check every 60 s if the day has rolled over — avoids long-timer drift
    const CHECK_INTERVAL_MS = 60_000;
    const intervalId = setInterval(() => {
      if (formatDateYMD(new Date()) !== renderedDay) {
        triggerRerender();
      }
    }, CHECK_INTERVAL_MS);

    function triggerRerender() {
      clearInterval(intervalId); // cancel the interval
      ac.abort(); // remove the visibility listener
      // Fetch fresh data so overnight changes are visible
      loadAllData()
        .then(freshData => renderChecklist(freshData).then(() => armChecklistMidnightWatch(freshData)))
        .catch((err) => {
          console.warn("[tc-overview] Midnight re-render failed; re-arming with stale data:", err);
          armChecklistMidnightWatch(data); // fallback: re-arm with stale data
        });
    }

    // Visibility change listener — fires when user returns to page after midnight
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && formatDateYMD(new Date()) !== renderedDay) {
        triggerRerender();
      }
    }, { signal: ac.signal });
  }

  /**
   * Render Recent Activity Feed (uses pre-fetched data bundle)
   */
  function renderActivityFeed({ submissions, progress, instances, assignments, students }) {
    const contentEl = $("ovFeedContent");
    if (!contentEl) return;

    const studentMap = new Map(students.map((s) => [s.code, s]));
    const assignmentMap = new Map(assignments.map((a) => [a.id, a]));

    const events = [];

    // Submissions
    for (const sub of submissions) {
      if (sub.submitted_at) {
        const studentCode = sub.assignment_instances?.students?.code || sub.student_code;
        const student = studentMap.get(studentCode);
        const instanceId = sub.instance_id || sub.assignment_instance_id;
        const instance = instances.find((i) => i.id === instanceId);
        const assignment = instance ? assignmentMap.get(instance.assignment_id) : null;
        events.push({
          type: "submission",
          date: new Date(sub.submitted_at),
          text: `${student?.name || studentCode || "Unknown"} submitted ${assignment?.title || "Assignment"}`,
          icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        });
      }
    }

    // Progress entries
    for (const p of progress) {
      if (p.date) {
        const student = studentMap.get(p.student_code);
        events.push({
          type: "progress",
          date: new Date(p.date),
          text: `Progress recorded for ${student?.name || p.student_code} Goal ${p.goal_code}`,
          icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
        });
      }
    }

    // New assignments (from instance created_at)
    const seenAssignments = new Set();
    for (const inst of instances) {
      if (inst.created_at && !seenAssignments.has(inst.assignment_id)) {
        seenAssignments.add(inst.assignment_id);
        const assignment = assignmentMap.get(inst.assignment_id);
        events.push({
          type: "assignment",
          date: new Date(inst.created_at),
          text: `${assignment?.title || "Assignment"} issued`,
          icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        });
      }
    }

    // Sort by date (most recent first)
    events.sort((a, b) => b.date - a.date);

    if (events.length === 0) {
      contentEl.innerHTML = `<div class="ov-card-empty">${SVG_CHECK} No recent activity</div>`;
      return;
    }

    // Filter buttons — type
    let html = `<div class="ov-feed-filters">
      <button class="ov-feed-filter active" data-filter="all">All</button>
      <button class="ov-feed-filter" data-filter="submission">Submissions</button>
      <button class="ov-feed-filter" data-filter="progress">Progress</button>
      <button class="ov-feed-filter" data-filter="assignment">Assignments</button>
    </div>`;

    // Filter buttons — time scope
    html += `<div class="ov-feed-filters" data-filter-group="scope">
      <button class="ov-feed-filter" data-scope="today">Today</button>
      <button class="ov-feed-filter active" data-scope="week">This Week</button>
      <button class="ov-feed-filter" data-scope="all">All Time</button>
    </div>`;

    html += "<div class='ov-feed-list'></div>";
    html += `<div class="ov-feed-empty" style="display:none;">${SVG_CHECK} No matching activity</div>`;

    contentEl.innerHTML = html;

    // Helper: build and render the visible list based on current filter + scope
    function applyFilters() {
      const activeTypeBtn = contentEl.querySelector('.ov-feed-filters:not([data-filter-group]) .ov-feed-filter.active');
      const activeScopeBtn = contentEl.querySelector('.ov-feed-filters[data-filter-group="scope"] .ov-feed-filter.active');
      const typeFilter = activeTypeBtn ? activeTypeBtn.dataset.filter : 'all';
      const scope = activeScopeBtn ? activeScopeBtn.dataset.scope : 'week';

      const todayStr = formatDateYMD(new Date());
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = formatDateYMD(weekAgo);

      const filtered = events.filter(ev => {
        // Apply time scope
        const evStr = formatDateYMD(ev.date);
        if (scope === 'today' && evStr !== todayStr) return false;
        if (scope === 'week' && evStr < weekAgoStr) return false;
        // Apply type filter
        if (typeFilter !== 'all' && ev.type !== typeFilter) return false;
        return true;
      }).slice(0, 10);

      const feedList = contentEl.querySelector('.ov-feed-list');
      const feedEmptyEl = contentEl.querySelector('.ov-feed-empty');

      if (filtered.length === 0) {
        feedList.innerHTML = '';
        if (feedEmptyEl) feedEmptyEl.style.display = '';
      } else {
        if (feedEmptyEl) feedEmptyEl.style.display = 'none';
        feedList.innerHTML = filtered.map(event => `
          <div class="activity-item" data-type="${event.type}">
            <div class="activity-icon">${event.icon}</div>
            <div class="activity-text">${event.text}</div>
            <div class="activity-time">${getRelativeTime(event.date)}</div>
          </div>
        `).join('');
      }
    }

    // Initial render
    applyFilters();

    // Filter delegation
    contentEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.ov-feed-filter');
      if (!btn) return;
      const group = btn.closest('.ov-feed-filters');
      // Deactivate siblings in same group
      group.querySelectorAll('.ov-feed-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  }

  /**
   * Render the "Last data entry" indicator below the KPI cards.
   */
  function renderLastEntry({ progress }) {
    const el = $("ovLastEntry");
    if (!el) return;

    if (!progress || progress.length === 0) {
      el.textContent = "No data collected yet";
      el.style.color = "";
      el.style.opacity = "0.5";
      return;
    }

    // Exclude auto-generated entries (e.g., from submission reviews)
    const manualProgress = progress.filter(p => {
      if (p.source && ['auto', 'submission'].includes(p.source)) return false;
      return true;
    });

    if (manualProgress.length === 0) {
      el.textContent = "No data collected yet";
      el.style.color = "";
      el.style.opacity = "0.5";
      return;
    }

    // Find the most recent date string across manual progress entries
    const mostRecentStr = manualProgress.reduce((max, p) => (p.date > max ? p.date : max), "");
    if (!mostRecentStr) {
      el.textContent = "No data collected yet";
      el.style.color = "";
      el.style.opacity = "0.5";
      return;
    }

    const mostRecentDate = new Date(mostRecentStr);
    const diffDays = Math.floor((new Date() - mostRecentDate) / (1000 * 60 * 60 * 24));
    const label = getRelativeTime(mostRecentDate);
    el.textContent = `Last data entry: ${label}`;

    if (diffDays > 7) {
      el.style.color = "#ef4444";
      el.style.opacity = "0.9";
    } else if (diffDays > 3) {
      el.style.color = "#eab308";
      el.style.opacity = "0.8";
    } else {
      el.style.color = "";
      el.style.opacity = "0.6";
    }
  }

  // ─── Standards Pulse ───────────────────────────────────────────────────────

  /**
   * Tier thresholds and helpers — shared between KPI, heatmap, and Level 3.
   */
  const SP_TIERS = {
    excellent:      { min: 80,  cls: 'tier-excellent',      bgCls: 'sp-bg-excellent',     label: 'Excellent' },
    'on-track':     { min: 60,  cls: 'tier-on-track',       bgCls: 'sp-bg-on-track',      label: 'On-Track' },
    'needs-support':{ min: 40,  cls: 'tier-needs-support',  bgCls: 'sp-bg-needs-support', label: 'Needs Support' },
    critical:       { min: 0,   cls: 'tier-critical',       bgCls: 'sp-bg-critical',      label: 'Critical' },
  };

  function spGetTier(pct) {
    if (pct >= 80) return 'excellent';
    if (pct >= 60) return 'on-track';
    if (pct >= 40) return 'needs-support';
    return 'critical';
  }

  /** SVG icons by tier — monochrome, uses currentColor for stroke/fill */
  const SP_ICONS = {
    excellent: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Excellent" role="img"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>',
    'on-track': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="On-Track" role="img"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    'needs-support': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Needs Support" role="img"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    critical: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Critical" role="img"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  };

  /** Cache: null = not loaded, [] = no data, Array = loaded rows */
  let spRollupCache = null;

  /**
   * Fetch all-student DESE rollups through the signed Teacher Center boundary.
   * School-year selection and teacher/student scoping are server-owned.
   */
  async function spFetchRollups() {
    if (spRollupCache !== null) return spRollupCache;

    try {
      const response = await fetch(
        '/.netlify/functions/teacher-dese-rollups',
        {
          method: 'GET',
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json' },
        }
      );

      if (!response.ok) {
        console.warn(
          '[tc-overview] teacher-dese-rollups HTTP error:',
          response.status
        );
        spRollupCache = [];
        return spRollupCache;
      }

      const payload = await response.json();

      spRollupCache =
        payload &&
        payload.ok &&
        Array.isArray(payload.rows)
          ? payload.rows
          : [];
    } catch (err) {
      console.warn(
        '[tc-overview] teacher-dese-rollups failed:',
        err
      );
      spRollupCache = [];
    }

    return spRollupCache;
  }

  /**
   * Compute the median of a numeric array.
   */
  function spMedian(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Render the Standards Pulse KPI card.
   * Loads data async — card starts hidden and appears when data arrives.
   */
  async function renderStandardsPulseKPI(students) {
    const card = $('kpiStandardsPulseCard');
    const valEl = $('kpiStandardsPulse');
    const subEl = $('kpiStandardsPulseSub');
    if (!card || !valEl || !subEl) return;

    let rows;
    try {
      rows = await spFetchRollups();
    } catch {
      return;
    }

    if (!rows || rows.length === 0) {
      // No DESE data yet — keep card hidden
      card.style.display = 'none';
      return;
    }

    // All per-standard percent_correct values (one per student×standard row)
    const pcts = rows.map(r => Number(r.percent_correct)).filter(v => !isNaN(v));
    const median = spMedian(pcts);
    if (median === null) {
      card.style.display = 'none';
      return;
    }

    // Count critical and needs-support (per unique student×standard pair)
    let critical = 0;
    let needsSupport = 0;
    for (const r of rows) {
      const pct = Number(r.percent_correct);
      const tier = spGetTier(pct);
      if (tier === 'critical') critical++;
      else if (tier === 'needs-support') needsSupport++;
    }

    const tier = spGetTier(Math.round(median));
    const tierInfo = SP_TIERS[tier];

    valEl.textContent = `${Math.round(median)}%`;
    valEl.className = 'tc-kpi-value ' + tierInfo.cls;

    const parts = [];
    if (critical > 0) parts.push(`${critical} critical`);
    if (needsSupport > 0) parts.push(`${needsSupport} needs-support`);
    subEl.textContent = parts.length ? parts.join(' · ') : 'All standards on track';

    card.style.display = '';

    // Click / keyboard handler to open modal
    function openModal() { spOpenModal(students); }
    card.addEventListener('click', openModal);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); }
    });

    console.log('[tc-overview] Standards Pulse KPI rendered — median:', Math.round(median), '%, rows:', rows.length);
  }

  /**
   * Build the standards × class heatmap data structure from rollup rows
   * and the class enrollment list.
   * Returns: { standards: string[], classes: string[], cells: Map<`std|cls`, {pct, tier}> }
   */
  async function spBuildHeatmapData(students) {
    const rows = await spFetchRollups();
    if (!rows || rows.length === 0) return null;

    // Get class enrollments from data adapter
    let enrollments = [];
    try {
      if (db.listClassEnrollments) {
        enrollments = await db.listClassEnrollments();
      }
    } catch {
      // If enrollments unavailable, fall back to students with class_id
    }

    // Build map: studentCode → Set<className>
    const studentClassMap = new Map();
    for (const enr of enrollments) {
      const code = enr.student_code;
      if (!code) continue;
      if (!studentClassMap.has(code)) studentClassMap.set(code, new Set());
      if (enr.class_name) studentClassMap.get(code).add(enr.class_name);
    }
    // Fallback: use students array (which may have class_id/class_name)
    if (studentClassMap.size === 0) {
      for (const s of students) {
        if (s.class_id || s.class_name) {
          const name = s.class_name || s.class_id;
          if (!studentClassMap.has(s.code)) studentClassMap.set(s.code, new Set());
          studentClassMap.get(s.code).add(name);
        }
      }
    }

    // Build per-(standard, class) accumulator
    // Map key: `${desCode}||${className}`  value: {sum, count}
    const accumulator = new Map();
    const standardSet = new Set();
    const classSet = new Set();

    for (const row of rows) {
      const code = row.student_code;
      const std = row.dese_code;
      const pct = Number(row.percent_correct);
      if (!std || isNaN(pct)) continue;
      standardSet.add(std);

      const classes = studentClassMap.get(code);
      if (!classes || classes.size === 0) continue;
      for (const cls of classes) {
        classSet.add(cls);
        const key = JSON.stringify([std, cls]);
        if (!accumulator.has(key)) accumulator.set(key, { sum: 0, count: 0 });
        const acc = accumulator.get(key);
        acc.sum += pct;
        acc.count++;
      }
    }

    if (classSet.size === 0) return null;

    // Sort standards alphabetically; classes by name
    const standards = [...standardSet].sort();
    const classes = [...classSet].sort();

    // Build cell map: key → {pct, tier}
    const cells = new Map();
    for (const [key, acc] of accumulator) {
      const avg = acc.sum / acc.count;
      cells.set(key, { pct: Math.round(avg * 10) / 10, tier: spGetTier(avg) });
    }

    return { standards, classes, cells, rows, _sClassMap: studentClassMap };
  }

  /** Current modal view: 'heatmap' | 'breakdown' */
  let spCurrentView = 'heatmap';
  let spHeatmapData = null;

  /**
   * Open the Standards Pulse overlay and render the Level 2 heatmap.
   */
  async function spOpenModal(students) {
    const overlay = $('spOverlay');
    if (!overlay) return;

    overlay.classList.add('sp-open');
    spCurrentView = 'heatmap';
    const backBtn = $('spBackBtn');
    if (backBtn) backBtn.classList.remove('sp-visible');

    const titleEl = $('spTitle');
    if (titleEl) titleEl.textContent = 'Standards Pulse — Class Heatmap';

    const contentEl = $('spContent');
    if (contentEl) contentEl.innerHTML = '<div class="sp-loading">Loading standards data…</div>';

    // Trap focus in overlay
    overlay.focus && overlay.focus();

    try {
      if (!spHeatmapData) {
        spHeatmapData = await spBuildHeatmapData(students);
      }
      spRenderHeatmap(spHeatmapData, students);
    } catch (err) {
      console.error('[tc-overview] spOpenModal error:', err);
      if (contentEl) contentEl.innerHTML = '<div class="sp-no-data">Unable to load standards data. Try refreshing.</div>';
    }
  }

  /**
   * Render the Level 2 heatmap (standards × class grid).
   */
  function spRenderHeatmap(data, students) {
    const contentEl = $('spContent');
    if (!contentEl) return;

    if (!data) {
      contentEl.innerHTML = '<div class="sp-no-data">No DESE standards data available yet. Data will appear once graded assignments with DESE-tagged questions have been submitted.</div>';
      return;
    }

    const { standards, classes, cells } = data;

    let html = '<div class="sp-heatmap-wrap"><table class="sp-heatmap-table" role="grid">';
    // Header row
    html += '<thead><tr>';
    html += '<th class="sp-std-header">Standard</th>';
    for (const cls of classes) {
      html += `<th title="${cls}">${cls}</th>`;
    }
    html += '</tr></thead>';

    // Data rows
    html += '<tbody>';
    for (const std of standards) {
      html += '<tr>';
      html += `<td class="sp-std-cell">${std}</td>`;
      for (const cls of classes) {
        const key = JSON.stringify([std, cls]);
        const cell = cells.get(key);
        if (!cell) {
          html += '<td><span class="sp-cell-empty">—</span></td>';
        } else {
          const tier = cell.tier;
          const tierInfo = SP_TIERS[tier];
          const icon = SP_ICONS[tier];
          html += `<td style="background:transparent;">
            <span class="sp-cell ${tierInfo.cls} ${tierInfo.bgCls}"
                  role="button"
                  tabindex="0"
                  title="${tierInfo.label}: ${cell.pct}% — ${std} in ${cls}"
                  data-std="${std}"
                  data-cls="${cls}"
                  data-pct="${cell.pct}">
              ${icon}${cell.pct}%
            </span>
          </td>`;
        }
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';

    contentEl.innerHTML = html;

    // Wire up cell clicks
    contentEl.querySelectorAll('.sp-cell[data-std]').forEach(el => {
      const handleOpen = () => {
        const std = el.dataset.std;
        const cls = el.dataset.cls;
        spOpenLevel3(std, cls, data, students);
      };
      el.addEventListener('click', handleOpen);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(); }
      });
    });
  }

  /**
   * Render the Level 3 student breakdown for a specific (standard, class) cell.
   */
  function spOpenLevel3(std, cls, data, students) {
    spCurrentView = 'breakdown';

    const titleEl = $('spTitle');
    if (titleEl) titleEl.textContent = `${std} — ${cls}`;

    const backBtn = $('spBackBtn');
    if (backBtn) backBtn.classList.add('sp-visible');

    const contentEl = $('spContent');
    if (!contentEl) return;

    const studentMap = new Map(students.map(s => [s.code, s]));

    // All rollup rows for this standard
    const stdRows = (data.rows || []).filter(r => r.dese_code === std);

    // Find students in this class
    const classStudentCodes = new Set();
    if (data._sClassMap) {
      for (const [code, classSet] of data._sClassMap) {
        if (classSet.has(cls)) classStudentCodes.add(code);
      }
    }

    // Build per-student rows for this standard
    const studentRows = stdRows
      .filter(r => classStudentCodes.size === 0 || classStudentCodes.has(r.student_code))
      .map(r => {
        const student = studentMap.get(r.student_code) || { code: r.student_code, name: r.student_code };
        const pct = Number(r.percent_correct);
        const tier = spGetTier(pct);
        return {
          studentCode: r.student_code,
          studentName: student.name || r.student_code,
          pct,
          tier,
          itemCount: Number(r.item_count) || 0,
        };
      })
      .sort((a, b) => a.pct - b.pct); // worst first

    if (studentRows.length === 0) {
      contentEl.innerHTML = '<div class="sp-no-data">No student data for this standard in this class.</div>';
      return;
    }

    let html = `<table class="sp-breakdown-table" role="grid">
      <thead>
        <tr>
          <th>Student</th>
          <th>Score</th>
          <th>Items</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>`;

    for (const row of studentRows) {
      const tier = row.tier;
      const tierInfo = SP_TIERS[tier];
      const icon = SP_ICONS[tier];
      html += `
        <tr>
          <td>
            <div style="font-weight:600;font-size:13px;">${row.studentName}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.45);">${row.studentCode}</div>
          </td>
          <td class="${tierInfo.cls}" style="font-weight:700;font-size:15px;">${row.pct}%</td>
          <td style="color:rgba(255,255,255,.6);">${row.itemCount}</td>
          <td>
            <span style="display:inline-flex;align-items:center;gap:5px;" class="${tierInfo.cls}">
              ${icon} ${tierInfo.label}
            </span>
          </td>
          <td>
            <a href="/teacher/students/?student=${row.studentCode}&tab=skills"
               style="color:rgba(56,255,166,.8);font-size:12px;text-decoration:none;"
               title="View Skills Summary for ${row.studentName}">
              View Skills →
            </a>
          </td>
        </tr>`;
    }
    html += '</tbody></table>';

    contentEl.innerHTML = html;
  }

  /**
   * Wire up the Standards Pulse overlay close / back buttons.
   * Called once during initialization.
   */
  function spInitOverlay(students) {
    const overlay = $('spOverlay');
    const closeBtn = $('spCloseBtn');
    const backBtn = $('spBackBtn');
    if (!overlay) return;

    function closeOverlay() {
      overlay.classList.remove('sp-open');
      spCurrentView = 'heatmap';
    }

    closeBtn && closeBtn.addEventListener('click', closeOverlay);

    backBtn && backBtn.addEventListener('click', () => {
      spCurrentView = 'heatmap';
      backBtn.classList.remove('sp-visible');
      const titleEl = $('spTitle');
      if (titleEl) titleEl.textContent = 'Standards Pulse — Class Heatmap';
      spRenderHeatmap(spHeatmapData, students);
    });

    // Close on backdrop click (outside panel)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('sp-open')) closeOverlay();
    });
  }

  // ─── Initialize ────────────────────────────────────────────────────────────

  try {
    const data = await loadAllData();

    // Update sync status
    syncStatus = isRemote() ? "synced" : "local";
    updateSyncStatus();

    // Render all sections with shared data (no additional fetches)
    renderKPIs(data);
    renderLastEntry(data);
    renderCalendarSnapshot(data);
    renderOverdueItems(data);
    renderAtRiskStudents(data);
    renderChecklist(data)
      .then(() => armChecklistMidnightWatch(data))
      .catch((err) => {
        console.warn("[tc-overview] Initial checklist render failed; arming midnight watch anyway:", err);
        armChecklistMidnightWatch(data);
      });
    renderActivityFeed(data);

    // Standards Pulse — async, non-blocking; wires up modal overlay too
    spInitOverlay(data.students);
    renderStandardsPulseKPI(data.students).catch(err => {
      console.warn('[tc-overview] Standards Pulse KPI failed:', err);
    });

    console.log("[tc-overview] All sections rendered");
  } catch (error) {
    console.error("[tc-overview] Fatal error loading dashboard data:", error);
    syncStatus = "error";
    updateSyncStatus();

    // Show error state in all content sections
    for (const id of [
      "ovOverdueContent",
      "ovAtRiskContent",
      "ovChecklistContent",
      "ovFeedContent",
      "ovUpcomingEvents",
    ]) {
      const el = $(id);
      if (el) el.innerHTML = '<div class="ov-card-error">Unable to load section. Try refreshing.</div>';
    }
  }
})();
