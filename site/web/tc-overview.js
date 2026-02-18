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

  // DOM helper
  const $ = (id) => document.getElementById(id);

  // State
  let syncStatus = "local";

  /**
   * Get current quarter based on today's date using default hardcoded ranges
   * Note: Custom quarter dates can be configured in Settings page (rc_quarter_dates)
   * but are not yet used for auto-detection here - this uses hardcoded defaults only
   */
  function getCurrentQuarter() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    // Default: Q1: August 16 - October 17
    if ((month === 8 && day >= 16) || month === 9 || (month === 10 && day <= 17)) return "Q1";

    // Q2: October 18 - December 19
    if ((month === 10 && day >= 18) || month === 11 || (month === 12 && day <= 19)) return "Q2";

    // Q3: December 20 - March 6 (spans year boundary)
    if ((month === 12 && day >= 20) || month === 1 || month === 2 || (month === 3 && day <= 6))
      return "Q3";

    // Q4: March 7 - May 20
    if ((month === 3 && day >= 7) || month === 4 || (month === 5 && day <= 20)) return "Q4";

    // Summer fallback
    return "Q4";
  }

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
      iconEl.textContent = "🟢";
      textEl.textContent = "Synced with Supabase";
    } else if (syncStatus === "error") {
      statusEl.classList.add("error");
      iconEl.textContent = "🔴";
      textEl.textContent = "Sync error (using local data)";
    } else {
      statusEl.classList.add("local");
      iconEl.textContent = "🟡";
      textEl.textContent = "Local mode";
    }
  }

  /**
   * Load and display KPIs
   */
  async function loadKPIs() {
    try {
      // Fetch data
      const students = await db.listStudents();
      const submissions = await db.listSubmissions();
      const goals = await db.listGoalsAll();

      // Calculate KPIs
      const totalStudents = students.filter((s) => s.active !== false).length;
      const pendingReview = submissions.filter((s) => s.review_status === "pending").length;
      const currentQuarter = getCurrentQuarter();
      const activeGoals = goals.filter((g) => g.status === "active").length;

      // Update DOM
      const kpiStudents = $("kpiStudents");
      const kpiReview = $("kpiReview");
      const kpiQuarter = $("kpiQuarter");
      const kpiGoals = $("kpiGoals");

      if (kpiStudents) kpiStudents.textContent = totalStudents;
      if (kpiReview) kpiReview.textContent = pendingReview;
      if (kpiQuarter) kpiQuarter.textContent = currentQuarter;
      if (kpiGoals) kpiGoals.textContent = activeGoals;

      // Update sync status
      syncStatus = isRemote() ? "synced" : "local";
      updateSyncStatus();

      console.log("[tc-overview] KPIs loaded:", {
        totalStudents,
        pendingReview,
        currentQuarter,
        activeGoals,
      });
    } catch (error) {
      console.error("[tc-overview] Error loading KPIs:", error);
      syncStatus = "error";
      updateSyncStatus();
    }
  }

  /**
   * Render mini calendar snapshot
   */
  async function renderCalendarSnapshot() {
    try {
      const miniCalEl = $("ovMiniCalendar");
      const upcomingEl = $("ovUpcomingEvents");
      
      if (!miniCalEl || !upcomingEl) return;

      // Load events (similar to calendar page)
      const DRAFT_KEY = "rc_tc_work_drafts_v1";
      const events = [];
      
      // Load assignment instances
      const instances = await db.listAssignmentInstances();
      const assignments = await db.listAssignments();
      const assignmentMap = new Map(assignments.map(a => [a.id, a]));
      
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

      // Load IEP/eval dates
      const students = await db.listStudents();
      for (const student of students) {
        if (student.iep_due) {
          events.push({
            type: "iep",
            date: new Date(student.iep_due),
            title: `IEP: ${student.name}`,
          });
        }
        if (student.eval_due) {
          events.push({
            type: "eval",
            date: new Date(student.eval_due),
            title: `Eval: ${student.name}`,
          });
        }
      }

      // Load drafts
      const draftsJson = localStorage.getItem(DRAFT_KEY);
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

      // Render mini calendar
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      const firstDay = new Date(currentYear, currentMonth, 1);
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      
      // Get calendar grid dates
      const startDate = new Date(firstDay);
      startDate.setDate(startDate.getDate() - firstDay.getDay());
      
      const endDate = new Date(lastDay);
      endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));
      
      const dates = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }

      // Build mini calendar HTML
      let html = '<div class="mini-cal-grid">';
      
      // Day headers
      const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
      for (const day of dayNames) {
        html += `<div class="mini-cal-header">${day}</div>`;
      }

      // Day cells
      for (const date of dates) {
        const isOtherMonth = date.getMonth() !== currentMonth;
        const isToday = formatDateYMD(date) === formatDateYMD(today);
        const dateStr = formatDateYMD(date);
        const hasEvents = events.some(e => formatDateYMD(e.date) === dateStr);

        let cellClass = "mini-cal-day";
        if (isOtherMonth) cellClass += " other-month";
        if (isToday) cellClass += " today";
        if (hasEvents) cellClass += " has-events";

        html += `<div class="${cellClass}">${date.getDate()}</div>`;
      }

      html += '</div>';
      miniCalEl.innerHTML = html;

      // Count upcoming events (next 7 days)
      const todayStr = formatDateYMD(today);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekStr = formatDateYMD(nextWeek);
      
      const upcomingEvents = events.filter(e => {
        const eventStr = formatDateYMD(e.date);
        return eventStr >= todayStr && eventStr <= nextWeekStr;
      });

      upcomingEl.innerHTML = `${upcomingEvents.length} event${upcomingEvents.length !== 1 ? 's' : ''} in the next 7 days`;

      console.log("[tc-overview] Calendar snapshot rendered:", upcomingEvents.length, "upcoming events");
    } catch (error) {
      console.error("[tc-overview] Error rendering calendar snapshot:", error);
    }
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
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  }

  /**
   * Get quarter date range for the current quarter
   */
  function getQuarterDateRange(quarter) {
    const quarterDates = JSON.parse(localStorage.getItem('rc_quarter_dates') || 'null') || {
      Q1: { start: "Aug 16", end: "Oct 17" },
      Q2: { start: "Oct 18", end: "Dec 19" },
      Q3: { start: "Dec 20", end: "Mar 6" },
      Q4: { start: "Mar 7", end: "May 20" },
    };

    const range = quarterDates[quarter];
    if (!range) return null;

    const now = new Date();
    const year = now.getFullYear();
    
    // Parse dates and handle year boundaries
    const parseQuarterDate = (dateStr, isEnd = false) => {
      const [monthStr, dayStr] = dateStr.split(' ');
      const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
      const month = monthMap[monthStr];
      const day = parseInt(dayStr, 10);
      
      // Handle year boundary: if end month is before start month, it crosses year boundary
      const startMonth = monthMap[range.start.split(' ')[0]];
      const endMonth = monthMap[range.end.split(' ')[0]];
      
      let adjustedYear = year;
      if (endMonth < startMonth && month <= endMonth) {
        // Quarter crosses year boundary and this date is in the next year
        adjustedYear = year + 1;
      }
      
      return new Date(adjustedYear, month, day);
    };

    return {
      start: parseQuarterDate(range.start, false),
      end: parseQuarterDate(range.end, true)
    };
  }

  /**
   * Render Overdue Items Panel
   */
  async function renderOverdueItems() {
    try {
      const contentEl = $("ovOverdueContent");
      if (!contentEl) return;

      const [instances, submissions, students, goals, progress] = await Promise.all([
        db.listAssignmentInstances(),
        db.listSubmissions ? db.listSubmissions({}) : [],
        db.listStudents(),
        db.listGoalsAll(),
        db.listGoalProgress ? db.listGoalProgress({}) : []
      ]);

      const assignments = await db.listAssignments();
      const assignmentMap = new Map(assignments.map(a => [a.id, a]));
      const studentMap = new Map(students.map(s => [s.code, s]));

      // Find unreviewed submissions
      const unreviewed = submissions.filter(s => s.review_status === 'pending');
      
      // Find missing progress data for current quarter
      const currentQuarter = getCurrentQuarter();
      const quarterRange = getQuarterDateRange(currentQuarter);
      const missingProgress = [];
      
      if (quarterRange) {
        const activeStudents = students.filter(s => s.active !== false);
        
        for (const student of activeStudents) {
          const studentGoals = goals.filter(g => g.student_code === student.code && g.status === 'active');
          
          for (const goal of studentGoals) {
            const hasProgressThisQuarter = progress.some(p => 
              p.student_code === student.code &&
              p.goal_code === goal.code &&
              new Date(p.date) >= quarterRange.start &&
              new Date(p.date) <= quarterRange.end
            );
            
            if (!hasProgressThisQuarter) {
              missingProgress.push({
                student: student.name,
                studentCode: student.code,
                goalCode: goal.code
              });
            }
          }
        }
      }

      const hasOverdue = unreviewed.length > 0 || missingProgress.length > 0;

      if (!hasOverdue) {
        contentEl.innerHTML = '<div style="color: rgba(34,197,94,.9); font-size: 14px;">✅ All caught up!</div>';
        $("ovOverdueCard").classList.remove("alert-red");
        $("ovOverdueCard").classList.add("alert-green");
        return;
      }

      $("ovOverdueCard").classList.add("alert-red");
      
      let html = '<div style="font-size: 13px; line-height: 1.6;">';
      
      if (unreviewed.length > 0) {
        html += `<div style="margin-bottom: 12px;"><strong>${unreviewed.length} unreviewed submission${unreviewed.length !== 1 ? 's' : ''}:</strong></div>`;
        html += '<div style="max-height: 150px; overflow-y: auto;">';
        for (const sub of unreviewed.slice(0, 10)) {
          const student = studentMap.get(sub.student_code);
          const instance = instances.find(i => i.id === sub.assignment_instance_id);
          const assignment = instance ? assignmentMap.get(instance.assignment_id) : null;
          const submittedDate = new Date(sub.submitted_at);
          html += `<div style="padding: 4px 0; opacity: 0.9;">• ${student?.name || sub.student_code} — ${assignment?.title || 'Assignment'} (${getRelativeTime(submittedDate)})</div>`;
        }
        html += '</div>';
      }

      if (missingProgress.length > 0) {
        html += `<div style="margin-top: 12px; margin-bottom: 8px;"><strong>${missingProgress.length} goal${missingProgress.length !== 1 ? 's' : ''} without progress data this quarter:</strong></div>`;
        html += '<div style="max-height: 120px; overflow-y: auto;">';
        for (const item of missingProgress.slice(0, 10)) {
          html += `<div style="padding: 4px 0; opacity: 0.9;">• ${item.student} — Goal ${item.goalCode}</div>`;
        }
        html += '</div>';
      }

      html += '</div>';
      contentEl.innerHTML = html;
    } catch (error) {
      console.error("[tc-overview] Error rendering overdue items:", error);
      const contentEl = $("ovOverdueContent");
      if (contentEl) contentEl.innerHTML = '<div style="opacity: 0.7; font-size: 13px;">Error loading data</div>';
    }
  }

  /**
   * Render At-Risk Students Panel
   */
  async function renderAtRiskStudents() {
    try {
      const contentEl = $("ovAtRiskContent");
      if (!contentEl) return;

      const [students, goals, progress] = await Promise.all([
        db.listStudents(),
        db.listGoalsAll(),
        db.listGoalProgress ? db.listGoalProgress({}) : []
      ]);

      const atRisk = [];
      
      for (const student of students.filter(s => s.active !== false)) {
        const studentGoals = goals.filter(g => g.student_code === student.code && g.status === 'active');
        
        for (const goal of studentGoals) {
          const goalProgress = progress.filter(p => p.student_code === student.code && p.goal_code === goal.code);
          
          if (goalProgress.length === 0) continue;
          
          // Sort by date to get most recent
          goalProgress.sort((a, b) => new Date(b.date) - new Date(a.date));
          const recent = goalProgress[0];
          
          // Check if current performance is at or below baseline
          const baseline = goal.baseline_percent || goal.baseline_points || 0;
          const current = recent.percent || recent.points || 0;
          
          if (current <= baseline) {
            atRisk.push({
              studentCode: student.code,
              studentName: student.name,
              goalCode: goal.code,
              current,
              baseline
            });
          }
        }
      }

      if (atRisk.length === 0) {
        contentEl.innerHTML = '<div style="color: rgba(34,197,94,.9); font-size: 14px;">✅ All students progressing above baseline</div>';
        $("ovAtRiskCard").classList.remove("alert-amber");
        $("ovAtRiskCard").classList.add("alert-green");
        return;
      }

      $("ovAtRiskCard").classList.add("alert-amber");
      
      let html = `<div style="font-size: 13px; line-height: 1.6;">`;
      html += `<div style="margin-bottom: 8px;"><strong>${atRisk.length} student${atRisk.length !== 1 ? 's' : ''} at or below baseline:</strong></div>`;
      html += '<div style="max-height: 200px; overflow-y: auto;">';
      
      for (const item of atRisk.slice(0, 10)) {
        html += `<div style="padding: 4px 0; opacity: 0.9;">• ${item.studentCode} — Goal ${item.goalCode}: ${item.current}% (baseline: ${item.baseline}%)</div>`;
      }
      
      html += '</div></div>';
      contentEl.innerHTML = html;
    } catch (error) {
      console.error("[tc-overview] Error rendering at-risk students:", error);
      const contentEl = $("ovAtRiskContent");
      if (contentEl) contentEl.innerHTML = '<div style="opacity: 0.7; font-size: 13px;">Error loading data</div>';
    }
  }

  /**
   * Render Today's Checklist
   */
  async function renderChecklist() {
    try {
      const contentEl = $("ovChecklistContent");
      if (!contentEl) return;

      const today = formatDateYMD(new Date());
      const checklistKey = `rc_overview_checklist_${today}`;
      const savedChecklist = JSON.parse(localStorage.getItem(checklistKey) || '{}');

      const [submissions, instances, goals, progress, students, events] = await Promise.all([
        db.listSubmissions ? db.listSubmissions({}) : [],
        db.listAssignmentInstances(),
        db.listGoalsAll(),
        db.listGoalProgress ? db.listGoalProgress({}) : [],
        db.listStudents(),
        db.listEvents ? db.listEvents() : []
      ]);

      const checklist = [];

      // Unreviewed submissions
      const unreviewedCount = submissions.filter(s => s.review_status === 'pending').length;
      if (unreviewedCount > 0) {
        checklist.push({
          id: 'review-submissions',
          text: `Review ${unreviewedCount} unreviewed submission${unreviewedCount !== 1 ? 's' : ''}`,
          link: '/teacher/review/',
          checked: savedChecklist['review-submissions'] || false
        });
      }

      // Missing progress data
      const currentQuarter = getCurrentQuarter();
      const quarterRange = getQuarterDateRange(currentQuarter);
      let missingProgressCount = 0;
      
      if (quarterRange) {
        const activeStudents = students.filter(s => s.active !== false);
        for (const student of activeStudents) {
          const studentGoals = goals.filter(g => g.student_code === student.code && g.status === 'active');
          for (const goal of studentGoals) {
            const hasProgress = progress.some(p => 
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
          id: 'collect-progress',
          text: `Collect progress data for ${missingProgressCount} goal${missingProgressCount !== 1 ? 's' : ''} (no data this quarter)`,
          link: '/teacher/data/',
          checked: savedChecklist['collect-progress'] || false
        });
      }

      // Assignments due this week
      const nowDate = new Date();
      const weekFromNow = new Date(nowDate);
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      
      const dueThisWeek = instances.filter(i => {
        if (!i.due_at) return false;
        const dueDate = new Date(i.due_at);
        return dueDate >= nowDate && dueDate <= weekFromNow;
      });

      if (dueThisWeek.length > 0) {
        checklist.push({
          id: 'assignments-due',
          text: `${dueThisWeek.length} assignment${dueThisWeek.length !== 1 ? 's' : ''} due this week`,
          link: '/teacher/calendar/',
          checked: savedChecklist['assignments-due'] || false
        });
      }

      // Upcoming IEP meetings (within 30 days)
      const thirtyDaysFromNow = new Date(nowDate);
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      let upcomingIEPs = 0;
      for (const student of students) {
        if (student.iep_due) {
          const iepDate = new Date(student.iep_due);
          if (iepDate >= nowDate && iepDate <= thirtyDaysFromNow) {
            upcomingIEPs++;
          }
        }
      }

      if (upcomingIEPs > 0) {
        checklist.push({
          id: 'iep-meetings',
          text: `${upcomingIEPs} IEP meeting${upcomingIEPs !== 1 ? 's' : ''} coming up within 30 days`,
          link: '/teacher/students/',
          checked: savedChecklist['iep-meetings'] || false
        });
      }

      if (checklist.length === 0) {
        contentEl.innerHTML = '<div style="color: rgba(34,197,94,.9); font-size: 14px;">✅ All tasks complete!</div>';
        return;
      }

      let html = '<div>';
      for (const item of checklist) {
        html += `
          <div class="checklist-item">
            <input type="checkbox" class="checklist-checkbox" data-id="${item.id}" ${item.checked ? 'checked' : ''}>
            <div class="checklist-text">
              ${item.link ? `<a href="${item.link}">${item.text}</a>` : item.text}
            </div>
          </div>
        `;
      }
      html += '</div>';
      
      contentEl.innerHTML = html;

      // Add event listeners for checkboxes
      contentEl.querySelectorAll('.checklist-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const id = e.target.dataset.id;
          const checked = e.target.checked;
          savedChecklist[id] = checked;
          localStorage.setItem(checklistKey, JSON.stringify(savedChecklist));
        });
      });
    } catch (error) {
      console.error("[tc-overview] Error rendering checklist:", error);
      const contentEl = $("ovChecklistContent");
      if (contentEl) contentEl.innerHTML = '<div style="opacity: 0.7; font-size: 13px;">Error loading data</div>';
    }
  }

  /**
   * Render Recent Activity Feed
   */
  async function renderActivityFeed() {
    try {
      const contentEl = $("ovFeedContent");
      if (!contentEl) return;

      const [submissions, progress, instances, assignments, students] = await Promise.all([
        db.listSubmissions ? db.listSubmissions({}) : [],
        db.listGoalProgress ? db.listGoalProgress({}) : [],
        db.listAssignmentInstances(),
        db.listAssignments(),
        db.listStudents()
      ]);

      const studentMap = new Map(students.map(s => [s.code, s]));
      const assignmentMap = new Map(assignments.map(a => [a.id, a]));

      const events = [];

      // Add submissions
      for (const sub of submissions) {
        if (sub.submitted_at) {
          const student = studentMap.get(sub.student_code);
          const instance = instances.find(i => i.id === sub.assignment_instance_id);
          const assignment = instance ? assignmentMap.get(instance.assignment_id) : null;
          
          events.push({
            type: 'submission',
            date: new Date(sub.submitted_at),
            text: `${student?.code || sub.student_code} submitted ${assignment?.title || 'Assignment'}`,
            icon: '📝'
          });
        }
      }

      // Add progress entries
      for (const p of progress) {
        if (p.date) {
          const student = studentMap.get(p.student_code);
          events.push({
            type: 'progress',
            date: new Date(p.date),
            text: `Progress recorded for ${student?.code || p.student_code} Goal ${p.goal_code}`,
            icon: '📈'
          });
        }
      }

      // Add new assignments (from created_at of instances)
      const seenAssignments = new Set();
      for (const inst of instances) {
        if (inst.created_at && !seenAssignments.has(inst.assignment_id)) {
          seenAssignments.add(inst.assignment_id);
          const assignment = assignmentMap.get(inst.assignment_id);
          events.push({
            type: 'assignment',
            date: new Date(inst.created_at),
            text: `${assignment?.title || 'Assignment'} issued`,
            icon: '🗂️'
          });
        }
      }

      // Sort by date (most recent first) and take top 10
      events.sort((a, b) => b.date - a.date);
      const recentEvents = events.slice(0, 10);

      if (recentEvents.length === 0) {
        contentEl.innerHTML = '<div style="opacity: 0.7; font-size: 13px;">No recent activity</div>';
        return;
      }

      let html = '<div>';
      for (const event of recentEvents) {
        html += `
          <div class="activity-item">
            <div class="activity-icon">${event.icon}</div>
            <div class="activity-text">${event.text}</div>
            <div class="activity-time">${getRelativeTime(event.date)}</div>
          </div>
        `;
      }
      html += '</div>';
      
      contentEl.innerHTML = html;
    } catch (error) {
      console.error("[tc-overview] Error rendering activity feed:", error);
      const contentEl = $("ovFeedContent");
      if (contentEl) contentEl.innerHTML = '<div style="opacity: 0.7; font-size: 13px;">Error loading data</div>';
    }
  }

  // Initialize
  await loadKPIs();
  await renderCalendarSnapshot();
  
  // Render command center panels
  await Promise.all([
    renderOverdueItems(),
    renderAtRiskStudents(),
    renderChecklist(),
    renderActivityFeed()
  ]);
})();
