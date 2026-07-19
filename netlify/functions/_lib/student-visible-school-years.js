'use strict';

const {
  getCurrentSchoolYear,
} = require('./school-year');

/**
 * Returns school-year start values visible in the Student Portal.
 *
 * Normal behavior:
 *   Aug-Jun -> current school year only
 *
 * July transition behavior:
 *   Include both the ending school year and the upcoming school year.
 *
 * Example:
 *   July 18, 2026 -> [2025, 2026]
 *   August 1, 2026 -> [2026]
 */
function getStudentVisibleSchoolYears(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      'Invalid date supplied to getStudentVisibleSchoolYears'
    );
  }

  const currentSchoolYear =
    getCurrentSchoolYear(date);

  const month = date.getMonth() + 1;

  if (month === 7) {
    return [
      currentSchoolYear,
      currentSchoolYear + 1,
    ];
  }

  return [currentSchoolYear];
}

module.exports = {
  getStudentVisibleSchoolYears,
};
