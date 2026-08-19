(function () {
  'use strict';

  const REGISTRY_URL = '/assets/data/collection-featured-media.json';

  function requestedCollectionId() {
    try {
      return String(new URLSearchParams(window.location.search).get('collection') || '').trim();
    } catch {
      return '';
    }
  }

  function mediaIcon() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"></rect><polygon points="10 8 16 12 10 16 10 8"></polygon><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
  }

  function createCard(item) {
    const card = document.createElement('a');
    card.className = 'card featured-media-card';
    card.href = item.url;
    card.setAttribute('data-featured-media-id', item.id || item.url);
    card.setAttribute('aria-label', `Open ${item.title}`);
    card.style.borderColor = 'rgba(53,224,138,.42)';
    card.style.boxShadow = '0 0 0 1px rgba(53,224,138,.10), 0 16px 34px rgba(0,0,0,.20)';

    const icon = document.createElement('div');
    icon.className = 'card-icon';
    icon.innerHTML = mediaIcon();

    const content = document.createElement('div');
    content.style.minWidth = '0';

    if (item.eyebrow) {
      const eyebrow = document.createElement('div');
      eyebrow.textContent = item.eyebrow;
      eyebrow.style.cssText = 'font-size:.72rem;font-weight:800;letter-spacing:.13em;color:#35e08a;margin-bottom:4px;';
      content.appendChild(eyebrow);
    }

    const title = document.createElement('div');
    title.className = 't';
    title.textContent = item.title || item.id || 'Featured Media';
    content.appendChild(title);

    if (item.description) {
      const description = document.createElement('div');
      description.textContent = item.description;
      description.style.cssText = 'margin-top:5px;font-size:.86rem;opacity:.72;line-height:1.35;';
      content.appendChild(description);
    }

    card.appendChild(icon);
    card.appendChild(content);
    return card;
  }

  function installFeaturedCards(grid, items) {
    if (!grid || !Array.isArray(items) || !items.length) return;

    function ensureCards() {
      items
        .slice()
        .reverse()
        .forEach((item) => {
          const id = item.id || item.url;
          if (!id) return;

          const existing = Array.from(grid.querySelectorAll('[data-featured-media-id]'))
            .find((node) => node.getAttribute('data-featured-media-id') === id);

          if (!existing) grid.prepend(createCard(item));
        });
    }

    const observer = new MutationObserver(() => ensureCards());
    observer.observe(grid, { childList: true });

    ensureCards();

    window.setTimeout(() => {
      ensureCards();
      observer.disconnect();
    }, 5000);
  }

  async function init() {
    const collectionId = requestedCollectionId();
    const grid = document.getElementById('grid');

    if (!collectionId || !grid) return;

    try {
      const response = await fetch(`${REGISTRY_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;

      const data = await response.json();
      const items = data && data.collections && data.collections[collectionId];

      installFeaturedCards(grid, items);
    } catch (_) {
      // Featured media is additive. The ordinary collection grid must remain usable
      // even if this registry cannot be loaded.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
