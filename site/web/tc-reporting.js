(function () {
  const KEY_CANDIDATES = ["rc_tc_work_drafts","rc_tc_drafts","tc_work_drafts","teacher_center_work_drafts"];

  function $(id){ return document.getElementById(id); }

  function safeParseJSON(s){
    try { return JSON.parse(s); } catch (_) { return null; }
  }

  function isDraftArray(x){
    if (!Array.isArray(x)) return false;
    if (x.length === 0) return true;
    const d = x[0];
    return d && typeof d === "object" && ("id" in d || "title" in d) && ("mapping" in d || "assignment" in d);
  }

  function detectDraftsFromLocalStorage(){
    for (const k of KEY_CANDIDATES){
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const v = safeParseJSON(raw);
      if (isDraftArray(v)) return { key: k, drafts: v };
    }

    const hits = [];
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (!k) continue;
      const raw = localStorage.getItem(k);
      if (!raw || raw.length < 2) continue;
      if (raw[0] !== "[" && raw[0] !== "{") continue;

      const v = safeParseJSON(raw);
      if (isDraftArray(v)) hits.push({ key: k, drafts: v });
    }

    hits.sort((a,b) => (b.drafts?.length || 0) - (a.drafts?.length || 0));
    return hits[0] || { key: null, drafts: [] };
  }

  function fmtDate(ts){
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  }

  function inferCreatedAt(d){
    return d.createdAt || d.created_at || d.ts || d.timestamp || null;
  }

  function inferAssignmentType(d){
    const a = d.assignment || d.assignmentFile || d.assignmentLink || null;
    if (!a) return "unknown";
    if (typeof a === "string"){
      if (/^https?:\/\//i.test(a)) return "link";
      return "file";
    }
    if (typeof a === "object"){
      if (a.url || a.link) return "link";
      if (a.name || a.fileName || a.file) return "file";
      if (a.type) return String(a.type);
    }
    return "unknown";
  }

  function hasMapping(d){
    const m = d.mapping || d.mappingFile || null;
    if (!m) return false;
    if (typeof m === "string") return m.trim().length > 0;
    if (typeof m === "object") return !!(m.name || m.fileName || m.file || m.url || m.link);
    return true;
  }

  function summarize(drafts){
    const total = drafts.length;
    const withMapping = drafts.filter(hasMapping).length;

    let link = 0, file = 0, unknown = 0;
    let newest = null;

    for (const d of drafts){
      const t = inferAssignmentType(d);
      if (t === "link") link++;
      else if (t === "file") file++;
      else unknown++;

      const ts = inferCreatedAt(d);
      if (ts){
        const dt = new Date(ts).getTime();
        if (!Number.isNaN(dt)){
          if (newest === null || dt > newest) newest = dt;
        }
      }
    }

    return {
      total,
      withMapping,
      typeMix: total === 0 ? "—" : `${link} link / ${file} file`,
      newest: newest ? fmtDate(newest) : "—",
      link, file, unknown
    };
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function renderTable(drafts){
    const body = $("draftsBody");
    if (!body) return;

    const rows = (drafts || [])
      .slice()
      .sort((a,b) => new Date(inferCreatedAt(b) || 0).getTime() - new Date(inferCreatedAt(a) || 0).getTime())
      .slice(0, 20);

    if (rows.length === 0){
      body.innerHTML = '<tr><td colspan="5" class="tc-subtle">No drafts found yet. Create one in <a href="/teacher/work/">Work</a>.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((d) => {
      const title = (d.title || "Untitled").toString();
      const id = (d.id || "—").toString();
      const created = fmtDate(inferCreatedAt(d));
      const atype = inferAssignmentType(d);
      const mapping = hasMapping(d) ? "yes" : "no";
      return `
        <tr>
          <td>${escapeHtml(title)}</td>
          <td>${escapeHtml(atype)}</td>
          <td>${escapeHtml(mapping)}</td>
          <td>${escapeHtml(created)}</td>
          <td class="tc-mono">${escapeHtml(id)}</td>
        </tr>
      `;
    }).join("");
  }

  function download(filename, text){
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function refresh(){
    const found = detectDraftsFromLocalStorage();
    const key = found.key || "none";
    const drafts = Array.isArray(found.drafts) ? found.drafts : [];
    const s = summarize(drafts);

    const pillSource = $("pillSource");
    if (pillSource) pillSource.textContent = `drafts: ${drafts.length} (key: ${key})`;

    if ($("kpiDrafts")) $("kpiDrafts").textContent = String(s.total);
    if ($("kpiWithMapping")) $("kpiWithMapping").textContent = String(s.withMapping);
    if ($("kpiTypeMix")) $("kpiTypeMix").textContent = s.typeMix;
    if ($("kpiRecent")) $("kpiRecent").textContent = s.newest;

    renderTable(drafts);

    const btnExport = $("btnExport");
    if (btnExport){
      btnExport.onclick = () => {
        const payload = { generatedAt: new Date().toISOString(), sourceKey: key, summary: s, drafts };
        download(`tc-reporting_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2));
      };
    }
  }

  function init(){
    const btnRefresh = $("btnRefresh");
    if (btnRefresh) btnRefresh.addEventListener("click", refresh);
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
