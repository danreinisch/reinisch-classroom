(async () => {
  "use strict";

  // Only run on gradebook page
  if (!location.pathname.startsWith("/teacher/gradebook")) return;

  // Import data adapter for Supabase/localStorage abstraction
  const { db, isRemote } = await import('/site/web/data-adapter.js');
  const { getSupabase } = await import('/site/web/supabase-client.js');

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

  // State
  let currentClassFilter = "All Classes";
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
          const [students, assignments, submissions, instances, enrollments] = await Promise.all([
            db.listStudents(),
            db.listAssignments(),
            db.listSubmissions(),
            db.listAssignmentInstances(),
            db.listClassEnrollments ? db.listClassEnrollments() : []
          ]);
          
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
    return studentsData.filter((s) => {
      // Check if student has direct class_id match
      if (s.class_id === currentClassFilter) {
        return true;
      }
      // Check if student is enrolled in the class via classEnrollments
      return classEnrollmentsData.some(
        (e) => e.class_id === currentClassFilter && e.student_code === s.code && e.active !== false
      );
    });
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
      let score = submission.score_total !== undefined ? submission.score_total : submission.score;
      
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
        
        // Create/update submission via data adapter
        await db.addSubmission({
          instance_id: instance.id,
          score_total: score,
          submitted_at: new Date().toISOString()
        });
        
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

    // Create input
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.value = currentScore !== null ? currentScore : "";
    input.style.width = "60px";

    // Replace cell content with input
    td.textContent = "";
    td.appendChild(input);
    input.focus();
    input.select();

    // Save on blur or Enter
    const save = async () => {
      const newValue = input.value.trim();
      if (newValue === "") {
        // Restore original if empty
        td.classList.remove("editing");
        td.textContent = originalText;
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
      
      // Save the score
      await saveScore(studentCode, draftId, score);
    };

    // Cancel on Escape
    const cancel = () => {
      td.classList.remove("editing");
      td.textContent = originalText;
    };

    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
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
        td.className = "gb-score-cell editable";

        let currentScore = null;
        if (studentScores && studentScores.has(draft.id)) {
          const score = studentScores.get(draft.id);
          if (typeof score === "number") {
            td.textContent = `${score}%`;
            currentScore = score;
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
      console.log('[gradebook] Refreshing gradebook data after realtime change');
      await loadData();
      renderGradebook();
    }, 1000);
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
