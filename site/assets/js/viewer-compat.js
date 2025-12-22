/**
 * Viewer Compatibility Redirect
 * Handles legacy ?viewer=1 URLs and redirects to canonical /viewer/?src=... format
 */

(function () {
  'use strict';

  // Check if we're on a legacy viewer URL
  const params = new URLSearchParams(window.location.search);
  
  if (params.get('viewer') === '1') {
    // Legacy viewer mode detected - convert to canonical format
    console.log('[viewer-compat] Legacy viewer URL detected, converting to canonical format');

    // Extract legacy parameters
    const section = params.get('section') || '';
    const unit = params.get('unit') || '';
    const presentation = params.get('presentation') || '';

    // Build the src path based on legacy parameters
    let src = '';
    if (section && unit && presentation) {
      // Full path provided
      if (section === 'language-arts') {
        src = `/language-arts/${unit}/${presentation}/`;
      } else if (section === 'life-skills') {
        src = `/life-skills/${presentation}/`;
      } else if (section === 'math-toolkit') {
        src = `/math-toolkit/${presentation}/`;
      }
    } else if (unit && presentation) {
      // Assume language-arts if only unit and presentation
      src = `/language-arts/${unit}/${presentation}/`;
    }

    if (src) {
      // Build return parameter to preserve navigation context
      const returnUrl = window.location.pathname + (window.location.search.replace(/[?&]viewer=1/, '').replace(/[?&]section=[^&]*/, '').replace(/[?&]unit=[^&]*/, '').replace(/[?&]presentation=[^&]*/, '') || '');
      const cleanReturn = returnUrl.replace(/\?$/, '').replace(/&+$/, '').replace(/\?&/, '?') || '/';

      // Build canonical viewer URL
      const viewerUrl = `/viewer/?src=${encodeURIComponent(src)}&return=${encodeURIComponent(cleanReturn)}`;

      console.log('[viewer-compat] Redirecting to:', viewerUrl);
      
      // Use location.replace to avoid adding to history
      window.location.replace(viewerUrl);
    } else {
      console.warn('[viewer-compat] Could not determine src from legacy parameters:', { section, unit, presentation });
    }
  }
})();
