// AI Report Narrative endpoint — generates professional IEP progress narratives
// for a student's goals using the Anthropic API (Claude).
// POST /.netlify/functions/teacher-ai-report-narrative
// Auth: Requires teacher session cookie
// Body: { student_code, student_name, goals, quarter_label, data_points, scores, trend_data, model? }
// Returns: { ok: true, narratives: [{ goal_code, narrative_text }] }

console.log('[teacher-ai-report-narrative] Module loaded');

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');

const { SESSION_SECRET } = process.env;

// Simple in-memory call counter for rate-limit logging (non-blocking)
let _callCount = 0;
let _callWindowStart = Date.now();
const RATE_LOG_WINDOW_MS = 60 * 1000;
const RATE_LOG_THRESHOLD = 10;

function _trackCallRate(requestId) {
  const now = Date.now();
  if (now - _callWindowStart > RATE_LOG_WINDOW_MS) {
    _callCount = 0;
    _callWindowStart = now;
  }
  _callCount++;
  if (_callCount > RATE_LOG_THRESHOLD) {
    console.warn(
      '[teacher-ai-report-narrative] [' + requestId + '] Rate warning: ' +
      _callCount + ' calls in the last 60 seconds'
    );
  }
}

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
 * Build the system prompt for the IEP narrative generation assistant.
 */
function buildNarrativeSystemPrompt() {
  return [
    'You are a professional special education IEP report writer.',
    'Your task is to generate written progress narratives for IEP Quarterly Progress Reports.',
    '',
    'RULES:',
    '- Write in professional third-person IEP language (e.g., "The student demonstrated...")',
    '- Be specific and data-driven — cite exact percentages, data point counts, and trend directions',
    '- Include DESE standard references (e.g., DESE ELA.1.A) where provided in the goal context',
    '- Generate exactly one paragraph per goal',
    '- Clearly note whether each goal is "Met", "Progressing", or "Not Yet Meeting" targets',
    '- Avoid subjective language — stick to measurable, observable data',
    '- Use the student code (not name) in narratives to protect student privacy',
    '- Reference specific data counts: "across N data collection opportunities"',
    '- When trend is improving, note the growth direction',
    '- When trend is declining, note the concern and recommend increased support',
    '- Keep each narrative paragraph to 3-5 sentences',
    '',
    'OUTPUT FORMAT:',
    'Return a JSON array where each element is an object with:',
    '  { "goal_code": "<goal code>", "narrative_text": "<narrative paragraph>" }',
    'Return ONLY the JSON array, no other text or markdown fencing.',
  ].join('\n');
}

/**
 * Build the user message for narrative generation.
 */
function buildNarrativeUserMessage(params) {
  var studentCode = params.studentCode;
  var goals = params.goals;
  var quarterLabel = params.quarterLabel;
  var scores = params.scores;
  var trendData = params.trendData;

  var lines = [
    'STUDENT CODE: ' + studentCode,
    'REPORTING PERIOD: ' + quarterLabel,
    '',
    'IEP GOALS (' + goals.length + ' total):',
  ];

  goals.forEach(function(goal, idx) {
    lines.push('');
    lines.push('Goal ' + (idx + 1) + ':');
    lines.push('  Code: ' + goal.code);
    lines.push('  Area: ' + (goal.area || 'N/A'));
    lines.push('  Description: ' + goal.description);
    lines.push('  Baseline: ' + (goal.baseline || 'N/A'));
    lines.push('  Target/Mastery: ' + (goal.target || 'N/A'));
    lines.push('  Current Value: ' + (goal.current_value != null ? goal.current_value : 'No Data'));
    lines.push('  Trend Direction: ' + (goal.trend || 'Unknown'));
    lines.push('  Data Points Collected: ' + (goal.data_count || 0));
  });

  if (scores && scores.length > 0) {
    lines.push('');
    lines.push('RECENT ASSIGNMENT SCORES (' + scores.length + ' records):');
    scores.slice(0, 10).forEach(function(s) {
      lines.push('  ' + s.assignment_title + ' | Score: ' + s.score + '% | Date: ' + s.date + (s.type ? ' | Type: ' + s.type : ''));
    });
  }

  if (trendData) {
    lines.push('');
    lines.push('OVERALL TREND DATA:');
    if (trendData.overall_trend) lines.push('  Overall Trend: ' + trendData.overall_trend);
    if (trendData.improvement_pct != null) lines.push('  Improvement %: ' + trendData.improvement_pct);
  }

  lines.push('');
  lines.push('Please generate one professional IEP progress narrative paragraph per goal.');
  lines.push('Return a JSON array as specified in your instructions.');

  return lines.join('\n');
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
  var auth = requireTeacher(event, SESSION_SECRET);
  if (!auth.ok) {
    console.log('[teacher-ai-report-narrative] [' + requestId + '] Unauthorized');
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log('[teacher-ai-report-narrative] [' + requestId + '] Authorized user: ' + auth.user.username);

  // Check Anthropic API key
  var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.warn('[teacher-ai-report-narrative] [' + requestId + '] ANTHROPIC_API_KEY is not configured');
    return jsonResponse(event, 503, { ok: false, error: 'AI narrative not configured — ANTHROPIC_API_KEY missing' }, {}, requestId);
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

  // Validate required inputs
  var studentCode = sanitizeForPrompt(body.student_code, 20);
  if (!studentCode) {
    return jsonResponse(event, 400, { ok: false, error: 'student_code is required' }, {}, requestId);
  }

  if (!Array.isArray(body.goals) || body.goals.length === 0) {
    return jsonResponse(event, 400, { ok: false, error: 'goals array is required and must not be empty' }, {}, requestId);
  }

  // Sanitize all goal fields
  var goals = body.goals.slice(0, 30).map(function(g) {
    return {
      code: sanitizeForPrompt(g.code, 20),
      area: sanitizeForPrompt(g.area, 100),
      description: sanitizeForPrompt(g.description, 500),
      baseline: sanitizeForPrompt(g.baseline, 50),
      target: sanitizeForPrompt(g.target, 50),
      current_value: g.current_value != null ? sanitizeForPrompt(String(g.current_value), 50) : null,
      trend: sanitizeForPrompt(g.trend, 30),
      data_count: parseInt(g.data_count, 10) || 0,
    };
  });

  var quarterLabel = sanitizeForPrompt(body.quarter_label, 20) || 'this quarter';

  var scores = [];
  if (Array.isArray(body.scores)) {
    scores = body.scores.slice(0, 20).map(function(s) {
      return {
        assignment_title: sanitizeForPrompt(s.assignment_title, 100),
        score: sanitizeForPrompt(String(s.score != null ? s.score : ''), 10),
        date: sanitizeForPrompt(s.date, 20),
        type: sanitizeForPrompt(s.type, 30),
      };
    });
  }

  var trendData = null;
  if (body.trend_data && typeof body.trend_data === 'object') {
    trendData = {
      overall_trend: sanitizeForPrompt(body.trend_data.overall_trend, 30),
      improvement_pct: body.trend_data.improvement_pct != null
        ? sanitizeForPrompt(String(body.trend_data.improvement_pct), 10)
        : null,
    };
  }

  // Validate model selection to only allow known Claude models
  var model = sanitizeForPrompt(body.model, 50) || 'claude-sonnet-4-20250514';
  var allowedModels = ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'];
  if (allowedModels.indexOf(model) === -1) {
    model = 'claude-sonnet-4-20250514';
  }

  // Track call rate (non-blocking warning only)
  _trackCallRate(requestId);

  // Build the messages
  var systemPrompt = buildNarrativeSystemPrompt();
  var userMessage = buildNarrativeUserMessage({
    studentCode: studentCode,
    goals: goals,
    quarterLabel: quarterLabel,
    scores: scores,
    trendData: trendData,
  });

  console.log('[teacher-ai-report-narrative] [' + requestId + '] Calling Anthropic API with model: ' + model + ' for ' + goals.length + ' goals');

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
        max_tokens: 8192,
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
      return jsonResponse(event, 502, { ok: false, error: 'AI generation failed' }, {}, requestId);
    }

    anthropicResult = await anthropicRes.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[teacher-ai-report-narrative] [' + requestId + '] Anthropic request timed out');
      return jsonResponse(event, 504, { ok: false, error: 'AI generation timed out' }, {}, requestId);
    }
    console.error('[teacher-ai-report-narrative] [' + requestId + '] Anthropic request failed: ' + err.message);
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
    console.error('[teacher-ai-report-narrative] [' + requestId + '] Anthropic returned empty content');
    return jsonResponse(event, 502, { ok: false, error: 'AI generation returned empty content' }, {}, requestId);
  }

  // Parse JSON response from Claude
  var narratives;
  try {
    // Strip markdown code fences if present
    var jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    }
    narratives = JSON.parse(jsonStr);
    if (!Array.isArray(narratives)) {
      throw new Error('Expected JSON array');
    }
  } catch (parseErr) {
    console.error('[teacher-ai-report-narrative] [' + requestId + '] Failed to parse Claude JSON response: ' + parseErr.message);
    return jsonResponse(event, 502, { ok: false, error: 'AI returned unparseable content' }, {}, requestId);
  }

  // Validate and sanitize narrative output
  var validatedNarratives = narratives
    .filter(function(n) { return n && typeof n === 'object' && n.goal_code && n.narrative_text; })
    .map(function(n) {
      return {
        goal_code: String(n.goal_code).slice(0, 50),
        narrative_text: String(n.narrative_text).slice(0, 2000),
      };
    });

  console.log('[teacher-ai-report-narrative] [' + requestId + '] Generation complete — ' + validatedNarratives.length + ' narratives');

  return jsonResponse(event, 200, { ok: true, narratives: validatedNarratives }, {}, requestId);
};

// Exported for unit testing only
exports._sanitizeForPrompt = sanitizeForPrompt;
exports._buildNarrativeSystemPrompt = buildNarrativeSystemPrompt;
exports._buildNarrativeUserMessage = buildNarrativeUserMessage;
