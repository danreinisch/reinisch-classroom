'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const ROOT =
  path.resolve(
    __dirname,
    '..'
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    'utf8'
  );
}

const endpoint =
  read(
    'netlify/functions/teacher-student-onboard.js'
  );

const studentsUi =
  read(
    'site/web/tc-students.js'
  );

const studentsHtml =
  read(
    'site/teacher/students/index.html'
  );

process.env.SUPABASE_URL =
  process.env.SUPABASE_URL ||
  'https://example.invalid';

process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'test-service-role-key';

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ||
  'manual-onboarding-contract-secret';

const {
  normalizeOnboardRequest,
} = require(
  '../netlify/functions/teacher-student-onboard'
);

console.log(
  'Running Teacher Student onboarding contract...\n'
);

const normalized =
  normalizeOnboardRequest({
    code:
      ' s069 ',

    primary_case_manager:
      ' Example Teacher ',

    class_names: [
      'Language Arts 1 SC',
      'Language Arts 1 SC',
      'Transitional Skills',
    ],
  });

assert.deepStrictEqual(
  normalized,
  {
    code:
      'S069',

    primary_case_manager:
      'Example Teacher',

    class_names: [
      'Language Arts 1 SC',
      'Transitional Skills',
    ],
  }
);

console.log(
  '✓ onboarding input normalizes code and de-duplicates classes'
);

assert.throws(
  () =>
    normalizeOnboardRequest({
      code:
        'S069',
      password:
        'browser-supplied',
    }),
  /Password is not accepted/
);

assert.throws(
  () =>
    normalizeOnboardRequest({
      code:
        'S069',
      password_hash:
        'browser-supplied',
    }),
  /Password is not accepted/
);

console.log(
  '✓ onboarding refuses browser-supplied passwords'
);

assert.match(
  endpoint,
  /requireTeacher/
);

assert.match(
  endpoint,
  /teacher_id=eq/
);

assert.match(
  endpoint,
  /resolveOwnedClasses/
);

console.log(
  '✓ signed teacher ownership and class ownership are explicit'
);

assert.match(
  endpoint,
  /validateReusableStudent/
);

assert.match(
  endpoint,
  /Student is inactive or archived/
);

assert.match(
  endpoint,
  /validateReusableLogin/
);

assert.match(
  endpoint,
  /login\.role !== 'student'/
);

assert.match(
  endpoint,
  /login\.username !== code/
);

assert.match(
  endpoint,
  /login\.student_id !== student\.id/
);

console.log(
  '✓ reusable student/login states are narrowly validated'
);

assert.match(
  endpoint,
  /if \(!student\)/
);

assert.match(
  endpoint,
  /if \(!login\)/
);

assert.match(
  endpoint,
  /student_created/
);

assert.match(
  endpoint,
  /login_created/
);

console.log(
  '✓ endpoint distinguishes create from reuse'
);

assert.ok(
  endpoint.includes(
    '/rest/v1/rpc/set_user_password'
  )
);

assert.ok(
  !endpoint.includes(
    '/rest/v1/rpc/set_student_password'
  )
);

assert.ok(
  !endpoint.includes(
    'sync_app_users_from_students'
  )
);

console.log(
  '✓ only a missing login reaches the provisioning primitive'
);

assert.ok(
  endpoint.includes(
    '/rest/v1/class_enrollments'
  )
);

assert.ok(
  endpoint.includes(
    '?on_conflict=class_id,student_id'
  )
);

assert.match(
  endpoint,
  /active:\s*true/
);

assert.ok(
  !endpoint.includes(
    '/rest/v1/enrollments'
  )
);

console.log(
  '✓ onboarding writes authoritative active class_enrollments only'
);

assert.match(
  endpoint,
  /studentCreated/
);

assert.match(
  endpoint,
  /loginCreated/
);

assert.match(
  endpoint,
  /rollbackCreatedState/
);

console.log(
  '✓ rollback is scoped to state created by this request'
);

const wizardStart =
  studentsUi.indexOf(
    'async function showAddStudentWizard()'
  );

const wizardEnd =
  studentsUi.indexOf(
    'function showNewIEPWizard',
    wizardStart
  );

assert.ok(
  wizardStart >= 0 &&
  wizardEnd > wizardStart
);

const wizardBlock =
  studentsUi.slice(
    wizardStart,
    wizardEnd
  );

assert.ok(
  !wizardBlock.includes(
    'name="password"'
  )
);

assert.ok(
  !wizardBlock.includes(
    'password_hash'
  )
);

assert.ok(
  wizardBlock.includes(
    '/.netlify/functions/teacher-student-onboard'
  )
);

assert.ok(
  !wizardBlock.includes(
    ".from('enrollments')"
  )
);

assert.ok(
  !wizardBlock.includes(
    'db.upsertStudent'
  )
);

console.log(
  '✓ Add Student UI uses one signed onboarding boundary'
);

const cacheRefs = [
  ...studentsHtml.matchAll(
    /\/web\/tc-students\.js\?v=([^"'<>]+)/g
  ),
];

assert.strictEqual(
  cacheRefs.length,
  1
);

assert.strictEqual(
  cacheRefs[0][1],
  '202608280055-onboard'
);

console.log(
  '✓ Teacher Students cache key moved with onboarding repair'
);

console.log('');
console.log(
  'TEACHER STUDENT ONBOARDING CONTRACT: PASS'
);
