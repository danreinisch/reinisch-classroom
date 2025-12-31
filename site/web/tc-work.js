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
      btnPreview.addEventListener("click", () => openPreview(d.id));
      tdActions.appendChild(btnPreview);

      const btnExport = document.createElement("button");
      btnExport.type = "button";
      btnExport.className = "work-btn";
      btnExport.style.marginLeft = "8px";
      btnExport.textContent = "Export";
      btnExport.addEventListener("click", () => exportOne(d.id));
      tdActions.appendChild(btnExport);

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "work-btn danger";
      btnDel.style.marginLeft = "8px";
      btnDel.textContent = "Delete";
      btnDel.addEventListener("click", () => deleteOne(d.id));
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

    const mappingSnippet = (safeStr(d.mapping && d.mapping.text) || "")
      .split("\n")
      .slice(0, 60)
      .join("\n");

    const assignmentSnippet = (safeStr(d.assignment && d.assignment.text) || "")
      .split("\n")
      .slice(0, 80)
      .join("\n");
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

    closeBtn.addEventListener("click", closePreview);
    dlBtn.addEventListener("click", () => {
      if (previewingId) exportOne(previewingId);
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePreview();
    });

    document.addEventListener("keydown", (e) => {
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();


// BEGIN rc-work-mega-ux v1
(() => {
  if (window.__rcWorkMegaUxV1) return;
  window.__rcWorkMegaUxV1 = true;

  const DRAFT_KEY = "rc_tc_work_drafts_v1";

  const CANON_CLASSES = [
    "LA 1 SC",
    "LA 2 SC",
    "LA 3 SC",
    "LA 4 SC",
    "Life Skills",
    "Life Skills LA",
  ];

  const LA_TOKENS = /\b(la|ela)\b|english\s+language\s+arts|language\s+arts/i;

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

  function ensureClassDropdown() {
    const sel = document.getElementById("className");
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
    const sel = document.getElementById("className");
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

    cb.addEventListener("change", sync);
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

  function looksMega(text) {
    return parseMegaSections(text).length >= 2;
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

  async function splitMegaFromCurrentForm() {
    const form = document.getElementById("workDraftForm");
    if (!form) return;

    const titleEl = getFormEl("title", 'input[name="title"]');
    const classSel = getFormEl("className", 'select[name="className"]');
    const releaseEl = getFormEl("releaseAt", 'input[name="releaseAt"]');
    const dueEl = getFormEl("dueAt", 'input[name="dueAt"]');
    const notesEl = getFormEl("notes", 'textarea[name="notes"]');

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

    let mappingSnippet = "(no mapping text stored?)";
    if (mFile) {
      try {
        const mt = await readFileText(mFile);
        mappingSnippet = mt.length > 20000 ? (mt.slice(0, 20000) + "\n…(truncated)\n") : mt;
      } catch (e) {
        console.warn("Mapping read failed:", e);
      }
    }

    const drafts = loadDrafts();

    for (const sec of sections) {
      const cls = sec.cls;

      // Keep snippet bounded (localStorage limits). Enough now; student-view preview comes next PR.
      const chunk = `${cls}\n===\n${sec.body}\n`;
      const ensureBound = (t) => (t.length > 20000 ? (t.slice(0, 20000) + "\n…(truncated)\n") : t);

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
          snippet: ensureBound(chunk),
        },
        mapping: {
          name: mFile ? mFile.name : null,
          kind: mFile ? "file" : null,
          link: null,
          snippet: mappingSnippet,
        },
      });
    }

    saveDrafts(drafts);

    // Reset single-class selection to avoid confusion post-split
    const cb = document.getElementById("rcMegaMode");
    if (cb && classSel) {
      classSel.value = "";
      classSel.disabled = true;
    }

    alert(`Created ${sections.length} drafts (one per class).`);
    location.reload();
  }

  function wire() {
    const form = document.getElementById("workDraftForm");
    const btn = document.getElementById("btnSplitMega");

    ensureClassDropdown();
    ensureMegaCheckbox();

    const classSel = document.getElementById("className");
    const cb = document.getElementById("rcMegaMode");

    // Auto-detect mega files and flip on mega mode
    if (form) {
      const { assignment: aIn } = pickFileInputs(form);
      if (aIn) {
        aIn.addEventListener("change", async () => {
          try {
            const f = aIn.files && aIn.files[0] ? aIn.files[0] : null;
            if (!f || !cb || !classSel) return;
            const txt = await readFileText(f);
            if (looksMega(txt)) {
              cb.checked = true;
              classSel.value = "";
              classSel.disabled = true;
            }
          } catch (e) {
            console.warn("Mega auto-detect failed:", e);
          }
        });
      }
    }

    // Replace Split Mega behavior (capture so we win even if older listeners exist)
    if (btn) {
      try { btn.type = "button"; } catch (e) { /* ignore */ }
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        splitMegaFromCurrentForm().catch(err => console.warn(err));
      }, true);
    }

    // If mega mode is checked, Save Draft should auto-split instead of requiring a class
    if (form) {
      form.addEventListener("submit", (e) => {
        const isMega = !!(cb && cb.checked);
        if (!isMega) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        splitMegaFromCurrentForm().catch(err => console.warn(err));
      }, true);
    }
  }

  window.addEventListener("DOMContentLoaded", wire);
})();
// END rc-work-mega-ux v1
