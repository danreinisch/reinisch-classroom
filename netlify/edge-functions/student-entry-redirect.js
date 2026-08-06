/**
 * Student Entry Redirect Edge Function
 * 
 * PR 265: Allow /student/ to be a stable entrypoint with login UI
 * 
 * Purpose: Provide server-side validation for student portal deep links while
 * allowing direct access to /student/ for login.
 * 
 * Behavior:
 * - GET /student or /student/ with NO params → Allow through (show login UI)
 * - GET /student/?auto=1&code=... → Allow through (deep link auto-login)
 * - GET /student/?auto=1 (without code) → Redirect to /hub/ (invalid deep link)
 * 
 * Related: PR 265 - Session-only student authentication
 */


const LOCAL_SUPABASE_CONNECT_SOURCE =
  "http://127.0.0.1:54321";

function isLocalBrowserHost(url) {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  );
}

function addConnectSource(policy, source) {
  if (!policy || policy.includes(source)) {
    return policy;
  }

  return policy.replace(
    /connect-src\s+([^;]*)/,
    (match, sources) =>
      `connect-src ${sources.trim()} ${source}`
  );
}

function applyLocalSupabaseCsp(response, url) {
  if (!isLocalBrowserHost(url)) {
    return response;
  }

  for (const headerName of [
    "Content-Security-Policy",
    "Content-Security-Policy-Report-Only",
  ]) {
    const currentPolicy =
      response.headers.get(headerName);

    if (!currentPolicy) {
      continue;
    }

    response.headers.set(
      headerName,
      addConnectSource(
        currentPolicy,
        LOCAL_SUPABASE_CONNECT_SOURCE
      )
    );
  }

  return response;
}

async function nextWithLocalSupabaseCsp(
  context,
  url
) {
  const response =
    await context.next();

  return applyLocalSupabaseCsp(
    response,
    url
  );
}

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Only process the base student portal paths (/student and /student/)
  // Other paths like /student/test-portal-b.html should pass through
  if (path !== '/student' && path !== '/student/') {
    return nextWithLocalSupabaseCsp(
      context,
      url
    );
  }

  // Check for valid auto-login deep link parameters
  const auto = url.searchParams.get('auto');
  const code = url.searchParams.get('code');

  // If auto=1 is present but code is missing or empty, redirect to hub
  // This prevents invalid deep link attempts from showing the login UI
  if (auto === '1' && (!code || code.trim().length === 0)) {
    // Invalid auto-login parameters - redirect to hub
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/hub/',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  }

  // All other cases: allow request to proceed to serve student portal
  // This includes:
  // - No query parameters (direct access to login UI)
  // - Valid auto-login deep link (auto=1 with valid code)
  return nextWithLocalSupabaseCsp(
    context,
    url
  );
};
