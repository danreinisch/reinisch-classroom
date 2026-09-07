/* Student goal review: quarter math stays server-owned; render only one window
 * of checks and one question at a time. No annual assignment list in the DOM. */
(function () {
  "use strict";
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  const number = (value) =>
    value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
      ? Number(value)
      : null;
  const date = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value || "")
      ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Date unavailable";
  const text = (value) =>
    value == null || value === ""
      ? "Not recorded"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const btn = (action, label, disabled = false) =>
    `<button type="button" data-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;
  const stateByCard = new WeakMap();
  const observersByRoot = new WeakMap();

  function stats(goal, explanation, options, quarterLabel) {
    const value = number(explanation?.percentage);
    const objective = explanation?.source === "objective_rollup";
    const format = (v) => options.format(v, objective ? "Percent" : goal.measurement_type);
    const count = objective
      ? (explanation?.objectives || []).reduce((sum, row) => sum + (row.evidence_count || 0), 0)
      : explanation?.calculation?.inputs?.length || 0;
    return `<div class="sgp-stats"><div><span>${esc(quarterLabel)} ${explanation?.source === "existing_parent" ? "recorded progress" : "average"}</span><strong>${!options.available ? "Unavailable" : value === null ? "No data yet" : esc(format(value))}</strong></div>
      ${!options.conflict && number(options.target) !== null && !objective ? `<div><span>Goal target</span><strong>${esc(format(options.target))}</strong></div>` : ""}
      <div><span>${objective ? "Evidence records" : "Progress checks"}</span><strong>${options.available ? count : "—"}</strong></div></div>
      ${options.conflict ? '<p class="sgp-note">Your teacher is checking the goal target. Your recorded progress is still shown.</p>' : ""}
      ${objective ? '<p class="sgp-note">Goal progress combines the measured skills below. Each skill has equal weight.</p>' : ""}
      ${explanation?.objective_status?.available === false ? '<p class="sgp-note">Skill details are temporarily unavailable. Available goal checks are shown.</p>' : ""}`;
  }

  function renderCard(goal, explanation, options) {
    const wording = goal.desc || goal.goal_text || "Goal description unavailable.";
    return `<article class="st-goal-card sgp-card" data-sgp-goal="${esc(goal.code)}">
      <header class="sgp-header"><div><span class="sgp-eyebrow">MY GOAL</span><h3>${esc(goal.goal_area || "My progress")}</h3></div><span class="sgp-code">${esc(goal.code)}</span></header>
      <div data-sgp-stats>${stats(goal, explanation, options, options.quarterLabel)}</div>
      <details class="sgp-progress"><summary>Explore my progress</summary><div data-sgp-body></div></details>
      <details class="sgp-official"><summary>My full goal and target</summary><p>${esc(wording)}</p>
        <p>Baseline: ${esc(options.format(goal.baseline, goal.measurement_type))} · Target: ${esc(options.format(goal.target, goal.measurement_type))} · Mastery: ${esc(options.format(goal.mastery, goal.measurement_type))}</p>
        ${(goal.objectives || []).map((o) => `<p><strong>Skill ${esc(o.objective_number || "")}</strong> ${esc(o.objective_text || o.text || "")}</p>`).join("")}
        ${options.conflict ? "<p>The goal wording and recorded target need teacher review. An automatic target comparison is unavailable.</p>" : ""}
      </details></article>`;
  }

  function checkpoints(state) {
    if (state.explanation?.source === "objective_rollup") {
      const objective = state.explanation.objectives?.[state.objectiveIndex];
      return (objective?.evidence || [])
        .map((row, index) => ({
          ...row,
          index,
          value:
            number(row.objective_max) > 0 && number(row.objective_earned) !== null
              ? (Number(row.objective_earned) / Number(row.objective_max)) * 100
              : null,
          evidence: [row],
        }))
        .reverse();
    }
    return (state.explanation?.calculation?.inputs || [])
      .map((row, index) => ({ ...row, index }))
      .reverse();
  }

  function pageSize(card) {
    return card.clientWidth < 440 ? 3 : 6;
  }
  function result(row) {
    if (row.source !== "assignment" && row.answer_review_available !== true)
      return "Recorded check";
    if (row.answer_review_available !== true) return "Review pending";
    if (row.is_correct === false) return "Review this answer";
    if (row.is_correct === true) return "Correct";
    if (number(row.score) !== null) return row.score < 100 ? "Review this answer" : "Reviewed";
    if (number(row.objective_earned) !== null && number(row.objective_max) > 0)
      return Number(row.objective_earned) < Number(row.objective_max)
        ? "Review this skill"
        : "Reviewed";
    return "Reviewed";
  }
  function isMiss(row) {
    return result(row).startsWith("Review this");
  }

  function answerLabel(value, choices) {
    const raw = text(value);
    if (!Array.isArray(choices)) return raw;
    const found = choices.find((choice, i) => {
      const label =
        typeof choice === "object"
          ? (choice?.label ?? choice?.key ?? String.fromCharCode(65 + i))
          : String.fromCharCode(65 + i);
      return raw === String(label);
    });
    if (!found) return raw;
    const label = typeof found === "object" ? (found.text ?? found.value ?? found.label) : found;
    return `${raw} — ${label}`;
  }

  function questionHtml(row, index, count) {
    const released = row.answer_review_available === true;
    const status = result(row);
    const objective = number(row.objective_earned) !== null && number(row.objective_max) !== null;
    return `<div class="sgp-question">
      <div class="sgp-question-heading"><strong>${esc(row.question_ref || `Question ${index + 1}`)}</strong><span class="sgp-result ${isMiss(row) ? "sgp-review" : ""}">${esc(status)}</span></div>
      ${row.component_label ? `<p class="sgp-note">Skill: ${esc(row.component_label)}</p>` : ""}
      <p class="sgp-prompt">${esc(row.question_text || "Question text was not saved with this check.")}</p>
      <dl><div><dt>Your answer</dt><dd>${esc(answerLabel(row.student_answer, row.choices))}</dd></div>
      ${released && row.correct_answer != null ? `<div><dt>Correct answer</dt><dd>${esc(answerLabel(row.correct_answer, row.choices))}</dd></div>` : ""}
      ${released && !objective && number(row.score) !== null ? `<div><dt>Question score</dt><dd>${esc(row.score)}%</dd></div>` : ""}
      ${objective && (released || row.source !== "assignment") ? `<div><dt>Goal skill score</dt><dd>${esc(row.objective_earned)} / ${esc(row.objective_max)}</dd></div>` : ""}</dl>
      ${released && row.teacher_feedback ? `<div class="sgp-feedback"><strong>Teacher feedback</strong><p>${esc(row.teacher_feedback)}</p></div>` : ""}
      ${!released && row.source === "assignment" ? '<p class="sgp-note">Your teacher has not released answer review for this work yet.</p>' : ""}
      ${Array.isArray(row.choices) && row.choices.length ? `<details><summary>Answer choices</summary><ul>${row.choices.map((choice) => `<li>${esc(typeof choice === "object" ? (choice.text ?? choice.value ?? choice.label ?? "") : choice)}</li>`).join("")}</ul></details>` : ""}
      ${count > 1 ? `<nav class="sgp-pager" aria-label="Questions in this check">${btn("question-prev", "Previous question", index === 0)}<span>${index + 1} of ${count}</span>${btn("question-next", "Next question", index === count - 1)}</nav>` : ""}
    </div>`;
  }

  function renderSelected(state) {
    const row = state.checks[state.selected];
    if (!row)
      return `<p class="sgp-note">${state.search ? "No checks match this search." : "No progress checks were recorded in this quarter."}</p>`;
    const evidence = Array.isArray(row.evidence) ? row.evidence : [];
    const questions = evidence.filter(
      (q) => q.question_text || q.student_answer != null || q.component_label
    );
    const filtered = state.missedOnly ? questions.filter(isMiss) : questions;
    state.questionIndex = Math.max(0, Math.min(state.questionIndex, filtered.length - 1));
    return `<section class="sgp-work" aria-label="Work behind the selected check">
      <div class="sgp-work-heading"><div><span class="sgp-eyebrow">WORK BEHIND THIS CHECK</span><h4>${esc(row.assignment_title || (row.source === "assignment" ? "Assignment progress check" : "Progress check"))}</h4><p class="sgp-note">${esc(date(row.date))} · Check ${state.selected + 1} of ${state.checks.length}</p></div><strong>${esc(state.format(row.value))}</strong></div>
      ${row.work_ref && state.loadWork && !row.workLoaded ? (row.workError ? "<p>Question details are temporarily unavailable.</p>" + btn("work-retry", "Try question details again") : '<p role="status">Loading the work for this check…</p>') : ""}
      ${questions.length > 1 ? `<label class="sgp-filter"><input type="checkbox" data-sgp-missed ${state.missedOnly ? "checked" : ""}> Focus on answers to review</label>` : ""}
      ${questions.length ? (filtered.length ? questionHtml(filtered[state.questionIndex], state.questionIndex, filtered.length) : "<p>No released answers need review in this check.</p>") : row.work_ref && state.loadWork && !row.workLoaded ? "" : "<p>This check counts toward your recorded progress. No question-level work is linked to it.</p>"}
    </section>`;
  }

  function renderChart(state) {
    const start = state.page * state.pageSize;
    const page = state.checks.slice(start, start + state.pageSize);
    const numeric = page.filter((row) => number(row.value) !== null);
    const isObjective = state.explanation?.source === "objective_rollup";
    const target = !isObjective && !state.options.conflict ? number(state.options.target) : null;
    const percent =
      isObjective ||
      !/number|frequency|duration|observation|count|time/i.test(state.goal.measurement_type || "");
    const observation = /observation/i.test(state.goal.measurement_type || "");
    const max = Math.max(
      percent ? 100 : 1,
      ...numeric.map((row) => Number(row.value)),
      target ?? 0
    );
    const min = Math.min(0, ...numeric.map((row) => Number(row.value)));
    const y = (value) => 140 - ((value - min) / (max - min || 1)) * 115;
    const x = (i) => (page.length === 1 ? 50 : 10 + (i / (page.length - 1)) * 80);
    const points = page
      .map((row, i) => (number(row.value) === null ? null : `${x(i) * 6},${y(Number(row.value))}`))
      .filter(Boolean)
      .join(" ");
    return `<section class="sgp-trend" aria-label="${isObjective ? "Selected skill evidence" : "Goal progress checks"}">
      <p class="sgp-note">${isObjective ? "Each point shows evidence for the selected skill." : "Each point is one progress check."} Select a point to see its work.</p>
      ${
        !observation && page.length
          ? `<div class="sgp-plot"><span class="sgp-axis sgp-axis-top">${esc(state.format(max))}</span><span class="sgp-axis sgp-axis-bottom">${esc(state.format(min))}</span>
        <svg viewBox="0 0 600 170" preserveAspectRatio="none" aria-hidden="true"><line class="sgp-grid" x1="60" y1="140" x2="540" y2="140"/>
          ${target !== null ? `<line class="sgp-target" x1="60" y1="${y(target)}" x2="540" y2="${y(target)}"/>` : ""}
          <polyline class="sgp-line" points="${points}"/></svg>
        ${page.map((row, i) => (number(row.value) === null ? "" : `<button type="button" class="sgp-point" data-check="${start + i}" style="left:${x(i)}%;top:${(y(Number(row.value)) / 170) * 100}%" aria-pressed="${state.selected === start + i}" aria-label="Check ${start + i}, ${esc(date(row.date))}, ${esc(state.format(row.value))}${row.assignment_title ? `, ${esc(row.assignment_title)}` : ""}"><span></span></button>`)).join("")}
      </div><div class="sgp-axis-dates"><span>${esc(date(page[0].date))}</span><span>${page.length > 1 ? esc(date(page.at(-1).date)) : ""}</span></div>
      ${target !== null ? `<p class="sgp-note"><span class="sgp-key"></span> Goal target ${esc(state.format(target))}</p>` : ""}`
          : ""
      }
      <nav class="sgp-pager" aria-label="Progress check pages">${btn("older", "Older checks", start === 0)}<span>${page.length ? `${start + 1}–${start + page.length} of ${state.checks.length}` : "No checks"}</span>${btn("newer", "Newer checks", start + state.pageSize >= state.checks.length)}</nav>
      <details class="sgp-calculation"><summary>How my progress is calculated</summary>
        <p>${state.explanation?.source === "existing_parent" ? "This is the latest recorded parent-goal value available for this quarter." : isObjective ? "Each measured skill uses total points earned divided by total possible points. The parent goal averages the measured skill percentages equally; skills with no data are left out." : `The quarter average includes all ${state.allChecks.length} recorded checks, including older pages. This chart displays up to ${state.pageSize} checks at once.`}</p>
        ${isObjective ? `<ul>${(state.explanation.objectives || []).map((o) => `<li>Skill ${esc(o.objective_number)}: ${o.percentage == null ? "No data" : `${esc(o.earned)} / ${esc(o.max)} = ${esc(o.percentage)}%`}</li>`).join("")}</ul>` : ""}
        <table><caption>Checks on this page</caption><thead><tr><th>Check</th><th>Date</th><th>Recorded value</th></tr></thead><tbody>${page.map((row, i) => `<tr><td><button type="button" data-check="${start + i}">${start + i + 1}</button></td><td>${esc(date(row.date))}</td><td>${esc(state.format(row.value))}</td></tr>`).join("")}</tbody></table>
      </details></section>`;
  }

  function quarterControl(state) {
    return `<label>Quarter <select data-sgp-quarter>${state.quarters.map((q, i) => `<option value="${i}" ${i === state.quarterIndex ? "selected" : ""}>${esc(q.label)}</option>`).join("")}</select></label>`;
  }

  function redraw(state, focus) {
    const objectives =
      state.explanation?.source === "objective_rollup" ? state.explanation.objectives || [] : [];
    state.body.innerHTML = `<div class="sgp-controls">${quarterControl(state)}
      ${objectives.length ? `<label>Goal skill <select data-sgp-objective>${objectives.map((o, i) => `<option value="${i}" ${i === state.objectiveIndex ? "selected" : ""}>Skill ${esc(o.objective_number)} · ${o.percentage == null ? "No data" : `${esc(o.percentage)}%`}</option>`).join("")}</select></label>` : ""}
      ${state.allChecks.length > 6 ? `<label>Find an assignment or date<input type="search" data-sgp-search value="${esc(state.search)}" placeholder="Assignment name or YYYY-MM-DD"></label>` : ""}</div>
      ${state.search ? `<p class="sgp-note">${state.checks.length} matching checks. The quarter average still includes all ${state.allChecks.length} checks.</p>` : ""}
      ${objectives.length ? `<p class="sgp-skill-text">${esc(objectives[state.objectiveIndex]?.objective_text)}</p>` : ""}
      ${renderChart(state)}<div data-sgp-selected aria-live="polite">${renderSelected(state)}</div>`;
    state.card.querySelector("[data-sgp-stats]").innerHTML = stats(
      state.goal,
      state.explanation,
      { ...state.options, available: true },
      state.quarters[state.quarterIndex].label
    );
    if (focus) state.body.querySelector(focus)?.focus();
    ensureWork(state);
  }

  async function ensureWork(state) {
    const row = state.checks[state.selected];
    if (!row?.work_ref || !state.loadWork || row.workLoaded || row.workLoading || row.workError)
      return;
    const generation = state.generation;
    row.workLoading = true;
    try {
      const work = await state.loadWork(
        state.goal.code,
        state.quarters[state.quarterIndex],
        row.work_ref
      );
      if (generation !== state.generation || !state.card.isConnected) return;
      row.evidence = work.evidence || [];
      row.workLoaded = true;
    } catch (_) {
      row.workError = true;
    } finally {
      row.workLoading = false;
      if (
        generation === state.generation &&
        state.card.isConnected &&
        state.checks[state.selected] === row
      ) {
        state.body.querySelector("[data-sgp-selected]").innerHTML = renderSelected(state);
      }
    }
  }

  function resetSelection(state) {
    state.pageSize = pageSize(state.card);
    state.allChecks = checkpoints(state);
    state.checks = state.allChecks;
    state.search = "";
    state.format = (value) =>
      state.options.format(
        value,
        state.explanation?.source === "objective_rollup" ? "Percent" : state.goal.measurement_type
      );
    state.selected = Math.max(0, state.checks.length - 1);
    state.page = Math.floor(state.selected / state.pageSize);
    state.questionIndex = 0;
    state.missedOnly = false;
  }

  async function load(state, quarterIndex, focus) {
    const generation = ++state.generation;
    state.quarterIndex = quarterIndex;
    state.body.setAttribute("aria-busy", "true");
    state.body.innerHTML = '<p role="status">Loading this quarter’s progress…</p>';
    try {
      const data = await state.loadDetail(state.goal.code, state.quarters[quarterIndex]);
      if (generation !== state.generation || !state.card.isConnected) return;
      if (!data) throw new Error("Unavailable");
      state.explanation = data;
      state.objectiveIndex = 0;
      resetSelection(state);
      redraw(state, focus);
    } catch (_) {
      if (generation !== state.generation || !state.card.isConnected) return;
      state.body.innerHTML =
        `<div class="sgp-controls">${quarterControl(state)}</div>` +
        '<p role="status">Progress details are temporarily unavailable. Try again.</p>' +
        btn("retry", "Try again");
    } finally {
      if (generation === state.generation) state.body.removeAttribute("aria-busy");
    }
  }

  function mount(root, config) {
    for (const observer of observersByRoot.get(root) || []) observer.disconnect();
    const observers = [];
    observersByRoot.set(root, observers);
    for (const card of root.querySelectorAll("[data-sgp-goal]")) {
      if (stateByCard.has(card)) continue;
      const goal = config.goals.find((g) => g.code === card.dataset.sgpGoal);
      if (!goal) continue;
      const options = config.options(goal);
      const state = {
        card,
        goal,
        options,
        quarters: config.quarters,
        quarterIndex: config.currentIndex,
        loadDetail: config.loadDetail,
        loadWork: config.loadWork,
        body: card.querySelector("[data-sgp-body]"),
        generation: 0,
        objectiveIndex: 0,
        selected: 0,
        page: 0,
        questionIndex: 0,
        missedOnly: false,
        checks: [],
      };
      stateByCard.set(card, state);
      if (typeof ResizeObserver === "function") {
        const observer = new ResizeObserver(() => {
          const nextSize = pageSize(card);
          if (
            !state.explanation ||
            state.pageSize === nextSize ||
            state.body.hasAttribute("aria-busy")
          )
            return;
          state.pageSize = nextSize;
          state.page = Math.floor(state.selected / nextSize);
          redraw(state);
        });
        observer.observe(card);
        observers.push(observer);
      }
      card.querySelector(".sgp-progress").addEventListener("toggle", (event) => {
        if (event.target.open && !state.generation) load(state, state.quarterIndex);
      });
      card.addEventListener("input", (event) => {
        if (!event.target.matches("[data-sgp-search]")) return;
        state.search = event.target.value;
        const query = state.search.toLocaleLowerCase().trim();
        state.checks = state.allChecks.filter((row) =>
          `${row.assignment_title || ""} ${row.date || ""} ${date(row.date)}`
            .toLocaleLowerCase()
            .includes(query)
        );
        state.selected = Math.max(0, state.checks.length - 1);
        state.page = Math.floor(state.selected / state.pageSize);
        state.questionIndex = 0;
        state.missedOnly = false;
        redraw(state, "[data-sgp-search]");
      });
      card.addEventListener("change", (event) => {
        if (event.target.matches("[data-sgp-quarter]"))
          load(state, Number(event.target.value), "[data-sgp-quarter]");
        if (event.target.matches("[data-sgp-objective]")) {
          state.objectiveIndex = Number(event.target.value);
          resetSelection(state);
          redraw(state, "[data-sgp-objective]");
        }
        if (event.target.matches("[data-sgp-missed]")) {
          state.missedOnly = event.target.checked;
          state.questionIndex = 0;
          redraw(state, "[data-sgp-missed]");
        }
      });
      card.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button || button.disabled) return;
        const action = button.dataset.action;
        if (action === "work-retry") {
          state.checks[state.selected].workError = false;
          redraw(state);
          return;
        }
        if (action === "retry") return load(state, state.quarterIndex, "[data-sgp-quarter]");
        if (button.dataset.check !== undefined) {
          state.selected = Number(button.dataset.check);
          state.questionIndex = 0;
          state.missedOnly = false;
          redraw(state, `[data-check="${state.selected}"]`);
          return;
        }
        if (action === "older" || action === "newer") {
          state.page += action === "older" ? -1 : 1;
          state.selected = Math.min(state.page * state.pageSize, state.checks.length - 1);
          state.questionIndex = 0;
          state.missedOnly = false;
        } else if (action === "question-prev" || action === "question-next") {
          state.questionIndex += action === "question-prev" ? -1 : 1;
        } else return;
        redraw(state, `[data-action="${action}"]:not(:disabled)`);
        // Keep keyboard focus useful at the first/last page as well.
        if (document.activeElement === document.body)
          state.body.querySelector("[data-sgp-quarter]")?.focus();
      });
    }
  }

  window.RCStudentGoalProgress = { renderCard, mount };
})();
