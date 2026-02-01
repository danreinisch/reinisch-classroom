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
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const viewerFrame = document.getElementById('viewerFrame');

  // State
  let presentationMode = false;
  let returnUrl = null;
  let sidebarCollapsed = false;

  // LocalStorage key for sidebar state
  const SIDEBAR_STATE_KEY = 'viewer-sidebar-collapsed';

  /**
   * Initialize the viewer
   */
  function init() {
    // Get src and return from query parameters
    const params = new URLSearchParams(window.location.search);
    let src = params.get('src');
    returnUrl = params.get('return');

    if (!src) {
      showError('No content source provided', 'Please provide a src parameter in the URL.');
      return;
    }

    // Normalize directory paths: append index.html if src ends with /
    if (src.endsWith('/')) {
      src = src + 'index.html';
    }

    // Load content in iframe
    loadContent(src);

    // Setup event handlers
    setupEventHandlers();

    // Restore sidebar state from localStorage (default: expanded)
    restoreSidebarState();

    console.log('[viewer] Initialized with src:', src, 'return:', returnUrl);
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

    // Sidebar toggle button
    if (sidebarToggleBtn) {
      sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Fullscreen change events
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
  }

  /**
   * Handle close button with 3-tier fallback:
   * 1) Use return parameter if provided and safe
   * 2) Use history.back if referrer is same-origin
   * 3) Infer fallback from src prefix
   */
  function handleClose() {
    // Tier 1: Try return parameter first
    if (returnUrl) {
      const safeReturnUrl = sanitizeUrl(returnUrl);
      if (safeReturnUrl) {
        console.log('[viewer] Navigating to return URL:', safeReturnUrl);
        window.location.href = safeReturnUrl;
        return;
      }
    }

    // Tier 2: Try same-origin referrer with history.back
    if (document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        const currentUrl = new URL(window.location.href);
        if (referrerUrl.origin === currentUrl.origin) {
          console.log('[viewer] Using history.back to same-origin referrer');
          window.history.back();
          return;
        }
      } catch (e) {
        console.warn('[viewer] Could not parse referrer:', e);
      }
    }

    // Tier 3: Infer fallback from src prefix
    const params = new URLSearchParams(window.location.search);
    const src = params.get('src') || '';
    
    let fallbackUrl = '/';
    if (src.startsWith('/life-skills/')) {
      fallbackUrl = '/life-skills/';
    } else if (src.startsWith('/language-arts/toolkit/')) {
      fallbackUrl = '/language-arts/toolkit/';
    } else if (src.startsWith('/math-toolkit/')) {
      fallbackUrl = '/math-toolkit/';
    } else if (src.startsWith('/language-arts/')) {
      fallbackUrl = '/language-arts/';
    }

    console.log('[viewer] Using inferred fallback:', fallbackUrl);
    window.location.href = fallbackUrl;
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
   * Enter fullscreen mode on the viewer container
   */
  function enterFullscreen() {
    const elem = viewerFrame || document.documentElement;
    
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

  /**
   * Toggle sidebar collapsed/expanded state
   */
  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    applySidebarState();
    saveSidebarState();
    console.log('[viewer] Sidebar toggled:', sidebarCollapsed ? 'collapsed' : 'expanded');
  }

  /**
   * Apply the sidebar state to the DOM
   */
  function applySidebarState() {
    const rail = document.querySelector('.app-shell-rail');
    const body = document.body;
    
    if (sidebarCollapsed) {
      if (rail) {
        rail.classList.add('viewer-collapsed');
      }
      body.classList.add('viewer-sidebar-collapsed');
    } else {
      if (rail) {
        rail.classList.remove('viewer-collapsed');
      }
      body.classList.remove('viewer-sidebar-collapsed');
    }
  }

  /**
   * Save sidebar state to localStorage
   */
  function saveSidebarState() {
    try {
      localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(sidebarCollapsed));
    } catch (e) {
      console.warn('[viewer] Could not save sidebar state:', e);
    }
  }

  /**
   * Restore sidebar state from localStorage
   * Default state is expanded (collapsed = false)
   */
  function restoreSidebarState() {
    try {
      const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
      // Default to expanded (false) if no saved state
      sidebarCollapsed = saved !== null ? JSON.parse(saved) : false;
      applySidebarState();
      console.log('[viewer] Restored sidebar state:', sidebarCollapsed ? 'collapsed' : 'expanded');
    } catch (e) {
      console.warn('[viewer] Could not restore sidebar state:', e);
      sidebarCollapsed = false; // Default to expanded
      applySidebarState();
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
