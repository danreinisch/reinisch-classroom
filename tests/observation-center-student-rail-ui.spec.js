import {
  test,
  expect,
} from '@playwright/test';

const STUDENTS =
  Array.from(
    { length: 20 },
    (_, index) => {
      const suffix =
        String(index + 1)
          .padStart(2, '0');

      return {
        code:
          `SYN${suffix}`,
        name:
          `Student ${suffix} Example`,
        active: true,
        status: 'active',
      };
    }
  );

const GOALS =
  STUDENTS.map(
    student => ({
      id:
        `goal-${student.code.toLowerCase()}-observation`,
      student_code:
        student.code,
      code:
        `${student.code}.OBS1`,
      desc:
        `Synthetic observation target for ${student.code}.`,
      goal_area:
        'Synthetic Observation',
      status:
        'Open',
      measurement_type:
        'Observation',
      observation_config: {
        category:
          'session_outcome',
        required_per_week:
          2,
        target_met:
          2,
        target_window:
          3,
        class_periods: [
          'Period 2',
        ],
      },
    })
  );

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
        contentType:
          'application/json',
        body:
          JSON.stringify({
            ok: true,
            session: {
              code:
                'teacher_local',
              role:
                'teacher',
            },
          }),
      })
  );

  await page.route(
    '**/.netlify/functions/teacher-roster-context**',
    route =>
      route.fulfill({
        status: 200,
        contentType:
          'application/json',
        body:
          JSON.stringify({
            ok: true,
            students:
              STUDENTS,
            goals:
              GOALS,
            classes: [],
          }),
      })
  );

  await page.route(
    '**/.netlify/functions/teacher-sync-observations**',
    route => {
      if (
        route.request().method() ===
        'GET'
      ) {
        return route.fulfill({
          status: 200,
          contentType:
            'application/json',
          body:
            JSON.stringify({
              ok: true,
              entries: [],
            }),
        });
      }

      throw new Error(
        'OBS-9A navigation contract must never write observations'
      );
    }
  );

  await page.route(
    '**/.netlify/functions/teacher-submissions**',
    route =>
      route.fulfill({
        status: 200,
        contentType:
          'application/json',
        body:
          JSON.stringify({
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
        contentType:
          'application/json',
        body:
          JSON.stringify({
            ok: true,
            url:
              'http://127.0.0.1:54321',
            anonKey:
              'synthetic-local-anon-key',
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
          contentType:
            'application/json',
          body:
            JSON.stringify(
              SCHEDULE_ROWS
            ),
        });
      }

      return route.fulfill({
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
  'OBS-9A scalable student navigation rail',
  () => {
    test.beforeEach(
      async ({ page }) => {
        await page.setViewportSize({
          width: 1440,
          height: 900,
        });

        await installRoutes(
          page
        );

        await page.clock.install({
          time:
            new Date(
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
      'fixture control reaches Observation Center with twenty synthetic students',
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

        await expect(
          page.locator(
            '.obs-center-mode-student'
          )
        ).toHaveClass(
          /active/
        );
      }
    );

    test(
      'desktop Student mode presents all twenty students in one persistent scrollable rail',
      async ({ page }) => {
        const layout =
          page.locator(
            '.obs-center-student-layout'
          );

        const rail =
          page.locator(
            '.obs-center-student-rail'
          );

        const list =
          page.locator(
            '.obs-center-student-rail-list'
          );

        const items =
          page.locator(
            '.obs-center-student-rail-item'
          );

        await expect(
          layout
        ).toBeVisible();

        await expect(
          rail
        ).toBeVisible();

        await expect(
          items
        ).toHaveCount(20);

        await expect(
          page.locator(
            '.obs-center-student-combobox'
          )
        ).toHaveCount(0);

        await expect(
          page.locator(
            '.obs-center-student-listbox'
          )
        ).toHaveCount(0);

        const scrollState =
          await list.evaluate(
            element => {
              const style =
                getComputedStyle(
                  element
                );

              return {
                overflowY:
                  style.overflowY,
                clientHeight:
                  element.clientHeight,
                scrollHeight:
                  element.scrollHeight,
              };
            }
          );

        expect(
          [
            'auto',
            'scroll',
          ]
        ).toContain(
          scrollState.overflowY
        );

        expect(
          scrollState.scrollHeight
        ).toBeGreaterThan(
          scrollState.clientHeight
        );
      }
    );

    test(
      'rail search filters twenty students in place without opening a popup',
      async ({ page }) => {
        const rail =
          page.locator(
            '.obs-center-student-rail'
          );

        const search =
          page.locator(
            '.obs-center-student-rail-search'
          );

        const items =
          page.locator(
            '.obs-center-student-rail-item'
          );

        await expect(
          rail
        ).toBeVisible();

        await expect(
          search
        ).toBeVisible();

        await search.fill(
          'Student 17'
        );

        await expect(
          items
        ).toHaveCount(1);

        await expect(
          items.first()
        ).toContainText(
          'Student 17 Example'
        );

        await expect(
          rail
        ).toBeVisible();

        await expect(
          page.locator(
            '.obs-center-student-listbox'
          )
        ).toHaveCount(0);
      }
    );

    test(
      'teacher can switch directly between students while the rail remains available',
      async ({ page }) => {
        const search =
          page.locator(
            '.obs-center-student-rail-search'
          );

        const workspace =
          page.locator(
            '.obs-center-student-workspace'
          );

        await search.fill(
          'Student 17'
        );

        const student17 =
          page.locator(
            '.obs-center-student-rail-item[data-student-code="SYN17"]'
          );

        await expect(
          student17
        ).toBeVisible();

        await student17.click();

        await expect(
          student17
        ).toHaveAttribute(
          'aria-selected',
          'true'
        );

        await expect(
          workspace
        ).toContainText(
          'Student 17 Example'
        );

        await expect(
          workspace.locator(
            '.obs-center-capture-card[data-student-code="SYN17"]'
          )
        ).toHaveCount(1);

        await search.fill('');

        await expect(
          page.locator(
            '.obs-center-student-rail-item'
          )
        ).toHaveCount(20);

        const student03 =
          page.locator(
            '.obs-center-student-rail-item[data-student-code="SYN03"]'
          );

        await student03.click();

        await expect(
          student03
        ).toHaveAttribute(
          'aria-selected',
          'true'
        );

        await expect(
          student17
        ).toHaveAttribute(
          'aria-selected',
          'false'
        );

        await expect(
          workspace
        ).toContainText(
          'Student 03 Example'
        );

        await expect(
          workspace.locator(
            '.obs-center-capture-card[data-student-code="SYN03"]'
          )
        ).toHaveCount(1);

        await expect(
          page.locator(
            '.obs-center-student-rail'
          )
        ).toBeVisible();
      }
    );

    test(
      'rail polish stays compact, shows due state, and uses one student heading',
      async ({ page }) => {
        const rail =
          page.locator(
            '.obs-center-student-rail'
          );

        const firstStudent =
          page.locator(
            '.obs-center-student-rail-item[data-student-code="SYN01"]'
          );

        await expect(
          rail
        ).toBeVisible();

        const railWidth =
          await rail.evaluate(
            element =>
              element.getBoundingClientRect().width
          );

        expect(
          railWidth
        ).toBeLessThanOrEqual(
          280
        );

        const rowHeight =
          await firstStudent.evaluate(
            element =>
              element.getBoundingClientRect().height
          );

        expect(
          rowHeight
        ).toBeLessThanOrEqual(
          44
        );

        await expect(
          firstStudent.locator(
            '.obs-center-student-rail-status'
          )
        ).toContainText(
          /Due|Urgent|✓/
        );

        await firstStudent.click();

        const workspace =
          page.locator(
            '.obs-center-student-workspace'
          );

        await expect(
          workspace.locator(
            '.obs-center-student-heading'
          )
        ).toHaveCount(1);

        await expect(
          workspace.locator(
            '.obs-student-name'
          )
        ).toHaveCount(0);

        await expect(
          workspace.locator(
            '.obs-center-student-heading'
          )
        ).toContainText(
          'Student 01 Example (SYN01)'
        );
      }
    );
  }
);
