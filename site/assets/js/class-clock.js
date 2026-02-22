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
   * Return an SVG icon for the given clock status
   * @param {string} status
   * @returns {string}
   */
  function clockIcon(status) {
    var attrs = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    var color;
    var body;

    switch (status) {
      case 'in-class':
        color = 'var(--rc-brand, #35e08a)';
        body = '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>';
        break;
      case 'passing':
        color = '#ffbd2e';
        body = '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>';
        break;
      case 'before-school':
        color = '#60a5fa';
        body = '<path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="9" x2="12" y2="2"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/><polyline points="8 6 12 2 16 6"/>';
        break;
      case 'after-school':
        color = 'var(--rc-ink-dim, #a9bbb1)';
        body = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
        break;
      default: // no-school
        color = 'var(--rc-ink-dim, #a9bbb1)';
        body = '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="14" x2="14" y2="18"/><line x1="14" y1="14" x2="10" y2="18"/>';
        break;
    }

    return '<svg ' + attrs + ' stroke="' + color + '" class="tc-clock-icon">' + body + '</svg>';
  }

  /**
   * Build the inner HTML for the clock element
   * @param {Object} state - Result of getCurrentPeriod()
   * @param {Date} now
   * @returns {string}
   */
  function buildClockHtml(state, now) {
    var periodHtml = '';
    var countdownHtml = '';

    if (state.status === 'in-class') {
      var p = state.period;
      var hourLabel = ordinal(p.hour) + ' Hr';
      periodHtml =
        '<span class="tc-clock-period">' + escapeHtml(hourLabel) + '</span>' +
        '<span class="tc-clock-label">\u2014 ' + escapeHtml(p.label) + '</span>';
      countdownHtml = '<span class="tc-clock-countdown">(' + fmtCountdown(state.remainingSeconds) + ')</span>';
    } else if (state.status === 'passing') {
      var np = state.nextPeriod;
      var nextLabel = ordinal(np.hour) + ' hour in ' + fmtCountdown(state.remainingSeconds);
      periodHtml = '<span class="tc-clock-period">Passing</span>';
      countdownHtml = '<span class="tc-clock-label tc-clock-countdown">(' + escapeHtml(nextLabel) + ')</span>';
    } else if (state.status === 'before-school') {
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
      clockIcon(state.status) +
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

  function deferInit() {
    // If topbar/pv-bar is already present, run now
    var target = document.querySelector('.pv-bar') || document.querySelector('.tc-topbar');
    if (target && !document.getElementById('classClock')) {
      init();
      return;
    }
    // Wait for public-nav.js to signal completion
    document.addEventListener('rc-nav-ready', function() { init(); }, { once: true });
    // Safety fallback
    setTimeout(function() {
      if (!document.getElementById('classClock')) { init(); }
    }, 3000);
  }

  if (document.readyState === 'complete') {
    deferInit();
  } else {
    document.addEventListener('DOMContentLoaded', deferInit);
  }
})();
