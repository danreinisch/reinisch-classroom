'use strict';

/**
 * Server-only goal_objectives registry reader helpers.
 *
 * Purpose:
 * - make the production goal_objectives table the eventual live source
 *   for Teacher Center / Student Portal objective visibility
 * - preserve the established browser-safe objective payload shape
 * - keep internal monitoring, planning, status, QA, and UUID metadata
 *   out of browser projection
 * - fail loudly on malformed active registry identity
 *
 * This module performs no database write and creates no evidence.
 */

const STUDENT_CODE_PATTERN =
  /^S\d{3}$/;

const PARENT_GOAL_CODE_PATTERN =
  /^S\d{3}\.CG\d+$/;

const OBJECTIVE_CODE_PATTERN =
  /^(S\d{3}\.CG\d+)\.O(\d+)$/;

const BROWSER_OBJECTIVE_FIELDS =
  Object.freeze([
    'student_code',
    'parent_goal_code',
    'code',
    'goal_area',
    'objective_number',
    'objective_text',
    'baseline',
    'objective_wording_criterion',
    'mastery_field',
    'parent_goal_criterion',
  ]);

const REGISTRY_SELECT_FIELDS =
  Object.freeze([
    'id',
    'student_id',
    'parent_goal_id',
    ...BROWSER_OBJECTIVE_FIELDS,
    'active',
  ]);

function normalizeText(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function normalizeStudentCode(value) {
  const code =
    normalizeText(value)
      .toUpperCase();

  return STUDENT_CODE_PATTERN.test(code)
    ? code
    : null;
}

function normalizeParentGoalCode(value) {
  const code =
    normalizeText(value)
      .toUpperCase();

  return PARENT_GOAL_CODE_PATTERN.test(code)
    ? code
    : null;
}

function validateActiveObjectiveRow(row) {
  if (
    !row ||
    typeof row !== 'object'
  ) {
    throw new Error(
      'OBJECTIVE_REGISTRY_ROW_INVALID'
    );
  }

  if (row.active !== true) {
    throw new Error(
      'OBJECTIVE_REGISTRY_ROW_NOT_ACTIVE'
    );
  }

  const studentCode =
    normalizeStudentCode(
      row.student_code
    );

  const parentGoalCode =
    normalizeParentGoalCode(
      row.parent_goal_code
    );

  const code =
    normalizeText(
      row.code
    ).toUpperCase();

  const match =
    code.match(
      OBJECTIVE_CODE_PATTERN
    );

  if (
    !studentCode ||
    !parentGoalCode ||
    !match
  ) {
    throw new Error(
      'OBJECTIVE_REGISTRY_IDENTITY_INVALID'
    );
  }

  if (
    parentGoalCode !== match[1] ||
    studentCode !== code.slice(0, 4)
  ) {
    throw new Error(
      'OBJECTIVE_REGISTRY_IDENTITY_MISMATCH'
    );
  }

  const objectiveNumber =
    Number(
      row.objective_number
    );

  const codeNumber =
    Number(
      match[2]
    );

  if (
    !Number.isInteger(objectiveNumber) ||
    objectiveNumber <= 0 ||
    objectiveNumber !== codeNumber
  ) {
    throw new Error(
      'OBJECTIVE_REGISTRY_NUMBER_MISMATCH'
    );
  }

  const objectiveText =
    normalizeText(
      row.objective_text
    );

  if (!objectiveText) {
    throw new Error(
      'OBJECTIVE_REGISTRY_TEXT_REQUIRED'
    );
  }

  return {
    ...row,
    student_code:
      studentCode,
    parent_goal_code:
      parentGoalCode,
    code,
    objective_number:
      objectiveNumber,
    objective_text:
      objectiveText,
  };
}

function compareRegistryRows(a, b) {
  const studentCompare =
    a.student_code.localeCompare(
      b.student_code
    );

  if (studentCompare !== 0) {
    return studentCompare;
  }

  const parentCompare =
    a.parent_goal_code.localeCompare(
      b.parent_goal_code
    );

  if (parentCompare !== 0) {
    return parentCompare;
  }

  if (
    a.objective_number !==
    b.objective_number
  ) {
    return (
      a.objective_number -
      b.objective_number
    );
  }

  return a.code.localeCompare(
    b.code
  );
}

function normalizeObjectiveRegistryRows(
  rows,
  {
    studentCode = null,
  } = {},
) {
  const requestedStudent =
    studentCode === null
      ? null
      : normalizeStudentCode(
          studentCode
        );

  if (
    studentCode !== null &&
    !requestedStudent
  ) {
    throw new Error(
      'OBJECTIVE_REGISTRY_STUDENT_INVALID'
    );
  }

  const activeRows =
    (
      Array.isArray(rows)
        ? rows
        : []
    )
      .filter(
        row =>
          row &&
          row.active === true
      )
      .map(
        validateActiveObjectiveRow
      )
      .filter(
        row =>
          requestedStudent === null ||
          row.student_code ===
            requestedStudent
      )
      .sort(
        compareRegistryRows
      );

  const codeSet =
    new Set();

  const parentNumberSet =
    new Set();

  for (const row of activeRows) {
    if (codeSet.has(row.code)) {
      throw new Error(
        `OBJECTIVE_REGISTRY_DUPLICATE_CODE:${row.code}`
      );
    }

    codeSet.add(
      row.code
    );

    const parentNumberKey =
      `${row.parent_goal_id || ''}|${row.objective_number}`;

    if (
      parentNumberSet.has(
        parentNumberKey
      )
    ) {
      throw new Error(
        `OBJECTIVE_REGISTRY_DUPLICATE_PARENT_NUMBER:${row.parent_goal_code}.O${row.objective_number}`
      );
    }

    parentNumberSet.add(
      parentNumberKey
    );
  }

  return activeRows;
}

function projectBrowserObjective(row) {
  const normalized =
    validateActiveObjectiveRow(
      row
    );

  return Object.fromEntries(
    BROWSER_OBJECTIVE_FIELDS.map(
      field => [
        field,
        normalized[field] ??
          null,
      ]
    )
  );
}

function parentKey(
  studentCode,
  parentGoalCode,
) {
  const student =
    normalizeStudentCode(
      studentCode
    );

  const parent =
    normalizeParentGoalCode(
      parentGoalCode
    );

  if (!student || !parent) {
    return null;
  }

  return `${student}|${parent}`;
}

function indexObjectiveRegistryRowsByParent(
  rows,
  options = {},
) {
  const normalized =
    normalizeObjectiveRegistryRows(
      rows,
      options
    );

  const index =
    new Map();

  for (const row of normalized) {
    const key =
      parentKey(
        row.student_code,
        row.parent_goal_code
      );

    if (!key) {
      throw new Error(
        'OBJECTIVE_REGISTRY_PARENT_KEY_INVALID'
      );
    }

    if (!index.has(key)) {
      index.set(
        key,
        []
      );
    }

    index
      .get(key)
      .push(row);
  }

  return index;
}

function getBrowserObjectivesForParent(
  index,
  parentGoalCode,
  studentCode,
) {
  if (!(index instanceof Map)) {
    throw new Error(
      'OBJECTIVE_REGISTRY_INDEX_REQUIRED'
    );
  }

  const key =
    parentKey(
      studentCode,
      parentGoalCode
    );

  if (!key) {
    return [];
  }

  const rows =
    index.get(key) || [];

  return rows.map(
    projectBrowserObjective
  );
}

function buildObjectiveRegistryPath({
  studentId = null,
  parentGoalIds = null,
} = {}) {
  let path =
    '/rest/v1/goal_objectives' +
    '?select=' +
    REGISTRY_SELECT_FIELDS.join(',') +
    '&active=eq.true';

  if (studentId !== null) {
    const normalizedStudentId =
      normalizeText(
        studentId
      );

    if (!normalizedStudentId) {
      throw new Error(
        'OBJECTIVE_REGISTRY_STUDENT_ID_REQUIRED'
      );
    }

    path +=
      '&student_id=eq.' +
      encodeURIComponent(
        normalizedStudentId
      );
  }

  if (parentGoalIds !== null) {
    if (
      !Array.isArray(parentGoalIds) ||
      parentGoalIds.length === 0
    ) {
      throw new Error(
        'OBJECTIVE_REGISTRY_PARENT_IDS_REQUIRED'
      );
    }

    const values =
      parentGoalIds.map(
        value => {
          const normalized =
            normalizeText(value);

          if (!normalized) {
            throw new Error(
              'OBJECTIVE_REGISTRY_PARENT_ID_INVALID'
            );
          }

          return encodeURIComponent(
            normalized
          );
        }
      );

    path +=
      '&parent_goal_id=in.(' +
      values.join(',') +
      ')';
  }

  path +=
    '&order=student_code.asc,' +
    'parent_goal_code.asc,' +
    'objective_number.asc,' +
    'code.asc';

  return path;
}

module.exports = {
  BROWSER_OBJECTIVE_FIELDS,
  REGISTRY_SELECT_FIELDS,
  buildObjectiveRegistryPath,
  normalizeObjectiveRegistryRows,
  projectBrowserObjective,
  indexObjectiveRegistryRowsByParent,
  getBrowserObjectivesForParent,
};
