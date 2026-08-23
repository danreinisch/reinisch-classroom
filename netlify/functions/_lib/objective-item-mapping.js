'use strict';

/**
 * Slice 2 objective-item mapping helper.
 *
 * Responsibilities:
 * - normalize parsed objective_components
 * - validate each component against public.goal_objectives
 * - enforce student + controlling-parent identity
 * - replace normalized public.assignment_item_objectives rows for an item
 *
 * Explicitly NOT responsible for:
 * - academic scoring
 * - IEP progress calculation
 * - evidence/datapoint creation
 * - parent-goal rollups
 */

const OBJECTIVE_CODE_PATTERN =
  /^S\d{3}\.CG\d+\.O\d+$/;

const BLOCKING_CODES = Object.freeze({
  NOT_FOUND: 'OBJECTIVE_CODE_NOT_FOUND',
  INACTIVE: 'OBJECTIVE_INACTIVE',
  STUDENT_MISMATCH: 'OBJECTIVE_STUDENT_MISMATCH',
  PARENT_MISMATCH: 'OBJECTIVE_PARENT_MISMATCH',
  AMBIGUOUS: 'OBJECTIVE_COMPONENT_AMBIGUOUS',
  MAX_INVALID: 'OBJECTIVE_MAX_INVALID',
});

function mappingError(code, message, detail = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 422;
  error.detail = detail;
  return error;
}

function uniq(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(value => String(value || '').trim())
        .filter(Boolean)
    )
  );
}


/**
 * Select the assignment row that is safe to reuse for the current issuance.
 *
 * Objective-aware assignments are internally student-specific even when their
 * teacher-visible title/class/year are identical.
 *
 * Rules:
 * - objectiveStudentCode => reuse ONLY that student's objective assignment
 * - targeted no-IO reissue => prefer that student's prior objective assignment
 *   so removing IO can clean its stale normalized mappings
 * - otherwise reuse only a generic assignment
 * - never cross from one student's objective assignment into another student's
 */
function selectAssignmentReuseCandidate({
  candidates,
  objectiveStudentCode,
  targetedStudentCode,
}) {
  const rows =
    Array.isArray(candidates)
      ? candidates
      : [];

  const normalizeCode =
    value =>
      typeof value === 'string'
        ? value.trim().toUpperCase()
        : '';

  const objectiveCode =
    normalizeCode(objectiveStudentCode);

  const targetCode =
    normalizeCode(targetedStudentCode);

  const studentCodeFor =
    row =>
      normalizeCode(
        row &&
        row.meta &&
        row.meta.objective_assignment_student_code
      );

  if (objectiveCode) {
    return (
      rows.find(
        row =>
          studentCodeFor(row) ===
          objectiveCode
      ) || null
    );
  }

  if (targetCode) {
    const matchingStudentAssignment =
      rows.find(
        row =>
          studentCodeFor(row) ===
          targetCode
      );

    if (matchingStudentAssignment) {
      return matchingStudentAssignment;
    }

    return (
      rows.find(
        row =>
          !studentCodeFor(row)
      ) || null
    );
  }

  return (
    rows.find(
      row =>
        !studentCodeFor(row)
    ) || null
  );
}


/**
 * Return true when stored assignment metadata contains Slice 2 objective
 * mapping metadata anywhere in its nested TXT/HTML structure.
 *
 * This is intentionally a metadata-key detector. It does not query Supabase
 * and does not infer objectives from parent [IG:] codes.
 */
function hasObjectiveMetadataInAssignmentMeta(value) {
  if (Array.isArray(value)) {
    return value.some(
      item =>
        hasObjectiveMetadataInAssignmentMeta(item)
    );
  }

  if (
    !value ||
    typeof value !== 'object'
  ) {
    return false;
  }

  if (
    (
      Array.isArray(value.objective_components) &&
      value.objective_components.length > 0
    ) ||
    value.objective_components_explicit === true ||
    value.objective_max_unbound != null ||
    value.objective_max_invalid_raw != null
  ) {
    return true;
  }

  return Object.values(value).some(
    child =>
      hasObjectiveMetadataInAssignmentMeta(child)
  );
}

/**
 * Normalize parser output to one stable internal shape.
 *
 * Accepted parser-facing aliases:
 *   code / objective_code
 *   max / objective_max
 *   order / component_order
 */
function normalizeObjectiveComponents(rawComponents) {
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    return [];
  }

  return rawComponents.map((raw, index) => {
    const component =
      raw && typeof raw === 'object'
        ? raw
        : { code: raw };

    const code =
      String(
        component.code ??
        component.objective_code ??
        ''
      ).trim();

    const labelRaw =
      component.label ??
      component.component_label ??
      null;

    const label =
      labelRaw === null || labelRaw === undefined
        ? null
        : String(labelRaw).trim() || null;

    const rawMax =
      component.max ??
      component.objective_max ??
      1;

    const objectiveMax = Number(rawMax);

    if (
      !Number.isFinite(objectiveMax) ||
      objectiveMax <= 0
    ) {
      throw mappingError(
        BLOCKING_CODES.MAX_INVALID,
        `Objective component "${code || '(missing code)'}" has an invalid Objective Max.`,
        {
          code,
          objective_max: rawMax,
        }
      );
    }

    const rawOrder =
      component.order ??
      component.component_order ??
      index + 1;

    const componentOrder = Number(rawOrder);

    if (
      !Number.isInteger(componentOrder) ||
      componentOrder <= 0
    ) {
      throw mappingError(
        BLOCKING_CODES.AMBIGUOUS,
        `Objective component "${code || '(missing code)'}" has an invalid component order.`,
        {
          code,
          component_order: rawOrder,
        }
      );
    }

    return {
      code,
      label,
      objective_max: objectiveMax,
      component_order: componentOrder,
    };
  });
}

/**
 * Validate normalized objective components against registry rows.
 *
 * `allowMultiple` must be true only for an explicit Objective Components block.
 * A normal question with multiple IO identities is ambiguous and blocks issuance.
 */
function validateObjectiveComponents({
  objective_components,
  registryRows,
  studentCode,
  parentGoalCodes,
  allowMultiple = false,
}) {
  const components =
    normalizeObjectiveComponents(objective_components);

  if (components.length === 0) {
    return [];
  }

  if (
    components.length > 1 &&
    !allowMultiple
  ) {
    throw mappingError(
      BLOCKING_CODES.AMBIGUOUS,
      'A normal assignment item may target only one objective. Use an explicit Objective Components block for multi-objective artifacts.',
      {
        objective_codes:
          components.map(component => component.code),
      }
    );
  }

  const duplicateCodes =
    components
      .map(component => component.code)
      .filter(
        (code, index, all) =>
          all.indexOf(code) !== index
      );

  if (duplicateCodes.length > 0) {
    throw mappingError(
      BLOCKING_CODES.AMBIGUOUS,
      `Objective mapping repeats the same objective code: ${uniq(duplicateCodes).join(', ')}`,
      {
        objective_codes: uniq(duplicateCodes),
      }
    );
  }

  const duplicateOrders =
    components
      .map(component => component.component_order)
      .filter(
        (order, index, all) =>
          all.indexOf(order) !== index
      );

  if (duplicateOrders.length > 0) {
    throw mappingError(
      BLOCKING_CODES.AMBIGUOUS,
      'Objective component order values must be unique within an assignment item.',
      {
        component_orders: uniq(duplicateOrders),
      }
    );
  }

  const registry =
    Array.isArray(registryRows)
      ? registryRows
      : [];

  const registryByCode =
    new Map(
      registry
        .filter(row => row && row.code)
        .map(row => [String(row.code).trim(), row])
    );

  const normalizedStudentCode =
    String(studentCode || '')
      .trim()
      .toUpperCase();

  const allowedParents =
    new Set(
      uniq(parentGoalCodes)
        .map(code => code.toUpperCase())
    );

  const resolved = [];

  for (const component of components) {
    if (!OBJECTIVE_CODE_PATTERN.test(component.code)) {
      throw mappingError(
        BLOCKING_CODES.NOT_FOUND,
        `Objective code "${component.code || '(missing code)'}" is not a valid official objective identity.`,
        {
          objective_code: component.code,
        }
      );
    }

    const row =
      registryByCode.get(component.code);

    if (!row) {
      throw mappingError(
        BLOCKING_CODES.NOT_FOUND,
        `Objective code "${component.code}" was not found in the official goal_objectives registry.`,
        {
          objective_code: component.code,
        }
      );
    }

    if (row.active !== true) {
      throw mappingError(
        BLOCKING_CODES.INACTIVE,
        `Objective code "${component.code}" is not active.`,
        {
          objective_code: component.code,
          objective_id: row.id,
        }
      );
    }

    const registryStudentCode =
      String(row.student_code || '')
        .trim()
        .toUpperCase();

    if (
      !normalizedStudentCode ||
      registryStudentCode !== normalizedStudentCode
    ) {
      throw mappingError(
        BLOCKING_CODES.STUDENT_MISMATCH,
        `Objective "${component.code}" does not belong to student ${normalizedStudentCode || '(unknown)'}.`,
        {
          objective_code: component.code,
          assignment_student_code:
            normalizedStudentCode || null,
          objective_student_code:
            registryStudentCode || null,
        }
      );
    }

    const registryParentCode =
      String(row.parent_goal_code || '')
        .trim()
        .toUpperCase();

    if (
      allowedParents.size === 0 ||
      !allowedParents.has(registryParentCode)
    ) {
      throw mappingError(
        BLOCKING_CODES.PARENT_MISMATCH,
        `Objective "${component.code}" must be paired with its controlling parent goal "${row.parent_goal_code}" on the same assignment item.`,
        {
          objective_code: component.code,
          required_parent_goal_code:
            row.parent_goal_code || null,
          item_parent_goal_codes:
            Array.from(allowedParents),
        }
      );
    }

    resolved.push({
      objective_id: row.id,
      objective_code: component.code,
      component_label: component.label,
      objective_max: component.objective_max,
      component_order: component.component_order,
    });
  }

  return resolved;
}

function getServerHeaders(serviceRoleKey, prefer) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

/**
 * Resolve only the official registry rows needed for this item.
 * No objective_components means no registry request at all.
 */
async function fetchObjectiveRegistryRows({
  fetchFn = global.fetch,
  supabaseUrl,
  serviceRoleKey,
  objective_components,
}) {
  const components =
    normalizeObjectiveComponents(objective_components);

  if (components.length === 0) {
    return [];
  }

  if (typeof fetchFn !== 'function') {
    throw new Error(
      'Objective registry lookup requires fetch.'
    );
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Objective registry lookup requires server Supabase configuration.'
    );
  }

  const codes =
    uniq(components.map(component => component.code));

  const invalidCode =
    codes.find(
      code => !OBJECTIVE_CODE_PATTERN.test(code)
    );

  if (invalidCode) {
    throw mappingError(
      BLOCKING_CODES.NOT_FOUND,
      `Objective code "${invalidCode}" is not a valid official objective identity.`,
      {
        objective_code: invalidCode,
      }
    );
  }

  const inFilter =
    codes
      .map(code => encodeURIComponent(code))
      .join(',');

  const url =
    `${supabaseUrl}/rest/v1/goal_objectives` +
    '?select=id,code,student_code,parent_goal_code,active' +
    `&code=in.(${inFilter})`;

  const response =
    await fetchFn(url, {
      method: 'GET',
      headers: getServerHeaders(serviceRoleKey),
    });

  if (!response.ok) {
    const detail =
      await response.text().catch(() => '');

    throw new Error(
      `goal_objectives lookup failed: ${response.status}` +
      (detail ? ` - ${detail}` : '')
    );
  }

  const rows = await response.json();

  return Array.isArray(rows) ? rows : [];
}

/**
 * Preflight objective metadata for a set of built assignment items.
 *
 * This performs all registry/student/parent validation before assignment-item
 * writes occur. No objective metadata means an exact no-op and no registry
 * request.
 */
async function preflightObjectiveItemMappings({
  fetchFn = global.fetch,
  supabaseUrl,
  serviceRoleKey,
  items,
  studentCode,
}) {
  const allItems =
    Array.isArray(items)
      ? items
      : [];

  const objectiveItems =
    allItems.filter(item => {
      const meta =
        item && item.meta && typeof item.meta === 'object'
          ? item.meta
          : {};

      return (
        (
          Array.isArray(meta.objective_components) &&
          meta.objective_components.length > 0
        ) ||
        meta.objective_components_explicit === true ||
        meta.objective_max_unbound != null ||
        meta.objective_max_invalid_raw != null
      );
    });

  if (objectiveItems.length === 0) {
    return {
      engaged: false,
      student_code: null,
      by_item_ref: {},
    };
  }

  const normalizedStudentCode =
    String(studentCode || '')
      .trim()
      .toUpperCase();

  if (!/^S\d{3}$/.test(normalizedStudentCode)) {
    throw mappingError(
      BLOCKING_CODES.STUDENT_MISMATCH,
      'Objective-mapped assignments must target exactly one explicit S### student.',
      {
        assignment_student_code:
          normalizedStudentCode || null,
      }
    );
  }

  for (const item of objectiveItems) {
    const meta =
      item.meta && typeof item.meta === 'object'
        ? item.meta
        : {};

    if (meta.objective_max_invalid_raw != null) {
      throw mappingError(
        BLOCKING_CODES.MAX_INVALID,
        `Objective Max "${meta.objective_max_invalid_raw}" on item "${item.item_ref}" must be a number greater than zero.`,
        {
          item_ref: item.item_ref,
          objective_max_raw:
            meta.objective_max_invalid_raw,
        }
      );
    }

    if (meta.objective_max_unbound != null) {
      throw mappingError(
        BLOCKING_CODES.MAX_INVALID,
        `Objective Max on item "${item.item_ref}" requires a matching [IO: ...] objective tag.`,
        {
          item_ref: item.item_ref,
          objective_max:
            meta.objective_max_unbound,
        }
      );
    }

    if (
      meta.objective_components_explicit === true &&
      (
        !Array.isArray(meta.objective_components) ||
        meta.objective_components.length === 0
      )
    ) {
      throw mappingError(
        BLOCKING_CODES.AMBIGUOUS,
        `Objective Components block on item "${item.item_ref}" contains no valid objective components.`,
        {
          item_ref: item.item_ref,
        }
      );
    }
  }

  const allComponents =
    objectiveItems.flatMap(item =>
      Array.isArray(item.meta.objective_components)
        ? item.meta.objective_components
        : []
    );

  const registryRows =
    await fetchObjectiveRegistryRows({
      fetchFn,
      supabaseUrl,
      serviceRoleKey,
      objective_components: allComponents,
    });

  const byItemRef = {};

  for (const item of objectiveItems) {
    const meta =
      item.meta && typeof item.meta === 'object'
        ? item.meta
        : {};

    byItemRef[item.item_ref] =
      validateObjectiveComponents({
        objective_components:
          meta.objective_components,
        registryRows,
        studentCode:
          normalizedStudentCode,
        parentGoalCodes:
          item.goal_codes || [],
        allowMultiple:
          meta.objective_components_explicit === true,
      });
  }

  return {
    engaged: true,
    student_code:
      normalizedStudentCode,
    by_item_ref:
      byItemRef,
  };
}

/**
 * Clear every normalized objective mapping belonging to one assignment.
 *
 * Used only when an existing objective-aware assignment is deliberately
 * re-uploaded with all objective metadata removed.
 *
 * This reads assignment_items but never queries goal_objectives.
 */
async function clearAssignmentObjectiveMappings({
  fetchFn = global.fetch,
  supabaseUrl,
  serviceRoleKey,
  assignmentId,
}) {
  if (!assignmentId) {
    throw new Error(
      'assignment objective cleanup requires assignmentId.'
    );
  }

  if (typeof fetchFn !== 'function') {
    throw new Error(
      'assignment objective cleanup requires fetch.'
    );
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'assignment objective cleanup requires server Supabase configuration.'
    );
  }

  const itemsUrl =
    `${supabaseUrl}/rest/v1/assignment_items` +
    '?select=id' +
    `&assignment_id=eq.${encodeURIComponent(assignmentId)}`;

  const itemsResponse =
    await fetchFn(itemsUrl, {
      method: 'GET',
      headers: getServerHeaders(serviceRoleKey),
    });

  if (!itemsResponse.ok) {
    const detail =
      await itemsResponse.text().catch(() => '');

    throw new Error(
      `assignment objective cleanup item lookup failed: ${itemsResponse.status}` +
      (detail ? ` - ${detail}` : '')
    );
  }

  const items =
    await itemsResponse.json();

  const itemIds =
    uniq(
      (Array.isArray(items) ? items : [])
        .map(item => item && item.id)
    );

  if (itemIds.length === 0) {
    return {
      cleared_items: 0,
      assignment_id: assignmentId,
    };
  }

  const inFilter =
    itemIds
      .map(id => encodeURIComponent(id))
      .join(',');

  const deleteUrl =
    `${supabaseUrl}/rest/v1/assignment_item_objectives` +
    `?item_id=in.(${inFilter})`;

  const deleteResponse =
    await fetchFn(deleteUrl, {
      method: 'DELETE',
      headers: getServerHeaders(serviceRoleKey),
    });

  if (!deleteResponse.ok) {
    const detail =
      await deleteResponse.text().catch(() => '');

    throw new Error(
      `assignment objective cleanup failed: ${deleteResponse.status}` +
      (detail ? ` - ${detail}` : '')
    );
  }

  return {
    cleared_items: itemIds.length,
    assignment_id: assignmentId,
  };
}

/**
 * Replace the normalized mapping set for one assignment item.
 *
 * Replacement semantics intentionally remove stale objective mappings when
 * an assignment is re-issued with changed IO metadata.
 */
async function replaceAssignmentItemObjectives({
  fetchFn = global.fetch,
  supabaseUrl,
  serviceRoleKey,
  itemId,
  resolvedMappings,
}) {
  if (!itemId) {
    throw new Error(
      'assignment_item_objectives persistence requires itemId.'
    );
  }

  if (typeof fetchFn !== 'function') {
    throw new Error(
      'assignment_item_objectives persistence requires fetch.'
    );
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'assignment_item_objectives persistence requires server Supabase configuration.'
    );
  }

  const mappings =
    Array.isArray(resolvedMappings)
      ? resolvedMappings
      : [];

  const rpcMappings =
    mappings.map(mapping => ({
      objective_id:
        mapping.objective_id,
      component_label:
        mapping.component_label || null,
      objective_max:
        mapping.objective_max,
      component_order:
        mapping.component_order,
    }));

  const rpcUrl =
    `${supabaseUrl}/rest/v1/rpc/replace_assignment_item_objectives`;

  const rpcResponse =
    await fetchFn(rpcUrl, {
      method: 'POST',
      headers: getServerHeaders(
        serviceRoleKey,
        'return=representation'
      ),
      body: JSON.stringify({
        p_item_id:
          itemId,
        p_mappings:
          rpcMappings,
      }),
    });

  if (!rpcResponse.ok) {
    const detail =
      await rpcResponse.text().catch(() => '');

    throw new Error(
      `assignment_item_objectives atomic replacement failed: ${rpcResponse.status}` +
      (detail ? ` - ${detail}` : '')
    );
  }

  return {
    mapped:
      rpcMappings.length,
    item_id:
      itemId,
  };
}

/**
 * Convenience server operation for one item.
 *
 * No objective_components => exact no-op. This is the primary backward-
 * compatibility boundary for all existing assignments.
 */
async function validateAndPersistObjectiveMappings({
  fetchFn = global.fetch,
  supabaseUrl,
  serviceRoleKey,
  itemId,
  objective_components,
  studentCode,
  parentGoalCodes,
  allowMultiple = false,
}) {
  const components =
    normalizeObjectiveComponents(objective_components);

  if (components.length === 0) {
    return {
      mapped: 0,
      skipped: true,
    };
  }

  const registryRows =
    await fetchObjectiveRegistryRows({
      fetchFn,
      supabaseUrl,
      serviceRoleKey,
      objective_components: components,
    });

  const resolvedMappings =
    validateObjectiveComponents({
      objective_components: components,
      registryRows,
      studentCode,
      parentGoalCodes,
      allowMultiple,
    });

  return replaceAssignmentItemObjectives({
    fetchFn,
    supabaseUrl,
    serviceRoleKey,
    itemId,
    resolvedMappings,
  });
}

module.exports = {
  BLOCKING_CODES,
  normalizeObjectiveComponents,
  validateObjectiveComponents,
  selectAssignmentReuseCandidate,
  hasObjectiveMetadataInAssignmentMeta,
  fetchObjectiveRegistryRows,
  preflightObjectiveItemMappings,
  clearAssignmentObjectiveMappings,
  replaceAssignmentItemObjectives,
  validateAndPersistObjectiveMappings,
};
