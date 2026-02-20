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
  var now = new Date();
  var dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  var la = homeConfig.languageArts || {};
  var ls = homeConfig.lifeSkills || {};
  var announcements = homeConfig.announcements || [];
  var counts = countPresentations(siteState);

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var countdowns = homeConfig.countdowns || [];
  var upcomingCountdowns = countdowns.filter(function(item) {
    var endDate = item.endDate ? parseEventDate(item.endDate) : parseEventDate(item.date);
    return endDate >= today;
  });

  var items = [
    '[DATE] ' + dateStr,
  ];
  if (la.unit && la.currentWeek && la.currentTitle) {
    items.push('[LA] This Week: ' + la.unit + ' \u2014 Week ' + la.currentWeek + ': ' + la.currentTitle);
  }
  if (ls.currentTitle) {
    items.push('[LIFE] ' + ls.currentTitle);
  }
  if (la.unit && la.nextWeek && la.nextTitle) {
    items.push('[LA] Next Week: ' + la.unit + ' \u2014 Week ' + la.nextWeek + ': ' + la.nextTitle);
  }
  if (ls.nextTitle) {
    items.push('[LIFE] Up Next: ' + ls.nextTitle);
  }

  upcomingCountdowns.slice(0, 2).forEach(function(item) {
    var eventDate = parseEventDate(item.date);
    var endDate = item.endDate ? parseEventDate(item.endDate) : null;
    var typeLabel = item.type ? '[' + item.type.toUpperCase() + '] ' : '';
    if (endDate && today >= eventDate && today <= endDate) {
      items.push(typeLabel + item.label + ' \u2014 Enjoy!');
    } else {
      var daysLeft = Math.ceil((eventDate - today) / MS_PER_DAY);
      items.push(typeLabel + daysLeft + ' days until ' + item.label);
    }
  });

  for (var i = 0; i < announcements.length; i++) {
    items.push('[NEWS] ' + announcements[i]);
  }

  items.push('[TOTAL] ' + counts.total + ' presentations across all sections');

  var joined = items.join('  \u25C6  ');
  var full = joined + '  \u25C6  ' + joined;

  var tickerEl = document.querySelector('.ticker-content');
  if (tickerEl) tickerEl.textContent = full;
}

function init() {
  setGreeting();
  renderDailyQuote();

  var t = '?t=' + Date.now();
  var homeP = fetch('/assets/data/home-config.json' + t).then(function(r) { return r.json(); });
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
      if (tickerEl) tickerEl.textContent = '\uD83D\uDCC5 Reinisch Classroom \u25C6 Language Arts \u25C6 Life Skills \u25C6 Math Toolkit';
      var statsEl = document.getElementById('home-stats');
      if (statsEl) statsEl.textContent = '';
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
