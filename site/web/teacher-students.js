(() => {
  "use strict";
  const $ = (sel, root=document) => root.querySelector(sel);

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#39;");
  }
  const fmtName = (s) => `${s.last ?? ""}, ${s.first ?? ""}`.replace(/^,\s*/,"").trim();

  async function loadStudents(){
    const res = await fetch("/web/data/students.sample.json", { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Failed to load students (${res.status})`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Students JSON must be an array");
    return data;
  }

  function render(app, state){
    const q = state.query.trim().toLowerCase();
    const filtered = state.students.filter(s => {
      const hay = `${s.id} ${s.first} ${s.last} ${s.grade}`.toLowerCase();
      return hay.includes(q);
    });

    const selected = state.selectedId ? state.students.find(s => s.id === state.selectedId) : null;

    app.innerHTML = `
      <div class="tc-students">
        <div class="tc-students__left tc-card">
          <div class="tc-students__toolbar">
            <div class="tc-field">
              <label class="tc-field__label" for="stuSearch">Search</label>
              <input id="stuSearch" class="tc-input" type="search" placeholder="Name, ID, grade…" value="${escapeHtml(state.query)}" />
            </div>
            <div class="tc-muted tc-students__count">${filtered.length} student(s)</div>
          </div>

          <div class="tc-table-wrap">
            <table class="tc-table" aria-label="Students">
              <thead>
                <tr>
                  <th style="width: 90px;">ID</th>
                  <th>Name</th>
                  <th style="width: 80px;">Grade</th>
                  <th style="width: 140px;">IEP Due</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(s => {
                  const due = s.iepDue ? escapeHtml(s.iepDue) : "—";
                  const cls = (s.id === state.selectedId) ? "tc-row--active" : "";
                  return `
                    <tr class="${cls}" data-id="${escapeHtml(s.id)}">
                      <td>${escapeHtml(s.id)}</td>
                      <td>${escapeHtml(fmtName(s) || "—")}</td>
                      <td>${escapeHtml(s.grade)}</td>
                      <td>${due}</td>
                    </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="tc-students__right tc-card">
          ${selected ? `
            <div class="tc-students__detail">
              <div class="tc-kicker">Selected Student</div>
              <h2 class="tc-h2">${escapeHtml(fmtName(selected))}</h2>
              <div class="tc-detail-grid">
                <div><div class="tc-label-sm">Student ID</div><div class="tc-value">${escapeHtml(selected.id)}</div></div>
                <div><div class="tc-label-sm">Grade</div><div class="tc-value">${escapeHtml(selected.grade)}</div></div>
                <div><div class="tc-label-sm">Case Manager</div><div class="tc-value">${escapeHtml(selected.caseManager || "—")}</div></div>
                <div><div class="tc-label-sm">IEP Due</div><div class="tc-value">${escapeHtml(selected.iepDue || "—")}</div></div>
              </div>
              <div class="tc-divider"></div>
              <div class="tc-muted">Coming next: goals snapshot, class enrollments, last progress update.</div>
            </div>
          ` : `
            <div class="tc-empty">
              <div class="tc-kicker">Students</div>
              <h2 class="tc-h2">Pick a student</h2>
              <div class="tc-muted">Select a row to view details.</div>
            </div>
          `}
        </div>
      </div>
    `;

    const inp = $("#stuSearch", app);
    inp?.addEventListener("input", () => { state.query = inp.value || ""; render(app, state); });

    app.querySelectorAll("tbody tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => { state.selectedId = tr.getAttribute("data-id"); render(app, state); });
    });
  }

  async function boot(){
    const app = document.getElementById("students-app");
    if (!app) return;
    const state = { students: [], query: "", selectedId: null };

    try {
      state.students = await loadStudents();
      state.students.sort((a,b) => (a.last||"").localeCompare(b.last||"") || (a.first||"").localeCompare(b.first||""));
      render(app, state);
    } catch (e){
      app.innerHTML = `<div class="tc-card"><h2 class="tc-h2">Students failed to load</h2><div class="tc-muted">${escapeHtml(e.message)}</div></div>`;
      console.error(e);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
