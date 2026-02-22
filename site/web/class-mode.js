(function () {
  'use strict';

  // Skip on teacher/admin/substitute pages
  var path = location.pathname;
  if (
    path.startsWith('/teacher/') ||
    path.startsWith('/admin/') ||
    path.startsWith('/substitute/') ||
    path.startsWith('/sub/')
  ) {
    return;
  }

  var CLASS_MODE_PIN = '6278';
  var SESSION_KEY = 'rc-class-mode';
  var CLASS_ACTIVE = 'rc-class-mode-active';

  var SVG_ATTRS = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  var ICON_LOCKED =
    '<svg ' + SVG_ATTRS + '>' +
    '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>' +
    '</svg>';

  var ICON_UNLOCKED =
    '<svg ' + SVG_ATTRS + '>' +
    '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 9.9-1"/>' +
    '</svg>';

  function isActive() {
    return document.documentElement.classList.contains(CLASS_ACTIVE);
  }

  function activate() {
    sessionStorage.setItem(SESSION_KEY, '1');
    document.documentElement.classList.add(CLASS_ACTIVE);
  }

  function deactivate() {
    sessionStorage.removeItem(SESSION_KEY);
    document.documentElement.classList.remove(CLASS_ACTIVE);
  }

  function updateIcon(iconEl) {
    iconEl.innerHTML = isActive() ? ICON_UNLOCKED : ICON_LOCKED;
  }

  function init() {
    var sidebar = document.querySelector('.tc-sidebar');
    if (!sidebar) return;

    // Restore session state before building UI
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      document.documentElement.classList.add(CLASS_ACTIVE);
    }

    // Build the class-mode widget HTML
    var wrapper = document.createElement('div');
    wrapper.className = 'tc-class-mode';
    wrapper.innerHTML =
      '<div class="tc-class-mode-pin" id="tcClassModePin">' +
        '<input type="password" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="PIN" id="tcClassModePinInput" aria-label="Enter 4-digit PIN" />' +
        '<div class="tc-class-mode-pin-actions">' +
          '<button type="button" class="primary" id="tcClassModePinSubmit">Submit</button>' +
          '<button type="button" id="tcClassModePinCancel">Cancel</button>' +
        '</div>' +
        '<div class="tc-class-mode-pin-error" id="tcClassModePinError">Incorrect PIN. Try again.</div>' +
      '</div>' +
      '<button type="button" class="tc-class-mode-btn" id="tcClassModeBtn" aria-label="Toggle Class Mode">' +
        '<span class="tc-icon" id="tcClassModeIcon"></span>' +
        '<span class="tc-class-mode-label">Class Mode</span>' +
      '</button>';

    sidebar.appendChild(wrapper);

    var btn = document.getElementById('tcClassModeBtn');
    var iconEl = document.getElementById('tcClassModeIcon');
    var pinForm = document.getElementById('tcClassModePin');
    var pinInput = document.getElementById('tcClassModePinInput');
    var pinSubmit = document.getElementById('tcClassModePinSubmit');
    var pinCancel = document.getElementById('tcClassModePinCancel');
    var pinError = document.getElementById('tcClassModePinError');

    if (!btn || !iconEl || !pinForm || !pinInput || !pinSubmit || !pinCancel || !pinError) return;

    // Set correct icon based on current state
    updateIcon(iconEl);

    function openPin() {
      pinInput.value = '';
      pinError.classList.remove('visible');
      pinForm.classList.add('open');
      pinInput.focus();
    }

    function closePin() {
      pinForm.classList.remove('open');
      pinInput.value = '';
      pinError.classList.remove('visible');
    }

    function submitPin() {
      var entered = pinInput.value;
      if (entered === CLASS_MODE_PIN) {
        activate();
        updateIcon(iconEl);
        closePin();
      } else {
        pinInput.value = '';
        pinError.classList.add('visible');
        pinInput.focus();
      }
    }

    btn.addEventListener('click', function () {
      if (isActive()) {
        deactivate();
        updateIcon(iconEl);
        closePin();
      } else {
        if (pinForm.classList.contains('open')) {
          closePin();
        } else {
          openPin();
        }
      }
    });

    pinSubmit.addEventListener('click', submitPin);

    pinCancel.addEventListener('click', closePin);

    pinInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        submitPin();
      } else if (e.key === 'Escape') {
        closePin();
      }
    });
  }

  function deferInit() {
    // Poll until public-nav.js has finished replacing/injecting .tc-sidebar
    var attempts = 0;
    function tryInit() {
      var sidebar = document.querySelector('.tc-sidebar');
      // Ensure public-nav.js has finished replacing/injecting the sidebar
      if (sidebar && sidebar.querySelector('.tc-nav')) {
        init();
      } else if (attempts < 20) {
        attempts++;
        setTimeout(tryInit, 100);
      } else {
        console.warn('[class-mode] Could not find .tc-sidebar with .tc-nav after 20 attempts.');
      }
    }
    tryInit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', deferInit);
  } else {
    deferInit();
  }
})();
