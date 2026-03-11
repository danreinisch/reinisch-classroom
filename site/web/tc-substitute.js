(async () => {
  "use strict";

  if (!location.pathname.startsWith("/teacher/substitute")) return;

  console.log("[tc-substitute] Initializing substitute plans module");

  const { upsertSubPlan, listSubPlans, deleteSubPlan } = await import("/web/sub-plans.js");

  const $ = (id) => document.getElementById(id);

  let editingDate = null;
  let allPlans = [];

  // Set default date to today
  const today = new Date();
  const todayStr = today.getFullYear() + "-" +
    String(today.getMonth() + 1).padStart(2, "0") + "-" +
    String(today.getDate()).padStart(2, "0");
  const dateInput = $("subDate");
  if (dateInput) dateInput.value = todayStr;

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = String(str ?? "");
    return d.innerHTML;
  }

  function showMsg(text, type) {
    const el = $("subMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "sub-msg " + (type || "");
    el.style.display = text ? "block" : "none";
  }

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

      return `<tr>
        <td>${escapeHtml(plan.plan_date)}</td>
        <td>${escapeHtml(plan.la_lesson || "")}</td>
        <td>${escapeHtml(plan.life_skills_topic || "")}</td>
        <td style="white-space:nowrap">${statusSvg} ${escapeHtml(statusLabel)}</td>
        <td style="white-space:nowrap">
          <button class="sub-btn sub-btn-sm" type="button" onclick="tcSubEdit(${JSON.stringify(plan.plan_date)})">Edit</button>
          <button class="sub-btn sub-btn-sm" type="button" onclick="tcSubToggle(${JSON.stringify(plan.plan_date)}, ${plan.published})">${toggleLabel}</button>
          <button class="sub-btn sub-btn-sm danger" type="button" onclick="tcSubDelete(${JSON.stringify(plan.plan_date)})">Delete</button>
        </td>
      </tr>`;
    }).join("");
  }

  function populateForm(plan) {
    if (!plan) return;
    const d = $("subDate"); if (d) d.value = plan.plan_date || "";
    const ll = $("subLaLesson"); if (ll) ll.value = plan.la_lesson || "";
    const lb = $("subLaBook"); if (lb) lb.value = plan.la_book || "";
    const lp = $("subLaPresentations");
    if (lp) lp.value = Array.isArray(plan.la_presentations) ? plan.la_presentations.join("\n") : (plan.la_presentations || "");
    const ls = $("subLifeSkillsTopic"); if (ls) ls.value = plan.life_skills_topic || "";
    const lsp = $("subLifeSkillsPresentations");
    if (lsp) lsp.value = Array.isArray(plan.life_skills_presentations) ? plan.life_skills_presentations.join("\n") : (plan.life_skills_presentations || "");
    const n = $("subNotes"); if (n) n.value = plan.notes || "";
    const pub = $("subPublished"); if (pub) pub.checked = !!plan.published;
  }

  function clearForm() {
    editingDate = null;
    const form = $("subPlanForm");
    if (form) form.reset();
    const d = $("subDate"); if (d) d.value = todayStr;
    setFormMode("create");
    showMsg("", "");
  }

  async function savePlan(e) {
    e.preventDefault();
    const plan = {
      plan_date: ($("subDate")?.value || "").trim(),
      la_lesson: ($("subLaLesson")?.value || "").trim(),
      la_book: ($("subLaBook")?.value || "").trim(),
      la_presentations: ($("subLaPresentations")?.value || "").trim(),
      life_skills_topic: ($("subLifeSkillsTopic")?.value || "").trim(),
      life_skills_presentations: ($("subLifeSkillsPresentations")?.value || "").trim(),
      notes: ($("subNotes")?.value || "").trim(),
      published: !!$("subPublished")?.checked,
      created_by: "teacher",
    };

    if (!plan.plan_date) {
      showMsg("Plan date is required.", "err");
      return;
    }

    const btn = $("btnSavePlan");
    if (btn) btn.disabled = true;
    showMsg("Saving…", "");

    try {
      await upsertSubPlan(plan);
      showMsg("Plan saved.", "ok");
      clearForm();
      await loadPlans();
    } catch (err) {
      console.error("[tc-substitute] Save failed:", err);
      showMsg("Error saving plan: " + err.message, "err");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function setFormMode(mode) {
    const isEdit = mode === "edit";
    const title = $("subFormTitle"); if (title) title.textContent = isEdit ? "Edit Plan" : "Create Plan";
    const save = $("btnSavePlan"); if (save) save.textContent = isEdit ? "Update Plan" : "Save Plan";
    const cancel = $("btnCancelEdit"); if (cancel) cancel.style.display = isEdit ? "" : "none";
  }

  // Load an existing plan for a given date into the form (teacher view loads all plans incl. drafts)
  function loadPlanForDate(dateStr) {
    const plan = allPlans.find(p => p.plan_date === dateStr);
    if (plan) {
      editingDate = dateStr;
      populateForm(plan);
      setFormMode("edit");
    } else {
      // No existing plan for this date — clear editing state but keep date
      editingDate = null;
      const form = $("subPlanForm"); if (form) form.reset();
      const d = $("subDate"); if (d) d.value = dateStr;
      setFormMode("create");
    }
    showMsg("", "");
  }

  // Global handlers for table buttons
  window.tcSubEdit = function(planDate) {
    const plan = allPlans.find(p => p.plan_date === planDate);
    if (!plan) return;
    editingDate = planDate;
    populateForm(plan);
    setFormMode("edit");
    showMsg("", "");
    $("subPlanForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.tcSubToggle = async function(planDate, currentPublished) {
    const plan = allPlans.find(p => p.plan_date === planDate);
    if (!plan) return;
    try {
      await upsertSubPlan({ ...plan, published: !currentPublished });
      await loadPlans();
    } catch (err) {
      console.error("[tc-substitute] Toggle failed:", err);
      await rcAlert('Error', 'Error toggling publish status: ' + err.message);
    }
  };

  window.tcSubDelete = async function(planDate) {
    if (!await rcConfirm('Delete Plan', 'Delete plan for ' + planDate + '? This cannot be undone.', 'Delete', { danger: true })) return;
    try {
      await deleteSubPlan(planDate);
      if (editingDate === planDate) clearForm();
      await loadPlans();
    } catch (err) {
      console.error("[tc-substitute] Delete failed:", err);
      await rcAlert('Error', 'Error deleting plan: ' + err.message);
    }
  };

  // Event listeners
  const form = $("subPlanForm");
  if (form) form.addEventListener("submit", savePlan);

  const clearBtn = $("btnClearForm");
  if (clearBtn) clearBtn.addEventListener("click", clearForm);

  const cancelBtn = $("btnCancelEdit");
  if (cancelBtn) cancelBtn.addEventListener("click", clearForm);

  if (dateInput) {
    dateInput.addEventListener("change", () => {
      loadPlanForDate(dateInput.value);
    });
  }

  // Initial load
  await loadPlans();
  // Populate form with today's plan if one exists
  loadPlanForDate(todayStr);
})();
