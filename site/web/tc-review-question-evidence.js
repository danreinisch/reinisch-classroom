(async () => {
  'use strict';

  if (!location.pathname.startsWith('/teacher/review')) return;
  if (window.__rcReviewQuestionEvidenceLoaded) return;
  window.__rcReviewQuestionEvidenceLoaded = true;

  const { db } = await import('/web/data-adapter.js?v=2026082401');
  const model = await import('/web/tc-review-question-evidence-model.js?v=20260911-question-evidence');
  const {
    buildQuestionLookup,
    choicesForQuestion,
    choiceMatches,
    classifyOutcome,
    formatAnswer,
  } = model;

  let assignmentsPromise = null;
  let scheduled = false;
  let decorating = false;
  const filterState = new Map();

  function ensureStyle() {
    if (document.querySelector('link[data-rv-question-evidence-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/web/tc-review-question-evidence.css?v=20260911-question-evidence';
    link.dataset.rvQuestionEvidenceStyle = 'true';
    document.head.appendChild(link);
  }

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeId(value) {
    return value == null ? '' : String(value).trim();
  }

  async function loadAssignments() {
    if (!assignmentsPromise) {
      const snapshot = typeof window.__rcReviewInitialReadSnapshot === 'function'
        ? window.__rcReviewInitialReadSnapshot('listAssignments')
        : null;
      if (Array.isArray(snapshot)) {
        assignmentsPromise = Promise.resolve(snapshot);
      } else {
        assignmentsPromise = Promise.resolve()
          .then(() => db.listAssignments())
          .then(rows => Array.isArray(rows) ? rows : [])
          .catch(error => {
            assignmentsPromise = null;
            throw error;
          });
      }
    }
    return assignmentsPromise;
  }

  function selectedSubmission() {
    return document.querySelector('#rvQueue .rv-submission-item.rv-qol-selected');
  }

  function selectedSubmissionId(selected) {
    return normalizeId(
      selected?.querySelector('.rv-submission-header[data-submission-id]')?.dataset.submissionId
    );
  }

  function selectedPhysicalTitle(selected) {
    return selected?.querySelector('.rv-submission-header .rv-assignment')?.textContent?.trim() || '';
  }

  function currentPhysicalAssignmentId() {
    const value = document.getElementById('rvAssignmentFilter')?.value;
    if (!value || value === 'All Assignments') return '';
    return normalizeId(value);
  }

  async function resolveAssignment(selected) {
    const assignments = await loadAssignments();
    const physicalId = currentPhysicalAssignmentId();
    if (physicalId) {
      const byId = assignments.find(row => normalizeId(row?.id) === physicalId);
      if (byId) return byId;
    }

    const title = selectedPhysicalTitle(selected);
    if (!title) return null;
    const exact = assignments.filter(row => String(row?.title || '').trim() === title);
    if (exact.length === 1) return exact[0];

    const studentCode = document.querySelector('.rv-qol-focus-title strong')?.textContent?.trim() || '';
    if (studentCode) {
      const withStudent = exact.find(row => String(row?.title || '').includes(studentCode));
      if (withStudent) return withStudent;
    }
    return exact[0] || null;
  }

  function outcomeLabel(outcome) {
    if (outcome === 'correct') return 'Correct';
    if (outcome === 'partial') return 'Partial Credit';
    if (outcome === 'incorrect') return 'Incorrect';
    return 'Scored';
  }

  function metadataChips(question) {
    const chips = [];
    for (const code of question?.goalCodes || []) {
      chips.push(`<span class="rv-question-evidence-chip">IEP ${escapeHtml(code)}</span>`);
    }
    for (const code of question?.deseCodes || []) {
      chips.push(`<span class="rv-question-evidence-chip">DESE ${escapeHtml(code)}</span>`);
    }
    return chips.length ? `<div class="rv-question-evidence-chips">${chips.join('')}</div>` : '';
  }

  function choiceList(question, answerType, studentAnswer, correctAnswer) {
    const choices = choicesForQuestion(question, answerType);
    if (!choices.length) {
      if (['mcq', 'multiple_choice', 'multi', 'boolean'].includes(String(answerType || '').toLowerCase())) {
        return '<div class="rv-question-evidence-no-options">Answer choices were not stored with this legacy item.</div>';
      }
      return '';
    }

    return `<div class="rv-question-evidence-options" role="list" aria-label="Answer choices">${choices.map((choice, index) => {
      const selected = choiceMatches(studentAnswer, choice, index);
      const correct = choiceMatches(correctAnswer, choice, index);
      const classes = [
        'rv-question-evidence-option',
        selected ? 'is-student-choice' : '',
        correct ? 'is-correct-choice' : '',
        selected && !correct ? 'is-incorrect-choice' : '',
      ].filter(Boolean).join(' ');
      const badges = [
        selected ? '<span class="rv-question-evidence-tag student">Student</span>' : '',
        correct ? '<span class="rv-question-evidence-tag correct">Correct</span>' : '',
      ].join('');
      return `<div class="${classes}" role="listitem"><span class="rv-question-evidence-letter">${escapeHtml(choice.key || String.fromCharCode(65 + index))}</span><span class="rv-question-evidence-option-text">${escapeHtml(choice.text || choice.value || '')}</span><span class="rv-question-evidence-option-tags">${badges}</span></div>`;
    }).join('')}</div>`;
  }

  function answerComparison(studentAnswer, correctAnswer) {
    return `<div class="rv-question-evidence-answers"><div><span>Student response</span><strong>${escapeHtml(formatAnswer(studentAnswer))}</strong></div><div><span>Correct answer</span><strong>${escapeHtml(formatAnswer(correctAnswer))}</strong></div></div>`;
  }

  function autoCard(row, lookup) {
    const cells = [...row.querySelectorAll(':scope > td')];
    if (cells.length < 6) return '';

    const ref = cells[0]?.textContent?.trim() || 'Item';
    const answerType = cells[1]?.textContent?.trim() || '';
    const studentAnswer = cells[2]?.textContent?.trim() || '—';
    const tableCorrect = cells[3]?.textContent?.trim() || '—';
    const points = cells[5]?.textContent?.trim() || '—';
    const question = lookup.get(ref) || null;
    const correctAnswer = tableCorrect !== '—'
      ? tableCorrect
      : (question?.correct ?? '—');
    const outcome = classifyOutcome(points);
    const prompt = question?.text || 'Question text is unavailable for this legacy item.';

    return `<article class="rv-question-evidence-card is-${escapeHtml(outcome)}" data-rv-question-outcome="${escapeHtml(outcome)}" data-rv-question-ref="${escapeHtml(ref)}">
      <div class="rv-question-evidence-card-head"><div><span class="rv-question-evidence-ref">${escapeHtml(ref)}</span><span class="rv-question-evidence-type">${escapeHtml(answerType || question?.type || 'Item')}</span></div><div><span class="rv-question-evidence-outcome">${escapeHtml(outcomeLabel(outcome))}</span><strong>${escapeHtml(points)}</strong></div></div>
      <div class="rv-question-evidence-prompt">${escapeHtml(prompt)}</div>
      ${choiceList(question, answerType || question?.type, studentAnswer, correctAnswer)}
      ${answerComparison(studentAnswer, correctAnswer)}
      ${metadataChips(question)}
    </article>`;
  }

  function applyFilter(panel, submissionId, filter) {
    filterState.set(submissionId, filter);
    panel.querySelectorAll('[data-rv-question-filter]').forEach(button => {
      const active = button.dataset.rvQuestionFilter === filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    panel.querySelectorAll('[data-rv-question-outcome]').forEach(card => {
      const outcome = card.dataset.rvQuestionOutcome;
      const visible = filter === 'all'
        || (filter === 'missed' && (outcome === 'incorrect' || outcome === 'partial'))
        || (filter === 'correct' && outcome === 'correct');
      card.hidden = !visible;
    });
  }

  function questionPanel(cardsHtml, counts, submissionId) {
    const current = filterState.get(submissionId) || 'all';
    const panel = document.createElement('div');
    panel.className = 'rv-question-evidence-panel';
    panel.dataset.rvQuestionEvidencePanel = submissionId;
    panel.innerHTML = `
      <div class="rv-question-evidence-toolbar" aria-label="Question review filters">
        <div><strong>Question Evidence</strong><span>See what the student saw, selected, and earned.</span></div>
        <div class="rv-question-evidence-filters">
          <button type="button" data-rv-question-filter="all" aria-pressed="false">All <span>${counts.all}</span></button>
          <button type="button" data-rv-question-filter="missed" aria-pressed="false">Missed <span>${counts.missed}</span></button>
          <button type="button" data-rv-question-filter="correct" aria-pressed="false">Correct <span>${counts.correct}</span></button>
        </div>
      </div>
      <div class="rv-question-evidence-list" role="list">${cardsHtml}</div>`;
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-rv-question-filter]');
      if (!button) return;
      applyFilter(panel, submissionId, button.dataset.rvQuestionFilter);
    });
    applyFilter(panel, submissionId, current);
    return panel;
  }

  function decorateAutoSection(selected, lookup, assignmentId, submissionId) {
    const table = selected.querySelector('.rv-auto-table');
    if (!table) return;
    const details = table.closest('details.rv-details') || table.closest('details');
    if (!details) return;

    const rows = [...table.querySelectorAll('tbody > tr')];
    if (!rows.length) return;
    const fingerprint = `${assignmentId || 'legacy'}:${submissionId}:${rows.length}`;
    if (details.dataset.rvQuestionEvidenceFingerprint === fingerprint && details.querySelector('.rv-question-evidence-panel')) return;

    const cards = rows.map(row => autoCard(row, lookup)).filter(Boolean);
    if (!cards.length) return;
    const outcomes = rows.map(row => {
      const cells = [...row.querySelectorAll(':scope > td')];
      return classifyOutcome(cells[5]?.textContent || '');
    });
    const counts = {
      all: cards.length,
      correct: outcomes.filter(value => value === 'correct').length,
      missed: outcomes.filter(value => value === 'incorrect' || value === 'partial').length,
    };

    details.querySelector('.rv-question-evidence-panel')?.remove();
    const panel = questionPanel(cards.join(''), counts, submissionId);
    table.insertAdjacentElement('beforebegin', panel);
    details.classList.add('rv-question-evidence-ready');
    details.dataset.rvQuestionEvidenceFingerprint = fingerprint;

    const title = details.querySelector(':scope > summary .rv-section-header > span:first-child')
      || details.querySelector(':scope > summary span:first-child');
    if (title) title.textContent = `Question Review (${cards.length} auto-graded item${cards.length === 1 ? '' : 's'})`;

    if (!details.dataset.rvQuestionEvidenceOpened) {
      details.open = true;
      details.dataset.rvQuestionEvidenceOpened = 'true';
    }
  }

  function refFromResponseCard(card) {
    const header = card.querySelector('.rv-response-header')?.textContent?.trim() || '';
    if (!header) return '';
    return header.split(/\s+[—–]\s+/)[0].replace(/[“”"]/g, '').trim();
  }

  function decorateWrittenSection(selected, lookup) {
    selected.querySelectorAll('.rv-response-card').forEach(card => {
      if (card.querySelector('.rv-question-written-prompt')) return;
      const ref = refFromResponseCard(card);
      const question = lookup.get(ref);
      if (!question?.text) return;
      const studentResponse = card.querySelector('.rv-student-response');
      if (!studentResponse) return;
      const prompt = document.createElement('div');
      prompt.className = 'rv-question-written-prompt';
      prompt.innerHTML = `<span>Prompt</span><p>${escapeHtml(question.text)}</p>`;
      studentResponse.insertAdjacentElement('beforebegin', prompt);
    });
  }

  async function decorateCurrent() {
    if (decorating) return;
    const selected = selectedSubmission();
    if (!selected) return;
    const submissionId = selectedSubmissionId(selected);
    if (!submissionId) return;

    decorating = true;
    try {
      let assignment = null;
      try {
        assignment = await resolveAssignment(selected);
      } catch (error) {
        console.warn('[review-question-evidence] Assignment metadata read failed; keeping legacy Review detail.', error);
      }
      const lookup = buildQuestionLookup(assignment || {});
      decorateAutoSection(selected, lookup, normalizeId(assignment?.id), submissionId);
      decorateWrittenSection(selected, lookup);
    } finally {
      decorating = false;
    }
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateCurrent().catch(error => {
        console.warn('[review-question-evidence] Could not decorate Review detail:', error);
      });
    });
  }

  function start() {
    ensureStyle();
    const attach = () => {
      const queue = document.getElementById('rvQueue');
      if (!queue) return false;
      const observer = new MutationObserver(scheduleDecorate);
      observer.observe(queue, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-expanded'],
      });
      scheduleDecorate();
      return true;
    };

    if (attach()) return;
    const bootstrapObserver = new MutationObserver(() => {
      if (!attach()) return;
      bootstrapObserver.disconnect();
    });
    bootstrapObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
