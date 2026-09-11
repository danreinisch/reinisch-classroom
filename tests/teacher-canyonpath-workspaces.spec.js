import { test, expect } from '@playwright/test';

const people = Array.from({ length: 18 }, (_, i) => ({ id: `mock-student-${i}`, code: `SYN-${String(i + 1).padStart(2, '0')}`, name: `Synthetic learner ${i + 1}`, active: true, class_id: 'LA1' }));
const drafts = Array.from({ length: 10 }, (_, i) => ({ id: `mock-assignment-${i}`, title: `Synthetic practice ${i + 1}`, class: 'Language Arts 1 SC', type: 'assignment', status: 'draft', due: '2026-09-09T23:59', created_at: '2026-09-08T08:00:00Z', assignment: { kind: 'text', name: 'synthetic.txt', text: 'Synthetic classroom practice.\n1. Write one complete sentence.' }, mapping: { kind: 'json', text: '{}' }, meta: { class_code: 'LA1' } }));
const instances = people.flatMap(s => drafts.map(d => ({ id: `${s.id}-${d.id}`, student_code: s.code, assignment_id: d.id, assigned_at: '2026-09-08T08:00:00Z', due_at: '2026-09-09', status: 'Submitted' })));
const submissions = instances.map((i, n) => ({ id: `mock-submission-${n}`, instance_id: i.id, assignment_instance_id: i.id, student_code: i.student_code, score_total: [90, 70, 50][n % 3], score: [90, 70, 50][n % 3], review_status: 'reviewed', submitted_at: '2026-09-08T09:00:00Z', answers: {} }));

async function fixture(page, { admin = false } = {}) {
  await page.clock.install({ time: new Date('2026-09-08T09:00:00-05:00') });
  await page.addInitScript(({ people, drafts, instances, submissions }) => {
    if (sessionStorage.getItem('tcp_synthetic_seeded')) return;
    localStorage.clear(); sessionStorage.clear();
    sessionStorage.setItem('tcp_synthetic_seeded', '1');
    localStorage.setItem('rc_tc_sidebar', 'collapsed');
    for (const [key, value] of Object.entries({ students: people, classes: [{ id: 'LA1', code: 'LA1', name: 'Language Arts 1 SC' }], assignments: drafts, assignmentInstances: instances, submissions })) localStorage.setItem('rc_unified_' + key, JSON.stringify(value));
    localStorage.setItem('rc_tc_work_drafts_v1', JSON.stringify(drafts));
  }, { people, drafts, instances, submissions });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost:8888') return route.abort();
    if (url.pathname.startsWith('/.netlify/functions/')) {
      const method = route.request().method();
      if (url.pathname.endsWith('/teacher-refresh') && method === 'POST') return route.fulfill({ json: { ok: true, role: admin ? 'admin' : 'teacher', session: { role: admin ? 'admin' : 'teacher' } } });
      if (method !== 'GET') throw new Error('Presentation tests must not write to server endpoints: ' + url.pathname);
      if (url.pathname.endsWith('/teacher-session')) return route.fulfill({ json: { ok: true, role: admin ? 'admin' : 'teacher', raw_role: admin ? 'admin' : 'teacher', session: { code: 'teacher_local', role: admin ? 'admin' : 'teacher' } } });
      if (url.pathname.endsWith('/browser-supabase-config')) return route.fulfill({ status: 503, json: { ok: false } });
      if (url.pathname.endsWith('/teacher-roster-context')) return route.fulfill({ json: { ok: true, students: people, classes: [{ id: 'LA1', code: 'LA1', name: 'Language Arts 1 SC' }], goals: [] } });
      if (url.pathname.endsWith('/teacher-submissions')) return route.fulfill({ json: { ok: true, submissions } });
      return route.fulfill({ json: { ok: true, count: 0, students: [], goals: [], classes: [], assignments: [], instances: [], submissions: [], entries: [], rows: [], events: [], items: [], plans: [], templates: [] } });
    }
    if (url.pathname.startsWith('/assets/data/') && url.pathname.endsWith('.json')) return route.fulfill({ json: {} });
    return route.continue();
  });
}
async function capture(page, testInfo, label) {
  await page.screenshot({ path: testInfo.outputPath(label + '.png'), fullPage: true });
}
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) await capture(page, testInfo, 'failure');
});

for (const size of [{ name: 'chromebook', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`Reporting ${size.name}: all six actual tabs work without page transitions`, async ({ page }, testInfo) => {
    await fixture(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/teacher/reporting/');
    for (const tab of ['iep-quarterly', 'student-summary', 'class-performance', 'compliance-log', 'batch-reports', 'student-evidence']) {
      const button = page.locator(`.rp-tab[data-tab="${tab}"]`);
      await button.click();
      await expect(button).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator(`.rp-tab-content[data-tab="${tab}"]`)).toBeVisible();
      await expect(page.locator('.rp-tab-content:visible')).toHaveCount(1);
      await capture(page, testInfo, `reporting-${size.name}-${tab}`);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test(`Gradebook ${size.name}: populated cells, semantic colors, sticky scrolling and dialog`, async ({ page }, testInfo) => {
    await fixture(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/teacher/gradebook/');
    await expect(page.locator('#gbTableWrap')).toBeVisible();
    await expect(page.locator('.gb-score-green').first()).toBeVisible();
    await expect(page.locator('.gb-score-amber').first()).toBeVisible();
    await expect(page.locator('.gb-score-red').first()).toBeVisible();
    await expect(page.locator('.gb-student-col').first()).toHaveCSS('position', 'sticky');
    await expect(page.locator('.gb-student-cell').first()).toHaveCSS('background-color', 'rgb(11, 59, 49)');
    await page.locator('#gbTableWrap').evaluate(el => { el.scrollLeft = 250; el.scrollTop = 180; });
    expect(await page.locator('#gbTableWrap').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await capture(page, testInfo, `gradebook-${size.name}-scrolled`);
    await page.locator('#btnWeightsSettings').click();
    await expect(page.locator('#gbWeightsModal')).toBeVisible();
    await capture(page, testInfo, `gradebook-${size.name}-dialog`);
    await page.locator('#btnCancelWeights').click();
    await expect(page.locator('#gbWeightsModal')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('AI Builder Create/Manage and Review status tabs preserve selection', async ({ page }, testInfo) => {
  await fixture(page);
  await page.goto('/teacher/ai-builder/');
  await page.locator('#aibTabManage').click();
  await expect(page.locator('#aibManagePanel')).toBeVisible();
  await expect(page.locator('#aibCreatePanel')).toBeHidden();
  await capture(page, testInfo, 'ai-builder-manage');
  await page.locator('#aibTabCreate').click();
  await expect(page.locator('#aibCreatePanel')).toBeVisible();
  await expect(page.locator('#aibManagePanel')).toBeHidden();
  await page.goto('/teacher/review/');
  for (const id of ['rvStatusReviewed', 'rvStatusAll', 'rvStatusFinalized', 'rvStatusNeedsReview']) {
    await page.locator('#' + id).click();
    await expect(page.locator('#' + id)).toHaveClass(/active/);
  }
  await capture(page, testInfo, 'review-filters');
});

test('Work form and real draft preview preserve Student/Teacher/Mapping panes', async ({ page }, testInfo) => {
  await fixture(page);
  await page.goto('/teacher/work/');
  await page.getByRole('button', { name: 'New Assignment' }).click();
  await expect(page.locator('#rcWorkComposer')).toBeVisible();
  await page.locator('#draftTitle').fill('Synthetic presentation check');
  await page.locator('#draftClass').selectOption({ label: 'Language Arts 1 SC' });
  await page.locator('#draftNotes').fill('Synthetic note; no classroom records.');
  await page.locator('.rc-work-composer-close').click();
  await expect(page.locator('#rcWorkComposer')).toBeHidden();
  await page.locator('#draftsTbody button[title="Preview"]').first().click();
  await expect(page.locator('#draftOverlay')).toBeVisible();
  for (const tab of ['student', 'teacher', 'mapping']) {
    await page.locator(`[data-pv-tab="${tab}"]`).click();
    await expect(page.locator(`[data-pv-pane="${tab}"]`)).toBeVisible();
    await expect(page.locator('[data-pv-pane]:visible')).toHaveCount(1);
  }
  await capture(page, testInfo, 'work-preview-mapping');
  await page.locator('#btnClosePreview').click();
  await expect(page.locator('#draftOverlay')).toBeHidden();
  await expect(page.locator('#draftTitle')).toHaveValue('Synthetic presentation check');
});

test('Work Import Assignment exits edit mode before opening the file chooser', async ({ page }) => {
  await fixture(page);
  await page.goto('/teacher/work/');
  const continueButton = page.getByRole('button', { name: /Continue|Edit/ }).first();
  await continueButton.click();
  await expect(page.locator('#rcWorkComposer')).toBeVisible();
  await expect(page.locator('#btnCancelEdit')).toBeVisible();
  await page.locator('.rc-work-composer-close').click();
  await expect(page.locator('#rcWorkComposer')).toBeHidden();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import Assignment' }).click();
  await chooserPromise;

  await expect(page.locator('#rcWorkComposer')).toBeVisible();
  await expect(page.locator('#btnCancelEdit')).toBeHidden();
  await expect(page.locator('#draftTitle')).toHaveValue('');
});

test('Work class filter keeps a multi-class individualized batch visible', async ({ page }) => {
  await fixture(page);
  await page.goto('/teacher/work/');
  await page.evaluate(() => {
    const batch = [
      {
        id: 'multi-1', title: 'Cross-class packet — S01', batchId: 'cross-batch', batchTitle: 'Cross-class packet',
        class: 'Language Arts 1 SC', className: 'Language Arts 1 SC', studentCode: 'SYN-01', studentCodes: ['SYN-01'],
        status: 'draft', issuedAt: null, autoRelease: false, releaseAt: null, dueAt: '2026-09-12T23:59:00',
        createdAt: '2026-09-08T08:00:00Z', created_at: '2026-09-08T08:00:00Z',
        assignment: { kind: 'text', name: 'synthetic.txt', text: 'Synthetic classroom practice.' }, mapping: { kind: 'json', text: '{}' }
      },
      {
        id: 'multi-2', title: 'Cross-class packet — S02', batchId: 'cross-batch', batchTitle: 'Cross-class packet',
        class: 'Language Arts 2 SC', className: 'Language Arts 2 SC', studentCode: 'SYN-02', studentCodes: ['SYN-02'],
        status: 'draft', issuedAt: null, autoRelease: false, releaseAt: null, dueAt: '2026-09-12T23:59:00',
        createdAt: '2026-09-08T08:00:00Z', created_at: '2026-09-08T08:00:00Z',
        assignment: { kind: 'text', name: 'synthetic.txt', text: 'Synthetic classroom practice.' }, mapping: { kind: 'json', text: '{}' }
      }
    ];
    localStorage.setItem('rc_tc_work_drafts_v1', JSON.stringify(batch));
  });
  await page.reload();

  const classFilter = page.locator('#rcWorkClassFilter');
  await expect(classFilter).toContainText('Language Arts 2 SC');
  await classFilter.selectOption({ label: 'Language Arts 2 SC' });
  await expect(page.locator('#draftsTbody tr[data-rc-work-kind="batch"]').first()).toBeVisible();
});

test('Students: six dynamic detail tabs remain usable', async ({ page }, testInfo) => {
  await fixture(page);
  await page.goto('/teacher/students/');
  const row = page.locator('tr[data-code="SYN-01"]');
  await expect(row).toBeVisible();
  if (!(await page.locator('#stExpandedDetail-SYN-01').isVisible())) await row.click();
  for (const tab of ['goals', 'progress', 'schedule', 'classes', 'skills', 'settings']) {
    const button = page.locator(`#stExpandedDetail-SYN-01 .st-tabs [data-tab="${tab}"]`);
    await button.click();
    await expect(button).toHaveClass(/active/);
    await expect(page.locator('#stExpandedDetail-SYN-01 .st-tab-content')).toBeVisible();
    await capture(page, testInfo, 'student-tab-' + tab);
  }
});

test('Media admin utility: real admin gate reveals authorized surface only', async ({ page }, testInfo) => {
  await fixture(page, { admin: true });
  await page.goto('/teacher/admin/media/');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#gate')).toBeHidden();
  await expect(page.locator('#uploadBtn')).toBeVisible();
  await capture(page, testInfo, 'admin-media-authorized');
});

test('Media utility rejects a non-admin teacher using the existing gate', async ({ page }) => {
  await fixture(page);
  await page.goto('/teacher/admin/media/');
  await expect(page).toHaveURL(/\/hub\/\?reason=not_admin/);
});
