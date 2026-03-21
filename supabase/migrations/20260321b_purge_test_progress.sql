-- Migration: 20260321b_purge_test_progress
-- Purpose: Purge ALL test/development goal progress data from the goal_progress table.
-- Live data collection begins next week; all existing rows are test data.
-- The teacher has confirmed ALL existing progress data is test data.

DELETE FROM public.goal_progress;
