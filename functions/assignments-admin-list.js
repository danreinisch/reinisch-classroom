// GET params: ?class_id= (optional)
// Returns assignments + counts (submitted, missing) per class, if provided
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
  const class_id = url.searchParams.get('class_id');

  try {
    // Base assignments (optionally filtered by class)
    let filter = '';
    if (class_id) {
      // join via assignment_targets
      filter = `&select=*,assignment_targets!inner(class_id)&assignment_targets.class_id=eq.${class_id}`;
    } else {
      filter = `&select=*`;
    }
    const A = await rest(`/rest/v1/assignments?order=created_at.desc${filter}`).then(jsonRes);
    if (!A.ok) return { statusCode: A.status, headers: CORS, body: String(A.data) };

    // If class provided, compute missing counts using roster (students in class not in submissions)
    let counts = {};
    if (class_id) {
      // submissions per assignment for students in that class
      const subs = await rest(`/rest/v1/submissions?select=id,assignment_id,student_id,student_name&order=submitted_at.desc`).then(jsonRes);
      const roster = await rest(`/rest/v1/students?select=id,name,class_id&class_id=eq.${class_id}`).then(jsonRes);

      if (subs.ok && roster.ok) {
        const byAssign = {};
        for (const s of subs.data) {
          (byAssign[s.assignment_id] ||= new Set()).add(s.student_id || s.student_name?.toLowerCase().trim());
        }
        for (const asn of A.data) {
          const enrolled = (roster.data || []).map((r) => r.id);
          const submittedSet = byAssign[asn.id] || new Set();
          const submitted = enrolled.filter((id) => submittedSet.has(id));
          const missing = enrolled.filter((id) => !submittedSet.has(id));
          counts[asn.id] = { submitted: submitted.length, missing: missing.length };
        }
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: A.data, counts }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: `Server error: ${e.message}` };
  }
};
