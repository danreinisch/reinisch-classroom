'use strict';

// Teacher assignment-instance marker reader.
//
// POST /.netlify/functions/teacher-assignment-instance-markers
// Body: { instance_ids: [uuid, ...] }
//
// Authorization:
//   signed Teacher Center session
//   -> signed teacherId
//   -> requested assignment_instance
//   -> assignment.class_id
//   -> classes.teacher_id == signed teacherId
//
// Deliberately does NOT require an active class_enrollment or current
// school year. This endpoint exists to classify preserved historical
// progress/evidence provenance as instructional vs non-instructional.
//
// The endpoint fails closed unless every requested instance can be
// resolved and authorized.

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  safeJsonParse,
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
  SESSION_SECRET,
} = process.env;

const MAX_INSTANCE_IDS = 5000;

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

async function readRows(response, label) {
  if (!response || !response.ok) {
    const status =
      response && response.status
        ? response.status
        : 'unknown';

    throw new Error(
      `${label} failed: ${status}`
    );
  }

  const rows =
    await response.json();

  if (!Array.isArray(rows)) {
    throw new Error(
      `${label} returned a non-array response`
    );
  }

  return rows;
}

function unavailable(
  event,
  requestId
) {
  return jsonResponse(
    event,
    404,
    {
      ok: false,
      error: 'Marker state unavailable',
    },
    {
      'Cache-Control': 'no-store',
    },
    requestId
  );
}

exports.handler = async (event) => {
  const requestId =
    generateRequestId();

  if (
    event.httpMethod === 'OPTIONS'
  ) {
    return handleCorsPreFlight(
      event,
      ['POST', 'OPTIONS'],
      ['Content-Type']
    );
  }

  if (
    event.httpMethod !== 'POST'
  ) {
    return jsonResponse(
      event,
      405,
      {
        ok: false,
        error: 'Method Not Allowed',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
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
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  const authResult =
    requireTeacher(
      event,
      SESSION_SECRET
    );

  if (!authResult.ok) {
    return jsonResponse(
      event,
      401,
      {
        ok: false,
        error: 'Unauthorized',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  const teacherId =
    authResult.user &&
    authResult.user.teacherId;

  if (!isUuid(teacherId)) {
    return jsonResponse(
      event,
      403,
      {
        ok: false,
        error: 'Forbidden',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
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
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  const parsed =
    safeJsonParse(event.body);

  if (!parsed.ok) {
    return jsonResponse(
      event,
      400,
      {
        ok: false,
        error: 'Invalid JSON',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  const rawIds =
    parsed.data &&
    parsed.data.instance_ids;

  if (!Array.isArray(rawIds)) {
    return jsonResponse(
      event,
      400,
      {
        ok: false,
        error: 'instance_ids must be an array',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  if (
    rawIds.length >
    MAX_INSTANCE_IDS
  ) {
    return jsonResponse(
      event,
      400,
      {
        ok: false,
        error: 'Too many instance_ids',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  const instanceIds =
    [
      ...new Set(
        rawIds.map((value) =>
          typeof value === 'string'
            ? value.trim()
            : value
        )
      ),
    ];

  if (
    instanceIds.some(
      (id) => !isUuid(id)
    )
  ) {
    return jsonResponse(
      event,
      400,
      {
        ok: false,
        error: 'instance_ids must contain only UUIDs',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  if (
    instanceIds.length === 0
  ) {
    return jsonResponse(
      event,
      200,
      {
        ok: true,
        markers: [],
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  try {
    // 1. Resolve every requested instance. No school-year filter is
    // applied because historical evidence provenance must remain valid.
    const instances =
      await readRows(
        await rest(
          '/rest/v1/assignment_instances' +
          '?select=id,assignment_id,settings' +
          `&id=in.(${instanceIds.map(encodeURIComponent).join(',')})`
        ),
        'Assignment-instance marker query'
      );

    const instanceById =
      new Map();

    for (const row of instances) {
      if (
        !row ||
        !isUuid(row.id) ||
        row.assignment_id === null ||
        row.assignment_id === undefined
      ) {
        continue;
      }

      instanceById.set(
        row.id,
        row
      );
    }

    if (
      instanceById.size !==
      instanceIds.length ||
      instanceIds.some(
        (id) =>
          !instanceById.has(id)
      )
    ) {
      return unavailable(
        event,
        requestId
      );
    }

    // 2. Resolve each instance's canonical assignment -> class.
    const assignmentIds =
      [
        ...new Set(
          instances.map(
            (row) =>
              String(
                row.assignment_id
              ).trim()
          )
        ),
      ];

    const assignments =
      await readRows(
        await rest(
          '/rest/v1/assignments' +
          '?select=id,class_id' +
          `&id=in.(${assignmentIds.map(encodeURIComponent).join(',')})`
        ),
        'Assignment marker authorization query'
      );

    const assignmentClassById =
      new Map();

    for (const row of assignments) {
      const assignmentId =
        row &&
        row.id !== null &&
        row.id !== undefined
          ? String(row.id).trim()
          : '';

      const classId =
        row &&
        row.class_id;

      if (
        assignmentId &&
        isUuid(classId)
      ) {
        assignmentClassById.set(
          assignmentId,
          classId
        );
      }
    }

    if (
      assignmentClassById.size !==
      assignmentIds.length ||
      assignmentIds.some(
        (id) =>
          !assignmentClassById.has(id)
      )
    ) {
      return unavailable(
        event,
        requestId
      );
    }

    // 3. Authorize the canonical classes against the signed teacherId.
    const classIds =
      [
        ...new Set(
          [
            ...assignmentClassById.values(),
          ]
        ),
      ];

    const ownedClasses =
      await readRows(
        await rest(
          '/rest/v1/classes' +
          '?select=id' +
          `&id=in.(${classIds.map(encodeURIComponent).join(',')})` +
          `&teacher_id=eq.${encodeURIComponent(teacherId)}`
        ),
        'Class marker authorization query'
      );

    const ownedClassIds =
      new Set(
        ownedClasses
          .map(
            (row) =>
              row &&
              row.id
          )
          .filter(isUuid)
      );

    if (
      ownedClassIds.size !==
      classIds.length ||
      classIds.some(
        (id) =>
          !ownedClassIds.has(id)
      )
    ) {
      return unavailable(
        event,
        requestId
      );
    }

    // Every requested instance is now resolved through an assignment
    // attached to a class owned by the signed teacher.
    const markers =
      instanceIds.map((id) => {
        const row =
          instanceById.get(id);

        return {
          id,
          non_instructional:
            Boolean(
              row &&
              row.settings &&
              row.settings.non_instructional === true
            ),
        };
      });

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        markers,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  } catch (error) {
    console.error(
      `[teacher-assignment-instance-markers] [${requestId}]`,
      error
    );

    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error: 'Marker lookup failed',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }
};
