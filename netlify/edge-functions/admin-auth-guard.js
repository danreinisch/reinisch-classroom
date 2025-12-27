/**
 * Netlify Edge Function: Admin access guard
 *
 * Required behavior:
 * - Unauth GET /admin/ => 302 to /admin-login/?reason=missing_admin_session (NOT /hub)
 * - Auth teacher (tc cookie valid) => allow /admin/ and add: X-Admin-Session: teacher-session-valid
 * - Validation must call SAME ORIGIN: /.netlify/functions/teacher-session and forward cookies
 *
 * Guardrails:
 * - DO NOT edit netlify.toml here (edge routing handled elsewhere)
 */

function redirectToAdminLogin() {
  return new Response(null, {
    status: 302,
    headers: { Location: "/hub/?reason=missing_admin_session&next=%2Fadmin%2F" },
  });
}

function isAdminPath(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function hasTcCookie(cookieHeader) {
  // Matches "tc=" at start or after a semicolon delimiter.
  return /(^|;\s*)tc=/.test(cookieHeader || "");
}

export default async (request, context) => {
  const url = new URL(request.url);

  // Only guard /admin and /admin/* (avoid accidental matches like /admin-login)
  if (!isAdminPath(url.pathname)) return context.next();

  const cookie = request.headers.get("cookie") || "";

  // If no tc cookie at all, short-circuit to admin-login (no session to validate)
  if (!hasTcCookie(cookie)) return redirectToAdminLogin();

  // Validate teacher session via SAME ORIGIN function call, forwarding cookies
  try {
    const verifyUrl = new URL("/.netlify/functions/teacher-session", url.origin);
    const verifyRes = await fetch(verifyUrl.toString(), {
      method: "GET",
      headers: cookie ? { cookie } : {},
    });

    if (verifyRes.status !== 200) return redirectToAdminLogin();

    const res = await context.next();
    res.headers.set("X-Admin-Session", "teacher-session-valid");
    return res;
  } catch (_err) {
    return redirectToAdminLogin();
  }
};
