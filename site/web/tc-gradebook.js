(async () => {
  "use strict";

  // Only run on gradebook page
  if (!location.pathname.startsWith("/teacher/gradebook")) return;

  // Import data adapter for Supabase/localStorage abstraction
  const { db, isRemote } = await import('/web/data-adapter.js');
  const { getSupabase } = await import('/web/supabase-client.js');
  const { CANON_CLASSES, CLASS_DISPLAY } = await import('/web/constants.js');
  const { getQuarterDates, getQuarterForDate } = await import('/web/quarter-utils.js');

  const STORAGE_KEY_DRAFTS = "rc_tc_work_drafts_v1";
  const NS = "rc_unified_";
  const REALTIME_DEBOUNCE_MS = 1000; // Debounce realtime updates to prevent excessive refreshes


  const $ = (id) => document.getElementById(id);

  // Helper to format date as YYYY-MM-DD
  function formatDateYYYYMMDD() {
    return new Date().toISOString().split("T")[0];
  }

  // Helper to format date as MM/DD for column headers
  function formatShortDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}`;
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
      if (!Array.isArray(arr)) return [];
      // Filter out non-object entries (corrupted data)
      return arr.filter(item => typeof item === 'object' && item !== null && !Array.isArray(item));
    } catch {
      return [];
    }
  }

  // Helper to calculate earned points from a percentage score and total possible
  function calculateEarnedPoints(score, totalPossible) {
    if (typeof score !== 'number' || typeof totalPossible !== 'number') return 0;
    if (!Number.isFinite(score) || !Number.isFinite(totalPossible)) return 0;
    if (totalPossible === 0) return 0;
    return Math.round(score * totalPossible / 100);
  }

  // Helper to determine score color class based on percentage
  function scoreColorClass(score) {
    if (score == null || isNaN(score)) return "";
    if (score >= 80) return "gb-score-green";
    if (score >= 60) return "gb-score-amber";
    return "gb-score-red";
  }

  // Helper to append a labeled stats row to a hover card using safe DOM construction
  function appendStatsRow(parent, label, value) {
    const row = document.createElement("div");
    row.className = "gb-stats-card-row";
    const labelSpan = document.createElement("span");
    labelSpan.className = "gb-stats-card-label";
    labelSpan.textContent = label;
    const valSpan = document.createElement("span");
    valSpan.className = "gb-stats-card-val";
    valSpan.textContent = value;
    row.appendChild(labelSpan);
    row.appendChild(valSpan);
    parent.appendChild(row);
  }

  // UI preference state (persisted in localStorage)
  const PREF_COMPACT = "rc_gb_compact";
  const PREF_SHOW_MORE = "rc_gb_show_more";
  const PREF_SORT = "rc_gb_sort";
  const PREF_GROUPED_VIEW = "rc_gb_grouped_view"; // legacy key (boolean)
  const PREF_GROUP_MODE = "rc_gb_group_mode";     // new key: "individual" | "class" | "week"
  let isCompact = false;
  let showMoreColumns = false;
  let currentSort = "date";
  // groupMode: "individual" (flat), "class" (by CANON_CLASSES), "week" (by Week N from title)
  let groupMode = "class";
  // Column sort state: null | "student" | draftId | groupSeries | "average" | "weighted" | "trend"
  let columnSortKey = null;
  let columnSortDir = null; // null | "asc" | "desc"
  const expandedGroups = new Set();
  try {
    const compactRaw = localStorage.getItem(PREF_COMPACT);
    if (compactRaw !== null) {
      isCompact = compactRaw === "true";
    }
    const showMoreRaw = localStorage.getItem(PREF_SHOW_MORE);
    if (showMoreRaw !== null) {
      showMoreColumns = showMoreRaw === "true";
    }
    const sortRaw = localStorage.getItem(PREF_SORT);
    if (sortRaw) {
      currentSort = sortRaw;
    }
    const groupModeRaw = localStorage.getItem(PREF_GROUP_MODE);
    if (groupModeRaw && ["individual", "class", "week"].includes(groupModeRaw)) {
      groupMode = groupModeRaw;
    } else {
      // Migrate from old boolean preference
      const groupedRaw = localStorage.getItem(PREF_GROUPED_VIEW);
      if (groupedRaw !== null) {
        groupMode = groupedRaw === "true" ? "class" : "individual";
      }
    }
  } catch {
    // If localStorage is unavailable (e.g., privacy mode), fall back to defaults.
  }

  // State
  let currentClassFilter = "All Classes";
  let currentQuarterFilter = "";
  let studentSearchTerm = "";
  let missingWorkPairs = new Set(); // stores "studentCode::draftId" strings
  let showOnlyMissingStudents = false;
  let _renderingInProgress = false; // re-entrancy guard for renderGradebook()
  let _focusedCellPos = null; // { rowIndex, colIndex } — preserved across re-renders
  let _a11yStatusTimer = null; // timer for announceA11y() debounce
  let _lastAnnouncedStudentCount = -1; // -1 = uninitialized; ensures first load always announces
  let _lastAnnouncedDraftCount = -1;   // count-based dedup: re-announces only when counts change
  let studentsData = [];
  let draftsData = [];
  let submissionsData = [];
  let classEnrollmentsData = [];
  let assignmentInstancesData = [];
  let usingSupabase = false;
  let syncStatus = "local"; // "synced", "local", "error"
  let realtimeChannel = null;
  let realtimeRetryCount = 0;
  let realtimeRetryTimer = null;
  let realtimeFlashTimer = null;
  const REALTIME_MAX_RETRIES = 3;
  const REALTIME_RETRY_DELAY_MS = 5000;

  // Announce a message to screen readers via the live region.
  // Clears the region first, then sets text after a short delay,
  // using last-wins debounce so only the most recent message is announced.
  function announceA11y(msg) {
    const el = $("gbA11yStatus");
    if (!el) return;
    el.textContent = "";
    clearTimeout(_a11yStatusTimer);
    _a11yStatusTimer = setTimeout(() => { el.textContent = msg; }, 50);
  }

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

      // Announce data loaded to screen readers (only when counts change)
      const sCount = studentsData.length;
      const dCount = draftsData.length;
      if (sCount !== _lastAnnouncedStudentCount || dCount !== _lastAnnouncedDraftCount) {
        _lastAnnouncedStudentCount = sCount;
        _lastAnnouncedDraftCount = dCount;
        announceA11y(`Gradebook loaded with ${sCount} student${sCount !== 1 ? 's' : ''} and ${dCount} assignment${dCount !== 1 ? 's' : ''}`);
      }
      
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
    let students;
    if (currentClassFilter === "All Classes") {
      students = studentsData;
    } else {
      // Filter by class using enrollments with class_name
      const enrolledCodes = classEnrollmentsData
        .filter((e) => e.class_name === currentClassFilter && e.active !== false)
        .map((e) => e.student_code);
      
      // Get students who are enrolled in the selected class
      students = studentsData.filter((s) => enrolledCodes.includes(s.code));
    }

    // Filter by search term (name or code, case-insensitive)
    if (studentSearchTerm) {
      const term = studentSearchTerm.toLowerCase();
      students = students.filter((s) => {
        const name = (s.name || "").toLowerCase();
        const code = (s.code || "").toLowerCase();
        return name.includes(term) || code.includes(term);
      });
    }

    if (showOnlyMissingStudents && missingWorkPairs.size > 0) {
      const missingStudentCodes = new Set();
      for (const pair of missingWorkPairs) {
        missingStudentCodes.add(pair.split("::")[0]);
      }
      students = students.filter(s => missingStudentCodes.has(s.code));
    }

    return students;
  }

  // Sort drafts array based on currentSort preference
  function sortDrafts(drafts) {
    const sorted = [...drafts];
    if (currentSort === "title") {
      sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (currentSort === "series") {
      sorted.sort((a, b) => (a.series || "").localeCompare(b.series || "") || (a.title || "").localeCompare(b.title || ""));
    } else {
      // "date" — sort by due/created date ascending
      sorted.sort((a, b) => {
        const da = a.dueAt || a.due_at || a.createdAt || a.created_at || "";
        const db = b.dueAt || b.due_at || b.createdAt || b.created_at || "";
        return da.localeCompare(db);
      });
    }
    return sorted;
  }

  // Apply column sort to a students array based on columnSortKey / columnSortDir.
  // groups is optional (used when sorting by group series key).
  // Null/missing values always sort to the bottom regardless of direction.
  function applyColumnSort(students, scoreMap, drafts, groups) {
    if (!columnSortKey || !columnSortDir) return students;
    const sorted = [...students];
    const dir = columnSortDir === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      let va, vb;

      if (columnSortKey === "student") {
        va = (a.name || a.code || "").toLowerCase();
        vb = (b.name || b.code || "").toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      }

      if (columnSortKey === "average") {
        va = calculateRowAverage(a.code, scoreMap, drafts);
        vb = calculateRowAverage(b.code, scoreMap, drafts);
      } else if (columnSortKey === "weighted") {
        va = calculateWeightedAverage(a.code, scoreMap, drafts);
        vb = calculateWeightedAverage(b.code, scoreMap, drafts);
      } else if (columnSortKey === "trend") {
        // Ascending = best trend first: up(0) > flat(1) > down(2); unknown falls to bottom(3)
        const trendOrder = { up: 0, flat: 1, down: 2 };
        va = trendOrder[calculateTrend(a.code, scoreMap, drafts)] ?? 3;
        vb = trendOrder[calculateTrend(b.code, scoreMap, drafts)] ?? 3;
      } else {
        // Try to match a collapsed group series
        const group = groups && groups.find(g => g.series === columnSortKey);
        if (group) {
          va = calculateGroupAverage(a.code, scoreMap, group.drafts);
          vb = calculateGroupAverage(b.code, scoreMap, group.drafts);
        } else {
          // Individual draft ID
          const aScores = scoreMap.get(a.code);
          const bScores = scoreMap.get(b.code);
          const aVal = aScores ? aScores.get(columnSortKey) : undefined;
          const bVal = bScores ? bScores.get(columnSortKey) : undefined;
          va = typeof aVal === "number" ? aVal : null;
          vb = typeof bVal === "number" ? bVal : null;
        }
      }

      // Null/missing values always go to the bottom
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    return sorted;
  }

  // Attach a click-to-sort handler to a <th> element with the given sort key.
  // Cycles: none → asc → desc → none.
  // displayLabel is used for the sort announcement (clean label without date/pts noise).
  function attachColumnSortClick(th, key, displayLabel) {
    th.style.cursor = "pointer";
    th.addEventListener("click", (e) => {
      e.stopPropagation();
      if (columnSortKey === key) {
        if (columnSortDir === "asc") {
          columnSortDir = "desc";
        } else {
          columnSortKey = null;
          columnSortDir = null;
        }
      } else {
        columnSortKey = key;
        columnSortDir = "asc";
      }
      renderGradebook();
      // Announce sort change to screen readers
      if (columnSortKey && columnSortDir) {
        const dirLabel = columnSortDir === "asc" ? "ascending" : "descending";
        const colName = displayLabel || key;
        announceA11y(`Sorted by ${colName}, ${dirLabel}`);
      } else {
        announceA11y("Sort cleared");
      }
    });
  }

  // Return the aria-sort attribute value for a given sort key.
  function getAriaSortAttr(key) {
    if (columnSortKey !== key) return "none";
    return columnSortDir === "asc" ? "ascending" : "descending";
  }

  // Return a sort indicator character for a given sort key, or empty string.
  function columnSortIndicator(key) {
    if (columnSortKey !== key) return "";
    return columnSortDir === "asc" ? " ▲" : " ▼";
  }

  // Compare two drafts by due/created date ascending (used for within-group sorting)
  function draftDateSorter(a, b) {
    const da = a.dueAt || a.due_at || a.createdAt || a.created_at || "";
    const db = b.dueAt || b.due_at || b.createdAt || b.created_at || "";
    return da.localeCompare(db);
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
        return getQuarterForDate(dateStr) === currentQuarterFilter;
      });
    }

    // Sort drafts
    drafts = sortDrafts(drafts);

    // Return null only if there are no students
    // Allow showing students even with no drafts/assignments
    if (!students.length) {
      return null;
    }

    // Create a map of student_code -> draft_id -> score
    // submissionsData is ordered newest-first (DESC by submitted_at), so the
    // first submission we encounter for a given student/assignment is the most
    // recent one and its score should take priority over older submissions.
    const scoreMap = new Map();

    for (const submission of submissionsData) {
      // Find the assignment instance for this submission
      const instance = assignmentInstancesData.find(
        (inst) => inst.id === submission.instance_id
      );

      let studentCode, draftId;
      if (instance) {
        studentCode = instance.student_code;
        draftId = instance.assignment_id;
      } else {
        // Fallback: extract from nested assignment_instances data returned by listSubmissions()
        // This handles the case where the instance isn't in the locally-loaded assignmentInstancesData
        const nestedInstance = Array.isArray(submission.assignment_instances)
          ? submission.assignment_instances[0]
          : submission.assignment_instances;
        if (!nestedInstance) {
          console.warn('[gradebook] No instance found for submission', submission.id, 'instance_id:', submission.instance_id);
          continue;
        }
        studentCode = nestedInstance.students?.code || nestedInstance.student_code;
        draftId = nestedInstance.assignment_id || submission.assignment_id;
        if (!studentCode || !draftId) {
          console.warn('[gradebook] Missing student_code or assignment_id for submission', submission.id);
          continue;
        }
      }

      if (!scoreMap.has(studentCode)) {
        scoreMap.set(studentCode, new Map());
      }

      // Skip if we already recorded a score for this student/assignment from a
      // more recent submission (earlier in the DESC-ordered array).
      if (scoreMap.get(studentCode).has(draftId)) continue;

      // Use score_total from submission (Supabase format) or score (localStorage format)
      // Using nullish coalescing to handle both null and undefined
      // Coerce to Number since Supabase returns numeric columns as strings.
      let score = submission.score_total ?? submission.score;
      if (score != null) score = Number(score);
      if (isNaN(score)) score = null;
      
      if (score == null && typeof submission.answers === 'object' && submission.answers !== null) {
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
      const savedStudentName = (studentsData.find(s => s.code === studentCode) || {}).name || studentCode;
      const savedDraft = draftsData.find(d => d.id === draftId);
      const savedTitle = savedDraft ? (savedDraft.title || "(untitled)") : draftId;
      announceA11y(`Score saved: ${score} for ${savedStudentName} on ${savedTitle}`);
      await loadData();
      renderGradebook();
    } catch (err) {
      console.error('[gradebook] Error saving score:', err);
      await rcAlert('Error', 'Error saving score: ' + err.message);
    }
  }

  // Make a score cell editable
  function makeScoreEditable(td, studentCode, draftId, currentScore, totalPossible) {
    const maxScore = totalPossible || 100;
    td.classList.add("editing");
    let _skipBlurCancel = false; // set to true when Tab or explicit save handles navigation

    // Lookup student name and assignment title for aria-label updates
    const _editStudentName = (studentsData.find(s => s.code === studentCode) || {}).name || studentCode;
    const _editDraft = draftsData.find(d => d.id === draftId);
    const _editTitle = _editDraft ? (_editDraft.title || "(untitled)") : draftId;

    // Update aria-label to reflect editing state
    td.setAttribute("aria-label", `Editing score for ${_editStudentName} on ${_editTitle}. Press Escape to cancel`);

    // Create inline editor container
    const editorDiv = document.createElement("div");
    editorDiv.className = "gb-inline-editor";

    // Create input
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = String(maxScore);
    input.value = currentScore !== null ? currentScore : "";

    // Create save button (✓)
    const btnSave = document.createElement("button");
    btnSave.textContent = "✓";
    btnSave.title = "Save (Enter)";
    btnSave.setAttribute("aria-label", "Save score");

    // Create cancel button (✗)
    const btnCancel = document.createElement("button");
    btnCancel.textContent = "✗";
    btnCancel.title = "Cancel (Escape)";
    btnCancel.setAttribute("aria-label", "Cancel editing");

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
      if (isNaN(score) || score < 0 || score > maxScore) {
        await rcAlert('Invalid Score', `Please enter a score between 0 and ${maxScore}.`);
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
        await rcAlert('Error', 'Failed to save score: ' + err.message);
      }
    };

    // Cancel handler
    const cancel = () => {
      td.classList.remove("editing");
      // Rebuild cell content safely using DOM methods (matches renderGradebook() pattern)
      td.textContent = "";
      if (currentScore !== null) {
        const pctLine = document.createElement("div");
        pctLine.className = "gb-score-pct";
        pctLine.textContent = `${currentScore}%`;
        td.appendChild(pctLine);

        if (totalPossible) {
          const ptsLine = document.createElement("div");
          ptsLine.className = "gb-score-pts-line";
          ptsLine.textContent = `${calculateEarnedPoints(currentScore, totalPossible)}/${totalPossible}`;
          td.appendChild(ptsLine);
        }

        // Reapply color class
        const colorClass = scoreColorClass(currentScore);
        if (colorClass) {
          td.classList.add(colorClass);
        }
        td.setAttribute("aria-label", `Score for ${_editStudentName} on ${_editTitle}: ${currentScore}%. Press Enter to edit`);
      } else {
        td.textContent = "—";
        td.setAttribute("aria-label", `No score for ${_editStudentName} on ${_editTitle}. Press Enter to edit`);
      }
    };

    // Wire up events
    btnSave.addEventListener("click", save);
    btnCancel.addEventListener("click", cancel);
    
    input.addEventListener("blur", (e) => {
      // Don't cancel if clicking on save/cancel buttons
      if (e.relatedTarget === btnSave || e.relatedTarget === btnCancel) {
        return;
      }
      if (_skipBlurCancel) return;
      // Cancel on blur — require explicit save via Enter or ✓ button
      // This prevents accidental saves when clicking outside the cell
      cancel();
    });
    
    // Helper: move focus to the next focusable cell after td in the same row
    const moveFocusToNextCell = (fromTd) => {
      const row = fromTd.closest("tr");
      if (!row) return;
      const cells = Array.from(row.cells);
      const idx = cells.indexOf(fromTd);
      for (let i = idx + 1; i < cells.length; i++) {
        if (cells[i].tabIndex >= 0 && cells[i].style.display !== "none") {
          cells[i].focus();
          break;
        }
      }
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Tab") {
        e.preventDefault();
        _skipBlurCancel = true;
        const newValue = input.value.trim();
        if (newValue !== "") {
          // Save then move focus to next score cell in the row
          save().then(() => {
            moveFocusToNextCell(td);
          }).finally(() => {
            _skipBlurCancel = false;
          });
        } else {
          cancel();
          _skipBlurCancel = false;
          moveFocusToNextCell(td);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const increment = e.shiftKey ? 5 : 1;
        const currentVal = input.value.trim() === "" ? 0 : parseInt(input.value, 10);
        if (!isNaN(currentVal)) {
          input.value = Math.min(maxScore, currentVal + increment);
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

  // Infer the CANON_CLASSES series for a draft using multiple fallback strategies.
  // Returns a matching CANON_CLASSES string or null.
  function inferSeriesFromDraft(draft) {
    // Strategy 1: use draft.series directly if it matches a known class
    if (draft.series && CANON_CLASSES.includes(draft.series)) {
      return draft.series;
    }

    // Strategy 2: search the draft title for a CANON_CLASSES keyword (case-insensitive)
    const title = (draft.title || '').toLowerCase();
    for (const cls of CANON_CLASSES) {
      if (title.includes(cls.toLowerCase())) {
        return cls;
      }
    }

    // Strategy 3: look up which students were assigned this draft via
    //   assignmentInstancesData → classEnrollmentsData, then pick the most
    //   common CANON_CLASS among those enrollments.
    const instancesForDraft = assignmentInstancesData.filter(i => i.assignment_id === draft.id);
    if (instancesForDraft.length > 0) {
      const classCounts = new Map();
      for (const instance of instancesForDraft) {
        const enrollment = classEnrollmentsData.find(
          e => e.student_code === instance.student_code && e.active !== false
        );
        if (enrollment && enrollment.class_name && CANON_CLASSES.includes(enrollment.class_name)) {
          classCounts.set(enrollment.class_name, (classCounts.get(enrollment.class_name) || 0) + 1);
        }
      }
      if (classCounts.size > 0) {
        return [...classCounts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      }
    }

    return null;
  }

  // Build groups from a drafts array, ordered by CANON_CLASSES; uncategorised go last
  function buildGroupsFromDrafts(drafts) {
    const groupMap = new Map();
    const ungrouped = [];
    for (const draft of drafts) {
      const series = inferSeriesFromDraft(draft);
      if (series) {
        if (!groupMap.has(series)) {
          groupMap.set(series, { series, displayName: CLASS_DISPLAY[series] ?? series, drafts: [] });
        }
        groupMap.get(series).drafts.push(draft);
      } else {
        ungrouped.push(draft);
      }
    }
    const groups = CANON_CLASSES.filter(cls => groupMap.has(cls)).map(cls => groupMap.get(cls));
    // Sort drafts within each group by date
    for (const group of groups) {
      group.drafts.sort(draftDateSorter);
    }
    ungrouped.sort(draftDateSorter);
    return { groups, ungrouped };
  }

  // Extract a "Week N" label and numeric week from a draft title, or null if no match
  function inferWeekFromDraft(draft) {
    const title = draft.title || "";

    // Pattern 1: "Week N" anywhere in string (most explicit)
    let m = title.match(/\bWeek\s*(\d+)\b/i);
    if (m) return { num: parseInt(m[1], 10), label: `Week ${m[1]}` };

    // Pattern 2: "Wk N" or "Wk. N" (common abbreviation)
    m = title.match(/\bWk\.?\s*(\d+)\b/i);
    if (m) return { num: parseInt(m[1], 10), label: `Week ${m[1]}` };

    // Pattern 3: "W9:" or "W12 " (single letter W followed by number, then delimiter or end)
    // Note: use [\s:,-] NOT [\s:,\-] to avoid ESLint no-useless-escape error
    m = title.match(/\bW(\d+)(?=[\s:,-]|$)/i);
    if (m) return { num: parseInt(m[1], 10), label: `Week ${m[1]}` };

    return null;
  }

  // Build groups from a drafts array, ordered numerically by week number parsed from titles
  function buildWeekGroupsFromDrafts(drafts) {
    const groupMap = new Map();
    const ungrouped = [];
    for (const draft of drafts) {
      const week = inferWeekFromDraft(draft);
      if (week) {
        if (!groupMap.has(week.label)) {
          groupMap.set(week.label, {
            series: `week_${week.num}`,
            displayName: week.label,
            weekNum: week.num,
            drafts: []
          });
        }
        groupMap.get(week.label).drafts.push(draft);
      } else {
        ungrouped.push(draft);
      }
    }
    // Sort groups numerically by week number
    const groups = [...groupMap.values()].sort((a, b) => a.weekNum - b.weekNum);
    // Sort drafts within each group by date
    for (const group of groups) {
      group.drafts.sort(draftDateSorter);
    }
    ungrouped.sort(draftDateSorter);
    return { groups, ungrouped };
  }

  // Calculate average score for a student across a specific set of drafts
  function calculateGroupAverage(studentCode, scoreMap, groupDrafts) {
    const studentScores = scoreMap.get(studentCode);
    if (!studentScores) return null;
    const scores = [];
    for (const draft of groupDrafts) {
      if (studentScores.has(draft.id)) {
        const s = studentScores.get(draft.id);
        if (typeof s === "number") scores.push(s);
      }
    }
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  // Count how many drafts in a group have a numeric score for the given student
  function countGroupCompleted(studentCode, scoreMap, groupDrafts) {
    const studentScores = scoreMap.get(studentCode);
    if (!studentScores) return 0;
    return groupDrafts.filter(d => studentScores.has(d.id) && typeof studentScores.get(d.id) === "number").length;
  }

  // Calculate the raw earned and possible point totals for a student across a group
  function calculateGroupRawPoints(studentCode, scoreMap, groupDrafts) {
    const studentScores = scoreMap.get(studentCode);
    let rawEarnedSum = 0, possibleSum = 0;
    for (const draft of groupDrafts) {
      const tp = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
      if (studentScores && studentScores.has(draft.id) && tp) {
        const s = studentScores.get(draft.id);
        if (typeof s === "number") {
          rawEarnedSum += (s * tp / 100);
          possibleSum += tp;
        }
      }
    }
    return { rawEarnedSum, possibleSum };
  }

  // Build an individual assignment <th> element (shared by individual mode and expanded groups)
  function buildAssignmentTh(draft) {
    const th = document.createElement("th");
    th.setAttribute("role", "columnheader");
    th.setAttribute("aria-sort", getAriaSortAttr(draft.id));
    th.style.minWidth = isCompact ? "56px" : "68px";

    const fullTitle = draft.title || "(untitled)";
    const titleEl = document.createElement("div");
    titleEl.className = "gb-col-title";
    const titleText = fullTitle.length > 10 ? fullTitle.substring(0, 10) + "…" : fullTitle;
    titleEl.textContent = titleText + columnSortIndicator(draft.id);
    titleEl.title = fullTitle;
    th.appendChild(titleEl);

    const dateStr = formatShortDate(draft.dueAt || draft.due_at || draft.createdAt || draft.created_at);
    if (dateStr) {
      const dateEl = document.createElement("div");
      dateEl.className = "gb-col-date";
      dateEl.textContent = dateStr;
      th.appendChild(dateEl);
    }

    const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
    if (totalPossible) {
      const ptsEl = document.createElement("div");
      ptsEl.className = "gb-col-pts";
      ptsEl.textContent = `${totalPossible} pts`;
      th.appendChild(ptsEl);
    }

    attachColumnSortClick(th, draft.id, draft.title || "(untitled)");
    return th;
  }

  // Build an individual score <td> element (Option D: pct + earned/possible)
  function buildScoreTd(draft, studentCode, scoreMap, studentName) {
    const td = document.createElement("td");
    td.setAttribute("role", "gridcell");
    td.className = "gb-score-cell editable";
    td.tabIndex = 0;

    if (missingWorkPairs.has(`${studentCode}::${draft.id}`)) {
      td.classList.add("gb-missing-highlight");
    }

    const assignmentTitle = draft.title || "(untitled)";
    const resolvedStudentName = studentName || studentCode;

    let currentScore = null;
    const studentScores = scoreMap.get(studentCode);
    if (studentScores && studentScores.has(draft.id)) {
      const score = studentScores.get(draft.id);
      if (typeof score === "number") {
        currentScore = score;
        const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;

        const pctLine = document.createElement("div");
        pctLine.className = "gb-score-pct";
        pctLine.textContent = `${score}%`;
        td.appendChild(pctLine);

        if (totalPossible) {
          const ptsLine = document.createElement("div");
          ptsLine.className = "gb-score-pts-line";
          ptsLine.textContent = `${calculateEarnedPoints(score, totalPossible)}/${totalPossible}`;
          td.appendChild(ptsLine);
        }

        const colorClass = scoreColorClass(score);
        if (colorClass) td.classList.add(colorClass);
        td.setAttribute("aria-label", `Score for ${resolvedStudentName} on ${assignmentTitle}: ${score}%. Press Enter to edit`);
      } else {
        td.textContent = "—";
        td.setAttribute("aria-label", `No score for ${resolvedStudentName} on ${assignmentTitle}. Press Enter to edit`);
      }
    } else {
      td.textContent = "—";
      td.setAttribute("aria-label", `No score for ${resolvedStudentName} on ${assignmentTitle}. Press Enter to edit`);
    }

    td.addEventListener("click", () => {
      const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
      makeScoreEditable(td, studentCode, draft.id, currentScore, totalPossible);
    });

    return td;
  }

  // Render gradebook in grouped/collapsed column mode (Option A)
  function renderGroupedGradebook(tableHead, tableBody, students, drafts, scoreMap) {
    const { groups, ungrouped } = groupMode === "week"
      ? buildWeekGroupsFromDrafts(drafts)
      : buildGroupsFromDrafts(drafts);
    const allDraftsFlat = [...groups.flatMap(g => g.drafts), ...ungrouped];

    // Warn about assignments missing total_possible metadata
    const missingTotalPossible = allDraftsFlat.filter(d => !d.meta || !d.meta.total_possible);
    if (missingTotalPossible.length > 0) {
      console.warn(`[gradebook] ${missingTotalPossible.length} assignment(s) missing total_possible:`,
        missingTotalPossible.map(d => d.title || d.id));
    }

    // Show an informational banner when no groupings could be inferred
    const noGroupsBannerEl = $("gbNoGroupsBanner");
    if (noGroupsBannerEl) {
      noGroupsBannerEl.style.display = groups.length === 0 && drafts.length > 0 ? "block" : "none";
    }

    // ── Header row ────────────────────────────────────────────────────────────
    const headerRow = document.createElement("tr");
    headerRow.setAttribute("role", "row");

    const thStudent = document.createElement("th");
    thStudent.setAttribute("role", "columnheader");
    thStudent.setAttribute("aria-sort", getAriaSortAttr("student"));
    thStudent.className = "gb-student-col";
    thStudent.textContent = "Student" + columnSortIndicator("student");
    attachColumnSortClick(thStudent, "student", "Student");
    headerRow.appendChild(thStudent);

    for (const group of groups) {
      const isExpanded = expandedGroups.has(group.series);

      if (!isExpanded) {
        const th = document.createElement("th");
        th.setAttribute("role", "columnheader");
        th.setAttribute("aria-sort", getAriaSortAttr(group.series));
        th.setAttribute("aria-expanded", "false");
        th.className = "gb-group-header";
        th.style.minWidth = isCompact ? "80px" : "150px";
        th.tabIndex = 0;
        th.dataset.groupSeries = group.series;

        const nameEl = document.createElement("div");
        nameEl.className = "gb-group-header-name";
        nameEl.textContent = group.displayName + columnSortIndicator(group.series);
        th.appendChild(nameEl);

        // Compact assignment count; for week groups also show the earliest date
        const countEl = document.createElement("div");
        countEl.className = "gb-group-header-count";
        const countText = `${group.drafts.length} assignment${group.drafts.length !== 1 ? 's' : ''}`;
        if (groupMode === "week") {
          const timestamps = group.drafts
            .map(d => {
              const raw = d.dueAt || d.due_at || d.createdAt || d.created_at;
              if (!raw) return NaN;
              const t = new Date(raw).getTime();
              return Number.isFinite(t) ? t : NaN;
            })
            .filter(t => !isNaN(t));
          const earliestDate = timestamps.length > 0
            ? formatShortDate(new Date(Math.min(...timestamps)).toISOString())
            : "";
          countEl.textContent = earliestDate ? `${countText} · ${earliestDate}` : countText;
        } else {
          countEl.textContent = countText;
        }
        th.appendChild(countEl);

        // Set tooltip with full assignment list for hover reference
        th.title = group.drafts.map(d => {
          const t = d.title || "(untitled)";
          const dateStr = formatShortDate(d.dueAt || d.due_at || d.createdAt || d.created_at);
          return t + (dateStr ? ` (${dateStr})` : "");
        }).join("\n");

        const expandEl = document.createElement("div");
        expandEl.className = "gb-group-expand-btn";
        expandEl.setAttribute("aria-label", `Expand ${group.displayName} assignments`);
        expandEl.textContent = "▸";
        expandEl.addEventListener("click", (e) => {
          e.stopPropagation();
          expandedGroups.add(group.series);
          renderGradebook();
        });
        th.appendChild(expandEl);

        attachColumnSortClick(th, group.series, group.displayName);
        headerRow.appendChild(th);
      } else {
        // Expanded: add collapse indicator to first assignment column only (no separate label TH)
        for (let i = 0; i < group.drafts.length; i++) {
          const th = buildAssignmentTh(group.drafts[i]);
          if (i === 0) {
            th.classList.add("gb-group-first-col");
            th.tabIndex = 0;
            th.setAttribute("aria-expanded", "true");
            th.dataset.groupSeriesExpanded = group.series;
            const collapseEl = document.createElement("div");
            collapseEl.className = "gb-group-expand-btn";
            collapseEl.setAttribute("aria-label", `Collapse ${group.displayName} assignments`);
            collapseEl.textContent = `◂ ${group.displayName}`;
            collapseEl.addEventListener("click", (e) => {
              e.stopPropagation();
              expandedGroups.delete(group.series);
              renderGradebook();
            });
            th.insertBefore(collapseEl, th.firstChild);
          }
          headerRow.appendChild(th);
        }
      }
    }

    // Ungrouped assignment columns
    for (const draft of ungrouped) {
      headerRow.appendChild(buildAssignmentTh(draft));
    }

    // Average / Weighted / Trend extra columns
    const thAvg = document.createElement("th");
    thAvg.setAttribute("role", "columnheader");
    thAvg.setAttribute("aria-sort", getAriaSortAttr("average"));
    thAvg.textContent = "Average" + columnSortIndicator("average");
    thAvg.style.minWidth = "72px";
    thAvg.dataset.extraCol = "1";
    if (!showMoreColumns) thAvg.style.display = "none";
    attachColumnSortClick(thAvg, "average", "Average");
    headerRow.appendChild(thAvg);

    const thWeighted = document.createElement("th");
    thWeighted.setAttribute("role", "columnheader");
    thWeighted.setAttribute("aria-sort", getAriaSortAttr("weighted"));
    thWeighted.textContent = "Weighted" + columnSortIndicator("weighted");
    thWeighted.style.minWidth = "72px";
    thWeighted.dataset.extraCol = "1";
    if (!showMoreColumns) thWeighted.style.display = "none";
    attachColumnSortClick(thWeighted, "weighted", "Weighted");
    headerRow.appendChild(thWeighted);

    const thTrend = document.createElement("th");
    thTrend.setAttribute("role", "columnheader");
    thTrend.setAttribute("aria-sort", getAriaSortAttr("trend"));
    thTrend.textContent = "Trend" + columnSortIndicator("trend");
    thTrend.style.minWidth = "56px";
    thTrend.dataset.extraCol = "1";
    if (!showMoreColumns) thTrend.style.display = "none";
    attachColumnSortClick(thTrend, "trend", "Trend");
    headerRow.appendChild(thTrend);

    tableHead.appendChild(headerRow);

    // ── Data rows ─────────────────────────────────────────────────────────────
    const sortedStudents = applyColumnSort(students, scoreMap, drafts, groups);
    let isFirstRow = true;
    for (const student of sortedStudents) {
      const tr = document.createElement("tr");
      tr.setAttribute("role", "row");
      if (isFirstRow) {
        tr.classList.add("gb-highlighted");
        isFirstRow = false;
      }

      const studentScoreMap = scoreMap.get(student.code);
      const completedCount = studentScoreMap
        ? [...studentScoreMap.values()].filter(v => typeof v === "number").length
        : 0;
      const totalAssigned = allDraftsFlat.length;
      const rowAverage = calculateRowAverage(student.code, scoreMap, allDraftsFlat);
      const trend = calculateTrend(student.code, scoreMap, allDraftsFlat);

      // Student cell (sticky) with hover card
      const tdStudent = document.createElement("td");
      tdStudent.setAttribute("role", "rowheader");
      tdStudent.className = "gb-student-cell";
      tdStudent.tabIndex = 0;
      tdStudent.textContent = student.name || student.code;
      const trendLabel = trend === "up" ? "↗ Improving" : trend === "down" ? "↘ Declining" : "→ Steady";
      tdStudent.dataset.tooltip = JSON.stringify({
        name: student.name || student.code,
        code: student.code,
        completed: completedCount,
        total: totalAssigned,
        avg: rowAverage,
        trend: trendLabel
      });
      tdStudent.classList.add("gb-has-stats");
      tr.appendChild(tdStudent);

      // Group cells
      for (const group of groups) {
        const isExpanded = expandedGroups.has(group.series);
        const groupAvg = calculateGroupAverage(student.code, scoreMap, group.drafts);
        const _done = countGroupCompleted(student.code, scoreMap, group.drafts);

        if (!isExpanded) {
          // Collapsed: single group summary cell
          const tdGroupSummary = document.createElement("td");
          tdGroupSummary.setAttribute("role", "gridcell");
          tdGroupSummary.className = "gb-group-cell gb-score-cell";
          tdGroupSummary.tabIndex = 0;
          const studentDisplayName = student.name || student.code;
          if (groupAvg !== null) {
            const avgLine = document.createElement("div");
            avgLine.className = "gb-score-pct";
            avgLine.textContent = `${groupAvg}%`;
            tdGroupSummary.appendChild(avgLine);
            tdGroupSummary.setAttribute("aria-label", `${group.displayName} average for ${studentDisplayName}: ${groupAvg}%`);

            const studentScores = scoreMap.get(student.code);
            let rawEarnedSum = 0, possibleSum = 0;
            for (const draft of group.drafts) {
              const tp = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
              if (studentScores && studentScores.has(draft.id) && tp) {
                const s = studentScores.get(draft.id);
                if (typeof s === "number") {
                  rawEarnedSum += (s * tp / 100);
                  possibleSum += tp;
                }
              }
            }
            const earnedSum = Math.round(rawEarnedSum);
            if (possibleSum > 0) {
              const countLine = document.createElement("div");
              countLine.className = "gb-score-pts-line";
              countLine.textContent = `${earnedSum}/${possibleSum}`;
              countLine.title = "Earned points / Possible points";
              tdGroupSummary.appendChild(countLine);
            }

            const colorClass = scoreColorClass(groupAvg);
            if (colorClass) tdGroupSummary.classList.add(colorClass);
          } else {
            tdGroupSummary.textContent = "—";
            tdGroupSummary.setAttribute("aria-label", `No score for ${group.displayName} for ${studentDisplayName}`);
          }
          const hasMissing = group.drafts.some(d => missingWorkPairs.has(`${student.code}::${d.id}`));
          if (hasMissing) {
            tdGroupSummary.classList.add("gb-missing-highlight");
            const missingCount = group.drafts.filter(d => missingWorkPairs.has(`${student.code}::${d.id}`)).length;
            tdGroupSummary.title = `${missingCount} missing assignment${missingCount !== 1 ? "s" : ""} in this group`;
          }
          tr.appendChild(tdGroupSummary);
        } else {
          // Expanded: individual score cells only (no redundant summary cell)
          for (const draft of group.drafts) {
            tr.appendChild(buildScoreTd(draft, student.code, scoreMap, student.name || student.code));
          }
        }
      }

      // Ungrouped score cells (Option D)
      for (const draft of ungrouped) {
        tr.appendChild(buildScoreTd(draft, student.code, scoreMap, student.name || student.code));
      }

      // Average / Weighted / Trend cells
      const tdAvg = document.createElement("td");
      tdAvg.setAttribute("role", "gridcell");
      tdAvg.className = "gb-score-cell";
      tdAvg.dataset.extraCol = "1";
      if (!showMoreColumns) tdAvg.style.display = "none";
      if (rowAverage !== null) {
        tdAvg.textContent = `${rowAverage}%`;
        const colorClass = scoreColorClass(rowAverage);
        if (colorClass) tdAvg.classList.add(colorClass);
      } else {
        tdAvg.textContent = "—";
      }
      tr.appendChild(tdAvg);

      const tdWeighted = document.createElement("td");
      tdWeighted.setAttribute("role", "gridcell");
      tdWeighted.className = "gb-score-cell";
      tdWeighted.dataset.extraCol = "1";
      if (!showMoreColumns) tdWeighted.style.display = "none";
      const weighted = calculateWeightedAverage(student.code, scoreMap, allDraftsFlat);
      if (weighted !== null) {
        tdWeighted.textContent = `${weighted}%`;
        const colorClass = scoreColorClass(weighted);
        if (colorClass) tdWeighted.classList.add(colorClass);
      } else {
        tdWeighted.textContent = "—";
      }
      tr.appendChild(tdWeighted);

      const tdTrend = document.createElement("td");
      tdTrend.setAttribute("role", "gridcell");
      tdTrend.className = "gb-score-cell";
      tdTrend.dataset.extraCol = "1";
      tdTrend.style.textAlign = "center";
      if (!showMoreColumns) tdTrend.style.display = "none";
      const trendSpan = document.createElement("span");
      if (trend === "up") {
        trendSpan.className = "gb-trend-arrow gb-trend-up";
        trendSpan.textContent = "↗️";
      } else if (trend === "down") {
        trendSpan.className = "gb-trend-arrow gb-trend-down";
        trendSpan.textContent = "↘️";
      } else {
        trendSpan.className = "gb-trend-arrow gb-trend-flat";
        trendSpan.textContent = "→";
      }
      tdTrend.appendChild(trendSpan);
      tr.appendChild(tdTrend);

      tableBody.appendChild(tr);
    }

    // ── Summary row ───────────────────────────────────────────────────────────
    const summaryRow = document.createElement("tr");
    summaryRow.setAttribute("role", "row");
    summaryRow.className = "gb-summary-row";

    const tdSummaryLabel = document.createElement("td");
    tdSummaryLabel.setAttribute("role", "rowheader");
    tdSummaryLabel.className = "gb-student-cell";
    tdSummaryLabel.textContent = "Class Average";
    summaryRow.appendChild(tdSummaryLabel);

    for (const group of groups) {
      const isExpanded = expandedGroups.has(group.series);

      // Group summary average across all students
      const groupScores = [];
      for (const student of students) {
        const avg = calculateGroupAverage(student.code, scoreMap, group.drafts);
        if (avg !== null) groupScores.push(avg);
      }
      if (!isExpanded) {
        // Collapsed: single group summary cell
        const tdGroupSummary = document.createElement("td");
        tdGroupSummary.setAttribute("role", "gridcell");
        tdGroupSummary.className = "gb-group-cell gb-score-cell";
        if (groupScores.length > 0) {
          const overallGroupAvg = Math.round(groupScores.reduce((a, b) => a + b, 0) / groupScores.length);
          tdGroupSummary.textContent = `${overallGroupAvg}%`;
          const colorClass = scoreColorClass(overallGroupAvg);
          if (colorClass) tdGroupSummary.classList.add(colorClass);
        } else {
          tdGroupSummary.textContent = "—";
        }
        summaryRow.appendChild(tdGroupSummary);
      } else {
        // Expanded: individual column averages only (no redundant summary cell)
        for (const draft of group.drafts) {
          const td = document.createElement("td");
          td.setAttribute("role", "gridcell");
          td.className = "gb-score-cell";
          const avg = calculateColumnAverage(draft.id, scoreMap, students);
          if (avg !== null) {
            td.textContent = `${avg}%`;
            const colorClass = scoreColorClass(avg);
            if (colorClass) td.classList.add(colorClass);
          } else {
            td.textContent = "—";
          }
          summaryRow.appendChild(td);
        }
      }
    }

    // Ungrouped column averages
    for (const draft of ungrouped) {
      const td = document.createElement("td");
      td.setAttribute("role", "gridcell");
      td.className = "gb-score-cell";
      const avg = calculateColumnAverage(draft.id, scoreMap, students);
      if (avg !== null) {
        td.textContent = `${avg}%`;
        const colorClass = scoreColorClass(avg);
        if (colorClass) td.classList.add(colorClass);
      } else {
        td.textContent = "—";
      }
      summaryRow.appendChild(td);
    }

    // Overall average / weighted summary cells
    const tdOverallAvg = document.createElement("td");
    tdOverallAvg.setAttribute("role", "gridcell");
    tdOverallAvg.className = "gb-score-cell";
    tdOverallAvg.dataset.extraCol = "1";
    if (!showMoreColumns) tdOverallAvg.style.display = "none";
    const allScores = [];
    for (const student of students) {
      const avg = calculateRowAverage(student.code, scoreMap, allDraftsFlat);
      if (avg !== null) allScores.push(avg);
    }
    const overallAvg = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : null;
    if (overallAvg !== null) {
      tdOverallAvg.textContent = `${overallAvg}%`;
      const colorClass = scoreColorClass(overallAvg);
      if (colorClass) tdOverallAvg.classList.add(colorClass);
    } else {
      tdOverallAvg.textContent = "—";
    }
    summaryRow.appendChild(tdOverallAvg);

    const tdOverallWeighted = document.createElement("td");
    tdOverallWeighted.setAttribute("role", "gridcell");
    tdOverallWeighted.className = "gb-score-cell";
    tdOverallWeighted.dataset.extraCol = "1";
    if (!showMoreColumns) tdOverallWeighted.style.display = "none";
    const allWeightedScores = [];
    for (const student of students) {
      const weighted = calculateWeightedAverage(student.code, scoreMap, allDraftsFlat);
      if (weighted !== null) allWeightedScores.push(weighted);
    }
    const overallWeighted = allWeightedScores.length > 0
      ? Math.round(allWeightedScores.reduce((a, b) => a + b, 0) / allWeightedScores.length)
      : null;
    if (overallWeighted !== null) {
      tdOverallWeighted.textContent = `${overallWeighted}%`;
      const colorClass = scoreColorClass(overallWeighted);
      if (colorClass) tdOverallWeighted.classList.add(colorClass);
    } else {
      tdOverallWeighted.textContent = "—";
    }
    summaryRow.appendChild(tdOverallWeighted);

    const tdTrendEmpty = document.createElement("td");
    tdTrendEmpty.setAttribute("role", "gridcell");
    tdTrendEmpty.className = "gb-score-cell";
    tdTrendEmpty.dataset.extraCol = "1";
    if (!showMoreColumns) tdTrendEmpty.style.display = "none";
    tdTrendEmpty.textContent = "—";
    summaryRow.appendChild(tdTrendEmpty);

    tableBody.appendChild(summaryRow);
  }

  // Helper: restore focus to the previously-captured cell position after a re-render
  function restoreFocusFromPos() {
    if (!_focusedCellPos) return;
    const { rowIndex, colIndex } = _focusedCellPos;
    _focusedCellPos = null;
    const tableBodyEl = $("gbTableBody");
    if (!tableBodyEl) return;
    const targetRow = tableBodyEl.rows[rowIndex] || tableBodyEl.rows[tableBodyEl.rows.length - 1];
    if (!targetRow) return;
    const targetCell = targetRow.cells[colIndex] || targetRow.cells[targetRow.cells.length - 1];
    if (targetCell && targetCell.tabIndex >= 0) {
      targetCell.focus({ preventScroll: false });
    }
  }

  // Render the gradebook table
  function renderGradebook() {
    if (_renderingInProgress) return;
    _renderingInProgress = true;

    // Capture focused cell position before wiping the DOM
    const tableWrapCapture = $("gbTableWrap");
    if (tableWrapCapture && tableWrapCapture.contains(document.activeElement)) {
      const focused = document.activeElement;
      const row = focused.closest("tr");
      if (row) {
        const allRows = Array.from(row.parentElement.rows);
        const rowIndex = allRows.indexOf(row);
        const cells = Array.from(row.cells);
        const colIndex = cells.indexOf(focused.closest("td,th"));
        if (rowIndex >= 0 && colIndex >= 0) {
          _focusedCellPos = { rowIndex, colIndex };
        }
      }
    }

    try {
    const data = buildGradebookData();
    const emptyEl = $("gbEmpty");
    const tableWrapEl = $("gbTableWrap");
    const tableHead = $("gbTableHead");
    const tableBody = $("gbTableBody");

    // Sync compact/show-more/grouped-view UI buttons state
    const btnCompact = $("btnToggleCompact");
    if (btnCompact) {
      btnCompact.textContent = isCompact ? "☑ Compact" : "⊞ Comfortable";
      btnCompact.classList.toggle("primary", isCompact);
    }
    const btnShowMore = $("btnToggleMoreCols");
    if (btnShowMore) {
      btnShowMore.textContent = showMoreColumns ? "⋯ Show Less" : "⋯ Show More";
      btnShowMore.classList.toggle("primary", showMoreColumns);
    }
    const selectGroupMode = $("gbGroupModeSelect");
    if (selectGroupMode) {
      selectGroupMode.value = groupMode;
    }

    // Sync search input value
    const searchEl = $("gbStudentSearch");
    if (searchEl && searchEl.value !== studentSearchTerm) {
      searchEl.value = studentSearchTerm;
    }

    // Apply/remove compact class on table wrapper
    if (tableWrapEl) {
      tableWrapEl.classList.toggle("gb-compact", isCompact);
    }

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

    // Grouped view (Option A): delegate to renderGroupedGradebook
    if (groupMode !== "individual") {
      tableBody.innerHTML = "";
      renderGroupedGradebook(tableHead, tableBody, students, drafts, scoreMap);
      restoreFocusFromPos();
      return;
    }
    const headerRow = document.createElement("tr");
    headerRow.setAttribute("role", "row");

    // Student name column (sticky)
    const thStudent = document.createElement("th");
    thStudent.setAttribute("role", "columnheader");
    thStudent.setAttribute("aria-sort", getAriaSortAttr("student"));
    thStudent.className = "gb-student-col";
    thStudent.textContent = "Student" + columnSortIndicator("student");
    attachColumnSortClick(thStudent, "student", "Student");
    headerRow.appendChild(thStudent);

    // Assignment columns
    for (const draft of drafts) {
      headerRow.appendChild(buildAssignmentTh(draft));
    }

    // Average / Weighted / Trend columns (shown only when showMoreColumns is true)
    const thAvg = document.createElement("th");
    thAvg.setAttribute("role", "columnheader");
    thAvg.setAttribute("aria-sort", getAriaSortAttr("average"));
    thAvg.textContent = "Average" + columnSortIndicator("average");
    thAvg.style.minWidth = "72px";
    thAvg.dataset.extraCol = "1";
    if (!showMoreColumns) thAvg.style.display = "none";
    attachColumnSortClick(thAvg, "average", "Average");
    headerRow.appendChild(thAvg);

    const thWeighted = document.createElement("th");
    thWeighted.setAttribute("role", "columnheader");
    thWeighted.setAttribute("aria-sort", getAriaSortAttr("weighted"));
    thWeighted.textContent = "Weighted" + columnSortIndicator("weighted");
    thWeighted.style.minWidth = "72px";
    thWeighted.dataset.extraCol = "1";
    if (!showMoreColumns) thWeighted.style.display = "none";
    attachColumnSortClick(thWeighted, "weighted", "Weighted");
    headerRow.appendChild(thWeighted);

    const thTrend = document.createElement("th");
    thTrend.setAttribute("role", "columnheader");
    thTrend.setAttribute("aria-sort", getAriaSortAttr("trend"));
    thTrend.textContent = "Trend" + columnSortIndicator("trend");
    thTrend.style.minWidth = "56px";
    thTrend.dataset.extraCol = "1";
    if (!showMoreColumns) thTrend.style.display = "none";
    attachColumnSortClick(thTrend, "trend", "Trend");
    headerRow.appendChild(thTrend);

    tableHead.appendChild(headerRow);

    // Build data rows
    tableBody.innerHTML = "";

    const sortedStudents = applyColumnSort(students, scoreMap, drafts, []);
    let isFirstRow = true; // Track first student row for auto-highlight
    for (const student of sortedStudents) {
      const tr = document.createElement("tr");
      tr.setAttribute("role", "row");
      
      // Auto-highlight first student row
      if (isFirstRow) {
        tr.classList.add("gb-highlighted");
        isFirstRow = false;
      }

      // Compute per-student metrics once so they can be reused for the
      // hover-card tooltip and the Average/Trend cells later in this row.
      const studentScoreMap = scoreMap.get(student.code);
      const completedCount = studentScoreMap ? [...studentScoreMap.values()].filter(v => typeof v === "number").length : 0;
      const totalAssigned = drafts.length;
      const rowAverage = calculateRowAverage(student.code, scoreMap, drafts);
      const trend = calculateTrend(student.code, scoreMap, drafts);

      // Student name cell (sticky) with quick-stats hover card
      const tdStudent = document.createElement("td");
      tdStudent.setAttribute("role", "rowheader");
      tdStudent.className = "gb-student-cell";
      tdStudent.tabIndex = 0;
      tdStudent.textContent = student.name || student.code;

      // Build quick stats for hover card
      const trendLabel = trend === "up" ? "↗ Improving" : trend === "down" ? "↘ Declining" : "→ Steady";
      tdStudent.dataset.tooltip = JSON.stringify({
        name: student.name || student.code,
        code: student.code,
        completed: completedCount,
        total: totalAssigned,
        avg: rowAverage,
        trend: trendLabel
      });
      tdStudent.classList.add("gb-has-stats");

      tr.appendChild(tdStudent);

      // Score cells
      for (const draft of drafts) {
        tr.appendChild(buildScoreTd(draft, student.code, scoreMap, student.name || student.code));
      }

      // Average / Weighted / Trend cells
      const tdAvg = document.createElement("td");
      tdAvg.setAttribute("role", "gridcell");
      tdAvg.className = "gb-score-cell";
      tdAvg.dataset.extraCol = "1";
      if (!showMoreColumns) tdAvg.style.display = "none";
      if (rowAverage !== null) {
        tdAvg.textContent = `${rowAverage}%`;
        const colorClass = scoreColorClass(rowAverage);
        if (colorClass) tdAvg.classList.add(colorClass);
      } else {
        tdAvg.textContent = "—";
      }
      tr.appendChild(tdAvg);

      const tdWeighted = document.createElement("td");
      tdWeighted.setAttribute("role", "gridcell");
      tdWeighted.className = "gb-score-cell";
      tdWeighted.dataset.extraCol = "1";
      if (!showMoreColumns) tdWeighted.style.display = "none";
      const weighted = calculateWeightedAverage(student.code, scoreMap, drafts);
      if (weighted !== null) {
        tdWeighted.textContent = `${weighted}%`;
        const colorClass = scoreColorClass(weighted);
        if (colorClass) tdWeighted.classList.add(colorClass);
      } else {
        tdWeighted.textContent = "—";
      }
      tr.appendChild(tdWeighted);

      const tdTrend = document.createElement("td");
      tdTrend.setAttribute("role", "gridcell");
      tdTrend.className = "gb-score-cell";
      tdTrend.dataset.extraCol = "1";
      tdTrend.style.textAlign = "center";
      if (!showMoreColumns) tdTrend.style.display = "none";
      const trendSpan = document.createElement("span");
      if (trend === 'up') {
        trendSpan.className = "gb-trend-arrow gb-trend-up";
        trendSpan.textContent = "↗️";
      } else if (trend === 'down') {
        trendSpan.className = "gb-trend-arrow gb-trend-down";
        trendSpan.textContent = "↘️";
      } else {
        trendSpan.className = "gb-trend-arrow gb-trend-flat";
        trendSpan.textContent = "→";
      }
      tdTrend.appendChild(trendSpan);
      tr.appendChild(tdTrend);

      tableBody.appendChild(tr);
    }

    // Summary row (class averages)
    const summaryRow = document.createElement("tr");
    summaryRow.setAttribute("role", "row");
    summaryRow.className = "gb-summary-row";

    const tdSummaryLabel = document.createElement("td");
    tdSummaryLabel.setAttribute("role", "rowheader");
    tdSummaryLabel.className = "gb-student-cell";
    tdSummaryLabel.textContent = "Class Average";
    summaryRow.appendChild(tdSummaryLabel);

    // Calculate column averages
    for (const draft of drafts) {
      const td = document.createElement("td");
      td.setAttribute("role", "gridcell");
      td.className = "gb-score-cell";
      const avg = calculateColumnAverage(draft.id, scoreMap, students);
      if (avg !== null) {
        td.textContent = `${avg}%`;
        const colorClass = scoreColorClass(avg);
        if (colorClass) td.classList.add(colorClass);
      } else {
        td.textContent = "—";
      }
      summaryRow.appendChild(td);
    }

    // Overall average
    const tdOverallAvg = document.createElement("td");
    tdOverallAvg.setAttribute("role", "gridcell");
    tdOverallAvg.className = "gb-score-cell";
    tdOverallAvg.dataset.extraCol = "1";
    if (!showMoreColumns) tdOverallAvg.style.display = "none";

    const allScores = [];
    for (const student of students) {
      const avg = calculateRowAverage(student.code, scoreMap, drafts);
      if (avg !== null) allScores.push(avg);
    }
    const overallAvg =
      allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : null;
    if (overallAvg !== null) {
      tdOverallAvg.textContent = `${overallAvg}%`;
      const colorClass = scoreColorClass(overallAvg);
      if (colorClass) tdOverallAvg.classList.add(colorClass);
    } else {
      tdOverallAvg.textContent = "—";
    }
    summaryRow.appendChild(tdOverallAvg);

    // Overall weighted average
    const tdOverallWeighted = document.createElement("td");
    tdOverallWeighted.setAttribute("role", "gridcell");
    tdOverallWeighted.className = "gb-score-cell";
    tdOverallWeighted.dataset.extraCol = "1";
    if (!showMoreColumns) tdOverallWeighted.style.display = "none";
    const allWeightedScores = [];
    for (const student of students) {
      const weighted = calculateWeightedAverage(student.code, scoreMap, drafts);
      if (weighted !== null) allWeightedScores.push(weighted);
    }
    const overallWeighted =
      allWeightedScores.length > 0
        ? Math.round(allWeightedScores.reduce((a, b) => a + b, 0) / allWeightedScores.length)
        : null;
    if (overallWeighted !== null) {
      tdOverallWeighted.textContent = `${overallWeighted}%`;
      const colorClass = scoreColorClass(overallWeighted);
      if (colorClass) tdOverallWeighted.classList.add(colorClass);
    } else {
      tdOverallWeighted.textContent = "—";
    }
    summaryRow.appendChild(tdOverallWeighted);

    // Empty trend cell for summary row
    const tdTrendEmpty = document.createElement("td");
    tdTrendEmpty.setAttribute("role", "gridcell");
    tdTrendEmpty.className = "gb-score-cell";
    tdTrendEmpty.dataset.extraCol = "1";
    if (!showMoreColumns) tdTrendEmpty.style.display = "none";
    tdTrendEmpty.textContent = "—";
    summaryRow.appendChild(tdTrendEmpty);

    tableBody.appendChild(summaryRow);

    // Restore focus if a cell was focused before re-render
    restoreFocusFromPos();
    } finally {
      _renderingInProgress = false;
    }
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

  // ── Export helpers ──────────────────────────────────────────────────────

  // Group drafts by title so that the same assignment assigned to multiple
  // class sections produces ONE column in the export rather than N duplicates.
  // Returns an ordered array of groups (insertion order = first occurrence).
  // Each group: { title, drafts: [...], totalPossible: number|null }
  function deduplicateAssignmentsForExport(drafts) {
    const groups = new Map(); // key = normalised title
    const order = [];        // preserve insertion order
    for (const draft of drafts) {
      const key = (draft.title || '(untitled)').trim().toLowerCase();
      if (!groups.has(key)) {
        const group = {
          title: (draft.title || '(untitled)').trim(),
          drafts: [],
          totalPossible: null
        };
        groups.set(key, group);
        order.push(group);
      }
      const group = groups.get(key);
      group.drafts.push(draft);
      if (group.totalPossible === null && draft.meta && draft.meta.total_possible) {
        group.totalPossible = draft.meta.total_possible;
      }
    }
    return order;
  }

  // Look up a student's score across every draft in a deduplicated group.
  // Returns { score, totalPossible } or null if none found.
  function getStudentScoreForGroup(studentCode, group, scoreMap) {
    const studentScores = scoreMap.get(studentCode);
    if (!studentScores) return null;
    for (const draft of group.drafts) {
      if (studentScores.has(draft.id)) {
        const score = studentScores.get(draft.id);
        if (typeof score === 'number') {
          return { score, totalPossible: group.totalPossible };
        }
      }
    }
    return null;
  }

  // Format a score result for CSV/PDF: "17/20 (85%)" or "85%" if no total.
  function formatScoreCell(result) {
    if (!result) return '—';
    const { score, totalPossible } = result;
    const pct = Math.round(score);
    if (totalPossible) {
      const earned = calculateEarnedPoints(score, totalPossible);
      return `${earned}/${totalPossible} (${pct}%)`;
    }
    return `${pct}%`;
  }

  // Convert a 1-based column number to an Excel column letter (A, B, ..., Z, AA, …)
  function colIndexToLetter(n) {
    let result = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  }

  // ── End export helpers ──────────────────────────────────────────────────

  // Export gradebook to CSV
  async function exportToCSV() {
    const data = buildGradebookData();
    if (!data) {
      await rcAlert('No Data', 'No data to export.');
      return;
    }

    const { students, drafts, scoreMap } = data;

    const rows = [];

    if (groupMode !== "individual") {
      // ── Grouped CSV export ────────────────────────────────────────────────
      const { groups, ungrouped } = groupMode === "week"
        ? buildWeekGroupsFromDrafts(drafts)
        : buildGroupsFromDrafts(drafts);
      const allDraftsFlat = [...groups.flatMap(g => g.drafts), ...ungrouped];

      // Build header: one column per group, then individual ungrouped columns
      const headers = ["Student"];
      for (const group of groups) {
        headers.push(group.displayName);
      }
      for (const draft of ungrouped) {
        const dateStr = formatShortDate(draft.dueAt || draft.due_at || draft.createdAt || draft.created_at);
        const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
        let headerLabel = draft.title || "(untitled)";
        const extras = [dateStr, totalPossible ? `${totalPossible} pts` : ""].filter(Boolean);
        if (extras.length) headerLabel += ` (${extras.join(", ")})`;
        headers.push(headerLabel);
      }
      headers.push("Average", "Weighted", "Trend");
      rows.push(headers);

      // Build data rows
      for (const student of students) {
        const row = [student.name || student.code];

        // Group columns
        for (const group of groups) {
          const groupAvg = calculateGroupAverage(student.code, scoreMap, group.drafts);
          if (groupAvg !== null) {
            const { rawEarnedSum, possibleSum } = calculateGroupRawPoints(student.code, scoreMap, group.drafts);
            if (possibleSum > 0) {
              row.push(`${groupAvg}% (${Math.round(rawEarnedSum)}/${possibleSum})`);
            } else {
              row.push(`${groupAvg}%`);
            }
          } else {
            row.push("");
          }
        }

        // Ungrouped individual columns
        const studentScores = scoreMap.get(student.code);
        for (const draft of ungrouped) {
          if (studentScores && studentScores.has(draft.id)) {
            const score = studentScores.get(draft.id);
            if (typeof score === "number") {
              const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
              if (totalPossible) {
                row.push(`${calculateEarnedPoints(score, totalPossible)}/${totalPossible}`);
              } else {
                row.push(score);
              }
            } else {
              row.push("");
            }
          } else {
            row.push("");
          }
        }

        const avg = calculateRowAverage(student.code, scoreMap, allDraftsFlat);
        row.push(avg !== null ? avg : "");
        const weighted = calculateWeightedAverage(student.code, scoreMap, allDraftsFlat);
        row.push(weighted !== null ? weighted : "");
        const trend = calculateTrend(student.code, scoreMap, allDraftsFlat);
        row.push(trend || "");

        rows.push(row);
      }

      // Summary row
      const summaryRow = ["Class Average"];
      for (const group of groups) {
        const groupScores = [];
        for (const student of students) {
          const ga = calculateGroupAverage(student.code, scoreMap, group.drafts);
          if (ga !== null) groupScores.push(ga);
        }
        summaryRow.push(groupScores.length > 0
          ? Math.round(groupScores.reduce((a, b) => a + b, 0) / groupScores.length)
          : "");
      }
      for (const draft of ungrouped) {
        const avg = calculateColumnAverage(draft.id, scoreMap, students);
        summaryRow.push(avg !== null ? avg : "");
      }
      const allScores = [];
      const allWeightedScores = [];
      for (const student of students) {
        const avg = calculateRowAverage(student.code, scoreMap, allDraftsFlat);
        if (avg !== null) allScores.push(avg);
        const weighted = calculateWeightedAverage(student.code, scoreMap, allDraftsFlat);
        if (weighted !== null) allWeightedScores.push(weighted);
      }
      summaryRow.push(
        allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : "",
        allWeightedScores.length > 0 ? Math.round(allWeightedScores.reduce((a, b) => a + b, 0) / allWeightedScores.length) : "",
        "—"
      );
      rows.push(summaryRow);
    } else {
      // ── Individual (flat) CSV export ──────────────────────────────────────
      // Deduplicate: collapse multiple drafts with the same title into one column
      const dedupGroups = deduplicateAssignmentsForExport(drafts);

      // Build CSV header: one column per unique assignment title
      const headers = ["Student Code"];
      for (const group of dedupGroups) {
        let headerLabel = group.title;
        if (group.totalPossible) headerLabel += ` (${group.totalPossible} pts)`;
        headers.push(headerLabel);
      }
      headers.push("Average", "Weighted", "Trend");
      rows.push(headers);

      // Build data rows
      for (const student of students) {
        const row = [student.name || student.code];

        for (const group of dedupGroups) {
          const result = getStudentScoreForGroup(student.code, group, scoreMap);
          row.push(result ? formatScoreCell(result) : "—");
        }

        const avg = calculateRowAverage(student.code, scoreMap, drafts);
        row.push(avg !== null ? `${avg}%` : "");
        const weighted = calculateWeightedAverage(student.code, scoreMap, drafts);
        row.push(weighted !== null ? `${weighted}%` : "");
        const trend = calculateTrend(student.code, scoreMap, drafts);
        row.push(trend || "");

        rows.push(row);
      }

      // Add summary row
      const summaryRow = ["Class Average"];
      for (const group of dedupGroups) {
        const groupScores = [];
        for (const student of students) {
          const result = getStudentScoreForGroup(student.code, group, scoreMap);
          if (result) groupScores.push(result.score);
        }
        summaryRow.push(groupScores.length > 0
          ? `${Math.round(groupScores.reduce((a, b) => a + b, 0) / groupScores.length)}%`
          : "");
      }
      const allScores = [];
      const allWeightedScores = [];
      for (const student of students) {
        const avg = calculateRowAverage(student.code, scoreMap, drafts);
        if (avg !== null) allScores.push(avg);
        const weighted = calculateWeightedAverage(student.code, scoreMap, drafts);
        if (weighted !== null) allWeightedScores.push(weighted);
      }
      const overallAvg =
        allScores.length > 0
          ? `${Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)}%`
          : "";
      const overallWeighted =
        allWeightedScores.length > 0
          ? `${Math.round(allWeightedScores.reduce((a, b) => a + b, 0) / allWeightedScores.length)}%`
          : "";
      summaryRow.push(overallAvg, overallWeighted, "—");
      rows.push(summaryRow);
    }

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

  // Export gradebook to CSV with a built-in VLOOKUP lookup table for name resolution.
  // The exported file has:
  //   Col A : Student Code
  //   Col B : Real Name  (VLOOKUP formula referencing the lookup table)
  //   Cols C–…: deduplicated assignment scores as "earned/possible (pct%)"
  //   … : Average, Weighted, Trend
  //   (blank separator column)
  //   Lookup Code col : Student Code header + 200 empty rows
  //   Lookup Name col : Student Name header + 200 empty rows
  // Paste your roster into the lookup table columns to resolve names instantly.
  async function exportToCSVVLOOKUP() {
    const data = buildGradebookData();
    if (!data) {
      await rcAlert('No Data', 'No data to export.');
      return;
    }

    const { students, drafts, scoreMap } = data;

    // Deduplicate assignments by title
    const dedupGroups = deduplicateAssignmentsForExport(drafts);

    // Column layout (1-based):
    //  1 = Student Code
    //  2 = Real Name (VLOOKUP)
    //  3 … 2+N = Assignment scores  (N = dedupGroups.length)
    //  3+N = Average
    //  3+N+1 = Weighted
    //  3+N+2 = Trend
    //  3+N+3 = (blank separator)
    //  3+N+4 = Lookup Code
    //  3+N+5 = Lookup Name
    const N = dedupGroups.length;
    const LOOKUP_CODE_COL = 3 + N + 3 + 1; // 1-based
    const LOOKUP_NAME_COL = LOOKUP_CODE_COL + 1;
    const LOOKUP_ROWS = Math.max(200, students.length + 50); // cover all students + future growth

    const lookupCodeLetter = colIndexToLetter(LOOKUP_CODE_COL);
    const lookupNameLetter = colIndexToLetter(LOOKUP_NAME_COL);
    // Lookup range covers header row + LOOKUP_ROWS data rows (rows 2 to LOOKUP_ROWS+1)
    const lookupRange = `$${lookupCodeLetter}$2:$${lookupNameLetter}$${LOOKUP_ROWS + 1}`;

    const rows = [];

    // Header row
    const headers = ['Student Code', 'Real Name (VLOOKUP)'];
    for (const group of dedupGroups) {
      let headerLabel = group.title;
      if (group.totalPossible) headerLabel += ` (${group.totalPossible} pts)`;
      headers.push(headerLabel);
    }
    headers.push('Average', 'Weighted', 'Trend');
    headers.push(''); // blank separator
    headers.push('Student Code', 'Student Name');
    rows.push(headers);

    // Data rows
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const excelRow = i + 2; // row 1 is header, data starts at row 2
      const codeCell = `A${excelRow}`;
      const vlookupFormula = `=VLOOKUP(${codeCell},${lookupRange},2,FALSE)`;

      const row = [student.code, vlookupFormula];

      for (const group of dedupGroups) {
        const result = getStudentScoreForGroup(student.code, group, scoreMap);
        row.push(result ? formatScoreCell(result) : '—');
      }

      const avg = calculateRowAverage(student.code, scoreMap, drafts);
      row.push(avg !== null ? `${avg}%` : '');
      const weighted = calculateWeightedAverage(student.code, scoreMap, drafts);
      row.push(weighted !== null ? `${weighted}%` : '');
      const trend = calculateTrend(student.code, scoreMap, drafts);
      row.push(trend || '');

      row.push(''); // blank separator; lookup table columns left empty for rows after header
      rows.push(row);
    }

    // Fill remaining lookup table rows (blank) up to LOOKUP_ROWS total data rows
    const dataRowsFilled = students.length;
    for (let r = dataRowsFilled; r < LOOKUP_ROWS; r++) {
      // Only need the blank separator at minimum so CSV columns align
      rows.push(Array(headers.length).fill(''));
    }

    // Convert to CSV
    const csvContent = rows
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(',')
      )
      .join('\n');

    const safeClassName = currentClassFilter.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
    download(`gradebook-vlookup-${safeClassName}-${nowISO()}.csv`, csvContent);
  }

  async function exportToPDF() {
    // PDF layout constants
    const PDF_LANDSCAPE_USABLE_WIDTH = 280; // mm for A4 landscape
    const PDF_MAX_PAGE_HEIGHT = 190; // mm before overflow on single page
    
    const data = buildGradebookData();
    if (!data) {
      await rcAlert('No Data', 'No data to export.');
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
      const tableData = [];

      if (groupMode !== "individual") {
        // ── Grouped PDF export ──────────────────────────────────────────────
        const { groups, ungrouped } = groupMode === "week"
          ? buildWeekGroupsFromDrafts(drafts)
          : buildGroupsFromDrafts(drafts);
        const allDraftsFlat = [...groups.flatMap(g => g.drafts), ...ungrouped];

        // One column per group, then individual ungrouped columns
        for (const group of groups) {
          headers.push(group.displayName);
        }
        for (const draft of ungrouped) {
          const dateStr = formatShortDate(draft.dueAt || draft.due_at || draft.createdAt || draft.created_at);
          const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
          let label = (draft.title || "(untitled)").substring(0, 20);
          if (dateStr) label += ` ${dateStr}`;
          if (totalPossible) label += ` ${totalPossible}pt`;
          headers.push(label);
        }
        headers.push("Avg", "Wtd", "Trend");

        for (const student of students) {
          const row = [student.name || student.code];

          // Group columns
          for (const group of groups) {
            const groupAvg = calculateGroupAverage(student.code, scoreMap, group.drafts);
            if (groupAvg !== null) {
              const { rawEarnedSum, possibleSum } = calculateGroupRawPoints(student.code, scoreMap, group.drafts);
              if (possibleSum > 0) {
                row.push(`${groupAvg}% (${Math.round(rawEarnedSum)}/${possibleSum})`);
              } else {
                row.push(`${groupAvg}%`);
              }
            } else {
              row.push("—");
            }
          }

          // Ungrouped individual columns
          const studentScores = scoreMap.get(student.code);
          for (const draft of ungrouped) {
            if (studentScores && studentScores.has(draft.id)) {
              const score = studentScores.get(draft.id);
              if (typeof score === "number") {
                const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
                if (totalPossible) {
                  row.push(`${calculateEarnedPoints(score, totalPossible)}/${totalPossible}`);
                } else {
                  row.push(`${score}%`);
                }
              } else {
                row.push("—");
              }
            } else {
              row.push("—");
            }
          }

          const avg = calculateRowAverage(student.code, scoreMap, allDraftsFlat);
          row.push(avg !== null ? `${avg}%` : "—");
          const weighted = calculateWeightedAverage(student.code, scoreMap, allDraftsFlat);
          row.push(weighted !== null ? `${weighted}%` : "—");
          const trend = calculateTrend(student.code, scoreMap, allDraftsFlat);
          row.push(trend || "—");

          tableData.push(row);
        }

        // Summary row
        const summaryRow = ["Class Avg"];
        for (const group of groups) {
          const groupScores = [];
          for (const student of students) {
            const ga = calculateGroupAverage(student.code, scoreMap, group.drafts);
            if (ga !== null) groupScores.push(ga);
          }
          summaryRow.push(groupScores.length > 0
            ? `${Math.round(groupScores.reduce((a, b) => a + b, 0) / groupScores.length)}%`
            : "—");
        }
        for (const draft of ungrouped) {
          const avg = calculateColumnAverage(draft.id, scoreMap, students);
          summaryRow.push(avg !== null ? `${avg}%` : "—");
        }
        const allScores = [];
        const allWeightedScores = [];
        for (const student of students) {
          const avg = calculateRowAverage(student.code, scoreMap, allDraftsFlat);
          if (avg !== null) allScores.push(avg);
          const weighted = calculateWeightedAverage(student.code, scoreMap, allDraftsFlat);
          if (weighted !== null) allWeightedScores.push(weighted);
        }
        const overallAvg = allScores.length > 0
          ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
          : null;
        const overallWeighted = allWeightedScores.length > 0
          ? Math.round(allWeightedScores.reduce((a, b) => a + b, 0) / allWeightedScores.length)
          : null;
        summaryRow.push(overallAvg !== null ? `${overallAvg}%` : "—");
        summaryRow.push(overallWeighted !== null ? `${overallWeighted}%` : "—");
        summaryRow.push("—");
        tableData.push(summaryRow);
      } else {
        // ── Individual (flat) PDF export ────────────────────────────────────
        // Deduplicate: collapse same-titled drafts into one column
        const dedupGroups = deduplicateAssignmentsForExport(drafts);
        for (const group of dedupGroups) {
          let label = group.title.substring(0, 20);
          if (group.totalPossible) label += ` (${group.totalPossible}pt)`;
          headers.push(label);
        }
        headers.push("Avg", "Wtd", "Trend");

        for (const student of students) {
          const row = [student.name || student.code];

          for (const group of dedupGroups) {
            const result = getStudentScoreForGroup(student.code, group, scoreMap);
            row.push(result ? formatScoreCell(result) : "—");
          }

          const avg = calculateRowAverage(student.code, scoreMap, drafts);
          row.push(avg !== null ? `${avg}%` : "—");
          const weighted = calculateWeightedAverage(student.code, scoreMap, drafts);
          row.push(weighted !== null ? `${weighted}%` : "—");
          const trend = calculateTrend(student.code, scoreMap, drafts);
          row.push(trend || "—");

          tableData.push(row);
        }

        // Add summary row
        const summaryRow = ["Class Avg"];
        for (const group of dedupGroups) {
          const groupScores = [];
          for (const student of students) {
            const result = getStudentScoreForGroup(student.code, group, scoreMap);
            if (result) groupScores.push(result.score);
          }
          summaryRow.push(groupScores.length > 0
            ? `${Math.round(groupScores.reduce((a, b) => a + b, 0) / groupScores.length)}%`
            : "—");
        }
        const allScores = [];
        const allWeightedScores = [];
        for (const student of students) {
          const avg = calculateRowAverage(student.code, scoreMap, drafts);
          if (avg !== null) allScores.push(avg);
          const weighted = calculateWeightedAverage(student.code, scoreMap, drafts);
          if (weighted !== null) allWeightedScores.push(weighted);
        }
        const overallAvg = allScores.length > 0
          ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
          : null;
        const overallWeighted = allWeightedScores.length > 0
          ? Math.round(allWeightedScores.reduce((a, b) => a + b, 0) / allWeightedScores.length)
          : null;
        summaryRow.push(overallAvg !== null ? `${overallAvg}%` : "—");
        summaryRow.push(overallWeighted !== null ? `${overallWeighted}%` : "—");
        summaryRow.push("—");
        tableData.push(summaryRow);
      }
      
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
      if (await rcConfirm('PDF Library Not Available', 'jsPDF library not available. Would you like to use the browser Print dialog instead? (You can save as PDF from there)', 'Use Print Dialog')) {
        window.print();
      } else {
        await rcAlert('PDF Not Available', 'PDF export requires the jsPDF library. Please use the Export CSV button or try printing the page.');
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
      
      console.log('[gradebook] Setting up realtime subscription for submissions, assignment_instances, assignments');
      
      // Subscribe to submissions, assignment_instances, and assignments table changes
      realtimeChannel = supabase
        .channel('gradebook_changes')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'submissions' },
          handleRealtimeChange
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'submissions' },
          handleRealtimeChange
        )
        .on('postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'submissions' },
          handleRealtimeChange
        )
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'assignment_instances' },
          handleRealtimeChange
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'assignment_instances' },
          handleRealtimeChange
        )
        .on('postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'assignment_instances' },
          handleRealtimeChange
        )
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'assignments' },
          handleRealtimeChange
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'assignments' },
          handleRealtimeChange
        )
        .on('postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'assignments' },
          handleRealtimeChange
        )
        .subscribe((status) => {
          console.log('[gradebook] Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('[gradebook] Realtime subscription active');
            realtimeRetryCount = 0;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            handleRealtimeConnectionError();
          }
        });
    } catch (err) {
      console.warn('[gradebook] Error setting up realtime subscription:', err);
    }
  }
  
  // Handle realtime connection errors with retry logic
  function handleRealtimeConnectionError() {
    if (realtimeRetryCount >= REALTIME_MAX_RETRIES) {
      console.warn('[gradebook] Realtime: max retries reached, giving up');
      const iconEl = $("gbSyncIcon");
      const textEl = $("gbSyncText");
      if (iconEl && textEl) {
        iconEl.textContent = "🔴";
        textEl.textContent = "Connection lost";
      }
      return;
    }
    
    realtimeRetryCount++;
    console.log(`[gradebook] Realtime: connection error, retry ${realtimeRetryCount}/${REALTIME_MAX_RETRIES} in ${REALTIME_RETRY_DELAY_MS}ms`);
    
    const iconEl = $("gbSyncIcon");
    const textEl = $("gbSyncText");
    if (iconEl && textEl) {
      iconEl.textContent = "🔴";
      textEl.textContent = "Reconnecting...";
    }
    
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
    
    realtimeRetryTimer = setTimeout(() => {
      realtimeRetryTimer = null;
      setupRealtimeSubscription();
    }, REALTIME_RETRY_DELAY_MS);
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
        // Refresh missing work panel if it's currently visible
        const missingPanel = $("gbMissingWorkPanel");
        if (missingPanel && missingPanel.style.display !== "none") {
          renderMissingWork();
        }
        // Briefly flash "🔄 Updated" then revert to "🟢 Synced with Supabase"
        const iconEl = $("gbSyncIcon");
        const textEl = $("gbSyncText");
        if (iconEl && textEl) {
          clearTimeout(realtimeFlashTimer);
          iconEl.textContent = "🔄";
          textEl.textContent = "Updated";
          realtimeFlashTimer = setTimeout(() => {
            realtimeFlashTimer = null;
            iconEl.textContent = "🟢";
            textEl.textContent = "Synced with Supabase";
          }, 2000);
        }
      } catch (err) {
        console.error('[gradebook] Error refreshing after realtime change:', err);
      }
    }, REALTIME_DEBOUNCE_MS);
  }
  
  // Cleanup realtime subscription on page unload
  function cleanupRealtime() {
    if (realtimeFlashTimer) {
      clearTimeout(realtimeFlashTimer);
      realtimeFlashTimer = null;
    }
    if (realtimeRetryTimer) {
      clearTimeout(realtimeRetryTimer);
      realtimeRetryTimer = null;
    }
    if (realtimeDebounceTimer) {
      clearTimeout(realtimeDebounceTimer);
      realtimeDebounceTimer = null;
    }
    realtimeRetryCount = 0;
    if (realtimeChannel) {
      console.log('[gradebook] Cleaning up realtime subscription');
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
  }

  /**
   * Get category weights from localStorage or defaults
   */
  function getCategoryWeights() {
    const defaults = {
      assignment: 1.0,
      quiz: 1.5,
      test: 2.0,
      project: 2.0
    };
    
    try {
      const stored = localStorage.getItem('rc_gradebook_weights');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate each weight: must be a finite number >= 0; fall back to default if invalid
        const validated = { ...defaults };
        for (const [key, val] of Object.entries(parsed)) {
          if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
            validated[key] = val;
          }
        }
        return validated;
      }
    } catch (e) {
      console.warn('[gradebook] Error loading weights:', e);
    }
    
    return defaults;
  }

  /**
   * Save category weights to localStorage
   */
  function saveCategoryWeights(weights) {
    try {
      localStorage.setItem('rc_gradebook_weights', JSON.stringify(weights));
    } catch (e) {
      console.error('[gradebook] Error saving weights:', e);
    }
  }

  /**
   * Get assignment category (default to 'assignment')
   */
  function getAssignmentCategory(draft) {
    if (!draft || typeof draft !== 'object') return 'assignment';
    const type = draft.type;
    if (typeof type !== 'string' || !type.trim()) return 'assignment';
    return type.toLowerCase();
  }

  /**
   * Calculate weighted average for a student
   */
  function calculateWeightedAverage(studentCode, scoreMap, drafts) {
    const studentScores = scoreMap.get(studentCode);
    if (!studentScores) return null;

    const weights = getCategoryWeights();
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const draft of drafts) {
      if (studentScores.has(draft.id)) {
        const score = studentScores.get(draft.id);
        if (typeof score === "number") {
          const category = getAssignmentCategory(draft);
          const weight = weights[category] || 1.0;
          totalWeightedScore += score * weight;
          totalWeight += weight;
        }
      }
    }

    if (totalWeight === 0) return null;
    return Math.round(totalWeightedScore / totalWeight);
  }

  /**
   * Calculate trend for a student (up/down/flat)
   */
  function calculateTrend(studentCode, scoreMap, drafts) {
    const MIN_SCORES_FOR_TREND = 3;
    const RECENT_SCORES_COUNT = 3;
    const COMPARISON_WINDOW_SIZE = 6;
    const TREND_THRESHOLD_PERCENT = 3;

    const studentScores = scoreMap.get(studentCode);
    if (!studentScores) return 'flat';

    const scores = [];
    for (const draft of drafts) {
      if (studentScores.has(draft.id)) {
        const score = studentScores.get(draft.id);
        if (typeof score === "number") {
          scores.push(score);
        }
      }
    }

    if (scores.length < MIN_SCORES_FOR_TREND) return 'flat';

    const recent = scores.slice(-RECENT_SCORES_COUNT);
    const earlier = scores.slice(-COMPARISON_WINDOW_SIZE, -RECENT_SCORES_COUNT);
    
    if (earlier.length === 0) return 'flat';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    const diff = recentAvg - earlierAvg;

    if (diff > TREND_THRESHOLD_PERCENT) return 'up';
    if (diff < -TREND_THRESHOLD_PERCENT) return 'down';
    return 'flat';
  }

  /**
   * Render score distribution analytics
   */
  function renderAnalytics() {
    const data = buildGradebookData();
    const contentEl = $("gbAnalyticsContent");
    
    if (!data || !contentEl) return;

    const { students, drafts, scoreMap } = data;

    // SAFETY: static markup, no user data
    if (drafts.length === 0) {
      contentEl.innerHTML = '<div style="opacity: 0.7; text-align: center; padding: 20px;">No assignments to analyze</div>';
      return;
    }

    // Clear container safely
    while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);

    for (const draft of drafts) {
      const scores = [];
      for (const student of students) {
        const studentScores = scoreMap.get(student.code);
        if (studentScores && studentScores.has(draft.id)) {
          const score = studentScores.get(draft.id);
          if (typeof score === "number") {
            scores.push(score);
          }
        }
      }

      if (scores.length === 0) continue;

      // Calculate statistics
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const sorted = [...scores].sort((a, b) => a - b);
      const median = sorted.length % 2 === 0 
        ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
        : sorted[Math.floor(sorted.length / 2)];
      const min = Math.min(...scores);
      const max = Math.max(...scores);

      // Calculate distribution bins
      const bins = [0, 0, 0, 0, 0]; // 0-59, 60-69, 70-79, 80-89, 90-100
      const colors = ['#ef4444', '#f59e0b', '#eab308', '#84cc16', '#22c55e'];
      const labels = ['0-59%', '60-69%', '70-79%', '80-89%', '90-100%'];

      for (const s of scores) {
        if (s < 60) bins[0]++;
        else if (s < 70) bins[1]++;
        else if (s < 80) bins[2]++;
        else if (s < 90) bins[3]++;
        else bins[4]++;
      }

      const maxBin = Math.max(...bins, 1);

      // Build assignment analytics block using safe DOM construction
      const assignmentDiv = document.createElement("div");
      assignmentDiv.className = "gb-analytics-assignment";

      const titleDiv = document.createElement("div");
      titleDiv.className = "gb-analytics-title";
      titleDiv.textContent = draft.title || "(untitled)";
      assignmentDiv.appendChild(titleDiv);

      const statsDiv = document.createElement("div");
      statsDiv.className = "gb-analytics-stats";

      const statDefs = [
        { label: "Avg:", value: `${avg}%` },
        { label: "Median:", value: `${median}%` },
        { label: "Min:", value: `${min}%` },
        { label: "Max:", value: `${max}%` },
        { label: "n:", value: `${scores.length}` }
      ];
      for (const def of statDefs) {
        const statDiv = document.createElement("div");
        statDiv.className = "gb-analytics-stat";
        const labelSpan = document.createElement("span");
        labelSpan.style.opacity = "0.7";
        labelSpan.textContent = def.label;
        const valSpan = document.createElement("span");
        valSpan.textContent = def.value;
        statDiv.appendChild(labelSpan);
        statDiv.appendChild(valSpan);
        statsDiv.appendChild(statDiv);
      }
      assignmentDiv.appendChild(statsDiv);

      const chartDiv = document.createElement("div");
      chartDiv.className = "gb-distribution-chart";

      for (let i = 0; i < bins.length; i++) {
        const width = maxBin > 0 ? (bins[i] / maxBin) * 100 : 0;
        const barDiv = document.createElement("div");
        barDiv.className = "gb-distribution-bar";

        const labelDiv = document.createElement("div");
        labelDiv.className = "gb-distribution-label";
        labelDiv.textContent = labels[i]; // static strings defined above (e.g. '0-59%'), no user data

        const bgDiv = document.createElement("div");
        bgDiv.className = "gb-distribution-bar-bg";

        const fillDiv = document.createElement("div");
        fillDiv.className = "gb-distribution-bar-fill";
        fillDiv.style.width = `${width}%`;
        fillDiv.style.backgroundColor = colors[i]; // static hex strings defined above, no user data
        fillDiv.textContent = bins[i] > 0 ? String(bins[i]) : "";

        bgDiv.appendChild(fillDiv);
        barDiv.appendChild(labelDiv);
        barDiv.appendChild(bgDiv);
        chartDiv.appendChild(barDiv);
      }

      assignmentDiv.appendChild(chartDiv);
      contentEl.appendChild(assignmentDiv);
    }
  }

  /**
   * Render missing work tracker
   */
  function renderMissingWork() {
    const contentEl = $("gbMissingWorkContent");
    const badgeEl = $("gbMissingWorkBadge");
    
    if (!contentEl || !badgeEl) return;

    const now = new Date();
    const missing = [];

    // Find overdue assignments
    for (const instance of assignmentInstancesData) {
      if (!instance.due_at) continue;
      
      const dueDate = new Date(instance.due_at);
      if (dueDate >= now) continue; // Not overdue yet

      // Check if student has submitted
      const submission = submissionsData.find(s => s.assignment_instance_id === instance.id);
      if (submission) continue; // Already submitted

      const student = studentsData.find(s => s.code === instance.student_code);
      const draft = draftsData.find(d => d.id === instance.assignment_id);

      const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

      missing.push({
        studentCode: student?.code || instance.student_code,
        studentName: student?.name || instance.student_code,
        draftId: instance.assignment_id,
        assignmentTitle: draft?.title || 'Assignment',
        dueDate: dueDate,
        daysOverdue: daysOverdue
      });
    }

    // Update badge
    badgeEl.textContent = `${missing.length} missing`;

    // Populate missingWorkPairs for highlight/filter
    missingWorkPairs.clear();
    for (const item of missing) {
      missingWorkPairs.add(`${item.studentCode}::${item.draftId}`);
    }
    // Re-render to apply highlights (only meaningful when panel is open)
    if (missingWorkPairs.size > 0 || showOnlyMissingStudents) {
      renderGradebook();
    }

    if (missing.length === 0) {
      // SAFETY: static markup, no user data
      contentEl.innerHTML = '<div style="opacity: 0.7; text-align: center; padding: 20px;">✅ No missing work!</div>';
      badgeEl.style.background = 'rgba(34,197,94,.15)';
      badgeEl.style.borderColor = 'rgba(34,197,94,.4)';
      return;
    }

    badgeEl.style.background = 'rgba(239,68,68,.15)';
    badgeEl.style.borderColor = 'rgba(239,68,68,.4)';

    // Sort by days overdue (most overdue first)
    missing.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Build table using safe DOM construction (student names/titles are user data)
    const table = document.createElement("table");
    table.className = "gb-missing-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const heading of ["Student Code", "Student Name", "Assignment", "Due Date", "Days Overdue"]) {
      const th = document.createElement("th");
      th.textContent = heading;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const item of missing) {
      const tr = document.createElement("tr");

      const tdCode = document.createElement("td");
      tdCode.textContent = item.studentCode;
      tr.appendChild(tdCode);

      const tdName = document.createElement("td");
      tdName.textContent = item.studentName;
      tr.appendChild(tdName);

      const tdTitle = document.createElement("td");
      tdTitle.textContent = item.assignmentTitle;
      tr.appendChild(tdTitle);

      const tdDue = document.createElement("td");
      tdDue.textContent = item.dueDate.toLocaleDateString();
      tr.appendChild(tdDue);

      const tdOverdue = document.createElement("td");
      tdOverdue.className = "gb-days-overdue";
      tdOverdue.textContent = `${item.daysOverdue} day${item.daysOverdue !== 1 ? 's' : ''}`;
      tr.appendChild(tdOverdue);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // Replace container contents with the safe table
    while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);

    const filterLabel = document.createElement("label");
    filterLabel.className = "gb-missing-filter-label";
    const filterCheckbox = document.createElement("input");
    filterCheckbox.type = "checkbox";
    filterCheckbox.checked = showOnlyMissingStudents;
    filterCheckbox.addEventListener("change", () => {
      showOnlyMissingStudents = filterCheckbox.checked;
      renderGradebook();
      announceA11y(showOnlyMissingStudents
        ? "Showing only students with missing work"
        : "Showing all students");
    });
    filterLabel.appendChild(filterCheckbox);
    filterLabel.appendChild(document.createTextNode("Show only students with missing work"));
    contentEl.appendChild(filterLabel);

    contentEl.appendChild(table);
  }

  /**
   * Toggle analytics panel visibility
   */
  function toggleAnalytics() {
    const panel = $("gbAnalyticsPanel");
    const btn = $("btnToggleAnalytics");
    
    if (!panel || !btn) return;

    if (panel.style.display === "none") {
      panel.style.display = "block";
      btn.classList.add("primary");
      renderAnalytics();
    } else {
      panel.style.display = "none";
      btn.classList.remove("primary");
    }
  }

  /**
   * Toggle missing work panel visibility
   */
  function toggleMissingWork() {
    const panel = $("gbMissingWorkPanel");
    const btn = $("btnToggleMissing");
    
    if (!panel || !btn) return;

    if (panel.style.display === "none") {
      panel.style.display = "block";
      btn.classList.add("primary");
      renderMissingWork();
    } else {
      panel.style.display = "none";
      btn.classList.remove("primary");
      missingWorkPairs.clear();
      showOnlyMissingStudents = false;
      renderGradebook();
    }
  }

  /**
   * Validate manual assignment form inputs.
   * Returns { valid: true, data: {...} } or { valid: false, error: string }.
   */
  function validateManualAssignmentInputs({ title, studentCodes, total, score, date, category }) {
    if (!title || !title.trim()) return { valid: false, error: 'Assignment Title is required.' };
    if (!studentCodes || studentCodes.length === 0) return { valid: false, error: 'At least one Student Code is required.' };
    const totalNum = Number(total);
    if (!total && total !== 0) return { valid: false, error: 'Total Possible Points is required.' };
    if (!Number.isFinite(totalNum) || totalNum < 1) return { valid: false, error: 'Total Possible Points must be a number ≥ 1.' };
    const scoreNum = Number(score);
    if (score === '' || score === null || score === undefined) return { valid: false, error: 'Score Earned is required.' };
    if (!Number.isFinite(scoreNum) || scoreNum < 0) return { valid: false, error: 'Score Earned must be a number ≥ 0.' };
    if (scoreNum > totalNum) return { valid: false, error: 'Score Earned cannot exceed Total Possible Points.' };
    if (!date) return { valid: false, error: 'Date is required.' };
    return {
      valid: true,
      data: {
        title: title.trim(),
        studentCodes,
        total: totalNum,
        score: scoreNum,
        percent: Math.round((scoreNum / totalNum) * 100),
        date,
        category: category || 'assignment'
      }
    };
  }

  /**
   * Open the "Add Manual Assignment" modal.
   * Allows teachers to record a grade for a non-digital / paper / verbal assignment
   * directly into the gradebook without uploading a file.
   */
  async function openManualAssignmentModal() {
    const todayStr = new Date().toISOString().split('T')[0];

    // Remove any existing overlay
    const existing = document.getElementById('manualAssignmentOverlay');
    if (existing) existing.remove();

    // Overlay backdrop
    const overlay = document.createElement('div');
    overlay.id = 'manualAssignmentOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'manualAssignmentTitle');
    overlay.style.cssText = [
      'position: fixed',
      'top: 0', 'left: 0', 'right: 0', 'bottom: 0',
      'background: rgba(0,0,0,.82)',
      'backdrop-filter: blur(4px)',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'z-index: 10000',
      'padding: 24px'
    ].join(';');

    // Card
    const card = document.createElement('div');
    card.className = 'tc-card';
    card.style.cssText = 'max-width: 560px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px;';

    // Header row
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;';

    const titleEl = document.createElement('h2');
    titleEl.id = 'manualAssignmentTitle';
    titleEl.style.margin = '0';
    titleEl.textContent = '✏️ Add Manual Assignment';
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.style.cssText = 'background: none; border: none; font-size: 1.4rem; cursor: pointer; color: inherit; padding: 4px 8px;';
    closeBtn.textContent = '✕';
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Helper: create a labeled field wrapper
    function makeField(labelText, required, inputEl, hintText) {
      const wrap = document.createElement('div');
      wrap.style.marginBottom = '14px';
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display: block; font-weight: 600; margin-bottom: 4px;';
      lbl.textContent = labelText;
      if (required) {
        const req = document.createElement('span');
        req.textContent = ' *';
        req.style.color = '#e74c3c';
        lbl.appendChild(req);
      }
      inputEl.style.cssText = 'width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.07); color: inherit; font-size: 0.95rem;';
      wrap.appendChild(lbl);
      wrap.appendChild(inputEl);
      if (hintText) {
        const hint = document.createElement('small');
        hint.style.cssText = 'display: block; margin-top: 3px; opacity: 0.65;';
        hint.textContent = hintText;
        wrap.appendChild(hint);
      }
      return wrap;
    }

    // Form
    const form = document.createElement('form');
    form.id = 'manualAssignmentForm';

    // Assignment Title
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'ma_title';
    titleInput.placeholder = 'e.g., Verbal Quiz — Chapter 5';
    titleInput.required = true;
    form.appendChild(makeField('Assignment Title', true, titleInput));

    // Class (pre-filled from current filter)
    const classInput = document.createElement('input');
    classInput.type = 'text';
    classInput.id = 'ma_class';
    classInput.value = currentClassFilter !== 'All Classes' ? currentClassFilter : '';
    classInput.placeholder = 'e.g., Period 1';
    form.appendChild(makeField('Class', false, classInput, 'Used to tag the assignment (optional if entering per-student).'));

    // Student Code(s)
    const studentCodesInput = document.createElement('input');
    studentCodesInput.type = 'text';
    studentCodesInput.id = 'ma_student_codes';
    studentCodesInput.placeholder = 'e.g., ABC123 or ABC123, DEF456';
    studentCodesInput.required = true;
    form.appendChild(makeField('Student Code(s)', true, studentCodesInput, 'Comma-separated codes from the class roster.'));

    // Score row (score + total side by side)
    const scoreRow = document.createElement('div');
    scoreRow.style.cssText = 'display: flex; gap: 12px;';

    const scoreInput = document.createElement('input');
    scoreInput.type = 'number';
    scoreInput.id = 'ma_score';
    scoreInput.min = '0';
    scoreInput.step = 'any';
    scoreInput.placeholder = '0';
    scoreInput.required = true;
    const scoreWrap = makeField('Score Earned', true, scoreInput);
    scoreWrap.style.flex = '1';
    scoreRow.appendChild(scoreWrap);

    const totalInput = document.createElement('input');
    totalInput.type = 'number';
    totalInput.id = 'ma_total';
    totalInput.min = '1';
    totalInput.step = 'any';
    totalInput.placeholder = '100';
    totalInput.required = true;
    const totalWrap = makeField('Total Possible', true, totalInput);
    totalWrap.style.flex = '1';
    scoreRow.appendChild(totalWrap);

    form.appendChild(scoreRow);

    // Date
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'ma_date';
    dateInput.value = todayStr;
    dateInput.required = true;
    form.appendChild(makeField('Date', true, dateInput));

    // Category
    const categorySelect = document.createElement('select');
    categorySelect.id = 'ma_category';
    [
      ['assignment', 'Assignment (×1.0)'],
      ['homework', 'Homework (×1.0)'],
      ['classwork', 'Classwork (×1.0)'],
      ['quiz', 'Quiz (×1.5)'],
      ['test', 'Test (×2.0)'],
      ['project', 'Project (×2.0)'],
      ['participation', 'Participation (×1.0)']
    ].forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      categorySelect.appendChild(opt);
    });
    form.appendChild(makeField('Category', false, categorySelect));

    // Notes
    const notesInput = document.createElement('textarea');
    notesInput.id = 'ma_notes';
    notesInput.rows = 3;
    notesInput.placeholder = 'Optional teacher notes about this assignment…';
    notesInput.style.resize = 'vertical';
    form.appendChild(makeField('Notes', false, notesInput));

    // Error display
    const errorEl = document.createElement('div');
    errorEl.id = 'ma_error';
    errorEl.setAttribute('role', 'alert');
    errorEl.style.cssText = 'display: none; color: #e74c3c; background: rgba(231,76,60,.12); border: 1px solid rgba(231,76,60,.4); border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 0.92rem;';
    form.appendChild(errorEl);

    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'gb-btn primary';
    submitBtn.style.cssText = 'width: 100%; padding: 12px; font-size: 1rem; font-weight: 700;';
    submitBtn.textContent = '✅ Save Grade';
    form.appendChild(submitBtn);

    card.appendChild(form);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Close handlers
    function closeModal() {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    }
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    // Keyboard handling (Escape + Tab trap)
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = Array.from(
          card.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter(el => !el.disabled);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);

    // Form submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Hide previous error
      errorEl.style.display = 'none';
      errorEl.textContent = '';

      const rawCodes = studentCodesInput.value.trim();
      const studentCodes = rawCodes
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);

      const validation = validateManualAssignmentInputs({
        title: titleInput.value,
        studentCodes,
        total: totalInput.value,
        score: scoreInput.value,
        date: dateInput.value,
        category: categorySelect.value
      });

      if (!validation.valid) {
        errorEl.textContent = validation.error;
        errorEl.style.display = 'block';
        return;
      }

      const { title, total, score, percent, date, category } = validation.data;
      const notes = notesInput.value.trim();
      const classLabel = classInput.value.trim();

      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Saving…';

      let savedCount = 0;
      const errors = [];

      for (const studentCode of studentCodes) {
        try {
          // Build a stable assignment ID for this manual entry (crypto.randomUUID when available)
          const uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()
            : (Date.now().toString(36) + Math.random().toString(36).slice(2, 9)).toUpperCase();
          const assignmentId = 'MANUAL_' + uid;

          if (usingSupabase) {
            // Supabase path
            await db.upsertAssignmentInstance({
              id: assignmentId + '-' + studentCode,
              assignment_id: assignmentId,
              student_code: studentCode,
              assigned_at: date,
              status: 'Submitted'
            });

            await db.addSubmission({
              instance_id: assignmentId + '-' + studentCode,
              score_manual: score,
              score_total: total,
              score_percent: percent,
              notes: notes || undefined,
              submitted_at: new Date(date).toISOString()
            });
          } else {
            // localStorage path — create a draft record for the assignment
            const drafts = storeGet('drafts', []);
            drafts.push({
              id: assignmentId,
              title,
              type: category,
              class: classLabel || 'General',
              meta: { manual: true, total_possible: total, notes: notes || '' },
              created_at: date
            });
            storeSet('drafts', drafts);

            // Create assignment instance
            let instances = storeGet('assignmentInstances', []);
            const instanceId = assignmentId + '-' + studentCode;
            instances.push({
              id: instanceId,
              assignment_id: assignmentId,
              student_code: studentCode,
              assigned_at: date,
              status: 'Submitted'
            });
            storeSet('assignmentInstances', instances);

            // Create submission
            let submissions = storeGet('submissions', []);
            submissions.push({
              id: generateSubmissionId(),
              instance_id: instanceId,
              score: score,
              score_total: total,
              score_percent: percent,
              score_manual: score,
              notes: notes || '',
              submitted_at: new Date(date).toISOString()
            });
            storeSet('submissions', submissions);
          }
          savedCount++;
        } catch (err) {
          console.error('[gradebook] Error saving manual grade for', studentCode, err);
          errors.push(studentCode + ': ' + err.message);
        }
      }

      submitBtn.disabled = false;
      submitBtn.textContent = '✅ Save Grade';

      if (errors.length > 0) {
        errorEl.textContent = 'Some grades could not be saved: ' + errors.join('; ');
        errorEl.style.display = 'block';
      }

      if (savedCount > 0) {
        closeModal();
        // Reload and re-render
        await loadData();
        renderGradebook();
        // Show toast
        const toastMsg = `✅ Manual grade recorded — ${title} (${score}/${total} = ${percent}%) for ${savedCount} student${savedCount !== 1 ? 's' : ''}`;
        _showGradebookToast(toastMsg);
      }
    });

    // Focus first field
    titleInput.focus();
  }

  /**
   * Show a brief toast notification at the bottom of the gradebook.
   */
  function _showGradebookToast(message) {
    const existing = document.getElementById('gbToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'gbToast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = [
      'position: fixed',
      'bottom: 24px', 'left: 50%',
      'transform: translateX(-50%)',
      'background: rgba(30,40,50,.97)',
      'color: #f0fff8',
      'border: 1px solid rgba(255,255,255,.15)',
      'border-radius: 10px',
      'padding: 12px 24px',
      'font-size: 0.97rem',
      'font-weight: 600',
      'z-index: 20000',
      'box-shadow: 0 4px 20px rgba(0,0,0,.4)',
      'max-width: 90vw',
      'text-align: center'
    ].join(';');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4500);
  }

  /**
   * Show weights settings modal
   */
  function showWeightsModal() {
    const modal = $("gbWeightsModal");
    if (!modal) return;

    const weights = getCategoryWeights();
    
    const assignmentInput = $("weightAssignment");
    const quizInput = $("weightQuiz");
    const testInput = $("weightTest");
    const projectInput = $("weightProject");

    if (assignmentInput) assignmentInput.value = weights.assignment;
    if (quizInput) quizInput.value = weights.quiz;
    if (testInput) testInput.value = weights.test;
    if (projectInput) projectInput.value = weights.project;

    modal.style.display = "flex";
  }

  /**
   * Hide weights settings modal
   */
  function hideWeightsModal() {
    const modal = $("gbWeightsModal");
    if (modal) modal.style.display = "none";
  }

  /**
   * Save weights and re-render gradebook
   */
  async function saveWeights() {
    const assignmentInput = $("weightAssignment");
    const quizInput = $("weightQuiz");
    const testInput = $("weightTest");
    const projectInput = $("weightProject");

    const MIN_WEIGHT = 0.1;
    const MAX_WEIGHT = 10.0;

    const parseAndValidateWeight = (input, defaultValue) => {
      const value = parseFloat(input?.value || defaultValue);
      if (isNaN(value) || value < MIN_WEIGHT || value > MAX_WEIGHT) {
        return null;
      }
      return value;
    };

    const weights = {
      assignment: parseAndValidateWeight(assignmentInput, 1.0),
      quiz: parseAndValidateWeight(quizInput, 1.5),
      test: parseAndValidateWeight(testInput, 2.0),
      project: parseAndValidateWeight(projectInput, 2.0)
    };

    // Check if any weight is invalid
    if (Object.values(weights).some(w => w === null)) {
      await rcAlert('Invalid Weights', `Please enter valid weights between ${MIN_WEIGHT} and ${MAX_WEIGHT}`);
      return;
    }

    saveCategoryWeights(weights);
    hideWeightsModal();
    renderGradebook(); // Re-render to update weighted averages
  }

  // Update quarter filter dropdown labels from localStorage rc_quarter_dates
  function updateQuarterFilterLabels() {
    const quarterFilter = $("gbQuarterFilter");
    if (!quarterFilter) return;

    const quarterDates = getQuarterDates();

    for (const q of ["Q1", "Q2", "Q3", "Q4"]) {
      const option = quarterFilter.querySelector(`option[value="${q}"]`);
      if (option && quarterDates[q]) {
        option.textContent = `${q} (${quarterDates[q].start}–${quarterDates[q].end})`;
      }
    }
  }

  /**
   * Toggle compact/comfortable view
   */
  function toggleCompact() {
    isCompact = !isCompact;
    try {
      localStorage.setItem(PREF_COMPACT, isCompact ? "true" : "false");
    } catch {
      // Storage unavailable — preference won't persist but UI still works
    }
    renderGradebook();
  }

  /**
   * Toggle display of Average / Weighted / Trend columns
   */
  function toggleMoreColumns() {
    showMoreColumns = !showMoreColumns;
    try {
      localStorage.setItem(PREF_SHOW_MORE, showMoreColumns ? "true" : "false");
    } catch {
      // Storage unavailable — preference won't persist but UI still works
    }
    renderGradebook();
  }

  /**
   * Set group mode ("individual" | "class" | "week") and re-render
   */
  function setGroupMode(mode) {
    groupMode = mode;
    expandedGroups.clear();
    try {
      localStorage.setItem(PREF_GROUP_MODE, mode);
    } catch {
      // Storage unavailable — preference won't persist but UI still works
    }
    renderGradebook();
  }

  /**
   * Set column sort order and re-render
   */
  function setSort(value) {
    currentSort = value;
    try {
      localStorage.setItem(PREF_SORT, value);
    } catch {
      // Storage unavailable — preference won't persist but UI still works
    }
    const sortSelect = $("gbSortSelect");
    if (sortSelect) sortSelect.value = value;
    renderGradebook();
  }

  /**
   * Set up quick-stats hover card on student cells (event delegation)
   */
  function setupStudentHoverCard() {
    const tableWrapEl = $("gbTableWrap");
    if (!tableWrapEl) return;

    // Reuse existing card element if already created (avoids duplicates on re-init)
    let card = document.getElementById("gbStatsCard");
    if (!card) {
      card = document.createElement("div");
      card.id = "gbStatsCard";
      card.className = "gb-stats-card";
      card.setAttribute("role", "status");
      card.setAttribute("aria-live", "polite");
      card.style.display = "none";
      document.body.appendChild(card);
    }

    let hideTimer = null;

    tableWrapEl.addEventListener("mouseover", (e) => {
      const cell = e.target.closest(".gb-has-stats");
      if (!cell) return;
      clearTimeout(hideTimer);

      let info;
      try {
        info = JSON.parse(cell.dataset.tooltip || "{}");
      } catch {
        return;
      }

      const avgText = info.avg !== null && info.avg !== undefined ? `${info.avg}%` : "—";

      // Build hover card content safely using DOM construction (avoids XSS via innerHTML)
      while (card.firstChild) card.removeChild(card.firstChild);

      const nameDiv = document.createElement("div");
      nameDiv.className = "gb-stats-card-name";
      nameDiv.textContent = info.name || info.code || "";
      card.appendChild(nameDiv);

      if (info.code && info.name) {
        const codeDiv = document.createElement("div");
        codeDiv.className = "gb-stats-card-code";
        codeDiv.textContent = info.code;
        card.appendChild(codeDiv);
      }

      appendStatsRow(card, "Completed", `${info.completed}/${info.total}`);
      appendStatsRow(card, "Average", avgText);
      appendStatsRow(card, "Trend", info.trend || "—");

      const rect = cell.getBoundingClientRect();
      card.style.display = "block";
      // Position below the cell, or above if near the bottom
      const top = rect.bottom + window.scrollY + 6;
      const left = rect.left + window.scrollX;
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
    });

    tableWrapEl.addEventListener("mouseout", (e) => {
      if (!e.target.closest(".gb-has-stats")) return;
      hideTimer = setTimeout(() => {
        card.style.display = "none";
      }, 150);
    });

    // Keep card visible when hovering the card itself
    card.addEventListener("mouseover", () => clearTimeout(hideTimer));
    card.addEventListener("mouseout", () => {
      hideTimer = setTimeout(() => {
        card.style.display = "none";
      }, 150);
    });
  }

  // ── Keyboard Navigation ───────────────────────────────────────────────────
  // Single delegated keydown listener on gbTableWrap; handles:
  //   Arrow keys  → move focus to adjacent visible cell
  //   Home/End    → jump to first/last cell in current row
  //   Enter       → open score editor on score cells; expand/collapse groups on headers
  function setupKeyboardNavigation() {
    const tableWrapEl = $("gbTableWrap");
    if (!tableWrapEl) return;

    tableWrapEl.addEventListener("keydown", (e) => {
      const target = e.target;

      // Only handle keys when a focusable gradebook cell has focus
      const isScoreCell  = target.classList.contains("gb-score-cell");
      const isStudentCell = target.classList.contains("gb-student-cell");
      const isGroupCell  = target.classList.contains("gb-group-cell");
      const isGroupHeader = target.tagName === "TH" && target.classList.contains("gb-group-header");
      const isGroupFirstCol = target.tagName === "TH" && target.classList.contains("gb-group-first-col");

      const isFocusableCell = isScoreCell || isStudentCell || isGroupCell || isGroupHeader || isGroupFirstCol;
      if (!isFocusableCell) return;

      // If the cell is in edit mode, let the editor's own handlers take over
      if (target.classList.contains("editing")) return;

      const key = e.key;

      // ── Enter: open editor or toggle group ──────────────────────────────
      if (key === "Enter") {
        if (isGroupHeader && target.dataset.groupSeries) {
          e.preventDefault();
          expandedGroups.add(target.dataset.groupSeries);
          renderGradebook();
          return;
        }
        if (isGroupFirstCol && target.dataset.groupSeriesExpanded) {
          e.preventDefault();
          expandedGroups.delete(target.dataset.groupSeriesExpanded);
          renderGradebook();
          return;
        }
        if (isScoreCell && target.classList.contains("editable")) {
          e.preventDefault();
          target.click(); // triggers existing makeScoreEditable() click handler
          return;
        }
        return;
      }

      // ── Arrow key / Home / End navigation ───────────────────────────────
      const isNavKey = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key);
      if (!isNavKey) return;

      e.preventDefault();

      // Collect all navigable rows (thead + tbody rows)
      const table = tableWrapEl.querySelector("table");
      if (!table) return;

      const allRows = [
        ...Array.from(table.tHead ? table.tHead.rows : []),
        ...Array.from(table.tBodies[0] ? table.tBodies[0].rows : [])
      ];

      // Find current row/cell
      const currentRow = target.closest("tr");
      if (!currentRow) return;
      const rowIndex = allRows.indexOf(currentRow);
      const currentCells = Array.from(currentRow.cells);
      const colIndex = currentCells.indexOf(target);
      if (rowIndex < 0 || colIndex < 0) return;

      // Helper: get visible cells in a row (those with tabIndex >= 0 and not display:none)
      function getVisibleCells(row) {
        return Array.from(row.cells).filter(
          c => c.tabIndex >= 0 && c.style.display !== "none"
        );
      }

      let targetCell = null;

      if (key === "Home") {
        const visCells = getVisibleCells(currentRow);
        targetCell = visCells[0] || null;
      } else if (key === "End") {
        const visCells = getVisibleCells(currentRow);
        targetCell = visCells[visCells.length - 1] || null;
      } else if (key === "ArrowLeft" || key === "ArrowRight") {
        const visCells = getVisibleCells(currentRow);
        const visIdx = visCells.indexOf(target);
        if (key === "ArrowLeft"  && visIdx > 0)                  targetCell = visCells[visIdx - 1];
        if (key === "ArrowRight" && visIdx < visCells.length - 1) targetCell = visCells[visIdx + 1];
      } else if (key === "ArrowUp" || key === "ArrowDown") {
        const delta = key === "ArrowUp" ? -1 : 1;
        // Walk rows in the given direction to find one with a cell at same (or nearby) column
        for (let ri = rowIndex + delta; ri >= 0 && ri < allRows.length; ri += delta) {
          const candidateRow = allRows[ri];
          const visCells = getVisibleCells(candidateRow);
          // Skip rows with no focusable visible cells (summary rows, header rows without tabindex, etc.)
          if (visCells.length === 0) continue;
          // Prefer same column index; fall back to last visible cell
          const sameCol = Array.from(candidateRow.cells)[colIndex];
          if (sameCol && sameCol.tabIndex >= 0 && sameCol.style.display !== "none") {
            targetCell = sameCol;
          } else {
            targetCell = visCells[Math.min(colIndex, visCells.length - 1)] || visCells[0];
          }
          break;
        }
      }

      if (targetCell) {
        targetCell.focus();
      }
    });
  }

  // Initialize
  async function init() {
    await loadData();
    updateQuarterFilterLabels();
    renderClassFilter();
    renderGradebook();
    setupStudentHoverCard();
    setupKeyboardNavigation();

    // Wire manual assignment button
    const btnManualAssignment = $("btnManualAssignment");
    if (btnManualAssignment) {
      btnManualAssignment.addEventListener("click", openManualAssignmentModal);
    }

    // Wire export button
    const btnExport = $("btnExportCSV");
    if (btnExport) {
      btnExport.addEventListener("click", exportToCSV);
    }

    // Wire CSV+VLOOKUP export button
    const btnExportVLOOKUP = $("btnExportVLOOKUP");
    if (btnExportVLOOKUP) {
      btnExportVLOOKUP.addEventListener("click", exportToCSVVLOOKUP);
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
    
    // Wire analytics toggle button
    const btnToggleAnalytics = $("btnToggleAnalytics");
    if (btnToggleAnalytics) {
      btnToggleAnalytics.addEventListener("click", toggleAnalytics);
    }
    
    // Wire missing work toggle button
    const btnToggleMissing = $("btnToggleMissing");
    if (btnToggleMissing) {
      btnToggleMissing.addEventListener("click", toggleMissingWork);
    }
    
    // Wire weights settings button
    const btnWeightsSettings = $("btnWeightsSettings");
    if (btnWeightsSettings) {
      btnWeightsSettings.addEventListener("click", showWeightsModal);
    }
    
    // Wire weights modal buttons
    const btnSaveWeights = $("btnSaveWeights");
    if (btnSaveWeights) {
      btnSaveWeights.addEventListener("click", saveWeights);
    }
    
    const btnCancelWeights = $("btnCancelWeights");
    if (btnCancelWeights) {
      btnCancelWeights.addEventListener("click", hideWeightsModal);
    }
    
    // Close modal when clicking outside
    const weightsModal = $("gbWeightsModal");
    if (weightsModal) {
      weightsModal.addEventListener("click", (e) => {
        if (e.target === weightsModal) {
          hideWeightsModal();
        }
      });
    }

    // Wire compact toggle button
    const btnCompact = $("btnToggleCompact");
    if (btnCompact) {
      btnCompact.addEventListener("click", toggleCompact);
    }

    // Wire show-more columns button
    const btnShowMore = $("btnToggleMoreCols");
    if (btnShowMore) {
      btnShowMore.addEventListener("click", toggleMoreColumns);
    }

    // Wire group mode select
    const selectGroupMode = $("gbGroupModeSelect");
    if (selectGroupMode) {
      selectGroupMode.value = groupMode;
      selectGroupMode.addEventListener("change", () => setGroupMode(selectGroupMode.value));
    }

    // Wire sort select
    const sortSelect = $("gbSortSelect");
    if (sortSelect) {
      sortSelect.value = currentSort;
      sortSelect.addEventListener("change", () => setSort(sortSelect.value));
    }

    // Wire student search input
    const studentSearch = $("gbStudentSearch");
    if (studentSearch) {
      let searchDebounceTimer = null;
      studentSearch.addEventListener("input", () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          studentSearchTerm = studentSearch.value.trim();
          renderGradebook();
        }, 200);
      });
      // Escape key clears the search
      studentSearch.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          clearTimeout(searchDebounceTimer);
          studentSearch.value = "";
          studentSearchTerm = "";
          renderGradebook();
        }
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
    document.addEventListener("DOMContentLoaded", () => init().catch(err => console.error('[gradebook] Init error:', err)));
  } else {
    init().catch(err => console.error('[gradebook] Init error:', err));
  }
})();
