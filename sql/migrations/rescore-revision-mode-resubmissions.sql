-- One-time migration: Re-score revision-mode re-submissions that were missed
-- by the server-side scoring bug fixed in PR #1298.
--
-- Problem:
--   When a student re-submitted in revision mode, submissions.submitted_at was
--   updated but submission_answers.scored_at / scored values were NEVER refreshed.
--   The teacher continued to see the original (stale) score forever.
--
-- How to use:
--   1. Run the DRY RUN block first (no changes, just identifies affected rows).
--   2. Review the output. Confirm the listed submissions look correct.
--   3. Run the TARGETED FIX block for each specific submission you want to repair.
--      There is no generic "re-run scoring" function available in SQL — correct
--      scores must be computed in application code or supplied manually per instance.
--
-- ─── STEP 1: DRY RUN — identify affected submissions ─────────────────────────
--
-- Returns submissions where:
--   • The assignment instance has retry_config.revision_mode = true (was returned for revision)
--   • The most recent submission_answers.scored_at is older than submissions.submitted_at
--     (i.e. scoring was not re-run on the re-submission)
--
SELECT
  ai.id                                                          AS instance_id,
  s.code                                                         AS student_code,
  sub.id                                                         AS submission_id,
  sub.submitted_at,
  sub.score_auto,
  sub.score_total,
  sub.review_status,
  MAX(sa.scored_at)                                              AS last_scored_at,
  ai.settings -> 'retry_config' ->> 'original_score'            AS original_score,
  ai.settings -> 'retry_config' ->> 'retry_initiated_at'        AS retry_initiated_at,
  ai.resubmission_count
FROM assignment_instances ai
JOIN students s ON s.id = ai.student_id
JOIN submissions sub ON sub.instance_id = ai.id
LEFT JOIN submission_answers sa ON sa.submission_id = sub.id
WHERE
  -- Instance was returned for revision (has revision_mode flag)
  (ai.settings -> 'retry_config' ->> 'revision_mode')::boolean = true
GROUP BY ai.id, s.code, sub.id, sub.submitted_at, sub.score_auto, sub.score_total, sub.review_status, ai.settings, ai.resubmission_count
HAVING
  -- submitted_at advanced past the last scored_at, meaning re-scoring never ran
  sub.submitted_at > COALESCE(MAX(sa.scored_at), '1970-01-01'::timestamptz)
ORDER BY sub.submitted_at DESC;

-- ─── STEP 2: TARGETED FIX ────────────────────────────────────────────────────
--
-- For each affected submission identified above, you have two options:
--
-- Option A (recommended): Trigger a re-score by asking the student to re-submit
--   their assignment from the student portal. The server-side fix in PR #1298
--   ensures subsequent re-submissions will be scored correctly.
--
-- Option B: Manual SQL adjustment (example for one submission).
--   Replace the UUIDs, item_refs, and point values with the correct values for
--   the specific submission you are fixing.
--
-- BEGIN;
--
-- -- 1. Update individual MCQ submission_answers rows
-- UPDATE submission_answers sa
-- SET
--   is_correct    = (ai_item.meta ->> 'correct' = sa.raw_answer ->> 'value'),
--   earned_points = CASE WHEN ai_item.meta ->> 'correct' = sa.raw_answer ->> 'value'
--                        THEN ai_item.points ELSE 0 END,
--   scored_at     = now()
-- FROM assignment_items ai_item
-- WHERE sa.assignment_item_id = ai_item.id
--   AND sa.submission_id      = '<submission-uuid>'
--   AND ai_item.answer_type IN ('mcq', 'boolean', 'multi');
--
-- -- 2. Recompute submission-level scores from the updated rows
-- UPDATE submissions sub
-- SET
--   score_auto   = (SELECT COALESCE(SUM(earned_points), 0) FROM submission_answers WHERE submission_id = sub.id AND earned_points IS NOT NULL),
--   score_total  = (
--     SELECT CASE WHEN SUM(max_points) > 0
--                 THEN ROUND((SUM(earned_points) / SUM(max_points)) * 100)
--                 ELSE NULL END
--     FROM submission_answers
--     WHERE submission_id = sub.id AND max_points IS NOT NULL
--   ),
--   review_status = 'pending'   -- re-queue for teacher review
-- WHERE id = '<submission-uuid>';
--
-- -- 3. Fix resubmission_count (if it was not incremented due to the bug)
-- UPDATE assignment_instances
-- SET resubmission_count = 1
-- WHERE id = '<instance-uuid>'
--   AND resubmission_count = 0;
--
-- -- Verify before committing:
-- SELECT id, score_auto, score_total, review_status FROM submissions WHERE id = '<submission-uuid>';
-- SELECT is_correct, earned_points, scored_at FROM submission_answers WHERE submission_id = '<submission-uuid>';
--
-- COMMIT;
