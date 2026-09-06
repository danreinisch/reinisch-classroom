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

async function openRepairs(page, route = donor) {
  await page.goto(route);
  await page.locator("#openSentenceWorkshopBtn").click();
  await page.locator('[data-sw-action="lesson-repairs"]').click();
  await page.locator('[data-sw-action="start"]').click();
}

async function repair(scope, choice, join = "period") {
  if (typeof choice === "number") {
    await scope.locator(`[data-sw-repair-gap="${choice}"]`).click();
    await scope.locator(`[data-sw-join="${join}"]`).click();
  } else await scope.locator(`[data-sw-repair-choice="${choice}"]`).click();
  await scope.locator('[data-sw-action="check"]').click();
  await expect(scope.locator("#sw-feedback")).toContainText("Edit complete");
}

test("fragments route edits words and joins, reads without answering, and reports five fresh kinds", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openRepairs(page);
  for (const reader of await page.locator("[data-sw-read-choice]").all()) {
    const name = await reader.getAttribute("aria-label");
    await reader.click();
    expect((await page.evaluate(() => window.swSpoken)).at(-1)).toBe(
      name.replace("Read edit: ", "")
    );
  }
  await expect(page.locator("#sw-feedback")).toBeEmpty();
  await expect(page.locator('[data-sw-repair-choice][aria-pressed="true"]')).toHaveCount(0);
  const key = [
    "who",
    "verb",
    "main",
    4,
    "keep",
    "who",
    "verb",
    "main",
    4,
    "keep",
    "main",
    5,
    "keep",
  ];
  for (const [index, answer] of key.entries()) {
    await repair(page, answer, index === 3 ? "semicolon" : index === 8 ? "linked" : "period");
    await page.locator('[data-sw-action="read-edit"]').click();
    expect((await page.evaluate(() => window.swSpoken)).at(-1)).toBe(
      await page.locator(".sw-preview p").textContent()
    );
    if (index === 8) {
      await expect(page.locator(".sw-preview p")).toHaveText(
        "The door was heavy, but the handle moved easily."
      );
      await page.locator('[data-sw-action="read-marks"]').click();
      expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain("comma, but");
      await page
        .locator("#sentenceWorkshop")
        .screenshot({ path: testInfo.outputPath("repairs-runon.png") });
    }
    await page.locator('[data-sw-action="next"]').click();
  }
  await expect(page.locator(".sw-stats strong").first()).toHaveText("5 / 5");
  await expect(page.locator(".sw-card")).toContainText("covered 5 of 5 sentence checks");
  await expect(page.locator(".sw-card")).toContainText("You attempted 13 tasks");
  await expect(page.locator(".sw-card")).toContainText(
    "Message edits correct on the first try without hints: 3 / 3"
  );
  await page.locator('[data-sw-action="read-report"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain("5 of 5");
  await page.locator('[data-sw-action="lesson-endings"]').click();
  await expect(page.locator("#sw-heading")).toHaveText("Make the ending match the message.");
  await page.locator('[data-sw-action="lesson-repairs"]').click();
  await expect(page.locator(".sw-stats strong").first()).toHaveText("5 / 5");
  await page.locator('.sw-card [data-sw-action="menu"]').click();
  await expect(page.locator("#scoreNumMenu")).toHaveText("0");
  await expect(page.locator("#scoreTotalMenu")).toHaveText("140");
  await expect(page.locator("#skillMenuGrid > .skill-card")).toHaveCount(9);
  expect(errors).toEqual([]);
});

test("run-on repair requires a location and a valid join; a comma-only correction stays supported", async ({
  page,
}) => {
  await openRepairs(page);
  for (const answer of ["who", "verb", "main"]) {
    await repair(page, answer);
    await page.locator('[data-sw-action="next"]').click();
  }
  expect(await page.locator("[data-sw-repair-gap]").allTextContents()).toEqual(Array(8).fill(""));
  await page.locator('[data-sw-join="semicolon"]').click();
  await page.locator('[data-sw-repair-gap="2"]').click();
  await expect(page.locator(".sw-preview p")).toHaveText(
    "The library; is open we can return the books."
  );
  await page.locator('[data-sw-repair-gap="4"]').click();
  await page.locator('[data-sw-join="comma"]').click();
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("comma splice");
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("Change your edit");
  await page.locator('[data-sw-join="linked"]').click();
  await expect(page.locator("#sw-feedback")).toBeEmpty();
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("More than one repair works");
  await page.locator('[data-sw-action="finish"]').click();
  await expect(page.locator(".sw-stats strong").nth(1)).toHaveText("1");
});

test("fragment hints and a worked example lead to a matching shorter task", async ({
  page,
}, testInfo) => {
  await openRepairs(page);
  await repair(page, "who");
  await page.locator('[data-sw-action="next"]').click();
  for (const wrong of ["where", "when"]) {
    await page.locator(`[data-sw-repair-choice="${wrong}"]`).click();
    await page.locator('[data-sw-action="check"]').click();
  }
  await expect(page.locator('[data-sw-action="check"]')).toBeDisabled();
  await page.locator('[data-sw-action="hint"]').click();
  await page.locator('[data-sw-action="hint"]').click();
  await expect(page.locator(".sw-hint")).toContainText("are waiting");
  await page.locator('[data-sw-action="read-hint"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain("are waiting");
  await page.locator('[data-sw-action="demonstrate"]').click();
  await page.locator('[data-sw-action="read-solution"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain(
    "The students are waiting by the door."
  );
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("repairs-support.png") });
  await page.locator('[data-sw-action="next"]').click();
  await expect(page.locator("[data-sw-item]")).toHaveAttribute("data-sw-item", "repairs-simpler-2");
  await repair(page, "verb");
  await page.locator('[data-sw-action="finish"]').click();
  await expect(page.locator(".sw-stats strong").nth(1)).toHaveText("0");
  await expect(page.locator(".sw-stats strong").nth(2)).toHaveText("1");
});

for (const route of [donor, mirror]) {
  test(`all four lesson drafts resume and clear together: ${route}`, async ({ page }) => {
    await openRepairs(page, route);
    await page.locator('[data-sw-repair-choice="who"]').click();
    await page.locator('[data-sw-action="lesson-endings"]').click();
    await page.locator('[data-sw-action="start"]').click();
    await page.locator('[data-sw-ending="?"]').click();
    await page.locator('[data-sw-action="lesson-boundaries"]').click();
    await page.locator('[data-sw-action="start"]').click();
    await page.locator('[data-sw-gap="3"]').click();
    await page.locator('[data-sw-action="lesson-commas"]').click();
    await page.locator('[data-sw-action="start"]').click();
    await page.locator('[data-sw-comma="2"]').click();
    await page.locator('[data-sw-action="lesson-repairs"]').click();
    await expect(page.locator('[data-sw-repair-choice="who"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.locator('[data-sw-action="lesson-endings"]').click();
    await expect(page.locator('[data-sw-ending="?"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-sw-action="lesson-boundaries"]').click();
    await expect(page.locator('[data-sw-gap="3"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-sw-action="lesson-commas"]').click();
    await expect(page.locator('[data-sw-comma="2"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-sw-action="clear"]').click();
    await page.locator("#cancelClearPracticeBtn").click();
    await expect(page.locator('[data-sw-comma="2"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-sw-action="clear"]').click();
    await page.locator("#confirmClearPracticeBtn").click();
    await page.locator("#openSentenceWorkshopBtn").click();
    for (const lesson of ["boundaries", "endings", "repairs", "commas"]) {
      await page.locator(`[data-sw-action="lesson-${lesson}"]`).click();
      await expect(page.locator('[data-sw-action="start"]')).toBeVisible();
      await expect(page.locator("[data-sw-item]")).toHaveCount(0);
    }
    await page.locator('[data-sw-action="start"]').click();
    await page.locator('[data-sw-comma="2"]').click();
    await page.reload();
    await page.locator("#openSentenceWorkshopBtn").click();
    await page.locator('[data-sw-action="lesson-commas"]').click();
    await expect(page.locator('[data-sw-action="start"]')).toBeVisible();
    await page.locator('[data-sw-action="start"]').click();
    await page.locator('[data-sw-comma="2"]').click();
    await page.evaluate(() =>
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
    );
    await expect(page.locator("#sentenceWorkshop")).toBeEmpty();
    await expect(page.locator("#mainMenu")).toBeVisible();
  });
}

test("fragment and run-on editors support keyboard, touch sizing, and missing voice on mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRepairs(page);
  const choice = page.locator('[data-sw-repair-choice="who"]');
  await choice.focus();
  await choice.press("Enter");
  await expect(choice).toBeFocused();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  await choice.press("Space");
  await expect(choice).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => {
    window.speechSynthesis = undefined;
  });
  await page.locator('[data-sw-read-choice="who"]').click();
  await expect(page.locator("#sw-voice-note")).toContainText("Voice is unavailable");
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("repairs-fragment-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const answer of ["who", "verb", "main"]) {
    await repair(page, answer);
    await page.locator('[data-sw-action="next"]').click();
  }
  const gap = page.locator('[data-sw-repair-gap="4"]');
  const box = await gap.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(gap).toBeEmpty();
  await gap.focus();
  await gap.press("Enter");
  await expect(gap).toBeFocused();
  await page.locator('[data-sw-join="period"]').press("Space");
  await expect(page.locator(".sw-preview p")).toHaveText(
    "The library is open. We can return the books."
  );
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toBeFocused();
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("repairs-runon-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

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
  await builder.locator('[data-sw-action="lesson-commas"]').click();
  await builder.locator('[data-sw-action="start"]').click();
  await setCommas(builder, [2]);
  await builder.locator('[data-sw-action="read-marks"]').click();
  await builder.locator('[data-sw-action="check"]').click();
  await expect(builder.locator("#sw-feedback")).toContainText("Edit complete");
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

async function openCommas(page, route = donor) {
  await page.goto(route);
  await page.locator("#openSentenceWorkshopBtn").click();
  await page.locator('[data-sw-action="lesson-commas"]').click();
  await page.locator('[data-sw-action="start"]').click();
}

async function setCommas(scope, desired) {
  const gaps = await scope.locator("[data-sw-comma]").evaluateAll((buttons) =>
    buttons.map((button) => ({
      gap: Number(button.dataset.swComma),
      selected: button.getAttribute("aria-pressed") === "true",
    }))
  );
  for (const { gap, selected } of gaps) {
    if (selected !== desired.includes(gap)) await scope.locator(`[data-sw-comma="${gap}"]`).click();
  }
}

async function checkCommas(scope, desired) {
  await setCommas(scope, desired);
  await scope.locator('[data-sw-action="check"]').click();
  await expect(scope.locator("#sw-feedback")).toContainText("Edit complete");
}

test("comma route accepts both serial styles, removes extras, keeps a correct draft, and reports three fresh types", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCommas(page);
  expect(await page.locator("[data-sw-comma]").allTextContents()).toEqual(Array(4).fill(""));
  await page.locator('[data-sw-action="read-task"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain(
    await page.locator("#sw-directions").textContent()
  );
  await page.locator('[data-sw-action="read-edit"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toBe("Pack socks shirts and shoes.");
  await page.locator('[data-sw-action="read-marks"]').click();
  await expect(page.locator("#sw-feedback")).toBeEmpty();
  await expect(page.locator('[data-sw-comma][aria-pressed="true"]')).toHaveCount(0);
  const route = [
    ["practice-1", [2, 3]],
    ["practice-2", [3]],
    ["practice-3", []],
    ["check-1", [2]],
    ["check-2", [5, 8]],
    ["check-3", []],
    ["apply-1", [3, 4]],
    ["apply-2", [5]],
    ["apply-3", []],
  ];
  for (const [id, gaps] of route) {
    await expect(page.locator("[data-sw-item]")).toHaveAttribute("data-sw-item", `commas-${id}`);
    if (id === "check-3")
      await expect(page.locator(".sw-preview p")).toHaveText(
        "We need paper clips and sticky notes."
      );
    await checkCommas(page, gaps);
    await page.locator('[data-sw-action="read-edit"]').click();
    expect((await page.evaluate(() => window.swSpoken)).at(-1)).toBe(
      await page.locator(".sw-preview p").textContent()
    );
    if (id === "practice-1") {
      await page.locator('[data-sw-action="read-marks"]').click();
      const spoken = (await page.evaluate(() => window.swSpoken)).at(-1);
      expect(spoken.match(/comma/g)).toHaveLength(2);
      expect(spoken).toContain("period");
      await page.locator('[data-sw-action="stop"]').click();
      expect(await page.evaluate(() => window.swCancelled)).toBeGreaterThan(0);
    }
    if (id === "practice-2") {
      await expect(page.locator(".sw-preview p")).toHaveText(
        "Bring blue folders, spare pencils and blank paper."
      );
      await expect(page.locator("#sw-feedback")).toContainText("without the final Oxford comma");
      await page
        .locator("#sentenceWorkshop")
        .screenshot({ path: testInfo.outputPath("commas-grouped-desktop.png") });
    }
    await page.locator('[data-sw-action="next"]').click();
  }
  await expect(page.locator(".sw-stats strong").first()).toHaveText("3 / 3");
  await expect(page.locator(".sw-card")).toContainText("covered 3 of 3 list types");
  await expect(page.locator(".sw-card")).toContainText("You attempted 9 tasks");
  await expect(page.locator(".sw-card")).toContainText(
    "Message edits correct on the first try without hints: 3 / 3"
  );
  await page.locator('[data-sw-action="read-report"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain("3 of 3 list types");
  await page.locator('[data-sw-action="lesson-repairs"]').click();
  await page.locator('[data-sw-action="lesson-commas"]').click();
  await expect(page.locator(".sw-stats strong").first()).toHaveText("3 / 3");
  await page.locator('.sw-card [data-sw-action="menu"]').click();
  await expect(page.locator("#scoreNumMenu")).toHaveText("0");
  await expect(page.locator("#scoreTotalMenu")).toHaveText("140");
  await expect(page.locator("#skillMenuGrid > .skill-card")).toHaveCount(9);
  expect(errors).toEqual([]);
});

test("comma feedback identifies a split item and preserves correction history", async ({
  page,
}) => {
  await openCommas(page);
  await checkCommas(page, [2]);
  await page.locator('[data-sw-action="next"]').click();
  await setCommas(page, [2]);
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("“blue folders” is one item");
  await expect(page.locator("#sw-feedback")).toBeFocused();
  await page.locator('[data-sw-action="read-feedback"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain(
    "keep those words together"
  );
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("Change your edit");
  await setCommas(page, [3, 5]);
  await expect(page.locator("#sw-feedback")).toBeEmpty();
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toContainText("Edit complete");
  await page.locator('[data-sw-action="finish"]').click();
  await expect(page.locator(".sw-stats strong").nth(1)).toHaveText("1");
  await expect(page.locator(".sw-card")).toContainText("No fresh checks were attempted");
});

test("comma help distinguishes needed and optional marks and offers a matching shorter task", async ({
  page,
}, testInfo) => {
  await openCommas(page);
  await checkCommas(page, [2]);
  await page.locator('[data-sw-action="next"]').click();
  await page.locator('[data-sw-action="hint"]').click();
  await expect(page.locator(".sw-hint")).toContainText("One item may have several words");
  await page.locator('[data-sw-action="hint"]').click();
  await expect(page.locator(".sw-hint")).toContainText("Add a comma after “folders”");
  await expect(page.locator(".sw-hint")).toContainText("optional final comma");
  await expect(page.locator(".sw-cue")).toHaveCount(2);
  await page.locator('[data-sw-action="read-hint"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain("“spare pencils”");
  await page.locator('[data-sw-action="demonstrate"]').click();
  await page.locator('[data-sw-action="read-solution"]').click();
  expect((await page.evaluate(() => window.swSpoken)).at(-1)).toContain("comma");
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("commas-support.png") });
  await page.locator('[data-sw-action="next"]').click();
  await expect(page.locator("[data-sw-item]")).toHaveAttribute("data-sw-item", "commas-simpler-2");
  await checkCommas(page, [3]);
  await page.locator('[data-sw-action="finish"]').click();
  await expect(page.locator(".sw-stats strong").nth(1)).toHaveText("0");
  await expect(page.locator(".sw-stats strong").nth(2)).toHaveText("1");
});

test("blank comma controls support keyboard and touch; missing voice leaves the draft intact", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCommas(page);
  const gap = page.locator('[data-sw-comma="2"]');
  await expect(gap).toHaveAccessibleName("Comma after socks, word 2");
  await expect(gap).toBeEmpty();
  const box = await gap.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await gap.focus();
  await gap.press("Enter");
  await expect(gap).toBeFocused();
  await expect(gap).toHaveText(",");
  await gap.press("Space");
  await expect(gap).toBeFocused();
  await expect(gap).toBeEmpty();
  await gap.press("Enter");
  await page.evaluate(() => {
    window.speechSynthesis = undefined;
  });
  await page.locator('[data-sw-action="read-marks"]').click();
  await expect(page.locator("#sw-voice-note")).toContainText("Voice is unavailable");
  await expect(page.locator(".sw-preview p")).toHaveText("Pack socks, shirts and shoes.");
  await expect(page.locator("#sw-feedback")).toBeEmpty();
  await page.locator('[data-sw-action="check"]').click();
  await expect(page.locator("#sw-feedback")).toBeFocused();
  await expect(page.locator("#sw-feedback")).toContainText("Edit complete");
  await page
    .locator("#sentenceWorkshop")
    .screenshot({ path: testInfo.outputPath("commas-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
