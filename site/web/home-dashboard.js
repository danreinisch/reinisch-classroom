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

function renderStats(homeConfig, siteState) {
  var el = document.getElementById('home-stats');
  if (!el) return;
  var semEnd = new Date(homeConfig.semesterEnd + 'T00:00:00');
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var daysLeft = Math.ceil((semEnd - today) / (1000 * 60 * 60 * 24));
  var counts = countPresentations(siteState);
  el.textContent = '\uD83D\uDCC5 ' + daysLeft + ' days until end of semester \u00B7 \uD83D\uDCDA ' + counts.books + ' Books \u00B7 \uD83D\uDCA1 ' + counts.life + ' Life Skills \u00B7 \u270F\uFE0F ' + counts.toolkit + ' Toolkit Lessons \u00B7 ' + counts.total + ' total presentations';
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
}

function buildTicker(homeConfig, siteState) {
  var now = new Date();
  var dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  var la = homeConfig.languageArts || {};
  var ls = homeConfig.lifeSkills || {};
  var announcements = homeConfig.announcements || [];
  var counts = countPresentations(siteState);

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

  for (var i = 0; i < announcements.length; i++) {
    items.push('\uD83D\uDCE2 ' + announcements[i]);
  }

  items.push('\u2728 ' + counts.total + ' presentations across all sections');

  var joined = items.join('  \u2022  ');
  var full = joined + '  \u2022  ' + joined;

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
      renderStats(homeConfig, siteState);
    })
    .catch(function() {
      var tickerEl = document.querySelector('.ticker-content');
      if (tickerEl) tickerEl.textContent = '\uD83D\uDCC5 Reinisch Classroom \u2022 Language Arts \u2022 Life Skills \u2022 Math Toolkit';
      var statsEl = document.getElementById('home-stats');
      if (statsEl) statsEl.textContent = '';
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
