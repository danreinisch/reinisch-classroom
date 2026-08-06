'use strict';

// Signed Teacher Center reader for roster, goals, and class enrollments.
// GET /.netlify/functions/teacher-roster-context
// Auth: valid teacher/admin session cookie required.

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  requireTeacher,
} = require('./_lib/auth');

const {
  rest,
  jsonRes,
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  SESSION_SECRET,
} = process.env;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

function isSchemaError(value) {
  const text =
    typeof value === 'string'
      ? value
      : JSON.stringify(value || {});

  const normalized =
    text.toLowerCase();

  return (
    normalized.includes('column') &&
    normalized.includes('does not exist')
  ) ||
    normalized.includes('undefined column') ||
    normalized.includes('42703');
}

async function readRows(path) {
  const response =
    await rest(
      path,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      }
    );

  const result =
    await jsonRes(response);

  return {
    ok: result.ok,
    status: result.status,
    data:
      Array.isArray(result.data)
        ? result.data
        : result.data || [],
  };
}

function nestedStudent(row) {
  if (!row) {
    return null;
  }

  if (Array.isArray(row.students)) {
    return row.students[0] || null;
  }

  return row.students || null;
}

function flattenGoals(rows, enriched) {
  return (rows || []).map((goal) => {
    const student =
      nestedStudent(goal) || {};

    const base = {
      id: goal.id,
      student_code: student.code || '',
      code: goal.code,
      desc: goal.desc,
      target: goal.target,
      status: goal.status,
    };

    if (!enriched) {
      return base;
    }

    return {
      ...base,
      student_id: goal.student_id,
      measurement_type:
        goal.measurement_type,
      data_collector:
        goal.data_collector,
      data_collector_email:
        goal.data_collector_email,
      class_context:
        goal.class_context,
      goal_area:
        goal.goal_area,
      baseline:
        goal.baseline,
      mastery:
        goal.mastery,
      case_manager:
        goal.case_manager,
      version:
        goal.version,
      observation_config:
        goal.observation_config,
      notes:
        goal.notes,
    };
  });
}

exports.handler =
  async function handler(event) {
    const requestId =
      generateRequestId();

    if (event.httpMethod === 'OPTIONS') {
      return handleCorsPreFlight(
        event,
        ['GET', 'OPTIONS'],
        ['Content-Type']
      );
    }

    if (event.httpMethod !== 'GET') {
      return jsonResponse(
        event,
        405,
        {
          ok: false,
          error: 'Method Not Allowed',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }

    if (!SESSION_SECRET) {
      console.error(
        `[teacher-roster-context] [${requestId}] ` +
        'SESSION_SECRET is not configured'
      );

      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error: 'Server not configured',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }

    const {
      url,
      key,
    } = getSupabaseConfig();

    if (!url || !key) {
      console.error(
        `[teacher-roster-context] [${requestId}] ` +
        'Supabase is not configured'
      );

      return jsonResponse(
        event,
        503,
        {
          ok: false,
          error: 'Service unavailable',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }

    const teacherAuth =
      requireTeacher(
        event,
        SESSION_SECRET
      );

    if (!teacherAuth.ok) {
      return jsonResponse(
        event,
        401,
        {
          ok: false,
          error: 'Unauthorized',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }

    try {
      let studentsResult =
        await readRows(
          '/rest/v1/students' +
          '?select=id,code,name,class_id,iep_due,eval_due,' +
          'primary_case_manager,archived_at,active' +
          '&order=code.asc'
        );

      if (
        !studentsResult.ok &&
        isSchemaError(studentsResult.data)
      ) {
        studentsResult =
          await readRows(
            '/rest/v1/students' +
            '?select=id,code,name,class_id' +
            '&order=code.asc'
          );
      }

      if (!studentsResult.ok) {
        throw new Error(
          `students query failed with status ` +
          `${studentsResult.status}`
        );
      }

      let goalsResult =
        await readRows(
          '/rest/v1/goals' +
          '?select=id,code,desc,target,status,student_id,' +
          'measurement_type,data_collector,data_collector_email,' +
          'class_context,goal_area,baseline,mastery,case_manager,' +
          'version,observation_config,notes,' +
          'addressed_in_class,individual_delivery,' +
          'students!inner(code)' +
          '&active=eq.true' +
          '&or=(status.is.null,' +
          'status.not.in.(closed,archived,Closed,Archived))' +
          '&order=students(code).asc'
        );

      let enrichedGoals = true;

      if (
        !goalsResult.ok &&
        isSchemaError(goalsResult.data)
      ) {
        enrichedGoals = false;

        goalsResult =
          await readRows(
            '/rest/v1/goals' +
            '?select=id,code,desc,target,status,student_id,' +
            'students!inner(code)' +
            '&active=eq.true' +
            '&or=(status.is.null,' +
            'status.not.in.(closed,archived,Closed,Archived))' +
            '&order=students(code).asc'
          );
      }

      if (!goalsResult.ok) {
        throw new Error(
          `goals query failed with status ` +
          `${goalsResult.status}`
        );
      }

      const enrollmentResult =
        await readRows(
          '/rest/v1/class_enrollments' +
          '?select=class_id,student_id,' +
          'students!inner(code,name),' +
          'classes!inner(id,code,name)'
        );

      if (!enrollmentResult.ok) {
        console.warn(
          `[teacher-roster-context] [${requestId}] ` +
          'class_enrollments query unavailable; ' +
          'browser fallback will use students.class_id'
        );
      }

      const classesResult =
        await readRows(
          '/rest/v1/classes' +
          '?select=id,code,name' +
          '&order=code.asc'
        );

      if (!classesResult.ok) {
        console.warn(
          `[teacher-roster-context] [${requestId}] ` +
          'classes query unavailable; ' +
          'class fallback may return no rows'
        );
      }

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          students:
            studentsResult.data || [],
          goals:
            flattenGoals(
              goalsResult.data,
              enrichedGoals
            ),
          class_enrollments:
            enrollmentResult.ok
              ? enrollmentResult.data
              : [],
          classes:
            classesResult.ok
              ? classesResult.data
              : [],
        },
        NO_STORE_HEADERS,
        requestId
      );
    } catch (error) {
      console.error(
        `[teacher-roster-context] [${requestId}] ` +
        `${error.message}`
      );

      return jsonResponse(
        event,
        502,
        {
          ok: false,
          error:
            'Failed to load Teacher roster context',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }
  };
