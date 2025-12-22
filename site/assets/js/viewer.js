/**
 * Viewer JavaScript - Dedicated viewer for presentations and modules
 * Provides UI controls for navigation, presentation mode, and fullscreen
 */

(function () {
  'use strict';

  // Elements
  const iframe = document.getElementById('contentIframe');
  const closeBtn = document.getElementById('closeBtn');
  const presentationModeBtn = document.getElementById('presentationModeBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const viewerFrame = document.getElementById('viewerFrame');

  // State
  let presentationMode = false;
  let referrer = null;

  /**
   * Initialize the viewer
   */
  function init() {
    // Get src from query parameter
    const params = new URLSearchParams(window.location.search);
    const src = params.get('src');

    if (!src) {
      showError('No content source provided', 'Please provide a src parameter in the URL.');
      return;
    }

    // Load content in iframe
    loadContent(src);

    // Setup event handlers
    setupEventHandlers();

    // Store referrer for close button
    if (document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        const currentUrl = new URL(window.location.href);
        // Only use referrer if same origin
        if (referrerUrl.origin === currentUrl.origin) {
          referrer = document.referrer;
        }
      } catch (e) {
        console.warn('[viewer] Could not parse referrer:', e);
      }
    }

    console.log('[viewer] Initialized with src:', src);
  }

  /**
   * Load content in iframe
   */
  function loadContent(src) {
    // Show loading state
    showLoading();

    // Sanitize and validate URL
    const sanitizedSrc = sanitizeUrl(src);
    if (!sanitizedSrc) {
      showError('Invalid content source', 'The provided URL is not valid.');
      return;
    }

    iframe.src = sanitizedSrc;

    // Handle load events
    iframe.addEventListener('load', handleIframeLoad);
    iframe.addEventListener('error', handleIframeError);
  }

  /**
   * Sanitize URL to prevent XSS
   */
  function sanitizeUrl(url) {
    try {
      // Decode URL if it's encoded
      const decodedUrl = decodeURIComponent(url);
      
      // Check for dangerous protocols
      if (decodedUrl.match(/^(javascript|data|vbscript):/i)) {
        console.error('[viewer] Dangerous protocol detected:', decodedUrl);
        return null;
      }

      // If it's a relative URL, allow it
      if (decodedUrl.startsWith('/') || decodedUrl.startsWith('./') || decodedUrl.startsWith('../')) {
        return decodedUrl;
      }

      // If it's an absolute URL, validate the origin
      const urlObj = new URL(decodedUrl, window.location.origin);
      const currentOrigin = window.location.origin;

      // Only allow same-origin URLs
      if (urlObj.origin !== currentOrigin) {
        console.error('[viewer] Cross-origin URL not allowed:', urlObj.origin);
        return null;
      }

      return urlObj.href;
    } catch (e) {
      console.error('[viewer] Error sanitizing URL:', e);
      return null;
    }
  }

  /**
   * Setup event handlers
   */
  function setupEventHandlers() {
    // Close button
    closeBtn.addEventListener('click', handleClose);

    // Presentation mode button
    presentationModeBtn.addEventListener('click', togglePresentationMode);

    // Fullscreen button
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Fullscreen change events
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
  }

  /**
   * Handle close button
   */
  function handleClose() {
    // Try to go back to referrer if same-origin
    if (referrer) {
      window.location.href = referrer;
    } else {
      // Default to home page
      window.location.href = '/';
    }
  }

  /**
   * Toggle presentation mode
   */
  function togglePresentationMode() {
    presentationMode = !presentationMode;
    
    if (presentationMode) {
      document.body.classList.add('presentation-mode');
      presentationModeBtn.textContent = 'Exit Presentation';
      console.log('[viewer] Entered presentation mode');
    } else {
      document.body.classList.remove('presentation-mode');
      presentationModeBtn.textContent = 'Presentation Mode';
      
      // Exit fullscreen if active
      if (document.fullscreenElement) {
        exitFullscreen();
      }
      
      console.log('[viewer] Exited presentation mode');
    }
  }

  /**
   * Toggle fullscreen
   */
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }

  /**
   * Enter fullscreen mode
   */
  function enterFullscreen() {
    const elem = document.documentElement;
    
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err) => {
        console.warn('[viewer] Could not enter fullscreen:', err);
      });
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  }

  /**
   * Exit fullscreen mode
   */
  function exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }

  /**
   * Handle fullscreen change
   */
  function handleFullscreenChange() {
    if (document.fullscreenElement) {
      fullscreenBtn.textContent = 'Exit Fullscreen';
      console.log('[viewer] Entered fullscreen');
    } else {
      fullscreenBtn.textContent = 'Full Screen';
      console.log('[viewer] Exited fullscreen');
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  function handleKeyboard(e) {
    // Escape key: exit presentation mode or fullscreen
    if (e.key === 'Escape') {
      if (document.fullscreenElement) {
        // Fullscreen API will handle escape
        return;
      }
      if (presentationMode) {
        togglePresentationMode();
      }
    }

    // F key: toggle fullscreen
    if (e.key === 'f' || e.key === 'F') {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleFullscreen();
      }
    }

    // P key: toggle presentation mode
    if (e.key === 'p' || e.key === 'P') {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        togglePresentationMode();
      }
    }
  }

  /**
   * Handle iframe load
   */
  function handleIframeLoad() {
    hideLoading();
    console.log('[viewer] Content loaded successfully');
  }

  /**
   * Handle iframe error
   */
  function handleIframeError() {
    showError('Failed to load content', 'The content could not be loaded. Please try again.');
  }

  /**
   * Show loading state
   */
  function showLoading() {
    const loading = document.createElement('div');
    loading.className = 'viewer-loading';
    loading.id = 'viewerLoading';
    loading.textContent = 'Loading...';
    viewerFrame.appendChild(loading);
  }

  /**
   * Hide loading state
   */
  function hideLoading() {
    const loading = document.getElementById('viewerLoading');
    if (loading) {
      loading.remove();
    }
  }

  /**
   * Show error state
   */
  function showError(title, message) {
    hideLoading();

    const error = document.createElement('div');
    error.className = 'viewer-error';
    error.innerHTML = `
      <div class="viewer-error-title">${escapeHtml(title)}</div>
      <div class="viewer-error-message">${escapeHtml(message)}</div>
    `;
    viewerFrame.appendChild(error);
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
