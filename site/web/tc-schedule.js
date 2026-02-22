(async () => {
  "use strict";

  if (!location.pathname.startsWith("/teacher/schedule")) return;

  console.log("[tc-schedule] Initializing schedule editor");

  const { getSchedule, upsertSchedule } = await import("/web/class-schedule.js");

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = String(str ?? "");
    return d.innerHTML;
  }

  function showMsg(text, type) {
    const el = $("schedMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "sub-msg " + (type || "");
    el.style.display = text ? "block" : "none";
  }

  /**
   * Build a table row element for a period
   * @param {Object} period
   * @param {number} index
   * @returns {HTMLTableRowElement}
   */
  function buildRow(period, index) {
    const tr = document.createElement("tr");
    tr.dataset.index = String(index);

    tr.innerHTML =
      `<td><input class="sched-input sched-input-sm" type="number" min="1" max="20" name="hour" value="${escapeHtml(String(period.hour || index + 1))}" /></td>` +
      `<td><input class="sched-input" type="time" name="start" value="${escapeHtml(period.start || "")}" /></td>` +
      `<td><input class="sched-input" type="time" name="end" value="${escapeHtml(period.end || "")}" /></td>` +
      `<td><input class="sched-input sched-input-wide" type="text" name="label" value="${escapeHtml(period.label || "")}" maxlength="80" /></td>` +
      `<td style="text-align:center"><input type="checkbox" name="isPlanning" ${period.isPlanning ? "checked" : ""} /></td>` +
      `<td><button class="sub-btn sub-btn-sm danger" type="button" aria-label="Delete row">✕</button></td>`;

    const deleteBtn = tr.querySelector("button");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", function () {
        tr.remove();
      });
    }

    return tr;
  }

  /**
   * Render all rows from the current schedule
   * @param {Array} periods
   */
  function renderTable(periods) {
    const tbody = $("schedTbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    periods.forEach(function (p, i) {
      tbody.appendChild(buildRow(p, i));
    });
  }

  /**
   * Collect all period data from the table
   * @returns {Array}
   */
  function collectRows() {
    const tbody = $("schedTbody");
    if (!tbody) return [];
    const rows = [];
    tbody.querySelectorAll("tr").forEach(function (tr) {
      const hourInput = tr.querySelector('[name="hour"]');
      const startInput = tr.querySelector('[name="start"]');
      const endInput = tr.querySelector('[name="end"]');
      const labelInput = tr.querySelector('[name="label"]');
      const planningInput = tr.querySelector('[name="isPlanning"]');
      if (!hourInput || !startInput || !endInput || !labelInput) return;
      rows.push({
        hour: parseInt(hourInput.value, 10) || 0,
        start: startInput.value,
        end: endInput.value,
        label: labelInput.value.trim(),
        isPlanning: planningInput ? planningInput.checked : false
      });
    });
    return rows;
  }

  /**
   * Add a blank row to the table
   */
  function addRow() {
    const tbody = $("schedTbody");
    if (!tbody) return;
    const rowCount = tbody.querySelectorAll("tr").length;
    const newPeriod = { hour: rowCount + 1, start: "", end: "", label: "", isPlanning: false };
    tbody.appendChild(buildRow(newPeriod, rowCount));
  }

  /**
   * Save the schedule to Supabase
   */
  async function saveSchedule() {
    const periods = collectRows();
    if (periods.length === 0) {
      showMsg("No periods to save.", "err");
      return;
    }

    const saveBtn = $("btnSaveSchedule");
    if (saveBtn) saveBtn.disabled = true;
    showMsg("Saving…", "");

    try {
      await upsertSchedule(periods);
      showMsg("Schedule saved.", "ok");
    } catch (err) {
      console.error("[tc-schedule] Save failed:", err);
      showMsg("Error saving schedule: " + err.message, "err");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  /**
   * Clear the table
   */
  function clearTable() {
    if (!confirm("Clear all periods from the table? Unsaved changes will be lost.")) return;
    const tbody = $("schedTbody");
    if (tbody) tbody.innerHTML = "";
    showMsg("", "");
  }

  // Load schedule and render
  try {
    const schedule = await getSchedule();
    renderTable(schedule.periods || []);
  } catch (err) {
    console.error("[tc-schedule] Failed to load schedule:", err);
    showMsg("Failed to load schedule data.", "err");
  }

  // Event listeners
  const addBtn = $("btnAddRow");
  if (addBtn) addBtn.addEventListener("click", addRow);

  const saveBtn = $("btnSaveSchedule");
  if (saveBtn) saveBtn.addEventListener("click", saveSchedule);

  const clearBtn = $("btnClearSchedule");
  if (clearBtn) clearBtn.addEventListener("click", clearTable);
})();
