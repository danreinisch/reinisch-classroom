(() => {
  'use strict';

  const normalizedPath =
    location.pathname.replace(/\/+$/, '');

  if (normalizedPath !== '/teacher/observations') {
    return;
  }

  const app =
    document.getElementById('observationCenterApp');

  if (!app) return;

  const styleId =
    'obs9b-quick-capture-styles';

  if (!document.getElementById(styleId)) {
    const style =
      document.createElement('style');

    style.id = styleId;
    style.textContent = `
      #observationCenterApp .obs-center-card-grid {
        grid-template-columns:repeat(auto-fit,minmax(380px,1fr));
      }

      #observationCenterApp .obs-center-quick-capture {
        border-color:rgba(255,255,255,.11);
      }

      #observationCenterApp .obs-center-quick-capture .obs-card-body {
        padding:4px 14px 14px;
      }

      #observationCenterApp .obs-center-quick-capture .obs-response-btn {
        justify-content:center;
        min-width:0;
        width:100%;
        padding:10px 9px;
      }

      #observationCenterApp .obs-center-quick-session .obs-response-row[aria-label="Session outcome"] {
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
      }

      #observationCenterApp .obs-center-quick-prompt .obs-response-row {
        display:grid;
        grid-template-columns:repeat(5,minmax(0,1fr));
        gap:7px;
      }

      #observationCenterApp .obs-center-quick-prompt .obs-prompt-btn {
        padding-inline:6px;
      }

      #observationCenterApp .obs-center-quick-tally .obs-tally-row {
        display:grid;
        grid-template-columns:minmax(70px,1fr) auto minmax(70px,1fr) auto;
        gap:8px;
        align-items:center;
      }

      #observationCenterApp .obs-center-quick-tally .obs-tally-input {
        width:100%;
        min-width:0;
        box-sizing:border-box;
      }

      #observationCenterApp .obs-center-quick-checklist .obs-checklist-item {
        padding:9px 10px;
        margin-bottom:6px;
        border:1px solid rgba(255,255,255,.09);
        border-radius:10px;
        background:rgba(255,255,255,.025);
      }

      #observationCenterApp .obs-center-quick-checklist .obs-checklist-item:hover {
        background:rgba(255,255,255,.05);
      }

      #observationCenterApp .obs-center-quick-disposition,
      #observationCenterApp .obs-center-quick-note,
      #observationCenterApp .obs-center-quick-tally-fallback {
        margin-top:8px;
        border:1px solid rgba(255,255,255,.08);
        border-radius:10px;
        background:rgba(255,255,255,.02);
      }

      #observationCenterApp .obs-center-quick-disposition > summary,
      #observationCenterApp .obs-center-quick-note > summary,
      #observationCenterApp .obs-center-quick-tally-fallback > summary {
        cursor:pointer;
        padding:8px 10px;
        color:rgba(240,255,250,.64);
        font-size:12px;
        font-weight:700;
        list-style-position:inside;
      }

      #observationCenterApp .obs-center-quick-disposition[open] > summary,
      #observationCenterApp .obs-center-quick-note[open] > summary,
      #observationCenterApp .obs-center-quick-tally-fallback[open] > summary {
        color:rgba(240,255,250,.88);
        border-bottom:1px solid rgba(255,255,255,.07);
      }

      #observationCenterApp .obs-center-quick-disposition .obs-no-opp-btns,
      #observationCenterApp .obs-center-quick-note .obs-note-input,
      #observationCenterApp .obs-center-quick-tally-fallback .obs-no-opp-link,
      #observationCenterApp .obs-center-quick-tally-fallback .obs-no-opp-btns {
        margin:8px 10px 10px;
      }

      #observationCenterApp .obs-center-quick-disposition .obs-rolling {
        display:none;
      }

      #observationCenterApp .obs-center-quick-note .obs-note-input {
        width:calc(100% - 20px);
        box-sizing:border-box;
      }

      #observationCenterApp .obs-center-quick-capture .obs-save-indicator:not(:empty) {
        display:inline-flex;
        align-items:center;
        min-height:24px;
        margin-top:8px;
        padding:3px 8px;
        border-radius:999px;
        background:rgba(34,197,94,.08);
      }

      @media (max-width: 980px) {
        #observationCenterApp .obs-center-card-grid {
          grid-template-columns:1fr;
        }
      }

      @media (max-width: 560px) {
        #observationCenterApp .obs-center-quick-session .obs-response-row[aria-label="Session outcome"] {
          grid-template-columns:1fr;
        }

        #observationCenterApp .obs-center-quick-prompt .obs-response-row {
          grid-template-columns:repeat(3,minmax(0,1fr));
        }

        #observationCenterApp .obs-center-quick-tally .obs-tally-row {
          grid-template-columns:minmax(64px,1fr) auto minmax(64px,1fr);
        }

        #observationCenterApp .obs-center-quick-tally .obs-tally-label:last-child {
          grid-column:1 / -1;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function makeDisclosure(className, label) {
    const details =
      document.createElement('details');

    details.className = className;

    const summary =
      document.createElement('summary');

    summary.textContent = label;
    details.appendChild(summary);

    return details;
  }

  function detectCategory(card) {
    if (
      card.querySelector(
        '.obs-response-row[aria-label="Session outcome"]'
      )
    ) {
      return 'session_outcome';
    }

    if (card.querySelector('.obs-tally-row')) {
      return 'tally';
    }

    if (card.querySelector('.obs-prompt-btn')) {
      return 'prompt_count';
    }

    if (card.querySelector('.obs-checklist-item')) {
      return 'behavior_checklist';
    }

    return 'unknown';
  }

  function wrapDisposition(card) {
    const dispositionButton =
      card.querySelector('[data-disposition]');

    const disposition =
      dispositionButton?.closest('.obs-no-opp-btns');

    if (
      !disposition ||
      disposition.closest('.obs-center-quick-disposition')
    ) {
      return;
    }

    const details =
      makeDisclosure(
        'obs-center-quick-disposition',
        'Absent / No Opportunity'
      );

    disposition.parentNode.insertBefore(
      details,
      disposition
    );

    details.appendChild(disposition);
  }

  function wrapOptionalNote(card) {
    const noteInput =
      card.querySelector('.obs-note-input');

    if (
      !noteInput ||
      noteInput.closest('.obs-center-quick-note')
    ) {
      return;
    }

    const details =
      makeDisclosure(
        'obs-center-quick-note',
        'Add note'
      );

    noteInput.parentNode.insertBefore(
      details,
      noteInput
    );

    details.appendChild(noteInput);
  }

  function wrapTallyFallback(card) {
    const link =
      card.querySelector('.obs-no-opp-link');

    const buttons =
      link?.nextElementSibling;

    if (
      !link ||
      !buttons?.classList?.contains('obs-no-opp-btns') ||
      link.closest('.obs-center-quick-tally-fallback')
    ) {
      return;
    }

    const details =
      makeDisclosure(
        'obs-center-quick-tally-fallback',
        'No tally available'
      );

    link.parentNode.insertBefore(
      details,
      link
    );

    details.append(
      link,
      buttons
    );
  }

  function openIfUnfinished(card) {
    const header =
      card.querySelector('.obs-card-header');

    const status =
      card.querySelector('.obs-card-status')
        ?.textContent
        ?.trim() || '';

    if (
      !header ||
      /Recorded/i.test(status)
    ) {
      return;
    }

    if (
      header.getAttribute('aria-expanded') !== 'true'
    ) {
      header.click();
    }
  }

  function reopenAfterCapture(card) {
    card.dataset.obs9bKeepOpen = 'true';

    const indicator =
      card.querySelector('.obs-save-indicator');

    if (indicator) {
      indicator.textContent = 'Saved ✓';
      indicator.className = 'obs-save-indicator';
      indicator.setAttribute('aria-live', 'polite');
    }

    setTimeout(() => {
      const header =
        card.querySelector('.obs-card-header');

      if (
        card.dataset.obs9bKeepOpen === 'true' &&
        header &&
        header.getAttribute('aria-expanded') !== 'true'
      ) {
        header.click();
      }

      delete card.dataset.obs9bKeepOpen;
    }, 0);
  }

  function enhanceCard(card) {
    if (
      !(card instanceof HTMLElement) ||
      card.classList.contains('obs-center-goal-locked') ||
      card.dataset.obs9bEnhanced === 'true'
    ) {
      return;
    }

    const category =
      detectCategory(card);

    card.dataset.obs9bEnhanced = 'true';
    card.dataset.captureCategory = category;
    card.classList.add('obs-center-quick-capture');

    const categoryClass = {
      session_outcome: 'obs-center-quick-session',
      tally: 'obs-center-quick-tally',
      prompt_count: 'obs-center-quick-prompt',
      behavior_checklist: 'obs-center-quick-checklist',
    }[category];

    if (categoryClass) {
      card.classList.add(categoryClass);
    }

    wrapDisposition(card);
    wrapOptionalNote(card);

    if (category === 'tally') {
      wrapTallyFallback(card);
    }

    openIfUnfinished(card);
  }

  function scanCards(root = app) {
    if (
      root instanceof HTMLElement &&
      root.matches(
        '.obs-center-capture-card > .obs-goal-card'
      )
    ) {
      enhanceCard(root);
    }

    root
      .querySelectorAll(
        '.obs-center-capture-card > .obs-goal-card'
      )
      .forEach(enhanceCard);
  }

  let scanQueued = false;

  function scheduleScan() {
    if (scanQueued) return;

    scanQueued = true;

    queueMicrotask(() => {
      scanQueued = false;
      scanCards();
    });
  }

  const observer =
    new MutationObserver(scheduleScan);

  observer.observe(
    app,
    {
      childList: true,
      subtree: true,
    }
  );

  app.addEventListener(
    'click',
    event => {
      const button =
        event.target.closest(
          '.obs-center-quick-capture .obs-response-btn'
        );

      if (!button) return;

      const card =
        button.closest('.obs-center-quick-capture');

      if (card) {
        reopenAfterCapture(card);
      }
    },
    true
  );

  app.addEventListener(
    'change',
    event => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const card =
        target.closest('.obs-center-quick-capture');

      if (!card) return;

      if (
        target.matches(
          '.obs-checklist-item input[type="checkbox"]'
        )
      ) {
        reopenAfterCapture(card);
        return;
      }

      if (target.matches('.obs-tally-input')) {
        const tallyInputs =
          [...card.querySelectorAll('.obs-tally-input')];

        const opportunities =
          Number(tallyInputs[1]?.value) || 0;

        if (opportunities > 0) {
          reopenAfterCapture(card);
        }
      }
    },
    true
  );

  scanCards();
})();
