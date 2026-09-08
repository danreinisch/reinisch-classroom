const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

const scenePath = 'site/assets/bg/rc-annotated-canyon.svg';
const metaPath = 'site/assets/bg/rc-annotated-canyon.meta.json';
const sceneUrl =
  '/assets/bg/rc-annotated-canyon.svg?v=20260908-annotated1';

const scene = fs.readFileSync(scenePath, 'utf8');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

test('shared annotated canyon is self-contained decorative artwork', () => {
  assert.match(scene, /^<svg\b/);
  assert.match(scene, /viewBox="0 0 912 579"/);
  assert.match(scene, /aria-hidden="true"/);
  assert.match(scene, /data:image\/webp;base64,/);
  assert.doesNotMatch(scene, /<script\b/i);
  assert.doesNotMatch(
    scene,
    /\b(?:href|xlink:href)=["']https?:\/\//i
  );
  assert.doesNotMatch(
    scene,
    /url\(\s*["']?https?:\/\//i
  );

  assert.equal(meta.file, 'rc-annotated-canyon.svg');
  assert.equal(meta.format, 'svg');
  assert.equal(
    meta.sha256,
    createHash('sha256').update(scene).digest('hex')
  );
});

test('approved field-guide annotations are present', () => {
  for (const label of [
    'Lunar Illumination',
    'Stratified Canyon Walls',
    'Colorado River',
    'Saguaro Cactus',
    'Carnegiea gigantea',
    'Pug',
    'Canis lupus familiaris',
    'Grand Canyon Region',
  ]) {
    assert.ok(scene.includes(label), label);
  }
});

test('production presentation owners converge on one shared scene', () => {
  const expected = new Map([
    ['site/index.html', 1],
    ['site/web/sidebar-init.js', 2],
    ['site/assets/css/teacher-canyonpath-shell.css', 2],
    ['site/assets/css/teacher-canyonpath-workspaces.css', 1],
    ['site/teacher/login/index.html', 1],
    ['site/assets/css/teacher-canyonpath-login.css', 1],
    ['site/assets/css/student-canyonpath-reference-match.css', 1],
    ['site/assets/css/substitute-canyonpath.css', 1],
  ]);

  for (const [file, count] of expected) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(
      source.split(sceneUrl).length - 1,
      count,
      `${file} shared scene reference count`
    );
  }
});

test('decorative markup stays outside accessibility-critical content', () => {
  const home = fs.readFileSync('site/index.html', 'utf8');
  const bootstrap = fs.readFileSync('site/web/sidebar-init.js', 'utf8');

  assert.match(
    home,
    /class="home-landscape" aria-hidden="true"/
  );
  assert.match(
    home,
    /rc-annotated-canyon\.svg[^>]*alt=""/
  );
  assert.match(
    bootstrap,
    /landscape\.setAttribute\('aria-hidden', 'true'\)/
  );
  assert.match(bootstrap, /image\.alt = ''/);
});

test('scenic layers stay registered to the viewport while content scrolls', () => {
  const sharedShell = fs.readFileSync(
    'site/assets/css/teacher-canyonpath-shell.css',
    'utf8'
  );
  const student = fs.readFileSync(
    'site/assets/css/student-canyonpath-reference-match.css',
    'utf8'
  );

  assert.match(
    sharedShell,
    /\.tc-shell\s*\{[\s\S]*?background-attachment:\s*fixed,\s*fixed,\s*fixed;/
  );
  assert.match(
    sharedShell,
    /\.home-landscape\s*\{[\s\S]*?position:\s*fixed\s*!important;/
  );
  assert.match(
    sharedShell,
    /\.cp-public-landscape\s*\{[\s\S]*?position:\s*fixed\s*!important;/
  );
  assert.match(
    sharedShell,
    /body\.rc-teacher-login \.tc-main\s*\{[\s\S]*?background-attachment:\s*fixed,\s*fixed\s*!important;/
  );
  assert.match(
    sharedShell,
    /body\.rc-substitute-canyonpath \.tc-main\s*\{[\s\S]*?background-attachment:\s*fixed,\s*fixed,\s*fixed\s*!important;/
  );
  assert.match(
    student,
    /\.tc-main::before\s*\{[\s\S]*?position:\s*fixed;/
  );
});

test('substitute opt-in is presentation-only and screen-scoped', () => {
  const html = fs.readFileSync('site/substitute/index.html', 'utf8');
  const css = fs.readFileSync(
    'site/assets/css/substitute-canyonpath.css',
    'utf8'
  );

  assert.match(
    html,
    /substitute-canyonpath\.css\?v=20260908-annotated1/
  );
  assert.match(
    html,
    /<body class="rc-substitute-canyonpath">/
  );
  assert.match(css, /@media screen/);
  assert.doesNotMatch(
    css,
    /fetch\(|supabase|localStorage|sessionStorage|@import|https?:/
  );
});
