-- Migration: Fix missing goal_area and case_manager for S045 goals
-- Date: 2026-03-10
-- Context: PR #712 inserted S045.11.1 and S045.11.2 without goal_area or case_manager.
--          This migration records the corrective UPDATE that was manually applied in Supabase.

UPDATE public.goals SET goal_area = 'Reading Comprehension', case_manager = 'Jessica Bruno' WHERE code = 'S045.11.1';
UPDATE public.goals SET goal_area = 'Written Expression', case_manager = 'Jessica Bruno' WHERE code = 'S045.11.2';
