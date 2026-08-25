'use strict';

/**
 * Slice 5C3A — Student Goal Explanation Foundation.
 *
 * Purpose:
 * Turn server-authorized goal progress/evidence into one browser-safe
 * explanation model:
 *
 *   displayed percentage
 *        ↓
 *   how that number was calculated
 *        ↓
 *   evidence that actually participated
 *
 * This module is pure and read-only.
 * It does not query Supabase and does not write anything.
 */

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
      value.slice(0, 10);

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
    typeof value?.quarter === 'string' &&
    /^Q[1-4]$/.test(value.quarter)
      ? value.quarter
      : null;

  return {
    quarter,
    start,
    end,
  };
}

function roundOne(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return null;
  }

  return Math.round(
    number * 10
  ) / 10;
}

function compareNewest(a, b) {
  const dateA =
    dateOnly(a?.date) || '';

  const dateB =
    dateOnly(b?.date) || '';

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

/**
 * Canonical historical duplicate ordering.
 *
 * Instructional date answers WHEN evidence belongs.
 * created_at + id answer WHICH duplicate row is canonical.
 *
 * This must stay aligned with Slice 3:
 *   created_at DESC, id DESC
 */
function compareCanonicalNewest(a, b) {
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

function inQuarter(
  row,
  range,
) {
  const date =
    dateOnly(
      row && row.date
    );

  return (
    date !== null &&
    date >= range.start &&
    date <= range.end
  );
}

function buildInstanceMap(rows) {
  const map =
    new Map();

  for (
    const row of
    Array.isArray(rows)
      ? rows
      : []
  ) {
    if (!row?.id) {
      continue;
    }

    map.set(
      String(row.id),
      row
    );
  }

  return map;
}

function instanceFor(
  row,
  instances,
) {
  const sourceId =
    row?.assignment_instance_id;

  if (!sourceId) {
    return null;
  }

  return (
    instances.get(
      String(sourceId)
    ) || null
  );
}

function isNonInstructional(
  row,
  instances,
) {
  const sourceId =
    row?.assignment_instance_id;

  if (!sourceId) {
    return false;
  }

  const instance =
    instanceFor(
      row,
      instances
    );

  return (
    instance?.settings
      ?.non_instructional ===
    true
  );
}

function isAnswerReviewReleased(
  row,
  instances,
) {
  if (
    row?.source !== 'assignment' ||
    !row?.assignment_instance_id
  ) {
    return false;
  }

  const instance =
    instanceFor(
      row,
      instances
    );

  const status =
    String(
      instance?.status || ''
    ).trim();

  return (
    status === 'Graded' ||
    status === 'Reviewed'
  );
}

/**
 * Preserve every legitimate manual/unlinked checkpoint, but collapse
 * assignment-linked duplicates to the newest canonical row for:
 *
 *   assignment instance + parent goal
 *
 * This mirrors the future-write reconciliation identity without deleting
 * historical rows.
 */
function dedupeParentProgress(rows) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  const output = [];
  const assignmentRows =
    new Map();

  safeRows.forEach(
    (row, index) => {
      if (
        !row ||
        !row.assignment_instance_id ||
        !row.goal_id
      ) {
        output.push({
          index,
          row,
        });
        return;
      }

      const key = [
        row.assignment_instance_id,
        row.goal_id,
      ].join('|');

      const existing =
        assignmentRows.get(key);

      if (
        !existing ||
        compareCanonicalNewest(
          row,
          existing.row
        ) < 0
      ) {
        assignmentRows.set(
          key,
          {
            index,
            row,
          }
        );
      }
    }
  );

  output.push(
    ...assignmentRows.values()
  );

  output.sort(
    (a, b) =>
      a.index - b.index
  );

  return output.map(
    entry => entry.row
  );
}

/**
 * Existing Slice 3 identity:
 *
 *   assignment instance + item + parent goal
 *
 * Manual/unlinked evidence remains a separate legitimate event.
 */
function dedupeParentDataPoints(rows) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  const output = [];
  const assignmentRows =
    new Map();

  safeRows.forEach(
    (row, index) => {
      if (
        !row ||
        !row.assignment_instance_id ||
        row.item_id === null ||
        row.item_id === undefined ||
        !row.goal_id
      ) {
        output.push({
          index,
          row,
        });
        return;
      }

      const key = [
        row.assignment_instance_id,
        row.item_id,
        row.goal_id,
      ].join('|');

      const existing =
        assignmentRows.get(key);

      if (
        !existing ||
        compareCanonicalNewest(
          row,
          existing.row
        ) < 0
      ) {
        assignmentRows.set(
          key,
          {
            index,
            row,
          }
        );
      }
    }
  );

  output.push(
    ...assignmentRows.values()
  );

  output.sort(
    (a, b) =>
      a.index - b.index
  );

  return output.map(
    entry => entry.row
  );
}

function projectParentEvidence(
  row,
  instances,
) {
  const released =
    isAnswerReviewReleased(
      row,
      instances
    );

  return {
    date:
      dateOnly(row?.date),
    source:
      row?.source || null,
    question_text:
      row?.question_text ?? null,
    choices:
      Array.isArray(row?.choices)
        ? row.choices
        : (
            row?.choices &&
            typeof row.choices ===
              'object'
              ? row.choices
              : null
          ),
    student_answer:
      row?.student_answer ?? null,
    answer_review_available:
      released,
    correct_answer:
      released
        ? (
            row?.correct_answer ??
            null
          )
        : null,
    is_correct:
      released &&
      typeof row?.is_correct ===
        'boolean'
        ? row.is_correct
        : null,
    score:
      released
        ? finiteNumber(
            row?.score
          )
        : null,
  };
}

function evidenceForCheckpoint({
  checkpoint,
  goalId,
  points,
  instances,
}) {
  const sourceId =
    checkpoint
      ?.assignment_instance_id;

  /*
   * Exact provenance only.
   *
   * Assignment-linked parent evidence can be attached to a checkpoint
   * because both rows carry the same assignment_instance_id.
   *
   * Manual/unlinked rows do not carry a stable identity connecting a
   * goal_data_point to one specific goal_progress checkpoint. A shared
   * goal/date is not enough: multiple legitimate manual checkpoints may
   * exist on the same day.
   *
   * Therefore manual/unlinked checkpoints remain valid calculation inputs,
   * but no question-level evidence is claimed for them unless a future
   * explicit provenance identity exists.
   */
  if (!sourceId) {
    return [];
  }

  return points
    .filter(
      point =>
        String(
          point?.goal_id || ''
        ) ===
          String(goalId || '') &&
        String(
          point
            ?.assignment_instance_id ||
          ''
        ) ===
          String(sourceId)
    )
    .sort(compareNewest)
    .map(
      row =>
        projectParentEvidence(
          row,
          instances
        )
    );
}

function projectCheckpoint({
  checkpoint,
  goalId,
  points,
  instances,
}) {
  return {
    date:
      dateOnly(
        checkpoint?.date
      ),
    value:
      finiteNumber(
        checkpoint?.value !==
          undefined
          ? checkpoint.value
          : checkpoint?.percent
      ),
    source:
      checkpoint?.source || null,
    evidence:
      evidenceForCheckpoint({
        checkpoint,
        goalId,
        points,
        instances,
      }),
  };
}

function ordinaryExplanation({
  goal,
  progressRows,
  points,
  instances,
}) {
  const rows =
    progressRows
      .filter(
        row =>
          String(
            row?.goal_id || ''
          ) ===
          String(goal?.id || '')
      )
      .filter(
        row =>
          finiteNumber(
            row?.value !==
              undefined
              ? row.value
              : row?.percent
          ) !== null
      )
      .sort(compareNewest);

  const inputs =
    rows.map(
      checkpoint =>
        projectCheckpoint({
          checkpoint,
          goalId: goal?.id,
          points,
          instances,
        })
    );

  const values =
    inputs
      .map(row =>
        finiteNumber(row.value)
      )
      .filter(
        value => value !== null
      );

  const percentage =
    values.length > 0
      ? roundOne(
          values.reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
          values.length
        )
      : null;

  return {
    percentage,
    source:
      values.length > 0
        ? 'ordinary_quarter_average'
        : 'no_data',
    calculation: {
      kind:
        'quarter_checkpoint_mean',
      checkpoint_count:
        values.length,
      inputs,
    },
  };
}

function latestParentFallback({
  goal,
  progressRows,
  points,
  instances,
  percentage,
}) {
  const newest =
    progressRows
      .filter(
        row =>
          String(
            row?.goal_id || ''
          ) ===
          String(goal?.id || '')
      )
      .filter(
        row =>
          finiteNumber(
            row?.value !==
              undefined
              ? row.value
              : row?.percent
          ) !== null
      )
      .sort(compareNewest)[0] ||
    null;

  return {
    percentage:
      finiteNumber(percentage),
    source:
      'existing_parent',
    calculation: {
      kind:
        'same_quarter_parent_fallback',
      checkpoint_count:
        newest ? 1 : 0,
      inputs:
        newest
          ? [
              projectCheckpoint({
                checkpoint: newest,
                goalId: goal?.id,
                points,
                instances,
              }),
            ]
          : [],
    },
  };
}

function normalizeCoverage(
  parent,
  objectives,
) {
  const coverage =
    parent?.coverage &&
    typeof parent.coverage ===
      'object'
      ? parent.coverage
      : {};

  const withData =
    finiteNumber(
      coverage.with_data ??
      coverage.objectives_with_data
    );

  const total =
    finiteNumber(
      coverage.total ??
      coverage.total_objectives
    );

  return {
    with_data:
      withData !== null
        ? withData
        : objectives.filter(
            objective =>
              finiteNumber(
                objective?.percentage
              ) !== null
          ).length,
    total:
      total !== null
        ? total
        : objectives.length,
  };
}

function projectObjectiveEvidence(row) {
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
    answer_review_available:
      typeof row
        ?.answer_review_available ===
        'boolean'
        ? row
            .answer_review_available
        : null,
    correct_answer:
      row?.correct_answer ?? null,
    is_correct:
      typeof row?.is_correct ===
        'boolean'
        ? row.is_correct
        : null,
    component_label:
      row?.component_label ?? null,
    support_level:
      row?.support_level ?? null,
    evidence_type:
      row?.evidence_type ?? null,
  };
}

function projectObjective(
  objective,
) {
  const evidence =
    (
      Array.isArray(
        objective?.evidence
      )
        ? objective.evidence
        : []
    )
      .map(
        projectObjectiveEvidence
      )
      .sort(compareNewest);

  return {
    code:
      objective?.code || null,
    objective_number:
      finiteNumber(
        objective?.objective_number
      ),
    objective_text:
      objective?.objective_text ??
      null,
    baseline:
      objective?.baseline ?? null,
    objective_wording_criterion:
      objective
        ?.objective_wording_criterion ??
      null,
    mastery_field:
      objective?.mastery_field ??
      null,
    parent_goal_criterion:
      objective
        ?.parent_goal_criterion ??
      null,
    earned:
      finiteNumber(
        objective?.earned
      ),
    max:
      finiteNumber(
        objective?.max
      ),
    percentage:
      finiteNumber(
        objective?.percentage
      ),
    evidence_count:
      finiteNumber(
        objective?.evidence_count
      ) ?? evidence.length,
    evidence,
  };
}

function objectiveRollupExplanation(
  parent,
  objectives,
) {
  const measured =
    objectives
      .filter(
        objective =>
          finiteNumber(
            objective?.percentage
          ) !== null
      )
      .map(
        objective => ({
          objective_number:
            objective
              .objective_number,
          objective_text:
            objective
              .objective_text,
          percentage:
            finiteNumber(
              objective
                .percentage
            ),
          earned:
            finiteNumber(
              objective.earned
            ),
          max:
            finiteNumber(
              objective.max
            ),
          evidence_count:
            finiteNumber(
              objective
                .evidence_count
            ) ?? 0,
        })
      );

  return {
    percentage:
      finiteNumber(
        parent?.percentage
      ),
    source:
      'objective_rollup',
    calculation: {
      kind:
        'objective_equal_weight_mean',
      measured_objective_count:
        measured.length,
      inputs:
        measured,
    },
  };
}

function findObjectiveParent(
  objectiveProgress,
  goalCode,
) {
  if (
    objectiveProgress
      ?.available !== true
  ) {
    return null;
  }

  return (
    (
      Array.isArray(
        objectiveProgress.parents
      )
        ? objectiveProgress.parents
        : []
    ).find(
      parent =>
        String(
          parent
            ?.parent_goal_code ||
          ''
        ) ===
        String(goalCode || '')
    ) || null
  );
}

function buildStudentGoalExplanationBundle({
  quarterRange,
  goals,
  parentProgressRows,
  parentDataPointRows,
  assignmentInstances,
  objectiveProgress,
} = {}) {
  const range =
    normalizeQuarterRange(
      quarterRange
    );

  if (!range) {
    return {
      available: false,
      reason:
        'quarter_range_required',
      quarter: null,
      goals: [],
    };
  }

  const instances =
    buildInstanceMap(
      assignmentInstances
    );

  const quarterProgress =
    dedupeParentProgress(
      (
        Array.isArray(
          parentProgressRows
        )
          ? parentProgressRows
          : []
      )
        .filter(
          row =>
            inQuarter(
              row,
              range
            )
        )
        .filter(
          row =>
            !isNonInstructional(
              row,
              instances
            )
        )
    );

  const quarterPoints =
    dedupeParentDataPoints(
      (
        Array.isArray(
          parentDataPointRows
        )
          ? parentDataPointRows
          : []
      )
        .filter(
          row =>
            inQuarter(
              row,
              range
            )
        )
        .filter(
          row =>
            !isNonInstructional(
              row,
              instances
            )
        )
    );

  const safeGoals =
    Array.isArray(goals)
      ? goals
      : [];

  const resultGoals =
    safeGoals.map(goal => {
      const hasObjectives =
        Array.isArray(
          goal?.objectives
        ) &&
        goal.objectives.length > 0;

      const objectiveParent =
        hasObjectives
          ? findObjectiveParent(
              objectiveProgress,
              goal?.code
            )
          : null;

      /*
       * Objective-aware path.
       *
       * The helper trusts the shared 5C1 reader for all child math.
       * It does not recalculate child percentages.
       */
      if (
        hasObjectives &&
        objectiveParent
      ) {
        const objectives =
          (
            Array.isArray(
              objectiveParent
                .objectives
            )
              ? objectiveParent
                  .objectives
              : []
          ).map(
            projectObjective
          );

        const coverage =
          normalizeCoverage(
            objectiveParent,
            objectives
          );

        const explanation =
          objectiveParent.source ===
          'existing_parent'
            ? latestParentFallback({
                goal,
                progressRows:
                  quarterProgress,
                points:
                  quarterPoints,
                instances,
                percentage:
                  objectiveParent
                    .percentage,
              })
            : objectiveRollupExplanation(
                objectiveParent,
                objectives
              );

        return {
          goal_code:
            goal?.code || null,
          measurement_type:
            goal
              ?.measurement_type ??
            null,
          percentage:
            explanation.percentage,
          source:
            explanation.source,
          calculation:
            explanation.calculation,
          coverage,
          objective_status: {
            available: true,
            reason: null,
          },
          objectives,
        };
      }

      /*
       * Ordinary parent path.
       *
       * Also used as safe degradation for an objective-aware goal while
       * the dormant objective schema is unavailable.
       */
      const ordinary =
        ordinaryExplanation({
          goal,
          progressRows:
            quarterProgress,
          points:
            quarterPoints,
          instances,
        });

      const result = {
        goal_code:
          goal?.code || null,
        measurement_type:
          goal
            ?.measurement_type ??
          null,
        percentage:
          ordinary.percentage,
        source:
          ordinary.source,
        calculation:
          ordinary.calculation,
      };

      if (
        hasObjectives &&
        objectiveProgress
          ?.available !== true
      ) {
        result.objective_status = {
          available: false,
          reason:
            objectiveProgress
              ?.reason ||
            'unavailable',
        };
      }

      return result;
    });

  return {
    available: true,
    quarter: range,
    goals:
      resultGoals,
  };
}

module.exports = {
  buildStudentGoalExplanationBundle,
};
