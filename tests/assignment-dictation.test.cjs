'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../site/web/assignment-dictation.js'), 'utf8');

function setup(t, options = {}) {
  const dom = new JSDOM('<!doctype html><html lang="en-US"><body><div id="panel"><textarea id="a" aria-label="First answer"></textarea><textarea id="b"></textarea><button id="submitWritingBtn" type="button">Submit Assignment</button><button id="next">Next day</button></div></body></html>', {
    url: 'https://classroom.example/student/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  Object.defineProperty(w, 'isSecureContext', { value: options.secure !== false });
  w.HTMLElement.prototype.getClientRects = function () {
    for (let el = this; el; el = el.parentElement) {
      if (el.hidden || el.style.display === 'none') return [];
    }
    return [{}];
  };
  if (options.policy === false) w.document.featurePolicy = { allowsFeature: () => false };
  const timers = new Map();
  let nextTimer = 0;
  w.setTimeout = fn => { timers.set(++nextTimer, fn); return nextTimer; };
  w.clearTimeout = id => timers.delete(id);
  const recognitions = [];
  class FakeRecognition {
    constructor() { recognitions.push(this); this.aborts = 0; this.stops = 0; }
    start() {
      if (options.startThrows) throw new Error('device unavailable');
      if (!options.delayStart) this.onstart?.();
    }
    stop() { this.stops++; }
    abort() { this.aborts++; this.onend?.(); }
  }
  if (!options.unsupported) w[options.prefixed ? 'webkitSpeechRecognition' : 'SpeechRecognition'] = FakeRecognition;
  let readStops = 0;
  w.speechSynthesis = { cancel() { readStops++; } };
  w.eval(source);
  const panel = w.document.querySelector('#panel');
  const controller = w.RCAssignmentDictation.create(panel, { canEdit: () => options.editable !== false });
  t.after(() => { controller.destroy(); w.close(); });
  const a = w.document.querySelector('#a');
  const b = w.document.querySelector('#b');
  const button = field => field.previousElementSibling.querySelector('button');
  const status = field => field.previousElementSibling.querySelector('[role="status"]').textContent;
  const emit = (recognition, parts, resultIndex = 0) => {
    const results = parts.map(([text, final = true]) => Object.assign([{ transcript: text }], { isFinal: final }));
    recognition.onresult({ resultIndex, results });
  };
  return {
    w, panel, a, b, controller, button, status, recognitions, emit,
    start(field = a) { button(field).click(); return recognitions.at(-1); },
    flushTimers() { for (const fn of [...timers.values()]) fn(); },
    get readStops() { return readStops; }
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('no microphone is created until an explicit click; prefixed API works', t => {
  const s = setup(t, { prefixed: true });
  assert.equal(s.recognitions.length, 0);
  const r = s.start();
  assert.equal(s.recognitions.length, 1);
  assert.equal(r.continuous, true);
  assert.equal(r.lang, 'en-US');
  assert.equal(s.readStops, 1);
  assert.equal(s.button(s.a).getAttribute('aria-pressed'), 'true');
});

for (const [label, config, message] of [
  ['unsupported', { unsupported: true }, /unavailable in this browser/],
  ['insecure', { secure: false }, /secure connection/],
  ['policy denied', { policy: false }, /blocked for this page/]
]) test(`${label}: explains fallback and leaves typing intact`, t => {
  const s = setup(t, config);
  s.start();
  assert.equal(s.recognitions.length, 0);
  assert.equal(s.button(s.a).disabled, true);
  assert.match(s.status(s.a), message);
  assert.equal(s.a.disabled, false);
});

test('interim words stay out of the answer; repeated final events insert once', t => {
  const s = setup(t);
  let inputs = 0;
  s.a.addEventListener('input', () => inputs++);
  const r = s.start();
  s.emit(r, [['first attempt', false]]);
  assert.equal(s.a.value, '');
  assert.equal(inputs, 0);
  s.emit(r, [['First sentence.'], ['second', false]]);
  s.emit(r, [['First sentence.'], ['Second sentence.']], 1);
  s.emit(r, [['First sentence.'], ['Second sentence.']]);
  assert.equal(s.a.value, 'First sentence. Second sentence.');
  assert.equal(inputs, 2);
});

test('inserts at the cursor without overwriting existing or selected writing', t => {
  const s = setup(t);
  s.a.value = 'My idea matters.';
  s.a.setSelectionRange(0, 7);
  const r = s.start();
  s.emit(r, [['really']]);
  assert.equal(s.a.value, 'My idea really matters.');
});

test('spoken punctuation and literal markup are text, never executable HTML', t => {
  const s = setup(t);
  s.a.value = 'Hello';
  s.a.setSelectionRange(5, 5);
  const r = s.start();
  s.emit(r, [[', world.']]);
  s.emit(r, [[', world.'], ['<img src=x onerror=alert(1)>']], 1);
  assert.equal(s.a.value, 'Hello, world. <img src=x onerror=alert(1)>');
  assert.equal(s.panel.querySelector('img'), null);
});

test('explicit Stop accepts final words then returns to an idle state', t => {
  const s = setup(t);
  const r = s.start();
  s.button(s.a).click();
  assert.equal(r.stops, 1);
  assert.equal(s.button(s.a).disabled, true);
  s.emit(r, [['Last words.']]);
  r.onend();
  assert.equal(s.a.value, 'Last words.');
  assert.equal(s.button(s.a).disabled, false);
  assert.equal(s.button(s.a).getAttribute('aria-pressed'), 'false');
});

test('switching fields ignores old results and does not duplicate a new session', t => {
  const s = setup(t);
  const old = s.start();
  s.emit(old, [['Answer one.']]);
  const current = s.start(s.b);
  s.emit(old, [['Answer one.'], ['Wrong field!']], 1);
  old.onend();
  s.emit(current, [['Answer two.']]);
  assert.equal(old.aborts, 1);
  assert.equal(s.a.value, 'Answer one.');
  assert.equal(s.b.value, 'Answer two.');
  assert.equal(s.button(s.b).getAttribute('aria-pressed'), 'true');
});

test('typing cancels recognition and late results cannot overwrite an edit', t => {
  const s = setup(t);
  const r = s.start();
  s.emit(r, [['Original thought.']]);
  s.a.value = 'Edited thought.';
  s.a.dispatchEvent(new s.w.Event('input', { bubbles: true }));
  s.emit(r, [['Original thought.'], ['late words']], 1);
  assert.equal(s.a.value, 'Edited thought.');
  assert.equal(r.aborts, 1);
});

test('programmatic value changes also invalidate the old insertion point', t => {
  const s = setup(t);
  const r = s.start();
  s.a.value = 'Restored answer';
  s.emit(r, [['Unexpected words']]);
  assert.equal(s.a.value, 'Restored answer');
  assert.equal(r.aborts, 1);
});

test('answer length limits never silently truncate dictated words', t => {
  const s = setup(t);
  s.a.maxLength = 8;
  s.a.value = 'Hello';
  const r = s.start();
  s.emit(r, [['world']]);
  assert.equal(s.a.value, 'Hello');
  assert.match(s.status(s.a), /length limit/);
});

for (const error of ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'no-speech', 'language-not-supported']) {
  test(`${error}: preserves the answer and lets the student retry`, t => {
    const s = setup(t);
    s.a.value = 'My work is safe.';
    const r = s.start();
    r.onerror({ error });
    r.onend();
    assert.equal(s.a.value, 'My work is safe.');
    assert.equal(s.button(s.a).disabled, false);
    assert.match(s.status(s.a), /type|typing/);
    s.start();
    assert.equal(s.recognitions.length, 2);
  });
}

test('a throwing start leaves the controls usable', t => {
  const s = setup(t, { startThrows: true });
  s.start();
  assert.equal(s.button(s.a).disabled, false);
  assert.match(s.status(s.a), /could not start/);
});

test('missing end/start callbacks time out and ignore later callbacks', t => {
  const s = setup(t, { delayStart: true });
  const r = s.start();
  s.button(s.a).click();
  r.onstart(); // A late start must not clear the Stop timeout.
  s.flushTimers();
  s.emit(r, [['Too late']]);
  assert.equal(s.a.value, '');
  assert.equal(s.button(s.a).disabled, false);
});

test('Submit finishes dictation and requires a second deliberate submit', t => {
  const s = setup(t);
  let submissions = 0;
  const submit = s.panel.querySelector('#submitWritingBtn');
  submit.addEventListener('click', () => submissions++);
  const r = s.start();
  submit.click();
  assert.equal(submissions, 0);
  s.emit(r, [['The complete response.']]);
  r.onend();
  assert.equal(submissions, 0);
  submit.click();
  assert.equal(submissions, 1);
  assert.equal(s.a.value, 'The complete response.');
});

test('form submission by Enter also waits for dictation', t => {
  const s = setup(t);
  const form = s.w.document.createElement('form');
  s.panel.append(form);
  const r = s.start();
  const event = new s.w.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(r.stops, 1);
});

test('ordinary navigation cancels without blocking the button action', t => {
  const s = setup(t);
  let navigations = 0;
  const next = s.panel.querySelector('#next');
  next.addEventListener('click', () => navigations++);
  const r = s.start();
  next.click();
  assert.equal(navigations, 1);
  assert.equal(r.aborts, 1);
});

test('Escape stops dictation before the assignment close listener sees it', t => {
  const s = setup(t);
  let closes = 0;
  s.w.document.addEventListener('keydown', () => closes++);
  const r = s.start();
  s.a.dispatchEvent(new s.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(r.stops, 1);
  assert.equal(closes, 0);
});

test('disabled/read-only, hidden, and removed fields cannot receive late words', async t => {
  const s = setup(t);
  const r = s.start();
  s.a.disabled = true;
  s.emit(r, [['Must not arrive']]);
  await settle();
  assert.equal(s.a.value, '');
  assert.equal(s.a.previousElementSibling.hidden, true);
  s.a.disabled = false;
  s.a.readOnly = true;
  await settle();
  s.start();
  assert.equal(s.recognitions.length, 1);
  s.a.readOnly = false;
  await settle();
  const hidden = s.start();
  s.a.hidden = true;
  await settle();
  s.emit(hidden, [['Still must not arrive']]);
  assert.equal(s.a.value, '');
  const removed = s.start(s.b);
  s.b.remove();
  await settle();
  s.emit(removed, [['Removed answer']]);
  assert.equal(s.b.value, '');
});

test('assignment read-only state disables every dictation entry point', t => {
  const s = setup(t, { editable: false });
  s.start();
  assert.equal(s.recognitions.length, 0);
  assert.equal(s.a.previousElementSibling.hidden, true);
});

test('newly rendered answer fields get one control and keep existing IDs', async t => {
  const s = setup(t);
  s.panel.insertAdjacentHTML('beforeend', '<textarea id="fresh" name="Q4"></textarea>');
  await settle();
  const field = s.panel.querySelector('#fresh');
  assert.equal(field.name, 'Q4');
  assert.equal(s.panel.querySelectorAll('.st-dictation-controls').length, 3);
  const r = s.start(field);
  s.emit(r, [['Fresh answer']]);
  await settle();
  assert.equal(s.panel.querySelectorAll('.st-dictation-controls').length, 3);
  assert.equal(field.value, 'Fresh answer');
});

test('tab hiding and destroy end recognition; callbacks cannot revive it', t => {
  const s = setup(t);
  const r = s.start();
  Object.defineProperty(s.w.document, 'hidden', { configurable: true, value: true });
  s.w.document.dispatchEvent(new s.w.Event('visibilitychange'));
  s.emit(r, [['Not while hidden']]);
  assert.equal(s.a.value, '');
  s.start(s.b);
  assert.equal(s.recognitions.length, 1);
  Object.defineProperty(s.w.document, 'hidden', { configurable: true, value: false });
  const current = s.start(s.b);
  s.controller.destroy();
  s.emit(current, [['Not after close']]);
  assert.equal(s.b.value, '');
  assert.equal(s.panel.querySelectorAll('.st-dictation-controls').length, 0);
});
