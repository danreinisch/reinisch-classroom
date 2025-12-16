/**
 * Admin Login Error Handler
 * Displays error messages from URL query parameters
 * Part of Guardrails Stage 3B - externalized from inline script
 */

(function() {
  'use strict';
  
  try {
    // Display error message if error code is present in URL
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('e');
    
    if (errorCode) {
      const errorContainer = document.getElementById('errorContainer');
      if (!errorContainer) {
        return; // Defensive: exit if container doesn't exist
      }
      
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.setAttribute('data-error-code', errorCode);
      
      // User-friendly generic message
      const messageDiv = document.createElement('div');
      messageDiv.textContent = 'Login failed. Please try again.';
      
      const supportDiv = document.createElement('div');
      supportDiv.className = 'support-text';
      supportDiv.textContent = 'If the problem persists, contact support.';
      
      errorDiv.appendChild(messageDiv);
      errorDiv.appendChild(supportDiv);
      
      errorContainer.appendChild(errorDiv);
    }
  } catch (err) {
    // Defensive: suppress errors to prevent blocking page load
    if (console && console.error) {
      console.error('[admin-login.js] Error displaying error message:', err);
    }
  }
})();
