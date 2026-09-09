(function () {
  'use strict';

  const ENDPOINT = '/.netlify/functions/teacher-week2-day4-trim';
  const DIAGNOSTIC_ENDPOINT = '/.netlify/functions/teacher-week2-day4-diagnostic';
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
  let previewSummary = null;

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

  async function callDiagnostic() {
    const response = await fetch(DIAGNOSTIC_ENDPOINT, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json().catch(() => ({
      ok: false,
      error: `Unexpected diagnostic response (${response.status})`,
    }));

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Diagnostic failed (${response.status})`);
    }

    return data;
  }

  function compactCounts(obj) {
    const entries = Object.entries(obj || {});
    if (entries.length === 0) return '(none)';
    return entries
      .slice(0, 6)
      .map(([key, count]) => `${key} ×${count}`)
      .join('; ');
  }

  function renderDiagnostic(data) {
    addPlanLine('— Read-only identity diagnostic —');

    const classes = Array.isArray(data.classes) ? data.classes : [];
    for (const cls of classes) {
      const identity = cls.week2_identity || {};
      const allIdentity = cls.all_class_identity || {};

      addPlanLine(
        `DIAGNOSTIC — ${cls.class_name}: ` +
        `${cls.week2_like_assignments || 0} Week-2-like / ` +
        `${cls.total_assignments_in_class || 0} total assignment(s)`
      );
      addPlanLine(`  titles: ${compactCounts(identity.title_patterns)}`);
      addPlanLine(`  Week-2 school_year: ${compactCounts(identity.school_years)}`);
      addPlanLine(`  Week-2 source_file: ${compactCounts(identity.source_files)}`);
      addPlanLine(`  Week-2 meta.class_name: ${compactCounts(identity.meta_class_names)}`);
      addPlanLine(`  Week-2 day shape: ${compactCounts(identity.day_shapes)}`);
      addPlanLine(`  Week-2 due dates: ${compactCounts(identity.due_dates)}`);
      addPlanLine(`  all assignment years: ${compactCounts(allIdentity.school_years)}`);
      addPlanLine(`  all source files: ${compactCounts(allIdentity.source_files)}`);
    }

    const missingClasses = Array.isArray(data.missing_classes)
      ? data.missing_classes
      : [];
    for (const name of missingClasses) {
      addPlanLine(`DIAGNOSTIC — missing class: ${name}`);
    }
  }

  function renderPreview(data) {
    clearPlans();
    previewToken = data.preview_token || null;
    previewSummary = data;

    const missing = Array.isArray(data.missing_targets)
      ? data.missing_targets
      : [];
    const plans = Array.isArray(data.plans) ? data.plans : [];

    for (const plan of plans) {
      const state = plan.preserved
        ? 'PRESERVE: Day 4 student work detected — no change'
        : plan.blocked
          ? `BLOCKED: ${plan.blocked_reasons.join(', ')}`
          : plan.needs_mutation
            ? `trim ${plan.day4_items} Day-4 item(s); ${plan.removed_points} point(s) removed`
            : 'already three-day — no change';

      addPlanLine(`${plan.class_name} — ${plan.title}: ${state}`);
    }

    for (const missingTarget of missing) {
      addPlanLine(`MISSING TARGET — ${missingTarget}`);
    }

    const unexpectedBlocked = Number(data.unexpected_blocked_assignments || 0);
    const needsTrim = Number(data.assignments_needing_trim || 0) > 0;
    const applyReady = data.apply_ready === true;
    const completedState = data.completed_state === true;
    const preserved = Number(data.preserved_day4_assignments || 0);
    const trims = Number(data.assignments_needing_trim || 0);
    const tsThreeDay = Number(data.transitional_skills_three_day || 0);

    const lines = [
      `Matched assignments: ${data.matched_assignments || 0}`,
      `Safe Day 4 trims: ${trims}`,
      `Preserve Day 4 work: ${preserved}`,
      `Transitional Skills already three-day: ${tsThreeDay}`,
      `Unexpected blockers: ${unexpectedBlocked}`,
    ];

    if (applyReady) {
      lines.push(
        `Safety contract: READY — ${trims} trim / ${preserved} preserve / ${tsThreeDay} TS three-day.`
      );
    } else if (completedState) {
      lines.push(
        `Completed state confirmed — ${preserved} Day 4 assignment(s) preserved.`
      );
    }

    if (!isProductionHost()) {
      lines.push('Deploy preview: read-only by design. Apply is disabled here.');
    }

    setStatus(
      applyReady || completedState ? 'ok' : 'warn',
      lines.join('\n')
    );

    applyBtn.disabled =
      !applyReady ||
      !needsTrim ||
      !previewToken ||
      !isProductionHost();
  }

  async function runPreview() {
    previewBtn.disabled = true;
    applyBtn.disabled = true;
    previewToken = null;
    previewSummary = null;
    clearPlans();
    setStatus('', 'Running read-only Day 4 safety checks…');

    try {
      const data = await callEndpoint({ mode: 'preview' });
      renderPreview(data);

      const missing = Array.isArray(data.missing_targets)
        ? data.missing_targets
        : [];
      const needsIdentityDiagnostic =
        Number(data.matched_assignments || 0) === 0 ||
        missing.length > 0;

      if (needsIdentityDiagnostic) {
        addPlanLine('Identity lock did not match. Running read-only diagnostic…');
        try {
          const diagnostic = await callDiagnostic();
          renderDiagnostic(diagnostic);
        } catch (diagErr) {
          addPlanLine(`DIAGNOSTIC FAILED — ${diagErr.message}`);
        }
      }
    } catch (err) {
      const data = err.data || {};
      previewToken = null;
      previewSummary = null;
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
    if (!previewToken || !isProductionHost() || !previewSummary) return;

    const trims = Number(previewSummary.assignments_needing_trim || 0);
    const preserved = Number(previewSummary.preserved_day4_assignments || 0);

    const confirmed = window.confirm(
      `Remove Week 2 Day 4 from ${trims} untouched Language Arts assignment(s)?\n\n` +
      `${preserved} assignment(s) with existing Day 4 student work will be preserved exactly as-is.\n` +
      'Transitional Skills and Days 1–3 will not be rewritten.'
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
        `Day 4 assignments preserved: ${data.preserved_assignments || 0}\n` +
        `Student assignment instances updated: ${data.student_assignment_instances_updated || 0}`
      );

      previewToken = null;
      previewSummary = null;
      await runPreview();
    } catch (err) {
      const data = err.data || {};
      previewToken = null;
      previewSummary = null;
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
