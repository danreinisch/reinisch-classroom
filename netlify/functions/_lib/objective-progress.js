'use strict';

/**
 * Slice 5A — Objective progress math.
 *
 * Pure calculation only.
 *
 * Responsibilities:
 * - summarize evidence WITHIN one child objective using earned/max weighting
 * - roll sibling child-objective percentages UP to a parent with equal weighting
 * - preserve existing parent progress as fallback when zero child objectives
 *   currently have evidence
 *
 * Explicitly NOT responsible for:
 * - database reads or writes
 * - assignment scoring
 * - objective evidence creation
 * - registry activation
 * - mastery determination
 * - trend calculation
 * - historical parent evidence mutation
 */

function finiteNumber(value) {
  // Missing evidence must never become numeric zero.
  //
  // JavaScript's Number(null), Number(''), and Number(false) all produce
  // finite numbers, but those values do not represent measured evidence.
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

function roundPercentage(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

/**
 * Summarize evidence for ONE objective.
 *
 * Within an objective, evidence is denominator-aware:
 *
 *   total earned / total possible
 *
 * Example:
 *   1/2 + 3/3 = 4/5 = 80%
 */
function summarizeObjectiveEvidence(rows) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  let earned = 0;
  let max = 0;
  let evidenceCount = 0;

  for (const row of safeRows) {
    const rowEarned =
      finiteNumber(
        row && row.objective_earned
      );

    const rowMax =
      finiteNumber(
        row && row.objective_max
      );

    if (
      rowEarned === null ||
      rowMax === null ||
      rowMax <= 0 ||
      rowEarned < 0 ||
      rowEarned > rowMax
    ) {
      continue;
    }

    earned += rowEarned;
    max += rowMax;
    evidenceCount += 1;
  }

  return {
    earned:
      roundPercentage(earned),
    max:
      roundPercentage(max),
    percentage:
      max > 0
        ? roundPercentage(
            (earned / max) * 100
          )
        : null,
    evidence_count:
      evidenceCount,
  };
}

/**
 * Roll child objectives UP to their controlling parent.
 *
 * Sibling objectives are equal-weighted regardless of evidence volume.
 *
 * A child with no evidence is excluded rather than treated as 0%.
 */
function rollUpParentObjectives(objectives) {
  const safeObjectives =
    Array.isArray(objectives)
      ? objectives
      : [];

  const percentages =
    safeObjectives
      .filter(objective => {
        const evidenceCount =
          finiteNumber(
            objective &&
            objective.evidence_count
          );

        return (
          evidenceCount !== null &&
          evidenceCount > 0
        );
      })
      .map(objective =>
        finiteNumber(
          objective &&
          objective.percentage
        )
      )
      .filter(value =>
        value !== null
      );

  const percentage =
    percentages.length > 0
      ? roundPercentage(
          percentages.reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
          percentages.length
        )
      : null;

  return {
    percentage,
    objectives_with_data:
      percentages.length,
    total_objectives:
      safeObjectives.length,
  };
}

/**
 * Select the parent percentage displayed by objective-aware readers.
 *
 * If at least one child objective has evidence, the child-objective roll-up
 * becomes the parent display value.
 *
 * If zero child objectives have evidence, preserve the existing parent value.
 */
function selectParentDisplayProgress({
  objective_rollup,
  existing_parent_percentage,
} = {}) {
  const rollup =
    objective_rollup &&
    typeof objective_rollup === 'object'
      ? objective_rollup
      : {};

  const withData =
    Number.isInteger(
      rollup.objectives_with_data
    )
      ? rollup.objectives_with_data
      : 0;

  const total =
    Number.isInteger(
      rollup.total_objectives
    )
      ? rollup.total_objectives
      : 0;

  const objectivePercentage =
    finiteNumber(
      rollup.percentage
    );

  if (
    withData > 0 &&
    objectivePercentage !== null
  ) {
    return {
      percentage:
        roundPercentage(
          objectivePercentage
        ),
      source:
        'objective_rollup',
      objectives_with_data:
        withData,
      total_objectives:
        total,
    };
  }

  const parentPercentage =
    finiteNumber(
      existing_parent_percentage
    );

  return {
    percentage:
      parentPercentage === null
        ? null
        : roundPercentage(
            parentPercentage
          ),
    source:
      'existing_parent',
    objectives_with_data:
      withData,
    total_objectives:
      total,
  };
}

module.exports = {
  summarizeObjectiveEvidence,
  rollUpParentObjectives,
  selectParentDisplayProgress,
};
