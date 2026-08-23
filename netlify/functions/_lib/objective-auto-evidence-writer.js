'use strict';

/**
 * Slice 5B1 — auto-scored child-objective evidence writer.
 *
 * Responsibilities:
 * - detect items that explicitly carry issued IO metadata
 * - read normalized assignment_item_objectives rows only for those items
 * - translate an auto-scored academic performance ratio to Objective Max
 * - preserve question/answer provenance for later evidence catalogs
 * - reconcile one current assignment objective row per:
 *     assignment_instance_id + item_id + objective_id
 *
 * Explicitly NOT responsible for:
 * - Teacher Review component scoring
 * - parent goal_progress writes
 * - parent goal_data_points writes
 * - objective progress aggregation
 * - parent roll-up display
 * - manual/binder objective evidence
 */

function text(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean'
  ) {
    return null;
  }

  if (
    typeof value === 'string' &&
    value.trim() === ''
  ) {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : null;
}

function roundToHundredths(value) {
  return Math.round(
    (value + Number.EPSILON) * 100
  ) / 100;
}

function hasExplicitObjectiveMetadata(item) {
  const meta =
    item &&
    item.meta &&
    typeof item.meta === 'object'
      ? item.meta
      : {};

  return (
    Array.isArray(meta.objective_components) &&
    meta.objective_components.length > 0
  );
}

/**
 * This is the backward-compatibility preflight.
 *
 * Parent-only IG mappings do not count. An item becomes a candidate only
 * because issued assignment metadata explicitly carries child-objective
 * components.
 */
function getObjectiveCandidateItemIds(items) {
  const safeItems =
    Array.isArray(items)
      ? items
      : [];

  const seen = new Set();
  const ids = [];

  for (const item of safeItems) {
    if (
      !item ||
      !hasExplicitObjectiveMetadata(item) ||
      item.id === null ||
      item.id === undefined ||
      String(item.id).trim() === ''
    ) {
      continue;
    }

    const key = String(item.id);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    ids.push(item.id);
  }

  return ids;
}

function serverHeaders(serviceRoleKey, prefer) {
  return {
    apikey: serviceRoleKey,
    Authorization:
      `Bearer ${serviceRoleKey}`,
    'Content-Type':
      'application/json',
    ...(
      prefer
        ? {
            Prefer: prefer,
          }
        : {}
    ),
  };
}

async function readJson(response) {
  if (
    !response ||
    response.status === 204 ||
    typeof response.json !== 'function'
  ) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Read only normalized mappings for items that passed the explicit-IO
 * preflight.
 *
 * itemIds.length === 0 is an exact no-op: fetch is never invoked.
 */
async function fetchAssignmentItemObjectiveMappings({
  itemIds,
  supabaseUrl,
  serviceRoleKey,
  fetchImpl,
}) {
  const safeIds =
    Array.isArray(itemIds)
      ? itemIds.filter(
          value =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ''
        )
      : [];

  if (safeIds.length === 0) {
    return [];
  }

  const actualFetch =
    fetchImpl ||
    global.fetch;

  if (
    typeof actualFetch !== 'function'
  ) {
    throw new Error(
      'Objective mapping lookup requires fetch'
    );
  }

  if (
    !text(supabaseUrl) ||
    !text(serviceRoleKey)
  ) {
    throw new Error(
      'Objective mapping lookup requires server Supabase configuration'
    );
  }

  const uniqueIds =
    Array.from(
      new Set(
        safeIds.map(
          value => String(value)
        )
      )
    );

  const inFilter =
    uniqueIds
      .map(
        value =>
          encodeURIComponent(value)
      )
      .join(',');

  const url =
    `${supabaseUrl}/rest/v1/assignment_item_objectives` +
    `?item_id=in.(${inFilter})` +
    '&select=item_id,objective_id,component_label,objective_max,component_order' +
    '&order=component_order.asc';

  const response =
    await actualFetch(
      url,
      {
        method: 'GET',
        headers:
          serverHeaders(
            serviceRoleKey
          ),
      }
    );

  const data =
    await readJson(response);

  if (
    !response ||
    response.ok !== true
  ) {
    const error =
      new Error(
        `Objective mapping lookup failed with status ${
          response?.status || 500
        }`
      );

    error.status =
      response?.status || 500;

    throw error;
  }

  return Array.isArray(data)
    ? data
    : [];
}

function evidenceText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === 'string'
  ) {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function studentAnswerText(rawAnswer) {
  if (
    rawAnswer &&
    typeof rawAnswer === 'object' &&
    Object.prototype.hasOwnProperty.call(
      rawAnswer,
      'value'
    )
  ) {
    return evidenceText(
      rawAnswer.value
    );
  }

  return evidenceText(
    rawAnswer
  );
}

function mappingsByItemId(mappings) {
  const byItem = new Map();

  const safeMappings =
    Array.isArray(mappings)
      ? mappings
      : [];

  for (const mapping of safeMappings) {
    if (
      !mapping ||
      mapping.item_id === null ||
      mapping.item_id === undefined
    ) {
      continue;
    }

    const key =
      String(mapping.item_id);

    if (!byItem.has(key)) {
      byItem.set(key, []);
    }

    byItem.get(key).push(
      mapping
    );
  }

  return byItem;
}

function answersByItemId(submissionAnswers) {
  const byItem = new Map();

  const safeAnswers =
    Array.isArray(submissionAnswers)
      ? submissionAnswers
      : [];

  for (const answer of safeAnswers) {
    if (
      !answer ||
      answer.assignment_item_id === null ||
      answer.assignment_item_id === undefined
    ) {
      continue;
    }

    byItem.set(
      String(
        answer.assignment_item_id
      ),
      answer
    );
  }

  return byItem;
}

/**
 * Translate current auto-scored submission_answers into objective evidence.
 *
 * Academic points are NEVER copied directly to the child objective.
 *
 * Instead:
 *   performanceRatio = earned_points / max_points
 *   objectiveEarned = performanceRatio * objective_max
 */
function buildAutoObjectiveEvidenceRows({
  items,
  submissionAnswers,
  mappings,
  studentId,
  assignmentInstanceId,
  date,
  schoolYear,
}) {
  const safeItems =
    Array.isArray(items)
      ? items
      : [];

  if (
    !text(String(studentId || '')) ||
    !text(
      String(
        assignmentInstanceId || ''
      )
    )
  ) {
    throw new Error(
      'Objective evidence requires student and assignment instance identity'
    );
  }

  if (!text(String(date || ''))) {
    throw new Error(
      'Objective evidence requires a date'
    );
  }

  const mappingIndex =
    mappingsByItemId(
      mappings
    );

  const answerIndex =
    answersByItemId(
      submissionAnswers
    );

  const rows = [];

  for (const item of safeItems) {
    if (
      !item ||
      !hasExplicitObjectiveMetadata(item) ||
      item.id === null ||
      item.id === undefined
    ) {
      continue;
    }

    const itemKey =
      String(item.id);

    const answer =
      answerIndex.get(itemKey);

    if (!answer) {
      continue;
    }

    /*
     * earned_points == null means this response has not been measured.
     * That is No data — not 0%.
     */
    const academicEarned =
      finiteNumber(
        answer.earned_points
      );

    if (academicEarned === null) {
      continue;
    }

    const academicMax =
      finiteNumber(
        answer.max_points
      );

    if (
      academicMax === null ||
      academicMax <= 0 ||
      academicEarned < 0 ||
      academicEarned > academicMax
    ) {
      throw new Error(
        `Auto-scored item ${itemKey} has invalid academic score identity`
      );
    }

    const itemMappings =
      mappingIndex.get(itemKey) ||
      [];

    /*
     * Parsed IO metadata is not sufficient. Evidence exists only through the
     * normalized assignment_item_objectives mapping created at issuance.
     */
    if (itemMappings.length === 0) {
      continue;
    }

    /*
     * Slice 5B1 intentionally handles only a single mapped objective on an
     * auto-scored item. Multi-component writing requires independent teacher
     * component scores in Slice 5B2.
     */
    if (itemMappings.length !== 1) {
      throw new Error(
        `Auto-scored item ${itemKey} must have exactly one objective mapping in Slice 5B1`
      );
    }

    const mapping =
      itemMappings[0];

    if (!text(mapping.objective_id)) {
      throw new Error(
        `Auto-scored item ${itemKey} has an invalid objective mapping`
      );
    }

    const objectiveMax =
      finiteNumber(
        mapping.objective_max
      );

    if (
      objectiveMax === null ||
      objectiveMax <= 0
    ) {
      throw new Error(
        `Auto-scored item ${itemKey} has an invalid Objective Max`
      );
    }

    const performanceRatio =
      academicEarned /
      academicMax;

    const objectiveEarned =
      roundToHundredths(
        performanceRatio *
        objectiveMax
      );

    const meta =
      item.meta &&
      typeof item.meta === 'object'
        ? item.meta
        : {};

    const questionText =
      evidenceText(
        meta.text ??
        meta.prompt ??
        null
      );

    const choices =
      Array.isArray(meta.choices)
        ? meta.choices
        : null;

    rows.push({
      objective_id:
        mapping.objective_id,
      student_id:
        studentId,
      assignment_instance_id:
        assignmentInstanceId,
      item_id:
        item.id,
      objective_earned:
        objectiveEarned,
      objective_max:
        objectiveMax,
      question_text:
        questionText,
      choices,
      student_answer:
        studentAnswerText(
          answer.raw_answer
        ),
      correct_answer:
        evidenceText(
          meta.correct
        ),
      is_correct:
        typeof answer.is_correct ===
        'boolean'
          ? answer.is_correct
          : null,
      component_label:
        text(
          mapping.component_label
        ) || null,
      support_level:
        null,
      evidence_type:
        'question',
      source:
        'assignment',
      notes:
        null,
      date:
        String(date),
      school_year:
        schoolYear === null ||
        schoolYear === undefined
          ? null
          : String(schoolYear),
    });
  }

  return rows;
}

function requireAssignmentObjectiveIdentity(
  row
) {
  if (
    !row ||
    row.source !== 'assignment'
  ) {
    throw new Error(
      'Objective evidence reconciliation requires source === assignment'
    );
  }

  if (
    !text(row.objective_id) ||
    !text(
      row.assignment_instance_id
    ) ||
    row.item_id === null ||
    row.item_id === undefined ||
    String(row.item_id).trim() === ''
  ) {
    throw new Error(
      'Objective evidence reconciliation requires assignment_instance_id, item_id, and objective_id'
    );
  }
}

function objectiveIdentityParams(row) {
  const params =
    new URLSearchParams();

  params.set(
    'assignment_instance_id',
    `eq.${row.assignment_instance_id}`
  );

  params.set(
    'item_id',
    `eq.${row.item_id}`
  );

  params.set(
    'objective_id',
    `eq.${row.objective_id}`
  );

  params.set(
    'source',
    'eq.assignment'
  );

  return params;
}

async function request({
  supabaseUrl,
  serviceRoleKey,
  path,
  method = 'GET',
  body,
  fetchImpl,
}) {
  const actualFetch =
    fetchImpl ||
    global.fetch;

  if (
    typeof actualFetch !== 'function'
  ) {
    throw new Error(
      'Objective evidence reconciliation requires fetch'
    );
  }

  if (
    !text(supabaseUrl) ||
    !text(serviceRoleKey)
  ) {
    throw new Error(
      'Objective evidence reconciliation requires server Supabase configuration'
    );
  }

  const response =
    await actualFetch(
      `${supabaseUrl}${path}`,
      {
        method,
        headers:
          serverHeaders(
            serviceRoleKey,
            method === 'GET'
              ? null
              : 'return=representation'
          ),
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body),
      }
    );

  const data =
    await readJson(response);

  if (
    !response ||
    response.ok !== true
  ) {
    const error =
      new Error(
        `Objective evidence reconciliation failed with status ${
          response?.status || 500
        }`
      );

    error.status =
      response?.status || 500;

    throw error;
  }

  return {
    status:
      response.status,
    data,
  };
}

async function reconcileOne({
  row,
  supabaseUrl,
  serviceRoleKey,
  fetchImpl,
}) {
  requireAssignmentObjectiveIdentity(
    row
  );

  const identity =
    objectiveIdentityParams(
      row
    );

  const lookup =
    new URLSearchParams(
      identity
    );

  lookup.set(
    'select',
    'id,created_at'
  );

  lookup.set(
    'order',
    'created_at.desc,id.desc'
  );

  const existing =
    await request({
      supabaseUrl,
      serviceRoleKey,
      fetchImpl,
      path:
        '/rest/v1/objective_data_points?' +
        lookup.toString(),
    });

  const existingRows =
    Array.isArray(existing.data)
      ? existing.data
      : [];

  if (
    existingRows.length > 0
  ) {
    const canonical =
      existingRows[0];

    if (
      !canonical ||
      canonical.id === null ||
      canonical.id === undefined ||
      String(
        canonical.id
      ).trim() === ''
    ) {
      throw new Error(
        'Objective evidence reconciliation could not resolve canonical row id'
      );
    }

    const patchIdentity =
      new URLSearchParams(
        identity
      );

    patchIdentity.set(
      'id',
      `eq.${canonical.id}`
    );

    const updated =
      await request({
        supabaseUrl,
        serviceRoleKey,
        fetchImpl,
        path:
          '/rest/v1/objective_data_points?' +
          patchIdentity.toString(),
        method:
          'PATCH',
        body:
          row,
      });

    return {
      action:
        'updated',
      matched_count:
        existingRows.length,
      rows:
        Array.isArray(
          updated.data
        )
          ? updated.data
          : [],
    };
  }

  const inserted =
    await request({
      supabaseUrl,
      serviceRoleKey,
      fetchImpl,
      path:
        '/rest/v1/objective_data_points',
      method:
        'POST',
      body:
        row,
    });

  return {
    action:
      'inserted',
    matched_count:
      0,
    rows:
      Array.isArray(
        inserted.data
      )
        ? inserted.data
        : [],
  };
}

async function reconcileAssignmentObjectiveDataPoints({
  rows,
  supabaseUrl,
  serviceRoleKey,
  fetchImpl,
}) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  const results = [];

  for (const row of safeRows) {
    results.push(
      await reconcileOne({
        row,
        supabaseUrl,
        serviceRoleKey,
        fetchImpl,
      })
    );
  }

  return results;
}

module.exports = {
  getObjectiveCandidateItemIds,
  fetchAssignmentItemObjectiveMappings,
  buildAutoObjectiveEvidenceRows,
  reconcileAssignmentObjectiveDataPoints,
};
