// AI Goal Trend Analysis endpoint — analyzes IEP goal trends across reporting periods
// via the Anthropic API (Claude).
// POST /.netlify/functions/teacher-ai-analyze-trends
// Auth: Requires teacher session cookie
// Body: { studentCode, studentName, goals, dateRange, dataPoints }
//   goals: [{ code, area, description, baseline, target, currentValue, trend, dataCount }]
//   dataPoints: [{ goalCode, date, value }] -- raw progress data points over time
//   dateRange: { start, end } -- the period being analyzed
// Returns: { ok: true, analysis: string }

console.log('[teacher-ai-analyze-trends] Module loaded');

var http = require('./_lib/http');
var auth = require('./_lib/auth');

var generateRequestId = http.generateRequestId;
var jsonResponse = http.jsonResponse;
var handleCorsPreFlight = http.handleCorsPreFlight;
var safeJsonParse = http.safeJsonParse;
var requireTeacher = auth.requireTeacher;

var SESSION_SECRET = process.env.SESSION_SECRET;

/**
 * Sanitize a string value for safe inclusion in a prompt.
 * Strips control characters and truncates to maxLen.
 */
function sanitizeField(value, maxLen) {
  var len = maxLen || 200;
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n\t]/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, len);
}

/**
 * Build the system prompt for the goal trend analyzer.
 * Adjusts tone based on audience: 'admin' (default) = professional IEP language;
 * 'parent' = accessible language focused on student progress.
 */
function buildTrendsSystemPrompt(audience) {
  var criterionGuidance =
    'Some goals may be explicitly marked Criterion Conflict: YES. For those goals, Header Mastery and Goal-Text Target are two competing official source values. ' +
    'Do not select or infer either value as the controlling criterion. Do not classify a conflicted goal as met, mastered, on track, at target, near mastery, at risk of missing target, or otherwise relative to either criterion. ' +
    'You may analyze raw direction of change, current performance, baseline, data count, and data-collection trend. Preserve both official criterion values and state Manual Criterion Review Required.';

  if (audience === 'parent') {
    return 'You are helping a teacher write a progress update for a parent or guardian about their child\'s IEP goals. ' +
      'Use clear, simple, encouraging language that a non-specialist can understand -- avoid jargon. ' +
      'Write 3-5 focused paragraphs. ' +
      'Paragraph 1: Give a general overview of how the student is doing across their goals -- what is going well and what still needs work. ' +
      'Paragraph 2: For ordinary goals, describe which goals are on track to meet their target and which may need extra support, using plain language. For goals marked Criterion Conflict: YES, describe only raw progress and trend plus the need for manual criterion review; do not classify them relative to either criterion. ' +
      'Paragraph 3: Note any connections between different goal areas if relevant (e.g., reading and writing improving together). ' +
      'Paragraph 4: Share what the teacher plans to do to help the student continue making progress. ' +
      'Optional Paragraph 5: Mention any data gaps or patterns worth noting in plain terms. ' +
      'Be specific but accessible. Do not fabricate data. ' +
      criterionGuidance + ' ' +
      'Output only the paragraphs -- no headers, no bullet points, no preamble or postamble. ' +
      'Separate each paragraph with a single blank line.';
  }
  return 'You are a professional IEP (Individualized Education Program) data analyst specializing in student progress trend analysis. ' +
    'Your role is to analyze goal progress data and identify meaningful patterns, risks, and instructional opportunities. ' +
    'Write 3-5 focused paragraphs using professional IEP team language. ' +
    'Paragraph 1: Provide an overall trend summary -- which goals are progressing well, which are plateauing, and which are regressing. ' +
    'Paragraph 2: For ordinary goals, identify which goals are on track to meet targets and which are at risk of missing targets, with specific data references (dates, values, rates of change). For goals marked Criterion Conflict: YES, report raw direction of change and evidence only; do not make a criterion-relative risk or success judgment. ' +
    'Paragraph 3: Note any correlations between goal areas (e.g., reading improvement coinciding with writing improvement). ' +
    'Paragraph 4: Suggest specific instructional adjustments for goals showing plateaus or regression. ' +
    'Optional Paragraph 5: Highlight any data collection gaps or patterns worth noting. ' +
    'Be specific with data references. Do not fabricate data. ' +
    criterionGuidance + ' ' +
    'Output only the analysis paragraphs -- no headers, no bullet points, no preamble or postamble. ' +
    'Separate each paragraph with a single blank line.';
}

/**
 * Build the user message payload for the Anthropic API.
 */
function buildTrendsUserMessage(studentName, studentCode, goals, dateRange, dataPoints) {
  var lines = [
    'Analyze the IEP goal trends for the following student or class.',
    '',
    'Student/Class: ' + sanitizeField(studentName, 100) + ' (' + sanitizeField(studentCode, 50) + ')',
  ];

  if (dateRange && (dateRange.start || dateRange.end)) {
    lines.push('Date Range: ' + sanitizeField(String(dateRange.start || ''), 20) + ' to ' + sanitizeField(String(dateRange.end || ''), 20));
  }

  lines.push('');
  lines.push('GOALS (' + goals.length + '):');

  goals.forEach(function(g, i) {
    lines.push('');
    lines.push('Goal ' + (i + 1) + ': [' + sanitizeField(g.code, 20) + '] ' + sanitizeField(g.area, 50));
    var criterionConflict = g && g.criterion_conflict === true;

    lines.push('  Description: ' + sanitizeField(g.description, 500));
    lines.push('  Baseline: ' + sanitizeField(g.baseline, 50));
    lines.push('  Criterion Conflict: ' + (criterionConflict ? 'YES' : 'NO'));

    if (criterionConflict) {
      lines.push('  Header Mastery: ' + sanitizeField(g.header_mastery || 'Not stated', 50));
      lines.push('  Goal-Text Target: ' + sanitizeField(g.goal_text_target || 'Not stated', 50));
      lines.push('  Criterion Status: Manual Criterion Review Required');
    } else {
      lines.push('  Target: ' + sanitizeField(g.target, 50));
    }

    lines.push('  Current Value: ' + sanitizeField(g.currentValue, 50));
    lines.push('  Data Points Collected: ' + sanitizeField(String(g.dataCount || 0), 10));
    lines.push('  Trend: ' + sanitizeField(g.trend, 30));
  });

  if (Array.isArray(dataPoints) && dataPoints.length > 0) {
    lines.push('');
    lines.push('RAW PROGRESS DATA (' + dataPoints.length + ' records):');
    dataPoints.slice(0, 100).forEach(function(dp) {
      lines.push('  [' + sanitizeField(dp.goalCode, 20) + '] ' + sanitizeField(dp.date, 20) + ': ' + sanitizeField(String(dp.value || ''), 30));
    });
  }

  lines.push('');
  lines.push('For any goal marked Criterion Conflict: YES, preserve Header Mastery and Goal-Text Target separately, do not decide which criterion controls, and do not make a target-relative success or risk judgment. State Manual Criterion Review Required.');
  lines.push('Analyze raw trends across all goals for patterns, risks supported by raw trend evidence, strengths, and instructional adjustments where needed.');

  return lines.join('\n');
}

/**
 * Validate that all required body fields are present and well-formed.
 * Returns { valid: true } or { valid: false, error: string }.
 */
function validateRequestBody(body) {
  if (!body.studentCode || typeof body.studentCode !== 'string' || !body.studentCode.trim()) {
    return { valid: false, error: 'studentCode is required' };
  }
  if (!body.studentName || typeof body.studentName !== 'string' || !body.studentName.trim()) {
    return { valid: false, error: 'studentName is required' };
  }
  if (!Array.isArray(body.goals) || body.goals.length === 0) {
    return { valid: false, error: 'goals must be a non-empty array' };
  }
  return { valid: true };
}

exports.handler = async function(event) {
  var requestId = generateRequestId();
  console.log('[teacher-ai-analyze-trends] [' + requestId + '] Request received - method: ' + event.httpMethod);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  // Verify teacher session
  var authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log('[teacher-ai-analyze-trends] [' + requestId + '] Unauthorized');
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log('[teacher-ai-analyze-trends] [' + requestId + '] Authorized user: ' + authResult.user.username);

  // Check Anthropic API key
  var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.warn('[teacher-ai-analyze-trends] [' + requestId + '] ANTHROPIC_API_KEY is not configured');
    return jsonResponse(event, 503, { ok: false, error: 'AI trend analysis not configured -- ANTHROPIC_API_KEY missing' }, {}, requestId);
  }

  // Parse request body
  var parsed = safeJsonParse(event.body);
  if (!parsed.ok) {
    return jsonResponse(event, 400, { ok: false, error: parsed.error || 'Invalid JSON body' }, {}, requestId);
  }
  var body = parsed.data;

  // Validate required fields
  var validation = validateRequestBody(body);
  if (!validation.valid) {
    return jsonResponse(event, 400, { ok: false, error: validation.error }, {}, requestId);
  }

  var studentCode = sanitizeField(body.studentCode, 50);
  var studentName = sanitizeField(body.studentName, 100);
  var goals = Array.isArray(body.goals) ? body.goals.slice(0, 50) : [];
  var dateRange = body.dateRange && typeof body.dateRange === 'object' ? body.dateRange : null;
  var dataPoints = Array.isArray(body.dataPoints) ? body.dataPoints.slice(0, 200) : [];
  var audience = (body.audience === 'parent' || body.audience === 'admin') ? body.audience : 'admin';

  // Build the prompt
  var systemPrompt = buildTrendsSystemPrompt(audience);
  var userMessage = buildTrendsUserMessage(studentName, studentCode, goals, dateRange, dataPoints);

  console.log('[teacher-ai-analyze-trends] [' + requestId + '] Calling Anthropic API for ' + studentCode + ' (' + goals.length + ' goals, ' + dataPoints.length + ' data points)');

  // Call Anthropic API with 120s timeout
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!anthropicRes.ok) {
      var errText = await anthropicRes.text().catch(function() { return ''; });
      console.error('[teacher-ai-analyze-trends] [' + requestId + '] Anthropic API error: ' + anthropicRes.status + ' ' + errText);
      return jsonResponse(event, 502, { ok: false, error: 'AI trend analysis failed' }, {}, requestId);
    }

    anthropicResult = await anthropicRes.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[teacher-ai-analyze-trends] [' + requestId + '] Anthropic request timed out');
      return jsonResponse(event, 504, { ok: false, error: 'AI trend analysis timed out' }, {}, requestId);
    }
    console.error('[teacher-ai-analyze-trends] [' + requestId + '] Anthropic request failed: ' + err.message);
    return jsonResponse(event, 502, { ok: false, error: 'AI trend analysis failed' }, {}, requestId);
  }

  // Extract analysis content from response
  var analysis = '';
  var contentBlocks = anthropicResult && anthropicResult.content;
  if (Array.isArray(contentBlocks)) {
    contentBlocks.forEach(function(block) {
      if (block.type === 'text') analysis += block.text;
    });
  }

  if (!analysis) {
    console.error('[teacher-ai-analyze-trends] [' + requestId + '] Anthropic returned empty content');
    return jsonResponse(event, 502, { ok: false, error: 'AI trend analysis returned empty content' }, {}, requestId);
  }

  console.log('[teacher-ai-analyze-trends] [' + requestId + '] Trend analysis complete -- ' + analysis.length + ' chars');

  return jsonResponse(event, 200, { ok: true, analysis: analysis }, {}, requestId);
};
