// diagnostics.js
// Diagnostic utilities for debugging authentication and session state

/**
 * Diagnose current authentication state
 * Returns comprehensive auth diagnostics for debugging
 * @returns {Object} Diagnostic information
 */
function diagnoseAuth() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    autoLoginOk: window.__autoLoginOk || false,
    sessionStorage: {
      role: sessionStorage.getItem('rc_user_role'),
      code: sessionStorage.getItem('rc_user_code')
    },
    localStorage: {},
    urlParams: {},
    browserInfo: {
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      cookiesEnabled: navigator.cookieEnabled
    }
  };

  // Read rc_auth from localStorage
  try {
    const authStr = localStorage.getItem('rc_auth');
    if (authStr) {
      const auth = JSON.parse(authStr);
      diagnostics.localStorage.rc_auth = {
        role: auth.role,
        code: auth.code,
        name: auth.name,
        issuedAt: auth.issuedAt ? new Date(auth.issuedAt).toISOString() : null,
        expiresAt: auth.expiresAt ? new Date(auth.expiresAt).toISOString() : null,
        isExpired: auth.expiresAt ? Date.now() > auth.expiresAt : null,
        timeRemaining: auth.expiresAt ? Math.max(0, auth.expiresAt - Date.now()) : null,
        timeRemainingFormatted: auth.expiresAt ? formatDuration(Math.max(0, auth.expiresAt - Date.now())) : null
      };
    } else {
      diagnostics.localStorage.rc_auth = null;
    }
  } catch (err) {
    diagnostics.localStorage.rc_auth = { error: err.message };
  }

  // Read other localStorage keys
  try {
    diagnostics.localStorage.supabaseUrl = localStorage.getItem('rc_unified_supabase_url') || localStorage.getItem('rc_supabase_url');
    diagnostics.localStorage.useSupabase = localStorage.getItem('rc_unified_use_supabase') || localStorage.getItem('rc_use_supabase');
  } catch (err) {
    diagnostics.localStorage.error = err.message;
  }

  // Read URL parameters
  try {
    const urlParams = new URLSearchParams(window.location.search);
    diagnostics.urlParams = {
      auto: urlParams.get('auto'),
      code: urlParams.get('code'),
      all: Object.fromEntries(urlParams.entries())
    };
  } catch (err) {
    diagnostics.urlParams = { error: err.message };
  }

  // Check for Supabase client
  diagnostics.supabase = {
    clientExists: !!window.__sbClient,
    globalExists: typeof window.supabase !== 'undefined'
  };

  return diagnostics;
}

/**
 * Format milliseconds duration to human-readable string
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) return '< 1 second';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Pretty print diagnostics to console
 */
function printDiagnostics() {
  const diag = diagnoseAuth();
  
  console.log('%c=== Auth Diagnostics ===', 'font-weight: bold; font-size: 14px; color: #22c55e');
  console.log('%cTimestamp:', 'font-weight: bold', diag.timestamp);
  console.log('');
  
  console.log('%cAuto-Login Status:', 'font-weight: bold; color: #06b6d4');
  console.log('  autoLoginOk:', diag.autoLoginOk);
  console.log('');
  
  console.log('%cSession Storage:', 'font-weight: bold; color: #06b6d4');
  console.log('  role:', diag.sessionStorage.role || '(not set)');
  console.log('  code:', diag.sessionStorage.code || '(not set)');
  console.log('');
  
  console.log('%cLocal Storage (rc_auth):', 'font-weight: bold; color: #06b6d4');
  if (diag.localStorage.rc_auth) {
    if (diag.localStorage.rc_auth.error) {
      console.log('  Error:', diag.localStorage.rc_auth.error);
    } else {
      console.log('  role:', diag.localStorage.rc_auth.role);
      console.log('  code:', diag.localStorage.rc_auth.code);
      console.log('  name:', diag.localStorage.rc_auth.name);
      console.log('  issuedAt:', diag.localStorage.rc_auth.issuedAt);
      console.log('  expiresAt:', diag.localStorage.rc_auth.expiresAt);
      console.log('  isExpired:', diag.localStorage.rc_auth.isExpired);
      console.log('  timeRemaining:', diag.localStorage.rc_auth.timeRemainingFormatted);
    }
  } else {
    console.log('  (not set)');
  }
  console.log('');
  
  console.log('%cURL Parameters:', 'font-weight: bold; color: #06b6d4');
  console.log('  auto:', diag.urlParams.auto || '(not set)');
  console.log('  code:', diag.urlParams.code || '(not set)');
  console.log('');
  
  console.log('%cSupabase:', 'font-weight: bold; color: #06b6d4');
  console.log('  clientExists:', diag.supabase.clientExists);
  console.log('  URL configured:', !!diag.localStorage.supabaseUrl);
  console.log('  Use Supabase:', diag.localStorage.useSupabase || 'false');
  console.log('');
  
  console.log('%cBrowser:', 'font-weight: bold; color: #06b6d4');
  console.log('  online:', diag.browserInfo.online);
  console.log('  cookiesEnabled:', diag.browserInfo.cookiesEnabled);
  console.log('');
  
  console.log('%cRaw Data:', 'font-weight: bold; color: #94a3b8');
  console.log(diag);
  console.log('');
  
  return diag;
}

/**
 * Clear all authentication state (for debugging/testing)
 * WARNING: This will log you out!
 */
function clearAllAuth() {
  console.warn('[diagnostics] Clearing all authentication state...');
  
  // Clear localStorage
  localStorage.removeItem('rc_auth');
  
  // Clear sessionStorage
  sessionStorage.removeItem('rc_user_role');
  sessionStorage.removeItem('rc_user_code');
  
  // Clear global flags
  window.__autoLoginOk = false;
  
  console.log('[diagnostics] All auth state cleared. Page will reload.');
  
  // Reload to reset app state
  setTimeout(() => {
    window.location.reload();
  }, 500);
}

/**
 * Simulate auth expiry (for testing)
 */
function expireAuth() {
  try {
    const authStr = localStorage.getItem('rc_auth');
    if (!authStr) {
      console.warn('[diagnostics] No rc_auth to expire');
      return;
    }
    
    const auth = JSON.parse(authStr);
    auth.expiresAt = Date.now() - 1000; // Expired 1 second ago
    localStorage.setItem('rc_auth', JSON.stringify(auth));
    
    console.log('[diagnostics] Auth expired. Reload to see login form.');
    console.log('[diagnostics] Run window.__diagnoseAuth() to verify.');
  } catch (err) {
    console.error('[diagnostics] Failed to expire auth:', err);
  }
}

// Export to window for console access
if (typeof window !== 'undefined') {
  window.__diagnoseAuth = printDiagnostics;
  window.__clearAllAuth = clearAllAuth;
  window.__expireAuth = expireAuth;
  window.__getDiagnostics = diagnoseAuth;
  
  console.log('[diagnostics] Diagnostic tools loaded:');
  console.log('  window.__diagnoseAuth() - Print full auth diagnostics');
  console.log('  window.__clearAllAuth() - Clear all auth state (logs you out)');
  console.log('  window.__expireAuth() - Expire current auth (for testing)');
  console.log('  window.__getDiagnostics() - Get raw diagnostics object');
}

// Export functions for module use
export { diagnoseAuth, printDiagnostics, clearAllAuth, expireAuth };
