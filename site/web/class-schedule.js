// class-schedule.js
// Bell schedule helpers with Supabase and local fallback

import { getSupabase } from './supabase-client.js';

const NS = 'rc_class_schedule_';

/**
 * Local storage helpers for offline fallback
 */
const localStore = {
  get: (k, def) => {
    try {
      return JSON.parse(localStorage.getItem(NS + k)) ?? def;
    } catch {
      return def;
    }
  },
  set: (k, v) => localStorage.setItem(NS + k, JSON.stringify(v))
};

/**
 * Check if Supabase is available
 */
async function isSupabaseAvailable() {
  const supabase = await getSupabase();
  return supabase && typeof supabase.from === 'function';
}

/**
 * Parse "HH:MM" time string to minutes since midnight
 * @param {string} timeStr - Time string in "HH:MM" or "H:MM" format
 * @returns {number} Minutes since midnight, or 0 if invalid
 */
export function parseTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Get the bell schedule
 * Tries Supabase first, falls back to site-state.json, then localStorage cache
 * @returns {Promise<Object>} Schedule object with periods, passingMinutes, schoolDays
 */
export async function getSchedule() {
  // Try remote first if available
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { data, error } = await supabase
        .from('class_schedule')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        console.warn('[class-schedule] Supabase error, falling back to local:', error.message);
        return getLocalSchedule();
      }

      if (data && data.length > 0) {
        const schedule = normalizeRemoteSchedule(data);
        console.log('[class-schedule] Remote schedule fetched, periods:', schedule.periods.length);
        localStore.set('schedule', schedule);
        return schedule;
      }

      console.log('[class-schedule] No remote schedule found, using local');
      return getLocalSchedule();
    } catch (err) {
      console.warn('[class-schedule] Network error, falling back to local:', err.message);
      return getLocalSchedule();
    }
  } else {
    console.log('[class-schedule] Supabase not configured, using local schedule');
    return getLocalSchedule();
  }
}

/**
 * Normalize a Postgres time string to "HH:MM" format
 * Handles both "HH:MM:SS" and "H:MM:SS" output formats
 */
function normalizeTimeStr(timeStr) {
  if (!timeStr) return '00:00';
  const parts = timeStr.split(':');
  const h = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
  const m = String(parseInt(parts[1], 10) || 0).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Normalize Supabase rows to schedule format
 */
function normalizeRemoteSchedule(rows) {
  return {
    periods: rows.map(r => ({
      hour: r.hour_number,
      start: normalizeTimeStr(r.start_time),
      end: normalizeTimeStr(r.end_time),
      label: r.label,
      isPlanning: !!r.is_planning
    })),
    passingMinutes: 4,
    schoolDays: [1, 2, 3, 4, 5]
  };
}

/**
 * Get schedule from localStorage or site-state.json fallback
 */
async function getLocalSchedule() {
  // Check localStorage cache first
  const cached = localStore.get('schedule', null);
  if (cached && cached.periods && cached.periods.length > 0) {
    console.log('[class-schedule] Using cached schedule');
    return cached;
  }

  // Fall back to site-state.json
  try {
    const response = await fetch('/assets/data/site-state.json');
    if (response.ok) {
      const data = await response.json();
      if (data.schedule && data.schedule.periods) {
        console.log('[class-schedule] Using site-state.json schedule');
        return data.schedule;
      }
    }
  } catch (err) {
    console.warn('[class-schedule] Could not load site-state.json:', err.message);
  }

  // Last resort: empty schedule
  return { periods: [], passingMinutes: 4, schoolDays: [1, 2, 3, 4, 5] };
}

/**
 * Upsert (create or update) schedule periods
 * @param {Array} periods - Array of period objects
 * @returns {Promise<Object>} Updated schedule
 */
export async function upsertSchedule(periods) {
  if (!Array.isArray(periods)) {
    throw new Error('periods must be an array');
  }

  const schedule = { periods, passingMinutes: 4, schoolDays: [1, 2, 3, 4, 5] };

  // Try remote first if available
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const rows = periods.map((p, i) => ({
        hour_number: p.hour,
        start_time: p.start,
        end_time: p.end,
        label: p.label,
        is_planning: !!p.isPlanning,
        active: true,
        sort_order: i + 1,
        updated_at: new Date().toISOString()
      }));

      // Delete existing and re-insert for simplicity
      const { error: delErr } = await supabase
        .from('class_schedule')
        .delete()
        .eq('active', true);

      if (delErr) {
        console.warn('[class-schedule] Supabase delete error, falling back to local:', delErr.message);
        return upsertLocalSchedule(schedule);
      }

      const { error: insErr } = await supabase
        .from('class_schedule')
        .insert(rows);

      if (insErr) {
        console.warn('[class-schedule] Supabase insert error, falling back to local:', insErr.message);
        return upsertLocalSchedule(schedule);
      }

      console.log('[class-schedule] Remote schedule saved, periods:', periods.length);
      localStore.set('schedule', schedule);
      return schedule;
    } catch (err) {
      console.warn('[class-schedule] Network error, falling back to local:', err.message);
      return upsertLocalSchedule(schedule);
    }
  } else {
    console.log('[class-schedule] Supabase not configured, saving locally');
    return upsertLocalSchedule(schedule);
  }
}

/**
 * Save schedule to localStorage
 */
function upsertLocalSchedule(schedule) {
  localStore.set('schedule', schedule);
  return schedule;
}

/**
 * Determine the current period state given a schedule and current time
 * @param {Object} schedule - Schedule object with periods, passingMinutes, schoolDays
 * @param {Date} now - Current date/time
 * @returns {Object} State object with status and relevant fields
 */
export function getCurrentPeriod(schedule, now) {
  if (!schedule || !schedule.periods || schedule.periods.length === 0) {
    return { status: 'no-school' };
  }

  const schoolDays = schedule.schoolDays || [1, 2, 3, 4, 5];
  const dayOfWeek = now.getDay();

  // Check if it's a school day
  if (!schoolDays.includes(dayOfWeek)) {
    return { status: 'no-school' };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentSeconds = currentMinutes * 60 + now.getSeconds();
  const periods = schedule.periods;

  // Check if currently in a period
  for (const period of periods) {
    const startMin = parseTime(period.start);
    const endMin = parseTime(period.end);
    const startSec = startMin * 60;
    const endSec = endMin * 60;

    if (currentSeconds >= startSec && currentSeconds < endSec) {
      const remainingSeconds = endSec - currentSeconds;
      const totalSeconds = endSec - startSec;
      return { status: 'in-class', period, remainingSeconds, totalSeconds };
    }
  }

  // Check if between periods (passing period)
  for (let i = 0; i < periods.length - 1; i++) {
    const endOfCurrent = parseTime(periods[i].end) * 60;
    const startOfNext = parseTime(periods[i + 1].start) * 60;

    if (currentSeconds >= endOfCurrent && currentSeconds < startOfNext) {
      const remainingSeconds = startOfNext - currentSeconds;
      return { status: 'passing', nextPeriod: periods[i + 1], remainingSeconds };
    }
  }

  // Before school
  const firstStart = parseTime(periods[0].start) * 60;
  if (currentSeconds < firstStart) {
    const remainingSeconds = firstStart - currentSeconds;
    return { status: 'before-school', nextPeriod: periods[0], remainingSeconds };
  }

  // After school
  return { status: 'after-school' };
}
