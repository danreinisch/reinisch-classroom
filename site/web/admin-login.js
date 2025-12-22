/**
 * Admin Login Error Display and Redirect Handling
 * Displays error messages from query parameters and handles return URL after login
 * CSP-compliant external script
 */

(function() {
  'use strict';
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  function init() {
    displayError();
    setupFormHandler();
  }
  
  function displayError() {
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
      console.error('Error displaying admin login error message:', err);
    }
  }
  
  function setupFormHandler() {
    const form = document.querySelector('form');
    if (!form) return;
    
    // Intercept form submission to handle return URL
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(form);
      const submitButton = form.querySelector('button[type="submit"]');
      
      // Disable button during submission
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Signing in...';
      }
      
      try {
        const response = await fetch('/.netlify/functions/admin-session', {
          method: 'POST',
          body: formData,
          credentials: 'same-origin'
        });
        
        if (response.ok) {
          // Success - redirect to return URL or /admin/
          const params = new URLSearchParams(window.location.search);
          const returnUrl = params.get('return');
          
          if (returnUrl) {
            // Validate return URL is same-origin
            try {
              const url = new URL(returnUrl, window.location.origin);
              if (url.origin === window.location.origin) {
                window.location.href = returnUrl;
                return;
              }
            } catch (e) {
              console.warn('[admin-login] Invalid return URL:', returnUrl);
            }
          }
          
          // Default redirect to /admin/
          window.location.href = '/admin/';
        } else {
          // Error - reload page with error code
          const errorCode = response.status === 401 ? 'invalid' : 'error';
          window.location.href = '/admin-login/?e=' + errorCode;
        }
      } catch (err) {
        console.error('Admin login error:', err);
        window.location.href = '/admin-login/?e=network';
      }
    });
  }
})();
