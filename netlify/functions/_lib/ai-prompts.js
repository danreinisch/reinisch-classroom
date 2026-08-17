// Shared AI prompt helpers for teacher-ai-skills-summary functions.
// This is the canonical source for BANNED_PHRASES — both summary functions import from here.
'use strict';

// ── Banned phrases ─────────────────────────────────────────────────────────
// Try to load from the canonical JSON file; fall back to the hardcoded list.
let BANNED_PHRASES;
try {
  const path = require('path');
  const fs = require('fs');
  const jsonPath = path.resolve(__dirname, '../../../web/ai-prompts/banned-phrases.json');
  BANNED_PHRASES = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch (_) {
  BANNED_PHRASES = [
    'targeted intervention',
    'targeted interventions',
    'continued monitoring',
    'continued support',
    'additional support',
    'ensure progress',
    'achieve and maintain',
    'appears to',
    'suggests that',
    'indicating that',
    'indicates a need',
    'demonstrate proficiency',
    'demonstrate mastery',
    'skill area',
    'this level of performance',
    'is recommended',
    'to develop effectively',
  ];
}

// Pre-compute lowercase versions for efficient matching
const BANNED_PHRASES_LOWER = BANNED_PHRASES.map(p => p.toLowerCase());

/**
 * Returns the first banned phrase found in `text`, or null if none.
 * @param {string} text
 * @returns {string|null}
 */
function findBannedPhrase(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (let i = 0; i < BANNED_PHRASES_LOWER.length; i++) {
    if (lower.includes(BANNED_PHRASES_LOWER[i])) return BANNED_PHRASES[i];
  }
  return null;
}

/**
 * Sanitize a string value for safe inclusion in a prompt.
 * Truncates long strings and removes newlines to prevent prompt injection.
 * @param {*} value
 * @param {number} [maxLen=200]
 * @returns {string}
 */
function sanitizeForPrompt(value, maxLen = 200) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n\t]/g, ' ').slice(0, maxLen);
}

/**
 * Sanitize a numeric value for safe inclusion in a prompt.
 * @param {*} value
 * @returns {string}
 */
function sanitizeNumber(value) {
  const n = parseFloat(value);
  return isNaN(n) ? 'N/A' : String(n);
}

/**
 * Build the system prompt for the OpenAI skills summary assistant.
 * Supports both the legacy `language_mode` parameter and the newer `audience` parameter.
 * @param {Object} params
 * @param {string} params.student_code
 * @param {Array}  params.iep_goals
 * @param {Array}  params.dese_standards
 * @param {string} [params.audience]      - 'internal' (default) or 'external'
 * @param {string} [params.language_mode] - legacy: 'parent-friendly' maps to external
 * @param {string} [params.retry_hint]    - banned phrase from prior attempt, for retry
 * @returns {string}
 */
function buildSkillsPrompt({ student_code, iep_goals, dese_standards, language_mode, audience, retry_hint }) {
  const safeCode = sanitizeForPrompt(student_code, 20);
  // Support both legacy language_mode and new audience parameter
  const isExternal = audience === 'external' || language_mode === 'parent-friendly';

  let prompt = `You are an educational data analyst writing plain-prose skill descriptions for a special education teacher.\n`;
  prompt += `Write a purely descriptive narrative summary for each skill listed below for student ${safeCode}.\n\n`;

  // Banned phrase enforcement
  prompt += `## BANNED PHRASES — NEVER USE ANY OF THESE:\n`;
  for (const phrase of BANNED_PHRASES) {
    prompt += `- "${phrase}"\n`;
  }
  // Additional prompt-level banned phrases (vague qualitative judgments)
  const promptBannedPhrases = [
    'shows some clarity',
    'needs further development',
    'lacks some organization',
    'has room for improvement',
    'indicating a need for improvement',
    'indicating a need',
    'some clarity',
    'room for improvement',
    'needs improvement',
    'would benefit',
  ];
  for (const phrase of promptBannedPhrases) {
    prompt += `- "${phrase}"\n`;
  }
  if (retry_hint) {
    const safeHint = sanitizeForPrompt(retry_hint, 100);
    prompt += `\nIMPORTANT: Your previous draft contained the banned phrase "${safeHint}". `;
    prompt += `Rewrite every sentence that contained it without using that phrase.\n`;
  }
  prompt += `\n`;

  // Narrative style rules
  prompt += `## WRITING RULES — FOLLOW EXACTLY:\n`;
  prompt += `1. Write 2–3 sentences per skill (~40–60 words total). Plain prose only — no bold text, no headers, no bullet points anywhere in the summary.\n`;
  prompt += `2. Always use ${safeCode} as the subject of every sentence. Never write "the student."\n`;
  prompt += `3. Every sentence must include at least one number (score, count, percentage, or data-point count).\n`;
  prompt += `4. Active voice only.\n`;
  prompt += `5. Purely descriptive — NO action items, tips, next steps, recommendations, suggestions, or editorial opinions of any kind. No qualitative adjectives such as "good," "poor," "weak," "strong," "some clarity," or "room for improvement."\n`;
  prompt += `6. No vague qualitative judgments — state numbers only.\n`;
  if (isExternal) {
    prompt += `7. Vocabulary at approximately 6th-grade reading level. Use plain everyday words. Avoid all IEP/SPED jargon except the exact source labels required for STATUS: CRITERION_CONFLICT.\n`;
    prompt += `   Use "starting score" instead of "baseline" and "quiz scores" instead of "data points." For CRITERION_CONFLICT, preserve the exact labels "Header Mastery", "Goal-Text Target", and "Manual Criterion Review Required".\n`;
  } else {
    prompt += `7. Vocabulary at approximately 8th-grade reading level. Avoid: proficiency, mastery, monitoring, demonstrate, performance, except preserve the exact source label "Header Mastery" for STATUS: CRITERION_CONFLICT.\n`;
  }
  prompt += `8. DATA_POINTS_PATTERN RULE — ABSOLUTE:\n`;
  prompt += `   - If a goal's DATA_POINTS_PATTERN is SINGLE: you MUST write "scoring [X]% on 1 ${isExternal ? 'quiz score' : 'assessment'}" — NEVER use "averaging" or "across" with a single data point.\n`;
  prompt += `   - If a goal's DATA_POINTS_PATTERN is MULTIPLE: you MAY write "averaging [X]% across [N] ${isExternal ? 'quiz scores' : 'assessments'}".\n\n`;

  // Narrative patterns
  prompt += `## NARRATIVE PATTERNS TO FOLLOW:\n`;
  prompt += `IMPORTANT: The DATA_POINTS_PATTERN label on each goal overrides everything — SINGLE always uses "on 1 ${isExternal ? 'quiz score' : 'assessment'}", MULTIPLE uses "across N ${isExternal ? 'quiz scores' : 'assessments'}".\n`;
  prompt += `Each IEP goal below is pre-labeled STATUS: AT_OR_ABOVE_TARGET, BELOW_TARGET, or CRITERION_CONFLICT. Use that label to pick the correct pattern.\n`;
  prompt += `CRITERION_CONFLICT is used only when criterion_conflict is explicitly true in the supplied goal data. Never infer a conflict merely because Header Mastery and Goal-Text Target differ.\n`;
  if (isExternal) {
    prompt += `- AT_OR_ABOVE_TARGET (data_points = 1): "${safeCode} has increased their [area] skills, scoring [X]% on 1 quiz score — above their [target]% goal and up from a [starting score]% starting score."\n`;
    prompt += `- AT_OR_ABOVE_TARGET (data_points > 1): "${safeCode} has increased their [area] skills, averaging [X]% across [N] quiz scores — above their [target]% goal and up from a [starting score]% starting score."\n`;
    prompt += `- BELOW_TARGET (data_points = 1): "${safeCode} is still working to grow their [area] skills, scoring [X]% on 1 quiz score, which is below their [target]% goal. [One evidence sentence from the specific skill struggles list, if available.]"\n`;
    prompt += `- BELOW_TARGET (data_points > 1): "${safeCode} is still working to grow their [area] skills, averaging [X]% across [N] quiz scores, which is below their [target]% goal. [One evidence sentence from the specific skill struggles list, if available.]"\n\n`;
  } else {
    prompt += `- AT_OR_ABOVE_TARGET (data_points = 1): "${safeCode} has increased their [area] skills, scoring [X]% on 1 assessment — above their [target]% target and up from a [baseline]% baseline."\n`;
    prompt += `- AT_OR_ABOVE_TARGET (data_points > 1): "${safeCode} has increased their [area] skills, averaging [X]% across [N] assessments — above their [target]% target and up from a [baseline]% baseline."\n`;
    prompt += `- BELOW_TARGET (data_points = 1): "${safeCode} is still working to grow their [area] skills, scoring [X]% on 1 assessment, which is below their [target]% target. [One evidence sentence from the specific skill struggles list, if available.]"\n`;
    prompt += `- BELOW_TARGET (data_points > 1): "${safeCode} is still working to grow their [area] skills, averaging [X]% across [N] assessments, which is below their [target]% target. [One evidence sentence from the specific skill struggles list, if available.]"\n\n`;
  }

  prompt += `- CRITERION_CONFLICT (data_points = 1): "${safeCode} scored [X]% on 1 ${isExternal ? 'quiz score' : 'assessment'}, compared with a [baseline]% ${isExternal ? 'starting score' : 'baseline'}. ${safeCode} has 2 official criterion values: Header Mastery [header_mastery] and Goal-Text Target [goal_text_target]; Manual Criterion Review Required."\n`;
  prompt += `- CRITERION_CONFLICT (data_points > 1): "${safeCode} averaged [X]% across [N] ${isExternal ? 'quiz scores' : 'assessments'}, compared with a [baseline]% ${isExternal ? 'starting score' : 'baseline'}. ${safeCode} has 2 official criterion values: Header Mastery [header_mastery] and Goal-Text Target [goal_text_target]; Manual Criterion Review Required."\n`;
  prompt += `For STATUS: CRITERION_CONFLICT, do not describe the goal as above target, below target, met, mastered, on track, at target, near mastery, or needing a number of points to reach either criterion. Report raw numbers, trend, both official criterion values, and Manual Criterion Review Required.\n\n`;

  // Same-area goal rule
  prompt += `## SAME-AREA GOAL RULE:\n`;
  prompt += `When multiple IEP goals share the same area name, you MUST reference the specific goal code in the summary to differentiate them. Do not repeat the same generic sentence for each.\n\n`;

  // DESE Standard rules
  prompt += `## DESE STANDARD RULES:\n`;
  prompt += `The summary for DESE standards must state only the score and item count — do NOT include phrases like "indicating a need for improvement" or any other editorial judgment.\n\n`;

  if (Array.isArray(iep_goals) && iep_goals.length > 0) {
    // Count how many goals share each area name
    const areaCounts = {};
    for (const g of iep_goals) {
      const area = sanitizeForPrompt(g.area, 100);
      areaCounts[area] = (areaCounts[area] || 0) + 1;
    }

    prompt += `IEP Goals:\n`;
    for (const g of iep_goals) {
      const code = sanitizeForPrompt(g.code, 50);
      const area = sanitizeForPrompt(g.area, 100);
      const trend = sanitizeForPrompt(g.trend, 10);
      const currentAvg = parseFloat(g.current_avg);
      const criterionConflict = g && g.criterion_conflict === true;
      const target = parseFloat(g.target);
      const status = criterionConflict
        ? 'CRITERION_CONFLICT'
        : (
            !isNaN(currentAvg) &&
            !isNaN(target) &&
            currentAvg >= target
          )
          ? 'AT_OR_ABOVE_TARGET'
          : 'BELOW_TARGET';
      const dp = parseFloat(g.data_points);
      const dpPattern = (!isNaN(dp) && dp === 1) ? 'SINGLE' : 'MULTIPLE';

      let goalLine;

      if (criterionConflict) {
        const headerMastery =
          sanitizeForPrompt(
            g.header_mastery,
            50
          ) || 'Not stated';

        const goalTextTarget =
          sanitizeForPrompt(
            g.goal_text_target,
            50
          ) || 'Not stated';

        goalLine =
          `- Code: ${code}, Area: ${area}, STATUS: CRITERION_CONFLICT, DATA_POINTS_PATTERN: ${dpPattern}, Current average: ${sanitizeNumber(g.current_avg)}%, Trend: ${trend}, Data points: ${sanitizeNumber(g.data_points)}, Header Mastery: ${headerMastery}, Goal-Text Target: ${goalTextTarget}, Criterion Status: Manual Criterion Review Required, Baseline: ${sanitizeNumber(g.baseline)}%`;
      } else {
        goalLine =
          `- Code: ${code}, Area: ${area}, STATUS: ${status}, DATA_POINTS_PATTERN: ${dpPattern}, Current average: ${sanitizeNumber(g.current_avg)}%, Trend: ${trend}, Data points: ${sanitizeNumber(g.data_points)}, Target: ${sanitizeNumber(g.target)}%, Baseline: ${sanitizeNumber(g.baseline)}%`;
      }
      if (areaCounts[area] > 1) {
        goalLine += `, NOTE: multiple goals share this area name — you MUST reference the goal code "${code}" in the summary to differentiate`;
      }
      prompt += goalLine + '\n';

      if (Array.isArray(g.question_weaknesses) && g.question_weaknesses.length > 0) {
        prompt += `  Specific skill struggles for ${code}:\n`;
        const limitedWeaknesses = g.question_weaknesses
          .slice()
          .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100))
          .slice(0, 5);
        for (const q of limitedWeaknesses) {
          const qText = sanitizeForPrompt(q.text, 100);
          const qAcc = sanitizeNumber(q.accuracy);
          const qAttempts = sanitizeNumber(q.attempts);
          prompt += `    * "${qText}" — ${qAcc}% accuracy over ${qAttempts} attempt${q.attempts === 1 ? '' : 's'}\n`;
        }
      }
    }
    prompt += `\n`;
  }

  if (Array.isArray(dese_standards) && dese_standards.length > 0) {
    prompt += `DESE Standards (from graded assignments):\n`;
    for (const d of dese_standards) {
      const code = sanitizeForPrompt(d.code, 50);
      prompt += `- Code: ${code}, Score: ${sanitizeNumber(d.percent_correct)}%, Items graded: ${sanitizeNumber(d.item_count)}\n`;
    }
    prompt += `\n`;
  }

  prompt += `Return a JSON object with a single "skills" array. Each element must have:\n`;
  prompt += `  "code": the goal or DESE code exactly as provided\n`;
  if (isExternal) {
    prompt += `  "description": a plain-English description of this skill (no acronyms/jargon; parent-friendly). For DESE/MLS standards, name the specific standard code and describe what that standard actually measures — not a generic strand blurb.\n`;
  } else {
    prompt += `  "description": a thorough, IEP-ready description of this skill area. For DESE/MLS standards, name the specific standard code and describe what that standard actually measures — not a generic strand blurb repeated across multiple standards. For IEP goals, include the goal area, a clear restatement of what the goal measures, and the specific skill deficit being addressed.\n`;
  }
  prompt += `  "summary": the plain-prose narrative (2–3 sentences, no bold, no headers, no bullets)\n`;
  if (isExternal) {
    prompt += `  "plain_language": one sentence under 200 characters, parent-friendly, purely descriptive (e.g. "${safeCode} is reading at 100% — well above their goal.") — no tips\n`;
  } else {
    prompt += `  "plain_language": one sentence under 200 characters, purely descriptive (e.g. "${safeCode} is reading at 100% — well above their 80% target.") — no tips\n`;
  }
  prompt += `  For an IEP goal with STATUS: CRITERION_CONFLICT, "plain_language" must preserve Header Mastery and Goal-Text Target as separate values, include "Manual Criterion Review Required", and must not describe the goal as above, below, met, mastered, on track, at target, or near mastery.\n`;
  prompt += `  "tier": one of "excellent" (>=80%), "on-track" (60-79%), "needs-support" (40-59%), "critical" (<40%). This is only a raw score-band display field and is not an IEP criterion-status judgment; never use the tier wording to characterize a CRITERION_CONFLICT goal in narrative text.\n`;
  prompt += `  "source": "iep" if from IEP Goals, or "dese" if from DESE Standards\n`;
  prompt += `Do NOT include a "goal_recommendation" field.\n`;
  prompt += `Include every IEP goal and every DESE standard provided. Do not add or remove entries.\n`;

  return prompt;
}

module.exports = {
  BANNED_PHRASES,
  BANNED_PHRASES_LOWER,
  findBannedPhrase,
  sanitizeForPrompt,
  sanitizeNumber,
  buildSkillsPrompt,
};
