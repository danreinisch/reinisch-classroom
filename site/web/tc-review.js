(async () => {
  "use strict";

  // Only run on review page
  if (!location.pathname.startsWith("/teacher/review")) return;

  // Import data adapter for Supabase/localStorage abstraction
  const { db, isRemote } = await import('/web/data-adapter.js');
  const { getSupabase, getSupabaseConfig } = await import('/web/supabase-client.js');
  const { getAssignmentItems } = await import('/web/assignment-mapping-db.js');
  const { CANON_CLASSES, CLASS_DISPLAY } = await import('/web/constants.js');
  const { isRealtimeDisabled } = await import('/web/runtime-config.js');
  const { buildItemsFromMeta } = await import('/web/shared-build-items.js');

  // Cached Supabase connection details for direct REST fallback calls.
  // Populated during loadData() once the Supabase client is available.
  let SUPABASE_URL_CACHED = null;
  let SUPABASE_KEY_CACHED = null;

  const NS = "rc_unified_";
  const REALTIME_DEBOUNCE_MS = 1000;
  const FILTER_STORAGE_KEY = 'rc_tc_review_filters_v1';

  // SVG icon helpers
  const SAVE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
  const CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  const X_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  const CLOCK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
  const PAUSE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="10" y1="15" x2="10" y2="9"></line><line x1="14" y1="15" x2="14" y2="9"></line></svg>';
  const RETURN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>';
  const RULER_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>';
  const SKIP_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>';
  const HALF_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><line x1="12" y1="2" x2="12" y2="22"></line></svg>';
  const CHEVRON_RIGHT_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  const CHEVRON_DOWN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const DOT_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="5"/></svg>';
  const INBOX_SVG = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="opacity:0.4"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>';

  const ARCHIVE_SUBMISSION_URL = '/.netlify/functions/teacher-archive-submission';
  const BACKFILL_ITEMS_URL = '/.netlify/functions/admin-backfill-items';
  const SYNTHETIC_ID_PREFIX = 'synthetic_';

  const $ = (id) => document.getElementById(id);

  // Canonical date-only formatter for instructional evidence.
  // Keeps goal progress aligned to the America/Chicago school calendar.
  function getSchoolLocalDate(dateLike = new Date()) {
    const date = dateLike instanceof Date
      ? dateLike
      : new Date(dateLike);

    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid date for school-local formatting');
    }

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts.map(part => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
  }

  // Helper to format date as readable string
  function formatDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Escape HTML entities to prevent XSS when rendering user-provided content
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Helper to determine score color class based on percentage
  function scoreColorClass(score) {
    if (score == null || isNaN(score)) return "";
    if (score >= 90) return "rv-score-green";
    if (score >= 80) return "rv-score-blue";
    if (score >= 70) return "rv-score-amber";
    return "rv-score-red";
  }

  // State
  let currentClassFilter = "All Classes";
  let currentAssignmentFilter = "All Assignments";
  let currentStatusFilter = "needs-review"; // "needs-review", "reviewed", "all"
  let searchText = "";
  let studentsData = [];
  let assignmentsData = [];
  let submissionsData = [];
  let assignmentInstancesData = [];
  let assignmentItemsCache = {}; // Cache items by assignment_id
  let syntheticAssignmentIds = new Set(); // Track assignments whose items were synthesized from meta
  let submissionAnswersCache = {}; // Cache answers by submission_id
  let classEnrollmentsData = [];
  let usingSupabase = false;
  let syncStatus = "local";
  let expandedSubmissions = new Set();
  let hasAutoExpanded = false;
  // realtimeChannel will be set in setupRealtime()
  let realtimeChannel = null; // eslint-disable-line no-unused-vars
  let finalizingInProgress = false;

  // Cache for IEP goals loaded for AI suggest, keyed by studentId
  let _reviewGoalsCache = null; // { studentId: string, goals: Array }

  async function ensureGoalsLoaded(studentId) {
    if (_reviewGoalsCache && _reviewGoalsCache.studentId === studentId) {
      return _reviewGoalsCache.goals;
    }
    if (!SUPABASE_URL_CACHED || !SUPABASE_KEY_CACHED) return [];
    try {
      const res = await fetch(
        `${SUPABASE_URL_CACHED}/rest/v1/goals?student_id=eq.${encodeURIComponent(studentId)}&select=code,description,area,skill_area,desc`,
        {
          headers: {
            'apikey': SUPABASE_KEY_CACHED,
            'Authorization': `Bearer ${SUPABASE_KEY_CACHED}`,
            'Accept': 'application/json',
          }
        }
      );
      if (res.ok) {
        const goals = await res.json();
        _reviewGoalsCache = { studentId, goals: Array.isArray(goals) ? goals : [] };
        return _reviewGoalsCache.goals;
      } else {
        console.warn(`[tc-review] Goals fetch returned ${res.status}`);
      }
    } catch (err) {
      console.warn('[tc-review] Failed to fetch goals for AI suggest:', err);
    }
    return [];
  }

  // Load data from Supabase or localStorage
  async function loadData() {
    try {
      usingSupabase = await isRemote();
      
      if (usingSupabase) {
        console.log('[tc-review] Loading data from Supabase');
        syncStatus = "synced";
      } else {
        console.log('[tc-review] Loading data from localStorage');
        syncStatus = "local";
      }

      // Cache Supabase connection details for direct REST fallback calls.
      // Use getSupabaseConfig() (reads from window globals / localStorage) so
      // the values are available even when the Supabase JS client is null.
      const sbConfig = getSupabaseConfig();
      SUPABASE_URL_CACHED = sbConfig.url;
      SUPABASE_KEY_CACHED = sbConfig.key;
      
      // Load core data
      const [students, assignments, submissions, instances] = await Promise.all([
        db.listStudents(),
        db.listAssignments(),
        db.listSubmissions({ excludeFinalized: false }),
        db.listAssignmentInstances()
      ]);
      
      studentsData = students || [];
      assignmentsData = assignments || [];
      assignmentInstancesData = instances || [];

      // Deduplicate submissions per instance: keep only the most recent submission
      // with non-empty answers for each instance_id. This prevents stale/empty
      // resubmission shells (e.g. from "Return for Revision") from polluting the queue.
      const rawSubmissions = submissions || [];
      const byInstance = new Map();
      for (const sub of rawSubmissions) {
        const iid = sub.instance_id;
        if (!iid) continue;
        const hasAnswers = sub.answers && Object.keys(sub.answers).length > 0;
        const existing = byInstance.get(iid);
        if (!existing) {
          byInstance.set(iid, sub);
        } else {
          const existingHasAnswers = existing.answers && Object.keys(existing.answers).length > 0;
          // Prefer a submission with actual answers; among ties prefer the more recent one
          const subTime = new Date(sub.submitted_at || 0).getTime();
          const existingTime = new Date(existing.submitted_at || 0).getTime();
          if (hasAnswers && !existingHasAnswers) {
            byInstance.set(iid, sub);
          } else if (!hasAnswers && existingHasAnswers) {
            // keep existing
          } else if (subTime > existingTime) {
            byInstance.set(iid, sub);
          }
        }
      }
      submissionsData = Array.from(byInstance.values());
      if (submissionsData.length < rawSubmissions.length) {
        console.log(`[tc-review] Deduplicated ${rawSubmissions.length} → ${submissionsData.length} submissions (${rawSubmissions.length - submissionsData.length} stale/empty shells removed)`);
      }

      // Reset item/answer caches so refreshed data picks up any DB changes (e.g. after backfill)
      assignmentItemsCache = {};
      syntheticAssignmentIds = new Set();
      submissionAnswersCache = {};
      
      // Load enrollments if available
      try {
        if (db.listClassEnrollments) {
          classEnrollmentsData = await db.listClassEnrollments();
        }
      } catch (err) {
        console.warn('[tc-review] Error loading class enrollments:', err);
        classEnrollmentsData = [];
      }
      
      console.log('[tc-review] Loaded:', {
        students: studentsData.length,
        assignments: assignmentsData.length,
        submissions: submissionsData.length,
        instances: assignmentInstancesData.length
      });
      
      updateSyncStatus();
      
      // Set up realtime if using Supabase
      if (usingSupabase) {
        await setupRealtime();
      }
      
      render();
    } catch (err) {
      console.error('[tc-review] Error loading data:', err);
      syncStatus = "error";
      updateSyncStatus();
    }
  }

  // Set up realtime subscriptions
  let realtimeDebounceTimer = null;
  async function setupRealtime() {
    if (typeof isRealtimeDisabled === 'function' && isRealtimeDisabled()) {
      console.info('[tc-review] Realtime disabled via runtime config — skipping');
      return;
    }
    try {
      const supabase = await getSupabase();
      if (!supabase) return;

      // Subscribe to submission_answers changes (for manual scoring)
      realtimeChannel = supabase
        .channel('review-tab-updates')
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'submission_answers' },
          handleRealtimeUpdate
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'submissions' },
          handleRealtimeUpdate
        )
        .subscribe();

      console.log('[tc-review] Realtime subscriptions active');
    } catch (err) {
      console.warn('[tc-review] Could not set up realtime:', err);
    }
  }

  function handleRealtimeUpdate(payload) {
    console.log('[tc-review] Realtime update:', payload);
    
    // Skip debounced reload during finalize to avoid duplicate calls
    if (finalizingInProgress) return;
    
    // Debounce to prevent excessive refreshes
    if (realtimeDebounceTimer) {
      clearTimeout(realtimeDebounceTimer);
    }
    
    realtimeDebounceTimer = setTimeout(async () => {
      console.log('[tc-review] Refreshing data after realtime update');
      await loadData();
    }, REALTIME_DEBOUNCE_MS);
  }

  // Update sync status indicator
  function updateSyncStatus() {
    const statusEl = $('rvSyncStatus');
    const iconEl = $('rvSyncIcon');
    const textEl = $('rvSyncText');
    
    if (!statusEl) return;
    
    statusEl.style.display = 'inline-flex';
    statusEl.className = `rv-sync-status ${syncStatus}`;
    
    if (syncStatus === 'synced') {
      iconEl.innerHTML = DOT_SVG;
      textEl.textContent = 'Synced';
    } else if (syncStatus === 'local') {
      iconEl.innerHTML = DOT_SVG;
      textEl.textContent = 'Local';
    } else if (syncStatus === 'error') {
      iconEl.innerHTML = DOT_SVG;
      textEl.textContent = 'Error';
    }
  }

  // Build review queue - submissions needing review
  function buildReviewQueue() {
    // Filter submissions by review status
    let queue = submissionsData.filter(submission => {
      // Apply status filter
      if (currentStatusFilter === 'needs-review') {
        const status = submission.review_status || 'pending';
        return status === 'pending' || status === 'in_progress';
      } else if (currentStatusFilter === 'reviewed') {
        return submission.review_status === 'reviewed';
      } else if (currentStatusFilter === 'finalized') {
        return submission.review_status === 'finalized';
      }
      // "all" - no filter
      return true;
    });

    // Enrich with student and assignment data
    queue = queue.map(submission => {
      const instance = assignmentInstancesData.find(i => i.id === submission.instance_id);
      const assignment = instance ? assignmentsData.find(a => a.id === instance.assignment_id) : null;
      const student = instance ? studentsData.find(s => s.code === instance.student_code) : null;
      
      return {
        ...submission,
        instance,
        assignment,
        student,
        student_code: instance?.student_code,
        assignment_id: instance?.assignment_id
      };
    });

    // Filter by class
    if (currentClassFilter !== "All Classes") {
      queue = queue.filter(item => {
        const student = item.student;
        if (!student) return false;
        
        // Check if student is enrolled in this class
        const enrollment = classEnrollmentsData.find(e => e.student_code === student.code);
        if (enrollment) {
          // Match by class name
          return enrollment.class_id === currentClassFilter || 
                 classEnrollmentsData.some(e => 
                   e.student_code === student.code && 
                   e.class_id === currentClassFilter
                 );
        }
        
        // Fallback: match by student.class_id
        return student.class_id === currentClassFilter;
      });
    }

    // Filter by assignment
    if (currentAssignmentFilter !== "All Assignments") {
      queue = queue.filter(item => item.assignment_id === currentAssignmentFilter);
    }

    // Filter by search text
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      queue = queue.filter(item => {
        const studentName = item.student?.name || '';
        const studentCode = item.student_code || '';
        const assignmentTitle = item.assignment?.title || '';
        
        return studentName.toLowerCase().includes(searchLower) ||
               studentCode.toLowerCase().includes(searchLower) ||
               assignmentTitle.toLowerCase().includes(searchLower);
      });
    }

    // Sort by submitted_at (most recent first); guard against unparseable dates
    queue.sort((a, b) => {
      const dateA = new Date(a.submitted_at || 0);
      const dateB = new Date(b.submitted_at || 0);
      const tA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
      const tB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
      return tB - tA;
    });

    return queue;
  }

  /**
   * Enrich items in-place with goal_codes and dese_codes from assignment_item_mappings.
   * Older assignments (before PR #703) have goal_codes: [] on assignment_items rows;
   * the authoritative codes live in assignment_item_mappings. This runs for all fetch
   * paths (JS client and REST) so that finalization always has accurate goal codes.
   */
  async function enrichItemsFromMappings(items) {
    if (!items || items.length === 0 || !SUPABASE_URL_CACHED || !SUPABASE_KEY_CACHED) return;
    try {
      const itemIds = items.map(i => i.id).filter(id => id != null).join(',');
      if (!itemIds) return;
      const mappingsRes = await fetch(
        `${SUPABASE_URL_CACHED}/rest/v1/assignment_item_mappings?item_id=in.(${itemIds})&select=item_id,goal_codes,dese_codes`,
        {
          headers: {
            'apikey': SUPABASE_KEY_CACHED,
            'Authorization': `Bearer ${SUPABASE_KEY_CACHED}`,
            'Accept': 'application/json',
          }
        }
      );
      if (mappingsRes.ok) {
        const mappings = await mappingsRes.json();
        if (Array.isArray(mappings)) {
          const mappingsByItemId = {};
          mappings.forEach(m => { mappingsByItemId[m.item_id] = m; });
          items.forEach(item => {
            const mapping = mappingsByItemId[item.id];
            if (mapping) {
              if (!item.goal_codes || item.goal_codes.length === 0) {
                item.goal_codes = mapping.goal_codes || [];
              }
              if (!item.dese_codes || item.dese_codes.length === 0) {
                item.dese_codes = mapping.dese_codes || [];
              }
            }
          });
        }
      }
    } catch (mappingErr) {
      console.warn('[tc-review] Failed to enrich items with mappings:', mappingErr);
    }
  }

  /**
   * Fetch assignment items directly via Supabase REST API, bypassing the JS client.
   * Useful when the JS client is blocked by RLS but the anon key has a SELECT policy.
   * Returns an array of raw DB rows, or null when config is missing or the request fails.
   */
  async function fetchAssignmentItemsViaRest(assignmentId) {
    if (!SUPABASE_URL_CACHED || !SUPABASE_KEY_CACHED) return null;
    try {
      const restRes = await fetch(
        `${SUPABASE_URL_CACHED}/rest/v1/assignment_items?assignment_id=eq.${encodeURIComponent(assignmentId)}&select=*&order=item_ref`,
        {
          headers: {
            'apikey': SUPABASE_KEY_CACHED,
            'Authorization': `Bearer ${SUPABASE_KEY_CACHED}`,
            'Accept': 'application/json',
          }
        }
      );
      if (restRes.ok) {
        const items = await restRes.json();
        if (!Array.isArray(items)) return null;

        await enrichItemsFromMappings(items);

        return items;
      }
      console.warn('[tc-review] Direct REST item fetch returned', restRes.status, 'for assignment', assignmentId);
      return null;
    } catch (restErr) {
      console.warn('[tc-review] Direct REST item fetch failed:', restErr);
      return null;
    }
  }

  // Get or fetch assignment items for an assignment
  async function getAssignmentItemsForAssignment(assignmentId) {
    if (!assignmentId) return [];
    if (assignmentItemsCache[assignmentId]) {
      return assignmentItemsCache[assignmentId];
    }

    try {
      let items = [];
      
      if (usingSupabase) {
        const supabase = await getSupabase();
        items = await getAssignmentItems(supabase, assignmentId);
      } else {
        // Local mode: load from localStorage
        const allItems = JSON.parse(localStorage.getItem(NS + 'assignmentItems') || '[]');
        items = allItems.filter(item => item.assignment_id === assignmentId);
      }

      // Fallback: if the Supabase JS client returned nothing (e.g. RLS blocks anon reads),
      // try a direct REST API request with the anon key before falling back to synthetic items.
      if (items.length === 0 && SUPABASE_URL_CACHED && SUPABASE_KEY_CACHED) {
        const restItems = await fetchAssignmentItemsViaRest(assignmentId);
        if (restItems && restItems.length > 0) {
          items = restItems;
          console.log(`[tc-review] Loaded ${items.length} items via direct REST for assignment ${assignmentId}`);
        }
      }

      // Last resort: synthesize items from assignment meta if DB returned nothing
      if (items.length === 0) {
        const assignment = assignmentsData.find(a => a.id === assignmentId);
        if (assignment && assignment.meta) {
          items = buildItemsFromMeta(assignmentId, assignment.meta, { idPrefix: SYNTHETIC_ID_PREFIX });
          if (items.length > 0) {
            syntheticAssignmentIds.add(assignmentId);
            console.log(`[tc-review] Synthesized ${items.length} items from meta for assignment ${assignmentId}`);
          }
        }
      } else {
        // Real items found — ensure any stale synthetic flag is cleared
        syntheticAssignmentIds.delete(assignmentId);

        // Always enrich with goal_codes from assignment_item_mappings via REST so that
        // items fetched via the JS client (which may be blocked by RLS on mappings) also
        // get the authoritative codes for goal progress tracking.
        await enrichItemsFromMappings(items);
      }
      
      assignmentItemsCache[assignmentId] = items;
      return items;
    } catch (err) {
      console.error('[tc-review] Error loading assignment items:', err);
      return [];
    }
  }

  /**
   * Ensure real (persisted) assignment items exist for assignmentId.
   * If items are currently synthetic, triggers backfill, clears cache, and re-fetches.
   * Returns the fresh items array. Throws on failure.
   */
  async function ensureRealItems(assignmentId) {
    if (!assignmentId) return [];
    if (!syntheticAssignmentIds.has(assignmentId)) {
      return assignmentItemsCache[assignmentId] || await getAssignmentItemsForAssignment(assignmentId);
    }

    const res = await fetch(BACKFILL_ITEMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignment_id: assignmentId })
    });
    const backfillData = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(backfillData.error || `Backfill failed: ${res.status}`);
    }
    const itemsCreated = backfillData.summary?.items_created || 0;
    console.log(`[tc-review] Backfill response for assignment ${assignmentId}: ${itemsCreated} item(s) created`);

    // Clear stale synthetic cache and re-fetch real items from DB.
    // getAssignmentItemsForAssignment() already tries a direct REST fallback before
    // synthesizing, so if items exist in the DB they will be returned here.
    delete assignmentItemsCache[assignmentId];
    syntheticAssignmentIds.delete(assignmentId);
    let items = await getAssignmentItemsForAssignment(assignmentId);

    // If backfill created 0 items it means items already existed in the DB.
    // In that case there is no point retrying via the Supabase JS client —
    // go straight to the REST fallback (same path getAssignmentItemsForAssignment
    // already tried, but kept here as a safety net with explicit logging).
    if (itemsCreated === 0 && (items.length === 0 || syntheticAssignmentIds.has(assignmentId))) {
      console.warn(`[tc-review] Backfill confirms items already exist for assignment ${assignmentId} but could not be read via JS client; REST fallback was attempted during fetch.`);
    }

    // If still empty/synthetic after backfill (and items were newly created this run),
    // retry with exponential backoff — the DB write may not yet be visible.
    if (itemsCreated > 0) {
      const retryDelays = [1000, 2000, 3000];
      for (let attempt = 0; attempt < retryDelays.length && (items.length === 0 || syntheticAssignmentIds.has(assignmentId)); attempt++) {
        console.warn(`[tc-review] Items still empty after backfill, retrying in ${retryDelays[attempt]}ms... (attempt ${attempt + 1}/${retryDelays.length})`);
        await new Promise(r => setTimeout(r, retryDelays[attempt]));
        delete assignmentItemsCache[assignmentId];
        syntheticAssignmentIds.delete(assignmentId);
        items = await getAssignmentItemsForAssignment(assignmentId);
      }
    }

    // Final safety net: direct REST fetch using cached Supabase config.
    // This is now largely superseded by the REST fallback inside
    // getAssignmentItemsForAssignment(), but kept for belt-and-suspenders.
    if (items.length === 0 || syntheticAssignmentIds.has(assignmentId)) {
      const restItems = await fetchAssignmentItemsViaRest(assignmentId);
      if (restItems && restItems.length > 0) {
        console.log(`[tc-review] REST API fallback resolved ${restItems.length} items for assignment ${assignmentId}`);
        syntheticAssignmentIds.delete(assignmentId);
        assignmentItemsCache[assignmentId] = restItems;
        items = restItems;
      }
    }

    return items;
  }

  // Get or fetch submission answers for a submission
  async function getSubmissionAnswers(submissionId) {
    if (submissionAnswersCache[submissionId]) {
      return submissionAnswersCache[submissionId];
    }

    try {
      const answers = await db.listSubmissionAnswers(submissionId);
      submissionAnswersCache[submissionId] = answers;
      return answers;
    } catch (err) {
      console.error('[tc-review] Error loading submission answers:', err);
      return [];
    }
  }

  /**
   * Returns true if an item should be treated as auto-scored —
   * either it is an objective MCQ/boolean/multi item, or it is a
   * fill-in-blank constructed item that the server already scored
   * (earned_points != null in submission_answers).
   *
   * Note: With partial credit, earned_points may be 0 (zero keywords found)
   * which is still "auto-scored". The check `earned_points != null` correctly
   * handles this since 0 != null is true.
   *
   * @param {Object} item    - Assignment item from assignmentItemsCache
   * @param {Array}  answers - submission_answers rows for this submission
   */
  function isAutoScoredItem(item, answers) {
    if (item.answer_type === 'mcq' || item.answer_type === 'boolean' || item.answer_type === 'multi') {
      return true;
    }
    if (item.answer_type === 'constructed' || item.answer_type === 'written_response') {
      const answer = answers.find(a => a.item_id === item.id);
      return answer != null && answer.earned_points != null;
    }
    return false;
  }

  /**
   * True if this constructed item is a fill-in-blank with a primitive correct answer
   * (e.g. Counting Money "1.00", a single word, etc.) — i.e. it should be treated as
   * objectively auto-gradeable, NOT as a writing prompt requiring teacher rubric scoring.
   */
  function isFillInBlankConstructed(item) {
    if (item.answer_type !== 'constructed') return false;
    const c = item.meta?.correct;
    if (c == null) return false;
    if (Array.isArray(c)) return false; // keyword list = writing-prompt-with-keywords
    // strings/numbers/booleans = fill-in-blank
    return typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean';
  }

  /**
   * True if this item requires manual (teacher) grading.
   * Matches constructed items that are NOT fill-in-blank, AND explicit written_response items.
   */
  function isManualGradeItem(item) {
    if (item.answer_type === 'written_response') return true;
    return item.answer_type === 'constructed' && !isFillInBlankConstructed(item);
  }

  /**
   * Reconstruct virtual answer objects from raw submission.answers JSONB for display.
   * Used when submission_answers rows are absent (backfill not yet run).
   * Returns display-only answer objects — NOT cached in submissionAnswersCache.
   */
  function reconstructAnswersFromSubmission(submission, items) {
    const rawAnswers = submission.answers;
    if (!rawAnswers || typeof rawAnswers !== 'object') return [];

    const virtualAnswers = [];
    for (const item of items) {
      if (item.answer_type === 'mcq' || item.answer_type === 'boolean' || item.answer_type === 'multi') {
        const ref = item.item_ref || item.ref;
        if (!ref) continue;

        const studentAnswer = rawAnswers[ref];
        if (studentAnswer === undefined) continue;

        const correctAnswer = item.meta?.correct ?? item.correct;
        const isCorrect = correctAnswer !== undefined && String(studentAnswer) === String(correctAnswer);
        const points = item.points || 0;

        virtualAnswers.push({
          item_id: item.id,
          raw_answer: studentAnswer,
          is_correct: isCorrect,
          earned_points: isCorrect ? points : 0,
          max_points: points,
        });
        continue;
      }

      // Handle constructed / written_response (writing) items — pull response from instance settings
      if (item.answer_type === 'constructed' || item.answer_type === 'written_response') {
        const writingResponse = submission.instance?.settings?.writing_response;
        if (writingResponse) {
          virtualAnswers.push({
            item_id: item.id,
            raw_answer: { value: writingResponse },
            is_correct: null,
            earned_points: null,
            max_points: item.points || 0,
          });
        }
      }
    }
    return virtualAnswers;
  }

  // Generate rubric tiers based on max points
  function generateRubricTiers(maxPoints) {
    if (maxPoints === 5) {
      return [
        { points: 5, label: 'Exemplary', desc: 'Thorough, evidence-based' },
        { points: 4, label: 'Proficient', desc: 'Clear, mostly complete' },
        { points: 3, label: 'Developing', desc: 'Adequate, lacks detail' },
        { points: 2, label: 'Beginning', desc: 'Partial understanding' },
        { points: 1, label: 'Minimal', desc: 'Attempted but incomplete' },
        { points: 0, label: 'No response', desc: 'No response / off-topic' }
      ];
    } else if (maxPoints === 3) {
      return [
        { points: 3, label: 'Complete', desc: 'Full understanding demonstrated' },
        { points: 2, label: 'Partial', desc: 'Some understanding shown' },
        { points: 1, label: 'Minimal', desc: 'Limited understanding' },
        { points: 0, label: 'No response', desc: 'No response / off-topic' }
      ];
    } else {
      // Generic rubric for any N points
      const tiers = [];
      for (let i = maxPoints; i >= 0; i--) {
        if (i === maxPoints) {
          tiers.push({ points: i, label: 'Full credit', desc: 'Meets all requirements' });
        } else if (i === 0) {
          tiers.push({ points: 0, label: 'No response', desc: 'No response / off-topic' });
        } else {
          tiers.push({ points: i, label: `${i}/${maxPoints}`, desc: 'Partial credit' });
        }
      }
      return tiers;
    }
  }

  // Resolve assignment_id from a submission, falling back to the instance lookup.
  // Caches the resolved value back onto the submission object for subsequent calls.
  function resolveAssignmentId(submission) {
    if (!submission.assignment_id) {
      const instance = assignmentInstancesData.find(i => i.id === submission.instance_id);
      if (instance?.assignment_id) submission.assignment_id = instance.assignment_id;
    }
    return submission.assignment_id || null;
  }

  // Render batch action bar
  async function renderBatchBar() {
    const barEl = $('rvBatchBar');
    const finalizeBtn = $('rvBtnFinalizeAll');
    const markBtn = $('rvBtnMarkAllReviewed');
    const autoGradeBtn = $('rvBtnAutoGrade');
    const finalizeReviewedBtn = $('rvBtnFinalizeAllReviewed');
    const revertReviewedBtn = $('rvBtnRevertAllReviewed');
    if (!barEl || !finalizeBtn || !markBtn) return;

    const queue = buildReviewQueue();
    const unreviewed = queue.filter(s => (s.review_status || 'pending') !== 'reviewed');

    // Count finalizable: all constructed items scored (manually or via keyword auto-score) but not yet reviewed
    let finalizableCount = 0;
    for (const submission of unreviewed) {
      const assignmentId = resolveAssignmentId(submission);
      if (!assignmentId) continue;
      const items = assignmentItemsCache[assignmentId] || [];
      const constructedItems = items.filter(item => isManualGradeItem(item));
      if (constructedItems.length === 0) continue; // MCQ-only or fill-in-blank-only handled by autoFinalize
      const answers = submissionAnswersCache[submission.id] || [];
      // A constructed item counts as scored if it is auto-scored (earned_points != null),
      // whether by the keyword engine or by a teacher rubric.
      const allScored = constructedItems.every(item => isAutoScoredItem(item, answers));
      if (allScored) finalizableCount++;
    }

    // Count auto-gradeable: unreviewed submissions with unscored constructed items
    let autoGradeCount = 0;
    for (const submission of unreviewed) {
      const assignmentId = resolveAssignmentId(submission);
      if (!assignmentId) continue;
      const items = assignmentItemsCache[assignmentId] || [];
      const constructedItems = items.filter(item => isManualGradeItem(item));
      if (constructedItems.length === 0) continue;
      const answers = submissionAnswersCache[submission.id] || [];
      const hasUnscored = constructedItems.some(item => !isAutoScoredItem(item, answers));
      if (hasUnscored) autoGradeCount++;
    }

    const markableCount = unreviewed.length;

    // Count reviewed submissions for the Finalize All Reviewed button
    const reviewedSubmissions = submissionsData.filter(s => s.review_status === 'reviewed');
    const reviewedCount = reviewedSubmissions.length;

    // Show bar if there are unreviewed submissions OR reviewed submissions
    barEl.style.display = (markableCount > 0 || reviewedCount > 0) ? 'flex' : 'none';

    // SAFETY: static SVG, no user data
    finalizeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    finalizeBtn.append(` Finalize All Scored (${finalizableCount})`);
    finalizeBtn.disabled = finalizableCount === 0;
    finalizeBtn.setAttribute('aria-label', `Finalize all scored submissions (${finalizableCount})`);

    // SAFETY: static SVG, no user data
    markBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>';
    markBtn.append(` Mark All Reviewed (${markableCount})`);
    markBtn.disabled = markableCount === 0;
    markBtn.setAttribute('aria-label', `Mark all as reviewed (${markableCount})`);

    // Auto-Grade button — visible when there are unreviewed submissions with unscored items
    if (autoGradeBtn) {
      autoGradeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path></svg>';
      autoGradeBtn.append(` 🤖 Auto-Grade All (${autoGradeCount})`);
      autoGradeBtn.disabled = autoGradeCount === 0;
      autoGradeBtn.setAttribute('aria-label', `Auto-grade all unreviewed submissions with AI (${autoGradeCount})`);
      autoGradeBtn.style.display = '';
    }

    // Finalize All Reviewed button — visible only when there are reviewed submissions
    if (finalizeReviewedBtn) {
      finalizeReviewedBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      finalizeReviewedBtn.append(` ✅ Finalize All Reviewed (${reviewedCount})`);
      finalizeReviewedBtn.disabled = reviewedCount === 0;
      finalizeReviewedBtn.setAttribute('aria-label', `Finalize all reviewed submissions (${reviewedCount})`);
      finalizeReviewedBtn.style.display = reviewedCount > 0 ? '' : 'none';
    }

    // Revert All Reviewed button — visible only when there are reviewed submissions
    if (revertReviewedBtn) {
      revertReviewedBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.59"></path></svg>';
      revertReviewedBtn.append(` ↩ Revert All Reviewed (${reviewedCount})`);
      revertReviewedBtn.disabled = reviewedCount === 0;
      revertReviewedBtn.setAttribute('aria-label', `Revert all reviewed submissions back to Needs Review (${reviewedCount})`);
      revertReviewedBtn.style.display = reviewedCount > 0 ? '' : 'none';
    }
  }

  // Render the UI
  async function render() {
    const queue = buildReviewQueue();
    
    // Count by status
    const needsReviewCount = submissionsData.filter(s => {
      const status = s.review_status || 'pending';
      return status === 'pending' || status === 'in_progress';
    }).length;
    
    const reviewedCount = submissionsData.filter(s => s.review_status === 'reviewed').length;
    const finalizedCount = submissionsData.filter(s => s.review_status === 'finalized').length;
    
    // Update badge counts using safe DOM (no innerHTML with user data)
    const needsReviewBtn = $('rvStatusNeedsReview');
    if (needsReviewBtn) {
      const badge = needsReviewBtn.querySelector('.rv-badge');
      if (badge) badge.textContent = needsReviewCount;
    }
    
    const reviewedBtn = $('rvStatusReviewed');
    if (reviewedBtn) {
      const badge = reviewedBtn.querySelector('.rv-badge');
      if (badge) badge.textContent = reviewedCount;
    }
    
    const allBtn = $('rvStatusAll');
    if (allBtn) {
      const badge = allBtn.querySelector('.rv-badge');
      if (badge) badge.textContent = submissionsData.length;
    }

    const finalizedBtn = $('rvStatusFinalized');
    if (finalizedBtn) {
      const badge = finalizedBtn.querySelector('.rv-badge');
      if (badge) badge.textContent = finalizedCount;
    }

    // Render batch bar
    await renderBatchBar();
    
    // Render queue
    const queueContainer = $('rvQueue');
    if (!queueContainer) return;
    
    if (queue.length === 0) {
      queueContainer.innerHTML = `
        <div class="rv-empty">
          <div style="margin-bottom:12px;">${INBOX_SVG}</div>
          <p style="font-weight:500;margin-bottom:4px;">No submissions found</p>
          <p style="font-size:13px;opacity:0.6;">Try changing the class, assignment, or status filter.</p>
        </div>
      `;
      return;
    }
    
    // Trigger background backfill for any synthetic assignments visible in the current queue
    // so real item IDs are ready when the teacher tries to score written responses.
    const syntheticAssignmentIdsInQueue = [...new Set(
      queue.map(s => s.assignment_id).filter(id => id && syntheticAssignmentIds.has(id))
    )];
    syntheticAssignmentIdsInQueue.forEach(assignmentId => {
      ensureRealItems(assignmentId).catch(err => {
        console.warn('[tc-review] Background backfill failed for assignment', assignmentId, err);
      });
    });

    // Preload items for every assignment in the queue so the score preview
    // (X/Y — Z%) can render on collapsed rows even before a submission is expanded.
    // getAssignmentItemsForAssignment is memoized via assignmentItemsCache, so this
    // is a no-op for already-loaded assignments.
    const uniqueAssignmentIdsInQueue = [...new Set(
      queue.map(s => resolveAssignmentId(s)).filter(Boolean)
    )];
    await Promise.all(
      uniqueAssignmentIdsInQueue.map(id =>
        getAssignmentItemsForAssignment(id).catch(err => {
          console.warn('[tc-review] Preload items failed for assignment', id, err);
          return [];
        })
      )
    );

    // Render each submission as accordion item
    const itemsHtml = await Promise.all(queue.map(submission => 
      renderSubmissionRow(submission)
    ));
    
    queueContainer.innerHTML = itemsHtml.join('');
    
    // Auto-expand first unreviewed submission on initial load
    if (!hasAutoExpanded && needsReviewCount > 0) {
      const firstUnreviewed = queue.find(s => {
        const status = s.review_status || 'pending';
        return status === 'pending' || status === 'in_progress';
      });
      
      if (firstUnreviewed) {
        expandedSubmissions.add(firstUnreviewed.id);
        hasAutoExpanded = true;
        // Re-render to show expanded state
        await render();
      }
    }
  }

  // Render a single submission row
  async function renderSubmissionRow(submission) {
    const student = submission.student;
    const assignment = submission.assignment;
    const isExpanded = expandedSubmissions.has(submission.id);
    
    // Status badge
    const status = submission.review_status || 'pending';
    let statusBadge = '';
    if (status === 'reviewed') {
      statusBadge = `<span class="rv-status-badge reviewed">${CHECK_SVG} Reviewed</span>`;
    } else if (status === 'in_progress') {
      statusBadge = `<span class="rv-status-badge in-progress">${CLOCK_SVG} In Progress</span>`;
    } else if (status === 'finalized') {
      statusBadge = `<span class="rv-status-badge finalized">${CHECK_SVG} Finalized</span>`;
    } else {
      statusBadge = `<span class="rv-status-badge pending">${PAUSE_SVG} Pending</span>`;
    }
    
    // Score preview for collapsed rows (from cache if available)
    let scorePreview = '';
    const assignmentId = resolveAssignmentId(submission);
    const items = assignmentId ? (assignmentItemsCache[assignmentId] || []) : [];
    const answers = submissionAnswersCache[submission.id] || [];

    // For finalized/reviewed rows, always render a preview using stored scores.
    if ((status === 'reviewed' || status === 'finalized') && submission.score_total != null) {
      const totalEarned = (Number(submission.score_auto) || 0) + (Number(submission.score_manual) || 0);
      const pct = Number(submission.score_total);
      // Prefer totalMax from items cache; fall back to deriving from earned/pct.
      // score_total is stored as a 0-100 whole-number percentage, so the formula is:
      // totalMax = totalEarned * 100 / pct  (equivalent to: totalEarned / pct * 100)
      let totalMax = items.reduce((sum, i) => sum + (i.points || 0), 0);
      if (totalMax === 0 && pct > 0) {
        totalMax = Math.round((totalEarned / pct) * 100);
      }
      if (totalMax > 0) {
        const cls = scoreColorClass(pct);
        scorePreview = `<span class="rv-score-preview ${cls}" style="font-size:13px;font-weight:600;">${totalEarned}/${totalMax} — ${pct}%</span>`;
      }
    } else if (items.length > 0) {
      const totalMax = items.reduce((sum, i) => sum + (i.points || 0), 0);
      if (totalMax > 0) {
        const constructedItems = items.filter(i => isManualGradeItem(i));
        const hasUnscored = constructedItems.some(item => !isAutoScoredItem(item, answers));
        if (hasUnscored) {
          scorePreview = `<span class="rv-score-preview" style="font-size:13px;font-family:monospace;opacity:0.75;">___/${totalMax} — ___%</span>`;
        } else {
          const autoItems = items.filter(i => isAutoScoredItem(i, answers));
          let autoEarned = 0;
          if (answers && answers.length > 0) {
            // Best: use submissionAnswersCache (loaded when expanded)
            autoEarned = autoItems.reduce((sum, item) => {
              const ans = answers.find(a => a.item_id === item.id);
              return sum + (Number(ans?.earned_points) || 0);
            }, 0);
          } else if (submission.answers && typeof submission.answers === 'object' && Object.keys(submission.answers).length > 0) {
            // Fallback: recompute from submission.answers JSONB (raw MCQ answers)
            const mcqItems = items.filter(i => i.answer_type === 'mcq' || i.answer_type === 'boolean' || i.answer_type === 'multi');
            autoEarned = mcqItems.reduce((sum, item) => {
              const itemRef = item.item_ref || item.ref;
              if (!itemRef) return sum;
              const studentAnswer = submission.answers[itemRef];
              if (studentAnswer === undefined || studentAnswer === null) return sum;
              const correct = item.meta?.correct;
              if (correct && String(studentAnswer).trim().toUpperCase() === String(correct).trim().toUpperCase()) {
                return sum + (item.points || 1);
              }
              return sum;
            }, 0);
          } else {
            // Last resort: use stored score_auto (may be stale)
            autoEarned = Number(submission.score_auto) || 0;
          }
          const manualEarned = constructedItems.reduce((sum, item) => {
            if (isAutoScoredItem(item, answers)) return sum;
            const ans = answers.find(a => a.item_id === item.id);
            return sum + (Number(ans?.earned_points) || 0);
          }, 0);
          const totalEarned = autoEarned + manualEarned;
          const pct = Math.round((totalEarned / totalMax) * 100);
          const cls = scoreColorClass(pct);
          scorePreview = `<span class="rv-score-preview ${cls}" style="font-size:13px;font-weight:600;">${totalEarned}/${totalMax} — ${pct}%</span>`;
        }
      }
    }

    // Header content — escape all user-supplied data
    const studentLabel = escapeHtml(student?.name || submission.student_code || 'Unknown');
    const assignmentLabel = escapeHtml(assignment?.title || 'Unknown Assignment');
    const headerHtml = `
      <div class="rv-submission-header"
           data-submission-id="${escapeHtml(submission.id)}"
           role="button"
           tabindex="0"
           aria-expanded="${isExpanded ? 'true' : 'false'}"
           aria-label="Expand submission for ${studentLabel}">
        <div class="rv-submission-info">
          <span class="rv-student">${studentLabel}</span>
          <span class="rv-assignment">${assignmentLabel}</span>
          <span class="rv-date">${escapeHtml(formatDate(submission.submitted_at))}</span>
          ${scorePreview}
          ${statusBadge}
        </div>
        <span class="rv-expand-icon">${isExpanded ? CHEVRON_DOWN_SVG : CHEVRON_RIGHT_SVG}</span>
      </div>
    `;
    
    // Body content (only if expanded)
    let bodyHtml = '';
    if (isExpanded) {
      bodyHtml = await renderSubmissionBody(submission);
    }
    
    return `
      <div class="rv-submission-item ${isExpanded ? 'expanded' : ''}">
        ${headerHtml}
        ${isExpanded ? `<div class="rv-submission-body">${bodyHtml}</div>` : ''}
      </div>
    `;
  }

  // Render expanded submission body
  async function renderSubmissionBody(submission) {
    const assignmentId = resolveAssignmentId(submission);
    const submissionId = submission.id;
    
    // Load items and answers
    const items = await getAssignmentItemsForAssignment(assignmentId);
    const answers = await getSubmissionAnswers(submissionId);

    // Bug B fix: if DB has no submission_answers rows (or fewer than the number of items) but the
    // submission carries raw JSONB answers, reconstruct virtual display-only answer objects and
    // merge them with any real submission_answers rows so auto-graded scores show correctly.
    let displayAnswers = answers;
    if (submission.answers && typeof submission.answers === 'object') {
      const reconstructed = reconstructAnswersFromSubmission(submission, items);
      if (answers.length === 0) {
        displayAnswers = reconstructed;
      } else if (answers.length < items.length) {
        // Merge: prefer real submission_answers where they exist, fill gaps from reconstructed
        const answeredItemIds = new Set(answers.map(a => a.item_id));
        const missingAnswers = reconstructed.filter(r => !answeredItemIds.has(r.item_id));
        displayAnswers = [...answers, ...missingAnswers];
      }
    }

    // Bug C fix: if items are synthetic, trigger backfill in the background so subsequent
    // saves use real bigint IDs. Non-blocking — re-render after completion.
    if (syntheticAssignmentIds.has(assignmentId)) {
      ensureRealItems(assignmentId).then(() => {
        if (!syntheticAssignmentIds.has(assignmentId) && expandedSubmissions.has(submissionId)) {
          // Clear answers cache for all submissions of this assignment so they re-fetch with real IDs
          submissionsData.forEach(s => {
            if (s.assignment_id === assignmentId) {
              delete submissionAnswersCache[s.id];
            }
          });
          render();
        }
      }).catch(err => {
        console.warn('[tc-review] Background backfill failed:', err);
      });
    }
    
    // Separate auto-graded and constructed items.
    // Fill-in-blank (constructed) items that were keyword-auto-scored by the server
    // already have earned_points populated — treat those as auto-graded too.
    // Also treat fill-in-blank constructed items (primitive meta.correct) as auto-graded
    // even if no submission_answers row exists yet (blank submission before Fix 1 runs).
    const autoGradedItems = items.filter(item =>
      isAutoScoredItem(item, displayAnswers) || isFillInBlankConstructed(item)
    );
    const constructedItems = items.filter(item =>
      isManualGradeItem(item)
      && !isAutoScoredItem(item, displayAnswers)
    );
    
    // Calculate stats
    let autoCorrect = 0;
    let autoTotal = autoGradedItems.length;
    autoGradedItems.forEach(item => {
      const answer = displayAnswers.find(a => a.item_id === item.id);
      if (answer && answer.is_correct) {
        autoCorrect++;
      }
    });
    
    let manualScored = 0;
    let manualTotal = constructedItems.length;
    let manualEarned = 0;
    let manualMax = 0;
    constructedItems.forEach(item => {
      const answer = displayAnswers.find(a => a.item_id === item.id);
      manualMax += item.points || 0;
      if (answer && answer.earned_points != null) {
        manualScored++;
        manualEarned += Number(answer.earned_points) || 0;
      }
    });
    
    const autoEarned = autoGradedItems.reduce((sum, item) => {
      const answer = displayAnswers.find(a => a.item_id === item.id);
      return sum + (Number(answer?.earned_points) || 0);
    }, 0);
    const totalEarned = autoEarned + manualEarned;
    const totalMax = (autoGradedItems.reduce((sum, i) => sum + (i.points || 0), 0)) + manualMax;
    const totalPercent = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
    
    // Auto-graded section
    let autoSection = '';
    if (autoGradedItems.length > 0) {
      const autoPercent = autoTotal > 0 ? Math.round((autoCorrect / autoTotal) * 100) : 0;
      const autoRows = autoGradedItems.map(item => {
        const answer = displayAnswers.find(a => a.item_id === item.id);
        const correctAnswer = item.meta?.correct || item.correct || '—';
        // For fill-in-blank items with no answer row (blank submission before Fix 1), show (blank)
        const noAnswer = answer == null && isFillInBlankConstructed(item);
        const studentAnswer = answer?.raw_answer || (noAnswer ? '(blank)' : '—');
        const isCorrect = answer != null ? answer.is_correct : (noAnswer ? false : null);
        const earnedPoints = answer != null ? (Number(answer.earned_points) || 0) : 0;
        const maxPoints = item.points || 0;
        
        return `
          <tr>
            <td>${escapeHtml(item.item_ref || item.ref)}</td>
            <td><span class="rv-type-badge">${escapeHtml(item.answer_type)}</span></td>
            <td>${escapeHtml(typeof studentAnswer === 'object' ? JSON.stringify(studentAnswer) : studentAnswer)}</td>
            <td>${escapeHtml(typeof correctAnswer === 'object' ? JSON.stringify(correctAnswer) : correctAnswer)}</td>
            <td>${isCorrect === true ? CHECK_SVG : (isCorrect === false ? X_SVG : '—')}</td>
            <td>${earnedPoints}/${maxPoints}</td>
          </tr>
        `;
      }).join('');
      
      autoSection = `
        <div class="rv-section">
          <details class="rv-details">
            <summary class="rv-section-header">
              <span>Auto-Graded (${autoGradedItems.length} items)</span>
              <span class="rv-section-status">${CHECK_SVG} Complete (${autoCorrect}/${autoTotal} = ${autoPercent}%)</span>
            </summary>
            <table class="rv-auto-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Student Answer</th>
                  <th>Correct Answer</th>
                  <th>Result</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                ${autoRows}
              </tbody>
            </table>
          </details>
        </div>
      `;
    }
    
    // Written responses section
    let writtenSection = '';
    if (constructedItems.length > 0) {
      const allScored = manualScored === manualTotal;
      const statusLabel = allScored ? `${CHECK_SVG} Scored` : `${CLOCK_SVG} Needs Scoring (${manualScored}/${manualTotal})`;
      
      const responseCards = constructedItems.map(item => {
        const answer = displayAnswers.find(a => a.item_id === item.id);
        // Fallback: when raw_answer is null (e.g. wiped by a prior upsert bug), check
        // assignment_instances.settings.writing_response which is set on student submission.
        const instance = assignmentInstancesData.find(i => i.id === submission.instance_id);
        const studentResponse = answer?.raw_answer
          || (instance?.settings?.writing_response || null)
          || '(No response)';
        const isScored = answer && answer.earned_points != null;
        const currentScore = isScored ? answer.earned_points : 0;
        const scoreDisplay = isScored ? String(currentScore) : '___';
        const currentNote = answer?.teacher_note || '';
        const maxPoints = item.points || 5;
        
        // Extract display text from raw_answer (may be stored as { value: "..." } object)
        const responseText = (typeof studentResponse === 'object' && studentResponse !== null && studentResponse.value !== undefined)
          ? studentResponse.value
          : (typeof studentResponse === 'object' && studentResponse !== null ? JSON.stringify(studentResponse, null, 2) : studentResponse);
        
        // Generate rubric
        const rubricTiers = generateRubricTiers(maxPoints);
        const rubricHtml = rubricTiers.map(tier => `
          <div class="rv-rubric-tier">
            <strong>${tier.points}</strong> — ${tier.label}: ${tier.desc}
          </div>
        `).join('');
        
        // Goal and DESE codes
        const goalCodes = item.goal_codes || [];
        const deseCodes = item.dese_codes || [];
        const codesHtml = `
          ${goalCodes.length > 0 ? `<div>IEP Goals: ${escapeHtml(goalCodes.join(', '))}</div>` : ''}
          ${deseCodes.length > 0 ? `<div>DESE: ${escapeHtml(deseCodes.join(', '))}</div>` : ''}
        `;
        
        return `
          <div class="rv-response-card" data-item-id="${escapeHtml(item.id)}">
            <div class="rv-response-header">
              ${escapeHtml(item.item_ref || item.ref)}${item.meta?.question ? ` — \u201c${escapeHtml(item.meta.question)}\u201d` : ''}
            </div>
            
            <div class="rv-student-response">
              <strong>Student Response:</strong>
              <div class="rv-response-text">${escapeHtml(responseText)}</div>
            </div>
            
            ${codesHtml}
            <div>Max Points: ${escapeHtml(maxPoints)}</div>
            
            <details class="rv-rubric-details">
              <summary>${RULER_SVG} Scoring Guide</summary>
              <div class="rv-rubric">
                ${rubricHtml}
              </div>
            </details>
            
            <button class="rv-btn rv-btn-suggest"
                    data-item-id="${escapeHtml(item.id)}"
                    data-submission-id="${escapeHtml(submission.id)}"
                    aria-label="Get AI-suggested score for this item">
              ✨ Suggest Grade
            </button>
            
            <div class="rv-scoring-controls">
              <div class="rv-score-input-group">
                <label>Score:</label>
                <input type="number" 
                       class="rv-score-input" 
                       min="0" 
                       value="${escapeHtml(currentScore)}"
                       data-item-id="${escapeHtml(item.id)}"
                       data-submission-id="${escapeHtml(submission.id)}">
                <span>/ ${maxPoints} ${!isScored ? '<em style="opacity:0.6;font-size:12px;">(unscored)</em>' : ''}</span>
              </div>
              
              <div class="rv-note-input-group">
                <label>Teacher Note (optional):</label>
                <textarea class="rv-note-input" 
                          rows="2" 
                          placeholder="Optional feedback for student..."
                          data-item-id="${escapeHtml(item.id)}"
                          data-submission-id="${escapeHtml(submission.id)}">${escapeHtml(currentNote)}</textarea>
              </div>
              
              <button class="rv-btn rv-btn-save-item" 
                      data-item-id="${escapeHtml(item.id)}"
                      data-submission-id="${escapeHtml(submission.id)}"
                      aria-label="Save score for item ${escapeHtml(item.item_ref || item.ref)}">
                ${SAVE_SVG} Save
              </button>
              <span class="rv-save-status" data-item-id="${escapeHtml(item.id)}" role="status" aria-live="polite"></span>
            </div>
          </div>
        `;
      }).join('');
      
      writtenSection = `
        <div class="rv-section">
          <div class="rv-section-header">
            <span>Written Responses (${constructedItems.length} items)</span>
            <span class="rv-section-status">${statusLabel}</span>
          </div>
          <div class="rv-responses">
            ${responseCards}
          </div>
        </div>
      `;
    }
    
    // Summary section
    const autoMax = autoGradedItems.reduce((sum, i) => sum + (i.points || 0), 0);
    const autoPercentStr = autoMax > 0 ? `(${Math.round((autoEarned / autoMax) * 100)}%)` : '';
    const allItemsScored = manualTotal === 0 || manualScored === manualTotal;
    const manualDisplay = allItemsScored
      ? `${manualEarned}/${manualMax}`
      : `___/${manualMax}`;
    const manualPercentDisplay = allItemsScored && manualMax > 0
      ? `(${Math.round((manualEarned / manualMax) * 100)}%)`
      : '(__%)';
    
    const totalDisplay = allItemsScored
      ? `${totalEarned}/${totalMax} (${totalPercent}%)`
      : `___/${totalMax} — ___%`;
    const totalColorClass = allItemsScored ? scoreColorClass(totalPercent) : '';
    
    const summarySection = totalMax === 0 ? `
      <div class="rv-summary">
        <div class="rv-summary-row rv-summary-total">
          <span>Items:</span>
          <span>⚠️ No assignment items found for assignment ID ${escapeHtml(assignmentId)}. Items may need to be backfilled.</span>
        </div>
      </div>
    ` : `
      <div class="rv-summary">
        <div class="rv-summary-row">
          <span>Auto:</span>
          <span>${autoEarned}/${autoMax} ${autoPercentStr}</span>
        </div>
        <div class="rv-summary-row">
          <span>Manual:</span>
          <span>${manualDisplay} ${manualPercentDisplay} (${manualScored}/${manualTotal} scored)</span>
        </div>
        <div class="rv-summary-row rv-summary-total">
          <span>Total:</span>
          <span class="${totalColorClass}">${totalDisplay}</span>
        </div>
      </div>
    `;
    
    // Grading section — computed score summary + feedback
    const gradeSummaryDisplay = allItemsScored && totalMax > 0
      ? `<span class="${scoreColorClass(totalPercent)}" style="font-size:18px;font-weight:700;">${totalEarned}/${totalMax} — ${totalPercent}%</span>`
      : `<span style="font-size:18px;font-weight:700;font-family:monospace;">___/${totalMax} — ___%</span>`;
    const currentFeedback = submission.feedback || '';
    const gradingSection = `
      <div class="rv-section rv-grade-section">
        <div class="rv-section-header">
          <span>Grade</span>
        </div>
        <div style="margin-bottom:12px;padding:12px;background:rgba(255,255,255,0.04);border-radius:var(--rc-radius);border:1px solid var(--rc-glass-border);">
          ${gradeSummaryDisplay}
        </div>
        <div class="rv-note-input-group">
          <label>Feedback: <button class="rv-btn rv-btn-suggest rv-btn-suggest-feedback"
            data-submission-id="${escapeHtml(submission.id)}"
            aria-label="Get AI-suggested overall feedback for this submission">✨ Suggest Feedback</button></label>
          <textarea class="rv-grade-feedback-input rv-note-input" rows="3"
                    placeholder="Feedback for student (optional)..."
                    data-submission-id="${escapeHtml(submission.id)}">${escapeHtml(currentFeedback)}</textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="rv-btn rv-btn-save-grade"
                  data-submission-id="${escapeHtml(submission.id)}">${SAVE_SVG} Save Grade</button>
          <button class="rv-btn rv-btn-return"
                  data-submission-id="${escapeHtml(submission.id)}">${RETURN_SVG} Return for Revision</button>
        </div>
      </div>
    `;

    // Action buttons
    const allConstructedScored = manualScored === manualTotal;
    const finalizeDisabled = constructedItems.length > 0 && !allConstructedScored;

    let actionsSection;
    if (submission.review_status === 'finalized') {
      actionsSection = `
        <div class="rv-actions">
          <button class="rv-btn rv-btn-warning rv-btn-reopen"
                  data-submission-id="${escapeHtml(submission.id)}">
            ↩ Reopen Submission
          </button>
        </div>
      `;
    } else {
      actionsSection = `
        <div class="rv-actions">
          <button class="rv-btn rv-btn-primary rv-btn-finalize" 
                  data-submission-id="${escapeHtml(submission.id)}"
                  ${finalizeDisabled ? 'disabled' : ''}>
            ${CHECK_SVG} Finalize Submission
          </button>
          <button class="rv-btn rv-btn-next" 
                  data-submission-id="${escapeHtml(submission.id)}">
            ${SKIP_SVG} Next Student
          </button>
          ${finalizeDisabled ? '<span class="rv-hint">Score all written responses to finalize</span>' : ''}
        </div>
      `;
    }
    
    return `
      ${syntheticAssignmentIds.has(assignmentId) ? `
        <div class="rv-section" style="background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.3);border-radius:var(--rc-radius);padding:10px 14px;margin-bottom:12px;font-size:13px;color:#ca8a04;">
          ⏳ Loading item data...
        </div>` : ''}
      ${autoSection}
      ${writtenSection}
      ${summarySection}
      ${gradingSection}
      ${actionsSection}
      <div style="margin-top:16px;">
        <details>
          <summary style="font-size:11px;color:var(--rc-muted,#888);cursor:pointer;user-select:none;">🔧 Debug</summary>
          <div class="rv-raw-data" style="margin-top:8px;">
            <h4>Submission Answers (JSON)</h4>
            <pre>${escapeHtml(JSON.stringify(submission.answers, null, 2))}</pre>

            <h4>Instance Settings</h4>
            <pre>${escapeHtml(JSON.stringify(submission.instance?.settings, null, 2))}</pre>

            <h4>Submission Metadata</h4>
            <table class="rv-meta-table">
              <tr><td>ID</td><td>${escapeHtml(submission.id)}</td></tr>
              <tr><td>Instance ID</td><td>${escapeHtml(submission.instance_id)}</td></tr>
              <tr><td>Assignment ID</td><td>${escapeHtml(submission.assignment_id)}</td></tr>
              <tr><td>Score Auto</td><td>${escapeHtml(submission.score_auto)}</td></tr>
              <tr><td>Score Manual</td><td>${escapeHtml(submission.score_manual)}</td></tr>
              <tr><td>Score Total</td><td>${escapeHtml(submission.score_total)}</td></tr>
              <tr><td>Review Status</td><td>${escapeHtml(submission.review_status)}</td></tr>
              <tr><td>Submitted At</td><td>${escapeHtml(submission.submitted_at)}</td></tr>
            </table>
          </div>
        </details>
      </div>
    `;
  }

  // Event handlers
  function setupEventListeners() {
    // Class filter buttons
    const classFilterContainer = $('rvClassFilters');
    if (classFilterContainer) {
      classFilterContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('rv-filter-btn')) {
          const className = e.target.dataset.class;
          currentClassFilter = className;
          
          // Update active state
          classFilterContainer.querySelectorAll('.rv-filter-btn').forEach(btn => {
            btn.classList.remove('active');
          });
          e.target.classList.add('active');
          
          saveFilters();
          render();
        }
      });
    }
    
    // Assignment filter dropdown
    const assignmentFilter = $('rvAssignmentFilter');
    if (assignmentFilter) {
      assignmentFilter.addEventListener('change', (e) => {
        currentAssignmentFilter = e.target.value;
        saveFilters();
        render();
      });
    }
    
    // Status filter tabs
    ['rvStatusNeedsReview', 'rvStatusReviewed', 'rvStatusAll', 'rvStatusFinalized'].forEach(id => {
      const btn = $(id);
      if (btn) {
        btn.addEventListener('click', () => {
          // Update current filter
          if (id === 'rvStatusNeedsReview') currentStatusFilter = 'needs-review';
          else if (id === 'rvStatusReviewed') currentStatusFilter = 'reviewed';
          else if (id === 'rvStatusFinalized') currentStatusFilter = 'finalized';
          else currentStatusFilter = 'all';
          
          // Update active state
          ['rvStatusNeedsReview', 'rvStatusReviewed', 'rvStatusAll', 'rvStatusFinalized'].forEach(btnId => {
            const button = $(btnId);
            if (button) {
              if (btnId === id) {
                button.classList.add('active');
              } else {
                button.classList.remove('active');
              }
            }
          });
          
          saveFilters();
          render();
        });
      }
    });
    
    // Search input
    const searchInput = $('rvSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchText = e.target.value;
        render();
      });
    }
    
    // Batch action buttons
    const finalizeAllBtn = $('rvBtnFinalizeAll');
    if (finalizeAllBtn) {
      finalizeAllBtn.addEventListener('click', async () => {
        await handleFinalizeAllScored();
      });
    }

    const markAllReviewedBtn = $('rvBtnMarkAllReviewed');
    if (markAllReviewedBtn) {
      markAllReviewedBtn.addEventListener('click', async () => {
        await handleMarkAllReviewed();
      });
    }

    const autoGradeBtn = $('rvBtnAutoGrade');
    if (autoGradeBtn) {
      autoGradeBtn.addEventListener('click', async () => {
        await handleAutoGradeAll();
      });
    }

    const finalizeAllReviewedBtn = $('rvBtnFinalizeAllReviewed');
    if (finalizeAllReviewedBtn) {
      finalizeAllReviewedBtn.addEventListener('click', async () => {
        await handleFinalizeAllReviewed();
      });
    }

    const revertAllReviewedBtn = $('rvBtnRevertAllReviewed');
    if (revertAllReviewedBtn) {
      revertAllReviewedBtn.addEventListener('click', async () => {
        await handleRevertAllReviewed();
      });
    }

    // Queue container - event delegation
    const queueContainer = $('rvQueue');
    if (queueContainer) {
      queueContainer.addEventListener('click', async (e) => {
        // Handle submission header click (expand/collapse)
        const header = e.target.closest('.rv-submission-header');
        if (header) {
          const submissionId = header.dataset.submissionId;
          if (expandedSubmissions.has(submissionId)) {
            expandedSubmissions.delete(submissionId);
          } else {
            expandedSubmissions.add(submissionId);
            // Transition pending → in_progress when a teacher opens a submission
            const submission = submissionsData.find(s => s.id === submissionId);
            if (submission && (!submission.review_status || submission.review_status === 'pending')) {
              submission.review_status = 'in_progress';
              db.setSubmissionInProgress(submissionId).catch(err => {
                console.warn('[tc-review] Could not set in_progress on expand:', err);
              });
            }
          }
          await render();
          return;
        }
        
        // Handle AI suggest button click
        const suggestBtn = e.target.closest('.rv-btn-suggest');
        if (suggestBtn) {
          if (suggestBtn.classList.contains('rv-btn-suggest-feedback')) {
            await handleAiSuggestFeedback(suggestBtn);
          } else {
            await handleAiSuggest(suggestBtn);
          }
          return;
        }

        // Handle per-item save button click
        const saveBtn = e.target.closest('.rv-btn-save-item');
        if (saveBtn) {
          await handleSaveScore(saveBtn);
          return;
        }

        // Handle save-grade button click
        const saveGradeBtn = e.target.closest('.rv-btn-save-grade');
        if (saveGradeBtn) {
          await handleSaveGrade(saveGradeBtn);
          return;
        }

        // Handle return-for-revision button click
        const returnBtn = e.target.closest('.rv-btn-return');
        if (returnBtn) {
          await handleReturnForRevision(returnBtn);
          return;
        }

        // Handle reopen button click
        const reopenBtn = e.target.closest('.rv-btn-reopen');
        if (reopenBtn) {
          await handleReopenSubmission(reopenBtn);
          return;
        }

        // Handle finalize button click
        const finalizeBtn = e.target.closest('.rv-btn-finalize');
        if (finalizeBtn) {
          await handleFinalizeSubmission(finalizeBtn);
          return;
        }
        
        // Handle next button click
        const nextBtn = e.target.closest('.rv-btn-next');
        if (nextBtn) {
          await handleNextStudent(nextBtn);
          return;
        }
      });

      // Keyboard navigation: Enter/Space on submission header toggles expand/collapse
      queueContainer.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const header = e.target.closest('.rv-submission-header');
        if (!header) return;
        e.preventDefault();
        const submissionId = header.dataset.submissionId;
        const wasExpanded = expandedSubmissions.has(submissionId);
        if (wasExpanded) {
          expandedSubmissions.delete(submissionId);
        } else {
          expandedSubmissions.add(submissionId);
          // Transition pending → in_progress
          const submission = submissionsData.find(s => s.id === submissionId);
          if (submission && (!submission.review_status || submission.review_status === 'pending')) {
            submission.review_status = 'in_progress';
            db.setSubmissionInProgress(submissionId).catch(err => {
              console.warn('[tc-review] Could not set in_progress on expand:', err);
            });
          }
        }
        await render();
        // After expanding, focus the first interactive element inside the body.
        // `submissionId` here is the DOM-decoded attribute value (browser unescapes
        // HTML entities from dataset automatically), so CSS.escape() is the right
        // sanitiser to make it safe for use in a CSS attribute selector.
        if (!wasExpanded) {
          setTimeout(() => {
            const expandedHeader = document.querySelector(`.rv-submission-header[data-submission-id="${CSS.escape(submissionId)}"]`);
            if (expandedHeader) {
              const item = expandedHeader.closest('.rv-submission-item');
              const body = item && item.querySelector('.rv-submission-body');
              if (body) {
                const first = body.querySelector('button, input, textarea, select, [tabindex="0"]');
                if (first) first.focus();
              }
            }
          }, 50);
        }
      });
    }
  }

  // Compute score_total as a percentage (0-100) from raw points and total possible
  function computeScorePercentage(scoreAuto, scoreManual, items) {
    // Use points from assignment_items as the authoritative denominator.
    // Items with null/undefined points are excluded from the total to avoid
    // deflating the denominator when points haven't been set on an item.
    const totalPossible = items.reduce((sum, i) => sum + (i.points != null ? Number(i.points) : 0), 0);
    return totalPossible > 0 ? Math.round(((Number(scoreAuto) + Number(scoreManual)) / totalPossible) * 100) : 0;
  }

  // Handle "Finalize All Scored" batch action
  async function handleFinalizeAllScored() {
    if (finalizingInProgress) return;
    const queue = buildReviewQueue();
    const unreviewed = queue.filter(s => (s.review_status || 'pending') !== 'reviewed');

    // Find finalizable submissions (all constructed items scored)
    const finalizable = [];
    for (const submission of unreviewed) {
      const assignmentId = resolveAssignmentId(submission);
      if (!assignmentId) continue;
      // Bug A fix: skip submissions whose items haven't been backfilled yet — synthetic IDs
      // would cause a bigint error when writing submission_answers rows.
      if (syntheticAssignmentIds.has(assignmentId)) continue;
      const items = assignmentItemsCache[assignmentId] || [];
      const constructedItems = items.filter(item => isManualGradeItem(item));
      if (constructedItems.length === 0) continue;
      const answers = submissionAnswersCache[submission.id] || [];
      // A constructed item counts as scored if keyword-auto-scored or teacher-scored
      const allScored = constructedItems.every(item => isAutoScoredItem(item, answers));
      if (allScored) finalizable.push(submission);
    }

    if (finalizable.length === 0) return;

    if (!await rcConfirm('Finalize Submissions', `Finalize ${finalizable.length} submission${finalizable.length !== 1 ? 's' : ''}? This will trigger goal progress updates for each.`, 'Finalize')) return;

    let processed = 0;
    finalizingInProgress = true;
    try {
      for (const submission of finalizable) {
        try {
          const items = assignmentItemsCache[submission.assignment_id] || [];
          const answers = submissionAnswersCache[submission.id] || [];
          // Keyword-auto-scored fill-in-blank items count toward scoreAuto, not scoreManual
          const scoreAuto = answers.length > 0
            ? items.filter(i => isAutoScoredItem(i, answers))
                .reduce((sum, item) => {
                  const ans = answers.find(a => a.item_id === item.id);
                  return sum + (Number(ans?.earned_points) || 0);
                }, 0)
            : (Number(submission.score_auto) || 0);
          let scoreManual = 0;
          items.filter(item => isManualGradeItem(item) && !isAutoScoredItem(item, answers))
            .forEach(item => {
              const answer = answers.find(a => a.item_id === item.id);
              if (answer) scoreManual += Number(answer.earned_points) || 0;
            });
          const scoreTotal = computeScorePercentage(scoreAuto, scoreManual, items);

          await db.finalizeSubmission(submission.id, { scoreAuto, scoreManual, scoreTotal, instanceId: submission.instance_id });
          await triggerGoalProgressUpdates(submission, items, answers);

          // Archive submission for DESE compliance (non-fatal)
          try {
          const archiveRes = await fetch(ARCHIVE_SUBMISSION_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ submission_id: submission.id }),
            });
            const archiveData = await archiveRes.json();
            if (!archiveData.ok) {
              console.warn('[tc-review] Archive returned non-ok:', archiveData);
            } else {
              console.log('[tc-review] Archived submission:', archiveData.archive_id);
            }
          } catch (archiveErr) {
            console.warn('[tc-review] Archive failed (non-fatal):', archiveErr);
          }

          submission.score_auto = scoreAuto;
          submission.score_manual = scoreManual;
          submission.score_total = scoreTotal;
          submission.review_status = 'finalized';
          delete submissionAnswersCache[submission.id];
          expandedSubmissions.delete(submission.id);
          processed++;
        } catch (err) {
          console.error('[tc-review] Batch finalize error:', submission.id, err);
        }
      }
    } finally {
      finalizingInProgress = false;
    }

    showToast(`Finalized ${processed} submission${processed !== 1 ? 's' : ''}`, '#22c55e', '#0b1220');
    await render();
  }

  // Handle "Mark All Reviewed" batch action
  async function handleMarkAllReviewed() {
    if (finalizingInProgress) return;
    const queue = buildReviewQueue();
    const unreviewed = queue.filter(s => (s.review_status || 'pending') !== 'reviewed');

    if (unreviewed.length === 0) return;

    // Separate submissions with unscored constructed-response items — skip those
    const skipped = [];
    const toProcess = [];
    for (const submission of unreviewed) {
      const assignmentId = resolveAssignmentId(submission);
      const items = assignmentItemsCache[assignmentId] || [];
      const constructedItems = items.filter(item => isManualGradeItem(item));
      if (constructedItems.length > 0) {
        const answers = submissionAnswersCache[submission.id] || await getSubmissionAnswers(submission.id);
        // Only skip if there are truly unscored constructed items (not keyword-auto-scored)
        const hasUnscored = constructedItems.some(item => !isAutoScoredItem(item, answers));
        if (hasUnscored) {
          skipped.push(submission);
          continue;
        }
      }
      toProcess.push(submission);
    }

    if (toProcess.length === 0) {
      if (skipped.length > 0) {
        showToast(`${skipped.length} submission${skipped.length !== 1 ? 's' : ''} skipped — they have unscored written responses`, '#f59e0b', '#0b1220');
      }
      return;
    }

    if (!await rcConfirm('Mark Reviewed', `Mark ${toProcess.length} submission${toProcess.length !== 1 ? 's' : ''} as reviewed?`, 'Mark Reviewed')) return;

    let processed = 0;
    finalizingInProgress = true;
    try {
      for (const submission of toProcess) {
        try {
          const answers = submissionAnswersCache[submission.id] || [];
          const assignmentId = resolveAssignmentId(submission);
          const items = assignmentItemsCache[assignmentId] || [];
          // Keyword-auto-scored fill-in-blank items count toward scoreAuto, not scoreManual
          const scoreAuto = answers.length > 0
            ? items.filter(i => isAutoScoredItem(i, answers))
                .reduce((sum, item) => {
                  const ans = answers.find(a => a.item_id === item.id);
                  return sum + (Number(ans?.earned_points) || 0);
                }, 0)
            : (Number(submission.score_auto) || 0);
          let scoreManual = 0;
          const manualConstructed = items.filter(item => isManualGradeItem(item) && !isAutoScoredItem(item, answers));
          manualConstructed.forEach(item => {
            const answer = answers.find(a => a.item_id === item.id);
            if (answer) scoreManual += Number(answer.earned_points) || 0;
          });
          if (items.filter(i => isManualGradeItem(i)).length === 0) scoreManual = Number(submission.score_manual) || 0;
          const scoreTotal = computeScorePercentage(scoreAuto, scoreManual, items);

          await db.finalizeSubmission(submission.id, { scoreAuto, scoreManual, scoreTotal, instanceId: submission.instance_id });
          await triggerGoalProgressUpdates(submission, items, answers);

          submission.score_auto = scoreAuto;
          submission.score_manual = scoreManual;
          submission.score_total = scoreTotal;
          submission.review_status = 'reviewed';
          expandedSubmissions.delete(submission.id);
          processed++;
        } catch (err) {
          console.error('[tc-review] Batch mark reviewed error:', submission.id, err);
        }
      }
    } finally {
      finalizingInProgress = false;
    }

    const skippedMsg = skipped.length > 0 ? ` (${skipped.length} skipped — unscored written responses)` : '';
    showToast(`Marked ${processed} submission${processed !== 1 ? 's' : ''} as reviewed${skippedMsg}`, '#22c55e', '#0b1220');
    await render();
  }

  // Handle "Finalize All Reviewed" batch action
  async function handleFinalizeAllReviewed() {
    if (finalizingInProgress) return;
    const reviewed = submissionsData.filter(s => s.review_status === 'reviewed');
    if (reviewed.length === 0) return;

    if (!await rcConfirm('Finalize All Reviewed', `Finalize ${reviewed.length} reviewed submission${reviewed.length !== 1 ? 's' : ''}? This will lock grades and trigger IEP goal progress updates.`, 'Finalize')) return;

    let processed = 0;
    finalizingInProgress = true;
    try {
      for (const submission of reviewed) {
        try {
          const assignmentId = resolveAssignmentId(submission);
          if (syntheticAssignmentIds.has(assignmentId)) continue;
          const items = assignmentItemsCache[assignmentId] || [];
          const answers = submissionAnswersCache[submission.id] || await getSubmissionAnswers(submission.id);
          const scoreAuto = answers.length > 0
            ? items.filter(i => isAutoScoredItem(i, answers))
                .reduce((sum, item) => {
                  const ans = answers.find(a => a.item_id === item.id);
                  return sum + (Number(ans?.earned_points) || 0);
                }, 0)
            : (Number(submission.score_auto) || 0);
          let scoreManual = 0;
          items.filter(item => (item.answer_type === 'constructed' || item.answer_type === 'written_response') && !isAutoScoredItem(item, answers))
            .forEach(item => {
              const answer = answers.find(a => a.item_id === item.id);
              if (answer) scoreManual += Number(answer.earned_points) || 0;
            });
          const scoreTotal = computeScorePercentage(scoreAuto, scoreManual, items);

          const finalizeRes = await fetch('/.netlify/functions/teacher-review-save', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'finalize',
              submissionId: submission.id,
              scoreAuto,
              scoreManual,
              scoreTotal,
              instanceId: submission.instance_id,
            }),
          });
          if (!finalizeRes.ok) {
            const finalizeErr = await finalizeRes.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(finalizeErr.error || `Failed to finalize submission: ${finalizeRes.status}`);
          }
          await triggerGoalProgressUpdates(submission, items, answers);

          // Archive submission for DESE compliance (non-fatal)
          try {
            const archiveRes = await fetch(ARCHIVE_SUBMISSION_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ submission_id: submission.id }),
            });
            const archiveData = await archiveRes.json();
            if (!archiveData.ok) {
              console.warn('[tc-review] Archive returned non-ok:', archiveData);
            } else {
              console.log('[tc-review] Archived submission:', archiveData.archive_id);
            }
          } catch (archiveErr) {
            console.warn('[tc-review] Archive failed (non-fatal):', archiveErr);
          }

          submission.score_auto = scoreAuto;
          submission.score_manual = scoreManual;
          submission.score_total = scoreTotal;
          submission.review_status = 'finalized';
          delete submissionAnswersCache[submission.id];
          expandedSubmissions.delete(submission.id);
          processed++;
        } catch (err) {
          console.error('[tc-review] Finalize all reviewed error:', submission.id, err);
        }
      }
    } finally {
      finalizingInProgress = false;
    }

    showToast(`Finalized ${processed} submission${processed !== 1 ? 's' : ''}`, '#22c55e', '#0b1220');
    await render();
  }

  // Handle "Revert All Reviewed" batch action — sends all reviewed submissions back to Needs Review
  async function handleRevertAllReviewed() {
    if (finalizingInProgress) return;
    const reviewed = submissionsData.filter(s => s.review_status === 'reviewed');
    if (reviewed.length === 0) return;

    if (!await rcConfirm('Revert All Reviewed', `Revert ${reviewed.length} reviewed submission${reviewed.length !== 1 ? 's' : ''} back to Needs Review? Scores will be preserved but submissions will be reopened for re-grading.`, 'Revert')) return;

    let reverted = 0;
    finalizingInProgress = true;
    try {
      for (const submission of reviewed) {
        try {
          const revertRes = await fetch('/.netlify/functions/teacher-review-save', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'reopen',
              submissionId: submission.id,
              instanceId: submission.instance_id,
            }),
          });
          if (!revertRes.ok) {
            const revertErr = await revertRes.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(revertErr.error || `Failed to revert submission: ${revertRes.status}`);
          }
          submission.review_status = 'pending';
          reverted++;
        } catch (err) {
          console.error('[tc-review] Revert all reviewed error:', submission.id, err);
        }
      }
    } finally {
      finalizingInProgress = false;
    }

    showToast(`Reverted ${reverted} submission${reverted !== 1 ? 's' : ''} to Needs Review`, '#f59e0b', '#0b1220');
    await render();
  }

  // Handle "Auto-Grade All" batch action — AI-suggests scores and feedback for all unreviewed submissions
  async function handleAutoGradeAll() {
    if (finalizingInProgress) return;
    const queue = buildReviewQueue();
    const unreviewed = queue.filter(s => {
      const status = s.review_status || 'pending';
      return status === 'pending' || status === 'in_progress';
    });

    // Find submissions with unscored constructed items
    const toAutoGrade = [];
    for (const submission of unreviewed) {
      const assignmentId = resolveAssignmentId(submission);
      if (!assignmentId || syntheticAssignmentIds.has(assignmentId)) continue;
      const items = assignmentItemsCache[assignmentId] || [];
      const constructedItems = items.filter(item => item.answer_type === 'constructed' || item.answer_type === 'written_response');
      if (constructedItems.length === 0) continue;
      const answers = submissionAnswersCache[submission.id] || await getSubmissionAnswers(submission.id);
      const hasUnscored = constructedItems.some(item => !isAutoScoredItem(item, answers));
      if (hasUnscored) toAutoGrade.push(submission);
    }

    if (toAutoGrade.length === 0) {
      showToast('No submissions need auto-grading', '#f59e0b', '#0b1220');
      return;
    }

    if (!await rcConfirm(
      'Auto-Grade All',
      `Auto-grade ${toAutoGrade.length} submission${toAutoGrade.length !== 1 ? 's' : ''} using AI? This will suggest scores for written responses and generate overall feedback. Submissions will move to the Reviewed tab where you can adjust before finalizing.`,
      'Auto-Grade'
    )) return;

    let processed = 0;
    let failed = 0;

    // Show a live progress toast
    const progressEl = document.createElement('div');
    progressEl.className = 'rv-autograde-progress';
    progressEl.textContent = `Auto-grading… 0/${toAutoGrade.length}`;
    document.body.appendChild(progressEl);

    finalizingInProgress = true;
    try {
      for (const submission of toAutoGrade) {
        try {
          const assignmentId = resolveAssignmentId(submission);
          const items = assignmentItemsCache[assignmentId] || [];
          const answers = submissionAnswersCache[submission.id] || await getSubmissionAnswers(submission.id);
          const constructedItems = items.filter(item => item.answer_type === 'constructed' || item.answer_type === 'written_response');
          const instance = assignmentInstancesData.find(i => i.id === submission.instance_id);
          const assignmentTitle = instance?.settings?.title || '';
          for (const item of constructedItems) {
            if (isAutoScoredItem(item, answers)) continue; // already scored

            const answer = answers.find(a => a.item_id === item.id);
            const rawAnswer = answer?.raw_answer;
            const studentResponse = (typeof rawAnswer === 'object' && rawAnswer !== null && rawAnswer.value !== undefined)
              ? rawAnswer.value
              : (typeof rawAnswer === 'string' ? rawAnswer : '');
            if (!studentResponse || String(studentResponse).trim() === '') continue;

            const maxPoints = item.points || 5;
            const itemLabel = item.item_ref || item.ref || '';
            const questionText = item.meta?.question || '';
            const goalCodes = item.goal_codes || [];
            let goalDescriptions = [];
            if (goalCodes.length > 0) {
              const studentObj = studentsData.find(s => s.code === instance?.student_code);
              const studentId = studentObj?.id;
              if (studentId) {
                const goals = await ensureGoalsLoaded(studentId);
                goalDescriptions = goalCodes.map(code => {
                  const goal = goals.find(g => g.code === code);
                  if (!goal) return '';
                  const desc = goal.description || goal.desc || '';
                  const area = goal.area || goal.skill_area || '';
                  return area ? `${area} — ${desc}` : desc;
                }).filter(Boolean);
              }
            }

            try {
              const suggestRes = await fetch('/.netlify/functions/teacher-ai-suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                  student_response: String(studentResponse),
                  rubric_tiers: generateRubricTiers(maxPoints),
                  max_points: maxPoints,
                  item_label: itemLabel,
                  question_text: questionText,
                  goal_codes: goalCodes,
                  goal_descriptions: goalDescriptions,
                }),
              });
              if (suggestRes.ok) {
                const suggestData = await suggestRes.json();
                if (suggestData.ok && suggestData.suggested_score != null) {
                  // Save the AI-suggested score to the cache so subsequent steps use it
                  if (answer) {
                    answer.earned_points = suggestData.suggested_score;
                    if (suggestData.suggested_note) answer.teacher_note = suggestData.suggested_note;
                    if (suggestData.rationale) answer.rationale = suggestData.rationale;
                  } else {
                    const newAnswer = {
                      item_id: item.id,
                      submission_id: submission.id,
                      earned_points: suggestData.suggested_score,
                      teacher_note: suggestData.suggested_note || '',
                      rationale: suggestData.rationale || '',
                    };
                    answers.push(newAnswer);
                    submissionAnswersCache[submission.id] = answers;
                  }

                  // Persist the score via teacher-review-save
                  const saveScoreRes = await fetch('/.netlify/functions/teacher-review-save', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'save_score',
                      submissionId: submission.id,
                      itemId: item.id,
                      earnedPoints: suggestData.suggested_score,
                      teacherNote: suggestData.suggested_note || '',
                      rationale: suggestData.rationale || '',
                      aiSuggestedScore: suggestData.suggested_score,
                    }),
                  });
                  if (!saveScoreRes.ok) {
                    const saveScoreErr = await saveScoreRes.json().catch(() => ({ error: 'Unknown error' }));
                    console.warn('[tc-review] Save score failed:', submission.id, item.id, saveScoreErr.error);
                  }
                }
              }
            } catch (itemErr) {
              console.warn('[tc-review] Auto-grade item error:', submission.id, item.id, itemErr);
            }
          }

          // Step 2: Build item summaries for the feedback endpoint
          const latestAnswers = submissionAnswersCache[submission.id] || answers;
          const itemSummaries = items.map(item => {
            const answer = latestAnswers.find(a => a.item_id === item.id);
            return {
              label: item.item_ref || item.ref || 'Item',
              type: item.answer_type || 'auto',
              earned: answer?.earned_points != null ? Number(answer.earned_points) : null,
              max: item.points || 0,
              teacher_note: answer?.teacher_note || '',
            };
          }).filter(s => s.earned != null || s.type === 'constructed' || s.type === 'written_response');

          const totalEarned = itemSummaries.reduce((sum, s) => sum + (s.earned || 0), 0);
          const totalPossible = items.reduce((sum, i) => sum + (i.points || 0), 0);
          const totalPercent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;

          // Step 3: AI-suggest overall feedback
          let suggestedFeedback = '';
          try {
            const feedbackRes = await fetch('/.netlify/functions/teacher-ai-suggest-feedback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({
                assignment_title: assignmentTitle,
                total_score: totalEarned,
                total_possible: totalPossible,
                total_percent: totalPercent,
                item_summaries: itemSummaries,
                student_code: instance?.student_code || '',
              }),
            });
            if (feedbackRes.ok) {
              const feedbackData = await feedbackRes.json();
              if (feedbackData.ok && feedbackData.suggested_feedback) {
                suggestedFeedback = feedbackData.suggested_feedback;
              }
            }
          } catch (fbErr) {
            console.warn('[tc-review] Auto-grade feedback error:', submission.id, fbErr);
          }

          // Step 4: Save grade + feedback and mark as reviewed
          const scoreAuto = latestAnswers.length > 0
            ? items.filter(i => isAutoScoredItem(i, latestAnswers))
                .reduce((sum, item) => {
                  const ans = latestAnswers.find(a => a.item_id === item.id);
                  return sum + (Number(ans?.earned_points) || 0);
                }, 0)
            : (Number(submission.score_auto) || 0);
          let scoreManual = 0;
          items.filter(item => (item.answer_type === 'constructed' || item.answer_type === 'written_response') && !isAutoScoredItem(item, latestAnswers))
            .forEach(item => {
              const answer = latestAnswers.find(a => a.item_id === item.id);
              if (answer) scoreManual += Number(answer.earned_points) || 0;
            });
          const scoreTotal = computeScorePercentage(scoreAuto, scoreManual, items);
          const gradedAt = new Date().toISOString();
          const gradedBy = localStorage.getItem('rc_teacher_name') || 'Teacher (AI-Assisted)';

          const gradeRes = await fetch('/.netlify/functions/teacher-review-save', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save_grade',
              submissionId: submission.id,
              scoreAuto,
              scoreManual,
              scoreTotal,
              status: 'Graded',
              gradedAt,
              gradedBy,
              feedback: suggestedFeedback,
              instanceId: submission.instance_id,
            }),
          });
          if (!gradeRes.ok) {
            const gradeErr = await gradeRes.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(gradeErr.error || `Failed to save grade for submission: ${gradeRes.status}`);
          }

          // Update local cache
          submission.score_auto = scoreAuto;
          submission.score_manual = scoreManual;
          submission.score_total = scoreTotal;
          submission.review_status = 'reviewed';
          submission.graded_at = gradedAt;
          submission.graded_by = gradedBy;
          if (suggestedFeedback) submission.feedback = suggestedFeedback;

          expandedSubmissions.delete(submission.id);
          delete submissionAnswersCache[submission.id];
          processed++;
        } catch (err) {
          console.error('[tc-review] Auto-grade error:', submission.id, err);
          failed++;
        }

        // Update progress
        progressEl.textContent = `Auto-grading… ${processed + failed}/${toAutoGrade.length}`;
      }
    } finally {
      finalizingInProgress = false;
      progressEl.remove();
    }

    const summaryMsg = failed > 0
      ? `Auto-graded ${processed}/${toAutoGrade.length}. ${failed} failed (see console).`
      : `Auto-graded ${processed} submission${processed !== 1 ? 's' : ''}`;
    showToast(summaryMsg, failed > 0 ? '#f59e0b' : '#22c55e', '#0b1220');
    await render();
  }

  // Handle AI-suggested overall feedback for a submission
  async function handleAiSuggestFeedback(button) {
    const submissionId = button.dataset.submissionId;

    // Find the feedback textarea
    const feedbackInput = document.querySelector(`.rv-grade-feedback-input[data-submission-id="${CSS.escape(submissionId)}"]`);
    if (!feedbackInput) return;

    const submission = submissionsData.find(s => s.id === submissionId);
    if (!submission) return;

    const assignmentId = resolveAssignmentId(submission);
    const items = assignmentItemsCache[assignmentId] || [];
    const answers = submissionAnswersCache[submissionId] || await getSubmissionAnswers(submissionId);
    const instance = assignmentInstancesData.find(i => i.id === submission.instance_id);
    const assignmentTitle = instance?.settings?.title || '';

    // Build item summaries
    const itemSummaries = items.map(item => {
      const answer = answers.find(a => a.item_id === item.id);
      return {
        label: item.item_ref || item.ref || 'Item',
        type: item.answer_type || 'auto',
        earned: answer?.earned_points != null ? Number(answer.earned_points) : null,
        max: item.points || 0,
        teacher_note: answer?.teacher_note || '',
      };
    });

    const totalEarned = itemSummaries.reduce((sum, s) => sum + (s.earned || 0), 0);
    const totalPossible = items.reduce((sum, i) => sum + (i.points || 0), 0);
    const totalPercent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;

    // Remove any previous rationale/error messages below this button
    const prevMsg = button.nextElementSibling;
    if (prevMsg && (prevMsg.classList.contains('rv-ai-rationale') || prevMsg.classList.contains('rv-ai-error'))) {
      prevMsg.remove();
    }

    const originalText = button.textContent.trim();
    button.textContent = '⏳ Thinking...';
    button.disabled = true;

    try {
      const res = await fetch('/.netlify/functions/teacher-ai-suggest-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          assignment_title: assignmentTitle,
          total_score: totalEarned,
          total_possible: totalPossible,
          total_percent: totalPercent,
          item_summaries: itemSummaries,
          student_code: instance?.student_code || '',
        }),
      });

      if (!res.ok) {
        let errText = 'Could not get suggestion — please write feedback manually';
        if (res.status === 503) {
          errText = 'AI suggestions not configured — ask admin to add OPENAI_API_KEY';
        }
        const errDiv = document.createElement('div');
        errDiv.className = 'rv-ai-error';
        errDiv.setAttribute('role', 'alert');
        errDiv.textContent = errText;
        button.insertAdjacentElement('afterend', errDiv);
        return;
      }

      const data = await res.json();
      const { suggested_feedback, rationale } = data;

      if (suggested_feedback) {
        feedbackInput.value = suggested_feedback;
        feedbackInput.classList.add('rv-ai-suggested');
        setTimeout(() => feedbackInput.classList.remove('rv-ai-suggested'), 2000);
      }

      if (rationale) {
        const rationaleDiv = document.createElement('div');
        rationaleDiv.className = 'rv-ai-rationale';
        rationaleDiv.setAttribute('role', 'status');
        rationaleDiv.textContent = `AI rationale: ${rationale}`;
        button.insertAdjacentElement('afterend', rationaleDiv);
        setTimeout(() => { rationaleDiv.classList.add('rv-ai-rationale-fading'); }, 10000);
      }
    } catch (err) {
      console.error('[tc-review] AI suggest feedback error:', err);
      const errDiv = document.createElement('div');
      errDiv.className = 'rv-ai-error';
      errDiv.setAttribute('role', 'alert');
      errDiv.textContent = 'Could not get suggestion — please write feedback manually';
      button.insertAdjacentElement('afterend', errDiv);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  // Handle AI-suggested grade for a constructed-response item
  async function handleAiSuggest(button) {
    const itemId = button.dataset.itemId;
    const submissionId = button.dataset.submissionId;

    // Find DOM elements within the same card
    const card = button.closest('.rv-response-card');
    const responseTextEl = card && card.querySelector('.rv-response-text');
    const scoreInput = card && card.querySelector(`input.rv-score-input[data-item-id="${itemId}"]`);
    const noteInput = card && card.querySelector(`textarea.rv-note-input[data-item-id="${itemId}"]`);

    if (!responseTextEl || !scoreInput) return;

    const studentResponse = responseTextEl.textContent || '';

    // Look up item metadata from cache
    const submission = submissionsData.find(s => s.id === submissionId);
    const instance = submission && assignmentInstancesData.find(i => i.id === submission.instance_id);
    const assignmentId = instance && instance.assignment_id;
    const items = assignmentId ? (assignmentItemsCache[assignmentId] || []) : [];
    const item = items.find(it => String(it.id) === String(itemId));
    const maxPoints = (item && item.points) || 5;
    const itemLabel = item ? (item.item_ref || item.ref || '') : '';
    const questionText = (item && item.meta?.question) || '';
    const goalCodes = (item && item.goal_codes) || [];
    let goalDescriptions = [];

    if (goalCodes.length > 0) {
      const studentObj = studentsData.find(s => s.code === instance?.student_code);
      const studentId = studentObj?.id;
      if (studentId) {
        const goals = await ensureGoalsLoaded(studentId);
        goalDescriptions = goalCodes.map(code => {
          const goal = goals.find(g => g.code === code);
          if (!goal) return '';
          const desc = goal.description || goal.desc || '';
          const area = goal.area || goal.skill_area || '';
          return area ? `${area} — ${desc}` : desc;
        }).filter(Boolean);
      }
    }

    const rubricTiers = generateRubricTiers(maxPoints);

    // Remove any previous rationale/error messages below this button
    const prevMsg = button.nextElementSibling;
    if (prevMsg && (prevMsg.classList.contains('rv-ai-rationale') || prevMsg.classList.contains('rv-ai-error'))) {
      prevMsg.remove();
    }

    // Show loading state
    const originalText = button.textContent.trim();
    button.textContent = '⏳ Thinking...';
    button.disabled = true;

    try {
      const res = await fetch('/.netlify/functions/teacher-ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          student_response: studentResponse,
          rubric_tiers: rubricTiers,
          max_points: maxPoints,
          item_label: itemLabel,
          question_text: questionText,
          goal_codes: goalCodes,
          goal_descriptions: goalDescriptions
        })
      });

      if (!res.ok) {
        let errText = 'Could not get suggestion — please score manually';
        if (res.status === 503) {
          errText = 'AI suggestions not configured — ask admin to add OPENAI_API_KEY';
        }
        const errDiv = document.createElement('div');
        errDiv.className = 'rv-ai-error';
        errDiv.setAttribute('role', 'alert');
        errDiv.textContent = errText;
        button.insertAdjacentElement('afterend', errDiv);
        return;
      }

      const data = await res.json();
      const { suggested_score, suggested_note, rationale } = data;

      // Populate fields
      if (suggested_score != null) {
        scoreInput.value = suggested_score;
        scoreInput.dataset.aiSuggestedScore = suggested_score;
        scoreInput.classList.add('rv-ai-suggested');
        setTimeout(() => scoreInput.classList.remove('rv-ai-suggested'), 2000);
      }
      if (suggested_note != null && noteInput) {
        noteInput.value = suggested_note;
        noteInput.classList.add('rv-ai-suggested');
        setTimeout(() => noteInput.classList.remove('rv-ai-suggested'), 2000);
      }

      // Save rationale to answer cache and DOM so it persists when teacher clicks Save
      if (rationale) {
        scoreInput.dataset.aiRationale = rationale;
        const cachedAnswers = submissionAnswersCache[submissionId];
        if (cachedAnswers) {
          const cachedAnswer = cachedAnswers.find(a => String(a.item_id) === String(itemId) || String(a.assignment_item_id) === String(itemId));
          if (cachedAnswer) cachedAnswer.rationale = rationale;
        }

        // Show inline rationale in teacher UI
        const rationaleDiv = document.createElement('div');
        rationaleDiv.className = 'rv-ai-rationale';
        rationaleDiv.setAttribute('role', 'status');
        rationaleDiv.textContent = `AI rationale: ${rationale}`;
        button.insertAdjacentElement('afterend', rationaleDiv);
        setTimeout(() => { rationaleDiv.classList.add('rv-ai-rationale-fading'); }, 10000);
      }

      // Auto-save the AI-suggested score (only when submission and a real item ID are available)
      if (suggested_score != null && submission && !String(itemId).startsWith(SYNTHETIC_ID_PREFIX)) {
        const statusSpan = card.querySelector(`.rv-save-status[data-item-id="${itemId}"]`);
        if (statusSpan) { statusSpan.textContent = 'Saving…'; statusSpan.className = 'rv-save-status'; }

        const saveRes = await fetch('/.netlify/functions/teacher-review-save', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_score',
            submissionId,
            itemId,
            earnedPoints: suggested_score,
            teacherNote: suggested_note || '',
            rationale: rationale || '',
            aiSuggestedScore: suggested_score,
          }),
        });

        if (!saveRes.ok) {
          if (statusSpan) { statusSpan.textContent = 'Error'; statusSpan.className = 'rv-save-status error'; }
          // Fall back to just having populated the fields — teacher can save manually
        } else {
          if (statusSpan) {
            statusSpan.textContent = 'Saved';
            statusSpan.className = 'rv-save-status success';
            setTimeout(() => { statusSpan.textContent = ''; }, 2000);
          }

          // Update local answer cache with the newly saved score
          let cachedAnswers = submissionAnswersCache[submissionId];
          if (!cachedAnswers) {
            cachedAnswers = [];
            submissionAnswersCache[submissionId] = cachedAnswers;
          }
          const cachedAnswer = cachedAnswers.find(
            a => String(a.item_id) === String(itemId) || String(a.assignment_item_id) === String(itemId)
          );
          if (cachedAnswer) {
            cachedAnswer.earned_points = suggested_score;
            cachedAnswer.teacher_note = suggested_note || '';
          } else {
            cachedAnswers.push({ item_id: itemId, assignment_item_id: itemId, earned_points: suggested_score, teacher_note: suggested_note || '', rationale: rationale || '' });
          }

          // Advance submission status to 'in_progress' if it is still 'pending'
          if (!submission.review_status || submission.review_status === 'pending') {
            submission.review_status = 'in_progress';
            db.setSubmissionInProgress(submissionId).catch(err => {
              console.warn('[tc-review] Could not set in_progress on AI suggest:', err);
            });
          }

          // Check whether all constructed items on this submission are now scored
          const latestAnswers = submissionAnswersCache[submissionId] || [];
          const constructedItems = items.filter(it => it.answer_type === 'constructed' || it.answer_type === 'written_response');
          const allScored = constructedItems.length > 0 &&
            constructedItems.every(it => isAutoScoredItem(it, latestAnswers));

          if (allScored) {
            // All constructed items are scored — generate overall feedback and save grade
            try {
              const assignmentTitle = instance?.settings?.title || '';
              const itemSummaries = items.map(it => {
                const ans = latestAnswers.find(a => a.item_id === it.id);
                return {
                  label: it.item_ref || it.ref || 'Item',
                  type: it.answer_type || 'auto',
                  earned: ans?.earned_points != null ? Number(ans.earned_points) : null,
                  max: it.points || 0,
                  teacher_note: ans?.teacher_note || '',
                };
              }).filter(s => s.earned != null || s.type === 'constructed' || s.type === 'written_response');

              const totalEarned = itemSummaries.reduce((sum, s) => sum + (s.earned || 0), 0);
              const totalPossible = items.reduce((sum, it) => sum + (it.points || 0), 0);
              const totalPercent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;

              let suggestedFeedback = '';
              try {
                const feedbackRes = await fetch('/.netlify/functions/teacher-ai-suggest-feedback', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'same-origin',
                  body: JSON.stringify({
                    assignment_title: assignmentTitle,
                    total_score: totalEarned,
                    total_possible: totalPossible,
                    total_percent: totalPercent,
                    item_summaries: itemSummaries,
                    student_code: instance?.student_code || '',
                  }),
                });
                if (feedbackRes.ok) {
                  const feedbackData = await feedbackRes.json();
                  if (feedbackData.ok && feedbackData.suggested_feedback) {
                    suggestedFeedback = feedbackData.suggested_feedback;
                  }
                }
              } catch (fbErr) {
                console.warn('[tc-review] AI suggest feedback error:', submissionId, fbErr);
              }

              const scoreAuto = latestAnswers.length > 0
                ? items.filter(it => isAutoScoredItem(it, latestAnswers))
                    .reduce((sum, it) => {
                      const ans = latestAnswers.find(a => a.item_id === it.id);
                      return sum + (Number(ans?.earned_points) || 0);
                    }, 0)
                : (Number(submission.score_auto) || 0);
              let scoreManual = 0;
              items.filter(it => (it.answer_type === 'constructed' || it.answer_type === 'written_response') && !isAutoScoredItem(it, latestAnswers))
                .forEach(it => {
                  const ans = latestAnswers.find(a => a.item_id === it.id);
                  if (ans) scoreManual += Number(ans.earned_points) || 0;
                });
              const scoreTotal = computeScorePercentage(scoreAuto, scoreManual, items);
              const gradedAt = new Date().toISOString();
              const gradedBy = localStorage.getItem('rc_teacher_name') || 'Teacher (AI-Assisted)';

              const gradeRes = await fetch('/.netlify/functions/teacher-review-save', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'save_grade',
                  submissionId,
                  scoreAuto,
                  scoreManual,
                  scoreTotal,
                  status: 'Graded',
                  gradedAt,
                  gradedBy,
                  feedback: suggestedFeedback,
                  instanceId: submission.instance_id,
                }),
              });

              if (gradeRes.ok) {
                submission.score_auto = scoreAuto;
                submission.score_manual = scoreManual;
                submission.score_total = scoreTotal;
                submission.review_status = 'reviewed';
                submission.graded_at = gradedAt;
                submission.graded_by = gradedBy;
                if (suggestedFeedback) submission.feedback = suggestedFeedback;
                delete submissionAnswersCache[submissionId];
                expandedSubmissions.delete(submissionId);
                showToast('Score saved — submission moved to Reviewed', '#22c55e', '#0b1220');
              } else {
                delete submissionAnswersCache[submissionId];
                expandedSubmissions.add(submissionId);
                showToast('Score saved', '#22c55e', '#0b1220');
              }
            } catch (gradeErr) {
              console.error('[tc-review] Error saving grade after AI suggest:', gradeErr);
              delete submissionAnswersCache[submissionId];
              expandedSubmissions.add(submissionId);
              showToast('Score saved', '#22c55e', '#0b1220');
            }
          } else {
            // Not all constructed items scored yet — just update the live summary
            delete submissionAnswersCache[submissionId];
            expandedSubmissions.add(submissionId);
            showToast('Score saved', '#22c55e', '#0b1220');
          }

          await render();
        }
      }
    } catch (err) {
      console.error('[tc-review] AI suggest error:', err);
      const errDiv = document.createElement('div');
      errDiv.className = 'rv-ai-error';
      errDiv.setAttribute('role', 'alert');
      errDiv.textContent = 'Could not get suggestion — please score manually';
      button.insertAdjacentElement('afterend', errDiv);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  // Handle saving a score for an item
  async function handleSaveScore(button) {
    const itemId = button.dataset.itemId;
    const submissionId = button.dataset.submissionId;
    
    // Find the score and note inputs
    const scoreInput = document.querySelector(`input.rv-score-input[data-item-id="${itemId}"]`);
    const noteInput = document.querySelector(`textarea.rv-note-input[data-item-id="${itemId}"]`);
    const statusSpan = document.querySelector(`.rv-save-status[data-item-id="${itemId}"]`);
    
    if (!scoreInput) return;
    
    const earnedPoints = parseFloat(scoreInput.value) || 0;
    const teacherNote = noteInput ? noteInput.value.trim() : '';
    const aiRationale = scoreInput.dataset.aiRationale || '';
    const aiSuggestedScore = ('aiSuggestedScore' in scoreInput.dataset) && scoreInput.dataset.aiSuggestedScore !== ''
      ? (parseFloat(scoreInput.dataset.aiSuggestedScore) || null)
      : null;

    // Bug A fix: synthetic item IDs (e.g. "synthetic_WP_4") cannot be stored as bigint.
    // Backfill the assignment first, then resolve to the real DB item ID.
    let resolvedItemId = itemId;
    if (itemId && String(itemId).startsWith(SYNTHETIC_ID_PREFIX)) {
      const submission = submissionsData.find(s => s.id === submissionId);
      // assignment_id is NOT on the raw submission — resolve via instance
      const instance = assignmentInstancesData.find(i => i.id === submission?.instance_id);
      const assignmentId = instance?.assignment_id;
      if (!assignmentId) {
        if (statusSpan) { statusSpan.textContent = 'Error'; statusSpan.className = 'rv-save-status error'; }
        showToast('Cannot determine assignment for this submission. Please refresh and try again.', '#ef4444', '#fff');
        return;
      }
      const itemRef = String(itemId).slice(SYNTHETIC_ID_PREFIX.length);
      try {
        if (statusSpan) { statusSpan.textContent = 'Backfilling…'; statusSpan.className = 'rv-save-status'; }
        const freshItems = await ensureRealItems(assignmentId);
        const realItem = freshItems.find(i => (i.item_ref || i.ref) === itemRef);
        if (!realItem || String(realItem.id).startsWith(SYNTHETIC_ID_PREFIX)) {
          // Last resort: query REST API directly for the item by item_ref, bypassing JS client caching
          let resolvedViaRest = false;
          console.log('[tc-review] Trying direct REST lookup for item:', { assignmentId, itemRef });
          const supabaseUrl = SUPABASE_URL_CACHED;
          const supabaseKey = SUPABASE_KEY_CACHED;
          if (assignmentId && itemRef && supabaseUrl && supabaseKey) {
            try {
              const restRes = await fetch(
                `${supabaseUrl}/rest/v1/assignment_items?select=id,item_ref&assignment_id=eq.${encodeURIComponent(assignmentId)}&item_ref=eq.${encodeURIComponent(itemRef)}&limit=1`,
                { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
              );
              if (restRes.ok) {
                const restItems = await restRes.json();
                if (Array.isArray(restItems) && restItems.length > 0) {
                  resolvedItemId = restItems[0].id;
                  button.dataset.itemId = String(resolvedItemId);
                  resolvedViaRest = true;
                }
              } else {
                console.error('[tc-review] REST item lookup returned', restRes.status, 'for', { assignmentId, itemRef });
              }
            } catch (restErr) {
              console.error('[tc-review] Direct REST item lookup failed:', restErr);
            }
          } else {
            console.error('[tc-review] Cannot do REST lookup — missing params:', { assignmentId, itemRef, hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
          }
          if (!resolvedViaRest) {
            if (statusSpan) { statusSpan.textContent = 'Error'; statusSpan.className = 'rv-save-status error'; }
            showToast('Score could not be saved. Please reload the page and try again.', '#ef4444', '#fff');
            return;
          }
        } else {
          resolvedItemId = realItem.id;
          // Update DOM so subsequent saves use the real ID directly without re-resolution
          button.dataset.itemId = String(resolvedItemId);
        }
      } catch (err) {
        console.error('[tc-review] Backfill required before save:', err);
        if (statusSpan) { statusSpan.textContent = 'Error'; statusSpan.className = 'rv-save-status error'; }
        showToast('Score could not be saved. Please reload the page and try again.', '#ef4444', '#fff');
        return;
      }
    }
    
    try {
      // Update the submission answer
      await db.updateSubmissionAnswer({
        submissionId,
        itemId: resolvedItemId,
        earnedPoints,
        teacherNote,
        rationale: aiRationale,
        aiSuggestedScore,
      });
      
      // Clear cache to force reload
      delete submissionAnswersCache[submissionId];
      
      // Show success
      if (statusSpan) {
        statusSpan.textContent = 'Saved';
        statusSpan.className = 'rv-save-status success';
        setTimeout(() => {
          statusSpan.textContent = '';
        }, 2000);
      }
      
      // Update submission review status to 'in_progress' if it's still 'pending'
      const submission = submissionsData.find(s => s.id === submissionId);
      if (submission && (!submission.review_status || submission.review_status === 'pending')) {
        // Update locally
        submission.review_status = 'in_progress';
        
        // Update in database via service role key (anon key is blocked by RLS)
        try {
          await db.setSubmissionInProgress(submissionId);
        } catch (err) {
          console.warn('[tc-review] Could not update review status:', err);
        }
      }
      
      // Add to expanded set before re-rendering to maintain expanded state
      expandedSubmissions.add(submissionId);
      
      // Re-render to update live summary
      await render();
      
    } catch (err) {
      console.error('[tc-review] Error saving score:', err);
      if (statusSpan) {
        statusSpan.textContent = 'Error';
        statusSpan.className = 'rv-save-status error';
      }
    }
  }

  // Handle finalizing a submission
  async function handleFinalizeSubmission(button) {
    const submissionId = button.dataset.submissionId;
    
    if (!await rcConfirm('Finalize Submission', 'Finalize this submission? This will trigger IEP goal progress updates and mark it as reviewed.', 'Finalize')) {
      return;
    }

    const submission = submissionsData.find(s => s.id === submissionId);
    // assignment_id is NOT on the raw submission — resolve via instance
    const instance = assignmentInstancesData.find(i => i.id === submission?.instance_id);
    const assignmentId = instance?.assignment_id;
    if (!assignmentId) {
      await rcAlert('Error', 'Cannot determine assignment for this submission. Please refresh and try again.');
      return;
    }

    // Bug A fix: ensure real item IDs exist before finalizing (needed for goal progress updates)
    if (assignmentId && syntheticAssignmentIds.has(assignmentId)) {
      try {
        await ensureRealItems(assignmentId);
      } catch (err) {
        console.error('[tc-review] Backfill required before finalize:', err);
        await rcAlert('Error', 'Could not backfill assignment items. Please try again before finalizing.');
        return;
      }
    }
    
    try {
      finalizingInProgress = true;
      // Load fresh data
      const items = await getAssignmentItemsForAssignment(assignmentId);
      const answers = await getSubmissionAnswers(submissionId);
      
      // Calculate manual score — only true writing-prompt items (not keyword-auto-scored fill-in-blank)
      let scoreManual = 0;
      items.filter(item => (item.answer_type === 'constructed' || item.answer_type === 'written_response') && !isAutoScoredItem(item, answers))
        .forEach(item => {
          const answer = answers.find(a => a.item_id === item.id);
          if (answer) {
            scoreManual += Number(answer.earned_points) || 0;
          }
        });
      
      // Get auto score: objective items + keyword-auto-scored fill-in-blank items
      let scoreAuto = 0;
      for (const item of items.filter(i => isAutoScoredItem(i, answers))) {
        const ans = answers.find(a => a.item_id === item.id);
        scoreAuto += (Number(ans?.earned_points) || 0);
      }
      const scoreTotal = computeScorePercentage(scoreAuto, scoreManual, items);
      
      // Finalize submission
      await db.finalizeSubmission(submissionId, {
        scoreAuto,
        scoreManual,
        scoreTotal,
        instanceId: submission.instance_id
      });
      
      // Trigger goal progress updates
      await triggerGoalProgressUpdates(submission, items, answers);

      // Archive submission for DESE compliance (non-fatal)
      try {
        const archiveRes = await fetch(ARCHIVE_SUBMISSION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id: submissionId }),
        });
        const archiveData = await archiveRes.json();
        if (!archiveData.ok) {
          console.warn('[tc-review] Archive returned non-ok:', archiveData);
        } else {
          console.log('[tc-review] Archived submission:', archiveData.archive_id);
        }
      } catch (archiveErr) {
        console.warn('[tc-review] Archive failed (non-fatal):', archiveErr);
      }
      
      // Update local cache
      if (submission) {
        submission.score_auto = scoreAuto;
        submission.score_manual = scoreManual;
        submission.score_total = scoreTotal;
        submission.review_status = 'finalized';
      }
      
      // Remove from submissionsData so it no longer appears on Review page
      submissionsData = submissionsData.filter(s => s.id !== submissionId);
      
      // Clear caches
      delete submissionAnswersCache[submissionId];
      expandedSubmissions.delete(submissionId);
      
      // Show success
      showToast('Submission finalized successfully! Goal progress updated.', 'rgba(34, 197, 94, 0.95)', '#fff');
      
      // Advance to next unreviewed submission
      await advanceToNextSubmission(submissionId);
      
      // Re-render
      await render();
      
    } catch (err) {
      console.error('[tc-review] Error finalizing submission:', err);
      await rcAlert('Error', 'Error finalizing submission. Please try again.');
    } finally {
      finalizingInProgress = false;
    }
  }

  // Trigger goal progress updates for finalized submission
  async function triggerGoalProgressUpdates(submission, items, answers) {
    if (!submission) return;
    const submissionId = submission.id;

    // Always enrich items with goal_codes from assignment_item_mappings so that
    // items fetched via the JS client (which skips the REST enrichment path) also
    // carry accurate goal codes before we compute rollups.
    await enrichItemsFromMappings(items);

    console.log('[tc-review] triggerGoalProgressUpdates:', {
      submissionId,
      itemCount: items.length,
      answerCount: answers.length,
      itemsWithGoalCodes: items.filter(i => (i.goal_codes || []).length > 0).length
    });

    const instance = assignmentInstancesData.find(i => i.id === submission.instance_id);
    if (!instance) return;
    
    const studentCode = instance.student_code;
    const classCode = instance.class_code || null;
    const date = getSchoolLocalDate(
      submission.submitted_at || new Date()
    );

    // Fetch the submitting student's own goal codes so we can filter out codes
    // that belong to other students (avoids 406 errors from upsertGoalProgress).
    let studentGoalCodes = null;
    if (SUPABASE_URL_CACHED && SUPABASE_KEY_CACHED) {
      try {
        const studentRes = await fetch(
          `${SUPABASE_URL_CACHED}/rest/v1/students?code=eq.${encodeURIComponent(studentCode)}&select=id&limit=1`,
          {
            headers: {
              'apikey': SUPABASE_KEY_CACHED,
              'Authorization': `Bearer ${SUPABASE_KEY_CACHED}`,
              'Accept': 'application/json',
            }
          }
        );
        if (studentRes.ok) {
          const studentRows = await studentRes.json();
          if (Array.isArray(studentRows) && studentRows.length > 0) {
            const studentId = studentRows[0].id;
            const goalsRes = await fetch(
              `${SUPABASE_URL_CACHED}/rest/v1/goals?student_id=eq.${studentId}&select=code`,
              {
                headers: {
                  'apikey': SUPABASE_KEY_CACHED,
                  'Authorization': `Bearer ${SUPABASE_KEY_CACHED}`,
                  'Accept': 'application/json',
                }
              }
            );
            if (goalsRes.ok) {
              const goalRows = await goalsRes.json();
              if (Array.isArray(goalRows)) {
                studentGoalCodes = new Set(goalRows.map(g => g.code));
              }
            }
          }
        }
      } catch (err) {
        console.warn('[tc-review] Failed to fetch student goals for filtering:', err);
      }
    }

    if (!studentGoalCodes) {
      console.warn('[tc-review] Could not determine student goal codes for', studentCode,
        '— all goal codes will be attempted (may cause 406 errors for codes belonging to other students).');
    }

    // Build goal rollups by goal_code
    const goalRollups = {};
    
    items.forEach(item => {
      // Only include goal codes that belong to the submitting student
      const goalCodes = (item.goal_codes || []).filter(
        code => !studentGoalCodes || studentGoalCodes.has(code)
      );
      if (goalCodes.length === 0) return;
      
      const answer = answers.find(a => a.item_id === item.id);
      if (!answer) return;
      
      // Skip items that haven't been scored yet (e.g. writing prompts awaiting teacher review).
      // Treating null as 0 would incorrectly record 0% progress for Written Expression goals.
      if (answer.earned_points === null || answer.earned_points === undefined) return;
      
      const earnedPoints = Number(answer.earned_points) || 0;
      const maxPoints = Number(item.points) || 0;
      
      goalCodes.forEach(goalCode => {
        if (!goalRollups[goalCode]) {
          goalRollups[goalCode] = {
            earned: 0,
            max: 0,
            items: []
          };
        }
        
        goalRollups[goalCode].earned += earnedPoints;
        goalRollups[goalCode].max += maxPoints;
        goalRollups[goalCode].items.push({
          item_ref: item.item_ref || item.ref,
          earned: earnedPoints,
          max: maxPoints
        });
      });
    });
    
    // Create goal progress entries
    for (const [goalCode, rollup] of Object.entries(goalRollups)) {
      const rawValue = rollup.max > 0 ? (rollup.earned / rollup.max) * 100 : 0;
      const value = isNaN(rawValue) ? 0 : Math.round(rawValue * 100) / 100;
      
      try {
        await db.upsertGoalProgress({
          goal_code: goalCode,
          student_code: studentCode,
          class_code: classCode,
          date,
          value,
          source: 'assignment',
          collected_by: 'teacher',
          assignment_instance_id: instance.id
        });
        
        console.log('[tc-review] Created goal progress:', { goalCode, studentCode, value });
      } catch (err) {
        console.error('[tc-review] Error creating goal progress:', err);
      }
    }

    console.log('[tc-review] Goal progress update complete:', { goalCodesProcessed: Object.keys(goalRollups).length });
  }

  // Auto-finalize submissions for MCQ-only assignments (no constructed-response items)
  async function autoFinalizeMcqOnlySubmissions() {
    const pendingSubmissions = submissionsData.filter(s => {
      const status = s.review_status || 'pending';
      return status === 'pending' || status === 'in_progress';
    });

    if (pendingSubmissions.length === 0) return;

    let anyFinalized = false;

    for (const submission of pendingSubmissions) {
      const instance = assignmentInstancesData.find(i => i.id === submission.instance_id);
      if (!instance) continue;

      // Skip re-issued retry assignments — teacher must review manually
      if (instance.settings && instance.settings.retry_config &&
          (instance.status === 'Assigned' || instance.status === 'In Progress')) {
        continue;
      }

      const assignmentId = instance.assignment_id;
      if (!assignmentId) continue;
      submission.assignment_id = assignmentId;

      const items = await getAssignmentItemsForAssignment(assignmentId);
      const constructedItems = items.filter(item => item.answer_type === 'constructed' || item.answer_type === 'written_response');

      if (items.length === 0) continue;

      // For assignments with constructed items, only auto-finalize if ALL are keyword-auto-scored
      if (constructedItems.length > 0) {
        const preAnswers = submissionAnswersCache[submission.id] || await getSubmissionAnswers(submission.id);
        if (constructedItems.some(item => !isAutoScoredItem(item, preAnswers))) continue;
      }

      try {
        const answers = await getSubmissionAnswers(submission.id);
        // All items are auto-scored (MCQ or keyword fill-in-blank); scoreManual stays 0
        const scoreAuto = answers.length > 0
          ? items.filter(i => isAutoScoredItem(i, answers))
              .reduce((sum, item) => {
                const ans = answers.find(a => a.item_id === item.id);
                return sum + (Number(ans?.earned_points) || 0);
              }, 0)
          : (Number(submission.score_auto) || 0);
        const scoreTotal = computeScorePercentage(scoreAuto, 0, items);

        await db.finalizeSubmission(submission.id, {
          scoreAuto,
          scoreManual: 0,
          scoreTotal,
          instanceId: submission.instance_id
        });

        await triggerGoalProgressUpdates(submission, items, answers);

        submission.score_auto = scoreAuto;
        submission.score_manual = 0;
        submission.score_total = scoreTotal;
        submission.review_status = 'reviewed';

        delete submissionAnswersCache[submission.id];
        expandedSubmissions.delete(submission.id);

        console.log('[tc-review] Auto-finalized MCQ-only submission:', submission.id);
        anyFinalized = true;
      } catch (err) {
        console.error('[tc-review] Error auto-finalizing submission:', submission.id, err);
      }
    }

    if (anyFinalized) {
      await render();
    }
  }

  // Advance to next unreviewed submission for same assignment (or any assignment)
  async function advanceToNextSubmission(currentSubmissionId) {
    const currentSubmission = submissionsData.find(s => s.id === currentSubmissionId);
    if (!currentSubmission) return;
    
    const currentAssignmentId = currentSubmission.assignment_id;
    
    // Find next unreviewed submission for same assignment
    const queue = buildReviewQueue();
    const unreviewed = queue.filter(s => {
      const status = s.review_status || 'pending';
      return (status === 'pending' || status === 'in_progress') && 
             s.assignment_id === currentAssignmentId &&
             s.id !== currentSubmissionId;
    });
    
    if (unreviewed.length > 0) {
      const next = unreviewed[0];
      expandedSubmissions.clear();
      expandedSubmissions.add(next.id);
      
      // Scroll to the submission
      await render();
      
      setTimeout(() => {
        const element = document.querySelector(`[data-submission-id="${next.id}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }

  // Handle next student button
  async function handleNextStudent(button) {
    const currentSubmissionId = button.dataset.submissionId;
    await advanceToNextSubmission(currentSubmissionId);
  }

  // Populate assignment filter dropdown
  function populateAssignmentFilter() {
    const select = $('rvAssignmentFilter');
    if (!select) return;
    
    // Get unique assignments from submissions
    const assignmentIds = new Set();
    submissionsData.forEach(submission => {
      if (submission.assignment_id) {
        assignmentIds.add(submission.assignment_id);
      }
    });
    
    const options = ['<option value="All Assignments">All Assignments</option>'];
    assignmentIds.forEach(assignmentId => {
      const assignment = assignmentsData.find(a => a.id === assignmentId);
      if (assignment) {
        options.push(`<option value="${assignmentId}">${assignment.title}</option>`);
      }
    });
    
    select.innerHTML = options.join('');
    // Restore saved assignment filter
    if (currentAssignmentFilter !== 'All Assignments') {
      select.value = currentAssignmentFilter;
    }
  }

  // Dynamically populate class filter buttons from shared CANON_CLASSES
  function populateClassFilters() {
    const bar = $('rvClassFilters');
    if (!bar) return;
    const btns = CANON_CLASSES.map(cls => {
      const label = CLASS_DISPLAY[cls] || cls;
      const isActive = currentClassFilter === cls;
      return `<button class="rv-filter-btn${isActive ? ' active' : ''}" data-class="${cls}">${label}</button>`;
    });
    btns.unshift(`<button class="rv-filter-btn${currentClassFilter === 'All Classes' ? ' active' : ''}" data-class="All Classes">All Classes</button>`);
    bar.innerHTML = btns.join('');
    // Restore saved status tab
    ['rvStatusNeedsReview', 'rvStatusReviewed', 'rvStatusAll', 'rvStatusFinalized'].forEach(btnId => {
      const btn = $(btnId);
      if (!btn) return;
      const maps = { rvStatusNeedsReview: 'needs-review', rvStatusReviewed: 'reviewed', rvStatusAll: 'all', rvStatusFinalized: 'finalized' };
      btn.classList.toggle('active', maps[btnId] === currentStatusFilter);
    });
  }

  // Show a brief toast notification
  function showToast(text, bg, color) {
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = `position:fixed;bottom:24px;right:24px;background:${bg};color:${color};padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;`;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2500);
  }

  // Save an overall manual grade (score_manual) computed from per-item scores + feedback
  async function handleSaveGrade(button) {
    const submissionId = button.dataset.submissionId;
    const feedbackInput = document.querySelector(`.rv-grade-feedback-input[data-submission-id="${submissionId}"]`);
    const feedback = feedbackInput ? feedbackInput.value.trim() : '';
    const gradedAt = new Date().toISOString();
    const gradedBy = localStorage.getItem('rc_teacher_name') || '';

    // Compute score_manual from per-item constructed-response answers.
    // Keyword-auto-scored fill-in-blank items (earned_points already set) count toward scoreAuto.
    const submission = submissionsData.find(s => s.id === submissionId);
    if (!submission) return;
    const items = assignmentItemsCache[resolveAssignmentId(submission)] || [];
    const answers = submissionAnswersCache[submissionId] || [];
    const constructedItems = items.filter(item => item.answer_type === 'constructed' || item.answer_type === 'written_response');
    let scoreManual = 0;
    constructedItems.forEach(item => {
      if (isAutoScoredItem(item, answers)) return; // keyword-auto-scored — goes to scoreAuto
      const answer = answers.find(a => a.item_id === item.id);
      if (answer && answer.earned_points != null) {
        scoreManual += Number(answer.earned_points) || 0;
      }
    });

    const scoreAuto = answers.length > 0
      ? items.filter(i => isAutoScoredItem(i, answers)).reduce((sum, item) => {
          const ans = answers.find(a => a.item_id === item.id);
          return sum + (Number(ans?.earned_points) || 0);
        }, 0)
      : (Number(submission.score_auto) || 0);
    const scoreTotal = computeScorePercentage(scoreAuto, scoreManual, items);

    button.disabled = true;
    try {
      await db.upsertSubmission({
        id: submissionId,
        score_auto: scoreAuto,
        score_manual: scoreManual,
        score_total: scoreTotal,
        status: 'Graded',
        graded_at: gradedAt,
        graded_by: gradedBy,
        feedback,
        instance_id: submission.instance_id
      });

      // Update local cache
      if (submission) {
        submission.score_auto = scoreAuto;
        submission.score_manual = scoreManual;
        submission.score_total = scoreTotal;
        submission.review_status = 'reviewed';
        submission.graded_at = gradedAt;
        submission.graded_by = gradedBy;
        submission.feedback = feedback;
      }

      // Trigger goal progress updates when all items have been scored.
      // isAutoScoredItem covers both keyword-auto-scored fill-in-blank and
      // teacher-scored writing prompts (earned_points != null).
      const allConstructedScored = constructedItems.every(item => isAutoScoredItem(item, answers));
      if (allConstructedScored) {
        try {
          await triggerGoalProgressUpdates(submission, items, answers);
        } catch (gpErr) {
          console.warn('[tc-review] Goal progress update failed (non-fatal):', gpErr);
        }
      }

      showToast('Grade saved!', '#22c55e', '#0b1220');
      expandedSubmissions.add(submissionId);
      await render();
    } catch (err) {
      console.error('[tc-review] Error saving grade:', err);
      showToast('Error saving grade', '#ef4444', '#fff');
    } finally {
      button.disabled = false;
    }
  }

  // Return a submission for revision
  async function handleReturnForRevision(button) {
    const submissionId = button.dataset.submissionId;
    const feedbackInput = document.querySelector(`.rv-grade-feedback-input[data-submission-id="${submissionId}"]`);
    const feedback = feedbackInput ? feedbackInput.value.trim() : '';

    if (!await rcConfirm('Return for Revision', 'Return this submission for revision? The student will need to resubmit.', 'Return')) return;

    const submission = submissionsData.find(s => s.id === submissionId);
    if (!submission) return;

    button.disabled = true;
    try {
      const res = await fetch('/.netlify/functions/teacher-review-save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'return_for_revision',
          submissionId,
          instanceId: submission.instance_id,
          gradedBy: localStorage.getItem('rc_teacher_name') || '',
          feedback
        })
      });
      let data = {};
      try { data = await res.json(); } catch (parseErr) { console.warn('[tc-review] Could not parse return_for_revision response:', parseErr); }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to return for revision');
      }

      submission.review_status = 'returned';

      showToast('Returned for revision', '#f59e0b', '#0b1220');
      expandedSubmissions.delete(submissionId);
      await render();
    } catch (err) {
      console.error('[tc-review] Error returning submission:', err);
      showToast('Error returning submission', '#ef4444', '#fff');
    } finally {
      button.disabled = false;
    }
  }

  // Reopen a finalized submission (un-finalize)
  async function handleReopenSubmission(button) {
    const submissionId = button.dataset.submissionId;

    if (!await rcConfirm('Reopen Submission', 'Reopen this finalized submission? It will return to the review queue with status "In Progress".', 'Reopen')) return;

    button.disabled = true;
    try {
      await db.reopenSubmission(submissionId);

      // Update local cache
      const submission = submissionsData.find(s => s.id === submissionId);
      if (submission) {
        submission.review_status = 'pending';
        const instance = assignmentInstancesData.find(i => i.id === submission.instance_id);
        if (instance) instance.status = 'In Progress';
      }

      showToast('Submission reopened', '#22c55e', '#0b1220');
      currentStatusFilter = 'needs-review';
      populateClassFilters();
      saveFilters();
      await render();
    } catch (err) {
      console.error('[tc-review] Error reopening submission:', err);
      showToast('Error reopening submission', '#ef4444', '#fff');
    } finally {
      button.disabled = false;
    }
  }

  // Save filter state to localStorage
  function saveFilters() {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        classFilter: currentClassFilter,
        assignmentFilter: currentAssignmentFilter,
        statusFilter: currentStatusFilter
      }));
    } catch (e) { /* ignore */ }
  }

  // Restore filter state from localStorage
  function restoreFilters() {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || 'null');
      if (!saved) return;
      if (saved.classFilter) currentClassFilter = saved.classFilter;
      if (saved.assignmentFilter) currentAssignmentFilter = saved.assignmentFilter;
      if (saved.statusFilter) currentStatusFilter = saved.statusFilter;
    } catch (e) { /* ignore */ }
  }

  // Initialize
  async function init() {
    console.log('[tc-review] Initializing Review tab');
    
    restoreFilters();
    await loadData();
    await autoFinalizeMcqOnlySubmissions();
    populateClassFilters();
    populateAssignmentFilter();
    setupEventListeners();
  }

  init();
})();
