(function() {
  function getSection() {
    // Optional override via <meta name="section" content="language-arts|life-skills">
    const meta = document.querySelector('meta[name="section"]');
    if (meta && meta.content) {
      const v = meta.content.toLowerCase();
      if (v.includes('language')) return 'language-arts';
      if (v.includes('life')) return 'life-skills';
    }
    // Infer from URL
    const p = location.pathname.toLowerCase();
    if (p.includes('/language-arts/')) return 'language-arts';
    if (p.includes('/life-skills/')) return 'life-skills';
    return null;
  }

  function getSiteBase() {
    // If URL contains "/site/", keep that prefix; otherwise assume root
    const p = location.pathname;
    const i = p.indexOf('/site/');
    if (i >= 0) return p.slice(0, i + 6); // includes trailing "/site/"
    return '/';
  }

  function isSectionLandingPage(section, siteBase) {
    const p = location.pathname.toLowerCase();
    const sectionPath = (siteBase.toLowerCase() + section + '/').replace(/\/+/, '/');
    return p === sectionPath || p === sectionPath + 'index.html';
  }

  function insertBackButton(section) {
    if (!section) return;
    const siteBase = getSiteBase();

    // Skip landing pages (no back button on the main Language Arts / Life Skills index pages)
    if (isSectionLandingPage(section, siteBase)) return;

    const label = section === 'language-arts' ? 'Language Arts' : 'Life Skills';
    const href = siteBase + (section === 'language-arts' ? 'language-arts/' : 'life-skills/');
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
    // CSS handles this, but this ensures legacy inline styles don't fight it
    document.querySelectorAll('h1,h2,h3,h4').forEach(h => { h.style.textAlign = 'center'; });
  }

  function initializeNavigation() {
    const section = getSection();
    insertBackButton(section);
    centerHeadings();
  }

  // Run immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNavigation);
  } else {
    initializeNavigation();
  }
})();