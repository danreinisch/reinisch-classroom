/**
 * Student Portal Failsafe Timer
 * Ensures login view is visible if authentication fails to complete
 * Part of Guardrails Stage 3B - externalized from inline script
 */

(function () {
  "use strict";

  // A) Failsafe visibility timer: Force #loginView visible if window.authReady not set within 3s
  // This runs BEFORE any async work to prevent top-level errors from leaving page blank

  const urlParams = new URLSearchParams(window.location.search);
  const DEBUG_MODE = urlParams.get("debug") === "1";
  const FAILSAFE_DELAY_MS = DEBUG_MODE ? 0 : 3000; // No delay in debug mode

  if (DEBUG_MODE) {
    console.log("[HOTFIX][failsafe] Debug mode enabled - failsafe timer bypassed");
  }

  setTimeout(() => {
    // Skip failsafe if redirect is happening
    if (window.__redirectingToHub === true) {
      if (DEBUG_MODE) {
        console.log("[HOTFIX][failsafe] Skipping - redirect to hub in progress");
      }
      return;
    }

    // Parse URL parameters to detect deep-link mode
    const urlParams = new URLSearchParams(window.location.search);
    const auto = urlParams.get("auto");
    const code = urlParams.get("code");
    const isDeepLinkMode = auto === "1" && code && code.trim().length > 0;

    // Handle deep-link mode: redirect to hub if auth hasn't become ready
    if (isDeepLinkMode && !window.authReady) {
      console.warn(
        "[HOTFIX][failsafe] Deep-link mode detected but auth not ready after " +
          FAILSAFE_DELAY_MS +
          "ms, redirecting to hub"
      );

      if (DEBUG_MODE) {
        console.log("[HOTFIX][failsafe] Deep-link failsafe redirect triggered:", {
          auto,
          code: code ? "(present)" : "(missing)",
          authReady: window.authReady,
        });
      }

      // Set redirect flag and redirect to hub
      window.__redirectingToHub = true;

      // Hide login view
      const loginView = document.getElementById("loginView");
      if (loginView) loginView.style.display = "none";

      // Show redirect message
      const redirectDiv = document.createElement("div");
      redirectDiv.style.cssText =
        "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;font-weight:600;color:#e6edf3;text-align:center;";
      redirectDiv.textContent = "Redirecting to Hub…";
      document.body.appendChild(redirectDiv);

      // Redirect to hub
      window.location.replace("/hub/");
      return;
    }

    // Skip normal failsafe if deep-link auto-login is in progress (but auth is becoming ready)
    if (window.__deepLinkAutoLogin === true) {
      if (DEBUG_MODE) {
        console.log("[HOTFIX][failsafe] Skipping - deep-link auto-login in progress");
      }
      return;
    }

    // Only fire if window.authReady is not set
    if (!window.authReady) {
      const loginView = document.getElementById("loginView");
      const dashboardView = document.getElementById("studentDashboardView");
      const teacherView = document.getElementById("teacherCenterView");

      // Check if any view is visible
      const isLoginVisible = loginView && !loginView.classList.contains("hidden");
      const isDashboardVisible = dashboardView && !dashboardView.classList.contains("hidden");
      const isTeacherVisible = teacherView && !teacherView.classList.contains("hidden");

      if (!isLoginVisible && !isDashboardVisible && !isTeacherVisible) {
        console.warn(
          "[HOTFIX][failsafe] TRIGGERED - No view visible after " +
            FAILSAFE_DELAY_MS +
            "ms, forcing login view"
        );

        if (DEBUG_MODE) {
          console.log("[HOTFIX][failsafe] Current state:", {
            authReady: window.authReady,
            loginHidden: loginView?.classList.contains("hidden"),
            dashboardHidden: dashboardView?.classList.contains("hidden"),
            teacherHidden: teacherView?.classList.contains("hidden"),
          });
        }

        // Force show login view defensively
        if (loginView) {
          loginView.classList.remove("hidden");
          console.log("[HOTFIX][failsafe] Login view forced visible");
        }

        // Hide other views
        if (dashboardView) dashboardView.classList.add("hidden");
        if (teacherView) teacherView.classList.add("hidden");
      } else if (DEBUG_MODE) {
        console.log("[HOTFIX][failsafe] Check passed - a view is visible or authReady is set");
      }
    } else if (DEBUG_MODE) {
      console.log("[HOTFIX][failsafe] Check passed - authReady is true");
    }
  }, FAILSAFE_DELAY_MS);
})();
