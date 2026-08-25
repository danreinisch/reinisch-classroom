'use strict';

/**
 * Slice 5C1 — shared objective progress/evidence reader foundation.
 *
 * This module is intentionally server-only and read-only.
 *
 * Responsibilities:
 * - preflight parent goals against the canonical objective catalog
 * - resolve normalized goal_objectives UUID identity
 * - read normalized objective_data_points evidence
 * - apply one explicit quarter calculation window
 * - reuse Slice 5A objective math
 * - project browser-safe evidence without internal UUIDs
 * - preserve same-quarter existing parent progress as fallback
 *
 * Explicitly NOT responsible for:
 * - choosing quarter dates
 * - changing quarter configuration
 * - writing objective or parent evidence
 * - activating goal_objectives
 * - activating or invoking the objective registry import
 * - mastery decisions
 * - trend calculations
 * - academic assignment scoring
 */

const {
  summarizeObjectiveEvidence,
  rollUpParentObjectives,
  selectParentDisplayProgress,
} = require('./objective-progress');

const {
  getObjectivesForParentGoal,
} = require('./goal-objective-catalog');

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    (
      typeof value === 'string' &&
      value.trim() === ''
    )
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function dateOnly(value) {
  if (
    typeof value === 'string'
  ) {
    const candidate =
      value.trim().slice(0, 10);

    return DATE_PATTERN.test(candidate)
      ? candidate
      : null;
  }

  if (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    return value
      .toISOString()
      .slice(0, 10);
  }

  return null;
}

function normalizeQuarterRange(value) {
  const start =
    dateOnly(
      value && value.start
    );

  const end =
    dateOnly(
      value && value.end
    );

  if (
    !start ||
    !end ||
    start > end
  ) {
    return null;
  }

  const quarter =
    typeof value?.quarter === 'string'
      ? value.quarter
          .trim()
          .toUpperCase()
      : null;

  return {
    quarter:
      /^(Q1|Q2|Q3|Q4)$/.test(
        quarter || ''
      )
        ? quarter
        : null,
    start,
    end,
  };
}

function filterRowsToQuarter(
  rows,
  quarterRange,
) {
  const range =
    normalizeQuarterRange(
      quarterRange
    );

  if (!range) {
    return [];
  }

  return (
    Array.isArray(rows)
      ? rows
      : []
  ).filter(row => {
    const date =
      dateOnly(
        row && row.date
      );

    return (
      date !== null &&
      date >= range.start &&
      date <= range.end
    );
  });
}

function compareNewest(
  a,
  b,
) {
  const dateA =
    String(a?.date || '');

  const dateB =
    String(b?.date || '');

  if (dateA !== dateB) {
    return dateB.localeCompare(
      dateA
    );
  }

  const createdA =
    String(a?.created_at || '');

  const createdB =
    String(b?.created_at || '');

  if (createdA !== createdB) {
    return createdB.localeCompare(
      createdA
    );
  }

  return String(b?.id || '')
    .localeCompare(
      String(a?.id || '')
    );
}

function getLatestParentPercentage(
  parentProgressRows,
  parentGoalId,
  quarterRange = null,
) {
  const rows =
    quarterRange
      ? filterRowsToQuarter(
          parentProgressRows,
          quarterRange
        )
      : (
          Array.isArray(
            parentProgressRows
          )
            ? parentProgressRows
            : []
        );

  const candidates =
    rows
      .filter(row =>
        row &&
        row.goal_id === parentGoalId
      )
      .slice()
      .sort(compareNewest);

  for (const row of candidates) {
    const value =
      finiteNumber(
        row.value !== undefined
          ? row.value
          : row.percent
      );

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function projectEvidence(row) {
  return {
    date:
      dateOnly(row?.date),
    source:
      row?.source || null,
    objective_earned:
      finiteNumber(
        row?.objective_earned
      ),
    objective_max:
      finiteNumber(
        row?.objective_max
      ),
    question_text:
      row?.question_text ?? null,
    choices:
      row?.choices ?? null,
    student_answer:
      row?.student_answer ?? null,
    correct_answer:
      row?.correct_answer ?? null,
    is_correct:
      typeof row?.is_correct ===
        'boolean'
        ? row.is_correct
        : null,
    answer_review_available:
      typeof row
        ?.answer_review_available ===
        'boolean'
        ? row.answer_review_available
        : null,
    component_label:
      row?.component_label ?? null,
    support_level:
      row?.support_level ?? null,
    evidence_type:
      row?.evidence_type ?? null,
  };
}

function canonicalParents(
  parentGoals,
) {
  return (
    Array.isArray(parentGoals)
      ? parentGoals
      : []
  )
    .map(parent => {
      if (
        !parent ||
        typeof parent.id !== 'string' ||
        typeof parent.student_id !==
          'string'
      ) {
        return null;
      }

      const studentCode =
        String(
          parent.student_code || ''
        )
          .trim()
          .toUpperCase();

      const parentCode =
        String(
          parent.code || ''
        )
          .trim()
          .toUpperCase();

      const objectives =
        getObjectivesForParentGoal(
          parentCode,
          studentCode
        );

      if (objectives.length === 0) {
        return null;
      }

      return {
        id: parent.id,
        student_id:
          parent.student_id,
        student_code:
          studentCode,
        code:
          parentCode,
        objectives,
      };
    })
    .filter(Boolean);
}

function buildObjectiveProgressBundle({
  parentGoals,
  registryRows,
  evidenceRows,
  parentProgressRows,
  quarterRange,
} = {}) {
  const range =
    normalizeQuarterRange(
      quarterRange
    );

  const parents =
    canonicalParents(
      parentGoals
    );

  const safeRegistry =
    Array.isArray(registryRows)
      ? registryRows
      : [];

  const quarterEvidence =
    range
      ? filterRowsToQuarter(
          evidenceRows,
          range
        )
      : (
          Array.isArray(evidenceRows)
            ? evidenceRows
            : []
        );

  return {
    available: true,
    parents:
      parents.map(parent => {
        const parentRegistry =
          safeRegistry.filter(row =>
            row &&
            row.parent_goal_id ===
              parent.id &&
            row.student_id ===
              parent.student_id
          );

        const registryByCode =
          new Map(
            parentRegistry.map(
              row => [
                String(
                  row.code || ''
                )
                  .trim()
                  .toUpperCase(),
                row,
              ]
            )
          );

        const objectives =
          parent.objectives.map(
            definition => {
              const registry =
                registryByCode.get(
                  definition.code
                );

              const rows =
                registry
                  ? quarterEvidence
                      .filter(
                        row =>
                          row &&
                          row.objective_id ===
                            registry.id &&
                          row.student_id ===
                            parent.student_id
                      )
                      .slice()
                      .sort(
                        compareNewest
                      )
                  : [];

              const summary =
                summarizeObjectiveEvidence(
                  rows
                );

              return {
                code:
                  definition.code,
                objective_number:
                  definition.objective_number,
                objective_text:
                  definition.objective_text,
                goal_area:
                  definition.goal_area ??
                  null,
                baseline:
                  definition.baseline ??
                  null,
                objective_wording_criterion:
                  definition
                    .objective_wording_criterion ??
                  null,
                mastery_field:
                  definition.mastery_field ??
                  null,
                parent_goal_criterion:
                  definition
                    .parent_goal_criterion ??
                  null,
                earned:
                  summary.earned,
                max:
                  summary.max,
                percentage:
                  summary.percentage,
                evidence_count:
                  summary.evidence_count,
                evidence:
                  rows.map(
                    projectEvidence
                  ),
              };
            }
          );

        const rollup =
          rollUpParentObjectives(
            objectives
          );

        const existingParent =
          getLatestParentPercentage(
            parentProgressRows,
            parent.id,
            range
          );

        const display =
          selectParentDisplayProgress({
            objective_rollup:
              rollup,
            existing_parent_percentage:
              existingParent,
          });

        return {
          parent_goal_code:
            parent.code,
          percentage:
            display.percentage,
          source:
            display.source,
          coverage: {
            objectives_with_data:
              display
                .objectives_with_data,
            total_objectives:
              display
                .total_objectives,
          },
          objectives,
        };
      }),
  };
}

function responseText(result) {
  if (
    typeof result?.text === 'string'
  ) {
    return result.text.toLowerCase();
  }

  try {
    return JSON.stringify(
      result?.data || {}
    ).toLowerCase();
  } catch (_) {
    return '';
  }
}

function isSchemaUnavailable(
  result,
) {
  if (
    !result ||
    result.ok === true
  ) {
    return false;
  }

  if (
    result.status === 404 ||
    result.status === 406
  ) {
    return true;
  }

  if (result.status !== 400) {
    return false;
  }

  const text =
    responseText(result);

  return (
    text.includes('pgrst205') ||
    text.includes('schema cache') ||
    (
      text.includes('relation') &&
      text.includes('does not exist')
    ) ||
    (
      text.includes('table') &&
      text.includes('does not exist')
    )
  );
}

async function readJson(
  fetchImpl,
  url,
  init,
) {
  const response =
    await fetchImpl(
      url,
      init
    );

  const text =
    await response
      .text()
      .catch(() => '');

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch (_) {
    data = text;
  }

  return {
    ok:
      response.ok === true,
    status:
      response.status,
    data,
    text,
  };
}

function inFilter(values) {
  return (
    'in.(' +
    values
      .map(value =>
        String(value)
      )
      .join(',') +
    ')'
  );
}

function serverHeaders(
  serviceRoleKey,
) {
  const headers = {
    'Content-Type':
      'application/json',
  };

  if (serviceRoleKey) {
    headers.apikey =
      serviceRoleKey;

    headers.Authorization =
      `Bearer ${serviceRoleKey}`;
  }

  return headers;
}

function validateRegistry(
  parents,
  registryRows,
) {
  const expected = [];

  for (const parent of parents) {
    for (
      const definition
      of parent.objectives
    ) {
      expected.push({
        parent,
        definition,
      });
    }
  }

  if (
    !Array.isArray(registryRows) ||
    registryRows.length === 0
  ) {
    return {
      ok: false,
      reason:
        'registry_not_activated',
    };
  }

  if (
    registryRows.length !==
    expected.length
  ) {
    return {
      ok: false,
      reason:
        'registry_mismatch',
    };
  }

  const byCode =
    new Map();

  for (const row of registryRows) {
    const code =
      String(row?.code || '')
        .trim()
        .toUpperCase();

    if (
      !code ||
      byCode.has(code)
    ) {
      return {
        ok: false,
        reason:
          'registry_mismatch',
      };
    }

    byCode.set(code, row);
  }

  for (
    const {
      parent,
      definition,
    }
    of expected
  ) {
    const row =
      byCode.get(
        definition.code
      );

    if (
      !row ||
      row.active !== true ||
      row.student_id !==
        parent.student_id ||
      row.parent_goal_id !==
        parent.id ||
      String(
        row.student_code || ''
      )
        .trim()
        .toUpperCase() !==
          parent.student_code ||
      String(
        row.parent_goal_code || ''
      )
        .trim()
        .toUpperCase() !==
          parent.code ||
      Number(
        row.objective_number
      ) !==
        Number(
          definition.objective_number
        )
    ) {
      return {
        ok: false,
        reason:
          'registry_mismatch',
      };
    }
  }

  return {
    ok: true,
  };
}

async function readObjectiveProgress({
  parentGoals,
  parentProgressRows,
  quarterRange,
  evidenceRowsTransform = null,
  fetchImpl = global.fetch,
  supabaseUrl =
    process.env.SUPABASE_URL || '',
  serviceRoleKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY ||
    '',
} = {}) {
  const parents =
    canonicalParents(
      parentGoals
    );

  /*
   * Exact no-objective compatibility:
   * if none of the authorized parent goals has canonical children,
   * do not touch dormant objective tables at all.
   */
  if (parents.length === 0) {
    return {
      available: true,
      parents: [],
    };
  }

  const range =
    normalizeQuarterRange(
      quarterRange
    );

  if (!range) {
    return {
      available: false,
      reason:
        'quarter_range_required',
      parents: [],
    };
  }

  if (
    typeof fetchImpl !==
    'function'
  ) {
    return {
      available: false,
      reason:
        'query_failed',
      parents: [],
    };
  }

  const headers =
    serverHeaders(
      serviceRoleKey
    );

  const registryParams =
    new URLSearchParams();

  registryParams.set(
    'select',
    [
      'id',
      'student_id',
      'parent_goal_id',
      'student_code',
      'parent_goal_code',
      'code',
      'objective_number',
      'active',
    ].join(',')
  );

  registryParams.set(
    'parent_goal_id',
    inFilter(
      parents.map(
        parent => parent.id
      )
    )
  );

  registryParams.set(
    'active',
    'eq.true'
  );

  registryParams.set(
    'order',
    'parent_goal_id.asc,objective_number.asc'
  );

  const registryUrl =
    `${supabaseUrl}` +
    '/rest/v1/goal_objectives?' +
    registryParams.toString();

  const registryResult =
    await readJson(
      fetchImpl,
      registryUrl,
      {
        method: 'GET',
        headers,
      }
    );

  if (
    isSchemaUnavailable(
      registryResult
    )
  ) {
    return {
      available: false,
      reason:
        'schema_unavailable',
      parents: [],
    };
  }

  if (!registryResult.ok) {
    return {
      available: false,
      reason:
        'query_failed',
      parents: [],
    };
  }

  const registryRows =
    Array.isArray(
      registryResult.data
    )
      ? registryResult.data
      : [];

  const registryCheck =
    validateRegistry(
      parents,
      registryRows
    );

  if (!registryCheck.ok) {
    return {
      available: false,
      reason:
        registryCheck.reason,
      parents: [],
    };
  }

  const objectiveIds =
    registryRows.map(
      row => row.id
    );

  const evidenceParams =
    new URLSearchParams();

  evidenceParams.set(
    'select',
    [
      'id',
      'objective_id',
      'student_id',
      'assignment_instance_id',
      'item_id',
      'objective_earned',
      'objective_max',
      'question_text',
      'choices',
      'student_answer',
      'correct_answer',
      'is_correct',
      'component_label',
      'support_level',
      'evidence_type',
      'source',
      'notes',
      'date',
      'school_year',
      'created_at',
    ].join(',')
  );

  evidenceParams.set(
    'objective_id',
    inFilter(
      objectiveIds
    )
  );

  /*
   * Quarter reset is implemented as a calculation/read window.
   * Historical rows stay stored and remain available to later
   * quarter/reporting readers.
   */
  evidenceParams.append(
    'date',
    `gte.${range.start}`
  );

  evidenceParams.append(
    'date',
    `lte.${range.end}`
  );

  evidenceParams.set(
    'order',
    'date.desc,created_at.desc'
  );

  const evidenceUrl =
    `${supabaseUrl}` +
    '/rest/v1/objective_data_points?' +
    evidenceParams.toString();

  const evidenceResult =
    await readJson(
      fetchImpl,
      evidenceUrl,
      {
        method: 'GET',
        headers,
      }
    );

  if (
    isSchemaUnavailable(
      evidenceResult
    )
  ) {
    return {
      available: false,
      reason:
        'schema_unavailable',
      parents: [],
    };
  }

  if (!evidenceResult.ok) {
    return {
      available: false,
      reason:
        'query_failed',
      parents: [],
    };
  }

  const evidenceRowsRaw =
    Array.isArray(
      evidenceResult.data
    )
      ? evidenceResult.data
      : [];

  /*
   * Optional caller-owned raw evidence transform.
   *
   * Default = exact 5C1 behavior.
   *
   * Student-facing callers may use this before browser-safe projection
   * to enforce assignment release rules while assignment-instance
   * provenance is still available.
   */
  const evidenceRows =
    typeof evidenceRowsTransform ===
      'function'
      ? await evidenceRowsTransform(
          evidenceRowsRaw
        )
      : evidenceRowsRaw;

  if (
    !Array.isArray(
      evidenceRows
    )
  ) {
    return {
      available: false,
      reason:
        'evidence_transform_failed',
      parents: [],
    };
  }

  return buildObjectiveProgressBundle({
    parentGoals: parents,
    registryRows,
    evidenceRows,
    parentProgressRows,
    quarterRange: range,
  });
}

module.exports = {
  normalizeQuarterRange,
  filterRowsToQuarter,
  getLatestParentPercentage,
  buildObjectiveProgressBundle,
  readObjectiveProgress,
};
