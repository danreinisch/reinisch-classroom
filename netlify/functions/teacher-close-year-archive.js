// Teacher Close Year — Archive / Clear / Archive-Students endpoint
// POST /.netlify/functions/teacher-close-year-archive
// Auth: Requires teacher session cookie
// Body: { action: "archive-submissions" | "clear-assignments" | "archive-students", school_year: number, student_codes?: string[] }

function getCurrentSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

const SUPA_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function supaFetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...SUPA_HEADERS, ...(init.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = text; }
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

async function supaCount(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'GET',
    headers: { ...SUPA_HEADERS, Prefer: 'count=exact' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`COUNT ${path} failed: ${res.status} ${text}`);
  }
  const contentRange = res.headers.get('content-range');
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows.length : 0;
}

// ── Action: archive-submissions ───────────────────────────────────────────────
// Copies all submissions for the given school_year into submission_archives.

async function archiveSubmissions(school_year, requestId) {
  console.log(`[close-year-archive] [${requestId}] archiveSubmissions school_year=${school_year}`);

  // Fetch all assignment_instances for this school_year
  const instRes = await supaFetch(
    `/rest/v1/assignment_instances?select=id,assignment_id,student_id&school_year=eq.${school_year}`
  );
  if (!instRes.ok) {
    throw new Error(`Failed to fetch assignment_instances: ${instRes.status}`);
  }
  const instances = Array.isArray(instRes.data) ? instRes.data : [];
  if (instances.length === 0) {
    console.log(`[close-year-archive] [${requestId}] No instances for school_year=${school_year}`);
    return { archived_submissions: 0 };
  }

  const instanceIdMap = {};
  const instanceIds = instances.map(i => { instanceIdMap[i.id] = i; return i.id; });

  // Fetch assignment metadata for title lookups
  const assignmentIds = [...new Set(instances.map(i => i.assignment_id).filter(Boolean))];
  const assignmentMap = {};
  if (assignmentIds.length > 0) {
    const asgRes = await supaFetch(
      `/rest/v1/assignments?select=id,title,section&id=in.(${assignmentIds.join(',')})`
    );
    if (asgRes.ok && Array.isArray(asgRes.data)) {
      asgRes.data.forEach(a => { assignmentMap[a.id] = a; });
    }
  }

  // Fetch student codes
  const studentIds = [...new Set(instances.map(i => i.student_id).filter(Boolean))];
  const studentMap = {};
  if (studentIds.length > 0) {
    const stuRes = await supaFetch(
      `/rest/v1/students?select=id,code&id=in.(${studentIds.join(',')})`
    );
    if (stuRes.ok && Array.isArray(stuRes.data)) {
      stuRes.data.forEach(s => { studentMap[s.id] = s; });
    }
  }

  // Fetch all submissions for these instances
  // PostgREST in() filter with UUIDs
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validIds = instanceIds.filter(id => typeof id === 'string' && uuidPattern.test(id));
  if (validIds.length === 0) {
    return { archived_submissions: 0 };
  }

  const quotedIds = validIds.map(id => `"${id}"`).join(',');
  const subRes = await supaFetch(
    `/rest/v1/submissions?select=id,instance_id,answers,score_auto,score_manual,score_total,detail,notes,feedback,submitted_at,review_status,graded_at,graded_by,school_year&instance_id=in.(${quotedIds})`
  );
  if (!subRes.ok) {
    throw new Error(`Failed to fetch submissions: ${subRes.status}`);
  }
  const submissions = Array.isArray(subRes.data) ? subRes.data : [];

  if (submissions.length === 0) {
    return { archived_submissions: 0 };
  }

  // Check which submissions are already archived to avoid duplicates
  const subIds = submissions.map(s => `"${s.id}"`).join(',');
  const existingRes = await supaFetch(
    `/rest/v1/submission_archives?select=submission_id&submission_id=in.(${subIds})`
  );
  const existingIds = new Set();
  if (existingRes.ok && Array.isArray(existingRes.data)) {
    existingRes.data.forEach(r => existingIds.add(r.submission_id));
  }

  const toArchive = submissions.filter(s => !existingIds.has(s.id));
  if (toArchive.length === 0) {
    console.log(`[close-year-archive] [${requestId}] All ${submissions.length} submissions already archived`);
    return { archived_submissions: 0 };
  }

  // Fetch structured per-question answer evidence for the submissions being archived.
  const archiveSubIds = toArchive.map(s => `"${s.id}"`).join(',');
  const ansRes = await supaFetch(
    `/rest/v1/submission_answers?select=submission_id,assignment_item_id,raw_answer,is_correct,earned_points,max_points,teacher_note,rationale&submission_id=in.(${archiveSubIds})`
  );
  if (!ansRes.ok) {
    throw new Error(`Failed to fetch submission_answers: ${ansRes.status}`);
  }
  const submissionAnswers = Array.isArray(ansRes.data) ? ansRes.data : [];

  // Fetch assignment item metadata so the archive remains meaningful even if
  // active assignment structures are later retired.
  const itemIds = [
    ...new Set(
      submissionAnswers
        .map(answer => answer.assignment_item_id)
        .filter(Boolean)
    ),
  ];

  const itemMap = {};
  const mappingMap = {};

  if (itemIds.length > 0) {
    const itemIdsParam = itemIds
      .map(id => encodeURIComponent(id))
      .join(',');

    const itemRes = await supaFetch(
      `/rest/v1/assignment_items?select=id,item_ref,answer_type,points,meta,goal_codes,dese_codes&id=in.(${itemIdsParam})`
    );
    if (!itemRes.ok) {
      throw new Error(`Failed to fetch assignment_items: ${itemRes.status}`);
    }
    if (Array.isArray(itemRes.data)) {
      itemRes.data.forEach(item => {
        itemMap[item.id] = item;
      });
    }

    const mapRes = await supaFetch(
      `/rest/v1/assignment_item_mappings?select=item_id,goal_codes,dese_codes&item_id=in.(${itemIdsParam})`
    );
    if (!mapRes.ok) {
      throw new Error(`Failed to fetch assignment_item_mappings: ${mapRes.status}`);
    }
    if (Array.isArray(mapRes.data)) {
      mapRes.data.forEach(mapping => {
        mappingMap[mapping.item_id] = mapping;
      });
    }
  }

  const answersBySubmission = {};
  submissionAnswers.forEach(answer => {
    const item = itemMap[answer.assignment_item_id] || {};
    const mapping = mappingMap[answer.assignment_item_id] || {};

    // Goal mappings are authoritative in assignment_item_mappings.
    // Fall back to assignment_items for older records.
    const goalCodes =
      Array.isArray(mapping.goal_codes) && mapping.goal_codes.length > 0
        ? mapping.goal_codes
        : (Array.isArray(item.goal_codes) ? item.goal_codes : []);

    // DESE mappings are authoritative on assignment_items in current runtime.
    // Fall back to assignment_item_mappings for older records.
    const deseCodes =
      Array.isArray(item.dese_codes) && item.dese_codes.length > 0
        ? item.dese_codes
        : (Array.isArray(mapping.dese_codes) ? mapping.dese_codes : []);

    const snapshot = {
      assignment_item_id: answer.assignment_item_id,
      item_ref: item.item_ref || null,
      answer_type: item.answer_type || null,
      points: item.points ?? null,
      item_meta: item.meta || {},
      raw_answer: answer.raw_answer ?? null,
      is_correct: answer.is_correct ?? null,
      earned_points: answer.earned_points ?? null,
      max_points: answer.max_points ?? null,
      teacher_note: answer.teacher_note || null,
      rationale: answer.rationale || null,
      goal_codes: goalCodes,
      dese_codes: deseCodes,
    };

    if (!answersBySubmission[answer.submission_id]) {
      answersBySubmission[answer.submission_id] = [];
    }
    answersBySubmission[answer.submission_id].push(snapshot);
  });

  // Build self-contained archive records.
  const archiveRecords = toArchive.map(sub => {
    const inst = instanceIdMap[sub.instance_id] || {};
    const asg = assignmentMap[inst.assignment_id] || {};
    const stu = studentMap[inst.student_id] || {};
    const structuredAnswers = answersBySubmission[sub.id] || [];

    if (!inst.assignment_id || !inst.student_id || !asg.title || !stu.code) {
      throw new Error(
        `Cannot archive submission ${sub.id}: required assignment/student metadata is missing`
      );
    }

    const goalSet = new Set();
    const deseSet = new Set();

    structuredAnswers.forEach(answer => {
      (answer.goal_codes || []).forEach(code => goalSet.add(code));
      (answer.dese_codes || []).forEach(code => deseSet.add(code));
    });

    return {
      submission_id: sub.id,
      student_id: inst.student_id,
      student_code: stu.code,
      assignment_id: String(inst.assignment_id),
      title: asg.title,
      class_name: asg.section || null,

      // JSONB preservation envelope:
      // - raw_submission_answers keeps the original submission payload;
      // - items keeps structured, reconstructable per-question evidence;
      // - grading_metadata preserves review/grading context that has no
      //   dedicated submission_archives columns.
      answers: {
        format_version: 2,
        raw_submission_answers: sub.answers ?? null,
        items: structuredAnswers,
        grading_metadata: {
          review_status: sub.review_status || null,
          detail: sub.detail ?? null,
          notes: sub.notes || null,
          graded_at: sub.graded_at || null,
          graded_by: sub.graded_by || null,
        },
      },

      score_auto: sub.score_auto ?? null,
      score_manual: sub.score_manual ?? null,
      score_total: sub.score_total ?? null,
      feedback: sub.feedback || null,
      iep_goal_codes: Array.from(goalSet),
      dese_standard_codes: Array.from(deseSet),
      submitted_at: sub.submitted_at || null,
      reviewed_at: sub.graded_at || new Date().toISOString(),
      school_year: sub.school_year ?? school_year,
      archived_at: new Date().toISOString(),
    };
  });

  // Insert in batches of 100
  const BATCH = 100;
  let archived_submissions = 0;
  for (let i = 0; i < archiveRecords.length; i += BATCH) {
    const batch = archiveRecords.slice(i, i + BATCH);
    const insertRes = await supaFetch('/rest/v1/submission_archives', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!insertRes.ok) {
      console.error(`[close-year-archive] [${requestId}] Archive insert batch failed: ${insertRes.status}`, insertRes.data);
      throw new Error(`Failed to insert archive batch: ${insertRes.status}`);
    }
    archived_submissions += batch.length;
    console.log(`[close-year-archive] [${requestId}] Archived batch ${i / BATCH + 1}: ${batch.length} records`);
  }

  return { archived_submissions };
}

// ── Action: clear-assignments ─────────────────────────────────────────────────
// Deletes submissions and assignment_instances for the given school_year.
// Does NOT delete assignments (templates in the Library).

async function clearAssignments(school_year, requestId) {
  console.log(`[close-year-archive] [${requestId}] clearAssignments school_year=${school_year}`);

  // Fetch all assignment_instances for this school_year to get their IDs
  const instRes = await supaFetch(
    `/rest/v1/assignment_instances?select=id&school_year=eq.${school_year}`
  );
  if (!instRes.ok) {
    throw new Error(`Failed to fetch assignment_instances: ${instRes.status}`);
  }
  const instances = Array.isArray(instRes.data) ? instRes.data : [];

  let deleted_submissions = 0;

  if (instances.length > 0) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validIds = instances
      .map(i => i.id)
      .filter(id => typeof id === 'string' && uuidPattern.test(id));

    if (validIds.length > 0) {
      const quotedIds = validIds.map(id => `"${id}"`).join(',');
      const delSubRes = await supaFetch(
        `/rest/v1/submissions?instance_id=in.(${quotedIds})`,
        { method: 'DELETE', headers: { Prefer: 'return=representation' } }
      );
      if (!delSubRes.ok) {
        throw new Error(`Failed to delete submissions: ${delSubRes.status}`);
      }
      const deleted = delSubRes.data;
      deleted_submissions = Array.isArray(deleted) ? deleted.length : 0;
      console.log(`[close-year-archive] [${requestId}] Deleted ${deleted_submissions} submissions`);
    }
  }

  // Delete assignment_instances for this school_year
  const delInstRes = await supaFetch(
    `/rest/v1/assignment_instances?school_year=eq.${school_year}`,
    { method: 'DELETE', headers: { Prefer: 'return=representation' } }
  );
  if (!delInstRes.ok) {
    throw new Error(`Failed to delete assignment_instances: ${delInstRes.status}`);
  }
  const deletedInst = delInstRes.data;
  const deleted_instances = Array.isArray(deletedInst) ? deletedInst.length : 0;
  console.log(`[close-year-archive] [${requestId}] Deleted ${deleted_instances} instances`);

  return { deleted_instances, deleted_submissions };
}

// ── Action: archive-students ──────────────────────────────────────────────────
// Sets active=false and archived_at=now() for the given student_codes.

async function archiveStudents(student_codes, requestId) {
  console.log(`[close-year-archive] [${requestId}] archiveStudents count=${student_codes.length}`);

  if (!student_codes || student_codes.length === 0) {
    return { archived_students: 0 };
  }

  // Validate codes are reasonable strings
  const safeCodes = student_codes
    .filter(c => typeof c === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(c));

  if (safeCodes.length !== student_codes.length) {
    const skipped = student_codes.length - safeCodes.length;
    console.warn(`[close-year-archive] [${requestId}] Skipping ${skipped} invalid student code(s)`);
  }

  if (safeCodes.length === 0) {
    return { archived_students: 0 };
  }

  const quotedCodes = safeCodes.map(c => `"${c}"`).join(',');
  const updateRes = await supaFetch(
    `/rest/v1/students?code=in.(${quotedCodes})`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ active: false, archived_at: new Date().toISOString() }),
    }
  );
  if (!updateRes.ok) {
    throw new Error(`Failed to archive students: ${updateRes.status}`);
  }
  const updated = updateRes.data;
  const archived_students = Array.isArray(updated) ? updated.length : 0;
  console.log(`[close-year-archive] [${requestId}] Archived ${archived_students} students`);
  return { archived_students };
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-close-year-archive] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-close-year-archive] [${requestId}] Server not configured`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[teacher-close-year-archive] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const sizeCheck = validateBodySize(event.body, 50);
  if (!sizeCheck.valid) {
    return jsonResponse(event, 413, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-close-year-archive] [${requestId}] Unauthorized`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { action, school_year, student_codes } = parseResult.data;

  const VALID_ACTIONS = ['archive-submissions', 'clear-assignments', 'archive-students'];
  if (!action || !VALID_ACTIONS.includes(action)) {
    return jsonResponse(event, 400, { ok: false, error: `action must be one of: ${VALID_ACTIONS.join(', ')}` }, {}, requestId);
  }

  const currentYear = getCurrentSchoolYear();
  const year = typeof school_year === 'number' ? school_year : currentYear;
  if (year < 2000 || year > currentYear + 1) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid school_year' }, {}, requestId);
  }

  console.log(`[teacher-close-year-archive] [${requestId}] action=${action} school_year=${year} user=${authResult.user.username}`);

  try {
    let result;

    if (action === 'archive-submissions') {
      result = await archiveSubmissions(year, requestId);
    } else if (action === 'clear-assignments') {
      result = await clearAssignments(year, requestId);
    } else if (action === 'archive-students') {
      if (!Array.isArray(student_codes)) {
        return jsonResponse(event, 400, { ok: false, error: 'student_codes must be an array' }, {}, requestId);
      }
      result = await archiveStudents(student_codes, requestId);
    }

    console.log(`[teacher-close-year-archive] [${requestId}] ${action} complete:`, result);
    return jsonResponse(
      event,
      200,
      { ok: true, action, school_year: year, ...result },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-close-year-archive] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: String(err?.message || err) },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
