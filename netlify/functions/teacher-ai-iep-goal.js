// AI-assisted IEP goal generation endpoint
// POST /.netlify/functions/teacher-ai-iep-goal
// Auth: Requires teacher session cookie
// Body: { student_code, dese_code, dese_area, percent_correct, item_count, rollup_item_count, evidence_items }
//   item_count: actual number of evidence items attached (matches evidence_items.length before the 10-item cap)
//   rollup_item_count: (optional) badge count from the student_dese_rollups RPC; may differ from item_count
//   evidence_items: [{ question_text, assignment_title, date, earned_points, max_points, is_correct, teacher_note }]
// Returns: { ok: true, goal: { goal_area, goal_code, description, measurement_type, baseline, mastery, target } }

console.log('[teacher-ai-iep-goal] Module loaded');

const { requireTeacher } = require('./_lib/auth');
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { SESSION_SECRET } = process.env;

// ── Per-session token bucket rate limiter ────────────────────────────────────
// Capacity: 5 tokens, refill rate: 1 token per 12 seconds
// Keyed on teacher username resolved from the verified session JWT.
const BUCKET_CAPACITY = 5;
const REFILL_INTERVAL_MS = 12000; // 1 token per 12 seconds
const BUCKET_EVICTION_AGE_MS = 10 * 60 * 1000; // 10 minutes

/** @type {Map<string, { tokens: number, lastRefillMs: number }>} */
const rateLimitBuckets = new Map();

/**
 * Check and consume a token for the given session key.
 * Returns { allowed: true } or { allowed: false, retryAfterSeconds: number }.
 */
function checkRateLimit(sessionKey) {
  const now = Date.now();

  // Opportunistically evict stale entries to keep the Map bounded.
  // A single linear pass per request is intentional (spec: "keep this simple").
  for (const [key, bucket] of rateLimitBuckets) {
    if (now - bucket.lastRefillMs > BUCKET_EVICTION_AGE_MS) {
      rateLimitBuckets.delete(key);
    }
  }

  let bucket = rateLimitBuckets.get(sessionKey);
  if (!bucket) {
    bucket = { tokens: BUCKET_CAPACITY, lastRefillMs: now };
    rateLimitBuckets.set(sessionKey, bucket);
  }

  // Refill tokens based on elapsed time since last refill.
  const elapsed = now - bucket.lastRefillMs;
  const tokensToAdd = Math.floor(elapsed / REFILL_INTERVAL_MS);
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + tokensToAdd);
    bucket.lastRefillMs += tokensToAdd * REFILL_INTERVAL_MS;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true };
  }

  // Calculate seconds until the next token refills.
  const msUntilNext = REFILL_INTERVAL_MS - (now - bucket.lastRefillMs);
  const retryAfterSeconds = Math.max(1, Math.ceil(msUntilNext / 1000));
  return { allowed: false, retryAfterSeconds };
}

/**
 * Map a DESE standard code prefix to a recommended IEP goal area.
 */
function deseCodeToGoalArea(deseCode) {
  if (!deseCode || typeof deseCode !== 'string') return 'Reading Comprehension';
  const upper = deseCode.toUpperCase();
  if (upper.startsWith('R.')) return 'Reading Comprehension';
  if (upper.startsWith('W.')) return 'Written Expression';
  if (upper.startsWith('L.')) return 'Language';
  if (upper.startsWith('M.')) return 'Math Calculation';
  if (upper.startsWith('S.')) return 'Social Skills';
  return 'Reading Comprehension';
}

/**
 * Sanitize a value for safe inclusion in a prompt.
 */
function sanitize(val, maxLen = 200) {
  if (val == null) return '';
  return String(val).replace(/[^\x20-\x7E\n\t]/g, '').slice(0, maxLen);
}

/**
 * Build the OpenAI prompt for IEP goal generation.
 */
function buildIepGoalPrompt({ student_code, dese_code, dese_area, percent_correct, item_count, rollup_item_count, evidence_items }) {
  const safeCode = sanitize(student_code, 20);
  const safeDesCode = sanitize(dese_code, 50);
  const safeArea = sanitize(dese_area, 100);
  const safePct = typeof percent_correct === 'number' ? Math.round(percent_correct * 10) / 10 : 0;
  const safeCount = typeof item_count === 'number' ? item_count : 0;
  const safeRollupCount = typeof rollup_item_count === 'number' ? rollup_item_count : null;
  const goalArea = deseCodeToGoalArea(dese_code);

  // Build the "items reviewed" phrase; include rollup count when it differs from attached count.
  let itemsPhrase;
  if (safeRollupCount !== null && safeRollupCount !== safeCount) {
    itemsPhrase = `${safeCount} graded items reviewed (${safeRollupCount} total in rollup)`;
  } else {
    itemsPhrase = `${safeCount} graded items`;
  }

  let prompt = `You are a special education IEP (Individualized Education Program) goal writing assistant. `;
  prompt += `Draft a single, specific, measurable, achievable, relevant, and time-bound (SMART) IEP goal for a student.\n\n`;

  prompt += `STUDENT: ${safeCode}\n`;
  prompt += `DESE STANDARD: ${safeDesCode} — ${safeArea}\n`;
  prompt += `CURRENT PERFORMANCE: ${safePct}% correct across ${itemsPhrase}\n`;
  prompt += `SUGGESTED GOAL AREA: ${goalArea}\n\n`;

  if (Array.isArray(evidence_items) && evidence_items.length > 0) {
    prompt += `EVIDENCE ITEMS (individual graded items that contributed to the score):\n`;
    const maxItems = Math.min(evidence_items.length, 10);
    for (let i = 0; i < maxItems; i++) {
      const item = evidence_items[i];
      const qText = sanitize(item.question_text || '', 120);
      const asnTitle = sanitize(item.assignment_title || '', 80);
      const dateStr = sanitize(item.date || '', 20);
      const earned = typeof item.earned_points === 'number' ? item.earned_points : '?';
      const max = typeof item.max_points === 'number' ? item.max_points : '?';
      const correct = item.is_correct === true ? 'correct' : item.is_correct === false ? 'incorrect' : 'partial';
      prompt += `  Item ${i + 1}: `;
      if (qText) prompt += `"${qText}" `;
      if (asnTitle) prompt += `[from: ${asnTitle}] `;
      if (dateStr) prompt += `[date: ${dateStr}] `;
      prompt += `— ${earned}/${max} pts (${correct})\n`;
      if (item.teacher_note) {
        const note = sanitize(item.teacher_note, 100);
        prompt += `    Teacher note: "${note}"\n`;
      }
    }
    prompt += '\n';
  }

  prompt += `VALID GOAL AREAS (choose the single best match): Reading Comprehension, Written Expression, Basic Reading, Behavior, Life Skills Transition, Life Skills Reading Skills, Life Skills Writing Skills, Math Calculation, Math Problem Solving, Reading Fluency, Social Skills, Language, Life Skills, Emotional Regulation, Reading Skills\n\n`;

  prompt += `INSTRUCTIONS:\n`;
  prompt += `1. Write ONE measurable IEP goal statement for the Description field. The goal should:\n`;
  prompt += `   - Reference the DESE standard by name (not just the code)\n`;
  prompt += `   - State a specific measurable outcome (e.g., "will achieve 70% accuracy")\n`;
  prompt += `   - Include a time frame (e.g., "by the end of the IEP period" or "within 36 weeks")\n`;
  prompt += `   - Be appropriate for a student performing at ${safePct}% on this standard\n`;
  prompt += `   - Be written in objective, third-person language (do NOT name or identify the student)\n`;
  prompt += `2. Set Baseline to the student's current performance percentage: ${safePct}\n`;
  prompt += `3. Set Mastery to a reasonable target (typically 70–80% for most goals)\n`;
  prompt += `4. Set Target to the same value as Mastery (or a slightly higher long-term goal)\n`;
  prompt += `5. Measurement Type should almost always be "Accuracy" for academic skills\n`;
  prompt += `6. Goal Code: create a short mnemonic code based on the standard (e.g., for W.3.A use "WR3A-1")\n\n`;

  prompt += `Respond ONLY with valid JSON in this exact structure:\n`;
  prompt += `{\n`;
  prompt += `  "goal_area": "<one of the valid goal areas above>",\n`;
  prompt += `  "goal_code": "<short code>",\n`;
  prompt += `  "description": "<full measurable IEP goal statement>",\n`;
  prompt += `  "measurement_type": "Accuracy",\n`;
  prompt += `  "baseline": <number 0-100>,\n`;
  prompt += `  "mastery": <number 0-100>,\n`;
  prompt += `  "target": <number 0-100>\n`;
  prompt += `}`;

  return prompt;
}

const VALID_MEASUREMENT_TYPES = new Set(['Accuracy', 'Frequency', 'Duration', 'Rate', 'Observation']);
const VALID_GOAL_AREAS = new Set([
  'Reading Comprehension', 'Written Expression', 'Basic Reading', 'Behavior',
  'Life Skills Transition', 'Life Skills Reading Skills', 'Life Skills Writing Skills',
  'Math Calculation', 'Math Problem Solving', 'Reading Fluency', 'Social Skills',
  'Language', 'Life Skills', 'Emotional Regulation', 'Reading Skills',
]);

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-ai-iep-goal] [${requestId}] Request received — method: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  const auth = requireTeacher(event, SESSION_SECRET);
  if (!auth.ok) {
    console.log(`[teacher-ai-iep-goal] [${requestId}] Unauthorized`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const sessionKey = auth.user.username;
  const rlResult = checkRateLimit(sessionKey);
  if (!rlResult.allowed) {
    console.log(JSON.stringify({ event: 'iep_goal_rate_limited', sessionKey, tokensRemaining: 0 }));
    return jsonResponse(
      event,
      429,
      { error: 'rate_limited', retry_after_seconds: rlResult.retryAfterSeconds },
      { 'Retry-After': String(rlResult.retryAfterSeconds) },
      requestId,
    );
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[teacher-ai-iep-goal] [${requestId}] OPENAI_API_KEY not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'AI goal generation not configured' }, {}, requestId);
  }

  const bodySizeCheck = validateBodySize(event.body, 30);
  if (!bodySizeCheck.valid) {
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { student_code, dese_code, dese_area, percent_correct, item_count, rollup_item_count, evidence_items } = parseResult.data;

  if (!student_code || typeof student_code !== 'string' || student_code.trim() === '') {
    return jsonResponse(event, 400, { ok: false, error: 'student_code is required' }, {}, requestId);
  }
  if (!dese_code || typeof dese_code !== 'string' || dese_code.trim() === '') {
    return jsonResponse(event, 400, { ok: false, error: 'dese_code is required' }, {}, requestId);
  }

  const systemPrompt = buildIepGoalPrompt({
    student_code: student_code.trim(),
    dese_code: dese_code.trim(),
    dese_area: typeof dese_area === 'string' ? dese_area.trim() : dese_code.trim(),
    percent_correct: typeof percent_correct === 'number' ? percent_correct : 0,
    item_count: typeof item_count === 'number' ? item_count : 0,
    rollup_item_count: typeof rollup_item_count === 'number' ? rollup_item_count : null,
    evidence_items: Array.isArray(evidence_items) ? evidence_items : [],
  });

  console.log(`[teacher-ai-iep-goal] [${requestId}] Calling OpenAI for student ${student_code.trim()}, standard ${dese_code.trim()}`);

  let openAiResult;
  try {
    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: systemPrompt }],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!openAiRes.ok) {
      const errText = await openAiRes.text().catch(() => '');
      throw new Error(`OpenAI API error: ${openAiRes.status} ${errText}`);
    }

    const openAiData = await openAiRes.json();
    const content = openAiData?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty content');

    openAiResult = JSON.parse(content);
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      console.error(`[teacher-ai-iep-goal] [${requestId}] OpenAI timed out`);
      return jsonResponse(event, 504, { ok: false, error: 'AI goal generation timed out' }, {}, requestId);
    }
    console.error(`[teacher-ai-iep-goal] [${requestId}] OpenAI failed: ${err.message}`);
    return jsonResponse(event, 502, { ok: false, error: 'AI goal generation failed' }, {}, requestId);
  }

  // Validate and sanitize the response
  const raw = openAiResult || {};
  const baseline = typeof raw.baseline === 'number' ? Math.round(Math.min(100, Math.max(0, raw.baseline))) : Math.round(typeof percent_correct === 'number' ? percent_correct : 0);
  const mastery  = typeof raw.mastery  === 'number' ? Math.round(Math.min(100, Math.max(0, raw.mastery)))  : 70;
  const target   = typeof raw.target   === 'number' ? Math.round(Math.min(100, Math.max(0, raw.target)))   : mastery;

  const rawArea = typeof raw.goal_area === 'string' ? raw.goal_area.trim() : '';
  const goalArea = VALID_GOAL_AREAS.has(rawArea) ? rawArea : deseCodeToGoalArea(dese_code);

  const rawMt = typeof raw.measurement_type === 'string' ? raw.measurement_type.trim() : '';
  const measurementType = VALID_MEASUREMENT_TYPES.has(rawMt) ? rawMt : 'Accuracy';

  const rawCode = typeof raw.goal_code === 'string' ? raw.goal_code.trim().slice(0, 30) : '';
  const rawDesc = typeof raw.description === 'string' ? raw.description.trim().slice(0, 600) : '';

  const goal = {
    goal_area: goalArea,
    goal_code: rawCode,
    description: rawDesc,
    measurement_type: measurementType,
    baseline,
    mastery,
    target,
  };

  console.log(`[teacher-ai-iep-goal] [${requestId}] Goal draft ready for ${student_code.trim()}`);

  return jsonResponse(event, 200, { ok: true, goal }, {}, requestId);
};

// Exported for test isolation only — do not use in production code.
exports._rateLimitBuckets = rateLimitBuckets;
