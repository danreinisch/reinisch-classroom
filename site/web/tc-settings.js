/**
 * Teacher Center Settings Module
 * Manages teacher profile, quarter dates, and data management
 */

(async () => {
  "use strict";

  // Only run on settings page
  if (!location.pathname.startsWith("/teacher/settings")) return;

  console.log("[tc-settings] Initializing settings module");

  // Import data adapter
  const { db, isRemote } = await import("/web/data-adapter.js");

  // DOM helper
  const $ = (id) => document.getElementById(id);

  // Default quarter dates
  const DEFAULT_QUARTER_DATES = {
    Q1: { start: "Aug 16", end: "Oct 17" },
    Q2: { start: "Oct 18", end: "Dec 19" },
    Q3: { start: "Dec 20", end: "Mar 6" },
    Q4: { start: "Mar 7", end: "May 20" },
  };

  /**
   * Load and display teacher name
   */
  function loadTeacherName() {
    const savedName = localStorage.getItem("rc_teacher_name");
    const input = $("teacherNameInput");
    
    if (input && savedName) {
      input.value = savedName;
    } else if (input) {
      // Default value
      input.value = "Dan Reinisch";
    }
  }

  /**
   * Save teacher name to localStorage
   */
  function saveTeacherName() {
    const input = $("teacherNameInput");
    if (!input) return;

    const name = input.value.trim();
    if (!name) {
      alert("Please enter a teacher name.");
      return;
    }

    localStorage.setItem("rc_teacher_name", name);
    console.log("[tc-settings] Teacher name saved:", name);
    
    // Show success feedback
    const btn = $("saveTeacherNameBtn");
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = "✓ Saved!";
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  }

  /**
   * Load and display quarter dates
   */
  function loadQuarterDates() {
    const savedDates = localStorage.getItem("rc_quarter_dates");
    let dates = DEFAULT_QUARTER_DATES;

    if (savedDates) {
      try {
        dates = JSON.parse(savedDates);
      } catch (e) {
        console.warn("[tc-settings] Failed to parse saved quarter dates:", e);
        dates = DEFAULT_QUARTER_DATES;
      }
    }

    // Populate inputs
    ["Q1", "Q2", "Q3", "Q4"].forEach((q) => {
      const startInput = $(`${q.toLowerCase()}Start`);
      const endInput = $(`${q.toLowerCase()}End`);

      if (startInput && dates[q]) {
        startInput.value = dates[q].start || DEFAULT_QUARTER_DATES[q].start;
      }
      if (endInput && dates[q]) {
        endInput.value = dates[q].end || DEFAULT_QUARTER_DATES[q].end;
      }
    });
  }

  /**
   * Save quarter dates to localStorage
   */
  function saveQuarterDates() {
    const dates = {};

    ["Q1", "Q2", "Q3", "Q4"].forEach((q) => {
      const startInput = $(`${q.toLowerCase()}Start`);
      const endInput = $(`${q.toLowerCase()}End`);

      if (startInput && endInput) {
        dates[q] = {
          start: startInput.value.trim() || DEFAULT_QUARTER_DATES[q].start,
          end: endInput.value.trim() || DEFAULT_QUARTER_DATES[q].end,
        };
      }
    });

    localStorage.setItem("rc_quarter_dates", JSON.stringify(dates));
    console.log("[tc-settings] Quarter dates saved:", dates);

    // Show success feedback
    const btn = $("saveQuarterDatesBtn");
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = "✓ Saved!";
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  }

  /**
   * Reset quarter dates to defaults
   */
  function resetQuarterDates() {
    if (!confirm("Reset quarter dates to defaults? This will overwrite any custom dates.")) {
      return;
    }

    localStorage.removeItem("rc_quarter_dates");
    loadQuarterDates();
    console.log("[tc-settings] Quarter dates reset to defaults");

    // Show success feedback
    const btn = $("resetQuarterDatesBtn");
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = "✓ Reset!";
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  }

  /**
   * Update sync status indicator
   */
  function updateSyncStatus() {
    const statusEl = $("settingsSyncStatus");
    const iconEl = $("settingsSyncIcon");
    const textEl = $("settingsSyncText");

    if (!statusEl || !iconEl || !textEl) return;

    if (isRemote()) {
      iconEl.textContent = "🟢";
      textEl.textContent = "Connected to Supabase";
    } else {
      iconEl.textContent = "🟡";
      textEl.textContent = "Local mode";
    }
  }

  /**
   * Export all local data as JSON
   */
  async function exportData() {
    try {
      const data = {
        students: await db.listStudents(),
        goals: await db.listGoalsAll(),
        goalProgress: await db.listGoalProgress({ studentCodes: [] }),
        assignments: await db.listAssignments(),
        submissions: await db.listSubmissions(),
        settings: {
          teacherName: localStorage.getItem("rc_teacher_name"),
          quarterDates: localStorage.getItem("rc_quarter_dates"),
        },
        exportDate: new Date().toISOString(),
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `teacher-center-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();

      URL.revokeObjectURL(url);
      console.log("[tc-settings] Data exported successfully");
    } catch (error) {
      console.error("[tc-settings] Error exporting data:", error);
      alert("Error exporting data. Check console for details.");
    }
  }

  /**
   * Clear all localStorage data with rc_ prefix
   */
  function clearData() {
    const confirmMsg =
      "Are you sure you want to clear all local data?\n\n" +
      "This will delete:\n" +
      "- Teacher name\n" +
      "- Quarter dates\n" +
      "- All cached data\n\n" +
      "This action cannot be undone.";

    if (!confirm(confirmMsg)) {
      return;
    }

    // Get all localStorage keys with rc_ prefix
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("rc_")) {
        keysToDelete.push(key);
      }
    }

    // Delete all matching keys
    keysToDelete.forEach((key) => localStorage.removeItem(key));

    console.log("[tc-settings] Cleared", keysToDelete.length, "localStorage keys");
    alert(`Cleared ${keysToDelete.length} items from local storage.`);

    // Reload the page to reflect changes
    setTimeout(() => location.reload(), 500);
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    const saveTeacherNameBtn = $("saveTeacherNameBtn");
    const saveQuarterDatesBtn = $("saveQuarterDatesBtn");
    const resetQuarterDatesBtn = $("resetQuarterDatesBtn");
    const exportDataBtn = $("exportDataBtn");
    const clearDataBtn = $("clearDataBtn");

    if (saveTeacherNameBtn) {
      saveTeacherNameBtn.addEventListener("click", saveTeacherName);
    }

    if (saveQuarterDatesBtn) {
      saveQuarterDatesBtn.addEventListener("click", saveQuarterDates);
    }

    if (resetQuarterDatesBtn) {
      resetQuarterDatesBtn.addEventListener("click", resetQuarterDates);
    }

    if (exportDataBtn) {
      exportDataBtn.addEventListener("click", exportData);
    }

    if (clearDataBtn) {
      clearDataBtn.addEventListener("click", clearData);
    }
  }

  /**
   * Initialize settings page
   */
  function init() {
    loadTeacherName();
    loadQuarterDates();
    updateSyncStatus();
    setupEventListeners();
    console.log("[tc-settings] Settings page initialized");
  }

  // Run initialization
  init();
})();
