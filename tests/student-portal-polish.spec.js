import { test, expect } from '@playwright/test';

test.describe('Student Portal polish layer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student/');
    await page.waitForFunction(() => Boolean(window.RCStudentPortalPolish));
  });

  test('loads only on the student route and compacts the dashboard summary', async ({ page }) => {
    const summary = page.locator('.st-summary-cards');
    await expect(summary).toHaveCount(1);

    const columns = await summary.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(4);

    const firstCard = page.locator('.st-summary-card').first();
    expect(await firstCard.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
  });

  test('caps dashboard recent assignments at four and adds a route to the full list', async ({ page }) => {
    await page.evaluate(() => {
      const recent = document.getElementById('dashRecentAssignments');
      recent.innerHTML = '';
      for (let index = 0; index < 7; index += 1) {
        const card = document.createElement('div');
        card.className = 'st-assignment-card';
        card.textContent = `Assignment ${index + 1}`;
        recent.appendChild(card);
      }
      window.RCStudentPortalPolish.enhance();
    });

    await expect(page.locator('#dashRecentAssignments [data-stp-dashboard-overflow="true"]')).toHaveCount(3);
    await expect(page.locator('#tabDashboard .stp-section-link')).toHaveText('View All Assignments →');
  });

  test('builds current-quarter-first paginated assignment history', async ({ page }) => {
    await page.evaluate(() => {
      const root = document.getElementById('gradesContent');
      root.innerHTML = '';

      const average = document.createElement('div');
      average.className = 'st-average-display';
      average.innerHTML = '<h3>Your Overall Average</h3><div class="st-average-value">77%</div>';
      root.appendChild(average);

      const quarters = document.createElement('div');
      quarters.className = 'st-quarter-section';
      quarters.innerHTML = '<div class="st-quarter-section-title">Quarterly Averages</div><div class="st-quarter-grid"><div class="st-quarter-pill">Q1</div><div class="st-quarter-pill">Q2</div><div class="st-quarter-pill">Q3</div><div class="st-quarter-pill">Q4</div></div>';
      root.appendChild(quarters);

      const title = document.createElement('div');
      title.className = 'st-grades-list-title';
      title.textContent = 'All Graded Assignments';
      root.appendChild(title);

      for (let index = 0; index < 15; index += 1) {
        const row = document.createElement('div');
        row.className = 'st-grade-row';
        row.innerHTML = `<div class="st-grade-info"><h4>Q1 Assignment ${index + 1}</h4><div class="st-grade-meta"><span class="st-class-badge">Language Arts 4 SC</span> Submitted: Sep ${index + 1}, 2026</div></div><div class="st-grade-score">${70 + index}%</div>`;
        root.appendChild(row);
      }

      for (let index = 0; index < 3; index += 1) {
        const row = document.createElement('div');
        row.className = 'st-grade-row';
        row.innerHTML = `<div class="st-grade-info"><h4>Q2 Assignment ${index + 1}</h4><div class="st-grade-meta"><span class="st-class-badge">Language Arts 4 SC</span> Submitted: Nov ${index + 1}, 2026</div></div><div class="st-grade-score">80%</div>`;
        root.appendChild(row);
      }

      window.RCStudentPortalPolish.enhance();
    });

    await expect(page.locator('.stp-grade-snapshot')).toHaveCount(1);
    await expect(page.locator('.stp-history-shell')).toHaveCount(1);
    await expect(page.locator('.stp-quarter-tab[data-quarter="Q1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.stp-history-count')).toHaveText('Showing 1–12 of 15 assignments');
    await expect(page.locator('.stp-history-rows .st-grade-row:visible')).toHaveCount(12);

    await page.locator('.stp-page-btn', { hasText: 'Next' }).click();
    await expect(page.locator('.stp-history-count')).toHaveText('Showing 13–15 of 15 assignments');
    await expect(page.locator('.stp-history-rows .st-grade-row:visible')).toHaveCount(3);

    await page.locator('.stp-quarter-tab[data-quarter="Q2"]').click();
    await expect(page.locator('.stp-history-count')).toHaveText('Showing 1–3 of 3 assignments');
  });

  test('makes selected goal evidence clearer without inventing missing question links', async ({ page }) => {
    await page.evaluate(() => {
      const goals = document.getElementById('goalsContent');
      goals.innerHTML = `
        <div class="sgp-trend">
          <button class="sgp-point" aria-pressed="true">One check</button>
        </div>
        <div class="sgp-work">
          <div class="sgp-eyebrow">WORK BEHIND THIS CHECK</div>
          <h4>WEEK 1 — Seeker</h4>
          <p>This check counts toward your recorded progress. No question-level work is linked to it.</p>
        </div>`;
      window.RCStudentPortalPolish.enhance();
    });

    await expect(page.locator('#goalsContent .sgp-trend')).toHaveClass(/sgp-trend--sparse/);
    await expect(page.locator('#goalsContent .sgp-eyebrow')).toHaveText('EVIDENCE FOR THIS CHECK');
    await expect(page.locator('#goalsContent .sgp-work p')).toContainText('no question-level evidence is linked');
  });
});
