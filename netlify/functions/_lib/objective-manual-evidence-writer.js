'use strict';

/**
 * Slice 5D1 — manual / binder child-objective evidence.
 *
 * This helper is intentionally assignment-independent.
 *
 * Browser-facing identity:
 *   student_code + parent_goal_code + objective_code
 *
 * Server-owned identity:
 *   student UUID + normalized objective UUID
 *
 * Manual evidence always:
 *   source = manual
 *   assignment_instance_id = null
 *   item_id = null
 *
 * It never changes an academic score or parent goal progress.
 */

const MANUAL_OBJECTIVE_EVIDENCE_TYPES =
  Object.freeze([
    'binder',
    'manual_probe',
  ]);

const ALLOWED_FIELDS =
  new Set([
    'student_code',
    'parent_goal_code',
    'objective_code',
    'date',
    'objective_earned',
    'objective_max',
    'evidence_type',
    'support_level',
    'notes',
  ]);

const FORBIDDEN_CALLER_FIELDS =
  new Set([
    'objective_id',
    'objectiveId',
    'student_id',
    'studentId',
    'parent_goal_id',
    'parentGoalId',
    'goal_id',
    'goalId',
    'class_id',
    'classId',
    'assignment_instance_id',
    'assignmentInstanceId',
    'item_id',
    'itemId',
    'school_year',
    'schoolYear',
    'source',
    'created_at',
    'createdAt',
    'collected_by',
    'collectedBy',
  ]);

const STUDENT_CODE_PATTERN =
  /^S\d{3}$/;

const PARENT_GOAL_CODE_PATTERN =
  /^S\d{3}\.CG\d+$/;

const OBJECTIVE_CODE_PATTERN =
  /^S\d{3}\.CG\d+\.O\d+$/;

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

function normalizeCode(value) {
  return String(
    value ?? ''
  )
    .trim()
    .toUpperCase();
}

function normalizeText(
  value,
  maxLength
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    String(value)
      .trim()
      .slice(
        0,
        maxLength
      );

  return normalized || null;
}

function finiteNumber(
  value,
  label
) {
  if (
    value === null ||
    value === undefined ||
    (
      typeof value === 'string' &&
      value.trim() === ''
    )
  ) {
    throw new Error(
      `${label} is required`
    );
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(
      `${label} must be a finite number`
    );
  }

  return number;
}

function parseObjectiveDate(value) {
  const date =
    String(value || '')
      .trim();

  if (!DATE_PATTERN.test(date)) {
    throw new Error(
      'A valid objective evidence date is required'
    );
  }

  const [
    yearText,
    monthText,
    dayText,
  ] =
    date.split('-');

  const year =
    Number(yearText);

  const month =
    Number(monthText);

  const day =
    Number(dayText);

  const check =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !==
      month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error(
      'Invalid objective evidence date'
    );
  }

  return {
    date,
    year,
    month,
  };
}

function schoolYearFromObjectiveDate(
  value
) {
  const parsed =
    parseObjectiveDate(value);

  /*
   * Reinisch Classroom student school year:
   * August through July.
   *
   * 2026-08 through 2027-07 => "2026".
   */
  return String(
    parsed.month >= 8
      ? parsed.year
      : parsed.year - 1
  );
}

function normalizeManualObjectiveRequest(
  raw
) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  ) {
    throw new Error(
      'Manual objective request must be an object'
    );
  }

  for (
    const key
    of Object.keys(raw)
  ) {
    if (
      FORBIDDEN_CALLER_FIELDS.has(
        key
      )
    ) {
      throw new Error(
        `Caller-controlled field "${key}" is forbidden; the server owns canonical identity and provenance`
      );
    }

    if (!ALLOWED_FIELDS.has(key)) {
      throw new Error(
        `Unsupported manual objective field "${key}"`
      );
    }
  }

  const studentCode =
    normalizeCode(
      raw.student_code
    );

  const parentGoalCode =
    normalizeCode(
      raw.parent_goal_code
    );

  const objectiveCode =
    normalizeCode(
      raw.objective_code
    );

  if (
    !STUDENT_CODE_PATTERN.test(
      studentCode
    )
  ) {
    throw new Error(
      'A valid student_code is required'
    );
  }

  if (
    !PARENT_GOAL_CODE_PATTERN.test(
      parentGoalCode
    )
  ) {
    throw new Error(
      'A valid parent_goal_code is required'
    );
  }

  if (
    !OBJECTIVE_CODE_PATTERN.test(
      objectiveCode
    )
  ) {
    throw new Error(
      'A valid objective_code is required'
    );
  }

  if (
    !parentGoalCode.startsWith(
      `${studentCode}.`
    )
  ) {
    throw new Error(
      'Parent goal identity does not match student identity'
    );
  }

  if (
    !objectiveCode.startsWith(
      `${parentGoalCode}.O`
    )
  ) {
    throw new Error(
      'Objective identity does not match its controlling parent goal'
    );
  }

  const { date } =
    parseObjectiveDate(
      raw.date
    );

  const objectiveEarned =
    finiteNumber(
      raw.objective_earned,
      'Objective earned value'
    );

  const objectiveMax =
    finiteNumber(
      raw.objective_max,
      'Objective max'
    );

  if (objectiveMax <= 0) {
    throw new Error(
      'Objective max must be greater than zero'
    );
  }

  if (
    objectiveEarned < 0 ||
    objectiveEarned >
      objectiveMax
  ) {
    throw new Error(
      'Objective earned value is outside the allowed max range'
    );
  }

  const evidenceType =
    String(
      raw.evidence_type || ''
    )
      .trim()
      .toLowerCase();

  if (
    !MANUAL_OBJECTIVE_EVIDENCE_TYPES
      .includes(
        evidenceType
      )
  ) {
    throw new Error(
      'evidence_type must be binder or manual_probe'
    );
  }

  return {
    student_code:
      studentCode,
    parent_goal_code:
      parentGoalCode,
    objective_code:
      objectiveCode,
    date,
    objective_earned:
      objectiveEarned,
    objective_max:
      objectiveMax,
    evidence_type:
      evidenceType,
    support_level:
      normalizeText(
        raw.support_level,
        250
      ),
    notes:
      normalizeText(
        raw.notes,
        4000
      ),
  };
}

function buildManualObjectiveEvidenceRow({
  input,
  objectiveId,
  studentId,
  schoolYear,
}) {
  if (
    !input ||
    typeof input !== 'object'
  ) {
    throw new Error(
      'Normalized manual objective input is required'
    );
  }

  if (
    typeof objectiveId !==
      'string' ||
    !objectiveId.trim()
  ) {
    throw new Error(
      'Canonical objective identity is required'
    );
  }

  if (
    typeof studentId !==
      'string' ||
    !studentId.trim()
  ) {
    throw new Error(
      'Canonical student identity is required'
    );
  }

  if (
    typeof schoolYear !==
      'string' ||
    !schoolYear.trim()
  ) {
    throw new Error(
      'Canonical school year is required'
    );
  }

  return {
    objective_id:
      objectiveId,
    student_id:
      studentId,

    assignment_instance_id:
      null,
    item_id:
      null,

    objective_earned:
      input.objective_earned,
    objective_max:
      input.objective_max,

    question_text:
      null,
    choices:
      null,
    student_answer:
      null,
    correct_answer:
      null,
    is_correct:
      null,
    component_label:
      null,

    support_level:
      input.support_level,
    evidence_type:
      input.evidence_type,

    source:
      'manual',
    notes:
      input.notes,

    date:
      input.date,
    school_year:
      schoolYear,
  };
}

function projectManualObjectiveEvidenceResult({
  input,
  row,
}) {
  if (
    !input ||
    !row
  ) {
    throw new Error(
      'Saved manual objective evidence is required'
    );
  }

  const percentage =
    Math.round(
      (
        Number(
          row.objective_earned
        ) /
        Number(
          row.objective_max
        )
      ) *
      10000
    ) /
    100;

  return {
    student_code:
      input.student_code,
    parent_goal_code:
      input.parent_goal_code,
    objective_code:
      input.objective_code,
    date:
      input.date,
    objective_earned:
      row.objective_earned,
    objective_max:
      row.objective_max,
    percentage,
    evidence_type:
      row.evidence_type,
    support_level:
      row.support_level,
  };
}

module.exports = {
  MANUAL_OBJECTIVE_EVIDENCE_TYPES,
  normalizeManualObjectiveRequest,
  schoolYearFromObjectiveDate,
  buildManualObjectiveEvidenceRow,
  projectManualObjectiveEvidenceResult,
};
