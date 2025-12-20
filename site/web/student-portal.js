/* global Papa */
// Import diagnostics early for client request ID and wrapFetch
import "./diagnostics.js";

// Import CSV validation utilities
import { buildIEPValidator } from "./csv-iep-validators.js";

// Import auth-handoff utilities and Portal B helpers
import { readAuth, clearAuth, onAuthChange } from "./auth-handoff.js";
import { getFeatureFlag } from "./feature-flags.js";
import { db } from "./data-adapter.js";
import { createStudentApiAdapter } from "./student-api.js";

// Initialize hubHealth tracking for student portal
if (!window.hubHealth) {
  window.hubHealth = {};
}
if (!window.hubHealth.studentPortal) {
  window.hubHealth.studentPortal = { attempts: 0, loaded: false };
}

// Track module import attempts and success
window.hubHealth.studentPortal.attempts++;

let portalModulesLoaded = false;

try {
  // Measure portal-b-helpers import time
  const helpersStart = performance.now();
  const {
    AssignmentStatus,
    computeAssignmentStatus,
    groupAssignmentsByStatus,
    filterAssignments,
    calculateOverallAverage,
    calculateClassAverages,
    calculateTrend,
    getSparklineData,
    truncateText,
    formatDateTime,
    countMissingAssignments,
    countLateAssignments,
    getQuarter,
    groupSubmissionsByQuarter,
    calculateQuarterAverages,
    getQuarterSparklineData,
    filterSubmissionsByQuarter,
  } = await import("./portal-b-helpers.js");
  const helpersDuration = performance.now() - helpersStart;

  // Record metric if telemetry is available
  if (window.rcTelemetry) {
    window.rcTelemetry.recordMetric("dynamic-import-portal-b-helpers", helpersDuration);
  }

  // Measure portal-b-ui import time
  const uiStart = performance.now();
  const {
    loadStudentAssignmentsPortalB,
    loadGradesCard: loadGradesCardUI,
    showToast,
    startClock,
    setupResubmissionHandlers,
    setupAssignmentTabs,
    setupFilters,
    setupAssignmentDetailHandlers,
    openAssignmentDetail,
    closeAssignmentDetail,
  } = await import("./portal-b-ui.js");
  const uiDuration = performance.now() - uiStart;

  // Record metric if telemetry is available
  if (window.rcTelemetry) {
    window.rcTelemetry.recordMetric("dynamic-import-portal-b-ui", uiDuration);
  }

  // Mark modules as loaded
  portalModulesLoaded = true;
  window.hubHealth.studentPortal.loaded = true;
  console.log("[student-portal] Portal B modules loaded successfully");

  // Export to global scope for use in the rest of the script
  window.portalBHelpers = {
    AssignmentStatus,
    computeAssignmentStatus,
    groupAssignmentsByStatus,
    filterAssignments,
    calculateOverallAverage,
    calculateClassAverages,
    calculateTrend,
    getSparklineData,
    truncateText,
    formatDateTime,
    countMissingAssignments,
    countLateAssignments,
    getQuarter,
    groupSubmissionsByQuarter,
    calculateQuarterAverages,
    getQuarterSparklineData,
    filterSubmissionsByQuarter,
  };

  window.portalBUI = {
    loadStudentAssignmentsPortalB,
    loadGradesCardUI,
    showToast,
    startClock,
    setupResubmissionHandlers,
    setupAssignmentTabs,
    setupFilters,
    setupAssignmentDetailHandlers,
    openAssignmentDetail,
    closeAssignmentDetail,
  };
} catch (err) {
  console.error("[student-portal] Failed to load portal modules:", err);
  window.hubHealth.studentPortal.loaded = false;
  window.hubHealth.studentPortal.error = err.message;

  // Determine if this is a recoverable error (e.g., network issue, single module)
  // vs. a hard failure (syntax error, missing critical dependencies)
  const isRecoverable = err.name === "TypeError" && err.message.includes("fetch");

  if (isRecoverable) {
    // Show a non-blocking toast for recoverable errors
    console.warn("[student-portal] Recoverable error - showing toast notification");

    // Create a simple toast notification (UI might not be loaded yet)
    const toastHtml = `
        <div class="toast warning" style="position:fixed; top:80px; right:20px; z-index:100; max-width:400px;">
          <div class="toast-header">
            <div class="toast-title">⚠️ Module Load Issue</div>
            <button class="toast-close" data-action="dismiss-toast">×</button>
          </div>
          <div class="toast-body">
            Some portal features may be unavailable. Try refreshing if you experience issues.
          </div>
          <div style="margin-top:12px;">
            <button class="btn small primary" data-action="refresh-page">Refresh Now</button>
          </div>
        </div>
      `;
    document.body.insertAdjacentHTML("beforeend", toastHtml);

    // Add event listeners for toast actions
    const toast = document.querySelector(".toast.warning");
    if (toast) {
      const dismissBtn = toast.querySelector('[data-action="dismiss-toast"]');
      if (dismissBtn) {
        dismissBtn.addEventListener("click", function () {
          this.closest(".toast").remove();
        });
      }

      const refreshBtn = toast.querySelector('[data-action="refresh-page"]');
      if (refreshBtn) {
        refreshBtn.addEventListener("click", function () {
          location.reload();
        });
      }
    }

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      const toast = document.querySelector(".toast.warning");
      if (toast) toast.remove();
    }, 10000);

    // Don't throw - continue with degraded functionality
  } else {
    // Hard failure - show full error card
    const container = document.querySelector(".container");
    if (container) {
      container.innerHTML = `
          <div class="card" style="max-width:600px; margin:80px auto; text-align:center;">
            <div style="font-size:48px; margin-bottom:16px;">⚠️</div>
            <h2 style="margin-bottom:12px;">Student Portal Unavailable</h2>
            <p class="subtle" style="margin-bottom:20px;">
              We're having trouble loading the student portal. This is usually a temporary issue.
            </p>
            <div class="error-msg" style="text-align:left; margin-bottom:20px;">
              <strong>Technical details:</strong><br>
              ${err.message}
            </div>
            <div style="display:flex; gap:12px; justify-content:center;">
              <button class="btn primary" data-action="reload-page">Reload Page</button>
              <button class="btn" data-action="return-hub">Return to Hub</button>
            </div>
          </div>
        `;

      // Add event listeners for error card actions
      const reloadBtn = container.querySelector('[data-action="reload-page"]');
      if (reloadBtn) {
        reloadBtn.addEventListener("click", function () {
          location.reload();
        });
      }

      const hubBtn = container.querySelector('[data-action="return-hub"]');
      if (hubBtn) {
        hubBtn.addEventListener("click", function () {
          location.href = "/hub/";
        });
      }
    }

    // Don't continue with the rest of the script
    throw err;
  }
}

// Use imported modules from global scope
const {
  AssignmentStatus,
  computeAssignmentStatus,
  groupAssignmentsByStatus,
  filterAssignments,
  calculateOverallAverage,
  calculateClassAverages,
  calculateTrend,
  getSparklineData,
  truncateText,
  formatDateTime,
  countMissingAssignments,
  countLateAssignments,
  getQuarter,
  groupSubmissionsByQuarter,
  calculateQuarterAverages,
  getQuarterSparklineData,
  filterSubmissionsByQuarter,
} = window.portalBHelpers;

const {
  loadStudentAssignmentsPortalB,
  loadGradesCardUI,
  showToast,
  startClock,
  setupResubmissionHandlers,
  setupAssignmentTabs,
  setupFilters,
  setupAssignmentDetailHandlers,
  openAssignmentDetail,
  closeAssignmentDetail,
} = window.portalBUI;

// HOTFIX: Debug mode support: ?debug=1 enables verbose logging and bypasses failsafe delay
// Make it globally available for early scripts
const urlParams = new URLSearchParams(window.location.search);
const DEBUG_MODE = urlParams.get("debug") === "1";
window.DEBUG_MODE = DEBUG_MODE; // Make available globally

if (DEBUG_MODE) {
  console.log("[student-portal] DEBUG MODE ENABLED - verbose logging active");
}

// TODO: DIAGNOSTIC - Temporary force-enable flag for top bar testing
// Remove this constant once visual checks are complete
const DIAGNOSTIC_FORCE_TOP_BAR = true;

/**
 * Resolve portalTopBar feature flag with diagnostic overrides
 * Precedence: query param > localStorage > hard default(DIAGNOSTIC_FORCE_TOP_BAR) > getFeatureFlag fallback
 */
function resolvePortalTopBar() {
  // 1. Check query parameter ?forceTopBar=1 or ?forceTopBar=0
  const forceTopBarParam = urlParams.get("forceTopBar");
  if (forceTopBarParam === "1") {
    console.log("[student-portal] Top bar ENABLED via query param");
    return true;
  }
  if (forceTopBarParam === "0") {
    console.log("[student-portal] Top bar DISABLED via query param");
    return false;
  }

  // 2. Check localStorage rc_forceTopBar
  const forceTopBarStorage = localStorage.getItem("rc_forceTopBar");
  if (forceTopBarStorage === "1") {
    console.log("[student-portal] Top bar ENABLED via localStorage");
    return true;
  }
  if (forceTopBarStorage === "0") {
    console.log("[student-portal] Top bar DISABLED via localStorage");
    return false;
  }

  // 3. Hard default (diagnostic phase)
  if (DIAGNOSTIC_FORCE_TOP_BAR) {
    console.log("[student-portal] Top bar ENABLED via DIAGNOSTIC_FORCE_TOP_BAR");
    return true;
  }

  // 4. Fallback to feature flag
  const flagValue = getFeatureFlag("portalTopBar");
  console.log("[student-portal] Top bar using feature flag:", flagValue);
  return flagValue;
}

// Feature flags
const feature = {
  portalTeacherLoginInStudent: false, // Hide teacher login in Student Portal (default: false for rollback safety)
  portalAssignmentsStatus: getFeatureFlag("portalAssignmentsStatus"),
  portalGradesCard: getFeatureFlag("portalGradesCard"),
  portalResubmission: getFeatureFlag("portalResubmission"),
  portalTopBar: resolvePortalTopBar(),
  portalQuarterAverages: getFeatureFlag("portalQuarterAverages"),
  portalQuarterlyExport: getFeatureFlag("portalQuarterlyExport"),
};

// Local storage namespace
const STORAGE_KEY = "rc_student_hub_";

// Simple query selector helpers
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => document.querySelectorAll(sel);

// Local storage helpers
const store = {
  get: (key, def = null) => {
    try {
      const val = localStorage.getItem(STORAGE_KEY + key);
      return val ? JSON.parse(val) : def;
    } catch {
      return def;
    }
  },
  set: (key, val) => {
    localStorage.setItem(STORAGE_KEY + key, JSON.stringify(val));
  },
};

// In-page data structures (offline mode)
let students = store.get("students", []);
let assignments = store.get("assignments", []);
let assignmentInstances = store.get("assignmentInstances", []);
let iepGoals = store.get("iepGoals", []);
let gradebookEntries = store.get("gradebookEntries", []);
let iepEntries = store.get("iepEntries", []);

// Current session
let currentUser = null;
let userRole = null; // 'student' or 'teacher'

// Phase 3: Auth ready flag to prevent double-login and race conditions
let authReady = false; // Set to true once authentication is complete to prevent login view from reappearing

// Active database adapter - switches based on user role
// For students: uses student-api (Netlify functions only, no direct Supabase)
// For teachers: uses standard db adapter (with Supabase access)
let activeDb = db;

// Portal B: State management
let assignmentGroups = {};
let submissionsMap = {};
let currentFilters = {};
let pendingResubmission = null;
let clockInterval = null;

// Banner helper functions
/**
 * Show diagnostic banner for adapter failures
 * @param {Object} options - Banner configuration
 * @param {string} options.type - Banner type: 'error', 'warning', or 'info'
 * @param {string} options.title - Banner title
 * @param {string} options.message - Banner message
 */
function showBanner({ type = "error", title, message }) {
  const banner = qs("#portalBanner");
  const icon = qs("#portalBannerIcon");
  const titleEl = qs("#portalBannerTitle");
  const messageEl = qs("#portalBannerMessage");

  if (!banner || !icon || !titleEl || !messageEl) {
    console.error("[portal-banner] Banner elements not found");
    return;
  }

  // Set icon based on type
  const icons = {
    error: "⚠️",
    warning: "⚠️",
    info: "ℹ️",
  };
  icon.textContent = icons[type] || icons.error;

  // Set content
  titleEl.textContent = title;
  messageEl.textContent = message;

  // Set type class
  banner.className = `portal-banner ${type}`;

  console.log(`[portal-banner] Showing ${type} banner:`, title);
}

/**
 * Clear/hide the diagnostic banner
 */
function clearBanner() {
  const banner = qs("#portalBanner");
  if (banner) {
    banner.classList.add("hidden");
    console.log("[portal-banner] Banner cleared");
  }
}

// Listen for auth changes from other tabs via BroadcastChannel
if (typeof onAuthChange === "function") {
  const cleanup = onAuthChange((event) => {
    console.log("[student-portal] Auth change received from other tab:", event.type);

    if (event.type === "auth-updated" && event.auth) {
      // Another tab signed in - if it's a student, auto-login here too
      if (event.auth.role === "student" && event.auth.code) {
        console.log("[student-portal] Auto-login from other tab");
        attemptStudentAutoLogin(event.auth.code, event.auth.name).then((success) => {
          if (success) {
            showStudentDashboard();
          }
        });
      }
    } else if (event.type === "auth-cleared") {
      // Another tab logged out - clear session here too
      console.log("[student-portal] Logout from other tab");
      currentUser = null;
      userRole = null;
      sessionStorage.removeItem("rc_user_code");
      sessionStorage.removeItem("rc_user_role");
      showLogin();
    }
  });
}

// Login mode tabs
qsa("[data-login-mode]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const mode = tab.dataset.loginMode;
    qsa("[data-login-mode]").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    if (mode === "student") {
      qs("#studentLoginForm").classList.remove("hidden");
      qs("#teacherLoginForm").classList.add("hidden");
    } else {
      qs("#studentLoginForm").classList.add("hidden");
      qs("#teacherLoginForm").classList.remove("hidden");
    }
  });
});

// Phase 1: Hide teacher login UI if feature flag is false (default behavior)
if (!feature.portalTeacherLoginInStudent) {
  console.log("[portal-auth] Teacher login disabled in Student Portal (feature flag: false)");

  // Hide teacher login tab
  const teacherTab = document.querySelector('[data-login-mode="teacher"]');
  if (teacherTab) {
    teacherTab.style.display = "none";
  }

  // Hide teacher login form
  const teacherForm = qs("#teacherLoginForm");
  if (teacherForm) {
    teacherForm.style.display = "none";
  }

  // Update page title and subtitle for clarity
  const loginTitle = document.querySelector("#loginView h1");
  const loginSubtitle = document.querySelector("#loginView .subtle");
  if (loginTitle) {
    loginTitle.textContent = "Student Portal";
  }
  if (loginSubtitle) {
    loginSubtitle.textContent = "Login to access your dashboard";
  }
}

// Student login
qs("#btnStudentLogin").addEventListener("click", async () => {
  const code = qs("#loginCode").value.trim();
  const password = qs("#loginPassword").value;

  if (!code || !password) {
    showError("Please enter both code and password");
    return;
  }

  console.log("[portal-auth] Student login attempt for code:", code);

  try {
    // Phase 4: Use server-side student-login endpoint for verification
    // This ensures credentials are verified server-side without exposing Supabase keys
    console.log("[portal-auth] Attempting server-side verification");

    // IMPORTANT: Same-origin relative URL required for preview deploy compatibility
    // (see comment in /hub/index.html for detailed explanation)
    const response = await fetch("/.netlify/functions/student-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, password }),
    });

    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      // Server-side verification failed
      const errorMsg = result.error || "Invalid student code or password";
      console.warn("[portal-auth] Server-side verification failed:", errorMsg);

      // Check if we should use local fallback (development mode only)
      const isLocalDev =
        window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

      if (isLocalDev && response.status === 503) {
        // Service unavailable - try local fallback in dev mode
        console.warn("[portal-auth] Service unavailable, trying local fallback (dev mode)");
        try {
          const valid = await db.verifyStudentPassword(code, password);
          if (!valid) {
            showError("Invalid student code or password");
            return;
          }
        } catch (localErr) {
          console.error("[portal-auth] Local fallback failed:", localErr);
          showError("Authentication failed: " + localErr.message);
          return;
        }
      } else {
        // Production mode or other error - show error
        showError(errorMsg);
        return;
      }
    } else {
      console.log("[portal-auth] Server-side verification successful");
    }

    const studentList = await db.listStudents();
    const student = studentList.find((s) => s.code === code);

    if (!student) {
      showError("Student not found");
      return;
    }

    console.log("[portal-auth] Student login successful:", student.name || code);

    currentUser = student;
    userRole = "student";
    
    // Switch to student API adapter (Netlify functions only, no direct Supabase)
    console.log("[student-portal] Switching to student API adapter for code:", currentUser.code);
    activeDb = createStudentApiAdapter(currentUser.code);
    
    sessionStorage.setItem("rc_user_code", code);
    sessionStorage.setItem("rc_user_role", "student");
    showStudentDashboard();
  } catch (err) {
    console.error("[portal-auth] Login error:", err);

    // Check if we're in local dev mode for fallback
    const isLocalDev =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    if (isLocalDev) {
      console.warn("[portal-auth] Network error, trying local fallback (dev mode)");
      try {
        const valid = await db.verifyStudentPassword(code, password);
        if (!valid) {
          showError("Invalid student code or password");
          return;
        }

        const studentList = await db.listStudents();
        const student = studentList.find((s) => s.code === code);

        if (!student) {
          showError("Student not found");
          return;
        }

        currentUser = student;
        userRole = "student";
        
        // Switch to student API adapter (Netlify functions only, no direct Supabase)
        console.log("[student-portal] Switching to student API adapter for code:", currentUser.code);
        activeDb = createStudentApiAdapter(currentUser.code);
        
        sessionStorage.setItem("rc_user_code", code);
        sessionStorage.setItem("rc_user_role", "student");
        showStudentDashboard();
        return;
      } catch (localErr) {
        console.error("[portal-auth] Local fallback failed:", localErr);
        showError("Login failed: " + localErr.message);
        return;
      }
    }

    // Production mode - show generic error
    showError("Login service unavailable. Please try again.");
  }
});

// Teacher login
qs("#btnTeacherLogin").addEventListener("click", async () => {
  const password = qs("#teacherPassword").value;

  if (!password) {
    showError("Please enter teacher password");
    return;
  }

  try {
    const valid = await db.verifyTeacherPassword(password);
    if (!valid) {
      showError("Invalid teacher password");
      return;
    }

    currentUser = { name: "Teacher", role: "teacher" };
    userRole = "teacher";
    sessionStorage.setItem("rc_user_role", "teacher");
    showTeacherCenter();
  } catch (err) {
    console.error("Login error:", err);
    showError("Login failed: " + err.message);
  }
});

// Legacy #btnLogout event handler - used by teacher center only
const legacyLogoutBtn = qs("#btnLogout");
if (legacyLogoutBtn) {
  legacyLogoutBtn.addEventListener("click", () => {
    console.log("[portal-auth] Logout initiated from legacy button (teacher)");

    currentUser = null;
    userRole = null;

    // Phase 3: Reset authReady flag to allow login view to show
    authReady = false;

    // Clear only auth-related sessionStorage keys
    sessionStorage.removeItem("rc_user_code");
    sessionStorage.removeItem("rc_user_role");
    clearAuth(); // Clear 24-hour auth handoff

    // Redirect to site root instead of showing in-page login
    window.location.href = "/";
  });
}

// Enter key handlers
qs("#loginPassword").addEventListener("keypress", (e) => {
  if (e.key === "Enter") qs("#btnStudentLogin").click();
});
qs("#teacherPassword").addEventListener("keypress", (e) => {
  if (e.key === "Enter") qs("#btnTeacherLogin").click();
});

function showError(msg) {
  const errorDiv = qs("#loginError");
  if (errorDiv) {
    errorDiv.textContent = msg;
    errorDiv.classList.remove("hidden");
  }
}

function showLogin() {
  // HOTFIX: Removed authReady guard - always allow showing login view
  // This ensures login is always visible on errors/failures
  // TODO: Review guard logic after hotfix is stable

  if (DEBUG_MODE) {
    console.log("[student-portal] showLogin() called, authReady:", authReady);
  }

  console.log("[student-portal] Showing login view");

  // HOTFIX: Defensive hardening - always unhide login, always hide others
  // Do not bail early due to prior state flags
  const loginView = qs("#loginView");
  const dashboardView = qs("#studentDashboardView");
  const teacherView = qs("#teacherCenterView");
  const loginCode = qs("#loginCode");
  const loginPassword = qs("#loginPassword");
  const teacherPassword = qs("#teacherPassword");
  const loginError = qs("#loginError");
  const portalTopBar = qs("#portalTopBar");
  const legacyHeader = qs("#legacyHeader");

  // Always unhide login view - never bail
  if (loginView) {
    loginView.classList.remove("hidden");
  } else {
    console.error("[HOTFIX][showLogin] loginView element not found!");
  }

  // Always hide dashboard and teacher views - never bail
  if (dashboardView) dashboardView.classList.add("hidden");
  if (teacherView) teacherView.classList.add("hidden");
  if (portalTopBar) portalTopBar.classList.add("hidden");
  if (legacyHeader) legacyHeader.style.display = "none";

  // Clear form fields
  if (loginCode) loginCode.value = "";
  if (loginPassword) loginPassword.value = "";
  if (teacherPassword) teacherPassword.value = "";

  // Clear error state
  if (loginError) loginError.classList.add("hidden");

  // Restore login UI elements (tabs and forms) - ensure they're visible
  const studentForm = qs("#studentLoginForm");
  const teacherForm = qs("#teacherLoginForm");
  const tabs = document.querySelector("#loginView .tabs");
  const subtitle = document.querySelector("#loginView .subtle");

  if (studentForm) studentForm.classList.remove("hidden");
  if (tabs) tabs.classList.remove("hidden");
  if (subtitle) subtitle.classList.remove("hidden");

  console.log("[student-portal] Login view restored successfully");
}

async function showStudentDashboard() {
  // HOTFIX: Guard against missing currentUser - call showLogin() and return
  if (!currentUser) {
    console.error("[HOTFIX][showStudentDashboard] currentUser is null, falling back to login");
    if (DEBUG_MODE) {
      console.log("[HOTFIX][showStudentDashboard] State:", { currentUser, userRole, authReady });
    }
    showLogin();
    return;
  }

  console.log(
    "[student-portal] Showing student dashboard for",
    currentUser.code || currentUser.name
  );

  // Phase 3: Mark auth as ready to prevent login view from reappearing
  window.authReady = true;

  // HOTFIX: Always reveal dashboard FIRST, then hide login (order matters!)
  const loginView = qs("#loginView");
  const dashboardView = qs("#studentDashboardView");
  const teacherView = qs("#teacherCenterView");

  // 1. Always unhide dashboard and teacher view (order: show first)
  if (dashboardView) {
    dashboardView.classList.remove("hidden");
  } else {
    console.error("[HOTFIX][showStudentDashboard] dashboardView element not found!");
    showLogin();
    return;
  }

  // 2. Hide other views AFTER dashboard is visible
  if (loginView) loginView.classList.add("hidden");
  if (teacherView) teacherView.classList.add("hidden");

  // Legacy header (#userChip, #btnLogout) removed - Portal B top bar is the only student logout UI

  // Portal B: Show top status bar if enabled (feature-flag controlled widget)
  if (feature.portalTopBar) {
    const topBar = qs("#portalTopBar");
    const studentNameEl = qs("#portalStudentName");
    if (topBar) {
      topBar.classList.remove("hidden");
      if (studentNameEl) {
        // Handle PII removal: prefer code if name is missing
        studentNameEl.textContent = currentUser.name || currentUser.code;
      }
      startClock();
    }
  }

  // HOTFIX: Wrap data loads in try/catch with showFatalBanner on failure
  // Dashboard remains visible even if data loads fail
  try {
    await loadStudentAssignments();
  } catch (err) {
    console.error("[HOTFIX][showStudentDashboard] Failed to load assignments:", err);
    const errorMsg =
      DEBUG_MODE && err.message
        ? "Could not load assignments. Error: " + err.message
        : "Could not load your assignments. Please refresh the page or contact your teacher.";
    if (typeof window.showFatalBanner === "function") {
      window.showFatalBanner(errorMsg, "error");
    }
  }

  try {
    await loadStudentGoals();
  } catch (err) {
    console.error("[HOTFIX][showStudentDashboard] Failed to load goals:", err);
    const errorMsg =
      DEBUG_MODE && err.message
        ? "Could not load IEP goals. Error: " + err.message
        : "Could not load your IEP goals. Please refresh the page or contact your teacher.";
    if (typeof window.showFatalBanner === "function") {
      window.showFatalBanner(errorMsg, "warning");
    }
  }

  // Portal B: Show grades card if enabled (feature-flag controlled widget)
  if (feature.portalGradesCard) {
    try {
      await loadGradesCard();
    } catch (err) {
      console.error("[HOTFIX][showStudentDashboard] Failed to load grades card:", err);
      const errorMsg =
        DEBUG_MODE && err.message
          ? "Could not load grades. Error: " + err.message
          : "Could not load your grades. Please refresh the page or contact your teacher.";
      if (typeof window.showFatalBanner === "function") {
        window.showFatalBanner(errorMsg, "warning");
      }
    }
  }

  // Portal B: Check for missing/late assignments and show toast
  if (feature.portalAssignmentsStatus && assignmentGroups) {
    const missingCount = countMissingAssignments(assignmentGroups);
    const lateCount = countLateAssignments(assignmentGroups);

    if (missingCount > 0) {
      showToast({
        title: "Missing Assignments",
        message: `You have ${missingCount} missing assignment${missingCount > 1 ? "s" : ""}. Please review and submit.`,
        type: "warning",
        link: {
          text: "View Missing",
          action: () => {
            qs('[data-status-tab="missing"]').click();
            qs("#missingSection").scrollIntoView({ behavior: "smooth" });
          },
        },
      });
    } else if (lateCount > 0) {
      showToast({
        title: "Late Assignments",
        message: `You have ${lateCount} late assignment${lateCount > 1 ? "s" : ""}. Submit soon to avoid missing status.`,
        type: "info",
        link: {
          text: "View Late",
          action: () => {
            qs('[data-status-tab="late"]').click();
            qs("#lateSection").scrollIntoView({ behavior: "smooth" });
          },
        },
      });
    }
  }
}

async function showTeacherCenter() {
  console.log("[portal-auth] Showing teacher center");

  // Phase 3: Mark auth as ready
  authReady = true;

  qs("#loginView").classList.add("hidden");
  qs("#studentDashboardView").classList.add("hidden");
  qs("#teacherCenterView").classList.remove("hidden");

  // Show legacy header for teacher center
  const legacyHeader = qs("#legacyHeader");
  const userChip = qs("#userChip");
  const btnLogout = qs("#btnLogout");

  if (legacyHeader) legacyHeader.style.display = "block";
  if (userChip) {
    userChip.classList.remove("hidden");
    userChip.textContent = "Teacher";
  }
  if (btnLogout) {
    btnLogout.classList.remove("hidden");
  }

  await loadTeacherAssignments();
}

async function loadStudentAssignments() {
  // Portal B: Use new assignment loading with grouping
  const helpers = {
    AssignmentStatus,
    groupAssignmentsByStatus,
    filterAssignments,
    truncateText,
    formatDateTime,
    calculateOverallAverage,
    calculateClassAverages,
    calculateTrend,
    getSparklineData,
    getQuarter,
    groupSubmissionsByQuarter,
    calculateQuarterAverages,
    getQuarterSparklineData,
    filterSubmissionsByQuarter,
  };

  const result = await loadStudentAssignmentsPortalB(activeDb, currentUser, feature, qs, helpers);

  // Store for later use globally and create context for assignment detail modal
  window.assignmentGroups = result.groups;
  window.submissionsMap = result.submissionsMap;

  // Fetch assignment data for detail modal
  const assignmentsList = await activeDb.listAssignments();
  window.assignmentMap = new Map(assignmentsList.map((a) => [a.id, a]));

  // Create context for assignment detail modal
  const context = {
    assignmentGroups: window.assignmentGroups,
    submissionsMap: window.submissionsMap,
    assignmentMap: window.assignmentMap,
    feature,
    helpers,
    currentStatusTab: getCurrentStatusTab(),
  };

  // Setup assignment detail handlers with context
  setupAssignmentDetailHandlers(context);

  // Check for deep-link: #assignment/{instance_id}
  const hash = window.location.hash;
  if (hash.startsWith("#assignment/")) {
    const instanceId = hash.substring("#assignment/".length);
    if (instanceId) {
      // Delay to ensure DOM is ready
      setTimeout(() => {
        openAssignmentDetail(instanceId, context);
      }, 100);
    }
  }
}

// Helper to get current active status tab
function getCurrentStatusTab() {
  const activeTab = document.querySelector("[data-status-tab].active");
  return activeTab ? activeTab.dataset.statusTab : "all";
}

async function loadGradesCard() {
  // Portal B: Load grades card with quarterly features
  const helpers = {
    calculateOverallAverage,
    calculateClassAverages,
    calculateTrend,
    getSparklineData,
    formatDateTime,
    getQuarter,
    groupSubmissionsByQuarter,
    calculateQuarterAverages,
    getQuarterSparklineData,
    filterSubmissionsByQuarter,
  };

  await loadGradesCardUI(activeDb, currentUser, qs, helpers, feature);
}

// Track retry attempts for goals loading
let goalsRetryCount = 0;
const MAX_GOALS_RETRIES = 3;
const GOALS_RETRY_DELAYS = [2000, 5000, 10000]; // Exponential backoff: 2s, 5s, 10s

async function loadStudentGoals() {
  let goals = [];
  let progressAvailable = true;
  
  try {
    // Separate goals and progress fetching
    try {
      goals = await activeDb.listGoalsByStudentCode(currentUser.code);
      qs("#goalsCount").textContent = goals.length;
    } catch (goalsErr) {
      console.error("[student-api] Failed to fetch goals list:", goalsErr);
      qs("#goalsCount").textContent = "—";
      
      // If we can't get goals at all, schedule retry
      if (goalsRetryCount < MAX_GOALS_RETRIES) {
        const delay = GOALS_RETRY_DELAYS[goalsRetryCount] || 10000;
        goalsRetryCount++;
        
        const goalsContent = qs("#goalsContent");
        if (goalsContent) {
          goalsContent.innerHTML =
            `<div class="subtle" style="text-align:center; padding:20px">Loading goals... (attempt ${goalsRetryCount}/${MAX_GOALS_RETRIES})</div>`;
        }
        
        setTimeout(() => {
          console.log(`[student-dashboard] Retrying goals load (attempt ${goalsRetryCount}/${MAX_GOALS_RETRIES})...`);
          loadStudentGoals();
        }, delay);
      } else {
        // Max retries reached
        const goalsContent = qs("#goalsContent");
        if (goalsContent) {
          goalsContent.innerHTML =
            '<div class="subtle" style="text-align:center; padding:20px">Goals are currently unavailable. Please refresh the page or contact your teacher.</div>';
        }
      }
      return;
    }

    if (goals.length === 0) {
      qs("#goalsContent").innerHTML =
        '<div class="subtle" style="text-align:center; padding:20px">No goals available</div>';
      goalsRetryCount = 0; // Reset counter on success
      return;
    }

    // Try to fetch progress data (non-fatal if it fails)
    let entries = [];
    try {
      entries = await activeDb.listGoalProgress({ studentCodes: [currentUser.code] });
    } catch (progressErr) {
      console.error("[student-api] Failed to fetch goal progress:", progressErr);
      progressAvailable = false;
      
      // Check if this is an "unavailable" response (schema not present) vs a real error
      if (progressErr.code === 'SERVICE_UNAVAILABLE') {
        console.log("[student-dashboard] Progress service unavailable (reason: " + 
                    (progressErr.reason || 'unknown') + "), continuing without progress data");
      } else {
        console.warn("[student-dashboard] Progress fetch failed with error:", progressErr.message);
      }
    }

    // Build a map of goal -> average progress
    const byGoal = new Map();
    for (const e of entries) {
      const key = e.goal_code || e.goal_id || e.goal;
      const val =
        typeof e.percent === "number" ? e.percent : typeof e.value === "number" ? e.value : null;
      if (key && val != null) {
        const agg = byGoal.get(key) || { sum: 0, n: 0 };
        agg.sum += val;
        agg.n += 1;
        byGoal.set(key, agg);
      }
    }

    // Helper to compute average for a goal (returns "—" if no progress data available)
    const avgFor = (goalCode) => {
      if (!progressAvailable) return "—";
      const a = byGoal.get(goalCode);
      return a ? Math.round(a.sum / a.n) : 0;
    };

    let html = "";
    for (const goal of goals.slice(0, 4)) {
      const statusBadge =
        goal.status === "Open" ? "info" : goal.status === "Met" ? "success" : "warning";

      // Portal B: Truncate goal text
      const goalDesc = truncateText(goal.desc || goal.code, 140);
      const hasTooltip = (goal.desc || goal.code || "").length > 140;

      // Calculate average progress from real data
      const avgProgress = avgFor(goal.code);
      const showProgressBar = progressAvailable && typeof avgProgress === "number";

      const tooltipHtml = hasTooltip
        ? `<span class="tooltip">${goalDesc}<span class="tooltip-text">${goal.desc || goal.code}</span></span>`
        : goalDesc;

      html += `
          <div class="goal-item">
            <div style="font-size:24px">🎯</div>
            <div style="flex:1">
              <div style="font-weight:800; margin-bottom:4px">${tooltipHtml}</div>
              <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px">
                <span class="badge ${statusBadge}">${goal.status || "Open"}</span>
                <span class="subtle">Avg: ${avgProgress}${typeof avgProgress === "number" ? "%" : ""}</span>
              </div>
              ${showProgressBar ? `
              <div class="progress-bar-container">
                <div class="progress-bar" style="width:${avgProgress}%"></div>
              </div>
              ` : '<div class="subtle" style="font-size:12px">Progress data unavailable</div>'}
            </div>
          </div>
        `;
    }

    qs("#goalsContent").innerHTML = html;
    
    // Reset retry counter on success
    goalsRetryCount = 0;
    
  } catch (err) {
    console.error("[student-dashboard] Unexpected error loading goals:", err);
    
    // Schedule retry with exponential backoff (capped at MAX_GOALS_RETRIES)
    if (goalsRetryCount < MAX_GOALS_RETRIES) {
      const delay = GOALS_RETRY_DELAYS[goalsRetryCount] || 10000;
      goalsRetryCount++;
      
      const goalsContent = qs("#goalsContent");
      if (goalsContent) {
        goalsContent.innerHTML =
          `<div class="subtle" style="text-align:center; padding:20px">Goals temporarily unavailable. Retrying in ${delay/1000}s... (attempt ${goalsRetryCount}/${MAX_GOALS_RETRIES})</div>`;
      }
      
      setTimeout(() => {
        console.log(`[student-dashboard] Retrying goals load (attempt ${goalsRetryCount}/${MAX_GOALS_RETRIES})...`);
        loadStudentGoals();
      }, delay);
    } else {
      // Max retries reached - show stable error message
      console.error("[student-dashboard] Max retries reached for goals loading");
      const goalsContent = qs("#goalsContent");
      if (goalsContent) {
        goalsContent.innerHTML =
          '<div class="subtle" style="text-align:center; padding:20px">Goals are currently unavailable. Please refresh the page or contact your teacher.</div>';
      }
    }
  }
}

async function loadTeacherAssignments() {
  try {
    const assignmentList = await db.listAssignments();

    if (assignmentList.length === 0) {
      qs("#assignmentsListContent").innerHTML =
        '<div class="subtle" style="text-align:center; padding:20px">No assignments created yet</div>';
      return;
    }

    let html =
      '<table class="table"><thead><tr><th>Title</th><th>Type</th><th>Created</th></tr></thead><tbody>';

    for (const assignment of assignmentList) {
      const created = assignment.created_at
        ? new Date(assignment.created_at).toLocaleDateString()
        : "—";
      html += `<tr>
          <td>${assignment.title}</td>
          <td><span class="badge info">${assignment.type || "html"}</span></td>
          <td>${created}</td>
        </tr>`;
    }

    html += "</tbody></table>";
    qs("#assignmentsListContent").innerHTML = html;
  } catch (err) {
    console.error("Failed to load assignments:", err);
    qs("#assignmentsListContent").innerHTML =
      '<div class="error-msg">Failed to load assignments</div>';
  }
}

// Teacher tab switching
qsa("[data-teacher-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const tabName = tab.dataset.teacherTab;
    qsa("[data-teacher-tab]").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    qsa(".tab-content").forEach((content) => content.classList.remove("active"));
    qs("#tab-" + tabName).classList.add("active");

    // Load tab-specific data
    if (tabName === "gradebook") loadGradebook();
    if (tabName === "iep-progress") loadIEPProgress();
  });
});

// Gradebook CSV import
qs("#btnImportGradebook").addEventListener("click", () => {
  qs("#gradebookFileInput").click();
});

qs("#gradebookFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    complete: (results) => {
      parseGradebookCSV(results.data);
      e.target.value = ""; // Reset input
    },
    error: (err) => {
      alert("Failed to parse CSV: " + err.message);
    },
  });
});

function parseGradebookCSV(rows) {
  // Expected format: Student Code Name And Class GRADE BOOK
  // First column: Student code/name, remaining columns: dates with scores

  if (rows.length === 0) {
    alert("CSV file is empty");
    return;
  }

  // Store parsed gradebook entries
  gradebookEntries = rows.map((row, idx) => ({
    id: idx,
    ...row,
  }));
  store.set("gradebookEntries", gradebookEntries);

  loadGradebook();
  alert("Gradebook imported successfully! " + gradebookEntries.length + " entries loaded.");
}

function loadGradebook() {
  if (gradebookEntries.length === 0) {
    qs("#gradebookContent").innerHTML =
      '<div class="subtle" style="text-align:center; padding:40px">Import a gradebook CSV to view data</div>';
    return;
  }

  // Detect columns from first entry
  const firstEntry = gradebookEntries[0];
  const columns = Object.keys(firstEntry).filter((k) => k !== "id");

  // Build spreadsheet table
  let html = '<table class="spreadsheet"><thead><tr>';

  // Student column (sticky)
  html += "<th>Student</th>";

  // Date columns
  for (const col of columns.slice(1)) {
    // Skip first column (student)
    html += `<th>${col}</th>`;
  }

  html += "</tr></thead><tbody>";

  // Data rows
  for (const entry of gradebookEntries) {
    html += "<tr>";
    html += `<td>${entry[columns[0]] || ""}</td>`; // Student name

    for (const col of columns.slice(1)) {
      html += `<td>${entry[col] || "—"}</td>`;
    }

    html += "</tr>";
  }

  html += "</tbody></table>";
  qs("#gradebookContent").innerHTML = html;
}

// Export Gradebook CSV
qs("#btnExportGradebook").addEventListener("click", () => {
  if (gradebookEntries.length === 0) {
    alert("No gradebook data to export");
    return;
  }

  const csv = Papa.unparse(
    gradebookEntries.map((e) => {
      const copy = { ...e };
      delete copy.id;
      return copy;
    })
  );

  downloadCSV(csv, "gradebook_export.csv");
});

// IEP Progress Summary button
qs("#btnIEPSummary").addEventListener("click", () => {
  // Switch to IEP Progress tab
  qsa("[data-teacher-tab]").forEach((t) => t.classList.remove("active"));
  qs('[data-teacher-tab="iep-progress"]').classList.add("active");
  qsa(".tab-content").forEach((content) => content.classList.remove("active"));
  qs("#tab-iep-progress").classList.add("active");
  loadIEPProgress();
});

// IEP CSV import with validation
const iepValidator = buildIEPValidator({
  maxBytes: 1_000_000, // 1 MB
  maxRows: 2000,
  maxErrorRate: 0.1, // 10%
});

qs("#btnImportIEP").addEventListener("click", () => {
  qs("#iepFileInput").click();
});

qs("#iepFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Clear previous validation errors
  qs("#iepValidationErrors").innerHTML = "";

  // Step 1: Validate file constraints
  const fileCheck = await iepValidator.validateFile(file);
  if (!fileCheck.ok) {
    showIEPValidationErrors(fileCheck.errors);
    e.target.value = ""; // Reset input
    return;
  }

  // Step 2: Parse CSV
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      handleIEPParsedCSV(results, e);
    },
    error: (err) => {
      showIEPValidationErrors(["Failed to parse CSV: " + err.message]);
      e.target.value = ""; // Reset input
    },
  });
});

function handleIEPParsedCSV(results, event) {
  const headers = results.meta.fields || [];
  const rows = results.data || [];

  // Step 3: Validate rows
  const rowCheck = iepValidator.validateRows(headers, rows);

  if (!rowCheck.ok) {
    showIEPValidationErrors(rowCheck.errors, rowCheck.errorSummary);
    event.target.value = ""; // Reset input
    return;
  }

  // Success - import normalized rows
  iepEntries = rowCheck.normalizedRows.map((row, idx) => ({
    id: idx,
    ...row,
  }));
  store.set("iepEntries", iepEntries);

  loadIEPProgress();

  // Show success message with warnings if any
  if (rowCheck.errorSummary) {
    const { validRows, invalidRows } = rowCheck.errorSummary;
    alert(
      `Import successful!\n\n${validRows} valid rows imported.\n${invalidRows} rows had errors and were skipped.`
    );
  } else {
    alert("IEP progress imported successfully! " + iepEntries.length + " entries loaded.");
  }

  event.target.value = ""; // Reset input
}

function showIEPValidationErrors(errors, errorSummary = null) {
  let html = '<div class="validation-errors">';
  html += "<h3>❌ CSV Validation Failed</h3>";

  if (errors && errors.length > 0) {
    html += "<div>";
    errors.forEach((err) => {
      html += `<div class="error-msg" style="margin-bottom:8px">${err}</div>`;
    });
    html += "</div>";
  }

  if (errorSummary) {
    html += '<div style="margin-top:12px">';
    html += `<p><strong>Summary:</strong> ${errorSummary.validRows} valid, ${errorSummary.invalidRows} invalid (${errorSummary.errorRate}% error rate)</p>`;

    if (errorSummary.rowErrors && errorSummary.rowErrors.length > 0) {
      html += '<div class="error-list">';
      html += "<p><strong>Row Errors (first 20):</strong></p>";
      errorSummary.rowErrors.forEach((rowErr) => {
        html += '<div class="error-item">';
        html += `<strong>Row ${rowErr.row}:</strong> `;
        html += rowErr.errors.join("; ");
        html += "</div>";
      });
      html += "</div>";
    }
    html += "</div>";
  }

  html += '<div class="error-actions">';
  html += '<button class="btn small" data-action="dismiss-iep-errors">Dismiss</button>';
  html += "</div>";
  html += "</div>";

  qs("#iepValidationErrors").innerHTML = html;
}

function parseIEPCSV(rows) {
  // Legacy function - now handled by handleIEPParsedCSV
  // Keeping for backward compatibility if needed
  iepEntries = rows.map((row, idx) => ({
    id: idx,
    ...row,
  }));
  store.set("iepEntries", iepEntries);

  loadIEPProgress();
  alert("IEP progress imported successfully! " + iepEntries.length + " entries loaded.");
}

function loadIEPProgress() {
  if (iepEntries.length === 0) {
    qs("#iepProgressContent").innerHTML =
      '<div class="subtle" style="text-align:center; padding:40px">Import IEP progress CSV to view data</div>';
    return;
  }

  // Build table
  const columns = Object.keys(iepEntries[0]).filter((k) => k !== "id");

  let html = '<div class="spreadsheet-container"><table class="table"><thead><tr>';

  for (const col of columns) {
    html += `<th>${col}</th>`;
  }

  html += "</tr></thead><tbody>";

  for (const entry of iepEntries) {
    html += "<tr>";
    for (const col of columns) {
      html += `<td>${entry[col] || "—"}</td>`;
    }
    html += "</tr>";
  }

  html += "</tbody></table></div>";
  qs("#iepProgressContent").innerHTML = html;
}

// Export IEP CSV
qs("#btnExportIEP").addEventListener("click", () => {
  if (iepEntries.length === 0) {
    alert("No IEP data to export");
    return;
  }

  const csv = Papa.unparse(
    iepEntries.map((e) => {
      const copy = { ...e };
      delete copy.id;
      return copy;
    })
  );

  downloadCSV(csv, "iep_progress_export.csv");
});

// Upload assignment CSV
qs("#btnProcessUpload").addEventListener("click", () => {
  const file = qs("#uploadAssignmentCSV").files[0];
  if (!file) {
    qs("#uploadResult").innerHTML = '<div class="error-msg">Please select a file</div>';
    qs("#uploadResult").classList.remove("hidden");
    return;
  }

  Papa.parse(file, {
    header: true,
    complete: (results) => {
      processAssignmentUpload(results.data);
    },
    error: (err) => {
      qs("#uploadResult").innerHTML =
        '<div class="error-msg">Failed to parse CSV: ' + err.message + "</div>";
      qs("#uploadResult").classList.remove("hidden");
    },
  });
});

function processAssignmentUpload(rows) {
  // Mock processing - in real implementation, would call db.addProgress()
  let successCount = 0;

  for (const row of rows) {
    // TODO: Call db.addProgress() when Supabase is available
    successCount++;
  }

  qs("#uploadResult").innerHTML =
    `<div class="success-msg">Successfully processed ${successCount} entries</div>`;
  qs("#uploadResult").classList.remove("hidden");
}

// Export functions
qs("#btnExportStudents").addEventListener("click", () => {
  if (students.length === 0) {
    alert("No students to export");
    return;
  }
  const csv = Papa.unparse(students);
  downloadCSV(csv, "students_export.csv");
});

qs("#btnExportAssignments").addEventListener("click", () => {
  if (assignments.length === 0) {
    alert("No assignments to export");
    return;
  }
  const csv = Papa.unparse(assignments);
  downloadCSV(csv, "assignments_export.csv");
});

qs("#btnExportProgress").addEventListener("click", () => {
  if (iepEntries.length === 0) {
    alert("No progress to export");
    return;
  }
  const csv = Papa.unparse(iepEntries);
  downloadCSV(csv, "progress_export.csv");
});

qs("#btnExportAllData").addEventListener("click", () => {
  const allData = {
    students,
    assignments,
    assignmentInstances,
    iepGoals,
    gradebookEntries,
    iepEntries,
    exportedAt: new Date().toISOString(),
  };

  const json = JSON.stringify(allData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "all_data_export.json";
  a.click();
  URL.revokeObjectURL(url);
});

// Helper to download CSV
function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Auto-login constants
const AUTO_LOGIN_LOADING_MESSAGE = "Signing you in...";

// Simple in-memory cache for student lookups to avoid redundant fetches
// Cache is invalidated on page refresh (intentional for now)
let studentListCache = null;

// Flag to prevent concurrent roster fetches (PR B2)
let rosterFetchInProgress = false;

// Refresh handlers
qs("#btnRefreshAssignments").addEventListener("click", loadTeacherAssignments);

/**
 * Auto-login helper: attempts to detect student authentication from multiple sources
 * @returns {{code: string, name: string}|null} Object with student code if found, null otherwise
 */
function getStudentAutoAuth() {
  try {
    // Method 1: Check auth-handoff (with expiry validation)
    const auth = readAuth();
    if (auth && auth.role === "student" && auth.code) {
      console.log("[student-portal] Found valid auth from hub:", auth.code);
      if (DEBUG_MODE)
        console.log("[student-portal] Auth details:", {
          code: auth.code,
          name: auth.name,
          expiresAt: auth.expiresAt,
        });
      return { code: auth.code, name: auth.name };
    }
  } catch (err) {
    console.warn("[student-portal] Failed to read auth-handoff:", err);
  }

  try {
    // Method 2: Check sessionStorage rc_user_code (fallback for existing sessions)
    const sessionCode = sessionStorage.getItem("rc_user_code");
    if (sessionCode && typeof sessionCode === "string" && sessionCode.trim().length > 0) {
      console.log("[student-portal] Found auth in sessionStorage rc_user_code");
      return { code: sessionCode.trim(), name: null };
    }
  } catch (err) {
    console.warn("[student-portal] Failed to read sessionStorage:", err);
  }

  try {
    // Method 3: Check URL query parameter ?code= (redirect from hub)
    // Phase 2: Support auto=1&code=SXXX&name=... for auto-login handoff
    const urlParams = new URLSearchParams(window.location.search);
    const urlCode = urlParams.get("code");
    const auto = urlParams.get("auto");
    const urlName = urlParams.get("name");

    if (urlCode && typeof urlCode === "string" && urlCode.trim().length > 0 && auto === "1") {
      console.log("[student-portal] Found auto-login in URL:", {
        code: urlCode,
        name: urlName || "(none)",
      });
      return { code: urlCode.trim(), name: urlName ? urlName.trim() : null };
    }
  } catch (err) {
    console.warn("[student-portal] Failed to parse URL parameters:", err);
  }

  if (DEBUG_MODE) console.log("[student-portal] No auto-auth detected");
  return null;
}

/**
 * Show loading state in login box
 * @param {string} [message=AUTO_LOGIN_LOADING_MESSAGE] - Optional loading message
 */
function showLoginLoading(message = AUTO_LOGIN_LOADING_MESSAGE) {
  const loginBox = qs(".login-box");
  if (loginBox) {
    const loadingDiv = document.createElement("div");
    loadingDiv.id = "autoLoginLoading";
    loadingDiv.style.cssText = "text-align:center; padding:40px 20px;";

    // Create elements safely to avoid XSS
    const titleDiv = document.createElement("div");
    titleDiv.style.cssText = "font-size:20px; font-weight:800; margin-bottom:12px";
    titleDiv.textContent = message; // Use textContent to prevent XSS

    const subtitleDiv = document.createElement("div");
    subtitleDiv.className = "subtle";
    subtitleDiv.textContent = "Please wait...";

    loadingDiv.appendChild(titleDiv);
    loadingDiv.appendChild(subtitleDiv);

    // Hide other elements
    const studentForm = qs("#studentLoginForm");
    const teacherForm = qs("#teacherLoginForm");
    const tabs = loginBox.querySelector(".tabs");
    const subtitle = loginBox.querySelector(".subtle");

    if (studentForm) studentForm.classList.add("hidden");
    if (teacherForm) teacherForm.classList.add("hidden");
    if (tabs) tabs.classList.add("hidden");
    if (subtitle) subtitle.classList.add("hidden");

    loginBox.appendChild(loadingDiv);
  }
}

/**
 * Hide loading state and restore login form
 * D) Ensure this cannot exit early due to authReady guard unless dashboard is visible
 */
function hideLoginLoading() {
  // D) Only skip restoration if dashboard is actually visible
  const dashboardView = qs("#studentDashboardView");
  const isDashboardVisible = dashboardView && !dashboardView.classList.contains("hidden");

  if (authReady && isDashboardVisible) {
    console.log("[student-portal] hideLoginLoading blocked - dashboard is visible");
    return;
  }

  const loadingDiv = qs("#autoLoginLoading");
  if (loadingDiv) {
    loadingDiv.remove();
  }

  const loginBox = qs(".login-box");
  if (loginBox) {
    const studentForm = qs("#studentLoginForm");
    const teacherForm = qs("#teacherLoginForm");
    const tabs = loginBox.querySelector(".tabs");
    const subtitle = loginBox.querySelector(".subtle");

    if (studentForm) studentForm.classList.remove("hidden");
    if (tabs) tabs.classList.remove("hidden");
    if (subtitle) subtitle.classList.remove("hidden");
  }
}

/**
 * Find a student by code
 * E) Updated to match both s.code and s.student_code for code-only identity (post-PII removal)
 * PR B2: Adds fallback to fetch roster from /.netlify/functions/student-roster when not found locally
 * @param {string} code - Student code to search for
 * @returns {Promise<Object|null>} Student object if found, null otherwise
 *
 * Performance note: Uses in-memory cache to avoid redundant database fetches
 * during initialization. For production with large datasets, consider implementing
 * a database-level getStudentByCode(code) method for direct lookup.
 */
async function findStudentByCode(code) {
  try {
    // Use cache if available to avoid redundant fetches during init
    // On error, cache remains null so we retry next time
    if (!studentListCache) {
      try {
        studentListCache = await db.listStudents();
      } catch (dbErr) {
        console.error("[student-portal] Database fetch failed:", dbErr);
        // Don't cache the error - let next call retry
        return null;
      }
    }

    // E) Match either s.code or s.student_code for code-only identity (post-PII removal)
    const found = studentListCache.find((s) => s.code === code || s.student_code === code);

    // PR B2: If not found locally, try fetching roster from function and cache it
    if (!found && !rosterFetchInProgress) {
      rosterFetchInProgress = true;
      console.log(
        "[student-portal] Student not found in local roster; fetching roster from function"
      );

      try {
        // Fetch roster from same-origin endpoint (preview deploy compatible)
        // IMPORTANT: Same-origin relative URL required for preview deploys compatibility
        const response = await fetch("/.netlify/functions/student-roster");

        if (response.ok) {
          let data;
          try {
            data = await response.json();
          } catch (jsonErr) {
            console.error("[student-portal] Failed to parse roster JSON:", jsonErr);
            return null;
          }

          if (data.ok && Array.isArray(data.students) && data.students.length > 0) {
            console.log(
              `[student-portal] Successfully fetched ${data.students.length} students from roster function`
            );

            // PR C: Populate studentListCache directly from roster response (in-memory only)
            // This avoids calling db.upsertStudent() which could trigger browser → Supabase writes
            // Support both `code` and `student_code` fields for backward compatibility with different roster formats
            studentListCache = data.students.map(student => ({
              code: student.code,
              name: student.name || student.code,
              class_id: student.class_id || null,
              student_code: student.student_code || student.code, // Ensure both field names are available
            }));

            console.log(`[student-portal] Cached ${studentListCache.length} students in memory`);

            // Try to find student again in refreshed cache
            return studentListCache.find((s) => s.code === code || s.student_code === code) || null;
          } else {
            console.warn("[student-portal] Roster function returned no students");
          }
        } else {
          console.error("[student-portal] Failed to fetch roster:", response.status);
        }
      } catch (fetchErr) {
        console.error("[student-portal] Roster fetch failed:", fetchErr);
      } finally {
        rosterFetchInProgress = false;
      }
    }

    return found || null;
  } catch (err) {
    console.error("[student-portal] Failed to find student:", code, err);
    return null;
  }
}

/**
 * Set student session data
 * @param {Object} student - Student object
 * @param {string} code - Student code
 */
function setStudentSession(student, code) {
  currentUser = student;
  userRole = "student";
  
  // Switch to student API adapter (Netlify functions only, no direct Supabase)
  console.log("[student-portal] Switching to student API adapter for code:", code);
  activeDb = createStudentApiAdapter(code);
  
  sessionStorage.setItem("rc_user_code", code);
  sessionStorage.setItem("rc_user_role", "student");
}

/**
 * Attempt auto-login for student based on detected authentication
 * Prefers roster data, with robust fallback chain
 * @param {string} code - Student code from authentication source
 * @param {string} [name] - Optional student name from auth handoff
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function attemptStudentAutoLogin(code, name = null) {
  try {
    console.log("[student-portal] Attempting auto-login for student:", code);

    // Helper to normalize name strings (handle empty/whitespace)
    const normalizeName = (str) => (str && str.trim()) || null;

    // Priority 1: Try to load student from roster/db first (prefer source of truth)
    const student = await findStudentByCode(code);

    // Build student object with fallback chain
    const normalizedName = normalizeName(name);
    const rosterName = normalizeName(student?.name);

    let hydratedStudent;
    if (student && rosterName) {
      // Success: Found student in roster with valid name
      hydratedStudent = student;
      console.log("[student-portal] Student hydrated from roster:", student.name);
    } else if (student) {
      // Partial: Found student in roster but no valid name - use auth name if available
      hydratedStudent = {
        ...student,
        code, // Preserve the original code parameter
        name: normalizedName || code,
      };
      if (normalizedName) {
        console.log("[student-portal] Student found in roster, name from auth:", normalizedName);
      } else {
        console.log("[student-portal] Student found in roster, using code as name");
      }
    } else {
      // Fallback: Student not in roster - create minimal object with consistent structure
      hydratedStudent = {
        code: code,
        name: normalizedName || code,
      };
      if (normalizedName) {
        console.log("[student-portal] Student not in roster, using auth/URL name:", normalizedName);
      } else {
        console.log("[student-portal] Student not in roster, using code-only fallback");
      }
    }

    // Set session data with hydrated student
    setStudentSession(hydratedStudent, code);

    console.log("[student-portal] Auto-login successful for:", hydratedStudent.name || code);

    return true;
  } catch (err) {
    console.error("[student-portal] Auto-login failed:", err);
    return false;
  }
}

// Check for existing session
(async function init() {
  const initStartTime = Date.now();

  try {
    if (DEBUG_MODE) console.log("[student-portal] Initialization started");

    // PRIORITY 1: Check if early bootstrap already handled auto-login
    if (window.__autoLoginOk === true) {
      console.log("[student-portal] Early bootstrap succeeded, proceeding to dashboard");

      // Remove the temporary style that hid the login view
      const tempStyle = document.getElementById("auto-login-style");
      if (tempStyle) tempStyle.remove();

      // Session storage was already set by bootstrap, just need to restore user object
      const savedCode = sessionStorage.getItem("rc_user_code");
      if (savedCode) {
        // D) Show dashboard immediately, lazy-load student data
        const success = await attemptStudentAutoLogin(savedCode, null);
        if (success) {
          showStudentDashboard();
          if (DEBUG_MODE)
            console.log("[student-portal] Init completed in", Date.now() - initStartTime, "ms");
          return;
        }
      }

      // D) If bootstrap flag was set but session restore failed, clear and show login
      console.warn("[student-portal] Bootstrap flag set but session restore failed");
      window.__autoLoginOk = false;
      hideLoginLoading();
      showLogin();
      return;
    }

    // PRIORITY 2: Check for auto-login from hub or other sources
    const autoAuth = getStudentAutoAuth();

    if (autoAuth && autoAuth.code) {
      console.log("[student-portal] Auto-login detected for code:", autoAuth.code);

      // Show loading state
      showLoginLoading();

      // D) Attempt auto-login with name from auth handoff
      const success = await attemptStudentAutoLogin(autoAuth.code, autoAuth.name);

      if (success) {
        // Auto-login successful - show dashboard
        hideLoginLoading();
        showStudentDashboard();
        if (DEBUG_MODE)
          console.log("[student-portal] Init completed in", Date.now() - initStartTime, "ms");
        return;
      } else {
        // D) Auto-login failed - explicitly call hideLoginLoading() and showLogin()
        console.warn("[student-portal] Auto-login failed, falling back to login form");
        window.__autoLoginOk = false;
        hideLoginLoading();
        showLogin();
        return;
      }
    }

    // PRIORITY 3: Check for existing session
    const savedRole = sessionStorage.getItem("rc_user_role");
    const savedCode = sessionStorage.getItem("rc_user_code");

    if (savedRole === "teacher") {
      console.log("[student-portal] Restoring teacher session");
      currentUser = { name: "Teacher", role: "teacher" };
      userRole = "teacher";
      showTeacherCenter();
      if (DEBUG_MODE)
        console.log("[student-portal] Init completed in", Date.now() - initStartTime, "ms");
      return;
    } else if (savedRole === "student" && savedCode) {
      console.log("[student-portal] Restoring student session for code:", savedCode);
      try {
        const student = await findStudentByCode(savedCode);
        if (student) {
          setStudentSession(student, savedCode);
          showStudentDashboard();
          if (DEBUG_MODE)
            console.log("[student-portal] Init completed in", Date.now() - initStartTime, "ms");
          return;
        } else {
          // HOTFIX: Student not found - clear session and show login
          console.warn(
            "[HOTFIX][init] Student not found in database, clearing session and showing login"
          );
          sessionStorage.removeItem("rc_user_code");
          sessionStorage.removeItem("rc_user_role");
          showLogin();
          return;
        }
      } catch (err) {
        // HOTFIX: Session restore failed - clear session and show login
        console.error("[HOTFIX][init] Session restore failed:", err);
        sessionStorage.removeItem("rc_user_code");
        sessionStorage.removeItem("rc_user_role");
        showLogin();
        return;
      }
    }

    // Fall back to login form (only if __autoLoginOk is not set)
    if (!window.__autoLoginOk) {
      console.log("[student-portal] No session found, showing login");
      showLogin();
    }

    if (DEBUG_MODE)
      console.log("[student-portal] Init completed in", Date.now() - initStartTime, "ms");
  } catch (err) {
    console.error("[student-portal] Initialization error:", err);
    // HOTFIX: On any error, show login form
    hideLoginLoading();
    if (!window.__autoLoginOk) {
      showLogin();
    }
  }
})();

// Portal B: Setup event handlers
(function initPortalB() {
  // Setup banner dismiss button
  const bannerDismiss = qs("#portalBannerDismiss");
  if (bannerDismiss) {
    bannerDismiss.addEventListener("click", () => {
      clearBanner();
    });
  }

  // Setup resubmission handlers
  setupResubmissionHandlers(db, qs, showToast, loadStudentAssignments);

  // Setup assignment tabs
  setupAssignmentTabs(qs, qsa);

  // Setup top bar logout and help buttons
  const portalLogoutBtn = qs("#portalLogoutBtn");
  if (portalLogoutBtn) {
    portalLogoutBtn.addEventListener("click", () => {
      console.log("[portal-auth] Logout initiated from top bar");

      currentUser = null;
      userRole = null;
      authReady = false;

      // Clear only auth-related sessionStorage keys
      sessionStorage.removeItem("rc_user_code");
      sessionStorage.removeItem("rc_user_role");
      clearAuth(); // Clear 24-hour auth handoff

      // Redirect to site root instead of showing in-page login
      window.location.href = "/";
    });
  }

  const portalHelpBtn = qs("#portalHelpBtn");
  if (portalHelpBtn) {
    portalHelpBtn.addEventListener("click", () => {
      showToast({
        title: "Help & Support",
        message: "Need help? Contact your teacher or visit the Tool Kit for resources.",
        type: "info",
      });
    });
  }

  // Event delegation for dynamically created buttons
  document.addEventListener("click", (e) => {
    // Handle IEP validation errors dismiss button
    if (e.target && e.target.dataset && e.target.dataset.action === "dismiss-iep-errors") {
      const errorsContainer = qs("#iepValidationErrors");
      if (errorsContainer) {
        errorsContainer.innerHTML = "";
      }
      e.stopPropagation();
    }
  });

  // Hash change listener for deep-linking to assignment details
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash;
    if (hash.startsWith("#assignment/")) {
      const instanceId = hash.substring("#assignment/".length);
      if (instanceId && window.assignmentGroups && window.assignmentMap) {
        const helpers = {
          AssignmentStatus,
          groupAssignmentsByStatus,
          filterAssignments,
          truncateText,
          formatDateTime,
          calculateOverallAverage,
          calculateClassAverages,
          calculateTrend,
          getSparklineData,
          getQuarter,
          groupSubmissionsByQuarter,
          calculateQuarterAverages,
          getQuarterSparklineData,
          filterSubmissionsByQuarter,
        };

        const context = {
          assignmentGroups: window.assignmentGroups,
          submissionsMap: window.submissionsMap,
          assignmentMap: window.assignmentMap,
          feature,
          helpers,
          currentStatusTab: getCurrentStatusTab(),
        };

        openAssignmentDetail(instanceId, context);
      }
    }
  });

  console.log("[Portal B] Event handlers initialized");
})();
