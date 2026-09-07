(() => {
  'use strict';

  const DASHBOARD_LIMIT = 4;
  const HISTORY_PAGE_SIZE = 12;
  const MONTH_DATE_RE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i;
  const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/;

  let observer = null;
  let scheduled = false;
  let quarterApiPromise = null;

  function quarterApi() {
    if (!quarterApiPromise) {
      quarterApiPromise = import('/web/quarter-utils.js').catch(() => null);
    }
    return quarterApiPromise;
  }

  function switchStudentTab(tabName) {
    const target =
      document.querySelector(`.tc-sidebar [data-tab="${tabName}"]`) ||
      document.querySelector(`.st-tab-nav [data-tab="${tabName}"]`) ||
      document.querySelector(`[data-tab="${tabName}"]`);

    if (target) target.click();
  }

  function makeSectionHead(section, buttonText, onClick) {
    if (!section || section.querySelector(':scope > .stp-section-head')) return;
    const heading = section.querySelector(':scope > h2');
    if (!heading) return;

    const wrap = document.createElement('div');
    wrap.className = 'stp-section-head';
    heading.before(wrap);
    wrap.appendChild(heading);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stp-section-link';
    button.textContent = buttonText;
    button.addEventListener('click', onClick);
    wrap.appendChild(button);
  }

  function enhanceDashboard() {
    const recent = document.getElementById('dashRecentAssignments');
    if (!recent) return;

    const cards = Array.from(recent.children).filter((node) =>
      node instanceof HTMLElement &&
      node.matches('.st-assignment-card, .assignment-card')
    );

    cards.forEach((card, index) => {
      if (index >= DASHBOARD_LIMIT) {
        card.dataset.stpDashboardOverflow = 'true';
        card.setAttribute('aria-hidden', 'true');
      } else {
        delete card.dataset.stpDashboardOverflow;
        card.removeAttribute('aria-hidden');
      }
    });

    const section = recent.closest('.st-section');
    makeSectionHead(section, 'View All Assignments →', () => switchStudentTab('assignments'));
  }

  function ensureGradeSnapshot(root) {
    if (!root || root.querySelector(':scope > .stp-grade-snapshot')) return;

    const average = root.querySelector(':scope > .st-average-display');
    const quarters = root.querySelector(':scope > .st-quarter-section');
    if (!average || !quarters) return;

    const snapshot = document.createElement('section');
    snapshot.className = 'stp-grade-snapshot';
    snapshot.setAttribute('aria-label', 'Grade snapshot');

    const head = document.createElement('div');
    head.className = 'stp-grade-snapshot-head';

    const title = document.createElement('h2');
    title.textContent = 'Grade Snapshot';
    const sub = document.createElement('p');
    sub.textContent = 'Your overall average and quarterly performance';

    head.append(title, sub);
    snapshot.appendChild(head);
    average.before(snapshot);
    snapshot.append(average, quarters);
  }

  function parseDateFromText(text) {
    const safe = String(text || '');
    const match = safe.match(MONTH_DATE_RE) || safe.match(ISO_DATE_RE);
    if (!match) return null;
    const date = new Date(match[0]);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function gradeRowModel(row) {
    const title =
      row.querySelector('.st-grade-info h4, h4, .assignment-title, .assignment-card-title')?.textContent?.trim() ||
      row.textContent?.trim() ||
      '';

    const className =
      row.querySelector('.st-class-badge, [data-class-name]')?.textContent?.trim() ||
      '';

    const date =
      parseDateFromText(row.dataset.submittedAt) ||
      parseDateFromText(row.dataset.date) ||
      parseDateFromText(row.querySelector('.st-grade-meta')?.textContent) ||
      parseDateFromText(row.textContent);

    const scoreText = row.querySelector('.st-grade-score')?.textContent || '';
    const scoreMatch = scoreText.match(/-?\d+(?:\.\d+)?/);
    const score = scoreMatch ? Number(scoreMatch[0]) : null;

    return { row, title, className, date, score };
  }

  function currentSchoolYearText() {
    const now = new Date();
    const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return `${start}–${String(start + 1).slice(-2)}`;
  }

  async function enhanceGradeHistory(root) {
    if (!root || root.dataset.stpHistoryReady === 'true' || root.dataset.stpHistoryBusy === 'true') return;

    const sourceRows = Array.from(root.querySelectorAll(':scope > .st-grade-row'));
    if (!sourceRows.length) return;

    root.dataset.stpHistoryBusy = 'true';

    try {
      const qApi = await quarterApi();
      if (!document.documentElement.contains(root)) return;
      if (root.dataset.stpHistoryReady === 'true') return;

      const currentQuarter = qApi?.getCurrentQuarter?.() || 'Q1';
      const models = sourceRows.map(gradeRowModel);
      const classes = [...new Set(models.map((item) => item.className).filter(Boolean))].sort();

      for (const model of models) {
        model.quarter = model.date && qApi?.getQuarterForDate
          ? qApi.getQuarterForDate(model.date)
          : null;
      }

      const firstRow = sourceRows[0];
      const existingTitle = firstRow.previousElementSibling?.matches('.st-grades-list-title')
        ? firstRow.previousElementSibling
        : root.querySelector(':scope > .st-grades-list-title');

      const shell = document.createElement('section');
      shell.className = 'stp-history-shell';
      shell.setAttribute('aria-label', 'Assignment history');

      const head = document.createElement('div');
      head.className = 'stp-history-head';
      const headCopy = document.createElement('div');
      const heading = document.createElement('h2');
      heading.textContent = 'Assignment History';
      const sub = document.createElement('p');
      sub.textContent = `${currentSchoolYearText()} school year · current quarter shown first`;
      headCopy.append(heading, sub);
      head.appendChild(headCopy);

      const toolbar = document.createElement('div');
      toolbar.className = 'stp-history-toolbar';

      const quarterTabs = document.createElement('div');
      quarterTabs.className = 'stp-quarter-tabs';
      quarterTabs.setAttribute('role', 'group');
      quarterTabs.setAttribute('aria-label', 'Filter assignment history by quarter');

      const controls = document.createElement('div');
      controls.className = 'stp-history-controls';

      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'stp-control stp-search';
      search.placeholder = 'Search assignments…';
      search.setAttribute('aria-label', 'Search graded assignments');

      const classSelect = document.createElement('select');
      classSelect.className = 'stp-control';
      classSelect.setAttribute('aria-label', 'Filter graded assignments by class');
      classSelect.appendChild(new Option('All Classes', ''));
      classes.forEach((className) => classSelect.appendChild(new Option(className, className)));

      const sortSelect = document.createElement('select');
      sortSelect.className = 'stp-control';
      sortSelect.setAttribute('aria-label', 'Sort assignment history');
      [
        ['newest', 'Newest First'],
        ['oldest', 'Oldest First'],
        ['high', 'Score: High to Low'],
        ['low', 'Score: Low to High'],
      ].forEach(([value, label]) => sortSelect.appendChild(new Option(label, value)));

      controls.append(search, classSelect, sortSelect);
      toolbar.append(quarterTabs, controls);

      const count = document.createElement('div');
      count.className = 'stp-history-count';
      count.setAttribute('aria-live', 'polite');

      const rowsWrap = document.createElement('div');
      rowsWrap.className = 'stp-history-rows';

      const empty = document.createElement('div');
      empty.className = 'stp-history-empty';
      empty.textContent = 'No graded assignments match these filters.';
      empty.hidden = true;

      const pager = document.createElement('div');
      pager.className = 'stp-history-pager';
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'stp-page-btn';
      prev.textContent = '← Previous';
      const status = document.createElement('span');
      status.className = 'stp-page-status';
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'stp-page-btn';
      next.textContent = 'Next →';
      pager.append(prev, status, next);

      const insertionPoint = existingTitle || firstRow;
      insertionPoint.before(shell);
      if (existingTitle) existingTitle.remove();

      shell.append(head, toolbar, count, rowsWrap, empty, pager);
      models.forEach((model) => rowsWrap.appendChild(model.row));

      let activeQuarter = currentQuarter;
      let page = 1;

      const quarterValues = ['Q1', 'Q2', 'Q3', 'Q4', 'ALL'];
      for (const quarter of quarterValues) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'stp-quarter-tab';
        button.dataset.quarter = quarter;
        button.setAttribute('aria-pressed', quarter === activeQuarter ? 'true' : 'false');
        if (quarter === 'ALL') {
          button.textContent = 'All';
        } else {
          const label = qApi?.getQuarterLabel?.(quarter) || quarter;
          button.textContent = label.replace(/\s*\(.+\)$/, '');
          button.title = label;
        }
        quarterTabs.appendChild(button);
      }

      function apply() {
        const term = search.value.trim().toLowerCase();
        const selectedClass = classSelect.value;

        let filtered = models.filter((model) => {
          if (activeQuarter !== 'ALL' && model.quarter !== activeQuarter) return false;
          if (selectedClass && model.className !== selectedClass) return false;
          if (term && !`${model.title} ${model.className}`.toLowerCase().includes(term)) return false;
          return true;
        });

        const sortMode = sortSelect.value;
        filtered = filtered.slice().sort((a, b) => {
          if (sortMode === 'high' || sortMode === 'low') {
            const av = Number.isFinite(a.score) ? a.score : -Infinity;
            const bv = Number.isFinite(b.score) ? b.score : -Infinity;
            return sortMode === 'high' ? bv - av : av - bv;
          }
          const av = a.date ? a.date.getTime() : 0;
          const bv = b.date ? b.date.getTime() : 0;
          return sortMode === 'oldest' ? av - bv : bv - av;
        });

        const pageCount = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
        if (page > pageCount) page = pageCount;
        const start = (page - 1) * HISTORY_PAGE_SIZE;
        const visible = new Set(filtered.slice(start, start + HISTORY_PAGE_SIZE).map((item) => item.row));

        for (const model of models) {
          model.row.style.display = visible.has(model.row) ? '' : 'none';
        }

        empty.hidden = filtered.length !== 0;
        rowsWrap.hidden = filtered.length === 0;
        pager.hidden = filtered.length <= HISTORY_PAGE_SIZE;
        prev.disabled = page <= 1;
        next.disabled = page >= pageCount;
        status.textContent = `Page ${page} of ${pageCount}`;

        if (filtered.length === 0) {
          count.textContent = '0 assignments';
        } else {
          const end = Math.min(start + HISTORY_PAGE_SIZE, filtered.length);
          count.textContent = `Showing ${start + 1}–${end} of ${filtered.length} assignments`;
        }
      }

      quarterTabs.addEventListener('click', (event) => {
        const button = event.target.closest('.stp-quarter-tab');
        if (!button) return;
        activeQuarter = button.dataset.quarter || currentQuarter;
        page = 1;
        quarterTabs.querySelectorAll('.stp-quarter-tab').forEach((item) =>
          item.setAttribute('aria-pressed', item === button ? 'true' : 'false')
        );
        apply();
      });

      search.addEventListener('input', () => { page = 1; apply(); });
      classSelect.addEventListener('change', () => { page = 1; apply(); });
      sortSelect.addEventListener('change', () => { page = 1; apply(); });
      prev.addEventListener('click', () => { if (page > 1) { page -= 1; apply(); } });
      next.addEventListener('click', () => { page += 1; apply(); });

      root.dataset.stpHistoryReady = 'true';
      apply();
    } finally {
      delete root.dataset.stpHistoryBusy;
    }
  }

  function enhanceLegacyGradeTable(root) {
    const body = root?.querySelector('#gradedAssignmentsBody');
    if (!body || body.dataset.stpPagerReady === 'true') return;
    const rows = Array.from(body.querySelectorAll(':scope > tr'));
    if (rows.length <= HISTORY_PAGE_SIZE) return;

    let page = 1;
    const pageCount = Math.ceil(rows.length / HISTORY_PAGE_SIZE);
    const pager = document.createElement('div');
    pager.className = 'stp-history-pager';
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'stp-page-btn';
    prev.textContent = '← Previous';
    const status = document.createElement('span');
    status.className = 'stp-page-status';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'stp-page-btn';
    next.textContent = 'Next →';
    pager.append(prev, status, next);
    body.closest('.graded-table-wrapper')?.after(pager);

    function apply() {
      const start = (page - 1) * HISTORY_PAGE_SIZE;
      rows.forEach((row, index) => { row.style.display = index >= start && index < start + HISTORY_PAGE_SIZE ? '' : 'none'; });
      prev.disabled = page === 1;
      next.disabled = page === pageCount;
      status.textContent = `Page ${page} of ${pageCount}`;
    }

    prev.addEventListener('click', () => { if (page > 1) { page -= 1; apply(); } });
    next.addEventListener('click', () => { if (page < pageCount) { page += 1; apply(); } });
    body.dataset.stpPagerReady = 'true';
    apply();
  }

  function enhanceGrades() {
    const root = document.getElementById('gradesContent');
    if (!root) return;

    ensureGradeSnapshot(root);
    root.querySelectorAll('.st-trend-section, .grade-trend-insights').forEach((section) =>
      section.classList.add('stp-trend-strip')
    );

    enhanceGradeHistory(root).catch(() => {
      delete root.dataset.stpHistoryBusy;
    });
    enhanceLegacyGradeTable(root);
  }

  function enhanceGoals() {
    document.querySelectorAll('.sgp-trend').forEach((trend) => {
      const pointCount = trend.querySelectorAll('.sgp-point').length;
      trend.classList.toggle('sgp-trend--sparse', pointCount > 0 && pointCount <= 3);
      trend.classList.toggle('sgp-trend--dense', pointCount > 3);
    });

    document.querySelectorAll('.sgp-work').forEach((work) => {
      const eyebrow = work.querySelector('.sgp-eyebrow');
      if (eyebrow && eyebrow.textContent.trim().toUpperCase() === 'WORK BEHIND THIS CHECK') {
        eyebrow.textContent = 'EVIDENCE FOR THIS CHECK';
      }

      const assignmentTitle = work.querySelector('h4')?.textContent?.trim();
      work.querySelectorAll('p').forEach((paragraph) => {
        const text = paragraph.textContent.trim();
        if (!text.includes('No question-level work is linked to it.')) return;
        paragraph.textContent = assignmentTitle
          ? 'This recorded check is tied to the assignment shown above, but no question-level evidence is linked to this check.'
          : 'This recorded check counts toward progress, but no question-level evidence is linked to this check.';
      });
    });
  }

  function enhance() {
    scheduled = false;
    enhanceDashboard();
    enhanceGrades();
    enhanceGoals();
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

  window.RCStudentPortalPolish = Object.freeze({
    DASHBOARD_LIMIT,
    HISTORY_PAGE_SIZE,
    enhance,
    switchStudentTab,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
