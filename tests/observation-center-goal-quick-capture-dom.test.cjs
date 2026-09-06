const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const enhancer = fs.readFileSync(
  path.join(
    root,
    'site/web/tc-observation-quick-capture.js'
  ),
  'utf8'
);

function categoryMarkup(category) {
  if (category === 'session_outcome') {
    return `
      <div class="obs-response-row" role="radiogroup" aria-label="Session outcome">
        <button class="obs-response-btn" data-response="met">Met</button>
        <button class="obs-response-btn" data-response="not_met">Not Met</button>
      </div>
    `;
  }

  if (category === 'tally') {
    return `
      <div class="obs-tally-row">
        <input class="obs-tally-input" />
        <span class="obs-tally-label">of</span>
        <input class="obs-tally-input" />
        <span class="obs-tally-label">opportunities</span>
      </div>
      <button class="obs-no-opp-link">No opportunities today?</button>
      <div class="obs-no-opp-btns" style="display:none">
        <button class="obs-response-btn" data-response="not_addressed">Not Addressed</button>
      </div>
    `;
  }

  if (category === 'prompt_count') {
    return `
      <div class="obs-response-row">
        <button class="obs-response-btn obs-prompt-btn">0</button>
        <button class="obs-response-btn obs-prompt-btn">1</button>
        <button class="obs-response-btn obs-prompt-btn">2</button>
        <button class="obs-response-btn obs-prompt-btn">3</button>
        <button class="obs-response-btn obs-prompt-btn">4+</button>
      </div>
    `;
  }

  return `
    <label class="obs-checklist-item">
      <input type="checkbox" /> Begins work
    </label>
    <label class="obs-checklist-item">
      <input type="checkbox" /> Stays engaged
    </label>
  `;
}

function cardMarkup(
  code,
  category,
  status = 'Due',
  extraClass = ''
) {
  return `
    <article class="obs-center-capture-card" data-goal-code="${code}">
      <div class="obs-goal-card ${extraClass}">
        <button class="obs-card-header" aria-expanded="false">Goal</button>
        <span class="obs-card-status">${status}</span>
        <div class="obs-card-body" style="display:none">
          <div class="obs-no-opp-btns">
            <div class="obs-rolling">Observation disposition</div>
            <div class="obs-response-row">
              <button class="obs-response-btn" data-disposition="absent">Absent</button>
              <button class="obs-response-btn" data-disposition="no_opportunity">No Opportunity</button>
            </div>
          </div>
          <div class="fixture-category" data-category="${category}">
            ${categoryMarkup(category)}
            <input class="obs-note-input" placeholder="Optional note…" />
          </div>
          <div class="obs-save-indicator"></div>
        </div>
      </div>
    </article>
  `;
}

function createFixture() {
  const dom = new JSDOM(
    `<!doctype html>
     <html>
       <head></head>
       <body>
         <div id="observationCenterApp">
           <div class="obs-center-card-grid">
             ${cardMarkup('SESSION', 'session_outcome')}
             ${cardMarkup('TALLY', 'tally')}
             ${cardMarkup('PROMPT', 'prompt_count')}
             ${cardMarkup('CHECK', 'behavior_checklist')}
             ${cardMarkup('LOCKED', 'session_outcome', 'Due', 'obs-center-goal-locked')}
           </div>
         </div>
       </body>
     </html>`,
    {
      url: 'https://reinischclassroom.com/teacher/observations/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    }
  );

  const { window } = dom;
  const { document } = window;

  document
    .querySelectorAll('.obs-card-header')
    .forEach(header => {
      header.addEventListener('click', () => {
        const expanded =
          header.getAttribute('aria-expanded') === 'true';

        header.setAttribute(
          'aria-expanded',
          expanded ? 'false' : 'true'
        );

        const body =
          header.parentElement.querySelector('.obs-card-body');

        if (body) {
          body.style.display = expanded ? 'none' : '';
        }
      });
    });

  const sessionCard = document.querySelector(
    '[data-goal-code="SESSION"] > .obs-goal-card'
  );

  sessionCard
    .querySelector('[data-response="met"]')
    .addEventListener('click', () => {
      const header =
        sessionCard.querySelector('.obs-card-header');

      if (header.getAttribute('aria-expanded') === 'true') {
        header.click();
      }
    });

  window.eval(enhancer);

  return {
    dom,
    window,
    document,
  };
}

function card(document, code) {
  return document.querySelector(
    `[data-goal-code="${code}"] > .obs-goal-card`
  );
}

async function flush(window) {
  await new Promise(resolve =>
    window.setTimeout(resolve, 0)
  );
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
  }
}

(async () => {
  console.log(
    '\n--- OBS-9B quick-capture DOM integration ---'
  );

  await test(
    'all four categories receive distinct Center quick-capture classes',
    async () => {
      const { dom, document } = createFixture();

      assert.ok(
        card(document, 'SESSION').classList.contains(
          'obs-center-quick-session'
        )
      );
      assert.ok(
        card(document, 'TALLY').classList.contains(
          'obs-center-quick-tally'
        )
      );
      assert.ok(
        card(document, 'PROMPT').classList.contains(
          'obs-center-quick-prompt'
        )
      );
      assert.ok(
        card(document, 'CHECK').classList.contains(
          'obs-center-quick-checklist'
        )
      );

      dom.window.close();
    }
  );

  await test(
    'unfinished cards open while historical locked cards are skipped',
    async () => {
      const { dom, document } = createFixture();

      for (const code of [
        'SESSION',
        'TALLY',
        'PROMPT',
        'CHECK',
      ]) {
        assert.equal(
          card(document, code)
            .querySelector('.obs-card-header')
            .getAttribute('aria-expanded'),
          'true'
        );
      }

      const locked = card(document, 'LOCKED');

      assert.equal(
        locked.dataset.obs9bEnhanced,
        undefined
      );
      assert.equal(
        locked
          .querySelector('.obs-card-header')
          .getAttribute('aria-expanded'),
        'false'
      );

      dom.window.close();
    }
  );

  await test(
    'disposition and optional note controls move behind closed disclosures',
    async () => {
      const { dom, document } = createFixture();
      const session = card(document, 'SESSION');

      const disposition = session.querySelector(
        '.obs-center-quick-disposition'
      );
      const note = session.querySelector(
        '.obs-center-quick-note'
      );

      assert.ok(disposition);
      assert.ok(note);
      assert.equal(disposition.open, false);
      assert.equal(note.open, false);
      assert.equal(
        disposition.querySelector('summary').textContent,
        'Absent / No Opportunity'
      );
      assert.equal(
        note.querySelector('summary').textContent,
        'Add note'
      );
      assert.ok(
        disposition.querySelector('[data-disposition="absent"]')
      );
      assert.ok(
        note.querySelector('.obs-note-input')
      );

      dom.window.close();
    }
  );

  await test(
    'session capture immediately reports saved and reopens after legacy collapse',
    async () => {
      const {
        dom,
        window,
        document,
      } = createFixture();

      const session = card(document, 'SESSION');
      const button = session.querySelector(
        '[data-response="met"]'
      );

      button.click();
      await flush(window);

      assert.equal(
        session
          .querySelector('.obs-card-header')
          .getAttribute('aria-expanded'),
        'true'
      );

      assert.equal(
        session
          .querySelector('.obs-save-indicator')
          .textContent,
        'Saved ✓'
      );

      dom.window.close();
    }
  );

  await test(
    'MutationObserver enhances Center cards added by a later workspace rerender',
    async () => {
      const {
        dom,
        window,
        document,
      } = createFixture();

      const grid = document.querySelector(
        '.obs-center-card-grid'
      );

      const holder = document.createElement('div');
      holder.innerHTML = cardMarkup(
        'LATE',
        'prompt_count'
      );

      const lateArticle = holder.firstElementChild;
      const lateHeader = lateArticle.querySelector(
        '.obs-card-header'
      );

      lateHeader.addEventListener('click', () => {
        const expanded =
          lateHeader.getAttribute('aria-expanded') === 'true';

        lateHeader.setAttribute(
          'aria-expanded',
          expanded ? 'false' : 'true'
        );
      });

      grid.appendChild(lateArticle);

      await flush(window);
      await flush(window);

      const late = card(document, 'LATE');

      assert.equal(
        late.dataset.obs9bEnhanced,
        'true'
      );
      assert.ok(
        late.classList.contains(
          'obs-center-quick-prompt'
        )
      );

      dom.window.close();
    }
  );

  console.log(
    `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
  );

  if (failed > 0) process.exitCode = 1;
})();
