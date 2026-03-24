(async () => {
  "use strict";

  if (!location.pathname.startsWith("/teacher/substitute")) return;

  console.log("[tc-substitute] Phase 3 initializing");

  const {
    upsertSubPlan,
    listSubPlans,
    deleteSubPlan,
    listSubPlanPeriods,
    upsertSubPlanPeriods,
    listSubPlanTemplates,
    upsertSubPlanTemplate,
    deleteSubPlanTemplate
  } = await import("/web/sub-plans.js");

  const { getSchedule } = await import("/web/class-schedule.js");

  const $ = (id) => document.getElementById(id);

  // ─── State ─────────────────────────────────────────────────────────────────

  let editingDate = null;
  let editingPlanId = null;
  let allPlans = [];
  let allTemplates = [];
  let schedule = null;
  let currentMode = "subject"; // 'subject' | 'period'

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // ─── Utilities ──────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = String(str ?? "");
    return d.innerHTML;
  }

  /** Only allow http/https URLs to prevent javascript:/data: XSS in href attrs. */
  function safeUrl(url) {
    try {
      const u = new URL(String(url));
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : "#";
    } catch {
      return "#";
    }
  }

  function getTodayStr() {
    const now = new Date();
    return now.getFullYear() + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0");
  }

  function showMsg(text, type) {
    const el = $("subMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "sub-msg " + (type || "");
    el.style.display = text ? "block" : "none";
  }

  function getDayOfWeek(dateStr) {
    // Returns 0 (Sun) through 6 (Sat) — matches JavaScript getDay() and the
    // day_of_week column in sub_plan_templates (0=Sunday … 6=Saturday).
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }

  function chevronSvg(collapsed) {
    return `<svg class="sub-period-chevron${collapsed ? " collapsed" : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
  }

  // ─── Mode toggle ────────────────────────────────────────────────────────────

  function setMode(mode) {
    currentMode = mode;
    $("btnModeSubject").classList.toggle("active", mode === "subject");
    $("btnModePeriod").classList.toggle("active", mode === "period");
    $("subSubjectFields").style.display = mode === "subject" ? "" : "none";
    $("subPeriodFields").style.display = mode === "period" ? "" : "none";
    if (mode === "period" && schedule) {
      renderPeriodRows();
    }
    refreshTemplatePicker();
    updateDayHint();
  }

  $("btnModeSubject")?.addEventListener("click", () => setMode("subject"));
  $("btnModePeriod")?.addEventListener("click", () => {
    if (!schedule) {
      loadSchedule().then(() => setMode("period"));
    } else {
      setMode("period");
    }
  });

  // ─── Schedule ──────────────────────────────────────────────────────────────

  async function loadSchedule() {
    try {
      schedule = await getSchedule();
      if (currentMode === "period") renderPeriodRows();
    } catch (err) {
      console.error("[tc-substitute] Failed to load schedule:", err);
    }
  }

  function renderPeriodRows(existingPeriods = []) {
    const container = $("subPeriodRows");
    if (!container || !schedule) return;

    const periodMap = {};
    existingPeriods.forEach(p => { periodMap[p.period_hour] = p; });

    container.innerHTML = schedule.periods.map((period, i) => {
      const existing = periodMap[period.hour] || {};
      const isPlanning = !!period.isPlanning;
      const collapsed = isPlanning;
      const badgeClass = isPlanning ? "sub-period-badge planning" : "sub-period-badge";
      const badgeText = isPlanning ? "Planning" : `Hour ${period.hour}`;

      const subject = escapeHtml(existing.subject ?? period.label ?? "");
      const instructions = escapeHtml(existing.instructions || "");
      const presentationsVal = Array.isArray(existing.presentations)
        ? existing.presentations.join("\n")
        : (existing.presentations || "");
      const presentations = escapeHtml(presentationsVal);
      const materials = escapeHtml(existing.materials || "");

      return `
        <div class="sub-period-row" data-hour="${period.hour}">
          <div class="sub-period-header" role="button" tabindex="0"
               aria-expanded="${collapsed ? "false" : "true"}"
               onclick="tcSubTogglePeriod(this)"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tcSubTogglePeriod(this)}">
            <div class="sub-period-header-left">
              <span class="${badgeClass}">${escapeHtml(badgeText)}</span>
              <span class="sub-period-label">${escapeHtml(period.label)}</span>
              <span class="sub-period-time">${escapeHtml(period.start)}–${escapeHtml(period.end)}</span>
            </div>
            ${chevronSvg(collapsed)}
          </div>
          <div class="sub-period-body${collapsed ? " collapsed" : ""}">
            <div class="sub-period-grid">
              <div class="sub-field">
                <label>Subject</label>
                <input type="text" class="period-subject" data-hour="${period.hour}" value="${subject}" />
              </div>
              <div class="sub-field">
                <label>Materials</label>
                <input type="text" class="period-materials" data-hour="${period.hour}" value="${materials}" />
              </div>
            </div>
            <div class="sub-field">
              <label>Instructions</label>
              <textarea class="period-instructions" data-hour="${period.hour}" rows="3">${instructions}</textarea>
            </div>
            <div class="sub-field">
              <label>Presentations (one per line)</label>
              <textarea class="period-presentations" data-hour="${period.hour}" rows="2">${presentations}</textarea>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  window.tcSubTogglePeriod = function (header) {
    const body = header.nextElementSibling;
    if (!body) return;
    const nowCollapsed = body.classList.toggle("collapsed");
    header.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
    const chevron = header.querySelector(".sub-period-chevron");
    if (chevron) chevron.classList.toggle("collapsed", nowCollapsed);
  };

  function getPeriodFormData() {
    if (!schedule) return [];
    return schedule.periods.map((period, i) => {
      const subject = document.querySelector(`.period-subject[data-hour="${period.hour}"]`)?.value?.trim() || "";
      const instructions = document.querySelector(`.period-instructions[data-hour="${period.hour}"]`)?.value?.trim() || "";
      const presRaw = document.querySelector(`.period-presentations[data-hour="${period.hour}"]`)?.value?.trim() || "";
      const presentations = presRaw ? presRaw.split("\n").map(s => s.trim()).filter(Boolean) : [];
      const materials = document.querySelector(`.period-materials[data-hour="${period.hour}"]`)?.value?.trim() || "";
      return { period_hour: period.hour, subject, instructions, presentations, materials, sort_order: i };
    });
  }

  // ─── Template picker ────────────────────────────────────────────────────────

  async function loadTemplates() {
    try {
      allTemplates = await listSubPlanTemplates();
      refreshTemplatePicker();
    } catch (err) {
      console.error("[tc-substitute] Failed to load templates:", err);
    }
  }

  function refreshTemplatePicker() {
    const sel = $("subTemplateSelect");
    if (!sel) return;
    const modeTemplates = allTemplates.filter(t => t.plan_mode === currentMode);
    sel.innerHTML = `<option value="">— No Template —</option>` +
      modeTemplates.map(t => {
        const dayLabel = t.day_of_week != null ? ` (${DAY_NAMES[t.day_of_week]})` : "";
        return `<option value="${t.id}">${escapeHtml(t.name + dayLabel)}</option>`;
      }).join("");
    updateDeleteTemplateBtn();
    updateDayHint();
  }

  function updateDeleteTemplateBtn() {
    const btn = $("btnDeleteTemplate");
    if (!btn) return;
    btn.style.display = $("subTemplateSelect")?.value ? "" : "none";
  }

  $("subTemplateSelect")?.addEventListener("change", () => {
    updateDeleteTemplateBtn();
    updateDayHint();
  });

  function updateDayHint() {
    const hint = $("subTemplateDayHint");
    if (!hint) return;
    const dateStr = $("subDate")?.value;
    if (!dateStr) { hint.className = "sub-day-hint"; return; }
    const dow = getDayOfWeek(dateStr);
    const match = allTemplates.find(t => t.plan_mode === currentMode && t.day_of_week === dow);
    if (match) {
      hint.textContent = `💡 "${match.name}" matches ${DAY_NAMES[dow]}`;
      hint.className = "sub-day-hint visible";
    } else {
      hint.className = "sub-day-hint";
    }
  }

  $("btnLoadTemplate")?.addEventListener("click", () => {
    const sel = $("subTemplateSelect");
    if (!sel?.value) { showMsg("Select a template first.", ""); return; }
    const tmpl = allTemplates.find(t => String(t.id) === sel.value);
    if (!tmpl) return;
    if (tmpl.plan_mode !== currentMode) setMode(tmpl.plan_mode);
    if (currentMode === "subject" && tmpl.subject_data) {
      const sd = tmpl.subject_data;
      if ($("subLaLesson")) $("subLaLesson").value = sd.la_lesson || "";
      if ($("subLaBook")) $("subLaBook").value = sd.la_book || "";
      if ($("subLaPresentations")) $("subLaPresentations").value =
        Array.isArray(sd.la_presentations) ? sd.la_presentations.join("\n") : (sd.la_presentations || "");
      if ($("subLifeSkillsTopic")) $("subLifeSkillsTopic").value = sd.life_skills_topic || "";
      if ($("subLifeSkillsPresentations")) $("subLifeSkillsPresentations").value =
        Array.isArray(sd.life_skills_presentations) ? sd.life_skills_presentations.join("\n") : (sd.life_skills_presentations || "");
      if ($("subNotes")) $("subNotes").value = sd.notes || "";
    } else if (currentMode === "period" && tmpl.periods_data && schedule) {
      renderPeriodRows(tmpl.periods_data);
    }
    showMsg("Template loaded.", "ok");
  });

  $("btnSaveTemplate")?.addEventListener("click", async () => {
    const name = await rcPrompt("Save Template", "Enter a name for this template:", "e.g. Normal Day");
    if (!name?.trim()) return;
    const template = {
      name: name.trim(),
      plan_mode: currentMode,
      day_of_week: null,
      created_by: "teacher"
    };
    if (currentMode === "subject") {
      template.subject_data = {
        la_lesson: $("subLaLesson")?.value?.trim() || null,
        la_book: $("subLaBook")?.value?.trim() || null,
        la_presentations: ($("subLaPresentations")?.value?.trim() || "").split("\n").map(s => s.trim()).filter(Boolean),
        life_skills_topic: $("subLifeSkillsTopic")?.value?.trim() || null,
        life_skills_presentations: ($("subLifeSkillsPresentations")?.value?.trim() || "").split("\n").map(s => s.trim()).filter(Boolean),
        notes: $("subNotes")?.value?.trim() || null
      };
    } else {
      template.periods_data = getPeriodFormData();
    }
    try {
      await upsertSubPlanTemplate(template);
      await loadTemplates();
      showMsg("Template saved.", "ok");
    } catch (err) {
      console.error("[tc-substitute] Template save failed:", err);
      showMsg("Error saving template: " + err.message, "err");
    }
  });

  $("btnDeleteTemplate")?.addEventListener("click", async () => {
    const sel = $("subTemplateSelect");
    if (!sel?.value) return;
    const tmpl = allTemplates.find(t => String(t.id) === sel.value);
    if (!tmpl) return;
    if (!await rcConfirm("Delete Template", `Delete template "${tmpl.name}"?`, "Delete", { danger: true })) return;
    try {
      await deleteSubPlanTemplate(tmpl.id);
      await loadTemplates();
      showMsg("Template deleted.", "ok");
    } catch (err) {
      console.error("[tc-substitute] Template delete failed:", err);
      showMsg("Error deleting template: " + err.message, "err");
    }
  });

  // ─── Date change ────────────────────────────────────────────────────────────

  const dateInput = $("subDate");
  if (dateInput) {
    dateInput.value = getTodayStr();
    dateInput.addEventListener("change", () => {
      loadPlanForDate(dateInput.value);
      updateDayHint();
    });
  }

  $("subMultiDay")?.addEventListener("change", function () {
    const wrap = $("subEndDateWrap");
    if (wrap) wrap.style.display = this.checked ? "" : "none";
  });

  $("subSchedulePublish")?.addEventListener("change", function () {
    // TODO Phase 5: Read subSchedulePublish + subSchedulePublishTime and store as scheduled_publish_at on the plan
    const wrap = $("subSchedulePublishTimeWrap");
    if (wrap) wrap.style.display = this.checked ? "" : "none";
  });

  // ─── Plans list ─────────────────────────────────────────────────────────────

  async function loadPlans() {
    try {
      allPlans = await listSubPlans();
      renderPlansTable();
    } catch (err) {
      console.error("[tc-substitute] Failed to load plans:", err);
    }
  }

  function renderPlansTable() {
    const tbody = $("subPlansTbody");
    const table = $("subPlansTable");
    const empty = $("subPlansEmpty");
    if (!tbody || !table || !empty) return;

    if (allPlans.length === 0) {
      table.style.display = "none";
      empty.style.display = "block";
      return;
    }

    table.style.display = "";
    empty.style.display = "none";

    tbody.innerHTML = allPlans.map(plan => {
      const statusSvg = plan.published
        ? `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="var(--rc-brand)"/></svg>`
        : `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="var(--rc-muted)"/></svg>`;
      const statusLabel = plan.published ? "Published" : "Draft";
      const toggleLabel = plan.published ? "Unpublish" : "Publish";
      const mode = plan.plan_mode || "subject";
      const modeBadge = mode === "period"
        ? `<span class="sub-mode-badge period">Per-Period</span>`
        : `<span class="sub-mode-badge subject">Subject</span>`;
      const summary = mode === "period"
        ? "Per-Period Plan"
        : escapeHtml(plan.la_lesson || "—");

      return `<tr>
        <td>${escapeHtml(plan.plan_date)}</td>
        <td>${modeBadge}</td>
        <td>${summary}</td>
        <td style="white-space:nowrap">${statusSvg} ${escapeHtml(statusLabel)}</td>
        <td style="white-space:nowrap">
          <button class="sub-btn sub-btn-sm" type="button" onclick="tcSubEdit(${JSON.stringify(plan.plan_date)})">Edit</button>
          <button class="sub-btn sub-btn-sm" type="button" onclick="tcSubToggle(${JSON.stringify(plan.plan_date)}, ${plan.published})">${escapeHtml(toggleLabel)}</button>
          <button class="sub-btn sub-btn-sm danger" type="button" onclick="tcSubDelete(${JSON.stringify(plan.plan_date)})">Delete</button>
        </td>
      </tr>`;
    }).join("");
  }

  // ─── Form population / clear ────────────────────────────────────────────────

  function populateForm(plan, periods = []) {
    if (!plan) return;
    const d = $("subDate"); if (d) d.value = plan.plan_date || "";
    const mode = plan.plan_mode || "subject";
    setMode(mode);

    if (mode === "subject") {
      const ll = $("subLaLesson"); if (ll) ll.value = plan.la_lesson || "";
      const lb = $("subLaBook"); if (lb) lb.value = plan.la_book || "";
      const lp = $("subLaPresentations");
      if (lp) lp.value = Array.isArray(plan.la_presentations) ? plan.la_presentations.join("\n") : (plan.la_presentations || "");
      const ls = $("subLifeSkillsTopic"); if (ls) ls.value = plan.life_skills_topic || "";
      const lsp = $("subLifeSkillsPresentations");
      if (lsp) lsp.value = Array.isArray(plan.life_skills_presentations) ? plan.life_skills_presentations.join("\n") : (plan.life_skills_presentations || "");
      const n = $("subNotes"); if (n) n.value = plan.notes || "";
    } else if (schedule) {
      renderPeriodRows(periods);
    }

    const pub = $("subPublished"); if (pub) pub.checked = !!plan.published;
    updateDayHint();
  }

  function clearForm() {
    editingDate = null;
    editingPlanId = null;
    const form = $("subPlanForm");
    if (form) form.reset();
    const d = $("subDate"); if (d) d.value = getTodayStr();
    const endWrap = $("subEndDateWrap"); if (endWrap) endWrap.style.display = "none";
    const schedWrap = $("subSchedulePublishTimeWrap"); if (schedWrap) schedWrap.style.display = "none";
    setFormTitle("create");
    setMode("subject");
    showMsg("", "");
  }

  function setFormTitle(mode) {
    const isEdit = mode === "edit";
    const title = $("subFormTitle"); if (title) title.textContent = isEdit ? "Edit Plan" : "Create Plan";
    const save = $("btnSavePlan"); if (save) save.textContent = isEdit ? "Update Plan" : "Save Plan";
    const cancel = $("btnCancelEdit"); if (cancel) cancel.style.display = isEdit ? "" : "none";
  }

  function loadPlanForDate(dateStr) {
    const plan = allPlans.find(p => p.plan_date === dateStr);
    if (plan) {
      editingDate = dateStr;
      editingPlanId = plan.id || null;
      const mode = plan.plan_mode || "subject";
      if (mode === "period" && plan.id) {
        listSubPlanPeriods(plan.id).then(periods => {
          populateForm(plan, periods);
          setFormTitle("edit");
        }).catch(err => {
          console.error("[tc-substitute] Failed to load periods:", err);
          populateForm(plan, []);
          setFormTitle("edit");
        });
      } else {
        populateForm(plan, []);
        setFormTitle("edit");
      }
    } else {
      editingDate = null;
      editingPlanId = null;
      const form = $("subPlanForm"); if (form) form.reset();
      const d = $("subDate"); if (d) d.value = dateStr;
      setMode(currentMode);
      setFormTitle("create");
    }
    showMsg("", "");
  }

  // ─── Save ───────────────────────────────────────────────────────────────────

  async function saveSinglePlan(planDate, mode) {
    const plan = {
      plan_date: planDate,
      plan_mode: mode,
      published: !!$("subPublished")?.checked,
      created_by: "teacher"
    };
    if (mode === "subject") {
      plan.la_lesson = $("subLaLesson")?.value?.trim() || null;
      plan.la_book = $("subLaBook")?.value?.trim() || null;
      plan.la_presentations = $("subLaPresentations")?.value?.trim() || "";
      plan.life_skills_topic = $("subLifeSkillsTopic")?.value?.trim() || null;
      plan.life_skills_presentations = $("subLifeSkillsPresentations")?.value?.trim() || "";
      plan.notes = $("subNotes")?.value?.trim() || null;
    }
    // TODO Phase 5: Read subSchedulePublish + subSchedulePublishTime and store as scheduled_publish_at on the plan
    const savedPlan = await upsertSubPlan(plan);
    if (mode === "period" && savedPlan?.id) {
      await upsertSubPlanPeriods(savedPlan.id, getPeriodFormData());
    }
    return savedPlan;
  }

  async function buildPlanFromTemplate(planDate, tmpl) {
    const plan = {
      plan_date: planDate,
      plan_mode: tmpl.plan_mode || currentMode,
      published: !!$("subPublished")?.checked,
      created_by: "teacher"
    };
    if (plan.plan_mode === "subject" && tmpl.subject_data) {
      Object.assign(plan, tmpl.subject_data);
    }
    const savedPlan = await upsertSubPlan(plan);
    if (plan.plan_mode === "period" && savedPlan?.id && Array.isArray(tmpl.periods_data)) {
      await upsertSubPlanPeriods(savedPlan.id, tmpl.periods_data);
    }
    return savedPlan;
  }

  async function savePlan(e) {
    e.preventDefault();
    const planDate = ($("subDate")?.value || "").trim();
    if (!planDate) { showMsg("Plan date is required.", "err"); return; }

    const isMultiDay = !!$("subMultiDay")?.checked;
    const endDate = isMultiDay ? ($("subEndDate")?.value || "").trim() : "";
    const btn = $("btnSavePlan");

    if (btn) btn.disabled = true;

    try {
      if (isMultiDay && endDate && endDate >= planDate) {
        await saveMultiDayPlans(planDate, endDate);
      } else {
        showMsg("Saving…", "");
        await saveSinglePlan(planDate, currentMode);
        showMsg("Plan saved.", "ok");
        clearForm();
        await loadPlans();
      }
    } catch (err) {
      console.error("[tc-substitute] Save failed:", err);
      showMsg("Error saving plan: " + err.message, "err");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function saveMultiDayPlans(startDate, endDate) {
    if (!schedule) { schedule = await getSchedule(); }
    const schoolDays = schedule.schoolDays || [1, 2, 3, 4, 5];

    // Collect all school days in the range
    const dates = [];
    // Use T12:00:00 (noon local) so DST transitions don't shift the date when
    // iterating one day at a time via setDate().
    const cur = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");
    while (cur <= end) {
      if (schoolDays.includes(cur.getDay())) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const day = String(cur.getDate()).padStart(2, "0");
        dates.push(`${y}-${m}-${day}`);
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (dates.length === 0) {
      await rcAlert("No School Days", "No school days in the selected range (weekends excluded).");
      return;
    }

    const confirmed = await rcConfirm(
      "Create Multiple Plans",
      `Create ${dates.length} plan${dates.length === 1 ? "" : "s"} for ${startDate} to ${endDate}?\n\nEach school day will get a plan. Day-of-week templates will be applied automatically where available.`,
      "Create Plans"
    );
    if (!confirmed) return;

    showMsg(`Saving ${dates.length} plans…`, "");
    let saved = 0;
    for (const date of dates) {
      const dow = getDayOfWeek(date);
      const tmpl = allTemplates.find(t => t.plan_mode === currentMode && t.day_of_week === dow);
      if (tmpl) {
        await buildPlanFromTemplate(date, tmpl);
      } else {
        await saveSinglePlan(date, currentMode);
      }
      saved++;
    }

    showMsg(`${saved} plan${saved === 1 ? "" : "s"} saved.`, "ok");
    clearForm();
    await loadPlans();
  }

  // ─── Global table actions ───────────────────────────────────────────────────

  window.tcSubEdit = async function (planDate) {
    const plan = allPlans.find(p => p.plan_date === planDate);
    if (!plan) return;
    editingDate = planDate;
    editingPlanId = plan.id || null;
    let periods = [];
    if ((plan.plan_mode || "subject") === "period" && plan.id) {
      try { periods = await listSubPlanPeriods(plan.id); } catch (err) {
        console.error("[tc-substitute] Failed to load periods:", err);
      }
    }
    populateForm(plan, periods);
    setFormTitle("edit");
    showMsg("", "");
    $("subPlanForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.tcSubToggle = async function (planDate, currentPublished) {
    const plan = allPlans.find(p => p.plan_date === planDate);
    if (!plan) return;
    try {
      await upsertSubPlan({ ...plan, published: !currentPublished });
      await loadPlans();
    } catch (err) {
      console.error("[tc-substitute] Toggle failed:", err);
      await rcAlert("Error", "Error toggling publish status: " + err.message);
    }
  };

  window.tcSubDelete = async function (planDate) {
    if (!await rcConfirm("Delete Plan", `Delete plan for ${planDate}? This cannot be undone.`, "Delete", { danger: true })) return;
    try {
      await deleteSubPlan(planDate);
      if (editingDate === planDate) clearForm();
      await loadPlans();
    } catch (err) {
      console.error("[tc-substitute] Delete failed:", err);
      await rcAlert("Error", "Error deleting plan: " + err.message);
    }
  };

  // ─── Preview ────────────────────────────────────────────────────────────────

  function buildPreviewHtml() {
    const date = $("subDate")?.value || "";

    if (currentMode === "subject") {
      const laLesson = $("subLaLesson")?.value?.trim() || "";
      const laBook = $("subLaBook")?.value?.trim() || "";
      const laPres = $("subLaPresentations")?.value?.trim() || "";
      const lsTopic = $("subLifeSkillsTopic")?.value?.trim() || "";
      const lsPres = $("subLifeSkillsPresentations")?.value?.trim() || "";
      const notes = $("subNotes")?.value?.trim() || "";
      const hasContent = laLesson || laBook || laPres || lsTopic || lsPres || notes;

      return `
        <p style="font-size:12px;color:var(--rc-ink-dim);margin:0 0 14px">${escapeHtml(date)} — Subject-Based Plan</p>
        ${(laLesson || laBook || laPres) ? `
          <div class="sub-card" style="margin-bottom:10px">
            <div style="font-weight:600;margin-bottom:8px">Language Arts</div>
            ${laLesson ? `<div style="margin-bottom:4px"><span style="font-size:12px;color:var(--rc-ink-dim)">Lesson: </span>${escapeHtml(laLesson)}</div>` : ""}
            ${laBook ? `<div style="margin-bottom:4px"><span style="font-size:12px;color:var(--rc-ink-dim)">Book: </span>${escapeHtml(laBook)}</div>` : ""}
            ${laPres ? `<div style="margin-top:6px;font-size:12px;color:var(--rc-ink-dim)">Presentations:</div><pre style="font-size:12px;white-space:pre-wrap;margin:4px 0">${escapeHtml(laPres)}</pre>` : ""}
          </div>
        ` : ""}
        ${(lsTopic || lsPres) ? `
          <div class="sub-card" style="margin-bottom:10px">
            <div style="font-weight:600;margin-bottom:8px">Life Skills</div>
            ${lsTopic ? `<div style="margin-bottom:4px"><span style="font-size:12px;color:var(--rc-ink-dim)">Topic: </span>${escapeHtml(lsTopic)}</div>` : ""}
            ${lsPres ? `<div style="margin-top:6px;font-size:12px;color:var(--rc-ink-dim)">Presentations:</div><pre style="font-size:12px;white-space:pre-wrap;margin:4px 0">${escapeHtml(lsPres)}</pre>` : ""}
          </div>
        ` : ""}
        ${notes ? `
          <div class="sub-card">
            <div style="font-weight:600;margin-bottom:8px">Notes</div>
            <pre style="font-size:13px;white-space:pre-wrap;margin:0">${escapeHtml(notes)}</pre>
          </div>
        ` : ""}
        ${!hasContent ? `<p style="color:var(--rc-muted)">No content to preview.</p>` : ""}
      `;
    } else {
      if (!schedule) return `<p style="color:var(--rc-muted)">Schedule not loaded yet.</p>`;
      const periods = getPeriodFormData();
      const periodMap = {};
      periods.forEach(p => { periodMap[p.period_hour] = p; });

      return `
        <p style="font-size:12px;color:var(--rc-ink-dim);margin:0 0 14px">${escapeHtml(date)} — Per-Period Plan</p>
        ${schedule.periods.map(period => {
          const pd = periodMap[period.hour] || {};
          const hasData = pd.subject || pd.instructions || (pd.presentations && pd.presentations.length) || pd.materials;
          return `
            <div class="sub-card" style="margin-bottom:10px${period.isPlanning ? ";opacity:0.75" : ""}">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
                <span style="font-weight:600">${escapeHtml(period.label)}</span>
                <span style="font-size:11px;color:var(--rc-ink-dim)">${escapeHtml(period.start)}–${escapeHtml(period.end)}</span>
                ${period.isPlanning ? `<span style="font-size:11px;padding:1px 6px;border-radius:999px;background:rgba(234,179,8,.1);border:1px solid rgba(234,179,8,.3);color:rgba(234,179,8,.9)">Planning</span>` : ""}
              </div>
              ${hasData ? `
                ${pd.subject ? `<div style="margin-bottom:4px"><span style="font-size:12px;color:var(--rc-ink-dim)">Subject: </span>${escapeHtml(pd.subject)}</div>` : ""}
                ${pd.instructions ? `<div style="margin-bottom:4px"><span style="font-size:12px;color:var(--rc-ink-dim)">Instructions: </span><span style="white-space:pre-wrap">${escapeHtml(pd.instructions)}</span></div>` : ""}
                ${pd.presentations && pd.presentations.length ? `<div style="margin-bottom:4px"><span style="font-size:12px;color:var(--rc-ink-dim)">Presentations: </span>${pd.presentations.map(p => `<a href="${safeUrl(p)}" target="_blank" rel="noopener" style="color:var(--rc-brand)">${escapeHtml(p)}</a>`).join(", ")}</div>` : ""}
                ${pd.materials ? `<div><span style="font-size:12px;color:var(--rc-ink-dim)">Materials: </span>${escapeHtml(pd.materials)}</div>` : ""}
              ` : `<p style="font-size:12px;color:var(--rc-muted);margin:0">No instructions entered.</p>`}
            </div>
          `;
        }).join("")}
      `;
    }
  }

  $("btnPreview")?.addEventListener("click", () => {
    const overlay = $("subPreviewOverlay");
    const content = $("subPreviewContent");
    if (!overlay || !content) return;
    content.innerHTML = buildPreviewHtml();
    overlay.classList.add("open");
    overlay.scrollTop = 0;
    // Move focus into the dialog for keyboard accessibility
    const closeBtn = $("btnClosePreview");
    if (closeBtn) closeBtn.focus();
  });

  $("btnClosePreview")?.addEventListener("click", () => {
    $("subPreviewOverlay")?.classList.remove("open");
    $("btnPreview")?.focus();
  });

  $("subPreviewOverlay")?.addEventListener("click", (e) => {
    if (e.target === $("subPreviewOverlay")) {
      $("subPreviewOverlay")?.classList.remove("open");
      $("btnPreview")?.focus();
    }
  });

  $("subPreviewOverlay")?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("subPreviewOverlay")?.classList.remove("open");
      $("btnPreview")?.focus();
    }
  });

  // ─── Form event listeners ───────────────────────────────────────────────────

  const form = $("subPlanForm");
  if (form) form.addEventListener("submit", savePlan);

  $("btnClearForm")?.addEventListener("click", clearForm);
  $("btnCancelEdit")?.addEventListener("click", clearForm);

  // ─── Init ───────────────────────────────────────────────────────────────────

  await Promise.all([loadSchedule(), loadTemplates(), loadPlans()]);
  loadPlanForDate(getTodayStr());
})();
