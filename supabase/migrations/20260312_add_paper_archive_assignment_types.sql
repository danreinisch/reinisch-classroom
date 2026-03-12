-- Migration: Extend assignment_type enum with 'paper' and 'archive' values
-- 'archive' is used by the teacher-upload-archive Netlify function
-- 'paper' is used for paper-based assignment uploads via the Library page

ALTER TYPE public.assignment_type ADD VALUE IF NOT EXISTS 'archive';
ALTER TYPE public.assignment_type ADD VALUE IF NOT EXISTS 'paper';
