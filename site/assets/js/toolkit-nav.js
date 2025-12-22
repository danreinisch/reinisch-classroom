/**
 * Language Arts Toolkit Navigation
 * Adds return parameters to viewer links dynamically
 */

(function () {
  'use strict';

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Get all links in the toolkit grid
    const links = document.querySelectorAll('.grid a.card[href^="/viewer/"]');
    
    if (links.length === 0) {
      return;
    }

    // Add return parameter to each link using shared helper
    links.forEach(link => {
      const currentHref = link.getAttribute('href');
      if (currentHref && !currentHref.includes('return=')) {
        try {
          // Extract src from current href
          const url = new URL(currentHref, window.location.origin);
          const src = url.searchParams.get('src');
          
          if (src && typeof window.buildViewerUrl === 'function') {
            // Use shared helper to build canonical URL
            const title = link.querySelector('strong')?.textContent || '';
            link.setAttribute('href', window.buildViewerUrl(src, { title: title }));
          } else {
            // Fallback to manual parameter addition
            const separator = currentHref.includes('?') ? '&' : '?';
            const returnUrl = encodeURIComponent(location.pathname + location.search);
            link.setAttribute('href', currentHref + separator + 'return=' + returnUrl);
          }
        } catch (e) {
          console.warn('[toolkit-nav] Failed to parse URL:', currentHref, e);
          // Fallback to manual parameter addition for malformed URLs
          const separator = currentHref.includes('?') ? '&' : '?';
          const returnUrl = encodeURIComponent(location.pathname + location.search);
          link.setAttribute('href', currentHref + separator + 'return=' + returnUrl);
        }
      }
    });

    console.log('[toolkit-nav] Updated viewer links using shared helper for', links.length, 'links');
  }
})();
