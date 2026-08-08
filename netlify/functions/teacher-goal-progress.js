// Teacher goal-progress server boundary
// POST /.netlify/functions/teacher-goal-progress
//
// Auth: signed teacher/admin session cookie.
//
// Actions:
//   list
//   insert
//   insert_batch
//   quarter_averages

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const {
  requireTeacher,
} = require('./_lib/auth');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  url: SUPABASE_URL,
  key: SUPABASE_SERVICE_ROLE_KEY,
} = getSupabaseConfig();

const {
  SESSION_SECRET,
} = process.env;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

function normalizeCode(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function normalizeString(value, maxLength = 200) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeList(
  value,
  {
    uppercase = false,
    maxItems = 200,
    maxLength = 200,
  } = {},
) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item =>
      uppercase
        ? item.toUpperCase()
        : item
    )
    .map(item => item.slice(0, maxLength));

  return [
    ...new Set(normalized),
  ].slice(0, maxItems);
}

function quotePostgrestValue(value) {
  return (
    '"' +
    String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"') +
    '"'
  );
}

function inFilter(values) {
  return (
    'in.(' +
    values
      .map(quotePostgrestValue)
      .join(',') +
    ')'
  );
}

function schoolParts(date = new Date()) {
  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    ).formatToParts(date);

  return Object.fromEntries(
    parts.map(part => [
      part.type,
      part.value,
    ]),
  );
}

function currentSchoolDate() {
  const parts = schoolParts();

  return (
    `${parts.year}-` +
    `${parts.month}-` +
    `${parts.day}`
  );
}

function schoolYearFromDate(dateValue) {
  if (
    typeof dateValue !== 'string' ||
    !DATE_PATTERN.test(dateValue)
  ) {
    const parts = schoolParts();
    const year = Number(parts.year);
    const month = Number(parts.month);

    return month >= 8
      ? year
      : year - 1;
  }

  const [
    yearText,
    monthText,
  ] = dateValue.split('-');

  const year = Number(yearText);
  const month = Number(monthText);

  return month >= 8
    ? year
    : year - 1;
}

async function supaFetch(path, init = {}) {
  const response = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...init,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization:
          `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    },
  );

  const text = await response.text();

  let data = null;

  try {
    data = text
      ? JSON.parse(text)
      : null;
  } catch (_) {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function responseText(result) {
  if (typeof result?.data === 'string') {
    return result.data.toLowerCase();
  }

  try {
    return JSON
      .stringify(result?.data || {})
      .toLowerCase();
  } catch (_) {
    return '';
  }
}

function isMissingNotesColumn(result) {
  const text = responseText(result);

  return (
    text.includes('notes') &&
    (
      text.includes('column') ||
      text.includes('schema cache') ||
      text.includes('pgrst204') ||
      text.includes('42703')
    )
  );
}

async function getRows(
  resource,
  params,
) {
  const query =
    params instanceof URLSearchParams
      ? params.toString()
      : String(params || '');

  const response =
    await supaFetch(
      `/rest/v1/${resource}` +
      (query ? `?${query}` : ''),
    );

  if (!response.ok) {
    throw new Error(
      `${resource} query failed with status ` +
      `${response.status}`,
    );
  }

  return Array.isArray(response.data)
    ? response.data
    : [];
}

async function getRowsByIds(
  resource,
  select,
  ids,
) {
  const uniqueIds = [
    ...new Set(
      ids.filter(
        id =>
          typeof id === 'string' &&
          UUID_PATTERN.test(id),
      ),
    ),
  ];

  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = [];

  for (
    let index = 0;
    index < uniqueIds.length;
    index += 150
  ) {
    const chunk =
      uniqueIds.slice(
        index,
        index + 150,
      );

    const params =
      new URLSearchParams();

    params.set(
      'select',
      select,
    );

    params.set(
      'id',
      inFilter(chunk),
    );

    rows.push(
      ...(
        await getRows(
          resource,
          params,
        )
      ),
    );
  }

  return rows;
}

async function resolveFilterRows({
  studentCodes,
  goalCodes,
  classCodes,
  goalAreas,
}) {
  let students = [];
  let goals = [];
  let classes = [];

  if (studentCodes.length > 0) {
    const params =
      new URLSearchParams();

    params.set(
      'select',
      'id,code,name,class_id',
    );

    params.set(
      'code',
      inFilter(studentCodes),
    );

    students =
      await getRows(
        'students',
        params,
      );
  }

  if (
    goalCodes.length > 0 ||
    goalAreas.length > 0
  ) {
    const params =
      new URLSearchParams();

    params.set(
      'select',
      'id,code,desc,goal_area,student_id',
    );

    if (goalCodes.length > 0) {
      params.set(
        'code',
        inFilter(goalCodes),
      );
    }

    if (goalAreas.length > 0) {
      params.set(
        'goal_area',
        inFilter(goalAreas),
      );
    }

    goals =
      await getRows(
        'goals',
        params,
      );
  }

  if (classCodes.length > 0) {
    const params =
      new URLSearchParams();

    params.set(
      'select',
      'id,code,name',
    );

    params.set(
      'name',
      inFilter(classCodes),
    );

    classes =
      await getRows(
        'classes',
        params,
      );
  }

  return {
    students,
    goals,
    classes,
  };
}

async function listProgress(body) {
  const studentCodes =
    normalizeList(
      body.student_codes,
      {
        uppercase: true,
        maxLength: 50,
      },
    );

  const goalCodes =
    normalizeList(
      body.goal_codes,
      {
        uppercase: true,
        maxLength: 80,
      },
    );

  const classCodes =
    normalizeList(
      body.class_codes,
      {
        maxLength: 150,
      },
    );

  const goalAreas =
    normalizeList(
      body.goal_areas,
      {
        maxLength: 150,
      },
    );

  const startDate =
    normalizeString(
      body.start_date,
      10,
    );

  const endDate =
    normalizeString(
      body.end_date,
      10,
    );

  if (
    startDate &&
    !DATE_PATTERN.test(startDate)
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'Invalid start_date',
      },
    };
  }

  if (
    endDate &&
    !DATE_PATTERN.test(endDate)
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'Invalid end_date',
      },
    };
  }

  const includeAllYears =
    body.include_all_years === true;

  const requestedYear =
    Number.isInteger(body.school_year)
      ? body.school_year
      : schoolYearFromDate();

  const parsedLimit =
    Number.parseInt(
      body.limit,
      10,
    );

  const limit =
    Number.isFinite(parsedLimit)
      ? Math.min(
          Math.max(parsedLimit, 1),
          10000,
        )
      : 5000;

  const filterRows =
    await resolveFilterRows({
      studentCodes,
      goalCodes,
      classCodes,
      goalAreas,
    });

  if (
    studentCodes.length > 0 &&
    filterRows.students.length === 0
  ) {
    return {
      status: 200,
      body: {
        ok: true,
        progress: [],
      },
    };
  }

  if (
    (
      goalCodes.length > 0 ||
      goalAreas.length > 0
    ) &&
    filterRows.goals.length === 0
  ) {
    return {
      status: 200,
      body: {
        ok: true,
        progress: [],
      },
    };
  }

  if (
    classCodes.length > 0 &&
    filterRows.classes.length === 0
  ) {
    return {
      status: 200,
      body: {
        ok: true,
        progress: [],
      },
    };
  }

  const params =
    new URLSearchParams();

  params.set(
    'select',
    [
      'id',
      'date',
      'value',
      'source',
      'collected_by',
      'notes',
      'created_at',
      'assignment_instance_id',
      'goal_id',
      'student_id',
      'class_id',
      'school_year',
    ].join(','),
  );

  if (!includeAllYears) {
    params.set(
      'or',
      (
        `(school_year.eq.${requestedYear},` +
        'school_year.is.null)'
      ),
    );
  }

  if (startDate) {
    params.set(
      'date',
      `gte.${startDate}`,
    );
  }

  if (endDate) {
    params.append(
      'date',
      `lte.${endDate}`,
    );
  }

  if (filterRows.students.length > 0) {
    params.set(
      'student_id',
      inFilter(
        filterRows.students.map(
          row => row.id,
        ),
      ),
    );
  }

  if (filterRows.goals.length > 0) {
    params.set(
      'goal_id',
      inFilter(
        filterRows.goals.map(
          row => row.id,
        ),
      ),
    );
  }

  if (filterRows.classes.length > 0) {
    params.set(
      'class_id',
      inFilter(
        filterRows.classes.map(
          row => row.id,
        ),
      ),
    );
  }

  params.set(
    'order',
    body.sort_desc === true
      ? 'date.desc,created_at.desc'
      : 'date.asc,created_at.asc',
  );

  params.set(
    'limit',
    String(limit),
  );

  let progressResponse =
    await supaFetch(
      `/rest/v1/goal_progress?` +
      params.toString(),
    );

  let notesSupported = true;

  if (
    !progressResponse.ok &&
    isMissingNotesColumn(
      progressResponse,
    )
  ) {
    notesSupported = false;

    params.set(
      'select',
      [
        'id',
        'date',
        'value',
        'source',
        'collected_by',
        'created_at',
        'assignment_instance_id',
        'goal_id',
        'student_id',
        'class_id',
        'school_year',
      ].join(','),
    );

    progressResponse =
      await supaFetch(
        `/rest/v1/goal_progress?` +
        params.toString(),
      );
  }

  if (!progressResponse.ok) {
    throw new Error(
      'goal_progress query failed with status ' +
      progressResponse.status,
    );
  }

  const progress =
    Array.isArray(progressResponse.data)
      ? progressResponse.data
      : [];

  const [
    students,
    goals,
    classes,
  ] = await Promise.all([
    getRowsByIds(
      'students',
      'id,code,name,class_id',
      progress.map(row => row.student_id),
    ),
    getRowsByIds(
      'goals',
      'id,code,desc,goal_area,student_id',
      progress.map(row => row.goal_id),
    ),
    getRowsByIds(
      'classes',
      'id,code,name',
      progress.map(row => row.class_id),
    ),
  ]);

  const studentById =
    new Map(
      students.map(row => [
        row.id,
        row,
      ]),
    );

  const goalById =
    new Map(
      goals.map(row => [
        row.id,
        row,
      ]),
    );

  const classById =
    new Map(
      classes.map(row => [
        row.id,
        row,
      ]),
    );

  const flattened =
    progress
      .map(row => {
        const student =
          studentById.get(
            row.student_id,
          );

        const goal =
          goalById.get(
            row.goal_id,
          );

        const classRow =
          classById.get(
            row.class_id,
          );

        return {
          id: row.id,
          date: row.date,
          value: row.value,
          source: row.source,
          collected_by: row.collected_by,
          notes:
            notesSupported
              ? row.notes || null
              : null,
          created_at: row.created_at,
          assignment_instance_id:
            row.assignment_instance_id,
          school_year: row.school_year,
          goal_id: row.goal_id,
          goal_code: goal?.code || '',
          goal_desc: goal?.desc || '',
          goal_area:
            goal?.goal_area ||
            'Uncategorized',
          student_id: row.student_id,
          student_code:
            student?.code || '',
          student_name:
            student?.name ||
            student?.code ||
            '',
          class_id: row.class_id,
          class_code:
            classRow?.name ||
            classRow?.code ||
            null,
        };
      })
      .filter(row =>
        (
          studentCodes.length === 0 ||
          studentCodes.includes(
            row.student_code,
          )
        ) &&
        (
          goalCodes.length === 0 ||
          goalCodes.includes(
            row.goal_code,
          )
        ) &&
        (
          classCodes.length === 0 ||
          classCodes.includes(
            row.class_code,
          )
        ) &&
        (
          goalAreas.length === 0 ||
          goalAreas.includes(
            row.goal_area,
          )
        )
      );

  return {
    status: 200,
    body: {
      ok: true,
      progress: flattened,
      notes_supported: notesSupported,
    },
  };
}

async function findStudent(
  studentCode,
) {
  const params =
    new URLSearchParams();

  params.set(
    'select',
    'id,code,name,class_id,active,archived_at',
  );

  params.set(
    'code',
    `eq.${studentCode}`,
  );

  params.set(
    'active',
    'eq.true',
  );

  params.set(
    'archived_at',
    'is.null',
  );

  params.set(
    'limit',
    '1',
  );

  const rows =
    await getRows(
      'students',
      params,
    );

  return rows[0] || null;
}

async function findActiveStudentById(
  studentId,
) {
  if (!UUID_PATTERN.test(studentId || '')) {
    return null;
  }

  const params =
    new URLSearchParams();

  params.set(
    'select',
    'id,code,name,class_id,active,archived_at',
  );

  params.set(
    'id',
    `eq.${studentId}`,
  );

  params.set(
    'active',
    'eq.true',
  );

  params.set(
    'archived_at',
    'is.null',
  );

  params.set(
    'limit',
    '1',
  );

  const rows =
    await getRows(
      'students',
      params,
    );

  return rows[0] || null;
}

async function findGoal(
  studentId,
  goalCode,
) {
  const params =
    new URLSearchParams();

  params.set(
    'select',
    'id,code,student_id,status,active',
  );

  params.set(
    'student_id',
    `eq.${studentId}`,
  );

  params.set(
    'code',
    `eq.${goalCode}`,
  );

  params.set(
    'active',
    'eq.true',
  );

  params.set(
    'limit',
    '1',
  );

  const rows =
    await getRows(
      'goals',
      params,
    );

  const goal =
    rows[0] || null;

  if (!goal) {
    return null;
  }

  const status =
    (
      normalizeString(
        goal.status,
        50,
      ) || ''
    ).toLowerCase();

  if (
    status === 'closed' ||
    status === 'archived'
  ) {
    return null;
  }

  return goal;
}

function classMatchesCode(
  classRow,
  classCode,
) {
  const requested =
    normalizeString(
      classCode,
      150,
    );

  if (!requested) {
    return false;
  }

  const needle =
    requested.toLowerCase();

  return [
    classRow?.code,
    classRow?.name,
  ].some(value => {
    const normalized =
      normalizeString(
        value,
        150,
      );

    return (
      normalized &&
      normalized.toLowerCase() ===
        needle
    );
  });
}

async function ownedEnrollmentClasses(
  studentId,
  teacherId,
) {
  if (
    !UUID_PATTERN.test(studentId || '') ||
    !UUID_PATTERN.test(teacherId || '')
  ) {
    return [];
  }

  const enrollmentParams =
    new URLSearchParams();

  enrollmentParams.set(
    'select',
    'class_id',
  );

  enrollmentParams.set(
    'student_id',
    `eq.${studentId}`,
  );

  enrollmentParams.set(
    'active',
    'eq.true',
  );

  const enrollments =
    await getRows(
      'class_enrollments',
      enrollmentParams,
    );

  const classIds = [
    ...new Set(
      enrollments
        .map(row => row?.class_id)
        .filter(id =>
          UUID_PATTERN.test(id || '')
        ),
    ),
  ];

  if (classIds.length === 0) {
    return [];
  }

  const classParams =
    new URLSearchParams();

  classParams.set(
    'select',
    'id,code,name,teacher_id',
  );

  classParams.set(
    'id',
    inFilter(classIds),
  );

  classParams.set(
    'teacher_id',
    `eq.${teacherId}`,
  );

  const classes =
    await getRows(
      'classes',
      classParams,
    );

  return classes.filter(row =>
    UUID_PATTERN.test(row?.id || '')
  );
}

async function resolveAuthorizedClassId(
  studentId,
  teacherId,
  defaultClassId,
  classCode,
) {
  const ownedClasses =
    await ownedEnrollmentClasses(
      studentId,
      teacherId,
    );

  if (ownedClasses.length === 0) {
    return null;
  }

  if (classCode) {
    const requestedClass =
      ownedClasses.find(row =>
        classMatchesCode(
          row,
          classCode,
        )
      );

    return requestedClass?.id || null;
  }

  if (
    defaultClassId &&
    ownedClasses.some(
      row =>
        row.id === defaultClassId
    )
  ) {
    return defaultClassId;
  }

  return ownedClasses[0]?.id || null;
}

async function resolveAuthorizedInstance(
  instanceId,
  studentId,
  teacherId,
) {
  if (!instanceId) {
    return {
      ok: true,
      classId: null,
    };
  }

  if (
    !UUID_PATTERN.test(instanceId) ||
    !UUID_PATTERN.test(studentId || '') ||
    !UUID_PATTERN.test(teacherId || '')
  ) {
    return {
      ok: false,
      classId: null,
    };
  }

  const instanceParams =
    new URLSearchParams();

  instanceParams.set(
    'select',
    'id,student_id,assignment_id',
  );

  instanceParams.set(
    'id',
    `eq.${instanceId}`,
  );

  instanceParams.set(
    'limit',
    '1',
  );

  const instances =
    await getRows(
      'assignment_instances',
      instanceParams,
    );

  const instance =
    instances[0] || null;

  if (
    !instance ||
    instance.student_id !== studentId ||
    instance.assignment_id === null ||
    instance.assignment_id === undefined
  ) {
    return {
      ok: false,
      classId: null,
    };
  }

  const assignmentParams =
    new URLSearchParams();

  assignmentParams.set(
    'select',
    'id,class_id',
  );

  assignmentParams.set(
    'id',
    `eq.${String(
      instance.assignment_id
    ).trim()}`,
  );

  assignmentParams.set(
    'limit',
    '1',
  );

  const assignments =
    await getRows(
      'assignments',
      assignmentParams,
    );

  const assignment =
    assignments[0] || null;

  if (
    !assignment ||
    !UUID_PATTERN.test(
      assignment.class_id || ''
    )
  ) {
    return {
      ok: false,
      classId: null,
    };
  }

  const classParams =
    new URLSearchParams();

  classParams.set(
    'select',
    'id,teacher_id',
  );

  classParams.set(
    'id',
    `eq.${assignment.class_id}`,
  );

  classParams.set(
    'teacher_id',
    `eq.${teacherId}`,
  );

  classParams.set(
    'limit',
    '1',
  );

  const classes =
    await getRows(
      'classes',
      classParams,
    );

  if (
    classes.length !== 1 ||
    classes[0].id !==
      assignment.class_id
  ) {
    return {
      ok: false,
      classId: null,
    };
  }

  return {
    ok: true,
    classId:
      assignment.class_id,
  };
}

async function insertRows(
  rows,
  {
    allowNotesRetry = false,
  } = {},
) {
  let response =
    await supaFetch(
      '/rest/v1/goal_progress',
      {
        method: 'POST',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify(rows),
      },
    );

  let notesPersisted = true;

  if (
    !response.ok &&
    allowNotesRetry &&
    isMissingNotesColumn(response)
  ) {
    notesPersisted = false;

    const withoutNotes =
      rows.map(row => {
        const copy = {
          ...row,
        };

        delete copy.notes;

        return copy;
      });

    response =
      await supaFetch(
        '/rest/v1/goal_progress',
        {
          method: 'POST',
          headers: {
            Prefer: 'return=representation',
          },
          body: JSON.stringify(
            withoutNotes,
          ),
        },
      );
  }

  if (!response.ok) {
    throw new Error(
      'goal_progress insert failed with status ' +
      response.status,
    );
  }

  return {
    rows:
      Array.isArray(response.data)
        ? response.data
        : [],
    notesPersisted,
  };
}

async function insertProgress(
  body,
  rawTeacherId,
) {
  const teacherId =
    normalizeString(
      rawTeacherId,
      50,
    );

  if (
    !teacherId ||
    !UUID_PATTERN.test(teacherId)
  ) {
    return {
      status: 403,
      body: {
        ok: false,
        error:
          'Teacher write context unavailable',
      },
    };
  }

  const studentCode =
    normalizeCode(
      body.student_code,
    );

  const goalCode =
    normalizeCode(
      body.goal_code,
    );

  const date =
    normalizeString(
      body.date,
      10,
    );

  const rawValue =
    body.value;

  const hasNumericValue =
    rawValue !== null &&
    rawValue !== undefined &&
    !(
      typeof rawValue === 'string' &&
      rawValue.trim() === ''
    );

  const numericValue =
    hasNumericValue
      ? Number(rawValue)
      : Number.NaN;

  if (
    !studentCode ||
    !goalCode ||
    !date ||
    !DATE_PATTERN.test(date)
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error:
          'student_code, goal_code, and valid date are required',
      },
    };
  }

  if (!Number.isFinite(numericValue)) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'value must be numeric',
      },
    };
  }

  const student =
    await findStudent(
      studentCode,
    );

  if (!student) {
    return {
      status: 404,
      body: {
        ok: false,
        error: 'Student not found',
      },
    };
  }

  const goal =
    await findGoal(
      student.id,
      goalCode,
    );

  if (!goal) {
    return {
      status: 404,
      body: {
        ok: false,
        error:
          'Goal not found for student',
      },
    };
  }

  const assignmentInstanceId =
    normalizeString(
      body.assignment_instance_id,
      50,
    );

  const instanceAuthorization =
    await resolveAuthorizedInstance(
      assignmentInstanceId,
      student.id,
      teacherId,
    );

  if (!instanceAuthorization.ok) {
    return {
      status: 403,
      body: {
        ok: false,
        error:
          'Write target unavailable',
      },
    };
  }

  const classCode =
    normalizeString(
      body.class_code,
      150,
    );

  let classId = null;

  if (instanceAuthorization.classId) {
    const ownedClasses =
      await ownedEnrollmentClasses(
        student.id,
        teacherId,
      );

    const instanceClass =
      ownedClasses.find(
        row =>
          row.id ===
            instanceAuthorization.classId
      );

    if (
      !instanceClass ||
      (
        classCode &&
        !classMatchesCode(
          instanceClass,
          classCode,
        )
      )
    ) {
      return {
        status: 403,
        body: {
          ok: false,
          error:
            'Write target unavailable',
        },
      };
    }

    classId =
      instanceClass.id;
  } else {
    classId =
      await resolveAuthorizedClassId(
        student.id,
        teacherId,
        student.class_id,
        classCode,
      );
  }

  if (!classId) {
    return {
      status: 403,
      body: {
        ok: false,
        error:
          'Write target unavailable',
      },
    };
  }

  const source =
    normalizeString(
      body.source,
      40,
    ) || 'manual';

  const payload = {
    goal_id: goal.id,
    student_id: student.id,
    class_id: classId,
    date,
    value: numericValue,
    source,
    collected_by:
      normalizeString(
        body.collected_by,
        150,
      ),
    assignment_instance_id:
      assignmentInstanceId || null,
    school_year:
      schoolYearFromDate(date),
  };

  const notes =
    normalizeString(
      body.notes,
      4000,
    );

  if (notes) {
    payload.notes = notes;
  }

  const inserted =
    await insertRows(
      [payload],
      {
        allowNotesRetry: true,
      },
    );

  return {
    status: 200,
    body: {
      ok: true,
      progress:
        inserted.rows[0] || payload,
      notes_persisted:
        inserted.notesPersisted,
    },
  };
}

async function insertBatch(
  body,
  rawTeacherId,
) {
  const teacherId =
    normalizeString(
      rawTeacherId,
      50,
    );

  const studentId =
    normalizeString(
      body.student_id,
      50,
    );

  const assignmentInstanceId =
    normalizeString(
      body.assignment_instance_id,
      50,
    );

  const goalRollups =
    Array.isArray(body.goal_rollups)
      ? body.goal_rollups.slice(0, 100)
      : [];

  if (
    !teacherId ||
    !UUID_PATTERN.test(teacherId) ||
    !studentId ||
    !UUID_PATTERN.test(studentId) ||
    !assignmentInstanceId ||
    !UUID_PATTERN.test(
      assignmentInstanceId,
    ) ||
    goalRollups.length === 0
  ) {
    return {
      status:
        teacherId &&
        UUID_PATTERN.test(teacherId)
          ? 400
          : 403,
      body: {
        ok: false,
        error:
          teacherId &&
          UUID_PATTERN.test(teacherId)
            ? 'student_id, assignment_instance_id, and goal_rollups are required'
            : 'Teacher write context unavailable',
      },
    };
  }

  const student =
    await findActiveStudentById(
      studentId,
    );

  if (!student) {
    return {
      status: 404,
      body: {
        ok: false,
        error: 'Student not found',
      },
    };
  }

  const instanceAuthorization =
    await resolveAuthorizedInstance(
      assignmentInstanceId,
      studentId,
      teacherId,
    );

  if (
    !instanceAuthorization.ok ||
    !instanceAuthorization.classId
  ) {
    return {
      status: 403,
      body: {
        ok: false,
        error:
          'Write target unavailable',
      },
    };
  }

  const ownedClasses =
    await ownedEnrollmentClasses(
      studentId,
      teacherId,
    );

  if (
    !ownedClasses.some(
      row =>
        row.id ===
          instanceAuthorization.classId
    )
  ) {
    return {
      status: 403,
      body: {
        ok: false,
        error:
          'Write target unavailable',
      },
    };
  }

  const normalizedRollups =
    goalRollups
      .map(rollup => ({
        goal_code:
          normalizeCode(
            rollup?.goal_code,
          ),
        value:
          Number(
            rollup?.percent_correct,
          ),
      }))
      .filter(rollup =>
        rollup.goal_code &&
        Number.isFinite(rollup.value) &&
        rollup.value >= 0 &&
        rollup.value <= 100
      );

  if (normalizedRollups.length === 0) {
    return {
      status: 200,
      body: {
        ok: true,
        inserted_count: 0,
        skipped_count:
          goalRollups.length,
      },
    };
  }

  const params =
    new URLSearchParams();

  params.set(
    'select',
    'id,code,student_id,status,active',
  );

  params.set(
    'student_id',
    `eq.${studentId}`,
  );

  params.set(
    'code',
    inFilter(
      normalizedRollups.map(
        rollup =>
          rollup.goal_code,
      ),
    ),
  );

  params.set(
    'active',
    'eq.true',
  );

  const goals =
    await getRows(
      'goals',
      params,
    );

  const activeGoals =
    goals.filter(goal => {
      const status =
        (
          normalizeString(
            goal?.status,
            50,
          ) || ''
        ).toLowerCase();

      return (
        status !== 'closed' &&
        status !== 'archived'
      );
    });

  const goalByCode =
    new Map(
      activeGoals.map(goal => [
        goal.code,
        goal,
      ]),
    );

  const date =
    currentSchoolDate();

  const rows =
    normalizedRollups
      .map(rollup => {
        const goal =
          goalByCode.get(
            rollup.goal_code,
          );

        if (!goal) {
          return null;
        }

        return {
          goal_id: goal.id,
          student_id: studentId,
          class_id:
            instanceAuthorization.classId,
          assignment_instance_id:
            assignmentInstanceId,
          date,
          value: rollup.value,
          source: 'assignment',
          collected_by: 'system',
          school_year:
            schoolYearFromDate(date),
        };
      })
      .filter(Boolean);

  if (rows.length === 0) {
    return {
      status: 200,
      body: {
        ok: true,
        inserted_count: 0,
        skipped_count:
          goalRollups.length,
      },
    };
  }

  const inserted =
    await insertRows(rows);

  return {
    status: 200,
    body: {
      ok: true,
      inserted_count:
        inserted.rows.length ||
        rows.length,
      skipped_count:
        goalRollups.length -
        rows.length,
    },
  };
}

async function listQuarterAverages(
  body,
) {
  const goalIds =
    normalizeList(
      body.goal_ids,
      {
        maxLength: 50,
      },
    ).filter(id =>
      UUID_PATTERN.test(id)
    );

  const studentIds =
    normalizeList(
      body.student_ids,
      {
        maxLength: 50,
      },
    ).filter(id =>
      UUID_PATTERN.test(id)
    );

  const year =
    Number.isInteger(body.year)
      ? body.year
      : null;

  const params =
    new URLSearchParams();

  params.set(
    'select',
    '*',
  );

  if (goalIds.length > 0) {
    params.set(
      'goal_id',
      inFilter(goalIds),
    );
  }

  if (studentIds.length > 0) {
    params.set(
      'student_id',
      inFilter(studentIds),
    );
  }

  if (year !== null) {
    params.set(
      'school_year',
      `eq.${year}`,
    );
  }

  const averages =
    await getRows(
      'goal_progress_quarter_avg',
      params,
    );

  return {
    status: 200,
    body: {
      ok: true,
      averages,
    },
  };
}

exports.handler =
  async function handler(event) {
    const requestId =
      generateRequestId();

    if (
      event.httpMethod === 'OPTIONS'
    ) {
      return handleCorsPreFlight(
        event,
        ['POST', 'OPTIONS'],
        ['Content-Type'],
      );
    }

    if (
      event.httpMethod !== 'POST'
    ) {
      return jsonResponse(
        event,
        405,
        {
          ok: false,
          error: 'Method Not Allowed',
        },
        {},
        requestId,
      );
    }

    if (!SESSION_SECRET) {
      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error: 'Server not configured',
        },
        {},
        requestId,
      );
    }

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return jsonResponse(
        event,
        503,
        {
          ok: false,
          error: 'Service unavailable',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId,
      );
    }

    const authResult =
      requireTeacher(
        event,
        SESSION_SECRET,
      );

    if (!authResult.ok) {
      return jsonResponse(
        event,
        401,
        {
          ok: false,
          error: 'Unauthorized',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId,
      );
    }

    const contentType =
      event.headers?.['content-type'] ||
      event.headers?.['Content-Type'] ||
      '';

    if (
      !contentType.includes(
        'application/json',
      )
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Content-Type must be application/json',
        },
        {},
        requestId,
      );
    }

    const sizeCheck =
      validateBodySize(
        event.body,
        512,
      );

    if (!sizeCheck.valid) {
      return jsonResponse(
        event,
        413,
        {
          ok: false,
          error: 'Request body too large',
        },
        {},
        requestId,
      );
    }

    const parsed =
      safeJsonParse(
        event.body,
      );

    if (!parsed.ok) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error: 'Invalid JSON',
        },
        {},
        requestId,
      );
    }

    const body =
      parsed.data &&
      typeof parsed.data === 'object'
        ? parsed.data
        : {};

    const action =
      typeof body.action === 'string'
        ? body.action
            .trim()
            .toLowerCase()
        : '';

    try {
      let result;

      if (action === 'list') {
        result =
          await listProgress(body);
      } else if (action === 'insert') {
        result =
          await insertProgress(
            body,
            authResult?.user?.teacherId,
          );
      } else if (
        action === 'insert_batch'
      ) {
        result =
          await insertBatch(
            body,
            authResult?.user?.teacherId,
          );
      } else if (
        action === 'quarter_averages'
      ) {
        result =
          await listQuarterAverages(
            body,
          );
      } else {
        result = {
          status: 400,
          body: {
            ok: false,
            error: 'Unsupported action',
          },
        };
      }

      return jsonResponse(
        event,
        result.status,
        result.body,
        {
          'Cache-Control': 'no-store',
        },
        requestId,
      );
    } catch (error) {
      console.error(
        '[teacher-goal-progress]',
        `[${requestId}]`,
        error,
      );

      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error:
            'Goal-progress request failed',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId,
      );
    }
  };
