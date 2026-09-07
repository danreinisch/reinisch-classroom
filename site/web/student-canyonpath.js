(() => {
  'use strict';

  let observer = null;
  let scheduled = false;

  const ICONS = Object.freeze({
    skillBuilder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6Z"/><path d="M15 3v4h4"/><path d="M9 11h6"/><path d="M9 15h6"/></svg>',
    wordSearch: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="M8 9h5"/><path d="M8 12h3"/></svg>',
    chess: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 20h9"/><path d="M9 17h7"/><path d="M10 17c0-3 1-4 3-5l-2-3 1-4 4 2 2 4-3 3c1 1 1 2 1 3"/><path d="M12 5 9 3"/></svg>',
    four: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="16" cy="9" r="1.6"/><circle cx="8" cy="14" r="1.6"/><circle cx="12" cy="14" r="1.6"/><circle cx="16" cy="14" r="1.6"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6"/></svg>',
  });

  const QUICK_ACTIVITIES = Object.freeze([
    {
      title: 'Skill Builder',
      note: 'Reading, language, and writing practice',
      icon: ICONS.skillBuilder,
      href: '/viewer/?src=%2Fpresentations%2Flanguage-arts-toolkit%2Fpresentation-01%2Ffinal_exam_skill_builder_20q_feedback.html&return=%2Fstudent%2F%3Ftab%3Ddashboard&title=Language%20Arts%20Skill%20Builder&activity=1',
    },
    {
      title: 'Word Search',
      note: 'Thirty themes for quick vocabulary practice',
      icon: ICONS.wordSearch,
      href: '/viewer/?src=%2Fpresentations%2Flanguage-arts-toolkit%2Fpresentation-03%2F&return=%2Fstudent%2F%3Ftab%3Ddashboard&title=Word%20Search&activity=1',
    },
    {
      title: 'Classroom Chess',
      note: 'Play, learn, and try chess challenges',
      icon: ICONS.chess,
      href: '/viewer/?src=%2Factivities%2Fchess%2F&return=%2Fstudent%2F%3Ftab%3Ddashboard&title=Classroom%20Chess&activity=1',
    },
    {
      title: 'Four in a Row',
      note: 'Fast strategy practice against a friend or computer',
      icon: ICONS.four,
      href: '/viewer/?src=%2Factivities%2Ffour-in-a-row%2F&return=%2Fstudent%2F%3Ftab%3Ddashboard&title=Four%20in%20a%20Row&activity=1',
    },
  ]);

  function enableCanyonPathShell() {
    if (!document.body) return;
    document.body.classList.add('rc-canyonpath', 'rc-canyonpath--detailed', 'rc-student-canyonpath');
  }

  function ensureProfileIcon() {
    const avatar = document.getElementById('profileAvatar');
    if (!avatar || avatar.dataset.stcpIconReady === 'true') return;
    avatar.innerHTML = ICONS.user;
    avatar.dataset.stcpIconReady = 'true';
  }

  function ensureHero() {
    const dashboard = document.querySelector('#tabDashboard > .st-dashboard-content');
    if (!dashboard || dashboard.dataset.stcpHeroReady === 'true') return;

    const welcome = dashboard.querySelector(':scope > .st-welcome-header');
    const summary = dashboard.querySelector(':scope > .st-summary-cards');
    if (!welcome || !summary) return;

    const hero = document.createElement('section');
    hero.className = 'stcp-hero';
    hero.setAttribute('aria-label', 'Student Portal overview');

    const copy = document.createElement('div');
    copy.className = 'stcp-hero__copy';

    const aside = document.createElement('div');
    aside.className = 'stcp-hero__aside';

    const motto = document.createElement('div');
    motto.className = 'stcp-hero__motto';
    motto.setAttribute('aria-hidden', 'true');
    motto.innerHTML = 'Keep learning today.<br>Build a brighter tomorrow.';

    welcome.before(hero);
    copy.appendChild(welcome);
    aside.appendChild(summary);

    const streak = document.getElementById('dashStreakBanner');
    if (streak) aside.appendChild(streak);

    hero.append(copy, aside, motto);
    dashboard.dataset.stcpHeroReady = 'true';
  }

  function makeQuickActivity(activity) {
    const link = document.createElement('a');
    link.className = 'stcp-quick__link';
    link.href = activity.href;

    const icon = document.createElement('span');
    icon.className = 'stcp-quick__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = activity.icon;

    const copy = document.createElement('span');
    copy.className = 'stcp-quick__copy';
    const title = document.createElement('strong');
    title.textContent = activity.title;
    const note = document.createElement('span');
    note.textContent = activity.note;
    copy.append(title, note);

    const chevron = document.createElement('span');
    chevron.className = 'stcp-quick__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '›';

    link.append(icon, copy, chevron);
    return link;
  }

  function ensureQuickActivities() {
    const dashboard = document.querySelector('#tabDashboard > .st-dashboard-content');
    if (!dashboard || dashboard.querySelector(':scope > .stcp-quick')) return;

    const firstSection = dashboard.querySelector(':scope > .st-section');
    if (!firstSection) return;

    const section = document.createElement('section');
    section.className = 'stcp-quick';
    section.setAttribute('aria-labelledby', 'stcpQuickTitle');

    const head = document.createElement('div');
    head.className = 'stcp-quick__head';
    const headCopy = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'stcp-quick__eyebrow';
    eyebrow.textContent = 'QUICK ACTIVITIES';
    const heading = document.createElement('h2');
    heading.id = 'stcpQuickTitle';
    heading.textContent = 'Jump into extra practice';
    headCopy.append(eyebrow, heading);

    const note = document.createElement('span');
    note.className = 'stcp-quick__note';
    note.textContent = 'Optional practice · opens in the activity viewer';
    head.append(headCopy, note);

    const grid = document.createElement('div');
    grid.className = 'stcp-quick__grid';
    QUICK_ACTIVITIES.forEach((activity) => grid.appendChild(makeQuickActivity(activity)));

    section.append(head, grid);
    firstSection.before(section);
  }

  function ensureDashboardGrid() {
    const dashboard = document.querySelector('#tabDashboard > .st-dashboard-content');
    if (!dashboard || dashboard.querySelector(':scope > .stcp-dashboard-grid')) return;

    const recent = document.getElementById('dashRecentAssignments')?.closest('.st-section');
    const performance = document.getElementById('dashPerfChartSection');
    const goals = document.getElementById('dashGoalsSnapshot')?.closest('.st-section');
    const sections = [recent, performance, goals].filter(Boolean);
    if (!sections.length) return;

    const grid = document.createElement('div');
    grid.className = 'stcp-dashboard-grid';
    sections[0].before(grid);

    sections.forEach((section) => grid.appendChild(section));

    if (recent) {
      recent.classList.add('stcp-panel--assignments');
      recent.dataset.stcpEyebrow = 'ASSIGNMENT SNAPSHOT';
    }
    if (performance) {
      performance.classList.add('stcp-panel--progress');
      performance.dataset.stcpEyebrow = 'RECENT PROGRESS';
    }
    if (goals) {
      goals.classList.add('stcp-panel--goals');
      goals.dataset.stcpEyebrow = 'GOAL PROGRESS';
    }
  }

  function ensureFooter() {
    const dashboard = document.querySelector('#tabDashboard > .st-dashboard-content');
    if (!dashboard || dashboard.querySelector(':scope > .stcp-footer')) return;

    const footer = document.createElement('section');
    footer.className = 'stcp-footer';
    footer.setAttribute('aria-label', 'Student Portal encouragement');

    const lead = document.createElement('div');
    lead.className = 'stcp-footer__lead';
    const strong = document.createElement('strong');
    strong.textContent = 'Keep going.';
    const small = document.createElement('span');
    small.textContent = 'Every question builds your skills.';
    lead.append(strong, small);

    const brand = document.createElement('div');
    brand.className = 'stcp-footer__brand';
    brand.innerHTML = 'Reinisch Classroom<br>Clearer thinking. Brighter tomorrow.';

    footer.append(lead, brand);
    dashboard.appendChild(footer);
  }

  function enhance() {
    scheduled = false;
    enableCanyonPathShell();
    ensureProfileIcon();
    ensureHero();
    ensureQuickActivities();
    ensureDashboardGrid();
    ensureFooter();
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

  window.RCStudentCanyonPath = Object.freeze({ enhance });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
