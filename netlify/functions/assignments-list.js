// GET /.netlify/functions/assignments-list
// Returns active assignments, ordered by due_date
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/assignments?select=id,title,description,section,due_date,active&active=is.true&order=due_date.asc`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return { statusCode: res.status, headers: CORS, body: text };
    }

    const data = await res.json();
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: data }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: `Server error: ${err.message}` };
  }
};
