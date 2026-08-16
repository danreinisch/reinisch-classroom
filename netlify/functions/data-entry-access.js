// Public external IEP progress data-entry endpoint.
//
// The opaque URL token is the bearer credential. All student, goal,
// collector, and source fields are resolved on the server.
//
// GET:
//   /.netlify/functions/data-entry-access
//     ?token=...
//     &start_date=YYYY-MM-DD
//     &end_date=YYYY-MM-DD
//
// POST:
//   {
//     token,
//     date,
//     value,
//     notes?
//   }

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  getCurrentSchoolYear,
} = require('./_lib/school-year');

const {
  url: SUPABASE_URL,
  key: SUPABASE_SERVICE_ROLE_KEY,
} = getSupabaseConfig();

const TOKEN_PATTERN =
  /^[A-Za-z0-9_-]{16,128}$/;

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const MAX_RANGE_DAYS = 140;
const MAX_NOTES_LENGTH = 1000;

function validToken(value) {
  return (
    typeof value === 'string' &&
    TOKEN_PATTERN.test(value.trim())
  );
}

function validDateString(value) {
  if (
    typeof value !== 'string' ||
    !DATE_PATTERN.test(value)
  ) {
    return false;
  }

  const date =
    new Date(
      `${value}T12:00:00Z`,
    );

  return (
    !Number.isNaN(date.getTime()) &&
    date
      .toISOString()
      .slice(0, 10) === value
  );
}

function dateRangeIsValid(startDate, endDate) {
  if (!startDate && !endDate) {
    return true;
  }

  if (
    !validDateString(startDate) ||
    !validDateString(endDate)
  ) {
    return false;
  }

  const start =
    new Date(
      `${startDate}T12:00:00Z`,
    );

  const end =
    new Date(
      `${endDate}T12:00:00Z`,
    );

  const days =
    (
      end.getTime() -
      start.getTime()
    ) /
    (
      24 *
      60 *
      60 *
      1000
    );

  return (
    days >= 0 &&
    days <= MAX_RANGE_DAYS
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

  const text =
    await response.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch (_) {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function tokenIsActive(row) {
  if (
    !row ||
    row.revoked === true
  ) {
    return false;
  }

  if (!row.expires_at) {
    return true;
  }

  const expiresAt =
    new Date(
      row.expires_at,
    );

  return (
    !Number.isNaN(
      expiresAt.getTime(),
    ) &&
    expiresAt.getTime() >
      Date.now()
  );
}

async function resolveTokenContext(rawToken) {
  const token =
    rawToken.trim();

  const tokenResponse =
    await supaFetch(
      `/rest/v1/data_entry_tokens` +
      `?select=id,student_code,goal_code,data_collector,expires_at,revoked` +
      `&token=eq.${encodeURIComponent(token)}` +
      `&revoked=eq.false` +
      `&limit=1`,
    );

  if (
    !tokenResponse.ok ||
    !Array.isArray(tokenResponse.data)
  ) {
    throw new Error(
      'Token lookup failed',
    );
  }

  const tokenRow =
    tokenResponse.data[0] ||
    null;

  if (!tokenIsActive(tokenRow)) {
    return null;
  }

  const studentResponse =
    await supaFetch(
      `/rest/v1/students` +
      `?select=id,code` +
      `&code=eq.${encodeURIComponent(tokenRow.student_code)}` +
      `&limit=1`,
    );

  if (
    !studentResponse.ok ||
    !Array.isArray(studentResponse.data)
  ) {
    throw new Error(
      'Student lookup failed',
    );
  }

  const student =
    studentResponse.data[0] ||
    null;

  if (!student) {
    return null;
  }

  const goalResponse =
    await supaFetch(
      `/rest/v1/goals` +
      `?select=id,code,desc,goal_area,measurement_type,student_id` +
      `&student_id=eq.${encodeURIComponent(student.id)}` +
      `&code=eq.${encodeURIComponent(tokenRow.goal_code)}` +
      // A token fails closed when its goal has been retired, even when
      // the token itself has not expired or been explicitly revoked.
      `&active=eq.true` +
      `&or=(status.is.null,status.not.in.(closed,archived,Closed,Archived))` +
      `&limit=1`,
    );

  if (
    !goalResponse.ok ||
    !Array.isArray(goalResponse.data)
  ) {
    throw new Error(
      'Goal lookup failed',
    );
  }

  const goal =
    goalResponse.data[0] ||
    null;

  if (!goal) {
    return null;
  }

  return {
    token: tokenRow,
    student,
    goal,
  };
}

function unavailableResponse(
  event,
  requestId,
) {
  return jsonResponse(
    event,
    404,
    {
      ok: false,
      error:
        'This data-entry link is unavailable',
    },
    {},
    requestId,
  );
}

async function loadProgress(
  context,
  startDate,
  endDate,
) {
  if (!startDate && !endDate) {
    return [];
  }

  const path =
    `/rest/v1/goal_progress` +
    `?select=id,date,value,source,collected_by,created_at` +
    `&goal_id=eq.${encodeURIComponent(context.goal.id)}` +
    `&student_id=eq.${encodeURIComponent(context.student.id)}` +
    `&date=gte.${encodeURIComponent(startDate)}` +
    `&date=lte.${encodeURIComponent(endDate)}` +
    `&order=date.desc`;

  const response =
    await supaFetch(path);

  if (
    !response.ok ||
    !Array.isArray(response.data)
  ) {
    throw new Error(
      'Progress lookup failed',
    );
  }

  return response.data;
}

async function insertProgress(
  context,
  {
    date,
    value,
    notes,
  },
) {
  const dateObject =
    new Date(
      `${date}T12:00:00Z`,
    );

  const baseRecord = {
    goal_id: context.goal.id,
    student_id: context.student.id,
    date,
    value,
    source: 'external',
    collected_by:
      context.token.data_collector ||
      'External',
    school_year:
      getCurrentSchoolYear(
        dateObject,
      ),
  };

  const cleanNotes =
    typeof notes === 'string'
      ? notes.trim().slice(
          0,
          MAX_NOTES_LENGTH,
        )
      : '';

  const firstRecord = {
    ...baseRecord,
    ...(cleanNotes
      ? {
          notes: cleanNotes,
        }
      : {}),
  };

  let response =
    await supaFetch(
      '/rest/v1/goal_progress',
      {
        method: 'POST',
        headers: {
          Prefer:
            'return=representation',
        },
        body:
          JSON.stringify(
            firstRecord,
          ),
      },
    );

  let notesSaved =
    Boolean(cleanNotes);

  if (
    !response.ok &&
    cleanNotes &&
    response.status === 400
  ) {
    const detail =
      typeof response.data === 'string'
        ? response.data
        : JSON.stringify(
            response.data || {},
          );

    if (
      /notes/i.test(detail) &&
      (
        /column/i.test(detail) ||
        /schema/i.test(detail) ||
        /pgrst/i.test(detail) ||
        /42703/i.test(detail)
      )
    ) {
      response =
        await supaFetch(
          '/rest/v1/goal_progress',
          {
            method: 'POST',
            headers: {
              Prefer:
                'return=representation',
            },
            body:
              JSON.stringify(
                baseRecord,
              ),
          },
        );

      notesSaved = false;
    }
  }

  if (
    !response.ok ||
    !Array.isArray(response.data) ||
    !response.data[0]
  ) {
    throw new Error(
      `Progress insert failed with status ${response.status}`,
    );
  }

  return {
    progress: response.data[0],
    notes_saved: notesSaved,
  };
}

exports.handler = async function handler(event) {
  const requestId =
    generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(
      event,
      ['GET', 'POST', 'OPTIONS'],
      ['Content-Type'],
    );
  }

  if (
    event.httpMethod !== 'GET' &&
    event.httpMethod !== 'POST'
  ) {
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

  try {
    if (event.httpMethod === 'GET') {
      const params =
        event.queryStringParameters ||
        {};

      const token =
        typeof params.token === 'string'
          ? params.token.trim()
          : '';

      const startDate =
        params.start_date || '';

      const endDate =
        params.end_date || '';

      if (!validToken(token)) {
        return unavailableResponse(
          event,
          requestId,
        );
      }

      if (
        !dateRangeIsValid(
          startDate,
          endDate,
        )
      ) {
        return jsonResponse(
          event,
          400,
          {
            ok: false,
            error:
              'Invalid progress date range',
          },
          {},
          requestId,
        );
      }

      const context =
        await resolveTokenContext(
          token,
        );

      if (!context) {
        return unavailableResponse(
          event,
          requestId,
        );
      }

      const progress =
        await loadProgress(
          context,
          startDate,
          endDate,
        );

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          token: {
            student_code:
              context.token.student_code,
            goal_code:
              context.token.goal_code,
            data_collector:
              context.token.data_collector ||
              null,
          },
          student: {
            code:
              context.student.code,
          },
          goal: {
            code:
              context.goal.code,
            desc:
              context.goal.desc ||
              '',
            goal_area:
              context.goal.goal_area ||
              'Uncategorized',
            measurement_type:
              context.goal.measurement_type ||
              'percent',
          },
          progress,
        },
        {},
        requestId,
      );
    }

    const contentType =
      event.headers?.['content-type'] ||
      event.headers?.['Content-Type'] ||
      '';

    if (
      !contentType.includes(
        'application/json',
      )
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Content-Type must be application/json',
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
          error:
            'Request body too large',
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

    const token =
      typeof body.token === 'string'
        ? body.token.trim()
        : '';

    if (!validToken(token)) {
      return unavailableResponse(
        event,
        requestId,
      );
    }

    if (!validDateString(body.date)) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'date must use YYYY-MM-DD',
        },
        {},
        requestId,
      );
    }

    const value =
      Number(body.value);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'value must be between 0 and 100',
        },
        {},
        requestId,
      );
    }

    if (
      body.notes !== undefined &&
      body.notes !== null &&
      typeof body.notes !== 'string'
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'notes must be a string',
        },
        {},
        requestId,
      );
    }

    if (
      typeof body.notes === 'string' &&
      body.notes.length >
        MAX_NOTES_LENGTH
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            `notes must be ${MAX_NOTES_LENGTH} characters or fewer`,
        },
        {},
        requestId,
      );
    }

    const context =
      await resolveTokenContext(
        token,
      );

    if (!context) {
      return unavailableResponse(
        event,
        requestId,
      );
    }

    const inserted =
      await insertProgress(
        context,
        {
          date: body.date,
          value:
            Math.round(
              value * 100,
            ) / 100,
          notes:
            body.notes || '',
        },
      );

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        ...inserted,
      },
      {},
      requestId,
    );
  } catch (error) {
    console.error(
      `[data-entry-access] [${requestId}]`,
      error,
    );

    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error:
          'Data-entry service failed',
      },
      {},
      requestId,
    );
  }
};
