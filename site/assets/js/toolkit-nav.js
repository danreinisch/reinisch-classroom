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
    const links = document.querySelectorAll('.grid a.card');
    
    if (links.length === 0) {
      return;
    }

    // Add return parameter to each link using shared helper
    links.forEach(link => {
      const currentHref = link.getAttribute('href');
      if (!currentHref) return;

      // If a card links directly to a presentation folder/file, upgrade it into the viewer
      if (currentHref.startsWith('/presentations/')) {
        const title = link.querySelector('strong')?.textContent || '';
        const returnUrl = encodeURIComponent(location.pathname + location.search);

        // Prefer shared helper if present
        if (typeof window.buildViewerUrl === 'function') {
          link.setAttribute('href', window.buildViewerUrl(currentHref, { title }));
        } else {
          const src = encodeURIComponent(currentHref);
          const t = encodeURIComponent(title);
          link.setAttribute('href', `/viewer/?src=${src}&title=${t}&return=${returnUrl}`);
        }

        // Intercept click for inline overlay
        const _src = currentHref, _title = title;
        link.addEventListener('click', function (e) {
          if (typeof window.openInlineViewer === 'function') {
            e.preventDefault();
            window.openInlineViewer(_src, { title: _title });
          }
        });
        return;
      }

      if (currentHref && !currentHref.includes('return=')) {
        let presPath = null;
        try {
          // Extract src from current href
          const url = new URL(currentHref, window.location.origin);
          const src = url.searchParams.get('src');
          presPath = src || null;
          
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

        // Intercept click for inline overlay
        if (presPath) {
          const _src = presPath;
          const _title = link.querySelector('strong')?.textContent || '';
          link.addEventListener('click', function (e) {
            if (typeof window.openInlineViewer === 'function') {
              e.preventDefault();
              window.openInlineViewer(_src, { title: _title });
            }
          });
        }
      }
    });

    console.log('[toolkit-nav] Updated viewer links using shared helper for', links.length, 'links');
  }
})();
