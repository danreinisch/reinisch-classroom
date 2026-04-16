/**
 * HTML Assignment postMessage Bridge
 *
 * Listens for `rc-assignment-submit` and `rc-assignment-autosave` postMessages
 * from HTML assignment iframes.
 * On a valid message the bridge forwards the answers to the existing
 * `student-submit-answer` Netlify function, which handles:
 *   - Creating / updating the submissions record
 *   - Upserting submission_answers rows (auto-scored for mcq/boolean/multi)
 *   - Computing score_auto / score_total on the parent submission
 *
 * postMessage contract (sent by the HTML assignment iframe):
 * {
 *   type:        'rc-assignment-submit'    // final submit – marks assignment Submitted
 *             or 'rc-assignment-autosave', // in-progress save – keeps status In Progress
 *   instance_id: '<uuid>',                 // optional – falls back to the one
 *                                          // passed to initHtmlAssignmentBridge()
 *   answers:     { [itemRef]: value },     // required – at least one entry
 *   scores:      { correct, total }        // optional – informational only;
 *                                          // server re-computes authoritative score
 * }
 *
 * Usage:
 *   const cleanup = initHtmlAssignmentBridge(instanceId, studentCode);
 *   // later, when the panel closes:
 *   cleanup();
 */

const LOG_PREFIX = '[html-assignment-bridge]';

/** Debounce delay (ms) for autosave calls to avoid flooding the server. */
const AUTOSAVE_DEBOUNCE_MS = 4000;

/**
 * Validate the raw postMessage payload.
 *
 * @param {*} data - The `event.data` from a MessageEvent
 * @param {string} expectedInstanceId - The instance ID the bridge was inited with
 * @returns {{ valid: boolean, reason?: string }}
 */
function validatePayload(data, expectedInstanceId) {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'payload must be an object' };
  }

  if (data.type !== 'rc-assignment-submit' && data.type !== 'rc-assignment-autosave') {
    return { valid: false, reason: `unexpected type: ${data.type}` };
  }

  // If the iframe supplies an instance_id it must match what we were initialised with
  if (data.instance_id !== undefined && data.instance_id !== expectedInstanceId) {
    return { valid: false, reason: 'instance_id mismatch' };
  }

  if (!data.answers || typeof data.answers !== 'object' || Array.isArray(data.answers)) {
    return { valid: false, reason: 'answers must be a non-array object' };
  }

  if (Object.keys(data.answers).length === 0) {
    return { valid: false, reason: 'answers object is empty' };
  }

  return { valid: true };
}

/**
 * Initialise the postMessage bridge for a single HTML assignment panel.
 *
 * @param {string} instanceId  - assignment_instance UUID
 * @param {string} studentCode - student authentication code (from sessionStorage)
 * @returns {Function} cleanup – call when the panel is closed to remove the listener
 */
export function initHtmlAssignmentBridge(instanceId, studentCode) {
  if (!instanceId || !studentCode) {
    console.warn(LOG_PREFIX, 'Missing instanceId or studentCode – bridge not started');
    return () => {};
  }

  let autosaveTimer = null;
  let lastKnownAnswers = null;

  async function sendToServer(payload, attempt = 1) {
    const MAX_RETRIES = 3;
    try {
      const response = await fetch('/.netlify/functions/student-submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error(LOG_PREFIX, 'Submission failed:', response.status, err.error || '');
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          console.log(LOG_PREFIX, `Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(r => setTimeout(r, delay));
          return sendToServer(payload, attempt + 1);
        }
        return;
      }

      const label = payload.submit ? 'Submission' : 'Autosave';
      console.log(LOG_PREFIX, `${label} recorded for instance`, instanceId);
    } catch (err) {
      console.error(LOG_PREFIX, 'Network error during submission:', err);
      if (attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.log(LOG_PREFIX, `Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, delay));
        return sendToServer(payload, attempt + 1);
      }
    }
  }

  async function handleMessage(event) {
    const data = event.data;

    // Only process known message types
    if (!data || (data.type !== 'rc-assignment-submit' && data.type !== 'rc-assignment-autosave')) return;

    console.log(LOG_PREFIX, `Received ${data.type} from`, event.origin);

    const { valid, reason } = validatePayload(data, instanceId);
    if (!valid) {
      console.warn(LOG_PREFIX, 'Invalid payload – ignored:', reason);
      return;
    }

    const isAutosave = data.type === 'rc-assignment-autosave';

    const payload = {
      instance_id: instanceId,
      student_code: studentCode,
      answers: data.answers,
      submit: !isAutosave,
    };

    // Track the most recent answers for flush-on-cleanup
    lastKnownAnswers = data.answers;

    if (isAutosave) {
      // Debounce autosave calls to avoid flooding the server
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        autosaveTimer = null;
        sendToServer(payload);
      }, AUTOSAVE_DEBOUNCE_MS);
    } else {
      // Final submit – send immediately (cancel any pending autosave first)
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      await sendToServer(payload);
    }
  }

  window.addEventListener('message', handleMessage);
  console.log(LOG_PREFIX, 'Bridge active for instance', instanceId);

  return function cleanup() {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
      // Flush the pending save before removing the listener
      if (lastKnownAnswers && Object.keys(lastKnownAnswers).length > 0) {
        sendToServer({
          instance_id: instanceId,
          student_code: studentCode,
          answers: lastKnownAnswers,
          submit: false,
        });
      }
    }
    window.removeEventListener('message', handleMessage);
    console.log(LOG_PREFIX, 'Bridge removed for instance', instanceId);
  };
}
