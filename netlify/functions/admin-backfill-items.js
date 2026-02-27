// Admin action: backfill missing assignment_items from assignment meta
// POST /.netlify/functions/admin-backfill-items
// Body: { assignment_id } — backfill a single assignment, or omit to backfill ALL assignments missing items
// Auth: Requires teacher/admin session cookie

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

/**
 * Build assignment_items rows from a parsed meta object.
 * Mirrors the item creation logic in teacher-issue-draft.js.
 */
function buildItemsFromMeta(assignmentId, meta) {
  const items = [];
  if (!meta || !Array.isArray(meta.days)) return items;

  for (const day of meta.days) {
    if (day.type === 'questions' && Array.isArray(day.questions)) {
      for (const q of day.questions) {
        items.push({
          assignment_id: assignmentId,
          item_ref: `${day.day_number}_${q.number}`,
          answer_type: 'mcq',
          points: 1,
          meta: {
            day: day.day_number,
            question_number: q.number,
            text: q.text,
            choices: q.choices,
            correct: q.correct,
            hint: q.hint,
          },
        });
      }
    } else if (day.type === 'writing_prompt') {
      items.push({
        assignment_id: assignmentId,
        item_ref: `WP_${day.day_number}`,
        answer_type: 'constructed',
        points: 5,
        meta: {
          day: day.day_number,
          type: 'writing_prompt',
          prompt: day.prompt,
          structure: day.structure,
          hints: day.hints,
        },
      });
    }
  }
  return items;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[admin-backfill-items] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[admin-backfill-items] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[admin-backfill-items] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[admin-backfill-items] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const user = authResult.user.username || 'unknown';
  console.log(`[admin-backfill-items] [${requestId}] Authorized user: ${user}`);

  let body = {};
  try {
    if (event.body) body = JSON.parse(event.body);
  } catch {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON body' }, {}, requestId);
  }

  const { assignment_id, force } = body;

  // force flag only applies when a specific assignment_id is given
  const forceRebuild = force === true && assignment_id != null;

  try {
    // Fetch assignments to process
    let assignmentsUrl;
    if (assignment_id != null) {
      assignmentsUrl = `${SUPABASE_URL}/rest/v1/assignments?id=eq.${encodeURIComponent(assignment_id)}&select=id,meta`;
    } else {
      // All assignments — we'll filter below to only those missing items
      assignmentsUrl = `${SUPABASE_URL}/rest/v1/assignments?select=id,meta`;
    }

    const assignmentsRes = await fetch(assignmentsUrl, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!assignmentsRes.ok) {
      const errorText = await assignmentsRes.text();
      throw new Error(`Failed to fetch assignments: ${assignmentsRes.status} - ${errorText}`);
    }

    const assignments = await assignmentsRes.json();
    console.log(`[admin-backfill-items] [${requestId}] Found ${assignments.length} assignment(s) to check`);

    const results = [];

    for (const assignment of assignments) {
      const aId = assignment.id;

      // Check if this assignment already has items
      const existingRes = await fetch(
        `${SUPABASE_URL}/rest/v1/assignment_items?assignment_id=eq.${aId}&select=id&limit=1`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!existingRes.ok) {
        const errorText = await existingRes.text();
        console.warn(`[admin-backfill-items] [${requestId}] Failed to check existing items for assignment ${aId}: ${existingRes.status} - ${errorText}`);
        results.push({ assignment_id: aId, skipped: true, reason: 'failed to check existing items' });
        continue;
      }

      const existingItems = await existingRes.json();

      if (existingItems.length > 0) {
        if (forceRebuild) {
          // Delete existing items so they can be re-inserted from meta
          console.log(`[admin-backfill-items] [${requestId}] Force rebuild: deleting ${existingItems.length} existing item(s) for assignment ${aId}`);
          const deleteRes = await fetch(
            `${SUPABASE_URL}/rest/v1/assignment_items?assignment_id=eq.${aId}`,
            {
              method: 'DELETE',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
            }
          );
          if (!deleteRes.ok) {
            const errorText = await deleteRes.text();
            console.error(`[admin-backfill-items] [${requestId}] Delete failed for assignment ${aId}: ${deleteRes.status} - ${errorText}`);
            results.push({ assignment_id: aId, error: `delete failed: ${deleteRes.status}` });
            continue;
          }
        } else {
          console.log(`[admin-backfill-items] [${requestId}] Assignment ${aId} already has items, skipping`);
          results.push({ assignment_id: aId, skipped: true, reason: 'already has items' });
          continue;
        }
      }

      // Build items from meta
      const itemsToUpsert = buildItemsFromMeta(aId, assignment.meta);

      if (itemsToUpsert.length === 0) {
        console.log(`[admin-backfill-items] [${requestId}] Assignment ${aId} has no parseable items in meta`);
        results.push({ assignment_id: aId, skipped: true, reason: 'no items in meta' });
        continue;
      }

      // Upsert items
      const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/assignment_items`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(itemsToUpsert),
      });

      if (!upsertRes.ok) {
        const errorText = await upsertRes.text();
        console.error(`[admin-backfill-items] [${requestId}] Upsert failed for assignment ${aId}: ${upsertRes.status} - ${errorText}`);
        results.push({ assignment_id: aId, error: `upsert failed: ${upsertRes.status}` });
      } else {
        console.log(`[admin-backfill-items] [${requestId}] ${forceRebuild ? 'Force-rebuilt' : 'Backfilled'} ${itemsToUpsert.length} items for assignment ${aId}`);
        results.push({ assignment_id: aId, items_created: itemsToUpsert.length, ...(forceRebuild ? { forced: true } : {}) });
      }
    }

    const created = results.filter(r => r.items_created != null).reduce((sum, r) => sum + r.items_created, 0);
    const skipped = results.filter(r => r.skipped).length;
    const errors = results.filter(r => r.error).length;

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        summary: { assignments_checked: assignments.length, items_created: created, skipped, errors },
        results,
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[admin-backfill-items] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: String(err?.message || err) },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
