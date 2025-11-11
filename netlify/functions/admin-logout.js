// Clears the admin session cookie and redirects to /admin-login
const COOKIE_NAME = 'rc_admin_session_v3'; // match the new Supabase-based cookie name

exports.handler = async () => {
  return {
    statusCode: 302,
    headers: {
      Location: '/admin-login',
      'Set-Cookie': `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store'
    }
  };
};
