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

    $("workDraftForm").addEventListener("submit", onSaveDraft);
    $("btnExportAll").addEventListener("click", exportAll);
    $("btnClearAll").addEventListener("click", clearAll);
    $("btnFillExample").addEventListener("click", fillExample);

    wireModal();
  }

  if (document.readyState === "loading") document?.addEventListener("DOMContentLoaded", init);
  else init();
})();


// BEGIN rc-work-mega-ux v2
(() => {
  if (window.__rcWorkMegaUxV2) return;
  window.__rcWorkMegaUxV2 = true;

  const DRAFT_KEY = "rc_tc_work_drafts_v1";
  const MAX_TEXT_BYTES = 800_000; // keep localStorage safe-ish (MVP only)

  const CANON_CLASSES = [
    "LA 1 SC",
    "LA 2 SC",
    "LA 3 SC",
    "LA 4 SC",
    "Life Skills",
    "Life Skills LA",
  ];

  const LA_TOKENS = /\b(la|ela)\b|english\s+language\s+arts|language\s+arts/i;

  function bytesOf(str) {
    try { return new TextEncoder().encode(String(str || "")).length; }
    catch (_) { return String(str || "").length; }
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function normalizeHeaderToClass(rawHeader) {
    const t = norm(rawHeader);

    const hasLifeSkills = t.includes("life") && t.includes("skills");
    const hasLA = LA_TOKENS.test(t);

    // IMPORTANT: Life Skills vs Life Skills LA must remain distinct.
    if (hasLifeSkills && hasLA) return "Life Skills LA";
    if (hasLifeSkills) return "Life Skills";

    // LA 1-4 (accepts: "LA1", "LA 1", "ELA 2", "Language Arts 3", "English Language Arts 4", etc.)
    const m = t.match(/\b(?:la|ela|language\s+arts|english\s+language\s+arts)\s*([1-4])\b/);
    if (m && m[1]) return `LA ${m[1]} SC`;

    return null;
  }

  function getClassSelect() {
    return document.getElementById("draftClass") || document.getElementById("className");
  }

  function ensureClassDropdown() {
    const sel = getClassSelect();
    if (!sel) return;

    // Don’t force single-class selection when using mega mode.
    try { sel.required = false; } catch (e) { /* ignore */ }

    const existing = new Set(Array.from(sel.options || []).map(o => o.value));
    for (const c of CANON_CLASSES) {
      if (!existing.has(c)) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
      }
    }
  }

  function ensureMegaCheckbox() {
    const sel = getClassSelect();
    if (!sel) return;

    if (document.getElementById("rcMegaMode")) return;

    const wrap = document.createElement("label");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";
    wrap.style.marginTop = "6px";
    wrap.style.userSelect = "none";

    wrap.innerHTML = `
      <input type="checkbox" id="rcMegaMode" />
      <span>Multi-class mega TXT (auto-split; no single class selection)</span>
    `;

    sel.insertAdjacentElement("afterend", wrap);

    const cb = document.getElementById("rcMegaMode");

    const sync = () => {
      if (!cb) return;
      if (cb.checked) {
        sel.value = "";
        sel.disabled = true;
      } else {
        sel.disabled = false;
      }
    };

    cb?.addEventListener("change", sync);
    sync();
  }

  function getFormEl(id, fallbackSelector) {
    return document.getElementById(id) || (fallbackSelector ? document.querySelector(fallbackSelector) : null);
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

      // Header is usually the previous non-empty line (allow a small gap)
      let h = i - 1;
      while (h >= 0 && lines[h].trim() === "" && i - h <= 3) h--;
      const rawHeader = h >= 0 ? lines[h].trim() : "";
      const cls = normalizeHeaderToClass(rawHeader);
      if (!cls) continue;

      hits.push({ cls, sepIndex: i });
    }

    if (hits.length < 2) return [];

    const sections = [];
    for (let j = 0; j < hits.length; j++) {
      const start = hits[j].sepIndex + 1;
      const end = (j + 1 < hits.length) ? (hits[j + 1].sepIndex - 1) : lines.length;
      const body = lines.slice(start, end).join("\n").trim();
      sections.push({ cls: hits[j].cls, body });
    }
    return sections;
  }
  function loadDrafts() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "[]"); }
    catch (e) { return []; }
  }

  function saveDrafts(ds) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(ds));
  }

  function makeId() {
    return "d_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
  }

  function titleIncludesClass(title, cls) {
    return norm(title).includes(norm(cls));
  }

  function fileSig(f) {
    if (!f) return "";
    return `${f.name}|${f.size}|${f.lastModified || 0}`;
  }

  function ensureMegaPrompt() {
    if (document.getElementById("rcMegaPromptOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "rcMegaPromptOverlay";
    overlay.hidden = true;
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;";

    overlay.innerHTML = `
      <div style="max-width:760px; width:100%; background:rgba(20,24,28,.98); color:#fff; border:1px solid rgba(255,255,255,.12); border-radius:14px; padding:16px; box-shadow:0 10px 30px rgba(0,0,0,.5);">
        <div style="font-size:18px; font-weight:800; margin-bottom:8px;">Multi-class headers detected</div>
        <div id="rcMegaPromptMsg" style="opacity:.95; line-height:1.35; margin-bottom:12px;"></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
          <button type="button" id="rcMegaPromptEnable" class="work-btn">Enable Mega (split on Save)</button>
          <button type="button" id="rcMegaPromptSingle" class="work-btn">Treat as single-class anyway</button>
          <button type="button" id="rcMegaPromptExit" class="work-btn">Exit</button>
        </div>
      </div>
    `;

    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) {
        // Click outside = Exit
        const btn = document.getElementById("rcMegaPromptExit");
        if (btn) btn.click();
      }
    });

    document.body.appendChild(overlay);
  }

  function askMegaDecision(detectedClasses) {
    return new Promise((resolve) => {
      ensureMegaPrompt();
      const overlay = document.getElementById("rcMegaPromptOverlay");
      const msg = document.getElementById("rcMegaPromptMsg");
      const bEnable = document.getElementById("rcMegaPromptEnable");
      const bSingle = document.getElementById("rcMegaPromptSingle");
      const bExit = document.getElementById("rcMegaPromptExit");
      if (!overlay || !msg || !bEnable || !bSingle || !bExit) {
        // Fallback: if UI fails, treat as Exit.
        resolve("exit");
        return;
      }

      const list = (detectedClasses && detectedClasses.length)
        ? detectedClasses.join(", ")
        : "multiple classes";

      msg.textContent = `This TXT appears to contain multiple class sections (${list}). What do you want to do?`;

      const cleanup = () => {
        overlay.hidden = true;
        bEnable.removeEventListener("click", onEnable);
        bSingle.removeEventListener("click", onSingle);
        bExit.removeEventListener("click", onExit);
      };

      const onEnable = () => { cleanup(); resolve("mega"); };
      const onSingle = () => { cleanup(); resolve("single"); };
      const onExit = () => { cleanup(); resolve("exit"); };

      bEnable?.addEventListener("click", onEnable);
      bSingle?.addEventListener("click", onSingle);
      bExit?.addEventListener("click", onExit);

      overlay.hidden = false;
    });
  }

  async function splitMegaFromCurrentForm() {
    const form =
      document.getElementById("workDraftForm") ||
      document.getElementById("draftForm") ||
      document.querySelector("form");

    if (!form) return;

    const titleEl =
      getFormEl("draftTitle", 'input[name="title"]') ||
      getFormEl("title", 'input[name="title"]');

    const classSel =
      getFormEl("draftClass", 'select[name="className"]') ||
      getFormEl("className", 'select[name="className"]');

    const releaseEl =
      getFormEl("draftRelease", 'input[name="releaseAt"]') ||
      getFormEl("releaseAt", 'input[name="releaseAt"]');

    const dueEl =
      getFormEl("draftDue", 'input[name="dueAt"]') ||
      getFormEl("dueAt", 'input[name="dueAt"]');

    const notesEl =
      getFormEl("draftNotes", 'textarea[name="notes"]') ||
      getFormEl("notes", 'textarea[name="notes"]');

    const { assignment: aIn, mapping: mIn } = pickFileInputs(form);
    const aFile = aIn && aIn.files && aIn.files[0] ? aIn.files[0] : null;
    const mFile = mIn && mIn.files && mIn.files[0] ? mIn.files[0] : null;

    if (!aFile) {
      alert("Choose a mega TXT assignment file first.");
      return;
    }

    const raw = await readFileText(aFile);
    const sections = parseMegaSections(raw);

    if (sections.length < 2) {
      alert("That file doesn’t look like a multi-class mega TXT (need 2+ recognizable class headers).");
      return;
    }

    const baseTitle = getVal(titleEl) || aFile.name;
    const notes = getVal(notesEl) || "";
    const releaseAt = toIsoMaybe(getVal(releaseEl));
    const dueAt = toIsoMaybe(getVal(dueEl));

    // Read mapping once if provided; otherwise we auto-map per class when possible.
    let mappingTextFromFile = null;
    if (mFile) {
      try { mappingTextFromFile = await readFileText(mFile); }
      catch (e) { console.warn("Mapping read failed:", e); }
      if (mappingTextFromFile && bytesOf(mappingTextFromFile) > MAX_TEXT_BYTES) {
        alert("Mapping file is too large for MVP local storage. Keep it smaller for now.");
        return;
      }
    }

    const drafts = loadDrafts();

    for (const sec of sections) {
      const cls = sec.cls;

      const chunk = `${cls}\n===\n${sec.body}\n`;

      const t = titleIncludesClass(baseTitle, cls) ? baseTitle : `${baseTitle} — ${cls}`;

      let mappingText = null;
      if (mappingTextFromFile != null) {
        mappingText = mappingTextFromFile;
      } else if (typeof window.autoMapFromTeacherTxt === "function") {
        const auto = window.autoMapFromTeacherTxt(chunk);
        mappingText = JSON.stringify(auto || { version: 1, sections: [], warnings: ["Auto-mapping unavailable"], counts: { sections: 0, items: 0, warnings: 1 } }, null, 2);
      } else {
        mappingText = JSON.stringify({ version: 1, sections: [], warnings: ["Auto-mapping unavailable"], counts: { sections: 0, items: 0, warnings: 1 } }, null, 2);
      }

      if (bytesOf(chunk) > MAX_TEXT_BYTES) {
        alert("One of the split class chunks is too large for MVP local storage.");
        return;
      }
      if (bytesOf(mappingText) > MAX_TEXT_BYTES) {
        alert("Auto-generated mapping is too large for MVP local storage.");
        return;
      }

      drafts.unshift({
        id: makeId(),
        title: t,
        className: cls,
        releaseAt: releaseAt || null,
        dueAt: dueAt || null,
        notes: notes || null,
        createdAt: new Date().toISOString(),
        assignment: {
          kind: "file",
          name: aFile.name,
          link: null,
          text: chunk,
        },
        mapping: {
          kind: (mFile ? "file" : "auto"),
          name: (mFile ? mFile.name : "auto-mapping.json"),
          text: mappingText,
        },
      });
    }

    saveDrafts(drafts);

    // keep mega mode enabled after split
    const cb = document.getElementById("rcMegaMode");
    if (cb && classSel) {
      classSel.value = "";
      classSel.disabled = true;
    }

    alert(`Created ${sections.length} drafts (one per class).`);
    location.reload();
  }

  function wire() {
    const form =
      document.getElementById("workDraftForm") ||
      document.getElementById("draftForm") ||
      document.querySelector("form");

    const btn = document.getElementById("btnSplitMega");

    ensureClassDropdown();
    ensureMegaCheckbox();

    const classSel = getClassSelect();
    const cb = document.getElementById("rcMegaMode");

    let confirmedSingleSig = "";
    let cachedLooksMegaSig = "";
    let cachedDetected = [];

    const sync = () => {
      if (!cb || !classSel) return;
      if (cb.checked) {
        classSel.value = "";
        classSel.disabled = true;
      } else {
        classSel.disabled = false;
      }
    };

    if (cb) cb?.addEventListener("change", sync);
    sync();

    // When a file is chosen and mega is OFF: if 2+ headers detected, prompt with 3 options.
    if (form) {
      const { assignment: aIn } = pickFileInputs(form);
      if (aIn) {
        aIn?.addEventListener("change", async () => {
          try {
            const f = aIn.files && aIn.files[0] ? aIn.files[0] : null;
            if (!f) return;
            const sig = fileSig(f);

            cachedLooksMegaSig = "";
            cachedDetected = [];

            const txt = await readFileText(f);
            const secs = parseMegaSections(txt);
            if (secs.length >= 2) {
              cachedLooksMegaSig = sig;
              cachedDetected = Array.from(new Set(secs.map(x => x.cls)));

              // Only prompt when Mega is OFF and user hasn't already chosen "single-class anyway" for this file
              if (cb && !cb.checked && confirmedSingleSig != sig) {
                const decision = await askMegaDecision(cachedDetected);
                if (decision === "mega") {
                  cb.checked = true;
                  confirmedSingleSig = ""; // not relevant anymore
                  sync();
                } else if (decision === "single") {
                  confirmedSingleSig = sig;
                  sync();
                } else {
                  // exit
                  aIn.value = "";
                  confirmedSingleSig = "";
                  cachedLooksMegaSig = "";
                  cachedDetected = [];
                  sync();
                }
              }
            }
          } catch (e) {
            console.warn("Mega detection/prompt failed:", e);
          }
        });
      }
    }

    // Split button (if present) still works
    if (btn) {
      try { btn.type = "button"; } catch (e) { /* ignore */ }
      btn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        splitMegaFromCurrentForm().catch(err => console.warn(err));
      }, true);
    }

    // Submit behavior:
    // - If Mega ON: split
    // - If Mega OFF but file looks mega: popup with 3 options
    // - Otherwise: normal single-class save (handled elsewhere)
    if (form) {
      form?.addEventListener("submit", async (e) => {
        if (form.dataset.rcMegaBypassOnce === "1") {
          delete form.dataset.rcMegaBypassOnce;
          return;
        }

        const isMega = !!(cb && cb.checked);
        if (isMega) {
          e.preventDefault();
          e.stopImmediatePropagation();
          await splitMegaFromCurrentForm().catch(err => console.warn(err));
          return;
        }

        const { assignment: aIn } = pickFileInputs(form);
        const f = aIn && aIn.files && aIn.files[0] ? aIn.files[0] : null;
        if (!f) return;

        const sig = fileSig(f);

        // If we already confirmed "treat single" for this file, allow normal save
        if (confirmedSingleSig == sig) return;

        // If cached said mega, or we can quickly detect, prompt
        let detected = cachedLooksMegaSig == sig ? cachedDetected : null;

        if (!detected) {
          try {
            const txt = await readFileText(f);
            const secs = parseMegaSections(txt);
            if (secs.length >= 2) detected = Array.from(new Set(secs.map(x => x.cls)));
          } catch (err) { /* ignore */ }
        }

        if (detected && detected.length >= 2) {
          e.preventDefault();
          e.stopImmediatePropagation();

          const decision = await askMegaDecision(detected);

          if (decision === "mega") {
            if (cb) cb.checked = true;
            sync();
            await splitMegaFromCurrentForm().catch(err => console.warn(err));
            return;
          }

          if (decision === "single") {
            confirmedSingleSig = sig;
            // Re-submit once, letting the normal single-class handler run
            form.dataset.rcMegaBypassOnce = "1";
            try { form.requestSubmit(); } catch (_) { form.submit(); }
            return;
          }

          // exit
          return;
        }
      }, true);
    }
  }

  window?.addEventListener("DOMContentLoaded", wire);
})();
// END rc-work-mega-ux v2

// BEGIN rc-tc-work-qol v1
(() => {
  "use strict";
  try {
    if (!/\/teacher\/work\/?/.test(location.pathname)) return;

    const TAG = "[tc-work-qol]";
    const log = (...a) => console.log(TAG, ...a);

    const CLASS_LABELS = ["LA 1 SC","LA 2 SC","LA 3 SC","LA 4 SC","Life Skills","Life Skills LA"];
    const CLASS_CANON = Object.fromEntries(CLASS_LABELS.map(x => [x.toUpperCase(), x]));

    const byId = (...ids) => {
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) return el;
      }
      return null;
    };

    const findByLabelPrefix = (prefix) => {
      const want = String(prefix || "").trim().toLowerCase();
      if (!want) return null;
      const labels = Array.from(document.querySelectorAll("label"));
      const lab = labels.find(l => (l.textContent || "").trim().toLowerCase().startsWith(want));
      if (!lab) return null;
      const forId = lab.getAttribute("for");
      if (forId) return document.getElementById(forId);
      return lab.querySelector("input,select,textarea") || lab.parentElement?.querySelector("input,select,textarea") || null;
    };

    const elTitle = byId("draftTitle","title") || findByLabelPrefix("Title");
    const elClass = byId("draftClass","className","class") || findByLabelPrefix("Class");
    const elRelease = byId("draftRelease","release") || findByLabelPrefix("Release");
    const elDue = byId("draftDue","due") || findByLabelPrefix("Due");
    const elLink = byId("draftLink","assignmentLink","link") || findByLabelPrefix("Assignment");
    const elNotes = byId("draftNotes","notes") || findByLabelPrefix("Notes");

    // Two file inputs exist in the UI: assignment + mapping
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const elAssignmentFile = byId("draftAssignmentFile","assignmentFile") || fileInputs[0] || null;
    const elMappingFile = byId("draftMappingFile","mappingFile") || fileInputs[1] || null;

    const findSaveButton = () => {
      const byText = Array.from(document.querySelectorAll("button")).find(b => (b.textContent || "").trim().toLowerCase() === "save draft");
      return byId("btnSaveDraft","saveDraft") || byText || null;
    };

    const saveBtn = findSaveButton();

    // --- Ensure class dropdown includes Life Skills ---
    const ensureClassOptions = () => {
      if (!elClass || elClass.tagName !== "SELECT") return;
      const seen = new Set(Array.from(elClass.options).map(o => (o.value || o.textContent || "").trim().toUpperCase()));
      for (const label of CLASS_LABELS) {
        if (!seen.has(label.toUpperCase())) {
          const opt = document.createElement("option");
          opt.value = label;
          opt.textContent = label;
          elClass.appendChild(opt);
        }
      }
    };
    ensureClassOptions();

    // --- Draft storage discovery ---
    const looksLikeDraftArray = (arr) => {
      if (!Array.isArray(arr) || !arr.length) return false;
      return arr.some(x => x && typeof x === "object" && (
        "title" in x || "class" in x || "className" in x || "draftClass" in x || "assignment" in x
      ));
    };

    const findDraftsKey = () => {
      const keys = Object.keys(localStorage);
      const candidates = [];
      for (const k of keys) {
        const v = localStorage.getItem(k);
        if (!v || v[0] !== "[") continue;
        let parsed = null;
        try { parsed = JSON.parse(v); } catch { continue; }
        if (!Array.isArray(parsed)) continue;
        // scoring: prefer keys with work/draft
        const score =
          (/(tc|teacher)/i.test(k) ? 2 : 0) +
          (/work/i.test(k) ? 3 : 0) +
          (/draft/i.test(k) ? 3 : 0) +
          (parsed.length ? 1 : 0);
        // heuristic: any object-y entries
        const ok = parsed.some(x => x && typeof x === "object" && ("title" in x || "class" in x || "className" in x || "assignment" in x));
        if (ok) candidates.push([score, k]);
      }
      candidates.sort((a,b) => b[0] - a[0]);
      return candidates[0]?.[1] || null;
    };

    const draftsKey = findDraftsKey();
    if (!draftsKey) log("No drafts key found in localStorage (yet). Will still enable UI QOL.");
    else log("Drafts key:", draftsKey);

    const readDrafts = () => {
      if (!draftsKey) return [];
      try {
        const v = localStorage.getItem(draftsKey) || "[]";
        const arr = JSON.parse(v);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };

    const writeDrafts = (arr) => {
      if (!draftsKey) return;
      localStorage.setItem(draftsKey, JSON.stringify(arr));
    };

    const getTextField = (d, kind) => {
      // kind: "assignment" or "mapping"
      const a = d?.[kind];
      if (typeof a === "string") return a;
      if (a && typeof a === "object") {
        if (typeof a.text === "string") return a.text;
        if (typeof a.content === "string") return a.content;
        if (typeof a.body === "string") return a.body;
      }
      const alt = d?.[kind + "Text"];
      if (typeof alt === "string") return alt;
      return "";
    };

    const setTextField = (d, kind, text) => {
      if (!d || typeof d !== "object") return;
      if (d[kind] && typeof d[kind] === "object") {
        if ("text" in d[kind]) d[kind].text = text;
        else d[kind].text = text;
        return;
      }
      if (typeof d[kind] === "string") { d[kind] = text; return; }
      if ((kind + "Text") in d) { d[kind + "Text"] = text; return; }
      d[kind] = { text };
    };

    // --- Mega detection + splitting ---
    const isSep = (line) => /^[=-]{8,}$/.test((line || "").trim());
    const normalizeLabel = (line) => CLASS_CANON[String(line || "").trim().toUpperCase()] || null;

    const splitMegaText = (text) => {
      const src = String(text || "").replace(/\r\n/g, "\n");
      const lines = src.split("\n");

      const blocks = [];
      let pre = [];
      let cur = null;

      let i = 0;
      while (i < lines.length) {
        const L = lines[i];
        const N = lines[i+1];
        const P = lines[i+2];

        // Pattern: SEP, LABEL, SEP  => start block at SEP
        const lab = normalizeLabel(N);
        if (isSep(L) && lab && isSep(P)) {
          if (cur) blocks.push(cur);
          cur = { label: lab, lines: [L, N, P] };
          i += 3;
          continue;
        }

        // Pattern: LABEL alone
        const lab2 = normalizeLabel(L);
        if (lab2) {
          if (cur) blocks.push(cur);
          cur = { label: lab2, lines: [L] };
          i += 1;
          continue;
        }

        if (!cur) pre.push(L);
        else cur.lines.push(L);

        i += 1;
      }
      if (cur) blocks.push(cur);

      const preamble = pre.join("\n").rstrip?.() ?? pre.join("\n"); // tolerate older engines
      const out = blocks.map(b => {
        const body = b.lines.join("\n").trim();
        const merged = (preamble && preamble.trim())
          ? (preamble.trimEnd() + "\n\n" + body + "\n")
          : (body + "\n");
        return { label: b.label, text: merged };
      }).filter(x => x.text.trim().length > 0);

      return out;
    };

    // --- Inject mega checkbox UI ---
    const megaPrefKey = "rc.tc.work.mega.enabled";
    const getMegaEnabled = () => (localStorage.getItem(megaPrefKey) || "") === "1";
    const setMegaEnabled = (v) => localStorage.setItem(megaPrefKey, v ? "1" : "0");

    const injectMegaToggle = () => {
      if (!elClass) return null;
      if (document.getElementById("rcMegaToggle")) return document.getElementById("rcMegaToggle");

      const wrap = document.createElement("div");
      wrap.id = "rcMegaToggle";
      wrap.style.marginTop = "8px";
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "10px";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "rcMegaEnabled";
      cb.checked = getMegaEnabled();

      const lab = document.createElement("label");
      lab.setAttribute("for", cb.id);
      lab.textContent = "Multi-class (mega TXT)";

      const help = document.createElement("div");
      help.style.opacity = "0.85";
      help.style.fontSize = "12px";
      help.textContent = "If your TXT contains multiple class sections, split into separate drafts on Save.";

      cb.addEventListener("change", () => setMegaEnabled(cb.checked));

      wrap.appendChild(cb);
      wrap.appendChild(lab);
      wrap.appendChild(help);

      // place it near the Class control
      const host = elClass.closest(".field") || elClass.parentElement || elClass;
      host.appendChild(wrap);

      return wrap;
    };

    injectMegaToggle();

    // --- Popup for “looks mega” when mega is OFF ---
    const showMegaPopup = () => {
      if (document.getElementById("rcMegaPopup")) return;

      const overlay = document.createElement("div");
      overlay.id = "rcMegaPopup";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.background = "rgba(0,0,0,0.6)";
      overlay.style.zIndex = "9999";
      overlay.style.display = "grid";
      overlay.style.placeItems = "center";

      const card = document.createElement("div");
      card.style.maxWidth = "720px";
      card.style.width = "min(720px, 92vw)";
      card.style.background = "#111";
      card.style.border = "1px solid rgba(255,255,255,0.12)";
      card.style.borderRadius = "14px";
      card.style.padding = "18px";
      card.style.boxShadow = "0 20px 70px rgba(0,0,0,0.55)";

      const h = document.createElement("div");
      h.style.fontSize = "16px";
      h.style.fontWeight = "700";
      h.textContent = "This TXT looks like it contains multiple classes.";

      const p = document.createElement("div");
      p.style.marginTop = "8px";
      p.style.opacity = "0.9";
      p.style.fontSize = "13px";
      p.textContent = "Choose what to do:";

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexWrap = "wrap";
      row.style.gap = "10px";
      row.style.marginTop = "14px";

      const mkBtn = (label) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.padding = "8px 12px";
        b.style.borderRadius = "10px";
        b.style.border = "1px solid rgba(255,255,255,0.14)";
        b.style.background = "rgba(255,255,255,0.06)";
        b.style.color = "#fff";
        b.style.cursor = "pointer";
        return b;
      };

      const bEnable = mkBtn("Enable multi-class split");
      const bSingle = mkBtn("Treat as single-class anyway");
      const bExit = mkBtn("Exit (clear file)");

      bEnable.addEventListener("click", () => {
        setMegaEnabled(true);
        const cb = document.getElementById("rcMegaEnabled");
        if (cb) cb.checked = true;
        overlay.remove();
      });

      bSingle.addEventListener("click", () => overlay.remove());

      bExit.addEventListener("click", () => {
        try { if (elAssignmentFile) elAssignmentFile.value = ""; } catch { /* noop */ }
        overlay.remove();
      });

      row.appendChild(bEnable);
      row.appendChild(bSingle);
      row.appendChild(bExit);

      card.appendChild(h);
      card.appendChild(p);
      card.appendChild(row);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    };

    // Read files so we can split later without touching base code
    let lastAssignmentText = "";
    let lastMappingText = "";

    const readFileAsText = (input, cb) => {
      try {
        const f = input?.files?.[0];
        if (!f) return cb("");
        const r = new FileReader();
        r.onload = () => cb(String(r.result || ""));
        r.onerror = () => cb("");
        r.readAsText(f);
      } catch {
        cb("");
      }
    };

    elAssignmentFile?.addEventListener("change", () => {
      readFileAsText(elAssignmentFile, (txt) => {
        lastAssignmentText = txt;
        const parts = splitMegaText(txt);
        if (parts.length >= 2 && !getMegaEnabled()) showMegaPopup();
      });
    });

    elMappingFile?.addEventListener("change", () => {
      readFileAsText(elMappingFile, (txt) => { lastMappingText = txt; });
    });

    // After a Save, if mega enabled and file looks mega, rewrite localStorage drafts:
    const megaLastProcessedKey = "rc.tc.work.mega.lastProcessed";
    const isProcessed = (id) => localStorage.getItem(megaLastProcessedKey) === String(id || "");
    const markProcessed = (id) => localStorage.setItem(megaLastProcessedKey, String(id || ""));

    const getDraftId = (d) => d?.id || d?.draftId || d?.createdAt || d?.created || (d?.title + "::" + (d?.class || d?.className || ""));
    const getDraftTime = (d) => {
      const t = d?.updatedAt || d?.createdAt || d?.created || d?.ts;
      const n = Number(t);
      return Number.isFinite(n) ? n : 0;
    };

    const splitLastDraftIfNeeded = () => {
      if (!draftsKey) return;
      if (!getMegaEnabled()) return;
      const parts = splitMegaText(lastAssignmentText);
      if (parts.length < 2) return;

      const drafts = readDrafts();
      if (!drafts.length) return;

      // pick most recent draft
      let idx = 0;
      for (let i = 1; i < drafts.length; i++) {
        if (getDraftTime(drafts[i]) >= getDraftTime(drafts[idx])) idx = i;
      }
      const base = drafts[idx];
      const baseId = getDraftId(base);
      if (isProcessed(baseId)) return;

      const baseTitle = base?.title || base?.draftTitle || "Draft";
      const baseRelease = base?.release || base?.draftRelease || "";
      const baseDue = base?.due || base?.draftDue || "";

      const clones = parts.map((part) => {
        const d = JSON.parse(JSON.stringify(base));
        // class fields
        if ("class" in d) d.class = part.label;
        if ("className" in d) d.className = part.label;
        if ("draftClass" in d) d.draftClass = part.label;

        // title fields
        if ("title" in d) d.title = `${baseTitle} — ${part.label}`;
        if ("draftTitle" in d) d.draftTitle = `${baseTitle} — ${part.label}`;

        // release/due keep as-is
        if ("release" in d) d.release = baseRelease;
        if ("due" in d) d.due = baseDue;

        // assignment/mapping
        setTextField(d, "assignment", part.text);
        if (lastMappingText && lastMappingText.trim()) setTextField(d, "mapping", lastMappingText);

        // new id/time so UI doesn't collapse them
        const now = Date.now() + Math.floor(Math.random() * 1000);
        d.id = `${now}-${part.label.replace(/\s+/g,"-")}`;
        d.createdAt = now;
        d.updatedAt = now;

        return d;
      });

      // Replace the base mega draft with the per-class drafts
      drafts.splice(idx, 1, ...clones);
      writeDrafts(drafts);
      markProcessed(baseId);
      log("Mega split applied:", clones.map(x => x.class || x.className || x.draftClass));

      // Reload so the built-in renderer re-renders cleanly
      location.reload();
    };

    // Hook Save Draft clicks (we let base save first, then split)
    saveBtn?.addEventListener("click", () => {
      // If user never re-selected file this session, try to read now
      if (elAssignmentFile?.files?.[0] && !lastAssignmentText) {
        readFileAsText(elAssignmentFile, (txt) => { lastAssignmentText = txt; });
      }
      if (elMappingFile?.files?.[0] && !lastMappingText) {
        readFileAsText(elMappingFile, (txt) => { lastMappingText = txt; });
      }
      setTimeout(splitLastDraftIfNeeded, 80);
    }, true);

    // --- Preview Close failsafe: delegate-close any modal "Close" button ---
    const closeAnyDialog = (btn) => {
      const dialog = btn.closest('[role="dialog"], .modal, .rc-modal, .dialog') || btn.closest("div");
      if (dialog) dialog.remove();
      const overlay = document.querySelector(".modal-overlay,.rc-overlay,.overlay");
      if (overlay) overlay.remove();
      document.body.classList.remove("modal-open");
    };

    document.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if ((b.textContent || "").trim().toLowerCase() === "close") {
        closeAnyDialog(b);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const btn = Array.from(document.querySelectorAll("button")).find(x => (x.textContent || "").trim().toLowerCase() === "close");
        if (btn) closeAnyDialog(btn);
      }
    });

    // --- Draft Edit: inject Edit button + update localStorage ---
    const editStateKey = "rc.tc.work.editing.id";

    const getEditingId = () => localStorage.getItem(editStateKey) || "";
    const setEditingId = (v) => localStorage.setItem(editStateKey, String(v || ""));
    const clearEditing = () => localStorage.removeItem(editStateKey);

    const ensureEditButtons = () => {
      const table = document.querySelector("table");
      if (!table) return;
      const body = table.querySelector("tbody");
      if (!body) return;
      const rows = Array.from(body.querySelectorAll("tr"));
      rows.forEach((row) => {
        const actionsCell = row.querySelector("td:last-child");
        if (!actionsCell) return;
        if (actionsCell.querySelector("button[data-rc-edit]")) return;

        const sampleBtn = actionsCell.querySelector("button");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Edit";
        btn.dataset.rcEdit = "1";
        if (sampleBtn && sampleBtn.className) btn.className = sampleBtn.className;
        actionsCell.prepend(btn);
      });
    };

    const matchDraftFromRow = (row, drafts) => {
      const t = (row.querySelector("td:nth-child(1)")?.textContent || "").trim();
      const c = (row.querySelector("td:nth-child(2)")?.textContent || "").trim();
      const source = (row.querySelector("td:nth-child(4)")?.textContent || "").trim();

      // Find best match: title+class (source as tie-breaker)
      let best = null;
      let bestScore = -1;
      drafts.forEach((d) => {
        const dt = (d.title || d.draftTitle || "").trim();
        const dc = (d.class || d.className || d.draftClass || "").trim();
        const ds = (d.source || d.assignment?.name || d.assignmentName || "").trim();
        let score = 0;
        if (dt && dt === t) score += 3;
        if (dc && dc === c) score += 3;
        if (source && ds && source.includes(ds)) score += 1;
        if (score > bestScore) { bestScore = score; best = d; }
      });
      return bestScore >= 3 ? best : null;
    };

    const injectEditBanner = (label) => {
      if (document.getElementById("rcEditBanner")) return;
      const host = elTitle?.closest(".card") || elTitle?.parentElement || document.body;
      const b = document.createElement("div");
      b.id = "rcEditBanner";
      b.style.margin = "8px 0 10px";
      b.style.padding = "10px 12px";
      b.style.border = "1px solid rgba(255,255,255,0.14)";
      b.style.borderRadius = "12px";
      b.style.background = "rgba(255,255,255,0.06)";
      b.style.display = "flex";
      b.style.alignItems = "center";
      b.style.justifyContent = "space-between";
      b.style.gap = "10px";

      const left = document.createElement("div");
      left.textContent = `Editing: ${label}`;

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";

      const mk = (txt) => {
        const x = document.createElement("button");
        x.type = "button";
        x.textContent = txt;
        x.style.padding = "6px 10px";
        x.style.borderRadius = "10px";
        x.style.border = "1px solid rgba(255,255,255,0.14)";
        x.style.background = "rgba(255,255,255,0.06)";
        x.style.color = "#fff";
        x.style.cursor = "pointer";
        return x;
      };

      const cancel = mk("Cancel Edit");
      cancel.addEventListener("click", () => { clearEditing(); location.reload(); });

      right.appendChild(cancel);
      b.appendChild(left);
      b.appendChild(right);

      host.prepend(b);
    };

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-rc-edit]");
      if (!btn) return;
      const row = btn.closest("tr");
      if (!row) return;

      const drafts = readDrafts();
      const d = matchDraftFromRow(row, drafts);
      if (!d) {
        log("Could not match row to draft for Edit.");
        return;
      }

      const id = getDraftId(d);
      setEditingId(id);

      // Populate editable fields
      const title = d.title || d.draftTitle || "";
      const cls = d.class || d.className || d.draftClass || "";
      const rel = d.release || d.draftRelease || "";
      const due = d.due || d.draftDue || "";
      const link = d.link || d.draftLink || "";
      const notes = d.notes || d.draftNotes || "";

      if (elTitle) elTitle.value = title.replace(/\s+—\s+.*$/, ""); // strip class suffix if present
      if (elClass && elClass.tagName === "SELECT") elClass.value = cls || elClass.value;
      if (elRelease) elRelease.value = rel;
      if (elDue) elDue.value = due;
      if (elLink) elLink.value = link;
      if (elNotes) elNotes.value = notes;

      injectEditBanner(title);
      const sb = findSaveButton();
      if (sb) sb.textContent = "Update Draft";
    });

    // Update instead of creating a new draft when editing
    saveBtn?.addEventListener("click", (e) => {
      const editingId = getEditingId();
      if (!editingId || !draftsKey) return;

      // We handle update; block base save to avoid duplicates
      e.preventDefault();
      e.stopPropagation();

      const drafts = readDrafts();
      const idx = drafts.findIndex(d => String(getDraftId(d)) === String(editingId));
      if (idx < 0) {
        clearEditing();
        location.reload();
        return;
      }

      const d = drafts[idx];
      const newTitle = (elTitle?.value || d.title || d.draftTitle || "").trim();
      const newClass = (elClass?.value || d.class || d.className || d.draftClass || "").trim();

      if ("title" in d) d.title = newTitle;
      if ("draftTitle" in d) d.draftTitle = newTitle;
      if ("class" in d) d.class = newClass;
      if ("className" in d) d.className = newClass;
      if ("draftClass" in d) d.draftClass = newClass;

      if (elRelease) { if ("release" in d) d.release = elRelease.value; if ("draftRelease" in d) d.draftRelease = elRelease.value; }
      if (elDue) { if ("due" in d) d.due = elDue.value; if ("draftDue" in d) d.draftDue = elDue.value; }
      if (elLink) { if ("link" in d) d.link = elLink.value; if ("draftLink" in d) d.draftLink = elLink.value; }
      if (elNotes) { if ("notes" in d) d.notes = elNotes.value; if ("draftNotes" in d) d.draftNotes = elNotes.value; }

      d.updatedAt = Date.now();
      writeDrafts(drafts);
      clearEditing();
      location.reload();
    }, true);

    // Keep Edit buttons present as drafts table rerenders
    setInterval(ensureEditButtons, 500);

  } catch (err) {
    console.error("[tc-work-qol] fatal:", err);
  }
})();
// END rc-tc-work-qol v1
