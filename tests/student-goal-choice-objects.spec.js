import { test, expect } from '@playwright/test';

test('renders object-shaped answer choices as readable evidence', async ({ page }) => {
  await page.goto('/student/');
  await page.waitForFunction(() => Boolean(window.RCStudentGoalEvidenceTimeline));

  await page.route('**/.netlify/functions/student-goal-evidence-events?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        available: true,
        quarter: { quarter: 'Q1', start: '2026-08-16', end: '2026-10-17' },
        goal: { code: 'S001.CG1', goal_area: 'Reading Comprehension', measurement_type: 'Accuracy' },
        counts: { total: 1, question: 1, recorded_check: 0 },
        skills: [],
        events: [
          {
            key: 'object-choice-event',
            kind: 'question',
            date: '2026-09-03',
            source: 'assignment',
            assignment_title: 'Synthetic reading assignment',
            item_ref: '1_3',
            question_text: 'Which detail best supports the claim?',
            choices: [
              { letter: 'A', text: 'The probe changes direction after receiving a signal.' },
              { letter: 'B', text: 'The probe continues on the same path.' },
              { letter: 'C', text: 'The probe confirms that the situation has changed.' },
            ],
            student_answer: 'A',
            answer_review_available: true,
            correct_answer: 'C',
            is_correct: false,
            score: 0,
            objective_number: null,
            objective_text: null,
            status: 'Review this answer',
          },
        ],
      }),
    });
  });

  await page.evaluate(() => {
    document.getElementById('goalsContent')?.remove();
    const goals = document.createElement('div');
    goals.id = 'goalsContent';
    goals.innerHTML = `
      <article class="sgp-card" data-sgp-goal="S001.CG1" style="width:900px">
        <div class="sgp-stats"><div><span>Q1 average</span><strong>0%</strong></div><div><span>Goal target</span><strong>80%</strong></div><div><span>Evidence records</span><strong>1</strong></div></div>
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

  const detail = page.locator('.et-detail');
  await expect(detail).toContainText('The probe changes direction after receiving a signal.');
  await expect(detail).toContainText('The probe continues on the same path.');
  await expect(detail).toContainText('The probe confirms that the situation has changed.');
  await expect(detail).not.toContainText('[object Object]');

  const choices = detail.locator('.et-choice');
  await expect(choices.nth(0)).toContainText('Your answer');
  await expect(choices.nth(2)).toContainText('Correct answer');
  await expect(choices.nth(0)).toHaveClass(/et-choice--wrong/);
  await expect(choices.nth(2)).toHaveClass(/et-choice--correct/);
});
