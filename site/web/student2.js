(function () {
  "use strict";

  const STORAGE_KEY = "rc_tc_work_drafts_v1";

  function $(id) { return document.getElementById(id); }

  function safeStr(x) {
    if (x === null || x === undefined) return "";
    return String(x);
  }

  function readDrafts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const v = JSON.parse(raw || "[]");
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  }

  function getParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (_) {
      return null;
    }
  }

  function renderTags(tags) {
    const wrap = $("tagSummary");
    if (!wrap) return;
    const dese = (tags && tags.dese) ? tags.dese : [];
    const iep = (tags && tags.iep) ? tags.iep : [];

    wrap.innerHTML = `
      <div class="pill">DESE: ${dese.length ? dese.join(", ") : "—"}</div>
      <div class="pill">IEP: ${iep.length ? iep.join(", ") : "—"}</div>
    `;
  }

  function setStatus(msg) {
    const el = $("status");
    if (el) el.textContent = msg;
  }

  function init() {
    const id = getParam("draft");
    const titleEl = $("draftTitle");
    const bodyEl = $("draftBody");

    if (!id) {
      setStatus("No draft selected. Add ?draft=<id> to the URL.");
      if (titleEl) titleEl.textContent = "Student Portal (New)";
      if (bodyEl) bodyEl.textContent = "";
      renderTags({ dese: [], iep: [] });
      return;
    }

    const drafts = readDrafts();
    const d = drafts.find((x) => safeStr(x.id) === safeStr(id));

    if (!d) {
      setStatus(`Draft not found in this browser (id=${id}). Create it in Teacher Center → Work first.`);
      if (titleEl) titleEl.textContent = "Draft not found";
      if (bodyEl) bodyEl.textContent = "";
      renderTags({ dese: [], iep: [] });
      return;
    }

    const t = safeStr(d.title) || "Untitled Draft";
    if (titleEl) titleEl.textContent = t;

    // Prefer precomputed fields; fallback to parsing raw
    let raw = safeStr(d.assignmentTextRaw || (d.native && d.native.textRaw) || "");
    let clean = safeStr(d.assignmentTextClean || (d.native && d.native.textClean) || "");
    let tags = (d.assignmentTags || (d.native && d.native.tags) || { dese: [], iep: [] });

    if (!clean && raw && window.rcParseAssignmentTags) {
      const parsed = window.rcParseAssignmentTags(raw);
      clean = parsed.cleanText;
      tags = parsed.tags;
    }

    renderTags(tags);
    setStatus(`Loaded draft ${id} from localStorage (${STORAGE_KEY}).`);

    if (bodyEl) {
      bodyEl.textContent = clean || raw || "(No native TXT content found in this draft yet.)";
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
