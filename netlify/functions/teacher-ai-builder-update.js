// AI Builder update endpoint — updates status or deletes ai_builder_outputs
// PATCH /.netlify/functions/teacher-ai-builder-update
//   Body: { ids: [uuid, ...], status: 'active'|'superseded'|'archived', superseded_by?: uuid }
//   Returns: { ok: true, updated: N }
// DELETE /.netlify/functions/teacher-ai-builder-update
//   Body: { ids: [uuid, ...] }
//   Returns: { ok: true, deleted: N }
// Auth: Requires teacher session cookie

var http = require('./_lib/http');
var auth = require('./_lib/auth');
var supa = require('./_lib/supa');

var generateRequestId = http.generateRequestId;
var jsonResponse = http.jsonResponse;
var handleCorsPreFlight = http.handleCorsPreFlight;
var safeJsonParse = http.safeJsonParse;
var requireTeacher = auth.requireTeacher;
var rest = supa.rest;
var jsonRes = supa.jsonRes;

var supaConfig = supa.getSupabaseConfig();
var SUPABASE_URL = supaConfig.url;
var SUPABASE_SERVICE_ROLE_KEY = supaConfig.key;
var SESSION_SECRET = process.env.SESSION_SECRET;

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var ALLOWED_STATUSES = ['active', 'superseded', 'archived'];
var MAX_IDS = 50;

exports.handler = async function(event) {
  var requestId = generateRequestId();
  console.log('[teacher-ai-builder-update] [' + requestId + '] Request received - method: ' + event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['PATCH', 'DELETE', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'PATCH' && event.httpMethod !== 'DELETE') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  if (!SESSION_SECRET) {
    console.error('[teacher-ai-builder-update] [' + requestId + '] Missing SESSION_SECRET');
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  var authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log('[teacher-ai-builder-update] [' + requestId + '] Authorized: ' + authResult.user.username);

  var parsed = safeJsonParse(event.body);
  if (!parsed.ok) {
    return jsonResponse(event, 400, { ok: false, error: parsed.error || 'Invalid JSON body' }, {}, requestId);
  }
  var body = parsed.data;

  // Validate ids
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return jsonResponse(event, 400, { ok: false, error: 'ids must be a non-empty array' }, {}, requestId);
  }
  if (body.ids.length > MAX_IDS) {
    return jsonResponse(event, 400, { ok: false, error: 'ids may not exceed ' + MAX_IDS + ' items' }, {}, requestId);
  }
  var invalidId = body.ids.find(function(id) { return typeof id !== 'string' || !UUID_RE.test(id); });
  if (invalidId !== undefined) {
    return jsonResponse(event, 400, { ok: false, error: 'ids contains an invalid UUID' }, {}, requestId);
  }

  // Build PostgREST in.() filter
  var idFilter = 'id=in.(' + body.ids.join(',') + ')';

  if (event.httpMethod === 'DELETE') {
    try {
      var delRes = await rest('/rest/v1/ai_builder_outputs?' + idFilter, {
        method: 'DELETE',
        headers: {
          'Prefer': 'return=minimal',
        },
      });
      var delResult = await jsonRes(delRes);
      if (!delResult.ok) {
        console.error('[teacher-ai-builder-update] [' + requestId + '] Delete failed:', delResult.data);
        return jsonResponse(event, 500, { ok: false, error: 'Failed to delete records' }, {}, requestId);
      }
      console.log('[teacher-ai-builder-update] [' + requestId + '] Deleted ids=' + body.ids.join(','));
      return jsonResponse(event, 200, { ok: true, deleted: body.ids.length }, {}, requestId);
    } catch (err) {
      console.error('[teacher-ai-builder-update] [' + requestId + '] Delete error:', err.message);
      return jsonResponse(event, 500, { ok: false, error: 'Failed to delete records' }, {}, requestId);
    }
  }

  // PATCH — validate status
  if (!body.status || ALLOWED_STATUSES.indexOf(body.status) === -1) {
    return jsonResponse(event, 400, { ok: false, error: 'status must be one of: ' + ALLOWED_STATUSES.join(', ') }, {}, requestId);
  }

  // Validate superseded_by if provided
  if (body.superseded_by !== undefined && body.superseded_by !== null) {
    if (typeof body.superseded_by !== 'string' || !UUID_RE.test(body.superseded_by)) {
      return jsonResponse(event, 400, { ok: false, error: 'superseded_by must be a valid UUID' }, {}, requestId);
    }
  }

  var update = { status: body.status };
  if (body.superseded_by) {
    update.superseded_by = body.superseded_by;
  }

  try {
    var patchRes = await rest('/rest/v1/ai_builder_outputs?' + idFilter, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(update),
    });
    var patchResult = await jsonRes(patchRes);
    if (!patchResult.ok) {
      console.error('[teacher-ai-builder-update] [' + requestId + '] Patch failed:', patchResult.data);
      return jsonResponse(event, 500, { ok: false, error: 'Failed to update records' }, {}, requestId);
    }
    console.log('[teacher-ai-builder-update] [' + requestId + '] Updated status=' + body.status + ' ids=' + body.ids.join(','));
    return jsonResponse(event, 200, { ok: true, updated: body.ids.length }, {}, requestId);
  } catch (err) {
    console.error('[teacher-ai-builder-update] [' + requestId + '] Patch error:', err.message);
    return jsonResponse(event, 500, { ok: false, error: 'Failed to update records' }, {}, requestId);
  }
};
