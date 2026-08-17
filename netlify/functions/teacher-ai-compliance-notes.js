// AI Compliance Notes endpoint -- drafts IEP compliance documentation notes
// via the Anthropic API (Claude).
// POST /.netlify/functions/teacher-ai-compliance-notes
// Auth: Requires teacher session cookie
// Body: { studentCode, studentName, goals, complianceData, quarterLabel }
//   goals: [{ code, area, description, baseline, target, currentValue, trend, dataCount }]
//   complianceData: { totalAssignments, completedAssignments, dataCollectionFrequency, missedDataPoints, accommodationsProvided }
//   quarterLabel: e.g. "Q4 2025-2026"
// Returns: { ok: true, notes: string }

console.log('[teacher-ai-compliance-notes] Module loaded');

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
 * Build the system prompt for the compliance notes writer.
 */
function buildComplianceSystemPrompt() {
  var criterionGuidance =
    'Some goals may be explicitly marked Criterion Conflict: YES. For those goals, Header Mastery and Goal-Text Target are two competing official source values. ' +
    'Do not select or infer either value as the controlling criterion. Do not classify a conflicted goal as met, mastered, on track, at target, near mastery, below target, or otherwise relative to either criterion. ' +
    'Report raw current performance, baseline, data count, and trend, preserve both source values, and state Manual Criterion Review Required. ' +
    'The existence of a criterion conflict by itself is not evidence of a service-delivery or data-collection compliance failure.';

  return 'You are a professional IEP (Individualized Education Program) compliance coordinator drafting formal compliance documentation notes for an IEP file. ' +
    'Your role is to produce structured, audit-ready compliance notes that document progress monitoring activities, data collection practices, and service delivery. ' +
    'Use formal compliance language suitable for IEP files and regulatory audits. ' +
    'Structure your output as numbered items with clear headings, covering: ' +
    '1. Progress Monitoring Statement -- document that progress monitoring was conducted per the IEP schedule. ' +
    '2. Data Collection Summary -- note frequency, total data points collected, and any gaps. ' +
    '3. Service Delivery Confirmation -- summarize whether services were delivered as specified. ' +
    '4. Goal Progress Overview -- for ordinary goals, briefly note current status relative to the target. For goals marked Criterion Conflict: YES, report raw evidence and Manual Criterion Review Required without assigning a criterion-relative status. ' +
    '5. Compliance Concerns (if any) -- flag any missed data collection windows or service gaps. Do not treat a criterion conflict alone as a compliance failure. ' +
    'Be precise, factual, and reference specific metrics. Do not fabricate data. ' +
    criterionGuidance + ' ' +
    'Output only the numbered compliance notes -- no preamble or postamble.';
}

/**
 * Build the user message payload for the Anthropic API.
 */
function buildComplianceUserMessage(studentName, studentCode, goals, complianceData, quarterLabel) {
  var lines = [
    'Draft compliance documentation notes for the following IEP file.',
    '',
    'Student/Class: ' + sanitizeField(studentName, 100) + ' (' + sanitizeField(studentCode, 50) + ')',
    'Reporting Period: ' + sanitizeField(quarterLabel, 50),
    '',
  ];

  if (complianceData) {
    lines.push('COMPLIANCE DATA:');
    lines.push('  Total Expected Data Collection Events: ' + sanitizeField(String(complianceData.totalAssignments || 0), 10));
    lines.push('  Completed Data Collection Events: ' + sanitizeField(String(complianceData.completedAssignments || 0), 10));
    lines.push('  Data Collection Frequency Standard: ' + sanitizeField(String(complianceData.dataCollectionFrequency || 'Not specified'), 100));
    lines.push('  Goals with No Data Collected: ' + sanitizeField(String(complianceData.missedDataPoints || 0), 10));
    lines.push('  Accommodations: ' + sanitizeField(String(complianceData.accommodationsProvided || 'Per IEP'), 200));
    lines.push('');
  }

  if (Array.isArray(goals) && goals.length > 0) {
    lines.push('ACTIVE IEP GOALS (' + goals.length + '):');
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
    lines.push('');
  }

  lines.push('');
  lines.push('For any goal marked Criterion Conflict: YES, preserve Header Mastery and Goal-Text Target separately, make no criterion-relative progress judgment, and state Manual Criterion Review Required. Do not treat the conflict itself as a service-delivery or data-collection compliance violation.');
  lines.push('Draft formal compliance notes for this IEP file. Use numbered items with clear headings. Flag compliance concerns only when supported by the supplied compliance evidence.');

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
  if (!body.quarterLabel || typeof body.quarterLabel !== 'string' || !body.quarterLabel.trim()) {
    return { valid: false, error: 'quarterLabel is required' };
  }
  return { valid: true };
}

exports.handler = async function(event) {
  var requestId = generateRequestId();
  console.log('[teacher-ai-compliance-notes] [' + requestId + '] Request received - method: ' + event.httpMethod);

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
    console.log('[teacher-ai-compliance-notes] [' + requestId + '] Unauthorized');
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log('[teacher-ai-compliance-notes] [' + requestId + '] Authorized user: ' + authResult.user.username);

  // Check Anthropic API key
  var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.warn('[teacher-ai-compliance-notes] [' + requestId + '] ANTHROPIC_API_KEY is not configured');
    return jsonResponse(event, 503, { ok: false, error: 'AI compliance notes not configured -- ANTHROPIC_API_KEY missing' }, {}, requestId);
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
  var quarterLabel = sanitizeField(body.quarterLabel, 50);
  var goals = Array.isArray(body.goals) ? body.goals.slice(0, 50) : [];
  var complianceData = body.complianceData && typeof body.complianceData === 'object' ? body.complianceData : null;

  // Build the prompt
  var systemPrompt = buildComplianceSystemPrompt();
  var userMessage = buildComplianceUserMessage(studentName, studentCode, goals, complianceData, quarterLabel);

  console.log('[teacher-ai-compliance-notes] [' + requestId + '] Calling Anthropic API for ' + studentCode + ' (' + goals.length + ' goals, period: ' + quarterLabel + ')');

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
      console.error('[teacher-ai-compliance-notes] [' + requestId + '] Anthropic API error: ' + anthropicRes.status + ' ' + errText);
      return jsonResponse(event, 502, { ok: false, error: 'AI compliance notes generation failed' }, {}, requestId);
    }

    anthropicResult = await anthropicRes.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[teacher-ai-compliance-notes] [' + requestId + '] Anthropic request timed out');
      return jsonResponse(event, 504, { ok: false, error: 'AI compliance notes generation timed out' }, {}, requestId);
    }
    console.error('[teacher-ai-compliance-notes] [' + requestId + '] Anthropic request failed: ' + err.message);
    return jsonResponse(event, 502, { ok: false, error: 'AI compliance notes generation failed' }, {}, requestId);
  }

  // Extract notes content from response
  var notes = '';
  var contentBlocks = anthropicResult && anthropicResult.content;
  if (Array.isArray(contentBlocks)) {
    contentBlocks.forEach(function(block) {
      if (block.type === 'text') notes += block.text;
    });
  }

  if (!notes) {
    console.error('[teacher-ai-compliance-notes] [' + requestId + '] Anthropic returned empty content');
    return jsonResponse(event, 502, { ok: false, error: 'AI compliance notes generation returned empty content' }, {}, requestId);
  }

  console.log('[teacher-ai-compliance-notes] [' + requestId + '] Compliance notes generation complete -- ' + notes.length + ' chars');

  return jsonResponse(event, 200, { ok: true, notes: notes }, {}, requestId);
};
