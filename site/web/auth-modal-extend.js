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
    console.log('[substitute-auth] Initializing substitute authentication');
    
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

    // Check if substitute button already exists to prevent duplicates
    if (document.getElementById('signInSubstitute')) {
      console.log('[substitute-auth] Substitute button already exists, skipping creation');
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

  // Find or create substitute modal - always define variable to avoid scope issues
  let substituteModal = document.getElementById('substituteSignInModal');
  
  if (!substituteModal) {
    console.log('[substitute-auth] Creating substitute modal');
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
  } else {
    console.log('[substitute-auth] Substitute modal already exists');
  }

  // Event handlers
  const openSubstituteModal = () => {
    if (signInModal) signInModal.classList.remove('show');
    if (substituteModal) substituteModal.classList.add('show');
    document.getElementById('substitutePassword').value = '';
    document.getElementById('substituteSignInMsg').textContent = '';
    // Focus password field after a short delay
    setTimeout(() => {
      document.getElementById('substitutePassword').focus();
    }, 100);
  };

  const closeSubstituteModal = () => {
    if (substituteModal) substituteModal.classList.remove('show');
    if (signInModal) signInModal.classList.add('show');
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

  // Bind events (idempotent - check for __bound flag to prevent duplicates)
  if (!substituteButton.__bound) {
    substituteButton.addEventListener('click', openSubstituteModal);
    substituteButton.__bound = true;
  }
  
  const cancelBtn = document.getElementById('substituteSignInCancel');
  if (cancelBtn && !cancelBtn.__bound) {
    cancelBtn.addEventListener('click', closeSubstituteModal);
    cancelBtn.__bound = true;
  }
  
  const goBtn = document.getElementById('substituteSignInGo');
  if (goBtn && !goBtn.__bound) {
    goBtn.addEventListener('click', attemptSubstituteSignIn);
    goBtn.__bound = true;
  }
  
  // Enter key to sign in
  const passwordInput = document.getElementById('substitutePassword');
  if (passwordInput && !passwordInput.__bound) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        attemptSubstituteSignIn();
      }
    });
    passwordInput.__bound = true;
  }

  // Close on backdrop click
  if (substituteModal && !substituteModal.__boundBackdrop) {
    substituteModal.addEventListener('click', (e) => {
      if (e.target === substituteModal) {
        closeSubstituteModal();
      }
    });
    substituteModal.__boundBackdrop = true;
  }

  console.log('[substitute-auth] Substitute authentication initialized');
  } catch (err) {
    console.error('[substitute-auth] Failed to initialize:', err);
  }
}
