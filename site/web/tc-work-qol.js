/* BEGIN rc-tc-work-qol v2 */
(() => {
  "use strict";

  if (!location.pathname.startsWith("/teacher/work")) return;

  const TAG = "[tc-work-qol]";
  const DRAFT_STORAGE_KEY = "rc_tc_work_drafts_v1";
  const SHOW_ISSUED_KEY = "rc_tc_work_show_issued_v1";
  const TERMINAL_STATUSES = new Set(["Graded", "Reviewed"]);
  const CLASS_LABELS = [
    "Language Arts 1 SC",
    "Language Arts 2 SC",
    "Language Arts 3 SC",
    "Language Arts 4 SC",
    "Life Skills Language Arts SC",
    "Transitional Skills",
  ];

  const state = {
    search: "",
    classFilter: "all",
    statusFilter: "all",
    instances: [],
    lifecycleReady: false,
    enhancing: false,
    observer: null,
    lastLifecycleRefresh: 0,
    refreshTimer: null,
  };

  const $ = (id) => document.getElementById(id);
  const norm = (value) => String(value || "").trim().toLowerCase();
  const log = (...args) => console.log(TAG, ...args);

  const ready = (fn) => {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  };

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
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  function isFutureScheduled(draft, now = Date.now()) {
    if (!draft || draft.issuedAt || !draft.autoRelease) return false;
    const releaseMs = dateMs(draft.releaseAt);
    return releaseMs !== null && releaseMs > now;
  }

  function instancesForDraft(draft) {
    if (!draft || !draft.assignmentId) return [];
    const assignmentId = String(draft.assignmentId);
    return state.instances.filter(
      (instance) => String(instance.assignment_id || instance.assignmentId || "") === assignmentId
    );
  }

  function deriveDraftStatus(draft, now = Date.now()) {
    if (!draft) return "draft";
    if (!draft.issuedAt) return isFutureScheduled(draft, now) ? "scheduled" : "draft";

    const instances = instancesForDraft(draft);
    if (
      state.lifecycleReady &&
      instances.length > 0 &&
      instances.every((instance) => TERMINAL_STATUSES.has(String(instance.status || "")))
    ) {
      return "completed";
    }

    return "active";
  }

  function progressForDraft(draft) {
    const instances = instancesForDraft(draft);
    if (instances.length > 0) {
      const reviewed = instances.filter((instance) =>
        TERMINAL_STATUSES.has(String(instance.status || ""))
      ).length;
      return {
        total: instances.length,
        reviewed,
        remaining: Math.max(0, instances.length - reviewed),
      };
    }

    const codes = Array.isArray(draft?.studentCodes)
      ? draft.studentCodes.filter(Boolean)
      : String(draft?.studentCodes || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

    return {
      total: codes.length,
      reviewed: 0,
      remaining: codes.length,
    };
  }

  function aggregateBatchStatus(drafts) {
    const statuses = drafts.map((draft) => deriveDraftStatus(draft));
    if (statuses.length > 0 && statuses.every((status) => status === "completed")) {
      return "completed";
    }
    if (statuses.some((status) => status === "active")) return "active";
    if (statuses.some((status) => status === "draft")) return "draft";
    if (statuses.some((status) => status === "scheduled")) return "scheduled";
    return "draft";
  }

  function batchProgress(drafts) {
    const seenAssignmentIds = new Set();
    let total = 0;
    let reviewed = 0;

    for (const draft of drafts) {
      if (draft.assignmentId) {
        const key = String(draft.assignmentId);
        if (seenAssignmentIds.has(key)) continue;
        seenAssignmentIds.add(key);
      }
      const progress = progressForDraft(draft);
      total += progress.total || 0;
      reviewed += progress.reviewed || 0;
    }

    if (total === 0 && drafts.length > 0) total = drafts.length;

    return {
      total,
      reviewed,
      remaining: Math.max(0, total - reviewed),
    };
  }

  function renderModel(drafts = readDrafts()) {
    const batchMap = new Map();
    const ungrouped = [];

    for (const draft of drafts) {
      if (draft.batchId) {
        if (!batchMap.has(draft.batchId)) batchMap.set(draft.batchId, []);
        batchMap.get(draft.batchId).push(draft);
      } else {
        ungrouped.push(draft);
      }
    }

    const batches = Array.from(batchMap, ([batchId, bDrafts]) => ({
      batchId,
      drafts: bDrafts,
    })).sort((a, b) => {
      const latestA = Math.max(
        ...a.drafts.map((draft) => dateMs(draft.createdAt) || 0)
      );
      const latestB = Math.max(
        ...b.drafts.map((draft) => dateMs(draft.createdAt) || 0)
      );
      return latestB - latestA;
    });

    ungrouped.sort(
      (a, b) => (dateMs(b.createdAt) || 0) - (dateMs(a.createdAt) || 0)
    );

    return { batches, ungrouped };
  }

  function logicalItems(drafts = readDrafts()) {
    const model = renderModel(drafts);
    const items = model.batches.map((batch) => ({
      type: "batch",
      key: `batch:${batch.batchId}`,
      drafts: batch.drafts,
      status: aggregateBatchStatus(batch.drafts),
    }));

    for (const draft of model.ungrouped) {
      items.push({
        type: "draft",
        key: `draft:${draft.id || draft.title || Math.random()}`,
        drafts: [draft],
        status: deriveDraftStatus(draft),
      });
    }

    return items;
  }

  function statusMeta(status) {
    const map = {
      draft: { label: "Draft", tone: "draft" },
      scheduled: { label: "Scheduled", tone: "scheduled" },
      active: { label: "Active", tone: "active" },
      completed: { label: "Completed", tone: "completed" },
    };
    return map[status] || map.draft;
  }

  function formatShortDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatShortDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function findClassSelect() {
    const direct = $("draftClass");
    if (direct) return direct;

    return (
      Array.from(document.querySelectorAll("select")).find((select) => {
        const labels = Array.from(select.options || []).map((option) =>
          String(option.textContent || "").trim()
        );
        return labels.includes("LA 1 SC") && labels.includes("LA 4 SC");
      }) || null
    );
  }

  function ensureTransitionalSkillsOption(classSelect) {
    if (!classSelect) return;
    const labels = Array.from(classSelect.options).map((option) =>
      String(option.textContent || "").trim()
    );
    if (labels.includes("Transitional Skills")) return;

    const option = document.createElement("option");
    option.value = "Transitional Skills";
    option.textContent = "Transitional Skills";

    const lifeSkillsIndex = labels.findIndex((label) =>
      ["Life Skills LA", "Life Skills Language Arts SC"].includes(label)
    );
    if (lifeSkillsIndex >= 0 && classSelect.options[lifeSkillsIndex]) {
      classSelect.add(option, classSelect.options[lifeSkillsIndex]);
    } else {
      classSelect.add(option);
    }
  }

  function forceCloseModals() {
    document.addEventListener(
      "click",
      (event) => {
        const button = event.target?.closest?.("button, a");
        if (!button || norm(button.textContent) !== "close") return;

        const modal =
          button.closest("[role='dialog']") ||
          button.closest("dialog") ||
          button.closest(".modal") ||
          button.closest(".rc-modal") ||
          button.closest(".overlay") ||
          button.closest("[data-modal]");

        if (!modal || modal.id === "draftOverlay" || modal.closest("#draftOverlay")) return;

        event.preventDefault();
        event.stopPropagation();
        if (modal.id) modal.hidden = true;
        else modal.remove();
      },
      true
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;

        const dialog = document.querySelector(
          "dialog[open]:not([hidden]), [role='dialog']:not([hidden]), .modal:not([hidden]), .rc-modal:not([hidden]), .overlay:not([hidden]), [data-modal]:not([hidden])"
        );
        if (!dialog || dialog.id === "draftOverlay" || dialog.closest("#draftOverlay")) return;

        if (dialog.id) dialog.hidden = true;
        else dialog.remove?.();
      },
      true
    );
  }

  function injectStyles() {
    if ($("rcWorkCommandCenterStyles")) return;

    const style = document.createElement("style");
    style.id = "rcWorkCommandCenterStyles";
    style.textContent = `
      .rc-work-command-center {
        margin: 18px 0 14px;
        display: grid;
        gap: 14px;
      }
      .rc-work-launch-row {
        display: grid;
        grid-template-columns: minmax(210px, 255px) minmax(210px, 255px) 1fr;
        gap: 12px;
        align-items: stretch;
      }
      .rc-work-launch-btn,
      .rc-work-tip,
      .rc-work-status-card {
        border: 1px solid rgba(134, 239, 172, .2);
        background: linear-gradient(180deg, rgba(5, 54, 44, .88), rgba(3, 38, 33, .9));
        color: inherit;
        border-radius: 12px;
        box-shadow: 0 16px 35px rgba(0,0,0,.12);
      }
      .rc-work-launch-btn {
        min-height: 62px;
        padding: 0 18px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        text-align: left;
        transition: transform .15s ease, border-color .15s ease, background .15s ease;
      }
      .rc-work-launch-btn:hover {
        transform: translateY(-1px);
        border-color: rgba(110, 231, 183, .5);
        background: linear-gradient(180deg, rgba(11, 87, 67, .94), rgba(5, 57, 46, .94));
      }
      .rc-work-launch-btn.primary {
        background: linear-gradient(180deg, rgba(21, 122, 78, .96), rgba(10, 86, 60, .96));
        border-color: rgba(134, 239, 172, .5);
      }
      .rc-work-launch-icon {
        width: 34px;
        height: 34px;
        border-radius: 9px;
        display: grid;
        place-items: center;
        background: rgba(255,255,255,.08);
        font-size: 21px;
        line-height: 1;
      }
      .rc-work-tip {
        min-height: 62px;
        padding: 11px 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        color: rgba(235, 255, 247, .88);
      }
      .rc-work-tip strong {
        color: #fde68a;
        display: block;
        margin-bottom: 2px;
      }
      .rc-work-tip a {
        color: #a7f3d0;
        font-weight: 700;
        white-space: nowrap;
      }
      .rc-work-status-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }
      .rc-work-status-card {
        min-height: 88px;
        padding: 13px 15px;
        display: grid;
        grid-template-columns: 42px 1fr auto;
        align-items: center;
        gap: 10px;
        text-decoration: none;
        cursor: pointer;
        text-align: left;
        font: inherit;
      }
      .rc-work-status-card:hover,
      .rc-work-status-card[aria-pressed="true"] {
        border-color: rgba(110, 231, 183, .55);
        background: linear-gradient(180deg, rgba(9, 74, 59, .94), rgba(3, 47, 40, .94));
      }
      .rc-work-status-card[data-status="draft"] { border-color: rgba(248, 113, 113, .35); }
      .rc-work-status-card[data-status="scheduled"] { border-color: rgba(250, 204, 21, .32); }
      .rc-work-status-card[data-status="active"] { border-color: rgba(34, 211, 238, .3); }
      .rc-work-status-card[data-status="completed"] { border-color: rgba(74, 222, 128, .3); }
      .rc-work-status-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: rgba(255,255,255,.06);
        font-size: 20px;
      }
      .rc-work-status-title {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .01em;
      }
      .rc-work-status-count {
        margin-top: 2px;
        font-size: 24px;
        line-height: 1;
        font-weight: 800;
      }
      .rc-work-status-sub {
        margin-top: 4px;
        color: var(--rc-ink-dim, rgba(255,255,255,.65));
        font-size: 11px;
      }
      .rc-work-status-arrow {
        font-size: 18px;
        color: rgba(255,255,255,.62);
      }

      #rcWorkComposer[hidden] { display: none !important; }
      #rcWorkComposer {
        margin-top: 14px !important;
        border-color: rgba(110, 231, 183, .3);
        box-shadow: 0 20px 48px rgba(0,0,0,.18);
      }
      .rc-work-composer-close {
        margin-left: 4px;
      }

      .rc-work-workspace {
        position: relative;
      }
      .rc-work-workspace > .work-row:first-child {
        margin-bottom: 10px;
      }
      .rc-work-workspace-title {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .rc-work-workspace-title small {
        font-size: 12px;
        font-weight: 400;
        color: var(--rc-ink-dim, rgba(255,255,255,.62));
      }
      .rc-work-filterbar {
        display: grid;
        grid-template-columns: minmax(240px, 1fr) minmax(150px, 190px) minmax(150px, 190px) auto;
        gap: 10px;
        align-items: center;
        margin: 4px 0 12px;
      }
      .rc-work-filterbar input,
      .rc-work-filterbar select {
        width: 100%;
        min-height: 40px;
        border-radius: 9px;
        border: 1px solid rgba(167, 243, 208, .18);
        background: rgba(2, 29, 26, .76);
        color: inherit;
        padding: 9px 11px;
        outline: none;
      }
      .rc-work-filterbar input:focus,
      .rc-work-filterbar select:focus {
        border-color: rgba(110, 231, 183, .6);
        box-shadow: 0 0 0 3px rgba(16,185,129,.12);
      }
      .rc-work-tools {
        position: relative;
        justify-self: end;
      }
      .rc-work-tools > summary {
        list-style: none;
        cursor: pointer;
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 8px 12px;
        border-radius: 9px;
        border: 1px solid rgba(167,243,208,.18);
        background: rgba(2,29,26,.76);
      }
      .rc-work-tools > summary::-webkit-details-marker { display: none; }
      .rc-work-tools-menu,
      .rc-work-row-menu {
        position: absolute;
        right: 0;
        top: calc(100% + 6px);
        z-index: 60;
        min-width: 210px;
        padding: 7px;
        border-radius: 10px;
        border: 1px solid rgba(167,243,208,.22);
        background: rgba(3, 31, 28, .98);
        box-shadow: 0 18px 40px rgba(0,0,0,.35);
      }
      .rc-work-tools-menu .work-btn,
      .rc-work-row-menu .work-btn {
        width: 100%;
        justify-content: flex-start;
        margin: 0 !important;
        border: 0;
        background: transparent;
        border-radius: 7px;
        padding: 9px 10px;
      }
      .rc-work-tools-menu .work-btn:hover,
      .rc-work-row-menu .work-btn:hover {
        background: rgba(255,255,255,.08);
      }
      .rc-work-row-menu-wrap {
        position: relative;
        display: inline-block;
      }
      .rc-work-row-menu-wrap > summary {
        list-style: none;
        cursor: pointer;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.04);
        font-weight: 800;
        letter-spacing: 2px;
      }
      .rc-work-row-menu-wrap > summary::-webkit-details-marker { display: none; }
      .rc-work-primary-actions {
        display: inline-flex;
        gap: 7px;
        align-items: center;
      }
      .rc-work-action-cell {
        text-align: right;
        min-width: 130px;
      }
      .rc-work-action-cell .work-btn {
        margin-left: 0 !important;
        padding: 7px 10px;
        font-size: 12px;
      }
      .rc-work-status-cell,
      .rc-work-students-cell {
        white-space: nowrap;
      }
      .rc-work-status-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 72px;
        padding: 4px 9px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        border: 1px solid rgba(255,255,255,.12);
      }
      .rc-work-status-pill.draft { color: #fca5a5; background: rgba(239,68,68,.12); }
      .rc-work-status-pill.scheduled { color: #fde68a; background: rgba(245,158,11,.12); }
      .rc-work-status-pill.active { color: #a7f3d0; background: rgba(16,185,129,.14); }
      .rc-work-status-pill.completed { color: #d1d5db; background: rgba(107,114,128,.16); }
      .rc-work-students-main {
        font-weight: 700;
        font-size: 12px;
      }
      .rc-work-students-sub {
        margin-top: 2px;
        font-size: 10px;
        color: var(--rc-ink-dim, rgba(255,255,255,.62));
      }
      .rc-work-batch-row td {
        background: rgba(10, 77, 62, .17) !important;
      }
      .rc-work-child-row td {
        background: rgba(0,0,0,.06);
      }
      .rc-work-completed-note {
        padding: 10px 12px;
        margin-top: 8px;
        border-top: 1px solid rgba(255,255,255,.08);
        color: var(--rc-ink-dim, rgba(255,255,255,.62));
        font-size: 12px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
      }
      .rc-work-completed-note a {
        color: #a7f3d0;
        font-weight: 700;
      }
      .rc-work-filter-empty {
        margin: 14px 0 2px;
        padding: 18px;
        border: 1px dashed rgba(167,243,208,.2);
        border-radius: 10px;
        text-align: center;
        color: var(--rc-ink-dim, rgba(255,255,255,.62));
      }

      @media (max-width: 1100px) {
        .rc-work-launch-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .rc-work-tip { grid-column: 1 / -1; }
        .rc-work-status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .rc-work-filterbar { grid-template-columns: 1fr 1fr; }
        .rc-work-tools { justify-self: stretch; }
        .rc-work-tools > summary { justify-content: center; width: 100%; }
      }
      @media (max-width: 720px) {
        .rc-work-launch-row,
        .rc-work-status-grid,
        .rc-work-filterbar { grid-template-columns: 1fr; }
        .rc-work-status-card { min-height: 72px; }
        .rc-work-tools { justify-self: stretch; }
        .rc-work-status-cell,
        .rc-work-students-cell { display: none; }
        #draftsTable th.rc-work-added-col { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function openComposer(mode = "new") {
    const composer = $("rcWorkComposer");
    if (!composer) return;

    if (mode === "new") {
      const cancel = $("btnCancelEdit");
      if (cancel && cancel.style.display !== "none") cancel.click();
    }

    composer.hidden = false;
    composer.scrollIntoView({ behavior: "smooth", block: "start" });

    if (mode === "import") {
      const fileInput = $("assignmentFile");
      if (fileInput) {
        fileInput.focus({ preventScroll: true });
        fileInput.click();
      }
    } else {
      $("draftTitle")?.focus({ preventScroll: true });
    }
  }

  function closeComposer() {
    const composer = $("rcWorkComposer");
    if (composer) composer.hidden = true;
  }

  function setButtonLabel(button, label) {
    if (!button) return;
    const svg = button.querySelector("svg");
    const icon = svg ? svg.cloneNode(true) : null;
    button.replaceChildren();
    if (icon) button.appendChild(icon);
    button.appendChild(document.createTextNode(` ${label}`));
    button.title = label;
  }

  function makeStatusPill(status) {
    const meta = statusMeta(status);
    const pill = makeEl("span", `rc-work-status-pill ${meta.tone}`, meta.label);
    pill.dataset.workStatus = status;
    return pill;
  }

  function ensureTableHeader() {
    const headerRow = document.querySelector("#draftsTable thead tr");
    if (!headerRow || headerRow.dataset.rcWorkV2 === "1") return;

    const headers = Array.from(headerRow.children);
    if (headers.length < 5) return;

    const statusTh = makeEl("th", "rc-work-added-col", "Status");
    const studentsTh = makeEl("th", "rc-work-added-col", "Students");

    headerRow.insertBefore(statusTh, headers[3]);
    headerRow.insertBefore(studentsTh, headers[4]);
    headerRow.dataset.rcWorkV2 = "1";
  }

  function releaseDueForDraft(draft) {
    const release = draft?.releaseAt
      ? `${draft.autoRelease && !draft.issuedAt ? "Releases" : "Release"} ${formatShortDateTime(draft.releaseAt)}`
      : "—";
    const due = draft?.dueAt ? `Due ${formatShortDate(draft.dueAt)}` : "";
    return { release, due };
  }

  function releaseDueForBatch(drafts) {
    const releaseDates = drafts
      .map((draft) => dateMs(draft.releaseAt))
      .filter((value) => value !== null);
    const dueDates = drafts
      .map((draft) => dateMs(draft.dueAt))
      .filter((value) => value !== null);

    return {
      release:
        releaseDates.length > 0
          ? formatShortDateTime(new Date(Math.min(...releaseDates)).toISOString())
          : "—",
      due:
        dueDates.length > 0
          ? `Due ${formatShortDate(new Date(Math.max(...dueDates)).toISOString())}`
          : "",
    };
  }

  function writeTimingCell(cell, timing) {
    if (!cell) return;
    cell.replaceChildren();
    const main = makeEl("div", "", timing.release || "—");
    main.style.fontSize = "12px";
    cell.appendChild(main);
    if (timing.due) {
      const sub = makeEl("div", "work-subtle", timing.due);
      sub.style.fontSize = "10px";
      sub.style.marginTop = "2px";
      cell.appendChild(sub);
    }
  }

  function writeStudentsCell(cell, progress, status, draftCount = 0) {
    if (!cell) return;
    cell.replaceChildren();

    let total = progress.total || draftCount || 0;
    const main = makeEl(
      "div",
      "rc-work-students-main",
      total > 0 ? String(total) : "—"
    );
    cell.appendChild(main);

    let detail = "";
    if (status === "active" || status === "completed") {
      if (progress.total > 0) {
        detail =
          progress.remaining > 0
            ? `${progress.reviewed} reviewed · ${progress.remaining} remaining`
            : `${progress.reviewed} reviewed`;
      }
    } else if (draftCount > 1) {
      const statuses = status === "scheduled" ? "scheduled" : "student drafts";
      detail = `${draftCount} ${statuses}`;
    }

    if (detail) cell.appendChild(makeEl("div", "rc-work-students-sub", detail));
  }

  function arrangeActions(actionCell, status, kind, drafts) {
    if (!actionCell || actionCell.dataset.rcWorkActions === "1") return;

    const buttons = Array.from(actionCell.querySelectorAll(":scope > button"));
    if (buttons.length === 0) return;

    actionCell.classList.add("rc-work-action-cell");
    actionCell.dataset.rcWorkActions = "1";

    const primary = makeEl("div", "rc-work-primary-actions");
    const menuWrap = document.createElement("details");
    menuWrap.className = "rc-work-row-menu-wrap";
    menuWrap.addEventListener("click", (event) => event.stopPropagation());

    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", "More assignment actions");
    summary.textContent = "•••";
    menuWrap.appendChild(summary);

    const menu = makeEl("div", "rc-work-row-menu");
    menuWrap.appendChild(menu);

    const hasReadyDraft = drafts.some((draft) => deriveDraftStatus(draft) === "draft");

    for (const button of buttons) {
      const label = norm(button.textContent);
      button.style.marginLeft = "0";

      let isPrimary = false;

      if (kind === "batch") {
        if (label.includes("issue all") && hasReadyDraft) {
          setButtonLabel(button, "Issue Ready");
          isPrimary = true;
        }
      } else if (status === "draft") {
        if (label === "edit") {
          setButtonLabel(button, "Continue");
          isPrimary = true;
        } else if (label === "preview" || label === "issue") {
          isPrimary = true;
        }
      } else if (status === "scheduled") {
        if (label === "edit") {
          setButtonLabel(button, "Continue");
          isPrimary = true;
        } else if (label === "preview") {
          isPrimary = true;
        } else if (label === "issue") {
          setButtonLabel(button, "Issue Now");
        }
      } else if (status === "active") {
        if (label === "manage") {
          setButtonLabel(button, "View Progress");
          isPrimary = true;
        }
      }

      if (isPrimary) primary.appendChild(button);
      else menu.appendChild(button);
    }

    actionCell.replaceChildren();
    if (primary.childElementCount > 0) actionCell.appendChild(primary);
    if (menu.childElementCount > 0) actionCell.appendChild(menuWrap);
  }

  function searchCorpusForDraft(draft) {
    return [
      draft?.title,
      draft?.batchTitle,
      draft?.className,
      draft?.studentCode,
      ...(Array.isArray(draft?.studentCodes) ? draft.studentCodes : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function searchCorpusForBatch(drafts) {
    return drafts.map(searchCorpusForDraft).join(" ");
  }

  function setRowMetadata(row, kind, status, className, searchText) {
    row.dataset.rcWorkKind = kind;
    row.dataset.rcWorkStatus = status;
    row.dataset.rcWorkClass = norm(className);
    row.dataset.rcWorkSearch = norm(searchText);
  }

  function decorateBatchRow(row, batch) {
    row.classList.add("rc-work-batch-row");
    const cells = Array.from(row.cells);
    if (cells.length < 3) return;

    const status = aggregateBatchStatus(batch.drafts);
    const progress = batchProgress(batch.drafts);
    const first = batch.drafts[0] || {};
    const titleCell = cells[1];
    let actionCell = cells[cells.length - 1];

    if (row.dataset.rcWorkStructure !== "1") {
      titleCell.colSpan = 1;

      const classCell = makeEl("td", "rc-work-class-cell");
      const statusCell = makeEl("td", "rc-work-status-cell rc-work-added-col");
      const timingCell = makeEl("td", "rc-work-timing-cell");
      const studentsCell = makeEl("td", "rc-work-students-cell rc-work-added-col");

      row.insertBefore(classCell, actionCell);
      row.insertBefore(statusCell, actionCell);
      row.insertBefore(timingCell, actionCell);
      row.insertBefore(studentsCell, actionCell);

      row.dataset.rcWorkStructure = "1";
    }

    const currentCells = Array.from(row.cells);
    const classCell = currentCells[2];
    const statusCell = currentCells[3];
    const timingCell = currentCells[4];
    const studentsCell = currentCells[5];
    actionCell = currentCells[6];

    classCell.textContent = first.className || "—";
    statusCell.replaceChildren(makeStatusPill(status));
    writeTimingCell(timingCell, releaseDueForBatch(batch.drafts));
    writeStudentsCell(studentsCell, progress, status, batch.drafts.length);
    arrangeActions(actionCell, status, "batch", batch.drafts);

    const oldCount = titleCell.querySelector("span:nth-of-type(2)");
    if (oldCount) {
      oldCount.textContent = `${batch.drafts.length} student draft${
        batch.drafts.length === 1 ? "" : "s"
      }`;
    }

    setRowMetadata(
      row,
      "batch",
      status,
      first.className,
      searchCorpusForBatch(batch.drafts)
    );
  }

  function decorateDraftRow(row, draft, kind) {
    if (!draft) return;
    if (kind === "child") row.classList.add("rc-work-child-row");

    const status = deriveDraftStatus(draft);
    const progress = progressForDraft(draft);

    if (row.dataset.rcWorkStructure !== "1") {
      const cells = Array.from(row.cells);
      if (cells.length < 5) return;

      const releaseCell = cells[3];
      const actionCell = cells[4];

      const statusCell = makeEl("td", "rc-work-status-cell rc-work-added-col");
      const studentsCell = makeEl("td", "rc-work-students-cell rc-work-added-col");

      row.insertBefore(statusCell, releaseCell);
      row.insertBefore(studentsCell, actionCell);
      row.dataset.rcWorkStructure = "1";
    }

    const currentCells = Array.from(row.cells);
    const statusCell = currentCells[3];
    const releaseCell = currentCells[4];
    const studentsCell = currentCells[5];
    const actionCell = currentCells[6];

    statusCell.replaceChildren(makeStatusPill(status));
    writeTimingCell(releaseCell, releaseDueForDraft(draft));
    writeStudentsCell(studentsCell, progress, status, 1);
    arrangeActions(actionCell, status, kind, [draft]);

    setRowMetadata(
      row,
      kind,
      status,
      draft.className,
      searchCorpusForDraft(draft)
    );
  }

  function mapAndDecorateRows() {
    ensureTableHeader();

    const tbody = $("draftsTbody");
    if (!tbody) return;

    const rows = Array.from(tbody.rows);
    const model = renderModel();

    let batchIndex = 0;
    let currentBatch = null;
    let childIndex = 0;
    let ungroupedIndex = 0;

    for (const row of rows) {
      const firstCellText = String(row.cells[0]?.textContent || "").trim();

      if (firstCellText === "▶" || firstCellText === "▼") {
        currentBatch = model.batches[batchIndex++] || null;
        childIndex = 0;
        if (currentBatch) decorateBatchRow(row, currentBatch);
        continue;
      }

      if (firstCellText === "└" && currentBatch) {
        const draft = currentBatch.drafts[childIndex++] || null;
        decorateDraftRow(row, draft, "child");
        continue;
      }

      const draft = model.ungrouped[ungroupedIndex++] || null;
      decorateDraftRow(row, draft, "draft");
    }
  }

  function rowMatchesFilters(row) {
    if (!row) return false;
    if (row.dataset.rcWorkStatus === "completed") return false;

    if (
      state.statusFilter !== "all" &&
      row.dataset.rcWorkStatus !== state.statusFilter
    ) {
      return false;
    }

    if (
      state.classFilter !== "all" &&
      row.dataset.rcWorkClass !== state.classFilter
    ) {
      return false;
    }

    if (
      state.search &&
      !String(row.dataset.rcWorkSearch || "").includes(state.search)
    ) {
      return false;
    }

    return true;
  }

  function applyFilters() {
    const tbody = $("draftsTbody");
    if (!tbody) return;

    const rows = Array.from(tbody.rows);
    let batchVisible = true;
    let visibleCount = 0;

    for (const row of rows) {
      const kind = row.dataset.rcWorkKind;

      if (kind === "batch") {
        batchVisible = rowMatchesFilters(row);
        row.hidden = !batchVisible;
        if (batchVisible) visibleCount++;
        continue;
      }

      if (kind === "child") {
        const visible = batchVisible && rowMatchesFilters(row);
        row.hidden = !visible;
        continue;
      }

      const visible = rowMatchesFilters(row);
      row.hidden = !visible;
      if (visible) visibleCount++;
    }

    const empty = $("rcWorkFilterEmpty");
    if (empty) empty.hidden = visibleCount > 0 || readDrafts().length === 0;
  }

  function updateClassFilterOptions() {
    const select = $("rcWorkClassFilter");
    if (!select) return;

    const current = state.classFilter;
    const classes = Array.from(
      new Set(
        readDrafts()
          .map((draft) => String(draft.className || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All Classes";
    select.appendChild(all);

    for (const className of classes) {
      const option = document.createElement("option");
      option.value = norm(className);
      option.textContent = className;
      select.appendChild(option);
    }

    select.value = Array.from(select.options).some((option) => option.value === current)
      ? current
      : "all";
    state.classFilter = select.value;
  }

  function updateSummary() {
    const counts = { draft: 0, scheduled: 0, active: 0, completed: 0 };

    for (const item of logicalItems()) {
      counts[item.status] = (counts[item.status] || 0) + 1;
    }

    for (const status of Object.keys(counts)) {
      const count = $(`rcWorkCount-${status}`);
      if (count) count.textContent = String(counts[status]);
    }

    const completedNote = $("rcWorkCompletedNote");
    if (completedNote) {
      completedNote.hidden = counts.completed === 0;
      const count = completedNote.querySelector("[data-completed-count]");
      if (count) count.textContent = String(counts.completed);
    }

    document
      .querySelectorAll("[data-work-summary-filter]")
      .forEach((button) => {
        const active =
          button.dataset.workSummaryFilter === state.statusFilter &&
          state.statusFilter !== "all";
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
  }

  function refreshWorkspace() {
    if (state.enhancing) return;
    state.enhancing = true;

    try {
      mapAndDecorateRows();
      updateClassFilterOptions();
      applyFilters();
      updateSummary();
    } finally {
      state.enhancing = false;
    }
  }

  function scheduleWorkspaceRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => {
      refreshWorkspace();
      if (Date.now() - state.lastLifecycleRefresh > 2000) {
        refreshLifecycle();
      }
    }, 80);
  }

  async function refreshLifecycle() {
    state.lastLifecycleRefresh = Date.now();

    try {
      const { db } = await import("/web/data-adapter.js");
      const instances = await db.listAssignmentInstances();
      state.instances = Array.isArray(instances) ? instances : [];
      state.lifecycleReady = true;
      refreshWorkspace();
    } catch (error) {
      state.lifecycleReady = false;
      console.warn(TAG, "Lifecycle status unavailable; completed work will remain visible.", error);
      refreshWorkspace();
    }
  }

  function addWorkspaceTools(originalActions) {
    const details = document.createElement("details");
    details.className = "rc-work-tools";

    const summary = document.createElement("summary");
    summary.textContent = "⚙ Workspace Tools";
    details.appendChild(summary);

    const menu = makeEl("div", "rc-work-tools-menu");
    details.appendChild(menu);

    if (originalActions) {
      Array.from(originalActions.children).forEach((node) => {
        if (node instanceof HTMLElement) {
          node.style.marginLeft = "0";
          menu.appendChild(node);
        }
      });
      originalActions.hidden = true;
    }

    return details;
  }

  function buildFilterBar(draftSection, originalActions) {
    if ($("rcWorkFilterBar")) return;

    const bar = makeEl("div", "rc-work-filterbar");
    bar.id = "rcWorkFilterBar";

    const search = document.createElement("input");
    search.id = "rcWorkSearch";
    search.type = "search";
    search.placeholder = "Search assignments, students, classes…";
    search.setAttribute("aria-label", "Search assignments");
    search.addEventListener("input", () => {
      state.search = norm(search.value);
      applyFilters();
    });

    const classFilter = document.createElement("select");
    classFilter.id = "rcWorkClassFilter";
    classFilter.setAttribute("aria-label", "Filter assignments by class");
    classFilter.addEventListener("change", () => {
      state.classFilter = classFilter.value;
      applyFilters();
    });

    const statusFilter = document.createElement("select");
    statusFilter.id = "rcWorkStatusFilter";
    statusFilter.setAttribute("aria-label", "Filter assignments by status");
    [
      ["all", "All Statuses"],
      ["draft", "Drafts"],
      ["scheduled", "Scheduled"],
      ["active", "Active"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      statusFilter.appendChild(option);
    });
    statusFilter.addEventListener("change", () => {
      state.statusFilter = statusFilter.value;
      document
        .querySelectorAll("[data-work-summary-filter]")
        .forEach((button) => button.setAttribute("aria-pressed", "false"));
      applyFilters();
    });

    bar.append(search, classFilter, statusFilter, addWorkspaceTools(originalActions));

    const showIssued = $("showIssuedToggle");
    const showIssuedLabel = showIssued?.closest("label");
    if (showIssuedLabel) showIssuedLabel.hidden = true;

    const tableWrap = draftSection.querySelector(".work-tablewrap");
    draftSection.insertBefore(bar, tableWrap || null);

    const filterEmpty = makeEl(
      "div",
      "rc-work-filter-empty",
      "No unfinished assignments match these filters."
    );
    filterEmpty.id = "rcWorkFilterEmpty";
    filterEmpty.hidden = true;
    draftSection.insertBefore(filterEmpty, tableWrap || null);
  }

  function buildCommandCenter(main, subtitle, composer, draftSection) {
    if ($("rcWorkCommandCenter")) return;

    const h1 = main.querySelector("h1");
    if (h1) h1.textContent = "Work";
    if (subtitle) {
      subtitle.textContent = "Build, prepare, schedule, and issue assignments.";
      subtitle.style.marginBottom = "0";
    }

    composer.id = "rcWorkComposer";
    composer.hidden = true;

    const composerHeader = composer.querySelector(".work-row");
    if (composerHeader) {
      const heading = composerHeader.querySelector("h2");
      if (heading) heading.textContent = "Assignment Builder";

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "work-btn rc-work-composer-close";
      closeButton.textContent = "Close";
      closeButton.addEventListener("click", closeComposer);
      composerHeader.querySelector(".work-actions")?.appendChild(closeButton);
    }

    const command = makeEl("div", "rc-work-command-center");
    command.id = "rcWorkCommandCenter";

    const launchRow = makeEl("div", "rc-work-launch-row");

    const newButton = document.createElement("button");
    newButton.type = "button";
    newButton.className = "rc-work-launch-btn primary";
    newButton.innerHTML =
      '<span class="rc-work-launch-icon" aria-hidden="true">＋</span><span>New Assignment</span>';
    newButton.addEventListener("click", () => openComposer("new"));

    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.className = "rc-work-launch-btn";
    importButton.innerHTML =
      '<span class="rc-work-launch-icon" aria-hidden="true">⇧</span><span>Import Assignment</span>';
    importButton.addEventListener("click", () => openComposer("import"));

    const tip = makeEl("div", "rc-work-tip");
    tip.innerHTML =
      '<span class="rc-work-launch-icon" aria-hidden="true">💡</span><span><strong>Completed work clears the runway.</strong>Once every student result is reviewed, the assignment leaves Work and remains available in Library.</span><a href="/teacher/library/">Open Library →</a>';

    launchRow.append(newButton, importButton, tip);

    const statusGrid = makeEl("div", "rc-work-status-grid");
    const cards = [
      ["draft", "▤", "Drafts", "Not yet issued"],
      ["scheduled", "◷", "Scheduled", "Waiting for automatic release"],
      ["active", "◎", "Active", "Issued · student work in progress"],
    ];

    for (const [status, icon, title, sub] of cards) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "rc-work-status-card";
      card.dataset.status = status;
      card.dataset.workSummaryFilter = status;
      card.setAttribute("aria-pressed", "false");

      const iconEl = makeEl("span", "rc-work-status-icon", icon);
      iconEl.setAttribute("aria-hidden", "true");

      const text = makeEl("span", "");
      text.appendChild(makeEl("span", "rc-work-status-title", title));
      const count = makeEl("span", "rc-work-status-count", "0");
      count.id = `rcWorkCount-${status}`;
      text.appendChild(count);
      text.appendChild(makeEl("span", "rc-work-status-sub", sub));

      card.append(iconEl, text);
      card.addEventListener("click", () => {
        state.statusFilter = state.statusFilter === status ? "all" : status;
        const select = $("rcWorkStatusFilter");
        if (select) select.value = state.statusFilter;
        updateSummary();
        applyFilters();
      });
      statusGrid.appendChild(card);
    }

    const completedCard = document.createElement("a");
    completedCard.className = "rc-work-status-card";
    completedCard.dataset.status = "completed";
    completedCard.href = "/teacher/library/";
    completedCard.innerHTML =
      '<span class="rc-work-status-icon" aria-hidden="true">▣</span><span><span class="rc-work-status-title">Completed Assignments</span><span class="rc-work-status-count" id="rcWorkCount-completed">0</span><span class="rc-work-status-sub">Automatically available in Library</span></span><span class="rc-work-status-arrow" aria-hidden="true">→</span>';
    statusGrid.appendChild(completedCard);

    command.append(launchRow, statusGrid);
    subtitle.insertAdjacentElement("afterend", command);

    const headingRow = draftSection.querySelector(".work-row");
    const heading = headingRow?.querySelector("h2");
    const originalActions = headingRow?.querySelector(".work-actions");

    if (heading) {
      heading.textContent = "";
      heading.classList.add("rc-work-workspace-title");
      heading.appendChild(document.createTextNode("Assignment Workspace"));
      heading.appendChild(
        makeEl("small", "", "Unfinished work stays here. Completed work lives in Library.")
      );
    }

    draftSection.classList.add("rc-work-workspace");
    buildFilterBar(draftSection, originalActions);

    const completedNote = makeEl("div", "rc-work-completed-note");
    completedNote.id = "rcWorkCompletedNote";
    completedNote.hidden = true;
    completedNote.innerHTML =
      '<span><strong data-completed-count>0</strong> completed assignment(s) are hidden here to keep Work focused.</span><a href="/teacher/library/">View completed work in Library →</a>';
    draftSection.appendChild(completedNote);
  }

  function installActionCapture(draftSection) {
    document.addEventListener(
      "click",
      (event) => {
        const button = event.target?.closest?.("button");
        if (!button || !draftSection.contains(button)) return;
        const label = norm(button.textContent);
        if (label === "edit" || label === "continue") openComposer("edit");
      },
      true
    );
  }

  function installObserver() {
    const tbody = $("draftsTbody");
    if (!tbody || state.observer) return;

    state.observer = new MutationObserver(() => {
      if (!state.enhancing) scheduleWorkspaceRefresh();
    });
    state.observer.observe(tbody, { childList: true, subtree: true });
  }

  function forceIssuedRowsVisible() {
    try {
      localStorage.setItem(SHOW_ISSUED_KEY, "true");
    } catch (_) {
      // Rendering can still continue; core behavior will simply retain its prior preference.
    }

    const toggle = $("showIssuedToggle");
    if (toggle) toggle.checked = true;

    if (typeof window.__rcRenderTable === "function") {
      window.__rcRenderTable();
    }
  }

  function installRefreshHooks() {
    window.addEventListener("focus", () => {
      if (Date.now() - state.lastLifecycleRefresh > 30000) refreshLifecycle();
    });

    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - state.lastLifecycleRefresh > 30000
      ) {
        refreshLifecycle();
      }
    });
  }

  ready(() => {
    try {
      injectStyles();

      const classSelect = findClassSelect();
      ensureTransitionalSkillsOption(classSelect);
      forceCloseModals();

      const main = document.querySelector("main.tc-main");
      const subtitle = main?.querySelector("h1 + p");
      const composer = document.querySelector('section[aria-label="Create assignment draft"]');
      const draftSection = document.querySelector('section[aria-label="Draft list"]');

      if (!main || !subtitle || !composer || !draftSection) {
        return log("Work page structure not found. Leaving existing UI untouched.");
      }

      buildCommandCenter(main, subtitle, composer, draftSection);
      installActionCapture(draftSection);
      installObserver();
      installRefreshHooks();

      forceIssuedRowsVisible();
      refreshWorkspace();
      refreshLifecycle();

      log("Loaded ✓ (command center + lifecycle handoff + existing Work engine preserved)");
    } catch (error) {
      console.error(TAG, "Error:", error);
    }
  });
})();
 /* END rc-tc-work-qol v2 */
