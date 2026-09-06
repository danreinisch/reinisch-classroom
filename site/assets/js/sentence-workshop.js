import {
  models,
  initialEdit,
  solution,
  editedText,
} from "./sentence-workshop-content.js?v=20260906-sw2";
import {
  createSession,
  start,
  hint,
  demonstrate,
  submit,
  next,
  finish,
  recordFor,
  summary,
} from "./sentence-workshop-engine.js?v=20260906-sw2";

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
const phaseNames = {
  practice: "Guided practice",
  simpler: "A shorter example",
  check: "Try a fresh example",
  apply: "Use it in a message",
};
const taskDirections =
  "Read the message first. Choose the blank space after the first complete sentence to place a period. Choose a word to change its first letter between capital and lowercase. The final period is already there.";

export function mountSentenceWorkshop(root, { onMenu, onClear, stopSpeech }) {
  let session = createSession();
  let draft = null;
  let feedback = "";

  function button(action, label, extra = "") {
    return `<button type="button" class="sw-button" data-sw-action="${action}" ${extra}>${label}</button>`;
  }

  function speak(text) {
    stopSpeech();
    const note = root.querySelector("#sw-voice-note");
    const unavailable = () => {
      if (note?.isConnected)
        note.textContent =
          "Voice is unavailable. All directions and feedback are also shown as text.";
    };
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      unavailable();
      return;
    }
    try {
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.onerror = (event) => {
        if (!["canceled", "interrupted"].includes(event.error)) unavailable();
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      unavailable();
    }
  }

  function intro() {
    return `<section class="sw-card"><p class="sw-eyebrow">A small edit. A clearer message.</p>
      <h2 id="sw-heading" tabindex="-1">Give each sentence its own space.</h2>
      <p>Practice two things: put a period after a complete message, and use a capital letter to begin the next sentence.</p>
      <div class="sw-model-grid"><div><span class="sw-step">1</span><h3>Find the complete messages</h3>
      <p class="sw-example">Bring your notebook<span class="sw-mark">.</span> Class starts at nine.</p>
      <p>“Bring your notebook” is a complete direction. “Class starts at nine” is another complete message.</p></div>
      <div><span class="sw-step">2</span><h3>Start the next sentence with a capital</h3>
      <p class="sw-example">The gym is open. <span class="sw-mark">P</span>ractice starts soon.</p>
      <p>The period ends one sentence. A capital P begins the next one.</p></div></div>
      <div class="sw-actions">${button("read-models", "Read examples")}${button("start", "Try the lesson →", 'data-primary="true"')}</div>
      <p class="sw-muted">You can ask for help or finish whenever you need to. Read-aloud stays available throughout.</p></section>`;
  }

  function task() {
    const item = session.item;
    const record = recordFor(session);
    const locked = record.resolved || record.attempts.length >= 2;
    const focusBoundary = record.help >= 2;
    const pieces = item.words
      .map((word, index) => {
        const capital = draft.capitals.includes(index);
        const text = (capital ? word[0].toUpperCase() : word[0].toLowerCase()) + word.slice(1);
        const gap = index + 1;
        return `<span class="sw-piece"><button type="button" class="sw-word ${focusBoundary && (index === 0 || index === item.boundary) ? "sw-cue" : ""}"
        data-sw-word="${index}" aria-label="${escape(text)}, ${capital ? "capital" : "lowercase"} first letter. Change capitalization" aria-pressed="${capital}" ${locked ? "disabled" : ""}>${escape(text)}</button>${
          gap < item.words.length
            ? `<button type="button" class="sw-gap ${focusBoundary && gap === item.boundary ? "sw-cue" : ""}" data-sw-gap="${gap}" aria-label="Period after ${escape(word)}" aria-pressed="${draft.period === gap}" ${locked ? "disabled" : ""}>${draft.period === gap ? "." : ""}</button>`
            : '<span class="sw-final-period" aria-label="period">.</span>'
        }</span>`;
      })
      .join("");
    const hintText =
      record.help === 1
        ? "Read the first message. Where does it feel complete? Then find where the next message begins. Capitalize the first word of each sentence."
        : record.help >= 2
          ? `The first message ends after “${item.words[item.boundary - 1]}”. The next begins with “${item.words[item.boundary]}”. The outlined controls show the boundary and sentence beginnings.`
          : "";
    return `<section class="sw-card" data-sw-item="${item.id}"><p class="sw-eyebrow">${phaseNames[session.phase]}</p>
      <h2 id="sw-heading" tabindex="-1">Make two clear sentences.</h2>
      ${item.context ? `<p class="sw-context">${escape(item.context)}</p>` : ""}
      <p id="sw-directions">${taskDirections}</p>
      <div class="sw-actions">${button("read-task", "Read directions")}${button("read-edit", "Read my sentences")}${button("read-marks", "Read marks & capitals")}</div>
      <div class="sw-editor" role="group" aria-label="Sentence editor" aria-describedby="sw-directions">${pieces}</div>
      <div class="sw-preview"><span class="sw-muted">Your sentences</span><p>${escape(editedText(item, draft))}</p></div>
      ${hintText ? `<aside class="sw-hint"><strong>Here is a clue</strong><p>${escape(hintText)}</p>${button("read-hint", "Read clue")}</aside>` : ""}
      <div id="sw-feedback" class="sw-feedback ${record.resolved && !record.demonstrated ? "sw-success" : ""}" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">${escape(feedback)}</div>
      ${feedback ? button("read-feedback", "Read feedback") : ""}
      ${record.demonstrated ? `<aside class="sw-hint"><strong>Worked example</strong><p class="sw-example">${escape(editedText(item, solution(item)))}</p><p>Place the period after “${escape(item.words[item.boundary - 1])}”. Begin each sentence with a capital. This example is practice with support.</p>${button("read-solution", "Read worked example")}</aside>` : ""}
      <div class="sw-actions sw-bottom">${button("check", "Check my edit", `data-primary="true" ${locked ? "disabled" : ""}`)}
      ${button("hint", record.help ? "Show the clue" : "Give me a hint", record.resolved || record.help >= 2 ? "disabled" : "")}
      ${button("demonstrate", "Show a worked example", record.resolved ? "disabled" : "")}
      ${record.resolved ? button("next", record.demonstrated && session.phase !== "simpler" && session.phase !== "apply" ? (session.cursors.simpler >= 2 ? "See my summary →" : "Try a shorter task →") : "Continue →", 'data-primary="true"') : ""}</div>
      ${locked && !record.resolved ? '<p class="sw-muted">Let’s change the approach. Choose “Show a worked example” to see the steps, or finish for now.</p>' : ""}
      ${session.phase === "check" ? '<p class="sw-muted">This is a new example. Help is always available; your summary will distinguish work with help.</p>' : ""}
      </section>`;
  }

  function report() {
    const s = summary(session);
    const recommendation =
      s.freshAttempted === 0
        ? "Try a fresh example on another visit when you are ready."
        : s.freshBoundary < s.freshAttempted
          ? "Practice finding where one complete sentence ends and another begins."
          : s.freshCapitals < s.freshAttempted
            ? "Practice using a capital at the beginning of each sentence."
            : "Try using periods and sentence capitals in your next message.";
    return `<section class="sw-card"><p class="sw-eyebrow">Your visit</p><h2 id="sw-heading" tabindex="-1">Here is what you practiced.</h2>
      <p>${escape(session.reason)}</p><div class="sw-stats">
      <div><strong>${s.freshIndependent} / ${s.freshAttempted}</strong><span>fresh examples correct on the first try without hints</span></div>
      <div><strong>${s.supported}</strong><span>edits completed after feedback or instructional help</span></div>
      <div><strong>${s.demonstrations}</strong><span>worked examples shown</span></div></div>
      <p>You attempted ${s.attempted} tasks. Unattempted tasks are not mistakes. Worked examples are not counted as completed edits.</p>
      ${s.freshAttempted ? `<ul><li>Sentence boundaries on fresh first tries without hints: ${s.freshBoundary} / ${s.freshAttempted}.</li><li>Sentence capitals on fresh first tries without hints: ${s.freshCapitals} / ${s.freshAttempted}.</li></ul>` : "<p>No fresh checks were attempted, so there is no fresh-check accuracy to report.</p>"}
      <p>Message edits correct on the first try without hints: ${s.appliedIndependent} / ${s.appliedAttempted} attempted.</p>
      <aside class="sw-hint"><strong>A useful next step</strong><p>${recommendation}</p></aside>
      <p class="sw-muted">This describes this visit’s practice. It does not establish mastery. Read-aloud does not count as an instructional hint. Workshop results are separate from the 140 practice questions.</p>
      <div class="sw-actions">${button("read-report", "Read my summary")}${button("menu", "Back to Skill Builder", 'data-primary="true"')}</div>
      <p class="sw-muted">Returning here keeps this summary. End / clear practice starts a new visit and clears all Skill Builder answers and writing.</p></section>`;
  }

  function render(focus = "sw-heading") {
    root.innerHTML = `<header class="sw-header"><div><p class="sw-eyebrow">Language Arts Skill Builder · Interactive lesson</p>
      <h1>Sentence Workshop</h1><p>One complete message at a time.</p></div>
      <div class="sw-actions">${button("menu", "← Skill Builder")}${button("finish", "Finish for now", session.phase === "summary" ? "disabled" : "")}${button("stop", "Stop voice")}${button("clear", "End / clear practice")}</div></header>
      <p class="sw-visit-note">Practice lasts for this open visit. Leaving or reloading clears your work.</p>
      ${session.phase === "intro" ? intro() : session.phase === "summary" ? report() : task()}
      <p id="sw-voice-note" class="sw-visit-note" role="status"></p>`;
    const target = root.querySelector(focus.startsWith("[") ? focus : `#${focus}`);
    target?.focus();
  }

  root.addEventListener("click", (event) => {
    const control = event.target.closest("button");
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.swAction;
    if (action === "menu") {
      stopSpeech();
      onMenu();
      return;
    }
    if (action === "clear") {
      onClear();
      return;
    }
    if (action === "stop") {
      stopSpeech();
      return;
    }
    if (action?.startsWith("read-")) {
      const item = session.item;
      const texts = {
        "read-models": `Find the complete messages. ${models[0]} Bring your notebook is a complete direction. Class starts at nine is another complete message. Begin each sentence with a capital. ${models[1]} A capital P begins Practice.`,
        "read-task": `Make two clear sentences. ${taskDirections}`,
        "read-edit": item ? editedText(item, draft) : "",
        "read-marks": item
          ? item.words
              .map(
                (word, i) =>
                  `${draft.capitals.includes(i) ? "Capital" : "Lowercase"} ${word[0]}. ${word}${i + 1 === draft.period || i === item.words.length - 1 ? ", period." : "."}`
              )
              .join(" ")
          : "",
        "read-hint": root.querySelector(".sw-hint p")?.textContent || "",
        "read-feedback": feedback,
        "read-solution": item
          ? `${editedText(item, solution(item), true)} Place the period after ${item.words[item.boundary - 1]}. Begin each sentence with a capital.`
          : "",
        "read-report": root.querySelector(".sw-card")?.textContent || "",
      };
      speak(texts[action]);
      return;
    }
    stopSpeech();
    if (control.dataset.swGap !== undefined || control.dataset.swWord !== undefined) {
      if (!session.item || recordFor(session).resolved || recordFor(session).attempts.length >= 2)
        return;
      let selector;
      if (control.dataset.swGap !== undefined) {
        const gap = Number(control.dataset.swGap);
        draft.period = draft.period === gap ? null : gap;
        selector = `[data-sw-gap="${gap}"]`;
      } else {
        const index = Number(control.dataset.swWord);
        draft.capitals = draft.capitals.includes(index)
          ? draft.capitals.filter((i) => i !== index)
          : [...draft.capitals, index];
        selector = `[data-sw-word="${index}"]`;
      }
      render(selector);
      return;
    }
    if (action === "start") {
      start(session);
      draft = initialEdit(session.item);
    }
    if (action === "finish") finish(session);
    if (action === "hint") {
      hint(session);
      render('[data-sw-action="read-hint"]');
      return;
    }
    if (action === "demonstrate") {
      demonstrate(session);
      feedback = "Here are the steps. Then you can practice on a different example.";
    }
    if (action === "check") {
      const result = submit(session, draft);
      if (!result) return;
      feedback = (result.correct ? "Edit complete. " : "Keep working. ") + result.message;
      render("sw-feedback");
      return;
    }
    if (action === "next") {
      next(session);
      draft = session.item ? initialEdit(session.item) : null;
      feedback = "";
    }
    render();
  });

  return {
    open() {
      render();
    },
    reset() {
      session = createSession();
      draft = null;
      feedback = "";
      root.innerHTML = "";
    },
  };
}
