# Auto-Release Scheduler

The auto-release scheduler is a Netlify scheduled function that automatically issues draft assignments at their configured release time, without requiring the teacher to be logged in.

## How It Works

The scheduler (`netlify/functions/scheduled-auto-release.js`) runs every 10 minutes via Netlify's scheduled function infrastructure. On each run, it:

1. Queries the `teacher_drafts` table for rows where:
   - `auto_release = true`
   - `auto_release_status = 'pending'`
   - `issued_at IS NULL`
   - `release_at <= now()`
2. For each due draft, calls the same core logic as the manual "Issue" button (`issueDraftCore` from `teacher-issue-draft.js`) using the service-role key — no teacher JWT is required.
3. Updates the draft row with the outcome (`issued` or `errored`).

### Schedule

The schedule is declared in `netlify.toml`:

```toml
[functions."scheduled-auto-release"]
  schedule = "*/10 * * * *"
```

This runs at minute 0, 10, 20, 30, 40, and 50 of every hour. The maximum latency between a draft's `release_at` time and actual issuance is ~10 minutes.

## State Machine

Each draft with `auto_release = true` goes through the following states stored in `auto_release_status`:

```
pending ──► issued    (scheduler issued it successfully)
        └─► errored   (scheduler encountered an error; requires manual re-arm)
```

Drafts with `auto_release = false` always have `auto_release_status = 'disabled'`.

### State descriptions

| Status | Meaning |
|--------|---------|
| `pending` | Draft is scheduled for auto-release; the scheduler will issue it when `release_at <= now()`. |
| `issued` | Draft was successfully auto-released (or manually issued). `issued_at` is set. |
| `errored` | Auto-release failed. See `auto_release_error` for details. Will not be retried. |
| `disabled` | `auto_release` is `false`; this draft is managed manually. |

## Failure Behavior

If the scheduler encounters an error while issuing a draft (e.g. the class doesn't exist, or the assignment file is malformed), it:

1. Sets `auto_release_status = 'errored'`
2. Stores the error message (truncated to 500 chars) in `auto_release_error`
3. **Does not retry** on subsequent ticks — the `pending` filter excludes errored rows

This prevents a transient or permanent bug from silently producing hundreds of failures before the teacher notices.

### In-UI error indicator

When `auto_release_status === 'errored'`, the draft row in the Teacher Center Work page displays a red **"⚠ Auto-release failed"** badge next to the title. Hovering over the badge shows the full error message from `auto_release_error`.

## Re-arming a Failed Auto-Release

If a draft ends up in the `errored` state:

1. Go to Teacher Center → Work.
2. Click **Edit** on the failed draft.
3. Leave **"Auto-release on date"** checked (or re-check it if needed).
4. **Adjust the Release datetime to a time in the future.** This is required — simply clicking Save without changing the release date will NOT clear the error state (this is intentional, to prevent silent retries and force a conscious choice of a new release time).
5. Click **Save Draft**.

The POST handler resets `auto_release_status` back to `'pending'` only when `autoRelease = true`, `issuedAt` is not set, and the `releaseAt` timestamp has been changed. Editing any other field (e.g. notes) without changing the release date leaves the status as `'errored'`.

## Database Columns

The following columns were added to `public.teacher_drafts` by migration `20260425_auto_release_scheduler.sql`:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `auto_release` | `boolean` | `false` | Whether this draft is scheduled for auto-release. |
| `issued_at` | `timestamptz` | `NULL` | Timestamp when the draft was issued (manually or automatically). |
| `auto_release_status` | `text` | `'pending'` | State machine value: `pending`, `issued`, `errored`, or `disabled`. |
| `auto_release_error` | `text` | `NULL` | Most recent error message from the scheduler (up to 500 chars). |
| `auto_release_attempted_at` | `timestamptz` | `NULL` | Last time the scheduler attempted this draft. |

An index on `release_at` (filtered to `auto_release = true AND auto_release_status = 'pending' AND issued_at IS NULL`) keeps the scheduler query fast.

## Monitoring

All scheduler runs are logged to Netlify function logs with the prefix `[scheduled-auto-release]`. Each run produces a summary line:

```
[scheduled-auto-release] [<requestId>] Run complete: { ok: true, attempted: N, issued: M, errored: K }
```

To view logs: Netlify dashboard → Functions → `scheduled-auto-release` → Logs.
