// Minimal env-check endpoint for Netlify Functions
// URL after deploy: /.netlify/functions/env-check
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  // Required for the MVP
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET'];
  // Optional for future client-side usage
  const optional = ['SUPABASE_ANON_KEY'];

  const all = [...required, ...optional];

  const report = {};
  for (const key of all) {
    const val = process.env[key];
    report[key] = {
      present: typeof val === 'string' && val.length > 0,
      length: typeof val === 'string' ? val.length : 0,
    };
  }

  const missing = required.filter((k) => !report[k].present);

  const body = {
    ok: missing.length === 0,
    missing, // names only; values are never exposed
    variables: report,
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body, null, 2),
  };
};
