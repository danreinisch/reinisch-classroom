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
  prompt += `5. Purely descriptive — NO action items, tips, next steps, recommendations, or suggestions of any kind.\n`;
  if (isExternal) {
    prompt += `6. Vocabulary at approximately 6th-grade reading level. Use plain everyday words. Avoid all IEP/SPED jargon.\n`;
    prompt += `   Use "starting score" instead of "baseline" and "quiz scores" instead of "data points."\n\n`;
  } else {
    prompt += `6. Vocabulary at approximately 8th-grade reading level. Avoid: proficiency, mastery, monitoring, demonstrate, performance.\n\n`;
  }

  // Narrative patterns
  prompt += `## NARRATIVE PATTERNS TO FOLLOW:\n`;
  if (isExternal) {
    prompt += `- On-track or above target: "${safeCode} has increased their [area] skills, scoring [X]% across [N] quiz scores — above their [target]% goal and up from a [starting score]% starting score."\n`;
    prompt += `- Below target: "${safeCode} is still working to grow their [area] skills, averaging [X]% across [N] quiz scores, which is below their [target]% goal. [One evidence sentence from the specific skill struggles list, if available.]"\n\n`;
  } else {
    prompt += `- On-track or above target: "${safeCode} has increased their [area] skills, scoring [X]% across [N] data points — above their [target]% target and up from a [baseline]% baseline."\n`;
    prompt += `- Below target: "${safeCode} is still working to grow their [area] skills, averaging [X]% across [N] assessments, which is below their [target]% target. [One evidence sentence from the specific skill struggles list, if available.]"\n\n`;
  }

  if (Array.isArray(iep_goals) && iep_goals.length > 0) {
    prompt += `IEP Goals:\n`;
    for (const g of iep_goals) {
      const code = sanitizeForPrompt(g.code, 50);
      const area = sanitizeForPrompt(g.area, 100);
      const trend = sanitizeForPrompt(g.trend, 10);
      prompt += `- Code: ${code}, Area: ${area}, Current average: ${sanitizeNumber(g.current_avg)}%, Trend: ${trend}, Data points: ${sanitizeNumber(g.data_points)}, Target: ${sanitizeNumber(g.target)}%, Baseline: ${sanitizeNumber(g.baseline)}%\n`;

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
    prompt += `  "description": a plain-English description of this skill (no acronyms/jargon; parent-friendly)\n`;
  } else {
    prompt += `  "description": a thorough, IEP-ready description of this skill area. For DESE/MLS standards, include the full strand name, cluster, and specific skill being measured. For IEP goals, include the goal area, a clear restatement of what the goal measures, and the specific skill deficit being addressed.\n`;
  }
  prompt += `  "summary": the plain-prose narrative (2–3 sentences, no bold, no headers, no bullets)\n`;
  if (isExternal) {
    prompt += `  "plain_language": one sentence under 200 characters, parent-friendly, purely descriptive (e.g. "${safeCode} is reading at 100% — well above their goal.") — no tips\n`;
  } else {
    prompt += `  "plain_language": one sentence under 200 characters, purely descriptive (e.g. "${safeCode} is reading at 100% — well above their 80% target.") — no tips\n`;
  }
  prompt += `  "tier": one of "excellent" (>=80%), "on-track" (60-79%), "needs-support" (40-59%), "critical" (<40%)\n`;
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
