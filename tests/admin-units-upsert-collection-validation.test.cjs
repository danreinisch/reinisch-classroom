/* eslint-env node */
'use strict';

const assert = require('assert');
const path = require('path');

const modulePath = path.resolve(
  __dirname,
  '..',
  'netlify',
  'functions',
  'admin-units-upsert.js'
);

const originalFetch = global.fetch;

function sessionOkResponse() {
  return {
    ok: true,
    text: async () => JSON.stringify({
      ok: true,
      raw_role: 'admin',
    }),
  };
}

async function runValidationCase(payload) {
  delete require.cache[modulePath];

  global.fetch = async (url) => {
    if (String(url).includes('/.netlify/functions/teacher-session')) {
      return sessionOkResponse();
    }

    throw new Error(`Unexpected network call during validation test: ${url}`);
  };

  const { handler } = require(modulePath);

  const response = await handler({
    httpMethod: 'POST',
    headers: {
      host: 'example.test',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify(payload),
  });

  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.body),
  };
}

(async () => {
  const validBase = {
    id: 'test-collection',
    title: 'Test Collection',
    kind: 'book',
    description: '',
    status: 'active',
    sortOrder: 10,
    section: 'language-arts',
    slots: 16,
    baseOut: 'presentations/test-collection',
    pagePath: '/language-arts/collection/',
  };

  const invalidKind = await runValidationCase({
    ...validBase,
    kind: 'spaceship',
  });

  assert.strictEqual(invalidKind.statusCode, 400);
  assert.strictEqual(invalidKind.body.ok, false);
  assert.strictEqual(invalidKind.body.error, 'Invalid collection type');

  const invalidStatus = await runValidationCase({
    ...validBase,
    status: 'deleted-forever',
  });

  assert.strictEqual(invalidStatus.statusCode, 400);
  assert.strictEqual(invalidStatus.body.ok, false);
  assert.strictEqual(invalidStatus.body.error, 'Invalid collection status');

  const invalidOrder = await runValidationCase({
    ...validBase,
    sortOrder: 100001,
  });

  assert.strictEqual(invalidOrder.statusCode, 400);
  assert.strictEqual(invalidOrder.body.ok, false);
  assert.strictEqual(invalidOrder.body.error, 'Invalid display order');

  const invalidDescription = await runValidationCase({
    ...validBase,
    description: 'x'.repeat(501),
  });

  assert.strictEqual(invalidDescription.statusCode, 400);
  assert.strictEqual(invalidDescription.body.ok, false);
  assert.strictEqual(
    invalidDescription.body.error,
    'Description must be 500 characters or fewer'
  );

  console.log(
    'PASS: admin-units-upsert collection metadata validation through handler'
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
    delete require.cache[modulePath];
  });
