// Tests for AI summary fixtures and prompt quality requirements.
// Validates the banned-phrase logic, audience routing, and summary structure.
// Run with: node tests/ai-summary-fixtures.test.cjs

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ── Load banned phrases ───────────────────────────────────────────────────────

const BANNED_PHRASES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../web/ai-prompts/banned-phrases.json'), 'utf8')
);

// ── Load fixtures ─────────────────────────────────────────────────────────────

const fixturesDir = path.join(__dirname, 'ai-summary-fixtures');
const fixtures = {};
[
  '01-on-track',
  '02-near-target',
  '03-regressing',
  '04-no-data',
  '05-brand-new-goal',
  '06-mastered',
  '07-mixed-skills',
  '08-missing-metadata',
].forEach(name => {
  fixtures[name] = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, `${name}.json`), 'utf8')
  );
});

// ── JWT helper ────────────────────────────────────────────────────────────────

function makeTeacherToken(secret, role) {
  const r = role || 'teacher';
  const b64url = buf =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jsonb64 = obj => b64url(JSON.stringify(obj));
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { role: r, username: 'testteacher', iat: now, exp: now + 3600 };
  const data = `${jsonb64(header)}.${jsonb64(payload)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

// ── Mock setup ────────────────────────────────────────────────────────────────

const SESSION_SECRET = 'test-session-secret-32-chars-long!!';
const OPENAI_API_KEY = 'sk-test-fake-openai-key';
const validToken = makeTeacherToken(SESSION_SECRET);

const mockHttpLib = {
  generateRequestId: () => 'test-req-id',
  jsonResponse: (_event, status, body) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  handleCorsPreFlight: (_event, methods, headers) => ({
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': methods.join(', '),
      'Access-Control-Allow-Headers': (headers || []).join(', '),
    },
    body: '',
  }),
  validateBodySize: (_body, _maxKb) => ({ valid: true }),
  safeJsonParse: str => {
    if (!str) return { ok: false, error: 'Empty request body' };
    try { return { ok: true, data: JSON.parse(str) }; } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
  },
};

const realAuth = require('../netlify/functions/_lib/auth');

require.cache[require.resolve('../netlify/functions/_lib/http')] = { exports: mockHttpLib };
require.cache[require.resolve('../netlify/functions/_lib/auth')] = { exports: realAuth };

process.env.SESSION_SECRET = SESSION_SECRET;
process.env.OPENAI_API_KEY = OPENAI_API_KEY;

const { handler, _rateLimitBuckets } = require('../netlify/functions/teacher-ai-skills-summary');

// ── Helpers ───────────────────────────────────────────────────────────────────

function authedEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { cookie: `tc=${validToken}` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function makeOpenAiSkillResponse(skills) {
  return _url => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify({ skills }) } }],
    }),
    text: () => Promise.resolve(JSON.stringify({ skills })),
  });
}

function hasBannedPhrase(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BANNED_PHRASES.some(phrase => lower.includes(phrase.toLowerCase()));
}

function checkSkillsNoBannedPhrases(skills) {
  for (const s of skills) {
    const combined = [s.summary, s.description, s.plain_language, s.goal_recommendation]
      .filter(Boolean)
      .join(' ');
    const found = BANNED_PHRASES.find(p => combined.toLowerCase().includes(p.toLowerCase()));
    if (found) return found;
  }
  return null;
}

const REQUIRED_SECTIONS = ['WHAT HAPPENED', 'WHY IT MATTERS', 'DO THIS NEXT'];

// ── Tests ─────────────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Banned-phrase list validations ────────────────────────────────────────────

test('banned-phrases.json is valid JSON array of strings', () => {
  assert.ok(Array.isArray(BANNED_PHRASES), 'banned-phrases.json must be an array');
  assert.ok(BANNED_PHRASES.length > 0, 'banned-phrases.json must not be empty');
  for (const p of BANNED_PHRASES) {
    assert.strictEqual(typeof p, 'string', `Expected string, got ${typeof p}`);
    assert.ok(p.length > 0, 'Banned phrase must not be empty string');
  }
});

test('banned-phrases.json contains all required phrases', () => {
  const required = [
    'targeted intervention',
    'continued monitoring',
    'continued support',
    'additional support',
    'is recommended',
    'skill area',
    'to develop effectively',
  ];
  for (const phrase of required) {
    assert.ok(
      BANNED_PHRASES.some(p => p.toLowerCase() === phrase.toLowerCase()),
      `Missing required phrase: "${phrase}"`
    );
  }
});

// ── Handler returns correct structure (internal) ──────────────────────────────

for (const [fixtureName, fixture] of Object.entries(fixtures)) {
  test(`[${fixtureName}] internal: returns ok:true with skills array`, async () => {
    const mockSkills = (fixture.iep_goals || []).map(g => ({
      code: g.code,
      description: `Description for ${g.area}`,
      summary: `WHAT HAPPENED\nIn Q2, the student scored ${g.current_avg ?? 0}% on 5 reading probes.\nWHY IT MATTERS\nThe target is ${g.target ?? 0}%.\nDO THIS NEXT\n- Practice 10 minutes daily with Lesson 3 materials.`,
      plain_language: `In plain words: The student scored ${g.current_avg ?? 0}% and is working toward ${g.target ?? 0}%.`,
      tier: (g.current_avg ?? 0) >= 80 ? 'excellent' : (g.current_avg ?? 0) >= 60 ? 'on-track' : 'needs-support',
      source: 'iep',
    }));

    global.fetch = makeOpenAiSkillResponse(mockSkills);
    const res = await handler(authedEvent({ ...fixture, audience: 'internal' }));
    global.fetch = null;

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    const parsed = JSON.parse(res.body);
    assert.strictEqual(parsed.ok, true);
    assert.ok(Array.isArray(parsed.skills), 'skills must be an array');
    assert.ok(parsed.skills.length > 0, 'skills array must not be empty');
  });

  test(`[${fixtureName}] internal: no banned phrases in output`, async () => {
    const mockSkills = (fixture.iep_goals || []).map(g => ({
      code: g.code,
      description: `This skill measures ${g.area} ability.`,
      summary: `WHAT HAPPENED\nIn Q2 the student scored ${g.current_avg ?? 0}% across ${g.data_points} observations.\nWHY IT MATTERS\nThe IEP target is ${g.target ?? 0}%.\nDO THIS NEXT\n- Run 5-minute daily drills with Chapter 2 decodable readers.\n\nIn plain words: The student scored ${g.current_avg ?? 0}% and is ${(g.current_avg ?? 0) >= (g.target ?? 80) ? 'meeting' : 'working toward'} the ${g.target ?? 0}% goal.`,
      plain_language: `The student scored ${g.current_avg ?? 0}% and needs ${(g.target ?? 80) - (g.current_avg ?? 0)} more points to reach the ${g.target ?? 0}% goal.`,
      tier: (g.current_avg ?? 0) >= 80 ? 'excellent' : 'on-track',
      source: 'iep',
    }));

    global.fetch = makeOpenAiSkillResponse(mockSkills);
    const res = await handler(authedEvent({ ...fixture, audience: 'internal' }));
    global.fetch = null;

    assert.strictEqual(res.statusCode, 200);
    const parsed = JSON.parse(res.body);
    const found = checkSkillsNoBannedPhrases(parsed.skills || []);
    assert.ok(!found, `Found banned phrase "${found}" in output for fixture ${fixtureName}`);
  });

  test(`[${fixtureName}] internal: summary has all three required sections`, async () => {
    const mockSkills = (fixture.iep_goals || []).concat(
      (fixture.dese_standards || []).map(d => ({
        code: d.code, area: d.code, current_avg: d.percent_correct,
        previous_avg: null, trend: 'stable', data_points: d.item_count, target: 75, baseline: 50,
        question_weaknesses: [],
      }))
    ).map(g => ({
      code: g.code,
      description: `Description for ${g.area || g.code}`,
      summary: `WHAT HAPPENED\nIn Q2, the student scored ${g.current_avg ?? 0}% on ${g.data_points ?? 1} probe(s) for ${g.area || g.code}.\nWHY IT MATTERS\nThe IEP target is ${g.target ?? 75}%; baseline was ${g.baseline ?? 0}%.\nDO THIS NEXT\n- Practice 3 sessions per week with Lesson 5 materials by Friday.\n\nIn plain words: The student got ${g.current_avg ?? 0}% and needs ${Math.max(0, (g.target ?? 75) - (g.current_avg ?? 0))} more points to reach the goal.`,
      plain_language: `The student got ${g.current_avg ?? 0}% and is working toward the ${g.target ?? 75}% goal.`,
      tier: (g.current_avg ?? 0) >= 80 ? 'excellent' : 'on-track',
      source: g.code.startsWith('MLS') || g.code.startsWith('R.') || g.code.startsWith('W.') ? 'dese' : 'iep',
    }));

    global.fetch = makeOpenAiSkillResponse(mockSkills);
    const res = await handler(authedEvent({ ...fixture, audience: 'internal' }));
    global.fetch = null;

    assert.strictEqual(res.statusCode, 200);
    const parsed = JSON.parse(res.body);
    for (const skill of parsed.skills) {
      for (const section of REQUIRED_SECTIONS) {
        assert.ok(
          skill.summary.includes(section),
          `[${fixtureName}] skill ${skill.code} summary missing section "${section}"`
        );
      }
    }
  });

  test(`[${fixtureName}] internal: plain_language line is < 200 chars`, async () => {
    const mockSkills = (fixture.iep_goals || []).map(g => ({
      code: g.code,
      description: `Description for ${g.area}`,
      summary: `WHAT HAPPENED\nScored ${g.current_avg ?? 0}%.\nWHY IT MATTERS\nTarget is ${g.target ?? 75}%.\nDO THIS NEXT\n- Work on Lesson 4 daily.\n\nIn plain words: The student scored ${g.current_avg ?? 0}% and needs more practice.`,
      plain_language: `The student scored ${g.current_avg ?? 0}% and needs more practice to reach ${g.target ?? 75}%.`,
      tier: 'on-track',
      source: 'iep',
    }));

    global.fetch = makeOpenAiSkillResponse(mockSkills);
    const res = await handler(authedEvent({ ...fixture, audience: 'internal' }));
    global.fetch = null;

    assert.strictEqual(res.statusCode, 200);
    const parsed = JSON.parse(res.body);
    for (const skill of parsed.skills) {
      if (skill.plain_language) {
        assert.ok(
          skill.plain_language.length < 200,
          `plain_language too long (${skill.plain_language.length} chars) for ${skill.code} in ${fixtureName}`
        );
      }
    }
  });
}

// ── External variant: "Suggested — review before sending." prefix ─────────────

test('[external] DO THIS NEXT prefix present in external summaries', async () => {
  const fixture = fixtures['01-on-track'];
  const mockSkills = fixture.iep_goals.map(g => ({
    code: g.code,
    description: `Description for ${g.area}`,
    summary: `WHAT HAPPENED\nIn Q2 the student scored ${g.current_avg}% on 8 reading checks.\nWHY IT MATTERS\nThe target is ${g.target}%; student is ${g.current_avg - g.target} points above goal.\nDO THIS NEXT\n- Suggested — review before sending. Ask the student to read aloud 10 minutes each evening.\n- Suggested — review before sending. At the next check-in on May 10, review Q3 fluency data.\n\nIn plain words: The student scored ${g.current_avg}% and is above the ${g.target}% goal — great progress!`,
    plain_language: `The student scored ${g.current_avg}% and beat the ${g.target}% goal — great work!`,
    tier: 'excellent',
    source: 'iep',
  }));

  global.fetch = makeOpenAiSkillResponse(mockSkills);
  const res = await handler(authedEvent({ ...fixture, audience: 'external' }));
  global.fetch = null;

  assert.strictEqual(res.statusCode, 200);
  const parsed = JSON.parse(res.body);
  for (const skill of parsed.skills) {
    assert.ok(
      skill.summary.includes('Suggested — review before sending.'),
      `External summary missing "Suggested — review before sending." prefix in skill ${skill.code}`
    );
  }
});

test('[external] plain_language is mandatory and present', async () => {
  const fixture = fixtures['03-regressing'];
  const mockSkills = fixture.iep_goals.map(g => ({
    code: g.code,
    description: `Description for ${g.area}`,
    summary: `WHAT HAPPENED\nIn Q2 the student scored ${g.current_avg}%, down from ${g.previous_avg}%.\nWHY IT MATTERS\nTarget is ${g.target}%.\nDO THIS NEXT\n- Suggested — review before sending. Work on transition words 3x this week.\n\nIn plain words: The student scored ${g.current_avg}% and needs help with writing.`,
    plain_language: `The student scored ${g.current_avg}% and needs help with writing skills.`,
    tier: 'needs-support',
    source: 'iep',
  }));

  global.fetch = makeOpenAiSkillResponse(mockSkills);
  const res = await handler(authedEvent({ ...fixture, audience: 'external' }));
  global.fetch = null;

  assert.strictEqual(res.statusCode, 200);
  const parsed = JSON.parse(res.body);
  for (const skill of parsed.skills) {
    assert.ok(skill.plain_language, `External skill ${skill.code} must have plain_language`);
    assert.ok(skill.plain_language.length < 200, 'plain_language must be < 200 chars');
  }
});

// ── Banned-phrase retry logic ─────────────────────────────────────────────────

test('banned phrase in first response triggers ai_edited flag on second failure', async () => {
  const fixture = fixtures['01-on-track'];
  const bannedSummary = `WHAT HAPPENED\nIn Q2 the student scored 85%.\nWHY IT MATTERS\nTargeted interventions are recommended to ensure progress.\nDO THIS NEXT\n- Practice daily.\n\nIn plain words: The student is doing well.`;
  const mockSkills = fixture.iep_goals.map(g => ({
    code: g.code,
    description: 'Description',
    summary: bannedSummary,
    plain_language: 'The student is doing well.',
    tier: 'excellent',
    source: 'iep',
  }));

  let callCount = 0;
  global.fetch = _url => {
    callCount++;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ skills: mockSkills }) } }],
      }),
      text: () => Promise.resolve(''),
    });
  };

  const res = await handler(authedEvent({ ...fixture, audience: 'internal' }));
  global.fetch = null;

  assert.strictEqual(res.statusCode, 200);
  assert.ok(callCount >= 2, `Expected at least 2 OpenAI calls (retry), got ${callCount}`);

  const parsed = JSON.parse(res.body);
  assert.ok(parsed.ok);
  // After two failures the ai_edited flag should be set
  const hasEdited = parsed.skills.some(s => s.ai_edited === true);
  assert.ok(hasEdited, 'Expected ai_edited:true when banned phrase persists after retry');
});

test('clean response on retry clears banned phrase without ai_edited flag', async () => {
  const fixture = fixtures['01-on-track'];
  const bannedSkills = fixture.iep_goals.map(g => ({
    code: g.code,
    description: 'Description',
    summary: `WHAT HAPPENED\nScored 85%. Continued monitoring is recommended.\nWHY IT MATTERS\nTarget is 80%.\nDO THIS NEXT\n- Practice daily.\n\nIn plain words: Doing well.`,
    plain_language: 'The student is on track.',
    tier: 'excellent',
    source: 'iep',
  }));

  const cleanSkills = fixture.iep_goals.map(g => ({
    code: g.code,
    description: 'Description',
    summary: `WHAT HAPPENED\nIn Q2, the student scored 85% on 8 reading comprehension checks, up from 78% in Q1.\nWHY IT MATTERS\nThe IEP target is 80%; the student is 5 points above goal.\nDO THIS NEXT\n- This week: try Level 5 passages from the classroom library.\n\nIn plain words: The student scored 85% and is above the 80% goal.`,
    plain_language: 'The student scored 85% and beat the 80% goal.',
    tier: 'excellent',
    source: 'iep',
  }));

  let callCount = 0;
  global.fetch = _url => {
    callCount++;
    const skillsToReturn = callCount === 1 ? bannedSkills : cleanSkills;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ skills: skillsToReturn }) } }],
      }),
      text: () => Promise.resolve(''),
    });
  };

  const res = await handler(authedEvent({ ...fixture, audience: 'internal' }));
  global.fetch = null;

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(callCount, 2, `Expected 2 OpenAI calls, got ${callCount}`);
  const parsed = JSON.parse(res.body);
  assert.ok(parsed.ok);
  const hasEdited = parsed.skills.some(s => s.ai_edited === true);
  assert.ok(!hasEdited, 'Expected no ai_edited flag when retry succeeded');
});

// ── WHAT HAPPENED must contain numbers ───────────────────────────────────────

test('WHAT HAPPENED section contains at least one number in mock output', async () => {
  const fixture = fixtures['07-mixed-skills'];
  const allItems = [...(fixture.iep_goals || []), ...(fixture.dese_standards || []).map(d => ({
    code: d.code, area: d.code, current_avg: d.percent_correct, data_points: d.item_count,
    target: 75, baseline: 50, trend: 'stable', question_weaknesses: [],
  }))];

  const mockSkills = allItems.map(g => ({
    code: g.code,
    description: `Description for ${g.area || g.code}`,
    summary: `WHAT HAPPENED\nIn Q2, the student scored ${g.current_avg ?? 0}% on ${g.data_points ?? 1} probe(s).\nWHY IT MATTERS\nTarget is ${g.target ?? 75}%.\nDO THIS NEXT\n- Work on Chapter 3 items 3x this week.\n\nIn plain words: Scored ${g.current_avg ?? 0}%.`,
    plain_language: `Scored ${g.current_avg ?? 0}%.`,
    tier: 'on-track',
    source: g.code.startsWith('MLS') ? 'dese' : 'iep',
  }));

  global.fetch = makeOpenAiSkillResponse(mockSkills);
  const res = await handler(authedEvent({ ...fixture, audience: 'internal' }));
  global.fetch = null;

  assert.strictEqual(res.statusCode, 200);
  const parsed = JSON.parse(res.body);
  for (const skill of parsed.skills) {
    const whatHappenedMatch = skill.summary.match(/WHAT HAPPENED\n([\s\S]+?)(?:\n\n|\nWHY IT MATTERS)/);
    if (whatHappenedMatch) {
      const whatText = whatHappenedMatch[1];
      assert.ok(
        /\d/.test(whatText),
        `WHAT HAPPENED in skill ${skill.code} must contain at least one number. Got: "${whatText}"`
      );
    }
  }
});

// ── Run ───────────────────────────────────────────────────────────────────────

async function runAll() {
  console.log('Running ai-summary-fixtures tests...\n');
  let failed = 0;
  for (const t of tests) {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.OPENAI_API_KEY = OPENAI_API_KEY;
    if (_rateLimitBuckets) _rateLimitBuckets.clear();
    try {
      await t.fn();
      console.log(`✓ ${t.name}`);
    } catch (e) {
      console.error(`✗ ${t.name}`);
      console.error(`  Error: ${e.message}`);
      if (e.stack) console.error(`  Stack: ${e.stack.split('\n').slice(1, 4).join('\n')}`);
      failed++;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nAll tests passed.');
  }
}

runAll();
