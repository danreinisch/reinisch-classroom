(function(){
  'use strict';

  const slides=[...document.querySelectorAll('.slide')];
  const prev=document.getElementById('prevBtn');
  const next=document.getElementById('nextBtn');
  const current=document.getElementById('current');
  const total=document.getElementById('total');
  const progress=document.getElementById('progressBar');
  const overlay=document.getElementById('overlay');
  const close=document.getElementById('closeModal');
  const modalTitle=document.getElementById('modalTitle');
  const modalBody=document.getElementById('modalBody');
  let index=0, lastFocus=null, touchStartX=null;

  if(total) total.textContent=slides.length;

  function animateSlide(slide){
    if(!slide) return;
    const items=[...slide.querySelectorAll('.kicker,h1,h2,.lead,.big-quote,.hero-rule,.hero-stamp,.chips,.card,.topic,.course-btn,.rule,.phrase,.callout,.footer-line,.portal-tile,.status-tile,.mini-step,.recovery-step,.command-bar')];
    items.forEach((el,i)=>el.style.setProperty('--stagger',Math.min(i,12)*48+'ms'));
    slide.classList.remove('motion-in');
    void slide.offsetWidth;
    slide.classList.add('motion-in');
  }

  function show(n){
    n=Math.max(0,Math.min(slides.length-1,n));
    slides.forEach((slide,i)=>{
      slide.classList.toggle('active',i===n);
      if(i!==n) slide.classList.remove('motion-in');
    });
    index=n;
    if(current) current.textContent=n+1;
    if(progress) progress.style.width=((n+1)/slides.length*100)+'%';
    if(prev){ prev.disabled=n===0; prev.setAttribute('aria-disabled',String(prev.disabled)); }
    if(next){ next.disabled=n===slides.length-1; next.setAttribute('aria-disabled',String(next.disabled)); }
    animateSlide(slides[n]);
  }

  function move(delta){
    if(!overlay || !overlay.classList.contains('open')) show(index+delta);
  }

  function openDetail(id,trigger){
    if(!overlay) return;
    const template=document.getElementById(id);
    if(!template || !template.content) return;
    const title=template.content.querySelector('[data-title]');
    const body=template.content.querySelector('[data-body]');
    lastFocus=trigger||document.activeElement;
    if(modalTitle) modalTitle.textContent=title?title.textContent:'Example';
    if(modalBody) modalBody.innerHTML=body?body.innerHTML:'';
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
    if(close) close.focus();
  }

  function closeDetail(){
    if(!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
    if(modalBody) modalBody.innerHTML='';
    if(lastFocus && typeof lastFocus.focus==='function') lastFocus.focus();
  }

  if(prev) prev.addEventListener('click',()=>move(-1));
  if(next) next.addEventListener('click',()=>move(1));
  document.querySelectorAll('[data-detail]').forEach(btn=>btn.addEventListener('click',()=>openDetail(btn.dataset.detail,btn)));
  if(close) close.addEventListener('click',closeDetail);
  if(overlay) overlay.addEventListener('click',event=>{ if(event.target===overlay) closeDetail(); });

  document.addEventListener('keydown',event=>{
    if(overlay && overlay.classList.contains('open')){
      if(event.key==='Escape') closeDetail();
      return;
    }
    if(['ArrowRight','PageDown',' '].includes(event.key)){
      event.preventDefault(); move(1);
    }else if(['ArrowLeft','PageUp'].includes(event.key)){
      event.preventDefault(); move(-1);
    }else if(event.key==='Home'){
      event.preventDefault(); show(0);
    }else if(event.key==='End'){
      event.preventDefault(); show(slides.length-1);
    }
  });

  document.addEventListener('touchstart',event=>{touchStartX=event.changedTouches[0].clientX;},{passive:true});
  document.addEventListener('touchend',event=>{
    if(touchStartX===null || (overlay && overlay.classList.contains('open'))) return;
    const dx=event.changedTouches[0].clientX-touchStartX;
    touchStartX=null;
    if(Math.abs(dx)>70) move(dx<0?1:-1);
  },{passive:true});

  if(slides.length) show(0);
})();
