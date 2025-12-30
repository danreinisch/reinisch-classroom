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

    const payload = {
      id: d.id,
      title: d.title,
      className: d.className,
      releaseAt: d.releaseAt,
      dueAt: d.dueAt,
      createdAt: d.createdAt,
      notes: d.notes || "",
      assignment: {
        kind: d.assignment ? d.assignment.kind : null,
        name: d.assignment ? d.assignment.name : null,
        link: d.assignment ? d.assignment.link : null,
        snippet: assignmentSnippet || "(no stored assignment text — link or file too large?)",
      },
      mapping: {
        name: d.mapping ? d.mapping.name : null,
        kind: d.mapping ? d.mapping.kind : null,
        snippet: mappingSnippet || "(no mapping text stored?)",
      },
    };

    body.textContent = JSON.stringify(payload, null, 2);
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

    let assignmentTextRaw = "";

    if (assignmentFile && rcIsTextFile(assignmentFile)) {

      try { assignmentTextRaw = await assignmentFile.text();

      const selectedClassName = safeStr(
        (typeof className !== "undefined" ? className : "") ||
        ($("className") && $("className").value) ||
        ""
      ).trim();
      const sliceInfoRaw = globalThis.rcSliceTeacherMegaText(assignmentTextRaw, selectedClassName);
      if (sliceInfoRaw && sliceInfoRaw.text) assignmentTextRaw = sliceInfoRaw.text;
      if (sliceInfoRaw && sliceInfoRaw.notice) setMsg(sliceInfoRaw.sliced ? "ok" : "warn", sliceInfoRaw.notice);
 } catch (_) { /* noop */ }

    }

    const assignmentLink = safeStr($("assignmentLink").value).trim();
    const mappingFile = $("mappingFile").files && $("mappingFile").files[0];

    if (!title) return setMsg("err", "Title is required.");
    if (!className) return setMsg("err", "Class is required.");
// Mapping file optional: we will auto-generate mapping from assignment tags if missing.
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
  if (!mappingText) return setMsg("err", "Could not read mapping file.");
  if (mappingText.length > 50000) {
    return setMsg("err", "Mapping file is too large for MVP local storage. Keep it smaller for now.");
  }
} else {
  // Auto-map from the teacher TXT tags ([MLS.*] and [IG:*]) when available
  const src = (typeof assignmentTextRaw === "string" && assignmentTextRaw.trim())
    ? assignmentTextRaw
    : "";
  const autoMapping = autoMapFromTeacherTxt(src);
  mappingText = JSON.stringify(autoMapping, null, 2);

  const w = (autoMapping && autoMapping.counts) ? (autoMapping.counts.warnings || 0) : 0;
  const n = (autoMapping && autoMapping.counts) ? (autoMapping.counts.items || 0) : 0;
  setMsg(w ? "warn" : "ok", "Auto-mapped " + n + " item(s) from tags" + (w ? " (" + w + " missing-code warning(s))" : ""));
}

draft.mapping.text = mappingText;

    // Assignment: prefer link; file stored only if small
    if (assignmentLink) {
      draft.assignment.kind = "link";
      draft.assignment.link = assignmentLink;
    } else if (assignmentFile) {
      let assignmentText = assignmentTextRaw || await readFileAsText(assignmentFile);
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
    if (assignmentTextRaw && !draft.assignmentTextRaw) draft.assignmentTextRaw = assignmentTextRaw;
    if (assignmentTextRaw && window.rcParseAssignmentTags) {
      const parsed = window.rcParseAssignmentTags(assignmentTextRaw);
      if (!draft.assignmentTextClean) draft.assignmentTextClean = parsed.cleanText;
      if (!draft.assignmentTags) draft.assignmentTags = parsed.tags;
      if (!draft.native) draft.native = { type: "txt", textRaw: assignmentTextRaw, textClean: parsed.cleanText, tags: parsed.tags };
    }
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

    
    // Mapping file name display
    const mf = $("mappingFile");
    const mfn = $("mappingFileName");
    if (mf && mfn) {
      const mupd = () => {
        const f = mf.files && mf.files[0];
        mfn.textContent = f ? ("Selected: " + f.name) : "No file selected";
      };
      mf.addEventListener("change", mupd);
      mupd();
    }
// --- Mega TXT slicer (multi-class files) ---
globalThis.rcSliceTeacherMegaText = function (txt, className) {
  const safe = (x) => (x == null ? "" : String(x));
  const raw = safe(txt);

  function normalizeKey(v) {
    return safe(v).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  }

  function classToSectionKey(name) {
    const cn = normalizeKey(name);
    let m = cn.match(/^LA\s*(\d+)\s*SC$/);
    if (m) return normalizeKey("LANGUAGE ARTS " + m[1] + " SC");
    m = cn.match(/^LANGUAGE\s*ARTS\s*(\d+)\s*SC$/);
    if (m) return normalizeKey("LANGUAGE ARTS " + m[1] + " SC");
    if (cn.startsWith("LIFE SKILLS")) return normalizeKey("LIFE SKILLS");
    return cn;
  }

  function isSectionHeader(line) {
    return /^\s*(LANGUAGE\s+ARTS|LIFE\s+SKILLS)\b/i.test(line || "");
  }

  function cleanHeader(line) {
    return safe(line).replace(/\s*[=._-]{3,}\s*$/, "").trim();
  }

  const lines = raw.split(/\r?\n/);
  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    if (isSectionHeader(lines[i])) {
      const header = cleanHeader(lines[i]);
      sections.push({ i, header, key: normalizeKey(header) });
    }
  }

  if (sections.length <= 1) {
    return { text: raw, sliced: false, sections: sections.map((x) => x.header) };
  }

  const want = classToSectionKey(className);
  if (!want) {
    return {
      text: raw,
      sliced: false,
      sections: sections.map((x) => x.header),
      notice:
        "Multi-class file detected (" +
        sections.map((x) => x.header).join(" | ") +
        "). Select a Class to auto-slice."
    };
  }

  let idx = sections.findIndex((x) => x.key === want || x.key.startsWith(want) || want.startsWith(x.key));
  if (idx < 0 && /^LANGUAGE ARTS/.test(want)) {
    const base = want.replace(/\s*SC$/, "").trim();
    idx = sections.findIndex((x) => x.key.startsWith(base));
  }

  if (idx < 0) {
    return {
      text: raw,
      sliced: false,
      sections: sections.map((x) => x.header),
      notice:
        'Could not match class "' +
        className +
        '" to any section header. Detected: ' +
        sections.map((x) => x.header).join(" | ")
    };
  }

  const start = sections[idx].i;
  const end = idx + 1 < sections.length ? sections[idx + 1].i : lines.length;
  const sliced = lines.slice(start, end).join("\n").trim() + "\n";

  return {
    text: sliced,
    sliced: true,
    header: sections[idx].header,
    sections: sections.map((x) => x.header),
    notice: "Using section: " + sections[idx].header + " (from multi-class file)"
  };
};
// --- end mega TXT slicer ---


$("workDraftForm").addEventListener("submit", onSaveDraft);
    const af = $("assignmentFile");
    const afn = $("assignmentFileName");
    if (af && afn) {
      const upd = () => {
        const f = af.files && af.files[0];
        afn.textContent = f ? ("Selected: " + f.name) : "No file selected";
      };
      af.addEventListener("change", upd);
      upd();
    }

    $("btnExportAll").addEventListener("click", exportAll);
    $("btnClearAll").addEventListener("click", clearAll);
// btnFillExample removed (use draft row Preview/Export)

    wireModal();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
