// Client Error Telemetry Collector
// Privacy-safe, opt-in error and metric telemetry endpoint
// Accepts error reports and performance metrics from client diagnostics

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

// Maximum size for telemetry payloads (25KB)
const MAX_PAYLOAD_SIZE_KB = 25;

// Throttle settings
const THROTTLE_WINDOW_MS = 60000; // 1 minute
const MAX_EVENTS_PER_WINDOW = 10;
const REJECTION_DELAY_MS = 150 + Math.floor(Math.random() * 150); // 150-300ms

// Field size limits
const MAX_STRING_LENGTHS = {
  message: 512,
  name: 256,
  source: 256,
  page: 256,
  stack: 4096, // ~4KB for stack traces
  metricName: 128,
  detail: 512,
};

/**
 * Generate throttle key from IP and clientId
 * @param {string} ip - Client IP address
 * @param {string} clientId - Client request ID
 * @returns {string} Hashed throttle key
 */
function getThrottleKey(ip, clientId) {
  const combined = `${ip || 'unknown'}:${clientId || 'none'}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
}

/**
 * Parse throttle cookie
 * @param {string} cookieHeader - Cookie header value
 * @returns {Object|null} Parsed throttle data or null
 */
function parseThrottleCookie(cookieHeader) {
  if (!cookieHeader) return null;
  
  const match = cookieHeader.match(/ce_throttle=([^;]+)/);
  if (!match) return null;
  
  try {
    const [timestamp, key, count] = match[1].split('_');
    return {
      timestamp: parseInt(timestamp, 10),
      key,
      count: parseInt(count, 10),
    };
  } catch (err) {
    return null;
  }
}

/**
 * Create throttle cookie
 * @param {string} key - Throttle key
 * @param {number} count - Event count
 * @returns {string} Set-Cookie header value
 */
function createThrottleCookie(key, count) {
  const timestamp = Date.now();
  const value = `${timestamp}_${key}_${count}`;
  const maxAge = Math.ceil(THROTTLE_WINDOW_MS / 1000);
  
  return `ce_throttle=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Check if request should be throttled
 * @param {Object} event - Netlify function event
 * @param {string} clientId - Client request ID
 * @returns {Object} { throttled: boolean, cookie: string|null, count: number }
 */
function checkThrottle(event, clientId) {
  const ip = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'] || 'unknown';
  const throttleKey = getThrottleKey(ip, clientId);
  
  const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
  const existing = parseThrottleCookie(cookieHeader);
  
  // No existing throttle
  if (!existing) {
    return {
      throttled: false,
      cookie: createThrottleCookie(throttleKey, 1),
      count: 1,
    };
  }
  
  // Check if throttle window expired
  const now = Date.now();
  if (now - existing.timestamp > THROTTLE_WINDOW_MS) {
    // Window expired, reset counter
    return {
      throttled: false,
      cookie: createThrottleCookie(throttleKey, 1),
      count: 1,
    };
  }
  
  // Check if key matches (same IP + clientId)
  if (existing.key !== throttleKey) {
    // Different client, start new counter
    return {
      throttled: false,
      cookie: createThrottleCookie(throttleKey, 1),
      count: 1,
    };
  }
  
  // Same client within window
  const newCount = existing.count + 1;
  
  if (newCount > MAX_EVENTS_PER_WINDOW) {
    // Throttled!
    return {
      throttled: true,
      cookie: createThrottleCookie(throttleKey, newCount),
      count: newCount,
    };
  }
  
  // Under limit
  return {
    throttled: false,
    cookie: createThrottleCookie(throttleKey, newCount),
    count: newCount,
  };
}

/**
 * Truncate string to max length
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated string
 */
function truncateString(str, maxLen) {
  if (typeof str !== 'string') return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen);
}

/**
 * Sanitize text by removing angle brackets
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '');
}

/**
 * Truncate stack trace to reasonable size
 * @param {string} stack - Stack trace
 * @returns {string} Truncated stack trace
 */
function truncateStack(stack) {
  if (typeof stack !== 'string') return '';
  
  // Limit to first 30 lines and 4KB
  const lines = stack.split('\n').slice(0, 30);
  const joined = lines.join('\n');
  
  return truncateString(joined, MAX_STRING_LENGTHS.stack);
}

/**
 * Validate and normalize error payload
 * @param {Object} payload - Raw payload from request
 * @returns {Object} { valid: boolean, normalized?: Object, errors?: Array }
 */
function validateErrorPayload(payload) {
  const errors = [];
  const normalized = {};
  
  // Required: message
  if (typeof payload.message !== 'string' || !payload.message.trim()) {
    errors.push('error payload: message is required and must be a non-empty string');
  } else {
    normalized.message = sanitizeText(truncateString(payload.message.trim(), MAX_STRING_LENGTHS.message));
  }
  
  // Optional: name
  if (payload.name !== undefined) {
    normalized.name = sanitizeText(truncateString(String(payload.name), MAX_STRING_LENGTHS.name));
  }
  
  // Optional: stack
  if (payload.stack !== undefined) {
    normalized.stack = truncateStack(payload.stack);
  }
  
  // Optional: source
  if (payload.source !== undefined) {
    normalized.source = sanitizeText(truncateString(String(payload.source), MAX_STRING_LENGTHS.source));
  }
  
  // Optional: lineno, colno (should be numbers if present)
  if (payload.lineno !== undefined) {
    const lineno = parseInt(payload.lineno, 10);
    if (!isNaN(lineno) && lineno >= 0) {
      normalized.lineno = lineno;
    }
  }
  
  if (payload.colno !== undefined) {
    const colno = parseInt(payload.colno, 10);
    if (!isNaN(colno) && colno >= 0) {
      normalized.colno = colno;
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return { valid: true, normalized };
}

/**
 * Validate and normalize metric payload
 * @param {Object} payload - Raw payload from request
 * @returns {Object} { valid: boolean, normalized?: Object, errors?: Array }
 */
function validateMetricPayload(payload) {
  const errors = [];
  const normalized = {};
  
  // Required: name
  if (typeof payload.name !== 'string' || !payload.name.trim()) {
    errors.push('metric payload: name is required and must be a non-empty string');
  } else {
    normalized.name = truncateString(payload.name.trim(), MAX_STRING_LENGTHS.metricName);
  }
  
  // Required: durationMs
  if (typeof payload.durationMs !== 'number' || payload.durationMs < 0) {
    errors.push('metric payload: durationMs is required and must be a non-negative number');
  } else {
    normalized.durationMs = Math.round(payload.durationMs);
  }
  
  // Optional: detail
  if (payload.detail !== undefined) {
    normalized.detail = sanitizeText(truncateString(String(payload.detail), MAX_STRING_LENGTHS.detail));
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return { valid: true, normalized };
}

/**
 * Validate telemetry event
 * @param {Object} data - Parsed request body
 * @param {Object} event - Netlify function event
 * @returns {Object} { valid: boolean, normalized?: Object, errors?: Array }
 */
function validateTelemetryEvent(data, event) {
  const errors = [];
  const normalized = {};
  
  // Validate type
  if (!data.type || !['error', 'metric'].includes(data.type)) {
    errors.push('type must be "error" or "metric"');
    return { valid: false, errors };
  }
  normalized.type = data.type;
  
  // Validate or derive clientId
  if (data.clientId && typeof data.clientId === 'string') {
    // Basic UUID v4 validation
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.clientId)) {
      normalized.clientId = data.clientId;
    } else {
      errors.push('clientId must be a valid UUID v4');
    }
  } else {
    // Try to derive from X-Client-Request-Id header
    const headerClientId = event.headers['x-client-request-id'] || event.headers['X-Client-Request-Id'];
    if (headerClientId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(headerClientId)) {
      normalized.clientId = headerClientId;
    } else {
      normalized.clientId = null; // Optional
    }
  }
  
  // Validate page
  if (typeof data.page !== 'string' || !data.page.trim()) {
    errors.push('page is required and must be a non-empty string');
  } else {
    normalized.page = truncateString(data.page.trim(), MAX_STRING_LENGTHS.page);
  }
  
  // Validate timestamp
  if (typeof data.ts !== 'number') {
    errors.push('ts (timestamp) is required and must be a number (epoch ms)');
  } else {
    const now = Date.now();
    const diff = Math.abs(now - data.ts);
    const dayMs = 24 * 60 * 60 * 1000;
    
    if (diff > dayMs) {
      errors.push('ts (timestamp) must be within +/- 24 hours of server time');
    } else {
      normalized.ts = data.ts;
    }
  }
  
  // Validate payload based on type
  if (!data.payload || typeof data.payload !== 'object') {
    errors.push('payload is required and must be an object');
  } else {
    let payloadResult;
    if (normalized.type === 'error') {
      payloadResult = validateErrorPayload(data.payload);
    } else {
      payloadResult = validateMetricPayload(data.payload);
    }
    
    if (!payloadResult.valid) {
      errors.push(...payloadResult.errors);
    } else {
      normalized.payload = payloadResult.normalized;
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return { valid: true, normalized };
}

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
  const bodySizeCheck = validateBodySize(event.body, MAX_PAYLOAD_SIZE_KB);
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

  // Extract client request ID from header
  const clientRequestId = event.headers['x-client-request-id'] || event.headers['X-Client-Request-Id'] || null;
  if (clientRequestId) {
    console.log(`[client-error] [${requestId}] Client Request ID: ${clientRequestId}`);
  }

  // Validate telemetry event
  const validation = validateTelemetryEvent(data, event);
  if (!validation.valid) {
    console.log(`[client-error] [${requestId}] Validation failed: ${validation.errors.join('; ')}`);
    return jsonResponse(event, 400, { error: 'Validation failed', details: validation.errors }, {}, requestId);
  }

  const normalized = validation.normalized;

  // Check throttle
  const throttle = checkThrottle(event, normalized.clientId);
  
  if (throttle.throttled) {
    console.log(`[client-error] [${requestId}] Throttled (count: ${throttle.count})`);
    
    // Add fixed delay on rejection
    await new Promise(resolve => setTimeout(resolve, REJECTION_DELAY_MS));
    
    const securityHeaders = getSecurityHeaders(requestId);
    const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type', 'X-Client-Request-Id']);
    
    return {
      statusCode: 429,
      headers: {
        ...securityHeaders,
        ...corsHeaders,
        'Set-Cookie': throttle.cookie,
      },
      body: JSON.stringify({ error: 'Too many telemetry events. Please wait a moment.' }),
    };
  }

  // Log the telemetry event
  console.log(`[client-error] [${requestId}] Telemetry event received:`);
  console.log(`[client-error] [${requestId}]   type: ${normalized.type}`);
  console.log(`[client-error] [${requestId}]   page: ${normalized.page}`);
  console.log(`[client-error] [${requestId}]   clientId: ${normalized.clientId || 'N/A'}`);
  console.log(`[client-error] [${requestId}]   ts: ${new Date(normalized.ts).toISOString()}`);
  
  if (normalized.type === 'error') {
    console.log(`[client-error] [${requestId}]   error.message: ${normalized.payload.message}`);
    console.log(`[client-error] [${requestId}]   error.name: ${normalized.payload.name || 'N/A'}`);
    console.log(`[client-error] [${requestId}]   error.source: ${normalized.payload.source || 'N/A'}`);
    if (normalized.payload.stack) {
      console.log(`[client-error] [${requestId}]   error.stack: ${normalized.payload.stack.substring(0, 200)}...`);
    }
  } else if (normalized.type === 'metric') {
    console.log(`[client-error] [${requestId}]   metric.name: ${normalized.payload.name}`);
    console.log(`[client-error] [${requestId}]   metric.durationMs: ${normalized.payload.durationMs}`);
    if (normalized.payload.detail) {
      console.log(`[client-error] [${requestId}]   metric.detail: ${normalized.payload.detail}`);
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
      'Set-Cookie': throttle.cookie,
    },
    body: '',
  };
};
