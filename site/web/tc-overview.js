/**
 * Teacher Center Overview bootstrap.
 *
 * Keep the proven dashboard data/rendering logic isolated in tc-overview-core.js
 * and layer the 2026 command-center presentation on top. This keeps the UI slice
 * reversible and avoids rewriting classroom data behavior.
 */
(() => {
  "use strict";

  const VERSION = "20260910-overview-command-center1";

  function loadScript(src, onload) {
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    if (onload) script.addEventListener("load", onload, { once: true });
    script.addEventListener(
      "error",
      () => console.error(`[tc-overview] Failed to load ${src}`),
      { once: true }
    );
    document.head.appendChild(script);
  }

  loadScript(`/web/tc-overview-core.js?v=${VERSION}`, () => {
    loadScript(`/web/tc-overview-ui.js?v=${VERSION}`);
  });
})();
