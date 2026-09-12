(() => {
  'use strict';

  if (!location.pathname.startsWith('/teacher/review')) return;
  if (window.__rcReviewQuestionEvidenceBootLoaded) return;
  window.__rcReviewQuestionEvidenceBootLoaded = true;

  const STYLE_SELECTOR = 'link[data-rv-question-evidence-style]';
  const PRESENTATION_CLASS = 'rv-review-first-paint-pending';
  const RESCAN_EVENT = 'rc-review-question-evidence-rescan';
  const PRESENTATION_FALLBACK_MS = 6000;
  const EVIDENCE_FALLBACK_MS = 2200;
  const EVIDENCE_RETRY_MS = 120;
  const EVIDENCE_RETRY_ATTEMPTS = 12;
  const fallbackTimers = new WeakMap();
  const retryTimers = new WeakMap();
  let presentationObserver = null;
  let presentationFallback = null;
  let evidenceObserver = null;
  let queueBootstrapObserver = null;

  function ensureStyle() {
    if (document.querySelector(STYLE_SELECTOR)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/web/tc-review-question-evidence.css?v=20260911-question-evidence4';
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
    if (retry) clearTimeout(retry);
    retryTimers.delete(details);
  }

  function requestEvidenceRescan() {
    window.dispatchEvent(new Event(RESCAN_EVENT));
  }

  function startEvidenceRetry(details, attempt = 0) {
    if (retryTimers.has(details)) return;
    if (attempt >= EVIDENCE_RETRY_ATTEMPTS) return;

    const timer = setTimeout(() => {
      retryTimers.delete(details);
      if (!details.isConnected || details.classList.contains('rv-question-evidence-ready')) {
        clearEvidenceTimers(details);
        return;
      }
      requestEvidenceRescan();
      startEvidenceRetry(details, attempt + 1);
    }, EVIDENCE_RETRY_MS);
    retryTimers.set(details, timer);
  }

  function guardLegacyTable(table) {
    const details = table.closest('details.rv-details') || table.closest('details');
    if (!details) return;

    if (details.classList.contains('rv-question-evidence-ready')) {
      if (details.classList.contains('rv-question-evidence-pending')) {
        details.classList.remove('rv-question-evidence-pending');
      }
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
        const retry = retryTimers.get(details);
        if (retry) clearTimeout(retry);
        retryTimers.delete(details);
        if (
          !details.classList.contains('rv-question-evidence-ready') &&
          details.classList.contains('rv-question-evidence-pending')
        ) {
          details.classList.remove('rv-question-evidence-pending');
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

  function attachEvidenceObserver() {
    const queue = document.getElementById('rvQueue');
    if (!queue) return false;
    if (evidenceObserver) return true;

    evidenceObserver = new MutationObserver(scan);
    evidenceObserver.observe(queue, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-expanded'],
    });
    scan();
    return true;
  }

  function waitForQueue() {
    if (attachEvidenceObserver()) return;
    queueBootstrapObserver = new MutationObserver(() => {
      if (!attachEvidenceObserver()) return;
      queueBootstrapObserver.disconnect();
      queueBootstrapObserver = null;
    });
    queueBootstrapObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  ensureStyle();
  watchCommandCenterFirstPaint();
  waitForQueue();
})();
