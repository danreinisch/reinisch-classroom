// OBS-NQ2 reviewed-contract fast capture for Observation Center.
// This layer consumes the OBS-NQ1 evidence contracts. It does not change IEP
// wording or goal math; it only makes legitimate evidence fast to record.

(() => {
  'use strict';

  const normalizedPath = location.pathname.replace(/\/+$/, '');
  if (normalizedPath !== '/teacher/observations') return;

  const bootstrap = window.RCObsNQ2;
  if (!bootstrap?.registry) {
    console.warn('[obs-nq2] Contract bootstrap unavailable; fast capture not mounted.');
    return;
  }

  const QUEUE_KEY = 'rc_obs_contract_pending';
  const API = '/.netlify/functions/teacher-contract-observation';
  let scanQueued = false;

  function todayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function selectedDate() {
    return document.querySelector('.obs-center-date-input')?.value || todayKey();
  }

  function selectedPeriod(card) {
    const selected = document.querySelector('.obs-center-period-select')?.value?.trim();
    if (selected) return selected;

    const meta = card.querySelector('.obs-center-goal-period')?.textContent || '';
    const match = meta.match(/Recording as:\s*(.+)$/i);
    return match?.[1]?.trim() || '';
  }

  function queueIdentity(entry) {
    return [entry.student_code, entry.goal_code, entry.date, entry.event_key].join('|');
  }

  function readQueue() {
    try {
      const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  function upsertQueue(entry) {
    const queue = readQueue();
    const key = queueIdentity(entry);
    const index = queue.findIndex(item => queueIdentity(item) === key);
    const next = { ...entry, saved_at: new Date().toISOString() };
    if (index >= 0) queue[index] = next;
    else queue.push(next);
    writeQueue(queue);
    return next;
  }

  function removeQueue(entry) {
    const key = queueIdentity(entry);
    writeQueue(readQueue().filter(item => queueIdentity(item) !== key));
  }

  async function sendEntry(entry) {
    const response = await fetch(API, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(entry),
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.error || `save failed (${response.status})`);
    }
    return payload.result;
  }

  async function syncQueue() {
    const pending = readQueue();
    for (const entry of pending) {
      try {
        await sendEntry(entry);
        removeQueue(entry);
      } catch {
        // Keep it queued. The next interval/page visit retries it.
      }
    }
  }

  function localStateFor(studentCode, goalCode, date) {
    const out = new Map();
    for (const entry of readQueue()) {
      if (
        entry.student_code !== studentCode ||
        entry.goal_code !== goalCode ||
        entry.date !== date
      ) continue;

      out.set(entry.event_key, entry.action === 'disposition'
        ? { kind: 'disposition', disposition: entry.disposition, class_period: entry.class_period || null }
        : { kind: 'event', data: entry.data || {}, value: null, success: null, class_period: entry.class_period || null });
    }
    return out;
  }

  async function loadState(goal, date) {
    const local = localStateFor(goal.student_code, goal.code, date);
    let legacyPresent = false;

    try {
      const query = new URLSearchParams({
        student_code: goal.student_code,
        goal_code: goal.code,
        date,
      });
      const response = await fetch(`${API}?${query}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({ ok: false }));
      if (response.ok && payload.ok === true) {
        const state = new Map();
        for (const event of payload.events || []) {
          state.set(event.event_key, { kind: 'event', ...event });
        }
        for (const disposition of payload.dispositions || []) {
          state.set(disposition.event_key, { kind: 'disposition', ...disposition });
        }
        for (const [key, value] of local) state.set(key, value);
        legacyPresent = payload.legacy_present === true;
        return { state, legacyPresent };
      }
    } catch {
      // Local queue still gives an honest offline state.
    }

    return { state: local, legacyPresent };
  }

  function eventKey(contract, period, slot = 1) {
    const scope = period ? `period:${period}` : 'day';
    if (contract.high_frequency === true || Number(contract.events_per_period) > 1) {
      return `${scope}:slot:${slot}`;
    }
    return `${scope}:single`;
  }

  function setIndicator(card, message, offline = false) {
    const indicator = card.querySelector('.obs-save-indicator');
    if (indicator) {
      indicator.textContent = message;
      indicator.className = `obs-save-indicator${offline ? ' offline' : ''}`;
    }
    const centerStatus = document.querySelector('.obs-center-status');
    if (centerStatus && /saved/i.test(message)) centerStatus.textContent = message;
  }

  function setCardStatus(card, text, complete = false) {
    const badge = card.querySelector('.obs-card-status');
    if (!badge) return;
    badge.textContent = text;
    badge.dataset.contractComplete = String(complete);
  }

  async function save(card, goal, contract, payload, state, rerender) {
    const queued = upsertQueue(payload);
    state.set(payload.event_key, payload.action === 'disposition'
      ? { kind: 'disposition', disposition: payload.disposition, class_period: payload.class_period || null }
      : { kind: 'event', data: payload.data || {}, class_period: payload.class_period || null });
    setIndicator(card, 'Saved locally — syncing…', true);
    rerender();

    try {
      const result = await sendEntry(queued);
      removeQueue(queued);
      state.set(payload.event_key, payload.action === 'disposition'
        ? { kind: 'disposition', ...result }
        : { kind: 'event', ...result });
      setIndicator(card, 'Auto-saved ✓');
      rerender();
    } catch (error) {
      console.warn('[obs-nq2] Contract save queued:', goal.code, error.message);
      setIndicator(card, 'Saved locally — will sync when connected', true);
    }
  }

  function button(label, className = '') {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = `obs-response-btn obs-contract-btn ${className}`.trim();
    control.textContent = label;
    return control;
  }

  function noteDisclosure() {
    const details = document.createElement('details');
    details.className = 'obs-contract-note';
    const summary = document.createElement('summary');
    summary.textContent = 'Add note';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'obs-note-input';
    input.placeholder = 'Optional note…';
    details.append(summary, input);
    return { details, input };
  }

  function dispositionControls({ card, goal, contract, period, date, key, state, noteInput, rerender }) {
    const allowed = Array.isArray(contract.dispositions) ? contract.dispositions : [];
    if (!allowed.length) return null;

    const details = document.createElement('details');
    details.className = 'obs-contract-disposition';
    const summary = document.createElement('summary');
    summary.textContent = allowed.length > 1 ? 'Absent / No Opportunity' : 'Absent';
    details.appendChild(summary);

    if (!period) {
      const message = document.createElement('p');
      message.className = 'obs-contract-help';
      message.textContent = 'Choose an observation period to record a disposition.';
      details.appendChild(message);
      return details;
    }

    const row = document.createElement('div');
    row.className = 'obs-contract-action-row';
    const current = state.get(key);

    for (const disposition of allowed) {
      const label = disposition === 'no_opportunity' ? 'No Opportunity' : 'Absent';
      const control = button(label, 'obs-contract-secondary');
      if (current?.kind === 'disposition' && current.disposition === disposition) {
        control.classList.add('active');
      }
      control.addEventListener('click', () => save(
        card,
        goal,
        contract,
        {
          action: 'disposition',
          student_code: goal.student_code,
          goal_code: goal.code,
          date,
          event_key: key,
          disposition,
          class_period: period,
          note: noteInput.value.trim(),
        },
        state,
        rerender
      ));
      row.appendChild(control);
    }
    details.appendChild(row);
    return details;
  }

  function statusPill(item) {
    const status = document.createElement('span');
    status.className = 'obs-contract-status-pill';
    if (!item) {
      status.textContent = 'Not recorded';
      return status;
    }
    if (item.kind === 'disposition') {
      status.textContent = item.disposition === 'absent' ? 'Absent' : 'No Opportunity';
      status.classList.add('is-neutral');
      return status;
    }
    if (item.success === true || item.data?.result === 'met') {
      status.textContent = 'Met';
      status.classList.add('is-met');
    } else if (item.success === false || item.data?.result === 'not_met') {
      status.textContent = 'Not Met';
      status.classList.add('is-not-met');
    } else {
      status.textContent = 'Recorded';
      status.classList.add('is-recorded');
    }
    return status;
  }

  function renderOpportunity(context) {
    const { root, card, goal, contract, date, period, key, state, rerender } = context;
    const current = state.get(key);
    const title = document.createElement('div');
    title.className = 'obs-contract-prompt';
    title.textContent = contract.label || 'Record this opportunity';
    root.append(title, statusPill(current));

    const row = document.createElement('div');
    row.className = 'obs-contract-action-row obs-contract-primary-row';
    const { details: note, input: noteInput } = noteDisclosure();

    for (const result of ['met', 'not_met']) {
      const control = button(result === 'met' ? 'Met' : 'Not Met', result === 'met' ? 'is-met' : 'is-not-met');
      if (current?.kind === 'event' && current.data?.result === result) control.classList.add('active');
      control.addEventListener('click', () => save(
        card,
        goal,
        contract,
        {
          action: 'save', student_code: goal.student_code, goal_code: goal.code,
          date, event_key: key, class_period: period || null,
          data: { result }, note: noteInput.value.trim(),
        },
        state,
        rerender
      ));
      row.appendChild(control);
    }

    root.appendChild(row);
    const disposition = dispositionControls({ card, goal, contract, period, date, key, state, noteInput, rerender });
    if (disposition) root.appendChild(disposition);
    root.appendChild(note);
  }

  function renderHighFrequencyOpportunity(context) {
    const { root, card, goal, contract, date, period, state, rerender } = context;
    const total = Math.max(2, Number(contract.events_per_period) || 2);
    let completed = 0;

    const heading = document.createElement('div');
    heading.className = 'obs-contract-frequency-head';
    const title = document.createElement('strong');
    title.textContent = contract.label || 'Comprehension checks';
    const count = document.createElement('span');
    heading.append(title, count);
    root.appendChild(heading);

    for (let slot = 1; slot <= total; slot += 1) {
      const key = eventKey(contract, period, slot);
      const current = state.get(key);
      if (current) completed += 1;

      const slotEl = document.createElement('section');
      slotEl.className = 'obs-contract-slot';
      const slotHead = document.createElement('div');
      slotHead.className = 'obs-contract-slot-head';
      const slotLabel = document.createElement('strong');
      slotLabel.textContent = `Check ${slot}`;
      slotHead.append(slotLabel, statusPill(current));
      slotEl.appendChild(slotHead);

      const row = document.createElement('div');
      row.className = 'obs-contract-action-row obs-contract-primary-row';
      const { details: note, input: noteInput } = noteDisclosure();

      for (const result of ['met', 'not_met']) {
        const control = button(result === 'met' ? 'Met' : 'Not Met', result === 'met' ? 'is-met' : 'is-not-met');
        if (current?.kind === 'event' && current.data?.result === result) control.classList.add('active');
        control.addEventListener('click', () => save(
          card,
          goal,
          contract,
          {
            action: 'save', student_code: goal.student_code, goal_code: goal.code,
            date, event_key: key, class_period: period || null,
            data: { result }, note: noteInput.value.trim(),
          },
          state,
          rerender
        ));
        row.appendChild(control);
      }
      slotEl.appendChild(row);
      const disposition = dispositionControls({ card, goal, contract, period, date, key, state, noteInput, rerender });
      if (disposition) slotEl.appendChild(disposition);
      slotEl.appendChild(note);
      root.appendChild(slotEl);
    }

    count.textContent = `${completed}/${total} recorded`;
    setCardStatus(card, `${completed}/${total} checks`, completed >= total);

    const header = card.querySelector('.obs-card-header');
    if (completed < total && header?.getAttribute('aria-expanded') !== 'true') header.click();
  }

  function renderComponentComposite(context) {
    const { root, card, goal, contract, date, period, key, state, rerender } = context;
    const current = state.get(key);
    const working = { ...(current?.kind === 'event' ? current.data?.components : {}) };
    const required = (contract.components || []).filter(component => component.required !== false);

    const top = document.createElement('div');
    top.className = 'obs-contract-frequency-head';
    const prompt = document.createElement('strong');
    prompt.textContent = contract.label || 'Performance checklist';
    const allMet = button('All Met', 'obs-contract-all-met');
    top.append(prompt, allMet);
    root.appendChild(top);

    const { details: note, input: noteInput } = noteDisclosure();

    const submitIfComplete = () => {
      if (!required.every(component => ['met', 'not_met'].includes(working[component.key]))) return;
      save(card, goal, contract, {
        action: 'save', student_code: goal.student_code, goal_code: goal.code,
        date, event_key: key, class_period: period || null,
        data: { components: { ...working } }, note: noteInput.value.trim(),
      }, state, rerender);
    };

    allMet.addEventListener('click', () => {
      for (const component of required) working[component.key] = 'met';
      save(card, goal, contract, {
        action: 'save', student_code: goal.student_code, goal_code: goal.code,
        date, event_key: key, class_period: period || null,
        data: { components: { ...working } }, note: noteInput.value.trim(),
      }, state, rerender);
    });

    for (const component of contract.components || []) {
      const item = document.createElement('div');
      item.className = 'obs-contract-component';
      const label = document.createElement('span');
      label.textContent = component.label;
      const controls = document.createElement('div');
      controls.className = 'obs-contract-mini-row';
      for (const result of ['met', 'not_met']) {
        const control = button(result === 'met' ? 'Met' : 'Not Met', 'obs-contract-mini');
        if (working[component.key] === result) control.classList.add('active', result === 'met' ? 'is-met' : 'is-not-met');
        control.addEventListener('click', () => {
          working[component.key] = result;
          submitIfComplete();
          rerender({ localDraft: { components: { ...working } } });
        });
        controls.appendChild(control);
      }
      item.append(label, controls);
      root.appendChild(item);
    }

    const disposition = dispositionControls({ card, goal, contract, period, date, key, state, noteInput, rerender });
    if (disposition) root.appendChild(disposition);
    root.appendChild(note);
  }

  function renderCount(context) {
    const { root, card, goal, contract, date, period, key, state, rerender } = context;
    const current = state.get(key);
    const prior = current?.kind === 'event' ? current.data || {} : {};
    const { details: note, input: noteInput } = noteDisclosure();
    const working = { ...prior };

    const prompt = document.createElement('div');
    prompt.className = 'obs-contract-prompt';
    prompt.textContent = contract.label || 'Record count';
    root.append(prompt, statusPill(current));

    const saveWhenReady = () => {
      const missing = (contract.fields || []).filter(field => field.kind !== 'optional_text').some(field => working[field.key] === undefined || working[field.key] === null || working[field.key] === '');
      if (missing) return;
      save(card, goal, contract, {
        action: 'save', student_code: goal.student_code, goal_code: goal.code,
        date, event_key: key, class_period: period || null, data: working,
        note: noteInput.value.trim(),
      }, state, rerender);
    };

    if ((contract.fields || []).some(field => field.key === 'completed')) {
      const label = document.createElement('span');
      label.className = 'obs-contract-field-label';
      label.textContent = 'Task completion';
      root.appendChild(label);
      const row = document.createElement('div');
      row.className = 'obs-contract-action-row';
      for (const [value, textLabel] of [[true, 'Completed'], [false, 'Not Completed']]) {
        const control = button(textLabel, 'obs-contract-secondary');
        if (working.completed === value) control.classList.add('active');
        control.addEventListener('click', () => {
          working.completed = value;
          saveWhenReady();
          rerender({ localDraft: { ...working } });
        });
        row.appendChild(control);
      }
      root.appendChild(row);
    }

    if ((contract.fields || []).some(field => field.key === 'prompt_count')) {
      const label = document.createElement('span');
      label.className = 'obs-contract-field-label';
      label.textContent = 'Prompts';
      root.appendChild(label);
      const row = document.createElement('div');
      row.className = 'obs-contract-prompt-grid';
      for (const value of [0, 1, 2, 3, 4]) {
        const control = button(value === 4 ? '4+' : String(value), 'obs-contract-mini');
        if (Number(working.prompt_count) === value) control.classList.add('active');
        control.addEventListener('click', () => {
          working.prompt_count = value;
          saveWhenReady();
          rerender({ localDraft: { ...working } });
        });
        row.appendChild(control);
      }
      root.appendChild(row);
    }

    const rubric = (contract.fields || []).find(field => field.key === 'rubric_score');
    if (rubric) {
      const field = document.createElement('label');
      field.className = 'obs-contract-number-field';
      const caption = document.createElement('span');
      caption.textContent = rubric.label || 'Rubric score';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(rubric.min ?? 0);
      input.step = '0.1';
      input.value = working.rubric_score ?? '';
      const saveBtn = button('Save', 'obs-contract-save');
      saveBtn.addEventListener('click', () => {
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < Number(rubric.min ?? 0)) return;
        working.rubric_score = value;
        saveWhenReady();
      });
      field.append(caption, input, saveBtn);
      root.appendChild(field);
    }

    const disposition = dispositionControls({ card, goal, contract, period, date, key, state, noteInput, rerender });
    if (disposition) root.appendChild(disposition);
    root.appendChild(note);
  }

  function renderPerformance(context) {
    const { root, card, goal, contract, date, period, key, state, rerender } = context;
    const current = state.get(key);
    const prior = current?.kind === 'event' ? current.data || {} : {};
    const working = { ...prior };
    const fields = contract.fields || [];
    const { details: note, input: noteInput } = noteDisclosure();

    const prompt = document.createElement('div');
    prompt.className = 'obs-contract-prompt';
    prompt.textContent = contract.label || 'Performance trial';
    root.append(prompt, statusPill(current));

    if (fields.length === 1 && fields[0].key === 'result' && fields[0].kind === 'enum') {
      const row = document.createElement('div');
      row.className = 'obs-contract-action-row obs-contract-primary-row';
      for (const result of fields[0].values || []) {
        const control = button(result === 'met' ? 'Met' : 'Not Met', result === 'met' ? 'is-met' : 'is-not-met');
        if (working.result === result) control.classList.add('active');
        control.addEventListener('click', () => save(card, goal, contract, {
          action: 'save', student_code: goal.student_code, goal_code: goal.code,
          date, event_key: key, class_period: period || null, data: { result },
          note: noteInput.value.trim(),
        }, state, rerender));
        row.appendChild(control);
      }
      root.appendChild(row);
    } else if (fields.length === 1 && fields[0].key === 'inappropriate_topic_or_comment_occurred') {
      const row = document.createElement('div');
      row.className = 'obs-contract-action-row obs-contract-primary-row';
      for (const [value, label, className] of [[false, 'No inappropriate topic/comment', 'is-met'], [true, 'Occurred', 'is-not-met']]) {
        const control = button(label, className);
        if (working.inappropriate_topic_or_comment_occurred === value) control.classList.add('active');
        control.addEventListener('click', () => save(card, goal, contract, {
          action: 'save', student_code: goal.student_code, goal_code: goal.code,
          date, event_key: key, class_period: period || null,
          data: { inappropriate_topic_or_comment_occurred: value }, note: noteInput.value.trim(),
        }, state, rerender));
        row.appendChild(control);
      }
      root.appendChild(row);
    } else {
      const numericFields = fields.filter(field => ['integer', 'number'].includes(field.kind));
      const inputs = new Map();
      const grid = document.createElement('div');
      grid.className = 'obs-contract-number-grid';
      for (const field of numericFields) {
        const label = document.createElement('label');
        const caption = document.createElement('span');
        caption.textContent = field.label || field.key;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(field.min ?? 0);
        if (field.max != null) input.max = String(field.max);
        input.step = field.kind === 'integer' ? '1' : '0.1';
        input.value = working[field.key] ?? '';
        inputs.set(field.key, input);
        label.append(caption, input);
        grid.appendChild(label);
      }
      root.appendChild(grid);

      const optionalText = fields.find(field => field.kind === 'optional_text');
      let supportInput = null;
      if (optionalText) {
        const label = document.createElement('label');
        label.className = 'obs-contract-text-field';
        const caption = document.createElement('span');
        caption.textContent = optionalText.label || 'Support level';
        supportInput = document.createElement('input');
        supportInput.type = 'text';
        supportInput.value = working[optionalText.key] || '';
        label.append(caption, supportInput);
        root.appendChild(label);
      }

      const saveBtn = button('Save trial', 'obs-contract-save');
      saveBtn.addEventListener('click', () => {
        const data = {};
        for (const field of numericFields) {
          const value = Number(inputs.get(field.key)?.value);
          if (!Number.isFinite(value)) return;
          data[field.key] = value;
        }
        if (optionalText && supportInput?.value.trim()) data[optionalText.key] = supportInput.value.trim();
        save(card, goal, contract, {
          action: 'save', student_code: goal.student_code, goal_code: goal.code,
          date, event_key: key, class_period: period || null, data,
          note: noteInput.value.trim(),
        }, state, rerender);
      });
      root.appendChild(saveBtn);
    }

    const disposition = dispositionControls({ card, goal, contract, period, date, key, state, noteInput, rerender });
    if (disposition) root.appendChild(disposition);
    root.appendChild(note);
  }

  function renderNumericComposite(context) {
    const { root, card, goal, contract, date, period, key, state, rerender } = context;
    const current = state.get(key);
    const prior = current?.kind === 'event' ? current.data || {} : {};
    const working = { ...prior };
    const { details: note, input: noteInput } = noteDisclosure();

    const prompt = document.createElement('div');
    prompt.className = 'obs-contract-prompt';
    prompt.textContent = contract.label || 'Composite performance';
    root.append(prompt, statusPill(current));

    const latency = (contract.fields || []).find(field => field.key === 'start_latency_minutes');
    if (latency) {
      const label = document.createElement('label');
      label.className = 'obs-contract-number-field';
      const caption = document.createElement('span');
      caption.textContent = latency.label;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(latency.min ?? 0);
      input.step = '1';
      input.value = working.start_latency_minutes ?? '';
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (Number.isFinite(value)) working.start_latency_minutes = value;
      });
      label.append(caption, input);
      root.appendChild(label);
    }

    if ((contract.fields || []).some(field => field.key === 'prompt_count')) {
      const caption = document.createElement('span');
      caption.className = 'obs-contract-field-label';
      caption.textContent = 'Prompts';
      root.appendChild(caption);
      const row = document.createElement('div');
      row.className = 'obs-contract-prompt-grid';
      for (const value of [0, 1, 2, 3, 4]) {
        const control = button(value === 4 ? '4+' : String(value), 'obs-contract-mini');
        if (Number(working.prompt_count) === value) control.classList.add('active');
        control.addEventListener('click', () => {
          working.prompt_count = value;
          const latencyValue = Number(root.querySelector('.obs-contract-number-field input')?.value);
          if (Number.isFinite(latencyValue)) working.start_latency_minutes = latencyValue;
          if (Number.isFinite(Number(working.start_latency_minutes))) {
            save(card, goal, contract, {
              action: 'save', student_code: goal.student_code, goal_code: goal.code,
              date, event_key: key, class_period: period || null, data: working,
              note: noteInput.value.trim(),
            }, state, rerender);
          } else {
            rerender({ localDraft: { ...working } });
          }
        });
        row.appendChild(control);
      }
      root.appendChild(row);
    }

    const disposition = dispositionControls({ card, goal, contract, period, date, key, state, noteInput, rerender });
    if (disposition) root.appendChild(disposition);
    root.appendChild(note);
  }

  function injectStyles() {
    if (document.getElementById('obs-nq2-styles')) return;
    const style = document.createElement('style');
    style.id = 'obs-nq2-styles';
    style.textContent = `
      #observationCenterApp .obs-contract-root{display:grid;gap:10px;padding:4px 0 2px}
      #observationCenterApp .obs-contract-prompt{font-size:13px;font-weight:750;line-height:1.4;color:rgba(240,255,250,.9)}
      #observationCenterApp .obs-contract-frequency-head,#observationCenterApp .obs-contract-slot-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
      #observationCenterApp .obs-contract-frequency-head{font-size:13px;margin-bottom:1px}
      #observationCenterApp .obs-contract-slot{display:grid;gap:8px;padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:rgba(255,255,255,.025)}
      #observationCenterApp .obs-contract-action-row{display:flex;gap:7px;flex-wrap:wrap}
      #observationCenterApp .obs-contract-primary-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
      #observationCenterApp .obs-contract-btn{justify-content:center;min-width:0;padding:9px 11px}
      #observationCenterApp .obs-contract-btn.is-met.active,#observationCenterApp .obs-contract-btn.is-met:hover{border-color:#22c55e;background:rgba(34,197,94,.14);color:#bbf7d0}
      #observationCenterApp .obs-contract-btn.is-not-met.active,#observationCenterApp .obs-contract-btn.is-not-met:hover{border-color:#ef4444;background:rgba(239,68,68,.12);color:#fecaca}
      #observationCenterApp .obs-contract-btn.active{border-color:rgba(34,197,94,.65);background:rgba(34,197,94,.11)}
      #observationCenterApp .obs-contract-status-pill{justify-self:start;padding:2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.1);font-size:10px;font-weight:800;color:rgba(240,255,250,.6)}
      #observationCenterApp .obs-contract-status-pill.is-met{border-color:rgba(34,197,94,.3);background:rgba(34,197,94,.09);color:#bbf7d0}
      #observationCenterApp .obs-contract-status-pill.is-not-met{border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.08);color:#fecaca}
      #observationCenterApp .obs-contract-status-pill.is-recorded{color:#bfdbfe;border-color:rgba(59,130,246,.25);background:rgba(59,130,246,.07)}
      #observationCenterApp .obs-contract-component{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 9px;border:1px solid rgba(255,255,255,.075);border-radius:10px;font-size:12px}
      #observationCenterApp .obs-contract-mini-row{display:flex;gap:5px}
      #observationCenterApp .obs-contract-mini{min-height:34px;padding:5px 8px;font-size:11px}
      #observationCenterApp .obs-contract-prompt-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
      #observationCenterApp .obs-contract-field-label{font-size:11px;font-weight:800;color:rgba(240,255,250,.62);text-transform:uppercase;letter-spacing:.04em}
      #observationCenterApp .obs-contract-number-field{display:grid;grid-template-columns:minmax(0,1fr) 90px auto;gap:8px;align-items:center;font-size:12px}
      #observationCenterApp .obs-contract-number-field input,#observationCenterApp .obs-contract-number-grid input,#observationCenterApp .obs-contract-text-field input{width:100%;box-sizing:border-box;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(0,0,0,.22);color:inherit}
      #observationCenterApp .obs-contract-number-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      #observationCenterApp .obs-contract-number-grid label,#observationCenterApp .obs-contract-text-field{display:grid;gap:5px;font-size:11px;font-weight:700;color:rgba(240,255,250,.68)}
      #observationCenterApp .obs-contract-note,#observationCenterApp .obs-contract-disposition{border:1px solid rgba(255,255,255,.075);border-radius:9px;background:rgba(255,255,255,.018)}
      #observationCenterApp .obs-contract-note>summary,#observationCenterApp .obs-contract-disposition>summary{cursor:pointer;padding:7px 9px;font-size:11px;font-weight:750;color:rgba(240,255,250,.58);list-style-position:inside}
      #observationCenterApp .obs-contract-note .obs-note-input{width:calc(100% - 18px);margin:0 9px 9px}
      #observationCenterApp .obs-contract-disposition .obs-contract-action-row,#observationCenterApp .obs-contract-disposition .obs-contract-help{margin:0 9px 9px}
      #observationCenterApp .obs-contract-help{font-size:11px;color:rgba(240,255,250,.55)}
      #observationCenterApp .obs-card-cat-badge[data-contract-badge=true]{background:rgba(34,197,94,.10);color:#86efac}
      @media(max-width:560px){#observationCenterApp .obs-contract-primary-row,#observationCenterApp .obs-contract-number-grid{grid-template-columns:1fr}#observationCenterApp .obs-contract-component{grid-template-columns:1fr}#observationCenterApp .obs-contract-number-field{grid-template-columns:1fr}#observationCenterApp .obs-contract-prompt-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  async function enhanceCard(card) {
    if (!(card instanceof HTMLElement) || card.dataset.obsNq2Enhanced === 'true') return;
    const wrapper = card.closest('.obs-center-capture-card');
    const goalCode = wrapper?.dataset.goalCode?.trim().toUpperCase();
    const goal = bootstrap.getGoal(goalCode);
    const contract = goal?.observation_config?.evidence_contract;
    if (!goal || !contract || contract.capture_source !== 'observation_center') return;

    card.dataset.obsNq2Enhanced = 'true';
    card.dataset.obs9bEnhanced = 'true'; // contract layer owns this card's quick-capture UI
    card.classList.add('obs-center-quick-capture', 'obs-center-contract-capture');

    const badge = card.querySelector('.obs-card-cat-badge');
    if (badge) {
      badge.textContent = String(contract.event_type || 'evidence').replace(/_/g, ' ');
      badge.dataset.contractBadge = 'true';
    }

    // Remove the legacy date-wide disposition controls. Contract dispositions
    // are event-keyed so one high-frequency slot cannot erase another slot.
    card.querySelectorAll('[data-disposition]').forEach(control => {
      const wrapperEl = control.closest('.obs-no-opp-btns');
      if (wrapperEl) wrapperEl.remove();
    });

    const body = card.querySelector('.obs-card-body');
    if (!body) return;
    [...body.children].forEach(child => {
      if (/^Unknown category:/i.test(child.textContent?.trim() || '')) child.remove();
    });

    const indicator = card.querySelector('.obs-save-indicator');
    const root = document.createElement('div');
    root.className = 'obs-contract-root';
    if (indicator) body.insertBefore(root, indicator);
    else body.appendChild(root);

    const date = selectedDate();
    const period = selectedPeriod(card);
    const loaded = await loadState(goal, date);
    const state = loaded.state;
    let draft = null;

    const rerender = (options = {}) => {
      if (options.localDraft) draft = options.localDraft;
      root.innerHTML = '';
      const key = eventKey(contract, period, 1);
      const context = { root, card, goal, contract, date, period, key, state, rerender, draft };

      if (contract.high_frequency === true || Number(contract.events_per_period) > 1) {
        renderHighFrequencyOpportunity(context);
      } else if (contract.event_type === 'opportunity') {
        renderOpportunity(context);
      } else if (contract.event_type === 'composite' && Array.isArray(contract.components) && contract.components.length) {
        renderComponentComposite(context);
      } else if (contract.event_type === 'composite') {
        renderNumericComposite(context);
      } else if (contract.event_type === 'count') {
        renderCount(context);
      } else if (contract.event_type === 'performance_trial') {
        renderPerformance(context);
      } else {
        const message = document.createElement('p');
        message.className = 'obs-contract-help';
        message.textContent = `Capture contract ${contract.event_type} is not available in OBS-NQ2.`;
        root.appendChild(message);
      }

      if (!(contract.high_frequency === true || Number(contract.events_per_period) > 1)) {
        const current = state.get(key);
        if (current?.kind === 'disposition') {
          setCardStatus(card, current.disposition === 'absent' ? 'Absent' : 'No Opportunity', true);
        } else if (current) {
          setCardStatus(card, 'Recorded', true);
        }
      }

      if (loaded.legacyPresent && !state.size) {
        const legacy = document.createElement('p');
        legacy.className = 'obs-contract-help';
        legacy.textContent = 'An older-format observation is already recorded for this date. Saving here will upgrade that one observation to the reviewed evidence contract.';
        root.prepend(legacy);
      }
    };

    rerender();

    const header = card.querySelector('.obs-card-header');
    if (header?.getAttribute('aria-expanded') !== 'true') header.click();
  }

  function scan(root = document) {
    root.querySelectorAll?.('.obs-center-capture-card > .obs-goal-card').forEach(card => {
      enhanceCard(card).catch(error => console.warn('[obs-nq2] card enhancement failed:', error.message));
    });
  }

  function scheduleScan() {
    if (scanQueued) return;
    scanQueued = true;
    queueMicrotask(() => {
      scanQueued = false;
      scan();
    });
  }

  injectStyles();
  const observer = new MutationObserver(scheduleScan);
  const app = document.getElementById('observationCenterApp');
  if (app) observer.observe(app, { childList: true, subtree: true });
  scan();
  syncQueue();
  const syncInterval = setInterval(syncQueue, 60_000);

  window.RCObsNQ2Capture = Object.freeze({
    scan,
    syncQueue,
    cleanup() {
      clearInterval(syncInterval);
      observer.disconnect();
    },
  });
})();
