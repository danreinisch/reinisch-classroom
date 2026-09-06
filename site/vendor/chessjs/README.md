# chess.js 1.4.0

Vendored ESM build from the official npm package. BSD-2-Clause; see LICENSE.

- Upstream: https://github.com/jhlywa/chess.js/tree/v1.4.0
- Package: https://registry.npmjs.org/chess.js/-/chess.js-1.4.0.tgz
- Package integrity: `sha512-BBJgrrtKQOzFLonR0l+k64A98NLemPwNsCskwb+29bRwobUa4iTm51E1kwGPbWXAcfdDa18nad6vpPPKPWarqw==`
- Local changes: removed the unused source-map URL and patched `setComment` to
  replace every opening/closing brace, rather than just the first occurrence.
  The comment patch fixes two CodeQL incomplete-escaping findings and has a
  regression test that round-trips repeated/nested braces through PGN.
- Browser imports pin the patched build as `chess.js?v=1.4.0-rc1`.
- Local chess.js SHA-256: `ce937c7ad60790fc4bb91b328a4975f8aefbcf52e0dfcd5cd36c6eb65db0c6e0`

Served locally. No CDN or third-party service is contacted during play.
