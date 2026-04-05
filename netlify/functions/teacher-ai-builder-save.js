// AI Builder save endpoint — persists a generation to ai_builder_outputs
// POST /.netlify/functions/teacher-ai-builder-save
// Auth: Requires teacher session cookie
// Body: { task_type, subject, week, chapters, theme, scope, model, source_hash,
//         content, student_codes, goal_codes, school_year }
// Returns: { ok: true, id: <uuid> }

var http = require('./_lib/http');
var auth = require('./_lib/auth');
var supa = require('./_lib/supa');

var generateRequestId = http.generateRequestId;
var jsonResponse = http.jsonResponse;
var handleCorsPreFlight = http.handleCorsPreFlight;
var validateBodySize = http.validateBodySize;
var safeJsonParse = http.safeJsonParse;
var requireTeacher = auth.requireTeacher;
var rest = supa.rest;
var jsonRes = supa.jsonRes;

var supaConfig = supa.getSupabaseConfig();
var SUPABASE_URL = supaConfig.url;
var SUPABASE_SERVICE_ROLE_KEY = supaConfig.key;
var SESSION_SECRET = process.env.SESSION_SECRET;

function getCurrentSchoolYear() {
  var now = new Date();
  var month = now.getMonth() + 1;
  var year = now.getFullYear();
  var startYear = month >= 8 ? year : year - 1;
  return startYear + '-' + (startYear + 1);
}

exports.handler = async function(event) {
  var requestId = generateRequestId();
  console.log('[teacher-ai-builder-save] [' + requestId + '] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  if (!SESSION_SECRET) {
    console.error('[teacher-ai-builder-save] [' + requestId + '] Missing SESSION_SECRET');
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  var authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log('[teacher-ai-builder-save] [' + requestId + '] Authorized: ' + authResult.user.username);

  // Validate body size (200KB max)
  var bodySizeCheck = validateBodySize(event.body, 200);
  if (!bodySizeCheck.valid) {
    return jsonResponse(event, 413, { ok: false, error: bodySizeCheck.error }, {}, requestId);
  }

  var parsed = safeJsonParse(event.body);
  if (!parsed.ok) {
    return jsonResponse(event, 400, { ok: false, error: parsed.error || 'Invalid JSON body' }, {}, requestId);
  }
  var body = parsed.data;

  var task_type = body.task_type || 'assignments';
  var subject = body.subject || 'ELA';
  var week = body.week;
  var content = body.content;

  if (!week || typeof week !== 'string') {
    return jsonResponse(event, 400, { ok: false, error: 'week must be a non-empty string' }, {}, requestId);
  }
  if (!content || typeof content !== 'string') {
    return jsonResponse(event, 400, { ok: false, error: 'content is required' }, {}, requestId);
  }

  var row = {
    task_type: task_type,
    subject: subject,
    week: week,
    chapters: body.chapters || null,
    theme: body.theme || null,
    scope: body.scope || null,
    model: body.model || null,
    source_hash: body.source_hash || null,
    content: content,
    student_codes: Array.isArray(body.student_codes) ? body.student_codes : [],
    goal_codes: Array.isArray(body.goal_codes) ? body.goal_codes : [],
    status: 'active',
    school_year: body.school_year || getCurrentSchoolYear(),
  };

  try {
    var res = await rest('/rest/v1/ai_builder_outputs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(row),
    });

    var result = await jsonRes(res);

    if (!result.ok) {
      console.error('[teacher-ai-builder-save] [' + requestId + '] Insert failed:', result.data);
      return jsonResponse(event, 500, { ok: false, error: 'Failed to save output' }, {}, requestId);
    }

    var saved = Array.isArray(result.data) ? result.data[0] : result.data;
    console.log('[teacher-ai-builder-save] [' + requestId + '] Saved id=' + (saved && saved.id));
    return jsonResponse(event, 201, { ok: true, id: saved && saved.id }, {}, requestId);
  } catch (err) {
    console.error('[teacher-ai-builder-save] [' + requestId + '] Error:', err.message);
    return jsonResponse(event, 500, { ok: false, error: 'Failed to save output' }, {}, requestId);
  }
};
