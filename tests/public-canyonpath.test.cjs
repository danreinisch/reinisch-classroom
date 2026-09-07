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

function harness(path, { loading = false, home = false, missingMain = false } = {}) {
  const classes = new Set();
  const links = [];
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
    documentElement: { classList: { add: (name) => classes.add(name) } },
    head: { appendChild: (link) => links.push(link) },
    querySelector(selector) {
      if (selector === '.tc-main') return missingMain ? null : main;
      if (selector === 'link[data-public-canyonpath]') return links[0];
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
  const context = vm.createContext({ document, window: { location: { pathname: path } } });
  return { classes, links, callbacks, children, homeImage, main, run: () => vm.runInContext(bootstrap, context) };
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
    assert.match(h.children[0].children[0].src, /^\/assets\/bg\/home-arizona\.svg\?v=/);
  }
});

test('Teacher Center, Portal, substitute auth, viewers, and individual lessons remain excluded', () => {
  for (const route of ['/', '/index.html', '/teacher', '/teacher/', '/teacher/index.html', '/teacher/students/', '/student', '/student/', '/student/index.html', '/substitute/', '/viewer/', '/admin/', '/math-toolkit/algebra/equations/', '/language-arts/toolkit/sentence-workshop/', '/presentations/language-arts-toolkit/']) {
    const h = harness(route); h.run();
    assert.equal(h.classes.size, 0, route);
    assert.equal(h.links.length, 0, route);
    assert.equal(h.children.length, 0, route);
    assert.equal(h.callbacks.length, 0, route);
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
  assert.doesNotMatch(bootstrap, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|supabase|innerHTML|replaceChildren|removeChild/);
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

test('public pages reuse the existing homepage illustration without a new remote dependency', () => {
  assert.match(bootstrap, /image.width = 2400/);
  assert.match(bootstrap, /image.height = 1350/);
  assert.doesNotMatch(bootstrap, /https?:|data:image|\.webp/);
  assert.match(css, /current homepage illustration until the realistic master is ready/);
});
