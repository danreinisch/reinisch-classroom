/**
 * Debug Logger Utility
 * Centralized debug logging with toggle support
 * 
 * Usage:
 * - Enable debug mode: localStorage.rc_debug="1" OR add ?debug=1 to URL
 * - In code: debugLog('[module]', 'message', data)
 * - Always use console.error() for real errors
 */

(function() {
  'use strict';

  // Check if debug mode is enabled
  function isDebugEnabled() {
    // Check URL parameter first
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1') {
        return true;
      }
    } catch (e) {
      // Ignore URL parsing errors
    }

    // Check localStorage
    try {
      return localStorage.getItem('rc_debug') === '1';
    } catch (e) {
      // localStorage may not be available
      return false;
    }
  }

  // Cache the debug state
  const DEBUG_ENABLED = isDebugEnabled();

  /**
   * Debug log - only outputs when debug mode is enabled
   * @param {...any} args - Arguments to log
   */
  function debugLog(...args) {
    if (DEBUG_ENABLED) {
      console.log(...args);
    }
  }

  /**
   * Debug warn - only outputs when debug mode is enabled
   * @param {...any} args - Arguments to warn
   */
  function debugWarn(...args) {
    if (DEBUG_ENABLED) {
      console.warn(...args);
    }
  }

  /**
   * Info log - always outputs but in a less noisy way
   * Use for important state changes that should always be visible
   * @param {...any} args - Arguments to log
   */
  function infoLog(...args) {
    console.info(...args);
  }

  /**
   * Always log errors - never suppress
   * @param {...any} args - Arguments to error
   */
  function errorLog(...args) {
    console.error(...args);
  }

  // Export to global scope
  window.DebugLogger = {
    isEnabled: DEBUG_ENABLED,
    log: debugLog,
    warn: debugWarn,
    info: infoLog,
    error: errorLog,
  };

  // Show debug mode status on first load
  if (DEBUG_ENABLED) {
    console.log('%c[DebugLogger] Debug mode ENABLED', 'color: #22c55e; font-weight: bold');
    console.log('[DebugLogger] To disable: localStorage.removeItem("rc_debug") or remove ?debug=1 from URL');
  }
})();
