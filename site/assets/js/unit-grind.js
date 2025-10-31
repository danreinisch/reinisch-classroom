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
    // Match by pagePath in units.json
    for (const u of units){
      const pp = String(u.pagePath||'').replace(/\/+$/,'/') || '/';
      if (pp && clean === pp) return u.id;
    }
    // Fallback: try contains (handles trailing segments)
    for (const u of units){
      const pp = String(u.pagePath||'').replace(/\/+$/,'/');
      if (pp && clean.startsWith(pp)) return u.id;
    }
    return '';
  }

  function buildGrid(root, unit, state){
    const cat = state && state.categories && state.categories[unit.id] || null;
    const slots = Number((cat && cat.slots) || unit.slots || 0);
    const titles = (cat && Array.isArray(cat.titles) ? cat.titles.slice() : []);
    const links  = (cat && Array.isArray(cat.links ) ? cat.links.slice()  : []);
    ensureArraySize(titles, slots);
    ensureArraySize(links,  slots);

    const frag = document.createDocumentFragment();
    for (let i=1;i<=slots;i++){
      const t = (titles[i-1] || '').trim();
      const l = (links[i-1]  || '').trim();
      const title = t || `Presentation ${i}`;
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

    const meta = window.UNIT_PAGE || {};
    let unitId = String(meta.id || '');

    const unitsData = await loadUnits();
    const units = Array.isArray(unitsData.units) ? unitsData.units : [];

    if (!unitId) {
      unitId = inferUnitId(units, location.pathname);
    }
    const unit = units.find(u => u.id === unitId);
    if (!unit) return;

    // Update header if page puts placeholders
    const hdr = qs('h1'); if (hdr && !hdr.textContent.trim()) hdr.textContent = unit.title;

    const state = await loadState();
    buildGrid(grid, unit, state);
  });
})();
