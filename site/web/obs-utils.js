/**
 * obs-utils.js
 * Canonical observation-notes parsing and formatting utilities.
 * Used by tc-observation.js, tc-students.js, tc-data.js, and tc-reporting.js.
 *
 * Notes prefix format written by buildObservationNotes():
 *   [obs:session_outcome:met|not_met|not_addressed|not_applicable]
 *   [obs:tally:3/5]
 *   [obs:prompt_count:2]
 *   [obs:checklist:Behavior A=met,Behavior B=not_met]
 */

/**
 * Parse the [obs:category:payload] prefix from a progress entry's notes string.
 * @param {string} notes - The notes field from a progress entry
 * @returns {{ category: string, rawData: string, userNote: string } | null}
 */
export function parseObservationNotes(notes) {
  if (!notes) return null;
  const m = notes.match(/^\[obs:(\w+):([^\]]*)\]/);
  if (!m) return null;
  return { category: m[1], rawData: m[2], userNote: notes.slice(m[0].length).trim() };
}

/**
 * Format an observation progress entry value as a human-readable display string.
 * @param {{ value: any, notes: string }} entry - A progress entry
 * @param {Object} [goal] - Optional goal object for context
 * @returns {string} - e.g. "Met", "3 of 5 opportunities (60%)", "2 prompts", "2/3 behaviors met"
 */
export function formatObservationValue(entry, goal) { // eslint-disable-line no-unused-vars
  const parsed = parseObservationNotes(entry.notes);
  if (!parsed) return entry.value != null ? String(parseFloat(entry.value).toFixed(0)) : '—';

  switch (parsed.category) {
    case 'session_outcome': {
      switch (parsed.rawData) {
        case 'met': return 'Met';
        case 'not_met': return 'Not Met';
        case 'not_addressed': return 'Not Addressed';
        case 'na': return 'Not Addressed'; // legacy alias
        case 'not_applicable': return 'N/A';
        default: return parsed.rawData;
      }
    }
    case 'tally': {
      const parts = parsed.rawData.split('/');
      return parts.length === 2
        ? `${parts[0]} of ${parts[1]} (${entry.value != null ? parseFloat(entry.value).toFixed(0) + '%' : '—'})`
        : `${entry.value}%`;
    }
    case 'prompt_count': {
      const n = parseFloat(parsed.rawData);
      return `${parsed.rawData} prompt${n !== 1 ? 's' : ''}`;
    }
    case 'checklist': {
      if (parsed.rawData === 'not_addressed') return 'Not Addressed';
      const items = parsed.rawData ? parsed.rawData.split(',') : [];
      const metCount = items.filter(i => i.includes('=met')).length;
      return `${metCount}/${items.length} behaviors met`;
    }
    default:
      return entry.value != null ? `${parseFloat(entry.value).toFixed(0)}%` : '—';
  }
}

/**
 * Build the notes string for saving an observation progress entry.
 * MUST NOT use escapeHtml() inside the [obs:...] prefix — store raw text so
 * the parser on the read side sees the original behavior names.
 * @param {string} category - e.g. 'session_outcome', 'tally', 'prompt_count', 'behavior_checklist'
 * @param {Object} responseData - Category-specific data
 * @param {string} [noteText] - Optional user note
 * @returns {string}
 */
export function buildObservationNotes(category, responseData, noteText) {
  let prefix = '';
  const { response, successful, opportunities, promptCount, checkedBehaviors, subBehaviors } = responseData;

  if (category === 'session_outcome') {
    prefix = `[obs:session_outcome:${response || 'not_addressed'}]`;
  } else if (category === 'tally') {
    prefix = `[obs:tally:${successful || 0}/${opportunities || 0}]`;
  } else if (category === 'prompt_count') {
    prefix = `[obs:prompt_count:${promptCount != null ? promptCount : 0}]`;
  } else if (category === 'behavior_checklist') {
    const parts = (subBehaviors || []).map((sb, i) => {
      const checked = checkedBehaviors && checkedBehaviors[i];
      return sb + '=' + (checked ? 'met' : 'not_met');
    });
    prefix = `[obs:checklist:${parts.join(',')}]`;
  }

  return noteText ? `${prefix} ${noteText}` : prefix;
}
