'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

/*
 * Synthetic test configuration only.
 * No real Supabase credentials, student data, or copyrighted book bytes.
 */
process.env.SESSION_SECRET =
  'rc-library-02a-test-session-secret';

process.env.SUPABASE_URL =
  'https://example-test.supabase.co';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  'rc-library-02a-test-service-role-key';

const {
  createStudentSessionCookie,
} = require('../netlify/functions/_lib/student-auth');

const {
  handler,
  BOOK_BUCKET,
  BOOK_CATALOG,
} = require('../netlify/functions/student-book');

const originalFetch = global.fetch;

const FIXTURE_BYTES = Buffer.from([
  0x50, 0x4b, 0x03, 0x04,
  ...Buffer.from('RC-LIBRARY-02A-SYNTHETIC-EPUB'),
]);

function validCookie() {
  const setCookie =
    createStudentSessionCookie(
      'S001',
      process.env.SESSION_SECRET,
      {
        secure: false,
      }
    );

  return setCookie.split(';', 1)[0];
}

function eventFor({
  book = 'rc-library-02a-fixture',
  cookie = '',
  method = 'GET',
} = {}) {
  return {
    httpMethod: method,
    headers: cookie
      ? {
          cookie,
          host: 'localhost:8888',
        }
      : {
          host: 'localhost:8888',
        },
    queryStringParameters: {
      book,
    },
  };
}

function jsonBody(response) {
  return JSON.parse(response.body);
}

test.afterEach(() => {
  global.fetch = originalFetch;
});

test('rejects missing student session before Storage access', async () => {
  let fetchCalled = false;

  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('Storage should not be called');
  };

  const response =
    await handler(eventFor());

  assert.equal(response.statusCode, 401);
  assert.equal(jsonBody(response).error, 'Unauthorized');
  assert.equal(fetchCalled, false);
});

test('rejects malformed student session before Storage access', async () => {
  let fetchCalled = false;

  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('Storage should not be called');
  };

  const response =
    await handler(
      eventFor({
        cookie: 'sc=definitely-not-a-valid-token',
      })
    );

  assert.equal(response.statusCode, 401);
  assert.equal(jsonBody(response).error, 'Unauthorized');
  assert.equal(fetchCalled, false);
});

test('rejects expired student session before Storage access', async () => {
  let fetchCalled = false;

  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('Storage should not be called');
  };

  const setCookie =
    createStudentSessionCookie(
      'S001',
      process.env.SESSION_SECRET,
      {
        secure: false,
        maxAge: -1,
      }
    );

  const response =
    await handler(
      eventFor({
        cookie: setCookie.split(';', 1)[0],
      })
    );

  assert.equal(response.statusCode, 401);
  assert.equal(jsonBody(response).error, 'Unauthorized');
  assert.equal(fetchCalled, false);
});

test('valid session cannot turn arbitrary input into a Storage path', async () => {
  let fetchCalled = false;

  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('Storage should not be called');
  };

  const response =
    await handler(
      eventFor({
        cookie: validCookie(),
        book: '../../secret-book.epub',
      })
    );

  assert.equal(response.statusCode, 404);
  assert.equal(jsonBody(response).error, 'Book not found');
  assert.equal(fetchCalled, false);
});

test('valid session receives exact synthetic binary bytes', async () => {
  let capturedUrl = '';
  let capturedOptions = null;

  global.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedOptions = options;

    const copy = Buffer.from(FIXTURE_BYTES);

    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        copy.buffer.slice(
          copy.byteOffset,
          copy.byteOffset + copy.byteLength
        ),
    };
  };

  const response =
    await handler(
      eventFor({
        cookie: validCookie(),
      })
    );

  assert.equal(response.statusCode, 200);
  assert.equal(response.isBase64Encoded, true);

  assert.deepEqual(
    Buffer.from(response.body, 'base64'),
    FIXTURE_BYTES
  );

  assert.equal(
    response.headers['Content-Type'],
    'application/epub+zip'
  );

  assert.match(
    response.headers['Cache-Control'],
    /no-store/
  );

  assert.equal(
    capturedUrl,
    'https://example-test.supabase.co/' +
      'storage/v1/object/authenticated/' +
      `${BOOK_BUCKET}/` +
      BOOK_CATALOG['rc-library-02a-fixture'].objectPath
  );

  assert.equal(
    capturedOptions.headers.Authorization,
    'Bearer rc-library-02a-test-service-role-key'
  );
});

test('private Storage 404 is normalized without exposing details', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 404,
    arrayBuffer: async () =>
      new ArrayBuffer(0),
  });

  const response =
    await handler(
      eventFor({
        cookie: validCookie(),
      })
    );

  assert.equal(response.statusCode, 404);
  assert.equal(jsonBody(response).error, 'Book not found');
});

test('unsupported HTTP methods are rejected', async () => {
  const response =
    await handler(
      eventFor({
        method: 'POST',
      })
    );

  assert.equal(response.statusCode, 405);
  assert.equal(
    jsonBody(response).error,
    'Method Not Allowed'
  );
});
