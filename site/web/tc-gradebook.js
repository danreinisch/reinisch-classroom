(async () => {
  "use strict";

  // Only run on gradebook page
  if (!location.pathname.startsWith("/teacher/gradebook")) return;

  // Import data adapter for Supabase/localStorage abstraction
  const { db, isRemote } = await import('/web/data-adapter.js');
  const { getSupabase } = await import('/web/supabase-client.js');

  const STORAGE_KEY_DRAFTS = "rc_tc_work_drafts_v1";
  const NS = "rc_unified_";
  const REALTIME_DEBOUNCE_MS = 1000; // Debounce realtime updates to prevent excessive refreshes

  // NOTE: Keep in sync with CANON_CLASSES in tc-work.js and CLASS_LABELS in tc-work-qol.js
  // Full class names matching CSV data
  const CANON_CLASSES = [
    "Language Arts 1 SC",
    "Language Arts 2 SC",
    "Language Arts 3 SC",
    "Language Arts 4 SC",
    "Life Skills Language Arts SC",
    "Life Skills",
    "Consumer Math",
    "Geometry SC",
    "Speech/Language",
    "Warrior Academy"
  ];
  
  // Display abbreviations for space constraints
  const CLASS_DISPLAY = {
    "Language Arts 1 SC": "LA 1 SC",
    "Language Arts 2 SC": "LA 2 SC",
    "Language Arts 3 SC": "LA 3 SC",
    "Language Arts 4 SC": "LA 4 SC",
    "Life Skills Language Arts SC": "Life Skills LA",
    "Life Skills": "Life Skills",
    "Consumer Math": "Consumer Math",
    "Geometry SC": "Geometry SC",
    "Speech/Language": "Speech/Language",
    "Warrior Academy": "Warrior Academy"
  };

  const $ = (id) => document.getElementById(id);

  // Helper to format date as YYYY-MM-DD
  function formatDateYYYYMMDD() {
    return new Date().toISOString().split("T")[0];
  }

  // Helper to generate unique submission ID
  function generateSubmissionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 9).toUpperCase();
    return `SUB${timestamp}_${random}`;
  }

  // Helper to write to localStorage with namespace
  function storeSet(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

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

  // Helper to determine score color class based on percentage
  function scoreColorClass(score) {
    if (score == null || isNaN(score)) return "";
    if (score >= 80) return "gb-score-green";
    if (score >= 60) return "gb-score-amber";
    return "gb-score-red";
  }

  // Helper to get quarter from a date using actual school calendar
  // TODO: Make quarter dates configurable from /teacher/overview/ settings
  // Q1: August 16 - October 17
  // Q2: October 18 - December 19
  // Q3: December 20 - March 6
  // Q4: March 7 - May 20
  function getQuarter(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const month = date.getMonth() + 1; // getMonth is 0-indexed (1-12)
    const day = date.getDate();
    
    // Q1: August 16 - October 17
    if ((month === 8 && day >= 16) || month === 9 || (month === 10 && day <= 17)) return "Q1";
    
    // Q2: October 18 - December 19 (spans year boundary)
    if ((month === 10 && day >= 18) || month === 11 || (month === 12 && day <= 19)) return "Q2";
    
    // Q3: December 20 - March 6 (spans year boundary)
    if ((month === 12 && day >= 20) || month === 1 || month === 2 || (month === 3 && day <= 6)) return "Q3";
    
    // Q4: March 7 - May 20
    if ((month === 3 && day >= 7) || month === 4 || (month === 5 && day <= 20)) return "Q4";
    
    // Summer months (May 21-Aug 15) - might be Q4 or no quarter
    if ((month === 5 && day > 20) || month === 6 || month === 7 || (month === 8 && day < 16)) return "Q4"; // Include summer in Q4
    
    return null;
  }

  // State
  let currentClassFilter = "All Classes";
  let currentQuarterFilter = "";
  let studentsData = [];
  let draftsData = [];
  let submissionsData = [];
  let classEnrollmentsData = [];
  let assignmentInstancesData = [];
  let usingSupabase = false;
  let syncStatus = "local"; // "synced", "local", "error"
  let realtimeChannel = null;

  // Load data from Supabase (if available) or localStorage
  async function loadData() {
    try {
      // Check if Supabase is available
      usingSupabase = await isRemote();
      
      if (usingSupabase) {
        // Fetch from Supabase using data adapter
        console.log('[gradebook] Loading data from Supabase');
        
        try {
          // Load students, assignments, submissions, and assignment instances
          const [students, assignments, submissions, instances] = await Promise.all([
            db.listStudents(),
            db.listAssignments(),
            db.listSubmissions(),
            db.listAssignmentInstances()
          ]);
          
          // Load enrollments separately with error handling
          let enrollments = [];
          try {
            if (db.listClassEnrollments) {
              enrollments = await db.listClassEnrollments();
            }
          } catch (err) {
            console.warn('[gradebook] Error loading class enrollments:', err);
            enrollments = [];
          }
          
          studentsData = students || [];
          
          // Map assignments to draft format for compatibility
          // Assignments from Supabase have: id, title, type, series, page, hero, meta, created_at
          // Drafts from localStorage have: id, title, class, type, etc.
          draftsData = (assignments || []).map(a => ({
            id: a.id,
            title: a.title,
            type: a.type || 'assignment',
            series: a.series,
            page: a.page,
            hero: a.hero,
            meta: a.meta,
            created_at: a.created_at
          }));
          
          submissionsData = submissions || [];
          assignmentInstancesData = instances || [];
          classEnrollmentsData = enrollments || [];
          
          syncStatus = "synced";
          console.log('[gradebook] Data loaded from Supabase:', {
            students: studentsData.length,
            assignments: draftsData.length,
            submissions: submissionsData.length,
            instances: assignmentInstancesData.length
          });
        } catch (err) {
          console.warn('[gradebook] Error loading from Supabase, falling back to localStorage:', err);
          syncStatus = "error";
          // Fall back to localStorage
          loadDataFromLocalStorage();
        }
      } else {
        // Use localStorage
        console.log('[gradebook] Loading data from localStorage');
        loadDataFromLocalStorage();
        syncStatus = "local";
      }
      
      // Update sync status indicator
      updateSyncStatus();
      
    } catch (err) {
      console.error('[gradebook] Error in loadData:', err);
      // Fall back to localStorage on any error
      loadDataFromLocalStorage();
      syncStatus = "error";
      updateSyncStatus();
    }
  }
  
  // Helper to load data from localStorage
  function loadDataFromLocalStorage() {
    studentsData = storeGet("students", []);
    draftsData = readDrafts();
    submissionsData = storeGet("submissions", []);
    assignmentInstancesData = storeGet("assignmentInstances", []);
    classEnrollmentsData = storeGet("classEnrollments", []);
  }
  
  // Update sync status indicator
  function updateSyncStatus() {
    const statusEl = $("gbSyncStatus");
    const iconEl = $("gbSyncIcon");
    const textEl = $("gbSyncText");
    
    if (!statusEl || !iconEl || !textEl) return;
    
    // Show the status indicator
    statusEl.style.display = "inline-flex";
    
    // Remove all status classes
    statusEl.classList.remove("synced", "local", "error");
    
    // Add appropriate class and set content
    if (syncStatus === "synced") {
      statusEl.classList.add("synced");
      iconEl.textContent = "🟢";
      textEl.textContent = "Synced with Supabase";
    } else if (syncStatus === "error") {
      statusEl.classList.add("error");
      iconEl.textContent = "🔴";
      textEl.textContent = "Sync error (using local data)";
    } else {
      statusEl.classList.add("local");
      iconEl.textContent = "🟡";
      textEl.textContent = "Local mode";
    }
  }

  // Filter students by selected class
  function getFilteredStudents() {
    if (currentClassFilter === "All Classes") {
      return studentsData;
    }
    
    // Filter by class using enrollments with class_name
    const enrolledCodes = classEnrollmentsData
      .filter((e) => e.class_name === currentClassFilter && e.active !== false)
      .map((e) => e.student_code);
    
    // Get students who are enrolled in the selected class
    const byEnrollment = studentsData.filter((s) => enrolledCodes.includes(s.code));
    
    return byEnrollment;
  }

  // Build gradebook data structure
  function buildGradebookData() {
    const students = getFilteredStudents();
    let drafts = draftsData;
    
    // Filter drafts by quarter if selected
    if (currentQuarterFilter) {
      drafts = drafts.filter((draft) => {
        // Check both created_at and created fields for compatibility
        const dateStr = draft.created_at || draft.created || draft.release;
        if (!dateStr) return false;
        return getQuarter(dateStr) === currentQuarterFilter;
      });
    }

    // Return null only if there are no students
    // Allow showing students even with no drafts/assignments
    if (!students.length) {
      return null;
    }

    // Create a map of student_code -> draft_id -> score
    const scoreMap = new Map();

    for (const submission of submissionsData) {
      // Find the assignment instance for this submission
      const instance = assignmentInstancesData.find(
        (inst) => inst.id === submission.instance_id
      );
      if (!instance) continue;

      const studentCode = instance.student_code;
      const draftId = instance.assignment_id;

      if (!scoreMap.has(studentCode)) {
        scoreMap.set(studentCode, new Map());
      }

      // Use score_total from submission (Supabase format) or score (localStorage format)
      // Using nullish coalescing to handle both null and undefined
      let score = submission.score_total ?? submission.score;
      
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

  // Save a score for a student and assignment
  async function saveScore(studentCode, draftId, score) {
    try {
      if (usingSupabase) {
        // Use Supabase via data adapter
        console.log('[gradebook] Saving score to Supabase:', { studentCode, draftId, score });
        
        // Find or create assignment instance
        let instance = assignmentInstancesData.find(
          (inst) => inst.assignment_id === draftId && inst.student_code === studentCode
        );
        
        if (!instance) {
          // Create new instance via data adapter
          const newInstance = await db.upsertAssignmentInstance({
            id: draftId + "-" + studentCode,
            assignment_id: draftId,
            student_code: studentCode,
            assigned_at: formatDateYYYYMMDD(),
            status: "Assigned"
          });
          instance = newInstance;
          assignmentInstancesData.push(instance);
        }
        
        // Find existing submission or create new one
        const existingSubmission = submissionsData.find((sub) => sub.instance_id === instance.id);
        
        if (existingSubmission) {
          // Update existing submission (addSubmission acts as upsert when id is provided)
          await db.addSubmission({
            id: existingSubmission.id,
            instance_id: instance.id,
            score_total: score,
            submitted_at: new Date().toISOString()
          });
          existingSubmission.score_total = score;
        } else {
          // Create new submission
          const newSubmission = await db.addSubmission({
            instance_id: instance.id,
            score_total: score,
            submitted_at: new Date().toISOString()
          });
          submissionsData.push(newSubmission);
        }
        
        console.log('[gradebook] Score saved to Supabase');
      } else {
        // Use localStorage
        console.log('[gradebook] Saving score to localStorage:', { studentCode, draftId, score });
        
        // Find or create assignment instance
        let instances = storeGet("assignmentInstances", []);
        let instance = instances.find(
          (inst) => inst.assignment_id === draftId && inst.student_code === studentCode
        );

        if (!instance) {
          // Create new instance
          instance = {
            id: draftId + "-" + studentCode,
            assignment_id: draftId,
            student_code: studentCode,
            assigned_at: formatDateYYYYMMDD(),
            status: "Assigned",
          };
          instances.push(instance);
          storeSet("assignmentInstances", instances);
        }

        // Find or create submission
        let submissions = storeGet("submissions", []);
        let submission = submissions.find((sub) => sub.instance_id === instance.id);

        if (!submission) {
          // Create new submission
          submission = {
            id: generateSubmissionId(),
            instance_id: instance.id,
            score: score,
            submitted_at: new Date().toISOString(),
          };
          submissions.push(submission);
        } else {
          // Update existing submission
          submission.score = score;
        }

        storeSet("submissions", submissions);
      }

      // Reload data and re-render
      await loadData();
      renderGradebook();
    } catch (err) {
      console.error('[gradebook] Error saving score:', err);
      alert('Error saving score: ' + err.message);
    }
  }

  // Make a score cell editable
  function makeScoreEditable(td, studentCode, draftId, currentScore) {
    // Store original content
    const originalText = td.textContent;
    td.classList.add("editing");

    // Create inline editor container
    const editorDiv = document.createElement("div");
    editorDiv.className = "gb-inline-editor";

    // Create input
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.value = currentScore !== null ? currentScore : "";

    // Create save button (✓)
    const btnSave = document.createElement("button");
    btnSave.textContent = "✓";
    btnSave.title = "Save (Enter)";

    // Create cancel button (✗)
    const btnCancel = document.createElement("button");
    btnCancel.textContent = "✗";
    btnCancel.title = "Cancel (Escape)";

    // Assemble editor
    editorDiv.appendChild(input);
    editorDiv.appendChild(btnSave);
    editorDiv.appendChild(btnCancel);

    // Replace cell content with editor
    td.textContent = "";
    td.appendChild(editorDiv);
    input.focus();
    input.select();

    // Save handler
    const save = async () => {
      const newValue = input.value.trim();
      if (newValue === "") {
        // Restore original if empty
        cancel();
        return;
      }

      const score = parseInt(newValue, 10);
      if (isNaN(score) || score < 0 || score > 100) {
        alert("Please enter a score between 0 and 100.");
        input.focus();
        return;
      }

      // Disable input while saving
      input.disabled = true;
      btnSave.disabled = true;
      btnCancel.disabled = true;
      
      try {
        // Save the score
        await saveScore(studentCode, draftId, score);
      } catch (err) {
        // Re-enable input on error
        input.disabled = false;
        btnSave.disabled = false;
        btnCancel.disabled = false;
        input.focus();
        alert('Failed to save score: ' + err.message);
      }
    };

    // Cancel handler
    const cancel = () => {
      td.classList.remove("editing");
      td.textContent = originalText;
      // Reapply color class if there was a score
      if (currentScore !== null) {
        const colorClass = scoreColorClass(currentScore);
        if (colorClass) {
          td.classList.add(colorClass);
        }
      }
    };

    // Wire up events
    btnSave.addEventListener("click", save);
    btnCancel.addEventListener("click", cancel);
    
    input.addEventListener("blur", (e) => {
      // Don't blur if clicking on save/cancel buttons
      if (e.relatedTarget === btnSave || e.relatedTarget === btnCancel) {
        return;
      }
      save();
    });
    
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const increment = e.shiftKey ? 5 : 1;
        const currentVal = input.value.trim() === "" ? 0 : parseInt(input.value, 10);
        if (!isNaN(currentVal)) {
          input.value = Math.min(100, currentVal + increment);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const decrement = e.shiftKey ? 5 : 1;
        const currentVal = input.value.trim() === "" ? 0 : parseInt(input.value, 10);
        if (!isNaN(currentVal)) {
          input.value = Math.max(0, currentVal - decrement);
        }
      }
    });
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

    let isFirstRow = true; // Track first student row for auto-highlight
    for (const student of students) {
      const tr = document.createElement("tr");
      
      // Auto-highlight first student row
      if (isFirstRow) {
        tr.classList.add("gb-highlighted");
        isFirstRow = false;
      }

      // Student name cell (sticky)
      const tdStudent = document.createElement("td");
      tdStudent.className = "gb-student-cell";
      tdStudent.textContent = student.name || student.code;
      tr.appendChild(tdStudent);

      // Score cells
      const studentScores = scoreMap.get(student.code);
      for (const draft of drafts) {
        const td = document.createElement("td");
        td.className = "gb-score-cell editable";

        let currentScore = null;
        if (studentScores && studentScores.has(draft.id)) {
          const score = studentScores.get(draft.id);
          if (typeof score === "number") {
            td.textContent = `${score}%`;
            currentScore = score;
            // Apply color class
            const colorClass = scoreColorClass(score);
            if (colorClass) {
              td.classList.add(colorClass);
            }
          } else {
            td.textContent = "—";
          }
        } else {
          td.textContent = "—";
        }

        // Make cell editable on click
        td.addEventListener("click", () => {
          makeScoreEditable(td, student.code, draft.id, currentScore);
        });

        tr.appendChild(td);
      }

      // Average cell
      const tdAvg = document.createElement("td");
      tdAvg.className = "gb-score-cell";
      const avg = calculateRowAverage(student.code, scoreMap, drafts);
      if (avg !== null) {
        tdAvg.textContent = `${avg}%`;
        // Apply color class to average
        const colorClass = scoreColorClass(avg);
        if (colorClass) {
          tdAvg.classList.add(colorClass);
        }
      } else {
        tdAvg.textContent = "—";
      }
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
      if (avg !== null) {
        td.textContent = `${avg}%`;
        // Apply color class to column average
        const colorClass = scoreColorClass(avg);
        if (colorClass) {
          td.classList.add(colorClass);
        }
      } else {
        td.textContent = "—";
      }
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
    if (overallAvg !== null) {
      tdOverallAvg.textContent = `${overallAvg}%`;
      // Apply color class to overall average
      const colorClass = scoreColorClass(overallAvg);
      if (colorClass) {
        tdOverallAvg.classList.add(colorClass);
      }
    } else {
      tdOverallAvg.textContent = "—";
    }
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
        row
          .map((cell) => {
            // Escape quotes and wrap in quotes if needed
            const str = String(cell);
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(",")
      )
      .join("\n");

    // Download with safe filename
    const safeClassName = currentClassFilter.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
    download(`gradebook-${safeClassName}-${nowISO()}.csv`, csvContent);
  }

  // Export gradebook to PDF
  async function exportToPDF() {
    // PDF layout constants
    const PDF_LANDSCAPE_USABLE_WIDTH = 280; // mm for A4 landscape
    const PDF_MAX_PAGE_HEIGHT = 190; // mm before overflow on single page
    
    const data = buildGradebookData();
    if (!data) {
      alert("No data to export.");
      return;
    }

    try {
      // Lazy-load jsPDF (relative import from same directory structure)
      const { jsPDF } = await import('../vendor/jspdf.mjs');
      
      const { students, drafts, scoreMap } = data;
      
      // Create new PDF document (landscape for better table fit)
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      // Title
      const title = `Gradebook - ${currentClassFilter}`;
      doc.setFontSize(16);
      doc.text(title, 15, 15);
      
      // Date
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 15, 22);
      
      // Build table data
      const headers = ["Student"];
      for (const draft of drafts) {
        headers.push((draft.title || "(untitled)").substring(0, 20)); // Truncate long titles
      }
      headers.push("Avg");
      
      const tableData = [];
      for (const student of students) {
        const row = [student.name || student.code];
        const studentScores = scoreMap.get(student.code);
        
        for (const draft of drafts) {
          if (studentScores && studentScores.has(draft.id)) {
            const score = studentScores.get(draft.id);
            row.push(typeof score === "number" ? `${score}%` : "—");
          } else {
            row.push("—");
          }
        }
        
        const avg = calculateRowAverage(student.code, scoreMap, drafts);
        row.push(avg !== null ? `${avg}%` : "—");
        
        tableData.push(row);
      }
      
      // Add summary row
      const summaryRow = ["Class Avg"];
      for (const draft of drafts) {
        const avg = calculateColumnAverage(draft.id, scoreMap, students);
        summaryRow.push(avg !== null ? `${avg}%` : "—");
      }
      const allScores = [];
      for (const student of students) {
        const avg = calculateRowAverage(student.code, scoreMap, drafts);
        if (avg !== null) {
          allScores.push(avg);
        }
      }
      const overallAvg = allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : null;
      summaryRow.push(overallAvg !== null ? `${overallAvg}%` : "—");
      tableData.push(summaryRow);
      
      // Add table using autoTable plugin if available, otherwise basic table
      if (doc.autoTable) {
        doc.autoTable({
          head: [headers],
          body: tableData,
          startY: 28,
          theme: 'grid',
          headStyles: { fillColor: [34, 197, 94] },
          styles: { fontSize: 8, cellPadding: 2 }
        });
      } else {
        // Fallback: simple text-based table
        doc.setFontSize(8);
        let y = 28;
        const colWidth = PDF_LANDSCAPE_USABLE_WIDTH / headers.length; // Divide by columns
        
        // Headers
        let x = 15;
        doc.setFont(undefined, 'bold');
        for (const header of headers) {
          doc.text(header.substring(0, 15), x, y);
          x += colWidth;
        }
        y += 6;
        
        // Data rows
        doc.setFont(undefined, 'normal');
        for (const row of tableData) {
          x = 15;
          for (const cell of row) {
            doc.text(String(cell).substring(0, 15), x, y);
            x += colWidth;
          }
          y += 5;
          if (y > PDF_MAX_PAGE_HEIGHT) break; // Avoid overflow on single page
        }
      }
      
      // Download with safe filename
      const safeClassName = currentClassFilter.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
      doc.save(`gradebook-${safeClassName}-${nowISO()}.pdf`);
      
    } catch (err) {
      console.error('[gradebook] PDF export error:', err);
      
      // Fallback: Use browser print dialog
      if (confirm('jsPDF library not available. Would you like to use the browser Print dialog instead? (You can save as PDF from there)')) {
        window.print();
      } else {
        alert('PDF export requires the jsPDF library. Please use the Export CSV button or try printing the page.');
      }
    }
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

  // Setup realtime subscription for submissions when using Supabase
  async function setupRealtimeSubscription() {
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        console.log('[gradebook] Realtime: Supabase not available, skipping subscription');
        return;
      }
      
      console.log('[gradebook] Setting up realtime subscription for submissions');
      
      // Subscribe to submissions table changes
      realtimeChannel = supabase
        .channel('gradebook_submissions_changes')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'submissions' },
          handleRealtimeChange
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'submissions' },
          handleRealtimeChange
        )
        .subscribe((status) => {
          console.log('[gradebook] Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('[gradebook] Realtime subscription active');
          }
        });
    } catch (err) {
      console.warn('[gradebook] Error setting up realtime subscription:', err);
    }
  }
  
  // Handle realtime changes
  let realtimeDebounceTimer = null;
  function handleRealtimeChange(payload) {
    console.log('[gradebook] Realtime change detected:', payload);
    
    // Debounce refresh to avoid excessive updates
    clearTimeout(realtimeDebounceTimer);
    realtimeDebounceTimer = setTimeout(async () => {
      try {
        console.log('[gradebook] Refreshing gradebook data after realtime change');
        await loadData();
        renderGradebook();
      } catch (err) {
        console.error('[gradebook] Error refreshing after realtime change:', err);
      }
    }, REALTIME_DEBOUNCE_MS);
  }
  
  // Cleanup realtime subscription on page unload
  function cleanupRealtime() {
    if (realtimeChannel) {
      console.log('[gradebook] Cleaning up realtime subscription');
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
  }

  // Initialize
  async function init() {
    await loadData();
    renderClassFilter();
    renderGradebook();

    // Wire export button
    const btnExport = $("btnExportCSV");
    if (btnExport) {
      btnExport.addEventListener("click", exportToCSV);
    }
    
    // Wire PDF export button
    const btnExportPDF = $("btnExportPDF");
    if (btnExportPDF) {
      btnExportPDF.addEventListener("click", exportToPDF);
    }
    
    // Wire quarter filter
    const quarterFilter = $("gbQuarterFilter");
    if (quarterFilter) {
      quarterFilter.addEventListener("change", () => {
        currentQuarterFilter = quarterFilter.value;
        renderGradebook();
      });
    }
    
    // Setup realtime subscription if using Supabase
    if (usingSupabase) {
      await setupRealtimeSubscription();
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanupRealtime);
  }

  // Wait for DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
