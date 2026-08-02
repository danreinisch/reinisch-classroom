// Teacher-managed external data-entry token endpoint
// POST /.netlify/functions/teacher-data-entry-tokens
//
// Auth: teacher/admin session cookie
//
// Actions:
//   create { student_code, goal_code, data_collector?, data_collector_email? }
//   list   { student_code }
//   revoke { token_id }

const crypto = require('crypto');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const {
  requireTeacher,
} = require('./_lib/auth');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  url: SUPABASE_URL,
  key: SUPABASE_SERVICE_ROLE_KEY,
} = getSupabaseConfig();

const {
  SESSION_SECRET,
} = process.env;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeCode(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function normalizeOptionalString(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function tokenIsActive(tokenRow) {
  if (!tokenRow || tokenRow.revoked === true) {
    return false;
  }

  if (!tokenRow.expires_at) {
    return true;
  }

  const expiresAt = new Date(tokenRow.expires_at);
  const now = new Date();

  return (
    !Number.isNaN(expiresAt.getTime()) &&
    expiresAt.getTime() > now.getTime()
  );
}

async function supaFetch(path, init = {}) {
  const response = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...init,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    },
  );

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function findStudent(studentCode) {
  const response = await supaFetch(
    `/rest/v1/students` +
    `?select=id,code` +
    `&code=eq.${encodeURIComponent(studentCode)}` +
    `&limit=1`,
  );

  if (!response.ok) {
    throw new Error(
      `Student lookup failed with status ${response.status}`,
    );
  }

  return Array.isArray(response.data)
    ? response.data[0] || null
    : null;
}

async function findGoal(studentId, goalCode) {
  const response = await supaFetch(
    `/rest/v1/goals` +
    `?select=id,code,student_id` +
    `&student_id=eq.${encodeURIComponent(studentId)}` +
    `&code=eq.${encodeURIComponent(goalCode)}` +
    `&limit=1`,
  );

  if (!response.ok) {
    throw new Error(
      `Goal lookup failed with status ${response.status}`,
    );
  }

  return Array.isArray(response.data)
    ? response.data[0] || null
    : null;
}

async function findExistingTokens(studentCode, goalCode = null) {
  let path =
    `/rest/v1/data_entry_tokens` +
    `?select=id,token,student_code,goal_code,data_collector,` +
    `data_collector_email,created_by,created_at,expires_at,revoked` +
    `&student_code=eq.${encodeURIComponent(studentCode)}` +
    `&revoked=eq.false`;

  if (goalCode) {
    path +=
      `&goal_code=eq.${encodeURIComponent(goalCode)}`;
  }

  path += '&order=created_at.desc';

  const response = await supaFetch(path);

  if (!response.ok) {
    throw new Error(
      `Token lookup failed with status ${response.status}`,
    );
  }

  return Array.isArray(response.data)
    ? response.data
    : [];
}

exports.handler = async function handler(event) {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(
      event,
      ['POST', 'OPTIONS'],
      ['Content-Type'],
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
      requestId,
    );
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return jsonResponse(
      event,
      503,
      {
        ok: false,
        error: 'Service unavailable',
      },
      {},
      requestId,
    );
  }

  if (!SESSION_SECRET) {
    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error: 'Server not configured',
      },
      {},
      requestId,
    );
  }

  const authResult =
    requireTeacher(
      event,
      SESSION_SECRET,
    );

  if (!authResult.ok) {
    return jsonResponse(
      event,
      401,
      {
        ok: false,
        error: 'Unauthorized',
      },
      {},
      requestId,
    );
  }

  const contentType =
    event.headers?.['content-type'] ||
    event.headers?.['Content-Type'] ||
    '';

  if (!contentType.includes('application/json')) {
    return jsonResponse(
      event,
      400,
      {
        ok: false,
        error: 'Content-Type must be application/json',
      },
      {},
      requestId,
    );
  }

  const sizeCheck =
    validateBodySize(
      event.body,
      20,
    );

  if (!sizeCheck.valid) {
    return jsonResponse(
      event,
      413,
      {
        ok: false,
        error: 'Request body too large',
      },
      {},
      requestId,
    );
  }

  const parsed =
    safeJsonParse(
      event.body,
    );

  if (!parsed.ok) {
    return jsonResponse(
      event,
      400,
      {
        ok: false,
        error: 'Invalid JSON',
      },
      {},
      requestId,
    );
  }

  const body =
    parsed.data &&
    typeof parsed.data === 'object'
      ? parsed.data
      : {};

  const action =
    typeof body.action === 'string'
      ? body.action.trim().toLowerCase()
      : '';

  try {
    if (action === 'list') {
      const studentCode =
        normalizeCode(
          body.student_code,
        );

      if (!studentCode) {
        return jsonResponse(
          event,
          400,
          {
            ok: false,
            error: 'student_code is required',
          },
          {},
          requestId,
        );
      }

      const tokens =
        (
          await findExistingTokens(
            studentCode,
          )
        ).filter(tokenIsActive);

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          tokens,
        },
        {},
        requestId,
      );
    }

    if (action === 'create') {
      const studentCode =
        normalizeCode(
          body.student_code,
        );

      const goalCode =
        normalizeCode(
          body.goal_code,
        );

      if (!studentCode || !goalCode) {
        return jsonResponse(
          event,
          400,
          {
            ok: false,
            error:
              'student_code and goal_code are required',
          },
          {},
          requestId,
        );
      }

      const student =
        await findStudent(
          studentCode,
        );

      if (!student) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error: 'Student not found',
          },
          {},
          requestId,
        );
      }

      const goal =
        await findGoal(
          student.id,
          goalCode,
        );

      if (!goal) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error:
              'Goal not found for student',
          },
          {},
          requestId,
        );
      }

      const existingTokens =
        await findExistingTokens(
          studentCode,
          goalCode,
        );

      const existing =
        existingTokens.find(
          tokenIsActive,
        );

      if (existing) {
        return jsonResponse(
          event,
          200,
          {
            ok: true,
            token: existing,
            reused: true,
          },
          {},
          requestId,
        );
      }

      const token =
        crypto
          .randomBytes(16)
          .toString('hex');

      if (!TOKEN_PATTERN.test(token)) {
        throw new Error(
          'Generated token failed validation',
        );
      }

      const record = {
        token,
        student_code: studentCode,
        goal_code: goalCode,
        data_collector:
          normalizeOptionalString(
            body.data_collector,
            120,
          ),
        data_collector_email:
          normalizeOptionalString(
            body.data_collector_email,
            254,
          ),
        created_by:
          authResult.user?.username ||
          'teacher',
      };

      const insertResponse =
        await supaFetch(
          '/rest/v1/data_entry_tokens',
          {
            method: 'POST',
            headers: {
              Prefer:
                'return=representation',
            },
            body: JSON.stringify(record),
          },
        );

      if (
        !insertResponse.ok ||
        !Array.isArray(insertResponse.data) ||
        !insertResponse.data[0]
      ) {
        throw new Error(
          `Token creation failed with status ${insertResponse.status}`,
        );
      }

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          token: insertResponse.data[0],
          reused: false,
        },
        {},
        requestId,
      );
    }

    if (action === 'revoke') {
      const tokenId =
        typeof body.token_id === 'string'
          ? body.token_id.trim()
          : '';

      if (!UUID_PATTERN.test(tokenId)) {
        return jsonResponse(
          event,
          400,
          {
            ok: false,
            error:
              'token_id must be a valid UUID',
          },
          {},
          requestId,
        );
      }

      const revokeResponse =
        await supaFetch(
          `/rest/v1/data_entry_tokens` +
          `?id=eq.${encodeURIComponent(tokenId)}`,
          {
            method: 'PATCH',
            headers: {
              Prefer:
                'return=representation',
            },
            body: JSON.stringify({
              revoked: true,
            }),
          },
        );

      if (!revokeResponse.ok) {
        throw new Error(
          `Token revocation failed with status ${revokeResponse.status}`,
        );
      }

      const revoked =
        Array.isArray(revokeResponse.data)
          ? revokeResponse.data[0] || null
          : null;

      if (!revoked) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error: 'Token not found',
          },
          {},
          requestId,
        );
      }

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          revoked: true,
          token: revoked,
        },
        {},
        requestId,
      );
    }

    return jsonResponse(
      event,
      400,
      {
        ok: false,
        error: 'Unknown action',
      },
      {},
      requestId,
    );
  } catch (error) {
    console.error(
      `[teacher-data-entry-tokens] [${requestId}]`,
      error,
    );

    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error:
          'Data-entry token operation failed',
      },
      {},
      requestId,
    );
  }
};
