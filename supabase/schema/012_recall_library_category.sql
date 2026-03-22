-- Add category column to recall_library for grouping recalled assignments
ALTER TABLE public.recall_library ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS idx_recall_library_category ON public.recall_library(category);
