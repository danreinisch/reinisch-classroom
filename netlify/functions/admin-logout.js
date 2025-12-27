// Clears the admin session cookie and redirects to /hub/ (Teacher Center)
const COOKIE_NAME = 'rc_admin_session_v2'; // match the new cookie name

exports.handler = async () => {
  return {
    statusCode: 302,
    headers: {
      Location: '/hub/?reason=admin_logged_out',
      'Set-Cookie': `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store'
    }
  };
};
