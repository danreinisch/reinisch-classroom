export const STATUS_LABELS = {
  'needs-review': 'Needs Review',
  reviewed: 'Reviewed',
  finalized: 'Finalized',
  all: 'All Assignments',
};

const CLASS_CODE_TO_NAME = {
  LA1: 'Language Arts 1 SC',
  LA2: 'Language Arts 2 SC',
  LA3: 'Language Arts 3 SC',
  LA4: 'Language Arts 4 SC',
  LSLA: 'Life Skills Language Arts SC',
  LIFESKILLS: 'Life Skills Language Arts SC',
  TS: 'Transitional Skills',
  TRANSITIONAL: 'Transitional Skills',
  CM: 'Consumer Math',
  GEOM: 'Geometry SC',
  SPEECH: 'Speech/Language',
  WARRIOR: 'Warrior Academy',
};

const CLASS_SHORT = {
  'Language Arts 1 SC': 'Language Arts 1',
  'Language Arts 2 SC': 'Language Arts 2',
  'Language Arts 3 SC': 'Language Arts 3',
  'Language Arts 4 SC': 'Language Arts 4',
  'Life Skills Language Arts SC': 'Life Skills LA',
  'Transitional Skills': 'Transitional Skills',
  'Consumer Math': 'Consumer Math',
  'Geometry SC': 'Geometry',
  'Speech/Language': 'Speech/Language',
  'Warrior Academy': 'Warrior Academy',
};

export function statusOf(row) {
  const value = row?.review_status || 'pending';
  if (value === 'reviewed') return 'reviewed';
  if (value === 'finalized') return 'finalized';
  if (value === 'pending' || value === 'in_progress') return 'needs-review';
  return value;
}

export function statusLabel(row) {
  const status = statusOf(row);
  if (status === 'needs-review') {
    return row?.review_status === 'in_progress' ? 'In Progress' : 'Needs Review';
  }
  if (status === 'reviewed') return 'Reviewed';
  if (status === 'finalized') return 'Finalized';
  if (status === 'returned') return 'Returned';
  return String(status).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function normalizeClassName(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const upper = raw.toUpperCase().replace(/[\s_-]+/g, '');
  if (CLASS_CODE_TO_NAME[upper]) return CLASS_CODE_TO_NAME[upper];
  if (CLASS_CODE_TO_NAME[raw.toUpperCase()]) return CLASS_CODE_TO_NAME[raw.toUpperCase()];
  if (raw === 'Life Skills') return 'Life Skills Language Arts SC';
  return raw;
}

export function classLabel(name) {
  return CLASS_SHORT[name] || name || 'Unassigned';
}

export function dateValue(value) {
  const date = new Date(value || 0);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

export function formatSubmitted(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function formatDue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function dedupeSubmissions(raw) {
  const byInstance = new Map();
  for (const submission of raw || []) {
    if (!submission?.instance_id) continue;
    const hasAnswers = submission.answers && Object.keys(submission.answers).length > 0;
    const existing = byInstance.get(submission.instance_id);
    if (!existing) {
      byInstance.set(submission.instance_id, submission);
      continue;
    }
    const existingHasAnswers = existing.answers && Object.keys(existing.answers).length > 0;
    if (hasAnswers && !existingHasAnswers) {
      byInstance.set(submission.instance_id, submission);
      continue;
    }
    if (!hasAnswers && existingHasAnswers) continue;
    if (dateValue(submission.submitted_at) > dateValue(existing.submitted_at)) {
      byInstance.set(submission.instance_id, submission);
    }
  }
  return [...byInstance.values()];
}

function resolveClassName(instance, assignment, student) {
  const candidates = [
    instance?.class_name,
    instance?.class_code,
    instance?.class_id,
    assignment?.class_name,
    assignment?.class_code,
    assignment?.class,
    assignment?.meta?.class_name,
    assignment?.meta?.class_code,
    student?.class_name,
    student?.class_code,
    student?.class_id,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeClassName(candidate);
    if (normalized) return normalized;
  }
  return 'Unassigned';
}

export function makeRows(submissions, instances, assignments, students) {
  const instanceById = new Map((instances || []).map(item => [String(item.id), item]));
  const assignmentById = new Map((assignments || []).map(item => [String(item.id), item]));
  const studentByCode = new Map((students || []).map(item => [String(item.code), item]));

  return dedupeSubmissions(submissions).map(submission => {
    const instance = instanceById.get(String(submission.instance_id)) || submission.instance || null;
    const assignmentId = submission.assignment_id || instance?.assignment_id || null;
    const assignment = assignmentById.get(String(assignmentId)) || submission.assignment || null;
    const studentCode = submission.student_code || instance?.student_code || '';
    const student = studentByCode.get(String(studentCode)) || submission.student || null;
    return {
      ...submission,
      id: String(submission.id),
      assignmentId: assignmentId == null ? '' : String(assignmentId),
      assignmentTitle: assignment?.title || instance?.settings?.title || 'Untitled Assignment',
      assignment,
      instance,
      student,
      studentCode: studentCode || 'Unknown',
      studentName: student?.name || studentCode || 'Unknown Student',
      className: resolveClassName(instance, assignment, student),
      dueAt: instance?.due_at || assignment?.due_at || assignment?.due || assignment?.due_date || '',
    };
  });
}

export function uniqueClasses(rows) {
  return [...new Set((rows || []).map(row => row.className).filter(Boolean))]
    .sort((a, b) => classLabel(a).localeCompare(classLabel(b)));
}

export function countStatus(rows, status) {
  if (status === 'all') return rows.length;
  return rows.filter(row => statusOf(row) === status).length;
}

export function filterHomeRows(rows, { status, className, search }) {
  let result = rows.slice();
  if (status !== 'all') result = result.filter(row => statusOf(row) === status);
  if (className !== 'All Classes') result = result.filter(row => row.className === className);
  const query = String(search || '').trim().toLowerCase();
  if (query) {
    result = result.filter(row => [row.assignmentTitle, row.studentName, row.studentCode, row.className]
      .some(value => String(value || '').toLowerCase().includes(query)));
  }
  return result;
}

function lifecycleRows(rows, assignmentId, className) {
  return rows.filter(row =>
    row.assignmentId === String(assignmentId) &&
    (className === 'All Classes' || row.className === className)
  );
}

export function groupAssignments(visibleRows, allRows, { className, sort }) {
  const groups = new Map();
  for (const row of visibleRows) {
    const key = row.assignmentId || `unknown:${row.assignmentTitle}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const result = [...groups.entries()].map(([assignmentId, groupRows]) => {
    const rows = lifecycleRows(allRows, assignmentId, className);
    const reviewed = rows.filter(row => ['reviewed', 'finalized'].includes(statusOf(row))).length;
    const needs = rows.filter(row => statusOf(row) === 'needs-review').length;
    const classes = [...new Set(rows.map(row => row.className))];
    const due = rows.map(row => row.dueAt).filter(Boolean).sort((a, b) => dateValue(a) - dateValue(b));
    return {
      assignmentId,
      title: groupRows[0]?.assignmentTitle || 'Untitled Assignment',
      className: classes.length === 1 ? classes[0] : 'Multiple Classes',
      submitted: rows.length,
      reviewed,
      needs,
      progress: rows.length ? Math.round((reviewed / rows.length) * 100) : 0,
      recent: Math.max(...rows.map(row => dateValue(row.submitted_at)), 0),
      dueAt: due[0] || '',
    };
  });

  result.sort(sort === 'assignment'
    ? (a, b) => a.title.localeCompare(b.title)
    : (a, b) => b.recent - a.recent || a.title.localeCompare(b.title));
  return result;
}

export function assignmentRows(rows, assignmentId, { className, status = 'all', search = '' }) {
  let result = lifecycleRows(rows, assignmentId, className);
  if (status !== 'all') result = result.filter(row => statusOf(row) === status);
  const query = String(search).trim().toLowerCase();
  if (query) {
    result = result.filter(row => [row.studentName, row.studentCode, statusLabel(row)]
      .some(value => String(value || '').toLowerCase().includes(query)));
  }
  return result.sort((a, b) => dateValue(a.submitted_at) - dateValue(b.submitted_at));
}

export function assignmentSummary(rows, assignmentId, className) {
  const result = lifecycleRows(rows, assignmentId, className);
  if (!result.length) return null;
  const reviewed = result.filter(row => ['reviewed', 'finalized'].includes(statusOf(row))).length;
  const needs = result.filter(row => statusOf(row) === 'needs-review').length;
  const classes = [...new Set(result.map(row => row.className))];
  const due = result.map(row => row.dueAt).filter(Boolean).sort((a, b) => dateValue(a) - dateValue(b));
  return {
    title: result[0].assignmentTitle,
    className: classes.length === 1 ? classes[0] : 'Multiple Classes',
    submitted: result.length,
    reviewed,
    needs,
    progress: result.length ? Math.round((reviewed / result.length) * 100) : 0,
    dueAt: due[0] || '',
  };
}
