// Exercise the actual standalone organizer with synthetic inputs. Expected
// answers are specified independently; no copy of its solver is used here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const source = process.env.RC_PYTHAGOREAN_HTML || path.resolve(__dirname,
  '../site/math-toolkit/presentations/geometry/presentation-05/pythagorean-theorem.html');
const html = fs.readFileSync(source, 'utf8');

function fixture(t) {
  const errors = [], pending = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: 'https://example.test/math-toolkit/pythagorean',
    runScripts: 'dangerously', virtualConsole: console,
    beforeParse(window) {
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.setTimeout = fn => { pending.push(fn); return pending.length; };
    },
  });
  const { window } = dom, { document } = window;
  t.after(() => { window.close(); assert.deepEqual(errors, []); });
  function flush() {
    let count = 0;
    while (pending.length) { assert.ok(count++ < 100, 'Timer loop'); pending.shift()(); }
  }
  function select(mode, values) {
    document.querySelector(`[data-prob="${mode}"]`).click();
    for (const [key, value] of Object.entries(values)) {
      const input = document.getElementById('known_' + key);
      input.value = String(value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    }
  }
  function begin() {
    assert.equal(document.getElementById('beginBtn').disabled, false,
      document.getElementById('knownFeedback')?.textContent);
    document.getElementById('beginBtn').click();
    flush();
  }
  function answer(step, row, value, expected = true) {
    const input = document.getElementById(`row_${step}_${row}_input`);
    assert.ok(input, `Missing answer box ${step}/${row}`);
    assert.equal(input.disabled, false, `Answer box ${step}/${row} must be available`);
    input.value = String(value);
    document.getElementById(`row_${step}_${row}_btn`).click();
    assert.equal(input.classList.contains('correct'), expected,
      `Answer ${value} in ${step}/${row}: ${document.getElementById('fb_' + step).textContent}`);
    flush();
  }
  function verdict() {
    const button = document.querySelector('#dynStep_3 .begin-btn');
    assert.equal(button.disabled, false);
    button.click();
    flush();
    return document.getElementById('finalValue').textContent;
  }
  function verify(mode, values, squares, sum) {
    select(mode, values); begin();
    squares.forEach((value, row) => answer(1, row, value));
    answer(2, 0, sum);
    return verdict();
  }
  return { window, document, select, begin, answer, verdict, verify, flush,
    result: () => document.getElementById('finalValue').textContent,
    copied: () => window.buildProblemText(),
  };
}

test('4–8–9 is not right, with correct displayed comparison and copied verdict', t => {
  const f = fixture(t);
  assert.match(f.verify('is_right', { a: 4, b: 8, c: 9 }, [16, 64, 81], 80), /NOT a Right Triangle/);
  assert.match(f.document.getElementById('fb_3').textContent, /80 ≠ 81/);
  assert.doesNotMatch(f.document.getElementById('fb_3').textContent, /80 = 81/);
  assert.match(f.copied(), /Result: NOT a right triangle/);
  assert.doesNotMatch(f.copied(), /undefined|NaN|Infinity/);
});

test('incorrect near answers are rejected and cannot alter later calculations', t => {
  const f = fixture(t);
  f.select('is_right', { a: 4, b: 8, c: 9 }); f.begin();
  f.answer(1, 0, '16.1', false);
  f.answer(1, 0, '15.99', false);
  f.answer(1, 0, '16.000');
  f.answer(1, 1, 64); f.answer(1, 2, 81);
  f.answer(2, 0, 81, false);
  f.answer(2, 0, 80);
  assert.match(f.verdict(), /NOT a Right Triangle/);
});

test('small decimal right triangle retains exact nonzero squares', t => {
  const f = fixture(t);
  assert.match(f.verify('is_right', { a: '.03', b: '.04', c: '.05' },
    ['.0009', '.0016', '.0025'], '.0025'), /YES/);
  assert.match(f.document.getElementById('fb_3').textContent, /0\.0025 = 0\.0025/);
  assert.match(f.copied(), /0\.0009/);
});

test('decimal almost-right triangle remains unequal at the supported precision', t => {
  const f = fixture(t);
  assert.match(f.verify('is_right', { a: '.03', b: '.04', c: '.050000000001' },
    ['.0009', '.0016', '.002500000000100000000001'], '.0025'), /NOT a Right Triangle/);
});

test('minimum-scale sides and scientific notation retain their meaning', t => {
  const f = fixture(t);
  assert.match(f.verify('is_right', { a: '3e-12', b: '4e-12', c: '5e-12' },
    ['9e-24', '16e-24', '25e-24'], '25e-24'), /YES/);
});

test('large exact squares above Number safe-integer precision still compare correctly', t => {
  const f = fixture(t);
  assert.match(f.verify('is_right', { a: 300000000, b: 400000000, c: '500000000.000000000001' },
    ['90000000000000000', '160000000000000000', '250000000000000000.001000000000000000000001'],
    '250000000000000000'), /NOT a Right Triangle/);
});

for (const [name, mode, values, message] of [
  ['zero side', 'is_right', { a: 0, b: 4, c: 4 }, /greater than zero/],
  ['negative side', 'hypotenuse', { a: -3, b: 4 }, /greater than zero/],
  ['degenerate triangle', 'is_right', { a: 1, b: 2, c: 3 }, /cannot form a triangle/],
  ['impossible triangle', 'is_right', { a: 1, b: 2, c: 4 }, /cannot form a triangle/],
  ['c not longest', 'is_right', { a: 5, b: 4, c: 3 }, /longest side/],
  ['hypotenuse shorter than leg', 'leg_a', { c: 4, b: 5 }, /longer than/],
  ['hypotenuse equal to leg', 'leg_a', { c: 5, b: 5 }, /longer than/],
  ['decimal triple', 'pythagorean_triples', { a: '.3', b: '.4', c: '.5' }, /whole numbers/],
  ['oversize number', 'hypotenuse', { a: '1000000000.000000000001', b: 4 }, /1 billion/],
  ['excess decimal places', 'hypotenuse', { a: '1e-13', b: 4 }, /12 decimal places/],
  ['infinite number', 'hypotenuse', { a: 'Infinity', b: 4 }, /valid number/],
  ['overflow notation', 'hypotenuse', { a: '1e309', b: 4 }, /valid number/],
  ['malformed number', 'hypotenuse', { a: '3junk', b: 4 }, /valid number/],
  ['empty number', 'hypotenuse', { a: '', b: 4 }, /valid number/],
]) {
  test(`invalid input: ${name}`, t => {
    const f = fixture(t);
    f.select(mode, values);
    assert.equal(f.document.getElementById('beginBtn').disabled, true);
    assert.match(f.document.getElementById('knownFeedback').textContent, message);
    f.window.beginSteps(); // The handler must validate too, not just the button.
    assert.equal(f.document.getElementById('stepsContainer').childElementCount, 0);
    assert.equal(f.document.getElementById('finalCard').classList.contains('visible'), false);
  });
}

test('whole-number triples pass; valid non-right integer triangles do not', t => {
  const f = fixture(t);
  assert.match(f.verify('pythagorean_triples', { a: 8, b: 15, c: 17 }, [64, 225, 289], 289), /Pythagorean Triple!/);
  assert.match(f.verify('pythagorean_triples', { a: 4, b: 8, c: 9 }, [16, 64, 81], 80), /NOT a Pythagorean Triple/);
  assert.doesNotMatch(f.document.getElementById('finalLabel').textContent, /Triple Verified/);
});

test('hypotenuse, missing-leg, and coordinate-distance ordinary cases remain correct', t => {
  const f = fixture(t);
  f.select('hypotenuse', { a: 3, b: 4 }); f.begin();
  f.answer(1, 0, 9); f.answer(1, 1, 16); f.answer(2, 0, 25); f.answer(3, 0, 5);
  assert.equal(f.result(), '5 cm');
  f.select('leg_a', { c: 13, b: 5 }); f.begin();
  f.answer(1, 0, 169); f.answer(1, 1, 25); f.answer(2, 0, 144); f.answer(3, 0, 12);
  assert.equal(f.result(), '12 cm');
  f.select('distance', { x1: 3, y1: -2, x2: -1, y2: 1 }); f.begin();
  assert.match(f.document.querySelector('#dynStep_0 .expr-display').textContent, /1−\(-2\)/);
  assert.doesNotMatch(f.document.querySelector('#dynStep_0 .expr-display').textContent, /\(-4\)²/);
  f.answer(1, 0, -4); f.answer(1, 1, 3);
  assert.match(f.document.querySelector('#dynStep_2 .compute-expr').textContent, /\(-4\)²/);
  f.answer(2, 0, 16); f.answer(2, 1, 9);
  f.answer(3, 0, 25); f.answer(4, 0, 5);
  assert.equal(f.result(), '5 cm');
  assert.match(f.copied(), /1 − \(-2\) = 3/);
  assert.doesNotMatch(f.copied(), /<[^>]*>|undefined|NaN/);
});

test('exact decimal roots stay exact and wrong nearby roots are not accepted', t => {
  const f = fixture(t);
  f.select('leg_a', { c: '.05', b: '.04' }); f.begin();
  f.answer(1, 0, '.0025'); f.answer(1, 1, '.0016'); f.answer(2, 0, '.0009');
  f.answer(3, 0, '.031', false); f.answer(3, 0, '.03');
  assert.equal(f.result(), '0.03 cm');
});

test('irrational roots use stated precision and carry approximation signs into copied work', t => {
  const f = fixture(t);
  f.select('hypotenuse', { a: 2, b: 3 }); f.begin();
  f.answer(1, 0, 4); f.answer(1, 1, 9); f.answer(2, 0, 13);
  assert.match(f.document.querySelector('#dynStep_3 .sqrt-note').textContent, /2 decimal places/);
  assert.match(f.document.querySelector('#dynStep_3 .compute-expr').textContent, /≈/);
  f.answer(3, 0, '3.65', false); f.answer(3, 0, '3.6', false);
  f.answer(3, 0, '3.605551275463989');
  assert.equal(f.result(), '≈ 3.61 cm');
  assert.match(f.copied(), /√13 ≈ 3\.61/);
  assert.match(f.copied(), /Hypotenuse \(c\) ≈ 3\.61 cm/);
});

test('very small irrational roots never turn a positive length into zero', t => {
  const f = fixture(t);
  f.select('hypotenuse', { a: '1e-12', b: '1e-12' }); f.begin();
  f.answer(1, 0, '1e-24'); f.answer(1, 1, '1e-24'); f.answer(2, 0, '2e-24');
  assert.match(f.document.querySelector('#dynStep_3 .sqrt-note').textContent, /14 decimal places/);
  f.answer(3, 0, 0, false); f.answer(3, 0, '1.41e-12');
  assert.equal(f.result(), '≈ 0.00000000000141 cm');
});

test('coincident coordinate points have distance zero, with valid negative coordinates', t => {
  const f = fixture(t);
  f.select('distance', { x1: -2, y1: 0, x2: -2, y2: 0 }); f.begin();
  f.answer(1, 0, 0); f.answer(1, 1, 0); f.answer(2, 0, 0); f.answer(2, 1, 0);
  f.answer(3, 0, 0); f.answer(4, 0, 0);
  assert.equal(f.result(), '0 cm');
});

test('later controls cannot be used before their prerequisite arithmetic', t => {
  const f = fixture(t);
  f.select('is_right', { a: 3, b: 4, c: 5 }); f.begin();
  assert.equal(f.document.getElementById('row_2_0_input').disabled, true);
  assert.equal(f.window.getComputedStyle(f.document.querySelector('#dynStep_2 .step-body')).display, 'none');
  assert.equal(f.document.querySelector('#dynStep_3 button').disabled, true);
  f.window.unlockStep(3); f.window.renderVerdict(3);
  assert.equal(f.document.querySelector('#dynStep_3 button').disabled, true);
  assert.equal(f.document.getElementById('finalCard').classList.contains('visible'), false);
  f.answer(1, 0, 9); f.answer(1, 1, 16); f.answer(1, 2, 25);
  assert.notEqual(f.window.getComputedStyle(f.document.querySelector('#dynStep_2 .step-body')).display, 'none');
});

test('decimal parsing handles explicit plus signs and signed exponents', t => {
  const f = fixture(t);
  for (const [input, expected] of [['+3', '3'], ['+1.2', '1.2'], ['+.03', '0.03'],
    ['+3e+2', '300'], ['-3e-2', '-0.03'], ['-0', '0']]) {
    assert.equal(f.window.decimalText(f.window.readDecimal(input)), expected);
  }
});

test('reset and mode changes discard pending callbacks and previous results', t => {
  const f = fixture(t);
  f.verify('is_right', { a: 3, b: 4, c: 5 }, [9, 16, 25], 25);
  f.document.querySelector('.try-again-btn').click();
  assert.equal(f.document.getElementById('workspace').classList.contains('visible'), true);
  assert.equal(f.document.getElementById('known_a').value, '');
  f.select('hypotenuse', { a: 3, b: 4 });
  f.document.getElementById('beginBtn').click(); // Leave its unlock callback pending.
  f.select('leg_a', { c: 13, b: 5 });
  f.flush();
  assert.equal(f.document.getElementById('stepsContainer').childElementCount, 0);
  f.begin();
  assert.equal(f.document.getElementById('row_2_0_input').disabled, true);
  assert.equal(f.document.getElementById('finalCard').classList.contains('visible'), false);
});

test('exact comparison agrees with an independent small-integer triangle enumeration', t => {
  const f = fixture(t);
  for (let a = 1; a <= 25; a++) for (let b = a; b <= 25; b++) {
    for (let c = b; c <= 35 && c < a + b; c++) {
      assert.equal(f.window.isRightTriangle({ a, b, c }), a * a + b * b === c * c, `${a},${b},${c}`);
    }
  }
});

test('square-root rounding distinguishes values either side of a decimal midpoint', t => {
  const f = fixture(t);
  assert.equal(f.window.squareRootAnswer('2.002224999999').value, '1.41');
  assert.equal(f.window.squareRootAnswer('2.002225000001').value, '1.42');
  assert.equal(f.window.squareRootAnswer('2.002225').value, '1.415');
  assert.equal(f.window.squareRootAnswer('0').value, '0');
});
