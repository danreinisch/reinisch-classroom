'use strict';

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

const {
  clearStudentSessionCookie,
} = require('./_lib/student-auth');

exports.handler = async (event) => {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(
      event,
      ['POST', 'OPTIONS'],
      ['Content-Type']
    );
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(
      event,
      405,
      {
        ok: false,
        error: 'Method Not Allowed',
      },
      {},
      requestId
    );
  }

  const host =
    event.headers?.host ||
    event.headers?.Host ||
    '';

  const isLocalhost =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1');

  const clearCookie =
    clearStudentSessionCookie({
      secure: !isLocalhost,
    });

  return {
    statusCode: 200,
    headers: {
      ...getSecurityHeaders(requestId),
      ...getCorsHeaders(
        event,
        ['POST', 'OPTIONS'],
        ['Content-Type']
      ),
      'Set-Cookie': clearCookie,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      ok: true,
    }),
  };
};
