(() => {
  'use strict';

  if (!location.pathname.startsWith('/teacher/review')) return;
  if (window.__rcReviewFinalPolishLoaded) return;
  window.__rcReviewFinalPolishLoaded = true;

  function ensureStyle() {
    if (document.querySelector('link[data-rv-final-polish-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/web/tc-review-final-polish.css?v=20260911-review-final-polish';
    link.dataset.rvFinalPolishStyle = 'true';
    document.head.appendChild(link);
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

  function attach(root, reviewLink) {
    let scheduled = false;
    const reconcile = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        syncReviewNavBadge(root, reviewLink);
        polishContextHeading(root);
      });
    };

    const commandObserver = new MutationObserver(reconcile);
    commandObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // The shared Teacher Shell may append its legacy Submitted-instance badge
    // after Review has already rendered. Watch only the Review link so this
    // page can reconcile that badge to the actual Review lifecycle count.
    const navObserver = new MutationObserver(reconcile);
    navObserver.observe(reviewLink, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    reconcile();
  }

  function start() {
    ensureStyle();

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
