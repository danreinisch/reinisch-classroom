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
    }
    // Note: Leave input empty if no saved name - let teacher enter their own
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
      iconEl.style.background = "#22c55e";
      textEl.textContent = "Connected to Supabase";
    } else {
      iconEl.style.background = "#f59e0b";
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
        // Pass empty array to get all goal progress (API filters when array has length > 0)
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
   * Escape HTML to prevent XSS
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Load and display student passwords table
   */
  async function loadStudentPasswords() {
    const tbody = $("studentPasswordBody");
    if (!tbody) return;

    try {
      const students = await db.listStudents();
      const active = students.filter((s) => s.active !== false);

      if (active.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="opacity:0.6; font-size:13px;">No students found.</td></tr>';
        return;
      }

      renderStudentPasswordRows(active, false);

      // Wire search filter
      const searchInput = $("studentPwSearch");
      if (searchInput) {
        searchInput.addEventListener("input", () => {
          const q = searchInput.value.trim().toLowerCase();
          const filtered = q
            ? active.filter(
                (s) =>
                  (s.name || "").toLowerCase().includes(q) ||
                  (s.code || "").toLowerCase().includes(q)
              )
            : active;
          const revealAll = $("revealAllToggle")?.checked || false;
          renderStudentPasswordRows(filtered, revealAll);
        });
      }
    } catch (error) {
      console.error("[tc-settings] Error loading student passwords:", error);
      tbody.innerHTML = '<tr><td colspan="4" style="opacity:0.6; font-size:13px;">Error loading students.</td></tr>';
    }
  }

  /**
   * Render student password table rows
   */
  function renderStudentPasswordRows(students, reveal) {
    const tbody = $("studentPasswordBody");
    if (!tbody) return;

    let html = "";
    for (const s of students) {
      const code = escapeHtml(s.code || "");
      const name = escapeHtml(s.name || s.code || "");
      const defaultPw = (s.code || "") + "!";
      const pw = escapeHtml(s.password || defaultPw);
      const masked = "••••••";

      html += `<tr>
        <td>${name}</td>
        <td><code>${code}</code></td>
        <td class="pw-cell" data-pw="${pw}">${reveal ? pw : masked}</td>
        <td style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="rc-btn" style="font-size:12px;padding:6px 10px;" data-action="copy" data-code="${code}" data-pw="${pw}">Copy</button>
          <button class="rc-btn danger" style="font-size:12px;padding:6px 10px;" data-action="reset" data-code="${code}">Reset</button>
        </td>
      </tr>`;
    }
    tbody.innerHTML = html;

    // Wire action buttons
    tbody.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "copy") {
          copyPassword(btn.dataset.pw);
        } else if (action === "reset") {
          resetStudentPassword(btn.dataset.code);
        }
      });
    });
  }

  /**
   * Toggle reveal all passwords in the table
   */
  function toggleRevealAll() {
    const revealAll = $("revealAllToggle")?.checked || false;
    const cells = document.querySelectorAll("#studentPasswordBody .pw-cell");
    cells.forEach((cell) => {
      cell.textContent = revealAll ? cell.dataset.pw : "••••••";
    });
  }

  /**
   * Reset a student's password to the default ({code}!)
   */
  async function resetStudentPassword(studentCode) {
    if (!studentCode) return;
    const defaultPw = studentCode + "!";

    if (!confirm(`Reset password for ${studentCode} to default ("${defaultPw}")?`)) return;

    try {
      await db.setStudentPassword(studentCode, defaultPw);
      console.log("[tc-settings] Student password reset for:", studentCode);

      // Refresh table
      await loadStudentPasswords();

      // Show brief confirmation
      alert(`Password for ${studentCode} reset to default.`);
    } catch (error) {
      console.error("[tc-settings] Error resetting student password:", error);
      alert("Error resetting password. Check console for details.");
    }
  }

  /**
   * Copy a password to clipboard with brief feedback
   */
  async function copyPassword(password) {
    try {
      await navigator.clipboard.writeText(password);
      // Brief visual feedback via a temporary message
      const msg = document.createElement("div");
      msg.textContent = "Copied!";
      msg.style.cssText =
        "position:fixed;bottom:24px;right:24px;background:#22c55e;color:#0b1220;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;";
      document.body.appendChild(msg);
      setTimeout(() => msg.remove(), 1800);
    } catch (error) {
      console.error("[tc-settings] Clipboard write failed:", error);
      alert("Could not copy to clipboard.");
    }
  }

  /**
   * Change the teacher's login password
   */
  async function changeTeacherPassword() {
    const currentInput = $("currentPasswordInput");
    const newInput = $("newPasswordInput");
    const confirmInput = $("confirmPasswordInput");
    const msgEl = $("passwordChangeMsg");

    if (!currentInput || !newInput || !confirmInput || !msgEl) return;

    const current = currentInput.value;
    const newPw = newInput.value;
    const confirm = confirmInput.value;

    const showMsg = (text, color) => {
      msgEl.textContent = text;
      msgEl.style.color = color;
      msgEl.style.display = "block";
    };

    if (!current || !newPw || !confirm) {
      showMsg("Please fill in all password fields.", "#f59e0b");
      return;
    }

    if (newPw.length < 8) {
      showMsg("New password must be at least 8 characters.", "#ef4444");
      return;
    }

    if (newPw !== confirm) {
      showMsg("New passwords do not match.", "#ef4444");
      return;
    }

    const btn = $("changePasswordBtn");
    if (btn) btn.disabled = true;

    try {
      if (!isRemote()) {
        showMsg("Password change is only available when connected to Supabase.", "#f59e0b");
        return;
      }

      const res = await fetch("/.netlify/functions/teacher-change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showMsg("Password changed successfully.", "#22c55e");
        currentInput.value = "";
        newInput.value = "";
        confirmInput.value = "";
      } else {
        showMsg(data.error || "Failed to change password. Please try again.", "#ef4444");
      }
    } catch (error) {
      console.error("[tc-settings] Error changing teacher password:", error);
      showMsg("Error changing password. Check console for details.", "#ef4444");
    } finally {
      if (btn) btn.disabled = false;
    }
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
    const changePasswordBtn = $("changePasswordBtn");
    const revealAllToggle = $("revealAllToggle");

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

    if (changePasswordBtn) {
      changePasswordBtn.addEventListener("click", changeTeacherPassword);
    }

    if (revealAllToggle) {
      revealAllToggle.addEventListener("change", toggleRevealAll);
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
    loadStudentPasswords();
    console.log("[tc-settings] Settings page initialized");
  }

  // Run initialization
  init();
})();
