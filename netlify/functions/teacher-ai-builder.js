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
const { buildSystemPrompt } = require('./_lib/ai-builder-rules');

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
 * Sanitize source material for prompt inclusion.
 * Like sanitizeForPrompt but preserves newlines and tabs (important for chapter structure).
 */
function sanitizeSourceForPrompt(value, maxLen) {
  var len = maxLen || 40000;
  if (value === null || value === undefined) return '';
  // Normalize \r\n → \n, strip \r, remove control chars except \n and \t
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, len);
}

var GOAL_CONTEXT_BASE_FIELDS = [
  'id',
  'student_id',
  'code',
  'desc',
  'goal_area',
  'baseline',
  'mastery',
  'target',
  'status',
  'active',
  'class_context',
  'data_collector',
  'data_collector_email',
  'measurement_type',
  'notes',
  'case_manager',
  'version',
  'addressed_in_class',
  'individual_delivery',
].join(',');

var GOAL_CONTEXT_CONFLICT_FIELDS =
  GOAL_CONTEXT_BASE_FIELDS.replace(
    ',status,',
    ',criterion_conflict,status,'
  );

function isCriterionConflictSchemaError(result) {
  var data =
    result && result.data && typeof result.data === 'object'
      ? result.data
      : {};

  var code =
    data.code
      ? String(data.code)
      : '';

  var message =
    data.message
      ? String(data.message)
      : String(
          result && result.data
            ? result.data
            : ''
        );

  var detail =
    (code + ' ' + message).toLowerCase();

  return (
    detail.includes('criterion_conflict') &&
    (
      code === 'PGRST204' ||
      code === '42703' ||
      detail.includes('column') ||
      detail.includes('does not exist') ||
      detail.includes('schema')
    )
  );
}

async function fetchActiveGoalsForContext(requestId) {
  var querySuffix =
    '&active=eq.true&addressed_in_class=eq.true&order=code.asc';

  var enrichedRes =
    await rest(
      '/rest/v1/goals?select=' +
      GOAL_CONTEXT_CONFLICT_FIELDS +
      querySuffix
    );

  var enrichedData =
    await jsonRes(enrichedRes);

  if (
    enrichedData.ok === true &&
    Array.isArray(enrichedData.data)
  ) {
    return {
      ok: true,
      goals: enrichedData.data,
      criterionConflictAvailable: true,
      fallback: false,
    };
  }

  if (
    isCriterionConflictSchemaError(
      enrichedData
    )
  ) {
    console.warn(
      '[teacher-ai-builder] [' +
      requestId +
      '] criterion_conflict column unavailable; retrying goal context without that field'
    );

    var fallbackRes =
      await rest(
        '/rest/v1/goals?select=' +
        GOAL_CONTEXT_BASE_FIELDS +
        querySuffix
      );

    var fallbackData =
      await jsonRes(fallbackRes);

    if (
      fallbackData.ok === true &&
      Array.isArray(fallbackData.data)
    ) {
      return {
        ok: true,
        goals: fallbackData.data,
        criterionConflictAvailable: false,
        fallback: true,
      };
    }

    console.warn(
      '[teacher-ai-builder] [' +
      requestId +
      '] fallback goal query unavailable: ' +
      fallbackData.status
    );

    return {
      ok: false,
      goals: [],
      criterionConflictAvailable: false,
      fallback: true,
      status: fallbackData.status,
    };
  }

  console.warn(
    '[teacher-ai-builder] [' +
    requestId +
    '] goal query unavailable: ' +
    enrichedData.status
  );

  return {
    ok: false,
    goals: [],
    criterionConflictAvailable: false,
    fallback: false,
    status: enrichedData.status,
  };
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

  // Fetch active IEP goals with migration-safe criterion metadata.
  var goalResult =
    await fetchActiveGoalsForContext(
      requestId
    );

  var goals =
    goalResult.goals;

  var goalsAvailable =
    goalResult.ok === true;

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

  if (goalsAvailable === false) {
    lines.push(
      'GOAL DATA STATUS: unavailable — do not infer DESE-only status from missing goal rows.'
    );
    lines.push('');
  } else if (
    goalResult.criterionConflictAvailable === false
  ) {
    lines.push(
      'CRITERION CONFLICT METADATA STATUS: unavailable in the current schema — do not infer conflicts from differing criterion values.'
    );
    lines.push('');
  }

  students.forEach(function(s) {
    var className = classByStudentCode[s.code] || '(unknown class)';
    var studentGoals = goalsByStudentId[s.id] || [];

    lines.push(s.code + ' | ' + className + ' | Active');
    if (goalsAvailable === false) {
      lines.push(
        '  Goals: Unavailable — goal query failed; do not treat this student as DESE-only.'
      );
    } else if (studentGoals.length === 0) {
      lines.push('  Goals: None (DESE-only)');
    } else {
      studentGoals.forEach(function(g) {
        var baseline = g.baseline || 'N/A';
        var headerMastery = g.mastery || 'N/A';
        var goalTextTarget = g.target || 'N/A';
        var criterionConflict =
          g.criterion_conflict === true;

        var criterionParts = [
          'Header Mastery: ' + headerMastery,
          'Goal-Text Target: ' + goalTextTarget,
        ];

        if (criterionConflict) {
          criterionParts.push(
            'Criterion Status: Manual Criterion Review Required'
          );
        }

        var area = g.goal_area || 'N/A';
        var status = g.status || 'Open';
        var measurement = g.measurement_type || '';
        var classCtx = g.class_context || '';
        var collector = g.data_collector || '';
        var notes = g.notes || '';
        var inClass = g.addressed_in_class !== false ? 'Yes' : 'No';
        var individual = g.individual_delivery ? 'Yes' : 'No';
        var extra = [
          measurement ? 'Measurement: ' + measurement : '',
          classCtx ? 'Class: ' + classCtx : '',
          collector ? 'Data Collector: ' + collector : '',
          'In-Class: ' + inClass,
          'Individual: ' + individual,
          notes ? 'Notes: ' + sanitizeForPrompt(notes, 200) : '',
        ].filter(Boolean).join(' | ');
        lines.push(
          '  [' +
          g.code +
          '] ' +
          area +
          ' | Baseline: ' +
          baseline +
          ' | ' +
          criterionParts.join(' | ') +
          ' | ' +
          status +
          (extra ? ' | ' + extra : '')
        );
      });
    }
    lines.push('');
  });

  if (students.length === 0) {
    lines.push('(No active students found in database)');
  }

  return lines.join('\n');
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

  // Validate body size (200KB max — source alone can be ~40KB)
  var bodySizeCheck = validateBodySize(event.body, 200);
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
  var subject = sanitizeForPrompt(body.subject, 30) || 'ELA';
  var theme = sanitizeForPrompt(body.theme, 100);
  var source = sanitizeSourceForPrompt(body.source, 40000);
  var scope = sanitizeForPrompt(body.scope, 50);
  var model = sanitizeForPrompt(body.model, 50) || 'claude-sonnet-4-20250514';
  var presentationScope = sanitizeForPrompt(body.presentationScope, 20);
  var imageNames = Array.isArray(body.imageNames)
    ? body.imageNames.slice(0, 12).map(function(n) { return sanitizeForPrompt(n, 80); })
    : [];

  // Data Probe fields
  var probeStudent = sanitizeForPrompt(body.probeStudent, 10);
  var probeGoals = sanitizeForPrompt(body.probeGoals, 200);
  var probeCount = parseInt(body.probeCount, 10);
  if (isNaN(probeCount) || probeCount < 3) probeCount = 3;
  if (probeCount > 10) probeCount = 10;

  // Extra students (not in class roster)
  var extraStudents = [];
  if (Array.isArray(body.extraStudents)) {
    var seen = {};
    body.extraStudents.slice(0, 20).forEach(function(code) {
      var cleaned = String(code).toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 10);
      if (cleaned && !seen[cleaned]) {
        seen[cleaned] = true;
        extraStudents.push(cleaned);
      }
    });
  }

  var assignDays = sanitizeForPrompt(body.assignDays, 5);
  var assignDifficulty = sanitizeForPrompt(body.assignDifficulty, 30);
  var assignFormat = sanitizeForPrompt(body.assignFormat, 40);
  var assignInstructions = sanitizeForPrompt(body.assignInstructions, 500);
  var presSlides = sanitizeForPrompt(body.presSlides, 5);
  var presStyle = sanitizeForPrompt(body.presStyle, 30);
  var presAudience = sanitizeForPrompt(body.presAudience, 30);
  var presInstructions = sanitizeForPrompt(body.presInstructions, 500);

  // Validate model selection to only allow known Claude models
  var allowedModels = ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'];
  if (allowedModels.indexOf(model) === -1) {
    model = 'claude-sonnet-4-20250514';
  }

  if (!week) {
    return jsonResponse(event, 400, { ok: false, error: 'week is required' }, {}, requestId);
  }
  if (taskType === 'dataProbe') {
    if (!probeStudent) {
      return jsonResponse(event, 400, { ok: false, error: 'probeStudent is required for dataProbe' }, {}, requestId);
    }
  } else if (!source) {
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
    'SUBJECT: ' + subject,
    chapters ? 'CHAPTERS: ' + chapters : '',
    theme ? 'THEME: ' + theme : '',
    scope ? 'SCOPE: ' + scope : '',
  ].filter(Boolean);

  if ((taskType === 'presentations' || taskType === 'both') && presentationScope) {
    userLines.push('PRESENTATION SCOPE: ' + presentationScope);
  }

  // Assignment fields — only for assignments/both
  if (taskType === 'assignments' || taskType === 'both') {
    if (assignDays) userLines.push('ASSIGNMENT DAYS: ' + assignDays);
    if (assignDifficulty) userLines.push('ASSIGNMENT DIFFICULTY: ' + assignDifficulty);
    if (assignFormat) userLines.push('ASSIGNMENT FORMAT: ' + assignFormat);
    if (assignInstructions) userLines.push('ASSIGNMENT INSTRUCTIONS: ' + assignInstructions);
  }
  // Presentation fields — only for presentations/both
  if (taskType === 'presentations' || taskType === 'both') {
    if (presSlides) userLines.push('PRESENTATION SLIDES: ' + presSlides);
    if (presStyle) userLines.push('PRESENTATION STYLE: ' + presStyle);
    if (presAudience) userLines.push('PRESENTATION AUDIENCE: ' + presAudience);
    if (presInstructions) userLines.push('PRESENTATION INSTRUCTIONS: ' + presInstructions);
  }

  if (taskType === 'dataProbe') {
    userLines.push('TARGET STUDENT: ' + probeStudent);
    userLines.push('TARGET GOALS: ' + (probeGoals || 'auto-select'));
    userLines.push('QUESTION COUNT: ' + probeCount);
    userLines.push('TASK TYPE: dataProbe — Generate ' + probeCount + ' IEP-targeted MC/TF/FIB questions for ' + probeStudent + '. Focus on goals that need more data points. Include hints. Use the same format as regular assignment questions but do NOT include a Written Response.');
  }

  if (extraStudents.length > 0) {
    userLines.push('ADDITIONAL STUDENTS (not in class roster): ' + extraStudents.join(', '));
    userLines.push('Generate assignments for these students even if they do not appear in the live Supabase data. Use the GOAL_SKILL_MAP and WR_MAP from the system prompt for their formats. If a student code is not found in either the live data or the system prompt maps, generate DESE-only questions at complexity level 3.');
  }

  if (imageNames.length > 0) {
    userLines.push('BACKGROUND IMAGES (' + imageNames.length + '): ' + imageNames.join(', '));
  }

  if (body.libraryRef && body.libraryRef.title) {
    userLines.push('LIBRARY REFERENCE: ' + sanitizeForPrompt(body.libraryRef.title, 200));
  }

  if (source) {
    userLines.push('');
    userLines.push('SOURCE MATERIAL:');
    userLines.push(source);
  }

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

// Exported for unit testing only
exports._sanitizeForPrompt = sanitizeForPrompt;
exports._sanitizeSourceForPrompt = sanitizeSourceForPrompt;
exports._buildStudentContext = buildStudentContext;
