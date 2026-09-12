(() => {
  'use strict';

  if (!location.pathname.startsWith('/teacher/review')) return;
  if (window.__rcReviewFocusPersistenceLoaded) return;
  window.__rcReviewFocusPersistenceLoaded = true;

  const INTENT_WAIT_MS = 4000;
  const FOCUS_STABILIZE_MS = 3000;
  const INTENT_RETRY_MS = 50;

  let root = null;
  let queue = null;
  let focusedSubmissionId = null;
  let intentPending = false;
  let intentStartedAt = 0;
  let stabilizeUntil = 0;
  let scheduled = false;
  let retryTimer = null;

  function cssEscape(value) {
    return window.CSS?.escape
      ? window.CSS.escape(String(value))
      : String(value).replace(/(["\\#.:[\],=])/g, '\\$1');
  }

  function selectedSubmissionId() {
    return queue
      ?.querySelector('.rv-submission-item.rv-qol-selected .rv-submission-header[data-submission-id]')
      ?.dataset.submissionId || null;
  }

  function clearFocusIntent() {
    focusedSubmissionId = null;
    intentPending = false;
    intentStartedAt = 0;
    stabilizeUntil = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function pendingIntentIsFresh() {
    return intentPending && focusedSubmissionId &&
      Date.now() - intentStartedAt < INTENT_WAIT_MS;
  }

  function stabilizationActive() {
    return Boolean(focusedSubmissionId) && Date.now() < stabilizeUntil;
  }

  function scheduleRetry() {
    if (retryTimer || (!pendingIntentIsFresh() && !stabilizationActive())) return false;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      scheduleRestore();
    }, INTENT_RETRY_MS);
    return true;
  }

  function rememberCurrentSelection() {
    if (intentPending) return;
    if (focusedSubmissionId && document.body.classList.contains('rv-qol-focus')) return;
    const selectedId = selectedSubmissionId();
    if (selectedId) focusedSubmissionId = String(selectedId);
  }

  function setFocusIntent(submissionId) {
    if (!submissionId) return;
    focusedSubmissionId = String(submissionId);
    intentPending = true;
    intentStartedAt = Date.now();
    stabilizeUntil = Date.now() + FOCUS_STABILIZE_MS;
    scheduleRestore();
  }

  function reviewNextSubmissionId() {
    return root
      ?.querySelector('.rv-qol-student-table tr[data-needs="true"] [data-rv-focus]')
      ?.dataset.rvFocus || null;
  }

  function handleFocusIntent(event) {
    const direct = event.target.closest('[data-rv-focus]');
    if (direct) {
      setFocusIntent(direct.dataset.rvFocus);
      return;
    }

    if (event.target.closest('[data-rv-review-next]')) {
      setFocusIntent(reviewNextSubmissionId());
      return;
    }

    if (event.target.closest('[data-rv-back-home], [data-rv-back-assignment]')) {
      clearFocusIntent();
      return;
    }

    if (event.target.closest('[data-rv-focus-prev], [data-rv-focus-next]')) {
      clearFocusIntent();
    }
  }

  function restoreFocusSelection() {
    if (!root || !queue) return;

    if (!document.body.classList.contains('rv-qol-focus')) {
      if (pendingIntentIsFresh()) {
        scheduleRetry();
        return;
      }
      clearFocusIntent();
      return;
    }

    rememberCurrentSelection();
    if (!focusedSubmissionId) return;

    const header = queue.querySelector(
      `.rv-submission-header[data-submission-id="${cssEscape(focusedSubmissionId)}"]`
    );
    const item = header?.closest('.rv-submission-item');
    if (!item) {
      scheduleRetry();
      return;
    }

    let changed = false;
    queue.querySelectorAll('.rv-submission-item.rv-qol-selected').forEach(candidate => {
      if (candidate !== item) {
        candidate.classList.remove('rv-qol-selected');
        changed = true;
      }
    });

    if (!item.classList.contains('rv-qol-selected')) {
      item.classList.add('rv-qol-selected');
      changed = true;
    }

    if (header.getAttribute('aria-expanded') !== 'true') {
      header.click();
      changed = true;
    }

    if (intentPending) {
      intentPending = false;
      intentStartedAt = 0;
    }

    const autoTable = item.querySelector('.rv-auto-table');
    const evidenceReady = !autoTable || Boolean(item.querySelector('.rv-question-evidence-panel'));
    if (changed || !evidenceReady) {
      window.dispatchEvent(new Event('rc-review-question-evidence-rescan'));
    }

    if (stabilizationActive() && (changed || !evidenceReady)) {
      scheduleRetry();
    }
  }

  function scheduleRestore() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      restoreFocusSelection();
    }, 0);
  }

  function attach() {
    root = document.getElementById('rvReviewCommandCenter');
    queue = document.getElementById('rvQueue');
    if (!root || !queue) return false;

    root.addEventListener('click', handleFocusIntent, true);

    const queueObserver = new MutationObserver(() => {
      rememberCurrentSelection();
      scheduleRestore();
    });
    queueObserver.observe(queue, { childList: true });

    const rootObserver = new MutationObserver(() => {
      rememberCurrentSelection();
      scheduleRestore();
    });
    rootObserver.observe(root, { childList: true, subtree: true });

    scheduleRestore();
    return true;
  }

  if (attach()) return;

  const bootstrapObserver = new MutationObserver(() => {
    if (!attach()) return;
    bootstrapObserver.disconnect();
  });
  bootstrapObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
