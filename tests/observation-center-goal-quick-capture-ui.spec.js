import {
  test,
  expect,
} from '@playwright/test';

const STUDENT = {
  code: 'SYN101',
  name: 'Casey Example',
  active: true,
  status: 'active',
};

const GOALS = [
  {
    id: 'goal-session',
    student_code: STUDENT.code,
    code: 'SYN101.SESSION',
    desc: 'Responds appropriately during the observed session.',
    goal_area: 'Session Participation',
    status: 'Open',
    measurement_type: 'Observation',
    observation_config: {
      category: 'session_outcome',
      required_per_week: 2,
      target_met: 2,
      target_window: 3,
      class_periods: ['Period 2'],
    },
  },
  {
    id: 'goal-tally',
    student_code: STUDENT.code,
    code: 'SYN101.TALLY',
    desc: 'Completes the expected response when an opportunity occurs.',
    goal_area: 'Response Accuracy',
    status: 'Open',
    measurement_type: 'Observation',
    observation_config: {
      category: 'tally',
      required_per_week: 2,
      class_periods: ['Period 2'],
    },
  },
  {
    id: 'goal-prompts',
    student_code: STUDENT.code,
    code: 'SYN101.PROMPTS',
    desc: 'Completes the task with reduced adult prompting.',
    goal_area: 'Independence',
    status: 'Open',
    measurement_type: 'Observation',
    observation_config: {
      category: 'prompt_count',
      target_max_prompts: 2,
      required_per_week: 2,
      class_periods: ['Period 2'],
    },
  },
  {
    id: 'goal-checklist',
    student_code: STUDENT.code,
    code: 'SYN101.CHECK',
    desc: 'Demonstrates the configured classroom behaviors.',
    goal_area: 'Classroom Behavior',
    status: 'Open',
    measurement_type: 'Observation',
    observation_config: {
      category: 'behavior_checklist',
      sub_behaviors: [
        'Begins work',
        'Stays engaged',
        'Requests help appropriately',
      ],
      required_per_week: 2,
      class_periods: ['Period 2'],
    },
  },
];

const SCHEDULE_ROWS = [
  {
    hour_number: 1,
    start_time: '08:00:00',
    end_time: '08:45:00',
    label: 'Period 1',
    is_planning: false,
  },
  {
    hour_number: 2,
    start_time: '08:50:00',
    end_time: '09:35:00',
    label: 'Period 2',
    is_planning: false,
  },
  {
    hour_number: 3,
    start_time: '09:40:00',
    end_time: '10:25:00',
    label: 'Planning',
    is_planning: true,
  },
];

async function installRoutes(page, writes) {
  await page.route(
    '**/.netlify/functions/teacher-session**',
    route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          session: {
            code: 'teacher_local',
            role: 'teacher',
          },
        }),
      })
  );

  await page.route(
    '**/.netlify/functions/teacher-roster-context**',
    route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [STUDENT],
          goals: GOALS,
          classes: [],
        }),
      })
  );

  await page.route(
    '**/.netlify/functions/teacher-sync-observations**',
    async route => {
      const request = route.request();

      if (request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            entries: [],
          }),
        });
      }

      writes.push(
        await request.postDataJSON()
      );

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          synced: 1,
        }),
      });
    }
  );

  await page.route(
    '**/.netlify/functions/teacher-submissions**',
    route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          submissions: [],
        }),
      })
  );

  await page.route(
    '**/.netlify/functions/browser-supabase-config',
    route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          url: 'http://127.0.0.1:54321',
          anonKey: 'synthetic-local-anon-key',
        }),
      })
  );

  await page.route(
    '**/rest/v1/**',
    route => {
      if (
        route.request().url().includes(
          '/rest/v1/class_schedule'
        )
      ) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(SCHEDULE_ROWS),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
  );
}

function goalCard(page, code) {
  return page.locator(
    `.obs-center-capture-card[data-goal-code="${code}"] > .obs-goal-card`
  );
}

async function chooseStudent(page) {
  const student = page.locator(
    '.obs-center-student-rail-item[data-student-code="SYN101"]'
  );

  await student.click();

  await expect(
    page.locator('.obs-center-student-heading')
  ).toContainText('Casey Example');
}

test.describe(
  'OBS-9B goal-driven quick capture',
  () => {
    let writes;

    test.beforeEach(
      async ({ page }) => {
        writes = [];

        await page.setViewportSize({
          width: 1440,
          height: 900,
        });

        await installRoutes(page, writes);

        await page.clock.install({
          time: new Date(
            '2026-09-14T09:00:00-05:00'
          ),
        });

        await page.goto('/teacher/observations/');

        await expect(
          page.getByRole('heading', {
            name: 'Observation Center',
          })
        ).toBeVisible();

        await chooseStudent(page);
      }
    );

    test(
      'four goal categories become expanded quick-capture cards with secondary note and disposition controls',
      async ({ page }) => {
        const cards = page.locator(
          '.obs-center-quick-capture'
        );

        await expect(cards).toHaveCount(4);

        await expect(
          goalCard(page, 'SYN101.SESSION')
        ).toHaveClass(/obs-center-quick-session/);

        await expect(
          goalCard(page, 'SYN101.TALLY')
        ).toHaveClass(/obs-center-quick-tally/);

        await expect(
          goalCard(page, 'SYN101.PROMPTS')
        ).toHaveClass(/obs-center-quick-prompt/);

        await expect(
          goalCard(page, 'SYN101.CHECK')
        ).toHaveClass(/obs-center-quick-checklist/);

        for (const code of [
          'SYN101.SESSION',
          'SYN101.TALLY',
          'SYN101.PROMPTS',
          'SYN101.CHECK',
        ]) {
          const card = goalCard(page, code);

          await expect(
            card.locator('.obs-card-header')
          ).toHaveAttribute(
            'aria-expanded',
            'true'
          );

          const disposition = card.locator(
            '.obs-center-quick-disposition'
          );

          const note = card.locator(
            '.obs-center-quick-note'
          );

          await expect(disposition).toHaveCount(1);
          await expect(note).toHaveCount(1);

          expect(
            await disposition.evaluate(
              element => element.open
            )
          ).toBe(false);

          expect(
            await note.evaluate(
              element => element.open
            )
          ).toBe(false);
        }
      }
    );

    test(
      'session outcome remains one click, saves through the established endpoint, and stays open for context',
      async ({ page }) => {
        const card = goalCard(
          page,
          'SYN101.SESSION'
        );

        await card
          .getByRole('radio', {
            name: 'Mark as Met',
          })
          .click();

        await expect.poll(
          () => writes.length
        ).toBe(1);

        expect(
          writes[0].entries[0].goal_id
        ).toBe('goal-session');

        expect(
          writes[0].entries[0].percent
        ).toBe(100);

        await expect(
          card.locator('.obs-card-header')
        ).toHaveAttribute(
          'aria-expanded',
          'true'
        );

        await expect(
          card.locator('.obs-save-indicator')
        ).toContainText(/Saved ✓|Auto-saved ✓/);

        await card
          .locator('.obs-center-quick-note > summary')
          .click();

        await expect(
          card.locator('.obs-note-input')
        ).toBeVisible();
      }
    );

    test(
      'prompt count remains a five-choice one-click capture',
      async ({ page }) => {
        const card = goalCard(
          page,
          'SYN101.PROMPTS'
        );

        await expect(
          card.locator('.obs-prompt-btn')
        ).toHaveCount(5);

        await card
          .getByRole('button', {
            name: '1 prompts',
          })
          .click();

        await expect.poll(
          () => writes.length
        ).toBe(1);

        expect(
          writes[0].entries[0].goal_id
        ).toBe('goal-prompts');

        expect(
          writes[0].entries[0].percent
        ).toBe(1);
      }
    );

    test(
      'tally waits for an opportunity count, shows the percentage, then saves once',
      async ({ page }) => {
        const card = goalCard(
          page,
          'SYN101.TALLY'
        );

        const inputs = card.locator(
          '.obs-tally-input'
        );

        await expect(inputs).toHaveCount(2);

        await inputs.nth(0).fill('3');
        await inputs.nth(0).blur();

        expect(writes).toHaveLength(0);

        await inputs.nth(1).fill('4');
        await inputs.nth(1).blur();

        await expect.poll(
          () => writes.length
        ).toBe(1);

        await expect(
          card.locator('.obs-tally-result')
        ).toHaveText('75%');

        expect(
          writes[0].entries[0].goal_id
        ).toBe('goal-tally');

        expect(
          writes[0].entries[0].percent
        ).toBe(75);
      }
    );

    test(
      'behavior checklist presents configured behaviors as scan-friendly toggles and saves a toggle',
      async ({ page }) => {
        const card = goalCard(
          page,
          'SYN101.CHECK'
        );

        const items = card.locator(
          '.obs-checklist-item'
        );

        await expect(items).toHaveCount(3);
        await expect(items.nth(0)).toContainText(
          'Begins work'
        );
        await expect(items.nth(1)).toContainText(
          'Stays engaged'
        );
        await expect(items.nth(2)).toContainText(
          'Requests help appropriately'
        );

        await items.nth(0)
          .locator('input[type="checkbox"]')
          .check();

        await expect.poll(
          () => writes.length
        ).toBe(1);

        expect(
          writes[0].entries[0].goal_id
        ).toBe('goal-checklist');

        expect(
          writes[0].entries[0].percent
        ).toBe(33);

        await expect(
          card.locator('.obs-checklist-summary')
        ).toHaveText(
          '1 of 3 behaviors demonstrated'
        );
      }
    );

    test(
      'desktop goal cards are wide enough to avoid the former cramped three-across layout',
      async ({ page }) => {
        const cards = page.locator(
          '.obs-center-capture-card'
        );

        await expect(cards).toHaveCount(4);

        const boxes = [];

        for (let index = 0; index < 4; index += 1) {
          boxes.push(
            await cards.nth(index).boundingBox()
          );
        }

        for (const box of boxes) {
          expect(box).not.toBeNull();
          expect(box.width).toBeGreaterThanOrEqual(360);
        }

        const firstRowTop = boxes[0].y;
        const firstRowCount = boxes.filter(
          box => Math.abs(box.y - firstRowTop) < 4
        ).length;

        expect(firstRowCount).toBeLessThanOrEqual(2);
      }
    );
  }
);
