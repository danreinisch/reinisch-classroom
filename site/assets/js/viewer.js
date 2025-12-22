// viewer.js

/* eslint-disable no-unused-vars */
// NOTE: This file is maintained in-repo; keep changes minimal.

(function () {
  'use strict';

  // ...existing code...

  // The following regex previously contained a useless escape that triggered
  // eslint(no-useless-escape). The forward slash does not need escaping inside
  // a character class, so we remove the backslash.
  // (Line numbers may differ after formatting.)
  const _unusedEscapeFixExample = /[a-zA-Z0-9/._-]+/;

  // ...existing code...
})();
