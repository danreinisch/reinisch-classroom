// diagnostics.js
// Diagnostic utilities for debugging authentication and session state
// Extended with client request ID tracking, fetch wrapper, and conditional logging

// ============================================================================
// Client Request ID & Fetch Wrapper
// ============================================================================

/**
 * Generate UUID v4 client request ID
 * Generated once per page load
 * @returns {string} UUID v4 format
 */
function generateClientRequestId() {
  // Simple UUID v4 generation using crypto API if available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Initialize client request ID once per page load
if (typeof window !== 'undefined' && !window.rcClientRequestId) {
  window.rcClientRequestId = generateClientRequestId();
  console.log('[diagnostics] Client Request ID:', window.rcClientRequestId);
}

/**
 * Wrapped fetch with timeout, retry, and client request ID injection
 * @param {string} url - URL to fetch
 * @param {Object} opts - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
async function wrapFetch(url, opts = {}) {
  const maxRetries = 1;
  const timeoutMs = 10000; // 10 seconds
  
  // Inject X-Client-Request-Id header
  const headers = opts.headers || {};
  headers['X-Client-Request-Id'] = window.rcClientRequestId;
  
  const wrappedOpts = {
    ...opts,
    headers,
  };
  
  // Attempt fetch with timeout and retry
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, {
        ...wrappedOpts,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      // If it's the last attempt, throw the error
      if (attempt === maxRetries) {
        console.error('[diagnostics] wrapFetch failed after retries:', err.message);
        throw err;
      }
      
      // Network error - retry once
      if (err.name === 'AbortError') {
        console.warn(`[diagnostics] wrapFetch timeout on attempt ${attempt + 1}, retrying...`);
      } else if (err.name === 'TypeError' && err.message.includes('fetch')) {
        console.warn(`[diagnostics] wrapFetch network error on attempt ${attempt + 1}, retrying...`);
      } else {
        // Don't retry for other error types
        throw err;
      }
      
      // Wait 500ms before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

// ============================================================================
// Conditional Diagnostic Logger & Telemetry
// ============================================================================

/**
 * Check if telemetry is enabled via any opt-in mechanism
 * @returns {boolean} True if telemetry should be active
 */
function isTelemetryEnabled() {
  if (typeof window === 'undefined') return false;
  
  // Check URL flag ?diag=1
  const params = new URLSearchParams(window.location.search);
  if (params.get('diag') === '1') return true;
  
  // Check localStorage flag
  try {
    if (localStorage.getItem('rcDiagEnabled') === '1') return true;
  } catch (err) {
    // localStorage not available
  }
  
  // Check window feature flag
  if (window.RC_DIAG_ENABLED === true) return true;
  
  return false;
}

/**
 * Diagnostic logger that only logs when telemetry is enabled
 */
const rcDiag = {
  enabled: false,
  
  /**
   * Initialize diagnostic mode based on opt-in mechanisms
   */
  init() {
    if (typeof window !== 'undefined') {
      this.enabled = isTelemetryEnabled();
      
      if (this.enabled) {
        console.log('%c[rcDiag] Diagnostic mode enabled', 'color: #22c55e; font-weight: bold');
      }
    }
  },
  
  /**
   * Log message (only if diag mode enabled)
   */
  log(...args) {
    if (this.enabled) {
      console.log('[rcDiag]', ...args);
    }
  },
  
  /**
   * Warn message (only if diag mode enabled)
   */
  warn(...args) {
    if (this.enabled) {
      console.warn('[rcDiag]', ...args);
    }
  },
  
  /**
   * Error message (only if diag mode enabled)
   */
  error(...args) {
    if (this.enabled) {
      console.error('[rcDiag]', ...args);
    }
  },
  
  /**
   * Info message (only if diag mode enabled)
   */
  info(...args) {
    if (this.enabled) {
      console.info('[rcDiag]', ...args);
    }
  },
};

// Initialize diagnostic mode
if (typeof window !== 'undefined') {
  rcDiag.init();
  window.rcDiag = rcDiag;
  window.wrapFetch = wrapFetch;
}

// ============================================================================
// Client Error Telemetry (Opt-in)
// ============================================================================

/**
 * Telemetry event queue and batching system
 */
const telemetryQueue = {
  events: [],
  flushTimer: null,
  maxBatchSize: 10,
  flushIntervalMs: 5000,
  failCount: 0,
  maxFailures: 2,
  
  /**
   * Add event to queue and schedule flush
   * @param {Object} event - Telemetry event
   */
  enqueue(event) {
    if (!isTelemetryEnabled()) return;
    
    this.events.push(event);
    
    // Flush immediately if batch is full
    if (this.events.length >= this.maxBatchSize) {
      this.flush();
    } else {
      // Schedule flush if not already scheduled
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), this.flushIntervalMs);
      }
    }
  },
  
  /**
   * Send queued events to server
   */
  async flush() {
    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Nothing to send
    if (this.events.length === 0) return;
    
    // Drop events if offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      rcDiag.warn('Telemetry: Offline, dropping', this.events.length, 'events');
      this.events = [];
      return;
    }
    
    // Drop events if too many failures
    if (this.failCount >= this.maxFailures) {
      rcDiag.warn('Telemetry: Max failures reached, dropping', this.events.length, 'events');
      this.events = [];
      return;
    }
    
    // Get events to send
    const batch = this.events.splice(0, this.maxBatchSize);
    
    // Send each event individually (API doesn't support batching)
    for (const event of batch) {
      try {
        const response = await wrapFetch('/.netlify/functions/client-error', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        });
        
        if (response.status === 204) {
          // Success
          this.failCount = 0; // Reset fail counter on success
          rcDiag.log('Telemetry event sent:', event.type, event.payload.name || event.payload.message);
        } else if (response.status === 429) {
          // Throttled - stop sending
          rcDiag.warn('Telemetry: Throttled by server');
          this.failCount++;
          break;
        } else {
          // Other error
          rcDiag.warn('Telemetry: Server error', response.status);
          this.failCount++;
        }
      } catch (err) {
        rcDiag.error('Telemetry: Send failed', err.message);
        this.failCount++;
      }
    }
  },
};

/**
 * Capture and report an error
 * @param {Error|ErrorEvent|PromiseRejectionEvent} errorInput - Error to capture
 */
function captureError(errorInput) {
  if (!isTelemetryEnabled()) return;
  
  let error;
  let source;
  let lineno;
  let colno;
  
  // Normalize different error types
  if (errorInput instanceof ErrorEvent) {
    error = errorInput.error || new Error(errorInput.message);
    source = errorInput.filename;
    lineno = errorInput.lineno;
    colno = errorInput.colno;
  } else if (errorInput && errorInput.reason) {
    // PromiseRejectionEvent
    error = errorInput.reason instanceof Error ? errorInput.reason : new Error(String(errorInput.reason));
  } else if (errorInput instanceof Error) {
    error = errorInput;
  } else {
    error = new Error(String(errorInput));
  }
  
  // Extract page path (no query params or hash)
  const page = window.location.pathname;
  
  // Build telemetry event
  const event = {
    type: 'error',
    clientId: window.rcClientRequestId || null,
    page,
    ts: Date.now(),
    payload: {
      message: error.message || 'Unknown error',
      name: error.name || 'Error',
    },
  };
  
  // Add stack if available
  if (error.stack) {
    event.payload.stack = error.stack;
  }
  
  // Add source location if available
  if (source) {
    event.payload.source = source;
  }
  if (lineno !== undefined && lineno !== null) {
    event.payload.lineno = lineno;
  }
  if (colno !== undefined && colno !== null) {
    event.payload.colno = colno;
  }
  
  telemetryQueue.enqueue(event);
}

/**
 * Record a performance metric
 * @param {string} name - Metric name
 * @param {number} durationMs - Duration in milliseconds
 * @param {string} detail - Optional detail string
 */
function recordMetric(name, durationMs, detail) {
  if (!isTelemetryEnabled()) return;
  
  const page = window.location.pathname;
  
  const event = {
    type: 'metric',
    clientId: window.rcClientRequestId || null,
    page,
    ts: Date.now(),
    payload: {
      name,
      durationMs,
    },
  };
  
  if (detail) {
    event.payload.detail = detail;
  }
  
  telemetryQueue.enqueue(event);
}

/**
 * Measure time for an async operation
 * @param {string} name - Metric name
 * @param {Function} fn - Async function to measure
 * @returns {Promise<any>} Result of the function
 */
async function measureAsync(name, fn) {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    recordMetric(name, duration);
    return result;
  } catch (err) {
    const duration = performance.now() - start;
    recordMetric(name, duration, 'failed');
    throw err;
  }
}

// Install global error handlers
if (typeof window !== 'undefined' && isTelemetryEnabled()) {
  // Capture uncaught errors
  window.addEventListener('error', (event) => {
    captureError(event);
  });
  
  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    captureError(event);
  });
  
  // Flush queue before page unload
  window.addEventListener('beforeunload', () => {
    telemetryQueue.flush();
  });
  
  rcDiag.log('Telemetry: Error handlers installed');
}

// Export telemetry functions to window
if (typeof window !== 'undefined') {
  window.captureError = captureError;
  window.recordMetric = recordMetric;
  window.measureAsync = measureAsync;
}

// ============================================================================
// Existing Diagnostic Functions
// ============================================================================

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
  console.log('  window.wrapFetch(url, opts) - Fetch with timeout, retry, and request ID');
  console.log('  window.rcDiag.log() - Log only when telemetry enabled');
  console.log('  window.rcClientRequestId - Current client request ID');
  console.log('  window.captureError(error) - Capture error for telemetry');
  console.log('  window.recordMetric(name, durationMs, detail) - Record performance metric');
  console.log('  window.measureAsync(name, asyncFn) - Measure async function duration');
}

// Export functions for module use
export { 
  diagnoseAuth, 
  printDiagnostics, 
  clearAllAuth, 
  expireAuth,
  wrapFetch,
  generateClientRequestId,
  rcDiag,
  captureError,
  recordMetric,
  measureAsync,
};
