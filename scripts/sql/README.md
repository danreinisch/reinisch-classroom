# scripts/sql — One-off SQL Maintenance Scripts

This directory holds **manual, one-off SQL scripts** that are run directly in
the Supabase SQL editor (or `psql`) to fix data issues. They are **not**
Supabase migrations and are **not** executed automatically.

## Naming convention

```
YYYY-MM-DD_short_description[_<uuid-prefix>].sql
```

Example: `2026-04-18_remove_orphaned_week13_assignment_d2362c85.sql`

## How to run a script

1. Open the **Supabase dashboard → SQL editor** for the project.
2. Paste the contents of the script into the editor (or use the *Open file*
   button if your browser supports it).
3. Every script in this directory is wrapped in `BEGIN; … COMMIT;` and includes
   a `SELECT` preview block. **Run the whole script first** — the preview query
   will show you the rows that are about to be changed/deleted.
4. If the preview looks correct, the `COMMIT` at the end finalises the
   transaction. If anything looks wrong, replace `COMMIT` with `ROLLBACK`
   before executing, or simply close the editor session without committing.

## What belongs here vs. `supabase/migrations/`

| `supabase/migrations/`                       | `scripts/sql/`                              |
|----------------------------------------------|---------------------------------------------|
| Schema changes (DDL) applied to all envs     | One-off data fixes for a specific incident  |
| Run automatically by Supabase CLI / CD       | Run manually by a developer or DBA          |
| Ordered and idempotent by convention         | Idempotent-safe but not ordered             |

## Idempotency requirement

Every script must be safe to run more than once. Use constructs like:
- `DELETE … WHERE id = '<uuid>'` (affects 0 rows if already deleted, no error)
- `UPDATE … WHERE id = '<uuid>'` (no-op if row is gone or already patched)
- `INSERT … ON CONFLICT DO NOTHING`

## Authorship and review

Before running a script in production:
- [ ] Have a second person review the `SELECT` preview output.
- [ ] Keep a note of the Supabase transaction log or take a screenshot of the
      query result for the incident record.
