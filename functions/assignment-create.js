// Create an assignment with an uploaded HTML (as text) and metadata.
// POST body JSON:
// {
//   title, description, section, due_date, class_ids?: number[],
//   htmlText: string,
//   questions?: [{ text, standard_code?, iep_codes?: string[] }]
// }
const { requireTeacher } = require('./_lib/auth');
const { rest, jsonRes } = require('./_lib/supa');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const BUCKET = 'assignments';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  // Auth
  const auth = requireTeacher(event, process.env.SESSION_SECRET);
  if (!auth.ok) return auth.res;

  try {
    const body = JSON.parse(event.body || '{}');
    const { title, description, section, due_date, class_ids = [], htmlText, questions = [] } = body;
    if (!title || !htmlText) {
      return { statusCode: 400, headers: CORS, body: 'title and htmlText are required' };
    }

    // Create DB row first to get ID
    const ins = await rest(`/rest/v1/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify([{ title, description: description || null, section: section || null, due_date: due_date || null, active: true }]),
    }).then(jsonRes);

    if (!ins.ok) return { statusCode: ins.status, headers: CORS, body: String(ins.data) };
    const assignment = ins.data[0];

    // Upload HTML to Storage at assignments/{id}/index.html
    const objectName = `${assignment.id}/index.html`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodeURIComponent(objectName)}?upsert=true`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'text/html; charset=utf-8',
      },
      body: htmlText,
    });

    if (!up.ok) {
      // cleanup db row
      await rest(`/rest/v1/assignments?id=eq.${assignment.id}`, { method: 'DELETE' });
      const t = await up.text();
      return { statusCode: up.status, headers: CORS, body: `Upload failed: ${t}` };
    }

    const public_url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectName}`;

    // Save path/url on assignment
    await rest(`/rest/v1/assignments?id=eq.${assignment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storage_path: `${BUCKET}/${objectName}`, public_url }),
    });

    // Assign to classes (optional)
    if (Array.isArray(class_ids) && class_ids.length) {
      const rows = class_ids.map((cid) => ({ assignment_id: assignment.id, class_id: cid }));
      await rest(`/rest/v1/assignment_targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      });
    }

    // Questions (optional)
    if (Array.isArray(questions) && questions.length) {
      const qrows = questions.map((q) => ({
        assignment_id: assignment.id,
        text: q.text,
        standard_code: q.standard_code || null,
        iep_codes: Array.isArray(q.iep_codes) ? q.iep_codes : null,
      }));
      await rest(`/rest/v1/assignment_questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(qrows),
      });
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, assignment_id: assignment.id, public_url }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: `Server error: ${e.message}` };
  }
};
