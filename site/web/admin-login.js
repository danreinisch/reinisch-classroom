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
    checkAdminSetup();
    displayError();
    setupFormHandler();
  }
  
  async function checkAdminSetup() {
    try {
      // Check if admin is configured by calling admin-session-check
      const response = await fetch('/.netlify/functions/admin-session-check', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      
      // If we get a 503 or ADMIN_NOT_CONFIGURED response, show setup message
      if (response.status === 503) {
        const data = await response.json().catch(() => ({}));
        if (data.code === 'ADMIN_NOT_CONFIGURED') {
          displaySetupMessage();
        }
      }
    } catch (err) {
      // Fail silently - user can still try to login
      console.error('Error checking admin setup:', err);
    }
  }
  
  function displaySetupMessage() {
    const errorContainer = document.getElementById('errorContainer');
    if (!errorContainer) return;
    
    const setupDiv = document.createElement('div');
    setupDiv.className = 'error-message';
    setupDiv.style.background = 'rgba(255, 193, 7, 0.15)';
    setupDiv.style.borderColor = 'rgba(255, 193, 7, 0.4)';
    setupDiv.style.color = '#ffc107';
    
    setupDiv.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 8px;">⚠️ Admin Setup Required</div>
      <div style="font-size: 13px;">The admin interface is not configured. Required environment variable is missing:</div>
      <ul style="margin: 8px 0; padding-left: 20px; font-size: 12px;">
        <li><code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 3px;">ADMIN_SESSION_SECRET</code></li>
      </ul>
      <div class="support-text" style="font-size: 12px; margin-top: 8px;">
        Configure this in <strong>Netlify → Site settings → Environment variables</strong>. 
        <a href="/admin-not-configured/" style="color: #35e08a; text-decoration: underline;">View detailed setup instructions</a>
      </div>
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <a href="/hub/" style="display: inline-block; padding: 6px 12px; background: rgba(53, 224, 138, 0.15); border: 1px solid rgba(53, 224, 138, 0.3); border-radius: 6px; color: #35e08a; text-decoration: none; font-size: 12px; font-weight: 600;">Go to Teacher Center</a>
        <a href="/teacher/" style="display: inline-block; padding: 6px 12px; background: rgba(53, 224, 138, 0.15); border: 1px solid rgba(53, 224, 138, 0.3); border-radius: 6px; color: #35e08a; text-decoration: none; font-size: 12px; font-weight: 600;">Go to Teacher Hub</a>
        <a href="/" style="display: inline-block; padding: 6px 12px; background: rgba(53, 224, 138, 0.15); border: 1px solid rgba(53, 224, 138, 0.3); border-radius: 6px; color: #35e08a; text-decoration: none; font-size: 12px; font-weight: 600;">Go to Home</a>
      </div>
    `;
    
    errorContainer.appendChild(setupDiv);
    
    // Disable the form since login won't work without configuration
    const form = document.querySelector('form');
    if (form) {
      const inputs = form.querySelectorAll('input, button');
      inputs.forEach(input => input.disabled = true);
    }
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
          
          // Special handling for configuration error
          if (errorCode === 'cfg') {
            errorDiv.style.background = 'rgba(255, 193, 7, 0.15)';
            errorDiv.style.borderColor = 'rgba(255, 193, 7, 0.4)';
            errorDiv.style.color = '#ffc107';
            errorDiv.innerHTML = `
              <div style="font-weight: 700; margin-bottom: 8px;">⚠️ Configuration Required</div>
              <div style="font-size: 13px;">The admin system is not fully configured. Please check the required environment variables.</div>
              <div class="support-text" style="font-size: 12px; margin-top: 8px;">
                <a href="/admin-not-configured/" style="color: #35e08a; text-decoration: underline;">View detailed setup instructions</a>
              </div>
            `;
          } else {
            // User-friendly generic message for other errors
            errorDiv.innerHTML = `
              <div>Login failed. Please try again.</div>
              <div class="support-text">If the problem persists, contact support.</div>
              <!-- Error code for debugging: ${errorCode} -->
            `;
          }
          
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
