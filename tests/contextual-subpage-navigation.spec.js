import { test, expect } from '@playwright/test';

const routes = [
  {
    route: '/language-arts/',
    label: 'Home',
    parent: '/'
  },
  {
    route: '/life-skills/',
    label: 'Home',
    parent: '/'
  },
  {
    route: '/toolkits/',
    label: 'Home',
    parent: '/'
  },
  {
    route: '/language-arts/collection/?collection=1984-2026-27',
    label: 'Language Arts',
    parent: '/language-arts/'
  },
  {
    route: '/language-arts/a-door-into-time/',
    label: 'Language Arts',
    parent: '/language-arts/'
  },
  {
    route: '/language-arts/lost-in-kragdon-ah/',
    label: 'Language Arts',
    parent: '/language-arts/'
  },
  {
    route: '/language-arts/return-from-kragdon-ah/',
    label: 'Language Arts',
    parent: '/language-arts/'
  },
  {
    route: '/language-arts/warrior-of-kragdon-ah/',
    label: 'Language Arts',
    parent: '/language-arts/'
  },
  {
    route: '/language-arts/assignment-hub/',
    label: 'Language Arts',
    parent: '/language-arts/'
  },
  {
    route: '/language-arts/toolkit/',
    label: 'Toolkits',
    parent: '/toolkits/'
  },
  {
    route: '/math-toolkit/',
    label: 'Toolkits',
    parent: '/toolkits/'
  },
  {
    route: '/math-toolkit/algebra/',
    label: 'Math Toolkit',
    parent: '/math-toolkit/'
  },
  {
    route: '/math-toolkit/geometry/',
    label: 'Math Toolkit',
    parent: '/math-toolkit/'
  },
  {
    route: '/math-toolkit/number-sense/',
    label: 'Math Toolkit',
    parent: '/math-toolkit/'
  },
  {
    route: '/math-toolkit/data-statistics/',
    label: 'Math Toolkit',
    parent: '/math-toolkit/'
  },
  {
    route: '/math-toolkit/money-math/',
    label: 'Math Toolkit',
    parent: '/math-toolkit/'
  },
  {
    route: '/math-toolkit/general/',
    label: 'Math Toolkit',
    parent: '/math-toolkit/'
  },
  {
    route: '/math-toolkit/algebra/pre-algebra/',
    label: 'Algebra',
    parent: '/math-toolkit/algebra/'
  },
  {
    route: '/math-toolkit/algebra/algebra-1/',
    label: 'Algebra',
    parent: '/math-toolkit/algebra/'
  },
  {
    route: '/math-toolkit/algebra/algebra-2/',
    label: 'Algebra',
    parent: '/math-toolkit/algebra/'
  },
  {
    route: '/math-toolkit/algebra/algebra-3/',
    label: 'Algebra',
    parent: '/math-toolkit/algebra/'
  },
  {
    route: '/math-toolkit/algebra/college-algebra/',
    label: 'Algebra',
    parent: '/math-toolkit/algebra/'
  }
];

test(
  'provides one contextual parent button on classroom-material pages',
  async ({ page }) => {
    for (const item of routes) {
      await page.goto(item.route);

      const nav = page.locator('nav.tc-context-nav');
      const link = nav.locator('a.tc-context-back');

      await expect(
        nav,
        `${item.route} should have one contextual nav`
      ).toHaveCount(1);

      await expect(link).toBeVisible();

      await expect(link).toHaveAccessibleName(
        `Back to ${item.label}`
      );

      await expect(link).toHaveAttribute(
        'href',
        item.parent
      );

      expect(
        await nav.evaluate(element => (
          element.parentElement?.firstElementChild === element
        ))
      ).toBe(true);

      await link.click();
      await page.waitForLoadState('domcontentloaded');

      expect(new URL(page.url()).pathname).toBe(
        item.parent
      );
    }
  }
);
