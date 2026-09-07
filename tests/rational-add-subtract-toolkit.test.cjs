// Run the actual organizer; expected results and identity checks are independent.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(process.env.RC_RATIONAL_ADD_SUBTRACT_HTML||path.resolve(__dirname,
  '../site/math-toolkit/presentations/algebra/algebra-2/presentation-03/a24-add-subtract-rational.html'),'utf8');
function fixture(t){
  const pending=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{runScripts:'dangerously',virtualConsole:vc,url:'https://example.test/rational-add-subtract',beforeParse(w){w.HTMLElement.prototype.scrollIntoView=()=>{};w.setTimeout=fn=>{pending.push(fn);return pending.length;};}});
  const w=dom.window,d=w.document;t.after(()=>{w.close();assert.deepEqual(errors,[]);});
  const flush=()=>{while(pending.length)pending.shift()();};
  const state=()=>w.eval('S'),steps=()=>w.eval('stepsData'),index=()=>w.eval('currentStep');
  const open=()=>d.getElementById('workspace').classList.contains('visible'),solved=()=>d.getElementById('resultSection').classList.contains('visible');
  function begin(loader,...parts){w[loader](...parts);w.startSolving();}
  function info(){while(!solved()&&steps()[index()]?.type==='info'){d.querySelector('#step-'+index()+' .btn-primary').click();flush();}}
  function submit(values,correct=true,advance=true){
    if(!Array.isArray(values))values=[values];const i=index(),inputs=Array.from(d.querySelectorAll('#step-'+i+' input[type="text"]'));assert.equal(inputs.length,values.length,steps()[i].title);
    inputs.forEach((input,j)=>{assert.equal(input.disabled,false);input.value=String(values[j]);});d.querySelector('#step-'+i+' .btn-check').click();assert.equal(inputs.every(input=>input.disabled),correct,d.getElementById('fb-'+i).textContent);if(advance)flush();
  }
  function choose(values,correct=true,advance=true){
    const i=index(),options=Array.from(d.querySelectorAll('#step-'+i+' input[type="checkbox"]'));assert.ok(options.length);options.forEach(input=>{input.checked=false;});
    values.forEach(text=>{const input=options.find(input=>input.parentElement.textContent.trim()===text);assert.ok(input,'Missing choice '+text);input.click();});d.querySelector('#step-'+i+' .btn-check').click();assert.equal(options.every(input=>input.disabled),correct,d.getElementById('fb-'+i).textContent);if(advance)flush();
  }
  function complete(expected){
    info();choose(expected.roots.length?expected.roots.map(v=>'x = '+v):['No excluded real values']);info();
    submit(expected.lcd);submit(expected.multipliers);submit(expected.rewritten);
    if(expected.negated!==undefined)submit(expected.negated);
    submit(expected.combined);info();submit(expected.answer);assert.ok(solved());
  }
  return {w,d,flush,state,steps,index,open,solved,begin,info,submit,choose,complete,reset:()=>w.resetAll(),
    result:()=>d.getElementById('resultExpr').textContent,detail:()=>d.getElementById('resultDetail').textContent,error:()=>d.getElementById('errorMsg').textContent,
    plannedResult:()=>typeof w.expressionText==='function'?w.expressionText(state().numerator,state().denominator):state().finalDen==='1'?state().finalNum:'('+state().finalNum+') / ('+state().finalDen+')',
    lcd:()=>typeof w.polyText==='function'?w.polyText(state().lcd):state().lcdStr,
    combined:()=>typeof w.polyText==='function'?w.polyText(state().rawN):state().combined,
    restrictions:()=>typeof w.restrictionText==='function'?w.restrictionText(state().restrictions):state().restrictStr||''};
}
// Independent Horner evaluation and convolution use no organizer functions.
function evaluate(p,x){let v=0n;for(let i=p.length-1;i>=0;i--)v=v*x+BigInt(p[i]);return v;}
function plain(p){return Array.from(p);}

test('compound numerators retain grouping when rewritten and combined',t=>{
  const f=fixture(t);f.begin('loadAD','x+1','x','x+2','x+3');
  assert.equal(f.combined(),'2x^2+6x+3');assert.equal(f.plannedResult(),'(2x^2+6x+3) / (x^2+3x)');
});
test('numeric and variable factors both contribute to the least common denominator',t=>{
  const f=fixture(t);f.begin('loadAD','2','3x','4','5x');assert.equal(f.lcd(),'15x');assert.equal(f.plannedResult(),'(22) / (15x)');
});
test('a shared polynomial factor is included only to its greatest multiplicity in the LCD',t=>{
  const f=fixture(t);f.begin('loadAD','1','x^2-1','1','x-1');assert.equal(f.lcd(),'x^2-1');assert.equal(f.plannedResult(),'(x+2) / (x^2-1)');
});
test('subtraction distributes its sign across a quadratic numerator',t=>{
  const f=fixture(t);f.begin('loadSS','x^2+2x+3','x^2-3x+4','x+1');assert.equal(f.combined(),'5x-1');
});
test('zero sums simplify to zero while retaining their original domain',t=>{
  const f=fixture(t);f.begin('loadSS','x+1','x+1','x-2');assert.equal(f.plannedResult(),'0');assert.match(f.restrictions(),/x ≠ 2/);
});
test('cancelled original denominator restrictions remain in the answer',t=>{
  const f=fixture(t);f.begin('loadAS','x','-1','x-1');assert.match(f.restrictions(),/x ≠ 1/);
});
test('zero original denominators are rejected in every activity',t=>{
  const f=fixture(t);
  for(const loader of ['loadAS','loadSS'])for(const d of ['0','x-x','0x^2']){f.reset();f.begin(loader,'1','2',d);assert.equal(f.open(),false,loader+':'+d);assert.match(f.error(),/identically zero|undefined.*every x/);}
  for(const loader of ['loadAD','loadSD'])for(const parts of [['1','0','2','x'],['1','x','2','x-x']]){f.reset();f.begin(loader,...parts);assert.equal(f.open(),false);}
});
test('unsupported algebra is rejected instead of displayed as a valid problem',t=>{
  const f=fixture(t);for(const bad of ['sin(x)','xjunk','x^3','1/x','2.5x','y+1','<img src=x>']){f.reset();f.begin('loadAD',bad,'x','1','x+1');assert.equal(f.open(),false,bad);assert.ok(f.error());}
});

// Each row independently specifies every student answer, in practice-chip order.
const examples=[
  {roots:['-1'],lcd:'x+1',multipliers:['1','1'],rewritten:['3','5'],combined:'8',answer:['8','x+1']},
  {roots:['3'],lcd:'x-3',multipliers:['1','1'],rewritten:['2x','4'],combined:'2x+4',answer:['2x+4','x-3']},
  {roots:['0'],lcd:'2x',multipliers:['1','1'],rewritten:['x','7'],combined:'x+7',answer:['x+7','2x']},
  {roots:['-4'],lcd:'x+4',multipliers:['1','1'],rewritten:['x+1','x-1'],combined:'2x',answer:['2x','x+4']},
  {roots:['1'],lcd:'x-1',multipliers:['1','1'],rewritten:['x','-1'],combined:'x-1',answer:['1','1']},
  {roots:[],lcd:'x^2+1',multipliers:['1','1'],rewritten:['1','1'],combined:'2',answer:['2','x^2+1']},
  {roots:['-3'],lcd:'x+3',multipliers:['1','1'],rewritten:['5x','2x'],negated:'-2x',combined:'3x',answer:['3x','x+3']},
  {roots:['1'],lcd:'x-1',multipliers:['1','1'],rewritten:['x+6','3'],negated:'-3',combined:'x+3',answer:['x+3','x-1']},
  {roots:['5'],lcd:'x-5',multipliers:['1','1'],rewritten:['4x','x+2'],negated:'-x-2',combined:'3x-2',answer:['3x-2','x-5']},
  {roots:['0'],lcd:'2x',multipliers:['1','1'],rewritten:['3x+1','x-3'],negated:'-x+3',combined:'2x+4',answer:['x+2','x']},
  {roots:['-1'],lcd:'x+1',multipliers:['1','1'],rewritten:['x^2+2x+3','x^2-3x+4'],negated:'-x^2+3x-4',combined:'5x-1',answer:['5x-1','x+1']},
  {roots:['2'],lcd:'x-2',multipliers:['1','1'],rewritten:['x+1','x+1'],negated:'-x-1',combined:'0',answer:['0','1']},
  {roots:['0','-1'],lcd:'x^2+x',multipliers:['x+1','x'],rewritten:['3x+3','5x'],combined:'8x+3',answer:['8x+3','x^2+x']},
  {roots:['-2','2'],lcd:'x^2-4',multipliers:['x+2','x-2'],rewritten:['x+2','x-2'],combined:'2x',answer:['2x','x^2-4']},
  {roots:['0'],lcd:'15x',multipliers:['5','3'],rewritten:['10','12'],combined:'22',answer:['22','15x']},
  {roots:['-1','1'],lcd:'x^2-1',multipliers:['x-1','x+1'],rewritten:['x^2-x','3x+3'],combined:'x^2+2x+3',answer:['x^2+2x+3','x^2-1']},
  {roots:['0','-3'],lcd:'x^2+3x',multipliers:['x+3','x'],rewritten:['x^2+4x+3','x^2+2x'],combined:'2x^2+6x+3',answer:['2x^2+6x+3','x^2+3x']},
  {roots:['-1','1'],lcd:'x^2-1',multipliers:['1','x+1'],rewritten:['1','x+1'],combined:'x+2',answer:['x+2','x^2-1']},
  {roots:['0','-3'],lcd:'x^2+3x',multipliers:['x+3','x'],rewritten:['7x+21','2x'],negated:'-2x',combined:'5x+21',answer:['5x+21','x^2+3x']},
  {roots:['-1','1'],lcd:'x^2-1',multipliers:['x+1','x-1'],rewritten:['4x+4','x-1'],negated:'-x+1',combined:'3x+5',answer:['3x+5','x^2-1']},
  {roots:[],lcd:'4',multipliers:['2','1'],rewritten:['2x','3'],negated:'-3',combined:'2x-3',answer:['2x-3','4']},
  {roots:['-2','4'],lcd:'x^2-2x-8',multipliers:['x-4','x+2'],rewritten:['5x-20','2x+4'],negated:'-2x-4',combined:'3x-24',answer:['3x-24','x^2-2x-8']},
  {roots:['-1','1'],lcd:'x^2-1',multipliers:['x+1','x-1'],rewritten:['x^2+2x+1','x^2+x-2'],negated:'-x^2-x+2',combined:'x+3',answer:['x+3','x^2-1']},
  {roots:['1'],lcd:'x-1',multipliers:['1','-1'],rewritten:['1','-1'],negated:'1',combined:'2',answer:['2','x-1']},
];
test('all 24 practice problems finish with independently supplied intermediate and final answers',t=>{
  const f=fixture(t),chips=Array.from(f.d.querySelectorAll('.example-chip'));assert.equal(chips.length,examples.length);
  chips.forEach((chip,i)=>{f.reset();chip.click();f.w.startSolving();assert.ok(f.open(),chip.textContent);f.complete(examples[i]);
    const [n,d]=examples[i].answer;assert.equal(f.result(),d==='1'?n:'('+n+') / ('+d+')',chip.textContent);
    for(const root of examples[i].roots)assert.ok(f.detail().includes('x ≠ '+root));
    assert.equal(f.d.querySelectorAll('.step-card input:not(:disabled),.step-card button:not(:disabled)').length,0);
    assert.equal(f.d.getElementById('proc-answer').classList.contains('done'),true);
  });
});
test('the LCD checker distinguishes missing factors, oversized common denominators, and negative signs',t=>{
  const f=fixture(t);f.begin('loadAD','2','3x','4','5x');f.info();f.choose(['x = 0']);f.info();
  for(const [answer,message] of [['0',/cannot be zero/],['-15x',/positive leading/],['5x',/divide.*exactly/],['15x^2',/not the least/],['30x',/not the least/]]){f.submit(answer,false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,message);}
  f.submit('3*5*x');f.submit(['3','5'],false);f.submit(['5','3']);f.submit(['6','20'],false);f.submit(['10','12']);f.submit('22');f.info();
  f.submit(['44','30x'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/not fully reduced/);
  f.submit(['-22','-15x'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/positive leading/);f.submit(['22','15x']);
});
test('grouped products and subtraction give feedback for the actual sign and distribution mistakes',t=>{
  const f=fixture(t);f.begin('loadSD','x+1','x-1','x+2','x+1');f.info();f.choose(['x = -1','x = 1']);f.info();f.submit('(x-1)(x+1)');f.submit(['x+1','x-1']);
  const rewrite=f.steps()[f.index()];assert.match(rewrite.instruction,/\(x\+1\) · \(x\+1\)/);assert.match(rewrite.instruction,/\(x\+2\) · \(x-1\)/);
  f.submit(['x+1(x+1)','x+2(x-1)'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/every term/);
  f.submit(['(x+1)^2','(x+2)(x-1)']);f.submit('-x^2+x-2',false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/every term/);f.submit('-x^2-x+2');
  f.submit('x-1',false);f.submit('x+3');f.info();f.submit(['x+3','(x-1)(x+1)']);
});
test('zero results and cancelled holes retain rational and irrational restrictions',t=>{
  const f=fixture(t);f.begin('loadSD','1','x^2-2','2','2x^2-4');f.info();
  f.choose(['No excluded real values'],false);f.choose(['x = (0 − √8)/2','x = (0 + √8)/2']);f.info();f.submit('2x^2-4');f.submit(['2','1']);f.submit(['2','2']);f.submit('-2');f.submit('0');f.info();
  f.submit(['0','x^2-2'],false);f.submit(['0','1']);assert.equal(f.result(),'0');assert.match(f.detail(),/√8/);assert.equal(f.state().restrictions.length,2);
  f.reset();f.begin('loadAS','x','-1','x-1');f.complete({roots:['1'],lcd:'x-1',multipliers:['1','1'],rewritten:['x','-1'],combined:'x-1',answer:['1','1']});assert.equal(f.result(),'1');assert.match(f.detail(),/x ≠ 1/);
});
test('negative denominators, equivalent denominator forms, and nonmonic repeated factors are handled exactly',t=>{
  const f=fixture(t);
  f.begin('loadSS','2x','x-1','-2x-2');f.complete({roots:['-1'],lcd:'2x+2',multipliers:['-1','-1'],rewritten:['-2x','-x+1'],negated:'x-1',combined:'-x-1',answer:['-1','2']});
  f.reset();f.begin('loadAD','1','(2x+1)^2','1','4x+2');f.complete({roots:['-1/2'],lcd:'2(2x+1)^2',multipliers:['2','2x+1'],rewritten:['2','2x+1'],combined:'2x+3',answer:['2x+3','2(2x+1)^2']});
  f.reset();f.begin('loadAD','1','x^2-1','1','(x-1)(x+1)');assert.equal(f.lcd(),'x^2-1');assert.deepEqual(plain(f.state().multipliers).map(plain),[[1n],[1n]]);
});

function multiply(a,b){const out=Array(a.length+b.length-1).fill(0n);for(let k=0;k<out.length;k++)for(let i=0;i<=k;i++)if(i<a.length&&k-i<b.length)out[k]+=BigInt(a[i])*BigInt(b[k-i]);return out;}
test('3136 constructed denominator pairs have the independently specified least common multiple',t=>{
  const f=fixture(t),factors=[[-1n,1n],[0n,1n],[1n,1n],[1n,2n],[1n,0n,1n],[-2n,0n,1n]];
  const groups=[[],[0],[1],[2],[3],[0,0],[1,1],[2,2],[3,3],[0,1],[0,3],[1,2],[4],[5]];
  const scalars=[-6n,-2n,3n,4n],scalarLCMs=[[6n,6n,6n,12n],[6n,2n,6n,4n],[6n,6n,3n,12n],[12n,4n,12n,4n]];
  let count=0;
  for(const left of groups)for(const right of groups)for(let a=0;a<4;a++)for(let b=0;b<4;b++){
    const p=left.reduce((v,k)=>multiply(v,factors[k]),[scalars[a]]),q=right.reduce((v,k)=>multiply(v,factors[k]),[scalars[b]]);
    let expected=[scalarLCMs[a][b]];
    for(let k=0;k<factors.length;k++)for(let copies=0;copies<Math.max(left.filter(i=>i===k).length,right.filter(i=>i===k).length);copies++)expected=multiply(expected,factors[k]);
    assert.deepEqual(plain(f.w.buildLCD(p,q)),expected,p+' ; '+q);count++;
  }
  assert.equal(count,3136);
});
test('800 generated four-mode problems preserve every intermediate identity and the original domain',t=>{
  const f=fixture(t);let seed=1473,count=0,identityChecks=0;
  const next=()=>{seed=seed*48271%2147483647;return seed;};
  const polynomial=()=>{const p=[BigInt(next()%11-5),BigInt(next()%11-5),BigInt(next()%7-3)];while(p.length>1&&p.at(-1)===0n)p.pop();return p;};
  for(let trial=0;trial<200;trial++){
    const generated=[polynomial(),polynomial(),polynomial(),polynomial()];for(const i of [1,3])if(generated[i].every(v=>v===0n))generated[i]=[1n];
    for(const mode of ['addSame','subSame','addDiff','subDiff']){
      const parts=generated.slice();if(mode.endsWith('Same'))parts[3]=parts[1];const result=f.w.solveProblem(mode,parts),sign=mode.startsWith('add')?1n:-1n;let points=0;
      for(let x=-14n;x<=14n;x++){
        const [a,b,c,d]=parts.map(p=>evaluate(p,x)),allowed=b!==0n&&d!==0n;
        const excluded=result.restrictions.some(r=>r.kind==='rational'&&r.n===x*r.d);assert.equal(!excluded,allowed);
        assert.equal(evaluate(result.lcd,x),b*evaluate(result.multipliers[0],x));assert.equal(evaluate(result.lcd,x),d*evaluate(result.multipliers[1],x));
        assert.equal(evaluate(result.rewritten[0],x),a*evaluate(result.multipliers[0],x));assert.equal(evaluate(result.rewritten[1],x),c*evaluate(result.multipliers[1],x));
        assert.equal(evaluate(result.negated,x),-evaluate(result.rewritten[1],x));assert.equal(evaluate(result.rawN,x),evaluate(result.rewritten[0],x)+sign*evaluate(result.rewritten[1],x));
        if(!allowed)continue;assert.notEqual(evaluate(result.denominator,x),0n);
        assert.equal(evaluate(result.numerator,x)*b*d,(a*d+sign*c*b)*evaluate(result.denominator,x));points++;identityChecks++;
      }
      // Final cross-product differences have degree <= 8. Nine distinct exact
      // evaluations prove the polynomial identity, not just approximate agreement.
      assert.ok(points>=9);assert.ok(result.denominator.at(-1)>0n);count++;
    }
  }
  assert.equal(count,800);assert.ok(identityChecks>19000);
});
test('728 linear and quadratic original denominators agree with an independent real-root oracle',t=>{
  const f=fixture(t);let count=0;
  for(let a=-4;a<=4;a++)for(let b=-4;b<=4;b++)for(let c=-4;c<=4;c++){
    if(a===0&&b===0&&c===0)continue;const p=[BigInt(c),BigInt(b),BigInt(a)];while(p.length>1&&p.at(-1)===0n)p.pop();
    const roots=f.w.findZeros(p),disc=b*b-4*a*c,expected=a===0?(b===0?0:1):disc<0?0:disc===0?1:2;assert.equal(roots.length,expected);assert.equal(new Set(roots.map(r=>r.key)).size,expected);
    for(const root of roots){if(root.kind==='rational')assert.equal(BigInt(a)*root.n*root.n+BigInt(b)*root.n*root.d+BigInt(c)*root.d*root.d,0n);else{const q=plain(root.poly).map(Number),x=(-q[1]+root.sign*Math.sqrt(Number(root.discriminant)))/(2*q[2]);assert.ok(Math.abs(a*x*x+b*x+c)<1e-10);assert.ok(disc>0&&!Number.isInteger(Math.sqrt(disc)));}}
    count++;
  }
  assert.equal(count,728);
});
test('all original input positions reject malformed syntax and retain a readable error',t=>{
  const f=fixture(t),groups=[['loadAS',['asN1','asN2','asD']],['loadSS',['ssN1','ssN2','ssD']],['loadAD',['adN1','adD1','adN2','adD2']],['loadSD',['sdN1','sdD1','sdN2','sdD2']]];
  for(const [loader,ids] of groups)for(const id of ids)for(const bad of ['','xjunk','NaN','Infinity','1e3','y+1','<img src=x onerror=alert(1)>']){f.reset();f.w[loader](...ids.map(()=>'x+1'));f.d.getElementById(id).value=bad;f.w.startSolving();f.flush();assert.equal(f.open(),false,loader+':'+id+':'+bad);assert.ok(f.error());assert.equal(f.d.querySelector('#workspace img'),null);}
});
test('parser boundaries and exact large coefficients remain supported through degree-four answers',t=>{
  const f=fixture(t);
  for(const bad of ['1000001x','(1000000x+1)^2','x^3','x^2*x','x^0','x^-2','x^1.5','x^2^2','x2','2 3','(x+1','()','x**2','1/2x','2.5x','x=2','x;alert(1)','9'.repeat(161),'('.repeat(13)+'x'+')'.repeat(13)])assert.throws(()=>f.w.parseExpr(bad),undefined,bad);
  for(const [input,expected] of [['-x^2',[0n,0n,-1n]],['(-x)^2',[0n,0n,1n]],['−2X² + 4',[4n,0n,-2n]],['(x+2)(x-3)',[-6n,-1n,1n]],['x--1',[1n,1n]]])assert.deepEqual(plain(f.w.parseExpr(input)),expected);
  assert.throws(()=>f.w.parseExpr('x^5',true));assert.throws(()=>f.w.parseExpr('1'.repeat(241),true));
  f.begin('loadAD','1000000x^2','1000000x^2-1','1000000x^2','1000000x^2+1');
  f.complete({roots:['-1/1000','1/1000'],lcd:'1000000000000x^4-1',multipliers:['1000000x^2+1','1000000x^2-1'],rewritten:['1000000000000x^4+1000000x^2','1000000000000x^4-1000000x^2'],combined:'2000000000000x^4',answer:['2000000000000x^4','1000000000000x^4-1']});
});
test('answer fields reject malformed, approximate, and zero-denominator answers',t=>{
  const f=fixture(t);f.begin('loadAS','x','-1','x-1');f.info();f.choose(['x = 1']);f.info();
  for(const bad of ['xjunk','1.001x','NaN','x^5','x/1'])f.submit(bad,false);f.submit('x-1');f.submit(['1','1']);f.submit(['x','-1']);f.submit('x-1');f.info();
  for(const pair of [['1.001','1'],['1','0'],['1','x-x'],['1','1junk'],['x','x-1']])f.submit(pair,false);f.submit(['1','1']);
});
test('restriction selections reject omitted holes, extra numerator zeros, and contradictory choices',t=>{
  const f=fixture(t);f.begin('loadAD','x','x-1','0','x+1');f.info();f.choose(['x = 1'],false);f.choose(['x = -1','x = 0','x = 1'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/numerator zeros/);f.choose(['x = -1','x = 1','No excluded real values'],false);assert.match(f.d.getElementById('fb-'+f.index()).textContent,/not both/);f.choose(['x = -1','x = 1']);
});
test('future, duplicate, and stale transitions cannot skip answers or revive a reset problem',t=>{
  const f=fixture(t);f.begin('loadAS','3','5','x+1');f.w.completeStep(5);f.w.showStep(6);f.w.finishProblem();assert.equal(f.index(),0);assert.equal(f.solved(),false);
  f.info();f.w.completeStep(f.index());assert.equal(f.steps()[f.index()].type,'restrictions');f.choose(['x = -1'],true,false);const prior=f.index();f.w.checkStep(prior);f.flush();assert.equal(f.index(),prior+1);f.info();
  f.submit('x+1',true,false);f.reset();f.begin('loadSD','1','x','1','x+1');f.flush();assert.equal(f.index(),0);assert.equal(f.d.querySelectorAll('.step-card').length,1);assert.equal(f.state().mode,'subDiff');
  f.w.loadAS('0','0','0');assert.equal(f.state().mode,'subDiff');
});
test('phase progress requires every student step in that phase to be accepted',t=>{
  const f=fixture(t);f.begin('loadAS','3','5','x+1');f.info();assert.equal(f.d.getElementById('proc-identify').classList.contains('done'),false);f.choose(['x = -1']);assert.equal(f.d.getElementById('proc-identify').classList.contains('done'),true);f.info();
  f.submit('x+1');f.submit(['1','1']);assert.equal(f.d.getElementById('proc-lcd').classList.contains('done'),false);f.submit(['3','5']);assert.equal(f.d.getElementById('proc-lcd').classList.contains('done'),true);f.submit('8');assert.equal(f.d.getElementById('proc-combine').classList.contains('done'),true);f.info();assert.equal(f.d.getElementById('proc-answer').classList.contains('done'),false);f.submit(['8','x+1']);assert.equal(f.d.getElementById('proc-answer').classList.contains('done'),true);
});
test('labels, keyboard submission, synchronized denominators, practice disclosure, and reset work',t=>{
  const f=fixture(t);for(const input of f.d.querySelectorAll('.input-section input'))assert.ok(input.labels.length,input.id);for(const button of f.d.querySelectorAll('.mode-tab,.example-chip,.examples-toggle'))assert.equal(button.tagName,'BUTTON');
  assert.equal(f.d.getElementById('examplesBody').hidden,true);f.d.getElementById('examplesToggle').click();assert.equal(f.d.getElementById('examplesToggle').getAttribute('aria-expanded'),'true');
  f.w.loadAS('3','5','x+1');assert.equal(f.d.getElementById('asD2').value,'x+1');f.d.getElementById('asD').value='x-1';f.d.getElementById('asD').dispatchEvent(new f.w.Event('input',{bubbles:true}));assert.equal(f.d.getElementById('asD2').value,'x-1');assert.equal(f.d.getElementById('asD2').readOnly,true);
  f.d.getElementById('asN2').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.ok(f.open());f.info();f.choose(['x = 1']);f.info();const input=f.d.querySelector('#step-'+f.index()+' input');assert.ok(input.labels.length);input.value='x';input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));f.flush();assert.equal(input.disabled,false);assert.ok(f.d.getElementById('fb-'+f.index()).textContent);input.value='x-1';input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));f.flush();assert.equal(input.disabled,true);
  f.reset();assert.equal(f.open(),false);assert.equal(f.d.activeElement.id,'tab-addSame');assert.equal(f.d.querySelectorAll('.mode-tab[aria-pressed="true"]').length,0);assert.ok([...f.d.querySelectorAll('.input-section input')].every(i=>i.value===''));
});
