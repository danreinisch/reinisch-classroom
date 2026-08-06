// Reactive Supabase client - rebuilds when settings change
// Listens for rc:remote-config-changed and storage events to re-initialize

import { isRealtimeDisabled } from './runtime-config.js';

let createClient = null;
let supabaseLoadError = null;
let cachedClient = null;
let lastConfig = null;
let localRuntimeConfig = null;

const LOCAL_RUNTIME_CONFIG_ENDPOINT =
  '/.netlify/functions/browser-supabase-config';

function isLocalBrowserHost() {
  return (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '::1'
  );
}

async function loadLocalRuntimeConfig() {
  if (!isLocalBrowserHost()) return;

  localRuntimeConfig = {
    url: null,
    key: null,
  };

  try {
    const response = await fetch(
      LOCAL_RUNTIME_CONFIG_ENDPOINT,
      {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const url =
      typeof payload.url === 'string'
        ? payload.url.trim()
        : '';
    const key =
      typeof payload.anonKey === 'string'
        ? payload.anonKey.trim()
        : '';

    if (!url || !key) {
      throw new Error('incomplete local runtime configuration');
    }

    localRuntimeConfig = {
      url,
      key,
    };

    console.log(
      '[supabase-client] Using local runtime Supabase configuration'
    );
  } catch (err) {
    console.warn(
      '[supabase-client] Local runtime Supabase configuration unavailable; browser remote access disabled.',
      err.message
    );
  }
}

// Load @supabase/supabase-js@2 from vendored file (CSP-compliant, no external CDNs)
// The vendored file at /vendor/supabase-js@2.mjs provides deterministic loading
// and avoids CSP violations from external CDN attempts.
const VENDORED_URL = '/vendor/supabase-js@2.mjs';

async function loadSupabaseClient() {
  try {
    const module = await import(VENDORED_URL);
    createClient = module.createClient;
    console.log('[supabase-client] Loaded from vendored fallback');
  } catch (err) {
    supabaseLoadError = `Failed to load vendored Supabase library: ${err.message}`;
    console.warn('Supabase library unavailable; app will use localStorage backend.', supabaseLoadError);
  }
}

// Attempt to load the Supabase client and localhost runtime configuration.
await loadSupabaseClient();
await loadLocalRuntimeConfig();

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
  // Localhost must use the explicit Netlify Dev runtime configuration.
  // Never fall through to the production window globals when this request is
  // running against the isolated local E2E application.
  if (isLocalBrowserHost()) {
    const url = localRuntimeConfig?.url || null;
    const key = localRuntimeConfig?.key || null;

    return {
      url,
      key,
      useRemote: Boolean(url && key),
      optOut: false,
    };
  }

  const storedUrl = getStoredValue('supabase_url', ['supabase_url']);
  const storedKey = getStoredValue('supabase_anon', ['supabase_key', 'supabase_anon']);
  const useRemote = getStoredValue('use_supabase', ['use_remote', 'use_supabase']) === 'true';
  const optOut = getStoredValue('supabase_opt_out', ['supabase_opt_out']) === 'true';

  const url = window.SUPABASE_URL || storedUrl;
  const key = window.SUPABASE_ANON_KEY || storedKey;
  
  // Auto-enable remote when window globals are present (unless explicitly opted out)
  const autoEnableRemote = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
  
  return { url, key, useRemote: useRemote || autoEnableRemote, optOut };
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
    const client = createClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: {
        params: {
          eventsPerSecond: 2 // Throttle to reduce server load
        }
      }
    });
    
    // Setup connection monitoring
    setupConnectionMonitoring(client);
    
    return client;
  } catch (err) {
    console.warn('Failed to create Supabase client:', err.message);
    return null;
  }
}

/**
 * Get or build the Supabase client based on current localStorage settings
 * Uses singleton pattern to prevent multiple instances
 * @returns {Promise<Object|null>} Supabase client or null if not configured
 */
export async function getSupabase() {
  // Always return existing singleton from window if available.
  // window.__sbClient is cleared by resetSupabaseClient() when config changes,
  // so returning it unconditionally is safe and prevents duplicate GoTrueClient instances.
  if (window.__sbClient) {
    return window.__sbClient;
  }
  
  const config = readCurrentConfig();
  
  // Check if we need to rebuild
  if (configChanged(config)) {
    cachedClient = buildClient(config);
    lastConfig = config;
    
    // Store in window for singleton access
    window.__sbClient = cachedClient;
    
    if (!cachedClient) {
      if (supabaseLoadError) {
        // Only log on first call when user is trying to use remote
        if (config.useRemote) {
          // Only log anon key length if needed, never the full key
          const keyInfo = config.key ? `${config.key.length} chars` : 'missing';
          console.warn(`Supabase library not available (anon key: ${keyInfo}):`, supabaseLoadError);
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
 * Live binding to the current Supabase client (synchronous access)
 * For new code, prefer getSupabase() which is async and guaranteed to be current
 */
export const supabase = cachedClient;

/**
 * Reset the cached client to force rebuild on next getSupabase() call
 */
export function resetSupabaseClient() {
  cachedClient = null;
  lastConfig = null;
  window.__sbClient = null;
}

/**
 * Get the current Supabase URL and anon key from configuration.
 * Returns null values when Supabase is not configured.
 * @returns {{ url: string|null, key: string|null }}
 */
export function getSupabaseConfig() {
  const config = readCurrentConfig();
  return { url: config.url || null, key: config.key || null };
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

// ============================================================================
// CONNECTION MONITORING & AUTO-RECONNECT
// ============================================================================

let reconnectAttempt = 0;
let realtimeDisabledLogged = false; // Track if we've logged the realtime disabled message
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
function getReconnectDelay(attempt) {
  const exponentialDelay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
  // Add jitter: ±20% random variance
  const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Setup connection monitoring for Supabase client
 * @param {Object} client - Supabase client instance
 */
function setupConnectionMonitoring(client) {
  if (!client) return;
  
  console.log('[supabase-client] Setting up connection monitoring');
  
  // Network status listeners
  window.addEventListener('online', () => {
    console.log('[supabase-client] Network online, attempting reconnect');
    reconnectAttempt = 0; // Reset counter on network restore
    attemptReconnect(client);
  });
  
  window.addEventListener('offline', () => {
    console.log('[supabase-client] Network offline');
  });
  
  // Visibility change listener - reconnect when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) {
      console.log('[supabase-client] Tab visible and online, checking connection');
      attemptReconnect(client);
    }
  });
  
  // Optional: Monitor Realtime connection status if available and not disabled
  // Skip realtime channel creation when DISABLE_REALTIME is true to avoid websocket/CSP errors
  if (!isRealtimeDisabled() && client.channel && typeof client.channel === 'function') {
    try {
      const channel = client.channel('system-heartbeat');
      
      channel
        .on('system', { event: '*' }, (payload) => {
          // Only reset on explicit connection success indicators
          if (payload && (payload.type === 'connected' || payload.status === 'ok')) {
            reconnectAttempt = 0;
          }
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[supabase-client] Realtime channel error:', status);
            attemptReconnect(client);
          } else if (status === 'SUBSCRIBED') {
            console.log('[supabase-client] Realtime channel connected');
            reconnectAttempt = 0;
          }
        });
    } catch (err) {
      console.warn('[supabase-client] Could not setup realtime monitoring:', err);
    }
  } else if (isRealtimeDisabled() && !realtimeDisabledLogged) {
    console.info('[supabase-client] Realtime disabled - skipping channel subscription');
    realtimeDisabledLogged = true;
  }
}

/**
 * Attempt to reconnect Supabase client
 * @param {Object} client - Supabase client instance
 */
async function attemptReconnect(client) {
  if (!client || reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[supabase-client] Max reconnect attempts reached');
    }
    return;
  }
  
  const delay = getReconnectDelay(reconnectAttempt);
  reconnectAttempt++;
  
  console.log(`[supabase-client] Reconnect attempt ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
  
  setTimeout(async () => {
    try {
      // Test connection
      const result = await testConnection();
      
      if (result.ok) {
        console.log('[supabase-client] Reconnection successful');
        reconnectAttempt = 0;
        
        // Dispatch custom event for app to handle
        window.dispatchEvent(new CustomEvent('supabase:reconnected'));
      } else {
        console.warn('[supabase-client] Reconnection failed:', result.error);
        // Retry
        if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
          attemptReconnect(client);
        }
      }
    } catch (err) {
      console.error('[supabase-client] Reconnect error:', err);
      if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        attemptReconnect(client);
      }
    }
  }, delay);
}

// Listen for config changes from settings UI
window.addEventListener('rc:remote-config-changed', (e) => {
  console.log('[supabase-client] Config changed, resetting client');
  resetSupabaseClient();
});

// Listen for storage events from other tabs
window.addEventListener('storage', (e) => {
  // Check for any Supabase-related unified keys (url, anon, use_supabase, opt_out)
  if (e.key && (
    e.key.startsWith(UNIFIED_PREFIX + 'supabase') || 
    e.key === UNIFIED_PREFIX + 'use_supabase' ||
    e.key === UNIFIED_PREFIX + 'supabase_opt_out'
  )) {
    console.log('[supabase-client] Storage changed in another tab, resetting client');
    resetSupabaseClient();
  }
});