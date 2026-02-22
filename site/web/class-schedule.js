// class-schedule.js
// Class schedule data module with Supabase and local fallback

import { getSupabase } from './supabase-client.js';

const FALLBACK_URL = '/assets/data/site-state.json';

let _scheduleCache = null;

/**
 * Parse "HH:MM" string to minutes since midnight
 * @param {string} str - Time string e.g. "08:14"
 * @returns {number} Minutes since midnight
 */
function parseTime(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Check if Supabase is available
 */
async function isSupabaseAvailable() {
  const supabase = await getSupabase();
  return supabase && typeof supabase.from === 'function';
}

/**
 * Fetch schedule from Supabase
 * @returns {Promise<Array|null>} Array of period rows or null
 */
async function fetchFromSupabase() {
  const supabase = await getSupabase();
  try {
    const { data, error } = await supabase
      .from('class_schedule')
      .select('hour_number, start_time, end_time, label, is_planning')
      .eq('active', true)
      .order('sort_order');

    if (error) {
      console.warn('[class-schedule] Supabase error:', error.message);
      return null;
    }

    return data.map(row => ({
      hour: row.hour_number,
      start: row.start_time.slice(0, 5),
      end: row.end_time.slice(0, 5),
      label: row.label,
      isPlanning: row.is_planning
    }));
  } catch (err) {
    console.warn('[class-schedule] Network error:', err.message);
    return null;
  }
}

/**
 * Fetch schedule from site-state.json fallback
 * @returns {Promise<Object|null>} Schedule object or null
 */
async function fetchFromFallback() {
  try {
    const res = await fetch(FALLBACK_URL);
    if (!res.ok) return null;
    const json = await res.json();
    return json.schedule || null;
  } catch (err) {
    console.warn('[class-schedule] Fallback fetch error:', err.message);
    return null;
  }
}

/**
 * Get the class schedule, preferring Supabase with fallback to site-state.json.
 * Results are cached in memory.
 * @returns {Promise<{periods: Array, schoolDays: number[], passingMinutes: number}>}
 */
export async function getSchedule() {
  if (_scheduleCache) return _scheduleCache;

  let periods = null;
  let passingMinutes = 4;
  const schoolDays = [1, 2, 3, 4, 5];

  if (await isSupabaseAvailable()) {
    periods = await fetchFromSupabase();
    if (periods) {
      console.log('[class-schedule] Loaded from Supabase, count:', periods.length);
    }
  }

  if (!periods) {
    const fallback = await fetchFromFallback();
    if (fallback) {
      periods = fallback.periods || [];
      passingMinutes = fallback.passingMinutes ?? 4;
      console.log('[class-schedule] Loaded from fallback, count:', periods.length);
    }
  }

  if (!periods) {
    console.warn('[class-schedule] No schedule data available');
    periods = [];
  }

  _scheduleCache = { periods, schoolDays, passingMinutes };
  return _scheduleCache;
}

/**
 * Save schedule periods to Supabase (Teacher Center use).
 * Deletes all existing rows and inserts fresh ones.
 * @param {Array} periods - Array of period objects
 * @returns {Promise<boolean>} True on success
 */
export async function upsertSchedule(periods) {
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new Error('periods must be a non-empty array');
  }

  if (!(await isSupabaseAvailable())) {
    throw new Error('Supabase is not available');
  }

  const supabase = await getSupabase();

  // Delete all existing rows
  const { error: delError } = await supabase
    .from('class_schedule')
    .delete()
    .gte('id', 0);

  if (delError) {
    throw new Error('Failed to clear schedule: ' + delError.message);
  }

  // Insert new rows
  const rows = periods.map((p, i) => ({
    hour_number: p.hour,
    start_time: p.start,
    end_time: p.end,
    label: p.label,
    is_planning: p.isPlanning || false,
    active: true,
    sort_order: i + 1,
    updated_at: new Date().toISOString()
  }));

  const { error: insError } = await supabase
    .from('class_schedule')
    .insert(rows);

  if (insError) {
    throw new Error('Failed to insert schedule: ' + insError.message);
  }

  // Invalidate cache
  _scheduleCache = null;

  console.log('[class-schedule] Schedule saved, count:', rows.length);
  return true;
}

/**
 * Determine the current class period state. Pure function — no side effects.
 *
 * @param {{periods: Array, schoolDays: number[], passingMinutes: number}} schedule
 * @param {Date} now - Current date/time
 * @returns {Object} Status object
 */
export function getCurrentPeriod(schedule, now) {
  const { periods, schoolDays } = schedule;
  const dayOfWeek = now.getDay();

  // No school on weekends (or days not in schoolDays)
  if (!schoolDays.includes(dayOfWeek)) {
    return { status: 'no-school' };
  }

  if (!periods || periods.length === 0) {
    return { status: 'no-school' };
  }

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  // Check each period
  for (const period of periods) {
    const startMins = parseTime(period.start);
    const endMins = parseTime(period.end);
    const startSecs = startMins * 60;
    const endSecs = endMins * 60;
    const totalSeconds = endSecs - startSecs;

    if (nowSecs >= startSecs && nowSecs < endSecs) {
      return {
        status: 'in-class',
        period,
        remainingSeconds: endSecs - nowSecs,
        totalSeconds
      };
    }
  }

  // Check passing periods (gap between end of one period and start of next)
  for (let i = 0; i < periods.length - 1; i++) {
    const endMins = parseTime(periods[i].end);
    const nextStartMins = parseTime(periods[i + 1].start);
    const endSecs = endMins * 60;
    const nextStartSecs = nextStartMins * 60;

    if (nowSecs >= endSecs && nowSecs < nextStartSecs) {
      return {
        status: 'passing',
        nextPeriod: periods[i + 1],
        remainingSeconds: nextStartSecs - nowSecs
      };
    }
  }

  // Before first period
  const firstStartMins = parseTime(periods[0].start);
  const firstStartSecs = firstStartMins * 60;
  if (nowMins < firstStartMins) {
    return {
      status: 'before-school',
      nextPeriod: periods[0],
      remainingSeconds: firstStartSecs - nowSecs
    };
  }

  // After last period
  return { status: 'after-school' };
}
