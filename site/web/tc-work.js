(function () {
  "use strict";

  const STORAGE_KEY = "rc_tc_work_drafts_v1";
  const MAX_TEXT_BYTES = 800_000; // keep localStorage safe-ish (MVP only)

  const $ = (id) => document.getElementById(id);

  function nowISO() {
    return new Date().toISOString();
  }

  function readDrafts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeDrafts(drafts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
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
    el.classList.remove("ok", "err");
    el.classList.add(kind === "ok" ? "ok" : "err");
    el.textContent = text;
    el.style.display = "block";
  }

  function clearMsg() {
    const el = $("workMsg");
    if (el) el.style.display = "none";
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

  function inferSource(d) {
    if (d.assignment && d.assignment.kind === "file") return `file: ${d.assignment.name || "assignment"}`;
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

  function renderTable(drafts) {
    const empty = $("draftsEmpty");
    const table = $("draftsTable");
    const tbody = $("draftsTbody");
    if (!empty || !table || !tbody) return;

    if (!drafts.length) {
      empty.style.display = "block";
      table.style.display = "none";
      tbody.innerHTML = "";
      return;
    }

    empty.style.display = "none";
    table.style.display = "table";
    tbody.innerHTML = "";

    for (const d of drafts) {
      const tr = document.createElement("tr");

      const tdTitle = document.createElement("td");
      tdTitle.textContent = safeStr(d.title) || "(untitled)";
      tr.appendChild(tdTitle);

      const tdClass = document.createElement("td");
      tdClass.textContent = safeStr(d.className) || "—";
      tr.appendChild(tdClass);

      const tdWhen = document.createElement("td");
      tdWhen.innerHTML = `<div>Release: ${formatWhen(d.releaseAt)}</div><div>Due: ${formatWhen(d.dueAt)}</div>`;
      tr.appendChild(tdWhen);

      const tdSrc = document.createElement("td");
      tdSrc.textContent = inferSource(d);
      tr.appendChild(tdSrc);

      const tdActions = document.createElement("td");
      tdActions.style.whiteSpace = "nowrap";

      const btnPreview = document.createElement("button");
      btnPreview.type = "button";
      btnPreview.className = "work-btn";
      btnPreview.textContent = "Preview";
      btnPreview?.addEventListener("click", () => openPreview(d.id));
      tdActions.appendChild(btnPreview);

      const btnExport = document.createElement("button");
      btnExport.type = "button";
      btnExport.className = "work-btn";
      btnExport.style.marginLeft = "8px";
      btnExport.textContent = "Export";
      btnExport?.addEventListener("click", () => exportOne(d.id));
      tdActions.appendChild(btnExport);

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "work-btn danger";
      btnDel.style.marginLeft = "8px";
      btnDel.textContent = "Delete";
      btnDel?.addEventListener("click", () => deleteOne(d.id));
      tdActions.appendChild(btnDel);

      tr.appendChild(tdActions);
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

  function stripTeacherTags(text) {
    const raw = String(text || "");
    const lines = raw.split(/\r?\n/);
    const tagRe = /\[\s*(?:(?:DESE:\s*)?MLS\.[^\]]+|(?:IG:|IEP:)\s*[^\]]+)\s*\]/ig;
    const out = [];
    for (const line of lines) {
      let cleaned = line.replace(tagRe, "").replace(/[ \t]{2,}/g, " ").trimEnd();
      // Student View: strip common inline answer markers at end of option lines (✓/✔)
      if (/^\s*[a-dA-D][.)]\s+/.test(cleaned)) cleaned = cleaned.replace(/[ \t]*\(?[✓✔]\)?\s*$/, "");

      out.push(cleaned);
    }
    return out.join("\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  }

  function renderStudentPreviewHtml(d) {
    const title = escapeHtml((d && d.title) || "Draft Preview");
    const cls = escapeHtml((d && (d.className || d.class)) || "");
    const notes = escapeHtml((d && d.notes) || "");

    const kind = (d && d.assignment && d.assignment.kind) || "";
    const link = (d && d.assignment && d.assignment.link) || "";
    const text = (d && d.assignment && d.assignment.text) || "";

    let bodyHtml = "";
    if (kind === "link" && link) {
      const safeLink = escapeHtml(link);
      bodyHtml = `
        <div style="margin:0 0 10px 0;">
          <div style="font-weight:700;">Google Form link</div>
          <div><a href="${safeLink}" target="_blank" rel="noopener noreferrer">${safeLink}</a></div>
          <div style="opacity:.8;margin-top:6px;">Student view will open this link in a new tab.</div>
        </div>
      `;
    } else if (kind === "file") {
      const studentText = stripTeacherTags(text);
      const shown = studentText ? escapeHtml(studentText) : "(No assignment text stored for this draft.)";
      bodyHtml = `
        <div style="white-space:pre-wrap; font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height:1.5; font-size:14px;">
${shown}
        </div>
      `;
    } else {
      bodyHtml = `<div style="opacity:.85;">(No assignment content found for this draft.)</div>`;
    }

    const meta = `
      <div style="margin-bottom:10px;">
        <div style="font-weight:800; font-size:16px;">${title}</div>
        ${cls ? `<div style="opacity:.85; margin-top:2px;"><strong>Class:</strong> ${cls}</div>` : ``}
        ${notes ? `<div style="opacity:.85; margin-top:2px;"><strong>Notes:</strong> ${notes}</div>` : ``}
        <div style="opacity:.7; margin-top:6px;">Preview: <strong>Student View</strong> (DESE/IEP tags hidden)</div>
      </div>
      <hr style="border:none; border-top:1px solid rgba(255,255,255,.15); margin:12px 0;">
    `

    return `<div>${meta}${bodyHtml}</div>`;
  }


  function openPreview(id) {
    const drafts = readDrafts();
    const d = drafts.find((x) => x.id === id);
    if (!d) return;

    previewingId = id;

    const overlay = $("draftOverlay");
    const title = $("previewTitle");
    const body = $("previewBody");
    if (!overlay || !title || !body) return;

    title.textContent = safeStr(d.title) || "Draft Preview";
    body.innerHTML = renderStudentPreviewHtml(d);
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

  function deleteOne(id) {
    const drafts = readDrafts();
    const next = drafts.filter((x) => x.id !== id);
    writeDrafts(next);
    renderTable(next);
    setMsg("ok", "Draft deleted.");
    setTimeout(clearMsg, 1200);
  }

  function exportAll() {
    const drafts = readDrafts();
    download(`tc-drafts_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(drafts, null, 2));
  }

  function clearAll() {
    if (!confirm("Clear ALL drafts stored in this browser?")) return;
    writeDrafts([]);
    renderTable([]);
    setMsg("ok", "All drafts cleared.");
    setTimeout(clearMsg, 1200);
  }

    function rcIsTextFile(file) {
    if (!file) return false;
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "").toLowerCase();
    if (type.startsWith("text/")) return true;
    return name.endsWith(".txt");
  }

function fillExample() {
    $("draftTitle").value = "Week 1 — ADIT — Day 1 Assignment";
    $("draftClass").value = "LA 1 SC";
    $("draftNotes").value = "MVP example draft. Replace with real content.";
    $("assignmentLink").value = "https://docs.google.com/forms/d/EXAMPLE/viewform";
  }

  

  function autoMapFromTeacherTxt(text) {
  const out = { version: 1, sections: [], warnings: [], counts: { sections: 0, items: 0, warnings: 0 } };
  const lines = String(text || "").split(/\r?\n/);

  let cur = null;
  let pendingWR = null;
  let wrIndex = 0;

  const uniq = (arr) => Array.from(new Set((arr || []).map(x => String(x || "").trim()).filter(Boolean)));

  const startSection = (title) => {
    const t = String(title || "Assignment").trim() || "Assignment";
    cur = { title: t, items: [] };
    out.sections.push(cur);
  };

  const addItem = (key, tags) => {
    if (!cur) startSection("Assignment");
    const item = { key: String(key), dese: uniq(tags?.dese), iep: uniq(tags?.iep) };
    cur.items.push(item);
  };

  const parseTagsFromLine = (line) => {
    const tags = { dese: [], iep: [] };
    const matches = String(line || "").match(/\[[^\]]+\]/g) || [];
    for (const raw of matches) {
      const inner = raw.slice(1, -1).trim();
      if (!inner) continue;

      // Examples:
      // [MLS.R.1.A]
      // [DESE: MLS.R.1.A]
      // [IG: C.H.9.1]
      // [IEP: C.H.9.1]
      if (/^(MLS\.|DESE:)/i.test(inner)) {
        tags.dese.push(inner.replace(/^DESE:\s*/i, "").trim());
      } else if (/^(IG:|IEP:)/i.test(inner)) {
        tags.iep.push(inner.replace(/^(IG:|IEP:)\s*/i, "").trim());
      }
    }
    return tags;
  };

  const isSectionLine = (line) => /^\s*(LANGUAGE\s+ARTS|LIFE\s+SKILLS)\b/i.test(line);
  const isQuestionLine = (line) => /^\s*(?:Q\s*)?\d+\s*[.)]\s*/i.test(line);
  const isTagLine = (line) =>
    /\[[^\]]+\]/.test(line) && (/\bMLS\./i.test(line) || /\bIG:/i.test(line) || /\bIEP:/i.test(line) || /\bDESE:/i.test(line));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isSectionLine(line)) {
      startSection(line.trim());
      pendingWR = null;
      continue;
    }

    if (/^\s*WRITTEN\s+RESPONSE\b/i.test(line)) {
      wrIndex += 1;
      pendingWR = "WR" + wrIndex;
      continue;
    }

    if (isQuestionLine(line)) {
      const qm = line.match(/^\s*(?:Q\s*)?(\d+)\s*[.)]/i);
      const qNum = qm ? qm[1] : "";
      let tags = { dese: [], iep: [] };

      // look ahead for the first tag line before the next question/section
      for (let j = i + 1; j < lines.length; j++) {
        const l2 = lines[j];
        if (isQuestionLine(l2) || isSectionLine(l2)) break;
        if (isTagLine(l2)) { tags = parseTagsFromLine(l2); break; }
      }

      addItem("Q" + qNum, tags);
      pendingWR = null;
      continue;
    }

    if (pendingWR && isTagLine(line)) {
      addItem(pendingWR, parseTagsFromLine(line));
      pendingWR = null;
      continue;
    }
  }

  // warnings + counts
  let warn = 0;
  let items = 0;
  for (const s of out.sections) {
    for (const it of (s.items || [])) {
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

async function onSaveDraft(e) {
    e.preventDefault();
    clearMsg();

    const title = safeStr($("draftTitle").value).trim();
    const className = safeStr($("draftClass").value).trim();
    const releaseAt = safeStr($("draftRelease").value).trim();
    const dueAt = safeStr($("draftDue").value).trim();
    const notes = safeStr($("draftNotes").value).trim();

    const assignmentFile = $("assignmentFile").files && $("assignmentFile").files[0];
    const assignmentLink = safeStr($("assignmentLink").value).trim();
    const mappingFile = $("mappingFile").files && $("mappingFile").files[0];

    if (!title) return setMsg("err", "Title is required.");
    if (!className) return setMsg("err", "Class is required.");
    // Mapping file is optional ONLY when we can auto-map from a tagged TXT upload.
    if (!mappingFile) {
      if (assignmentLink) return setMsg("err", "Mapping file is required when using a link.");
      if (assignmentFile && typeof rcIsTextFile === "function" && !rcIsTextFile(assignmentFile)) {
        return setMsg("err", "Mapping file is required for non-TXT uploads (or use a tagged TXT).");
      }
    }
    if (!assignmentFile && !assignmentLink) return setMsg("err", "Assignment is required (file OR link).");

    const draft = {
      id: `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      className,
      releaseAt: releaseAt || null,
      dueAt: dueAt || null,
      notes: notes || null,
      createdAt: nowISO(),
      assignment: { kind: null, name: null, link: null, text: null },
      mapping: { kind: (mappingFile ? "file" : "auto"), name: (mappingFile ? mappingFile.name : "auto-mapping.json"), text: null },
    };

    // Mapping text (required) — but keep size sane
    let mappingText = null;
    if (mappingFile) {
      mappingText = await readFileAsText(mappingFile);
      if (bytesOf(mappingText) > MAX_TEXT_BYTES) {
        return setMsg("err", "Mapping file is too large for MVP local storage. Keep it smaller for now.");
      }
      draft.mapping.text = mappingText;
    } else {
      // Auto-map from tags in the teacher TXT when no mapping file is provided.
      let assignmentTextRaw = "";
      if (assignmentFile && typeof rcIsTextFile === "function" && rcIsTextFile(assignmentFile)) {
        try { assignmentTextRaw = await assignmentFile.text(); } catch (_) { /* noop */ }
      }
      const autoMapping = (typeof autoMapFromTeacherTxt === "function") ? autoMapFromTeacherTxt(assignmentTextRaw) : null;
      mappingText = JSON.stringify(autoMapping || { version: 1, sections: [], warnings: ["Auto-mapping unavailable"], counts: { sections: 0, items: 0, warnings: 1 } }, null, 2);
      if (bytesOf(mappingText) > MAX_TEXT_BYTES) {
        return setMsg("err", "Auto-generated mapping is too large for MVP local storage.");
      }
      draft.mapping.text = mappingText;
      const w = (autoMapping && autoMapping.counts) ? (autoMapping.counts.warnings || 0) : 0;
      const n = (autoMapping && autoMapping.counts) ? (autoMapping.counts.items || 0) : 0;
      setMsg(w ? "warn" : "ok", "Auto-mapped " + n + " item(s) from tags" + (w ? " (" + w + " missing-code warning(s))" : ""));
    }

    // Assignment: prefer link; file stored only if small
    if (assignmentLink) {
      draft.assignment.kind = "link";
      draft.assignment.link = assignmentLink;
    } else if (assignmentFile) {
      const assignmentText = await readFileAsText(assignmentFile);
      if (bytesOf(assignmentText) > MAX_TEXT_BYTES) {
        // store metadata only
        draft.assignment.kind = "file";
        draft.assignment.name = assignmentFile.name;
        draft.assignment.text = null;
      } else {
        draft.assignment.kind = "file";
        draft.assignment.name = assignmentFile.name;
        draft.assignment.text = assignmentText;
      }
    }

    const drafts = readDrafts();
    drafts.unshift(draft);
    writeDrafts(drafts);
    renderTable(drafts);

    setMsg("ok", "Draft saved (browser-local).");
    $("workDraftForm").reset();
    setTimeout(clearMsg, 1400);
  }

  function wireModal() {
    const overlay = $("draftOverlay");
    const closeBtn = $("btnClosePreview");
    const dlBtn = $("btnDownloadOne");
    if (!overlay || !closeBtn || !dlBtn) return;

    closeBtn?.addEventListener("click", closePreview);
    dlBtn?.addEventListener("click", () => {
      if (previewingId) exportOne(previewingId);
    });

    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) closePreview();
    });

    document?.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closePreview();
    });
  }

  function init() {
    const drafts = readDrafts();
    renderTable(drafts);

    $("workDraftForm")?.addEventListener("submit", onSaveDraft);
    $("btnExportAll")?.addEventListener("click", exportAll);
    $("btnClearAll")?.addEventListener("click", clearAll);
    $("btnFillExample")?.addEventListener("click", fillExample);

    wireModal();
  }

  if (document.readyState === "loading") document?.addEventListener("DOMContentLoaded", init);
  else init();
})();







/* rc-tc-work-qol patch: cleanup duplicates + hide accidental dump + modal button delegation */
(() => {
  try {
    if (!location.pathname.startsWith("/teacher/work")) return;

    // Style patch (keeps toggles from looking like they were dropped from orbit)
    const styleId = "rcTcWorkQolPatchStyle";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `
        #rcQolControls { display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:center; margin:10px 0 6px; }
        #rcQolControls label { display:flex; gap:8px; align-items:center; font-size:12px; opacity:.95; }
        #rcQolControls input[type="checkbox"] { transform: translateY(1px); }
      `;
      document.head.appendChild(s);
    }

    const cleanup = () => {
      // Remove duplicate controls blocks if injected multiple times
      const blocks = document.querySelectorAll("#rcQolControls");
      blocks.forEach((b, idx) => { if (idx > 0) b.remove(); });

      // Hide/remove any accidental DOM dump of the QOL script itself
      const bad = Array.from(document.querySelectorAll("pre, code, textarea, div"))
        .filter(el => (el.textContent || "").includes("BEGIN rc-tc-work-qol"));
      bad.forEach(el => { el.style.display = "none"; el.setAttribute("data-rc-qol-hidden", "1"); });
    };

    const onReady = (fn) => {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once:true });
      else fn();
    };

    onReady(() => {
      cleanup();
      setTimeout(cleanup, 400);
      setTimeout(cleanup, 1200);
    });

    // Modal button delegation: makes the "Enable Mega / Treat single / Exit" buttons work even if they were created without listeners.
    if (!window.__RC_TC_WORK_QOL_MODAL_DELEGATE__) {
      window.__RC_TC_WORK_QOL_MODAL_DELEGATE__ = true;
      document.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        const t = (btn.textContent || "").trim();
        if (t === "Enable Mega (split on Save)") {
          localStorage.setItem("rc_tc_work_mega_split", "1");
          document.querySelector("#rcQolHeaderModal, #rcMegaModal, .rc-qol-modal-backdrop")?.remove?.();
        } else if (t === "Treat as single-class anyway") {
          localStorage.setItem("rc_tc_work_mega_split", "0");
          document.querySelector("#rcQolHeaderModal, #rcMegaModal, .rc-qol-modal-backdrop")?.remove?.();
        } else if (t === "Exit") {
          document.querySelector("#rcQolHeaderModal, #rcMegaModal, .rc-qol-modal-backdrop")?.remove?.();
        }
      }, true);
    }
  } catch (err) {
    console.warn("[tc-work-qol patch] failed", err);
  }
})();

// BEGIN rc-tc-work-unified v3
(() => {
  const BUILD = "2025-12-31-v3b";
  const PATH_OK =
    location.pathname === "/teacher/work/" ||
    location.pathname === "/teacher/work" ||
    location.pathname.startsWith("/teacher/work");

  if (!PATH_OK) return;
  if (window.__RC_TC_WORK_UNIFIED_V3__) return;
  window.__RC_TC_WORK_UNIFIED_V3__ = true;

  const log = (...a) => console.debug("[tc-work v3]", ...a);

  // ---------- Style ----------
  const ensureStyle = () => {
    if (document.getElementById("rcTcWorkUnifiedV3Style")) return;
    const css = `
      #rcWorkOptionsRowV3 {
        display: flex;
        gap: 14px;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 10px;
        padding: 10px 12px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 12px;
        background: rgba(0,0,0,.18);
      }
      #rcWorkOptionsRowV3 .rcOptGroup {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 999px;
        background: rgba(0,0,0,.10);
      }
      #rcWorkOptionsRowV3 input[type="checkbox"] { transform: translateY(1px); }
      #rcWorkOptionsRowV3 .rcOptLabel { font-size: 12px; opacity: .95; }
      #rcWorkMultiSelectWrapV3 {
        display: none;
        width: 100%;
        margin-top: 10px;
      }
      #rcWorkMultiSelectWrapV3 select[multiple] {
        width: 100%;
        min-height: 120px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(0,0,0,.12);
        color: inherit;
        padding: 8px;
      }
      dialog#rcWorkPreviewDialogV3 {
        width: min(920px, calc(100vw - 40px));
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 16px;
        background: rgba(8,10,12,.92);
        color: inherit;
        padding: 0;
      }
      #rcWorkPreviewDialogV3 .rcHdr {
        display:flex; justify-content: space-between; align-items:center;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255,255,255,.10);
      }
      #rcWorkPreviewDialogV3 .rcHdr h3 { margin:0; font-size: 16px; }
      #rcWorkPreviewDialogV3 .rcBody { padding: 14px 16px; max-height: 72vh; overflow:auto; }
      #rcWorkPreviewDialogV3 .qCard {
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 14px;
        padding: 12px;
        margin: 10px 0;
        background: rgba(255,255,255,.04);
      }
      #rcWorkPreviewDialogV3 .qStem { font-weight: 700; margin-bottom: 10px; }
      #rcWorkPreviewDialogV3 .qOpt { display:flex; gap:10px; align-items:flex-start; margin: 8px 0; }
      #rcWorkPreviewDialogV3 textarea {
        width:100%;
        min-height: 180px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(0,0,0,.12);
        color: inherit;
        padding: 10px;
      }
      #rcWorkPreviewDialogV3 .btn {
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06);
        color: inherit;
        border-radius: 999px;
        padding: 8px 12px;
        cursor: pointer;
      }
    `;
    const st = document.createElement("style");
    st.id = "rcTcWorkUnifiedV3Style";
    st.textContent = css;
    document.head.appendChild(st);
  };
  ensureStyle();

  // ---------- 1) Nuke accidental on-page source dump ----------
  const removeSourceDump = () => {
    const needles = ["BEGIN rc-", "rc-tc-work-qol", "rc-work-mega-ux", "rc-work-fixes"];
    const nodes = Array.from(document.querySelectorAll("pre, code, div, p, section, article"))
      .filter(n => n && typeof n.textContent === "string")
      .filter(n => (n.textContent || "").length > 1500)
      .filter(n => needles.some(x => (n.textContent || "").includes(x)));

    for (const n of nodes) {
      const t = (n.textContent || "").trimStart();
      if (
        t.startsWith("/*") ||
        t.startsWith("//") ||
        t.includes("(() => {") ||
        t.includes("document.addEventListener")
      ) n.remove();
    }
  };
  removeSourceDump();
  new MutationObserver(removeSourceDump).observe(document.documentElement, { subtree: true, childList: true });

  // ---------- Helpers ----------
  const byText = (sel, re) =>
    Array.from(document.querySelectorAll(sel)).find(el => re.test((el.textContent || "").trim()));

  const findControlByLabel = (labelRe) => {
    const lab = byText("label", labelRe);
    if (!lab) return null;
    const forId = lab.getAttribute("for");
    if (forId) return document.getElementById(forId);
    return lab.closest(".form-field, .field, .input, .form-group, .row, div")?.querySelector("input, select, textarea") || null;
  };

  const findClassSelect = () => {
    const s = findControlByLabel(/class/i);
    if (s && s.tagName === "SELECT") return s;
    const sels = Array.from(document.querySelectorAll("select"));
    return sels.find(x => Array.from(x.options || []).some(o => /LA\s*\d/i.test((o.textContent || "")))) || null;
  };

  const classSel = findClassSelect();
  const saveBtn = byText("button", /save draft/i);

  if (!classSel || !saveBtn) {
    log("Missing class select or Save Draft button; will retry.");
    new MutationObserver(() => {
      const cs = findClassSelect();
      const sb = byText("button", /save draft/i);
      if (cs && sb) location.reload();
    }).observe(document.documentElement, { subtree: true, childList: true });
    return;
  }

  const ensureLifeSkillsOptions = () => {
    const texts = Array.from(classSel.options || []).map(o => (o.textContent || "").trim());
    if (!texts.includes("Life Skills")) {
      const opt = document.createElement("option");
      opt.value = "Life Skills";
      opt.textContent = "Life Skills";
      classSel.appendChild(opt);
    }
    if (!texts.includes("Life Skills LA")) {
      const opt = document.createElement("option");
      opt.value = "Life Skills LA";
      opt.textContent = "Life Skills LA";
      classSel.appendChild(opt);
    }
  };
  ensureLifeSkillsOptions();

  const scanCheckboxes = () => {
    const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    const meta = cbs.map(cb => {
      const label = cb.closest("label");
      const t = (label?.textContent || cb.parentElement?.textContent || "").replace(/\s+/g, " ").trim();
      return { cb, t };
    });
    const mega = meta.find(m => /mega/i.test(m.t) && /multi|class/i.test(m.t))?.cb || null;
    const apply = meta.find(m => /apply/i.test(m.t) && /multiple classes/i.test(m.t))?.cb || null;
    return { mega, apply, meta };
  };

  // ---------- 2) Deduplicate multi-class controls + mount one clean row ----------
  const mountRow = () => {
    ensureStyle();
    ensureLifeSkillsOptions();

    const { mega, apply, meta } = scanCheckboxes();

    for (const m of meta) {
      const t = (m.t || "").toLowerCase();
      const isMega = t.includes("mega") && (t.includes("multi") || t.includes("class"));
      const isApply = t.includes("apply") && t.includes("multiple classes");
      const shouldHide = (isMega && mega && m.cb !== mega) || (isApply && apply && m.cb !== apply);

      if (shouldHide) {
        const wrap = m.cb.closest("label") || m.cb.parentElement;
        if (wrap) wrap.style.display = "none";
      }
    }

    let row = document.getElementById("rcWorkOptionsRowV3");
    if (!row) {
      row = document.createElement("div");
      row.id = "rcWorkOptionsRowV3";

      const g1 = document.createElement("div");
      g1.className = "rcOptGroup";
      const cbApply = document.createElement("input");
      cbApply.type = "checkbox";
      cbApply.id = "rcApplyMultiV3";
      const lbApply = document.createElement("label");
      lbApply.className = "rcOptLabel";
      lbApply.setAttribute("for", cbApply.id);
      lbApply.textContent = "Apply to multiple classes";
      g1.append(cbApply, lbApply);

      const g2 = document.createElement("div");
      g2.className = "rcOptGroup";
      const cbMega = document.createElement("input");
      cbMega.type = "checkbox";
      cbMega.id = "rcMegaSplitV3";
      const lbMega = document.createElement("label");
      lbMega.className = "rcOptLabel";
      lbMega.setAttribute("for", cbMega.id);
      lbMega.textContent = "Mega-split by class headers (TXT)";
      g2.append(cbMega, lbMega);

      const hint = document.createElement("div");
      hint.style.fontSize = "12px";
      hint.style.opacity = ".85";
      hint.textContent = "Clean controls only — underlying logic still uses the original checkboxes.";

      row.append(g1, g2, hint);

      const wrap = document.createElement("div");
      wrap.id = "rcWorkMultiSelectWrapV3";
      wrap.innerHTML = '<div style="font-size:12px; opacity:.85; margin-bottom:8px;">Choose classes:</div>';
      const sel = document.createElement("select");
      sel.id = "rcMultiSelectV3";
      sel.multiple = true;
      wrap.appendChild(sel);
      row.appendChild(wrap);

      const host = classSel.closest(".form-field, .field, .input, .form-group, .row, div") || classSel.parentElement;
      (host?.parentElement || host).appendChild(row);
    }

    const ms = document.getElementById("rcMultiSelectV3");
    if (ms && ms.options.length === 0) {
      const opts = Array.from(classSel.options || [])
        .map(o => ({ value: o.value, text: (o.textContent || "").trim() }))
        .filter(o => o.text && !/select/i.test(o.text))
        .filter(o => o.value !== "");
      for (const o of opts) {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.text;
        ms.appendChild(opt);
      }
    }

    const { mega: megaCb, apply: applyCb } = scanCheckboxes();
    const cbApplyUI = document.getElementById("rcApplyMultiV3");
    const cbMegaUI = document.getElementById("rcMegaSplitV3");
    const msWrap = document.getElementById("rcWorkMultiSelectWrapV3");

    if (cbApplyUI && applyCb) cbApplyUI.checked = !!applyCb.checked;
    if (cbMegaUI && megaCb) cbMegaUI.checked = !!megaCb.checked;
    if (msWrap) msWrap.style.display = (cbApplyUI?.checked ? "block" : "none");

    cbApplyUI?.addEventListener("change", () => {
      if (applyCb) {
        applyCb.checked = cbApplyUI.checked;
        applyCb.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (msWrap) msWrap.style.display = (cbApplyUI.checked ? "block" : "none");
    });

    cbMegaUI?.addEventListener("change", () => {
      if (megaCb) {
        megaCb.checked = cbMegaUI.checked;
        megaCb.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  };

  mountRow();
  new MutationObserver(() => mountRow()).observe(document.documentElement, { subtree: true, childList: true });

  // ---------- 3) Fix modal buttons that sometimes become dead ----------
  const closeNearestDialog = (el) => {
    const dlg = el?.closest?.("dialog");
    if (dlg && dlg.open) dlg.close();
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const t = (btn.textContent || "").trim().toLowerCase();

    if (t.includes("enable mega")) {
      e.preventDefault(); e.stopPropagation();
      document.getElementById("rcMegaSplitV3")?.click();
      closeNearestDialog(btn);
      return;
    }
    if (t.includes("treat as single-class")) {
      e.preventDefault(); e.stopPropagation();
      const megaUI = document.getElementById("rcMegaSplitV3");
      if (megaUI && megaUI.checked) megaUI.click();
      closeNearestDialog(btn);
      return;
    }
    if (t === "exit" || t === "close") {
      e.preventDefault(); e.stopPropagation();
      closeNearestDialog(btn);
      return;
    }
  }, true);

  // ---------- 4) Draft Preview/Edit takeover ----------
  const DRAFTS_KEY = "rc_tc_work_drafts_v1";
  const safeJson = (s) => { try { return JSON.parse(s); } catch (err) { return null; } };
  const loadDrafts = () => {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const val = safeJson(raw);
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === "object") return Object.values(val);
    return [];
  };

  const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const draftTitle = (d) => d?.title || d?.name || d?.draftTitle || d?.assignmentTitle || "";
  const draftClass = (d) => d?.classLabel || d?.class || d?.className || d?.class_name || d?.classId || d?.class_id || "";
  const draftText  = (d) => d?.assignmentText || d?.assignment || d?.text || d?.content || d?.body || d?.sourceText || "";

  const findDraftFromCard = (card) => {
    const lines = (card?.innerText || "").split("\n").map(x => x.trim()).filter(Boolean);
    const titleGuess = lines[0] || "";
    const classGuess = lines.find(x => /^LA\s*\d+\s*SC$/i.test(x) || /^life skills/i.test(x)) || "";

    const drafts = loadDrafts();
    const tN = norm(titleGuess);
    const cN = norm(classGuess);

    return drafts.find(d => norm(draftTitle(d)) === tN && (!cN || norm(draftClass(d)) === cN))
        || drafts.find(d => norm(draftTitle(d)) === tN)
        || null;
  };

  const ensurePreviewDialog = () => {
    let dlg = document.getElementById("rcWorkPreviewDialogV3");
    if (dlg) return dlg;

    dlg = document.createElement("dialog");
    dlg.id = "rcWorkPreviewDialogV3";
    dlg.innerHTML = `
      <div class="rcHdr">
        <h3 id="rcWorkPreviewTitleV3">Preview</h3>
        <button class="btn" type="button" data-rc-close="1">Close</button>
      </div>
      <div class="rcBody" id="rcWorkPreviewBodyV3"></div>
    `;
    document.body.appendChild(dlg);

    dlg.addEventListener("click", (e) => {
      if (e.target?.getAttribute?.("data-rc-close") === "1") dlg.close();
    });

    return dlg;
  };

  const parseItems = (text) => {
    const lines = String(text || "").split(/\r?\n/);
    const items = [];
    let cur = null;

    const pushCur = () => { if (cur) items.push(cur); cur = null; };
    const start = (kind, stem) => { pushCur(); cur = { kind, stem: (stem || "").trim(), opts: [] }; };

    for (const raw of lines) {
      const s = (raw || "").trim();
      if (!s) continue;

      if (/written response|short answer|paragraph/i.test(s)) {
        start("wr", s);
        continue;
      }

      // eslint-friendly + actually-correct regex (no double escaping)
      const q = s.match(/^(\d+)\s*[.)\-:]\s*(.+)$/);
      if (q) { start("mc", q[2]); continue; }

      const o = s.match(/^[A-C]\s*[.)\-:]\s*(.+)$/);
      if (o) {
        if (!cur) start("mc", "Question");
        cur.opts.push(o[1]);
        continue;
      }

      if (!cur) start("text", s);
      else cur.stem = cur.stem ? (cur.stem + " " + s) : s;
    }

    pushCur();
    if (!items.length && text) return [{ kind: "text", stem: String(text), opts: [] }];
    return items;
  };

  const renderStudentishPreview = (draft) => {
    const dlg = ensurePreviewDialog();
    const title = `${draftTitle(draft) || "Draft"} — ${draftClass(draft) || "Class"}`;
    dlg.querySelector("#rcWorkPreviewTitleV3").textContent = title;

    const body = dlg.querySelector("#rcWorkPreviewBodyV3");
    body.innerHTML = "";

    const text = draftText(draft);

    if (!text) {
      const pre = document.createElement("pre");
      pre.textContent = "No assignment text found for this draft.";
      pre.style.whiteSpace = "pre-wrap";
      body.appendChild(pre);
    } else {
      const items = parseItems(text);
      let idx = 0;

      for (const it of items) {
        idx += 1;
        const card = document.createElement("div");
        card.className = "qCard";

        const stem = document.createElement("div");
        stem.className = "qStem";
        stem.textContent = `${idx}. ${it.stem}`;
        card.appendChild(stem);

        if (it.kind === "mc" && it.opts.length) {
          const group = `q${idx}_${Math.random().toString(16).slice(2)}`;
          for (const opt of it.opts.slice(0, 6)) {
            const row = document.createElement("label");
            row.className = "qOpt";
            row.innerHTML = `<input type="radio" name="${group}"><span>${opt}</span>`;
            card.appendChild(row);
          }
        } else if (it.kind === "wr") {
          const ta = document.createElement("textarea");
          ta.placeholder = "Student written response… (teacher preview)";
          card.appendChild(ta);
        } else {
          const pre = document.createElement("pre");
          pre.textContent = it.stem;
          pre.style.whiteSpace = "pre-wrap";
          pre.style.margin = "0";
          pre.style.opacity = ".95";
          card.appendChild(pre);
        }

        body.appendChild(card);
      }
    }

    // Ensure modal can be opened repeatedly without InvalidStateError
    try { if (dlg.open) dlg.close(); } catch (err) { /* ignore */ }
    dlg.showModal();
  };

  const fillFormFromDraft = (draft) => {
    const titleInput =
      findControlByLabel(/title/i) ||
      document.querySelector('input[type="text"]');

    const linkInput =
      document.querySelector('input[type="url"]') ||
      document.querySelector('input[placeholder^="https://"]');

    const notes =
      findControlByLabel(/notes/i) ||
      document.querySelector("textarea");

    if (titleInput) titleInput.value = draftTitle(draft) || "";

    const want = norm(draftClass(draft));
    if (want) {
      const opt = Array.from(classSel.options || []).find(o =>
        norm((o.textContent || "")) === want || norm(o.value) === want
      );
      if (opt) {
        classSel.value = opt.value;
        classSel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    if (linkInput) {
      const link = draft?.link || draft?.assignmentLink || draft?.url || "";
      if (link) linkInput.value = link;
    }

    if (notes) notes.value = draft?.notes || draft?.teacherNotes || "";

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const findDraftCard = (btn) => {
    let el = btn.closest("tr") || btn.closest('[role="row"]') || btn.closest("div");
    while (el && el !== document.body) {
      const txt = (el.innerText || "");
      if (/release:/i.test(txt) && /preview/i.test(txt) && /export/i.test(txt)) return el;
      el = el.parentElement;
    }
    return null;
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const label = (btn.textContent || "").trim().toLowerCase();
    if (label !== "preview" && label !== "edit") return;

    const card = findDraftCard(btn);
    if (!card) return;

    const draft = findDraftFromCard(card);
    if (!draft) return;

    e.preventDefault();
    e.stopPropagation();

    if (label === "preview") renderStudentishPreview(draft);
    if (label === "edit") fillFormFromDraft(draft);
  }, true);

  log("build", BUILD);
})();
// END rc-tc-work-unified v3

