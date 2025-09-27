// Same contents as above
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET'];
  const optional = ['SUPABASE_ANON_KEY'];
  const all = [...required, ...optional];
  const report = {};
  for (const key of all) {
    const val = process.env[key];
    report[key] = { present: !!val, length: val ? val.length : 0 };
  }
  const missing = required.filter((k) => !report[k].present);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ ok: missing.length === 0, missing, variables: report }, null, 2),
  };
};
