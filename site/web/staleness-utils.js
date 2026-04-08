/**
 * staleness-utils.js — Shared 5-Tier Goal Data-Staleness Module
 *
 * Provides staleness tiers, per-goal classification, per-student health-dot
 * aggregation, and relative-time formatting for the Teacher Center Students page.
 *
 * Exported API:
 *   getGoalStaleness(daysSinceLastCollection) → { tier, label, cssClass, icon }
 *   getStudentHealthDot(goalStalenessArray)   → { tier, label, cssClass, icon }
 *   formatRelativeTime(daysSince)             → string  e.g. "3d ago" | "never"
 */

"use strict";

// ---------------------------------------------------------------------------
// Tier definitions (ordered worst → best so index = sort key)
// ---------------------------------------------------------------------------

/** @type {Array<{tier:string, label:string, cssClass:string, icon:string, sortOrder:number}>} */
const STALENESS_TIERS = [
  { tier: 'critical', label: 'No Recent Data', cssClass: 'st-date-urgent',   icon: '🔴', sortOrder: 0 },
  { tier: 'stale',    label: 'Overdue',        cssClass: 'st-date-stale',    icon: '🟠', sortOrder: 1 },
  { tier: 'aging',    label: 'Due Soon',       cssClass: 'st-date-warning',  icon: '🟡', sortOrder: 2 },
  { tier: 'fresh',    label: 'On Track',       cssClass: 'st-date-ok',       icon: '🟢', sortOrder: 3 },
  { tier: 'none',     label: 'Never Collected',cssClass: 'st-date-none',     icon: '⚪', sortOrder: 4 },
];

/** Map tier name → tier object for O(1) lookup */
const TIER_BY_NAME = Object.fromEntries(STALENESS_TIERS.map(t => [t.tier, t]));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a goal by how many days have passed since data was last collected.
 *
 * @param {number|null} daysSinceLastCollection
 *   Number of whole days since the most recent progress entry, or null / negative
 *   values to indicate that data has never been collected.
 * @returns {{ tier: string, label: string, cssClass: string, icon: string, sortOrder: number }}
 */
export function getGoalStaleness(daysSinceLastCollection) {
  if (daysSinceLastCollection == null || daysSinceLastCollection < 0) {
    return TIER_BY_NAME['none'];
  }
  if (daysSinceLastCollection <= 7)  return TIER_BY_NAME['fresh'];
  if (daysSinceLastCollection <= 14) return TIER_BY_NAME['aging'];
  if (daysSinceLastCollection <= 30) return TIER_BY_NAME['stale'];
  return TIER_BY_NAME['critical'];
}

/**
 * Aggregate an array of per-goal staleness objects into a single student-level
 * health indicator (worst tier wins).
 *
 * @param {Array<{tier:string, label:string, cssClass:string, icon:string, sortOrder:number}>} goalStalenessArray
 * @returns {{ tier: string, label: string, cssClass: string, icon: string, sortOrder: number }}
 */
export function getStudentHealthDot(goalStalenessArray) {
  if (!goalStalenessArray || goalStalenessArray.length === 0) {
    return TIER_BY_NAME['none'];
  }
  // Worst tier = lowest sortOrder
  return goalStalenessArray.reduce((worst, current) =>
    current.sortOrder < worst.sortOrder ? current : worst
  );
}

/**
 * Format a "days since" value as a human-readable relative-time string.
 *
 * @param {number|null} daysSince
 * @returns {string}  e.g. "3d ago", "11d ago", "today", "never"
 */
export function formatRelativeTime(daysSince) {
  if (daysSince == null || daysSince < 0) return 'never';
  if (daysSince === 0) return 'today';
  if (daysSince === 1) return '1d ago';
  return `${daysSince}d ago`;
}
