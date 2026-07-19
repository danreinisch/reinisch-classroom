'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const autoLogin =
  fs.readFileSync(
    'site/assets/js/student-auto-login.js',
    'utf8'
  );

const portal =
  fs.readFileSync(
    'site/web/student-portal-init.js',
    'utf8'
  );

const tcStudents =
  fs.readFileSync(
    'site/web/tc-students.js',
    'utf8'
  );

const tcSettings =
  fs.readFileSync(
    'site/web/tc-settings.js',
    'utf8'
  );

console.log(
  'Running student client auth hardening tests...\n'
);

assert.ok(
  !autoLogin.includes(
    "sessionStorage.setItem('rc_user_code'"
  ) &&
  !autoLogin.includes(
    'sessionStorage.setItem("rc_user_code"'
  ),
  'URL auto-login must not set rc_user_code'
);

assert.ok(
  !autoLogin.includes(
    "sessionStorage.setItem('rc_user_role'"
  ) &&
  !autoLogin.includes(
    'sessionStorage.setItem("rc_user_role"'
  ),
  'URL auto-login must not set rc_user_role'
);

console.log(
  '✓ URL code handoff no longer authenticates a student'
);

assert.ok(
  !portal.includes(
    "fetch('/.netlify/functions/student-reset-password'"
  ),
  'Student Portal must not call password reset endpoint'
);

console.log(
  '✓ Student Portal no longer performs self-service password reset'
);

assert.ok(
  portal.includes(
    '/.netlify/functions/student-logout'
  ),
  'Student Portal must call server logout endpoint'
);

console.log(
  '✓ Student Portal explicitly clears server student session'
);

const authStart =
  portal.indexOf(
    'function isAuthenticated()'
  );

const authEnd =
  portal.indexOf(
    '// Feature 2:',
    authStart
  );

const authBlock =
  portal.slice(
    authStart,
    authEnd
  );

assert.ok(
  !authBlock.includes(
    "localStorage.getItem('rc_auth')"
  ) &&
  !authBlock.includes(
    'localStorage.getItem("rc_auth")'
  ),
  'Student authentication must not revive from localStorage rc_auth'
);

console.log(
  '✓ Student UI auth no longer revives from localStorage rc_auth'
);

assert.ok(
  tcStudents.includes(
    '/.netlify/functions/student-reset-password'
  ),
  'Teacher Students reset must use server endpoint'
);

assert.ok(
  tcSettings.includes(
    '/.netlify/functions/student-reset-password'
  ),
  'Teacher Settings reset must use server endpoint'
);

console.log(
  '✓ teacher individual reset controls use authenticated server endpoint'
);

console.log('');
console.log(
  'STUDENT CLIENT AUTH HARDENING: PASS'
);
