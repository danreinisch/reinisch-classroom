/* home-whats-new.js — What's New loader + Daily Quote for the home page */

const CATEGORY_NAMES = {
  toolkit: 'Language Arts Toolkit',
  adit: 'A Door Into Time',
  lik: 'Lost in Kragdon-ah',
  rfk: 'Return from Kragdon-ah',
  wok: 'Warrior of Kragdon-ah',
  life: 'Life Skills',
};

const QUOTES = [
  { text: 'The more that you read, the more things you will know. The more that you learn, the more places you\'ll go.', author: 'Dr. Seuss' },
  { text: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela' },
  { text: 'The beautiful thing about learning is that nobody can take it away from you.', author: 'B.B. King' },
  { text: 'You are braver than you believe, stronger than you seem, and smarter than you think.', author: 'A.A. Milne' },
  { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Believe you can and you\'re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
];

function renderWhatsNew(data) {
  const container = document.getElementById('whats-new-list');
  if (!container) return;

  const items = [];
  const categories = data.categories || {};

  for (const [key, cat] of Object.entries(categories)) {
    const displayName = CATEGORY_NAMES[key] || key;
    const titles = cat.titles || [];
    const links = cat.links || [];
    for (let i = titles.length - 1; i >= 0; i--) {
      if (titles[i] && links[i]) {
        items.push({ category: displayName, title: titles[i], link: links[i], slot: i });
      }
    }
  }

  // Sort by slot descending (most recent first within each batch already reversed above)
  // Then take top 6
  const top6 = items.slice(0, 6);

  if (top6.length === 0) {
    container.textContent = 'No recent updates found.';
    return;
  }

  container.innerHTML = '';
  for (const item of top6) {
    const a = document.createElement('a');
    a.href = '/viewer/?src=' + encodeURIComponent(item.link) + '&return=/';
    a.className = 'whats-new-item';

    const cat = document.createElement('span');
    cat.className = 'whats-new-category';
    cat.textContent = item.category;

    const title = document.createElement('span');
    title.className = 'whats-new-title';
    title.textContent = item.title;

    a.appendChild(cat);
    a.appendChild(title);
    container.appendChild(a);
  }
}

function renderQuote() {
  const container = document.getElementById('daily-quote');
  if (!container) return;

  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const p = document.createElement('p');
  p.className = 'home-quote-text';
  p.textContent = '\u201c' + q.text + '\u201d';

  const cite = document.createElement('p');
  cite.className = 'home-quote-author';
  cite.textContent = '\u2014 ' + q.author;

  container.innerHTML = '';
  container.appendChild(p);
  container.appendChild(cite);
}

function loadWhatsNew() {
  fetch('/assets/data/site-state.json?t=' + Date.now())
    .then(function(res) { return res.json(); })
    .then(function(data) { renderWhatsNew(data); })
    .catch(function() {
      const container = document.getElementById('whats-new-list');
      if (container) container.textContent = 'Unable to load recent updates.';
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    loadWhatsNew();
    renderQuote();
  });
} else {
  loadWhatsNew();
  renderQuote();
}
