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

    // Add return parameter to each link
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    
    links.forEach(link => {
      const currentHref = link.getAttribute('href');
      if (currentHref && !currentHref.includes('return=')) {
        const separator = currentHref.includes('?') ? '&' : '?';
        link.setAttribute('href', currentHref + separator + 'return=' + returnUrl);
      }
    });

    console.log('[toolkit-nav] Added return parameters to', links.length, 'links');
  }
})();
