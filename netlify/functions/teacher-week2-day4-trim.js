'use strict';

const crypto = require('crypto');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');
const { requireTeacher } = require('./_lib/auth');
const {
  getSupabaseConfig,
  lookupActiveTeacherId,
} = require('./_lib/supa');
const {
  TARGETS,
  TARGET_SCHOOL_YEAR,
  buildAssignmentPlan,
  matchesTargetAssignment,
  trimDay4Meta,
} = require('./_lib/week2-day4-trim');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } =
  getSupabaseConfig();
const { SESSION_SECRET } = process.env;

const APPLY_CONFIRMATION = 'TRIM_WEEK2_DAY4_2026-09-11';
const PRODUCTION_HOSTS = new Set([
  'reinischclassroom.com',
  'www.reinischclassroom.com',
]);

function requestHost(event) {
  const raw =
    event && event.headers
      ? (event.headers.host || event.headers.Host || '')
      : '';
  return String(raw).split(':')[0].trim().toLowerCase();
}

function headers(prefer) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function inFilter(values) {
  return (Array.isArray(values) ? values : [])
    .map(value => encodeURIComponent(String(value)))
    .join(',');
}

async function readJson(path, context) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'GET',
    headers: headers(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `${context} failed (${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`
    );
  }

  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function patchJson(path, body, context) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: headers('return=minimal'),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `${context} failed (${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`
    );
  }
}

async function deleteRows(path, context) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: headers('return=minimal'),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `${context} failed (${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`
    );
  }
}

function groupBy(rows, keyName) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = row && row[keyName] != null
      ? String(row[keyName])
      : null;
    if (!key) continue;
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  }
  return result;
}

function buildPreviewToken(plans, missingTargets) {
  const payload = {
    missingTargets: [...missingTargets].sort(),
    plans: plans
      .map(plan => ({
        assignmentId: plan.assignmentId,
        blocked: plan.blocked,
        blockedReasons: [...plan.blockedReasons].sort(),
        needsMutation: plan.needsMutation,
        day4MetaCount: plan.day4MetaCount,
        day4ItemIds: [...plan.day4ItemIds].sort(),
        day4ItemRefs: [...plan.day4ItemRefs].sort(),
        removedPoints: plan.removedPoints,
        remainingPoints: plan.remainingPoints,
        day4AutosaveCount: plan.day4AutosaveCount,
        day4SubmissionJsonCount: plan.day4SubmissionJsonCount,
        day4SubmissionAnswerCount: plan.day4SubmissionAnswerCount,
        day4GoalEvidenceCount: plan.day4GoalEvidenceCount,
        day4ObjectiveEvidenceCount: plan.day4ObjectiveEvidenceCount,
        day4ObjectiveReviewCount: plan.day4ObjectiveReviewCount,
        manualReviewCount: plan.manualReviewCount,
      }))
      .sort((a, b) => a.assignmentId.localeCompare(b.assignmentId)),
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function publicPlan(plan) {
  return {
    assignment_id: plan.assignmentId,
    class_name: plan.className,
    title: plan.title,
    needs_mutation: plan.needsMutation,
    blocked: plan.blocked,
    blocked_reasons: plan.blockedReasons,
    day4_meta_sections: plan.day4MetaCount,
    day4_items: plan.day4ItemCount,
    removed_points: plan.removedPoints,
    remaining_points: plan.remainingPoints,
    student_instances: plan.instanceCount,
  };
}

async function collectTrimState(teacherId) {
  const classes = await readJson(
    `classes?select=id,name,teacher_id&teacher_id=eq.${encodeURIComponent(teacherId)}`,
    'Teacher class lookup'
  );

  const classByName = new Map();
  for (const row of classes) {
    if (row && row.name && row.id) {
      classByName.set(String(row.name), row);
    }
  }

  const missingTargets = [];
  for (const target of TARGETS) {
    if (!classByName.has(target.className)) {
      missingTargets.push(`${target.className}: class not found`);
    }
  }

  const classIds = TARGETS
    .map(target => classByName.get(target.className))
    .filter(Boolean)
    .map(row => row.id);

  let assignments = [];
  if (classIds.length > 0) {
    assignments = await readJson(
      `assignments?select=id,title,class_id,meta,school_year,active` +
        `&class_id=in.(${inFilter(classIds)})` +
        `&school_year=eq.${TARGET_SCHOOL_YEAR}`,
      'Week 2 assignment lookup'
    );
  }

  const targetByClassId = new Map();
  for (const target of TARGETS) {
    const cls = classByName.get(target.className);
    if (cls) targetByClassId.set(String(cls.id), target);
  }

  const candidateEntries = [];
  for (const assignment of assignments) {
    const target = targetByClassId.get(String(assignment.class_id));
    if (!target) continue;
    if (!matchesTargetAssignment(assignment, target)) continue;
    candidateEntries.push({ assignment, target });
  }

  for (const target of TARGETS) {
    const cls = classByName.get(target.className);
    if (!cls) continue;

    const count = candidateEntries.filter(
      entry =>
        String(entry.assignment.class_id) === String(cls.id) &&
        entry.target.title === target.title
    ).length;

    if (count !== target.expectedCount) {
      missingTargets.push(
        `${target.className}: expected ${target.expectedCount} Week 2 assignment(s), found ${count}`
      );
    }
  }

  const assignmentIds = candidateEntries.map(
    entry => String(entry.assignment.id)
  );

  const items = assignmentIds.length > 0
    ? await readJson(
        `assignment_items?select=id,assignment_id,item_ref,answer_type,points,meta` +
          `&assignment_id=in.(${inFilter(assignmentIds)})`,
        'Assignment item lookup'
      )
    : [];

  const instances = assignmentIds.length > 0
    ? await readJson(
        `assignment_instances?select=id,assignment_id,status,settings` +
          `&assignment_id=in.(${inFilter(assignmentIds)})`,
        'Assignment instance safety lookup'
      )
    : [];

  const instanceIds = instances
    .map(row => row && row.id)
    .filter(Boolean);

  const submissions = instanceIds.length > 0
    ? await readJson(
        `submissions?select=id,instance_id,answers,review_status,score_manual,graded_at` +
          `&instance_id=in.(${inFilter(instanceIds)})`,
        'Submission safety lookup'
      )
    : [];

  const itemsByAssignment = groupBy(items, 'assignment_id');
  const instancesByAssignment = groupBy(instances, 'assignment_id');
  const submissionsByInstance = groupBy(submissions, 'instance_id');

  const preliminaryPlans = candidateEntries.map(({ assignment, target }) => {
    const assignmentInstances =
      instancesByAssignment.get(String(assignment.id)) || [];
    const assignmentSubmissions = [];
    for (const instance of assignmentInstances) {
      assignmentSubmissions.push(
        ...(submissionsByInstance.get(String(instance.id)) || [])
      );
    }

    return buildAssignmentPlan({
      assignment,
      target,
      items: itemsByAssignment.get(String(assignment.id)) || [],
      instances: assignmentInstances,
      submissions: assignmentSubmissions,
    });
  });

  const day4ItemIds = preliminaryPlans
    .flatMap(plan => plan.day4ItemIds)
    .filter(Boolean);

  const submissionAnswers = day4ItemIds.length > 0
    ? await readJson(
        `submission_answers?select=id,submission_id,assignment_item_id` +
          `&assignment_item_id=in.(${inFilter(day4ItemIds)})`,
        'Day 4 submission-answer safety lookup'
      )
    : [];

  const goalDataPoints = day4ItemIds.length > 0
    ? await readJson(
        `goal_data_points?select=id,item_id` +
          `&item_id=in.(${inFilter(day4ItemIds)})`,
        'Day 4 goal-evidence safety lookup'
      )
    : [];

  const objectiveDataPoints = day4ItemIds.length > 0
    ? await readJson(
        `objective_data_points?select=id,item_id` +
          `&item_id=in.(${inFilter(day4ItemIds)})`,
        'Day 4 objective-evidence safety lookup'
      )
    : [];

  const objectiveReviewDispositions = day4ItemIds.length > 0
    ? await readJson(
        `objective_review_dispositions?select=id,item_id` +
          `&item_id=in.(${inFilter(day4ItemIds)})`,
        'Day 4 objective-review safety lookup'
      )
    : [];

  const assignmentIdByItemId = new Map();
  for (const item of items) {
    if (item && item.id != null && item.assignment_id != null) {
      assignmentIdByItemId.set(
        String(item.id),
        String(item.assignment_id)
      );
    }
  }

  function evidenceByAssignment(rows) {
    const result = new Map();
    for (const row of rows) {
      const rawItemId =
        row && row.assignment_item_id != null
          ? row.assignment_item_id
          : row && row.item_id;
      const assignmentId = rawItemId != null
        ? assignmentIdByItemId.get(String(rawItemId))
        : null;
      if (!assignmentId) continue;
      if (!result.has(assignmentId)) result.set(assignmentId, []);
      result.get(assignmentId).push(row);
    }
    return result;
  }

  const submissionAnswersByAssignment =
    evidenceByAssignment(submissionAnswers);
  const goalDataByAssignment =
    evidenceByAssignment(goalDataPoints);
  const objectiveDataByAssignment =
    evidenceByAssignment(objectiveDataPoints);
  const objectiveReviewByAssignment =
    evidenceByAssignment(objectiveReviewDispositions);

  const entries = candidateEntries.map(({ assignment, target }) => {
    const assignmentInstances =
      instancesByAssignment.get(String(assignment.id)) || [];
    const assignmentSubmissions = [];
    for (const instance of assignmentInstances) {
      assignmentSubmissions.push(
        ...(submissionsByInstance.get(String(instance.id)) || [])
      );
    }

    const plan = buildAssignmentPlan({
      assignment,
      target,
      items: itemsByAssignment.get(String(assignment.id)) || [],
      instances: assignmentInstances,
      submissions: assignmentSubmissions,
      submissionAnswers:
        submissionAnswersByAssignment.get(String(assignment.id)) || [],
      goalDataPoints:
        goalDataByAssignment.get(String(assignment.id)) || [],
      objectiveDataPoints:
        objectiveDataByAssignment.get(String(assignment.id)) || [],
      objectiveReviewDispositions:
        objectiveReviewByAssignment.get(String(assignment.id)) || [],
    });

    return { assignment, target, plan };
  });

  const plans = entries.map(entry => entry.plan);
  const token = buildPreviewToken(plans, missingTargets);

  return {
    entries,
    plans,
    missingTargets,
    token,
  };
}

async function rollbackMeta(patchedEntries) {
  const failures = [];
  for (const entry of [...patchedEntries].reverse()) {
    try {
      await patchJson(
        `assignments?id=eq.${encodeURIComponent(entry.assignment.id)}`,
        { meta: entry.assignment.meta },
        `Rollback assignment ${entry.assignment.id}`
      );
    } catch (err) {
      failures.push({
        assignment_id: String(entry.assignment.id),
        error: err.message,
      });
    }
  }
  return failures;
}

async function applyTrim(state) {
  const actionable = state.entries.filter(
    entry => entry.plan.needsMutation
  );

  if (actionable.length === 0) {
    return {
      changed_assignments: 0,
      removed_day4_items: 0,
      already_trimmed: true,
      rollback_failures: [],
    };
  }

  const patchedEntries = [];

  try {
    for (const entry of actionable) {
      const trimmed = trimDay4Meta(entry.assignment.meta);
      if (!trimmed.changed) continue;

      await patchJson(
        `assignments?id=eq.${encodeURIComponent(entry.assignment.id)}`,
        { meta: trimmed.meta },
        `Trim Day 4 metadata for assignment ${entry.assignment.id}`
      );
      patchedEntries.push(entry);
    }

    const itemIds = actionable
      .flatMap(entry => entry.plan.day4ItemIds)
      .filter(Boolean);

    if (itemIds.length > 0) {
      await deleteRows(
        `assignment_items?id=in.(${inFilter(itemIds)})`,
        'Delete Day 4 assignment items'
      );
    }

    return {
      changed_assignments: actionable.length,
      removed_day4_items: itemIds.length,
      already_trimmed: false,
      rollback_failures: [],
    };
  } catch (err) {
    const rollbackFailures = await rollbackMeta(patchedEntries);
    err.rollbackFailures = rollbackFailures;
    throw err;
  }
}

exports.handler = async event => {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(
      event,
      ['POST', 'OPTIONS'],
      ['Content-Type']
    );
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(
      event,
      405,
      { ok: false, error: 'Method Not Allowed' },
      {},
      requestId
    );
  }

  if (!SESSION_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      event,
      503,
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const sizeCheck = validateBodySize(event.body, 16);
  if (!sizeCheck.valid) {
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Request body too large' },
      {},
      requestId
    );
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(
      event,
      401,
      { ok: false, error: 'Unauthorized' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const parsed = safeJsonParse(event.body || '{}');
  if (!parsed.ok) {
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Invalid JSON in request body' },
      {},
      requestId
    );
  }

  const body = parsed.data || {};
  const mode = body.mode === 'apply' ? 'apply' : 'preview';

  let teacherId =
    authResult.user &&
    authResult.user.teacherId
      ? authResult.user.teacherId
      : null;

  if (!teacherId) {
    teacherId = await lookupActiveTeacherId();
  }

  if (!teacherId) {
    return jsonResponse(
      event,
      403,
      { ok: false, error: 'Active teacher record not found' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  try {
    const state = await collectTrimState(teacherId);
    const blockedPlans = state.plans.filter(plan => plan.blocked);
    const summary = {
      target_groups: TARGETS.length,
      matched_assignments: state.plans.length,
      assignments_needing_trim:
        state.plans.filter(plan => plan.needsMutation).length,
      already_three_day:
        state.plans.filter(plan => !plan.needsMutation).length,
      blocked_assignments: blockedPlans.length,
      missing_targets: state.missingTargets,
      plans: state.plans.map(publicPlan),
      preview_token: state.token,
    };

    if (mode === 'preview') {
      return jsonResponse(
        event,
        200,
        { ok: true, mode: 'preview', ...summary },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    if (!PRODUCTION_HOSTS.has(requestHost(event))) {
      return jsonResponse(
        event,
        403,
        {
          ok: false,
          error:
            'Apply is disabled outside the production Reinisch Classroom host.',
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    if (body.confirmation !== APPLY_CONFIRMATION) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error: 'Apply confirmation phrase is missing or incorrect',
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    if (
      typeof body.preview_token !== 'string' ||
      body.preview_token !== state.token
    ) {
      return jsonResponse(
        event,
        409,
        {
          ok: false,
          error:
            'Week 2 changed after preview. Run Preview again; nothing was changed.',
          ...summary,
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    if (
      state.missingTargets.length > 0 ||
      blockedPlans.length > 0
    ) {
      return jsonResponse(
        event,
        409,
        {
          ok: false,
          error:
            'Safety preflight blocked the Day 4 trim. Nothing was changed.',
          ...summary,
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    // Students may be actively working on Days 1–3. Re-run the full
    // Day-4-only safety scan immediately before any mutation. Day 1–3
    // autosaves are intentionally ignored by the preview fingerprint.
    const freshState = await collectTrimState(teacherId);

    if (
      freshState.token !== state.token ||
      freshState.missingTargets.length > 0 ||
      freshState.plans.some(plan => plan.blocked)
    ) {
      return jsonResponse(
        event,
        409,
        {
          ok: false,
          error:
            'Day 4 safety state changed after preview. Nothing was changed.',
          preview_token: freshState.token,
          missing_targets: freshState.missingTargets,
          plans: freshState.plans.map(publicPlan),
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const applied = await applyTrim(freshState);

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        mode: 'apply',
        ...applied,
        message:
          'Week 2 Day 4 was removed without updating assignment instances.',
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(
      `[teacher-week2-day4-trim] [${requestId}]`,
      err
    );

    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error: err.message || 'Day 4 trim failed',
        rollback_failures: err.rollbackFailures || [],
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};

exports._test = {
  APPLY_CONFIRMATION,
  PRODUCTION_HOSTS,
  buildPreviewToken,
  requestHost,
  collectTrimState,
  publicPlan,
};
