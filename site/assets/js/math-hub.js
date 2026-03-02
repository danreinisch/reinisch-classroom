(function () {
  var CATEGORIES = [
    { id: 'math_geo',   title: 'Geometry',          path: '/math-toolkit/geometry/' },
    { id: 'math_alg',   title: 'Algebra',           path: '/math-toolkit/algebra/' },
    { id: 'math_num',   title: 'Number Sense',      path: '/math-toolkit/number-sense/' },
    { id: 'math_data',  title: 'Data & Statistics', path: '/math-toolkit/data-statistics/' },
    { id: 'math_money', title: 'Money Math',        path: '/math-toolkit/money-math/' },
    { id: 'math_gen',   title: 'General Math',      path: '/math-toolkit/general/' }
  ];

  var MATH_ICON = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

  function hasContent(cat) {
    return cat && Array.isArray(cat.links) && cat.links.some(function (l) { return l && l.trim() !== ''; });
  }

  fetch('/assets/data/site-state.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : { categories: {} }; })
    .catch(function () { return { categories: {} }; })
    .then(function (state) {
      var cats = state.categories || {};
      var grid = document.getElementById('mathGrid');
      var empty = document.getElementById('emptyState');
      var shown = 0;

      CATEGORIES.forEach(function (c) {
        if (!hasContent(cats[c.id])) return;
        shown++;
        var a = document.createElement('a');
        a.className = 'book-card';
        a.href = c.path;
        a.innerHTML = '<div class="book-icon">' + MATH_ICON + '</div><strong class="book-title">' + c.title + '</strong>';
        grid.appendChild(a);
      });

      if (shown === 0) {
        empty.hidden = false;
      }
    });
}());
