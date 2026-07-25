'use strict';

/**
 * Returns the starting calendar year of the school year containing `now`.
 *
 * Existing ReinischClassroom behavior:
 *   Aug-Dec -> current calendar year
 *   Jan-Jul -> previous calendar year
 *
 * Example:
 *   July 18, 2026 -> 2025
 *   August 1, 2026 -> 2026
 */
function getCurrentSchoolYear(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date supplied to getCurrentSchoolYear');
  }

  const month = date.getMonth() + 1;
  return month >= 8
    ? date.getFullYear()
    : date.getFullYear() - 1;
}

/**
 * Returns the active operational school year used for current teacher work.
 *
 * Unlike getCurrentSchoolYear(), July is treated as preparation for the
 * upcoming school year:
 *
 *   Jan-Jun -> previous calendar year
 *   Jul-Dec -> current calendar year
 *
 * Example:
 *   June 30, 2026 -> 2025
 *   July 1, 2026  -> 2026
 *   July 25, 2026 -> 2026
 *   August 1, 2026 -> 2026
 *
 * This does not change how historical dates are classified.
 */
function getOperationalSchoolYear(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date supplied to getOperationalSchoolYear');
  }

  const month = date.getMonth() + 1;
  return month >= 7
    ? date.getFullYear()
    : date.getFullYear() - 1;
}

/**
 * Allows an assignment draft to explicitly target a school year.
 *
 * Supported:
 *   draft.schoolYear = 2026
 *   draft.school_year = 2026
 *
 * Falls back to ReinischClassroom's existing date-based behavior when
 * no valid explicit year is provided.
 */
function resolveSchoolYear(draft, now = new Date()) {
  const raw =
    draft && draft.schoolYear !== undefined
      ? draft.schoolYear
      : draft && draft.school_year !== undefined
        ? draft.school_year
        : undefined;

  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const parsed = Number.parseInt(String(raw), 10);

    if (
      Number.isInteger(parsed) &&
      parsed >= 2000 &&
      parsed <= 2100
    ) {
      return parsed;
    }
  }

  return getCurrentSchoolYear(now);
}

/**
 * Resolves the school year for active teacher assignment issuance.
 *
 * Explicit draft values remain authoritative:
 *   draft.schoolYear
 *   draft.school_year
 *
 * Without an explicit valid year, teacher work uses the operational
 * school year, where July belongs to the upcoming school year.
 */
function resolveOperationalSchoolYear(draft, now = new Date()) {
  const raw =
    draft && draft.schoolYear !== undefined
      ? draft.schoolYear
      : draft && draft.school_year !== undefined
        ? draft.school_year
        : undefined;

  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const parsed = Number.parseInt(String(raw), 10);

    if (
      Number.isInteger(parsed) &&
      parsed >= 2000 &&
      parsed <= 2100
    ) {
      return parsed;
    }
  }

  return getOperationalSchoolYear(now);
}

module.exports = {
  getCurrentSchoolYear,
  getOperationalSchoolYear,
  resolveSchoolYear,
  resolveOperationalSchoolYear,
};
