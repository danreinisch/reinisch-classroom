// Client Error Telemetry Endpoint
// Receives client-side error reports and metrics (opt-in only)
// Privacy-safe: sanitizes payloads, throttles aggressively, opt-in only

console.log('[client-error] Module loaded successfully');

const crypto = require('crypto');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

// Configuration
const MAX_BODY_SIZE_KB = 25;
const THROTTLE_WINDOW_SECONDS = 60; // 1 minute
const MAX_EVENTS_PER_WINDOW = 10;
const THROTTLE_DELAY_MS = 150 + Math.floor(Math.random() * 150); // 150-300ms delay on rejection

// Field size limits
const MAX_MESSAGE_LENGTH = 512;
const MAX_STACK_LENGTH = 4096; // ~4KB
const MAX_PAGE_LENGTH = 256;
const MAX_NAME_LENGTH = 128;
const MAX_SOURCE_LENGTH = 256;
const MAX_DETAIL_LENGTH = 512;

// Get HMAC secret for cookie signing (optional)
const { HMAC_SECRET } = process.env;

/**
 * Netlify function handler for client error telemetry
 * @param {Object} event - Netlify function event
 * @returns {Object} Response object
 */
exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[client-error] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log(`[client-error] [${requestId}] Handling CORS preflight`);
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type', 'X-Client-Request-Id']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[client-error] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Validate Content-Type
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json')) {
    console.log(`[client-error] [${requestId}] Invalid Content-Type: ${contentType}`);
    return jsonResponse(event, 400, { error: 'Content-Type must be application/json' }, {}, requestId);
  }

  // Validate body size (≤25KB)
  const bodySizeCheck = validateBodySize(event.body, MAX_BODY_SIZE_KB);
  if (!bodySizeCheck.valid) {
    console.log(`[client-error] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { error: 'Request body too large' }, {}, requestId);
  }

  // Parse JSON safely
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[client-error] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const data = parseResult.data;

  // Extract client request ID if present
  const clientRequestId = event.headers['x-client-request-id'] || event.headers['X-Client-Request-Id'] || null;
  if (clientRequestId) {
    console.log(`[client-error] [${requestId}] Client Request ID: ${clientRequestId}`);
  }

  // Validate required fields
  const validation = validateTelemetryData(data, clientRequestId);
  if (!validation.valid) {
    console.log(`[client-error] [${requestId}] Validation failed: ${validation.error}`);
    return jsonResponse(event, 400, { error: validation.error }, {}, requestId);
  }

  const { type, clientId, page, ts, payload } = validation.data;

  // Check throttling
  const clientIp = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'] || 'unknown';
  const throttleKey = `${clientIp}_${clientId}`;
  const throttleResult = checkThrottle(event, throttleKey);
  
  if (!throttleResult.allowed) {
    console.log(`[client-error] [${requestId}] Throttled: ${throttleKey}`);
    
    // Add delay on rejection
    await new Promise(resolve => setTimeout(resolve, THROTTLE_DELAY_MS));
    
    const securityHeaders = getSecurityHeaders(requestId);
    const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type', 'X-Client-Request-Id']);
    
    return {
      statusCode: 429,
      headers: {
        ...securityHeaders,
        ...corsHeaders,
        'Set-Cookie': createThrottleCookie(throttleKey, throttleResult.count),
      },
      body: '',
    };
  }

  // Sanitize and truncate payload
  const sanitized = sanitizePayload(type, payload);

  // Log the telemetry event
  if (type === 'error') {
    console.log(`[client-error] [${requestId}] ERROR - page: ${page}, name: ${sanitized.name || 'N/A'}, message: ${sanitized.message || 'N/A'}`);
    if (sanitized.stack) {
      console.log(`[client-error] [${requestId}]   stack: ${sanitized.stack.substring(0, 200)}...`);
    }
    if (sanitized.source) {
      console.log(`[client-error] [${requestId}]   source: ${sanitized.source}`);
    }
  } else if (type === 'metric') {
    console.log(`[client-error] [${requestId}] METRIC - page: ${page}, name: ${sanitized.name || 'N/A'}, durationMs: ${sanitized.durationMs || 'N/A'}`);
    if (sanitized.detail) {
      console.log(`[client-error] [${requestId}]   detail: ${sanitized.detail}`);
    }
  }

  // Return 204 No Content with throttle cookie
  const securityHeaders = getSecurityHeaders(requestId);
  const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type', 'X-Client-Request-Id']);

  return {
    statusCode: 204,
    headers: {
      ...securityHeaders,
      ...corsHeaders,
      'Set-Cookie': createThrottleCookie(throttleKey, throttleResult.count + 1),
    },
    body: '',
  };
};

/**
 * Validate telemetry data structure
 * @param {Object} data - Request data
 * @param {string} clientRequestId - Client request ID from header
 * @returns {Object} { valid: boolean, data?: Object, error?: string }
 */
function validateTelemetryData(data, clientRequestId) {
  // Validate type
  if (!data.type || (data.type !== 'error' && data.type !== 'metric')) {
    return { valid: false, error: 'type must be "error" or "metric"' };
  }

  // Validate or derive clientId
  let clientId = data.clientId;
  if (!clientId) {
    // Derive from X-Client-Request-Id if missing
    clientId = clientRequestId || 'unknown';
  } else {
    // Validate UUID v4 format (simple check)
    if (typeof clientId !== 'string' || !clientId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      return { valid: false, error: 'clientId must be a valid UUID v4' };
    }
  }

  // Validate page
  if (!data.page || typeof data.page !== 'string' || data.page.length > MAX_PAGE_LENGTH) {
    return { valid: false, error: `page must be a string <= ${MAX_PAGE_LENGTH} characters` };
  }

  // Validate timestamp (within +/- 24h)
  if (!data.ts || typeof data.ts !== 'number') {
    return { valid: false, error: 'ts must be a number (epoch ms)' };
  }
  const now = Date.now();
  const diff = Math.abs(now - data.ts);
  const twentyFourHours = 24 * 60 * 60 * 1000;
  if (diff > twentyFourHours) {
    return { valid: false, error: 'ts must be within +/- 24 hours of server time' };
  }

  // Validate payload
  if (!data.payload || typeof data.payload !== 'object') {
    return { valid: false, error: 'payload must be an object' };
  }

  // Type-specific payload validation
  if (data.type === 'error') {
    // Error payload: { message, name, stack?, source?, lineno?, colno? }
    const p = data.payload;
    if (p.message !== undefined && typeof p.message !== 'string') {
      return { valid: false, error: 'payload.message must be a string' };
    }
    if (p.name !== undefined && typeof p.name !== 'string') {
      return { valid: false, error: 'payload.name must be a string' };
    }
    if (p.stack !== undefined && typeof p.stack !== 'string') {
      return { valid: false, error: 'payload.stack must be a string' };
    }
    if (p.source !== undefined && typeof p.source !== 'string') {
      return { valid: false, error: 'payload.source must be a string' };
    }
    if (p.lineno !== undefined && typeof p.lineno !== 'number') {
      return { valid: false, error: 'payload.lineno must be a number' };
    }
    if (p.colno !== undefined && typeof p.colno !== 'number') {
      return { valid: false, error: 'payload.colno must be a number' };
    }
  } else if (data.type === 'metric') {
    // Metric payload: { name, durationMs, detail? }
    const p = data.payload;
    if (!p.name || typeof p.name !== 'string') {
      return { valid: false, error: 'payload.name is required for metric type' };
    }
    if (p.durationMs === undefined || typeof p.durationMs !== 'number') {
      return { valid: false, error: 'payload.durationMs is required for metric type' };
    }
    if (p.detail !== undefined && typeof p.detail !== 'string') {
      return { valid: false, error: 'payload.detail must be a string' };
    }
  }

  return {
    valid: true,
    data: {
      type: data.type,
      clientId,
      page: data.page,
      ts: data.ts,
      payload: data.payload,
    },
  };
}

/**
 * Sanitize and truncate payload fields
 * @param {string} type - Event type ('error' or 'metric')
 * @param {Object} payload - Raw payload
 * @returns {Object} Sanitized payload
 */
function sanitizePayload(type, payload) {
  if (type === 'error') {
    return {
      message: payload.message ? sanitizeString(payload.message, MAX_MESSAGE_LENGTH) : undefined,
      name: payload.name ? sanitizeString(payload.name, MAX_NAME_LENGTH) : undefined,
      stack: payload.stack ? truncateStack(payload.stack, MAX_STACK_LENGTH) : undefined,
      source: payload.source ? sanitizeString(payload.source, MAX_SOURCE_LENGTH) : undefined,
      lineno: payload.lineno,
      colno: payload.colno,
    };
  } else if (type === 'metric') {
    return {
      name: sanitizeString(payload.name, MAX_NAME_LENGTH),
      durationMs: payload.durationMs,
      detail: payload.detail ? sanitizeString(payload.detail, MAX_DETAIL_LENGTH) : undefined,
    };
  }
  return {};
}

/**
 * Sanitize string by removing angle brackets and truncating
 * @param {string} str - Input string
 * @param {number} maxLength - Maximum length
 * @returns {string} Sanitized string
 */
function sanitizeString(str, maxLength) {
  if (!str) return '';
  // Remove angle brackets to prevent injection
  let sanitized = str.replace(/[<>]/g, '');
  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  return sanitized;
}

/**
 * Truncate stack trace to first ~30 lines and max length
 * @param {string} stack - Stack trace
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated stack
 */
function truncateStack(stack, maxLength) {
  if (!stack) return '';
  
  // Remove angle brackets
  let sanitized = stack.replace(/[<>]/g, '');
  
  // Split into lines and take first 30
  const lines = sanitized.split('\n');
  if (lines.length > 30) {
    sanitized = lines.slice(0, 30).join('\n') + '\n... (truncated)';
  }
  
  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '... (truncated)';
  }
  
  return sanitized;
}

/**
 * Check throttling using cookie-based counter
 * @param {Object} event - Netlify function event
 * @param {string} throttleKey - Key for throttling (IP + clientId)
 * @returns {Object} { allowed: boolean, count: number }
 */
function checkThrottle(event, throttleKey) {
  const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
  const throttleCookie = getCookie(cookieHeader, 'ce_throttle');
  
  if (!throttleCookie) {
    return { allowed: true, count: 0 };
  }

  // Parse throttle cookie: timestamp_key_count[_hmac]
  try {
    const parts = throttleCookie.split('_');
    if (parts.length < 3) {
      return { allowed: true, count: 0 };
    }
    
    const timestamp = parseInt(parts[0], 10);
    const key = parts[1];
    const count = parseInt(parts[2], 10);
    
    // Verify HMAC if secret is available
    if (HMAC_SECRET && parts.length >= 4) {
      const hmac = parts[3];
      const expected = createHmac(`${timestamp}_${key}_${count}`);
      if (hmac !== expected) {
        console.log('[client-error] Invalid HMAC in throttle cookie');
        return { allowed: true, count: 0 };
      }
    }
    
    const now = Math.floor(Date.now() / 1000);
    const hashedKey = hashKey(throttleKey);
    
    // Check if within window and same key
    if (key === hashedKey && (now - timestamp) < THROTTLE_WINDOW_SECONDS) {
      if (count >= MAX_EVENTS_PER_WINDOW) {
        return { allowed: false, count };
      }
      return { allowed: true, count };
    }
  } catch (e) {
    // Invalid cookie, allow
    console.log('[client-error] Error parsing throttle cookie:', e.message);
  }
  
  return { allowed: true, count: 0 };
}

/**
 * Create throttle cookie with optional HMAC
 * @param {string} throttleKey - Key for throttling
 * @param {number} count - Event count
 * @returns {string} Set-Cookie header value
 */
function createThrottleCookie(throttleKey, count) {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = hashKey(throttleKey);
  const value = `${timestamp}_${key}_${count}`;
  
  // Add HMAC if secret is available
  let cookieValue = value;
  if (HMAC_SECRET) {
    const hmac = createHmac(value);
    cookieValue = `${value}_${hmac}`;
  }
  
  return `ce_throttle=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${THROTTLE_WINDOW_SECONDS}`;
}

/**
 * Get cookie value from header
 * @param {string} header - Cookie header
 * @param {string} name - Cookie name
 * @returns {string} Cookie value or empty string
 */
function getCookie(header, name) {
  if (!header) return '';
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const [k, ...v] = part.split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

/**
 * Simple hash for key (not cryptographic, just for cookie storage)
 * @param {string} key - Key to hash
 * @returns {string} Hashed key
 */
function hashKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Create HMAC for cookie signing
 * @param {string} value - Value to sign
 * @returns {string} HMAC signature
 */
function createHmac(value) {
  if (!HMAC_SECRET) return '';
  const hmac = crypto.createHmac('sha256', HMAC_SECRET);
  hmac.update(value);
  return hmac.digest('hex').substring(0, 16);
}
