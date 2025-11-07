// diagnostics.js
// Diagnostic utilities for auth and system state

import { readAuth } from './auth-handoff.js';

/**
 * Diagnose authentication state
 * Returns comprehensive auth state for debugging
 * @returns {Object} Diagnostic information
 */
export function diagnoseAuth() {
  const result = {
    timestamp: new Date().toISOString(),
    autoLoginOk: window.__autoLoginOk || false,
    sessionStorage: {
      role: sessionStorage.getItem('rc_user_role'),
      code: sessionStorage.getItem('rc_user_code')
    },
    localStorage: {
      rc_auth: null,
      rc_auth_raw: localStorage.getItem('rc_auth')
    },
    url: {
      href: window.location.href,
      search: window.location.search,
      params: {}
    },
    guards: {
      authModalExtendBound: window.__authModalExtendBound || false,
      hubEnhancementsBound: window.__hubEnhancementsBound || false
    }
  };
  
  // Parse URL params
  const urlParams = new URLSearchParams(window.location.search);
  for (const [key, value] of urlParams.entries()) {
    result.url.params[key] = value;
  }
  
  // Parse rc_auth if present
  try {
    const auth = readAuth();
    if (auth) {
      result.localStorage.rc_auth = {
        role: auth.role,
        code: auth.code,
        name: auth.name,
        issuedAt: new Date(auth.issuedAt).toISOString(),
        expiresAt: new Date(auth.expiresAt).toISOString(),
        isExpired: Date.now() > auth.expiresAt,
        timeRemaining: Math.max(0, auth.expiresAt - Date.now())
      };
    }
  } catch (err) {
    result.localStorage.rc_auth_error = err.message;
  }
  
  return result;
}

/**
 * Attach diagnoseAuth to window for console access
 */
if (typeof window !== 'undefined') {
  window.__diagnoseAuth = diagnoseAuth;
  console.log('[diagnostics] window.__diagnoseAuth() available');
}

/**
 * Log system information
 */
export function logSystemInfo() {
  console.group('[diagnostics] System Information');
  console.log('User Agent:', navigator.userAgent);
  console.log('Online:', navigator.onLine);
  console.log('Document State:', document.readyState);
  console.log('Window Size:', window.innerWidth + 'x' + window.innerHeight);
  console.log('Local Storage Available:', typeof localStorage !== 'undefined');
  console.log('Session Storage Available:', typeof sessionStorage !== 'undefined');
  console.log('BroadcastChannel Available:', typeof BroadcastChannel !== 'undefined');
  console.groupEnd();
}

// Auto-log on load if in debug mode
if (localStorage.getItem('rc_debug') === 'true') {
  logSystemInfo();
}
