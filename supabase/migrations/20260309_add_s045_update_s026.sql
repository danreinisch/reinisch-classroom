-- Migration: Update S026.9.2 goal description and add new student S045
-- Date: 2026-03-09

-- 1. Correct the goal description for S026.9.2 (was a duplicate of S026.9.1 reading comprehension)
UPDATE public.goals
SET "desc" = 'S026 will increase his written skills goal by able to write a paragraph with introduction, details and conclusion with 80% accuracy by the life of the IEP.'
WHERE code = 'S026.9.2';

-- 2. Insert new student S045
INSERT INTO public.students (code, iep_due, eval_due, primary_case_manager, active)
VALUES ('S045', '2026-08-21', '2029-01-15', 'Jessica Bruno', true);

-- 3. Insert goals for S045 (reference student by code subquery since goals uses student_id UUID FK)
INSERT INTO public.goals (student_id, code, "desc", measurement_type, class_context, data_collector, data_collector_email, status, active)
VALUES (
    (SELECT id FROM public.students WHERE code = 'S045'),
    'S045.11.1',
    'S045 will increase his reading comprehension skills by determining the meaning of words and phrases as they are used in reading and content (ex. figurative language, etc.) in context with 80% accuracy by the end of the annual IEP cycle. Baseline: 70%',
    'Percent',
    'Language Arts 3 SC',
    'Dan Reinisch',
    'danielreinisch@winfieldriv.us',
    'active',
    true
);

INSERT INTO public.goals (student_id, code, "desc", measurement_type, class_context, data_collector, data_collector_email, status, active)
VALUES (
    (SELECT id FROM public.students WHERE code = 'S045'),
    'S045.11.2',
    'S045 will increase his written expression skills by restating questions and adding 3 supporting details to his writing with 50% accuracy by the end of the annual IEP cycle. Baseline: 35%',
    'Percent',
    'Language Arts 3 SC',
    'Dan Reinisch',
    'danielreinisch@winfieldriv.us',
    'active',
    true
);

-- 4. Insert class enrollment for S045 in Language Arts 3 SC
INSERT INTO public.class_enrollments (class_id, student_id, class_code)
VALUES (
    (SELECT id FROM public.classes WHERE code = 'LA3' LIMIT 1),
    (SELECT id FROM public.students WHERE code = 'S045'),
    'LA3'
);
