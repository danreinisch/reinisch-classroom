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
   * Home config working copy (loaded from fetch + localStorage overlay)
   */
  var homeConfig = null;

  /**
   * Load home config: fetch base JSON, overlay localStorage if present
   */
  async function loadHomeConfig() {
    try {
      var res = await fetch('/assets/data/home-config.json?t=' + Date.now());
      homeConfig = await res.json();
    } catch (e) {
      console.warn('[tc-settings] Could not fetch home-config.json, using empty config:', e);
      homeConfig = { announcements: [], countdowns: [] };
    }

    // Overlay localStorage if present
    try {
      var raw = localStorage.getItem('rc_home_config');
      if (raw) homeConfig = JSON.parse(raw);
    } catch (e) { /* noop */ }

    if (!Array.isArray(homeConfig.announcements)) homeConfig.announcements = [];
    if (!Array.isArray(homeConfig.countdowns)) homeConfig.countdowns = [];

    // Populate Language Arts fields
    var la = homeConfig.languageArts || {};
    if ($('laUnit')) $('laUnit').value = la.unit || '';
    if ($('laCurrentWeek')) $('laCurrentWeek').value = la.currentWeek || '';
    if ($('laCurrentTitle')) $('laCurrentTitle').value = la.currentTitle || '';
    if ($('laNextWeek')) $('laNextWeek').value = la.nextWeek || '';
    if ($('laNextTitle')) $('laNextTitle').value = la.nextTitle || '';
    if ($('laUnitLink')) $('laUnitLink').value = la.unitLink || '';

    // Populate Life Skills fields
    var ls = homeConfig.lifeSkills || {};
    if ($('lsCurrentTitle')) $('lsCurrentTitle').value = ls.currentTitle || '';
    if ($('lsNextTitle')) $('lsNextTitle').value = ls.nextTitle || '';

    renderAnnouncements();
    renderCountdownsTable();
  }

  /**
   * Render announcements list into #announcementsList
   */
  function renderAnnouncements() {
    var el = $('announcementsList');
    if (!el) return;
    if (!homeConfig || homeConfig.announcements.length === 0) {
      el.innerHTML = '<p style="opacity:0.6; font-size:13px;">No announcements.</p>';
      return;
    }
    var html = '';
    homeConfig.announcements.forEach(function(text, i) {
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
        '<span style="flex:1;font-size:13px;">' + escapeHtml(text) + '</span>' +
        '<button class="rc-btn danger" style="font-size:12px;padding:6px 10px;" data-remove-announcement="' + i + '">Remove</button>' +
        '</div>';
    });
    el.innerHTML = html;
    el.querySelectorAll('[data-remove-announcement]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        removeAnnouncement(parseInt(btn.dataset.removeAnnouncement, 10));
      });
    });
  }

  /**
   * Add a new announcement from input
   */
  function addAnnouncement() {
    var input = $('newAnnouncementInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    homeConfig.announcements.push(text);
    input.value = '';
    renderAnnouncements();
  }

  /**
   * Remove announcement at index
   */
  function removeAnnouncement(index) {
    homeConfig.announcements.splice(index, 1);
    renderAnnouncements();
  }

  /**
   * Render countdowns table into #countdownsBody
   */
  function renderCountdownsTable() {
    var tbody = $('countdownsBody');
    if (!tbody) return;
    if (!homeConfig || homeConfig.countdowns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="opacity:0.6; font-size:13px;">No countdown events.</td></tr>';
      return;
    }
    var html = '';
    homeConfig.countdowns.forEach(function(item, i) {
      html += '<tr>' +
        '<td>' + escapeHtml(item.label || '') + '</td>' +
        '<td>' + escapeHtml(item.date || '') + '</td>' +
        '<td>' + escapeHtml(item.endDate || '') + '</td>' +
        '<td>' + escapeHtml(item.type || '') + '</td>' +
        '<td><button class="rc-btn danger" style="font-size:12px;padding:6px 10px;" data-remove-countdown="' + i + '">Remove</button></td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
    tbody.querySelectorAll('[data-remove-countdown]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        removeCountdown(parseInt(btn.dataset.removeCountdown, 10));
      });
    });
  }

  /**
   * Add a new countdown from the add-form inputs
   */
  function addCountdown() {
    var label = $('newCountdownLabel');
    var start = $('newCountdownStart');
    var end = $('newCountdownEnd');
    var type = $('newCountdownType');
    if (!label || !start || !type) return;
    var labelVal = label.value.trim();
    var startVal = start.value.trim();
    if (!labelVal || !startVal) return;
    var item = { label: labelVal, date: startVal, type: type.value };
    if (end && end.value.trim()) item.endDate = end.value.trim();
    homeConfig.countdowns.push(item);
    label.value = '';
    start.value = '';
    if (end) end.value = '';
    renderCountdownsTable();
  }

  /**
   * Remove countdown at index
   */
  function removeCountdown(index) {
    homeConfig.countdowns.splice(index, 1);
    renderCountdownsTable();
  }

  /**
   * Save Language Arts and Life Skills focus data to homeConfig and localStorage
   */
  function saveClassFocus() {
    if (!homeConfig) return;

    homeConfig.languageArts = homeConfig.languageArts || {};
    homeConfig.languageArts.unit = ($('laUnit') && $('laUnit').value.trim()) || '';
    homeConfig.languageArts.currentWeek = ($('laCurrentWeek') && $('laCurrentWeek').value.trim()) || '';
    homeConfig.languageArts.currentTitle = ($('laCurrentTitle') && $('laCurrentTitle').value.trim()) || '';
    homeConfig.languageArts.nextWeek = ($('laNextWeek') && $('laNextWeek').value.trim()) || '';
    homeConfig.languageArts.nextTitle = ($('laNextTitle') && $('laNextTitle').value.trim()) || '';
    homeConfig.languageArts.unitLink = ($('laUnitLink') && $('laUnitLink').value.trim()) || '';

    homeConfig.lifeSkills = homeConfig.lifeSkills || {};
    homeConfig.lifeSkills.currentTitle = ($('lsCurrentTitle') && $('lsCurrentTitle').value.trim()) || '';
    homeConfig.lifeSkills.nextTitle = ($('lsNextTitle') && $('lsNextTitle').value.trim()) || '';

    saveHomeConfig();
  }

  /**
   * Save home config to localStorage (live preview)
   */
  function saveHomeConfig() {
    localStorage.setItem('rc_home_config', JSON.stringify(homeConfig));
    showToast('✓ Saved! Changes are live on the home page.', '#22c55e', '#0b1220');
  }

  /**
   * Download home-config.json for committing to the repo
   */
  function downloadHomeConfig() {
    var json = JSON.stringify(homeConfig, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'home-config.json';
    a.click();
    URL.revokeObjectURL(url);
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
   * Show a temporary toast notification
   * @param {string} text - Message to display
   * @param {string} bg - Background color
   * @param {string} color - Text color
   */
  function showToast(text, bg, color) {
    const msg = document.createElement("div");
    msg.textContent = text;
    msg.style.cssText = `position:fixed;bottom:24px;right:24px;background:${bg};color:${color};padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;`;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2000);
  }

  /**
   * Escape HTML to prevent XSS injection in dynamically rendered content
   * @param {string} str - Raw string to escape
   * @returns {string} HTML-safe string
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

      showToast(`Password for ${studentCode} reset to default.`, "#22c55e", "#0b1220");
    } catch (error) {
      console.error("[tc-settings] Error resetting student password:", error);
      showToast("Error resetting password. Check console for details.", "#ef4444", "#fff");
    }
  }

  /**
   * Copy a password to clipboard with brief feedback
   */
  async function copyPassword(password) {
    try {
      await navigator.clipboard.writeText(password);
      showToast("Copied!", "#22c55e", "#0b1220");
    } catch (error) {
      console.error("[tc-settings] Clipboard write failed:", error);
      showToast("Could not copy to clipboard.", "#ef4444", "#fff");
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

    var addAnnouncementBtn = $('addAnnouncementBtn');
    if (addAnnouncementBtn) {
      addAnnouncementBtn.addEventListener('click', addAnnouncement);
    }
    var newAnnouncementInput = $('newAnnouncementInput');
    if (newAnnouncementInput) {
      newAnnouncementInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addAnnouncement();
      });
    }

    var saveHomeConfigAnnouncementsBtn = $('saveHomeConfigAnnouncementsBtn');
    if (saveHomeConfigAnnouncementsBtn) {
      saveHomeConfigAnnouncementsBtn.addEventListener('click', saveHomeConfig);
    }
    var downloadHomeConfigAnnouncementsBtn = $('downloadHomeConfigAnnouncementsBtn');
    if (downloadHomeConfigAnnouncementsBtn) {
      downloadHomeConfigAnnouncementsBtn.addEventListener('click', downloadHomeConfig);
    }

    var addCountdownBtn = $('addCountdownBtn');
    if (addCountdownBtn) {
      addCountdownBtn.addEventListener('click', addCountdown);
    }

    var saveHomeConfigCountdownsBtn = $('saveHomeConfigCountdownsBtn');
    if (saveHomeConfigCountdownsBtn) {
      saveHomeConfigCountdownsBtn.addEventListener('click', saveHomeConfig);
    }
    var downloadHomeConfigCountdownsBtn = $('downloadHomeConfigCountdownsBtn');
    if (downloadHomeConfigCountdownsBtn) {
      downloadHomeConfigCountdownsBtn.addEventListener('click', downloadHomeConfig);
    }

    var saveClassFocusBtn = $('saveClassFocusBtn');
    if (saveClassFocusBtn) {
      saveClassFocusBtn.addEventListener('click', saveClassFocus);
    }
    var downloadClassFocusBtn = $('downloadClassFocusBtn');
    if (downloadClassFocusBtn) {
      downloadClassFocusBtn.addEventListener('click', downloadHomeConfig);
    }
    var saveLsFocusBtn = $('saveLsFocusBtn');
    if (saveLsFocusBtn) {
      saveLsFocusBtn.addEventListener('click', saveClassFocus);
    }
    var downloadLsFocusBtn = $('downloadLsFocusBtn');
    if (downloadLsFocusBtn) {
      downloadLsFocusBtn.addEventListener('click', downloadHomeConfig);
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
    loadHomeConfig();
    console.log("[tc-settings] Settings page initialized");
  }

  // Run initialization
  init();
})();
