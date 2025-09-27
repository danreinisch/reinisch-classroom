// GET ?assignment_id= and optional ?class_id=
// Returns submissions with student info
const { requireTeacher } = require('./_lib/auth');
const { rest, jsonRes } = require('./_lib/supa');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const auth = requireTeacher(event, process.env.SESSION_SECRET);
  if (!auth.ok) return auth.res;

  const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
  const assignment_id = url.searchParams.get('assignment_id');
  const class_id = url.searchParams.get('class_id');

  if (!assignment_id) return { statusCode: 400, headers: CORS, body: 'assignment_id required' };

  // Base query
  let q = `/rest/v1/submissions?select=id,assignment_id,student_id,student_name,content,content_url,submitted_at&assignment_id=eq.${assignment_id}&order=submitted_at.desc`;

  try {
    const S = await rest(q).then(jsonRes);
    if (!S.ok) return { statusCode: S.status, headers: CORS, body: String(S.data) };

    // Optionally filter by class by joining students
    if (class_id) {
      const studentIds = await rest(`/rest/v1/students?select=id&class_id=eq.${class_id}`).then(jsonRes);
      if (!studentIds.ok) return { statusCode: studentIds.status, headers: CORS, body: String(studentIds.data) };
      const set = new Set((studentIds.data || []).map((r) => r.id));
      S.data = (S.data || []).filter((s) => s.student_id && set.has(s.student_id));
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissions: S.data }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: `Server error: ${e.message}` };
  }
};
