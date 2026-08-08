// instructional-day.js
// Shared Reinisch Classroom instructional-day contract.
//
// Source: Winfield R-IV 2026-2027 School Calendar, published 2026-06-25.
// Early-release dates remain instructional. Only dates with no students
// scheduled are represented as calendar exceptions here.

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const SCHOOL_CALENDAR_2026_27 = {
  id: 'winfield-r4-2026-27',
  label: 'Winfield R-IV 2026–2027',
  firstInstructionalDay: '2026-08-25',
  lastInstructionalDay: '2027-05-20',
  schoolDays: [1, 2, 3, 4, 5],
  exceptions: [
    {
      start: '2026-09-07',
      end: '2026-09-07',
      label: 'Labor Day',
      type: 'school-closed',
    },
    {
      start: '2026-10-29',
      end: '2026-10-30',
      label: 'Fall Break',
      type: 'school-closed',
    },
    {
      start: '2026-11-25',
      end: '2026-11-27',
      label: 'Thanksgiving Break',
      type: 'school-closed',
    },
    {
      start: '2026-12-23',
      end: '2027-01-01',
      label: 'Winter Break',
      type: 'school-closed',
    },
    {
      start: '2027-01-04',
      end: '2027-01-04',
      label: 'Professional Development',
      type: 'no-students',
    },
    {
      start: '2027-01-18',
      end: '2027-01-18',
      label: 'Martin Luther King Jr. Day',
      type: 'school-closed',
    },
    {
      start: '2027-02-15',
      end: '2027-02-15',
      label: 'Presidents Day',
      type: 'school-closed',
    },
    {
      start: '2027-03-22',
      end: '2027-03-29',
      label: 'Spring Break',
      type: 'school-closed',
    },
    {
      start: '2027-04-19',
      end: '2027-04-19',
      label: 'Professional Development',
      type: 'no-students',
    },
  ],
};

function parseDateKey(value) {
  if (typeof value === 'string') {
    if (!DATE_KEY_PATTERN.test(value)) return null;

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return value;
  }

  return null;
}

function dayOfWeek(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function getInstructionalDayStatus(
  value,
  calendar = SCHOOL_CALENDAR_2026_27
) {
  const date = parseDateKey(value);

  if (!date) {
    return {
      date: null,
      instructional: false,
      reason: 'invalid-date',
      label: 'Invalid date',
    };
  }

  if (
    date < calendar.firstInstructionalDay ||
    date > calendar.lastInstructionalDay
  ) {
    return {
      date,
      instructional: false,
      reason: 'outside-school-year',
      label: `Outside the ${calendar.label} school year`,
    };
  }

  const exception = calendar.exceptions.find(
    item => date >= item.start && date <= item.end
  );

  if (exception) {
    return {
      date,
      instructional: false,
      reason: 'calendar-exception',
      label: exception.label,
      type: exception.type,
    };
  }

  if (!calendar.schoolDays.includes(dayOfWeek(date))) {
    return {
      date,
      instructional: false,
      reason: 'weekend',
      label: 'Weekend',
    };
  }

  return {
    date,
    instructional: true,
    reason: 'instructional',
    label: 'Instructional day',
  };
}

export function isInstructionalDay(
  value,
  calendar = SCHOOL_CALENDAR_2026_27
) {
  return getInstructionalDayStatus(value, calendar).instructional;
}
