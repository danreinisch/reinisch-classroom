// Student goal progress endpoint - returns goal progress entries for a student
// GET /.netlify/functions/student-goal-progress?code=XXX
// Auth: Requires code parameter
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  requireStudent,
} = require('./_lib/student-auth');

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

async function filterInstructionalEvidenceRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const instanceIds = [
    ...new Set(
      safeRows
        .map(row => row?.assignment_instance_id)
        .filter(Boolean)
    )
  ];

  if (instanceIds.length === 0) return safeRows;

  const instancesUrl =
    `${SUPABASE_URL}/rest/v1/assignment_instances` +
    `?select=id,settings` +
    `&id=in.(${instanceIds.map(encodeURIComponent).join(',')})`;

  const instancesResponse = await fetch(instancesUrl, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!instancesResponse.ok) {
    throw new Error(
      `Assignment-instance marker lookup failed: ${instancesResponse.status}`
    );
  }

  const instances = await instancesResponse.json();
  const nonInstructionalIds = new Set(
    (instances || [])
      .filter(instance => instance?.settings?.non_instructional === true)
      .map(instance => instance.id)
  );

  return safeRows.filter(
    row =>
      !row.assignment_instance_id ||
      !nonInstructionalIds.has(row.assignment_instance_id)
  );
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-goal-progress] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'GET') {
    console.log(`[student-goal-progress] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[student-goal-progress] [${requestId}] Supabase not configured`);
    // Return 200 with unavailable flag to prevent client error handling
    return jsonResponse(
      event, 
      200, 
      { ok: true, progress: [], unavailable: true, reason: 'supabase_not_configured' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Parse query params
  const params = event.queryStringParameters || {};
  const code = params.code;

  // Validate input
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    console.log(`[student-goal-progress] [${requestId}] Missing or invalid code`);
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Student code is required' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Normalize student code to uppercase
  const codeNorm = code.trim().toUpperCase();

  const studentAuth =
    requireStudent(
      event,
      SESSION_SECRET,
      codeNorm
    );

  if (!studentAuth.ok) {
    return jsonResponse(
      event,
      studentAuth.statusCode,
      {
        ok: false,
        error: studentAuth.error,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  try {
    // First, get student ID from code
    const studentUrl = `${SUPABASE_URL}/rest/v1/students?select=id&code=eq.${encodeURIComponent(codeNorm)}&limit=1`;
    
    console.log(`[student-goal-progress] [${requestId}] Looking up student ID for code:`, codeNorm);
    
    const studentResponse = await fetch(studentUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!studentResponse.ok) {
      throw new Error(`Student lookup failed: ${studentResponse.status}`);
    }

    const studentData = await studentResponse.json();
    
    if (!studentData || studentData.length === 0) {
      console.log(`[student-goal-progress] [${requestId}] Student not found:`, codeNorm);
      return jsonResponse(
        event,
        404,
        { ok: false, error: 'Student not found' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const studentId = studentData[0].id;

    // Fetch goal progress for this student with joined goal data — filter to active goals only
    const progressUrl = `${SUPABASE_URL}/rest/v1/goal_progress?select=*,goals!inner(code,desc,goal_area,baseline,mastery,measurement_type,class_context)&student_id=eq.${studentId}&goals.active=eq.true&order=date.desc`;
    
    console.log(`[student-goal-progress] [${requestId}] Fetching goal progress for student ID:`, studentId);
    
    const progressResponse = await fetch(progressUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!progressResponse.ok) {
      // Parse error response for debugging
      let errorBody = '';
      let errorData = null;
      
      try {
        errorBody = await progressResponse.text();
        // Try to parse as JSON for structured error info
        try {
          errorData = JSON.parse(errorBody);
        } catch {
          // Not JSON, keep as text
        }
      } catch (err) {
        console.error(`[student-goal-progress] [${requestId}] Failed to read error body:`, err);
      }
      
      console.error(`[student-goal-progress] [${requestId}] Progress query failed:`, {
        status: progressResponse.status,
        body: errorBody,
        data: errorData
      });
      
      // Check for known schema errors using status codes and error patterns
      // PostgREST returns 400 for relation errors, 406 for content negotiation issues
      const isSchemaError = 
        progressResponse.status === 404 || // Not found
        progressResponse.status === 400 && errorBody && (
          errorBody.includes('relation') && errorBody.includes('does not exist') ||
          errorBody.includes('column') && errorBody.includes('does not exist')
        ) ||
        progressResponse.status === 406; // Not acceptable (relationship/join issue)
      
      if (isSchemaError) {
        // Schema not present - return success with unavailable flag
        console.log(`[student-goal-progress] [${requestId}] Schema not available (status: ${progressResponse.status}), returning empty result`);
        return jsonResponse(
          event,
          200,
          { ok: true, progress: [], unavailable: true, reason: 'schema_unavailable' },
          { 'Cache-Control': 'no-store' },
          requestId
        );
      }
      
      // Try fallback query without join for relationship errors
      console.log(`[student-goal-progress] [${requestId}] Attempting fallback query without join`);
      const fallbackUrl = `${SUPABASE_URL}/rest/v1/goal_progress?select=*&student_id=eq.${studentId}&order=date.desc`;
      
      const fallbackResponse = await fetch(fallbackUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!fallbackResponse.ok) {
        // Both queries failed - return unavailable
        console.error(`[student-goal-progress] [${requestId}] Fallback query also failed (status: ${fallbackResponse.status})`);
        return jsonResponse(
          event,
          200,
          { ok: true, progress: [], unavailable: true, reason: 'query_failed' },
          { 'Cache-Control': 'no-store' },
          requestId
        );
      }
      
      const fallbackProgressRaw = await fallbackResponse.json();
      const fallbackProgress =
        await filterInstructionalEvidenceRows(fallbackProgressRaw);
      
      // Constants for fallback values
      const FALLBACK_GOAL_DESC = 'Goal details unavailable';
      const FALLBACK_GOAL_AREA = 'Uncategorized';
      
      // Map fallback data, then attempt to enrich with real goal metadata
      let fallbackFlattened = (fallbackProgress || []).map(entry => ({
        id: entry.id,
        goal_id: entry.goal_id,
        goal_code: `G${entry.goal_id}`,
        goal_desc: FALLBACK_GOAL_DESC,
        goal_area: FALLBACK_GOAL_AREA,
        baseline: null,
        mastery: null,
        measurement_type: null,
        class_context: null,
        student_id: entry.student_id,
        student_code: codeNorm,
        class_id: entry.class_id,
        date: entry.date,
        value: entry.value,
        percent: entry.value,
        source: entry.source,
        collected_by: entry.collected_by,
        created_at: entry.created_at
      }));
      
      // Best-effort: fetch goal metadata for the goal IDs present in fallback results
      const goalIds = [...new Set((fallbackProgress || []).map(p => p.goal_id).filter(Boolean))];
      if (goalIds.length > 0) {
        try {
          const goalsUrl = `${SUPABASE_URL}/rest/v1/goals?select=id,code,desc,goal_area,baseline,mastery,measurement_type,class_context&id=in.(${goalIds.join(',')})`;
          const goalsResponse = await fetch(goalsUrl, {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            }
          });
          if (goalsResponse.ok) {
            const goalsData = await goalsResponse.json();
            const goalsMap = {};
            (goalsData || []).forEach(g => { goalsMap[g.id] = g; });
            fallbackFlattened = fallbackFlattened.map(entry => {
              const goal = goalsMap[entry.goal_id] || {};
              return {
                ...entry,
                goal_code: goal.code || entry.goal_code,
                goal_desc: goal.desc || entry.goal_desc,
                goal_area: goal.goal_area || entry.goal_area,
                baseline: goal.baseline ?? entry.baseline,
                mastery: goal.mastery ?? entry.mastery,
                measurement_type: goal.measurement_type ?? entry.measurement_type,
                class_context: goal.class_context ?? entry.class_context,
              };
            });
            console.log(`[student-goal-progress] [${requestId}] Fallback goals enrichment successful for ${goalsData.length} goals`);
          } else {
            console.warn(`[student-goal-progress] [${requestId}] Fallback goals enrichment query failed (status: ${goalsResponse.status}), using placeholder values`);
          }
        } catch (enrichErr) {
          console.warn(`[student-goal-progress] [${requestId}] Fallback goals enrichment error:`, enrichErr);
        }
      }
      
      console.log(`[student-goal-progress] [${requestId}] Fallback successful, fetched ${fallbackFlattened.length} entries`);
      
      return jsonResponse(
        event,
        200,
        { ok: true, progress: fallbackFlattened, fallback: true },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const progressRaw = await progressResponse.json();
    const progress =
      await filterInstructionalEvidenceRows(progressRaw);
    
    // Constants for fallback values
    const FALLBACK_GOAL_DESC = 'Goal details unavailable';
    const FALLBACK_GOAL_AREA = 'Uncategorized';
    
    // Flatten the response to include goal data at top level for easier consumption
    // Safely handle missing goals relation
    const flattened = (progress || []).map(entry => ({
      id: entry.id,
      goal_id: entry.goal_id,
      goal_code: entry.goals?.code || `G${entry.goal_id}`,
      goal_desc: entry.goals?.desc || FALLBACK_GOAL_DESC,
      goal_area: entry.goals?.goal_area || FALLBACK_GOAL_AREA,
      baseline: entry.goals?.baseline ?? null,
      mastery: entry.goals?.mastery ?? null,
      measurement_type: entry.goals?.measurement_type ?? null,
      class_context: entry.goals?.class_context ?? null,
      student_id: entry.student_id,
      student_code: codeNorm,
      class_id: entry.class_id,
      date: entry.date,
      value: entry.value,
      percent: entry.value, // Alias for backward compatibility
      source: entry.source,
      collected_by: entry.collected_by,
      created_at: entry.created_at
    }));
    
    console.log(`[student-goal-progress] [${requestId}] Successfully fetched ${flattened.length} progress entries`);
    
    return jsonResponse(
      event,
      200,
      { ok: true, progress: flattened },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-goal-progress] [${requestId}] Unexpected error:`, err);
    // Return 200 with unavailable flag to prevent client retry loops
    return jsonResponse(
      event,
      200,
      { ok: true, progress: [], unavailable: true, error: 'Service temporarily unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
