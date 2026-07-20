'use strict';

/**
 * Canonical ReinischClassroom school timezone.
 *
 * Date-only instructional records such as:
 * - goal_progress.date
 * - goal_data_points.date
 * - assignment_instances.assigned_at
 *
 * must reflect the local school calendar day rather than UTC.
 *
 * Full timestamps such as submitted_at, created_at, scored_at, etc.
 * should continue using ISO UTC timestamps.
 */
const SCHOOL_TIME_ZONE = 'America/Chicago';

/**
 * Return YYYY-MM-DD for the supplied instant in the school timezone.
 *
 * @param {Date|string|number} now
 * @param {string} timeZone
 * @returns {string}
 */
function getSchoolLocalDate(
  now = new Date(),
  timeZone = SCHOOL_TIME_ZONE
) {
  const date =
    now instanceof Date
      ? now
      : new Date(now);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(
      'getSchoolLocalDate requires a valid date'
    );
  }

  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }
    ).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day'
    ) {
      values[part.type] =
        part.value;
    }
  }

  if (
    !values.year ||
    !values.month ||
    !values.day
  ) {
    throw new Error(
      'Could not resolve school-local date'
    );
  }

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
}

module.exports = {
  SCHOOL_TIME_ZONE,
  getSchoolLocalDate,
};
