// Teacher drafts CRUD endpoint
// GET /.netlify/functions/teacher-drafts - List all drafts for authenticated teacher
// POST /.netlify/functions/teacher-drafts - Create or update a draft (upsert by id)
// DELETE /.netlify/functions/teacher-drafts?id=DRAFT_ID - Delete a single draft
// Auth: Requires teacher session cookie

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-drafts] [${requestId}] Request received: ${event.httpMethod}`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'POST', 'DELETE', 'OPTIONS'], ['Content-Type']);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[teacher-drafts] [${requestId}] Supabase not configured`);
    return jsonResponse(
      event,
      503,
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Check if SESSION_SECRET is configured
  if (!SESSION_SECRET) {
    console.error(`[teacher-drafts] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  // Verify teacher session
  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-drafts] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const teacher = authResult.user.username || 'default';
  console.log(`[teacher-drafts] [${requestId}] Authorized user: ${teacher}`);

  try {
    // GET: List all drafts for teacher
    if (event.httpMethod === 'GET') {
      const draftsUrl = `${SUPABASE_URL}/rest/v1/teacher_drafts?select=*&teacher=eq.${encodeURIComponent(teacher)}&order=updated_at.desc`;
      
      console.log(`[teacher-drafts] [${requestId}] Fetching drafts for teacher: ${teacher}`);
      
      const response = await fetch(draftsUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`[teacher-drafts] [${requestId}] Supabase query failed with status: ${response.status}`);
        throw new Error(`Drafts query failed: ${response.status}`);
      }

      const drafts = await response.json();
      
      console.log(`[teacher-drafts] [${requestId}] Successfully fetched ${drafts.length} drafts`);
      
      // Map snake_case DB fields back to camelCase for the client
      const mappedDrafts = (drafts || []).map(row => ({
        id: row.id,
        teacher: row.teacher,
        title: row.title,
        className: row.class_name,
        releaseAt: row.release_at,
        dueAt: row.due_at,
        notes: row.notes,
        assignment: row.assignment,
        mapping: row.mapping,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        autoRelease: row.auto_release || false,
        issuedAt: row.issued_at || null,
        autoReleaseStatus: row.auto_release_status || null,
        autoReleaseError: row.auto_release_error || null,
      }));

      return jsonResponse(
        event,
        200,
        { ok: true, drafts: mappedDrafts },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    // POST: Upsert a draft
    if (event.httpMethod === 'POST') {
      if (!event.body) {
        return jsonResponse(event, 400, { ok: false, error: 'Missing request body' }, {}, requestId);
      }

      let body;
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON' }, {}, requestId);
      }

      if (!body.id) {
        return jsonResponse(event, 400, { ok: false, error: 'Missing draft id' }, {}, requestId);
      }

      // Derive auto_release_status from the request fields.
      // If the teacher is explicitly saving with autoRelease=true and no issuedAt
      // → reset to 'pending' (intentional teacher action, re-arms errored drafts).
      // If issuedAt is set → 'issued'.
      // Otherwise → 'disabled'.
      let autoReleaseStatus;
      if (body.issuedAt) {
        autoReleaseStatus = 'issued';
      } else if (body.autoRelease) {
        autoReleaseStatus = 'pending';
      } else {
        autoReleaseStatus = 'disabled';
      }

      // Convert from client schema to DB schema
      const dbRow = {
        id: body.id,
        teacher: teacher,
        title: body.title || '',
        class_name: body.className || null,
        release_at: body.releaseAt || null,
        due_at: body.dueAt || null,
        notes: body.notes || null,
        assignment: body.assignment || {},
        mapping: body.mapping || {},
        created_at: body.createdAt || new Date().toISOString(),
        updated_at: body.updatedAt || new Date().toISOString(),
        auto_release: !!body.autoRelease,
        issued_at: body.issuedAt || null,
        auto_release_status: autoReleaseStatus
      };

      console.log(`[teacher-drafts] [${requestId}] Upserting draft: ${body.id}`);

      const upsertUrl = `${SUPABASE_URL}/rest/v1/teacher_drafts`;
      const response = await fetch(upsertUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        // Supabase REST API requires array wrapper when using resolution=merge-duplicates for upsert behavior
        body: JSON.stringify([dbRow])
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[teacher-drafts] [${requestId}] Upsert failed: ${response.status} - ${errorText}`);
        throw new Error(`Draft upsert failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`[teacher-drafts] [${requestId}] Successfully upserted draft: ${body.id}`);

      return jsonResponse(
        event,
        200,
        { ok: true, draft: result[0] || null },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    // DELETE: Remove a draft by id, or all drafts for the teacher if no id is provided
    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};
      const id = params.id;

      if (id) {
        // Delete a single draft by id
        console.log(`[teacher-drafts] [${requestId}] Deleting draft: ${id}`);

        const deleteUrl = `${SUPABASE_URL}/rest/v1/teacher_drafts?id=eq.${encodeURIComponent(id)}&teacher=eq.${encodeURIComponent(teacher)}`;
        const response = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          console.error(`[teacher-drafts] [${requestId}] Delete failed with status: ${response.status}`);
          throw new Error(`Draft delete failed: ${response.status}`);
        }

        console.log(`[teacher-drafts] [${requestId}] Successfully deleted draft: ${id}`);
      } else {
        // No id provided: delete ALL drafts for this teacher
        console.log(`[teacher-drafts] [${requestId}] Deleting all drafts for teacher: ${teacher}`);

        const deleteAllUrl = `${SUPABASE_URL}/rest/v1/teacher_drafts?teacher=eq.${encodeURIComponent(teacher)}`;
        const response = await fetch(deleteAllUrl, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          console.error(`[teacher-drafts] [${requestId}] Bulk delete failed with status: ${response.status}`);
          throw new Error(`Bulk draft delete failed: ${response.status}`);
        }

        console.log(`[teacher-drafts] [${requestId}] Successfully deleted all drafts for teacher: ${teacher}`);
      }

      return jsonResponse(
        event,
        200,
        { ok: true },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    // Method not allowed
    console.log(`[teacher-drafts] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);

  } catch (err) {
    console.error(`[teacher-drafts] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to process request' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
