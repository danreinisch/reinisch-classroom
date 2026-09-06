// Exercise the organizer's actual standalone script and student controls.
// Expected values and step sequences are specified independently of its parser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const source = process.env.RC_PEMDAS_HTML || path.resolve(__dirname,
  '../site/math-toolkit/presentations/algebra/pre-algebra/presentation-01/a1-order-of-operations (1).html');
const html = fs.readFileSync(source, 'utf8');

function fixture(t) {
  const pending = [], errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole,
    url: 'https://example.test/math-toolkit/pemdas',
    beforeParse(window) {
      window.setTimeout = fn => { pending.push(fn); return pending.length; };
    },
  });
  const { window } = dom, { document } = window;
  t.after(() => { window.close(); assert.deepEqual(errors, []); });
  const flush = () => { while (pending.length) pending.shift()(); };
  function calculate(expr) {
    const tokens = window.tokenize(expr);
    window.validateTokens(tokens);
    return window.generateAllSteps(tokens);
  }
  function begin(expr) {
    document.getElementById('exprInput').value = expr;
    document.getElementById('startBtn').click();
    flush();
  }
  function answer(idx, value, expected = true) {
    const input = document.getElementById('answer-' + idx);
    assert.ok(input, 'Missing step ' + idx);
    assert.equal(input.disabled, false);
    input.value = value;
    document.querySelector('#step-' + idx + ' .btn-check').click();
    assert.equal(input.disabled, expected, document.getElementById('feedback-' + idx).textContent);
    flush();
  }
  return { window, document, flush, calculate, begin, answer,
    value: expr => window.formatNumber(calculate(expr).finalValue),
    shown: () => document.getElementById('exprText').textContent,
    history: () => Array.from(document.querySelectorAll('.h-expr'), e => e.textContent),
    result: () => document.getElementById('resultExpr').textContent,
  };
}

for (const [expr, expected] of [
  ['-3^2', '-9'], ['(-3)^2', '9'], ['-(3+4)', '-7'], ['(-2)^3', '-8'],
  ['2^-3', '0.125'], ['-2^-2', '-0.25'], ['2^-3^2', '0.001953125'],
  ['2^3^2', '512'], ['(2^3)^2', '64'], ['20/5*2', '8'], ['18/3/2', '3'],
  ['10-4+3', '9'], ['10-4-3', '3'], ['0.1+0.2', '0.3'], ['(1/3)*3', '1'],
  ['1/3+1/6', '0.5'], ['0.000001*0.000001', '0.000000000001'],
  ['(2-5)^2', '9'], ['8/(2+2)*3', '6'], ['6+2*(9-4)^2', '56'],
  ['2+3*4^2', '50'], ['2−3×(4÷2)', '-4'], ['3 + +2', '5'], ['2--3', '5'],
  ['0^5', '0'], ['2^0', '1'],
]) {
  test(`exact arithmetic: ${expr} = ${expected}`, t => {
    const f = fixture(t);
    assert.equal(f.value(expr), expected);
  });
}

test('negative sign is applied after the power, while grouped negatives stay grouped', t => {
  const f = fixture(t);
  f.begin('-3^2');
  assert.match(f.shown(), /^-3 \^ 2$/);
  f.answer(0, '9');
  assert.equal(f.shown(), '-9');
  f.answer(1, '9', false); f.answer(1, '-9');
  assert.equal(f.result(), '-3^2 = -9');
  f.window.resetAll(); f.begin('(2-5)^2');
  f.answer(0, '-3');
  assert.equal(f.shown(), '(-3) ^ 2');
  f.answer(1, '9');
  assert.ok(f.history().some(expr => expr.includes('(-3)')));
  assert.ok(f.history().every(expr => !expr.includes('-3 ^ 2')));
});

test('chained powers teach and perform the right-hand power first', t => {
  const f = fixture(t);
  const { steps } = f.calculate('2^3^2');
  assert.deepEqual(Array.from(steps, s => s.operation), ['3 ^ 2', '2 ^ 9']);
  f.begin('2^3^2'); f.answer(0, '9'); f.answer(1, '512');
  assert.deepEqual(f.history(), ['2 ^ 3 ^ 2', '2 ^ 9', '512']);
  assert.match(f.document.querySelector('.step-instruction').textContent, /from the right/);
});

test('every built-in practice expression has the independently expected answer', t => {
  const f = fixture(t);
  const expected = ['15','9','9','11','9','27','30','3','24','7','12','14','28','2','16','6','46','7','59','56','4'];
  const examples = Array.from(f.document.querySelectorAll('.example-chip'), e => e.textContent);
  assert.equal(examples.length, expected.length);
  examples.forEach((expr, i) => assert.equal(f.value(expr), expected[i], expr));
});

test('malformed and unsupported expressions are rejected in full before any workspace opens', t => {
  const f = fixture(t);
  for (const expr of ['2(3+4)', '(2)(3)', '1 2+3', '1.2.3+4', '.', '()',
    '3+', '*3+2', '3**2', '(2+3', '2+3)', '2x+3', '1e309+1', 'sqrt(9)',
    '4=4', '<script>alert(1)</script>', '', '9^0.5', '2^(1/2)', '2^101',
    '0^0', '0^-1', '1/0', '1/(3-3)', '1000000001+1', '0.0000000000001+1',
    '('.repeat(21) + '2+3' + ')'.repeat(21), '1+'.repeat(130) + '1']) {
    assert.throws(() => f.calculate(expr), undefined, expr);
    f.begin(expr);
    assert.equal(f.document.getElementById('workspace').classList.contains('visible'), false, expr);
    assert.equal(f.document.getElementById('stepsContainer').children.length, 0, expr);
    assert.ok(f.document.getElementById('errorMsg').textContent, expr);
  }
});

test('incorrect near answers and numeric prefixes cannot earn correct feedback', t => {
  const f = fixture(t);
  f.begin('2+2');
  for (const answer of ['4.001','3.999','4junk','4/1junk','4 apples','Infinity','NaN','4+0','', '4/0']) {
    f.answer(0, answer, false);
    assert.equal(f.document.getElementById('resultSection').classList.contains('visible'), false);
  }
  f.answer(0, '4.000');
  assert.equal(f.result(), '2+2 = 4');
});

test('exact fractions accept equivalent forms and preserve repeating intermediates', t => {
  const f = fixture(t);
  f.begin('(1/3)*3');
  f.answer(0, '0.3333', false); f.answer(0, '2/6');
  assert.equal(f.shown(), '(1/3) × 3');
  f.answer(1, '1');
  assert.equal(f.result(), '(1/3)*3 = 1');
  assert.ok(f.history().every(expr => !expr.includes('0.3333')));
  f.window.resetAll(); f.begin('1/8'); f.answer(0, '2/16');
  assert.equal(f.result(), '1/8 = 0.125');
});

test('very small nonzero and large exact results keep their meaning', t => {
  const f = fixture(t);
  assert.equal(f.value('2^-50'), '1/1125899906842624');
  assert.equal(f.value('999999999^2'), '999999998000000001');
  assert.throws(() => f.calculate('999999999^100'), /too large/);
});

test('keyboard controls, answer labels, live feedback, and collapsed examples are available', t => {
  const f = fixture(t);
  const toggle = f.document.getElementById('examplesToggle');
  assert.equal(toggle.tagName, 'BUTTON');
  assert.equal(f.document.getElementById('examplesBody').hidden, true);
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(f.document.getElementById('examplesBody').hidden, false);
  const example = f.document.querySelector('.example-chip');
  assert.equal(example.tagName, 'BUTTON'); example.click();
  f.document.getElementById('exprInput').dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  f.flush();
  assert.match(f.document.querySelector('label[for="answer-0"]').textContent, /Step 1 answer/);
  assert.equal(f.document.getElementById('feedback-0').getAttribute('aria-live'), 'polite');
  const input = f.document.getElementById('answer-0'); input.value = '12';
  input.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  f.flush();
  assert.equal(input.disabled, true);
  assert.ok(f.document.getElementById('answer-1'));
});

test('reset, repeated submission, and stale timers cannot duplicate or skip steps', t => {
  const f = fixture(t);
  f.begin('2+3*4');
  f.window.checkAnswer(1); f.window.showResult();
  assert.equal(f.document.getElementById('resultSection').classList.contains('visible'), false);
  f.document.getElementById('answer-0').value = '12';
  f.document.querySelector('#step-0 .btn-check').click(); // Leave next-step timer pending.
  f.window.checkAnswer(0);
  f.document.getElementById('restartBtn').click();
  f.begin('10-4+3'); f.flush();
  assert.equal(f.document.querySelectorAll('.step-card').length, 1);
  assert.equal(f.document.querySelector('.step-operation').textContent, '10 - 4');
  f.answer(0, '6'); f.answer(1, '9');
  assert.equal(f.result(), '10-4+3 = 9');
  assert.equal(f.document.querySelectorAll('.step-card').length, 2);
});

test('operator precedence agrees with independently calculated small-integer cases', t => {
  const f = fixture(t);
  for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) for (let c = -3; c <= 3; c++) {
    assert.equal(f.value(`(${a})+(${b})*(${c})`), String(a + b * c));
    assert.equal(f.value(`(${a})-(${b})+(${c})`), String(a - b + c));
  }
});
