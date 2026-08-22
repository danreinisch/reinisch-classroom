(function(){
  'use strict';
  const slides=[...document.querySelectorAll('.slide')];
  const prev=document.getElementById('prevBtn');
  const next=document.getElementById('nextBtn');
  const current=document.getElementById('current');
  const total=document.getElementById('total');
  const topCount=document.getElementById('topCount');
  const progress=document.getElementById('progressBar');
  const overlay=document.getElementById('overlay');
  const close=document.getElementById('closeModal');
  const modalTitle=document.getElementById('modalTitle');
  const modalBody=document.getElementById('modalBody');
  let index=0, lastFocus=null, touchStartX=null;
  total.textContent=slides.length;

  function animateSlide(slide){
    if(!slide) return;
    const items=[...slide.querySelectorAll('.kicker,h1,h2,.lead,.big-quote,.hero-rule,.hero-stamp,.chips,.card,.topic,.course-btn,.rule,.phrase,.callout,.footer-line')];
    items.forEach((el,i)=>el.style.setProperty('--stagger',Math.min(i,12)*52+'ms'));
    slide.classList.remove('motion-in');
    void slide.offsetWidth;
    slide.classList.add('motion-in');
  }

  function show(n){
    n=Math.max(0,Math.min(slides.length-1,n));
    slides.forEach((s,i)=>{
      s.classList.toggle('active',i===n);
      if(i!==n) s.classList.remove('motion-in');
    });
    index=n;
    current.textContent=n+1;
    topCount.textContent=String(n+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
    progress.style.width=((n+1)/slides.length*100)+'%';
    prev.disabled=n===0; next.disabled=n===slides.length-1;
    prev.setAttribute('aria-disabled',String(prev.disabled)); next.setAttribute('aria-disabled',String(next.disabled));
    animateSlide(slides[n]);
  }
  function move(delta){ if(!overlay.classList.contains('open')) show(index+delta); }
  prev.addEventListener('click',()=>move(-1));
  next.addEventListener('click',()=>move(1));

  function openDetail(id,trigger){
    const t=document.getElementById(id); if(!t) return;
    const title=t.content.querySelector('[data-title]');
    const body=t.content.querySelector('[data-body]');
    lastFocus=trigger||document.activeElement;
    modalTitle.textContent=title?title.textContent:'Example';
    modalBody.innerHTML=body?body.innerHTML:'';
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden','false');
    close.focus();
  }
  function closeDetail(){
    overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true'); modalBody.innerHTML='';
    if(lastFocus && typeof lastFocus.focus==='function') lastFocus.focus();
  }
  document.querySelectorAll('[data-detail]').forEach(btn=>btn.addEventListener('click',()=>openDetail(btn.dataset.detail,btn)));
  close.addEventListener('click',closeDetail);
  overlay.addEventListener('click',e=>{if(e.target===overlay) closeDetail();});

  document.addEventListener('keydown',e=>{
    if(overlay.classList.contains('open')){
      if(e.key==='Escape') closeDetail();
      return;
    }
    if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();move(1)}
    else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();move(-1)}
    else if(e.key==='Home'){e.preventDefault();show(0)}
    else if(e.key==='End'){e.preventDefault();show(slides.length-1)}
  });

  document.addEventListener('touchstart',e=>{touchStartX=e.changedTouches[0].clientX},{passive:true});
  document.addEventListener('touchend',e=>{
    if(touchStartX===null || overlay.classList.contains('open')) return;
    const dx=e.changedTouches[0].clientX-touchStartX; touchStartX=null;
    if(Math.abs(dx)>70) move(dx<0?1:-1);
  },{passive:true});

  show(0);
  window.RC_EXPECTATIONS_PRESENTATION={showSlide:show,next:()=>move(1),previous:()=>move(-1),version:'3.0-polished-motion'};
})();
