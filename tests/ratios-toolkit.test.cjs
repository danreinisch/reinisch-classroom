// Execute the actual page. Worked steps and generated checks use independent answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(process.env.RC_RATIOS_HTML || path.resolve(__dirname,
  '../site/math-toolkit/presentations/algebra/pre-algebra/presentation-04/a4-ratios-rates-proportions.html'), 'utf8');
function fixture(t) {
  const pending=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{runScripts:'dangerously',virtualConsole:vc,url:'https://example.test/ratios',beforeParse(w){
    w.HTMLElement.prototype.scrollIntoView=()=>{};w.setTimeout=fn=>{pending.push(fn);return pending.length;};
  }});
  const w=dom.window,d=w.document;
  t.after(()=>{w.close();assert.deepEqual(errors,[]);});
  const flush=()=>{while(pending.length)pending.shift()();};
  const index=()=>w.eval('currentStep'),steps=()=>w.eval('stepsData'),state=()=>w.eval('S');
  const open=()=>d.getElementById('workspace').classList.contains('visible');
  const solved=()=>d.getElementById('resultSection').classList.contains('visible');
  function begin(loader,...args){w[loader](...args);w.startSolving();}
  function submit(value,correct=true,advance=true){
    const i=index(),input=d.getElementById('ans-'+i);assert.ok(input,'Expected a numeric step at '+steps()[i].title);
    input.value=String(value);w.checkNum(i);assert.equal(input.disabled,correct,d.getElementById('fb-'+i).textContent);
    if(advance)flush();
  }
  function actions(sequence){sequence.forEach(value=>{
    const i=index();
    if(value==='continue'){assert.equal(steps()[i].type,'info');d.querySelector('#step-'+i+' .btn-primary').click();flush();}
    else if(value.startsWith('choice:')){const answer=value.slice(7),buttons=Array.from(d.querySelectorAll('#step-'+i+' .choice-btn')),button=buttons.find(b=>b.textContent===answer);assert.ok(button,answer);button.click();assert.ok(button.disabled, d.getElementById('fb-'+i).textContent);flush();}
    else submit(value);
  });}
  return {w,d,flush,index,steps,state,open,solved,begin,submit,actions,reset:()=>w.resetAll(),result:()=>d.getElementById('resultExpr').textContent,detail:()=>d.getElementById('resultDetail').textContent,error:()=>d.getElementById('errorMsg').textContent};
}

test('speed comparison follows the higher rate goal instead of calling slower better',t=>{
  const f=fixture(t);f.begin('loadCompare',200,'miles',4,'hours',280,'miles',5,'hours','higher');
  assert.equal(f.steps().at(-1).answer,'Option B');
  f.actions(['continue','continue','50','56','choice:Option B']);
  assert.ok(f.solved());assert.match(f.detail(),/Option B has the higher unit rate/);assert.doesNotMatch(f.detail(),/better.*lower/);
});
test('incompatible units are blocked before a numerical comparison',t=>{
  const f=fixture(t);
  for(const [l,u] of [['miles','minutes'],['kilometers','hours'],['miles','tickets'],['dollars','hours']]){
    f.reset();f.begin('loadCompare',60,'miles',1,'hours',1,l,1,u);assert.equal(f.open(),false);assert.match(f.error(),/same.*units/);
  }
});
test('numeric prefixes and decimal ratio terms are not silently truncated',t=>{
  const f=fixture(t);
  for(const bad of ['12junk','12.5','1e2','0x10','Infinity','NaN','--1','1 2','<img src=x>','1000000001','9'.repeat(1000)]){
    f.reset();f.begin('loadRatio',bad,8);assert.equal(f.open(),false,bad);assert.ok(f.error());
  }
});
test('rounded answers do not receive credit for repeating unit rates',t=>{
  const f=fixture(t);f.begin('loadRate',1,'liters',3,'bottles');f.actions(['continue','continue']);
  for(const bad of ['0.3333','0.3333333333333333','1/3junk','1e-1','','Infinity','NaN','1/0','0/0'])f.submit(bad,false);
  f.actions(['2/6','continue']);assert.equal(f.result(),'1/3 liters per 1 bottles');
});
test('tiny nonzero rates are displayed exactly instead of rounded to zero',t=>{
  const f=fixture(t);f.begin('loadRate','0.000000001','liters','1000000000','bottles');
  assert.equal(f.w.fmtNum(f.state().rate),'1/1000000000000000000');
  f.actions(['continue','continue']);f.submit('0',false);f.actions(['1/1000000000000000000','continue']);assert.match(f.result(),/^1\/1000000000000000000/);
});
test('zero numerators can produce a valid zero solution',t=>{
  const f=fixture(t);f.begin('loadProp','x',5,0,3);assert.ok(f.open());f.actions(['continue','continue','0','0','continue']);assert.equal(f.result(),'x = 0');
});

const examples=[
  ['12 : 8 = 3 : 2',['continue','4','3','2','continue']],
  ['15 : 25 = 3 : 5',['continue','5','3','5','continue']],
  ['24 : 36 = 2 : 3',['continue','12','2','3','continue']],
  ['45 : 60 = 3 : 4',['continue','15','3','4','continue']],
  ['x = 9',['continue','continue','36','9','continue']],
  ['x = 20',['continue','continue','40','20','continue']],
  ['x = 2',['continue','continue','30','2','continue']],
  ['x = 3',['continue','continue','84','3','continue']],
  ['40 miles per 1 hour',['continue','continue','40','continue']],
  ['6 dollars per 1 ticket',['continue','continue','6','continue']],
  ['50 words per 1 minute',['continue','continue','50','continue']],
  ['125 calories per 1 serving',['continue','continue','125','continue']],
  ['1/3 liters per 1 bottles',['continue','continue','1/3','continue']],
  ['A: 5 dollars per 1 ticket; B: 4.8 dollars per 1 ticket',['continue','continue','5','4.8','choice:Option B']],
  ['A: 50 miles per 1 hour; B: 56 miles per 1 hour',['continue','continue','50','56','choice:Option B']],
  ['A: 3 cookies per 1 batch; B: 10/3 cookies per 1 batch',['continue','continue','3','10/3','choice:Option A']],
  ['Part A = 15, Part B = 25',['continue','8','5','15','25','continue']],
  ['Part A = 20, Part B = 30',['continue','5','10','20','30','continue']],
  ['Part A = 12, Part B = 48',['continue','5','12','12','48','continue']],
  ['Part A = 40, Part B = 56',['continue','12','8','40','56','continue']],
  ['x = 9',['continue','continue','36','9','continue']],
  ['x = 3',['continue','continue','30','3','continue']],
  ['x = 28',['continue','continue','56','28','continue']],
  ['x = 6',['continue','continue','36','6','continue']],
  ['x = 7.5',['continue','continue','60','7.5','continue']],
  ['Any nonzero x',['continue','continue','0','choice:Any nonzero x']],
  ['No solution',['continue','continue','10','choice:No solution']],
  ['No solution',['continue','continue','0','0','choice:No solution']],
];
test('all 28 practice problems finish with independently specified answers at every step',t=>{
  const f=fixture(t),chips=Array.from(f.d.querySelectorAll('.example-chip'));assert.equal(chips.length,examples.length);
  chips.forEach((chip,i)=>{f.reset();chip.click();f.d.getElementById('startBtn').click();f.actions(examples[i][1]);assert.equal(f.result(),examples[i][0],chip.textContent);assert.ok(f.solved());assert.equal(f.d.querySelectorAll('.step-card input:not(:disabled),.step-card button:not(:disabled)').length,0);assert.equal(f.d.querySelectorAll('.step-card').length,examples[i][1].length);});
});
test('all four x positions preserve signs, fractions, and denominator restrictions in both equation modes',t=>{
  const f=fixture(t);
  for(const loader of ['loadProp','loadEquiv'])for(const [args,seq,result] of [
    [['x',-3,2,9],['continue','continue','-6','-2/3','continue'],'x = -2/3'],
    [[-2,'x',6,9],['continue','continue','-18','-3','continue'],'x = -3'],
    [[-2,9,'x',3],['continue','continue','-6','-2/3','continue'],'x = -2/3'],
    [[-2,9,6,'x'],['continue','continue','54','-27','continue'],'x = -27'],
    [[0,'x',0,5],['continue','continue','0','choice:Any nonzero x'],'Any nonzero x'],
    [[2,'x',0,5],['continue','continue','10','choice:No solution'],'No solution'],
    [[2,5,0,'x'],['continue','continue','0','0','choice:No solution'],'No solution'],
    [[0,'x',2,5],['continue','continue','0','0','choice:No solution'],'No solution'],
  ]){f.reset();f.begin(loader,...args);assert.ok(f.open());f.actions(seq);assert.equal(f.result(),result);}
});
test('known zero denominators and missing or multiple unknowns never open a workspace',t=>{
  const f=fixture(t);
  for(const loader of ['loadProp','loadEquiv'])for(const args of [
    [1,0,'x',3],['x',2,3,0],[1,2,3,4],['x','x',2,3],['x',2,'',3],['x',2,'3junk',4],['x',2,'Infinity',4],['x',2,'1/3',4],
  ]){f.reset();f.begin(loader,...args);assert.equal(f.open(),false,args.join(','));assert.ok(f.error());}
});
test('all small signed proportions agree with an independent cross-product and domain oracle',t=>{
  const f=fixture(t);let count=0,unique=0,none=0,many=0;
  for(let pos=0;pos<4;pos++)for(let a=-3;a<=3;a++)for(let b=-3;b<=3;b++)for(let c=-3;c<=3;c++){
    const vals=[a,b,c];vals.splice(pos,0,null);if([1,3].some(i=>i!==pos&&vals[i]===0))continue;
    const actual=f.w.solveEquation(vals.map(v=>v===null?null:{n:BigInt(v),d:1n}),pos);
    // Independently evaluate each diagonal as constant + coefficient*x.
    const term=(i,j)=>i===pos?[0,vals[j]]:j===pos?[0,vals[i]]:[vals[i]*vals[j],0];
    const left=term(0,3),right=term(1,2),coefficient=left[1]-right[1],constant=right[0]-left[0];
    const expected=coefficient===0?(constant===0?'many':'none'):([1,3].includes(pos)&&constant===0?'none':'unique');
    assert.equal(actual.kind,expected,JSON.stringify(vals));
    if(expected==='unique'){
      assert.equal(actual.answer.n*BigInt(coefficient),BigInt(constant)*actual.answer.d);
      assert.ok(actual.answer.d>0n);unique++;
    }else if(expected==='none')none++;else many++;
    count++;
  }
  assert.equal(count,1092);assert.ok(unique>800&&none>0&&many>0);
});
test('fractional part-to-whole shares keep intermediates and the total exact',t=>{
  const f=fixture(t);f.begin('loadPW',1,2,1);f.actions(['continue','3','1/3']);
  assert.match(f.d.querySelector('#step-3 .step-instruction').textContent,/1 × \(1\/3\)/);
  f.actions(['1/3','2/3','continue']);assert.equal(f.result(),'Part A = 1/3, Part B = 2/3');assert.match(f.detail(),/1\/3 \+ 2\/3 = 1\./);assert.match(f.detail(),/whole objects/);
});
test('zero ratio terms and zero totals have clear valid results',t=>{
  const f=fixture(t);
  for(const [loader,args,actions,result] of [
    ['loadRatio',[0,5],['continue','5','0','1','continue'],'0 : 5 = 0 : 1'],
    ['loadRatio',[5,0],['continue','5','1','0','continue'],'5 : 0 = 1 : 0'],
    ['loadRatio',[3,7],['continue','1','continue'],'3 : 7 = 3 : 7'],
    ['loadPW',[0,2,7],['continue','2','3.5','0','7','continue'],'Part A = 0, Part B = 7'],
    ['loadPW',[2,3,0],['continue','5','0','0','0','continue'],'Part A = 0, Part B = 0'],
  ]){f.reset();f.begin(loader,...args);f.actions(actions);assert.equal(f.result(),result);}
  for(const loader of ['loadRatio','loadPW']){f.reset();f.begin(loader,0,0,7);assert.equal(f.open(),false);}
});
test('decimal inputs, fraction answers, and billion-sized products stay exact',t=>{
  const f=fixture(t);f.begin('loadProp',999999999,1,'x',999999999);f.actions(['continue','continue']);
  f.submit('999999998000000000',false);f.actions(['999999998000000001','999999998000000001','continue']);assert.equal(f.result(),'x = 999999998000000001');
  f.reset();f.begin('loadRate','+.30','dollars','.20','tickets');f.actions(['continue','continue','3/2','continue']);assert.equal(f.result(),'1.5 dollars per 1 ticket');
  f.reset();f.begin('loadProp','−0.2',3,'x',5);f.actions(['continue','continue','-1','-1/3','continue']);assert.equal(f.result(),'x = -1/3');
});
test('quantity domains, decimal limits, and all known-number fields reject invalid input',t=>{
  const f=fixture(t);
  for(const invalid of ['1junk','1e3','NaN','Infinity','0x10','1 2','1000000001','0.0000000000001','-1000000001','']){
    for(const id of ['rateAmt','rateUnits']){f.reset();f.w.loadRate(1,'miles',2,'hours');f.d.getElementById(id).value=invalid;f.w.startSolving();assert.equal(f.open(),false,id+':'+invalid);}
    for(const id of ['cmpAmtA','cmpUnitA','cmpAmtB','cmpUnitB']){f.reset();f.w.loadCompare(1,'miles',2,'hours',3,'miles',4,'hours');f.d.getElementById(id).value=invalid;f.w.startSolving();assert.equal(f.open(),false,id+':'+invalid);}
  }
  for(const args of [[-1,'miles',2,'hours'],[1,'miles',-2,'hours'],[1,'miles',0,'hours'],[1,'',2,'hours'],[1,'miles',2,'']]){f.reset();f.begin('loadRate',...args);assert.equal(f.open(),false);f.flush();assert.ok(f.error());}
  f.reset();f.begin('loadPW',1,2,-1);assert.equal(f.open(),false);
});
test('matching unit aliases work without treating different scales as equivalent',t=>{
  const f=fixture(t);f.begin('loadCompare',60,'MI',1,'hr',120,'miles',2,' Hours ');assert.ok(f.open());assert.equal(f.state().order,0);
  f.actions(['continue','continue','60','60','choice:They are equal']);assert.match(f.detail(),/exactly equal/);
  f.reset();f.begin('loadCompare',1,'dollars',1,'tickets',100,'cents',1,'ticket');assert.equal(f.open(),false);
});
test('comparison choices include ties and distinguish rates that round to the same decimal',t=>{
  const f=fixture(t);f.begin('loadCompare',1,'dollars',3,'items',333333333,'dollars',1000000000,'items','lower');
  f.actions(['continue','continue','1/3','0.333333333']);
  const buttons=Array.from(f.d.querySelectorAll('#step-4 .choice-btn'));assert.deepEqual(buttons.map(b=>b.textContent),['Option A','Option B','They are equal']);
  buttons[2].click();assert.equal(buttons[2].disabled,false);assert.equal(f.solved(),false);
  f.actions(['choice:Option B']);assert.match(f.detail(),/Option B has the lower/);
  f.reset();f.begin('loadCompare',0,'items',1,'hours',0,'items',2,'hours');f.actions(['continue','continue','0','0']);
  f.d.querySelectorAll('.cbar-fill').forEach(bar=>assert.equal(bar.style.width,'0%'));f.actions(['choice:They are equal']);
});
test('unit labels remain literal text and are never interpreted as HTML',t=>{
  const f=fixture(t),label='<img src=x onerror=alert(1)>';
  f.begin('loadRate',1,label,2,'glass');f.actions(['continue','continue','0.5','continue']);
  assert.match(f.result(),/per 1 glass$/);assert.ok(f.result().includes(label));assert.equal(f.d.querySelector('#workspace img'),null);
  assert.equal(f.d.querySelector('#workspace script'),null);
});
test('future steps, duplicate submissions, and stale reset callbacks cannot skip or resurrect work',t=>{
  const f=fixture(t);f.begin('loadPW',1,2,1);f.w.completeStep(4);f.w.showStep(5);f.w.finishProblem();assert.equal(f.index(),0);assert.equal(f.solved(),false);
  f.actions(['continue']);f.w.completeStep(1);assert.equal(f.index(),1);f.submit('3',true,false);f.w.checkNum(1);f.flush();assert.equal(f.index(),2);assert.equal(f.d.querySelectorAll('#step-2').length,1);
  f.submit('1/3',true,false);f.reset();f.begin('loadRatio',12,8);f.flush();assert.equal(f.index(),0);assert.equal(f.d.querySelectorAll('.step-card').length,1);assert.equal(f.state().mode,'ratio');
  f.w.loadProp(1,2,3,'x');assert.equal(f.state().mode,'ratio');
});
test('compute phase is complete only after every computation is accepted',t=>{
  const f=fixture(t);f.begin('loadPW',1,2,1);f.actions(['continue','3','1/3']);
  assert.equal(f.d.getElementById('proc-compute').classList.contains('done'),false);
  f.actions(['1/3','2/3']);assert.equal(f.d.getElementById('proc-compute').classList.contains('done'),true);
  assert.equal(f.d.getElementById('proc-simplify').classList.contains('done'),false);
  f.actions(['continue']);assert.equal(f.d.getElementById('proc-simplify').classList.contains('done'),true);
});
test('native keyboard controls, visible labels, persistent feedback, and reset focus are available',t=>{
  const f=fixture(t);
  for(const control of f.d.querySelectorAll('.input-section input,.input-section select'))assert.ok(control.labels.length,control.id);
  for(const control of f.d.querySelectorAll('.mode-tab,.example-chip,.examples-toggle'))assert.equal(control.tagName,'BUTTON');
  assert.equal(f.d.getElementById('examplesBody').hidden,true);f.d.getElementById('examplesToggle').click();assert.equal(f.d.getElementById('examplesToggle').getAttribute('aria-expanded'),'true');
  f.w.loadRatio(12,8);f.d.getElementById('ratioB').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.ok(f.open());f.actions(['continue']);
  const input=f.d.getElementById('ans-1');input.value='3.999';input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));f.flush();assert.equal(input.disabled,false);assert.ok(f.d.getElementById('fb-1').textContent);
  input.value='4';input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));f.flush();assert.equal(f.index(),2);
  f.reset();assert.equal(f.open(),false);assert.equal(f.d.activeElement.id,'tab-ratio');assert.equal(f.d.querySelectorAll('.input-section input').length,[...f.d.querySelectorAll('.input-section input')].filter(i=>i.value==='').length);assert.equal(f.d.querySelectorAll('.mode-tab[aria-pressed="true"]').length,0);
});
