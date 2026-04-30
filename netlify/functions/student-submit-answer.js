// Student submit answer endpoint
// POST /.netlify/functions/student-submit-answer
// Auth: Requires valid student code (from query param or body)
// Body: { instance_id, answers, writing_response }
// Returns: { ok: true }

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { getSupabaseConfig } = require('./_lib/supa');

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();

function getCurrentSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Normalize a monetary answer string for comparison.
 * Strips a leading '$', trims whitespace, parses as float.
 * Returns null if not a valid number.
 */
function normalizeMonetaryAnswer(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(/^\$/, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-submit-answer] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'POST') {
    console.log(`[student-submit-answer] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Validate Content-Type
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json')) {
    console.log(`[student-submit-answer] [${requestId}] Invalid Content-Type: ${contentType}`);
    return jsonResponse(event, 400, { ok: false, error: 'Content-Type must be application/json' }, {}, requestId);
  }

  // Validate body size (allow up to 50KB for answers)
  const bodySizeCheck = validateBodySize(event.body, 50);
  if (!bodySizeCheck.valid) {
    console.log(`[student-submit-answer] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[student-submit-answer] [${requestId}] Supabase not configured`);
    return jsonResponse(
      event, 
      503, 
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Parse JSON safely
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[student-submit-answer] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { instance_id, answers, writing_response, student_code, submit } = parseResult.data;

  // Validate instance_id
  if (!instance_id || typeof instance_id !== 'string') {
    console.log(`[student-submit-answer] [${requestId}] Missing or invalid instance_id`);
    return jsonResponse(event, 400, { ok: false, error: 'instance_id is required and must be a string' }, {}, requestId);
  }

  // Get student_code from query param or body
  const queryParams = event.queryStringParameters || {};
  const code = student_code || queryParams.student_code || queryParams.code;

  if (!code || typeof code !== 'string') {
    console.log(`[student-submit-answer] [${requestId}] Missing student_code`);
    return jsonResponse(event, 400, { ok: false, error: 'student_code is required' }, {}, requestId);
  }

  console.log(`[student-submit-answer] [${requestId}] Submitting answers for instance ${instance_id}, student code: ${code}`);

  try {
    // Step 1: Verify student exists and get student ID
    const studentUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code&code=eq.${encodeURIComponent(code)}`;
    
    const studentResponse = await fetch(studentUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!studentResponse.ok) {
      console.error(`[student-submit-answer] [${requestId}] Student lookup failed with status: ${studentResponse.status}`);
      return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
    }

    const students = await studentResponse.json();
    if (!students || students.length === 0) {
      console.log(`[student-submit-answer] [${requestId}] Student not found for code: ${code}`);
      return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
    }

    const student = students[0];

    // Step 2: Verify assignment instance exists and belongs to this student
    const instanceUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,student_id,assignment_id,settings,status,resubmission_count&id=eq.${encodeURIComponent(instance_id)}`;
    
    const instanceResponse = await fetch(instanceUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!instanceResponse.ok) {
      console.error(`[student-submit-answer] [${requestId}] Instance lookup failed with status: ${instanceResponse.status}`);
      return jsonResponse(event, 404, { ok: false, error: 'Assignment not found' }, {}, requestId);
    }

    const instances = await instanceResponse.json();
    if (!instances || instances.length === 0) {
      console.log(`[student-submit-answer] [${requestId}] Instance not found: ${instance_id}`);
      return jsonResponse(event, 404, { ok: false, error: 'Assignment not found' }, {}, requestId);
    }

    const instance = instances[0];

    // Verify instance belongs to this student
    if (instance.student_id !== student.id) {
      console.log(`[student-submit-answer] [${requestId}] Instance does not belong to student`);
      return jsonResponse(event, 403, { ok: false, error: 'Forbidden' }, {}, requestId);
    }

    // Step 3: Build updated settings object
    const currentSettings = instance.settings || {};
    const updatedSettings = {
      ...currentSettings,
      answers: (answers && Object.keys(answers).length > 0) ? answers : (currentSettings.answers || {}),
      writing_response: writing_response || currentSettings.writing_response || ''
    };
    // Only record submitted_at when this is an intentional submission (submit === true)
    if (submit === true) {
      updatedSettings.submitted_at = new Date().toISOString();
    }

    // Step 4: Determine new status
    // Only mark as "Submitted" when the client explicitly sends submit: true.
    // Auto-saves (submit !== true) always keep the assignment "In Progress",
    // but never downgrade an already-submitted assignment.
    const newStatus = (submit === true || instance.status === 'Submitted') ? 'Submitted' : 'In Progress';

    // Step 5: Update assignment instance
    const updateUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?id=eq.${encodeURIComponent(instance_id)}`;
    
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        settings: updatedSettings,
        status: newStatus
      })
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[student-submit-answer] [${requestId}] Update failed: ${updateResponse.status} - ${errorText}`);
      return jsonResponse(event, 500, { ok: false, error: 'Failed to save answers' }, {}, requestId);
    }

    console.log(`[student-submit-answer] [${requestId}] Successfully saved answers for instance ${instance_id}`);
    
    // Step 6: Upsert submission record if status is "Submitted"
    let submissionId = null;
    let responseScoreTotal = null;
    let responseScoringResults = [];
    if (newStatus === 'Submitted') {
      console.log(`[student-submit-answer] [${requestId}] Upserting submission record`);

      // Check if a submission already exists for this instance
      const checkSubUrl = `${SUPABASE_URL}/rest/v1/submissions?instance_id=eq.${encodeURIComponent(instance_id)}&select=id&limit=1`;
      const checkSubResponse = await fetch(checkSubUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const existingSubs = checkSubResponse.ok ? await checkSubResponse.json() : [];
      const existingSubmission = existingSubs && existingSubs[0];

      // Detect whether this is a revision-mode re-submission (teacher used "Return for Revision").
      // When true, we must also reset review_status to 'pending' and increment resubmission_count
      // so the teacher sees the re-submission in their review queue.
      const isRevisionResubmission = !!(
        existingSubmission &&
        instance.settings &&
        instance.settings.retry_config &&
        instance.settings.retry_config.revision_mode === true
      );

      if (existingSubmission) {
        // Update existing submission instead of creating a duplicate
        const updateSubUrl = `${SUPABASE_URL}/rest/v1/submissions?id=eq.${encodeURIComponent(existingSubmission.id)}`;
        const subPatchBody = {
          answers: updatedSettings.answers || answers || {},
          submitted_at: new Date().toISOString()
        };
        // On revision-mode re-submission, reset review_status to 'pending' so the teacher is
        // prompted to re-review the updated answers. The original status was 'returned' (set by
        // "Return for Revision"); after the student re-submits we move it back to the normal
        // pending/auto-finalize queue.
        if (isRevisionResubmission) {
          subPatchBody.review_status = 'pending';
        }
        const updateSubResponse = await fetch(updateSubUrl, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(subPatchBody)
        });

        if (!updateSubResponse.ok) {
          const errorText = await updateSubResponse.text();
          console.error(`[student-submit-answer] [${requestId}] Submission update failed: ${updateSubResponse.status} - ${errorText}`);
        } else {
          submissionId = existingSubmission.id;
          console.log(`[student-submit-answer] [${requestId}] Submission updated with ID: ${submissionId}${isRevisionResubmission ? ' [revision re-submission]' : ''}`);

          // Increment resubmission_count on the instance for revision-mode re-submissions.
          if (isRevisionResubmission) {
            const rcPatchUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?id=eq.${encodeURIComponent(instance_id)}`;
            const rcPatch = await fetch(rcPatchUrl, {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({ resubmission_count: (instance.resubmission_count || 0) + 1 })
            });
            if (!rcPatch.ok) {
              const errText = await rcPatch.text();
              console.warn(`[student-submit-answer] [${requestId}] resubmission_count increment failed (non-fatal): ${rcPatch.status} - ${errText}`);
            } else {
              console.log(`[student-submit-answer] [${requestId}] Incremented resubmission_count to ${(instance.resubmission_count || 0) + 1}`);
            }
          }
        }
      } else {
        // Create new submission
        const submissionUrl = `${SUPABASE_URL}/rest/v1/submissions`;
        const submissionResponse = await fetch(submissionUrl, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            instance_id: instance_id,
            answers: updatedSettings.answers || answers || {},
            submitted_at: new Date().toISOString(),
            school_year: getCurrentSchoolYear()
          })
        });

        if (!submissionResponse.ok) {
          const errorText = await submissionResponse.text();
          console.error(`[student-submit-answer] [${requestId}] Submission insert failed: ${submissionResponse.status} - ${errorText}`);
          console.error(`[student-submit-answer] [${requestId}] WARNING: Assignment status is 'Submitted' but no submission record created for instance ${instance_id}`);
          // Don't fail the whole request - the answers are already saved in the instance
        } else {
          const submissionData = await submissionResponse.json();
          submissionId = submissionData && submissionData[0] ? submissionData[0].id : null;
          console.log(`[student-submit-answer] [${requestId}] Submission created with ID: ${submissionId}`);
        }
      }

      // Step 7: Create/upsert submission_answers linked to assignment_items with auto-scoring
      // Merge prior MCQ answers (already stored in instance.settings) with any newly-received
      // answers so that all answers are preserved even when the final call only sends
      // writing_response without re-sending the full answers map.
      const priorAnswers = (instance.settings && instance.settings.answers) || {};
      const incomingAnswers = answers || {};
      const cumulativeAnswers = { ...priorAnswers, ...incomingAnswers };
      const hasAnswers = Object.keys(cumulativeAnswers).length > 0;
      const hasWriting = writing_response && typeof writing_response === 'string' && writing_response.trim().length > 0;
      if (submissionId && instance.assignment_id) {
        const itemsUrl = `${SUPABASE_URL}/rest/v1/assignment_items?assignment_id=eq.${encodeURIComponent(instance.assignment_id)}&select=id,item_ref,answer_type,points,meta,goal_codes`;
        const itemsResponse = await fetch(itemsUrl, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (itemsResponse.ok) {
          const items = await itemsResponse.json();
          if (items && items.length > 0) {
            // Enrich items with goal_codes from assignment_item_mappings.
            // Since PR #703 the authoritative goal_codes live in assignment_item_mappings;
            // the assignment_items.goal_codes column is often [] or null for newer assignments.
            try {
              const itemIds = items.map(i => i.id).filter(id => id != null).join(',');
              if (itemIds) {
                const mappingsUrl = `${SUPABASE_URL}/rest/v1/assignment_item_mappings?item_id=in.(${itemIds})&select=item_id,goal_codes,dese_codes`;
                const mappingsResponse = await fetch(mappingsUrl, {
                  method: 'GET',
                  headers: {
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json'
                  }
                });
                if (mappingsResponse.ok) {
                  const mappings = await mappingsResponse.json();
                  if (Array.isArray(mappings)) {
                    const mappingsByItemId = {};
                    mappings.forEach(m => { mappingsByItemId[m.item_id] = m; });
                    items.forEach(item => {
                      const mapping = mappingsByItemId[item.id];
                      if (mapping) {
                        // assignment_item_mappings is the authoritative source for goal_codes
                        // and dese_codes since PR #703. Always prefer mappings when a row exists,
                        // even if assignment_items.goal_codes has a non-empty (but possibly stale) value.
                        if (Array.isArray(mapping.goal_codes) && mapping.goal_codes.length > 0) {
                          item.goal_codes = mapping.goal_codes;
                        }
                        if (Array.isArray(mapping.dese_codes) && mapping.dese_codes.length > 0) {
                          item.dese_codes = mapping.dese_codes;
                        }
                      }
                    });
                  }
                } else {
                  console.warn(`[student-submit-answer] [${requestId}] assignment_item_mappings lookup failed: ${mappingsResponse.status}`);
                }
              }
            } catch (mappingsErr) {
              console.warn(`[student-submit-answer] [${requestId}] Failed to enrich items with mappings (non-fatal):`, mappingsErr);
            }

            // Build item_ref lookup map
            const itemMap = {};
            for (const item of items) {
              itemMap[item.item_ref] = item;
            }

            // Build submission_answers rows for each answered question
            const subAnswers = [];
            if (hasAnswers) {
              for (const [itemRef, studentAnswer] of Object.entries(cumulativeAnswers)) {
                const item = itemMap[itemRef];
                if (!item) continue;

                let isCorrect = null;
                let earnedPoints = null;
                let maxPoints = null;

                if (['mcq', 'boolean', 'multi'].includes(item.answer_type) && item.meta && item.meta.correct) {
                  isCorrect = String(studentAnswer).trim().toUpperCase() === String(item.meta.correct).trim().toUpperCase();
                  maxPoints = item.points != null ? Number(item.points) : 1;
                  earnedPoints = isCorrect ? maxPoints : 0;
                } else if (item.answer_type === 'constructed') {
                  // Attempt keyword-based auto-scoring for constructed items
                  const scoringKeywords = (item.meta && item.meta.scoring && Array.isArray(item.meta.scoring.keywords) && item.meta.scoring.keywords.length > 0)
                    ? item.meta.scoring.keywords
                    : (item.meta && Array.isArray(item.meta.correct) ? item.meta.correct : null);
                  if (scoringKeywords && scoringKeywords.length > 0) {
                    const minKeywords = (item.meta && item.meta.scoring && item.meta.scoring.min_keywords != null)
                      ? Number(item.meta.scoring.min_keywords)
                      : 1;
                    const caseSensitive = item.meta && item.meta.scoring && item.meta.scoring.case_sensitive === true;
                    const answerText = caseSensitive ? String(studentAnswer) : String(studentAnswer).toLowerCase();
                    let foundCount = 0;
                    for (const kw of scoringKeywords) {
                      const kwText = caseSensitive ? String(kw) : String(kw).toLowerCase();
                      if (answerText.includes(kwText)) foundCount++;
                    }
                    const ratio = scoringKeywords.length > 0 ? Math.min(1, foundCount / scoringKeywords.length) : 0;
                    isCorrect = foundCount >= minKeywords;
                    maxPoints = item.points != null ? Number(item.points) : 1;
                    earnedPoints = Math.round(maxPoints * ratio * 100) / 100;
                  } else if (item.meta && typeof item.meta.correct === 'string') {
                    // Exact-match scoring for constructed items with a simple string correct answer
                    // (e.g. Counting Money: "1.00"). Supports monetary normalization so that
                    // "$1.00", "1", and "1.00" all match "1.00".
                    const correctVal = normalizeMonetaryAnswer(item.meta.correct);
                    const studentVal = normalizeMonetaryAnswer(studentAnswer);
                    maxPoints = item.points != null ? Number(item.points) : 1;
                    if (correctVal !== null && studentVal !== null) {
                      // Tolerance of 0.001 (one tenth of a cent) avoids floating-point
                      // precision issues when comparing parsed monetary values (e.g. 1.0 vs 1.00).
                      isCorrect = Math.abs(correctVal - studentVal) < 0.001;
                    } else {
                      // Fall back to case-insensitive string comparison
                      isCorrect = String(studentAnswer).trim().toLowerCase() === String(item.meta.correct).trim().toLowerCase();
                    }
                    earnedPoints = isCorrect ? maxPoints : 0;
                  }
                }

                // On revision-mode re-submissions, skip non-auto-scoreable constructed items
                // from the MCQ answers loop. These items landed in cumulativeAnswers because
                // "Return for Revision" pre-populates instance.settings.answers with the
                // student's original answers (including any written response). Upserting them
                // here with earned_points=null would silently clear any teacher manual grade.
                // The hasWriting block below handles them only when the student provides a new
                // writing_response.
                if (isRevisionResubmission && item.answer_type === 'constructed' && earnedPoints === null && isCorrect === null) {
                  continue;
                }

                subAnswers.push({
                  submission_id: submissionId,
                  assignment_item_id: item.id,
                  raw_answer: { value: studentAnswer },
                  is_correct: isCorrect,
                  earned_points: earnedPoints,
                  max_points: maxPoints,
                  scored_at: new Date().toISOString()
                });

                // Track per-item result for the response (auto-scored items only)
                if (isCorrect !== null) {
                  responseScoringResults.push({ item_ref: itemRef, is_correct: isCorrect });
                }
              }
            }

            // Pass 2: For fill-in-blank constructed items (primitive meta.correct), write a
            // 0-scored row for any item not yet in subAnswers so blank inputs are treated as
            // auto-scored wrong rather than falling into the manual "Written Responses" bucket.
            // Guard: skip during revision-mode re-submissions to avoid overwriting teacher grades.
            if (!isRevisionResubmission) {
              for (const item of items) {
                if (item.answer_type !== 'constructed') continue;
                // Only handle fill-in-blank: primitive meta.correct (string/number/boolean)
                const correctMeta = item.meta && item.meta.correct;
                if (correctMeta == null) continue; // true writing prompt — leave for teacher
                if (Array.isArray(correctMeta)) continue; // keyword list — handled by keyword scorer
                // Skip keyword-scored items (meta.scoring.keywords array)
                const hasKeywords = item.meta && item.meta.scoring && Array.isArray(item.meta.scoring.keywords) && item.meta.scoring.keywords.length > 0;
                if (hasKeywords) continue;
                // Skip if student answered this item (already in subAnswers)
                const alreadyQueued = subAnswers.some(a => a.assignment_item_id === item.id);
                if (alreadyQueued) continue;
                // Write a 0-scored row for this blank fill-in-blank item
                const maxPoints = item.points != null ? Number(item.points) : 1;
                subAnswers.push({
                  submission_id: submissionId,
                  assignment_item_id: item.id,
                  raw_answer: { value: '' },
                  is_correct: false,
                  earned_points: 0,
                  max_points: maxPoints,
                  scored_at: new Date().toISOString()
                });
              }
            }

            // Add writing response as a constructed submission_answer
            if (hasWriting) {
              const constructedItem = items.find(i => i.answer_type === 'constructed');
              if (constructedItem) {
                const maxPts = constructedItem.points != null ? Number(constructedItem.points) : 5;
                let writingIsCorrect = null;
                let writingEarned = null;
                let writingScored = null;

                // Attempt keyword-based auto-scoring if keywords are configured
                const writingKeywords = (constructedItem.meta && constructedItem.meta.scoring && Array.isArray(constructedItem.meta.scoring.keywords) && constructedItem.meta.scoring.keywords.length > 0)
                  ? constructedItem.meta.scoring.keywords
                  : (constructedItem.meta && Array.isArray(constructedItem.meta.correct) ? constructedItem.meta.correct : null);
                if (writingKeywords && writingKeywords.length > 0) {
                  const writingMin = (constructedItem.meta && constructedItem.meta.scoring && constructedItem.meta.scoring.min_keywords != null)
                    ? Number(constructedItem.meta.scoring.min_keywords)
                    : 1;
                  const writingCaseSensitive = constructedItem.meta && constructedItem.meta.scoring && constructedItem.meta.scoring.case_sensitive === true;
                  const writingText = writingCaseSensitive ? String(writing_response) : String(writing_response).toLowerCase();
                  let writingFound = 0;
                  for (const kw of writingKeywords) {
                    const kwText = writingCaseSensitive ? String(kw) : String(kw).toLowerCase();
                    if (writingText.includes(kwText)) writingFound++;
                  }
                  const writingRatio = writingKeywords.length > 0 ? Math.min(1, writingFound / writingKeywords.length) : 0;
                  writingIsCorrect = writingFound >= writingMin;
                  writingEarned = Math.round(maxPts * writingRatio * 100) / 100;
                  writingScored = new Date().toISOString();
                }

                subAnswers.push({
                  submission_id: submissionId,
                  assignment_item_id: constructedItem.id,
                  raw_answer: { value: writing_response },
                  is_correct: writingIsCorrect,
                  earned_points: writingEarned,
                  max_points: maxPts,
                  scored_at: writingScored
                });
                console.log(`[student-submit-answer] [${requestId}] Added writing response submission_answer for item ${constructedItem.item_ref}`);
              } else {
                console.warn(`[student-submit-answer] [${requestId}] No constructed assignment_item found for assignment ${instance.assignment_id}; writing_response not linked to submission_answer`);
              }
            }

            if (subAnswers.length > 0) {
              const subAnswersUrl = `${SUPABASE_URL}/rest/v1/submission_answers?on_conflict=submission_id,assignment_item_id`;
              const subAnswersResponse = await fetch(subAnswersUrl, {
                method: 'POST',
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'resolution=merge-duplicates,return=minimal'
                },
                body: JSON.stringify(subAnswers)
              });

              if (!subAnswersResponse.ok) {
                const errorText = await subAnswersResponse.text();
                console.error(`[student-submit-answer] [${requestId}] submission_answers upsert failed: ${subAnswersResponse.status} - ${errorText}`);
              } else {
                console.log(`[student-submit-answer] [${requestId}] Upserted ${subAnswers.length} submission_answers`);

                // Compute score_auto from auto-scored answers and update the parent submission
                const autoScoredAnswers = subAnswers.filter(a => a.earned_points != null);
                const scoreAuto = autoScoredAnswers.reduce((sum, a) => sum + (a.earned_points || 0), 0);
                const maxPointsTotal = autoScoredAnswers.reduce((sum, a) => sum + (a.max_points || 0), 0);
                const scoreTotal = maxPointsTotal > 0 ? Math.round((scoreAuto / maxPointsTotal) * 100) : null;
                responseScoreTotal = scoreTotal;
                const submissionsUpdateUrl = `${SUPABASE_URL}/rest/v1/submissions?id=eq.${encodeURIComponent(submissionId)}`;
                const scoreAutoResponse = await fetch(submissionsUpdateUrl, {
                  method: 'PATCH',
                  headers: {
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                  },
                  body: JSON.stringify({ score_auto: scoreAuto, score_total: scoreTotal })
                });
                if (!scoreAutoResponse.ok) {
                  const errText = await scoreAutoResponse.text();
                  console.error(`[student-submit-answer] [${requestId}] score_auto update failed: ${scoreAutoResponse.status} - ${errText}`);
                } else {
                  console.log(`[student-submit-answer] [${requestId}] Updated score_auto=${scoreAuto} score_total=${scoreTotal} for submission ${submissionId}`);

                  // Step 8: Auto-upsert goal_progress if all items are auto-scoreable
                  // Skip only if there are constructed items that are NOT auto-scoreable (no keywords)
                  try {
                    const hasUnscoredConstructed = items.some(i => {
                      if (i.answer_type !== 'constructed') return false;
                      const hasKeywords = (i.meta && i.meta.scoring && Array.isArray(i.meta.scoring.keywords) && i.meta.scoring.keywords.length > 0)
                        || (i.meta && Array.isArray(i.meta.correct));
                      const hasExactMatch = i.meta && typeof i.meta.correct === 'string';
                      return !hasKeywords && !hasExactMatch;
                    });

                    if (hasUnscoredConstructed) {
                      console.log(`[student-submit-answer] [${requestId}] Skipping auto goal progress — assignment has constructed items requiring teacher review`);
                    } else {
                      // Build goal rollups from items with goal_codes
                      const goalRollups = {};

                      for (const item of items) {
                        const goalCodes = Array.isArray(item.goal_codes) ? item.goal_codes : [];
                        if (goalCodes.length === 0) continue;

                        const subAnswer = subAnswers.find(sa => sa.assignment_item_id === item.id);
                        if (!subAnswer || subAnswer.earned_points == null) continue;

                        const earned = Number(subAnswer.earned_points) || 0;
                        const max = Number(subAnswer.max_points) || Number(item.points) || 0;

                        for (const goalCode of goalCodes) {
                          if (!goalRollups[goalCode]) {
                            goalRollups[goalCode] = { earned: 0, max: 0 };
                          }
                          goalRollups[goalCode].earned += earned;
                          goalRollups[goalCode].max += max;
                        }
                      }

                      const uniqueGoalCodes = Object.keys(goalRollups);
                      if (uniqueGoalCodes.length > 0) {
                        console.log(`[student-submit-answer] [${requestId}] Auto-upserting goal progress for ${uniqueGoalCodes.length} goal(s)`);

                        const today = new Date().toISOString().split('T')[0];
                        const schoolYear = getCurrentSchoolYear();

                        // Look up goal IDs for all unique goal codes in one query
                        const goalCodesParam = uniqueGoalCodes.map(c => encodeURIComponent(c)).join(',');
                        const goalsUrl = `${SUPABASE_URL}/rest/v1/goals?student_id=eq.${encodeURIComponent(student.id)}&code=in.(${goalCodesParam})&select=id,code`;
                        let goalIdMap = {};
                        try {
                          const goalsRes = await fetch(goalsUrl, {
                            method: 'GET',
                            headers: {
                              'apikey': SUPABASE_SERVICE_ROLE_KEY,
                              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                              'Content-Type': 'application/json'
                            }
                          });
                          if (goalsRes.ok) {
                            const goalRows = await goalsRes.json();
                            if (Array.isArray(goalRows)) {
                              for (const g of goalRows) {
                                goalIdMap[g.code] = g.id;
                              }
                            }
                          } else {
                            console.warn(`[student-submit-answer] [${requestId}] goals lookup failed: ${goalsRes.status}`);
                          }
                        } catch (goalsErr) {
                          console.warn(`[student-submit-answer] [${requestId}] goals lookup error:`, goalsErr);
                        }

                        for (const [goalCode, rollup] of Object.entries(goalRollups)) {
                          const goalId = goalIdMap[goalCode];
                          if (!goalId) {
                            console.warn(`[student-submit-answer] [${requestId}] Goal "${goalCode}" not found for student — skipping`);
                            continue;
                          }

                          // Compute percentage, rounded to 2 decimal places (e.g. 66.67)
                          const value = rollup.max > 0 ? Math.round((rollup.earned / rollup.max) * 10000) / 100 : 0;

                          try {
                            const gpRes = await fetch(`${SUPABASE_URL}/rest/v1/goal_progress`, {
                              method: 'POST',
                              headers: {
                                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=minimal'
                              },
                              body: JSON.stringify({
                                goal_id: goalId,
                                student_id: student.id,
                                date: today,
                                value,
                                source: 'assignment',
                                collected_by: 'auto',
                                assignment_instance_id: instance_id,
                                school_year: schoolYear
                              })
                            });

                            if (!gpRes.ok) {
                              const errText = await gpRes.text();
                              console.warn(`[student-submit-answer] [${requestId}] goal_progress insert failed for ${goalCode}: ${gpRes.status} - ${errText}`);
                            } else {
                              console.log(`[student-submit-answer] [${requestId}] goal_progress inserted: ${goalCode} = ${value}%`);
                            }
                          } catch (gpErr) {
                            console.warn(`[student-submit-answer] [${requestId}] goal_progress error for ${goalCode}:`, gpErr);
                          }
                        }

                        // Insert per-question data points into goal_data_points (supplementary detail)
                        const dataPointRows = [];
                        for (const item of items) {
                          const goalCodes = Array.isArray(item.goal_codes) ? item.goal_codes : [];
                          if (goalCodes.length === 0) continue;

                          const subAnswer = subAnswers.find(sa => sa.assignment_item_id === item.id);
                          if (!subAnswer || subAnswer.earned_points == null) continue;

                          const studentAnswerVal = subAnswer.raw_answer?.value != null ? String(subAnswer.raw_answer.value) : null;
                          const correctAnswerVal = item.meta?.correct != null ? String(item.meta.correct) : null;
                          const isCorr = subAnswer.is_correct;
                          const questionText = item.meta?.text || null;
                          const choices = Array.isArray(item.meta?.choices) ? item.meta.choices : null;
                          // Compute percentage score for percentage-scale dot coloring (written/constructed items)
                          // earned_points is guaranteed non-null by the guard above; max_points may be absent.
                          const earnedNum = Number(subAnswer.earned_points);
                          const maxPts = subAnswer.max_points != null ? Number(subAnswer.max_points) : null;
                          const scoreVal = (maxPts != null && maxPts > 0 && !isNaN(earnedNum))
                            ? Math.round((earnedNum / maxPts) * 100)
                            : null;

                          for (const goalCode of goalCodes) {
                            const goalId = goalIdMap[goalCode];
                            if (!goalId) continue;
                            dataPointRows.push({
                              goal_id: goalId,
                              student_id: student.id,
                              assignment_instance_id: instance_id,
                              item_id: item.id,
                              question_text: questionText,
                              choices: choices || null,
                              student_answer: studentAnswerVal,
                              correct_answer: correctAnswerVal,
                              is_correct: isCorr,
                              score: scoreVal,
                              date: today,
                              source: 'assignment',
                              school_year: schoolYear
                            });
                          }
                        }

                        if (dataPointRows.length > 0) {
                          try {
                            const dpRes = await fetch(`${SUPABASE_URL}/rest/v1/goal_data_points`, {
                              method: 'POST',
                              headers: {
                                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=minimal'
                              },
                              body: JSON.stringify(dataPointRows)
                            });

                            if (!dpRes.ok) {
                              const errText = await dpRes.text();
                              console.warn(`[student-submit-answer] [${requestId}] goal_data_points insert failed: ${dpRes.status} - ${errText}`);
                            } else {
                              console.log(`[student-submit-answer] [${requestId}] goal_data_points inserted: ${dataPointRows.length} row(s)`);
                            }
                          } catch (dpErr) {
                            console.warn(`[student-submit-answer] [${requestId}] goal_data_points error (non-fatal):`, dpErr);
                          }
                        }
                      }
                    }
                  } catch (gpStepErr) {
                    console.warn(`[student-submit-answer] [${requestId}] goal_progress step error (non-fatal):`, gpStepErr);
                  }
                }
              }
            }
          }
        }
      }
    }
    
    return jsonResponse(
      event,
      200,
      { ok: true, score_total: responseScoreTotal, results: responseScoringResults },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-submit-answer] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: err.message || 'Failed to submit answer' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
