'use strict';

// Student resubmission boundary.
//
// The signed HttpOnly student session is authoritative.
// Before invoking the legacy create_resubmission RPC this endpoint proves:
//
//   authenticated student
//        -> owns assignment instance
//        -> original submission belongs to that same instance
//
// Only then does the server call the RPC with service-role credentials.

const {
  rest,
  rpc,
  jsonRes,
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const {
  requireStudent,
} = require('./_lib/student-auth');

const { SESSION_SECRET } = process.env;

function noStore() {
  return {
    'Cache-Control': 'no-store',
  };
}

function isNonEmptyString(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 128
  );
}

exports.handler = async (event) => {
  const requestId =
    generateRequestId();

  try {
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
        noStore(),
        requestId
      );
    }

    const contentType =
      event.headers?.['content-type'] ||
      event.headers?.['Content-Type'] ||
      '';

    if (
      !contentType.includes(
        'application/json'
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
        noStore(),
        requestId
      );
    }

    const bodySizeCheck =
      validateBodySize(
        event.body,
        128
      );

    if (!bodySizeCheck.valid) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error: 'Request body too large',
        },
        noStore(),
        requestId
      );
    }

    const parsed =
      safeJsonParse(
        event.body
      );

    if (!parsed.ok) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Invalid JSON in request body',
        },
        noStore(),
        requestId
      );
    }

    const {
      instance_id,
      original_submission_id,
      answers = {},
    } = parsed.data || {};

    if (
      !isNonEmptyString(
        instance_id
      )
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'instance_id is required',
        },
        noStore(),
        requestId
      );
    }

    if (
      !isNonEmptyString(
        original_submission_id
      )
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'original_submission_id is required',
        },
        noStore(),
        requestId
      );
    }

    if (
      answers === null ||
      typeof answers !== 'object' ||
      Array.isArray(answers)
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'answers must be an object',
        },
        noStore(),
        requestId
      );
    }

    // The signed sc cookie is the only
    // source of student identity.
    const studentAuth =
      requireStudent(
        event,
        SESSION_SECRET
      );

    if (!studentAuth.ok) {
      return jsonResponse(
        event,
        studentAuth.statusCode,
        {
          ok: false,
          error:
            studentAuth.error,
        },
        noStore(),
        requestId
      );
    }

    const {
      url,
      key,
    } = getSupabaseConfig();

    if (!url || !key) {
      return jsonResponse(
        event,
        503,
        {
          ok: false,
          error:
            'Data service unavailable',
        },
        noStore(),
        requestId
      );
    }

    const studentCode =
      studentAuth.student.code;

    // Resolve the signed student code
    // to its canonical students.id.
    const studentResponse =
      await rest(
        '/rest/v1/students' +
        '?select=id,code' +
        '&code=eq.' +
        encodeURIComponent(
          studentCode
        ) +
        '&limit=1',
        {
          method: 'GET',
          headers: {
            'Content-Type':
              'application/json',
          },
        }
      );

    if (!studentResponse.ok) {
      console.error(
        `[student-create-resubmission] ` +
        `[${requestId}] student lookup failed: ` +
        studentResponse.status
      );

      return jsonResponse(
        event,
        503,
        {
          ok: false,
          error:
            'Data service unavailable',
        },
        noStore(),
        requestId
      );
    }

    const students =
      await studentResponse.json();

    if (
      !Array.isArray(students) ||
      students.length === 0
    ) {
      return jsonResponse(
        event,
        401,
        {
          ok: false,
          error: 'Unauthorized',
        },
        noStore(),
        requestId
      );
    }

    const student =
      students[0];

    // Verify the requested assignment
    // instance belongs to this student.
    const instanceResponse =
      await rest(
        '/rest/v1/assignment_instances' +
        '?select=id,student_id,resubmission_count' +
        '&id=eq.' +
        encodeURIComponent(
          instance_id
        ) +
        '&limit=1',
        {
          method: 'GET',
          headers: {
            'Content-Type':
              'application/json',
          },
        }
      );

    if (!instanceResponse.ok) {
      console.error(
        `[student-create-resubmission] ` +
        `[${requestId}] instance lookup failed: ` +
        instanceResponse.status
      );

      return jsonResponse(
        event,
        503,
        {
          ok: false,
          error:
            'Data service unavailable',
        },
        noStore(),
        requestId
      );
    }

    const instances =
      await instanceResponse.json();

    if (
      !Array.isArray(instances) ||
      instances.length === 0
    ) {
      return jsonResponse(
        event,
        404,
        {
          ok: false,
          error:
            'Assignment not found',
        },
        noStore(),
        requestId
      );
    }

    const instance =
      instances[0];

    if (
      instance.student_id !==
      student.id
    ) {
      return jsonResponse(
        event,
        403,
        {
          ok: false,
          error: 'Forbidden',
        },
        noStore(),
        requestId
      );
    }

    // Verify the supplied original
    // submission belongs to the same
    // assignment instance.
    const originalResponse =
      await rest(
        '/rest/v1/submissions' +
        '?select=id,instance_id' +
        '&id=eq.' +
        encodeURIComponent(
          original_submission_id
        ) +
        '&limit=1',
        {
          method: 'GET',
          headers: {
            'Content-Type':
              'application/json',
          },
        }
      );

    if (!originalResponse.ok) {
      console.error(
        `[student-create-resubmission] ` +
        `[${requestId}] original submission lookup failed: ` +
        originalResponse.status
      );

      return jsonResponse(
        event,
        503,
        {
          ok: false,
          error:
            'Data service unavailable',
        },
        noStore(),
        requestId
      );
    }

    const originals =
      await originalResponse.json();

    if (
      !Array.isArray(originals) ||
      originals.length === 0
    ) {
      return jsonResponse(
        event,
        404,
        {
          ok: false,
          error:
            'Original submission not found',
        },
        noStore(),
        requestId
      );
    }

    const original =
      originals[0];

    if (
      original.instance_id !==
      instance.id
    ) {
      return jsonResponse(
        event,
        403,
        {
          ok: false,
          error: 'Forbidden',
        },
        noStore(),
        requestId
      );
    }

    // Ownership is now proven.
    // Keep the existing DB function as
    // the atomic mutation boundary.
    const rpcResponse =
      await rpc(
        'create_resubmission',
        {
          p_instance_id:
            instance.id,
          p_original_submission_id:
            original.id,
          p_answers:
            answers,
        }
      );

    const rpcResult =
      await jsonRes(
        rpcResponse
      );

    if (!rpcResult.ok) {
      const detail =
        typeof rpcResult.data ===
        'string'
          ? rpcResult.data
          : JSON.stringify(
              rpcResult.data || {}
            );

      if (
        detail.includes(
          'Resubmission limit reached'
        )
      ) {
        return jsonResponse(
          event,
          409,
          {
            ok: false,
            error:
              'Resubmission limit reached for this assignment',
          },
          noStore(),
          requestId
        );
      }

      console.error(
        `[student-create-resubmission] ` +
        `[${requestId}] RPC failed: ` +
        rpcResponse.status
      );

      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error:
            'Failed to create resubmission',
        },
        noStore(),
        requestId
      );
    }

    const rpcData =
      rpcResult.data;

    const submissionId =
      Array.isArray(rpcData)
        ? rpcData[0]
        : rpcData;

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        submission_id:
          submissionId,
      },
      noStore(),
      requestId
    );
  } catch (error) {
    console.error(
      `[student-create-resubmission] ` +
      `[${requestId}] unexpected error:`,
      error?.message
    );

    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error:
          'Internal server error',
      },
      noStore(),
      requestId
    );
  }
};
