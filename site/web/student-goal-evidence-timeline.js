/* Student goal evidence timeline: one dot = one discrete evidence event.
 * Official goal math remains in student-goal-progress-view.js. */
(function () {
  'use strict';

  const states = new WeakMap();
  let quarterApiPromise = null;
  let scheduled = false;

  const esc = (value) => String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

  const number = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  function quarterApi() {
    if (!quarterApiPromise) {
      quarterApiPromise = import('/web/quarter-utils.js').catch(() => null);
    }
    return quarterApiPromise;
  }

  function localDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return 'Date unavailable';
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  function ymd(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function fallbackRange(quarter, schoolYear) {
    const ranges = {
      Q1: [[7, 16, schoolYear], [9, 17, schoolYear]],
      Q2: [[9, 18, schoolYear], [11, 19, schoolYear]],
      Q3: [[11, 20, schoolYear], [2, 6, schoolYear + 1]],
      Q4: [[2, 7, schoolYear + 1], [4, 20, schoolYear + 1]],
    };
    const range = ranges[quarter];
    if (!range) return null;
    return {
      start: new Date(range[0][2], range[0][0], range[0][1]),
      end: new Date(range[1][2], range[1][0], range[1][1]),
    };
  }

  async function quarterInfo(card) {
    const select = card.querySelector('[data-sgp-quarter]');
    if (!select) return null;
    const text = select.options?.[select.selectedIndex]?.textContent || '';
    const quarter = (text.match(/Q[1-4]/i) || [])[0]?.toUpperCase();
    if (!quarter) return null;

    const schoolMatch = text.match(/(20\d{2})\s*[–-]\s*\d{2}/);
    const api = await quarterApi();
    const schoolYear = schoolMatch
      ? Number(schoolMatch[1])
      : api?.getSchoolYear?.(new Date()) ?? (new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1);
    const range = api?.getQuarterDateRange?.(quarter, schoolYear) || fallbackRange(quarter, schoolYear);
    if (!range) return null;
    return {
      quarter,
      schoolYear,
      start: ymd(range.start),
      end: ymd(range.end),
      key: `${schoolYear}:${quarter}:${ymd(range.start)}:${ymd(range.end)}`,
    };
  }

  function answerParts(value) {
    if (Array.isArray(value)) return value.flatMap(answerParts);
    if (value === null || value === undefined || value === '') return [];
    if (typeof value === 'object') {
      const fields = ['letter', 'label', 'key', 'value', 'text', 'answer', 'choice', 'selected'];
      const parts = fields.flatMap((field) => answerParts(value[field]));
      if (parts.length) return parts;
      try { return [JSON.stringify(value)]; } catch (_) { return []; }
    }
    return [String(value).trim()];
  }

  function answerText(value) {
    const parts = answerParts(value).filter(Boolean);
    return parts.length ? parts.join(', ') : 'Not recorded';
  }

  function resultClass(status) {
    if (/correct|demonstrated/i.test(status || '')) return 'et-dot--good';
    if (/review this/i.test(status || '')) return 'et-dot--review';
    if (/pending/i.test(status || '')) return 'et-dot--pending';
    return 'et-dot--neutral';
  }

  function resultGlyph(status) {
    if (/correct|demonstrated/i.test(status || '')) return '✓';
    if (/review this/i.test(status || '')) return '!';
    if (/pending/i.test(status || '')) return '?';
    return '•';
  }

  function statusBucket(event) {
    const status = String(event?.status || '');
    if (/review this/i.test(status)) return 'review';
    if (/correct|demonstrated/i.test(status)) return 'demonstrated';
    return 'other';
  }

  function normalizeChoice(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function choiceRecord(value, fallbackLabel) {
    const fallback = String(fallbackLabel || '').trim().toUpperCase();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const rawLabel = value.letter ?? value.label ?? value.key ?? value.id ?? fallback;
      const labelMatch = String(rawLabel ?? '').trim().match(/[A-Z]/i);
      const label = labelMatch ? labelMatch[0].toUpperCase() : fallback;
      const textValue = value.text ?? value.value ?? value.content ?? value.answer ?? value.choice ?? value.option ?? value.description ?? '';
      const text = String(textValue ?? '').trim();
      return { label: label || fallback, text: text || 'Choice not recorded', raw: text };
    }

    const raw = String(value ?? '').trim();
    const detected = raw.match(/^\s*([A-Z])\s*[).:]\s*/i);
    const label = detected?.[1]?.toUpperCase() || fallback;
    const prefix = label ? new RegExp(`^\\s*${label}\\s*[).:]\\s*`, 'i') : null;
    const stripped = prefix ? raw.replace(prefix, '').trim() : raw;
    return { label, text: stripped || raw || 'Choice not recorded', raw };
  }

  function choiceText(value, label) {
    return choiceRecord(value, label).text;
  }

  function answerMatchesChoice(answer, rawChoice, fallbackLabel) {
    const record = choiceRecord(rawChoice, fallbackLabel);
    const labels = new Set([fallbackLabel, record.label].filter(Boolean).map((value) => String(value).toUpperCase()));
    return answerParts(answer).some((part) => {
      const raw = part.trim();
      const bareLetter = raw.match(/^([A-Z])\s*[).:]?$/i);
      if (bareLetter && labels.has(bareLetter[1].toUpperCase())) return true;
      const prefixed = raw.match(/^([A-Z])\s*[).:]\s+/i);
      if (prefixed && labels.has(prefixed[1].toUpperCase())) return true;
      const normalized = normalizeChoice(raw);
      return normalized === normalizeChoice(record.raw) || normalized === normalizeChoice(record.text);
    });
  }

  function choiceListHtml(event) {
    const choices = Array.isArray(event?.choices) ? event.choices : [];
    if (!choices.length) return '';
    const canReview = event.answer_review_available === true;

    return `<div class="et-choices" aria-label="Answer choices">
      <span class="et-choice-heading">Answer choices</span>
      <ol class="et-choice-list">
        ${choices.map((choice, index) => {
          const fallbackLabel = String.fromCharCode(65 + index);
          const record = choiceRecord(choice, fallbackLabel);
          const label = record.label || fallbackLabel;
          const selected = answerMatchesChoice(event.student_answer, choice, label);
          const correct = canReview && answerMatchesChoice(event.correct_answer, choice, label);
          const classes = [
            'et-choice',
            selected ? 'et-choice--selected' : '',
            correct ? 'et-choice--correct' : '',
            selected && canReview && !correct ? 'et-choice--wrong' : '',
          ].filter(Boolean).join(' ');
          const markers = [
            selected ? '<span class="et-choice-tag et-choice-tag--selected">Your answer</span>' : '',
            correct ? '<span class="et-choice-tag et-choice-tag--correct">Correct answer</span>' : '',
          ].filter(Boolean).join('');
          return `<li class="${classes}">
            <span class="et-choice-letter" aria-hidden="true">${esc(label)}</span>
            <span class="et-choice-text">${esc(choiceText(choice, label))}</span>
            ${markers ? `<span class="et-choice-markers">${markers}</span>` : ''}
          </li>`;
        }).join('')}
      </ol>
    </div>`;
  }

  function detailHtml(event) {
    if (!event) {
      return '<section class="et-detail et-detail--empty"><p>No evidence events are available for this view.</p></section>';
    }

    const score = number(event.score);
    const objectiveScore = number(event.objective_earned) !== null && number(event.objective_max) !== null
      ? `${event.objective_earned} / ${event.objective_max}`
      : null;
    const context = event.assignment_title || (event.kind === 'progress' ? 'Teacher-recorded performance check' : 'Recorded goal evidence');
    const skill = event.objective_number != null
      ? `Skill ${event.objective_number}${event.objective_text ? ` — ${event.objective_text}` : ''}`
      : null;
    const hasChoices = Array.isArray(event.choices) && event.choices.length > 0;
    const summaryTiles = [];

    if (!hasChoices) {
      summaryTiles.push(`<div><dt>Your answer</dt><dd>${esc(answerText(event.student_answer))}</dd></div>`);
      if (event.answer_review_available && event.correct_answer != null) {
        summaryTiles.push(`<div><dt>Correct answer</dt><dd>${esc(answerText(event.correct_answer))}</dd></div>`);
      }
    }
    if (objectiveScore) {
      summaryTiles.push(`<div><dt>Goal skill score</dt><dd>${esc(objectiveScore)}</dd></div>`);
    } else if (score !== null) {
      summaryTiles.push(`<div><dt>Evidence score</dt><dd>${esc(score)}%</dd></div>`);
    }

    return `<section class="et-detail" tabindex="-1" aria-label="Selected goal evidence">
      <div class="et-detail__head">
        <div>
          <span class="et-eyebrow">EVIDENCE FROM THIS CHECK</span>
          <h4>${esc(context)}</h4>
          <p class="et-meta">${esc(localDate(event.date))}${event.item_ref ? ` · Question ${esc(event.item_ref)}` : ''}</p>
        </div>
        <span class="et-result ${resultClass(event.status)}">${esc(event.status || 'Recorded check')}</span>
      </div>
      ${skill ? `<p class="et-skill"><strong>${esc(skill)}</strong></p>` : ''}
      ${event.component_label ? `<p class="et-meta">Measured component: ${esc(event.component_label)}</p>` : ''}
      ${event.question_text
        ? `<div class="et-question"><p class="et-prompt">${esc(event.question_text)}</p>
            ${choiceListHtml(event)}
            ${summaryTiles.length ? `<dl class="et-answer-grid">${summaryTiles.join('')}</dl>` : ''}
            ${event.source === 'assignment' && !event.answer_review_available ? '<p class="et-note">Your teacher has not released answer review for this assignment yet. You can see the response you selected, but the correct answer and score stay hidden until review is released.</p>' : ''}
          </div>`
        : `<div class="et-performance">
            <p>This was a recorded performance check rather than a question-level response.</p>
            ${score !== null ? `<p><strong>Recorded value:</strong> ${esc(score)}</p>` : ''}
          </div>`}
      ${event.support_level ? `<p class="et-meta">Support level: ${esc(event.support_level)}</p>` : ''}
    </section>`;
  }

  function pageSize(card) {
    return card.clientWidth < 600 ? 3 : 5;
  }

  function skillEvents(state) {
    const all = state.data.events || [];
    if (state.skill === 'all') return all;
    return all.filter((event) => String(event.objective_number ?? '') === state.skill);
  }

  function filteredEvents(state) {
    const events = skillEvents(state);
    if (state.status === 'review') return events.filter((event) => statusBucket(event) === 'review');
    if (state.status === 'demonstrated') return events.filter((event) => statusBucket(event) === 'demonstrated');
    return events;
  }

  function pageWindow(state, events = filteredEvents(state)) {
    const size = pageSize(state.card);
    const pageCount = Math.max(1, Math.ceil(events.length / size));
    const pageIndex = Math.max(0, Math.min(Number.isFinite(state.page) ? state.page : 0, pageCount - 1));
    const end = Math.max(0, events.length - pageIndex * size);
    const start = Math.max(0, end - size);
    return { size, pageCount, pageIndex, start, end, page: events.slice(start, end) };
  }

  function selectPage(state, pageIndex) {
    const events = filteredEvents(state);
    state.page = pageIndex;
    const windowed = pageWindow(state, events);
    state.page = windowed.pageIndex;
    state.selectedKey = windowed.page.at(-1)?.key || null;
  }

  function updateStats(card, count) {
    const stats = card.querySelector('.sgp-stats');
    const blocks = stats ? Array.from(stats.children) : [];
    if (!blocks.length) return;
    const last = blocks[blocks.length - 1];
    const label = last.querySelector('span');
    const value = last.querySelector('strong');
    if (label) label.textContent = 'Evidence events';
    if (value) value.textContent = String(count);
  }

  function render(state, { focusDetail = false } = {}) {
    const card = state.card;
    const trend = card.querySelector('.sgp-trend');
    const selectedRoot = card.querySelector('[data-sgp-selected]');
    if (!trend || !selectedRoot || !state.data) return;

    const allEvents = state.data.events || [];
    const scopedEvents = skillEvents(state);
    const events = filteredEvents(state);
    const reviewCount = scopedEvents.filter((event) => statusBucket(event) === 'review').length;
    const demonstratedCount = scopedEvents.filter((event) => statusBucket(event) === 'demonstrated').length;

    if (!events.some((event) => event.key === state.selectedKey)) {
      state.page = 0;
      state.selectedKey = events.at(-1)?.key || null;
    }

    const windowed = pageWindow(state, events);
    state.page = windowed.pageIndex;
    if (windowed.page.length && !windowed.page.some((event) => event.key === state.selectedKey)) {
      state.selectedKey = windowed.page.at(-1)?.key || null;
    }
    const selected = events.find((event) => event.key === state.selectedKey) || null;
    const skills = state.data.skills || [];
    const allSkills = skills.length > 0;
    const calculation = state.calculationHtml || '';
    const filtered = state.status !== 'all' || state.skill !== 'all';
    const countText = filtered
      ? `${events.length} shown · ${allEvents.length} total`
      : `${allEvents.length} ${allEvents.length === 1 ? 'event' : 'events'} · ${reviewCount} need review`;

    trend.innerHTML = `<section class="et-shell" data-et-key="${esc(state.rangeKey)}">
      <div class="et-heading">
        <div><h4>Evidence Timeline</h4><p>Each dot is one piece of evidence collected for this goal. Select a dot to review the work.</p></div>
        <span class="et-count">${esc(countText)}</span>
      </div>
      <div class="et-filters">
        ${allSkills ? `<label class="et-skill-filter">Goal skill
          <select data-et-skill>
            <option value="all" ${state.skill === 'all' ? 'selected' : ''}>All Evidence</option>
            ${skills.map((skill) => `<option value="${esc(skill.objective_number)}" ${String(skill.objective_number) === state.skill ? 'selected' : ''}>Skill ${esc(skill.objective_number)}</option>`).join('')}
          </select>
        </label>` : ''}
        <div class="et-status-filter" role="group" aria-label="Filter evidence by result">
          <span class="et-filter-label">Result</span>
          <div class="et-status-buttons">
            <button type="button" data-et-status="all" aria-pressed="${state.status === 'all'}">All <span>${scopedEvents.length}</span></button>
            <button type="button" data-et-status="review" aria-pressed="${state.status === 'review'}">Needs Review <span>${reviewCount}</span></button>
            <button type="button" data-et-status="demonstrated" aria-pressed="${state.status === 'demonstrated'}">Demonstrated <span>${demonstratedCount}</span></button>
          </div>
        </div>
      </div>
      ${allSkills && state.skill === 'all' ? '<p class="et-note">All Evidence combines different goal skills. The dots are intentionally not connected as a trend line.</p>' : ''}
      ${windowed.page.length
        ? `<div class="et-rail" role="group" aria-label="Evidence events in this window">
            ${windowed.page.map((event, index) => `<button type="button" class="et-dot ${resultClass(event.status)}" data-et-key-value="${esc(event.key)}" aria-pressed="${event.key === state.selectedKey ? 'true' : 'false'}" aria-label="Evidence ${windowed.start + index + 1}, ${esc(localDate(event.date))}, ${esc(event.status || 'Recorded check')}${event.objective_number != null ? `, skill ${esc(event.objective_number)}` : ''}">
              <span aria-hidden="true">${resultGlyph(event.status)}</span>
            </button>`).join('')}
          </div>
          <div class="et-page-meta"><span>${esc(localDate(windowed.page[0].date))}</span><span>${windowed.page.length > 1 ? esc(localDate(windowed.page.at(-1).date)) : ''}</span></div>`
        : `<div class="et-empty">${state.status === 'review' ? 'No evidence in this view currently needs review.' : state.status === 'demonstrated' ? 'No demonstrated evidence is available in this view yet.' : 'No evidence events are available for this goal in the selected quarter.'}</div>`}
      <nav class="et-pager" aria-label="Evidence timeline windows">
        <button type="button" data-et-action="older" ${state.page >= windowed.pageCount - 1 ? 'disabled' : ''}>Older evidence</button>
        <span>${events.length ? `${windowed.start + 1}–${windowed.end} of ${events.length}` : 'No evidence'}</span>
        <button type="button" data-et-action="newer" ${state.page <= 0 ? 'disabled' : ''}>Newer evidence</button>
      </nav>
      ${calculation}
    </section>`;
    selectedRoot.innerHTML = detailHtml(selected);
    updateStats(card, allEvents.length);

    if (focusDetail && selected) {
      const detail = selectedRoot.querySelector('.et-detail');
      detail?.focus({ preventScroll: true });
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      detail?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    }
  }

  async function loadCard(card) {
    const progress = card.querySelector('.sgp-progress');
    const trend = card.querySelector('.sgp-trend');
    const selectedRoot = card.querySelector('[data-sgp-selected]');
    if (!progress?.open || !trend || !selectedRoot) return;

    card.querySelector('[data-sgp-objective]')?.closest('label')?.setAttribute('hidden', '');
    card.querySelector('.sgp-skill-text')?.setAttribute('hidden', '');

    const info = await quarterInfo(card);
    if (!info?.start || !info?.end) return;
    if (trend.dataset.etKey === info.key && trend.querySelector('.et-shell')) return;

    const state = states.get(card) || {
      card,
      cache: new Map(),
      skill: 'all',
      status: 'all',
      page: 0,
      selectedKey: null,
      calculationHtml: '',
      request: 0,
    };
    states.set(card, state);

    state.calculationHtml = trend.querySelector('.sgp-calculation')?.outerHTML || state.calculationHtml || '';
    state.rangeKey = info.key;
    trend.dataset.etKey = info.key;
    trend.innerHTML = '<section class="et-shell et-loading" role="status">Loading evidence timeline…</section>';
    selectedRoot.innerHTML = '';

    const request = ++state.request;
    try {
      let data = state.cache.get(info.key);
      if (!data) {
        const goalCode = card.dataset.sgpGoal || '';
        const code = goalCode.split('.')[0];
        const query = new URLSearchParams({
          code,
          goal_code: goalCode,
          quarter: info.quarter,
          start: info.start,
          end: info.end,
        });
        const response = await fetch(`/.netlify/functions/student-goal-evidence-events?${query.toString()}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`Evidence request failed: ${response.status}`);
        data = await response.json();
        if (!data?.ok || data.available !== true) throw new Error(data?.reason || 'Evidence unavailable');
        state.cache.set(info.key, data);
      }
      if (request !== state.request || !card.isConnected) return;
      state.data = data;
      state.skill = 'all';
      state.status = 'all';
      selectPage(state, 0);
      render(state);
    } catch (_) {
      if (request !== state.request || !card.isConnected) return;
      trend.innerHTML = '<section class="et-shell et-error"><p>Evidence details are temporarily unavailable. Your official goal progress is unchanged.</p><button type="button" data-et-action="retry">Try again</button></section>';
    }
  }

  function mountCard(card) {
    if (card.dataset.etMounted === 'true') {
      loadCard(card);
      return;
    }
    card.dataset.etMounted = 'true';

    card.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const state = states.get(card);
      if (button.dataset.etKeyValue && state) {
        state.selectedKey = button.dataset.etKeyValue;
        render(state, { focusDetail: true });
        return;
      }
      if (button.dataset.etStatus && state) {
        state.status = button.dataset.etStatus;
        selectPage(state, 0);
        render(state);
        return;
      }
      const action = button.dataset.etAction;
      if (!action) return;
      if (action === 'retry') {
        const trend = card.querySelector('.sgp-trend');
        if (trend) delete trend.dataset.etKey;
        loadCard(card);
        return;
      }
      if (!state) return;
      const windowed = pageWindow(state);
      if (action === 'older' && state.page < windowed.pageCount - 1) selectPage(state, state.page + 1);
      if (action === 'newer' && state.page > 0) selectPage(state, state.page - 1);
      render(state);
    });

    card.addEventListener('change', (event) => {
      if (!event.target.matches('[data-et-skill]')) return;
      const state = states.get(card);
      if (!state) return;
      state.skill = event.target.value || 'all';
      selectPage(state, 0);
      render(state);
    });

    const observer = new MutationObserver(() => schedule());
    observer.observe(card, { childList: true, subtree: true });
    card._etObserver = observer;
    loadCard(card);
  }

  function enhance(root = document) {
    root.querySelectorAll?.('#goalsContent .sgp-card').forEach(mountCard);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enhance();
    });
  }

  const rootObserver = new MutationObserver(schedule);
  if (document.documentElement) rootObserver.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => enhance(), { once: true });
  else enhance();

  window.RCStudentGoalEvidenceTimeline = { enhance };
})();