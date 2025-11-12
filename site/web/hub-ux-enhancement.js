/**
 * Hub UX Enhancement Script
 * Provides area/tab persistence, top navigation, and modal handling
 * Part of Guardrails Stage 3B - externalized from inline script
 */

(function() {
  'use strict';
  console.debug('[Hub UX] Enhancement script loaded');
  
  // ============================================================================
  // CONFIGURATION & CONSTANTS
  // ============================================================================
  const STORAGE_KEYS = {
    LAST_AREA: 'rc_last_area',
    LAST_TAB_PREFIX: 'rc_last_tab_'
  };
  
  const MODALS = ['#teachModal', '#signInModal', '#studentSignInModal', '#roleSwitchModal'];
  
  // Timing constants for UI updates
  const TAB_RESTORE_DELAY = 100;  // Brief delay to ensure submenu is rendered before restoring tab
  const STATE_RESTORE_DELAY = 500; // Delay to ensure all async scripts have loaded before restoring state
  const AUTH_CHECK_INTERVAL = 5000; // Check auth state every 5 seconds (reduced from 1s to minimize overhead)
  
  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
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
  // DEFENSIVE TEACHER CENTER BUTTON BINDING
  // ============================================================================
  function bindTeacherModal() {
    try {
      const btnTeacher = safeQs('#btnTeacher');
      if (!btnTeacher) {
        console.debug('[Hub UX] Teacher button not found, will retry on DOMContentLoaded');
        return;
      }
      
      // Check if already bound to prevent duplicate handlers
      if (btnTeacher.dataset.uxBound === 'true') {
        return;
      }
      
      btnTeacher.dataset.uxBound = 'true';
      
      // Add defensive click handler that works even if other scripts error
      btnTeacher.addEventListener('click', function uxTeacherHandler() {
        try {
          const modal = safeQs('#teachModal');
          if (modal) {
            modal.classList.add('show');
            const passInput = safeQs('#teachPass');
            if (passInput) {
              setTimeout(() => passInput.focus(), 50);
            }
          }
        } catch (err) {
          console.error('[Hub UX] Teacher modal handler error:', err);
        }
      }, { capture: false });
      
      console.debug('[Hub UX] Teacher button bound defensively');
    } catch (err) {
      console.error('[Hub UX] Failed to bind teacher button:', err);
    }
  }
  
  // ============================================================================
  // TOP NAVIGATION INITIALIZATION
  // ============================================================================
  function initTopNav() {
    try {
      const topNavButtons = safeQsAll('[data-area-nav]');
      if (topNavButtons.length === 0) {
        console.debug('[Hub UX] Top nav buttons not found');
        return;
      }
      
      // Restore last area from localStorage
      const lastArea = localStorage.getItem(STORAGE_KEYS.LAST_AREA);
      
      // Click handler for topnav buttons
      topNavButtons.forEach(btn => {
        btn.addEventListener('click', function() {
          const area = this.getAttribute('data-area-nav');
          if (!area) return;
          
          // Update active state in topnav
          topNavButtons.forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          
          // Forward click to iconrail button
          const iconRailBtn = safeQs(`.iconrail button[data-area="${area}"]`);
          if (iconRailBtn) {
            iconRailBtn.click();
          }
          
          // Save to localStorage
          localStorage.setItem(STORAGE_KEYS.LAST_AREA, area);
        });
        
        // Set initial active state
        const area = btn.getAttribute('data-area-nav');
        if (area === (lastArea || 'overview')) {
          btn.classList.add('active');
        }
      });
      
      console.debug('[Hub UX] Top nav initialized');
    } catch (err) {
      console.error('[Hub UX] Failed to init top nav:', err);
    }
  }
  
  // ============================================================================
  // AREA & TAB PERSISTENCE
  // ============================================================================
  function setupPersistence() {
    try {
      // Hook into iconrail clicks to track area changes
      const iconRail = safeQs('.iconrail');
      if (iconRail) {
        iconRail.addEventListener('click', function(e) {
          const btn = e.target.closest('button[data-area]');
          if (btn) {
            const area = btn.getAttribute('data-area');
            localStorage.setItem(STORAGE_KEYS.LAST_AREA, area);
            
            // Update topnav active state
            safeQsAll('[data-area-nav]').forEach(navBtn => {
              navBtn.classList.toggle('active', navBtn.getAttribute('data-area-nav') === area);
            });
          }
        });
      }
      
      // Hook into submenu clicks to track tab changes
      const submenu = safeQs('#submenu');
      if (submenu) {
        submenu.addEventListener('click', function(e) {
          if (e.target.tagName === 'A') {
            const tab = e.target.getAttribute('data-tab');
            const currentArea = localStorage.getItem(STORAGE_KEYS.LAST_AREA) || 'overview';
            if (tab && currentArea) {
              localStorage.setItem(STORAGE_KEYS.LAST_TAB_PREFIX + currentArea, tab);
            }
          }
        });
      }
      
      console.debug('[Hub UX] Persistence hooks installed');
    } catch (err) {
      console.error('[Hub UX] Failed to setup persistence:', err);
    }
  }
  
  function restoreLastState() {
    try {
      // Only restore if teacher view is unlocked
      const viewTeacher = safeQs('#view-teacher');
      if (!viewTeacher || viewTeacher.style.display === 'none') {
        console.debug('[Hub UX] Teacher view not unlocked, skipping restore');
        return;
      }
      
      const lastArea = localStorage.getItem(STORAGE_KEYS.LAST_AREA);
      if (!lastArea) return;
      
      // Restore area
      const iconRailBtn = safeQs(`.iconrail button[data-area="${lastArea}"]`);
      const topNavBtn = safeQs(`[data-area-nav="${lastArea}"]`);
      
      if (iconRailBtn) {
        // Update iconrail active state
        safeQsAll('.iconrail button').forEach(b => b.classList.remove('active'));
        iconRailBtn.classList.add('active');
        
        // Trigger renderSubmenu if available
        if (typeof window.renderSubmenu === 'function') {
          window.renderSubmenu(lastArea);
        }
      }
      
      if (topNavBtn) {
        safeQsAll('[data-area-nav]').forEach(b => b.classList.remove('active'));
        topNavBtn.classList.add('active');
      }
      
      // Restore last tab for this area
      setTimeout(() => {
        const lastTab = localStorage.getItem(STORAGE_KEYS.LAST_TAB_PREFIX + lastArea);
        if (lastTab) {
          const tabLink = safeQs(`#submenu a[data-tab="${lastTab}"]`);
          if (tabLink) {
            tabLink.click();
          }
        }
      }, TAB_RESTORE_DELAY);
      
      console.debug('[Hub UX] Restored last state:', lastArea);
    } catch (err) {
      console.error('[Hub UX] Failed to restore last state:', err);
    }
  }
  
  // ============================================================================
  // MODAL ENHANCEMENTS (Escape, Backdrop Click, Focus Trap)
  // ============================================================================
  function enhanceModals() {
    try {
      // Escape key handler
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          // Find the topmost visible modal
          for (let i = MODALS.length - 1; i >= 0; i--) {
            const modal = safeQs(MODALS[i]);
            if (modal && modal.classList.contains('show')) {
              modal.classList.remove('show');
              e.preventDefault();
              break;
            }
          }
        }
      });
      
      // Backdrop click handler for each modal
      MODALS.forEach(modalSelector => {
        const modal = safeQs(modalSelector);
        if (!modal) return;
        
        modal.addEventListener('click', function(e) {
          // Only close if clicking the backdrop itself, not the modal content
          if (e.target === modal) {
            modal.classList.remove('show');
          }
        });
      });
      
      console.debug('[Hub UX] Modal enhancements installed');
    } catch (err) {
      console.error('[Hub UX] Failed to enhance modals:', err);
    }
  }
  
  // ============================================================================
  // ROLE SWITCH FUNCTIONALITY
  // ============================================================================
  function initRoleSwitch() {
    try {
      const roleSwitchChip = safeQs('#roleSwitchChip');
      const roleSwitchModal = safeQs('#roleSwitchModal');
      
      if (!roleSwitchChip || !roleSwitchModal) {
        console.debug('[Hub UX] Role switch elements not found');
        return;
      }
      
      // Show/hide role switch chip based on auth state
      const updateRoleSwitchChip = () => {
        try {
          const auth = typeof window.getAuth === 'function' ? window.getAuth() : null;
          if (auth && auth.role) {
            roleSwitchChip.classList.add('visible');
          } else {
            roleSwitchChip.classList.remove('visible');
          }
        } catch (err) {
          console.debug('[Hub UX] Could not update role switch chip:', err);
        }
      };
      
      // Check periodically for auth changes (every 5s to reduce overhead)
      setInterval(updateRoleSwitchChip, AUTH_CHECK_INTERVAL);
      updateRoleSwitchChip();
      
      // Open role switch modal
      roleSwitchChip.addEventListener('click', function() {
        roleSwitchModal.classList.add('show');
      });
      
      // Cancel button
      const cancelBtn = safeQs('#roleSwitchCancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
          roleSwitchModal.classList.remove('show');
        });
      }
      
      // Role switch: Student
      const studentBtn = safeQs('#roleSwitchStudent');
      if (studentBtn) {
        studentBtn.addEventListener('click', function() {
          // Clear existing auth when switching roles
          if (typeof window.clearAuth === 'function') {
            window.clearAuth();
          }
          roleSwitchModal.classList.remove('show');
          const signInModal = safeQs('#signInModal');
          if (signInModal) {
            signInModal.classList.add('show');
          }
        });
      }
      
      // Role switch: Teacher
      const teacherBtn = safeQs('#roleSwitchTeacher');
      if (teacherBtn) {
        teacherBtn.addEventListener('click', function() {
          // Clear existing auth when switching roles
          if (typeof window.clearAuth === 'function') {
            window.clearAuth();
          }
          roleSwitchModal.classList.remove('show');
          const teachModal = safeQs('#teachModal');
          if (teachModal) {
            teachModal.classList.add('show');
            const passInput = safeQs('#teachPass');
            if (passInput) {
              setTimeout(() => passInput.focus(), 50);
            }
          }
        });
      }
      
      // Role switch: Substitute
      const subBtn = safeQs('#roleSwitchSub');
      if (subBtn) {
        subBtn.addEventListener('click', function() {
          // Clear existing auth when switching roles
          if (typeof window.clearAuth === 'function') {
            window.clearAuth();
          }
          roleSwitchModal.classList.remove('show');
          window.location.href = '/sub/';
        });
      }
      
      console.debug('[Hub UX] Role switch initialized');
    } catch (err) {
      console.error('[Hub UX] Failed to init role switch:', err);
    }
  }
  
  // ============================================================================
  // SUBSTITUTE ROLE HANDLER
  // ============================================================================
  function initSubstituteRole() {
    try {
      const signInSub = safeQs('#signInSub');
      if (!signInSub) {
        console.debug('[Hub UX] Substitute button not found');
        return;
      }
      
      signInSub.addEventListener('click', function() {
        window.location.href = '/sub/';
      });
      
      console.debug('[Hub UX] Substitute role handler initialized');
    } catch (err) {
      console.error('[Hub UX] Failed to init substitute role:', err);
    }
  }
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  function init() {
    try {
      console.debug('[Hub UX] Starting initialization...');
      
      bindTeacherModal();
      initTopNav();
      setupPersistence();
      enhanceModals();
      initRoleSwitch();
      initSubstituteRole();
      
      // Restore last state after a delay to ensure all async scripts have loaded
      setTimeout(restoreLastState, STATE_RESTORE_DELAY);
      
      console.debug('[Hub UX] Initialization complete');
    } catch (err) {
      console.error('[Hub UX] Initialization failed:', err);
    }
  }
  
  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
