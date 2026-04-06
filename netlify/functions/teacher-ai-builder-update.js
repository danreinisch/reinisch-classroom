// AI Builder update endpoint — updates status or deletes ai_builder_outputs
// PATCH /.netlify/functions/teacher-ai-builder-update
//   Body: { ids: [uuid, ...], status: 'active' | 'superseded' | 'archived', superseded_by?: uuid }
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

function validateIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { valid: false, error: 'ids must be a non-empty array' };
  }
  if (ids.length > MAX_IDS) {
    return { valid: false, error: 'ids array exceeds maximum of ' + MAX_IDS };
  }
  for (var i = 0; i < ids.length; i++) {
    if (typeof ids[i] !== 'string' || !UUID_RE.test(ids[i])) {
      return { valid: false, error: 'ids[' + i + '] is not a valid UUID' };
    }
  }
  return { valid: true };
}

exports.handler = async function(event) {
  var requestId = generateRequestId();
  console.log('[teacher-ai-builder-update] [' + requestId + '] Request received: ' + event.httpMethod);

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

  var idsCheck = validateIds(body.ids);
  if (!idsCheck.valid) {
    return jsonResponse(event, 400, { ok: false, error: idsCheck.error }, {}, requestId);
  }

  var ids = body.ids;
  // ids have been validated against UUID_RE above — safe to interpolate into PostgREST query
  var idFilter = '/rest/v1/ai_builder_outputs?id=in.(' + ids.join(',') + ')';

  if (event.httpMethod === 'DELETE') {
    try {
      var delRes = await rest(idFilter, {
        method: 'DELETE',
        headers: { 'Prefer': 'return=representation' },
      });
      var delResult = await jsonRes(delRes);

      if (!delResult.ok) {
        console.error('[teacher-ai-builder-update] [' + requestId + '] Delete failed:', delResult.data);
        return jsonResponse(event, 500, { ok: false, error: 'Failed to delete records' }, {}, requestId);
      }

      var deleted = Array.isArray(delResult.data) ? delResult.data.length : 0;
      console.log('[teacher-ai-builder-update] [' + requestId + '] Deleted ' + deleted + ' records');
      return jsonResponse(event, 200, { ok: true, deleted: deleted }, {}, requestId);
    } catch (err) {
      console.error('[teacher-ai-builder-update] [' + requestId + '] Delete error:', err.message);
      return jsonResponse(event, 500, { ok: false, error: 'Failed to delete records' }, {}, requestId);
    }
  }

  // PATCH
  var status = body.status;
  if (!status || ALLOWED_STATUSES.indexOf(status) === -1) {
    return jsonResponse(event, 400, { ok: false, error: 'status must be one of: ' + ALLOWED_STATUSES.join(', ') }, {}, requestId);
  }

  var supersededBy = body.superseded_by || null;
  if (supersededBy !== null && (typeof supersededBy !== 'string' || !UUID_RE.test(supersededBy))) {
    return jsonResponse(event, 400, { ok: false, error: 'superseded_by must be a valid UUID' }, {}, requestId);
  }

  var patch = { status: status };
  if (supersededBy !== null) {
    patch.superseded_by = supersededBy;
  }

  try {
    var patchRes = await rest(idFilter, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(patch),
    });
    var patchResult = await jsonRes(patchRes);

    if (!patchResult.ok) {
      console.error('[teacher-ai-builder-update] [' + requestId + '] Patch failed:', patchResult.data);
      return jsonResponse(event, 500, { ok: false, error: 'Failed to update records' }, {}, requestId);
    }

    var updated = Array.isArray(patchResult.data) ? patchResult.data.length : 0;
    console.log('[teacher-ai-builder-update] [' + requestId + '] Updated ' + updated + ' records to status=' + status);
    return jsonResponse(event, 200, { ok: true, updated: updated }, {}, requestId);
  } catch (err) {
    console.error('[teacher-ai-builder-update] [' + requestId + '] Patch error:', err.message);
    return jsonResponse(event, 500, { ok: false, error: 'Failed to update records' }, {}, requestId);
  }
};
