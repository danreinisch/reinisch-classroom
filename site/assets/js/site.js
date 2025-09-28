(function() {
  function injectMinimalStyles() {
    if (document.getElementById('copilot-inline-site-css')) return;
    const css = `
      /* Minimal, non-destructive global styles */
      h1, h2, h3, h4 { text-align: center; line-height: 1.2; margin: 0.6em 0; }
      /* Back button styles (clear and accessible) */
      .back-nav { display: flex; justify-content: center; margin: 0.5rem 0 1rem; }
      .back-button { display: inline-flex; align-items: center; gap:.5rem; padding:.6rem 1rem; border:1px solid #1a73e8; border-radius:.5rem; background:#1a73e8; color:#ffffff; text-decoration:none; }
      .back-button:hover { filter: brightness(1.05); }
    `;
    const style = document.createElement('style');
    style.id = 'copilot-inline-site-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getSection() {
    const meta = document.querySelector('meta[name="section"]');
    if (meta && meta.content) {
      const v = meta.content.toLowerCase();
      if (v.includes('language')) return 'language-arts';
      if (v.includes('life')) return 'life-skills';
    }
    const p = location.pathname.toLowerCase();
    if (p.includes('/language-arts/')) return 'language-arts';
    if (p.includes('/life-skills/')) return 'life-skills';
    // Presentations living outside section folders default to Language Arts
    if (p.includes('/presentations/')) return 'language-arts';
    return null;
  }

  function isSectionLandingPage(section) {
    const p = location.pathname.replace(/index\.html$/i, '').toLowerCase();
    const expected = '/' + section + '/';
    return p === expected;
  }

  function insertBackButton(section) {
    if (!section) return;
    if (isSectionLandingPage(section)) return; // no button on landing pages
    if (document.querySelector('.back-nav')) return; // avoid duplicates

    const label = section === 'language-arts' ? 'Language Arts' : 'Life Skills';
    const href = '/' + (section === 'language-arts' ? 'language-arts/' : 'life-skills/');

    const nav = document.createElement('nav');
    nav.className = 'back-nav';
    const a = document.createElement('a');
    a.className = 'back-button';
    a.href = href;
    a.setAttribute('aria-label', 'Back to ' + label);
    a.innerHTML = '<span aria-hidden="true">←</span><span>Back to ' + label + '</span>';
    nav.appendChild(a);

    const target = document.querySelector('main') || document.body;
    target.insertBefore(nav, target.firstChild);
  }

  function centerHeadings() {
    document.querySelectorAll('h1,h2,h3,h4').forEach(h => { h.style.textAlign = 'center'; });
  }

  // New: Wire Week 7/8 links on the A Door Into Time hub page
  function updateADITLinks() {
    if (!location.pathname.toLowerCase().includes('/language-arts/a-door-into-time/')) return;
    const mapping = {
      'Presentation 7': '/presentations/a-door-into-time/presentation-07/',
      'Presentation 8': '/presentations/a-door-into-time/presentation-08/'
    };
    document.querySelectorAll('a.slot').forEach(a => {
      const strong = a.querySelector('strong');
      if (!strong) return;
      const key = (strong.textContent || '').trim();
      if (mapping[key]) {
        a.href = mapping[key];
        const small = a.querySelector('small');
        if (small && /placeholder/i.test(small.textContent || '')) {
          small.textContent = 'Open presentation';
        }
      }
    });
  }

  function init() {
    injectMinimalStyles();
    const section = getSection();
    insertBackButton(section);
    centerHeadings();
    updateADITLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();