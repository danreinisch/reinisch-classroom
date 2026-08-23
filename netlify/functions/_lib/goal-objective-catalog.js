'use strict';

/**
 * Canonical 2026-27 IEP child-objective visibility catalog.
 *
 * Source:
 *   supabase/migrations/20260823012500_goal_objective_registry.sql
 *   canonical _goal_objective_seed fixture
 *
 * Slice 4 purpose:
 * - read-only objective visibility beneath existing controlling parent goals
 * - no database activation is required
 * - no browser reads this module directly
 * - no scoring or progress calculations live here
 *
 * Browser-facing projection intentionally excludes internal monitoring,
 * assignment-planning, status, and source-QA metadata.
 */

const GOAL_OBJECTIVES =
  Object.freeze(
    [
  {
    "student_code": "S008",
    "parent_goal_code": "S008.CG2",
    "code": "S008.CG2.O1",
    "goal_area": "Reading Comprehension",
    "objective_number": 1,
    "objective_text": "At least three key details to support the main idea",
    "baseline": null,
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "70% overall"
  },
  {
    "student_code": "S008",
    "parent_goal_code": "S008.CG2",
    "code": "S008.CG2.O2",
    "goal_area": "Reading Comprehension",
    "objective_number": 2,
    "objective_text": "Correct sequence",
    "baseline": null,
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "70% overall"
  },
  {
    "student_code": "S009",
    "parent_goal_code": "S009.CG1",
    "code": "S009.CG1.O1",
    "goal_area": "Basic Reading",
    "objective_number": 1,
    "objective_text": "Prefix",
    "baseline": "37%",
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S009",
    "parent_goal_code": "S009.CG1",
    "code": "S009.CG1.O2",
    "goal_area": "Basic Reading",
    "objective_number": 2,
    "objective_text": "Suffix",
    "baseline": "53%",
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S009",
    "parent_goal_code": "S009.CG2",
    "code": "S009.CG2.O1",
    "goal_area": "Reading Comprehension",
    "objective_number": 1,
    "objective_text": "Answering literal questions",
    "baseline": null,
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S009",
    "parent_goal_code": "S009.CG2",
    "code": "S009.CG2.O2",
    "goal_area": "Reading Comprehension",
    "objective_number": 2,
    "objective_text": "Answering inferential questions",
    "baseline": null,
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S009",
    "parent_goal_code": "S009.CG4",
    "code": "S009.CG4.O1",
    "goal_area": "Written Expression",
    "objective_number": 1,
    "objective_text": "Topic/Claim",
    "baseline": "47%",
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S009",
    "parent_goal_code": "S009.CG4",
    "code": "S009.CG4.O2",
    "goal_area": "Written Expression",
    "objective_number": 2,
    "objective_text": "Three supporting details",
    "baseline": "47%",
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S009",
    "parent_goal_code": "S009.CG4",
    "code": "S009.CG4.O3",
    "goal_area": "Written Expression",
    "objective_number": 3,
    "objective_text": "Conclusion",
    "baseline": "47%",
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S015",
    "parent_goal_code": "S015.CG1",
    "code": "S015.CG1.O1",
    "goal_area": "Life Skills Reading Skills",
    "objective_number": 1,
    "objective_text": "Read and follow directions",
    "baseline": "54%",
    "objective_wording_criterion": "65% accuracy",
    "mastery_field": "70%",
    "parent_goal_criterion": "Per objective"
  },
  {
    "student_code": "S015",
    "parent_goal_code": "S015.CG1",
    "code": "S015.CG1.O2",
    "goal_area": "Life Skills Reading Skills",
    "objective_number": 2,
    "objective_text": "Answer questions about what is happening in a picture or reading passage",
    "baseline": "60%",
    "objective_wording_criterion": "70% accuracy",
    "mastery_field": "80%",
    "parent_goal_criterion": "Per objective"
  },
  {
    "student_code": "S015",
    "parent_goal_code": "S015.CG1",
    "code": "S015.CG1.O3",
    "goal_area": "Life Skills Reading Skills",
    "objective_number": 3,
    "objective_text": "Answer questions about why something is happening in a picture or reading passage",
    "baseline": "55%",
    "objective_wording_criterion": "65% accuracy",
    "mastery_field": "65%",
    "parent_goal_criterion": "Per objective"
  },
  {
    "student_code": "S015",
    "parent_goal_code": "S015.CG2",
    "code": "S015.CG2.O1",
    "goal_area": "Life Skills Writing Skills",
    "objective_number": 1,
    "objective_text": "Write a sentence describing what is happening in a picture",
    "baseline": null,
    "objective_wording_criterion": "45% accuracy",
    "mastery_field": null,
    "parent_goal_criterion": "Per objective"
  },
  {
    "student_code": "S015",
    "parent_goal_code": "S015.CG2",
    "code": "S015.CG2.O2",
    "goal_area": "Life Skills Writing Skills",
    "objective_number": 2,
    "objective_text": "Write up to 3 sentences answering questions about a text he has read",
    "baseline": "Currently writing 1 sentence",
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "Per objective"
  },
  {
    "student_code": "S015",
    "parent_goal_code": "S015.CG4",
    "code": "S015.CG4.O1",
    "goal_area": "Life Skills Transition",
    "objective_number": 1,
    "objective_text": "Identify the parts of a recipe",
    "baseline": null,
    "objective_wording_criterion": "5 of 7 opportunities",
    "mastery_field": null,
    "parent_goal_criterion": "Per objective"
  },
  {
    "student_code": "S015",
    "parent_goal_code": "S015.CG4",
    "code": "S015.CG4.O2",
    "goal_area": "Life Skills Transition",
    "objective_number": 2,
    "objective_text": "Follow the recipe when cooking",
    "baseline": null,
    "objective_wording_criterion": "5 of 6 opportunities",
    "mastery_field": null,
    "parent_goal_criterion": "Per objective"
  },
  {
    "student_code": "S049",
    "parent_goal_code": "S049.CG3",
    "code": "S049.CG3.O1",
    "goal_area": "Written Expression",
    "objective_number": 1,
    "objective_text": "Use a period when appropriate instead of the word \"and\"",
    "baseline": "20%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "70% overall"
  },
  {
    "student_code": "S049",
    "parent_goal_code": "S049.CG3",
    "code": "S049.CG3.O2",
    "goal_area": "Written Expression",
    "objective_number": 2,
    "objective_text": "Use transition words while composing her paragraph",
    "baseline": "20%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "70% overall"
  },
  {
    "student_code": "S051",
    "parent_goal_code": "S051.CG4",
    "code": "S051.CG4.O1",
    "goal_area": "Written Expression",
    "objective_number": 1,
    "objective_text": "Write in complete thoughts",
    "baseline": null,
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S051",
    "parent_goal_code": "S051.CG4",
    "code": "S051.CG4.O2",
    "goal_area": "Written Expression",
    "objective_number": 2,
    "objective_text": "Write using topic statement, supports and conclusion",
    "baseline": null,
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S052",
    "parent_goal_code": "S052.CG2",
    "code": "S052.CG2.O1",
    "goal_area": "Written Expression",
    "objective_number": 1,
    "objective_text": "Respond to comprehension questions or writing prompts using grammatically correct sentences",
    "baseline": null,
    "objective_wording_criterion": "75% accuracy",
    "mastery_field": null,
    "parent_goal_criterion": "Mixed by objective"
  },
  {
    "student_code": "S052",
    "parent_goal_code": "S052.CG2",
    "code": "S052.CG2.O2",
    "goal_area": "Written Expression",
    "objective_number": 2,
    "objective_text": "Correct punctuation (ending commas in compound sentences)",
    "baseline": null,
    "objective_wording_criterion": "90% accuracy",
    "mastery_field": null,
    "parent_goal_criterion": "Mixed by objective"
  },
  {
    "student_code": "S052",
    "parent_goal_code": "S052.CG2",
    "code": "S052.CG2.O3",
    "goal_area": "Written Expression",
    "objective_number": 3,
    "objective_text": "Capitalization (proper nouns and beginning of sentences)",
    "baseline": null,
    "objective_wording_criterion": "90% accuracy",
    "mastery_field": null,
    "parent_goal_criterion": "Mixed by objective"
  },
  {
    "student_code": "S053",
    "parent_goal_code": "S053.CG2",
    "code": "S053.CG2.O1",
    "goal_area": "Written Expression",
    "objective_number": 1,
    "objective_text": "Compound sentences",
    "baseline": "40%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S053",
    "parent_goal_code": "S053.CG2",
    "code": "S053.CG2.O2",
    "goal_area": "Written Expression",
    "objective_number": 2,
    "objective_text": "Use Transitional words independently",
    "baseline": "68%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S053",
    "parent_goal_code": "S053.CG2",
    "code": "S053.CG2.O3",
    "goal_area": "Written Expression",
    "objective_number": 3,
    "objective_text": "Include a conclusion sentence for each topic",
    "baseline": "50%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S053",
    "parent_goal_code": "S053.CG2",
    "code": "S053.CG2.O4",
    "goal_area": "Written Expression",
    "objective_number": 4,
    "objective_text": "Use adjectives within his sentences",
    "baseline": "40%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S059",
    "parent_goal_code": "S059.CG3",
    "code": "S059.CG3.O1",
    "goal_area": "Written Expression",
    "objective_number": 1,
    "objective_text": "Write 5 sentences on a topic using sentence starters",
    "baseline": null,
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "60% overall"
  },
  {
    "student_code": "S059",
    "parent_goal_code": "S059.CG3",
    "code": "S059.CG3.O2",
    "goal_area": "Written Expression",
    "objective_number": 2,
    "objective_text": "Write 5 sentences on a topic with moderate prompting",
    "baseline": null,
    "objective_wording_criterion": null,
    "mastery_field": null,
    "parent_goal_criterion": "60% overall"
  },
  {
    "student_code": "S065",
    "parent_goal_code": "S065.CG1",
    "code": "S065.CG1.O1",
    "goal_area": "Reading Comprehension",
    "objective_number": 1,
    "objective_text": "Identify the authors purpose",
    "baseline": "30%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S065",
    "parent_goal_code": "S065.CG1",
    "code": "S065.CG1.O2",
    "goal_area": "Reading Comprehension",
    "objective_number": 2,
    "objective_text": "Identify the main idea in non fiction texts and the theme in fictional texts",
    "baseline": "43%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S065",
    "parent_goal_code": "S065.CG1",
    "code": "S065.CG1.O3",
    "goal_area": "Reading Comprehension",
    "objective_number": 3,
    "objective_text": "Explain the cause and effect relationship",
    "baseline": "28%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S065",
    "parent_goal_code": "S065.CG2",
    "code": "S065.CG2.O1",
    "goal_area": "Written Expression",
    "objective_number": 1,
    "objective_text": "Write an introduction sentence",
    "baseline": "50%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S065",
    "parent_goal_code": "S065.CG2",
    "code": "S065.CG2.O2",
    "goal_area": "Written Expression",
    "objective_number": 2,
    "objective_text": "Write a conclusion sentence",
    "baseline": "50%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "80% overall"
  },
  {
    "student_code": "S065",
    "parent_goal_code": "S065.CG2",
    "code": "S065.CG2.O3",
    "goal_area": "Written Expression",
    "objective_number": 3,
    "objective_text": "Use compound sentences within her paragraph",
    "baseline": "40%",
    "objective_wording_criterion": null,
    "mastery_field": "80%",
    "parent_goal_criterion": "80% overall"
  }
].map(
      objective =>
        Object.freeze(objective)
    )
  );

const GOAL_OBJECTIVE_COUNT =
  GOAL_OBJECTIVES.length;

const PARENT_GOAL_COUNT =
  new Set(
    GOAL_OBJECTIVES.map(
      objective =>
        objective.parent_goal_code
    )
  ).size;

if (GOAL_OBJECTIVE_COUNT !== 35) {
  throw new Error(
    `Canonical objective catalog expected 35 rows; found ${GOAL_OBJECTIVE_COUNT}`
  );
}

if (PARENT_GOAL_COUNT !== 14) {
  throw new Error(
    `Canonical objective catalog expected 14 parents; found ${PARENT_GOAL_COUNT}`
  );
}

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function getObjectivesForParentGoal(
  parentGoalCode,
  studentCode
) {
  const parent =
    normalizeCode(parentGoalCode);

  const student =
    normalizeCode(studentCode);

  if (!parent || !student) {
    return [];
  }

  return GOAL_OBJECTIVES
    .filter(
      objective =>
        objective.parent_goal_code === parent &&
        objective.student_code === student
    )
    .slice()
    .sort(
      (a, b) =>
        a.objective_number - b.objective_number ||
        a.code.localeCompare(b.code)
    )
    .map(
      objective => ({ ...objective })
    );
}

module.exports = Object.freeze({
  GOAL_OBJECTIVE_COUNT,
  PARENT_GOAL_COUNT,
  getObjectivesForParentGoal,
});
