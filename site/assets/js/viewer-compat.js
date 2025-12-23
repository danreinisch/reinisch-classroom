/**
 * Viewer Compatibility Redirect
 * Handles legacy ?viewer=1 URLs and redirects to canonical /viewer/?src=... format
 * Works on any page (/, /hub/, or elsewhere) to ensure legacy links redirect properly
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
    const legacyReturn = params.get('return') || '';

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
      // Determine return URL with priority:
      // 1. Use legacy return param if provided and valid (same-origin path)
      // 2. For language-arts with unit, default to unit root (e.g., /language-arts/a-door-into-time/)
      // 3. Use /hub/ if on hub page
      // 4. Use / as fallback
      let returnUrl = '/';
      
      if (legacyReturn && legacyReturn.startsWith('/')) {
        // Use provided return parameter (already validated as same-origin path)
        returnUrl = legacyReturn;
      } else if (section === 'language-arts' && unit) {
        // Default to unit root for Language Arts units
        returnUrl = `/language-arts/${unit}/`;
      } else if (window.location.pathname.startsWith('/hub')) {
        // Default to hub if on hub page
        returnUrl = '/hub/';
      }

      // Use shared helper if available, otherwise build manually
      let viewerUrl;
      if (typeof window.buildViewerUrl === 'function') {
        viewerUrl = window.buildViewerUrl(src, { return: returnUrl });
      } else {
        // Fallback manual construction
        viewerUrl = `/viewer/?src=${encodeURIComponent(src)}&return=${encodeURIComponent(returnUrl)}`;
      }

      console.log('[viewer-compat] Redirecting to:', viewerUrl);
      
      // Use location.replace to avoid adding to history
      window.location.replace(viewerUrl);
    } else {
      console.warn('[viewer-compat] Could not determine src from legacy parameters:', { section, unit, presentation });
    }
  }
})();
