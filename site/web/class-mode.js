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
  var CLASS_HIDDEN = 'rc-class-mode-hidden';

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
    return !document.documentElement.classList.contains(CLASS_HIDDEN);
  }

  function activate() {
    sessionStorage.removeItem(SESSION_KEY);
    document.documentElement.classList.remove(CLASS_HIDDEN);
  }

  function deactivate() {
    sessionStorage.setItem(SESSION_KEY, '0');
    document.documentElement.classList.add(CLASS_HIDDEN);
  }

  function updateIcon(iconEl) {
    iconEl.innerHTML = isActive() ? ICON_UNLOCKED : ICON_LOCKED;
  }

  function syncTabIcon() {
    var tabIcon = document.getElementById('tcTabIcon');
    if (tabIcon) { updateIcon(tabIcon); }
  }

  function init() {
    // Restore session state before building UI
    if (sessionStorage.getItem(SESSION_KEY) === '0') {
      document.documentElement.classList.add(CLASS_HIDDEN);
    }

    // Build sidebar widget (if sidebar exists)
    var sidebar = document.querySelector('.tc-sidebar');
    if (sidebar) {
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

      if (btn && iconEl && pinForm && pinInput && pinSubmit && pinCancel && pinError) {
        updateIcon(iconEl);

        var openPin = function () {
          pinInput.value = '';
          pinError.classList.remove('visible');
          pinForm.classList.add('open');
          pinInput.focus();
        };

        var closePin = function () {
          pinForm.classList.remove('open');
          pinInput.value = '';
          pinError.classList.remove('visible');
        };

        var submitPin = function () {
          if (pinInput.value === CLASS_MODE_PIN) {
            activate();
            updateIcon(iconEl);
            syncTabIcon();
            closePin();
          } else {
            pinInput.value = '';
            pinError.classList.add('visible');
            pinInput.focus();
          }
        };

        btn.addEventListener('click', function () {
          if (isActive()) {
            deactivate();
            updateIcon(iconEl);
            syncTabIcon();
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
          if (e.key === 'Enter') { submitPin(); }
          else if (e.key === 'Escape') { closePin(); }
        });
      }
    }

    // Build fixed bottom tab
    if (!document.getElementById('tcClassModeTab')) {
      var tab = document.createElement('div');
      tab.className = 'tc-class-mode-tab';
      tab.id = 'tcClassModeTab';
      tab.innerHTML =
        '<div class="tc-class-mode-tab-panel" id="tcTabPanel">' +
          '<input type="password" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="PIN" id="tcTabPinInput" aria-label="Enter 4-digit class mode PIN" />' +
          '<div class="tc-class-mode-tab-actions">' +
            '<button type="button" class="primary" id="tcTabSubmit">Unlock</button>' +
            '<button type="button" id="tcTabCancel" aria-label="Cancel">\u00d7</button>' +
          '</div>' +
          '<div class="tc-class-mode-tab-error" id="tcTabError">Wrong PIN</div>' +
        '</div>' +
        '<button type="button" class="tc-class-mode-tab-btn" id="tcTabBtn" aria-label="Toggle Class Mode">' +
          '<span id="tcTabIcon"></span>' +
        '</button>';
      document.body.appendChild(tab);

      var tabBtn = document.getElementById('tcTabBtn');
      var tabPinInput = document.getElementById('tcTabPinInput');
      var tabSubmit = document.getElementById('tcTabSubmit');
      var tabCancel = document.getElementById('tcTabCancel');
      var tabError = document.getElementById('tcTabError');

      syncTabIcon();

      var openTab = function () {
        tabPinInput.value = '';
        tabError.classList.remove('visible');
        tab.classList.add('open');
        tabPinInput.focus();
      };

      var closeTab = function () {
        tab.classList.remove('open');
        tabPinInput.value = '';
        tabError.classList.remove('visible');
      };

      var submitTab = function () {
        if (tabPinInput.value === CLASS_MODE_PIN) {
          activate();
          syncTabIcon();
          var sidebarIcon = document.getElementById('tcClassModeIcon');
          if (sidebarIcon) { updateIcon(sidebarIcon); }
          closeTab();
        } else {
          tabPinInput.value = '';
          tabError.classList.add('visible');
          tabPinInput.focus();
        }
      };

      tabBtn.addEventListener('click', function () {
        if (isActive()) {
          deactivate();
          syncTabIcon();
          var sidebarIcon = document.getElementById('tcClassModeIcon');
          if (sidebarIcon) { updateIcon(sidebarIcon); }
          closeTab();
        } else {
          if (tab.classList.contains('open')) {
            closeTab();
          } else {
            openTab();
          }
        }
      });

      tabSubmit.addEventListener('click', submitTab);
      tabCancel.addEventListener('click', closeTab);
      tabPinInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { submitTab(); }
        else if (e.key === 'Escape') { closeTab(); }
      });
    }
  }

  function deferInit() {
    // ALWAYS wait for public-nav.js to finish replacing the sidebar.
    // Do NOT check for .tc-sidebar early — it may be the pre-replacement element
    // that public-nav.js is about to destroy with outerHTML.
    document.addEventListener('rc-nav-ready', function() {
      if (!document.querySelector('.tc-class-mode')) { init(); }
    }, { once: true });
    // Safety fallback in case rc-nav-ready already fired or public-nav.js isn't loaded
    setTimeout(function() {
      if (!document.querySelector('.tc-class-mode')) { init(); }
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', deferInit);
  } else {
    deferInit();
  }
})();
