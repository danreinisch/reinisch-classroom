// Teacher Observation Tray sync endpoint.
// Numeric observations become canonical goal_progress evidence.
// Non-evaluable observations remain event-only progress_entries rows.

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

const {
  url: SUPABASE_URL,
  key: SUPABASE_SERVICE_ROLE_KEY,
} = getSupabaseConfig();

const { SESSION_SECRET } = process.env;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeCode(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function text(value, max = 4000) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
}

function schoolYearFromDate(date) {
  const [yearText, monthText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return null;
  }

  return month >= 8 ? year : year - 1;
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(resource, method = 'GET', params = null, body = null) {
  const query = params ? `?${params.toString()}` : '';
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${resource}${query}`,
    {
      method,
      headers: headers(
        method === 'GET'
          ? { Accept: 'application/json' }
          : { Prefer: 'return=minimal' }
      ),
      ...(body === null ? {} : { body: JSON.stringify(body) }),
    }
  );

  if (!response.ok) {
    throw new Error(`${resource} ${method} failed (${response.status})`);
  }

  if (method === 'GET') {
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  return [];
}

async function resolveStudent(studentCode) {
  const params = new URLSearchParams({
    select: 'id,class_id,active,archived_at',
    code: `eq.${studentCode}`,
    active: 'eq.true',
    archived_at: 'is.null',
    limit: '1',
  });

  return (await rest('students', 'GET', params))[0] || null;
}

async function resolveAuthorizedClass(
  studentId,
  teacherId,
  preferredClassId
) {
  const enrollmentParams = new URLSearchParams({
    select: 'class_id',
    student_id: `eq.${studentId}`,
    active: 'eq.true',
  });

  const enrollments = await rest(
    'class_enrollments',
    'GET',
    enrollmentParams
  );

  const classIds = [
    ...new Set(
      enrollments
        .map(row => row?.class_id)
        .filter(id => UUID_PATTERN.test(id || ''))
    ),
  ];

  if (classIds.length === 0) return null;

  const classParams = new URLSearchParams({
    select: 'id',
    id: `in.(${classIds.join(',')})`,
    teacher_id: `eq.${teacherId}`,
  });

  const ownedClasses = await rest(
    'classes',
    'GET',
    classParams
  );

  const ownedIds = ownedClasses
    .map(row => row?.id)
    .filter(id => UUID_PATTERN.test(id || ''));

  if (
    preferredClassId &&
    ownedIds.includes(preferredClassId)
  ) {
    return preferredClassId;
  }

  return ownedIds[0] || null;
}

async function verifyGoal(goalId, studentId) {
  const params = new URLSearchParams({
    select: 'id,status',
    id: `eq.${goalId}`,
    student_id: `eq.${studentId}`,
    active: 'eq.true',
    limit: '1',
  });

  const goal = (await rest('goals', 'GET', params))[0];

  if (!goal) return false;

  const status = text(goal.status, 50).toLowerCase();

  return status !== 'closed' && status !== 'archived';
}

async function canonicalObservationRows(studentId, goalId, date) {
  const params = new URLSearchParams({
    select: 'id,notes',
    student_id: `eq.${studentId}`,
    goal_id: `eq.${goalId}`,
    date: `eq.${date}`,
    source: 'eq.manual',
  });

  const rows = await rest('goal_progress', 'GET', params);

  return rows.filter(row =>
    typeof row.notes === 'string' &&
    row.notes.startsWith('[obs:')
  );
}

async function legacyObservationRows(studentId, goalId, date) {
  const params = new URLSearchParams({
    select: 'id',
    student_id: `eq.${studentId}`,
    goal_id: `eq.${goalId}`,
    date: `eq.${date}`,
    via: 'eq.observation_tray',
  });

  return rest('progress_entries', 'GET', params);
}

async function deleteRows(resource, rows) {
  for (const row of rows) {
    const params = new URLSearchParams({
      id: `eq.${row.id}`,
    });

    await rest(resource, 'DELETE', params);
  }
}

async function replaceOne(resource, existing, payload) {
  if (existing.length === 0) {
    await rest(resource, 'POST', null, payload);
    return;
  }

  const [first, ...duplicates] = existing;
  const params = new URLSearchParams({
    id: `eq.${first.id}`,
  });

  await rest(resource, 'PATCH', params, payload);
  await deleteRows(resource, duplicates);
}

async function syncEntry(entry, authResult) {
  const studentCode = normalizeCode(entry?.student_code);
  const goalId = text(entry?.goal_id, 100);
  const date = text(entry?.date, 10);

  if (
    !studentCode ||
    !UUID_PATTERN.test(goalId) ||
    !DATE_PATTERN.test(date)
  ) {
    throw new Error('Invalid observation identity or date');
  }

  const schoolYear = schoolYearFromDate(date);

  if (schoolYear === null) {
    throw new Error('Invalid observation date');
  }

  const teacherId = text(
    authResult?.user?.teacherId,
    100
  );

  if (!UUID_PATTERN.test(teacherId)) {
    throw new Error('Teacher identity unavailable');
  }

  const student = await resolveStudent(studentCode);

  if (!student?.id) {
    throw new Error('Student is inactive, archived, or not found');
  }

  const authorizedClassId = await resolveAuthorizedClass(
    student.id,
    teacherId,
    student.class_id
  );

  if (!authorizedClassId) {
    throw new Error(
      'Student is not actively enrolled in a teacher-owned class'
    );
  }

  if (!(await verifyGoal(goalId, student.id))) {
    throw new Error(
      'Goal is inactive, archived, or does not belong to student'
    );
  }

  const canonical = await canonicalObservationRows(
    student.id,
    goalId,
    date
  );

  const legacy = await legacyObservationRows(
    student.id,
    goalId,
    date
  );

  const collectedBy =
    text(entry?.by_name, 150) ||
    text(authResult?.user?.username, 150) ||
    'Teacher';

  const notes = text(entry?.notes);
  const numeric = Number.isFinite(entry?.percent);

  if (numeric) {
    const payload = {
      goal_id: goalId,
      student_id: student.id,
      class_id: authorizedClassId,
      date,
      value: Math.round(entry.percent),
      source: 'manual',
      collected_by: collectedBy,
      notes: notes || null,
      school_year: schoolYear,
    };

    await replaceOne('goal_progress', canonical, payload);
    await deleteRows('progress_entries', legacy);

    return 'canonical';
  }

  // Null is intentionally NOT a score. Remove any earlier numeric
  // observation for this goal/date before storing the event marker.
  await deleteRows('goal_progress', canonical);

  const payload = {
    student_id: student.id,
    goal_id: goalId,
    date,
    percent: null,
    method: text(entry?.method, 100) || 'Observation',
    by_name: collectedBy,
    via: 'observation_tray',
    notes,
  };

  await replaceOne('progress_entries', legacy, payload);

  return 'non_evaluable';
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

  if (!SESSION_SECRET) {
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Server not configured' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      event,
      503,
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const sizeCheck = validateBodySize(event.body, 1);

  if (!sizeCheck.valid) {
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Request body too large' },
      { 'Cache-Control': 'no-store' },
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

  const parsed = safeJsonParse(event.body);

  if (!parsed.ok) {
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Invalid JSON in request body' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const entries = parsed.data?.entries;

  if (!Array.isArray(entries) || entries.length === 0) {
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'entries must be a non-empty array' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  let synced = 0;
  let canonical = 0;
  let nonEvaluable = 0;
  const failed = [];

  for (let index = 0; index < entries.length; index++) {
    try {
      const storage = await syncEntry(entries[index], authResult);

      synced++;

      if (storage === 'canonical') canonical++;
      else nonEvaluable++;
    } catch (error) {
      failed.push({
        index,
        reason: error.message,
      });
    }
  }

  return jsonResponse(
    event,
    200,
    {
      ok: failed.length === 0,
      synced,
      canonical,
      non_evaluable: nonEvaluable,
      failed,
    },
    { 'Cache-Control': 'no-store' },
    requestId
  );
};
