'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(__dirname, '..', relativePath),
    'utf8'
  );
}

const clientSource =
  read('site/web/supabase-client.js');

const functionSource =
  read('netlify/functions/browser-supabase-config.js');

const teacherGuardSource =
  read('netlify/edge-functions/teacher-auth-guard.js');

const studentRedirectSource =
  read('netlify/edge-functions/student-entry-redirect.js');

assert.ok(
  clientSource.includes(
    "'/.netlify/functions/browser-supabase-config'"
  ),
  'localhost client must request the runtime public-config endpoint'
);

assert.ok(
  clientSource.includes(
    'await loadLocalRuntimeConfig();'
  ),
  'localhost runtime configuration must load before adapter use'
);

const readConfigStart =
  clientSource.indexOf('function readCurrentConfig()');

const localBranch =
  clientSource.indexOf(
    'if (isLocalBrowserHost())',
    readConfigStart
  );

const productionGlobals =
  clientSource.indexOf(
    'const url = window.SUPABASE_URL || storedUrl;',
    readConfigStart
  );

assert.ok(
  localBranch > readConfigStart,
  'readCurrentConfig must contain a localhost branch'
);

assert.ok(
  productionGlobals > localBranch,
  'localhost branch must run before production window globals'
);

const localConfigBlock =
  clientSource.slice(localBranch, productionGlobals);

assert.ok(
  localConfigBlock.includes('localRuntimeConfig?.url'),
  'localhost must read the runtime URL'
);

assert.ok(
  localConfigBlock.includes('localRuntimeConfig?.key'),
  'localhost must read the runtime anonymous key'
);

assert.ok(
  !localConfigBlock.includes('window.SUPABASE_URL'),
  'localhost must not fall through to the production URL'
);

assert.ok(
  !localConfigBlock.includes('window.SUPABASE_ANON_KEY'),
  'localhost must not fall through to the production anonymous key'
);

assert.ok(
  functionSource.includes('SUPABASE_URL_RUNTIME'),
  'function must prefer the runtime Supabase URL'
);

assert.ok(
  functionSource.includes('SUPABASE_ANON_KEY_RUNTIME'),
  'function must prefer the runtime anonymous key'
);

assert.ok(
  !functionSource.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'function must never expose the service-role key'
);


for (const [label, edgeSource] of [
  ['teacher guard', teacherGuardSource],
  ['student redirect', studentRedirectSource],
]) {
  assert.ok(
    edgeSource.includes(
      'http://127.0.0.1:54321'
    ),
    `${label} must allow the local Supabase API`
  );

  assert.ok(
    edgeSource.includes(
      'isLocalBrowserHost'
    ),
    `${label} CSP change must be localhost-scoped`
  );

  assert.ok(
    edgeSource.includes(
      'Content-Security-Policy'
    ),
    `${label} must patch the enforced CSP header`
  );

  assert.ok(
    edgeSource.includes(
      'Content-Security-Policy-Report-Only'
    ),
    `${label} must patch the report-only CSP header`
  );

  assert.ok(
    edgeSource.includes(
      'applyLocalSupabaseCsp'
    ),
    `${label} must apply the local CSP helper`
  );
}

const savedEnv = {
  SUPABASE_URL_RUNTIME:
    process.env.SUPABASE_URL_RUNTIME,
  SUPABASE_ANON_KEY_RUNTIME:
    process.env.SUPABASE_ANON_KEY_RUNTIME,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY,
};

(async () => {
  try {
    process.env.SUPABASE_URL_RUNTIME =
      'http://127.0.0.1:54321';

    process.env.SUPABASE_ANON_KEY_RUNTIME =
      'synthetic-local-anon-key';

    process.env.SUPABASE_SERVICE_ROLE_KEY =
      'synthetic-service-role-must-not-appear';

    const modulePath =
      require.resolve(
        '../netlify/functions/browser-supabase-config'
      );

    delete require.cache[modulePath];

    const { handler } =
      require(modulePath);

    const localResponse =
      await handler({
        httpMethod: 'GET',
        headers: {
          host: 'localhost:8888',
        },
      });

    assert.strictEqual(
      localResponse.statusCode,
      200,
      'localhost GET must return configuration'
    );

    const localBody =
      JSON.parse(localResponse.body);

    assert.deepStrictEqual(
      localBody,
      {
        ok: true,
        url: 'http://127.0.0.1:54321',
        anonKey: 'synthetic-local-anon-key',
      },
      'localhost response must contain only public runtime configuration'
    );

    assert.ok(
      !localResponse.body.includes(
        'synthetic-service-role-must-not-appear'
      ),
      'service-role key must not appear in the response'
    );

    assert.strictEqual(
      localResponse.headers['Cache-Control'],
      'no-store',
      'runtime browser configuration must not be cached'
    );

    const productionResponse =
      await handler({
        httpMethod: 'GET',
        headers: {
          host: 'reinischclassroom.com',
        },
      });

    assert.strictEqual(
      productionResponse.statusCode,
      404,
      'endpoint must not expose configuration on production hosts'
    );

    const postResponse =
      await handler({
        httpMethod: 'POST',
        headers: {
          host: 'localhost:8888',
        },
      });

    assert.strictEqual(
      postResponse.statusCode,
      405,
      'endpoint must reject non-GET methods'
    );

    console.log(
      '✓ localhost browser config uses explicit Netlify Dev runtime values'
    );

    console.log(
      '✓ localhost cannot fall through to production Supabase globals'
    );

    console.log(
      '✓ service-role key is never exposed'
    );

    console.log(
      '✓ public-config endpoint is unavailable on production hosts'
    );


    console.log(
      '✓ Teacher and Student page responses allow local Supabase only on localhost'
    );

    console.log();
    console.log(
      'RC-E2E-02A focused boundary tests PASS'
    );
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
