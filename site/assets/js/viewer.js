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
    // Get params from query string
    const params = new URLSearchParams(window.location.search);
    let src = params.get('src');
    const returnParam = params.get('return');

    if (!src) {
      showError('No content source provided', 'Please provide a src parameter in the URL.');
      return;
    }

    // Support directory URLs ending with / by appending index.html
    if (src.endsWith('/')) {
      src = src + 'index.html';
    }

    // Store return parameter if provided
    if (returnParam) {
      referrer = returnParam;
    } else if (document.referrer) {
      // Fallback to document.referrer
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

    // Load content in iframe
    loadContent(src);

    // Setup event handlers
    setupEventHandlers();

    console.log('[viewer] Initialized with src:', src, 'return:', referrer);
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
    // Close algorithm:
    // 1) If return param exists and is safe same-origin, navigate there
    // 2) else if history back is same-origin, history.back()
    // 3) else infer fallback based on src prefix

    if (referrer) {
      // Return parameter or referrer provided - validate it's safe
      try {
        const returnUrl = new URL(referrer, window.location.origin);
        if (returnUrl.origin === window.location.origin) {
          window.location.href = referrer;
          return;
        }
      } catch (e) {
        console.warn('[viewer] Invalid return URL:', referrer);
      }
    }

    // Try history.back() if available and we can detect same-origin
    if (window.history.length > 1 && document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        if (referrerUrl.origin === window.location.origin) {
          window.history.back();
          return;
        }
      } catch (e) {
        console.warn('[viewer] Could not use history.back:', e);
      }
    }

    // Infer fallback based on src prefix
    const params = new URLSearchParams(window.location.search);
    const src = params.get('src') || '';

    if (src.startsWith('/life-skills/')) {
      window.location.href = '/life-skills/';
    } else if (src.startsWith('/language-arts/toolkit/')) {
      window.location.href = '/language-arts/toolkit/';
    } else if (src.startsWith('/math-toolkit/')) {
      window.location.href = '/math-toolkit/';
    } else if (src.startsWith('/language-arts/')) {
      // Could be a unit page - try to extract unit
      const unitMatch = src.match(/^\/language-arts\/([^\/]+)\//);
      if (unitMatch && unitMatch[1] && !['toolkit', 'assignment-hub'].includes(unitMatch[1])) {
        window.location.href = `/language-arts/${unitMatch[1]}/`;
      } else {
        window.location.href = '/language-arts/';
      }
    } else {
      // Default fallback to home
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
        // Show user-friendly message - fullscreen typically requires user gesture
        if (err.name === 'NotAllowedError') {
          console.info('[viewer] Fullscreen requires a user interaction (button click)');
        }
      });
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    } else {
      console.warn('[viewer] Fullscreen API not supported in this browser');
    }
  }

  /**
   * Exit fullscreen mode
   */
  function exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch((err) => {
        console.warn('[viewer] Could not exit fullscreen:', err);
      });
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
    // Only handle shortcuts if the active element is not inside the iframe
    // This prevents conflicts with content inside the iframe
    const activeElement = document.activeElement;
    if (activeElement && activeElement.tagName === 'IFRAME') {
      return;
    }

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

    // Alt+F: toggle fullscreen (avoid conflicts with browser shortcuts)
    if ((e.key === 'f' || e.key === 'F') && e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleFullscreen();
    }

    // Alt+P: toggle presentation mode (avoid conflicts with browser shortcuts)
    if ((e.key === 'p' || e.key === 'P') && e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      togglePresentationMode();
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
