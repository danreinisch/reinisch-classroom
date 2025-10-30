export default async (request, context) => {
  const realm = 'Reinisch Classroom Admin';

  // Read credentials from Netlify env (Project configuration → Environment variables)
  const expectedUser = context.env?.ADMIN_USER || '';
  const expectedPass = context.env?.ADMIN_PASS || '';

  // Fail closed if not configured
  if (!expectedUser || !expectedPass) {
    return unauthorized(realm);
  }

  const auth = request.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');

  if (scheme !== 'Basic' || !encoded) {
    return unauthorized(realm);
  }

  // Decode "username:password"
  let user = '', pass = '';
  try {
    const decoded = atob(encoded);
    const idx = decoded.indexOf(':');
    if (idx === -1) return unauthorized(realm);
    user = decoded.slice(0, idx);
    pass = decoded.slice(idx + 1);
  } catch {
    return unauthorized(realm);
  }

  if (user !== expectedUser || pass !== expectedPass) {
    return unauthorized(realm);
  }

  // Auth OK → continue to /admin assets
  return context.next();
};

function unauthorized(realm) {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${realm}", charset="UTF-8"`,
      'Cache-Control': 'no-store'
    }
  });
}
