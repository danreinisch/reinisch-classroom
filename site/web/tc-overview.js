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
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      
      const upcomingEvents = events.filter(e => {
        return e.date >= today && e.date <= nextWeek;
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

  // Initialize
  await loadKPIs();
  await renderCalendarSnapshot();
})();
