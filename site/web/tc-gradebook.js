(() => {
  "use strict";

  // Only run on gradebook page
  if (!location.pathname.startsWith("/teacher/gradebook")) return;

  const STORAGE_KEY_DRAFTS = "rc_tc_work_drafts_v1";
  const NS = "rc_unified_";

  // NOTE: Keep in sync with CANON_CLASSES in tc-work.js and CLASS_LABELS in tc-work-qol.js
  const CANON_CLASSES = [
    "LA 1 SC",
    "LA 2 SC",
    "LA 3 SC",
    "LA 4 SC",
    "Life Skills",
    "Life Skills LA",
  ];

  const $ = (id) => document.getElementById(id);

  // Helper to read from localStorage with namespace
  function storeGet(key, def) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw ? JSON.parse(raw) : def;
    } catch {
      return def;
    }
  }

  // Helper to read drafts (from tc-work.js storage key)
  function readDrafts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DRAFTS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  // State
  let currentClassFilter = "All Classes";
  let studentsData = [];
  let draftsData = [];
  let submissionsData = [];

  // Load data from localStorage
  function loadData() {
    studentsData = storeGet("students", []);
    draftsData = readDrafts();
    submissionsData = storeGet("submissions", []);
  }

  // Filter students by selected class
  function getFilteredStudents() {
    if (currentClassFilter === "All Classes") {
      return studentsData;
    }
    return studentsData.filter((s) => s.class_id === currentClassFilter);
  }

  // Build gradebook data structure
  function buildGradebookData() {
    const students = getFilteredStudents();
    const drafts = draftsData;

    if (!students.length || !drafts.length) {
      return null;
    }

    // Create a map of student_code -> draft_id -> score
    const scoreMap = new Map();

    for (const submission of submissionsData) {
      // Find the draft for this submission via instance
      const instance = storeGet("assignmentInstances", []).find(
        (inst) => inst.id === submission.instance_id
      );
      if (!instance) continue;

      const studentCode = instance.student_code;
      const draftId = instance.assignment_id;

      if (!scoreMap.has(studentCode)) {
        scoreMap.set(studentCode, new Map());
      }

      // Calculate score from answers (if available)
      let score = submission.score;
      if (score === undefined && submission.answers) {
        // Try to calculate score from answers
        const totalQuestions = Object.keys(submission.answers).length;
        if (totalQuestions > 0) {
          const correctAnswers = Object.values(submission.answers).filter(
            (a) => a.correct === true || a.isCorrect === true
          ).length;
          score = Math.round((correctAnswers / totalQuestions) * 100);
        }
      }

      scoreMap.get(studentCode).set(draftId, score);
    }

    return {
      students,
      drafts,
      scoreMap,
    };
  }

  // Calculate column average for a draft
  function calculateColumnAverage(draftId, scoreMap, students) {
    const scores = [];
    for (const student of students) {
      const studentScores = scoreMap.get(student.code);
      if (studentScores && studentScores.has(draftId)) {
        const score = studentScores.get(draftId);
        if (typeof score === "number") {
          scores.push(score);
        }
      }
    }

    if (scores.length === 0) return null;
    const sum = scores.reduce((a, b) => a + b, 0);
    return Math.round(sum / scores.length);
  }

  // Calculate row average for a student
  function calculateRowAverage(studentCode, scoreMap, drafts) {
    const studentScores = scoreMap.get(studentCode);
    if (!studentScores) return null;

    const scores = [];
    for (const draft of drafts) {
      if (studentScores.has(draft.id)) {
        const score = studentScores.get(draft.id);
        if (typeof score === "number") {
          scores.push(score);
        }
      }
    }

    if (scores.length === 0) return null;
    const sum = scores.reduce((a, b) => a + b, 0);
    return Math.round(sum / scores.length);
  }

  // Render the gradebook table
  function renderGradebook() {
    const data = buildGradebookData();
    const emptyEl = $("gbEmpty");
    const tableWrapEl = $("gbTableWrap");
    const tableHead = $("gbTableHead");
    const tableBody = $("gbTableBody");

    if (!data) {
      // Show empty state
      emptyEl.style.display = "block";
      tableWrapEl.style.display = "none";
      return;
    }

    emptyEl.style.display = "none";
    tableWrapEl.style.display = "block";

    const { students, drafts, scoreMap } = data;

    // Build header row
    tableHead.innerHTML = "";
    const headerRow = document.createElement("tr");

    // Student name column (sticky)
    const thStudent = document.createElement("th");
    thStudent.className = "gb-student-col";
    thStudent.textContent = "Student";
    headerRow.appendChild(thStudent);

    // Assignment columns
    for (const draft of drafts) {
      const th = document.createElement("th");
      th.textContent = draft.title || "(untitled)";
      th.style.minWidth = "120px";
      headerRow.appendChild(th);
    }

    // Average column
    const thAvg = document.createElement("th");
    thAvg.textContent = "Average";
    thAvg.style.minWidth = "80px";
    headerRow.appendChild(thAvg);

    tableHead.appendChild(headerRow);

    // Build data rows
    tableBody.innerHTML = "";

    for (const student of students) {
      const tr = document.createElement("tr");

      // Student name cell (sticky)
      const tdStudent = document.createElement("td");
      tdStudent.className = "gb-student-cell";
      tdStudent.textContent = student.name || student.code;
      tr.appendChild(tdStudent);

      // Score cells
      const studentScores = scoreMap.get(student.code);
      for (const draft of drafts) {
        const td = document.createElement("td");
        td.className = "gb-score-cell";

        if (studentScores && studentScores.has(draft.id)) {
          const score = studentScores.get(draft.id);
          if (typeof score === "number") {
            td.textContent = `${score}%`;
          } else {
            td.textContent = "—";
          }
        } else {
          td.textContent = "—";
        }

        tr.appendChild(td);
      }

      // Average cell
      const tdAvg = document.createElement("td");
      tdAvg.className = "gb-score-cell";
      const avg = calculateRowAverage(student.code, scoreMap, drafts);
      tdAvg.textContent = avg !== null ? `${avg}%` : "—";
      tr.appendChild(tdAvg);

      tableBody.appendChild(tr);
    }

    // Summary row (class averages)
    const summaryRow = document.createElement("tr");
    summaryRow.className = "gb-summary-row";

    const tdSummaryLabel = document.createElement("td");
    tdSummaryLabel.className = "gb-student-cell";
    tdSummaryLabel.textContent = "Class Average";
    summaryRow.appendChild(tdSummaryLabel);

    // Calculate column averages
    for (const draft of drafts) {
      const td = document.createElement("td");
      td.className = "gb-score-cell";
      const avg = calculateColumnAverage(draft.id, scoreMap, students);
      td.textContent = avg !== null ? `${avg}%` : "—";
      summaryRow.appendChild(td);
    }

    // Overall average
    const tdOverallAvg = document.createElement("td");
    tdOverallAvg.className = "gb-score-cell";
    
    // Calculate overall class average
    const allScores = [];
    for (const student of students) {
      const avg = calculateRowAverage(student.code, scoreMap, drafts);
      if (avg !== null) {
        allScores.push(avg);
      }
    }
    const overallAvg =
      allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : null;
    tdOverallAvg.textContent = overallAvg !== null ? `${overallAvg}%` : "—";
    summaryRow.appendChild(tdOverallAvg);

    tableBody.appendChild(summaryRow);
  }

  // Render class filter buttons
  function renderClassFilter() {
    const filterBar = $("classFilterBar");
    if (!filterBar) return;

    filterBar.innerHTML = "";

    // "All Classes" button
    const btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.className = "gb-filter-btn";
    btnAll.textContent = "All Classes";
    if (currentClassFilter === "All Classes") {
      btnAll.classList.add("active");
    }
    btnAll.addEventListener("click", () => {
      currentClassFilter = "All Classes";
      renderClassFilter();
      renderGradebook();
    });
    filterBar.appendChild(btnAll);

    // Individual class buttons
    for (const cls of CANON_CLASSES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gb-filter-btn";
      btn.textContent = cls;
      if (currentClassFilter === cls) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", () => {
        currentClassFilter = cls;
        renderClassFilter();
        renderGradebook();
      });
      filterBar.appendChild(btn);
    }
  }

  // Export gradebook to CSV
  function exportToCSV() {
    const data = buildGradebookData();
    if (!data) {
      alert("No data to export.");
      return;
    }

    const { students, drafts, scoreMap } = data;

    // Build CSV header
    const headers = ["Student"];
    for (const draft of drafts) {
      headers.push(draft.title || "(untitled)");
    }
    headers.push("Average");

    const rows = [headers];

    // Build data rows
    for (const student of students) {
      const row = [student.name || student.code];

      const studentScores = scoreMap.get(student.code);
      for (const draft of drafts) {
        if (studentScores && studentScores.has(draft.id)) {
          const score = studentScores.get(draft.id);
          row.push(typeof score === "number" ? score : "");
        } else {
          row.push("");
        }
      }

      const avg = calculateRowAverage(student.code, scoreMap, drafts);
      row.push(avg !== null ? avg : "");

      rows.push(row);
    }

    // Add summary row
    const summaryRow = ["Class Average"];
    for (const draft of drafts) {
      const avg = calculateColumnAverage(draft.id, scoreMap, students);
      summaryRow.push(avg !== null ? avg : "");
    }
    const allScores = [];
    for (const student of students) {
      const avg = calculateRowAverage(student.code, scoreMap, drafts);
      if (avg !== null) {
        allScores.push(avg);
      }
    }
    const overallAvg =
      allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : "";
    summaryRow.push(overallAvg);
    rows.push(summaryRow);

    // Convert to CSV string
    const csvContent = rows
      .map((row) =>
        row.map((cell) => {
          // Escape quotes and wrap in quotes if needed
          const str = String(cell);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(",")
      )
      .join("\n");

    // Download with safe filename
    const safeClassName = currentClassFilter.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
    download(`gradebook-${safeClassName}-${nowISO()}.csv`, csvContent);
  }

  // Download helper (from tc-work.js)
  function download(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function nowISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // Initialize
  function init() {
    loadData();
    renderClassFilter();
    renderGradebook();

    // Wire export button
    const btnExport = $("btnExportCSV");
    if (btnExport) {
      btnExport.addEventListener("click", exportToCSV);
    }
  }

  // Wait for DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
