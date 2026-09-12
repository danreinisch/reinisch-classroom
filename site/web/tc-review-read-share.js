'use strict';

if (location.pathname.startsWith('/teacher/review') && !window.__rcReviewReadShareLoaded) {
  window.__rcReviewReadShareLoaded = true;

  const { db } = await import('/web/data-adapter.js?v=2026082401');
  const SHARED_METHODS = [
    'listStudents',
    'listAssignments',
    'listSubmissions',
    'listAssignmentInstances',
  ];
  const SHARE_WINDOW_MS = 5000;
  const initialResults = new Map();

  // Presentation-only consumers may reuse the already-loaded initial snapshot
  // instead of issuing another full read. The returned arrays are never mutated
  // by this helper and later Review refreshes still use the ordinary adapter path.
  window.__rcReviewInitialReadSnapshot = function reviewInitialReadSnapshot(methodName) {
    return initialResults.get(methodName) ?? null;
  };

  for (const methodName of SHARED_METHODS) {
    const original = db?.[methodName];
    if (typeof original !== 'function') continue;

    let firstKey = null;
    let firstPromise = null;
    let shareAvailable = false;
    let sharingComplete = false;
    let expiresAt = 0;

    db[methodName] = function reviewSharedInitialRead(...args) {
      if (sharingComplete) return original.apply(this, args);

      const key = JSON.stringify(args || []);
      const now = Date.now();

      if (firstPromise && now > expiresAt) {
        firstPromise = null;
        firstKey = null;
        shareAvailable = false;
        sharingComplete = true;
        return original.apply(this, args);
      }

      if (!firstPromise) {
        firstKey = key;
        shareAvailable = true;
        expiresAt = now + SHARE_WINDOW_MS;
        firstPromise = Promise.resolve()
          .then(() => original.apply(this, args))
          .then(value => {
            if (!initialResults.has(methodName)) initialResults.set(methodName, value);
            return value;
          });
        return firstPromise;
      }

      if (shareAvailable && key === firstKey) {
        shareAvailable = false;
        sharingComplete = true;
        const shared = firstPromise;
        firstPromise = null;
        firstKey = null;
        expiresAt = 0;
        return shared;
      }

      sharingComplete = true;
      firstPromise = null;
      firstKey = null;
      shareAvailable = false;
      expiresAt = 0;
      return original.apply(this, args);
    };
  }

  // Expanded Review rows can be asked to render more than once while the command
  // center is settling. Share only identical in-flight answer reads; do not retain
  // a result cache here. tc-review.js remains authoritative for resolved caching.
  const originalListSubmissionAnswers = db?.listSubmissionAnswers;
  if (typeof originalListSubmissionAnswers === 'function') {
    const pendingSubmissionReads = new Map();
    db.listSubmissionAnswers = function reviewSharedSubmissionAnswers(...args) {
      const key = JSON.stringify(args || []);
      const existing = pendingSubmissionReads.get(key);
      if (existing) return existing;

      const pending = Promise.resolve()
        .then(() => originalListSubmissionAnswers.apply(this, args))
        .finally(() => {
          if (pendingSubmissionReads.get(key) === pending) {
            pendingSubmissionReads.delete(key);
          }
        });
      pendingSubmissionReads.set(key, pending);
      return pending;
    };
  }
}
