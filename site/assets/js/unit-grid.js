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
  async function loadState(){ 
    // Try root path first (/assets/data/site-state.json)
    try{ 
      const r = await getJSON('/assets/data/site-state.json');
      return r;
    } catch(rootErr) {
      return { categories:{} }; 
    }
  }

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

  function requestedCollectionId(){
    try {
      const value = new URLSearchParams(window.location.search).get('collection');
      return value ? String(value).trim() : '';
    } catch {
      return '';
    }
  }

  function isGenericCollectionRoute(){
    const clean = location.pathname
      .replace(/index\.html$/, '')
      .replace(/\/+$/, '/') || '/';

    return clean === '/language-arts/collection/';
  }

  function resolveUnitId(units){
    const requestedId = requestedCollectionId();

    if (requestedId && isGenericCollectionRoute()) {
      const requestedCollection = units.find(function(unit){
        return unit &&
          unit.id === requestedId &&
          unit.section === 'language-arts' &&
          unit.id !== 'toolkit' &&
          (unit.status || 'active') === 'active';
      });

      return requestedCollection ? requestedCollection.id : '';
    }

    const inferredId = inferUnitId(units, location.pathname);
    const inferredUnit = units.find(function(unit){
      return unit &&
        unit.id === inferredId &&
        (unit.status || 'active') === 'active';
    });

    return inferredUnit ? inferredUnit.id : '';
  }

  function applyGenericCollectionLabels(unit){
    if (!isGenericCollectionRoute() || !unit) return;

    const title = unit.title || 'Curriculum Collection';
    const titleEl = qs('[data-collection-title]');
    const descriptionEl = qs('[data-collection-description]');
    const app = qs('.tc-app');

    if (titleEl) titleEl.textContent = title;

    if (descriptionEl) {
      descriptionEl.textContent =
        unit.description || 'Explore presentations and activities';
    }

    if (app) app.setAttribute('data-page-title', title);

    document.title = title + ' – Reinisch Classroom';
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

    // Defensive: Pre-check slots that have titles but no links (in parallel)
    const checkPromises = [];
    const checksNeeded = [];
    if (DEFENSIVE_SLOT_CHECK && unit.baseOut) {
      for (let i=1;i<=slots;i++){
        const t = (titles[i-1] || '').trim();
        const l = (links[i-1]  || '').trim();
        if (t && !l) {
          const slotPath = `/${unit.baseOut}/presentation-${String(i).padStart(2, '0')}/`;
          checksNeeded.push({ index: i-1, path: slotPath });
          checkPromises.push(checkSlotExists(slotPath));
        }
      }
    }
    
    // Wait for all checks to complete
    if (checkPromises.length > 0) {
      const results = await Promise.all(checkPromises);
      results.forEach((exists, idx) => {
        if (exists) {
          links[checksNeeded[idx].index] = checksNeeded[idx].path;
        }
      });
    }

    const frag = document.createDocumentFragment();
    for (let i=1;i<=slots;i++){
      const t = (titles[i-1] || '').trim();
      const l = (links[i-1]  || '').trim();

      // Skip slots with no title — these are truly empty/placeholder
      if (!t) continue;

      const title = t;

      let card;
      if (l){
        card = document.createElement('a');
        // Use shared viewer helper to build canonical URL (fallback href)
        if (typeof window.buildViewerUrl === 'function') {
          card.href = window.buildViewerUrl(l, { title: title });
        } else {
          // Fallback if helper not loaded
          const returnUrl = encodeURIComponent(location.pathname + location.search);
          card.href = '/viewer/?src=' + encodeURIComponent(l) + '&return=' + returnUrl;
        }
        // Prefer inline overlay when available
        const _l = l, _title = title;
        card.addEventListener('click', function (e) {
          if (typeof window.openInlineViewer === 'function') {
            e.preventDefault();
            window.openInlineViewer(_l, { title: _title });
          }
        });
        card.className = 'card';
        card.setAttribute('aria-label', `Open ${title}`);
        card.addEventListener('click', function() {
          card.classList.remove('glow');
          void card.offsetWidth;
          card.classList.add('glow');
          setTimeout(function() { card.classList.remove('glow'); }, 600);
        });
      } else {
        card = document.createElement('div');
        card.className = 'card disabled';
        card.setAttribute('aria-disabled', 'true');
      }

      const iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
      const ic = document.createElement('div'); ic.className = 'card-icon'; ic.innerHTML = iconSvg;
      const tt = document.createElement('div'); tt.className = 't'; tt.textContent = title;
      card.appendChild(ic); card.appendChild(tt);
      frag.appendChild(card);
    }
    root.innerHTML = '';
    root.appendChild(frag);
  }

  // Optional debug overlay: add ?debugState=1 to URL to see state info
  function showDebugOverlay(unit, state) {
    const cat = state && state.categories && state.categories[unit.id] || null;
    if (!cat) return;
    
    const titles = cat.titles || [];
    const links = cat.links || [];
    const maxShow = 10; // Show first 10 slots
    
    let html = `<div style="position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.9);color:#fff;padding:15px;border-radius:8px;max-width:400px;font-size:12px;font-family:monospace;z-index:10000;max-height:80vh;overflow:auto;">`;
    html += `<div style="font-weight:bold;margin-bottom:10px;color:#90c4ff;">Debug: ${unit.title} State</div>`;
    html += `<div style="margin-bottom:5px;color:#fbbf24;">Showing first ${Math.min(maxShow, titles.length)} of ${titles.length} slots</div>`;
    
    for (let i = 0; i < Math.min(maxShow, titles.length); i++) {
      const title = (titles[i] || '').trim() || '(empty)';
      const link = (links[i] || '').trim() || '(empty)';
      const slotNum = String(i + 1).padStart(2, '0');
      html += `<div style="margin:8px 0;padding:8px;background:rgba(255,255,255,0.05);border-radius:4px;">`;
      html += `<div style="color:#90c4ff;">Slot ${slotNum}</div>`;
      html += `<div style="color:#a5b4fc;margin-top:3px;">Title: ${title.length > 50 ? title.slice(0, 50) + '...' : title}</div>`;
      html += `<div style="color:#86efac;margin-top:3px;">Link: ${link}</div>`;
      html += `</div>`;
    }
    
    html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.2);color:#9ca3af;font-size:10px;">Last updated: ${state.updated || 'unknown'}</div>`;
    html += `</div>`;
    
    document.body.insertAdjacentHTML('beforeend', html);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const grid = qs('#grid');
    if (!grid) return;

    const unitsData = await loadUnits();
    const units = Array.isArray(unitsData.units) ? unitsData.units : [];

    const unitId = resolveUnitId(units);
    const unit = units.find(u => u.id === unitId);
    if (!unit) return;

    applyGenericCollectionLabels(unit);

    const state = await loadState();
    await buildGrid(grid, unit, state);
    
    // Show debug overlay if ?debugState=1 in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debugState') === '1') {
      showDebugOverlay(unit, state);
    }
  });
})();
