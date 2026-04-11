/* home-dashboard.js — Powers ALL dynamic content on the home page */

const QUOTES = [
  { text: "The more that you read, the more things you will know. The more that you learn, the more places you'll go.", author: "Dr. Seuss" },
  { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
  { text: "The beautiful thing about learning is that nobody can take it away from you.", author: "B.B. King" },
  { text: "You are braver than you believe, stronger than you seem, and smarter than you think.", author: "A.A. Milne" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "What we learn with pleasure we never forget.", author: "Alfred Mercier" },
];

function setGreeting() {
  var el = document.getElementById('home-greeting');
  if (!el) return;
  var h = new Date().getHours();
  if (h < 12) {
    el.textContent = 'Good morning,';
  } else if (h < 18) {
    el.textContent = 'Good afternoon,';
  } else {
    el.textContent = 'Good evening,';
  }
}

function renderDailyQuote() {
  var el = document.getElementById('daily-quote');
  if (!el) return;
  var now = new Date();
  var start = new Date(now.getFullYear(), 0, 0);
  var diff = now - start;
  var oneDay = 1000 * 60 * 60 * 24;
  var dayOfYear = Math.floor(diff / oneDay);
  var q = QUOTES[dayOfYear % QUOTES.length];
  var em = document.createElement('em');
  em.textContent = '\u201c' + q.text + '\u201d';
  var author = document.createElement('span');
  author.className = 'quote-author';
  author.textContent = '\u2014 ' + q.author;
  el.innerHTML = '';
  el.appendChild(em);
  el.appendChild(author);
}

var MS_PER_DAY = 1000 * 60 * 60 * 24;

function parseEventDate(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

function countPresentations(siteState) {
  var cats = siteState.categories || {};
  var counts = { books: 0, life: 0, toolkit: 0 };
  var total = 0;
  for (var key in cats) {
    var titles = cats[key].titles || [];
    var nonEmpty = titles.filter(function(t) { return t && t.trim() !== ''; }).length;
    if (key === 'life') {
      counts.life += nonEmpty;
    } else if (key === 'toolkit') {
      counts.toolkit += nonEmpty;
    } else {
      counts.books += nonEmpty;
    }
    total += nonEmpty;
  }
  counts.total = total;
  return counts;
}

function getCountdownSvg(type, size, extraAttr) {
  var w = size || 20;
  var extra = extraAttr ? ' ' + extraAttr : '';
  var svgOpen = '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + extra + '>';
  if (type === 'break') {
    return svgOpen + '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
  } else if (type === 'milestone') {
    return svgOpen + '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>';
  }
  // default: quarter → bar-chart
  return svgOpen + '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>';
}

function renderCountdowns(homeConfig) {
  var el = document.getElementById('home-countdowns');
  if (!el) return;
  var countdowns = homeConfig.countdowns || [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  el.innerHTML = '';
  countdowns.forEach(function(item) {
    var eventDate = parseEventDate(item.date);
    var endDate = item.endDate ? parseEventDate(item.endDate) : null;

    // Skip past events (event date + any end date is before today)
    var effectiveEnd = endDate || eventDate;
    if (effectiveEnd < today) return;

    var card = document.createElement('div');
    card.className = 'countdown-card';

    var iconEl = document.createElement('div');
    iconEl.className = 'countdown-card-icon';
    iconEl.innerHTML = getCountdownSvg(item.type);

    var bodyEl = document.createElement('div');
    bodyEl.className = 'countdown-card-body';

    var labelEl = document.createElement('div');
    labelEl.className = 'countdown-card-label';

    var daysEl = document.createElement('div');
    daysEl.className = 'countdown-card-days';

    // Check if currently in a range event (e.g. Spring Break)
    if (endDate && today >= eventDate && today <= endDate) {
      labelEl.textContent = item.label;
      daysEl.textContent = 'Enjoy!';
    } else {
      var daysLeft = Math.ceil((eventDate - today) / MS_PER_DAY);
      labelEl.textContent = item.label;
      daysEl.textContent = daysLeft + ' days';
    }

    bodyEl.appendChild(labelEl);
    bodyEl.appendChild(daysEl);
    card.appendChild(iconEl);
    card.appendChild(bodyEl);
    el.appendChild(card);
  });

  // Ensure the focus section is visible when countdowns are present
  if (el.children.length > 0) {
    var focusSection = document.getElementById('home-focus-section');
    if (focusSection) focusSection.style.display = '';
  }
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderStats(homeConfig, siteState) {
  var el = document.getElementById('home-stats');
  if (!el) return;
  var counts = countPresentations(siteState);
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var countdowns = homeConfig.countdowns || [];
  var upcoming = countdowns.filter(function(item) {
    var endDate = item.endDate ? parseEventDate(item.endDate) : parseEventDate(item.date);
    return endDate >= today;
  });

  var icoBook = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>';
  var icoBulb = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>';
  var icoPencil = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';

  var parts = [];
  upcoming.slice(0, 2).forEach(function(item) {
    var eventDate = parseEventDate(item.date);
    var endDate = item.endDate ? parseEventDate(item.endDate) : null;
    var ico = getCountdownSvg(item.type, 14, 'style="vertical-align:middle"');
    if (endDate && today >= eventDate && today <= endDate) {
      parts.push(ico + ' ' + escHtml(item.label) + ' \u2014 Enjoy!');
    } else {
      var daysLeft = Math.ceil((eventDate - today) / MS_PER_DAY);
      parts.push(ico + ' ' + escHtml(daysLeft) + ' days until ' + escHtml(item.label));
    }
  });

  parts.push(icoBook + ' ' + escHtml(counts.books) + ' Books');
  parts.push(icoBulb + ' ' + escHtml(counts.life) + ' Life Skills');
  parts.push(icoPencil + ' ' + escHtml(counts.toolkit) + ' Toolkit Lessons');
  parts.push(escHtml(counts.total) + ' total presentations');

  el.innerHTML = parts.join(' \u00B7 ');
}

function renderFocusCards(homeConfig) {
  var la = homeConfig.languageArts;
  var ls = homeConfig.lifeSkills;

  var laEl = document.getElementById('focus-la');
  if (laEl && la) {
    var laUnit = laEl.querySelector('.focus-unit');
    if (laUnit) laUnit.textContent = la.unit;
    var laCurrent = laEl.querySelector('.focus-current');
    if (laCurrent) laCurrent.textContent = 'Week ' + la.currentWeek + ': ' + la.currentTitle;
    var laNext = laEl.querySelector('.focus-next');
    if (laNext) laNext.textContent = 'Week ' + la.nextWeek + ' \u2014 ' + la.nextTitle;
    var laLink = laEl.querySelector('.focus-link');
    if (laLink && la.unitLink) laLink.href = la.unitLink;
  }

  var lifeEl = document.getElementById('focus-life');
  if (lifeEl && ls) {
    var lifeCurrent = lifeEl.querySelector('.focus-current');
    if (lifeCurrent) lifeCurrent.textContent = ls.currentTitle || 'Check back soon';
    var lifeNext = lifeEl.querySelector('.focus-next');
    if (lifeNext) lifeNext.textContent = ls.nextTitle || '';
    var lifeLink = lifeEl.querySelector('.focus-link');
    if (lifeLink && ls.unitLink) lifeLink.href = ls.unitLink;
    lifeEl.style.display = '';
  }

  // Show the focus section now that data has loaded
  var focusSection = document.getElementById('home-focus-section');
  if (focusSection && (la || ls)) {
    focusSection.style.display = '';
  }
}

function buildTicker(homeConfig, siteState) {
  var ticker = homeConfig && homeConfig.ticker;
  var items = [];

  // Trusted SVG icon strings (hardcoded constants — never sourced from user input or config)
  var ICON_LA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>';
  var ICON_LIFE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>';
  var ICON_CALC = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle"><rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="16" y1="14" x2="16" y2="18"></line><path d="M16 10h.01"></path><path d="M12 10h.01"></path><path d="M8 10h.01"></path><path d="M12 14h.01"></path><path d="M8 14h.01"></path><path d="M12 18h.01"></path><path d="M8 18h.01"></path></svg>';

  if (ticker) {
    var now = new Date();

    // Date segment
    if (ticker.dateFormat && ticker.dateFormat !== 'none') {
      var fmt = ticker.dateFormat;
      var dateStr;
      if (fmt === 'Day, Month DD, YYYY') {
        dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      } else if (fmt === 'Month DD, YYYY') {
        dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      } else {
        // Numeric formats: MM/DD/YYYY, MM/DD/YY, M/D/YYYY, M/D/YY
        var m = now.getMonth() + 1;
        var d = now.getDate();
        var y = now.getFullYear();
        var mm = fmt.startsWith('MM') ? String(m).padStart(2, '0') : String(m);
        var dd = fmt.indexOf('/DD/') !== -1 ? String(d).padStart(2, '0') : String(d);
        var yr = fmt.endsWith('YYYY') ? String(y) : String(y).slice(-2);
        dateStr = mm + '/' + dd + '/' + yr;
      }
      if (dateStr) items.push(escHtml(dateStr));
    }

    // Time segment
    if (ticker.timeFormat && ticker.timeFormat !== 'none') {
      var hours = now.getHours();
      var mins = String(now.getMinutes()).padStart(2, '0');
      var timeStr;
      if (ticker.timeFormat === 'HH:mm') {
        timeStr = String(hours).padStart(2, '0') + ':' + mins;
      } else {
        // h:mm AM/PM
        var ampm = hours >= 12 ? 'PM' : 'AM';
        var h12 = hours % 12 || 12;
        timeStr = h12 + ':' + mins + ' ' + ampm;
      }
      if (timeStr) items.push(escHtml(timeStr));
    }

    // Unified items array (new format)
    var tickerItems = ticker.items || [];

    // Backwards compatibility: migrate old languageArts / lifeSkills / custom fields
    if (tickerItems.length === 0) {
      if (ticker.languageArts && ticker.languageArts.trim()) {
        tickerItems.push({ category: 'language-arts', text: ticker.languageArts.trim() });
      }
      if (ticker.lifeSkills && ticker.lifeSkills.trim()) {
        tickerItems.push({ category: 'life-skills', text: ticker.lifeSkills.trim() });
      }
      var custom = ticker.custom || [];
      for (var j = 0; j < custom.length; j++) {
        if (custom[j] && custom[j].trim()) tickerItems.push({ category: 'none', text: custom[j].trim() });
      }
    }

    for (var i = 0; i < tickerItems.length; i++) {
      var item = tickerItems[i];
      if (!item.text || !item.text.trim()) continue;
      var icon = '';
      if (item.category === 'language-arts') icon = ICON_LA + ' ';
      else if (item.category === 'life-skills') icon = ICON_LIFE + ' ';
      else if (item.category === 'math-toolkit') icon = ICON_CALC + ' ';
      items.push(icon + escHtml(item.text.trim()));
    }
  } else {
    // No ticker config
    items.push('Welcome to Reinisch Classroom');
  }

  var joined = items.join('  \u25C6  ');
  var full = joined + '  \u25C6  ';

  var tickerEls = document.querySelectorAll('.ticker-content');
  for (var k = 0; k < tickerEls.length; k++) {
    tickerEls[k].innerHTML = full;
  }

  var trackEl = document.querySelector('.ticker-track');
  if (trackEl) {
    var speed = (ticker && ticker.speed) || 45;
    trackEl.style.animationDuration = speed + 's';
    updateTickerOffset(trackEl);
  }
}

function updateTickerOffset(trackEl) {
  var firstSpan = trackEl.querySelector('.ticker-content');
  if (firstSpan) {
    trackEl.style.setProperty('--ticker-offset', '-' + firstSpan.offsetWidth + 'px');
  }
}

var _tickerResizeTimer;
window.addEventListener('resize', function() {
  clearTimeout(_tickerResizeTimer);
  _tickerResizeTimer = setTimeout(function() {
    var trackEl = document.querySelector('.ticker-track');
    if (trackEl) updateTickerOffset(trackEl);
  }, 100);
});

// ── Standards Focus Card ──────────────────────────────────────────────────────
// Fetches DESE rollup data and renders a compact "Standards Focus" card on the
// home dashboard when there are critical or needs-support standards.
// Only fires when the user has a Supabase (teacher) session.

function hdGetTier(pct) {
  if (pct >= 80) return 'excellent';
  if (pct >= 60) return 'on-track';
  if (pct >= 40) return 'needs-support';
  return 'critical';
}

function hdCurrentSchoolYear() {
  var now = new Date();
  return (now.getMonth() + 1) >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

function renderStandardsFocusCard() {
  var cardEl = document.getElementById('focus-standards');
  if (!cardEl) return;

  import('/web/supabase-client.js').then(function(mod) {
    return mod.getSupabase();
  }).then(function(supabase) {
    if (!supabase) return; // Not a teacher session — leave card hidden

    return supabase.rpc('all_students_dese_rollups', {
      p_school_year: hdCurrentSchoolYear(),
    }).then(function(result) {
      if (result.error || !Array.isArray(result.data) || result.data.length === 0) return;

      var rows = result.data;

      // Aggregate per-standard: average percent_correct across all students
      var stdAccum = {};
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var std = row.dese_code;
        var pct = Number(row.percent_correct);
        if (!std || isNaN(pct)) continue;
        if (!stdAccum[std]) stdAccum[std] = { sum: 0, count: 0 };
        stdAccum[std].sum += pct;
        stdAccum[std].count++;
      }

      // Build list of standards with their average pct and tier
      var standards = [];
      for (var code in stdAccum) {
        if (!Object.hasOwn(stdAccum, code)) continue;
        var avg = Math.round(stdAccum[code].sum / stdAccum[code].count);
        var tier = hdGetTier(avg);
        if (tier === 'critical' || tier === 'needs-support') {
          standards.push({ code: code, pct: avg, tier: tier });
        }
      }

      if (standards.length === 0) return; // All good — keep card hidden

      // Sort by pct ascending (worst first)
      standards.sort(function(a, b) { return a.pct - b.pct; });

      var critCount = standards.filter(function(s) { return s.tier === 'critical'; }).length;
      var needsCount = standards.filter(function(s) { return s.tier === 'needs-support'; }).length;
      var overallSeverity = critCount > 0 ? 'critical' : 'needs-support';

      // Top 3 worst standards
      var topStds = standards.slice(0, 3);

      // Build card HTML
      var alertIcon = overallSeverity === 'critical'
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

      var labelColor = overallSeverity === 'critical' ? '#fca5a5' : '#fde68a';
      var borderColor = overallSeverity === 'critical'
        ? 'rgba(239, 68, 68, 0.5)'
        : 'rgba(234, 179, 8, 0.5)';

      var countHtml = '';
      if (critCount > 0) {
        countHtml += '<span class="hd-standards-count-item tier-critical">' + critCount + ' critical</span>';
      }
      if (needsCount > 0) {
        countHtml += '<span class="hd-standards-count-item tier-needs-support">' + needsCount + ' needs-support</span>';
      }

      var listHtml = topStds.map(function(s) {
        var itemIcon = s.tier === 'critical'
          ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
          : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        var color = s.tier === 'critical' ? '#fca5a5' : '#fde68a';
        return '<div class="hd-standards-list-item" style="color:' + color + '">' +
          itemIcon +
          ' <span class="hd-std-code">' + escHtml(s.code) + '</span>' +
          ' <span class="hd-std-pct">— ' + s.pct + '%</span>' +
          '</div>';
      }).join('');

      cardEl.innerHTML =
        '<div class="focus-label" style="color:' + labelColor + '">' + alertIcon + ' STANDARDS FOCUS</div>' +
        '<div class="hd-standards-count">' + countHtml + '</div>' +
        '<div class="hd-standards-list">' + listHtml + '</div>' +
        '<a class="hd-standards-link" href="/teacher/">View Details →</a>';

      cardEl.style.borderLeft = '3px solid ' + borderColor;
      cardEl.style.display = '';

      // Ensure focus section is visible
      var focusSection = document.getElementById('home-focus-section');
      if (focusSection) focusSection.style.display = '';

      console.log('[home-dashboard] Standards Focus card rendered —', standards.length, 'standard(s) needing attention');
    });
  }).catch(function(err) {
    // Non-blocking — just silently omit the card if anything fails
    console.warn('[home-dashboard] Standards Focus card failed to load:', err);
  });
}

function init() {
  setGreeting();
  renderDailyQuote();

  // Attempt to load Standards Focus card (teacher-only, non-blocking)
  renderStandardsFocusCard();

  var t = '?t=' + Date.now();

  // Try Supabase first (for Smart TV and cross-device access), fall back to static JSON + localStorage
  var homeP = import('/web/data-adapter.js').then(function(mod) {
    return mod.isRemote().then(function(remote) {
      if (remote) {
        return mod.db.getAppConfig('home_config').then(function(cfg) {
          if (cfg && typeof cfg === 'object') return cfg;
          // Remote returned null, fall through to static+localStorage
          return null;
        }).catch(function() { return null; });
      }
      return null;
    });
  }).catch(function() { return null; }).then(function(remoteConfig) {
    if (remoteConfig && typeof remoteConfig === 'object') {
      return remoteConfig;
    }

    // Fallback: static JSON + localStorage overlay (original behavior)
    var localOverrides = null;
    try {
      var raw = localStorage.getItem('rc_home_config');
      if (raw) localOverrides = JSON.parse(raw);
    } catch(_) { /* noop */ }

    return fetch('/assets/data/home-config.json' + t).then(function(r) { return r.json(); }).then(function(base) {
      if (localOverrides && typeof localOverrides === 'object' && !Array.isArray(localOverrides)) {
        for (var key in localOverrides) {
          if (Object.hasOwn(localOverrides, key)) {
            base[key] = localOverrides[key];
          }
        }
      }
      return base;
    });
  });
  var stateP = fetch('/assets/data/site-state.json' + t).then(function(r) { return r.json(); });

  Promise.all([homeP, stateP])
    .then(function(results) {
      var homeConfig = results[0];
      var siteState = results[1];
      buildTicker(homeConfig, siteState);
      renderFocusCards(homeConfig);
      renderCountdowns(homeConfig);
      renderStats(homeConfig, siteState);
    })
    .catch(function(err) {
      console.warn('[home-dashboard] Failed to load config:', err);
      var tickerEl = document.querySelector('.ticker-content');
      if (tickerEl) tickerEl.textContent = 'Welcome to Reinisch Classroom';
      var statsEl = document.getElementById('home-stats');
      if (statsEl) statsEl.textContent = '';
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
