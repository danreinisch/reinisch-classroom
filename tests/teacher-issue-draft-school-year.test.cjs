'use strict';

const assert = require('assert');

const RealDate = global.Date;
const realFetch = global.fetch;

process.env.SESSION_SECRET = 'synthetic-session-secret';
process.env.SUPABASE_URL = 'https://synthetic.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-key';

require.cache[require.resolve('../netlify/functions/_lib/http')] = {
  exports: {
    generateRequestId: () => 'school-year-test',
    jsonResponse: (_event, status, body) => ({
      statusCode: status,
      body: JSON.stringify(body),
    }),
    handleCorsPreFlight: () => ({
      statusCode: 204,
      body: '',
    }),
    validateBodySize: () => ({ valid: true }),
    safeJsonParse: (str) => {
      try {
        return { ok: true, data: JSON.parse(str) };
      } catch (_) {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
};

require.cache[require.resolve('../netlify/functions/_lib/auth')] = {
  exports: {
    requireTeacher: () => ({ ok: false }),
  },
};

require.cache[require.resolve('../netlify/functions/_lib/supa')] = {
  exports: {
    getSupabaseConfig: () => ({
      url: 'https://synthetic.invalid',
      key: 'synthetic-service-key',
    }),
    lookupActiveTeacherId: async () => null,
    lookupTeacherIdByUsername: async () => null,
    SUPABASE_URL: 'https://synthetic.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
  },
};

require.cache[require.resolve('../netlify/functions/_lib/build-items')] = {
  exports: {
    buildItemsFromMeta: () => [],
  },
};

const CLASS_ID = 'class-school-year-test';
const STUDENT_ID = 'student-school-year-test';
const ASSIGNMENT_ID = 'assignment-school-year-test';
const DRAFT_ID = 'draft-school-year-test';

function okJson(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function noContent() {
  return {
    ok: true,
    status: 204,
    json: async () => ({}),
    text: async () => '',
  };
}

async function run() {
  console.log(
    'Running teacher issue-draft school-year provenance test...\n'
  );

  // Freeze execution in the July preparation window.
  global.Date = class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super('2026-07-25T12:00:00-05:00');
      } else {
        super(...args);
      }
    }

    static now() {
      return new RealDate(
        '2026-07-25T12:00:00-05:00'
      ).getTime();
    }
  };

  let duplicateUrl = null;
  let assignmentCreateBody = null;
  let instanceInsertBody = null;

  global.fetch = async (url, options = {}) => {
    const rawUrl = String(url);
    const parsed = new URL(rawUrl);
    const method = String(
      options.method || 'GET'
    ).toUpperCase();
    const endpoint = parsed.pathname;

    if (
      endpoint.endsWith('/classes') &&
      method === 'GET'
    ) {
      return okJson([
        {
          id: CLASS_ID,
          name: 'Language Arts 3 SC',
          teacher_id: 'teacher-school-year-test',
        },
      ]);
    }

    if (
      endpoint.endsWith('/class_enrollments') &&
      method === 'GET'
    ) {
      return okJson([
        { student_id: STUDENT_ID },
      ]);
    }

    if (
      endpoint.endsWith('/assignments') &&
      method === 'GET'
    ) {
      duplicateUrl = rawUrl;

      // PostgREST should return no historical row because the
      // request itself is now scoped to school_year=2026.
      return okJson([]);
    }

    if (
      endpoint.endsWith('/assignments') &&
      method === 'POST'
    ) {
      assignmentCreateBody = JSON.parse(
        options.body
      );

      return okJson([
        {
          id: ASSIGNMENT_ID,
          title: 'Week 1 Operational Test',
        },
      ]);
    }

    if (
      endpoint.endsWith('/students') &&
      method === 'GET'
    ) {
      return okJson([
        {
          id: STUDENT_ID,
          code: 'S001',
          name: 'Synthetic Student',
        },
      ]);
    }

    if (
      endpoint.endsWith('/assignment_instances') &&
      method === 'GET'
    ) {
      return okJson([]);
    }

    if (
      endpoint.endsWith('/assignment_instances') &&
      method === 'POST'
    ) {
      instanceInsertBody = JSON.parse(
        options.body
      );

      return okJson([
        {
          id: 'instance-school-year-test',
          assignment_id: ASSIGNMENT_ID,
          student_id: STUDENT_ID,
        },
      ]);
    }

    if (
      endpoint.endsWith('/teacher_drafts') &&
      method === 'PATCH'
    ) {
      return noContent();
    }

    throw new Error(
      `Unexpected fetch: ${method} ${rawUrl}`
    );
  };

  try {
    const { issueDraftCore } = require(
      '../netlify/functions/teacher-issue-draft'
    );

    const result = await issueDraftCore({
      draft: {
        id: DRAFT_ID,
        title: 'Week 1 Operational Test',
        className: 'Language Arts 3 SC',
        assignment: {
          kind: 'link',
          name: null,
          text: null,
          link: 'https://example.com/week1',
        },
        mapping: {},
      },
      teacherUsername: 'teacher_test',
      teacherUUID: 'teacher-school-year-test',
      requestId: 'school-year-test',
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.issued_count, 1);

    assert.ok(
      duplicateUrl,
      'duplicate assignment query must occur'
    );

    assert.ok(
      duplicateUrl.includes(
        'school_year=eq.2026'
      ),
      `duplicate query must target 2026: ${duplicateUrl}`
    );

    assert.ok(
      !duplicateUrl.includes(
        'school_year=eq.2025'
      ),
      '2025 assignments must not be eligible for reuse'
    );

    assert.ok(
      !duplicateUrl.includes(
        'school_year.is.null'
      ),
      'NULL-year assignments must not be eligible for active reuse'
    );

    assert.ok(
      assignmentCreateBody,
      'assignment creation must occur'
    );

    assert.strictEqual(
      assignmentCreateBody.school_year,
      2026,
      'new assignment must be stamped 2026'
    );

    assert.ok(
      Array.isArray(instanceInsertBody),
      'instance insert must use an array payload'
    );

    assert.strictEqual(
      instanceInsertBody.length,
      1
    );

    assert.strictEqual(
      instanceInsertBody[0].school_year,
      2026,
      'new instance must be stamped 2026'
    );

    assert.strictEqual(
      instanceInsertBody[0].assignment_id,
      ASSIGNMENT_ID,
      'instance must point at the new 2026 parent assignment'
    );

    console.log(
      '✓ July issuance resolves operational year 2026'
    );
    console.log(
      '✓ duplicate lookup is scoped to title + class + school_year 2026'
    );
    console.log(
      '✓ historical 2025 and NULL assignments are excluded from reuse'
    );
    console.log(
      '✓ assignment.school_year = 2026'
    );
    console.log(
      '✓ assignment_instance.school_year = 2026'
    );
    console.log(
      '✓ parent/instance school-year provenance stays aligned'
    );

    console.log(
      '\nTEACHER ISSUE-DRAFT SCHOOL-YEAR: PASS'
    );
  } finally {
    global.Date = RealDate;
    global.fetch = realFetch;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
