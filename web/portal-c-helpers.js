// Portal C Helper Functions
// Risk indicators, advanced filtering, rollups, and analytics

/**
 * Portal C Constants
 */
export const PortalCConstants = {
  LATE_DAYS_MAX: 3,
  MISSING_DAYS_MIN: 4,
  LOW_SCORE: 60,
  IMPROVEMENT_DELTA: 5
};

/**
 * Risk badge types
 */
export const RiskBadge = {
  MISSING: 'MISSING',
  LATE: 'LATE',
  LOW: 'LOW',
  NONE: null
};

/**
 * Compute risk badge for an assignment
 * @param {Object} instance - Assignment instance
 * @param {Object} latestSubmission - Most recent submission (or null)
 * @param {Date} now - Current date/time
 * @returns {string|null} Risk badge type or null
 */
export function computeRiskBadge(instance, latestSubmission, now = new Date()) {
  // Check for low score first (if graded)
  if (latestSubmission && latestSubmission.score_total != null) {
    if (latestSubmission.score_total < PortalCConstants.LOW_SCORE) {
      return RiskBadge.LOW;
    }
  }
  
  // Check for missing/late if not submitted
  if (!latestSubmission && instance.due_at) {
    const dueDate = new Date(instance.due_at);
    const daysPastDue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
    
    if (daysPastDue >= PortalCConstants.MISSING_DAYS_MIN) {
      return RiskBadge.MISSING;
    }
    
    if (daysPastDue > 0 && daysPastDue <= PortalCConstants.LATE_DAYS_MAX) {
      return RiskBadge.LATE;
    }
  }
  
  return RiskBadge.NONE;
}

/**
 * Advanced filter: Filter by score range
 * @param {Array} assignments - Array of {instance, latestSubmission, status}
 * @param {number} minScore - Minimum score (inclusive)
 * @param {number} maxScore - Maximum score (inclusive)
 * @returns {Array} Filtered assignments
 */
export function filterByScoreRange(assignments, minScore = 0, maxScore = 100) {
  return assignments.filter(a => {
    if (!a.latestSubmission || a.latestSubmission.score_total == null) {
      return false; // Exclude ungraded assignments
    }
    const score = a.latestSubmission.score_total;
    return score >= minScore && score <= maxScore;
  });
}

/**
 * Advanced filter: Filter by recency (assignments graded or submitted within N days)
 * @param {Array} assignments - Array of {instance, latestSubmission, status}
 * @param {number} days - Number of days
 * @param {string} type - 'graded' or 'submitted'
 * @param {Date} now - Current date/time
 * @returns {Array} Filtered assignments
 */
export function filterByRecency(assignments, days, type = 'graded', now = new Date()) {
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return assignments.filter(a => {
    if (!a.latestSubmission) return false;
    
    if (type === 'graded') {
      // Check if graded and graded within N days
      if (a.latestSubmission.score_total == null) return false;
      // Assume graded_at exists or use submitted_at as fallback
      const gradedDate = new Date(a.latestSubmission.graded_at || a.latestSubmission.submitted_at);
      return gradedDate >= cutoffDate;
    } else if (type === 'submitted') {
      const submittedDate = new Date(a.latestSubmission.submitted_at);
      return submittedDate >= cutoffDate;
    }
    
    return false;
  });
}

/**
 * Advanced filter: Filter by source/type
 * @param {Array} assignments - Array of {instance, latestSubmission, status}
 * @param {Array} types - Array of types: 'standard', 'practice', 'project'
 * @param {Object} assignmentsMap - Map of assignment_id -> assignment object with meta
 * @returns {Array} Filtered assignments
 */
export function filterByType(assignments, types, assignmentsMap) {
  if (!types || types.length === 0) return assignments;
  
  return assignments.filter(a => {
    const assignment = assignmentsMap[a.instance.assignment_id];
    if (!assignment) return false;
    
    // Check assignment.meta.type or default to 'standard'
    const assignmentType = assignment.meta?.type || 'standard';
    return types.includes(assignmentType);
  });
}

/**
 * Advanced filter: Filter by overdue streak (assignments missing > X threshold)
 * @param {Array} assignments - Array of {instance, latestSubmission, status}
 * @param {number} minDays - Minimum days overdue
 * @param {Date} now - Current date/time
 * @returns {Array} Filtered assignments
 */
export function filterByOverdueStreak(assignments, minDays, now = new Date()) {
  return assignments.filter(a => {
    if (a.latestSubmission) return false; // Already submitted
    if (!a.instance.due_at) return false;
    
    const dueDate = new Date(a.instance.due_at);
    const daysPastDue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
    
    return daysPastDue >= minDays;
  });
}

/**
 * Apply advanced filters to assignments
 * Combines filters with AND logic across categories, OR within multi-select
 * @param {Array} assignments - Array of {instance, latestSubmission, status}
 * @param {Object} filters - Filter configuration
 * @param {Object} assignmentsMap - Map of assignment_id -> assignment object
 * @param {Date} now - Current date/time
 * @returns {Array} Filtered assignments
 */
export function applyAdvancedFilters(assignments, filters, assignmentsMap, now = new Date()) {
  let result = [...assignments];
  
  // Score range filter
  if (filters.scoreMin != null || filters.scoreMax != null) {
    const min = filters.scoreMin ?? 0;
    const max = filters.scoreMax ?? 100;
    result = filterByScoreRange(result, min, max);
  }
  
  // Recency filter
  if (filters.recencyDays && filters.recencyType) {
    result = filterByRecency(result, filters.recencyDays, filters.recencyType, now);
  }
  
  // Source/Type filter
  if (filters.types && filters.types.length > 0) {
    result = filterByType(result, filters.types, assignmentsMap);
  }
  
  // Overdue streak filter
  if (filters.overdueDays) {
    result = filterByOverdueStreak(result, filters.overdueDays, now);
  }
  
  return result;
}

/**
 * Calculate dashboard summary statistics
 * @param {Object} groupedAssignments - Assignments grouped by status
 * @param {Array} allAssignments - All assignments with risk badges
 * @returns {Object} Summary counts
 */
export function calculateDashboardSummary(groupedAssignments, allAssignments) {
  const summary = {
    missing: groupedAssignments.Missing?.length || 0,
    late: groupedAssignments.Late?.length || 0,
    lowScore: 0,
    improvements: 0
  };
  
  // Count low scores
  for (const assignment of allAssignments) {
    const risk = computeRiskBadge(assignment.instance, assignment.latestSubmission);
    if (risk === RiskBadge.LOW) {
      summary.lowScore++;
    }
  }
  
  // Count improvement opportunities (late or missing that can be submitted)
  summary.improvements = summary.late + summary.missing;
  
  return summary;
}

/**
 * Calculate week-over-week trend
 * @param {Array} submissions - All graded submissions
 * @param {Date} now - Current date/time
 * @returns {Object} Trend data
 */
export function calculateWeekOverWeekTrend(submissions, now = new Date()) {
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  
  // Count submissions in last week vs previous week
  const lastWeek = submissions.filter(s => {
    const date = new Date(s.submitted_at);
    return date >= oneWeekAgo && date < now;
  });
  
  const prevWeek = submissions.filter(s => {
    const date = new Date(s.submitted_at);
    return date >= twoWeeksAgo && date < oneWeekAgo;
  });
  
  return {
    lastWeekCount: lastWeek.length,
    prevWeekCount: prevWeek.length,
    delta: lastWeek.length - prevWeek.length,
    direction: lastWeek.length > prevWeek.length ? 'up' : lastWeek.length < prevWeek.length ? 'down' : 'flat'
  };
}

/**
 * Calculate average score trend
 * @param {Array} submissions - All graded submissions (sorted by date)
 * @returns {Object} Trend data
 */
export function calculateAverageScoreTrend(submissions) {
  if (submissions.length < 2) {
    return { direction: 'flat', currentAvg: 0, prevAvg: 0, delta: 0 };
  }
  
  // Sort by submitted_at descending
  const sorted = [...submissions].sort((a, b) => 
    new Date(b.submitted_at) - new Date(a.submitted_at)
  );
  
  // Last 5 vs previous 5
  const last5 = sorted.slice(0, 5).filter(s => s.score_total != null);
  const prev5 = sorted.slice(5, 10).filter(s => s.score_total != null);
  
  if (last5.length === 0) {
    return { direction: 'flat', currentAvg: 0, prevAvg: 0, delta: 0 };
  }
  
  const currentAvg = last5.reduce((sum, s) => sum + s.score_total, 0) / last5.length;
  const prevAvg = prev5.length > 0 
    ? prev5.reduce((sum, s) => sum + s.score_total, 0) / prev5.length 
    : currentAvg;
  
  const delta = currentAvg - prevAvg;
  const direction = delta > PortalCConstants.IMPROVEMENT_DELTA ? 'up' 
                  : delta < -PortalCConstants.IMPROVEMENT_DELTA ? 'down' 
                  : 'flat';
  
  return { direction, currentAvg, prevAvg, delta };
}

/**
 * Granularity options for rollups
 */
export const Granularity = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly'
};

/**
 * Aggregate submissions by granularity
 * @param {Array} submissions - All graded submissions
 * @param {string} granularity - 'daily', 'weekly', or 'monthly'
 * @param {number} buckets - Number of buckets to return (default 8)
 * @returns {Array} Aggregated metrics per bucket
 */
export function aggregateByGranularity(submissions, granularity = Granularity.DAILY, buckets = 8) {
  const result = [];
  const now = new Date();
  
  // Sort submissions by date ascending
  const sorted = [...submissions].sort((a, b) => 
    new Date(a.submitted_at) - new Date(b.submitted_at)
  );
  
  // Create buckets
  for (let i = buckets - 1; i >= 0; i--) {
    const bucketEnd = new Date(now);
    const bucketStart = new Date(now);
    
    if (granularity === Granularity.DAILY) {
      bucketStart.setDate(bucketStart.getDate() - i);
      bucketEnd.setDate(bucketEnd.getDate() - i + 1);
    } else if (granularity === Granularity.WEEKLY) {
      bucketStart.setDate(bucketStart.getDate() - (i + 1) * 7);
      bucketEnd.setDate(bucketEnd.getDate() - i * 7);
    } else if (granularity === Granularity.MONTHLY) {
      bucketStart.setMonth(bucketStart.getMonth() - (i + 1));
      bucketEnd.setMonth(bucketEnd.getMonth() - i);
    }
    
    // Filter submissions in this bucket
    const bucketSubmissions = sorted.filter(s => {
      const date = new Date(s.submitted_at);
      return date >= bucketStart && date < bucketEnd;
    });
    
    // Calculate metrics
    const graded = bucketSubmissions.filter(s => s.score_total != null);
    const avgScore = graded.length > 0
      ? graded.reduce((sum, s) => sum + s.score_total, 0) / graded.length
      : 0;
    
    // Calculate on-time rate (requires instance data, approximated here)
    const onTimeRate = 1.0; // TODO: Calculate based on submission vs due date
    
    result.push({
      label: formatBucketLabel(bucketStart, granularity),
      start: bucketStart.toISOString(),
      end: bucketEnd.toISOString(),
      submissionCount: bucketSubmissions.length,
      avgScore,
      onTimeRate
    });
  }
  
  return result;
}

/**
 * Format bucket label based on granularity
 * @param {Date} date - Bucket start date
 * @param {string} granularity - Granularity type
 * @returns {string} Formatted label
 */
function formatBucketLabel(date, granularity) {
  if (granularity === Granularity.DAILY) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } else if (granularity === Granularity.WEEKLY) {
    return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  } else if (granularity === Granularity.MONTHLY) {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return date.toLocaleDateString();
}

/**
 * Get sparkline data for rollup visualization
 * @param {Array} buckets - Aggregated buckets from aggregateByGranularity
 * @returns {Array} Array of {value, label} for sparkline
 */
export function getSparklineDataFromBuckets(buckets) {
  return buckets.map(b => ({
    value: b.avgScore,
    label: b.label
  }));
}

/**
 * Export assignments to CSV with granularity
 * @param {Array} assignments - Assignments to export
 * @param {Object} filters - Applied filters
 * @param {string} granularity - Granularity for grouping
 * @returns {string} CSV string
 */
export function exportToCSV(assignments, filters = {}, granularity = Granularity.DAILY) {
  const headers = ['Title', 'Class', 'Due Date', 'Status', 'Score', 'Submitted At', 'Risk'];
  const rows = [headers];
  
  for (const { instance, latestSubmission, status } of assignments) {
    const risk = computeRiskBadge(instance, latestSubmission);
    rows.push([
      instance.title || 'Untitled',
      instance.class_name || '',
      instance.due_at ? new Date(instance.due_at).toLocaleDateString() : '',
      status,
      latestSubmission?.score_total ?? '',
      latestSubmission?.submitted_at ? new Date(latestSubmission.submitted_at).toLocaleString() : '',
      risk || ''
    ]);
  }
  
  return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
}

/**
 * Create PDF metadata for export
 * @param {string} studentName - Student name
 * @param {string} studentCode - Student code
 * @param {Object} filters - Applied filters
 * @param {string} granularity - Granularity setting
 * @returns {Object} PDF metadata
 */
export function createPDFMetadata(studentName, studentCode, filters = {}, granularity = Granularity.DAILY) {
  return {
    title: `${studentName} (${studentCode}) - Assignments Report`,
    generated: new Date().toLocaleString(),
    filters: {
      status: filters.status?.join(', ') || 'All',
      class: filters.class_id || 'All',
      dateRange: filters.dueDateFrom && filters.dueDateTo 
        ? `${filters.dueDateFrom} to ${filters.dueDateTo}` 
        : 'All',
      scoreRange: filters.scoreMin != null || filters.scoreMax != null
        ? `${filters.scoreMin ?? 0}-${filters.scoreMax ?? 100}`
        : 'All'
    },
    granularity
  };
}
