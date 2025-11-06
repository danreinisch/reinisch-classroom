// Reactive Supabase client - rebuilds when settings change
// Listens for rc:remote-config-changed and storage events to re-initialize

let createClient = null;
let supabaseLoadError = null;
let cachedClient = null;
let lastConfig = null;

// Try to import Supabase, but don't fail if CDN is blocked
try {
  const module = await import('https://esm.sh/@supabase/supabase-js@2');
  createClient = module.createClient;
} catch (err) {
  console.warn('Supabase CDN blocked or unavailable; app will use localStorage backend.', err.message);
  supabaseLoadError = err.message;
}

// Read config from localStorage using unified keys with legacy fallback
const UNIFIED_PREFIX = 'rc_unified_';
const LEGACY_PREFIX = 'rc_';

function getStoredValue(unifiedKey, legacyKeys = []) {
  // Try unified key first
  let value = localStorage.getItem(UNIFIED_PREFIX + unifiedKey);
  if (value) return value;
  
  // Try legacy keys as fallback
  for (const legacyKey of legacyKeys) {
    value = localStorage.getItem(LEGACY_PREFIX + legacyKey);
    if (value) return value;
  }
  
  return null;
}

function readCurrentConfig() {
  const storedUrl = getStoredValue('supabase_url', ['supabase_url']);
  const storedKey = getStoredValue('supabase_anon', ['supabase_key', 'supabase_anon']);
  const useRemote = getStoredValue('use_supabase', ['use_remote', 'use_supabase']) === 'true';
  const optOut = getStoredValue('supabase_opt_out', ['supabase_opt_out']) === 'true';

  const url = window.SUPABASE_URL || storedUrl;
  const key = window.SUPABASE_ANON_KEY || storedKey;
  
  return { url, key, useRemote, optOut };
}

function configChanged(newConfig) {
  if (!lastConfig) return true;
  return lastConfig.url !== newConfig.url ||
         lastConfig.key !== newConfig.key ||
         lastConfig.useRemote !== newConfig.useRemote ||
         lastConfig.optOut !== newConfig.optOut;
}

function buildClient(config) {
  // Reset if configuration changed or opt-out is set
  if (config.optOut || !config.useRemote || !config.url || !config.key || !createClient) {
    return null;
  }
  
  try {
    return createClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  } catch (err) {
    console.warn('Failed to create Supabase client:', err.message);
    return null;
  }
}

/**
 * Get or build the Supabase client based on current localStorage settings
 * @returns {Promise<Object|null>} Supabase client or null if not configured
 */
export async function getSupabase() {
  const config = readCurrentConfig();
  
  // Check if we need to rebuild
  if (configChanged(config)) {
    cachedClient = buildClient(config);
    lastConfig = config;
    
    if (!cachedClient) {
      if (supabaseLoadError) {
        // Only log on first call when user is trying to use remote
        if (config.useRemote) {
          console.warn('Supabase library not available:', supabaseLoadError);
        }
      } else if (config.optOut) {
        // Don't spam console when user explicitly opted out
      } else if (!config.useRemote) {
        // Don't spam console when feature is disabled
      } else {
        console.warn('Supabase env not detected; app will use localStorage backend.');
      }
    }
  }
  
  return cachedClient;
}

/**
 * Reset the cached client to force rebuild on next getSupabase() call
 */
export function resetSupabaseClient() {
  cachedClient = null;
  lastConfig = null;
}

/**
 * Test connection to Supabase using auth/v1/settings endpoint
 * @returns {Promise<Object>} { ok: boolean, error?: string }
 */
export async function testConnection() {
  const config = readCurrentConfig();
  
  if (!config.url || !config.key) {
    return { ok: false, error: 'not-configured' };
  }
  
  const url = config.url.replace(/\/$/, '');
  const endpoint = `${url}/auth/v1/settings`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return { ok: true };
    } else {
      return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
  } catch (err) {
    return { ok: false, error: err.message || 'connection-failed' };
  }
}

// Listen for config changes from settings UI
window.addEventListener('rc:remote-config-changed', (e) => {
  console.log('[supabase-client] Config changed, resetting client');
  resetSupabaseClient();
});

// Listen for storage events from other tabs
window.addEventListener('storage', (e) => {
  // Check for any Supabase-related unified keys
  if (e.key && (e.key.startsWith(UNIFIED_PREFIX + 'supabase') || e.key === UNIFIED_PREFIX + 'use_supabase')) {
    console.log('[supabase-client] Storage changed in another tab, resetting client');
    resetSupabaseClient();
  }
});