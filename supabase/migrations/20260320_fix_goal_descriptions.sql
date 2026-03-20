-- Migration: 20260320_fix_goal_descriptions
-- Purpose: Align all goal descriptions (desc), baseline, and mastery values with
--          the master IEP CSV (source of truth). Fixes swapped descriptions for
--          S001 Written Expression subgoals and truncated/abbreviated text for
--          several other goals. Only updates active goals (active = true).
--
-- STEP 1: Fix S009.11.2 goal code typo (S00911.2 → S009.11.2) if it still exists
UPDATE public.goals g
SET code = 'S009.11.2'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S00911.2'
  AND g.active = true;

-- STEP 2: Update goal descriptions, baselines, and mastery to match the master CSV.
--         Goals explicitly listed in the problem statement use authoritative text.
--         All other goals use the description from the master CSV import file.

-- S008.11.1 (Math Problem Solving) - from problem statement (not in CSV import file)
UPDATE public.goals g
SET "desc" = 'In the area of Math Problem Solving, S008 will increase her ability to count, add and/or subtract, and purchase items and be able to figure out the change with 80% accuracy by the next annual IEP review.',
    baseline = '50%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S008'
  AND g.code = 'S008.11.1'
  AND g.active = true;

-- S001.11.1 (Basic Reading) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S001 will increase his basic reading skills to read multi-syllabic (3 or more syllables) words with 80% accuracy by the next annual IEP.',
    baseline = '60%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.1'
  AND g.active = true;

-- S001.11.2 (Reading Comprehension) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S001 will increase his reading comprehension skills by understanding context cues to define unknown words by using clues in the sentence or the surrounding sentences with 75% accuracy by the next annual IEP.',
    baseline = '42%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.2'
  AND g.active = true;

-- S001.11.3-1 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S001 will increase his written expression skills by writing two paragraphs using the objectives listed below with 80% accuracy by the next annual IEP. (Add 1-2 details to reinforce his topic sentence)',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.3-1'
  AND g.active = true;

-- S001.11.3-2 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S001 will increase his written expression skills by writing two paragraphs using the objectives listed below with 80% accuracy by the next annual IEP. (Appropriate use and differentiated transition words)',
    baseline = '70%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.3-2'
  AND g.active = true;

-- S001.11.3-3 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S001 will increase his written expression skills by writing two paragraphs using the objectives listed below with 80% accuracy by the next annual IEP. (Use correct subject and verb agreement in his written assignments).',
    baseline = '60%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.3-3'
  AND g.active = true;

-- S002.11.1 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S002 will increase her written expression skills by constructing a response with a claim, adding details, evidence and a conclusion with 80% accuracy.',
    baseline = '40%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S002'
  AND g.code = 'S002.11.1'
  AND g.active = true;

-- S002.11.2 (Reading Comprehension) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S002 will increase her reading comprehension skills by answering comprehension questions requiring higher order thinking skills ( making inferencing, evaluating information , analyzing text and supporting details) with a 70% accuracy.',
    baseline = '20%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S002'
  AND g.code = 'S002.11.2'
  AND g.active = true;

-- S003.11.1 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'In the area of Written Expression, S003 will increase these skills by including supporting details and conclusion sentence when writing a paragraph with 50% accuracy by the next annual IEP review.',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S003'
  AND g.code = 'S003.11.1'
  AND g.active = true;

-- S004.11.1 (Behavior) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S004 will increase his Behavior skills and will limit loud noises to no more than one occurrence per class period and, during brief teacher check-ins when needed, accept ownership for his behavior without making excuses, in 3 of 5 data collections.',
    baseline = '1/5',
    mastery  = '3/5'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.1'
  AND g.active = true;

-- S004.11.2 (Reading Comprehension) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S004 will increase his Reading Comprehension skills and will make an inference, answering WH questioins and predictions adapted text and support it with at least one piece of textual evidence with 70% by the next annual IEP review.',
    baseline = '53%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.2'
  AND g.active = true;

-- S004.11.3 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S004 will increase his Written Expression skills and when given a prompt and organizer, S004 will compose a five-sentence paragraph (topic, three details, concluding sentence) that stays on topic, scoring at least 50% by the next annual IEP review.',
    baseline = '30%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.3'
  AND g.active = true;

-- S004.11.4 (Math Calculation) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S004 will increase his Math Calculation skills by solving multi-step math problems by using the correct operations (addition, subtraction, multiplication, or division) without assistance with 60% accuracy by the next annual IEP review.',
    baseline = '40%',
    mastery  = '60%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.4'
  AND g.active = true;

-- S005.11.1 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S005 will increase his Written Expression skills by constructing a response with a claim, evidence, and a conclusion with 70% accuracy by the next annual IEP review.',
    baseline = '66%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S005'
  AND g.code = 'S005.11.1'
  AND g.active = true;

-- S005.11.2 (Reading Comprehension) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S005 will increase his Reading Comprehension by solving comprehension questions requiring higher-order thinking skills (such as inferencing, evaluating, and analyzing) with 80% accuracy by the next annual IEP review.',
    baseline = '67%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S005'
  AND g.code = 'S005.11.2'
  AND g.active = true;

-- S006.11.1 (Behavior) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S006 will improve his ability to focus on classroom tasks, reducing off-task behaviors such as fidgeting and losing focus, demonstrating self-regulation by staying on task for increasingly longer duration''s in 4 out of 5 observed sessions.',
    baseline = '70%',
    mastery  = '90%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S006'
  AND g.code = 'S006.11.1'
  AND g.active = true;

-- S006.11.2 (Math Calculation) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'In the area of Math Calculation, S006 will increase his ability to connect and apply math concepts (such as geometry and algebra) by demonstrating mastery in solving integrated multi-step problems involving these topics with 60% accuracy, by the next annual IEP review.',
    baseline = '60%',
    mastery  = '75%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S006'
  AND g.code = 'S006.11.2'
  AND g.active = true;

-- S006.11.3 (Reading Comprehension) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S006 will improve his ability to identify relevant textual evidence that supports the theme(s) or central idea of a text and explain how that evidence contributes to the development of the theme(s) or central idea in 4 out of 5 trials by the next annual IEP review.',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S006'
  AND g.code = 'S006.11.3'
  AND g.active = true;

-- S006.11.4 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'In the area of Written Expression, S006 will improve his ability to write a clear, organized response by including a main idea, supporting details, and a conclusion sentence that reinforces his claims, demonstrating understanding of the literary elements listed above with 45% accuracy by the next annual IEP review.',
    baseline = '50%',
    mastery  = '65%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S006'
  AND g.code = 'S006.11.4'
  AND g.active = true;

-- S007.11.1 (Basic Reading) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S007 will increase his Basic Reading skills by identifying high-frequency and irregular words in context. Given sentences from class readings with a missing word, Lothar will select the correct word with 85% by the next annual IEP review',
    baseline = '72%',
    mastery  = '85%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S007'
  AND g.code = 'S007.11.1'
  AND g.active = true;

-- S007.11.2 (Basic Reading) - from master CSV
UPDATE public.goals g
SET "desc" = 'S007 will increase his basic reading skills by breaking down unknown words into prefix, suffix, and root words with 70% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S007'
  AND g.code = 'S007.11.2'
  AND g.active = true;

-- S008.11.2 (Reading Comprehension) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'In the area of Reading Comprehension, S008 will increase her ability to retell a short story or passage (at her instructional reading level) with these objectives (a) at least three key details to support the main idea and in the (b) correct sequence with 70% accuracy by the next annual IEP review.',
    baseline = '33%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S008'
  AND g.code = 'S008.11.2'
  AND g.active = true;

-- S008.11.3 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'In the area of Written Expression, S008 increase her ability to write a 3-5 sentence structured response (e.g., a summary, personal response, or simple paragraph) that includes at least two key details, appropriate grammar, and correct capitalization and punctuation with 70% accuracy by the next annual IEP review.',
    baseline = '35%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S008'
  AND g.code = 'S008.11.3'
  AND g.active = true;

-- S008.11.4 (Life Skills Transition) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'In the area of Life Skills Transition, S008 will improve life skills through demonstrating increased perspective-taking/self-advocacy skills when provided with hypothetical/real-life social scenarios concerning safe/unsafe internet and social media usage with 80% accuracy and when provided minimal cues by the next annual IEP review.',
    baseline = '66%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S008'
  AND g.code = 'S008.11.4'
  AND g.active = true;

-- S009.11.1 (Basic Reading) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S009 will increase his basic reading skills by breaking down unknown words into prefixes, suffixes and root words with 72% accuracy by the next annual IEP review.',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S009.11.1'
  AND g.active = true;

-- S009.11.2 (Reading Comprehension) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S009 will increase his reading comprehension skills by answering literal and inferential questions with 80% accuracy by the next annual IEP review.',
    baseline = '72%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S009.11.2'
  AND g.active = true;

-- S009.11.4-1 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S009 will increase his written expression skills by writing one paragraph with correct paragraph structure with 80% accuracy by the next annual IEP review. (Writing: Topic/Claim)',
    baseline = '70%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S009.11.4-1'
  AND g.active = true;

-- S009.11.4-2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S009-Writing: Three Supporting Details'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S009.11.4-2'
  AND g.active = true;

-- S009.11.4-3 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S009-Writing: Conclusion'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S009'
  AND g.code = 'S009.11.4-3'
  AND g.active = true;

-- S010.11.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'In the area of Reading Comprehension, S010 will increase his reading comprehension skills by summarizing/retelling and making inferences from the text with 60% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S010'
  AND g.code = 'S010.11.1'
  AND g.active = true;

-- S010.11.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'In the area of Written Expression, when given exercises in grammar and written assignments, S010 will be able to construct a grammatically correct sentence(s) with subject-verb agreement, prefixes, and suffixes with 80% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S010'
  AND g.code = 'S010.11.2'
  AND g.active = true;

-- S011.12.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S011 will increase his reading comprehension Skills by identifying and explaining the use of figurative and literal language in a passage of text with 75% accuracy by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S011'
  AND g.code = 'S011.12.1'
  AND g.active = true;

-- S011.12.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S011 will increase his Written Expression Skills by writing a paragraph/response to a question/prompt using a topic sentence that reiterates the question/prompt and utilizing transition words with 75% accuracy by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S011'
  AND g.code = 'S011.12.2'
  AND g.active = true;

-- S012.12.2 (Basic Reading) - from master CSV
UPDATE public.goals g
SET "desc" = 'In the area of Basic Reading, when given a list of 10 vocabulary words, S012 will correctly define and write them in a sentence with 80% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S012'
  AND g.code = 'S012.12.2'
  AND g.active = true;

-- S012.12.3 (Reading Fluency) - from master CSV
UPDATE public.goals g
SET "desc" = 'S012 will increase her Reading Fluency by clearly and accurately reading 100 words with fewer than 5 errors with a 80% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S012'
  AND g.code = 'S012.12.3'
  AND g.active = true;

-- S012.12.4 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S012 will increase her reading comprehension skills, when presented with text and when reading short story, poems, novels, etc. to be able to demonstrate comprehension of literary material by answering comprehension questions pertaining to the material with 80% accuracy by the next IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S012'
  AND g.code = 'S012.12.4'
  AND g.active = true;

-- S012.12.5 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S012 will increase her written expression skills, given writing prompts or a given topic, S012 will write sentences using correct subject/verb agreement and she will be able to edit, re-write and correct sentences for clarity and understanding with 70% accuracy by the next IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S012'
  AND g.code = 'S012.12.5'
  AND g.active = true;

-- S012.12.6 (Life Skills Transition) - from master CSV
UPDATE public.goals g
SET "desc" = 'S012 will demonstrate improved time management skills in the kitchen by independently planning, preparing, and completing cooking tasks within designated time frames, achieving 80% accuracy as measured by teacher observation'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S012'
  AND g.code = 'S012.12.6'
  AND g.active = true;

-- S013.12.1 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S013 will increase his written expression skills by writing paragraphs with three or more details supporting his thesis/claim/topic sentence measured by 70% by the next annual IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S013'
  AND g.code = 'S013.12.1'
  AND g.active = true;

-- S014.12.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'In the area of Reading Comprehension, S014 will increase his skills by making inferences from text with 90% accuracy by the next annual IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S014'
  AND g.code = 'S014.12.1'
  AND g.active = true;

-- S014.12.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'In the area of Written Expression, S014 will increase these skills by using subjects and verbs accurately in writing assignments by 90% accuracy by his next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S014'
  AND g.code = 'S014.12.2'
  AND g.active = true;

-- S015.11.1-1 (Life Skills Reading Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'Reading Skills: read and follow directions with a 65% accuracy'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.1-1'
  AND g.active = true;

-- S015.11.1-2 (Life Skills Reading Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'Reading Skills: answer questions about what is happening in a picture or reading passage with 70% accuracy'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.1-2'
  AND g.active = true;

-- S015.11.1-3 (Life Skills Reading Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'Reading Skills: answer questions about why something is happening in a picture or reading passage with a 65% accuracy'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.1-3'
  AND g.active = true;

-- S015.11.2-1 (Life Skills Writing Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'Writing Skills: Write a sentence describing what is happening in a picture with 45% accuracy'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.2-1'
  AND g.active = true;

-- S015.11.2-2 (Life Skills Writing Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'Writing Skills: write up to 3 sentences answering questions about a text he has read.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.2-2'
  AND g.active = true;

-- S015.11.4-1 (Life Skills Transition) - from master CSV
UPDATE public.goals g
SET "desc" = 'Life Skills: S015 will demonstrate the ability to identify the parts of a recipe on 5 of 7 opportunities'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.4-1'
  AND g.active = true;

-- S015.11.4-2 (Life Skills Transition) - from master CSV
UPDATE public.goals g
SET "desc" = 'Life Skills: S015 will demonstrate the ability to follow the recipe when cooking on 5 of 6 opportunities.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S015'
  AND g.code = 'S015.11.4-2'
  AND g.active = true;

-- S016.11.1 (Basic Reading) - from master CSV
UPDATE public.goals g
SET "desc" = 'In the area of Basic Reading, S016 will identify, read, and define unfamiliar vocabulary words from the text by 65% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.1'
  AND g.active = true;

-- S016.11.2-1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'Reading Comp: S016 will make logical inferences about characters, setting, or events by using text evidence.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.2-1'
  AND g.active = true;

-- S016.11.2-2 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'Reading Comp: S016 will identify key events in the text and explain what can be concluded based on the text/novel.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.2-2'
  AND g.active = true;

-- S016.11.3-1 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'Written Expression: Create a Main Idea'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.3-1'
  AND g.active = true;

-- S016.11.3-2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'Written Expression: Add at least two supporting details'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.3-2'
  AND g.active = true;

-- S016.11.3-3 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'Written Expression: Write a conclusion sentence'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S016'
  AND g.code = 'S016.11.3-3'
  AND g.active = true;

-- S017.9.1 (Basic Reading) - from master CSV
UPDATE public.goals g
SET "desc" = 'S017 will increase his basic reading skills by reading a recipe to identify and retrieve appropriate foods/ingredients according to recipe with 80% accuracy by the life if the IEP cycle.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S017'
  AND g.code = 'S017.9.1'
  AND g.active = true;

-- S017.9.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S017 will increase his written expression skills by using a combination of speech to text and typing on the Chromebook to write 3 complete sentences about a topic with ending punctuation with 80% accuracy as measured by work samples by the life of this IEP cycle.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S017'
  AND g.code = 'S017.9.2'
  AND g.active = true;

-- S018.9.1 (Basic Reading) - from master CSV
UPDATE public.goals g
SET "desc" = 'S018 will independently read and identify materials/supplies needed to complete the recipe given with 80% accuracy by the life of this IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S018'
  AND g.code = 'S018.9.1'
  AND g.active = true;

-- S018.9.2 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S018 will answer comprehension questions about a recipe with the support of an adult with 80% accuracy by the life of this IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S018'
  AND g.code = 'S018.9.2'
  AND g.active = true;

-- S018.9.3 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S018 will increase his written expression by writing or typing his personal information (name, address, date of birth, and phone number) with 80% accuracy by the life of this IEP cycle.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S018'
  AND g.code = 'S018.9.3'
  AND g.active = true;

-- S019.10.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'In the area of Reading Comprehension, S019 will increase her ability to read and summarizes a given passage with 80% accuracy by the next annual IEP review date.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S019'
  AND g.code = 'S019.10.1'
  AND g.active = true;

-- S019.10.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'In the area of Written Expression, S019 will increase her skills in writing a paragraph with a topic sentence, supporting details and conclusion with 80% accuracy by the next annual IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S019'
  AND g.code = 'S019.10.2'
  AND g.active = true;

-- S019.10.4 (Life Skills Transition) - from master CSV
UPDATE public.goals g
SET "desc" = 'In the area of Life Skills Transition, S019 will increase her social skills by identifying what others personal boundaries might look like with 50% accuracy by the next Annual IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S019'
  AND g.code = 'S019.10.4'
  AND g.active = true;

-- S020.12.3 (Life Skills Writing Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'S020 will increase his Life Skills Writing skills by practicing copying personal information (name, phone number, etc.) and copy simple sentences (I want ________) with a 50% accuracy by the end of the IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S020'
  AND g.code = 'S020.12.3'
  AND g.active = true;

-- S020.12.1 (Life Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'S020 will increase his readiness skills by practicing organizational skills (matching, sorting, etc) with a 50% accuracy, by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S020'
  AND g.code = 'S020.12.1'
  AND g.active = true;

-- S020.12.2 (Life Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'S020 will increase his readiness skills assembling bags of supplies ( 1 each of 5 items) with a 50% accuracy by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S020'
  AND g.code = 'S020.12.2'
  AND g.active = true;

-- S020.12.4 (Life Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'S020 will increase his Life Skills Transition Skills by practicing gathering and organizing supplies from a list of household items needed to complete a task (cooking, laundry, etc.) with a 50% accuracy by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S020'
  AND g.code = 'S020.12.4'
  AND g.active = true;

-- S022.12.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S022 will increase his reading comprehension skills by using context clues to understand the meaning of a text with 80% accuracy by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S022'
  AND g.code = 'S022.12.1'
  AND g.active = true;

-- S022.12.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S022 will increase his written expression skills by independently writing a grammatically correct paragraph using a topic sentence and supporting details with 80% accuracy by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S022'
  AND g.code = 'S022.12.2'
  AND g.active = true;

-- S023.10.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S023 will increase her reading comprehension skills by using context clues to understand the meaning of a text with 70% accuracy by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S023'
  AND g.code = 'S023.10.1'
  AND g.active = true;

-- S023.10.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S023 will increase her written expression skills by formulating and writing complete sentences with 65% accuracy by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S023'
  AND g.code = 'S023.10.2'
  AND g.active = true;

-- S023.10.4 (Life Skills Transition) - from master CSV
UPDATE public.goals g
SET "desc" = 'S023 will increase her life skills by preparing a dish by following the directions with 65% accuracy with 2 or fewer prompts by the end of the IEP cycle.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S023'
  AND g.code = 'S023.10.4'
  AND g.active = true;

-- S024.9.1 (Social Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'S024 will increase his his awareness of proper verbal responses during supervised unstructured social situations 4 out of 5 interactions by the next annual IEP review date.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S024'
  AND g.code = 'S024.9.1'
  AND g.active = true;

-- S024.9.2 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S024 will increase his reading comprehension skills by responding to comprehension questions with supports details with 70% accuracy by the next annual IEP review date.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S024'
  AND g.code = 'S024.9.2'
  AND g.active = true;

-- S024.9.3 (Math Problem Solving) - from master CSV
UPDATE public.goals g
SET "desc" = 'S024 will increase his math problem solving skills by solving multiple step problems involving the use of decimals with 70% accuracy by the next annual IEP review date.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S024'
  AND g.code = 'S024.9.3'
  AND g.active = true;

-- S025.9.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S025 will increase her reading comprehension skills by independently reading a grade level passage and answer comprehension questions identifying the main idea, inferencing and summarizing the passage with 80% accuracy by the life of this IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S025'
  AND g.code = 'S025.9.1'
  AND g.active = true;

-- S026.9.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S026 will increase his reading comprehension skills by answering inferencing and conclusion questions with 80% accuracy by the life life of this IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S026'
  AND g.code = 'S026.9.1'
  AND g.active = true;

-- S026.9.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S026 will increase his written skills goal by able to write a paragraph with introduction, details and conclusion with 80% accuracy by the life of the IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S026'
  AND g.code = 'S026.9.2'
  AND g.active = true;

-- S027.9.1 (Social Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'S027 will increase the incidents of using self-management skills to regulate and return to a given task 2 out of 4 situations by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S027'
  AND g.code = 'S027.9.1'
  AND g.active = true;

-- S027.9.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S027 will increase her written expression skills by writing an essay with an introductory paragraph with main ideas with 3 body paragraphs 3 out of 4 samples by the next annual IEP date.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S027'
  AND g.code = 'S027.9.2'
  AND g.active = true;

-- S028.9.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S028 will increase her reading comprehension skills by identifying supports when responding to inferencing questions on instructional level text read independently with 80% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S028'
  AND g.code = 'S028.9.1'
  AND g.active = true;

-- S031.10.1 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S031 will increase his writing by using evidence and citing his writing with 45% accuracy by the end of the IEP cycle.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S031'
  AND g.code = 'S031.10.1'
  AND g.active = true;

-- S031.10.2 (Math Calculation) - from master CSV
UPDATE public.goals g
SET "desc" = 'S031 will increase his math calculation skills by using order of operations to solve mathematical equations with 80% accuracy by the end of the IEP cycle.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S031'
  AND g.code = 'S031.10.2'
  AND g.active = true;

-- S032.10.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S032 will increase his reading comprehension by identifying what the question is asking by restating the question with 60% accuracy by the life of this IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S032'
  AND g.code = 'S032.10.1'
  AND g.active = true;

-- S032.10.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S032 will increase his written expression skills by writing 1 paragraph summary of a text including the main idea and one supporting detail with 60% accuracy by the life of this IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S032'
  AND g.code = 'S032.10.2'
  AND g.active = true;

-- S033.10.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S033 will increase his skills in reading comprehension by making inference''s with 80% accuracy by the next annual IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S033'
  AND g.code = 'S033.10.1'
  AND g.active = true;

-- S033.10.2 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S033 will increase his math skills by Using Graphic Organizers to sequence and solve the mathematical problems in a logical manner with 80% accuracy by the next IEP cycle baseline 70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S033'
  AND g.code = 'S033.10.2'
  AND g.active = true;

-- S033.10.3 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S033 will increase his skills in reading comprehension by using context clues to determine the meaning of context clues to determine the meaning of unknown words with 80% accuracy by the next IEP cycle.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S033'
  AND g.code = 'S033.10.3'
  AND g.active = true;

-- S033.10.4 (Language) - from master CSV
UPDATE public.goals g
SET "desc" = 'S033 will state synonyms and antonyms of given words with 80% accuracy.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S033'
  AND g.code = 'S033.10.4'
  AND g.active = true;

-- S033.10.5 (Language) - from master CSV
UPDATE public.goals g
SET "desc" = 'S033 will provide appropriate definitions of words when given a homophone word pair with 80% accuracy.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S033'
  AND g.code = 'S033.10.5'
  AND g.active = true;

-- S035.10.1 (Behavior) - from master CSV
UPDATE public.goals g
SET "desc" = 'S035 will increase his behavior skills by completing the objectives below with 70% accuracy by the next annual IEP review.
1) Follow a reasonable request when asked by an adult. Baseline - 25%
2) Raising hand to speak in class. Baseline - 43%
3) Staying in assigned seat unless given permission. Baseline - 43%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S035'
  AND g.code = 'S035.10.1'
  AND g.active = true;

-- S036.10.1 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S036 will increase his written expression skills by writing multiple paragraphs with transitions and conclusion sentences with 70% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S036'
  AND g.code = 'S036.10.1'
  AND g.active = true;

-- S036.10.2 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S036 will increase his reading comprehension skills by providing text evidence to support conclusions with 70% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S036'
  AND g.code = 'S036.10.2'
  AND g.active = true;

-- S038.9.1 (Behavior) - from master CSV
UPDATE public.goals g
SET "desc" = 'By the end of the IEP cycle, S038 will maintain behavior by managing conflicts on 80% of instances by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S038'
  AND g.code = 'S038.9.1'
  AND g.active = true;

-- S039.11.2 (Reading Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'S039 will increase reading comprehension skills by completing the following objectives with an average of 80% accuracy by the end of the IEP period.

1. Answering questions that ask for text summaries from grade level text. Baseline 57%

2. Answering inference based questions from reading material. Baseline 48%

3. Utilize reading comprehension strategies such as underlining key words in questions, underlying/highlighting details in reading, highlighting/underline and ask/look up meaning of unfamiliar words in text, and annotating text and stories.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S039'
  AND g.code = 'S039.11.2'
  AND g.active = true;

-- S039.11.3 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S039 will increase his written expression skills by writing a response utilizing story mappings, topic webbings, and/or writing rubrics with a topic sentence, supporting details and a conclusion with 80% accuracy by the of this IEP period. Baseline: 65%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S039'
  AND g.code = 'S039.11.3'
  AND g.active = true;

-- S040.10.1 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S040 will increase his writing skills by composing a cohesive, organized paragraph with a clear topic sentence, supporting details with evidence, and a concluding sentence with 80% accuracy by the end of the IEP cycle'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S040'
  AND g.code = 'S040.10.1'
  AND g.active = true;

-- S040.10.2 (Math Problem Solving) - from master CSV
UPDATE public.goals g
SET "desc" = 'S040 will increase his problem-solving skills by accurately solving multi-step math problems or multi-step operations involving addition, subtraction, multiplication, and/or division by identifying relevant information, selecting appropriate operations, and executing each step in sequence with 80% accuracy by the end of the IEP cycle'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S040'
  AND g.code = 'S040.10.2'
  AND g.active = true;

-- S041.9.1 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S041 will increase her written expression skills by writing a paragraph with a topic sentence, three supporting details and conclusion with 70% accuracy by the next annual IEP review.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S041'
  AND g.code = 'S041.9.1'
  AND g.active = true;

-- S042.9.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S042 will increase her reading comprehension skills by independently answering inferencing questions related to a passage with 80% accuracy by the end of this IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S042'
  AND g.code = 'S042.9.1'
  AND g.active = true;

-- S042.9.2 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S042 will increase her written expression by including transition words in her writing and writing multiple paragraphs with 80% accuracy by the end of this IEP.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S042'
  AND g.code = 'S042.9.2'
  AND g.active = true;

-- S042.9.4 (Basic Reading) - from master CSV
UPDATE public.goals g
SET "desc" = 'When presented a list of skill level words, sentences, or paragraphs, S042 will demonstrate increased decoding by pronouncing words with 60% accuracy by the end of this IEP cycle.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S042'
  AND g.code = 'S042.9.4'
  AND g.active = true;

-- S043.10.1 (Social Skills) - from master CSV
UPDATE public.goals g
SET "desc" = 'S043 will increase her social skills by waiting her turn to speak and following adult direction with 2 or fewer prompts on data days by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S043'
  AND g.code = 'S043.10.1'
  AND g.active = true;

-- S043.10.2 (Emotional Regulation) - from master CSV
UPDATE public.goals g
SET "desc" = 'S043 will maintain her emotional regulation skills by using learned strategies to calm her anxiety, work independently, and complete assignments 80% of the time on data collection days.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S043'
  AND g.code = 'S043.10.2'
  AND g.active = true;

-- S044.10.1 (Written Expression) - from master CSV
UPDATE public.goals g
SET "desc" = 'S044 will increase her written expression skills by to providing a written response on writing assignments she is given turning in her work on 80% of opportunities by the end of this IEP period.'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S044'
  AND g.code = 'S044.10.1'
  AND g.active = true;

-- S045.11.1 (Reading Comprehension) - from master CSV
UPDATE public.goals g
SET "desc" = 'S045 will increase his reading comprehension skills by determining the meaning of words and phrases as they are used in reading and content (ex. figurative language, etc.) in context with 80% accuracy by the end of the annual IEP cycle. Baseline: 70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S045'
  AND g.code = 'S045.11.1'
  AND g.active = true;

-- S045.11.2 (Written Expression) - corrected from problem statement
UPDATE public.goals g
SET "desc" = 'S045 will increase his written expression skills by restating questions and adding 3 supporting details to his writing with 50% accuracy by the end of the annual IEP cycle.',
    baseline = '35%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S045'
  AND g.code = 'S045.11.2'
  AND g.active = true;

-- STEP 3: Fix RPC functions that incorrectly reference 'goal_code'/'goal_text' columns
--         that don't exist in the goals table. The correct column names are 'code'
--         and 'desc'. Also ensures student_id is properly set in add_student_goals.

CREATE OR REPLACE FUNCTION public.add_student_goals(p_student_code text, p_goals jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_student_id uuid;
  v_created    int := 0;
BEGIN
  SELECT id INTO v_student_id FROM public.students WHERE code = p_student_code;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND';
  END IF;
  INSERT INTO public.goals (student_id, code, "desc", goal_area, baseline, mastery, target, case_manager, active, version, start_date)
  SELECT v_student_id,
         g->>'goal_code',
         g->>'goal_text',
         g->>'goal_area',
         nullif(g->>'baseline', ''),
         nullif(g->>'mastery', ''),
         nullif(g->>'target', ''),
         g->>'case_manager',
         true,
         coalesce(nullif(g->>'version', '')::int, 1),
         coalesce((g->>'start_date')::date, current_date)
  FROM jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) g;
  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN jsonb_build_object('student_code', p_student_code, 'goals_created', v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_student_with_enrollments_and_goals(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code       text;
  v_student_id uuid;
BEGIN
  v_code := (payload->'student'->>'code');
  IF v_code IS NULL OR length(trim(v_code)) = 0 THEN RAISE EXCEPTION 'STUDENT_CODE_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM public.students WHERE code = v_code) THEN RAISE EXCEPTION 'STUDENT_CODE_EXISTS'; END IF;
  INSERT INTO public.students (code, active) VALUES (v_code, true)
  RETURNING id INTO v_student_id;
  INSERT INTO public.enrollments (student_code, class_id, start_date)
  SELECT v_code, (enr->>'class_id')::uuid, coalesce((enr->>'start_date')::date, current_date)
  FROM jsonb_array_elements(coalesce(payload->'enrollments', '[]'::jsonb)) enr;
  INSERT INTO public.goals (student_id, code, "desc", goal_area, baseline, mastery, target, case_manager, active, version, start_date)
  SELECT v_student_id,
         g->>'goal_code',
         g->>'goal_text',
         g->>'goal_area',
         nullif(g->>'baseline', ''),
         nullif(g->>'mastery', ''),
         nullif(g->>'target', ''),
         g->>'case_manager',
         true,
         1,
         coalesce((g->>'start_date')::date, current_date)
  FROM jsonb_array_elements(coalesce(payload->'goals', '[]'::jsonb)) g;
  RETURN jsonb_build_object('student_code', v_code,
    'enrollments_created', jsonb_array_length(coalesce(payload->'enrollments', '[]'::jsonb)),
    'goals_created', jsonb_array_length(coalesce(payload->'goals', '[]'::jsonb)));
END;
$$;
CREATE OR REPLACE FUNCTION public.replace_goal_version(old_goal_id uuid, new_goal jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old        record;
  v_new_id     uuid;
  v_new_version int;
  v_new_code   text;
BEGIN
  SELECT * INTO v_old FROM public.goals WHERE id = old_goal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GOAL_NOT_FOUND'; END IF;
  IF v_old.active = false THEN RAISE EXCEPTION 'GOAL_ALREADY_ARCHIVED'; END IF;
  v_new_version := coalesce(v_old.version, 1) + 1;
  v_new_code := coalesce(new_goal->>'goal_code', v_old.code || 'v' || v_new_version);
  IF EXISTS (SELECT 1 FROM public.goals WHERE student_id = v_old.student_id AND code = v_new_code) THEN
    RAISE EXCEPTION 'GOAL_CODE_EXISTS';
  END IF;
  UPDATE public.goals SET active = false WHERE id = old_goal_id;
  INSERT INTO public.goals (student_id, code, "desc", goal_area, baseline, mastery, target, case_manager, active, version, start_date)
  VALUES (
    v_old.student_id,
    v_new_code,
    coalesce(new_goal->>'goal_text', v_old."desc"),
    coalesce(new_goal->>'goal_area', v_old.goal_area),
    coalesce(nullif(new_goal->>'baseline', ''), v_old.baseline),
    coalesce(nullif(new_goal->>'mastery',  ''), v_old.mastery),
    coalesce(nullif(new_goal->>'target',   ''), v_old.target),
    coalesce(new_goal->>'case_manager', v_old.case_manager),
    true,
    v_new_version,
    coalesce((new_goal->>'start_date')::date, current_date)
  )
  RETURNING id INTO v_new_id;
  UPDATE public.goals SET replaced_by = v_new_id WHERE id = old_goal_id;
  RETURN jsonb_build_object(
    'old_goal_id', old_goal_id,
    'new_goal_id', v_new_id,
    'version',     v_new_version,
    'new_code',    v_new_code
  );
END;
$$;
