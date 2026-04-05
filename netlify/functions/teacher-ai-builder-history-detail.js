// AI Builder history detail endpoint — returns full content for a single record
// GET /.netlify/functions/teacher-ai-builder-history-detail?id=<uuid>
// Auth: Requires teacher session cookie
// Returns: { ok: true, content: "..." }

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

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

exports.handler = async function(event) {
  var requestId = generateRequestId();
  console.log('[teacher-ai-builder-history-detail] [' + requestId + '] Request received');

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
    console.error('[teacher-ai-builder-history-detail] [' + requestId + '] Missing SESSION_SECRET');
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  var authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log('[teacher-ai-builder-history-detail] [' + requestId + '] Authorized: ' + authResult.user.username);

  var params = event.queryStringParameters || {};
  var id = params.id || '';

  if (!UUID_RE.test(id)) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid or missing id parameter' }, {}, requestId);
  }

  var path = '/rest/v1/ai_builder_outputs?select=id,content&id=eq.' + encodeURIComponent(id) + '&limit=1';

  try {
    var res = await rest(path, { method: 'GET' });
    var result = await jsonRes(res);

    if (!result.ok) {
      console.error('[teacher-ai-builder-history-detail] [' + requestId + '] Query failed:', result.data);
      return jsonResponse(event, 500, { ok: false, error: 'Failed to load record' }, {}, requestId);
    }

    var rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length === 0) {
      return jsonResponse(event, 404, { ok: false, error: 'Record not found' }, {}, requestId);
    }

    console.log('[teacher-ai-builder-history-detail] [' + requestId + '] Returning content for id=' + id);
    return jsonResponse(event, 200, { ok: true, content: rows[0].content || '' }, { 'Cache-Control': 'no-store' }, requestId);
  } catch (err) {
    console.error('[teacher-ai-builder-history-detail] [' + requestId + '] Error:', err.message);
    return jsonResponse(event, 500, { ok: false, error: 'Failed to load record' }, {}, requestId);
  }
};
