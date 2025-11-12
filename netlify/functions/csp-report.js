// CSP Report Collector
// Receives Content-Security-Policy violation reports from browsers
// Logs violations with correlation IDs for debugging

console.log('[csp-report] Module loaded successfully');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

// Maximum size for CSP report payloads (25KB)
const MAX_REPORT_SIZE_KB = 25;

/**
 * Netlify function handler for CSP violation reports
 * @param {Object} event - Netlify function event
 * @returns {Object} Response object
 */
exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[csp-report] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log(`[csp-report] [${requestId}] Handling CORS preflight`);
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[csp-report] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Validate Content-Type (CSP reports can be application/csp-report or application/json)
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json') && !contentType.includes('application/csp-report')) {
    console.log(`[csp-report] [${requestId}] Invalid Content-Type: ${contentType}`);
    return jsonResponse(event, 400, { error: 'Content-Type must be application/json or application/csp-report' }, {}, requestId);
  }

  // Validate body size (≤25KB)
  const bodySizeCheck = validateBodySize(event.body, MAX_REPORT_SIZE_KB);
  if (!bodySizeCheck.valid) {
    console.log(`[csp-report] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { error: 'Request body too large' }, {}, requestId);
  }

  // Parse JSON safely
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[csp-report] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const report = parseResult.data;

  // Extract client request ID if present
  const clientRequestId = event.headers['x-client-request-id'] || event.headers['X-Client-Request-Id'] || null;
  if (clientRequestId) {
    console.log(`[csp-report] [${requestId}] Client Request ID: ${clientRequestId}`);
  }

  // Log the CSP violation (safely, without echoing sensitive data)
  try {
    // Standard CSP report format has a 'csp-report' wrapper
    const violation = report['csp-report'] || report;
    
    console.log(`[csp-report] [${requestId}] CSP Violation Report:`);
    console.log(`[csp-report] [${requestId}]   document-uri: ${violation['document-uri'] || 'N/A'}`);
    console.log(`[csp-report] [${requestId}]   violated-directive: ${violation['violated-directive'] || 'N/A'}`);
    console.log(`[csp-report] [${requestId}]   effective-directive: ${violation['effective-directive'] || 'N/A'}`);
    console.log(`[csp-report] [${requestId}]   blocked-uri: ${violation['blocked-uri'] || 'N/A'}`);
    console.log(`[csp-report] [${requestId}]   source-file: ${violation['source-file'] || 'N/A'}`);
    console.log(`[csp-report] [${requestId}]   line-number: ${violation['line-number'] || 'N/A'}`);
    console.log(`[csp-report] [${requestId}]   column-number: ${violation['column-number'] || 'N/A'}`);
    console.log(`[csp-report] [${requestId}]   original-policy: ${violation['original-policy'] ? '[present]' : 'N/A'}`);
  } catch (err) {
    console.error(`[csp-report] [${requestId}] Error processing report: ${err.message}`);
  }

  // Return 204 No Content (standard for CSP reports)
  const securityHeaders = getSecurityHeaders(requestId);
  const corsHeaders = getCorsHeaders(event, ['POST', 'OPTIONS'], ['Content-Type']);

  return {
    statusCode: 204,
    headers: {
      ...securityHeaders,
      ...corsHeaders,
    },
    body: '',
  };
};
