/**
 * Hub Defensive Wiring Script (PR2)
 * Ensures UI elements update correctly even if scripts load out of order
 * Part of Guardrails Stage 3B - externalized from inline script
 */

(function() {
  'use strict';
  
  // Timing constants for defensive DOM operations
  // Small delay ensures DOM elements are ready when accessed via event handlers
  const DOM_READY_DELAY_MS = 50;  // Quick check for immediate DOM access
  const INITIAL_STATUS_DELAY_MS = 200;  // Longer delay for initial page load status update
  
  console.debug('[Hub Settings - PR2] Defensive wiring script loaded');
  
  // Safe querySelector helper with null checking
  const safeQs = (selector) => {
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  };
  
  // Safe property setter - only sets if element exists
  const safeProp = (element, prop, value) => {
    if (element && element[prop] !== undefined) {
      element[prop] = value;
      return true;
    }
    return false;
  };
  
  // Safe style setter
  const safeStyle = (element, prop, value) => {
    if (element && element.style) {
      element.style[prop] = value;
      return true;
    }
    return false;
  };
  
  // Defensive updater for config status chip
  // This is the main function that ensures chips update on auto-enable
  function defensiveUpdateConfigStatus() {
    try {
      const configStatus = safeQs('#configStatus');
      
      if (!configStatus) {
        console.debug('[Hub Settings - PR2] Config status element not ready yet');
        return;
      }
      
      // Check if the main updateConfigStatus function is available
      if (typeof window.updateConfigStatus === 'function') {
        window.updateConfigStatus();
        console.debug('[Hub Settings - PR2] Config status updated via main function');
      } else if (typeof window.supabaseSettings !== 'undefined' && window.supabaseSettings.readConfig) {
        // Fallback: manually update the chip if main function not available yet
        const config = window.supabaseSettings.readConfig();
        
        if (config.url && config.anon && config.enabled) {
          safeProp(configStatus, 'textContent', 'Enabled');
          safeStyle(configStatus, 'background', 'linear-gradient(180deg, rgba(34,197,94,.8), rgba(22,163,74,.8))');
          safeStyle(configStatus, 'color', '#fff');
          safeProp(configStatus, 'title', 'Supabase is enabled');
          console.debug('[Hub Settings - PR2] Config status updated via fallback (Enabled)');
        } else if (config.url && config.anon && !config.enabled) {
          safeProp(configStatus, 'textContent', 'Disabled');
          safeStyle(configStatus, 'background', 'rgba(255,255,255,.18)');
          safeStyle(configStatus, 'color', 'var(--muted)');
          safeProp(configStatus, 'title', 'Supabase is configured but disabled');
          console.debug('[Hub Settings - PR2] Config status updated via fallback (Disabled)');
        } else if (config.url || config.anon) {
          safeProp(configStatus, 'textContent', 'Partially Configured');
          safeStyle(configStatus, 'background', 'rgba(251,191,36,.3)');
          safeStyle(configStatus, 'color', 'var(--ink)');
          safeProp(configStatus, 'title', 'Missing URL or anon key');
          console.debug('[Hub Settings - PR2] Config status updated via fallback (Partial)');
        } else {
          safeProp(configStatus, 'textContent', 'Not Configured');
          safeStyle(configStatus, 'background', 'rgba(255,255,255,.18)');
          safeStyle(configStatus, 'color', 'var(--muted)');
          safeProp(configStatus, 'title', 'No Supabase configuration');
          console.debug('[Hub Settings - PR2] Config status updated via fallback (Not Configured)');
        }
      }
    } catch (err) {
      // Silently fail - defensive approach
      console.debug('[Hub Settings - PR2] Could not update config status:', err.message);
    }
  }
  
  // Defensive updater for connectivity details timestamp
  function updateConnectivityTimestamp() {
    try {
      const timestampDiv = safeQs('#connectivityTimestamp');
      if (timestampDiv) {
        const now = new Date();
        timestampDiv.textContent = `Last checked: ${now.toLocaleString()}`;
      }
    } catch (err) {
      console.debug('[Hub Settings - PR2] Could not update connectivity timestamp:', err.message);
    }
  }
  
  // Enhanced "Try again" button - ensures timestamp updates
  function setupRetryConnectionWiring() {
    try {
      const btnRetry = safeQs('#btnRetryConnection');
      if (!btnRetry) {
        console.debug('[Hub Settings - PR2] Retry button not found yet');
        return;
      }
      
      // Check if our handler is already attached
      if (btnRetry.dataset.pr2Wired === 'true') {
        return; // Already wired up
      }
      
      btnRetry.dataset.pr2Wired = 'true';
      console.debug('[Hub Settings - PR2] Retry button wired up');
      
      // Add additional handler to ensure timestamp updates
      btnRetry.addEventListener('click', function pr2RetryHandler() {
        try {
          // Update timestamp immediately when clicked
          updateConnectivityTimestamp();
        } catch (err) {
          console.debug('[Hub Settings - PR2] Retry handler error:', err.message);
        }
      }, { capture: false });
      
    } catch (err) {
      console.debug('[Hub Settings - PR2] Could not setup retry connection:', err.message);
    }
  }
  
  // Wire up chips to update immediately on config changes
  // This is the KEY function that ensures auto-enable updates chips immediately
  function setupConfigChangeListener() {
    try {
      console.debug('[Hub Settings - PR2] Setting up config change listener');
      
      // Set up event listener EARLY - before the main async module loads
      // This ensures we catch the auto-enable event when it's dispatched
      window.addEventListener('rc:remote-config-changed', function pr2ConfigHandler(e) {
        try {
          const detail = e.detail || {};
          
          console.debug('[Hub Settings - PR2] Config changed event received:', detail);
          
          // Update config status chips after brief delay to ensure DOM is ready
          // DOM_READY_DELAY_MS ensures elements exist when accessed via event
          setTimeout(() => {
            defensiveUpdateConfigStatus();
          }, DOM_READY_DELAY_MS);
          
          // Update timestamp if this was triggered by save or test
          if (detail.saved || detail.tested) {
            setTimeout(() => {
              updateConnectivityTimestamp();
            }, DOM_READY_DELAY_MS);
          }
        } catch (err) {
          console.debug('[Hub Settings - PR2] Config change handler error:', err.message);
        }
      }, { capture: false });
      
      console.debug('[Hub Settings - PR2] Config change listener attached');
    } catch (err) {
      console.debug('[Hub Settings - PR2] Could not setup config change listener:', err.message);
    }
  }
  
  // Initialize wiring
  function initWiring() {
    try {
      console.debug('[Hub Settings - PR2] Initializing wiring...');
      
      // Setup config change listener immediately (runs before async module loads)
      setupConfigChangeListener();
      
      // Setup retry button and initial status when DOM is ready
      const setupUI = () => {
        try {
          console.debug('[Hub Settings - PR2] Setting up UI elements');
          setupRetryConnectionWiring();
          
          // Initial config status update after page load
          // INITIAL_STATUS_DELAY_MS ensures all async modules have loaded
          setTimeout(() => {
            defensiveUpdateConfigStatus();
          }, INITIAL_STATUS_DELAY_MS);
        } catch (err) {
          console.debug('[Hub Settings - PR2] UI setup error:', err.message);
        }
      };
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupUI);
      } else {
        // DOM already loaded - setup immediately
        setupUI();
      }
      
      console.debug('[Hub Settings - PR2] Wiring initialization complete');
    } catch (err) {
      console.debug('[Hub Settings - PR2] Wiring initialization failed:', err.message);
    }
  }
  
  // Run initialization immediately
  initWiring();
  
  // Expose updater globally for debugging/testing
  window.defensiveUpdateConfigStatus = defensiveUpdateConfigStatus;
  
})();
