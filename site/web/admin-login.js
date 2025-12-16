/**
 * Admin Login Error Display
 * Displays error messages from query parameters without using inline scripts
 * CSP-compliant external script (Stage 3B)
 */

(function() {
  'use strict';
  
  try {
    // Read error code from URL query parameter
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('e');
    
    if (errorCode) {
      const errorContainer = document.getElementById('errorContainer');
      
      if (errorContainer) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.setAttribute('data-error-code', errorCode);
        
        // User-friendly generic message
        errorDiv.innerHTML = `
          <div>Login failed. Please try again.</div>
          <div class="support-text">If the problem persists, contact support.</div>
          <!-- Error code for debugging: ${errorCode} -->
        `;
        
        errorContainer.appendChild(errorDiv);
      }
    }
  } catch (err) {
    // Fail silently to avoid breaking the page
    if (console && console.error) {
      console.error('Error displaying admin login error message:', err);
    }
  }
})();
