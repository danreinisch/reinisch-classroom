import { test, expect } from '@playwright/test';

const TODAY =
  '2026-09-08';

const HISTORICAL_INSTRUCTIONAL_DAY =
  '2026-09-04';

const LABOR_DAY =
  '2026-09-07';

async function installSyntheticTeacherRoutes(page) {
  await page.route(
    '**/.netlify/functions/teacher-session',
    route => {
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
      });
    }
  );

  await page.route(
    '**/.netlify/functions/teacher-roster-context**',
    route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [],
          goals: [],
          classes: [],
        }),
      });
    }
  );

  await page.route(
    '**/.netlify/functions/teacher-sync-observations**',
    route => {
      const request = route.request();

      if (request.method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            entries: [],
          }),
        });
        return;
      }

      throw new Error(
        'OBS-6 UI contract must never write observations'
      );
    }
  );

  await page.route(
    '**/.netlify/functions/teacher-submissions**',
    route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
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
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          url: 'http://127.0.0.1:54321',
          anonKey: 'synthetic-local-anon-key',
        }),
      });
    }
  );

  await page.route(
    '**/rest/v1/**',
    route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
  );
}

test.describe(
  'OBS-6 Observation Center',
  () => {
    test.beforeEach(async ({ page }) => {
      await installSyntheticTeacherRoutes(page);

      await page.clock.install({
        time: new Date(
          '2026-09-08T09:00:00-05:00'
        ),
      });

      await page.goto(
        '/teacher/observations/'
      );
    });

    test(
      'loads in the native Teacher Center shell with Observations active',
      async ({ page }) => {
        await expect(
          page.getByText(
            'Teacher Center — Observations',
            { exact: true }
          )
        ).toBeVisible();

        const observationsNav =
          page.locator(
            '.tc-nav a[href="/teacher/observations/"]'
          );

        await expect(
          observationsNav
        ).toHaveCount(1);

        await expect(
          observationsNav
        ).toHaveAttribute(
          'aria-current',
          'page'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: 'Observation Center',
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'defaults to today and blocks future dates',
      async ({ page }) => {
        const dateInput =
          page.locator(
            '.obs-center-date-input'
          );

        await expect(
          dateInput
        ).toHaveValue(TODAY);

        await expect(
          dateInput
        ).toHaveAttribute(
          'max',
          TODAY
        );

        await expect(
          page.getByRole(
            'button',
            { name: 'Next' }
          )
        ).toBeDisabled();

        await expect(
          page.getByRole(
            'button',
            { name: 'Today' }
          )
        ).toBeDisabled();
      }
    );

    test(
      'historical instructional date requires deliberate period selection',
      async ({ page }) => {
        const dateInput =
          page.locator(
            '.obs-center-date-input'
          );

        await dateInput.fill(
          HISTORICAL_INSTRUCTIONAL_DAY
        );

        await dateInput.dispatchEvent(
          'change'
        );

        await expect(
          page.getByText(
            /Select a class period before entering historical observational data/i
          )
        ).toBeVisible();

        await expect(
          page.getByRole(
            'combobox',
            {
              name:
                'Select class period',
            }
          )
        ).toHaveValue('');
      }
    );

    test(
      'non-instructional date shows calendar reason and no capture cards',
      async ({ page }) => {
        const dateInput =
          page.locator(
            '.obs-center-date-input'
          );

        await dateInput.fill(
          LABOR_DAY
        );

        await dateInput.dispatchEvent(
          'change'
        );

        await expect(
          page.getByText(
            /No observations scheduled — Labor Day\./i
          )
        ).toBeVisible();

        await expect(
          page.locator(
            '.obs-goal-card'
          )
        ).toHaveCount(0);
      }
    );

    test(
      'Previous Today Next controls skip non-instructional days safely',
      async ({ page }) => {
        const dateInput =
          page.locator(
            '.obs-center-date-input'
          );

        await page.getByRole(
          'button',
          { name: 'Previous' }
        ).click();

        await expect(
          dateInput
        ).toHaveValue(
          HISTORICAL_INSTRUCTIONAL_DAY
        );

        await expect(
          page.getByRole(
            'button',
            { name: 'Today' }
          )
        ).toBeEnabled();

        await expect(
          page.getByRole(
            'button',
            { name: 'Next' }
          )
        ).toBeEnabled();

        await page.getByRole(
          'button',
          { name: 'Next' }
        ).click();

        await expect(
          dateInput
        ).toHaveValue(
          TODAY
        );

        await expect(
          page.getByRole(
            'button',
            { name: 'Next' }
          )
        ).toBeDisabled();

        await page.getByRole(
          'button',
          { name: 'Previous' }
        ).click();

        await page.getByRole(
          'button',
          { name: 'Today' }
        ).click();

        await expect(
          dateInput
        ).toHaveValue(
          TODAY
        );
      }
    );

    test(
      'real-time Observation Tray remains available',
      async ({ page }) => {
        const trayButton =
          page.locator(
            '.obs-tray-icon-btn'
          );

        await expect(
          trayButton
        ).toHaveCount(1);

        await trayButton.click();

        await expect(
          page.locator('.obs-tray')
        ).toBeVisible();

        await expect(
          page.locator(
            '.obs-tray'
          )
        ).toContainText(
          /Observation/i
        );
      }
    );
  }
);
