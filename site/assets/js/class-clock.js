// class-clock.js
// Class Clock — persistent slim info bar showing date, current period, and time
// Auto-injects on supported pages, defers to viewer integration on /viewer/

(async function () {
  'use strict';

  const PATH = location.pathname;

  // Do NOT show on teacher, admin, substitute, or sub pages
  const EXCLUDED = ['/teacher/', '/admin/', '/substitute/', '/sub/'];
  if (EXCLUDED.some(p => PATH.startsWith(p))) return;

  // Pages where clock is shown
  const INCLUDED = ['/', '/index.html', '/language-arts/', '/life-skills/', '/math-toolkit/', '/student/', '/hub/', '/viewer/'];
  const isViewer = PATH.startsWith('/viewer');
  const isIncluded = isViewer || INCLUDED.some(p => {
    if (p === '/' || p === '/index.html') return PATH === '/' || PATH === '/index.html';
    return PATH.startsWith(p);
  });

  if (!isIncluded) return;

  console.log('[class-clock] Initializing');

  // Load the schedule module
  let getSchedule, getCurrentPeriod;
  try {
    const mod = await import('/web/class-schedule.js');
    getSchedule = mod.getSchedule;
    getCurrentPeriod = mod.getCurrentPeriod;
  } catch (err) {
    console.warn('[class-clock] Could not load class-schedule.js:', err.message);
    return;
  }

  // Fetch schedule
  let schedule;
  try {
    schedule = await getSchedule();
  } catch (err) {
    console.warn('[class-clock] Failed to fetch schedule:', err.message);
    return;
  }

  if (!schedule || !schedule.periods || schedule.periods.length === 0) {
    console.log('[class-clock] No schedule data, not showing bar');
    return;
  }

  /**
   * Escape HTML for safe insertion
   */
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
  }

  /**
   * Ordinal suffix for a number (1 → "1st", 2 → "2nd", etc.)
   */
  function ordinal(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return n + 'th';
    switch (n % 10) {
      case 1: return n + 'st';
      case 2: return n + 'nd';
      case 3: return n + 'rd';
      default: return n + 'th';
    }
  }

  /**
   * Format seconds to MM:SS or H:MM:SS if >= 3600s
   */
  function formatCountdown(totalSecs) {
    const s = Math.max(0, Math.floor(totalSecs));
    if (s >= 3600) {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  /**
   * Format current time as h:mm:ss A (12-hour with seconds)
   */
  function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  /**
   * Format date as "Sunday, February 22, 2026"
   */
  function formatDate(date) {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Build the period HTML fragment for the center section
   */
  function buildPeriodHtml(state, prefix) {
    const p = prefix || '';
    switch (state.status) {
      case 'in-class': {
        const dotClass = p + 'cc-dot cc-dot-green';
        const label = escapeHtml(state.period.label);
        const hourLabel = escapeHtml(ordinal(state.period.hour) + ' Hour');
        const countdown = formatCountdown(state.remainingSeconds);
        return `<span class="${dotClass}" aria-hidden="true"></span><strong>${hourLabel}</strong> — ${label} <span class="cc-countdown">(${countdown})</span>`;
      }
      case 'passing': {
        const dotClass = p + 'cc-dot cc-dot-yellow';
        const nextLabel = escapeHtml(ordinal(state.nextPeriod.hour) + ' hour');
        const countdown = formatCountdown(state.remainingSeconds);
        return `<span class="${dotClass}" aria-hidden="true"></span><strong>Passing Period</strong> <span class="cc-countdown">(${nextLabel} in ${countdown})</span>`;
      }
      case 'before-school': {
        const dotClass = p + 'cc-dot cc-dot-blue';
        const nextLabel = escapeHtml(ordinal(state.nextPeriod.hour) + ' hour');
        const countdown = formatCountdown(state.remainingSeconds);
        return `<span class="${dotClass}" aria-hidden="true"></span><strong>Before School</strong> <span class="cc-countdown">(${nextLabel} in ${countdown})</span>`;
      }
      case 'after-school':
        return `<span class="${p}cc-dot cc-dot-dim" aria-hidden="true"></span><strong>After School</strong>`;
      case 'no-school':
        return `<span class="${p}cc-dot cc-dot-dim" aria-hidden="true"></span><strong>No School Today</strong>`;
      default:
        return '';
    }
  }

  // ── VIEWER INTEGRATION ──────────────────────────────────────────────────────
  if (isViewer) {
    // On the viewer page, update the existing #viewerClock element
    // to show period info alongside the time. The viewer.js already handles
    // the basic clock, so we augment the pv-clock element.
    const pvClock = document.getElementById('viewerClock');
    if (!pvClock) {
      console.log('[class-clock] #viewerClock not found, skipping viewer integration');
      return;
    }

    // Insert a period element before the clock
    const periodEl = document.createElement('span');
    periodEl.id = 'ccViewerPeriod';
    periodEl.className = 'pv-clock-period';
    pvClock.parentNode.insertBefore(periodEl, pvClock);

    function tickViewer() {
      const now = new Date();
      const state = getCurrentPeriod(schedule, now);
      periodEl.innerHTML = buildPeriodHtml(state, '');
    }

    tickViewer();
    setInterval(tickViewer, 1000);
    return;
  }

  // ── STANDARD BAR ────────────────────────────────────────────────────────────

  // Find or create the clock bar element
  let bar = document.getElementById('classClock') || document.querySelector('.class-clock');

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'classClock';
    bar.className = 'class-clock';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'off');
    bar.setAttribute('aria-label', 'Class clock');

    // Inject into .tc-main, main, or .app-shell-content
    const container = document.querySelector('.tc-main') || document.querySelector('main') || document.querySelector('.app-shell-content');
    if (container) {
      container.insertBefore(bar, container.firstChild);
    } else {
      console.log('[class-clock] No container found, not showing bar');
      return;
    }
  }

  function tick() {
    const now = new Date();
    const state = getCurrentPeriod(schedule, now);

    const dateHtml = `<span class="class-clock-date">${escapeHtml(formatDate(now))}</span>`;
    const periodHtml = `<span class="class-clock-period">${buildPeriodHtml(state, '')}</span>`;
    const timeHtml = `<span class="class-clock-time">${escapeHtml(formatTime(now))}</span>`;

    bar.innerHTML = dateHtml + periodHtml + timeHtml;
  }

  tick();
  setInterval(tick, 1000);

  console.log('[class-clock] Bar initialized');
})();
