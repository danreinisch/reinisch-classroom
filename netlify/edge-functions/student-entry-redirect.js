/**
 * Student Entry Redirect Edge Function
 * 
 * Purpose: Enforce server-side redirect at the edge to prevent the legacy student portal
 * login UI from being displayed at /student/ while preserving valid auto-login deep links.
 * 
 * Behavior:
 * - GET /student or /student/ with NO valid deep link params → 302 redirect to /hub/
 * - GET /student/?auto=1&code=... → Allow through (deep links must keep working)
 * 
 * Related: PR #252 - Deploy Netlify Edge Function to redirect /student/ to /hub/
 */

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Only process the base student portal paths (/student and /student/)
  // Other paths like /student/test-portal-b.html should pass through
  if (path !== '/student' && path !== '/student/') {
    return context.next();
  }

  // Check for valid auto-login deep link parameters
  // Note: This validation is intentionally duplicated from client-side code
  // (student-portal-redirect.js) to provide defense in depth
  const auto = url.searchParams.get('auto');
  const code = url.searchParams.get('code');

  // If auto=1 is present but code is missing or empty, redirect to hub
  // This prevents invalid deep link attempts from showing the login UI
  // Check invalid case first to fail fast
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

  // Allow through if auto=1 AND code is present and non-empty
  // This is the inverse of the invalid check above - both are needed for clarity
  const hasValidAutoLogin = auto === '1' && code && code.trim().length > 0;

  if (hasValidAutoLogin) {
    // Valid auto-login deep link - allow request to proceed
    return context.next();
  }

  // No valid auto-login params - redirect to hub
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/hub/',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
};
