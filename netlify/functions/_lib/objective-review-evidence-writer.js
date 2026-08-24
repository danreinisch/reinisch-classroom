'use strict';

const {
  fetchAssignmentItemObjectiveMappings,
  reconcileAssignmentObjectiveDataPoints,
} = require(
  './objective-auto-evidence-writer'
);

function numeric(value, label) {
  const result = Number(value);

  if (!Number.isFinite(result)) {
    throw new Error(
      `${label} must be numeric`
    );
  }

  return result;
}

function normalizeStudentAnswer(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.value !== undefined
  ) {
    return String(value.value ?? '');
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function validateReviewObjectiveComponents({
  mappings,
  components,
}) {
  const safeMappings =
    Array.isArray(mappings)
      ? mappings
      : [];

  const safeComponents =
    Array.isArray(components)
      ? components
      : [];

  if (safeMappings.length === 0) {
    throw new Error(
      'No authoritative objective component mappings exist for this item'
    );
  }

  if (
    safeComponents.length !==
    safeMappings.length
  ) {
    throw new Error(
      'Complete objective component scoring is required'
    );
  }

  const mappingByOrder =
    new Map();

  for (const mapping of safeMappings) {
    const order =
      Number(mapping.component_order);

    const maximum =
      numeric(
        mapping.objective_max,
        'Objective max'
      );

    if (
      !Number.isInteger(order) ||
      order <= 0
    ) {
      throw new Error(
        'Invalid authoritative component order'
      );
    }

    if (maximum <= 0) {
      throw new Error(
        'Objective max must be greater than zero'
      );
    }

    if (
      !mapping.objective_id ||
      typeof mapping.objective_id !==
        'string'
    ) {
      throw new Error(
        'Authoritative objective identity is required'
      );
    }

    if (mappingByOrder.has(order)) {
      throw new Error(
        'Duplicate authoritative component order'
      );
    }

    mappingByOrder.set(
      order,
      {
        objective_id:
          mapping.objective_id,
        component_label:
          mapping.component_label ||
          null,
        objective_max:
          maximum,
        component_order:
          order,
      }
    );
  }

  const suppliedOrders =
    new Set();

  const validated = [];

  for (const component of safeComponents) {
    if (
      !component ||
      typeof component !== 'object' ||
      Array.isArray(component)
    ) {
      throw new Error(
        'Objective component must be an object'
      );
    }

    for (const forbidden of [
      'objectiveId',
      'objective_id',
      'componentLabel',
      'component_label',
      'objectiveMax',
      'objective_max',
    ]) {
      if (
        Object.prototype.hasOwnProperty.call(
          component,
          forbidden
        )
      ) {
        throw new Error(
          'Browser/caller must not supply objective identity or authoritative metadata'
        );
      }
    }

    const order =
      Number(
        component.componentOrder
      );

    if (
      !Number.isInteger(order) ||
      order <= 0
    ) {
      throw new Error(
        'Component order must be a positive integer'
      );
    }

    if (suppliedOrders.has(order)) {
      throw new Error(
        'Duplicate component order'
      );
    }

    suppliedOrders.add(order);

    const mapping =
      mappingByOrder.get(order);

    if (!mapping) {
      throw new Error(
        `Unknown objective component order ${order}`
      );
    }

    const earned =
      numeric(
        component.earned,
        'Objective earned value'
      );

    if (
      earned < 0 ||
      earned > mapping.objective_max
    ) {
      throw new Error(
        'Objective earned value is outside the authoritative max range'
      );
    }

    validated.push({
      ...mapping,
      objective_earned:
        earned,
    });
  }

  for (const order of mappingByOrder.keys()) {
    if (!suppliedOrders.has(order)) {
      throw new Error(
        `Missing objective component order ${order}`
      );
    }
  }

  return validated.sort(
    (a, b) =>
      a.component_order -
      b.component_order
  );
}

function buildReviewObjectiveEvidenceRows({
  validatedComponents,
  studentId,
  assignmentInstanceId,
  itemId,
  questionText,
  studentAnswer,
  teacherNote,
  date,
  schoolYear,
}) {
  const components =
    Array.isArray(validatedComponents)
      ? validatedComponents
      : [];

  return components.map(
    component => ({
      objective_id:
        component.objective_id,
      student_id:
        studentId,
      assignment_instance_id:
        assignmentInstanceId,
      item_id:
        Number(itemId),
      objective_earned:
        component.objective_earned,
      objective_max:
        component.objective_max,
      question_text:
        questionText
          ? String(questionText)
          : null,
      choices:
        null,
      student_answer:
        normalizeStudentAnswer(
          studentAnswer
        ),
      correct_answer:
        null,
      is_correct:
        null,
      component_label:
        component.component_label ||
        null,
      support_level:
        null,
      evidence_type:
        'written_component',
      source:
        'assignment',
      notes:
        teacherNote
          ? String(teacherNote)
          : null,
      date,
      school_year:
        schoolYear || null,
    })
  );
}

module.exports = {
  fetchAssignmentItemObjectiveMappings,
  reconcileAssignmentObjectiveDataPoints,
  validateReviewObjectiveComponents,
  buildReviewObjectiveEvidenceRows,
};
