'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root =
  path.resolve(__dirname, '..');

const read = relativePath =>
  fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );

const adapter =
  read('site/web/data-adapter.js');

const library =
  read('site/web/tc-library.js');

const migration =
  read(
    'supabase/migrations/' +
    '20260801210000_submission_archives_server_only.sql'
  );

const reviewEndpoint =
  read(
    'netlify/functions/' +
    'teacher-archive-submission.js'
  );

const closeYearEndpoint =
  read(
    'netlify/functions/' +
    'teacher-close-year-archive.js'
  );

const paperEndpoint =
  read(
    'netlify/functions/' +
    'teacher-paper-result-save.js'
  );

const packageJson =
  JSON.parse(
    read('package.json')
  );

const remoteStart =
  adapter.indexOf('const remote = {');

assert.notEqual(
  remoteStart,
  -1,
  'remote adapter object must exist'
);

const localAdapter =
  adapter.slice(0, remoteStart);

const remoteAdapter =
  adapter.slice(remoteStart);

assert.match(
  localAdapter,
  /async createSubmissionArchive\(record\)/
);

assert.doesNotMatch(
  remoteAdapter,
  /async createSubmissionArchive\(record\)/
);

assert.doesNotMatch(
  remoteAdapter,
  /\.from\(['"]submission_archives['"]\)/
);

for (
  const browserFile of [
    'site/web/data-adapter.js',
    'site/web/tc-library.js',
    'site/web/tc-review.js',
  ]
) {
  const source =
    read(browserFile);

  assert.doesNotMatch(
    source,
    /\.from\(['"]submission_archives['"]\)/,
    `${browserFile} must not access submission_archives directly`
  );
}

const remotePaperStart =
  library.indexOf('// ── Supabase mode ──');

const localPaperStart =
  library.indexOf('// ── Local mode ──');

assert.notEqual(
  remotePaperStart,
  -1,
  'remote PAPER region must exist'
);

assert.notEqual(
  localPaperStart,
  -1,
  'local PAPER region must exist'
);

const remotePaperRegion =
  library.slice(
    remotePaperStart,
    localPaperStart
  );

const localPaperRegion =
  library.slice(localPaperStart);

assert.match(
  remotePaperRegion,
  /db\.savePaperResult\(/
);

assert.doesNotMatch(
  remotePaperRegion,
  /db\.createSubmissionArchive\(/
);

assert.match(
  localPaperRegion,
  /db\.createSubmissionArchive\(/
);

assert.match(
  migration,
  /ALTER TABLE public\.submission_archives\s+ENABLE ROW LEVEL SECURITY;/i
);

assert.match(
  migration,
  /DROP POLICY IF EXISTS\s+"Allow all access to submission_archives"\s+ON public\.submission_archives;/i
);

for (
  const role of [
    'PUBLIC',
    'anon',
    'authenticated',
  ]
) {
  assert.match(
    migration,
    new RegExp(
      `REVOKE ALL PRIVILEGES\\s+` +
      `ON TABLE public\\.submission_archives\\s+` +
      `FROM ${role};`,
      'i'
    ),
    `migration must revoke submission_archives from ${role}`
  );
}

assert.match(
  migration,
  /GRANT SELECT, INSERT, UPDATE, DELETE\s+ON TABLE public\.submission_archives\s+TO service_role;/i
);

assert.doesNotMatch(
  migration,
  /GRANT[\s\S]*TO\s+(anon|authenticated)\b/i
);

for (
  const [
    label,
    endpoint,
  ] of [
    [
      'Teacher Review archive',
      reviewEndpoint,
    ],
    [
      'Close Year archive',
      closeYearEndpoint,
    ],
    [
      'PAPER result archive',
      paperEndpoint,
    ],
  ]
) {
  assert.match(
    endpoint,
    /SUPABASE_SERVICE_ROLE_KEY/,
    `${label} must use the trusted server credential`
  );

  assert.match(
    endpoint,
    /submission_archives/,
    `${label} must retain its server archive path`
  );
}

assert.match(
  reviewEndpoint,
  /requireTeacher\(/
);

assert.match(
  closeYearEndpoint,
  /requireTeacher\(/
);

assert.match(
  paperEndpoint,
  /requireTeacher\(/
);

assert.match(
  packageJson.scripts['test:unit'],
  /submission-archive-server-boundary\.test\.cjs/
);

console.log(
  'PASS: submission archives are server-only while local mode remains intact'
);
