// AI Builder endpoint — generate ELA assignments and presentations using Anthropic Claude
// POST /.netlify/functions/teacher-ai-builder
// Auth: Requires teacher session cookie
// Body: { task_type, source_material, source_filename, week, chapters, theme, scope, model, library_ref }
// Returns: { ok: true, content: generatedText }

console.log('[teacher-ai-builder] Module loaded successfully');

const { requireTeacher } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');
const { rest, jsonRes, getSupabaseConfig } = require('./_lib/supa');

const { SESSION_SECRET } = process.env;
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();

// Student-specific IEP / accommodation rules embedded in the system prompt
const STUDENT_SPECIFIC_RULES = `
STUDENT-SPECIFIC RULES (always apply when generating for these codes):
S008: Extended time on all written tasks. Sentence starters provided for writing prompts.
S012: Reduce answer choices to 3 for multiple-choice. Use simplified vocabulary.
S015: Bold or highlight key vocabulary words. Break multi-step directions into numbered steps.
S017: Allow oral responses as alternative to written. Provide graphic organizers.
S018: Large print preferred. High contrast where possible.
S020: Pre-teach vocabulary before reading passages. Use picture supports where feasible.
S038: Chunked reading — no passage longer than 1 page without a comprehension check.
S039: Allow extra line spacing for written responses. Reduce writing demands by 50%.
S043: Use familiar sentence structures. Avoid idioms without explanation.
S046: Provide word bank for fill-in-the-blank tasks. Limit open-ended prompts.
`.trim();

// ELA Assignment Generation Rules summary
const ELA_RULES = `
ELA ASSIGNMENT GENERATION RULES:
1. Align all questions and writing prompts to the specified ELA theme.
2. Include a mix of comprehension, vocabulary, and writing/expression tasks.
3. Use grade-appropriate language for each class level (LA 1 through Life Skills).
4. Each assignment must include: (a) a reading passage or stimulus, (b) comprehension questions, (c) a writing prompt.
5. Life Skills LA: use functional literacy focus — real-world texts, practical vocabulary.
6. Differentiate difficulty across class levels; do not produce identical content for different classes.
7. Include DESE Standard codes where applicable (ELA strands: RL, RI, W, L, SL).
8. Keep assignments completable within a 45-minute class period.
9. Presentations: produce valid HTML slide markup using <section> tags, one section per slide.
10. For presentations, embed image file references as <img src="images/FILENAME"> using uploaded image filenames.
`.trim();

/**
 * Sanitize a string for safe inclusion in a prompt.
 */
function sanitizeForPrompt(value, maxLen = 500) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n\t]/g, ' ').slice(0, maxLen);
}

/**
 * Build the system prompt with rules and live student context.
 */
function buildSystemPrompt(students, goals, enrollments) {
  const studentLines = [];
  for (const s of students) {
    const studentGoals = goals.filter(g => g.student_id === s.id);
    const goalSummary = studentGoals.length > 0
      ? studentGoals.map(g => `[${g.code}] ${g.goal_area}: baseline ${g.baseline}%, target ${g.target}%`).join('; ')
      : 'No active IEP goals on file';

    const enrolled = enrollments
      .filter(e => e.student_id === s.id)
      .map(e => (e.classes && e.classes.name) ? e.classes.name : String(e.class_id || ''))
      .filter(Boolean)
      .join(', ');

    studentLines.push(`${s.code} (${s.name}): classes=[${enrolled || 'unknown'}] goals=[${goalSummary}]`);
  }

  const studentContext = studentLines.length > 0
    ? 'LIVE STUDENT ROSTER:\n' + studentLines.join('\n')
    : 'No active student data available.';

  return [
    'You are an expert special education ELA teacher assistant.',
    'You generate high-quality, differentiated assignments and presentations for a special education classroom.',
    '',
    ELA_RULES,
    '',
    STUDENT_SPECIFIC_RULES,
    '',
    studentContext,
    '',
    'Generate content that respects every student\'s IEP goals and accommodations listed above.',
    'When the teacher specifies a scope, generate content for that class only.',
    'Format all output as clean, readable text or valid HTML as appropriate for the task type.',
  ].join('\n');
}

/**
 * Build the user message from the teacher's configuration.
 */
function buildUserMessage(body) {
  const {
    task_type,
    source_material,
    source_filename,
    week,
    chapters,
    theme,
    scope,
    library_ref,
  } = body;

  const safeTaskType = sanitizeForPrompt(task_type, 20);
  const safeWeek = sanitizeForPrompt(week, 10);
  const safeChapters = sanitizeForPrompt(chapters, 100);
  const safeTheme = sanitizeForPrompt(theme, 200);
  const safeScope = sanitizeForPrompt(scope, 50);
  const safeLibraryRef = sanitizeForPrompt(library_ref, 300);
  const safeSourceFilename = sanitizeForPrompt(source_filename, 200);
  // Frontend enforces 50,000 char maxlength; backend applies an independent 40,000 char cap
  // as a defence-in-depth measure for prompt length and token budget.
  const safeSource = source_material
    ? String(source_material).replace(/[\r]/g, '').slice(0, 40000)
    : '';

  const parts = [
    `Please generate ${safeTaskType} for week ${safeWeek || 'unspecified'}.`,
  ];

  if (safeChapters) parts.push(`Chapters / Unit: ${safeChapters}.`);
  if (safeTheme) parts.push(`ELA Theme: ${safeTheme}.`);
  if (safeScope && safeScope !== 'all') parts.push(`Scope: ${safeScope} only.`);
  if (safeLibraryRef) parts.push(`Library reference context: ${safeLibraryRef}.`);

  if (safeSource) {
    parts.push(`\nSource Material:\n---\n${safeSource}\n---`);
  } else if (safeSourceFilename) {
    parts.push(`Source file provided: ${safeSourceFilename} (content not extracted — use the filename as a reference).`);
  }

  if (task_type === 'presentations' || task_type === 'both') {
    parts.push(
      '\nFor presentations: produce an HTML document using <section> tags for slides. ' +
      'Reference uploaded images as <img src="images/FILENAME"> if relevant.'
    );
  }

  return parts.join('\n');
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-ai-builder] [${requestId}] Request received - method: ${event.httpMethod}`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log(`[teacher-ai-builder] [${requestId}] Handling CORS preflight`);
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    console.log(`[teacher-ai-builder] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Verify teacher session
  const auth = requireTeacher(event, SESSION_SECRET);
  if (!auth.ok) {
    console.log(`[teacher-ai-builder] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-ai-builder] [${requestId}] Authorized user: ${auth.user.username}`);

  // Check Anthropic API key
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.warn(`[teacher-ai-builder] [${requestId}] ANTHROPIC_API_KEY is not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'AI Builder not configured' }, {}, requestId);
  }

  // Validate body size (500KB max)
  const bodySizeCheck = validateBodySize(event.body, 500);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-ai-builder] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Parse JSON body
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-ai-builder] [${requestId}] Invalid JSON body`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const body = parseResult.data;
  const task_type = body.task_type || 'assignments';
  const model_choice = body.model === 'opus' ? 'claude-opus-4-20250514' : 'claude-sonnet-4-20250514';

  console.log(`[teacher-ai-builder] [${requestId}] task_type=${task_type} model=${model_choice}`);

  // ── Fetch live student data from Supabase ─────────────────────────────────

  let students = [];
  let goals = [];
  let enrollments = [];

  try {
    const [studentsRes, goalsRes, enrollmentsRes] = await Promise.all([
      rest('/rest/v1/students?select=id,code,name,active&active=eq.true', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }),
      rest('/rest/v1/goals?select=id,student_id,code,desc,goal_area,baseline,target,active&active=eq.true', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }),
      rest('/rest/v1/class_enrollments?select=student_id,class_id,classes!inner(id,name)', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }),
    ]);

    const studentsData = await jsonRes(studentsRes);
    const goalsData = await jsonRes(goalsRes);
    const enrollmentsData = await jsonRes(enrollmentsRes);

    if (studentsData.ok && Array.isArray(studentsData.data)) {
      students = studentsData.data;
      console.log(`[teacher-ai-builder] [${requestId}] Loaded ${students.length} students`);
    } else {
      console.warn(`[teacher-ai-builder] [${requestId}] Could not load students: ${studentsData.status}`);
    }

    if (goalsData.ok && Array.isArray(goalsData.data)) {
      goals = goalsData.data;
      console.log(`[teacher-ai-builder] [${requestId}] Loaded ${goals.length} goals`);
    } else {
      console.warn(`[teacher-ai-builder] [${requestId}] Could not load goals: ${goalsData.status}`);
    }

    if (enrollmentsData.ok && Array.isArray(enrollmentsData.data)) {
      enrollments = enrollmentsData.data;
      console.log(`[teacher-ai-builder] [${requestId}] Loaded ${enrollments.length} enrollments`);
    } else {
      console.warn(`[teacher-ai-builder] [${requestId}] Could not load enrollments: ${enrollmentsData.status}`);
    }
  } catch (dbErr) {
    console.warn(`[teacher-ai-builder] [${requestId}] Supabase fetch error (proceeding without student data): ${dbErr.message}`);
  }

  // ── Build prompts ────────────────────────────────────────────────────────────

  const systemPrompt = buildSystemPrompt(students, goals, enrollments);
  const userMessage = buildUserMessage(body);

  // ── Call Anthropic API ───────────────────────────────────────────────────────

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  let generatedContent;
  try {
    console.log(`[teacher-ai-builder] [${requestId}] Calling Anthropic API (${model_choice})`);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANTHROPIC_API_KEY}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model_choice,
        max_tokens: 20000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => '');
      console.error(`[teacher-ai-builder] [${requestId}] Anthropic API error: ${anthropicRes.status} ${errText}`);
      return jsonResponse(event, 502, { ok: false, error: 'AI generation failed' }, {}, requestId);
    }

    const anthropicData = await anthropicRes.json();
    const firstContent = anthropicData?.content?.[0];
    if (!firstContent || firstContent.type !== 'text' || !firstContent.text) {
      console.error(`[teacher-ai-builder] [${requestId}] Anthropic returned unexpected content shape`);
      return jsonResponse(event, 502, { ok: false, error: 'AI generation returned empty content' }, {}, requestId);
    }

    generatedContent = firstContent.text;
    console.log(`[teacher-ai-builder] [${requestId}] Generation complete — ${generatedContent.length} chars`);

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[teacher-ai-builder] [${requestId}] Anthropic request timed out`);
      return jsonResponse(event, 504, { ok: false, error: 'AI generation timed out' }, {}, requestId);
    }
    console.error(`[teacher-ai-builder] [${requestId}] Anthropic request failed: ${err.message}`);
    return jsonResponse(event, 502, { ok: false, error: 'AI generation failed' }, {}, requestId);
  }

  return jsonResponse(
    event,
    200,
    { ok: true, content: generatedContent },
    {},
    requestId
  );
};
