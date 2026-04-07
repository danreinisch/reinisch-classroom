// AI Report Narrative endpoint — generates IEP quarterly progress narratives
// for individual students via the Anthropic API (Claude).
// POST /.netlify/functions/teacher-ai-report-narrative
// Auth: Requires teacher session cookie
// Body: { studentCode, studentName, goals, assignments, quarter, audience, model? }
// Returns: { ok: true, narrative: string }

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

/**
 * Sanitize a string for safe inclusion in a prompt.
 * Truncates long strings and removes control characters (including newlines and tabs).
 */
function sanitizeForPrompt(value, maxLen) {
  var len = maxLen || 500;
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\x00-\x1F\x7F]/g, ' ').slice(0, len);
}

/**
 * Build the user message for the Anthropic API call.
 * Structures the student's IEP goal data, progress history, and assignment
 * performance into a clear prompt that produces professional narratives.
 */
function buildNarrativePrompt(params) {
  var studentCode = params.studentCode;
  var studentName = params.studentName;
  var goals = params.goals;
  var assignments = params.assignments;
  var quarter = params.quarter;
  var audience = params.audience;

  var isParent = audience === 'parent';

  var lines = [
    'You are an experienced special education teacher writing IEP quarterly progress narratives.',
    '',
    isParent
      ? 'Audience: PARENT — Use clear, accessible language. Avoid educational jargon. Emphasize the student\'s efforts and growth. Be honest about challenges while focusing on positives and next steps. Write in a warm, supportive tone.'
      : 'Audience: ADMINISTRATOR — Use professional special education terminology. Include specific data references (percentages, data point counts). Reference DESE standard codes where provided. Be precise and data-driven.',
    '',
    'Instructions:',
    '- Write one paragraph per goal (approximately 3-5 sentences each).',
    '- Each paragraph should describe the student\'s current performance, progress trend, and next steps.',
    '- Write in plain text only — no Markdown, no bullet points, no headers.',
    '- Do not include any personally identifiable information beyond the student code and first name.',
    '- Do not make up data. If data is missing or sparse, acknowledge it honestly.',
    '',
    'Student: ' + studentName + ' (' + studentCode + ')',
    'Reporting Period: ' + quarter,
    '',
    '=== IEP GOALS ===',
    '',
  ];

  goals.forEach(function(goal, idx) {
    lines.push('Goal ' + (idx + 1) + ': ' + goal.code);
    lines.push('  Area: ' + (goal.area || 'N/A'));
    lines.push('  Description: ' + goal.description);
    lines.push('  Baseline: ' + (goal.baseline || 'N/A'));
    lines.push('  Target: ' + (goal.target || 'N/A'));
    lines.push('  Current Average: ' + (goal.currentValue != null ? goal.currentValue : 'No data'));
    lines.push('  Trend: ' + (goal.trend || 'neutral'));
    if (Array.isArray(goal.dataPoints) && goal.dataPoints.length > 0) {
      var dpCount = goal.dataPoints.length;
      var dpSummary = goal.dataPoints.slice(-6).map(function(dp) {
        return dp.date + ': ' + dp.value;
      }).join(', ');
      lines.push('  Data Points (' + dpCount + ' total, most recent 6): ' + dpSummary);
    } else {
      lines.push('  Data Points: None collected this quarter');
    }
    lines.push('');
  });

  if (assignments) {
    lines.push('=== ASSIGNMENT PERFORMANCE ===');
    lines.push('Total Assigned: ' + (assignments.total || 0));
    lines.push('Completed: ' + (assignments.completed || 0));
    lines.push(
      'Average Score: ' +
        (assignments.averageScore != null ? assignments.averageScore + '%' : 'N/A')
    );
    lines.push('');
  }

  lines.push('=== YOUR TASK ===');
  lines.push(
    'Write one narrative paragraph for EACH goal listed above (' +
      goals.length +
      ' paragraph' +
      (goals.length !== 1 ? 's' : '') +
      ' total).'
  );
  lines.push(
    'Separate paragraphs with a blank line. Do not use any labels, headers, or formatting.'
  );
  if (!isParent) {
    lines.push(
      'For each goal, reference the specific DESE standard code (e.g., "' + (goals[0] && goals[0].code ? goals[0].code : 'GOAL.CODE') + '"), the data point count, and percentage values where available.'
    );
  }

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
    return jsonResponse(event, 503, { ok: false, error: 'AI narrative generation not configured — ANTHROPIC_API_KEY missing' }, {}, requestId);
  }

  // Validate body size (200KB max)
  var bodySizeCheck = validateBodySize(event.body, 200);
  if (!bodySizeCheck.valid) {
    return jsonResponse(event, 413, { ok: false, error: bodySizeCheck.error }, {}, requestId);
  }

  // Validate Content-Type
  var contentType = (event.headers && (event.headers['content-type'] || event.headers['Content-Type'])) || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse(event, 415, { ok: false, error: 'Content-Type must be application/json' }, {}, requestId);
  }

  // Parse request body
  var parsed = safeJsonParse(event.body);
  if (!parsed.ok) {
    return jsonResponse(event, 400, { ok: false, error: parsed.error || 'Invalid JSON body' }, {}, requestId);
  }
  var body = parsed.data;

  // Validate required fields
  var studentCode = sanitizeForPrompt(body.studentCode, 20);
  if (!studentCode) {
    return jsonResponse(event, 400, { ok: false, error: 'studentCode is required' }, {}, requestId);
  }

  if (!Array.isArray(body.goals) || body.goals.length === 0) {
    return jsonResponse(event, 400, { ok: false, error: 'goals array is required and must not be empty' }, {}, requestId);
  }

  // Sanitize and validate goal objects (limit to 20 goals max)
  var goals = body.goals.slice(0, 20).map(function(g) {
    return {
      code: sanitizeForPrompt(g.code, 30),
      description: sanitizeForPrompt(g.description, 300),
      area: sanitizeForPrompt(g.area, 100),
      baseline: sanitizeForPrompt(g.baseline, 50),
      target: sanitizeForPrompt(g.target, 50),
      currentValue: g.currentValue != null ? sanitizeForPrompt(String(g.currentValue), 30) : null,
      trend: sanitizeForPrompt(g.trend, 20),
      dataPoints: Array.isArray(g.dataPoints)
        ? g.dataPoints.slice(0, 50).map(function(dp) {
            return {
              date: sanitizeForPrompt(dp.date, 20),
              value: sanitizeForPrompt(String(dp.value), 20),
            };
          })
        : [],
    };
  });

  var studentName = sanitizeForPrompt(body.studentName, 50) || studentCode;
  // Only use first name/code to avoid PII in the prompt
  var firstName = studentName.split(' ')[0] || studentCode;

  var quarter = sanitizeForPrompt(body.quarter, 30) || 'this quarter';
  var audience = body.audience === 'parent' ? 'parent' : 'admin';

  // Sanitize assignments summary
  var assignments = null;
  if (body.assignments && typeof body.assignments === 'object') {
    var total = parseInt(body.assignments.total, 10);
    var completed = parseInt(body.assignments.completed, 10);
    var avgScore = parseFloat(body.assignments.averageScore);
    assignments = {
      total: isNaN(total) ? 0 : total,
      completed: isNaN(completed) ? 0 : completed,
      averageScore: isNaN(avgScore) ? null : Math.round(avgScore * 10) / 10,
    };
  }

  // Validate model selection (default to claude-sonnet-4-20250514)
  var model = sanitizeForPrompt(body.model, 50) || 'claude-sonnet-4-20250514';
  var allowedModels = ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'];
  if (allowedModels.indexOf(model) === -1) {
    model = 'claude-sonnet-4-20250514';
  }

  console.log('[teacher-ai-report-narrative] [' + requestId + '] Generating narrative for student: ' + studentCode + ', goals: ' + goals.length + ', audience: ' + audience + ', model: ' + model);

  // Build the prompt
  var userMessage = buildNarrativePrompt({
    studentCode: studentCode,
    studentName: firstName,
    goals: goals,
    assignments: assignments,
    quarter: quarter,
    audience: audience,
  });

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
        max_tokens: 4096,
        system: 'You are an experienced special education teacher. Write clear, professional IEP progress narratives based on the data provided. Use plain text only — no Markdown formatting, no bullet points, no headers.',
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
      return jsonResponse(event, 500, { ok: false, error: 'Narrative generation failed' }, {}, requestId);
    }

    anthropicResult = await anthropicRes.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[teacher-ai-report-narrative] [' + requestId + '] Anthropic request timed out');
      return jsonResponse(event, 504, { ok: false, error: 'Narrative generation timed out' }, {}, requestId);
    }
    console.error('[teacher-ai-report-narrative] [' + requestId + '] Anthropic request failed: ' + err.message);
    return jsonResponse(event, 500, { ok: false, error: 'Narrative generation failed' }, {}, requestId);
  }

  // Extract content from response
  var narrative = '';
  var contentBlocks = anthropicResult && anthropicResult.content;
  if (Array.isArray(contentBlocks)) {
    contentBlocks.forEach(function(block) {
      if (block.type === 'text') narrative += block.text;
    });
  }

  if (!narrative) {
    console.error('[teacher-ai-report-narrative] [' + requestId + '] Anthropic returned empty content');
    return jsonResponse(event, 500, { ok: false, error: 'Narrative generation returned empty content' }, {}, requestId);
  }

  console.log('[teacher-ai-report-narrative] [' + requestId + '] Narrative generation complete — ' + narrative.length + ' chars');

  return jsonResponse(event, 200, { ok: true, narrative: narrative }, {}, requestId);
};

// Exported for unit testing only
exports._sanitizeForPrompt = sanitizeForPrompt;
exports._buildNarrativePrompt = buildNarrativePrompt;
