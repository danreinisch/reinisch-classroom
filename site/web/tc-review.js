(async () => {
  "use strict";

  // Only run on review page
  if (!location.pathname.startsWith("/teacher/review")) return;

  // Import data adapter for Supabase/localStorage abstraction
  const { db, isRemote } = await import('/web/data-adapter.js');
  const { getSupabase } = await import('/web/supabase-client.js');
  const { getAssignmentItems } = await import('/web/assignment-mapping-db.js');

  const NS = "rc_unified_";
  const REALTIME_DEBOUNCE_MS = 1000;

  // NOTE: Keep in sync with CANON_CLASSES in tc-work.js and tc-gradebook.js
  const CANON_CLASSES = [
    "LA 1 SC",
    "LA 2 SC",
    "LA 3 SC",
    "LA 4 SC",
    "Life Skills",
    "Life Skills LA",
  ];

  const $ = (id) => document.getElementById(id);

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

  // Helper to determine score color class based on percentage
  function scoreColorClass(score) {
    if (score == null || isNaN(score)) return "";
    if (score >= 80) return "rv-score-green";
    if (score >= 60) return "rv-score-amber";
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
  let submissionAnswersCache = {}; // Cache answers by submission_id
  let classEnrollmentsData = [];
  let usingSupabase = false;
  let syncStatus = "local";
  let expandedSubmissions = new Set();
  let hasAutoExpanded = false;
  // realtimeChannel will be set in setupRealtime()
  let realtimeChannel = null; // eslint-disable-line no-unused-vars

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
      
      // Load core data
      const [students, assignments, submissions, instances] = await Promise.all([
        db.listStudents(),
        db.listAssignments(),
        db.listSubmissions(),
        db.listAssignmentInstances()
      ]);
      
      studentsData = students || [];
      assignmentsData = assignments || [];
      submissionsData = submissions || [];
      assignmentInstancesData = instances || [];
      
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
      iconEl.textContent = '🟢';
      textEl.textContent = 'Synced';
    } else if (syncStatus === 'local') {
      iconEl.textContent = '🟡';
      textEl.textContent = 'Local';
    } else if (syncStatus === 'error') {
      iconEl.textContent = '🔴';
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

    // Sort by submitted_at (most recent first)
    queue.sort((a, b) => {
      const dateA = new Date(a.submitted_at || 0);
      const dateB = new Date(b.submitted_at || 0);
      return dateB - dateA;
    });

    return queue;
  }

  // Get or fetch assignment items for an assignment
  async function getAssignmentItemsForAssignment(assignmentId) {
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
      
      assignmentItemsCache[assignmentId] = items;
      return items;
    } catch (err) {
      console.error('[tc-review] Error loading assignment items:', err);
      return [];
    }
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

  // Render the UI
  async function render() {
    const queue = buildReviewQueue();
    
    // Count by status
    const needsReviewCount = submissionsData.filter(s => {
      const status = s.review_status || 'pending';
      return status === 'pending' || status === 'in_progress';
    }).length;
    
    const reviewedCount = submissionsData.filter(s => s.review_status === 'reviewed').length;
    
    // Update badge counts
    const needsReviewBtn = $('rvStatusNeedsReview');
    if (needsReviewBtn) {
      needsReviewBtn.innerHTML = `Needs Review <span class="rv-badge">${needsReviewCount}</span>`;
    }
    
    const reviewedBtn = $('rvStatusReviewed');
    if (reviewedBtn) {
      reviewedBtn.innerHTML = `Reviewed <span class="rv-badge">${reviewedCount}</span>`;
    }
    
    const allBtn = $('rvStatusAll');
    if (allBtn) {
      allBtn.innerHTML = `All <span class="rv-badge">${submissionsData.length}</span>`;
    }
    
    // Render queue
    const queueContainer = $('rvQueue');
    if (!queueContainer) return;
    
    if (queue.length === 0) {
      queueContainer.innerHTML = `
        <div class="rv-empty">
          <p>No submissions found matching current filters.</p>
        </div>
      `;
      return;
    }
    
    // Render each submission as accordion item
    const itemsHtml = await Promise.all(queue.map((submission, index) => 
      renderSubmissionRow(submission, index)
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
  async function renderSubmissionRow(submission, _index) {
    const student = submission.student;
    const assignment = submission.assignment;
    const isExpanded = expandedSubmissions.has(submission.id);
    
    // Status badge
    const status = submission.review_status || 'pending';
    let statusBadge = '';
    if (status === 'reviewed') {
      statusBadge = '<span class="rv-status-badge reviewed">✅ Reviewed</span>';
    } else if (status === 'in_progress') {
      statusBadge = '<span class="rv-status-badge in-progress">⏳ In Progress</span>';
    } else {
      statusBadge = '<span class="rv-status-badge pending">⏸️ Pending</span>';
    }
    
    // Header content
    const headerHtml = `
      <div class="rv-submission-header" data-submission-id="${submission.id}">
        <div class="rv-submission-info">
          <span class="rv-student">${student?.name || submission.student_code || 'Unknown'}</span>
          <span class="rv-assignment">${assignment?.title || 'Unknown Assignment'}</span>
          <span class="rv-date">${formatDate(submission.submitted_at)}</span>
          ${statusBadge}
        </div>
        <span class="rv-expand-icon">${isExpanded ? '▼' : '▶'}</span>
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
    const assignmentId = submission.assignment_id;
    const submissionId = submission.id;
    
    // Load items and answers
    const items = await getAssignmentItemsForAssignment(assignmentId);
    const answers = await getSubmissionAnswers(submissionId);
    
    // Separate auto-graded and constructed items
    const autoGradedItems = items.filter(item => 
      item.answer_type === 'mcq' || 
      item.answer_type === 'boolean' || 
      item.answer_type === 'multi'
    );
    
    const constructedItems = items.filter(item => item.answer_type === 'constructed');
    
    // Calculate stats
    let autoCorrect = 0;
    let autoTotal = autoGradedItems.length;
    autoGradedItems.forEach(item => {
      const answer = answers.find(a => a.item_id === item.id);
      if (answer && answer.is_correct) {
        autoCorrect++;
      }
    });
    
    let manualScored = 0;
    let manualTotal = constructedItems.length;
    let manualEarned = 0;
    let manualMax = 0;
    constructedItems.forEach(item => {
      const answer = answers.find(a => a.item_id === item.id);
      manualMax += item.points || 0;
      if (answer && answer.earned_points != null) {
        manualScored++;
        manualEarned += answer.earned_points || 0;
      }
    });
    
    const totalEarned = (submission.score_auto || 0) + manualEarned;
    const totalMax = (autoGradedItems.reduce((sum, i) => sum + (i.points || 0), 0)) + manualMax;
    const totalPercent = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
    
    // Auto-graded section
    let autoSection = '';
    if (autoGradedItems.length > 0) {
      const autoPercent = autoTotal > 0 ? Math.round((autoCorrect / autoTotal) * 100) : 0;
      const autoRows = autoGradedItems.map(item => {
        const answer = answers.find(a => a.item_id === item.id);
        const correctAnswer = item.meta?.correct || item.correct || '—';
        const studentAnswer = answer?.raw_answer || '—';
        const isCorrect = answer?.is_correct;
        
        return `
          <tr>
            <td>${item.item_ref || item.ref}</td>
            <td><span class="rv-type-badge">${item.answer_type}</span></td>
            <td>${typeof studentAnswer === 'object' ? JSON.stringify(studentAnswer) : studentAnswer}</td>
            <td>${typeof correctAnswer === 'object' ? JSON.stringify(correctAnswer) : correctAnswer}</td>
            <td>${isCorrect ? '✅' : '❌'}</td>
            <td>${answer?.earned_points || 0}/${item.points || 0}</td>
          </tr>
        `;
      }).join('');
      
      autoSection = `
        <div class="rv-section">
          <details class="rv-details">
            <summary class="rv-section-header">
              <span>Auto-Graded (${autoGradedItems.length} items)</span>
              <span class="rv-section-status">✅ Complete (${autoCorrect}/${autoTotal} = ${autoPercent}%)</span>
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
      const statusIcon = allScored ? '✅ Scored' : `⏳ Needs Scoring (${manualScored}/${manualTotal})`;
      
      const responseCards = constructedItems.map(item => {
        const answer = answers.find(a => a.item_id === item.id);
        const studentResponse = answer?.raw_answer || '(No response)';
        const currentScore = answer?.earned_points || 0;
        const currentNote = answer?.teacher_note || '';
        const maxPoints = item.points || 5;
        
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
          ${goalCodes.length > 0 ? `<div>IEP Goals: ${goalCodes.join(', ')}</div>` : ''}
          ${deseCodes.length > 0 ? `<div>DESE: ${deseCodes.join(', ')}</div>` : ''}
        `;
        
        return `
          <div class="rv-response-card" data-item-id="${item.id}">
            <div class="rv-response-header">
              ${item.item_ref || item.ref} — "${item.meta?.question || 'Written Response'}"
            </div>
            
            <div class="rv-student-response">
              <strong>Student Response:</strong>
              <div class="rv-response-text">${typeof studentResponse === 'object' ? JSON.stringify(studentResponse, null, 2) : studentResponse}</div>
            </div>
            
            ${codesHtml}
            <div>Max Points: ${maxPoints}</div>
            
            <details class="rv-rubric-details">
              <summary>📏 Scoring Guide</summary>
              <div class="rv-rubric">
                ${rubricHtml}
              </div>
            </details>
            
            <div class="rv-scoring-controls">
              <div class="rv-score-input-group">
                <label>Score:</label>
                <input type="number" 
                       class="rv-score-input" 
                       min="0" 
                       max="${maxPoints}" 
                       value="${currentScore}"
                       data-item-id="${item.id}"
                       data-submission-id="${submission.id}">
                <span>/ ${maxPoints}</span>
              </div>
              
              <div class="rv-note-input-group">
                <label>Teacher Note (optional):</label>
                <textarea class="rv-note-input" 
                          rows="2" 
                          placeholder="Optional feedback for student..."
                          data-item-id="${item.id}"
                          data-submission-id="${submission.id}">${currentNote}</textarea>
              </div>
              
              <button class="rv-btn rv-btn-save" 
                      data-item-id="${item.id}"
                      data-submission-id="${submission.id}">
                💾 Save
              </button>
              <span class="rv-save-status" data-item-id="${item.id}"></span>
            </div>
          </div>
        `;
      }).join('');
      
      writtenSection = `
        <div class="rv-section">
          <div class="rv-section-header">
            <span>Written Responses (${constructedItems.length} items)</span>
            <span class="rv-section-status">${statusIcon}</span>
          </div>
          <div class="rv-responses">
            ${responseCards}
          </div>
        </div>
      `;
    }
    
    // Summary section
    const autoEarned = submission.score_auto || 0;
    const autoMax = autoGradedItems.reduce((sum, i) => sum + (i.points || 0), 0);
    const autoPercentStr = autoMax > 0 ? `(${Math.round((autoEarned / autoMax) * 100)}%)` : '';
    const manualPercentStr = manualMax > 0 ? `(${Math.round((manualEarned / manualMax) * 100)}%)` : '';
    
    const summarySection = `
      <div class="rv-summary">
        <div class="rv-summary-row">
          <span>Auto:</span>
          <span>${autoEarned}/${autoMax} ${autoPercentStr}</span>
        </div>
        <div class="rv-summary-row">
          <span>Manual:</span>
          <span>${manualEarned}/${manualMax} ${manualPercentStr} (${manualScored}/${manualTotal} scored)</span>
        </div>
        <div class="rv-summary-row rv-summary-total">
          <span>Total:</span>
          <span class="${scoreColorClass(totalPercent)}">${totalEarned}/${totalMax} (${totalPercent}%)</span>
        </div>
      </div>
    `;
    
    // Action buttons
    const allConstructedScored = manualScored === manualTotal;
    const finalizeDisabled = constructedItems.length > 0 && !allConstructedScored;
    
    const actionsSection = `
      <div class="rv-actions">
        <button class="rv-btn rv-btn-primary rv-btn-finalize" 
                data-submission-id="${submission.id}"
                ${finalizeDisabled ? 'disabled' : ''}>
          ✅ Finalize Submission
        </button>
        <button class="rv-btn rv-btn-next" 
                data-submission-id="${submission.id}">
          ⏭ Next Student
        </button>
        ${finalizeDisabled ? '<span class="rv-hint">Score all written responses to finalize</span>' : ''}
      </div>
    `;
    
    return `
      ${autoSection}
      ${writtenSection}
      ${summarySection}
      ${actionsSection}
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
          
          render();
        }
      });
    }
    
    // Assignment filter dropdown
    const assignmentFilter = $('rvAssignmentFilter');
    if (assignmentFilter) {
      assignmentFilter.addEventListener('change', (e) => {
        currentAssignmentFilter = e.target.value;
        render();
      });
    }
    
    // Status filter tabs
    ['rvStatusNeedsReview', 'rvStatusReviewed', 'rvStatusAll'].forEach(id => {
      const btn = $(id);
      if (btn) {
        btn.addEventListener('click', () => {
          // Update current filter
          if (id === 'rvStatusNeedsReview') currentStatusFilter = 'needs-review';
          else if (id === 'rvStatusReviewed') currentStatusFilter = 'reviewed';
          else currentStatusFilter = 'all';
          
          // Update active state
          ['rvStatusNeedsReview', 'rvStatusReviewed', 'rvStatusAll'].forEach(btnId => {
            const button = $(btnId);
            if (button) {
              if (btnId === id) {
                button.classList.add('active');
              } else {
                button.classList.remove('active');
              }
            }
          });
          
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
          }
          await render();
          return;
        }
        
        // Handle save button click
        const saveBtn = e.target.closest('.rv-btn-save');
        if (saveBtn) {
          await handleSaveScore(saveBtn);
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
    
    try {
      // Update the submission answer
      await db.updateSubmissionAnswer({
        submissionId,
        itemId,
        earnedPoints,
        teacherNote
      });
      
      // Clear cache to force reload
      delete submissionAnswersCache[submissionId];
      
      // Show success
      if (statusSpan) {
        statusSpan.textContent = '✓ Saved';
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
        
        // Update in database if using Supabase
        if (usingSupabase) {
          try {
            const supabase = await getSupabase();
            await supabase
              .from('submissions')
              .update({ review_status: 'in_progress' })
              .eq('id', submissionId);
          } catch (err) {
            console.warn('[tc-review] Could not update review status:', err);
          }
        }
      }
      
      // Re-render to update live summary
      await render();
      
      // Re-expand the submission to maintain state
      expandedSubmissions.add(submissionId);
      await render();
      
    } catch (err) {
      console.error('[tc-review] Error saving score:', err);
      if (statusSpan) {
        statusSpan.textContent = '✗ Error';
        statusSpan.className = 'rv-save-status error';
      }
    }
  }

  // Handle finalizing a submission
  async function handleFinalizeSubmission(button) {
    const submissionId = button.dataset.submissionId;
    
    if (!confirm('Finalize this submission? This will trigger IEP goal progress updates and mark it as reviewed.')) {
      return;
    }
    
    try {
      // Load fresh data
      const items = await getAssignmentItemsForAssignment(
        submissionsData.find(s => s.id === submissionId)?.assignment_id
      );
      const answers = await getSubmissionAnswers(submissionId);
      
      // Calculate manual score
      const constructedItems = items.filter(item => item.answer_type === 'constructed');
      let scoreManual = 0;
      constructedItems.forEach(item => {
        const answer = answers.find(a => a.item_id === item.id);
        if (answer) {
          scoreManual += answer.earned_points || 0;
        }
      });
      
      // Get auto score
      const submission = submissionsData.find(s => s.id === submissionId);
      const scoreAuto = submission?.score_auto || 0;
      const scoreTotal = scoreAuto + scoreManual;
      
      // Finalize submission
      await db.finalizeSubmission(submissionId, {
        scoreManual,
        scoreTotal
      });
      
      // Trigger goal progress updates
      await triggerGoalProgressUpdates(submissionId, items, answers);
      
      // Update local cache
      if (submission) {
        submission.score_manual = scoreManual;
        submission.score_total = scoreTotal;
        submission.review_status = 'reviewed';
      }
      
      // Clear caches
      delete submissionAnswersCache[submissionId];
      expandedSubmissions.delete(submissionId);
      
      // Show success
      alert('Submission finalized successfully! Goal progress updated.');
      
      // Advance to next unreviewed submission
      await advanceToNextSubmission(submissionId);
      
      // Re-render
      await render();
      
    } catch (err) {
      console.error('[tc-review] Error finalizing submission:', err);
      alert('Error finalizing submission. Please try again.');
    }
  }

  // Trigger goal progress updates for finalized submission
  async function triggerGoalProgressUpdates(submissionId, items, answers) {
    const submission = submissionsData.find(s => s.id === submissionId);
    if (!submission) return;
    
    const instance = assignmentInstancesData.find(i => i.id === submission.instance_id);
    if (!instance) return;
    
    const studentCode = instance.student_code;
    const classCode = instance.class_code || null;
    const date = submission.submitted_at ? submission.submitted_at.split('T')[0] : new Date().toISOString().split('T')[0];
    
    // Build goal rollups by goal_code
    const goalRollups = {};
    
    items.forEach(item => {
      const goalCodes = item.goal_codes || [];
      if (goalCodes.length === 0) return;
      
      const answer = answers.find(a => a.item_id === item.id);
      if (!answer) return;
      
      const earnedPoints = answer.earned_points || 0;
      const maxPoints = item.points || 0;
      
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
      const value = rollup.max > 0 ? (rollup.earned / rollup.max) * 100 : 0;
      
      try {
        await db.upsertGoalProgress({
          goal_code: goalCode,
          student_code: studentCode,
          class_code: classCode,
          date,
          value,
          source: 'assignment',
          collected_by: 'teacher'
        });
        
        console.log('[tc-review] Created goal progress:', { goalCode, studentCode, value });
      } catch (err) {
        console.error('[tc-review] Error creating goal progress:', err);
      }
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
  }

  // Initialize
  async function init() {
    console.log('[tc-review] Initializing Review tab');
    
    await loadData();
    populateAssignmentFilter();
    setupEventListeners();
  }

  init();
})();
