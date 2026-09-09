/* tc-classroom-message.js — focused editor for the scenic homepage Classroom Message. */
(function () {
  'use strict';

  if (!location.pathname.startsWith('/teacher/settings')) return;

  var utils = window.RCClassroomMessage;
  if (!utils) throw new Error('RCClassroomMessage utilities are unavailable');

  var homeConfig = {};
  var adapterPromise = null;

  function $(id) { return document.getElementById(id); }

  function getAdapter() {
    if (!adapterPromise) adapterPromise = import('/web/data-adapter.js');
    return adapterPromise;
  }

  function showToast(text, background, color) {
    var toast = document.createElement('div');
    toast.textContent = text;
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' + background + ';color:' + color + ';padding:9px 16px;border-radius:8px;font-size:13px;font-weight:650;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.25);';
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 2400);
  }

  function oldHomepageCards() {
    var cards = [];
    ['laUnit', 'lsCurrentTitle', 'tickerDateFormat', 'countdownsBody'].forEach(function (id) {
      var el = $(id);
      var card = el && el.closest('.rc-card');
      if (card && cards.indexOf(card) === -1) cards.push(card);
    });
    return cards;
  }

  function removeLegacyHomepageCards() {
    oldHomepageCards().forEach(function (card) { card.remove(); });
  }

  function addStyles() {
    if ($('classroomMessageSettingsStyles')) return;
    var style = document.createElement('style');
    style.id = 'classroomMessageSettingsStyles';
    style.textContent = '\
      #classroomMessageSettings .cm-toggle{display:flex;align-items:center;gap:10px;margin:0 0 18px;padding:12px 14px;border:1px solid var(--rc-glass-border);border-radius:10px;background:rgba(255,255,255,.035);cursor:pointer;}\
      #classroomMessageSettings .cm-toggle input{width:18px;height:18px;accent-color:var(--rc-brand);}\
      #classroomMessageSettings .cm-toggle strong{display:block;font-size:14px;}\
      #classroomMessageSettings .cm-toggle span span{display:block;margin-top:2px;font-size:12px;opacity:.68;font-weight:400;}\
      #classroomMessageSettings textarea{width:100%;min-height:64px;resize:vertical;line-height:1.45;}\
      #classroomMessageSettings .cm-help{margin:6px 0 0;font-size:12px;opacity:.65;}\
      #classroomMessageSettings .cm-weekday-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-bottom:18px;}\
      #classroomMessageSettings .cm-weekday-item{padding:12px;border:1px solid var(--rc-glass-border);border-radius:10px;background:rgba(255,255,255,.025);}\
      #classroomMessageSettings .cm-weekday-item label{margin-bottom:7px;}\
      #classroomMessageSettings .cm-preview{overflow:hidden;margin:18px 0;padding:14px 16px;border:1px solid rgba(255,225,165,.22);border-radius:12px;background:linear-gradient(90deg,rgba(2,35,30,.96),rgba(8,56,47,.9));}\
      #classroomMessageSettings .cm-preview-meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;color:var(--rc-muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;}\
      #classroomMessageSettings .cm-preview-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ffe1a5;font-family:Georgia,Times New Roman,serif;font-size:15px;font-style:italic;font-weight:650;text-shadow:0 1px 2px rgba(0,0,0,.8);}\
      #classroomMessageSettings .cm-preview-dots{opacity:.65;letter-spacing:.12em;}\
      #classroomMessageSettings .cm-preview.is-hidden{opacity:.55;}\
      #classroomMessageSettings .cm-speed-scale{display:flex;justify-content:space-between;font-size:11px;opacity:.5;margin-top:2px;}\
      @media(max-width:600px){#classroomMessageSettings .cm-weekday-grid{grid-template-columns:1fr;}}';
    document.head.appendChild(style);
  }

  function buildCard() {
    if ($('classroomMessageSettings')) return;
    addStyles();

    var existingCards = oldHomepageCards();
    var anchor = existingCards[0] || null;
    var card = document.createElement('div');
    card.className = 'rc-card';
    card.id = 'classroomMessageSettings';
    card.style.marginBottom = '16px';
    card.innerHTML = '\
      <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px;">\
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>\
        Classroom Message\
      </h2>\
      <p style="margin:0 0 14px 0;opacity:.85;font-size:14px;">Control the scenic scrolling message that crosses the canyon sky on the Reinisch Classroom home page.</p>\
      <label class="cm-toggle" for="classroomMessageEnabled">\
        <input type="checkbox" id="classroomMessageEnabled" />\
        <span><strong>Show classroom message</strong><span>Turn the scenic message on or off without deleting your weekday text.</span></span>\
      </label>\
      <div class="settings-form-group">\
        <label for="classroomMessageOverride">Current / temporary message</label>\
        <textarea id="classroomMessageOverride" class="rc-input" rows="2" placeholder="Optional: a special message that should appear instead of the weekday message."></textarea>\
        <p class="cm-help">When this box has text, it overrides every weekday. Clear it to return to the automatic weekday message.</p>\
      </div>\
      <div class="settings-form-group">\
        <label style="margin-bottom:10px;">Weekday messages</label>\
        <div class="cm-weekday-grid">\
          <div class="cm-weekday-item"><label for="classroomMessageMonday">Monday</label><textarea id="classroomMessageMonday" class="rc-input" rows="2" placeholder="Monday has entered the chat. We will survive."></textarea></div>\
          <div class="cm-weekday-item"><label for="classroomMessageTuesday">Tuesday</label><textarea id="classroomMessageTuesday" class="rc-input" rows="2" placeholder="Congratulations. You survived Monday."></textarea></div>\
          <div class="cm-weekday-item"><label for="classroomMessageWednesday">Wednesday</label><textarea id="classroomMessageWednesday" class="rc-input" rows="2" placeholder="Halfway there. Keep calm, learn stuff, and avoid dramatic plot twists."></textarea></div>\
          <div class="cm-weekday-item"><label for="classroomMessageThursday">Thursday</label><textarea id="classroomMessageThursday" class="rc-input" rows="2" placeholder="Thursday: basically Friday\'s loading screen."></textarea></div>\
          <div class="cm-weekday-item"><label for="classroomMessageFriday">Friday</label><textarea id="classroomMessageFriday" class="rc-input" rows="2" placeholder="We have successfully located Friday."></textarea></div>\
        </div>\
      </div>\
      <div class="settings-form-group">\
        <label for="classroomMessageSpeed" style="display:flex;align-items:center;justify-content:space-between;"><span>Scroll speed</span><span id="classroomMessageSpeedLabel" style="font-weight:400;opacity:.75;font-size:12px;">Normal</span></label>\
        <input type="range" id="classroomMessageSpeed" min="5" max="180" step="1" value="45" style="width:100%;accent-color:var(--rc-brand);cursor:pointer;" />\
        <div class="cm-speed-scale"><span>Blazing</span><span>Normal</span><span>Crawl</span></div>\
      </div>\
      <div class="cm-preview" id="classroomMessagePreview">\
        <div class="cm-preview-meta"><span>Homepage preview</span><span id="classroomMessagePreviewSource">Preview</span></div>\
        <div class="cm-preview-line"><span class="cm-preview-dots" aria-hidden="true">· · · · · </span><span id="classroomMessagePreviewText">Welcome to Reinisch Classroom.</span><span class="cm-preview-dots" aria-hidden="true"> · · · · ·</span></div>\
      </div>\
      <p class="cm-help" style="margin-bottom:14px;">If today\'s weekday box is blank (or it is Saturday/Sunday), the homepage falls back to “Welcome to Reinisch Classroom.”</p>\
      <div class="tc-actions"><button id="saveClassroomMessageBtn" class="rc-btn primary">Save Classroom Message</button></div>';

    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor);
    else {
      var dataCard = $('settingsSyncStatus');
      dataCard = dataCard && dataCard.closest('.rc-card');
      if (dataCard && dataCard.parentNode) dataCard.parentNode.insertBefore(card, dataCard);
      else document.querySelector('.tc-main')?.appendChild(card);
    }

    removeLegacyHomepageCards();
  }

  function loadHomeConfig() {
    var t = '?t=' + Date.now();
    return getAdapter().then(function (mod) {
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
      }).catch(function () { return {}; }).then(function (base) {
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

  function speedLabel(seconds) {
    var s = Number(seconds);
    if (s <= 5) return 'Blazing';
    if (s <= 12) return 'Fast';
    if (s <= 30) return 'Brisk';
    if (s <= 45) return 'Normal';
    if (s <= 60) return 'Relaxed';
    if (s <= 90) return 'Slow';
    if (s <= 120) return 'Very Slow';
    return 'Crawl';
  }

  function readForm() {
    return {
      version: 1,
      enabled: $('classroomMessageEnabled').checked,
      speed: utils.clampSpeed($('classroomMessageSpeed').value),
      override: $('classroomMessageOverride').value.trim(),
      weekdays: {
        monday: $('classroomMessageMonday').value.trim(),
        tuesday: $('classroomMessageTuesday').value.trim(),
        wednesday: $('classroomMessageWednesday').value.trim(),
        thursday: $('classroomMessageThursday').value.trim(),
        friday: $('classroomMessageFriday').value.trim(),
      },
    };
  }

  function updatePreview() {
    var config = readForm();
    var resolved = utils.resolve(config, new Date());
    $('classroomMessagePreviewSource').textContent = utils.labelForSource(resolved.source);
    $('classroomMessagePreviewText').textContent = resolved.text || 'Classroom message hidden';
    $('classroomMessagePreview').classList.toggle('is-hidden', !config.enabled);
    $('classroomMessageSpeedLabel').textContent = speedLabel(config.speed);
  }

  function populate(config) {
    $('classroomMessageEnabled').checked = config.enabled;
    $('classroomMessageSpeed').value = config.speed;
    $('classroomMessageOverride').value = config.override;
    utils.WEEKDAY_KEYS.forEach(function (key) {
      var id = 'classroomMessage' + key.charAt(0).toUpperCase() + key.slice(1);
      $(id).value = config.weekdays[key] || '';
    });
    updatePreview();
  }

  function bindEvents() {
    ['classroomMessageEnabled', 'classroomMessageSpeed', 'classroomMessageOverride', 'classroomMessageMonday', 'classroomMessageTuesday', 'classroomMessageWednesday', 'classroomMessageThursday', 'classroomMessageFriday'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener(id === 'classroomMessageEnabled' ? 'change' : 'input', updatePreview);
    });

    $('saveClassroomMessageBtn').addEventListener('click', async function () {
      var button = $('saveClassroomMessageBtn');
      var original = button.textContent;
      button.disabled = true;
      button.textContent = 'Saving…';

      homeConfig = utils.write(homeConfig, readForm());
      localStorage.setItem('rc_home_config', JSON.stringify(homeConfig));

      try {
        var mod = await getAdapter();
        await mod.db.setAppConfig('home_config', homeConfig);
        showToast('✓ Classroom message saved & synced.', '#22c55e', '#0b1220');
        button.textContent = '✓ Saved';
      } catch (err) {
        console.warn('[tc-classroom-message] Remote sync failed:', err);
        showToast('✓ Saved locally. Remote sync failed.', '#f59e0b', '#0b1220');
        button.textContent = 'Saved locally';
      }

      setTimeout(function () {
        button.disabled = false;
        button.textContent = original;
      }, 1600);
    });
  }

  async function init() {
    buildCard();
    bindEvents();
    try {
      homeConfig = await loadHomeConfig();
    } catch (err) {
      console.warn('[tc-classroom-message] Could not load home config:', err);
      homeConfig = {};
    }
    populate(utils.normalize(homeConfig));
    var retirementStyle = $('rc-classroom-message-retirement-style');
    if (retirementStyle) retirementStyle.remove();
  }

  init();
})();
