import {
  models,
  initialEdit,
  solution,
  editedText,
} from "./sentence-workshop-content.js?v=20260906-sw6";
import {
  createSession,
  start,
  hint,
  demonstrate,
  submit,
  forward,
  previous,
  retry,
  canEdit,
  finish,
  recordFor,
  summary,
} from "./sentence-workshop-engine.js?v=20260906-sw6";
import * as endings from "./sentence-workshop-endings.js?v=20260906-sw6";
import * as repairs from "./sentence-workshop-repairs.js?v=20260906-sw6";
import * as commas from "./sentence-workshop-commas.js?v=20260906-sw6";

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
  const visits = new Map();
  const isEndings = () => session.lessonId === "endings";
  const isRepairs = () => session.lessonId === "repairs";
  const isCommas = () => session.lessonId === "commas";
  const lessonName = () =>
    isCommas()
      ? "Commas in lists"
      : isRepairs()
        ? "Fragments & Run-ons"
        : isEndings()
          ? "Sentence endings"
          : "Sentence boundaries";
  const content = () =>
    isCommas()
      ? commas
      : isRepairs()
        ? repairs
        : isEndings()
          ? endings
          : { initialEdit, solution, editedText };

  function saveTask() {
    const record = recordFor(session);
    if (record) {
      record.draft = draft;
      record.feedback = feedback;
    }
  }

  function restoreTask() {
    const record = recordFor(session);
    draft = record ? (record.draft ?? content().initialEdit(session.item)) : null;
    feedback = record?.feedback || "";
  }

  function selectLesson(id) {
    if (id === session.lessonId) return;
    saveTask();
    visits.set(session.lessonId, { session, draft, feedback });
    const saved = visits.get(id) || { session: createSession(id), draft: null, feedback: "" };
    ({ session, draft, feedback } = saved);
    render();
  }

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
    if (isCommas())
      return `<section class="sw-card"><p class="sw-eyebrow">Commas in lists</p>
      <h2 id="sw-heading" tabindex="-1">Separate the items. Keep their words together.</h2>
      <p>Use commas to separate three or more items in a sentence list. One item can be a word or a group of words. A list can also name actions.</p>
      <div class="sw-model-grid sw-ending-models">${commas.models.map((model) => `<div><h3>${escape(model.title)}</h3><p class="sw-example">${escape(model.text)}</p><p>${escape(model.why)}</p></div>`).join("")}</div>
      <p>The examples use the final <strong>Oxford comma</strong>. In these clear lists, your edit may include it or leave it out. Follow your teacher's requested style in other writing.</p>
      <p>Some drafts need commas added, some need extras removed, and some already work. Read the whole message before editing.</p>
      <div class="sw-actions">${button("read-models", "Read examples")}${button("start", "Try the lesson →", 'data-primary="true"')}</div>
      <p class="sw-muted">A regular visit has three guided tasks, fresh checks, and three practical message edits. You can ask for help or finish at any time.</p></section>`;
    if (isRepairs())
      return `<section class="sw-card"><p class="sw-eyebrow">Fragments &amp; Run-ons</p>
      <h2 id="sw-heading" tabindex="-1">Build a complete thought. Give it a clear join.</h2>
      <p>A fragment is an incomplete sentence. It may need who or what, a complete verb, or a main thought to finish a beginning such as <strong>because</strong>.</p>
      <p>A run-on joins complete thoughts incorrectly. A comma splice joins them with only a comma. Sentence length does not decide whether a repair is needed.</p>
      <div class="sw-model-grid sw-ending-models">${repairs.models.map((model) => `<div><h3>${escape(model.title)}</h3><p class="sw-muted">Draft</p><p>${escape(model.before)}</p><p class="sw-muted">One way to write it</p><p class="sw-example">${escape(model.after)}</p><p>${escape(model.why)}</p></div>`).join("")}</div>
      <p>In this lesson, write complete sentences for classroom and everyday messages. Some drafts already work. Try an edit, read what changed, and then check it.</p>
      <div class="sw-actions">${button("read-models", "Read examples")}${button("start", "Try the lesson →", 'data-primary="true"')}</div>
      <p class="sw-muted">You can ask for help or finish at any time. A regular visit has five guided tasks, fresh checks, and three message edits.</p></section>`;
    if (isEndings())
      return `<section class="sw-card"><p class="sw-eyebrow">Sentence endings</p>
      <h2 id="sw-heading" tabindex="-1">Make the ending match the message.</h2>
      <p>A period ends a calm statement or direction. A question mark ends a direct question. An exclamation mark can add strong feeling or urgency.</p>
      <div class="sw-model-grid sw-ending-models">${endings.models.map((model) => `<div><p class="sw-example">${escape(model.text)}</p><p>${escape(model.why)}</p></div>`).join("")}</div>
      <p>Read the whole message and its purpose. A word like <strong>what</strong> or <strong>when</strong> does not decide the ending by itself. A statement can sound calm or excited; follow the tone requested in each task.</p>
      <div class="sw-actions">${button("read-models", "Read examples")}${button("start", "Try the lesson →", 'data-primary="true"')}</div>
      <p class="sw-muted">Choose one ending for each supplied message. You can ask for help or finish at any time.</p></section>`;
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
    if (isCommas()) return commasTask();
    if (isRepairs()) return repairsTask();
    if (isEndings()) return endingsTask();
    const item = session.item;
    const record = recordFor(session);
    const locked = !canEdit(session);
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
      ${taskControls(record)}
      ${session.phase === "check" ? '<p class="sw-muted">This is a new example. Help is always available; your summary will distinguish work with help.</p>' : ""}
      </section>`;
  }

  function endingsTask() {
    const item = session.item;
    const lastSpace = item.text.lastIndexOf(" ");
    const record = recordFor(session);
    const locked = !canEdit(session);
    const hintText =
      record.help === 1
        ? "Read the purpose and the whole message. Is the writer asking directly, giving a calm statement or direction, or adding strong feeling?"
        : record.help >= 2
          ? `${item.clue} ${item.accepted.map((mark) => endings.markNames[mark]).join(" or ")} fits this task.`
          : "";
    return `<section class="sw-card" data-sw-item="${item.id}"><p class="sw-eyebrow">${phaseNames[session.phase]} · Sentence endings</p>
      <h2 id="sw-heading" tabindex="-1">Make the ending match the message.</h2>
      <p class="sw-context">${escape(item.context)}</p>
      <p id="sw-directions">Read the purpose and the message. Choose one ending. Choose the same ending again to remove it, or choose another to change it.</p>
      <div class="sw-actions">${button("read-task", "Read directions")}${button("read-edit", "Read my sentence")}${button("read-marks", "Read the ending")}</div>
      <div class="sw-ending-editor" role="group" aria-label="Sentence ending editor" aria-describedby="sw-directions">
        <p class="sw-ending-message">${escape(item.text.slice(0, lastSpace + 1))}<span class="sw-ending-tail">${escape(item.text.slice(lastSpace + 1))}<span class="sw-ending-mark" aria-label="${draft.ending ? endings.markNames[draft.ending] : "No ending selected"}">${escape(draft.ending || "")}</span></span></p>
        <div class="sw-actions" role="group" aria-label="Choose an ending">${Object.entries(
          endings.markNames
        )
          .map(
            ([mark, name]) =>
              `<button type="button" class="sw-button sw-ending-choice ${record.help >= 2 && item.accepted.includes(mark) ? "sw-cue" : ""}" data-sw-ending="${mark}" aria-label="${name}" aria-pressed="${draft.ending === mark}" ${locked ? "disabled" : ""}><span aria-hidden="true">${mark}</span> ${name[0].toUpperCase() + name.slice(1)}</button>`
          )
          .join("")}</div>
      </div>
      ${hintText ? `<aside class="sw-hint"><strong>Here is a clue</strong><p>${escape(hintText)}</p>${button("read-hint", "Read clue")}</aside>` : ""}
      <div id="sw-feedback" class="sw-feedback ${record.resolved && !record.demonstrated ? "sw-success" : ""}" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">${escape(feedback)}</div>
      ${feedback ? button("read-feedback", "Read feedback") : ""}
      ${record.demonstrated ? `<aside class="sw-hint"><strong>Worked example</strong><p class="sw-example">${escape(endings.editedText(item, endings.solution(item)))}</p><p>${escape(item.clue)}</p>${button("read-solution", "Read worked example")}</aside>` : ""}
      ${taskControls(record)}
      </section>`;
  }

  function repairsTask() {
    const item = session.item;
    const record = recordFor(session);
    const locked = !canEdit(session);
    const hintText =
      record.help === 1
        ? item.mode === "join"
          ? "Find the two thoughts that could each stand alone. Where does the second one begin? Decide whether to separate them or join them."
          : "Read the whole draft. Does it tell who or what and give a complete verb? Does a word like because leave you waiting for more? A direction can have an understood you."
        : record.help >= 2
          ? item.clue
          : "";
    const directions =
      item.mode === "join"
        ? "Read the draft. Choose the blank space between the two complete thoughts, then choose how to separate or join them. The period tool also capitalizes the next word. Read your new message before checking."
        : "Read the draft and its purpose. Try one of the edits below, or keep the draft as written. Read your new message before checking. You can change your selection.";
    const editor =
      item.mode === "join"
        ? `<h3>1. Choose where the thoughts meet</h3><div class="sw-editor sw-repair-editor" role="group" aria-label="Choose where to separate the thoughts">${item.words.map((word, i) => `<span class="sw-piece"><span class="sw-repair-word">${escape(word)}</span>${i + 1 < item.words.length ? `<button type="button" class="sw-gap ${record.help >= 2 && i + 1 === item.boundary ? "sw-cue" : ""}" data-sw-repair-gap="${i + 1}" aria-label="Join after ${escape(word.replace(/,$/, ""))}, word ${i + 1}" aria-pressed="${draft.gap === i + 1}" ${locked ? "disabled" : ""}>${draft.gap === i + 1 ? '<span aria-hidden="true">│</span>' : ""}</button>` : '<span class="sw-final-period">.</span>'}</span>`).join("")}</div>
      <h3>2. Choose a join</h3><div class="sw-actions" role="group" aria-label="Choose a join">${Object.entries(
        repairs.joinNames(item)
      )
        .map(
          ([id, label]) =>
            `<button type="button" class="sw-button sw-repair-choice" data-sw-join="${id}" aria-pressed="${draft.join === id}" ${locked ? "disabled" : ""}>${escape(label)}</button>`
        )
        .join(
          ""
        )}${button("repair-keep", "Keep the draft as written", `aria-pressed="${draft.choice === "keep"}" ${locked ? "disabled" : ""}`)}</div>`
        : `<div class="sw-repair-options" role="group" aria-label="Try an edit" aria-describedby="sw-directions">${item.choices.map((choice) => `<div class="sw-repair-option"><button type="button" class="sw-button sw-repair-choice ${record.help >= 2 && choice.correct ? "sw-cue" : ""}" data-sw-repair-choice="${choice.id}" aria-pressed="${draft.choice === choice.id}" ${locked ? "disabled" : ""}>${escape(choice.label)}</button><button type="button" class="sw-button" data-sw-read-choice="${choice.id}" aria-label="Read edit: ${escape(choice.label)}">Read</button></div>`).join("")}</div>`;
    return `<section class="sw-card" data-sw-item="${item.id}"><p class="sw-eyebrow">${phaseNames[session.phase]} · Fragments &amp; Run-ons</p>
      <h2 id="sw-heading" tabindex="-1">Make the message complete and clear.</h2>
      <p class="sw-context">${escape(item.context)}</p><p id="sw-directions">${directions}</p>
      <div class="sw-actions">${button("read-task", "Read directions & draft")}${button("read-edit", "Read my edit")}${item.mode === "join" ? button("read-marks", "Read the join") : ""}</div>
      <div class="sw-repair-draft"><span class="sw-muted">Draft</span><p>${escape(item.text)}</p></div>
      ${editor}
      <div class="sw-preview"><span class="sw-muted">Your message${draft.choice === "keep" ? " · kept as written" : ""}</span><p>${escape(repairs.editedText(item, draft))}</p></div>
      ${hintText ? `<aside class="sw-hint"><strong>Here is a clue</strong><p>${escape(hintText)}</p>${button("read-hint", "Read clue")}</aside>` : ""}
      <div id="sw-feedback" class="sw-feedback ${record.resolved && !record.demonstrated ? "sw-success" : ""}" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">${escape(feedback)}</div>
      ${feedback ? button("read-feedback", "Read feedback") : ""}
      ${record.demonstrated ? `<aside class="sw-hint"><strong>Worked example</strong><p class="sw-example">${escape(repairs.editedText(item, repairs.solution(item)))}</p><p>${escape(item.clue)}</p>${button("read-solution", "Read worked example")}</aside>` : ""}
      ${taskControls(record)}
      ${session.phase === "check" ? '<p class="sw-muted">This is a new example. Help is always available; your summary distinguishes work with help.</p>' : ""}</section>`;
  }

  function commasTask() {
    const item = session.item;
    const record = recordFor(session);
    const locked = !canEdit(session);
    const hintText =
      record.help === 1
        ? "Name the separate things or actions. One item may have several words. Look for the word and or the word or before the last item. Count the items before deciding where commas belong."
        : record.help >= 2
          ? commas.clue(item)
          : "";
    const pieces = item.words
      .map((word, index) => {
        const gap = index + 1;
        const selected = draft.commas.includes(gap);
        const required = item.required.includes(gap);
        const optional = gap === item.optional;
        return `<span class="sw-piece"><span class="sw-repair-word">${escape(word)}</span>${gap < item.words.length ? `<button type="button" class="sw-gap ${record.help >= 2 && (required || optional) ? "sw-cue" : ""}" data-sw-comma="${gap}" aria-label="Comma after ${escape(word)}, word ${gap}" aria-pressed="${selected}" ${locked ? "disabled" : ""}>${selected ? "," : ""}</button>` : '<span class="sw-final-period" aria-label="period">.</span>'}</span>`;
      })
      .join("");
    return `<section class="sw-card" data-sw-item="${item.id}"><p class="sw-eyebrow">${phaseNames[session.phase]} · Commas in lists</p>
      <h2 id="sw-heading" tabindex="-1">Make the list easy to read.</h2><p class="sw-context">${escape(item.context)}</p>
      <p id="sw-directions">${escape(commas.directions)}</p>
      <div class="sw-actions">${button("read-task", "Read directions & draft")}${button("read-edit", "Read my message")}${button("read-marks", "Read comma positions")}</div>
      <div class="sw-repair-draft"><span class="sw-muted">Starting draft</span><p>${escape(commas.editedText(item, commas.initialEdit(item)))}</p></div>
      <div class="sw-editor" role="group" aria-label="List comma editor" aria-describedby="sw-directions">${pieces}</div>
      <div class="sw-preview"><span class="sw-muted">Your message</span><p>${escape(commas.editedText(item, draft))}</p></div>
      ${hintText ? `<aside class="sw-hint"><strong>Here is a clue</strong><p>${escape(hintText)}</p>${record.help >= 2 && item.optional !== null ? '<p class="sw-muted">The outlined spaces include both needed commas and the optional final comma.</p>' : ""}${button("read-hint", "Read clue")}</aside>` : ""}
      <div id="sw-feedback" class="sw-feedback ${record.resolved && !record.demonstrated ? "sw-success" : ""}" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">${escape(feedback)}</div>
      ${feedback ? button("read-feedback", "Read feedback") : ""}
      ${record.demonstrated ? `<aside class="sw-hint"><strong>Worked example</strong><p class="sw-example">${escape(commas.editedText(item, commas.solution(item)))}</p><p>${escape(commas.clue(item))}</p>${button("read-solution", "Read worked example")}</aside>` : ""}
      ${taskControls(record)}
      ${session.phase === "check" ? '<p class="sw-muted">This is a new example. Help is always available; your summary distinguishes work with help.</p>' : ""}</section>`;
  }

  function taskControls(record) {
    const atFront = session.position === session.history.length - 1;
    const label = !atFront
      ? "Next →"
      : session.endReason
        ? "See my summary →"
        : record.demonstrated && !["simpler", "apply"].includes(session.phase)
          ? session.cursors.simpler >= 2
            ? "See my summary →"
            : "Try a shorter task →"
          : record.resolved
            ? "Next →"
            : "Skip for now →";
    return `<div class="sw-actions sw-bottom">${button("check", "Check my edit", `data-primary="true" ${canEdit(session) ? "" : "disabled"}`)}
      ${button("hint", record.help ? "Show the clue" : "Give me a hint", record.resolved || record.help >= 2 ? "disabled" : "")}
      ${button("demonstrate", "Show a worked example", record.resolved || record.demonstrated ? "disabled" : "")}</div>
      ${!canEdit(session) && !record.resolved ? '<p class="sw-muted">You can try this edit again, use a worked example, or skip for now.</p>' : ""}
      <nav class="sw-task-nav" aria-label="Task navigation">
      <p class="sw-muted">Task ${session.position + 1} of ${session.history.length} opened this visit. Previous and Next keep your work.</p>
      <div class="sw-actions">${button("previous", "← Previous", session.position > 0 ? "" : "disabled")}
      ${button("retry", "Try this one again", record.attempts.length || record.demonstrated ? "" : "disabled")}
      ${button("next", label, 'data-primary="true"')}</div></nav>`;
  }

  function report() {
    const s = summary(session);
    const recommendation = isCommas()
      ? "Try editing a supply request or a list of jobs. Find the whole items, separate three or more with commas, and check whether a two-item list needs any commas."
      : isRepairs()
        ? "Review a message you will write today. Check that each sentence is complete. If two thoughts could stand alone, give them a proper join. Keep sentences that already work."
        : isEndings()
          ? "Look for a message you will write today. Decide whether you need to ask, calmly tell, or add emphasis. Choose an ending that fits."
          : s.freshAttempted === 0
            ? "Try a fresh example on another visit when you are ready."
            : s.freshBoundary < s.freshAttempted
              ? "Practice finding where one complete sentence ends and another begins."
              : s.freshCapitals < s.freshAttempted
                ? "Practice using a capital at the beginning of each sentence."
                : "Try using periods and sentence capitals in your next message.";
    return `<section class="sw-card"><p class="sw-eyebrow">Your visit · ${escape(lessonName())}</p><h2 id="sw-heading" tabindex="-1">Here is what you practiced.</h2>
      <p>${escape(session.reason)}</p><div class="sw-stats">
      <div><strong>${s.freshIndependent} / ${s.freshAttempted}</strong><span>fresh examples correct on the first try without hints</span></div>
      <div><strong>${s.supported}</strong><span>edits completed after feedback or instructional help</span></div>
      <div><strong>${s.demonstrations}</strong><span>worked examples shown</span></div></div>
      <p>You attempted ${s.attempted} tasks. Unattempted tasks are not mistakes. Viewing a worked example alone does not count as a completed edit.</p>
      ${
        s.freshAttempted
          ? isCommas()
            ? `<p>Fresh first-try work without hints covered ${s.freshKinds.length} of 3 list types:</p><ul>${Object.entries(
                commas.kindNames
              )
                .map(
                  ([kind, name]) =>
                    `<li>${escape(name)}: ${s.freshKinds.includes(kind) ? "correct without hints on a fresh first try" : "not yet shown without hints on a fresh first try"}.</li>`
                )
                .join("")}</ul>`
            : isRepairs()
              ? `<p>Fresh first-try work without hints covered ${s.freshKinds.length} of 5 sentence checks:</p><ul>${Object.entries(
                  repairs.kindNames
                )
                  .map(
                    ([kind, name]) =>
                      `<li>${escape(name)}: ${s.freshKinds.includes(kind) ? "correct without hints on a fresh first try" : "not yet shown without hints on a fresh first try"}.</li>`
                  )
                  .join("")}</ul>`
              : isEndings()
                ? `<p>Ending choices on fresh first tries without hints: ${s.freshEnding} / ${s.freshAttempted}. Practice covered ${s.freshKinds.length} of 3 message purposes independently: calm statements or directions, direct questions, and strong emphasis.</p>`
                : `<ul><li>Sentence boundaries on fresh first tries without hints: ${s.freshBoundary} / ${s.freshAttempted}.</li><li>Sentence capitals on fresh first tries without hints: ${s.freshCapitals} / ${s.freshAttempted}.</li></ul>`
          : "<p>No fresh checks were attempted, so there is no fresh-check accuracy to report.</p>"
      }
      <p>Message edits correct on the first try without hints: ${s.appliedIndependent} / ${s.appliedAttempted} attempted.</p>
      <aside class="sw-hint"><strong>A useful next step</strong><p>${recommendation}</p></aside>
      <p class="sw-muted">This describes this visit’s practice. It does not establish mastery. Read-aloud does not count as an instructional hint. Workshop results are separate from the 140 practice questions.</p>
      <div class="sw-actions">${button("read-report", "Read my summary")}${session.history.length ? button("previous", "Back to last task") : ""}${button("menu", "Back to Skill Builder", 'data-primary="true"')}</div>
      <p class="sw-muted">Returning here keeps this summary. End / clear practice starts a new visit and clears all Skill Builder answers and writing.</p></section>`;
  }

  function render(focus = "sw-heading") {
    root.innerHTML = `<header class="sw-header"><div><p class="sw-eyebrow">Language Arts Skill Builder · Interactive lesson</p>
      <h1>Sentence Workshop</h1><p>One complete message at a time.</p></div>
      <div class="sw-actions">${button("menu", "← Skill Builder")}${button("finish", "Finish for now", session.phase === "summary" ? "disabled" : "")}${button("stop", "Stop voice")}${button("clear", "End / clear practice")}</div></header>
      <nav class="sw-actions sw-lessons" aria-label="Workshop lessons">${button("lesson-boundaries", "Sentence boundaries", `aria-pressed="${session.lessonId === "boundaries"}"`)}${button("lesson-endings", "Sentence endings", `aria-pressed="${isEndings()}"`)}${button("lesson-repairs", "Fragments &amp; Run-ons", `aria-pressed="${isRepairs()}"`)}${button("lesson-commas", "Commas in lists", `aria-pressed="${isCommas()}"`)}</nav>
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
    if (
      ["lesson-boundaries", "lesson-endings", "lesson-repairs", "lesson-commas"].includes(action)
    ) {
      stopSpeech();
      selectLesson(action.slice("lesson-".length));
      return;
    }
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
    if (control.dataset.swReadChoice !== undefined && isRepairs()) {
      const choice = session.item?.choices?.find((c) => c.id === control.dataset.swReadChoice);
      if (choice) speak(choice.label);
      return;
    }
    if (action?.startsWith("read-")) {
      const item = session.item;
      if (isCommas()) {
        const texts = {
          "read-models": root.querySelector(".sw-card")?.textContent || "",
          "read-task": item
            ? `${item.context} ${commas.directions} Starting draft: ${commas.editedText(item, commas.initialEdit(item))}`
            : "",
          "read-edit": item ? commas.editedText(item, draft) : "",
          "read-marks": item ? commas.editedText(item, draft, true) : "",
          "read-solution": item
            ? `${commas.editedText(item, commas.solution(item), true)} ${commas.clue(item)}`
            : "",
          "read-hint": root.querySelector(".sw-hint")?.textContent || "",
          "read-feedback": feedback,
          "read-report": root.querySelector(".sw-card")?.textContent || "",
        };
        speak(texts[action]);
        return;
      }
      if (isRepairs()) {
        const texts = {
          "read-models": root.querySelector(".sw-card")?.textContent || "",
          "read-task": `${item?.context || ""} ${root.querySelector("#sw-directions")?.textContent || ""} Draft: ${item?.text || ""}`,
          "read-edit": item ? repairs.editedText(item, draft) : "",
          "read-marks": item ? repairs.editedText(item, draft, true) : "",
          "read-solution": item
            ? `${repairs.editedText(item, repairs.solution(item), true)} ${item.clue}`
            : "",
          "read-hint": root.querySelector(".sw-hint p")?.textContent || "",
          "read-feedback": feedback,
          "read-report": root.querySelector(".sw-card")?.textContent || "",
        };
        speak(texts[action]);
        return;
      }
      if (isEndings()) {
        const texts = {
          "read-models": root.querySelector(".sw-card")?.textContent || "",
          "read-task": `${item?.context || ""} ${root.querySelector("#sw-directions")?.textContent || ""} Message: ${item?.text || ""}`,
          "read-edit": item ? endings.editedText(item, draft) : "",
          "read-marks": item ? endings.editedText(item, draft, true) : "",
          "read-solution": item
            ? `${endings.editedText(item, endings.solution(item), true)} ${item.clue}`
            : "",
          "read-hint": root.querySelector(".sw-hint p")?.textContent || "",
          "read-feedback": feedback,
          "read-report": root.querySelector(".sw-card")?.textContent || "",
        };
        speak(texts[action]);
        return;
      }
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
    if (control.dataset.swComma !== undefined) {
      if (!isCommas() || !session.item || !canEdit(session)) return;
      const gap = Number(control.dataset.swComma);
      draft.commas = draft.commas.includes(gap)
        ? draft.commas.filter((value) => value !== gap)
        : [...draft.commas, gap];
      feedback = "";
      render(`[data-sw-comma="${gap}"]`);
      return;
    }
    if (
      control.dataset.swRepairChoice !== undefined ||
      control.dataset.swRepairGap !== undefined ||
      control.dataset.swJoin !== undefined ||
      action === "repair-keep"
    ) {
      if (!isRepairs() || !session.item || !canEdit(session)) return;
      let selector;
      if (control.dataset.swRepairChoice !== undefined) {
        const choice = control.dataset.swRepairChoice;
        draft = { choice: draft.choice === choice ? null : choice, gap: null, join: null };
        selector = `[data-sw-repair-choice="${choice}"]`;
      } else if (action === "repair-keep") {
        draft = { choice: "keep", gap: null, join: null };
        selector = '[data-sw-action="repair-keep"]';
      } else if (control.dataset.swRepairGap !== undefined) {
        const gap = Number(control.dataset.swRepairGap);
        draft.choice = null;
        draft.gap = draft.gap === gap ? null : gap;
        selector = `[data-sw-repair-gap="${gap}"]`;
      } else {
        const join = control.dataset.swJoin;
        draft.choice = null;
        draft.join = draft.join === join ? null : join;
        selector = `[data-sw-join="${join}"]`;
      }
      feedback = "";
      render(selector);
      return;
    }
    if (control.dataset.swEnding !== undefined) {
      if (!isEndings() || !session.item || !canEdit(session)) return;
      const mark = control.dataset.swEnding;
      draft.ending = draft.ending === mark ? null : mark;
      feedback = "";
      render(`[data-sw-ending="${mark}"]`);
      return;
    }
    if (control.dataset.swGap !== undefined || control.dataset.swWord !== undefined) {
      if (!session.item || !canEdit(session)) return;
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
      feedback = "";
      render(selector);
      return;
    }
    if (action === "start") {
      start(session);
      draft = content().initialEdit(session.item);
    }
    if (action === "finish") {
      saveTask();
      finish(session);
    }
    if (action === "retry") {
      retry(session);
      feedback = "Try this edit again. Your earlier work is kept in your visit summary.";
      render();
      root
        .querySelector(
          "[data-sw-comma], [data-sw-ending], [data-sw-repair-choice], [data-sw-repair-gap], [data-sw-word]"
        )
        ?.focus();
      return;
    }
    if (action === "previous") {
      saveTask();
      previous(session);
      restoreTask();
    }
    if (action === "hint") {
      hint(session);
      render('[data-sw-action="read-hint"]');
      return;
    }
    if (action === "demonstrate") {
      demonstrate(session);
      feedback =
        "Here are the steps. Choose Try this one again to edit this message, or move to another task.";
    }
    if (action === "check") {
      const result = submit(session, draft);
      if (!result) return;
      feedback = (result.correct ? "Edit complete. " : "Keep working. ") + result.message;
      render("sw-feedback");
      return;
    }
    if (action === "next") {
      saveTask();
      forward(session);
      restoreTask();
    }
    render();
  });

  return {
    open() {
      render();
    },
    reset() {
      session = createSession();
      visits.clear();
      draft = null;
      feedback = "";
      root.innerHTML = "";
    },
  };
}
