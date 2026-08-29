'use strict';

/**
 * Slice 5D1 — Teacher manual / binder objective evidence.
 *
 * POST only.
 *
 * Browser sends public codes and the explicit manual measurement.
 * The server owns all UUID resolution, authorization, provenance,
 * school-year stamping, and objective evidence persistence.
 *
 * This endpoint does NOT:
 * - mutate parent progress
 * - touch academic grading
 * - use assignment provenance
 * - activate the objective registry
 * - reuse assignment objective writers
 */

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
} = require(
  './_lib/http'
);

const {
  requireTeacher,
} = require(
  './_lib/auth'
);

const {
  SESSION_SECRET,
} = process.env;

const {
  normalizeManualObjectiveRequest,
  schoolYearFromObjectiveDate,
  buildManualObjectiveEvidenceRow,
  projectManualObjectiveEvidenceResult,
} = require(
  './_lib/objective-manual-evidence-writer'
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/*
 * Canonical reads below use active=eq.true.
 * Keeping the literal contract visible makes fail-closed behavior auditable.
 */
const ACTIVE_FILTER =
  'eq.true';

function text(
  value,
  max = 4000
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value)
    .trim()
    .slice(
      0,
      max
    );
}

function config() {
  return {
    supabaseUrl:
      text(
        process.env.SUPABASE_URL,
        1000
      ).replace(
        /\/+$/,
        ''
      ),
    serviceRoleKey:
      text(
        process.env
          .SUPABASE_SERVICE_ROLE_KEY,
        10000
      ),
  };
}

class RestError extends Error {
  constructor(
    message,
    status,
    detail
  ) {
    super(message);

    this.status =
      status;

    this.detail =
      detail;
  }
}

function detailText(value) {
  if (
    typeof value === 'string'
  ) {
    return value;
  }

  try {
    return JSON.stringify(
      value
    );
  } catch (_error) {
    return '';
  }
}

function isSchemaUnavailable(
  error
) {
  const detail =
    (
      `${error?.message || ''} ` +
      `${detailText(error?.detail)}`
    )
      .toLowerCase();

  return (
    error?.status === 404 ||
    detail.includes(
      'pgrst205'
    ) ||
    detail.includes(
      '42p01'
    ) ||
    detail.includes(
      'schema cache'
    ) ||
    detail.includes(
      'does not exist'
    ) ||
    detail.includes(
      'could not find the table'
    )
  );
}

async function rest({
  resource,
  params = null,
  method = 'GET',
  body = null,
}) {
  const {
    supabaseUrl,
    serviceRoleKey,
  } = config();

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    throw new RestError(
      'Server database configuration unavailable',
      503,
      null
    );
  }

  const query =
    params
      ? `?${params.toString()}`
      : '';

  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/${resource}${query}`,
      {
        method,
        headers: {
          apikey:
            serviceRoleKey,
          Authorization:
            `Bearer ${serviceRoleKey}`,
          'Content-Type':
            'application/json',
          Accept:
            'application/json',
          ...(method === 'POST'
            ? {
                Prefer:
                  'return=representation',
              }
            : {}),
        },
        ...(body === null
          ? {}
          : {
              body:
                JSON.stringify(body),
            }),
      }
    );

  let result = null;

  try {
    result =
      await response.json();
  } catch (_error) {
    try {
      result =
        await response.text();
    } catch (_secondError) {
      result = null;
    }
  }

  if (!response.ok) {
    throw new RestError(
      `${resource} ${method} failed`,
      response.status,
      result
    );
  }

  return Array.isArray(result)
    ? result
    : [];
}

function unavailableResponse(
  event,
  requestId,
  reason
) {
  return jsonResponse(
    event,
    503,
    {
      ok: false,
      available: false,
      reason,
      error:
        'Objective evidence is not available yet',
    },
    {
      'Cache-Control':
        'no-store',
    },
    requestId
  );
}

async function resolveActiveStudent(
  studentCode
) {
  const params =
    new URLSearchParams();

  params.set(
    'select',
    'id,code,class_id,active,archived_at'
  );

  params.set(
    'code',
    `eq.${studentCode}`
  );

  params.set(
    'active',
    ACTIVE_FILTER
  );

  params.set(
    'archived_at',
    'is.null'
  );

  params.set(
    'limit',
    '1'
  );

  const rows =
    await rest({
      resource:
        'students',
      params,
    });

  return rows[0] || null;
}

async function resolveTeacherOwnedEnrollment({
  studentId,
  teacherId,
}) {
  const enrollmentParams =
    new URLSearchParams();

  enrollmentParams.set(
    'select',
    'class_id,student_id,active'
  );

  enrollmentParams.set(
    'student_id',
    `eq.${studentId}`
  );

  enrollmentParams.set(
    'active',
    ACTIVE_FILTER
  );

  const enrollments =
    await rest({
      resource:
        'class_enrollments',
      params:
        enrollmentParams,
    });

  const classIds =
    [
      ...new Set(
        enrollments
          .map(
            row =>
              row?.class_id
          )
          .filter(
            id =>
              UUID_PATTERN.test(
                id || ''
              )
          )
      ),
    ];

  if (classIds.length === 0) {
    return null;
  }

  const classParams =
    new URLSearchParams();

  classParams.set(
    'select',
    'id,teacher_id'
  );

  classParams.set(
    'id',
    `in.(${classIds.join(',')})`
  );

  classParams.set(
    'teacher_id',
    `eq.${teacherId}`
  );

  const owned =
    await rest({
      resource:
        'classes',
      params:
        classParams,
    });

  return (
    owned
      .map(
        row =>
          row?.id
      )
      .filter(Boolean)
      .sort()[0] ||
    null
  );
}

async function resolveActiveParentGoal({
  studentId,
  parentGoalCode,
}) {
  const params =
    new URLSearchParams();

  params.set(
    'select',
    'id,code,student_id,status,active,addressed_in_class,individual_delivery'
  );

  params.set(
    'student_id',
    `eq.${studentId}`
  );

  params.set(
    'code',
    `eq.${parentGoalCode}`
  );

  params.set(
    'active',
    ACTIVE_FILTER
  );

  params.set(
    'limit',
    '1'
  );

  const rows =
    await rest({
      resource:
        'goals',
      params,
    });

  const goal =
    rows[0];

  if (!goal) {
    return null;
  }

  const status =
    text(
      goal.status,
      50
    ).toLowerCase();

  if (
    status === 'closed' ||
    status === 'archived'
  ) {
    return null;
  }

  return goal;
}

async function resolveRegistryObjective({
  input,
  studentId,
  parentGoalId,
}) {
  const params =
    new URLSearchParams();

  params.set(
    'select',
    [
      'id',
      'student_id',
      'parent_goal_id',
      'student_code',
      'parent_goal_code',
      'code',
      'dan_monitoring_role',
      'active',
    ].join(',')
  );

  params.set(
    'student_id',
    `eq.${studentId}`
  );

  params.set(
    'parent_goal_id',
    `eq.${parentGoalId}`
  );

  params.set(
    'student_code',
    `eq.${input.student_code}`
  );

  params.set(
    'parent_goal_code',
    `eq.${input.parent_goal_code}`
  );

  params.set(
    'code',
    `eq.${input.objective_code}`
  );

  params.set(
    'active',
    ACTIVE_FILTER
  );

  params.set(
    'limit',
    '1'
  );

  const rows =
    await rest({
      resource:
        'goal_objectives',
      params,
    });

  return rows[0] || null;
}

async function insertManualObjectiveEvidence(
  row
) {
  const rows =
    await rest({
      resource:
        'objective_data_points',
      method:
        'POST',
      body:
        row,
    });

  return rows[0] || row;
}

function authFailureResponse(
  event,
  requestId,
  authResult
) {
  if (
    authResult &&
    authResult.response
  ) {
    return authResult.response;
  }

  if (
    authResult &&
    Number.isInteger(
      authResult.statusCode
    )
  ) {
    return authResult;
  }

  return jsonResponse(
    event,
    401,
    {
      ok: false,
      error:
        'Unauthorized',
    },
    {
      'Cache-Control':
        'no-store',
    },
    requestId
  );
}

exports.handler =
  async function handler(event) {
    const requestId =
      generateRequestId();

    if (
      event.httpMethod ===
      'OPTIONS'
    ) {
      return handleCorsPreFlight(
        event,
        [
          'POST',
          'OPTIONS',
        ],
        [
          'Content-Type',
        ]
      );
    }

    if (
      event.httpMethod !==
      'POST'
    ) {
      return jsonResponse(
        event,
        405,
        {
          ok: false,
          error:
            'Method Not Allowed',
        },
        {
          Allow:
            'POST, OPTIONS',
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    const authResult =
      await requireTeacher(
        event,
        SESSION_SECRET
      );

    if (
      !authResult ||
      authResult.ok !== true
    ) {
      return authFailureResponse(
        event,
        requestId,
        authResult
      );
    }

    const teacherId =
      text(
        authResult
          ?.user
          ?.teacherId,
        100
      );

    if (
      !UUID_PATTERN.test(
        teacherId
      )
    ) {
      return jsonResponse(
        event,
        403,
        {
          ok: false,
          error:
            'Teacher write context unavailable',
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    const sizeCheck =
      validateBodySize(
        event.body,
        1
      );

    if (!sizeCheck.valid) {
      return jsonResponse(
        event,
        413,
        {
          ok: false,
          error:
            'Request body is too large',
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    let body;

    try {
      body =
        JSON.parse(
          event.body || '{}'
        );
    } catch (_error) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Invalid JSON body',
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    let input;

    try {
      input =
        normalizeManualObjectiveRequest(
          body
        );
    } catch (error) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            error.message,
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    try {
      const student =
        await resolveActiveStudent(
          input.student_code
        );

      if (
        !student ||
        !UUID_PATTERN.test(
          student.id || ''
        )
      ) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error:
              'Student is inactive, archived, or not found',
          },
          {
            'Cache-Control':
              'no-store',
          },
          requestId
        );
      }

      const authorizedClassId =
        await resolveTeacherOwnedEnrollment({
          studentId:
            student.id,
          teacherId,
        });

      if (!authorizedClassId) {
        return jsonResponse(
          event,
          403,
          {
            ok: false,
            error:
              'Student is not actively enrolled in a teacher-owned class',
          },
          {
            'Cache-Control':
              'no-store',
          },
          requestId
        );
      }

      const parentGoal =
        await resolveActiveParentGoal({
          studentId:
            student.id,
          parentGoalCode:
            input.parent_goal_code,
        });

      if (
        !parentGoal ||
        !UUID_PATTERN.test(
          parentGoal.id || ''
        )
      ) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error:
              'Active parent goal not found for student',
          },
          {
            'Cache-Control':
              'no-store',
          },
          requestId
        );
      }

      let registryObjective;

      try {
        registryObjective =
          await resolveRegistryObjective({
            input,
            studentId:
              student.id,
            parentGoalId:
              parentGoal.id,
          });
      } catch (error) {
        if (
          isSchemaUnavailable(
            error
          )
        ) {
          return unavailableResponse(
            event,
            requestId,
            'schema_unavailable'
          );
        }

        throw error;
      }

      /*
       * The live registry is now the canonical child-objective identity.
       *
       * Manual/binder evidence has an additional explicit permission fence:
       * - exact active child identity
       * - Dan monitoring role = Primary
       * - controlling parent is addressed in class
       * - controlling parent is not individual-delivery
       *
       * This preserves the original 35-objective behavior while admitting
       * newly onboarded Primary objectives without opening provider, Math,
       * or Supporting / Responsibility Review objectives.
       */
      if (
        !registryObjective ||
        !UUID_PATTERN.test(
          registryObjective.id || ''
        )
      ) {
        return jsonResponse(
          event,
          422,
          {
            ok: false,
            error:
              'Objective is not an active child objective for this student and parent goal',
          },
          {
            'Cache-Control':
              'no-store',
          },
          requestId
        );
      }

      const manualEvidenceEligible =
        text(
          registryObjective
            .dan_monitoring_role,
          100
        ) === 'Primary' &&
        parentGoal
          .addressed_in_class ===
          true &&
        parentGoal
          .individual_delivery ===
          false;

      if (!manualEvidenceEligible) {
        return jsonResponse(
          event,
          422,
          {
            ok: false,
            error:
              'Objective is not eligible for manual/binder evidence in this teacher context',
          },
          {
            'Cache-Control':
              'no-store',
          },
          requestId
        );
      }

      const schoolYear =
        schoolYearFromObjectiveDate(
          input.date
        );

      const row =
        buildManualObjectiveEvidenceRow({
          input,
          objectiveId:
            registryObjective.id,
          studentId:
            student.id,
          schoolYear,
        });

      try {
        await insertManualObjectiveEvidence(
          row
        );
      } catch (error) {
        if (
          isSchemaUnavailable(
            error
          )
        ) {
          return unavailableResponse(
            event,
            requestId,
            'schema_unavailable'
          );
        }

        throw error;
      }

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          available: true,
          evidence:
            projectManualObjectiveEvidenceResult({
              input,
              row,
            }),
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    } catch (error) {
      console.error(
        '[teacher-manual-objective-evidence]',
        `[${requestId}]`,
        error
      );

      if (
        error instanceof RestError &&
        error.status === 503
      ) {
        return unavailableResponse(
          event,
          requestId,
          'server_unavailable'
        );
      }

      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error:
            'Failed to save manual objective evidence',
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }
  };
