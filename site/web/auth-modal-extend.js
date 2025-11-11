// auth-modal-extend.js
// Extends the existing sign-in modal to support Substitute role

import { verifyUserPassword, saveAuthSession } from './user-auth.js';

// Guard flag to prevent double-binding
if (window.__authModalExtendBound) {
  console.log('[substitute-auth] Already initialized, skipping');
} else {
  window.__authModalExtendBound = true;
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSubstituteAuth);
  } else {
    initSubstituteAuth();
  }
}

function initSubstituteAuth() {
  try {
    // Check global flag to prevent multiple injections across code paths
    if (window.__substituteInjected) {
      console.log('[substitute-auth] Already injected (global flag), skipping');
      return;
    }
    
    // Find the sign-in modal
    const signInModal = document.getElementById('signInModal');
    if (!signInModal) {
      console.warn('[substitute-auth] Sign-in modal not found');
      return;
    }

    // Find the role buttons container
    const roleButtons = signInModal.querySelector('[style*="display:grid"]');
    if (!roleButtons) {
      console.warn('[substitute-auth] Role buttons container not found');
      return;
    }

    // Robust duplicate detection: check by ID AND text content
    const existingById = document.getElementById('signInSubstitute');
    const allButtons = Array.from(roleButtons.querySelectorAll('button'));
    const existingByText = allButtons.find(btn => {
      const text = btn.textContent || '';
      return text.toLowerCase().includes('substitute');
    });
    
    if (existingById || existingByText) {
      console.log('[substitute-auth] Substitute button already exists (by ID or text), skipping creation');
      
      // Set flag to prevent future attempts
      window.__substituteInjected = true;
      
      // Clean up duplicates if multiple exist
      const allSubButtons = allButtons.filter(btn => {
        const text = btn.textContent || '';
        return text.toLowerCase().includes('substitute') || btn.id === 'signInSubstitute';
      });
      
      if (allSubButtons.length > 1) {
        console.warn('[substitute-auth] Found', allSubButtons.length, 'Substitute buttons, removing duplicates');
        // Keep first, remove others
        for (let i = 1; i < allSubButtons.length; i++) {
          allSubButtons[i].remove();
        }
      }
      
      return;
    }

    // Add Substitute button after Teacher button
    const substituteButton = document.createElement('button');
    substituteButton.className = 'btn';
    substituteButton.id = 'signInSubstitute';
    substituteButton.style.cssText = 'padding:16px;text-align:left;display:flex;align-items:center;gap:12px';
    substituteButton.innerHTML = `
      <span style="font-size:32px">👩‍🏫</span>
      <div>
        <div style="font-weight:900;font-size:16px">Substitute</div>
        <div class="subtle" style="font-size:13px">Access today's lesson plans</div>
      </div>
    `;
    
    roleButtons.appendChild(substituteButton);
    
    // Set global flag to prevent future injections
    window.__substituteInjected = true;
    console.log('[substitute-auth] Substitute button created and flag set');

    // Define substituteModal at function scope so all handlers can access it
    let substituteModal = document.getElementById('substituteSignInModal');
    
    // Create modal if it doesn't exist
    if (!substituteModal) {
      substituteModal = document.createElement('div');
      substituteModal.className = 'modal-backdrop';
      substituteModal.id = 'substituteSignInModal';
      substituteModal.innerHTML = `
        <div class="modal card" style="max-width:420px">
          <div class="card-header"><div>Substitute Sign In</div></div>
          <label>Password
            <input id="substitutePassword" type="password" placeholder="Enter substitute password">
          </label>
          <div class="subtle" id="substituteSignInMsg" style="min-height:18px;margin-top:6px"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px">
            <button class="btn small" id="substituteSignInCancel">Back</button>
            <button class="btn primary small" id="substituteSignInGo">Sign In</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(substituteModal);
      console.log('[substitute-auth] Substitute modal created');
    } else {
      console.log('[substitute-auth] Substitute modal already exists');
    }

  // Event handlers
  const openSubstituteModal = () => {
    signInModal.classList.remove('show');
    substituteModal.classList.add('show');
    document.getElementById('substitutePassword').value = '';
    document.getElementById('substituteSignInMsg').textContent = '';
    // Focus password field after a short delay
    setTimeout(() => {
      document.getElementById('substitutePassword').focus();
    }, 100);
  };

  const closeSubstituteModal = () => {
    substituteModal.classList.remove('show');
    signInModal.classList.add('show');
  };

  const attemptSubstituteSignIn = async () => {
    const password = document.getElementById('substitutePassword').value;
    const msgEl = document.getElementById('substituteSignInMsg');
    const btnGo = document.getElementById('substituteSignInGo');

    if (!password) {
      msgEl.textContent = 'Please enter password';
      msgEl.style.color = '#fecaca';
      return;
    }

    // Disable button during authentication
    btnGo.disabled = true;
    btnGo.textContent = 'Signing in...';
    msgEl.textContent = 'Verifying...';
    msgEl.style.color = 'var(--muted)';

    try {
      // Fixed username for substitute
      const result = await verifyUserPassword('substitute', password);

      if (result && result.role === 'substitute') {
        // Success!
        msgEl.textContent = 'Success! Redirecting...';
        msgEl.style.color = 'var(--brand)';
        
        // Save auth session
        saveAuthSession({
          role: 'substitute',
          username: 'substitute',
          student_id: null
        });

        // Redirect to substitute center
        setTimeout(() => {
          window.location.href = '/sub/';
        }, 500);
      } else {
        // Failed
        msgEl.textContent = 'Invalid password. Please try again.';
        msgEl.style.color = '#fecaca';
        btnGo.disabled = false;
        btnGo.textContent = 'Sign In';
      }
    } catch (err) {
      console.error('[substitute-auth] Error:', err);
      msgEl.textContent = 'Sign in failed. Please try again.';
      msgEl.style.color = '#fecaca';
      btnGo.disabled = false;
      btnGo.textContent = 'Sign In';
    }
  };

    // Bind events with idempotent guards
    if (!substituteButton.__bound) {
      substituteButton.__bound = true;
      substituteButton.addEventListener('click', openSubstituteModal);
    }
    
    const cancelBtn = document.getElementById('substituteSignInCancel');
    const goBtn = document.getElementById('substituteSignInGo');
    const passwordInput = document.getElementById('substitutePassword');
    
    if (cancelBtn && !cancelBtn.__bound) {
      cancelBtn.__bound = true;
      cancelBtn.addEventListener('click', closeSubstituteModal);
    }
    
    if (goBtn && !goBtn.__bound) {
      goBtn.__bound = true;
      goBtn.addEventListener('click', attemptSubstituteSignIn);
    }
    
    if (passwordInput && !passwordInput.__bound) {
      passwordInput.__bound = true;
      passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          attemptSubstituteSignIn();
        }
      });
    }

    // Close on backdrop click with idempotent guard
    if (!substituteModal.__bound) {
      substituteModal.__bound = true;
      substituteModal.addEventListener('click', (e) => {
        if (e.target === substituteModal) {
          closeSubstituteModal();
        }
      });
    }

    console.log('[substitute-auth] Substitute authentication initialized');
  } catch (err) {
    console.error('[substitute-auth] Initialization failed:', err);
    // Don't throw - allow Hub to continue loading even if substitute auth fails
  }
}
