(() => {
  'use strict';

  if (!location.pathname.startsWith('/teacher/review')) return;
  if (window.__rcReviewFinalPolishLoaded) return;
  window.__rcReviewFinalPolishLoaded = true;

  let pendingFocus = null;
  let focusRepairStage = 0;

  function ensureStyle() {
    if (document.querySelector('link[data-rv-final-polish-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/web/tc-review-final-polish.css?v=20260911-review-final-polish';
    link.dataset.rvFinalPolishStyle = 'true';
    document.head.appendChild(link);
  }

  function installResubmitLanguage() {
    if (typeof window.rcConfirm !== 'function' || window.__rcReviewResubmitConfirmWrapped) return;
    const originalConfirm = window.rcConfirm;
    window.__rcReviewResubmitConfirmWrapped = true;
    window.rcConfirm = function reviewConfirm(title, message, confirmLabel, options) {
      if (title === 'Reopen Submission') {
        return originalConfirm(
          'Resubmit to Student',
          'Send this finalized assignment back to the student? It will move back to In Progress so the student can revise and submit it again.',
          'Resubmit',
          options
        );
      }
      return originalConfirm(title, message, confirmLabel, options);
    };
  }

  function readNeedsReviewCount(root) {
    const countNode = root?.querySelector(
      '[data-rv-status-card="needs-review"] .rv-qol-status-count'
    );
    if (!countNode) return null;
    const parsed = Number.parseInt(countNode.textContent || '', 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  }

  function syncReviewNavBadge(root, reviewLink) {
    const count = readNeedsReviewCount(root);
    if (count == null || !reviewLink) return;

    let badge = reviewLink.querySelector('.tc-badge');
    if (count === 0) {
      badge?.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tc-badge';
      reviewLink.appendChild(badge);
    }

    const text = count > 99 ? '99+' : String(count);
    if (badge.textContent !== text) badge.textContent = text;

    const label = `${count} submission${count === 1 ? '' : 's'} needing review`;
    if (badge.getAttribute('aria-label') !== label) {
      badge.setAttribute('aria-label', label);
    }
  }

  function polishContextHeading(root) {
    const heading = root?.querySelector('.rv-qol-section-title h2');
    const activeClass = root?.querySelector(
      '.rv-qol-class-button.is-active span:nth-child(2)'
    );
    if (!heading || !activeClass) return;

    const folder = root.querySelector('.rv-qol-folder-button.is-active span:nth-child(3)');
    const folderLabel = folder?.textContent?.trim() || 'All Assignments';
    const classLabel = activeClass.textContent?.trim();
    if (!classLabel) return;

    const desired = folderLabel === 'All Assignments'
      ? classLabel
      : `${folderLabel} · ${classLabel}`;
    if (heading.textContent !== desired) heading.textContent = desired;
  }

  function polishResubmitButton(root) {
    const button = root?.querySelector('[data-rv-proxy="reopen"]');
    if (!button) return;
    if (button.textContent !== 'Resubmit to Student') button.textContent = 'Resubmit to Student';
    button.setAttribute('aria-label', 'Resubmit this finalized assignment to the student');
    button.title = 'Moves this assignment back to In Progress for the student.';

    const selected = document.querySelector('#rvQueue .rv-submission-item.rv-qol-selected');
    const legacyButton = selected?.querySelector('.rv-btn-reopen');
    if (legacyButton) {
      legacyButton.textContent = '↩ Resubmit to Student';
      legacyButton.setAttribute('aria-label', 'Resubmit this finalized assignment to the student');
    }
  }

  function captureFocusIntent(root) {
    if (root.dataset.rvFinalFocusCapture === 'true') return;
    root.dataset.rvFinalFocusCapture = 'true';
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-rv-focus]');
      if (!button) return;
      const row = button.closest('tr');
      pendingFocus = {
        id: String(button.dataset.rvFocus || ''),
        studentCode: row?.querySelector('td:first-child strong')?.textContent?.trim() || '',
        assignmentTitle: root.querySelector('.rv-qol-assignment-head h1')?.textContent?.trim() || '',
      };
      focusRepairStage = 0;
    }, true);
  }

  function normalizeAssignmentTitle(value, studentCode = '') {
    let result = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (studentCode) {
      const escaped = studentCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result
        .replace(new RegExp(`\\s+(?:for\\s+)?${escaped}(?:\\s*#\\d+)?\\s*$`, 'i'), '')
        .replace(new RegExp(`\\s*[—–-]\\s*${escaped}(?:\\s*#\\d+)?\\s*$`, 'i'), '');
    }
    return result.replace(/[—–-]\s*$/g, '').trim();
  }

  function chooseTargetAssignmentOption() {
    if (!pendingFocus) return false;
    const select = document.getElementById('rvAssignmentFilter');
    if (!select) return false;
    const wanted = normalizeAssignmentTitle(pendingFocus.assignmentTitle, pendingFocus.studentCode);
    const options = [...select.options].filter(option => option.value !== 'All Assignments');
    const studentCode = pendingFocus.studentCode.toLowerCase();
    const exactStudent = options.find(option => {
      const text = option.textContent?.trim() || '';
      return studentCode && text.toLowerCase().includes(studentCode) &&
        normalizeAssignmentTitle(text, pendingFocus.studentCode) === wanted;
    });
    const logicalMatch = exactStudent || options.find(option =>
      normalizeAssignmentTitle(option.textContent || '', pendingFocus.studentCode) === wanted
    );
    if (!logicalMatch || select.value === logicalMatch.value) return Boolean(logicalMatch);
    select.value = logicalMatch.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function repairReadOnlyFocus() {
    if (!pendingFocus || !document.body.classList.contains('rv-qol-focus')) return;
    const queue = document.getElementById('rvQueue');
    if (!queue) return;

    const target = queue.querySelector(
      `.rv-submission-header[data-submission-id="${window.CSS?.escape ? CSS.escape(pendingFocus.id) : pendingFocus.id}"]`
    );
    if (target) {
      const item = target.closest('.rv-submission-item');
      if (target.getAttribute('aria-expanded') !== 'true') target.click();
      if (item?.classList.contains('rv-qol-selected')) {
        pendingFocus = null;
        focusRepairStage = 0;
      }
      return;
    }

    if (!queue.querySelector('.rv-empty')) return;

    if (focusRepairStage === 0) {
      focusRepairStage = 1;
      const allClasses = [...document.querySelectorAll('#rvClassFilters .rv-filter-btn')]
        .find(button => button.dataset.class === 'All Classes');
      if (allClasses && !allClasses.classList.contains('active')) {
        allClasses.click();
        return;
      }
    }

    if (focusRepairStage <= 1) {
      focusRepairStage = 2;
      chooseTargetAssignmentOption();
    }
  }

  function attach(root, reviewLink) {
    captureFocusIntent(root);
    let scheduled = false;
    const reconcile = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        installResubmitLanguage();
        syncReviewNavBadge(root, reviewLink);
        polishContextHeading(root);
        polishResubmitButton(root);
        repairReadOnlyFocus();
      });
    };

    const commandObserver = new MutationObserver(reconcile);
    commandObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const navObserver = new MutationObserver(reconcile);
    navObserver.observe(reviewLink, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const queue = document.getElementById('rvQueue');
    if (queue) {
      const queueObserver = new MutationObserver(reconcile);
      queueObserver.observe(queue, { childList: true, subtree: true });
    }

    reconcile();
  }

  function start() {
    ensureStyle();
    installResubmitLanguage();

    const findAndAttach = () => {
      const root = document.querySelector('.rv-qol-command');
      const reviewLink = document.querySelector(
        '.tc-nav a[data-href="/teacher/review/"]'
      );
      if (!root || !reviewLink) return false;
      attach(root, reviewLink);
      return true;
    };

    if (findAndAttach()) return;

    const bootstrapObserver = new MutationObserver(() => {
      if (!findAndAttach()) return;
      bootstrapObserver.disconnect();
    });
    bootstrapObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
