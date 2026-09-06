// Tests run the actual standalone page. Worked examples supply independent
// answers for every step; generated arithmetic uses cross-product identities.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(process.env.RC_FRACTIONS_HTML || path.resolve(__dirname,
  '../site/math-toolkit/presentations/algebra/pre-algebra/presentation-03/a3-fractions-mixed-numbers.html'), 'utf8');

function fixture(t) {
  const pending = [], errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole,
    url: 'https://example.test/math-toolkit/fractions', beforeParse(window) {
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.setTimeout = fn => { pending.push(fn); return pending.length; };
    } });
  const { window } = dom, { document } = window;
  t.after(() => { window.close(); assert.deepEqual(errors, []); });
  const flush = () => { while (pending.length) pending.shift()(); };
  const state = () => window.eval('S');
  const steps = () => window.eval('stepsData');
  const index = () => window.eval('currentStep');
  function begin(wA, nA, dA, op, wB, nB, dB) {
    const values = [wA,nA,dA,wB,nB,dB];
    ['wholeA','numA','denA','wholeB','numB','denB'].forEach((id,i) => { document.getElementById(id).value = values[i] == null ? '' : String(values[i]); });
    if (op) document.querySelector(`[data-op="${op}"]`).click();
    document.querySelector('.start-row button').click();
  }
  function submit(values, correct = true, advance = true) {
    if (!Array.isArray(values)) values = [values];
    const idx = index(), inputs = Array.from(document.querySelectorAll(`#step-${idx} input`));
    assert.equal(inputs.length,values.length,'Field count at '+steps()[idx].title);
    inputs.forEach((input,i) => { assert.equal(input.disabled,false); input.value=String(values[i]); });
    document.querySelector(`#step-${idx} .btn-check`).click();
    assert.equal(inputs.every(input=>input.disabled),correct,document.getElementById('fb-'+idx).textContent);
    if (advance) flush();
  }
  function actions(sequence) {
    sequence.forEach(action => {
      if (action === 'continue') {
        const button = document.querySelector(`#step-${index()} .btn-primary`);
        assert.ok(button,'Expected an informational step: '+steps()[index()].title);
        assert.equal(button.disabled,false); button.click(); flush();
      } else submit(action);
    });
  }
  return { window, document, flush, state, steps, index, begin, submit, actions,
    reset: () => window.resetAll(),
    result: () => document.getElementById('resultExpr').textContent,
    solved: () => document.getElementById('resultSection').classList.contains('visible'),
    open: () => document.getElementById('workspace').classList.contains('visible'),
  };
}

test('negative mixed conversion displays the negative of the entire sum',t=>{
  const f=fixture(t); f.begin(-2,1,3,'+',0,0,1);
  assert.match(f.document.querySelector('.step-rule-box').textContent,/−\(2 × 3 \+ 1\)/);
  assert.match(f.document.querySelector('.step-instruction').textContent,/entire mixed number/);
  f.submit('-5',false); f.submit('-7');
  f.actions(['3','0','-7','continue',['-2','1','3']]);
  assert.equal(f.result(),'-2 1/3 + 0 = -2 1/3');
  assert.match(f.document.getElementById('resultNote').textContent,/-7\/3/);
});

test('division by a negative fraction keeps the sign in the multiplication steps',t=>{
  const f=fixture(t); f.begin(0,1,2,'/',0,-1,3);
  const step=f.steps().find(s=>s.title==='Multiply the Numerators');
  assert.equal(String(step.fields ? step.fields[0].answer : step.answer),'-3');
  assert.match(step.instruction,/1 × \(-3\)/);
  f.actions(['continue','-3','2','continue',['-1','1','2']]);
  assert.equal(f.result(),'1/2 ÷ (-1/3) = -1 1/2');
  assert.match(f.document.getElementById('resultNote').textContent,/-3\/2/);
});

test('input validation rejects numeric prefixes and malformed optional whole parts',t=>{
  const f=fixture(t);
  for(const invalid of ['2junk','2.5','2.0','1e3','0x10','Infinity','NaN','--2','1 2','+','<img src=x>','1000000001','-1000000001','9'.repeat(1000)]) {
    for(const pos of [0,1,2,4,5,6]) {
      f.reset(); const args=[0,1,3,'+',0,1,2]; args[pos]=invalid; f.begin(...args);
      assert.equal(f.open(),false,`Field ${pos}: ${invalid}`);
      assert.ok(f.document.getElementById('errorMsg').textContent);
    }
  }
});

test('large exact products do not inherit floating-point rounding',t=>{
  const f=fixture(t); f.begin(0,999999999,1,'*',0,999999999,1);
  assert.equal(String(f.state().finalN),'999999998000000001');
  f.submit('999999998000000000',false); f.actions(['999999998000000001','1','continue']);
  assert.equal(f.result(),'999999999 × 999999999 = 999999998000000001');
});

test('missing fields, zero denominators, zero divisors, and missing operations are blocked',t=>{
  const f=fixture(t);
  for(const args of [
    [0,'',3,'+',0,1,2],[0,1,'','+',0,1,2],[0,1,3,'+',0,'',2],[0,1,3,'+',0,1,''],
    [0,1,0,'+',0,1,2],[0,1,3,'+',0,1,0],[0,0,0,'*',0,1,2],
    [0,1,3,'/',0,0,2],[0,0,1,'/',0,0,-3],[0,1,2,null,0,1,3],
  ]) { f.reset(); f.begin(...args); assert.equal(f.open(),false,JSON.stringify(args)); f.flush();
    assert.ok(f.document.getElementById('errorMsg').classList.contains('show'),'Error remains available to read'); }
});

test('mixed-number syntax never silently changes negative or improper fractional parts',t=>{
  const f=fixture(t);
  for(const [w,n,d] of [[2,-1,3],[-2,-1,3],[2,1,-3],[-2,1,-3],[2,3,3],[2,4,3],['-0',1,2]]) {
    for(const side of ['first','second']) {
      f.reset(); f.begin(...(side==='first'?[w,n,d,'+',0,0,1]:[0,0,1,'+',w,n,d]));
      assert.equal(f.open(),false,`${w} ${n}/${d}`);
      assert.match(f.document.getElementById('errorMsg').textContent,/whole part/);
    }
  }
  f.reset(); f.begin('',-7,3,'+',0,0,1); assert.ok(f.open()); assert.equal(f.state().finalN,-7n);
  f.reset(); f.begin(-2,0,3,'+',0,0,1); assert.ok(f.open()); assert.equal(f.state().finalN,-2n);
});

test('Unicode signs, optional zero whole parts, and negative denominators preserve value',t=>{
  const f=fixture(t); f.begin(' −2 ','01','03','+',0,0,1); assert.equal(f.state().finalN,-7n);
  f.reset(); f.begin('',2,-3,'+',0,1,3);
  assert.equal(f.steps()[0].title,'Normalize First Denominator');
  f.actions(['continue','continue','-1','continue']); assert.equal(f.result(),'2/-3 + 1/3 = -1/3');
  f.reset(); f.begin(0,-2,-3,'/',0,3,-4);
  f.actions(['continue','continue','continue','-8','9','continue']);
  assert.equal(f.result(),'-2/-3 ÷ (3/-4) = -8/9');
});

test('near answers and partial integers fail at every numeric stage',t=>{
  const f=fixture(t); f.begin(0,1,3,'+',0,1,6);
  for(const value of ['6junk','6.001','5.999','6.0','6/1','1e1','','NaN','Infinity']) f.submit(value,false);
  f.actions(['+006','2']);
  for(const value of ['3.001','3junk','-3']) f.submit(value,false);
  f.actions(['3']);
  for(const value of ['3.9','3junk','1']) f.submit(value,false);
  f.submit('3'); f.submit(['1.1','2'],false); f.submit(['1','2junk'],false); f.submit(['1','0'],false);
  f.submit(['1','2']); assert.equal(f.result(),'1/3 + 1/6 = 1/2');
});

test('equivalent unsimplified fractions receive accurate feedback without completing the simplification step',t=>{
  const f=fixture(t); f.begin(0,2,3,'*',0,3,4); f.actions(['6','12','6']);
  f.submit(['2','4'],false); assert.match(f.document.getElementById('fb-3').textContent,/equivalent, but it is not in simplest form/);
  f.submit(['-1','-2'],false); assert.match(f.document.getElementById('fb-3').textContent,/equivalent.*denominator is positive/);
  f.submit(['1','2']); assert.equal(f.result(),'2/3 × 3/4 = 1/2');
});

test('negative mixed answers require the sign on the whole part with a positive remainder',t=>{
  const f=fixture(t); f.begin(0,-7,3,'*',0,1,1);
  f.actions(['-7','3','continue']);
  for(const values of [['2','1','3'],['-2','-1','3'],['-3','2','3'],['-2.01','1','3'],['-2','1','0']]) f.submit(values,false);
  f.submit(['−2','1','3']); assert.equal(f.result(),'-7/3 × 1 = -2 1/3');
});

const examples=[
  [0,1,4,'+',0,2,4,'3/4',['continue','3','continue']],
  [0,1,3,'+',0,1,6,'1/2',['6','2','3','3',['1','2']]],
  [0,2,5,'+',0,1,3,'11/15',['15',['6','5'],'11','continue']],
  [0,3,8,'+',0,1,4,'5/8',['8','2','5','continue']],
  [1,1,2,'+',2,1,3,'3 5/6',['3','7','6',['9','14'],'23','continue',['3','5','6']]],
  [-2,1,3,'+',0,0,1,'-2 1/3',['-7','3','0','-7','continue',['-2','1','3']]],
  [0,3,4,'-',0,1,4,'1/2',['continue','2','2',['1','2']]],
  [0,5,6,'-',0,1,3,'1/2',['6','2','3','3',['1','2']]],
  [0,7,8,'-',0,1,2,'3/8',['8','4','3','continue']],
  [3,1,4,'-',1,2,3,'1 7/12',['13','5','12',['39','20'],'19','continue',['1','7','12']]],
  [5,1,2,'-',2,3,4,'2 3/4',['11','11','4','22','11','continue',['2','3','4']]],
  [0,1,2,'-',0,1,2,'0',['continue','0','continue']],
  [0,2,3,'*',0,3,4,'1/2',['6','12','6',['1','2']]],
  [0,1,2,'*',0,4,5,'2/5',['4','10','2',['2','5']]],
  [0,5,6,'*',0,3,10,'1/4',['15','60','15',['1','4']]],
  [1,1,3,'*',0,3,4,'1',['4','12','12','12',['1','1']]],
  [2,1,2,'*',1,1,5,'3',['5','6','30','10','10',['3','1']]],
  [0,-2,3,'*',0,3,4,'-1/2',['-6','12','6',['-1','2']]],
  [0,3,4,'/',0,1,2,'1 1/2',['continue','6','4','2',['3','2'],['1','1','2']]],
  [0,2,3,'/',0,4,5,'5/6',['continue','10','12','2',['5','6']]],
  [0,5,8,'/',0,1,4,'2 1/2',['continue','20','8','4',['5','2'],['2','1','2']]],
  [2,1,2,'/',0,3,4,'3 1/3',['5','continue','20','6','2',['10','3'],['3','1','3']]],
  [1,2,3,'/',1,1,6,'1 3/7',['5','7','continue','30','21','3',['10','7'],['1','3','7']]],
  [0,1,2,'/',0,-1,3,'-1 1/2',['continue','-3','2','continue',['-1','1','2']]],
];

test('all 24 practice problems finish with independently specified answers at every step',t=>{
  const f=fixture(t),chips=Array.from(f.document.querySelectorAll('.example-chip'));
  assert.equal(chips.length,examples.length);
  examples.forEach((example,i)=>{
    f.reset(); chips[i].click(); f.document.getElementById('startBtn').click();
    f.actions(example[8]); assert.equal(f.solved(),true,chips[i].textContent);
    assert.ok(f.result().endsWith('= '+example[7]),f.result());
    assert.equal(f.document.querySelectorAll('.step-card').length,example[8].length);
    assert.equal(f.document.querySelectorAll('.step-card input:not(:disabled),.step-card button:not(:disabled)').length,0);
    assert.ok(f.document.getElementById('proc-simplify').classList.contains('done'));
  });
});

test('3,024 signed fraction operations agree with independent cross-product identities',t=>{
  const f=fixture(t); let count=0;
  for(let an=-3;an<=3;an++)for(let ad=1;ad<=4;ad++)for(let bn=-3;bn<=3;bn++)for(let bd=1;bd<=4;bd++)for(const op of ['+','-','*','/']){
    if(op==='/'&&bn===0)continue;
    f.window.eval(`S={a:{w:0n,n:${an}n,d:${ad}n,improper:{n:${an}n,d:${ad}n}},b:{w:0n,n:${bn}n,d:${bd}n,improper:{n:${bn}n,d:${bd}n}},impA:{n:${an}n,d:${ad}n},impB:{n:${bn}n,d:${bd}n},op:'${op}'};stepsData=[];buildSteps();`);
    let n,d;
    if(op==='+'){n=an*bd+bn*ad;d=ad*bd;}
    if(op==='-'){n=an*bd-bn*ad;d=ad*bd;}
    if(op==='*'){n=an*bn;d=ad*bd;}
    if(op==='/'){n=an*bd;d=ad*bn;}
    const actual=f.state();
    assert.equal(actual.finalN*BigInt(d),BigInt(n)*actual.finalD,`${an}/${ad} ${op} ${bn}/${bd}`);
    assert.ok(actual.finalD>0n);
    const numerator=Number(actual.finalN),denominator=Number(actual.finalD);
    for(let divisor=2;divisor<=Math.min(Math.abs(numerator),denominator);divisor++){
      assert.ok(numerator%divisor!==0||denominator%divisor!==0,'Result must be reduced');
    }
    const mixed=actual.finalMixed;
    const reconstructed=mixed.w===0n?mixed.n:(mixed.w<0n?-1n:1n)*((mixed.w<0n?-mixed.w:mixed.w)*mixed.d+mixed.n);
    assert.equal(reconstructed*actual.finalD,actual.finalN*mixed.d);
    count++;
  }
  assert.equal(count,3024);
});

test('billion-sized components keep large LCDs, products, and mixed conversions exact',t=>{
  const f=fixture(t);
  for(const [args,n,d] of [
    [[0,1,1000000000,'+',0,1,999999999],1999999999n,999999999000000000n],
    [[-1000000000,1,1000000000,'*',0,1,1],-1000000000000000001n,1000000000n],
    [[0,1,1000000000,'*',0,1,1000000000],1n,1000000000000000000n],
    [[0,1,1000000000,'/',0,-1000000000,1],-1n,1000000000000000000n],
  ]) { f.reset(); f.begin(...args); assert.ok(f.open()); assert.equal(f.state().finalN,n);assert.equal(f.state().finalD,d); }
});

test('zero results and whole-number results have clear final forms',t=>{
  const f=fixture(t);
  for(const [args,actions,expected] of [
    [[0,-2,3,'+',0,2,3],['continue','0','continue'],'0'],
    [[0,0,5,'/',0,-3,7],['continue','0','15','continue'],'0'],
    [[0,-6,2,'*',0,1,1],['-6','2','2',['-3','1']],'-3'],
  ]){f.reset();f.begin(...args);f.actions(actions);assert.ok(f.result().endsWith('= '+expected));assert.doesNotMatch(f.result(),/NaN|Infinity|-0/);}
});

test('negative second numerators stay grouped in subtraction instructions',t=>{
  const f=fixture(t);f.begin(0,1,2,'-',0,-1,2);
  f.actions(['continue']);assert.match(f.document.querySelector('#step-1 .step-instruction').textContent,/1 − \(-1\)/);
  f.actions(['2','2',['1','1']]);assert.equal(f.result(),'1/2 − (-1/2) = 1');
});

test('future steps cannot be answered or finished early, including GCF before simplification',t=>{
  const f=fixture(t);f.begin(0,2,3,'*',0,3,4);
  assert.equal(f.document.querySelectorAll('.step-card').length,1);
  f.window.checkStep(3);f.window.completeStep(0);f.window.finishProblem();assert.equal(f.index(),0);assert.equal(f.solved(),false);
  f.actions(['6','12']);assert.equal(f.document.querySelector('#step-3'),null);
  f.window.checkStep(3);assert.equal(f.index(),2);f.submit('2',false);assert.equal(f.document.querySelector('#step-3'),null);
  f.submit('6');assert.ok(f.document.querySelector('#step-3'));
});

test('repeated checks and old buttons cannot duplicate or skip steps',t=>{
  const f=fixture(t);f.begin(0,2,3,'*',0,3,4);
  f.submit('6',true,false);f.document.querySelector('#step-0 .btn-check').click();f.window.checkStep(0);f.flush();
  assert.equal(f.document.querySelectorAll('#step-1').length,1);f.actions(['12','6',['1','2']]);
  f.window.finishProblem();assert.equal(f.document.querySelectorAll('.step-card').length,4);
  f.reset();f.begin(0,1,2,'/',0,1,3);const old=f.document.querySelector('#step-0 .btn-primary');old.click();old.click();f.window.completeStep(0);
  assert.equal(f.index(),1);assert.equal(f.document.querySelectorAll('.step-card').length,2);
});

test('reset discards pending transitions and requires fresh answers in a new problem',t=>{
  const f=fixture(t);f.begin(-2,1,3,'+',0,0,1);f.submit('-7',true,false);
  f.reset();f.begin(1,1,2,'+',2,1,3);f.flush();
  assert.equal(f.index(),0);assert.equal(f.document.querySelectorAll('.step-card').length,1);
  assert.equal(f.document.querySelector('#step-0 input').disabled,false);
  f.actions(['3','7','6',['9','14'],'23','continue',['3','5','6']]);
  assert.equal(f.result(),'1 1/2 + 2 1/3 = 3 5/6');
  f.reset();assert.equal(f.document.getElementById('resultExpr').textContent,'');assert.equal(f.document.getElementById('fracDisplay').childNodes.length,0);
});

test('progress marks a phase done only after its final step is accepted',t=>{
  const f=fixture(t);f.begin(1,1,2,'+',2,1,3);
  const convert=f.document.getElementById('proc-convert'),lcd=f.document.getElementById('proc-lcd'),simplify=f.document.getElementById('proc-simplify');
  assert.ok(convert.classList.contains('active'));f.submit('3');assert.equal(convert.classList.contains('done'),false);
  f.submit('7');assert.ok(convert.classList.contains('done'));assert.ok(lcd.classList.contains('active'));
  f.submit('6');assert.equal(lcd.classList.contains('done'),false);f.submit(['9','14']);assert.ok(lcd.classList.contains('done'));
  f.actions(['23','continue']);assert.equal(simplify.classList.contains('done'),false);
  f.submit(['3','5','6']);assert.ok(simplify.classList.contains('done'));assert.equal(f.document.querySelectorAll('.proc-step.active').length,0);
});

test('native controls, visible labels, readable fractions, and keyboard workflow are available',t=>{
  const f=fixture(t),toggle=f.document.getElementById('examplesToggle');
  assert.equal(toggle.tagName,'BUTTON');assert.equal(f.document.getElementById('examplesBody').hidden,true);
  toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(f.document.getElementById('examplesBody').hidden,false);
  assert.ok(Array.from(f.document.querySelectorAll('.example-chip,.op-btn')).every(e=>e.tagName==='BUTTON'));
  for(const id of ['wholeA','numA','denA','wholeB','numB','denB'])assert.ok(f.document.querySelector(`label[for="${id}"]`));
  f.begin(-2,1,3,'+',0,0,1);const input=f.document.querySelector('#step-0 input');
  assert.equal(f.document.activeElement,input);assert.ok(f.document.querySelector(`label[for="${input.id}"]`));
  assert.equal(f.document.getElementById('fb-0').getAttribute('aria-live'),'polite');
  assert.match(f.document.querySelector('#fracDisplay .sr-only').textContent,/negative 2 and 1 over 3/);
  input.value='−7';input.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));f.flush();assert.equal(input.disabled,true);
  f.document.querySelector('.workspace-actions button').click();assert.equal(f.document.activeElement,f.document.getElementById('numA'));
  f.document.getElementById('numA').value='1';f.document.getElementById('denA').value='2';f.document.getElementById('numB').value='1';f.document.getElementById('denB').value='2';
  f.document.querySelector('[data-op="+"]').click();
  f.document.getElementById('denB').dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Enter'}));assert.equal(f.open(),true);
});
