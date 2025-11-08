// Portal B Helper Functions
// Status computation, assignment grouping, and grade calculations

/**
 * Assignment status enumeration
 */
export const AssignmentStatus = {
  UPCOMING: 'Upcoming',
  IN_PROGRESS: 'In Progress',
  LATE: 'Late',
  MISSING: 'Missing',
  SUBMITTED: 'Submitted',
  GRADED: 'Graded'
};

/**
 * Compute assignment status based on instance and submission data
 * @param {Object} instance - Assignment instance
 * @param {Object} latestSubmission - Most recent submission (or null)
 * @param {Date} now - Current date/time
 * @returns {string} Status from AssignmentStatus enum
 */
export function computeAssignmentStatus(instance, latestSubmission, now = new Date()) {
  // If graded, show Graded
  if (latestSubmission && latestSubmission.score_total != null) {
    return AssignmentStatus.GRADED;
  }
  
  // If submitted but not graded
  if (latestSubmission || instance.status === 'Submitted') {
    return AssignmentStatus.SUBMITTED;
  }
  
  // Check if past due
  if (instance.due_at) {
    const dueDate = new Date(instance.due_at);
    const daysPastDue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
    
    if (daysPastDue > 0) {
      // Past due and not submitted
      // Missing if > 3 days past due
      if (daysPastDue > 3) {
        return AssignmentStatus.MISSING;
      }
      // Late if 1-3 days past due
      return AssignmentStatus.LATE;
    }
  }
  
  // Check if draft is saved (In Progress)
  if (instance.status === 'In Progress') {
    return AssignmentStatus.IN_PROGRESS;
  }
  
  // Default: Upcoming (due >= today, not submitted)
  return AssignmentStatus.UPCOMING;
}

/**
 * Group assignments by status with precedence
 * Status precedence: Missing > Late > In Progress > Upcoming
 * @param {Array} instances - Assignment instances
 * @param {Object} submissionsMap - Map of instance_id -> latest submission
 * @param {Date} now - Current date/time
 * @returns {Object} Grouped assignments by status
 */
export function groupAssignmentsByStatus(instances, submissionsMap, now = new Date()) {
  const groups = {
    [AssignmentStatus.UPCOMING]: [],
    [AssignmentStatus.IN_PROGRESS]: [],
    [AssignmentStatus.LATE]: [],
    [AssignmentStatus.MISSING]: [],
    [AssignmentStatus.SUBMITTED]: [],
    [AssignmentStatus.GRADED]: []
  };
  
  for (const instance of instances) {
    const latestSubmission = submissionsMap[instance.id] || null;
    const status = computeAssignmentStatus(instance, latestSubmission, now);
    groups[status].push({ instance, latestSubmission, status });
  }
  
  return groups;
}

/**
 * Filter assignments based on criteria
 * @param {Array} assignments - Array of {instance, latestSubmission, status}
 * @param {Object} filters - Filter criteria
 * @returns {Array} Filtered assignments
 */
export function filterAssignments(assignments, filters = {}) {
  let result = [...assignments];
  
  // Filter by status
  if (filters.status && filters.status.length > 0) {
    result = result.filter(a => filters.status.includes(a.status));
  }
  
  // Filter by due date range
  if (filters.dueDateFrom) {
    const fromDate = new Date(filters.dueDateFrom);
    result = result.filter(a => {
      if (!a.instance.due_at) return false;
      return new Date(a.instance.due_at) >= fromDate;
    });
  }
  
  if (filters.dueDateTo) {
    const toDate = new Date(filters.dueDateTo);
    result = result.filter(a => {
      if (!a.instance.due_at) return true; // Include assignments without due date
      return new Date(a.instance.due_at) <= toDate;
    });
  }
  
  // Filter by class
  if (filters.class_id) {
    result = result.filter(a => a.instance.class_id === filters.class_id);
  }
  
  return result;
}

/**
 * Calculate overall grade average
 * @param {Array} submissions - All graded submissions
 * @returns {number|null} Average percentage or null if no graded submissions
 */
export function calculateOverallAverage(submissions) {
  const gradedSubmissions = submissions.filter(s => s.score_total != null);
  
  if (gradedSubmissions.length === 0) {
    return null;
  }
  
  const sum = gradedSubmissions.reduce((acc, s) => acc + s.score_total, 0);
  return Math.round(sum / gradedSubmissions.length);
}

/**
 * Calculate per-class averages
 * @param {Array} submissions - All graded submissions
 * @param {Array} instances - Assignment instances
 * @param {Array} assignments - Assignments data
 * @returns {Object} Map of class_id -> average percentage
 */
export function calculateClassAverages(submissions, instances, assignments) {
  const gradedSubmissions = submissions.filter(s => s.score_total != null);
  
  // Create instance map for quick lookup
  const instanceMap = new Map(instances.map(i => [i.id, i]));
  const assignmentMap = new Map(assignments.map(a => [a.id, a]));
  
  // Group by class
  const classTotals = {};
  const classCounts = {};
  
  for (const submission of gradedSubmissions) {
    const instance = instanceMap.get(submission.instance_id);
    if (!instance) continue;
    
    const assignment = assignmentMap.get(instance.assignment_id);
    if (!assignment) continue;
    
    const classId = assignment.meta?.class_id || assignment.class_id || 'unknown';
    
    if (!classTotals[classId]) {
      classTotals[classId] = 0;
      classCounts[classId] = 0;
    }
    
    classTotals[classId] += submission.score_total;
    classCounts[classId]++;
  }
  
  // Calculate averages
  const averages = {};
  for (const classId in classTotals) {
    averages[classId] = Math.round(classTotals[classId] / classCounts[classId]);
  }
  
  return averages;
}

/**
 * Calculate trend (last 5 graded vs previous 5)
 * @param {Array} submissions - All graded submissions (sorted by date desc)
 * @returns {Object} {direction: 'up'|'down'|'flat', lastFiveAvg, prevFiveAvg}
 */
export function calculateTrend(submissions) {
  const gradedSubmissions = submissions
    .filter(s => s.score_total != null)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  
  if (gradedSubmissions.length < 2) {
    return { direction: 'flat', lastFiveAvg: null, prevFiveAvg: null };
  }
  
  // Get last 5 (or fewer if less than 5 available)
  const lastFive = gradedSubmissions.slice(0, Math.min(5, gradedSubmissions.length));
  const lastFiveAvg = Math.round(
    lastFive.reduce((acc, s) => acc + s.score_total, 0) / lastFive.length
  );
  
  // Get previous 5 (or fewer)
  const prevStart = Math.min(5, gradedSubmissions.length);
  const prevEnd = Math.min(10, gradedSubmissions.length);
  
  if (prevStart >= prevEnd) {
    // Not enough data for comparison
    return { direction: 'flat', lastFiveAvg, prevFiveAvg: null };
  }
  
  const prevFive = gradedSubmissions.slice(prevStart, prevEnd);
  const prevFiveAvg = Math.round(
    prevFive.reduce((acc, s) => acc + s.score_total, 0) / prevFive.length
  );
  
  // Determine direction (using 3% threshold to avoid noise)
  const diff = lastFiveAvg - prevFiveAvg;
  let direction = 'flat';
  if (diff > 3) direction = 'up';
  else if (diff < -3) direction = 'down';
  
  return { direction, lastFiveAvg, prevFiveAvg };
}

/**
 * Get sparkline data points (last 5 graded scores)
 * @param {Array} submissions - All graded submissions (sorted by date desc)
 * @returns {Array} Array of scores (max 5)
 */
export function getSparklineData(submissions) {
  const gradedSubmissions = submissions
    .filter(s => s.score_total != null)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  
  return gradedSubmissions
    .slice(0, 5)
    .reverse() // Oldest to newest for sparkline
    .map(s => s.score_total);
}

/**
 * Truncate text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (default 140)
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 140) {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format date/time for display
 * @param {Date|string} date - Date to format
 * @param {string} format - Format type ('full', 'date', 'time')
 * @returns {string} Formatted date
 */
export function formatDateTime(date, format = 'full') {
  if (!date) return '—';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const options = {
    full: { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    },
    date: { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    },
    time: { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    }
  };
  
  return d.toLocaleString('en-US', options[format] || options.full);
}

/**
 * Count missing assignments from grouped data
 * @param {Object} groups - Grouped assignments
 * @returns {number} Count of missing assignments
 */
export function countMissingAssignments(groups) {
  return groups[AssignmentStatus.MISSING]?.length || 0;
}

/**
 * Count late assignments from grouped data
 * @param {Object} groups - Grouped assignments
 * @returns {number} Count of late assignments
 */
export function countLateAssignments(groups) {
  return groups[AssignmentStatus.LATE]?.length || 0;
}
