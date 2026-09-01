/**
 * Teacher Center Calendar Module
 * Displays a calendar with assignment due dates, IEP dates, eval dates, and quarter bands
 */

(async () => {
  "use strict";

  // Only run on calendar page
  if (!location.pathname.startsWith("/teacher/calendar")) return;

  console.log("[tc-calendar] Initializing calendar module");

  // Import data adapter
  const { db, isRemote } = await import("/web/data-adapter.js");
  const { getQuarterForDate } = await import("/web/quarter-utils.js");
  const { CANON_CLASSES } = await import("/web/constants.js");

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

  // State
  let currentView = "month"; // "month" or "week"
  let currentDate = new Date();
  let syncStatus = "local";
  let allEvents = [];
  const DRAFT_KEY = "rc_tc_work_drafts_v1";

  /**
   * Update sync status indicator
   */
  function updateSyncStatus() {
    const statusEl = $("calSyncStatus");
    const iconEl = $("calSyncIcon");
    const textEl = $("calSyncText");

    if (!statusEl || !iconEl || !textEl) return;

    statusEl.style.display = "inline-flex";
    statusEl.classList.remove("synced", "local", "error");

    if (syncStatus === "synced") {
      statusEl.classList.add("synced");
      iconEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" style="fill: var(--rc-success)" aria-hidden="true"><circle cx="5" cy="5" r="5"/></svg>';
      textEl.textContent = "Synced with Supabase";
    } else if (syncStatus === "error") {
      statusEl.classList.add("error");
      iconEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" style="fill: var(--rc-danger)" aria-hidden="true"><circle cx="5" cy="5" r="5"/></svg>';
      textEl.textContent = "Sync error (using local data)";
    } else {
      statusEl.classList.add("local");
      iconEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" style="fill: var(--rc-warning)" aria-hidden="true"><circle cx="5" cy="5" r="5"/></svg>';
      textEl.textContent = "Local mode";
    }
  }

  /**
   * SVG icons for event types (Lucide-style, inline for calendar cells)
   */
  const ICONS = {
    assignment: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/></svg>',
    iep: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    eval: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  };

  /**
   * Load events from database
   */
  async function loadEvents() {
    try {
      const events = [];
      
      // Load assignment instances for due dates
      const instances = await db.listAssignmentInstances();
      const assignments = await db.listAssignments();
      const assignmentMap = new Map(assignments.map(a => [a.id, a]));
      
      for (const inst of instances) {
        if (inst.due_at) {
          const dueDate = parseAssignmentDeadline(inst.due_at);
          if (!dueDate) continue;
          const assignment = assignmentMap.get(inst.assignment_id);
          events.push({
            type: "assignment",
            date: dueDate,
            title: assignment ? assignment.title : "Assignment",
            icon: ICONS.assignment,
            id: inst.id
          });
        }
      }

      // Load IEP dates from students
      const students = await db.listStudents();
      for (const student of students) {
        if (student.iep_due) {
          events.push({
            type: "iep",
            date: new Date(student.iep_due),
            title: `IEP: ${student.name}`,
            icon: ICONS.iep,
            id: `iep-${student.id}`
          });
        }
        if (student.eval_due) {
          events.push({
            type: "eval",
            date: new Date(student.eval_due),
            title: `Eval: ${student.name}`,
            icon: ICONS.eval,
            id: `eval-${student.id}`
          });
        }
      }

      // Load drafts from localStorage
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
                icon: ICONS.assignment,
                id: `draft-${draft.id}`,
                isDraft: true
              });
            }
          }
        } catch (e) {
          console.warn("[tc-calendar] Failed to parse drafts:", e);
        }
      }

      allEvents = events;
      
      // Update sync status
      syncStatus = await isRemote() ? "synced" : "local";
      updateSyncStatus();

      console.log("[tc-calendar] Loaded events:", events.length);
      return events;
    } catch (error) {
      console.error("[tc-calendar] Error loading events:", error);
      syncStatus = "error";
      updateSyncStatus();
      return [];
    }
  }

  /**
   * Get events for a specific date
   */
  function getEventsForDate(date) {
    const dateStr = formatDateYMD(date);
    return allEvents.filter(event => formatDateYMD(event.date) === dateStr);
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
   * Get first day of month
   */
  function getFirstDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /**
   * Get last day of month
   */
  function getLastDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  /**
   * Get calendar grid dates for month view
   */
  function getMonthGridDates(date) {
    const firstDay = getFirstDayOfMonth(date);
    const lastDay = getLastDayOfMonth(date);
    
    // Start from the Sunday before the first day of the month
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    // End on the Saturday after the last day of the month
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));
    
    const dates = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  }

  /**
   * Get week dates starting from a given date
   */
  function getWeekDates(date) {
    const dates = [];
    const startDate = new Date(date);
    // Start from Sunday of the week
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    
    return dates;
  }

  /**
   * Check if two dates are the same day
   */
  function isSameDay(d1, d2) {
    return formatDateYMD(d1) === formatDateYMD(d2);
  }

  /**
   * Render month view
   */
  function renderMonthView() {
    const container = $("calMonthView");
    if (!container) return;

    const dates = getMonthGridDates(currentDate);
    const today = new Date();
    const currentMonth = currentDate.getMonth();

    let html = '<div class="cal-grid">';
    
    // Day headers
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (const day of dayNames) {
      html += `<div class="cal-day-header">${day}</div>`;
    }

    // Day cells
    for (const date of dates) {
      const isOtherMonth = date.getMonth() !== currentMonth;
      const isToday = isSameDay(date, today);
      const events = getEventsForDate(date);
      const quarter = getQuarterForDate(date);

      let cellClass = "cal-day-cell";
      if (isOtherMonth) cellClass += " other-month";
      if (isToday) cellClass += " today";

      html += `<div class="${cellClass}" data-date="${formatDateYMD(date)}">`;
      
      // Quarter background band
      if (quarter && !isOtherMonth) {
        html += `<div class="cal-quarter-band ${quarter.toLowerCase()}"></div>`;
      }

      html += `<div class="cal-day-num">${date.getDate()}</div>`;
      html += '<div class="cal-events">';
      
      // Show up to 3 events
      const visibleEvents = events.slice(0, 3);
      for (const event of visibleEvents) {
        html += `<div class="cal-event ${event.type}" title="${escapeHtml(event.title)}">`;
        html += `${event.icon} ${escapeHtml(event.title)}`;
        html += '</div>';
      }
      
      if (events.length > 3) {
        html += `<div class="cal-event-overflow">+${events.length - 3} more</div>`;
      }
      
      html += '</div></div>';
    }

    html += '</div>';
    container.innerHTML = html;

    // Add click handlers to day cells
    const cells = container.querySelectorAll(".cal-day-cell");
    cells.forEach(cell => {
      cell.addEventListener("click", (e) => {
        const dateStr = cell.getAttribute("data-date");
        if (dateStr) {
          openQuickAddModal(dateStr);
        }
      });
    });
  }

  /**
   * Render week view
   */
  function renderWeekView() {
    const container = $("calWeekView");
    if (!container) return;

    const dates = getWeekDates(currentDate);
    const today = new Date();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    let html = '<div class="cal-week-grid">';

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const isToday = isSameDay(date, today);
      const events = getEventsForDate(date);

      let cellClass = "cal-week-day";
      if (isToday) cellClass += " today";

      html += `<div class="${cellClass}" data-date="${formatDateYMD(date)}">`;
      html += `<div class="cal-week-day-header">${dayNames[i]}<br/>${date.getMonth() + 1}/${date.getDate()}</div>`;
      html += '<div class="cal-week-events">';

      for (const event of events) {
        html += `<div class="cal-week-event ${event.type}" title="${escapeHtml(event.title)}">`;
        html += `${event.icon} ${escapeHtml(event.title)}`;
        html += '</div>';
      }

      if (events.length === 0) {
        html += '<p class="cal-week-empty">No events</p>';
      }

      html += '</div></div>';
    }

    html += '</div>';
    container.innerHTML = html;

    // Add click handlers
    const cells = container.querySelectorAll(".cal-week-day");
    cells.forEach(cell => {
      cell.addEventListener("click", (e) => {
        const dateStr = cell.getAttribute("data-date");
        if (dateStr) {
          openQuickAddModal(dateStr);
        }
      });
    });
  }

  /**
   * Update calendar title
   */
  function updateTitle() {
    const titleEl = $("calTitle");
    if (!titleEl) return;

    if (currentView === "month") {
      const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      titleEl.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else {
      const weekDates = getWeekDates(currentDate);
      const start = weekDates[0];
      const end = weekDates[6];
      const startStr = `${start.getMonth() + 1}/${start.getDate()}`;
      const endStr = `${end.getMonth() + 1}/${end.getDate()}`;
      titleEl.textContent = `Week of ${startStr} - ${endStr}`;
    }
  }

  /**
   * Render current view
   */
  function render() {
    updateTitle();
    if (currentView === "month") {
      renderMonthView();
    } else {
      renderWeekView();
    }
  }

  /**
   * Navigate to previous period
   */
  function navPrev() {
    if (currentView === "month") {
      currentDate.setMonth(currentDate.getMonth() - 1);
    } else {
      currentDate.setDate(currentDate.getDate() - 7);
    }
    render();
  }

  /**
   * Navigate to next period
   */
  function navNext() {
    if (currentView === "month") {
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else {
      currentDate.setDate(currentDate.getDate() + 7);
    }
    render();
  }

  /**
   * Navigate to today
   */
  function navToday() {
    currentDate = new Date();
    render();
  }

  /**
   * Switch view
   */
  function switchView(view) {
    currentView = view;
    
    const monthViewEl = $("calMonthView");
    const weekViewEl = $("calWeekView");
    const monthBtnEl = $("calMonthViewBtn");
    const weekBtnEl = $("calWeekViewBtn");

    if (view === "month") {
      monthViewEl.style.display = "block";
      weekViewEl.style.display = "none";
      monthBtnEl.classList.add("active");
      weekBtnEl.classList.remove("active");
    } else {
      monthViewEl.style.display = "none";
      weekViewEl.style.display = "block";
      monthBtnEl.classList.remove("active");
      weekBtnEl.classList.add("active");
    }

    render();
  }

  /**
   * Open quick-add assignment modal
   */
  function openQuickAddModal(dateStr) {
    const modal = $("quickAddModal");
    const dueDateInput = $("qaDueDate");
    
    if (modal && dueDateInput) {
      dueDateInput.value = dateStr;
      modal.classList.add("active");
      
      // Focus title input
      const titleInput = $("qaTitle");
      if (titleInput) {
        setTimeout(() => titleInput.focus(), 100);
      }
    }
  }

  /**
   * Close quick-add modal
   */
  function closeQuickAddModal() {
    const modal = $("quickAddModal");
    if (modal) {
      modal.classList.remove("active");
      
      // Reset form
      const form = $("quickAddForm");
      if (form) form.reset();
    }
  }

  /**
   * Handle quick-add form submission
   */
  async function handleQuickAdd(e) {
    e.preventDefault();

    const title = $("qaTitle").value.trim();
    const className = $("qaClass").value;
    const dueDate = $("qaDueDate").value;
    const notes = $("qaNotes").value.trim();

    if (!title || !className || !dueDate) {
      await rcAlert('Required Fields', 'Please fill in all required fields.');
      return;
    }

    // Create draft (following tc-work.js pattern)
    const draft = {
      id: Date.now(),
      title,
      class: className,
      dueDate,
      notes,
      createdAt: new Date().toISOString(),
      source: "calendar-quick-add"
    };

    // Load existing drafts
    let drafts = [];
    const draftsJson = localStorage.getItem(DRAFT_KEY);
    if (draftsJson) {
      try {
        drafts = JSON.parse(draftsJson);
      } catch (e) {
        console.warn("[tc-calendar] Failed to parse drafts:", e);
      }
    }

    // Add new draft
    drafts.push(draft);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));

    console.log("[tc-calendar] Created draft:", draft);

    // Reload events and re-render
    await loadEvents();
    render();

    // Close modal
    closeQuickAddModal();

    // Show success message
    await rcAlert('Draft Added', `Assignment "${title}" added to drafts!`);
  }

  /**
   * Escape HTML for safe rendering
   */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Populate class dropdown
   */
  function populateClassDropdown() {
    const select = $("qaClass");
    if (!select) return;

    for (const className of CANON_CLASSES) {
      const option = document.createElement("option");
      option.value = className;
      option.textContent = className;
      select.appendChild(option);
    }
  }

  /**
   * Initialize calendar
   */
  async function init() {
    // Populate class dropdown
    populateClassDropdown();

    // Load events
    await loadEvents();

    // Render initial view
    render();

    // Set up event listeners
    const prevBtn = $("calPrevBtn");
    const nextBtn = $("calNextBtn");
    const todayBtn = $("calTodayBtn");
    const monthViewBtn = $("calMonthViewBtn");
    const weekViewBtn = $("calWeekViewBtn");
    const quickAddForm = $("quickAddForm");
    const cancelBtn = $("qaCancelBtn");
    const modal = $("quickAddModal");

    if (prevBtn) prevBtn.addEventListener("click", navPrev);
    if (nextBtn) nextBtn.addEventListener("click", navNext);
    if (todayBtn) todayBtn.addEventListener("click", navToday);
    if (monthViewBtn) monthViewBtn.addEventListener("click", () => switchView("month"));
    if (weekViewBtn) weekViewBtn.addEventListener("click", () => switchView("week"));
    if (quickAddForm) quickAddForm.addEventListener("submit", handleQuickAdd);
    if (cancelBtn) cancelBtn.addEventListener("click", closeQuickAddModal);
    
    // Close modal when clicking outside
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          closeQuickAddModal();
        }
      });
    }

    console.log("[tc-calendar] Initialization complete");
  }

  // Initialize
  await init();
})();
