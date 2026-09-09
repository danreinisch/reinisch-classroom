(function () {
  'use strict';

  const ENDPOINT = '/.netlify/functions/teacher-week2-day4-trim';
  const APPLY_CONFIRMATION = 'TRIM_WEEK2_DAY4_2026-09-11';
  const PRODUCTION_HOSTS = new Set([
    'reinischclassroom.com',
    'www.reinischclassroom.com',
  ]);

  const previewBtn = document.getElementById('trimPreviewBtn');
  const applyBtn = document.getElementById('trimApplyBtn');
  const statusEl = document.getElementById('trimStatus');
  const planList = document.getElementById('trimPlanList');

  let previewToken = null;

  function setStatus(kind, text) {
    statusEl.classList.remove('ok', 'warn', 'err');
    if (kind) statusEl.classList.add(kind);
    statusEl.textContent = text;
  }

  function clearPlans() {
    while (planList.firstChild) {
      planList.removeChild(planList.firstChild);
    }
  }

  function addPlanLine(text) {
    const li = document.createElement('li');
    li.textContent = text;
    planList.appendChild(li);
  }

  function isProductionHost() {
    return PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase());
  }

  async function callEndpoint(body) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({
      ok: false,
      error: `Unexpected response (${response.status})`,
    }));

    if (!response.ok || !data.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.data = data;
      throw error;
    }

    return data;
  }

  function renderPreview(data) {
    clearPlans();
    previewToken = data.preview_token || null;

    const missing = Array.isArray(data.missing_targets)
      ? data.missing_targets
      : [];
    const plans = Array.isArray(data.plans) ? data.plans : [];

    for (const plan of plans) {
      const state = plan.blocked
        ? `BLOCKED: ${plan.blocked_reasons.join(', ')}`
        : plan.needs_mutation
          ? `trim ${plan.day4_items} Day-4 item(s); ${plan.removed_points} point(s) removed`
          : 'already three-day — no change';

      addPlanLine(
        `${plan.class_name} — ${plan.title}: ${state}`
      );
    }

    for (const missingTarget of missing) {
      addPlanLine(`MISSING TARGET — ${missingTarget}`);
    }

    const blocked =
      Number(data.blocked_assignments || 0) > 0 ||
      missing.length > 0;
    const needsTrim = Number(data.assignments_needing_trim || 0) > 0;

    const lines = [
      `Matched assignments: ${data.matched_assignments || 0}`,
      `Need Day 4 removed: ${data.assignments_needing_trim || 0}`,
      `Already three-day: ${data.already_three_day || 0}`,
      `Blocked assignments: ${data.blocked_assignments || 0}`,
    ];

    if (!isProductionHost()) {
      lines.push('Deploy preview: read-only by design. Apply is disabled here.');
    }

    setStatus(blocked ? 'warn' : 'ok', lines.join('\n'));

    applyBtn.disabled =
      blocked ||
      !needsTrim ||
      !previewToken ||
      !isProductionHost();
  }

  async function runPreview() {
    previewBtn.disabled = true;
    applyBtn.disabled = true;
    previewToken = null;
    clearPlans();
    setStatus('', 'Running read-only Day 4 safety checks…');

    try {
      const data = await callEndpoint({ mode: 'preview' });
      renderPreview(data);
    } catch (err) {
      const data = err.data || {};
      previewToken = null;
      applyBtn.disabled = true;
      setStatus('err', data.error || err.message);
      if (Array.isArray(data.plans)) {
        renderPreview(data);
        applyBtn.disabled = true;
      }
    } finally {
      previewBtn.disabled = false;
    }
  }

  async function runApply() {
    if (!previewToken || !isProductionHost()) return;

    const confirmed = window.confirm(
      'Remove Week 2 Day 4 from the current targeted assignments?\n\n' +
      'Days 1–3 and student assignment instances will not be rewritten.'
    );

    if (!confirmed) return;

    previewBtn.disabled = true;
    applyBtn.disabled = true;
    setStatus('', 'Rechecking Day 4 safety state before applying…');

    try {
      const data = await callEndpoint({
        mode: 'apply',
        preview_token: previewToken,
        confirmation: APPLY_CONFIRMATION,
      });

      setStatus(
        'ok',
        `Applied safely.\n` +
        `Assignments changed: ${data.changed_assignments || 0}\n` +
        `Day 4 items removed: ${data.removed_day4_items || 0}\n` +
        `Student assignment instances updated: 0`
      );

      previewToken = null;
      await runPreview();
    } catch (err) {
      const data = err.data || {};
      previewToken = null;
      applyBtn.disabled = true;
      setStatus(
        'err',
        `${data.error || err.message}\nNothing should be retried until Preview is run again.`
      );
    } finally {
      previewBtn.disabled = false;
    }
  }

  previewBtn.addEventListener('click', runPreview);
  applyBtn.addEventListener('click', runApply);

  if (!isProductionHost()) {
    addPlanLine('This host is preview-only; Apply cannot mutate production.');
  }
})();
