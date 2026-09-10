// Safety guard for the Gradebook Student Order editor.
//
// The editor must never persist a partial roster. tc-gradebook.js can render a
// subset while student search is debouncing or while Missing Work is filtered,
// so this guard blocks opening/saving until the full class roster is visible.
// It also keeps keyboard focus inside the modal while it is open.

const SEARCH_SETTLE_MS = 300;
const SEARCH_SETTLING_ATTR = 'data-gb-order-search-settling';

function setStatus(root, message) {
  const status = root.querySelector('.gb-student-order-status');
  if (status) status.textContent = message;

  const live = root.querySelector('#gbA11yStatus');
  if (live) live.textContent = message;
}

export function getStudentOrderUnsafeReason(root = document) {
  const search = root.querySelector('#gbStudentSearch');
  if (search && String(search.value || '').trim()) {
    return 'Clear the student search before changing class order.';
  }

  if (search?.hasAttribute(SEARCH_SETTLING_ATTR)) {
    return 'Student search is still restoring the full roster. Try again in a moment.';
  }

  const missingOnly = root.querySelector(
    '.gb-missing-filter-label input[type="checkbox"]:checked'
  );
  if (missingOnly) {
    return 'Turn off “Show only students with missing work” before changing class order.';
  }

  return '';
}

function storageIsAvailable(root) {
  try {
    const storage = root?.defaultView?.localStorage;
    if (!storage) return false;
    const probe = '__rc_gradebook_order_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function hasExplicitColumnSort(root) {
  return Boolean(
    root.querySelector(
      '#gbTableHead th[aria-sort="ascending"], #gbTableHead th[aria-sort="descending"]'
    )
  );
}

function focusableElements(dialog) {
  return Array.from(
    dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(element => !element.hidden);
}

function installDialogFocusTrap(root, backdrop) {
  if (!backdrop || backdrop.dataset.gbOrderFocusTrap === 'true') return;
  const dialog = backdrop.querySelector('.gb-student-order-dialog');
  if (!dialog) return;

  backdrop.dataset.gbOrderFocusTrap = 'true';
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;

    const focusable = focusableElements(dialog);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = root.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

export function installGradebookStudentOrderSafety(root = document) {
  if (!root || root.documentElement?.dataset.gbStudentOrderSafety === 'true') {
    return null;
  }

  if (root.documentElement) {
    root.documentElement.dataset.gbStudentOrderSafety = 'true';
  }

  const search = root.querySelector('#gbStudentSearch');
  let settleTimer = null;
  if (search) {
    search.addEventListener('input', () => {
      search.setAttribute(SEARCH_SETTLING_ATTR, 'true');
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        search.removeAttribute(SEARCH_SETTLING_ATTR);
      }, SEARCH_SETTLE_MS);
    });
  }

  root.addEventListener('click', event => {
    const orderButton = event.target.closest?.('#gbStudentOrderButton');
    const dialogAction = event.target.closest?.('[data-order-dialog-action]');
    const isSave = dialogAction?.dataset.orderDialogAction === 'save';

    if (orderButton || isSave) {
      const reason = getStudentOrderUnsafeReason(root);
      if (reason) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(root, reason);
        return;
      }
    }

    if (dialogAction?.dataset.orderDialogAction === 'reset') {
      // If browser storage is unavailable, no custom order could have been
      // persisted; reset is therefore a successful no-op rather than an error.
      if (!storageIsAvailable(root)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        root.querySelector('#gbStudentOrderBackdrop')?.remove();
        setStatus(root, 'Using the default student order; browser storage is unavailable.');
        return;
      }

      // For classes without a shipped IC default, core Gradebook column sorting
      // owns the default visible order. Do not delete a saved custom order while
      // a sort is active and leave the table/status in disagreement.
      if (
        dialogAction.textContent.trim() === 'Reset to Default' &&
        hasExplicitColumnSort(root)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(root, 'Clear the active Gradebook column sort before resetting student order.');
      }
    }
  }, true);

  const Observer =
    root.defaultView?.MutationObserver ||
    (typeof MutationObserver !== 'undefined' ? MutationObserver : null);

  const observer = Observer
    ? new Observer(() => {
        installDialogFocusTrap(
          root,
          root.querySelector('#gbStudentOrderBackdrop')
        );
      })
    : null;

  observer?.observe(root.body || root.documentElement, {
    childList: true,
    subtree: true,
  });

  installDialogFocusTrap(
    root,
    root.querySelector('#gbStudentOrderBackdrop')
  );

  return {
    observer,
    dispose() {
      clearTimeout(settleTimer);
      observer?.disconnect();
    },
  };
}

if (
  typeof document !== 'undefined' &&
  typeof window !== 'undefined' &&
  window.location.pathname.startsWith('/teacher/gradebook')
) {
  installGradebookStudentOrderSafety(document);
}
