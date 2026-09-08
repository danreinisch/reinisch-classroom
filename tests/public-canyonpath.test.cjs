const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('site/web/sidebar-init.js', 'utf8');
const marker = '\n\n// Public CanyonPath browsing surfaces.';
const offset = source.indexOf(marker);
assert.ok(offset > 0, 'public presentation has an explicit boundary');
const bootstrap = source.slice(offset);
const css = fs.readFileSync('site/assets/css/public-canyonpath.css', 'utf8');

function harness(path, { loading = false, home = false, missingMain = false, width = 1440, saved = 'expanded', storageDenied = false } = {}) {
  const classes = new Set();
  const links = [];
  const extraLinks = [];
  const callbacks = [];
  const children = [];
  const homeImage = home ? { src: '/assets/bg/home-arizona.svg', alt: '' } : null;
  const main = {
    firstChild: { id: 'existing-content' },
    querySelector(selector) {
      if (selector === '.home-landscape img') return homeImage;
      if (selector === '.cp-public-landscape') return children.find((x) => x.className === 'cp-public-landscape');
      throw new Error('Unexpected main selector: ' + selector);
    },
    insertBefore(node, before) {
      assert.equal(before, this.firstChild, 'decoration never replaces content');
      children.push(node);
    },
  };
  const document = {
    readyState: loading ? 'loading' : 'complete',
    documentElement: { classList: { add: (name) => classes.add(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } },
    head: { appendChild: (link) => (link.attributes['data-public-canyonpath'] ? links : extraLinks).push(link) },
    querySelector(selector) {
      if (selector === '.tc-main') return missingMain ? null : main;
      if (selector === 'link[data-public-canyonpath]') return links[0];
      if (selector === 'link[data-public-navigation]') return extraLinks.find((x) => x.attributes['data-public-navigation']);
      if (selector === 'link[data-canyon-scene-preload]') return extraLinks.find((x) => x.attributes['data-canyon-scene-preload']);
      throw new Error('Unexpected document selector: ' + selector);
    },
    createElement(tag) {
      assert.ok(['link', 'div', 'img'].includes(tag), 'presentation elements only');
      return { tag, attributes: {}, children: [], setAttribute(k, v) { this.attributes[k] = v; }, appendChild(node) { this.children.push(node); } };
    },
    addEventListener(name, callback, options) {
      assert.equal(name, 'DOMContentLoaded');
      assert.equal(options.once, true);
      callbacks.push(callback);
    },
  };
  const localStorage = { getItem(key) {
    assert.equal(key, 'rc_public_sidebar', 'only the existing public presentation preference is read');
    if (storageDenied) throw new Error('storage denied');
    return saved;
  } };
  const context = vm.createContext({ document, localStorage, window: { location: { pathname: path }, innerWidth: width } });
  return { classes, links, extraLinks, callbacks, children, homeImage, main, run: () => vm.runInContext(bootstrap, context) };
}

test('public presentation does not duplicate Student Portal runtime imports', () => {
  assert.doesNotMatch(bootstrap, /student-canyonpath|student-portal-polish|createElement\('script'\)/);
});

test('public browsing routes and index aliases opt in without touching data', () => {
  for (const route of ['/classroom-resources/', '/language-arts/', '/language-arts/index.html', '/language-arts/collection/', '/life-skills/', '/life-skills/collection/', '/toolkits/', '/language-arts/toolkit/', '/math-toolkit/', '/math-toolkit/algebra/', '/language-arts/a-door-into-time/']) {
    const h = harness(route); h.run();
    assert.ok(h.classes.has('rc-public-canyonpath'), route);
    assert.equal(h.links.length, 1, route);
    assert.match(h.links[0].href, /^\/assets\/css\/public-canyonpath\.css\?v=/);
    assert.equal(h.children.length, 1);
    assert.equal(h.children[0].attributes['aria-hidden'], 'true');
    assert.equal(h.children[0].children[0].alt, '');
    assert.match(h.children[0].children[0].src, /^\/assets\/bg\/rc-annotated-canyon-approved\.webp\?v=20260908-annotated4$/);
  }
});

test('Teacher Center, Portal, substitute auth, viewers, and individual lessons remain excluded', () => {
  for (const route of ['/teacher', '/teacher/', '/teacher/index.html', '/teacher/students/', '/student', '/student/', '/student/index.html', '/substitute/', '/viewer/', '/admin/', '/math-toolkit/algebra/equations/', '/language-arts/toolkit/sentence-workshop/', '/presentations/language-arts-toolkit/']) {
    const h = harness(route); h.run();
    assert.equal(h.classes.size, 0, route);
    assert.equal(h.links.length, 0, route);
    assert.equal(h.children.length, 0, route);
    assert.equal(h.callbacks.length, 0, route);
    assert.equal(h.extraLinks.length, 0, route);
  }
});

test('duplicate initialization cannot stack backgrounds or stylesheets', () => {
  const h = harness('/classroom-resources/'); h.run(); h.run();
  assert.equal(h.links.length, 1);
  assert.equal(h.children.length, 1);
});

test('head-time initialization waits for main; missing main is harmless', () => {
  const h = harness('/language-arts/', { loading: true }); h.run();
  assert.equal(h.children.length, 0);
  assert.equal(h.callbacks.length, 1);
  h.callbacks[0]();
  assert.equal(h.children.length, 1);
  assert.doesNotThrow(() => harness('/language-arts/', { missingMain: true }).run());
});

test('stylesheet is opt-in scoped and all scenery is decorative and unblurred', () => {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of clean.matchAll(/([^{}]+)\{/g)) {
    const selectors = match[1].trim();
    if (selectors.startsWith('@')) continue;
    for (const selector of selectors.split(/,(?![^()]*\))/)) {
      assert.ok(selector.trim().startsWith('html.rc-public-canyonpath'), selector);
    }
  }
  assert.match(css, /pointer-events: none/);
  assert.match(css, /filter: none/);
  assert.match(css, /outline: 3px solid var\(--cp-focus\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(bootstrap, /fetch\(|XMLHttpRequest|sessionStorage|supabase|innerHTML|replaceChildren|removeChild|setItem|removeItem|clear\(|preventDefault|pushState|replaceState/);
  assert.doesNotMatch(css, /@import|https?:|data:image|!important/);
});

function rgb(hex) { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); }
function luminance(color) {
  const c = color.map((x) => x / 255 <= 0.04045 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4);
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
test('public reading surfaces retain text contrast even without background blur', () => {
  for (const selector of ['html.rc-public-canyonpath body', "html.rc-public-canyonpath[data-theme='light'] body"]) {
    const block = css.slice(css.indexOf(selector + ' {')).split('}')[0];
    const tokens = Object.fromEntries([...block.matchAll(/--cp-([a-z]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
    const [r, g, b, alpha] = tokens.panel.match(/[\d.]+/g).map(Number);
    for (const underneath of [0, 255]) {
      const background = [r, g, b].map((c) => c * alpha + underneath * (1 - alpha));
      const a = luminance(background);
      for (const token of ['ink', 'muted', 'accent']) {
        const b = luminance(rgb(tokens[token]));
        assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, selector + ' ' + token);
      }
    }
  }
});

test('public pages use the same standalone scene with accurate native dimensions', () => {
  assert.match(bootstrap, /image.width = 1672/);
  assert.match(bootstrap, /image.height = 941/);
  assert.match(bootstrap, /rc-annotated-canyon-approved\.webp\?v=20260908-annotated4/);
  assert.match(bootstrap, /public-canyonpath\.css\?v=20260907-moonlit1/);
  assert.doesNotMatch(bootstrap, /https?:|data:image|home-arizona\.svg/);
  assert.match(css, /approved standalone scene/);
});


test('Home opts into navigation polish but keeps its own existing theme and scene', () => {
  for (const path of ['/', '/index.html']) {
    const h = harness(path); h.run(); h.run();
    assert.ok(h.classes.has('rc-public-navigation'));
    assert.equal(h.classes.has('rc-public-canyonpath'), false);
    assert.equal(h.links.length, 0);
    assert.equal(h.children.length, 0);
    assert.equal(h.callbacks.length, 0);
    assert.equal(h.extraLinks.length, 2);
  }
});

test('Critical public CSS is render-blocking before insertion; scenery is preloaded once', () => {
  const h = harness('/classroom-resources/', { loading: true }); h.run(); h.run();
  assert.equal(h.links.length, 1);
  const styles = [...h.links, ...h.extraLinks].filter((link) => link.rel === 'stylesheet');
  assert.equal(styles.length, 2);
  for (const style of styles) assert.equal(style.attributes.blocking, 'render');
  assert.ok(bootstrap.indexOf("link.setAttribute('blocking', 'render')") < bootstrap.indexOf('document.head.appendChild(link)'));
  const preloads = h.extraLinks.filter((link) => link.rel === 'preload');
  assert.equal(preloads.length, 1);
  assert.equal(preloads[0].as, 'image');
  assert.equal(preloads[0].href, '/assets/bg/rc-annotated-canyon-approved.webp?v=20260908-annotated4');
  assert.equal(h.children.length, 0, 'preload happens before DOM readiness');
  h.callbacks.forEach((fn) => fn());
  assert.equal(h.children.length, 1);
  assert.equal(h.children[0].children[0].src, preloads[0].href);
});

test('First-paint sidebar matches the existing later public-shell defaults and preferences', () => {
  for (const path of ['/', '/language-arts/', '/classroom-resources/']) {
    for (const width of [390, 768, 769, 1024, 1440]) {
      for (const saved of [null, 'collapsed', 'expanded', 'unrecognized']) {
        const h = harness(path, { width, saved }); h.run();
        assert.equal(h.classes.has('tc-collapsed'), width <= 768 || saved !== 'expanded', `${path} ${width} ${saved}`);
      }
    }
    const h = harness(path, { storageDenied: true });
    assert.doesNotThrow(() => h.run());
    assert.ok(h.classes.has('tc-collapsed'));
  }
});

test('Navigation enhancement is optional, short, scoped, and reduced-motion aware', () => {
  const navigationCss = fs.readFileSync('site/assets/css/public-navigation.css', 'utf8');
  assert.match(navigationCss, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(navigationCss, /@view-transition \{ navigation: auto; \}/);
  assert.match(navigationCss, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*@view-transition \{ navigation: none; \}/);
  assert.match(navigationCss, /animation-duration: 140ms/);
  const clean = navigationCss.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of clean.matchAll(/([^{}]+)\{/g)) {
    if (match[1].trim().startsWith('@')) continue;
    for (const selector of match[1].split(',')) assert.ok(selector.trim().startsWith('html.rc-public-navigation'));
  }
  assert.doesNotMatch(navigationCss, /opacity:\s*0|visibility:\s*hidden|display:\s*none|@import|https?:/);
});


test('Original sidebar and Student Portal bootstrap prefix is unchanged', () => {
  const { createHash } = require('node:crypto');
  const prefix = source.slice(0, offset);
  // The separately scoped Teacher initializer is now a sibling in this file.
  // Pin its exact bytes before excluding it; retain the original public/Student
  // digest so unrelated bootstrap edits, duplicate blocks or moved code fail.
  const teacherBlock = prefix.match(/\/\/ BEGIN TEACHER FIRST PAINT\n[\s\S]*?\/\/ END TEACHER FIRST PAINT\n\n/);
  if (teacherBlock) {
    assert.equal(createHash('sha256').update(teacherBlock[0]).digest('hex'), 'b96bc9fc985f679ab2d23e64d360dc3ba5ae298e5724194b2469a6c0e690d689', 'Only the reviewed Teacher-only block may be excluded');
  }
  const originalPrefix = teacherBlock ? prefix.replace(teacherBlock[0], '') : prefix;
  assert.equal(createHash('sha256').update(originalPrefix).digest('hex'), '113fdc19bfff470fcb87f4df19cae88a16e23db7da5c2a0fb85a9dd972e24d61');
});
