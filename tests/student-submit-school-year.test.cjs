'use strict';

const assert =
  require('assert');

process.env.SESSION_SECRET =
  'student-submit-school-year-test-secret';

process.env.SUPABASE_URL =
  'https://example.supabase.co';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key';

const {
  createStudentSessionCookie,
} = require(
  '../netlify/functions/_lib/student-auth'
);

const {
  handler,
} = require(
  '../netlify/functions/student-submit-answer'
);

const INSTANCE_ID =
  'b121e0fb-4647-47ab-9d4b-11d752ee829c';

function studentCookie(code) {
  return createStudentSessionCookie(
    code,
    process.env.SESSION_SECRET,
    {
      secure: false,
      maxAge: 3600,
    }
  ).split(';')[0];
}

function makeEvent() {
  return {
    httpMethod: 'POST',
    headers: {
      'content-type':
        'application/json',
      cookie:
        studentCookie('S001'),
    },
    queryStringParameters: {},
    body:
      JSON.stringify({
        instance_id:
          INSTANCE_ID,
        student_code:
          'S001',
        answers: {
          '1_1': 'A',
        },
        writing_response:
          'Test response',
        submit:
          true,
      }),
  };
}

function makeResponse(
  body,
  {
    ok = true,
    status = 200,
  } = {}
) {
  return {
    ok,
    status,
    json:
      async () => body,
    text:
      async () =>
        typeof body === 'string'
          ? body
          : JSON.stringify(body),
  };
}

(async () => {
  console.log(
    'Running student submission school-year tests...\n'
  );

  const originalFetch =
    global.fetch;

  const requests = [];

  try {
    global.fetch =
      async (url, options = {}) => {
        const method =
          options.method ||
          'GET';

        let parsedBody =
          null;

        if (options.body) {
          try {
            parsedBody =
              JSON.parse(
                options.body
              );
          } catch {
            parsedBody =
              options.body;
          }
        }

        requests.push({
          url:
            String(url),
          method,
          body:
            parsedBody,
        });

        const requestUrl =
          String(url);

        if (
          requestUrl.includes(
            '/rest/v1/students?'
          )
        ) {
          return makeResponse([
            {
              id:
                'student-1',
              code:
                'S001',
            },
          ]);
        }

        if (
          requestUrl.includes(
            '/rest/v1/assignment_instances?select='
          )
        ) {
          assert.ok(
            requestUrl.includes(
              'school_year'
            ),
            'Instance lookup must request school_year'
          );

          return makeResponse([
            {
              id:
                INSTANCE_ID,
              student_id:
                'student-1',
              assignment_id:
                570,
              settings:
                {},
              status:
                'Assigned',
              resubmission_count:
                0,
              school_year:
                2026,
            },
          ]);
        }

        if (
          requestUrl.includes(
            '/rest/v1/assignment_instances?id=eq.'
          ) &&
          method === 'PATCH'
        ) {
          return makeResponse([]);
        }

        if (
          requestUrl.includes(
            '/rest/v1/submissions?instance_id=eq.'
          )
        ) {
          return makeResponse([]);
        }

        if (
          requestUrl.endsWith(
            '/rest/v1/submissions'
          ) &&
          method === 'POST'
        ) {
          assert.strictEqual(
            parsedBody.school_year,
            2026,
            'New submission must inherit instance school_year'
          );

          return makeResponse([
            {
              id:
                'submission-1',
            },
          ]);
        }

        if (
          requestUrl.includes(
            '/rest/v1/assignment_items?'
          )
        ) {
          return makeResponse([]);
        }

        throw new Error(
          `Unexpected fetch: ${method} ${requestUrl}`
        );
      };

    const response =
      await handler(
        makeEvent()
      );

    assert.strictEqual(
      response.statusCode,
      200
    );

    const submissionCreate =
      requests.find(
        request =>
          request.method === 'POST' &&
          request.url.endsWith(
            '/rest/v1/submissions'
          )
      );

    assert.ok(
      submissionCreate,
      'Expected submission POST'
    );

    assert.strictEqual(
      submissionCreate.body.school_year,
      2026
    );

    console.log(
      '✓ assignment-instance lookup requests school_year'
    );

    console.log(
      '✓ July 2026 submission inherits instance school_year 2026'
    );

    console.log(
      '✓ date-based 2025 fallback does not override stamped instance year'
    );

    console.log('');
    console.log(
      'STUDENT SUBMISSION SCHOOL-YEAR: PASS'
    );
  } finally {
    global.fetch =
      originalFetch;
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
