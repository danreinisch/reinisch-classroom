/* home-classroom-message.js — teacher-controlled scenic homepage message. */
(function () {
  'use strict';

  var utils = window.RCClassroomMessage;
  if (!utils) return;

  var scenicTicker = document.querySelector('.home-scenic-ticker');
  if (scenicTicker) scenicTicker.style.visibility = 'hidden';

  function loadHomeConfig() {
    var t = '?t=' + Date.now();
    return import('/web/data-adapter.js').then(function (mod) {
      return mod.isRemote().then(function (remote) {
        if (!remote) return null;
        return mod.db.getAppConfig('home_config').then(function (cfg) {
          return cfg && typeof cfg === 'object' ? cfg : null;
        }).catch(function () { return null; });
      });
    }).catch(function () { return null; }).then(function (remoteConfig) {
      if (remoteConfig && typeof remoteConfig === 'object') return remoteConfig;

      var localOverrides = null;
      try {
        var raw = localStorage.getItem('rc_home_config');
        if (raw) localOverrides = JSON.parse(raw);
      } catch (_) { /* noop */ }

      return fetch('/assets/data/home-config.json' + t).then(function (response) {
        if (!response.ok) throw new Error('Home config request failed: ' + response.status);
        return response.json();
      }).then(function (base) {
        base = base && typeof base === 'object' ? base : {};
        if (localOverrides && typeof localOverrides === 'object' && !Array.isArray(localOverrides)) {
          for (var key in localOverrides) {
            if (Object.prototype.hasOwnProperty.call(localOverrides, key)) base[key] = localOverrides[key];
          }
        }
        return base;
      });
    });
  }

  function waitForLegacyTicker() {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function check() {
        var first = document.querySelector('.home-scenic-ticker .ticker-content');
        var text = first ? first.textContent.trim() : '';
        if (!first || (text && !/^Loading classroom message/i.test(text)) || Date.now() - started > 5000) {
          resolve();
          return;
        }
        setTimeout(check, 25);
      })();
    });
  }

  function updateOffset(track) {
    if (!track) return;
    var first = track.querySelector('.ticker-content');
    if (first) track.style.setProperty('--ticker-offset', '-' + first.offsetWidth + 'px');
  }

  function render(homeConfig) {
    var ticker = document.querySelector('.home-scenic-ticker');
    if (!ticker) return;
    var track = ticker.querySelector('.ticker-track');
    var contents = ticker.querySelectorAll('.ticker-content');
    var config = utils.normalize(homeConfig);
    var resolved = utils.resolve(config, new Date());

    if (!config.enabled) {
      ticker.hidden = true;
      ticker.style.visibility = '';
      ticker.dataset.messageSource = 'hidden';
      return;
    }

    ticker.hidden = false;
    for (var i = 0; i < contents.length; i++) {
      contents[i].textContent = resolved.text;
      if (i > 0) contents[i].setAttribute('aria-hidden', 'true');
    }
    if (track) {
      track.style.animationDuration = config.speed + 's';
      requestAnimationFrame(function () { updateOffset(track); });
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { updateOffset(track); }).catch(function () {});
      }
    }
    ticker.dataset.messageSource = resolved.source;
    ticker.style.visibility = '';
  }

  Promise.all([loadHomeConfig(), waitForLegacyTicker()]).then(function (results) {
    render(results[0]);
  }).catch(function (err) {
    console.warn('[home-classroom-message] Could not load classroom message:', err);
    render({ classroomMessage: { enabled: true, speed: utils.DEFAULT_SPEED, override: utils.DEFAULT_MESSAGE, weekdays: {} } });
  });
})();
