# `goal_data_points` Table — RLS Policy Reference

## Table Overview

| Property        | Value                  |
|-----------------|------------------------|
| Schema          | `public`               |
| Table type      | `BASE TABLE`           |
| Row count       | ~350 rows              |

The `goal_data_points` table stores per-question data points that are generated when assignments are submitted through the Student Portal. These records power the dot-grid charts visible in the Teacher Center Students page and the Student Portal Goals tab.

---

## Required RLS Policies

Three roles require access:

### `service_role` — Full access (ALL)

```sql
CREATE POLICY "service_role full access on goal_data_points"
  ON public.goal_data_points
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

Used by Netlify serverless functions (e.g., `process-submission`) to insert new data points.

---

### `authenticated` — SELECT access

```sql
CREATE POLICY "authenticated read on goal_data_points"
  ON public.goal_data_points
  FOR SELECT
  TO authenticated
  USING (true);
```

Used when a user is authenticated via Supabase Auth.

---

### `anon` — SELECT access (CRITICAL)

```sql
CREATE POLICY "anon read on goal_data_points"
  ON public.goal_data_points
  FOR SELECT
  TO anon
  USING (true);
```

> ⚠️ **This policy is critical.** The Supabase JS client uses the `anon` key for all client-side requests unless `supabase.auth.signIn()` has been called. This application uses its own session-based auth (via `teacher-shell.js`), **not** Supabase Auth. Therefore, all Supabase queries from the Teacher Center and Student Portal are made as the `anon` role.
>
> **If this policy is missing, every `listGoalDataPoints()` call will silently return 0 rows**, the dot-grid charts will remain empty, and the data-count badges will not update — even though the table contains data.

---

## Verification

### Check row count

```sql
SELECT count(*) FROM goal_data_points;
-- Should return ~350 (or more as data grows)
```

### Check existing RLS policies

```sql
SELECT policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'goal_data_points'
ORDER BY policyname;
```

Expected output (3+ policies):
- `anon read on goal_data_points` — SELECT, `anon`
- `authenticated read on goal_data_points` — SELECT, `authenticated`
- `service_role full access on goal_data_points` — ALL, `service_role`

---

## Root Cause History

**PR #930** identified that the `goal_data_points` table had no `anon` SELECT policy. Because `listGoalDataPoints()` is called from client-side JavaScript using the Supabase `anon` key, RLS filtered every row, causing all queries to return empty results. After adding the `anon` SELECT policy (run directly in the Supabase SQL Editor), the dot-grid charts immediately began rendering correctly with the 350 existing rows.
