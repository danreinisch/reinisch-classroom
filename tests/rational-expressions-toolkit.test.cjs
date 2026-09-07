// Execute the real organizer. Expected algebra is supplied independently;
// generated checks verify exact polynomial identities and original domains.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(process.env.RC_RATIONAL_EXPRESSIONS_HTML||path.resolve(__dirname,
  '../site/math-toolkit/presentations/algebra/algebra-2/presentation-02/a23-rational-expressions.html'),'utf8');
function fixture(t){
  const pending=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(html,{runScripts:'dangerously',virtualConsole:vc,url:'https://example.test/rational-expressions',beforeParse(w){w.HTMLElement.prototype.scrollIntoView=()=>{};w.setTimeout=fn=>{pending.push(fn);return pending.length;};}});
  const w=dom.window,d=w.document;t.after(()=>{w.close();assert.deepEqual(errors,[]);});
  const flush=()=>{while(pending.length)pending.shift()();};
  const state=()=>w.eval('S'),steps=()=>w.eval('stepsData'),index=()=>w.eval('currentStep');
  const open=()=>d.getElementById('workspace').classList.contains('visible'),solved=()=>d.getElementById('resultSection').classList.contains('visible');
  function begin(loader,...parts){w[loader](...parts);w.startSolving();}
  function info(){while(!solved()&&steps()[index()]?.type==='info'){const i=index();d.querySelector('#step-'+i+' .btn-primary').click();flush();}}
  function submit(values,correct=true,advance=true){
    if(!Array.isArray(values))values=[values];const i=index(),inputs=Array.from(d.querySelectorAll('#step-'+i+' input[type="text"]'));assert.equal(inputs.length,values.length,steps()[i].title);
    inputs.forEach((input,j)=>{assert.equal(input.disabled,false);input.value=String(values[j]);});d.querySelector('#step-'+i+' .btn-check').click();assert.equal(inputs.every(input=>input.disabled),correct,d.getElementById('fb-'+i).textContent);if(advance)flush();
  }
  function choose(values,correct=true,advance=true){
    const i=index(),options=Array.from(d.querySelectorAll('#step-'+i+' input[type="checkbox"]'));assert.ok(options.length);options.forEach(input=>{input.checked=false;});
    values.forEach(text=>{const input=options.find(input=>input.parentElement.textContent.trim()===text);assert.ok(input,'Missing choice '+text);input.click();});d.querySelector('#step-'+i+' .btn-check').click();assert.equal(options.every(input=>input.disabled),correct,d.getElementById('fb-'+i).textContent);if(advance)flush();
  }
  function complete(expected){
    info();if(expected.reciprocal){assert.equal(steps()[index()].kind,'reciprocal');submit(expected.reciprocal);info();}
    choose(expected.roots.length?expected.roots.map(v=>'x = '+v):['No excluded real values']);info();
    if(expected.common!==undefined){submit(expected.common);info();}
    if(expected.answer){submit(expected.answer);info();}
    assert.ok(solved());
  }
  return {w,d,flush,state,steps,index,open,solved,begin,info,submit,choose,complete,reset:()=>w.resetAll(),result:()=>d.getElementById('resultExpr').textContent,detail:()=>d.getElementById('resultDetail').textContent,error:()=>d.getElementById('errorMsg').textContent,
    plannedResult:()=>typeof w.expressionText==='function'?w.expressionText(state().numerator,state().denominator):state().resultStr};
}
// Independent integer Horner evaluator (no organizer parser or arithmetic).
function evaluate(coefficients,x){let value=0n;for(let i=coefficients.length-1;i>=0;i--)value=value*x+coefficients[i];return value;}
function plain(p){return Array.from(p);}

test('2x squared over x retains the remaining x',t=>{
  const f=fixture(t);f.begin('loadS','2x^2','x');assert.equal(f.plannedResult(),'2x');
  f.info();f.choose(['No excluded real values'],false);f.choose(['x = 0']);f.info();f.submit('x');f.info();
  f.submit(['2','1'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/remaining x/);f.submit(['2x','1']);assert.equal(f.result(),'2x');assert.match(f.detail(),/x ≠ 0/);
});
test('factoring a scaled square preserves its degree and value',t=>{
  const f=fixture(t),factors=f.w.factorExpr(f.w.parseExpr('3x^2'));
  const value=Array.isArray(factors)?factors.reduce((acc,factor)=>acc*(factor.type==='const'?factor.val:factor.type==='linear'?factor.a*2+factor.b:factor.a*4+factor.b*2+factor.c),1):factors.factors.reduce((acc,p)=>acc*evaluate(p,2n),factors.scalar);
  assert.equal(String(value),'12');f.begin('loadS','6x','3x^2');f.complete({roots:['0'],common:'3x',answer:['2','x']});assert.equal(f.result(),'(2) / (x)');
});
test('multiplication reduces numerical coefficients as well as variable factors',t=>{
  const f=fixture(t);f.begin('loadM','3x','x+2','x+2','6');assert.equal(f.plannedResult(),'(x) / (2)');f.complete({roots:['-2'],common:'3(x+2)',answer:['x','2']});
});
test('division keeps restrictions from both original denominators and the divisor numerator',t=>{
  const f=fixture(t);f.begin('loadD','x+5','x','x+5','x^2');
  const restrictions=typeof f.w.restrictionText==='function'?f.w.restrictionText(f.state().restrictions):f.state().restrictStr||'';
  assert.match(restrictions,/x ≠ 0/);assert.match(restrictions,/x ≠ -5/);
  f.complete({reciprocal:['x^2','x+5'],roots:['0','-5'],common:'x(x+5)',answer:['x','1']});assert.equal(f.result(),'x');
});
test('unsupported expressions are rejected instead of reported as unrestricted',t=>{
  const f=fixture(t);for(const invalid of ['sin(x)','y+1','x^3','x^-1','x^0','1/x','x+','x2','2 3','x^2junk','Infinity','NaN','<img src=x>']){f.reset();f.begin('loadR','1',invalid);assert.equal(f.open(),false,invalid);assert.ok(f.error());}
});
test('identically zero denominators cannot be cancelled',t=>{
  const f=fixture(t);for(const denominator of ['0','x-x','0x^2+0x+0'])for(const loader of ['loadS','loadR']){f.reset();f.begin(loader,'x+1',denominator);assert.equal(f.open(),false);assert.match(f.error(),/undefined.*every x|identically zero/);}
});
test('an identically zero divisor is blocked',t=>{
  const f=fixture(t);f.begin('loadD','1','x','0','x-1');assert.equal(f.open(),false);assert.match(f.error(),/divisor is identically zero/);
});

const examples=[
  {roots:['-2'],common:'2x+4',answer:['2','1'],result:'2'},
  {roots:['0'],common:'3x',answer:['2','x'],result:'(2) / (x)'},
  {roots:['-3'],common:'x+3',answer:['x-3','1'],result:'x-3'},
  {roots:['-2'],common:'x+2',answer:['x+3','1'],result:'x+3'},
  {roots:['-2'],common:'2x+4',answer:['x-2','1'],result:'x-2'},
  {roots:['0'],common:'x',answer:['2x','1'],result:'2x'},
  {roots:['-1/2'],common:'2x+1',answer:['3x+1','1'],result:'3x+1'},
  {roots:['3'],answer:['0','1'],result:'0'},
  {roots:['-2'],common:'3x+6',answer:['x','2'],result:'(x) / (2)'},
  {roots:['3','-1'],common:'(x-3)(x+1)',answer:['1','1'],result:'1'},
  {roots:['0'],common:'5x',answer:['4','x'],result:'(4) / (x)'},
  {roots:['0','-2'],common:'3x(x+2)',answer:['3x(x-2)','1'],result:'3x^2-6x'},
  {roots:['1'],common:'(x-1)(x^2+1)',answer:['1','1'],result:'1'},
  {reciprocal:['9','8x^2'],roots:['0'],common:'12x',answer:['3','2x'],result:'(3) / (2x)'},
  {reciprocal:['x^2','x+5'],roots:['0','-5'],common:'x(x+5)',answer:['x','1'],result:'x'},
  {reciprocal:['x+3','x-1'],roots:['-3','1'],common:'(x+3)(x-1)',answer:['x+1','1'],result:'x+1'},
  {reciprocal:['x-2','3'],roots:['2'],common:'3x-6',answer:['2x','1'],result:'2x'},
  {reciprocal:['x-2','x+1'],roots:['2','-1'],common:'x-2',answer:['1','x+1'],result:'(1) / (x+1)'},
  {roots:['3'],result:'x ≠ 3'},
  {roots:['-2','2'],result:'x ≠ -2; x ≠ 2'},
  {roots:['-3','2'],result:'x ≠ -3; x ≠ 2'},
  {roots:['0'],result:'x ≠ 0'},
  {roots:[],result:'No excluded real values'},
  {roots:['(0 − √8)/2','(0 + √8)/2'],result:'x ≠ (0 − √8)/2; x ≠ (0 + √8)/2'},
  {roots:['1'],result:'x ≠ 1'},
];
test('all 25 practice problems finish with independent algebra answers and original restrictions',t=>{
  const f=fixture(t),chips=Array.from(f.d.querySelectorAll('.example-chip'));assert.equal(chips.length,examples.length);
  chips.forEach((chip,i)=>{f.reset();chip.click();f.w.startSolving();assert.ok(f.open(),chip.textContent);f.complete(examples[i]);assert.equal(f.result(),examples[i].result,chip.textContent);assert.equal(f.d.querySelectorAll('.step-card input:not(:disabled),.step-card button:not(:disabled)').length,0);assert.equal(f.d.getElementById('proc-answer').classList.contains('done'),true);});
});
test('nonmonic quadratics, repeated factors, opposite signs and irreducible factors simplify exactly',t=>{
  const f=fixture(t);
  for(const [n,d,common,answer,roots] of [
    ['4x^2+4x+1','2x+1','2x+1',['2x+1','1'],['-1/2']],
    ['-2x^2+8','2x+4','2x+4',['-x+2','1'],['-2']],
    ['x-1','1-x','x-1',['-1','1'],['1']],
    ['x^2+1','-2x^2-2','x^2+1',['-1','2'],[]],
    ['x+1','x+2','1',['x+1','x+2'],['-2']],
    ['6','-8','2',['-3','4'],[]],
    ['0','x^2-1',undefined,['0','1'],['-1','1']],
  ]){f.reset();f.begin('loadS',n,d);f.complete({roots,common,answer});assert.equal(f.plannedResult(),f.result());}
});
test('common factors are distinguished from terms, smaller factors, and negative associates',t=>{
  const f=fixture(t);f.begin('loadS','6x^2','3x');f.info();f.choose(['x = 0']);f.info();
  for(const [value,message] of [['0',/division by zero/],['x',/another numerical/],['-3x',/positive leading/],['x+1',/does not divide both/]]){f.submit(value,false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,message);}
  f.submit('3x');f.info();f.submit(['6x^2','3x'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/not fully reduced/);f.submit(['-2x','-1'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/positive leading/);f.submit(['2*x','1']);
});
test('the reciprocal step preserves the second expression before reduction',t=>{
  const f=fixture(t);f.begin('loadD','1','x','4x','2x');f.info();
  f.submit(['4x','2x'],false);f.submit(['1','2'],false);f.submit(['2*x','4*x']);f.info();f.choose(['x = 0']);f.info();f.submit('2x');f.info();f.submit(['1','2x']);assert.equal(f.result(),'(1) / (2x)');
});
test('restriction feedback never restores cancelled holes or excludes an ordinary numerator zero',t=>{
  const f=fixture(t);f.begin('loadD','1','x-2','x+1','x-2');f.info();f.submit(['x-2','x+1']);f.info();
  f.choose(['x = -1'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/cancelled factor/);
  f.choose(['x = -1','x = 2','No excluded real values'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/not both/);f.choose(['x = -1','x = 2']);
  f.reset();f.begin('loadS','x','x-2');f.info();f.choose(['x = 0','x = 2'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/Do not exclude other numerator zeros/);f.choose(['x = 2']);
});

test('729 small polynomials retain their value through every displayed factorization',t=>{
  const f=fixture(t);let count=0;
  for(let a=-4;a<=4;a++)for(let b=-4;b<=4;b++)for(let c=-4;c<=4;c++){
    let p=[BigInt(c),BigInt(b),BigInt(a)];while(p.length>1&&p.at(-1)===0n)p.pop();
    const result=f.w.factorExpr(p),printed=f.w.parseExpr(f.w.factorText(result));
    for(const x of [-3n,-1n,0n,1n,3n]){
      const expected=BigInt(a)*x*x+BigInt(b)*x+BigInt(c);
      assert.equal(result.factors.reduce((acc,factor)=>acc*evaluate(factor,x),result.scalar),expected,p.join(','));
      assert.equal(evaluate(printed,x),expected,'Printed factorization must have the same value');
    }
    count++;
  }
  assert.equal(count,729);
});
test('400 constructed common-factor cases reduce to independently specified coprime expressions',t=>{
  const f=fixture(t);let count=0;
  for(let c=-2;c<=2;c++)for(let a=-2;a<=2;a++)for(let b=-2;b<=2;b++){
    if(a===b)continue;
    for(const [ns,ds,g] of [[-6,4,2],[6,9,3],[2,-8,2],[-2,-8,2]]){
      // Expand s(x-c)(x-a) directly, independently of the organizer.
      const n=[ns*c*a,-ns*(c+a),ns].map(BigInt),d=[ds*c*b,-ds*(c+b),ds].map(BigInt);
      const result=f.w.reduceExpression(n,d),sign=ds<0?-1:1;
      assert.deepEqual(plain(result.numerator),[-a*ns/g*sign,ns/g*sign].map(BigInt));
      assert.deepEqual(plain(result.denominator),[-b*Math.abs(ds)/g,Math.abs(ds)/g].map(BigInt));
      assert.deepEqual(plain(result.common),[-c*g,g].map(BigInt));count++;
    }
  }
  assert.equal(count,400);
});
test('generated four-mode problems preserve exact values and their original domains',t=>{
  const f=fixture(t);let seed=1470,count=0,identityChecks=0;
  const next=()=>{seed=(seed*48271)%2147483647;return seed;};
  const polynomial=()=>{const p=[BigInt(next()%11-5),BigInt(next()%11-5),BigInt(next()%3===0?0:next()%7-3)];while(p.length>1&&p.at(-1)===0n)p.pop();return p;};
  for(let trial=0;trial<150;trial++){
    const parts=[polynomial(),polynomial(),polynomial(),polynomial()];if(parts[1].every(v=>v===0n))parts[1]=[1n];if(parts[3].every(v=>v===0n))parts[3]=[1n];if(parts[2].every(v=>v===0n))parts[2]=[1n];
    for(const mode of ['simplify','multiply','divide','restrict']){
      const given=mode==='simplify'||mode==='restrict'?parts.slice(0,2):parts,result=f.w.solveProblem(mode,given);let validPoints=0;
      for(let x=-12n;x<=12n;x++){
        const [a,b,c,d]=parts.map(p=>evaluate(p,x));
        const originalAllowed=b!==0n&&((mode==='simplify'||mode==='restrict')||(d!==0n&&(mode!=='divide'||c!==0n)));
        const excluded=result.restrictions.some(root=>root.kind==='rational'&&root.n===x*root.d);
        assert.equal(!excluded,originalAllowed,mode+' domain at '+x);
        if(!originalAllowed)continue;
        const expectedN=mode==='multiply'?a*c:mode==='divide'?a*d:a,expectedD=mode==='multiply'?b*d:mode==='divide'?b*c:b;
        const actualN=evaluate(result.numerator,x),actualD=evaluate(result.denominator,x);assert.notEqual(actualD,0n);
        assert.equal(actualN*expectedD,expectedN*actualD,mode+' at '+x);validPoints++;identityChecks++;
      }
      // The cross-product difference has degree at most eight. Nine distinct
      // exact checks establish its polynomial identity, beyond spot sampling.
      assert.ok(validPoints>=9);assert.ok(result.denominator.at(-1)>0n);count++;
    }
  }
  assert.equal(count,600);assert.ok(identityChecks>13000);
});
test('every small linear and quadratic restriction agrees with an independent real-root oracle',t=>{
  const f=fixture(t);let count=0;
  for(let a=-4;a<=4;a++)for(let b=-4;b<=4;b++)for(let c=-4;c<=4;c++){
    if(a===0&&b===0&&c===0)continue;let p=[BigInt(c),BigInt(b),BigInt(a)];while(p.length>1&&p.at(-1)===0n)p.pop();
    const roots=f.w.findZeros(p),disc=b*b-4*a*c;
    const expectedCount=a===0?(b===0?0:1):disc<0?0:disc===0?1:2;assert.equal(roots.length,expectedCount,p.join(','));assert.equal(new Set(roots.map(r=>r.key)).size,expectedCount);
    roots.forEach(root=>{
      if(root.kind==='rational')assert.equal(BigInt(a)*root.n*root.n+BigInt(b)*root.n*root.d+BigInt(c)*root.d*root.d,0n);
      else{
        // Independent floating evaluation is used only to corroborate irrational
        // root identities; all production root representations remain exact.
        const q=plain(root.poly).map(Number),x=(-q[1]+root.sign*Math.sqrt(Number(root.discriminant)))/(2*q[2]);
        assert.ok(Math.abs(a*x*x+b*x+c)<1e-10);assert.ok(disc>0&&!Number.isInteger(Math.sqrt(disc)));
      }
    });count++;
  }
  assert.equal(count,728);
});
test('irrational roots and repeated roots are exact and deduplicated across original sources',t=>{
  const f=fixture(t);f.begin('loadM','1','x^2-2','1','2x^2-4');assert.equal(f.state().restrictions.length,2);
  assert.deepEqual(Array.from(f.state().restrictions,r=>r.text),['(0 − √8)/2','(0 + √8)/2']);
  assert.match(f.steps().find(s=>s.title==='Find the Excluded Values').instruction,/exact values/);
  f.reset();f.begin('loadD','1','(x-1)^2','2x-2','x-1');assert.deepEqual(Array.from(f.state().restrictions,r=>r.text),['1']);
  f.reset();f.begin('loadR','1','x^2+1');assert.equal(f.state().restrictions.length,0);assert.match(f.steps().find(s=>s.title==='Find the Excluded Values').instruction,/no real zeros/);assert.doesNotMatch(f.steps().find(s=>s.title==='Find the Excluded Values').instruction,/nonzero constant/);
});
test('parser preserves grouping, collected terms, and unary-minus precedence',t=>{
  const f=fixture(t);
  for(const [input,expected] of [
    ['-x^2',[0n,0n,-1n]],['(-x)^2',[0n,0n,1n]],['2(x+1)',[2n,2n]],['(x+2)(x-3)',[-6n,-1n,1n]],
    ['x*x+2x-x+1',[1n,1n,1n]],['−2X² + 4',[4n,0n,-2n]],['x--1',[1n,1n]],['x + +1',[1n,1n]],['0x^2+3x+2',[2n,3n]],['2·x×x',[0n,0n,2n]],
  ])assert.deepEqual(plain(f.w.parseExpr(input)),expected,input);
});
test('input length, degree and coefficient boundaries are explicit and bounded',t=>{
  const f=fixture(t);
  for(const invalid of ['1000001x','(1000000x+1)^2','x^3','(x+1)^3','x^2*x','x^999999999','x^2^2','0^0','x^0','x^-2','x^1.5','2.5x','1/2x','(x+1','x+1)','()','x**2','x/0','x=2','x;alert(1)','9'.repeat(1000),'('.repeat(13)+'x'+')'.repeat(13)]){
    assert.throws(()=>f.w.parseExpr(invalid),undefined,invalid);
  }
  assert.deepEqual(plain(f.w.parseExpr('1000000x^2-1000000x+1000000')),[1000000n,-1000000n,1000000n]);
  assert.deepEqual(plain(f.w.parseExpr('(1000x+1)(1000x-1)')),[-1n,0n,1000000n]);
  assert.throws(()=>f.w.parseExpr('x^5',true));assert.throws(()=>f.w.parseExpr('1'.repeat(241),true));
});
test('large coefficients remain exact through multiplication, factoring and answer entry',t=>{
  const f=fixture(t);f.begin('loadM','1000000x^2-1','999999','1000000x^2+1','1');
  assert.deepEqual(plain(f.state().numerator),[-1n,0n,0n,0n,1000000000000n]);assert.deepEqual(plain(f.state().denominator),[999999n]);
  f.complete({roots:[],common:'1',answer:['1000000000000x^4-1','999999']});assert.equal(f.result(),'(1000000000000x^4-1) / (999999)');
});
test('all input positions reject malformed and unsupported expressions without injecting markup',t=>{
  const f=fixture(t);
  const groups=[['loadS',['sNum','sDen']],['loadM',['mN1','mD1','mN2','mD2']],['loadD',['dN1','dD1','dN2','dD2']],['loadR',['rNum','rDen']]];
  for(const [loader,ids] of groups)for(const id of ids)for(const bad of ['','xjunk','y+1','1e3','Infinity','<img src=x onerror=alert(1)>']){
    f.reset();f.w[loader](...ids.map(()=>'x+1'));f.d.getElementById(id).value=bad;f.w.startSolving();assert.equal(f.open(),false,loader+':'+id+':'+bad);assert.equal(f.d.querySelector('#workspace img'),null);f.flush();assert.ok(f.error());
  }
  for(const [loader,parts] of [['loadM',['1','0','1','x']],['loadM',['1','x','1','0']],['loadD',['1','x','1','0']]]){f.reset();f.begin(loader,...parts);assert.equal(f.open(),false);}
});
test('answer validation rejects malformed, approximate, zero-denominator and wrong polynomial answers',t=>{
  const f=fixture(t);f.begin('loadS','2x^2','x');f.info();f.choose(['x = 0']);f.info();
  for(const bad of ['xjunk','1.001x','NaN','x^5','x/1'])f.submit(bad,false);f.submit('x');f.info();
  for(const pair of [['2','1'],['2.001x','1'],['2x','0'],['2x','x-x'],['2x','1junk'],['2x','x']])f.submit(pair,false);
  f.submit(['(x+x)','1']);assert.equal(f.result(),'2x');
});
test('future steps and duplicate or stale transitions cannot skip work or revive a reset problem',t=>{
  const f=fixture(t);f.begin('loadS','2x^2','x');f.w.completeStep(6);f.w.showStep(7);f.w.finishProblem();assert.equal(f.index(),0);assert.equal(f.solved(),false);
  f.info();f.w.completeStep(f.index());assert.equal(f.steps()[f.index()].type,'restrictions');f.choose(['x = 0'],true,false);const prior=f.index();f.w.checkStep(prior);f.flush();assert.equal(f.index(),prior+1);assert.equal(f.d.querySelectorAll('#step-'+f.index()).length,1);
  f.submit('x',true,false);f.reset();f.begin('loadR','1','x-1');f.flush();assert.equal(f.index(),0);assert.equal(f.d.querySelectorAll('.step-card').length,1);assert.equal(f.state().mode,'restrict');
  f.w.loadD('1','x','0','1');assert.equal(f.state().mode,'restrict');
});
test('progress completes a phase only after all its steps are accepted',t=>{
  const f=fixture(t);f.begin('loadS','2x^2','x');f.w.completeStep(0);assert.equal(f.d.getElementById('proc-identify').classList.contains('done'),true);
  f.w.completeStep(1);assert.equal(f.d.getElementById('proc-factor').classList.contains('done'),false);f.w.completeStep(2);assert.equal(f.d.getElementById('proc-factor').classList.contains('done'),true);
  f.w.completeStep(3);assert.equal(f.d.getElementById('proc-cancel').classList.contains('done'),false);f.choose(['x = 0']);f.submit('x');f.info();assert.equal(f.d.getElementById('proc-cancel').classList.contains('done'),true);assert.equal(f.d.getElementById('proc-answer').classList.contains('done'),false);f.submit(['2x','1']);assert.equal(f.d.getElementById('proc-answer').classList.contains('done'),true);
});
test('native controls, visible labels, keyboard submission, persistent feedback and reset focus work',t=>{
  const f=fixture(t);for(const input of f.d.querySelectorAll('.input-section input'))assert.ok(input.labels.length,input.id);
  for(const button of f.d.querySelectorAll('.mode-tab,.example-chip,.examples-toggle'))assert.equal(button.tagName,'BUTTON');
  assert.equal(f.d.getElementById('examplesBody').hidden,true);f.d.getElementById('examplesToggle').click();assert.equal(f.d.getElementById('examplesToggle').getAttribute('aria-expanded'),'true');
  f.w.loadS('2x^2','x');f.d.getElementById('sDen').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.ok(f.open());f.info();f.choose(['x = 0']);
  const input=f.d.querySelector('#step-'+f.index()+' input');assert.ok(input.labels.length);input.value='1';input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));f.flush();assert.equal(input.disabled,false);assert.ok(f.d.getElementById('fb-'+f.index()).textContent);
  input.value='x';input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));f.flush();assert.equal(input.disabled,true);f.reset();assert.equal(f.open(),false);assert.equal(f.d.activeElement.id,'tab-simplify');assert.equal(f.d.querySelectorAll('.mode-tab[aria-pressed="true"]').length,0);assert.ok([...f.d.querySelectorAll('.input-section input')].every(i=>i.value===''));
});
