'use strict';

if (location.pathname.startsWith('/teacher/review') && !window.__rcReviewQuestionEvidenceBootLoaded) {
  window.__rcReviewQuestionEvidenceBootLoaded = true;

  const STYLE_SELECTOR = 'link[data-rv-question-evidence-style]';
  const PRESENTATION_CLASS = 'rv-review-first-paint-pending';
  const PRESENTATION_FALLBACK_MS = 6000;
  const EVIDENCE_FALLBACK_MS = 2200;
  const fallbackTimers = new WeakMap();
  const retryTimers = new WeakMap();
  let presentationObserver = null;
  let presentationFallback = null;

  function ensureStyle() {
    if (document.querySelector(STYLE_SELECTOR)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/web/tc-review-question-evidence.css?v=20260911-question-evidence3';
    link.dataset.rvQuestionEvidenceStyle = 'true';
    document.head.appendChild(link);
  }

  function releasePresentationBoot() {
    document.documentElement.classList.remove(PRESENTATION_CLASS);
    if (presentationObserver) presentationObserver.disconnect();
    presentationObserver = null;
    if (presentationFallback) clearTimeout(presentationFallback);
    presentationFallback = null;
  }

  function commandCenterReady() {
    const shell = document.getElementById('rvReviewCommandCenter');
    return Boolean(shell && shell.childElementCount > 0);
  }

  function watchCommandCenterFirstPaint() {
    document.documentElement.classList.add(PRESENTATION_CLASS);
    if (commandCenterReady()) {
      releasePresentationBoot();
      return;
    }

    const attach = () => {
      if (!document.body) return false;
      presentationObserver = new MutationObserver(() => {
        if (commandCenterReady()) releasePresentationBoot();
      });
      presentationObserver.observe(document.body, { childList: true, subtree: true });
      if (commandCenterReady()) releasePresentationBoot();
      return true;
    };

    if (!attach()) {
      document.addEventListener('DOMContentLoaded', attach, { once: true });
    }

    presentationFallback = setTimeout(releasePresentationBoot, PRESENTATION_FALLBACK_MS);
  }

  function clearEvidenceTimers(details) {
    const fallback = fallbackTimers.get(details);
    if (fallback) clearTimeout(fallback);
    fallbackTimers.delete(details);

    const retry = retryTimers.get(details);
    if (retry) clearInterval(retry);
    retryTimers.delete(details);
  }

  function startEvidenceRetry(details) {
    if (retryTimers.has(details)) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (!details.isConnected || details.classList.contains('rv-question-evidence-ready')) {
        clearEvidenceTimers(details);
        return;
      }
      if (attempts > 20) {
        const existing = retryTimers.get(details);
        if (existing) clearInterval(existing);
        retryTimers.delete(details);
        return;
      }
      details.classList.toggle('rv-question-evidence-retry-pulse');
    }, 90);
    retryTimers.set(details, timer);
  }

  function guardLegacyTable(table) {
    const details = table.closest('details.rv-details') || table.closest('details');
    if (!details) return;

    if (details.classList.contains('rv-question-evidence-ready')) {
      details.classList.remove('rv-question-evidence-pending', 'rv-question-evidence-retry-pulse');
      clearEvidenceTimers(details);
      return;
    }

    if (!details.classList.contains('rv-question-evidence-pending')) {
      details.classList.add('rv-question-evidence-pending');
    }
    startEvidenceRetry(details);

    if (!fallbackTimers.has(details)) {
      const timer = setTimeout(() => {
        fallbackTimers.delete(details);
        if (!details.classList.contains('rv-question-evidence-ready')) {
          details.classList.remove('rv-question-evidence-pending', 'rv-question-evidence-retry-pulse');
        }
      }, EVIDENCE_FALLBACK_MS);
      fallbackTimers.set(details, timer);
    }
  }

  function scan() {
    document
      .querySelectorAll([
        '#rvQueue .rv-submission-item.expanded .rv-auto-table',
        '#rvQueue .rv-submission-item.rv-qol-selected .rv-auto-table',
      ].join(','))
      .forEach(guardLegacyTable);
  }

  ensureStyle();
  watchCommandCenterFirstPaint();

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-expanded'],
  });

  scan();
}
