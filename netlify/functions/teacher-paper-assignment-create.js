'use strict';

// Signed Teacher Center paper-assignment creator.
//
// Scope:
//   Remote Library "Upload Paper Assignment" creation only.
//
// Security boundary:
//   signed teacherId
//     -> exact requested class name
//     -> classes.teacher_id == signed teacherId
//     -> canonical class UUID
//     -> canonical numeric assignments row
//
// The browser may request a class NAME from the existing picker.
// It may not supply or authorize class_id, assignment type, series,
// school year, or teacher ownership.
//
// No authorization fallback:
//   - no unscoped class-name lookup
//   - no class adoption
//   - no auto-create class
//   - no series-based authorization
//   - no lookupActiveTeacherId()
//   - no is_teacher_of()

const {
  generateRequestId,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  requireTeacher,
} = require('./_lib/auth');

const {
  rest,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = require('./_lib/supa');

const {
  getCurrentSchoolYear,
} = require('./_lib/school-year');

const {
  SESSION_SECRET,
} = process.env;

const MAX_BODY_BYTES = 65536;
const MAX_TITLE_LENGTH = 500;
const MAX_CLASS_NAME_LENGTH = 200;
const MAX_PAGE_LENGTH = 4096;

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  );
}

function cleanRequiredText(
  value,
  maxLength
) {
  const text =
    typeof value === 'string'
      ? value.trim()
      : '';

  if (
    !text ||
    text.length > maxLength
  ) {
    return null;
  }

  return text;
}

function normalizeMeta(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return {};
  }

  if (
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value;
}

function response(
  statusCode,
  requestId,
  payload
) {
  return {
    statusCode,
    headers: {
      'Content-Type':
        'application/json; charset=utf-8',
      'Cache-Control':
        'no-store',
      'X-Request-Id':
        requestId,
    },
    body:
      JSON.stringify(payload),
  };
}

function fail(
  requestId,
  statusCode,
  error
) {
  return response(
    statusCode,
    requestId,
    {
      ok: false,
      error,
    }
  );
}

async function readRows(
  restResponse,
  label
) {
  if (
    !restResponse ||
    restResponse.ok !== true
  ) {
    const status =
      restResponse &&
      Number.isInteger(restResponse.status)
        ? restResponse.status
        : 0;

    let detail = '';

    if (
      restResponse &&
      typeof restResponse.text === 'function'
    ) {
      detail =
        await restResponse
          .text()
          .catch(() => '');
    }

    throw new Error(
      `${label} failed: ${status}` +
      (
        detail
          ? ` ${detail.slice(0, 160)}`
          : ''
      )
    );
  }

  const body =
    await restResponse
      .json()
      .catch(() => []);

  return Array.isArray(body)
    ? body
    : [];
}

exports.handler =
  async (event) => {
    const requestId =
      generateRequestId();

    if (event.httpMethod === 'OPTIONS') {
      return handleCorsPreFlight(
        event,
        ['POST', 'OPTIONS'],
        ['Content-Type']
      );
    }

    if (event.httpMethod !== 'POST') {
      return fail(
        requestId,
        405,
        'Method Not Allowed'
      );
    }

    if (!SESSION_SECRET) {
      return fail(
        requestId,
        500,
        'Server not configured'
      );
    }

    const teacherAuth =
      requireTeacher(
        event,
        SESSION_SECRET
      );

    if (!teacherAuth.ok) {
      return fail(
        requestId,
        401,
        'Unauthorized'
      );
    }

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return fail(
        requestId,
        503,
        'Service unavailable'
      );
    }

    const teacherId =
      teacherAuth.user &&
      teacherAuth.user.teacherId;

    if (!isUuid(teacherId)) {
      return fail(
        requestId,
        403,
        'Teacher identity unavailable'
      );
    }

    const rawBody =
      event.body || '';

    if (
      Buffer.byteLength(
        rawBody,
        'utf8'
      ) > MAX_BODY_BYTES
    ) {
      return fail(
        requestId,
        413,
        'Request body too large'
      );
    }

    let body;

    try {
      body =
        JSON.parse(
          rawBody || '{}'
        );
    } catch {
      return fail(
        requestId,
        400,
        'Invalid JSON'
      );
    }

    const title =
      cleanRequiredText(
        body.title,
        MAX_TITLE_LENGTH
      );

    const className =
      cleanRequiredText(
        body.className,
        MAX_CLASS_NAME_LENGTH
      );

    const page =
      cleanRequiredText(
        body.page,
        MAX_PAGE_LENGTH
      );

    const meta =
      normalizeMeta(
        body.meta
      );

    if (!title) {
      return fail(
        requestId,
        400,
        'Invalid title'
      );
    }

    if (!className) {
      return fail(
        requestId,
        400,
        'Invalid className'
      );
    }

    if (!page) {
      return fail(
        requestId,
        400,
        'Invalid page'
      );
    }

    if (meta === null) {
      return fail(
        requestId,
        400,
        'Invalid meta'
      );
    }

    const schoolYear =
      getCurrentSchoolYear();

    try {
      // Resolve the requested display name ONLY within classes
      // canonically owned by the signed teacher.
      const ownedClasses =
        await readRows(
          await rest(
            '/rest/v1/classes' +
            '?select=id,name,teacher_id' +
            `&name=eq.${encodeURIComponent(className)}` +
            `&teacher_id=eq.${encodeURIComponent(teacherId)}` +
            '&limit=2'
          ),
          'Owned class query'
        );

      if (
        ownedClasses.length !== 1 ||
        !isUuid(
          ownedClasses[0].id
        )
      ) {
        return fail(
          requestId,
          404,
          'Class not found'
        );
      }

      const classId =
        ownedClasses[0].id;

      const assignmentMeta = {
        ...meta,
        paper: true,
      };

      const assignmentPayload = {
        title,
        type: 'paper',
        series: className,
        page,
        meta: assignmentMeta,
        class_id: classId,
        school_year: schoolYear,
      };

      const created =
        await readRows(
          await rest(
            '/rest/v1/assignments' +
            '?select=id,title,type,series,page,meta,class_id,school_year',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
                Prefer:
                  'return=representation',
              },
              body:
                JSON.stringify(
                  assignmentPayload
                ),
            }
          ),
          'Paper assignment create'
        );

      if (
        created.length !== 1 ||
        created[0].class_id !== classId ||
        created[0].type !== 'paper'
      ) {
        throw new Error(
          'Paper assignment create returned unexpected representation'
        );
      }

      return response(
        201,
        requestId,
        {
          ok: true,
          assignment:
            created[0],
        }
      );
    } catch (error) {
      console.error(
        `[teacher-paper-assignment-create] [${requestId}]`,
        error
      );

      return fail(
        requestId,
        500,
        'Could not create paper assignment'
      );
    }
  };
