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

async function onSaveDraft(e, opts) { opts = opts || {}; if (arguments[0] && arguments[0].preventDefault) arguments[0].preventDefault();
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

    if (opts.assignmentTextRaw != null) assignmentTextRaw = String(opts.assignmentTextRaw);
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
        draft.assignment.name = (opts.assignmentFileName != null ? String(opts.assignmentFileName) : assignmentFile.name);
        draft.assignment.text = null;
      } else {
        draft.assignment.kind = "file";
        draft.assignment.name = (opts.assignmentFileName != null ? String(opts.assignmentFileName) : assignmentFile.name);
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
// --- Mega TXT helpers (normalize/split/slice) ---
globalThis.rcNormalizeClassLabel = function (v) {
  return String(v || "")
    .toUpperCase()
    .replace(/LANGUAGE\s+ARTS/g, "LA")
    .replace(/LIFE\s+SKILLS/g, "LIFE SKILLS")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

globalThis.rcSplitTeacherMegaText = function (text) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/);
  const isSectionLine = (line) => /^\s*(LANGUAGE\s+ARTS|LIFE\s+SKILLS)\b/i.test(line);

  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    if (isSectionLine(lines[i])) sections.push({ i, header: lines[i].trim() });
  }

  if (sections.length <= 1) {
    return [{ header: sections[0] ? sections[0].header : "Assignment", text: raw.trim() + "\n" }];
  }

  const out = [];
  for (let k = 0; k < sections.length; k++) {
    const start = sections[k].i;
    const end = (k + 1 < sections.length) ? sections[k + 1].i : lines.length;
    const sliced = lines.slice(start, end).join("\n").trim() + "\n";
    out.push({ header: sections[k].header, text: sliced });
  }
  return out;
};

globalThis.rcSliceTeacherMegaText = function (text, selectedClassName) {
  const parts = globalThis.rcSplitTeacherMegaText(text);
  if (!parts || !parts.length) {
    return { text: String(text || ""), sliced: false, sections: [], notice: "Empty text" };
  }
  if (parts.length === 1) {
    return {
      text: parts[0].text,
      sliced: false,
      header: parts[0].header,
      sections: [parts[0].header],
      notice: "Single-section file"
    };
  }

  const want = globalThis.rcNormalizeClassLabel(selectedClassName);
  let idx = -1;

  if (want) {
    idx = parts.findIndex((p) => globalThis.rcNormalizeClassLabel(p.header) === want);
    if (idx < 0) {
      idx = parts.findIndex((p) => {
        const h = globalThis.rcNormalizeClassLabel(p.header);
        return (h && h.indexOf(want) >= 0) || (want && want.indexOf(h) >= 0);
      });
    }
  }

  if (idx < 0) {
    return {
      text: parts[0].text,
      sliced: false,
      header: parts[0].header,
      sections: parts.map((p) => p.header),
      notice: "Multi-class file detected, but class did not match. Using first section: " + parts[0].header
    };
  }

  return {
    text: parts[idx].text,
    sliced: true,
    header: parts[idx].header,
    sections: parts.map((p) => p.header),
    notice: "Using section: " + parts[idx].header + " (from multi-class file)"
  };
};
// --- end Mega TXT helpers ---
function rcResolveClassValueFromHeader(header) {
  const sel = $("className");
  const want = globalThis.rcNormalizeClassLabel(header);
  if (!sel || !sel.options || !want) return safeStr(header).trim();

  for (const opt of sel.options) {
    const val = safeStr(opt.value).trim();
    const label = safeStr(opt.textContent || opt.label || opt.value).trim();
    if (!val) continue;

    const nVal = globalThis.rcNormalizeClassLabel(val);
    const nLab = globalThis.rcNormalizeClassLabel(label);

    if (want === nVal || want === nLab) return val;
    if (nLab && want.indexOf(nLab) >= 0) return val;
    if (nVal && want.indexOf(nVal) >= 0) return val;
  }

  // fallback: convert LANGUAGE ARTS -> LA for best-effort match
  return safeStr(header).replace(/^LANGUAGE\s+ARTS/i, "LA").replace(/\s+/g, " ").trim();
}

async function onSplitMega() {
  const assignmentFile = $("assignmentFile") && $("assignmentFile").files ? $("assignmentFile").files[0] : null;
  if (!assignmentFile) return setMsg("err", "Choose a TXT mega file first.");
  if (!rcIsTextFile(assignmentFile)) return setMsg("err", "Split Mega TXT works only for .txt files.");

  let raw = "";
  try { raw = await assignmentFile.text(); } catch (_) { raw = ""; }

  const parts = globalThis.rcSplitTeacherMegaText(raw);
  if (!parts || parts.length <= 1) return setMsg("warn", "No multiple sections found to split.");

  const baseTitle = safeStr($("title").value).trim() || assignmentFile.name.replace(/\.[^.]+$/, "");
  let created = 0;

  for (const part of parts) {
    const clsVal = rcResolveClassValueFromHeader(part.header);
    const t = baseTitle + " — " + clsVal;
    await onSaveDraft(null, {
      title: t,
      className: clsVal,
      assignmentTextRaw: part.text,
      assignmentFileName: assignmentFile.name
    });
    created += 1;
  }

  setMsg("ok", "Split into " + created + " draft(s) from mega file.");
}
// --- Mega TXT splitter (multi-class) ---
(function () {
  // Normalize a section header into a canonical class name used by the dropdown.
  function rcNormalizeClassFromHeader(header) {
    const h = String(header || "").trim();
    const up = h.toUpperCase();

    if (up.includes("LIFE SKILLS")) return "Life Skills LA";

    // Matches: "LANGUAGE ARTS 1", "LANGUAGE ARTS 1 SC", "LA 1", etc.
    let m = up.match(/(?:LANGUAGE\s+ARTS|LA)\s*([1-4])\b/);
    if (m) return "LA " + m[1] + " SC";

    // Matches already-canonical-ish strings
    m = up.match(/\bLA\s*([1-4])\s*SC\b/);
    if (m) return "LA " + m[1] + " SC";

    return h;
  }

  function rcGetMegaSections(text) {
    const lines = String(text || "").split(/\r?\n/);
    const heads = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(LANGUAGE\s+ARTS|LIFE\s+SKILLS)\b/i.test(lines[i])) {
        heads.push({ i, header: lines[i].trim() });
      }
    }
    if (!heads.length) return [];
    return heads.map((h, idx) => {
      const end = idx + 1 < heads.length ? heads[idx + 1].i : lines.length;
      const sliced = lines.slice(h.i, end).join("\n").trim() + "\n";
      return {
        header: h.header,
        className: rcNormalizeClassFromHeader(h.header),
        text: sliced,
      };
    });
  }

  function rcEnsureLifeSkillsOption() {
    // Try common ids used in this page
    const sel =
      (typeof $ === "function" && ($("className") || $("class") || $("classSelect"))) ||
      document.getElementById("className") ||
      document.getElementById("class") ||
      document.getElementById("classSelect");

    if (!sel || !sel.options) return;

    const want = "Life Skills LA";
    const has = Array.from(sel.options).some((o) => {
      const v = (o.value || "").toLowerCase();
      const t = (o.textContent || "").toLowerCase();
      return v === want.toLowerCase() || t.includes("life skills");
    });
    if (!has) {
      const opt = document.createElement("option");
      opt.value = want;
      opt.textContent = want;
      sel.appendChild(opt);
    }
  }

  function rcWorkLoadDrafts() {
    try {
      return JSON.parse(localStorage.getItem("rc_tc_work_drafts_v1") || "[]");
    } catch (_e) {
      return [];
    }
  }

  function rcWorkSaveDrafts(drafts) {
    localStorage.setItem("rc_tc_work_drafts_v1", JSON.stringify(drafts));
    if (typeof globalThis.renderDrafts === "function") globalThis.renderDrafts();
    if (typeof globalThis.renderWorkDrafts === "function") globalThis.renderWorkDrafts();
  }

  function rcWorkAddDraft(draft) {
    const drafts = rcWorkLoadDrafts();
    drafts.unshift(draft);
    rcWorkSaveDrafts(drafts);
  }

  function rcWorkNewId() {
    return "d_" + Math.random().toString(36).slice(2, 8) + "_" + Date.now().toString(36);
  }

  function rcVal(id, fallbackIds=[]) {
    const getById = (x) => (typeof $ === "function" ? $(x) : document.getElementById(x));
    const el = getById(id) || fallbackIds.map(getById).find(Boolean);
    return el ? (el.value || "").trim() : "";
  }

  async function rcSplitMegaCreateDrafts() {
    const getById = (x) => (typeof $ === "function" ? $(x) : document.getElementById(x));
    const setMsgSafe = (lvl, msg) => (typeof setMsg === "function" ? setMsg(lvl, msg) : console.log(lvl + ": " + msg));

    const af = getById("assignmentFile");
    const f = af && af.files && af.files[0];
    if (!f) return setMsgSafe("err", "Choose an assignment TXT first.");

    const raw = await f.text();
    const sections = rcGetMegaSections(raw);

    if (sections.length <= 1) {
      return setMsgSafe("warn", "This doesn’t look like a multi-class mega TXT (only one section found).");
    }

    // Two-click confirm (avoids window.confirm and accidental duplicates)
    const btn = getById("splitMegaBtn");
    if (btn && btn.dataset.confirming !== "1") {
      btn.dataset.confirming = "1";
      btn.dataset.megaCount = String(sections.length);
      const old = btn.textContent;
      btn.dataset.oldText = old;
      btn.textContent = "Confirm Split (" + sections.length + " drafts)";
      setMsgSafe("warn", "Click Split Mega TXT again to create " + sections.length + " drafts.");
      setTimeout(() => {
        if (btn.dataset.confirming === "1") {
          btn.dataset.confirming = "0";
          btn.textContent = btn.dataset.oldText || "Split Mega TXT";
        }
      }, 8000);
      return;
    }
    if (btn) {
      btn.dataset.confirming = "0";
      btn.textContent = btn.dataset.oldText || "Split Mega TXT";
    }

    const titleBase = rcVal("title", ["draftTitle"]) || "Untitled";
    const releaseAt = rcVal("releaseAt", ["release"]) || null;
    const dueAt = rcVal("dueAt", ["due"]) || null;
    const notes = rcVal("notes", ["draftNotes"]) || "";

    let created = 0;
    let warnings = 0;

    for (const sec of sections) {
      const assignmentText = sec.text;
      const snippet = assignmentText.slice(0, 3500);

      let mappingText = null;
      if (typeof autoMapFromTeacherTxt === "function") {
        const res = autoMapFromTeacherTxt(assignmentText);
        mappingText = res && res.mappingText ? res.mappingText : null;
        if (res && res.counts && res.counts.warnings) warnings += res.counts.warnings;
      }

      const draft = {
        id: rcWorkNewId(),
        title: titleBase + " — " + sec.className,
        className: sec.className,
        releaseAt,
        dueAt,
        createdAt: new Date().toISOString(),
        notes,
        assignment: {
          kind: "file",
          name: f.name,
          link: null,
          snippet,
          text: assignmentText,
        },
        mapping: mappingText
          ? { kind: "auto", name: "auto-mapping.json", text: mappingText }
          : { kind: "none", name: null, text: null },
      };

      rcWorkAddDraft(draft);
      created += 1;
    }

    setMsgSafe(warnings ? "warn" : "ok", "Split mega TXT into " + created + " draft(s)" + (warnings ? " (" + warnings + " missing-code warning(s))" : ""));
  }

  function rcWireSplitMega() {
    rcEnsureLifeSkillsOption();

    const getById = (x) => (typeof $ === "function" ? $(x) : document.getElementById(x));
    const btn = getById("splitMegaBtn");
    if (!btn || btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";

    // Hide until a mega file is detected
    btn.style.display = "none";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      rcSplitMegaCreateDrafts();
    });

    const af = getById("assignmentFile");
    if (af && af.dataset.megaDetect !== "1") {
      af.dataset.megaDetect = "1";
      af.addEventListener("change", async () => {
        try {
          const f = af.files && af.files[0];
          if (!f) { btn.style.display = "none"; return; }
          const raw = await f.text();
          const n = rcGetMegaSections(raw).length;
          btn.style.display = n > 1 ? "" : "none";
        } catch (_e) {
          btn.style.display = "none";
        }
      });
    }
  }

  // Run after existing init
  setTimeout(rcWireSplitMega, 0);
})();
// --- end Mega TXT splitter ---






$("workDraftForm").addEventListener("submit", onSaveDraft);
// Auto-toggle Split Mega button (show only when TXT contains multiple sections)
(() => {
  const af = $("assignmentFile");
  const sb = $("btnSplitMega");
  if (!af || !sb) return;

  const toggle = async () => {
    try {
      const f = af.files && af.files[0];
      if (!f || !rcIsTextFile(f)) { sb.style.display = "none"; return; }
      const t = await f.text();
      const parts = globalThis.rcSplitTeacherMegaText(t);
      sb.style.display = (parts && parts.length > 1) ? "" : "none";
    } catch (_) {
      sb.style.display = "none";
    }
  };

  af.addEventListener("change", toggle);
  sb.addEventListener("click", onSplitMega);
  toggle();
})();
// Auto-toggle Split Mega (end)


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


// RC_MEGA_TXT_V2_BLOCK
(() => {
  "use strict";

  const DRAFTS_KEY = "rc_tc_work_drafts_v1";
  const WIRE_FLAG = "rcMegaV2Wired";

  // -------- Fuzzy class normalization --------
  const CLASS_CATALOG = [
    "LA 1 SC",
    "LA 2 SC",
    "LA 3 SC",
    "LA 4 SC",
    "Life Skills",
    "Life Skills LA",
  ];

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .replace(/lifeskillsla/g, "life skills la")
      .replace(/life\s*skills\s*la/g, "life skills la")
      .replace(/lifeskills/g, "life skills")
      .replace(/english\s+language\s+arts/g, "ela")
      .replace(/language\s+arts/g, "la")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function classNameFromAnyText(s) {
    const t = norm(s);

    // Distinguish Life Skills vs Life Skills LA
    if (t.includes("life skills")) {
      const isLA = /\b(la|ela)\b/.test(t) || t.includes("language arts");
      return isLA ? "Life Skills LA" : "Life Skills";
    }

    // LA 1-4 SC (accept: "LA1", "LA 1", "ELA 1", "Language Arts 1", with/without SC)
    const m = t.match(/\b(?:la|ela)\s*([1-4])\b/);
    if (m) return `LA ${m[1]} SC`;

    return null;
  }

  function extractMegaSections(text) {
    const lines = (text || "").split(/\r?\n/);
    const headers = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = (lines[i] || "").trim();
      if (!raw) continue;
      const cn = classNameFromAnyText(raw);
      if (!cn) continue;
      headers.push({ i, className: cn, raw });
    }

    const distinct = Array.from(new Set(headers.map(h => h.className)));
    if (distinct.length < 2) return null;

    const segs = [];
    for (let k = 0; k < headers.length; k++) {
      const start = headers[k].i;
      const end = (k + 1 < headers.length) ? headers[k + 1].i : lines.length;
      const chunk = lines.slice(start, end).join("\n").trim();
      if (chunk) segs.push({ className: headers[k].className, chunk });
    }

    const byClass = new Map();
    for (const s of segs) {
      const cur = byClass.get(s.className) || [];
      cur.push(s.chunk);
      byClass.set(s.className, cur);
    }

    return Array.from(byClass.entries()).map(([className, chunks]) => ({
      className,
      text: chunks.join("\n\n").trim() + "\n",
    }));
  }

  // -------- LocalStorage draft list helpers (tolerant to schema shape) --------
  function readDraftList() {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) return { container: null, list: [] };
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return { container: null, list: v };
      if (v && Array.isArray(v.drafts)) return { container: v, list: v.drafts };
      if (v && Array.isArray(v.items)) return { container: v, list: v.items };
    } catch (_) { /* ignore */ }
    return { container: null, list: [] };
  }

  function writeDraftList(container, list) {
    if (container && typeof container === "object") {
      if (Array.isArray(container.drafts)) container.drafts = list;
      else if (Array.isArray(container.items)) container.items = list;
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(container));
      return;
    }
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
  }

  function uid() {
    return "d_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  }

  function ensureClassOptions() {
    const sel = document.getElementById("className");
    if (!sel) return;
    const existing = new Set(Array.from(sel.options || []).map(o => o.value));
    for (const v of CLASS_CATALOG) {
      if (!existing.has(v)) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
      }
    }
  }

  function getFormBits() {
    const form = document.getElementById("workDraftForm") || document.querySelector("form");
    const sel = document.getElementById("className");
    const classVal = (sel && sel.value ? sel.value : "").trim();

    const titleEl = document.getElementById("title") || (form ? form.querySelector('input[type="text"]') : null);
    const title = (titleEl && titleEl.value ? titleEl.value : "").trim();

    const notesEl = document.getElementById("notes") || (form ? form.querySelector("textarea") : null);
    const notes = (notesEl && notesEl.value ? notesEl.value : "").trim();

    const releaseEl = document.getElementById("releaseAt") || document.getElementById("release") || null;
    const dueEl     = document.getElementById("dueAt") || document.getElementById("due") || null;

    const fileInputs = form ? Array.from(form.querySelectorAll('input[type="file"]')) : Array.from(document.querySelectorAll('input[type="file"]'));
    const assignmentFileInput = document.getElementById("assignmentFile") || fileInputs[0] || null;

    return {
      form,
      classVal,
      title,
      notes,
      releaseAt: releaseEl && releaseEl.value ? releaseEl.value : null,
      dueAt: dueEl && dueEl.value ? dueEl.value : null,
      assignmentFile: assignmentFileInput && assignmentFileInput.files && assignmentFileInput.files[0] ? assignmentFileInput.files[0] : null,
    };
  }

  async function splitMegaToDraftsFromCurrentForm() {
    const bits = getFormBits();
    if (!bits.assignmentFile) {
      alert("Pick an assignment TXT file first.");
      return false;
    }

    const raw = await bits.assignmentFile.text();
    const mega = extractMegaSections(raw);
    if (!mega) {
      alert("This doesn’t look like a multi-class mega TXT (couldn’t find 2+ class headers).");
      return false;
    }

    const baseTitle = bits.title || bits.assignmentFile.name.replace(/\.[^.]+$/, "");
    const { container, list } = readDraftList();

    const now = new Date().toISOString();
    for (const sec of mega) {
      const d = {
        id: uid(),
        title: `${baseTitle} — ${sec.className}`,
        className: sec.className,
        releaseAt: bits.releaseAt || null,
        dueAt: bits.dueAt || null,
        createdAt: now,
        notes: bits.notes || "",
        assignment: {
          kind: "file",
          name: bits.assignmentFile.name,
          link: null,
          snippet: sec.text,
        },
        mapping: null,
      };
      list.unshift(d);
    }

    writeDraftList(container, list);
    location.reload();
    return true;
  }

  function wireSplitMega() {
    ensureClassOptions();

    const btn = document.getElementById("btnSplitMega");
    if (btn && !btn.dataset[WIRE_FLAG]) {
      btn.dataset[WIRE_FLAG] = "1";
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        await splitMegaToDraftsFromCurrentForm();
      }, true);
    }

    const form = document.getElementById("workDraftForm");
    if (form && !form.dataset[WIRE_FLAG]) {
      form.dataset[WIRE_FLAG] = "1";
      form.addEventListener("submit", async (ev) => {
        const bits = getFormBits();
        if (bits.classVal) return;

        ev.preventDefault();
        ev.stopImmediatePropagation();

        if (!bits.assignmentFile) {
          alert("Choose a class OR upload a mega TXT to auto-split.");
          return;
        }

        const raw = await bits.assignmentFile.text();
        const mega = extractMegaSections(raw);
        if (!mega) {
          alert("Choose a class (single-class save) OR use a multi-class mega TXT (2+ class headers) to auto-split.");
          return;
        }

        await splitMegaToDraftsFromCurrentForm();
      }, true);
    }
  }

  window.addEventListener("DOMContentLoaded", wireSplitMega);
})();
// end RC_MEGA_TXT_V2_BLOCK
