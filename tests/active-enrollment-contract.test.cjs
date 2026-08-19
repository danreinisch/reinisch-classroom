'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

function check(label, fn) {
  try {
    fn();
    console.log(`PASS: ${label}`);
  } catch (error) {
    console.error(`FAIL: ${label}`);
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}

const roster = read(
  'netlify/functions/teacher-roster-context.js'
);
const validator = read(
  'netlify/functions/teacher-validate-enrollments.js'
);
const adapter = read(
  'site/web/data-adapter.js'
);
const work = read(
  'site/web/tc-work.js'
);
const issueDraft = read(
  'netlify/functions/teacher-issue-draft.js'
);

check(
  'Teacher roster requests active class memberships only',
  () => {
    const start = roster.indexOf(
      "'/rest/v1/class_enrollments'"
    );
    const end = roster.indexOf(
      'const classesResult',
      start
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block = roster.slice(start, end);

    assert.match(
      block,
      /active=eq\.true/
    );
  }
);

check(
  'Enrollment validator requests active memberships only',
  () => {
    const start = validator.indexOf(
      'const classEnrollmentsUrl'
    );
    const end = validator.indexOf(
      'const ceResponse',
      start
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block = validator.slice(start, end);

    assert.match(
      block,
      /active=eq\.true/
    );
  }
);

check(
  'Successful empty active roster is authoritative',
  () => {
    const start = validator.indexOf(
      'if (ceResponse.ok)'
    );
    const end = validator.indexOf(
      'if (ceResponse.status === 400',
      start
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block = validator.slice(start, end);

    assert.match(
      block,
      /return codes;/
    );

    assert.equal(
      block.includes(
        'trying enrollments fallback'
      ),
      false
    );
  }
);

check(
  'Unexpected primary enrollment failure fails closed',
  () => {
    const start = validator.indexOf(
      'if (ceResponse.status === 400'
    );
    const end = validator.indexOf(
      '// Fallback: enrollments table',
      start
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block = validator.slice(start, end);

    assert.match(
      block,
      /refusing legacy enrollment fallback/
    );

    assert.match(
      block,
      /return \[\];/
    );
  }
);

check(
  'Local roster hides inactive historical memberships',
  () => {
    const start = adapter.indexOf(
      'async listClassEnrollments()'
    );
    const end = adapter.indexOf(
      'async upsertClassEnrollment(enrollment)',
      start
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block = adapter.slice(start, end);

    assert.match(
      block,
      /e\.active === false/
    );
  }
);

check(
  'Enrollment upserts explicitly reactivate membership',
  () => {
    const localStart = adapter.indexOf(
      'async upsertClassEnrollment(enrollment)'
    );
    const remoteStart = adapter.lastIndexOf(
      'async upsertClassEnrollment(enrollment)'
    );

    assert.ok(localStart >= 0);
    assert.ok(remoteStart > localStart);

    const localBlock = adapter.slice(
      localStart,
      localStart + 900
    );

    const remoteBlock = adapter.slice(
      remoteStart,
      remoteStart + 1200
    );

    assert.match(
      localBlock,
      /active:\s*true/
    );

    assert.match(
      remoteBlock,
      /active:\s*true/
    );
  }
);

check(
  'Class-wide issuing still uses enrollment validator',
  () => {
    assert.ok(
      work.includes(
        '/.netlify/functions/teacher-validate-enrollments'
      )
    );

    assert.ok(
      work.includes(
        'classNames: [draft.className]'
      )
    );
  }
);


check(
  'Teacher roster fails closed when enrollment surface is unavailable',
  () => {
    const start = roster.indexOf(
      'const enrollmentResult'
    );
    const end = roster.indexOf(
      'const classesResult',
      start
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block = roster.slice(start, end);

    assert.match(
      block,
      /class_enrollments query failed with status/
    );

    assert.equal(
      block.includes(
        'browser fallback will use students.class_id'
      ),
      false
    );
  }
);

check(
  'Remote browser enrollment list does not infer student primary class',
  () => {
    const first = adapter.indexOf(
      'async listClassEnrollments()'
    );
    const second = adapter.indexOf(
      'async listClassEnrollments()',
      first + 1
    );
    const end = adapter.indexOf(
      'async upsertClass(classData)',
      second
    );

    assert.ok(first >= 0);
    assert.ok(second > first);
    assert.ok(end > second);

    const block = adapter.slice(
      second,
      end
    );

    assert.equal(
      block.includes(
        'student.class_id'
      ),
      false
    );

    assert.equal(
      block.includes(
        'classMap'
      ),
      false
    );

    assert.match(
      block,
      /return results;/
    );
  }
);


check(
  'Server assignment issuance requests active memberships only',
  () => {
    const start = issueDraft.indexOf(
      'const classEnrollmentsUrl'
    );
    const end = issueDraft.indexOf(
      'const classEnrollmentsResponse',
      start
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block = issueDraft.slice(
      start,
      end
    );

    assert.match(
      block,
      /active=eq\.true/
    );

    assert.match(
      block,
      /students\.active=eq\.true/
    );

    assert.match(
      block,
      /students\.archived_at=is\.null/
    );
  }
);

check(
  'Server empty active roster cannot resurrect legacy enrollment',
  () => {
    const start = issueDraft.indexOf(
      'if (classEnrollmentsResponse.ok)'
    );
    const end = issueDraft.indexOf(
      '} else if (',
      start
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block = issueDraft.slice(
      start,
      end
    );

    assert.match(
      block,
      /enrollmentSource =\s*'class_enrollments'/
    );

    assert.equal(
      block.includes(
        '/rest/v1/enrollments'
      ),
      false
    );
  }
);

check(
  'Server unexpected enrollment failure fails closed',
  () => {
    assert.ok(
      issueDraft.includes(
        'refusing legacy enrollment fallback'
      )
    );

    assert.ok(
      issueDraft.includes(
        'classEnrollmentsResponse.status === 400'
      )
    );

    assert.ok(
      issueDraft.includes(
        'classEnrollmentsResponse.status === 404'
      )
    );
  }
);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  'Active enrollment contract checks complete.'
);
