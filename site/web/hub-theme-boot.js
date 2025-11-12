/**
 * Hub Theme Boot Script
 * Sets up glass-bold theme on page load
 * Part of Guardrails Stage 3B - externalized from inline script
 */

(function() {
  const THEME_KEY = 'rc_glass_theme';
  const currentTheme = localStorage.getItem(THEME_KEY);
  
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
  }
  
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
})();
