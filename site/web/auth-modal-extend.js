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

  // Check if substitute modal already exists
  if (document.getElementById('substituteSignInModal')) {
    console.log('[auth-modal-extend] Substitute modal already exists, skipping creation');
  } else {
    // Create Substitute sign-in modal (similar to student/teacher modals)
    const substituteModal = document.createElement('div');
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

  // Bind events
  substituteButton.addEventListener('click', openSubstituteModal);
  document.getElementById('substituteSignInCancel').addEventListener('click', closeSubstituteModal);
  document.getElementById('substituteSignInGo').addEventListener('click', attemptSubstituteSignIn);
  
  // Enter key to sign in
  document.getElementById('substitutePassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      attemptSubstituteSignIn();
    }
  });

  // Close on backdrop click
  substituteModal.addEventListener('click', (e) => {
    if (e.target === substituteModal) {
      closeSubstituteModal();
    }
  });

  console.log('[auth-modal-extend] Substitute authentication initialized');
}
