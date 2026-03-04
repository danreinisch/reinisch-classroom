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

  const { instance_id, answers, writing_response, student_code } = parseResult.data;

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
    const instanceUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,student_id,assignment_id,settings,status&id=eq.${encodeURIComponent(instance_id)}`;
    
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
      writing_response: writing_response || currentSettings.writing_response || '',
      submitted_at: new Date().toISOString()
    };

    // Step 4: Determine new status
    // If writing_response is provided or answers are complete, mark as "Submitted"
    // Otherwise mark as "In Progress"
    let newStatus = 'In Progress';
    if (writing_response || (answers && Object.keys(answers).length > 0)) {
      newStatus = 'Submitted';
    }

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

      if (existingSubmission) {
        // Update existing submission instead of creating a duplicate
        const updateSubUrl = `${SUPABASE_URL}/rest/v1/submissions?id=eq.${encodeURIComponent(existingSubmission.id)}`;
        const updateSubResponse = await fetch(updateSubUrl, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            answers: updatedSettings.answers || answers || {},
            submitted_at: new Date().toISOString()
          })
        });

        if (!updateSubResponse.ok) {
          const errorText = await updateSubResponse.text();
          console.error(`[student-submit-answer] [${requestId}] Submission update failed: ${updateSubResponse.status} - ${errorText}`);
        } else {
          submissionId = existingSubmission.id;
          console.log(`[student-submit-answer] [${requestId}] Submission updated with ID: ${submissionId}`);
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
            submitted_at: new Date().toISOString()
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
      // Use updatedSettings.answers (the cumulative merged answers) so all MCQ answers are
      // captured even when the final call only sends writing_response.
      const cumulativeAnswers = updatedSettings.answers || {};
      const hasAnswers = Object.keys(cumulativeAnswers).length > 0;
      const hasWriting = writing_response && typeof writing_response === 'string' && writing_response.trim().length > 0;
      if (submissionId && (hasAnswers || hasWriting) && instance.assignment_id) {
        const itemsUrl = `${SUPABASE_URL}/rest/v1/assignment_items?assignment_id=eq.${encodeURIComponent(instance.assignment_id)}&select=id,item_ref,answer_type,points,meta`;
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

                if (item.answer_type === 'mcq' && item.meta && item.meta.correct) {
                  isCorrect = String(studentAnswer).trim().toUpperCase() === String(item.meta.correct).trim().toUpperCase();
                  maxPoints = item.points != null ? Number(item.points) : 1;
                  earnedPoints = isCorrect ? maxPoints : 0;
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
              }
            }

            // Add writing response as a constructed submission_answer (requires teacher scoring)
            if (hasWriting) {
              const constructedItem = items.find(i => i.answer_type === 'constructed');
              if (constructedItem) {
                subAnswers.push({
                  submission_id: submissionId,
                  assignment_item_id: constructedItem.id,
                  raw_answer: { value: writing_response },
                  is_correct: null,
                  earned_points: null,
                  max_points: constructedItem.points != null ? Number(constructedItem.points) : 5, // default 5 pts for writing prompts without explicit points
                  scored_at: null
                });
                console.log(`[student-submit-answer] [${requestId}] Added writing response submission_answer for item ${constructedItem.item_ref}`);
              } else {
                console.warn(`[student-submit-answer] [${requestId}] No constructed assignment_item found for assignment ${instance.assignment_id}; writing_response not linked to submission_answer`);
              }
            }

            if (subAnswers.length > 0) {
              const subAnswersUrl = `${SUPABASE_URL}/rest/v1/submission_answers`;
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
                const scoreAuto = subAnswers
                  .filter(a => a.earned_points != null)
                  .reduce((sum, a) => sum + (a.earned_points || 0), 0);
                const submissionsUpdateUrl = `${SUPABASE_URL}/rest/v1/submissions?id=eq.${encodeURIComponent(submissionId)}`;
                const scoreAutoResponse = await fetch(submissionsUpdateUrl, {
                  method: 'PATCH',
                  headers: {
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                  },
                  body: JSON.stringify({ score_auto: scoreAuto })
                });
                if (!scoreAutoResponse.ok) {
                  const errText = await scoreAutoResponse.text();
                  console.error(`[student-submit-answer] [${requestId}] score_auto update failed: ${scoreAutoResponse.status} - ${errText}`);
                } else {
                  console.log(`[student-submit-answer] [${requestId}] Updated score_auto=${scoreAuto} for submission ${submissionId}`);
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
      { ok: true },
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
