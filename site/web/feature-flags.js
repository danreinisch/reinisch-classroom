// Feature flags for IEP Progress System (Phases 4-5)
// Allows dark-launching and toggling functionality per role

const FEATURE_PREFIX = 'rc_feature_';

/**
 * Feature flag definitions
 */
const FEATURES = {
  // Phase 4-5: Manual progress editing (inline & bulk add)
  progressEditing: {
    key: FEATURE_PREFIX + 'progress_editing',
    default: false,
    description: 'Enable inline editing and bulk add for goal progress'
  },
  
  // Phase 4-5: Automated progress from assignments
  progressAutoFromAssignments: {
    key: FEATURE_PREFIX + 'progress_auto_assignments',
    default: false,
    description: 'Enable assignment-to-goal mapping and automated progress tracking'
  },
  
  // Phase 6-8: Saved Views
  progressSavedViews: {
    key: FEATURE_PREFIX + 'progress_saved_views',
    default: false,
    description: 'Enable saved filter/sort/group configurations as named views'
  },
  
  // Phase 6-8: Advanced Filters
  progressAdvancedFilters: {
    key: FEATURE_PREFIX + 'progress_advanced_filters',
    default: false,
    description: 'Enable value-range, source, case-manager, and recency filters'
  },
  
  // Phase 6-8: Risk Indicators
  progressRiskIndicators: {
    key: FEATURE_PREFIX + 'progress_risk_indicators',
    default: false,
    description: 'Enable risk columns, recency tracking, and delta vs target'
  },
  
  // Phase 6-8: Rollups (Weekly/Monthly)
  progressRollups: {
    key: FEATURE_PREFIX + 'progress_rollups',
    default: false,
    description: 'Enable weekly and monthly aggregation of progress data'
  },
  
  // Phase 6-8: PDF Export
  progressPdfExport: {
    key: FEATURE_PREFIX + 'progress_pdf_export',
    default: false,
    description: 'Enable PDF export of current grid view'
  },
  
  // Portal B: Assignment Status Groupings and Filters
  portalAssignmentsStatus: {
    key: FEATURE_PREFIX + 'portal_assignments_status',
    default: true,
    description: 'Enable assignment status groupings (upcoming/late/missing/in-progress/submitted/graded) and filters'
  },
  
  // Portal B: Grades Card
  portalGradesCard: {
    key: FEATURE_PREFIX + 'portal_grades_card',
    default: true,
    description: 'Enable grades panel with overall and per-class averages and trend indicators'
  },
  
  // Portal B: One-time Resubmission
  portalResubmission: {
    key: FEATURE_PREFIX + 'portal_resubmission',
    default: true,
    description: 'Enable one-time resubmission workflow for all assignments'
  },
  
  // Portal B: Top Status Bar
  portalTopBar: {
    key: FEATURE_PREFIX + 'portal_top_bar',
    default: true,
    description: 'Enable top status bar with live date/time, student info, and Tool Kit link'
  },
  
  // Portal B: Quarterly Averages
  portalQuarterAverages: {
    key: FEATURE_PREFIX + 'portal_quarter_averages',
    default: true,
    description: 'Enable quarterly grade averages (Q1-Q4) in Grades card'
  },
  
  // Portal B: Quarterly Export
  portalQuarterlyExport: {
    key: FEATURE_PREFIX + 'portal_quarterly_export',
    default: true,
    description: 'Enable CSV/PDF export with quarterly summary data'
  },
  
  // Portal C: Saved Views
  portalSavedViews: {
    key: FEATURE_PREFIX + 'portal_saved_views',
    default: true,
    description: 'Enable saved filter/sort configurations for Assignments dashboard'
  },
  
  // Portal C: Advanced Filters
  portalAdvancedFilters: {
    key: FEATURE_PREFIX + 'portal_advanced_filters',
    default: true,
    description: 'Enable advanced filters (score range, recency, source/type, overdue streak)'
  },
  
  // Portal C: Risk Indicators
  portalRiskIndicators: {
    key: FEATURE_PREFIX + 'portal_risk_indicators',
    default: true,
    description: 'Enable risk badges and insights (missing, late, low score, trends)'
  },
  
  // Portal C: Rollups (Weekly/Monthly)
  portalRollups: {
    key: FEATURE_PREFIX + 'portal_rollups',
    default: true,
    description: 'Enable weekly and monthly aggregation of grades and metrics'
  },
  
  // Portal C: PDF Export
  portalPdfExport: {
    key: FEATURE_PREFIX + 'portal_pdf_export',
    default: true,
    description: 'Enable PDF export of assignments and grades views'
  },
  
  // Assignment Mapping Phase 1
  assignmentMappingV1: {
    key: FEATURE_PREFIX + 'assignment_mapping_v1',
    default: false,
    description: 'Enable per-question mapping to DESE Standards and IEP Goal Codes with immediate scoring'
  },
  
  // Student Manager
  studentManager: {
    key: FEATURE_PREFIX + 'student_manager',
    default: true,
    description: 'Enable Student Manager in Teacher Center Data section for manual student creation with enrollments and IEP goals'
  },
  
  // Student Manager: Code-Only Identity
  studentCodeOnly: {
    key: FEATURE_PREFIX + 'student_code_only',
    default: true,
    description: 'Restrict student identity to code-only (no PII fields collected, stored, or displayed in Student Manager)'
  },
  
  // Student Manager: Multi-Goal Wizard
  studentMultiGoalWizard: {
    key: FEATURE_PREFIX + 'student_multi_goal_wizard',
    default: false,
    description: 'Enable multi-goal entry wizard for adding multiple IEP goals in one operation'
  }
};

/**
 * Get a feature flag value
 * @param {string} featureName - Name of the feature (e.g., 'progressEditing')
 * @returns {boolean} Feature flag value
 */
export function getFeatureFlag(featureName) {
  const feature = FEATURES[featureName];
  if (!feature) {
    console.warn(`[feature-flags] Unknown feature: ${featureName}`);
    return false;
  }
  
  const stored = localStorage.getItem(feature.key);
  if (stored === null) {
    return feature.default;
  }
  
  return stored === 'true';
}

/**
 * Set a feature flag value
 * @param {string} featureName - Name of the feature
 * @param {boolean} enabled - Whether to enable the feature
 */
export function setFeatureFlag(featureName, enabled) {
  const feature = FEATURES[featureName];
  if (!feature) {
    console.warn(`[feature-flags] Unknown feature: ${featureName}`);
    return;
  }
  
  localStorage.setItem(feature.key, String(enabled));
  console.log(`[feature-flags] ${featureName} = ${enabled}`);
}

/**
 * Get all feature flags
 * @returns {Object} Object with feature names as keys and boolean values
 */
export function getAllFeatureFlags() {
  const flags = {};
  for (const [name, feature] of Object.entries(FEATURES)) {
    flags[name] = getFeatureFlag(name);
  }
  return flags;
}

/**
 * Reset all feature flags to defaults
 */
export function resetFeatureFlags() {
  for (const [name, feature] of Object.entries(FEATURES)) {
    localStorage.removeItem(feature.key);
  }
  console.log('[feature-flags] All flags reset to defaults');
}

/**
 * Get feature flag metadata
 * @returns {Object} Feature definitions with descriptions
 */
export function getFeatureDefinitions() {
  return Object.entries(FEATURES).map(([name, feature]) => ({
    name,
    enabled: getFeatureFlag(name),
    default: feature.default,
    description: feature.description
  }));
}
