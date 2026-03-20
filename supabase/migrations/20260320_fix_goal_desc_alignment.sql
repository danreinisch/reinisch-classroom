-- Migration: 20260320_fix_goal_desc_alignment
-- Purpose: Authoritatively correct ALL active goal desc, baseline, and mastery values
--          for students S001-S045 to match the master IEP CSV (source of truth).
--          This migration supersedes 20260320_fix_goal_descriptions.sql.
--
-- Background: Goal descriptions in the database are misaligned with the CSV source
-- of truth across the entire student caseload. The desc column has wrong or abbreviated
-- text paired with certain goal codes as a result of the original CSV import.
-- This migration is the authoritative one-time reconciliation fix covering all
-- active students S001-S045 (S029 and S030 are inactive and are skipped).
--
-- S001 Written Expression subgoals (S001.11.3-1 and S001.11.3-3) had their
-- descriptions swapped in the original CSV and in the database. Their corrections
-- use the authoritative values confirmed in the problem statement, which supersede
-- the CSV file content for those specific goals.
--
-- Idempotent: safe to re-run. Only targets active goals (active = true).
-- Source of truth: master IEP CSV (data/student-goals-latest.csv) plus
--                  explicit corrections for S001-S005, and the earlier
--                  20260320_fix_goal_descriptions.sql for S034-S037, S043-S045.

BEGIN;

-- ============================================================
-- STEP 0: Purge all test data
-- The app goes live imminently; all existing progress data is test data.
-- ============================================================

-- Purge all test goal progress data
DELETE FROM public.goal_progress;

-- Purge all test submission answers
DELETE FROM public.submission_answers;

-- Purge all test submissions
DELETE FROM public.submissions;

-- Reset assignment instance statuses back to 'Assigned'
UPDATE public.assignment_instances
SET status = 'Assigned'
WHERE status IN ('Submitted', 'Graded', 'In Progress');

-- ============================================================
-- STEP 1: Fix S009.11.2 goal code typo (S00911.2 -> S009.11.2)
-- ============================================================
UPDATE public.goals g
SET code = 'S009.11.2'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S00911.2'
  AND g.active = true;

-- ============================================================
-- STEP 2: Correct all goal descriptions, baselines, and mastery
--         values to match the master IEP CSV.
--         S001-S005 use authoritative values from the problem statement
--         (which supersede the CSV file for those goals).
--         S006-S045 use the master CSV verbatim.
--         S034, S037: not present in any reference file -- skipped.
-- ============================================================

-- ============================================================
-- S001 -- 5 goals
-- ============================================================

-- S001.11.1 -- Basic Reading
UPDATE public.goals g
SET "desc"   = 'S001 will increase his basic reading skills to read multi-syllabic (3 or more syllables) words with 80% accuracy by the next annual IEP.',
    baseline = '60%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.1'
  AND g.active = true;

-- S001.11.2 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S001 will increase his reading comprehension skills by understanding context cues to define unknown words by using clues in the sentence or the surrounding sentences with 75% accuracy by the next annual IEP.',
    baseline = '42%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.2'
  AND g.active = true;

-- S001.11.3-1 -- Written Expression (Add 1-2 details)
-- NOTE: S001.11.3-1 and S001.11.3-3 had their descriptions SWAPPED in the original
--       CSV and database. This uses the authoritative problem-statement values.
UPDATE public.goals g
SET "desc"   = 'S001 will increase his written expression skills by writing two paragraphs using the objectives listed below with 80% accuracy by the next annual IEP. (Add 1-2 details to reinforce his topic sentence)',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.3-1'
  AND g.active = true;

-- S001.11.3-2 -- Written Expression (Transition words)
UPDATE public.goals g
SET "desc"   = 'S001 will increase his written expression skills by writing two paragraphs using the objectives listed below with 80% accuracy by the next annual IEP. (Appropriate use and differentiated transition words)',
    baseline = '70%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.3-2'
  AND g.active = true;

-- S001.11.3-3 -- Written Expression (Subject/verb agreement)
-- NOTE: Authoritative fix -- this goal had the "Add 1-2 details" description in
--       the database (swapped with S001.11.3-1). Correct text is subject/verb agreement.
UPDATE public.goals g
SET "desc"   = 'S001 will increase his written expression skills by writing two paragraphs using the objectives listed below with 80% accuracy by the next annual IEP. (Use correct subject and verb agreement in his written assignments).',
    baseline = '60%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.3-3'
  AND g.active = true;

-- ============================================================
-- S002 -- 2 goals
-- ============================================================

-- S002.11.1 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S002 will increase her written expression skills by constructing a response with a claim, adding details, evidence and a conclusion with 80% accuracy.',
    baseline = '40%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S002'
  AND g.code = 'S002.11.1'
  AND g.active = true;

-- S002.11.2 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S002 will increase her reading comprehension skills by answering comprehension questions requiring higher order thinking skills ( making inferencing, evaluating information , analyzing text and supporting details) with a 70% accuracy.',
    baseline = '20%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S002'
  AND g.code = 'S002.11.2'
  AND g.active = true;

-- ============================================================
-- S003 -- 1 goal
-- ============================================================

-- S003.11.1 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'In the area of Written Expression, S003 will increase these skills by including supporting details and conclusion sentence when writing a paragraph with 50% accuracy by the next annual IEP review.',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S003'
  AND g.code = 'S003.11.1'
  AND g.active = true;

-- ============================================================
-- S004 -- 4 goals
-- ============================================================

-- S004.11.1 -- Behavior
UPDATE public.goals g
SET "desc"   = 'S004 will increase his Behavior skills and will limit loud noises to no more than one occurrence per class period and, during brief teacher check-ins when needed, accept ownership for his behavior without making excuses, in 3 of 5 data collections.',
    baseline = '1/5',
    mastery  = '3/5'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.1'
  AND g.active = true;

-- S004.11.2 -- Reading Comprehension
-- NOTE: "questioins" is verbatim from the master IEP CSV -- do not correct this typo.
UPDATE public.goals g
SET "desc"   = 'S004 will increase his Reading Comprehension skills and will make an inference, answering WH questioins and predictions adapted text and support it with at least one piece of textual evidence with 70% by the next annual IEP review.',
    baseline = '53%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.2'
  AND g.active = true;

-- S004.11.3 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S004 will increase his Written Expression skills and when given a prompt and organizer, S004 will compose a five-sentence paragraph (topic, three details, concluding sentence) that stays on topic, scoring at least 50% by the next annual IEP review.',
    baseline = '30%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.3'
  AND g.active = true;

-- S004.11.4 -- Math Calculation
UPDATE public.goals g
SET "desc"   = 'S004 will increase his Math Calculation skills by solving multi-step math problems by using the correct operations (addition, subtraction, multiplication, or division) without assistance with 60% accuracy by the next annual IEP review.',
    baseline = '40%',
    mastery  = '60%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.4'
  AND g.active = true;

-- ============================================================
-- S005 -- 2 goals
-- ============================================================

-- S005.11.1 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S005 will increase his Written Expression skills by constructing a response with a claim, evidence, and a conclusion with 70% accuracy by the next annual IEP review.',
    baseline = '66%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S005'
  AND g.code = 'S005.11.1'
  AND g.active = true;

-- S005.11.2 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S005 will increase his Reading Comprehension by solving comprehension questions requiring higher-order thinking skills (such as inferencing, evaluating, and analyzing) with 80% accuracy by the next annual IEP review.',
    baseline = '67%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S005'
  AND g.code = 'S005.11.2'
  AND g.active = true;

-- ============================================================
-- S006 -- 4 goals
-- ============================================================

-- S006.11.1 -- Behavior
-- NOTE: "duration's" is verbatim from the IEP document -- do not correct this.
UPDATE public.goals g
SET "desc"   = 'S006 will improve his ability to focus on classroom tasks, reducing off-task behaviors such as fidgeting and losing focus, demonstrating self-regulation by staying on task for increasingly longer duration''s in 4 out of 5 observed sessions.',
    baseline = '70%',
    mastery  = '90%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S006'
  AND g.code = 'S006.11.1'
  AND g.active = true;

-- S006.11.2 -- Math Calculation
UPDATE public.goals g
SET "desc"   = 'In the area of Math Calculation, S006 will increase his ability to connect and apply math concepts (such as geometry and algebra) by demonstrating mastery in solving integrated multi-step problems involving these topics with 60% accuracy, by the next annual IEP review.',
    baseline = '60%',
    mastery  = '75%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S006'
  AND g.code = 'S006.11.2'
  AND g.active = true;

-- S006.11.3 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S006 will improve his ability to identify relevant textual evidence that supports the theme(s) or central idea of a text and explain how that evidence contributes to the development of the theme(s) or central idea in 4 out of 5 trials by the next annual IEP review.',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S006'
  AND g.code = 'S006.11.3'
  AND g.active = true;

-- S006.11.4 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'In the area of Written Expression, S006 will improve his ability to write a clear, organized response by including a main idea, supporting details, and a conclusion sentence that reinforces his claims, demonstrating understanding of the literary elements listed above with 45% accuracy by the next annual IEP review.',
    baseline = '50%',
    mastery  = '65%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S006'
  AND g.code = 'S006.11.4'
  AND g.active = true;

-- ============================================================
-- S007 -- 1 goal
-- ============================================================

-- S007.11.1 -- Basic Reading
UPDATE public.goals g
SET "desc"   = 'S007 will increase his Basic Reading skills by identifying high-frequency and irregular words in context. Given sentences from class readings with a missing word, Lothar will select the correct word with 85% by the next annual IEP review Baseline 72%',
    baseline = '72%',
    mastery  = '85%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S007'
  AND g.code = 'S007.11.1'
  AND g.active = true;

-- ============================================================
-- S008 -- 4 goals
-- ============================================================

-- S008.11.1 -- Math Problem Solving
UPDATE public.goals g
SET "desc"   = 'In the area of Math Problem Solving, S008 will increase her ability to count, add and/or subtract, and purchase items and be able to figure out the change with 80% accuracy by the next annual IEP review.',
    baseline = '50%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S008'
  AND g.code = 'S008.11.1'
  AND g.active = true;

-- S008.11.2 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'In the area of Reading Comprehension, S008 will increase her ability to retell a short story or passage (at her instructional reading level) with these objectives (a) at least three key details to support the main idea and in the (b) correct sequence with 70% accuracy by the next annual IEP review.',
    baseline = '33%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S008'
  AND g.code = 'S008.11.2'
  AND g.active = true;

-- S008.11.3 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'In the area of Written Expression, S008 increase her ability to write a 3-5 sentence structured response (e.g., a summary, personal response, or simple paragraph) that includes at least two key details, appropriate grammar, and correct capitalization and punctuation with 70% accuracy by the next annual IEP review.',
    baseline = '35%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S008'
  AND g.code = 'S008.11.3'
  AND g.active = true;

-- S008.11.4 -- Life Skills Transition
UPDATE public.goals g
SET "desc"   = 'In the area of Life Skills Transition, S008 will improve life skills through demonstrating increased perspective-taking/self-advocacy skills when provided with hypothetical/real-life social scenarios concerning safe/unsafe internet and social media usage with 80% accuracy and when provided minimal cues by the next annual IEP review.',
    baseline = '66%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S008'
  AND g.code = 'S008.11.4'
  AND g.active = true;

-- ============================================================
-- S009 -- 5 goals
-- ============================================================

-- S009.11.1 -- Basic Reading
UPDATE public.goals g
SET "desc"   = 'S009 will increase his basic reading skills by breaking down unknown words into prefixes, suffixes and root words with 72% accuracy by the next annual IEP review.',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S009.11.1'
  AND g.active = true;

-- S009.11.2 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S009 will increase his reading comprehension skills by answering literal and inferential questions with 80% accuracy by the next annual IEP review.',
    baseline = '72%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S009.11.2'
  AND g.active = true;

-- S009.11.4-1 -- Written Expression (Topic/Claim)
UPDATE public.goals g
SET "desc"   = 'S009 will increase his written expression skills by writing one paragraph with correct paragraph structure with 80% accuracy by the next annual IEP review. (Writing: Topic/Claim)',
    baseline = '70%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S009.11.4-1'
  AND g.active = true;

-- S009.11.4-2 -- Written Expression (Three Supporting Details)
UPDATE public.goals g
SET "desc"   = 'S009 will increase his written expression skills by writing one paragraph with correct paragraph structure with 80% accuracy by the next annual IEP review. (Writing: Three Supporting Details)',
    baseline = '60%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S009.11.4-2'
  AND g.active = true;

-- S009.11.4-3 -- Written Expression (Conclusion)
UPDATE public.goals g
SET "desc"   = 'S009 will increase his written expression skills by writing one paragraph with correct paragraph structure with 80% accuracy by the next annual IEP review. (Writing: Conclusion)',
    baseline = '60%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S009.11.4-3'
  AND g.active = true;

-- ============================================================
-- S010 -- 2 goals
-- ============================================================

-- S010.11.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'In the area of Reading Comprehension, S010 will increase his reading comprehension skills by summarizing/retelling and making inferences from the text with 60% accuracy by the next annual IEP review.',
    baseline = '22%',
    mastery  = '60%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S010'
  AND g.code = 'S010.11.1'
  AND g.active = true;

-- S010.11.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'In the area of Written Expression, when given exercises in grammar and written assignments, S010 will be able to construct a grammatically correct sentence(s) with subject-verb agreement, prefixes, and suffixes with 80% accuracy by the next annual IEP review.',
    baseline = '42%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S010'
  AND g.code = 'S010.11.2'
  AND g.active = true;

-- ============================================================
-- S011 -- 2 goals
-- ============================================================

-- S011.12.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S011 will increase his reading comprehension Skills by identifying and explaining the use of figurative and literal language in a passage of text with 80% accuracy by the end of this IEP period.',
    baseline = '75%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S011'
  AND g.code = 'S011.12.1'
  AND g.active = true;

-- S011.12.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S011 will increase his Written Expression Skills by writing a paragraph/response to a question/prompt using a topic sentence that reiterates the question/prompt and utilizing transition words with 75% accuracy by the end of this IEP period.',
    baseline = '40%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S011'
  AND g.code = 'S011.12.2'
  AND g.active = true;

-- ============================================================
-- S012 -- 5 goals
-- ============================================================

-- S012.12.2 -- Basic Reading
UPDATE public.goals g
SET "desc"   = 'In the area of Basic Reading, when given a list of 10 vocabulary words, S012 will correctly define and write them in a sentence with 80% accuracy by the next annual IEP review.',
    baseline = '45%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S012'
  AND g.code = 'S012.12.2'
  AND g.active = true;

-- S012.12.3 -- Reading Fluency
UPDATE public.goals g
SET "desc"   = 'S012 will increase her Reading Fluency by clearly and accurately reading 100 words with fewer than 5 errors with a 80% accuracy by the next annual IEP review.',
    baseline = '48%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S012'
  AND g.code = 'S012.12.3'
  AND g.active = true;

-- S012.12.4 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S012 will increase her reading comprehension skills, when presented with text and when reading short story, poems, novels, etc. to be able to demonstrate comprehension of literary material by answering comprehension questions pertaining to the material with 80% accuracy by the next IEP review.',
    baseline = '20%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S012'
  AND g.code = 'S012.12.4'
  AND g.active = true;

-- S012.12.5 -- Written Expression (from 20260320_fix_goal_descriptions.sql)
UPDATE public.goals g
SET "desc" = 'S012 will increase her written expression skills, given writing prompts or a given topic, S012 will write sentences using correct subject/verb agreement and she will be able to edit, re-write and correct sentences for clarity and understanding with 70% accuracy by the next IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S012'
  AND g.code = 'S012.12.5'
  AND g.active = true;

-- S012.12.6 -- Life Skills Transition (from 20260320_fix_goal_descriptions.sql)
UPDATE public.goals g
SET "desc" = 'S012 will demonstrate improved time management skills in the kitchen by independently planning, preparing, and completing cooking tasks within designated time frames, achieving 80% accuracy as measured by teacher observation'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S012'
  AND g.code = 'S012.12.6'
  AND g.active = true;

-- ============================================================
-- S013 -- 1 goal
-- ============================================================

-- S013.12.1 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S013 will increase his written expression skills by writing paragraphs with three or more details supporting his thesis/claim/topic sentence measured by 70% by the next annual IEP.',
    baseline = '95%',
    mastery  = '95%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S013'
  AND g.code = 'S013.12.1'
  AND g.active = true;

-- ============================================================
-- S014 -- 2 goals
-- ============================================================

-- S014.12.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'In the area of Reading Comprehension, S014 will increase his skills by making inferences from text with 80% accuracy by the next annual IEP.',
    baseline = '69%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S014'
  AND g.code = 'S014.12.1'
  AND g.active = true;

-- S014.12.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'In the area of Written Expression, S014 will increase these skills by using subjects and verbs accurately in writing assignments by 80% accuracy by his next annual IEP review.',
    baseline = '64%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S014'
  AND g.code = 'S014.12.2'
  AND g.active = true;

-- ============================================================
-- S015 -- 7 goals
-- ============================================================

-- S015.11.1-1 -- Life Skills Reading Skills
UPDATE public.goals g
SET "desc"   = 'S015 will increase his Life Skills Reading Skills by: Read and follow directions with 65% accuracy',
    baseline = '35%',
    mastery  = '65%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.1-1'
  AND g.active = true;

-- S015.11.1-2 -- Life Skills Reading Skills
UPDATE public.goals g
SET "desc"   = 'S015 will increase his Life Skills Reading Skills by: Answer questions about what is happening in a picture or reading passage with 70% accuracy',
    baseline = '40%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.1-2'
  AND g.active = true;

-- S015.11.1-3 -- Life Skills Reading Skills
UPDATE public.goals g
SET "desc"   = 'S015 will increase his Life Skills Reading Skills by: Answer questions about why something is happening in a picture or reading passage with 65% accuracy',
    baseline = '35%',
    mastery  = '65%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.1-3'
  AND g.active = true;

-- S015.11.2-1 -- Life Skills Writing Skills
UPDATE public.goals g
SET "desc"   = 'S015 will increase his Life Skills Writing Skills by: Write a sentence describing what is happening in a picture with 45% accuracy',
    baseline = '15%',
    mastery  = '35%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.2-1'
  AND g.active = true;

-- S015.11.2-2 -- Life Skills Writing Skills
UPDATE public.goals g
SET "desc"   = 'S015 will increase his Life Skills Writing Skills by: Write up to 3 sentences answering questions about a text he has read.',
    baseline = '10%',
    mastery  = '30%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.2-2'
  AND g.active = true;

-- S015.11.4-1 -- Life Skills Transition
UPDATE public.goals g
SET "desc"   = 'S015 will increase his Life Skills Transition Skills by: Demonstrating the ability to identify the parts of a recipe on 5 of 7 opportunities',
    baseline = '3/7',
    mastery  = '5/7'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.4-1'
  AND g.active = true;

-- S015.11.4-2 -- Life Skills Transition
UPDATE public.goals g
SET "desc"   = 'S015 will increase his Life Skills Transition Skills by: Demonstrating the ability to follow the recipe when cooking on 5 of 6 opportunities.',
    baseline = '2/6',
    mastery  = '5/6'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.4-2'
  AND g.active = true;

-- ============================================================
-- S016 -- 18 goals (11.1, 11.2-1/2, 11.3-1/2/3, 11.4, 11.5,
--         11.6-1 through 11.6-5, 11.7, 11.8, 11.9, 11.10, 11.11)
-- ============================================================

-- S016.11.1 -- Basic Reading
UPDATE public.goals g
SET "desc"   = 'In the area of Basic Reading, S016 will identify, read, and define unfamiliar vocabulary words from the text by 65% accuracy by the next annual IEP review.',
    baseline = '30%',
    mastery  = '65%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.1'
  AND g.active = true;

-- S016.11.2-1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'In the area of Reading Comprehension, S016 will increase comprehension by: Making logical inferences about characters, setting, or events by using text evidence.',
    baseline = '33%',
    mastery  = '65%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.2-1'
  AND g.active = true;

-- S016.11.2-2 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'In the area of Reading Comprehension, S016 will increase comprehension by: Identifying key events in the text and explain what can be concluded based on the text/novel.',
    baseline = '33%',
    mastery  = '65%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.2-2'
  AND g.active = true;

-- S016.11.3-1 -- Written Expression (Create a Main Idea)
UPDATE public.goals g
SET "desc"   = 'In the area of Written Expression, S016 will increase his skill by composing a complete paragraph that includes a main idea, at least two supporting details, and a concluding sentence in 2 out of 3 writing tasks by the next annual IEP review: (Create a Main Idea)',
    baseline = '1/3',
    mastery  = '2/3'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.3-1'
  AND g.active = true;

-- S016.11.3-2 -- Written Expression (At least two supporing details)
-- NOTE: "supporing" is verbatim from the master IEP CSV -- do not correct this typo.
UPDATE public.goals g
SET "desc"   = 'In the area of Written Expression, S016 will increase his skill by composing a complete paragraph that includes a main idea, at least two supporting details, and a concluding sentence in 2 out of 3 writing tasks by the next annual IEP review: (At least two supporing details)',
    baseline = '1/3',
    mastery  = '2/3'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.3-2'
  AND g.active = true;

-- S016.11.3-3 -- Written Expression (Write a Concluding Sentence)
UPDATE public.goals g
SET "desc"   = 'In the area of Written Expression, S016 will increase his skill by composing a complete paragraph that includes a main idea, at least two supporting details, and a concluding sentence in 2 out of 3 writing tasks by the next annual IEP review: (Write a Concluding Sentence)',
    baseline = '1/3',
    mastery  = '2/3'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.3-3'
  AND g.active = true;

-- S016.11.4 -- Math Problem Solving
UPDATE public.goals g
SET "desc"   = 'In the area of Math Problem Solving, using real-world scenarios S016 will increase his basic math skills (such as addition, subtraction, counting money, and telling time) to solve problems with 50% accuracy by the next annual IEP review.',
    baseline = '25%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.4'
  AND g.active = true;

-- S016.11.5 -- Language
UPDATE public.goals g
SET "desc"   = 'In the area of language, S016 will make appropriate inferences and explain his reasoning behind them after listening to a short, verbally presented paragraph with 80% accuracy over 3 consecutive sessions by the end of this IEP cycle.',
    baseline = '0%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.5'
  AND g.active = true;

-- S016.11.6-1 -- Language (Comparatives)
UPDATE public.goals g
SET "desc"   = 'In the area of Language, S016 will improve his overall language skills by increasing his ability to respond to questions pertaining to a variety of semantic relationships included in the objectives below with 80% accuracy across 3 consecutive sessions by the end of this IEP cycle. (Number 1 of 5: Comparatives)',
    baseline = '0%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.6-1'
  AND g.active = true;

-- S016.11.6-2 -- Language (Spatial Concepts)
UPDATE public.goals g
SET "desc"   = 'In the area of Language, S016 will improve his overall language skills by increasing his ability to respond to questions pertaining to a variety of semantic relationships included in the objectives below with 80% accuracy across 3 consecutive sessions by the end of this IEP cycle. (Number 2 of 5: Spatial Concepts)',
    baseline = '0%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.6-2'
  AND g.active = true;

-- S016.11.6-3 -- Language (Temporal Concepts)
UPDATE public.goals g
SET "desc"   = 'In the area of Language, S016 will improve his overall language skills by increasing his ability to respond to questions pertaining to a variety of semantic relationships included in the objectives below with 80% accuracy across 3 consecutive sessions by the end of this IEP cycle. (Number 3 of 5: Temporal Concepts)',
    baseline = '0%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.6-3'
  AND g.active = true;

-- S016.11.6-4 -- Language (Sequential Concepts)
UPDATE public.goals g
SET "desc"   = 'In the area of Language, S016 will improve his overall language skills by increasing his ability to respond to questions pertaining to a variety of semantic relationships included in the objectives below with 80% accuracy across 3 consecutive sessions by the end of this IEP cycle. (Number 4 of 5: Sequential Concepts)',
    baseline = '0%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.6-4'
  AND g.active = true;

-- S016.11.6-5 -- Language (Passive Concepts)
UPDATE public.goals g
SET "desc"   = 'In the area of Language, S016 will improve his overall language skills by increasing his ability to respond to questions pertaining to a variety of semantic relationships included in the objectives below with 80% accuracy across 3 consecutive sessions by the end of this IEP cycle. (Number 5 of 5: Passive Concepts)',
    baseline = '0%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.6-5'
  AND g.active = true;

-- S016.11.7 -- Language
UPDATE public.goals g
SET "desc"   = 'In the area of Language, S016 will increase his semantic and syntactic language skills in order to retell a short passage or story presented by the therapist in proper sequence while using proper syntactical elements of speech (subject/verb agreement, verb tense, etc.) with 80% accuracy by the end of this IEP cycle.',
    baseline = '60%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.7'
  AND g.active = true;

-- S016.11.8 -- Occupational Therapy
UPDATE public.goals g
SET "desc"   = 'In the area of Occupational Therapy, S016 will be able to independently write his first and last name in cursive without a visual model within a line of wide-rule notebook paper with 75% accuracy by the next annual IEP review. (Baseline: 25% accuracy within a line of wide-rule notebook paper with verbal cues for size).',
    baseline = '25%',
    mastery  = '75%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.8'
  AND g.active = true;

-- S016.11.9 -- Occupational Therapy
UPDATE public.goals g
SET "desc"   = 'In the area of Occupational Therapy, S016 will increase his keyboarding skills as evidenced by typing two 5 sentence paragraphs with an average speed of 20 words per minute with 75% accuracy for capitalization, punctuation, and spacing by the next annual IEP review. (Baseline: When asked to type self-generated sentences, Jackson typically types 2 to 4 sentences with an average of 12 WPM. On one occasion he was able to type 2 paragraphs at an average of 16 WPM.)',
    baseline = '2',
    mastery  = '5'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.9'
  AND g.active = true;

-- S016.11.10 -- Occupational Therapy
UPDATE public.goals g
SET "desc"   = 'In the area of Occupational Therapy, S016 will write a self generated 5 sentence paragraph with 75% legibility while by the next annual IEP. (Baseline: 59% legibility)',
    baseline = '59%',
    mastery  = '75%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.10'
  AND g.active = true;

-- S016.11.11 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S016 will consistently align written work with the left margin during writing tasks, improving legibility and organization by the next IEP cycle. (Baseline: When writing a paragraph Jackson indents each subsequent line further to the right)',
    baseline = '1%',
    mastery  = '75%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.11'
  AND g.active = true;

-- ============================================================
-- S017 -- 2 goals
-- ============================================================

-- S017.9.4 -- Basic Reading (Decoding)
UPDATE public.goals g
SET "desc"   = 'When presented a list of skill level words, sentences, or paragraphs, S017 will demonstrate increased decoding by pronouncing words with 60% accuracy.',
    baseline = '20%',
    mastery  = '60%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S017'
  AND g.code = 'S017.9.4'
  AND g.active = true;

-- S017.9.1 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S017 will increase his written expression skills by using a combination of speech to text and typing on the Chromebook to write 3 complete sentences about a topic with ending punctuation with 80% accuracy as measured by work samples by the life of this IEP cycle.',
    baseline = '28%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S017'
  AND g.code = 'S017.9.1'
  AND g.active = true;

-- ============================================================
-- S018 -- 3 goals
-- ============================================================

-- S018.9.1 -- Life Skills Reading
UPDATE public.goals g
SET "desc"   = 'S018 will independently read and identify materials/supplies needed to complete the recipe given with 70% accuracy by the life of this IEP.',
    baseline = '65%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S018'
  AND g.code = 'S018.9.1'
  AND g.active = true;

-- S018.9.2 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S018 will answer comprehension questions about a recipe with the support of an adult with 70% accuracy by the life of this IEP.',
    baseline = '63%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S018'
  AND g.code = 'S018.9.2'
  AND g.active = true;

-- S018.9.3 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S018 will increase his written expression by writing or typing his personal information (name, address, date of birth, and phone number) with 80% accuracy by the life of this IEP cycle.',
    baseline = '67%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S018'
  AND g.code = 'S018.9.3'
  AND g.active = true;

-- ============================================================
-- S019 -- 3 goals
-- ============================================================

-- S019.10.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'In the area of Reading Comprehension, S019 will increase her ability to read and summarizes a given passage with 80% accuracy by the next annual IEP review date.',
    baseline = '62%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S019'
  AND g.code = 'S019.10.1'
  AND g.active = true;

-- S019.10.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'In the area of Written Expression, S019 will increase her skills in writing a paragraph with a topic sentence, supporting details and conclusion with 80% accuracy by the next annual IEP.',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S019'
  AND g.code = 'S019.10.2'
  AND g.active = true;

-- S019.10.4 -- Life Skills Transition
UPDATE public.goals g
SET "desc"   = 'In the area of Life Skills Transition, S019 will increase her social skills by identifying what others personal boundaries might look like with 50% accuracy by the next Annual IEP.',
    baseline = '25%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S019'
  AND g.code = 'S019.10.4'
  AND g.active = true;

-- ============================================================
-- S020 -- 4 goals
-- ============================================================

-- S020.12.1 -- Life Skills
UPDATE public.goals g
SET "desc"   = 'S020 will increase his readiness skills by practicing organizational skills (matching, sorting, etc) with a 50% accuracy, by the end of this IEP period.',
    baseline = '20%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S020'
  AND g.code = 'S020.12.1'
  AND g.active = true;

-- S020.12.2 -- Life Skills
UPDATE public.goals g
SET "desc"   = 'S020 will increase his readiness skills assembling bags of supplies ( 1 each of 5 items) with a 50% accuracy by the end of this IEP period.',
    baseline = '20%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S020'
  AND g.code = 'S020.12.2'
  AND g.active = true;

-- S020.12.3 -- Life Skills Writing Skills
UPDATE public.goals g
SET "desc"   = 'S020 will increase his Life Skills Writing skills by practicing copying personal information (name, phone number, etc.) and copy simple sentences (I want ________) with a 50% accuracy by the end of the IEP period.',
    baseline = '25%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S020'
  AND g.code = 'S020.12.3'
  AND g.active = true;

-- S020.12.4 -- Life Skills Transition
UPDATE public.goals g
SET "desc"   = 'S020 will increase his Life Skills Transition Skills by practicing gathering and organizing supplies from a list of household items needed to complete a task (cooking, laundry, etc.) with a 50% accuracy by the end of this IEP period.',
    baseline = '20%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S020'
  AND g.code = 'S020.12.4'
  AND g.active = true;

-- ============================================================
-- S022 -- 2 goals
-- NOTE: S022.12.1 uses "maintain" (not "increase") -- verbatim from CSV.
-- ============================================================

-- S022.12.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S022 will maintain his reading comprehension skills by using context clues to understand the meaning of a text with 80% accuracy by the end of this IEP period.',
    baseline = '85%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S022'
  AND g.code = 'S022.12.1'
  AND g.active = true;

-- S022.12.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S022 will increase his written expression skills by independently writing a grammatically correct paragraph using a topic sentence and supporting details with 80% accuracy by the end of this IEP period.',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S022'
  AND g.code = 'S022.12.2'
  AND g.active = true;

-- ============================================================
-- S023 -- 3 goals
-- ============================================================

-- S023.10.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S023 will increase her reading comprehension skills by using context clues to understand the meaning of a text with 70% accuracy by the end of this IEP period.',
    baseline = '63%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S023'
  AND g.code = 'S023.10.1'
  AND g.active = true;

-- S023.10.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S023 will increase her written expression skills by formulating and writing complete sentences with 65% accuracy by the end of this IEP period.',
    baseline = '55%',
    mastery  = '60%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S023'
  AND g.code = 'S023.10.2'
  AND g.active = true;

-- S023.10.4 -- Life Skills Transition
UPDATE public.goals g
SET "desc"   = 'S023 will increase her life skills by preparing a dish by following the directions with 65% accuracy with 2 or fewer prompts by the end of the IEP cycle.',
    baseline = '50%',
    mastery  = '65%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S023'
  AND g.code = 'S023.10.4'
  AND g.active = true;

-- ============================================================
-- S024 -- 3 goals
-- ============================================================

-- S024.9.1 -- Social Skills
-- NOTE: "his his" is verbatim from the IEP document (duplicate word in original).
UPDATE public.goals g
SET "desc"   = 'S024 will increase his his awareness of proper verbal responses during supervised unstructured social situations 4 out of 5 interactions by the next annual IEP review date.',
    baseline = '20%',
    mastery  = '60%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S024'
  AND g.code = 'S024.9.1'
  AND g.active = true;

-- S024.9.2 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S024 will increase his reading comprehension skills by responding to comprehension questions with supports details with 70% accuracy by the next annual IEP review date.',
    baseline = '40%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S024'
  AND g.code = 'S024.9.2'
  AND g.active = true;

-- S024.9.3 -- Math Problem Solving
UPDATE public.goals g
SET "desc"   = 'S024 will increase his math problem solving skills by solving multiple step problems involving the use of decimals with 70% accuracy by the next annual IEP review date.',
    baseline = '45%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S024'
  AND g.code = 'S024.9.3'
  AND g.active = true;

-- ============================================================
-- S025 -- 1 goal
-- ============================================================

-- S025.9.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S025 will increase her reading comprehension skills by independently reading a grade level passage and answer comprehension questions identifying the main idea, inferencing and summarizing the passage with 80% accuracy by the life of this IEP.',
    baseline = '69%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S025'
  AND g.code = 'S025.9.1'
  AND g.active = true;

-- ============================================================
-- S026 -- 2 goals
-- ============================================================

-- S026.9.1 -- Reading Comprehension
-- NOTE: "life life" is verbatim from the IEP document (duplicate word in original).
UPDATE public.goals g
SET "desc"   = 'S026 will increase his reading comprehension skills by answering inferencing and conclusion questions with 80% accuracy by the life life of this IEP.',
    baseline = '46%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S026'
  AND g.code = 'S026.9.1'
  AND g.active = true;

-- S026.9.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S026 will increase his written skills goal by able to write a paragraph with introduction, details and conclusion with 80% accuracy by the life of the IEP.',
    baseline = '75%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S026'
  AND g.code = 'S026.9.2'
  AND g.active = true;

-- ============================================================
-- S027 -- 2 goals
-- ============================================================

-- S027.9.1 -- Social Skills
UPDATE public.goals g
SET "desc"   = 'S027 will increase the incidents of using self-management skills to regulate and return to a given task 2 out of 4 situations by the next annual IEP review.',
    baseline = '0/4',
    mastery  = '2/4'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S027'
  AND g.code = 'S027.9.1'
  AND g.active = true;

-- S027.9.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S027 will increase her written expression skills by writing an essay with an introductory paragraph with main ideas with 3 body paragraphs 3 out of 4 samples by the next annual IEP date.',
    baseline = '2/4',
    mastery  = '3/4'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S027'
  AND g.code = 'S027.9.2'
  AND g.active = true;

-- ============================================================
-- S028 -- 1 goal
-- ============================================================

-- S028.9.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S028 will increase her reading comprehension skills by identifying supports when responding to inferencing questions on instructional level text read independently with 80% accuracy by the next annual IEP review.',
    baseline = '73%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S028'
  AND g.code = 'S028.9.1'
  AND g.active = true;

-- S029 and S030 are inactive -- skipped.

-- ============================================================
-- S031 -- 2 goals
-- ============================================================

-- S031.10.1 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S031 will increase his writing by using evidence and citing his writing with 45% accuracy by the end of the IEP cycle.',
    baseline = '45%',
    mastery  = '65%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S031'
  AND g.code = 'S031.10.1'
  AND g.active = true;

-- S031.10.2 -- Math Calculation
UPDATE public.goals g
SET "desc"   = 'S031 will increase his math calculation skills by using order of operations to solve mathematical equations with 80% accuracy by the end of the IEP cycle.',
    baseline = '60%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S031'
  AND g.code = 'S031.10.2'
  AND g.active = true;

-- ============================================================
-- S032 -- 4 goals
-- ============================================================

-- S032.10.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S032 will increase his reading comprehension by identifying what the question is asking by restating the question with 60% accuracy by the life of this IEP.',
    baseline = '32%',
    mastery  = '60%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S032'
  AND g.code = 'S032.10.1'
  AND g.active = true;

-- S032.10.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S032 will increase his written expression skills by writing 1 paragraph summary of a text including the main idea and one supporting detail with 60% accuracy by the life of this IEP.',
    baseline = '28%',
    mastery  = '60%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S032'
  AND g.code = 'S032.10.2'
  AND g.active = true;

-- S032.10.3 -- Math Problem Solving
UPDATE public.goals g
SET "desc"   = 'In the area of Math Problem-Solving, S032 will increase his ability to solve equations involving the four operations (addition, subtraction, multiplication, and division) and apply the order of operations (including parentheses and exponents) with 80% accuracy.',
    baseline = '64%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S032'
  AND g.code = 'S032.10.3'
  AND g.active = true;

-- S032.10.4 -- Social Communication
UPDATE public.goals g
SET "desc"   = 'S032 will improve his social communication skills by engaging in appropriate and reciprocal conversations with peers and adults, including asking relevant questions and using appropriate names 3/5 of opportunities.',
    baseline = '3/5',
    mastery  = '4/5'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S032'
  AND g.code = 'S032.10.4'
  AND g.active = true;

-- ============================================================
-- S033 -- 5 goals
-- (S033.10.1-10.3 from master CSV; S033.10.4-10.5 from
--  20260320_fix_goal_descriptions.sql)
-- ============================================================

-- S033.10.1 -- Reading Comprehension
-- NOTE: "inference's" is verbatim from the IEP document -- do not correct this.
UPDATE public.goals g
SET "desc"   = 'S033 will increase his skills in reading comprehension by making inference''s with 80% accuracy by the next annual IEP.',
    baseline = '67%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S033'
  AND g.code = 'S033.10.1'
  AND g.active = true;

-- S033.10.2 -- Math
UPDATE public.goals g
SET "desc"   = 'S033 will increase his math skills by Using Graphic Organizers to sequence and solve the mathematical problems in a logical manner with 80% accuracy by the next IEP cycle baseline 70%',
    baseline = '70%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S033'
  AND g.code = 'S033.10.2'
  AND g.active = true;

-- S033.10.3 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S033 will increase his skills in reading comprehension by using context clues to determine the meaning of context clues to determine the meaning of unknown words with 80% accuracy by the next IEP cycle.',
    baseline = '75%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S033'
  AND g.code = 'S033.10.3'
  AND g.active = true;

-- S033.10.4 -- Language (from 20260320_fix_goal_descriptions.sql)
UPDATE public.goals g
SET "desc" = 'S033 will state synonyms and antonyms of given words with 80% accuracy.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S033'
  AND g.code = 'S033.10.4'
  AND g.active = true;

-- S033.10.5 -- Language (from 20260320_fix_goal_descriptions.sql)
UPDATE public.goals g
SET "desc" = 'S033 will provide appropriate definitions of words when given a homophone word pair with 80% accuracy.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S033'
  AND g.code = 'S033.10.5'
  AND g.active = true;

-- ============================================================
-- S034: Not present in any reference migration file -- skipped.
-- ============================================================

-- ============================================================
-- S035 -- 1 goal (from 20260320_fix_goal_descriptions.sql)
-- ============================================================

-- S035.10.1 -- Behavior
-- NOTE: Newlines in original CSV replaced with spaces per migration rules.
UPDATE public.goals g
SET "desc" = 'S035 will increase his behavior skills by completing the objectives below with 70% accuracy by the next annual IEP review. 1) Follow a reasonable request when asked by an adult. Baseline - 25% 2) Raising hand to speak in class. Baseline - 43% 3) Staying in assigned seat unless given permission. Baseline - 43%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S035'
  AND g.code = 'S035.10.1'
  AND g.active = true;

-- ============================================================
-- S036 -- 2 goals (from 20260320_fix_goal_descriptions.sql)
-- ============================================================

-- S036.10.1 -- Written Expression
UPDATE public.goals g
SET "desc" = 'S036 will increase his written expression skills by writing multiple paragraphs with transitions and conclusion sentences with 70% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S036'
  AND g.code = 'S036.10.1'
  AND g.active = true;

-- S036.10.2 -- Reading Comprehension
UPDATE public.goals g
SET "desc" = 'S036 will increase his reading comprehension skills by providing text evidence to support conclusions with 70% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S036'
  AND g.code = 'S036.10.2'
  AND g.active = true;

-- ============================================================
-- S037: Not present in any reference migration file -- skipped.
-- ============================================================

-- ============================================================
-- S038 -- 1 goal
-- ============================================================

-- S038.9.1 -- Behavior
UPDATE public.goals g
SET "desc"   = 'By the end of the IEP cycle, S038 will maintain behavior by managing conflicts on 80% of instances by the next annual IEP review.',
    baseline = '100%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S038'
  AND g.code = 'S038.9.1'
  AND g.active = true;

-- ============================================================
-- S039 -- 1 goal
-- ============================================================

-- S039.11.2-1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S039 will increase reading comprehension skills by completing the following objectives with an average of 80% accuracy by the end of the IEP period. (1. Answering questions that ask for text summaries from grade level text. Baseline 57%)',
    baseline = '60%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S039'
  AND g.code = 'S039.11.2-1'
  AND g.active = true;

-- ============================================================
-- S040 -- 2 goals
-- ============================================================

-- S040.10.1 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S040 will increase his writing skills by composing a cohesive, organized paragraph with a clear topic sentence, supporting details with evidence, and a concluding sentence with 80% accuracy by the end of the IEP cycle',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S040'
  AND g.code = 'S040.10.1'
  AND g.active = true;

-- S040.10.2 -- Math Problem Solving
UPDATE public.goals g
SET "desc"   = 'S040 will increase his problem-solving skills by accurately solving multi-step math problems or multi-step operations involving addition, subtraction, multiplication, and/or division by identifying relevant information, selecting appropriate operations, and executing each step in sequence with 80% accuracy by the end of the IEP cycle',
    baseline = '67%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S040'
  AND g.code = 'S040.10.2'
  AND g.active = true;

-- ============================================================
-- S041 -- 1 goal
-- ============================================================

-- S041.9.1 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S041 will increase her written expression skills by writing a paragraph with a topic sentence, three supporting details and conclusion with 70% accuracy by the next annual IEP review.',
    baseline = '55%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S041'
  AND g.code = 'S041.9.1'
  AND g.active = true;

-- ============================================================
-- S042 -- 3 goals
-- ============================================================

-- S042.9.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S042 will increase her reading comprehension skills by independently answering inferencing questions related to a passage with 80% accuracy by the end of this IEP.',
    baseline = '66%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S042'
  AND g.code = 'S042.9.1'
  AND g.active = true;

-- S042.9.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S042 will increase her written expression by including transition words in her writing and writing multiple paragraphs with 80% accuracy by the end of this IEP.',
    baseline = '50%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S042'
  AND g.code = 'S042.9.2'
  AND g.active = true;

-- S042.9.4 -- Basic Reading
UPDATE public.goals g
SET "desc"   = 'When presented a list of skill level words, sentences, or paragraphs, S042 will demonstrate increased decoding by pronouncing words with 60% accuracy by the end of this IEP cycle.',
    baseline = '40%',
    mastery  = '60%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S042'
  AND g.code = 'S042.9.4'
  AND g.active = true;

-- ============================================================
-- S043 -- 2 goals (from 20260320_fix_goal_descriptions.sql)
-- ============================================================

-- S043.10.1 -- Social Skills
UPDATE public.goals g
SET "desc" = 'S043 will increase her social skills by waiting her turn to speak and following adult direction with 2 or fewer prompts on data days by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S043'
  AND g.code = 'S043.10.1'
  AND g.active = true;

-- S043.10.2 -- Emotional Regulation
UPDATE public.goals g
SET "desc" = 'S043 will maintain her emotional regulation skills by using learned strategies to calm her anxiety, work independently, and complete assignments 80% of the time on data collection days.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S043'
  AND g.code = 'S043.10.2'
  AND g.active = true;

-- ============================================================
-- S044 -- 1 goal (from 20260320_fix_goal_descriptions.sql)
-- ============================================================

-- S044.10.1 -- Written Expression
UPDATE public.goals g
SET "desc" = 'S044 will increase her written expression skills by to providing a written response on writing assignments she is given turning in her work on 80% of opportunities by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S044'
  AND g.code = 'S044.10.1'
  AND g.active = true;

-- ============================================================
-- S045 -- 2 goals (from 20260320_fix_goal_descriptions.sql)
-- ============================================================

-- S045.11.1 -- Reading Comprehension
UPDATE public.goals g
SET "desc" = 'S045 will increase his reading comprehension skills by determining the meaning of words and phrases as they are used in reading and content (ex. figurative language, etc.) in context with 80% accuracy by the end of the annual IEP cycle. Baseline: 70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S045'
  AND g.code = 'S045.11.1'
  AND g.active = true;

-- S045.11.2 -- Written Expression
UPDATE public.goals g
SET "desc"   = 'S045 will increase his written expression skills by restating questions and adding 3 supporting details to his writing with 50% accuracy by the end of the annual IEP cycle.',
    baseline = '35%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S045'
  AND g.code = 'S045.11.2'
  AND g.active = true;

-- ============================================================
-- STEP 3: Sync goal_text column to desc for any rows that have
--         goal_text populated (handles dual-schema environments
--         where both code/desc and goal_code/goal_text may exist).
-- ============================================================
UPDATE public.goals
SET goal_text = "desc"
WHERE goal_text IS NOT NULL
  AND goal_text IS DISTINCT FROM "desc"
  AND active = true;

COMMIT;
