/**
 * Hub Theme Boot Script
 * Sets up glass-bold theme on page load and manages initialization gate
 * Part of Guardrails Stage 3B - externalized from inline script
 * TC-3A: Added init gate to prevent phantom page flashing
 */

(function() {
  const THEME_KEY = 'rc_glass_theme';
  const currentTheme = localStorage.getItem(THEME_KEY);
  
  // TC-3A: Add init gate to prevent phantom/flash on load
  let initGateComplete = false;
  const initChecks = {
    themeApplied: false,
    authChecked: false,
    flagsLoaded: false
  };
  
  // Default to glass-bold on first visit
  function applyTheme() {
    if (!document.body) {
      console.warn('[Theme Boot] Body not ready, waiting for DOMContentLoaded');
      return;
    }
    
    if (!currentTheme) {
      localStorage.setItem(THEME_KEY, 'glass-bold');
      document.body.classList.add('glass-bold');
    } else if (currentTheme === 'glass-bold') {
      document.body.classList.add('glass-bold');
    }
    
    initChecks.themeApplied = true;
    checkInitGate();
  }
  
  // TC-3A: Check if all init requirements are met
  function checkInitGate() {
    if (initGateComplete) return;
    
    // All checks must pass to complete init gate
    if (initChecks.themeApplied && initChecks.authChecked && initChecks.flagsLoaded) {
      initGateComplete = true;
      
      // Remove loading indicator if present
      const loadingIndicator = document.getElementById('hub-loading-gate');
      if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
      }
      
      // Dispatch event to signal init complete
      window.dispatchEvent(new CustomEvent('hub:init-gate-complete'));
      console.log('[Hub Init Gate] All checks complete, gate lifted');
    }
  }
  
  // TC-3A: Mark auth check as complete
  // This should be called by the auth check code
  window.markAuthCheckComplete = function() {
    initChecks.authChecked = true;
    checkInitGate();
  };
  
  // TC-3A: Mark feature flags as loaded
  // This should be called when feature flags are ready
  window.markFlagsLoaded = function() {
    initChecks.flagsLoaded = true;
    checkInitGate();
  };
  
  // Apply immediately if body exists, otherwise wait
  if (document.body) {
    applyTheme();
  } else {
    document.addEventListener('DOMContentLoaded', applyTheme);
  }
  
  // Setup event listeners for static HTML elements
  // This needs to run after DOM is ready
  function setupStaticEventListeners() {
    // Critical asset banner dismiss button
    const dismissBtn = document.getElementById('dismissCriticalAssetBanner');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function() {
        const banner = this.closest('#criticalAssetBanner');
        if (banner) {
          banner.style.display = 'none';
        }
      });
    }
  }
  
  // Run setup when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupStaticEventListeners);
  } else {
    setupStaticEventListeners();
  }
  
  // TC-3A: Show init gate (loading indicator) immediately
  // This should be called as early as possible in page load
  function showInitGate() {
    // Try to find or create loading gate element
    let gate = document.getElementById('hub-loading-gate');
    if (!gate && document.body) {
      gate = document.createElement('div');
      gate.id = 'hub-loading-gate';
      gate.style.cssText = 'position:fixed;inset:0;background:rgba(11,18,32,0.98);display:flex;align-items:center;justify-content:center;z-index:9999;';
      gate.innerHTML = '<div style="text-align:center;color:#e6edf3;"><div style="font-size:24px;margin-bottom:16px;">⏳</div><div style="font-size:16px;font-weight:700;">Loading Classroom Hub...</div><div style="font-size:13px;color:#94a3b8;margin-top:8px;">Initializing...</div></div>';
      document.body.appendChild(gate);
    }
  }
  
  // Show gate when DOM is interactive or loaded
  if (document.readyState !== 'loading') {
    showInitGate();
  } else {
    document.addEventListener('DOMContentLoaded', showInitGate);
  }
})();
