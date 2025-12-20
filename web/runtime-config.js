// Runtime configuration for Reinisch Classroom
// Controls feature behavior that can be toggled without code changes

/**
 * Configuration flags
 */
export const RuntimeConfig = {
  /**
   * Disable Supabase Realtime websocket subscriptions
   * When true, prevents creation of realtime channels to avoid CSP violations and connection errors
   * When false, enables realtime subscriptions for live data updates
   * 
   * To re-enable realtime:
   * 1. Set this flag to false
   * 2. Ensure CSP policy allows wss://*.supabase.co in connect-src
   * 3. Refresh the application
   * 
   * @type {boolean}
   * @default true
   */
  DISABLE_REALTIME: true
};

/**
 * Check if realtime is disabled
 * @returns {boolean} True if realtime should be disabled
 */
export function isRealtimeDisabled() {
  return RuntimeConfig.DISABLE_REALTIME;
}

/**
 * Get runtime configuration value
 * @param {string} key - Configuration key
 * @returns {*} Configuration value
 */
export function getRuntimeConfig(key) {
  return RuntimeConfig[key];
}
