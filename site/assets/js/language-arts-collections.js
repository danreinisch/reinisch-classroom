'use strict';

(function () {
  function collectionHref(unit) {
    const path = String((unit && unit.pagePath) || '/language-arts/').trim();

    if (path === '/language-arts/collection/') {
      return path + '?collection=' + encodeURIComponent(String(unit && unit.id || ''));
    }

    return path;
  }

  function activeLanguageArtsCollections(units) {
    return (units || [])
      .filter((unit) =>
        unit &&
        unit.section === 'language-arts' &&
        unit.id !== 'toolkit' &&
        (unit.status || 'active') === 'active'
      )
      .sort((a, b) => {
        const aOrder = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 0;
        const bOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;

        if (aOrder !== bOrder) return aOrder - bOrder;

        return String(a.title || '').localeCompare(String(b.title || ''));
      });
  }

  function bookIcon() {
    return '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>';
  }

  function renderCollectionCards(grid, collections) {
    grid.innerHTML = '';

    collections.forEach((unit) => {
      const card = document.createElement('a');
      card.className = 'book-card';
      card.href = collectionHref(unit);

      const icon = document.createElement('div');
      icon.className = 'book-icon';
      icon.innerHTML = bookIcon();

      const content = document.createElement('div');

      const title = document.createElement('strong');
      title.className = 'book-title';
      title.textContent = unit.title || unit.id;
      content.appendChild(title);

      if (unit.description) {
        const description = document.createElement('div');
        description.style.cssText = 'margin-top:4px;font-size:.9rem;opacity:.72;';
        description.textContent = unit.description;
        content.appendChild(description);
      }

      card.appendChild(icon);
      card.appendChild(content);
      grid.appendChild(card);
    });
  }

  async function init() {
    const grid = document.querySelector('.book-grid');
    if (!grid) return;

    try {
      const response = await fetch('/assets/data/units.json?t=' + Date.now(), {
        cache: 'no-store'
      });

      if (!response.ok) return;

      const data = await response.json();
      const collections = activeLanguageArtsCollections(
        Array.isArray(data.units) ? data.units : []
      );

      if (collections.length) {
        renderCollectionCards(grid, collections);
      }
    } catch (_) {
      // Preserve the static legacy cards as a no-network fallback.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
