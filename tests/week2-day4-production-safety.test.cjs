'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  getRequestOrigin,
} = require('../netlify/functions/_lib/http');

const endpointPath = path.join(
  __dirname,
  '..',
  'netlify',
  'functions',
  'teacher-week2-day4-trim.js'
);
const internalCorePath = path.join(
  __dirname,
  '..',
  'netlify',
  'functions',
  '_lib',
  'teacher-week2-day4-trim-core.js'
);
const publicCorePath = path.join(
  __dirname,
  '..',
  'netlify',
  'functions',
  'teacher-week2-day4-trim-core.js'
);

const endpointSource = fs.readFileSync(endpointPath, 'utf8');
const internalCoreSource = fs.readFileSync(internalCorePath, 'utf8');

function gitBlobSha(text) {
  const bytes = Buffer.from(text, 'utf8');
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

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

assert.match(
  endpointSource,
  /require\('\.\/_lib\/teacher-week2-day4-trim-core'\)/,
  'public Day 4 endpoint must delegate only to the internal core'
);

assert.strictEqual(
  fs.existsSync(publicCorePath),
  false,
  'verified Day 4 core must not exist as a top-level Netlify function'
);

assert.strictEqual(
  fs.existsSync(internalCorePath),
  true,
  'verified Day 4 core must live under the internal Netlify library'
);

assert.strictEqual(
  gitBlobSha(internalCoreSource),
  '4aa8fcb6f68d0b6c33d3b1470d7f16f5399ac64f',
  'internal core must remain byte-identical to the teacher-verified PR #1498 implementation'
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
