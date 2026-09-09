'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  getRequestOrigin,
} = require('../netlify/functions/_lib/http');

const endpointSource = fs.readFileSync(
  path.join(__dirname, '..', 'netlify', 'functions', 'teacher-week2-day4-trim.js'),
  'utf8'
);

assert.strictEqual(
  getRequestOrigin({
    headers: {
      host: 'internal-functions-host.netlify.app',
      'x-forwarded-host': 'reinischclassroom.com, internal-functions-host.netlify.app',
      'x-forwarded-proto': 'https, https',
    },
  }),
  'https://reinischclassroom.com',
  'production gate must honor the same forwarded-host precedence as shared HTTP helpers'
);

assert.strictEqual(
  getRequestOrigin({
    headers: {
      Host: 'www.reinischclassroom.com',
    },
  }),
  'https://www.reinischclassroom.com',
  'host fallback must remain valid when forwarded-host is absent'
);

assert.match(
  endpointSource,
  /getRequestOrigin\(event\)/,
  'Day 4 Apply gate must resolve production host through shared HTTP origin parsing'
);

assert.match(
  endpointSource,
  /new URL\(origin\)\.hostname\.toLowerCase\(\)/,
  'Day 4 Apply gate must compare the normalized hostname only'
);

assert.doesNotMatch(
  endpointSource,
  /lookupActiveTeacherId/,
  'Day 4 production trim must not fall back to the deprecated active-teacher lookup'
);

assert.match(
  endpointSource,
  /Teacher session is missing teacherId\. Sign in again\./,
  'missing signed teacherId must fail closed with a re-login instruction'
);

assert.doesNotMatch(
  endpointSource,
  /teacherId\s*=\s*await\s+lookupActiveTeacherId/,
  'mutation endpoint must never resolve a teacher implicitly'
);

console.log('week2-day4 production safety regression tests passed');
