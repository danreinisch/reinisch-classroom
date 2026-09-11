/* BEGIN rc-tc-work-qol v3 */
(() => {
  "use strict";

  if (!location.pathname.startsWith("/teacher/work")) return;

  const TAG = "[tc-work-qol]";
  const DRAFT_STORAGE_KEY = "rc_tc_work_drafts_v1";
  const SHOW_ISSUED_KEY = "rc_tc_work_show_issued_v1";
  const TERMINAL_STATUSES = new Set(["Graded", "Reviewed"]);

  const ICONS = {
    plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
    upload: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
    file: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="14" y2="17"></line></svg>',
    clock: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>',
    users: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    archive: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>',
    bulb: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8.7 14.8A7 7 0 1 1 15.3 14.8c-.8.7-1.3 1.6-1.3 2.2h-4c0-.6-.5-1.5-1.3-2.2z"></path></svg>',
    settings: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.35.69.62.96.28.28.63.48 1.01.57H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.47z"></path></svg>',
  };

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
      const latestA = Math.max(...a.drafts.map((draft) => dateMs(draft.createdAt) || 0));
      const latestB = Math.max(...b.drafts.map((draft) => dateMs(draft.createdAt) || 0));
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

  function makeIcon(name, className) {
    const span = makeEl("span", className || "");
    span.innerHTML = ICONS[name] || "";
    span.setAttribute("aria-hidden", "true");
    return span;
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
      main.tc-main > h1 {
        margin-bottom: 4px !important;
        letter-spacing: -0.025em;
      }
      main.tc-main > h1 + p {
        margin-top: 0 !important;
      }

      .rc-work-command-center {
        margin: 14px 0 12px;
        display: grid;
        gap: 10px;
      }
      .rc-work-launch-row {
        display: grid;
        grid-template-columns: minmax(210px, .88fr) minmax(210px, .88fr) minmax(360px, 2.1fr);
        gap: 10px;
        align-items: stretch;
      }
      .rc-work-launch-btn,
      .rc-work-tip,
      .rc-work-status-card {
        border: 1px solid rgba(134, 239, 172, .24);
        background: linear-gradient(180deg, rgba(4, 52, 44, .95), rgba(3, 38, 33, .96));
        color: inherit;
        border-radius: 10px;
        box-shadow: 0 12px 28px rgba(0,0,0,.18);
        backdrop-filter: blur(13px);
        -webkit-backdrop-filter: blur(13px);
      }
      .rc-work-launch-btn {
        appearance: none;
        -webkit-appearance: none;
        min-height: 58px;
        padding: 0 16px;
        display: flex;
        align-items: center;
        gap: 11px;
        cursor: pointer;
        font: inherit;
        font-weight: 750;
        text-align: left;
        transition: transform .15s ease, border-color .15s ease, background .15s ease;
      }
      .rc-work-launch-btn:hover {
        transform: translateY(-1px);
        border-color: rgba(110, 231, 183, .58);
        background: linear-gradient(180deg, rgba(9, 72, 57, .98), rgba(4, 48, 41, .98));
      }
      .rc-work-launch-btn.primary {
        background: linear-gradient(180deg, rgba(22, 126, 82, .98), rgba(9, 89, 60, .98));
        border-color: rgba(134, 239, 172, .58);
      }
      .rc-work-launch-icon {
        flex: 0 0 auto;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: rgba(255,255,255,.08);
      }
      .rc-work-tip {
        min-width: 0;
        min-height: 58px;
        padding: 9px 13px;
        display: flex;
        align-items: center;
        gap: 10px;
        color: rgba(239, 255, 248, .9);
        font-size: 12px;
        line-height: 1.35;
      }
      .rc-work-tip .rc-work-launch-icon {
        color: #f6d96b;
        background: rgba(245, 190, 52, .1);
      }
      .rc-work-tip-copy {
        min-width: 0;
        flex: 1 1 auto;
      }
      .rc-work-tip strong {
        color: #fde68a;
        font-weight: 800;
      }
      .rc-work-tip a {
        flex: 0 0 auto;
        color: #b7f7d7;
        font-weight: 750;
        white-space: nowrap;
      }

      .rc-work-status-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }
      .rc-work-status-card {
        appearance: none;
        -webkit-appearance: none;
        min-width: 0;
        min-height: 86px;
        padding: 12px 14px;
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr) auto;
        align-items: center;
        gap: 11px;
        text-decoration: none;
        cursor: pointer;
        text-align: left;
        font: inherit;
        overflow: hidden;
      }
      .rc-work-status-card:hover,
      .rc-work-status-card[aria-pressed="true"] {
        transform: translateY(-1px);
        box-shadow: 0 16px 32px rgba(0,0,0,.22);
      }
      .rc-work-status-card[data-status="draft"] {
        color: #fff4f4;
        border-color: rgba(248, 113, 113, .7);
        background: linear-gradient(105deg, rgba(94, 36, 38, .94), rgba(45, 38, 36, .95));
      }
      .rc-work-status-card[data-status="scheduled"] {
        color: #fffbea;
        border-color: rgba(250, 204, 21, .55);
        background: linear-gradient(105deg, rgba(82, 66, 21, .94), rgba(45, 48, 32, .95));
      }
      .rc-work-status-card[data-status="active"] {
        color: #ecfeff;
        border-color: rgba(34, 211, 238, .55);
        background: linear-gradient(105deg, rgba(13, 75, 76, .94), rgba(20, 54, 50, .96));
      }
      .rc-work-status-card[data-status="completed"] {
        color: #edfff2;
        border-color: rgba(74, 222, 128, .5);
        background: linear-gradient(105deg, rgba(20, 78, 49, .94), rgba(18, 53, 40, .96));
      }
      .rc-work-status-icon {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: rgba(255,255,255,.08);
      }
      .rc-work-status-card[data-status="draft"] .rc-work-status-icon { color: #ff9b9b; background: rgba(248,113,113,.12); }
      .rc-work-status-card[data-status="scheduled"] .rc-work-status-icon { color: #ffe277; background: rgba(250,204,21,.11); }
      .rc-work-status-card[data-status="active"] .rc-work-status-icon { color: #65e9f5; background: rgba(34,211,238,.11); }
      .rc-work-status-card[data-status="completed"] .rc-work-status-icon { color: #78efa5; background: rgba(74,222,128,.11); }
      .rc-work-status-copy {
        min-width: 0;
        display: block;
      }
      .rc-work-status-title,
      .rc-work-status-count,
      .rc-work-status-sub {
        display: block;
      }
      .rc-work-status-title {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .01em;
      }
      .rc-work-status-count {
        margin-top: 2px;
        font-size: 23px;
        line-height: 1;
        font-weight: 850;
      }
      .rc-work-status-sub {
        margin-top: 4px;
        color: rgba(239, 255, 248, .68);
        font-size: 10.5px;
        line-height: 1.25;
      }
      .rc-work-status-arrow {
        font-size: 18px;
        color: rgba(255,255,255,.65);
      }

      #rcWorkComposer[hidden] { display: none !important; }
      #rcWorkComposer {
        margin-top: 12px !important;
        scroll-margin-top: calc(var(--tc-topbar-h) + 14px);
        padding: 0 !important;
        overflow: hidden;
        border-radius: 16px !important;
        border-color: rgba(110, 231, 183, .34) !important;
        background: linear-gradient(180deg, rgba(3, 49, 42, .985), rgba(2, 31, 29, .985)) !important;
        box-shadow: 0 24px 60px rgba(0,0,0,.28) !important;
      }
      #rcWorkComposer > .work-row:first-child {
        gap: 16px !important;
        padding: 16px 18px;
        border-bottom: 1px solid rgba(167, 243, 208, .14);
        background: linear-gradient(90deg, rgba(15, 92, 66, .32), rgba(3, 39, 35, .18));
      }
      #rcWorkComposer > .work-row:first-child h2 {
        margin: 0 !important;
        font-size: 20px;
        line-height: 1.1;
        font-weight: 850;
        letter-spacing: -.02em;
      }
      #rcWorkComposer > .work-row:first-child h2::before {
        content: "CREATE / IMPORT";
        display: block;
        margin-bottom: 5px;
        color: rgba(167, 243, 208, .68);
        font-size: 9px;
        line-height: 1;
        font-weight: 800;
        letter-spacing: .14em;
      }
      #rcWorkComposer > .work-row:first-child .work-actions {
        gap: 7px;
        justify-content: flex-end;
      }
      #rcWorkComposer > .work-row:first-child .work-btn {
        min-height: 36px;
        padding: 7px 10px;
        border-radius: 8px;
        font-size: 11.5px;
        font-weight: 700;
      }
      #rcWorkComposer #btnSaveDraft {
        padding-inline: 14px;
        border-color: rgba(134, 239, 172, .54) !important;
        background: linear-gradient(180deg, rgba(22, 126, 82, .98), rgba(9, 89, 60, .98)) !important;
        box-shadow: 0 8px 22px rgba(0,0,0,.16);
      }
      #rcWorkComposer #btnSplitByStudent,
      #rcWorkComposer #btnSplitMega,
      #rcWorkComposer #btnCancelEdit,
      #rcWorkComposer .rc-work-composer-close {
        background: rgba(255,255,255,.045) !important;
        border-color: rgba(255,255,255,.13) !important;
      }
      .rc-work-composer-close { margin-left: 4px; }

      #rcWorkComposer > .rc-work-individualized-info {
        margin: 14px 18px 0 !important;
        min-height: 0;
        padding: 10px 12px !important;
        gap: 11px !important;
        border-radius: 11px !important;
        border-color: rgba(167, 139, 250, .24) !important;
        background: linear-gradient(90deg, rgba(90, 65, 145, .15), rgba(26, 58, 52, .08)) !important;
        box-shadow: none !important;
      }
      #rcWorkComposer > .rc-work-individualized-info > span:first-child {
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        display: grid;
        place-items: center;
        border-radius: 9px;
        background: rgba(167,139,250,.12);
        color: #d8cbff;
        font-size: 0 !important;
      }
      #rcWorkComposer > .rc-work-individualized-info > span:first-child::after {
        content: "IEP";
        font-size: 9px;
        line-height: 1;
        font-weight: 900;
        letter-spacing: .08em;
      }
      #rcWorkComposer > .rc-work-individualized-info > div > div:first-child {
        margin-bottom: 2px !important;
        color: rgba(246, 242, 255, .94);
        font-size: 11.5px;
        font-weight: 800 !important;
      }
      #rcWorkComposer > .rc-work-individualized-info .work-subtle {
        font-size: 10.5px !important;
        line-height: 1.35;
        color: rgba(226, 232, 240, .68);
      }

      #rcWorkComposer #workDraftForm {
        margin: 14px 18px 18px !important;
        display: grid;
        grid-template-columns: minmax(230px, .72fr) minmax(0, 2fr);
        gap: 12px;
      }
      #rcWorkComposer #workDraftForm > .work-grid:first-child {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 10px;
        padding: 14px;
        border: 1px solid rgba(167, 243, 208, .14);
        border-radius: 12px;
        background: rgba(0, 20, 19, .22);
      }
      #rcWorkComposer #workDraftForm > .work-grid:first-child > .work-field:nth-child(1) { grid-column: span 5; }
      #rcWorkComposer #workDraftForm > .work-grid:first-child > .work-field:nth-child(2) { grid-column: span 3; }
      #rcWorkComposer #workDraftForm > .work-grid:first-child > .work-field:nth-child(3) { grid-column: span 4; }
      #rcWorkComposer #workDraftForm > .work-grid:first-child > .work-field:nth-child(4) { grid-column: span 4; }
      #rcWorkComposer #workDraftForm > .work-grid:first-child > .work-field:nth-child(5) { grid-column: span 4; }
      #rcWorkComposer #workDraftForm > .work-grid:first-child > .work-field:nth-child(6) { grid-column: span 4; }
      #rcWorkComposer #workDraftForm > .work-grid:first-child > .work-field:nth-child(5) {
        align-self: end;
        min-height: 40px;
        margin-top: 0 !important;
        padding: 8px 10px;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        border: 1px solid rgba(167, 243, 208, .12);
        border-radius: 9px;
        background: rgba(255,255,255,.025);
      }
      #rcWorkComposer #workDraftForm > .work-grid:first-child > .work-field:nth-child(5) label {
        margin: 0 !important;
        font-size: 11px !important;
        font-weight: 650;
        color: rgba(236, 253, 245, .72);
      }
      #rcWorkComposer #draftAutoRelease {
        width: 15px !important;
        min-height: 15px !important;
        padding: 0 !important;
        accent-color: #34d399;
      }

      #rcWorkComposer #workDraftForm > .work-grid:has(#assignmentFile) {
        grid-column: 1 / -1;
        margin-top: 0 !important;
        padding: 14px !important;
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(300px, .8fr);
        gap: 12px;
        border: 1px solid rgba(167, 243, 208, .14) !important;
        border-radius: 12px;
        background: rgba(0, 20, 19, .22);
      }
      #rcWorkComposer #workDraftForm > .work-grid:has(#assignmentFile) > .work-field {
        min-width: 0;
        padding: 12px;
        border: 1px solid rgba(167, 243, 208, .1);
        border-radius: 10px;
        background: rgba(255,255,255,.022);
      }
      #rcWorkComposer #workDraftForm > .work-field:has(#draftParagraphCount),
      #rcWorkComposer #workDraftForm > .work-field:has(#scoringMcq),
      #rcWorkComposer #workDraftForm > .work-field:has(#draftNotes) {
        margin-top: 0 !important;
        padding: 13px !important;
        border: 1px solid rgba(167, 243, 208, .14) !important;
        border-radius: 12px;
        background: rgba(0, 20, 19, .22);
      }
      #rcWorkComposer #workDraftForm > .work-field:has(#draftParagraphCount) { grid-column: 1; }
      #rcWorkComposer #workDraftForm > .work-field:has(#scoringMcq) { grid-column: 2; }
      #rcWorkComposer #workDraftForm > .work-field:has(#draftNotes) { grid-column: 1 / -1; }
      #rcWorkComposer #workDraftForm > .work-field:has(#draftParagraphCount) > div:first-child,
      #rcWorkComposer #workDraftForm > .work-field:has(#scoringMcq) > label:first-child {
        display: block;
        margin: 0 0 8px !important;
        color: rgba(236, 253, 245, .9) !important;
        font-size: 11.5px !important;
        font-weight: 800 !important;
        letter-spacing: .01em;
      }
      #rcWorkComposer #workDraftForm > .work-field:has(#draftParagraphCount) .work-grid {
        grid-template-columns: 1fr !important;
        gap: 7px;
        margin-top: 0 !important;
      }
      #rcWorkComposer #workDraftForm > .work-field:has(#scoringMcq) .work-grid {
        gap: 8px;
        margin-top: 0 !important;
      }
      #rcWorkComposer #workDraftForm > #rcFilePreviewPanel,
      #rcWorkComposer #workDraftForm > #workMsg { grid-column: 1 / -1; }

      #rcWorkComposer .work-field label {
        margin-bottom: 5px;
        color: rgba(220, 252, 231, .7);
        font-size: 10.5px;
        line-height: 1.2;
        font-weight: 700;
        letter-spacing: .01em;
      }
      #rcWorkComposer .work-field input:not([type="checkbox"]),
      #rcWorkComposer .work-field select,
      #rcWorkComposer .work-field textarea {
        min-height: 40px;
        padding: 8px 10px;
        border-radius: 9px;
        border-color: rgba(167, 243, 208, .18);
        background: rgba(0, 17, 16, .5);
        font-size: 11.5px;
        transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
      }
      #rcWorkComposer .work-field input:not([type="checkbox"]):focus,
      #rcWorkComposer .work-field select:focus,
      #rcWorkComposer .work-field textarea:focus {
        border-color: rgba(110, 231, 183, .62);
        background: rgba(0, 25, 22, .72);
        box-shadow: 0 0 0 3px rgba(16,185,129,.1);
      }
      #rcWorkComposer input[type="file"].tc-file-input {
        min-height: 42px !important;
        padding: 4px !important;
        border: 1px dashed rgba(167, 243, 208, .24) !important;
        border-radius: 9px !important;
        background: rgba(0, 17, 16, .38) !important;
        color: rgba(236, 253, 245, .72) !important;
        font-size: 11px !important;
      }
      #rcWorkComposer input[type="file"].tc-file-input::file-selector-button {
        margin-right: 10px;
        padding: 7px 10px;
        border: 0;
        border-right: 1px solid rgba(167,243,208,.14);
        border-radius: 7px;
        background: rgba(52, 211, 153, .12);
        color: rgba(236,253,245,.92);
        font: inherit;
        font-weight: 750;
        cursor: pointer;
      }
      #rcWorkComposer #assignmentFileName,
      #rcWorkComposer #mappingFileName { display: none; }
      #rcWorkComposer .work-subtle,
      #rcWorkComposer .tc-subtle {
        font-size: 10.5px !important;
        line-height: 1.35;
        color: rgba(226, 232, 240, .62);
      }
      #rcWorkComposer #draftNotes {
        min-height: 68px;
        resize: vertical;
      }
      #rcWorkComposer details > summary {
        color: rgba(167, 243, 208, .68) !important;
      }
      #rcWorkComposer pre {
        max-height: 220px;
        overflow: auto;
        padding: 10px;
        border: 1px solid rgba(167,243,208,.12);
        border-radius: 8px;
        background: rgba(0,0,0,.2);
        font-size: 10px;
      }

      /* Final Assignment Builder polish — Work-only, presentation-only */
      main.tc-main:has(#rcWorkComposer:not([hidden])) .rc-work-workspace {
        display: none !important;
      }
      main.tc-main:has(#rcWorkComposer:not([hidden])) .rc-work-command-center {
        margin-bottom: 10px !important;
      }
      main.tc-main:has(#rcWorkComposer:not([hidden])) .rc-work-status-grid {
        opacity: .88;
      }
      #rcWorkComposer {
        overflow: visible !important;
        border-radius: 18px !important;
        border-color: rgba(110,231,183,.4) !important;
        box-shadow: 0 26px 72px rgba(0,0,0,.32) !important;
      }
      #rcWorkComposer > .work-row:first-child {
        position: sticky;
        top: calc(var(--tc-topbar-h) + 8px);
        z-index: 32;
        min-height: 66px;
        padding: 13px 16px !important;
        border-radius: 17px 17px 0 0;
        border-bottom-color: rgba(167,243,208,.2) !important;
        background: linear-gradient(90deg, rgba(7,73,56,.99), rgba(3,45,38,.99)) !important;
        box-shadow: 0 12px 30px rgba(0,0,0,.24);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }
      #rcWorkComposer > .work-row:first-child h2 { font-size: 21px !important; }
      #rcWorkComposer > .work-row:first-child .work-actions { gap: 8px !important; }
      #rcWorkComposer > .work-row:first-child .work-btn {
        min-height: 38px;
        padding: 8px 12px;
        border-radius: 9px;
      }
      #rcWorkComposer #btnSaveDraft {
        padding-inline: 16px;
        border-color: rgba(134,239,172,.7) !important;
        background: linear-gradient(180deg, rgba(30,145,92,.99), rgba(11,98,65,.99)) !important;
        box-shadow: 0 8px 22px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.08) !important;
        font-weight: 800;
      }
      #rcWorkComposer > .rc-work-individualized-info {
        margin: 11px 16px 0 !important;
        padding: 8px 10px !important;
        border-color: rgba(167,139,250,.2) !important;
        background: linear-gradient(90deg, rgba(83,61,135,.12), rgba(5,45,39,.05)) !important;
      }
      #rcWorkComposer > .rc-work-individualized-info > span:first-child {
        width: 31px;
        height: 31px;
        flex-basis: 31px;
      }
      #rcWorkComposer #workDraftForm {
        margin: 10px 16px 16px !important;
        grid-template-columns: minmax(250px,.86fr) minmax(0,2.14fr);
        gap: 10px;
      }
      #rcWorkComposer #workDraftForm > .work-grid:first-child,
      #rcWorkComposer #workDraftForm > .work-grid:has(#assignmentFile) {
        padding: 12px !important;
        gap: 9px;
        border-color: rgba(167,243,208,.11) !important;
        background: rgba(0,19,18,.17) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.02);
      }
      #rcWorkComposer #workDraftForm > .work-grid:first-child::before,
      #rcWorkComposer #workDraftForm > .work-grid:has(#assignmentFile)::before {
        grid-column: 1 / -1;
        margin-bottom: 1px;
        color: rgba(167,243,208,.62);
        font-size: 9px;
        line-height: 1;
        font-weight: 850;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      #rcWorkComposer #workDraftForm > .work-grid:first-child::before { content: "Assignment details"; }
      #rcWorkComposer #workDraftForm > .work-grid:has(#assignmentFile)::before { content: "Content & mapping"; }
      #rcWorkComposer #workDraftForm > .work-grid:has(#assignmentFile) > .work-field {
        padding: 10px;
        border-color: rgba(167,243,208,.08);
        background: rgba(255,255,255,.016);
      }
      #rcWorkComposer .work-field label {
        color: rgba(220,252,231,.82);
        font-size: 11px;
      }
      #rcWorkComposer .work-field input:not([type="checkbox"]),
      #rcWorkComposer .work-field select,
      #rcWorkComposer .work-field textarea {
        min-height: 41px;
        border-color: rgba(167,243,208,.2);
        background: rgba(0,16,15,.56);
      }
      #rcWorkComposer input[type="file"].tc-file-input {
        min-height: 46px !important;
        padding: 5px !important;
        border-color: rgba(110,231,183,.28) !important;
        background: rgba(0,23,20,.42) !important;
        color: transparent !important;
        font-size: 0 !important;
      }
      #rcWorkComposer input[type="file"].tc-file-input::file-selector-button {
        margin-right: 0;
        padding: 8px 12px;
        border: 1px solid rgba(110,231,183,.16);
        border-radius: 8px;
        background: linear-gradient(180deg, rgba(34,197,94,.15), rgba(16,120,78,.11));
        color: rgba(236,253,245,.94);
        font-size: 11px;
        font-weight: 800;
      }
      #rcWorkComposer #assignmentFileName,
      #rcWorkComposer #mappingFileName {
        display: block;
        margin-top: 6px;
        color: rgba(226,232,240,.52);
        font-size: 10px;
      }
      #rcWorkComposer #workDraftForm > .work-field:has(#draftParagraphCount),
      #rcWorkComposer #workDraftForm > .work-field:has(#scoringMcq),
      #rcWorkComposer #workDraftForm > .work-field:has(#draftNotes) {
        padding: 11px !important;
        border-color: rgba(167,243,208,.1) !important;
        background: rgba(0,19,18,.16) !important;
      }
      #rcWorkComposer #draftNotes {
        min-height: 56px !important;
        max-height: 150px;
      }

      .rc-work-workspace {
        position: relative;
        margin-top: 12px !important;
        padding: 12px !important;
        border-radius: 11px !important;
        border-color: rgba(110, 231, 183, .3) !important;
        background: linear-gradient(180deg, rgba(3, 50, 43, .96), rgba(2, 38, 34, .97)) !important;
        box-shadow: 0 18px 44px rgba(0,0,0,.17);
      }
      .rc-work-workspace-heading,
      .rc-work-legacy-issued-toggle {
        display: none !important;
      }
      .rc-work-filterbar {
        display: grid;
        grid-template-columns: minmax(300px, 1fr) minmax(145px, 180px) minmax(145px, 180px) auto;
        gap: 9px;
        align-items: center;
        margin: 0 0 9px;
      }
      .rc-work-filterbar input,
      .rc-work-filterbar select {
        width: 100%;
        min-height: 39px;
        border-radius: 8px;
        border: 1px solid rgba(167, 243, 208, .2);
        background: rgba(2, 27, 25, .82);
        color: inherit;
        padding: 8px 10px;
        outline: none;
        font: inherit;
        font-size: 12px;
      }
      .rc-work-filterbar input::placeholder { color: rgba(231,255,246,.48); }
      .rc-work-filterbar input:focus,
      .rc-work-filterbar select:focus {
        border-color: rgba(110, 231, 183, .62);
        box-shadow: 0 0 0 3px rgba(16,185,129,.11);
      }
      .rc-work-tools {
        position: relative;
        justify-self: end;
      }
      .rc-work-tools > summary {
        list-style: none;
        cursor: pointer;
        min-height: 39px;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 8px 11px;
        border-radius: 8px;
        border: 1px solid rgba(167,243,208,.2);
        background: rgba(2,27,25,.82);
        font-size: 12px;
        white-space: nowrap;
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
        border-radius: 9px;
        border: 1px solid rgba(167,243,208,.22);
        background: rgba(3, 31, 28, .99);
        box-shadow: 0 18px 40px rgba(0,0,0,.38);
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
      .rc-work-row-menu .work-btn:hover { background: rgba(255,255,255,.08); }

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
        border-radius: 8px;
        font-size: 11.5px;
      }

      .rc-work-workspace .work-tablewrap {
        margin-top: 0 !important;
        border-radius: 9px;
        border-color: rgba(167,243,208,.16);
        background: rgba(1, 24, 23, .18);
      }
      #draftsTable { min-width: 900px; }
      #draftsTable th,
      #draftsTable td {
        padding: 9px 10px;
      }
      #draftsTable th {
        text-transform: none;
        letter-spacing: 0;
        font-size: 11px;
        font-weight: 750;
        color: rgba(236, 253, 245, .78);
        background: rgba(1, 24, 23, .36);
      }
      #draftsTable tbody tr:hover td { background: rgba(255,255,255,.045); }
      .rc-work-status-cell,
      .rc-work-students-cell { white-space: nowrap; }
      .rc-work-status-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 70px;
        padding: 4px 9px;
        border-radius: 999px;
        font-size: 10.5px;
        font-weight: 800;
        border: 1px solid rgba(255,255,255,.12);
      }
      .rc-work-status-pill.draft { color: #ffb4b4; background: rgba(239,68,68,.13); }
      .rc-work-status-pill.scheduled { color: #ffe58a; background: rgba(245,158,11,.14); }
      .rc-work-status-pill.active { color: #9df4d4; background: rgba(16,185,129,.14); }
      .rc-work-status-pill.completed { color: #d1d5db; background: rgba(107,114,128,.16); }
      .rc-work-students-main {
        font-weight: 750;
        font-size: 11.5px;
      }
      .rc-work-students-sub {
        margin-top: 2px;
        font-size: 9.5px;
        color: rgba(236,253,245,.56);
      }
      .rc-work-batch-row td { background: rgba(8, 67, 56, .17) !important; }
      .rc-work-child-row td { background: rgba(0,0,0,.055); }
      .rc-work-filter-empty {
        margin: 0 0 8px;
        padding: 16px;
        border: 1px dashed rgba(167,243,208,.18);
        border-radius: 8px;
        text-align: center;
        color: rgba(236,253,245,.58);
        font-size: 12px;
      }
      .rc-work-filter-empty[hidden] { display: none !important; }
      #draftsEmpty {
        margin: 0 !important;
        padding: 28px 16px 24px !important;
        min-height: 0 !important;
        border-top: 1px solid rgba(167,243,208,.08);
        color: rgba(236,253,245,.58);
      }
      #draftsEmpty svg { width: 28px; height: 28px; }
      .rc-work-completed-note[hidden] { display: none !important; }

      @media (max-width: 1180px) {
        .rc-work-launch-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .rc-work-tip { grid-column: 1 / -1; }
        .rc-work-status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .rc-work-filterbar { grid-template-columns: minmax(240px, 1fr) 1fr; }
        .rc-work-tools { justify-self: stretch; }
        .rc-work-tools > summary { justify-content: center; width: 100%; }
        #rcWorkComposer #workDraftForm { grid-template-columns: 1fr; }
        #rcWorkComposer #workDraftForm > .work-field:has(#draftParagraphCount),
        #rcWorkComposer #workDraftForm > .work-field:has(#scoringMcq),
        #rcWorkComposer #workDraftForm > .work-field:has(#draftNotes) { grid-column: 1; }
        #rcWorkComposer #workDraftForm > .work-grid:has(#assignmentFile) { grid-template-columns: 1fr; }
      }
      @media (max-width: 820px) {
        #rcWorkComposer > .work-row:first-child {
          position: static;
          align-items: flex-start;
        }
        #rcWorkComposer > .work-row:first-child .work-actions {
          width: 100%;
          justify-content: flex-start;
        }
        #rcWorkComposer #workDraftForm > .work-grid:first-child { grid-template-columns: 1fr; }
        #rcWorkComposer #workDraftForm > .work-grid:first-child > .work-field:nth-child(n) { grid-column: 1; }
        #rcWorkComposer #workDraftForm > .work-field:has(#scoringMcq) .work-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      }
      @media (max-width: 720px) {
        .rc-work-launch-row,
        .rc-work-status-grid,
        .rc-work-filterbar { grid-template-columns: 1fr; }
        .rc-work-tip { align-items: flex-start; flex-wrap: wrap; }
        .rc-work-tip a { margin-left: 44px; }
        .rc-work-status-card { min-height: 76px; }
        .rc-work-tools { justify-self: stretch; }
        .rc-work-status-cell,
        .rc-work-students-cell { display: none; }
        #draftsTable th.rc-work-added-col { display: none; }
      }
      @media (max-width: 560px) {
        #rcWorkComposer > .rc-work-individualized-info,
        #rcWorkComposer #workDraftForm {
          margin-left: 10px !important;
          margin-right: 10px !important;
        }
        #rcWorkComposer #workDraftForm > .work-field:has(#scoringMcq) .work-grid {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function tuckIndividualizedInfo(main, composer) {
    const card = Array.from(main.children).find(
      (node) =>
        node !== composer &&
        node.classList?.contains("work-card") &&
        String(node.textContent || "").includes("SPED / Individualized Assignments")
    );
    if (!card) return;

    card.classList.add("rc-work-individualized-info");
    const form = composer.querySelector("form");
    composer.insertBefore(card, form || null);
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
    main.style.fontSize = "11.5px";
    cell.appendChild(main);
    if (timing.due) {
      const sub = makeEl("div", "work-subtle", timing.due);
      sub.style.fontSize = "9.5px";
      sub.style.marginTop = "2px";
      cell.appendChild(sub);
    }
  }

  function writeStudentsCell(cell, progress, status, draftCount = 0) {
    if (!cell) return;
    cell.replaceChildren();

    const total = progress.total || draftCount || 0;
    cell.appendChild(
      makeEl("div", "rc-work-students-main", total > 0 ? String(total) : "—")
    );

    let detail = "";
    if (status === "active" || status === "completed") {
      if (progress.total > 0) {
        detail =
          progress.remaining > 0
            ? `${progress.reviewed} reviewed · ${progress.remaining} remaining`
            : `${progress.reviewed} reviewed`;
      }
    } else if (draftCount > 1) {
      detail = `${draftCount} ${status === "scheduled" ? "scheduled" : "student drafts"}`;
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
      } else if (status === "active" && label === "manage") {
        setButtonLabel(button, "View Progress");
        isPrimary = true;
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
      if (Date.now() - state.lastLifecycleRefresh > 2000) refreshLifecycle();
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
    summary.innerHTML = `${ICONS.settings}<span>Workspace Tools</span>`;
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
      updateSummary();
      applyFilters();
    });

    bar.append(search, classFilter, statusFilter, addWorkspaceTools(originalActions));

    const showIssued = $("showIssuedToggle");
    const showIssuedLabel = showIssued?.closest("label");
    if (showIssuedLabel) {
      showIssuedLabel.classList.add("rc-work-legacy-issued-toggle");
      showIssuedLabel.hidden = true;
    }

    const tableWrap = draftSection.querySelector(".work-tablewrap");
    const emptyState = $("draftsEmpty");
    draftSection.insertBefore(bar, emptyState || tableWrap || null);

    const filterEmpty = makeEl(
      "div",
      "rc-work-filter-empty",
      "No unfinished assignments match these filters."
    );
    filterEmpty.id = "rcWorkFilterEmpty";
    filterEmpty.hidden = true;
    draftSection.insertBefore(filterEmpty, emptyState || tableWrap || null);
  }

  function buildStatusCard(status, iconName, title, sub) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "rc-work-status-card";
    card.dataset.status = status;
    card.dataset.workSummaryFilter = status;
    card.setAttribute("aria-pressed", "false");

    const copy = makeEl("span", "rc-work-status-copy");
    copy.appendChild(makeEl("span", "rc-work-status-title", title));
    const count = makeEl("span", "rc-work-status-count", "0");
    count.id = `rcWorkCount-${status}`;
    copy.appendChild(count);
    copy.appendChild(makeEl("span", "rc-work-status-sub", sub));

    card.append(makeIcon(iconName, "rc-work-status-icon"), copy);
    card.addEventListener("click", () => {
      state.statusFilter = state.statusFilter === status ? "all" : status;
      const select = $("rcWorkStatusFilter");
      if (select) select.value = state.statusFilter;
      updateSummary();
      applyFilters();
    });
    return card;
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
    tuckIndividualizedInfo(main, composer);

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
    newButton.append(makeIcon("plus", "rc-work-launch-icon"), document.createTextNode("New Assignment"));
    newButton.addEventListener("click", () => openComposer("new"));

    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.className = "rc-work-launch-btn";
    importButton.append(makeIcon("upload", "rc-work-launch-icon"), document.createTextNode("Import Assignment"));
    importButton.addEventListener("click", () => openComposer("import"));

    const tip = makeEl("div", "rc-work-tip");
    const tipCopy = makeEl("span", "rc-work-tip-copy");
    tipCopy.innerHTML =
      '<strong>Tip:</strong> Completed assignments move to Library once all student work has been reviewed.';
    const libraryLink = makeEl("a", "", "Open Library →");
    libraryLink.href = "/teacher/library/";
    tip.append(makeIcon("bulb", "rc-work-launch-icon"), tipCopy, libraryLink);

    launchRow.append(newButton, importButton, tip);

    const statusGrid = makeEl("div", "rc-work-status-grid");
    statusGrid.append(
      buildStatusCard("draft", "file", "Drafts", "Not yet issued"),
      buildStatusCard("scheduled", "clock", "Scheduled", "Will release automatically"),
      buildStatusCard("active", "users", "Active", "Issued · student work in progress")
    );

    const completedCard = document.createElement("a");
    completedCard.className = "rc-work-status-card";
    completedCard.dataset.status = "completed";
    completedCard.href = "/teacher/library/";
    const completedCopy = makeEl("span", "rc-work-status-copy");
    completedCopy.appendChild(makeEl("span", "rc-work-status-title", "Completed Assignments"));
    const completedCount = makeEl("span", "rc-work-status-count", "0");
    completedCount.id = "rcWorkCount-completed";
    completedCopy.appendChild(completedCount);
    completedCopy.appendChild(makeEl("span", "rc-work-status-sub", "Available in Library"));
    completedCard.append(
      makeIcon("archive", "rc-work-status-icon"),
      completedCopy,
      makeEl("span", "rc-work-status-arrow", "→")
    );
    statusGrid.appendChild(completedCard);

    command.append(launchRow, statusGrid);
    subtitle.insertAdjacentElement("afterend", command);

    const headingRow = draftSection.querySelector(".work-row");
    const originalActions = headingRow?.querySelector(".work-actions");
    if (headingRow) headingRow.classList.add("rc-work-workspace-heading");

    draftSection.classList.add("rc-work-workspace");
    buildFilterBar(draftSection, originalActions);
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
      // Rendering can still continue; core behavior simply retains its prior preference.
    }

    const toggle = $("showIssuedToggle");
    if (toggle) toggle.checked = true;

    if (typeof window.__rcRenderTable === "function") window.__rcRenderTable();
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

      log("Loaded ✓ (approved command-center polish + lifecycle handoff + existing Work engine preserved)");
    } catch (error) {
      console.error(TAG, "Error:", error);
    }
  });
})();
/* END rc-tc-work-qol v3 */