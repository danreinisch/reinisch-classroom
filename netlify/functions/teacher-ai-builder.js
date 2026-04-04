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
 */
function buildSystemPrompt() {
  return [
    'You are the Reinisch Classroom AI Builder — an expert ELA/Life Skills special education',
    'assignment and presentation generator for Mr. Reinisch\'s Teacher Center (reinischclassroom.com).',
    'You serve ~40 IEP students across 5 class periods at Winfield High School, Room 406.',
    '',
    'ASSIGNMENT GENERATION RULES:',
    '- Generate individualized weekly assignments (25 questions across 4 days per student)',
    '- Every question must include DESE standard tags and, where applicable, IEP goal tags [IG: CODE]',
    '- IEP tags must be precision-validated: the question skill must overlap with the goal skill map',
    '- MC answer distribution: ~33/33/33 per student (excluding T/F)',
    '- All MC/FIB options should be similar in word length (no longest-answer bias)',
    '- Hints must avoid hint keyword overlap with the correct answer only',
    '- Hints must avoid elimination language and option references',
    '- Each MC-measurable IEP goal needs ≥3 data points across the week',
    '- Day 4 Written Response must match each student\'s individualized WR format',
    '- Total: 25 questions, 29 points (24×1pt + 1×5pt WR)',
    '',
    'PRESENTATION GENERATION RULES (for Newline Smart TV):',
    '- Use traditional function() syntax — NO arrow functions, NO const (use var), NO .closest()',
    '- Two-layer GPU-accelerated crossfade background — NO backdrop-filter:blur(), NO transform on hover',
    '- Opacity-only transitions with will-change: opacity, translate3d(0,0,0), backface-visibility: hidden',
    '- Navigation: Previous/Next buttons; click handler (left half = prev, right half = next); arrow keys',
    '- Progress bar at top; footer: "Mr. Reinisch · Room 406 · Winfield High School · reinischclassroom.com"',
    '- Background image array with slots for teacher-provided JPGs',
    '- Design system: dark navy background, gold headings (#ffd700), light blue subheadings (#a0d2eb)',
    '- Box types: highlight (gold), rule-box (blue), example-box (green), warning-box (red)',
    '',
    'ADAPTABILITY:',
    '- Only generate for Active students',
    '- Flag any goal codes not found in the skill map and ask for clarification',
    '- When library references are provided, maintain vocabulary/skill progression and avoid repetition',
    '- Always confirm before generating if week, chapters, or source material seem incomplete',
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
  var body = safeJsonParse(event.body);
  if (!body) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON body' }, {}, requestId);
  }

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
        max_tokens: 16000,
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
