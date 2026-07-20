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
  const { DEFAULT_QUARTER_DATES } = await import("/web/quarter-utils.js");

  // DOM helper
  const $ = (id) => document.getElementById(id);

  // Default ticker scroll speed (animation duration in seconds)
  var DEFAULT_TICKER_SPEED = 45;

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
  async function saveTeacherName() {
    const input = $("teacherNameInput");
    if (!input) return;

    const name = input.value.trim();
    if (!name) {
      await rcAlert('Validation', 'Please enter a teacher name.');
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
   * Update the quarter timeline bar labels to reflect current dates
   */
  function updateQuarterTimeline(dates) {
    ["Q1", "Q2", "Q3", "Q4"].forEach((q, i) => {
      const el = $(`qtBar${i + 1}`);
      if (el && dates[q]) {
        el.textContent = `${dates[q].start} – ${dates[q].end}`;
      }
    });
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

    updateQuarterTimeline(dates);
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

    updateQuarterTimeline(dates);

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
  async function resetQuarterDates() {
    if (!await rcConfirm('Reset Quarter Dates', 'Reset quarter dates to defaults? This will overwrite any custom dates.', 'Reset')) {
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

    // Merge localStorage overrides on top of fetched config
    try {
      var raw = localStorage.getItem('rc_home_config');
      if (raw) {
        var overrides = JSON.parse(raw);
        if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
          for (var key in overrides) {
            if (Object.hasOwn(overrides, key)) {
              homeConfig[key] = overrides[key];
            }
          }
        }
      }
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

    loadTickerConfig();
    renderCountdownsTable();
  }

  /**
   * Map ticker speed (animation duration in seconds) to a human-friendly label
   */
  function tickerSpeedLabel(seconds) {
    var s = Number(seconds);
    if (s <= 5) return 'Blazing';
    if (s <= 8) return 'Very Fast';
    if (s <= 12) return 'Fast';
    if (s <= 20) return 'Moderate';
    if (s <= 30) return 'Brisk';
    if (s <= 45) return 'Normal';
    if (s <= 60) return 'Relaxed';
    if (s <= 90) return 'Slow';
    if (s <= 120) return 'Very Slow';
    return 'Crawl';
  }

  /**
   * Load ticker config fields from homeConfig.ticker
   */
  function loadTickerConfig() {
    if (!homeConfig.ticker) homeConfig.ticker = {};
    var ticker = homeConfig.ticker;
    var dateFormatEl = $('tickerDateFormat');
    var timeFormatEl = $('tickerTimeFormat');
    if (dateFormatEl) dateFormatEl.value = ticker.dateFormat || 'Day, Month DD, YYYY';
    if (timeFormatEl) timeFormatEl.value = ticker.timeFormat || 'h:mm AM/PM';

    var speedEl = $('tickerSpeed');
    var speedLabelEl = $('tickerSpeedLabel');
    var speed = ticker.speed || DEFAULT_TICKER_SPEED;
    if (speedEl) speedEl.value = speed;
    if (speedLabelEl) speedLabelEl.textContent = tickerSpeedLabel(speed);

    // Backwards compatibility: migrate old languageArts/lifeSkills/custom fields to items[]
    if (!Array.isArray(ticker.items)) {
      ticker.items = [];
      if (ticker.languageArts && ticker.languageArts.trim()) {
        ticker.items.push({ category: 'language-arts', text: ticker.languageArts.trim() });
      }
      if (ticker.lifeSkills && ticker.lifeSkills.trim()) {
        ticker.items.push({ category: 'life-skills', text: ticker.lifeSkills.trim() });
      }
      var legacy = ticker.custom || [];
      legacy.forEach(function(text) {
        if (text && text.trim()) ticker.items.push({ category: 'none', text: text.trim() });
      });
    }

    renderTickerRows();
  }

  /**
   * Render the dynamic ticker item rows into #tickerCustomRows
   */
  function renderTickerRows() {
    var el = $('tickerCustomRows');
    if (!el) return;
    var ticker = homeConfig.ticker || {};
    var items = ticker.items || [];
    var html = '';
    items.forEach(function(item, i) {
      var cat = item.category || 'none';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
        '<select class="rc-select ticker-item-category" data-ticker-index="' + i + '" style="flex:0 0 auto;width:140px;">' +
          '<option value="none"' + (cat === 'none' ? ' selected' : '') + '>None</option>' +
          '<option value="language-arts"' + (cat === 'language-arts' ? ' selected' : '') + '>Language Arts</option>' +
          '<option value="life-skills"' + (cat === 'life-skills' ? ' selected' : '') + '>Life Skills</option>' +
          '<option value="math-toolkit"' + (cat === 'math-toolkit' ? ' selected' : '') + '>Math Toolkit</option>' +
        '</select>' +
        '<input type="text" class="rc-input ticker-item-text" data-ticker-index="' + i + '" value="' + escapeHtml(item.text || '') + '" style="flex:1;" />' +
        '<button class="rc-btn danger" style="font-size:12px;padding:6px 10px;" data-remove-ticker="' + i + '">Remove</button>' +
        '</div>';
    });
    el.innerHTML = html;
    el.querySelectorAll('[data-remove-ticker]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        removeTickerRow(parseInt(btn.dataset.removeTicker, 10));
      });
    });
  }

  /**
   * Add a new blank ticker item row
   */
  function addTickerRow() {
    if (!homeConfig.ticker) homeConfig.ticker = {};
    if (!Array.isArray(homeConfig.ticker.items)) homeConfig.ticker.items = [];
    homeConfig.ticker.items.push({ category: 'none', text: '' });
    renderTickerRows();
  }

  /**
   * Remove ticker item row at index
   */
  function removeTickerRow(index) {
    if (!homeConfig.ticker || !Array.isArray(homeConfig.ticker.items)) return;
    homeConfig.ticker.items.splice(index, 1);
    renderTickerRows();
  }

  /**
   * Save ticker configuration to homeConfig.ticker and localStorage
   */
  function saveTickerConfig() {
    if (!homeConfig) return;
    // Collect current values from item rows before saving
    var selects = document.querySelectorAll('.ticker-item-category');
    var texts = document.querySelectorAll('.ticker-item-text');
    var items = [];
    selects.forEach(function(sel, i) {
      var text = texts[i] ? texts[i].value.trim() : '';
      if (text) items.push({ category: sel.value, text: text });
    });
    homeConfig.ticker = {
      dateFormat: ($('tickerDateFormat') && $('tickerDateFormat').value) || 'Day, Month DD, YYYY',
      timeFormat: ($('tickerTimeFormat') && $('tickerTimeFormat').value) || 'h:mm AM/PM',
      speed: parseInt(($('tickerSpeed') && $('tickerSpeed').value) || String(DEFAULT_TICKER_SPEED), 10),
      items: items
    };
    saveHomeConfig();
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
   * Save home config to localStorage (live preview) and Supabase (cross-device sync)
   */
  async function saveHomeConfig() {
    // Always save to localStorage for instant local preview
    localStorage.setItem('rc_home_config', JSON.stringify(homeConfig));

    // Also persist to Supabase so other devices (Smart TV) see changes
    try {
      await db.setAppConfig('home_config', homeConfig);
      showToast('✓ Saved & synced! Changes are live everywhere.', '#22c55e', '#0b1220');
    } catch (err) {
      console.warn('[tc-settings] Failed to sync home config to remote:', err);
      showToast('✓ Saved locally. Remote sync failed — TV may not update.', '#f59e0b', '#0b1220');
    }
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
      await rcAlert('Export Error', 'Error exporting data. Check console for details.');
    }
  }

  /**
   * Clear all localStorage data with rc_ prefix
   */
  async function clearData() {
    const confirmMsg =
      "Are you sure you want to clear all local data?\n\n" +
      "This will delete:\n" +
      "- Teacher name\n" +
      "- Quarter dates\n" +
      "- All cached data\n\n" +
      "This action cannot be undone.";

    if (!await rcConfirm('Clear Local Data', confirmMsg, 'Clear', { danger: true })) {
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
    showToast(`Cleared ${keysToDelete.length} items from local storage.`, 'rgba(100, 116, 139, 0.95)', '#fff');

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

      // Fetch password statuses to determine default vs custom (graceful fallback)
      const pwStatusMap = {};
      try {
        const statuses = await db.getStudentPasswordStatuses();
        (statuses || []).forEach((ps) => {
          pwStatusMap[ps.student_code] = ps.is_default_password;
        });
      } catch (e) {
        console.warn("[tc-settings] Could not fetch password statuses:", e.message);
      }

      // Annotate each student with their password status
      const annotated = active.map((s) => ({
        ...s,
        _isDefaultPw: s.code in pwStatusMap ? pwStatusMap[s.code] : null,
      }));

      renderStudentPasswordRows(annotated, false);

      // Wire search filter
      const searchInput = $("studentPwSearch");
      if (searchInput) {
        searchInput.addEventListener("input", () => {
          const q = searchInput.value.trim().toLowerCase();
          const filtered = q
            ? annotated.filter(
                (s) =>
                  (s.name || "").toLowerCase().includes(q) ||
                  (s.code || "").toLowerCase().includes(q)
              )
            : annotated;
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
      const masked = "••••••";

      // _isDefaultPw: true = known default ({code}!), false = custom password set, null = unverified
      const isCustom = s._isDefaultPw === false;
      const pw = isCustom ? "" : escapeHtml(defaultPw);

      // Build cell content: custom passwords show a badge instead of the actual value
      const customBadge = `${masked}&nbsp;<span style="font-size:11px;background:rgba(139,92,246,0.18);color:#a78bfa;border:1px solid rgba(139,92,246,0.35);border-radius:4px;padding:1px 6px;" title="Student has set a custom password">custom</span>`;
      const pwCellContent = isCustom ? customBadge : (reveal ? pw : masked);

      html += `<tr>
        <td>${name}</td>
        <td><code>${code}</code></td>
        <td class="pw-cell" data-pw="${pw}" data-custom="${isCustom}">${pwCellContent}</td>
        <td style="display:flex;gap:8px;flex-wrap:wrap;">
          ${!isCustom ? `<button class="rc-btn" style="font-size:12px;padding:6px 10px;" data-action="copy" data-code="${code}" data-pw="${pw}">Copy</button>` : ""}
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
      if (cell.dataset.custom === "true") return; // custom passwords: keep badge visible
      cell.textContent = revealAll ? cell.dataset.pw : "••••••";
    });
  }

  /**
   * Reset a student's password to the default ({code}!)
   */
  async function resetStudentPassword(studentCode) {
    if (!studentCode) return;
    const defaultPw = studentCode + "!";

    if (!await rcConfirm('Reset Password', `Reset password for ${studentCode} to default ("${defaultPw}")?`, 'Reset')) return;

    try {
      const response = await fetch(
        '/.netlify/functions/student-reset-password',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: studentCode,
          }),
        }
      );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error ||
          `Reset failed: ${response.status}`
        );
      }

      console.log(
        "[tc-settings] Student password reset for:",
        studentCode
      );

      await loadStudentPasswords();

      showToast(
        `Password for ${studentCode} reset to default.`,
        "#22c55e",
        "#0b1220"
      );
    } catch (error) {
      console.error(
        "[tc-settings] Error resetting student password:",
        error
      );

      showToast(
        "Error resetting password. Check console for details.",
        "#ef4444",
        "#fff"
      );
    }
  }

  /**
   * Reset ALL student passwords to the default ({code}!) format via server
   */
  async function resetAllStudentPasswords() {
    if (!await rcConfirm('Reset All Passwords', 'This will reset ALL student passwords to their default ({code}!). Students with custom passwords will lose them. Are you sure?', 'Reset All', { danger: true })) return;

    const btn = $("resetAllPasswordsBtn");
    if (btn) btn.disabled = true;

    try {
      const res = await fetch("/.netlify/functions/admin-reset-passwords", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("[tc-settings] Reset all passwords failed:", data);
        showToast(data.error || "Failed to reset passwords. Check console for details.", "#ef4444", "#fff");
        return;
      }

      const count = data.reset_count != null ? data.reset_count : "all";
      console.log("[tc-settings] Reset all student passwords. Count:", count);

      // Refresh table
      await loadStudentPasswords();

      showToast(`✓ Reset ${count} student passwords to default`, "#22c55e", "#0b1220");
    } catch (error) {
      console.error("[tc-settings] Error resetting all student passwords:", error);
      showToast("Error resetting passwords. Check console for details.", "#ef4444", "#fff");
    } finally {
      if (btn) btn.disabled = false;
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

  var DIGEST_SECTION_IDS = [
    'digestSectionRegressing', 'digestSectionStalled', 'digestSectionDeadlines',
    'digestSectionStale', 'digestSectionMastery', 'digestSectionStats',
  ];
  var DIGEST_DEFAULT_STALE = 14;
  var DIGEST_DEFAULT_IEP = 30;

  /**
   * Load digest settings from localStorage and populate the form
   */
  function loadDigestSettings() {
    var raw = localStorage.getItem('rc_digest_settings');
    var settings = {};
    try {
      if (raw) settings = JSON.parse(raw);
    } catch (e) { /* noop */ }

    var enabled = $('digestEnabledToggle');
    if (enabled) enabled.checked = settings.enabled !== false;

    DIGEST_SECTION_IDS.forEach(function(id) {
      var el = $(id);
      if (el) el.checked = settings[id] !== false;
    });

    var staleEl = $('digestStaleThreshold');
    if (staleEl) staleEl.value = settings.staleThreshold != null ? settings.staleThreshold : DIGEST_DEFAULT_STALE;

    var iepEl = $('digestIepWindow');
    if (iepEl) iepEl.value = settings.iepWindow != null ? settings.iepWindow : DIGEST_DEFAULT_IEP;
  }

  /**
   * Save digest settings to localStorage
   */
  function saveDigestSettings() {
    var enabled = $('digestEnabledToggle');
    var staleEl = $('digestStaleThreshold');
    var iepEl = $('digestIepWindow');

    var settings = { enabled: enabled ? enabled.checked : true };
    DIGEST_SECTION_IDS.forEach(function(id) {
      var el = $(id);
      settings[id] = el ? el.checked : true;
    });
    settings.staleThreshold = staleEl ? parseInt(staleEl.value, 10) || DIGEST_DEFAULT_STALE : DIGEST_DEFAULT_STALE;
    settings.iepWindow = iepEl ? parseInt(iepEl.value, 10) || DIGEST_DEFAULT_IEP : DIGEST_DEFAULT_IEP;

    localStorage.setItem('rc_digest_settings', JSON.stringify(settings));
    console.log('[tc-settings] Digest settings saved:', settings);
    showToast('✓ Digest settings saved.', '#22c55e', '#0b1220');
  }

  /**
   * Send a test digest email by invoking the Edge Function directly
   */
  async function sendTestDigest() {
    var btn = $('digestSendTest');
    if (btn) btn.disabled = true;
    try {
      var supabaseUrl = (window.SUPABASE_URL || '').replace(/\/$/, '');
      var anonKey = window.SUPABASE_ANON_KEY || '';
      if (!supabaseUrl || !anonKey) {
        showToast('Supabase not configured — cannot send test digest.', '#ef4444', '#fff');
        return;
      }
      var url = supabaseUrl + '/functions/v1/daily-digest';
      showToast('Sending test digest…', 'rgba(100,116,139,0.95)', '#fff');
      var res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + anonKey,
          'apikey': anonKey,
        },
      });
      var data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('✓ Test digest sent! Check your inbox.', '#22c55e', '#0b1220');
      } else {
        console.error('[tc-settings] Test digest failed:', data);
        showToast('Failed to send test digest. Check console for details.', '#ef4444', '#fff');
      }
    } catch (err) {
      console.error('[tc-settings] Error sending test digest:', err);
      showToast('Error sending test digest. Check console for details.', '#ef4444', '#fff');
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

    var resetAllPasswordsBtn = $("resetAllPasswordsBtn");
    if (resetAllPasswordsBtn) {
      resetAllPasswordsBtn.addEventListener("click", resetAllStudentPasswords);
    }

    var addTickerRowBtn = $('addTickerRowBtn');
    if (addTickerRowBtn) {
      addTickerRowBtn.addEventListener('click', addTickerRow);
    }

    var tickerSpeedEl = $('tickerSpeed');
    if (tickerSpeedEl) {
      tickerSpeedEl.addEventListener('input', function() {
        var labelEl = $('tickerSpeedLabel');
        if (labelEl) labelEl.textContent = tickerSpeedLabel(tickerSpeedEl.value);
      });
    }

    var tickerSpeedResetBtn = $('tickerSpeedResetBtn');
    if (tickerSpeedResetBtn) {
      tickerSpeedResetBtn.addEventListener('click', function() {
        var speedEl = $('tickerSpeed');
        if (speedEl) speedEl.value = DEFAULT_TICKER_SPEED;
        var labelEl = $('tickerSpeedLabel');
        if (labelEl) labelEl.textContent = tickerSpeedLabel(DEFAULT_TICKER_SPEED);
      });
    }

    var saveTickerConfigBtn = $('saveTickerConfigBtn');
    if (saveTickerConfigBtn) {
      saveTickerConfigBtn.addEventListener('click', saveTickerConfig);
    }
    var downloadTickerConfigBtn = $('downloadTickerConfigBtn');
    if (downloadTickerConfigBtn) {
      downloadTickerConfigBtn.addEventListener('click', downloadHomeConfig);
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

    var digestSaveBtn = $('digestSaveBtn');
    if (digestSaveBtn) {
      digestSaveBtn.addEventListener('click', saveDigestSettings);
    }
    var digestSendTest = $('digestSendTest');
    if (digestSendTest) {
      digestSendTest.addEventListener('click', sendTestDigest);
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
    loadDigestSettings();
    console.log("[tc-settings] Settings page initialized");
  }

  // Run initialization
  init();
})();
