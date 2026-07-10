/* eslint-env node */
'use strict';

const assert = require('assert');
const fs = require('fs');

const adminIndex = fs.readFileSync('site/teacher/admin/index.html', 'utf8');
const adminGate = fs.readFileSync('site/teacher/admin/gate.js', 'utf8');

assert(
  adminIndex.includes('id="unitManagerCard"'),
  'Teacher Admin page must include Curriculum Collection Manager card.'
);

assert(
  /id="unitManagerCard"[^>]*display:none/.test(adminIndex),
  'Curriculum Collection Manager starts hidden until the admin gate opens the app.'
);

assert(
  adminGate.includes('function revealAdminUtilityCards'),
  'Admin gate must define a helper that reveals optional admin utility cards.'
);

assert(
  adminGate.includes("'unitManagerCard'") || adminGate.includes('"unitManagerCard"'),
  'Admin gate reveal helper must include Curriculum Collection Manager.'
);

assert(
  adminGate.includes("'unitScaffolderCard'") || adminGate.includes('"unitScaffolderCard"'),
  'Admin gate reveal helper must preserve the existing unit scaffolder reveal behavior.'
);

const appRevealIndex = adminGate.indexOf("if (app) app.style.display='block';");
const managerRevealIndex = adminGate.indexOf('revealAdminUtilityCards();');

assert(
  appRevealIndex !== -1,
  'Admin gate must still reveal the main app container after admin verification.'
);

assert(
  managerRevealIndex > appRevealIndex,
  'Curriculum Collection Manager must be revealed after the admin gate opens the app.'
);

console.log('PASS: Curriculum Collection Manager reveals after admin gate');
