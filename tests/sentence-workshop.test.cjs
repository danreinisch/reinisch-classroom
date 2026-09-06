const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const content = import("../site/assets/js/sentence-workshop-content.js?v=20260906-sw1");
const engine = import("../site/assets/js/sentence-workshop-engine.js?v=20260906-sw1");

test("reviewed content has distinct examples and the intended sentence boundaries", async () => {
  const { allItems, models, solution, editedText } = await content;
  assert.equal(allItems.length + models.length, 24);
  assert.equal(new Set(allItems.map((i) => i.id)).size, 22);
  assert.equal(new Set(allItems.map((i) => i.words.join(" "))).size, 22);
  // Independently reviewed boundary positions, not inferred from the checker.
  assert.deepEqual(
    allItems.map((i) => i.boundary),
    [3, 4, 3, 4, 3, 4, 3, 4, 5, 4, 4, 3, 4, 4, 3, 3, 3, 3, 4, 4, 5, 4]
  );
  assert.equal(
    editedText(allItems[0], solution(allItems[0])),
    "Pack your lunch. The bus arrives soon."
  );
  assert.equal(
    editedText(allItems[18], solution(allItems[18])),
    "Art club meets today. Bring your sketchbook."
  );
});

test("every possible period position and single extra capital is checked accurately", async () => {
  const { allItems, checkEdit, solution } = await content;
  for (const item of allItems) {
    const correct = solution(item);
    assert.equal(checkEdit(item, correct).correct, true);
    for (let period = 0; period <= item.words.length; period++) {
      assert.equal(
        checkEdit(item, { ...correct, period }).correct,
        period === item.boundary,
        `${item.id}: gap ${period}`
      );
    }
    for (let i = 0; i < item.words.length; i++) {
      const capitals = correct.capitals.includes(i)
        ? correct.capitals.filter((n) => n !== i)
        : [...correct.capitals, i];
      const result = checkEdit(item, { ...correct, capitals });
      assert.equal(result.correct, false, `${item.id}: capital ${i}`);
      assert.equal(result.boundary, true);
      assert.match(result.message, /period is in the right place/);
    }
    assert.equal(checkEdit(item, { ...correct, capitals: [0, 0, item.boundary] }).correct, false);
  }
});

test("a partial correction preserves first-attempt evidence and repeated checks cannot inflate it", async () => {
  const e = await engine;
  const c = await content;
  const s = e.createSession();
  e.start(s);
  assert.equal(e.submit(s, { period: s.item.boundary, capitals: [0] }).correct, false);
  assert.equal(e.submit(s, c.solution(s.item)).correct, true);
  const snapshot = JSON.stringify(s);
  assert.equal(e.submit(s, c.solution(s.item)), null);
  e.hint(s);
  e.demonstrate(s);
  assert.equal(JSON.stringify(s), snapshot);
  assert.equal(e.summary(s).supported, 1);
});

test("help before a correct first answer is supported; reading the draft leaves evidence unchanged", async () => {
  const e = await engine;
  const c = await content;
  const s = e.createSession();
  e.start(s);
  const before = JSON.stringify(s);
  c.editedText(s.item, c.initialEdit(s.item));
  c.editedText(s.item, c.initialEdit(s.item), true);
  assert.equal(JSON.stringify(s), before);
  e.hint(s);
  e.submit(s, c.solution(s.item));
  assert.equal(e.summary(s).supported, 1);
});

test("fresh checks follow practice; two independent checks lead to message edits", async () => {
  const e = await engine;
  const c = await content;
  const s = e.createSession();
  e.start(s);
  const phases = [],
    ids = [];
  while (s.phase !== "summary") {
    assert.ok(ids.length < 12);
    phases.push(s.phase);
    ids.push(s.item.id);
    e.submit(s, c.solution(s.item));
    e.next(s);
  }
  assert.deepEqual(phases, ["practice", "practice", "check", "check", "apply", "apply"]);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(e.summary(s), {
    attempted: 6,
    freshAttempted: 2,
    freshIndependent: 2,
    freshBoundary: 2,
    freshCapitals: 2,
    supported: 0,
    demonstrations: 0,
    appliedIndependent: 2,
    appliedAttempted: 2,
  });
});

test("a correction or answer-revealing hint on a fresh item never becomes independent success", async () => {
  const e = await engine;
  const c = await content;
  const s = e.createSession();
  e.start(s);
  for (let i = 0; i < 2; i++) {
    e.submit(s, c.solution(s.item));
    e.next(s);
  }
  e.submit(s, c.initialEdit(s.item));
  e.submit(s, c.solution(s.item));
  e.next(s);
  e.hint(s);
  e.hint(s);
  e.submit(s, c.solution(s.item));
  e.next(s);
  assert.equal(s.phase, "check");
  assert.equal(e.summary(s).freshIndependent, 0);
  assert.equal(e.summary(s).freshAttempted, 2);
});

test("two missed submissions require a different approach; repeated errors have a finite exit", async () => {
  const e = await engine;
  const c = await content;
  const s = e.createSession();
  e.start(s);
  const ids = [];
  while (s.phase !== "summary") {
    assert.ok(ids.length < 8);
    ids.push(s.item.id);
    e.submit(s, c.initialEdit(s.item));
    e.submit(s, { period: 1, capitals: [0] });
    assert.equal(e.submit(s, c.solution(s.item)), null);
    const id = s.item.id;
    e.next(s);
    assert.equal(s.item.id, id);
    e.demonstrate(s);
    e.next(s);
  }
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(e.summary(s).supported, 0);
  assert.equal(e.summary(s).demonstrations, 5);
  assert.equal(e.summary(s).freshIndependent, 0);
  assert.match(s.reason, /ask for help/);
});

test("all checks with help exhaust the bank without recycling exposed examples", async () => {
  const e = await engine;
  const c = await content;
  const s = e.createSession();
  e.start(s);
  const seen = [];
  while (s.phase !== "summary") {
    assert.ok(seen.length < 12);
    seen.push(s.item.id);
    if (s.phase === "check") e.hint(s);
    e.submit(s, c.solution(s.item));
    e.next(s);
  }
  assert.equal(new Set(seen).size, 8);
  assert.equal(e.summary(s).freshAttempted, 6);
  assert.equal(e.summary(s).freshIndependent, 0);
  assert.match(s.reason, /available examples/);
});

test("finish before a submission has no invented mistakes or fresh accuracy", async () => {
  const e = await engine;
  const s = e.createSession();
  e.start(s);
  e.finish(s);
  assert.equal(e.summary(s).attempted, 0);
  assert.equal(e.summary(s).freshAttempted, 0);
  e.next(s);
  e.hint(s);
  e.demonstrate(s);
  assert.equal(e.submit(s, {}), null);
  assert.equal(s.phase, "summary");
});

test("unchanged wrong edits cannot consume retries through double clicks", async () => {
  const e = await engine;
  const c = await content;
  const s = e.createSession();
  e.start(s);
  for (let i = 0; i < 10; i++) e.submit(s, c.initialEdit(s.item));
  assert.equal(e.recordFor(s).attempts.length, 1);
  assert.equal(e.submit(s, c.solution(s.item)).correct, true);
  assert.equal(e.summary(s).supported, 1);
});

test("both launch copies match and lesson assets use one version", () => {
  const root = path.resolve(__dirname, "..");
  const donor = fs.readFileSync(
    path.join(
      root,
      "site/student/resources/presentation-01/final_exam_skill_builder_20q_feedback.html"
    ),
    "utf8"
  );
  const mirror = fs.readFileSync(
    path.join(
      root,
      "site/presentations/language-arts-toolkit/presentation-01/final_exam_skill_builder_20q_feedback.html"
    ),
    "utf8"
  );
  assert.equal(donor, mirror);
  assert.match(donor, /sentence-workshop\.js\?v=20260906-sw1/);
  assert.match(donor, /sentence-workshop\.css\?v=20260906-sw1/);
  for (const filename of [
    "sentence-workshop.js",
    "sentence-workshop-engine.js",
    "sentence-workshop-content.js",
  ]) {
    const js = fs.readFileSync(path.join(root, "site/assets/js", filename), "utf8");
    assert.doesNotMatch(js, /localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon/);
  }
});
