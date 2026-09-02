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

  /**
   * Parse an assignment deadline.
   *
   * assignment_instances.due_at is a DATE column. A bare YYYY-MM-DD
   * remains due through the end of that local calendar day. Full
   * timestamps retain their normal instant/timezone semantics.
   */
  function parseAssignmentDeadline(dateStr) {
    if (!dateStr) return null;

    const raw = String(dateStr).trim();
    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? new Date(`${raw}T23:59:59.999`)
        : new Date(raw);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Helper to format date as YYYY-MM-DD
  function formatDateYYYYMMDD() {
    return new Date().toISOString().split("T")[0];
  }

  // Helper to format date as MM/DD for column headers
  function formatShortDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    // Use UTC values so that ISO date strings (e.g. "2025-03-29T00:00:00Z") always
    // resolve to the intended calendar date regardless of the client's local timezone.
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
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

  // Decide whether a submission is authoritative enough to populate
  // the Gradebook. Preserve existing local/offline behavior unchanged.
  function isGradebookScoreEligible(submission, draft) {
    if (!usingSupabase) return true;

    const reviewStatus =
      submission &&
      typeof submission.review_status === 'string'
        ? submission.review_status.trim().toLowerCase()
        : '';

    const isManualAssignment =
      draft &&
      draft.meta &&
      draft.meta.manual === true;

    const isPaperAssignment =
      draft &&
      draft.type === 'paper';

    // MANUAL and PAPER records are terminal teacher-entered evidence at
    // reviewed. Ordinary digital work requires explicit finalization.
    if (isManualAssignment || isPaperAssignment) {
      return (
        reviewStatus === 'reviewed' ||
        reviewStatus === 'finalized'
      );
    }

    return reviewStatus === 'finalized';
  }

  function resolveEarnedInfo(submission, score, draft) {
    const hasScoreAuto =
      submission.score_auto !== null &&
      submission.score_auto !== undefined &&
      Number.isFinite(Number(submission.score_auto));

    const hasScoreManual =
      submission.score_manual !== null &&
      submission.score_manual !== undefined &&
      Number.isFinite(Number(submission.score_manual));

    const scoreAuto =
      hasScoreAuto
        ? Number(submission.score_auto)
        : 0;

    const scoreManual =
      hasScoreManual
        ? Number(submission.score_manual)
        : 0;

    const isManualAssignment =
      draft &&
      draft.meta &&
      draft.meta.manual === true;

    const manualTotalPossible =
      isManualAssignment
        ? Number(draft.meta.total_possible)
        : null;

    if (
      isManualAssignment &&
      hasScoreManual &&
      Number.isFinite(manualTotalPossible) &&
      manualTotalPossible > 0
    ) {
      return {
        earned: scoreManual,
        possible: manualTotalPossible,
      };
    }

    if (
      score === null ||
      score === undefined ||
      score <= 0 ||
      (!hasScoreAuto && !hasScoreManual)
    ) {
      return null;
    }

    const earned =
      scoreAuto + scoreManual;

    const possible =
      Math.round(
        earned / (score / 100)
      );

    return possible > 0
      ? {
          earned,
          possible,
        }
      : null;
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
  let earnedMap = new Map(); // studentCode -> Map<draftId, {earned, possible}> — populated from score_auto/score_total
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
  // assignmentGroups is optional (used when sorting by deduplicated assignment group key "grp:title").
  // Null/missing values always sort to the bottom regardless of direction.
  function applyColumnSort(students, scoreMap, drafts, groups, assignmentGroups) {
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
      } else if (columnSortKey.startsWith("grp:") && assignmentGroups) {
        // Sort by deduplicated assignment group score (compound key: title|dateStr)
        const compoundKey = columnSortKey.slice(4);
        const ag = assignmentGroups.find(g => (g.title + "|" + (g.dateStr || "")) === compoundKey);
        if (ag) {
          va = getStudentScoreForGroup(a.code, ag, scoreMap);
          vb = getStudentScoreForGroup(b.code, ag, scoreMap);
        } else {
          va = null;
          vb = null;
        }
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
    earnedMap = new Map(); // reset and rebuild from current submissionsData
    let scoredCount = 0;
    let droppedNoInstanceGBD = 0;
    let droppedNoStudentOrDraftGBD = 0;

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
          droppedNoInstanceGBD++;
          continue;
        }
        studentCode = nestedInstance.students?.code || nestedInstance.student_code;
        draftId = nestedInstance.assignment_id || submission.assignment_id;
        if (!studentCode || !draftId) {
          droppedNoStudentOrDraftGBD++;
          continue;
        }
      }

      const draftForEligibility =
        draftsData.find(
          (draft) => draft.id === draftId
        );

      if (
        !isGradebookScoreEligible(
          submission,
          draftForEligibility
        )
      ) {
        continue;
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

      const earnedInfo =
        resolveEarnedInfo(
          submission,
          score,
          draftsData.find(
            (draft) => draft.id === draftId
          )
        );

      if (earnedInfo) {
        if (!earnedMap.has(studentCode)) {
          earnedMap.set(studentCode, new Map());
        }

        if (!earnedMap.get(studentCode).has(draftId)) {
          earnedMap
            .get(studentCode)
            .set(draftId, earnedInfo);

          scoredCount++;
        }
      }
    }

    console.log(
      `[gradebook] buildGradebookData: ${submissionsData.length} submissions loaded; ` +
      `${scoredCount} earned-points entries mapped; ` +
      `${droppedNoInstanceGBD} dropped (no instance); ` +
      `${droppedNoStudentOrDraftGBD} dropped (no student/draft)`
    );

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
  async function saveScore(studentCode, draftId, score, scoreEarned) {
    try {
      if (usingSupabase) {
        console.log('[gradebook] Saving score through signed teacher boundary:', {
          studentCode,
          draftId,
          score
        });

        const saved = await db.saveGradebookScore({
          assignment_id: draftId,
          student_code: studentCode,
          score,
          score_earned: scoreEarned
        });

        if (saved.instance) {
          const instanceIndex = assignmentInstancesData.findIndex(
            (item) => item.id === saved.instance.id
          );

          if (instanceIndex >= 0) {
            assignmentInstancesData[instanceIndex] = saved.instance;
          } else {
            assignmentInstancesData.push(saved.instance);
          }
        }

        if (saved.submission) {
          const submissionIndex = submissionsData.findIndex(
            (item) => item.id === saved.submission.id
          );

          if (submissionIndex >= 0) {
            submissionsData[submissionIndex] = saved.submission;
          } else {
            submissionsData.push(saved.submission);
          }
        }

        console.log('[gradebook] Score saved through signed teacher boundary');
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
  function makeScoreEditable(
    td,
    studentCode,
    draftId,
    currentScore,
    totalPossible,
    currentEarned
  ) {
    td.classList.add("editing");
    let _skipBlurCancel = false; // set to true when Tab or explicit save handles navigation

    // Lookup student name and assignment title for aria-label updates
    const _editStudentName = (studentsData.find(s => s.code === studentCode) || {}).name || studentCode;
    const _editDraft = draftsData.find(d => d.id === draftId);
    const _editTitle = _editDraft ? (_editDraft.title || "(untitled)") : draftId;

    const isManualAssignment =
      _editDraft &&
      _editDraft.meta &&
      _editDraft.meta.manual === true;

    const manualTotalPossible =
      Number(totalPossible);

    const maxScore =
      isManualAssignment &&
      Number.isFinite(manualTotalPossible)
        ? manualTotalPossible
        : (totalPossible || 100);

    const hasCurrentEarned =
      currentEarned !== null &&
      currentEarned !== undefined &&
      Number.isFinite(Number(currentEarned));

    const editorCurrentValue =
      isManualAssignment
        ? (
            hasCurrentEarned
              ? Number(currentEarned)
              : calculateEarnedPoints(
                  currentScore,
                  manualTotalPossible
                )
          )
        : currentScore;

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
    input.step = isManualAssignment ? "any" : "1";
    input.value =
      editorCurrentValue !== null
        ? editorCurrentValue
        : "";

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

      const enteredScore =
        isManualAssignment
          ? Number(newValue)
          : parseInt(newValue, 10);

      if (
        !Number.isFinite(enteredScore) ||
        enteredScore < 0 ||
        enteredScore > maxScore
      ) {
        await rcAlert('Invalid Score', `Please enter a score between 0 and ${maxScore}.`);
        input.focus();
        return;
      }

      const scorePercent =
        isManualAssignment
          ? Math.round(
              (
                enteredScore /
                manualTotalPossible
              ) * 100
            )
          : enteredScore;

      // Disable input while saving
      input.disabled = true;
      btnSave.disabled = true;
      btnCancel.disabled = true;
      
      try {
        // Save percentage plus exact earned points for MANUAL entries.
        await saveScore(
          studentCode,
          draftId,
          scorePercent,
          isManualAssignment
            ? enteredScore
            : undefined
        );
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
          const restoredEarned =
            isManualAssignment &&
            hasCurrentEarned
              ? Number(currentEarned)
              : calculateEarnedPoints(
                  currentScore,
                  totalPossible
                );

          const ptsLine = document.createElement("div");
          ptsLine.className = "gb-score-pts-line";
          ptsLine.textContent = `${restoredEarned}/${totalPossible}`;
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

  // Infer the CANON_CLASSES series for a draft using authoritative assignment
  // metadata first, then progressively weaker compatibility fallbacks.
  // Returns a matching CANON_CLASSES string or null.
  function inferSeriesFromDraft(draft) {
    // Strategy 1: issued file assignments preserve their authoritative class
    // in meta.class_name.
    const metaClassName =
      draft &&
      draft.meta &&
      typeof draft.meta.class_name === 'string'
        ? draft.meta.class_name.trim()
        : '';

    if (metaClassName && CANON_CLASSES.includes(metaClassName)) {
      return metaClassName;
    }

    // Strategy 2: use draft.series when it contains a canonical class.
    if (draft.series && CANON_CLASSES.includes(draft.series)) {
      return draft.series;
    }

    // Strategy 3: legacy compatibility — search the assignment title.
    const title = (draft.title || '').toLowerCase();
    for (const cls of CANON_CLASSES) {
      if (title.includes(cls.toLowerCase())) {
        return cls;
      }
    }

    // Strategy 4: legacy compatibility — infer from enrollments only when all
    // relevant active canonical enrollments resolve to exactly one class.
    // Never guess from the first enrollment for a multi-class student.
    const instancesForDraft = assignmentInstancesData.filter(
      i => i.assignment_id === draft.id
    );

    if (instancesForDraft.length > 0) {
      const assignedStudentCodes = new Set(
        instancesForDraft.map(instance => instance.student_code)
      );

      const candidateClasses = new Set(
        classEnrollmentsData
          .filter(
            enrollment =>
              assignedStudentCodes.has(enrollment.student_code) &&
              enrollment.active !== false &&
              enrollment.class_name &&
              CANON_CLASSES.includes(enrollment.class_name)
          )
          .map(enrollment => enrollment.class_name)
      );

      if (candidateClasses.size === 1) {
        return [...candidateClasses][0];
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
    const studentEarned = earnedMap.get(studentCode);
    let rawEarnedSum = 0, possibleSum = 0;
    for (const draft of groupDrafts) {
      const tp = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
      if (studentScores && studentScores.has(draft.id)) {
        const s = studentScores.get(draft.id);
        if (typeof s === "number") {
          if (tp) {
            rawEarnedSum += (s * tp / 100);
            possibleSum += tp;
          } else if (studentEarned && studentEarned.has(draft.id)) {
            const ep = studentEarned.get(draft.id);
            rawEarnedSum += ep.earned;
            possibleSum += ep.possible;
          }
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
        // Fallback: check earnedMap when draft.meta.total_possible is null
        const earnedInfo = !totalPossible && earnedMap.has(studentCode)
          ? earnedMap.get(studentCode).get(draft.id) || null
          : null;

        const pctLine = document.createElement("div");
        pctLine.className = "gb-score-pct";
        pctLine.textContent = `${score}%`;
        td.appendChild(pctLine);

        const displayPossible = totalPossible || (earnedInfo ? earnedInfo.possible : null);
        const displayEarned = totalPossible
          ? calculateEarnedPoints(score, totalPossible)
          : (earnedInfo ? earnedInfo.earned : null);

        if (displayPossible && displayEarned !== null) {
          const ptsLine = document.createElement("div");
          ptsLine.className = "gb-score-pts-line";
          ptsLine.textContent = `${displayEarned}/${displayPossible}`;
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

      const earnedInfo =
        earnedMap.has(studentCode)
          ? earnedMap
              .get(studentCode)
              .get(draft.id) || null
          : null;

      makeScoreEditable(
        td,
        studentCode,
        draft.id,
        currentScore,
        totalPossible,
        earnedInfo
          ? earnedInfo.earned
          : null
      );
    });

    return td;
  }

  // Build a <th> for a deduplicated assignment group (used in individual mode)
  function buildAssignmentGroupTh(group) {
    const th = document.createElement("th");
    th.setAttribute("role", "columnheader");
    const groupSortKey = "grp:" + group.title + "|" + (group.dateStr || "");
    th.setAttribute("aria-sort", getAriaSortAttr(groupSortKey));
    th.style.minWidth = isCompact ? "56px" : "68px";

    const titleEl = document.createElement("div");
    titleEl.className = "gb-col-title";
    const displayTitle = group.title.length > 24 ? group.title.substring(0, 24) + "…" : group.title;
    titleEl.textContent = displayTitle + columnSortIndicator(groupSortKey);
    titleEl.title = group.title;
    th.appendChild(titleEl);

    if (group.dateStr) {
      const dateEl = document.createElement("div");
      dateEl.className = "gb-col-date";
      dateEl.textContent = group.dateStr;
      th.appendChild(dateEl);
    }

    if (group.totalPossible) {
      const ptsEl = document.createElement("div");
      ptsEl.className = "gb-col-pts";
      ptsEl.textContent = `${group.totalPossible} pts`;
      th.appendChild(ptsEl);
    }

    attachColumnSortClick(th, "grp:" + group.title + "|" + (group.dateStr || ""), group.title);
    return th;
  }

  // Build a <td> for a student's score in a deduplicated assignment group (individual mode)
  function buildGroupScoreTd(group, studentCode, scoreMap, studentLabel, studentInstanceDraftIds) {
    const td = document.createElement("td");
    td.setAttribute("role", "gridcell");
    td.className = "gb-score-cell editable";
    td.tabIndex = 0;

    const resolvedStudentLabel = studentLabel || studentCode;

    // Find which draftId in the group the student has a score for
    let currentScore = null;
    let scoreDraftId = null;
    const studentScores = scoreMap.get(studentCode);
    if (studentScores) {
      for (const draftId of group.draftIds) {
        if (studentScores.has(draftId)) {
          const score = studentScores.get(draftId);
          if (typeof score === "number") {
            currentScore = score;
            scoreDraftId = draftId;
            break;
          }
        }
      }
    }

    // Check for missing-work highlight (only if the student actually has this draft instance).
    // studentInstanceDraftIds is pre-computed per-student in the render loop for efficiency.
    // If not provided, compute it here as a fallback (less efficient for bulk rendering).
    const instanceDraftIds = studentInstanceDraftIds || new Set(
      assignmentInstancesData
        .filter(inst => inst.student_code === studentCode)
        .map(inst => inst.assignment_id)
    );
    for (const draftId of group.draftIds) {
      if (missingWorkPairs.has(`${studentCode}::${draftId}`)) {
        const hasInstance = instanceDraftIds.has(draftId);
        const hasScore = studentScores && studentScores.has(draftId);
        // If assignmentInstancesData is empty (not yet loaded), fall back to highlighting
        // any flagged draftId so the indicator still works when instance data is unavailable.
        // Note: this may show false positives until assignmentInstancesData is populated.
        if (hasInstance || hasScore || assignmentInstancesData.length === 0) {
          td.classList.add("gb-missing-highlight");
          break;
        }
      }
    }

    if (currentScore !== null) {
      const pctLine = document.createElement("div");
      pctLine.className = "gb-score-pct";
      pctLine.textContent = `${currentScore}%`;
      td.appendChild(pctLine);

      // Check earnedMap for earned/possible when group.totalPossible is null
      const earnedInfo = !group.totalPossible && scoreDraftId && earnedMap.has(studentCode)
        ? earnedMap.get(studentCode).get(scoreDraftId) || null
        : null;
      const displayPossible = group.totalPossible || (earnedInfo ? earnedInfo.possible : null);
      const displayEarned = group.totalPossible
        ? calculateEarnedPoints(currentScore, group.totalPossible)
        : (earnedInfo ? earnedInfo.earned : null);

      if (displayPossible && displayEarned !== null) {
        const ptsLine = document.createElement("div");
        ptsLine.className = "gb-score-pts-line";
        ptsLine.textContent = `${displayEarned}/${displayPossible}`;
        td.appendChild(ptsLine);
      }

      const colorClass = scoreColorClass(currentScore);
      if (colorClass) td.classList.add(colorClass);
      td.setAttribute("aria-label", `Score for ${resolvedStudentLabel} on ${group.title}: ${currentScore}%. Press Enter to edit`);
    } else {
      td.textContent = "—";
      td.setAttribute("aria-label", `No score for ${resolvedStudentLabel} on ${group.title}. Press Enter to edit`);
    }

    td.addEventListener("click", () => {
      // Find which specific draftId to edit: prefer the one with an existing score,
      // fall back to the one where the student has an assignment instance, then first in group.
      let editDraftId = scoreDraftId;
      if (!editDraftId) {
        const instance = assignmentInstancesData.find(
          inst => group.draftIds.includes(inst.assignment_id) && inst.student_code === studentCode
        );
        editDraftId = instance ? instance.assignment_id : group.draftIds[0];
      }
      // Find totalPossible from the specific draft being edited (fallback to group.totalPossible)
      const editDraft = draftsData.find(d => d.id === editDraftId);
      const totalPossible = (editDraft && editDraft.meta && editDraft.meta.total_possible)
        ? editDraft.meta.total_possible
        : group.totalPossible;
      const editEarnedInfo =
        scoreDraftId &&
        earnedMap.has(studentCode)
          ? earnedMap
              .get(studentCode)
              .get(scoreDraftId) || null
          : null;

      makeScoreEditable(
        td,
        studentCode,
        editDraftId,
        currentScore,
        totalPossible,
        editEarnedInfo
          ? editEarnedInfo.earned
          : null
      );
    });

    return td;
  }

  // Calculate column average for a deduplicated assignment group
  function calculateGroupColumnAverage(group, scoreMap, students) {
    const scores = [];
    for (const student of students) {
      const score = getStudentScoreForGroup(student.code, group, scoreMap);
      if (typeof score === "number") scores.push(score);
    }
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  // Render gradebook in grouped/collapsed column mode (Option A)
  function renderGroupedGradebook(tableHead, tableBody, students, drafts, scoreMap) {
    const { groups, ungrouped } = groupMode === "week"
      ? buildWeekGroupsFromDrafts(drafts)
      : buildGroupsFromDrafts(drafts);
    const allDraftsFlat = [...groups.flatMap(g => g.drafts), ...ungrouped];
    const allAssignmentGroups = deduplicateAssignmentsForExport(allDraftsFlat);
    backfillGroupTotalPossible(allAssignmentGroups);

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
        const expandedDeduped = deduplicateAssignmentsForExport(group.drafts);
        backfillGroupTotalPossible(expandedDeduped);
        for (let i = 0; i < expandedDeduped.length; i++) {
          const th = buildAssignmentGroupTh(expandedDeduped[i]);
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
      // Pre-compute assignment instances for this student once (avoids re-filtering per group cell)
      const studentInstanceDraftIds = new Set(
        assignmentInstancesData
          .filter(inst => inst.student_code === student.code)
          .map(inst => inst.assignment_id)
      );
      const completedCount = allAssignmentGroups.filter(
        g => getStudentScoreForGroup(student.code, g, scoreMap) !== null
      ).length;
      const totalAssigned = allAssignmentGroups.length;
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
            const studentEarned = earnedMap.get(student.code);
            let rawEarnedSum = 0, possibleSum = 0;
            for (const draft of group.drafts) {
              const tp = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
              if (studentScores && studentScores.has(draft.id)) {
                const s = studentScores.get(draft.id);
                if (typeof s === "number") {
                  if (tp) {
                    rawEarnedSum += (s * tp / 100);
                    possibleSum += tp;
                  } else if (studentEarned && studentEarned.has(draft.id)) {
                    const ep = studentEarned.get(draft.id);
                    rawEarnedSum += ep.earned;
                    possibleSum += ep.possible;
                  }
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
          // Expanded: individual score cells — deduplicated
          const expandedDeduped = deduplicateAssignmentsForExport(group.drafts);
          backfillGroupTotalPossible(expandedDeduped);
          for (const dedupGroup of expandedDeduped) {
            tr.appendChild(buildGroupScoreTd(dedupGroup, student.code, scoreMap, student.name || student.code, studentInstanceDraftIds));
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
        // Expanded: individual column averages — deduplicated
        const expandedDeduped = deduplicateAssignmentsForExport(group.drafts);
        backfillGroupTotalPossible(expandedDeduped);
        for (const dedupGroup of expandedDeduped) {
          const td = document.createElement("td");
          td.setAttribute("role", "gridcell");
          td.className = "gb-score-cell";
          const avg = calculateGroupColumnAverage(dedupGroup, scoreMap, students);
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

    // Deduplicate assignments: collapse per-student instances (e.g. "— S045") into one column
    const assignmentGroups = deduplicateAssignmentsForExport(drafts);
    backfillGroupTotalPossible(assignmentGroups);

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

    // Assignment columns — one per deduplicated group
    for (const group of assignmentGroups) {
      headerRow.appendChild(buildAssignmentGroupTh(group));
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

    const sortedStudents = applyColumnSort(students, scoreMap, drafts, [], assignmentGroups);
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
      // Pre-compute assignment instances for this student once (avoids re-filtering per group cell)
      const studentInstanceDraftIds = new Set(
        assignmentInstancesData
          .filter(inst => inst.student_code === student.code)
          .map(inst => inst.assignment_id)
      );
      const completedCount = assignmentGroups.filter(
        g => getStudentScoreForGroup(student.code, g, scoreMap) !== null
      ).length;
      const totalAssigned = assignmentGroups.length;
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

      // Score cells — one per deduplicated group
      for (const group of assignmentGroups) {
        tr.appendChild(buildGroupScoreTd(group, student.code, scoreMap, student.name || student.code, studentInstanceDraftIds));
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

    // Calculate column averages — one per deduplicated group
    for (const group of assignmentGroups) {
      const td = document.createElement("td");
      td.setAttribute("role", "gridcell");
      td.className = "gb-score-cell";
      const avg = calculateGroupColumnAverage(group, scoreMap, students);
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

  // ─── Export / Print Modal ───────────────────────────────────────────────────

  /**
   * Build a filtered list of students for export based on export options.
   * Does NOT modify global filter state.
   */
  function getExportStudents(opts) {
    let students;
    if (opts.studentMode === "class" && opts.selectedClass && opts.selectedClass !== "All Classes") {
      const enrolledCodes = classEnrollmentsData
        .filter((e) => e.class_name === opts.selectedClass && e.active !== false)
        .map((e) => e.student_code);
      students = studentsData.filter((s) => enrolledCodes.includes(s.code));
    } else if (opts.studentMode === "individual" && opts.selectedStudentCodes && opts.selectedStudentCodes.length > 0) {
      const codes = new Set(opts.selectedStudentCodes);
      students = studentsData.filter((s) => codes.has(s.code));
    } else {
      students = studentsData;
    }
    return students;
  }

  /**
   * Build a filtered list of drafts for export based on export options.
   * Does NOT modify global filter state.
   */
  function getExportDrafts(opts) {
    let drafts = [...draftsData];

    // Filter by quarter, week numbers, or custom date range
    if (opts.dateMode === "quarter" && opts.selectedQuarter) {
      drafts = drafts.filter((d) => {
        const dateStr = d.created_at || d.created || d.release;
        if (!dateStr) return false;
        return getQuarterForDate(dateStr) === opts.selectedQuarter;
      });
    } else if (opts.dateMode === "weeks" && opts.selectedWeeks && opts.selectedWeeks.length > 0) {
      const weekSet = new Set(opts.selectedWeeks.map(Number));
      // Find the date range covered by assignments that match the selected week titles
      const weekMatchedDates = draftsData
        .filter((d) => { const m = (d.title || "").match(/WEEK\s*(\d+)/i); return m && weekSet.has(Number(m[1])); })
        .map((d) => d.created_at || d.created || d.release)
        .filter(Boolean)
        .map((s) => new Date(s))
        .filter((dt) => !isNaN(dt.getTime()));
      const minDate = weekMatchedDates.length > 0 ? new Date(Math.min(...weekMatchedDates)) : null;
      const maxDate = weekMatchedDates.length > 0 ? new Date(Math.max(...weekMatchedDates)) : null;
      if (minDate) {
        minDate.setHours(0, 0, 0, 0);
        maxDate.setHours(23, 59, 59, 999);
      }
      drafts = drafts.filter((d) => {
        const titleMatch = (d.title || "").match(/WEEK\s*(\d+)/i);
        if (titleMatch && weekSet.has(Number(titleMatch[1]))) return true;
        // Also include assignments whose created_at falls in the date range of matched assignments
        if (minDate) {
          const dateStr = d.created_at || d.created || d.release;
          if (dateStr) {
            const dt = new Date(dateStr);
            if (!isNaN(dt.getTime()) && dt >= minDate && dt <= maxDate) return true;
          }
        }
        return false;
      });
    } else if (opts.dateMode === "custom" && (opts.dateStart || opts.dateEnd)) {
      const start = opts.dateStart ? new Date(opts.dateStart) : null;
      const end = opts.dateEnd ? new Date(opts.dateEnd + "T23:59:59") : null;
      drafts = drafts.filter((d) => {
        const dateStr = d.dueAt || d.due_at || d.created_at || d.created;
        if (!dateStr) return !start; // include undated only if no start filter
        const dt = new Date(dateStr);
        if (start && dt < start) return false;
        if (end && dt > end) return false;
        return true;
      });
    }

    return sortDrafts(drafts);
  }

  /** Format a student label according to the chosen name format. */
  function formatStudentLabel(student, nameFormat) {
    const code = student.code || "";
    const name = student.name || "";
    if (nameFormat === "name") return name || code;
    if (nameFormat === "both") return name ? `${name} (${code})` : code;
    return code; // default: "code"
  }

  /** Convert a 0-based column index to Excel column letters (A, B, …, Z, AA, AB, …). */
  function colIndexToLetter(idx) {
    let letter = "";
    let n = idx;
    do {
      letter = String.fromCharCode(65 + (n % 26)) + letter;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return letter;
  }

  /**
   * Escape a CSV cell value.
   */
  function csvCell(value) {
    const str = String(value == null ? "" : value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  // ─── Export deduplication helpers ───────────────────────────────────────────

  /**
   * Normalize an assignment title by removing trailing per-student code suffixes
   * like " — S045", " – S001", " - S044" etc., then collapsing multiple whitespace.
   *
   * @param {string|null|undefined} rawTitle
   * @returns {string}
   */
  function normalizeAssignmentTitle(rawTitle) {
    return (rawTitle || "(untitled)")
      .trim()
      // Remove trailing " — S045", " – S001", " - S044" etc.
      .replace(/\s*[—–-]\s*S\d+\s*$/, "")
      // Remove "for SXXX" or "for SXXX #N" patterns (e.g. "Worksheets for S015", "Worksheets for S015 #1")
      .replace(/\s+for\s+S\d+(\s+#\d+)?\s*$/i, "")
      // Collapse multiple whitespace to single space
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  /**
   * Return a case-insensitive, dash-normalized dedup key for an assignment title.
   * Normalizes em dash (U+2014), en dash (U+2013), and hyphen to a single hyphen for comparison.
   *
   * @param {string} normalizedTitle - output of normalizeAssignmentTitle()
   * @returns {string}
   */
  function titleDedupKey(normalizedTitle) {
    return normalizedTitle
      // Decode common HTML entities so that "&amp;" and "&" produce the same key
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[—–]/g, "-") // U+2014 em dash, U+2013 en dash → hyphen
      .toLowerCase();
  }

  /**
   * Group drafts by title so that per-student assignment instances collapse into
   * one column per unique assignment title in the export.
   *
   * Two normalized titles are considered the same group when:
   *  1. Their titleDedupKey() values are identical, OR
   *  2. One key is a word-boundary prefix of the other (e.g. the Week 10 variant
   *     "WEEK 10 — Lost in Kragdon-ah (Chapters 29–31) Sentence Structure & Transitions"
   *     collapses with "WEEK 10 — Lost in Kragdon-ah (Chapters 29–31)").
   *
   * The shorter (more canonical) title is kept as the group's display title.
   *
   * @param {Array} drafts - Array of draft/assignment objects
   * @returns {Array} Array of group objects: { title, draftIds, totalPossible, dateStr }
   */
  function deduplicateAssignmentsForExport(drafts) {
    // Linear scan for a matching group: O(groups) per draft.
    // In practice groups ≤ a few dozen (one per unique assignment), so this is fast enough.
    function findMatchingGroupIdx(groups, dedupKey, dateStr) {
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (g.dateStr !== dateStr) continue;
        const gKey = titleDedupKey(g.title);
        if (gKey === dedupKey) return i;
        // Prefix match: one title is a word-boundary prefix of the other.
        // This collapses assignment variants like:
        //   "WEEK 10 — Lost in Kragdon-ah (Chapters 29–31)"
        //   "WEEK 10 — Lost in Kragdon-ah (Chapters 29–31) Sentence Structure & Transitions"
        if (dedupKey.startsWith(gKey + " ") || gKey.startsWith(dedupKey + " ")) return i;
      }
      return -1;
    }

    const groups = [];
    for (const draft of drafts) {
      const title = normalizeAssignmentTitle(draft.title);
      const dateStr = formatShortDate(draft.dueAt || draft.due_at || draft.createdAt || draft.created_at);
      const dedupKey = titleDedupKey(title);
      const matchedIdx = findMatchingGroupIdx(groups, dedupKey, dateStr);

      if (matchedIdx >= 0) {
        const g = groups[matchedIdx];
        g.draftIds.push(draft.id);
        // Prefer the shorter, more canonical title as the display title
        if (title.length < g.title.length) g.title = title;
        if (g.totalPossible == null && draft.meta && draft.meta.total_possible) {
          g.totalPossible = draft.meta.total_possible;
        }
      } else {
        const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
        groups.push({ title, draftIds: [draft.id], totalPossible, dateStr });
      }
    }
    return groups;
  }

  /**
   * Back-fill missing `totalPossible` on deduplicated groups by scanning the
   * module-level `earnedMap` (populated by buildGradebookData / buildScoreMapForStudents).
   * When `meta.total_possible` is null for all assignments in a group, this derives
   * the value from `score_auto` and `score_total` already stored in earnedMap.
   *
   * @param {Array} groups - output of deduplicateAssignmentsForExport()
   */
  function backfillGroupTotalPossible(groups) {
    function findPossibleInEarnedMap(draftIds) {
      for (const [, studentEntries] of earnedMap) {
        for (const draftId of draftIds) {
          const info = studentEntries.get(draftId);
          if (info && info.possible > 0) return info.possible;
        }
      }
      return null;
    }

    for (const group of groups) {
      if (group.totalPossible != null) continue;
      const possible = findPossibleInEarnedMap(group.draftIds);
      if (possible !== null) group.totalPossible = possible;
    }
  }

  /**
   * Find a student's score for a deduplicated assignment group.
   * Checks each draftId in the group and returns the first non-null score found.
   *
   * @param {string} studentCode
   * @param {{ draftIds: string[] }} group
   * @param {Map} scoreMap - Map of studentCode → Map of draftId → score
   * @returns {number|null}
   */
  function getStudentScoreForGroup(studentCode, group, scoreMap) {
    const studentScores = scoreMap.get(studentCode);
    if (!studentScores) return null;
    for (const draftId of group.draftIds) {
      if (studentScores.has(draftId)) {
        const score = studentScores.get(draftId);
        if (typeof score === "number") return score;
      }
    }
    return null;
  }

  /**
   * Format a score cell for CSV/PDF/Print export.
   *
   * @param {number|null} score - percentage 0-100, or null
   * @param {number|null} totalPossible - max points, or null
   * @returns {string} e.g. "17/20 (85%)", "85%", or "—"
   */
  function formatScoreCell(score, totalPossible) {
    if (score === null) return "—";
    if (totalPossible) {
      const earned = Math.round(score * totalPossible / 100);
      return `${earned}/${totalPossible} (${score}%)`;
    }
    return `${score}%`;
  }

  /**
   * Open the Export / Print modal.
   */
  function openExportModal() {
    // Remove any existing overlay
    const existing = document.getElementById("exportModalOverlay");
    if (existing) existing.remove();

    // ── Snapshot current gradebook state as defaults ──────────────────────
    const defaultQuarter = currentQuarterFilter || "";
    const defaultClass = currentClassFilter || "All Classes";

    // State for the modal
    const state = {
      dateMode: defaultQuarter ? "quarter" : "all",
      selectedQuarter: defaultQuarter,
      dateStart: "",
      dateEnd: "",
      selectedWeeks: [],      // week numbers (integers) when dateMode === "weeks"
      studentMode: defaultClass !== "All Classes" ? "class" : "all",
      selectedClass: defaultClass,
      selectedStudentCodes: [],  // used when studentMode === "individual"
      colScores: true,
      colAverage: true,
      colWeighted: false,
      colTrend: false,
      nameFormat: "code",  // "code" | "name" | "both"
    };

    // ── Overlay ───────────────────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.id = "exportModalOverlay";
    overlay.className = "gb-export-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "exportModalTitle");

    const card = document.createElement("div");
    card.className = "gb-export-card";

    // ── Header ────────────────────────────────────────────────────────────
    const header = document.createElement("div");
    header.className = "gb-export-header";
    const titleEl = document.createElement("h2");
    titleEl.id = "exportModalTitle";
    titleEl.className = "gb-export-title";
    titleEl.textContent = "📤 Export / Print";
    header.appendChild(titleEl);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "gb-export-close";
    closeBtn.setAttribute("aria-label", "Close export dialog");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => overlay.remove());
    header.appendChild(closeBtn);
    card.appendChild(header);

    // ── Helper: create collapsible section ────────────────────────────────
    function makeSection(emoji, title, startOpen) {
      const wrap = document.createElement("div");
      wrap.className = "gb-export-section";

      const hdr = document.createElement("div");
      hdr.className = "gb-export-section-header";
      hdr.setAttribute("role", "button");
      hdr.setAttribute("tabindex", "0");
      const labelSpan = document.createElement("span");
      labelSpan.textContent = `${emoji} ${title}`;
      hdr.appendChild(labelSpan);
      const chevron = document.createElement("span");
      chevron.className = "gb-export-section-chevron" + (startOpen ? " open" : "");
      chevron.textContent = "▼";
      hdr.appendChild(chevron);

      const body = document.createElement("div");
      body.className = "gb-export-section-body" + (startOpen ? " open" : "");

      const toggle = () => {
        const isOpen = body.classList.contains("open");
        body.classList.toggle("open", !isOpen);
        chevron.classList.toggle("open", !isOpen);
      };
      hdr.addEventListener("click", toggle);
      hdr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });

      wrap.appendChild(hdr);
      wrap.appendChild(body);
      card.appendChild(wrap);
      return body;
    }

    // ── Section A: Date Range ─────────────────────────────────────────────
    const dateBody = makeSection("📅", "Date Range", true);

    const presetRow = document.createElement("div");
    presetRow.className = "gb-export-preset-row";

    const quarterOptions = [
      { label: "All Quarters", value: "" },
      { label: "Q1", value: "Q1" },
      { label: "Q2", value: "Q2" },
      { label: "Q3", value: "Q3" },
      { label: "Q4", value: "Q4" },
    ];

    const dateStartInput = document.createElement("input");
    const dateEndInput = document.createElement("input");

    // Detect available week numbers from all loaded assignments
    const availableWeeks = [];
    {
      const weekSeen = new Set();
      for (const d of draftsData) {
        const m = (d.title || "").match(/WEEK\s*(\d+)/i);
        if (m) {
          const wn = Number(m[1]);
          const sizeBefore = weekSeen.size;
          weekSeen.add(wn);
          if (weekSeen.size > sizeBefore) availableWeeks.push(wn);
        }
      }
      availableWeeks.sort((a, b) => a - b);
    }

    // Track which preset is active
    const presetBtns = [];
    for (const qo of quarterOptions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gb-export-preset";
      btn.textContent = qo.label || "All Quarters";
      btn.dataset.qval = qo.value;
      btn.addEventListener("click", () => {
        state.dateMode = qo.value ? "quarter" : "all";
        state.selectedQuarter = qo.value;
        dateStartInput.value = "";
        dateEndInput.value = "";
        state.dateStart = "";
        state.dateEnd = "";
        presetBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        weekSubSection.style.display = "none";
        updatePreview();
      });
      presetBtns.push(btn);
      presetRow.appendChild(btn);
    }

    // "By Week" button (only shown when week numbers are available)
    const weekModeBtn = document.createElement("button");
    weekModeBtn.type = "button";
    weekModeBtn.className = "gb-export-preset";
    weekModeBtn.textContent = "By Week";
    weekModeBtn.dataset.weekmode = "true";
    weekModeBtn.addEventListener("click", () => {
      state.dateMode = "weeks";
      state.selectedQuarter = "";
      dateStartInput.value = "";
      dateEndInput.value = "";
      state.dateStart = "";
      state.dateEnd = "";
      presetBtns.forEach((b) => b.classList.remove("active"));
      weekModeBtn.classList.add("active");
      weekSubSection.style.display = "";
      updatePreview();
    });
    if (availableWeeks.length > 0) {
      presetBtns.push(weekModeBtn);
      presetRow.appendChild(weekModeBtn);
    }

    // Set initial active preset btn
    presetBtns.forEach((b) => {
      const isAll = b.dataset.qval === "" && (state.dateMode === "all" || state.selectedQuarter === "");
      const isQ = b.dataset.qval !== "" && b.dataset.qval === state.selectedQuarter;
      if (isAll || isQ) b.classList.add("active");
      else b.classList.remove("active");
    });

    dateBody.appendChild(presetRow);

    // Week sub-section (shown when "By Week" is active)
    const weekSubSection = document.createElement("div");
    weekSubSection.style.display = "none";
    weekSubSection.style.margin = "8px 0 4px";

    if (availableWeeks.length > 0) {
      const weekLabel = document.createElement("span");
      weekLabel.className = "gb-export-label";
      weekLabel.textContent = "Select Weeks";
      weekSubSection.appendChild(weekLabel);

      const weekCheckGroup = document.createElement("div");
      weekCheckGroup.className = "gb-export-checkbox-group";
      weekCheckGroup.style.flexWrap = "wrap";
      weekCheckGroup.style.gap = "6px 16px";

      for (const wn of availableWeeks) {
        const item = document.createElement("label");
        item.className = "gb-export-checkbox-item";
        item.style.minWidth = "70px";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = String(wn);
        cb.checked = state.selectedWeeks.includes(wn);
        cb.addEventListener("change", () => {
          if (cb.checked) {
            if (!state.selectedWeeks.includes(wn)) state.selectedWeeks.push(wn);
          } else {
            state.selectedWeeks = state.selectedWeeks.filter((w) => w !== wn);
          }
          updatePreview();
        });
        item.appendChild(cb);
        item.appendChild(document.createTextNode(` Week ${wn}`));
        weekCheckGroup.appendChild(item);
      }
      weekSubSection.appendChild(weekCheckGroup);
      dateBody.appendChild(weekSubSection);
    }

    // Custom date range
    const customLabel = document.createElement("span");
    customLabel.className = "gb-export-label";
    customLabel.textContent = "Custom Date Range";
    dateBody.appendChild(customLabel);

    const dateRow = document.createElement("div");
    dateRow.className = "gb-export-date-row";

    function makeDateGroup(labelText, inputEl, stateKey) {
      const grp = document.createElement("div");
      grp.className = "gb-export-date-group";
      const lbl = document.createElement("label");
      lbl.textContent = labelText;
      lbl.style.fontSize = "12px";
      lbl.style.opacity = "0.7";
      grp.appendChild(lbl);
      inputEl.type = "date";
      inputEl.className = "gb-export-date-input";
      lbl.htmlFor = "exportDate_" + stateKey;
      inputEl.id = "exportDate_" + stateKey;
      inputEl.addEventListener("change", () => {
        state[stateKey] = inputEl.value;
        if (inputEl.value) {
          state.dateMode = "custom";
          state.selectedQuarter = "";
          presetBtns.forEach((b) => b.classList.remove("active"));
          weekSubSection.style.display = "none";
        }
        updatePreview();
      });
      grp.appendChild(inputEl);
      return grp;
    }

    dateRow.appendChild(makeDateGroup("Start Date", dateStartInput, "dateStart"));
    dateRow.appendChild(makeDateGroup("End Date", dateEndInput, "dateEnd"));
    dateBody.appendChild(dateRow);

    // ── Section B: Student Selection ──────────────────────────────────────
    const studentBody = makeSection("👥", "Student Selection", true);

    const studentModeGroup = document.createElement("div");
    studentModeGroup.className = "gb-export-radio-group";
    studentModeGroup.style.marginBottom = "12px";

    const studentModes = [
      { value: "all", label: "All Students" },
      { value: "class", label: "By Class" },
      { value: "individual", label: "Individual Students" },
    ];

    let classSubSection, individualSubSection;

    const studentModeRadios = [];
    for (const sm of studentModes) {
      const item = document.createElement("label");
      item.className = "gb-export-radio-item";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "exportStudentMode";
      radio.value = sm.value;
      radio.checked = state.studentMode === sm.value;
      studentModeRadios.push(radio);
      radio.addEventListener("change", () => {
        if (radio.checked) {
          state.studentMode = sm.value;
          classSubSection.style.display = sm.value === "class" ? "" : "none";
          individualSubSection.style.display = sm.value === "individual" ? "" : "none";
          updatePreview();
        }
      });
      item.appendChild(radio);
      const labelText = document.createTextNode(sm.label);
      item.appendChild(labelText);
      studentModeGroup.appendChild(item);
    }
    studentBody.appendChild(studentModeGroup);

    // Class sub-section
    classSubSection = document.createElement("div");
    classSubSection.style.display = state.studentMode === "class" ? "" : "none";
    classSubSection.style.marginBottom = "12px";
    const classLabel = document.createElement("span");
    classLabel.className = "gb-export-label";
    classLabel.textContent = "Select Class";
    classSubSection.appendChild(classLabel);

    const classRadioGroup = document.createElement("div");
    classRadioGroup.className = "gb-export-radio-group";
    const classOptions = ["All Classes", ...CANON_CLASSES];
    for (const cls of classOptions) {
      const item = document.createElement("label");
      item.className = "gb-export-radio-item";
      item.style.fontSize = "13px";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "exportClassChoice";
      radio.value = cls;
      radio.checked = state.selectedClass === cls;
      radio.addEventListener("change", () => {
        if (radio.checked) { state.selectedClass = cls; updatePreview(); }
      });
      item.appendChild(radio);
      item.appendChild(document.createTextNode(cls));
      classRadioGroup.appendChild(item);
    }
    classSubSection.appendChild(classRadioGroup);
    studentBody.appendChild(classSubSection);

    // Individual sub-section (searchable checklist)
    individualSubSection = document.createElement("div");
    individualSubSection.style.display = state.studentMode === "individual" ? "" : "none";
    const indivLabel = document.createElement("span");
    indivLabel.className = "gb-export-label";
    indivLabel.textContent = "Select Students";
    individualSubSection.appendChild(indivLabel);

    const studentSearchInput = document.createElement("input");
    studentSearchInput.type = "text";
    studentSearchInput.className = "gb-export-student-search";
    studentSearchInput.placeholder = "🔍 Search students…";
    studentSearchInput.setAttribute("aria-label", "Search students");
    individualSubSection.appendChild(studentSearchInput);

    // Select all / none controls
    const selAllRow = document.createElement("div");
    selAllRow.style.cssText = "display:flex;gap:8px;margin-bottom:8px;";
    const selAllBtn = document.createElement("button");
    selAllBtn.type = "button";
    selAllBtn.className = "gb-export-preset";
    selAllBtn.textContent = "Select All";
    const selNoneBtn = document.createElement("button");
    selNoneBtn.type = "button";
    selNoneBtn.className = "gb-export-preset";
    selNoneBtn.textContent = "Clear";
    selAllRow.appendChild(selAllBtn);
    selAllRow.appendChild(selNoneBtn);
    individualSubSection.appendChild(selAllRow);

    const studentChecklist = document.createElement("div");
    studentChecklist.className = "gb-export-checklist";
    studentChecklist.setAttribute("role", "group");
    studentChecklist.setAttribute("aria-label", "Student list");

    const studentCheckboxes = new Map(); // code -> checkbox el

    function buildStudentChecklist(filter) {
      studentChecklist.innerHTML = "";
      for (const student of studentsData) {
        const code = student.code || "";
        const name = student.name || "";
        const searchStr = (code + " " + name).toLowerCase();
        if (filter && !searchStr.includes(filter.toLowerCase())) continue;
        const item = document.createElement("label");
        item.className = "gb-export-checklist-item";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = code;
        cb.checked = state.selectedStudentCodes.includes(code);
        studentCheckboxes.set(code, cb);
        cb.addEventListener("change", () => {
          if (cb.checked) {
            if (!state.selectedStudentCodes.includes(code)) state.selectedStudentCodes.push(code);
          } else {
            state.selectedStudentCodes = state.selectedStudentCodes.filter((c) => c !== code);
          }
          updatePreview();
        });
        item.appendChild(cb);
        const nameEl = document.createElement("span");
        nameEl.textContent = name ? `${code} — ${name}` : code;
        item.appendChild(nameEl);
        studentChecklist.appendChild(item);
      }
    }

    buildStudentChecklist("");
    studentSearchInput.addEventListener("input", () => buildStudentChecklist(studentSearchInput.value));

    selAllBtn.addEventListener("click", () => {
      const visibleCodes = [];
      studentChecklist.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
        visibleCodes.push(cb.value);
      });
      // Merge with any already selected
      for (const c of visibleCodes) {
        if (!state.selectedStudentCodes.includes(c)) state.selectedStudentCodes.push(c);
      }
      updatePreview();
    });
    selNoneBtn.addEventListener("click", () => {
      studentChecklist.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
      state.selectedStudentCodes = [];
      updatePreview();
    });

    individualSubSection.appendChild(studentChecklist);
    studentBody.appendChild(individualSubSection);

    // ── Section C: Data Columns ───────────────────────────────────────────
    const colBody = makeSection("📊", "Data Columns", false);
    const colGroup = document.createElement("div");
    colGroup.className = "gb-export-checkbox-group";

    const columnDefs = [
      { key: "colScores", label: "Individual assignment scores" },
      { key: "colAverage", label: "Average" },
      { key: "colWeighted", label: "Weighted Average" },
      { key: "colTrend", label: "Trend" },
    ];

    for (const col of columnDefs) {
      const item = document.createElement("label");
      item.className = "gb-export-checkbox-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state[col.key];
      cb.addEventListener("change", () => { state[col.key] = cb.checked; updatePreview(); });
      item.appendChild(cb);
      item.appendChild(document.createTextNode(col.label));
      colGroup.appendChild(item);
    }
    colBody.appendChild(colGroup);

    // ── Section D: Student Name Format ────────────────────────────────────
    const nameBody = makeSection("🏷️", "Student Name Format", false);
    const nameGroup = document.createElement("div");
    nameGroup.className = "gb-export-radio-group";

    const nameFormats = [
      { value: "code", label: "Code only (e.g. S001)" },
      { value: "name", label: "Real name only (e.g. Alex Smith)" },
      { value: "both", label: "Both (e.g. Alex Smith (S001))" },
    ];
    for (const nf of nameFormats) {
      const item = document.createElement("label");
      item.className = "gb-export-radio-item";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "exportNameFormat";
      radio.value = nf.value;
      radio.checked = state.nameFormat === nf.value;
      radio.addEventListener("change", () => { if (radio.checked) state.nameFormat = nf.value; });
      item.appendChild(radio);
      item.appendChild(document.createTextNode(nf.label));
      nameGroup.appendChild(item);
    }
    nameBody.appendChild(nameGroup);

    // ── Section E: Export Format ──────────────────────────────────────────
    const fmtBody = makeSection("💾", "Export Format", true);
    const fmtGrid = document.createElement("div");
    fmtGrid.className = "gb-export-format-grid";

    const formats = [
      {
        id: "csv",
        icon: "📄",
        label: "CSV",
        desc: "Standard spreadsheet file",
        action: () => runExport("csv"),
      },
      {
        id: "vlookup",
        icon: "🔗",
        label: "CSV + VLOOKUP",
        desc: "Includes lookup table pre-filled with student names from database",
        action: () => runExport("vlookup"),
      },
      {
        id: "pdf",
        icon: "🖨️",
        label: "PDF",
        desc: "Save as PDF document",
        action: () => runExport("pdf"),
      },
      {
        id: "print",
        icon: "🖨️",
        label: "Print",
        desc: "Open print dialog",
        action: () => runExport("print"),
      },
    ];

    for (const fmt of formats) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gb-export-format-btn";
      const iconEl = document.createElement("div");
      iconEl.className = "gb-export-format-icon";
      iconEl.textContent = fmt.icon;
      const labelEl = document.createElement("div");
      labelEl.textContent = fmt.label;
      const descEl = document.createElement("div");
      descEl.className = "gb-export-format-desc";
      descEl.textContent = fmt.desc;
      btn.appendChild(iconEl);
      btn.appendChild(labelEl);
      btn.appendChild(descEl);
      btn.addEventListener("click", fmt.action);
      fmtGrid.appendChild(btn);
    }
    fmtBody.appendChild(fmtGrid);

    // ── Footer: Preview + Cancel ──────────────────────────────────────────
    const footer = document.createElement("div");
    footer.className = "gb-export-footer";

    const previewEl = document.createElement("div");
    previewEl.className = "gb-export-preview";
    footer.appendChild(previewEl);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "gb-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => overlay.remove());
    footer.appendChild(cancelBtn);

    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    // ── Preview counter ───────────────────────────────────────────────────
    function updatePreview() {
      const students = getExportStudents(state);
      const drafts = getExportDrafts(state);
      previewEl.textContent = `Preview: ${students.length} student${students.length !== 1 ? "s" : ""} × ${drafts.length} assignment${drafts.length !== 1 ? "s" : ""}`;
    }
    updatePreview();

    // ── Run the chosen export ─────────────────────────────────────────────
    async function runExport(format) {
      const students = getExportStudents(state);
      const drafts = getExportDrafts(state);

      if (!students.length) {
        await rcAlert("No Data", "No students match the current selection.");
        return;
      }

      const opts = { ...state, students, drafts };

      if (format === "csv") {
        overlay.remove();
        await exportToCSVWithOptions(opts);
      } else if (format === "vlookup") {
        overlay.remove();
        await exportToCSVWithVLOOKUP(opts);
      } else if (format === "pdf") {
        overlay.remove();
        await exportToPDFWithOptions(opts);
      } else if (format === "print") {
        overlay.remove();
        printWithOptions(opts);
      }
    }

    // Focus first interactive element
    closeBtn.focus();
  }

  // ─── Export: Bell schedule order and class grouping ─────────────────────────

  // Bell schedule order for class-grouped exports.
  // Classes not in this list appear alphabetically after these.
  const BELL_SCHEDULE_ORDER = [
    "Language Arts 1 SC",
    "Language Arts 2 SC",
    "Language Arts 3 SC",
    "Language Arts 4 SC",
    "Life Skills Language Arts SC",
    "Life Skills",
    "Consumer Math",
    "Geometry SC",
    "Speech/Language",
    "Warrior Academy",
  ];

  /**
   * Group a list of students by their enrolled class, sorted in bell schedule order.
   * Falls back to a single group (no class header) if enrollment data is unavailable.
   *
   * @param {Array} students
   * @returns {Array} Array of { className: string|null, students: Array }
   */
  function getClassGroupsForExport(students) {
    const studentCodes = new Set(students.map((s) => s.code));
    const classStudentMap = new Map();
    for (const enrollment of classEnrollmentsData) {
      if (enrollment.active === false) continue;
      if (!studentCodes.has(enrollment.student_code)) continue;
      if (!classStudentMap.has(enrollment.class_name)) {
        classStudentMap.set(enrollment.class_name, new Set());
      }
      classStudentMap.get(enrollment.class_name).add(enrollment.student_code);
    }

    if (classStudentMap.size === 0) {
      // No enrollment data — return all students as a single ungrouped section
      return [{ className: null, students: [...students].sort((a, b) => (a.code || "").localeCompare(b.code || "")) }];
    }

    const allClassNames = [...classStudentMap.keys()];
    const orderedClassNames = [
      ...BELL_SCHEDULE_ORDER.filter((c) => allClassNames.includes(c)),
      ...allClassNames.filter((c) => !BELL_SCHEDULE_ORDER.includes(c)).sort(),
    ];

    return orderedClassNames
      .map((cls) => ({
        className: cls,
        students: students
          .filter((s) => classStudentMap.get(cls)?.has(s.code))
          .sort((a, b) => (a.code || "").localeCompare(b.code || "")),
      }))
      .filter((g) => g.students.length > 0);
  }

  // ─── Export: Standard CSV with options ──────────────────────────────────────

  async function exportToCSVWithOptions(opts) {
    const { students, drafts, nameFormat, colScores, colAverage, colWeighted, colTrend } = opts;

    // Build scoreMap for these students/drafts
    const scoreMap = buildScoreMapForStudents(students, drafts);

    // Deduplicate assignments: collapse per-student instances of the same assignment
    const groups = deduplicateAssignmentsForExport(drafts);
    backfillGroupTotalPossible(groups);

    const rows = [];
    const headers = ["Student Code"];
    if (colScores) {
      for (const group of groups) {
        let headerLabel = group.title;
        if (group.totalPossible) headerLabel += ` (/${group.totalPossible})`;
        headers.push(headerLabel);
      }
    }
    if (colAverage) headers.push("Average");
    if (colWeighted) headers.push("Weighted");
    if (colTrend) headers.push("Trend");
    rows.push(headers);

    // Group students by class in bell schedule order
    const classGroups = getClassGroupsForExport(students);
    const useClassHeaders = classGroups.length > 1 || (classGroups.length === 1 && classGroups[0].className);

    for (const { className, students: classStudents } of classGroups) {
      if (useClassHeaders && className) {
        // Class header row
        const classHeaderRow = [className];
        for (let i = 1; i < headers.length; i++) classHeaderRow.push("");
        rows.push(classHeaderRow);
      }

      for (const student of classStudents) {
        const row = [formatStudentLabel(student, nameFormat)];
        if (colScores) {
          for (const group of groups) {
            const score = getStudentScoreForGroup(student.code, group, scoreMap);
            row.push(score !== null ? formatScoreCell(score, group.totalPossible) : "—");
          }
        }
        if (colAverage) {
          const avg = calculateRowAverage(student.code, scoreMap, drafts);
          row.push(avg !== null ? `${avg}%` : "");
        }
        if (colWeighted) {
          const w = calculateWeightedAverage(student.code, scoreMap, drafts);
          row.push(w !== null ? `${w}%` : "");
        }
        if (colTrend) {
          row.push(calculateTrend(student.code, scoreMap, drafts) || "");
        }
        rows.push(row);
      }

      // Class average row
      if (useClassHeaders) {
        const summaryRow = ["Class Average"];
        if (colScores) {
          for (const group of groups) {
            const scores = classStudents
              .map((s) => getStudentScoreForGroup(s.code, group, scoreMap))
              .filter((v) => v !== null);
            summaryRow.push(scores.length > 0 ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%` : "");
          }
        }
        if (colAverage) {
          const avgs = classStudents.map((s) => calculateRowAverage(s.code, scoreMap, drafts)).filter((v) => v !== null);
          summaryRow.push(avgs.length > 0 ? `${Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length)}%` : "");
        }
        if (colWeighted) {
          const ws = classStudents.map((s) => calculateWeightedAverage(s.code, scoreMap, drafts)).filter((v) => v !== null);
          summaryRow.push(ws.length > 0 ? `${Math.round(ws.reduce((a, b) => a + b, 0) / ws.length)}%` : "");
        }
        if (colTrend) summaryRow.push("—");
        rows.push(summaryRow);
        rows.push([]); // blank separator between class sections
      }
    }

    // If not using class headers, add a single overall summary row
    if (!useClassHeaders) {
      const summaryRow = ["Class Average"];
      if (colScores) {
        for (const group of groups) {
          const scores = students
            .map((s) => getStudentScoreForGroup(s.code, group, scoreMap))
            .filter((v) => v !== null);
          summaryRow.push(scores.length > 0 ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%` : "");
        }
      }
      if (colAverage) {
        const avgs = students.map((s) => calculateRowAverage(s.code, scoreMap, drafts)).filter((v) => v !== null);
        summaryRow.push(avgs.length > 0 ? `${Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length)}%` : "");
      }
      if (colWeighted) {
        const ws = students.map((s) => calculateWeightedAverage(s.code, scoreMap, drafts)).filter((v) => v !== null);
        summaryRow.push(ws.length > 0 ? `${Math.round(ws.reduce((a, b) => a + b, 0) / ws.length)}%` : "");
      }
      if (colTrend) summaryRow.push("—");
      rows.push(summaryRow);
    }

    const csvContent = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const safeLabel = (opts.selectedClass || "gradebook").replace(/[^a-zA-Z0-9]/g, "-");
    download(`gradebook-${safeLabel}-${nowISO()}.csv`, csvContent);
  }

  // ─── Export: CSV with VLOOKUP ───────────────────────────────────────────────

  async function exportToCSVWithVLOOKUP(opts) {
    const { students, drafts, colScores, colAverage, colWeighted, colTrend } = opts;

    const scoreMap = buildScoreMapForStudents(students, drafts);

    // Deduplicate assignments: collapse per-student instances of the same assignment
    const groups = deduplicateAssignmentsForExport(drafts);
    backfillGroupTotalPossible(groups);

    // ── Column layout ────────────────────────────────────────────────────
    // Col 0 (A): Student Code
    // Col 1 (B): Name — VLOOKUP formula referencing lookup columns in this sheet
    // Col 2..N: Grade columns
    // Col N+1: blank separator
    // Col N+2: Lookup Code (student code)
    // Col N+3: Lookup Name (student real name — the ONLY place names appear)

    const gradeHeaders = [];
    if (colScores) {
      for (const group of groups) {
        let h = group.title;
        if (group.totalPossible) h += ` (/${group.totalPossible})`;
        gradeHeaders.push(h);
      }
    }
    if (colAverage) gradeHeaders.push("Average");
    if (colWeighted) gradeHeaders.push("Weighted");
    if (colTrend) gradeHeaders.push("Trend");

    const gradeCount = gradeHeaders.length;
    const lookupCodeCol = 2 + gradeCount + 1; // one blank separator column
    const lookupNameCol = lookupCodeCol + 1;
    const totalCols = lookupNameCol + 1;

    const lookupCodeLetter = colIndexToLetter(lookupCodeCol);
    const lookupNameLetter = colIndexToLetter(lookupNameCol);

    function emptyRow(len) { return Array(len).fill(""); }

    // ── Header row ───────────────────────────────────────────────────────
    const headerRow = emptyRow(totalCols);
    headerRow[0] = "Student Code";
    headerRow[1] = "Name";
    let ci = 2;
    for (const h of gradeHeaders) { headerRow[ci++] = h; }
    headerRow[lookupCodeCol] = "Lookup Code";
    headerRow[lookupNameCol] = "Lookup Name";

    const rows = [headerRow];

    // ── Build student name map from enrollment data (has real names from DB join) ──
    // Enrollment records where student_name equals student_code indicate a
    // missing/placeholder name (fallback from the data-adapter), so we skip those.
    const studentNameMap = new Map();
    for (const enrollment of classEnrollmentsData) {
      if (enrollment.student_code && enrollment.student_name &&
          enrollment.student_name !== enrollment.student_code) {
        studentNameMap.set(enrollment.student_code, enrollment.student_name);
      }
    }
    // Fallback: use studentsData for any codes not resolved from enrollments
    for (const student of students) {
      if (student.code && student.name && !studentNameMap.has(student.code)) {
        studentNameMap.set(student.code, student.name);
      }
    }

    // ── Group students by class in bell schedule order ────────────────────
    const classGroups = getClassGroupsForExport(students);
    const useClassHeaders = classGroups.length > 1 || (classGroups.length === 1 && classGroups[0].className);

    // Use a generous upper bound for LOOKUP_RANGE so that any off-by-one in row
    // counting (blank separators, summary rows, etc.) doesn't exclude students
    // at the bottom. VLOOKUP with FALSE (exact match) tolerates extra empty rows.
    const LOOKUP_RANGE = `$${lookupCodeLetter}$2:$${lookupNameLetter}$1000`;

    for (const { className, students: classStudents } of classGroups) {
      // Class header row
      if (useClassHeaders && className) {
        const classRow = emptyRow(totalCols);
        classRow[0] = className;
        classRow[1] = className;  // Prevent VLOOKUP #ERROR! by filling Name column
        rows.push(classRow);
      }

      // Student rows
      for (const student of classStudents) {
        const currentRow = rows.length + 1; // 1-based spreadsheet row number
        const row = emptyRow(totalCols);
        row[0] = student.code || "";
        // VLOOKUP formula: looks up student code in lookup columns of this sheet
        row[1] = `=VLOOKUP(A${currentRow},${LOOKUP_RANGE},2,FALSE)`;

        let gi = 2;
        if (colScores) {
          const studentEarned = earnedMap.get(student.code);
          for (const group of groups) {
            const score = getStudentScoreForGroup(student.code, group, scoreMap);
            if (score !== null) {
              let tp = group.totalPossible;
              let earnedPts = null;
              if (!tp && studentEarned) {
                for (const draftId of group.draftIds) {
                  const ep = studentEarned.get(draftId);
                  if (ep) { tp = ep.possible; earnedPts = ep.earned; break; }
                }
              }
              row[gi] = tp
                ? `${earnedPts !== null ? earnedPts : calculateEarnedPoints(score, tp)}/${tp} (${score}%)`
                : `${score}%`;
            } else {
              row[gi] = "—";
            }
            gi++;
          }
        }
        if (colAverage) {
          const avg = calculateRowAverage(student.code, scoreMap, drafts);
          row[gi++] = avg !== null ? `${avg}%` : "";
        }
        if (colWeighted) {
          const w = calculateWeightedAverage(student.code, scoreMap, drafts);
          row[gi++] = w !== null ? `${w}%` : "";
        }
        if (colTrend) {
          row[gi++] = calculateTrend(student.code, scoreMap, drafts) || "";
        }
        // Lookup table: code + name (PII only in these two columns)
        row[lookupCodeCol] = student.code || "";
        // Name: prefer enrollment record (real name from DB), then student.name, then
        // leave blank so the teacher can fill it in — intentionally NOT falling back to
        // student.code, since that was the original bug (names showing as codes).
        row[lookupNameCol] = studentNameMap.get(student.code) || student.name || "";
        rows.push(row);
      }

      // Class average row
      if (useClassHeaders) {
        const avgRow = emptyRow(totalCols);
        avgRow[0] = "Class Average";
        let si = 2;
        if (colScores) {
          for (const group of groups) {
            const scores = classStudents
              .map((s) => getStudentScoreForGroup(s.code, group, scoreMap))
              .filter((v) => v !== null);
            avgRow[si++] = scores.length > 0 ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%` : "";
          }
        }
        if (colAverage) {
          const avgs = classStudents.map((s) => calculateRowAverage(s.code, scoreMap, drafts)).filter((v) => v !== null);
          avgRow[si++] = avgs.length > 0 ? `${Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length)}%` : "";
        }
        if (colWeighted) {
          const ws = classStudents.map((s) => calculateWeightedAverage(s.code, scoreMap, drafts)).filter((v) => v !== null);
          avgRow[si++] = ws.length > 0 ? `${Math.round(ws.reduce((a, b) => a + b, 0) / ws.length)}%` : "";
        }
        if (colTrend) avgRow[si++] = "—";
        rows.push(avgRow);
        rows.push(emptyRow(totalCols)); // blank separator between class sections
      }
    }

    // If not using class headers, add a single overall summary row
    if (!useClassHeaders) {
      const summaryRow = emptyRow(totalCols);
      summaryRow[0] = "Class Average";
      let si = 2;
      if (colScores) {
        for (const group of groups) {
          const scores = students
            .map((s) => getStudentScoreForGroup(s.code, group, scoreMap))
            .filter((v) => v !== null);
          summaryRow[si++] = scores.length > 0 ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%` : "";
        }
      }
      if (colAverage) {
        const avgs = students.map((s) => calculateRowAverage(s.code, scoreMap, drafts)).filter((v) => v !== null);
        summaryRow[si++] = avgs.length > 0 ? `${Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length)}%` : "";
      }
      if (colWeighted) {
        const ws = students.map((s) => calculateWeightedAverage(s.code, scoreMap, drafts)).filter((v) => v !== null);
        summaryRow[si++] = ws.length > 0 ? `${Math.round(ws.reduce((a, b) => a + b, 0) / ws.length)}%` : "";
      }
      if (colTrend) summaryRow[si++] = "—";
      rows.push(summaryRow);
    }

    const csvContent = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const safeLabel = (opts.selectedClass || "gradebook").replace(/[^a-zA-Z0-9]/g, "-");
    download(`gradebook-vlookup-${safeLabel}-${nowISO()}.csv`, csvContent);
  }

  // ─── Export: PDF with options ────────────────────────────────────────────────

  async function exportToPDFWithOptions(opts) {
    const { students, drafts, nameFormat, colScores, colAverage, colWeighted, colTrend } = opts;
    const PDF_LANDSCAPE_USABLE_WIDTH = 280;
    const PDF_MAX_PAGE_HEIGHT = 190;

    if (!students.length) {
      await rcAlert("No Data", "No data to export.");
      return;
    }

    const scoreMap = buildScoreMapForStudents(students, drafts);

    // Deduplicate assignments: collapse per-student instances of the same assignment
    const groups = deduplicateAssignmentsForExport(drafts);
    backfillGroupTotalPossible(groups);

    try {
      const { jsPDF } = await import("../vendor/jspdf.mjs");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      const classLabel = opts.selectedClass || "All Classes";
      doc.setFontSize(16);
      doc.text(`Gradebook — ${classLabel}`, 15, 15);
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 15, 22);

      const headers = ["Student"];
      if (colScores) {
        for (const group of groups) {
          let lbl = group.title.substring(0, 20);
          if (group.totalPossible) lbl += ` ${group.totalPossible}pt`;
          headers.push(lbl);
        }
      }
      if (colAverage) headers.push("Avg");
      if (colWeighted) headers.push("Wtd");
      if (colTrend) headers.push("Trend");

      const tableData = [];
      for (const student of students) {
        const row = [formatStudentLabel(student, nameFormat)];
        if (colScores) {
          for (const group of groups) {
            const score = getStudentScoreForGroup(student.code, group, scoreMap);
            row.push(score !== null ? formatScoreCell(score, group.totalPossible) : "—");
          }
        }
        if (colAverage) {
          const avg = calculateRowAverage(student.code, scoreMap, drafts);
          row.push(avg !== null ? `${avg}%` : "—");
        }
        if (colWeighted) {
          const w = calculateWeightedAverage(student.code, scoreMap, drafts);
          row.push(w !== null ? `${w}%` : "—");
        }
        if (colTrend) row.push(calculateTrend(student.code, scoreMap, drafts) || "—");
        tableData.push(row);
      }

      if (doc.autoTable) {
        doc.autoTable({ head: [headers], body: tableData, startY: 28, theme: "grid", headStyles: { fillColor: [34, 197, 94] }, styles: { fontSize: 8, cellPadding: 2 } });
      } else {
        doc.setFontSize(8);
        let y = 28;
        const colWidth = PDF_LANDSCAPE_USABLE_WIDTH / headers.length;
        let x = 15;
        doc.setFont(undefined, "bold");
        for (const h of headers) { doc.text(h.substring(0, 15), x, y); x += colWidth; }
        y += 6;
        doc.setFont(undefined, "normal");
        for (const row of tableData) {
          x = 15;
          for (const cell of row) { doc.text(String(cell).substring(0, 15), x, y); x += colWidth; }
          y += 5;
          if (y > PDF_MAX_PAGE_HEIGHT) break;
        }
      }

      const safeLabel = classLabel.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
      doc.save(`gradebook-${safeLabel}-${nowISO()}.pdf`);
    } catch (err) {
      console.error("[gradebook] PDF export error:", err);
      if (await rcConfirm("PDF Library Not Available", "jsPDF library not available. Would you like to use the browser Print dialog instead?", "Use Print Dialog")) {
        window.print();
      } else {
        await rcAlert("PDF Not Available", "PDF export requires the jsPDF library. Please use Export CSV or try printing.");
      }
    }
  }

  // ─── Export: Print ───────────────────────────────────────────────────────────

  function printWithOptions(opts) {
    const { students, drafts, nameFormat, colScores, colAverage, colWeighted, colTrend } = opts;
    if (!students.length) return;

    const scoreMap = buildScoreMapForStudents(students, drafts);
    const classLabel = opts.selectedClass || "All Classes";

    // Deduplicate assignments: collapse per-student instances of the same assignment
    const groups = deduplicateAssignmentsForExport(drafts);
    backfillGroupTotalPossible(groups);

    // Build a minimal print window
    const printWin = window.open("", "_blank");
    if (!printWin) {
      window.alert("Please allow popups for this page to use the print feature.");
      return;
    }

    const headers = ["Student"];
    if (colScores) {
      for (const group of groups) {
        let h = group.title;
        if (group.totalPossible) h += ` (${group.totalPossible} pts)`;
        headers.push(h);
      }
    }
    if (colAverage) headers.push("Average");
    if (colWeighted) headers.push("Weighted");
    if (colTrend) headers.push("Trend");

    const dateRange = opts.dateMode === "quarter" && opts.selectedQuarter
      ? opts.selectedQuarter
      : opts.dateMode === "custom"
        ? `${opts.dateStart || "?"} – ${opts.dateEnd || "?"}`
        : "All Quarters";

    // Build the document using DOM APIs to avoid XSS
    // A newly opened blank window already has html/head/body structure
    const doc = printWin.document;

    const head = doc.head;
    const titleEl = doc.createElement("title");
    titleEl.textContent = `Gradebook — ${classLabel}`;
    head.appendChild(titleEl);

    const style = doc.createElement("style");
    style.textContent = [
      "body{font-family:Arial,sans-serif;font-size:12px;margin:16px;color:#000}",
      "h1{font-size:16px;margin-bottom:2px}",
      "p{font-size:11px;color:#555;margin:0 0 12px}",
      "table{border-collapse:collapse;width:100%}",
      "th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;font-size:11px}",
      "th{background:#e8f5e9;font-weight:bold}",
      "tr:nth-child(even){background:#f9f9f9}",
      "@media print{body{margin:0}}",
    ].join("");
    head.appendChild(style);

    const body = doc.body;
    const h1 = doc.createElement("h1");
    h1.textContent = `Gradebook — ${classLabel}`;
    body.appendChild(h1);

    const meta = doc.createElement("p");
    meta.textContent = `Date range: ${dateRange}  |  Generated: ${new Date().toLocaleDateString()}`;
    body.appendChild(meta);

    const table = doc.createElement("table");
    const thead = doc.createElement("thead");
    const headerRow = doc.createElement("tr");
    for (const h of headers) {
      const th = doc.createElement("th");
      th.textContent = h;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = doc.createElement("tbody");
    for (const student of students) {
      const tr = doc.createElement("tr");

      const nameTd = doc.createElement("td");
      nameTd.textContent = formatStudentLabel(student, nameFormat);
      tr.appendChild(nameTd);

      if (colScores) {
        const studentEarned = earnedMap.get(student.code);
        for (const group of groups) {
          const td = doc.createElement("td");
          const score = getStudentScoreForGroup(student.code, group, scoreMap);
          if (score !== null) {
            let tp = group.totalPossible;
            let earnedPts = null;
            if (!tp && studentEarned) {
              for (const draftId of group.draftIds) {
                const ep = studentEarned.get(draftId);
                if (ep) { tp = ep.possible; earnedPts = ep.earned; break; }
              }
            }
            td.textContent = tp
              ? `${earnedPts !== null ? earnedPts : calculateEarnedPoints(score, tp)}/${tp} (${score}%)`
              : `${score}%`;
          } else {
            td.textContent = "—";
          }
          tr.appendChild(td);
        }
      }
      if (colAverage) {
        const avg = calculateRowAverage(student.code, scoreMap, drafts);
        const td = doc.createElement("td");
        td.textContent = avg !== null ? `${avg}%` : "—";
        tr.appendChild(td);
      }
      if (colWeighted) {
        const w = calculateWeightedAverage(student.code, scoreMap, drafts);
        const td = doc.createElement("td");
        td.textContent = w !== null ? `${w}%` : "—";
        tr.appendChild(td);
      }
      if (colTrend) {
        const td = doc.createElement("td");
        td.textContent = calculateTrend(student.code, scoreMap, drafts) || "—";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
    printWin.print();
  }

  // ─── Shared helper: build scoreMap for a given students/drafts subset ────────

  function buildScoreMapForStudents(students, drafts) {
    const studentCodes = new Set(students.map((s) => s.code));
    const draftIds = new Set(drafts.map((d) => d.id));
    const scoreMap = new Map();

    let totalProcessed = 0;
    let droppedNoInstance = 0;
    let droppedNoStudentOrDraft = 0;
    let droppedNotInScope = 0;
    let droppedDuplicate = 0;
    let scored = 0;
    let nullScore = 0;

    for (const submission of submissionsData) {
      totalProcessed++;
      const instance = assignmentInstancesData.find((inst) => inst.id === submission.instance_id);
      let studentCode, draftId;
      if (instance) {
        studentCode = instance.student_code;
        draftId = instance.assignment_id;
      } else {
        const nestedInstance = Array.isArray(submission.assignment_instances)
          ? submission.assignment_instances[0]
          : submission.assignment_instances;
        if (!nestedInstance) {
          droppedNoInstance++;
          continue;
        }
        studentCode = nestedInstance.students?.code || nestedInstance.student_code;
        draftId = nestedInstance.assignment_id || submission.assignment_id;
      }
      if (!studentCode || !draftId) {
        droppedNoStudentOrDraft++;
        continue;
      }
      if (!studentCodes.has(studentCode) || !draftIds.has(draftId)) {
        droppedNotInScope++;
        continue;
      }
      const draftForEligibility =
        drafts.find(
          (draft) => draft.id === draftId
        );

      if (
        !isGradebookScoreEligible(
          submission,
          draftForEligibility
        )
      ) {
        continue;
      }

      if (!scoreMap.has(studentCode)) scoreMap.set(studentCode, new Map());
      if (scoreMap.get(studentCode).has(draftId)) {
        droppedDuplicate++;
        continue; // keep first (most recent)
      }
      let score = submission.score_total ?? submission.score;
      if (score != null) score = Number(score);
      if (isNaN(score)) score = null;
      if (score == null && typeof submission.answers === "object" && submission.answers !== null) {
        const totalQuestions = Object.keys(submission.answers).length;
        if (totalQuestions > 0) {
          const correctAnswers = Object.values(submission.answers).filter(
            (a) => a.correct === true || a.isCorrect === true
          ).length;
          score = Math.round((correctAnswers / totalQuestions) * 100);
        }
      }
      if (score != null) {
        scoreMap.get(studentCode).set(draftId, score);
        scored++;
      } else {
        nullScore++;
      }

      const earnedInfo =
        resolveEarnedInfo(
          submission,
          score,
          drafts.find(
            (draft) => draft.id === draftId
          )
        );

      if (earnedInfo) {
        if (!earnedMap.has(studentCode)) {
          earnedMap.set(studentCode, new Map());
        }

        if (!earnedMap.get(studentCode).has(draftId)) {
          earnedMap
            .get(studentCode)
            .set(draftId, earnedInfo);
        }
      }
    }
    console.log(
      `[gradebook] buildScoreMapForStudents: ${totalProcessed} submissions — ` +
      `${scored} scored, ${nullScore} null-score, ` +
      `${droppedNoInstance} no-instance, ${droppedNoStudentOrDraft} no-student/draft, ` +
      `${droppedNotInScope} out-of-scope, ${droppedDuplicate} duplicate`
    );
    return scoreMap;
  }

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
        const studentEarned = earnedMap.get(student.code);
        for (const draft of ungrouped) {
          if (studentScores && studentScores.has(draft.id)) {
            const score = studentScores.get(draft.id);
            if (typeof score === "number") {
              const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
              const earnedInfo = !totalPossible && studentEarned ? studentEarned.get(draft.id) || null : null;
              if (totalPossible) {
                row.push(`${calculateEarnedPoints(score, totalPossible)}/${totalPossible}`);
              } else if (earnedInfo) {
                row.push(`${earnedInfo.earned}/${earnedInfo.possible} (${score}%)`);
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
      // ── Individual (flat) CSV export — deduplicated by title ────────────────
      // Build CSV header
      const dedupGroups = deduplicateAssignmentsForExport(drafts);
      backfillGroupTotalPossible(dedupGroups);
      const headers = ["Student"];
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
          const score = getStudentScoreForGroup(student.code, group, scoreMap);
          row.push(score !== null ? formatScoreCell(score, group.totalPossible) : "—");
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
        const scores = students
          .map((s) => getStudentScoreForGroup(s.code, group, scoreMap))
          .filter((v) => v !== null);
        summaryRow.push(scores.length > 0 ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%` : "");
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

  // Export gradebook to PDF
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
          const studentEarned = earnedMap.get(student.code);
          for (const draft of ungrouped) {
            if (studentScores && studentScores.has(draft.id)) {
              const score = studentScores.get(draft.id);
              if (typeof score === "number") {
                const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
                const earnedInfo = !totalPossible && studentEarned ? studentEarned.get(draft.id) || null : null;
                if (totalPossible) {
                  row.push(`${calculateEarnedPoints(score, totalPossible)}/${totalPossible}`);
                } else if (earnedInfo) {
                  row.push(`${earnedInfo.earned}/${earnedInfo.possible} (${score}%)`);
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
        for (const draft of drafts) {
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
          const studentScores = scoreMap.get(student.code);
          const studentEarned = earnedMap.get(student.code);
          
          for (const draft of drafts) {
            if (studentScores && studentScores.has(draft.id)) {
              const score = studentScores.get(draft.id);
              if (typeof score === "number") {
                const totalPossible = draft.meta && draft.meta.total_possible ? draft.meta.total_possible : null;
                const earnedInfo = !totalPossible && studentEarned ? studentEarned.get(draft.id) || null : null;
                if (totalPossible) {
                  row.push(`${calculateEarnedPoints(score, totalPossible)}/${totalPossible}`);
                } else if (earnedInfo) {
                  row.push(`${earnedInfo.earned}/${earnedInfo.possible} (${score}%)`);
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
        for (const draft of drafts) {
          const avg = calculateColumnAverage(draft.id, scoreMap, students);
          summaryRow.push(avg !== null ? `${avg}%` : "—");
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

    const metaCategory =
      draft.meta &&
      typeof draft.meta.category === 'string'
        ? draft.meta.category.trim()
        : '';

    if (metaCategory) {
      return metaCategory.toLowerCase();
    }

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
      
      const dueDate = parseAssignmentDeadline(instance.due_at);
      if (!dueDate || dueDate >= now) continue; // Not overdue yet

      // Check if student has submitted
      const submission = submissionsData.find(s => s.assignment_instance_id === instance.id);
      if (submission) continue; // Already submitted

      const student = studentsData.find(s => s.code === instance.student_code);
      const draft = draftsData.find(d => d.id === instance.assignment_id);

      const daysOverdue = Math.max(
        1,
        Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24))
      );

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

      if (usingSupabase) {
        if (!classLabel) {
          errorEl.textContent = 'Class is required when saving a synced manual grade.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = '✅ Save Grade';
          return;
        }

        try {
          const saved = await db.saveManualGrade({
            title,
            class_name: classLabel,
            student_codes: studentCodes,
            total_possible: total,
            score_earned: score,
            date,
            category,
            notes
          });

          savedCount = Number(saved.saved_count) || 0;
        } catch (err) {
          console.error('[gradebook] Error saving synced manual grade:', err);
          errors.push(err.message || 'Manual grade save failed');
        }
      } else {
        // Preserve the established local/offline MANUAL_* workflow.
        for (const studentCode of studentCodes) {
          try {
            const uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()
              : (Date.now().toString(36) + Math.random().toString(36).slice(2, 9)).toUpperCase();

            const assignmentId = 'MANUAL_' + uid;

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

            savedCount++;
          } catch (err) {
            console.error('[gradebook] Error saving local manual grade for', studentCode, err);
            errors.push(studentCode + ': ' + err.message);
          }
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

    // Wire export / print modal button
    const btnExportModal = $("btnExportModal");
    if (btnExportModal) {
      btnExportModal.addEventListener("click", openExportModal);
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
