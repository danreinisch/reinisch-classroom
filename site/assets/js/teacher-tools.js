// Teacher Tools dashboard logic
(function(){
  const PASSWORD = 'Tool46&2!';

  // Password gate
  const gate = document.getElementById('gate');
  const pass = document.getElementById('pass');
  const enter = document.getElementById('enter');
  function unlockIfValid() {
    if ((pass.value || '').trim() === PASSWORD) {
      localStorage.setItem('teacher-tools-ok','1');
      gate.classList.add('hidden');
      return true;
    }
    alert('Incorrect password.');
    return false;
  }
  if (gate && localStorage.getItem('teacher-tools-ok') === '1') gate.classList.add('hidden');
  if (enter) enter.addEventListener('click', unlockIfValid);
  if (pass) pass.addEventListener('keydown', e => { if (e.key === 'Enter') unlockIfValid(); });

  // Nav highlighting
  document.querySelectorAll('.nav a').forEach(a => {
    const hash = location.hash || '#publish';
    if (a.getAttribute('href') === hash) a.classList.add('active');
    a.addEventListener('click', () => {
      document.querySelectorAll('.nav a').forEach(n => n.classList.remove('active'));
      a.classList.add('active');
    });
  });

  // Destination segmented control
  const seg = document.getElementById('dest-seg');
  const uploadLink = document.getElementById('openUpload');
  function getDestKey(){
    const active = seg ? seg.querySelector('label.active input') : null;
    return active ? active.value : 'la';
  }
  function destToUpload(key){
    switch(key){
      case 'la':  return 'https://github.com/danreinisch/reinisch-classroom/upload/main/site/language-arts/modules';
      case 'ls':  return 'https://github.com/danreinisch/reinisch-classroom/upload/main/site/life-skills/modules';
      case 'mt':  return 'https://github.com/danreinisch/reinisch-classroom/upload/main/site/math-toolkit/modules';
      case 'lat': return 'https://github.com/danreinisch/reinisch-classroom/upload/main/site/language-arts-toolkit/modules';
      default:    return 'https://github.com/danreinisch/reinisch-classroom/upload/main/site/language-arts/modules';
    }
  }
  function applyDest(){ if (uploadLink) uploadLink.href = destToUpload(getDestKey()); }
  if (seg){
    seg.querySelectorAll('label').forEach(lab => {
      lab.addEventListener('click', () => {
        seg.querySelectorAll('label').forEach(x => x.classList.remove('active'));
        lab.classList.add('active');
        applyDest();
      });
    });
    applyDest();
  }

  // card.json helper
  const titleEl = document.getElementById('title');
  const descEl  = document.getElementById('desc');
  const cardOut = document.getElementById('cardOut');
  const makeCard = document.getElementById('makeCard');
  const copyCard = document.getElementById('copyCard');
  const downloadCard = document.getElementById('downloadCard');
  function buildCard() {
    const obj = { title: (titleEl.value || '').trim() };
    if ((descEl.value || '').trim()) obj.description = descEl.value.trim();
    obj.thumbnail = 'thumbnail.png';
    return JSON.stringify(obj, null, 2);
  }
  function refreshCard(){
    const txt = buildCard();
    if (cardOut) cardOut.textContent = txt;
    if (downloadCard) {
      const blob = new Blob([txt], { type: 'application/json' });
      downloadCard.href = URL.createObjectURL(blob);
    }
  }
  if (makeCard) makeCard.addEventListener('click', refreshCard);
  if (copyCard) copyCard.addEventListener('click', () => {
    navigator.clipboard.writeText(cardOut.textContent).then(()=>alert('card.json copied'));
  });
  refreshCard();

  // Drag-and-drop listing (upload still happens on GitHub)
  const drop = document.getElementById('drop');
  const filelist = document.getElementById('filelist');
  if (drop){
    ['dragenter','dragover','dragleave','drop'].forEach(evt => {
      drop.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
    });
    drop.addEventListener('dragover', () => drop.classList.add('drag'));
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      drop.classList.remove('drag');
      const files = Array.from(e.dataTransfer.files || []);
      if (filelist) filelist.innerHTML = files.map(f => `<li>${f.webkitRelativePath || f.name}</li>`).join('');
    });
  }

  // Stats: fetch counts from all indexes
  const stats = {
    la:  { el: document.getElementById('stat-la'),  path: '/language-arts/modules.json' },
    ls:  { el: document.getElementById('stat-ls'),  path: '/life-skills/modules.json' },
    mt:  { el: document.getElementById('stat-mt'),  path: '/site/math-toolkit/modules.json' },
    lat: { el: document.getElementById('stat-lat'), path: '/site/language-arts-toolkit/modules.json' },
  };
  async function loadCount(path){
    try{
      const res = await fetch(path + '?' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return 0;
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.modules || []);
      return items.length || 0;
    } catch { return 0; }
  }
  (async function refreshStats(){
    for (const key of Object.keys(stats)){
      const n = await loadCount(stats[key].path);
      const el = stats[key].el;
      if (el) el.textContent = String(n);
    }
  })();
})();