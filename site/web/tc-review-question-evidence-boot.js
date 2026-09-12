'use strict';

if (location.pathname.startsWith('/teacher/review') && !window.__rcReviewQuestionEvidenceBootLoaded) {
  window.__rcReviewQuestionEvidenceBootLoaded = true;

  const STYLE_SELECTOR = 'link[data-rv-question-evidence-style]';
  const FALLBACK_MS = 2200;
  const fallbackTimers = new WeakMap();

  function ensureStyle() {
    if (document.querySelector(STYLE_SELECTOR)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/web/tc-review-question-evidence.css?v=20260911-question-evidence2';
    link.dataset.rvQuestionEvidenceStyle = 'true';
    document.head.appendChild(link);
  }

  function clearFallback(details) {
    const timer = fallbackTimers.get(details);
    if (timer) clearTimeout(timer);
    fallbackTimers.delete(details);
  }

  function guardLegacyTable(table) {
    const details = table.closest('details.rv-details') || table.closest('details');
    if (!details) return;

    if (details.classList.contains('rv-question-evidence-ready')) {
      details.classList.remove('rv-question-evidence-pending');
      clearFallback(details);
      return;
    }

    if (details.classList.contains('rv-question-evidence-pending')) return;
    details.classList.add('rv-question-evidence-pending');

    clearFallback(details);
    const timer = setTimeout(() => {
      fallbackTimers.delete(details);
      if (!details.classList.contains('rv-question-evidence-ready')) {
        details.classList.remove('rv-question-evidence-pending');
      }
    }, FALLBACK_MS);
    fallbackTimers.set(details, timer);
  }

  function scan() {
    document
      .querySelectorAll('#rvQueue .rv-submission-item.rv-qol-selected .rv-auto-table')
      .forEach(guardLegacyTable);
  }

  ensureStyle();

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-expanded'],
  });

  scan();
}
