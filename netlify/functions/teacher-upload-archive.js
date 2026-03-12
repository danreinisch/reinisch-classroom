// Teacher upload archive endpoint
// POST /.netlify/functions/teacher-upload-archive
// Auth: Requires teacher session cookie
// Body: JSON with base64-encoded file data
// Returns: { ok: true, assignment, instance }
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

// Max upload size: 20 MB base64-encoded (~15 MB raw file)
const MAX_BODY_BYTES = 20 * 1024 * 1024;

// Allowed MIME types for paper/archive uploads
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/webp',
]);

async function supaFetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = text; }
  return { ok: res.ok, status: res.status, data };
}

exports.handler = async function (event) {
  const requestId = generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { error: 'Method not allowed' }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(event, 401, { error: 'Unauthorized' }, {}, requestId);
  }

  // Check raw body size before parsing (base64 files can be large)
  const bodyStr = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  if (Buffer.byteLength(bodyStr, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse(event, 413, { error: 'Request body too large (max 20 MB)' }, {}, requestId);
  }

  const parsed = safeJsonParse(bodyStr);
  if (!parsed.ok) {
    return jsonResponse(event, 400, { error: parsed.error }, {}, requestId);
  }

  const {
    title,
    student_code,
    class_name,
    assignment_type,
    file_data,
    file_name,
    file_type,
    score,
    score_total,
    notes,
  } = parsed.data;

  // Validate required fields
  if (!title || typeof title !== 'string' || !title.trim()) {
    return jsonResponse(event, 400, { error: 'title is required' }, {}, requestId);
  }
  if (!file_data || typeof file_data !== 'string' || !file_data.trim()) {
    return jsonResponse(event, 400, { error: 'file_data (base64) is required' }, {}, requestId);
  }
  if (!file_name || typeof file_name !== 'string' || !file_name.trim()) {
    return jsonResponse(event, 400, { error: 'file_name is required' }, {}, requestId);
  }
  if (!file_type || typeof file_type !== 'string' || !file_type.trim()) {
    return jsonResponse(event, 400, { error: 'file_type is required' }, {}, requestId);
  }

  // Validate MIME type (server-side allowlist — do not trust client-supplied value alone)
  const normalizedMime = file_type.trim().toLowerCase().split(';')[0].trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return jsonResponse(event, 400, { error: `Unsupported file type: ${normalizedMime}. Allowed: PDF, JPEG, PNG, HEIC, GIF, WEBP` }, {}, requestId);
  }

  // Validate score relationship if both provided
  const scoreNum = score != null && score !== '' ? Number(score) : null;
  const scoreTotalNum = score_total != null && score_total !== '' ? Number(score_total) : null;
  if (scoreNum !== null && scoreTotalNum !== null && scoreNum > scoreTotalNum) {
    return jsonResponse(event, 400, { error: 'score cannot exceed score_total' }, {}, requestId);
  }

  try {
    // 1. Optionally look up the student by code (student_code is optional)
    let student = null;
    const trimmedStudentCode = student_code && typeof student_code === 'string' ? student_code.trim() : '';
    if (trimmedStudentCode) {
      const stuRes = await supaFetch(
        `/rest/v1/students?code=eq.${encodeURIComponent(trimmedStudentCode)}&select=id,code`
      );
      if (!stuRes.ok || !Array.isArray(stuRes.data) || stuRes.data.length === 0) {
        // Warn but do not fail — student code may be unknown; continue without linking to a student
        console.warn(`[teacher-upload-archive] [${requestId}] Student not found for code "${trimmedStudentCode}" — uploading without student link`);
      } else {
        student = stuRes.data[0];
      }
    }

    // 2. Create an assignments row
    const now = new Date().toISOString();
    const assignmentRecord = {
      title: title.trim(),
      type: 'archive',
      series: class_name || null,
      meta: JSON.stringify({
        archive: true,
        assignment_type: assignment_type || 'Paper Assignment',
        original_filename: file_name.trim(),
        uploaded_at: now,
        student_code: trimmedStudentCode || null,
        notes: notes || null,
      }),
    };

    const asgInsertRes = await supaFetch(
      `/rest/v1/assignments`,
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(assignmentRecord),
      }
    );

    if (!asgInsertRes.ok) {
      const errDetail = typeof asgInsertRes.data === 'object' ? asgInsertRes.data : { raw: String(asgInsertRes.data) };
      console.error(`[teacher-upload-archive] [${requestId}] Assignment insert failed:`, asgInsertRes.status, errDetail);
      return jsonResponse(event, 500, { error: 'Failed to create assignment', detail: errDetail }, {}, requestId);
    }

    const assignment = Array.isArray(asgInsertRes.data) ? asgInsertRes.data[0] : asgInsertRes.data;
    if (!assignment || !assignment.id) {
      return jsonResponse(event, 500, { error: 'Assignment insert returned no ID' }, {}, requestId);
    }

    // 3. Upload the file to Supabase Storage
    const safeFileName = file_name.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `archives/${assignment.id}/${safeFileName}`;

    let fileBuffer;
    try {
      fileBuffer = Buffer.from(file_data, 'base64');
    } catch (bufErr) {
      // Clean up assignment record on decode failure
      await supaFetch(`/rest/v1/assignments?id=eq.${encodeURIComponent(assignment.id)}`, { method: 'DELETE' }).catch(() => {});
      return jsonResponse(event, 400, { error: 'Invalid base64 file_data' }, {}, requestId);
    }

    const storageRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/assignment-archives/${storagePath}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': normalizedMime,
          'x-upsert': 'true',
        },
        body: fileBuffer,
      }
    );

    let storageData = null;
    try {
      const storageText = await storageRes.text();
      try { storageData = JSON.parse(storageText); } catch (_) { storageData = storageText; }
    } catch (_) { /* ignore read error */ }

    if (!storageRes.ok) {
      console.error(`[teacher-upload-archive] [${requestId}] Storage upload failed:`, storageRes.status, storageData);
      // Clean up assignment record to avoid orphaned rows
      await supaFetch(`/rest/v1/assignments?id=eq.${encodeURIComponent(assignment.id)}`, { method: 'DELETE' }).catch(() => {});
      return jsonResponse(event, 500, { error: 'Failed to upload file to storage', detail: storageData, status: storageRes.status }, {}, requestId);
    }

    // 4. Build the public URL and update the assignment's page field
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/assignment-archives/${storagePath}`;

    const asgUpdateRes = await supaFetch(
      `/rest/v1/assignments?id=eq.${encodeURIComponent(assignment.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ page: publicUrl }),
      }
    );

    if (!asgUpdateRes.ok) {
      console.warn(`[teacher-upload-archive] [${requestId}] Assignment page update failed (non-fatal):`, asgUpdateRes.status);
    }

    const updatedAssignment = (asgUpdateRes.ok && Array.isArray(asgUpdateRes.data) && asgUpdateRes.data.length > 0)
      ? asgUpdateRes.data[0]
      : { ...assignment, page: publicUrl };

    // 5. Optionally create an assignment_instances row linking this assignment to the student
    let instance = null;
    if (student) {
      const instanceRecord = {
        assignment_id: assignment.id,
        student_id: student.id,
        status: 'Submitted',
      };

      const instInsertRes = await supaFetch(
        `/rest/v1/assignment_instances`,
        {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(instanceRecord),
        }
      );

      if (!instInsertRes.ok) {
        const errDetail = typeof instInsertRes.data === 'object' ? instInsertRes.data : { raw: String(instInsertRes.data) };
        console.error(`[teacher-upload-archive] [${requestId}] Instance insert failed:`, instInsertRes.status, errDetail);
        return jsonResponse(event, 500, { error: 'Failed to create assignment instance', detail: errDetail }, {}, requestId);
      }

      instance = Array.isArray(instInsertRes.data) ? instInsertRes.data[0] : instInsertRes.data;
    }

    // 6. If score is provided and we have an instance, create a submissions row
    let submission = null;

    if (scoreNum != null && instance && instance.id) {
      const scoreTotal = (scoreTotalNum != null && scoreTotalNum > 0) ? scoreTotalNum : null;
      const scorePercent = (scoreTotal != null) ? Math.round((scoreNum / scoreTotal) * 100) : null;

      // score_total in the DB stores the percentage value (score/total*100), following the existing schema convention
      const submissionRecord = {
        instance_id: instance.id,
        score_manual: scoreNum,
        score_total: scorePercent,
        submitted_at: now,
        review_status: 'reviewed',
      };

      const subInsertRes = await supaFetch(
        `/rest/v1/submissions`,
        {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(submissionRecord),
        }
      );

      if (subInsertRes.ok) {
        submission = Array.isArray(subInsertRes.data) ? subInsertRes.data[0] : subInsertRes.data;
      } else {
        console.warn(`[teacher-upload-archive] [${requestId}] Submission insert failed (non-fatal):`, subInsertRes.status, subInsertRes.data);
      }
    }

    console.log(`[teacher-upload-archive] [${requestId}] Uploaded archive for student ${trimmedStudentCode || '(none)'} -> assignment ${assignment.id}`);
    return jsonResponse(event, 200, { ok: true, assignment: updatedAssignment, instance, submission }, {}, requestId);

  } catch (err) {
    console.error(`[teacher-upload-archive] [${requestId}] Unexpected error:`, err);
    return jsonResponse(event, 500, { error: 'Internal server error', detail: err.message || String(err) }, {}, requestId);
  }
};
