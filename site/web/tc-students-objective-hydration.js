(() => {
  'use strict';

  const path =
    window.location.pathname
      .replace(/\/index\.html$/i, '/')
      .replace(/\/+$/, '') || '/';

  if (path !== '/teacher/students') {
    return;
  }

  const HYDRATION_ATTR =
    'data-objective-hydration-requested';

  const BOOT_WINDOW_MS =
    8000;

  let observer = null;
  let stopTimer = null;

  function hasObjectiveProgressPanel(container) {
    return Array
      .from(
        container.querySelectorAll(
          'div, strong'
        )
      )
      .some(element =>
        String(
          element.textContent || ''
        ).trim() ===
          'IEP Objective Progress'
      );
  }

  function needsObjectiveHydration(container) {
    if (
      !container ||
      !container.classList ||
      !container.classList.contains(
        'st-expanded-content'
      )
    ) {
      return false;
    }

    if (
      container.hasAttribute(
        HYDRATION_ATTR
      )
    ) {
      return false;
    }

    const activeGoalsTab =
      container.querySelector(
        '.st-tab.active[data-tab="goals"]'
      );

    if (!activeGoalsTab) {
      return false;
    }

    if (
      container.querySelector(
        '.st-objective-manual-entry'
      )
    ) {
      return false;
    }

    return hasObjectiveProgressPanel(
      container
    );
  }

  function requestObjectiveHydration(container) {
    if (
      !needsObjectiveHydration(
        container
      )
    ) {
      return false;
    }

    const activeGoalsTab =
      container.querySelector(
        '.st-tab.active[data-tab="goals"]'
      );

    if (!activeGoalsTab) {
      return false;
    }

    /*
     * First-load alert expansion intentionally renders without optional
     * per-student objective enrichment. Re-enter the existing Goals-tab
     * render boundary once, after the initial paint, so the normal signed
     * objective-progress read can decide whether Record Evidence controls
     * are allowed. Do not recreate eligibility or write logic here.
     */
    container.setAttribute(
      HYDRATION_ATTR,
      'true'
    );

    window.setTimeout(
      () => {
        if (
          !container.isConnected ||
          !activeGoalsTab.isConnected
        ) {
          return;
        }

        activeGoalsTab.click();
      },
      0
    );

    return true;
  }

  function scan(root) {
    if (!root) {
      return;
    }

    if (
      root.matches &&
      root.matches(
        '.st-expanded-content'
      )
    ) {
      requestObjectiveHydration(
        root
      );
    }

    if (!root.querySelectorAll) {
      return;
    }

    root
      .querySelectorAll(
        '.st-expanded-content'
      )
      .forEach(
        requestObjectiveHydration
      );
  }

  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (stopTimer) {
      window.clearTimeout(
        stopTimer
      );
      stopTimer = null;
    }
  }

  function start() {
    scan(document);

    const target =
      document.getElementById(
        'stStudentTableBody'
      ) ||
      document.body;

    if (!target) {
      return;
    }

    observer =
      new MutationObserver(
        records => {
          for (const record of records) {
            for (
              const node
              of record.addedNodes
            ) {
              if (
                node &&
                node.nodeType === 1
              ) {
                scan(node);
              }
            }
          }
        }
      );

    observer.observe(
      target,
      {
        childList: true,
        subtree: true,
      }
    );

    stopTimer =
      window.setTimeout(
        stop,
        BOOT_WINDOW_MS
      );
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      start,
      { once: true }
    );
  } else {
    start();
  }
})();
