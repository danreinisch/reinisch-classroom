'use strict';

const crypto = require('crypto');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./http');
const { requireTeacher } = require('./auth');
const { getSupabaseConfig } = require('./supa');
const { trimDay4Meta } = require('./week2-day4-trim');
const verifiedCore = require('./teacher-week2-day4-trim-core');
const {
  EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS,
  classifyDynamicPlans,
  isDynamicPreservedPlan,
  summarizeDynamicState,
} = require('./week2-day4-dynamic-preservation');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } =
  getSupabaseConfig();
const { SESSION_SECRET } = process.env;

const APPLY_CONFIRMATION = 'TRIM_WEEK2_DAY4_2026-09-11';
const PRODUCTION_HOSTS = new Set([
  'reinischclassroom.com',
  'www.reinischclassroom.com',
]);

function requestHost(event) {
  const raw = event && event.headers
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

function buildDynamicPreviewToken(plans, missingTargets) {
  const payload = {
    missingTargets: [...(Array.isArray(missingTargets) ? missingTargets : [])].sort(),
    plans: (Array.isArray(plans) ? plans : [])
      .map(plan => ({
        assignmentId: plan.assignmentId,
        preserved: isDynamicPreservedPlan(plan),
        blocked: plan.blocked,
        blockedReasons: [...(Array.isArray(plan.blockedReasons) ? plan.blockedReasons : [])].sort(),
        needsMutation: plan.needsMutation,
        day4MetaCount: plan.day4MetaCount,
        day4ItemIds: [...(Array.isArray(plan.day4ItemIds) ? plan.day4ItemIds : [])].sort(),
        day4ItemRefs: [...(Array.isArray(plan.day4ItemRefs) ? plan.day4ItemRefs : [])].sort(),
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
      .sort((a, b) => String(a.assignmentId).localeCompare(String(b.assignmentId))),
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function collectDynamicState(teacherId) {
  const state = await verifiedCore._test.collectTrimState(teacherId);
  const token = buildDynamicPreviewToken(state.plans, state.missingTargets);
  return { ...state, token };
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

async function applyDynamicTrim(state, teacherId) {
  const classification = classifyDynamicPlans(state.plans);
  if (!classification.initialReady) {
    throw new Error(
      'Apply state is not a safe dynamic Week 2 Day 4 preservation contract'
    );
  }

  const actionable = state.entries.filter(
    entry => entry.plan.needsMutation && !entry.plan.blocked
  );
  const preserved = state.entries.filter(
    entry => isDynamicPreservedPlan(entry.plan)
  );

  if (actionable.length + preserved.length !== EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS) {
    throw new Error(
      `Expected ${EXPECTED_LANGUAGE_ARTS_ASSIGNMENTS} Language Arts assignments across trim + preserve, found ${actionable.length + preserved.length}`
    );
  }

  const patchedEntries = [];

  try {
    for (const entry of actionable) {
      const trimmed = trimDay4Meta(entry.assignment.meta);
      if (!trimmed.changed) {
        throw new Error(
          `Safe assignment ${entry.assignment.id} did not contain Day 4 metadata at apply time`
        );
      }

      await patchJson(
        `assignments?id=eq.${encodeURIComponent(entry.assignment.id)}`,
        { meta: trimmed.meta },
        `Hide Day 4 metadata for assignment ${entry.assignment.id}`
      );
      patchedEntries.push(entry);
    }

    // A student can still have an already-loaded Day 4 page while this repair
    // is running. Re-scan before deleting any scoring items. If new Day-4 work
    // appears during this narrow write window, restore metadata and stop. The
    // next Preview will classify that assignment as another preserve case.
    const postHideState = await collectDynamicState(teacherId);
    const postHideById = new Map(
      postHideState.plans.map(plan => [String(plan.assignmentId), plan])
    );

    const unsafeAfterHide = [];
    for (const entry of actionable) {
      const plan = postHideById.get(String(entry.plan.assignmentId));
      if (!plan || plan.blocked || Number(plan.day4MetaCount) !== 0) {
        unsafeAfterHide.push({
          assignment_id: String(entry.plan.assignmentId),
          blocked_reasons: plan
            ? plan.blockedReasons
            : ['assignment_missing_after_hide'],
          day4_meta_sections: plan ? plan.day4MetaCount : null,
        });
      }
    }

    const postHideClassification = classifyDynamicPlans(postHideState.plans);
    if (
      unsafeAfterHide.length > 0 ||
      postHideState.missingTargets.length > 0 ||
      !postHideClassification.postHideReady
    ) {
      const rollbackFailures = await rollbackMeta(patchedEntries);
      const error = new Error(
        'Day 4 safety state changed after hiding metadata. Metadata was restored; no Day 4 items were deleted.'
      );
      error.rollbackFailures = rollbackFailures;
      error.metaRolledBack = true;
      error.unsafeAfterHide = unsafeAfterHide;
      throw error;
    }

    const itemIds = actionable
      .flatMap(entry => Array.isArray(entry.plan.day4ItemIds)
        ? entry.plan.day4ItemIds
        : [])
      .filter(Boolean);

    if (itemIds.length > 0) {
      await deleteRows(
        `assignment_items?id=in.(${inFilter(itemIds)})`,
        'Delete safe Day 4 assignment items'
      );
    }

    return {
      changed_assignments: actionable.length,
      removed_day4_items: itemIds.length,
      preserved_assignments: preserved.length,
      preserved_titles: preserved.map(entry => entry.plan.title),
      student_assignment_instances_updated: 0,
      already_trimmed: false,
      rollback_failures: [],
    };
  } catch (err) {
    if (!err.metaRolledBack) {
      const rollbackFailures = await rollbackMeta(patchedEntries);
      err.rollbackFailures = rollbackFailures;
    }
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

  const teacherId = String(
    (authResult.user && authResult.user.teacherId) || ''
  ).trim();

  if (!teacherId) {
    return jsonResponse(
      event,
      403,
      { ok: false, error: 'Teacher session is missing teacherId. Sign in again.' },
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

  try {
    const state = await collectDynamicState(teacherId);
    const { summary } = summarizeDynamicState(state, state.token);

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
          error: 'Apply is disabled outside the production Reinisch Classroom host.',
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    if (body.confirmation !== APPLY_CONFIRMATION) {
      return jsonResponse(
        event,
        400,
        { ok: false, error: 'Apply confirmation phrase is missing or incorrect' },
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
          error: 'Week 2 changed after preview. Run Preview again; nothing was changed.',
          ...summary,
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    if (!summary.apply_ready) {
      return jsonResponse(
        event,
        409,
        {
          ok: false,
          error: 'Safety preflight found an unexpected blocker. Nothing was changed.',
          ...summary,
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const freshState = await collectDynamicState(teacherId);
    const { summary: freshSummary } = summarizeDynamicState(
      freshState,
      freshState.token
    );

    if (
      freshState.token !== state.token ||
      !freshSummary.apply_ready
    ) {
      return jsonResponse(
        event,
        409,
        {
          ok: false,
          error: 'Day 4 safety state changed after preview. Nothing was changed.',
          ...freshSummary,
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const applied = await applyDynamicTrim(freshState, teacherId);

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        mode: 'apply',
        ...applied,
        message:
          `Week 2 Day 4 was removed from ${applied.changed_assignments} untouched assignments; ${applied.preserved_assignments} assignment(s) with Day 4 work were preserved and student assignment instances were not updated.`,
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-week2-day4-dynamic] [${requestId}]`, err);
    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error: err.message || 'Day 4 trim failed',
        rollback_failures: err.rollbackFailures || [],
        unsafe_after_hide: err.unsafeAfterHide || [],
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};

exports._test = {
  APPLY_CONFIRMATION,
  PRODUCTION_HOSTS,
  applyDynamicTrim,
  buildDynamicPreviewToken,
  collectDynamicState,
  requestHost,
};
