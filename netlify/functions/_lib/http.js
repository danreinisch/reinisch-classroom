// Shared HTTP helpers for Netlify Functions
// Provides security headers, CORS, and response utilities
const crypto = require('crypto');

// Local dev origins for CORS (explicit)
const LOCAL_TRUSTED_ORIGINS = [
  'http://localhost:8888',
  'http://localhost:3000',
  'http://127.0.0.1:8888',
  'http://127.0.0.1:3000',
];
// Default security headers used across all responses
const DEFAULT_SEC_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'X-Frame-Options': 'SAMEORIGIN',
};


function getRequestOrigin(event) {
  const headers = (event && event.headers) || {};
  const protoRaw = headers['x-forwarded-proto'] || headers['X-Forwarded-Proto'] || 'https';
  const hostRaw = headers['x-forwarded-host'] || headers['X-Forwarded-Host'] || headers.host || headers.Host || '';
  const proto = String(protoRaw).split(',')[0].trim() || 'https';
  const host = String(hostRaw).split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

function getEnvSiteOrigins() {
  const out = new Set();
  const candidates = [
    process.env.DEPLOY_PRIME_URL,
    process.env.DEPLOY_URL,
    process.env.URL,
    process.env.SITE_URL,
  ].filter(Boolean);

  for (const raw of candidates) {
    try {
      const u = new URL(raw);
      out.add(`${u.protocol}//${u.host}`);

      // If this is a custom domain, allow the www/apex sibling too.
      // Avoid generating nonsense like www.<site>.netlify.app.
      if (!u.hostname.endsWith('.netlify.app')) {
        if (u.hostname.startsWith('www.')) {
          out.add(`${u.protocol}//${u.host.replace(/^www\./, '')}`);
        } else {
          out.add(`${u.protocol}//www.${u.host}`);
        }
      }
    } catch (_) {
      // ignore invalid URL
    }
  }
  return out;
}
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
    ...DEFAULT_SEC_HEADERS,
    'Cache-Control': 'no-store',
  };
  
  if (requestId) {
    headers['X-Request-Id'] = requestId;
  }
  
  return headers;
}

/**
 * Check if request is asking for HTML content
 * @param {Object} event - Netlify function event object
 * @returns {boolean} True if request likely expects HTML
 */
function isHtmlRequest(event) {
  const accept = event.headers.accept || event.headers.Accept || '';
  return accept.includes('text/html');
}

/**
 * Safely merge headers, with later objects taking precedence
 * @param {...Object} headerObjects - Header objects to merge
 * @returns {Object} Merged headers object
 */
function mergeHeaders(...headerObjects) {
  return Object.assign({}, ...headerObjects);
}

/**
 * Build an HTML response with security headers and CORS
 * @param {Object} event - Netlify function event object
 * @param {number} status - HTTP status code
 * @param {string} body - HTML string
 * @param {Object} extraHeaders - Additional headers to include
 * @param {string} requestId - Optional request ID
 * @returns {Object} Netlify function response object
 */
function htmlResponse(event, status, body, extraHeaders = {}, requestId = null) {
  const securityHeaders = getSecurityHeaders(requestId);
  const corsHeaders = getCorsHeaders(event);
  
  return {
    statusCode: status,
    headers: mergeHeaders(
      securityHeaders,
      corsHeaders,
      { 'Content-Type': 'text/html; charset=utf-8' },
      extraHeaders
    ),
    body,
  };
}

/**
 * Check if origin is allowed based on CORS policy
 * Allows:
 * - Trusted origins (production domain, localhost dev ports)
 * - Netlify Deploy Preview origins (*.netlify.app)
 * @param {string} origin - Origin header from request
 * @returns {boolean} True if origin is allowed
 */
function isOriginAllowed(origin, event) {
  if (!origin) return false;

  // Local dev
  if (LOCAL_TRUSTED_ORIGINS.includes(origin)) {
    return true;
  }

  // Same-origin (deploy previews / branch deploys / custom domains)
  const reqOrigin = getRequestOrigin(event);
  if (reqOrigin && origin === reqOrigin) {
    return true;
  }

  // Env site origins (custom domain or netlify URL; includes www/apex sibling when applicable)
  const envOrigins = getEnvSiteOrigins();
  if (envOrigins.has(origin)) {
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
  if (isOriginAllowed(origin, event)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
    // When allowing credentials, we must set this header
    corsHeaders['Access-Control-Allow-Credentials'] = 'true';
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
    headers: mergeHeaders(
      securityHeaders,
      corsHeaders,
      { 'Content-Type': 'application/json' },
      extraHeaders
    ),
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
    headers: mergeHeaders(securityHeaders, corsHeaders),
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
  DEFAULT_SEC_HEADERS,
  generateRequestId,
  getSecurityHeaders,
  getCorsHeaders,
  isOriginAllowed,
  isHtmlRequest,
  mergeHeaders,
  jsonResponse,
  htmlResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
  validateStringField,
  getRequestOrigin,
};
