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

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = String(str == null ? '' : str);
    return d.innerHTML;
  }

  /**
   * Return ordinal suffix string for a number: 1→"1st", 2→"2nd", etc.
   * @param {number} n
   * @returns {string}
   */
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /**
   * Format seconds as MM:SS (or H:MM:SS if ≥ 3600s)
   * @param {number} secs
   * @returns {string}
   */
  function fmtCountdown(secs) {
    var s = Math.max(0, Math.floor(secs));
    if (s >= 3600) {
      var h = Math.floor(s / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;
      return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }
    var m2 = Math.floor(s / 60);
    var sec2 = s % 60;
    return String(m2).padStart(2, '0') + ':' + String(sec2).padStart(2, '0');
  }

  /**
   * Format a Date as 12-hour time with seconds: "8:40:05 AM"
   * @param {Date} now
   * @returns {string}
   */
  function fmtTime(now) {
    return now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  /**
   * Build the inner HTML for the clock element
   * @param {Object} state - Result of getCurrentPeriod()
   * @param {Date} now
   * @returns {string}
   */
  function buildClockHtml(state, now) {
    var dotClass = 'tc-clock-dot--dim';
    var periodHtml = '';
    var countdownHtml = '';

    if (state.status === 'in-class') {
      dotClass = 'tc-clock-dot--active';
      var p = state.period;
      var hourLabel = ordinal(p.hour) + ' Hr';
      periodHtml =
        '<span class="tc-clock-period">' + escapeHtml(hourLabel) + '</span>' +
        '<span class="tc-clock-label">\u2014 ' + escapeHtml(p.label) + '</span>';
      countdownHtml = '<span class="tc-clock-countdown">(' + fmtCountdown(state.remainingSeconds) + ')</span>';
    } else if (state.status === 'passing') {
      dotClass = 'tc-clock-dot--passing';
      var np = state.nextPeriod;
      var nextLabel = ordinal(np.hour) + ' hour in ' + fmtCountdown(state.remainingSeconds);
      periodHtml = '<span class="tc-clock-period">Passing</span>';
      countdownHtml = '<span class="tc-clock-label tc-clock-countdown">(' + escapeHtml(nextLabel) + ')</span>';
    } else if (state.status === 'before-school') {
      dotClass = 'tc-clock-dot--before';
      var bs = state.nextPeriod;
      var bsLabel = ordinal(bs.hour) + ' hour in ' + fmtCountdown(state.remainingSeconds);
      periodHtml = '<span class="tc-clock-period">Before School</span>';
      countdownHtml = '<span class="tc-clock-label tc-clock-countdown">(' + escapeHtml(bsLabel) + ')</span>';
    } else if (state.status === 'after-school') {
      periodHtml = '<span class="tc-clock-period">After School</span>';
    } else {
      periodHtml = '<span class="tc-clock-period">No School Today</span>';
    }

    return (
      '<span class="tc-clock-dot ' + dotClass + '" aria-hidden="true"></span>' +
      periodHtml +
      countdownHtml +
      '<span class="tc-clock-sep" aria-hidden="true">\u00b7</span>' +
      '<span class="tc-clock-time">' + escapeHtml(fmtTime(now)) + '</span>'
    );
  }

  /**
   * Initialize the clock after DOMContentLoaded
   */
  function init() {
    // Find or create the clock element
    var clockEl = null;
    var pvBar = document.querySelector('.pv-bar');
    var tcTopbar = document.querySelector('.tc-topbar');

    if (pvBar) {
      // Viewer page: create classClock before the sidebar toggle button.
      // Hide the existing simple-time viewerClock to avoid duplication.
      var existingClock = document.getElementById('viewerClock');
      if (existingClock) {
        existingClock.style.display = 'none';
      }
      clockEl = document.createElement('div');
      clockEl.className = 'tc-clock';
      clockEl.id = 'classClock';
      var sidebarBtn = document.getElementById('sidebarToggleBtn') ||
        pvBar.querySelector('.viewer-btn-sidebar');
      if (sidebarBtn) {
        pvBar.insertBefore(clockEl, sidebarBtn);
      } else {
        pvBar.appendChild(clockEl);
      }
    } else if (tcTopbar) {
      clockEl = document.createElement('div');
      clockEl.className = 'tc-clock';
      clockEl.id = 'classClock';
      tcTopbar.appendChild(clockEl);
    } else {
      return; // No topbar found — graceful degradation
    }

    // Dynamically import the schedule module and start the clock
    import('/web/class-schedule.js').then(function (mod) {
      var getSchedule = mod.getSchedule;
      var getCurrentPeriod = mod.getCurrentPeriod;

      getSchedule().then(function (schedule) {
        function tick() {
          var now = new Date();
          var state = getCurrentPeriod(schedule, now);
          clockEl.innerHTML = buildClockHtml(state, now);
        }

        tick();
        setInterval(tick, 1000);
      }).catch(function (err) {
        console.warn('[class-clock] Failed to load schedule:', err);
      });
    }).catch(function (err) {
      console.warn('[class-clock] Failed to import class-schedule.js:', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
