exports.handler = async () => {
  const keys = [
    'SUPABASE_URL',
    'SUPABASE_URL_RUNTIME',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_KEY_RUNTIME',
    'ADMIN_SESSION_SECRET'
  ];
  const report = {};
  for (const k of keys) {
    const v = process.env[k] || '';
    report[k] = { present: !!v, length: v.length };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(report, null, 2)
  };
};
