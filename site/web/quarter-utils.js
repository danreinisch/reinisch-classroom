/**
 * Shared quarter date utilities for Teacher Center modules.
 * Single source of truth for quarter date logic used across tc-overview.js,
 * tc-data.js, tc-students.js, tc-reporting.js, tc-calendar.js, tc-settings.js,
 * and tc-gradebook.js.
 *
 * Default quarter dates (year-agnostic "Mon DD" format):
 *   Q1: Aug 16 – Oct 17
 *   Q2: Oct 18 – Dec 19
 *   Q3: Dec 20 – Mar 6  (spans year boundary)
 *   Q4: Mar 7  – May 20
 *
 * localStorage key: "rc_quarter_dates"
 */

/** Canonical default quarter dates in "Mon DD" format, uppercase Q1–Q4 keys. */
export const DEFAULT_QUARTER_DATES = {
  Q1: { start: "Aug 16", end: "Oct 17" },
  Q2: { start: "Oct 18", end: "Dec 19" },
  Q3: { start: "Dec 20", end: "Mar 6" },
  Q4: { start: "Mar 7", end: "May 20" },
};

/** Month-name to 0-indexed month number. */
const MONTH_MAP = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Parse a "Mon DD" date string (e.g. "Aug 16") into a Date object
 * using the given calendar year.
 * @param {string} dateStr - e.g. "Aug 16"
 * @param {number} year    - the calendar year to use
 * @returns {Date|null}
 */
export function parseQuarterDate(dateStr, year) {
  if (!dateStr) return null;
  const parts = dateStr.trim().split(" ");
  if (parts.length !== 2) return null;
  const month = MONTH_MAP[parts[0]];
  const day = parseInt(parts[1], 10);
  if (month === undefined || isNaN(day)) return null;
  return new Date(year, month, day);
}

/**
 * Return the school-year start year for a given date.
 * Months Aug (7) and later belong to the current year's school year;
 * months Jan–Jul belong to the previous year's school year.
 * @param {Date} date
 * @returns {number} school year (e.g. 2025 for the 2025–2026 school year)
 */
export function getSchoolYear(date) {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  return month >= 7 ? year : year - 1;
}

/**
 * Read quarter dates from localStorage, falling back to DEFAULT_QUARTER_DATES.
 * Dates are in "Mon DD" format with uppercase Q1–Q4 keys.
 * @returns {{ Q1: {start:string,end:string}, Q2:…, Q3:…, Q4:… }}
 */
export function getQuarterDates() {
  try {
    const saved = localStorage.getItem("rc_quarter_dates");
    return saved ? JSON.parse(saved) : DEFAULT_QUARTER_DATES;
  } catch (e) {
    return DEFAULT_QUARTER_DATES;
  }
}

/**
 * Persist quarter dates to localStorage.
 * @param {{ Q1:{start,end}, Q2:{start,end}, Q3:{start,end}, Q4:{start,end} }} dates
 */
export function saveQuarterDates(dates) {
  localStorage.setItem("rc_quarter_dates", JSON.stringify(dates));
}

/**
 * Determine which quarter today falls in, using saved or default dates.
 *
 * Month placement within the school year:
 *   months Aug–Dec (index ≥ 7) → schoolYear
 *   months Jan–Jul (index < 7)  → schoolYear + 1
 *
 * Falls back to hardcoded default boundaries if no match is found.
 * @returns {"Q1"|"Q2"|"Q3"|"Q4"}
 */
export function getCurrentQuarter() {
  const dates = getQuarterDates();
  const now = new Date();
  const schoolYear = getSchoolYear(now);

  for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) {
    const range = dates[quarter];
    if (!range || !range.start || !range.end) continue;

    const [sMon, sDay] = range.start.split(" ");
    const [eMon, eDay] = range.end.split(" ");
    const sm = MONTH_MAP[sMon];
    const em = MONTH_MAP[eMon];
    if (sm === undefined || em === undefined) continue;

    // Months >= Aug (index 7) are in schoolYear; earlier months are in schoolYear+1
    const startYear = sm >= 7 ? schoolYear : schoolYear + 1;
    const endYear = em >= 7 ? schoolYear : schoolYear + 1;

    const start = new Date(startYear, sm, parseInt(sDay, 10));
    const end = new Date(endYear, em, parseInt(eDay, 10));

    if (now >= start && now <= end) return quarter;
  }

  // Hardcoded fallback based on default school-year calendar
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();
  if ((month === 8 && day >= 16) || month === 9 || (month === 10 && day <= 17)) return "Q1";
  if ((month === 10 && day >= 18) || month === 11 || (month === 12 && day <= 19)) return "Q2";
  if ((month === 12 && day >= 20) || month === 1 || month === 2 || (month === 3 && day <= 6))
    return "Q3";
  if ((month === 3 && day >= 7) || month === 4 || (month === 5 && day <= 20)) return "Q4";
  return "Q4"; // summer fallback
}

/**
 * Return the { start, end } Date objects for a given quarter in the current school year.
 *
 * Month placement:
 *   months Aug–Dec (index ≥ 7) → schoolYear
 *   months Jan–Jul (index < 7)  → schoolYear + 1
 *
 * @param {"Q1"|"Q2"|"Q3"|"Q4"} quarter
 * @returns {{ start: Date, end: Date }|null}
 */
export function getQuarterDateRange(quarter) {
  const now = new Date();
  const schoolYear = getSchoolYear(now);

  /**
   * Attempt to parse a { start, end } range object using "Mon DD" format.
   * Returns { start: Date, end: Date } on success, or null if unparseable.
   */
  function tryParseRange(range) {
    if (!range || !range.start || !range.end) return null;
    const [sMon, sDay] = range.start.split(" ");
    const [eMon, eDay] = range.end.split(" ");
    const sm = MONTH_MAP[sMon];
    const em = MONTH_MAP[eMon];
    if (sm === undefined || em === undefined) return null;
    // Months >= Aug (index 7) are in schoolYear; earlier months are in schoolYear+1
    const startYear = sm >= 7 ? schoolYear : schoolYear + 1;
    const endYear = em >= 7 ? schoolYear : schoolYear + 1;
    return {
      start: new Date(startYear, sm, parseInt(sDay, 10)),
      end: new Date(endYear, em, parseInt(eDay, 10)),
    };
  }

  const dates = getQuarterDates();
  // Try saved dates first; if they can't be parsed fall back to built-in defaults.
  return tryParseRange(dates[quarter]) || tryParseRange(DEFAULT_QUARTER_DATES[quarter]);
}

/**
 * Determine which quarter an arbitrary date falls in.
 * Uses saved quarter dates from localStorage, with hardcoded fallback.
 *
 * @param {Date|string} date - The date to check
 * @returns {"Q1"|"Q2"|"Q3"|"Q4"|null}
 */
export function getQuarterForDate(date) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;

  const dates = getQuarterDates();
  const schoolYear = getSchoolYear(d);

  for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) {
    const range = dates[quarter];
    if (!range || !range.start || !range.end) continue;

    const [sMon, sDay] = range.start.split(" ");
    const [eMon, eDay] = range.end.split(" ");
    const sm = MONTH_MAP[sMon];
    const em = MONTH_MAP[eMon];
    if (sm === undefined || em === undefined) continue;

    const startYear = sm >= 7 ? schoolYear : schoolYear + 1;
    const endYear = em >= 7 ? schoolYear : schoolYear + 1;

    const start = new Date(startYear, sm, parseInt(sDay, 10));
    const end = new Date(endYear, em, parseInt(eDay, 10));

    if (d >= start && d <= end) return quarter;
  }

  return null;
}

/**
 * Return a human-readable label for a quarter, e.g. "Q1 (Aug 16–Oct 17)".
 * Uses saved dates when available.
 * @param {"Q1"|"Q2"|"Q3"|"Q4"} quarter
 * @returns {string}
 */
export function getQuarterLabel(quarter) {
  const dates = getQuarterDates();
  if (dates[quarter]) {
    const range = dates[quarter];
    if (range.start && range.end) {
      return `${quarter} (${range.start}–${range.end})`;
    }
  }
  const labels = {
    Q1: "Q1 (Aug 16–Oct 17)",
    Q2: "Q2 (Oct 18–Dec 19)",
    Q3: "Q3 (Dec 20–Mar 6)",
    Q4: "Q4 (Mar 7–May 20)",
  };
  return labels[quarter] || quarter;
}

/**
 * Return the { start: Date, end: Date } for a school-year period.
 * Supports 'semester-1', 'semester-2', and 'full-year'.
 *
 * Semester 1: Aug 1 → Jan 31
 * Semester 2: Feb 1 → Jun 30
 * Full Year:  Aug 1 → Jun 30
 *
 * @param {"semester-1"|"semester-2"|"full-year"} period
 * @param {Date} [referenceDate] - Optional date to determine school year (defaults to now)
 * @returns {{ start: Date, end: Date }|null}
 */
export function getSchoolYearDateRange(period, referenceDate) {
  const now = referenceDate || new Date();
  const schoolYear = getSchoolYear(now);

  if (period === 'semester-1') {
    return {
      start: new Date(schoolYear, 7, 1),      // Aug 1
      end: new Date(schoolYear + 1, 0, 31),   // Jan 31
    };
  }
  if (period === 'semester-2') {
    return {
      start: new Date(schoolYear + 1, 1, 1),  // Feb 1
      end: new Date(schoolYear + 1, 5, 30),   // Jun 30
    };
  }
  if (period === 'full-year') {
    return {
      start: new Date(schoolYear, 7, 1),      // Aug 1
      end: new Date(schoolYear + 1, 5, 30),   // Jun 30
    };
  }
  return null;
}

/**
 * Return a human-readable label for any reporting period.
 * Handles quarter labels (Q1–Q4) and extended periods (semester-1, semester-2, full-year).
 * @param {string} period
 * @returns {string}
 */
export function getPeriodLabel(period) {
  if (period === 'semester-1') return 'Semester 1 (Aug–Jan)';
  if (period === 'semester-2') return 'Semester 2 (Feb–Jun)';
  if (period === 'full-year') return 'Full Year (Aug–Jun)';
  return getQuarterLabel(period);
}

/**
 * Return the { start: Date, end: Date } for any reporting period.
 * Handles quarter values (Q1–Q4) and extended periods (semester-1, semester-2, full-year).
 * @param {string} period
 * @returns {{ start: Date, end: Date }|null}
 */
export function getDateRangeForPeriod(period) {
  if (period === 'semester-1' || period === 'semester-2' || period === 'full-year') {
    return getSchoolYearDateRange(period);
  }
  return getQuarterDateRange(period);
}
