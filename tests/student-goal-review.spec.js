import { test, expect } from "@playwright/test";
test.use({ serviceWorkers: "block" });
const goal = {
  id: "synthetic-goal",
  code: "S001.CG1",
  goal_area: "Reading comprehension",
  desc: "Use evidence from a text to support an answer with 80% accuracy across three checks.",
  measurement_type: "Accuracy",
  baseline: 50,
  target: 80,
  mastery: 80,
  active: true,
};
const question = {
  source: "assignment",
  question_ref: "Q1",
  question_text: "Which detail supports the main claim?",
  choices: ["An unrelated detail", "A detail explaining the claim"],
  student_answer: "A",
  correct_answer: "B",
  is_correct: false,
  score: 0,
  answer_review_available: true,
  teacher_feedback: "Look for a detail that explains the claim.",
};
function explanation(count = 12, detail = true) {
  return {
    goal_code: goal.code,
    measurement_type: "Accuracy",
    percentage: 75,
    source: "ordinary_quarter_average",
    calculation: {
      kind: "quarter_checkpoint_mean",
      checkpoint_count: count,
      inputs: Array.from({ length: count }, (_, i) => ({
        date: "2026-09-06",
        value: i === 0 ? 0 : 75,
        source: "assignment",
        assignment_title: `Synthetic assignment ${count - i}`,
        evidence: detail
          ? Array.from({ length: 30 }, (_, q) => ({
              ...question,
              question_ref: `Q${q + 1}`,
              question_text: q === 0 ? question.question_text : `Supporting question ${q + 1}`,
              is_correct: q === 0 ? false : true,
              score: q === 0 ? 0 : 100,
            }))
          : [],
      })),
    },
  };
}
async function setup(page, context, baseURL, options = {}) {
  const calls = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) return route.abort();
    if (options.missingHelper && url.pathname === "/web/student-goal-progress-view.js")
      return route.abort();
    if (!url.pathname.startsWith("/.netlify/functions/")) return route.continue();
    calls.push(url);
    if (url.pathname.endsWith("/browser-supabase-config"))
      return route.fulfill({ status: 404, json: { ok: false } });
    if (url.pathname.endsWith("/student-goal-explanations")) {
      const detail = url.searchParams.get("view") === "timeline";
      if (options.detailUnavailable && detail)
        return route.fulfill({ json: { ok: true, available: false, goals: [] } });
      if (url.searchParams.get("view") === "work") {
        const index = Number(url.searchParams.get("work_ref").slice(5));
        const count = options.count || 12;
        const row = explanation(1, true).calculation.inputs[0];
        row.assignment_title = `Synthetic assignment ${count - index}`;
        return route.fulfill({ json: { ok: true, available: true, work: row } });
      }
      const row = options.explanation || explanation(options.count || 12, false);
      if (!options.explanation && detail)
        row.calculation.inputs.forEach((input, index) => {
          input.work_ref = `work-${index}`;
        });
      return route.fulfill({
        json: {
          ok: true,
          available: true,
          detail_available: false,
          goals: [row],
          quarter: {
            quarter: url.searchParams.get("quarter"),
            start: url.searchParams.get("start"),
            end: url.searchParams.get("end"),
          },
        },
      });
    }
    return route.fulfill({
      json: {
        ok: true,
        code: "S001",
        student: { code: "S001", name: "Synthetic Student" },
        name: "Synthetic Student",
        students: [],
        instances: [],
        assignments: [],
        submissions: [],
        goals: [{ ...goal, ...options.goal }],
        progress: [],
        data_points: [],
      },
    });
  });
  await context.addInitScript(() => {
    sessionStorage.setItem("rc_user_role", "student");
    sessionStorage.setItem("rc_user_code", "S001");
  });
  await page.clock.setFixedTime(new Date("2026-09-07T12:00:00Z"));
  await page.goto("/student/?tab=goals");
  const card = page.locator("#goalsContent .sgp-card");
  if (!options.missingHelper) await expect(card).toBeVisible();
  return { card, calls, errors };
}

test("large quarter loads details on demand and renders only one page and question", async ({
  page,
  context,
  baseURL,
}) => {
  const { card, calls, errors } = await setup(page, context, baseURL, { count: 1205 });
  await expect(card.locator("[data-sgp-stats]")).toContainText("1,205".replace(",", ""));
  expect(calls.filter((url) => url.pathname.endsWith("/student-goal-explanations"))).toHaveLength(
    1
  );
  await expect(card.locator(".sgp-question")).toHaveCount(0);
  await card.getByText("Explore my progress", { exact: true }).click();
  await expect(card.locator(".sgp-question")).toHaveCount(1);
  expect(calls.filter((url) => url.searchParams.get("view") === "work")).toHaveLength(1);
  await expect(card.locator(".sgp-point")).toHaveCount(5);
  await expect(card.locator("[data-sgp-selected]")).toContainText("Synthetic assignment 1205");
  await expect(card.locator("[data-sgp-selected]")).toContainText("Correct answer");
  await expect(card.locator("[data-sgp-selected]")).toContainText("Teacher feedback");
  expect(await card.locator("*").count()).toBeLessThan(200);
  const detailCalls = calls.filter((url) => url.searchParams.get("view") === "timeline");
  expect(detailCalls).toHaveLength(1);
  expect(detailCalls[0].searchParams.get("goal_code")).toBe(goal.code);
  await card.getByRole("button", { name: "Older checks", exact: true }).click();
  await expect(card.locator(".sgp-point")).toHaveCount(6);
  await expect(card.locator("[data-sgp-stats]")).toContainText("75%");
  await expect(card.locator(".sgp-question")).toHaveCount(1);
  const beforeQuestions = calls.filter((url) => url.searchParams.get("view") === "work").length;
  await card.getByRole("button", { name: "Next question" }).click();
  expect(calls.filter((url) => url.searchParams.get("view") === "work")).toHaveLength(
    beforeQuestions
  );
  await expect(card.locator(".sgp-question")).toContainText("Supporting question 2");
  await card.getByLabel("Focus on answers to review").check();
  await expect(card.locator(".sgp-question")).toContainText(question.question_text);
  await expect(card.getByRole("button", { name: "Next question" })).toHaveCount(0);
  await card.getByLabel("Find an assignment or date").fill("Synthetic assignment 42");
  await expect(card.locator(".sgp-point")).toHaveCount(5);
  await expect(card.locator("[data-sgp-stats]")).toContainText("1205");
  await card.getByLabel("Find an assignment or date").fill("No matching assignment");
  await expect(card.locator(".sgp-point")).toHaveCount(0);
  await expect(card.locator("[data-sgp-selected]")).toContainText("No checks match");
  await card.locator("[data-sgp-quarter]").selectOption("4");
  await expect(card.locator("[data-sgp-stats]")).toContainText("2025–26");
  const oldRequest = calls.filter((url) => url.searchParams.get("view") === "timeline").at(-1);
  expect(oldRequest.searchParams.get("start")).toBe("2025-08-16");
  expect(errors).toEqual([]);
});

for (const theme of ["emerald", "light"]) {
  test(`mobile ${theme}: readable, contained, keyboard-accessible question review`, async ({
    page,
    context,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { card, errors } = await setup(page, context, baseURL);
    await page.evaluate(
      (theme) => document.documentElement.setAttribute("data-theme", theme),
      theme
    );
    await card.getByText("Explore my progress", { exact: true }).click();
    await expect(card.locator(".sgp-point")).toHaveCount(3);
    const point = card.locator(".sgp-point").first();
    await point.focus();
    await page.keyboard.press("Enter");
    await expect(card.locator(".sgp-point").first()).toHaveAttribute("aria-pressed", "true");
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await point.boundingBox()).width).toBeGreaterThanOrEqual(44);
    if (theme === "light") {
      const colors = await card
        .locator(".sgp-prompt")
        .evaluate((el) => ({
          color: getComputedStyle(el).color,
          font: getComputedStyle(el).fontSize,
        }));
      expect(colors.color).toBe("rgb(23, 32, 51)");
    }
    await card.screenshot({ path: `/tmp/student-goal-review-${theme}-mobile.png` });
    expect(errors).toEqual([]);
  });
}

test("review gating, measured zero, conflict, and manual evidence remain honest", async ({
  page,
  context,
  baseURL,
}) => {
  const row = explanation(2);
  row.percentage = 0;
  row.calculation.inputs[0].evidence = [{ ...question, answer_review_available: false }];
  row.calculation.inputs[1].source = "manual";
  row.calculation.inputs[1].evidence = [];
  const { card } = await setup(page, context, baseURL, {
    goal: { criterion_conflict: true },
    explanation: row,
  });
  await expect(card.locator("[data-sgp-stats]")).toContainText("0%");
  await card.getByText("Explore my progress", { exact: true }).click();
  await expect(card.locator(".sgp-target")).toHaveCount(0);
  await expect(card.locator(".sgp-question")).not.toContainText("Correct answer");
  await expect(card.locator(".sgp-question")).not.toContainText(question.teacher_feedback);
  await card.locator(".sgp-point").first().click();
  await expect(card.locator("[data-sgp-selected]")).toContainText(
    "No question-level work is linked"
  );
});

test("objective progress charts the selected skill without inventing a parent trend", async ({
  page,
  context,
  baseURL,
}) => {
  const row = {
    goal_code: goal.code,
    percentage: 75,
    source: "objective_rollup",
    calculation: { kind: "objective_equal_weight_mean", inputs: [] },
    objectives: [
      {
        objective_number: 1,
        objective_text: "Choose relevant evidence.",
        percentage: 75,
        earned: 3,
        max: 4,
        evidence_count: 2,
        evidence: [
          {
            ...question,
            date: "2026-09-06",
            objective_earned: 1,
            objective_max: 2,
            component_label: "Relevant evidence",
          },
          { ...question, date: "2026-09-02", objective_earned: 2, objective_max: 2 },
        ],
      },
      {
        objective_number: 2,
        objective_text: "Explain the evidence.",
        percentage: null,
        evidence_count: 0,
        evidence: [],
      },
    ],
  };
  const { card } = await setup(page, context, baseURL, { explanation: row });
  await card.getByText("Explore my progress", { exact: true }).click();
  await expect(card.locator(".sgp-point")).toHaveCount(2);
  await expect(card.locator(".sgp-target")).toHaveCount(0);
  await expect(card.locator(".sgp-question")).toContainText("Goal skill score");
  await expect(card.locator(".sgp-question")).not.toContainText("Question score");
  await card.locator("[data-sgp-objective]").selectOption("1");
  await expect(card.locator(".sgp-point")).toHaveCount(0);
  await expect(card.locator("[data-sgp-stats]")).toContainText("75%");
});

test("unavailable detail keeps official goal and summary usable", async ({
  page,
  context,
  baseURL,
}) => {
  const { card } = await setup(page, context, baseURL, { detailUnavailable: true });
  await card.getByText("Explore my progress", { exact: true }).click();
  await expect(card.getByRole("status")).toContainText("temporarily unavailable");
  await expect(card.locator("[data-sgp-stats]")).toContainText("75%");
  await card.getByText("My full goal and target", { exact: true }).click();
  await expect(card.locator(".sgp-official")).toContainText(goal.desc);
});

test("missing progressive helper falls back to the established explanation view", async ({
  page,
  context,
  baseURL,
}) => {
  await setup(page, context, baseURL, { missingHelper: true });
  await expect(page.locator("#goalsContent")).toContainText("Evidence behind the number");
});
