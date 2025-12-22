/**
 * Hub Theme Boot Script
 * Ensures Emerald theme is applied and manages initialization gate
 * Part of Guardrails Stage 3B - externalized from inline script
 * TC-3A: Added init gate to prevent phantom page flashing
 */

(function() {
  // TC-3A: Add init gate to prevent phantom/flash on load
  let initGateComplete = false;
  const initChecks = {
    themeApplied: false,
    authChecked: false,
    flagsLoaded: false
  };
  
  // Apply theme - Emerald is the only theme now
  function applyTheme() {
    if (!document.body) {
      console.warn('[Theme Boot] Body not ready, waiting for DOMContentLoaded');
      return;
    }
    
    // Hub always uses Emerald theme
    // Remove any legacy glass-bold class that may exist
    document.body.classList.remove('glass-bold');
    
    // Clean up any legacy localStorage keys
    localStorage.removeItem('rc_glass_theme');
    
    // Emerald theme relies on CSS from stylesheets
    // No body class needed - Emerald theme applies via data-theme="emerald" on <html>
    
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
      
      // Apply styles
      gate.style.position = 'fixed';
      gate.style.inset = '0';
      gate.style.background = 'rgba(11,18,32,0.98)';
      gate.style.display = 'flex';
      gate.style.alignItems = 'center';
      gate.style.justifyContent = 'center';
      gate.style.zIndex = '9999';
      
      // Create content
      const content = document.createElement('div');
      content.style.textAlign = 'center';
      content.style.color = '#e6edf3';
      
      const icon = document.createElement('div');
      icon.style.fontSize = '24px';
      icon.style.marginBottom = '16px';
      icon.textContent = '⏳';
      
      const title = document.createElement('div');
      title.style.fontSize = '16px';
      title.style.fontWeight = '700';
      title.textContent = 'Loading Classroom Hub...';
      
      const subtitle = document.createElement('div');
      subtitle.style.fontSize = '13px';
      subtitle.style.color = '#94a3b8';
      subtitle.style.marginTop = '8px';
      subtitle.textContent = 'Initializing...';
      
      content.appendChild(icon);
      content.appendChild(title);
      content.appendChild(subtitle);
      gate.appendChild(content);
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
