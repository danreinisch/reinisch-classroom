(() => {
  'use strict';

  if (!location.pathname.startsWith('/teacher/review')) return;
  if (window.__rcReviewReadShareLoaded) return;
  window.__rcReviewReadShareLoaded = true;

  const SHARED_METHODS = [
    'listStudents',
    'listAssignments',
    'listSubmissions',
    'listAssignmentInstances',
  ];

  import('/web/data-adapter.js?v=2026082401')
    .then(({ db }) => {
      for (const methodName of SHARED_METHODS) {
        const original = db?.[methodName];
        if (typeof original !== 'function') continue;

        let firstKey = null;
        let firstPromise = null;
        let oneShareAvailable = false;

        db[methodName] = function reviewSharedInitialRead(...args) {
          const key = JSON.stringify(args || []);

          if (!firstPromise) {
            firstKey = key;
            oneShareAvailable = true;
            firstPromise = Promise.resolve().then(() => original.apply(this, args));
            return firstPromise;
          }

          if (oneShareAvailable && key === firstKey) {
            oneShareAvailable = false;
            const shared = firstPromise;
            firstPromise = null;
            firstKey = null;
            return shared;
          }

          return original.apply(this, args);
        };
      }
    })
    .catch(error => {
      console.warn('[review] Could not install shared initial reads:', error);
    });
})();
