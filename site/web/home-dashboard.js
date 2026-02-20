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

    var pill = document.createElement('div');
    pill.className = 'countdown-pill';

    // Check if currently in a range event (e.g. Spring Break)
    if (endDate && today >= eventDate && today <= endDate) {
      pill.textContent = item.emoji + ' ' + item.label + ' \u2014 Enjoy!';
    } else {
      var daysLeft = Math.ceil((eventDate - today) / MS_PER_DAY);
      var daysSpan = document.createElement('span');
      daysSpan.className = 'countdown-days';
      daysSpan.textContent = daysLeft + ' days';
      pill.appendChild(document.createTextNode(item.emoji + ' '));
      pill.appendChild(daysSpan);
      pill.appendChild(document.createTextNode(' until ' + item.label));
    }

    el.appendChild(pill);
  });
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

  var parts = [];
  upcoming.slice(0, 2).forEach(function(item) {
    var eventDate = parseEventDate(item.date);
    var endDate = item.endDate ? parseEventDate(item.endDate) : null;
    if (endDate && today >= eventDate && today <= endDate) {
      parts.push(item.emoji + ' ' + item.label + ' \u2014 Enjoy!');
    } else {
      var daysLeft = Math.ceil((eventDate - today) / MS_PER_DAY);
      parts.push(item.emoji + ' ' + daysLeft + ' days until ' + item.label);
    }
  });

  parts.push('\uD83D\uDCDA ' + counts.books + ' Books');
  parts.push('\uD83D\uDCA1 ' + counts.life + ' Life Skills');
  parts.push('\u270F\uFE0F ' + counts.toolkit + ' Toolkit Lessons');
  parts.push(counts.total + ' total presentations');

  el.textContent = parts.join(' \u00B7 ');
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
    if (lifeCurrent) lifeCurrent.textContent = ls.currentTitle;
    var lifeNext = lifeEl.querySelector('.focus-next');
    if (lifeNext) lifeNext.textContent = ls.nextTitle;
    var lifeLink = lifeEl.querySelector('.focus-link');
    if (lifeLink && ls.unitLink) lifeLink.href = ls.unitLink;
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
    '\uD83D\uDCC5 ' + dateStr,
  ];
  if (la.unit && la.currentWeek && la.currentTitle) {
    items.push('\uD83D\uDCDA This Week: ' + la.unit + ' \u2014 Week ' + la.currentWeek + ': ' + la.currentTitle);
  }
  if (ls.currentTitle) {
    items.push('\uD83D\uDCA1 Life Skills: ' + ls.currentTitle);
  }
  if (la.unit && la.nextWeek && la.nextTitle) {
    items.push('\uD83D\uDCDA Next Week: ' + la.unit + ' \u2014 Week ' + la.nextWeek + ': ' + la.nextTitle);
  }
  if (ls.nextTitle) {
    items.push('\uD83D\uDCA1 Up Next: ' + ls.nextTitle);
  }

  upcomingCountdowns.slice(0, 2).forEach(function(item) {
    var eventDate = parseEventDate(item.date);
    var endDate = item.endDate ? parseEventDate(item.endDate) : null;
    if (endDate && today >= eventDate && today <= endDate) {
      items.push(item.emoji + ' ' + item.label + ' \u2014 Enjoy!');
    } else {
      var daysLeft = Math.ceil((eventDate - today) / MS_PER_DAY);
      items.push(item.emoji + ' ' + daysLeft + ' days until ' + item.label);
    }
  });

  for (var i = 0; i < announcements.length; i++) {
    items.push('\uD83D\uDCE2 ' + announcements[i]);
  }

  items.push('\u2728 ' + counts.total + ' presentations across all sections');

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
    .catch(function() {
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
