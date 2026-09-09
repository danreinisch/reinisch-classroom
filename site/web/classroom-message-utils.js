(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RCClassroomMessage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  var DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var DEFAULT_MESSAGE = 'Welcome to Reinisch Classroom.';
  var DEFAULT_SPEED = 45;

  function clean(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function clampSpeed(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = DEFAULT_SPEED;
    return Math.max(5, Math.min(180, Math.round(n)));
  }

  function emptyWeekdays() {
    return { monday: '', tuesday: '', wednesday: '', thursday: '', friday: '' };
  }

  function normalizeWeekdays(raw) {
    var result = emptyWeekdays();
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    WEEKDAY_KEYS.forEach(function (key) { result[key] = clean(raw[key]); });
    return result;
  }

  function detectWeekday(text) {
    var value = clean(text).toLowerCase();
    for (var i = 0; i < WEEKDAY_KEYS.length; i++) {
      var key = WEEKDAY_KEYS[i];
      if (new RegExp('\\b' + key + '\\b', 'i').test(value)) return key;
    }
    return '';
  }

  function legacyMessages(ticker) {
    ticker = ticker && typeof ticker === 'object' ? ticker : {};
    var values = [];
    if (Array.isArray(ticker.items)) {
      ticker.items.forEach(function (item) {
        if (!item || item.category !== 'none') return;
        var text = clean(item.text);
        if (text) values.push(text);
      });
    }
    if (Array.isArray(ticker.custom)) {
      ticker.custom.forEach(function (item) {
        var text = clean(item);
        if (text) values.push(text);
      });
    }
    return values.filter(function (value, index) { return values.indexOf(value) === index; });
  }

  function normalizeExplicit(raw) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      version: 1,
      enabled: raw.enabled !== false,
      speed: clampSpeed(raw.speed),
      override: clean(raw.override),
      weekdays: normalizeWeekdays(raw.weekdays),
    };
  }

  function normalize(homeConfig) {
    homeConfig = homeConfig && typeof homeConfig === 'object' && !Array.isArray(homeConfig) ? homeConfig : {};
    if (Object.prototype.hasOwnProperty.call(homeConfig, 'classroomMessage')) {
      return normalizeExplicit(homeConfig.classroomMessage);
    }

    var ticker = homeConfig.ticker && typeof homeConfig.ticker === 'object' ? homeConfig.ticker : {};
    var migrated = {
      version: 1,
      enabled: true,
      speed: clampSpeed(ticker.speed),
      override: '',
      weekdays: emptyWeekdays(),
    };

    legacyMessages(ticker).forEach(function (text) {
      var day = detectWeekday(text);
      if (day && !migrated.weekdays[day]) migrated.weekdays[day] = text;
      else if (!day && !migrated.override) migrated.override = text;
    });

    return migrated;
  }

  function resolve(configOrHomeConfig, date) {
    var config = configOrHomeConfig && configOrHomeConfig.weekdays
      ? normalizeExplicit(configOrHomeConfig)
      : normalize(configOrHomeConfig);

    if (!config.enabled) return { text: '', source: 'hidden', day: '' };
    if (config.override) return { text: config.override, source: 'override', day: '' };

    var when = date instanceof Date ? date : new Date(date || Date.now());
    var day = DAY_KEYS[when.getDay()] || '';
    if (WEEKDAY_KEYS.indexOf(day) !== -1 && config.weekdays[day]) {
      return { text: config.weekdays[day], source: day, day: day };
    }
    return { text: DEFAULT_MESSAGE, source: 'fallback', day: day };
  }

  function write(homeConfig, nextConfig) {
    var target = homeConfig && typeof homeConfig === 'object' && !Array.isArray(homeConfig) ? homeConfig : {};
    target.classroomMessage = normalizeExplicit(nextConfig);
    return target;
  }

  function labelForSource(source) {
    if (source === 'override') return 'Current override';
    if (source === 'fallback') return 'Fallback';
    if (source === 'hidden') return 'Hidden';
    return source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Preview';
  }

  return {
    WEEKDAY_KEYS: WEEKDAY_KEYS.slice(),
    DEFAULT_MESSAGE: DEFAULT_MESSAGE,
    DEFAULT_SPEED: DEFAULT_SPEED,
    clampSpeed: clampSpeed,
    normalize: normalize,
    resolve: resolve,
    write: write,
    labelForSource: labelForSource,
  };
});
