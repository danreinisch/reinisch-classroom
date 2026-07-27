/**
 * Netlify Edge Function: Teacher Center access guard
 *
 * Protects ordinary /teacher/* pages before static Teacher Center code is served.
 *
 * Explicit exclusions:
 * - /teacher/login and /teacher/login/* remain public
 * - /teacher/admin and /teacher/admin/* remain under admin-auth-guard
 *
 * Security rule:
 * - If a valid RC teacher session cannot be proven, fail closed and redirect
 *   directly to /teacher/login/ with the original path preserved in next=.
 */

function isTeacherLoginPath(pathname) {
  return (
    pathname === "/teacher/login" ||
    pathname.startsWith("/teacher/login/")
  );
}

function isTeacherAdminPath(pathname) {
  return (
    pathname === "/teacher/admin" ||
    pathname.startsWith("/teacher/admin/")
  );
}

function isProtectedTeacherPath(pathname) {
  const isTeacherPath =
    pathname === "/teacher" ||
    pathname.startsWith("/teacher/");

  return (
    isTeacherPath &&
    !isTeacherLoginPath(pathname) &&
    !isTeacherAdminPath(pathname)
  );
}

function hasTcCookie(cookieHeader) {
  return /(^|;\s*)tc=/.test(cookieHeader || "");
}

function redirectToTeacherLogin(url) {
  const next = `${url.pathname}${url.search}`;
  const location =
    `/teacher/login/?next=${encodeURIComponent(next)}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
    },
  });
}

export default async (request, context) => {
  const url = new URL(request.url);

  if (!isProtectedTeacherPath(url.pathname)) {
    return context.next();
  }

  const cookie = request.headers.get("cookie") || "";

  // No teacher cookie means there is no session to validate.
  if (!hasTcCookie(cookie)) {
    return redirectToTeacherLogin(url);
  }

  try {
    const verifyUrl = new URL(
      "/.netlify/functions/teacher-session",
      url.origin
    );

    const verifyRes = await fetch(verifyUrl.toString(), {
      method: "GET",
      headers: { cookie },
    });

    // Fail closed for 401, 500, or any other non-success response.
    if (verifyRes.status !== 200) {
      return redirectToTeacherLogin(url);
    }

    const response = await context.next();
    response.headers.set(
      "X-Teacher-Session",
      "teacher-session-valid"
    );

    return response;
  } catch (_err) {
    // Authentication infrastructure failure must not expose Teacher Center.
    return redirectToTeacherLogin(url);
  }
};
