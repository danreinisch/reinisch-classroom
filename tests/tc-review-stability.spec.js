import { test, expect } from '@playwright/test';

const students = [
  { id: 'student-a', code: 'SYN-A', name: 'Synthetic learner A', active: true, class_id: 'LA1' },
  { id: 'student-b', code: 'SYN-B', name: 'Synthetic learner B', active: true, class_id: 'LA1' },
];

const htmlSource = `
  <div class="q-card" data-qref="Q1" data-goal="SYN.G1" data-answer-type="multiple-choice">
    <div class="q-prompt">Which answer is correct? <button class="tts-btn">Read aloud</button></div>
    <button class="opt-btn" type="button">a) First choice</button>
    <button class="opt-btn" type="button" data-correct>b) Second choice</button>
    <button class="opt-btn" type="button">c) Third choice</button>
  </div>`;

const assignments = [{
  id: 'assignment-html',
  title: 'Synthetic HTML Review',
  class: 'Language Arts 1 SC',
  class_name: 'Language Arts 1 SC',
  school_year: 2026,
  meta: {
    class_name: 'Language Arts 1 SC',
    html_src: htmlSource,
    questions: [{ q_ref: 'Q1', label: 'Q1', answer_type: 'mcq', points: 1, correct: 'b) Second choice' }],
  },
}];

const instances = students.map((student, index) => ({
  id: `instance-${index + 1}`,
  assignment_id: 'assignment-html',
  student_code: student.code,
  assigned_at: '2026-09-11T13:00:00Z',
  due_at: '2026-09-11T23:59:00Z',
  status: 'Submitted',
  school_year: 2026,
}));

const submissions = students.map((student, index) => ({
  id: `submission-${index + 1}`,
  instance_id: `instance-${index + 1}`,
  assignment_instance_id: `instance-${index + 1}`,
  student_code: student.code,
  review_status: 'pending',
  submitted_at: `2026-09-11T14:0${index}:00Z`,
  score_total: index === 0 ? 0 : 100,
  answers: { Q1: index === 0 ? 'A' : 'B' },
}));

const assignmentItems = [{
  id: 'item-q1',
  assignment_id: 'assignment-html',
  item_ref: 'Q1',
  answer_type: 'mcq',
  points: 1,
  meta: { correct: 'b) Second choice' },
}];

const submissionAnswers = [
  {
    id: 'answer-a', submission_id: 'submission-1', assignment_item_id: 'item-q1', item_id: 'item-q1',
    raw_answer: 'A', is_correct: false, earned_points: 0, teacher_note: null,
  },
  {
    id: 'answer-b', submission_id: 'submission-2', assignment_item_id: 'item-q1', item_id: 'item-q1',
    raw_answer: 'B', is_correct: true, earned_points: 1, teacher_note: null,
  },
];

async function fixture(page) {
  await page.clock.install({ time: new Date('2026-09-11T14:30:00-05:00') });
  await page.addInitScript(({ students, assignments, instances, submissions, assignmentItems, submissionAnswers }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rc_tc_sidebar', 'expanded');
    const seeded = {
      students,
      classes: [{ id: 'LA1', code: 'LA1', name: 'Language Arts 1 SC' }],
      classEnrollments: students.map((student, index) => ({
        id: `enrollment-${index + 1}`,
        class_id: 'LA1',
        student_code: student.code,
        active: true,
      })),
      assignments,
      assignmentInstances: instances,
      submissions,
      assignmentItems,
      submissionAnswers,
      assignmentItemMappings: [],
    };
    for (const [key, value] of Object.entries(seeded)) {
      localStorage.setItem('rc_unified_' + key, JSON.stringify(value));
    }
    localStorage.setItem('rc_tc_work_drafts_v1', JSON.stringify(assignments));
  }, { students, assignments, instances, submissions, assignmentItems, submissionAnswers });

  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost:8888') return route.abort();

    if (url.pathname.startsWith('/.netlify/functions/')) {
      const method = route.request().method();
      if (url.pathname.endsWith('/teacher-refresh') && method === 'POST') {
        return route.fulfill({ json: { ok: true, role: 'teacher', session: { role: 'teacher' } } });
      }
      if (method !== 'GET') {
        throw new Error('Review stability test must not write to server endpoints: ' + url.pathname);
      }
      if (url.pathname.endsWith('/teacher-session')) {
        return route.fulfill({ json: { ok: true, role: 'teacher', raw_role: 'teacher', session: { code: 'teacher_local', role: 'teacher' } } });
      }
      if (url.pathname.endsWith('/browser-supabase-config')) {
        return route.fulfill({ status: 503, json: { ok: false } });
      }
      if (url.pathname.endsWith('/teacher-roster-context')) {
        return route.fulfill({ json: { ok: true, students, classes: [{ id: 'LA1', code: 'LA1', name: 'Language Arts 1 SC' }], goals: [] } });
      }
      if (url.pathname.endsWith('/teacher-submissions')) {
        return route.fulfill({ json: { ok: true, submissions } });
      }
      return route.fulfill({ json: { ok: true, count: 0, students: [], goals: [], classes: [], assignments: [], instances: [], submissions: [], entries: [], rows: [], events: [], items: [] } });
    }

    if (url.pathname.startsWith('/assets/data/') && url.pathname.endsWith('.json')) {
      return route.fulfill({ json: {} });
    }
    return route.continue();
  });
}

test('Teacher Center → Review settles to one stable command-center paint', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await fixture(page);

  await page.goto('/teacher/work/');
  const reviewLink = page.locator('a[href="/teacher/review/"], a[href="/teacher/review"]').first();
  await expect(reviewLink).toBeVisible();
  await reviewLink.click();
  await expect(page).toHaveURL(/\/teacher\/review\/?$/);

  await expect(page.locator('#rvReviewCommandCenter')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('html')).not.toHaveClass(/rv-review-first-paint-pending/, { timeout: 10000 });
  await expect(page.locator('[data-rv-review-next]')).toBeVisible();

  await page.locator('[data-rv-review-next]').click();
  await expect(page.locator('.rv-submission-item.rv-qol-selected')).toHaveCount(1);
  await expect(page.locator('.rv-question-evidence-panel')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.rv-question-evidence-prompt')).toContainText('Which answer is correct?');
  await expect(page.locator('.rv-question-evidence-option')).toHaveCount(3);

  await page.waitForTimeout(700);
  const stable = await page.evaluate(() => ({
    firstPaintPending: document.documentElement.classList.contains('rv-review-first-paint-pending'),
    retryPulses: document.querySelectorAll('.rv-question-evidence-retry-pulse').length,
    evidencePanels: document.querySelectorAll('.rv-question-evidence-panel').length,
    selectedSubmissions: document.querySelectorAll('.rv-submission-item.rv-qol-selected').length,
  }));

  expect(stable).toEqual({
    firstPaintPending: false,
    retryPulses: 0,
    evidencePanels: 1,
    selectedSubmissions: 1,
  });
  expect(pageErrors).toEqual([]);
});
