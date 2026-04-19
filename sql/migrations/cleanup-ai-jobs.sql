-- Migration: cleanup-ai-jobs
-- Removes ai_jobs rows older than 7 days to prevent unbounded table growth.
--
-- Option A (implemented in code): Probabilistic cleanup
-- The status endpoint (teacher-ai-skills-summary-status.js) runs a fire-and-forget DELETE
-- on ~1% of requests, targeting rows where created_at < now() - interval '7 days'.
-- This requires no additional infrastructure but may lag behind during low-traffic periods.
--
-- Option B (recommended for production): pg_cron scheduled job
-- Run the following SQL in the Supabase SQL editor to set up a nightly cleanup job.
-- Requires the pg_cron extension (enabled by default on Supabase).

-- Enable pg_cron if not already enabled
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule a nightly cleanup at 2:00 AM UTC
-- SELECT cron.schedule(
--   'cleanup-ai-jobs-7d',               -- job name (unique)
--   '0 2 * * *',                         -- cron expression: 2:00 AM UTC daily
--   $$
--     DELETE FROM ai_jobs
--     WHERE created_at < now() - interval '7 days';
--   $$
-- );

-- To verify the job is scheduled:
-- SELECT * FROM cron.job WHERE jobname = 'cleanup-ai-jobs-7d';

-- To remove the scheduled job:
-- SELECT cron.unschedule('cleanup-ai-jobs-7d');

-- Manual one-time cleanup (run interactively if the table has grown large):
DELETE FROM ai_jobs
WHERE created_at < now() - interval '7 days';
