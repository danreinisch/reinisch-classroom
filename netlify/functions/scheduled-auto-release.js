// Netlify scheduled function: auto-release drafts whose release time has passed.
// Schedule: every 10 minutes.  Configured in netlify.toml.
// No HTTP auth required — runs headless via Netlify's scheduler with the service role key.

'use strict';

const { getSupabaseConfig, lookupActiveTeacherId } = require('./_lib/supa');
const { generateRequestId } = require('./_lib/http');
const { issueDraftCore } = require('./teacher-issue-draft');

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();

/**
 * Fetch due auto-release drafts from the DB.
 * Returns rows where auto_release=true, status=pending, issued_at is null, and
 * release_at <= now().
 */
async function fetchDueDrafts(requestId) {
  // PostgREST filter: release_at less-than-or-equal to now()
  const url = `${SUPABASE_URL}/rest/v1/teacher_drafts` +
    `?select=*` +
    `&auto_release=eq.true` +
    `&auto_release_status=eq.pending` +
    `&issued_at=is.null` +
    `&release_at=not.is.null` +
    `&release_at=lte.${encodeURIComponent(new Date().toISOString())}` +
    `&order=release_at.asc` +
    `&limit=50`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`[scheduled-auto-release] [${requestId}] Supabase query failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Stamp auto_release_attempted_at on a draft row before attempting issuance.
 */
async function stampAttempted(draftId, requestId) {
  const url = `${SUPABASE_URL}/rest/v1/teacher_drafts?id=eq.${encodeURIComponent(draftId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ auto_release_attempted_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    console.warn(`[scheduled-auto-release] [${requestId}] Failed to stamp attempted_at for draft ${draftId}: ${res.status}`);
  }
}

/**
 * Mark a draft as issued after successful auto-release.
 */
async function markIssued(draftId, assignmentId, requestId) {
  const now = new Date().toISOString();
  const patch = {
    auto_release_status: 'issued',
    issued_at: now,
    auto_release_error: null,
  };
  if (assignmentId) patch.assignment_id = assignmentId;

  const url = `${SUPABASE_URL}/rest/v1/teacher_drafts?id=eq.${encodeURIComponent(draftId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    console.warn(`[scheduled-auto-release] [${requestId}] Failed to mark draft ${draftId} as issued: ${res.status}`);
  }
}

/**
 * Mark a draft as errored after a failed auto-release.  Will not be retried.
 */
async function markErrored(draftId, errorMessage, requestId) {
  const truncatedError = String(errorMessage || 'Unknown error').slice(0, 500);
  const url = `${SUPABASE_URL}/rest/v1/teacher_drafts?id=eq.${encodeURIComponent(draftId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ auto_release_status: 'errored', auto_release_error: truncatedError }),
  });
  if (!res.ok) {
    console.warn(`[scheduled-auto-release] [${requestId}] Failed to mark draft ${draftId} as errored: ${res.status}`);
  }
}

/**
 * Reshape a DB row (snake_case) into the camelCase draft object that issueDraftCore expects.
 */
function dbRowToDraft(row) {
  return {
    id: row.id,
    title: row.title,
    className: row.class_name,
    releaseAt: row.release_at,
    dueAt: row.due_at,
    notes: row.notes,
    assignment: row.assignment || {},
    mapping: row.mapping || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    autoRelease: row.auto_release || false,
    issuedAt: row.issued_at || null,
    autoReleaseStatus: row.auto_release_status || null,
    autoReleaseError: row.auto_release_error || null,
  };
}

exports.handler = async (_event) => {
  const requestId = generateRequestId();
  console.log(`[scheduled-auto-release] [${requestId}] Scheduler tick started`);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[scheduled-auto-release] [${requestId}] Supabase not configured — skipping run`);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Supabase not configured' }) };
  }

  let attempted = 0;
  let issued = 0;
  let errored = 0;

  try {
    const dueDrafts = await fetchDueDrafts(requestId);
    console.log(`[scheduled-auto-release] [${requestId}] Found ${dueDrafts.length} due draft(s)`);

    for (const row of dueDrafts) {
      const draftId = row.id;
      const teacherUsername = row.teacher;

      console.log(`[scheduled-auto-release] [${requestId}] Processing draft "${row.title}" (ID: ${draftId}, teacher: ${teacherUsername})`);

      // Stamp attempt time first
      await stampAttempted(draftId, requestId);
      attempted++;

      try {
        // Resolve teacher UUID (needed for class scoping)
        const teacherUUID = await lookupActiveTeacherId();
        if (!teacherUUID) {
          console.warn(`[scheduled-auto-release] [${requestId}] Could not resolve teacher UUID for draft ${draftId}`);
        }

        // Reshape the DB row into the camelCase draft object
        const draft = dbRowToDraft(row);

        // Call the core issue logic (no HTTP event needed)
        const result = await issueDraftCore({ draft, teacherUsername, teacherUUID, requestId });

        if (result.ok) {
          console.log(`[scheduled-auto-release] [${requestId}] Draft "${row.title}" issued successfully (assignment_id: ${result.assignment_id}, issued_count: ${result.issued_count})`);
          await markIssued(draftId, result.assignment_id, requestId);
          issued++;
        } else {
          const errMsg = result.error || 'issueDraftCore returned ok=false';
          console.error(`[scheduled-auto-release] [${requestId}] Draft "${row.title}" issue failed (statusCode: ${result.statusCode}): ${errMsg}`);
          await markErrored(draftId, errMsg, requestId);
          errored++;
        }
      } catch (draftErr) {
        const errMsg = draftErr.message || String(draftErr);
        console.error(`[scheduled-auto-release] [${requestId}] Draft "${row.title}" threw an error: ${errMsg}`);
        await markErrored(draftId, errMsg, requestId);
        errored++;
      }
    }
  } catch (err) {
    console.error(`[scheduled-auto-release] [${requestId}] Fatal error:`, err.message);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, error: err.message, attempted, issued, errored }),
    };
  }

  const summary = { ok: true, attempted, issued, errored };
  console.log(`[scheduled-auto-release] [${requestId}] Run complete:`, summary);
  return { statusCode: 200, body: JSON.stringify(summary) };
};
