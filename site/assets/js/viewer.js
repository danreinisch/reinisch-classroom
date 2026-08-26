/**
 * Viewer JavaScript - Dedicated viewer for presentations and modules
 * Provides UI controls for navigation, presentation mode, and fullscreen
 */

(function () {
  'use strict';

  // Elements
  const iframe = document.getElementById('contentIframe');
  const closeBtn = document.getElementById('closeBtn');
  const exitActivityBtn = document.getElementById('exitActivityBtn');
  const presentationModeBtn = document.getElementById('presentationModeBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const viewerFrame = document.getElementById('viewerFrame');
  const viewerTitle = document.getElementById('viewerTitle');
  const clockEl = document.getElementById('viewerClock');

  // State
  let presentationMode = false;
  let returnUrl = null;
  let clockInterval = null;

  /**
   * Toggle sidebar collapsed state
   */
  function toggleSidebar() {
    // Teacher-shell sidebar toggle
    const isCollapsed = document.documentElement.classList.contains('tc-collapsed');
    document.documentElement.classList.toggle('tc-collapsed', !isCollapsed);
    
    // Update toggle button aria-expanded
    const btn = document.getElementById('sidebarToggleBtn');
    if (btn) btn.setAttribute('aria-expanded', String(isCollapsed));
    
    // Legacy: also check for old app-shell-rail if it exists
    const rail = document.querySelector('.app-shell-rail');
    const lessonsNav = document.querySelector('.lessons-navigator');
    
    // Always close lessons navigator first
    if (lessonsNav) lessonsNav.classList.remove('open');
    
    // Toggle the main sidebar (legacy)
    if (rail) {
      rail.classList.toggle('open');
      console.log('[viewer] Sidebar', rail.classList.contains('open') ? 'opened' : 'closed');
    } else {
      console.log('[viewer] Sidebar', isCollapsed ? 'expanded' : 'collapsed');
    }
  }

  /**
   * Initialize the viewer
   */
  function init() {
    // Get src and return from query parameters
    const params = new URLSearchParams(window.location.search);
    let src = params.get('src');
    returnUrl = params.get('return');

    // Activities and Word Search get a large touch-friendly exit.
    // Word Search receives it even when opened from the teacher/toolkit
    // route so classroom displays are never trapped in the activity.
    const isActivity =
      params.get('activity') === '1';

    const isWordSearch =
      src &&
      src.startsWith(
        '/presentations/language-arts-toolkit/presentation-03/'
      );

    if (exitActivityBtn) {
      exitActivityBtn.hidden =
        !(isActivity || isWordSearch);
    }

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

    // Display title (from URL param)
    if (viewerTitle) {
      viewerTitle.textContent = (params.get('title') || '').trim();
    }

    // Start with collapsed sidebar for viewer
    document.documentElement.classList.add('tc-collapsed');

    // Setup event handlers
    setupEventHandlers();

    // Clock
    updateClock();
    clockInterval = setInterval(updateClock, 1000);

    // Auto-enter presentation mode if requested via URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'presentation') {
      togglePresentationMode();
    }

    console.log('[viewer] Initialized with src:', src, 'return:', returnUrl);

    // Dispatch rc-nav-ready so deferred scripts (class-clock.js, class-mode.js) initialize
    // promptly. Use setTimeout(0) so their DOMContentLoaded handlers run first and set up
    // their rc-nav-ready listeners before this event fires.
    setTimeout(function () {
      document.dispatchEvent(new CustomEvent('rc-nav-ready'));
    }, 0);
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
    // Sidebar toggle button
    if (sidebarToggleBtn) {
      sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }

    // Close button
    closeBtn.addEventListener('click', handleClose);

    // Large touch-friendly activity exit control
    if (exitActivityBtn) {
      exitActivityBtn.addEventListener('click', handleClose);
    }

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

    // Close sidebar when clicking inside iframe (icon-only mode only)
    // When user clicks inside iframe, it gains focus triggering focusin event.
    // We use focusin because clicks inside an iframe don't bubble up to the parent.
    // Note: This also triggers on keyboard navigation (Tab) into iframe, which is
    // acceptable UX as the user is clearly interacting with the iframe content.
    iframe.addEventListener('focusin', () => {
      // Only process if in icon-only mode (desktop with overlay behavior)
      if (!document.body.classList.contains('app-shell-icon-only')) {
        return;
      }
      
      // Query rail first since we check it before accessing other elements
      const rail = document.querySelector('.app-shell-rail');
      
      // Early return if sidebar is already closed (prevents redundant operations)
      if (!rail || !rail.classList.contains('open')) {
        return;
      }
      
      // Close sidebar
      rail.classList.remove('open');
      
      // Query and close lessons navigator if present and open
      const lessonsNav = document.querySelector('.lessons-navigator');
      if (lessonsNav && lessonsNav.classList.contains('open')) {
        lessonsNav.classList.remove('open');
      }
      
      // Clear auto-close timer by removing progress bar element
      const autoCloseBar = document.querySelector('.sidebar-auto-close-bar');
      if (autoCloseBar) {
        autoCloseBar.remove();
      }
    });
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
      // Exit browser fullscreen first if active
      if (document.fullscreenElement) {
        exitFullscreen();
      }
      document.body.classList.add('presentation-mode');
      document.documentElement.classList.add('tc-collapsed');
      console.log('[viewer] Entered presentation mode');
    } else {
      document.body.classList.remove('presentation-mode');
      
      // Exit fullscreen if active
      if (document.fullscreenElement) {
        exitFullscreen();
      }
      
      console.log('[viewer] Exited presentation mode');
    }
  }

  /**
   * Update the clock display
   */
  function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
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
      console.log('[viewer] Entered fullscreen');
    } else {
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

  // Clean up clock interval on page unload
  window.addEventListener('pagehide', function () {
    if (clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  });
})();
