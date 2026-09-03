// observation-due-state.js
//
// Pure scheduling semantics for the Reinisch Classroom Observation system.
//
// OBS-1 deliberately owns no UI, persistence, attendance records, or evidence
// mutation. It answers only: what is the collection state for this goal now?
//
// An Absent / No Opportunity disposition resolves the current opportunity,
// but it never counts as collected evidence and never reduces the weekly
// evidence requirement.

import {
  isInstructionalDay,
} from '/web/instructional-day.js';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const EXCUSING_DISPOSITIONS = new Set([
  'absent',
  'no_opportunity',
]);

function parseDateKey(value) {
  if (
    typeof value !== 'string' ||
    !DATE_KEY_PATTERN.test(value)
  ) {
    return null;
  }

  const [year, month, day] =
    value.split('-').map(Number);

  const date =
    new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateKey(date) {
  return (
    String(date.getFullYear()) +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

function addDays(dateKey, amount) {
  const date = parseDateKey(dateKey);

  if (!date) return null;

  date.setDate(date.getDate() + amount);

  return formatDateKey(date);
}

function startOfWeek(dateKey) {
  const date = parseDateKey(dateKey);

  if (!date) return null;

  const day = date.getDay();
  const mondayOffset =
    day === 0 ? -6 : 1 - day;

  date.setDate(
    date.getDate() + mondayOffset
  );

  return formatDateKey(date);
}

function endOfWeek(dateKey) {
  const monday = startOfWeek(dateKey);

  return monday
    ? addDays(monday, 6)
    : null;
}

function normalizeRequired(value) {
  const numeric = Number(value);

  if (
    !Number.isFinite(numeric) ||
    numeric <= 0
  ) {
    return 0;
  }

  return Math.floor(numeric);
}

function normalizePeriods(classPeriods) {
  if (!Array.isArray(classPeriods)) {
    return [];
  }

  return classPeriods
    .map(value =>
      typeof value === 'string'
        ? value.trim()
        : ''
    )
    .filter(Boolean);
}

function periodMatches(
  entryPeriod,
  configuredPeriods
) {
  if (configuredPeriods.length === 0) {
    return true;
  }

  if (
    typeof entryPeriod !== 'string' ||
    !entryPeriod.trim()
  ) {
    // Historical evidence may predate period provenance.
    // Do not discard otherwise valid evidence solely for that reason.
    return true;
  }

  return configuredPeriods.includes(
    entryPeriod.trim()
  );
}

function currentPeriodIsEligible(
  currentPeriod,
  configuredPeriods
) {
  if (configuredPeriods.length === 0) {
    return true;
  }

  if (
    typeof currentPeriod !== 'string' ||
    !currentPeriod.trim()
  ) {
    return false;
  }

  return configuredPeriods.includes(
    currentPeriod.trim()
  );
}

function isCurrentOpportunityEntry(
  entry,
  date,
  currentPeriod
) {
  if (!entry || entry.date !== date) {
    return false;
  }

  if (
    typeof currentPeriod !== 'string' ||
    !currentPeriod.trim()
  ) {
    return true;
  }

  return (
    typeof entry.classPeriod === 'string' &&
    entry.classPeriod.trim() ===
      currentPeriod.trim()
  );
}

function countFutureInstructionalDays(
  date,
  weekEnd
) {
  let count = 0;
  let cursor = addDays(date, 1);

  while (
    cursor &&
    weekEnd &&
    cursor <= weekEnd
  ) {
    if (isInstructionalDay(cursor)) {
      count++;
    }

    cursor = addDays(cursor, 1);
  }

  return count;
}

export function computeObservationDueState({
  date,
  requiredPerWeek,
  classPeriods = [],
  currentPeriod = null,
  entries = [],
} = {}) {
  const required =
    normalizeRequired(requiredPerWeek);

  const configuredPeriods =
    normalizePeriods(classPeriods);

  const currentPeriodEligible =
    currentPeriodIsEligible(
      currentPeriod,
      configuredPeriods
    );

  if (!isInstructionalDay(date)) {
    return {
      state: 'not_scheduled',
      required,
      collected: 0,
      remaining: 0,
      urgent: false,
      currentPeriodEligible: false,
      disposition: null,
    };
  }

  const weekStart = startOfWeek(date);
  const weekEnd = endOfWeek(date);

  const weeklyEntries =
    Array.isArray(entries)
      ? entries.filter(entry =>
          entry &&
          typeof entry.date === 'string' &&
          entry.date >= weekStart &&
          entry.date <= weekEnd
        )
      : [];

  const collected =
    weeklyEntries.filter(entry =>
      entry.kind === 'observation' &&
      periodMatches(
        entry.classPeriod,
        configuredPeriods
      )
    ).length;

  const remaining =
    Math.max(0, required - collected);

  if (remaining === 0) {
    return {
      state: 'satisfied',
      required,
      collected,
      remaining,
      urgent: false,
      currentPeriodEligible,
      disposition: null,
      weekStart,
      weekEnd,
    };
  }

  if (!currentPeriodEligible) {
    return {
      state: 'upcoming',
      required,
      collected,
      remaining,
      urgent: false,
      currentPeriodEligible,
      disposition: null,
      weekStart,
      weekEnd,
    };
  }

  const currentDisposition =
    weeklyEntries.find(entry =>
      entry.kind === 'disposition' &&
      EXCUSING_DISPOSITIONS.has(
        entry.disposition
      ) &&
      isCurrentOpportunityEntry(
        entry,
        date,
        currentPeriod
      )
    );

  if (currentDisposition) {
    return {
      state: 'excused',
      required,
      collected,
      remaining,
      urgent: false,
      currentPeriodEligible,
      disposition:
        currentDisposition.disposition,
      weekStart,
      weekEnd,
    };
  }

  const futureInstructionalDays =
    countFutureInstructionalDays(
      date,
      weekEnd
    );

  // Foundation assumption: one ordinary collection opportunity per
  // instructional day. A later slice may support multiple explicit
  // opportunities on the same day without changing evidence semantics.
  const urgent =
    remaining > futureInstructionalDays;

  return {
    state: urgent ? 'urgent' : 'due',
    required,
    collected,
    remaining,
    urgent,
    currentPeriodEligible,
    disposition: null,
    weekStart,
    weekEnd,
    futureInstructionalDays,
  };
}
