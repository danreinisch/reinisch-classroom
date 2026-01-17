const teacherSession = require('./teacher-session');

exports.handler = async (event, context) => {
  const res = await teacherSession.handler(event, context);

  // Pass through any non-OK results unchanged.
  if (!res || !res.body) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Upstream teacher-session error' }),
    };
  }

  let data = null;
  try { data = JSON.parse(res.body); } catch {}

  if (!data || data.ok !== true) return res;

  // Support both shapes: {role/raw_role} or {user:{role/raw_role}}
  const role = String(data.role ?? data.user?.role ?? '').toLowerCase();
  const rawRole = String(data.raw_role ?? data.user?.raw_role ?? '').toLowerCase();

  if (role === 'admin' || rawRole === 'admin') return res;

  return {
    statusCode: 401,
    headers: { ...(res.headers || {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: false, error: 'Unauthorized' }),
  };
};
