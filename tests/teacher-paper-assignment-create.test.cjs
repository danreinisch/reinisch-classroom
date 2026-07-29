'use strict';

const assert =
  require('node:assert/strict');

const Module =
  require('node:module');

const path =
  require('node:path');

const endpointPath =
  path.resolve(
    __dirname,
    '../netlify/functions/teacher-paper-assignment-create.js'
  );

const TEACHER_ID =
  '11111111-1111-4111-8111-111111111111';

const OTHER_TEACHER_ID =
  '99999999-9999-4999-8999-999999999999';

const CLASS_ID =
  '22222222-2222-4222-8222-222222222222';

const CLASS_NAME =
  'Language Arts 1 SC';

let authResult;
let fixtures;
let calls;

function restResponse(
  status,
  data
) {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    async json() {
      return data;
    },
    async text() {
      return JSON.stringify(
        data
      );
    },
  };
}

function parseBody(options) {
  if (
    !options ||
    !options.body
  ) {
    return null;
  }

  return JSON.parse(
    options.body
  );
}

function reset() {
  authResult = {
    ok: true,
    user: {
      role: 'teacher',
      teacherId: TEACHER_ID,
    },
  };

  fixtures = {
    ownedClassMatches: 1,
  };

  calls = [];
}

async function restMock(
  url,
  options = {}
) {
  const method =
    options.method || 'GET';

  const body =
    parseBody(options);

  calls.push({
    url,
    method,
    body,
    headers:
      options.headers || {},
  });

  if (
    url.startsWith(
      '/rest/v1/classes?'
    )
  ) {
    if (
      fixtures.ownedClassMatches === 0
    ) {
      return restResponse(
        200,
        []
      );
    }

    if (
      fixtures.ownedClassMatches === 2
    ) {
      return restResponse(
        200,
        [
          {
            id: CLASS_ID,
            name: CLASS_NAME,
            teacher_id: TEACHER_ID,
          },
          {
            id:
              '33333333-3333-4333-8333-333333333333',
            name: CLASS_NAME,
            teacher_id: TEACHER_ID,
          },
        ]
      );
    }

    return restResponse(
      200,
      [
        {
          id: CLASS_ID,
          name: CLASS_NAME,
          teacher_id: TEACHER_ID,
        },
      ]
    );
  }

  if (
    url.startsWith(
      '/rest/v1/assignments?'
    ) &&
    method === 'POST'
  ) {
    return restResponse(
      201,
      [
        {
          id: 901,
          ...body,
        },
      ]
    );
  }

  throw new Error(
    `Unexpected REST call: ${method} ${url}`
  );
}

const originalLoad =
  Module._load;

process.env.SESSION_SECRET =
  'test-session-secret';

Module._load =
  function patchedLoad(
    request,
    parent,
    isMain
  ) {
    if (
      request === './_lib/http'
    ) {
      return {
        generateRequestId() {
          return 'req-test';
        },
        handleCorsPreFlight() {
          return {
            statusCode: 204,
            headers: {},
            body: '',
          };
        },
      };
    }

    if (
      request === './_lib/auth'
    ) {
      return {
        requireTeacher() {
          return authResult;
        },
      };
    }

    if (
      request === './_lib/supa'
    ) {
      return {
        rest: restMock,
        SUPABASE_URL:
          'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY:
          'service-role-test',
      };
    }

    if (
      request === './_lib/school-year'
    ) {
      return {
        getCurrentSchoolYear() {
          return 2025;
        },
      };
    }

    return originalLoad.call(
      this,
      request,
      parent,
      isMain
    );
  };

delete require.cache[
  require.resolve(endpointPath)
];

const {
  handler,
} = require(endpointPath);

Module._load =
  originalLoad;

function parseResponse(result) {
  return {
    statusCode:
      result.statusCode,
    body:
      result.body
        ? JSON.parse(result.body)
        : null,
  };
}

async function invoke(
  body,
  method = 'POST'
) {
  return parseResponse(
    await handler({
      httpMethod: method,
      headers: {},
      body:
        body === undefined
          ? ''
          : JSON.stringify(body),
    })
  );
}

async function test(
  name,
  fn
) {
  try {
    reset();
    await fn();
    console.log(
      `PASS: ${name}`
    );
  } catch (error) {
    console.error(
      `FAIL: ${name}`
    );
    throw error;
  }
}

(async () => {
  await test(
    'unauthenticated request fails closed',
    async () => {
      authResult = {
        ok: false,
      };

      const result =
        await invoke({
          title: 'Paper',
          className: CLASS_NAME,
          page: 'https://example.test/paper.pdf',
          meta: {},
        });

      assert.equal(
        result.statusCode,
        401
      );

      assert.equal(
        calls.length,
        0
      );
    }
  );

  await test(
    'remote paper creation requires class name',
    async () => {
      const result =
        await invoke({
          title: 'Paper',
          className: '',
          page: 'https://example.test/paper.pdf',
          meta: {},
        });

      assert.equal(
        result.statusCode,
        400
      );

      assert.equal(
        calls.length,
        0
      );
    }
  );

  await test(
    'class not owned by signed teacher fails closed',
    async () => {
      fixtures.ownedClassMatches = 0;

      const result =
        await invoke({
          title: 'Paper',
          className: CLASS_NAME,
          page: 'https://example.test/paper.pdf',
          meta: {},
        });

      assert.equal(
        result.statusCode,
        404
      );

      assert.equal(
        calls.length,
        1
      );

      assert.ok(
        calls[0].url.includes(
          `teacher_id=eq.${encodeURIComponent(TEACHER_ID)}`
        )
      );

      assert.equal(
        calls.some(
          call =>
            call.method === 'POST'
        ),
        false
      );
    }
  );

  await test(
    'ambiguous owned class lookup fails closed',
    async () => {
      fixtures.ownedClassMatches = 2;

      const result =
        await invoke({
          title: 'Paper',
          className: CLASS_NAME,
          page: 'https://example.test/paper.pdf',
          meta: {},
        });

      assert.equal(
        result.statusCode,
        404
      );

      assert.equal(
        calls.some(
          call =>
            call.method === 'POST'
        ),
        false
      );
    }
  );

  await test(
    'valid teacher-owned class creates canonical paper assignment',
    async () => {
      const result =
        await invoke({
          title: '  Paper Evidence  ',
          className: CLASS_NAME,
          page:
            'https://example.test/paper.pdf',
          meta: {
            paper: false,
            original_filename:
              'paper.pdf',
          },

          // These browser values must have no authority.
          classId:
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          teacherId:
            OTHER_TEACHER_ID,
          type:
            'html',
          series:
            'Definitely Not The Class',
          school_year:
            1900,
        });

      assert.equal(
        result.statusCode,
        201
      );

      assert.equal(
        result.body.ok,
        true
      );

      assert.equal(
        result.body.assignment.id,
        901
      );

      const classCall =
        calls.find(
          call =>
            call.url.startsWith(
              '/rest/v1/classes?'
            )
        );

      assert.ok(
        classCall
      );

      assert.ok(
        classCall.url.includes(
          `name=eq.${encodeURIComponent(CLASS_NAME)}`
        )
      );

      assert.ok(
        classCall.url.includes(
          `teacher_id=eq.${encodeURIComponent(TEACHER_ID)}`
        )
      );

      assert.equal(
        classCall.method,
        'GET',
        'canonical class resolution must be read-only'
      );

      assert.equal(
        calls.some(
          call =>
            call.url.startsWith('/rest/v1/classes') &&
            call.method !== 'GET'
        ),
        false,
        'paper creation must never create, adopt, patch, or otherwise mutate classes'
      );

      const createCall =
        calls.find(
          call =>
            call.method === 'POST' &&
            call.url.startsWith(
              '/rest/v1/assignments?'
            )
        );

      assert.ok(
        createCall
      );

      assert.deepEqual(
        createCall.body,
        {
          title:
            'Paper Evidence',
          type:
            'paper',
          series:
            CLASS_NAME,
          page:
            'https://example.test/paper.pdf',
          meta: {
            paper: true,
            original_filename:
              'paper.pdf',
          },
          class_id:
            CLASS_ID,
          school_year:
            2025,
        }
      );

      assert.equal(
        createCall.headers.Prefer,
        'return=representation'
      );
    }
  );

  console.log();
  console.log(
    'PASS: teacher-paper-assignment-create targeted endpoint tests'
  );
})().catch(
  error => {
    console.error(
      error
    );
    process.exitCode = 1;
  }
);
