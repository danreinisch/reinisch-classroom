// user-auth.js
// Unified user authentication helpers with Supabase RPC and local fallback

import { getSupabase } from './supabase-client.js';

const NS = 'rc_unified_';
const AUTH_NS = 'rc_auth_';

// Initialize hubHealth tracking
if (!window.hubHealth) {
  window.hubHealth = {};
}
if (!window.hubHealth.auth) {
  window.hubHealth.auth = { attempts: 0 };
}

/**
 * Local storage helpers for offline fallback
 */
const localStore = {
  get: (k, def) => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_NS + k)) ?? def;
    } catch {
      return def;
    }
  },
  set: (k, v) => localStorage.setItem(AUTH_NS + k, JSON.stringify(v)),
  remove: (k) => localStorage.removeItem(AUTH_NS + k)
};

/**
 * Check if Supabase is available
 */
async function isSupabaseAvailable() {
  const supabase = await getSupabase();
  return supabase && typeof supabase.rpc === 'function';
}

/**
 * Verify user password (remote or local fallback)
 * @param {string} username - Username to verify
 * @param {string} password - Password to verify (plaintext, will be hashed by RPC)
 * @returns {Promise<Object|null>} User object with username, role, student_id, user_id or null if failed
 */
export async function verifyUserPassword(username, password) {
  // Normalize username: trim and lowercase
  username = username.trim().toLowerCase();
  
  // Track attempt
  window.hubHealth.auth.attempts = (window.hubHealth.auth.attempts || 0) + 1;
  
  // Try remote first if available
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { data, error } = await supabase.rpc('verify_user_password', {
        p_username: username,
        p_password: password
      });

      if (error) {
        console.warn('[user-auth] Supabase RPC error, falling back to local:', error.message);
        const localResult = verifyLocalPassword(username, password);
        
        // Set hubHealth
        if (localResult) {
          window.hubHealth.auth = {
            success: true,
            user: localResult.username,
            ts: Date.now(),
            method: 'local-fallback',
            attempts: window.hubHealth.auth.attempts
          };
        } else {
          window.hubHealth.auth = {
            success: false,
            ts: Date.now(),
            reason: 'Invalid credentials (local fallback)',
            attempts: window.hubHealth.auth.attempts
          };
        }
        
        return localResult;
      }

      // RPC returns array, take first result or null
      if (data && data.length > 0) {
        const user = data[0];
        console.log('[user-auth] Remote authentication successful for:', username);
        
        // Set hubHealth
        window.hubHealth.auth = {
          success: true,
          user: user.username,
          ts: Date.now(),
          method: 'remote',
          attempts: window.hubHealth.auth.attempts
        };
        
        return {
          username: user.username,
          role: user.role,
          student_id: user.student_id,
          user_id: user.user_id
        };
      } else {
        // No results means authentication failed
        console.log('[user-auth] Remote authentication failed for:', username);
        
        // Set hubHealth
        window.hubHealth.auth = {
          success: false,
          ts: Date.now(),
          reason: 'Invalid credentials (remote)',
          attempts: window.hubHealth.auth.attempts
        };
        
        return null;
      }
    } catch (err) {
      console.warn('[user-auth] Network error, falling back to local:', err.message);
      const localResult = verifyLocalPassword(username, password);
      
      // Set hubHealth
      if (localResult) {
        window.hubHealth.auth = {
          success: true,
          user: localResult.username,
          ts: Date.now(),
          method: 'local-fallback',
          attempts: window.hubHealth.auth.attempts
        };
      } else {
        window.hubHealth.auth = {
          success: false,
          ts: Date.now(),
          reason: 'Invalid credentials (local fallback)',
          attempts: window.hubHealth.auth.attempts
        };
      }
      
      return localResult;
    }
  } else {
    // Supabase not available, use local
    console.log('[user-auth] Supabase not configured, using local authentication');
    const localResult = verifyLocalPassword(username, password);
    
    // Set hubHealth
    if (localResult) {
      window.hubHealth.auth = {
        success: true,
        user: localResult.username,
        ts: Date.now(),
        method: 'local',
        attempts: window.hubHealth.auth.attempts
      };
    } else {
      window.hubHealth.auth = {
        success: false,
        ts: Date.now(),
        reason: 'Invalid credentials (local)',
        attempts: window.hubHealth.auth.attempts
      };
    }
    
    return localResult;
  }
}

/**
 * Local password verification (fallback for offline mode)
 * Stores passwords in plaintext in localStorage (dev/offline only - not production secure)
 */
function verifyLocalPassword(username, password) {
  const users = localStore.get('users', {});
  let user = users[username];
  
  // Bootstrap default users if not found
  if (!user) {
    // Check for default substitute password
    if (username === 'substitute' && password === 'Winfield2025*') {
      return {
        username: 'substitute',
        role: 'substitute',
        student_id: null,
        user_id: null
      };
    }
    
    // Bootstrap generic teacher user for local dev ONLY
    // Only active when running on localhost to avoid shipping in production
    const isLocalDev = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
    if (isLocalDev && username === 'teacher_local' && password === 'ChangeMe123!') {
      const bootstrappedUser = {
        username: 'teacher_local',
        role: 'teacher',
        student_id: null,
        password: 'ChangeMe123!',
        user_id: Date.now()
      };
      
      // Save to local storage for future use
      users['teacher_local'] = bootstrappedUser;
      localStore.set('users', users);
      
      console.log('[user-auth] Bootstrapped local dev user: teacher_local (teacher)');
      
      return {
        username: bootstrappedUser.username,
        role: bootstrappedUser.role,
        student_id: null,
        user_id: bootstrappedUser.user_id
      };
    }
    
    return null;
  }

  // Simple plaintext comparison (local only)
  if (user.password === password) {
    return {
      username: user.username,
      role: user.role,
      student_id: user.student_id || null,
      user_id: user.user_id || null
    };
  }

  return null;
}

/**
 * Set user password (remote or local fallback)
 * NOTE: Only for administrative use - sets passwords in the system
 * @param {string} username - Username
 * @param {string} password - Password (plaintext, will be hashed by RPC)
 * @param {string} role - User role (student, teacher, substitute, admin)
 * @param {number} studentId - Student ID (for student role, optional)
 * @returns {Promise<Object>} Result object with success status
 */
export async function setUserPassword(username, password, role = 'student', studentId = null) {
  // Try remote first if available
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { data, error } = await supabase.rpc('set_user_password', {
        p_username: username,
        p_password: password,
        p_role: role,
        p_student_id: studentId
      });

      if (error) {
        console.warn('[user-auth] Supabase RPC error, falling back to local:', error.message);
        return setLocalPassword(username, password, role, studentId);
      }

      console.log('[user-auth] Remote password set successfully for:', username);
      return { success: true, ...data };
    } catch (err) {
      console.warn('[user-auth] Network error, falling back to local:', err.message);
      return setLocalPassword(username, password, role, studentId);
    }
  } else {
    // Supabase not available, use local
    console.log('[user-auth] Supabase not configured, using local storage');
    return setLocalPassword(username, password, role, studentId);
  }
}

/**
 * Local password setting (fallback for offline mode)
 * SECURITY WARNING: Stores passwords in plaintext - only for dev/offline use
 */
function setLocalPassword(username, password, role, studentId) {
  const users = localStore.get('users', {});
  
  users[username] = {
    username,
    role,
    student_id: studentId,
    password, // PLAINTEXT - not secure, local only
    user_id: Date.now() // fake ID for local
  };
  
  localStore.set('users', users);
  
  return {
    success: true,
    username,
    role,
    message: 'Password set locally (plaintext storage - dev only)'
  };
}

/**
 * Save authentication session
 * @param {Object} authData - Auth data with username, role, student_id
 */
export function saveAuthSession(authData) {
  localStorage.setItem('rc_auth', JSON.stringify(authData));
}

/**
 * Get current authentication session
 * @returns {Object|null} Current auth session or null
 */
export function getAuthSession() {
  try {
    const auth = localStorage.getItem('rc_auth');
    return auth ? JSON.parse(auth) : null;
  } catch {
    return null;
  }
}

/**
 * Clear authentication session (logout)
 */
export function clearAuthSession() {
  localStorage.removeItem('rc_auth');
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if authenticated
 */
export function isAuthenticated() {
  return getAuthSession() !== null;
}

/**
 * Check if current user has specific role
 * @param {string} role - Role to check
 * @returns {boolean} True if user has the role
 */
export function hasRole(role) {
  const auth = getAuthSession();
  return auth && auth.role === role;
}
