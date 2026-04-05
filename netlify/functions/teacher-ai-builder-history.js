// AI Builder history endpoint — lists saved ai_builder_outputs
// GET /.netlify/functions/teacher-ai-builder-history
// Auth: Requires teacher session cookie
// Query params: status, week, subject (all optional)
// Returns: { ok: true, outputs: [...] }

var http = require('./_lib/http');
var auth = require('./_lib/auth');
var supa = require('./_lib/supa');

var generateRequestId = http.generateRequestId;
var jsonResponse = http.jsonResponse;
var handleCorsPreFlight = http.handleCorsPreFlight;
var requireTeacher = auth.requireTeacher;
var rest = supa.rest;
var jsonRes = supa.jsonRes;

var supaConfig = supa.getSupabaseConfig();
var SUPABASE_URL = supaConfig.url;
var SUPABASE_SERVICE_ROLE_KEY = supaConfig.key;
var SESSION_SECRET = process.env.SESSION_SECRET;

/**
 * Compute the current school year string in YYYY-YYYY format.
 * School year spans August (month 8) to July (month 7).
 * E.g. August 2025 – July 2026 → "2025-2026"
 */
function getCurrentSchoolYear() {
  var now = new Date();
  var month = now.getMonth() + 1; // 1–12
  var year = now.getFullYear();
  var startYear = month >= 8 ? year : year - 1;
  return startYear + '-' + (startYear + 1);
}

exports.handler = async function(event) {
  var requestId = generateRequestId();
  console.log('[teacher-ai-builder-history] [' + requestId + '] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  if (!SESSION_SECRET) {
    console.error('[teacher-ai-builder-history] [' + requestId + '] Missing SESSION_SECRET');
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  var authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log('[teacher-ai-builder-history] [' + requestId + '] Authorized: ' + authResult.user.username);

  var params = event.queryStringParameters || {};
  var schoolYear = getCurrentSchoolYear();

  // Build PostgREST query string
  var filters = 'school_year=eq.' + encodeURIComponent(schoolYear);

  if (params.status) {
    // Validate status value against allowed values
    var allowedStatuses = ['active', 'superseded', 'archived'];
    if (allowedStatuses.indexOf(params.status) !== -1) {
      filters += '&status=eq.' + encodeURIComponent(params.status);
    }
  }

  if (params.week) {
    filters += '&week=eq.' + encodeURIComponent(params.week);
  }

  if (params.subject) {
    filters += '&subject=eq.' + encodeURIComponent(params.subject);
  }

  var path = '/rest/v1/ai_builder_outputs?select=id,task_type,subject,week,chapters,theme,scope,model,source_hash,student_codes,goal_codes,assignment_id,status,superseded_by,created_at,school_year,content&' + filters + '&order=created_at.desc&limit=100';

  try {
    var res = await rest(path, { method: 'GET' });
    var result = await jsonRes(res);

    if (!result.ok) {
      console.error('[teacher-ai-builder-history] [' + requestId + '] Query failed:', result.data);
      return jsonResponse(event, 500, { ok: false, error: 'Failed to load history' }, {}, requestId);
    }

    var outputs = Array.isArray(result.data) ? result.data : [];
    console.log('[teacher-ai-builder-history] [' + requestId + '] Returning ' + outputs.length + ' outputs');
    return jsonResponse(event, 200, { ok: true, outputs: outputs }, { 'Cache-Control': 'no-store' }, requestId);
  } catch (err) {
    console.error('[teacher-ai-builder-history] [' + requestId + '] Error:', err.message);
    return jsonResponse(event, 500, { ok: false, error: 'Failed to load history' }, {}, requestId);
  }
};
