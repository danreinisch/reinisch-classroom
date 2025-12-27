// Edge guard: requires a valid Teacher Center session to access /admin/*
// Admin SSO via Teacher Center - checks Teacher Center session
//
// This guard verifies Teacher Center sessions by calling teacher-session function
// Users must be logged in via Teacher Center (/hub/) to access admin areas
//
// Required env vars (Netlify → Environment variables):
// - SESSION_SECRET (for Teacher Center session validation)
//
// Note: This guard protects:
//   - /admin and /admin/*
//   - /.netlify/functions/incremental-deploy
// It allows these without a session:
//   - /edge-ping (health check)
// It redirects to /admin-login (not /hub) when no valid session found

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Allow health check without a session
  if (path === '/edge-ping') {
    return context.next();
  }

  // Only guard these routes
  const isAdminArea = path === '/admin' || path.startsWith('/admin/');
  const isUploadFn  = path === '/.netlify/functions/incremental-deploy';
  if (!isAdminArea && !isUploadFn) {
    return context.next();
  }

  // Check Teacher Center session by calling teacher-session function
  try {
    const sessionCheckUrl = new URL('/.netlify/functions/teacher-session', url.origin);
    
    // Forward cookies to teacher-session
    const sessionCheckRequest = new Request(sessionCheckUrl, {
      method: 'GET',
      headers: {
        'cookie': request.headers.get('cookie') || ''
      }
    });

    const sessionResponse = await fetch(sessionCheckRequest);
    
    if (sessionResponse.ok) {
      // Valid Teacher Center session
      // Optional: Future validation could check for specific roles or allowlist here
      
      console.log('[admin-auth-guard] Valid Teacher Center session, allowing access');
      return addDiagnosticHeader(context.next(), 'teacher-session-valid');
    }
    
    // No valid session - redirect to /admin-login with reason
    console.log('[admin-auth-guard] No valid Teacher Center session, redirecting to /admin-login');
    return redirectToAdminLogin('missing_admin_session');
    
  } catch (error) {
    console.error('[admin-auth-guard] Error checking Teacher Center session:', error);
    // On error, redirect to /admin-login
    return redirectToAdminLogin('missing_admin_session');
  }
};

function redirectToAdminLogin(reason = 'missing_admin_session') {
  const location = reason ? `/admin-login/?reason=${reason}` : '/admin-login/';
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex'
    }
  });
}

function addDiagnosticHeader(response, status) {
  response.headers.set('X-Admin-Session', status);
  return response;
}
