(async () => {
  "use strict";

  // Only run on students page
  if (!location.pathname.startsWith("/teacher/students")) return;

  // Import data adapter for Supabase/localStorage abstraction
  const { db } = await import('/web/data-adapter.js');
  const { getSupabase } = await import('/web/supabase-client.js');
  const { getCurrentQuarter, getQuarterDateRange, getQuarterDates, saveQuarterDates, DEFAULT_QUARTER_DATES, getQuarterLabel, parseQuarterDate } = await import('/web/quarter-utils.js');
  const { parseGoalValue, formatGoalValue } = await import('/web/goal-utils.js');
  const { getSchedule } = await import('/web/class-schedule.js');
  const { formatObservationValue, parseObservationNotes } = await import('/web/obs-utils.js');
  const { getGoalStaleness, getStudentHealthDot, formatRelativeTime } = await import('/web/staleness-utils.js');
  const { buildItemsFromMeta } = await import('/web/shared-build-items.js');

  // Constants
  const FULL_CLASS_NAMES = [
    "Language Arts 1 SC",
    "Language Arts 2 SC",
    "Language Arts 3 SC",
    "Language Arts 4 SC",
    "Life Skills Language Arts SC",
    "Life Skills",
    "Consumer Math",
    "Geometry SC",
    "Speech/Language",
    "Warrior Academy"
  ];

  const GOAL_AREAS = [
    "Reading Comprehension",
    "Written Expression",
    "Basic Reading",
    "Behavior",
    "Life Skills Transition",
    "Life Skills Reading Skills",
    "Life Skills Writing Skills",
    "Math Calculation",
    "Math Problem Solving",
    "Reading Fluency",
    "Social Skills",
    "Language",
    "Life Skills",
    "Emotional Regulation",
    "Reading Skills"
  ];

  const CLASS_ABBREVIATIONS = {
    "Language Arts 1 SC": "LA1SC",
    "Language Arts 2 SC": "LA2SC",
    "Language Arts 3 SC": "LA3SC",
    "Language Arts 4 SC": "LA4SC",
    "Life Skills Language Arts SC": "LSLASC",
    "Life Skills": "LS",
    "Consumer Math": "CM",
    "Geometry SC": "GeoSC",
    "Speech/Language": "S/L",
    "Warrior Academy": "WA"
  };

  // Inline SVG icon constants for goal areas and UI elements (Feather/Lucide style)
  const DEFAULT_DATA_COLLECTOR = 'Dan Reinisch';
  const SVG_ICON_BOOK_OPEN    = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
  const SVG_ICON_PENCIL       = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const SVG_ICON_BOOK         = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
  const SVG_ICON_HASH         = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';
  const SVG_ICON_CALCULATOR   = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="10" x2="16" y2="18"/><line x1="8" y1="10" x2="12" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/></svg>';
  const SVG_ICON_TARGET       = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
  const SVG_ICON_ARROW_CIRCLE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 16 16 12 12 8"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
  const SVG_ICON_USERS        = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  const SVG_ICON_MESSAGE      = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const SVG_ICON_TOOL         = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
  const SVG_ICON_SMILE        = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
  const SVG_ICON_BOOKMARK     = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  const SVG_ICON_CLIPBOARD    = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
  const SVG_ICON_USER         = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:3px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  const SVG_ICON_BAR_CHART    = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:3px"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
  const SVG_ICON_CALENDAR     = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:3px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  const SVG_ICON_TRASH        = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:3px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  const SVG_ICON_LINK         = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:3px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

  const GOAL_AREA_ICONS = {
    "Reading Comprehension":   SVG_ICON_BOOK_OPEN,
    "Written Expression":      SVG_ICON_PENCIL,
    "Basic Reading":           SVG_ICON_BOOK,
    "Behavior":                SVG_ICON_TARGET,
    "Life Skills Transition":  SVG_ICON_ARROW_CIRCLE,
    "Life Skills Reading Skills": SVG_ICON_BOOK_OPEN,
    "Life Skills Writing Skills": SVG_ICON_PENCIL,
    "Math Calculation":        SVG_ICON_HASH,
    "Math Problem Solving":    SVG_ICON_CALCULATOR,
    "Reading Fluency":         SVG_ICON_BOOKMARK,
    "Social Skills":           SVG_ICON_USERS,
    "Language":                SVG_ICON_MESSAGE,
    "Life Skills":             SVG_ICON_TOOL,
    "Emotional Regulation":    SVG_ICON_SMILE,
    "Reading Skills":          SVG_ICON_BOOKMARK
  };

  // UI indicator for missing dates
  const MISSING_DATE_WARNING = ' <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  // Milliseconds per calendar day — used for staleness calculations
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  // Sort sentinel used when a student has never had data collected (sort last by data_age)
  const NULL_DATA_AGE_SORT_VALUE = 99999;

  // Inline SVG status icons for table cells and status badges
  const SVG_STATUS_OK   = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  const SVG_STATUS_WARN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const SVG_STATUS_BAD  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

  // Observation icon constants (used in goal cards and toast notifications)
  const ST_CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>';
  const ST_WARN_SVG  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  const OBS_HIST_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-right:2px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  const OBS_HIST_X     = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-right:2px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  const OBS_HIST_HASH  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-right:2px"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';
  const OBS_HIST_ALERT = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-right:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  const OBS_HIST_LIST  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-right:2px"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';

  // Progress data toggle button icons (View Data / Hide Data)
  const SVG_VIEW_DATA = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
  const SVG_HIDE_DATA = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

  // Dot-grid chart icon paths (24×24 viewBox) — check-circle and x-circle
  const DOT_CHECK_PATHS = '<circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/>';
  const DOT_X_PATHS     = '<circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>';

  // Accordion pagination / display constants
  const ACC_PAGE_SIZE = 5;        // assignments shown per page in accordion
  const ACC_Q_TEXT_CARD_MAX = 55; // max chars of question text shown on the inline card
  const ACC_Q_TEXT_ARIA_MAX = 40; // max chars of question text used in aria-label

  // Mapping from DB class codes to UI canonical class names
  // Used to normalize enrollment data that may come with class_code instead of class_name
  const CLASS_CODE_TO_CANONICAL_NAMES = {
    'LA1': ['Language Arts 1 SC'],
    'LA2': ['Language Arts 2 SC'],
    'LA3': ['Language Arts 3 SC'],
    'LA4': ['Language Arts 4 SC'],
    'LS-LA': ['Life Skills Language Arts SC'],
    'LS': ['Life Skills'],
    'CM': ['Consumer Math'],
    'GEO-SC': ['Geometry SC'],
    'SL': ['Speech/Language'],
    'WA': ['Warrior Academy']
  };

  // Helpers
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Mastery Nudge Snooze Helpers ─────────────────────────────────────────
  const MASTERY_DISMISS_PREFIX = 'rc_mastery_dismiss_';
  const MASTERY_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  /** Returns true if the mastery nudge for this goal+student has been snoozed and the snooze hasn't expired. */
  function isMasteryDismissed(goalCode, studentCode) {
    const key = MASTERY_DISMISS_PREFIX + goalCode + '_' + studentCode;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const ts = parseInt(raw, 10);
      return !isNaN(ts) && Date.now() - ts < MASTERY_DISMISS_TTL_MS;
    } catch { return false; }
  }

  /** Stores a dismissal timestamp so the nudge is hidden for 7 days. */
  function dismissMasteryNudge(goalCode, studentCode) {
    const key = MASTERY_DISMISS_PREFIX + goalCode + '_' + studentCode;
    try { localStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
  }

  /**
   * Increments the version suffix of a goal code.
   * e.g. "S001.11.1" → "S001.11.1v2", "S001.11.1v2" → "S001.11.1v3"
   */
  function incrementGoalCode(code) {
    const match = (code || '').match(/^(.+?)v(\d+)$/);
    if (match) {
      return match[1] + 'v' + (parseInt(match[2], 10) + 1);
    }
    return (code || '') + 'v2';
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatProgressValue(value, measurementType) {
    if (value == null) return '—';
    const num = parseFloat(value);
    if (isNaN(num)) return String(value);
    if (measurementType === 'Accuracy' || measurementType === 'Percent') return `${Math.round(num * 10) / 10}%`;
    if (measurementType === 'Duration') {
      const mins = Math.floor(num);
      const secs = Math.round((num - mins) * 60);
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    if (measurementType === 'Rate') return `${Math.round(num * 10) / 10}/min`;
    return String(Math.round(num * 10) / 10);
  }

  // formatObservationProgressEntry is now provided by obs-utils.js (imported as formatObservationValue)

  /**
   * Build a collapsible accordion chart for per-question goal data points.
   * Groups data points by assignment_instance_id (one row per assignment/date).
   * Shared logic mirroring buildDotGridChart in student-portal-init.js.
   *
   * @param {Array}  dataPoints  rows from goal_data_points table for this goal
   * @param {string} goalId      goal UUID (used as id prefix)
   * @param {string} [suffix]    optional suffix to ensure unique DOM IDs
   * @returns {{ html: string, hasData: boolean }}
   */
  function buildTcDotGridChart(dataPoints, goalId, suffix) {
    if (!dataPoints || dataPoints.length === 0) {
      return { html: '', hasData: false };
    }

    // Group by instance (assignment_instance_id or date as fallback)
    const groups = new Map();
    for (const pt of dataPoints) {
      const key = pt.assignment_instance_id || pt.date;
      if (!groups.has(key)) {
        groups.set(key, { key, date: pt.date, points: [] });
      }
      groups.get(key).points.push(pt);
    }

    // Sort groups newest-first
    const sortedGroups = [...groups.values()].sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = dataPoints.length;
    const correct = dataPoints.filter(p => p.is_correct === true).length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const assignmentCount = sortedGroups.length;
    // Determine if any data point uses percentage scoring (score column populated)
    const hasScoreDots = dataPoints.some(p => p.score != null);
    const summaryText = hasScoreDots
      ? `${assignmentCount} assignment${assignmentCount !== 1 ? 's' : ''}`
      : `${correct}/${total} correct (${pct}%) across ${assignmentCount} assignment${assignmentCount !== 1 ? 's' : ''}`;

    const idBase = `tc-dg-${(goalId || 'g').replace(/[^a-z0-9]/gi, '_')}${suffix || ''}`;

    /** Return a fill color for a 0–100 percentage score. */
    const scoreToColor = (score) => {
      if (score >= 100) return '#22c55e';
      if (score >= 80)  return '#3b82f6';
      if (score >= 60)  return '#eab308';
      return '#ef4444';
    };

    /** Return the border color for a question card. */
    const cardBorderColor = (pt) => {
      if (pt.score != null) return scoreToColor(Number(pt.score));
      return pt.is_correct === true ? '#22c55e' : '#ef4444';
    };

    // Trend indicator: compare last 3 vs prior 3 assignments (requires 6+)
    let trendHtml = '';
    if (sortedGroups.length >= 6) {
      const groupAvgScore = (grps) => {
        const pts = grps.flatMap(g => g.points);
        if (!pts.length) return 0;
        if (hasScoreDots) {
          const scored = pts.filter(p => p.score != null);
          return scored.length ? scored.reduce((s, p) => s + Number(p.score), 0) / scored.length : 0;
        }
        return (pts.filter(p => p.is_correct === true).length / pts.length) * 100;
      };
      const recentAvg = groupAvgScore(sortedGroups.slice(0, 3));
      const priorAvg  = groupAvgScore(sortedGroups.slice(3, 6));
      const diff = recentAvg - priorAvg;
      let trendClass, trendLabel;
      if (diff >= 5) {
        trendClass = 'st-acc-trend--up';
        trendLabel = '↗ improving';
      } else if (diff <= -5) {
        trendClass = 'st-acc-trend--down';
        trendLabel = '↘ declining';
      } else {
        trendClass = 'st-acc-trend--flat';
        trendLabel = '→ steady';
      }
      trendHtml = `<div class="st-acc-trend-bar"><span class="st-acc-trend ${trendClass}">${trendLabel}</span></div>`;
    }

    // Build accordion rows
    const chevronSvg = '<svg class="st-acc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

    let accRows = '';
    sortedGroups.forEach((group, rowIdx) => {
      const hidden = rowIdx >= ACC_PAGE_SIZE;
      const dateLabel = escapeHtml(formatDate(group.date));
      const qCount = group.points.length;
      const qCountLabel = `${qCount} question${qCount !== 1 ? 's' : ''}`;

      // Score badge for the row
      let rowScoreHtml = '';
      if (hasScoreDots) {
        const scoredPts = group.points.filter(p => p.score != null);
        if (scoredPts.length) {
          const avg = scoredPts.reduce((s, p) => s + Number(p.score), 0) / scoredPts.length;
          rowScoreHtml = `<span class="st-acc-row-score" style="color:${scoreToColor(avg)};">${Math.round(avg)}%</span>`;
        }
      } else {
        const rowCorrect = group.points.filter(p => p.is_correct === true).length;
        const rowPct = group.points.length ? Math.round((rowCorrect / group.points.length) * 100) : 0;
        const scoreColor = scoreToColor(rowPct);
        rowScoreHtml = `<span class="st-acc-row-score" style="color:${scoreColor};">${rowCorrect}/${group.points.length}</span>`;
      }

      // Per-question cards
      let cardsHtml = '';
      group.points.forEach((pt, qIdx) => {
        const qNum = qIdx + 1;
        const rawText = pt.question_text || null;
        const cardText = rawText
          ? (rawText.length > ACC_Q_TEXT_CARD_MAX ? rawText.substring(0, ACC_Q_TEXT_CARD_MAX) + '…' : rawText)
          : `Question ${qNum}`;
        const ariaText = rawText
          ? (rawText.length > ACC_Q_TEXT_ARIA_MAX ? rawText.substring(0, ACC_Q_TEXT_ARIA_MAX) + '…' : rawText)
          : `Question ${qNum}`;

        let scoreDisplay;
        if (pt.score != null) {
          const score = Number(pt.score);
          const color = scoreToColor(score);
          scoreDisplay = `<span class="st-acc-q-score" style="color:${color};">${score}%</span>`;
        } else {
          const isCorrect = pt.is_correct === true;
          const iconColor = isCorrect ? '#22c55e' : '#f87171';
          const iconPaths = isCorrect ? DOT_CHECK_PATHS : DOT_X_PATHS;
          scoreDisplay = `<svg class="st-acc-q-score" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths}</svg>`;
        }

        const borderColor = cardBorderColor(pt);
        const dpVal = encodeURIComponent(JSON.stringify({
          qNum,
          question_text: pt.question_text || null,
          choices: pt.choices || null,
          student_answer: pt.student_answer || null,
          correct_answer: pt.correct_answer || null,
          is_correct: pt.is_correct,
          score: pt.score ?? null,
          date: pt.date,
        }));
        const ariaLabel = escapeHtml(`Q${qNum}: ${ariaText} — ${formatDate(group.date)}`);
        cardsHtml += `<button class="st-acc-q-card" data-dp="${dpVal}" style="border-left-color:${borderColor};" aria-label="${ariaLabel}">` +
          `<span class="st-acc-q-num">Q${qNum}</span>` +
          `<span class="st-acc-q-text">${escapeHtml(cardText)}</span>` +
          scoreDisplay +
          `</button>`;
      });

      const rowHiddenClass = hidden ? ' st-acc-row--hidden' : '';
      accRows += `<div class="st-acc-row${rowHiddenClass}">` +
        `<button class="st-acc-row-toggle" aria-expanded="false">` +
        `<span class="st-acc-row-date">${dateLabel}</span>` +
        `<span class="st-acc-row-meta">${escapeHtml(qCountLabel)}</span>` +
        rowScoreHtml +
        chevronSvg +
        `</button>` +
        `<div class="st-acc-row-body" hidden><div class="st-acc-q-cards">${cardsHtml}</div></div>` +
        `</div>`;
    });

    // "Show older" button when there are hidden rows
    const hiddenCount = Math.max(0, sortedGroups.length - ACC_PAGE_SIZE);
    const showOlderBtn = hiddenCount > 0
      ? `<button class="st-acc-show-older" data-acc-list="${idBase}-acc" data-total="${sortedGroups.length}" data-loaded="${ACC_PAGE_SIZE}">Show older assignments (${hiddenCount} more)</button>`
      : '';

    // Legend
    let legendHtml;
    if (hasScoreDots) {
      legendHtml = `
        <span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill="#22c55e"/></svg> 100%</span>
        <span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill="#3b82f6"/></svg> 80–99%</span>
        <span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill="#eab308"/></svg> 60–79%</span>
        <span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill="#ef4444"/></svg> 0–59%</span>`;
    } else {
      const legendCheckSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOT_CHECK_PATHS}</svg>`;
      const legendXSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOT_X_PATHS}</svg>`;
      legendHtml = `
        <span style="display:inline-flex;align-items:center;gap:5px;">${legendCheckSvg} Correct</span>
        <span style="display:inline-flex;align-items:center;gap:5px;">${legendXSvg} Incorrect</span>`;
    }

    const html = `
      <div class="st-dot-grid-wrap">
        <div class="st-dot-grid-header">Per-Question Results</div>
        <div class="st-dot-grid-summary">${escapeHtml(summaryText)}</div>
        ${trendHtml}
        <div class="st-acc-list" id="${idBase}-acc">
          ${accRows}
        </div>
        ${showOlderBtn}
        <div class="st-dot-grid-legend">${legendHtml}</div>
      </div>`;

    return { html, hasData: true };
  }

  function abbreviateClass(fullName) {
    return CLASS_ABBREVIATIONS[fullName] || fullName;
  }

  /**
   * Map a goal area to a color category for the left border
   */
  function goalAreaToColorCategory(goalArea) {
    const area = (goalArea || '').toLowerCase();
    if (area.includes('reading')) return 'Reading';
    if (area.includes('writ')) return 'Writing';
    if (area.includes('math')) return 'Math';
    if (area.includes('behavior')) return 'Behavior';
    if (area.includes('life skill')) return 'LifeSkills';
    if (area.includes('social')) return 'Social';
    if (area.includes('language')) return 'Language';
    if (area.includes('emotional')) return 'Emotional';
    return 'Other';
  }

  /**
   * Get date urgency class based on days until due
   */
  function getDateUrgency(dateStr) {
    if (!dateStr) return 'none';
    const due = new Date(dateStr);
    if (isNaN(due.getTime())) return 'none';
    const now = new Date();
    const daysUntil = (due - now) / (1000 * 60 * 60 * 24);
    if (daysUntil <= 30) return 'urgent';
    if (daysUntil <= 60) return 'warning';
    return 'ok';
  }

  /**
   * Check if IEP due date is urgent (within 30 days or overdue)
   */
  /**
   * Normalize enrollment data to ensure class_name is present
   * If class_name is missing but class_code is present, derives class_name from class_code mapping
   */
  function normalizeEnrollments(enrollments) {
    return enrollments.map(enrollment => {
      // If class_name already exists, return as is
      if (enrollment.class_name) {
        return enrollment;
      }
      
      // If class_code exists, try to map it to canonical name(s)
      if (enrollment.class_code) {
        const mappedNames = CLASS_CODE_TO_CANONICAL_NAMES[enrollment.class_code];
        if (mappedNames && mappedNames.length > 0) {
          // Use first mapped name as the class_name
          return { ...enrollment, class_name: mappedNames[0] };
        }
        // If no mapping found, use class_code as fallback
        return { ...enrollment, class_name: enrollment.class_code };
      }
      
      // If neither exists, return with Unknown
      return { ...enrollment, class_name: 'Unknown' };
    });
  }

  /**
   * Map observation category value to a human-readable label
   */
  function obsCategoryLabel(category) {
    const labels = {
      session_outcome: 'Session Outcome',
      tally: 'Tally',
      prompt_count: 'Prompt Count',
      behavior_checklist: 'Behavior Checklist'
    };
    return labels[category] || category;
  }

  /**
   * Gather observation_config from a form element.
   * Returns null if measurement_type is not Observation.
   * @param {HTMLElement} container - The form or container element
   * @returns {Object|null}
   */
  function gatherObservationConfig(container) {
    const measEl = container.querySelector('[name="measurement_type"]');
    if (!measEl || measEl.value !== 'Observation') return null;

    const catEl = container.querySelector('[name="observation_category"]');
    const category = catEl ? catEl.value : '';

    const config = { category };

    if (category === 'session_outcome') {
      config.target_met = parseInt(container.querySelector('[name="obs_target_met"]')?.value) || null;
      config.target_window = parseInt(container.querySelector('[name="obs_target_window"]')?.value) || null;
    } else if (category === 'prompt_count') {
      config.target_max_prompts = parseInt(container.querySelector('[name="obs_target_max_prompts"]')?.value);
      if (isNaN(config.target_max_prompts)) config.target_max_prompts = null;
    } else if (category === 'behavior_checklist') {
      const inputs = container.querySelectorAll('[name="obs_sub_behavior"]');
      config.sub_behaviors = Array.from(inputs).map(i => i.value.trim()).filter(v => v);
    }

    // Class periods (checkboxes)
    const periodBoxes = container.querySelectorAll('[name="obs_class_period"]:checked');
    config.class_periods = Array.from(periodBoxes).map(cb => cb.value);

    return config;
  }

  /**
   * Validate observation config fields.
   * Returns an array of error strings (empty = valid).
   * @param {HTMLElement} container
   * @returns {string[]}
   */
  function validateObservationConfig(container) {
    const measEl = container.querySelector('[name="measurement_type"]');
    if (!measEl || measEl.value !== 'Observation') return [];

    const errors = [];
    const catEl = container.querySelector('[name="observation_category"]');
    const category = catEl ? catEl.value : '';

    if (!category) {
      errors.push('Observation category is required.');
    }

    if (category === 'session_outcome') {
      const metVal = parseInt(container.querySelector('[name="obs_target_met"]')?.value);
      const winVal = parseInt(container.querySelector('[name="obs_target_window"]')?.value);
      if (!metVal || metVal < 1) errors.push('Target: "met" count must be at least 1.');
      if (!winVal || winVal < 1) errors.push('Target: "window" must be at least 1.');
      if (metVal && winVal && winVal < metVal) errors.push('Target window must be ≥ target met count.');
    } else if (category === 'prompt_count') {
      const maxVal = parseInt(container.querySelector('[name="obs_target_max_prompts"]')?.value);
      if (isNaN(maxVal) || maxVal < 0) errors.push('Target max prompts must be 0 or greater.');
    } else if (category === 'behavior_checklist') {
      const inputs = container.querySelectorAll('[name="obs_sub_behavior"]');
      const nonEmpty = Array.from(inputs).filter(i => i.value.trim());
      if (nonEmpty.length === 0) errors.push('At least one sub-behavior is required.');
    }

    const periodBoxes = container.querySelectorAll('[name="obs_class_period"]:checked');
    if (periodBoxes.length === 0) errors.push('At least one class period must be selected.');

    return errors;
  }

  /**
   * Build the HTML for observation configuration fields.
   * @param {Object|null} obsConfig - Existing observation_config (for pre-population on edit)
   * @param {Array} schedulePeriods - Array of period objects from getSchedule()
   * @param {string} idPrefix - A unique prefix for element IDs within this form context
   * @returns {string} HTML string
   */
  function renderObservationConfigHtml(obsConfig, schedulePeriods) {
    const cat = obsConfig?.category || '';
    const showObs = !!obsConfig;
    const displayObs = showObs ? '' : 'display:none';

    // Category-specific fields
    const soDisplay = cat === 'session_outcome' ? '' : 'display:none';
    const pcDisplay = cat === 'prompt_count' ? '' : 'display:none';
    const bcDisplay = cat === 'behavior_checklist' ? '' : 'display:none';

    const targetMet = obsConfig?.target_met ?? '';
    const targetWindow = obsConfig?.target_window ?? '';
    const targetMaxPrompts = obsConfig?.target_max_prompts ?? '';

    // Sub-behaviors for checklist
    const subBehaviors = (obsConfig?.category === 'behavior_checklist' && Array.isArray(obsConfig?.sub_behaviors) && obsConfig.sub_behaviors.length > 0)
      ? obsConfig.sub_behaviors
      : [''];
    const subBehaviorsHtml = subBehaviors.map((sb, i) => `
      <div class="obs-sub-behavior-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
        <input type="text" name="obs_sub_behavior" class="st-form-input" value="${escapeHtml(sb)}" placeholder="e.g., Raise hand" style="flex:1;" />
        <button type="button" class="st-btn st-btn-danger st-btn-small obs-remove-behavior-btn" aria-label="Remove sub-behavior"${i === 0 ? ' style="visibility:hidden"' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');

    // Class period checkboxes
    let periodPickerHtml = '';
    if (!schedulePeriods || schedulePeriods.length === 0) {
      periodPickerHtml = '<p style="font-size:13px;color:#6b7280;margin:4px 0;">Configure your bell schedule in Settings to enable period selection.</p>';
    } else {
      const selectedPeriods = obsConfig?.class_periods || [];
      periodPickerHtml = schedulePeriods
        .filter(p => !p.planning)
        .map(p => {
          const label = escapeHtml(p.name || p.label || '');
          const checked = selectedPeriods.includes(p.name || p.label) ? 'checked' : '';
          return `<label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:4px;cursor:pointer;">
            <input type="checkbox" name="obs_class_period" value="${label}" ${checked} style="margin:0;" />
            ${label}
          </label>`;
        }).join('');
    }

    return `
      <div class="obs-config-section" style="${displayObs}">
        <div class="st-form-group">
          <label class="st-form-label">Observation Category</label>
          <select name="observation_category" class="st-form-select obs-category-select">
            <option value="">Select category...</option>
            <option value="session_outcome" ${cat === 'session_outcome' ? 'selected' : ''}>Session Outcome (Met / Not Met per session)</option>
            <option value="tally" ${cat === 'tally' ? 'selected' : ''}>Tally (X of Y opportunities)</option>
            <option value="prompt_count" ${cat === 'prompt_count' ? 'selected' : ''}>Prompt Count (number of prompts needed)</option>
            <option value="behavior_checklist" ${cat === 'behavior_checklist' ? 'selected' : ''}>Behavior Checklist (multiple sub-behaviors)</option>
          </select>
        </div>
        <div class="obs-category-fields obs-session-outcome-fields" style="${soDisplay}">
          <div class="st-form-row">
            <div class="st-form-group">
              <label class="st-form-label">Target: met sessions</label>
              <input type="number" name="obs_target_met" class="st-form-input" min="1" value="${escapeHtml(String(targetMet))}" placeholder="e.g., 3" />
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Target: window size</label>
              <input type="number" name="obs_target_window" class="st-form-input" min="1" value="${escapeHtml(String(targetWindow))}" placeholder="e.g., 5" />
            </div>
          </div>
        </div>
        <div class="obs-category-fields obs-prompt-count-fields" style="${pcDisplay}">
          <div class="st-form-group">
            <label class="st-form-label">Target: max prompts (or fewer)</label>
            <input type="number" name="obs_target_max_prompts" class="st-form-input" min="0" value="${escapeHtml(String(targetMaxPrompts))}" placeholder="e.g., 2" />
          </div>
        </div>
        <div class="obs-category-fields obs-behavior-checklist-fields" style="${bcDisplay}">
          <div class="st-form-group">
            <label class="st-form-label">Sub-Behaviors</label>
            <div class="obs-sub-behaviors-list">${subBehaviorsHtml}</div>
            <button type="button" class="st-btn st-btn-secondary st-btn-small obs-add-behavior-btn" style="margin-top:4px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Sub-Behavior
            </button>
          </div>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Observe during which class periods?</label>
          <div class="obs-period-picker" style="padding:6px 0;">
            ${periodPickerHtml}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Wire up show/hide and dynamic sub-behavior list for observation config fields
   * within a given container element.
   * @param {HTMLElement} container
   */
  function initObservationFields(container) {
    const measSel = container.querySelector('[name="measurement_type"]');
    const obsSection = container.querySelector('.obs-config-section');
    if (!measSel || !obsSection) return;

    function updateObsVisibility() {
      const isObs = measSel.value === 'Observation';
      obsSection.style.display = isObs ? '' : 'none';
    }

    measSel.addEventListener('change', updateObsVisibility);
    updateObsVisibility();

    // Show/hide category-specific fields
    const catSel = obsSection.querySelector('.obs-category-select');
    if (catSel) {
      const updateCategoryFields = () => {
        const cat = catSel.value;
        obsSection.querySelectorAll('.obs-category-fields').forEach(el => {
          el.style.display = 'none';
        });
        if (cat === 'session_outcome') {
          const el = obsSection.querySelector('.obs-session-outcome-fields');
          if (el) el.style.display = '';
        } else if (cat === 'prompt_count') {
          const el = obsSection.querySelector('.obs-prompt-count-fields');
          if (el) el.style.display = '';
        } else if (cat === 'behavior_checklist') {
          const el = obsSection.querySelector('.obs-behavior-checklist-fields');
          if (el) el.style.display = '';
        }
      };
      catSel.addEventListener('change', updateCategoryFields);
      updateCategoryFields();
    }

    // Dynamic sub-behavior add/remove
    obsSection.addEventListener('click', (e) => {
      if (e.target.closest('.obs-add-behavior-btn')) {
        const list = obsSection.querySelector('.obs-sub-behaviors-list');
        if (!list) return;
        const row = document.createElement('div');
        row.className = 'obs-sub-behavior-row';
        row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
        row.innerHTML = `
          <input type="text" name="obs_sub_behavior" class="st-form-input" value="" placeholder="e.g., Raise hand" style="flex:1;" />
          <button type="button" class="st-btn st-btn-danger st-btn-small obs-remove-behavior-btn" aria-label="Remove sub-behavior">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        `;
        list.appendChild(row);
      }
      if (e.target.closest('.obs-remove-behavior-btn')) {
        const row = e.target.closest('.obs-sub-behavior-row');
        const list = obsSection.querySelector('.obs-sub-behaviors-list');
        if (row && list && list.querySelectorAll('.obs-sub-behavior-row').length > 1) {
          row.remove();
        }
      }
    });
  }

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Split CSV text into rows, respecting quoted fields that may contain newlines.
   * RFC 4180 compliant: handles multi-line quoted fields properly.
   * @param {string} text - The raw CSV text
   * @returns {string[]} Array of CSV row strings (not parsed into fields yet)
   */
  function splitCsvIntoRows(text) {
    const rows = [];
    let currentRow = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Handle escaped quotes (two consecutive quotes: "")
      // When we see "" inside quotes, we consume both characters by incrementing i
      // The loop's i++ will then move to the character AFTER the pair
      if (char === '"' && inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        currentRow += '""';
        i++; // Consume the second quote; loop's i++ will skip past it
      } 
      // Toggle quote state
      else if (char === '"') {
        inQuotes = !inQuotes;
        currentRow += char;
      }
      // Handle newlines - only split if NOT inside quotes
      else if ((char === '\n' || char === '\r') && !inQuotes) {
        // Handle \r\n (CRLF) by consuming both characters
        // When we see \r\n, we consume both by incrementing i
        // The loop's i++ will then move to the character AFTER the pair
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          i++; // Consume the \n; loop's i++ will skip past it
        }
        // Only add non-empty rows
        if (currentRow.trim()) {
          rows.push(currentRow);
        }
        currentRow = '';
      }
      // Regular character
      else {
        currentRow += char;
      }
    }
    
    // Don't forget the last row if it doesn't end with a newline
    if (currentRow.trim()) {
      rows.push(currentRow);
    }
    
    return rows;
  }

  // State
  let allStudents = [];
  let allGoals = [];
  let allEnrollments = [];
  let allProgressEntries = []; // Progress data for data collection status
  let filteredStudents = [];
  let expandedStudents = new Set(); // For inline expand in table - Support multiple expanded students
  let selectedClassFilter = 'All';
  let selectedGoalAreaFilter = 'All';
  let selectedQuarter = null; // 'Q1', 'Q2', 'Q3', 'Q4', or null for all
  let searchQuery = '';
  let isSyncing = false;
  let sortBy = 'code'; // 'code', 'goals', 'iep_due', 'eval_due'
  let selectedDetailTabMap = new Map(); // Map<studentCode, tabName> - Per-student tab state
  let editingGoalId = null;
  let enteringDataGoalId = null; // Track which goal has the data entry form open
  let showArchived = false;
  let needsAttentionFilter = false; // When true, show only students with regressing/stalled goals or stale data
  let focusModeActive = false; // When true, dim non-attention rows to 30% opacity
  let expandedGoalCards = new Set(); // Track which goal cards are expanded (not collapsed)
  let iepWizardData = null; // { step: 1, studentCode: '', goalsToArchive: Set, newGoals: [], iepDue: '', evalDue: '' }
  let expandMode = 'none'; // 'none', 'students', 'all' - Track bulk expand state
  let progressLookupMap = new Map(); // Map<"studentCode:goalCode", progressEntry[]> - Performance optimization
  let progressTabQuarterMap = new Map(); // Map<studentCode, quarterKey> - Per-student quarter selection on Progress tab
  let _cachedSchedulePeriods = []; // Cached bell schedule periods for observation config UI
  let offlineBannerEl = null; // Reference to the persistent offline warning banner
  let undoToastTimer = null;  // Timer for the undo toast auto-dismiss
  let pendingUndo = null;     // Snapshot for the most recent Quick Entry save (for undo)
  let allAttendanceLogs = []; // Attendance records loaded on page init

  /**
   * Per-student AbortControllers for event listeners attached to expanded content.
   * Aborted when the student row is collapsed or re-rendered, preventing accumulation.
   */
  const expandedContentControllers = new Map(); // Map<studentCode, AbortController>

  // ── Urgency Sort ─────────────────────────────────────────────────────────────
  const ST_SORT_PREF_KEY = 'rc_students_sort';
  const URGENCY_SCORE_REGRESSING = 30;
  const URGENCY_SCORE_STALE_GOAL = 20;
  const URGENCY_SCORE_STALLED    = 10;
  const URGENCY_SCORE_MASTERED   = 5;

  // ── Auto-Expand Alerts ────────────────────────────────────────────────────────
  const ST_AUTO_EXPAND_KEY = 'rc_students_auto_expand';
  let autoExpandAlerts = localStorage.getItem(ST_AUTO_EXPAND_KEY) !== 'false'; // default true
  let _initialLoadDone = false; // guard so auto-expand only fires on first load

  // ── Daily Review ─────────────────────────────────────────────────────────────
  let dailyReviewActive = false;
  let dailyReviewStudents = []; // ordered list of student codes needing attention
  let dailyReviewIndex = 0;     // current position in review

  // ── Auto-Refresh ─────────────────────────────────────────────────────────────
  const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
  let autoRefreshTimer = null;

  // ── Per-question skill gap thresholds ─────────────────────────────────────
  /** Badge shows on goal card when any question accuracy is below this threshold */
  const SKILL_GAP_BADGE_THRESHOLD = 50;
  /** Questions below this threshold are included in the AI prompt as weaknesses */
  const AI_WEAKNESS_THRESHOLD = 60;
  /** Max question text length sent to AI (must match sanitizeForPrompt limit in teacher-ai-skills-summary.js) */
  const AI_QUESTION_TEXT_MAX_LEN = 100;

  // ── Cross-student summary / data quality ─────────────────────────────────
  const ST_DISMISSED_VALIDATIONS_KEY = 'rc_dismissed_validations';

  // ── Pinned Students ───────────────────────────────────────────────────────
  const ST_PINNED_STUDENTS_KEY = 'rc_pinned_students_v1';
  const pinnedStudents = new Set(
    JSON.parse(localStorage.getItem(ST_PINNED_STUDENTS_KEY) || '[]')
  );

  /** Track the last student row the pointer hovered over (for 'P' shortcut). */
  let _lastHoveredCode = null;

  /**
   * Validate all loaded progress entries and return an array of issue objects.
   * Uses the same dismissed-validation key as tc-data.js so dismissals persist
   * across both pages.
   */
  function validateStudentProgress() {
    const issues = [];
    const dismissed = new Set(
      JSON.parse(localStorage.getItem(ST_DISMISSED_VALIDATIONS_KEY) || '[]')
    );

    const goalMap = new Map();
    for (const g of allGoals) {
      goalMap.set(`${g.student_code}_${g.code}`, g);
    }

    for (const p of allProgressEntries) {
      const goal = goalMap.get(`${p.student_code}_${p.goal_code}`);
      const issueKey = `${p.student_code}_${p.goal_code}_${p.date}`;
      const rawValue = p.value ?? p.percent;
      const pValue = rawValue != null ? parseFloat(rawValue) : null;

      if (goal && pValue != null && !isNaN(pValue)) {
        const masteryThreshold = parseGoalValue(goal.mastery || goal.target);
        if (masteryThreshold != null && pValue > masteryThreshold) {
          const key = `exceeds_mastery_${issueKey}`;
          if (!dismissed.has(key)) {
            issues.push({
              id: key,
              type: 'exceeds_mastery',
              severity: 'warning',
              student_code: p.student_code,
              goal_code: p.goal_code,
              message: `Progress (${pValue}) exceeds mastery target (${goal.mastery || goal.target})`,
              date: p.date
            });
          }
        }
      }

      if (new Date(p.date) > new Date()) {
        const key = `future_date_${issueKey}`;
        if (!dismissed.has(key)) {
          issues.push({
            id: key,
            type: 'future_date',
            severity: 'error',
            student_code: p.student_code,
            goal_code: p.goal_code,
            message: `Entry dated in the future: ${p.date}`,
            date: p.date
          });
        }
      }
    }

    const seen = new Map();
    for (const p of allProgressEntries) {
      const pValue = p.value ?? p.percent;
      const key = `${p.student_code}_${p.goal_code}_${p.date}_${pValue}`;
      if (seen.has(key)) {
        const issueKey = `duplicate_${key}`;
        if (!dismissed.has(issueKey)) {
          issues.push({
            id: issueKey,
            type: 'duplicate',
            severity: 'warning',
            student_code: p.student_code,
            goal_code: p.goal_code,
            message: 'Duplicate entry detected',
            date: p.date
          });
        }
      }
      seen.set(key, true);
    }

    const goalsWithProgress = new Set(
      allProgressEntries.map(p => `${p.student_code}_${p.goal_code}`)
    );
    for (const g of allGoals) {
      if (g.status === 'archived') continue;
      const key = `${g.student_code}_${g.code}`;
      if (goalsWithProgress.has(key) && g.baseline == null) {
        const issueKey = `missing_baseline_${key}`;
        if (!dismissed.has(issueKey)) {
          issues.push({
            id: issueKey,
            type: 'missing_baseline',
            severity: 'warning',
            student_code: g.student_code,
            goal_code: g.code,
            message: 'Goal has progress data but no baseline set'
          });
        }
      }
    }

    return issues;
  }

  /**
   * Render the data quality banner above the student table.
   * All dynamic content is set via textContent / setAttribute — never innerHTML
   * with user-controlled data.
   */
  function renderStudentQualityBanner() {
    const banner = document.getElementById('stQualityBanner');
    const bannerText = document.getElementById('stQualityBannerText');
    const accordion = document.getElementById('stValidationAccordion');
    if (!banner) return;

    const issues = validateStudentProgress();

    if (issues.length === 0) {
      banner.style.display = 'none';
      return;
    }

    banner.style.display = 'block';

    const counts = {};
    issues.forEach(i => { counts[i.type] = (counts[i.type] || 0) + 1; });
    const typeLabels = {
      exceeds_mastery: 'Progress > Mastery',
      future_date: 'Future Dates',
      out_of_range: 'Out of Range',
      duplicate: 'Duplicates',
      missing_baseline: 'Missing Baseline',
      stale: 'Stale Goals (60+ days)'
    };
    const summaryParts = Object.entries(counts)
      .map(([type, count]) => `${count} ${typeLabels[type] || type}`);
    if (bannerText) {
      bannerText.textContent =
        `⚠ ${issues.length} data quality issue${issues.length !== 1 ? 's' : ''}: ${summaryParts.join(', ')}`;
    }

    if (!accordion) return;
    accordion.replaceChildren();

    issues.forEach(issue => {
      const student = allStudents.find(s => s.code === issue.student_code);

      const item = document.createElement('div');
      item.className = 'st-val-accordion-item';

      const header = document.createElement('div');
      header.className = 'st-val-accordion-header';

      const title = document.createElement('div');
      title.className = 'st-val-accordion-title';

      const iconSpan = document.createElement('span');
      iconSpan.textContent = issue.severity === 'error' ? '🔴' : '⚠️';

      const labelSpan = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = student ? (student.name || student.code) : issue.student_code;
      const goalText = document.createTextNode(` — Goal ${issue.goal_code}`);
      labelSpan.appendChild(strong);
      labelSpan.appendChild(goalText);

      title.appendChild(iconSpan);
      title.appendChild(labelSpan);

      const chevron = document.createElement('span');
      chevron.className = 'st-val-accordion-icon';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '▶';

      header.appendChild(title);
      header.appendChild(chevron);

      const content = document.createElement('div');
      content.className = 'st-val-accordion-content';

      const msgP = document.createElement('p');
      msgP.style.cssText = 'margin: 0 0 10px 0;';
      msgP.textContent = issue.message;
      content.appendChild(msgP);

      if (issue.date) {
        const dateP = document.createElement('p');
        dateP.style.cssText = 'margin: 0 0 10px 0; opacity: 0.7;';
        const small = document.createElement('small');
        small.textContent = `Date: ${issue.date}`;
        dateP.appendChild(small);
        content.appendChild(dateP);
      }

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display: flex; gap: 8px;';

      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'dt-btn';
      dismissBtn.textContent = 'Dismiss';
      const issueId = issue.id;
      dismissBtn.addEventListener('click', () => {
        const dismissed = JSON.parse(
          localStorage.getItem(ST_DISMISSED_VALIDATIONS_KEY) || '[]'
        );
        dismissed.push(issueId);
        localStorage.setItem(ST_DISMISSED_VALIDATIONS_KEY, JSON.stringify(dismissed));
        renderStudentQualityBanner();
      });
      btnRow.appendChild(dismissBtn);
      content.appendChild(btnRow);

      item.appendChild(header);
      item.appendChild(content);
      accordion.appendChild(item);

      header.addEventListener('click', () => {
        item.classList.toggle('expanded');
      });
    });
  }

  /**
   * Render cross-student KPI summary cards.
   * All dynamic values assigned via textContent.
   */
  function renderStudentKpiSummary() {
    const activeStudents = filteredStudents.filter(s => s.status !== 'archived' && s.active !== false);
    const totalStudents = activeStudents.length;

    const quarterKey = selectedQuarter || getCurrentQuarter();
    const range = getQuarterDateRange(quarterKey);

    let totalProgressSum = 0;
    let progressCount = 0;
    let onTrack = 0;
    let belowTarget = 0;
    let goalsWithData = 0;
    let totalGoals = 0;

    for (const student of activeStudents) {
      const goals = allGoals.filter(
        g => g.student_code === student.code && g.status !== 'archived'
      );
      totalGoals += goals.length;

      for (const goal of goals) {
        if (goal.measurement_type === 'Observation') continue;
        const entries = getProgressForGoal(student.code, goal.code).filter(p => {
          if (!range) return true;
          const d = new Date(p.date);
          return d >= range.start && d <= range.end;
        });

        if (entries.length > 0) {
          goalsWithData++;
          const vals = entries
            .map(e => parseFloat(e.value ?? e.percent ?? ''))
            .filter(n => !isNaN(n));
          if (vals.length > 0) {
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            totalProgressSum += avg;
            progressCount++;
            const mastery = parseGoalValue(goal.mastery || goal.target);
            if (mastery != null) {
              if (avg >= mastery) onTrack++;
              else belowTarget++;
            }
          }
        }
      }
    }

    const avgProgress = progressCount > 0
      ? Math.round(totalProgressSum / progressCount)
      : null;

    const totalEl = document.getElementById('stKpiTotalStudents');
    if (totalEl) totalEl.textContent = String(totalStudents);

    const avgEl = document.getElementById('stKpiAvgProgress');
    if (avgEl) avgEl.textContent = avgProgress != null ? `${avgProgress}%` : '—';

    const onTrackEl = document.getElementById('stKpiOnTrack');
    if (onTrackEl) onTrackEl.textContent = String(onTrack);

    const belowEl = document.getElementById('stKpiBelowTarget');
    if (belowEl) belowEl.textContent = String(belowTarget);

    const dataStatusEl = document.getElementById('stKpiDataStatus');
    if (dataStatusEl) dataStatusEl.textContent = `${goalsWithData} / ${totalGoals}`;

    // Staleness summary strip — count goals by tier across all active students
    renderStalenessSummaryStrip(activeStudents);
  }

  /**
   * Render (or update) the staleness summary strip inside #stSummaryBody.
   * Shows counts like: 🟢 12 fresh · 🟡 3 aging · 🟠 2 stale · 🔴 1 critical
   * Built entirely with DOM API methods (no innerHTML with dynamic data).
   *
   * @param {Array} activeStudents
   */
  function renderStalenessSummaryStrip(activeStudents) {
    const summaryBody = document.getElementById('stSummaryBody');
    if (!summaryBody) return;

    // Remove any existing strip before re-inserting
    const existing = document.getElementById('stStalenessSummaryStrip');
    if (existing) existing.remove();

    // Tally per-tier goal counts
    const counts = { fresh: 0, aging: 0, stale: 0, critical: 0, none: 0 };
    for (const student of activeStudents) {
      const goals = allGoals.filter(g => g.student_code === student.code && g.status !== 'archived');
      for (const goal of goals) {
        const info = getGoalStalenessInfo(student.code, goal.code);
        if (info.tier in counts) counts[info.tier]++;
      }
    }

    const TIERS = [
      { key: 'fresh',    color: 'var(--rc-success)',  svgPath: '<circle cx="12" cy="12" r="10" fill="var(--rc-success)" opacity="0.8"/>', label: 'fresh' },
      { key: 'aging',    color: 'var(--rc-warning)',  svgPath: '<circle cx="12" cy="12" r="10" fill="var(--rc-warning)" opacity="0.8"/>', label: 'aging' },
      { key: 'stale',    color: '#f97316',            svgPath: '<circle cx="12" cy="12" r="10" fill="#f97316" opacity="0.8"/>',           label: 'stale' },
      { key: 'critical', color: 'var(--rc-danger)',   svgPath: '<circle cx="12" cy="12" r="10" fill="var(--rc-danger)" opacity="0.8"/>',  label: 'critical' },
      { key: 'none',     color: 'var(--rc-muted)',    svgPath: '<circle cx="12" cy="12" r="10" fill="none" stroke="var(--rc-muted)" stroke-width="2"/>', label: 'no data' },
    ];

    const strip = document.createElement('div');
    strip.id = 'stStalenessSummaryStrip';
    strip.className = 'st-kpi-card st-staleness-strip';
    strip.setAttribute('aria-label', 'Goal data staleness summary');

    let first = true;
    for (const { key, color, svgPath, label } of TIERS) {
      const count = counts[key];
      if (count === 0) continue;
      if (!first) {
        const sep = document.createElement('span');
        sep.className = 'st-staleness-sep';
        sep.textContent = '·';
        strip.appendChild(sep);
      }
      first = false;
      const item = document.createElement('span');
      item.className = 'st-staleness-strip-item';
      item.style.cssText = `display:inline-flex;align-items:center;gap:4px;color:${color};`;
      const svgDot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgDot.setAttribute('width', '10');
      svgDot.setAttribute('height', '10');
      svgDot.setAttribute('viewBox', '0 0 24 24');
      svgDot.setAttribute('aria-hidden', 'true');
      svgDot.innerHTML = svgPath;
      item.appendChild(svgDot);
      item.appendChild(document.createTextNode(`${count} ${label}`));
      strip.appendChild(item);
    }

    if (first) {
      // All counts are zero — no goals yet
      const empty = document.createElement('span');
      empty.className = 'st-staleness-strip-item';
      empty.textContent = 'No goals recorded';
      strip.appendChild(empty);
    }

    summaryBody.appendChild(strip);
  }

  /**
   * Show or hide the "Collect Now" floating nudge button.
   * Appears when any goal is in 🟠 Stale or 🔴 Critical tier.
   * Clicking scrolls to + expands the first affected student and activates Progress tab.
   */
  function renderCollectNudge() {
    // Remove any existing nudge
    const existing = document.getElementById('stCollectNudge');
    if (existing) existing.remove();

    const activeStudents = allStudents.filter(s => s.status !== 'archived' && s.active !== false);
    let staleGoalCount = 0;
    let firstStaleStudentCode = null;

    for (const student of activeStudents) {
      const goals = allGoals.filter(g => g.student_code === student.code && g.status !== 'archived');
      for (const goal of goals) {
        const info = getGoalStalenessInfo(student.code, goal.code);
        if (info.tier === 'stale' || info.tier === 'critical') {
          staleGoalCount++;
          if (!firstStaleStudentCode) firstStaleStudentCode = student.code;
        }
      }
    }

    if (staleGoalCount === 0 || !firstStaleStudentCode) return;

    const btn = document.createElement('button');
    btn.id = 'stCollectNudge';
    btn.className = 'st-collect-nudge';
    btn.setAttribute('aria-label', `${staleGoalCount} goal${staleGoalCount !== 1 ? 's' : ''} need data collection — scroll to first affected student`);

    const svgNS = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(svgNS, 'svg');
    icon.setAttribute('width', '16');
    icon.setAttribute('height', '16');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.5');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>';
    btn.appendChild(icon);

    const label = document.createElement('span');
    const pluralGoals = staleGoalCount === 1 ? 'goal needs' : 'goals need';
    label.textContent = `${staleGoalCount} ${pluralGoals} data — Collect Now`;
    btn.appendChild(label);

    btn.addEventListener('click', () => {
      const code = firstStaleStudentCode;
      // Expand the student and activate Progress tab
      expandedStudents.add(code);
      selectedDetailTabMap.set(code, 'progress');
      renderStudentList().then(() => {
        const row = document.querySelector(`tr[data-code="${CSS.escape(code)}"]`);
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    document.body.appendChild(btn);
  }

  /**
   * Render quarter filter buttons above the student table.
   * All content set via textContent / className — no innerHTML with dynamic data.
   */
  function renderStudentQuarterFilterButtons() {
    const container = document.getElementById('stQuarterFilterBar');
    if (!container) return;

    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const currentQ = getCurrentQuarter();
    container.replaceChildren();

    quarters.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'st-q-btn' + (selectedQuarter === q ? ' active' : '');
      btn.setAttribute('data-quarter', q);
      btn.setAttribute('aria-pressed', selectedQuarter === q ? 'true' : 'false');
      btn.textContent = q + (currentQ === q ? ' ★' : '');

      btn.addEventListener('click', () => {
        selectedQuarter = q;
        renderStudentQuarterFilterButtons();
        renderStudentKpiSummary();
        // Re-render expanded student detail tabs that respect selected quarter
        for (const studentCode of expandedStudents) {
          renderExpandedDetail(studentCode).catch(() => {});
        }
        renderQuarterBar();
      });

      container.appendChild(btn);
    });
  }

  /**
   * Set up toggle handlers for the quality banner and KPI summary.
   */
  function setupSummaryHandlers() {
    const refreshBtn = document.getElementById('stValidationRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        renderStudentQualityBanner();
      });
    }

    const toggleBtn = document.getElementById('stQualityToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const details = document.getElementById('stQualityDetails');
        if (details) {
          const isOpen = details.classList.toggle('open');
          toggleBtn.textContent = isOpen ? 'Details ▲' : 'Details ▼';
          toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
      });
    }

    const summaryToggle = document.getElementById('stSummaryToggle');
    if (summaryToggle) {
      summaryToggle.addEventListener('click', () => {
        const section = document.getElementById('stSummarySection');
        if (section) {
          const collapsed = section.classList.toggle('collapsed');
          summaryToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
      });
      summaryToggle.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          summaryToggle.click();
        }
      });
    }
  }

  /**
   * Render the observation coverage heatmap.
   * All content built with DOM API methods — no innerHTML with dynamic data.
   */
  function renderStudentObsHeatmap() {
    const container = document.getElementById('stObsHeatmap');
    if (!container) return;

    const obsGoals = allGoals.filter(g => g.measurement_type === 'Observation');
    if (obsGoals.length === 0) {
      container.style.display = 'none';
      return;
    }

    const periodGoals = {};
    for (const goal of obsGoals) {
      const periods = (goal.observation_config || {}).class_periods || [];
      for (const period of periods) {
        if (!periodGoals[period]) periodGoals[period] = [];
        periodGoals[period].push(goal);
      }
    }

    const periodLabels = Object.keys(periodGoals).sort();
    if (periodLabels.length === 0) {
      container.style.display = 'none';
      return;
    }

    // Find last 10 school days (Mon–Fri)
    const last10 = [];
    const iterDate = new Date();
    iterDate.setHours(0, 0, 0, 0);
    while (last10.length < 10) {
      const day = iterDate.getDay();
      if (day >= 1 && day <= 5) {
        last10.unshift(iterDate.toISOString().split('T')[0]);
      }
      iterDate.setDate(iterDate.getDate() - 1);
    }

    container.replaceChildren();
    container.style.display = 'block';

    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'padding: 12px 14px; border: 1px solid rgba(255,255,255,0.10); border-radius: 8px; background: rgba(255,255,255,0.03);';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;';

    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0; font-size: 14px; font-weight: 600;';
    title.textContent = 'Observation Coverage by Period';
    header.appendChild(title);

    wrapper.appendChild(header);

    const overflowDiv = document.createElement('div');
    overflowDiv.style.cssText = 'overflow-x: auto;';

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse: collapse; min-width: 100%;';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const periodTh = document.createElement('th');
    periodTh.style.cssText = 'padding: 4px 8px; text-align: left; font-size: 12px; opacity: 0.6;';
    periodTh.textContent = 'Period';
    headerRow.appendChild(periodTh);

    last10.forEach(ds => {
      const th = document.createElement('th');
      th.style.cssText =
        'padding: 3px 6px; text-align: center; font-size: 10px; opacity: 0.5; white-space: nowrap;';
      const d = new Date(ds + 'T00:00:00');
      th.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      headerRow.appendChild(th);
    });

    const goalsTh = document.createElement('th');
    goalsTh.style.cssText = 'padding: 4px 8px; text-align: right; font-size: 12px; opacity: 0.6;';
    goalsTh.textContent = 'Goals';
    headerRow.appendChild(goalsTh);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    periodLabels.forEach(period => {
      const goals = periodGoals[period];
      const tr = document.createElement('tr');

      const periodTd = document.createElement('td');
      periodTd.style.cssText = 'padding: 4px 8px; font-size: 12px; white-space: nowrap;';
      periodTd.textContent = period;
      tr.appendChild(periodTd);

      last10.forEach(dateStr => {
        let recorded = 0;
        for (const goal of goals) {
          if (allProgressEntries.some(
            p => p.goal_code === goal.code &&
                 p.student_code === goal.student_code &&
                 p.date === dateStr
          )) {
            recorded++;
          }
        }
        const total = goals.length;
        let color;
        if (recorded === 0) {
          color = '#ef4444';
        } else if (recorded === total) {
          color = '#22c55e';
        } else {
          color = '#eab308';
        }

        const td = document.createElement('td');
        td.style.cssText = 'padding: 3px 6px; text-align: center;';

        const dot = document.createElement('div');
        dot.setAttribute('title', `${dateStr}: ${recorded}/${total} recorded`);
        dot.style.cssText =
          `width: 18px; height: 18px; border-radius: 3px; background: ${color}; margin: 0 auto; opacity: 0.85;`;
        td.appendChild(dot);
        tr.appendChild(td);
      });

      const goalsTd = document.createElement('td');
      goalsTd.style.cssText = 'padding: 4px 8px; text-align: right; font-size: 11px; opacity: 0.6;';
      goalsTd.textContent = `${goals.length} goal${goals.length !== 1 ? 's' : ''}`;
      tr.appendChild(goalsTd);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    overflowDiv.appendChild(table);
    wrapper.appendChild(overflowDiv);

    const legend = document.createElement('div');
    legend.style.cssText = 'display: flex; gap: 12px; margin-top: 8px; font-size: 11px; opacity: 0.65;';

    [
      { color: '#22c55e', label: 'All recorded' },
      { color: '#eab308', label: 'Partial' },
      { color: '#ef4444', label: 'None' }
    ].forEach(({ color, label }) => {
      const item = document.createElement('span');
      const swatch = document.createElement('span');
      swatch.style.cssText =
        `display: inline-block; width: 10px; height: 10px; background: ${color}; border-radius: 2px; margin-right: 3px; vertical-align: middle;`;
      swatch.setAttribute('aria-hidden', 'true');
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(label));
      legend.appendChild(item);
    });

    wrapper.appendChild(legend);
    container.appendChild(wrapper);
  }

  /**
   * Render (or update) the attendance summary report in #stAttendanceReport.
   * Shows per-student attendance rate for the current month with color coding:
   *   green ≥ 90%, amber 75-89%, red < 75%
   */
  function renderAttendanceReport() {
    const container = document.getElementById('stAttendanceReport');
    if (!container) return;

    if (allAttendanceLogs.length === 0) {
      container.style.display = 'none';
      return;
    }

    // Determine school days in the current month (Mon–Fri up to today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const schoolDays = [];
    const iterDate = new Date(monthStart);
    while (iterDate <= today) {
      const dow = iterDate.getDay();
      if (dow >= 1 && dow <= 5) {
        schoolDays.push(iterDate.toISOString().slice(0, 10));
      }
      iterDate.setDate(iterDate.getDate() + 1);
    }
    const totalSchoolDays = schoolDays.length;

    // Filter attendance for current month
    const monthStartStr = monthStart.toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);
    const monthLogs = allAttendanceLogs.filter(
      e => e.date >= monthStartStr && e.date <= todayStr && e.status === 'present'
    );

    if (monthLogs.length === 0) {
      container.style.display = 'none';
      return;
    }

    // Aggregate per student
    const byStudent = new Map();
    for (const entry of monthLogs) {
      const set = byStudent.get(entry.student_code) || new Set();
      set.add(entry.date);
      byStudent.set(entry.student_code, set);
    }

    container.replaceChildren();
    container.style.display = 'block';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;';
    const title = document.createElement('h3');
    title.textContent = '📅 Attendance — This Month';
    header.appendChild(title);
    const meta = document.createElement('span');
    meta.style.cssText = 'font-size: 11px; opacity: 0.55;';
    meta.textContent = `${totalSchoolDays} school day${totalSchoolDays !== 1 ? 's' : ''}`;
    header.appendChild(meta);
    container.appendChild(header);

    // Sort by attendance rate ascending (worst first)
    const entries = Array.from(byStudent.entries()).map(([code, datesSet]) => ({
      code,
      days: datesSet.size,
      rate: totalSchoolDays > 0 ? Math.round((datesSet.size / totalSchoolDays) * 100) : 0,
    })).sort((a, b) => a.rate - b.rate);

    for (const entry of entries) {
      const barClass = entry.rate >= 90 ? 'st-att-bar--green' : entry.rate >= 75 ? 'st-att-bar--amber' : 'st-att-bar--red';

      const row = document.createElement('div');
      row.className = 'st-att-row';

      const codeEl = document.createElement('span');
      codeEl.className = 'st-att-code';
      codeEl.textContent = entry.code;
      row.appendChild(codeEl);

      const barWrap = document.createElement('div');
      barWrap.className = 'st-att-bar-wrap';
      barWrap.setAttribute('title', `${entry.days} / ${totalSchoolDays} days present`);
      const bar = document.createElement('div');
      bar.className = `st-att-bar ${barClass}`;
      bar.style.width = `${entry.rate}%`;
      barWrap.appendChild(bar);
      row.appendChild(barWrap);

      const pctEl = document.createElement('span');
      pctEl.className = 'st-att-pct';
      pctEl.textContent = `${entry.rate}%`;
      row.appendChild(pctEl);

      container.appendChild(row);
    }
  }


  function renderQuarterBar() {
    const displayEl = document.getElementById('stQuarterDisplay');
    if (!displayEl) return;

    const dates = getQuarterDates();
    const current = getCurrentQuarter();

    // Add "All" button first
    let html = `
      <div class="st-quarter-item ${selectedQuarter === null ? 'selected' : ''}" data-quarter="all" style="cursor: pointer;">
        All
      </div>
    `;

    // Then add quarter items
    html += Object.entries(dates).map(([quarter, range]) => {
      const isCurrent = quarter === current;
      const isSelected = selectedQuarter === quarter;
      return `
        <div class="st-quarter-item ${isCurrent ? 'current' : ''} ${isSelected ? 'selected' : ''}" data-quarter="${quarter}" style="cursor: pointer;">
          ${quarter}: ${range.start}–${range.end}
        </div>
      `;
    }).join('');

    displayEl.innerHTML = html;
  }

  function renderQuarterEditForm() {
    const formEl = document.getElementById('stQuarterEditForm');
    if (!formEl) return;

    const dates = getQuarterDates();

    const html = Object.entries(dates).map(([quarter, range]) => `
      <div class="st-quarter-edit-row">
        <label>${quarter}:</label>
        <input type="text" name="${quarter}-start" value="${range.start}" placeholder="Mon DD" />
        <span>to</span>
        <input type="text" name="${quarter}-end" value="${range.end}" placeholder="Mon DD" />
      </div>
    `).join('') + `
      <div class="st-quarter-edit-row">
        <button type="button" class="st-btn st-btn-small" id="stCancelQuarterEdit">Cancel</button>
        <button type="button" class="st-btn st-btn-primary st-btn-small" id="stSaveQuarters">Save</button>
      </div>
    `;

    formEl.innerHTML = html;
  }

  function exportCaseload() {
    const rows = [['Code', 'Classes', 'Goals', 'IEP Due', 'Eval Due']];
    for (const student of filteredStudents) {
      const enrollments = allEnrollments.filter(e => e.student_code === student.code);
      const goals = allGoals.filter(g => g.student_code === student.code);
      const classes = enrollments.map(e => e.class_name).join('; ');
      rows.push([
        student.code,
        classes,
        goals.length,
        student.iep_due || '',
        student.eval_due || ''
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caseload_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Progress tracking functions
  // goalsList and studentsList are passed in when available so the join-less
  // fallback path can enrich rows with goal_code/student_code from local data.
  async function loadProgressEntries(goalsList = [], studentsList = []) {
    try {
      const supabase = await getSupabase();
      if (supabase) {
        // Primary query: use inner joins to get goal_code and student_code directly.
        const { data, error } = await supabase
          .from('goal_progress')
          .select('*, goals!inner(code), students!inner(code)');
        if (!error) {
          return (data || []).map(row => ({
            ...row,
            student_code: row.students?.code || '',
            goal_code: row.goals?.code || '',
          }));
        }
        // Join failed (e.g. a PostgREST relationship error). Try a flat select and enrich locally.
        console.warn('[tc-students] goal_progress join query failed, trying fallback:', error);
        const { data: flatData, error: flatError } = await supabase
          .from('goal_progress')
          .select('*');
        if (!flatError && flatData) {
          // Build fast lookup maps from the arrays passed in by loadData.
          const goalById = new Map(goalsList.map(g => [g.id, g]));
          const studentById = new Map(studentsList.map(s => [s.id, s]));
          return flatData.map(row => ({
            ...row,
            goal_code: goalById.get(row.goal_id)?.code || '',
            student_code: studentById.get(row.student_id)?.code || '',
          }));
        }
        if (flatError) throw flatError;
      }
    } catch (e) {
      console.warn('[tc-students] Could not load from goal_progress table, falling back to localStorage:', e);
    }
    
    // Fall back to localStorage
    try {
      const stored = localStorage.getItem('rc_goal_progress_v1');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('[tc-students] Error loading progress from localStorage:', e);
      return [];
    }
  }

  function buildProgressLookupMap() {
    progressLookupMap.clear();
    for (const entry of allProgressEntries) {
      const key = `${entry.student_code}:${entry.goal_code}`;
      if (!progressLookupMap.has(key)) {
        progressLookupMap.set(key, []);
      }
      progressLookupMap.get(key).push(entry);
    }
  }

  function getProgressForGoal(studentCode, goalCode) {
    const key = `${studentCode}:${goalCode}`;
    return progressLookupMap.get(key) || [];
  }

  function getProgressThisQuarter(studentCode, goalCode) {
    const range = getQuarterDateRange(getCurrentQuarter());
    if (!range) return [];

    return getProgressForGoal(studentCode, goalCode).filter(p => {
      const d = new Date(p.date);
      return d >= range.start && d <= range.end;
    });
  }

  function getLastProgressDate(studentCode, goalCode) {
    const entries = getProgressForGoal(studentCode, goalCode);
    if (entries.length === 0) return null;
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    return entries[0].date;
  }

  function getGoalDataStatus(studentCode, goalCode, expectedMin) {
    // If expectedMin not provided, look it up from the goal
    if (expectedMin === undefined) {
      const goal = allGoals.find(g => g.student_code === studentCode && g.code === goalCode);
      expectedMin = (goal && goal.expected_data_points) || 3;
    }
    
    const thisQuarter = getProgressThisQuarter(studentCode, goalCode);
    const count = thisQuarter.length;
    
    // Calculate how far through the quarter we are
    const range = getQuarterDateRange(getCurrentQuarter());
    if (!range) return { status: 'ok', count, expected: expectedMin };
    
    const start = range.start;
    const end = range.end;
    const now = new Date();
    const totalDays = (end - start) / (1000 * 60 * 60 * 24);
    const daysPassed = (now - start) / (1000 * 60 * 60 * 24);
    const progress = Math.min(daysPassed / totalDays, 1);
    
    // Expected data points so far based on quarter progress
    const expectedSoFar = Math.ceil(expectedMin * progress);
    
    if (count >= expectedSoFar) return { status: 'ok', count, expected: expectedMin };
    if (count > 0) return { status: 'warning', count, expected: expectedMin };
    return { status: 'behind', count, expected: expectedMin };
  }

  function getStudentDataStatus(studentCode) {
    const studentGoals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
    if (studentGoals.length === 0) return '—';
    
    let allOk = true;
    let anyBehind = false;
    
    for (const goal of studentGoals) {
      const status = getGoalDataStatus(studentCode, goal.code);
      if (status.status === 'behind') anyBehind = true;
      if (status.status !== 'ok') allOk = false;
    }
    
    if (allOk) return SVG_STATUS_OK;
    if (anyBehind) return SVG_STATUS_BAD;
    return SVG_STATUS_WARN;
  }

  /**
   * Compute the staleness tier for a single goal using the last progress date.
   * Returns { tier, label, cssClass, icon, sortOrder } from staleness-utils.
   */
  function getGoalStalenessInfo(studentCode, goalCode) {
    const lastDate = getLastProgressDate(studentCode, goalCode);
    if (!lastDate) return getGoalStaleness(null);
    const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / MS_PER_DAY);
    return getGoalStaleness(daysSince);
  }

  /**
   * Compute the worst staleness tier across all active goals for a student.
   * Returns { tier, label, cssClass, icon, sortOrder } from staleness-utils.
   */
  function getStudentStalenessInfo(studentCode) {
    const goals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
    if (goals.length === 0) return getGoalStaleness(null);
    const perGoal = goals.map(g => getGoalStalenessInfo(studentCode, g.code));
    return getStudentHealthDot(perGoal);
  }

  /**
   * Get the most recent progress date across all active goals for a student
   * (used for the relative-time "Data" column).
   * Returns number of days since the most recent entry, or null if no data ever.
   */
  function getStudentDaysSinceLastData(studentCode) {
    const goals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
    let minDays = null;
    for (const g of goals) {
      const lastDate = getLastProgressDate(studentCode, g.code);
      if (lastDate) {
        const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / MS_PER_DAY);
        if (minDays === null || days < minDays) minDays = days;
      }
    }
    return minDays;
  }

  /**
   * Get the most recent attendance date for a student from allAttendanceLogs.
   * Returns a Date object or null if no attendance data is available.
   */
  function getStudentLastAttendanceDate(studentCode) {
    const entries = allAttendanceLogs.filter(e => e.student_code === studentCode);
    if (entries.length === 0) return null;
    const sorted = entries.slice().sort((a, b) => b.date.localeCompare(a.date));
    return new Date(sorted[0].date + 'T00:00:00');
  }

  /**
   * Format a "Last seen" label from a Date or null.
   * Returns strings like "Today", "Yesterday", "3 days ago", or "No attendance data".
   */
  function formatLastSeen(lastDate) {
    if (!lastDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(lastDate);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - d) / MS_PER_DAY);
    if (diffDays < 0) return 'Today'; // future dates treated as today
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  }
  const ALERT_TREND_WINDOW = 30; // analyze data from last 30 days
  const ALERT_STALLED_BAND = 5;  // last 3+ points within ≤5% range = stalled

  /**
   * Compute mastery and regression/stalled alert status for a single goal.
   * Only applies to non-Observation numeric goals.
   *
   * @param {Object} goal - Goal object with code, student_code, measurement_type, baseline, mastery, target
   * @returns {{
   *   isMastered: boolean,
   *   isApproachingMastery: boolean,
   *   isRegressing: boolean,
   *   isStalled: boolean,
   *   avgValue: number|null,
   *   masteryNum: number|null,
   *   baselineNum: number|null,
   *   currentNum: number|null,
   *   last3: number[],
   *   consecutiveAboveMastery: number
   * }}
   */
  function computeGoalAlertStatus(goal) {
    const noop = { isMastered: false, isApproachingMastery: false, isRegressing: false, isBelowBaseline: false, isStalled: false,
      avgValue: null, masteryNum: null, baselineNum: null, currentNum: null, last3: [], consecutiveAboveMastery: 0 };

    if (goal.measurement_type === 'Observation') return noop;

    const masteryNum = parseGoalValue(goal.mastery) ?? parseGoalValue(goal.target);
    const baselineNum = parseGoalValue(goal.baseline);
    if (masteryNum == null || baselineNum == null) return noop;

    const trendCutoff = new Date();
    trendCutoff.setDate(trendCutoff.getDate() - ALERT_TREND_WINDOW);
    const trendCutoffStr = trendCutoff.toISOString().slice(0, 10);

    const allEntries = getProgressForGoal(goal.student_code, goal.code);
    const recentEntries = allEntries
      .filter(p => p.date && p.date >= trendCutoffStr)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const values = recentEntries
      .map(p => (p.value != null ? parseFloat(p.value) : null))
      .filter(v => v != null && !isNaN(v));

    if (values.length === 0) return { ...noop, masteryNum, baselineNum, isBelowBaseline: false };

    const currentNum = values[0];
    const avgValue = values.reduce((s, v) => s + v, 0) / values.length;

    // Mastery detection: count consecutive recent points at or above mastery
    let consecutiveAboveMastery = 0;
    if (masteryNum > baselineNum) {
      for (const v of values) {
        if (v >= masteryNum) consecutiveAboveMastery++;
        else break;
      }
    }
    const isMastered = consecutiveAboveMastery >= 3 && avgValue >= masteryNum;

    // Approaching mastery: avg within 10% of mastery-baseline range (but not yet mastered)
    const range = masteryNum - baselineNum;
    const nearThreshold = masteryNum - Math.abs(range) * 0.1;
    const isApproachingMastery = !isMastered && masteryNum > baselineNum
      && avgValue >= nearThreshold && avgValue < masteryNum;

    // Regression / stalled detection
    const last3 = values.slice(0, 3);
    let isRegressing = false;
    let isBelowBaseline = false;
    let isStalled = false;

    if (currentNum < baselineNum) {
      isRegressing = true;
      isBelowBaseline = true;
    } else if (last3.length >= 2) {
      // In a newest-first array, declining performance means each older entry (higher index)
      // has a greater value than the newer entry before it.
      // e.g. [50, 55, 60] = newest 50, oldest 60 → performance was higher before = declining
      const allDecline = last3.every((v, i) => i === 0 || v > last3[i - 1]);
      if (allDecline) isRegressing = true;
    }

    if (!isRegressing) {
      if (last3.length >= 3) {
        const rangeSpan = Math.max(...last3) - Math.min(...last3);
        if (rangeSpan <= ALERT_STALLED_BAND) isStalled = true;
      } else if (currentNum <= baselineNum + ALERT_STALLED_BAND) {
        isStalled = true;
      }
    }

    return { isMastered, isApproachingMastery, isRegressing, isBelowBaseline, isStalled,
      avgValue, masteryNum, baselineNum, currentNum, last3, consecutiveAboveMastery };
  }

  /**
   * Render a mini 60×20 SVG sparkline from an array of numeric values.
   * Returns an inline SVG string, or empty string if fewer than 2 data points.
   * Line colour: green (#22c55e) if last value ≥ second-to-last (up/flat), red (#ef4444) if down.
   * @param {number[]} values - Chronological array of averaged progress values (oldest → newest).
   * @returns {string} SVG markup or ''
   */
  function renderMiniSparkline(values) {
    if (!values || values.length < 2) return '';

    const W = 60, H = 20, PAD = 2;
    const last = values[values.length - 1];
    const prev = values[values.length - 2];
    const color = last >= prev ? '#22c55e' : '#ef4444';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  /**
   * Aggregate progress values for a student across all active, non-prompt_count goals.
   * Groups entries by date, averages all goals' values per date, then returns the last
   * up to 8 chronological values (oldest → newest).
   * @param {string} studentCode
   * @returns {number[]}
   */
  function getStudentSparklineValues(studentCode) {
    const goals = allGoals.filter(g =>
      g.student_code === studentCode &&
      g.status !== 'archived' &&
      !(g.measurement_type === 'Observation' && g.observation_config?.category === 'prompt_count')
    );
    if (goals.length === 0) return [];

    // Collect all progress entries for these goals
    const byDate = new Map();
    for (const goal of goals) {
      const entries = getProgressForGoal(studentCode, goal.code);
      for (const entry of entries) {
        if (!entry.date) continue;
        const v = entry.value != null ? parseFloat(entry.value) : null;
        if (v == null || isNaN(v)) continue;
        if (!byDate.has(entry.date)) byDate.set(entry.date, []);
        byDate.get(entry.date).push(v);
      }
    }

    if (byDate.size === 0) return [];

    // Sort dates oldest → newest, compute average per date, take last 5–8
    const sorted = Array.from(byDate.keys()).sort();
    const slice = sorted.slice(-8);
    return slice.map(date => {
      const vals = byDate.get(date);
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    });
  }

  /**
   * Compute alert badge counts for a student's active goals.
   * @param {string} studentCode
   * @returns {{ regressingCount: number, masteredCount: number, stalledCount: number }}
   */
  function getStudentAlertCounts(studentCode) {
    const goals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
    let regressingCount = 0;
    let masteredCount = 0;
    let stalledCount = 0;
    for (const goal of goals) {
      const s = computeGoalAlertStatus(goal);
      if (s.isMastered) masteredCount++;
      if (s.isRegressing) regressingCount++;
      else if (s.isStalled) stalledCount++;
    }
    return { regressingCount, masteredCount, stalledCount };
  }

  /**
   * Returns true if a student has any regressing/stalled goals or stale/critical data.
   * Used for the "Needs Attention" filter.
   * @param {string} studentCode
   */
  function studentNeedsAttention(studentCode) {
    const { regressingCount, stalledCount } = getStudentAlertCounts(studentCode);
    if (regressingCount > 0 || stalledCount > 0) return true;
    const health = getStudentStalenessInfo(studentCode);
    return health.tier === 'stale' || health.tier === 'critical';
  }

  /**
   * Compute an urgency score for a student.
   * Higher score = more critical. Used for default sort order.
   */
  function computeUrgencyScore(studentCode) {
    let score = 0;
    const goals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
    for (const goal of goals) {
      const s = computeGoalAlertStatus(goal);
      if (s.isRegressing) score += URGENCY_SCORE_REGRESSING;
      else if (s.isStalled) score += URGENCY_SCORE_STALLED;
      if (s.isMastered) score += URGENCY_SCORE_MASTERED;
    }
    const health = getStudentStalenessInfo(studentCode);
    if (health.tier === 'critical' || health.tier === 'stale') score += URGENCY_SCORE_STALE_GOAL;
    return score;
  }

  // ── Daily Review helpers ────────────────────────────────────────────────────

  /** Returns student codes of students needing attention, in filteredStudents order. */
  function getDailyReviewStudentCodes() {
    return filteredStudents
      .filter(s => studentNeedsAttention(s.code))
      .map(s => s.code);
  }

  /** Scroll the student row into view. */
  function scrollToStudent(code) {
    const row = document.querySelector(`tr[data-code="${CSS.escape(code)}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** Persist current daily review state to sessionStorage so refreshes resume. */
  function saveDailyReviewProgress() {
    try {
      sessionStorage.setItem('rc_daily_review', JSON.stringify({
        students: dailyReviewStudents,
        index: dailyReviewIndex,
      }));
    } catch (_) { /* ignore */ }
  }

  /** Build the inner HTML for the Daily Review floating bar. */
  function renderDailyReviewBarHTML() {
    const total = dailyReviewStudents.length;
    const current = dailyReviewIndex + 1;
    const isLast = dailyReviewIndex === total - 1;
    const studentCode = dailyReviewStudents[dailyReviewIndex] || '';

    const svgArrowLeft  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;
    const svgArrowRight = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
    const svgCheckCircle = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    const svgXCircle    = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

    return `
      <button id="drPrevBtn" class="rc-btn" ${dailyReviewIndex === 0 ? 'disabled' : ''} title="Previous student" aria-label="Previous student" style="display:flex;align-items:center;gap:6px;padding:7px 14px;">
        ${svgArrowLeft} Prev
      </button>
      <div style="text-align:center;flex:1;font-size:13px;color:var(--rc-ink-dim);min-width:120px;">
        <div style="font-weight:600;color:var(--rc-ink);font-size:14px;">${escapeHtml(studentCode)}</div>
        <div>Student ${current} of ${total}</div>
      </div>
      ${isLast ? `
        <button id="drNextBtn" class="rc-btn" style="display:flex;align-items:center;gap:6px;padding:7px 14px;color:var(--rc-success);border-color:var(--rc-success);" title="Review complete" aria-label="Review complete">
          ${svgCheckCircle} Done
        </button>
      ` : `
        <button id="drNextBtn" class="rc-btn" style="display:flex;align-items:center;gap:6px;padding:7px 14px;" title="Next student" aria-label="Next student">
          Next ${svgArrowRight}
        </button>
      `}
      <button id="drExitBtn" class="rc-btn" style="display:flex;align-items:center;gap:6px;padding:7px 14px;color:var(--rc-danger);border-color:var(--rc-danger);" title="Exit Daily Review" aria-label="Exit Daily Review">
        ${svgXCircle} Exit
      </button>
    `;
  }

  /** Wire up event listeners on the Daily Review bar buttons. */
  function wireDailyReviewBar(bar) {
    bar.querySelector('#drPrevBtn')?.addEventListener('click', () => dailyReviewGoTo(dailyReviewIndex - 1));
    bar.querySelector('#drNextBtn')?.addEventListener('click', () => {
      if (dailyReviewIndex === dailyReviewStudents.length - 1) exitDailyReview();
      else dailyReviewGoTo(dailyReviewIndex + 1);
    });
    bar.querySelector('#drExitBtn')?.addEventListener('click', () => exitDailyReview());
  }

  /** Create and attach the floating Daily Review navigation bar. */
  function renderDailyReviewBar() {
    removeDailyReviewBar();
    const bar = document.createElement('div');
    bar.id = 'stDailyReviewBar';
    bar.className = 'rc-card';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Daily Review navigation');
    bar.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10002;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      min-width: 360px;
    `;
    bar.innerHTML = renderDailyReviewBarHTML();
    document.body.appendChild(bar);
    wireDailyReviewBar(bar);
  }

  /** Update the Daily Review bar content in-place. */
  function updateDailyReviewBar() {
    const bar = document.getElementById('stDailyReviewBar');
    if (!bar) return;
    bar.innerHTML = renderDailyReviewBarHTML();
    wireDailyReviewBar(bar);
  }

  /** Remove the Daily Review bar from the DOM. */
  function removeDailyReviewBar() {
    const bar = document.getElementById('stDailyReviewBar');
    if (bar) bar.remove();
  }

  /** Navigate to a position in the Daily Review sequence. */
  function dailyReviewGoTo(newIndex) {
    if (newIndex < 0 || newIndex >= dailyReviewStudents.length) return;
    expandedStudents.delete(dailyReviewStudents[dailyReviewIndex]);
    dailyReviewIndex = newIndex;
    expandedStudents.add(dailyReviewStudents[dailyReviewIndex]);
    saveDailyReviewProgress();
    renderStudentList().then(() => {
      scrollToStudent(dailyReviewStudents[dailyReviewIndex]);
      updateDailyReviewBar();
    });
  }

  /** Start Daily Review mode. */
  function startDailyReview() {
    dailyReviewStudents = getDailyReviewStudentCodes();
    if (dailyReviewStudents.length === 0) {
      showToast('No students need attention right now.');
      return;
    }
    dailyReviewActive = true;
    dailyReviewIndex = 0;

    // Attempt to resume from sessionStorage
    try {
      const saved = sessionStorage.getItem('rc_daily_review');
      if (saved) {
        const { students, index } = JSON.parse(saved);
        if (JSON.stringify(students) === JSON.stringify(dailyReviewStudents)) {
          dailyReviewIndex = Math.min(index, dailyReviewStudents.length - 1);
        }
      }
    } catch (_) { /* ignore */ }

    // Expand only the current review student
    expandedStudents.clear();
    expandedStudents.add(dailyReviewStudents[dailyReviewIndex]);
    saveDailyReviewProgress();

    const btn = document.getElementById('stDailyReview');
    if (btn) btn.classList.add('active');

    renderStudentList().then(() => {
      scrollToStudent(dailyReviewStudents[dailyReviewIndex]);
      renderDailyReviewBar();
    });
  }

  /** Exit Daily Review mode. */
  function exitDailyReview() {
    dailyReviewActive = false;
    dailyReviewStudents = [];
    dailyReviewIndex = 0;
    sessionStorage.removeItem('rc_daily_review');
    removeDailyReviewBar();
    const btn = document.getElementById('stDailyReview');
    if (btn) btn.classList.remove('active');
    filterStudents();
    renderStudentList();
  }

  // ── Auto-Refresh ────────────────────────────────────────────────────────────

  /** Show a brief "Data refreshed" toast. */
  function showRefreshToast() {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      background: var(--rc-glass, rgba(15,23,42,0.92));
      border: 1px solid var(--rc-glass-border, rgba(255,255,255,0.08));
      border-radius: var(--rc-radius, 12px);
      padding: 8px 14px;
      z-index: 9999;
      font-size: 13px;
      color: var(--rc-ink-dim);
      display: flex;
      align-items: center;
      gap: 8px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      opacity: 0;
      transition: opacity 0.3s;
    `;
    const svgNS = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(svgNS, 'svg');
    icon.setAttribute('width', '14');
    icon.setAttribute('height', '14');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'var(--rc-success, #22c55e)');
    icon.setAttribute('stroke-width', '1.5');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
    toast.appendChild(icon);
    toast.appendChild(document.createTextNode('Data refreshed'));
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 2000);
  }

  /** Set up the 5-minute auto-refresh timer. */
  function setupAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(async () => {
      // Skip refresh under any of these conditions
      if (document.hidden) return;
      if (quickEntryOpen) return;
      if (focusModeActive) return;
      if (!navigator.onLine) return;

      // Animate the refresh icon
      const icon = document.getElementById('stRefreshIcon');
      if (icon) icon.classList.add('st-spin');

      // Preserve expanded/collapsed state across the refresh
      const wasExpanded = new Set(expandedStudents);
      await loadData().catch(() => { /* non-fatal */ });
      for (const code of wasExpanded) {
        if (allStudents.some(s => s.code === code)) expandedStudents.add(code);
      }
      await renderStudentList();

      if (icon) icon.classList.remove('st-spin');
      showRefreshToast();
    }, AUTO_REFRESH_MS);

    // Clean up on page unload
    window.addEventListener('beforeunload', () => clearInterval(autoRefreshTimer), { once: true });
  }

  // ── Digest Summary ──────────────────────────────────────────────────────────

  /**
   * Render the mini digest summary card above the student list.
   * Shows counts: regressing, stalled, stale, mastered, deadlines.
   * Each badge is clickable to filter the student list.
   */
  function renderDigestSummary() {
    const container = document.getElementById('stDigestSummary');
    if (!container) return;

    const activeStudents = allStudents.filter(s => s.status !== 'archived' && s.active !== false);
    let regressingCount = 0;
    let stalledCount = 0;
    let staleCount = 0;
    let masteredCount = 0;
    let deadlineCount = 0;

    const today = new Date();
    const deadlineThreshold = new Date(today);
    deadlineThreshold.setDate(today.getDate() + 30);

    for (const student of activeStudents) {
      const alerts = getStudentAlertCounts(student.code);
      regressingCount += alerts.regressingCount;
      stalledCount    += alerts.stalledCount;
      masteredCount   += alerts.masteredCount;

      const health = getStudentStalenessInfo(student.code);
      if (health.tier === 'stale' || health.tier === 'critical') staleCount++;

      // IEP/Eval deadlines within 30 days
      if (student.iep_due) {
        const d = new Date(student.iep_due);
        if (d >= today && d <= deadlineThreshold) deadlineCount++;
      }
      if (student.eval_due) {
        const d = new Date(student.eval_due);
        if (d >= today && d <= deadlineThreshold) deadlineCount++;
      }
    }

    // SVG icons
    const svgDown    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`;
    const svgPause   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    const svgClock   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const svgTrophy  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 21 12 21 16 21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M5 4H3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2 5 5 0 0 0 5 5 5 5 0 0 0 5-5 2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M5 4h14"/></svg>`;
    const svgCalendar = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

    const badges = [
      { icon: svgDown,     count: regressingCount, label: 'regressing', color: 'var(--rc-danger)',  filter: 'regressing' },
      { icon: svgPause,    count: stalledCount,    label: 'stalled',    color: 'var(--rc-warning)', filter: 'stalled' },
      { icon: svgClock,    count: staleCount,      label: 'stale',      color: 'var(--rc-warning)', filter: 'stale' },
      { icon: svgTrophy,   count: masteredCount,   label: 'mastered',   color: 'var(--rc-success)', filter: 'mastered' },
      { icon: svgCalendar, count: deadlineCount,   label: 'deadlines',  color: '#a855f7',            filter: 'deadlines' },
    ];

    // Clear and rebuild
    while (container.firstChild) container.removeChild(container.firstChild);

    const card = document.createElement('div');
    card.className = 'rc-card';
    card.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 18px;margin:10px 20px;';
    card.setAttribute('aria-label', 'Daily situation summary');

    const title = document.createElement('span');
    title.style.cssText = 'font-size:12px;opacity:0.55;margin-right:4px;white-space:nowrap;';
    title.textContent = 'Today:';
    card.appendChild(title);

    for (const { icon, count, label, color, filter } of badges) {
      const badge = document.createElement('button');
      badge.className = 'rc-btn';
      badge.dataset.digestFilter = filter;
      badge.title = `Filter to ${label} students`;
      badge.style.cssText = `
        display:inline-flex;align-items:center;gap:5px;
        padding:4px 10px;font-size:13px;
        color:${count > 0 ? color : 'var(--rc-muted)'};
        border-color:${count > 0 ? color : 'transparent'};
        background:${count > 0 ? `color-mix(in srgb, ${color} 10%, transparent)` : 'transparent'};
        cursor:${count > 0 ? 'pointer' : 'default'};
        opacity:${count > 0 ? '1' : '0.45'};
      `;
      badge.innerHTML = `${icon}<span style="font-weight:600">${count}</span><span style="opacity:0.8">${label}</span>`;
      if (count > 0) {
        badge.addEventListener('click', () => applyDigestFilter(filter));
      }
      card.appendChild(badge);
    }

    container.appendChild(card);
  }

  /**
   * Apply a digest filter — sets the needs-attention or sort controls to highlight
   * students matching the selected digest category.
   */
  function applyDigestFilter(filter) {
    // Map digest filter types to a needsAttentionFilter + sort combination
    if (filter === 'regressing' || filter === 'stalled' || filter === 'stale') {
      needsAttentionFilter = true;
      const btn = document.getElementById('stFilterAttention');
      if (btn) btn.classList.add('active');
    } else if (filter === 'mastered') {
      needsAttentionFilter = true;
      const btn = document.getElementById('stFilterAttention');
      if (btn) btn.classList.add('active');
    } else if (filter === 'deadlines') {
      sortBy = 'iep_due';
      const sel = document.getElementById('stSortSelect');
      if (sel) sel.value = 'iep_due';
    }
    filterStudents();
    renderStudentList();
    renderStudentKpiSummary();
  }

  /**
   * Toggle Focus Mode: dims non-attention rows to 30% opacity so needs-attention
   * students stand out clearly.
   */
  function toggleFocusMode() {
    focusModeActive = !focusModeActive;
    const table = document.querySelector('.st-table');
    if (table) table.classList.toggle('st-focus-active', focusModeActive);
    const btn = document.getElementById('stFocusToggle');
    if (btn) btn.classList.toggle('active', focusModeActive);
  }

  // ── Keyboard Shortcuts Help ──────────────────────────────────────────────

  /**
   * Toggle the keyboard shortcuts help popover (#stShortcutsHelp).
   * Creates the panel on first call; subsequent calls show/hide it.
   */
  function toggleShortcutsHelp() {
    let panel = document.getElementById('stShortcutsHelp');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stShortcutsHelp';
      panel.className = 'st-shortcuts-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Keyboard shortcuts');
      const shortcuts = [
        { key: 'F',   desc: 'Toggle focus mode' },
        { key: 'P',   desc: 'Pin/unpin hovered student' },
        { key: 'S',   desc: 'Focus search input' },
        { key: '/',   desc: 'Focus search input' },
        { key: 'Esc', desc: 'Close panel / blur search' },
        { key: '?',   desc: 'Show/hide this help' },
      ];
      const rows = shortcuts.map(s =>
        `<div class="st-shortcut-row">` +
          `<kbd class="st-shortcut-key">${escapeHtml(s.key)}</kbd>` +
          `<span>${escapeHtml(s.desc)}</span>` +
        `</div>`
      ).join('');
      panel.innerHTML =
        `<div class="st-shortcuts-title">⌨️ Keyboard Shortcuts</div>` +
        rows;
      document.body.appendChild(panel);

      // Close when clicking outside the panel
      document.addEventListener('click', (e) => {
        if (
          panel.classList.contains('st-shortcuts-visible') &&
          !panel.contains(e.target) &&
          e.target.id !== 'stShortcutsBtn'
        ) {
          panel.classList.remove('st-shortcuts-visible');
        }
      }, true);
    }
    panel.classList.toggle('st-shortcuts-visible');
  }

  // ── Goals Hover Tooltip ──────────────────────────────────────────────────

  /** Maximum number of goals shown in the hover tooltip. */
  const MAX_TOOLTIP_GOALS = 8;
  /** Minimum % change to show an up/down trend arrow (vs flat →). */
  const TOOLTIP_TREND_THRESHOLD = 2;
  /** Minimum px margin between the tooltip and the viewport edges. */
  const TOOLTIP_VIEWPORT_MARGIN = 8;

  /**
   * Build the inner HTML for the goals hover tooltip for a student.
   * Renders up to MAX_TOOLTIP_GOALS active goals, each showing:
   *   goal code · area badge · staleness icon + latest value · trend arrow · baseline→mastery range
   * @param {string} studentCode
   * @returns {string} HTML string
   */
  function buildGoalsTooltip(studentCode) {
    const goals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
    if (goals.length === 0) {
      return '<div style="opacity:0.65;font-size:12px;text-align:center;">No active goals</div>';
    }

    const shown = goals.slice(0, MAX_TOOLTIP_GOALS);
    const overflow = goals.length - MAX_TOOLTIP_GOALS;

    const rows = shown.map(goal => {
      // Latest value (entries are not guaranteed sorted — sort by date)
      const entries = getProgressForGoal(studentCode, goal.code)
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;
      const latestRaw = latestEntry != null ? parseFloat(latestEntry.value) : null;
      const valDisplay = latestRaw != null && !isNaN(latestRaw)
        ? `${latestRaw.toFixed(0)}%`
        : '—';

      // Staleness icon via getGoalStalenessInfo
      const stalenessInfo = getGoalStalenessInfo(studentCode, goal.code);

      // Trend arrow based on last 3 sorted entries
      let trendSymbol = '→';
      let trendClass = 'st-tooltip-goal-trend--flat';
      if (entries.length >= 2) {
        const recent = entries.slice(-3);
        const oldVal = parseFloat(recent[0].value);
        const newVal = parseFloat(recent[recent.length - 1].value);
        if (!isNaN(oldVal) && !isNaN(newVal)) {
          if (newVal > oldVal + TOOLTIP_TREND_THRESHOLD)      { trendSymbol = '↗'; trendClass = 'st-tooltip-goal-trend--up'; }
          else if (newVal < oldVal - TOOLTIP_TREND_THRESHOLD) { trendSymbol = '↘'; trendClass = 'st-tooltip-goal-trend--down'; }
        }
      }

      // Baseline → mastery range
      const baseline = goal.baseline != null ? `${goal.baseline}%` : '?';
      const mastery = goal.mastery != null
        ? `${goal.mastery}%`
        : (goal.target != null ? `${goal.target}%` : '?');

      return `<div class="st-tooltip-goal">` +
        `<span class="st-tooltip-goal-code">${escapeHtml(goal.code)}</span>` +
        `<span class="st-tooltip-goal-area">${escapeHtml(goal.goal_area || 'General')}</span>` +
        `<span class="st-tooltip-goal-value">${stalenessInfo.icon} ${escapeHtml(valDisplay)}</span>` +
        `<span class="st-tooltip-goal-trend ${trendClass}">${trendSymbol}</span>` +
        `<span class="st-tooltip-goal-range">${escapeHtml(baseline)}→${escapeHtml(mastery)}</span>` +
        `</div>`;
    }).join('');

    const overflowHtml = overflow > 0
      ? `<div class="st-tooltip-overflow">+${overflow} more goal${overflow > 1 ? 's' : ''}</div>`
      : '';

    return rows + overflowHtml;
  }

  /** Singleton tooltip element — created once and reused. */
  let _goalsTooltipEl = null;
  /** Timer handle for the 200 ms show delay. */
  let _goalsTooltipTimer = null;

  /** Create (once) and return the singleton tooltip DOM element. */
  function getGoalsTooltipEl() {
    if (!_goalsTooltipEl) {
      _goalsTooltipEl = document.createElement('div');
      _goalsTooltipEl.id = 'stGoalsTooltip';
      _goalsTooltipEl.className = 'st-goals-tooltip';
      _goalsTooltipEl.setAttribute('role', 'tooltip');
      _goalsTooltipEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(_goalsTooltipEl);
    }
    return _goalsTooltipEl;
  }

  /**
   * Position and show the goals tooltip above the given wrapper element.
   * @param {HTMLElement} wrapper - The .st-goals-tooltip-wrapper element
   */
  function showGoalsTooltip(wrapper) {
    const studentCode = wrapper.dataset.student;
    if (!studentCode) return;

    const tooltip = getGoalsTooltipEl();
    tooltip.innerHTML = buildGoalsTooltip(studentCode);

    // Temporarily make visible off-screen to measure dimensions
    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';
    tooltip.classList.add('st-goals-tooltip--visible');

    const tRect = tooltip.getBoundingClientRect();
    const wRect = wrapper.getBoundingClientRect();

    // Center tooltip above the wrapper, then clamp to viewport
    const idealLeft = wRect.left + wRect.width / 2 - tRect.width / 2;
    const clampedLeft = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(idealLeft, window.innerWidth - tRect.width - TOOLTIP_VIEWPORT_MARGIN));
    const top = wRect.top - tRect.height - 10;

    tooltip.style.left = `${clampedLeft}px`;
    tooltip.style.top = `${Math.max(TOOLTIP_VIEWPORT_MARGIN, top)}px`;

    // Align caret with the center of the wrapper element
    const caretX = wRect.left + wRect.width / 2 - clampedLeft;
    const caretPct = Math.max(10, Math.min(90, (caretX / tRect.width) * 100));
    tooltip.style.setProperty('--st-caret-x', `${caretPct}%`);
  }

  /** Hide the goals tooltip and cancel any pending show timer. */
  function hideGoalsTooltip() {
    clearTimeout(_goalsTooltipTimer);
    _goalsTooltipTimer = null;
    if (_goalsTooltipEl) {
      _goalsTooltipEl.classList.remove('st-goals-tooltip--visible');
    }
  }

  /**
   * Wire up mouseover/mouseout event delegation on the student table body
   * for the goals hover tooltip. Must be called once after the tbody exists.
   * @param {HTMLElement} tableBody
   */
  function setupGoalsTooltipHandlers(tableBody) {
    tableBody.addEventListener('mouseover', (e) => {
      const wrapper = e.target.closest('.st-goals-tooltip-wrapper');
      if (!wrapper) return;
      clearTimeout(_goalsTooltipTimer);
      _goalsTooltipTimer = setTimeout(() => showGoalsTooltip(wrapper), 200);
    });

    tableBody.addEventListener('mouseout', (e) => {
      const wrapper = e.target.closest('.st-goals-tooltip-wrapper');
      if (!wrapper) return;
      // Only hide if the pointer is truly leaving the wrapper
      if (e.relatedTarget && wrapper.contains(e.relatedTarget)) return;
      hideGoalsTooltip();
    });
  }

  /**
   * Shows Q1–Q4 avg (collected/expected) for the current school year.
   */
  function renderQuarterlyAverages(studentCode, goalCode, goalId) {
    const goal = allGoals.find(g => g.student_code === studentCode && g.code === goalCode);
    const expected = (goal && goal.expected_data_points) || 3;
    const measurementType = goal && goal.measurement_type;
    const entries = getProgressForGoal(studentCode, goalCode);
    const currentQ = (() => { try { return getCurrentQuarter(); } catch (e) { console.warn('[renderQuarterlyAverages] getCurrentQuarter failed:', e); return null; } })();
    const sanitizedGoalId = goalId ? goalId.replace(/[^a-z0-9]/gi, '_') : null;

    const spans = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
      const range = getQuarterDateRange(q);
      if (!range) return `<span class="st-qa-badge st-qa-badge--none">${q}: —</span>`;

      const qEntries = entries.filter(p => {
        const d = new Date(p.date);
        return d >= range.start && d <= range.end;
      });

      const count = qEntries.length;
      const countStr = `(${count}/${expected})`;
      const isCurrentQ = q === currentQ;
      const idAttr = isCurrentQ && sanitizedGoalId ? ` id="tc-goal-qa-count-${sanitizedGoalId}"` : '';

      if (count === 0) {
        return `<span class="st-qa-badge st-qa-badge--none"${idAttr}>${q}: — <span class="st-qa-count">${escapeHtml(countStr)}</span></span>`;
      }

      const avg = qEntries.reduce((sum, e) => sum + parseFloat(e.value || 0), 0) / (count || 1);
      const avgStr = formatProgressValue(avg, measurementType);
      const statusClass = count >= expected ? 'st-qa-badge--green' : 'st-qa-badge--yellow';
      return `<span class="st-qa-badge ${statusClass}"${idAttr}>${q}: ${escapeHtml(avgStr)} <span class="st-qa-count">${escapeHtml(countStr)}</span></span>`;
    });

    return `<div class="st-quarterly-averages">${spans.join('')}</div>`;
  }

  // Load data
  async function loadData() {
    try {
      console.log('[tc-students] Loading data...');
      isSyncing = true;
      updateSyncIndicator();

      // Invalidate per-student DESE rollup cache on each data refresh so stale
      // data doesn't persist if a student completes new graded assignments.
      deseRollupCache.clear();

      // Load schedule periods for observation config UI (best-effort, don't block on failure)
      getSchedule().then(s => {
        _cachedSchedulePeriods = (s?.periods || []).filter(p => !p.planning);
      }).catch(() => {
        _cachedSchedulePeriods = [];
      });

      // Load students, goals and enrollments in parallel first so that the
      // fallback path in loadProgressEntries can enrich rows using those arrays.
      const results = await Promise.allSettled([
        db.listStudents(),
        db.listGoalsAll(),
        db.listClassEnrollments(),
      ]);

      let schemaDriftDetected = false;
      
      // Extract successful results
      if (results[0].status === 'fulfilled') {
        allStudents = results[0].value.filter(s => !s.code.startsWith('TEACHER'));
      } else {
        console.error('[tc-students] Failed to load students:', results[0].reason);
        allStudents = [];
        schemaDriftDetected = true;
      }

      if (results[1].status === 'fulfilled') {
        allGoals = results[1].value;
      } else {
        console.error('[tc-students] Failed to load goals:', results[1].reason);
        allGoals = [];
        schemaDriftDetected = true;
      }

      if (results[2].status === 'fulfilled') {
        allEnrollments = normalizeEnrollments(results[2].value);
      } else {
        console.error('[tc-students] Failed to load enrollments:', results[2].reason);
        allEnrollments = [];
        schemaDriftDetected = true;
      }

      // Load progress entries after students/goals are available so the fallback
      // enrichment can map goal_id → goal_code and student_id → student_code.
      try {
        allProgressEntries = await loadProgressEntries(allGoals, allStudents);
        buildProgressLookupMap();
      } catch (e) {
        console.error('[tc-students] Failed to load progress entries:', e);
        allProgressEntries = [];
        progressLookupMap.clear();
      }

      console.log('[tc-students] Loaded:', allStudents.length, 'students,', allGoals.length, 'goals,', allProgressEntries.length, 'progress entries');

      // Load attendance for the last 30 days (best-effort, don't block on failure)
      try {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
        const startDateStr = startDate.toISOString().slice(0, 10);
        const endDateStr = today.toISOString().slice(0, 10);
        if (db.listAttendanceAll) {
          allAttendanceLogs = await db.listAttendanceAll(startDateStr, endDateStr);
        }
      } catch (e) {
        console.warn('[tc-students] Failed to load attendance logs (non-critical):', e.message);
        allAttendanceLogs = [];
      }
      
      // Show schema drift banner if any call failed
      if (schemaDriftDetected) {
        showSchemaDriftBanner();
      } else {
        hideSchemaDriftBanner();
      }
      
      filterStudents();

      // Auto-expand students with alerts on the very first load (if preference is enabled)
      if (!_initialLoadDone && autoExpandAlerts) {
        for (const student of filteredStudents) {
          if (studentNeedsAttention(student.code)) {
            expandedStudents.add(student.code);
          }
        }
      }
      _initialLoadDone = true;

      renderStudentList();
      renderStudentQualityBanner();
      renderStudentKpiSummary();
      renderStudentObsHeatmap();
      renderAttendanceReport();
      renderCollectNudge();
      renderDigestSummary();
      initGlobalQuickEntryBar();

      isSyncing = false;
      updateSyncIndicator();
    } catch (error) {
      console.error('[tc-students] Error loading data:', error);
      isSyncing = false;
      updateSyncIndicator();
      
      // Still try to render with whatever data we have
      filterStudents();
      renderStudentList();
      renderStudentQualityBanner();
      renderStudentKpiSummary();
      renderDigestSummary();
    }
  }

  function updateSyncIndicator() {
    const indicator = document.getElementById('stSyncStatus');
    if (indicator) {
      if (isSyncing) {
        indicator.innerHTML = '<span class="rc-status-dot rc-status-dot--loading"></span>';
        indicator.title = 'Syncing...';
      } else {
        indicator.innerHTML = '<span class="rc-status-dot rc-status-dot--ok"></span>';
        indicator.title = 'Connected';
      }
    }
  }

  function showSchemaDriftBanner() {
    // Remove existing banner if present
    hideSchemaDriftBanner();
    
    // Find the student detail main container (right pane)
    const container = document.querySelector('.st-main');
    if (!container) return;
    
    // Create banner element
    const banner = document.createElement('div');
    banner.id = 'schema-drift-banner';
    banner.style.cssText = 'background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;';
    
    // Create warning icon
    const svgNS = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(svgNS, 'svg');
    icon.setAttribute('width', '16');
    icon.setAttribute('height', '16');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', '#92400e');
    icon.setAttribute('stroke-width', '1.5');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
    
    // Create content wrapper
    const content = document.createElement('div');
    
    // Create title
    const title = document.createElement('strong');
    title.textContent = 'Database schema is behind migrations';
    
    // Create description
    const description = document.createElement('div');
    description.style.cssText = 'font-size: 13px; opacity: 0.8;';
    description.textContent = 'Some columns are missing. Students loaded with basic fields only. Apply pending migrations to restore full functionality.';
    
    // Assemble the banner
    content.appendChild(title);
    content.appendChild(description);
    banner.appendChild(icon);
    banner.appendChild(content);
    
    // Insert at the top of the container
    container.insertBefore(banner, container.firstChild);
  }

  function hideSchemaDriftBanner() {
    const banner = document.getElementById('schema-drift-banner');
    if (banner) {
      banner.remove();
    }
  }

  function filterStudents() {
    let filtered = allStudents;

    // Filter out archived students unless showArchived is enabled
    if (!showArchived) {
      filtered = filtered.filter(s => s.status !== 'archived' && s.active !== false);
    }

    // Quarter selection should NOT filter which students appear - ALL students should always be visible.
    // The quarter selection only affects which quarter's progress data is displayed (if applicable).

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.code.toLowerCase().includes(query)
      );
    }

    if (selectedClassFilter !== 'All') {
      filtered = filtered.filter(s => {
        const enrollments = allEnrollments.filter(e => e.student_code === s.code);
        return enrollments.some(e => e.class_name === selectedClassFilter);
      });
    }

    // Needs Attention filter: students with regressing/stalled goals or stale/critical data
    if (needsAttentionFilter) {
      filtered = filtered.filter(s => studentNeedsAttention(s.code));
    }

    // Sort the filtered students
    if (sortBy === 'code') {
      filtered.sort((a, b) => a.code.localeCompare(b.code));
    } else if (sortBy === 'goals') {
      filtered.sort((a, b) => {
        const aGoals = allGoals.filter(g => g.student_code === a.code).length;
        const bGoals = allGoals.filter(g => g.student_code === b.code).length;
        return bGoals - aGoals; // descending
      });
    } else if (sortBy === 'iep_due') {
      filtered.sort((a, b) => {
        const aDate = a.iep_due ? new Date(a.iep_due) : new Date('9999-12-31');
        const bDate = b.iep_due ? new Date(b.iep_due) : new Date('9999-12-31');
        return aDate - bDate; // ascending (soonest first, nulls last)
      });
    } else if (sortBy === 'eval_due') {
      filtered.sort((a, b) => {
        const aDate = a.eval_due ? new Date(a.eval_due) : new Date('9999-12-31');
        const bDate = b.eval_due ? new Date(b.eval_due) : new Date('9999-12-31');
        return aDate - bDate; // ascending (soonest first, nulls last)
      });
    } else if (sortBy === 'health') {
      filtered.sort((a, b) => {
        // Worst tier (lowest sortOrder) first
        const aSort = getStudentStalenessInfo(a.code).sortOrder;
        const bSort = getStudentStalenessInfo(b.code).sortOrder;
        return aSort - bSort;
      });
    } else if (sortBy === 'data_age') {
      filtered.sort((a, b) => {
        // Most stale (highest days) first; null (never) = Infinity
        const aDays = getStudentDaysSinceLastData(a.code);
        const bDays = getStudentDaysSinceLastData(b.code);
        const aVal = aDays === null ? Infinity : aDays;
        const bVal = bDays === null ? Infinity : bDays;
        return bVal - aVal;
      });
    } else if (sortBy === 'urgency') {
      filtered.sort((a, b) => {
        const aScore = computeUrgencyScore(a.code);
        const bScore = computeUrgencyScore(b.code);
        if (bScore !== aScore) return bScore - aScore; // highest urgency first
        return a.code.localeCompare(b.code); // alphabetical tiebreaker
      });
    }

    // Pinned students always float to the top, preserving the chosen sort within each group
    filtered.sort((a, b) => {
      const aPinned = pinnedStudents.has(a.code) ? 0 : 1;
      const bPinned = pinnedStudents.has(b.code) ? 0 : 1;
      return aPinned - bPinned;
    });

    filteredStudents = filtered;
  }

  /** Returns true if the student is currently pinned. */
  function isStudentPinned(code) {
    return pinnedStudents.has(code);
  }

  /**
   * Toggle pin state for a student, persist to localStorage, and re-render.
   * @param {string} code
   */
  function togglePinStudent(code) {
    if (pinnedStudents.has(code)) {
      pinnedStudents.delete(code);
    } else {
      pinnedStudents.add(code);
    }
    localStorage.setItem(ST_PINNED_STUDENTS_KEY, JSON.stringify([...pinnedStudents]));
    filterStudents();
    renderStudentList();
  }

  // Render functions
  async function renderStudentList() {
    const tbody = document.getElementById('stStudentTableBody');
    if (!tbody) return;

    // Determine where the pinned-students section ends so we can insert a divider.
    // findIndex returns -1 when no non-pinned students exist (all pinned) → no divider.
    const firstNonPinnedIdx = filteredStudents.findIndex(s => !pinnedStudents.has(s.code));
    const showDivider = firstNonPinnedIdx > 0 && firstNonPinnedIdx < filteredStudents.length;

    const htmlParts = [];

    filteredStudents.forEach((student, idx) => {
      const enrollments = allEnrollments.filter(e => e.student_code === student.code);
      const studentGoals = allGoals.filter(g => g.student_code === student.code);
      const classes = enrollments.map(e => abbreviateClass(e.class_name)).join(', ');
      const isExpanded = expandedStudents.has(student.code);
      const isArchived = student.status === 'archived' || student.active === false;
      const isPinned = pinnedStudents.has(student.code);
      
      const iepDue = student.iep_due ? formatDate(student.iep_due) : 'N/A';
      const iepUrgency = getDateUrgency(student.iep_due);
      const iepWarning = !student.iep_due ? MISSING_DATE_WARNING : '';
      
      const evalDue = student.eval_due ? formatDate(student.eval_due) : 'N/A';
      const evalUrgency = getDateUrgency(student.eval_due);
      const evalWarning = !student.eval_due ? MISSING_DATE_WARNING : '';

      // Health dot — worst staleness tier across all active goals
      const healthInfo = getStudentStalenessInfo(student.code);
      const healthDot = `<span class="st-health-dot" title="${escapeHtml(healthInfo.label)}">${escapeHtml(healthInfo.icon)}</span>`;

      // Data column — relative time of most-recent progress entry + staleness color
      const daysSince = getStudentDaysSinceLastData(student.code);
      const dataInfo = getGoalStaleness(daysSince);
      const dataLabel = formatRelativeTime(daysSince);

      // Alert badge counts for this student
      const alertCounts = getStudentAlertCounts(student.code);
      const svgWarn = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      const svgTrophyBadge = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 21 12 21 16 21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M5 4H3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2 5 5 0 0 0 5 5 5 5 0 0 0 5-5 2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M5 4h14"/></svg>`;
      const svgPauseBadge = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      const alertBadgesHtml = [
        alertCounts.regressingCount > 0
          ? `<span class="st-alert-badge st-alert-badge--regressing" title="Regressing goals">${svgWarn} ${alertCounts.regressingCount} regressing</span>`
          : '',
        alertCounts.masteredCount > 0
          ? `<span class="st-alert-badge st-alert-badge--mastered" title="${alertCounts.masteredCount} goal${alertCounts.masteredCount === 1 ? '' : 's'} at mastery — consider archiving">${svgTrophyBadge} ${alertCounts.masteredCount} mastered</span>`
          : '',
        alertCounts.stalledCount > 0
          ? `<span class="st-alert-badge st-alert-badge--stalled" title="Stalled goals">${svgPauseBadge} ${alertCounts.stalledCount} stalled</span>`
          : '',
      ].join('');

      // Urgency score indicator (shown as a subtle colored dot with number)
      const urgencyScore = computeUrgencyScore(student.code);
      const urgencyHtml = urgencyScore > 0
        ? `<span class="st-urgency-score" title="Urgency score: ${urgencyScore}" style="font-size:10px;opacity:0.65;margin-left:4px;color:${urgencyScore >= 30 ? 'var(--rc-danger)' : urgencyScore >= 15 ? 'var(--rc-warning)' : 'var(--rc-info)'};">${urgencyScore}</span>`
        : '';

      // Mini sparkline — only shown in collapsed row
      const sparklineValues = getStudentSparklineValues(student.code);
      const sparklineSvg = renderMiniSparkline(sparklineValues);
      const sparklineHtml = sparklineSvg ? `<span class="st-mini-sparkline">${sparklineSvg}</span>` : '';

      // Focus mode: mark rows that need attention so non-attention rows can be dimmed
      const needsAttention = alertCounts.regressingCount > 0 || alertCounts.stalledCount > 0 ||
        healthInfo.tier === 'critical' || healthInfo.tier === 'stale' || healthInfo.tier === 'none';

      // Pin button — shown in collapsed (non-expanded) rows — SVG pin icon instead of emoji
      const svgPin = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17H19V13L17 7V3H7V7L5 13V17Z"/></svg>`;
      const pinBtn = !isExpanded
        ? `<button class="st-pin-btn${isPinned ? ' active' : ''}" data-code="${escapeHtml(student.code)}" title="${isPinned ? 'Unpin student' : 'Pin student to top'}" aria-label="${isPinned ? 'Unpin ' + escapeHtml(student.code) : 'Pin ' + escapeHtml(student.code) + ' to top'}" aria-pressed="${isPinned ? 'true' : 'false'}">${svgPin}</button>`
        : '';

      // "Last seen" attendance indicator — SVG calendar icon instead of emoji
      const svgCalIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-right:2px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
      const lastSeenDate = getStudentLastAttendanceDate(student.code);
      const lastSeenLabel = formatLastSeen(lastSeenDate);
      const lastSeenHtml = lastSeenLabel
        ? `<span class="st-last-seen" title="Last attendance recorded">${svgCalIcon}${escapeHtml(lastSeenLabel)}</span>`
        : `<span class="st-last-seen st-last-seen--none" title="No attendance data">No attendance data</span>`;

      // Mark attendance button (bonus: quick toggle for today)
      const todayAttEntry = allAttendanceLogs.find(e => {
        const todayISO = new Date().toISOString().slice(0, 10);
        return e.student_code === student.code && e.date === todayISO;
      });
      const attStatus = todayAttEntry ? todayAttEntry.status : null;
      const svgCheckAtt = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
      const svgPlusAtt  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      const attBtnLabel = attStatus ? `${attStatus.charAt(0).toUpperCase() + attStatus.slice(1)}` : 'Attendance';
      const attBtnIcon  = attStatus ? svgCheckAtt : svgPlusAtt;
      const markAttBtn = `<button class="st-attendance-btn" data-code="${escapeHtml(student.code)}" title="Mark attendance for today" aria-label="Mark attendance for ${escapeHtml(student.code)}">${attBtnIcon} ${escapeHtml(attBtnLabel)}</button>`;

      // "I Saw This Student Today" one-click button
      const alreadyPresent = attStatus === 'present';
      const svgCheckCircle = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
      const seenTodayBtn = !isExpanded
        ? `<button class="st-seen-today-btn st-btn st-btn-small${alreadyPresent ? ' st-seen-today-btn--present' : ''}" data-code="${escapeHtml(student.code)}" title="Mark present &amp; enter data" aria-label="Mark ${escapeHtml(student.code)} present and enter data" style="display:inline-flex;align-items:center;gap:4px;${alreadyPresent ? 'color:var(--rc-success);border-color:var(--rc-success);' : ''}">${svgCheckCircle}${alreadyPresent ? 'Present' : 'Seen today'}</button>`
        : '';

      const svgChevron = isExpanded
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;

      let rows = `
        <tr class="${isExpanded ? 'expanded' : ''} ${isArchived ? 'st-row-archived' : ''} ${needsAttention ? 'st-needs-attention' : ''} ${isPinned ? 'st-row-pinned' : ''}" data-code="${escapeHtml(student.code)}" data-health-sort="${healthInfo.sortOrder}" data-data-age="${daysSince === null ? NULL_DATA_AGE_SORT_VALUE : daysSince}">
          <td class="st-chevron-cell">
            <span class="st-chevron ${isExpanded ? 'expanded' : ''}">${svgChevron}</span>${healthDot}
          </td>
          <td class="st-code-cell">${escapeHtml(student.code)}${urgencyHtml}${pinBtn}</td>
          <td class="st-classes-cell">${escapeHtml(classes) || 'None'}</td>
          <td class="st-goals-cell">
            <span class="st-goals-tooltip-wrapper" data-student="${escapeHtml(student.code)}"><span class="st-goals-badge">${studentGoals.length}</span>${sparklineHtml}</span>${alertBadgesHtml}
          </td>
          <td class="st-date-${iepUrgency}">${escapeHtml(iepDue)}${iepWarning}</td>
          <td class="st-date-${evalUrgency}">${escapeHtml(evalDue)}${evalWarning}</td>
          <td class="${escapeHtml(dataInfo.cssClass)}">${escapeHtml(dataLabel)}<br>${lastSeenHtml}${markAttBtn}${seenTodayBtn}</td>
        </tr>
      `;

      // Add expanded detail row if this student is expanded
      if (isExpanded) {
        rows += `
          <tr class="st-expanded-row">
            <td colspan="7">
              <div class="st-expanded-content" id="stExpandedDetail-${escapeHtml(student.code)}">
                <!-- Detail content rendered separately -->
              </div>
            </td>
          </tr>
        `;
      }

      htmlParts.push(rows);

      // Insert divider after the last pinned row
      if (showDivider && idx === firstNonPinnedIdx - 1) {
        htmlParts.push(`<tr class="st-pinned-divider" role="separator" aria-label="End of pinned students"><td colspan="7"></td></tr>`);
      }
    });

    tbody.innerHTML = htmlParts.join('');

    // Render detail content for all expanded students
    // Use Promise.allSettled to handle async rendering safely
    const renderPromises = Array.from(expandedStudents).map(studentCode => 
      renderExpandedDetail(studentCode).catch(err => {
        console.error(`[tc-students] Error rendering expanded detail for ${studentCode}:`, err);
      })
    );
    await Promise.allSettled(renderPromises);
  }

  /**
   * Returns a color based on data-point count vs expected threshold.
   * red=0, yellow=partial (< 2/3 of expected), blue=nearly there (< expected), green=met.
   */
  function getCountColor(count, expected) {
    if (count === 0) return '#ef4444';
    if (count < Math.floor(expected * 2 / 3)) return '#eab308';
    if (count < expected) return '#3b82f6';
    return '#22c55e';
  }

  /**
   * After goals are rendered, fetch per-question data points for all goals that have a
   * "View Data" toggle button and update their status-count element so the initial render
   * shows the correct data-point count instead of the goal_progress aggregate count.
   */
  async function batchUpdateGoalDataCounts(container, studentGoals) {
    console.log('[tc-students] batchUpdateGoalDataCounts: verifying goal_data_points table access...');
    const toggleBtns = container.querySelectorAll('.tc-progress-toggle-btn[data-goal-id]');
    if (!toggleBtns.length) return;
    console.log(`[tc-students] batchUpdateGoalDataCounts: checking ${toggleBtns.length} goal(s)`);

    const qRange = (() => { try { return getQuarterDateRange(getCurrentQuarter()); } catch (_) { return null; } })();

    await Promise.allSettled(Array.from(toggleBtns).map(async btn => {
      const goalId = btn.dataset.goalId;
      const goal = goalId ? allGoals.find(g => g.id === goalId) : null;
      if (!goal) return;
      const studentId = goal.student_id || allStudents.find(s => s.code === goal.student_code)?.id;
      if (!studentId) {
        console.warn(`[tc-students] batchUpdateGoalDataCounts: could not resolve student_id for goal ${goal.code} (${goal.id})`);
        return;
      }
      try {
        const dataPoints = await db.listGoalDataPoints({ studentId, goalId: goal.id });
        console.log(`[tc-students] batchUpdateGoalDataCounts: goal ${goal.code} → ${(dataPoints || []).length} data point(s)`, { studentId, goalId: goal.id });
        if (!dataPoints || dataPoints.length === 0) return;
        const dpThisQ = qRange
          ? dataPoints.filter(dp => { const d = new Date(dp.date); return d >= qRange.start && d <= qRange.end; })
          : dataPoints;
        if (dpThisQ.length === 0) return;
        const sanitizedId = goal.id.replace(/[^a-z0-9]/gi, '_');
        const n = dpThisQ.length;
        const expected = goal.expected_data_points || 3;

        const statusEl = document.getElementById(`tc-goal-status-count-${sanitizedId}`);
        if (statusEl) {
          statusEl.textContent = `${n} data ${n === 1 ? 'point' : 'points'} this quarter`;
        }

        const headerEl = document.getElementById(`tc-goal-header-count-${sanitizedId}`);
        if (headerEl) {
          headerEl.textContent = `${n}/${expected}`;
          headerEl.style.color = getCountColor(n, expected);
        }

        const qaEl = document.getElementById(`tc-goal-qa-count-${sanitizedId}`);
        if (qaEl) {
          const countSpan = qaEl.querySelector('.st-qa-count');
          if (countSpan) countSpan.textContent = `(${n}/${expected})`;
        }
      } catch (err) {
        console.warn(`[tc-students] batchUpdateGoalDataCounts: error for goal ${goal.code}:`, err);
      }
    }));
  }

  /**
   * Asynchronously fetch per-question aggregation data for each goal and inject
   * "⚠ Skill Gaps" badges into the placeholder spans rendered in renderGoalCard.
   * Called lazily after the Goals tab renders — non-blocking.
   */
  async function injectSkillGapBadges(container, studentCode, studentGoals) {
    const placeholders = container.querySelectorAll('.st-skill-gap-badge-placeholder[data-goal-code]');
    if (!placeholders.length) return;

    let submissionsData = [];
    let assignmentsData = [];
    let mappingsData = [];
    try {
      [submissionsData, assignmentsData, mappingsData] = await Promise.all([
        db.listSubmissions ? db.listSubmissions({ studentCode }) : Promise.resolve([]),
        db.listAssignments ? db.listAssignments() : Promise.resolve([]),
        db.listAssignmentGoalMappings ? db.listAssignmentGoalMappings({ studentCode }) : Promise.resolve([]),
      ]);
    } catch (_e) {
      return; // Silently skip — badges are optional
    }

    for (const placeholder of placeholders) {
      const goalCode = placeholder.dataset.goalCode;
      if (!goalCode) continue;

      const questions = getPerQuestionAggregation(goalCode, studentCode, mappingsData, submissionsData, assignmentsData);
      const weakQuestions = questions.filter(q => q.accuracy !== null && q.accuracy < SKILL_GAP_BADGE_THRESHOLD);
      if (weakQuestions.length === 0) continue;

      // Build tooltip listing weak question texts
      const tooltipLines = weakQuestions
        .slice(0, 5) // cap at 5 items in tooltip
        .map(q => {
          const shortText = q.text.length > 50 ? q.text.slice(0, 50) + '…' : q.text;
          return `${shortText} (${q.accuracy}%)`;
        })
        .join('\n');
      const moreCount = weakQuestions.length > 5 ? `\n+${weakQuestions.length - 5} more` : '';

      const badge = document.createElement('span');
      badge.className = 'st-skill-gap-badge';
      badge.style.cssText = 'display:inline-flex;align-items:center;gap:3px;background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:5px;padding:1px 6px;font-size:10px;font-weight:600;margin-left:4px;cursor:default;vertical-align:middle;';
      badge.title = `⚠ Skill Gaps — questions below 50%:\n${tooltipLines}${moreCount}`;
      badge.textContent = `⚠ ${weakQuestions.length} Skill Gap${weakQuestions.length === 1 ? '' : 's'}`;

      placeholder.appendChild(badge);
    }
  }

  async function renderExpandedDetail(studentCode) {
    const container = document.getElementById(`stExpandedDetail-${studentCode}`);
    if (!container) return;

    // Abort any previous listeners attached to this student's expanded content,
    // then create a fresh controller for this render cycle.
    const prevController = expandedContentControllers.get(studentCode);
    if (prevController) prevController.abort();
    const expandController = new AbortController();
    expandedContentControllers.set(studentCode, expandController);

    const student = allStudents.find(s => s.code === studentCode);
    if (!student) {
      container.innerHTML = '<div class="empty-state">Student not found</div>';
      return;
    }

    const enrollments = allEnrollments.filter(e => e.student_code === student.code);
    const studentGoals = allGoals.filter(g => g.student_code === student.code);

    // Get per-student tab state, default to 'goals'
    const selectedDetailTab = selectedDetailTabMap.get(studentCode) || 'goals';
    
    // Render header with tabs
    let tabContent = '';
    let tabContentEl = null; // For tabs that return DOM elements instead of HTML strings
    if (selectedDetailTab === 'goals') {
      tabContent = await renderStudentGoalsTab(student, studentGoals);
    } else if (selectedDetailTab === 'progress') {
      tabContentEl = await renderStudentProgressTab(student, studentGoals);
    } else if (selectedDetailTab === 'schedule') {
      tabContentEl = renderStudentScheduleTab(student, studentGoals);
    } else if (selectedDetailTab === 'classes') {
      tabContent = renderStudentClassesTab(student, enrollments);
    } else if (selectedDetailTab === 'skills') {
      tabContent = await renderSkillsSummaryTab(student, studentGoals);
    } else if (selectedDetailTab === 'settings') {
      tabContent = renderStudentSettingsTab(student);
    }

    const isActive = student.status !== 'archived' && student.active !== false;

    // Build header with DOM API — user-controlled data (dates, names) never touches innerHTML
    const headerDiv = document.createElement('div');
    headerDiv.className = 'st-detail-header';

    const headerLeft = document.createElement('div');

    const titleEl = document.createElement('h1');
    titleEl.className = 'st-detail-title';
    titleEl.textContent = student.code;
    headerLeft.appendChild(titleEl);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'st-detail-meta';

    const managerSpan = document.createElement('span');
    managerSpan.textContent = '👤 ' + (student.primary_case_manager || 'N/A');
    metaDiv.appendChild(managerSpan);

    const iepSpan = document.createElement('span');
    iepSpan.className = 'st-date-' + getDateUrgency(student.iep_due);
    iepSpan.textContent = '📋 IEP: ' + (student.iep_due ? formatDate(student.iep_due) : 'N/A');
    metaDiv.appendChild(iepSpan);

    const evalSpan = document.createElement('span');
    evalSpan.className = 'st-date-' + getDateUrgency(student.eval_due);
    evalSpan.textContent = '📝 Eval: ' + (student.eval_due ? formatDate(student.eval_due) : 'N/A');
    metaDiv.appendChild(evalSpan);

    const badgeSpan = document.createElement('span');
    if (isActive) {
      badgeSpan.className = 'st-badge st-badge-active';
      badgeSpan.textContent = 'Active';
    } else {
      badgeSpan.className = 'st-badge';
      badgeSpan.textContent = 'Archived';
    }
    metaDiv.appendChild(badgeSpan);

    headerLeft.appendChild(metaDiv);
    headerDiv.appendChild(headerLeft);

    const newIepBtn = document.createElement('button');
    newIepBtn.className = 'st-btn st-btn-secondary';
    newIepBtn.id = 'new-iep-btn';
    newIepBtn.textContent = '📋 New IEP';
    headerDiv.appendChild(newIepBtn);

    container.innerHTML = '';
    container.appendChild(headerDiv);

    // Tabs — selectedDetailTab is a local variable from a Map, not user input
    const tabsDiv = document.createElement('div');
    tabsDiv.className = 'st-tabs';
    tabsDiv.innerHTML = `
      <button class="st-tab ${selectedDetailTab === 'goals' ? 'active' : ''}" data-tab="goals">Goals</button>
      <button class="st-tab ${selectedDetailTab === 'progress' ? 'active' : ''}" data-tab="progress">Progress</button>
      <button class="st-tab ${selectedDetailTab === 'schedule' ? 'active' : ''}" data-tab="schedule">Schedule</button>
      <button class="st-tab ${selectedDetailTab === 'classes' ? 'active' : ''}" data-tab="classes">Classes</button>
      <button class="st-tab ${selectedDetailTab === 'skills' ? 'active' : ''}" data-tab="skills">Skills Summary</button>
      <button class="st-tab ${selectedDetailTab === 'settings' ? 'active' : ''}" data-tab="settings">Settings</button>
    `;
    container.appendChild(tabsDiv);

    // Tab content — output of trusted render functions that already use escapeHtml()
    const contentDiv = document.createElement('div');
    contentDiv.className = 'st-tab-content';
    if (tabContentEl) {
      // Progress tab returns a DOM element (built with DOM API to satisfy CodeQL requirements)
      contentDiv.appendChild(tabContentEl);
    } else {
      contentDiv.innerHTML = tabContent;
    }
    container.appendChild(contentDiv);

    // Wire up observation config show/hide for any inline edit forms rendered
    container.querySelectorAll('.st-goal-edit-form').forEach(form => {
      initObservationFields(form);
    });

    // After the goals tab is rendered, batch-fetch data points to show accurate counts
    if (selectedDetailTab === 'goals') {
      batchUpdateGoalDataCounts(contentDiv, studentGoals).catch(() => {});
      injectSkillGapBadges(contentDiv, studentCode, studentGoals).catch(() => {});
    }

    // Wire up the AI Commentary button and export buttons for the skills tab
    if (selectedDetailTab === 'skills') {
      initSkillsTabButton(contentDiv, student, expandController.signal);
      initSkillsExportButtons(contentDiv, student, expandController.signal);
    }
  }


  async function renderStudentGoalsTab(student, studentGoals) {
    // Check for active tokens
    const activeTokens = await checkActiveTokens(student.code);

    // Mark goals with active tokens
    studentGoals.forEach(goal => {
      goal._hasActiveToken = !!activeTokens[goal.code];
    });

    let inContextGoals = studentGoals;
    let outsideGoals = [];

    if (selectedClassFilter !== 'All') {
      inContextGoals = studentGoals.filter(g => g.class_context === selectedClassFilter);
      outsideGoals = studentGoals.filter(g => g.class_context !== selectedClassFilter);
    }

    if (selectedGoalAreaFilter !== 'All') {
      inContextGoals = inContextGoals.filter(g => g.goal_area === selectedGoalAreaFilter);
      outsideGoals = outsideGoals.filter(g => g.goal_area === selectedGoalAreaFilter);
    }

    // Detect mastered goals across all active goals (not just filtered view)
    const masteredGoals = studentGoals.filter(g => g.status !== 'archived' && computeGoalAlertStatus(g).isMastered);

    return renderStudentGoals(inContextGoals, outsideGoals, student.code, masteredGoals);
  }

  function renderStudentClassesTab(student, enrollments) {
    return renderStudentClasses(student, enrollments);
  }

  function renderStudentSettingsTab(student) {
    const isActive = student.status !== 'archived' && student.active !== false;
    
    return `
      <div class="st-detail-section">
        <h3>Student Information</h3>
        <div class="st-form-group">
          <label class="st-form-label">Primary Case Manager</label>
          <input type="text" id="edit-case-manager-${escapeHtml(student.code)}" class="st-form-input" value="${escapeHtml(student.primary_case_manager || '')}" />
        </div>
        <div class="st-form-group">
          <label class="st-form-label">IEP Due Date</label>
          <input type="date" id="edit-iep-due-${escapeHtml(student.code)}" class="st-form-input" value="${student.iep_due || ''}" />
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Eval Due Date</label>
          <input type="date" id="edit-eval-due-${escapeHtml(student.code)}" class="st-form-input" value="${student.eval_due || ''}" />
        </div>
        <button class="st-btn st-btn-primary" id="save-student-info-btn-${escapeHtml(student.code)}">Save Changes</button>
      </div>

      <div class="st-detail-section">
        <h3>Actions</h3>
        ${renderStudentPassword()}
        ${isActive 
          ? `<button class="st-btn st-btn-danger" id="archive-student-btn-${escapeHtml(student.code)}">🗃️ Archive Student</button>`
          : `<button class="st-btn st-btn-primary" id="reactivate-student-btn-${escapeHtml(student.code)}">♻️ Reactivate Student</button>`
        }
      </div>
    `;
  }

  // ============================================================================
  // PROGRESS TAB — per-student IEP goal data history, stats, sparklines,
  //                inline editing, add data point, export CSV, samples modal.
  //
  // Security: All user-controlled data (goal codes, descriptions, student names,
  //           values, dates, sources) is set via textContent / setAttribute.
  //           SVG sparklines use only computed numeric coordinates — safe as innerHTML.
  // ============================================================================

  /** DOM helper: create an element with optional class names and text content */
  function stEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  /** Helper: today's date as YYYY-MM-DD */
  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  /** Helper: score color CSS class (mirrors tc-data.js scoreColorClass) */
  function progressScoreColorClass(score) {
    if (score == null || isNaN(score)) return '';
    if (score >= 80) return 'dt-score-green';
    if (score >= 60) return 'dt-score-amber';
    return 'dt-score-red';
  }

  /**
   * Aggregate per-question accuracy for a goal across all submissions for a student.
   * @param {string} goalCode
   * @param {string} studentCode
   * @param {Array} mappingsData - assignment_goal_mappings records
   * @param {Array} submissionsData - submission records (with answers, student_code, assignment_id)
   * @param {Array} assignmentsData - assignment records (with id, meta)
   * @returns {Array} Per-question stats sorted by accuracy ascending (weakest first):
   *   [{ itemRef, text, attempts, correct, accuracy, trend }]
   */
  function getPerQuestionAggregation(goalCode, studentCode, mappingsData, submissionsData, assignmentsData) {
    // Find assignment IDs mapped to this goal for this student
    const mappedIds = (mappingsData || [])
      .filter(m => m.goal_code === goalCode && m.student_code === studentCode)
      .map(m => m.assignment_id);

    if (mappedIds.length === 0) return [];

    // Find submissions for these assignments by this student, sorted chronologically
    const relSubs = (submissionsData || [])
      .filter(sub => sub.student_code === studentCode && mappedIds.includes(sub.assignment_id))
      .slice()
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

    if (relSubs.length === 0) return [];

    // Per-question accumulator: key = item_ref
    const questionStats = new Map();

    for (const sub of relSubs) {
      const assignment = (assignmentsData || []).find(a => a.id === sub.assignment_id);
      if (!assignment) continue;

      const items = buildItemsFromMeta(sub.assignment_id, assignment.meta || null)
        .filter(item => Array.isArray(item.goal_codes) && item.goal_codes.includes(goalCode));

      const rawAnswers = (sub.answers && typeof sub.answers === 'object' && !Array.isArray(sub.answers))
        ? sub.answers : {};

      for (const item of items) {
        const key = item.item_ref;
        if (!questionStats.has(key)) {
          questionStats.set(key, {
            text: (item.meta && item.meta.text) ? item.meta.text : String(item.item_ref),
            attempts: 0,
            correct: 0,
            history: [],
          });
        }
        const stat = questionStats.get(key);

        const studentAns = rawAnswers[item.item_ref] !== undefined ? rawAnswers[item.item_ref] : null;
        const correctAns = item.meta ? item.meta.correct : undefined;

        let isCorrect = null;
        if (studentAns !== null && studentAns !== undefined && correctAns !== undefined && correctAns !== null) {
          isCorrect = String(studentAns).toLowerCase().trim() === String(correctAns).toLowerCase().trim();
        }

        if (isCorrect !== null) {
          stat.attempts++;
          if (isCorrect) stat.correct++;
          stat.history.push(isCorrect ? 1 : 0);
        }
      }
    }

    // Build result array with computed stats
    const results = [];
    for (const [itemRef, stat] of questionStats) {
      const accuracy = stat.attempts > 0 ? Math.round((stat.correct / stat.attempts) * 100) : null;

      // Compute trend from last 3 history entries
      let trend = 'stable';
      if (stat.history.length >= 3) {
        const recent = stat.history.slice(-3);
        const first = recent[0];
        const last = recent[recent.length - 1];
        if (last > first) trend = 'improving';
        else if (last < first) trend = 'declining';
      }

      results.push({ itemRef, text: stat.text, attempts: stat.attempts, correct: stat.correct, accuracy, trend });
    }

    // Sort by accuracy ascending (weakest first), null accuracy sorted last
    return results.sort((a, b) => {
      if (a.accuracy === null && b.accuracy === null) return 0;
      if (a.accuracy === null) return 1;
      if (b.accuracy === null) return -1;
      return a.accuracy - b.accuracy;
    });
  }

  /**
   * Get progress entries for a goal in a specific quarter (or all if quarter is falsy).
   * Reads from allProgressEntries (the module-level array loaded in loadData).
   */
  function getProgressEntriesForTab(studentCode, goalCode, quarter) {
    const all = getProgressForGoal(studentCode, goalCode)
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!quarter) return all;
    const range = getQuarterDateRange(quarter);
    if (!range) return all;
    return all.filter(p => {
      const d = new Date(p.date);
      return d >= range.start && d <= range.end;
    });
  }

  /** Calculate rolling average from an array of progress entries */
  function calcProgressAvg(entries) {
    const nums = entries.filter(e => e.value != null).map(e => parseFloat(e.value));
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  /**
   * Build sparkline SVG for the Progress tab.
   * Uses pure numeric coordinates — safe to assign as innerHTML.
   * @param {Array} entries - Sorted progress entries with .value
   * @param {number} idx    - Numeric index for unique gradient ID (not user data)
   * @returns {HTMLElement|null}
   */
  function buildProgressSparklineEl(entries, idx) {
    const numericEntries = entries.filter(e => e.value != null && !isNaN(parseFloat(e.value)));
    if (numericEntries.length < 2) return null;

    const width = 200, height = 40, padding = 4;
    const values = numericEntries.map(e => parseFloat(e.value));
    const maxV = Math.max(...values, 100);
    const minV = Math.min(...values, 0);
    const range = maxV - minV || 1;
    const stepX = (width - 2 * padding) / (values.length - 1);

    let points = '';
    let circles = '';
    values.forEach((val, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((val - minV) / range) * (height - 2 * padding);
      points += `${x.toFixed(2)},${y.toFixed(2)} `;
      circles += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2" fill="rgba(34,197,94,0.9)"/>`;
    });

    const firstX = padding;
    const lastX = padding + (values.length - 1) * stepX;
    const bottomY = height - padding;
    const polyPts = points.trim() + ` ${lastX.toFixed(2)},${bottomY} ${firstX},${bottomY}`;
    // Gradient ID uses only a numeric index — not user-controlled
    const gId = `stPrgSpkGrad${idx}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'dt-sparkline';
    // SVG content uses only numeric computed values — no user data interpolated
    wrapper.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="${gId}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:rgba(34,197,94,0.2);stop-opacity:1"/><stop offset="100%" style="stop-color:rgba(34,197,94,0.02);stop-opacity:1"/></linearGradient></defs><polygon points="${polyPts}" fill="url(#${gId})"/><polyline points="${points.trim()}" fill="none" stroke="rgba(34,197,94,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${circles}</svg>`;
    return wrapper;
  }

  /**
   * Build the stats row for a goal on the Progress tab.
   * All user-controlled values set via textContent — never interpolated into HTML.
   */
  function buildProgressStatsEl(goal, entries) {
    const avg = calcProgressAvg(entries);
    const baseline = goal.baseline != null ? String(goal.baseline) : 'N/A';
    const mastery = goal.mastery != null ? String(goal.mastery) : (goal.target != null ? String(goal.target) : 'N/A');
    const target = goal.target != null ? String(goal.target) : 'N/A';
    const current = entries.length > 0 ? parseFloat(entries[entries.length - 1].value) : null;
    const baselineNum = parseGoalValue(goal.baseline) ?? 0;
    const delta = current != null ? current - baselineNum : null;

    let trend = '→';
    if (entries.length >= 2) {
      const half = Math.floor(entries.length / 2);
      const firstHalf = entries.slice(0, half);
      const secondHalf = entries.slice(half);
      const fAvg = firstHalf.reduce((s, e) => s + parseFloat(e.value || 0), 0) / firstHalf.length;
      const sAvg = secondHalf.reduce((s, e) => s + parseFloat(e.value || 0), 0) / secondHalf.length;
      if (sAvg > fAvg + 5) trend = '↗';
      else if (sAvg < fAvg - 5) trend = '↘';
    }

    const statsDiv = stEl('div', 'dt-stats');

    const makeStatSpan = (label, value, colorClass) => {
      const span = document.createElement('span');
      const labelText = document.createTextNode(label + ': ');
      const strong = document.createElement('strong');
      if (colorClass) strong.className = colorClass;
      strong.textContent = value;
      span.appendChild(labelText);
      span.appendChild(strong);
      return span;
    };

    if (goal.measurement_type === 'Observation') {
      // Simplified observation stats
      const currentDisplay = entries.length > 0 ? formatObservationValue(entries[entries.length - 1], goal) : 'N/A';
      const avgDisplay = avg != null ? `${avg.toFixed(0)}%` : 'N/A';
      const avgClass = progressScoreColorClass(avg);
      statsDiv.appendChild(makeStatSpan('Baseline', baseline, ''));
      statsDiv.appendChild(makeStatSpan('Mastery', mastery, ''));
      statsDiv.appendChild(makeStatSpan('Target', target, ''));
      statsDiv.appendChild(makeStatSpan('Current', currentDisplay, ''));
      statsDiv.appendChild(makeStatSpan('Avg', avgDisplay, avgClass));
      statsDiv.appendChild(makeStatSpan('Trend', trend, ''));
    } else {
      const avgClass = progressScoreColorClass(avg);
      const currentClass = progressScoreColorClass(current);
      const currentDisplay = current != null ? formatGoalValue(current, goal.measurement_type, goal) : 'N/A';
      const avgDisplay = avg != null ? formatGoalValue(avg, goal.measurement_type, goal) : 'N/A';
      const deltaDisplay = delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(1) : 'N/A';
      statsDiv.appendChild(makeStatSpan('Baseline', baseline, ''));
      statsDiv.appendChild(makeStatSpan('Mastery', mastery, ''));
      statsDiv.appendChild(makeStatSpan('Target', target, ''));
      statsDiv.appendChild(makeStatSpan('Current', currentDisplay, currentClass));
      statsDiv.appendChild(makeStatSpan('Rolling Avg', avgDisplay, avgClass));
      statsDiv.appendChild(makeStatSpan('Delta', deltaDisplay, ''));
      statsDiv.appendChild(makeStatSpan('Trend', trend, ''));
    }

    return statsDiv;
  }

  /**
   * Build the data-points table for a goal on the Progress tab.
   * All user-controlled cell content set via textContent.
   * @returns {HTMLElement}
   */
  function buildProgressDataTableEl(goal, entries, studentCode) {
    if (entries.length === 0) {
      const empty = stEl('div', null, goal.measurement_type === 'Observation'
        ? 'No observation data recorded yet.'
        : 'No data points recorded for this quarter.');
      empty.style.cssText = 'padding:10px;font-size:13px;color:#6b7280;';
      return empty;
    }

    const isObs = goal.measurement_type === 'Observation';
    const grid = stEl('div', 'dt-data-grid');
    const table = stEl('table', 'dt-data-table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Date', 'Value', 'Source'].forEach(h => {
      const th = stEl('th', null, h);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    entries.forEach(entry => {
      const tr = document.createElement('tr');

      // Date cell
      const tdDate = stEl('td', null, new Date(entry.date + 'T00:00:00').toLocaleDateString());
      tr.appendChild(tdDate);

      // Value cell (editable for non-observation goals)
      const scoreClass = isObs ? '' : progressScoreColorClass(parseFloat(entry.value));
      const displayValue = isObs
        ? formatObservationValue(entry, goal)
        : formatGoalValue(parseFloat(entry.value), goal.measurement_type, goal);
      const tdVal = stEl('td', `dt-data-value${isObs ? '' : ` ${scoreClass} editable`}`);
      tdVal.textContent = displayValue;
      if (!isObs) {
        tdVal.dataset.entryId = entry.id;
        tdVal.dataset.goal = goal.code;
        tdVal.dataset.student = studentCode;
        tdVal.dataset.value = entry.value;
      }
      tr.appendChild(tdVal);

      // Source cell
      const tdSrc = stEl('td', null, entry.source || 'manual');
      tr.appendChild(tdSrc);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    grid.appendChild(table);
    return grid;
  }

  /**
   * Build the inline "Add Data Point" form element for the Progress tab.
   * Returns a hidden form div; caller makes it visible and wires event handlers.
   */
  function buildProgressInlineFormEl(goal, studentCode) {
    const form = stEl('div', 'dt-inline-form');
    form.style.display = 'none';
    form.dataset.goal = goal.code;
    form.dataset.student = studentCode;

    const dateLabel = stEl('label', null, 'Date:');
    dateLabel.style.cssText = 'font-size:13px;opacity:0.9;';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'dt-date-input';
    dateInput.value = todayISO();

    // ── Smart Defaults: compute last value and trend ─────────────────────────
    const allEntries = getProgressForGoal(studentCode, goal.code)
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')); // newest first

    const lastEntry = allEntries[0];
    const lastValue = lastEntry
      ? (lastEntry.value != null ? parseFloat(lastEntry.value) : (lastEntry.percent != null ? parseFloat(lastEntry.percent) : null))
      : null;

    // Detect a clear upward trend: 3+ consecutive increases over time.
    // vals is newest-first, so an upward trend = vals[0] > vals[1] > vals[2]...
    let suggestedValue = null;
    let hasTrend = false;
    if (allEntries.length >= 3) {
      const vals = allEntries.slice(0, 4).map(e =>
        e.value != null ? parseFloat(e.value) : (e.percent != null ? parseFloat(e.percent) : null)
      ).filter(v => v != null && !isNaN(v));

      if (vals.length >= 3) {
        // vals[0] is newest; upward trend means vals[i-1] > vals[i] (newer > older)
        const allIncreasing = vals.every((v, i) => i === 0 || vals[i - 1] > v);
        if (allIncreasing) {
          hasTrend = true;
          // Project next value: add the most-recent step size to the current (newest) value
          const recentStep = vals[0] - vals[1]; // positive since newest > second-newest
          suggestedValue = Math.min(100, Math.max(0, Math.round(vals[0] + recentStep)));
        }
      }
    }

    const valLabel = stEl('label', null, 'Value:');
    valLabel.style.cssText = 'font-size:13px;opacity:0.9;';
    const valInput = document.createElement('input');
    valInput.type = 'number';
    valInput.className = 'dt-value-input';
    valInput.min = '0';
    valInput.max = '100';
    valInput.step = '1';
    valInput.placeholder = '0–100';

    // Pre-fill with last value (or trend suggestion)
    if (hasTrend && suggestedValue != null) {
      valInput.value = String(suggestedValue);
    } else if (lastValue != null) {
      valInput.value = String(lastValue);
    }

    // "Last: XX%" label shown when there is a previous value
    if (lastValue != null) {
      const lastLabel = document.createElement('span');
      lastLabel.style.cssText = 'font-size:11px;opacity:0.55;margin-left:4px;';
      lastLabel.textContent = hasTrend
        ? `Last: ${lastValue}% (suggested based on trend)`
        : `Last: ${lastValue}%`;
      valLabel.appendChild(lastLabel);
    }

    const saveBtn = stEl('button', 'dt-btn primary dt-save-btn', 'Save');
    const cancelBtn = stEl('button', 'dt-btn dt-cancel-btn', 'Cancel');

    form.appendChild(dateLabel);
    form.appendChild(dateInput);
    form.appendChild(valLabel);
    form.appendChild(valInput);
    form.appendChild(saveBtn);
    form.appendChild(cancelBtn);

    // Select pre-filled value so teacher can immediately type to override
    if (lastValue != null || (hasTrend && suggestedValue != null)) {
      requestAnimationFrame(() => { try { valInput.select(); } catch (_) { /* ignore */ } });
    }

    return form;
  }

  /**
   * Build a complete goal row element for the Progress tab.
   * ALL user-controlled data goes through textContent/setAttribute — no innerHTML with user data.
   * @param {Object} goal
   * @param {Array}  entries   Filtered progress entries for this goal/quarter
   * @param {string} studentCode
   * @param {number} idx       Numeric index for sparkline gradient IDs
   * @returns {HTMLElement}
   */
  function buildProgressGoalRowEl(goal, entries, studentCode, idx) {
    const row = stEl('div', 'dt-goal-row');
    row.dataset.goal = goal.code;
    row.dataset.student = studentCode;

    // Header: goal code — description | Samples button
    const header = stEl('div', 'dt-goal-header');

    const titleDiv = document.createElement('div');
    const codeStrong = stEl('strong');
    codeStrong.textContent = goal.code;
    titleDiv.appendChild(codeStrong);
    titleDiv.appendChild(document.createTextNode(' — '));
    titleDiv.appendChild(document.createTextNode(goal.desc || 'No description'));
    header.appendChild(titleDiv);

    const samplesBtn = stEl('button', 'dt-btn');
    samplesBtn.textContent = '📎 Samples';
    samplesBtn.dataset.action = 'open-samples';
    samplesBtn.dataset.goal = goal.code;
    samplesBtn.dataset.student = studentCode;
    header.appendChild(samplesBtn);

    row.appendChild(header);

    // Meta badges: area, measurement type
    const meta = stEl('div', 'dt-goal-meta');

    const areaSpan = document.createElement('span');
    areaSpan.appendChild(document.createTextNode('Area: '));
    const areaStrong = stEl('strong');
    areaStrong.textContent = goal.goal_area || 'Uncategorized';
    areaSpan.appendChild(areaStrong);
    meta.appendChild(areaSpan);

    if (goal.measurement_type === 'Observation' && goal.observation_config?.category) {
      const catLabels = {
        session_outcome: 'Session Outcome',
        tally: 'Tally',
        prompt_count: 'Prompt Count',
        behavior_checklist: 'Behavior Checklist',
      };
      const badge = stEl('span', 'dt-badge dt-badge-obs');
      badge.textContent = catLabels[goal.observation_config.category] || 'Observation';
      meta.appendChild(badge);
    } else if (goal.measurement_type) {
      const typeBadge = stEl('span', 'dt-badge');
      typeBadge.textContent = goal.measurement_type;
      meta.appendChild(typeBadge);
    }

    row.appendChild(meta);

    // Stats row
    row.appendChild(buildProgressStatsEl(goal, entries));

    // Sparkline (numeric SVG — safe)
    if (goal.measurement_type !== 'Observation') {
      const sparkEl = buildProgressSparklineEl(entries, idx);
      if (sparkEl) row.appendChild(sparkEl);
    }

    // Data table
    row.appendChild(buildProgressDataTableEl(goal, entries, studentCode));

    // Add Data Point button
    const addBtn = stEl('button', 'dt-btn primary');
    addBtn.textContent = '+ Add Data Point';
    addBtn.dataset.action = 'show-add-form';
    addBtn.dataset.goal = goal.code;
    addBtn.dataset.student = studentCode;
    row.appendChild(addBtn);

    // Inline add form
    const form = buildProgressInlineFormEl(goal, studentCode);
    row.appendChild(form);

    return row;
  }

  /**
   * Reload progress entries from the DB without reloading everything else.
   * Used after adding/editing data points on the Progress tab.
   */
  async function reloadProgressEntries() {
    try {
      allProgressEntries = await loadProgressEntries(allGoals, allStudents);
      buildProgressLookupMap();
    } catch (err) {
      console.warn('[tc-students] reloadProgressEntries failed:', err);
    }
  }

  /**
   * Export a single student's progress data as CSV.
   * Builds the CSV from allProgressEntries filtered to this student's goals.
   */
  function exportStudentProgressCsv(student, studentGoals, quarter) {
    const rows = [['Student', 'Student Code', 'Goal Code', 'Goal Area', 'Baseline', 'Mastery', 'Target', 'Date', 'Value', 'Source', 'Quarter']];
    studentGoals.forEach(goal => {
      const entries = getProgressEntriesForTab(student.code, goal.code, quarter);
      const baseline = goal.baseline != null ? String(goal.baseline) : '';
      const mastery = goal.mastery != null ? String(goal.mastery) : (goal.target != null ? String(goal.target) : '');
      const target = goal.target != null ? String(goal.target) : '';
      if (entries.length === 0) {
        rows.push([student.name || student.code, student.code, goal.code, goal.goal_area || 'Uncategorized', baseline, mastery, target, '', '', '', quarter || 'All']);
      } else {
        entries.forEach(entry => {
          rows.push([student.name || student.code, student.code, goal.code, goal.goal_area || 'Uncategorized', baseline, mastery, target, entry.date, entry.value != null ? String(entry.value) : '', entry.source || 'manual', quarter || 'All']);
        });
      }
    });
    const csvContent = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `progress_${student.code}_${quarter || 'all'}_${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Build the "📊 Question Breakdown" collapsible DOM element for the Work Samples modal.
   * Uses per-question aggregation data. All user strings set via textContent.
   */
  function buildQuestionBreakdownEl(goalCode, studentCode, mappingsData, submissionsData, assignmentsData) {
    const section = document.createElement('div');
    section.style.cssText = 'margin-top:20px;';

    const questions = getPerQuestionAggregation(goalCode, studentCode, mappingsData, submissionsData, assignmentsData);

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.style.cssText = 'cursor:pointer;font-weight:600;font-size:15px;user-select:none;padding:6px 0;';
    summary.textContent = '📊 Question Breakdown';
    details.appendChild(summary);

    if (questions.length === 0) {
      const msg = document.createElement('p');
      msg.style.cssText = 'font-size:13px;opacity:0.6;margin-top:8px;font-style:italic;';
      msg.textContent = 'No question-level data available for this goal.';
      details.appendChild(msg);
    } else {
      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;margin-top:10px;font-size:13px;';

      // Header row
      const thead = document.createElement('thead');
      const hrow = document.createElement('tr');
      for (const label of ['Question', 'Attempts', 'Correct', 'Accuracy', 'Trend']) {
        const th = document.createElement('th');
        th.style.cssText = 'text-align:left;padding:4px 8px;border-bottom:1px solid rgba(0,0,0,0.12);opacity:0.7;font-weight:600;';
        th.textContent = label;
        hrow.appendChild(th);
      }
      thead.appendChild(hrow);
      table.appendChild(thead);

      // Body rows
      const tbody = document.createElement('tbody');
      for (const q of questions) {
        const tr = document.createElement('tr');

        // Accuracy color: red < 50%, amber 50–74%, green ≥ 75%
        let accColor = '#9ca3af';
        if (q.accuracy !== null) {
          if (q.accuracy < 50) accColor = '#ef4444';
          else if (q.accuracy < 75) accColor = '#f59e0b';
          else accColor = '#22c55e';
        }

        const trendIcon = q.trend === 'improving' ? '↑' : q.trend === 'declining' ? '↓' : '→';
        const trendColor = q.trend === 'improving' ? '#22c55e' : q.trend === 'declining' ? '#ef4444' : '#9ca3af';

        const cells = [
          { text: q.text, style: 'padding:5px 8px;border-bottom:1px solid rgba(0,0,0,0.06);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' },
          { text: String(q.attempts), style: 'padding:5px 8px;border-bottom:1px solid rgba(0,0,0,0.06);text-align:center;' },
          { text: String(q.correct), style: 'padding:5px 8px;border-bottom:1px solid rgba(0,0,0,0.06);text-align:center;' },
          { text: q.accuracy !== null ? q.accuracy + '%' : '—', style: `padding:5px 8px;border-bottom:1px solid rgba(0,0,0,0.06);text-align:center;font-weight:600;color:${accColor};` },
          { text: trendIcon, style: `padding:5px 8px;border-bottom:1px solid rgba(0,0,0,0.06);text-align:center;font-weight:700;color:${trendColor};` },
        ];

        for (const cell of cells) {
          const td = document.createElement('td');
          td.style.cssText = cell.style;
          td.textContent = cell.text;
          tr.appendChild(td);
        }

        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      details.appendChild(table);
    }

    section.appendChild(details);
    return section;
  }

  /**
   * Open the Work Samples modal for a goal on the Progress tab.
   * Modal body is built entirely using DOM API — no innerHTML with user data.
   */
  async function openProgressSamplesModal(goalCode, studentCode) {
    const goal = allGoals.find(g => g.code === goalCode && g.student_code === studentCode);
    const student = allStudents.find(s => s.code === studentCode);
    if (!goal || !student) {
      await rcAlert('Error', 'Goal or student not found');
      return;
    }

    // Fetch submissions and assignments for work samples
    let submissionsData = [];
    let assignmentsData = [];
    let mappingsData = [];
    try {
      [submissionsData, assignmentsData, mappingsData] = await Promise.all([
        db.listSubmissions ? db.listSubmissions({ studentCode }) : Promise.resolve([]),
        db.listAssignments ? db.listAssignments() : Promise.resolve([]),
        db.listAssignmentGoalMappings ? db.listAssignmentGoalMappings({ studentCode }) : Promise.resolve([]),
      ]);
    } catch (_e) {
      // Work samples are optional; silently continue with empty arrays
    }

    const mappedIds = (mappingsData || [])
      .filter(m => m.goal_code === goalCode && m.student_code === studentCode)
      .map(m => m.assignment_id);
    const relevantSubs = (submissionsData || []).filter(sub =>
      sub.student_code === studentCode && mappedIds.includes(sub.assignment_id)
    );

    // Build modal using DOM API — all user strings go through textContent
    const body = document.createElement('div');

    const titleEl = stEl('h3');
    titleEl.style.marginTop = '0';
    // Goal code and desc via textContent
    titleEl.textContent = goal.code + ' — ' + (goal.desc || '');
    body.appendChild(titleEl);

    const mkPara = (label, value) => {
      const p = document.createElement('p');
      const strong = stEl('strong', null, label + ': ');
      p.appendChild(strong);
      p.appendChild(document.createTextNode(value));
      return p;
    };

    body.appendChild(mkPara('Student', (student.name || student.code) + ' (' + student.code + ')'));
    body.appendChild(mkPara('Goal Area', goal.goal_area || 'Uncategorized'));
    body.appendChild(mkPara('Baseline', goal.baseline != null ? String(goal.baseline) : 'N/A'));
    body.appendChild(mkPara('Target', goal.target != null ? String(goal.target) : 'N/A'));

    // Work samples section header
    const samplesH4 = stEl('h4', null, 'Work Samples');
    samplesH4.style.marginTop = '20px';
    body.appendChild(samplesH4);

    if (relevantSubs.length === 0) {
      const noSamples = stEl('div', 'dt-sample-item');
      noSamples.appendChild(stEl('p', null, 'No work samples found for this goal'));
      const hint = stEl('p');
      hint.style.cssText = 'font-size:13px;opacity:0.7;';
      hint.textContent = 'Work samples appear here when assignments are mapped to this IEP goal and the student submits them.';
      noSamples.appendChild(hint);
      body.appendChild(noSamples);
    } else {
      relevantSubs.forEach(sub => {
        const assignment = (assignmentsData || []).find(a => a.id === sub.assignment_id);
        const item = stEl('div', 'dt-sample-item');

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:8px;';
        const titleStrong = stEl('strong');
        titleStrong.textContent = assignment ? (assignment.title || 'Untitled') : `Assignment ${sub.assignment_id}`;
        const dateSpan = document.createElement('span');
        dateSpan.style.opacity = '0.8';
        dateSpan.textContent = sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : 'N/A';
        topRow.appendChild(titleStrong);
        topRow.appendChild(dateSpan);
        item.appendChild(topRow);

        const scoreDiv = document.createElement('div');
        scoreDiv.style.cssText = 'font-size:13px;opacity:0.85;margin-bottom:4px;';
        const scoreLabel = stEl('strong', null, 'Score: ');
        const scoreText = document.createTextNode(sub.score_total != null ? sub.score_total + '%' : 'Not graded');
        scoreDiv.appendChild(scoreLabel);
        scoreDiv.appendChild(scoreText);
        item.appendChild(scoreDiv);

        const idDiv = document.createElement('div');
        idDiv.style.cssText = 'font-size:13px;opacity:0.7;';
        const idEm = document.createElement('em');
        idEm.textContent = 'Submission ID: ' + (sub.submission_id || sub.id || '');
        idDiv.appendChild(idEm);
        item.appendChild(idDiv);

        body.appendChild(item);
      });
    }

    // ── Question Breakdown section ──────────────────────────────────────────
    const breakdownSection = buildQuestionBreakdownEl(goalCode, studentCode, mappingsData, submissionsData, assignmentsData);
    body.appendChild(breakdownSection);

    // Create and show modal
    const modal = createModal('Work Samples', '');
    // Replace the empty modal body content with our DOM-built content
    const modalBodyEl = modal.querySelector('.st-modal-body');
    if (modalBodyEl) {
      modalBodyEl.innerHTML = '';
      modalBodyEl.appendChild(body);
    }
    document.body.appendChild(modal);
  }

  /**
   * Render the Progress tab for a student.
   * Returns a DOM element — NOT an HTML string — so no innerHTML with user data occurs.
   */
  async function renderStudentProgressTab(student, studentGoals) {
    const activeGoals = studentGoals.filter(g => g.status !== 'archived');
    const quarter = progressTabQuarterMap.get(student.code) || getCurrentQuarter();

    const wrapper = document.createElement('div');
    wrapper.dataset.progressStudent = student.code;

    // ── Actions row ─────────────────────────────────────────────────────────
    const actionsBar = stEl('div', 'dt-progress-actions');

    const exportBtn = stEl('button', 'dt-btn');
    exportBtn.textContent = '⬇ Export CSV';
    exportBtn.addEventListener('click', () => {
      exportStudentProgressCsv(student, activeGoals, quarter);
    });
    actionsBar.appendChild(exportBtn);

    const bulkBtn = stEl('button', 'dt-btn');
    bulkBtn.textContent = '+ Bulk Add Progress';
    bulkBtn.addEventListener('click', async () => {
      await rcAlert('Coming Soon', 'Bulk Add Progress feature coming soon!\n\nThis will allow you to quickly add progress data for multiple goals at once.');
    });
    actionsBar.appendChild(bulkBtn);

    wrapper.appendChild(actionsBar);

    // ── Quarter picker ───────────────────────────────────────────────────────
    const qBar = stEl('div', 'dt-quarter-bar');
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
      const btn = stEl('button', `dt-q-btn${q === quarter ? ' active' : ''}`);
      btn.textContent = q;
      btn.addEventListener('click', async () => {
        progressTabQuarterMap.set(student.code, q);
        // Re-render only the progress tab content
        selectedDetailTabMap.set(student.code, 'progress');
        await renderExpandedDetail(student.code);
      });
      qBar.appendChild(btn);
    });
    wrapper.appendChild(qBar);

    // ── Goal rows ────────────────────────────────────────────────────────────
    if (activeGoals.length === 0) {
      const empty = stEl('div', null, 'No active IEP goals found for this student.');
      empty.style.cssText = 'padding:20px;opacity:0.7;';
      wrapper.appendChild(empty);
      return wrapper;
    }

    activeGoals.forEach((goal, idx) => {
      const entries = getProgressEntriesForTab(student.code, goal.code, quarter);
      const rowEl = buildProgressGoalRowEl(goal, entries, student.code, idx);
      wrapper.appendChild(rowEl);
    });

    // ── Wire event handlers ──────────────────────────────────────────────────

    // Samples buttons
    wrapper.querySelectorAll('[data-action="open-samples"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openProgressSamplesModal(btn.dataset.goal, btn.dataset.student);
      });
    });

    // "Add Data Point" buttons — show inline form
    wrapper.querySelectorAll('[data-action="show-add-form"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const goalCode = btn.dataset.goal;
        const studentCode = btn.dataset.student;
        const goalRow = wrapper.querySelector(`.dt-goal-row[data-goal="${CSS.escape(goalCode)}"][data-student="${CSS.escape(studentCode)}"]`);
        if (!goalRow) return;
        const form = goalRow.querySelector('.dt-inline-form');
        if (!form) return;
        form.querySelector('.dt-date-input').value = todayISO();
        form.querySelector('.dt-value-input').value = '';
        form.style.display = 'flex';
        setTimeout(() => form.querySelector('.dt-value-input').focus(), 100);
      });
    });

    // Inline form save / cancel
    wrapper.querySelectorAll('.dt-inline-form').forEach(form => {
      const goalCode = form.dataset.goal;
      const studentCode = form.dataset.student;
      const saveBtn = form.querySelector('.dt-save-btn');
      const cancelBtn = form.querySelector('.dt-cancel-btn');
      const dateInput = form.querySelector('.dt-date-input');
      const valueInput = form.querySelector('.dt-value-input');

      const doSave = async () => {
        if (!dateInput.value) { await rcAlert('Validation', 'Please select a date for this data point'); return; }
        const numValue = parseFloat(valueInput.value);
        if (isNaN(numValue) || numValue < 0 || numValue > 100) {
          await rcAlert('Validation', 'Please enter a numeric value between 0 and 100');
          return;
        }
        try {
          await db.upsertGoalProgress({ goal_code: goalCode, student_code: studentCode, date: dateInput.value, value: numValue, source: 'manual' });
          await reloadProgressEntries();
          selectedDetailTabMap.set(studentCode, 'progress');
          await renderExpandedDetail(studentCode);
        } catch (err) {
          await rcAlert('Error', 'Failed to add data point: ' + err.message);
        }
      };

      saveBtn.addEventListener('click', e => { e.stopPropagation(); doSave(); });
      cancelBtn.addEventListener('click', e => {
        e.stopPropagation();
        form.style.display = 'none';
        if (valueInput) valueInput.value = '';
      });
      valueInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doSave(); }
        else if (e.key === 'Escape') { e.preventDefault(); form.style.display = 'none'; }
      });
    });

    // Inline cell editing (non-observation goals only)
    wrapper.querySelectorAll('.dt-data-value.editable').forEach(cell => {
      cell.addEventListener('click', e => {
        e.stopPropagation();
        if (document.querySelector('.dt-data-value.editing')) return;

        const currentValue = parseFloat(cell.dataset.value);
        const entryId = cell.dataset.entryId;
        const goalCode = cell.dataset.goal;
        const studentCode = cell.dataset.student;

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '100';
        input.step = '1';
        input.value = isNaN(currentValue) ? '' : currentValue;

        const originalContent = cell.textContent;
        cell.textContent = '';
        cell.appendChild(input);
        cell.classList.add('editing');
        input.focus();
        input.select();

        const doCancel = () => {
          cell.classList.remove('editing');
          cell.textContent = originalContent;
        };

        const doSave = async () => {
          const newValue = parseFloat(input.value);
          if (isNaN(newValue) || newValue < 0 || newValue > 100) {
            await rcAlert('Validation', 'Please enter a numeric value between 0 and 100');
            input.focus();
            return;
          }
          if (newValue === currentValue) { doCancel(); return; }

          cell.classList.add('saving');
          input.disabled = true;
          try {
            const entry = allProgressEntries.find(p => p.id === entryId);
            if (!entry) throw new Error('Entry not found');
            await db.upsertGoalProgress({ goal_code: goalCode, student_code: studentCode, date: entry.date, value: newValue, source: entry.source || 'manual' });
            await reloadProgressEntries();
            selectedDetailTabMap.set(studentCode, 'progress');
            await renderExpandedDetail(studentCode);
          } catch (err) {
            await rcAlert('Error', 'Failed to update data point: ' + err.message);
            cell.classList.remove('saving', 'editing');
            cell.textContent = originalContent;
            input.disabled = false;
          }
        };

        input.addEventListener('blur', doSave);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); doSave(); }
          else if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); input.value = Math.min(100, parseFloat(input.value || 0) + (e.shiftKey ? 5 : 1)); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); input.value = Math.max(0, parseFloat(input.value || 0) - (e.shiftKey ? 5 : 1)); }
        });
      });
    });

    return wrapper;
  }

  // ── END PROGRESS TAB ──────────────────────────────────────────────────────

  // ── SCHEDULE TAB ──────────────────────────────────────────────────────────

  const SCHEDULE_KEY = 'rc_data_schedule';

  function getScheduleFrequency(studentCode, goalCode) {
    const schedules = JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '{}');
    return schedules[`${studentCode}_${goalCode}`] || 'quarterly';
  }

  function setScheduleFrequency(studentCode, goalCode, frequency) {
    const schedules = JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '{}');
    schedules[`${studentCode}_${goalCode}`] = frequency;
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedules));
  }

  function calcNextDue(lastCollected, frequency) {
    if (!lastCollected) {
      return new Date();
    }
    const next = new Date(lastCollected);
    switch (frequency) {
      case 'weekly':   next.setDate(next.getDate() + 7); break;
      case 'biweekly': next.setDate(next.getDate() + 14); break;
      case 'monthly':  next.setMonth(next.getMonth() + 1); break;
      case 'quarterly':
      default:         next.setMonth(next.getMonth() + 3); break;
    }
    return next;
  }

  function calcCollectionStatus(nextDue) {
    const now = new Date();
    const daysUntil = Math.floor((nextDue - now) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0)    return { status: 'overdue',   icon: '🔴', label: 'Overdue',   days: Math.abs(daysUntil) };
    if (daysUntil <= 3)   return { status: 'due_soon',  icon: '🟡', label: 'Due Soon',  days: daysUntil };
    return                       { status: 'on_track',  icon: '🟢', label: 'On Track',  days: daysUntil };
  }

  /**
   * Render the Schedule tab for a student.
   * Returns a DOM element — NOT an HTML string — to avoid CodeQL innerHTML violations.
   */
  function renderStudentScheduleTab(student, studentGoals) {
    const activeGoals = studentGoals.filter(g => g.status !== 'archived');

    const wrapper = document.createElement('div');
    wrapper.className = 'dt-schedule-tab';

    // ── This Week section ────────────────────────────────────────────────────
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Build schedule items
    const scheduleItems = activeGoals.map(goal => {
      const frequency = getScheduleFrequency(student.code, goal.code);
      const entries = getProgressForGoal(student.code, goal.code)
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      const lastCollected = entries.length > 0 ? entries[0].date : null;
      const nextDue = calcNextDue(lastCollected, frequency);
      const statusInfo = calcCollectionStatus(nextDue);
      return { goal, frequency, lastCollected, nextDue, statusInfo };
    });

    const thisWeekItems = scheduleItems.filter(item => item.nextDue <= weekFromNow);
    thisWeekItems.sort((a, b) => a.nextDue - b.nextDue);
    scheduleItems.sort((a, b) => a.nextDue - b.nextDue);

    // "This Week" box
    const thisWeekBox = document.createElement('div');
    thisWeekBox.style.cssText = 'background:rgba(0,0,0,0.25);border:1px solid var(--rc-glass-border);border-radius:var(--rc-radius-sm);padding:14px;margin-bottom:16px;';

    const thisWeekTitle = document.createElement('div');
    thisWeekTitle.style.cssText = 'font-weight:600;margin-bottom:10px;font-size:14px;';
    thisWeekTitle.textContent = '📅 This Week';
    thisWeekBox.appendChild(thisWeekTitle);

    if (thisWeekItems.length === 0) {
      const noItems = document.createElement('p');
      noItems.style.cssText = 'margin:0;opacity:0.7;font-size:13px;';
      noItems.textContent = 'No data collection due this week — all goals are on track!';
      thisWeekBox.appendChild(noItems);
    } else {
      thisWeekItems.forEach(item => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px;margin-bottom:8px;border-radius:8px;background:rgba(0,0,0,0.2);';

        const infoDiv = document.createElement('div');

        const goalStrong = document.createElement('strong');
        goalStrong.textContent = item.goal.code;
        infoDiv.appendChild(goalStrong);

        if (item.goal.goal_area) {
          const areaSpan = document.createTextNode(' — ' + item.goal.goal_area);
          infoDiv.appendChild(areaSpan);
        }

        const dueSmall = document.createElement('small');
        dueSmall.style.cssText = 'display:block;opacity:0.7;margin-top:2px;';
        if (item.statusInfo.status === 'overdue') {
          dueSmall.textContent = item.statusInfo.days + ' day' + (item.statusInfo.days !== 1 ? 's' : '') + ' overdue';
        } else {
          dueSmall.textContent = 'Due in ' + item.statusInfo.days + ' day' + (item.statusInfo.days !== 1 ? 's' : '');
        }
        infoDiv.appendChild(dueSmall);

        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display:flex;align-items:center;gap:8px;';

        const statusSpan = document.createElement('span');
        statusSpan.textContent = item.statusInfo.icon;
        actionsDiv.appendChild(statusSpan);

        const collectBtn = document.createElement('button');
        collectBtn.className = 'dt-btn primary';
        collectBtn.textContent = 'Collect Now';
        collectBtn.dataset.scheduleCollectGoal = item.goal.code;
        actionsDiv.appendChild(collectBtn);

        row.appendChild(infoDiv);
        row.appendChild(actionsDiv);
        thisWeekBox.appendChild(row);
      });
    }
    wrapper.appendChild(thisWeekBox);

    // ── Full Schedule table ──────────────────────────────────────────────────
    if (activeGoals.length === 0) {
      const empty = stEl('div', null, 'No active IEP goals found for this student.');
      empty.style.cssText = 'padding:20px;opacity:0.7;';
      wrapper.appendChild(empty);
      return wrapper;
    }

    const tableWrap = document.createElement('div');
    tableWrap.className = 'dt-data-grid';

    const table = document.createElement('table');
    table.className = 'dt-data-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Goal', 'Frequency', 'Last Collected', 'Next Due', 'Status', 'Actions'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');

    scheduleItems.forEach(item => {
      const tr = document.createElement('tr');

      // Goal cell
      const goalTd = document.createElement('td');
      goalTd.style.textAlign = 'left';
      const goalCodeStrong = document.createElement('strong');
      goalCodeStrong.textContent = item.goal.code;
      goalTd.appendChild(goalCodeStrong);
      if (item.goal.goal_area) {
        const areaBr = document.createElement('br');
        goalTd.appendChild(areaBr);
        const areaSmall = document.createElement('small');
        areaSmall.style.opacity = '0.7';
        areaSmall.textContent = item.goal.goal_area;
        goalTd.appendChild(areaSmall);
      }
      tr.appendChild(goalTd);

      // Frequency dropdown cell
      const freqTd = document.createElement('td');
      const freqSelect = document.createElement('select');
      freqSelect.className = 'dt-search-input';
      freqSelect.style.cssText = 'padding:6px 8px;font-size:13px;width:auto;';
      freqSelect.dataset.scheduleGoal = item.goal.code;
      const freqOptions = [
        { value: 'weekly',    label: 'Weekly' },
        { value: 'biweekly',  label: 'Biweekly' },
        { value: 'monthly',   label: 'Monthly' },
        { value: 'quarterly', label: 'Quarterly' },
      ];
      freqOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (item.frequency === opt.value) option.selected = true;
        freqSelect.appendChild(option);
      });
      freqTd.appendChild(freqSelect);
      tr.appendChild(freqTd);

      // Last Collected cell
      const lastTd = document.createElement('td');
      lastTd.textContent = item.lastCollected
        ? new Date(item.lastCollected).toLocaleDateString()
        : 'Never';
      tr.appendChild(lastTd);

      // Next Due cell
      const nextTd = document.createElement('td');
      nextTd.textContent = item.nextDue.toLocaleDateString();
      tr.appendChild(nextTd);

      // Status cell
      const statusTd = document.createElement('td');
      const statusIcon = document.createElement('span');
      statusIcon.textContent = item.statusInfo.icon + ' ';
      const statusLabel = document.createElement('span');
      statusLabel.textContent = item.statusInfo.label;
      statusTd.appendChild(statusIcon);
      statusTd.appendChild(statusLabel);
      tr.appendChild(statusTd);

      // Actions cell
      const actionsTd = document.createElement('td');
      const collectNowBtn = document.createElement('button');
      collectNowBtn.className = 'dt-btn primary';
      collectNowBtn.textContent = 'Collect Now';
      collectNowBtn.dataset.scheduleCollectGoal = item.goal.code;
      actionsTd.appendChild(collectNowBtn);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrapper.appendChild(tableWrap);

    // ── Wire event handlers ──────────────────────────────────────────────────

    // Frequency dropdown changes
    wrapper.querySelectorAll('[data-schedule-goal]').forEach(select => {
      select.addEventListener('change', () => {
        setScheduleFrequency(student.code, select.dataset.scheduleGoal, select.value);
        // Re-render the schedule tab to reflect the new frequency
        selectedDetailTabMap.set(student.code, 'schedule');
        renderExpandedDetail(student.code).catch(err => {
          console.warn('[tc-students] Schedule tab re-render failed:', err);
        });
      });
    });

    // "Collect Now" buttons — jump to Progress tab and open Add Data Point for this goal
    wrapper.querySelectorAll('[data-schedule-collect-goal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const goalCode = btn.dataset.scheduleCollectGoal;
        // Switch to Progress tab
        selectedDetailTabMap.set(student.code, 'progress');
        renderExpandedDetail(student.code).then(() => {
          // After rendering, trigger the Add Data Point form for the specified goal
          const container = document.getElementById(`stExpandedDetail-${student.code}`);
          if (!container) return;
          const addBtn = container.querySelector(`.dt-goal-row[data-goal="${CSS.escape(goalCode)}"] [data-action="show-add-form"]`);
          if (addBtn) addBtn.click();
        }).catch(err => {
          console.warn('[tc-students] Schedule Collect Now navigation failed:', err);
        });
      });
    });

    return wrapper;
  }

  // ── END SCHEDULE TAB ──────────────────────────────────────────────────────

  function renderClassFilterOptions() {
    const selectEl = document.getElementById('stClassFilter');
    if (!selectEl) return;

    const options = ['All', ...FULL_CLASS_NAMES].map(className => `
      <option value="${escapeHtml(className)}" ${selectedClassFilter === className ? 'selected' : ''}>
        ${className === 'All' ? 'All Classes' : escapeHtml(className)}
      </option>
    `).join('');

    selectEl.innerHTML = options;
  }

  function renderGoalAreaFilterOptions() {
    const selectEl = document.getElementById('stGoalAreaFilter');
    if (!selectEl) return;

    const options = ['All', ...GOAL_AREAS].map(area => `
      <option value="${escapeHtml(area)}" ${selectedGoalAreaFilter === area ? 'selected' : ''}>
        ${area === 'All' ? 'All Goal Areas' : escapeHtml(area)}
      </option>
    `).join('');

    selectEl.innerHTML = options;
  }

  /**
   * Check for active tokens for goals
   */
  async function checkActiveTokens(studentCode) {
    try {
      const tokens = await db.listDataEntryTokens(studentCode);
      const tokensByGoalCode = {};
      tokens.forEach(token => {
        tokensByGoalCode[token.goal_code] = token;
      });
      return tokensByGoalCode;
    } catch (err) {
      // Silently return empty object for all errors
      // The data_entry_tokens table may not exist yet, which is expected
      return {};
    }
  }

  /**
   * Handle copy data entry link
   */
  async function handleCopyDataEntryLink(goalId) {
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) {
      await rcAlert('Error', 'Goal not found');
      return;
    }

    const student = allStudents.find(s => s.code === goal.student_code);
    if (!student) {
      await rcAlert('Error', 'Student not found');
      return;
    }

    try {
      // Create token
      const tokenData = await db.createDataEntryToken({
        studentCode: student.code,
        goalCode: goal.code,
        dataCollector: goal.data_collector,
        dataCollectorEmail: goal.data_collector_email
      });

      // Build URL
      const url = `${window.location.origin}/data-entry/?token=${tokenData.token}`;

      // Copy to clipboard
      await navigator.clipboard.writeText(url);

      // Show toast notification
      showToast(`Link copied! Send it to ${goal.data_collector}.`);

      // Refresh display to show revoke button
      if (goal.student_code && expandedStudents.has(goal.student_code)) {
        await renderExpandedDetail(goal.student_code);
      }

    } catch (err) {
      console.error('[tc-students] Error creating token:', err);
      await rcAlert('Error', 'Error creating data entry link. Please try again.');
    }
  }

  /**
   * Handle revoke data entry link
   */
  async function handleRevokeDataEntryLink(goalId) {
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) {
      await rcAlert('Error', 'Goal not found');
      return;
    }

    const confirmed = await showConfirmModal(
      'Revoke Data Entry Link',
      `Revoke data entry link for ${goal.code}?\n\nThe current link will no longer work.`,
      'Revoke',
      { danger: true }
    );
    if (!confirmed) return;

    try {
      // Get active tokens for this student
      const student = allStudents.find(s => s.code === goal.student_code);
      const tokens = await db.listDataEntryTokens(student.code);
      const token = tokens.find(t => t.goal_code === goal.code);

      if (!token) {
        await rcAlert('Error', 'No active token found for this goal');
        return;
      }

      // Revoke token
      await db.revokeDataEntryToken(token.id);

      showToast('Link revoked successfully');

      // Refresh display to show copy button
      if (goal.student_code && expandedStudents.has(goal.student_code)) {
        await renderExpandedDetail(goal.student_code);
      }

    } catch (err) {
      console.error('[tc-students] Error revoking token:', err);
      await rcAlert('Error', 'Error revoking link. Please try again.');
    }
  }

  /**
   * Show toast notification
   */
  function showToast(message) {
    // Create toast element
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(34, 197, 94, 0.95);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      font-size: 14px;
      max-width: 300px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }

  /**
   * Show error toast notification (red, with inline SVG alert icon)
   */
  function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(239, 68, 68, 0.95);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      font-size: 14px;
      max-width: 320px;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    const svgNS = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(svgNS, 'svg');
    icon.setAttribute('width', '16');
    icon.setAttribute('height', '16');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.5');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
    toast.appendChild(icon);
    toast.appendChild(document.createTextNode(message));
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 4000);
  }

  /**
   * Show a persistent offline warning banner at the top of the Students page.
   * Uses rc-theme.css design tokens and an inline SVG wifi-off icon.
   */
  function showOfflineBanner() {
    if (offlineBannerEl) return;
    offlineBannerEl = document.createElement('div');
    offlineBannerEl.id = 'stOfflineBanner';
    offlineBannerEl.className = 'rc-card';
    offlineBannerEl.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      border-color: var(--rc-warning);
      background: rgba(245, 158, 11, 0.08);
      padding: 12px 20px;
      margin: 8px 20px;
      border-radius: 8px;
      font-size: 14px;
      color: var(--rc-warning, #f59e0b);
      box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.3);
    `;
    const svgNS = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(svgNS, 'svg');
    icon.setAttribute('width', '20');
    icon.setAttribute('height', '20');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.5');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.flexShrink = '0';
    icon.innerHTML = '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.56 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line>';
    const text = document.createElement('span');
    text.textContent = 'You appear to be offline. Changes may not be saved until your connection is restored.';
    offlineBannerEl.appendChild(icon);
    offlineBannerEl.appendChild(text);
    const main = document.querySelector('.tc-main');
    if (main) main.insertBefore(offlineBannerEl, main.firstChild);
  }

  /**
   * Remove the offline warning banner and show a brief "Back online" success toast.
   */
  function hideOfflineBanner() {
    if (offlineBannerEl) {
      offlineBannerEl.remove();
      offlineBannerEl = null;
    }
    showToast('Back online. Your connection has been restored.');
  }

  /**
   * Show a temporary undo toast after a Quick Entry save.
   * @param {Array<{studentCode, goalCode, previousValue, previousDate, savedDate}>} snapshot
   */
  function showUndoToast(snapshot) {
    // Dismiss any existing undo toast
    const existingToast = document.getElementById('stUndoToast');
    if (existingToast) {
      existingToast.remove();
      clearTimeout(undoToastTimer);
    }
    pendingUndo = snapshot;

    const UNDO_DELAY_MS = 5000;
    const toast = document.createElement('div');
    toast.id = 'stUndoToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      opacity: 0;
      background: var(--rc-glass, rgba(15, 23, 42, 0.92));
      border: 1px solid var(--rc-glass-border, rgba(255, 255, 255, 0.1));
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 12px 18px;
      z-index: 10001;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      color: var(--rc-ink, #e2e8f0);
      min-width: 260px;
      transition: transform 0.25s ease, opacity 0.25s ease;
      overflow: hidden;
    `;

    // SVG rotate-ccw (undo) icon
    const svgNS = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(svgNS, 'svg');
    icon.setAttribute('width', '16');
    icon.setAttribute('height', '16');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.5');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.4"></path>';

    const count = snapshot.length;
    const label = document.createElement('span');
    label.textContent = `${count} entr${count === 1 ? 'y' : 'ies'} saved`;

    // Progress bar (counts down over UNDO_DELAY_MS)
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      background: var(--rc-brand, #22c55e);
      border-radius: 0 0 0 12px;
      width: 100%;
      transition: width ${UNDO_DELAY_MS}ms linear;
    `;

    const undoBtn = document.createElement('button');
    undoBtn.className = 'rc-btn';
    undoBtn.style.cssText = 'padding: 5px 12px; font-size: 13px; margin-left: auto; flex-shrink: 0;';
    const undoBtnIcon = document.createElementNS(svgNS, 'svg');
    undoBtnIcon.setAttribute('width', '13');
    undoBtnIcon.setAttribute('height', '13');
    undoBtnIcon.setAttribute('viewBox', '0 0 24 24');
    undoBtnIcon.setAttribute('fill', 'none');
    undoBtnIcon.setAttribute('stroke', 'currentColor');
    undoBtnIcon.setAttribute('stroke-width', '1.5');
    undoBtnIcon.setAttribute('stroke-linecap', 'round');
    undoBtnIcon.setAttribute('stroke-linejoin', 'round');
    undoBtnIcon.setAttribute('aria-hidden', 'true');
    undoBtnIcon.innerHTML = '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.4"></path>';
    undoBtn.appendChild(undoBtnIcon);
    undoBtn.appendChild(document.createTextNode('Undo'));

    undoBtn.addEventListener('click', async () => {
      if (!pendingUndo) return;
      clearTimeout(undoToastTimer);
      const entries = pendingUndo;
      pendingUndo = null;
      toast.remove();
      // Restore each saved entry with its pre-save value
      let undone = 0;
      for (const snap of entries) {
        if (snap.previousValue !== null && snap.previousDate) {
          try {
            await db.upsertGoalProgress({
              goal_code:    snap.goalCode,
              student_code: snap.studentCode,
              date:         snap.previousDate,
              value:        snap.previousValue,
              source:       'manual',
            });
            undone++;
          } catch (err) {
            console.error('[tc-students] Undo failed for entry:', snap, err);
          }
        }
      }
      await reloadProgressEntries();
      filterStudents();
      await renderStudentList();
      renderStudentKpiSummary();
      renderCollectNudge();
      if (undone > 0) {
        showToast('Entry undone.');
      } else {
        showErrorToast('Nothing to undo (no prior values found).');
      }
    });

    toast.appendChild(icon);
    toast.appendChild(label);
    toast.appendChild(undoBtn);
    toast.appendChild(progressBar);
    document.body.appendChild(toast);

    // Slide up animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';
        // Start progress bar countdown
        progressBar.style.width = '0%';
      });
    });

    undoToastTimer = setTimeout(() => {
      pendingUndo = null;
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      toast.style.opacity = '0';
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 250);
    }, UNDO_DELAY_MS);
  }

  function showObsToast(container, message, isError) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      ${isError
        ? 'background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.25);'
        : 'background: rgba(34,197,94,0.12); color: #22c55e; border: 1px solid rgba(34,197,94,0.25);'}
    `;
    toast.innerHTML = (isError ? ST_WARN_SVG : ST_CHECK_SVG) + ' ' + escapeHtml(message);
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // UI Constants for active state styling
  const ACTIVE_STATE_STYLES = {
    background: 'rgba(59, 130, 246, 0.2)',
    color: 'rgba(59, 130, 246, 1)',
    fontWeight: '600'
  };

  function updateExpandModeButtons() {
    const collapseAllBtn = document.getElementById('stExpandAllBtn');
    const expandStudentsBtn = document.getElementById('stExpandStudentsBtn');
    const expandAllFullBtn = document.getElementById('stExpandAllFullBtn');
    
    // Remove active state from all
    [collapseAllBtn, expandStudentsBtn, expandAllFullBtn].forEach(btn => {
      if (btn) {
        btn.style.background = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
      }
    });
    
    // Add active state to current mode
    if (expandMode === 'students' && expandStudentsBtn) {
      Object.assign(expandStudentsBtn.style, ACTIVE_STATE_STYLES);
    } else if (expandMode === 'all' && expandAllFullBtn) {
      Object.assign(expandAllFullBtn.style, ACTIVE_STATE_STYLES);
    }
  }

  function renderStudentClasses(student, enrollments) {
    const classItems = FULL_CLASS_NAMES.map(className => {
      const isEnrolled = enrollments.some(e => e.class_name === className);
      return `
        <div class="st-class-item">
          <span class="st-class-checkbox">${isEnrolled ? '✓' : ''}</span>
          <span class="st-class-name">${escapeHtml(className)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="st-detail-section">
        <div class="st-section-header">
          <h3>Classes</h3>
          <button class="st-btn st-btn-secondary" id="manage-enrollments-btn">Manage Enrollments</button>
        </div>
        <div class="st-class-list">
          ${classItems}
        </div>
      </div>
    `;
  }

  function renderStudentGoals(inContextGoals, outsideGoals, studentCode = null, masteredGoals = []) {
    const inContextHtml = inContextGoals.map(goal => renderGoalCard(goal)).join('');
    
    let outsideHtml = '';
    if (selectedClassFilter !== 'All' && outsideGoals.length > 0) {
      outsideHtml = `
        <div class="st-outside-categories">
          <details>
            <summary>Outside Categories (${outsideGoals.length} goals from other classes)</summary>
            <div class="st-goal-cards">
              ${outsideGoals.map(goal => renderGoalCard(goal)).join('')}
            </div>
          </details>
        </div>
      `;
    }

    // "Archive All Mastered" button — only shown when 2+ goals are mastered
    const svgArchive = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
    const archiveAllBtnHtml = masteredGoals.length >= 2 && studentCode ? `
      <button class="st-btn st-btn-small st-btn-archive-all"
        data-action="archive-all-mastered"
        data-student-code="${escapeHtml(studentCode)}"
        title="Archive all ${masteredGoals.length} mastered goals at once">
        ${svgArchive} Archive All Mastered (${masteredGoals.length})
      </button>
    ` : '';

    // Determine if the student truly has no goals (not just none visible in current filter)
    const hasNoGoalsAtAll = inContextGoals.length === 0 && outsideGoals.length === 0;

    // Helpful empty state for students with no IEP goals at all
    const noGoalsEmptyHtml = `
      <div class="st-empty" style="padding: 32px 20px;">
        <p style="margin: 0 0 12px 0; font-size: 15px; font-weight: 500;">No IEP goals have been set up yet.</p>
        <p style="margin: 0; font-size: 13px; opacity: 0.85; line-height: 1.6;">
          Use <strong>+ Add Goal</strong> above to add IEP goals, or view the
          <button class="st-tab st-inline-tab-link" data-tab="skills">Skills Summary</button>
          tab for assignment performance data and AI-generated goal recommendations.
        </p>
      </div>
    `;

    const goalsAreaHtml = inContextHtml || (hasNoGoalsAtAll ? noGoalsEmptyHtml : '<div class="st-empty">No goals in this category</div>');

    return `
      <div class="st-detail-section">
        <div class="st-section-header">
          <h3>IEP Goals</h3>
          ${selectedGoalAreaFilter !== 'All' ? `<span class="st-badge" style="background: ${ACTIVE_STATE_STYLES.background}; color: ${ACTIVE_STATE_STYLES.color}; margin-left: 8px;">Filtered: ${escapeHtml(selectedGoalAreaFilter)}</span>` : ''}
          <div class="st-section-actions">
            ${archiveAllBtnHtml}
            <button class="st-btn st-btn-primary" id="add-goal-btn">+ Add Goal</button>
          </div>
        </div>
        <div class="st-goal-cards">
          ${goalsAreaHtml}
        </div>
        ${outsideHtml}
      </div>
    `;
  }

  function renderGoalCard(goal) {
    // Check if we're in inline edit mode for this goal
    if (editingGoalId === goal.id) {
      return renderGoalEditForm(goal);
    }

    // Check if we're in data entry mode for this goal
    if (enteringDataGoalId === goal.id) {
      return renderGoalCardWithDataEntry(goal);
    }

    const icon = GOAL_AREA_ICONS[goal.goal_area] || SVG_ICON_CLIPBOARD;
    const dataCollectorWarning = goal.data_collector && goal.data_collector !== 'Dan Reinisch' ? SVG_STATUS_WARN + ' ' : '';
    const classContext = goal.class_context ? `<div class="st-goal-class">${SVG_ICON_BOOK} ${escapeHtml(goal.class_context)}</div>` : '';
    
    // Show token management for external data collectors (not Dan Reinisch)
    const showTokenBtn = goal.data_collector && goal.data_collector !== 'Dan Reinisch';
    const hasActiveToken = goal._hasActiveToken || false;
    
    // Get color category for the goal area
    const colorCategory = goalAreaToColorCategory(goal.goal_area);
    
    // Handle description truncation — clean up any "Baseline: XX%" text that leaked into the description field
    const fullDesc = (goal.desc || goal.goal_text || '(No goal description provided)').replace(/\s*Baseline:?\s*\d+%?\s*$/i, '').trim();
    const needsTruncation = fullDesc.length > 120;
    const descPreview = needsTruncation ? fullDesc.substring(0, 120) : fullDesc;
    
    const descHtml = needsTruncation
      ? `<div class="st-goal-description">
           <span class="st-desc-preview">${escapeHtml(descPreview)}…</span>
           <span class="st-desc-full" style="display:none">${escapeHtml(fullDesc)}</span>
           <button class="st-desc-toggle" style="background:none;border:none;color:rgba(59,130,246,1);cursor:pointer;font-size:13px;padding:0;margin-left:4px;">Show more</button>
         </div>`
      : `<div class="st-goal-description">${escapeHtml(fullDesc)}</div>`;

    // Get data collection status
    const lastDate = getLastProgressDate(goal.student_code, goal.code);
    const quarterProgress = getProgressThisQuarter(goal.student_code, goal.code);
    const dataStatus = getGoalDataStatus(goal.student_code, goal.code);

    const statusEmoji = dataStatus.status === 'ok' ? SVG_STATUS_OK : dataStatus.status === 'warning' ? SVG_STATUS_WARN : SVG_STATUS_BAD;
    const statusText = `${quarterProgress.length} of ${dataStatus.expected} this quarter`;
    const lastText = lastDate ? `Last: ${formatDate(lastDate)}` : 'No data yet';
    const sanitizedGoalId = goal.id.replace(/[^a-z0-9]/gi, '_');
    const statusCountId = `tc-goal-status-count-${sanitizedGoalId}`;
    const headerCountId = `tc-goal-header-count-${sanitizedGoalId}`;

    // Build collapsible progress detail section for this quarter
    const progressDetailId = `tc-goal-progress-${goal.id.replace(/[^a-z0-9]/gi, '_')}`;
    let progressDetailHtml = '';
    let progressToggleBtn = '';
    const isObs = goal.measurement_type === 'Observation';
    const obsCatForCard = isObs ? (goal.observation_config?.category || '') : '';

    if (quarterProgress.length > 0) {
      const sorted = [...quarterProgress].sort((a, b) => new Date(b.date) - new Date(a.date));
      let avgFormatted;
      let avgIsHtml = false;
      if (isObs) {
        // For Observation goals, show rolling summary instead of numeric average
        const numericEntries = sorted.filter(e => e.value !== null && e.value !== undefined);
        if (obsCatForCard === 'session_outcome') {
          const targetMet = goal.observation_config?.target_met ?? 3;
          const metCount = numericEntries.filter(e => parseFloat(e.value) === 100).length;
          const total = numericEntries.length;
          let rollingColor = '#6b7280';
          if (total > 0) {
            const diff = metCount - targetMet;
            if (diff >= 0) rollingColor = '#22c55e';
            else if (diff >= -1) rollingColor = '#f59e0b';
            else rollingColor = '#ef4444';
          }
          avgFormatted = `<span style="color:${rollingColor}">${metCount} of ${total} met</span>`;
          avgIsHtml = true;
        } else if (obsCatForCard === 'prompt_count') {
          const avgPc = numericEntries.length > 0
            ? numericEntries.reduce((s, e) => s + parseFloat(e.value), 0) / numericEntries.length
            : null;
          avgFormatted = avgPc !== null ? `avg ${Math.round(avgPc * 10) / 10} prompts` : '—';
        } else {
          const avg = numericEntries.length > 0
            ? numericEntries.reduce((s, e) => s + parseFloat(e.value), 0) / numericEntries.length
            : null;
          avgFormatted = avg !== null ? `${Math.round(avg * 10) / 10}%` : '—';
        }
      } else {
        const avg = sorted.reduce((sum, e) => sum + parseFloat(e.value || 0), 0) / sorted.length;
        avgFormatted = formatProgressValue(avg, goal.measurement_type);
      }
      const avgDisplay = avgIsHtml ? avgFormatted : escapeHtml(avgFormatted);
      progressDetailHtml = `
        <div class="st-goal-progress-detail" id="${progressDetailId}" hidden aria-hidden="true" style="padding:8px 0 4px;border-top:1px solid rgba(0,0,0,0.08);margin-top:6px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:4px;">Q${getCurrentQuarter().slice(1)} Progress — ${isObs ? '' : 'Avg: '}${avgDisplay}</div>
        </div>`;
      progressToggleBtn = `<button class="st-btn st-btn-small tc-progress-toggle-btn" data-progress-id="${progressDetailId}" data-goal-id="${goal.id}" aria-expanded="false" style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;">${SVG_VIEW_DATA}View Data</button>`;
    }

    // Empty state for observation goals with no data
    let obsEmptyState = '';
    if (isObs && quarterProgress.length === 0) {
      const periods = goal.observation_config?.class_periods;
      let periodDisplay = '';
      if (Array.isArray(periods) && periods.length > 0) {
        const periodBadges = periods.map(p =>
          `<span style="background:rgba(99,102,241,0.1);color:#818cf8;border:1px solid rgba(99,102,241,0.2);border-radius:4px;padding:1px 6px;font-size:11px;margin-left:3px;">${escapeHtml(p)}</span>`
        ).join('');
        periodDisplay = ' during' + periodBadges;
      }
      obsEmptyState = `<div style="font-size:12px;color:#6b7280;padding:6px 0;font-style:italic;">No observations recorded — data will be collected${periodDisplay}</div>`;
    }

    // Determine if this card should be collapsed
    const isExpanded = expandMode === 'all' || expandedGoalCards.has(goal.id);
    const collapsedClass = isExpanded ? '' : 'collapsed';

    // Build observation category badge (shown when measurement_type === 'Observation')
    let obsBadgeHtml = '';
    if (isObs && goal.observation_config?.category) {
      const catLabel = escapeHtml(obsCategoryLabel(goal.observation_config.category));
      const itemSuffix = goal.observation_config.category === 'behavior_checklist' && Array.isArray(goal.observation_config.sub_behaviors)
        ? ` · ${goal.observation_config.sub_behaviors.length} items`
        : '';
      obsBadgeHtml = `<span class="st-badge" style="background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.25);border-radius:6px;padding:2px 8px;font-size:11px;margin-left:4px;">${catLabel}${itemSuffix}</span>`;
    }

    const obsCardStyle = isObs ? ' style="border-left: 3px solid var(--rc-accent, #6366f1);"' : '';

    // Compute mastery / regression / stalled alert status for this goal
    const alertStatus = computeGoalAlertStatus(goal);

    // Build mastery banner HTML (shown below header, above body)
    let masteryBannerHtml = '';
    if (alertStatus.isMastered && !isMasteryDismissed(goal.code, goal.student_code)) {
      const avgDisplay = escapeHtml(formatProgressValue(alertStatus.avgValue, goal.measurement_type));
      const masteryDisplay = escapeHtml(String(goal.mastery || goal.target || ''));
      const consec = alertStatus.consecutiveAboveMastery;
      const currentDisplay = escapeHtml(formatProgressValue(alertStatus.currentNum, goal.measurement_type));
      masteryBannerHtml = `
        <div class="st-goal-mastery-banner st-goal-mastery-banner--mastered st-mastery-nudge-card">
          <div class="st-mastery-nudge-header">
            <span class="st-mastery-nudge-title">🎉 Mastery Reached</span>
            <button type="button" class="st-mastery-nudge-dismiss st-skill-callout-btn"
              data-action="dismiss-mastery"
              data-goal-code="${escapeHtml(goal.code)}"
              data-student-code="${escapeHtml(goal.student_code)}"
              title="Remind me in 7 days">×</button>
          </div>
          <div class="st-mastery-nudge-details">
            <span><strong>Goal:</strong> ${escapeHtml(goal.code)}</span>
            <span><strong>Target:</strong> ${masteryDisplay}</span>
            <span><strong>Current:</strong> ${currentDisplay}</span>
            <span style="opacity:0.75;">(avg ${avgDisplay} · ${consec} consecutive point${consec === 1 ? '' : 's'} above mastery)</span>
          </div>
          <div class="st-mastery-nudge-actions">
            <button type="button" class="st-btn st-btn-small st-skill-callout-btn"
              data-action="archive-goal"
              data-student-code="${escapeHtml(goal.student_code)}"
              data-goal-code="${escapeHtml(goal.code)}">📋 Archive Goal</button>
            <button type="button" class="st-btn st-btn-small st-skill-callout-btn"
              data-action="replace-goal-version"
              data-goal-id="${escapeHtml(goal.id)}"
              data-avg-value="${escapeHtml(String(Math.round(alertStatus.avgValue ?? 0)))}">🔄 Replace with Next Version</button>
          </div>
        </div>`;
    } else if (alertStatus.isApproachingMastery) {
      const avgDisplay = escapeHtml(formatProgressValue(alertStatus.avgValue, goal.measurement_type));
      const masteryDisplay = escapeHtml(String(goal.mastery || goal.target || ''));
      masteryBannerHtml = `
        <div class="st-goal-mastery-banner st-goal-mastery-banner--approaching">
          <span>⭐ Approaching Mastery — avg ${avgDisplay} vs ${masteryDisplay} target</span>
        </div>`;
    }

    // Build regression / stalled alert strip HTML
    let alertStripHtml = '';
    if (alertStatus.isRegressing) {
      const currentDisplay = escapeHtml(formatProgressValue(alertStatus.currentNum, goal.measurement_type));
      const baselineDisplay = escapeHtml(String(goal.baseline || ''));
      const recentPointCount = alertStatus.last3.length;
      const reason = alertStatus.isBelowBaseline
        ? `current ${currentDisplay} is below baseline ${baselineDisplay}`
        : `${recentPointCount} consecutive point${recentPointCount === 1 ? '' : 's'} show decline`;
      alertStripHtml = `
        <div class="st-goal-alert-strip st-goal-alert-strip--regressing">
          ⚠️ Regression detected — ${reason}
        </div>`;
    } else if (alertStatus.isStalled) {
      alertStripHtml = `
        <div class="st-goal-alert-strip st-goal-alert-strip--stalled">
          ⏸️ Progress stalled — last ${alertStatus.last3.length} point${alertStatus.last3.length === 1 ? '' : 's'} within a ${ALERT_STALLED_BAND}-point range
        </div>`;
    }

    return `
      <div class="st-goal-card ${collapsedClass}"${obsCardStyle} data-goal-id="${goal.id}" data-area="${colorCategory}">
        <div class="st-goal-header">
          <div class="st-goal-title-line">
            <span class="st-goal-icon">${icon}</span>
            <span class="st-goal-area-name">${escapeHtml(goal.goal_area || 'N/A')}</span>
            <span class="st-goal-code">${escapeHtml(goal.code || '')}</span>
            <span class="st-badge st-badge-measurement">${escapeHtml(goal.measurement_type || 'N/A')}</span>
            ${obsBadgeHtml}
            <span class="st-skill-gap-badge-placeholder" data-goal-code="${escapeHtml(goal.code)}" data-student-code="${escapeHtml(goal.student_code)}"></span>
          </div>
          <span class="st-goal-quarter-status">${statusEmoji} <span id="${headerCountId}" data-expected="${dataStatus.expected}" style="color:${getCountColor(quarterProgress.length, dataStatus.expected)}">${quarterProgress.length}/${dataStatus.expected}</span></span>
          <span class="st-goal-chevron">▶</span>
        </div>
        ${renderQuarterlyAverages(goal.student_code, goal.code, goal.id)}
        ${masteryBannerHtml}${alertStripHtml}
        <div class="st-goal-body">
          ${descHtml}
          <div class="st-goal-metrics">
            <div class="st-metric">
              <span class="st-metric-label">Baseline:</span>
              <span class="st-metric-value">${escapeHtml(goal.baseline || 'N/A')}</span>
            </div>
            <div class="st-metric">
              <span class="st-metric-label">Target:</span>
              <span class="st-metric-value">${escapeHtml(goal.target || 'N/A')}</span>
            </div>
          </div>
          <div class="st-goal-data-status">
            <div class="st-data-status-item">
              <span>${statusEmoji}</span>
              <span id="${statusCountId}">${statusText}</span>
            </div>
            <div class="st-data-status-item">
              <span>${SVG_ICON_CALENDAR}</span>
              <span>${lastText}</span>
            </div>
            ${progressToggleBtn ? `<div class="st-data-status-item" style="margin-left:auto;">${progressToggleBtn}</div>` : ''}
          </div>
          ${progressDetailHtml}
          ${obsEmptyState}
        </div>
        <div class="st-goal-meta">
          <div class="st-goal-manager">${SVG_ICON_USER}${escapeHtml(goal.case_manager || 'N/A')}</div>
          <div class="st-goal-collector">${dataCollectorWarning}${SVG_ICON_BAR_CHART}${escapeHtml(goal.data_collector || 'N/A')}</div>
          ${classContext}
        </div>
        <div class="st-goal-actions">
          <button class="st-btn st-btn-small st-btn-primary enter-data-btn" data-goal-id="${goal.id}">${SVG_ICON_BAR_CHART}Enter Data</button>
          <button class="st-btn st-btn-small st-btn-secondary edit-goal-btn" data-goal-id="${goal.id}">Edit</button>
          <button class="st-btn st-btn-small st-btn-danger archive-goal-btn" data-goal-id="${goal.id}">Archive</button>
          ${showTokenBtn ? `
            ${hasActiveToken 
              ? `<button class="st-btn st-btn-small st-btn-warning revoke-token-btn" data-goal-id="${goal.id}" title="Revoke data entry link">${SVG_ICON_TRASH}Revoke Link</button>`
              : `<button class="st-btn st-btn-small st-btn-primary copy-token-btn" data-goal-id="${goal.id}" title="Copy data entry link for ${escapeHtml(goal.data_collector)}">${SVG_ICON_LINK}Copy Link</button>`
            }
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderGoalCardWithDataEntry(goal) {
    const icon = GOAL_AREA_ICONS[goal.goal_area] || SVG_ICON_CLIPBOARD;
    const colorCategory = goalAreaToColorCategory(goal.goal_area);
    const fullDesc = goal.desc || goal.goal_text || '(No goal description provided)';
    
    // Get today's date in ISO format
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];
    
    // Render measurement-specific fields
    let measurementFields = '';
    if (goal.measurement_type === 'Accuracy' || goal.measurement_type === 'Percent') {
      measurementFields = `
        <div class="st-form-group">
          <label class="st-form-label">Measurement</label>
          <div class="st-accuracy-group">
            <input type="number" class="st-form-input" name="correct" placeholder="Correct" min="0" required />
            <span>out of</span>
            <input type="number" class="st-form-input" name="total" placeholder="Total" min="1" required />
            <span class="st-accuracy-result"></span>
          </div>
        </div>
      `;
    } else if (goal.measurement_type === 'Frequency') {
      measurementFields = `
        <div class="st-form-group">
          <label class="st-form-label">Count</label>
          <input type="number" class="st-form-input" name="count" placeholder="Number of occurrences" min="0" required />
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Time Period</label>
          <select class="st-form-select" name="time_period">
            <option value="per session">Per Session</option>
            <option value="per day">Per Day</option>
            <option value="per week">Per Week</option>
          </select>
        </div>
      `;
    } else if (goal.measurement_type === 'Duration') {
      measurementFields = `
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">Minutes</label>
            <input type="number" class="st-form-input" name="minutes" placeholder="0" min="0" required />
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Seconds</label>
            <input type="number" class="st-form-input" name="seconds" placeholder="0" min="0" max="59" />
          </div>
        </div>
      `;
    } else if (goal.measurement_type === 'Rate') {
      measurementFields = `
        <div class="st-form-group">
          <label class="st-form-label">Rate</label>
          <div class="st-accuracy-group">
            <input type="number" class="st-form-input" name="count" placeholder="Count" min="0" required />
            <span>per</span>
            <input type="number" class="st-form-input" name="minutes" placeholder="Minutes" min="1" required />
            <span>minutes</span>
          </div>
        </div>
      `;
    } else if (goal.measurement_type === 'Observation') {
      const obsCat = goal.observation_config?.category || '';
      const OBS_MET_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      const OBS_NOT_MET_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      const OBS_NOT_ADDRESSED_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
      const OBS_NOT_APPLICABLE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';

      if (obsCat === 'session_outcome') {
        const targetMet = goal.observation_config?.target_met ?? 3;
        const targetWindow = goal.observation_config?.target_window ?? 5;
        measurementFields = `
          <div class="st-form-group">
            <label class="st-form-label">Session Outcome</label>
            <div class="obs-response-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              <button type="button" class="obs-response-btn" data-response="met" style="display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border:1px solid rgba(0,0,0,0.12);border-radius:10px;background:#fff;cursor:pointer;font-size:13px;min-height:44px;">
                ${OBS_MET_SVG} Met
              </button>
              <button type="button" class="obs-response-btn" data-response="not_met" style="display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border:1px solid rgba(0,0,0,0.12);border-radius:10px;background:#fff;cursor:pointer;font-size:13px;min-height:44px;">
                ${OBS_NOT_MET_SVG} Not Met
              </button>
              <button type="button" class="obs-response-btn" data-response="not_addressed" style="display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border:1px solid rgba(0,0,0,0.12);border-radius:10px;background:#fff;cursor:pointer;font-size:13px;min-height:44px;">
                ${OBS_NOT_ADDRESSED_SVG} Not Addressed
              </button>
              <button type="button" class="obs-response-btn" data-response="not_applicable" style="display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border:1px solid rgba(0,0,0,0.12);border-radius:10px;background:#fff;cursor:pointer;font-size:13px;min-height:44px;">
                ${OBS_NOT_APPLICABLE_SVG} N/A
              </button>
            </div>
            <input type="hidden" name="obs_response" value="" />
            <div class="obs-rolling-inline" style="font-size:12px;color:#6b7280;margin-top:4px;">Target: ${escapeHtml(String(targetMet))} of ${escapeHtml(String(targetWindow))} sessions</div>
          </div>
        `;
      } else if (obsCat === 'tally') {
        measurementFields = `
          <div class="st-form-group">
            <label class="st-form-label">Tally</label>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <input type="number" class="st-form-input" name="obs_successful" placeholder="0" min="0" style="width:80px;" />
              <span style="font-size:13px;">of</span>
              <input type="number" class="st-form-input" name="obs_opportunities" placeholder="0" min="0" style="width:80px;" />
              <span style="font-size:13px;">opportunities</span>
              <span class="obs-tally-pct" style="font-size:13px;font-weight:600;color:#2563eb;"></span>
            </div>
          </div>
        `;
      } else if (obsCat === 'prompt_count') {
        const maxPrompts = goal.observation_config?.target_max_prompts ?? 2;
        const promptBtns = [0, 1, 2, 3, '4+'].map(val => {
          return `<button type="button" class="obs-prompt-count-btn" data-count="${val === '4+' ? 4 : val}" style="display:inline-flex;align-items:center;justify-content:center;min-width:48px;min-height:44px;padding:10px;border:1px solid rgba(0,0,0,0.12);border-radius:10px;background:#fff;cursor:pointer;font-size:14px;font-weight:600;">${escapeHtml(String(val))}</button>`;
        }).join('');
        measurementFields = `
          <div class="st-form-group">
            <label class="st-form-label">Prompt Count</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              ${promptBtns}
            </div>
            <input type="hidden" name="obs_prompt_count" value="" />
            <div class="obs-prompt-status" style="font-size:12px;color:#6b7280;">Target: ${escapeHtml(String(maxPrompts))} or fewer prompts</div>
          </div>
        `;
      } else if (obsCat === 'behavior_checklist') {
        const subBehaviors = Array.isArray(goal.observation_config?.sub_behaviors) ? goal.observation_config.sub_behaviors : [];
        const checkboxItems = subBehaviors.map((sb, idx) => `
          <label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;cursor:pointer;">
            <input type="checkbox" name="obs_behavior_${idx}" style="width:18px;height:18px;margin:0;cursor:pointer;accent-color:#22c55e;" />
            ${escapeHtml(sb)}
          </label>
        `).join('');
        const emptyMsg = subBehaviors.length === 0
          ? `<div style="font-size:12px;color:#6b7280;">No sub-behaviors configured for this goal.</div>`
          : '';
        measurementFields = `
          <div class="st-form-group">
            <label class="st-form-label">Behavior Checklist</label>
            ${emptyMsg}
            <div class="obs-checklist-items" data-total="${subBehaviors.length}">
              ${checkboxItems}
            </div>
            <div class="obs-checklist-summary-inline" style="font-size:12px;color:#6b7280;margin-top:4px;">0 of ${subBehaviors.length} demonstrated</div>
            <button type="button" class="st-btn st-btn-secondary st-btn-small obs-not-addressed-inline-btn" data-response="not_addressed" style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;">
              ${OBS_NOT_ADDRESSED_SVG} Not Addressed Today
            </button>
            <input type="hidden" name="obs_not_addressed" value="" />
          </div>
        `;
      } else {
        measurementFields = `
          <div class="st-form-group">
            <label class="st-form-label">Observation Value</label>
            <input type="number" class="st-form-input" name="value" placeholder="Enter value" />
          </div>
        `;
      }
    } else {
      measurementFields = `
        <div class="st-form-group">
          <label class="st-form-label">Value</label>
          <input type="number" class="st-form-input" name="value" placeholder="Enter value" required />
        </div>
      `;
    }
    
    return `
      <div class="st-goal-card" data-goal-id="${goal.id}" data-area="${colorCategory}">
        <div class="st-goal-header">
          <div class="st-goal-title-line">
            <span class="st-goal-icon">${icon}</span>
            <span class="st-goal-area-name">${escapeHtml(goal.goal_area || 'N/A')}</span>
            <span class="st-goal-code">${escapeHtml(goal.code || '')}</span>
            <span class="st-badge st-badge-measurement">${escapeHtml(goal.measurement_type || 'N/A')}</span>
          </div>
        </div>
        <div class="st-goal-body">
          <div class="st-goal-description">${escapeHtml(fullDesc)}</div>
          <div class="st-goal-metrics">
            <div class="st-metric">
              <span class="st-metric-label">Baseline:</span>
              <span class="st-metric-value">${escapeHtml(goal.baseline || 'N/A')}</span>
            </div>
            <div class="st-metric">
              <span class="st-metric-label">Target:</span>
              <span class="st-metric-value">${escapeHtml(goal.target || 'N/A')}</span>
            </div>
          </div>
          
          <div class="st-data-entry-form">
            <h4 style="margin:0 0 12px 0; font-size:14px;">${SVG_ICON_BAR_CHART}Enter Progress Data</h4>
            
            ${measurementFields}
            
            <div class="st-form-group">
              <label class="st-form-label">Date</label>
              <input type="date" class="st-form-input" name="data_date" value="${todayISO}" required />
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Notes (optional)</label>
              <textarea class="st-form-textarea" name="data_notes" rows="2" placeholder="Any observations..."></textarea>
            </div>
            <div class="st-form-row" style="margin-top:12px;">
              <button class="st-btn st-btn-primary st-btn-small save-data-btn" data-goal-id="${goal.id}">Save Data</button>
              <button class="st-btn st-btn-secondary st-btn-small cancel-data-btn" data-goal-id="${goal.id}">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderGoalEditForm(goal) {
    const colorCategory = goalAreaToColorCategory(goal.goal_area);
    
    return `
      <div class="st-goal-card st-goal-edit-form" data-goal-id="${goal.id}" data-area="${colorCategory}">
        <div class="st-form-group">
          <label class="st-form-label">Goal Area</label>
          <select class="st-form-select" name="goal_area">
            ${GOAL_AREAS.map(area => `
              <option value="${escapeHtml(area)}" ${goal.goal_area === area ? 'selected' : ''}>
                ${escapeHtml(area)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Goal Code</label>
          <input type="text" class="st-form-input" name="goal_code" value="${escapeHtml(goal.code || '')}" />
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Description</label>
          <textarea class="st-form-textarea" name="goal_desc">${escapeHtml(goal.desc || goal.goal_text || '')}</textarea>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Measurement Type</label>
          <select class="st-form-select" name="measurement_type">
            <option value="Accuracy" ${goal.measurement_type === 'Accuracy' ? 'selected' : ''}>Accuracy</option>
            <option value="Percent" ${goal.measurement_type === 'Percent' ? 'selected' : ''}>Percent</option>
            <option value="Frequency" ${goal.measurement_type === 'Frequency' ? 'selected' : ''}>Frequency</option>
            <option value="Duration" ${goal.measurement_type === 'Duration' ? 'selected' : ''}>Duration</option>
            <option value="Rate" ${goal.measurement_type === 'Rate' ? 'selected' : ''}>Rate</option>
            <option value="Other" ${goal.measurement_type === 'Other' ? 'selected' : ''}>Other</option>
            <option value="Observation" ${goal.measurement_type === 'Observation' ? 'selected' : ''}>Observation</option>
          </select>
        </div>
        ${renderObservationConfigHtml(goal.observation_config || null, _cachedSchedulePeriods)}
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">Baseline</label>
            <input type="text" class="st-form-input" name="baseline" value="${escapeHtml(goal.baseline || '')}" />
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Mastery</label>
            <input type="text" class="st-form-input" name="mastery" value="${escapeHtml(goal.mastery || '')}" />
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Target</label>
            <input type="text" class="st-form-input" name="target" value="${escapeHtml(goal.target || '')}" />
          </div>
        </div>
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">Case Manager</label>
            <input type="text" class="st-form-input" name="case_manager" value="${escapeHtml(goal.case_manager || '')}" />
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Data Collector</label>
            <input type="text" class="st-form-input" name="data_collector" value="${escapeHtml(goal.data_collector || '')}" />
          </div>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Expected Data Points/Quarter</label>
          <input type="number" class="st-form-input" name="expected_data_points" min="1" max="20" value="${goal.expected_data_points || 3}" />
        </div>
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">
              <input type="checkbox" name="addressed_in_class" value="true" ${goal.addressed_in_class !== false ? 'checked' : ''}>
              In-Class: Include in class assignments
            </label>
          </div>
          <div class="st-form-group">
            <label class="st-form-label">
              <input type="checkbox" name="individual_delivery" value="true" ${goal.individual_delivery ? 'checked' : ''}>
              Individual: Address through individual/pull-out work
            </label>
          </div>
        </div>
        <div class="st-goal-actions">
          <button class="st-btn st-btn-primary save-goal-btn" data-goal-id="${goal.id}">Save</button>
          <button class="st-btn st-btn-secondary cancel-edit-btn" data-goal-id="${goal.id}">Cancel</button>
        </div>
      </div>
    `;
  }

  function renderStudentPassword() {
    return `
      <div class="st-detail-section">
        <div class="st-section-header">
          <h3>Password</h3>
          <button class="st-btn st-btn-secondary" id="reset-password-btn">🔑 Reset Password</button>
        </div>
      </div>
    `;
  }

  // Event handlers
  function setupEventHandlers() {
    // Search input
    const searchInput = document.getElementById('stSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        filterStudents();
        renderStudentList();
        renderStudentKpiSummary();
      });
    }

    // Class filter dropdown
    const classFilter = document.getElementById('stClassFilter');
    if (classFilter) {
      classFilter.addEventListener('change', (e) => {
        selectedClassFilter = e.target.value;
        filterStudents();
        renderStudentList();
        renderStudentKpiSummary();
      });
    }

    // Goal Area filter dropdown (in toolbar)
    const goalAreaFilter = document.getElementById('stGoalAreaFilter');
    if (goalAreaFilter) {
      goalAreaFilter.addEventListener('change', async (e) => {
        selectedGoalAreaFilter = e.target.value;
        // Re-render all expanded students to apply the filter
        for (const studentCode of expandedStudents) {
          await renderExpandedDetail(studentCode);
        }
      });
    }

    // Sort dropdown
    const sortSelect = document.getElementById('stSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        localStorage.setItem(ST_SORT_PREF_KEY, sortBy);
        filterStudents();
        renderStudentList();
      });
    }

    // Sortable column header clicks — allow clicking any th[data-sort] in the main table
    const stTable = document.querySelector('.st-table');
    if (stTable) {
      stTable.querySelector('thead')?.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        const key = th.dataset.sort;
        sortBy = key;
        // Sync the sort dropdown if it has this option
        if (sortSelect) {
          const opt = sortSelect.querySelector(`option[value="${CSS.escape(key)}"]`);
          if (opt) sortSelect.value = key;
        }
        filterStudents();
        renderStudentList();
      });
    }

    // Show Archived checkbox
    const showArchivedCheckbox = document.getElementById('stShowArchived');
    if (showArchivedCheckbox) {
      showArchivedCheckbox.addEventListener('change', (e) => {
        showArchived = e.target.checked;
        filterStudents();
        renderStudentList();
        renderStudentKpiSummary();
      });
    }

    // Needs Attention filter button
    const attentionFilterBtn = document.getElementById('stFilterAttention');
    if (attentionFilterBtn) {
      attentionFilterBtn.addEventListener('click', () => {
        needsAttentionFilter = !needsAttentionFilter;
        attentionFilterBtn.classList.toggle('active', needsAttentionFilter);
        filterStudents();
        renderStudentList();
        renderStudentKpiSummary();
      });
    }

    // Focus Mode button
    const focusToggleBtn = document.getElementById('stFocusToggle');
    if (focusToggleBtn) {
      focusToggleBtn.addEventListener('click', () => toggleFocusMode());
    }

    // Daily Review button
    const dailyReviewBtn = document.getElementById('stDailyReview');
    if (dailyReviewBtn) {
      dailyReviewBtn.addEventListener('click', () => {
        if (dailyReviewActive) exitDailyReview();
        else startDailyReview();
      });
    }

    // Auto-expand alerts toggle
    const autoExpandToggle = document.getElementById('stAutoExpandToggle');
    if (autoExpandToggle) {
      autoExpandToggle.checked = autoExpandAlerts;
      autoExpandToggle.addEventListener('change', (e) => {
        autoExpandAlerts = e.target.checked;
        localStorage.setItem(ST_AUTO_EXPAND_KEY, autoExpandAlerts ? 'true' : 'false');
      });
    }

    // Shortcuts help button
    const shortcutsBtn = document.getElementById('stShortcutsBtn');
    if (shortcutsBtn) {
      shortcutsBtn.addEventListener('click', () => toggleShortcutsHelp());
    }

    // Global keyboard shortcuts
    document.addEventListener('keydown', e => {
      const tag = e.target.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        e.target.isContentEditable;

      // Escape always works regardless of focus
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.st-modal-backdrop.active');
        if (openModal) {
          openModal.remove();
          return;
        }
        const helpPanel = document.getElementById('stShortcutsHelp');
        if (helpPanel && helpPanel.classList.contains('st-shortcuts-visible')) {
          helpPanel.classList.remove('st-shortcuts-visible');
          return;
        }
        const searchEl = document.getElementById('stSearchInput');
        if (searchEl && document.activeElement === searchEl) {
          searchEl.blur();
          return;
        }
        if (focusModeActive) {
          toggleFocusMode();
        }
        return;
      }

      // Remaining shortcuts are ignored when typing in inputs
      if (isEditable) return;

      if (e.key === 'f' || e.key === 'F') {
        toggleFocusMode();
      } else if (e.key === 's' || e.key === 'S' || e.key === '/') {
        const searchEl = document.getElementById('stSearchInput');
        if (searchEl) { e.preventDefault(); searchEl.focus(); searchEl.select(); }
      } else if (e.key === 'p' || e.key === 'P') {
        if (_lastHoveredCode) togglePinStudent(_lastHoveredCode);
      } else if (e.key === '?') {
        e.preventDefault();
        toggleShortcutsHelp();
      }
    });

    // Export button — show dropdown with format options
    const exportBtn = document.getElementById('stExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showExportDropdown(exportBtn);
      });
    }

    // Quarter date bar buttons
    const editQuartersBtn = document.getElementById('stEditQuarters');
    if (editQuartersBtn) {
      editQuartersBtn.addEventListener('click', () => {
        const displayEl = document.getElementById('stQuarterDisplay');
        const formEl = document.getElementById('stQuarterEditForm');
        if (displayEl && formEl) {
          displayEl.style.display = 'none';
          formEl.classList.add('active');
          renderQuarterEditForm();
        }
      });
    }

    // Quarter bar click handler for filtering
    const quarterDisplay = document.getElementById('stQuarterDisplay');
    if (quarterDisplay) {
      quarterDisplay.addEventListener('click', (e) => {
        const quarterItem = e.target.closest('.st-quarter-item');
        if (quarterItem) {
          const quarter = quarterItem.dataset.quarter;
          if (quarter === 'all') {
            selectedQuarter = null;
          } else {
            selectedQuarter = quarter;
          }
          filterStudents();
          renderStudentList();
          renderQuarterBar();
        }
      });
    }

    // Collapse All button
    const collapseAllBtn = document.getElementById('stExpandAllBtn');
    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => {
        expandMode = 'none';
        expandedStudents.clear();
        selectedDetailTabMap.clear();
        renderStudentList();
        updateExpandModeButtons();
      });
    }

    // Expand Students button (expand students but keep goal cards collapsed)
    const expandStudentsBtn = document.getElementById('stExpandStudentsBtn');
    if (expandStudentsBtn) {
      expandStudentsBtn.addEventListener('click', () => {
        expandMode = 'students';
        expandedStudents.clear();
        selectedDetailTabMap.clear();
        filteredStudents.forEach(student => {
          expandedStudents.add(student.code);
          selectedDetailTabMap.set(student.code, 'goals');
        });
        renderStudentList();
        updateExpandModeButtons();
      });
    }

    // Expand All button (expand students and expand all goal cards)
    const expandAllFullBtn = document.getElementById('stExpandAllFullBtn');
    if (expandAllFullBtn) {
      expandAllFullBtn.addEventListener('click', () => {
        expandMode = 'all';
        expandedStudents.clear();
        selectedDetailTabMap.clear();
        filteredStudents.forEach(student => {
          expandedStudents.add(student.code);
          selectedDetailTabMap.set(student.code, 'goals');
        });
        renderStudentList();
        updateExpandModeButtons();
      });
    }

    // Table row clicks (for expanding/collapsing)
    const tableBody = document.getElementById('stStudentTableBody');
    if (tableBody) {
      tableBody.addEventListener('click', async (e) => {
        // PRIORITY 1: Handle all button-specific clicks first (highest priority)

        // Accordion row toggle
        if (e.target.closest('.st-acc-row-toggle')) {
          const toggleBtn = e.target.closest('.st-acc-row-toggle');
          const row = toggleBtn.closest('.st-acc-row');
          if (row) {
            const body = row.querySelector('.st-acc-row-body');
            const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
            toggleBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            if (body) body.hidden = expanded;
          }
          e.stopPropagation();
          return;
        }

        // "Show older" accordion pagination
        if (e.target.closest('.st-acc-show-older')) {
          const btn = e.target.closest('.st-acc-show-older');
          const listId = btn.getAttribute('data-acc-list');
          const list = listId ? document.getElementById(listId) : null;
          if (list) {
            const hiddenRows = list.querySelectorAll('.st-acc-row--hidden');
            let shown = 0;
            for (const row of hiddenRows) {
              if (shown >= ACC_PAGE_SIZE) break;
              row.classList.remove('st-acc-row--hidden');
              shown++;
            }
            const total = Number(btn.getAttribute('data-total')) || 0;
            const newLoaded = (Number(btn.getAttribute('data-loaded')) || 0) + shown;
            btn.setAttribute('data-loaded', newLoaded);
            const remaining = total - newLoaded;
            if (remaining <= 0) {
              btn.remove();
            } else {
              btn.textContent = `Show older assignments (${remaining} more)`;
            }
          }
          e.stopPropagation();
          return;
        }

        // Description toggle - handle BEFORE interactive element check
        if (e.target.classList.contains('st-desc-toggle')) {
          const desc = e.target.closest('.st-goal-description');
          const preview = desc.querySelector('.st-desc-preview');
          const full = desc.querySelector('.st-desc-full');
          const isShowing = full.style.display !== 'none';
          preview.style.display = isShowing ? '' : 'none';
          full.style.display = isShowing ? 'none' : '';
          e.target.textContent = isShowing ? 'Show more' : 'Show less';
          e.stopPropagation();
          return;
        }

        // Progress detail toggle — now switches to Progress tab
        const progressToggleBtn = e.target.closest('.tc-progress-toggle-btn');
        if (progressToggleBtn) {
          const goalId = progressToggleBtn.dataset.goalId;
          const goal = goalId ? allGoals.find(g => g.id === goalId) : null;
          const expandedDetail = progressToggleBtn.closest('.st-expanded-content');
          const studentCode = expandedDetail?.id.replace('stExpandedDetail-', '') || goal?.student_code;
          if (studentCode) {
            // Switch to the Progress tab for this student
            selectedDetailTabMap.set(studentCode, 'progress');
            await renderExpandedDetail(studentCode);
          }
          e.stopPropagation();
          return;
        }
        
        // Edit goal - inline editing
        const editGoalBtn = e.target.closest('.edit-goal-btn');
        if (editGoalBtn) {
          const goalId = editGoalBtn.dataset.goalId;
          const expandedDetail = editGoalBtn.closest('.st-expanded-content');
          const studentCode = expandedDetail?.id.replace('stExpandedDetail-', '');
          expandedGoalCards.add(goalId);
          editingGoalId = goalId;
          if (studentCode) {
            await renderExpandedDetail(studentCode);
          }
          e.stopPropagation();
          return;
        }
        
        // Archive goal
        const archiveGoalBtn = e.target.closest('.archive-goal-btn');
        if (archiveGoalBtn) {
          const goalId = archiveGoalBtn.dataset.goalId;
          await handleArchiveGoal(goalId);
          e.stopPropagation();
          return;
        }

        // Archive All Mastered button
        const archiveAllBtn = e.target.closest('[data-action="archive-all-mastered"]');
        if (archiveAllBtn) {
          const studentCode = archiveAllBtn.dataset.studentCode;
          await handleArchiveAllMastered(studentCode);
          e.stopPropagation();
          return;
        }

        // Skills Summary callout buttons
        const skillCalloutBtn = e.target.closest('.st-skill-callout-btn');
        if (skillCalloutBtn) {
          const action = skillCalloutBtn.dataset.action;
          if (action === 'suggest-goal') {
            const studentCode = skillCalloutBtn.dataset.studentCode;
            const goalArea = skillCalloutBtn.dataset.goalArea;
            const baseline = skillCalloutBtn.dataset.baseline;
            showAddGoalModal(studentCode, { prefillArea: goalArea, prefillBaseline: baseline });
          } else if (action === 'archive-goal') {
            const studentCode = skillCalloutBtn.dataset.studentCode;
            const goalCode = skillCalloutBtn.dataset.goalCode;
            const goal = allGoals.find(g => g.code === goalCode && g.student_code === studentCode);
            if (goal) {
              await handleArchiveGoal(goal.id);
            } else {
              console.warn('[tc-students] Archive callout: goal not found for code', goalCode);
              await rcAlert('Goal Not Found', 'This goal could not be located. It may have already been archived.');
            }
          } else if (action === 'replace-goal-version') {
            const goalId = skillCalloutBtn.dataset.goalId;
            const goal = allGoals.find(g => g.id === goalId);
            if (goal) {
              const avgValue = parseFloat(skillCalloutBtn.dataset.avgValue) || null;
              showReplaceGoalVersionModal(goal, avgValue);
            } else {
              await rcAlert('Goal Not Found', 'This goal could not be located. It may have already been archived.');
            }
          } else if (action === 'dismiss-mastery') {
            const goalCode = skillCalloutBtn.dataset.goalCode;
            const studentCode = skillCalloutBtn.dataset.studentCode;
            dismissMasteryNudge(goalCode, studentCode);
            // Re-render the expanded detail to hide the banner
            if (studentCode && expandedStudents.has(studentCode)) {
              await renderExpandedDetail(studentCode);
            }
          } else if (action === 'create-iep-goal') {
            const studentCode = skillCalloutBtn.dataset.studentCode;
            const deseCode = skillCalloutBtn.dataset.deseCode;
            showAddGoalModal(studentCode, { prefillDesc: `IEP goal for DESE standard: ${deseCode}` });
          }
          e.stopPropagation();
          return;
        }
        
        // Enter Data button
        const enterDataBtn = e.target.closest('.enter-data-btn');
        if (enterDataBtn) {
          const goalId = enterDataBtn.dataset.goalId;
          const goal = allGoals.find(g => g.id === goalId);
          expandedGoalCards.add(goalId);
          enteringDataGoalId = goalId;
          if (goal && goal.student_code && expandedStudents.has(goal.student_code)) {
            await renderExpandedDetail(goal.student_code);
          }
          e.stopPropagation();
          return;
        }
        
        // Cancel inline edit
        const cancelEditBtn = e.target.closest('.cancel-edit-btn');
        if (cancelEditBtn) {
          const expandedDetail = cancelEditBtn.closest('.st-expanded-content');
          const studentCode = expandedDetail?.id.replace('stExpandedDetail-', '');
          editingGoalId = null;
          if (studentCode) {
            await renderExpandedDetail(studentCode);
          }
          e.stopPropagation();
          return;
        } 
        
        // Save inline edit
        const saveGoalBtn = e.target.closest('.save-goal-btn');
        if (saveGoalBtn) {
          const goalId = saveGoalBtn.dataset.goalId;
          await handleSaveInlineEdit(goalId, e);
          e.stopPropagation();
          return;
        }
        
        // Copy token
        const copyTokenBtn = e.target.closest('.copy-token-btn');
        if (copyTokenBtn) {
          const goalId = copyTokenBtn.dataset.goalId;
          await handleCopyDataEntryLink(goalId);
          e.stopPropagation();
          return;
        }
        
        // Revoke token
        const revokeTokenBtn = e.target.closest('.revoke-token-btn');
        if (revokeTokenBtn) {
          const goalId = revokeTokenBtn.dataset.goalId;
          await handleRevokeDataEntryLink(goalId);
          e.stopPropagation();
          return;
        }
        
        // Save Data button
        const saveDataBtn = e.target.closest('.save-data-btn');
        if (saveDataBtn) {
          const goalId = saveDataBtn.dataset.goalId;
          await handleSaveProgressData(goalId, e);
          e.stopPropagation();
          return;
        }

        // Observation response button (session outcome radio-style buttons).
        // Exclude obs-not-addressed-inline-btn — that's a toggle for behavior checklist,
        // handled separately below to avoid radio-clearing the session outcome row.
        const obsResponseBtn = e.target.closest('.obs-response-btn');
        if (obsResponseBtn && !obsResponseBtn.classList.contains('obs-not-addressed-inline-btn')) {
          const row = obsResponseBtn.closest('.obs-response-row');
          if (row) {
            row.querySelectorAll('.obs-response-btn').forEach(b => b.classList.remove('active'));
          }
          obsResponseBtn.classList.toggle('active');
          const card = obsResponseBtn.closest('[data-goal-id]');
          if (card) {
            const hiddenInput = card.querySelector('[name="obs_response"]');
            if (hiddenInput) hiddenInput.value = obsResponseBtn.dataset.response || '';
          }
          e.stopPropagation();
          return;
        }

        // Observation prompt count button
        const obsPromptBtn = e.target.closest('.obs-prompt-count-btn');
        if (obsPromptBtn) {
          const card = obsPromptBtn.closest('[data-goal-id]');
          const goalId = card?.dataset?.goalId;
          const goal = goalId ? allGoals.find(g => g.id === goalId) : null;
          const maxPrompts = goal?.observation_config?.target_max_prompts ?? 2;
          // Clear all prompt buttons in the row
          card.querySelectorAll('.obs-prompt-count-btn').forEach(b => b.classList.remove('active', 'over-target'));
          obsPromptBtn.classList.add('active');
          const countVal = Number(obsPromptBtn.dataset.count);
          if (countVal > maxPrompts) obsPromptBtn.classList.add('over-target');
          // Set hidden input
          const hiddenInput = card.querySelector('[name="obs_prompt_count"]');
          if (hiddenInput) hiddenInput.value = String(obsPromptBtn.dataset.count);
          // Update status text
          const statusEl = card.querySelector('.obs-prompt-status');
          if (statusEl) {
            statusEl.textContent = `Target: ${maxPrompts} or fewer prompts`;
            statusEl.style.color = countVal <= maxPrompts ? '#22c55e' : '#ef4444';
          }
          e.stopPropagation();
          return;
        }

        // Observation "Not Addressed Today" button (behavior checklist)
        const obsNotAddressedBtn = e.target.closest('.obs-not-addressed-inline-btn');
        if (obsNotAddressedBtn) {
          obsNotAddressedBtn.classList.toggle('active');
          const card = obsNotAddressedBtn.closest('[data-goal-id]');
          if (card) {
            const hiddenInput = card.querySelector('[name="obs_not_addressed"]');
            if (hiddenInput) {
              hiddenInput.value = obsNotAddressedBtn.classList.contains('active') ? 'not_addressed' : '';
            }
          }
          e.stopPropagation();
          return;
        }

        // Cancel Data button
        const cancelDataBtn = e.target.closest('.cancel-data-btn');
        if (cancelDataBtn) {
          const goalId = cancelDataBtn.dataset.goalId;
          const goal = allGoals.find(g => g.id === goalId);
          enteringDataGoalId = null;
          // Primary: use goal.student_code. Fallback: get studentCode from DOM
          const studentCode = goal?.student_code 
            || cancelDataBtn.closest('.st-expanded-content')?.id.replace('stExpandedDetail-', '');
          if (studentCode && expandedStudents.has(studentCode)) {
            await renderExpandedDetail(studentCode);
          }
          e.stopPropagation();
          return;
        }
        
        // Save student info button (ID-based)
        if (e.target.id && e.target.id.startsWith('save-student-info-btn-')) {
          const studentCode = e.target.id.replace('save-student-info-btn-', '');
          if (studentCode) {
            await handleSaveStudentInfo(studentCode);
          }
          return;
        }

        // Archive student (ID-based)
        if (e.target.id && e.target.id.startsWith('archive-student-btn-')) {
          const studentCode = e.target.id.replace('archive-student-btn-', '');
          if (studentCode) {
            await handleArchiveStudent(studentCode);
          }
          return;
        }

        // Reactivate student (ID-based)
        if (e.target.id && e.target.id.startsWith('reactivate-student-btn-')) {
          const studentCode = e.target.id.replace('reactivate-student-btn-', '');
          if (studentCode) {
            await handleReactivateStudent(studentCode);
          }
          return;
        }
        
        // Manage enrollments (ID-based)
        if (e.target.id === 'manage-enrollments-btn') {
          const expandedDetail = e.target.closest('.st-expanded-content');
          const studentCode = expandedDetail?.id.replace('stExpandedDetail-', '');
          if (studentCode) {
            showManageEnrollmentsModal(studentCode);
          }
          return;
        }
        
        // Add goal (ID-based)
        if (e.target.id === 'add-goal-btn') {
          const expandedDetail = e.target.closest('.st-expanded-content');
          const studentCode = expandedDetail?.id.replace('stExpandedDetail-', '');
          if (studentCode) {
            showAddGoalModal(studentCode);
          }
          return;
        }
        
        // Reset password (ID-based)
        if (e.target.id === 'reset-password-btn') {
          const expandedDetail = e.target.closest('.st-expanded-content');
          const studentCode = expandedDetail?.id.replace('stExpandedDetail-', '');
          if (studentCode) {
            showResetPasswordModal(studentCode);
          }
          return;
        }
        
        // New IEP button (ID-based)
        if (e.target.id === 'new-iep-btn') {
          const expandedDetail = e.target.closest('.st-expanded-content');
          const studentCode = expandedDetail?.id.replace('stExpandedDetail-', '');
          if (studentCode) {
            showNewIEPWizard(studentCode);
          }
          return;
        }
        
        // Add Communication Entry button
        if (e.target.id === 'add-comm-entry-btn') {
          const studentCode = e.target.dataset.studentCode;
          if (studentCode) {
            showAddCommEntryModal(studentCode);
          }
          e.stopPropagation();
          return;
        }
        
        // PRIORITY 2: Handle tab switching (medium priority)
        if (e.target.classList.contains('st-tab')) {
          const expandedDetail = e.target.closest('.st-expanded-content');
          const studentCode = expandedDetail?.id.replace('stExpandedDetail-', '');
          const tabName = e.target.dataset.tab;
          if (studentCode) {
            // Set tab for this specific student only
            selectedDetailTabMap.set(studentCode, tabName);
            await renderExpandedDetail(studentCode);
          }
          return;
        }
        
        // PRIORITY 3: Goal card collapsing (check if clicking on header but NOT inside actions area)
        if (e.target.closest('.st-goal-header') && !e.target.closest('.st-goal-actions')) {
          const card = e.target.closest('.st-goal-card');
          if (card && !card.classList.contains('st-goal-edit-form')) {
            const goalId = card.dataset.goalId;
            card.classList.toggle('collapsed');
            if (card.classList.contains('collapsed')) {
              expandedGoalCards.delete(goalId);
            } else {
              expandedGoalCards.add(goalId);
            }
          }
          return;
        }

        // PRIORITY 3b: Pin button
        const pinBtn = e.target.closest('.st-pin-btn');
        if (pinBtn) {
          const code = pinBtn.dataset.code;
          if (code) togglePinStudent(code);
          e.stopPropagation();
          return;
        }

        // PRIORITY 3c: Attendance button (mark present/absent/tardy for today)
        const attBtn = e.target.closest('.st-attendance-btn');
        if (attBtn) {
          const code = attBtn.dataset.code;
          if (!code) return;
          e.stopPropagation();
          const today = new Date().toISOString().slice(0, 10);
          const existing = allAttendanceLogs.find(e2 => e2.student_code === code && e2.date === today);
          const cycle = ['present', 'absent', 'tardy'];
          const currentStatus = existing ? existing.status : null;
          const nextStatus = currentStatus ? cycle[(cycle.indexOf(currentStatus) + 1) % cycle.length] : 'present';
          db.upsertAttendance({ student_code: code, date: today, status: nextStatus, source: 'manual' })
            .then(saved => {
              const idx = allAttendanceLogs.findIndex(e2 => e2.student_code === code && e2.date === today);
              if (idx >= 0) {
                allAttendanceLogs[idx] = saved;
              } else {
                allAttendanceLogs.push(saved);
              }
              renderStudentList();
              renderAttendanceReport();
            })
            .catch(err => {
              console.warn('[tc-students] Attendance save failed:', err.message);
              showErrorToast('Failed to save attendance. Please try again.');
            });
          return;
        }

        // PRIORITY 3d: "Seen Today" button — mark present + expand + open Quick Entry
        const seenTodayBtn = e.target.closest('.st-seen-today-btn');
        if (seenTodayBtn) {
          const code = seenTodayBtn.dataset.code;
          if (!code) return;
          e.stopPropagation();
          const today = new Date().toISOString().slice(0, 10);
          const alreadyPresent = allAttendanceLogs.some(e2 => e2.student_code === code && e2.date === today && e2.status === 'present');

          const _doExpandAndQuickEntry = () => {
            // Expand the student
            expandedStudents.add(code);
            selectedDetailTabMap.set(code, 'goals');
            renderStudentList().then(() => {
              // Auto-open Quick Entry for first active goal
              const firstGoal = Array.isArray(allGoals) ? allGoals.find(g => g.student_code === code && g.status !== 'archived') : null;
              if (firstGoal) {
                const goalRow = document.querySelector(`.dt-goal-row[data-goal="${CSS.escape(firstGoal.code)}"][data-student="${CSS.escape(code)}"]`);
                const enterBtn = goalRow?.querySelector('[data-action="enter-data"], .dt-enter-btn');
                if (enterBtn) enterBtn.click();
              }
            });
          };

          if (alreadyPresent) {
            _doExpandAndQuickEntry();
            return;
          }

          // Mark present, then expand
          db.upsertAttendance({ student_code: code, date: today, status: 'present', source: 'manual' })
            .then(saved => {
              const idx = allAttendanceLogs.findIndex(e2 => e2.student_code === code && e2.date === today);
              if (idx >= 0) allAttendanceLogs[idx] = saved;
              else allAttendanceLogs.push(saved);
              _doExpandAndQuickEntry();
              renderAttendanceReport();
            })
            .catch(err => {
              console.warn('[tc-students] Seen-today attendance save failed:', err.message);
              showErrorToast('Failed to mark attendance. Expanding student anyway.');
              _doExpandAndQuickEntry();
            });
          return;
        }
        
        // PRIORITY 4: Handle row click for expand/collapse (lowest priority - catch-all)
        const row = e.target.closest('tr:not(.st-expanded-row)');
        if (row && row.dataset.code) {
          const studentCode = row.dataset.code;
          if (expandedStudents.has(studentCode)) {
            expandedStudents.delete(studentCode);
            // Clean up tab state and abort any pending content listeners for closed student
            selectedDetailTabMap.delete(studentCode);
            const ctrl = expandedContentControllers.get(studentCode);
            if (ctrl) { ctrl.abort(); expandedContentControllers.delete(studentCode); }
          } else {
            expandedStudents.add(studentCode);
            // Set default tab for newly expanded student.
            // Students with no IEP goals default to Skills Summary so teachers
            // can immediately see assignment performance data and AI recommendations.
            const studentHasGoals = Array.isArray(allGoals) && allGoals.some(g => g.student_code === studentCode && g.status !== 'archived');
            selectedDetailTabMap.set(studentCode, studentHasGoals ? 'goals' : 'skills');
            editingGoalId = null;
          }
          // Reset expandMode when manually toggling individual students
          expandMode = 'none';
          renderStudentList();
          updateExpandModeButtons();
          return;
        }
      });

      // Input handler for live observation form updates
      tableBody.addEventListener('input', (e) => {
        // Tally: update percentage display as numbers are typed
        const tallyInput = e.target.closest('[name="obs_successful"], [name="obs_opportunities"]');
        if (tallyInput) {
          const card = tallyInput.closest('[data-goal-id]');
          if (card) {
            const s = Number(card.querySelector('[name="obs_successful"]')?.value) || 0;
            const o = Number(card.querySelector('[name="obs_opportunities"]')?.value) || 0;
            const pctEl = card.querySelector('.obs-tally-pct');
            if (pctEl) {
              pctEl.textContent = o > 0 ? `${Math.round((s / o) * 100)}%` : '';
            }
          }
          return;
        }

        // Behavior checklist: update summary count as checkboxes are toggled
        const cbInput = e.target.closest('[type="checkbox"][name^="obs_behavior_"]');
        if (cbInput) {
          const card = cbInput.closest('[data-goal-id]');
          if (card) {
            const total = Number(card.querySelector('.obs-checklist-items')?.dataset?.total) || 0;
            const checked = card.querySelectorAll('[type="checkbox"][name^="obs_behavior_"]:checked').length;
            const summaryEl = card.querySelector('.obs-checklist-summary-inline');
            if (summaryEl) {
              summaryEl.textContent = `${checked} of ${total} demonstrated`;
            }
          }
        }
      });

      // Goals hover tooltip (event delegation, 200 ms delay)
      setupGoalsTooltipHandlers(tableBody);

      // Track last hovered student row for the 'P' keyboard shortcut
      tableBody.addEventListener('mouseover', (e) => {
        const row = e.target.closest('tr[data-code]');
        if (row) _lastHoveredCode = row.dataset.code;
      });
      tableBody.addEventListener('mouseleave', () => {
        _lastHoveredCode = null;
      });
    }

    // Hide goals tooltip on scroll so it doesn't float at a stale position
    document.addEventListener('scroll', hideGoalsTooltip, { passive: true, capture: true });

    document.addEventListener('click', (e) => {
      if (e.target.id === 'stCancelQuarterEdit') {
        const displayEl = document.getElementById('stQuarterDisplay');
        const formEl = document.getElementById('stQuarterEditForm');
        if (displayEl && formEl) {
          displayEl.style.display = '';
          formEl.classList.remove('active');
        }
      } else if (e.target.id === 'stSaveQuarters') {
        const formEl = document.getElementById('stQuarterEditForm');
        if (formEl) {
          const dates = {
            Q1: {
              start: formEl.querySelector('[name="Q1-start"]').value.trim(),
              end: formEl.querySelector('[name="Q1-end"]').value.trim()
            },
            Q2: {
              start: formEl.querySelector('[name="Q2-start"]').value.trim(),
              end: formEl.querySelector('[name="Q2-end"]').value.trim()
            },
            Q3: {
              start: formEl.querySelector('[name="Q3-start"]').value.trim(),
              end: formEl.querySelector('[name="Q3-end"]').value.trim()
            },
            Q4: {
              start: formEl.querySelector('[name="Q4-start"]').value.trim(),
              end: formEl.querySelector('[name="Q4-end"]').value.trim()
            }
          };
          const dummyYear = 2025;
          const allValid = Object.values(dates).every(r =>
            parseQuarterDate(r.start, dummyYear) && parseQuarterDate(r.end, dummyYear)
          );
          if (!allValid) {
            showToast('Invalid date format. Use "Mon DD" (e.g. "Aug 16").');
            return;
          }
          saveQuarterDates(dates);
          renderQuarterBar();
          const displayEl = document.getElementById('stQuarterDisplay');
          if (displayEl) {
            displayEl.style.display = '';
          }
          formEl.classList.remove('active');
          showToast('Quarter dates saved successfully');
        }
      }
    });

    const addStudentBtn = document.getElementById('stAddStudent');
    if (addStudentBtn) {
      addStudentBtn.addEventListener('click', showAddStudentWizard);
    }

    const quickEntryBtn = document.getElementById('stQuickEntry');
    if (quickEntryBtn) {
      quickEntryBtn.addEventListener('click', toggleQuickEntryPanel);
    }

    const importCsvBtn = document.getElementById('stImportCSV');
    if (importCsvBtn) {
      importCsvBtn.addEventListener('click', showSpedTrackImportModal);
    }

    const masterSpreadsheetBtn = document.getElementById('stMasterSpreadsheet');
    if (masterSpreadsheetBtn) {
      masterSpreadsheetBtn.addEventListener('click', () => {
        window.location.href = '/teacher/students/spreadsheet/';
      });
    }
  }

  async function handleSaveInlineEdit(goalId, e) {
    const form = e.target.closest('.st-goal-edit-form');
    if (!form) return;

    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) return;

    // Validate observation config if applicable
    const obsErrors = validateObservationConfig(form);
    if (obsErrors.length > 0) {
      await rcAlert('Validation Error', obsErrors.join('\n'));
      return;
    }

    const formData = {
      id: goalId,
      student_code: goal.student_code,
      goal_area: form.querySelector('[name="goal_area"]').value,
      code: form.querySelector('[name="goal_code"]').value,
      desc: form.querySelector('[name="goal_desc"]').value,
      measurement_type: form.querySelector('[name="measurement_type"]').value,
      baseline: form.querySelector('[name="baseline"]').value,
      mastery: form.querySelector('[name="mastery"]').value,
      target: form.querySelector('[name="target"]').value,
      case_manager: form.querySelector('[name="case_manager"]').value,
      data_collector: form.querySelector('[name="data_collector"]').value,
      expected_data_points: parseInt(form.querySelector('[name="expected_data_points"]').value) || 3,
      class_context: goal.class_context,
      version: goal.version,
      status: goal.status,
      addressed_in_class: form.querySelector('[name="addressed_in_class"]')?.checked !== false,
      individual_delivery: form.querySelector('[name="individual_delivery"]')?.checked === true,
      observation_config: form.querySelector('[name="measurement_type"]').value === 'Observation' ? gatherObservationConfig(form) : null
    };

    try {
      await db.upsertGoal(formData);
      console.log('[tc-students] Updated goal:', goalId);
      editingGoalId = null;
      await loadData();
      if (goal.student_code && expandedStudents.has(goal.student_code)) {
        await renderExpandedDetail(goal.student_code);
      }
    } catch (error) {
      console.error('[tc-students] Error updating goal:', error);
      await rcAlert('Error', 'Failed to update goal');
    }
  }

  function selectStudent(code) {
    expandedStudents.clear();
    selectedDetailTabMap.clear();
    expandedStudents.add(code);
    selectedDetailTabMap.set(code, 'goals');
    selectedGoalAreaFilter = 'All';
    editingGoalId = null;
    renderStudentList();
  }

  async function handleArchiveStudent(studentCode) {
    if (!studentCode) return;
    
    const confirmed = await showConfirmModal(
      'Archive Student',
      `Archive student ${studentCode}? This will hide them from the active list.`,
      'Archive',
      { danger: true }
    );
    if (!confirmed) return;

    try {
      await db.upsertStudent({ code: studentCode, status: 'archived', active: false });
      console.log('[tc-students] Archived student:', studentCode);
      await loadData();
      expandedStudents.delete(studentCode);
      renderStudentList();
    } catch (error) {
      console.error('[tc-students] Error archiving student:', error);
      await rcAlert('Error', 'Failed to archive student');
    }
  }

  async function handleReactivateStudent(studentCode) {
    if (!studentCode) return;
    
    const confirmed = await showConfirmModal(
      'Reactivate Student',
      `Reactivate student ${studentCode}? They will reappear in the active list.`,
      'Reactivate'
    );
    if (!confirmed) return;

    try {
      await db.upsertStudent({ code: studentCode, status: 'active', active: true });
      console.log('[tc-students] Reactivated student:', studentCode);
      await loadData();
      await renderExpandedDetail(studentCode);
    } catch (error) {
      console.error('[tc-students] Error reactivating student:', error);
      await rcAlert('Error', 'Failed to reactivate student');
    }
  }

  async function handleSaveStudentInfo(studentCode) {
    if (!studentCode) return;

    const caseManager = document.getElementById(`edit-case-manager-${studentCode}`)?.value;
    const iepDue = document.getElementById(`edit-iep-due-${studentCode}`)?.value;
    const evalDue = document.getElementById(`edit-eval-due-${studentCode}`)?.value;

    try {
      await db.upsertStudent({
        code: studentCode,
        primary_case_manager: caseManager,
        iep_due: iepDue || null,
        eval_due: evalDue || null
      });
      console.log('[tc-students] Updated student info:', studentCode);
      showToast('Student information saved successfully');
      await loadData();
      await renderExpandedDetail(studentCode);
    } catch (error) {
      console.error('[tc-students] Error saving student info:', error);
      await rcAlert('Error', 'Failed to save student information');
    }
  }

  async function handleArchiveGoal(goalId) {
    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) return;

    const confirmed = await showConfirmModal(
      'Archive Goal',
      `Archive goal "${goal.code || goal.goal_code}"?`,
      'Archive',
      { danger: true }
    );
    if (!confirmed) return;

    try {
      await db.upsertGoal({ id: goalId, status: 'archived' });
      console.log('[tc-students] Archived goal:', goalId);
      await loadData();
      // Re-render the expanded detail for this goal's student
      if (goal.student_code && expandedStudents.has(goal.student_code)) {
        await renderExpandedDetail(goal.student_code);
      }
    } catch (error) {
      console.error('[tc-students] Error archiving goal:', error);
      await rcAlert('Error', 'Failed to archive goal');
    }
  }

  /**
   * Archive all mastered goals for a student in one action.
   * Shows a confirmation dialog listing the goals before proceeding.
   */
  async function handleArchiveAllMastered(studentCode) {
    const studentGoals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
    const masteredGoals = studentGoals.filter(g => computeGoalAlertStatus(g).isMastered);
    if (masteredGoals.length === 0) return;

    const goalList = masteredGoals.map(g => {
      const desc = g.desc || g.goal_text || '';
      const shortDesc = desc.length > 60 ? desc.slice(0, 57) + '…' : desc;
      return shortDesc ? `• ${g.code}: ${shortDesc}` : `• ${g.code}`;
    }).join('\n');
    const confirmed = await showConfirmModal(
      'Archive All Mastered Goals',
      `The following ${masteredGoals.length} goal${masteredGoals.length === 1 ? '' : 's'} will be archived:\n\n${goalList}`,
      `Archive ${masteredGoals.length} Goal${masteredGoals.length === 1 ? '' : 's'}`,
      { danger: true }
    );
    if (!confirmed) return;

    let archived = 0;
    let failed = 0;
    for (const goal of masteredGoals) {
      try {
        await db.upsertGoal({ id: goal.id, status: 'archived' });
        archived++;
      } catch (err) {
        console.error('[tc-students] handleArchiveAllMastered: failed for goal', goal.code, err);
        failed++;
      }
    }

    await loadData();
    if (expandedStudents.has(studentCode)) {
      await renderExpandedDetail(studentCode);
    }

    if (failed === 0) {
      showToast(`Archived ${archived} mastered goal${archived === 1 ? '' : 's'} successfully.`);
    } else {
      showErrorToast(`Archived ${archived}, failed ${failed}. Check console for details.`);
    }
  }

  async function handleSaveProgressData(goalId, e) {
    const card = e.target.closest('[data-goal-id]');
    if (!card) return;

    const goal = allGoals.find(g => g.id === goalId);
    if (!goal) return;

    // Collect form values
    const dataDate = card.querySelector('[name="data_date"]')?.value;
    const dataNotes = card.querySelector('[name="data_notes"]')?.value || '';
    if (!dataDate) {
      await rcAlert('Validation', 'Please enter a date');
      return;
    }
    
    // Calculate value based on measurement type
    let calculatedValue = 0;
    let notes = dataNotes;
    
    try {
      if (goal.measurement_type === 'Accuracy' || goal.measurement_type === 'Percent') {
        const correct = parseFloat(card.querySelector('[name="correct"]')?.value);
        const total = parseFloat(card.querySelector('[name="total"]')?.value);
        if (isNaN(correct) || isNaN(total) || total === 0) {
          await rcAlert('Validation', 'Please enter valid correct and total values');
          return;
        }
        calculatedValue = (correct / total) * 100;
        notes = `${correct}/${total} = ${calculatedValue.toFixed(1)}%${notes ? '. ' + notes : ''}`;
      } else if (goal.measurement_type === 'Frequency') {
        const count = parseFloat(card.querySelector('[name="count"]')?.value);
        const timePeriod = card.querySelector('[name="time_period"]')?.value;
        if (isNaN(count)) {
          await rcAlert('Validation', 'Please enter a valid count');
          return;
        }
        calculatedValue = count;
        notes = `${count} (${timePeriod})${notes ? '. ' + notes : ''}`;
      } else if (goal.measurement_type === 'Duration') {
        const minutes = parseFloat(card.querySelector('[name="minutes"]')?.value) || 0;
        const seconds = parseFloat(card.querySelector('[name="seconds"]')?.value) || 0;
        calculatedValue = minutes + (seconds / 60);
        notes = `${minutes}m ${seconds}s${notes ? '. ' + notes : ''}`;
      } else if (goal.measurement_type === 'Rate') {
        const count = parseFloat(card.querySelector('[name="count"]')?.value);
        const minutes = parseFloat(card.querySelector('[name="minutes"]')?.value);
        if (isNaN(count) || isNaN(minutes) || minutes === 0) {
          await rcAlert('Validation', 'Please enter valid count and minutes values');
          return;
        }
        calculatedValue = count / minutes;
        notes = `${count} per ${minutes} minutes${notes ? '. ' + notes : ''}`;
      } else if (goal.measurement_type === 'Observation') {
        const obsCat = goal.observation_config?.category || '';
        if (obsCat === 'session_outcome') {
          const response = card.querySelector('[name="obs_response"]')?.value || '';
          if (!response) {
            await rcAlert('Validation', 'Please select a session outcome');
            return;
          }
          if (response === 'met') calculatedValue = 100;
          else if (response === 'not_met') calculatedValue = 0;
          else calculatedValue = null;
          const notePrefix = `[obs:session_outcome:${response}]`;
          notes = dataNotes ? `${notePrefix} ${dataNotes}` : notePrefix;
        } else if (obsCat === 'tally') {
          const successful = Number(card.querySelector('[name="obs_successful"]')?.value) || 0;
          const opportunities = Number(card.querySelector('[name="obs_opportunities"]')?.value) || 0;
          if (opportunities === 0) {
            await rcAlert('Validation', 'Please enter the number of opportunities');
            return;
          }
          calculatedValue = Math.round((successful / opportunities) * 10000) / 100;
          const notePrefix = `[obs:tally:${successful}/${opportunities}]`;
          notes = dataNotes ? `${notePrefix} ${dataNotes}` : notePrefix;
        } else if (obsCat === 'prompt_count') {
          const countStr = card.querySelector('[name="obs_prompt_count"]')?.value;
          if (countStr === '' || countStr == null) {
            await rcAlert('Validation', 'Please select a prompt count');
            return;
          }
          calculatedValue = Number(countStr);
          const notePrefix = `[obs:prompt_count:${calculatedValue}]`;
          notes = dataNotes ? `${notePrefix} ${dataNotes}` : notePrefix;
        } else if (obsCat === 'behavior_checklist') {
          const subBehaviors = Array.isArray(goal.observation_config?.sub_behaviors) ? goal.observation_config.sub_behaviors : [];
          const notAddressed = card.querySelector('[name="obs_not_addressed"]')?.value === 'not_addressed';
          if (notAddressed) {
            calculatedValue = null;
            const notePrefix = `[obs:checklist:not_addressed]`;
            notes = dataNotes ? `${notePrefix} ${dataNotes}` : notePrefix;
          } else {
            const checkedBehaviors = subBehaviors.map((_, idx) =>
              card.querySelector(`[name="obs_behavior_${idx}"]`)?.checked || false
            );
            const metCount = checkedBehaviors.filter(Boolean).length;
            calculatedValue = subBehaviors.length > 0
              ? Math.round((metCount / subBehaviors.length) * 10000) / 100
              : null;
            const parts = subBehaviors.map((sb, i) => `${sb}=${checkedBehaviors[i] ? 'met' : 'not_met'}`);
            const notePrefix = `[obs:checklist:${parts.join(',')}]`;
            notes = dataNotes ? `${notePrefix} ${dataNotes}` : notePrefix;
          }
        } else {
          const value = parseFloat(card.querySelector('[name="value"]')?.value);
          if (isNaN(value)) {
            await rcAlert('Validation', 'Please enter a valid value');
            return;
          }
          calculatedValue = value;
        }
      } else {
        const value = parseFloat(card.querySelector('[name="value"]')?.value);
        if (isNaN(value)) {
          await rcAlert('Validation', 'Please enter a valid value');
          return;
        }
        calculatedValue = value;
      }

      // Save to goal_progress table or localStorage
      const supabase = await getSupabase();
      if (supabase) {
        // Resolve student UUID – goal_progress uses student_id/goal_id FK columns
        const student = allStudents.find(s => s.code === goal.student_code);
        const studentId = student?.id;
        if (!studentId) {
          console.warn('[tc-students] Student UUID not found; falling back to localStorage');
        }
        // Try to save to Supabase (only when both UUIDs are available)
        let savedToSupabase = false;
        if (studentId) {
          try {
            const { error } = await supabase.from('goal_progress').insert({
              student_id: studentId,
              goal_id: goal.id,
              value: calculatedValue,
              date: dataDate,
              notes: notes,
              collected_by: 'teacher'
            });
            if (error) throw error;
            savedToSupabase = true;
          } catch (err) {
            console.warn('[tc-students] Could not save to goal_progress, falling back to localStorage:', err);
          }
        }
        if (!savedToSupabase) {
          // Fall back to localStorage
          const KEY = 'rc_goal_progress_v1';
          const existing = JSON.parse(localStorage.getItem(KEY) || '[]');
          existing.push({
            student_code: goal.student_code,
            goal_code: goal.code,
            value: calculatedValue,
            date: dataDate,
            notes: notes,
            collected_by: 'teacher',
            created_at: new Date().toISOString()
          });
          localStorage.setItem(KEY, JSON.stringify(existing));
        }
      } else {
        // No Supabase, use localStorage
        const KEY = 'rc_goal_progress_v1';
        const existing = JSON.parse(localStorage.getItem(KEY) || '[]');
        existing.push({
          student_code: goal.student_code,
          goal_code: goal.code,
          value: calculatedValue,
          date: dataDate,
          notes: notes,
          collected_by: 'teacher',
          created_at: new Date().toISOString()
        });
        localStorage.setItem(KEY, JSON.stringify(existing));
      }

      // Show success message
      showToast(`Data saved for ${goal.code}`);

      // Show inline obs toast before re-render
      if (goal.measurement_type === 'Observation') {
        showObsToast(card, 'Observation data saved', false);
      }

      // Reset state
      enteringDataGoalId = null;
      
      // Reload data and keep student expanded
      await loadData();
      if (goal.student_code && expandedStudents.has(goal.student_code)) {
        await renderExpandedDetail(goal.student_code);
      }
    } catch (error) {
      console.error('[tc-students] Error saving progress data:', error);
      if (goal && goal.measurement_type === 'Observation') {
        showObsToast(card, 'Save failed — data stored locally', true);
      }
      await rcAlert('Error', 'Failed to save progress data');
    }
  }

  // Modals
  function showManageEnrollmentsModal(studentCode) {
    const student = allStudents.find(s => s.code === studentCode);
    if (!student) return;

    const enrollments = allEnrollments.filter(e => e.student_code === student.code);
    
    const checkboxes = FULL_CLASS_NAMES.map(className => {
      const isEnrolled = enrollments.some(e => e.class_name === className);
      return `
        <label class="st-checkbox-label">
          <input type="checkbox" name="enrollment" value="${escapeHtml(className)}" ${isEnrolled ? 'checked' : ''}>
          ${escapeHtml(className)}
        </label>
      `;
    }).join('');

    const modal = createModal('Manage Enrollments', `
      <form id="enrollments-form">
        <div class="st-form-group">
          <label class="st-form-label">Select Classes:</label>
          <div class="st-checkbox-group">
            ${checkboxes}
          </div>
        </div>
        <div class="st-modal-footer">
          <button type="button" class="st-btn st-btn-secondary" id="cancel-enrollments">Cancel</button>
          <button type="submit" class="st-btn st-btn-primary">Save</button>
        </div>
      </form>
    `);

    document.body.appendChild(modal);

    document.getElementById('cancel-enrollments').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('enrollments-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveEnrollments(student.code);
      modal.remove();
    });
  }

  async function handleSaveEnrollments(studentCode) {
    const form = document.getElementById('enrollments-form');
    const checkboxes = form.querySelectorAll('input[name="enrollment"]');
    const selected = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    try {
      const currentEnrollments = allEnrollments.filter(e => e.student_code === studentCode);
      
      for (const enrollment of currentEnrollments) {
        if (!selected.includes(enrollment.class_name)) {
          const supabase = await getSupabase();
          if (!supabase) continue;
          const { error } = await supabase
            .from('enrollments')
            .delete()
            .eq('student_code', studentCode)
            .eq('class_name', enrollment.class_name);
          
          if (error) throw error;
        }
      }

      for (const className of selected) {
        const exists = currentEnrollments.some(e => e.class_name === className);
        if (!exists) {
          const supabase = await getSupabase();
          if (!supabase) continue;
          const { error } = await supabase
            .from('enrollments')
            .insert({ student_code: studentCode, class_name: className });
          
          if (error) throw error;
        }
      }

      console.log('[tc-students] Updated enrollments');
      await loadData();
      if (studentCode && expandedStudents.has(studentCode)) {
        await renderExpandedDetail(studentCode);
      }
    } catch (error) {
      console.error('[tc-students] Error saving enrollments:', error);
      await rcAlert('Error', 'Failed to save enrollments');
    }
  }

  function showAddGoalModal(studentCode, prefill = {}) {
    const student = allStudents.find(s => s.code === studentCode);
    if (!student) return;

    const modal = createModal('Add IEP Goal', `
      <form id="add-goal-form">
        <div class="st-form-group">
          <label class="st-form-label">Goal Area:</label>
          <select name="goal_area" class="st-form-select" required>
            <option value="">Select...</option>
            ${GOAL_AREAS.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('')}
          </select>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Goal Code:</label>
          <input type="text" name="goal_code" class="st-form-input" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Description:</label>
          <textarea name="goal_text" class="st-form-textarea" rows="4" required></textarea>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Measurement Type:</label>
          <select name="measurement_type" class="st-form-select" required>
            <option value="">Select...</option>
            <option value="Accuracy">Accuracy</option>
            <option value="Frequency">Frequency</option>
            <option value="Duration">Duration</option>
            <option value="Rate">Rate</option>
            <option value="Observation">Observation</option>
          </select>
        </div>
        ${renderObservationConfigHtml(null, _cachedSchedulePeriods)}
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">Baseline:</label>
            <input type="text" name="baseline" class="st-form-input" required>
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Mastery:</label>
            <input type="text" name="mastery" class="st-form-input">
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Target:</label>
            <input type="text" name="target" class="st-form-input" required>
          </div>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Case Manager:</label>
          <input type="text" name="case_manager" class="st-form-input" value="${escapeHtml(student.primary_case_manager || '')}" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Data Collector:</label>
          <input type="text" name="data_collector" class="st-form-input" value="Dan Reinisch" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Data Collector Email:</label>
          <input type="email" name="data_collector_email" class="st-form-input">
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Class Context:</label>
          <select name="class_context" class="st-form-select">
            <option value="">Select...</option>
            ${FULL_CLASS_NAMES.map(cn => `<option value="${escapeHtml(cn)}">${escapeHtml(cn)}</option>`).join('')}
          </select>
        </div>
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">
              <input type="checkbox" name="addressed_in_class" value="true" checked>
              In-Class: Include in class assignments
            </label>
          </div>
          <div class="st-form-group">
            <label class="st-form-label">
              <input type="checkbox" name="individual_delivery" value="true">
              Individual: Address through individual/pull-out work
            </label>
          </div>
        </div>
        <div class="st-modal-footer">
          <button type="button" class="st-btn st-btn-secondary" id="cancel-goal">Cancel</button>
          <button type="submit" class="st-btn st-btn-primary">Add Goal</button>
        </div>
      </form>
    `);

    document.body.appendChild(modal);

    // Apply prefill values using DOM API (no innerHTML with user data)
    if (prefill.prefillArea) {
      const select = modal.querySelector('select[name="goal_area"]');
      if (select) select.value = prefill.prefillArea;
    }
    if (prefill.prefillBaseline !== undefined && prefill.prefillBaseline !== '') {
      const input = modal.querySelector('input[name="baseline"]');
      if (input) input.value = prefill.prefillBaseline;
    }
    if (prefill.prefillDesc) {
      const textarea = modal.querySelector('textarea[name="goal_text"]');
      if (textarea) textarea.value = prefill.prefillDesc;
    }

    // Wire up observation config show/hide
    initObservationFields(modal);

    document.getElementById('cancel-goal').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('add-goal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const obsErrors = validateObservationConfig(e.target);
      if (obsErrors.length > 0) {
        await rcAlert('Validation Error', obsErrors.join('\n'));
        return;
      }
      await handleAddGoal(e.target, studentCode);
      modal.remove();
    });
  }

  async function handleAddGoal(form, studentCode) {
    const formData = new FormData(form);
    const goal = {
      student_code: studentCode,
      goal_area: formData.get('goal_area'),
      code: formData.get('goal_code'), // Form field is 'goal_code' but DB field is 'code'
      goal_text: formData.get('goal_text'),
      measurement_type: formData.get('measurement_type'),
      baseline: formData.get('baseline'),
      mastery: formData.get('mastery'),
      target: formData.get('target'),
      case_manager: formData.get('case_manager'),
      data_collector: formData.get('data_collector'),
      data_collector_email: formData.get('data_collector_email') || null,
      class_context: formData.get('class_context') || null,
      status: 'active',
      version: 1,
      addressed_in_class: form.querySelector('[name="addressed_in_class"]')?.checked !== false,
      individual_delivery: form.querySelector('[name="individual_delivery"]')?.checked === true,
      observation_config: formData.get('measurement_type') === 'Observation' ? gatherObservationConfig(form) : null
    };

    try {
      await db.upsertGoal(goal);
      console.log('[tc-students] Added goal');
      await loadData();
      if (goal.student_code && expandedStudents.has(goal.student_code)) {
        await renderExpandedDetail(goal.student_code);
      }
    } catch (error) {
      console.error('[tc-students] Error adding goal:', error);
      await rcAlert('Error', 'Failed to add goal');
    }
  }

  /**
   * Opens the "Replace with Next Version" modal pre-populated from the current goal.
   * On submit: archives the old goal and creates the new versioned goal.
   *
   * @param {Object} oldGoal - The goal object to be replaced
   * @param {number|null} avgValue - The student's current rolling average (used as new baseline)
   */
  function showReplaceGoalVersionModal(oldGoal, avgValue) {
    const newCode = incrementGoalCode(oldGoal.code || '');
    const newBaseline = avgValue != null ? String(Math.round(avgValue)) : (oldGoal.mastery || oldGoal.target || '');

    const modal = createModal('🔄 Replace with Next Version', `
      <form id="replace-goal-form">
        <p style="font-size:13px;opacity:0.75;margin-bottom:16px;">
          This will archive <strong>${escapeHtml(oldGoal.code || '')}</strong> and create a new version below.
          The new baseline is pre-filled with the mastered value.
        </p>
        <div class="st-form-group">
          <label class="st-form-label">Goal Area:</label>
          <select name="goal_area" class="st-form-select" required>
            <option value="">Select...</option>
            ${GOAL_AREAS.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('')}
          </select>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">New Goal Code:</label>
          <input type="text" name="goal_code" class="st-form-input" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Description (editable):</label>
          <textarea name="goal_text" class="st-form-textarea" rows="4" required></textarea>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Measurement Type:</label>
          <select name="measurement_type" class="st-form-select" required>
            <option value="">Select...</option>
            <option value="Accuracy">Accuracy</option>
            <option value="Frequency">Frequency</option>
            <option value="Duration">Duration</option>
            <option value="Rate">Rate</option>
            <option value="Observation">Observation</option>
          </select>
        </div>
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">New Baseline:</label>
            <input type="text" name="baseline" class="st-form-input" required>
          </div>
          <div class="st-form-group">
            <label class="st-form-label">New Mastery/Target:</label>
            <input type="text" name="mastery" class="st-form-input" placeholder="Set new target">
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Target:</label>
            <input type="text" name="target" class="st-form-input" required>
          </div>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Case Manager:</label>
          <input type="text" name="case_manager" class="st-form-input" required>
        </div>
        <div class="st-modal-footer">
          <button type="button" class="st-btn st-btn-secondary" id="cancel-replace-goal">Cancel</button>
          <button type="submit" class="st-btn st-btn-primary">Create New Version</button>
        </div>
      </form>
    `);

    document.body.appendChild(modal);

    // Pre-populate fields via DOM API (safe, no innerHTML with user data)
    const form = modal.querySelector('#replace-goal-form');
    form.querySelector('[name="goal_code"]').value = newCode;
    form.querySelector('[name="goal_text"]').value = oldGoal.desc || oldGoal.goal_text || '';
    form.querySelector('[name="baseline"]').value = newBaseline;
    form.querySelector('[name="target"]').value = oldGoal.target || '';
    form.querySelector('[name="case_manager"]').value = oldGoal.case_manager || '';

    const areaSelect = form.querySelector('[name="goal_area"]');
    if (oldGoal.goal_area) areaSelect.value = oldGoal.goal_area;

    const mtSelect = form.querySelector('[name="measurement_type"]');
    if (oldGoal.measurement_type) mtSelect.value = oldGoal.measurement_type;

    modal.querySelector('#cancel-replace-goal').addEventListener('click', () => modal.remove());

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await handleReplaceGoalVersion(form, oldGoal);
      modal.remove();
    });
  }

  /**
   * Handles the "Replace with Next Version" form submission.
   * Archives the old goal and creates the new versioned goal.
   *
   * @param {HTMLFormElement} form
   * @param {Object} oldGoal - The goal being replaced
   */
  async function handleReplaceGoalVersion(form, oldGoal) {
    const formData = new FormData(form);
    const newGoal = {
      student_code: oldGoal.student_code,
      goal_area: formData.get('goal_area'),
      code: formData.get('goal_code'),
      goal_text: formData.get('goal_text'),
      measurement_type: formData.get('measurement_type'),
      baseline: formData.get('baseline'),
      mastery: formData.get('mastery') || null,
      target: formData.get('target'),
      case_manager: formData.get('case_manager'),
      data_collector: oldGoal.data_collector || DEFAULT_DATA_COLLECTOR,
      data_collector_email: oldGoal.data_collector_email || null,
      class_context: oldGoal.class_context || null,
      status: 'active',
      version: (oldGoal.version || 1) + 1,
      addressed_in_class: oldGoal.addressed_in_class !== false,
      individual_delivery: !!oldGoal.individual_delivery,
    };

    try {
      // Archive the old goal
      await db.upsertGoal({ id: oldGoal.id, status: 'archived' });
      console.log('[tc-students] Archived old goal for replacement:', oldGoal.id);

      // Create the new versioned goal
      await db.upsertGoal(newGoal);
      console.log('[tc-students] Created replacement goal:', newGoal.code);

      // Clear any mastery dismissal for the old code so new goal starts fresh
      try {
        localStorage.removeItem(MASTERY_DISMISS_PREFIX + oldGoal.code + '_' + oldGoal.student_code);
      } catch { /* ignore */ }

      await loadData();
      if (oldGoal.student_code && expandedStudents.has(oldGoal.student_code)) {
        await renderExpandedDetail(oldGoal.student_code);
      }
    } catch (error) {
      console.error('[tc-students] Error replacing goal version:', error);
      await rcAlert('Error', 'Failed to replace goal version: ' + (error.message || error));
    }
  }

  function showAddCommEntryModal(studentCode) {
    const today = new Date().toISOString().split('T')[0];
    
    const modal = createModal('Add Communication Entry', `
      <form id="add-comm-form">
        <div class="st-form-group">
          <label class="st-form-label">Date:</label>
          <input type="date" name="date" class="st-form-input" value="${today}" required>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Type:</label>
          <select name="type" class="st-form-select" required>
            <option value="Email">Email</option>
            <option value="Phone">Phone</option>
            <option value="Meeting">Meeting</option>
            <option value="Report Sent">Report Sent</option>
          </select>
        </div>
        <div class="st-form-group">
          <label class="st-form-label">Notes:</label>
          <textarea name="notes" class="st-form-textarea" rows="4" required></textarea>
        </div>
        <div class="st-modal-footer">
          <button type="button" class="st-btn st-btn-secondary" id="cancel-comm">Cancel</button>
          <button type="submit" class="st-btn st-btn-primary">Add Entry</button>
        </div>
      </form>
    `);

    document.body.appendChild(modal);

    document.getElementById('cancel-comm').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('add-comm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleAddCommEntry(e.target, studentCode);
      modal.remove();
    });
  }

  async function handleAddCommEntry(form, studentCode) {
    const formData = new FormData(form);
    const entry = {
      date: formData.get('date'),
      type: formData.get('type'),
      notes: formData.get('notes')
    };

    try {
      const allLogs = getParentCommLog();
      if (!allLogs[studentCode]) {
        allLogs[studentCode] = [];
      }
      allLogs[studentCode].push(entry);
      saveParentCommLog(allLogs);
      
      showToast('Communication entry added');
      
      // Refresh the compliance tab
      if (expandedStudents.has(studentCode)) {
        selectedDetailTabMap.set(studentCode, 'compliance');
        await renderExpandedDetail(studentCode);
      }
    } catch (error) {
      console.error('[tc-students] Error adding communication entry:', error);
      await rcAlert('Error', 'Failed to add communication entry');
    }
  }

  function showResetPasswordModal(studentCode) {
    const student = allStudents.find(s => s.code === studentCode);
    if (!student) return;

    const modal = createModal('Reset Password', `
      <form id="reset-password-form">
        <div class="st-form-group">
          <label class="st-form-label">New Password for ${escapeHtml(student.code)}:</label>
          <input type="text" name="password" class="st-form-input" required>
        </div>
        <div class="st-modal-footer">
          <button type="button" class="st-btn st-btn-secondary" id="cancel-password">Cancel</button>
          <button type="submit" class="st-btn st-btn-primary">Reset Password</button>
        </div>
      </form>
    `);

    document.body.appendChild(modal);

    document.getElementById('cancel-password').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleResetPassword(e.target, studentCode);
      modal.remove();
    });
  }

  async function handleResetPassword(form, studentCode) {
    const formData = new FormData(form);
    const password = formData.get('password');

    try {
      await db.upsertStudent({ code: studentCode, password_hash: password });
      console.log('[tc-students] Reset password');
      showToast('Password reset successfully');
    } catch (error) {
      console.error('[tc-students] Error resetting password:', error);
      await rcAlert('Error', 'Failed to reset password');
    }
  }

  async function showAddStudentWizard() {
    try {
      let step = 1;
      let studentData = {};

      // Create modal first, before defining renderStep
      const modal = createModal('Add Student', '');
      document.body.appendChild(modal);

      // Use arrow function instead of function declaration to avoid no-inner-declarations ESLint error
      const renderStep = () => {
        let content = '';
        
        if (step === 1) {
          content = `
            <form id="wizard-step-1">
              <div class="form-group">
                <label>Student Code:</label>
                <input type="text" name="code" value="${escapeHtml(studentData.code || '')}" required>
              </div>
              <div class="form-group">
                <label>Password:</label>
                <input type="text" name="password" value="${escapeHtml(studentData.password || '')}" required>
              </div>
              <div class="form-group">
                <label>Primary Case Manager:</label>
                <input type="text" name="primary_case_manager" value="${escapeHtml(studentData.primary_case_manager || '')}">
              </div>
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="wizard-cancel">Cancel</button>
                <button type="submit" class="btn btn-primary">Next</button>
              </div>
            </form>
          `;
        } else if (step === 2) {
          const checkboxes = FULL_CLASS_NAMES.map(className => `
            <label class="checkbox-label">
              <input type="checkbox" name="enrollment" value="${escapeHtml(className)}"
                ${studentData.enrollments && studentData.enrollments.includes(className) ? 'checked' : ''}>
              ${escapeHtml(className)}
            </label>
          `).join('');

          content = `
            <form id="wizard-step-2">
              <div class="form-group">
                <label>Select Classes:</label>
                <div class="checkbox-group">
                  ${checkboxes}
                </div>
              </div>
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="wizard-back">Back</button>
                <button type="submit" class="btn btn-primary">Next</button>
              </div>
            </form>
          `;
        } else if (step === 3) {
          content = `
            <form id="wizard-step-3">
              <p>Student will be created with ${studentData.enrollments ? studentData.enrollments.length : 0} class enrollments.</p>
              <p>You can add goals after creating the student.</p>
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="wizard-back">Back</button>
                <button type="submit" class="btn btn-primary">Create Student</button>
              </div>
            </form>
          `;
        }

        modal.querySelector('.st-modal-body').innerHTML = `
          <h2>Add Student - Step ${step} of 3</h2>
          ${content}
        `;

        const cancelBtn = document.getElementById('wizard-cancel');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => modal.remove());
        }

        const backBtn = document.getElementById('wizard-back');
        if (backBtn) {
          backBtn.addEventListener('click', () => {
            step--;
            renderStep();
          });
        }

        const form = modal.querySelector('form');
        if (form) {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (step === 1) {
              const formData = new FormData(form);
              studentData.code = formData.get('code');
              studentData.password = formData.get('password');
              studentData.primary_case_manager = formData.get('primary_case_manager');
              step++;
              renderStep();
            } else if (step === 2) {
              const checkboxes = form.querySelectorAll('input[name="enrollment"]');
              studentData.enrollments = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);
              step++;
              renderStep();
            } else if (step === 3) {
              await handleCreateStudent(studentData);
              modal.remove();
            }
          });
        }
      };

      renderStep();
    } catch (error) {
      console.error('[tc-students] Error in showAddStudentWizard:', error);
      await rcAlert('Error', 'Failed to open Add Student wizard. Please check the console for details.');
    }
  }

  async function handleCreateStudent(data) {
    try {
      await db.upsertStudent({
        code: data.code,
        password_hash: data.password,
        primary_case_manager: data.primary_case_manager,
        status: 'active'
      });

      for (const className of data.enrollments || []) {
        const supabase = await getSupabase();
        if (!supabase) continue;
        await supabase
          .from('enrollments')
          .insert({ student_code: data.code, class_name: className });
      }

      console.log('[tc-students] Created student:', data.code);
      await loadData();
      selectStudent(data.code);
    } catch (error) {
      console.error('[tc-students] Error creating student:', error);
      await rcAlert('Error', 'Failed to create student');
    }
  }

  function showNewIEPWizard(studentCode) {
    const student = allStudents.find(s => s.code === studentCode);
    if (!student) return;

    // Initialize wizard data
    if (!iepWizardData || iepWizardData.studentCode !== studentCode) {
      iepWizardData = {
        step: 1,
        studentCode: studentCode,
        goalsToArchive: new Set(),
        newGoals: [],
        iepDue: student.iep_due || '',
        evalDue: student.eval_due || ''
      };
    }

    function renderWizard() {
      let content = '';
      let title = `New IEP for ${studentCode}`;

      if (iepWizardData.step === 1) {
        // Step 1: Review Current Goals + Update Dates
        const studentGoals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
        
        const goalCheckboxes = studentGoals.map(goal => {
          const progressCount = getProgressForGoal(studentCode, goal.code).length;
          const isChecked = iepWizardData.goalsToArchive.has(goal.id);
          return `
            <label class="st-checkbox-label">
              <input type="checkbox" class="archive-goal-cb" data-goal-id="${goal.id}" ${isChecked ? 'checked' : ''}>
              ${escapeHtml(goal.code)} — ${escapeHtml(goal.goal_area)} (${escapeHtml(goal.measurement_type)}) — ${progressCount} data points
            </label>
          `;
        }).join('');

        content = `
          <div class="st-wizard-step-indicator">
            <span class="active">Step 1/3</span>
          </div>
          <form id="wizard-step-1-form">
            <div class="st-form-group">
              <label class="st-form-label">IEP Due Date:</label>
              <input type="date" class="st-form-input" name="iep_due" value="${iepWizardData.iepDue}" required>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Eval Due Date:</label>
              <input type="date" class="st-form-input" name="eval_due" value="${iepWizardData.evalDue}">
            </div>
            
            <div class="st-form-group">
              <label class="st-form-label">Select which current goals to ARCHIVE:</label>
              <div class="st-checkbox-group">
                ${goalCheckboxes || '<p>No active goals found.</p>'}
              </div>
            </div>
            
            ${iepWizardData.goalsToArchive.size > 0 ? `
              <p style="font-size:13px;opacity:0.8;margin-top:8px;">
                ${iepWizardData.goalsToArchive.size} goal(s) will be archived with their progress data
              </p>
            ` : ''}
            
            <div class="st-modal-footer">
              <button type="button" class="st-btn st-btn-secondary" id="wizard-cancel">Cancel</button>
              <button type="submit" class="st-btn st-btn-primary">Next →</button>
            </div>
          </form>
        `;
      } else if (iepWizardData.step === 2) {
        // Step 2: Add New Goals
        content = `
          <div class="st-wizard-step-indicator">
            <span>Step 1/3</span>
            <span class="active">Step 2/3</span>
          </div>
          
          <div class="st-form-group">
            <button type="button" class="st-btn st-btn-primary" id="add-wizard-goal-btn">+ Add Goal</button>
          </div>
          
          <div id="wizard-goals-container">
            ${renderWizardGoals()}
          </div>
          
          <div class="st-modal-footer">
            <button type="button" class="st-btn st-btn-secondary" id="wizard-back">← Back</button>
            <button type="button" class="st-btn st-btn-secondary" id="wizard-cancel">Cancel</button>
            <button type="button" class="st-btn st-btn-primary" id="wizard-next">Next →</button>
          </div>
        `;
      } else if (iepWizardData.step === 3) {
        // Step 3: Review & Confirm
        const studentGoals = allGoals.filter(g => g.student_code === studentCode && g.status !== 'archived');
        const goalsToArchive = studentGoals.filter(g => iepWizardData.goalsToArchive.has(g.id));
        const goalsToKeep = studentGoals.filter(g => !iepWizardData.goalsToArchive.has(g.id));
        const newGoalCodes = iepWizardData.newGoals.map(g => g.code);
        const goalsToReplace = goalsToKeep.filter(g => newGoalCodes.includes(g.code));
        
        content = `
          <div class="st-wizard-step-indicator">
            <span>Step 1/3</span>
            <span>Step 2/3</span>
            <span class="active">Step 3/3</span>
          </div>
          
          <h3 style="font-size:16px;margin:16px 0 8px 0;">DATE CHANGES:</h3>
          <div style="font-size:14px;margin-bottom:16px;">
            <div>IEP Due: ${student.iep_due ? formatDate(student.iep_due) : 'Not set'} → ${formatDate(iepWizardData.iepDue)}</div>
            <div>Eval Due: ${student.eval_due ? formatDate(student.eval_due) : 'Not set'} → ${iepWizardData.evalDue ? formatDate(iepWizardData.evalDue) : 'Not set'}</div>
          </div>
          
          ${goalsToArchive.length > 0 ? `
            <h3 style="font-size:16px;margin:16px 0 8px 0;">ARCHIVING (${goalsToArchive.length} goals):</h3>
            <ul style="font-size:14px;margin-bottom:16px;">
              ${goalsToArchive.map(g => `<li>${escapeHtml(g.code)} — ${escapeHtml(g.goal_area)} (${getProgressForGoal(studentCode, g.code).length} data points preserved)</li>`).join('')}
            </ul>
          ` : ''}
          
          ${goalsToKeep.length > 0 && goalsToReplace.length === 0 ? `
            <h3 style="font-size:16px;margin:16px 0 8px 0;">KEEPING (${goalsToKeep.length} goals):</h3>
            <ul style="font-size:14px;margin-bottom:16px;">
              ${goalsToKeep.map(g => `<li>${escapeHtml(g.code)} — ${escapeHtml(g.goal_area)}</li>`).join('')}
            </ul>
          ` : ''}
          
          ${iepWizardData.newGoals.length > 0 ? `
            <h3 style="font-size:16px;margin:16px 0 8px 0;">ADDING (${iepWizardData.newGoals.length} new goals):</h3>
            <ul style="font-size:14px;margin-bottom:16px;">
              ${iepWizardData.newGoals.map(g => `<li>${escapeHtml(g.code)} — ${escapeHtml(g.goal_area)} (${escapeHtml(g.measurement_type)})</li>`).join('')}
            </ul>
          ` : ''}
          
          ${goalsToReplace.length > 0 ? `
            <h3 style="font-size:16px;margin:16px 0 8px 0;">REPLACING (auto-archived):</h3>
            <ul style="font-size:14px;margin-bottom:16px;">
              ${goalsToReplace.map(g => `<li>${escapeHtml(g.code)} will be archived (replaced by new goal with same code)</li>`).join('')}
            </ul>
          ` : ''}
          
          <div class="st-modal-footer">
            <button type="button" class="st-btn st-btn-secondary" id="wizard-back">← Back</button>
            <button type="button" class="st-btn st-btn-secondary" id="wizard-cancel">Cancel</button>
            <button type="button" class="st-btn st-btn-primary" id="wizard-confirm">Confirm ✓</button>
          </div>
        `;
      }

      return { title, content };
    }

    function renderWizardGoals() {
      if (iepWizardData.newGoals.length === 0) {
        return '<p style="font-size:14px;opacity:0.7;">No goals added yet. Click "+ Add Goal" to add a new goal.</p>';
      }
      
      return iepWizardData.newGoals.map((goal, index) => {
        const validation = validateGoalCode(studentCode, goal.code);
        return `
          <div class="st-wizard-goal-form" data-goal-index="${index}">
            <h4 style="font-size:14px;margin:0 0 12px 0;">Goal ${index + 1}</h4>
            <div class="st-form-group">
              <label class="st-form-label">Goal Code</label>
              <input type="text" class="st-form-input wizard-goal-code" data-index="${index}" value="${escapeHtml(goal.code)}" placeholder="e.g., S004.12.1" required>
              ${validation ? `<div class="st-goal-code-validation ${validation.status}">${validation.message}</div>` : ''}
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Goal Area</label>
              <select class="st-form-select wizard-field" data-index="${index}" data-field="goal_area">
                ${GOAL_AREAS.map(area => `<option value="${escapeHtml(area)}" ${goal.goal_area === area ? 'selected' : ''}>${escapeHtml(area)}</option>`).join('')}
              </select>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Description</label>
              <textarea class="st-form-textarea wizard-field" data-index="${index}" data-field="desc" rows="2" required>${escapeHtml(goal.desc || '')}</textarea>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Measurement</label>
              <select class="st-form-select wizard-field" data-index="${index}" data-field="measurement_type">
                <option value="Accuracy" ${goal.measurement_type === 'Accuracy' ? 'selected' : ''}>Accuracy</option>
                <option value="Frequency" ${goal.measurement_type === 'Frequency' ? 'selected' : ''}>Frequency</option>
                <option value="Duration" ${goal.measurement_type === 'Duration' ? 'selected' : ''}>Duration</option>
                <option value="Rate" ${goal.measurement_type === 'Rate' ? 'selected' : ''}>Rate</option>
                <option value="Observation" ${goal.measurement_type === 'Observation' ? 'selected' : ''}>Observation</option>
              </select>
            </div>
            ${renderObservationConfigHtml(goal.observation_config || null, _cachedSchedulePeriods)}
            <div class="st-form-row">
              <div class="st-form-group">
                <label class="st-form-label">Baseline</label>
                <input type="text" class="st-form-input wizard-field" data-index="${index}" data-field="baseline" value="${escapeHtml(goal.baseline || '')}" required>
              </div>
              <div class="st-form-group">
                <label class="st-form-label">Mastery</label>
                <input type="text" class="st-form-input wizard-field" data-index="${index}" data-field="mastery" value="${escapeHtml(goal.mastery || '')}">
              </div>
              <div class="st-form-group">
                <label class="st-form-label">Target</label>
                <input type="text" class="st-form-input wizard-field" data-index="${index}" data-field="target" value="${escapeHtml(goal.target || '')}" required>
              </div>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Case Manager</label>
              <input type="text" class="st-form-input wizard-field" data-index="${index}" data-field="case_manager" value="${escapeHtml(goal.case_manager || '')}" required>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Data Collector</label>
              <input type="text" class="st-form-input wizard-field" data-index="${index}" data-field="data_collector" value="${escapeHtml(goal.data_collector || '')}" required>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Collector Email (if outside provider)</label>
              <input type="email" class="st-form-input wizard-field" data-index="${index}" data-field="data_collector_email" value="${escapeHtml(goal.data_collector_email || '')}">
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Class Context</label>
              <select class="st-form-select wizard-field" data-index="${index}" data-field="class_context">
                <option value="">None</option>
                ${FULL_CLASS_NAMES.map(cn => `<option value="${escapeHtml(cn)}" ${goal.class_context === cn ? 'selected' : ''}>${escapeHtml(cn)}</option>`).join('')}
              </select>
            </div>
            <div class="st-form-group">
              <label class="st-form-label">Expected Data Points/Quarter</label>
              <input type="number" class="st-form-input wizard-field" data-index="${index}" data-field="expected_data_points" min="1" max="20" value="${goal.expected_data_points || 3}">
            </div>
            <button type="button" class="st-btn st-btn-danger st-btn-small remove-wizard-goal-btn" data-index="${index}">Remove Goal</button>
          </div>
        `;
      }).join('');
    }

    function validateGoalCode(studentCode, goalCode) {
      if (!goalCode) return null;
      
      const existing = allGoals.filter(g => g.student_code === studentCode && g.code === goalCode);
      const activeMatch = existing.find(g => g.status !== 'archived');
      const archivedMatch = existing.find(g => g.status === 'archived');
      
      if (activeMatch) return { status: 'replace', message: '⚠️ This code is active. It will be archived and replaced.' };
      if (archivedMatch) return { status: 'reuse', message: 'ℹ️ This code was previously used (archived). OK to reuse.' };
      return { status: 'new', message: '✅ New goal code' };
    }

    const { title, content } = renderWizard();
    const modal = createModal(title, content);
    document.body.appendChild(modal);

    // Wire up observation config show/hide for any wizard goal forms
    modal.querySelectorAll('.st-wizard-goal-form').forEach(form => {
      initObservationFields(form);
    });

    // Event handlers
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'wizard-cancel') {
        iepWizardData = null;
        modal.remove();
      } else if (e.target.id === 'wizard-back') {
        iepWizardData.step--;
        modal.remove();
        showNewIEPWizard(studentCode);
      } else if (e.target.id === 'wizard-next') {
        if (iepWizardData.step === 2) {
          // Collect observation_config from each wizard goal form before advancing
          const wizardForms = modal.querySelectorAll('.st-wizard-goal-form');
          for (const wform of wizardForms) {
            const idx = parseInt(wform.dataset.goalIndex);
            if (!isNaN(idx) && iepWizardData.newGoals[idx]) {
              const obsErrors = validateObservationConfig(wform);
              if (obsErrors.length > 0) {
                rcAlert('Validation Error', `Goal ${idx + 1}: ${obsErrors.join('\n')}`);
                return;
              }
              iepWizardData.newGoals[idx].observation_config = wform.querySelector('[name="measurement_type"]')?.value === 'Observation' ? gatherObservationConfig(wform) : null;
            }
          }
          iepWizardData.step++;
          modal.remove();
          showNewIEPWizard(studentCode);
        }
      } else if (e.target.id === 'wizard-confirm') {
        handleConfirmIEPWizard();
        modal.remove();
      } else if (e.target.id === 'add-wizard-goal-btn') {
        iepWizardData.newGoals.push({
          code: '',
          goal_area: 'Reading Comprehension',
          desc: '',
          measurement_type: 'Accuracy',
          baseline: '',
          mastery: '',
          target: '',
          case_manager: student.primary_case_manager || '',
          data_collector: 'Dan Reinisch',
          data_collector_email: '',
          class_context: '',
          expected_data_points: 3
        });
        modal.remove();
        showNewIEPWizard(studentCode);
      } else if (e.target.classList.contains('remove-wizard-goal-btn')) {
        const index = parseInt(e.target.dataset.index);
        iepWizardData.newGoals.splice(index, 1);
        modal.remove();
        showNewIEPWizard(studentCode);
      }
    });

    // Handle form submission for step 1
    const step1Form = modal.querySelector('#wizard-step-1-form');
    if (step1Form) {
      step1Form.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(step1Form);
        iepWizardData.iepDue = formData.get('iep_due');
        iepWizardData.evalDue = formData.get('eval_due');
        iepWizardData.step = 2;
        modal.remove();
        showNewIEPWizard(studentCode);
      });
    }

    // Handle checkbox changes for goals to archive
    modal.addEventListener('change', (e) => {
      if (e.target.classList.contains('archive-goal-cb')) {
        const goalId = e.target.dataset.goalId;
        if (e.target.checked) {
          iepWizardData.goalsToArchive.add(goalId);
        } else {
          iepWizardData.goalsToArchive.delete(goalId);
        }
      }
    });

    // Handle wizard field changes
    modal.addEventListener('input', (e) => {
      if (e.target.classList.contains('wizard-field')) {
        const index = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        iepWizardData.newGoals[index][field] = e.target.value;
      } else if (e.target.classList.contains('wizard-goal-code')) {
        const index = parseInt(e.target.dataset.index);
        iepWizardData.newGoals[index].code = e.target.value;
      }
    });

    // Handle goal code validation on blur
    modal.addEventListener('blur', (e) => {
      if (e.target.classList.contains('wizard-goal-code')) {
        // Re-render to show validation
        modal.remove();
        showNewIEPWizard(studentCode);
      }
    }, true);
  }

  async function handleConfirmIEPWizard() {
    if (!iepWizardData) return;

    const { studentCode, goalsToArchive, newGoals, iepDue, evalDue } = iepWizardData;
    
    try {
      // 1. Update student's IEP and eval dates
      await db.upsertStudent({
        code: studentCode,
        iep_due: iepDue,
        eval_due: evalDue || null
      });

      // 2. Archive selected goals
      for (const goalId of goalsToArchive) {
        await db.upsertGoal({ id: goalId, status: 'archived' });
      }

      // 3. For new goals whose code matches an existing active goal: archive the existing one first
      const studentGoals = allGoals.filter(g => g.student_code === studentCode && g.status === 'active');
      for (const newGoal of newGoals) {
        const existingGoal = studentGoals.find(g => g.code === newGoal.code);
        if (existingGoal) {
          await db.upsertGoal({ id: existingGoal.id, status: 'archived' });
        }
      }

      // 4. Create all new goals
      for (const newGoal of newGoals) {
        await db.upsertGoal({
          student_code: studentCode,
          ...newGoal,
          status: 'active',
          version: 1
        });
      }

      // 5. Reload data
      await loadData();
      
      // 6. Show success message
      showToast('New IEP created successfully');
      
      // 7. Keep student expanded
      if (expandedStudents.has(studentCode)) {
        await renderExpandedDetail(studentCode);
      }
      
      // Reset wizard data
      iepWizardData = null;
    } catch (error) {
      console.error('[tc-students] Error creating new IEP:', error);
      await rcAlert('Error', 'Failed to create new IEP');
    }
  }

  function showImportCsvModal() {
    const modal = createModal('Import Students from CSV', `
      <div id="csv-import-container">
        <details style="margin-bottom: 20px; padding: 12px; background: #f5f5f5; border-radius: 4px; border: 1px solid #ddd;">
          <summary style="cursor: pointer; font-weight: 600; margin-bottom: 0;">
            ℹ️ CSV Format Help
          </summary>
          <div style="margin-top: 12px;">
            <p style="margin-top: 0;">Your CSV file should include the following columns:</p>
            <ul style="margin-bottom: 10px; font-size: 0.9em;">
              <li><strong>Student Code Name</strong> - Student identifier (required)</li>
              <li><strong>Case Manager</strong> - Primary case manager name</li>
              <li><strong>IEP Due</strong> (or "Annual Review", "Next IEP") - IEP due date (M/D/YYYY, M/D/YY, or YYYY-MM-DD)</li>
              <li><strong>Eval Due</strong> (or "Evaluation", "Next Eval", "Re-eval") - Evaluation due date (M/D/YYYY, M/D/YY, or YYYY-MM-DD)</li>
              <li><strong>Class</strong> - Class name</li>
              <li><strong>IEP Goal with Student Code</strong> - Goal description</li>
              <li><strong>Student Code IEP Goal Code</strong> - Goal code (e.g., S001.1)</li>
              <li><strong>Goal Area</strong> - Goal category</li>
              <li><strong>Measurement Type</strong> - How progress is measured (percent, trials, etc.)</li>
              <li><strong>Teacher to Collect Data</strong> - Data collector name</li>
              <li><strong>Teacher to Collect Data Email</strong> - Data collector email</li>
            </ul>
            <button type="button" class="btn btn-secondary" id="download-template" style="margin-top: 10px;">
              📥 Download CSV Template
            </button>
          </div>
        </details>
        
        <div class="form-group">
          <label>Select CSV File:</label>
          <input type="file" id="csv-file-input" accept=".csv">
        </div>
        
        <div id="csv-preview" style="display: none;">
          <div id="csv-preview-content"></div>
          <div class="modal-actions" style="margin-top: 20px;">
            <button type="button" class="btn btn-secondary" id="cancel-import">Cancel</button>
            <button type="button" class="btn btn-primary" id="confirm-import">Import</button>
          </div>
        </div>
      </div>
    `);

    document.body.appendChild(modal);

    // Download template button handler
    const downloadBtn = document.getElementById('download-template');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        downloadCsvTemplate();
      });
    }

    const fileInput = document.getElementById('csv-file-input');
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await handleCsvFileSelected(file);
      }
    });

    const cancelBtn = document.getElementById('cancel-import');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => modal.remove());
    }
  }
  
  function downloadCsvTemplate() {
    const headers = [
      'Student Code Name',
      'Case Manager',
      'IEP Due',
      'Eval Due',
      'Class',
      'IEP Goal with Student Code',
      'Student Code IEP Goal Code',
      'Goal Area',
      'Measurement Type',
      'Baseline',
      'Mastery',
      'Teacher to Collect Data',
      'Teacher to Collect Data Email',
      'Student: Active/Inactive'
    ];
    
    const csvContent = headers.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'student_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleCsvFileSelected(file) {
    const text = await file.text();
    const lines = splitCsvIntoRows(text);
    
    if (lines.length < 2) {
      await rcAlert('Validation', 'CSV file must have at least a header row and one data row');
      return;
    }

    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(line => parseCSVLine(line));

    const columnMap = {};
    headers.forEach((header, index) => {
      const normalized = header.trim().toLowerCase();
      if (normalized.includes('student code name')) columnMap.code = index;
      else if (normalized.includes('iep goal with student code')) columnMap.goal_text = index;
      else if (normalized.includes('student code iep goal code')) columnMap.goal_code = index;
      else if (normalized === 'measurement type') columnMap.measurement_type = index;
      else if (normalized === 'class') columnMap.class = index;
      else if (normalized === 'goal area') columnMap.goal_area = index;
      else if (normalized === 'case manager') columnMap.case_manager = index;
      else if (normalized === 'baseline') columnMap.baseline = index;
      else if (normalized === 'mastery') columnMap.mastery = index;
      else if (normalized === 'student: active/inactive' || normalized === 'active/inactive') columnMap.active_status = index;
      else if (normalized.includes('teacher to collect data') && !normalized.includes('email')) columnMap.data_collector = index;
      else if (normalized.includes('teacher to collect data email')) columnMap.data_collector_email = index;
      // More flexible matching for IEP due date
      else if (normalized.includes('annual review') || 
               normalized.includes('iep date') || 
               normalized.includes('next iep') || 
               normalized.includes('iep due')) columnMap.iep_due = index;
      // More flexible matching for Eval due date
      else if (normalized.includes('evaluation') || 
               normalized.includes('eval date') || 
               normalized.includes('next eval') || 
               normalized.includes('eval due') || 
               normalized.includes('re-eval') ||
               normalized.includes('reevaluation')) columnMap.eval_due = index;
    });

    // Fallback: if iep_due or eval_due columns were not matched by header name,
    // try to auto-detect date columns by checking if the last 2 unmatched columns
    // contain date-like values (M/D/YYYY pattern)
    if (columnMap.iep_due === undefined || columnMap.eval_due === undefined) {
      // Check each unmapped column for date-like content in the first data row
      const firstDataRow = rows[0];
      if (firstDataRow) {
        const datePattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
        const unmappedDateCols = [];
        for (let i = 0; i < headers.length; i++) {
          const alreadyMapped = Object.values(columnMap).includes(i);
          if (!alreadyMapped && firstDataRow[i] && datePattern.test(firstDataRow[i].trim())) {
            unmappedDateCols.push(i);
          }
        }
        // If we found exactly 2 unmapped date columns, assume they are iep_due and eval_due
        if (unmappedDateCols.length >= 2) {
          if (columnMap.iep_due === undefined) columnMap.iep_due = unmappedDateCols[0];
          if (columnMap.eval_due === undefined) columnMap.eval_due = unmappedDateCols[1];
        } else if (unmappedDateCols.length === 1) {
          if (columnMap.iep_due === undefined) columnMap.iep_due = unmappedDateCols[0];
        }
      }
    }

    const studentsMap = new Map();
    const existingCodes = new Set((allStudents || []).map(s => s.code));
    
    // Warn if allStudents is empty (might indicate data not loaded)
    if (!allStudents || allStudents.length === 0) {
      console.warn('[tc-students] allStudents is empty. All CSV students will be marked as new. If you expect existing students, ensure data is loaded before importing.');
    }

    for (const row of rows) {
      const code = row[columnMap.code]?.trim();
      if (!code) continue;

      if (!studentsMap.has(code)) {
        
        const iepDueRaw = row[columnMap.iep_due];
        const evalDueRaw = row[columnMap.eval_due];
        const iepDueParsed = parseDateFromCSV(iepDueRaw);
        const evalDueParsed = parseDateFromCSV(evalDueRaw);
        
        // Log warnings for date parsing failures
        if (iepDueRaw && !iepDueParsed) {
          console.warn(`CSV Import: Failed to parse IEP due date for student ${code}: "${iepDueRaw}". Expected format: M/D/YYYY, M-D-YYYY, or YYYY-MM-DD`);
        }
        if (evalDueRaw && !evalDueParsed) {
          console.warn(`CSV Import: Failed to parse Eval due date for student ${code}: "${evalDueRaw}". Expected format: M/D/YYYY, M-D-YYYY, or YYYY-MM-DD`);
        }
        
        studentsMap.set(code, {
          code,
          primary_case_manager: row[columnMap.case_manager]?.trim() || null,
          iep_due: iepDueParsed,
          eval_due: evalDueParsed,
          active: columnMap.active_status !== undefined
            ? (row[columnMap.active_status]?.trim().toLowerCase() !== 'inactive')
            : true,
          enrollments: new Set(),
          goals: [],
          isExisting: existingCodes.has(code)
        });
      } else {
        // Update dates if they were null on first row but present on subsequent rows
        const student = studentsMap.get(code);
        if (!student.iep_due) {
          const iepDueRaw = row[columnMap.iep_due];
          const parsed = parseDateFromCSV(iepDueRaw);
          if (parsed) {
            student.iep_due = parsed;
          } else if (iepDueRaw) {
            console.warn(`CSV Import: Failed to parse IEP due date for student ${code} (subsequent row): "${iepDueRaw}". Expected format: M/D/YYYY, M-D-YYYY, or YYYY-MM-DD`);
          }
        }
        if (!student.eval_due) {
          const evalDueRaw = row[columnMap.eval_due];
          const parsed = parseDateFromCSV(evalDueRaw);
          if (parsed) {
            student.eval_due = parsed;
          } else if (evalDueRaw) {
            console.warn(`CSV Import: Failed to parse Eval due date for student ${code} (subsequent row): "${evalDueRaw}". Expected format: M/D/YYYY, M-D-YYYY, or YYYY-MM-DD`);
          }
        }
      }

      const student = studentsMap.get(code);

      const className = row[columnMap.class]?.trim();
      if (className) {
        student.enrollments.add(className);
      }

      if (row[columnMap.goal_text]?.trim() || row[columnMap.goal_code]?.trim()) {
        const goalText = row[columnMap.goal_text]?.trim();
        const goalCodeFromCSV = row[columnMap.goal_code]?.trim();
        
        // Handle empty description - use goal code as fallback, or empty string if no code
        const description = goalText || goalCodeFromCSV || '';
        
        // Handle malformed goal codes - use as-is or provide fallback
        // Examples: S00911.2 (missing period), S022.12. (trailing period) are kept as-is
        const finalGoalCode = goalCodeFromCSV || `${code}.UNKNOWN`;
        
        student.goals.push({
          goal_text: description,
          code: finalGoalCode, // CSV column is 'goal_code' but DB field is 'code'
          goal_area: row[columnMap.goal_area]?.trim(),
          measurement_type: row[columnMap.measurement_type]?.trim() || 'percent',
          baseline: row[columnMap.baseline]?.trim() || null,
          mastery: row[columnMap.mastery]?.trim() || null,
          case_manager: row[columnMap.case_manager]?.trim(),
          // Store multi-value data_collector as-is (don't split on commas)
          data_collector: row[columnMap.data_collector]?.trim(),
          data_collector_email: row[columnMap.data_collector_email]?.trim() || null,
          class_context: className
        });
      }
    }

    // Log diagnostic information about CSV parsing
    console.log(`[tc-students] CSV parsed: ${rows.length} rows → ${studentsMap.size} unique students`);

    // Convert students Map to Array, ensuring one entry per unique student code
    window.csvImportData = Array.from(studentsMap.values()).map(s => ({
      ...s,
      enrollments: Array.from(s.enrollments)
    }));

    // Verify correct data structure before preview
    console.log(`[tc-students] csvImportData contains ${window.csvImportData.length} student records`);
    console.log(`[tc-students] allStudents contains ${allStudents ? allStudents.length : 0} existing student records`);

    displayCsvPreview(window.csvImportData);
  }

  function parseDateFromCSV(dateStr) {
    if (!dateStr) return null;
    
    // Trim whitespace
    dateStr = dateStr.trim();
    if (!dateStr) return null;
    
    // Try ISO date format (YYYY-MM-DD) first
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // Try M/D/YYYY or M/D/YY format (slash separator)
    const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
      let [, month, day, year] = slashMatch;
      // Handle two-digit year
      if (year.length === 2) {
        year = '20' + year;
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Try M-D-YYYY or M-D-YY format (dash separator)
    const dashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (dashMatch) {
      let [, month, day, year] = dashMatch;
      // Handle two-digit year
      if (year.length === 2) {
        year = '20' + year;
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return null;
  }

  function displayCsvPreview(data) {
    const preview = document.getElementById('csv-preview');
    const content = document.getElementById('csv-preview-content');
    
    // Log preview data for debugging
    console.log(`[tc-students] displayCsvPreview received ${data.length} student records`);
    
    // Safety guard: Deduplicate by code in case parsing somehow produced duplicates
    const seenCodes = new Set();
    const deduplicatedData = [];
    for (const student of data) {
      if (!seenCodes.has(student.code)) {
        seenCodes.add(student.code);
        deduplicatedData.push(student);
      } else {
        // Sanitize student code for logging to prevent log injection
        const sanitizedCode = (student.code || 'UNKNOWN').replace(/[^\w.-]/g, '_').substring(0, 20);
        console.warn(`[tc-students] Duplicate student code detected in CSV preview: ${sanitizedCode}. Using first occurrence.`);
      }
    }
    
    // Log deduplication result
    if (deduplicatedData.length !== data.length) {
      console.warn(`[tc-students] Deduplicated ${data.length} records to ${deduplicatedData.length} unique students`);
    }
    
    // Categorize each student with detailed change tracking
    const newStudents = [];
    const updatedStudents = [];
    const unchangedStudents = [];
    
    // Log categorization start
    console.log(`[tc-students] Categorizing ${deduplicatedData.length} students against ${allStudents ? allStudents.length : 0} existing students`);
    
    // Warn if allStudents is not loaded
    if (!allStudents || allStudents.length === 0) {
      console.warn('[tc-students] allStudents is empty during preview. All students will appear as new. If you expect existing students, ensure data is loaded before importing.');
    }
    
    for (const csvStudent of deduplicatedData) {
      const existingStudent = allStudents ? allStudents.find(s => s.code === csvStudent.code) : null;
      
      if (!existingStudent) {
        // New student
        newStudents.push(csvStudent);
        continue;
      }
      
      // Existing student - detect changes
      const changes = [];
      const existingGoals = allGoals.filter(g => g.student_code === csvStudent.code);
      
      // Check IEP date change
      if (csvStudent.iep_due && csvStudent.iep_due !== existingStudent.iep_due) {
        changes.push(`📅 IEP: ${existingStudent.iep_due ? formatDate(existingStudent.iep_due) : 'N/A'} → ${formatDate(csvStudent.iep_due)}`);
      }
      
      // Check Eval date change
      if (csvStudent.eval_due && csvStudent.eval_due !== existingStudent.eval_due) {
        changes.push(`📅 Eval: ${existingStudent.eval_due ? formatDate(existingStudent.eval_due) : 'N/A'} → ${formatDate(csvStudent.eval_due)}`);
      }
      
      // Check for new goals
      const newGoals = csvStudent.goals.filter(g => !existingGoals.some(eg => eg.code === g.code));
      if (newGoals.length > 0) {
        changes.push(`+ ${newGoals.length} new goal${newGoals.length !== 1 ? 's' : ''}: ${newGoals.map(g => escapeHtml(g.code)).join(', ')}`);
      }
      
      // Check for updated goals (text changed)
      const updatedGoals = csvStudent.goals.filter(g => {
        const eg = existingGoals.find(eg => eg.code === g.code);
        return eg && g.goal_text && eg.desc !== g.goal_text;
      });
      if (updatedGoals.length > 0) {
        changes.push(`~ ${updatedGoals.length} updated: ${updatedGoals.map(g => escapeHtml(g.code)).join(', ')} (text changed)`);
      }
      
      if (changes.length > 0) {
        updatedStudents.push({ ...csvStudent, changes, existingStudent });
      } else {
        unchangedStudents.push(csvStudent);
      }
    }
    
    // Log categorization results
    console.log(`[tc-students] Categorized: ${newStudents.length} new, ${updatedStudents.length} updated, ${unchangedStudents.length} unchanged`);
    
    // Build summary bar
    const summaryParts = [];
    if (newStudents.length > 0) {
      summaryParts.push(`<strong>${newStudents.length}</strong> new`);
    }
    if (updatedStudents.length > 0) {
      summaryParts.push(`<strong>${updatedStudents.length}</strong> updated`);
    }
    if (unchangedStudents.length > 0) {
      summaryParts.push(`<strong>${unchangedStudents.length}</strong> unchanged (hidden)`);
    }
    
    const summaryBar = `
      <div style="padding: 12px 15px; background: #e3f2fd; border: 1px solid #1976d2; border-radius: 6px; margin-bottom: 16px; font-size: 15px;">
        📊 ${summaryParts.join(' · ')}
      </div>
    `;
    
    // Build new student cards
    const newStudentsHtml = newStudents.map(student => {
      const dateParts = [];
      if (student.iep_due) {
        dateParts.push(`IEP: ${formatDate(student.iep_due)}`);
      }
      if (student.eval_due) {
        dateParts.push(`Eval: ${formatDate(student.eval_due)}`);
      }
      const dateText = dateParts.length > 0 ? `📅 ${dateParts.join(' · ')}` : '';
      
      const caseManagerText = student.primary_case_manager ? `👤 Case Manager: ${escapeHtml(student.primary_case_manager)}` : '';
      
      const goalText = student.goals.length > 0 
        ? `+ ${student.goals.length} goal${student.goals.length !== 1 ? 's' : ''}: ${student.goals.map(g => escapeHtml(g.code)).join(', ')}`
        : '';
      
      return `
        <div style="border:1px solid #333; border-radius:8px; padding:12px; margin-bottom:8px; background:#1a1a2e;">
          <div style="font-weight:600; margin-bottom:4px; color:#fff;">🆕 ${escapeHtml(student.code)} (New Student)</div>
          <div style="font-size:13px; color:#aaa; line-height:1.6;">
            ${dateText ? dateText + '<br>' : ''}${caseManagerText ? caseManagerText + '<br>' : ''}${goalText ? goalText : ''}
          </div>
        </div>
      `;
    }).join('');
    
    // Build updated student cards
    const updatedStudentsHtml = updatedStudents.map(student => {
      const changeLines = student.changes.join('<br>');
      
      return `
        <div style="border:1px solid #444; border-left:3px solid #f59e0b; border-radius:8px; padding:12px; margin-bottom:8px; background:#1a1a2e;">
          <div style="font-weight:600; margin-bottom:4px; color:#fff;">✏️ ${escapeHtml(student.code)} (Updated)</div>
          <div style="font-size:13px; color:#aaa; line-height:1.6;">
            ${changeLines}
          </div>
        </div>
      `;
    }).join('');
    
    // Build unchanged students toggle
    const unchangedToggleHtml = unchangedStudents.length > 0 ? `
      <details style="margin-top: 16px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.15);">
        <summary style="cursor: pointer; font-weight: 500; color: inherit;">
          ▶ Show ${unchangedStudents.length} unchanged student${unchangedStudents.length !== 1 ? 's' : ''}
        </summary>
        <div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; font-size: 13px; color: inherit;">
          ${unchangedStudents.map(s => escapeHtml(s.code)).join(', ')}
        </div>
      </details>
    ` : '';
    
    const summaryHtml = `
      ${summaryBar}
      ${newStudentsHtml}
      ${updatedStudentsHtml}
      ${unchangedToggleHtml}
    `;

    content.innerHTML = summaryHtml;
    preview.style.display = 'block';

    // Store categorized data for import handler
    window.csvImportCategorized = { newStudents, updatedStudents, unchangedStudents };
    
    // Update button text and add click handler
    const importBtn = document.getElementById('confirm-import');
    const changedCount = newStudents.length + updatedStudents.length;
    if (changedCount === 0) {
      importBtn.textContent = 'No Changes to Import';
      importBtn.disabled = true;
    } else {
      importBtn.textContent = `Import ${changedCount} Student${changedCount !== 1 ? 's' : ''} (${newStudents.length} new, ${updatedStudents.length} updated)`;
      importBtn.disabled = false;
      
      // Use once option to auto-remove listener after first click
      importBtn.addEventListener('click', async () => {
        // Only import new and updated students (skip unchanged)
        const studentsToImport = [...newStudents, ...updatedStudents];
        await handleConfirmCsvImport(studentsToImport);
        
        // Show success message with counts
        showToast(`Successfully imported ${newStudents.length} new student${newStudents.length !== 1 ? 's' : ''} and updated ${updatedStudents.length} existing student${updatedStudents.length !== 1 ? 's' : ''}`);
      }, { once: true });
    }
  }

  async function handleConfirmCsvImport(data) {
    try {
      const supabase = await getSupabase();
      
      // Import the new data (always merge/upsert mode)
      for (const studentData of data) {
        console.log(`[tc-students] Merging student ${studentData.code}: IEP Due=${studentData.iep_due}, Eval Due=${studentData.eval_due}, isExisting=${studentData.isExisting}`);
        
        await db.upsertStudent({
          code: studentData.code,
          primary_case_manager: studentData.primary_case_manager,
          iep_due: studentData.iep_due,
          eval_due: studentData.eval_due,
          active: studentData.active !== undefined ? studentData.active : true,
          status: 'active'
        });

        for (const className of studentData.enrollments) {
          if (!supabase) continue;
          // Use upsert to prevent duplicate enrollments on re-import
          await supabase
            .from('enrollments')
            .upsert(
              { student_code: studentData.code, class_name: className },
              { onConflict: 'student_code,class_name' }
            );
        }

        for (const goal of studentData.goals) {
          await db.upsertGoal({
            student_code: studentData.code,
            code: goal.code,
            goal_text: goal.goal_text,
            goal_area: goal.goal_area,
            measurement_type: goal.measurement_type,
            baseline: goal.baseline,
            mastery: goal.mastery,
            case_manager: goal.case_manager,
            data_collector: goal.data_collector,
            data_collector_email: goal.data_collector_email,
            class_context: goal.class_context,
            status: 'active',
            version: 1
          });
        }
      }

      console.log('[tc-students] imported/updated', data.length, 'students');
      await loadData();
      document.querySelector('.st-modal-backdrop')?.remove();
    } catch (error) {
      console.error('[tc-students] Error importing CSV:', error);
      await rcAlert('Import Error', 'Failed to import CSV: ' + error.message);
    }
  }

  function createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'st-modal-backdrop active';
    modal.innerHTML = `
      <div class="st-modal">
        <div class="st-modal-header">
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="st-modal-body">
          ${content}
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    return modal;
  }

  // ============================================================================
  // IEP COMPLIANCE DASHBOARD FUNCTIONS
  // ============================================================================

  /**
   * Linear regression helper for goal mastery predictions
   * @param {Array<{x: number, y: number}>} points - Array of data points with x and y coordinates
   * @returns {{slope: number, intercept: number} | null} Regression parameters or null if fewer than 2 points
   */
  function linearRegression(points) {
    const n = points.length;
    if (n < 2) return null;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
  }

  /**
   * Predict value at future date
   */
  function predictAt(regression, daysSinceStart) {
    return regression.intercept + regression.slope * daysSinceStart;
  }

  /**
   * Get or create parent communication log from localStorage
   */
  function getParentCommLog() {
    const stored = localStorage.getItem('rc_parent_comm_log');
    return stored ? JSON.parse(stored) : {};
  }

  /**
   * Save parent communication log to localStorage
   */
  function saveParentCommLog(log) {
    localStorage.setItem('rc_parent_comm_log', JSON.stringify(log));
  }

  /**
   * Render the Compliance tab content
   */
  function renderComplianceTab(student, studentGoals) {
    // Use the already-loaded allProgressEntries (populated by loadProgressEntries at startup)
    // instead of making a separate db.listGoalProgress() call that can fail on the join.
    const progressData = allProgressEntries.filter(p => p.student_code === student.code);
    
    // Get quarter dates
    const quarterDates = getQuarterDates();
    
    // Render all compliance sections
    const sections = [
      renderGoalProgressTimelines(student, studentGoals, progressData),
      renderComplianceChecklist(student, studentGoals, progressData, quarterDates),
      renderParentCommunicationLog(student),
      renderGoalMasteryPredictions(student, studentGoals, progressData)
    ];
    
    return `
      <div class="st-detail-section">
        ${sections.join('')}
      </div>
    `;
  }

  // ── Skills Summary Tab ───────────────────────────────────────────────────────

  /** Tier score thresholds (percent) */
  const SKILL_TIER_EXCELLENT   = 80;
  const SKILL_TIER_ON_TRACK    = 60;
  const SKILL_TIER_NEEDS_SUPPORT = 40;

  /** Minimum score delta (percentage points) to register an upward or downward trend */
  const SKILL_TREND_THRESHOLD = 3;

  /**
   * Friendly display names for known DESE codes.
   * Unknown codes fall back to displaying the raw code.
   */
  const DESE_FRIENDLY_NAMES = {
    'R.1.A.9-12.a': 'Textual Evidence',
    'R.1.B.9-12.a': 'Central Idea & Summarization',
    'R.3.A.9-12.a': 'Word Meaning in Context',
    'R.3.C.9-12.a': 'Text Structure & Purpose',
    'R.5.A.9-12.a': 'Argument Analysis',
    'W.1.A.9-12.a': 'Argumentative Writing',
    'L.1.A.9-12.a': 'Grammar & Language Conventions',
  };

  /** In-memory cache: student_code → { skills: [...] } to avoid re-calling OpenAI */
  const skillsAiCache = new Map();

  /** In-memory cache: student_code → { iepCards, deseCards } for button click handler */
  const skillsCardsCache = new Map();

  /** In-memory cache: student_code → deseRollup[] to avoid re-fetching on tab switch */
  const deseRollupCache = new Map();

  /** Guard against duplicate in-flight AI generation requests (e.g. rapid tab switching) */
  const skillsGenerationInFlight = new Map(); // student.code → true

  /** Placeholder shown in skill card narrative area before AI commentary is generated */
  const SKILL_NARRATIVE_PLACEHOLDER_HTML = '<span class="st-skill-narrative-placeholder">Click \'Generate AI Commentary\' above to see a detailed summary.</span>';

  /**
   * Determine tier string and color config from a 0-100 score.
   */
  function getSkillTier(score) {
    if (score === null || score === undefined) return { tier: 'needs-support', label: 'No Data', border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.08)', dot: '🟡' };
    if (score >= SKILL_TIER_EXCELLENT)     return { tier: 'excellent',     label: 'Strong',        border: 'rgba(34,197,94,0.4)',  bg: 'rgba(34,197,94,0.08)',  dot: '🟢' };
    if (score >= SKILL_TIER_ON_TRACK)      return { tier: 'on-track',      label: 'On Track',      border: 'rgba(59,130,246,0.4)', bg: 'rgba(59,130,246,0.08)', dot: '🔵' };
    if (score >= SKILL_TIER_NEEDS_SUPPORT) return { tier: 'needs-support', label: 'Needs Support', border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.08)', dot: '🟡' };
    return                                        { tier: 'critical',      label: 'Critical',      border: 'rgba(239,68,68,0.4)',  bg: 'rgba(239,68,68,0.08)',  dot: '🔴' };
  }

  /**
   * Map IEP goal_area values to DESE domain prefixes for IEP-alignment detection.
   * Returns a Set of prefixes like 'R.', 'W.', etc.
   * Matching is intentionally broad (substring) so that areas like "Reading Comprehension"
   * and "Written Expression" map to R. and W. respectively. The Set prevents duplicates.
   */
  function getIepDeseDomainPrefixes(studentGoals) {
    const prefixes = new Set();
    for (const goal of studentGoals) {
      if (goal.status === 'archived') continue;
      const area = (goal.goal_area || '').toLowerCase();
      // Reading / Comprehension  →  R.x DESE codes
      if (area.includes('reading') || area.includes('comprehension')) prefixes.add('R.');
      // Writing / Written Expression  →  W.x DESE codes
      if (area.includes('writing') || area.includes('written') || area.includes('expression')) prefixes.add('W.');
      // Language / Grammar  →  L.x DESE codes
      if (area.includes('language') || area.includes('grammar')) prefixes.add('L.');
      // Math  →  M.x DESE codes
      if (area.includes('math')) prefixes.add('M.');
    }
    return prefixes;
  }

  /**
   * Compute IEP goal skill cards from allProgressEntries.
   * goalDataPointsMap (optional): Map<goalId, count> from goal_data_points table — used
   * for the data-points count display so it matches the Goals tab.
   * Returns an array sorted highest score first.
   */
  function computeIepSkillCards(student, studentGoals, goalDataPointsMap = new Map()) {
    const cards = [];
    const currentQ = (() => { try { return getCurrentQuarter(); } catch (e) { return null; } })();
    const prevQ = currentQ ? { Q1: null, Q2: 'Q1', Q3: 'Q2', Q4: 'Q3' }[currentQ] : null;

    for (const goal of studentGoals) {
      if (goal.status === 'archived') continue;
      if (goal.measurement_type === 'Observation') continue; // observations use non-numeric scale

      const entries = getProgressForGoal(student.code, goal.code);
      const numericEntries = entries.filter(e => e.value !== null && e.value !== undefined && !isNaN(parseFloat(e.value)));

      // Current quarter avg
      let currentAvg = null;
      if (currentQ) {
        const range = getQuarterDateRange(currentQ);
        if (range) {
          const qEntries = numericEntries.filter(e => {
            const d = new Date(e.date);
            return d >= range.start && d <= range.end;
          });
          if (qEntries.length > 0) {
            currentAvg = Math.round(qEntries.reduce((s, e) => s + parseFloat(e.value), 0) / qEntries.length * 10) / 10;
          }
        }
      }

      // Previous quarter avg
      let prevAvg = null;
      if (prevQ) {
        const prevRange = getQuarterDateRange(prevQ);
        if (prevRange) {
          const prevEntries = numericEntries.filter(e => {
            const d = new Date(e.date);
            return d >= prevRange.start && d <= prevRange.end;
          });
          if (prevEntries.length > 0) {
            prevAvg = Math.round(prevEntries.reduce((s, e) => s + parseFloat(e.value), 0) / prevEntries.length * 10) / 10;
          }
        }
      }

      // Fallback: use all-time avg if no current-quarter data
      const displayScore = currentAvg !== null ? currentAvg
        : (numericEntries.length > 0 ? Math.round(numericEntries.reduce((s, e) => s + parseFloat(e.value), 0) / numericEntries.length * 10) / 10 : null);

      // Trend
      let trend = 'flat';
      if (currentAvg !== null && prevAvg !== null) {
        const diff = currentAvg - prevAvg;
        if (diff >= SKILL_TREND_THRESHOLD) trend = 'up';
        else if (diff <= -SKILL_TREND_THRESHOLD) trend = 'down';
      }

      // Prefer the goal_data_points count (matches the Goals tab) over goal_progress entry count
      const dataPoints = goalDataPointsMap.has(goal.id)
        ? goalDataPointsMap.get(goal.id)
        : numericEntries.length;

      cards.push({
        type: 'iep',
        code: goal.code,
        area: goal.goal_area || goal.desc || goal.code,
        displayScore,
        currentAvg,
        previousAvg: prevAvg,
        trend,
        dataPoints,
        target: goal.mastery !== undefined && goal.mastery !== null ? parseFloat(goal.mastery) : null,
        baseline: goal.baseline !== undefined && goal.baseline !== null ? parseFloat(goal.baseline) : null,
      });
    }

    // Sort: highest score first, nulls last
    cards.sort((a, b) => {
      if (a.displayScore === null && b.displayScore === null) return 0;
      if (a.displayScore === null) return 1;
      if (b.displayScore === null) return -1;
      return b.displayScore - a.displayScore;
    });

    return cards;
  }

  /**
   * Render a single skill card (IEP or DESE).
   * studentCode is optional; when provided, mastery/DESE-bridge callouts are rendered.
   */
  function renderSkillCard(card, narrativeHtml, studentCode) {
    const score = card.displayScore !== null && card.displayScore !== undefined ? card.displayScore : null;
    const tierInfo = getSkillTier(score);
    const pct = score !== null ? Math.min(100, Math.max(0, score)) : 0;

    let trendHtml = '';
    if (card.type === 'iep') {
      const trendIcon = card.trend === 'up' ? '↑' : card.trend === 'down' ? '↓' : '→';
      const trendColor = card.trend === 'up' ? '#22c55e' : card.trend === 'down' ? '#ef4444' : '#9ca3af';
      trendHtml = `<span style="color:${trendColor};font-weight:700;font-size:16px;margin-left:6px;">${trendIcon}</span>`;
    }

    const iepBadgeHtml = card.type === 'dese' && card.iepAligned
      ? `<span class="st-skill-iep-badge" title="Related to student&#39;s IEP goal area">📌 IEP-aligned</span>`
      : '';

    const confidenceHtml = card.type === 'dese'
      ? `<span class="st-skill-confidence">${card.itemCount} item${card.itemCount !== 1 ? 's' : ''}</span>`
      : `<span class="st-skill-confidence">${card.dataPoints} data point${card.dataPoints !== 1 ? 's' : ''}</span>`;

    const metaHtml = card.type === 'iep' && (card.baseline !== null || card.target !== null)
      ? `<div class="st-skill-meta">
           ${card.baseline !== null ? `<span>Baseline: ${card.baseline}%</span>` : ''}
           ${card.target !== null ? `<span>Target: ${card.target}%</span>` : ''}
         </div>`
      : '';

    const scoreDisplay = score !== null ? `${score}%` : '—';

    // Mastery callout for excellent IEP goals
    let calloutHtml = '';
    if (studentCode && card.type === 'iep' && tierInfo.tier === 'excellent') {
      const safeStudentCode = escapeHtml(studentCode);
      const safeGoalCode = escapeHtml(card.code);
      const safeArea = escapeHtml(card.area);
      const safeBaseline = escapeHtml(score !== null ? String(score) : '');
      calloutHtml = `
        <div class="st-skill-callout st-skill-callout--mastery">
          <span>⭐ This goal appears mastered</span>
          <button class="st-skill-callout-btn" data-action="suggest-goal"
            data-student-code="${safeStudentCode}" data-goal-code="${safeGoalCode}"
            data-goal-area="${safeArea}" data-baseline="${safeBaseline}">💡 Suggest replacement goal</button>
          <button class="st-skill-callout-btn" data-action="archive-goal"
            data-student-code="${safeStudentCode}" data-goal-code="${safeGoalCode}">📋 Archive goal</button>
        </div>
      `;
    } else if (studentCode && card.type === 'dese' && (tierInfo.tier === 'needs-support' || tierInfo.tier === 'critical')) {
      const safeStudentCode = escapeHtml(studentCode);
      const safeDeseCode = escapeHtml(card.code);
      calloutHtml = `
        <div class="st-skill-callout st-skill-callout--dese-bridge">
          <span>💡 This DESE standard is below 50% — consider adding an IEP goal for this area</span>
          <button class="st-skill-callout-btn" data-action="create-iep-goal"
            data-student-code="${safeStudentCode}" data-dese-code="${safeDeseCode}">+ Create IEP Goal for ${safeDeseCode}</button>
        </div>
      `;
    }

    return `
      <div class="st-skill-card st-skill-tier-${tierInfo.tier}" data-skill-code="${escapeHtml(card.code)}" style="border-left-color:${tierInfo.border};background:${tierInfo.bg};">
        <div class="st-skill-card-header">
          <span class="st-skill-dot">${tierInfo.dot}</span>
          <div class="st-skill-title">
            <span class="st-skill-code">${escapeHtml(card.code)}</span>
            <span class="st-skill-area">${escapeHtml(card.area)}</span>
            ${iepBadgeHtml}
          </div>
          <div class="st-skill-score-area">
            <span class="st-skill-score">${escapeHtml(scoreDisplay)}</span>
            ${trendHtml}
            ${confidenceHtml}
          </div>
        </div>
        <div class="st-skill-bar-wrap">
          <div class="st-skill-bar" style="width:${pct}%;background:${tierInfo.border};"></div>
        </div>
        ${metaHtml}
        <div class="st-skill-narrative" id="narrative-${escapeHtml(card.code.replace(/[^a-z0-9]/gi, '_'))}" aria-live="polite" aria-label="AI-generated summary for ${escapeHtml(card.area)}">${narrativeHtml || SKILL_NARRATIVE_PLACEHOLDER_HTML}</div>
        ${calloutHtml}
      </div>
    `;
  }

  /**
   * Render the Skills Summary tab.
   */
  async function renderSkillsSummaryTab(student, studentGoals) {
    // Fetch per-question data point counts (matches Goals tab "14/3" display)
    let goalDataPointsMap = new Map(); // goalId → count
    try {
      if (student.id) {
        const allDataPoints = await db.listGoalDataPoints({ studentId: student.id });
        for (const dp of allDataPoints) {
          if (dp.goal_id) {
            goalDataPointsMap.set(dp.goal_id, (goalDataPointsMap.get(dp.goal_id) || 0) + 1);
          }
        }
      }
    } catch (err) {
      console.warn('[tc-students] renderSkillsSummaryTab: goal data points fetch failed:', err);
    }

    const iepCards = computeIepSkillCards(student, studentGoals, goalDataPointsMap);

    // Determine which DESE domain prefixes correspond to this student's IEP goal areas
    const iepDesePrefixes = [...getIepDeseDomainPrefixes(studentGoals)];

    // Fetch DESE rollups via the dedicated cached function
    let deseCards = [];
    try {
      const rollups = await fetchDeseRollups(student);
      deseCards = rollups
        .filter(d => d.dese_code && d.percent_correct !== null)
        .map(d => ({
          type: 'dese',
          code: d.dese_code,
          area: DESE_FRIENDLY_NAMES[d.dese_code] || d.dese_code,
          displayScore: parseFloat(d.percent_correct),
          itemCount: parseInt(d.item_count, 10) || 0,
          iepAligned: iepDesePrefixes.length > 0 && iepDesePrefixes.some(p => d.dese_code.startsWith(p)),
        }))
        .sort((a, b) => b.displayScore - a.displayScore);
    } catch (err) {
      console.warn('[tc-students] renderSkillsSummaryTab: DESE fetch failed:', err);
    }

    const hasIep = iepCards.length > 0;
    const hasDese = deseCards.length > 0;

    if (!hasIep && !hasDese) {
      return `
        <div class="st-detail-section">
          <div class="st-skill-empty">
            <p>No skills data yet. As assignments are graded and IEP progress is recorded, performance summaries will appear here.</p>
          </div>
        </div>
      `;
    }

    // Store cards so the button click handler can access them
    skillsCardsCache.set(student.code, { iepCards, deseCards });

    const cached = skillsAiCache.get(student.code);

    const btnText = cached ? '✅ Commentary Generated' : '✨ Generate AI Commentary';
    const btnDisabled = cached ? 'disabled' : '';
    const safeCode = escapeHtml(student.code);
    const aiButtonHtml = `
      <div class="st-skills-btn-row">
        <button class="st-ai-generate-btn" id="ai-generate-btn-${safeCode}" ${btnDisabled}>
          ${btnText}
        </button>
        <button class="st-export-btn" id="skills-copy-btn-${safeCode}" type="button">
          📋 Copy for Email
        </button>
        <button class="st-export-btn" id="skills-print-btn-${safeCode}" type="button">
          🖨 Print
        </button>
      </div>
    `;

    // Build strengths & weaknesses strip
    const allCards = [...iepCards, ...deseCards];
    const strengthCards = allCards.filter(c => {
      const tier = getSkillTier(c.displayScore).tier;
      return tier === 'excellent' || tier === 'on-track';
    });
    const concernCards = allCards.filter(c => {
      const tier = getSkillTier(c.displayScore).tier;
      return tier === 'needs-support' || tier === 'critical';
    });

    const buildStripItems = (cards) => cards.map(c => {
      let trendIcon = '';
      if (c.type === 'iep' && c.trend === 'up') trendIcon = ' ↗';
      else if (c.type === 'iep' && c.trend === 'down') trendIcon = ' ↘';
      const scoreStr = c.displayScore !== null ? ` (${c.displayScore}%${trendIcon})` : '';
      return `<span>${escapeHtml(c.area + scoreStr)}</span>`;
    }).join('<span style="opacity:0.4;margin:0 2px;">·</span>');

    const strengthsStripHtml = `
      <div class="st-skill-strengths-strip">
        <div class="st-skill-strengths-row">
          <span class="st-skill-strengths-label good">✅ Strengths:</span>
          ${strengthCards.length > 0
            ? buildStripItems(strengthCards)
            : '<span style="opacity:0.5">None identified yet</span>'}
        </div>
        <div class="st-skill-strengths-row">
          <span class="st-skill-strengths-label concern">⚠️ Needs Attention:</span>
          ${concernCards.length > 0
            ? buildStripItems(concernCards)
            : '<span style="opacity:0.5">None identified</span>'}
        </div>
      </div>
    `;

    const iepSectionHtml = hasIep ? `
      <div class="st-skill-section" data-section="iep">
        <h3 class="st-skill-section-title st-skill-section-toggle">
          🎯 IEP Goal Skills
          <span class="st-skill-section-chevron">▼</span>
        </h3>
        <div class="st-skill-cards-container">
          ${iepCards.map(c => renderSkillCard(c, cached ? getNarrativeHtml(cached, c.code, 'iep') : null, student.code)).join('')}
        </div>
      </div>
    ` : '';

    const deseSectionHtml = `
      <div class="st-skill-section" data-section="dese">
        <h3 class="st-skill-section-title st-skill-section-toggle">
          📚 DESE Standards Performance
          <span class="st-skill-section-chevron">▼</span>
        </h3>
        <div class="st-skill-cards-container">
          ${hasDese
            ? deseCards.map(c => renderSkillCard(c, cached ? getNarrativeHtml(cached, c.code, 'dese') : null, student.code)).join('')
            : `<p class="st-skill-no-data"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:6px;opacity:0.5;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>No DESE standard data yet. Standards data appears here once students complete graded assignments with DESE-tagged questions.</p>`
          }
        </div>
      </div>
    `;

    const html = `
      <div class="st-detail-section" id="skills-tab-${escapeHtml(student.code)}">
        ${aiButtonHtml}
        ${strengthsStripHtml}
        ${iepSectionHtml}
        ${deseSectionHtml}
      </div>
    `;

    return html;
  }

  /**
   * Extract the narrative HTML for a given code from a cached AI result.
   * When `source` is provided ('iep' or 'dese'), only matches entries with that
   * source value to prevent cross-contamination between IEP and DESE narratives.
   * Entries that lack a source field always match (backward compat with older cache).
   * Returns HTML for description, summary, and (when present) goal_recommendation.
   */
  function getNarrativeHtml(cached, code, source) {
    if (!cached || !Array.isArray(cached.skills)) return '';
    const entry = cached.skills.find(s => {
      if (s.code !== code) return false;
      // If a source filter is given and the entry has a source, they must match.
      if (source && s.source && s.source !== source) return false;
      return true;
    });
    if (!entry || !entry.summary) return '';
    let html = '';
    if (entry.description) {
      html += `<p class="st-skill-narrative-description">${escapeHtml(entry.description)}</p>`;
    }
    html += `<p>${escapeHtml(entry.summary)}</p>`;
    if (entry.goal_recommendation) {
      html += `<p class="st-skill-narrative-goal-rec"><strong>💡 Goal Recommendation:</strong> ${escapeHtml(entry.goal_recommendation)}</p>`;
    }
    return html;
  }

  /**
   * Fetch AI narratives from the Netlify function and inject them into the rendered cards.
   */
  async function requestSkillsNarratives(student, iepCards, deseCards) {
    try {
      // Build per-question weakness data for IEP goals (questions < 60% accuracy)
      let iepQuestionWeaknesses = {};
      try {
        const [subsData, assnData, mappData] = await Promise.all([
          db.listSubmissions ? db.listSubmissions({ studentCode: student.code }) : Promise.resolve([]),
          db.listAssignments ? db.listAssignments() : Promise.resolve([]),
          db.listAssignmentGoalMappings ? db.listAssignmentGoalMappings({ studentCode: student.code }) : Promise.resolve([]),
        ]);
        for (const card of iepCards) {
          const qs = getPerQuestionAggregation(card.code, student.code, mappData, subsData, assnData);
          const weak = qs.filter(q => q.accuracy !== null && q.accuracy < AI_WEAKNESS_THRESHOLD);
          if (weak.length > 0) {
            iepQuestionWeaknesses[card.code] = weak.map(q => ({
              text: q.text.slice(0, AI_QUESTION_TEXT_MAX_LEN),
              accuracy: q.accuracy,
              attempts: q.attempts,
            }));
          }
        }
      } catch (_e) {
        // per-question data is optional — continue without it
      }

      const iepPayload = iepCards.map(c => ({
        code: c.code,
        area: c.area,
        current_avg: c.currentAvg !== null ? c.currentAvg : c.displayScore,
        previous_avg: c.previousAvg,
        trend: c.trend,
        data_points: c.dataPoints,
        target: c.target,
        baseline: c.baseline,
        question_weaknesses: iepQuestionWeaknesses[c.code] || [],
      }));

      const desePayload = deseCards.map(c => ({
        code: c.code,
        percent_correct: c.displayScore,
        item_count: c.itemCount,
      }));

      const res = await fetch('/.netlify/functions/teacher-ai-skills-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          student_code: student.code,
          iep_goals: iepPayload,
          dese_standards: desePayload,
        }),
      });

      if (!res.ok) {
        console.warn('[tc-students] AI skills summary returned', res.status, '— skipping narratives');
        document.querySelectorAll('.st-skill-narrative-loading').forEach(el => el.remove());
        return false;
      }

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.skills)) {
        document.querySelectorAll('.st-skill-narrative-loading').forEach(el => el.remove());
        return false;
      }

      // Cache the result
      skillsAiCache.set(student.code, data);

      // Inject narratives into the already-rendered cards, scoped to the correct student
      // and section to prevent cross-contamination between IEP/DESE narratives.
      const skillsTab = document.getElementById(`skills-tab-${student.code}`);
      for (const skill of data.skills) {
        if (!skill.code || !skill.summary) continue;
        // Only handle known source values; skip any unexpected values.
        if (skill.source !== 'iep' && skill.source !== 'dese') continue;
        const safeId = `narrative-${skill.code.replace(/[^a-z0-9]/gi, '_')}`;
        const sectionEl = skillsTab ? skillsTab.querySelector(`[data-section="${skill.source}"]`) : null;
        const searchRoot = sectionEl || skillsTab || document;
        const el = searchRoot.querySelector(`[id="${safeId}"]`);
        if (el && document.body.contains(el)) {
          // Use DOM API to avoid innerHTML XSS — textContent handles all escaping automatically
          el.replaceChildren();
          if (skill.description) {
            const descP = document.createElement('p');
            descP.className = 'st-skill-narrative-description';
            descP.textContent = skill.description;
            el.appendChild(descP);
          }
          const summaryP = document.createElement('p');
          summaryP.textContent = skill.summary;
          el.appendChild(summaryP);
          if (skill.goal_recommendation) {
            const goalP = document.createElement('p');
            goalP.className = 'st-skill-narrative-goal-rec';
            const label = document.createElement('strong');
            label.textContent = '💡 Goal Recommendation: ';
            goalP.appendChild(label);
            goalP.appendChild(document.createTextNode(skill.goal_recommendation));
            el.appendChild(goalP);
          }
        }
      }

      // Remove any remaining loading spinners
      document.querySelectorAll('.st-skill-narrative-loading').forEach(el => el.remove());
      return true;

    } catch (err) {
      console.warn('[tc-students] requestSkillsNarratives failed:', err);
      // Silently remove loading spinners — user still sees the data cards
      document.querySelectorAll('.st-skill-narrative-loading').forEach(el => el.remove());
      return false;
    }
  }

  /**
   * Fetch DESE standard rollups for a student from the `student_dese_rollups` RPC.
   * Results are cached in `deseRollupCache` to avoid redundant round-trips when the
   * teacher switches tabs and back within the same data-load cycle.
   *
   * Returns an array of raw rollup rows:
   *   { dese_code, percent_correct, total_earned, total_possible, item_count }
   */
  async function fetchDeseRollups(student) {
    if (!student?.id) return [];

    const cached = deseRollupCache.get(student.code);
    if (cached) return cached;

    const now = new Date();
    const m = now.getMonth() + 1; // 1-based month
    const schoolYear = m >= 7 ? now.getFullYear() : now.getFullYear() - 1;

    try {
      const supabase = await getSupabase();
      if (!supabase) return [];

      const { data, error } = await supabase.rpc('student_dese_rollups', {
        p_student_id: student.id,
        p_school_year: schoolYear,
      });

      let rows;
      if (!error && Array.isArray(data)) {
        rows = data;
      } else {
        if (error) {
          console.warn('[tc-students] fetchDeseRollups: RPC error:', error.message, '— trying client-side fallback');
        }
        rows = await fetchDeseRollupsFallback(supabase, student.id, schoolYear);
      }

      deseRollupCache.set(student.code, rows);
      return rows;
    } catch (err) {
      console.warn('[tc-students] fetchDeseRollups: failed:', err);
      return [];
    }
  }

  /**
   * Client-side fallback for DESE rollups when the RPC function is not deployed.
   * Queries assignment_instances → submissions → submission_answers → assignment_items
   * and aggregates earned/max points by dese_code.
   *
   * Reads dese_codes directly from assignment_items (always populated by the
   * parser) rather than from assignment_item_mappings, which was previously
   * only populated for items that also had IEP goal_codes.  This ensures that
   * DESE-only students (no IEP goals) see their skills data.
   */
  async function fetchDeseRollupsFallback(supabase, studentId, schoolYear) {
    const { data, error } = await supabase
      .from('assignment_instances')
      .select(`
        submissions (
          submission_answers (
            earned_points,
            max_points,
            assignment_items!assignment_item_id (
              dese_codes
            )
          )
        )
      `)
      // !assignment_item_id disambiguates the FK from submission_answers → assignment_items
      .eq('student_id', studentId)
      .eq('school_year', schoolYear)
      .limit(500);

    if (error) throw error;
    if ((data || []).length >= 500) {
      console.warn('[tc-students] fetchDeseRollupsFallback: hit 500-row limit — DESE rollups may be incomplete. Deploy the student_dese_rollups RPC for accurate data.');
    }

    const rollupMap = new Map(); // dese_code → { earnedSum, maxSum, count }
    for (const instance of data || []) {
      for (const sub of instance.submissions || []) {
        for (const sa of sub.submission_answers || []) {
          const earned = typeof sa.earned_points === 'number' ? sa.earned_points : 0;
          const max = typeof sa.max_points === 'number' ? sa.max_points : 0;
          if (max <= 0) continue;

          const item = sa.assignment_items;
          if (!item || !Array.isArray(item.dese_codes)) continue;

          for (const code of item.dese_codes) {
            if (!code) continue;
            const existing = rollupMap.get(code) || { earnedSum: 0, maxSum: 0, count: 0 };
            existing.earnedSum += earned;
            existing.maxSum += max;
            existing.count += 1;
            rollupMap.set(code, existing);
          }
        }
      }
    }

    return Array.from(rollupMap.entries())
      .filter(([, s]) => s.maxSum > 0)
      .map(([dese_code, s]) => ({
        dese_code,
        percent_correct: Math.round(s.earnedSum / s.maxSum * 1000) / 10,
        total_earned: s.earnedSum,
        total_possible: s.maxSum,
        item_count: s.count,
      }))
      .sort((a, b) => b.percent_correct - a.percent_correct);
  }

  /**
   * Wire up the "Generate AI Commentary" button in the Skills Summary tab.
   * Must be called after the tab HTML has been inserted into the DOM.
   */
  function initSkillsTabButton(contentDiv, student, signal) {
    const btnId = `ai-generate-btn-${student.code}`;
    const btn = document.getElementById(btnId);
    if (!btn || !contentDiv.contains(btn)) return;

    const listenerOpts = signal ? { signal } : undefined;

    // Wire up collapsible section toggles
    contentDiv.querySelectorAll('.st-skill-section-toggle').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.st-skill-section');
        if (section) {
          section.classList.toggle('collapsed');
        }
      }, listenerOpts);
    });

    btn.addEventListener('click', async () => {
      // Guard against duplicate in-flight requests (e.g. rapid tab switching)
      if (skillsGenerationInFlight.get(student.code)) return;

      // If already in final-failure state, treat as a retry
      const isRetry = btn.dataset.aiState === 'failed';

      btn.disabled = true;
      btn.textContent = 'Generating…';
      btn.dataset.aiState = '';
      btn.style.borderColor = '';
      btn.style.color = '';

      // Replace placeholders with loading spinners while generating
      contentDiv.querySelectorAll('.st-skill-narrative-placeholder').forEach(el => {
        el.className = 'st-skill-narrative-loading';
        el.setAttribute('role', 'status');
        el.textContent = 'Generating summary…';
      });

      const cards = skillsCardsCache.get(student.code);
      if (!cards) {
        btn.disabled = false;
        btn.textContent = '✨ Generate AI Commentary';
        return;
      }

      skillsGenerationInFlight.set(student.code, true);
      const succeeded = await requestSkillsNarratives(student, cards.iepCards, cards.deseCards);
      skillsGenerationInFlight.delete(student.code);

      if (skillsAiCache.has(student.code)) {
        btn.textContent = '✅ Commentary Generated';
        // Keep disabled — reload the tab to regenerate
      } else if (isRetry) {
        // Second failure — show final unavailable state
        btn.disabled = true;
        btn.textContent = 'AI summary unavailable';
        btn.dataset.aiState = 'unavailable';
        contentDiv.querySelectorAll('.st-skill-narrative').forEach(el => {
          if (!el.textContent.trim()) {
            el.replaceChildren();
            const span = document.createElement('span');
            span.className = 'st-skill-narrative-placeholder';
            span.textContent = 'Click \'Generate AI Commentary\' above to see a detailed summary.';
            el.appendChild(span);
          }
        });
      } else {
        // First failure — offer a retry
        btn.disabled = false;
        btn.textContent = '⚠️ AI summary failed — Retry?';
        btn.dataset.aiState = 'failed';
        btn.style.borderColor = 'rgba(245,158,11,0.5)';
        btn.style.color = 'rgba(245,158,11,0.9)';
        contentDiv.querySelectorAll('.st-skill-narrative').forEach(el => {
          if (!el.textContent.trim()) {
            el.replaceChildren();
            const span = document.createElement('span');
            span.className = 'st-skill-narrative-placeholder';
            span.textContent = 'Click \'Generate AI Commentary\' above to see a detailed summary.';
            el.appendChild(span);
          }
        });
      }
    }, listenerOpts);
  }

  /**
   * Compute the earliest and latest dates from IEP card progress entries.
   * Returns { earliestDate, latestDate } (both Date | null).
   */
  function getSkillsDateRange(studentCode, iepCards) {
    const entries = getProgressForGoal
      ? (iepCards || []).flatMap(c => {
          try { return getProgressForGoal(studentCode, c.code); } catch (_e) { return []; }
        })
      : [];
    let earliestDate = null;
    let latestDate = null;
    for (const e of entries) {
      if (!e.date) continue;
      const d = new Date(e.date);
      if (!earliestDate || d < earliestDate) earliestDate = d;
      if (!latestDate || d > latestDate) latestDate = d;
    }
    return { earliestDate, latestDate };
  }

  /**
   * Sort concern cards by severity (critical first, then needs-support),
   * then by percentage ascending within each tier.
   */
  function sortConcernCards(cards) {
    const tierOrder = { critical: 0, 'needs-support': 1 };
    return [...cards].sort((a, b) => {
      const ta = tierOrder[getSkillTier(a.displayScore).tier] ?? 2;
      const tb = tierOrder[getSkillTier(b.displayScore).tier] ?? 2;
      if (ta !== tb) return ta - tb;
      return (a.displayScore ?? 0) - (b.displayScore ?? 0);
    });
  }

  /**
   * Return a formatted item count string for a skill card.
   * e.g. "(9 items)" for DESE cards, "(5 pts)" for IEP cards.
   */
  function skillCardCountLabel(card, parens) {
    const count = card.type === 'dese'
      ? `${card.itemCount} items`
      : `${card.dataPoints} pts`;
    return parens ? `(${count})` : count;
  }

  /**
   * Build a plain-text Skills Summary report suitable for pasting into a plain-text editor.
   * Reads from cached card data and AI narratives — no new API calls.
   * Uses simple unicode symbols instead of emojis for consistent rendering.
   */
  function buildSkillsSummaryText(student, iepCards, deseCards) {
    const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const iepDate = student.iep_due ? formatDate(student.iep_due) : 'N/A';
    const evalDate = student.eval_due ? formatDate(student.eval_due) : 'N/A';
    const status = student.status ? (student.status.charAt(0).toUpperCase() + student.status.slice(1)) : 'N/A';
    const studentName = student.name || student.code;

    const { earliestDate, latestDate } = getSkillsDateRange(student.code, iepCards);
    const dataRange = (earliestDate && latestDate)
      ? `${earliestDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} \u2013 ${latestDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
      : 'N/A';

    const divider = '\u2500'.repeat(51);
    const cached = skillsAiCache.get(student.code);
    const hasAi = cached && Array.isArray(cached.skills) && cached.skills.length > 0;

    const tierSymbol = (score) => {
      if (score === null || score === undefined) return '[!]';
      if (score >= SKILL_TIER_ON_TRACK) return '[\u2713]';
      if (score >= SKILL_TIER_NEEDS_SUPPORT) return '[!]';
      return '[X]';
    };
    const tierLabel = (score) => getSkillTier(score).label;

    const getAiEntry = (code, source) => {
      if (!hasAi) return null;
      return cached.skills.find(s => {
        if (s.code !== code) return false;
        if (source && s.source && s.source !== source) return false;
        return true;
      }) || null;
    };

    let lines = [];

    lines.push(`[REPORT] Skills Summary Report \u2014 ${student.code} (${studentName})`);
    lines.push(`IEP Date: ${iepDate} \u00b7 Evaluation: ${evalDate} \u00b7 Status: ${status}`);
    lines.push(`Data collected: ${dataRange} \u00b7 Generated: ${today}`);
    lines.push('');
    lines.push(divider);

    // IEP Goals section
    if (iepCards && iepCards.length > 0) {
      lines.push('');
      lines.push('[GOALS] IEP Goal Skills');
      lines.push('');
      for (const c of iepCards) {
        const score = c.displayScore !== null ? `${c.displayScore}%` : '\u2014';
        const ai = getAiEntry(c.code, 'iep');
        const description = ai ? ai.description || '' : '';
        const summary = ai ? ai.summary || '' : '';
        const goalRec = ai ? ai.goal_recommendation || '' : '';
        const tier = tierLabel(c.displayScore);

        lines.push(`${c.code} \u2014 ${c.area} \u00b7 ${score} \u00b7 ${tierSymbol(c.displayScore)} ${tier}`);
        if (description) lines.push(`  ${description}`);

        const baseline = c.baseline !== null ? `${c.baseline}%` : '?';
        const current = c.displayScore !== null ? `${c.displayScore}%` : '\u2014';
        const target = c.target !== null ? `${c.target}%` : '?';
        lines.push(`\u2192 ${c.dataPoints} data point${c.dataPoints !== 1 ? 's' : ''} \u00b7 Baseline: ${baseline} \u2192 Current: ${current} (Target: ${target})`);

        if (summary) lines.push(summary);
        if (goalRec && (c.displayScore === null || c.displayScore < SKILL_TIER_ON_TRACK)) {
          lines.push(`  [*] Goal recommendation: ${goalRec}`);
        }
        lines.push('');
      }
      lines.push(divider);
    }

    // DESE Standards sections
    const allCards = [...(iepCards || []), ...(deseCards || [])];
    const strengthCards = allCards.filter(c => {
      const t = getSkillTier(c.displayScore).tier;
      return t === 'excellent' || t === 'on-track';
    });
    const concernCards = sortConcernCards(allCards.filter(c => {
      const t = getSkillTier(c.displayScore).tier;
      return t === 'needs-support' || t === 'critical';
    }));

    lines.push('');
    lines.push(`[\u2713] Strengths (\u2265${SKILL_TIER_ON_TRACK}%)`);
    if (strengthCards.length > 0) {
      for (const c of strengthCards) {
        const score = c.displayScore !== null ? `${c.displayScore}%` : '\u2014';
        lines.push(`  \u25cf ${c.code} \u2014 ${score} ${skillCardCountLabel(c, true)}`);
      }
    } else {
      lines.push('  None identified yet');
    }
    lines.push('');

    lines.push(`[!] Needs Attention (<${SKILL_TIER_ON_TRACK}%)`);
    if (concernCards.length > 0) {
      for (const c of concernCards) {
        const score = c.displayScore !== null ? `${c.displayScore}%` : '\u2014';
        const ai = getAiEntry(c.code, c.type === 'dese' ? 'dese' : 'iep');
        const description = ai ? ai.description || '' : '';
        const symbol = tierSymbol(c.displayScore);
        const label = tierLabel(c.displayScore);
        let line = `  ${symbol} ${c.code} \u2014 ${score} ${skillCardCountLabel(c, true)} ${label}`;
        if (description) line += ` \u2014 ${description}`;
        lines.push(line);
      }
    } else {
      lines.push('  None identified');
    }

    // Goal recommendations from AI
    const recommendations = [];
    for (const c of [...(iepCards || []), ...(deseCards || [])]) {
      const t = getSkillTier(c.displayScore).tier;
      if (t !== 'needs-support' && t !== 'critical') continue;
      const ai = getAiEntry(c.code, c.type === 'dese' ? 'dese' : 'iep');
      if (ai && ai.goal_recommendation) {
        recommendations.push({ code: c.code, rec: ai.goal_recommendation });
      }
    }

    if (recommendations.length > 0) {
      lines.push('');
      lines.push(divider);
      lines.push('');
      lines.push('[*] Goal Recommendations (AI-generated)');
      for (const r of recommendations) {
        lines.push(`  \u25cf ${r.code}: "${r.rec}"`);
      }
    }

    if (!hasAi) {
      lines.push('');
      lines.push('(AI commentary not yet generated \u2014 click "Generate AI Commentary" on the Skills Summary tab.)');
    }

    return lines.join('\n');
  }

  /**
   * Build a rich HTML Skills Summary report suitable for pasting into Gmail, Outlook, or Apple Mail.
   * Uses inline styles and inline SVG icons for maximum email-client compatibility.
   * Reads from cached card data and AI narratives — no new API calls.
   */
  function buildSkillsSummaryHtml(student, iepCards, deseCards) {
    const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const iepDate = student.iep_due ? formatDate(student.iep_due) : 'N/A';
    const evalDate = student.eval_due ? formatDate(student.eval_due) : 'N/A';
    const status = student.status ? (student.status.charAt(0).toUpperCase() + student.status.slice(1)) : 'N/A';
    const studentName = student.name || student.code;

    const { earliestDate, latestDate } = getSkillsDateRange(student.code, iepCards);
    const dataRange = (earliestDate && latestDate)
      ? `${earliestDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} \u2013 ${latestDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
      : 'N/A';

    const cached = skillsAiCache.get(student.code);
    const hasAi = cached && Array.isArray(cached.skills) && cached.skills.length > 0;

    const getAiEntry = (code, source) => {
      if (!hasAi) return null;
      return cached.skills.find(s => {
        if (s.code !== code) return false;
        if (source && s.source && s.source !== source) return false;
        return true;
      }) || null;
    };

    // Tier color mapping for HTML output
    const tierHtmlColor = (score) => {
      if (score === null || score === undefined) return '#d97706';
      if (score >= SKILL_TIER_ON_TRACK) return '#16a34a';
      if (score >= SKILL_TIER_NEEDS_SUPPORT) return '#d97706';
      return '#dc2626';
    };

    // Inline SVG icons
    const SVG_BAR_CHART = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>';
    const SVG_TARGET = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
    const SVG_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>';
    const SVG_WARN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    const SVG_X_CIRCLE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    const SVG_TREND = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
    const SVG_CHECK_CIRCLE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    const SVG_WARN_SECTION = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    const SVG_BULB = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>';

    const tierIcon = (score) => {
      if (score === null || score === undefined) return SVG_WARN;
      if (score >= SKILL_TIER_ON_TRACK) return SVG_CHECK;
      if (score >= SKILL_TIER_NEEDS_SUPPORT) return SVG_WARN;
      return SVG_X_CIRCLE;
    };

    const HR = '<hr style="border:none;border-top:2px solid #e5e7eb;margin:20px 0;" />';
    const fontStack = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

    let html = `<div style="font-family:${fontStack};max-width:680px;color:#1f2937;line-height:1.6;">`;

    // Header
    html += `<div style="border-bottom:3px solid #10b981;padding-bottom:12px;margin-bottom:16px;">`;
    html += `<h2 style="margin:0 0 4px;font-size:18px;color:#111827;">${SVG_BAR_CHART}Skills Summary Report \u2014 ${escapeHtml(student.code)} (${escapeHtml(studentName)})</h2>`;
    html += `<div style="font-size:13px;color:#6b7280;">IEP Date: ${escapeHtml(iepDate)} \u00b7 Evaluation: ${escapeHtml(evalDate)} \u00b7 Status: ${escapeHtml(status)}<br/>Data collected: ${escapeHtml(dataRange)} \u00b7 Generated: ${escapeHtml(today)}</div>`;
    html += `</div>`;

    // IEP Goals section
    if (iepCards && iepCards.length > 0) {
      html += `<h3 style="font-size:15px;color:#111827;margin:20px 0 12px;">${SVG_TARGET}IEP Goal Skills</h3>`;

      for (const c of iepCards) {
        const score = c.displayScore !== null ? `${c.displayScore}%` : '\u2014';
        const ai = getAiEntry(c.code, 'iep');
        const description = ai ? ai.description || '' : '';
        const summary = ai ? ai.summary || '' : '';
        const goalRec = ai ? ai.goal_recommendation || '' : '';
        const tierInfo = getSkillTier(c.displayScore);
        const borderColor = tierHtmlColor(c.displayScore);

        const baseline = c.baseline !== null ? `${c.baseline}%` : '?';
        const current = c.displayScore !== null ? `${c.displayScore}%` : '\u2014';
        const target = c.target !== null ? `${c.target}%` : '?';

        html += `<div style="border-left:3px solid ${borderColor};padding:10px 14px;margin-bottom:14px;background:#f9fafb;border-radius:0 6px 6px 0;">`;
        html += `<div style="font-size:14px;font-weight:600;color:#111827;">${tierIcon(c.displayScore)}${escapeHtml(c.code)} \u2014 ${escapeHtml(c.area)} \u00b7 ${escapeHtml(score)} \u00b7 ${escapeHtml(tierInfo.label)}</div>`;
        if (description) {
          html += `<div style="font-size:12px;color:#6b7280;font-style:italic;margin:4px 0;">${escapeHtml(description)}</div>`;
        }
        html += `<div style="font-size:12px;color:#4b5563;margin:4px 0;">${SVG_TREND}${escapeHtml(String(c.dataPoints))} data point${c.dataPoints !== 1 ? 's' : ''} \u00b7 Baseline: ${escapeHtml(baseline)} \u2192 Current: ${escapeHtml(current)} (Target: ${escapeHtml(target)})</div>`;
        if (summary) {
          html += `<div style="font-size:13px;color:#374151;margin-top:6px;">${escapeHtml(summary)}</div>`;
        }
        if (goalRec && (c.displayScore === null || c.displayScore < SKILL_TIER_ON_TRACK)) {
          html += `<div style="font-size:12px;color:#6366f1;margin-top:6px;font-style:italic;">${SVG_BULB}Recommendation: ${escapeHtml(goalRec)}</div>`;
        }
        html += `</div>`;
      }

      html += HR;
    }

    // DESE Standards sections
    const allCards = [...(iepCards || []), ...(deseCards || [])];
    const strengthCards = allCards.filter(c => {
      const t = getSkillTier(c.displayScore).tier;
      return t === 'excellent' || t === 'on-track';
    });
    const concernCards = sortConcernCards(allCards.filter(c => {
      const t = getSkillTier(c.displayScore).tier;
      return t === 'needs-support' || t === 'critical';
    }));

    // Strengths section
    html += `<h3 style="font-size:15px;color:#16a34a;margin:0 0 10px;">${SVG_CHECK_CIRCLE}Strengths (\u2265${SKILL_TIER_ON_TRACK}%)</h3>`;
    if (strengthCards.length > 0) {
      html += `<ul style="margin:0;padding-left:20px;font-size:13px;color:#374151;">`;
      for (const c of strengthCards) {
        const score = c.displayScore !== null ? `${c.displayScore}%` : '\u2014';
        html += `<li style="margin-bottom:4px;">${SVG_CHECK}<strong>${escapeHtml(c.code)}</strong> \u2014 ${escapeHtml(score)} (${escapeHtml(skillCardCountLabel(c, false))})</li>`;
      }
      html += `</ul>`;
    } else {
      html += `<p style="font-size:13px;color:#6b7280;margin:0;">None identified yet</p>`;
    }

    html += HR;

    // Needs Attention section
    html += `<h3 style="font-size:15px;color:#d97706;margin:0 0 10px;">${SVG_WARN_SECTION}Needs Attention (&lt;${SKILL_TIER_ON_TRACK}%)</h3>`;
    if (concernCards.length > 0) {
      html += `<ul style="margin:0;padding-left:20px;font-size:13px;">`;
      for (const c of concernCards) {
        const score = c.displayScore !== null ? `${c.displayScore}%` : '\u2014';
        const ai = getAiEntry(c.code, c.type === 'dese' ? 'dese' : 'iep');
        const description = ai ? ai.description || '' : '';
        const tierInfo = getSkillTier(c.displayScore);
        const isCritical = tierInfo.tier === 'critical';
        const itemColor = isCritical ? '#dc2626' : '#d97706';
        const icon = isCritical ? SVG_X_CIRCLE : SVG_WARN;

        html += `<li style="margin-bottom:6px;color:${itemColor};">${icon}<strong>${escapeHtml(c.code)}</strong> \u2014 ${escapeHtml(score)} (${escapeHtml(skillCardCountLabel(c, false))}) <span style="font-weight:600;">${escapeHtml(tierInfo.label)}</span>`;
        if (description) {
          html += `<div style="font-size:12px;color:#6b7280;font-style:italic;margin-top:2px;">${escapeHtml(description)}</div>`;
        }
        html += `</li>`;
      }
      html += `</ul>`;
    } else {
      html += `<p style="font-size:13px;color:#6b7280;margin:0;">None identified</p>`;
    }

    // Goal recommendations from AI
    const recommendations = [];
    for (const c of [...(iepCards || []), ...(deseCards || [])]) {
      const t = getSkillTier(c.displayScore).tier;
      if (t !== 'needs-support' && t !== 'critical') continue;
      const ai = getAiEntry(c.code, c.type === 'dese' ? 'dese' : 'iep');
      if (ai && ai.goal_recommendation) {
        recommendations.push({ code: c.code, rec: ai.goal_recommendation });
      }
    }

    if (recommendations.length > 0) {
      html += HR;
      html += `<h3 style="font-size:15px;color:#6366f1;margin:0 0 10px;">${SVG_BULB}Goal Recommendations (AI-generated)</h3>`;
      html += `<ul style="margin:0;padding-left:20px;font-size:13px;color:#374151;">`;
      for (const r of recommendations) {
        html += `<li style="margin-bottom:6px;"><strong>${escapeHtml(r.code)}:</strong> <em>\u201c${escapeHtml(r.rec)}\u201d</em></li>`;
      }
      html += `</ul>`;
    }

    if (!hasAi) {
      html += `<div style="font-size:12px;color:#9ca3af;margin-top:20px;font-style:italic;">AI commentary not yet generated \u2014 click \u201cGenerate AI Commentary\u201d on the Skills Summary tab.</div>`;
    }

    html += `</div>`;
    return html;
  }

  /**
   * Wire up the "Copy for Email" and "Print" buttons on the Skills Summary tab.
   * Must be called after the tab HTML has been inserted into the DOM.
   */
  function initSkillsExportButtons(contentDiv, student, signal) {
    const listenerOpts = signal ? { signal } : undefined;

    const copyBtn = contentDiv.querySelector(`#skills-copy-btn-${student.code}`);
    const printBtn = contentDiv.querySelector(`#skills-print-btn-${student.code}`);

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const cards = skillsCardsCache.get(student.code);
        if (!cards) return;
        const html = buildSkillsSummaryHtml(student, cards.iepCards, cards.deseCards);
        const text = buildSkillsSummaryText(student, cards.iepCards, cards.deseCards);
        try {
          const blob = new Blob([html], { type: 'text/html' });
          const textBlob = new Blob([text], { type: 'text/plain' });
          await navigator.clipboard.write([
            new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })
          ]);
          const orig = copyBtn.textContent;
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => { copyBtn.textContent = orig; }, 2000);
        } catch (_e) {
          // Fallback to plain text for browsers that don't support ClipboardItem
          try {
            await navigator.clipboard.writeText(text);
            const orig = copyBtn.textContent;
            copyBtn.textContent = '✓ Copied!';
            setTimeout(() => { copyBtn.textContent = orig; }, 2000);
          } catch (_e2) {
            copyBtn.textContent = '⚠️ Copy failed — check browser permissions';
            setTimeout(() => { copyBtn.textContent = '📋 Copy for Email'; }, 2000);
          }
        }
      }, listenerOpts);
    }

    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      }, listenerOpts);
    }
  }

  // ── End Skills Summary Tab ───────────────────────────────────────────────────

  /**
   * A1. Goal Progress Timeline Charts (SVG-based)
   */
  function renderGoalProgressTimelines(student, studentGoals, progressData) {
    if (studentGoals.length === 0) {
      return `
        <div class="st-compliance-section">
          <h3>📈 Goal Progress Timelines</h3>
          <p style="opacity: 0.7;">No goals to display</p>
        </div>
      `;
    }
    
    const charts = studentGoals.map(goal => {
      const goalProgress = progressData.filter(p => p.goal_code === goal.code || p.goal_id === goal.id);
      return renderTimelineChart(goal, goalProgress);
    }).join('');
    
    return `
      <div class="st-compliance-section">
        <h3>📈 Goal Progress Timelines</h3>
        ${charts}
      </div>
    `;
  }

  /**
   * Render a single SVG timeline chart for a goal
   */
  function renderTimelineChart(goal, progressEntries) {
    if (!progressEntries || progressEntries.length === 0) {
      return `
        <div class="st-timeline-chart-container" style="margin-bottom: 24px;">
          <div style="font-weight: 600; margin-bottom: 8px;">${escapeHtml(goal.code)} - ${escapeHtml(goal.goal_area || '')}</div>
          <div style="padding: 40px; text-align: center; background: rgba(255,255,255,0.04); border-radius: 8px; opacity: 0.7;">
            No data collected yet
          </div>
        </div>
      `;
    }
    
    // Sort progress by date
    const sorted = [...progressEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Chart dimensions
    const width = 600;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Get data range
    const minDate = new Date(sorted[0].date);
    const maxDate = new Date(sorted[sorted.length - 1].date);
    // Handle single data point by adding 1 day range (86400000ms = 1 day)
    const MS_PER_DAY = 86400000;
    const dateRange = sorted.length === 1 ? MS_PER_DAY : (maxDate - minDate);
    
    const baselineNum = parseGoalValue(goal.baseline) ?? 0;
    const masteryNum = parseGoalValue(goal.mastery || goal.target) ?? 100;
    const maxY = Math.max(100, masteryNum, ...sorted.map(p => p.percent));
    const minY = Math.min(0, baselineNum);
    // Handle all points having same value by adding small range
    const yRange = (maxY - minY) || 10;
    
    // Scale functions
    const scaleX = (date) => {
      const d = new Date(date);
      if (sorted.length === 1) {
        // Center single point
        return padding.left + chartWidth / 2;
      }
      return padding.left + ((d - minDate) / dateRange) * chartWidth;
    };
    const scaleY = (value) => {
      return height - padding.bottom - ((value - minY) / yRange) * chartHeight;
    };
    
    // Build SVG path for progress line
    const pathData = sorted.map((p, i) => {
      const x = scaleX(p.date);
      const y = scaleY(p.percent);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
    
    // Build data point circles
    const circles = sorted.map(p => {
      const cx = scaleX(p.date);
      const cy = scaleY(p.percent);
      const dateStr = formatDate(p.date);
      return `<circle cx="${cx}" cy="${cy}" r="4" fill="#22c55e" stroke="#1a1a1a" stroke-width="2">
        <title>${dateStr}: ${p.percent}%</title>
      </circle>`;
    }).join('');
    
    // Baseline and mastery lines
    const baselineY = scaleY(baselineNum);
    const masteryY = scaleY(masteryNum);
    
    return `
      <div class="st-timeline-chart-container" style="margin-bottom: 24px;">
        <div style="font-weight: 600; margin-bottom: 8px;">${escapeHtml(goal.code)} - ${escapeHtml(goal.goal_area || '')}</div>
        <svg width="${width}" height="${height}" style="background: rgba(255,255,255,0.04); border-radius: 8px;">
          <!-- Baseline line (gray dashed) -->
          <line x1="${padding.left}" y1="${baselineY}" x2="${width - padding.right}" y2="${baselineY}" 
                stroke="#9ca3af" stroke-width="2" stroke-dasharray="5,5" />
          <text x="${padding.left - 5}" y="${baselineY - 5}" fill="#9ca3af" font-size="10" text-anchor="end">
            Baseline: ${escapeHtml(String(goal.baseline || 0))}
          </text>
          
          <!-- Mastery line (gold dashed) -->
          <line x1="${padding.left}" y1="${masteryY}" x2="${width - padding.right}" y2="${masteryY}" 
                stroke="#fbbf24" stroke-width="2" stroke-dasharray="5,5" />
          <text x="${padding.left - 5}" y="${masteryY - 5}" fill="#fbbf24" font-size="10" text-anchor="end">
            Mastery: ${escapeHtml(String(goal.mastery || goal.target || 100))}
          </text>
          
          <!-- Progress line (teal/green) -->
          ${sorted.length > 1 ? `<path d="${pathData}" fill="none" stroke="#22c55e" stroke-width="3" />` : ''}
          
          <!-- Data points -->
          ${circles}
          
          <!-- Y-axis labels -->
          <text x="${padding.left - 10}" y="${scaleY(0)}" fill="rgba(240,255,250,0.6)" font-size="10" text-anchor="end">0%</text>
          <text x="${padding.left - 10}" y="${scaleY(50)}" fill="rgba(240,255,250,0.6)" font-size="10" text-anchor="end">50%</text>
          <text x="${padding.left - 10}" y="${scaleY(100)}" fill="rgba(240,255,250,0.6)" font-size="10" text-anchor="end">100%</text>
        </svg>
      </div>
    `;
  }

  /**
   * A2. Compliance Checklist (Quarterly Grid)
   */
  function renderComplianceChecklist(student, studentGoals, progressData, quarterDates) {
    if (studentGoals.length === 0) {
      return `
        <div class="st-compliance-section">
          <h3>✅ Compliance Checklist</h3>
          <p style="opacity: 0.7;">No goals to track</p>
        </div>
      `;
    }
    
    const currentQ = getCurrentQuarter();
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    
    // Build compliance grid
    const rows = studentGoals.map(goal => {
      const cells = quarters.map(q => {
        const qRange = getQuarterDateRange(q);
        const hasData = progressData.some(p => 
          (p.goal_code === goal.code || p.goal_id === goal.id) && 
          new Date(p.date) >= qRange.start && 
          new Date(p.date) <= qRange.end
        );
        const indicator = hasData ? SVG_STATUS_OK : SVG_STATUS_WARN;
        return `<td style="text-align: center; ${q === currentQ ? 'background: rgba(34,197,94,0.15);' : ''}">${indicator}</td>`;
      }).join('');
      
      return `
        <tr>
          <td style="font-weight: 600;">${escapeHtml(goal.code)}</td>
          <td style="opacity: 0.8;">${escapeHtml(goal.goal_area || '')}</td>
          ${cells}
        </tr>
      `;
    }).join('');
    
    // Calculate compliance score for current quarter
    const currentQRange = getQuarterDateRange(currentQ);
    const goalsWithData = studentGoals.filter(goal => {
      return progressData.some(p => 
        (p.goal_code === goal.code || p.goal_id === goal.id) && 
        new Date(p.date) >= currentQRange.start && 
        new Date(p.date) <= currentQRange.end
      );
    }).length;
    const compliancePercent = studentGoals.length > 0 
      ? Math.round((goalsWithData / studentGoals.length) * 100) 
      : 0;
    
    return `
      <div class="st-compliance-section">
        <h3>✅ Compliance Checklist</h3>
        <div style="margin-bottom: 12px; padding: 12px; background: rgba(59,130,246,0.15); border-radius: 8px; border: 1px solid rgba(59,130,246,0.35);">
          <strong>${goalsWithData}/${studentGoals.length}</strong> goals have data this quarter 
          (<strong>${compliancePercent}%</strong> compliance)
        </div>
        <div style="overflow-x: auto;">
          <table class="st-table" style="min-width: 500px;">
            <thead>
              <tr>
                <th>Goal Code</th>
                <th>Area</th>
                <th style="text-align: center; ${currentQ === 'Q1' ? 'background: rgba(34,197,94,0.15);' : ''}">Q1</th>
                <th style="text-align: center; ${currentQ === 'Q2' ? 'background: rgba(34,197,94,0.15);' : ''}">Q2</th>
                <th style="text-align: center; ${currentQ === 'Q3' ? 'background: rgba(34,197,94,0.15);' : ''}">Q3</th>
                <th style="text-align: center; ${currentQ === 'Q4' ? 'background: rgba(34,197,94,0.15);' : ''}">Q4</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * A3. Parent Communication Log
   */
  function renderParentCommunicationLog(student) {
    const allLogs = getParentCommLog();
    const studentLog = allLogs[student.code] || [];
    const sorted = [...studentLog].sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = sorted.slice(0, 10);
    
    const rows = recent.map(entry => `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td>${escapeHtml(entry.type)}</td>
        <td>${escapeHtml(entry.notes)}</td>
      </tr>
    `).join('');
    
    return `
      <div class="st-compliance-section">
        <h3>📬 Parent Communication Log</h3>
        <button class="st-btn st-btn-primary st-btn-small" id="add-comm-entry-btn" data-student-code="${escapeHtml(student.code)}">+ Add Entry</button>
        ${recent.length === 0 ? '<p style="opacity: 0.7; margin-top: 12px;">No communication entries yet</p>' : `
          <table class="st-table" style="margin-top: 12px;">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          ${sorted.length > 10 ? `<p style="margin-top: 8px; opacity: 0.7; font-size: 12px;">Showing 10 most recent. ${sorted.length - 10} more entries.</p>` : ''}
        `}
      </div>
    `;
  }

  /**
   * A4. Goal Mastery Predictions
   */
  function renderGoalMasteryPredictions(student, studentGoals, progressData) {
    if (studentGoals.length === 0) {
      return `
        <div class="st-compliance-section">
          <h3>🔮 Goal Mastery Predictions</h3>
          <p style="opacity: 0.7;">No goals to predict</p>
        </div>
      `;
    }
    
    const predictions = studentGoals.map(goal => {
      const goalProgress = progressData.filter(p => p.goal_code === goal.code || p.goal_id === goal.id);
      if (goalProgress.length < 3) {
        return `
          <div style="padding: 12px; background: rgba(255,255,255,0.04); border-radius: 8px; margin-bottom: 12px;">
            <div style="font-weight: 600;">${escapeHtml(goal.code)} - ${escapeHtml(goal.goal_area || '')}</div>
            <div style="opacity: 0.7; font-size: 13px; margin-top: 4px;">Need more data for prediction (${goalProgress.length}/3 data points)</div>
          </div>
        `;
      }
      
      // Calculate linear regression
      const sorted = [...goalProgress].sort((a, b) => new Date(a.date) - new Date(b.date));
      const startDate = new Date(sorted[0].date);
      const points = sorted.map(p => ({
        x: Math.floor((new Date(p.date) - startDate) / (1000 * 60 * 60 * 24)), // days since start
        y: p.percent
      }));
      
      const regression = linearRegression(points);
      if (!regression) {
        return '';
      }
      
      // Project to IEP due date
      const iepDue = student.iep_due ? new Date(student.iep_due) : null;
      const projectionDate = iepDue || new Date(new Date().setFullYear(new Date().getFullYear() + 1));
      const daysToProject = Math.floor((projectionDate - startDate) / (1000 * 60 * 60 * 24));
      const projected = predictAt(regression, daysToProject);
      const masteryRaw = goal.mastery || goal.target || 80;
      const masteryNum = parseGoalValue(masteryRaw) ?? 80;
      
      let status, color;
      if (projected >= masteryNum) {
        status = '🟢 On track to meet mastery';
        color = '#22c55e';
      } else if (regression.slope > 0) {
        status = '🟡 Trending up but may not reach mastery';
        color = '#fbbf24';
      } else {
        status = '🔴 At risk — not on track';
        color = '#ef4444';
      }
      
      return `
        <div style="padding: 12px; background: rgba(255,255,255,0.04); border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600;">${escapeHtml(goal.code)} - ${escapeHtml(goal.goal_area || '')}</div>
          <div style="margin-top: 8px; font-size: 13px;">
            Projected to reach <strong>${Math.round(projected)}%</strong> by ${iepDue ? formatDate(iepDue) : 'next year'} 
            (target: <strong>${escapeHtml(String(masteryRaw))}</strong>)
          </div>
          <div style="margin-top: 8px; color: ${color}; font-weight: 600; font-size: 14px;">
            ${status}
          </div>
        </div>
      `;
    }).filter(Boolean).join('');
    
    return `
      <div class="st-compliance-section">
        <h3>🔮 Goal Mastery Predictions</h3>
        ${predictions || '<p style="opacity: 0.7;">Insufficient data for predictions</p>'}
      </div>
    `;
  }

  // ─── Bulk Observation Configuration ─────────────────────────────────────────

  /**
   * Return a stable string key for a goal object, used to track selection.
   * Uses the DB id when available, otherwise falls back to student_code::code.
   * @param {Object} goal
   * @returns {string}
   */
  function getBulkGoalId(goal) {
    return goal.id != null ? String(goal.id) : `${goal.student_code}::${goal.code}`;
  }

  /**
   * Set up the glassmorphic popup for dot-grid chart circles in the Teacher Center.
   * Uses delegated listeners on the document so it works across dynamically rendered cards.
   */
  function setupTcDotGridPopup() {
    const popup = document.createElement('div');
    popup.style.cssText = [
      'position:fixed', 'z-index:9999', 'max-width:320px', 'min-width:220px',
      'padding:14px 16px', 'border-radius:14px',
      'background:rgba(15,23,42,0.88)', 'backdrop-filter:blur(16px) saturate(1.5)',
      '-webkit-backdrop-filter:blur(16px) saturate(1.5)',
      'border:1px solid rgba(255,255,255,0.14)',
      'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
      'pointer-events:none', 'opacity:0', 'transform:translateY(4px)',
      'transition:opacity 0.15s ease,transform 0.15s ease',
      'font-size:13px', 'color:#f1f5f9', 'line-height:1.5',
    ].join(';');
    popup.setAttribute('role', 'tooltip');
    document.body.appendChild(popup);

    let hideTimer = null;

    function showPopup(dot, dpData) {
      clearTimeout(hideTimer);
      const qNum = dpData.qNum || '?';
      const choices = Array.isArray(dpData.choices) ? dpData.choices : null;
      const studentAnswer = dpData.student_answer ? String(dpData.student_answer) : null;
      const studentAnswerUpper = studentAnswer ? studentAnswer.trim().toUpperCase() : null;
      const correctAnswerUpper = dpData.correct_answer ? String(dpData.correct_answer).trim().toUpperCase() : null;
      const isCorr = dpData.is_correct;
      const score = dpData.score != null ? Number(dpData.score) : null;
      const dateLabel = dpData.date ? formatDate(dpData.date) : '';

      let inner = `<div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:6px;">Question ${escapeHtml(String(qNum))}</div>`;
      if (dpData.question_text) {
        inner += `<div style="font-weight:600;font-size:13px;margin-bottom:10px;line-height:1.4;">${escapeHtml(dpData.question_text)}</div>`;
      }
      if (choices && choices.length > 0) {
        const items = choices.map((choice, idx) => {
          // Handle object choices from JSONB (e.g. {key: 'A', text: '...'}) or plain strings
          let key;
          let choiceText;
          if (typeof choice === 'object' && choice !== null) {
            key = choice.key ? String(choice.key).toUpperCase() : (idx < 26 ? String.fromCharCode(65 + idx) : null);
            const displayKey = choice.key || (idx < 26 ? String.fromCharCode(65 + idx) : '');
            choiceText = `${displayKey ? displayKey + ') ' : ''}${choice.text || choice.label || choice.value || ''}`;
          } else {
            const str = String(choice);
            const letterMatch = str.match(/^([A-Za-z])[).\s]/);
            // Plain-text choices without letter prefix: derive key from array index (0→A, 1→B, …)
            key = letterMatch ? letterMatch[1].toUpperCase() : (idx < 26 ? String.fromCharCode(65 + idx) : null);
            choiceText = str;
          }
          let style = 'color:rgba(255,255,255,0.55)';
          if (key && key === correctAnswerUpper) style = 'color:#22c55e;font-weight:600';
          else if (key && key === studentAnswerUpper && !isCorr) style = 'color:#f87171;font-weight:600';
          // Full-text fallback: correct_answer/student_answer may be stored as full text
          // (e.g. "Guile", "Resent") rather than letter keys ("A", "B").
          if (style === 'color:rgba(255,255,255,0.55)') {
            const ctUpper = typeof choice === 'object' && choice !== null
              ? String(choice.text || choice.label || choice.value || '').trim().toUpperCase()
              : String(choice).replace(/^[A-Za-z][).\s]+/, '').trim().toUpperCase();
            if (ctUpper && ctUpper === correctAnswerUpper) style = 'color:#22c55e;font-weight:600';
            else if (ctUpper && ctUpper === studentAnswerUpper && !isCorr) style = 'color:#f87171;font-weight:600';
          }
          return `<div style="padding:2px 0;font-size:12px;${style}">${escapeHtml(choiceText)}</div>`;
        }).join('');
        inner += `<div style="margin-bottom:10px;">${items}</div>`;
      } else if (studentAnswer !== null) {
        // Written/fill-in-blank: show the student's answer with score or correct/incorrect indicator
        inner += `<div style="font-size:12px;margin-bottom:6px;line-height:1.4;opacity:.85;">${escapeHtml(studentAnswer)}</div>`;
        if (score !== null) {
          inner += `<div style="font-size:13px;font-weight:700;">${escapeHtml(String(score))}%</div>`;
        } else {
          const statusIcon = isCorr
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:4px;">${DOT_CHECK_PATHS}</svg>`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:4px;">${DOT_X_PATHS}</svg>`;
          inner += `<div style="font-size:12px;opacity:.65;font-style:italic;">${statusIcon}${isCorr ? 'Answered correctly' : 'Answered incorrectly'}</div>`;
        }
      } else if (!dpData.question_text) {
        if (score !== null) {
          inner += `<div style="font-size:13px;font-weight:700;">${escapeHtml(String(score))}%</div>`;
        } else {
          const statusIcon = isCorr
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:4px;">${DOT_CHECK_PATHS}</svg>`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:4px;">${DOT_X_PATHS}</svg>`;
          inner += `<div style="font-size:12px;opacity:.65;font-style:italic;">${statusIcon}${isCorr ? 'Answered correctly' : 'Answered incorrectly'}</div>`;
        }
      }
      if (dateLabel) {
        inner += `<div style="font-size:11px;opacity:.45;border-top:1px solid rgba(255,255,255,0.08);padding-top:7px;margin-top:4px;">${escapeHtml(dateLabel)}</div>`;
      }
      popup.innerHTML = inner;
      popup.style.opacity = '1';
      popup.style.transform = 'translateY(0)';
      popup.style.pointerEvents = 'auto';

      let rect = dot.getBoundingClientRect();
      // Fallback: SVG <g> elements may return a zero-size rect in some browsers;
      // use the <rect> child's bounding rect instead.
      if (rect.width === 0 && rect.height === 0) {
        const rectChild = dot.querySelector('rect');
        if (rectChild) rect = rectChild.getBoundingClientRect();
      }
      // If still zero-size, we have no reliable position — abort positioning.
      if (rect.width === 0 && rect.height === 0) return;
      const pw = 280;
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - pw / 2, window.innerWidth - pw - 8));
      const estH = popup.offsetHeight || 160;
      const topAbove = rect.top - estH;
      const top = topAbove < 4 ? rect.bottom + 8 : topAbove;
      popup.style.left = `${left}px`;
      popup.style.top = `${Math.max(4, top)}px`;
    }

    function hidePopup(immediate) {
      clearTimeout(hideTimer);
      if (immediate) {
        popup.style.opacity = '0';
        popup.style.transform = 'translateY(4px)';
        popup.style.pointerEvents = 'none';
      } else {
        hideTimer = setTimeout(() => {
          popup.style.opacity = '0';
          popup.style.transform = 'translateY(4px)';
          popup.style.pointerEvents = 'none';
        }, 200);
      }
    }

    // TC page uses its own namespace so we listen on its container rather than the full document
    const container = document.body;

    // Helper: find nearest [data-dp] element from target.
    // Uses a manual parentNode loop rather than .closest() because SVG elements
    // (e.g. <rect>, <path>, nested <svg>) may not support .closest() on older
    // browsers or in some SVG rendering contexts.
    function findDotTarget(el) {
      let node = el;
      while (node && node !== document.body) {
        if (node.getAttribute && node.getAttribute('data-dp')) return node;
        node = node.parentNode;
      }
      return null;
    }

    container.addEventListener('mouseover', e => {
      const dot = findDotTarget(e.target);
      if (!dot) return;
      try { showPopup(dot, JSON.parse(decodeURIComponent(dot.getAttribute('data-dp')))); } catch (_) { /* ignore */ }
    });
    container.addEventListener('mouseout', e => {
      const dot = findDotTarget(e.target);
      if (!dot) return;
      // If moving between child elements of the same dot (e.g. <g> → <rect>), don't hide
      if (e.relatedTarget && dot.contains(e.relatedTarget)) return;
      if (e.relatedTarget && (e.relatedTarget === popup || popup.contains(e.relatedTarget))) return;
      hidePopup(false);
    });
    container.addEventListener('focusin', e => {
      const dot = findDotTarget(e.target);
      if (!dot) return;
      try { showPopup(dot, JSON.parse(decodeURIComponent(dot.getAttribute('data-dp')))); } catch (_) { /* ignore */ }
    });
    container.addEventListener('focusout', e => {
      const dot = findDotTarget(e.target);
      if (!dot) return;
      hidePopup(false);
    });
    container.addEventListener('click', e => {
      const dot = findDotTarget(e.target);
      if (dot) {
        if (parseFloat(popup.style.opacity || '0') > 0) {
          hidePopup(true);
        } else {
          try { showPopup(dot, JSON.parse(decodeURIComponent(dot.getAttribute('data-dp')))); } catch (_) { /* ignore */ }
        }
        e.stopPropagation();
        return;
      }
      if (!popup.contains(e.target)) hidePopup(true);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hidePopup(true); });
    popup.addEventListener('mouseleave', () => hidePopup(false));
    popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  }

  /**
   * Inject the "Bulk Obs Config" toolbar button into the Students page toolbar.
   * The button is inserted before the "Add Student" button.
   */
  function injectBulkObsConfigButton() {
    const addStudentBtn = document.getElementById('stAddStudent');
    if (!addStudentBtn || document.getElementById('stBulkObsConfigBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'stBulkObsConfigBtn';
    btn.type = 'button';
    btn.className = 'st-btn st-btn-small';
    btn.title = 'Bulk configure goals as observation type';
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
        <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
        <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
        <line x1="17" y1="16" x2="23" y2="16"/>
      </svg>
      Bulk Obs Config
    `;
    addStudentBtn.parentNode.insertBefore(btn, addStudentBtn);
    btn.addEventListener('click', showBulkObsConfigModal);
  }

  /**
   * Gather observation config from the bulk config form container.
   * Uses bulk_obs_* field names to avoid collisions with per-goal forms.
   * @param {HTMLElement} container
   * @returns {Object|null}
   */
  function gatherBulkObsConfigValues(container) {
    const catEl = container.querySelector('[name="bulk_obs_category"]');
    const category = catEl ? catEl.value : '';
    if (!category) return null;

    const config = { category };

    if (category === 'session_outcome') {
      config.target_met = parseInt(container.querySelector('[name="bulk_obs_target_met"]')?.value) || null;
      config.target_window = parseInt(container.querySelector('[name="bulk_obs_target_window"]')?.value) || null;
    } else if (category === 'prompt_count') {
      const raw = parseInt(container.querySelector('[name="bulk_obs_target_max_prompts"]')?.value);
      config.target_max_prompts = isNaN(raw) ? null : raw;
    } else if (category === 'behavior_checklist') {
      const inputs = container.querySelectorAll('[name="bulk_obs_sub_behavior"]');
      config.sub_behaviors = Array.from(inputs).map(i => i.value.trim()).filter(v => v);
    }

    const periodBoxes = container.querySelectorAll('[name="bulk_obs_class_period"]:checked');
    config.class_periods = Array.from(periodBoxes).map(cb => cb.value);

    return config;
  }

  /**
   * Validate bulk obs config form values.
   * @param {HTMLElement} container
   * @returns {string[]} Array of error strings (empty = valid)
   */
  function validateBulkObsConfigValues(container) {
    const errors = [];
    const catEl = container.querySelector('[name="bulk_obs_category"]');
    const category = catEl ? catEl.value : '';

    if (!category) {
      errors.push('Observation category is required.');
      return errors;
    }

    if (category === 'session_outcome') {
      const metVal = parseInt(container.querySelector('[name="bulk_obs_target_met"]')?.value);
      const winVal = parseInt(container.querySelector('[name="bulk_obs_target_window"]')?.value);
      if (!metVal || metVal < 1) errors.push('Target: "met" count must be at least 1.');
      if (!winVal || winVal < 1) errors.push('Target: "window" must be at least 1.');
      if (metVal && winVal && winVal < metVal) errors.push('Target window must be ≥ target met count.');
    } else if (category === 'prompt_count') {
      const maxVal = parseInt(container.querySelector('[name="bulk_obs_target_max_prompts"]')?.value);
      if (isNaN(maxVal) || maxVal < 0) errors.push('Target max prompts must be 0 or greater.');
    } else if (category === 'behavior_checklist') {
      const inputs = container.querySelectorAll('[name="bulk_obs_sub_behavior"]');
      const nonEmpty = Array.from(inputs).filter(i => i.value.trim());
      if (nonEmpty.length === 0) errors.push('At least one sub-behavior is required.');
    }

    const periodBoxes = container.querySelectorAll('[name="bulk_obs_class_period"]:checked');
    if (periodBoxes.length === 0) errors.push('At least one class period must be selected.');

    return errors;
  }

  /**
   * Build the category-specific and period-picker HTML for the bulk config panel.
   * Uses bulk_obs_* field name prefix to avoid ID/name collisions.
   * @param {Array} schedulePeriods - Period objects from getSchedule()
   * @returns {string} HTML string
   */
  function renderBulkObsConfigPanelHtml(schedulePeriods) {
    let periodPickerHtml = '';
    if (!schedulePeriods || schedulePeriods.length === 0) {
      periodPickerHtml = '<p style="font-size:13px;color:#6b7280;margin:4px 0;">Configure your bell schedule in Settings to enable period selection.</p>';
    } else {
      periodPickerHtml = schedulePeriods
        .filter(p => !p.planning)
        .map(p => {
          const label = escapeHtml(p.name || p.label || '');
          return `<label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:4px;cursor:pointer;">
            <input type="checkbox" name="bulk_obs_class_period" value="${label}" style="margin:0;" />
            ${label}
          </label>`;
        }).join('');
    }

    return `
      <div class="st-form-group">
        <label class="st-form-label" for="bulkObsCategory">Observation Category</label>
        <select id="bulkObsCategory" name="bulk_obs_category" class="st-form-select">
          <option value="">Select category...</option>
          <option value="session_outcome">Session Outcome (Met / Not Met per session)</option>
          <option value="tally">Tally (X of Y opportunities)</option>
          <option value="prompt_count">Prompt Count (number of prompts needed)</option>
          <option value="behavior_checklist">Behavior Checklist (multiple sub-behaviors)</option>
        </select>
      </div>
      <div class="bulk-obs-category-fields bulk-obs-session-outcome-fields" style="display:none">
        <div class="st-form-row">
          <div class="st-form-group">
            <label class="st-form-label">Target: met sessions</label>
            <input type="number" name="bulk_obs_target_met" class="st-form-input" min="1" placeholder="e.g., 3" />
          </div>
          <div class="st-form-group">
            <label class="st-form-label">Target: window size</label>
            <input type="number" name="bulk_obs_target_window" class="st-form-input" min="1" placeholder="e.g., 5" />
          </div>
        </div>
      </div>
      <div class="bulk-obs-category-fields bulk-obs-prompt-count-fields" style="display:none">
        <div class="st-form-group">
          <label class="st-form-label">Target: max prompts (or fewer)</label>
          <input type="number" name="bulk_obs_target_max_prompts" class="st-form-input" min="0" placeholder="e.g., 2" />
        </div>
      </div>
      <div class="bulk-obs-category-fields bulk-obs-behavior-checklist-fields" style="display:none">
        <div class="st-form-group">
          <label class="st-form-label">Sub-Behaviors</label>
          <div class="bulk-obs-sub-behaviors-list">
            <div class="bulk-obs-sub-behavior-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
              <input type="text" name="bulk_obs_sub_behavior" class="st-form-input" value="" placeholder="e.g., Raise hand" style="flex:1;" />
              <button type="button" class="st-btn st-btn-danger st-btn-small bulk-obs-remove-behavior-btn" aria-label="Remove sub-behavior" style="visibility:hidden">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <button type="button" class="st-btn st-btn-small bulk-obs-add-behavior-btn" style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Sub-Behavior
          </button>
        </div>
      </div>
      <div class="st-form-group">
        <label class="st-form-label">Observe during which class periods?</label>
        <div class="bulk-obs-period-picker" style="padding:6px 0;">
          ${periodPickerHtml}
        </div>
      </div>
    `;
  }

  /**
   * Wire up category show/hide and sub-behavior add/remove for the bulk config panel.
   * @param {HTMLElement} panel - The config panel container element
   */
  function initBulkObsConfigFields(panel) {
    const catSel = panel.querySelector('[name="bulk_obs_category"]');
    if (!catSel) return;

    const updateCategoryFields = () => {
      const cat = catSel.value;
      panel.querySelectorAll('.bulk-obs-category-fields').forEach(el => {
        el.style.display = 'none';
      });
      if (cat === 'session_outcome') {
        const el = panel.querySelector('.bulk-obs-session-outcome-fields');
        if (el) el.style.display = '';
      } else if (cat === 'prompt_count') {
        const el = panel.querySelector('.bulk-obs-prompt-count-fields');
        if (el) el.style.display = '';
      } else if (cat === 'behavior_checklist') {
        const el = panel.querySelector('.bulk-obs-behavior-checklist-fields');
        if (el) el.style.display = '';
      }
    };
    catSel.addEventListener('change', updateCategoryFields);
    updateCategoryFields();

    // Sub-behavior add/remove
    panel.addEventListener('click', (e) => {
      if (e.target.closest('.bulk-obs-add-behavior-btn')) {
        const list = panel.querySelector('.bulk-obs-sub-behaviors-list');
        if (!list) return;
        const row = document.createElement('div');
        row.className = 'bulk-obs-sub-behavior-row';
        row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
        row.innerHTML = `
          <input type="text" name="bulk_obs_sub_behavior" class="st-form-input" value="" placeholder="e.g., Raise hand" style="flex:1;" />
          <button type="button" class="st-btn st-btn-danger st-btn-small bulk-obs-remove-behavior-btn" aria-label="Remove sub-behavior">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        `;
        list.appendChild(row);
      }
      if (e.target.closest('.bulk-obs-remove-behavior-btn')) {
        const row = e.target.closest('.bulk-obs-sub-behavior-row');
        const list = panel.querySelector('.bulk-obs-sub-behaviors-list');
        if (row && list && list.querySelectorAll('.bulk-obs-sub-behavior-row').length > 1) {
          row.remove();
        }
      }
    });
  }

  /**
   * Show the Bulk Observation Configuration modal.
   * Lists all active goals, lets the teacher select multiple, and applies
   * a shared observation_config to all selected goals at once.
   */
  async function showBulkObsConfigModal() {
    const periods = _cachedSchedulePeriods.slice();

    // Group goals by student for display
    const studentMap = new Map(allStudents.map(s => [s.code, s]));

    // Gather unique students and goal areas for filter dropdowns
    const studentCodes = [...new Set(allGoals.map(g => g.student_code))].sort();
    const goalAreas = [...new Set(allGoals.map(g => g.goal_area).filter(Boolean))].sort();
    const measurementTypes = [...new Set(allGoals.map(g => g.measurement_type || 'Other').filter(Boolean))].sort();

    const studentOptions = studentCodes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    const goalAreaOptions = goalAreas.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
    const measOptions = measurementTypes.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

    const configPanelHtml = renderBulkObsConfigPanelHtml(periods);

    const overlay = document.createElement('div');
    overlay.id = 'bulkObsConfigOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'bulkObsConfigTitle');
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;right:0;bottom:0;',
      'background:rgba(0,0,0,0.82);backdrop-filter:blur(3px);',
      'display:flex;align-items:flex-start;justify-content:center;',
      'z-index:2000;padding:24px;overflow-y:auto;'
    ].join('');

    overlay.innerHTML = `
      <div style="background:rgba(20,20,24,0.99);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:28px 32px;width:100%;max-width:1100px;margin:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.1);">
          <h2 id="bulkObsConfigTitle" style="margin:0;font-size:20px;font-weight:700;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:8px;">
              <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
              <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
              <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
              <line x1="17" y1="16" x2="23" y2="16"/>
            </svg>
            Bulk Observation Configuration
          </h2>
          <button id="bulkObsCloseBtn" type="button" class="st-btn st-btn-small" aria-label="Close bulk obs config">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">

          <!-- Left: Goal selection table -->
          <div style="flex:1;min-width:0;">
            <!-- Filter row -->
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
              <select id="bulkObsFilterStudent" class="st-form-select" style="flex:1;min-width:140px;max-width:200px;">
                <option value="">All Students</option>
                ${studentOptions}
              </select>
              <select id="bulkObsFilterArea" class="st-form-select" style="flex:1;min-width:140px;max-width:200px;">
                <option value="">All Goal Areas</option>
                ${goalAreaOptions}
              </select>
              <select id="bulkObsFilterMeas" class="st-form-select" style="flex:1;min-width:140px;max-width:200px;">
                <option value="">All Types</option>
                ${measOptions}
              </select>
              <button id="bulkObsSelectAll" type="button" class="st-btn st-btn-small">Select All</button>
              <button id="bulkObsDeselectAll" type="button" class="st-btn st-btn-small">Deselect All</button>
            </div>
            <!-- Goal table -->
            <div style="max-height:420px;overflow-y:auto;border:1px solid rgba(255,255,255,0.08);border-radius:10px;">
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);">
                    <th style="padding:8px 10px;text-align:left;width:32px;"></th>
                    <th style="padding:8px 10px;text-align:left;">Student</th>
                    <th style="padding:8px 10px;text-align:left;">Goal</th>
                    <th style="padding:8px 10px;text-align:left;">Goal Area</th>
                    <th style="padding:8px 10px;text-align:left;">Type</th>
                    <th style="padding:8px 10px;text-align:left;">Obs Category</th>
                  </tr>
                </thead>
                <tbody id="bulkObsGoalTableBody">
                  <!-- Rendered by JS -->
                </tbody>
              </table>
            </div>
            <div id="bulkObsSelectionSummary" style="margin-top:8px;font-size:13px;opacity:0.7;"></div>
          </div>

          <!-- Right: Config panel -->
          <div id="bulkObsConfigPanel" style="width:320px;flex-shrink:0;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;">
            <h3 style="margin:0 0 16px 0;font-size:15px;font-weight:600;">Observation Configuration</h3>
            <div id="bulkObsConfigFields">
              ${configPanelHtml}
            </div>
            <div id="bulkObsErrorMsg" style="color:rgba(239,68,68,0.9);font-size:13px;margin-bottom:10px;display:none;"></div>
            <div style="display:flex;flex-direction:column;gap:8px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);">
              <button id="bulkObsApplyBtn" type="button" class="st-btn st-btn-primary" style="width:100%;">
                Apply to Selected
              </button>
              <button id="bulkObsClearBtn" type="button" class="st-btn st-btn-danger" style="width:100%;">
                Remove Obs Config from Selected
              </button>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector('#bulkObsCloseBtn').addEventListener('click', () => overlay.remove());

    // Wire up category fields
    const configPanel = overlay.querySelector('#bulkObsConfigPanel');
    initBulkObsConfigFields(configPanel);

    // Track filtered + all goal IDs for select/deselect
    let visibleGoalIds = [];

    /**
     * Render the goal table rows based on current filter state.
     */
    function renderGoalRows() {
      const filterStudent = overlay.querySelector('#bulkObsFilterStudent').value;
      const filterArea = overlay.querySelector('#bulkObsFilterArea').value;
      const filterMeas = overlay.querySelector('#bulkObsFilterMeas').value;

      const filtered = allGoals.filter(g => {
        if (filterStudent && g.student_code !== filterStudent) return false;
        if (filterArea && g.goal_area !== filterArea) return false;
        if (filterMeas && (g.measurement_type || 'Other') !== filterMeas) return false;
        return true;
      });

      visibleGoalIds = filtered.map(g => getBulkGoalId(g));

      const tbody = overlay.querySelector('#bulkObsGoalTableBody');
      if (!tbody) return;

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;opacity:0.6;">No goals match the current filters.</td></tr>`;
        updateSelectionSummary();
        return;
      }

      tbody.innerHTML = filtered.map(g => {
        const goalId = getBulkGoalId(g);
        const student = studentMap.get(g.student_code);
        const studentLabel = escapeHtml(g.student_code);
        const isObs = g.measurement_type === 'Observation';
        const obsCat = isObs && g.observation_config?.category ? obsCategoryLabel(g.observation_config.category) : '—';
        const rowStyle = isObs ? 'background:rgba(99,102,241,0.08);' : '';
        return `
          <tr data-goal-id="${escapeHtml(goalId)}" style="${rowStyle}border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:8px 10px;text-align:center;">
              <input type="checkbox" class="bulk-obs-goal-check" data-goal-id="${escapeHtml(goalId)}" ${isObs ? 'checked' : ''} aria-label="Select goal ${escapeHtml(g.code || '')} for student ${escapeHtml(g.student_code)}" />
            </td>
            <td style="padding:8px 10px;white-space:nowrap;">${studentLabel}${student && student.name ? ` <span style="opacity:0.55;font-size:12px;">(${escapeHtml(student.name)})</span>` : ''}</td>
            <td style="padding:8px 10px;font-family:monospace;font-size:12px;">${escapeHtml(g.code || '')}</td>
            <td style="padding:8px 10px;">${escapeHtml(g.goal_area || '—')}</td>
            <td style="padding:8px 10px;">${escapeHtml(g.measurement_type || 'Other')}</td>
            <td style="padding:8px 10px;">${escapeHtml(obsCat)}</td>
          </tr>
        `;
      }).join('');

      updateSelectionSummary();
    }

    function updateSelectionSummary() {
      const checked = overlay.querySelectorAll('.bulk-obs-goal-check:checked');
      const summary = overlay.querySelector('#bulkObsSelectionSummary');
      if (summary) {
        summary.textContent = `${checked.length} goal${checked.length !== 1 ? 's' : ''} selected`;
      }
    }

    // Filter change handlers
    overlay.querySelector('#bulkObsFilterStudent').addEventListener('change', renderGoalRows);
    overlay.querySelector('#bulkObsFilterArea').addEventListener('change', renderGoalRows);
    overlay.querySelector('#bulkObsFilterMeas').addEventListener('change', renderGoalRows);

    // Select All / Deselect All (only visible rows)
    overlay.querySelector('#bulkObsSelectAll').addEventListener('click', () => {
      visibleGoalIds.forEach(id => {
        const cb = overlay.querySelector(`.bulk-obs-goal-check[data-goal-id="${CSS.escape(id)}"]`);
        if (cb) cb.checked = true;
      });
      updateSelectionSummary();
    });
    overlay.querySelector('#bulkObsDeselectAll').addEventListener('click', () => {
      visibleGoalIds.forEach(id => {
        const cb = overlay.querySelector(`.bulk-obs-goal-check[data-goal-id="${CSS.escape(id)}"]`);
        if (cb) cb.checked = false;
      });
      updateSelectionSummary();
    });

    // Delegate checkbox change to update summary
    overlay.querySelector('#bulkObsGoalTableBody').addEventListener('change', (e) => {
      if (e.target.classList.contains('bulk-obs-goal-check')) {
        updateSelectionSummary();
      }
    });

    /**
     * Get the list of currently selected goals (by data-goal-id).
     * @returns {Array} Array of goal objects
     */
    function getSelectedGoals() {
      const checked = overlay.querySelectorAll('.bulk-obs-goal-check:checked');
      const selectedIds = new Set(Array.from(checked).map(cb => cb.dataset.goalId));
      return allGoals.filter(g => selectedIds.has(getBulkGoalId(g)));
    }

    // Apply to Selected
    overlay.querySelector('#bulkObsApplyBtn').addEventListener('click', async () => {
      const errorEl = overlay.querySelector('#bulkObsErrorMsg');
      errorEl.style.display = 'none';

      const errors = validateBulkObsConfigValues(configPanel);
      if (errors.length > 0) {
        errorEl.textContent = errors.join(' ');
        errorEl.style.display = '';
        return;
      }

      const selected = getSelectedGoals();
      if (selected.length === 0) {
        errorEl.textContent = 'No goals selected. Check at least one goal to configure.';
        errorEl.style.display = '';
        return;
      }

      const obsConfig = gatherBulkObsConfigValues(configPanel);
      const categoryLabel = obsCategoryLabel(obsConfig.category);
      const periodList = obsConfig.class_periods.length > 0 ? obsConfig.class_periods.join(', ') : '(none)';
      const previewMsg = `This will configure ${selected.length} goal${selected.length !== 1 ? 's' : ''} as "${categoryLabel}" observation goals with class periods: ${periodList}.\n\nProceed?`;

      const confirmed = await rcConfirm('Apply Observation Config', previewMsg, 'Apply');
      if (!confirmed) return;

      const applyBtn = overlay.querySelector('#bulkObsApplyBtn');
      applyBtn.disabled = true;
      applyBtn.textContent = 'Saving…';

      let successCount = 0;
      let failCount = 0;
      for (const goal of selected) {
        try {
          await db.upsertGoal({
            student_code: goal.student_code,
            code: goal.code,
            goal_text: goal.goal_text || goal.desc || '',
            desc: goal.desc || goal.goal_text || '',
            target: goal.target,
            status: goal.status || 'active',
            measurement_type: 'Observation',
            data_collector: goal.data_collector || null,
            data_collector_email: goal.data_collector_email || null,
            class_context: goal.class_context || null,
            goal_area: goal.goal_area || null,
            baseline: goal.baseline || null,
            mastery: goal.mastery || null,
            case_manager: goal.case_manager || null,
            version: goal.version || 1,
            observation_config: obsConfig
          });
          successCount++;
        } catch (err) {
          console.error('[tc-students] Bulk obs config failed for goal', goal.code, err);
          failCount++;
        }
      }

      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply to Selected';

      if (failCount > 0) {
        await rcAlert('Partial Success', `${successCount} goal${successCount !== 1 ? 's' : ''} configured successfully. ${failCount} failed — check console for details.`);
      } else {
        await rcAlert('Done', `${successCount} goal${successCount !== 1 ? 's' : ''} configured successfully as ${categoryLabel} observation goals.`);
      }

      overlay.remove();
      await loadData();
    });

    // Remove Observation Config from Selected
    overlay.querySelector('#bulkObsClearBtn').addEventListener('click', async () => {
      const selected = getSelectedGoals();
      if (selected.length === 0) {
        const errorEl = overlay.querySelector('#bulkObsErrorMsg');
        errorEl.textContent = 'No goals selected. Check at least one goal to clear.';
        errorEl.style.display = '';
        return;
      }

      const confirmed = await rcConfirm(
        'Remove Observation Config',
        `This will remove the observation configuration from ${selected.length} goal${selected.length !== 1 ? 's' : ''}, resetting their measurement type to "Other".\n\nProceed?`,
        'Remove',
        { danger: true }
      );
      if (!confirmed) return;

      const clearBtn = overlay.querySelector('#bulkObsClearBtn');
      clearBtn.disabled = true;
      clearBtn.textContent = 'Clearing…';

      let successCount = 0;
      let failCount = 0;
      for (const goal of selected) {
        try {
          await db.upsertGoal({
            student_code: goal.student_code,
            code: goal.code,
            goal_text: goal.goal_text || goal.desc || '',
            desc: goal.desc || goal.goal_text || '',
            target: goal.target,
            status: goal.status || 'active',
            measurement_type: 'Other',
            data_collector: goal.data_collector || null,
            data_collector_email: goal.data_collector_email || null,
            class_context: goal.class_context || null,
            goal_area: goal.goal_area || null,
            baseline: goal.baseline || null,
            mastery: goal.mastery || null,
            case_manager: goal.case_manager || null,
            version: goal.version || 1,
            observation_config: null
          });
          successCount++;
        } catch (err) {
          console.error('[tc-students] Bulk obs clear failed for goal', goal.code, err);
          failCount++;
        }
      }

      clearBtn.disabled = false;
      clearBtn.textContent = 'Remove Obs Config from Selected';

      if (failCount > 0) {
        await rcAlert('Partial Success', `${successCount} goal${successCount !== 1 ? 's' : ''} cleared. ${failCount} failed — check console for details.`);
      } else {
        await rcAlert('Done', `Observation config removed from ${successCount} goal${successCount !== 1 ? 's' : ''}.`);
      }

      overlay.remove();
      await loadData();
    });

    // Initial render
    renderGoalRows();
  }

  /**
   * Show a styled confirmation modal and return a Promise<boolean>
   * @param {string} title - Modal title
   * @param {string} message - Confirmation message
   * @param {string} confirmLabel - Label for confirm button (default: 'Confirm')
   * @param {object} options - Optional configuration
   * @param {boolean} options.danger - Use red styling for destructive actions
   * @returns {Promise<boolean>} true if confirmed, false if cancelled
   */
  function showConfirmModal(title, message, confirmLabel = 'Confirm', options = {}) {
    return new Promise((resolve) => {
      const isDanger = options.danger || false;
      const confirmButtonClass = isDanger 
        ? 'st-btn st-btn-danger'
        : 'st-btn st-btn-primary';
      
      const modal = createModal(title, `
        <div style="padding: 10px 0;">
          <p style="margin-bottom: 20px; white-space: pre-wrap;">${escapeHtml(message)}</p>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button class="st-btn st-btn-secondary" id="modal-cancel-btn">Cancel</button>
            <button class="${confirmButtonClass}" id="modal-confirm-btn">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      `);
      
      document.body.appendChild(modal);
      
      const cleanup = () => modal.remove();
      
      document.getElementById('modal-cancel-btn').addEventListener('click', () => {
        cleanup();
        resolve(false);
      });
      
      document.getElementById('modal-confirm-btn').addEventListener('click', () => {
        cleanup();
        resolve(true);
      });
      
      // Allow clicking backdrop to cancel
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          cleanup();
          resolve(false);
        }
      });
    });
  }

  // ============================================================================
  // SPEDTRACK IMPORT / EXPORT FUNCTIONALITY
  // All dynamic HTML is built via DOM API methods to avoid CodeQL violations.
  // ============================================================================

  const ST_IMPORT_HISTORY_KEY = 'rc_spedtrack_import_history';
  let stImportPreviewData = [];

  /**
   * Parse a SpedTrack-style CSV (Student, Goal, Date, Percent/Value, Notes).
   * Returns an array of plain objects keyed by lowercase header name.
   */
  function parseSpedTrackCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = spedtrackSplitCsvLine(lines[0]).map(h => h.toLowerCase());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const vals = spedtrackSplitCsvLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      rows.push(row);
    }
    return rows;
  }

  /** Split one CSV line respecting double-quoted fields (RFC 4180).
   *  Handles embedded quotes encoded as "" (two consecutive quotes). */
  function spedtrackSplitCsvLine(line) {
    const fields = [];
    let inQuote = false;
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          // Escaped quote inside a quoted field → emit a literal "
          cell += '"';
          i++; // skip the second quote
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        fields.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    fields.push(cell.trim());
    return fields;
  }

  /** Quote a single value for CSV output (RFC 4180). */
  function spedtrackCsvQuote(v) {
    return '"' + String(v).replace(/"/g, '""') + '"';
  }

  /**
   * Validate one row from a SpedTrack CSV against the loaded students/goals data.
   * Returns an enriched row object with .status ('valid'|'warning'|'error') and .valid boolean.
   */
  function validateSpedTrackRow(row) {
    const student  = row.student || row.student_code || row['student code'] || '';
    const goal     = row.goal    || row.goal_code    || row['goal code']    || '';
    const date     = row.date    || '';
    const valStr   = row.percent || row.score        || row.value           || '';
    const notes    = row.notes   || row.note         || row.comments        || '';

    const studentMatch = allStudents.find(s =>
      s.code === student || (s.name && s.name.toLowerCase().includes(student.toLowerCase()))
    );

    let goalMatch = null;
    if (studentMatch) {
      goalMatch = allGoals.find(g => g.student_code === studentMatch.code && g.code === goal);
    }

    const dateFormatOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
    const dateValid    = dateFormatOk && (() => {
      const d = new Date(date);
      return !isNaN(d.getTime()) && d.toISOString().startsWith(date);
    })();
    const parsedValue  = parseFloat(valStr);
    const valueValid   = !isNaN(parsedValue) && parsedValue >= 0;

    let status  = 'valid';
    let message = '';

    if (!studentMatch) {
      status = 'error'; message = 'Student not found';
    } else if (!goalMatch) {
      status = 'warning'; message = 'Goal not found for student';
    } else if (!dateValid) {
      status = 'warning'; message = 'Invalid date format (use YYYY-MM-DD)';
    } else if (!valueValid) {
      status = 'error'; message = 'Invalid value (must be a non-negative number)';
    }

    return {
      status,
      message,
      student:     studentMatch ? studentMatch.code : student,
      studentName: studentMatch ? (studentMatch.name || studentMatch.code) : student,
      goal,
      date,
      value:  valueValid ? parsedValue : NaN,
      notes,
      valid: status === 'valid'
    };
  }

  /**
   * Parse CSV text, validate rows, populate the preview table (DOM API only),
   * and show the preview section.
   */
  async function processSpedTrackCsv(text, tbody, confirmBtn, previewSection) {
    try {
      const rows = parseSpedTrackCsv(text);
      if (rows.length === 0) {
        await rcAlert('Validation', 'No data found in CSV');
        return;
      }

      stImportPreviewData = rows.map(validateSpedTrackRow);

      // Clear existing rows
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

      for (const row of stImportPreviewData) {
        const tr = document.createElement('tr');

        // Status cell — set text via textContent, class via className
        const statusTd = document.createElement('td');
        if (row.status === 'valid') {
          statusTd.className = 'dt-score-green';
          statusTd.textContent = '✓ Valid';
        } else if (row.status === 'warning') {
          statusTd.className = 'dt-score-amber';
          statusTd.textContent = '⚠ ' + row.message;
        } else {
          statusTd.className = 'dt-score-red';
          statusTd.textContent = '✗ ' + row.message;
        }
        tr.appendChild(statusTd);

        // Student cell
        const studentTd = document.createElement('td');
        studentTd.textContent = row.studentName;
        if (row.student && row.student !== row.studentName) {
          const small = document.createElement('small');
          small.textContent = ' (' + row.student + ')';
          studentTd.appendChild(small);
        }
        tr.appendChild(studentTd);

        // Goal cell
        const goalTd = document.createElement('td');
        goalTd.textContent = row.goal;
        tr.appendChild(goalTd);

        // Date cell
        const dateTd = document.createElement('td');
        dateTd.textContent = row.date;
        tr.appendChild(dateTd);

        // Value cell
        const valueTd = document.createElement('td');
        valueTd.textContent = isNaN(row.value) ? '' : String(row.value) + '%';
        tr.appendChild(valueTd);

        // Notes cell
        const notesTd = document.createElement('td');
        const notesSmall = document.createElement('small');
        notesSmall.textContent = row.notes;
        notesTd.appendChild(notesSmall);
        tr.appendChild(notesTd);

        tbody.appendChild(tr);
      }

      const validCount = stImportPreviewData.filter(r => r.valid).length;
      confirmBtn.textContent = '✓ Import ' + validCount + ' Record' + (validCount !== 1 ? 's' : '');
      previewSection.style.display = 'block';

    } catch (err) {
      console.error('[tc-students] SpedTrack CSV parse error:', err);
      await rcAlert('Error', 'Error parsing CSV: ' + err.message);
    }
  }

  /**
   * Render import history into `container` using DOM API only.
   */
  function renderSpedTrackHistory(container) {
    while (container.firstChild) container.removeChild(container.firstChild);

    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(ST_IMPORT_HISTORY_KEY) || '[]');
    } catch (_) { /* ignore */ }

    if (history.length === 0) {
      const p = document.createElement('p');
      p.style.cssText = 'opacity: 0.7; text-align: center;';
      p.textContent = 'No imports yet';
      container.appendChild(p);
      return;
    }

    for (const h of history) {
      const item = document.createElement('div');
      item.style.cssText = 'padding: 8px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(0,0,0,.2);';

      const strong = document.createElement('strong');
      const d = new Date(h.date);
      strong.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      item.appendChild(strong);

      item.appendChild(document.createTextNode(' — ' + h.records + ' record' + (h.records !== 1 ? 's' : '') + ' from ' + h.source));

      container.appendChild(item);
    }
  }

  /**
   * Open the SpedTrack progress-data import modal.
   * All dynamic content is set via textContent/setAttribute — never innerHTML with user data.
   */
  function showSpedTrackImportModal() {
    // Reset preview state
    stImportPreviewData = [];

    // ── Overlay ──────────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'st-modal-backdrop active';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'SpedTrack Import');

    // ── Modal shell ───────────────────────────────────────────────────────────
    const modal = document.createElement('div');
    modal.className = 'st-modal';
    modal.style.cssText = 'max-width: 820px; width: 95%;';

    // ── Header ─────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'st-modal-header';

    const titleEl = document.createElement('h2');
    titleEl.textContent = '📥 SpedTrack Progress Import';
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'st-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // ── Body ───────────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'st-modal-body';

    // Description
    const desc = document.createElement('p');
    desc.style.cssText = 'margin: 0 0 16px 0; opacity: 0.85; font-size: 14px;';
    desc.textContent = 'Import progress data from SpedTrack CSV exports. Paste CSV data or upload a file.';
    body.appendChild(desc);

    // Mode toggle row
    const toggleRow = document.createElement('div');
    toggleRow.style.cssText = 'display: flex; gap: 12px; margin-bottom: 16px;';

    const pasteToggleBtn = document.createElement('button');
    pasteToggleBtn.className = 'dt-btn';
    pasteToggleBtn.textContent = '📋 Paste CSV';

    const fileToggleBtn = document.createElement('button');
    fileToggleBtn.className = 'dt-btn';
    fileToggleBtn.textContent = '📁 Upload File';

    toggleRow.appendChild(pasteToggleBtn);
    toggleRow.appendChild(fileToggleBtn);
    body.appendChild(toggleRow);

    // ── Paste area ─────────────────────────────────────────────────────────────
    const pasteArea = document.createElement('div');
    pasteArea.style.display = 'none';

    const pasteLabel = document.createElement('label');
    pasteLabel.style.cssText = 'display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;';
    pasteLabel.textContent = 'Paste CSV Data';
    pasteArea.appendChild(pasteLabel);

    const csvTextarea = document.createElement('textarea');
    csvTextarea.className = 'st-form-input';
    csvTextarea.style.cssText = 'min-height: 150px; width: 100%; font-family: monospace; font-size: 12px; margin-bottom: 12px; box-sizing: border-box;';
    csvTextarea.placeholder = 'Student,Goal,Date,Percent,Notes\nS001,1.1,2026-01-15,72,Improving\nS001,2.3,2026-01-15,65,Still working on writing';
    pasteArea.appendChild(csvTextarea);

    const parseCsvBtn = document.createElement('button');
    parseCsvBtn.className = 'dt-btn primary';
    parseCsvBtn.textContent = 'Parse CSV';
    pasteArea.appendChild(parseCsvBtn);

    body.appendChild(pasteArea);

    // ── File upload area ───────────────────────────────────────────────────────
    const fileArea = document.createElement('div');
    fileArea.style.display = 'none';

    const fileLabel = document.createElement('label');
    fileLabel.style.cssText = 'display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;';
    fileLabel.textContent = 'Upload CSV File';
    fileArea.appendChild(fileLabel);

    const csvFileInput = document.createElement('input');
    csvFileInput.type = 'file';
    csvFileInput.accept = '.csv';
    csvFileInput.className = 'st-form-input';
    csvFileInput.style.cssText = 'display: block; margin-bottom: 12px;';
    fileArea.appendChild(csvFileInput);

    const uploadParseBtn = document.createElement('button');
    uploadParseBtn.className = 'dt-btn primary';
    uploadParseBtn.textContent = 'Upload & Parse';
    fileArea.appendChild(uploadParseBtn);

    body.appendChild(fileArea);

    // ── Preview section ────────────────────────────────────────────────────────
    const previewSection = document.createElement('div');
    previewSection.style.cssText = 'display: none; margin-top: 16px;';

    const previewHeading = document.createElement('h3');
    previewHeading.style.cssText = 'margin: 0 0 12px 0; font-size: 16px;';
    previewHeading.textContent = 'Import Preview';
    previewSection.appendChild(previewHeading);

    const tableWrapper = document.createElement('div');
    tableWrapper.style.cssText = 'overflow-x: auto; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; margin-bottom: 12px;';

    const previewTable = document.createElement('table');
    previewTable.className = 'dt-data-table';

    const thead = document.createElement('thead');
    const headerTr = document.createElement('tr');
    ['Status', 'Student', 'Goal', 'Date', 'Percent', 'Notes'].forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      headerTr.appendChild(th);
    });
    thead.appendChild(headerTr);
    previewTable.appendChild(thead);

    const previewTbody = document.createElement('tbody');
    previewTable.appendChild(previewTbody);
    tableWrapper.appendChild(previewTable);
    previewSection.appendChild(tableWrapper);

    // Preview action buttons
    const previewActions = document.createElement('div');
    previewActions.style.cssText = 'display: flex; gap: 10px;';

    const importConfirmBtn = document.createElement('button');
    importConfirmBtn.className = 'dt-btn primary';
    importConfirmBtn.textContent = '✓ Import 0 Records';

    const cancelPreviewBtn = document.createElement('button');
    cancelPreviewBtn.className = 'dt-btn';
    cancelPreviewBtn.textContent = 'Cancel';

    previewActions.appendChild(importConfirmBtn);
    previewActions.appendChild(cancelPreviewBtn);
    previewSection.appendChild(previewActions);

    body.appendChild(previewSection);

    // ── History section ────────────────────────────────────────────────────────
    const historySep = document.createElement('div');
    historySep.style.cssText = 'margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.08);';

    const historyHeading = document.createElement('h3');
    historyHeading.style.cssText = 'margin: 0 0 12px 0; font-size: 16px;';
    historyHeading.textContent = 'Import History';
    historySep.appendChild(historyHeading);

    const historyContainer = document.createElement('div');
    historySep.appendChild(historyContainer);
    body.appendChild(historySep);

    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Render existing history
    renderSpedTrackHistory(historyContainer);

    // ── Event wiring ───────────────────────────────────────────────────────────
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    pasteToggleBtn.addEventListener('click', () => {
      pasteArea.style.display = 'block';
      fileArea.style.display = 'none';
      previewSection.style.display = 'none';
    });

    fileToggleBtn.addEventListener('click', () => {
      pasteArea.style.display = 'none';
      fileArea.style.display = 'block';
      previewSection.style.display = 'none';
    });

    parseCsvBtn.addEventListener('click', async () => {
      const text = csvTextarea.value;
      if (!text.trim()) { await rcAlert('Validation', 'Please paste CSV data first'); return; }
      await processSpedTrackCsv(text, previewTbody, importConfirmBtn, previewSection);
    });

    uploadParseBtn.addEventListener('click', async () => {
      const file = csvFileInput.files[0];
      if (!file) { await rcAlert('Validation', 'Please select a file first'); return; }
      const reader = new FileReader();
      reader.onload = async (e) => {
        await processSpedTrackCsv(e.target.result, previewTbody, importConfirmBtn, previewSection);
      };
      reader.readAsText(file);
    });

    cancelPreviewBtn.addEventListener('click', () => {
      previewSection.style.display = 'none';
      stImportPreviewData = [];
    });

    importConfirmBtn.addEventListener('click', async () => {
      const validEntries = stImportPreviewData.filter(r => r.valid);
      if (validEntries.length === 0) {
        await rcAlert('Validation', 'No valid entries to import');
        return;
      }

      let successCount = 0;
      let failCount = 0;
      const importSource = csvFileInput.files[0] ? 'file upload' : 'paste';

      for (const entry of validEntries) {
        try {
          await db.upsertGoalProgress({
            goal_code:    entry.goal,
            student_code: entry.student,
            date:         entry.date,
            value:        entry.value,
            source:       'spedtrack_import'
          });
          successCount++;
        } catch (err) {
          console.error('[tc-students] SpedTrack import entry failed:', err);
          failCount++;
        }
      }

      // Save import history
      try {
        const history = JSON.parse(localStorage.getItem(ST_IMPORT_HISTORY_KEY) || '[]');
        history.unshift({
          date:    new Date().toISOString(),
          records: successCount,
          source:  importSource
        });
        localStorage.setItem(ST_IMPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
      } catch (_) { /* ignore */ }

      // Refresh page data
      await loadData();

      previewSection.style.display = 'none';
      stImportPreviewData = [];
      renderSpedTrackHistory(historyContainer);

      if (failCount > 0) {
        await rcAlert('Import Partial', successCount + ' records imported; ' + failCount + ' failed — see console for details.');
      } else {
        await rcAlert('Import Complete', '✓ Successfully imported ' + successCount + ' record' + (successCount !== 1 ? 's' : '') + '!');
      }
    });
  }

  /**
   * Export current filtered progress data as a SpedTrack-compatible CSV.
   * Columns: Student, Goal, Date, Percent, Notes
   */
  function exportSpedTrackProgressCsv() {
    const { start: qStart, end: qEnd } = selectedQuarter
      ? (getQuarterDateRange ? getQuarterDateRange(selectedQuarter) : { start: null, end: null })
      : { start: null, end: null };

    const filteredCodes = new Set(filteredStudents.map(s => s.code));

    const rows = [['Student', 'Goal', 'Date', 'Percent', 'Notes']];
    for (const entry of allProgressEntries) {
      if (!filteredCodes.has(entry.student_code)) continue;
      if (qStart && entry.date < qStart) continue;
      if (qEnd   && entry.date > qEnd)   continue;
      rows.push([
        entry.student_code,
        entry.goal_code,
        entry.date,
        entry.value != null ? entry.value : '',
        entry.notes || ''
      ]);
    }

    const csv = rows.map(r => r.map(spedtrackCsvQuote).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'spedtrack_progress_' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Show an export-options dropdown anchored to `anchorBtn`.
   * Dismisses when the user clicks away or chooses an option.
   */
  function showExportDropdown(anchorBtn) {
    // Remove any existing dropdown
    const existing = document.getElementById('stExportDropdown');
    if (existing) { existing.remove(); return; }

    const dropdown = document.createElement('div');
    dropdown.id = 'stExportDropdown';
    dropdown.style.cssText = [
      'position: absolute',
      'z-index: 500',
      'background: rgba(20,20,20,0.98)',
      'border: 1px solid rgba(255,255,255,0.15)',
      'border-radius: 10px',
      'padding: 6px 0',
      'min-width: 220px',
      'box-shadow: 0 8px 24px rgba(0,0,0,0.5)',
    ].join(';');

    // Position below anchor button
    const rect = anchorBtn.getBoundingClientRect();
    dropdown.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
    dropdown.style.left = rect.left + 'px';

    function makeOption(label, handler) {
      const btn = document.createElement('button');
      btn.style.cssText = [
        'display: block',
        'width: 100%',
        'padding: 8px 16px',
        'background: none',
        'border: none',
        'color: inherit',
        'font-size: 13px',
        'text-align: left',
        'cursor: pointer',
        'transition: background 0.1s',
      ].join(';');
      btn.textContent = label;
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.07)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
      btn.addEventListener('click', () => {
        dropdown.remove();
        handler();
      });
      return btn;
    }

    dropdown.appendChild(makeOption('📋 Caseload Summary CSV', exportCaseload));
    dropdown.appendChild(makeOption('📊 SpedTrack Progress CSV', exportSpedTrackProgressCsv));

    document.body.appendChild(dropdown);

    // Dismiss on outside click
    function onOutsideClick(e) {
      if (!dropdown.contains(e.target) && e.target !== anchorBtn) {
        dropdown.remove();
        document.removeEventListener('click', onOutsideClick, true);
      }
    }
    // Use capture so it fires before the button's own click re-toggles
    setTimeout(() => document.addEventListener('click', onOutsideClick, true), 0);
  }

  // ── Quick Entry Panel ────────────────────────────────────────────────────

  /** Track whether the quick entry panel is open */
  let quickEntryOpen = false;

  /**
   * Close the Quick Entry panel without toggling (used after a successful save).
   */
  function closeQuickEntryPanel() {
    const panel = document.getElementById('stQuickEntryPanel');
    const btn   = document.getElementById('stQuickEntry');
    quickEntryOpen = false;
    if (panel) panel.classList.remove('open');
    if (btn)   btn.classList.remove('active');
  }

  /**
   * Toggle the Quick Entry panel open/closed.
   * Builds the panel DOM on first open.
   */
  function toggleQuickEntryPanel() {
    const panel = document.getElementById('stQuickEntryPanel');
    const btn   = document.getElementById('stQuickEntry');
    if (!panel || !btn) return;

    quickEntryOpen = !quickEntryOpen;
    panel.classList.toggle('open', quickEntryOpen);
    btn.classList.toggle('active', quickEntryOpen);

    if (quickEntryOpen) {
      buildQuickEntryPanel(panel);
    }
  }

  /**
   * Build (or rebuild) the contents of the Quick Entry panel.
   * Uses only DOM API — no innerHTML with dynamic/user data.
   */
  function buildQuickEntryPanel(panel) {
    // Clear existing content
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    // ── Header ────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'st-qe-header';

    const title = document.createElement('span');
    title.className = 'st-qe-title';
    title.textContent = '⚡ Quick Entry';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'st-btn st-btn-small';
    closeBtn.type = 'button';
    closeBtn.textContent = '✕ Close';
    closeBtn.addEventListener('click', () => toggleQuickEntryPanel());
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // ── Controls row (Date + Scope) ────────────────────────────────────────
    const controls = document.createElement('div');
    controls.className = 'st-qe-controls';

    // Date label + input
    const dateLabel = document.createElement('label');
    dateLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:13px;';
    dateLabel.textContent = 'Date:';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'stQeDateInput';
    dateInput.value = todayISO();
    dateInput.className = 'st-btn'; // reuse base button styling for input
    dateInput.style.cssText = 'padding:4px 8px;font-size:13px;width:150px;';
    dateLabel.appendChild(dateInput);
    controls.appendChild(dateLabel);

    // Scope label + select
    const scopeLabel = document.createElement('label');
    scopeLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:13px;';
    scopeLabel.textContent = 'Scope:';
    const scopeSelect = document.createElement('select');
    scopeSelect.id = 'stQeScopeSelect';
    scopeSelect.className = 'st-btn';
    scopeSelect.style.cssText = 'padding:4px 8px;font-size:13px;';
    [
      { value: 'stale',          label: 'All stale goals (🟠🔴)' },
      { value: 'needs-data',     label: 'All goals needing data (🟡🟠🔴)' },
      { value: 'no-data',        label: 'Goals with no data yet (⚪)' },
      { value: 'all-active',     label: 'All active goals' },
      { value: 'current-student', label: 'Current student only' },
    ].forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      scopeSelect.appendChild(opt);
    });
    scopeSelect.value = 'stale';
    scopeSelect.addEventListener('change', () => populateQuickEntryTable(panel));
    scopeLabel.appendChild(scopeSelect);
    controls.appendChild(scopeLabel);

    panel.appendChild(controls);

    // ── Table wrapper ──────────────────────────────────────────────────────
    const tableWrap = document.createElement('div');
    tableWrap.className = 'st-qe-table-wrap';
    tableWrap.id = 'stQeTableWrap';
    panel.appendChild(tableWrap);

    // ── Footer ─────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'st-qe-footer';

    const countEl = document.createElement('span');
    countEl.className = 'st-qe-count';
    countEl.id = 'stQeCount';
    countEl.textContent = '0 of 0 goals filled';
    footer.appendChild(countEl);

    const actions = document.createElement('div');
    actions.className = 'st-qe-actions';

    const saveBtn = document.createElement('button');
    saveBtn.id = 'stQeSaveBtn';
    saveBtn.className = 'st-btn st-btn-small';
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save 0 Entries';
    saveBtn.addEventListener('click', () => saveQuickEntries(false));
    actions.appendChild(saveBtn);

    const saveCloseBtn = document.createElement('button');
    saveCloseBtn.id = 'stQeSaveCloseBtn';
    saveCloseBtn.className = 'st-btn st-btn-small st-btn-primary';
    saveCloseBtn.type = 'button';
    saveCloseBtn.textContent = 'Save & Close';
    saveCloseBtn.addEventListener('click', () => saveQuickEntries(true));
    actions.appendChild(saveCloseBtn);

    footer.appendChild(actions);
    panel.appendChild(footer);

    // Fill the table immediately
    populateQuickEntryTable(panel);
  }

  /**
   * Determine which goals to show based on the scope selector value.
   * Returns an array of { student, goal, daysSince, tier } objects.
   */
  function getQuickEntryRows() {
    const scopeEl = document.getElementById('stQeScopeSelect');
    const scope = scopeEl ? scopeEl.value : 'stale';

    const today = new Date();

    // Build a flat list of { student, goal, daysSince, tier } for every active goal
    // in students visible under the current class filter.
    const rows = [];
    const visibleStudentCodes = new Set(filteredStudents.map(s => s.code));

    const activeGoals = allGoals.filter(g =>
      g.status === 'active' &&
      visibleStudentCodes.has(g.student_code)
    );

    for (const goal of activeGoals) {
      const lastDate = getLastProgressDate(goal.student_code, goal.code);
      let daysSince = null;
      if (lastDate) {
        const diff = today - new Date(lastDate);
        daysSince = Math.floor(diff / MS_PER_DAY);
      }
      const stalenessObj = getGoalStaleness(daysSince);

      rows.push({ goal, daysSince, tier: stalenessObj.tier, stalenessObj });
    }

    // Filter by scope
    let filtered;
    switch (scope) {
      case 'stale':
        filtered = rows.filter(r => r.tier === 'stale' || r.tier === 'critical');
        break;
      case 'needs-data':
        filtered = rows.filter(r => r.tier === 'aging' || r.tier === 'stale' || r.tier === 'critical');
        break;
      case 'no-data':
        filtered = rows.filter(r => r.tier === 'none');
        break;
      case 'all-active':
        filtered = rows;
        break;
      case 'current-student': {
        // Show goals for whichever students are currently expanded (or the first one)
        const expanded = [...expandedStudents];
        if (expanded.length > 0) {
          const expSet = new Set(expanded);
          filtered = rows.filter(r => expSet.has(r.goal.student_code));
        } else {
          filtered = rows;
        }
        break;
      }
      default:
        filtered = rows;
    }

    // Sort: by staleness tier (worst first), then by student code, then goal code
    filtered.sort((a, b) => {
      const tierDiff = a.stalenessObj.sortOrder - b.stalenessObj.sortOrder;
      if (tierDiff !== 0) return tierDiff;
      const sc = (a.goal.student_code || '').localeCompare(b.goal.student_code || '');
      if (sc !== 0) return sc;
      return (a.goal.code || '').localeCompare(b.goal.code || '');
    });

    return filtered;
  }

  /**
   * Populate (or repopulate) the quick-entry table inside the panel.
   */
  function populateQuickEntryTable(panel) {
    const wrap = panel
      ? panel.querySelector('#stQeTableWrap')
      : document.getElementById('stQeTableWrap');
    if (!wrap) return;

    // Clear existing table
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);

    const rows = getQuickEntryRows();

    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'font-size:13px;opacity:0.6;padding:12px 0;';
      empty.textContent = 'No goals match the selected scope.';
      wrap.appendChild(empty);
      updateQuickEntryCount();
      return;
    }

    // Build table
    const table = document.createElement('table');
    table.className = 'st-qe-table';
    table.setAttribute('role', 'grid');

    // Header
    const thead = document.createElement('thead');
    const hRow = document.createElement('tr');
    ['Student', 'Goal Code', 'Goal Area', 'Last Data', 'Value', '✓'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      th.setAttribute('scope', 'col');
      hRow.appendChild(th);
    });
    thead.appendChild(hRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    rows.forEach((rowData, idx) => {
      const { goal, daysSince, stalenessObj } = rowData;
      const student = allStudents.find(s => s.code === goal.student_code);
      const studentName = student ? (student.name || student.code) : goal.student_code;

      const tr = document.createElement('tr');
      tr.dataset.goalCode    = goal.code;
      tr.dataset.studentCode = goal.student_code;
      tr.dataset.rowIdx      = String(idx);

      // Student name
      const tdStudent = document.createElement('td');
      tdStudent.textContent = studentName;
      tr.appendChild(tdStudent);

      // Goal code
      const tdCode = document.createElement('td');
      tdCode.style.fontFamily = 'monospace';
      tdCode.textContent = goal.code;
      tr.appendChild(tdCode);

      // Goal area
      const tdArea = document.createElement('td');
      tdArea.textContent = goal.goal_area || '—';
      tr.appendChild(tdArea);

      // Last data (staleness)
      const tdLast = document.createElement('td');
      const lastSpan = document.createElement('span');
      lastSpan.className = stalenessObj.cssClass || '';
      lastSpan.textContent = `${stalenessObj.icon} ${formatRelativeTime(daysSince)}`;
      tdLast.appendChild(lastSpan);
      tr.appendChild(tdLast);

      // Checkbox (created first so it can be referenced in the valueInput event listener)
      const tdCheck = document.createElement('td');
      const cbInput = document.createElement('input');
      cbInput.type = 'checkbox';
      cbInput.className = 'st-qe-check';
      cbInput.setAttribute('aria-label', `Include ${goal.code}`);
      cbInput.dataset.goalCode    = goal.code;
      cbInput.dataset.studentCode = goal.student_code;
      cbInput.addEventListener('change', () => updateQuickEntryCount());
      tdCheck.appendChild(cbInput);

      // Value input
      const tdValue = document.createElement('td');
      const valueInput = document.createElement('input');
      valueInput.type = 'number';
      valueInput.className = 'st-qe-value-input';
      valueInput.placeholder = '—';
      valueInput.setAttribute('aria-label', `Value for ${goal.code}`);
      valueInput.dataset.goalCode    = goal.code;
      valueInput.dataset.studentCode = goal.student_code;
      valueInput.dataset.rowIdx      = String(idx);

      // Auto-check checkbox when value is typed; update count
      valueInput.addEventListener('input', () => {
        const hasValue = valueInput.value.trim() !== '';
        cbInput.checked = hasValue;
        updateQuickEntryCount();
      });

      // Auto-select all text on focus
      valueInput.addEventListener('focus', () => valueInput.select());

      // Keyboard navigation: Enter → next row; Arrow Up/Down ± value
      valueInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          focusNextQeInput(idx);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const delta = e.ctrlKey ? 10 : e.shiftKey ? 5 : 1;
          const current = parseFloat(valueInput.value) || 0;
          valueInput.value = String(
            Math.round((current + (e.key === 'ArrowUp' ? delta : -delta)) * 10) / 10
          );
          valueInput.dispatchEvent(new Event('input'));
        }
      });

      tdValue.appendChild(valueInput);
      tr.appendChild(tdValue);
      tr.appendChild(tdCheck);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    updateQuickEntryCount();

    // Focus the first value input
    const firstInput = wrap.querySelector('.st-qe-value-input');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  /**
   * Move keyboard focus to the value input in the next table row.
   */
  function focusNextQeInput(currentIdx) {
    const wrap = document.getElementById('stQeTableWrap');
    if (!wrap) return;
    const inputs = [...wrap.querySelectorAll('.st-qe-value-input')];
    const next = inputs.find(i => parseInt(i.dataset.rowIdx, 10) > currentIdx);
    if (next) next.focus();
  }

  /**
   * Update the "N of M goals filled" counter and the Save button label.
   */
  function updateQuickEntryCount() {
    const wrap    = document.getElementById('stQeTableWrap');
    const countEl = document.getElementById('stQeCount');
    const saveBtn = document.getElementById('stQeSaveBtn');
    if (!wrap) return;

    const allRows   = wrap.querySelectorAll('tr[data-goal-code]');
    const checked   = wrap.querySelectorAll('.st-qe-check:checked');
    const total     = allRows.length;
    const filled    = checked.length;

    if (countEl) countEl.textContent = `${filled} of ${total} goals filled`;
    if (saveBtn) {
      saveBtn.textContent = `Save ${filled} Entr${filled === 1 ? 'y' : 'ies'}`;
      saveBtn.disabled    = filled === 0;
    }
    const saveCloseBtn = document.getElementById('stQeSaveCloseBtn');
    if (saveCloseBtn) saveCloseBtn.disabled = filled === 0;
  }

  /**
   * Save all checked quick-entry rows via db.upsertGoalProgress().
   * Shows a progress indicator, then a success toast.
   * @param {boolean} closeAfter  If true, close the panel after saving.
   */
  async function saveQuickEntries(closeAfter) {
    const wrap      = document.getElementById('stQeTableWrap');
    const dateInput = document.getElementById('stQeDateInput');
    const countEl   = document.getElementById('stQeCount');
    const saveBtn   = document.getElementById('stQeSaveBtn');
    const saveCloseBtn = document.getElementById('stQeSaveCloseBtn');
    if (!wrap || !dateInput) return;

    const date = dateInput.value;
    if (!date) {
      showToast('Please select a date before saving.');
      return;
    }

    // Collect checked rows with a value
    const toSave = [];
    const rows = wrap.querySelectorAll('tr[data-goal-code]');
    rows.forEach(tr => {
      const cb = tr.querySelector('.st-qe-check');
      const vi = tr.querySelector('.st-qe-value-input');
      if (cb && cb.checked && vi && vi.value.trim() !== '') {
        const numVal = parseFloat(vi.value);
        if (!isNaN(numVal)) {
          toSave.push({
            goal_code:    tr.dataset.goalCode,
            student_code: tr.dataset.studentCode,
            value:        numVal,
            tr,
            vi,
            cb,
          });
        }
      }
    });

    if (toSave.length === 0) {
      showToast('No filled entries to save.');
      return;
    }

    // Build pre-save snapshots for undo (most recent existing entry per goal)
    const undoSnapshot = toSave.map(entry => {
      const prior = allProgressEntries
        .filter(p => p.goal_code === entry.goal_code && p.student_code === entry.student_code)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const mostRecent = prior[0] || null;
      return {
        studentCode:   entry.student_code,
        goalCode:      entry.goal_code,
        previousValue: mostRecent ? mostRecent.value : null,
        previousDate:  mostRecent ? mostRecent.date  : null,
        savedDate:     date,
      };
    });

    // Disable buttons during save
    if (saveBtn)      { saveBtn.disabled = true; }
    if (saveCloseBtn) { saveCloseBtn.disabled = true; }

    let saved = 0;
    let failed = 0;

    for (const entry of toSave) {
      if (countEl) {
        countEl.textContent = `Saving ${saved + 1} of ${toSave.length}…`;
      }
      try {
        await db.upsertGoalProgress({
          goal_code:    entry.goal_code,
          student_code: entry.student_code,
          date,
          value:        entry.value,
          source:       'manual',
        });
        // Mark row as saved
        entry.tr.classList.add('st-qe-saved');
        entry.vi.classList.add('saved');
        entry.vi.disabled = true;
        entry.cb.checked  = false;
        entry.cb.disabled = true;
        saved++;
      } catch (err) {
        console.error('[tc-students] Quick entry save failed:', err, entry);
        failed++;
      }
    }

    // Reload in-memory progress data and re-render
    await reloadProgressEntries();
    filterStudents();
    renderStudentList();
    renderStudentKpiSummary();
    renderCollectNudge();

    // Show result toast / undo toast
    if (failed === 0) {
      showUndoToast(undoSnapshot);
    } else if (saved > 0) {
      showErrorToast(`${saved} saved, ${failed} failed. Check console for details.`);
    } else {
      showErrorToast(`Save failed. Please check your connection and try again.`);
    }

    updateQuickEntryCount();

    if (closeAfter && failed === 0) {
      closeQuickEntryPanel();
    } else {
      // Re-enable save buttons
      if (saveBtn)      saveBtn.disabled      = false;
      if (saveCloseBtn) saveCloseBtn.disabled = false;
    }
  }

  // ── Global Quick Entry Bar ────────────────────────────────────────────────

  /**
   * Build and wire up the Global Quick Entry Bar: a persistent bar above the
   * student table for rapid data entry without expanding a student row.
   * Provides student code + goal code autocomplete, value input, and Enter-to-save.
   */
  function initGlobalQuickEntryBar() {
    const bar = document.getElementById('stGlobalQuickEntryBar');
    if (!bar) return;

    // Clear any previous content
    while (bar.firstChild) bar.removeChild(bar.firstChild);

    // SVG lightning bolt icon
    const svgNS = 'http://www.w3.org/2000/svg';
    const iconSvg = document.createElementNS(svgNS, 'svg');
    iconSvg.setAttribute('width', '16'); iconSvg.setAttribute('height', '16');
    iconSvg.setAttribute('viewBox', '0 0 24 24'); iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', 'currentColor'); iconSvg.setAttribute('stroke-width', '1.5');
    iconSvg.setAttribute('stroke-linecap', 'round'); iconSvg.setAttribute('stroke-linejoin', 'round');
    iconSvg.setAttribute('aria-hidden', 'true');
    iconSvg.style.flexShrink = '0';
    const iconPath = document.createElementNS(svgNS, 'polygon');
    iconPath.setAttribute('points', '13 2 3 14 12 14 11 22 21 10 12 10 13 2');
    iconSvg.appendChild(iconPath);
    bar.appendChild(iconSvg);

    // Label
    const label = document.createElement('span');
    label.className = 'st-gqe-label';
    label.textContent = 'Quick Entry:';
    bar.appendChild(label);

    // Datalist for student codes
    const studentDatalist = document.createElement('datalist');
    studentDatalist.id = 'stGqeStudentList';
    const activeStudents = allStudents.filter(s => s.active !== false && s.status !== 'archived');
    activeStudents.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.code;
      studentDatalist.appendChild(opt);
    });
    bar.appendChild(studentDatalist);

    // Datalist for goal codes (updated when student is selected)
    const goalDatalist = document.createElement('datalist');
    goalDatalist.id = 'stGqeGoalList';
    bar.appendChild(goalDatalist);

    // Student code input
    const studentInput = document.createElement('input');
    studentInput.type = 'text';
    studentInput.id = 'stGqeStudent';
    studentInput.className = 'st-gqe-input';
    studentInput.placeholder = 'Student code';
    studentInput.setAttribute('list', 'stGqeStudentList');
    studentInput.setAttribute('autocomplete', 'off');
    studentInput.setAttribute('aria-label', 'Student code for quick entry');
    bar.appendChild(studentInput);

    // Goal code input
    const goalInput = document.createElement('input');
    goalInput.type = 'text';
    goalInput.id = 'stGqeGoal';
    goalInput.className = 'st-gqe-input';
    goalInput.placeholder = 'Goal code';
    goalInput.setAttribute('list', 'stGqeGoalList');
    goalInput.setAttribute('autocomplete', 'off');
    goalInput.setAttribute('aria-label', 'Goal code for quick entry');
    bar.appendChild(goalInput);

    // Value input
    const valueInput = document.createElement('input');
    valueInput.type = 'number';
    valueInput.id = 'stGqeValue';
    valueInput.className = 'st-gqe-input st-gqe-value';
    valueInput.placeholder = 'Value';
    valueInput.setAttribute('aria-label', 'Progress value for quick entry');
    valueInput.step = 'any';
    bar.appendChild(valueInput);

    // Date input (hidden by default — defaults to today)
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'stGqeDate';
    dateInput.className = 'st-gqe-input st-gqe-date';
    dateInput.value = todayISO();
    dateInput.setAttribute('aria-label', 'Date for quick entry');
    bar.appendChild(dateInput);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.id = 'stGqeSaveBtn';
    saveBtn.className = 'st-btn st-btn-small st-btn-primary';
    saveBtn.textContent = 'Save';
    saveBtn.setAttribute('aria-label', 'Save quick entry');
    bar.appendChild(saveBtn);

    // Wire: update goal datalist when student code changes
    function updateGoalDatalist() {
      const code = studentInput.value.trim().toUpperCase();
      while (goalDatalist.firstChild) goalDatalist.removeChild(goalDatalist.firstChild);
      if (!code) return;
      const studentGoals = allGoals.filter(g => g.student_code === code && g.status !== 'archived');
      studentGoals.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.code;
        goalDatalist.appendChild(opt);
      });
      // Pre-fill smart default: most-stale active goal for this student
      if (studentGoals.length === 1 && !goalInput.value) {
        goalInput.value = studentGoals[0].code;
        valueInput.focus();
      }
    }

    studentInput.addEventListener('input', updateGoalDatalist);
    studentInput.addEventListener('change', () => {
      updateGoalDatalist();
      if (goalInput.value) valueInput.focus();
      else goalInput.focus();
    });

    // Wire: Enter on goal or value input → save
    const doSave = async () => {
      const studentCode = studentInput.value.trim().toUpperCase();
      const goalCode = goalInput.value.trim().toUpperCase();
      const rawVal = valueInput.value.trim();
      const date = dateInput.value;

      // Identify which required fields are missing for a specific error message
      const missing = [];
      if (!studentCode) missing.push('student code');
      if (!goalCode) missing.push('goal code');
      if (rawVal === '') missing.push('value');
      if (!date) missing.push('date');
      if (missing.length > 0) {
        showToast(`Please fill in: ${missing.join(', ')}.`);
        return;
      }
      const numVal = parseFloat(rawVal);
      if (isNaN(numVal)) {
        showToast(`Value must be a number (received: "${rawVal}").`);
        return;
      }

      // Validate student and goal exist in memory
      const student = allStudents.find(s => s.code === studentCode);
      if (!student) { showToast(`Student "${studentCode}" not found.`); return; }
      const goal = allGoals.find(g => g.student_code === studentCode && g.code === goalCode && g.status !== 'archived');
      if (!goal) { showToast(`Goal "${goalCode}" not found for student "${studentCode}".`); return; }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      // Snapshot for undo
      const prior = allProgressEntries
        .filter(p => p.goal_code === goalCode && p.student_code === studentCode)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const undoSnapshot = [{
        studentCode, goalCode,
        previousValue: prior[0]?.value ?? null,
        previousDate:  prior[0]?.date  ?? null,
        savedDate: date,
      }];

      try {
        await db.upsertGoalProgress({ goal_code: goalCode, student_code: studentCode, date, value: numVal, source: 'manual' });
        await reloadProgressEntries();
        filterStudents();
        renderStudentList();
        renderStudentKpiSummary();
        renderCollectNudge();
        showUndoToast(undoSnapshot);

        // Reset for next entry — keep student code but clear goal + value, re-focus goal
        goalInput.value = '';
        valueInput.value = '';
        updateGoalDatalist();
        studentInput.focus();
        studentInput.select();
      } catch (err) {
        console.error('[tc-students] Global Quick Entry save failed:', err);
        showErrorToast('Save failed. Check your connection and try again.');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    };

    saveBtn.addEventListener('click', doSave);
    goalInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
    valueInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
  }

  // Initialize
  function init() {
    console.log('[tc-students] Initializing...');
    
    // Set default quarter filter to current quarter
    selectedQuarter = getCurrentQuarter();

    // Restore sort preference (default: urgency)
    const savedSort = localStorage.getItem(ST_SORT_PREF_KEY);
    sortBy = savedSort || 'urgency';
    const sortSelect = document.getElementById('stSortSelect');
    if (sortSelect) sortSelect.value = sortBy;
    
    renderQuarterBar();
    renderClassFilterOptions();
    renderGoalAreaFilterOptions();
    renderStudentQuarterFilterButtons();
    setupEventHandlers();
    setupSummaryHandlers();
    setupTcDotGridPopup();
    injectBulkObsConfigButton();
    setupAutoRefresh();
    loadData();

    // Offline / online detection
    if (!navigator.onLine) showOfflineBanner();
    window.addEventListener('offline', () => showOfflineBanner());
    window.addEventListener('online',  () => hideOfflineBanner());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
