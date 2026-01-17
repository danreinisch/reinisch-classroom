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

  // If caller didn't specify credentials, default to sending cookies to Netlify Functions.
  const urlStr = (typeof url === 'string')
    ? url
    : (url && typeof url === 'object' && 'url' in url ? url.url : String(url || ''));
  const isNetlifyFn = urlStr.includes('/.netlify/functions/');
  if (isNetlifyFn && wrappedOpts.credentials == null) wrappedOpts.credentials = 'include';
  if (isNetlifyFn && wrappedOpts.cache == null) wrappedOpts.cache = 'no-store';
  
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
// Conditional Diagnostic Logger
// ============================================================================

/**
 * Diagnostic logger that only logs when ?diag=1 is present
 */
const rcDiag = {
  enabled: false,
  
  /**
   * Initialize diagnostic mode based on URL parameter, localStorage, or window flag
   */
  init() {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlFlag = params.get('diag') === '1';
      const localStorageFlag = localStorage.getItem('rcDiagEnabled') === '1';
      const windowFlag = window.RC_DIAG_ENABLED === true;
      
      this.enabled = urlFlag || localStorageFlag || windowFlag;
      
      if (this.enabled) {
        console.log('%c[rcDiag] Diagnostic mode enabled', 'color: #22c55e; font-weight: bold');
        if (urlFlag) console.log('[rcDiag] Enabled via ?diag=1');
        if (localStorageFlag) console.log('[rcDiag] Enabled via localStorage.rcDiagEnabled');
        if (windowFlag) console.log('[rcDiag] Enabled via window.RC_DIAG_ENABLED');
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
  console.log('  window.rcDiag.log() - Log only when ?diag=1 is present');
  console.log('  window.rcClientRequestId - Current client request ID');
  console.log('  window.rcTelemetry - Client error telemetry (opt-in, enabled with diag mode)');
}

// ============================================================================
// Client Error Telemetry (Opt-in Only)
// ============================================================================

/**
 * Telemetry system for capturing errors and metrics
 * Only active when diagnostics are enabled
 */
const rcTelemetry = {
  queue: [],
  flushIntervalId: null,
  maxQueueSize: 10,
  flushIntervalMs: 5000, // 5 seconds
  failureCount: 0,
  maxFailures: 2,
  
  /**
   * Initialize telemetry system
   */
  init() {
    if (!rcDiag.enabled) {
      return; // No-op when diagnostics disabled
    }
    
    rcDiag.log('Telemetry system initializing...');
    
    // Set up error handlers
    this.setupErrorHandlers();
    
    // Start flush interval
    this.flushIntervalId = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
    
    rcDiag.log('Telemetry system initialized');
  },
  
  /**
   * Set up global error and rejection handlers
   */
  setupErrorHandlers() {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.captureError({
        message: event.message,
        name: 'Error',
        stack: event.error ? event.error.stack : undefined,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });
    
    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason;
      this.captureError({
        message: error && error.message ? error.message : String(event.reason),
        name: error && error.name ? error.name : 'UnhandledRejection',
        stack: error && error.stack ? error.stack : undefined,
        source: 'promise',
      });
    });
    
    rcDiag.log('Error handlers installed');
  },
  
  /**
   * Capture an error event
   * @param {Object} errorData - Error data
   */
  captureError(errorData) {
    if (!rcDiag.enabled) return;
    
    rcDiag.log('Capturing error:', errorData.message);
    
    // Sanitize and normalize error data
    const sanitized = {
      message: this.sanitizeString(errorData.message || 'Unknown error', 512),
      name: this.sanitizeString(errorData.name || 'Error', 128),
      stack: this.sanitizeStack(errorData.stack),
      source: this.sanitizeString(errorData.source, 256),
      lineno: errorData.lineno,
      colno: errorData.colno,
    };
    
    // Queue the event
    this.queueEvent({
      type: 'error',
      clientId: window.rcClientRequestId,
      page: this.getPagePath(),
      ts: Date.now(),
      payload: sanitized,
    });
  },
  
  /**
   * Record a timing metric
   * @param {string} name - Metric name
   * @param {number} durationMs - Duration in milliseconds
   * @param {string} detail - Optional detail string
   */
  recordMetric(name, durationMs, detail) {
    if (!rcDiag.enabled) return;
    
    rcDiag.log('Recording metric:', name, durationMs + 'ms');
    
    // Queue the event
    this.queueEvent({
      type: 'metric',
      clientId: window.rcClientRequestId,
      page: this.getPagePath(),
      ts: Date.now(),
      payload: {
        name: this.sanitizeString(name, 128),
        durationMs,
        detail: detail ? this.sanitizeString(detail, 512) : undefined,
      },
    });
  },
  
  /**
   * Queue an event for sending
   * @param {Object} event - Event data
   */
  queueEvent(event) {
    // Check if offline
    if (!navigator.onLine) {
      rcDiag.warn('Offline, dropping telemetry event');
      return;
    }
    
    // Check if too many failures
    if (this.failureCount >= this.maxFailures) {
      rcDiag.warn('Too many failures, dropping telemetry event');
      return;
    }
    
    this.queue.push(event);
    
    // Flush immediately if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      this.flush();
    }
  },
  
  /**
   * Flush queued events to server
   */
  async flush() {
    if (this.queue.length === 0) return;
    
    const events = this.queue.splice(0, this.maxQueueSize);
    rcDiag.log(`Flushing ${events.length} telemetry event(s)...`);
    
    // Send each event
    // IMPORTANT: Use same-origin relative URL for preview deploy compatibility
    for (const event of events) {
      try {
        const response = await wrapFetch('/.netlify/functions/client-error', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        });
        
        if (response.ok) {
          rcDiag.log('Telemetry event sent successfully:', event.type);
          this.failureCount = 0; // Reset failure count on success
        } else if (response.status === 429) {
          rcDiag.warn('Telemetry throttled (429)');
          this.failureCount++;
        } else {
          rcDiag.warn('Telemetry send failed:', response.status);
          this.failureCount++;
        }
      } catch (err) {
        rcDiag.error('Telemetry send error:', err.message);
        this.failureCount++;
      }
    }
  },
  
  /**
   * Get current page path (no query string or hash)
   * @returns {string} Page path
   */
  getPagePath() {
    try {
      return window.location.pathname;
    } catch (e) {
      return '/';
    }
  },
  
  /**
   * Sanitize string by removing potentially sensitive info
   * @param {string} str - Input string
   * @param {number} maxLength - Max length
   * @returns {string} Sanitized string
   */
  sanitizeString(str, maxLength) {
    if (!str) return '';
    let sanitized = String(str);
    
    // Truncate if needed
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '...';
    }
    
    return sanitized;
  },
  
  /**
   * Sanitize stack trace
   * @param {string} stack - Stack trace
   * @returns {string} Sanitized stack (max 30 lines, 4KB)
   */
  sanitizeStack(stack) {
    if (!stack) return undefined;
    
    let sanitized = String(stack);
    const lines = sanitized.split('\n');
    
    // Take first 30 lines
    if (lines.length > 30) {
      sanitized = lines.slice(0, 30).join('\n');
    }
    
    // Truncate to 4KB
    if (sanitized.length > 4096) {
      sanitized = sanitized.substring(0, 4096);
    }
    
    return sanitized;
  },
  
  /**
   * Measure and record timing for an async operation
   * @param {string} name - Metric name
   * @param {Function} fn - Async function to measure
   * @returns {Promise<any>} Result of fn
   */
  async measureAsync(name, fn) {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
      return result;
    } catch (err) {
      const duration = performance.now() - start;
      this.recordMetric(name, duration, 'error');
      throw err;
    }
  },
};

// Initialize telemetry when diagnostics are enabled
if (typeof window !== 'undefined') {
  // Initialize after a short delay to let the page settle
  setTimeout(() => {
    rcTelemetry.init();
  }, 100);
  
  // Export to window for programmatic use
  window.rcTelemetry = rcTelemetry;
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
  rcTelemetry,
};
