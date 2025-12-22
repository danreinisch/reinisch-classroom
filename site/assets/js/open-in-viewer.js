/**
 * Open in Viewer - Shared Helper Module
 * Provides canonical viewer URL building and navigation helpers
 * Ensures consistent viewer launches across all sections
 */

(function (global) {
  'use strict';

  /**
   * Build canonical viewer URL
   * @param {string} srcPath - Relative same-origin path (must start with '/')
   * @param {object} opts - Optional parameters
   * @param {string} opts.return - Return URL (defaults to current page path+query)
   * @param {string} opts.title - Optional title parameter
   * @returns {string} Canonical viewer URL or empty string if invalid
   */
  function buildViewerUrl(srcPath, opts) {
    opts = opts || {};

    // Validate srcPath is a relative same-origin path
    if (!srcPath || typeof srcPath !== 'string') {
      console.error('[open-in-viewer] srcPath must be a non-empty string');
      return '';
    }

    if (!srcPath.startsWith('/')) {
      console.error('[open-in-viewer] srcPath must be a relative path starting with "/"');
      return '';
    }

    // Build query parameters
    const params = new URLSearchParams();
    
    // Add src (encoded)
    params.set('src', srcPath);
    
    // Add return parameter
    const returnUrl = opts.return || (window.location.pathname + window.location.search);
    params.set('return', returnUrl);
    
    // Add optional title
    if (opts.title && typeof opts.title === 'string') {
      params.set('title', opts.title);
    }

    // Build final URL
    const viewerUrl = '/viewer/?' + params.toString();
    
    return viewerUrl;
  }

  /**
   * Open content in viewer
   * @param {string} srcPath - Relative same-origin path (must start with '/')
   * @param {object} opts - Optional parameters (same as buildViewerUrl)
   */
  function openInViewer(srcPath, opts) {
    const viewerUrl = buildViewerUrl(srcPath, opts);
    
    if (!viewerUrl) {
      console.error('[open-in-viewer] Failed to build viewer URL');
      return;
    }

    console.log('[open-in-viewer] Navigating to:', viewerUrl);
    window.location.href = viewerUrl;
  }

  // Export to global scope
  global.buildViewerUrl = buildViewerUrl;
  global.openInViewer = openInViewer;

  // Also support module exports if available
  /* eslint-disable no-undef */
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { buildViewerUrl, openInViewer };
  }
  /* eslint-enable no-undef */
})(typeof window !== 'undefined' ? window : this);
