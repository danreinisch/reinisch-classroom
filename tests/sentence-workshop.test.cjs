const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const content = import("../site/assets/js/sentence-workshop-content.js?v=20260906-sw7");
const engine = import("../site/assets/js/sentence-workshop-engine.js?v=20260906-sw7");
const repairs = import("../site/assets/js/sentence-workshop-repairs.js?v=20260906-sw7");
const openings = import("../site/assets/js/sentence-workshop-openings.js?v=20260906-sw7");
const commas = import("../site/assets/js/sentence-workshop-commas.js?v=20260906-sw7");

test("opening commas match an independent editorial key for every selectable combination", async () => {
  const c = await openings;
  // Literal gap counts, not derived from the content's boundary/required fields.
  const key = [
    [[1], null],
    [[4], null],
    [[], null],
    [[], 2],
    [[1], null],
    [[5], null],
    [[], null],
    [[], 2],
    [[1], null],
    [[5], null],
    [[], null],
    [[], 2],
    [[1], null],
    [[5], null],
    [[], null],
    [[], 3],
    [[1], null],
    [[5], null],
    [[], null],
    [[], 2],
    [[1], null],
    [[4], null],
    [[], null],
    [[], 2],
    [[1], null],
    [[4], null],
    [[], null],
    [[], 2],
    [[1], null],
    [[4], null],
    [[], null],
    [[], 3],
  ];
  assert.equal(c.models.length, 4);
  assert.equal(c.allItems.length, 32);
  assert.equal(new Set(c.allItems.map((i) => i.id)).size, 32);
  assert.equal(new Set(c.allItems.map((i) => i.words.join(" "))).size, 32);
  assert.deepEqual(
    Object.values(c.bank).map((items) => items.length),
    [8, 12, 8, 4]
  );
  for (const [index, item] of c.allItems.entries()) {
    const [required, optional] = key[index];
    assert.deepEqual(item.required, required, item.id);
    assert.equal(item.optional, optional, item.id);
    for (let mask = 0; mask < 2 ** (item.words.length - 1); mask++) {
      const selected = Array.from({ length: item.words.length - 1 }, (_, i) => i + 1).filter(
        (gap) => mask & (2 ** (gap - 1))
      );
      const correct =
        required.every((gap) => selected.includes(gap)) &&
        selected.every((gap) => required.includes(gap) || gap === optional);
      assert.equal(
        c.checkEdit(item, { commas: selected }).correct,
        correct,
        `${item.id}: ${selected}`
      );
    }
    for (const invalid of [
      undefined,
      {},
      { commas: null },
      { commas: [0] },
      { commas: [1, 1] },
      { commas: ["1"] },
      { commas: [1.5] },
      { commas: [item.words.length] },
    ])
      assert.equal(c.checkEdit(item, invalid).correct, false, item.id);
    const draft = c.initialEdit(item);
    draft.commas.push(999);
    assert.equal(item.initial.includes(999), false);
    assert.ok(c.hint(item) && c.clue(item) && item.context);
  }
  assert.equal(
    c.editedText(c.bank.practice[1], { commas: [4] }),
    "When the bell rings, put away your materials."
  );
  assert.equal(
    c.editedText(c.bank.practice[2], { commas: [] }),
    "Put away your materials when the bell rings."
  );
  assert.equal(
    c.editedText(c.bank.practice[3], { commas: [2] }),
    "After lunch, we will return the books."
  );
  assert.match(
    c.checkEdit(c.bank.practice[1], { commas: [1] }).message,
    /splits “When the bell rings”/
  );
  assert.match(
    c.checkEdit(c.bank.practice[0], { commas: [1, 2] }).message,
    /splits the main message/
  );
  assert.match(
    c.checkEdit(c.bank.practice[2], { commas: [4] }).message,
    /final clause attached without a comma here/
  );
  for (const selected of [[], [2]])
    assert.match(
      c.checkEdit(c.bank.practice[3], { commas: selected }).message,
      /Both versions are correct/
    );
});

test("opening route covers four kinds and accepts either short-opening style on fresh first tries", async () => {
  const c = await openings,
    e = await engine,
    s = e.createSession("openings");
  e.start(s);
  const ids = [],
    phases = [];
  while (s.phase !== "summary") {
    assert.ok(ids.length < 13);
    ids.push(s.item.id);
    phases.push(s.phase);
    const edit = s.phase === "check" ? { commas: [...s.item.required] } : c.solution(s.item);
    assert.equal(e.submit(s, edit).correct, true);
    e.next(s);
  }
  assert.equal(new Set(ids).size, 12);
  assert.deepEqual(phases, [
    ...Array(4).fill("practice"),
    ...Array(4).fill("check"),
    ...Array(4).fill("apply"),
  ]);
  assert.equal(e.summary(s).freshIndependent, 4);
  assert.equal(e.summary(s).appliedIndependent, 4);
  assert.equal(e.summary(s).supported, 0);
  assert.deepEqual(e.summary(s).freshKinds, ["response", "clause", "final", "short"]);
});

test("opening fresh checks require every kind and finish honestly when one remains supported", async () => {
  const c = await openings,
    e = await engine;
  for (const missing of Object.keys(c.kindNames)) {
    const s = e.createSession("openings");
    e.start(s);
    for (let step = 0; s.phase !== "summary"; step++) {
      assert.ok(step < 21);
      assert.notEqual(s.phase, "apply");
      if (s.phase === "check" && s.item.kind === missing) e.hint(s);
      e.submit(s, c.solution(s.item));
      e.next(s);
    }
    const result = e.summary(s);
    assert.equal(result.freshAttempted, 12);
    assert.equal(result.freshIndependent, 9);
    assert.equal(result.freshKinds.includes(missing), false);
    assert.equal(result.appliedAttempted, 0);
    assert.equal(result.supported, 3);
  }
});

test("opening support uses a different matching task, caps detours, and preserves first checks", async () => {
  const c = await openings,
    e = await engine;
  for (const kind of Object.keys(c.kindNames)) {
    const s = e.createSession("openings");
    e.start(s);
    while (s.item.kind !== kind) {
      e.submit(s, c.solution(s.item));
      e.next(s);
    }
    const first = s.item.id;
    e.demonstrate(s);
    e.next(s);
    assert.equal(s.phase, "simpler");
    assert.equal(s.item.kind, kind);
    assert.notEqual(s.item.id, first);
  }
  const s = e.createSession("openings");
  e.start(s);
  for (let i = 0; i < 4; i++) {
    e.submit(s, c.solution(s.item));
    e.next(s);
  }
  e.submit(s, { commas: [1, 2] });
  assert.match(e.submit(s, { commas: [2, 1] }).message, /Change your edit/);
  assert.equal(e.recordFor(s).attempts.length, 1);
  e.submit(s, { commas: [] });
  const original = structuredClone(e.recordFor(s).attempts);
  e.retry(s);
  e.submit(s, { commas: [1] });
  assert.deepEqual(e.recordFor(s).attempts.slice(0, 2), original);
  assert.equal(e.summary(s).freshIndependent, 0);
  assert.equal(e.summary(s).supported, 1);
  const supported = e.createSession("openings");
  e.start(supported);
  for (let i = 0; supported.phase !== "summary"; i++) {
    assert.ok(i < 8);
    e.demonstrate(supported);
    e.next(supported);
  }
  assert.equal(supported.cursors.simpler, 2);
  assert.equal(e.summary(supported).attempted, 0);
});

test("list comma answer sets match the editorial key across every selectable combination", async () => {
  const c = await commas;
  // Independently counted positions: required commas and optional serial comma.
  const key = [
    [[2], 3],
    [[3], 5],
    [[], null],
    [[3, 4], 5],
    [[5], 8],
    [[2], 3],
    [[5], 8],
    [[], null],
    [[4, 5], 6],
    [[5], 8],
    [[], null],
    [[2], 3],
    [[4], 6],
    [[], null],
    [[2], 3],
    [[3], 5],
    [[], null],
    [[2], 3],
    [[4], 6],
    [[], null],
    [[3], 4],
    [[5], 8],
    [[], null],
  ];
  assert.equal(c.models.length, 3);
  assert.equal(c.allItems.length, 23);
  assert.equal(new Set(c.allItems.map((item) => item.id)).size, 23);
  assert.equal(new Set(c.allItems.map((item) => item.words.join(" "))).size, 23);
  for (const [i, item] of c.allItems.entries()) {
    const [needed, optional] = key[i];
    assert.deepEqual(item.required, needed, item.id);
    assert.equal(item.optional, optional, item.id);
    for (let mask = 0; mask < 2 ** (item.words.length - 1); mask++) {
      const selected = Array.from({ length: item.words.length - 1 }, (_, i) => i + 1).filter(
        (gap) => mask & (2 ** (gap - 1))
      );
      const accepted =
        needed.every((gap) => selected.includes(gap)) &&
        selected.every((gap) => needed.includes(gap) || gap === optional);
      assert.equal(
        c.checkEdit(item, { commas: selected }).correct,
        accepted,
        `${item.id}: ${selected}`
      );
    }
    for (const invalid of [
      undefined,
      {},
      { commas: null },
      { commas: [0] },
      { commas: [1, 1] },
      { commas: ["2"] },
      { commas: [1.5] },
      { commas: [item.words.length] },
    ]) {
      assert.equal(c.checkEdit(item, invalid).correct, false);
    }
    const draft = c.initialEdit(item);
    draft.commas.push(999);
    assert.equal(item.initial.includes(999), false);
    assert.ok(item.context && c.kindNames[item.kind]);
  }
  assert.equal(
    c.editedText(c.bank.practice[0], { commas: [2, 3] }),
    "Pack socks, shirts, and shoes."
  );
  assert.equal(c.editedText(c.bank.practice[0], { commas: [2] }), "Pack socks, shirts and shoes.");
  assert.equal(
    c.editedText(c.bank.practice[1], { commas: [3, 5] }),
    "Bring blue folders, spare pencils, and blank paper."
  );
  assert.equal(
    c.editedText(c.bank.practice[2], { commas: [] }),
    "Take your notebook and your charger."
  );
  assert.equal(
    c.editedText(c.bank.apply[1], { commas: [5, 8] }),
    "We will set the tables, fill the pitchers, and greet the guests."
  );
  assert.match(
    c.checkEdit(c.bank.practice[1], { commas: [2, 3] }).message,
    /blue folders.*one item/
  );
  assert.match(
    c.checkEdit(c.bank.practice[0], { commas: [2, 4] }).message,
    /before and, not after/
  );
  assert.match(
    c.checkEdit(c.bank.practice[0], { commas: [3] }).message,
    /between “socks” and “shirts”/
  );
  assert.match(c.checkEdit(c.bank.practice[2], { commas: [3] }).message, /two items/);
});

test("commas normal route requires all three fresh list types and uses practical messages", async () => {
  const e = await engine,
    c = await commas,
    s = e.createSession("commas");
  e.start(s);
  const ids = [],
    phases = [];
  while (s.phase !== "summary") {
    assert.ok(ids.length < 12);
    ids.push(s.item.id);
    phases.push(s.phase);
    // Alternate accepted serial-comma styles. Neither is marked as a correction.
    const edit = ids.length % 2 ? { commas: [...s.item.required] } : c.solution(s.item);
    assert.equal(e.submit(s, edit).correct, true);
    e.next(s);
  }
  assert.equal(new Set(ids).size, 9);
  assert.deepEqual(phases, [
    ...Array(3).fill("practice"),
    ...Array(3).fill("check"),
    ...Array(3).fill("apply"),
  ]);
  assert.deepEqual(e.summary(s), {
    attempted: 9,
    freshAttempted: 3,
    freshIndependent: 3,
    freshCommas: 3,
    freshKinds: ["single", "grouped", "pair"],
    supported: 0,
    demonstrations: 0,
    appliedIndependent: 3,
    appliedAttempted: 3,
  });
});

test("single-word successes cannot substitute for grouped or two-item list work", async () => {
  const e = await engine,
    c = await commas;
  for (const missing of Object.keys(c.kindNames)) {
    const s = e.createSession("commas");
    e.start(s);
    const seen = [];
    while (s.phase !== "summary") {
      assert.ok(seen.length < 13);
      assert.notEqual(s.phase, "apply");
      seen.push(s.item.id);
      if (s.phase === "check" && s.item.kind === missing) e.hint(s);
      e.submit(s, c.solution(s.item));
      e.next(s);
    }
    assert.equal(new Set(seen).size, 12);
    assert.equal(e.summary(s).freshAttempted, 9);
    assert.equal(e.summary(s).freshIndependent, 6);
    assert.equal(e.summary(s).freshKinds.includes(missing), false);
    assert.match(s.reason, /available examples/);
  }
});

test("comma editing preserves first attempts and treats reordered identical edits as repeats", async () => {
  const e = await engine,
    c = await commas,
    s = e.createSession("commas");
  e.start(s);
  const before = JSON.stringify(s);
  c.editedText(s.item, c.solution(s.item), true);
  assert.equal(JSON.stringify(s), before);
  e.submit(s, { commas: [1, 2] });
  assert.match(e.submit(s, { commas: [2, 1] }).message, /Change your edit/);
  assert.equal(e.recordFor(s).attempts.length, 1);
  e.submit(s, { commas: [2] });
  assert.equal(e.summary(s).supported, 1);
  assert.equal(e.recordFor(s).attempts[0].correct, false);
  e.next(s);
  e.hint(s);
  e.hint(s);
  e.submit(s, c.solution(s.item));
  assert.equal(e.summary(s).supported, 2);
  e.next(s);
  e.submit(s, { commas: [] });
  assert.equal(e.summary(s).supported, 2);
});

test("comma support matches the list type, uses new examples, and has a finite exit", async () => {
  const e = await engine,
    c = await commas;
  for (const kind of Object.keys(c.kindNames)) {
    const s = e.createSession("commas");
    e.start(s);
    while (s.item.kind !== kind) {
      e.submit(s, c.solution(s.item));
      e.next(s);
    }
    const id = s.item.id;
    e.demonstrate(s);
    e.next(s);
    assert.equal(s.phase, "simpler");
    assert.equal(s.item.kind, kind);
    assert.notEqual(s.item.id, id);
  }
  const s = e.createSession("commas");
  e.start(s);
  let count = 0;
  while (s.phase !== "summary") {
    assert.ok(++count <= 5);
    e.submit(s, { commas: [1] });
    e.submit(s, { commas: [1, 2] });
    assert.equal(e.submit(s, c.solution(s.item)), null);
    e.demonstrate(s);
    e.next(s);
  }
  assert.equal(e.summary(s).demonstrations, 5);
  assert.equal(e.summary(s).supported, 0);
  assert.match(s.reason, /ask for help/);
});

test("fragments and run-ons follow the independent editorial key, including valid alternatives", async () => {
  const c = await repairs;
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
    "who",
    "verb",
    "main",
    3,
    "keep",
    "who",
    "verb",
    "main",
    4,
    "keep",
    "main",
    5,
    "keep",
    "verb",
    4,
  ];
  assert.equal(c.models.length, 3);
  assert.equal(c.allItems.length, key.length);
  assert.equal(new Set(c.allItems.map((i) => i.id)).size, 35);
  assert.equal(new Set(c.allItems.map((i) => i.text)).size, 35);
  for (const [index, item] of c.allItems.entries()) {
    assert.ok(item.context && item.clue && c.kindNames[item.kind]);
    if (typeof key[index] === "number") {
      assert.equal(item.boundary, key[index]);
      for (let gap = 0; gap <= item.words.length; gap++) {
        for (const join of ["period", "semicolon", "linked", "comma", "unknown"]) {
          assert.equal(
            c.checkEdit(item, { gap, join }).correct,
            gap === key[index] && ["period", "semicolon", "linked"].includes(join),
            `${item.id}: ${gap}/${join}`
          );
        }
      }
      assert.equal(c.checkEdit(item, { choice: "keep" }).correct, false);
    } else {
      assert.equal(new Set(item.choices.map((choice) => choice.id)).size, item.choices.length);
      assert.equal(new Set(item.choices.map((choice) => choice.text)).size, item.choices.length);
      for (const choice of item.choices) {
        assert.equal(
          c.checkEdit(item, { choice: choice.id }).correct,
          choice.id === key[index],
          item.id
        );
        assert.ok(choice.feedback.length > 20);
      }
    }
    for (const invalid of [undefined, {}, { choice: "unknown", gap: "4", join: "." }]) {
      assert.equal(c.checkEdit(item, invalid).correct, false);
    }
  }
  const fused = c.bank.practice[3];
  assert.equal(
    c.editedText(fused, { gap: 4, join: "period" }),
    "The library is open. We can return the books."
  );
  assert.equal(
    c.editedText(fused, { gap: 4, join: "semicolon" }),
    "The library is open; we can return the books."
  );
  assert.equal(
    c.editedText(fused, { gap: 4, join: "linked" }),
    "The library is open, so we can return the books."
  );
  const splice = c.bank.check[3];
  assert.equal(
    c.editedText(splice, { gap: 4, join: "linked" }),
    "The door was heavy, but the handle moved easily."
  );
  assert.equal(
    c.editedText(splice, { gap: 4, join: "period" }),
    "The door was heavy. The handle moved easily."
  );
  assert.equal(
    c.editedText(c.bank.apply[0], { choice: "main" }),
    "Because the bus was delayed, I will arrive late."
  );
  assert.equal(
    c.editedText(c.bank.check[4], { choice: "keep" }),
    "Our class sorted the donations and packed them into labeled boxes after lunch."
  );
});

test("repairs require five fresh kinds, then three real-message edits", async () => {
  const c = await repairs,
    e = await engine,
    s = e.createSession("repairs");
  e.start(s);
  const ids = [],
    phases = [];
  while (s.phase !== "summary") {
    assert.ok(ids.length < 20);
    ids.push(s.item.id);
    phases.push(s.phase);
    assert.equal(e.submit(s, c.solution(s.item)).correct, true);
    e.next(s);
  }
  assert.equal(new Set(ids).size, 13);
  assert.deepEqual(phases, [
    ...Array(5).fill("practice"),
    ...Array(5).fill("check"),
    ...Array(3).fill("apply"),
  ]);
  assert.deepEqual(e.summary(s), {
    attempted: 13,
    freshAttempted: 5,
    freshIndependent: 5,
    freshRepairs: 5,
    freshKinds: ["subject", "verb", "dependent", "runon", "complete"],
    supported: 0,
    demonstrations: 0,
    appliedIndependent: 3,
    appliedAttempted: 3,
  });
});

test("success in four repair kinds cannot substitute for the fifth; helped checks end finitely", async () => {
  const c = await repairs,
    e = await engine;
  for (const missing of Object.keys(c.kindNames)) {
    const s = e.createSession("repairs");
    e.start(s);
    const seen = [];
    while (s.phase !== "summary") {
      assert.ok(seen.length < 16);
      assert.notEqual(s.phase, "apply");
      seen.push(s.item.id);
      if (s.phase === "check" && s.item.kind === missing) e.hint(s);
      e.submit(s, c.solution(s.item));
      e.next(s);
    }
    assert.equal(new Set(seen).size, 15);
    assert.equal(e.summary(s).freshAttempted, 10);
    assert.equal(e.summary(s).freshIndependent, 8);
    assert.equal(e.summary(s).freshKinds.includes(missing), false);
    assert.match(s.reason, /available examples/);
  }
});

test("repairs preserve wrong first tries, require changed edits, and do not score narration", async () => {
  const c = await repairs,
    e = await engine,
    s = e.createSession("repairs");
  e.start(s);
  const before = JSON.stringify(s);
  c.editedText(s.item, c.solution(s.item));
  assert.equal(JSON.stringify(s), before);
  e.submit(s, { choice: "when", gap: null, join: null });
  assert.match(e.submit(s, { choice: "when", gap: null, join: null }).message, /Change your edit/);
  assert.equal(e.recordFor(s).attempts.length, 1);
  e.submit(s, c.solution(s.item));
  assert.equal(e.summary(s).supported, 1);
  assert.equal(e.recordFor(s).attempts[0].correct, false);
  e.next(s);
  e.hint(s);
  e.hint(s);
  e.submit(s, c.solution(s.item));
  assert.equal(e.summary(s).supported, 2);
});

test("repair demonstrations offer different matching tasks and stop after two detours", async () => {
  const c = await repairs,
    e = await engine;
  for (const kind of Object.keys(c.kindNames)) {
    const s = e.createSession("repairs");
    e.start(s);
    while (s.item.kind !== kind) {
      e.submit(s, c.solution(s.item));
      e.next(s);
    }
    const original = s.item.id;
    e.demonstrate(s);
    e.next(s);
    assert.equal(s.phase, "simpler");
    assert.equal(s.item.kind, kind);
    assert.notEqual(s.item.id, original);
  }
  const s = e.createSession("repairs");
  e.start(s);
  let count = 0;
  while (s.phase !== "summary") {
    assert.ok(++count <= 5);
    e.submit(s, c.initialEdit());
    e.submit(s, { choice: "keep" });
    assert.equal(e.submit(s, c.solution(s.item)), null);
    e.demonstrate(s);
    e.next(s);
  }
  assert.equal(e.summary(s).demonstrations, 5);
  assert.equal(e.summary(s).supported, 0);
  assert.match(s.reason, /ask for help/);
});

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
  assert.match(donor, /sentence-workshop\.js\?v=20260906-sw7/);
  assert.match(donor, /sentence-workshop\.css\?v=20260906-sw7/);
  for (const filename of [
    "sentence-workshop.js",
    "sentence-workshop-engine.js",
    "sentence-workshop-content.js",
    "sentence-workshop-endings.js",
    "sentence-workshop-repairs.js",
    "sentence-workshop-commas.js",
    "sentence-workshop-openings.js",
  ]) {
    const js = fs.readFileSync(path.join(root, "site/assets/js", filename), "utf8");
    assert.doesNotMatch(js, /localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon/);
    for (const imported of js.matchAll(/from "\.\/sentence-workshop[^"?]*\.js\?v=([^"\s]+)"/g)) {
      assert.equal(imported[1], "20260906-sw7");
    }
  }
});

const endings = import("../site/assets/js/sentence-workshop-endings.js?v=20260906-sw7");

test("sentence endings follow the reviewed purpose key and accept both allowed tones", async () => {
  const c = await endings;
  const keys = [
    "?",
    ".",
    "!",
    "?",
    ".",
    "!",
    "?",
    ".",
    ".!",
    "?",
    ".",
    "!",
    "?",
    ".",
    "!",
    "?",
    ".",
    "!",
    "?",
    ".",
    "!",
    "?",
    ".",
    "!",
    "?",
    ".",
    "!",
    ".!",
    "?",
    ".",
  ];
  assert.equal(c.models.length, 3);
  assert.equal(c.allItems.length, keys.length);
  assert.equal(new Set(c.allItems.map((i) => i.id)).size, keys.length);
  assert.equal(new Set(c.allItems.map((i) => i.text)).size, keys.length);
  for (const [index, item] of c.allItems.entries()) {
    assert.equal(item.accepted.join(""), keys[index]);
    assert.ok(item.context && item.clue);
    for (const ending of [null, undefined, "", ".", "?", "!", "?!", "...", "!."]) {
      const r = c.checkEdit(item, { ending });
      assert.equal(
        r.correct,
        typeof ending === "string" && ending.length === 1 && keys[index].includes(ending),
        `${item.id}: ${ending}`
      );
      assert.equal(r.ending, r.correct);
      assert.ok(r.message.length > 30);
    }
    assert.equal(c.editedText(item, c.initialEdit(item)), item.text);
    assert.ok(c.editedText(item, c.solution(item), true).includes(c.markNames[keys[index][0]]));
  }
  assert.equal(c.checkEdit(c.bank.practice[4], { ending: "?" }).correct, false); // I wonder when...
  assert.equal(c.checkEdit(c.bank.practice[5], { ending: "!" }).correct, true); // What a...
  for (const mark of [".", "!"])
    assert.equal(c.checkEdit(c.bank.apply[3], { ending: mark }).correct, true);
});

test("endings progress through three purposes and four applied messages", async () => {
  const c = await endings,
    e = await engine,
    s = e.createSession("endings");
  const phases = [],
    ids = [];
  e.start(s);
  while (s.phase !== "summary") {
    assert.ok(ids.length < 15);
    phases.push(s.phase);
    ids.push(s.item.id);
    e.submit(s, c.solution(s.item));
    e.next(s);
  }
  assert.deepEqual(phases, [
    "practice",
    "practice",
    "practice",
    "check",
    "check",
    "check",
    "apply",
    "apply",
    "apply",
    "apply",
  ]);
  assert.equal(new Set(ids).size, 10);
  const result = e.summary(s);
  assert.equal(result.freshIndependent, 3);
  assert.deepEqual(new Set(result.freshKinds), new Set(["question", "statement", "strong"]));
  assert.equal(result.appliedIndependent, 4);
  assert.equal(result.supported, 0);
  assert.equal(result.freshBoundary, undefined);
});

test("success with two ending purposes cannot stand in for the third", async () => {
  const c = await endings,
    e = await engine,
    s = e.createSession("endings");
  e.start(s);
  while (s.phase !== "summary") {
    assert.notEqual(s.phase, "apply");
    if (s.phase === "check" && s.item.intent === "question") e.hint(s);
    e.submit(s, c.solution(s.item));
    e.next(s);
  }
  const result = e.summary(s);
  assert.equal(result.freshIndependent, 6);
  assert.equal(result.freshAttempted, 9);
  assert.deepEqual(new Set(result.freshKinds), new Set(["statement", "strong"]));
  assert.match(s.reason, /available examples/);
});

test("endings preserve first attempts, ignore repeated wrong checks, and cap recovery", async () => {
  const c = await endings,
    e = await engine,
    s = e.createSession("endings");
  e.start(s);
  for (let i = 0; i < 10; i++) e.submit(s, { ending: "." });
  assert.equal(e.recordFor(s).attempts.length, 1);
  e.submit(s, { ending: "?" });
  assert.equal(e.summary(s).supported, 1);
  assert.equal(e.submit(s, { ending: "?" }), null);
  const other = e.createSession("endings");
  e.start(other);
  const ids = [];
  while (other.phase !== "summary") {
    assert.ok(ids.length < 8);
    ids.push(other.item.id);
    e.submit(other, c.initialEdit());
    e.submit(other, { ending: other.item.accepted.includes("?") ? "." : "?" });
    assert.equal(e.submit(other, c.solution(other.item)), null);
    e.demonstrate(other);
    e.next(other);
  }
  assert.equal(new Set(ids).size, 5);
  assert.equal(e.summary(other).demonstrations, 5);
  assert.equal(e.summary(other).freshIndependent, 0);
  assert.match(other.reason, /ask for help/);
});

test("shorter endings task matches the purpose needing support; lessons stay separate", async () => {
  const c = await endings,
    e = await engine,
    s = e.createSession("endings");
  const old = e.createSession();
  e.start(old);
  const oldSnapshot = JSON.stringify(old);
  e.start(s);
  for (let i = 0; i < 2; i++) {
    e.submit(s, c.solution(s.item));
    e.next(s);
  }
  assert.equal(s.item.intent, "strong");
  e.demonstrate(s);
  e.next(s);
  assert.equal(s.phase, "simpler");
  assert.equal(s.item.id, "endings-simpler-3");
  assert.equal(s.item.intent, "strong");
  assert.equal(JSON.stringify(old), oldSnapshot);
  assert.equal(e.summary(old).attempted, 0);
  e.finish(s);
  assert.equal(e.submit(s, { ending: "!" }), null);
});

async function navigationCases() {
  const modules = {
    boundaries: await content,
    endings: await endings,
    repairs: await repairs,
    commas: await commas,
    openings: await openings,
  };
  return Object.entries(modules).map(([id, c]) => ({
    id,
    c,
    wrong:
      id === "boundaries"
        ? [
            { period: null, capitals: [0] },
            { period: 1, capitals: [0] },
          ]
        : id === "endings"
          ? [{ ending: "." }, { ending: "!" }]
          : id === "repairs"
            ? [c.initialEdit(c.bank.practice[0]), { choice: "when", gap: null, join: null }]
            : [{ commas: [] }, { commas: [id === "openings" ? 2 : 1] }],
  }));
}

test("all lessons reopen after two misses without erasing the original submissions", async () => {
  const e = await engine;
  for (const { id, c, wrong } of await navigationCases()) {
    const s = e.createSession(id);
    e.start(s);
    const record = e.recordFor(s);
    for (const edit of wrong) assert.equal(e.submit(s, edit).correct, false, id);
    const original = structuredClone(record.attempts);
    assert.equal(e.canEdit(s), false);
    assert.equal(e.submit(s, c.solution(s.item)), null);
    e.retry(s);
    assert.equal(e.canEdit(s), true);
    assert.equal(e.submit(s, c.solution(s.item)).correct, true);
    assert.deepEqual(record.attempts.slice(0, 2), original);
    assert.equal(e.summary(s).attempted, 1);
    assert.equal(e.summary(s).supported, 1);
    e.retry(s);
    e.submit(s, c.solution(s.item));
    assert.equal(e.summary(s).supported, 1, "repeating does not count a second completed item");
    assert.equal(e.summary(s).freshIndependent, 0);
  }
});

test("practice after a worked example remains supported and history preserves shorter routing", async () => {
  const e = await engine;
  for (const { id, c } of await navigationCases()) {
    const s = e.createSession(id);
    e.start(s);
    const first = s.item;
    e.demonstrate(s);
    assert.equal(e.summary(s).attempted, 0);
    e.retry(s);
    assert.equal(e.canEdit(s), true);
    e.submit(s, c.solution(s.item));
    assert.equal(e.recordFor(s).attempts[0].help, 3);
    assert.equal(e.summary(s).supported, 1);
    assert.equal(e.summary(s).demonstrations, 1);
    e.forward(s);
    assert.equal(s.phase, "simpler");
    const shorter = s.item;
    const counts = structuredClone(s.cursors);
    e.previous(s);
    assert.equal(s.item, first);
    e.forward(s);
    assert.equal(s.item, shorter);
    assert.equal(s.returnPhase, "practice");
    assert.deepEqual(s.cursors, counts);
    assert.equal(s.history.length, 2);
    e.forward(s); // Skipping a shorter task still returns to the correct phase.
    assert.equal(s.phase, "practice");
    assert.notEqual(s.item.id, first.id);
  }
});

test("skipping and traversing history never submit answers; exhausted visits can still be reviewed", async () => {
  const e = await engine;
  for (const { id, c } of await navigationCases()) {
    const s = e.createSession(id);
    e.start(s);
    const first = s.item;
    e.forward(s);
    const second = s.item;
    const record = e.recordFor(s);
    const counts = structuredClone(s.cursors);
    e.previous(s);
    assert.equal(s.item, first);
    e.forward(s);
    assert.equal(s.item, second);
    assert.equal(e.recordFor(s), record);
    assert.deepEqual(s.cursors, counts);
    assert.equal(e.summary(s).attempted, 0);
    e.finish(s);
    e.previous(s);
    assert.equal(s.item, second, "early finish returns to the exact task left");
    while (s.phase !== "summary") {
      assert.ok(s.history.length <= c.bank.practice.length);
      e.forward(s);
    }
    assert.equal(e.summary(s).attempted, 0);
    assert.equal(e.summary(s).freshAttempted, 0);
    const total = s.history.length;
    const reason = s.reason;
    for (let i = 0; i < 3; i++) {
      e.previous(s);
      assert.equal(s.position, total - 1);
      assert.ok(s.item);
      e.forward(s);
      assert.equal(s.phase, "summary");
      assert.equal(s.reason, reason);
      assert.equal(s.history.length, total);
    }
  }
});

test("revisiting a corrected fresh check cannot overwrite its first-try evidence", async () => {
  const e = await engine,
    c = await commas,
    s = e.createSession("commas");
  e.start(s);
  for (let i = 0; i < 3; i++) {
    e.submit(s, c.solution(s.item));
    e.forward(s);
  }
  const firstCheck = s.item;
  e.submit(s, { commas: [] });
  e.demonstrate(s);
  e.retry(s);
  e.submit(s, c.solution(s.item));
  const record = e.recordFor(s);
  const firstSubmission = structuredClone(record.attempts[0]);
  e.forward(s);
  const shorter = s.item;
  e.previous(s);
  assert.equal(s.item, firstCheck);
  e.retry(s);
  e.submit(s, c.solution(s.item));
  assert.deepEqual(record.attempts[0], firstSubmission);
  assert.equal(e.summary(s).freshAttempted, 1);
  assert.equal(e.summary(s).freshIndependent, 0);
  assert.deepEqual(e.summary(s).freshKinds, []);
  assert.equal(e.summary(s).supported, 1);
  e.forward(s);
  assert.equal(s.item, shorter);
});
