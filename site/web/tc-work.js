(function () {
  "use strict";

  const STORAGE_KEY = "rc_tc_work_drafts_v1";
  const BATCH_COLLAPSED_KEY = "rc_tc_work_batch_collapsed_v1";
  const SHOW_ISSUED_KEY = "rc_tc_work_show_issued_v1";
  const MAX_TEXT_BYTES = 800_000; // keep localStorage safe-ish

  /** Namespace prefix used by the unified data adapter's localStore */
  const RC_NS = 'rc_unified_';

  /**
   * Scan a student's IEP goals for written expression paragraph requirements.
   * Only scans goals in writing-related goal areas to avoid false positives.
   * Returns the detected paragraph count (e.g. 2) or null if no match.
   * @param {Array} goals
   * @returns {number|null}
   */
  function detectParagraphCountFromGoals(goals) {
    const WRITING_AREAS = ['written expression', 'writing', 'written language'];
    const WORD_TO_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const WORD_PATTERN = '(?:one|two|three|four|five)';
    const patterns = [
      /writ(?:e|ing)\s+(\d+)\s+paragraph/i,
      new RegExp('writ(?:e|ing)\\s+(' + WORD_PATTERN + ')\\s+paragraph', 'i'),
      /(\d+)\s+paragraph/i,
      new RegExp('(' + WORD_PATTERN + ')\\s+paragraph', 'i'),
      /multi[- ]?paragraph/i,
      /multiple\s+paragraph/i,
    ];
    for (const goal of goals) {
      const area = (goal.goal_area || '').toLowerCase();
      if (area && !WRITING_AREAS.some(wa => area.includes(wa))) continue;
      const text = goal.desc || goal.goal_text || '';
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          if (match[1]) {
            const raw = match[1].toLowerCase();
            const count = WORD_TO_NUM[raw] ?? parseInt(raw, 10);
            if (count >= 2 && count <= 5) return count;
            // Out-of-range number — skip this pattern, try the next one
            continue;
          }
          // "multi-paragraph" or "multiple paragraphs" without a number defaults to 2
          return 2;
        }
      }
    }
    return null;
  }

  /**
   * Build a perStudentWritingConfig map from local IEP goals data.
   * For each student whose detected paragraph count exceeds the draft's base count,
   * include an entry so the backend will apply the IEP-driven override.
   * Only includes entries where the IEP count is strictly higher than the draft default,
   * since a count ≤ base is already satisfied by the base setting.
   * @param {number} baseParagraphCount - Draft's configured paragraph count (default 1)
   * @returns {Object} Map of studentCode -> paragraph count (may be empty)
   */
  function buildIepPerStudentWritingConfig(baseParagraphCount) {
    let goalsMap;
    try {
      goalsMap = JSON.parse(localStorage.getItem(RC_NS + 'iepGoals') || '{}');
    } catch (_) {
      return {};
    }
    if (!goalsMap || typeof goalsMap !== 'object') return {};
    const result = {};
    for (const [studentCode, goals] of Object.entries(goalsMap)) {
      if (!Array.isArray(goals)) continue;
      const detected = detectParagraphCountFromGoals(goals);
      if (detected != null && detected > baseParagraphCount) {
        result[studentCode] = detected;
      }
    }
    return result;
  }

  function loadBatchCollapsed() {
    try {
      const raw = localStorage.getItem(BATCH_COLLAPSED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  function saveBatchCollapsed(map) {
    try { localStorage.setItem(BATCH_COLLAPSED_KEY, JSON.stringify(map)); } catch (_) { /* noop */ }
  }

  function loadShowIssued() {
    try { return localStorage.getItem(SHOW_ISSUED_KEY) === "true"; } catch (_) { return false; }
  }

  function saveShowIssued(val) {
    try { localStorage.setItem(SHOW_ISSUED_KEY, val ? "true" : "false"); } catch (_) { /* noop */ }
  }

  const $ = (id) => document.getElementById(id);

  let editingId = null; // Track which draft is being edited

  function nowISO() {
    return new Date().toISOString();
  }

  function readDrafts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      // Filter out non-object entries (corrupted data, null, strings, numbers, nested arrays)
      return arr.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item));
    } catch (_) {
      return [];
    }
  }

  function writeDrafts(drafts) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch (err) {
      console.error('[tc-work] Failed to write drafts to localStorage:', err);
      rcAlert('Storage Error', 'Could not save drafts — storage may be full or unavailable.');
    }
  }

  function bytesOf(str) {
    try {
      return new TextEncoder().encode(str).length;
    } catch (_) {
      return str.length;
    }
  }

  function setMsg(kind, text) {
    const el = $("workMsg");
    if (!el) return;
    el.classList.remove("ok", "err", "warn");
    if (kind === "ok") el.classList.add("ok");
    else if (kind === "warn") el.classList.add("warn");
    else el.classList.add("err");
    el.textContent = text;
    el.style.display = "block";
  }

  function clearMsg() {
    const el = $("workMsg");
    if (el) el.style.display = "none";
  }

  function isoToDatetimeLocal(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      // Format as local time for the datetime-local input
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (_) {
      return "";
    }
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function safeStr(v) {
    return typeof v === "string" ? v : "";
  }

  function formatWhen(v) {
    if (!v) return "—";
    try {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return v;
      return d.toLocaleString();
    } catch (_) {
      return v;
    }
  }

  function _inferSource(d) {
    if (d.assignment && d.assignment.kind === "file")
      return `file: ${d.assignment.name || "assignment"}`;
    if (d.assignment && d.assignment.kind === "link") return `link`;
    return "—";
  }

  async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Failed to read file"));
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsText(file);
    });
  }

  // SVG constants used by renderTable
  const SVG_EDIT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  const SVG_DUPE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  const SVG_EYE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const SVG_SEND = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
  const SVG_DL   = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
  const SVG_DEL  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
  const SVG_RECALL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-4.95"></path></svg>';
  const SVG_MANAGE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';

  function makeDraftActionButtons(d) {
    const tdActions = document.createElement("td");
    tdActions.style.whiteSpace = "nowrap";

    const btnEdit = document.createElement("button");
    btnEdit.type = "button"; btnEdit.className = "work-btn"; btnEdit.title = "Edit";
    btnEdit.innerHTML = SVG_EDIT + " Edit"; // SAFETY: static SVG + static text
    btnEdit.addEventListener("click", () => startEdit(d.id));
    tdActions.appendChild(btnEdit);

    const btnDuplicate = document.createElement("button");
    btnDuplicate.type = "button"; btnDuplicate.className = "work-btn"; btnDuplicate.style.marginLeft = "8px"; btnDuplicate.title = "Duplicate";
    btnDuplicate.innerHTML = SVG_DUPE + " Duplicate"; // SAFETY: static SVG + static text
    btnDuplicate.addEventListener("click", () => duplicateOne(d.id));
    tdActions.appendChild(btnDuplicate);

    const btnPreview = document.createElement("button");
    btnPreview.type = "button"; btnPreview.className = "work-btn"; btnPreview.style.marginLeft = "8px"; btnPreview.title = "Preview";
    btnPreview.innerHTML = SVG_EYE + " Preview"; // SAFETY: static SVG + static text
    btnPreview.addEventListener("click", () => openPreview(d.id));
    tdActions.appendChild(btnPreview);

    if (!d.issuedAt) {
      const btnIssue = document.createElement("button");
      btnIssue.type = "button"; btnIssue.className = "work-btn primary"; btnIssue.style.marginLeft = "8px"; btnIssue.title = "Issue";
      btnIssue.innerHTML = SVG_SEND + " Issue"; // SAFETY: static SVG + static text
      btnIssue.addEventListener("click", () => handleIssueDraft(d.id));
      tdActions.appendChild(btnIssue);
    }

    if (d.issuedAt) {
      const btnManage = document.createElement("button");
      btnManage.type = "button"; btnManage.className = "work-btn"; btnManage.style.marginLeft = "8px"; btnManage.title = "Manage students";
      btnManage.innerHTML = SVG_MANAGE + " Manage"; // SAFETY: static SVG + static text
      btnManage.addEventListener("click", () => handleManageDraft(d.id));
      tdActions.appendChild(btnManage);

      const btnRecall = document.createElement("button");
      btnRecall.type = "button"; btnRecall.className = "work-btn danger"; btnRecall.style.marginLeft = "8px"; btnRecall.title = "Recall";
      btnRecall.innerHTML = SVG_RECALL + " Recall"; // SAFETY: static SVG + static text
      btnRecall.addEventListener("click", () => handleRecallDraft(d.id));
      tdActions.appendChild(btnRecall);
    }

    const btnExport = document.createElement("button");
    btnExport.type = "button"; btnExport.className = "work-btn"; btnExport.style.marginLeft = "8px"; btnExport.title = "Export";
    btnExport.innerHTML = SVG_DL + " Export"; // SAFETY: static SVG + static text
    btnExport.addEventListener("click", () => exportOne(d.id));
    tdActions.appendChild(btnExport);

    const btnDel = document.createElement("button");
    btnDel.type = "button"; btnDel.className = "work-btn danger"; btnDel.style.marginLeft = "8px"; btnDel.title = "Delete";
    btnDel.innerHTML = SVG_DEL + " Delete"; // SAFETY: static SVG + static text
    btnDel.addEventListener("click", () => deleteOne(d.id));
    tdActions.appendChild(btnDel);

    return tdActions;
  }

  function makeStatusBadge(d) {
    const span = document.createElement("span");
    span.style.cssText = "display:inline-block;padding:1px 7px;border-radius:8px;font-size:11px;font-weight:600;margin-left:6px;";
    if (d.issuedAt) {
      span.textContent = "✓ Issued";
      span.style.background = "rgba(34,197,94,0.15)";
      span.style.color = "rgba(34,197,94,0.9)";
      span.style.border = "1px solid rgba(34,197,94,0.3)";
    } else {
      span.textContent = "Draft";
      span.style.background = "rgba(156,163,175,0.15)";
      span.style.color = "rgba(156,163,175,0.8)";
      span.style.border = "1px solid rgba(156,163,175,0.25)";
    }
    return span;
  }

  function makeBatchStatusBadge(issuedCount, total) {
    const span = document.createElement("span");
    span.style.cssText = "display:inline-block;padding:1px 8px;border-radius:8px;font-size:11px;font-weight:600;margin-left:8px;";
    if (issuedCount === 0) {
      span.textContent = `0 of ${total} issued`;
      span.style.background = "rgba(249,115,22,0.12)";
      span.style.color = "rgba(249,115,22,0.9)";
      span.style.border = "1px solid rgba(249,115,22,0.25)";
    } else if (issuedCount === total) {
      span.textContent = "All issued ✓";
      span.style.background = "rgba(34,197,94,0.15)";
      span.style.color = "rgba(34,197,94,0.9)";
      span.style.border = "1px solid rgba(34,197,94,0.3)";
    } else {
      span.textContent = `${issuedCount} of ${total} issued`;
      span.style.background = "rgba(234,179,8,0.12)";
      span.style.color = "rgba(234,179,8,0.9)";
      span.style.border = "1px solid rgba(234,179,8,0.25)";
    }
    return span;
  }

  /**
   * Build a table cell showing the class name, with targeted student codes shown
   * as a subtitle when `d.studentCodes` is set.
   * @param {object} d - draft object
   * @returns {HTMLTableCellElement}
   */
  function makeClassCell(d) {
    const td = document.createElement("td");
    if (Array.isArray(d.studentCodes) && d.studentCodes.length > 0) {
      const classSpan = document.createElement("span");
      classSpan.textContent = safeStr(d.className) || "—"; // SAFETY: textContent
      td.appendChild(classSpan);
      const codesSpan = document.createElement("span");
      codesSpan.style.cssText = "display:block;font-size:11px;opacity:0.7;margin-top:2px;";
      codesSpan.textContent = "→ " + d.studentCodes.join(", "); // SAFETY: textContent
      td.appendChild(codesSpan);
    } else {
      td.textContent = safeStr(d.className) || "—"; // SAFETY: textContent
    }
    return td;
  }

  function renderTable(drafts) {
    const empty = $("draftsEmpty");
    const table = $("draftsTable");
    const tbody = $("draftsTbody");
    if (!empty || !table || !tbody) return;

    const showIssued = loadShowIssued();

    // Sync the toggle UI if present
    const tog = $("showIssuedToggle");
    if (tog) tog.checked = showIssued;

    // Separate batched vs ungrouped drafts
    const batchMap = new Map(); // batchId -> [drafts]
    const ungrouped = [];
    for (const d of drafts) {
      if (d.batchId) {
        if (!batchMap.has(d.batchId)) batchMap.set(d.batchId, []);
        batchMap.get(d.batchId).push(d);
      } else {
        ungrouped.push(d);
      }
    }

    // Determine what to render (apply show-issued filter)
    const batchEntries = [];
    for (const [batchId, bDrafts] of batchMap) {
      const allIssued = bDrafts.every(d => !!d.issuedAt);
      if (!showIssued && allIssued) continue; // fully-issued batch hidden when toggle is off
      batchEntries.push({ batchId, bDrafts, allIssued });
    }

    const visibleUngrouped = ungrouped.filter(d => showIssued || !d.issuedAt);

    if (batchEntries.length === 0 && visibleUngrouped.length === 0) {
      if (drafts.length > 0) {
        // There are drafts but all are hidden by the filter — show a subtle message
        empty.style.display = "none";
        table.style.display = "none";
        tbody.innerHTML = "";
        let hint = $("draftsIssuedHint");
        if (!hint) {
          hint = document.createElement("div");
          hint.id = "draftsIssuedHint";
          hint.className = "work-empty";
          hint.style.cssText = "font-size:13px;opacity:0.7;";
          table.parentNode.insertBefore(hint, table);
        }
        hint.textContent = 'All drafts have been issued. Turn on "Show issued assignments" to view them.';
        hint.style.display = "block";
      } else {
        empty.style.display = "block";
        table.style.display = "none";
        tbody.innerHTML = "";
      }
      return;
    }

    // Hide the issued hint if visible
    const existingHint = $("draftsIssuedHint");
    if (existingHint) existingHint.style.display = "none";

    empty.style.display = "none";
    table.style.display = "table";
    tbody.innerHTML = "";

    const collapsedMap = loadBatchCollapsed();

    // Render batch group rows first (they appear at top, ordered by most-recent draft createdAt)
    batchEntries.sort((a, b) => {
      const aLatest = Math.max(...a.bDrafts.map(d => new Date(d.createdAt || 0).getTime()));
      const bLatest = Math.max(...b.bDrafts.map(d => new Date(d.createdAt || 0).getTime()));
      return bLatest - aLatest; // newest first
    });

    for (const { batchId, bDrafts, allIssued } of batchEntries) {
      const total = bDrafts.length;
      const issuedCount = bDrafts.filter(d => !!d.issuedAt).length;
      const firstDraft = bDrafts[0];
      const batchTitle = safeStr(firstDraft.batchTitle) || safeStr(firstDraft.title).replace(/ — S\d+.*$/, "") || "(untitled batch)";
      const batchClass = safeStr(firstDraft.className) || "—";

      // Default: collapsed if all issued, expanded if any pending
      const isCollapsed = collapsedMap[batchId] !== undefined
        ? collapsedMap[batchId]
        : allIssued;

      // Batch header row
      const trBatch = document.createElement("tr");
      trBatch.style.cssText = "background:rgba(139,92,246,0.07);cursor:pointer;";

      const tdToggle = document.createElement("td");
      tdToggle.style.cssText = "width:28px;text-align:center;font-size:13px;user-select:none;";
      tdToggle.textContent = isCollapsed ? "▶" : "▼";
      trBatch.appendChild(tdToggle);

      const tdBatchTitle = document.createElement("td");
      tdBatchTitle.colSpan = 3;
      const titleSpan = document.createElement("span");
      titleSpan.style.cssText = "font-weight:600;";
      titleSpan.textContent = batchTitle; // SAFETY: textContent, no HTML injection
      tdBatchTitle.appendChild(titleSpan);
      const countSpan = document.createElement("span");
      countSpan.style.cssText = "opacity:0.65;font-size:12px;margin-left:8px;";
      countSpan.textContent = `${total} draft${total !== 1 ? "s" : ""} · ${batchClass}`;
      tdBatchTitle.appendChild(countSpan);
      tdBatchTitle.appendChild(makeBatchStatusBadge(issuedCount, total));
      trBatch.appendChild(tdBatchTitle);

      // Batch action buttons
      const tdBatchActions = document.createElement("td");
      tdBatchActions.style.whiteSpace = "nowrap";

      const unissuedInBatch = bDrafts.filter(d => !d.issuedAt);
      if (unissuedInBatch.length > 0) {
        const btnIssueAll = document.createElement("button");
        btnIssueAll.type = "button"; btnIssueAll.className = "work-btn primary"; btnIssueAll.title = "Issue all in batch";
        btnIssueAll.innerHTML = SVG_SEND + " Issue All"; // SAFETY: static SVG + static text
        btnIssueAll.addEventListener("click", (e) => { e.stopPropagation(); issueAllInBatch(batchId); });
        tdBatchActions.appendChild(btnIssueAll);
      }

      const issuedInBatch = bDrafts.filter(d => !!d.issuedAt);
      if (issuedInBatch.length > 0) {
        const btnRecallAll = document.createElement("button");
        btnRecallAll.type = "button"; btnRecallAll.className = "work-btn danger"; btnRecallAll.style.marginLeft = "8px"; btnRecallAll.title = "Recall all issued in batch";
        btnRecallAll.innerHTML = SVG_RECALL + " Recall All"; // SAFETY: static SVG + static text
        btnRecallAll.addEventListener("click", (e) => { e.stopPropagation(); recallAllInBatch(batchId); });
        tdBatchActions.appendChild(btnRecallAll);
      }

      const btnExportAll = document.createElement("button");
      btnExportAll.type = "button"; btnExportAll.className = "work-btn"; btnExportAll.style.marginLeft = "8px"; btnExportAll.title = "Export all in batch";
      btnExportAll.innerHTML = SVG_DL + " Export All"; // SAFETY: static SVG + static text
      btnExportAll.addEventListener("click", (e) => { e.stopPropagation(); bDrafts.forEach(d => exportOne(d.id)); });
      tdBatchActions.appendChild(btnExportAll);

      trBatch.appendChild(tdBatchActions);
      tbody.appendChild(trBatch);

      // Toggle collapse on row click
      trBatch.addEventListener("click", () => {
        const newCollapsed = !isCollapsed;
        const cm = loadBatchCollapsed();
        cm[batchId] = newCollapsed;
        saveBatchCollapsed(cm);
        renderTable(readDrafts());
      });

      if (!isCollapsed) {
        // Render child draft rows
        for (const d of bDrafts) {
          const tr = document.createElement("tr");
          tr.style.cssText = "background:rgba(139,92,246,0.03);";

          // Indent column (takes the place of toggle column in batch header)
          const tdIndent = document.createElement("td");
          tdIndent.style.cssText = "padding-left:24px;opacity:0.4;font-size:11px;";
          tdIndent.textContent = "└";
          tr.appendChild(tdIndent);

          const tdTitle = document.createElement("td");
          {
            const sp = document.createElement("span");
            sp.textContent = safeStr(d.title) || "(untitled)"; // SAFETY: textContent
            tdTitle.appendChild(sp);
            tdTitle.appendChild(makeStatusBadge(d));
          }
          tr.appendChild(tdTitle);

          const tdClass = makeClassCell(d);
          tr.appendChild(tdClass);

          const tdWhen = document.createElement("td");
          const releaseDiv = document.createElement("div");
          releaseDiv.textContent = "Release: " + formatWhen(d.releaseAt);
          if (d.autoRelease) {
            const clockIcon = document.createElement("span");
            // SAFETY: static SVG, no user data
            clockIcon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px; margin-left:4px; opacity:0.7;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
            releaseDiv.appendChild(clockIcon);
          }
          const dueDiv = document.createElement("div");
          dueDiv.textContent = "Due: " + formatWhen(d.dueAt);
          tdWhen.appendChild(releaseDiv);
          tdWhen.appendChild(dueDiv);
          tr.appendChild(tdWhen);

          tr.appendChild(makeDraftActionButtons(d));
          tbody.appendChild(tr);
        }
      }
    }

    // Render ungrouped drafts (sorted newest first)
    ungrouped.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    for (const d of visibleUngrouped) {
      const tr = document.createElement("tr");

      // Empty first column (aligns with batch toggle column)
      const tdEmpty = document.createElement("td");
      tr.appendChild(tdEmpty);

      const tdTitle = document.createElement("td");
      const sp = document.createElement("span");
      sp.textContent = safeStr(d.title) || "(untitled)"; // SAFETY: textContent
      tdTitle.appendChild(sp);
      tdTitle.appendChild(makeStatusBadge(d));
      tr.appendChild(tdTitle);

      const tdClass = makeClassCell(d);
      tr.appendChild(tdClass);

      const tdWhen = document.createElement("td");
      const releaseDiv = document.createElement("div");
      releaseDiv.textContent = "Release: " + formatWhen(d.releaseAt);
      if (d.autoRelease) {
        const clockIcon = document.createElement("span");
        // SAFETY: static SVG, no user data
        clockIcon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px; margin-left:4px; opacity:0.7;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
        releaseDiv.appendChild(clockIcon);
      }
      const dueDiv = document.createElement("div");
      dueDiv.textContent = "Due: " + formatWhen(d.dueAt);
      tdWhen.appendChild(releaseDiv);
      tdWhen.appendChild(dueDiv);
      tr.appendChild(tdWhen);

      tr.appendChild(makeDraftActionButtons(d));
      tbody.appendChild(tr);
    }
  }

  let previewingId = null;

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Back-compat: mega-split drafts used .snippet; canonical is .text.
  function getAssignmentText(d) {
    return safeStr(d && d.assignment && (d.assignment.text || d.assignment.snippet)) || "";
  }
  function getMappingText(d) {
    return safeStr(d && d.mapping && (d.mapping.text || d.mapping.snippet)) || "";
  }

  function stripTeacherTags(text) {
    const raw = String(text || "");
    const lines = raw.split(/\r?\n/);
    // Enhanced regex to catch ALL tag formats:
    // - [MLS: code], [MLS.code]
    // - [DESE: code], [DESE: MLS.code]
    // - [IG: code], [IEP: code]
    const tagRe = /\[\s*(?:(?:DESE|MLS)\s*[.:]\s*[^\]]+|(?:IG|IEP)\s*:\s*[^\]]+)\s*\]/gi;
    const out = [];
    for (const line of lines) {
      // Skip entire line if it's a labeled format (DESE Standard(s): or IEP Goal Code(s): or IEP Goal(s):)
      if (/^\s*(?:DESE\s+Standards?(?:\(s\))?|IEP\s+Goal(?:\s+Codes?)?(?:\(s\))?)\s*:/i.test(line)) {
        continue; // Skip this line entirely
      }
      
      let cleaned = line
        .replace(tagRe, "")
        .replace(/[ \t]{2,}/g, " ")
        .trimEnd();
      // Student View: strip common inline answer markers at end of option lines (✓/✔)
      if (/^\s*[a-dA-D][.)]\s+/.test(cleaned))
        cleaned = cleaned.replace(/[ \t]*\(?[✓✔]\)?\s*$/, "");
      out.push(cleaned);
    }
    return out
      .join("\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  }
  // Join tag-only lines onto the preceding question line so auto-mapping can see them.
  // BUG 6 FIX: Make __rc_joinTagOnlyLines() more flexible - scan upward past blank lines
  function __rc_joinTagOnlyLines(text) {
    const lines = String(text || "").split(/\r?\n/);
    const tagOnlyRe = /^\s*(?:\[(?:MLS|DESE|IG|IEP)\s*[.:][^\]]+\]\s*)+$/i;
    // Updated regex to match Question N: format too
    const qStartRe = /^\s*(?:Question\s+)?(?:Q\s*)?\d+\s*[.):]\s+/i;
    const MAX_TAG_SCAN_LINES = 20; // Maximum lines to scan upward for question
    
    for (let i = 1; i < lines.length; i++) {
      if (tagOnlyRe.test(lines[i])) {
        // Scan upward to find nearest question line
        let targetIdx = -1;
        for (let j = i - 1; j >= 0 && j >= i - MAX_TAG_SCAN_LINES; j--) {
          const ln = lines[j].trim();
          if (!ln) continue; // Skip blank lines
          if (qStartRe.test(lines[j])) {
            targetIdx = j;
            break;
          }
          // Stop if we hit a section header or other structural element
          if (/^\s*(LANGUAGE\s+ARTS|LIFE\s+SKILLS|DAY\s+\d+|WRITTEN\s+RESPONSE|={3,})\b/i.test(lines[j])) {
            break;
          }
        }
        
        if (targetIdx >= 0) {
          lines[targetIdx] = lines[targetIdx].replace(/\s*$/, " ") + lines[i].trim();
          lines[i] = "";
        }
      }
    }
    return lines.join("\n");
  }

  function fileExt(name) {
    const n = String(name || "").toLowerCase();
    const m = n.match(/\.([a-z0-9]+)$/i);
    return m ? m[1] : "";
  }

  function renderStudentPreviewHtml(d) {
    const title = escapeHtml((d && d.title) || "Draft Preview");
    const cls = escapeHtml((d && (d.className || d.class)) || "");
    const notes = escapeHtml((d && d.notes) || "");

    const kind = (d && d.assignment && d.assignment.kind) || "";
    const link = (d && d.assignment && d.assignment.link) || "";
    const name = (d && d.assignment && d.assignment.name) || "";
    const text = getAssignmentText(d);

    let bodyHtml = "";
    if (kind === "link" && link) {
      const safeLink = escapeHtml(link);
      bodyHtml = `
        <div class="pv-content-card" style="white-space:normal;">
          <div style="font-weight:700; margin-bottom:6px;">Google Form link</div>
          <div><a href="${safeLink}" target="_blank" rel="noopener noreferrer">${safeLink}</a></div>
          <div style="opacity:.8; margin-top:8px; font-size:13px;">Student view will open this link in a new tab.</div>
        </div>
      `;
    } else if (kind === "file") {
      const ext = fileExt(name);
      if (ext === "pdf") {
        bodyHtml = `<div class="pv-content-card" style="white-space:normal; opacity:.85;">PDF uploaded. Preview can't render PDFs (will work once upload/storage is implemented).</div>`;
      } else if (ext === "html" || ext === "htm") {
        const studentHtml = stripTeacherTags(text);
        const srcdoc = escapeHtml(studentHtml || "<p>(No HTML stored for this draft.)</p>");
        bodyHtml = `
          <div style="opacity:.7; margin-bottom:8px; font-size:13px;">Rendered Student View (sandboxed)</div>
          <iframe sandbox="allow-same-origin" style="width:100%; height:520px; border:1px solid rgba(255,255,255,.12); border-radius:var(--rc-radius); background:#0b0f0d;"
            srcdoc="${srcdoc}"></iframe>
        `;
      } else {
        const studentText = stripTeacherTags(text);
        const shown = studentText
          ? escapeHtml(studentText)
          : "(No assignment text stored for this draft.)";
        bodyHtml = `<div class="pv-content-card" data-preview-text>${shown}</div>`;
      }
    } else {
      bodyHtml = `<div class="pv-content-card" style="white-space:normal; opacity:.85;">(No assignment content found for this draft.)</div>`;
    }

    return `
      <div>
        <div class="pv-meta-card">
          <div style="font-weight:800; font-size:16px;">${title}</div>
          ${cls ? `<div style="opacity:.85; margin-top:4px;"><strong>Class:</strong> ${cls}</div>` : ``}
          ${notes ? `<div style="opacity:.85; margin-top:4px;"><strong>Notes:</strong> ${notes}</div>` : ``}
          <div style="opacity:.6; margin-top:6px; font-size:12px; text-transform:uppercase; letter-spacing:.04em;">Student View \u2014 DESE/IEP tags hidden</div>
        </div>
        ${bodyHtml}
      </div>
    `;
  }

  function renderTeacherPreviewHtml(d) {
    const title = escapeHtml((d && d.title) || "Draft Preview");
    const cls = escapeHtml((d && (d.className || d.class)) || "");
    const notes = escapeHtml((d && d.notes) || "");

    const kind = (d && d.assignment && d.assignment.kind) || "";
    const link = (d && d.assignment && d.assignment.link) || "";
    const name = (d && d.assignment && d.assignment.name) || "";
    const text = getAssignmentText(d);

    let bodyHtml = "";
    if (kind === "link" && link) {
      const safeLink = escapeHtml(link);
      bodyHtml = `
        <div class="pv-content-card" style="white-space:normal;">
          <div style="font-weight:700; margin-bottom:6px;">Google Form link</div>
          <div><a href="${safeLink}" target="_blank" rel="noopener noreferrer">${safeLink}</a></div>
          <div style="opacity:.8; margin-top:8px; font-size:13px;">Teacher view: mapping required when using links.</div>
        </div>
      `;
    } else if (kind === "file") {
      const ext = fileExt(name);
      if (ext === "pdf") {
        bodyHtml = `<div class="pv-content-card" style="white-space:normal; opacity:.85;">PDF uploaded. Teacher preview can't render PDFs yet (will work once upload/storage is implemented).</div>`;
      } else {
        const shown = text ? escapeHtml(text) : "(No assignment text stored for this draft.)";
        bodyHtml = `<div class="pv-content-card">${shown}</div>`;
      }
    } else {
      bodyHtml = `<div class="pv-content-card" style="white-space:normal; opacity:.85;">(No assignment content found for this draft.)</div>`;
    }

    return `
      <div>
        <div class="pv-meta-card">
          <div style="font-weight:800; font-size:16px;">${title}</div>
          ${cls ? `<div style="opacity:.85; margin-top:4px;"><strong>Class:</strong> ${cls}</div>` : ``}
          ${notes ? `<div style="opacity:.85; margin-top:4px;"><strong>Notes:</strong> ${notes}</div>` : ``}
          <div style="opacity:.6; margin-top:6px; font-size:12px; text-transform:uppercase; letter-spacing:.04em;">Teacher View \u2014 codes visible</div>
        </div>
        ${bodyHtml}
      </div>
    `;
  }

  // Section color palette (cycles for > 4 sections)
  var SECTION_COLORS = [
    { border: "rgba(59,130,246,0.7)",  bg: "rgba(59,130,246,0.12)",  text: "rgba(59,130,246,0.95)" },
    { border: "rgba(245,158,11,0.7)",  bg: "rgba(245,158,11,0.12)",  text: "rgba(245,158,11,0.95)" },
    { border: "rgba(16,185,129,0.7)",  bg: "rgba(16,185,129,0.12)",  text: "rgba(16,185,129,0.95)" },
    { border: "rgba(139,92,246,0.7)",  bg: "rgba(139,92,246,0.12)",  text: "rgba(139,92,246,0.95)" },
    { border: "rgba(236,72,153,0.7)",  bg: "rgba(236,72,153,0.12)",  text: "rgba(236,72,153,0.95)" },
    { border: "rgba(20,184,166,0.7)",  bg: "rgba(20,184,166,0.12)",  text: "rgba(20,184,166,0.95)" },
  ];

  function renderMappingPreviewHtml(d) {
    const raw = getMappingText(d);
    if (!raw) return `<div class="pv-meta-card" style="opacity:.85;">(No mapping content stored for this draft.)</div>`;

    // Try JSON first (auto-map + JSON mapping)
    try {
      const obj = JSON.parse(raw);

      const allSections = Array.isArray(obj.sections) ? obj.sections : [];
      const warnings = Array.isArray(obj.warnings) ? obj.warnings : [];
      const counts = obj.counts || {};

      // Filter sections to only those matching the draft's className
      const CLASS_HEADER_RE = /^\s*(LANGUAGE\s+ARTS|LIFE\s+SKILLS)\b/i;
      const sections = d && d.className
        ? allSections.filter((s) => {
            const t = String(s && s.title ? s.title : "");
            // Keep section if its title contains the draft's className,
            // or if it does NOT match any known class header pattern (generic sections)
            if (!CLASS_HEADER_RE.test(t)) return true;
            return t.toUpperCase().includes(d.className.toUpperCase());
          })
        : allSections;
      const sectionCount = sections.length;

      let itemsCount = 0;
      for (const s of sections) itemsCount += Array.isArray(s.items) ? s.items.length : 0;

      const warnCount = Number.isFinite(counts.warnings) ? counts.warnings : warnings.length;

      // Section cards (like quarter date cards)
      const sectionCards = sections
        .map((s, idx) => {
          const color = SECTION_COLORS[idx % SECTION_COLORS.length];
          const sTitle = escapeHtml(s && s.title ? s.title : "Section");
          const items = Array.isArray(s.items) ? s.items : [];
          const rows = items
            .slice(0, 20)
            .map((it) => {
              const key = escapeHtml(it && it.key ? it.key : "");
              const question = escapeHtml(it && it.question ? it.question : "");
              const dese = escapeHtml(Array.isArray(it && it.dese) ? it.dese.join(", ") : "");
              const iep = escapeHtml(Array.isArray(it && it.iep) ? it.iep.join(", ") : "");
              const questionDisplay = question
                ? `${question.length > 80 ? question.slice(0, 80) + "\u2026" : question}<br><span style="opacity:.5; font-size:10px;">${key}</span>`
                : key;
              return `
                <tr>
                  <td style="padding:5px 6px; border-bottom:1px solid rgba(255,255,255,.07); vertical-align:top;">${questionDisplay}</td>
                  <td style="padding:5px 6px; border-bottom:1px solid rgba(255,255,255,.07); vertical-align:top; opacity:.9;">${dese}</td>
                  <td style="padding:5px 6px; border-bottom:1px solid rgba(255,255,255,.07); vertical-align:top; opacity:.9;">${iep}</td>
                </tr>
              `;
            })
            .join("");
          const moreNote = items.length > 20
            ? `<div style="opacity:.6; font-size:11px; margin-top:6px;">\u2026 and ${items.length - 20} more items</div>`
            : "";
          const tableHtml = rows
            ? `
              <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead><tr>
                  <th style="text-align:left; padding:4px 6px; border-bottom:1px solid rgba(255,255,255,.12); opacity:.7; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.03em;">Question</th>
                  <th style="text-align:left; padding:4px 6px; border-bottom:1px solid rgba(255,255,255,.12); opacity:.7; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.03em;">DESE</th>
                  <th style="text-align:left; padding:4px 6px; border-bottom:1px solid rgba(255,255,255,.12); opacity:.7; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.03em;">IEP</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
              ${moreNote}
            `
            : `<div style="opacity:.6; font-size:12px;">(no items)</div>`;
          return `
            <div style="padding:14px 16px; border-radius:var(--rc-radius); border:1px solid rgba(255,255,255,.1); border-left:3px solid ${color.border}; background:${color.bg};">
              <div style="font-size:13px; font-weight:700; color:${color.text}; margin:0 0 10px 0;">${sTitle} <span style="opacity:.6; font-weight:400; font-size:11px;">(${items.length})</span></div>
              ${tableHtml}
            </div>
          `;
        })
        .join("");

      // Warnings card
      const warnHtml = warnCount
        ? `
          <div style="margin-top:12px; padding:12px 14px; border-radius:var(--rc-radius); border:1px solid rgba(245,158,11,0.4); background:rgba(245,158,11,0.1);">
            <div style="font-weight:700; margin-bottom:6px; color:rgba(245,158,11,0.95);">\u26a0 Warnings (${warnCount})</div>
            <div style="white-space:pre-wrap; font-size:12px; line-height:1.5;">${escapeHtml(warnings.slice(0, 40).join("\n"))}${warnings.length > 40 ? "\n\u2026(truncated)" : ""}</div>
          </div>
        `
        : "";

      return `
        <div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); border-radius:var(--rc-radius); overflow:hidden; border:1px solid var(--rc-glass-border); margin-bottom:16px;">
            <div style="padding:10px 12px; text-align:center; background:rgba(59,130,246,0.16); display:flex; flex-direction:column; gap:2px;">
              <span style="font-weight:700; font-size:18px;">${sectionCount}</span>
              <span style="opacity:.75; font-size:11px; text-transform:uppercase; letter-spacing:.04em;">Sections</span>
            </div>
            <div style="padding:10px 12px; text-align:center; background:rgba(16,185,129,0.16); display:flex; flex-direction:column; gap:2px;">
              <span style="font-weight:700; font-size:18px;">${itemsCount}</span>
              <span style="opacity:.75; font-size:11px; text-transform:uppercase; letter-spacing:.04em;">Items</span>
            </div>
            <div style="padding:10px 12px; text-align:center; background:rgba(245,158,11,0.16); display:flex; flex-direction:column; gap:2px;">
              <span style="font-weight:700; font-size:18px;">${warnCount}</span>
              <span style="opacity:.75; font-size:11px; text-transform:uppercase; letter-spacing:.04em;">Warnings</span>
            </div>
          </div>
          ${sectionCards ? `<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; margin-bottom:12px;">${sectionCards}</div>` : ""}
          ${warnHtml}
          <details style="margin-top:12px;">
            <summary style="cursor:pointer; opacity:.7; font-size:13px;">Raw mapping JSON</summary>
            <pre style="white-space:pre-wrap; margin-top:8px; padding:10px; border-radius:var(--rc-radius); border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.22); font-size:11px;">${escapeHtml(raw.slice(0, 120000))}${raw.length > 120000 ? "\n\u2026(truncated)\n" : ""}</pre>
          </details>
        </div>
      `;
    } catch (_) {
      // Not JSON (CSV or other): just show raw
      return `
        <div>
          <div style="opacity:.7; font-size:13px; margin-bottom:10px; padding:10px 14px; border-radius:var(--rc-radius); border:1px solid var(--rc-glass-border); background:rgba(0,0,0,.2);">Mapping (raw \u2014 not JSON)</div>
          <pre style="white-space:pre-wrap; line-height:1.4; padding:12px; border-radius:var(--rc-radius); border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.22);">${escapeHtml(raw.slice(0, 120000))}${raw.length > 120000 ? "\n\u2026(truncated)\n" : ""}</pre>
        </div>
      `;
    }
  }

  function wirePreviewTabs(root) {
    const btns = Array.from(root.querySelectorAll("[data-pv-tab]"));
    const panes = {
      student: root.querySelector("[data-pv-pane='student']"),
      teacher: root.querySelector("[data-pv-pane='teacher']"),
      mapping: root.querySelector("[data-pv-pane='mapping']"),
    };

    const setActive = (name) => {
      for (const b of btns) {
        const isOn = b.getAttribute("data-pv-tab") === name;
        b.classList.toggle("active", isOn);
      }
      for (const k of Object.keys(panes)) {
        if (panes[k]) panes[k].hidden = k !== name;
      }
    };

    for (const b of btns) {
      b.addEventListener("click", () => setActive(b.getAttribute("data-pv-tab")));
    }

    setActive("student");
  }

  function openPreview(id) {
    const drafts = readDrafts();
    const d = drafts.find((x) => x.id === id);
    if (!d) return;

    previewingId = id;

    // rc-mapping-regenerate v1
    // Backstop: if this draft has no stored mapping, regenerate it from assignment text
    // (fixes older drafts + formats where tags land on separate lines).
    try {
      const rawMap = getMappingText(d);
      const rawAsn = getAssignmentText(d);
      if (!rawMap && rawAsn) {
        const norm =
          typeof normalizeTaggedAssignmentText === "function"
            ? normalizeTaggedAssignmentText(rawAsn)
            : rawAsn;
        const auto = autoMapFromTeacherTxt(norm);
        const mappingText = JSON.stringify(
          auto || {
            version: 1,
            sections: [],
            warnings: ["Auto-mapping unavailable"],
            counts: { sections: 0, items: 0, warnings: 1 },
          },
          null,
          2
        );
        d.mapping = d.mapping || { kind: "auto", name: "auto-mapping.json", text: null };
        d.mapping.kind = d.mapping.kind || "auto";
        d.mapping.name = d.mapping.name || "auto-mapping.json";
        d.mapping.text = mappingText;
        writeDrafts(drafts);
      }
    } catch (_) {
      /* ignore */
    }

    const overlay = $("draftOverlay");
    const title = $("previewTitle");
    const body = $("previewBody");
    if (!overlay || !title || !body) return;

    title.textContent = safeStr(d.title) || "Draft Preview";

    body.innerHTML = `
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <button type="button" class="work-btn" data-pv-tab="student">Student</button>
        <button type="button" class="work-btn" data-pv-tab="teacher">Teacher</button>
        <button type="button" class="work-btn" data-pv-tab="mapping">Mapping</button>
      </div>

      <div data-pv-pane="student">${renderStudentPreviewHtml(d)}</div>
      <div data-pv-pane="teacher" hidden>${renderTeacherPreviewHtml(d)}</div>
      <div data-pv-pane="mapping" hidden>${renderMappingPreviewHtml(d)}</div>
    `;

    wirePreviewTabs(body);

    overlay.hidden = false;
  }

  function closePreview() {
    const overlay = $("draftOverlay");
    if (overlay) overlay.hidden = true;
    previewingId = null;
  }

  function exportOne(id) {
    const drafts = readDrafts();
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    const safeName = (safeStr(d.title) || "draft").replace(/[^\w-]+/g, "_").slice(0, 64);
    download(`tc-draft_${safeName}_${d.id}.json`, JSON.stringify(d, null, 2));
  }

  async function deleteOne(id) {
    if (!await rcConfirm('Delete Draft', 'Delete this draft? This cannot be undone.', 'Delete', { danger: true })) return;
    const drafts = readDrafts();
    const next = drafts.filter((x) => x.id !== id);
    writeDrafts(next);
    renderTable(next);
    
    // Remote sync
    remoteDeleteDraft(id);
    
    setMsg("ok", "Draft deleted.");
    setTimeout(clearMsg, 1200);
  }

  function duplicateOne(id) {
    const drafts = readDrafts();
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    const copy = Object.assign({}, d, {
      id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: (safeStr(d.title) || "draft") + " (Copy)",
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });
    const next = [...drafts, copy];
    writeDrafts(next);
    renderTable(next);
    setMsg("ok", "Draft duplicated.");
    setTimeout(clearMsg, 1200);
  }

  function exportAll() {
    const drafts = readDrafts();
    download(
      `work-drafts-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(drafts, null, 2)
    );
  }

  async function clearAll() {
    if (!await rcConfirm('Clear All Drafts', 'Clear ALL drafts stored in this browser?', 'Clear All', { danger: true })) return;
    const old = readDrafts(); // get IDs before clearing
    writeDrafts([]);
    renderTable([]);
    
    // Delete each from remote
    for (const d of old) {
      remoteDeleteDraft(d.id);
    }
    
    setMsg("ok", "All drafts cleared.");
    setTimeout(clearMsg, 1200);
  }

  function startEdit(id) {
    const drafts = readDrafts();
    const d = drafts.find((x) => x.id === id);
    if (!d) return;

    // Store the editing draft ID
    editingId = id;

    // Populate form fields
    $("draftTitle").value = d.title || "";
    
    // Set class if it exists in the dropdown
    const classSelect = $("draftClass");
    if (classSelect) {
      classSelect.value = d.className || "";
    }

    // Convert ISO dates to datetime-local format
    $("draftRelease").value = isoToDatetimeLocal(d.releaseAt);
    $("draftDue").value = isoToDatetimeLocal(d.dueAt);
    $("draftNotes").value = d.notes || "";
    if ($("draftAutoRelease")) $("draftAutoRelease").checked = !!d.autoRelease;
    if ($("draftStudentCodes")) {
      $("draftStudentCodes").value = Array.isArray(d.studentCodes) ? d.studentCodes.join(", ") : "";
    }

    // Update file labels to show current files
    const aLabel = $("assignmentFileName");
    if (aLabel) {
      if (d.assignment && d.assignment.name) {
        aLabel.textContent = `Currently: ${d.assignment.name}`;
      } else if (d.assignment && d.assignment.link) {
        aLabel.textContent = "Currently: Link (see below)";
      } else {
        aLabel.textContent = "No file selected";
      }
    }

    const mLabel = $("mappingFileName");
    if (mLabel) {
      if (d.mapping && d.mapping.name) {
        mLabel.textContent = `Currently: ${d.mapping.name}`;
      } else {
        mLabel.textContent = "No file selected";
      }
    }

    // Populate assignment link if it exists
    const linkInput = $("assignmentLink");
    if (linkInput && d.assignment && d.assignment.link) {
      linkInput.value = d.assignment.link;
    }

    // Change Save button to Update
    const saveBtn = $("btnSaveDraft");
    if (saveBtn) saveBtn.textContent = "Update Draft";

    // Show Cancel button
    const cancelBtn = $("btnCancelEdit");
    if (cancelBtn) cancelBtn.style.display = "";

    // Populate scoring defaults if available in draft.meta
    const meta = d.meta || {};
    const sd = meta.scoring_defaults || {};
    if ($("scoringMcq")) $("scoringMcq").value = sd.mcq != null ? sd.mcq : 1;
    if ($("scoringBoolean")) $("scoringBoolean").value = sd.boolean != null ? sd.boolean : 1;
    if ($("scoringConstructed")) $("scoringConstructed").value = sd.constructed != null ? sd.constructed : 5;
    if ($("scoringMulti")) $("scoringMulti").value = sd.multi != null ? sd.multi : 1;

    // Populate writing config
    const wc = d.writingConfig || {};
    if ($("draftParagraphCount")) $("draftParagraphCount").value = wc.paragraph_count != null ? wc.paragraph_count : 1;

    // Scroll form into view
    const form = $("workDraftForm");
    if (form) {
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setMsg("ok", "Editing draft: " + (d.title || "(untitled)"));
  }

  function cancelEdit() {
    editingId = null;
    $("workDraftForm").reset();
    if ($("draftAutoRelease")) $("draftAutoRelease").checked = false;
    
    const saveBtn = $("btnSaveDraft");
    if (saveBtn) saveBtn.textContent = "Save Draft";
    
    const cancelBtn = $("btnCancelEdit");
    if (cancelBtn) cancelBtn.style.display = "none";
    
    // Reset file labels
    const aLabel = $("assignmentFileName");
    if (aLabel) aLabel.textContent = "No file selected";
    
    const mLabel = $("mappingFileName");
    if (mLabel) mLabel.textContent = "No file selected";
    
    clearMsg();
  }

  function rcIsTextFile(file) {
    if (!file) return false;
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "").toLowerCase();
    if (type.startsWith("text/")) return true;
    return (
      name.endsWith(".txt") ||
      name.endsWith(".md") ||
      name.endsWith(".csv") ||
      name.endsWith(".json") ||
      name.endsWith(".html") ||
      name.endsWith(".htm")
    );
  }

  function fillExample() {
    $("draftTitle").value = "Week 1 — ADIT — Day 1 Assignment";
    $("draftClass").value = "LA 1 SC";
    $("draftNotes").value = "Example draft. Replace with real content.";
    $("assignmentLink").value = "https://docs.google.com/forms/d/EXAMPLE/viewform";
  }

  function autoMapFromTeacherTxt(text) {
    const out = {
      version: 1,
      sections: [],
      warnings: [],
      counts: { sections: 0, items: 0, warnings: 0 },
    };
    const lines = String(text || "").split(/\r?\n/);

    let cur = null;
    let pendingWR = null;
    let wrIndex = 0;
    // BUG 3 FIX: Track current day for subsectioning
    let currentDay = null;

    const uniq = (arr) =>
      Array.from(new Set((arr || []).map((x) => String(x || "").trim()).filter(Boolean)));

    const startSection = (title) => {
      const t = String(title || "Assignment").trim() || "Assignment";
      cur = { title: t, items: [] };
      out.sections.push(cur);
      // Reset day tracking when starting new section
      currentDay = null;
    };

    const addItem = (key, tags, question) => {
      if (!cur) startSection("Assignment");
      const item = { key: String(key), dese: uniq(tags?.dese), iep: uniq(tags?.iep) };
      if (question) item.question = String(question).trim();
      cur.items.push(item);
    };

    const parseTagsFromLine = (line) => {
      const tags = { dese: [], iep: [] };
      const matches = String(line || "").match(/\[[^\]]+\]/g) || [];
      for (const raw of matches) {
        const inner = raw.slice(1, -1).trim();
        if (!inner) continue;

        if (/^(MLS[.:]|DESE:)/i.test(inner)) {
          tags.dese.push(inner.replace(/^(?:DESE|MLS)\s*[.:]\s*/i, "").trim());
        } else if (/^(IG:|IEP:)/i.test(inner)) {
          tags.iep.push(inner.replace(/^(?:IG|IEP)\s*:\s*/i, "").trim());
        }
      }
      return tags;
    };

    const isSectionLine = (line) => /^\s*(LANGUAGE\s+ARTS|LIFE\s+SKILLS)\b/i.test(line);
    // BUG 2 FIX: Match "Question N:" format in addition to "Q1." and "1."
    const isQuestionLine = (line) => /^\s*(?:Question\s+)?(?:Q\s*)?\d+\s*[.):]\s*/i.test(line);
    // BUG 3 FIX: Detect day headers
    const isDayLine = (line) => /^\s*DAY\s+(\d+)\b/i.test(line);
    // BUG 4 FIX: Detect writing prompt lines
    const isWritingPromptLine = (line) => /^\s*(?:DAY\s+\d+[\s:]*)?WRITING\s+(?:PROMPT|WORKSHOP)\b/i.test(line);
    const isWrittenResponseLine = (line) => /^\s*WRITTEN\s+RESPONSE\b/i.test(line);
    const isTagLine = (line) =>
      /\[[^\]]+\]/.test(line) &&
      (/\bMLS\b/i.test(line) ||
        /\bIG:/i.test(line) ||
        /\bIEP:/i.test(line) ||
        /\bDESE:/i.test(line));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (isSectionLine(line)) {
        startSection(line.trim());
        pendingWR = null;
        continue;
      }

      // BUG 3 FIX: Detect day headers for subsectioning
      if (isDayLine(line)) {
        const dm = line.match(/^\s*DAY\s+(\d+)\b/i);
        currentDay = dm ? dm[1] : null;
        pendingWR = null;
        continue;
      }

      // BUG 4 FIX: Detect writing prompts as mappable items
      if (isWritingPromptLine(line)) {
        const wpKey = currentDay ? `D${currentDay}.WP` : "WP";
        // Look ahead for tags
        let tags = { dese: [], iep: [] };
        for (let j = i + 1; j < lines.length; j++) {
          const l2 = lines[j];
          if (isQuestionLine(l2) || isSectionLine(l2) || isDayLine(l2)) break;
          if (isTagLine(l2)) {
            const more = parseTagsFromLine(l2);
            tags = {
              dese: (tags.dese || []).concat(more.dese || []),
              iep: (tags.iep || []).concat(more.iep || []),
            };
          }
        }
        addItem(wpKey, tags, line.trim());
        pendingWR = null;
        continue;
      }

      if (isWrittenResponseLine(line)) {
        wrIndex += 1;
        const wrKey = "WR" + wrIndex;
        // Check if tags are on the same line
        if (isTagLine(line)) {
          addItem(wrKey, parseTagsFromLine(line));
          pendingWR = null;
        } else {
          pendingWR = wrKey;
        }
        continue;
      }

      if (isQuestionLine(line)) {
        // BUG 2 FIX: Update regex to match "Question N:" format
        const qm = line.match(/^\s*(?:Question\s+)?(?:Q\s*)?(\d+)\s*[.):]/i);
        const qNum = qm ? qm[1] : "";
        // BUG 3 FIX: Prefix question with day number if in a day section
        const qKey = currentDay ? `D${currentDay}.Q${qNum}` : `Q${qNum}`;
        // Extract question text: content after the number prefix
        const qText = qm ? line.slice(line.indexOf(qm[0]) + qm[0].length).replace(/\[[^\]]*\]/g, "").trim() : "";
        let tags = parseTagsFromLine(line);

        // BUG 5 FIX: Collect ALL tag lines between questions (not just first)
        for (let j = i + 1; j < lines.length; j++) {
          const l2 = lines[j];
          // Stop at next question, section, day, writing prompt, or written response
          if (isQuestionLine(l2) || isSectionLine(l2) || isDayLine(l2) || isWritingPromptLine(l2) || isWrittenResponseLine(l2)) break;
          if (isTagLine(l2)) {
            const more = parseTagsFromLine(l2);
            tags = {
              dese: (tags.dese || []).concat(more.dese || []),
              iep: (tags.iep || []).concat(more.iep || []),
            };
          }
        }

        addItem(qKey, tags, qText);
        pendingWR = null;
        continue;
      }

      if (pendingWR && isTagLine(line)) {
        addItem(pendingWR, parseTagsFromLine(line));
        pendingWR = null;
        continue;
      }
    }

    let warn = 0;
    let items = 0;
    for (const s of out.sections) {
      for (const it of s.items || []) {
        items += 1;
        if ((!it.dese || it.dese.length === 0) && (!it.iep || it.iep.length === 0)) {
          out.warnings.push("No codes found for " + s.title + " " + it.key);
          warn += 1;
        }
      }
    }
    out.counts.sections = out.sections.length;
    out.counts.items = items;
    out.counts.warnings = warn;
    return out;
  }

  function readScoringDefaults() {
    return {
      mcq: Math.max(0, parseInt(($("scoringMcq") && $("scoringMcq").value) || "1", 10) || 1),
      boolean: Math.max(0, parseInt(($("scoringBoolean") && $("scoringBoolean").value) || "1", 10) || 1),
      constructed: Math.max(0, parseInt(($("scoringConstructed") && $("scoringConstructed").value) || "5", 10) || 5),
      multi: Math.max(0, parseInt(($("scoringMulti") && $("scoringMulti").value) || "1", 10) || 1),
    };
  }

  function readTotalPossible() {
    const scoringDisplay = $("scoringTotalDisplay");
    const m = scoringDisplay && scoringDisplay.textContent.match(/Total:\s*(\d+)\s*pts/);
    return m ? parseInt(m[1], 10) : null;
  }

  async function onSaveDraft(e) {
    e.preventDefault();
    clearMsg();

    const title = safeStr($("draftTitle").value).trim();
    const className = safeStr($("draftClass").value).trim();
    const releaseAt = safeStr($("draftRelease").value).trim();
    const dueAt = safeStr($("draftDue").value).trim();
    const notes = safeStr($("draftNotes").value).trim();
    const autoRelease = $("draftAutoRelease") ? !!$("draftAutoRelease").checked : false;

    // Parse optional student codes (comma-separated, case-insensitive → uppercased)
    const studentCodesRaw = $("draftStudentCodes") ? safeStr($("draftStudentCodes").value).trim() : "";
    const studentCodes = studentCodesRaw
      ? studentCodesRaw.split(",").map(c => c.trim().toUpperCase()).filter(Boolean)
      : [];

    // Read scoring defaults from form (with fallbacks)
    const scoringDefaults = readScoringDefaults();

    // Extract total_possible from scoring display (updated dynamically by wire())
    const totalPossible = readTotalPossible();

    const assignmentFile = $("assignmentFile").files && $("assignmentFile").files[0];
    const assignmentLink = safeStr($("assignmentLink").value).trim();
    const mappingFile = $("mappingFile").files && $("mappingFile").files[0];

    if (!title) return setMsg("err", "Title is required.");
    if (!className) return setMsg("err", "Class is required.");

    // Check if we're editing an existing draft
    if (editingId) {
      const drafts = readDrafts();
      const draftIndex = drafts.findIndex((x) => x.id === editingId);
      if (draftIndex === -1) {
        setMsg("err", "Draft not found.");
        cancelEdit();
        return;
      }

      const draft = drafts[draftIndex];

      // Update basic fields
      draft.title = title;
      draft.className = className;
      draft.releaseAt = releaseAt || null;
      draft.dueAt = dueAt || null;
      draft.notes = notes || null;
      draft.autoRelease = autoRelease;
      draft.studentCodes = studentCodes.length > 0 ? studentCodes : undefined;
      draft.updatedAt = nowISO();
      draft.meta = Object.assign({}, draft.meta || {}, { scoring_defaults: scoringDefaults, total_possible: totalPossible });

      // Update writing config
      let paragraphCount = parseInt(($("draftParagraphCount") || {}).value || '1', 10);
      if (isNaN(paragraphCount) || paragraphCount < 1) paragraphCount = 1;
      if (paragraphCount > 5) paragraphCount = 5;
      draft.writingConfig = (paragraphCount > 1) ? { paragraph_count: paragraphCount } : {};

      // Handle assignment updates
      const hasNewAssignmentFile = assignmentFile && assignmentFile.size > 0;
      const hasAssignmentLink = assignmentLink.length > 0;

      if (hasNewAssignmentFile) {
        // New file uploaded - replace assignment
        const assignmentText = normalizeTaggedAssignmentText(await readFileAsText(assignmentFile));
        draft.assignment = {
          kind: "file",
          name: assignmentFile.name,
          link: null,
          text: bytesOf(assignmentText) > MAX_TEXT_BYTES
            ? assignmentText.slice(0, 120000) + "\n…(truncated)\n"
            : assignmentText,
        };
      } else if (hasAssignmentLink) {
        // Link provided - replace with link
        draft.assignment = {
          kind: "link",
          name: null,
          link: assignmentLink,
          text: null,
        };
      } else if (!draft.assignment || 
                 (draft.assignment.kind === "file" && !draft.assignment.text) ||
                 (draft.assignment.kind === "link" && !draft.assignment.link)) {
        // No existing assignment or existing assignment is incomplete
        return setMsg("err", "Assignment is required (file OR link).");
      }
      // Else: keep existing assignment unchanged

      // Handle mapping updates
      if (mappingFile) {
        // New mapping file uploaded
        const mappingText = await readFileAsText(mappingFile);
        if (bytesOf(mappingText) > MAX_TEXT_BYTES) {
          return setMsg("err", "Mapping file is too large for local storage. Keep it smaller for now.");
        }
        draft.mapping = {
          kind: "file",
          name: mappingFile.name,
          text: mappingText,
        };
      } else if (hasNewAssignmentFile) {
        // New assignment uploaded, regenerate auto-mapping
        let assignmentTextRaw = "";
        if (typeof rcIsTextFile === "function" && rcIsTextFile(assignmentFile)) {
          try {
            assignmentTextRaw = await assignmentFile.text();
          } catch (_) {
            /* noop */
          }
        }
        const autoMapping =
          typeof autoMapFromTeacherTxt === "function"
            ? autoMapFromTeacherTxt(
                __rc_joinTagOnlyLines(normalizeTaggedAssignmentText(assignmentTextRaw || ""))
              )
            : null;
        const mappingText = JSON.stringify(
          autoMapping || {
            version: 1,
            sections: [],
            warnings: ["Auto-mapping unavailable"],
            counts: { sections: 0, items: 0, warnings: 1 },
          },
          null,
          2
        );
        if (bytesOf(mappingText) > MAX_TEXT_BYTES) {
          return setMsg("err", "Auto-generated mapping is too large for local storage.");
        }
        draft.mapping = {
          kind: "auto",
          name: "auto-mapping.json",
          text: mappingText,
        };
      }
      // Else: keep existing mapping unchanged

      writeDrafts(drafts);
      renderTable(drafts);
      
      // Remote sync
      remoteSaveDraft(draft);
      
      setMsg("ok", "Draft updated.");
      cancelEdit();
      return;
    }

    // Not editing - create new draft
    if (!mappingFile) {
      if (assignmentLink) return setMsg("err", "Mapping file is required when using a link.");
      if (assignmentFile && typeof rcIsTextFile === "function" && !rcIsTextFile(assignmentFile)) {
        return setMsg(
          "err",
          "Mapping file is required for non-text uploads (or use a tagged TXT/HTML/JSON/CSV)."
        );
      }
    }
    if (!assignmentFile && !assignmentLink)
      return setMsg("err", "Assignment is required (file OR link).");

    const draft = {
      id: `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      className,
      releaseAt: releaseAt || null,
      dueAt: dueAt || null,
      notes: notes || null,
      autoRelease,
      studentCodes: studentCodes.length > 0 ? studentCodes : undefined,
      createdAt: nowISO(),
      meta: { scoring_defaults: scoringDefaults, total_possible: totalPossible },
      writingConfig: (() => {
        let pc = parseInt(($("draftParagraphCount") || {}).value || '1', 10);
        if (isNaN(pc) || pc < 1) pc = 1;
        if (pc > 5) pc = 5;
        return (pc > 1) ? { paragraph_count: pc } : {};
      })(),
      assignment: { kind: null, name: null, link: null, text: null },
      mapping: {
        kind: mappingFile ? "file" : "auto",
        name: mappingFile ? mappingFile.name : "auto-mapping.json",
        text: null,
      },
    };

    let mappingText = null;
    if (mappingFile) {
      mappingText = await readFileAsText(mappingFile);
      if (bytesOf(mappingText) > MAX_TEXT_BYTES) {
        return setMsg(
          "err",
          "Mapping file is too large for local storage. Keep it smaller for now."
        );
      }
      draft.mapping.text = mappingText;
    } else {
      let assignmentTextRaw = "";
      if (assignmentFile && typeof rcIsTextFile === "function" && rcIsTextFile(assignmentFile)) {
        try {
          assignmentTextRaw = await assignmentFile.text();
        } catch (_) {
          /* noop */
        }
      }
      const autoMapping =
        typeof autoMapFromTeacherTxt === "function"
          ? autoMapFromTeacherTxt(
              __rc_joinTagOnlyLines(normalizeTaggedAssignmentText(assignmentTextRaw || ""))
            )
          : null;
      mappingText = JSON.stringify(
        autoMapping || {
          version: 1,
          sections: [],
          warnings: ["Auto-mapping unavailable"],
          counts: { sections: 0, items: 0, warnings: 1 },
        },
        null,
        2
      );
      if (bytesOf(mappingText) > MAX_TEXT_BYTES) {
        return setMsg("err", "Auto-generated mapping is too large for local storage.");
      }
      draft.mapping.text = mappingText;
      const w = autoMapping && autoMapping.counts ? autoMapping.counts.warnings || 0 : 0;
      const n = autoMapping && autoMapping.counts ? autoMapping.counts.items || 0 : 0;
      setMsg(
        w ? "warn" : "ok",
        "Auto-mapped " +
          n +
          " item(s) from tags" +
          (w ? " (" + w + " missing-code warning(s))" : "")
      );
    }

    if (assignmentLink) {
      draft.assignment.kind = "link";
      draft.assignment.link = assignmentLink;
    } else if (assignmentFile) {
      const assignmentText = normalizeTaggedAssignmentText(await readFileAsText(assignmentFile));
      draft.assignment.kind = "file";
      draft.assignment.name = assignmentFile.name;

      if (bytesOf(assignmentText) > MAX_TEXT_BYTES) {
        // store a bounded preview (so Preview isn't blank)
        draft.assignment.text = assignmentText.slice(0, 120000) + "\n…(truncated)\n";
      } else {
        draft.assignment.text = assignmentText;
      }
    }

    const drafts = readDrafts();
    drafts.unshift(draft);
    writeDrafts(drafts);
    renderTable(drafts);

    // Remote sync
    remoteSaveDraft(draft);

    setMsg("ok", "Draft saved.");
    $("workDraftForm").reset();
    setTimeout(clearMsg, 1400);
  }

  function wireModal() {
    const overlay = $("draftOverlay");
    const closeBtn = $("btnClosePreview");
    const dlBtn = $("btnDownloadOne");
    if (!overlay || !closeBtn || !dlBtn) return;

    closeBtn.addEventListener("click", closePreview);
    dlBtn.addEventListener("click", () => {
      if (previewingId) exportOne(previewingId);
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePreview();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) {
        e.stopImmediatePropagation();
        closePreview();
      }
    }, true);
  }

  function wireFileLabels() {
    const aInput = $("assignmentFile");
    const aLabel = $("assignmentFileName");
    const mInput = $("mappingFile");
    const mLabel = $("mappingFileName");

    if (aInput && aLabel) {
      aInput.addEventListener("change", () => {
        const f = aInput.files && aInput.files[0];
        aLabel.textContent = f ? f.name : "No file selected";
      });
    }
    if (mInput && mLabel) {
      mInput.addEventListener("change", () => {
        const f = mInput.files && mInput.files[0];
        mLabel.textContent = f ? f.name : "No file selected";
      });
    }
  }

  // ========================================
  // Remote Sync Functions (Supabase)
  // ========================================

  function isRemoteEnabled() {
    // Check for teacher session cookie (tc or rc_session)
    const hasCookie = document.cookie.split(';').some(c => {
      const trimmed = c.trim();
      return trimmed.startsWith('rc_session=') || trimmed.startsWith('tc=');
    });
    // Check if Supabase is configured via the settings module
    // We check localStorage directly here to avoid circular dependencies.
    // These keys are set by supabase-settings.js when Supabase is configured.
    // Note: rc_unified_supabase_url is the current key; rc_supabase_url is legacy/fallback
    const hasUrl = !!(localStorage.getItem('rc_unified_supabase_url') || localStorage.getItem('rc_supabase_url'));
    return hasCookie && hasUrl;
  }

  async function remoteSaveDraft(draft) {
    if (!isRemoteEnabled()) return;
    try {
      const res = await fetch('/.netlify/functions/teacher-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(draft)
      });
      if (!res.ok) console.warn('[tc-work] Remote save failed:', res.status);
    } catch (err) {
      console.warn('[tc-work] Remote save error:', err.message);
    }
  }

  async function remoteDeleteDraft(id) {
    if (!isRemoteEnabled()) return;
    try {
      const res = await fetch(`/.netlify/functions/teacher-drafts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      if (!res.ok) console.warn('[tc-work] Remote delete failed:', res.status);
    } catch (err) {
      console.warn('[tc-work] Remote delete error:', err.message);
    }
  }

  let syncStatusTimeoutId = null; // Track sync status timeout to prevent overlaps
  
  async function remoteLoadDrafts() {
    if (!isRemoteEnabled()) return;
    
    const syncEl = $("syncStatus");
    if (syncEl) syncEl.textContent = "Syncing…";
    
    // Clear any pending timeout to prevent status message overlap
    if (syncStatusTimeoutId !== null) {
      clearTimeout(syncStatusTimeoutId);
      syncStatusTimeoutId = null;
    }
    
    try {
      const res = await fetch('/.netlify/functions/teacher-drafts', {
        method: 'GET',
        credentials: 'same-origin'
      });
      
      if (!res.ok) {
        if (syncEl) syncEl.textContent = "Local only";
        return;
      }
      
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.drafts)) {
        if (syncEl) syncEl.textContent = "Local only";
        return;
      }
      
      // Convert DB rows back to client schema
      const remoteDrafts = data.drafts.map(row => ({
        id: row.id,
        title: row.title,
        className: row.class_name,
        releaseAt: row.release_at,
        dueAt: row.due_at,
        notes: row.notes,
        assignment: row.assignment || {},
        mapping: row.mapping || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
      
      // Merge: remote wins on conflicts (by updatedAt)
      const local = readDrafts();
      const localMap = new Map(local.map(d => [d.id, d]));
      
      for (const rd of remoteDrafts) {
        const ld = localMap.get(rd.id);
        if (!ld) {
          // Draft exists remotely but not locally — add it
          localMap.set(rd.id, rd);
        } else {
          // Both exist — remote wins if it's newer
          const remoteTime = new Date(rd.updatedAt || rd.createdAt || 0).getTime();
          const localTime = new Date(ld.updatedAt || ld.createdAt || 0).getTime();
          if (remoteTime > localTime) {
            localMap.set(rd.id, rd);
          }
        }
      }
      
      // Also push any local-only drafts to remote
      for (const ld of local) {
        const exists = remoteDrafts.find(rd => rd.id === ld.id);
        if (!exists) {
          // Local-only draft — push to remote
          remoteSaveDraft(ld);
        }
      }
      
      const merged = Array.from(localMap.values());
      // Sort by updatedAt/createdAt descending
      merged.sort((a, b) => {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      });
      
      writeDrafts(merged);
      renderTable(merged);
      
      if (syncEl) {
        syncEl.textContent = "✓ Synced";
        syncStatusTimeoutId = setTimeout(() => { 
          if (syncEl) syncEl.textContent = ""; 
          syncStatusTimeoutId = null;
        }, 3000);
      }
    } catch (err) {
      console.warn('[tc-work] Remote load error:', err.message);
      if (syncEl) syncEl.textContent = "Local only";
    }
  }

  /**
   * Strip bulky text content from already-issued drafts to free localStorage space.
   * Called proactively before adding new draft batches to avoid QuotaExceededError.
   * @param {Array} drafts - Array of draft objects to modify in place
   * @returns {number} Number of bytes freed (approximate)
   */
  function stripIssuedDraftContent(drafts) {
    let freed = 0;
    for (const d of drafts) {
      if (!d.issuedAt) continue;
      if (d.assignment && d.assignment.text && d.assignment.text.length > 50) {
        freed += d.assignment.text.length;
        d.assignment.text = '(issued)';
      }
      if (d.mapping && d.mapping.text && d.mapping.text.length > 50) {
        freed += d.mapping.text.length;
        d.mapping.text = '{}';
      }
    }
    return freed;
  }

  // Expose for use by mega-split and QoL modules
  window.__rcRemoteSaveDraft = remoteSaveDraft;
  window.__rcRemoteDeleteDraft = remoteDeleteDraft;
  window.__rcAutoMapFromTeacherTxt = autoMapFromTeacherTxt;
  window.__rcJoinTagOnlyLines = __rc_joinTagOnlyLines;
  window.__rcShowToast = showToast;
  window.__rcRenderTable = () => renderTable(readDrafts());
  window.__rcReadScoringDefaults = readScoringDefaults;
  window.__rcReadTotalPossible = readTotalPossible;
  window.__rcStripIssuedDraftContent = stripIssuedDraftContent;

  // ========================================
  // Issue Assignment from Draft
  // ========================================

  /** Returns true if the draft is scheduled for a future auto-release and should not be issued manually yet. */
  function isDraftScheduledForFutureRelease(draft, now) {
    return !!(draft.autoRelease && draft.releaseAt && new Date(draft.releaseAt) > (now || new Date()));
  }

  /**
   * Show an issue-assignment confirmation dialog with an optional "Add students not on roster" input.
   * Returns { confirmed, additionalCodes } where additionalCodes is an array of extra student codes.
   */
  function showIssueConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'rc-modal-backdrop';
      backdrop.innerHTML = `
        <div class="rc-modal" role="dialog" aria-modal="true" aria-labelledby="rc-issue-modal-title" style="max-width:480px;">
          <div class="rc-modal-title" id="rc-issue-modal-title">${escapeHtml(title)}</div>
          <div class="rc-modal-message" style="white-space:pre-wrap;">${escapeHtml(message)}</div>
          <div style="margin-bottom:20px;">
            <label style="display:block;font-size:13px;color:rgba(255,255,255,0.65);margin-bottom:6px;">
              Add students not on class roster (optional):
            </label>
            <input id="rc-issue-extra-codes" type="text" placeholder="e.g. S046, S047"
              style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.9);font-size:13px;font-family:inherit;" />
            <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;">Comma-separated student codes — these students will receive the assignment even if not enrolled.</div>
          </div>
          <div class="rc-modal-actions">
            <button class="rc-modal-btn" id="rc-issue-cancel-btn">Cancel</button>
            <button class="rc-modal-btn rc-modal-btn-primary" id="rc-issue-confirm-btn">Issue</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const confirmBtn = backdrop.querySelector('#rc-issue-confirm-btn');
      const cancelBtn = backdrop.querySelector('#rc-issue-cancel-btn');
      const extraCodesInput = backdrop.querySelector('#rc-issue-extra-codes');
      confirmBtn.focus();

      const cleanup = (confirmed) => {
        const raw = extraCodesInput ? extraCodesInput.value : '';
        const additionalCodes = raw
          ? raw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
          : [];
        backdrop.remove();
        resolve({ confirmed, additionalCodes });
      };

      confirmBtn.addEventListener('click', () => cleanup(true));
      cancelBtn.addEventListener('click', () => cleanup(false));
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
      backdrop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target !== extraCodesInput) { e.preventDefault(); cleanup(true); }
        else if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
      });
    });
  }

  /**
   * Handle issuing an assignment from a draft to all enrolled students in the draft's class
   * @param {string} draftId - The ID of the draft to issue
   * @param {object} [options]
   * @param {boolean} [options.skipConfirmation=false] - Skip the pre-issue confirmation dialog (used by batch operations)
   */
  async function handleIssueDraft(draftId, options) {
    const skipConfirmation = options && options.skipConfirmation;
    const now = new Date();
    const drafts = readDrafts();
    const draft = drafts.find(d => d.id === draftId);
    
    if (!draft) {
      setMsg("err", "Draft not found");
      setTimeout(clearMsg, 3000);
      return;
    }

    const className = draft.className;
    if (!className) {
      setMsg("err", "This draft has no class assigned. Please edit and select a class first.");
      setTimeout(clearMsg, 4000);
      return;
    }

    // Guard: if the draft is scheduled for future auto-release, don't issue it now
    const hasFutureRelease = isDraftScheduledForFutureRelease(draft, now);
    if (hasFutureRelease) {
      if (skipConfirmation) {
        // Called from a batch — silently skip so scheduled drafts aren't accidentally pushed out
        return;
      }
      // Individual issue — warn the teacher and let them decide
      const releaseLabel = new Date(draft.releaseAt).toLocaleString();
      const override = await rcConfirm(
        "Scheduled Auto-Release",
        `"${draft.title}" is scheduled to auto-release on ${releaseLabel}.\n\nIssue it now anyway?`,
        "Issue Now"
      );
      if (!override) return;
    }

    // Show pre-issue confirmation (unless called from a batch that already confirmed)
    let additionalStudentCodes = [];
    if (!skipConfirmation && !hasFutureRelease) {
      let confirmed = false;

      if (draft.studentCode) {
        // Single-student draft (from "Split by Student"): confirmation with extra student input
        const dialogResult = await showIssueConfirmDialog(
          "Issue Assignment",
          `Issue "${draft.title}" to ${draft.studentCode} in ${draft.className}?`
        );
        confirmed = dialogResult.confirmed;
        additionalStudentCodes = dialogResult.additionalCodes;
      } else if (Array.isArray(draft.studentCodes) && draft.studentCodes.length > 0) {
        // Targeted multi-student draft: show exactly which students will receive it
        const codesList = draft.studentCodes.join(", ");
        const dialogResult = await showIssueConfirmDialog(
          "Issue Assignment",
          `Issue "${draft.title}" to ${codesList} in ${draft.className}?\n\n(${draft.studentCodes.length} student${draft.studentCodes.length !== 1 ? 's' : ''} — targeted, not whole class)`
        );
        confirmed = dialogResult.confirmed;
        additionalStudentCodes = dialogResult.additionalCodes;
      } else {
        // Whole-class draft: fetch the roster first for a richer confirmation
        let rosterMsg = `Issue "${draft.title}" to all enrolled students in ${draft.className}?`;
        try {
          setMsg("ok", `Fetching roster for ${draft.className}…`);
          const rosterResp = await fetch('/.netlify/functions/teacher-validate-enrollments', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pairs: [], classNames: [draft.className] }),
          });
          clearMsg();
          if (rosterResp.ok) {
            const rosterData = await rosterResp.json();
            const codes = rosterData.enrolledStudentsByClass && rosterData.enrolledStudentsByClass[draft.className];
            if (Array.isArray(codes) && codes.length > 0) {
              const sorted = codes.slice().sort();
              rosterMsg = `Issue "${draft.title}" to ${draft.className}?\n\nStudents who will receive this assignment:\n• ${sorted.join(', ')}\n\n(${sorted.length} student${sorted.length !== 1 ? 's' : ''})`;
            }
          }
        } catch (_e) {
          clearMsg();
          // Fall back to simple message already set in rosterMsg
        }
        const dialogResult = await showIssueConfirmDialog("Issue Assignment", rosterMsg);
        confirmed = dialogResult.confirmed;
        additionalStudentCodes = dialogResult.additionalCodes;
      }

      if (!confirmed) return;
    }

    // Show progress message
    setMsg("ok", `Preparing to issue "${draft.title}" to ${className}...`);

    try {
      // Build IEP-aware per-student writing config overrides.
      // For students whose IEP goals indicate a higher paragraph count than the draft default,
      // we include a per-student override so the backend sets the correct instance settings.
      const basePc = (draft.writingConfig && draft.writingConfig.paragraph_count) || 1;
      const iepOverrides = buildIepPerStudentWritingConfig(basePc);

      // Merge draft-level perStudentWritingConfig (if any) with IEP-detected overrides.
      // Draft-level values take priority (teacher-set > IEP-suggested).
      const draftPerStudent = (typeof draft.perStudentWritingConfig === 'object' && draft.perStudentWritingConfig !== null && !Array.isArray(draft.perStudentWritingConfig))
        ? draft.perStudentWritingConfig
        : {};
      const mergedPerStudent = Object.assign({}, iepOverrides, draftPerStudent);
      let draftToSend = Object.keys(mergedPerStudent).length > 0
        ? Object.assign({}, draft, { perStudentWritingConfig: mergedPerStudent })
        : draft;

      // Include additional student codes (Bug 4: students not on class roster)
      if (additionalStudentCodes && additionalStudentCodes.length > 0) {
        draftToSend = Object.assign({}, draftToSend, { additionalStudentCodes });
      }

      // Call server-side endpoint to handle all Supabase operations
      const response = await fetch('/.netlify/functions/teacher-issue-draft', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: draftToSend })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Issue failed: ${response.status}`);
      }

      const result = await response.json();

      if (result.ok) {
        const issued = result.issued_count || 0;
        // Mark issuedAt and store assignmentId in localStorage
        const updatedDrafts = readDrafts();
        const d = updatedDrafts.find(x => x.id === draftId);
        if (d) {
          d.issuedAt = nowISO();
          if (result.assignment_id) d.assignmentId = result.assignment_id;
          writeDrafts(updatedDrafts);
        }
        // Show warning if no structured content was parsed (Bug 5)
        if (result.warning) {
          setMsg("err", `⚠ Issued to ${issued} student(s) — but: ${result.warning}`);
          setTimeout(clearMsg, 10000);
        } else {
          setMsg("ok", `✓ Issued to ${issued} student(s) in ${className}`);
          setTimeout(clearMsg, 5000);
        }
        renderTable(readDrafts());
      } else {
        throw new Error(result.error || "Issue failed");
      }
    } catch (err) {
      console.error("[tc-work] Issue draft error:", err);
      setMsg("err", `Failed to issue: ${err.message}`);
      setTimeout(clearMsg, 5000);
    }
  }

  async function issueAllInBatch(batchId) {
    const allDrafts = readDrafts();
    const batchDrafts = allDrafts.filter(d => d.batchId === batchId);
    const now = new Date();
    const allPending = batchDrafts.filter(d => !d.issuedAt && d.className);

    // Separate out drafts scheduled for future auto-release — don't issue those now
    const scheduled = allPending.filter(d => isDraftScheduledForFutureRelease(d, now));
    const pending = allPending.filter(d => !isDraftScheduledForFutureRelease(d, now));

    if (pending.length === 0) {
      const msg = scheduled.length > 0
        ? `All remaining drafts in this batch are scheduled for future auto-release (${scheduled.length} draft${scheduled.length !== 1 ? 's' : ''}).`
        : "All drafts in this batch have already been issued.";
      await rcAlert("Nothing to Issue", msg);
      return;
    }

    const draftLines = pending.map(d => {
      if (d.studentCode) {
        return `\u2022 "${d.title}" \u2192 ${d.studentCode} (${d.className})`;
      }
      if (Array.isArray(d.studentCodes) && d.studentCodes.length > 0) {
        return `\u2022 "${d.title}" \u2192 ${d.studentCodes.join(", ")} (${d.className})`;
      }
      return `\u2022 "${d.title}" \u2192 ${d.className} (all enrolled students)`;
    }).join("\n");
    const scheduledNote = scheduled.length > 0
      ? `\n\n⏰ ${scheduled.length} draft${scheduled.length !== 1 ? 's' : ''} with future release dates will be skipped (they will auto-release on schedule).`
      : "";
    const confirmed = await rcConfirm(
      "Issue Batch",
      `Issue ${pending.length} draft${pending.length !== 1 ? "s" : ""}?\n\n${draftLines}${scheduledNote}`,
      "Issue All"
    );
    if (!confirmed) return;

    let successCount = 0;
    const failures = [];

    for (let i = 0; i < pending.length; i++) {
      const draft = pending[i];
      setMsg("ok", `Issuing ${i + 1} of ${pending.length}: "${draft.title}"…`);
      await handleIssueDraft(draft.id, { skipConfirmation: true });
      // Check if issuedAt was set (handleIssueDraft handles its own errors)
      const refreshed = readDrafts().find(d => d.id === draft.id);
      if (refreshed && refreshed.issuedAt) {
        successCount++;
      } else {
        const studentLabel = draft.studentCode || (Array.isArray(draft.studentCodes) && draft.studentCodes.length > 0 ? draft.studentCodes.join(', ') : draft.className);
        failures.push(`${draft.title} (${studentLabel})`);
      }
    }

    if (failures.length === 0) {
      showToast(`✓ Issued all ${successCount} draft${successCount !== 1 ? "s" : ""} in batch`);
    } else {
      const failureDetails = failures.map(f => `• ${f}`).join('\n');
      setMsg("err", `Issued ${successCount} of ${pending.length}. ${failures.length} failed.`);
      setTimeout(clearMsg, 8000);
      await rcAlert(
        `Batch Issue: ${failures.length} Failed`,
        `Issued: ${successCount}\nFailed: ${failures.length}\n\nFailed drafts:\n${failureDetails}\n\nCheck the error messages above for details.`
      );
    }
    if (scheduled.length > 0) {
      showToast(`⏰ Skipped ${scheduled.length} draft${scheduled.length !== 1 ? 's' : ''} with future release dates — they will auto-release on schedule.`, '#f59e0b', '#1a0f00');
    }
    renderTable(readDrafts());
  }

  async function deleteAllInBatch(batchId) {
    const allDrafts = readDrafts();
    const batchDrafts = allDrafts.filter(d => d.batchId === batchId);

    const confirmed = await rcConfirm(
      "Delete Batch",
      `Delete all ${batchDrafts.length} draft${batchDrafts.length !== 1 ? "s" : ""} in this batch? This cannot be undone.`,
      "Delete All"
    );
    if (!confirmed) return;

    const remaining = allDrafts.filter(d => d.batchId !== batchId);
    writeDrafts(remaining);
    for (const d of batchDrafts) remoteDeleteDraft(d.id);
    renderTable(remaining);
  }

  async function handleRecallDraft(draftId) {
    const drafts = readDrafts();
    const draft = drafts.find(d => d.id === draftId);

    if (!draft) {
      setMsg("err", "Draft not found");
      setTimeout(clearMsg, 3000);
      return false;
    }

    if (!draft.assignmentId) {
      setMsg("err", "No assignment ID on this draft — it may have been issued before recall was supported.");
      setTimeout(clearMsg, 5000);
      return false;
    }

    const reason = await new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'rc-modal-backdrop';
      const reasonInputId = 'recallReasonInput_' + Date.now();
      backdrop.innerHTML = `
        <div class="rc-modal" role="dialog" aria-modal="true" aria-labelledby="rc-recall-title">
          <div class="rc-modal-title" id="rc-recall-title">Recall Assignment</div>
          <div class="rc-modal-message">This will remove the assignment from all students who received it. Submissions will be deleted.</div>
          <div style="margin:12px 0 4px;">
            <label for="${reasonInputId}" style="display:block;font-size:12px;margin-bottom:6px;color:rgba(255,255,255,.6);">Reason (optional)</label>
            <input id="${reasonInputId}" type="text" maxlength="255" placeholder="e.g. Needs revision…" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);border-radius:6px;color:#fff;font-size:13px;padding:7px 10px;outline:none;">
          </div>
          <div class="rc-modal-actions">
            <button class="rc-modal-btn" id="rcRecallCancelBtn">Cancel</button>
            <button class="rc-modal-btn rc-modal-btn-danger" id="rcRecallConfirmBtn">Recall</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const confirmBtn = backdrop.querySelector('#rcRecallConfirmBtn');
      const cancelBtn = backdrop.querySelector('#rcRecallCancelBtn');
      const reasonInput = backdrop.querySelector(`#${reasonInputId}`);
      reasonInput.addEventListener('focus', () => { reasonInput.style.borderColor = 'rgba(96,165,250,.6)'; reasonInput.style.boxShadow = '0 0 0 2px rgba(96,165,250,.2)'; });
      reasonInput.addEventListener('blur', () => { reasonInput.style.borderColor = 'rgba(255,255,255,.18)'; reasonInput.style.boxShadow = 'none'; });
      reasonInput.focus();

      const cleanup = (confirmed) => {
        const val = reasonInput.value.trim() || null;
        backdrop.remove();
        resolve(confirmed ? val : undefined);
      };

      confirmBtn.addEventListener('click', () => cleanup(true));
      cancelBtn.addEventListener('click', () => cleanup(false));
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
      backdrop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); cleanup(true); }
        else if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
      });
    });
    if (reason === undefined) return false; // cancelled

    return _doRecallDraft(draftId, draft, reason);
  }

  async function _doRecallDraft(draftId, draft, reason) {
    setMsg("ok", `Recalling "${draft.title}"…`);

    try {
      const response = await fetch("/.netlify/functions/teacher-recall-assignment", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: draft.assignmentId, reason: reason || undefined })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Recall failed: ${response.status}`);
      }

      const result = await response.json();

      if (result.ok) {
        const n = result.recalled_instances || 0;
        // Clear issuedAt and assignmentId on the draft
        const updatedDrafts = readDrafts();
        const d = updatedDrafts.find(x => x.id === draftId);
        if (d) {
          delete d.issuedAt;
          delete d.assignmentId;
          writeDrafts(updatedDrafts);
        }
        showToast(`✓ Recalled assignment — removed from ${n} student${n !== 1 ? "s" : ""}`);
        clearMsg();
        renderTable(readDrafts());
        return true;
      } else {
        throw new Error(result.error || "Recall failed");
      }
    } catch (err) {
      console.error("[tc-work] Recall draft error:", err);
      setMsg("err", `Failed to recall: ${err.message}`);
      setTimeout(clearMsg, 5000);
      return false;
    }
  }

  // ========================================
  // Manage Assignment — per-student modal
  // ========================================

  async function handleManageDraft(draftId) {
    const drafts = readDrafts();
    const draft = drafts.find(d => d.id === draftId);

    if (!draft) {
      setMsg("err", "Draft not found");
      setTimeout(clearMsg, 3000);
      return;
    }

    if (!draft.assignmentId) {
      await rcAlert("No Assignment ID", "This draft has no tracked assignment ID. It may have been issued before assignment tracking was supported.");
      return;
    }

    // Open the manage modal (it will load instances itself)
    _openManageModal(draft);
  }

  function _openManageModal(draft) {
    const backdropId = 'rcManageModalBackdrop_' + Date.now();
    const backdrop = document.createElement('div');
    backdrop.className = 'rc-modal-backdrop';
    backdrop.id = backdropId;

    // Use a wider modal for the manage panel
    backdrop.innerHTML = `
      <div class="rc-modal rc-manage-modal" role="dialog" aria-modal="true" aria-labelledby="rcManageTitle" style="max-width:560px;width:95%;">
        <div class="rc-modal-title" id="rcManageTitle">${escapeHtml(draft.title || 'Assignment')} — Manage Students</div>
        <div id="rcManageSubtitle" style="font-size:12px;color:rgba(255,255,255,.5);margin:-8px 0 16px;">${escapeHtml(draft.className || '')}</div>
        <div id="rcManageStudentList" style="margin-bottom:20px;">
          <div style="color:rgba(255,255,255,.5);font-size:13px;">Loading students…</div>
        </div>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,.1);margin:16px 0;">
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:rgba(255,255,255,.85);">Add Student</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input id="rcManageAddCodeInput" type="text" maxlength="20" placeholder="Student code, e.g. S017"
              style="flex:1;min-width:120px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);border-radius:6px;color:#fff;font-size:13px;padding:7px 10px;outline:none;">
            <button id="rcManageAddBtn" type="button" class="rc-modal-btn rc-modal-btn-primary" style="white-space:nowrap;">Issue to Student</button>
          </div>
          <div id="rcManageAddMsg" style="font-size:12px;margin-top:6px;min-height:16px;"></div>
        </div>
        <div class="rc-modal-actions" style="margin-top:20px;">
          <button class="rc-modal-btn" id="rcManageCloseBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const closeBtn = backdrop.querySelector('#rcManageCloseBtn');
    const addBtn = backdrop.querySelector('#rcManageAddBtn');
    const addInput = backdrop.querySelector('#rcManageAddCodeInput');
    const addMsg = backdrop.querySelector('#rcManageAddMsg');

    const close = () => backdrop.remove();

    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });

    // Load and render the current student list
    const loadInstances = async () => {
      const listEl = backdrop.querySelector('#rcManageStudentList');
      if (!listEl) return;
      listEl.innerHTML = '<div style="color:rgba(255,255,255,.5);font-size:13px;">Loading…</div>';

      try {
        const res = await fetch(`/.netlify/functions/teacher-assignment-instances?assignment_id=${encodeURIComponent(draft.assignmentId)}`, {
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data.ok) throw new Error(data.error || 'Failed to load students');

        const instances = data.instances || [];
        if (instances.length === 0) {
          listEl.innerHTML = '<div style="color:rgba(255,255,255,.4);font-size:13px;font-style:italic;">No students currently have this assignment.</div>';
          return;
        }

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';

        const thead = document.createElement('thead');
        thead.innerHTML = `<tr>
          <th style="text-align:left;padding:4px 6px;color:rgba(255,255,255,.5);font-weight:600;font-size:11px;border-bottom:1px solid rgba(255,255,255,.1);">Student</th>
          <th style="text-align:left;padding:4px 6px;color:rgba(255,255,255,.5);font-weight:600;font-size:11px;border-bottom:1px solid rgba(255,255,255,.1);">Status</th>
          <th style="text-align:left;padding:4px 6px;color:rgba(255,255,255,.5);font-weight:600;font-size:11px;border-bottom:1px solid rgba(255,255,255,.1);">Assigned</th>
          <th style="border-bottom:1px solid rgba(255,255,255,.1);"></th>
        </tr>`;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        for (const inst of instances) {
          const tr = document.createElement('tr');
          tr.dataset.studentId = inst.student_id;
          tr.dataset.instanceId = inst.instance_id;

          const assignedDate = inst.assigned_at
            ? new Date(inst.assigned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : '—';

          tr.innerHTML = `
            <td style="padding:6px 6px;vertical-align:middle;">
              <span style="font-weight:600;">${escapeHtml(inst.student_code)}</span>
              ${inst.student_name && inst.student_name !== inst.student_code ? `<span style="color:rgba(255,255,255,.45);margin-left:4px;font-size:12px;">${escapeHtml(inst.student_name)}</span>` : ''}
            </td>
            <td style="padding:6px 6px;vertical-align:middle;color:rgba(255,255,255,.65);">${escapeHtml(inst.status || 'Assigned')}</td>
            <td style="padding:6px 6px;vertical-align:middle;color:rgba(255,255,255,.45);font-size:12px;">${escapeHtml(assignedDate)}</td>
            <td style="padding:6px 6px;vertical-align:middle;text-align:right;">
              <button type="button" class="rc-modal-btn rc-modal-btn-danger rc-manage-remove-btn" style="padding:4px 10px;font-size:12px;"
                data-student-id="${escapeHtml(inst.student_id)}" data-student-code="${escapeHtml(inst.student_code)}">Remove</button>
            </td>
          `;
          tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        listEl.innerHTML = '';
        listEl.appendChild(table);

        // Wire up Remove buttons
        listEl.querySelectorAll('.rc-manage-remove-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const studentId = btn.dataset.studentId;
            const studentCode = btn.dataset.studentCode;
            const confirmed = await rcConfirm(
              'Remove Student',
              `Remove ${escapeHtml(studentCode)} from this assignment? Their submission (if any) will also be deleted.`,
              'Remove',
              { danger: true }
            );
            if (!confirmed) return;

            btn.disabled = true;
            btn.textContent = 'Removing…';

            try {
              const removeRes = await fetch('/.netlify/functions/teacher-recall-assignment', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignment_id: draft.assignmentId, student_ids: [studentId] }),
              });
              if (!removeRes.ok) {
                const err = await removeRes.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${removeRes.status}`);
              }
              const removeData = await removeRes.json();
              if (!removeData.ok) throw new Error(removeData.error || 'Remove failed');

              showToast(`✓ Removed ${studentCode} from assignment`);
              // Reload the list
              await loadInstances();
            } catch (err) {
              console.error('[tc-work] Remove student error:', err);
              btn.disabled = false;
              btn.textContent = 'Remove';
              await rcAlert('Remove Failed', err.message || 'Could not remove student from assignment.');
            }
          });
        });
      } catch (err) {
        console.error('[tc-work] Load instances error:', err);
        listEl.innerHTML = `<div style="color:rgba(239,68,68,.8);font-size:13px;">Failed to load students: ${escapeHtml(err.message)}</div>`;
      }
    };

    // Add student handler
    addBtn.addEventListener('click', async () => {
      const code = (addInput.value || '').trim().toUpperCase();
      if (!code) {
        addMsg.style.color = 'rgba(239,68,68,.8)';
        addMsg.textContent = 'Enter a student code first.';
        return;
      }

      addBtn.disabled = true;
      addMsg.style.color = 'rgba(255,255,255,.5)';
      addMsg.textContent = 'Issuing…';

      try {
        const issueRes = await fetch('/.netlify/functions/teacher-issue-to-student', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignment_id: draft.assignmentId, student_codes: [code] }),
        });
        if (!issueRes.ok) {
          const err = await issueRes.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${issueRes.status}`);
        }
        const issueData = await issueRes.json();
        if (!issueData.ok) throw new Error(issueData.error || 'Issue failed');

        addInput.value = '';
        if (issueData.issued_count === 0) {
          addMsg.style.color = 'rgba(249,115,22,.85)';
          addMsg.textContent = `${code} already has this assignment.`;
        } else {
          addMsg.style.color = 'rgba(34,197,94,.85)';
          addMsg.textContent = `✓ Issued to ${code}`;
          showToast(`✓ Issued assignment to ${code}`);
        }
        await loadInstances();
      } catch (err) {
        console.error('[tc-work] Add student error:', err);
        addMsg.style.color = 'rgba(239,68,68,.8)';
        addMsg.textContent = err.message || 'Failed to issue to student.';
      } finally {
        addBtn.disabled = false;
      }
    });

    // Allow Enter key on the input to trigger add
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
    });

    // Load instances immediately
    loadInstances();
  }

  async function recallAllInBatch(batchId) {
    const allDrafts = readDrafts();
    const batchDrafts = allDrafts.filter(d => d.batchId === batchId);
    const issued = batchDrafts.filter(d => !!d.issuedAt && !!d.assignmentId);

    if (issued.length === 0) {
      await rcAlert("Nothing to Recall", "No issued drafts with a tracked assignment ID found in this batch.");
      return;
    }

    const confirmed = await rcConfirm(
      "Recall All in Batch",
      `This will recall ${issued.length} issued assignment${issued.length !== 1 ? "s" : ""}, removing them from all students who received them. Submissions will be deleted. Continue?`,
      "Recall All",
      { danger: true }
    );
    if (!confirmed) return;

    let successCount = 0;
    const failures = [];

    for (let i = 0; i < issued.length; i++) {
      const draft = issued[i];
      setMsg("ok", `Recalling ${i + 1} of ${issued.length}: "${draft.title}"…`);
      const ok = await _doRecallDraft(draft.id, draft);
      if (ok) {
        successCount++;
      } else {
        failures.push(draft.title);
      }
    }

    if (failures.length === 0) {
      showToast(`✓ Recalled all ${successCount} assignment${successCount !== 1 ? "s" : ""} in batch`);
    } else {
      setMsg("err", `Recalled ${successCount} of ${issued.length}. ${failures.length} failed — check console.`);
      setTimeout(clearMsg, 6000);
    }
    renderTable(readDrafts());
  }

  async function handleIssueAllDrafts() {
    const drafts = readDrafts();
    const now = new Date();
    const allPending = drafts.filter((d) => !d.issuedAt && d.className);

    // Separate out drafts that are scheduled for future auto-release — don't issue those now
    const scheduled = allPending.filter(d => isDraftScheduledForFutureRelease(d, now));
    const pending = allPending.filter(d => !isDraftScheduledForFutureRelease(d, now));

    if (pending.length === 0) {
      const msg = scheduled.length > 0
        ? `All remaining drafts are scheduled for future auto-release (${scheduled.length} draft${scheduled.length !== 1 ? 's' : ''}).`
        : "All drafts have already been issued, or no drafts have a class assigned.";
      await rcAlert("No Drafts to Issue", msg);
      return;
    }

    const draftLines = pending.map(d => {
      if (d.studentCode) {
        return `\u2022 "${d.title}" \u2192 ${d.studentCode} (${d.className})`;
      }
      if (Array.isArray(d.studentCodes) && d.studentCodes.length > 0) {
        return `\u2022 "${d.title}" \u2192 ${d.studentCodes.join(", ")} (${d.className})`;
      }
      return `\u2022 "${d.title}" \u2192 ${d.className} (all enrolled students)`;
    }).join("\n");
    const scheduledNote = scheduled.length > 0
      ? `\n\n⏰ ${scheduled.length} draft${scheduled.length !== 1 ? 's' : ''} with future release dates will be skipped (they will auto-release on schedule).`
      : "";
    const confirmed = await rcConfirm(
      "Issue All Drafts",
      `Issue ${pending.length} draft${pending.length !== 1 ? "s" : ""} to their respective classes?\n\n${draftLines}${scheduledNote}`,
      "Issue All"
    );
    if (!confirmed) return;

    let successCount = 0;
    const failures = [];

    for (let i = 0; i < pending.length; i++) {
      const draft = pending[i];
      setMsg("ok", `Issuing ${i + 1} of ${pending.length}: "${draft.title}"…`);
      await handleIssueDraft(draft.id, { skipConfirmation: true });
      // Check if issuedAt was set (handleIssueDraft handles its own errors)
      const refreshed = readDrafts().find(d => d.id === draft.id);
      if (refreshed && refreshed.issuedAt) {
        successCount++;
      } else {
        failures.push(`"${draft.title}"`);
      }
    }

    if (failures.length === 0) {
      setMsg("ok", `✓ Issued all ${successCount} draft${successCount !== 1 ? "s" : ""} successfully.`);
    } else {
      setMsg("err", `Issued ${successCount} of ${pending.length}. ${failures.length} failed — check the browser console for details.`);
    }
    if (scheduled.length > 0) {
      showToast(`⏰ Skipped ${scheduled.length} draft${scheduled.length !== 1 ? 's' : ''} with future release dates — they will auto-release on schedule.`, '#f59e0b', '#1a0f00');
    }
    setTimeout(clearMsg, 6000);
    renderTable(readDrafts());
  }

  function showToast(text, bg = '#22c55e', color = '#0b1220') {
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = `position:fixed;bottom:24px;right:24px;background:${bg};color:${color};padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
  }

  async function autoIssueDueReleases() {
    const drafts = readDrafts();
    const now = new Date();
    let autoIssuedCount = 0;

    for (const draft of drafts) {
      if (!draft.autoRelease) continue;
      if (!draft.releaseAt) continue;
      if (new Date(draft.releaseAt) > now) continue;
      if (draft.issuedAt) continue; // already issued
      if (!draft.className) continue;

      try {
        await handleIssueDraft(draft.id, { skipConfirmation: true });
        autoIssuedCount++;
      } catch (err) {
        console.warn('[tc-work] Auto-issue failed for draft:', draft.id, err);
      }
    }

    if (autoIssuedCount > 0) {
      showToast(`⏰ Auto-released ${autoIssuedCount} assignment${autoIssuedCount !== 1 ? 's' : ''}`);
      renderTable(readDrafts());
    }
  }

  // Issue Assignment functionality
  function init() {
    const drafts = readDrafts();
    renderTable(drafts);

    const _f = $("workDraftForm");
    if (_f) _f.addEventListener("submit", onSaveDraft);
    const _ea = $("btnExportAll");
    if (_ea) _ea.addEventListener("click", exportAll);
    const _ca = $("btnClearAll");
    if (_ca) _ca.addEventListener("click", clearAll);
    const _ia = $("btnIssueAll");
    if (_ia) _ia.addEventListener("click", () => handleIssueAllDrafts().catch((err) => console.error(err)));
    const _pi = $("btnPurgeIssued");
    if (_pi) _pi.addEventListener("click", async () => {
      const drafts = readDrafts();
      const issuedCount = drafts.filter(d => d.issuedAt).length;
      if (issuedCount === 0) {
        await rcAlert('Nothing to Purge', 'No issued drafts found in local storage.');
        return;
      }
      const freed = stripIssuedDraftContent(drafts);
      writeDrafts(drafts);
      renderTable(drafts);
      await rcAlert('Content Purged', `Freed ~${Math.round(freed / 1024)} KB from ${issuedCount} issued draft${issuedCount !== 1 ? 's' : ''}. Storage is ready for new splits.`);
    });
    const _fe = $("btnFillExample");
    if (_fe) _fe.addEventListener("click", fillExample);
    const _ce = $("btnCancelEdit");
    if (_ce) _ce.addEventListener("click", cancelEdit);

    installStudentPreviewSanitizer();

    // Show Issued toggle
    const _sit = $("showIssuedToggle");
    if (_sit) {
      _sit.checked = loadShowIssued();
      _sit.addEventListener("change", () => {
        saveShowIssued(_sit.checked);
        renderTable(readDrafts());
      });
    }

    wireModal();
    wireFileLabels();
    
    // Background sync with Supabase (non-blocking)
    remoteLoadDrafts();

    // Auto-issue assignments whose release date has passed (non-blocking)
    autoIssueDueReleases();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

function sanitizeStudentPreviewText(src) {
  if (src == null) return "";
  const rawLines = String(src).split(/\r?\n/);
  const out = [];
  let prevNonEmpty = "";

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];

    // Strip common "answer key" markers
    line = line.replace(/[✓✔✅]/g, "").replace(/[ \t]+$/g, "");

    // Drop obvious answer-key lines
    if (/^\s*(Answer|Correct Answer|Correct)\s*[:-]/i.test(line)) continue;
    if (/^\s*Hint\s*:/i.test(line)) continue;

    // Drop DESE standard lines
    if (/^\s*DESE\s+Standard/i.test(line)) continue;

    // Drop IEP goal lines
    if (/^\s*IEP\s+Goal/i.test(line)) continue;

    // TRUE/FALSE: many keys only include the correct line (e.g., "TRUE ✓").
    // If the stem says TRUE or FALSE and the next non-empty line is just TRUE/FALSE,
    // expand to both options so the student preview doesn't leak the answer.
    if (/TRUE\s*OR\s*FALSE/i.test(prevNonEmpty) && /^\s*(TRUE|FALSE)\s*$/i.test(line)) {
      out.push("TRUE");
      out.push("FALSE");

      // Skip any additional TRUE/FALSE key lines right after
      while (i + 1 < rawLines.length) {
        const peek = rawLines[i + 1].replace(/[✓✔✅]/g, "").trim();
        if (/^(TRUE|FALSE)$/i.test(peek)) {
          i += 1;
          continue;
        }
        break;
      }

      prevNonEmpty = "FALSE";
      continue;
    }

    out.push(line);
    if (line.trim()) prevNonEmpty = line;
  }

  // Prevent giant blank gaps after removals
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function installStudentPreviewSanitizer() {
  // Only sanitize the Student preview TEXT (never clobber the tab UI).
  if (window.__rcStudentPreviewSanitizerInstalled) return;
  window.__rcStudentPreviewSanitizerInstalled = true;

  function pickStudentTextNode() {
    // Mega preview: student pane exists (teacher/mapping are separate panes).
    const pane = document.querySelector('[data-pv-pane="student"]');
    if (pane) {
      return (
        pane.querySelector("#previewBody") ||
        pane.querySelector("pre") ||
        pane.querySelector("[data-preview-text]") ||
        pane.querySelector('div[style*="white-space:pre-wrap"]') ||
        pane.querySelector('div[style*="white-space: pre-wrap"]') ||
        null
      );
    }

    // Fallback (older single-pane preview): only touch the PRE itself.
    const pb = document.getElementById("previewBody");
    return pb && pb.tagName === "PRE" ? pb : null;
  }

  function sanitizeNode(node) {
    if (!node) return;

    // Critical safety: NEVER overwrite a container that has element children.
    // That’s how tab buttons disappeared.
    if (node.tagName !== "PRE" && node.childElementCount > 0) return;

    const cur = node.textContent || "";
    const next = sanitizeStudentPreviewText(cur);
    if (next !== cur) node.textContent = next;
  }

  function run() {
    sanitizeNode(pickStudentTextNode());
  }

  const root =
    document.getElementById("draftOverlay") ||
    document.querySelector(".work-dialog") ||
    document.body;

  const obs = new MutationObserver(() => run());
  obs.observe(root, { childList: true, subtree: true, characterData: true });

  run();
}

function normalizeTaggedAssignmentText(input) {
  let text = String(input || "");

  // BUG 1 FIX: Convert labeled-field format to bracket format
  // Handle "DESE Standard(s): code1, code2" → "[MLS: code1] [MLS: code2]"
  // Handle "IEP Goal Code(s): code1, code2" → "[IG: code1] [IG: code2]"
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match DESE Standard(s): followed by codes
    // Handles: "DESE Standard:", "DESE Standards:", "DESE Standard(s):", "DESE Standards (s):"
    const deseMatch = line.match(/^\s*DESE\s+Standards?\s*(?:\(s\))?\s*:\s*(.+)$/i);
    if (deseMatch) {
      const codesStr = deseMatch[1].trim();
      const codes = codesStr.split(/\s*,\s*/).map(c => c.trim()).filter(Boolean);
      const brackets = codes.map(code => {
        // Strip MLS. prefix if present
        const cleanCode = code.replace(/^MLS\./i, '');
        return `[MLS: ${cleanCode}]`;
      }).join(' ');
      lines[i] = brackets;
      continue;
    }
    
    // Match IEP Goal Code(s): followed by codes
    // Handles: "IEP Goal Code:", "IEP Goal Codes:", "IEP Goal Code(s):", "IEP Goal(s):", "IEP Goal:"
    const iepMatch = line.match(/^\s*IEP\s+Goal\s*(?:Codes?)?\s*(?:\(s\))?\s*:\s*(.+)$/i);
    if (iepMatch) {
      const codesStr = iepMatch[1].trim();
      const codes = codesStr.split(/\s*,\s*/).map(c => c.trim()).filter(Boolean);
      const brackets = codes.map(code => `[IG: ${code}]`).join(' ');
      lines[i] = brackets;
      continue;
    }
  }
  text = lines.join('\n');

  // Make adjacent tags parseable: "][ " -> "] ["
  text = text.replace(/\]\s*\[/g, "] [");

  // Normalize common tag variants to canonical forms used by the mapper.
  text = text
    // MLS / DESE (treat DESE: as MLS: for mapping)
    .replace(/\[(MLS)\.([^\]]+)\]/gi, "[MLS: $2]")
    .replace(/\[(MLS)\s*:\s*([^\]]+)\]/gi, "[MLS: $2]")
    .replace(/\[(DESE)\s*:\s*([^\]]+)\]/gi, "[MLS: $2]")
    // IG / IEP
    .replace(/\[(IG)\.([^\]]+)\]/gi, "[IG: $2]")
    .replace(/\[(IG)\s*:\s*([^\]]+)\]/gi, "[IG: $2]")
    .replace(/\[(IEP)\.([^\]]+)\]/gi, "[IEP: $2]")
    .replace(/\[(IEP)\s*:\s*([^\]]+)\]/gi, "[IEP: $2]");

  // Week-11 style: if a line is ONLY tags, attach it to the previous non-empty line.
  const lines2 = text.split(/\r?\n/);
  const bracketTag = /\[[^\]]+\]/g;

  const isTagOnly = (ln) => {
    const l = String(ln || "");
    const tags = l.match(bracketTag) || [];
    if (!tags.length) return false;
    const rest = l.replace(bracketTag, "").replace(/\s+/g, "");
    return rest.length === 0;
  };

  let lastContent = -1;
  for (let k = 0; k < lines2.length; k++) {
    const ln = String(lines2[k] || "");
    if (!ln.trim()) continue;

    if (isTagOnly(ln) && lastContent >= 0) {
      lines2[lastContent] = (String(lines2[lastContent] || "").trimEnd() + " " + ln.trim()).trim();
      lines2[k] = "";
      continue;
    }
    lastContent = k;
  }

  return lines2.join("\n");
}

// BEGIN rc-work-mega-ux v1
(() => {
  if (window.__rcWorkMegaUxV1) return;
  window.__rcWorkMegaUxV1 = true;

  const DRAFT_KEY = "rc_tc_work_drafts_v1";

  // NOTE: Keep in sync with CLASS_LABELS in tc-work-qol.js
  const CANON_CLASSES = [
    "Language Arts 1 SC",
    "Language Arts 2 SC",
    "Language Arts 3 SC",
    "Language Arts 4 SC",
    "Life Skills",
    "Life Skills Language Arts SC",
    "Consumer Math",
    "Geometry SC",
    "Speech/Language",
    "Warrior Academy"
  ];

  const LA_TOKENS = /\b(la|ela)\b|english\s+language\s+arts|language\s+arts/i;

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function normalizeHeaderToClass(rawHeader) {
    // Strip decorative characters (dashes, asterisks, underscores, equals) first
    const cleanHeader = String(rawHeader || "").replace(/^[-*_=\s]+|[-*_=\s]+$/g, "");
    const t = norm(cleanHeader);

    const hasLifeSkills = t.includes("life") && t.includes("skills");
    const hasLA = LA_TOKENS.test(t);

    // Life Skills LA variations (including "Life Skills ELA")
    if (hasLifeSkills && hasLA) return "Life Skills LA";
    
    // Check for "LSLA", "LS-LA", "LS LA" patterns
    if (/\bls\s*la\b/.test(t)) return "Life Skills LA";
    
    // Life Skills without LA
    if (hasLifeSkills) return "Life Skills";

    // Match LA/ELA with number and optional SC suffix
    // Handles: "LA 1 SC", "LA 1", "ELA 1 SC", "ELA 1", "Language Arts 1", etc.
    // The norm() function converts all non-alphanumeric chars to spaces, so patterns like
    // "LA1SC" become "la 1 sc" before matching, ensuring word boundaries work correctly
    const m = t.match(/\b(?:la|ela|language\s+arts|english\s+language\s+arts)\s*([1-4])\b/);
    if (m && m[1]) return `LA ${m[1]} SC`;

    return null;
  }

  function ensureClassDropdown() {
    const sel = document.getElementById("draftClass");
    if (!sel) return;

    try {
      sel.required = false;
    } catch (e) {
      /* ignore */
    }

    const existing = new Set(Array.from(sel.options || []).map((o) => o.value));
    for (const c of CANON_CLASSES) {
      if (!existing.has(c)) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
      }
    }
  }

  // DISABLED: ensureMegaCheckbox replaced by file preview panel
  // function ensureMegaCheckbox() {
  //   const sel = document.getElementById("draftClass");
  //   if (!sel) return;
  //
  //   if (document.getElementById("rcMegaMode")) return;
  //
  //   const wrap = document.createElement("label");
  //   wrap.style.display = "flex";
  //   wrap.style.alignItems = "center";
  //   wrap.style.gap = "8px";
  //   wrap.style.marginTop = "6px";
  //   wrap.style.userSelect = "none";
  //
  //   wrap.innerHTML = `
  //     <input type="checkbox" id="rcMegaMode" />
  //     <span>Multi-class mega TXT (auto-split; no single class selection)</span>
  //   `;
  //
  //   sel.insertAdjacentElement("afterend", wrap);
  //
  //   const cb = document.getElementById("rcMegaMode");
  //
  //   const sync = () => {
  //     if (!cb) return;
  //     if (cb.checked) {
  //       sel.value = "";
  //       sel.disabled = true;
  //     } else {
  //       sel.disabled = false;
  //     }
  //   };
  //
  //   cb.addEventListener("change", sync);
  //   sync();
  // }

  function getFormEl(id, fallbackSelector) {
    return (
      document.getElementById(id) ||
      (fallbackSelector ? document.querySelector(fallbackSelector) : null)
    );
  }

  function getVal(el) {
    return el ? String(el.value || "").trim() : "";
  }

  function toIsoMaybe(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function pickFileInputs(form) {
    const inputs = Array.from(form.querySelectorAll('input[type="file"]'));
    const assignment = getFormEl("assignmentFile", null) || inputs[0] || null;
    const mapping = getFormEl("mappingFile", null) || inputs[1] || null;
    return { assignment, mapping };
  }

  async function readFileText(file) {
    return String(await file.text());
  }

  function parseMegaSections(text) {
    const lines = String(text || "").split(/\r?\n/);
    const isSep = (ln) => /^\s*={3,}\s*$/.test(ln);

    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      if (!isSep(lines[i])) continue;

      let h = i - 1;
      while (h >= 0 && lines[h].trim() === "" && i - h <= 6) h--;
      const rawHeader = h >= 0 ? lines[h].trim() : "";
      const cls = normalizeHeaderToClass(rawHeader);
      if (!cls) continue;

      hits.push({ cls, sepIndex: i });
    }

    if (hits.length < 2) return [];

    const sections = [];
    for (let j = 0; j < hits.length; j++) {
      const start = hits[j].sepIndex + 1;
      const end = j + 1 < hits.length ? hits[j + 1].sepIndex - 1 : lines.length;
      const body = lines.slice(start, end).join("\n").trim();
      sections.push({ cls: hits[j].cls, body });
    }
    return sections;
  }

  // DISABLED: looksMega replaced by renderFilePreviewPanel
  // function looksMega(text) {
  //   return parseMegaSections(text).length >= 2;
  // }

  const parseStudentSections = typeof rcParseStudentSections === "function"
    ? rcParseStudentSections
    : function() { console.error("[tc-work] parseStudentSections not loaded"); return []; };

  async function splitByStudentFromCurrentForm() {
    const form = document.getElementById("workDraftForm");
    if (!form) return;

    const titleEl = getFormEl("draftTitle", 'input[name="title"]');
    const releaseEl = getFormEl("draftRelease", 'input[name="releaseAt"]');
    const dueEl = getFormEl("draftDue", 'input[name="dueAt"]');
    const notesEl = getFormEl("draftNotes", 'textarea[name="notes"]');
    const autoReleaseEl = document.getElementById("draftAutoRelease");

    const { assignment: aIn } = pickFileInputs(form);
    const aFile = aIn && aIn.files && aIn.files[0] ? aIn.files[0] : null;

    if (!aFile) {
      await rcAlert("No File Selected", "Choose a student assignment TXT file first.");
      return;
    }

    const raw = await readFileText(aFile);
    const sections = parseStudentSections(raw);

    if (sections.length === 0) {
      await rcAlert(
        "No Student Sections Found",
        "That file doesn't contain any 'Assignment: SXXX' headers between separator lines."
      );
      return;
    }

    // Build a grouped-by-class summary for large student lists
    const byClass = {};
    for (const s of sections) {
      const classLabel = s.className || "(no class)";
      if (!byClass[classLabel]) byClass[classLabel] = [];
      byClass[classLabel].push(s.studentCode);
    }
    const classCount = Object.keys(byClass).length;
    const groupedLines = Object.entries(byClass)
      .map(([classLabel, codes]) => `• ${classLabel}: ${codes.join(", ")}`)
      .join("\n");
    const summary = classCount > 1
      ? `Detected ${sections.length} student section${sections.length !== 1 ? "s" : ""} across ${classCount} classes.\n\n${groupedLines}`
      : `Detected ${sections.length} student section${sections.length !== 1 ? "s" : ""}.\n\n${groupedLines}`;

    // Validate enrollments before asking teacher to confirm
    let enrollmentWarning = "";
    try {
      const pairsToValidate = [];
      const seenPairKeys = new Set();
      for (const s of sections) {
        if (!s.className) continue;
        const pairKey = `${s.studentCode}|${s.className}`;
        if (!seenPairKeys.has(pairKey)) {
          seenPairKeys.add(pairKey);
          pairsToValidate.push({ studentCode: s.studentCode, className: s.className });
        }
      }
      if (pairsToValidate.length > 0) {
        const valRes = await fetch("/.netlify/functions/teacher-validate-enrollments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairs: pairsToValidate }),
        });
        if (valRes.ok) {
          const valData = await valRes.json();
          if (valData.ok && Array.isArray(valData.results)) {
            const notEnrolled = valData.results.filter((r) => !r.enrolled);
            if (notEnrolled.length > 0) {
              const warnDetails = notEnrolled
                .map((r) => `  • ${r.studentCode} (${r.className}): not enrolled`)
                .join("\n");
              enrollmentWarning = `\n\n⚠️ Enrollment warnings:\n${warnDetails}`;
            }
          }
        }
      }
    } catch (valErr) {
      console.warn("Enrollment validation failed, proceeding without it:", valErr);
    }

    const confirmed = await rcConfirm(
      "Split by Student",
      `${summary}${enrollmentWarning}\n\nCreate one draft per student?`,
      "Create Drafts"
    );
    if (!confirmed) return;

    const baseTitle = getVal(titleEl) || aFile.name;
    const notes = getVal(notesEl) || "";
    const releaseAt = toIsoMaybe(getVal(releaseEl));
    const dueAt = toIsoMaybe(getVal(dueEl));
    const autoRelease = autoReleaseEl ? !!autoReleaseEl.checked : false;

    // Read scoring defaults using the shared helper from the main IIFE (or fallback inline)
    const scoringDefaults = typeof window.__rcReadScoringDefaults === "function"
      ? window.__rcReadScoringDefaults()
      : { mcq: 1, boolean: 1, constructed: 5, multi: 1 };
    const totalPossible = typeof window.__rcReadTotalPossible === "function"
      ? window.__rcReadTotalPossible()
      : null;

    const ensureBound = (t) =>
      t && t.length > 120000 ? t.slice(0, 120000) + "\n…(truncated)\n" : t || "";

    // Generate a shared batchId for all drafts in this split
    const batchId = "batch_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);

    const drafts = loadDrafts();

    const fallbackMapping = JSON.stringify({ version: 1, sections: [], warnings: ["Auto-mapping unavailable"], counts: { sections: 0, items: 0, warnings: 1 } }, null, 2);

    for (const sec of sections) {
      const t = `${baseTitle} — ${sec.studentCode}`;

      // Store the normalized assignment text (consistent with normal Save Draft flow)
      let assignText = ensureBound(sec.body);
      if (typeof normalizeTaggedAssignmentText === "function") {
        assignText = normalizeTaggedAssignmentText(assignText);
      }
      if (typeof window.__rcJoinTagOnlyLines === "function") {
        assignText = window.__rcJoinTagOnlyLines(assignText);
      }

      let mappingText = fallbackMapping;
      if (typeof window.__rcAutoMapFromTeacherTxt === "function") {
        try {
          const mapObj = window.__rcAutoMapFromTeacherTxt(assignText);
          mappingText = JSON.stringify(mapObj, null, 2);
        } catch (e) {
          console.warn("autoMapFromTeacherTxt failed for", sec.studentCode, e);
          // mappingText stays as fallbackMapping
        }
      }

      drafts.unshift({
        id: makeId(),
        batchId,
        batchTitle: baseTitle,
        title: t,
        className: sec.className || "",
        studentCode: sec.studentCode,
        releaseAt,
        dueAt,
        notes: notes || null,
        autoRelease,
        createdAt: new Date().toISOString(),
        meta: { scoring_defaults: scoringDefaults, total_possible: totalPossible },
        assignment: {
          kind: "file",
          name: aFile.name,
          link: null,
          text: assignText,
        },
        mapping: {
          kind: "auto",
          name: "auto-mapping.json",
          link: null,
          text: mappingText,
        },
      });
    }

    // Strip content from already-issued drafts before saving to avoid QuotaExceededError
    if (typeof window.__rcStripIssuedDraftContent === 'function') {
      window.__rcStripIssuedDraftContent(drafts);
    }

    saveDrafts(drafts);

    if (typeof window.__rcRemoteSaveDraft === "function") {
      for (const d of drafts.slice(0, sections.length)) {
        window.__rcRemoteSaveDraft(d);
      }
    }

    if (typeof window.__rcShowToast === "function") {
      window.__rcShowToast(`✓ Created ${sections.length} draft${sections.length !== 1 ? "s" : ""} (one per student)`);
    }
    if (typeof window.__rcRenderTable === "function") {
      window.__rcRenderTable();
    }
  }

  function loadDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveDrafts(ds) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(ds));
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        // Try stripping issued draft content and retry once
        if (typeof window.__rcStripIssuedDraftContent === 'function') {
          window.__rcStripIssuedDraftContent(ds);
          try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(ds));
            console.warn('[tc-work] saveDrafts: freed issued content and retried successfully');
            return;
          } catch (_) {
            // Fall through to throw below
          }
        }
        throw err;
      }
      throw err;
    }
  }

  function makeId() {
    return "d_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
  }

  function titleIncludesClass(title, cls) {
    return norm(title).includes(norm(cls));
  }

  function countSectionItems(sectionBody) {
    const lines = sectionBody.split(/\r?\n/);
    let questions = 0;
    let writingPrompts = 0;
    const deseCodes = new Set();
    const iepCodes = new Set();
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Count questions: "Question 1:", "Q1:", etc. (not bare "1." to avoid counting answer choices)
      if (/^(?:Question\s+)\d+\s*[.):]/i.test(trimmed) || /^Q\d+\s*[.):]/i.test(trimmed)) {
        questions++;
      }
      
      // Count writing prompt sections
      if (/DAY\s+\d+\s+WRITING\s+PROMPT/i.test(trimmed)) {
        writingPrompts++;
      }
      
      // Extract DESE codes from labeled format: "DESE Standard(s): MLS.R.1.A.9-12.a"
      const deseMatch = trimmed.match(/DESE\s+Standard(?:\(s\)|s)?\s*:\s*(.+)/i);
      if (deseMatch) {
        deseMatch[1].split(/[,;]/).forEach(c => {
          const code = c.trim();
          if (code) deseCodes.add(code);
        });
      }
      
      // Extract DESE codes from bracket format: [MLS.R.1.A.9-12.a] or [MLSC.R.1.A.9-12.a]
      const bracketDese = trimmed.matchAll(/\[MLS[^\]]*\]/gi);
      for (const m of bracketDese) deseCodes.add(m[0]);
      
      // Extract IEP codes from labeled format: "IEP Goal Code(s): S015.11.1-2, S016.11.2-2" or "IEP Goal(s): ..."
      const iepMatch = trimmed.match(/IEP\s+Goal\s*(?:Code)?\s*(?:\(s\)|s)?\s*:\s*(.+)/i);
      if (iepMatch) {
        iepMatch[1].split(/[,;]/).forEach(c => {
          const code = c.trim();
          if (code) iepCodes.add(code);
        });
      }
      
      // Extract IEP codes from bracket format: [IG: S015.11.1-2] or [IG : S015.11.1-2]
      const bracketIep = trimmed.matchAll(/\[IG[^\]]*\]/gi);
      for (const m of bracketIep) iepCodes.add(m[0]);
    }
    
    return { 
      questions, 
      writingPrompts, 
      deseCodes: deseCodes.size, 
      iepCodes: iepCodes.size 
    };
  }

  function updateClassDropdownLabel(text) {
    // Try multiple strategies to find the label, most reliable first
    let label = document.getElementById('draftClassLabel');
    
    if (!label) {
      // Fallback 1: Try the for attribute selector
      label = document.querySelector('label[for="draftClass"]');
    }
    
    if (!label) {
      // Fallback 2: Traverse from the select element
      const select = document.getElementById('draftClass');
      if (select) {
        const parent = select.closest('.work-field');
        if (parent) {
          label = parent.querySelector('label');
        }
      }
    }
    
    if (label) {
      label.textContent = text;
    } else {
      console.warn('updateClassDropdownLabel: Could not find label for #draftClass');
    }
  }

  function renderFilePreviewPanel(text) {
    const panel = document.getElementById("rcFilePreviewPanel");
    if (!panel) return;

    // Local HTML escaper for safe template literal interpolation
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Clear previous content
    panel.innerHTML = "";
    panel.style.display = "none";

    // Check for student-sections format first (Assignment: SXXX headers)
    const studentSections = parseStudentSections(text);
    if (studentSections.length >= 1) {
      // Student-individualized file detected — show info panel, no class checkboxes
      panel.style.display = "block";

      const studentList = studentSections
        .map((s) => `<strong>${esc(s.studentCode)}</strong>${s.className ? ` (${esc(s.className)})` : ""}`)
        .join(", ");

      panel.innerHTML = `
        <div class="work-card" style="background: rgba(139, 92, 246, 0.08); border-color: rgba(139, 92, 246, 0.25);">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 20px;">🎓</span>
            <strong>Detected ${studentSections.length} individualized student assignment${studentSections.length !== 1 ? "s" : ""}</strong>
          </div>
          <div id="rcPreviewStudentList" style="font-size: 13px; margin-bottom: 8px;">Students: ${studentList}</div>
          <div class="work-subtle" style="font-size: 12px;">
            Click <strong>Split by Student</strong> to create one draft per student.
          </div>
        </div>
      `;

      // Fire async enrollment validation and update status badges when results arrive
      const previewPairs = studentSections
        .filter((s) => s.className)
        .map((s) => ({ studentCode: s.studentCode, className: s.className }));
      if (previewPairs.length > 0) {
        fetch("/.netlify/functions/teacher-validate-enrollments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairs: previewPairs }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data || !data.ok || !Array.isArray(data.results)) return;
            const listEl = document.getElementById("rcPreviewStudentList");
            if (!listEl) return;
            const resultMap = {};
            for (const r of data.results) {
              resultMap[`${r.studentCode}|${r.className}`] = r;
            }
            const updatedList = studentSections
              .map((s) => {
                const nameHtml = `<strong>${esc(s.studentCode)}</strong>${s.className ? ` (${esc(s.className)})` : ""}`;
                const r = resultMap[`${s.studentCode}|${s.className}`];
                if (!r) return nameHtml;
                return nameHtml + (r.enrolled ? " ✅" : " ⚠️");
              })
              .join(", ");
            listEl.innerHTML = "Students: " + updatedList;
          })
          .catch((err) => {
            console.warn("Enrollment validation for preview panel failed:", err);
          });
      }

      // Enable class dropdown (not used for student splits, but keep it accessible)
      const classSel = document.getElementById("draftClass");
      if (classSel) {
        classSel.disabled = false;
        updateClassDropdownLabel("Individual Class");
      }
      return;
    }

    const sections = parseMegaSections(text);

    if (sections.length >= 2) {
      // Multi-class file detected
      panel.style.display = "block";
      
      let html = `
        <div class="work-card" style="background: rgba(34, 197, 94, 0.08); border-color: rgba(34, 197, 94, 0.25);">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="font-size: 20px;">📄</span>
            <strong>Detected ${sections.length} class sections in this file:</strong>
          </div>
          <div class="work-tablewrap">
            <table class="work-table" style="font-size: 13px;">
              <thead>
                <tr>
                  <th style="width: 50px;">✅</th>
                  <th>Class</th>
                  <th>Questions</th>
                  <th>Writing Prompts</th>
                  <th>DESE Codes</th>
                  <th>IEP Codes</th>
                </tr>
              </thead>
              <tbody>
      `;

      sections.forEach((section, idx) => {
        const counts = countSectionItems(section.body);
        html += `
          <tr>
            <td style="text-align: center;">
              <input type="checkbox" 
                     class="rcPreviewClassCheckbox" 
                     data-class="${section.cls}" 
                     data-section-index="${idx}" 
                     checked 
                     style="width: 18px; height: 18px; cursor: pointer;" />
            </td>
            <td><strong>${section.cls}</strong></td>
            <td>${counts.questions}</td>
            <td>${counts.writingPrompts}</td>
            <td>${counts.deseCodes} unique</td>
            <td>${counts.iepCodes} unique</td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>
          <div class="work-subtle" style="margin-top: 10px; font-size: 12px;">
            <strong>ℹ️ Classes detected from file</strong> — The class dropdown above is disabled.<br/>
            Each checked class will get its own draft with only its section.<br/>
            Uncheck any class you want to skip.
          </div>
        </div>
      `;

      panel.innerHTML = html;

      // Disable class dropdown for mega files and remove required attribute
      const classSel = document.getElementById("draftClass");
      if (classSel) {
        classSel.value = "";
        classSel.disabled = true;
        classSel.removeAttribute("required");
        updateClassDropdownLabel("Individual Class (from file)");
      }
    } else if (sections.length === 1) {
      // Single section detected, but still show it
      panel.style.display = "block";
      
      panel.innerHTML = `
        <div class="work-card" style="background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.25);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">📄</span>
            <span><strong>Single-class assignment detected.</strong></span>
          </div>
          <div class="work-subtle" style="margin-top: 8px; font-size: 12px;">
            Select the class from the dropdown above.
          </div>
        </div>
      `;

      // Enable class dropdown for single-class files
      const classSel = document.getElementById("draftClass");
      if (classSel) {
        classSel.disabled = false;
        updateClassDropdownLabel("Individual Class");
      }
    } else {
      // No sections detected (normal single-class file)
      const classSel = document.getElementById("draftClass");
      if (classSel) {
        classSel.disabled = false;
        updateClassDropdownLabel("Individual Class");
      }
    }
  }

  async function splitMegaFromCurrentForm() {
    const form = document.getElementById("workDraftForm");
    if (!form) return;

    const titleEl = getFormEl("draftTitle", 'input[name="title"]');
    const classSel = getFormEl("draftClass", 'select[name="className"]');
    const releaseEl = getFormEl("draftRelease", 'input[name="releaseAt"]');
    const dueEl = getFormEl("draftDue", 'input[name="dueAt"]');
    const notesEl = getFormEl("draftNotes", 'textarea[name="notes"]');

    const { assignment: aIn, mapping: mIn } = pickFileInputs(form);
    const aFile = aIn && aIn.files && aIn.files[0] ? aIn.files[0] : null;
    const mFile = mIn && mIn.files && mIn.files[0] ? mIn.files[0] : null;

    if (!aFile) {
      await rcAlert('No File Selected', 'Choose a mega TXT assignment file first.');
      return;
    }

    const raw = await readFileText(aFile);
    const sections = parseMegaSections(raw);

    if (sections.length < 2) {
      await rcAlert('Error',
        "That file doesn’t look like a multi-class mega TXT (need 2+ recognizable class headers)."
      );
      return;
    }

    const baseTitle = getVal(titleEl) || aFile.name;
    const notes = getVal(notesEl) || "";
    const releaseAt = toIsoMaybe(getVal(releaseEl));
    const dueAt = toIsoMaybe(getVal(dueEl));

    let mappingText = null;
    if (mFile) {
      try {
        const mt = await readFileText(mFile);
        mappingText = mt.length > 120000 ? mt.slice(0, 120000) + "\n…(truncated)\n" : mt;
      } catch (e) {
        console.warn("Mapping read failed:", e);
      }
    }

    const ensureBound = (t) =>
      t && t.length > 120000 ? t.slice(0, 120000) + "\n…(truncated)\n" : t || "";

    const drafts = loadDrafts();

    // Get checked classes from preview panel
    const checkboxes = document.querySelectorAll(".rcPreviewClassCheckbox:checked");
    const checkedClasses = new Set(
      Array.from(checkboxes).map(cb => cb.getAttribute("data-class"))
    );

    if (checkedClasses.size === 0) {
      await rcAlert('Validation', 'Please select at least one class to create drafts for.');
      return;
    }

    // Only create drafts for checked classes
    for (const sec of sections) {
      if (!checkedClasses.has(sec.cls)) continue; // Skip unchecked classes

      const cls = sec.cls;
      const chunk = `${cls}\n===\n${sec.body}\n`;

      const t = titleIncludesClass(baseTitle, cls) ? baseTitle : `${baseTitle} — ${cls}`;

      drafts.unshift({
        id: makeId(),
        title: t,
        className: cls,
        releaseAt,
        dueAt,
        createdAt: new Date().toISOString(),
        notes,
        assignment: {
          kind: "file",
          name: aFile.name,
          link: null,
          text: ensureBound(chunk), // ✅ canonical field (preview expects .text)
        },
        mapping: {
          name: mFile ? mFile.name : null,
          kind: mFile ? "file" : null,
          link: null,
          text: ensureBound(mappingText), // ✅ canonical field
        },
      });
    }

    saveDrafts(drafts);

    // Sync mega-split drafts to remote if available
    if (typeof window.__rcRemoteSaveDraft === 'function') {
      for (const sec of sections) {
        if (!checkedClasses.has(sec.cls)) continue;
        const newDraft = drafts.find(d => d.className === sec.cls);
        if (newDraft) window.__rcRemoteSaveDraft(newDraft);
      }
    }

    const cb = document.getElementById("rcMegaMode");
    if (cb && classSel) {
      classSel.value = "";
      classSel.disabled = true;
    }

    await rcAlert('Drafts Created', `Created ${checkedClasses.size} drafts (one per selected class).`);
    location.reload();
  }

  function wire() {
    const form = document.getElementById("workDraftForm");
    const btn = document.getElementById("btnSplitMega");
    const btnStudent = document.getElementById("btnSplitByStudent");

    ensureClassDropdown();
    // ensureMegaCheckbox(); // DISABLED: replaced by preview panel

    const classSel = document.getElementById("draftClass");

    // Scoring total display
    let lastItemCounts = { questions: 0, writingPrompts: 0 };

    function updateScoringTotalDisplay() {
      const display = document.getElementById("scoringTotalDisplay");
      if (!display) return;
      const mcqPts = Math.max(0, parseInt((document.getElementById("scoringMcq") || {}).value || "1", 10) || 1);
      const constructedPts = Math.max(0, parseInt((document.getElementById("scoringConstructed") || {}).value || "5", 10) || 5);
      const nOtherQuestions = lastItemCounts.questions - lastItemCounts.writingPrompts;
      const nConstructed = lastItemCounts.writingPrompts;
      if (nOtherQuestions + nConstructed === 0) {
        display.textContent = "";
        return;
      }
      const total = nOtherQuestions * mcqPts + nConstructed * constructedPts;
      const parts = [];
      if (nOtherQuestions > 0) parts.push(`${nOtherQuestions} Questions × ${mcqPts}pt`);
      if (nConstructed > 0) parts.push(`${nConstructed} Written × ${constructedPts}pt`);
      display.textContent = `Total: ${total} pts (${parts.join(" + ")})`;
    }

    ["scoringMcq", "scoringBoolean", "scoringConstructed", "scoringMulti"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", updateScoringTotalDisplay);
    });

    if (form) {
      const { assignment: aIn } = pickFileInputs(form);
      if (aIn) {
        aIn.addEventListener("change", async () => {
          try {
            const f = aIn.files && aIn.files[0] ? aIn.files[0] : null;
            if (!f) {
              // Clear preview panel if no file
              const panel = document.getElementById("rcFilePreviewPanel");
              if (panel) {
                panel.innerHTML = "";
                panel.style.display = "none";
              }
              // Restore label when file is cleared
              if (classSel) {
                classSel.disabled = false;
                updateClassDropdownLabel("Individual Class");
              }
              lastItemCounts = { questions: 0, writingPrompts: 0 };
              updateScoringTotalDisplay();
              return;
            }

            const txt = await readFileText(f);
            renderFilePreviewPanel(txt);
            // Update scoring total from parsed file
            if (typeof countSectionItems === "function") {
              const counts = countSectionItems(txt);
              lastItemCounts = { questions: counts.questions || 0, writingPrompts: counts.writingPrompts || 0 };
              updateScoringTotalDisplay();
            }
          } catch (e) {
            console.warn("File preview failed:", e);
          }
        });
      }
    }

    if (btn) {
      try {
        btn.type = "button";
      } catch (e) {
        /* ignore */
      }
      btn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          splitMegaFromCurrentForm().catch((err) => console.warn(err));
        },
        true
      );
    }

    if (btnStudent) {
      btnStudent.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          splitByStudentFromCurrentForm().catch((err) => console.warn(err));
        },
        true
      );
    }

    if (form) {
      form.addEventListener(
        "submit",
        (e) => {
          // Check if there are any checked preview panel checkboxes (multi-class mode)
          const checkedBoxes = document.querySelectorAll(".rcPreviewClassCheckbox:checked");
          const isMega = checkedBoxes.length > 0;
          
          if (!isMega) return; // Normal single-class save

          e.preventDefault();
          e.stopImmediatePropagation();
          splitMegaFromCurrentForm().catch((err) => console.warn(err));
        },
        true
      );
    }
  }

  window.addEventListener("DOMContentLoaded", wire);
})();
// END rc-work-mega-ux v1
