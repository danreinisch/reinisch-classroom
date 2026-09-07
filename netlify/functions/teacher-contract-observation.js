'use strict';

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
  DISPOSITIONS,
  normalizeStudentCode,
  normalizeGoalCode,
  normalizeEventKey,
  normalizeDate,
  getReviewedContract,
  normalizeContractData,
  evaluateSuccess,
  calculateContractValue,
  buildContractObservationNotes,
  parseContractObservationNotes,
  buildContractDispositionNotes,
  parseContractDispositionNotes,
} = require('./_lib/observation-contract-event');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value, max = 4000) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${resource}${query}`, {
    method,
    headers: headers(method === 'GET'
      ? { Accept: 'application/json' }
      : { Prefer: 'return=minimal' }),
    ...(body === null ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`${resource} ${method} failed (${response.status})${details ? `: ${details.slice(0, 300)}` : ''}`);
  }

  if (method === 'GET') {
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }
  return [];
}

function schoolYearFromDate(date) {
  const [yearText, monthText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  return month >= 8 ? year : year - 1;
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

async function resolveAuthorizedClass(studentId, teacherId, preferredClassId) {
  const enrollmentParams = new URLSearchParams({
    select: 'class_id',
    student_id: `eq.${studentId}`,
    active: 'eq.true',
  });
  const enrollments = await rest('class_enrollments', 'GET', enrollmentParams);
  const classIds = [...new Set(enrollments.map(row => row?.class_id).filter(id => UUID_PATTERN.test(id || '')))];
  if (!classIds.length) return null;

  const classParams = new URLSearchParams({
    select: 'id',
    id: `in.(${classIds.join(',')})`,
    teacher_id: `eq.${teacherId}`,
  });
  const owned = await rest('classes', 'GET', classParams);
  const ownedIds = owned.map(row => row?.id).filter(id => UUID_PATTERN.test(id || ''));
  if (preferredClassId && ownedIds.includes(preferredClassId)) return preferredClassId;
  return ownedIds[0] || null;
}

async function resolveGoal(studentId, goalCode) {
  const params = new URLSearchParams({
    select: 'id,code,status,measurement_type',
    student_id: `eq.${studentId}`,
    code: `eq.${goalCode}`,
    active: 'eq.true',
    limit: '1',
  });
  const goal = (await rest('goals', 'GET', params))[0] || null;
  if (!goal) return null;
  const status = text(goal.status, 50).toLowerCase();
  return ['closed', 'archived'].includes(status) ? null : goal;
}

async function authorizeIdentity(authResult, studentCode, goalCode) {
  const teacherId = text(authResult?.user?.teacherId, 100);
  if (!UUID_PATTERN.test(teacherId)) throw new Error('Teacher identity unavailable');

  const student = await resolveStudent(studentCode);
  if (!student?.id) throw new Error('Student is inactive, archived, or not found');

  const classId = await resolveAuthorizedClass(student.id, teacherId, student.class_id);
  if (!classId) throw new Error('Student is not actively enrolled in a teacher-owned class');

  const goal = await resolveGoal(student.id, goalCode);
  if (!goal?.id) throw new Error('Goal is inactive, archived, or does not belong to student');

  const contract = getReviewedContract(goalCode);
  if (!contract) throw new Error('Goal does not have a reviewed Observation Center evidence contract');

  return { teacherId, student, classId, goal, contract };
}

async function readCanonicalRows(studentId, goalId, date) {
  const params = new URLSearchParams({
    select: 'id,value,notes,created_at',
    student_id: `eq.${studentId}`,
    goal_id: `eq.${goalId}`,
    date: `eq.${date}`,
    source: 'eq.manual',
    order: 'created_at.asc,id.asc',
  });
  return rest('goal_progress', 'GET', params);
}

async function readDispositionRows(studentId, goalId, date) {
  const params = new URLSearchParams({
    select: 'id,percent,notes',
    student_id: `eq.${studentId}`,
    goal_id: `eq.${goalId}`,
    date: `eq.${date}`,
    via: 'eq.observation_tray',
    percent: 'is.null',
    order: 'id.asc',
  });
  return rest('progress_entries', 'GET', params);
}

async function deleteByIds(resource, rows) {
  for (const row of rows) {
    if (!row?.id) continue;
    await rest(resource, 'DELETE', new URLSearchParams({ id: `eq.${row.id}` }));
  }
}

async function patchById(resource, id, payload) {
  await rest(resource, 'PATCH', new URLSearchParams({ id: `eq.${id}` }), payload);
}

async function insert(resource, payload) {
  await rest(resource, 'POST', null, payload);
}

function eventRowsForKey(rows, goalCode, eventKey) {
  return rows.filter(row => {
    const parsed = parseContractObservationNotes(row?.notes);
    return parsed?.goal_code === goalCode && parsed?.event_key === eventKey;
  });
}

function dispositionRowsForKey(rows, eventKey) {
  return rows.filter(row => parseContractDispositionNotes(row?.notes)?.event_key === eventKey);
}

async function saveNumericEvent({ identity, studentCode, goalCode, date, eventKey, rawData, classPeriod, noteText, authResult }) {
  const normalized = normalizeContractData(identity.contract, rawData);
  if (!normalized.ok) throw new Error(normalized.error);

  const value = calculateContractValue(identity.contract, normalized.data);
  if (!Number.isFinite(value)) throw new Error('Evidence is incomplete and cannot be saved yet');

  const success = evaluateSuccess(identity.contract, normalized.data);
  const notes = buildContractObservationNotes({
    goalCode,
    eventKey,
    contract: identity.contract,
    data: normalized.data,
    classPeriod,
    noteText,
  });

  const canonical = await readCanonicalRows(identity.student.id, identity.goal.id, date);
  let matching = eventRowsForKey(canonical, goalCode, eventKey);

  // One ordinary reviewed event replaces one earlier legacy observation on the
  // same date when there is no contract event yet. High-frequency contracts
  // never consume a legacy row because each slot is independently addressable.
  if (!matching.length && identity.contract.high_frequency !== true) {
    const legacy = canonical.filter(row =>
      typeof row?.notes === 'string' &&
      row.notes.startsWith('[obs:') &&
      !parseContractObservationNotes(row.notes)
    );
    if (legacy.length === 1) matching = legacy;
  }

  const collectedBy = text(authResult?.user?.username, 150) || 'Teacher';
  const payload = {
    goal_id: identity.goal.id,
    student_id: identity.student.id,
    class_id: identity.classId,
    date,
    value,
    source: 'manual',
    collected_by: collectedBy,
    notes,
    school_year: schoolYearFromDate(date),
  };

  if (matching.length) {
    await patchById('goal_progress', matching[0].id, payload);
    await deleteByIds('goal_progress', matching.slice(1));
  } else {
    await insert('goal_progress', payload);
  }

  const dispositions = await readDispositionRows(identity.student.id, identity.goal.id, date);
  await deleteByIds('progress_entries', dispositionRowsForKey(dispositions, eventKey));

  return { event_key: eventKey, data: normalized.data, value, success, class_period: classPeriod || null };
}

async function saveDisposition({ identity, date, eventKey, disposition, classPeriod, noteText, authResult }) {
  if (!DISPOSITIONS.has(disposition) || !(identity.contract.dispositions || []).includes(disposition)) {
    throw new Error('Disposition is not allowed for this evidence contract');
  }
  if (!text(classPeriod, 120)) {
    throw new Error('Class period is required for Absent / No Opportunity');
  }

  const notes = buildContractDispositionNotes({ disposition, eventKey, classPeriod, noteText });
  if (!notes) throw new Error('Could not build disposition evidence');

  const canonical = await readCanonicalRows(identity.student.id, identity.goal.id, date);
  await deleteByIds('goal_progress', eventRowsForKey(canonical, identity.goal.code, eventKey));

  const rows = await readDispositionRows(identity.student.id, identity.goal.id, date);
  const matching = dispositionRowsForKey(rows, eventKey);
  const payload = {
    student_id: identity.student.id,
    goal_id: identity.goal.id,
    date,
    percent: null,
    method: 'Observation',
    by_name: text(authResult?.user?.username, 150) || 'Teacher',
    via: 'observation_tray',
    notes,
  };

  if (matching.length) {
    await patchById('progress_entries', matching[0].id, payload);
    await deleteByIds('progress_entries', matching.slice(1));
  } else {
    await insert('progress_entries', payload);
  }

  return { event_key: eventKey, disposition, class_period: classPeriod };
}

async function readEvents(identity, goalCode, date) {
  const [canonical, dispositions] = await Promise.all([
    readCanonicalRows(identity.student.id, identity.goal.id, date),
    readDispositionRows(identity.student.id, identity.goal.id, date),
  ]);

  const events = canonical
    .map(row => ({ row, parsed: parseContractObservationNotes(row.notes) }))
    .filter(item => item.parsed?.goal_code === goalCode)
    .map(item => ({
      event_key: item.parsed.event_key,
      data: item.parsed.data || {},
      value: Number(item.row.value),
      success: item.parsed.success ?? null,
      class_period: item.parsed.classPeriod || null,
      note: item.parsed.userNote || '',
    }));

  const dispositionEvents = dispositions
    .map(row => parseContractDispositionNotes(row.notes))
    .filter(Boolean)
    .map(parsed => ({
      event_key: parsed.event_key,
      disposition: parsed.disposition,
      class_period: parsed.classPeriod,
      note: parsed.userNote || '',
    }));

  const legacyPresent = canonical.some(row =>
    typeof row?.notes === 'string' &&
    row.notes.startsWith('[obs:') &&
    !parseContractObservationNotes(row.notes)
  );

  return { events, dispositions: dispositionEvents, legacy_present: legacyPresent };
}

function errorStatus(message) {
  if (/not found|inactive|archived|does not belong/i.test(message)) return 404;
  if (/teacher-owned|Teacher identity/i.test(message)) return 403;
  return 400;
}

exports.handler = async event => {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'POST', 'OPTIONS'], ['Content-Type']);
  }
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }
  if (!SESSION_SECRET) {
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, { 'Cache-Control': 'no-store' }, requestId);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  try {
    let source = event.queryStringParameters || {};
    if (event.httpMethod === 'POST') {
      const sizeError = validateBodySize(event, 32 * 1024);
      if (sizeError) return sizeError;
      const parsed = safeJsonParse(event.body || '');
      if (!parsed.ok) {
        return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, { 'Cache-Control': 'no-store' }, requestId);
      }
      source = parsed.value || {};
    }

    const studentCode = normalizeStudentCode(source.student_code);
    const goalCode = normalizeGoalCode(source.goal_code);
    const date = normalizeDate(source.date);
    const eventKey = normalizeEventKey(source.event_key);

    if (!studentCode || !goalCode || !date || (event.httpMethod === 'POST' && !eventKey)) {
      return jsonResponse(event, 400, { ok: false, error: 'Valid student_code, goal_code, date, and event_key are required' }, { 'Cache-Control': 'no-store' }, requestId);
    }
    if (!goalCode.startsWith(`${studentCode}.`)) {
      return jsonResponse(event, 400, { ok: false, error: 'Goal code does not match student code' }, { 'Cache-Control': 'no-store' }, requestId);
    }

    const identity = await authorizeIdentity(authResult, studentCode, goalCode);

    if (event.httpMethod === 'GET') {
      const state = await readEvents(identity, goalCode, date);
      return jsonResponse(event, 200, { ok: true, contract: identity.contract, ...state }, { 'Cache-Control': 'no-store' }, requestId);
    }

    const action = text(source.action, 30) || 'save';
    const classPeriod = text(source.class_period, 120) || null;
    const noteText = text(source.note, 1000);
    let result;

    if (action === 'save') {
      result = await saveNumericEvent({
        identity,
        studentCode,
        goalCode,
        date,
        eventKey,
        rawData: source.data,
        classPeriod,
        noteText,
        authResult,
      });
    } else if (action === 'disposition') {
      result = await saveDisposition({
        identity,
        date,
        eventKey,
        disposition: text(source.disposition, 40),
        classPeriod,
        noteText,
        authResult,
      });
    } else {
      throw new Error('Unsupported action');
    }

    return jsonResponse(event, 200, { ok: true, result }, { 'Cache-Control': 'no-store' }, requestId);
  } catch (error) {
    console.error(`[teacher-contract-observation] [${requestId}]`, error);
    const message = error?.message || 'Could not save evidence';
    return jsonResponse(event, errorStatus(message), { ok: false, error: message }, { 'Cache-Control': 'no-store' }, requestId);
  }
};
