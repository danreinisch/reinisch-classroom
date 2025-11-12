// Shared HTTP helpers for Netlify Functions
// Provides security headers, CORS, and response utilities
const crypto = require('crypto');

// Trusted origins for CORS
const TRUSTED_ORIGINS = [
  'https://reinischclassroom.com',
  'https://www.reinischclassroom.com',
  'http://localhost:8888',
  'http://localhost:3000',
  'http://127.0.0.1:8888',
  'http://127.0.0.1:3000',
];

/**
 * Generate a unique request ID
 * @returns {string} UUID v4 format request ID
 */
function generateRequestId() {
  return crypto.randomUUID();
}

/**
 * Get default security headers for all responses
 * @param {string} requestId - Optional request ID to include in response
 * @returns {Object} Headers object with security settings
 */
function getSecurityHeaders(requestId) {
  const headers = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cache-Control': 'no-store',
  };
  
  if (requestId) {
    headers['X-Request-Id'] = requestId;
  }
  
  return headers;
}

/**
 * Check if origin is allowed based on CORS policy
 * Allows:
 * - Trusted origins (production domain, localhost dev ports)
 * - Netlify Deploy Preview origins (*.netlify.app)
 * @param {string} origin - Origin header from request
 * @returns {boolean} True if origin is allowed
 */
function isOriginAllowed(origin) {
  if (!origin) return false;
  
  // Check trusted origins
  if (TRUSTED_ORIGINS.includes(origin)) {
    return true;
  }
  
  // Allow Netlify deploy previews
  if (origin.match(/^https:\/\/[a-z0-9-]+\.netlify\.app$/)) {
    return true;
  }
  
  return false;
}

/**
 * Get CORS headers based on request origin
 * Echoes the origin if allowed (instead of "*") and sets Vary: Origin
 * @param {Object} event - Netlify function event object
 * @param {Array<string>} methods - Allowed HTTP methods (e.g., ['GET', 'POST'])
 * @param {Array<string>} headers - Allowed request headers
 * @returns {Object} CORS headers object
 */
function getCorsHeaders(event, methods = ['GET', 'POST', 'OPTIONS'], headers = ['Content-Type']) {
  const origin = event.headers.origin || event.headers.Origin || '';
  const corsHeaders = {
    'Access-Control-Allow-Methods': methods.join(', '),
    'Access-Control-Allow-Headers': headers.join(', '),
    'Vary': 'Origin',
  };
  
  // Only echo origin if it's allowed
  if (isOriginAllowed(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  }
  
  return corsHeaders;
}

/**
 * Build a JSON response with security headers and CORS
 * @param {Object} event - Netlify function event object
 * @param {number} status - HTTP status code
 * @param {Object} body - Response body (will be JSON stringified)
 * @param {Object} extraHeaders - Additional headers to include
 * @param {string} requestId - Optional request ID
 * @returns {Object} Netlify function response object
 */
function jsonResponse(event, status, body, extraHeaders = {}, requestId = null) {
  const securityHeaders = getSecurityHeaders(requestId);
  const corsHeaders = getCorsHeaders(event);
  
  return {
    statusCode: status,
    headers: {
      ...securityHeaders,
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Handle CORS preflight OPTIONS request
 * @param {Object} event - Netlify function event object
 * @param {Array<string>} methods - Allowed HTTP methods
 * @param {Array<string>} headers - Allowed request headers
 * @returns {Object} Netlify function response object with 200 status
 */
function handleCorsPreFlight(event, methods = ['GET', 'POST', 'OPTIONS'], headers = ['Content-Type']) {
  const corsHeaders = getCorsHeaders(event, methods, headers);
  const securityHeaders = getSecurityHeaders();
  
  return {
    statusCode: 200,
    headers: {
      ...securityHeaders,
      ...corsHeaders,
    },
    body: '',
  };
}

/**
 * Validate request body size
 * @param {string} body - Request body string
 * @param {number} maxSizeKB - Maximum size in kilobytes (default 10KB)
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateBodySize(body, maxSizeKB = 10) {
  if (!body) {
    return { valid: true };
  }
  
  const sizeBytes = Buffer.byteLength(body, 'utf8');
  const sizeKB = sizeBytes / 1024;
  
  if (sizeKB > maxSizeKB) {
    return {
      valid: false,
      error: `Request body too large (${sizeKB.toFixed(1)}KB, max ${maxSizeKB}KB)`,
    };
  }
  
  return { valid: true };
}

/**
 * Safe JSON parse with error handling
 * @param {string} body - JSON string to parse
 * @returns {Object} { ok: boolean, data?: Object, error?: string }
 */
function safeJsonParse(body) {
  if (!body) {
    return { ok: false, error: 'Empty request body' };
  }
  
  try {
    const data = JSON.parse(body);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: 'Invalid JSON' };
  }
}

/**
 * Validate string field requirements
 * @param {any} value - Value to validate
 * @param {string} fieldName - Name of the field (for error messages)
 * @param {number} minLength - Minimum length (default 1)
 * @param {number} maxLength - Maximum length (default 64)
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateStringField(value, fieldName, minLength = 1, maxLength = 64) {
  if (typeof value !== 'string') {
    return {
      valid: false,
      error: `${fieldName} must be a string`,
    };
  }
  
  if (value.length < minLength) {
    return {
      valid: false,
      error: `${fieldName} must be at least ${minLength} character(s)`,
    };
  }
  
  if (value.length > maxLength) {
    return {
      valid: false,
      error: `${fieldName} must be at most ${maxLength} characters`,
    };
  }
  
  return { valid: true };
}

module.exports = {
  generateRequestId,
  getSecurityHeaders,
  getCorsHeaders,
  isOriginAllowed,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
  validateStringField,
};
