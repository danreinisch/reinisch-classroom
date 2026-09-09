'use strict';

const {
  generateRequestId,
  getRequestOrigin,
  jsonResponse,
} = require('./_lib/http');
const { requireTeacher } = require('./_lib/auth');
const core = require('./_lib/teacher-week2-day4-residual-core');

const { SESSION_SECRET } = process.env;

function requestHost(event) {
  const origin = getRequestOrigin(event);
  if (!origin) return '';

  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function withNormalizedHost(event) {
  const host = requestHost(event);
  if (!host) return event;

  return {
    ...event,
    headers: {
      ...((event && event.headers) || {}),
      host,
      Host: host,
    },
  };
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') {
    return core.handler(event);
  }

  const requestId = generateRequestId();

  if (!SESSION_SECRET) {
    return jsonResponse(
      event,
      503,
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(
      event,
      401,
      { ok: false, error: 'Unauthorized' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  const teacherId = String(
    (authResult.user && authResult.user.teacherId) || ''
  ).trim();

  if (!teacherId) {
    return jsonResponse(
      event,
      403,
      {
        ok: false,
        error: 'Teacher session is missing teacherId. Sign in again.',
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  return core.handler(withNormalizedHost(event));
};

exports._test = {
  requestHost,
  withNormalizedHost,
};
