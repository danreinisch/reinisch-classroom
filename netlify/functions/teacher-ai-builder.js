// AI Builder endpoint — generates individualized ELA/Life Skills assignments
// and presentations via the Anthropic API (Claude).
// POST /.netlify/functions/teacher-ai-builder
// Auth: Requires teacher session cookie
// Body: { taskType, week, chapters, theme, source, scope, model, presentationScope?, imageNames?, libraryRef? }
// Returns: { ok: true, content: string }

console.log('[teacher-ai-builder] Module loaded');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { rest, jsonRes } = require('./_lib/supa');

const { SESSION_SECRET } = process.env;

/**
 * Sanitize a string for safe inclusion in a prompt.
 * Truncates long strings and removes control characters.
 */
function sanitizeForPrompt(value, maxLen) {
  var len = maxLen || 500;
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n\t]/g, ' ').slice(0, len);
}

/**
 * Query live student roster, goals, and enrollments from Supabase.
 * Returns a structured context string for injection into the Claude prompt.
 */
async function buildStudentContext(requestId) {
  console.log('[teacher-ai-builder] [' + requestId + '] Querying Supabase for live student data');

  // Fetch active students
  var studentsRes = await rest('/rest/v1/students?select=id,code,active&active=eq.true&order=code.asc');
  var studentsData = await jsonRes(studentsRes);
  if (!studentsData.ok) {
    console.warn('[teacher-ai-builder] [' + requestId + '] Could not fetch students: ' + studentsData.status);
    return '(student data unavailable)';
  }
  var students = Array.isArray(studentsData.data) ? studentsData.data : [];

  // Fetch all active IEP goals
  var goalsRes = await rest('/rest/v1/goals?select=id,student_id,code,desc,goal_area,baseline,mastery,status,active&active=eq.true&order=code.asc');
  var goalsData = await jsonRes(goalsRes);
  var goals = (goalsData.ok && Array.isArray(goalsData.data)) ? goalsData.data : [];

  // Fetch class enrollments
  var enrollRes = await rest('/rest/v1/class_enrollments?select=student_code,class_name,active&active=eq.true');
  var enrollData = await jsonRes(enrollRes);
  var enrollments = (enrollData.ok && Array.isArray(enrollData.data)) ? enrollData.data : [];

  // Build lookup maps
  var goalsByStudentId = {};
  goals.forEach(function(g) {
    var sid = g.student_id;
    if (!goalsByStudentId[sid]) goalsByStudentId[sid] = [];
    goalsByStudentId[sid].push(g);
  });

  var classByStudentCode = {};
  enrollments.forEach(function(e) {
    if (e.student_code) classByStudentCode[e.student_code] = e.class_name || '';
  });

  // Build context string
  var lines = [
    '=== LIVE STUDENT DATA (queried from Supabase at ' + new Date().toISOString() + ') ===',
    '',
  ];

  students.forEach(function(s) {
    var className = classByStudentCode[s.code] || '(unknown class)';
    var studentGoals = goalsByStudentId[s.id] || [];

    lines.push(s.code + ' | ' + className + ' | Active');
    if (studentGoals.length === 0) {
      lines.push('  Goals: None (DESE-only)');
    } else {
      studentGoals.forEach(function(g) {
        var baseline = g.baseline || 'N/A';
        var mastery = g.mastery || 'N/A';
        var area = g.goal_area || 'N/A';
        var status = g.status || 'Open';
        lines.push('  [' + g.code + '] ' + area + ' | ' + baseline + ' → ' + mastery + ' | ' + status);
      });
    }
    lines.push('');
  });

  if (students.length === 0) {
    lines.push('(No active students found in database)');
  }

  return lines.join('\n');
}

/**
 * Build the system prompt for the Claude API call.
 * Embeds the full ELA Assignment Generation Rulebook.
 */
function buildSystemPrompt() {
  return [
    'You are the Reinisch Classroom AI Builder — an expert ELA/Life Skills special education',
    'assignment and presentation generator for Mr. Reinisch\'s Teacher Center (reinischclassroom.com).',
    'You serve ~40 IEP students across 5 class periods at Winfield High School, Room 406.',
    '',
    '=== FULL ELA ASSIGNMENT GENERATION RULEBOOK ===',
    '',
    '─── 1. ASSIGNMENT STRUCTURE ───────────────────────────────────────────────',
    'Each weekly assignment contains 25 questions across 4 days (29 total points):',
    '  Day 1: 8 questions (MC / TF / FIB mix) — 8 points',
    '  Day 2: 8 questions (MC / TF / FIB mix) — 8 points',
    '  Day 3: 8 questions (MC / TF / FIB mix) — 8 points',
    '  Day 4: 1 Written Response — 5 points',
    'Total: 25 questions + 1 WR = 29 points (24 × 1pt + 1 × 5pt)',
    '',
    '─── 2. QUESTION TYPE FORMATS ──────────────────────────────────────────────',
    '',
    'MULTIPLE CHOICE (MC):',
    '  What does the word "ominous" most likely mean? [MLS.R.1.A] [IG: S001.11.2]',
    '  A) Cheerful and bright',
    '  B) Threatening or alarming',
    '  C) Calm and peaceful',
    '  Correct: B',
    '  Hint: Look at the mood of the scene where this word appears.',
    '',
    'TRUE/FALSE (TF):',
    '  The main character in the story is afraid of the dark. (True/False) [MLS.R.2.A] [IG: S003.10.1]',
    '  Correct: True',
    '  Hint: Reread the passage and look for clues about how the character feels.',
    '',
    'FILL-IN-THE-BLANK (FIB):',
    '  The author uses __________ to help the reader understand the setting. (Fill-in-the-Blank) [MLS.R.3.A]',
    '  Correct: descriptive language',
    '  Hint: Think about the words the author chose to paint a picture.',
    '',
    'WRITTEN RESPONSE (WR) — Day 4 only:',
    '  Using evidence from the text, explain how the theme develops across the story. (Written Response) [MLS.W.3.A]',
    '  HINTS:',
    '     - Start with a topic sentence that states the theme.',
    '     - Include at least two examples from the text.',
    '     - End with a concluding sentence.',
    '',
    '─── 3. DESE STANDARDS (Missouri Learning Standards) ───────────────────────',
    'Use ONLY the following MLS codes — place in brackets at end of question stem:',
    '  [MLS.R.1.A]  — Informational: determine central idea and details',
    '  [MLS.R.1.B]  — Informational: summarize and analyze',
    '  [MLS.R.2.A]  — Literature: determine theme and summarize',
    '  [MLS.R.3.A]  — Literature: analyze how plot/character/setting develop',
    '  [MLS.R.3.C]  — Literature: analyze point of view / author purpose',
    '  [MLS.R.5.A]  — Vocabulary: determine word meaning using context clues',
    '  [MLS.L.1.A]  — Language: demonstrate standard grammar and usage',
    '  [MLS.L.4.A]  — Language: use context to determine meaning of unknown words',
    '  [MLS.L.4.B]  — Language: use roots/affixes to determine meaning',
    '  [MLS.W.3.A]  — Writing: write arguments/explanations with evidence',
    '',
    '─── 4. IEP PRECISION TAGGING SYSTEM ──────────────────────────────────────',
    'IEP tags use format: [IG: SXXX.YY.Z] where SXXX=student, YY=goal number, Z=skill variant.',
    'A question may only receive an IEP tag if the question\'s SKILL matches the goal\'s valid skills.',
    'DESE-only students (no IEP goals) get NO [IG:] tags — only [MLS.X.X.X] tags.',
    '',
    'COMPLETE GOAL_SKILL_MAP — valid question skills per goal code:',
    '  Comprehension goals (e.g., S001.11, S002.10):',
    '    Valid skills: main idea, supporting detail, summarize, inference, sequence, cause/effect,',
    '                  compare/contrast, author\'s purpose, text structure, central idea',
    '',
    '  Vocabulary goals (e.g., S001.12, S004.11):',
    '    Valid skills: context clues, word meaning, synonym/antonym, word parts (roots/affixes),',
    '                  figurative language, connotation, tier-2 vocabulary, academic vocabulary',
    '',
    '  Grammar/Language goals (e.g., S002.11, S005.10):',
    '    Valid skills: parts of speech, sentence structure, punctuation, capitalization,',
    '                  subject-verb agreement, pronoun usage, verb tense, modifier placement',
    '',
    '  Writing/Constructed Response goals (e.g., S001.13, S003.12):',
    '    Valid skills: topic sentence, supporting evidence, text evidence, elaboration,',
    '                  conclusion, paragraph organization, transition words, claim/evidence',
    '',
    '  Decoding/Fluency goals (e.g., S017.10):',
    '    Valid skills: phonics, word recognition, fluency, decoding multi-syllabic words,',
    '                  sight words, reading rate',
    '',
    '  Life Skills goals (e.g., S015.10, S020.10):',
    '    Valid skills: functional reading, following directions, sequencing steps,',
    '                  identifying safety words, community vocabulary, daily living vocabulary',
    '',
    'TAGGING RULES:',
    '  • MC/TF/FIB: one [IG:] tag per question maximum (only when skill match is confirmed)',
    '  • WR: may have one [IG:] tag if the writing prompt addresses a measurable goal skill',
    '  • Each MC-measurable IEP goal needs ≥3 data points across the week (Days 1–3)',
    '  • Never tag a goal if the question skill does not appear in the goal\'s valid skill list',
    '  • Flag any unknown goal codes and request clarification',
    '',
    '─── 5. ANSWER DISTRIBUTION RULES ─────────────────────────────────────────',
    '  • MC answers: ~33% A, ~33% B, ~33% C per individual student (not per class)',
    '  • Distribution is checked per student, not across the class as a whole',
    '  • True/False answers are excluded from the 33/33/33 distribution check',
    '  • No single letter should appear more than 40% of the time for one student',
    '',
    '─── 6. MC OPTION LENGTH BALANCING (CRITICAL) ─────────────────────────────',
    '  • All three MC options (A, B, C) MUST be similar in word count',
    '  • Maximum length difference: 2–3 words between shortest and longest option',
    '  • Students with attention needs often select the longest answer — eliminate this bias',
    '  • If a correct answer is naturally short, pad it; if naturally long, trim it',
    '  • Example (BAD):  A) Yes  B) No  C) The character felt frightened because of shadows',
    '  • Example (GOOD): A) The character felt happy  B) The character felt angry  C) The character felt scared',
    '',
    '─── 7. HINT SYSTEM RULES (9 Safety Rules) ─────────────────────────────────',
    '  1. NO keyword overlap — hint words must not appear ONLY in the correct answer',
    '     (hint words may appear in incorrect options too, or be entirely neutral)',
    '  2. NO elimination language — never say "it is NOT" or "eliminate" or "rule out"',
    '  3. NO option references — never say "Option B" or "the second choice"',
    '  4. Point to WHERE, not WHAT — direct to text location, not the answer itself',
    '  5. True/False hints: pure re-read instruction only — "Reread [section] for clues"',
    '  6. WR hints: sentence starters only (see WR format rules below)',
    '  7. Never give away the answer — hint should narrow without confirming',
    '  8. No negation hints — do not say what the answer is NOT',
    '  9. Hints must be grade-appropriate and concise (one sentence maximum for MC/TF/FIB)',
    '',
    '─── 8. WRITTEN RESPONSE INDIVIDUALIZATION ──────────────────────────────────',
    'Every student has a specific WR format. Match exactly:',
    '',
    'COMPLETE STUDENT WR FORMAT MAP:',
    '  S001: 2 full paragraphs — claim + 2 text evidence per paragraph',
    '  S002: 2 full paragraphs — topic sentence + 2 supporting details + conclusion',
    '  S003: 1 paragraph — restate question + 2 details from text + closing sentence',
    '  S004: 2 full paragraphs — claim + evidence + elaboration (each paragraph)',
    '  S005: 1 paragraph — topic sentence + 3 supporting details',
    '  S006: 2 full paragraphs — claim/evidence format',
    '  S007: 1 paragraph — restate + details + closing',
    '  S008: 1 paragraph — 2 sentences minimum (Language Arts 3 SC, simplified)',
    '  S009: 2 full paragraphs — claim + evidence format',
    '  S010: 1 paragraph — restate + 2 details',
    '  S011: 2 full paragraphs — topic + evidence + elaboration',
    '  S012: EXCLUDED from Language Arts — no assignment generated',
    '  S013: 1 paragraph — restate + 2 supporting details',
    '  S014: 2 full paragraphs — claim + 2 evidence per paragraph',
    '  S015: Life Skills format — sequencing steps (numbered list, 3–5 steps)',
    '  S016: 1 paragraph — restate + details + closing',
    '  S017: Speech-to-text accommodation — sentence starters provided, 2–3 sentences',
    '  S018: Recipe/procedure format — ingredient list + numbered steps',
    '  S019: 1 paragraph — topic sentence + 2 examples',
    '  S020: Life Skills format — functional reading response (identify + explain)',
    '  S021: 2 full paragraphs — claim + evidence',
    '  S022: 1 paragraph — restate + 2 details',
    '  S023: 2 full paragraphs — topic + support + elaboration',
    '  S024: 1 paragraph — restate + 2 supporting details',
    '  S025: 2 full paragraphs — claim/evidence format',
    '  S026: 1 paragraph — topic sentence + 3 details',
    '  S027: 2 full paragraphs — argument + evidence',
    '  S028: 1 paragraph — restate + details + closing',
    '  S029: 2 full paragraphs — claim + support',
    '  S030: 1 paragraph — restate + 2 examples from text',
    '  S031: 2 full paragraphs — claim + evidence + elaboration',
    '  S032: 1 paragraph — topic sentence + 2 supporting details',
    '  S033: 2 full paragraphs — argument + evidence',
    '  S034: 1 paragraph — restate + 2 details',
    '  S035: 2 full paragraphs — claim + 2 pieces evidence each',
    '  S036: 1 paragraph — topic sentence + examples + closing',
    '  S037: 2 full paragraphs — claim + evidence format',
    '  S038: DESE-only — standard 1 paragraph response, no IEP tags',
    '  S039: DESE-only — standard 1 paragraph response, no IEP tags',
    '  S040: 1 paragraph — restate + 2 supporting details',
    '  S041: 2 full paragraphs — topic + evidence + elaboration',
    '  S042: 1 paragraph — topic sentence + 2 details',
    '  S043: 2 full paragraphs — claim + evidence format; MUST be included in every generation',
    '  S044: 1 paragraph — restate + details + closing',
    '  S045: 2 full paragraphs — claim + evidence',
    '  S046: Baseline assessment format — open-ended, no scaffolding',
    '',
    '─── 9. STUDENT-SPECIFIC RULES AND ACCOMMODATIONS ──────────────────────────',
    '  S008: Displays in class roster as "Language Arts 3 SC" — simplified scaffold,',
    '        1 short paragraph minimum for WR, reduced complexity vocabulary',
    '  S012: EXCLUDED from Language Arts entirely — do NOT generate any assignment',
    '  S015: Life Skills format — use functional/community vocabulary, numbered-step WR',
    '  S017: Decoding/speech-to-text accommodation — provide WR sentence starters;',
    '        questions should avoid complex multi-step processing',
    '  S018: Recipe-based WR format — ingredient list + numbered procedure steps',
    '  S020: Life Skills format — functional reading comprehension, identify + explain WR',
    '  S038: DESE-only student — 0% IEP tagging, 100% DESE standards only',
    '  S039: DESE-only student — 0% IEP tagging, 100% DESE standards only',
    '  S043: MUST be included in every generation — never omit this student',
    '  S046: Baseline assessment only — no scaffolded hints, open-ended questions',
    '',
    '  GENERAL RULES:',
    '  • Never skip any active student enrolled in LA (except S012)',
    '  • DESE-only students (S038, S039) receive 0% IEP tags / 100% DESE tags',
    '  • All active students receive a complete individualized assignment',
    '',
    '─── 10. CLASS COMPLEXITY LEVELS ───────────────────────────────────────────',
    '  Life Skills LA SC  = Level 1 (lowest)   — functional reading, community vocab',
    '  LA1                = Level 2             — foundational ELA skills',
    '  LA2                = Level 3             — developing ELA skills',
    '  LA3                = Level 4             — grade-approaching ELA skills',
    '  Language Arts 3 SC = Level 4 (S008 only) — same level as LA3, SC scaffold',
    '  LA4                = Level 5 (highest)   — grade-level ELA skills',
    '  Geometry SC        = Level 4             — cross-curricular literacy',
    '',
    '─── 11. PLATFORM INTEGRATION TAGS (exact formats) ─────────────────────────',
    '  DESE standard:   [MLS.R.1.A]',
    '  IEP goal:        [IG: S001.11.2]',
    '  True/False:      (True/False)',
    '  Fill-in-Blank:   (Fill-in-the-Blank)',
    '  Written Resp:    (Written Response)',
    '  Correct answer:  Correct: A   or   Correct: True   or   Correct: [answer text]',
    '  Single hint:     Hint: [text]',
    '  WR hint block:',
    '    HINTS:',
    '       - [hint 1]',
    '       - [hint 2]',
    '       - [hint 3]',
    '',
    '─── 12. ASSIGNMENT HEADER / FOOTER FORMAT ──────────────────────────────────',
    'Each student section must begin with:',
    '  ================================================',
    '  Assignment: SXXX | Week XX | [Class Name]',
    '  IEP Goals: [comma-separated goal codes, or "DESE-Only"]',
    '  MC Distribution: A=X  B=X  C=X',
    '  IEP Data Points per Goal: [GOAL_CODE]=X [GOAL_CODE]=X ...',
    '  ================================================',
    '',
    '─── 13. PRESENTATION GENERATION RULES (Newline Smart TV) ──────────────────',
    '',
    'JAVASCRIPT ARCHITECTURE (STRICT REQUIREMENTS):',
    '  • Traditional function() declarations ONLY — NO arrow functions',
    '  • NO const or let — use var for all variable declarations',
    '  • NO .closest() — use parentNode traversal instead',
    '  • NO backdrop-filter:blur() — causes performance issues on TV hardware',
    '  • NO transform on hover — breaks GPU-accelerated background crossfade',
    '  • Two-layer background system: two <div> layers, crossfade via opacity only',
    '  • Opacity-only transitions: will-change: opacity; translate3d(0,0,0); backface-visibility: hidden',
    '  • Background image array: exactly 12 slots (fill unused with empty string "")',
    '  • Navigation: Previous/Next buttons + left-half/right-half click zones + arrow keys',
    '  • Progress bar at top of screen',
    '  • Footer text: "Mr. Reinisch · Room 406 · Winfield High School · reinischclassroom.com"',
    '',
    'DESIGN SYSTEM:',
    '  Background: dark navy (#0a0e1a or similar dark)',
    '  Headings: gold (#ffd700)',
    '  Subheadings: light blue (#a0d2eb)',
    '  Body text: white or near-white',
    '  Box types (border-left accent + semi-transparent background):',
    '    highlight      = gold   (#ffd700) — key vocabulary, emphasis',
    '    rule-box       = blue   (#4a9eff) — grammar rules, writing rules',
    '    example-box    = green  (#4ade80) — examples from text',
    '    warning-box    = red    (#f87171) — common errors, cautions',
    '    grammar-box    = purple (#c084fc) — grammar focus',
    '    writing-structure = yellow (#fbbf24) — paragraph/essay structure',
    '    skill-card     = orange (#fb923c) — skill focus cards',
    '',
    'SLIDE STRUCTURE:',
    '  Slide 0: Overview — Day navigation buttons (Day 1 / Day 2 / Day 3 / Day 4)',
    '  Slides 1–3 (Day 1–3): key events summary, skill in action, mini skill reminder',
    '    card, vocabulary table, author\'s craft, 2 discussion questions',
    '  Slides for Day 4: writing prompt, sentence starters, model response, checklist',
    '  Reference section: vocabulary glossary, skill definitions, transition word table,',
    '    sentence starters, step-by-step strategy guide',
    '  Review slide: unit summary',
    '',
    '─── 14. WEEKLY THEMES (Lost in Kragdon-ah Unit) ────────────────────────────',
    '  Week 10: Introduction — meeting Kragdon-ah and the main characters',
    '  Week 11: Rising Action — challenges and conflicts emerge',
    '  Week 12: Midpoint — key turning point in the story',
    '  Week 13: Climax — the peak conflict and confrontation',
    '  Week 14: Falling Action — consequences and resolution begin',
    '  Week 15: Resolution — themes resolved, characters changed',
    '',
    '─── 15. ADAPTABILITY RULES ─────────────────────────────────────────────────',
    '  • Only generate assignments for Active students',
    '  • If goal codes are not in the GOAL_SKILL_MAP, flag them and request clarification',
    '  • When library references are provided, maintain vocabulary/skill progression',
    '    and avoid repeating the same questions, vocabulary, or skill focus',
    '  • Confirm before generating if week, chapters, or source material are incomplete',
    '  • Always check: is the student enrolled in an LA class? If not (e.g., S012), skip them',
    '  • If student data is unavailable, generate a template with placeholder student codes',
    '',
    '=== END RULEBOOK ===',
  ].join('\n');
}

exports.handler = async function(event) {
  var requestId = generateRequestId();
  console.log('[teacher-ai-builder] [' + requestId + '] Request received - method: ' + event.httpMethod);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Verify teacher session
  var auth = requireTeacher(event, SESSION_SECRET);
  if (!auth.ok) {
    console.log('[teacher-ai-builder] [' + requestId + '] Unauthorized');
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log('[teacher-ai-builder] [' + requestId + '] Authorized user: ' + auth.user.username);

  // Check Anthropic API key
  var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.warn('[teacher-ai-builder] [' + requestId + '] ANTHROPIC_API_KEY is not configured');
    return jsonResponse(event, 503, { ok: false, error: 'AI Builder not configured — ANTHROPIC_API_KEY missing' }, {}, requestId);
  }

  // Validate body size (100KB max)
  var bodySizeCheck = validateBodySize(event.body, 100);
  if (!bodySizeCheck.valid) {
    return jsonResponse(event, 413, { ok: false, error: bodySizeCheck.error }, {}, requestId);
  }

  // Parse request body
  var parsed = safeJsonParse(event.body);
  if (!parsed.ok) {
    return jsonResponse(event, 400, { ok: false, error: parsed.error || 'Invalid JSON body' }, {}, requestId);
  }
  var body = parsed.data;

  var taskType = sanitizeForPrompt(body.taskType, 20) || 'assignments';
  var week = sanitizeForPrompt(body.week, 10);
  var chapters = sanitizeForPrompt(body.chapters, 50);
  var theme = sanitizeForPrompt(body.theme, 100);
  var source = sanitizeForPrompt(body.source, 8000);
  var scope = sanitizeForPrompt(body.scope, 50);
  var model = sanitizeForPrompt(body.model, 50) || 'claude-sonnet-4-20250514';
  var presentationScope = sanitizeForPrompt(body.presentationScope, 20);
  var imageNames = Array.isArray(body.imageNames)
    ? body.imageNames.slice(0, 12).map(function(n) { return sanitizeForPrompt(n, 80); })
    : [];

  // Validate model selection to only allow known Claude models
  var allowedModels = ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'];
  if (allowedModels.indexOf(model) === -1) {
    model = 'claude-sonnet-4-20250514';
  }

  if (!week) {
    return jsonResponse(event, 400, { ok: false, error: 'week is required' }, {}, requestId);
  }
  if (!source) {
    return jsonResponse(event, 400, { ok: false, error: 'source material is required' }, {}, requestId);
  }

  // Build live student context from Supabase
  var studentContext;
  try {
    studentContext = await buildStudentContext(requestId);
  } catch (err) {
    console.error('[teacher-ai-builder] [' + requestId + '] Supabase query failed: ' + err.message);
    studentContext = '(student data unavailable due to error: ' + err.message + ')';
  }

  // Build the user message
  var userLines = [
    'TASK TYPE: ' + taskType,
    'WEEK: ' + week,
    chapters ? 'CHAPTERS: ' + chapters : '',
    theme ? 'ELA THEME: ' + theme : '',
    scope ? 'SCOPE: ' + scope : '',
  ].filter(Boolean);

  if ((taskType === 'presentations' || taskType === 'both') && presentationScope) {
    userLines.push('PRESENTATION SCOPE: ' + presentationScope);
  }

  if (imageNames.length > 0) {
    userLines.push('BACKGROUND IMAGES (' + imageNames.length + '): ' + imageNames.join(', '));
  }

  if (body.libraryRef && body.libraryRef.title) {
    userLines.push('LIBRARY REFERENCE: ' + sanitizeForPrompt(body.libraryRef.title, 200));
  }

  userLines.push('');
  userLines.push('SOURCE MATERIAL:');
  userLines.push(source);
  userLines.push('');
  userLines.push(studentContext);

  var userMessage = userLines.join('\n');

  console.log('[teacher-ai-builder] [' + requestId + '] Calling Anthropic API with model: ' + model);

  // Call Anthropic API
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 120000);

  var anthropicResult;
  try {
    var anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 64000,
        system: buildSystemPrompt(),
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!anthropicRes.ok) {
      var errText = await anthropicRes.text().catch(function() { return ''; });
      console.error('[teacher-ai-builder] [' + requestId + '] Anthropic API error: ' + anthropicRes.status + ' ' + errText);
      return jsonResponse(event, 502, { ok: false, error: 'AI generation failed' }, {}, requestId);
    }

    anthropicResult = await anthropicRes.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[teacher-ai-builder] [' + requestId + '] Anthropic request timed out');
      return jsonResponse(event, 504, { ok: false, error: 'AI generation timed out' }, {}, requestId);
    }
    console.error('[teacher-ai-builder] [' + requestId + '] Anthropic request failed: ' + err.message);
    return jsonResponse(event, 502, { ok: false, error: 'AI generation failed' }, {}, requestId);
  }

  // Extract content from response
  var content = '';
  var contentBlocks = anthropicResult && anthropicResult.content;
  if (Array.isArray(contentBlocks)) {
    contentBlocks.forEach(function(block) {
      if (block.type === 'text') content += block.text;
    });
  }

  if (!content) {
    console.error('[teacher-ai-builder] [' + requestId + '] Anthropic returned empty content');
    return jsonResponse(event, 502, { ok: false, error: 'AI generation returned empty content' }, {}, requestId);
  }

  console.log('[teacher-ai-builder] [' + requestId + '] Generation complete — ' + content.length + ' chars');

  return jsonResponse(event, 200, { ok: true, content: content }, {}, requestId);
};
