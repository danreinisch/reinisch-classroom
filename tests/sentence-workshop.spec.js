import { test, expect } from "@playwright/test";

const donor = "/student/resources/presentation-01/final_exam_skill_builder_20q_feedback.html";
const mirror =
  "/presentations/language-arts-toolkit/presentation-01/final_exam_skill_builder_20q_feedback.html";
const viewer = `/viewer/?src=${encodeURIComponent(mirror)}&return=%2Fstudent%2F%3Ftab%3Dactivities&title=Language%20Arts%20Skill%20Builder&activity=1`;
const boundaries = {
  "practice-1": 3,
  "practice-2": 4,
  "check-1": 5,
  "check-2": 4,
  "apply-1": 4,
  "apply-2": 4,
};

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL).origin;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith("/.netlify/functions/"))
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"ok":false,"error":"Synthetic test"}',
      });
    return route.continue();
  });
  await context.addInitScript(() => {
    window.swSpoken = [];
    window.swCancelled = 0;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      writable: true,
      value: {
        cancel() {
          window.swCancelled++;
        },
        speak(message) {
          window.swSpoken.push(message.text);
        },
      },
    });
    window.SpeechSynthesisUtterance = function (text) {
      this.text = text;
    };
  });
});

async function open(page, route = donor) {
  await page.goto(route);
  await page.locator("#openSentenceWorkshopBtn").click();
  await expect(page.locator("#sentenceWorkshop")).toBeVisible();
  await page.locator('[data-sw-action="start"]').click();
}

async function solve(scope) {
  const id = await scope.locator("[data-sw-item]").getAttribute("data-sw-item");
  const boundary = boundaries[id];
  expect(boundary).toBeTruthy();
  await scope.locator(`[data-sw-gap="${boundary}"]`).click();
  await scope.locator(`[data-sw-word="${boundary}"]`).click();
  await scope.locator('[data-sw-action="check"]').click();
  await expect(scope.locator("#sw-feedback")).toContainText("Edit complete");
}

test("complete independent route, accurate summary, and resume without adding quiz points", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(donor);
  await expect(page.locator("#skillMenuGrid > .skill-card")).toHaveCount(9);
  const workshopCard = page.locator("#skillMenuGrid > #openSentenceWorkshopBtn");
  const nextCard = page.locator('[data-open-skill="verbs"]');
  const workshopBox = await workshopCard.boundingBox();
  const nextBox = await nextCard.boundingBox();
  expect(Math.abs(workshopBox.width - nextBox.width)).toBeLessThan(1);
  expect(workshopBox.y).toBe(nextBox.y);
  expect(workshopBox.height).toBe(nextBox.height);
  await page
    .locator("#skillMenuGrid")
    .screenshot({ path: testInfo.outputPath("sentence-workshop-menu.png") });
  await workshopCard.click();
  await page.locator('[data-sw-action="start"]').click();
  expect(await page.locator("[data-sw-gap]").allTextContents()).toEqual(Array(6).fill(""));
  await page.locator('[data-sw-action="read-task"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toBe(
    `Make two clear sentences. ${await page.locator("#sw-directions").textContent()}`
  );
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("sentence-workshop-blank-spaces.png") });
  await page.locator('[data-sw-action="read-marks"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain("Capital P");
  for (let i = 0; i < 6; i++) {
    await solve(page);
    await page.locator('[data-sw-action="next"]').click();
  }
  await expect(page.locator(".sw-stats strong").first()).toHaveText("2 / 2");
  await expect(page.locator(".sw-card")).toContainText(
    "Message edits correct on the first try without hints: 2 / 2"
  );
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("sentence-workshop-summary.png") });
  await page.locator('.sw-card [data-sw-action="menu"]').click();
  await expect(page.locator("#scoreNumMenu")).toHaveText("0");
  await expect(page.locator("#scoreTotalMenu")).toHaveText("140");
  await expect(page.locator("#openSentenceWorkshopBtn")).toBeFocused();
  await expect(page.locator("#skillMenuGrid > .skill-card")).toHaveCount(9);
  await page.locator("#openSentenceWorkshopBtn").click();
  await expect(page.locator(".sw-stats strong").first()).toHaveText("2 / 2");
  expect(errors).toEqual([]);
});

test("partial feedback, keyboard editing, and supported results work at a narrow viewport", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const gap = page.locator('[data-sw-gap="3"]');
  await expect(gap).toHaveAccessibleName("Period after lunch");
  await expect(gap).toBeEmpty();
  const gapBox = await gap.boundingBox();
  expect(gapBox.width).toBeGreaterThanOrEqual(44);
  expect(gapBox.height).toBeGreaterThanOrEqual(44);
  await gap.focus();
  await gap.press("Enter");
  await expect(page.locator('[data-sw-gap="3"]')).toBeFocused();
  await expect(page.locator('[data-sw-gap="3"]')).toHaveText(".");
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("period is in the right place");
  await expect(page.locator("#sw-feedback")).toBeFocused();
  await page.locator('[data-sw-word="3"]').press("Space");
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("Edit complete");
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("sentence-workshop-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-sw-action="finish"]').click();
  await expect(page.locator(".sw-stats strong").nth(1)).toHaveText("1");
  await expect(page.locator(".sw-card")).toContainText("No fresh checks were attempted");
});

test("help ladder shows a different shorter task after a worked example", async ({
  page,
}, testInfo) => {
  await open(page);
  await page.locator('[data-sw-action="check"]').click();
  await page.locator('[data-sw-gap="1"]').click();
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator('[data-sw-action="check"]')).toBeDisabled();
  await page.locator('[data-sw-action="hint"]').click();
  await page.locator('[data-sw-action="hint"]').click();
  await expect(page.locator(".sw-hint")).toContainText("first message ends after “lunch”");
  await expect(page.locator(".sw-cue")).toHaveCount(3);
  await page.locator('[data-sw-action="read-hint"]').click();
  await page.locator('[data-sw-action="demonstrate"]').click();
  await expect(page.locator(".sw-card")).toContainText("Pack your lunch. The bus arrives soon.");
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("sentence-workshop-support.png") });
  await page.locator('[data-sw-action="next"]').click();
  await expect(page.locator("[data-sw-item]")).toHaveAttribute("data-sw-item", "simpler-1");
  await page.locator('[data-sw-action="finish"]').click();
  await expect(page.locator(".sw-stats strong").nth(1)).toHaveText("0");
  await expect(page.locator(".sw-stats strong").nth(2)).toHaveText("1");
});

for (const route of [donor, mirror]) {
  test(`clear, cancel, reload, and restored history remove workshop state: ${route}`, async ({
    page,
  }) => {
    await open(page, route);
    await page.locator('[data-sw-gap="3"]').click();
    await page.locator('[data-sw-action="clear"]').click();
    await expect(page.locator("#clearPracticeDialog")).toBeVisible();
    await expect(page.locator("#cancelClearPracticeBtn")).toBeFocused();
    await page.locator("#cancelClearPracticeBtn").press("Escape");
    await expect(page.locator('[data-sw-action="clear"]')).toBeFocused();
    await expect(page.locator('[data-sw-gap="3"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-sw-action="clear"]').click();
    await page.locator("#confirmClearPracticeBtn").click();
    await expect(page.locator("#mainMenu")).toBeVisible();
    await expect(page.locator("#sentenceWorkshop")).toBeEmpty();
    await page.locator("#openSentenceWorkshopBtn").click();
    await expect(page.locator('[data-sw-action="start"]')).toBeVisible();
    await page.locator('[data-sw-action="start"]').click();
    await page.locator('[data-sw-action="hint"]').click();
    await page.reload();
    await page.locator("#openSentenceWorkshopBtn").click();
    await expect(page.locator('[data-sw-action="start"]')).toBeVisible();
    await page.evaluate(() =>
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
    );
    await expect(page.locator("#sentenceWorkshop")).toBeEmpty();
    await expect(page.locator("#mainMenu")).toBeVisible();
  });
}

test("Viewer sandbox supports workshop, clear confirmation, and return to Activities", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.evaluate(() => {
    sessionStorage.setItem("rc_user_role", "student");
    sessionStorage.setItem("rc_user_code", "S010");
  });
  await page.goto(viewer);
  const builder = page.frameLocator("#contentIframe");
  await builder.locator("#openSentenceWorkshopBtn").click();
  await builder.locator('[data-sw-action="start"]').click();
  await solve(builder);
  await page.screenshot({ path: testInfo.outputPath("sentence-workshop-viewer.png") });
  await builder.locator('[data-sw-action="clear"]').click();
  await expect(builder.locator("#clearPracticeDialog")).toBeVisible();
  await builder.locator("#confirmClearPracticeBtn").click();
  await expect(builder.locator("#sentenceWorkshop")).toBeEmpty();
  await page.locator("#exitActivityBtn").click();
  await expect(page).toHaveURL(/\/student\/\?tab=activities$/);
  await expect(page.locator("#tabActivities")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("rc_user_code"))).toBe("S010");
});

test("missing speech still offers usable text, with no native dialog", async ({ page }) => {
  await open(page);
  let dialogs = 0;
  page.on("dialog", (dialog) => {
    dialogs++;
    dialog.dismiss();
  });
  await page.evaluate(() => {
    window.speechSynthesis = undefined;
  });
  await page.locator('[data-sw-action="read-task"]').click();
  await expect(page.locator("#sw-voice-note")).toContainText("Voice is unavailable");
  await expect(page.locator("#sw-directions")).toBeVisible();
  await solve(page);
  expect(dialogs).toBe(0);
});

test("failed module loading leaves existing practice available", async ({ page }) => {
  await page.route("**/sentence-workshop.js?*", (route) => route.abort());
  await page.goto(donor);
  await page.locator("#openSentenceWorkshopBtn").click();
  await expect(page.locator("#sentenceWorkshopStatus")).toContainText("could not open");
  await expect(page.locator("#mainMenu")).toBeVisible();
  await page.locator('[data-open-skill="wordparts"]').click();
  await expect(page.locator(".prompt")).toHaveText("Which part of replay is the prefix?");
});

test("clearing while a module loads cannot reopen the old visit", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/sentence-workshop.js?*", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(donor);
  await page.locator("#openSentenceWorkshopBtn").click();
  await page.locator("#resetBtn").click();
  await page.locator("#confirmClearPracticeBtn").click();
  release();
  await page.waitForResponse((response) => response.url().includes("sentence-workshop.js"));
  await expect(page.locator("#sentenceWorkshop")).toBeHidden();
  await expect(page.locator("#openSentenceWorkshopBtn")).toBeEnabled();
  await page.locator("#openSentenceWorkshopBtn").click();
  await expect(page.locator('[data-sw-action="start"]')).toBeVisible();
});

test("choosing a different skill during loading takes precedence over the pending workshop", async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/sentence-workshop.js?*", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(donor);
  await page.locator("#openSentenceWorkshopBtn").click();
  await page.locator('[data-open-skill="wordparts"]').click();
  release();
  await expect(page.locator("#openSentenceWorkshopBtn")).toBeEnabled();
  await expect(page.locator("#sentenceWorkshop")).toBeHidden();
  await expect(page.locator(".prompt")).toHaveText("Which part of replay is the prefix?");
  await page.locator("#backMenuBtn").click();
  await expect(page.locator("#sentenceWorkshopStatus")).toBeEmpty();
  await page.locator("#openSentenceWorkshopBtn").click();
  await expect(page.locator('[data-sw-action="start"]')).toBeVisible();
});

async function openEndings(page, route = donor) {
  await page.goto(route);
  await page.locator("#openSentenceWorkshopBtn").click();
  await page.locator('[data-sw-action="lesson-endings"]').click();
  await page.locator('[data-sw-action="start"]').click();
}

async function chooseEnding(page, mark) {
  await page.locator(`[data-sw-ending="${mark}"]`).click();
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("Edit complete");
}

test("endings support three purposes, accepted alternative tone, narration, and their own summary", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openEndings(page);
  await page.locator('[data-sw-action="read-task"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain("Ask your coach");
  const answers = ["?", ".", "!", "?", ".", "!", "?", ".", "!", "!"];
  for (const [index, mark] of answers.entries()) {
    await chooseEnding(page, mark);
    await page.locator('[data-sw-action="read-marks"]').click();
    expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain(
      mark === "?" ? "question mark" : mark === "!" ? "exclamation mark" : "period"
    );
    await page.locator('[data-sw-action="read-feedback"]').click();
    if (index === 9) {
      await expect(page.locator("#sw-feedback")).toContainText("period would also fit");
      await page
        .locator("#sentenceWorkshop")
        .screenshot({ path: testInfo.outputPath("endings-flexible-tone.png") });
    }
    await page.locator('[data-sw-action="next"]').click();
  }
  await expect(page.locator(".sw-stats strong").first()).toHaveText("3 / 3");
  await expect(page.locator(".sw-card")).toContainText("4 / 4 attempted");
  await expect(page.locator(".sw-card")).not.toContainText("undefined");
  await page.locator('[data-sw-action="read-report"]').click();
  await page.locator('.sw-card [data-sw-action="menu"]').click();
  await expect(page.locator("#scoreNumMenu")).toHaveText("0");
  await expect(page.locator("#scoreTotalMenu")).toHaveText("140");
  await page.locator("#openSentenceWorkshopBtn").click();
  await expect(page.locator(".sw-stats strong").first()).toHaveText("3 / 3");
  await page.locator('[data-sw-action="lesson-boundaries"]').click();
  await expect(page.locator('[data-sw-action="start"]')).toBeVisible();
  await page.locator('[data-sw-action="lesson-endings"]').click();
  await expect(page.locator(".sw-stats strong").first()).toHaveText("3 / 3");
  expect(errors).toEqual([]);
});

test("endings wrong edits, hints, and worked examples lead to a different shorter task", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openEndings(page);
  await page.locator('[data-sw-ending="."]').click();
  await page.locator('[data-sw-action="check"]').click();
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("Change your edit");
  await expect(page.locator('[data-sw-action="check"]')).toBeEnabled();
  await page.locator('[data-sw-action="read-feedback"]').click();
  await page.locator('[data-sw-action="hint"]').click();
  await page.locator('[data-sw-action="read-hint"]').click();
  await page.locator('[data-sw-action="hint"]').click();
  await expect(page.locator('[data-sw-ending="?"]')).toHaveClass(/sw-cue/);
  await page.locator('[data-sw-action="read-hint"]').click();
  await page.locator('[data-sw-ending="!"]').click();
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator('[data-sw-action="check"]')).toBeDisabled();
  await page.locator('[data-sw-action="demonstrate"]').click();
  await page.locator('[data-sw-action="read-solution"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain("question mark");
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("endings-support.png") });
  await page.locator('[data-sw-action="next"]').click();
  await expect(page.locator("[data-sw-item]")).toHaveAttribute("data-sw-item", "endings-simpler-1");
  await page.locator('[data-sw-action="hint"]').click();
  await chooseEnding(page, "?");
  await page.locator('[data-sw-action="finish"]').click();
  await expect(page.locator(".sw-stats strong").nth(1)).toHaveText("1");
  await expect(page.locator(".sw-stats strong").nth(2)).toHaveText("1");
  expect(errors).toEqual([]);
});

for (const route of [donor, mirror]) {
  test(`both lesson drafts resume and clear together: ${route}`, async ({ page }) => {
    await open(page, route);
    await page.locator('[data-sw-gap="3"]').click();
    await page.locator('[data-sw-action="lesson-endings"]').click();
    await page.locator('[data-sw-action="start"]').click();
    await page.locator('[data-sw-ending="?"]').click();
    await page.locator('[data-sw-action="lesson-boundaries"]').click();
    await expect(page.locator('[data-sw-gap="3"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-sw-action="lesson-endings"]').click();
    await expect(page.locator('[data-sw-ending="?"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-sw-action="clear"]').click();
    await page.locator("#cancelClearPracticeBtn").click();
    await expect(page.locator('[data-sw-ending="?"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-sw-action="clear"]').click();
    await page.locator("#confirmClearPracticeBtn").click();
    await page.locator("#openSentenceWorkshopBtn").click();
    await expect(page.locator('[data-sw-action="start"]')).toBeVisible();
    await page.locator('[data-sw-action="lesson-endings"]').click();
    await expect(page.locator('[data-sw-action="start"]')).toBeVisible();
    await page.locator('[data-sw-action="start"]').click();
    await expect(page.locator('[data-sw-ending][aria-pressed="true"]')).toHaveCount(0);
    await page.locator('[data-sw-ending="!"]').click();
    await page.reload();
    await page.locator("#openSentenceWorkshopBtn").click();
    await page.locator('[data-sw-action="lesson-endings"]').click();
    await expect(page.locator('[data-sw-action="start"]')).toBeVisible();
  });
}

test("endings keyboard controls and text fallback fit a narrow screen", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEndings(page);
  const question = page.getByRole("button", { name: "question mark", exact: true });
  await question.focus();
  await question.press("Enter");
  await expect(question).toBeFocused();
  await expect(question).toHaveAttribute("aria-pressed", "true");
  await question.press("Space");
  await expect(question).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => {
    window.speechSynthesis = undefined;
  });
  await page.locator('[data-sw-action="read-task"]').click();
  await expect(page.locator("#sw-voice-note")).toContainText("Voice is unavailable");
  await question.press("Enter");
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("Edit complete");
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("endings-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("legacy read controls fail gracefully when speech is partial or throws", async ({ page }) => {
  const errors = [],
    dialogs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  await page.goto(donor);
  for (const kind of ["missing", "methods", "throws"]) {
    await page.evaluate((kind) => {
      window.speechSynthesis =
        kind === "missing"
          ? undefined
          : kind === "methods"
            ? {}
            : {
                speak() {
                  throw Error("Voice unavailable");
                },
              };
    }, kind);
    await page.locator("#readIntroBtn").click();
    await expect(page.locator("#mainMenu .speech-status")).toBeVisible();
    await page.locator('[data-open-skill="verbs"]').click();
    await page.locator('[data-choice-read="0"]').click();
    await expect(page.locator("#practiceScreen .speech-status")).toContainText(
      "Voice is unavailable"
    );
    await expect(page.locator(".feedback")).toHaveCount(0);
    await page.locator("#backMenuBtn").click();
  }
  await page.locator('[data-open-skill="writing"]').click();
  await page.locator("#topicBox").fill("A synthetic writing draft.");
  await page.locator('[data-field-read="topicBox"]').click();
  await expect(page.locator("#topicBox")).toHaveValue("A synthetic writing draft.");
  expect(errors).toEqual([]);
  expect(dialogs).toEqual([]);
});
