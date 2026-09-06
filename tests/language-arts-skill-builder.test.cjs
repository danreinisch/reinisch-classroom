const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const donor = 'site/student/resources/presentation-01/final_exam_skill_builder_20q_feedback.html';
const mirror = 'site/presentations/language-arts-toolkit/presentation-01/final_exam_skill_builder_20q_feedback.html';
const html = fs.readFileSync(path.join(root, donor), 'utf8');
const data = JSON.parse(html.match(/const DATA = (\{[^\n]+\});/)[1]);
const legacyKey = 'finalExamPracticeState_20q_feedback_v1';

function fixture(t, blockedStorage = false) {
  const errors = [];
  const spoken = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: 'https://example.test/skill-builder',
    runScripts: 'dangerously',
    virtualConsole: console,
    beforeParse(window) {
      window.scrollTo = () => {};
      window.confirm = () => true;
      window.speechSynthesis = { cancel() {}, speak(message) { spoken.push(message.text); } };
      window.SpeechSynthesisUtterance = function (text) { this.text = text; };
      if (blockedStorage) {
        for (const name of ['localStorage', 'sessionStorage']) {
          Object.defineProperty(window, name, { get() { throw new Error('Storage unavailable'); } });
        }
      } else {
        window.localStorage.setItem(legacyKey, JSON.stringify({
          'verbs:0': { selected: 2, correct: true, attempts: [2] },
          writing: { paragraph: 'OLD SYNTHETIC DRAFT' },
        }));
      }
    },
  });
  t.after(() => { dom.window.close(); assert.deepEqual(errors, []); });
  assert.deepEqual(errors, []);
  return { window: dom.window, document: dom.window.document, spoken };
}
function click(document, selector) {
  const element = document.querySelector(selector);
  assert.ok(element, `Missing control: ${selector}`);
  element.click();
}
function choose(document, text) {
  const button = [...document.querySelectorAll('.choice')].find(element =>
    element.querySelector('span:last-child').textContent === text);
  assert.ok(button, `Missing answer: ${text}`);
  button.click();
}
function stats(document) {
  return [...document.querySelectorAll('.report-stat strong')].map(element => element.textContent);
}

test('both donor copies match; all existing skills and the writing scaffold remain', () => {
  assert.equal(html, fs.readFileSync(path.join(root, mirror), 'utf8'));
  assert.deepEqual(data.skills.map(skill => [skill.id, skill.questions.length]), [
    ['verbs', 20], ['context', 20], ['sentences', 20],
    ['inferences', 20], ['cause', 20], ['compare', 20],
  ]);
  assert.equal(data.writingPrompt.title, 'Written Response Practice');
  assert.doesNotMatch(html, /Final Exam|Finals Prep|Question 25/);
  for (const file of ['site/language-arts/toolkit/index.html', 'site/presentations/language-arts-toolkit/presentation-01/index.html']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(text.includes('Language Arts Skill Builder'));
    assert.ok(!text.includes('(And Finals Prep)'));
  }
});

test('four-choice answer keys are balanced and True/False order stays consistent', () => {
  for (const skill of data.skills) {
    const counts = [0, 0, 0, 0];
    for (const question of skill.questions) {
      assert.ok(Number.isInteger(question.answer));
      assert.ok(question.answer >= 0 && question.answer < question.choices.length);
      assert.match(question.choices[question.answer].feedback, /^Correct\b/);
      if (question.choices.length === 4) counts[question.answer]++;
      else assert.deepEqual(question.choices.map(choice => choice.text), ['True', 'False']);
    }
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${skill.id}: ${counts}`);
  }
});

test('first-try success is reported separately and unattempted questions are neutral', t => {
  const { document } = fixture(t);
  click(document, '[data-open-skill="verbs"]');
  choose(document, 'will decorate the room');
  assert.match(document.querySelector('.feedback').textContent, /Correct\./);
  click(document, '#seeFeedbackBtn');
  assert.deepEqual(stats(document), ['1/20', '1', '0']);
  assert.match(document.querySelector('#firstTrySummary').textContent, /100%\. 19 unattempted/);
  const next = [...document.querySelectorAll('.report-section')].find(element =>
    element.querySelector('h3').textContent === 'Where to practice next');
  assert.match(next.textContent, /No missed attempts/);
  assert.ok(!next.textContent.includes(data.skills[0].questions[1].focus));
});

test('retry preserves the attempt denominator and corrections never inflate first-try accuracy', t => {
  const { document, spoken } = fixture(t);
  click(document, '[data-open-skill="verbs"]');
  choose(document, 'decorated the room');
  assert.match(document.querySelector('.feedback').textContent, /Decorated is past tense/);
  click(document, '#retryBtn');
  click(document, '#seeFeedbackBtn');
  assert.deepEqual(stats(document), ['1/20', '0', '0']);
  assert.match(document.querySelector('#firstTrySummary').textContent, /0%\. 19 unattempted/);
  click(document, '#reportKeepPracticing');
  choose(document, 'decorated the room');
  click(document, '#retryBtn');
  choose(document, 'will decorate the room');
  click(document, '#seeFeedbackBtn');
  assert.deepEqual(stats(document), ['1/20', '0', '1']);
  assert.match(document.querySelector('#reportCard').textContent, /2 missed attempts/);
  assert.match(document.querySelector('#firstTrySummary').textContent, /0%\. 19 unattempted/);
  click(document, '#reportBackMenu');
  click(document, '#overallFeedbackBtn');
  assert.match(spoken.at(-1), /0 correct on the first try and 1 corrected with feedback\. Questions attempted: 1\./);
});

test('an empty report has no accuracy percentage or invented weaknesses', t => {
  const { document } = fixture(t);
  click(document, '[data-open-skill="verbs"]');
  click(document, '#seeFeedbackBtn');
  assert.deepEqual(stats(document), ['0/20', '0', '0']);
  assert.match(document.querySelector('#firstTrySummary').textContent, /Not available yet\. 20 unattempted/);
  assert.doesNotMatch(document.querySelector('#reportCard').textContent, /Where to practice next/);
});

test('the repaired transition question explains its answer consistently', t => {
  const { document } = fixture(t);
  click(document, '[data-open-skill="sentences"]');
  click(document, '[data-q-nav="16"]');
  assert.match(document.querySelector('.prompt').textContent, /missing several steps/);
  choose(document, 'Therefore');
  assert.match(document.querySelector('.feedback').textContent, /missing steps \(cause\)/);
});

test('writing checks describe measurable basics without claiming writing quality', t => {
  const { document, window } = fixture(t);
  click(document, '[data-open-skill="writing"]');
  const field = document.querySelector('#paragraphBox');
  field.value = ['First', 'Next', 'Also', 'Then', 'Overall'].map(word =>
    `${word}, words words words words words words words words words.`).join(' ');
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  click(document, '#checkWritingBtn');
  const feedback = document.querySelector('#writingOutput').textContent;
  assert.match(feedback, /5 \/ 5 checklist items met/);
  assert.match(feedback, /Contains at least 45 words/);
  assert.match(feedback, /These checks do not evaluate complete sentences, relevant details, or organization/);
  assert.doesNotMatch(feedback, /Has enough detail|complete-looking sentences/);
  click(document, '#menuDoneBtn');
  click(document, '[data-open-skill="writing"]');
  assert.equal(document.querySelector('#paragraphBox').value, field.value);
});

test('legacy browser data is ignored, writing is not persisted, and End clears the visit', t => {
  const { document, window } = fixture(t);
  const legacy = window.localStorage.getItem(legacyKey);
  assert.equal(document.querySelector('#scoreNumMenu').textContent, '0');
  click(document, '[data-open-skill="writing"]');
  const field = document.querySelector('#paragraphBox');
  assert.equal(field.value, '');
  field.value = 'NEW SYNTHETIC DRAFT';
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  window.confirm = () => false;
  click(document, '#endPracticeBtn');
  assert.equal(document.querySelector('#paragraphBox').value, 'NEW SYNTHETIC DRAFT');
  window.confirm = () => true;
  click(document, '#endPracticeBtn');
  assert.equal(document.querySelector('#practiceContent').textContent, '');
  click(document, '[data-open-skill="writing"]');
  assert.equal(document.querySelector('#paragraphBox').value, '');
  assert.equal(window.localStorage.getItem(legacyKey), legacy);
  assert.equal(window.localStorage.length, 1);
  assert.equal(window.sessionStorage.length, 0);
});

test('page departure and browser-history restoration both clear old practice', t => {
  const { document, window } = fixture(t);
  for (const type of ['pagehide', 'pageshow']) {
    click(document, '[data-open-skill="verbs"]');
    choose(document, 'will decorate the room');
    window.dispatchEvent(new window.PageTransitionEvent(type, { persisted: true }));
    assert.equal(document.querySelector('#scoreNumMenu').textContent, '0');
    assert.equal(document.querySelector('#practiceContent').textContent, '');
    assert.equal(document.querySelector('#mainMenu').classList.contains('hidden'), false);
  }
});

test('practice and reset work when browser storage is unavailable', t => {
  const { document } = fixture(t, true);
  click(document, '[data-open-skill="verbs"]');
  choose(document, 'will decorate the room');
  click(document, '#menuDoneBtn');
  assert.equal(document.querySelector('#scoreNumMenu').textContent, '1');
  click(document, '#resetBtn');
  assert.equal(document.querySelector('#scoreNumMenu').textContent, '0');
});

test('individual choice readers speak without answering, including after feedback', t => {
  const { document, window, spoken } = fixture(t);
  click(document, '[data-open-skill="verbs"]');
  const choices = data.skills[0].questions[0].choices;
  const readers = [...document.querySelectorAll('[data-choice-read]')];
  assert.equal(readers.length, choices.length);
  readers.forEach((button, index) => {
    const letter = String.fromCharCode(65 + index);
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');
    assert.equal(button.closest('.choice'), null);
    assert.equal(button.getAttribute('aria-label'), `Read choice ${letter}`);
    assert.ok(button.tabIndex >= 0);
    button.focus();
    assert.equal(document.activeElement, button);
    button.click();
    assert.equal(spoken.at(-1), `Choice ${letter}. ${choices[index].text}`);
    assert.equal(document.querySelector('.feedback'), null);
  });
  click(document, '#seeFeedbackBtn');
  assert.deepEqual(stats(document), ['0/20', '0', '0']);
  click(document, '#reportKeepPracticing');
  choose(document, 'decorated the room');
  let cancellations = 0;
  window.speechSynthesis.cancel = () => { cancellations++; };
  click(document, '[data-choice-read="0"]');
  assert.equal(spoken.at(-1), `Choice A. ${choices[0].text}`);
  click(document, '#stopSpeechBtn2');
  assert.equal(cancellations, 2);
  click(document, '#seeFeedbackBtn');
  assert.deepEqual(stats(document), ['1/20', '0', '0']);
  assert.match(document.querySelector('#reportCard').textContent, /1 missed attempt/);
});

test('True and False each have a reader that leaves the question unanswered', t => {
  const { document, spoken } = fixture(t);
  click(document, '[data-open-skill="verbs"]');
  const index = data.skills[0].questions.findIndex(q => q.choices.length === 2);
  click(document, `[data-q-nav="${index}"]`);
  assert.equal(document.querySelectorAll('[data-choice-read]').length, 2);
  click(document, '[data-choice-read="0"]');
  click(document, '[data-choice-read="1"]');
  assert.deepEqual(spoken, ['Choice A. True', 'Choice B. False']);
  click(document, '#seeFeedbackBtn');
  assert.deepEqual(stats(document), ['0/20', '0', '0']);
});

test('all six writing fields have readable directions that preserve the draft', t => {
  const { document, window, spoken } = fixture(t);
  click(document, '[data-open-skill="writing"]');
  const ids = ['topicBox', 'detail1Box', 'detail2Box', 'detail3Box', 'conclusionBox', 'paragraphBox'];
  assert.equal(document.querySelectorAll('[data-field-read]').length, ids.length);
  for (const id of ids) {
    const field = document.getElementById(id);
    field.value = `Synthetic draft for ${id}.`;
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  for (const id of ids) {
    const field = document.getElementById(id);
    const help = document.getElementById(field.getAttribute('aria-describedby'));
    const label = document.querySelector(`label[for="${id}"]`).textContent;
    const button = document.querySelector(`[data-field-read="${id}"]`);
    assert.ok(help && help.textContent.length > 20);
    assert.equal(help.closest('.field'), field.closest('.field'));
    assert.equal(button.type, 'button');
    assert.equal(button.getAttribute('aria-label'), `Read directions for ${label.toLowerCase()}`);
    button.focus();
    assert.equal(document.activeElement, button);
    button.click();
    assert.equal(spoken.at(-1), `${label}. ${help.textContent}`);
  }
  for (const id of ids) {
    assert.equal(document.getElementById(id).value, `Synthetic draft for ${id}.`);
  }
  assert.equal(document.getElementById('writingOutput').textContent, '');
  click(document, '#readParagraphBtn');
  assert.equal(spoken.at(-1), 'Synthetic draft for paragraphBox.');
});
