// Exercise the standalone organizer and real student controls. Expected values,
// signs, and worked examples are specified independently of the page's helpers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(process.env.RC_INTEGER_OPERATIONS_HTML || path.resolve(__dirname,
  '../site/math-toolkit/presentations/algebra/pre-algebra/presentation-02/a2-integer-operations (1).html'), 'utf8');

function fixture(t) {
  const pending = [], errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole,
    url: 'https://example.test/math-toolkit/integer-operations', beforeParse(window) {
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.setTimeout = fn => { pending.push(fn); return pending.length; };
    } });
  const { window } = dom, { document } = window;
  t.after(() => { window.close(); assert.deepEqual(errors, []); });
  const flush = () => { while (pending.length) pending.shift()(); };
  const getState = () => window.eval('state');
  function begin(a, op, b) {
    document.getElementById('inputA').value = a;
    document.getElementById('inputB').value = b;
    if (op) document.querySelector(`[data-op="${op}"]`).click();
    document.getElementById('startBtn').click();
  }
  function choose(container, text) {
    const button = Array.from(container.querySelectorAll('button')).find(el => el.textContent === text);
    assert.ok(button, 'Missing choice: ' + text); assert.equal(button.disabled, false);
    button.click(); return button;
  }
  function signs(first, second) {
    const idx = getState().currentStep;
    choose(document.getElementById(`signcheck-${idx}-0`), first);
    choose(document.getElementById(`signcheck-${idx}-1`), second);
    flush();
  }
  function numeric(text, correct = true, advance = true) {
    const idx = getState().currentStep, input = document.getElementById('answer-' + idx);
    assert.ok(input, 'Expected numeric step: ' + idx); assert.equal(input.disabled, false);
    input.value = text;
    document.querySelector(`#step-${idx} .btn-check`).click();
    assert.equal(input.disabled, correct, document.getElementById('feedback-' + idx).textContent);
    if (advance) flush();
  }
  function actions(sequence) {
    for (const action of sequence) {
      if (Array.isArray(action)) { signs(...action); continue; }
      const idx = getState().currentStep, card = document.getElementById('step-' + idx);
      if (card.querySelector('input')) numeric(action);
      else { choose(card, action === 'continue' ? 'Got It →' : action); flush(); }
    }
  }
  return { window, document, flush, getState, begin, choose, signs, numeric, actions,
    result: () => document.getElementById('resultExpr').textContent,
    visible: () => document.getElementById('resultSection').classList.contains('visible'),
    reset: () => window.resetAll(),
  };
}

test('zero is never classified as positive or negative in any operation', t => {
  const f = fixture(t);
  for (const [a, op, b, expected] of [[0,'+',-6,-6],[-6,'+',0,-6],[0,'*',5,0],[-12,'*',0,0],[0,'/',5,0],[0,'/',-5,0],[0,'*',0,0],[0,'+',0,0]]) {
    f.reset(); f.begin(a, op, b);
    const checks = f.getState().stepsData[0].checks;
    const expectedSigns = [a,b].map(value => value === 0 ? 'Zero' : value > 0 ? 'Positive' : 'Negative');
    assert.deepEqual(Array.from(checks, check => check.answer), expectedSigns);
    const ci = a === 0 ? 0 : 1;
    f.choose(f.document.getElementById(`signcheck-0-${ci}`), 'Positive');
    assert.match(f.document.getElementById('feedback-0').textContent, /neither positive nor negative/);
    assert.equal(f.getState().currentStep, 0);
    f.signs(...expectedSigns); f.numeric(String(expected));
    assert.ok(f.visible()); assert.match(f.result(), new RegExp('= ' + expected + '$'));
    assert.equal(f.document.querySelector('.expr-val.zero').textContent, '0');
  }
});

test('opposites cancel without inventing a larger absolute value or a sign for zero', t => {
  const f = fixture(t);
  for (const [a,op,b,actions] of [
    [-8,'+',8,[['Negative','Positive'],'0']], [8,'+',-8,[['Positive','Negative'],'0']],
    [-1,'-',-1,['continue','1',['Negative','Positive'],'0']], [5,'-',5,['continue','-5',['Positive','Negative'],'0']],
  ]) {
    f.reset(); f.begin(a,op,b);
    const prose = f.getState().stepsData.map(step => step.instruction + (step.rule || '')).join(' ');
    assert.doesNotMatch(prose, /larger absolute value|answer is <strong>(?:negative|positive)/);
    assert.match(prose, /equal absolute values/);
    f.actions(actions); assert.match(f.result(), /= 0$/);
    assert.match(f.document.getElementById('resultRuleSummary').textContent, /cancel to zero/);
  }
});

test('whole-input validation rejects numeric prefixes, decimals, and out-of-range integers', t => {
  const f = fixture(t);
  const invalid = ['5junk', '', ' ', '5 apples', '5/2', '5.5', '5.0', '1e3', '0x10', 'Infinity', 'NaN',
    '1 2', '--2', '++2', '+', '-', '1,000', '<img src=x onerror=alert(1)>',
    '1000000001', '-1000000001', '9007199254740993', '9'.repeat(1000)];
  for (const value of invalid) for (const side of ['a','b']) {
    f.reset(); f.begin(side === 'a' ? value : '2', '+', side === 'b' ? value : '2');
    assert.equal(f.document.getElementById('workspace').classList.contains('visible'), false, value);
    assert.equal(f.document.getElementById('stepsContainer').children.length, 0, value);
    assert.ok(f.document.getElementById('errorMsg').textContent, value);
    f.flush();
    assert.ok(f.document.getElementById('errorMsg').classList.contains('show'), 'Validation stays available to read');
  }
});

test('signed integer syntax is preserved and signed zero is normalized', t => {
  const f = fixture(t);
  for (const [a,b,expected] of [[' −005 ',' +03 ','-2'],['-0','+0','0'],['00012','-002','10']]) {
    f.reset(); f.begin(a,'+',b);
    assert.equal(f.window.fmtNum(f.getState().answer), expected);
    assert.doesNotMatch(f.document.getElementById('exprDisplay').textContent, /-0/);
  }
});

test('division by zero and a missing operation are blocked before a workspace opens', t => {
  const f = fixture(t);
  for (const [a,op,b] of [[5,'/',0],[0,'/',0],[-5,'/','-0'],[3,null,4]]) {
    f.reset(); f.begin(a,op,b);
    assert.equal(f.document.getElementById('workspace').classList.contains('visible'), false);
    assert.match(f.document.getElementById('errorMsg').textContent, op ? /zero.*undefined/ : /select an operation/);
  }
});

test('near answers, truncated prefixes, and rounded repeating decimals cannot earn credit', t => {
  const f = fixture(t); f.begin(-3,'*',7);
  f.signs('Negative','Positive'); f.actions(['Different → Negative']);
  for (const value of ['21.001','20.999','21junk','21 apples','21+0','21/0','','NaN','Infinity','-21']) {
    f.numeric(value, false); assert.equal(f.visible(), false);
  }
  f.numeric('21.000'); f.actions(['-21']); assert.match(f.result(), /= -21$/);
  f.reset(); f.begin(1,'/',3); f.signs('Positive','Positive'); f.actions(['Same → Positive']);
  for (const value of ['0.3333','0.33','0','1/3junk','1/0','1.0/3','1/3/1']) f.numeric(value, false);
  f.numeric('2 / 6'); f.actions(['1/3']); assert.equal(f.result(), '1 ÷ 3 = 1/3');
  assert.doesNotMatch(f.document.getElementById('workspace').textContent, /0\.3333/);
});

test('equivalent exact answer forms work without losing signs or precision', t => {
  const f = fixture(t);
  for (const [raw,n,d] of [['+21.000',21n,1n],['−.5',-1n,2n],['2/-6',-1n,3n],['-2/-6',1n,3n],['.000000001',1n,1000000000n],['0/-3',0n,1n]]) {
    const actual = f.window.readAnswer(raw); assert.equal(actual.n,n); assert.equal(actual.d,d);
  }
  f.begin(-7,'/',2); f.actions([['Negative','Positive'],'Different → Negative','7/2','-3.5']);
  assert.equal(f.result(), '-7 ÷ 2 = -3.5');
  f.reset(); f.begin(-5,'-',0); f.actions(['continue','-0',['Negative','Zero'],'-5']);
  assert.equal(f.result(), '-5 − 0 = -5');
});

const examples = [
  [-3,'+',5,'2',[['Negative','Positive'],'continue','2','2']],
  [7,'+',4,'11',[['Positive','Positive'],'continue','11','11']],
  [-6,'+',-2,'-8',[['Negative','Negative'],'continue','8','-8']],
  [-8,'+',8,'0',[['Negative','Positive'],'0']],
  [12,'+',-5,'7',[['Positive','Negative'],'continue','7','7']],
  [0,'+',-6,'-6',[['Zero','Negative'],'-6']],
  [5,'-',9,'-4',['continue','-9',['Positive','Negative'],'continue','4','-4']],
  [-4,'-',3,'-7',['continue','-3',['Negative','Negative'],'continue','7','-7']],
  [-6,'-',-2,'-4',['continue','2',['Negative','Positive'],'continue','4','-4']],
  [10,'-',-7,'17',['continue','7',['Positive','Positive'],'continue','17','17']],
  [-1,'-',-1,'0',['continue','1',['Negative','Positive'],'0']],
  [7,'-',0,'7',['continue','0',['Positive','Zero'],'7']],
  [-3,'*',7,'-21',[['Negative','Positive'],'Different → Negative','21','-21']],
  [4,'*',-6,'-24',[['Positive','Negative'],'Different → Negative','24','-24']],
  [-5,'*',-8,'40',[['Negative','Negative'],'Same → Positive','40','40']],
  [9,'*',3,'27',[['Positive','Positive'],'Same → Positive','27','27']],
  [-12,'*',0,'0',[['Negative','Zero'],'0']],
  [0,'*',5,'0',[['Zero','Positive'],'0']],
  [-24,'/',6,'-4',[['Negative','Positive'],'Different → Negative','4','-4']],
  [36,'/',-4,'-9',[['Positive','Negative'],'Different → Negative','9','-9']],
  [-45,'/',-9,'5',[['Negative','Negative'],'Same → Positive','5','5']],
  [0,'/',5,'0',[['Zero','Positive'],'0']],
  [-72,'/',-8,'9',[['Negative','Negative'],'Same → Positive','9','9']],
  [1,'/',3,'1/3',[['Positive','Positive'],'Same → Positive','1/3','1/3']],
  [-7,'/',2,'-3.5',[['Negative','Positive'],'Different → Negative','3.5','-3.5']],
];

test('every built-in practice problem completes with independent answers for every step', t => {
  const f = fixture(t), chips = Array.from(f.document.querySelectorAll('.example-chip'));
  assert.equal(chips.length, examples.length);
  examples.forEach(([a,op,b,answer,actions], idx) => {
    f.reset(); chips[idx].click();
    assert.equal(f.document.getElementById('inputA').value,String(a));
    assert.equal(f.document.getElementById('inputB').value,String(b));
    assert.equal(f.document.querySelector('.op-btn.selected').dataset.op,op);
    f.document.getElementById('startBtn').click();
    f.actions(actions); assert.ok(f.visible(), chips[idx].textContent);
    assert.ok(f.result().endsWith('= '+answer), f.result());
    assert.equal(f.document.querySelectorAll('.step-card').length,actions.length);
    assert.equal(f.document.querySelectorAll('.step-card button:not(:disabled), .step-card input:not(:disabled)').length,0);
  });
});

test('all four operations agree with independent integer identities for 1,743 small cases', t => {
  const f = fixture(t); let count=0;
  for (let a=-10;a<=10;a++) for(let b=-10;b<=10;b++) for(const op of ['+','-','*','/']) {
    if (op==='/' && b===0) continue;
    const value = f.window.calculate(BigInt(a),op,BigInt(b));
    if(op==='/') assert.equal(value.n*BigInt(b),BigInt(a)*value.d, `${a}/${b}`);
    else {
      const expected = op==='+' ? a+b : op==='-' ? a-b : a*b;
      assert.equal(value.n,BigInt(expected)*value.d,`${a}${op}${b}`);
    }
    assert.ok(value.d>0n); count++;
  }
  assert.equal(count,1743);
});

for(const [a,op,b,expected] of [
  ['999999999','*','999999999','999999998000000001'],
  ['-1000000000','*','1000000000','-1000000000000000000'],
  ['1000000000','+','1000000000','2000000000'],
  ['-1000000000','-','1000000000','-2000000000'],
  ['1','/','1000000000','0.000000001'],
  ['-1','/','999999999','-1/999999999'],
  ['1','/','536870912','1/536870912'],
]) test(`exact boundary result: ${a} ${op} ${b} = ${expected}`,t=>{
  const f=fixture(t); f.begin(a,op,b);
  assert.equal(f.window.fmtNum(f.getState().answer),expected);
});

test('large multiplication accepts the exact integer and rejects rounded machine-number answers', t => {
  const f=fixture(t); f.begin('999999999','*','999999999');
  f.actions([['Positive','Positive'],'Same → Positive']);
  f.numeric('999999998000000000',false); f.numeric('999999998000000001');
  f.actions(['999999998000000001']); assert.match(f.result(),/= 999999998000000001$/);
});

test('number lines have bounded ticks, correct directions, exact endpoints, and zero movement', t => {
  const f=fixture(t);
  for(const [a,op,b,words,answer] of [[5,'+',-9,'9 units left',-4],[-5,'-',-9,'9 units right',4],[4,'-',0,'no movement',4],[-1000000000,'-',1000000000,'1000000000 units left',-2000000000],[1000000000,'+',1,'1 unit right',1000000001]]) {
    f.reset(); f.begin(a,op,b);
    const caption=f.document.getElementById('numberLineCaption');
    assert.match(caption.textContent,new RegExp(words));
    f.window.drawNumberLine(true);
    assert.ok(caption.textContent.endsWith('Land at '+answer+'.'));
    assert.ok(f.document.querySelectorAll('.number-line-tick').length<=14);
    assert.ok(f.document.querySelectorAll('.number-line-tick').length>=2);
    const svg=f.document.getElementById('numberLineSvg');
    assert.doesNotMatch(svg.innerHTML,/NaN|Infinity/);
    assert.equal(svg.querySelectorAll('.number-line-movement').length,b===0?0:1);
    assert.match(svg.querySelector('desc').textContent,new RegExp('Land at '+answer+'\\.'));
  }
});

test('repeated submissions cannot duplicate steps or skip the second sign', t => {
  const f=fixture(t); f.begin(-3,'*',7);
  const first=f.choose(f.document.getElementById('signcheck-0-0'),'Negative');
  first.click(); first.click(); f.flush(); assert.equal(f.getState().currentStep,0);
  f.choose(f.document.getElementById('signcheck-0-1'),'Positive');
  first.click(); f.flush();
  const signRule=f.choose(f.document.getElementById('step-1'),'Different → Negative');
  signRule.click(); signRule.click(); f.flush();
  f.numeric('21',true,false);
  const check=f.document.querySelector('#step-2 .btn-check'); check.click(); check.click();
  f.window.checkNumeric(2); f.flush();
  assert.equal(f.document.querySelectorAll('#step-3').length,1);
  f.actions(['-21']); f.window.finishProblem();
  assert.equal(f.document.querySelectorAll('.step-card').length,4);
  assert.equal(f.result(),'-3 × 7 = -21');
});

test('a new problem requires fresh sign answers and ignores stale transitions after reset', t => {
  const f=fixture(t); f.begin(0,'*',5);
  f.choose(f.document.getElementById('signcheck-0-0'),'Zero');
  f.choose(f.document.getElementById('signcheck-0-1'),'Positive');
  f.reset(); f.begin(-4,'+',2); f.flush();
  assert.equal(f.getState().currentStep,0);
  assert.equal(f.document.querySelectorAll('.step-card').length,1);
  f.choose(f.document.getElementById('signcheck-0-0'),'Negative'); f.flush();
  assert.equal(f.getState().currentStep,0);
  f.choose(f.document.getElementById('signcheck-0-1'),'Positive'); f.flush();
  f.actions(['continue']); f.numeric('2',true,false);
  f.reset(); f.begin(0,'/',-5); f.flush();
  assert.equal(f.getState().currentStep,0);
  f.signs('Zero','Negative'); f.numeric('0'); assert.equal(f.result(),'0 ÷ (-5) = 0');
  f.reset(); assert.equal(f.document.getElementById('resultExpr').textContent,'');
  assert.equal(f.document.getElementById('numberLineSvg').childNodes.length,0);
});

test('old rule buttons and early finish calls cannot advance an unanswered step', t => {
  const f=fixture(t); f.begin(5,'-',9);
  const old=f.choose(f.document.getElementById('step-0'),'Got It →');
  old.click(); f.window.completeStep(0); f.window.completeStep(1); f.window.finishProblem();
  assert.equal(f.getState().currentStep,1); assert.equal(f.visible(),false);
  f.numeric('-9'); assert.equal(f.document.querySelectorAll('.step-card').length,3);
});

test('keyboard controls, labeled answers, live feedback, and reset are available throughout',t=>{
  const f=fixture(t), toggle=f.document.getElementById('examplesToggle');
  assert.equal(toggle.tagName,'BUTTON'); assert.equal(f.document.getElementById('examplesBody').hidden,true);
  toggle.click(); assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.equal(f.document.getElementById('examplesBody').hidden,false);
  assert.ok(Array.from(f.document.querySelectorAll('.example-chip,.op-btn')).every(el=>el.tagName==='BUTTON'));
  assert.equal(f.document.querySelector('label[for="inputA"]').textContent,'First Integer');
  assert.equal(f.document.querySelector('label[for="inputB"]').textContent,'Second Integer');
  f.begin(-4,'-',3);
  assert.equal(f.document.querySelector('.op-btn.selected').getAttribute('aria-pressed'),'true');
  assert.equal(f.document.querySelector('.workspace-actions button').disabled,false);
  f.actions(['continue']);
  const input=f.document.getElementById('answer-1');
  assert.equal(f.document.activeElement,input);
  assert.match(f.document.querySelector('label[for="answer-1"]').textContent,/Step 2 answer/);
  assert.equal(f.document.getElementById('feedback-1').getAttribute('aria-live'),'polite');
  input.value='−3'; input.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  f.flush(); assert.equal(input.disabled,true);
  f.document.querySelector('.workspace-actions button').click();
  assert.equal(f.document.activeElement,f.document.getElementById('inputA'));
  f.document.getElementById('inputA').value='0';
  f.document.getElementById('inputA').dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Enter'}));
  assert.equal(f.document.activeElement,f.document.getElementById('inputB'));
  f.document.getElementById('inputB').value='5'; f.document.querySelector('[data-op="*"]').click();
  f.document.getElementById('inputB').dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Enter'}));
  f.signs('Zero','Positive'); f.numeric('0'); assert.equal(f.result(),'0 × 5 = 0');
});
