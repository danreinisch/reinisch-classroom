/** Optional dictation for assignment answers. Audio is handled by the browser;
 * RC only inserts final text through the writing field's existing input events. */
(function () {
  'use strict';

  const FIELD_SELECTOR = 'textarea, input[type="text"][data-question-id], [data-qref] input[type="text"], input[type="text"][name^="Q"], input[type="text"][name^="question"]';
  const STYLESHEET = '/assets/css/assignment-dictation.css?v=20260906-dictation1';
  const MIC_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
  let nextId = 0;

  function create(panel, options = {}) {
    const doc = panel.ownerDocument;
    const win = doc.defaultView;
    const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    const fields = new Map();
    const scopes = new Map();
    const frames = new Map();
    let active = null;
    let destroyed = false;

    let unavailable = '';
    if (!win.isSecureContext) unavailable = 'Dictation needs a secure connection. You can still type.';
    else if (typeof Recognition !== 'function') unavailable = 'Dictation is unavailable in this browser. You can still type or use your device’s dictation.';
    else {
      const policy = doc.permissionsPolicy || doc.featurePolicy;
      if (policy && !policy.allowsFeature('microphone')) {
        unavailable = 'Microphone access is blocked for this page. You can still type.';
      }
    }

    const help = doc.createElement('details');
    help.className = 'st-dictation-help';
    const summary = doc.createElement('summary');
    summary.textContent = 'About voice typing';
    const explanation = doc.createElement('p');
    explanation.textContent = 'Choose Dictate beside your answer, speak, then choose Stop. Check and edit the words before submitting. Your browser may process speech online. Reinisch Classroom does not record or save audio.';
    help.append(summary, explanation);
    const header = panel.querySelector('.st-panel-header');
    if (header) header.after(help);
    else panel.prepend(help);

    function canUse(field) {
      if (destroyed || doc.hidden || !panel.isConnected || !field.isConnected || field.disabled || field.readOnly || field.matches(':disabled')) return false;
      if (options.canEdit && !options.canEdit()) return false;
      const scope = fields.get(field)?.scope;
      if (!scope || !scope.contains(field)) return false;
      if (field.ownerDocument !== doc) {
        const frame = field.ownerDocument.defaultView.frameElement;
        if (!frame || !panel.contains(frame) || !frame.getClientRects().length || win.getComputedStyle(frame).visibility === 'hidden') return false;
      }
      if (field.closest('[hidden], [inert]') || !field.getClientRects().length) return false;
      return field.ownerDocument.defaultView.getComputedStyle(field).visibility !== 'hidden';
    }

    function setStatus(control, text) {
      control.status.textContent = text;
    }

    function finish(session, message) {
      if (active !== session) return;
      active = null; // Invalidate callbacks before abort() can emit more events.
      win.clearTimeout(session.timer);
      session.control.button.innerHTML = MIC_ICON + '<span>Dictate</span>';
      session.control.button.setAttribute('aria-pressed', 'false');
      session.control.button.disabled = !!unavailable;
      session.control.row.classList.remove('is-listening');
      session.control.preview.textContent = '';
      if (message) setStatus(session.control, message);
    }

    function cancel(message = 'Dictation stopped. Check your words.') {
      if (!active) return;
      const session = active;
      finish(session, message);
      try { session.recognition.abort(); } catch { /* Already ended. */ }
    }

    function stop() {
      if (!active || active.stopping) return;
      const session = active;
      session.stopping = true;
      session.control.button.disabled = true;
      session.control.button.querySelector('span').textContent = 'Stopping…';
      setStatus(session.control, 'Finishing your words…');
      win.clearTimeout(session.timer);
      session.timer = win.setTimeout(() => {
        if (active === session) cancel('Dictation stopped. Check that all your words are here.');
      }, 2000);
      try { session.recognition.stop(); }
      catch { cancel(); }
    }

    function insertFinal(session, rawText) {
      const field = session.control.field;
      if (!canUse(field)) { cancel(); return; }
      // Any edit outside our own input event invalidates the old insertion point.
      if (field.value !== session.value) { cancel('Dictation stopped so you can edit.'); return; }
      const text = String(rawText || '').trim();
      if (!text) return;
      const cursor = Math.min(session.cursor, field.value.length);
      const before = field.value.slice(0, cursor);
      const after = field.value.slice(cursor);
      const leading = before && !/[\s([{"“]$/.test(before) && !/^[,.;:!?)}\]”]/.test(text) ? ' ' : '';
      const trailing = after && !/^[\s,.;:!?)}\]”]/.test(after) ? ' ' : '';
      const addition = leading + text + trailing;
      if (field.maxLength >= 0 && field.value.length + addition.length > field.maxLength) {
        cancel('Those words exceed this answer’s length limit. Shorten the answer or dictate a shorter phrase.');
        return;
      }
      // Collapse a selection at its end, preserving all existing writing.
      field.setRangeText(addition, cursor, cursor, 'end');
      session.cursor = cursor + addition.length;
      session.value = field.value;
      session.inserting = true;
      try {
        const Event = field.ownerDocument.defaultView.Event;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      } finally { session.inserting = false; }
    }

    function start(control) {
      if (active?.control === control) { stop(); return; }
      cancel();
      if (unavailable || !canUse(control.field)) return;
      let recognition;
      try {
        if (options.beforeStart) options.beforeStart();
        win.speechSynthesis?.cancel?.();
        const fieldWin = control.field.ownerDocument.defaultView;
        if (fieldWin !== win) fieldWin.speechSynthesis?.cancel?.();
        recognition = new Recognition();
        recognition.lang = doc.documentElement.lang || 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
      } catch {
        setStatus(control, 'Dictation could not start. You can still type.');
        return;
      }
      const session = {
        recognition, control, seen: new Set(), stopping: false, inserting: false,
        cursor: control.field.selectionEnd ?? control.field.value.length,
        value: control.field.value, timer: null
      };
      active = session;
      control.button.innerHTML = MIC_ICON + '<span>Stop</span>';
      control.button.setAttribute('aria-pressed', 'true');
      control.row.classList.add('is-listening');
      setStatus(control, 'Allow microphone access if asked…');
      session.timer = win.setTimeout(() => {
        if (active === session) cancel('Dictation did not start. Check microphone access and try again.');
      }, 20000);
      recognition.onstart = () => {
        if (active !== session) return;
        if (!canUse(control.field)) { cancel(); return; }
        if (!session.stopping) {
          win.clearTimeout(session.timer);
          setStatus(control, 'Listening… Speak your answer, then choose Stop.');
        }
      };
      recognition.onresult = event => {
        if (active !== session) return;
        let preview = '';
        for (let i = event.resultIndex || 0; i < event.results.length; i++) {
          if (active !== session) return;
          const result = event.results[i];
          if (result.isFinal && !session.seen.has(i)) {
            session.seen.add(i);
            insertFinal(session, result[0]?.transcript);
          } else if (!result.isFinal) preview += (result[0]?.transcript || '') + ' ';
        }
        if (active === session) control.preview.textContent = preview.trim() ? 'Hearing: ' + preview.trim() : '';
      };
      recognition.onerror = event => {
        if (active !== session) return;
        const messages = {
          'not-allowed': 'Microphone access was not allowed. Use your browser’s site settings to allow it, or keep typing.',
          'service-not-allowed': 'Your browser or school settings do not allow dictation. You can still type.',
          'audio-capture': 'No microphone is available. Check your microphone or keep typing.',
          'network': 'Dictation lost its connection. Your text is still here. Try again or keep typing.',
          'no-speech': 'No speech was heard. Choose Dictate to try again, or keep typing.',
          'language-not-supported': 'Dictation is unavailable for this language. You can still type.'
        };
        cancel(messages[event.error] || 'Dictation stopped. Your text is still here. Try again or keep typing.');
      };
      recognition.onend = () => finish(session, 'Dictation stopped. Check and edit your words before submitting.');
      try { recognition.start(); }
      catch { cancel('Dictation could not start. Check microphone access or keep typing.'); }
    }

    function addField(field, scope) {
      if (fields.has(field)) return;
      const fieldDoc = field.ownerDocument;
      const row = fieldDoc.createElement('div');
      row.className = 'st-dictation-controls';
      const button = fieldDoc.createElement('button');
      button.type = 'button';
      button.className = 'st-dictation-btn';
      button.innerHTML = MIC_ICON + '<span>Dictate</span>';
      button.setAttribute('aria-pressed', 'false');
      button.disabled = !!unavailable;
      const id = 'rc-dictation-' + (++nextId);
      const status = fieldDoc.createElement('span');
      status.className = 'st-dictation-status';
      status.id = id;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = unavailable || 'Speak, stop, then check your words.';
      button.setAttribute('aria-describedby', id);
      // Do not alter field IDs/names: existing assignments use them for saving.
      if (field.id) button.setAttribute('aria-controls', field.id);
      const label = field.getAttribute('aria-label') || field.labels?.[0]?.textContent?.trim();
      if (label) button.title = 'Voice typing: ' + label;
      const preview = fieldDoc.createElement('span');
      preview.className = 'st-dictation-preview';
      row.append(button, status, preview);
      field.before(row);
      const control = { field, scope, row, button, status, preview };
      fields.set(field, control);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        start(control);
      });
    }

    function captureAction(event) {
      if (!active || event.target.closest?.('.st-dictation-controls')) return;
      const button = event.target.closest?.('button, input[type="submit"], a');
      if (!button && event.type !== 'submit') return;
      const isSubmit = event.type === 'submit' || (button.form && button.type === 'submit') || /submit/i.test(button.id + ' ' + (button.textContent || button.value || ''));
      if (isSubmit) {
        // Finish recognition first; the student reviews the text and submits again.
        // Never submit automatically or let late words miss the submitted snapshot.
        event.preventDefault();
        event.stopImmediatePropagation();
        stop();
        if (active) setStatus(active.control, 'Finishing dictation. Check your words, then select Submit again.');
      } else cancel();
    }

    function captureInput(event) {
      if (active?.control.field === event.target && !active.inserting) cancel('Dictation stopped so you can edit.');
    }

    function captureSelect(event) {
      if (active?.control.field === event.target && !active.inserting) active.cursor = event.target.selectionEnd;
    }

    function captureKey(event) {
      if (active && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        stop();
      }
    }

    function addScope(scope) {
      if (scopes.has(scope)) return;
      const observer = new win.MutationObserver(refresh);
      observer.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'readonly', 'hidden', 'class', 'style'] });
      scope.addEventListener('click', captureAction, true);
      scope.addEventListener('submit', captureAction, true);
      scope.addEventListener('input', captureInput, true);
      scope.addEventListener('select', captureSelect, true);
      // Capture Escape before the portal's document-level close handler.
      const keyScope = scope.ownerDocument || scope;
      keyScope.addEventListener('keydown', captureKey, true);
      scopes.set(scope, { observer, keyScope });
    }

    function removeScope(scope) {
      const entry = scopes.get(scope);
      if (!entry) return;
      entry.observer.disconnect();
      scope.removeEventListener('click', captureAction, true);
      scope.removeEventListener('submit', captureAction, true);
      scope.removeEventListener('input', captureInput, true);
      scope.removeEventListener('select', captureSelect, true);
      entry.keyScope.removeEventListener('keydown', captureKey, true);
      scopes.delete(scope);
      for (const [field, control] of fields) {
        if (control.scope === scope) { control.row.remove(); fields.delete(field); }
      }
    }

    function loadFrame(frame) {
      const entry = frames.get(frame);
      if (!entry || destroyed) return;
      if (active?.control.scope === entry.scope) cancel();
      if (entry.scope) removeScope(entry.scope);
      entry.scope = null;
      try {
        // Same-origin/srcdoc only. The microphone belongs to the parent page;
        // no permissions or messages are delegated to embedded content.
        const frameDoc = frame.contentDocument;
        if (!frameDoc?.body) return;
        entry.scope = frameDoc.body;
        const link = frameDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL(STYLESHEET, win.location.href).href;
        frameDoc.head.append(link);
        addScope(entry.scope);
      } catch { /* External assignments keep their existing input methods. */ }
      refresh();
    }

    function refresh() {
      if (destroyed) return;
      for (const [frame, entry] of frames) {
        if (!panel.contains(frame)) {
          if (entry.scope) removeScope(entry.scope);
          frame.removeEventListener('load', entry.load);
          frames.delete(frame);
        }
      }
      panel.querySelectorAll('iframe').forEach(frame => {
        if (frames.has(frame)) return;
        const entry = { scope: null, load: () => loadFrame(frame) };
        frames.set(frame, entry);
        frame.addEventListener('load', entry.load);
        loadFrame(frame);
      });
      for (const scope of scopes.keys()) scope.querySelectorAll(FIELD_SELECTOR).forEach(field => addField(field, scope));
      let visible = false;
      for (const [field, control] of fields) {
        if (!field.isConnected || !control.scope.contains(field)) {
          control.row.remove();
          fields.delete(field);
          continue;
        }
        const usable = canUse(field);
        if (control.row.hidden === usable) control.row.hidden = !usable;
        if (usable) visible = true;
      }
      if (help.hidden === visible) help.hidden = !visible;
      if (active && !canUse(active.control.field)) cancel();
    }

    const hide = () => { if (doc.hidden) cancel(); };
    const leave = () => cancel();
    doc.addEventListener('visibilitychange', hide);
    win.addEventListener('pagehide', leave);
    win.addEventListener('blur', leave);
    addScope(panel);
    refresh();

    return {
      cancel,
      destroy() {
        cancel();
        destroyed = true;
        doc.removeEventListener('visibilitychange', hide);
        win.removeEventListener('pagehide', leave);
        win.removeEventListener('blur', leave);
        for (const [frame, entry] of frames) frame.removeEventListener('load', entry.load);
        frames.clear();
        for (const scope of scopes.keys()) removeScope(scope);
        help.remove();
      }
    };
  }

  window.RCAssignmentDictation = { create };
})();
