import {
  test,
  expect,
} from '@playwright/test';

const HISTORICAL_DAY =
  '2026-09-04';

const STUDENTS = [
  {
    code: 'SYN101',
    name: 'Alex Example',
    active: true,
    status: 'active',
  },
  {
    code: 'SYN102',
    name: 'Bailey Sample',
    active: true,
    status: 'active',
  },
];

const GOALS = [
  {
    id: 'goal-syn101-observation',
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
    id: 'goal-syn102-observation',
    student_code: 'SYN102',
    code: 'SYN102.OBS1',
    desc: 'Respond to adult prompts using expected self-management strategies.',
    goal_area: 'Self-Management',
    status: 'Open',
    measurement_type: 'Observation',
    observation_config: {
      category: 'prompt_count',
      required_per_week: 2,
      target_max_prompts: 2,
      class_periods: [],
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

async function installObs7Routes(page) {
  await page.route(
    '**/.netlify/functions/teacher-session',
    route => {
      route.fulfill({
        status: 200,
        contentType:
          'application/json',
        body: JSON.stringify({
          ok: true,
          session: {
            code:
              'teacher_local',
            role:
              'teacher',
          },
        }),
      });
    }
  );

  await page.route(
    '**/.netlify/functions/teacher-roster-context**',
    route => {
      route.fulfill({
        status: 200,
        contentType:
          'application/json',
        body: JSON.stringify({
          ok: true,
          students:
            STUDENTS,
          goals:
            GOALS,
          classes: [],
        }),
      });
    }
  );

  await page.route(
    '**/.netlify/functions/teacher-sync-observations**',
    route => {
      const request =
        route.request();

      if (
        request.method() ===
        'GET'
      ) {
        route.fulfill({
          status: 200,
          contentType:
            'application/json',
          body: JSON.stringify({
            ok: true,
            entries: [],
          }),
        });

        return;
      }

      throw new Error(
        'OBS-7 browser contract must never write observations'
      );
    }
  );

  await page.route(
    '**/.netlify/functions/teacher-submissions**',
    route => {
      route.fulfill({
        status: 200,
        contentType:
          'application/json',
        body: JSON.stringify({
          ok: true,
          submissions: [],
        }),
      });
    }
  );

  await page.route(
    '**/.netlify/functions/browser-supabase-config',
    route => {
      route.fulfill({
        status: 200,
        contentType:
          'application/json',
        body: JSON.stringify({
          ok: true,
          url:
            'http://127.0.0.1:54321',
          anonKey:
            'synthetic-local-anon-key',
        }),
      });
    }
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
        route.fulfill({
          status: 200,
          contentType:
            'application/json',
          body:
            JSON.stringify(
              SCHEDULE_ROWS
            ),
        });

        return;
      }

      route.fulfill({
        status: 200,
        contentType:
          'application/json',
        body:
          JSON.stringify([]),
      });
    }
  );
}

test.describe(
  'OBS-7 student-first Observation Center',
  () => {
    test.beforeEach(
      async ({ page }) => {
        await installObs7Routes(
          page
        );

        await page.clock.install({
          time: new Date(
            '2026-09-08T09:00:00-05:00'
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
      'defaults to Student mode and lists students with observation goals',
      async ({ page }) => {
        const studentMode =
          page.locator(
            '.obs-center-mode-student'
          );

        const periodMode =
          page.locator(
            '.obs-center-mode-period'
          );

        await expect(
          studentMode
        ).toHaveClass(
          /active/
        );

        await expect(
          studentMode
        ).toHaveAttribute(
          'aria-pressed',
          'true'
        );

        await expect(
          periodMode
        ).toHaveAttribute(
          'aria-pressed',
          'false'
        );

        const studentCombobox =
          page.locator(
            '.obs-center-student-rail-search'
          );

        await expect(
          studentCombobox
        ).toHaveCount(1);

        await expect(
          studentCombobox
        ).toHaveAttribute(
          'aria-label',
          'Search students'
        );

        await studentCombobox.click();

        await expect(
          page.getByRole(
            'option',
            {
              name:
                'Alex Example (SYN101)',
              exact: true,
            }
          )
        ).toBeVisible();

        await expect(
          page.getByRole(
            'option',
            {
              name:
                'Bailey Sample (SYN102)',
              exact: true,
            }
          )
        ).toBeVisible();

        await expect(
          page.getByText(
            /Select a student to view observational goals/i
          )
        ).toBeVisible();
      }
    );

    test(
      'student search filters the existing observation roster',
      async ({ page }) => {
        const studentCombobox =
          page.locator(
            '.obs-center-student-rail-search'
          );

        await studentCombobox.click();

        await studentCombobox.fill(
          'Bailey'
        );

        await expect(
          page.getByRole(
            'option',
            {
              name:
                'Bailey Sample (SYN102)',
              exact: true,
            }
          )
        ).toBeVisible();

        await expect(
          page.getByRole(
            'option',
            {
              name:
                'Alex Example (SYN101)',
              exact: true,
            }
          )
        ).toHaveCount(0);
      }
    );

    test(
      'selecting a student renders that student observation goal without requiring class-mode selection',
      async ({ page }) => {
        const studentCombobox =
          page.locator(
            '.obs-center-student-rail-search'
          );

        await studentCombobox.click();

        await studentCombobox.fill(
          'Bailey'
        );

        await page.getByRole(
          'option',
          {
            name:
              'Bailey Sample (SYN102)',
            exact: true,
          }
        ).click();

        await expect(
          page.getByText(
            'Bailey Sample — September 8, 2026',
            {
              exact: true,
            }
          )
        ).toBeVisible();

        await expect(
          page.getByText(
            'Respond to adult prompts using expected self-management strategies.',
            {
              exact: true,
            }
          )
        ).toBeVisible();

        await expect(
          page.locator(
            '.obs-center-goal-period'
          )
        ).toContainText(
          'Configured period: not set'
        );

        await expect(
          page.locator(
            '.obs-goal-card'
          )
        ).toHaveCount(1);
      }
    );

    test(
      'bell schedule supplies period choices even beyond configured goal periods',
      async ({ page }) => {
        await page.locator(
          '.obs-center-view-period'
        ).click();

        const periodSelect =
          page.getByRole(
            'combobox',
            {
              name:
                'Select class period',
            }
          );

        await expect(
          periodSelect
        ).toBeVisible();

        await expect(
          periodSelect
        ).toContainText(
          'Period 1'
        );

        await expect(
          periodSelect
        ).toContainText(
          'Period 2'
        );

        await expect(
          periodSelect
        ).toContainText(
          'Period 4'
        );

        await expect(
          periodSelect
        ).not.toContainText(
          'Planning'
        );
      }
    );

    test(
      'Class Period mode remains available and filters to configured goals',
      async ({ page }) => {
        await page.locator(
          '.obs-center-mode-period'
        ).click();

        await expect(
          page.locator(
            '.obs-center-mode-period'
          )
        ).toHaveClass(
          /active/
        );

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
            '.obs-student-name'
          ).filter({
            hasText:
              /^Alex Example \(SYN101\)$/,
          })
        ).toBeVisible();

        await expect(
          page.getByText(
            'Use expected classroom participation behaviors.',
            {
              exact: true,
            }
          )
        ).toBeVisible();

        await expect(
          page.locator(
            '.obs-student-name'
          ).filter({
            hasText:
              /^Bailey Sample \(SYN102\)$/,
          })
        ).toHaveCount(0);
      }
    );

    test(
      'historical Student mode shows goals but keeps capture locked until period is explicit',
      async ({ page }) => {
        const studentCombobox =
          page.locator(
            '.obs-center-student-rail-search'
          );

        await studentCombobox.click();

        await studentCombobox.fill(
          'Alex'
        );

        await page.getByRole(
          'option',
          {
            name:
              'Alex Example (SYN101)',
            exact: true,
          }
        ).click();

        const dateInput =
          page.locator(
            '.obs-center-date-input'
          );

        await dateInput.fill(
          HISTORICAL_DAY
        );

        await dateInput.dispatchEvent(
          'change'
        );

        await expect(
          page.getByText(
            'Use expected classroom participation behaviors.',
            {
              exact: true,
            }
          )
        ).toBeVisible();

        await expect(
          page.getByText(
            /Choose the observation period above before entering historical data/i
          )
        ).toBeVisible();

        await expect(
          page.locator(
            '.obs-center-goal-locked'
          )
        ).toHaveCount(1);

        const periodSelect =
          page.getByRole(
            'combobox',
            {
              name:
                'Select class period',
            }
          );

        await expect(
          periodSelect
        ).toBeVisible();

        await expect(
          periodSelect
        ).toHaveValue('');

        await periodSelect.selectOption(
          'Period 2'
        );

        await expect(
          page.locator(
            '.obs-center-goal-locked'
          )
        ).toHaveCount(0);

        await expect(
          page.locator(
            '.obs-goal-card'
          )
        ).toHaveCount(1);

        await expect(
          page.locator(
            '.obs-center-goal-period'
          )
        ).toContainText(
          'Recording as: Period 2'
        );
      }
    );

  }
);
