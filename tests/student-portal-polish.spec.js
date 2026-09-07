import { test, expect } from '@playwright/test';

test.describe('Student Portal polish layer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student/');
    await page.waitForFunction(() => Boolean(window.RCStudentPortalPolish));
    await page.waitForFunction(() => Boolean(window.RCStudentGoalEvidenceTimeline));
    await page.waitForFunction(() =>
      Array.from(document.styleSheets).some((sheet) =>
        String(sheet.href || '').includes('/assets/css/student-portal-polish.css')
      )
    );
    await page.waitForFunction(() =>
      Array.from(document.styleSheets).some((sheet) =>
        String(sheet.href || '').includes('/assets/css/student-goal-evidence-timeline.css')
      )
    );
  });

  test('loads on the student route and compacts the dashboard summary', async ({ page }) => {
    await page.evaluate(() => {
      document.querySelector('.stp-test-summary')?.remove();
      const summary = document.createElement('div');
      summary.className = 'st-summary-cards stp-test-summary';
      summary.style.width = '1000px';
      for (let index = 0; index < 4; index += 1) {
        const card = document.createElement('div');
        card.className = 'st-summary-card';
        card.innerHTML = `<div class="st-summary-value">${index + 1}</div><div class="st-summary-label">Metric ${index + 1}</div>`;
        summary.appendChild(card);
      }
      document.body.appendChild(summary);
    });

    const summary = page.locator('.stp-test-summary');
    await expect(summary).toHaveCount(1);

    const columns = await summary.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(4);

    const firstCard = summary.locator('.st-summary-card').first();
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
      document.getElementById('gradesContent')?.remove();
      const root = document.createElement('div');
      root.id = 'gradesContent';
      document.body.appendChild(root);

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

    const currentQuarter = await page.evaluate(async () => {
      const api = await import('/web/quarter-utils.js');
      return api.getCurrentQuarter();
    });
    await expect(page.locator(`.stp-quarter-tab[data-quarter="${currentQuarter}"]`)).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.stp-quarter-tab[data-quarter="Q1"]').click();
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

  test('shows one dot per evidence event, result filters, and the actual answer choices', async ({ page }) => {
    await page.route('**/.netlify/functions/student-goal-evidence-events?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          available: true,
          quarter: { quarter: 'Q1', start: '2026-08-16', end: '2026-10-17' },
          goal: { code: 'S065.CG1', goal_area: 'Reading Comprehension', measurement_type: 'Accuracy' },
          counts: { total: 5, question: 5, recorded_check: 0 },
          skills: [
            { objective_number: 1, objective_text: 'Identify author purpose' },
            { objective_number: 2, objective_text: 'Identify main idea' },
            { objective_number: 3, objective_text: 'Explain cause and effect' },
          ],
          events: [
            { key: 'a', kind: 'objective', date: '2026-09-03', source: 'assignment', assignment_title: 'Week 1 Reading', item_ref: '1_1', question_text: 'What is the author purpose?', choices: ['To entertain with a joke', 'To inform the reader about the topic', 'To persuade the reader to agree', 'To describe an unrelated setting'], student_answer: 'B', answer_review_available: true, correct_answer: 'B', is_correct: true, score: 100, objective_earned: 1, objective_max: 1, objective_number: 1, objective_text: 'Identify author purpose', status: 'Correct' },
            { key: 'b', kind: 'objective', date: '2026-09-03', source: 'assignment', assignment_title: 'Week 1 Reading', item_ref: '1_2', question_text: 'What is the main idea?', choices: ['A minor supporting detail', 'The central idea explained across the passage', 'A detail from a different topic', 'A conclusion the passage does not support'], student_answer: 'A', answer_review_available: true, correct_answer: 'B', is_correct: false, score: 0, objective_earned: 0, objective_max: 1, objective_number: 2, objective_text: 'Identify main idea', status: 'Review this answer' },
            { key: 'c', kind: 'objective', date: '2026-09-03', source: 'assignment', assignment_title: 'Week 1 Reading', item_ref: '1_3', question_text: 'Which detail supports the main idea?', choices: ['An unrelated example', 'A background detail', 'The evidence that directly supports the central idea', 'A prediction not stated in the text'], student_answer: 'C', answer_review_available: true, correct_answer: 'C', is_correct: true, score: 100, objective_earned: 1, objective_max: 1, objective_number: 2, objective_text: 'Identify main idea', status: 'Correct' },
            { key: 'd', kind: 'objective', date: '2026-09-03', source: 'assignment', assignment_title: 'Week 1 Reading', item_ref: '1_4', question_text: 'What caused the problem?', choices: ['An earlier decision by the character', 'The event described in the passage as the cause', 'A later consequence', 'A detail that did not affect the problem'], student_answer: 'A', answer_review_available: true, correct_answer: 'B', is_correct: false, score: 0, objective_earned: 0, objective_max: 1, objective_number: 3, objective_text: 'Explain cause and effect', status: 'Review this answer' },
            { key: 'e', kind: 'objective', date: '2026-09-03', source: 'assignment', assignment_title: 'Week 1 Reading', item_ref: '1_5', question_text: 'What was the effect?', choices: ['The original cause', 'An unrelated event', 'The consequence that happened because of the cause', 'A detail from before the event'], student_answer: 'C', answer_review_available: true, correct_answer: 'C', is_correct: true, score: 100, objective_earned: 1, objective_max: 1, objective_number: 3, objective_text: 'Explain cause and effect', status: 'Correct' },
          ],
        }),
      });
    });

    await page.evaluate(() => {
      document.getElementById('goalsContent')?.remove();
      const goals = document.createElement('div');
      goals.id = 'goalsContent';
      goals.innerHTML = `
        <article class="sgp-card" data-sgp-goal="S065.CG1" style="width:900px">
          <div class="sgp-stats"><div><span>Q1 average</span><strong>83.3%</strong></div><div><span>Goal target</span><strong>80%</strong></div><div><span>Evidence records</span><strong>5</strong></div></div>
          <details class="sgp-progress" open>
            <summary>Explore my progress</summary>
            <div data-sgp-body>
              <div class="sgp-controls"><label>Quarter<select data-sgp-quarter><option selected>2026–27 · Q1</option></select></label><label>Goal skill<select data-sgp-objective><option>Skill 1</option></select></label></div>
              <p class="sgp-skill-text">Identify author purpose</p>
              <section class="sgp-trend"><details class="sgp-calculation"><summary>How my progress is calculated</summary><p>Official math stays separate.</p></details></section>
              <div data-sgp-selected></div>
            </div>
          </details>
        </article>`;
      document.body.appendChild(goals);
      window.RCStudentGoalEvidenceTimeline.enhance();
    });

    await expect(page.locator('.et-dot')).toHaveCount(5);
    await expect(page.locator('[data-et-skill]')).toHaveValue('all');
    await expect(page.locator('.et-heading')).toContainText('Each dot is one piece of evidence');
    await expect(page.locator('[data-et-status="all"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-et-status="review"]')).toContainText('2');
    await expect(page.locator('[data-et-status="demonstrated"]')).toContainText('3');

    await page.locator('.et-dot[data-et-key-value="b"]').click();
    await expect(page.locator('.et-detail')).toContainText('What is the main idea?');
    await expect(page.locator('.et-choice-list .et-choice')).toHaveCount(4);
    await expect(page.locator('.et-choice-list .et-choice').nth(0)).toContainText('A minor supporting detail');
    await expect(page.locator('.et-choice-list .et-choice').nth(0)).toContainText('Your answer');
    await expect(page.locator('.et-choice-list .et-choice').nth(1)).toContainText('The central idea explained across the passage');
    await expect(page.locator('.et-choice-list .et-choice').nth(1)).toContainText('Correct answer');
    await expect(page.locator('.et-detail')).toContainText('Review this answer');

    await page.locator('[data-et-status="review"]').click();
    await expect(page.locator('.et-dot')).toHaveCount(2);
    await expect(page.locator('.et-count')).toContainText('2 shown · 5 total');

    await page.locator('[data-et-status="demonstrated"]').click();
    await expect(page.locator('.et-dot')).toHaveCount(3);

    await page.locator('[data-et-status="all"]').click();
    await expect(page.locator('.et-dot')).toHaveCount(5);

    await page.locator('[data-et-skill]').selectOption('1');
    await expect(page.locator('.et-dot')).toHaveCount(1);
    await expect(page.locator('.et-count')).toContainText('1 shown · 5 total');
    await expect(page.locator('.sgp-stats > div').last().locator('span')).toHaveText('Evidence events');
    await expect(page.locator('.sgp-stats > div').last().locator('strong')).toHaveText('5');
  });

  test('keeps forty evidence events in small newest-first windows instead of a dot wall', async ({ page }) => {
    const events = Array.from({ length: 40 }, (_, index) => {
      const needsReview = index % 4 === 0;
      return {
        key: `event-${index + 1}`,
        kind: 'question',
        date: index < 20 ? '2026-09-03' : '2026-09-10',
        source: 'assignment',
        assignment_title: `Week ${index < 20 ? 1 : 2} Reading`,
        item_ref: `Q${index + 1}`,
        question_text: `Synthetic evidence question ${index + 1}`,
        choices: ['Choice one', 'Choice two', 'Choice three', 'Choice four'],
        student_answer: needsReview ? 'A' : 'B',
        answer_review_available: true,
        correct_answer: 'B',
        is_correct: !needsReview,
        score: needsReview ? 0 : 100,
        status: needsReview ? 'Review this answer' : 'Correct',
      };
    });

    await page.route('**/.netlify/functions/student-goal-evidence-events?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          available: true,
          quarter: { quarter: 'Q1', start: '2026-08-16', end: '2026-10-17' },
          goal: { code: 'S016.CG2', goal_area: 'Reading Comprehension', measurement_type: 'Accuracy' },
          counts: { total: 40, question: 40, recorded_check: 0 },
          skills: [],
          events,
        }),
      });
    });

    await page.evaluate(() => {
      document.getElementById('goalsContent')?.remove();
      const goals = document.createElement('div');
      goals.id = 'goalsContent';
      goals.innerHTML = `
        <article class="sgp-card" data-sgp-goal="S016.CG2" style="width:900px">
          <div class="sgp-stats"><div><span>Q1 average</span><strong>75%</strong></div><div><span>Goal target</span><strong>60%</strong></div><div><span>Evidence records</span><strong>40</strong></div></div>
          <details class="sgp-progress" open>
            <summary>Explore my progress</summary>
            <div data-sgp-body>
              <div class="sgp-controls"><label>Quarter<select data-sgp-quarter><option selected>2026–27 · Q1</option></select></label></div>
              <section class="sgp-trend"><details class="sgp-calculation"><summary>How my progress is calculated</summary><p>Official math stays separate.</p></details></section>
              <div data-sgp-selected></div>
            </div>
          </details>
        </article>`;
      document.body.appendChild(goals);
      window.RCStudentGoalEvidenceTimeline.enhance();
    });

    await expect(page.locator('.et-dot')).toHaveCount(5);
    await expect(page.locator('.et-pager')).toContainText('36–40 of 40');
    await expect(page.locator('.et-count')).toContainText('40 events · 10 need review');

    await page.locator('[data-et-action="older"]').click();
    await expect(page.locator('.et-dot')).toHaveCount(5);
    await expect(page.locator('.et-pager')).toContainText('31–35 of 40');

    await page.locator('[data-et-status="review"]').click();
    await expect(page.locator('.et-dot')).toHaveCount(5);
    await expect(page.locator('.et-pager')).toContainText('6–10 of 10');

    await page.evaluate(() => {
      const card = document.querySelector('#goalsContent .sgp-card');
      card.style.width = '390px';
    });
    await page.locator('[data-et-status="all"]').click();
    await expect(page.locator('.et-dot')).toHaveCount(3);
    await expect(page.locator('.et-pager')).toContainText('38–40 of 40');
  });
});
