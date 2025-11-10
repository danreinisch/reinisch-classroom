// auth-handoff.js
// Shared authentication handoff utilities for Hub → Student Portal flow
// Supports 24-hour "remember me" and multi-tab synchronization via BroadcastChannel

const AUTH_KEY = 'rc_auth';
const AUTH_CHANNEL_NAME = 'rc-auth';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// BroadcastChannel for multi-tab auth synchronization
let authChannel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  }
} catch (err) {
  console.warn('[auth] BroadcastChannel not available:', err);
}

/**
 * Write auth handoff to localStorage with 24-hour expiry
 * @param {Object} authData - Auth data { role, code, name }
 * @param {number} [ttlMs=DEFAULT_TTL_MS] - Time to live in milliseconds
 */
export function writeAuth(authData, ttlMs = DEFAULT_TTL_MS) {
  if (!authData || !authData.role || !authData.code) {
    console.warn('[auth] Invalid auth data, skipping write');
    return;
  }

  const now = Date.now();
  const handoff = {
    role: authData.role,
    code: authData.code,
    name: authData.name || authData.code,
    issuedAt: now,
    expiresAt: now + ttlMs
  };

  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(handoff));
    console.log('[auth] Auth written:', { role: handoff.role, code: handoff.code, expiresIn: Math.round(ttlMs / 1000 / 60) + 'min' });
    
    // Broadcast to other tabs
    if (authChannel) {
      authChannel.postMessage({ type: 'auth-updated', auth: handoff });
    }
  } catch (err) {
    console.error('[auth] Failed to write auth:', err);
  }
}

/**
 * Read auth handoff from localStorage
 * @returns {Object|null} Auth object or null if not present/invalid
 */
export function readAuth() {
  try {
    const authStr = localStorage.getItem(AUTH_KEY);
    if (!authStr) return null;

    const auth = JSON.parse(authStr);
    
    // Validate structure
    if (!auth || !auth.role || !auth.code || !auth.issuedAt || !auth.expiresAt) {
      console.warn('[auth] Invalid auth structure, clearing');
      clearAuth();
      return null;
    }

    // Check expiry
    if (isExpired(auth)) {
      console.log('[auth] Auth expired, clearing');
      clearAuth();
      return null;
    }

    return auth;
  } catch (err) {
    console.error('[auth] Failed to read auth:', err);
    return null;
  }
}

/**
 * Clear auth handoff from localStorage
 */
export function clearAuth() {
  try {
    localStorage.removeItem(AUTH_KEY);
    console.log('[auth] Auth cleared');
    
    // Broadcast to other tabs
    if (authChannel) {
      authChannel.postMessage({ type: 'auth-cleared' });
    }
  } catch (err) {
    console.error('[auth] Failed to clear auth:', err);
  }
}

/**
 * Check if auth object is expired
 * @param {Object} auth - Auth object with expiresAt timestamp
 * @returns {boolean} True if expired
 */
export function isExpired(auth) {
  if (!auth || typeof auth.expiresAt !== 'number') {
    return true;
  }
  return Date.now() > auth.expiresAt;
}

/**
 * Refresh auth expiry (extends by 24 hours from now)
 * @param {number} [ttlMs=DEFAULT_TTL_MS] - Time to live in milliseconds
 * @returns {boolean} True if refreshed successfully
 */
export function refreshAuth(ttlMs = DEFAULT_TTL_MS) {
  const auth = readAuth();
  if (!auth) {
    return false;
  }

  // Update expiry timestamps
  const now = Date.now();
  auth.issuedAt = now;
  auth.expiresAt = now + ttlMs;

  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    console.log('[auth] Auth refreshed');
    
    // Broadcast to other tabs
    if (authChannel) {
      authChannel.postMessage({ type: 'auth-updated', auth });
    }
    
    return true;
  } catch (err) {
    console.error('[auth] Failed to refresh auth:', err);
    return false;
  }
}

/**
 * Listen for auth changes from other tabs
 * @param {Function} callback - Callback function(event) where event has { type, auth }
 * @returns {Function|null} Cleanup function to remove listener, or null if not available
 */
export function onAuthChange(callback) {
  if (!authChannel) {
    console.warn('[auth] BroadcastChannel not available, cannot listen for auth changes');
    return null;
  }

  const handler = (event) => {
    if (event && event.data) {
      callback(event.data);
    }
  };

  authChannel.addEventListener('message', handler);

  // Return cleanup function
  return () => {
    authChannel.removeEventListener('message', handler);
  };
}

/**
 * Get time remaining until auth expires
 * @returns {number|null} Milliseconds remaining, or null if no auth exists
 */
export function getTimeRemaining() {
  const auth = readAuth();
  if (!auth) return null;

  const remaining = auth.expiresAt - Date.now();
  return Math.max(0, remaining);
}

/**
 * Get human-readable expiry information
 * @returns {string|null} Expiry message or null
 */
export function getExpiryMessage() {
  const remaining = getTimeRemaining();
  if (remaining === null) return null;

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  } else if (minutes > 0) {
    return `${minutes}m remaining`;
  } else {
    return 'Expires soon';
  }
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

/**
 * Legacy alias for writeAuth to maintain backward compatibility with Hub code
 * Hub code calls setAuth({ role, code, name }) - map this to writeAuth()
 * @param {Object} authData - Auth data { role, username, code, student_id, name }
 */
if (typeof window !== 'undefined') {
  window.setAuth = function(authData) {
    console.log('[auth] Legacy setAuth called, mapping to writeAuth');
    
    // Map legacy fields to new format
    // Priority: code > username > student_id (for backward compatibility)
    const code = authData.code || authData.username || authData.student_id;
    const name = authData.name || authData.username;
    
    if (!code) {
      console.warn('[auth] setAuth called without valid code/username/student_id, ignoring');
      return;
    }
    
    // Log which field was used for transparency
    if (authData.code) {
      console.log('[auth] Using authData.code:', code);
    } else if (authData.username) {
      console.log('[auth] Using authData.username as code:', code);
    } else {
      console.log('[auth] Using authData.student_id as code:', code);
    }
    
    const mappedAuth = {
      role: authData.role,
      code: code,
      name: name
    };
    
    writeAuth(mappedAuth);
  };
  
  console.log('[auth] Legacy window.setAuth alias registered');
}
