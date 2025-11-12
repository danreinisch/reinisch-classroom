/**
 * Student Portal Global Error Handler
 * Captures and displays uncaught errors to users
 * Part of Guardrails Stage 3B - externalized from inline script
 */

(function() {
  'use strict';
  
  const urlParams = new URLSearchParams(window.location.search);
  const DEBUG_MODE = urlParams.get('debug') === '1';
  
  // Track first error to avoid spamming
  let firstError = null;
  
  // C) Helper: showFatalBanner(message, type='error')
  // Creates or updates #portalFatalBanner with accessible, dismissible banner
  // This is a temporary hotfix - reuses existing .portal-banner styles
  function showFatalBanner(message, type = 'error') {
    let banner = document.getElementById('portalFatalBanner');
    
    if (!banner) {
      // Create banner element if it doesn't exist
      banner = document.createElement('div');
      banner.id = 'portalFatalBanner';
      banner.className = 'portal-banner';
      banner.setAttribute('role', 'alert');
      banner.setAttribute('aria-live', 'assertive');
      banner.setAttribute('aria-atomic', 'true');
      
      banner.innerHTML = `
        <div class="portal-banner-icon" id="portalFatalBannerIcon"></div>
        <div class="portal-banner-content">
          <div class="portal-banner-title" id="portalFatalBannerTitle">Portal Error</div>
          <div class="portal-banner-message" id="portalFatalBannerMessage"></div>
        </div>
        <button id="portalFatalBannerDismiss" class="portal-banner-dismiss" aria-label="Dismiss error notification">×</button>
      `;
      
      document.body.insertBefore(banner, document.body.firstChild);
      
      // Setup dismiss handler
      const dismissBtn = document.getElementById('portalFatalBannerDismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          banner.classList.add('hidden');
        });
      }
    }
    
    // Update banner content
    const icon = document.getElementById('portalFatalBannerIcon');
    const messageEl = document.getElementById('portalFatalBannerMessage');
    
    // Set icon based on type
    const icons = {
      error: '⚠️',
      warning: '⚠️',
      info: 'ℹ️'
    };
    
    if (icon) icon.textContent = icons[type] || icons.error;
    if (messageEl) messageEl.textContent = message;
    
    // Set type class
    banner.className = 'portal-banner ' + type;
    
    if (DEBUG_MODE) {
      console.log('[HOTFIX][showFatalBanner] Showing', type, 'banner:', message);
    }
  }
  
  // Expose to global scope for use in other scripts
  window.showFatalBanner = showFatalBanner;
  
  // B) Global error handlers: Show user-friendly banner on uncaught errors
  
  // Handler for synchronous errors
  window.onerror = function(message, source, lineno, colno, error) {
    console.error('[HOTFIX][global-error] Uncaught error:', { message, source, lineno, colno, error });
    
    if (!firstError) {
      firstError = { message, source, lineno, error };
      
      // Show banner with user-friendly message
      const errorMsg = DEBUG_MODE && message ? 
        'Student Portal failed to load fully. Error: ' + message :
        'Student Portal failed to load fully. Please try again or contact your teacher.';
      
      // Use a safe setTimeout to avoid blocking the error handler
      setTimeout(() => {
        showFatalBanner(errorMsg, 'error');
      }, 100);
    }
    
    // Return false to allow default error handling to continue
    return false;
  };
  
  // Handler for unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    console.error('[HOTFIX][unhandled-rejection]', event.reason);
    
    if (!firstError) {
      firstError = { message: event.reason?.message || String(event.reason), type: 'rejection' };
      
      // Show banner with user-friendly message
      const errorMsg = DEBUG_MODE && event.reason?.message ? 
        'Student Portal failed to load fully. Error: ' + event.reason.message :
        'Student Portal failed to load fully. Please try again or contact your teacher.';
      
      setTimeout(() => {
        showFatalBanner(errorMsg, 'error');
      }, 100);
    }
  });
  
  if (DEBUG_MODE) {
    console.log('[HOTFIX][global-error] Global error handlers installed');
  }
})();
