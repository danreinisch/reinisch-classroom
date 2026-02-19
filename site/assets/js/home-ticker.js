/**
 * home-ticker.js
 * Fetches site-state.json and units.json to build a What's New horizontal marquee ticker.
 */
(function () {
  'use strict';

  const TICKER_TRACK_ID = 'tickerTrack';
  const TICKER_SECTION_ID = 'tickerSection';
  const MAX_ITEMS = 20;

  async function loadTicker() {
    const section = document.getElementById(TICKER_SECTION_ID);
    const track = document.getElementById(TICKER_TRACK_ID);
    if (!section || !track) return;

    let siteState, unitsData;
    try {
      const [stateRes, unitsRes] = await Promise.all([
        fetch('/assets/data/site-state.json'),
        fetch('/assets/data/units.json'),
      ]);
      if (!stateRes.ok || !unitsRes.ok) throw new Error('fetch failed');
      [siteState, unitsData] = await Promise.all([stateRes.json(), unitsRes.json()]);
    } catch (_) {
      section.hidden = true;
      return;
    }

    /* Build a map from category id → unit title */
    const unitMap = {};
    if (Array.isArray(unitsData.units)) {
      for (const u of unitsData.units) {
        unitMap[u.id] = u.title;
      }
    }

    /* Collect all live presentations (non-empty title + link), sorted newest-first */
    const items = [];
    const categories = siteState.categories || {};
    for (const [catId, cat] of Object.entries(categories)) {
      const titles = cat.titles || [];
      const links = cat.links || [];
      const unitTitle = unitMap[catId] || catId;
      for (let i = titles.length - 1; i >= 0; i--) {
        const title = (titles[i] || '').trim();
        const link = (links[i] || '').trim();
        if (title && link) {
          items.push({ label: `📖 ${unitTitle} — ${title}`, href: link });
          if (items.length >= MAX_ITEMS) break;
        }
      }
      if (items.length >= MAX_ITEMS) break;
    }

    if (items.length === 0) {
      section.hidden = true;
      return;
    }

    /* Build DOM — render items twice for seamless loop */
    function buildItems() {
      return items
        .map((item, i) => {
          const sep = i < items.length - 1
            ? `<span class="home-ticker-sep" aria-hidden="true">•</span>`
            : '';
          const a = document.createElement('a');
          a.className = 'home-ticker-item';
          a.href = item.href;
          a.textContent = item.label;
          return a.outerHTML + sep;
        })
        .join('');
    }

    const half = buildItems();
    track.innerHTML = half + half;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTicker);
  } else {
    loadTicker();
  }
})();
