const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('site/index.html', 'utf8');
const css = fs.readFileSync('site/assets/css/home-canyonpath.css', 'utf8');
const tickerCss = fs.readFileSync('site/assets/css/home-scenic-ticker.css', 'utf8');
const scene = fs.readFileSync('site/assets/bg/rc-annotated-canyon-approved.webp');
const asset = JSON.parse(fs.readFileSync('site/assets/bg/rc-annotated-canyon-approved.meta.json', 'utf8'));
const { createHash } = require('node:crypto');
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

function declarations(selector) {
  const blocks = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const found = blocks.find((match) => match[1].trim() === selector);
  assert.ok(found, `Missing selector: ${selector}`);
  return Object.fromEntries(found[2].split(';').filter((item) => item.trim()).map((item) => {
    const split = item.indexOf(':');
    return [item.slice(0, split).trim(), item.slice(split + 1).trim()];
  }));
}
function hex(value) { return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)); }
function luminance(rgb) {
  const linear = rgb.map((c) => c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('Homepage restores the scenic ticker while keeping class-update cards removed', () => {
  assert.equal((html.match(/class="home-scenic-ticker ticker-bar"/g) || []).length, 1);
  assert.equal((html.match(/class="ticker-track"/g) || []).length, 1);
  assert.equal((html.match(/class="ticker-content"/g) || []).length, 2);
  assert.match(html, /class="ticker-content" aria-hidden="true"/);
  assert.doesNotMatch(html, /id="focus-(?:la|life)"/);
  for (const id of ['tcSidebarToggle', 'home-greeting', 'home-focus-section', 'focus-standards', 'home-countdowns', 'daily-quote', 'home-stats']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
});

test('Homepage keeps the exact existing runtime scripts without importing Portal behavior', () => {
  assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((m) => m[1]), [
    '/web/public-nav.js', '/web/sidebar-init.js', '/web/supabase-config.js',
    '/web/home-dashboard.js', '/assets/js/class-clock.js', '/web/class-mode.js',
    '/assets/js/viewer-compat.js', '/web/public-shell.js',
  ]);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /student-canyonpath\.(?:js|css)/);
});

test('Homepage keeps existing entry routes and a keyboard skip target', () => {
  for (const href of ['/', '/student/', '/teacher/', '/substitute/', '/language-arts/', '/life-skills/', '/math-toolkit/']) {
    assert.ok(html.includes(`href="${href}"`), href);
  }
  assert.match(html, /class="home-student-cta" href="\/student\/"/);
  assert.match(html, /class="home-teacher-cta" href="\/teacher\/"/);
  assert.match(html, /href="#home-main"/);
  assert.match(html, /<main[^>]*id="home-main"[^>]*tabindex="-1"/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/class="home-pathway"/g) || []).length, 3);
  assert.ok(html.indexOf('class="home-student-cta"') < html.indexOf('id="home-focus-section"'));
});

test('Homepage CSS is scoped and does not introduce data access or external dependencies', () => {
  assert.match(html, /<body class="rc-home-canyonpath">/);
  for (const block of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const selector = block[1].trim();
    if (selector.startsWith('@')) continue;
    assert.ok(selector.includes('body.rc-home-canyonpath'), selector);
  }
  assert.doesNotMatch(css, /@import|https?:|fetch\(|localStorage|sessionStorage|supabase|!important/);
});

test('Scenic ticker stays background-integrated and preserves the seamless-loop contract', () => {
  assert.match(html, /home-scenic-ticker\.css\?v=20260909-1/);
  assert.match(tickerCss, /background:\s*transparent/);
  assert.match(tickerCss, /mask-image:\s*linear-gradient/);
  assert.match(tickerCss, /animation:\s*home-scenic-ticker-scroll 45s linear infinite/);
  assert.match(tickerCss, /@keyframes home-scenic-ticker-scroll/);
  assert.match(tickerCss, /home-scenic-ticker:hover \.ticker-track/);
  assert.match(tickerCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(tickerCss, /ticker-content\[aria-hidden='true'\]/);
  assert.doesNotMatch(tickerCss, /@import|https?:|fetch\(|localStorage|sessionStorage|supabase|!important/);
  assert.doesNotMatch(tickerCss, /backdrop-filter/);
});

test('Approved annotated scenery is local, decorative, and exact', () => {
  assert.equal(asset.file, 'rc-annotated-canyon-approved.webp');
  assert.equal(asset.format, 'webp');
  assert.equal(asset.width, 1672);
  assert.equal(asset.height, 941);
  assert.equal(
    asset.sha256,
    createHash('sha256').update(scene).digest('hex')
  );
  assert.equal(asset.sha256, 'e5a9850c93073d0fe450b5ee7627ff541a33414323bc6237ba05c370cfb90d14');
  assert.ok(
    scene.length < 600000,
    'Keep shared decorative scenery reasonably lightweight'
  );

  for (const label of [
    'Lunar Illumination',
    'Stratified Canyon Walls',
    'Colorado River',
    'Saguaro Cactus',
    'Carnegiea gigantea',
    'Pug',
    'Canis lupus familiaris',
    'Scale bar',
    'Compass',
  ]) {
    assert.ok(asset.labels.includes(label), label);
  }

  assert.match(
    html,
    /<img[^>]*rc-annotated-canyon-approved\.webp\?v=20260908-annotated4[^>]*alt=""[^>]*width="1672"[^>]*height="941"[^>]*fetchpriority="high"/
  );

  assert.doesNotMatch(html, /home-arizona\.svg/);

  assert.match(
    html,
    /home-canyonpath\.css\?v=20260907-moonlit1/
  );

  assert.match(
    html,
    /href="\/life-skills\/" aria-label="Open Transitional Skills"/
  );
});

test('Frosted card text retains 4.5:1 contrast with blur unavailable', () => {
  for (const selector of ['body.rc-home-canyonpath', "html[data-theme='light'] body.rc-home-canyonpath"]) {
    const tokens = declarations(selector);
    const [r, g, b, a] = tokens['--home-panel'].match(/[\d.]+/g).map(Number);
    assert.ok(a >= 0.94);
    const surfaces = [[r * a, g * a, b * a], [r * a + 255 * (1 - a), g * a + 255 * (1 - a), b * a + 255 * (1 - a)], hex(tokens['--home-inner'])];
    for (const name of ['ink', 'muted', 'accent']) {
      for (const surface of surfaces) {
        const ratio = contrast(hex(tokens[`--home-${name}`]), surface);
        assert.ok(ratio >= 4.5, `${selector} ${name}: ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('Primary CTA and light-mode keyboard focus retain readable contrast', () => {
  assert.ok(contrast(hex('#ffffff'), hex('#0b6852')) >= 4.5);
  assert.ok(contrast(hex('#0b6f5c'), hex('#f5f8f6')) >= 3);
  assert.match(css, /:focus-visible\s*\{[\s\S]*outline: 3px solid var\(--home-focus\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('Scenery remains unblurred and the layout has mobile and classroom-display rules', () => {
  assert.equal(declarations('body.rc-home-canyonpath .home-landscape img').filter, 'none');
  assert.match(css, /backdrop-filter: blur\(3px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /@media \(min-width: 1920px\)/);
  assert.match(css, /home-focus:not\(:has\(\.countdown-card, \.hd-standards-count\)\)/);
});


test('Home offers Language Arts, Transitional Skills, and Student Portal in that order', () => {
  const cards = [...html.matchAll(/<a class="home-pathway" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.deepEqual(cards.map((m) => m[1]), ['/language-arts/', '/life-skills/', '/student/']);
  assert.deepEqual(cards.map((m) => m[2].match(/<strong>(.*?)<\/strong>/)[1]), ['Language Arts', 'Transitional Skills', 'Student Portal']);
  assert.match(html, /class="home-pathway" href="\/student\/" aria-label="Open Student Portal"/);
  assert.match(cards[2][2], /Assignments, goals, and your progress/);
  // Only the front-door card changes. Existing hero entries and toolkit access stay.
  assert.match(html, /class="home-teacher-cta" href="\/teacher\/"/);
  assert.match(html, /href="\/math-toolkit\/" data-href="\/math-toolkit\/"/);
});