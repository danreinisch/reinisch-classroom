(async () => {
  "use strict";

  if (!location.pathname.startsWith("/teacher/schedule")) return;

  console.log("[tc-schedule] Initializing schedule editor");

  const { getSchedule, upsertSchedule } = await import("/web/class-schedule.js");

  const $ = (id) => document.getElementById(id);

  let currentPeriods = [];

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

  async function loadSchedule() {
    showMsg("Loading schedule…", "");
    try {
      const schedule = await getSchedule();
      currentPeriods = schedule.periods ? schedule.periods.map(p => ({ ...p })) : [];
      renderTable();
      showMsg("", "");
    } catch (err) {
      console.error("[tc-schedule] Failed to load schedule:", err);
      showMsg("Error loading schedule: " + err.message, "err");
    }
  }

  function renderTable() {
    const tbody = $("schedTbody");
    const empty = $("schedEmpty");
    const table = $("schedTable");
    if (!tbody || !empty || !table) return;

    if (currentPeriods.length === 0) {
      table.style.display = "none";
      empty.style.display = "block";
      return;
    }

    table.style.display = "";
    empty.style.display = "none";

    tbody.innerHTML = "";
    currentPeriods.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.dataset.index = i;
      tr.innerHTML = `
        <td><input class="sub-field-input" type="number" name="hour" min="1" max="99" value="${escapeHtml(p.hour)}" aria-label="Hour number for period ${i + 1}" /></td>
        <td><input class="sub-field-input" type="time" name="start" value="${escapeHtml(p.start)}" aria-label="Start time for period ${i + 1}" /></td>
        <td><input class="sub-field-input" type="time" name="end" value="${escapeHtml(p.end)}" aria-label="End time for period ${i + 1}" /></td>
        <td><input class="sub-field-input" type="text" name="label" value="${escapeHtml(p.label)}" maxlength="120" aria-label="Label for period ${i + 1}" /></td>
        <td style="text-align:center"><input type="checkbox" name="isPlanning" ${p.isPlanning ? "checked" : ""} aria-label="Planning period ${i + 1}" /></td>
        <td><button class="sub-btn sub-btn-sm danger" type="button" data-action="delete" data-index="${i}" aria-label="Delete period ${i + 1}">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });

    // Wire delete buttons without inline handlers
    tbody.querySelectorAll("[data-action='delete']").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index, 10);
        currentPeriods.splice(idx, 1);
        renderTable();
      });
    });
  }

  function collectTableData() {
    const tbody = $("schedTbody");
    if (!tbody) return [];
    const rows = Array.from(tbody.querySelectorAll("tr"));
    return rows.map(tr => {
      const hour = parseInt(tr.querySelector("input[name='hour']")?.value, 10) || 0;
      const start = tr.querySelector("input[name='start']")?.value || "";
      const end = tr.querySelector("input[name='end']")?.value || "";
      const label = tr.querySelector("input[name='label']")?.value || "";
      const isPlanning = tr.querySelector("input[name='isPlanning']")?.checked || false;
      return { hour, start, end, label, isPlanning };
    });
  }

  async function saveSchedule() {
    const periods = collectTableData();

    if (periods.length === 0) {
      showMsg("Add at least one period before saving.", "err");
      return;
    }

    for (const p of periods) {
      if (!p.start || !p.end || !p.label.trim()) {
        showMsg("All periods must have a start time, end time, and label.", "err");
        return;
      }
    }

    const btn = $("btnSaveSchedule");
    if (btn) btn.disabled = true;
    showMsg("Saving…", "");

    try {
      await upsertSchedule(periods);
      currentPeriods = periods;
      showMsg("Schedule saved.", "ok");
      renderTable();
    } catch (err) {
      console.error("[tc-schedule] Save failed:", err);
      showMsg("Error saving schedule: " + err.message, "err");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function addRow() {
    const lastHour = currentPeriods.length > 0 ? currentPeriods[currentPeriods.length - 1].hour : 0;
    currentPeriods.push({
      hour: Math.min(lastHour + 1, 99),
      start: "",
      end: "",
      label: "",
      isPlanning: false
    });
    renderTable();
    // Focus the new row's hour input
    const tbody = $("schedTbody");
    if (tbody) {
      const lastRow = tbody.querySelector("tr:last-child");
      if (lastRow) lastRow.querySelector("input[name='hour']")?.focus();
    }
  }

  // Event listeners
  const addBtn = $("btnAddPeriod");
  if (addBtn) addBtn.addEventListener("click", addRow);

  const saveBtn = $("btnSaveSchedule");
  if (saveBtn) saveBtn.addEventListener("click", saveSchedule);

  // Initial load
  await loadSchedule();
})();
