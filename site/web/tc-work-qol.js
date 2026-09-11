/* BEGIN rc-tc-work-qol loader + stabilization guards */
(() => {
  "use strict";

  if (!location.pathname.startsWith("/teacher/work")) return;

  const TAG = "[tc-work-qol-loader]";
  const CORE_SRC = "/web/tc-work-qol-core.js";
  const DRAFT_STORAGE_KEY = "rc_tc_work_drafts_v1";
  const NativeMutationObserver = window.MutationObserver;

  class WorkScopedMutationObserver extends NativeMutationObserver {
    observe(target, options = {}) {
      if (target?.id === "draftsTbody" && options.childList && options.subtree) {
        return super.observe(target, { ...options, subtree: false });
      }
      return super.observe(target, options);
    }
  }

  // Keep this page-local guard active for the lifetime of Work. It changes only
  // observers attached to the drafts tbody, leaving every other observer alone.
  window.MutationObserver = WorkScopedMutationObserver;

  const norm = (value) => String(value || "").trim().toLowerCase();

  function readDrafts() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      const value = raw ? JSON.parse(raw) : [];
      return Array.isArray(value)
        ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item))
        : [];
    } catch (_) {
      return [];
    }
  }

  function dateMs(value) {
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function orderedBatches() {
    const grouped = new Map();
    for (const draft of readDrafts()) {
      if (!draft.batchId) continue;
      if (!grouped.has(draft.batchId)) grouped.set(draft.batchId, []);
      grouped.get(draft.batchId).push(draft);
    }
    return Array.from(grouped, ([batchId, drafts]) => ({ batchId, drafts })).sort(
      (a, b) =>
        Math.max(...b.drafts.map((draft) => dateMs(draft.createdAt))) -
        Math.max(...a.drafts.map((draft) => dateMs(draft.createdAt)))
    );
  }

  function patchBatchClassMetadata() {
    const batchRows = Array.from(
      document.querySelectorAll('#draftsTbody tr[data-rc-work-kind="batch"]')
    );
    const batches = orderedBatches();

    batchRows.forEach((row, index) => {
      const classes = Array.from(
        new Set((batches[index]?.drafts || []).map((draft) => norm(draft.className)).filter(Boolean))
      );
      row.dataset.rcWorkClasses = classes.join("|");
    });
  }

  function rowPassesNonClassFilters(row, statusFilter, search) {
    if (!row || row.dataset.rcWorkStatus === "completed") return false;
    if (statusFilter !== "all" && row.dataset.rcWorkStatus !== statusFilter) return false;
    if (search && !String(row.dataset.rcWorkSearch || "").includes(search)) return false;
    return true;
  }

  function correctMultiClassFiltering() {
    const classSelect = document.getElementById("rcWorkClassFilter");
    const tbody = document.getElementById("draftsTbody");
    if (!classSelect || !tbody) return;

    patchBatchClassMetadata();

    const classFilter = classSelect.value;
    if (!classFilter || classFilter === "all") return;

    const statusFilter = document.getElementById("rcWorkStatusFilter")?.value || "all";
    const search = norm(document.getElementById("rcWorkSearch")?.value);
    const rows = Array.from(tbody.rows);
    let batchVisible = true;

    for (const row of rows) {
      const kind = row.dataset.rcWorkKind;
      if (kind === "batch") {
        const classes = String(row.dataset.rcWorkClasses || row.dataset.rcWorkClass || "")
          .split("|")
          .filter(Boolean);
        batchVisible =
          classes.includes(classFilter) && rowPassesNonClassFilters(row, statusFilter, search);
        row.hidden = !batchVisible;
        continue;
      }

      if (kind === "child") {
        const classes = String(row.dataset.rcWorkClass || "").split("|").filter(Boolean);
        row.hidden = !(
          batchVisible &&
          classes.includes(classFilter) &&
          rowPassesNonClassFilters(row, statusFilter, search)
        );
        continue;
      }

      const classes = String(row.dataset.rcWorkClass || "").split("|").filter(Boolean);
      row.hidden = !(
        classes.includes(classFilter) && rowPassesNonClassFilters(row, statusFilter, search)
      );
    }
  }

  function installImportResetGuard() {
    document.addEventListener(
      "click",
      (event) => {
        const button = event.target?.closest?.(".rc-work-launch-btn");
        if (!button || !String(button.textContent || "").includes("Import Assignment")) return;

        const cancel = document.getElementById("btnCancelEdit");
        if (cancel && getComputedStyle(cancel).display !== "none") cancel.click();
      },
      true
    );
  }

  function installFilterCorrection() {
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(correctMultiClassFiltering, 0);
    };

    document.addEventListener("change", (event) => {
      if (["rcWorkClassFilter", "rcWorkStatusFilter"].includes(event.target?.id)) schedule();
    });
    document.addEventListener("input", (event) => {
      if (event.target?.id === "rcWorkSearch") schedule();
    });

    const tbody = document.getElementById("draftsTbody");
    if (tbody) {
      const observer = new NativeMutationObserver(schedule);
      observer.observe(tbody, { childList: true });
    }

    schedule();
  }

  import(CORE_SRC)
    .then(() => {
      installImportResetGuard();
      installFilterCorrection();
      console.log(TAG, "Loaded ✓ (edit/import guard + observer guard + multi-class filter guard)");
    })
    .catch((error) => {
      window.MutationObserver = NativeMutationObserver;
      console.error(TAG, "Failed to load Work QoL core", error);
    });
})();
/* END rc-tc-work-qol loader + stabilization guards */
