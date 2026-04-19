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

  let prompt = `You are an educational data analyst for a special education teacher.\n`;
  prompt += `Analyze the following performance data for student ${safeCode} and write a structured summary for each skill.\n\n`;

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

  // Required structure
  prompt += `## REQUIRED SUMMARY STRUCTURE (follow exactly, ~80 words per skill):\n\n`;
  prompt += `**WHAT HAPPENED** (1-2 sentences — MUST include at least one number AND one date or skill/chapter/assignment name)\n`;
  prompt += `**WHY IT MATTERS** (1 sentence — ties score to baseline/target/IEP context)\n`;
  prompt += `**DO THIS NEXT** (1-2 bullet points — concrete actions tied to a specific day or assignment)\n`;
  if (isExternal) {
    prompt += `  Each "DO THIS NEXT" bullet MUST be prefixed with: "Suggested — review before sending."\n`;
  }
  prompt += `\nThen add: **In plain words:** {one sentence a parent or student could read, < 200 characters}\n\n`;

  // Tone rules
  prompt += `## THREE RULES:\n`;
  prompt += `1. Specific, not generic: every sentence contains at least one number, date, chapter, or assignment name.\n`;
  prompt += `2. Active voice, named actor: "The student scored..." or "We will..." — never passive constructions.\n`;
  if (isExternal) {
    prompt += `3. Plain words (~6th-grade level): use do, get, miss, score, practice, try. Avoid all IEP/SPED jargon.\n\n`;
  } else {
    prompt += `3. Plain words (~8th-grade level): use do, get, miss, score, practice, reteach, try. Avoid: proficiency, mastery, monitoring, demonstrate, performance.\n\n`;
  }

  if (isExternal) {
    prompt += `## AUDIENCE: External (parents, guardians, official documents). Use warm, jargon-free language. "Do this next" must be prefixed with "Suggested — review before sending."\n\n`;
  } else {
    prompt += `## AUDIENCE: Internal (teacher-facing). "Do this next" should include 1-2 specific actions the teacher can take this week.\n\n`;
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
  prompt += `  "summary": the full three-section summary (WHAT HAPPENED / WHY IT MATTERS / DO THIS NEXT + "In plain words:" line)\n`;
  prompt += `  "plain_language": the "In plain words:" one-liner extracted separately (< 200 characters)\n`;
  prompt += `  "tier": one of "excellent" (>=80%), "on-track" (60-79%), "needs-support" (40-59%), "critical" (<40%)\n`;
  prompt += `  "source": "iep" if from IEP Goals, or "dese" if from DESE Standards\n`;
  if (!isExternal) {
    prompt += `  "goal_recommendation": only for needs-support or critical tiers — 1-2 sentence IEP goal draft. Omit entirely for excellent/on-track.\n`;
  } else {
    prompt += `  Do NOT include "goal_recommendation" — external summaries omit this field.\n`;
  }
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
