'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('large media authorization stays admin-only and service-role mediated', () => {
  const source = read('netlify/functions/admin-media-upload-token.js');

  assert.match(source, /requireTeacher\(event, SESSION_SECRET\)/);
  assert.match(source, /auth\.user\.role !== 'admin'/);
  assert.match(source, /const MEDIA_BUCKET = 'classroom-media'/);
  assert.match(source, /const MAX_FILE_BYTES = 1024 \* 1024 \* 1024/);
  assert.match(source, /'video\/mp4': '\.mp4'/);
  assert.match(source, /'text\/vtt': '\.vtt'/);
  assert.match(source, /\/storage\/v1\/object\/upload\/sign\//);
  assert.match(source, /serviceRoleKey/);
  assert.match(source, /x-upsert': 'false'/);

  assert.doesNotMatch(
    source,
    /return json\([^)]*serviceRoleKey/,
    'service role credential must never be returned to the browser'
  );
});

test('large media browser path uses direct resumable TUS chunks', () => {
  const source = read('site/teacher/admin/media/app.js');

  assert.match(source, /const CHUNK_SIZE = 6 \* 1024 \* 1024/);
  assert.match(source, /'Tus-Resumable': '1\.0\.0'/);
  assert.match(source, /'Upload-Length'/);
  assert.match(source, /'Upload-Metadata'/);
  assert.match(source, /'Upload-Offset'/);
  assert.match(source, /'Content-Type': 'application\/offset\+octet-stream'/);
  assert.match(source, /'x-signature': authorization\.token/);
  assert.match(source, /credentials: 'omit'/);
  assert.match(source, /RETRY_DELAYS/);

  assert.doesNotMatch(source, /readAsDataURL|base64,/);
  assert.doesNotMatch(source, /incremental-deploy/);
});

test('large media admin page is separate from the ordinary presentation uploader', () => {
  const html = read('site/teacher/admin/media/index.html');

  assert.match(html, /Large Classroom Media/);
  assert.match(html, /6 MB chunks/);
  assert.match(html, /id="videoFile"/);
  assert.match(html, /id="captionFile"/);
  assert.match(html, /\.\/app\.js/);
});

test('Kragdon recap viewer streams Storage video and keeps captions optional', () => {
  const html = read('site/presentations/rfk-2026-27/recap/index.html');

  assert.match(html, /<video controls preload="metadata" playsinline crossorigin="anonymous">/);
  assert.match(html, /classroom-media\/kragdon-ah\/kragdon-ah-catch-up-recap-final\.mp4/);
  assert.match(html, /classroom-media\/kragdon-ah\/kragdon-ah-catch-up-recap-final\.en\.vtt/);
  assert.match(html, /kind="captions"/);
  assert.doesNotMatch(html, /<track[^>]+default/);
  assert.doesNotMatch(html, /autoplay/);
});

test('Return collection exposes recap as additive featured media', () => {
  const registry = JSON.parse(
    read('site/assets/data/collection-featured-media.json')
  );

  const items = registry.collections['rfk-2026-27'];

  assert.ok(Array.isArray(items));
  assert.equal(items.length, 1);
  assert.equal(items[0].url, '/presentations/rfk-2026-27/recap/');
  assert.match(items[0].title, /Books 1 & 2 Recap/);

  const collectionHtml = read('site/language-arts/collection/index.html');
  assert.match(collectionHtml, /collection-featured-media\.js/);

  const featureSource = read('site/assets/js/collection-featured-media.js');
  assert.match(featureSource, /grid\.prepend\(createCard\(item\)\)/);
  assert.match(featureSource, /MutationObserver/);
});

test('existing Return weekly presentation topology remains 15 fixed slots', () => {
  const units = JSON.parse(read('site/assets/data/units.json'));
  const rfkUnit = units.units.find((unit) => unit.id === 'rfk-2026-27');

  assert.ok(rfkUnit);
  assert.equal(rfkUnit.slots, 15);
  assert.equal(rfkUnit.baseOut, 'presentations/rfk-2026-27');

  const state = JSON.parse(read('site/assets/data/site-state.json'));
  const rfk = state.categories['rfk-2026-27'];

  assert.ok(rfk);
  assert.equal(rfk.slots, 15);
  assert.equal(rfk.titles.length, 15);
  assert.equal(rfk.links.length, 15);

  for (let slot = 1; slot <= 15; slot += 1) {
    const directory = path.join(
      ROOT,
      'site/presentations/rfk-2026-27',
      `presentation-${String(slot).padStart(2, '0')}`
    );

    assert.ok(fs.existsSync(directory), `missing Return presentation slot ${slot}`);
  }
});
