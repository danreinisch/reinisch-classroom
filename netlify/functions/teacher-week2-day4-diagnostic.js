'use strict';

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');
const { requireTeacher } = require('./_lib/auth');
const {
  getSupabaseConfig,
  lookupActiveTeacherId,
} = require('./_lib/supa');
const {
  TARGETS,
} = require('./_lib/week2-day4-trim');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } =
  getSupabaseConfig();
const { SESSION_SECRET } = process.env;

function headers() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
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

function increment(map, key) {
  const normalized = String(key == null || key === '' ? '(blank)' : key);
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function mapToSortedObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function redactTitle(title) {
  return String(title || '')
    .replace(/\bS\d{3}\b/gi, 'S###')
    .trim();
}

function dayShape(meta) {
  if (!meta || !Array.isArray(meta.days)) return '(no meta.days)';
  const days = meta.days
    .map(day => Number.parseInt(String(day && day.day_number), 10))
    .filter(Number.isInteger);
  return days.length > 0 ? days.join(',') : '(empty meta.days)';
}

function isWeek2Like(assignment) {
  const title = String(assignment && assignment.title || '').toUpperCase();
  const meta = assignment && assignment.meta && typeof assignment.meta === 'object'
    ? assignment.meta
    : {};
  const source = String(meta.source_file || '').toUpperCase();

  return (
    /\bWEEK\s*2\b/.test(title) ||
    source.includes('WEEK_02') ||
    source.includes('WEEK 02') ||
    source.includes('WEEK_2') ||
    source.includes('WEEK 2')
  );
}

function summarizeClass(target, classRow, assignments, instanceRows) {
  const classAssignments = assignments.filter(
    assignment => String(assignment.class_id) === String(classRow.id)
  );
  const week2Like = classAssignments.filter(isWeek2Like);
  const assignmentIds = new Set(
    classAssignments.map(row => String(row.id))
  );
  const classInstances = instanceRows.filter(
    row => assignmentIds.has(String(row.assignment_id))
  );

  const yearCounts = new Map();
  const sourceCounts = new Map();
  const metaClassCounts = new Map();
  const titleCounts = new Map();
  const dayShapeCounts = new Map();
  const dueDateCounts = new Map();
  const assignedDateCounts = new Map();

  for (const assignment of week2Like) {
    const meta = assignment.meta && typeof assignment.meta === 'object'
      ? assignment.meta
      : {};
    increment(yearCounts, assignment.school_year);
    increment(sourceCounts, meta.source_file);
    increment(metaClassCounts, meta.class_name);
    increment(titleCounts, redactTitle(assignment.title));
    increment(dayShapeCounts, dayShape(meta));
  }

  const week2Ids = new Set(week2Like.map(row => String(row.id)));
  for (const instance of classInstances) {
    if (!week2Ids.has(String(instance.assignment_id))) continue;
    increment(dueDateCounts, instance.due_at ? String(instance.due_at).slice(0, 10) : null);
    increment(assignedDateCounts, instance.assigned_at ? String(instance.assigned_at).slice(0, 10) : null);
  }

  const allYearCounts = new Map();
  const allSourceCounts = new Map();
  for (const assignment of classAssignments) {
    const meta = assignment.meta && typeof assignment.meta === 'object'
      ? assignment.meta
      : {};
    increment(allYearCounts, assignment.school_year);
    increment(allSourceCounts, meta.source_file);
  }

  return {
    class_name: target.className,
    expected_week2_count: target.expectedCount,
    expected_title_pattern: `${target.title} — S###`,
    total_assignments_in_class: classAssignments.length,
    week2_like_assignments: week2Like.length,
    week2_identity: {
      title_patterns: mapToSortedObject(titleCounts),
      school_years: mapToSortedObject(yearCounts),
      source_files: mapToSortedObject(sourceCounts),
      meta_class_names: mapToSortedObject(metaClassCounts),
      day_shapes: mapToSortedObject(dayShapeCounts),
      due_dates: mapToSortedObject(dueDateCounts),
      assigned_dates: mapToSortedObject(assignedDateCounts),
    },
    all_class_identity: {
      school_years: mapToSortedObject(allYearCounts),
      source_files: mapToSortedObject(allSourceCounts),
    },
  };
}

exports.handler = async event => {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(
      event,
      ['GET', 'OPTIONS'],
      ['Content-Type']
    );
  }

  if (event.httpMethod !== 'GET') {
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

  let teacherId =
    authResult.user && authResult.user.teacherId
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
    const classes = await readJson(
      `classes?select=id,name,teacher_id&teacher_id=eq.${encodeURIComponent(teacherId)}`,
      'Teacher class lookup'
    );
    const classByName = new Map(
      classes
        .filter(row => row && row.id && row.name)
        .map(row => [String(row.name), row])
    );

    const targetClasses = TARGETS
      .map(target => ({ target, row: classByName.get(target.className) }))
      .filter(entry => entry.row);
    const classIds = targetClasses.map(entry => entry.row.id);

    const assignments = classIds.length > 0
      ? await readJson(
          `assignments?select=id,title,class_id,meta,school_year,active` +
            `&class_id=in.(${inFilter(classIds)})&limit=2000`,
          'Assignment diagnostic lookup'
        )
      : [];

    const assignmentIds = assignments
      .map(row => row && row.id)
      .filter(Boolean);

    const instances = assignmentIds.length > 0
      ? await readJson(
          `assignment_instances?select=assignment_id,assigned_at,due_at,status` +
            `&assignment_id=in.(${inFilter(assignmentIds)})&limit=5000`,
          'Assignment-instance diagnostic lookup'
        )
      : [];

    const summaries = targetClasses.map(
      entry => summarizeClass(entry.target, entry.row, assignments, instances)
    );

    const missingClasses = TARGETS
      .filter(target => !classByName.has(target.className))
      .map(target => target.className);

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        read_only: true,
        missing_classes: missingClasses,
        classes: summaries,
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(
      `[teacher-week2-day4-diagnostic] [${requestId}]`,
      err
    );

    return jsonResponse(
      event,
      500,
      { ok: false, error: err.message || 'Diagnostic failed' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};

exports._test = {
  dayShape,
  isWeek2Like,
  redactTitle,
  summarizeClass,
};
