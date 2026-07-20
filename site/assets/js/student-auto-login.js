(function () {
  'use strict';

  try {
    const urlParams =
      new URLSearchParams(
        window.location.search
      );

    const auto =
      urlParams.get('auto');

    const urlCode =
      urlParams.get('code');

    if (
      auto === '1' &&
      urlCode &&
      urlCode.trim().length > 0
    ) {
      // A URL may suggest which student intended to sign in,
      // but possession of a student code is never authentication.
      //
      // Keep only a harmless login hint. The student must still
      // complete the normal password login flow, which creates
      // the signed HttpOnly sc session cookie.
      sessionStorage.setItem(
        'rc_student_login_hint',
        urlCode
          .trim()
          .toUpperCase()
      );

      console.log(
        '[auto-login] Student code hint received; ' +
        'authentication is still required'
      );
    }
  } catch (err) {
    console.error(
      '[auto-login] Error:',
      err
    );
  }
})();
