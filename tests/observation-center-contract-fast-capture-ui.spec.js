import { test, expect } from '@playwright/test';

const STUDENTS = [
  { code: 'S060', name: 'Synthetic S060', active: true, status: 'active' },
  { code: 'S071', name: 'Synthetic S071', active: true, status: 'active' },
  { code: 'S069', name: 'Synthetic S069', active: true, status: 'active' },
];

const GOALS = [
  {
    id: 'goal-s060-cg1', student_code: 'S060', code: 'S060.CG1',
    desc: 'Synthetic composite reading trial.', goal_area: 'Basic Reading',
    status: 'Open', measurement_type: 'x/y', observation_config: null,
  },
  {
    id: 'goal-s060-cg2', student_code: 'S060', code: 'S060.CG2',
    desc: 'Synthetic task completion and prompt count.', goal_area: 'Behavior',
    status: 'Open', measurement_type: 'Number', observation_config: null,
  },
  {
    id: 'goal-s071-cg1', student_code: 'S071', code: 'S071.CG1',
    desc: 'Synthetic two-check-per-period opportunity.', goal_area: 'Social Skills',
    status: 'Open', measurement_type: 'x/y', observation_config: null,
  },
  {
    id: 'goal-s069-cg1', student_code: 'S069', code: 'S069.CG1',
    desc: 'Synthetic benchmark-only parent goal.', goal_area: 'Reading Comprehension',
    status: 'Open', measurement_type: 'Observation', observation_config: null,
  },
];

const SCHEDULE_ROWS = [
  { hour_number: 1, start_time: '08:00:00', end_time: '08:45:00', label: 'Period 1', is_planning: false },
  { hour_number: 2, start_time: '08:50:00', end_time: '09:35:00', label: 'Period 2', is_planning: false },
  { hour_number: 3, start_time: '09:40:00', end_time: '10:25:00', label: 'Planning', is_planning: true },
];

async function installRoutes(page, writes) {
  await page.route('**/.netlify/functions/teacher-session**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, session: { code: 'teacher_local', role: 'teacher' } }) })
  );

  await page.route('**/.netlify/functions/teacher-roster-context**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, students: STUDENTS, goals: GOALS, classes: [] }) })
  );

  await page.route('**/.netlify/functions/teacher-sync-observations**', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, entries: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, synced: 1 }) });
  });

  await page.route('**/.netlify/functions/teacher-contract-observation**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, events: [], dispositions: [], legacy_present: false }),
      });
    }

    const body = await request.postDataJSON();
    writes.push(body);
    const success = body.action === 'save'
      ? body.data?.result === 'not_met' ? false : true
      : null;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        result: body.action === 'disposition'
          ? { event_key: body.event_key, disposition: body.disposition, class_period: body.class_period }
          : { event_key: body.event_key, data: body.data, value: success === false ? 0 : 100, success, class_period: body.class_period || null },
      }),
    });
  });

  await page.route('**/.netlify/functions/teacher-submissions**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, submissions: [] }) })
  );

  await page.route('**/.netlify/functions/browser-supabase-config', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'http://127.0.0.1:54321', anonKey: 'synthetic-local-anon-key' }) })
  );

  await page.route('**/rest/v1/**', route => {
    if (route.request().url().includes('/rest/v1/class_schedule')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCHEDULE_ROWS) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
}

function goalCard(page, code) {
  return page.locator(`.obs-center-capture-card[data-goal-code="${code}"] > .obs-goal-card`);
}

async function chooseStudent(page, code) {
  await page.locator(`.obs-center-student-rail-item[data-student-code="${code}"]`).click();
}

test.describe('OBS-NQ2 reviewed-contract fast capture', () => {
  let writes;

  test.beforeEach(async ({ page }) => {
    writes = [];
    await page.setViewportSize({ width: 1440, height: 900 });
    await installRoutes(page, writes);
    await page.clock.install({ time: new Date('2026-09-14T09:00:00-05:00') });
    await page.goto('/teacher/observations/');
    await expect(page.getByRole('heading', { name: 'Observation Center' })).toBeVisible();
  });

  test('x/y and Number reviewed goals enter Observation Center without changing the roster payload', async ({ page }) => {
    await chooseStudent(page, 'S060');
    await expect(goalCard(page, 'S060.CG1')).toHaveClass(/obs-center-contract-capture/);
    await expect(goalCard(page, 'S060.CG2')).toHaveClass(/obs-center-contract-capture/);

    await chooseStudent(page, 'S069');
    await expect(page.locator('.obs-center-capture-card[data-goal-code="S069.CG1"]')).toHaveCount(0);
  });

  test('S071 gets two independent one-click checks in the same period', async ({ page }) => {
    await chooseStudent(page, 'S071');
    const card = goalCard(page, 'S071.CG1');
    await expect(card).toHaveClass(/obs-center-contract-capture/);
    await expect(card.locator('.obs-contract-slot')).toHaveCount(2);

    await card.locator('.obs-contract-slot').nth(0).getByRole('button', { name: 'Met', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].event_key).toContain('slot:1');
    expect(writes[0].data).toEqual({ result: 'met' });

    await card.locator('.obs-contract-slot').nth(1).getByRole('button', { name: 'Not Met', exact: true }).click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1].event_key).toContain('slot:2');
    expect(writes[1].data).toEqual({ result: 'not_met' });
    await expect(card.locator('.obs-card-status')).toContainText('2/2 checks');
  });

  test('S060 composite can be one click and prompt-count capture waits for both required fields', async ({ page }) => {
    await chooseStudent(page, 'S060');

    const reading = goalCard(page, 'S060.CG1');
    await reading.getByRole('button', { name: 'All Met', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].data.components).toEqual({
      independent_reading: 'met',
      comprehension_participation: 'met',
      regulation_strategy_use: 'met',
    });

    const task = goalCard(page, 'S060.CG2');
    await task.getByRole('button', { name: 'Completed', exact: true }).click();
    await page.waitForTimeout(20);
    expect(writes.length).toBe(1);

    await task.locator('.obs-contract-prompt-grid button').filter({ hasText: /^1$/ }).click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1].data).toEqual({ completed: true, prompt_count: 1 });
  });
});
