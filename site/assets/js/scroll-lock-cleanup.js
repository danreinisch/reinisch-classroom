/**
 * Scroll-Lock Cleanup Utility
 * PR 310: Shared utility to ensure scrolling works after modal/viewer interactions
 * 
 * Provides defensive cleanup of scroll-lock state that may be applied by modals,
 * overlays, or other UI components. Ensures body and containers remain scrollable.
 */

(function() {
  'use strict';
  
  /**
   * Remove any scroll-lock classes and styles that prevent scrolling
   * This is a defensive cleanup function - safe to call even if no locks exist
   */
  function cleanupScrollLock() {
    try {
      // Remove common scroll-lock classes
      document.body.classList.remove('modal-open', 'no-scroll', 'scroll-lock', 'viewer-open');
      
      // Ensure body overflow is not hidden
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
      }
      
      // Ensure html overflow is not hidden  
      if (document.documentElement.style.overflow === 'hidden') {
        document.documentElement.style.overflow = '';
      }
      
      // Ensure position is not fixed (some scroll-lock techniques use this)
      if (document.body.style.position === 'fixed') {
        document.body.style.position = '';
      }
      
      console.debug('[scroll-lock-cleanup] Cleanup completed');
      return true;
    } catch (err) {
      console.error('[scroll-lock-cleanup] Cleanup failed:', err);
      return false;
    }
  }
  
  /**
   * Schedule cleanup using requestAnimationFrame for deterministic timing
   * This ensures cleanup runs after the browser has processed pending DOM changes
   */
  function scheduleCleanup() {
    requestAnimationFrame(() => {
      // Double-RAF pattern for more reliable execution after DOM updates
      requestAnimationFrame(() => {
        cleanupScrollLock();
      });
    });
  }
  
  /**
   * Initialize cleanup listeners for common events
   */
  function initGlobalCleanupListeners() {
    // Cleanup after successful teacher login
    window.addEventListener('teacher:login-success', scheduleCleanup);
    
    // Cleanup when viewer closes
    window.addEventListener('viewer:closed', scheduleCleanup);
    
    // Cleanup when modals close
    window.addEventListener('modal:closed', scheduleCleanup);
    
    console.debug('[scroll-lock-cleanup] Global listeners initialized');
  }
  
  // Public API
  window.ScrollLockCleanup = {
    cleanup: cleanupScrollLock,
    schedule: scheduleCleanup,
    init: initGlobalCleanupListeners
  };
  
  // Auto-initialize global listeners when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobalCleanupListeners);
  } else {
    initGlobalCleanupListeners();
  }
  
  console.debug('[scroll-lock-cleanup] Utility loaded');
})();
