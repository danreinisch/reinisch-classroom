import { test, expect } from '@playwright/test';

// Every API call is synthetic; external traffic and service workers are blocked.
test.use({ serviceWorkers: 'block' });
const CODE = 'DICTATION_TEST';
const ID = 'dictation-test-assignment';
const WRITING = {
  day_number: 4, type: 'writing_prompt', label: 'Explain your thinking',
  prompt: 'Describe a useful skill you would like to learn. Explain why it matters.',
  structure: ['Give your main idea.', 'Add supporting details.'], hints: ['Use an example.']
};
const QUESTIONS = {
  day_number: 1, type: 'questions', label: 'Short answers',
  questions: [{ number: 1, text: 'What skill would you like to learn?', choices: [] }, { number: 2, text: 'Why is practice helpful?', choices: [] }]
};

async function setup(page, context, baseURL, options = {}) {
  const posts = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const instance = {
    id: ID, status: options.status || 'Assigned', assigned_at: '2026-09-06', settings: options.settings || {},
    assignment: { id: 'dictation-content', title: 'Voice typing practice', series: 'Synthetic test', meta: { days: [QUESTIONS, WRITING] }, ...options.assignment }
  };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) return route.abort();
    if (url.pathname === '/dictation-test/embedded.js') {
      return route.fulfill({ contentType: 'text/javascript', body: `
        const answers = () => ({Q1:document.querySelector('#Q1').value,Q2:document.querySelector('#Q2').value});
        document.addEventListener('input', () => parent.postMessage({type:'rc-assignment-autosave',answers:answers()},parent.location.origin));
        document.querySelector('#submitEmbedded').addEventListener('click', () => parent.postMessage({type:'rc-assignment-submit',answers:answers()},parent.location.origin));
      ` });
    }
    if (url.pathname === '/dictation-test/embedded.html') return route.fulfill({ contentType: 'text/html', body: embeddedHtml });
    if (options.missingHelper && url.pathname === '/web/assignment-dictation.js') return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) {
      if (url.pathname.endsWith('/student-submit-answer')) posts.push(route.request().postDataJSON());
      if (url.pathname.endsWith('/browser-supabase-config')) return route.fulfill({ status: 404, json: { ok: false } });
      return route.fulfill({ json: {
        ok: true, code: CODE, name: 'Synthetic Student', student: { code: CODE, name: 'Synthetic Student' },
        students: [], instances: [instance], assignments: [], submissions: [], goals: [], progress: [], data_points: []
      } });
    }
    return route.continue();
  });
  await context.addInitScript(({ code, unsupported }) => {
    sessionStorage.setItem('rc_user_role', 'student');
    sessionStorage.setItem('rc_user_code', code);
    window.__recognitions = [];
    window.__spoken = [];
    window.__speechCancels = 0;
    class FakeRecognition {
      constructor() { window.__recognitions.push(this); this.aborted = false; this.stopped = false; }
      start() { this.onstart?.(); }
      stop() { this.stopped = true; }
      abort() { this.aborted = true; this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: unsupported ? undefined : FakeRecognition });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() { window.__speechCancels++; },
      speak(utterance) { window.__spoken.push(utterance.text); }
    } });
  }, { code: CODE, unsupported: !!options.unsupported });
  await page.goto('/student/?tab=assignments');
  await expect(page.locator('#studentDashboardView')).toBeVisible();
  await page.locator(`[data-instance-id="${ID}"]:visible`).first().click();
  await expect(page.locator('#assignmentPanel')).toBeVisible();
  await expect(page.locator('#assignmentPanel')).toHaveCount(1);
  if (!options.assignment) await chooseWriting(page);
  return { posts, errors };
}

async function emit(page, parts, index = -1, resultIndex = 0) {
  await page.evaluate(({ parts, index, resultIndex }) => {
    const r = window.__recognitions.at(index);
    const results = parts.map(([text, final = true]) => Object.assign([{ transcript: text }], { isFinal: final }));
    r.onresult({ results, resultIndex });
  }, { parts, index, resultIndex });
}
const buttonFor = (page, id) => page.locator(`#${id}`).locator('xpath=preceding-sibling::div[1]').getByRole('button');
async function end(page) { await page.evaluate(() => window.__recognitions.at(-1).onend()); }
async function chooseQuestions(page) { await page.locator('#dayTabs [data-day-index="0"]').click(); }
async function chooseWriting(page) { await page.locator('#dayTabs [data-day-index="1"]').click(); }

const embeddedHtml = '<!doctype html><html><head><meta charset="utf-8"></head><body><h2>Embedded writing practice</h2><label for="Q1">Your explanation</label><textarea id="Q1" name="Q1"></textarea><label for="Q2">Short answer</label><input id="Q2" name="Q2" type="text"><button id="submitEmbedded" type="button">Submit Assignment</button><script src="/dictation-test/embedded.js"></script></body></html>';

test('dictation saves, reopens, edits, and submits through the existing writing workflow', async ({ page, context, baseURL }) => {
  const { posts, errors } = await setup(page, context, baseURL);
  const answer = page.locator('#writingResponse');
  await answer.fill('My idea:');
  await buttonFor(page, 'writingResponse').click();
  await emit(page, [['practice', false]]);
  await expect(answer).toHaveValue('My idea:');
  await emit(page, [['practice helps me learn a useful skill.']]);
  await buttonFor(page, 'writingResponse').click();
  await end(page);
  await expect(answer).toHaveValue('My idea: practice helps me learn a useful skill.');
  await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem('rc_student_answers_' + id) || '{}').writing_4, ID)).toBe('My idea: practice helps me learn a useful skill.');
  await page.locator('#panelCloseBtn').click();
  await expect(page.locator('#assignmentPanel')).toHaveCount(0);
  await page.locator(`[data-instance-id="${ID}"]:visible`).first().click();
  await chooseWriting(page);
  await expect(answer).toHaveValue('My idea: practice helps me learn a useful skill.');
  await answer.fill('Practice helps me learn to cook safely.');
  await page.locator('#submitWritingBtn').click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => posts.filter(p => p.submit === true).length).toBe(1);
  expect(posts.find(p => p.submit === true).writing_response).toBe('Practice helps me learn to cook safely.');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(answer).toBeDisabled();
  await expect(page.locator('.st-dictation-controls:visible')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('short-answer dictation updates the real answer map and autosave payload', async ({ page, context, baseURL }) => {
  const { posts } = await setup(page, context, baseURL);
  await chooseQuestions(page);
  const fields = page.locator('.st-text-answer');
  await fields.first().locator('xpath=preceding-sibling::div[1]').getByRole('button').click();
  await emit(page, [['I want to learn cooking.']]);
  await fields.nth(1).locator('xpath=preceding-sibling::div[1]').getByRole('button').click();
  await emit(page, [['Practice helps me improve.']]);
  await emit(page, [['I want to learn cooking.'], ['late words']], 0, 1);
  await end(page);
  await expect(fields.first()).toHaveValue('I want to learn cooking.');
  await expect(fields.nth(1)).toHaveValue('Practice helps me improve.');
  await expect.poll(() => posts.find(p => p.answers?.['1_2'] === 'Practice helps me improve.')?.answers).toEqual({ '1_1': 'I want to learn cooking.', '1_2': 'Practice helps me improve.' });
});

test('Writing Builder dictation updates word counts and transfers to the response', async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL);
  await page.locator('#builderToggleBtn').click();
  await buttonFor(page, 'builderTopicSentence').click();
  await emit(page, [['Learning to cook is useful for me.']]);
  await end(page);
  await expect(page.locator('#builderTopicCount')).toContainText('7 words');
  await page.locator('#builderTransferBtn').click();
  await expect(page.locator('#writingResponse')).toHaveValue(/Learning to cook is useful for me\./);
  await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem('rc_student_answers_' + id) || '{}').writing_4, ID)).toMatch(/Learning to cook is useful for me\./);
});

test('read-aloud and dictation stop each other without restarting old speech', async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL);
  await page.locator('#btnReadAloud').click();
  await expect(page.locator('#btnReadAloud')).toContainText('Stop Reading');
  await buttonFor(page, 'writingResponse').click();
  await expect(page.locator('#btnReadAloud')).toContainText('Read Aloud');
  await expect.poll(() => page.evaluate(() => window.__speechCancels)).toBeGreaterThan(0);
  await page.locator('#btnReadAloud').click();
  await expect.poll(() => page.evaluate(() => window.__recognitions[0].aborted)).toBe(true);
  await emit(page, [['The reader must not dictate this.']]);
  await expect(page.locator('#writingResponse')).toHaveValue('');
});

test('Submit waits for final words and never submits automatically', async ({ page, context, baseURL }) => {
  const { posts } = await setup(page, context, baseURL);
  await buttonFor(page, 'writingResponse').click();
  await emit(page, [['My first thought.']]);
  await page.locator('#submitWritingBtn').click();
  await expect(page.locator('.rc-modal-backdrop')).toHaveCount(0);
  await emit(page, [['My first thought.'], ['My final thought.']], -1, 1);
  await end(page);
  expect(posts.filter(p => p.submit).length).toBe(0);
  await page.locator('#submitWritingBtn').click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => posts.find(p => p.submit)?.writing_response).toBe('My first thought. My final thought.');
});

test('changing days or closing the assignment rejects late transcripts', async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL);
  await buttonFor(page, 'writingResponse').click();
  await chooseQuestions(page);
  await emit(page, [['Wrong day']]);
  await expect(page.locator('.st-text-answer').first()).toHaveValue('');
  await chooseWriting(page);
  await expect(page.locator('#writingResponse')).toHaveValue('');
  await buttonFor(page, 'writingResponse').click();
  await page.locator('#panelCloseBtn').click();
  await emit(page, [['Closed assignment']]);
  await expect(page.locator('#assignmentPanel')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__recognitions.at(-1).aborted)).toBe(true);
});

for (const status of ['Submitted', 'Graded']) test(`${status} work has no usable dictation controls`, async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL, { status, settings: { writing_response: 'Previously submitted answer.' } });
  await expect(page.locator('#writingResponse')).toBeDisabled();
  await expect(page.locator('.st-dictation-controls:visible')).toHaveCount(0);
  expect(await page.evaluate(() => window.__recognitions.length)).toBe(0);
});

for (const mode of ['unsupported', 'missingHelper']) test(`${mode} preserves ordinary writing`, async ({ page, context, baseURL }) => {
  const { errors } = await setup(page, context, baseURL, { [mode]: true });
  await page.locator('#writingResponse').fill('I can still type my complete answer.');
  await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem('rc_student_answers_' + id) || '{}').writing_4, ID)).toBe('I can still type my complete answer.');
  if (mode === 'unsupported') await expect(buttonFor(page, 'writingResponse')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('microphone denial leaves the existing answer editable with a retry option', async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL);
  await page.locator('#writingResponse').fill('Keep this thought.');
  await buttonFor(page, 'writingResponse').click();
  await page.evaluate(() => window.__recognitions.at(-1).onerror({ error: 'not-allowed' }));
  await expect(page.locator('#writingResponse')).toHaveValue('Keep this thought.');
  await expect(page.locator('.st-dictation-status:visible')).toContainText('Microphone access was not allowed');
  await expect(buttonFor(page, 'writingResponse')).toBeEnabled();
});

for (const sourceType of ['srcdoc', 'same-origin URL']) test(`${sourceType} answers use the parent microphone and existing HTML bridge`, async ({ page, context, baseURL }) => {
  const assignment = sourceType === 'srcdoc' ? { meta: { html_src: embeddedHtml } } : { page: '/dictation-test/embedded.html' };
  const { posts, errors } = await setup(page, context, baseURL, { assignment });
  const frame = page.frameLocator('#assignmentPanel iframe');
  const firstButton = buttonFor(frame, 'Q1');
  await firstButton.click();
  expect(await page.evaluate(() => window.__recognitions.length)).toBe(1);
  await emit(page, [['An embedded written answer.']]);
  await firstButton.click();
  await end(page);
  await expect(frame.locator('#Q1')).toHaveValue('An embedded written answer.');
  await expect.poll(() => posts.find(p => p.answers?.Q1 === 'An embedded written answer.')?.submit, { timeout: 7000 }).toBe(false);
  await buttonFor(frame, 'Q2').click();
  await emit(page, [['A short answer.']]);
  await end(page);
  await frame.locator('#submitEmbedded').click();
  await expect.poll(() => posts.find(p => p.submit === true)?.answers).toEqual({ Q1: 'An embedded written answer.', Q2: 'A short answer.' });
  expect(errors).toEqual([]);
});

test('keyboard Stop/Escape and a narrow screen keep the answer usable', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, context, baseURL);
  const button = buttonFor(page, 'writingResponse');
  await button.focus();
  await page.keyboard.press('Enter');
  await emit(page, [['I can explain my idea aloud.']]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#assignmentPanel')).toBeVisible();
  await end(page);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await button.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await button.evaluate(el => el.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
  await page.locator('#writingResponse').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/dictation-mobile.png' });
});
