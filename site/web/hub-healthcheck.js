/**
 * Hub Healthcheck and Module Loading Diagnostics
 * Monitors module loading status and displays diagnostic information
 * Part of Guardrails Stage 3B - externalized from inline script
 */

  'use strict';
  
  // Guard against duplicate initialization
  if (window.__hubNavBound) {
    console.debug('[Hub Nav] Already initialized, skipping');
    return;
  }
  window.__hubNavBound = true;
  
  console.debug('[Hub Nav] Enhancement script loaded');
  
  // Safe querySelector helper
  const safeQs = (selector) => {
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  };
  
  const safeQsAll = (selector) => {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  };
  
  // ============================================================================
  // LIVE DATE/TIME DISPLAY
  // ============================================================================
  function initClock() {
    const clockEl = safeQs('#datetimeDisplay');
    if (!clockEl) {
      console.debug('[Hub Nav] Clock element not found');
      return;
    }
    
    function updateClock() {
      try {
        const now = new Date();
        // Format: "Fri, Nov 8 • 6:52:01 PM"
        const options = {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        };
        const formatted = now.toLocaleString(undefined, options);
        // Add bullet separator between date and time
        const parts = formatted.split(', ');
        if (parts.length >= 3) {
          // Format is typically "Fri, Nov 8, 6:52:01 PM"
          clockEl.textContent = `${parts[0]}, ${parts[1]} • ${parts.slice(2).join(', ')}`;
        } else {
          clockEl.textContent = formatted;
        }
      } catch (err) {
        console.error('[Hub Nav] Clock update error:', err);
      }
    }
    
    // Update immediately
    updateClock();
    
    // Update every second
    setInterval(updateClock, 1000);
    
    console.debug('[Hub Nav] Clock initialized');
  }
  
  // ============================================================================
  // REMOVE DUPLICATE SUBSTITUTE ENTRIES
  // ============================================================================
  function removeDuplicateSubstitute() {
    try {
      // Find the sign-in modal
      const signInModal = safeQs('#signInModal');
      if (!signInModal) {
        console.debug('[Hub Nav] Sign-in modal not found');
        return;
      }
      
      // Find all buttons in the modal that contain "Substitute" text
      const allButtons = Array.from(signInModal.querySelectorAll('button'));
      const substituteButtons = allButtons.filter(btn => {
        const text = btn.textContent || '';
        return text.includes('Substitute');
      });
      
      if (substituteButtons.length > 1) {
        console.warn('[Hub Nav] Found ' + substituteButtons.length + ' Substitute entries, removing duplicates');
        // Keep the first, remove the rest
        for (let i = 1; i < substituteButtons.length; i++) {
          substituteButtons[i].remove();
        }
      }
    } catch (err) {
      console.error('[Hub Nav] Failed to remove duplicate Substitute:', err);
    }
  }
  
  // ============================================================================
  // PREVIOUS/NEXT/EXIT NAVIGATION
  // ============================================================================
  function initNavigation() {
    const prevBtn = safeQs('#navPrev');
    const nextBtn = safeQs('#navNext');
    const exitBtn = safeQs('#navExit');
    
    if (!prevBtn || !nextBtn || !exitBtn) {
      console.debug('[Hub Nav] Navigation buttons not found');
      return;
    }
    
    // Get current submenu tabs
    function getSubmenuTabs() {
      return safeQsAll('#submenu a[data-tab]');
    }
    
    // Get currently active tab
    function getActiveTab() {
      const tabs = getSubmenuTabs();
      return tabs.find(tab => tab.classList.contains('active')) || tabs[0];
    }
    
    // Update localStorage for tab persistence
    function saveCurrentTab(tabName) {
      try {
        const currentArea = localStorage.getItem('rc_last_area') || 'overview';
        if (tabName && currentArea) {
          localStorage.setItem('rc_last_tab_' + currentArea, tabName);
        }
      } catch (err) {
        console.debug('[Hub Nav] Could not save tab:', err);
      }
    }
    
    // Previous button handler
    prevBtn.addEventListener('click', function() {
      try {
        const tabs = getSubmenuTabs();
        if (tabs.length === 0) return;
        
        const activeTab = getActiveTab();
        const currentIndex = tabs.indexOf(activeTab);
        
        // Wrap to end if at beginning
        const prevIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
        const prevTab = tabs[prevIndex];
        
        if (prevTab) {
          prevTab.click();
          const tabName = prevTab.getAttribute('data-tab');
          saveCurrentTab(tabName);
        }
      } catch (err) {
        console.error('[Hub Nav] Previous button error:', err);
      }
    });
    
    // Next button handler
    nextBtn.addEventListener('click', function() {
      try {
        const tabs = getSubmenuTabs();
        if (tabs.length === 0) return;
        
        const activeTab = getActiveTab();
        const currentIndex = tabs.indexOf(activeTab);
        
        // Wrap to beginning if at end
        const nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
        const nextTab = tabs[nextIndex];
        
        if (nextTab) {
          nextTab.click();
          const tabName = nextTab.getAttribute('data-tab');
          saveCurrentTab(tabName);
        }
      } catch (err) {
        console.error('[Hub Nav] Next button error:', err);
      }
    });
    
    // Exit button handler
    exitBtn.addEventListener('click', function() {
      try {
        // Try to open role-switch modal first
        const roleSwitchModal = safeQs('#roleSwitchModal');
        if (roleSwitchModal) {
          roleSwitchModal.classList.add('show');
        } else {
          // Fallback: open sign-in modal
          const signInModal = safeQs('#signInModal');
          if (signInModal) {
            signInModal.classList.add('show');
          }
        }
      } catch (err) {
        console.error('[Hub Nav] Exit button error:', err);
      }
    });
    
    console.debug('[Hub Nav] Navigation buttons initialized');
  }
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  function init() {
    try {
      console.debug('[Hub Nav] Initializing...');
      
      initClock();
      initNavigation();
      
      // Remove duplicate Substitute after a delay to allow auth-modal-extend.js to run
      // The delay ensures the dynamically added Substitute button is present before removal
      // Alternative approaches (MutationObserver) would add complexity for minimal benefit
      setTimeout(removeDuplicateSubstitute, 500);
      
      console.debug('[Hub Nav] Initialization complete');
    } catch (err) {
      console.error('[Hub Nav] Initialization failed:', err);
    }
  }
  
  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
