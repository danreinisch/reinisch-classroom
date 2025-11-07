// auth-modal-extend.js
// Extends the existing sign-in modal to support Substitute role

import { verifyUserPassword, saveAuthSession } from './user-auth.js';

// Guard flag to prevent double-binding
if (window.__authModalExtendBound) {
  console.log('[auth-modal-extend] Already initialized, skipping');
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
    console.log('[substitute-auth] Initializing substitute authentication');
    
    // Find the sign-in modal
    const signInModal = document.getElementById('signInModal');
    if (!signInModal) {
      console.warn('[auth-modal-extend] Sign-in modal not found');
      return;
    }

    // Find the role buttons container
    const roleButtons = signInModal.querySelector('[style*="display:grid"]');
    if (!roleButtons) {
      console.warn('[auth-modal-extend] Role buttons container not found');
      return;
    }

    // Check if substitute button already exists to prevent duplicates
    if (document.getElementById('signInSubstitute')) {
      console.log('[auth-modal-extend] Substitute button already exists, skipping creation');
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

    // CRITICAL FIX: Define substituteModal in outer scope to prevent ReferenceError
    // This variable is used by event handlers defined below
    let substituteModal = document.getElementById('substituteSignInModal');
    
    // Check if substitute modal already exists
    if (!substituteModal) {
      // Create Substitute sign-in modal (similar to student/teacher modals)
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
      console.log('[auth-modal-extend] Substitute modal already exists, reusing');
    }

    // Event handlers
    const openSubstituteModal = () => {
      signInModal.classList.remove('show');
      substituteModal.classList.add('show');
      const passwordInput = document.getElementById('substitutePassword');
      const msgEl = document.getElementById('substituteSignInMsg');
      if (passwordInput) passwordInput.value = '';
      if (msgEl) msgEl.textContent = '';
      // Focus password field after a short delay
      setTimeout(() => {
        if (passwordInput) passwordInput.focus();
      }, 100);
    };

    const closeSubstituteModal = () => {
      substituteModal.classList.remove('show');
      signInModal.classList.add('show');
    };

    const attemptSubstituteSignIn = async () => {
      const passwordInput = document.getElementById('substitutePassword');
      const msgEl = document.getElementById('substituteSignInMsg');
      const btnGo = document.getElementById('substituteSignInGo');

      if (!passwordInput || !msgEl || !btnGo) {
        console.error('[substitute-auth] Required elements not found');
        return;
      }

      const password = passwordInput.value;

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

    // Idempotent binding: Check if already bound before adding listeners
    if (!substituteButton.__bound) {
      substituteButton.addEventListener('click', openSubstituteModal);
      substituteButton.__bound = true;
    }
    
    const cancelBtn = document.getElementById('substituteSignInCancel');
    const goBtn = document.getElementById('substituteSignInGo');
    const passwordInput = document.getElementById('substitutePassword');
    
    if (cancelBtn && !cancelBtn.__bound) {
      cancelBtn.addEventListener('click', closeSubstituteModal);
      cancelBtn.__bound = true;
    }
    
    if (goBtn && !goBtn.__bound) {
      goBtn.addEventListener('click', attemptSubstituteSignIn);
      goBtn.__bound = true;
    }
    
    // Enter key to sign in
    if (passwordInput && !passwordInput.__bound) {
      passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          attemptSubstituteSignIn();
        }
      });
      passwordInput.__bound = true;
    }

    // Close on backdrop click (idempotent)
    if (substituteModal && !substituteModal.__bound) {
      substituteModal.addEventListener('click', (e) => {
        if (e.target === substituteModal) {
          closeSubstituteModal();
        }
      });
      substituteModal.__bound = true;
    }

    console.log('[substitute-auth] Initialization complete');
  } catch (err) {
    console.error('[TeacherCenter] Substitute auth init failed:', err);
  }
}
