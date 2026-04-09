// supabase-settings.js - Helper module for resilient Supabase configuration management
// Handles unified keys, legacy migration, and connectivity testing

const UNIFIED_PREFIX = 'rc_unified_';
const LEGACY_PREFIX = 'rc_';

// Key names
const KEYS = {
  unified: {
    url: UNIFIED_PREFIX + 'supabase_url',
    anon: UNIFIED_PREFIX + 'supabase_anon',
    enabled: UNIFIED_PREFIX + 'use_supabase',
    optOut: UNIFIED_PREFIX + 'supabase_opt_out',
    autoEnabled: UNIFIED_PREFIX + 'supabase_auto_enabled'
  },
  legacy: {
    url: LEGACY_PREFIX + 'supabase_url',
    anon: LEGACY_PREFIX + 'supabase_key',
    anon_alt: LEGACY_PREFIX + 'supabase_anon',
    enabled: LEGACY_PREFIX + 'use_supabase',
    remote: LEGACY_PREFIX + 'use_remote'
  }
};

/**
 * Read configuration from localStorage
 * Returns unified keys with fallback to legacy keys
 */
export function readConfig() {
  // Try unified keys first
  let url = localStorage.getItem(KEYS.unified.url);
  let anon = localStorage.getItem(KEYS.unified.anon);
  let enabled = localStorage.getItem(KEYS.unified.enabled) === 'true';
  let optOut = localStorage.getItem(KEYS.unified.optOut) === 'true';
  let autoEnabled = localStorage.getItem(KEYS.unified.autoEnabled) === 'true';
  
  // Fallback to legacy keys if unified keys are missing
  if (!url) {
    url = localStorage.getItem(KEYS.legacy.url) || '';
  }
  
  if (!anon) {
    anon = localStorage.getItem(KEYS.legacy.anon) || 
           localStorage.getItem(KEYS.legacy.anon_alt) || '';
  }
  
  if (!enabled) {
    // Check both legacy flags
    enabled = localStorage.getItem(KEYS.legacy.enabled) === 'true' ||
              localStorage.getItem(KEYS.legacy.remote) === 'true';
  }
  
  return { url, anon, enabled, optOut, autoEnabled };
}

/**
 * Write configuration to localStorage
 * @param {Object} config - { url?, anon?, enabled?, optOut?, autoEnabled? }
 * @param {Object} options - { preserveAnonIfMasked: boolean }
 */
export function writeConfig(config = {}, options = {}) {
  const { preserveAnonIfMasked = true } = options;
  
  // Update URL if provided
  if (config.url !== undefined) {
    localStorage.setItem(KEYS.unified.url, config.url);
  }
  
  // Update anon key with preservation logic
  if (config.anon !== undefined) {
    const anonValue = config.anon.trim();
    const isMasked = !anonValue || /^[•*]+$/.test(anonValue) || anonValue === '••••••••';
    
    // Only update if not masked or if preservation is disabled
    if (!preserveAnonIfMasked || !isMasked) {
      localStorage.setItem(KEYS.unified.anon, anonValue);
    }
    // Otherwise keep the existing stored key
  }
  
  // Update enabled flag if provided
  if (config.enabled !== undefined) {
    localStorage.setItem(KEYS.unified.enabled, config.enabled.toString());
  }
  
  // Update opt-out flag if provided
  if (config.optOut !== undefined) {
    localStorage.setItem(KEYS.unified.optOut, config.optOut.toString());
  }
  
  // Update auto-enabled flag if provided
  if (config.autoEnabled !== undefined) {
    localStorage.setItem(KEYS.unified.autoEnabled, config.autoEnabled.toString());
  }
  
  return readConfig();
}

/**
 * Migrate legacy keys to unified keys if unified keys don't exist
 */
export function migrateLegacyKeys() {
  let migrated = false;
  
  // Check if we need migration (unified keys are empty but legacy exist)
  const hasUnified = localStorage.getItem(KEYS.unified.url) || 
                     localStorage.getItem(KEYS.unified.anon);
  
  if (hasUnified) {
    return { migrated: false, message: 'Unified keys already exist' };
  }
  
  // Migrate URL
  const legacyUrl = localStorage.getItem(KEYS.legacy.url);
  if (legacyUrl) {
    localStorage.setItem(KEYS.unified.url, legacyUrl);
    migrated = true;
  }
  
  // Migrate anon key (check both possible legacy keys)
  const legacyAnon = localStorage.getItem(KEYS.legacy.anon) || 
                     localStorage.getItem(KEYS.legacy.anon_alt);
  if (legacyAnon) {
    localStorage.setItem(KEYS.unified.anon, legacyAnon);
    migrated = true;
  }
  
  // Migrate enabled flag (check both possible legacy flags)
  const legacyEnabled = localStorage.getItem(KEYS.legacy.enabled) === 'true' ||
                        localStorage.getItem(KEYS.legacy.remote) === 'true';
  if (legacyEnabled) {
    localStorage.setItem(KEYS.unified.enabled, 'true');
    migrated = true;
  }
  
  if (migrated) {
    console.log('[supabase-settings] Migrated legacy keys to unified keys');
  }
  
  return { migrated, message: migrated ? 'Legacy keys migrated' : 'No legacy keys found' };
}

/**
 * Auto-enable Supabase if credentials exist and user hasn't opted out
 * This is called on page load to enable Supabase automatically when:
 * - URL and Anon key are present
 * - User hasn't manually disabled (opted out)
 * - Not already enabled
 * 
 * @returns {Object} Result object with changed flag and optional reason
 * @returns {boolean} result.changed - Whether auto-enable was performed
 * @returns {string} [result.reason] - Explanation of the result
 */
export function autoEnableIfEligible() {
  const config = readConfig();
  
  // Already enabled - no change needed
  if (config.enabled) {
    return { changed: false, reason: 'Already enabled' };
  }
  
  // User has opted out - respect their choice
  if (config.optOut) {
    return { changed: false, reason: 'User opted out' };
  }
  
  // Check if credentials are present and valid
  const hasUrl = config.url && config.url.trim().length > 0;
  const hasAnon = config.anon && config.anon.trim().length > 0;
  
  if (!hasUrl || !hasAnon) {
    return { changed: false, reason: 'Missing credentials' };
  }
  
  // All conditions met - auto-enable using writeConfig for consistency
  writeConfig({ enabled: true, autoEnabled: true });
  
  return { 
    changed: true, 
    reason: 'Auto-enabled: credentials present and no opt-out'
  };
}

/**
 * Test connectivity to Supabase
 * @param {Object} cfg - { url, anon, enabled }
 * @returns {Promise<Object>} { status: 'ok'|'unauthorized'|'network'|'not-configured', httpStatus?, message?, timestamp }
 */
export async function testConnectivity(cfg) {
  const timestamp = new Date().toISOString();
  
  // Check if configuration is complete
  if (!cfg || !cfg.url || !cfg.anon || !cfg.enabled) {
    const missing = [];
    if (!cfg || !cfg.url) missing.push('URL');
    if (!cfg || !cfg.anon) missing.push('Anon Key');
    if (!cfg || !cfg.enabled) missing.push('Enabled flag');
    
    return {
      status: 'not-configured',
      message: `Missing configuration: ${missing.join(', ')}`,
      timestamp,
      missing
    };
  }
  
  // Attempt lightweight fetch to Supabase Auth settings endpoint
  const url = cfg.url.replace(/\/$/, ''); // Remove trailing slash
  const endpoint = `${url}/auth/v1/settings`;
  
  try {
    // Create AbortController for timeout (better browser compatibility)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': cfg.anon,
        'Authorization': `Bearer ${cfg.anon}`
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return {
        status: 'ok',
        httpStatus: response.status,
        message: 'Connection successful',
        timestamp
      };
    } else if (response.status === 401 || response.status === 403) {
      return {
        status: 'unauthorized',
        httpStatus: response.status,
        message: 'Invalid or expired API key',
        timestamp
      };
    } else {
      return {
        status: 'error',
        httpStatus: response.status,
        message: `HTTP ${response.status}: ${response.statusText}`,
        timestamp
      };
    }
  } catch (err) {
    // Network errors, CORS issues, timeouts
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return {
        status: 'network',
        message: 'Connection timeout - possible network firewall',
        timestamp,
        error: err.message
      };
    } else if (err.message.includes('CORS') || err.message.includes('NetworkError')) {
      return {
        status: 'network',
        message: 'Network blocked - possible district firewall or CORS issue',
        timestamp,
        error: err.message
      };
    } else {
      return {
        status: 'network',
        message: `Network error: ${err.message}`,
        timestamp,
        error: err.message
      };
    }
  }
}

/**
 * Reset all Supabase configuration
 * Clears only Supabase-related keys from localStorage
 */
export function resetConfig() {
  // Remove unified keys
  localStorage.removeItem(KEYS.unified.url);
  localStorage.removeItem(KEYS.unified.anon);
  localStorage.removeItem(KEYS.unified.enabled);
  localStorage.removeItem(KEYS.unified.optOut);
  localStorage.removeItem(KEYS.unified.autoEnabled);
  
  // Also remove legacy keys for clean slate
  localStorage.removeItem(KEYS.legacy.url);
  localStorage.removeItem(KEYS.legacy.anon);
  localStorage.removeItem(KEYS.legacy.anon_alt);
  localStorage.removeItem(KEYS.legacy.enabled);
  localStorage.removeItem(KEYS.legacy.remote);
  
  return { success: true, message: 'Configuration reset' };
}

/**
 * Get diagnostics info (for debugging)
 * Returns masked key info for security
 */
export function getDiagnostics() {
  const config = readConfig();
  
  return {
    url: config.url ? `${config.url.substring(0, 30)}...` : '(empty)',
    urlLength: config.url?.length || 0,
    anon: config.anon ? `${config.anon.substring(0, 4)}... (${config.anon.length} chars)` : '(empty)',
    anonLength: config.anon?.length || 0,
    enabled: config.enabled,
    optOut: config.optOut,
    autoEnabled: config.autoEnabled,
    hasUnifiedUrl: !!localStorage.getItem(KEYS.unified.url),
    hasUnifiedAnon: !!localStorage.getItem(KEYS.unified.anon),
    hasLegacyUrl: !!localStorage.getItem(KEYS.legacy.url),
    hasLegacyAnon: !!(localStorage.getItem(KEYS.legacy.anon) || localStorage.getItem(KEYS.legacy.anon_alt))
  };
}
