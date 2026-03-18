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
