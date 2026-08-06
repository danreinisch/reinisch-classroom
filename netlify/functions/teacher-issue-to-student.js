// Teacher issue-to-student endpoint
// POST /.netlify/functions/teacher-issue-to-student
// Auth: Requires teacher session cookie
// Body: { assignment_id, student_codes: ["S017", "S019"], due_at?, settings? }
// Creates assignment_instances for the named students on an existing assignment.
// Uses ON CONFLICT DO NOTHING so repeated calls are safe.
// Returns: { ok, issued_count }

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig, lookupActiveTeacherId } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-issue-to-student] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-issue-to-student] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[teacher-issue-to-student] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const sizeCheck = validateBodySize(event.body, 10);
  if (!sizeCheck.valid) {
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-issue-to-student] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-issue-to-student] [${requestId}] Authorized user: ${authResult.user.username}`);

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { assignment_id, student_codes, due_at, settings: rawSettings, per_student_settings: rawPerStudentSettings } = parseResult.data;

  let settings = {};
  if (rawSettings === undefined || rawSettings === null) {
    settings = {};
  } else if (typeof rawSettings === 'object' && !Array.isArray(rawSettings)) {
    settings = rawSettings;
  } else {
    return jsonResponse(event, 400, { ok: false, error: 'settings must be an object if provided' }, {}, requestId);
  }

  // Validate per_student_settings if provided
  let perStudentSettings = null;
  if (rawPerStudentSettings !== undefined && rawPerStudentSettings !== null) {
    if (typeof rawPerStudentSettings !== 'object' || Array.isArray(rawPerStudentSettings)) {
      return jsonResponse(event, 400, { ok: false, error: 'per_student_settings must be a plain object' }, {}, requestId);
    }
    perStudentSettings = {};
    for (const [code, overrides] of Object.entries(rawPerStudentSettings)) {
      if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
        return jsonResponse(event, 400, { ok: false, error: `per_student_settings["${code}"] must be a plain object` }, {}, requestId);
      }
      const perStudentEntry = { ...overrides };
      if (perStudentEntry.writing_config != null) {
        if (typeof perStudentEntry.writing_config !== 'object' || Array.isArray(perStudentEntry.writing_config)) {
          return jsonResponse(event, 400, { ok: false, error: `per_student_settings["${code}"].writing_config must be a plain object` }, {}, requestId);
        }
        if (perStudentEntry.writing_config.paragraph_count != null) {
          let pc = parseInt(perStudentEntry.writing_config.paragraph_count, 10);
          if (isNaN(pc)) pc = 1;
          pc = Math.min(5, Math.max(1, pc));
          perStudentEntry.writing_config = { ...perStudentEntry.writing_config, paragraph_count: pc };
        }
      }
      perStudentSettings[code] = perStudentEntry;
    }
  }

  // Validate assignment_id
  if (!assignment_id) {
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id is required' }, {}, requestId);
  }
  const assignmentIdStr = String(assignment_id).trim();
  if (!/^\d+$/.test(assignmentIdStr)) {
    return jsonResponse(event, 400, { ok: false, error: 'assignment_id must be a positive integer' }, {}, requestId);
  }

  // Validate student_codes
  if (!Array.isArray(student_codes) || student_codes.length === 0) {
    return jsonResponse(event, 400, { ok: false, error: 'student_codes must be a non-empty array' }, {}, requestId);
  }
  // Basic code format validation — codes are short alphanumeric strings like "S017"
  for (const code of student_codes) {
    if (typeof code !== 'string' || code.trim().length === 0 || code.length > 20) {
      return jsonResponse(event, 400, { ok: false, error: 'Each student_code must be a non-empty string (max 20 chars)' }, {}, requestId);
    }
  }

  // Validate optional due_at
  if (due_at !== null && due_at !== undefined) {
    if (typeof due_at !== 'string' || isNaN(new Date(due_at).getTime())) {
      return jsonResponse(event, 400, { ok: false, error: 'due_at must be a valid ISO 8601 date string' }, {}, requestId);
    }
  }

  console.log(`[teacher-issue-to-student] [${requestId}] Issuing assignment ${assignmentIdStr} to student codes: ${student_codes.join(', ')}`);

  try {
    // Step 1: Verify the assignment exists and retrieve series (class name) for ownership check
    const assignmentUrl = `${SUPABASE_URL}/rest/v1/assignments?select=id,title,series&id=eq.${assignmentIdStr}&limit=1`;
    const assignmentResponse = await fetch(assignmentUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!assignmentResponse.ok) {
      throw new Error(`Failed to verify assignment: ${assignmentResponse.status}`);
    }
    const assignmentRows = await assignmentResponse.json();
    if (!Array.isArray(assignmentRows) || assignmentRows.length === 0) {
      return jsonResponse(event, 404, { ok: false, error: `Assignment ${assignmentIdStr} not found` }, { 'Cache-Control': 'no-store' }, requestId);
    }

    const assignmentRow = assignmentRows[0];
    console.log(`[teacher-issue-to-student] [${requestId}] Assignment verified: "${assignmentRow.title}" (series: "${assignmentRow.series}")`);

    // Step 1b: Verify the assignment's class belongs to the authenticated teacher
    const teacherUUID = await lookupActiveTeacherId();
    if (teacherUUID) {
      console.log(`[teacher-issue-to-student] [${requestId}] Resolved active teacher UUID: ${teacherUUID}`);
    } else {
      console.warn(`[teacher-issue-to-student] [${requestId}] No active teacher record found; ownership check will be unscoped`);
    }

    const assignmentSeries = assignmentRow.series;
    if (assignmentSeries) {
      let ownershipUrl;
      if (teacherUUID) {
        ownershipUrl = `${SUPABASE_URL}/rest/v1/classes?select=id&name=eq.${encodeURIComponent(assignmentSeries)}&teacher_id=eq.${encodeURIComponent(teacherUUID)}&limit=1`;
        console.log(`[teacher-issue-to-student] [${requestId}] Checking ownership: class "${assignmentSeries}" for teacher ${teacherUUID}`);
      } else {
        ownershipUrl = `${SUPABASE_URL}/rest/v1/classes?select=id&name=eq.${encodeURIComponent(assignmentSeries)}&limit=1`;
        console.log(`[teacher-issue-to-student] [${requestId}] Checking ownership (unscoped): class "${assignmentSeries}"`);
      }

      const ownershipResponse = await fetch(ownershipUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (ownershipResponse.ok) {
        const ownershipRows = await ownershipResponse.json();
        if (!Array.isArray(ownershipRows) || ownershipRows.length === 0) {
          console.warn(`[teacher-issue-to-student] [${requestId}] Ownership check failed: class "${assignmentSeries}" not found for this teacher`);
          return jsonResponse(event, 403, { ok: false, error: 'Assignment does not belong to your class' }, { 'Cache-Control': 'no-store' }, requestId);
        }
        console.log(`[teacher-issue-to-student] [${requestId}] Ownership verified: class "${assignmentSeries}" belongs to this teacher`);
      } else {
        console.warn(`[teacher-issue-to-student] [${requestId}] Ownership check query failed: ${ownershipResponse.status}; proceeding`);
      }
    } else {
      console.warn(`[teacher-issue-to-student] [${requestId}] Assignment has no series; skipping ownership check`);
    }

    // Step 2: Look up student UUIDs from codes
    // Normalize codes to uppercase to match DB storage convention
    const normalizedCodes = student_codes.map(c => c.trim().toUpperCase());
    const quotedCodes = normalizedCodes.map(c => `"${c}"`).join(',');
    const studentsUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code,name,active,archived_at&code=in.(${quotedCodes})`;
    const studentsResponse = await fetch(studentsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!studentsResponse.ok) {
      throw new Error(`Failed to look up students: ${studentsResponse.status}`);
    }
    const students = await studentsResponse.json();

    if (!Array.isArray(students) || students.length === 0) {
      return jsonResponse(event, 404, { ok: false, error: `No students found for codes: ${normalizedCodes.join(', ')}` }, { 'Cache-Control': 'no-store' }, requestId);
    }

    const inactiveStudents = students.filter(
      student =>
        !student ||
        student.active === false ||
        Boolean(student.archived_at)
    );

    if (inactiveStudents.length > 0) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'One or more selected students are inactive or archived'
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    // Warn about any codes not found
    const foundCodes = new Set(students.map(s => s.code));
    const notFound = normalizedCodes.filter(c => !foundCodes.has(c));
    if (notFound.length > 0) {
      console.warn(`[teacher-issue-to-student] [${requestId}] Student codes not found: ${notFound.join(', ')}`);
    }

    console.log(`[teacher-issue-to-student] [${requestId}] Found ${students.length} student(s)`);

    // Step 3: Build instance rows and upsert with retry_config support
    // Build a UTC date string (YYYY-MM-DD) for assigned_at — using UTC avoids
    // timezone-shift issues when running in a Node.js Lambda environment.
    const todayUtc = (() => {
      const d = new Date();
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();

    const assignmentIdInt = parseInt(assignmentIdStr, 10);
    const studentIds = students.map(s => s.id);

    // Step 3a: Look up any existing instances for this assignment + these students
    const quotedStudentIds = studentIds.map(id => `"${id}"`).join(',');
    const existingInstancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,student_id,settings&assignment_id=eq.${assignmentIdStr}&student_id=in.(${quotedStudentIds})`;
    const existingInstancesResponse = await fetch(existingInstancesUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    const existingInstances = existingInstancesResponse.ok
      ? (await existingInstancesResponse.json().catch(() => []))
      : [];

    // Build a map of student_id -> existing instance
    const existingByStudentId = {};
    for (const inst of (Array.isArray(existingInstances) ? existingInstances : [])) {
      existingByStudentId[inst.student_id] = inst;
    }

    // Step 3b: For existing instances, fetch the most recent submission and correct answers
    // to build retry_config
    const existingInstanceIds = Object.values(existingByStudentId).map(i => i.id);
    let retryConfigByInstanceId = {};
    if (existingInstanceIds.length > 0) {
      const quotedInstanceIds = existingInstanceIds.map(id => `"${id}"`).join(',');

      // Fetch the most recent submission per instance (limit to 100 to cap data transfer)
      const submissionsUrl = `${SUPABASE_URL}/rest/v1/submissions?select=id,instance_id,score_total&instance_id=in.(${quotedInstanceIds})&order=submitted_at.desc&limit=100`;
      const submissionsResponse = await fetch(submissionsUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const allSubmissions = submissionsResponse.ok
        ? (await submissionsResponse.json().catch(() => []))
        : [];

      // Keep only the most recent submission per instance
      const latestSubByInstanceId = {};
      for (const sub of (Array.isArray(allSubmissions) ? allSubmissions : [])) {
        if (!latestSubByInstanceId[sub.instance_id]) {
          latestSubByInstanceId[sub.instance_id] = sub;
        }
      }

      // For each instance that has a submission, fetch correct answers
      const submissionIds = Object.values(latestSubByInstanceId).map(s => s.id);
      if (submissionIds.length > 0) {
        const quotedSubIds = submissionIds.map(id => `"${id}"`).join(',');
        const subAnswersUrl = `${SUPABASE_URL}/rest/v1/submission_answers?select=submission_id,assignment_item_id,raw_answer,is_correct&submission_id=in.(${quotedSubIds})`;
        const subAnswersResponse = await fetch(subAnswersUrl, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        const allSubAnswers = subAnswersResponse.ok
          ? (await subAnswersResponse.json().catch(() => []))
          : [];

        // Fetch assignment items (item_ref maps to client-side question IDs)
        const itemRefsUrl = `${SUPABASE_URL}/rest/v1/assignment_items?select=id,item_ref&assignment_id=eq.${assignmentIdStr}`;
        const itemRefsResponse = await fetch(itemRefsUrl, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        const allItems = itemRefsResponse.ok
          ? (await itemRefsResponse.json().catch(() => []))
          : [];

        // Build item_id -> item_ref lookup
        const itemRefById = {};
        for (const item of (Array.isArray(allItems) ? allItems : [])) {
          itemRefById[item.id] = item.item_ref;
        }

        // Build retry_config per instance_id
        for (const [instanceId, sub] of Object.entries(latestSubByInstanceId)) {
          const answersForSub = (Array.isArray(allSubAnswers) ? allSubAnswers : []).filter(a => a.submission_id === sub.id);
          const lockedQuestionIds = [];
          const originalAnswers = {};
          for (const ans of answersForSub) {
            const itemRef = itemRefById[ans.assignment_item_id];
            if (!itemRef) continue;
            if (ans.is_correct === true) {
              lockedQuestionIds.push(itemRef);
              const answerVal = ans.raw_answer && ans.raw_answer.value != null
                ? String(ans.raw_answer.value)
                : null;
              if (answerVal !== null) {
                originalAnswers[itemRef] = answerVal;
              }
            }
          }
          retryConfigByInstanceId[instanceId] = {
            locked_question_ids: lockedQuestionIds,
            original_answers: originalAnswers,
            original_score: sub.score_total != null ? Math.round(sub.score_total) : null,
            retry_initiated_at: new Date().toISOString(),
          };
        }
      }
    }

    // Step 3c: Separate students into those needing UPDATE vs INSERT
    const studentsToInsert = [];
    const instancesToUpdate = [];

    for (const student of students) {
      const existingInst = existingByStudentId[student.id];
      const instanceSettings = (perStudentSettings && perStudentSettings[student.code])
        ? { ...settings, ...perStudentSettings[student.code] }
        : { ...settings };

      if (existingInst) {
        // Re-issue: reset existing instance with retry_config
        const retryConfig = retryConfigByInstanceId[existingInst.id];
        const updatedSettings = { ...instanceSettings };
        if (retryConfig) {
          updatedSettings.retry_config = retryConfig;
          updatedSettings.answers = retryConfig.original_answers;
        }
        instancesToUpdate.push({
          id: existingInst.id,
          assigned_at: todayUtc,
          status: 'Assigned',
          settings: updatedSettings,
          resubmission_count: 0,
          ...(due_at ? { due_at } : {}),
        });
      } else {
        studentsToInsert.push({
          assignment_id: assignmentIdInt,
          student_id: student.id,
          assigned_at: todayUtc,
          status: 'Assigned',
          settings: instanceSettings,
          ...(due_at ? { due_at } : {}),
        });
      }
    }

    let issued_count = 0;

    // Step 3d: Insert new instances
    if (studentsToInsert.length > 0) {
      const instancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances`;
      const insertResponse = await fetch(instancesUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=ignore-duplicates,return=representation',
        },
        body: JSON.stringify(studentsToInsert),
      });
      if (!insertResponse.ok) {
        const errorText = await insertResponse.text();
        console.error(`[teacher-issue-to-student] [${requestId}] Insert failed: ${insertResponse.status} - ${errorText}`);
        throw new Error(`Failed to create assignment instances: ${insertResponse.status}`);
      }
      const insertedInstances = await insertResponse.json().catch(() => []);
      issued_count += Array.isArray(insertedInstances) ? insertedInstances.length : 0;
    }

    // Step 3e: Update existing instances (re-issue with retry_config)
    for (const inst of instancesToUpdate) {
      const { id: instId, ...updatePayload } = inst;
      const updateUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?id=eq.${encodeURIComponent(instId)}`;
      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(updatePayload),
      });
      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error(`[teacher-issue-to-student] [${requestId}] Update failed for instance ${instId}: ${updateResponse.status} - ${errorText}`);
        throw new Error(`Failed to update assignment instance: ${updateResponse.status}`);
      }
      issued_count += 1;
    }

    console.log(`[teacher-issue-to-student] [${requestId}] Issued ${issued_count} instance(s) (${studentsToInsert.length} new, ${instancesToUpdate.length} re-issued)`);

    return jsonResponse(
      event,
      200,
      { ok: true, issued_count },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-issue-to-student] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: err.message || 'Failed to issue assignment to student(s)' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
