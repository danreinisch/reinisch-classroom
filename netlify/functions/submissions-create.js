// POST /.netlify/functions/submissions-create
// Body: { assignment_id, student_name, content?, content_url? }
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { assignment_id, student_name, content, content_url } = body || {};

    if (!assignment_id || !student_name) {
      return {
        statusCode: 400,
        headers: CORS,
        body: 'assignment_id and student_name are required',
      };
    }

    const payload = [{ assignment_id, student_name, content: content || null, content_url: content_url || null }];
    const url = `${SUPABASE_URL}/rest/v1/submissions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      return { statusCode: res.status, headers: CORS, body: text };
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: text,
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: `Server error: ${err.message}` };
  }
};
