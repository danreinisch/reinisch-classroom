/**
 * Math Toolkit Module Loader
 * Loads and displays modules from modules.json
 * CSP-compliant external script
 */

(function() {
  'use strict';
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  function init() {
    const listEl = document.getElementById('modules');
    const emptyEl = document.getElementById('empty');
    const searchEl = document.getElementById('search');
    
    if (!listEl || !emptyEl || !searchEl) {
      console.warn('[math-toolkit] Required elements not found');
      return;
    }
    
    let allModules = [];

    function cardTemplate(m) {
      const thumb = m.thumbnail ? `<img class="thumb" src="${m.thumbnail}" alt="" loading="lazy" decoding="async">` : '';
      const desc = m.description ? `${m.description}` : 'Module';
      
      // Use shared viewer helper to build canonical URL
      let viewerURL;
      if (typeof window.buildViewerUrl === 'function') {
        viewerURL = window.buildViewerUrl(m.url, { title: m.title || m.description });
      } else {
        // Fallback if helper not loaded
        const returnUrl = encodeURIComponent(location.pathname + location.search);
        viewerURL = `/viewer/?src=${encodeURIComponent(m.url)}&return=${returnUrl}`;
      }
      
      return `
        <a class="card-link" href="${viewerURL}" role="listitem" aria-label="Open module">
          <article class="card">
            ${thumb}
            <div class="desc">${desc}</div>
          </article>
        </a>
      `;
    }

    function render(items) {
      listEl.innerHTML = items.map(cardTemplate).join('');
      listEl.hidden = items.length === 0;
      emptyEl.hidden = items.length !== 0;
    }

    function filter(query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) return allModules;
      return allModules.filter(m =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q)
      );
    }

    async function load() {
      try {
        const res = await fetch('./modules.json?' + Date.now(), { cache: 'no-store' });
        if (!res.ok) throw new Error('modules.json not found');
        const data = await res.json();
        allModules = Array.isArray(data) ? data : (data.modules || []);
        render(allModules);
      } catch (e) {
        console.warn('[math-toolkit] Failed to load modules.json', e);
        allModules = [];
        render(allModules);
      }
    }

    searchEl.addEventListener('input', () => render(filter(searchEl.value)));
    load();
  }
})();
