(() => {
  'use strict';

  let observer = null;
  let scheduled = false;

  const ICONS = Object.freeze({
    skillBuilder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6Z"/><path d="M15 3v4h4"/><path d="M9 11h6"/><path d="M9 15h6"/></svg>',
    wordSearch: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="M8 9h5"/><path d="M8 12h3"/></svg>',
    chess: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 20h9"/><path d="M9 17h7"/><path d="M10 17c0-3 1-4 3-5l-2-3 1-4 4 2 2 4-3 3c1 1 1 2 1 3"/><path d="M12 5 9 3"/></svg>',
    four: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="16" cy="9" r="1.6"/><circle cx="8" cy="14" r="1.6"/><circle cx="12" cy="14" r="1.6"/><circle cx="16" cy="14" r="1.6"/></svg>',
  });

  const ACTIVITY_ICONS = Object.freeze({
    'Word Search': ICONS.wordSearch,
    'Language Arts Skill Builder': ICONS.skillBuilder,
    'Classroom Chess': ICONS.chess,
    'Four in a Row': ICONS.four,
  });

  const PAGE_EYEBROWS = Object.freeze({
    tabAssignments: 'STUDENT PORTAL · ASSIGNMENTS',
    tabLibrary: 'STUDENT PORTAL · LIBRARY',
    tabResources: 'STUDENT PORTAL · RESOURCES',
    tabActivities: 'STUDENT PORTAL · ACTIVITIES',
    tabGrades: 'STUDENT PORTAL · PROGRESS',
    tabGoals: 'STUDENT PORTAL · GOALS',
    tabSettings: 'STUDENT PORTAL · SETTINGS',
  });

  function switchStudentTab(tabName) {
    const target =
      document.querySelector(`.tc-sidebar [data-tab="${tabName}"]`) ||
      document.querySelector(`.st-tab-nav [data-tab="${tabName}"]`) ||
      document.querySelector(`[data-tab="${tabName}"]`);
    if (target) target.click();
  }

  function ensurePageHeroes() {
    Object.entries(PAGE_EYEBROWS).forEach(([panelId, eyebrow]) => {
      const panel = document.getElementById(panelId);
      const content = panel?.querySelector(':scope > .st-dashboard-content');
      if (!content || content.dataset.stcpPageHeroReady === 'true') return;

      const heading = Array.from(content.children).find((node) => node.tagName === 'H1');
      if (!heading) return;

      const subtitle = heading.nextElementSibling?.tagName === 'P' ? heading.nextElementSibling : null;
      const hero = document.createElement('header');
      hero.className = 'stcp-page-hero';
      hero.dataset.stcpEyebrow = eyebrow;

      heading.before(hero);
      hero.appendChild(heading);
      if (subtitle) hero.appendChild(subtitle);

      content.dataset.stcpPageHeroReady = 'true';
    });
  }

  function replaceActivityEmojiIcons() {
    document.querySelectorAll('#tabActivities .st-activity-card').forEach((card) => {
      const title = card.querySelector('.st-activity-card__title')?.textContent?.trim();
      const icon = card.querySelector('.st-activity-card__icon');
      if (!title || !icon || icon.dataset.stcpSvgReady === 'true') return;
      const svg = ACTIVITY_ICONS[title];
      if (!svg) return;
      icon.innerHTML = svg;
      icon.dataset.stcpSvgReady = 'true';
    });
  }

  function compactDashboardGoals() {
    const container = document.getElementById('dashGoalsSnapshot');
    if (!container) return;

    const cards = Array.from(container.children).filter((node) =>
      node instanceof HTMLElement && node.matches('.sgp-card, .st-goal-card')
    );
    if (!cards.length) return;

    const visibleLimit = 2;
    cards.forEach((card, index) => {
      card.hidden = index >= visibleLimit;
      card.dataset.stcpDashboardGoal = index < visibleLimit ? 'visible' : 'overflow';
    });

    let more = container.querySelector(':scope > .stcp-goals-more');
    if (cards.length <= visibleLimit) {
      more?.remove();
      return;
    }

    if (!more) {
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'stcp-goals-more';
      more.addEventListener('click', () => switchStudentTab('goals'));
      container.appendChild(more);
    }
    more.textContent = `View all ${cards.length} goals`;
  }

  function enhance() {
    scheduled = false;
    ensurePageHeroes();
    replaceActivityEmojiIcons();
    compactDashboardGoals();
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(enhance);
  }

  function init() {
    scheduleEnhance();
    if (!observer && document.body) {
      observer = new MutationObserver(scheduleEnhance);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.RCStudentCanyonPathRefine = Object.freeze({
    enhance,
    switchStudentTab,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
