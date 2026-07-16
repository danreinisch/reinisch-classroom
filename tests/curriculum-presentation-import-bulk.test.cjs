/* global require */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const unitsData = JSON.parse(fs.readFileSync('site/assets/data/units.json', 'utf8'));
const state = JSON.parse(fs.readFileSync('site/assets/data/site-state.json', 'utf8'));
const index = JSON.parse(fs.readFileSync('site/assets/content/lessons-index.json', 'utf8'));
const units = Array.isArray(unitsData) ? unitsData : unitsData.units;
const indexedUnits = (index.sections || []).flatMap(section => section.units || []);
const indexedRoutes = indexedUnits.flatMap(unit =>
  (unit.presentations || []).map(presentation => presentation.url)
);

const expected = [
  ['1984-2026-27', '1984', 'book', 'language-arts', 14, 50, 'presentations/1984-2026-27', '/language-arts/collection/'],
  ['seeker-2026-27', 'Seeker', 'book', 'language-arts', 19, 60, 'presentations/seeker-2026-27', '/language-arts/collection/'],
  ['escape-camp-14-2026-27', 'Escape from Camp 14', 'book', 'language-arts', 9, 70, 'presentations/escape-camp-14-2026-27', '/language-arts/collection/'],
  ['lik-2026-27', 'Lost in Kragdon-Ah', 'book', 'language-arts', 16, 80, 'presentations/lik-2026-27', '/language-arts/collection/'],
  ['adit-2026-27', 'A Door Into Time', 'book', 'language-arts', 15, 90, 'presentations/adit-2026-27', '/language-arts/collection/'],
  ['wok-2026-27', 'Warrior of Kragdon-Ah', 'book', 'language-arts', 18, 100, 'presentations/wok-2026-27', '/language-arts/collection/'],
  ['rfk-2026-27', 'Return from Kragdon-Ah', 'book', 'language-arts', 15, 110, 'presentations/rfk-2026-27', '/language-arts/collection/'],
  ['life-sc-2026-27', 'Life Skills SC', 'collection', 'life-skills', 37, 50, 'life-skills/presentations-2026-27', '/life-skills/']
];

function decodeEntities(value) {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&eacute;', 'é')
    .replaceAll('&times;', '×')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

assert.strictEqual(new Set(indexedRoutes).size, 143);
let verifiedFiles = 0;

for (const [id, title, kind, section, slots, sortOrder, baseOut, pagePath] of expected) {
  const unit = units.find(candidate => candidate.id === id);
  const category = state.categories?.[id];
  const indexedUnit = indexedUnits.find(candidate => candidate.id === id);

  assert.ok(unit, `${id} missing from units.json`);
  assert.ok(category, `${id} missing from site-state`);
  assert.ok(indexedUnit, `${id} missing from lesson discovery`);
  assert.deepStrictEqual(
    [unit.title, unit.kind, unit.section, unit.slots, unit.sortOrder, unit.baseOut, unit.pagePath, unit.status],
    [title, kind, section, slots, sortOrder, baseOut, pagePath, 'active']
  );
  assert.deepStrictEqual(
    [category.slots, category.titles.length, category.links.length, indexedUnit.presentations.length],
    [slots, slots, slots, slots]
  );

  const encodedEntityPattern =
    /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i;

  for (const displayTitle of category.titles) {
    assert.doesNotMatch(
      displayTitle,
      encodedEntityPattern,
      `${id} site-state title must use decoded display text`
    );
  }

  for (const presentation of indexedUnit.presentations) {
    assert.doesNotMatch(
      presentation.name,
      encodedEntityPattern,
      `${id} discovery title must use decoded display text`
    );
  }

  for (let slot = 1; slot <= slots; slot += 1) {
    const slotName = `presentation-${String(slot).padStart(2, '0')}`;
    const route = `/${baseOut}/${slotName}/`;
    const file = path.join('site', baseOut, slotName, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const documentTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';

    assert.strictEqual(category.links[slot - 1], route);
    assert.ok(indexedRoutes.includes(route), `discovery missing ${route}`);
    assert.strictEqual(decodeEntities(documentTitle.trim()), category.titles[slot - 1]);

    for (const animation of ['drift', 'drift2', 'bob', 'spin', 'shimmer']) {
      assert.match(html, new RegExp(`animation\\s*:\\s*${animation}\\b`, 'i'));
    }

    assert.match(html, /prefers-reduced-motion\s*:\s*reduce/i);
    assert.match(html, /fonts\.googleapis\.com/i);
    assert.strictEqual(
      (html.match(/<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/gi) || []).length,
      1
    );
    verifiedFiles += 1;
  }
}

assert.strictEqual(verifiedFiles, 143);
assert.strictEqual(indexedUnits.find(unit => unit.id === 'life-sc-2026-27').groups.length, 3);
for (const retiredId of ['adit', 'lik', 'rfk', 'wok', 'life']) {
  assert.ok(!indexedUnits.some(unit => unit.id === retiredId));
}

console.log('PASS: 143 presentation files, titles, animations, and discovery routes');
