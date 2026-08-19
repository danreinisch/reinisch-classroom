/**
 * Shared goal utility functions.
 * Exported as an ES module; consumed via dynamic import() in all TC modules.
 */

/**
 * Parse a goal value (baseline, mastery, or target) to a number.
 * Supports: plain numbers ("72"), percentages ("60%"), fractions ("3/5" → 60).
 * Returns null if the value cannot be parsed.
 * @param {string|number|null} val
 * @returns {number|null}
 */
export function parseGoalValue(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  const fracMatch = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fracMatch) {
    const num = parseFloat(fracMatch[1]);
    const den = parseFloat(fracMatch[2]);
    return den !== 0 ? (num / den) * 100 : null;
  }
  const pctMatch = s.match(/^(\d+(?:\.\d+)?)%$/);
  if (pctMatch) return parseFloat(pctMatch[1]);
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

/**
 * Format a goal progress value based on measurement type.
 * @param {number|null} value - The numeric value on a 0-100 scale (usually an average
 *   from getGoalProgressForQuarter)
 * @param {string} [measurementType] - 'Percent', 'Accuracy', 'x/y', 'Number',
 *   'Observation', etc.  Defaults to 'Percent' when falsy.
 * @param {object} [goal] - The goal object (for baseline/mastery denominator context)
 * @returns {string} Formatted display string
 */
export function formatGoalValue(value, measurementType, goal) {
  if (value == null) return 'N/A';
  const type = (measurementType || 'Percent').toLowerCase();
  if (type === 'observation') return 'N/A';
  if (type === 'x/y' || type === 'fraction') {
    // A source-conflicted goal has no approved controlling denominator.
    // Preserve the raw progress value as a percentage rather than silently
    // choosing either Header Mastery or Goal-Text Target.
    if (hasCriterionConflict(goal)) {
      return value.toFixed(0) + '%';
    }

    // Ordinary goals retain the historical mastery-first denominator behavior.
    const denomMatch = (goal?.mastery || goal?.target || '').match(/\/(\d+)/);
    if (denomMatch) {
      const denom = parseInt(denomMatch[1]);
      const numerator = Math.round(value * denom / 100);
      return `${numerator}/${denom}`;
    }
    return value.toFixed(0) + '%'; // fallback to percent if denominator can't be parsed
  }
  if (type === 'number') return value.toFixed(1);
  // Default: Percent / Accuracy (and any unrecognised type)
  return value.toFixed(0) + '%';
}


/**
 * Return true only for an explicitly source-verified criterion conflict.
 * Unequal mastery and target values do not imply a conflict.
 */
export function hasCriterionConflict(goal) {
  return goal?.criterion_conflict === true;
}

/**
 * Return the numeric criterion usable for automatic judgments.
 * Source-conflicted goals deliberately return null.
 */
export function getAutomaticCriterionValue(goal) {
  if (hasCriterionConflict(goal)) {
    return null;
  }

  return (
    parseGoalValue(goal?.mastery) ??
    parseGoalValue(goal?.target)
  );
}

/**
 * Returns true if a goal should be considered active/open.
 * Accepts any status except 'closed' or 'archived' (case-insensitive).
 * Goals with a missing status are treated as active.
 * @param {object|null} goal
 * @returns {boolean}
 */
export function isGoalActive(goal) {
  if (!goal) return false;
  if (!goal.status) return true;
  const s = goal.status.toLowerCase();
  return s !== 'closed' && s !== 'archived';
}
