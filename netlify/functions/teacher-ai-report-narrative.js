// AI IEP Narrative endpoint — generates professional IEP progress narratives
// via the Anthropic API (Claude).
// POST /.netlify/functions/teacher-ai-report-narrative
// Auth: Requires teacher session cookie
// Body: { studentCode, studentName, goals, quarterLabel, scores, audience }
//   goals: [{ code, area, description, baseline, target, currentValue, trend, dataCount }]
//   scores: [{ title, score, date, type }]
//   audience: "admin" | "parent"
// Returns: { ok: true, narrative: string }

console.log('[teacher-ai-report-narrative] Module loaded');

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
 * Build the system prompt for the IEP narrative writer.
 */
function buildNarrativeSystemPrompt(audience) {
  var toneGuidance = audience === 'parent'
    ? 'Use clear, simple language that a parent or guardian can understand. Avoid jargon. Be warm, encouraging, and specific about the student\'s progress.'
    : 'Use professional, precise language suitable for educators, administrators, and IEP team members. Reference data points and progress metrics directly.';

  return 'You are a professional IEP (Individualized Education Program) progress narrative writer. ' +
    'Your role is to generate clear, accurate, data-driven progress narratives for IEP quarterly reports. ' +
    'Write exactly one paragraph per goal, in the order provided. ' +
    'For ordinary goals, each paragraph must reference the goal description, baseline, target, current performance, data count, and trend. ' +
    'Some goals may be explicitly marked Criterion Conflict: YES. For those goals, Header Mastery and Goal-Text Target are two competing official source values. ' +
    'Do not select or infer either value as the controlling criterion. Do not describe a conflicted goal as met, mastered, on track, at target, near mastery, or otherwise make a criterion-relative judgment. ' +
    'Instead, report raw current performance, baseline, data count, and trend, preserve both official criterion values, and state that Manual Criterion Review Required. ' +
    'Be specific about numbers and progress. Do not fabricate data. ' +
    toneGuidance + ' ' +
    'Output only the narrative paragraphs — no headers, no bullet points, no preamble or postamble. ' +
    'Separate each goal paragraph with a single blank line.';
}

/**
 * Build the user message payload for the Anthropic API.
 */
function buildNarrativeUserMessage(studentName, studentCode, goals, scores, quarterLabel, audience) {
  var lines = [
    'Generate an IEP progress narrative for the following student.',
    '',
    'Student: ' + sanitizeField(studentName, 100) + ' (' + sanitizeField(studentCode, 20) + ')',
    'Reporting Period: ' + sanitizeField(quarterLabel, 50),
    'Audience: ' + (audience === 'parent' ? 'Parent/Guardian' : 'Administrator/IEP Team'),
    '',
    'GOALS (' + goals.length + '):',
  ];

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

  if (Array.isArray(scores) && scores.length > 0) {
    lines.push('');
    lines.push('RECENT ASSIGNMENT SCORES (' + scores.length + '):');
    scores.slice(0, 10).forEach(function(s) {
      lines.push('  - ' + sanitizeField(s.title, 100) + ': ' + sanitizeField(String(s.score || ''), 20) + (s.date ? ' (' + sanitizeField(s.date, 20) + ')' : '') + (s.type ? ' [' + sanitizeField(s.type, 30) + ']' : ''));
    });
  }

  lines.push('');
  lines.push('For any goal marked Criterion Conflict: YES, preserve Header Mastery and Goal-Text Target exactly as separate values, make no criterion-relative status judgment, and state Manual Criterion Review Required.');
  lines.push('Write one narrative paragraph per goal in the order listed above. Separate paragraphs with a blank line.');

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
  console.log('[teacher-ai-report-narrative] [' + requestId + '] Request received - method: ' + event.httpMethod);

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
    console.log('[teacher-ai-report-narrative] [' + requestId + '] Unauthorized');
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log('[teacher-ai-report-narrative] [' + requestId + '] Authorized user: ' + authResult.user.username);

  // Check Anthropic API key
  var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.warn('[teacher-ai-report-narrative] [' + requestId + '] ANTHROPIC_API_KEY is not configured');
    return jsonResponse(event, 503, { ok: false, error: 'AI narrative not configured — ANTHROPIC_API_KEY missing' }, {}, requestId);
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
  var scores = Array.isArray(body.scores) ? body.scores.slice(0, 20) : [];

  // Build the prompt
  var systemPrompt = buildNarrativeSystemPrompt(audience);
  var userMessage = buildNarrativeUserMessage(studentName, studentCode, goals, scores, quarterLabel, audience);

  console.log('[teacher-ai-report-narrative] [' + requestId + '] Calling Anthropic API for ' + studentCode + ' (' + goals.length + ' goals, audience: ' + audience + ')');

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
      console.error('[teacher-ai-report-narrative] [' + requestId + '] Anthropic API error: ' + anthropicRes.status + ' ' + errText);
      return jsonResponse(event, 502, { ok: false, error: 'AI narrative generation failed' }, {}, requestId);
    }

    anthropicResult = await anthropicRes.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[teacher-ai-report-narrative] [' + requestId + '] Anthropic request timed out');
      return jsonResponse(event, 504, { ok: false, error: 'AI narrative generation timed out' }, {}, requestId);
    }
    console.error('[teacher-ai-report-narrative] [' + requestId + '] Anthropic request failed: ' + err.message);
    return jsonResponse(event, 502, { ok: false, error: 'AI narrative generation failed' }, {}, requestId);
  }

  // Extract narrative content from response
  var narrative = '';
  var contentBlocks = anthropicResult && anthropicResult.content;
  if (Array.isArray(contentBlocks)) {
    contentBlocks.forEach(function(block) {
      if (block.type === 'text') narrative += block.text;
    });
  }

  if (!narrative) {
    console.error('[teacher-ai-report-narrative] [' + requestId + '] Anthropic returned empty content');
    return jsonResponse(event, 502, { ok: false, error: 'AI narrative generation returned empty content' }, {}, requestId);
  }

  console.log('[teacher-ai-report-narrative] [' + requestId + '] Narrative generation complete — ' + narrative.length + ' chars');

  return jsonResponse(event, 200, { ok: true, narrative: narrative }, {}, requestId);
};
