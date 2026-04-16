// AI Executive Summary endpoint — generates IEP meeting cover page summaries
// via the Anthropic API (Claude).
// POST /.netlify/functions/teacher-ai-report-summary
// Auth: Requires teacher session cookie
// Body: { studentCode, studentName, goals, quarterLabel, assignmentSummary, audience }
//   goals: [{ code, area, description, currentValue, trend, dataCount }]
//   assignmentSummary: { total, completed, averageScore, completionRate }
//   audience: "admin" | "parent"
// Returns: { ok: true, summary: string }

console.log('[teacher-ai-report-summary] Module loaded');

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
 * Build the system prompt for the executive summary writer.
 */
function buildSummarySystemPrompt(audience) {
  var toneGuidance = audience === 'parent'
    ? 'Use clear, simple language that a parent or guardian can understand. Avoid educational jargon. Be warm, encouraging, and emphasize the student\'s strengths and positive growth. Avoid technical acronyms without explanation.'
    : 'Use professional, precise language suitable for IEP team members, administrators, and educators. Reference specific data points, goal codes, and DESE standard codes directly where relevant.';

  return 'You are a professional IEP (Individualized Education Program) meeting facilitator writing an executive summary for an IEP meeting cover page. ' +
    'Write exactly 2-3 focused paragraphs. ' +
    'Paragraph 1: Provide an overall progress overview — highlight the student\'s key strengths and growth areas during the reporting period, referencing goal areas broadly. ' +
    'Paragraph 2: Provide goal-by-goal highlights — identify which goals are on track or exceeding expectations and which goals need additional attention or intervention. ' +
    'Paragraph 3: Provide actionable recommendations — ' + (audience === 'parent'
      ? 'offer encouraging next steps and practical ways the family can support continued progress at home.'
      : 'outline specific recommendations for the IEP team, including data-driven adjustments to goals, services, or supports.') + ' ' +
    'Be professional, data-driven, and concise. Do not fabricate data. ' +
    toneGuidance + ' ' +
    'Output only the three paragraphs — no headers, no bullet points, no preamble or postamble. ' +
    'Separate each paragraph with a single blank line.';
}

/**
 * Build the user message payload for the Anthropic API.
 */
function buildSummaryUserMessage(studentName, studentCode, goals, quarterLabel, assignmentSummary, audience) {
  var lines = [
    'Generate an executive summary for an IEP meeting cover page for the following student.',
    '',
    'Student: ' + sanitizeField(studentName, 100) + ' (' + sanitizeField(studentCode, 20) + ')',
    'Reporting Period: ' + sanitizeField(quarterLabel, 50),
    'Audience: ' + (audience === 'parent' ? 'Parent/Guardian' : 'Administrator/IEP Team'),
    '',
    'IEP GOALS (' + goals.length + '):',
  ];

  goals.forEach(function(g, i) {
    lines.push('');
    lines.push('Goal ' + (i + 1) + ': [' + sanitizeField(g.code, 20) + '] ' + sanitizeField(g.area, 50));
    lines.push('  Description: ' + sanitizeField(g.description, 500));
    lines.push('  Current Value: ' + sanitizeField(g.currentValue, 50));
    lines.push('  Data Points Collected: ' + sanitizeField(String(g.dataCount || 0), 10));
    lines.push('  Trend: ' + sanitizeField(g.trend, 30));
  });

  if (assignmentSummary) {
    lines.push('');
    lines.push('ASSIGNMENT SUMMARY:');
    lines.push('  Total Assignments: ' + sanitizeField(String(assignmentSummary.total || 0), 10));
    lines.push('  Completed: ' + sanitizeField(String(assignmentSummary.completed || 0), 10));
    lines.push('  Completion Rate: ' + sanitizeField(String(assignmentSummary.completionRate || '0%'), 10));
    if (assignmentSummary.averageScore != null) {
      lines.push('  Average Score: ' + sanitizeField(String(assignmentSummary.averageScore), 10) + '%');
    }
  }

  lines.push('');
  lines.push('Write a 2-3 paragraph executive summary covering overall progress, goal highlights, and recommendations.');

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
  if (!body.quarterLabel || typeof body.quarterLabel !== 'string' || !body.quarterLabel.trim()) {
    return { valid: false, error: 'quarterLabel is required' };
  }
  var audience = body.audience;
  if (audience !== 'admin' && audience !== 'parent') {
    return { valid: false, error: 'audience must be "admin" or "parent"' };
  }
  return { valid: true };
}

exports.handler = async function(event) {
  var requestId = generateRequestId();
  console.log('[teacher-ai-report-summary] [' + requestId + '] Request received - method: ' + event.httpMethod);

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
    console.log('[teacher-ai-report-summary] [' + requestId + '] Unauthorized');
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log('[teacher-ai-report-summary] [' + requestId + '] Authorized user: ' + authResult.user.username);

  // Check Anthropic API key
  var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.warn('[teacher-ai-report-summary] [' + requestId + '] ANTHROPIC_API_KEY is not configured');
    return jsonResponse(event, 503, { ok: false, error: 'AI summary not configured — ANTHROPIC_API_KEY missing' }, {}, requestId);
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

  var studentCode = sanitizeField(body.studentCode, 20);
  var studentName = sanitizeField(body.studentName, 100);
  var quarterLabel = sanitizeField(body.quarterLabel, 50);
  var audience = body.audience;
  var goals = Array.isArray(body.goals) ? body.goals.slice(0, 20) : [];
  var assignmentSummary = body.assignmentSummary && typeof body.assignmentSummary === 'object'
    ? body.assignmentSummary
    : null;

  // Build the prompt
  var systemPrompt = buildSummarySystemPrompt(audience);
  var userMessage = buildSummaryUserMessage(studentName, studentCode, goals, quarterLabel, assignmentSummary, audience);

  console.log('[teacher-ai-report-summary] [' + requestId + '] Calling Anthropic API for ' + studentCode + ' (' + goals.length + ' goals, audience: ' + audience + ')');

  // Call Anthropic API with timeout
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 24000);

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
      console.error('[teacher-ai-report-summary] [' + requestId + '] Anthropic API error: ' + anthropicRes.status + ' ' + errText);
      return jsonResponse(event, 502, { ok: false, error: 'AI summary generation failed' }, {}, requestId);
    }

    anthropicResult = await anthropicRes.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[teacher-ai-report-summary] [' + requestId + '] Anthropic request timed out');
      return jsonResponse(event, 504, { ok: false, error: 'AI summary generation timed out' }, {}, requestId);
    }
    console.error('[teacher-ai-report-summary] [' + requestId + '] Anthropic request failed: ' + err.message);
    return jsonResponse(event, 502, { ok: false, error: 'AI summary generation failed' }, {}, requestId);
  }

  // Extract summary content from response
  var summary = '';
  var contentBlocks = anthropicResult && anthropicResult.content;
  if (Array.isArray(contentBlocks)) {
    contentBlocks.forEach(function(block) {
      if (block.type === 'text') summary += block.text;
    });
  }

  if (!summary) {
    console.error('[teacher-ai-report-summary] [' + requestId + '] Anthropic returned empty content');
    return jsonResponse(event, 502, { ok: false, error: 'AI summary generation returned empty content' }, {}, requestId);
  }

  console.log('[teacher-ai-report-summary] [' + requestId + '] Summary generation complete — ' + summary.length + ' chars');

  return jsonResponse(event, 200, { ok: true, summary: summary }, {}, requestId);
};
