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
  const { parseGoalValue, isGoalActive } = await import("/web/goal-utils.js");

  // DOM helper
  const $ = (id) => document.getElementById(id);

  // SVG check-circle icon (14px inline)
  const SVG_CHECK =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

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
    const [students, submissions, goals, instances, assignments, progress, events] =
      await Promise.all([
        db.listStudents(),
        db.listSubmissions ? db.listSubmissions({}) : Promise.resolve([]),
        db.listGoalsAll(),
        db.listAssignmentInstances(),
        db.listAssignments(),
        db.listGoalProgress ? db.listGoalProgress({}) : Promise.resolve([]),
        db.listEvents ? db.listEvents() : Promise.resolve([]),
      ]);
    return { students, submissions, goals, instances, assignments, progress, events };
  }

  /**
   * Load and display KPIs (uses pre-fetched data bundle)
   */
  function renderKPIs({ students, submissions, goals, instances, progress }) {
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
        const ts = inst.assigned_at || inst.due_at;
        if (!ts) return false;
        const d = new Date(ts);
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

    console.log("[tc-overview] KPIs rendered:", {
      activeStudents,
      pendingReview,
      assignmentsThisQuarter,
      avgProgress,
      currentQuarter,
    });
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
        const assignment = assignmentMap.get(inst.assignment_id);
        events.push({
          type: "assignment",
          date: new Date(inst.due_at),
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
   * Render Overdue Items Panel (uses pre-fetched data bundle)
   */
  function renderOverdueItems({ instances, submissions, students, goals, progress, assignments }) {
    const contentEl = $("ovOverdueContent");
    if (!contentEl) return;

    const assignmentMap = new Map(assignments.map((a) => [a.id, a]));
    const studentMap = new Map(students.map((s) => [s.code, s]));

    // Unreviewed submissions
    const unreviewed = submissions.filter((s) => s.review_status === "pending");

    // Missing progress data for current quarter
    const currentQuarter = getCurrentQuarter();
    const quarterRange = getQuarterDateRange(currentQuarter);
    const missingProgress = [];

    if (quarterRange) {
      const activeStudents = students.filter((s) => s.active !== false);
      for (const student of activeStudents) {
        const studentGoals = goals.filter(
          (g) => g.student_code === student.code && isGoalActive(g)
        );
        for (const goal of studentGoals) {
          const hasProgressThisQuarter = progress.some(
            (p) =>
              p.student_code === student.code &&
              p.goal_code === goal.code &&
              new Date(p.date) >= quarterRange.start &&
              new Date(p.date) <= quarterRange.end
          );
          if (!hasProgressThisQuarter) {
            missingProgress.push({
              student: student.name,
              studentCode: student.code,
              goalCode: goal.code,
              goalArea: goal.goal_area || '',
            });
          }
        }
      }
    }

    const hasOverdue = unreviewed.length > 0 || missingProgress.length > 0;

    if (!hasOverdue) {
      contentEl.innerHTML = `<div class="ov-card-empty">${SVG_CHECK} All caught up!</div>`;
      $("ovOverdueCard").classList.remove("alert-red");
      $("ovOverdueCard").classList.add("alert-green");
      return;
    }

    $("ovOverdueCard").classList.add("alert-red");

    // Summary header
    const summaryParts = [];
    if (unreviewed.length > 0) summaryParts.push(`⚠️ ${unreviewed.length} unreviewed`);
    if (missingProgress.length > 0) summaryParts.push(`${missingProgress.length} goals missing progress`);

    let html = `<div class="ov-summary">${summaryParts.join(' · ')}</div>`;
    html += '<div class="ov-list-body">';

    if (unreviewed.length > 0) {
      html += `<div class="ov-section-header"><span>Unreviewed Submissions</span><span class="ov-count-badge ov-badge-red">${unreviewed.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      for (const sub of unreviewed) {
        const student = studentMap.get(sub.student_code);
        const instance = instances.find((i) => i.id === sub.assignment_instance_id);
        const assignment = instance ? assignmentMap.get(instance.assignment_id) : null;
        const submittedDate = new Date(sub.submitted_at);
        const studentName = student?.name || sub.student_code;
        const studentCode = student?.code || sub.student_code;
        html += `
        <div class="ov-row-card ov-row-card--red">
          <span class="ov-status-dot ov-dot-red"></span>
          <div class="ov-row-body">
            <div class="ov-row-primary">
              <span class="ov-student-name">${studentName}</span>
              <span class="ov-student-code">${studentCode}</span>
            </div>
            <div class="ov-row-secondary">
              <span class="ov-badge">${assignment?.title || 'Assignment'}</span>
              <span class="ov-row-meta">${getRelativeTime(submittedDate)}</span>
            </div>
          </div>
        </div>`;
      }
      html += '</div>';
    }

    if (missingProgress.length > 0) {
      html += `<div class="ov-section-header" style="${unreviewed.length > 0 ? 'margin-top: 12px;' : ''}"><span>Goals Without Progress This Quarter</span><span class="ov-count-badge ov-badge-amber">${missingProgress.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      for (const item of missingProgress) {
        html += `
        <div class="ov-row-card ov-row-card--amber">
          <span class="ov-status-dot ov-dot-amber"></span>
          <div class="ov-row-body">
            <div class="ov-row-primary">
              <span class="ov-student-name">${item.student}</span>
              <span class="ov-student-code">${item.studentCode}</span>
            </div>
            <div class="ov-row-secondary">
              <span class="ov-badge">${item.goalCode}</span>
              ${item.goalArea ? `<span class="ov-badge ov-badge-area">${item.goalArea}</span>` : ''}
            </div>
          </div>
        </div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    contentEl.innerHTML = html;
  }

  /**
   * Render At-Risk Students Panel (uses pre-fetched data bundle)
   */
  function renderAtRiskStudents({ students, goals, progress }) {
    const contentEl = $("ovAtRiskContent");
    if (!contentEl) return;

    // Thresholds for at-risk classification and near-mastery callout
    const STALLED_THRESHOLD = 5;       // ≤5% above baseline counts as "stalled"
    const NEAR_MASTERY_THRESHOLD = 5;  // within 5% of mastery counts as "near mastery"
    const BAR_PADDING = 1.1;           // 10% padding above max value for progress bar scale

    const regressing = [];
    const stalled = [];
    const nearMastery = [];

    for (const student of students.filter((s) => s.active !== false)) {
      const studentGoals = goals.filter(
        (g) => g.student_code === student.code && isGoalActive(g)
      );
      for (const goal of studentGoals) {
        const goalProgress = progress.filter(
          (p) => p.student_code === student.code && p.goal_code === goal.code
        );
        if (goalProgress.length === 0) continue;

        // Sort by date to get most recent
        goalProgress.sort((a, b) => new Date(b.date) - new Date(a.date));
        const recent = goalProgress[0];

        // Observation goals need category-aware at-risk logic
        if (goal.measurement_type === 'Observation') {
          const obsConfig = goal.observation_config || {};
          const category = obsConfig.category || '';

          if (category === 'session_outcome') {
            // At-risk if met count in recent window is below target
            const window5 = goalProgress.slice(0, 5);
            const metCount = window5.filter(e => {
              const notes = e.notes || '';
              return notes.includes('[obs:session_outcome:met]');
            }).length;
            const targetSessions = parseGoalValue(goal.mastery || goal.target) ?? 3;
            if (metCount < targetSessions * 0.5) {
              const item = {
                studentCode: student.code,
                studentName: student.name,
                goalCode: goal.code,
                goalArea: goal.goal_area || '',
                current: metCount,
                baseline: 0,
                mastery: null,
                baselineRaw: goal.baseline || '0',
                masteryRaw: goal.mastery || goal.target || null,
                currentRaw: `${metCount}/${window5.length} sessions met`,
              };
              stalled.push(item);
            }
            continue;
          }

          if (category === 'prompt_count') {
            // At-risk if average prompt count exceeds target max
            const recentValues = goalProgress.slice(0, 5).map(e => parseFloat(e.value)).filter(v => !isNaN(v));
            if (recentValues.length === 0) continue;
            const avgPrompts = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
            const targetMax = obsConfig.target_max_prompts != null
              ? obsConfig.target_max_prompts
              : (parseGoalValue(goal.mastery || goal.target) ?? 2);
            if (avgPrompts > targetMax * 1.5) {
              const item = {
                studentCode: student.code,
                studentName: student.name,
                goalCode: goal.code,
                goalArea: goal.goal_area || '',
                current: Math.round(avgPrompts * 10) / 10,
                baseline: 0,
                mastery: null,
                baselineRaw: goal.baseline || '0',
                masteryRaw: goal.mastery || goal.target || null,
                currentRaw: `Avg ${avgPrompts.toFixed(1)} prompts (target: ${targetMax})`,
              };
              stalled.push(item);
            }
            continue;
          }

          // For tally and behavior_checklist: their values are stored as 0-100 percentages
          // — fall through to standard percentage comparison below.
        }

        const baselineNum = parseGoalValue(goal.baseline);
        const masteryNum = parseGoalValue(goal.mastery) ?? parseGoalValue(goal.target);
        const currentNum = recent.value != null ? parseFloat(recent.value) : null;

        if (currentNum == null || baselineNum == null) continue;

        const item = {
          studentCode: student.code,
          studentName: student.name,
          goalCode: goal.code,
          goalArea: goal.goal_area || '',
          current: Math.round(currentNum * 10) / 10,
          baseline: Math.round(baselineNum * 10) / 10,
          mastery: masteryNum != null ? Math.round(masteryNum * 10) / 10 : null,
          baselineRaw: goal.baseline,
          masteryRaw: goal.mastery || goal.target || null,
          currentRaw: recent.value,
        };

        // Near mastery: within threshold of mastery and not yet there
        if (masteryNum != null && currentNum >= masteryNum - NEAR_MASTERY_THRESHOLD && currentNum < masteryNum) {
          nearMastery.push(item);
        }

        // Regressing: current < baseline (going backward)
        if (currentNum < baselineNum) {
          regressing.push(item);
        }
        // Stalled: at or just above baseline (no meaningful growth)
        else if (currentNum <= baselineNum + STALLED_THRESHOLD) {
          stalled.push(item);
        }
      }
    }

    const atRiskCount = regressing.length + stalled.length;

    if (atRiskCount === 0 && nearMastery.length === 0) {
      contentEl.innerHTML = `<div class="ov-card-empty">${SVG_CHECK} All students progressing above baseline</div>`;
      $("ovAtRiskCard").classList.remove("alert-amber");
      $("ovAtRiskCard").classList.add("alert-green");
      return;
    }

    if (atRiskCount > 0) {
      $("ovAtRiskCard").classList.add("alert-amber");
    }

    // Summary header
    const summaryParts = [];
    if (regressing.length > 0) summaryParts.push(`🔴 ${regressing.length} regressing`);
    if (stalled.length > 0) summaryParts.push(`🟡 ${stalled.length} stalled`);
    if (nearMastery.length > 0) summaryParts.push(`🎉 ${nearMastery.length} near mastery`);

    let html = `<div class="ov-summary">${summaryParts.join(' · ')}</div>`;
    html += '<div class="ov-list-body">';

    function buildProgressBar(item, fillClass) {
      if (item.mastery == null) return '';
      const maxVal = Math.max(item.mastery, item.current, item.baseline) * BAR_PADDING || 100;
      const currentPct = Math.min(100, (item.current / maxVal) * 100).toFixed(1);
      const baselinePct = Math.min(100, (item.baseline / maxVal) * 100).toFixed(1);
      const masteryPct = Math.min(100, (item.mastery / maxVal) * 100).toFixed(1);
      return `
        <div class="ov-progress-track" title="Current: ${item.currentRaw} | Baseline: ${item.baselineRaw} | Mastery: ${item.masteryRaw}">
          <div class="ov-progress-fill ${fillClass}" style="width:${currentPct}%"></div>
          <div class="ov-progress-marker ov-marker-baseline" style="left:${baselinePct}%" title="Baseline: ${item.baselineRaw}"></div>
          <div class="ov-progress-marker ov-marker-mastery" style="left:${masteryPct}%" title="Mastery: ${item.masteryRaw}"></div>
        </div>`;
    }

    function buildAtRiskRow(item, severity) {
      const cardClass = severity === 'red' ? 'ov-row-card--red' : severity === 'green' ? 'ov-row-card--green' : 'ov-row-card--amber';
      const dotClass = severity === 'red' ? 'ov-dot-red' : severity === 'green' ? 'ov-dot-green' : 'ov-dot-amber';
      const fillClass = severity === 'red' ? 'ov-fill-red' : severity === 'green' ? 'ov-fill-green' : 'ov-fill-amber';
      const metaText = item.masteryRaw
        ? `${item.currentRaw} current · baseline: ${item.baselineRaw} · mastery: ${item.masteryRaw}`
        : `${item.currentRaw} current · baseline: ${item.baselineRaw}`;
      return `
      <div class="ov-row-card ${cardClass}">
        <span class="ov-status-dot ${dotClass}"></span>
        <div class="ov-row-body">
          <div class="ov-row-primary">
            <span class="ov-student-name">${item.studentName}</span>
            <span class="ov-student-code">${item.studentCode}</span>
          </div>
          <div class="ov-row-secondary">
            <span class="ov-badge">${item.goalCode}</span>
            ${item.goalArea ? `<span class="ov-badge ov-badge-area">${item.goalArea}</span>` : ''}
          </div>
          ${buildProgressBar(item, fillClass)}
          <div class="ov-row-meta">${metaText}</div>
        </div>
      </div>`;
    }

    if (regressing.length > 0) {
      html += `<div class="ov-section-header"><span>Regressing</span><span class="ov-count-badge ov-badge-red">${regressing.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      for (const item of regressing) {
        html += buildAtRiskRow(item, 'red');
      }
      html += '</div>';
    }

    if (stalled.length > 0) {
      html += `<div class="ov-section-header"${regressing.length > 0 ? ' style="margin-top: 12px;"' : ''}><span>Stalled</span><span class="ov-count-badge ov-badge-amber">${stalled.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      for (const item of stalled) {
        html += buildAtRiskRow(item, 'amber');
      }
      html += '</div>';
    }

    if (nearMastery.length > 0) {
      html += `<div class="ov-section-header ov-section-header--success"${atRiskCount > 0 ? ' style="margin-top: 12px;"' : ''}><span>🎉 Near Mastery</span><span class="ov-count-badge ov-badge-green">${nearMastery.length}</span></div>`;
      html += '<div class="ov-scroll-body">';
      for (const item of nearMastery) {
        html += buildAtRiskRow(item, 'green');
      }
      html += '</div>';
    }

    html += '</div>';
    contentEl.innerHTML = html;
  }

  /**
   * Render Today's Checklist (uses pre-fetched data bundle)
   */
  function renderChecklist({ submissions, instances, goals, progress, students }) {
    const contentEl = $("ovChecklistContent");
    if (!contentEl) return;

    const today = formatDateYMD(new Date());
    const checklistKey = `rc_overview_checklist_${today}`;
    const savedChecklist = JSON.parse(localStorage.getItem(checklistKey) || "{}");

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

    // Missing progress data
    const currentQuarter = getCurrentQuarter();
    const quarterRange = getQuarterDateRange(currentQuarter);
    let missingProgressCount = 0;

    if (quarterRange) {
      const activeStudents = students.filter((s) => s.active !== false);
      for (const student of activeStudents) {
        const studentGoals = goals.filter(
          (g) => g.student_code === student.code && isGoalActive(g)
        );
        for (const goal of studentGoals) {
          const hasProgress = progress.some(
            (p) =>
              p.student_code === student.code &&
              p.goal_code === goal.code &&
              new Date(p.date) >= quarterRange.start &&
              new Date(p.date) <= quarterRange.end
          );
          if (!hasProgress) missingProgressCount++;
        }
      }
    }

    if (missingProgressCount > 0) {
      checklist.push({
        id: "collect-progress",
        text: `Collect progress data for ${missingProgressCount} goal${missingProgressCount !== 1 ? "s" : ""} (no data this quarter)`,
        link: "/teacher/data/",
        checked: savedChecklist["collect-progress"] || false,
      });
    }

    // Assignments due this week
    const nowDate = new Date();
    const weekFromNow = new Date(nowDate);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const dueThisWeek = instances.filter((i) => {
      if (!i.due_at) return false;
      const dueDate = new Date(i.due_at);
      return dueDate >= nowDate && dueDate <= weekFromNow;
    });

    if (dueThisWeek.length > 0) {
      checklist.push({
        id: "assignments-due",
        text: `${dueThisWeek.length} assignment${dueThisWeek.length !== 1 ? "s" : ""} due this week`,
        link: "/teacher/calendar/",
        checked: savedChecklist["assignments-due"] || false,
      });
    }

    // Upcoming IEP meetings (within 30 days)
    const thirtyDaysFromNow = new Date(nowDate);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    let upcomingIEPs = 0;
    for (const student of students) {
      if (student.iep_due) {
        const iepDate = new Date(student.iep_due);
        if (iepDate >= nowDate && iepDate <= thirtyDaysFromNow) upcomingIEPs++;
      }
    }

    if (upcomingIEPs > 0) {
      checklist.push({
        id: "iep-meetings",
        text: `${upcomingIEPs} IEP meeting${upcomingIEPs !== 1 ? "s" : ""} coming up within 30 days`,
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
    contentEl.querySelectorAll(".checklist-checkbox").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const id = e.target.dataset.id;
        savedChecklist[id] = e.target.checked;
        localStorage.setItem(checklistKey, JSON.stringify(savedChecklist));
      });
    });
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
    const recentEvents = events.slice(0, 10);

    if (recentEvents.length === 0) {
      contentEl.innerHTML = `<div class="ov-card-empty">${SVG_CHECK} No recent activity</div>`;
      return;
    }

    let html = "<div>";
    for (const event of recentEvents) {
      html += `
        <div class="activity-item">
          <div class="activity-icon">${event.icon}</div>
          <div class="activity-text">${event.text}</div>
          <div class="activity-time">${getRelativeTime(event.date)}</div>
        </div>
      `;
    }
    html += "</div>";

    contentEl.innerHTML = html;
  }

  // ─── Initialize ────────────────────────────────────────────────────────────

  try {
    const data = await loadAllData();

    // Update sync status
    syncStatus = isRemote() ? "synced" : "local";
    updateSyncStatus();

    // Render all sections with shared data (no additional fetches)
    renderKPIs(data);
    renderCalendarSnapshot(data);
    renderOverdueItems(data);
    renderAtRiskStudents(data);
    renderChecklist(data);
    renderActivityFeed(data);

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
