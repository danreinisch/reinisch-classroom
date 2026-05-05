(function () {
  function attachGlow(cards) {
    cards.forEach(function (card) {
      card.style.setProperty('--glow-color', 'rgba(52,211,153,0.5)');
      card.addEventListener('click', function () {
        card.classList.remove('rc-card-glow-active');
        void card.offsetWidth;
        card.classList.add('rc-card-glow-active');
        card.addEventListener('animationend', function () { card.classList.remove('rc-card-glow-active'); }, { once: true });
      });
    });
  }

  var grid = document.getElementById('la-toolkit-grid');
  if (!grid) return;
  attachGlow(Array.from(grid.querySelectorAll('.rc-card')));

  fetch('/assets/data/site-state.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var tk = data && data.categories && data.categories.toolkit;
      if (!tk) return;
      var titles = tk.titles;
      var links = tk.links;
      if (!Array.isArray(titles) || !titles.length || !Array.isArray(links) || !links.length) return;

      var newCards = [];
      for (var i = 0; i < titles.length; i++) {
        var title = titles[i];
        var link = links[i];
        if (!title || !link) continue;
        if (typeof link !== 'string' || link.charAt(0) !== '/') continue;
        var a = document.createElement('a');
        a.className = 'rc-card';
        a.href = '/viewer/?src=' + encodeURIComponent(link) + '&title=' + encodeURIComponent(title);
        var iconDiv = document.createElement('div');
        iconDiv.className = 'card-icon';
        iconDiv.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
        var strong = document.createElement('strong');
        strong.textContent = title;
        a.appendChild(iconDiv);
        a.appendChild(strong);
        newCards.push(a);
      }
      if (!newCards.length) return;

      grid.innerHTML = '';
      newCards.forEach(function (c) { grid.appendChild(c); });
      attachGlow(newCards);
    })
    .catch(function () {});
}());
