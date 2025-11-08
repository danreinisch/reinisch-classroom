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
