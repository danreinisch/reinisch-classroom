(function(){
  'use strict';

  function qs(sel, root){ return (root||document).querySelector(sel); }
  function num(n){ return String(n).padStart(2,'0'); }
  function ensureArraySize(arr, n){ while(arr.length < n) arr.push(''); }

  async function getJSON(url){
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache:'no-store' });
    if (!r.ok) throw new Error('Fetch failed ' + r.status);
    return r.json();
  }

  async function loadUnits(){ try{ return await getJSON('/assets/data/units.json'); } catch{ return { units: [] }; } }
  async function loadState(){ try{ return await getJSON('/assets/data/site-state.json'); } catch{ return { categories:{} }; } }

  function inferUnitId(units, pathname){
    const clean = pathname.replace(/index\.html$/,'').replace(/\/+$/,'/') || '/';
    for (const u of units){
      const pp = String(u.pagePath||'').replace(/\/+$/,'/') || '/';
      if (pp && clean === pp) return u.id;
    }
    for (const u of units){
      const pp = String(u.pagePath||'').replace(/\/+$/,'/');
      if (pp && clean.startsWith(pp)) return u.id;
    }
    return '';
  }

  // Config: Enable defensive slot checking (check if presentation exists even when link missing)
  const DEFENSIVE_SLOT_CHECK = true;

  async function checkSlotExists(path) {
    try {
      const res = await fetch(path, { method: 'HEAD', cache: 'no-store' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function buildGrid(root, unit, state){
    const cat = state && state.categories && state.categories[unit.id] || null;
    const slots = Number((cat && cat.slots) || unit.slots || 0);
    const titles = (cat && Array.isArray(cat.titles) ? cat.titles.slice() : []);
    const links  = (cat && Array.isArray(cat.links ) ? cat.links.slice()  : []);
    ensureArraySize(titles, slots);
    ensureArraySize(links,  slots);

    const frag = document.createDocumentFragment();
    for (let i=1;i<=slots;i++){
      const t = (titles[i-1] || '').trim();
      let l = (links[i-1]  || '').trim();
      const title = t || `Presentation ${i}`;
      
      // Defensive: If we have a title but no link, check if the slot path exists
      if (DEFENSIVE_SLOT_CHECK && t && !l && unit.baseOut) {
        const slotPath = `/${unit.baseOut}/presentation-${String(i).padStart(2, '0')}/`;
        const exists = await checkSlotExists(slotPath);
        if (exists) {
          l = slotPath; // Treat as live if path exists
        }
      }
      
      const sub   = l ? 'Open presentation' : 'Placeholder';

      let card;
      if (l){
        card = document.createElement('a');
        card.href = l;
        card.className = 'card';
        card.setAttribute('aria-label', `Open ${title}`);
      } else {
        card = document.createElement('div');
        card.className = 'card disabled';
        card.setAttribute('aria-disabled', 'true');
      }

      const tt = document.createElement('div'); tt.className = 't'; tt.textContent = title;
      const ss = document.createElement('div'); ss.className = 's'; ss.textContent = sub;
      card.appendChild(tt); card.appendChild(ss);
      frag.appendChild(card);
    }
    root.innerHTML = '';
    root.appendChild(frag);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const grid = qs('#grid');
    if (!grid) return;

    const unitsData = await loadUnits();
    const units = Array.isArray(unitsData.units) ? unitsData.units : [];

    const unitId = inferUnitId(units, location.pathname);
    const unit = units.find(u => u.id === unitId);
    if (!unit) return;

    const state = await loadState();
    await buildGrid(grid, unit, state);
  });
})();
