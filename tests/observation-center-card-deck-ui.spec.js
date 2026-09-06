import {
  test,
  expect,
} from '@playwright/test';

const TODAY =
  '2026-09-14';

const PREVIOUS_INSTRUCTIONAL_DAY =
  '2026-09-11';

const STUDENTS = [
  {
    code: 'SYN101',
    name: 'Alex Example',
    active: true,
    status: 'active',
  },
  {
    code: 'SYN103',
    name: 'Casey Example',
    active: true,
    status: 'active',
  },
];

const GOALS = [
  {
    id: 'goal-syn101-1',
    student_code: 'SYN101',
    code: 'SYN101.OBS1',
    desc: 'Use expected classroom participation behaviors.',
    goal_area: 'Behavior',
    status: 'Open',
    measurement_type: 'Observation',
    observation_config: {
      category: 'session_outcome',
      required_per_week: 2,
      target_met: 2,
      target_window: 3,
      class_periods: [
        'Period 2',
      ],
    },
  },

  {
    id: 'goal-syn103-1',
    student_code: 'SYN103',
    code: 'SYN103.OBS1',
    desc: 'Begin assigned classroom work within the expected time.',
    goal_area: 'Task Initiation',
    status: 'Open',
    measurement_type: 'Observation',
    observation_config: {
      category: 'session_outcome',
      required_per_week: 2,
      target_met: 2,
      target_window: 3,
      class_periods: [
        'Period 2',
      ],
    },
  },

  {
    id: 'goal-syn103-2',
    student_code: 'SYN103',
    code: 'SYN103.OBS2',
    desc: 'Respond to adult redirection using expected strategies.',
    goal_area: 'Self-Management',
    status: 'Open',
    measurement_type: 'Observation',
    observation_config: {
      category: 'session_outcome',
      required_per_week: 2,
      target_met: 2,
      target_window: 3,
      class_periods: [
        'Period 2',
      ],
    },
  },

  {
    id: 'goal-syn103-3',
    student_code: 'SYN103',
    code: 'SYN103.OBS3',
    desc: 'Use appropriate peer conversation topics and comments.',
    goal_area: 'Social Skills',
    status: 'Open',
    measurement_type: 'Observation',
    observation_config: {
      category: 'session_outcome',
      required_per_week: 2,
      target_met: 2,
      target_window: 3,
      class_periods: [
        'Period 2',
      ],
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
  {
    hour_number: 4,
    start_time: '10:30:00',
    end_time: '11:15:00',
    label: 'Period 4',
    is_planning: false,
  },
];

async function installRoutes(page) {
  await page.route(
    '**/.netlify/functions/teacher-session',
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
          students: STUDENTS,
          goals: GOALS,
          classes: [],
        }),
      })
  );

  await page.route(
    '**/.netlify/functions/teacher-sync-observations**',
    route => {
      if (
        route.request().method() === 'GET'
      ) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            entries: [],
          }),
        });
      }

      throw new Error(
        'OBS-8B browser contract must never write observations'
      );
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
      const url =
        route.request().url();

      if (
        url.includes(
          '/rest/v1/class_schedule'
        )
      ) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            SCHEDULE_ROWS
          ),
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

async function chooseCasey(page) {
  const input =
    page.locator(
      '.obs-center-student-combobox'
    );

  await input.click();

  await input.fill(
    'Casey'
  );

  const option =
    page.getByRole(
      'option',
      {
        name:
          'Casey Example (SYN103)',
        exact: true,
      }
    );

  await expect(
    option
  ).toBeVisible();

  await option.click();

  await expect(
    input
  ).toHaveValue(
    'Casey Example (SYN103)'
  );
}

test.describe(
  'OBS-8B card-deck Observation Center',
  () => {
    test.beforeEach(
      async ({ page }) => {
        await installRoutes(
          page
        );

        await page.clock.install({
          time: new Date(
            '2026-09-14T09:00:00-05:00'
          ),
        });

        await page.goto(
          '/teacher/observations/'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name:
                'Observation Center',
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'fixture control reaches Observation Center',
      async ({ page }) => {
        await expect(
          page.getByRole(
            'heading',
            {
              name:
                'Observation Center',
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'uses one searchable student combobox and removes legacy student controls',
      async ({ page }) => {
        const input =
          page.locator(
            '.obs-center-student-combobox'
          );

        await expect(
          input
        ).toHaveCount(1);

        await expect(
          input
        ).toHaveAttribute(
          'aria-autocomplete',
          'list'
        );

        await expect(
          page.locator(
            '.obs-center-student-search'
          )
        ).toHaveCount(0);

        await expect(
          page.locator(
            '.obs-center-student-select'
          )
        ).toHaveCount(0);

        await expect(
          page.getByText(
            'Find observations by',
            {
              exact: true,
            }
          )
        ).toHaveCount(0);
      }
    );

    test(
      'three-goal student renders three capture cards',
      async ({ page }) => {
        await chooseCasey(
          page
        );

        await expect(
          page.locator(
            '.obs-center-card-grid'
          )
        ).toBeVisible();

        await expect(
          page.locator(
            '.obs-center-capture-card'
          )
        ).toHaveCount(3);
      }
    );

    test(
      'capture cards carry student and goal identity',
      async ({ page }) => {
        await chooseCasey(
          page
        );

        const cards =
          page.locator(
            '.obs-center-capture-card[data-student-code="SYN103"]'
          );

        await expect(
          cards
        ).toHaveCount(3);

        const goalCodes =
          await cards.evaluateAll(
            nodes =>
              nodes
                .map(
                  node =>
                    node.getAttribute(
                      'data-goal-code'
                    )
                )
                .sort()
          );

        expect(
          goalCodes
        ).toEqual([
          'SYN103.OBS1',
          'SYN103.OBS2',
          'SYN103.OBS3',
        ]);
      }
    );

    test(
      'deck arrows move previous and next by instructional day',
      async ({ page }) => {
        await chooseCasey(
          page
        );

        const dateInput =
          page.locator(
            '.obs-center-date-current'
          );

        await expect(
          dateInput
        ).toHaveValue(
          TODAY
        );

        await page.locator(
          '.obs-center-date-prev'
        ).click();

        await expect(
          dateInput
        ).toHaveValue(
          PREVIOUS_INSTRUCTIONAL_DAY
        );

        await page.locator(
          '.obs-center-date-next'
        ).click();

        await expect(
          dateInput
        ).toHaveValue(
          TODAY
        );
      }
    );

    test(
      'historical three-card deck stays visible but locked until period is explicit',
      async ({ page }) => {
        await chooseCasey(
          page
        );

        await page.locator(
          '.obs-center-date-prev'
        ).click();

        await expect(
          page.locator(
            '.obs-center-period-gate'
          )
        ).toBeVisible();

        await expect(
          page.locator(
            '.obs-center-capture-card'
          )
        ).toHaveCount(3);

        await expect(
          page.locator(
            '.obs-center-goal-locked'
          )
        ).toHaveCount(3);

        const periodSelect =
          page.getByRole(
            'combobox',
            {
              name:
                'Select class period',
            }
          );

        await periodSelect.selectOption(
          'Period 2'
        );

        await expect(
          page.locator(
            '.obs-center-goal-locked'
          )
        ).toHaveCount(0);
      }
    );

    test(
      'class-period browsing remains a secondary view',
      async ({ page }) => {
        const periodView =
          page.locator(
            '.obs-center-view-period'
          );

        await expect(
          page.locator(
            '.obs-center-view-toggle'
          )
        ).toBeVisible();

        await expect(
          periodView
        ).toBeVisible();

        await periodView.click();

        await expect(
          periodView
        ).toHaveAttribute(
          'aria-pressed',
          'true'
        );

        await expect(
          page.getByRole(
            'combobox',
            {
              name:
                'Select class period',
            }
          )
        ).toBeVisible();
      }
    );
  }
);
