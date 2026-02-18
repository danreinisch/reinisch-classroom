/**
 * Teacher Center Overview Dashboard
 * Displays KPIs and quick links to key modules
 */

(async () => {
  "use strict";

  // Only run on overview page
  if (!location.pathname.startsWith("/teacher/")) return;
  if (location.pathname !== "/teacher/" && location.pathname !== "/teacher/index.html") return;

  console.log("[tc-overview] Initializing overview dashboard");

  // Import data adapter
  const { db, isRemote } = await import("/web/data-adapter.js");

  // DOM helper
  const $ = (id) => document.getElementById(id);

  // State
  let syncStatus = "local";

  /**
   * Get current quarter based on today's date using default hardcoded ranges
   * Note: Custom quarter dates can be configured in Settings page (rc_quarter_dates)
   * but are not yet used for auto-detection here - this uses hardcoded defaults only
   */
  function getCurrentQuarter() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    // Default: Q1: August 16 - October 17
    if ((month === 8 && day >= 16) || month === 9 || (month === 10 && day <= 17)) return "Q1";

    // Q2: October 18 - December 19
    if ((month === 10 && day >= 18) || month === 11 || (month === 12 && day <= 19)) return "Q2";

    // Q3: December 20 - March 6 (spans year boundary)
    if ((month === 12 && day >= 20) || month === 1 || month === 2 || (month === 3 && day <= 6))
      return "Q3";

    // Q4: March 7 - May 20
    if ((month === 3 && day >= 7) || month === 4 || (month === 5 && day <= 20)) return "Q4";

    // Summer fallback
    return "Q4";
  }

  /**
   * Update sync status indicator
   */
  function updateSyncStatus() {
    const statusEl = $("ovSyncStatus");
    const iconEl = $("ovSyncIcon");
    const textEl = $("ovSyncText");

    if (!statusEl || !iconEl || !textEl) return;

    // Show the status indicator
    statusEl.style.display = "inline-flex";

    // Remove all status classes
    statusEl.classList.remove("synced", "local", "error");

    // Add appropriate class and set content
    if (syncStatus === "synced") {
      statusEl.classList.add("synced");
      iconEl.textContent = "🟢";
      textEl.textContent = "Synced with Supabase";
    } else if (syncStatus === "error") {
      statusEl.classList.add("error");
      iconEl.textContent = "🔴";
      textEl.textContent = "Sync error (using local data)";
    } else {
      statusEl.classList.add("local");
      iconEl.textContent = "🟡";
      textEl.textContent = "Local mode";
    }
  }

  /**
   * Load and display KPIs
   */
  async function loadKPIs() {
    try {
      // Fetch data
      const students = await db.listStudents();
      const submissions = await db.listSubmissions();
      const goals = await db.listGoalsAll();

      // Calculate KPIs
      const totalStudents = students.filter((s) => s.active !== false).length;
      const pendingReview = submissions.filter((s) => s.review_status === "pending").length;
      const currentQuarter = getCurrentQuarter();
      const activeGoals = goals.filter((g) => g.status === "active").length;

      // Update DOM
      const kpiStudents = $("kpiStudents");
      const kpiReview = $("kpiReview");
      const kpiQuarter = $("kpiQuarter");
      const kpiGoals = $("kpiGoals");

      if (kpiStudents) kpiStudents.textContent = totalStudents;
      if (kpiReview) kpiReview.textContent = pendingReview;
      if (kpiQuarter) kpiQuarter.textContent = currentQuarter;
      if (kpiGoals) kpiGoals.textContent = activeGoals;

      // Update sync status
      syncStatus = isRemote() ? "synced" : "local";
      updateSyncStatus();

      console.log("[tc-overview] KPIs loaded:", {
        totalStudents,
        pendingReview,
        currentQuarter,
        activeGoals,
      });
    } catch (error) {
      console.error("[tc-overview] Error loading KPIs:", error);
      syncStatus = "error";
      updateSyncStatus();
    }
  }

  // Initialize
  await loadKPIs();
})();
