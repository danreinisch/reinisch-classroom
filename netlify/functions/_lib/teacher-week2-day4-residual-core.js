'use strict';

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./http');
const { requireTeacher } = require('./auth');
const { getSupabaseConfig } = require('./supa');
const dynamicCore = require('./teacher-week2-day4-dynamic-core');
const {
  classifyDynamicPlans,
  summarizeDynamicState,
} = require('./week2-day4-dynamic-preservation');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } =
  getSupabaseConfig();
const { SESSION_SECRET } = process.env;

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

function assessResidualCleanup(state) {
  const classification = classifyDynamicPlans(state && state.plans);
  const missingTargets = Array.isArray(state && state.missingTargets)
    ? state.missingTargets
    : [];

  const residualPlans = classification.safeTrimPlans.filter(
    plan =>
      Number(plan.day4MetaCount) === 0 &&
      Number(plan.day4ItemCount) > 0 &&
      Array.isArray(plan.day4ItemIds) &&
      plan.day4ItemIds.length > 0
  );

  const residualReady = (
    missingTargets.length === 0 &&
    classification.initialReady === false &&
    classification.postHideReady === true &&
    classification.completedReady === false &&
    classification.unexpectedBlockedPlans.length === 0 &&
    classification.safeTrimPlans.length > 0 &&
    residualPlans.length === classification.safeTrimPlans.length
  );

  return {
    classification,
    missingTargets,
    residualPlans,
    residualReady,
  };
}

function residualSummary(state) {
  const assessment = assessResidualCleanup(state);
  const base = summarizeDynamicState(
    state,
    state && state.token
  ).summary;

  return {
    assessment,
    summary: {
      ...base,
      apply_ready: assessment.residualReady,
      residual_cleanup_ready: assessment.residualReady,
      residual_cleanup_assignments: assessment.residualPlans.length,
      residual_cleanup_items: assessment.residualPlans.reduce(
        (sum, plan) => sum + Number(plan.day4ItemCount || 0),
        0
      ),
    },
  };
}

function currentResidualEntries(state) {
  const assessment = assessResidualCleanup(state);
  if (!assessment.residualReady) return [];

  const residualIds = new Set(
    assessment.residualPlans.map(plan => String(plan.assignmentId))
  );

  return (Array.isArray(state && state.entries) ? state.entries : [])
    .filter(entry => residualIds.has(String(entry && entry.plan && entry.plan.assignmentId)));
}

function currentResidualItemIds(state) {
  const ids = currentResidualEntries(state)
    .flatMap(entry => Array.isArray(entry.plan.day4ItemIds)
      ? entry.plan.day4ItemIds
      : [])
    .filter(Boolean)
    .map(String);
  return [...new Set(ids)];
}

async function collectState(teacherId) {
  return dynamicCore._test.collectDynamicState(teacherId);
}

async function applyResidualCleanup(state, teacherId) {
  let current = state;
  let assessment = assessResidualCleanup(current);

  if (!assessment.residualReady) {
    throw new Error('Residual Day 4 cleanup state is not safe');
  }

  // Re-read immediately before deletion. If an untouched residual assignment
  // gains genuine Day-4 work during the request, the dynamic classifier turns
  // it into a preserve case and it automatically drops out of the delete set.
  current = await collectState(teacherId);
  assessment = assessResidualCleanup(current);

  if (assessment.classification.completedReady) {
    return {
      changed_assignments: 0,
      removed_day4_items: 0,
      preserved_assignments: assessment.classification.preservedPlans.length,
      student_assignment_instances_updated: 0,
      residual_cleanup: true,
      already_clean: true,
    };
  }

  if (!assessment.residualReady) {
    throw new Error(
      'Residual Day 4 safety state changed before cleanup. Nothing was deleted.'
    );
  }

  // One final stable read narrows the race window and, critically, supplies
  // the item IDs that exist NOW rather than reusing the pre-hide snapshot.
  const preDeleteState = await collectState(teacherId);
  const preDeleteAssessment = assessResidualCleanup(preDeleteState);

  if (preDeleteAssessment.classification.completedReady) {
    return {
      changed_assignments: 0,
      removed_day4_items: 0,
      preserved_assignments:
        preDeleteAssessment.classification.preservedPlans.length,
      student_assignment_instances_updated: 0,
      residual_cleanup: true,
      already_clean: true,
    };
  }

  if (!preDeleteAssessment.residualReady) {
    throw new Error(
      'Residual Day 4 safety state changed during cleanup preflight. Nothing was deleted.'
    );
  }

  const itemIds = currentResidualItemIds(preDeleteState);
  if (itemIds.length === 0) {
    throw new Error(
      'Residual cleanup found no current Day 4 item IDs to delete'
    );
  }

  const cleanedAssignmentCount = currentResidualEntries(preDeleteState).length;

  await deleteRows(
    `assignment_items?id=in.(${inFilter(itemIds)})`,
    'Delete residual safe Day 4 assignment items'
  );

  const finalState = await collectState(teacherId);
  const finalAssessment = assessResidualCleanup(finalState);

  return {
    changed_assignments: cleanedAssignmentCount,
    removed_day4_items: itemIds.length,
    preserved_assignments:
      finalAssessment.classification.preservedPlans.length,
    student_assignment_instances_updated: 0,
    residual_cleanup: true,
    already_clean: false,
    completed_state: finalAssessment.classification.completedReady,
    residual_assignments_remaining:
      finalAssessment.classification.safeTrimPlans.length,
  };
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(
      event,
      ['POST', 'OPTIONS'],
      ['Content-Type']
    );
  }

  if (event.httpMethod !== 'POST') {
    return dynamicCore.handler(event);
  }

  const requestId = generateRequestId();

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
    const state = await collectState(teacherId);
    const { assessment, summary } = residualSummary(state);

    if (!assessment.residualReady) {
      return dynamicCore.handler(event);
    }

    if (mode === 'preview') {
      return jsonResponse(
        event,
        200,
        { ok: true, mode: 'preview', ...summary },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    if (!dynamicCore._test.PRODUCTION_HOSTS.has(
      dynamicCore._test.requestHost(event)
    )) {
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

    if (body.confirmation !== dynamicCore._test.APPLY_CONFIRMATION) {
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
          error: 'Residual Day 4 state changed after preview. Run Preview again; nothing was deleted.',
          ...summary,
        },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const applied = await applyResidualCleanup(state, teacherId);

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        mode: 'apply',
        ...applied,
        message:
          `Residual Day 4 scoring items were removed from ${applied.changed_assignments} untouched assignment(s); student assignment instances were not updated.`,
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-week2-day4-residual] [${requestId}]`, err);
    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error: err.message || 'Residual Day 4 cleanup failed',
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};

exports._test = {
  applyResidualCleanup,
  assessResidualCleanup,
  currentResidualEntries,
  currentResidualItemIds,
  residualSummary,
};
