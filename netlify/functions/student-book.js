'use strict';

/**
 * Authenticated classroom-book delivery endpoint.
 *
 * RC-LIBRARY-02A:
 * - requires the existing signed HttpOnly student session
 * - accepts only server-side allowlisted book IDs
 * - retrieves private book bytes from Supabase Storage with the
 *   server-side service role credential
 * - never returns a public Storage URL
 *
 * GET /.netlify/functions/student-book?book=<book-id>
 */

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  getSecurityHeaders,
  getCorsHeaders,
} = require('./_lib/http');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  requireStudent,
} = require('./_lib/student-auth');

const {
  url: SUPABASE_URL,
  key: SUPABASE_SERVICE_ROLE_KEY,
} = getSupabaseConfig();

const { SESSION_SECRET } = process.env;

const BOOK_BUCKET = 'classroom-books';

/**
 * Classroom-book Storage allowlist.
 *
 * Client input must never become a Storage object path directly.
 * Real EPUB bytes live only in private Storage and never in this repo.
 */
const BOOK_CATALOG = Object.freeze({
  'rc-library-02a-fixture': Object.freeze({
    objectPath: 'fixtures/rc-library-02a-test.epub',
    filename: 'rc-library-02a-test.epub',
    contentType: 'application/epub+zip',
  }),
  'lost-in-kragdon-ah': Object.freeze({
    objectPath: 'books/lost-in-kragdon-ah.epub',
    filename: 'Lost in Kragdon-ah.epub',
    contentType: 'application/epub+zip',
  }),
  'a-door-into-time': Object.freeze({
    objectPath: 'books/a-door-into-time.epub',
    filename: 'A Door Into Time.epub',
    contentType: 'application/epub+zip',
  }),
  'escape-from-camp-14': Object.freeze({
    objectPath: 'books/escape-from-camp-14.epub',
    filename: 'Escape from Camp 14.epub',
    contentType: 'application/epub+zip',
  }),
  'seeker': Object.freeze({
    objectPath: 'books/seeker.epub',
    filename: 'Seeker.epub',
    contentType: 'application/epub+zip',
  }),
  '1984': Object.freeze({
    objectPath: 'books/1984.epub',
    filename: '1984.epub',
    contentType: 'application/epub+zip',
  }),
  'return-from-kragdon-ah': Object.freeze({
    objectPath: 'books/return-from-kragdon-ah.epub',
    filename: 'Return from Kragdon-ah.epub',
    contentType: 'application/epub+zip',
  }),
});

function storageObjectUrl(objectPath) {
  const encodedPath = String(objectPath)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  return (
    `${SUPABASE_URL}/storage/v1/object/authenticated/` +
    `${encodeURIComponent(BOOK_BUCKET)}/${encodedPath}`
  );
}

function errorResponse(event, requestId, statusCode, error) {
  return jsonResponse(
    event,
    statusCode,
    {
      ok: false,
      error,
    },
    {
      'Cache-Control': 'no-store',
    },
    requestId
  );
}

exports.handler = async (event) => {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(
      event,
      ['GET', 'OPTIONS'],
      ['Content-Type']
    );
  }

  if (event.httpMethod !== 'GET') {
    return errorResponse(
      event,
      requestId,
      405,
      'Method Not Allowed'
    );
  }

  /*
   * Authenticate BEFORE examining the requested book.
   * Unauthenticated callers must not be able to enumerate valid IDs.
   */
  const studentAuth = requireStudent(
    event,
    SESSION_SECRET
  );

  if (!studentAuth.ok) {
    return errorResponse(
      event,
      requestId,
      studentAuth.statusCode,
      studentAuth.error
    );
  }

  const params = event.queryStringParameters || {};
  const bookId =
    typeof params.book === 'string'
      ? params.book.trim()
      : '';

  const book = BOOK_CATALOG[bookId];

  /*
   * Client input is never interpolated into a filesystem or Storage path.
   * Only an exact server-side catalog entry may resolve to an object.
   */
  if (!book) {
    return errorResponse(
      event,
      requestId,
      404,
      'Book not found'
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse(
      event,
      requestId,
      503,
      'Book storage unavailable'
    );
  }

  let storageResponse;

  try {
    storageResponse = await fetch(
      storageObjectUrl(book.objectPath),
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization:
            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
  } catch (err) {
    console.error(
      `[student-book] [${requestId}] Storage request failed:`,
      err.message
    );

    return errorResponse(
      event,
      requestId,
      502,
      'Book storage request failed'
    );
  }

  if (storageResponse.status === 404) {
    return errorResponse(
      event,
      requestId,
      404,
      'Book not found'
    );
  }

  if (!storageResponse.ok) {
    console.error(
      `[student-book] [${requestId}] Storage returned status`,
      storageResponse.status
    );

    return errorResponse(
      event,
      requestId,
      502,
      'Book storage request failed'
    );
  }

  let bookBuffer;

  try {
    const arrayBuffer =
      await storageResponse.arrayBuffer();

    bookBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    console.error(
      `[student-book] [${requestId}] Could not read book bytes:`,
      err.message
    );

    return errorResponse(
      event,
      requestId,
      502,
      'Book storage response invalid'
    );
  }

  return {
    statusCode: 200,
    headers: {
      ...getSecurityHeaders(requestId),
      ...getCorsHeaders(
        event,
        ['GET', 'OPTIONS'],
        ['Content-Type']
      ),
      'Content-Type': book.contentType,
      'Content-Length': String(bookBuffer.length),
      'Content-Disposition':
        `inline; filename="${book.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: bookBuffer.toString('base64'),
    isBase64Encoded: true,
  };
};

exports.BOOK_BUCKET = BOOK_BUCKET;
exports.BOOK_CATALOG = BOOK_CATALOG;
