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
        firstPromise = Promise.resolve().then(() => original.apply(this, args));
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
}
