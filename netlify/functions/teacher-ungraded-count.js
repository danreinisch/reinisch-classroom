// Teacher Review badge count endpoint
// GET /.netlify/functions/teacher-ungraded-count
// Auth: Requires teacher session cookie
// Returns: Count of current-year submissions that actually need teacher review.
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');
const { getOperationalSchoolYear } = require('./_lib/school-year');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

function hasMeaningfulAnswers(submission) {
  const answers = submission && submission.answers;
  return Boolean(
    answers &&
    typeof answers === 'object' &&
    !Array.isArray(answers) &&
    Object.keys(answers).length > 0
  );
}

function submissionTime(submission) {
  const value = new Date(submission?.submitted_at || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function dedupeSubmissionsByInstance(submissions) {
  const byInstance = new Map();

  for (const submission of submissions || []) {
    const instanceId = submission?.instance_id;
    if (!instanceId) continue;

    const existing = byInstance.get(instanceId);
    if (!existing) {
      byInstance.set(instanceId, submission);
      continue;
    }

    const hasAnswers = hasMeaningfulAnswers(submission);
    const existingHasAnswers = hasMeaningfulAnswers(existing);

    if (hasAnswers && !existingHasAnswers) {
      byInstance.set(instanceId, submission);
      continue;
    }
    if (!hasAnswers && existingHasAnswers) continue;

    if (submissionTime(submission) > submissionTime(existing)) {
      byInstance.set(instanceId, submission);
    }
  }

  return [...byInstance.values()];
}

function needsTeacherReview(submission, instance) {
  const reviewStatus = String(submission?.review_status || 'pending').trim().toLowerCase();
  if (reviewStatus !== 'pending' && reviewStatus !== 'in_progress') return false;

  const instanceStatus = String(instance?.status || '').trim().toLowerCase();

  // Resubmit to Student intentionally resets review_status to pending while the
  // student's assignment returns to Assigned / In Progress. That is student-side
  // work, not a teacher Review notification.
  if (
    reviewStatus === 'pending' &&
    (instanceStatus === 'assigned' || instanceStatus === 'in progress')
  ) {
    return false;
  }

  return true;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(event, 503, { ok: false, count: 0 }, { 'Cache-Control': 'no-store' }, requestId);
  }

  if (!SESSION_SECRET) {
    return jsonResponse(event, 500, { ok: false, count: 0 }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(event, 401, { ok: false, count: 0 }, {}, requestId);
  }

  try {
    const operationalYear = getOperationalSchoolYear();

    // First resolve the instructional instances that belong to the active year.
    // We need each instance status so Returned / Resubmitted student work is not
    // mistaken for teacher work waiting in Review.
    const instancesUrl =
      `${SUPABASE_URL}/rest/v1/assignment_instances` +
      `?select=id,status` +
      `&school_year=eq.${encodeURIComponent(operationalYear)}` +
      `&or=(settings->>non_instructional.is.null,settings->>non_instructional.neq.true)`;

    const instancesResp = await fetch(instancesUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Range': '0-9999',
      },
    });

    if (!instancesResp.ok) {
      throw new Error(`Review badge instances query failed: ${instancesResp.status}`);
    }

    const instances = await instancesResp.json();
    const safeInstances = Array.isArray(instances) ? instances : [];
    if (safeInstances.length === 0) {
      return jsonResponse(
        event,
        200,
        { ok: true, count: 0 },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const instanceById = new Map(
      safeInstances
        .filter(instance => instance?.id)
        .map(instance => [String(instance.id), instance])
    );
    const instanceIds = [...instanceById.keys()];

    const submissionsUrl =
      `${SUPABASE_URL}/rest/v1/submissions` +
      `?select=id,instance_id,review_status,submitted_at,answers` +
      `&instance_id=in.(${instanceIds.map(encodeURIComponent).join(',')})` +
      `&order=submitted_at.desc`;

    const submissionsResp = await fetch(submissionsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Range': '0-9999',
      },
    });

    if (!submissionsResp.ok) {
      throw new Error(`Review badge submissions query failed: ${submissionsResp.status}`);
    }

    const submissions = await submissionsResp.json();
    const latestSubmissions = dedupeSubmissionsByInstance(
      Array.isArray(submissions) ? submissions : []
    );

    const count = latestSubmissions.filter(submission => {
      const instance = instanceById.get(String(submission.instance_id));
      return instance && needsTeacherReview(submission, instance);
    }).length;

    return jsonResponse(
      event,
      200,
      { ok: true, count },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-ungraded-count] [${requestId}] Error:`, err);
    return jsonResponse(event, 500, { ok: false, count: 0 }, {}, requestId);
  }
};

// Export pure helpers for focused contract tests without changing the Netlify API.
exports._test = {
  dedupeSubmissionsByInstance,
  needsTeacherReview,
};
