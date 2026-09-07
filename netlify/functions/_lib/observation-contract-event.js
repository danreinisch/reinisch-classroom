'use strict';

const registry = require('../../../site/data/observation-evidence-contracts-2026-27.json');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STUDENT_PATTERN = /^S\d{3}$/;
const GOAL_PATTERN = /^S\d{3}\.CG\d+$/;
const EVENT_KEY_PATTERN = /^[A-Za-z0-9 _.:|/-]{1,180}$/;
const DISPOSITIONS = new Set(['absent', 'no_opportunity']);

function text(value, max = 4000) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStudentCode(value) {
  const code = text(value, 20).toUpperCase();
  return STUDENT_PATTERN.test(code) ? code : '';
}

function normalizeGoalCode(value) {
  const code = text(value, 40).toUpperCase();
  return GOAL_PATTERN.test(code) ? code : '';
}

function getReviewedContract(goalCode) {
  const normalized = normalizeGoalCode(goalCode);
  const contract = registry?.contracts?.[normalized];
  if (!contract || contract.capture_source !== 'observation_center') return null;
  return JSON.parse(JSON.stringify(contract));
}

function normalizeEventKey(value) {
  const key = text(value, 180);
  return EVENT_KEY_PATTERN.test(key) ? key : '';
}

function normalizeDate(value) {
  const date = text(value, 10);
  return DATE_PATTERN.test(date) ? date : '';
}

function normalizeBoolean(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return null;
}

function normalizeScalar(field, value) {
  const kind = text(field?.kind, 40);

  if (kind === 'enum') {
    const raw = text(value, 100);
    const allowed = Array.isArray(field?.values)
      ? field.values.map(item => String(item))
      : [];
    return allowed.includes(raw) ? raw : null;
  }

  if (kind === 'boolean') return normalizeBoolean(value);

  if (kind === 'integer' || kind === 'number') {
    const numeric = finite(value);
    if (numeric === null) return null;
    if (kind === 'integer' && !Number.isInteger(numeric)) return null;
    if (field?.min != null && numeric < Number(field.min)) return null;
    if (field?.max != null && numeric > Number(field.max)) return null;
    return numeric;
  }

  if (kind === 'optional_text') {
    return text(value, 300);
  }

  return null;
}

function normalizeContractData(contract, rawData) {
  if (!contract || !rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return { ok: false, error: 'data must be an object' };
  }

  const data = {};

  for (const field of contract.fields || []) {
    const value = normalizeScalar(field, rawData[field.key]);
    if (field.kind !== 'optional_text' && value === null) {
      return { ok: false, error: `invalid or missing field: ${field.key}` };
    }
    if (field.kind === 'optional_text') {
      if (value) data[field.key] = value;
    } else {
      data[field.key] = value;
    }
  }

  if (Array.isArray(contract.components) && contract.components.length > 0) {
    data.components = {};
    for (const component of contract.components) {
      const raw = rawData?.components?.[component.key] ?? rawData?.[component.key];
      if (component.kind !== 'met_not_met') {
        return { ok: false, error: `unsupported component kind: ${component.kind}` };
      }
      const value = text(raw, 20);
      if (!['met', 'not_met'].includes(value)) {
        if (component.required !== false) {
          return { ok: false, error: `invalid or missing component: ${component.key}` };
        }
        continue;
      }
      data.components[component.key] = value;
    }
  }

  return { ok: true, data };
}

function compareRule(data, rule) {
  if (!rule || typeof rule !== 'object') return null;
  const value = data?.[rule.field];
  const expected = rule.value;

  switch (rule.operator) {
    case 'eq': return value === expected;
    case 'lte': return finite(value) !== null && finite(value) <= Number(expected);
    case 'gte': return finite(value) !== null && finite(value) >= Number(expected);
    default: return null;
  }
}

function evaluateSuccess(contract, data) {
  if (!contract) return null;

  if (contract.event_type === 'opportunity') {
    return data.result === 'met' ? true : data.result === 'not_met' ? false : null;
  }

  if (contract.event_type === 'composite' && Array.isArray(contract.components) && contract.components.length) {
    const required = contract.components.filter(component => component.required !== false);
    if (!required.length) return null;
    return required.every(component => data?.components?.[component.key] === 'met');
  }

  const rule = contract.success_rule;
  if (!rule) {
    if (data.result === 'met') return true;
    if (data.result === 'not_met') return false;
    return null;
  }

  if (rule.operator === 'all_required_met') {
    const required = (contract.components || []).filter(component => component.required !== false);
    return required.length
      ? required.every(component => data?.components?.[component.key] === 'met')
      : null;
  }

  if (rule.operator === 'all') {
    const results = (rule.rules || []).map(item => compareRule(data, item));
    return results.length && results.every(result => result === true)
      ? true
      : results.some(result => result === false)
        ? false
        : null;
  }

  if (rule.operator === 'ratio_at_least') {
    const numerator = finite(data?.[rule.numerator]);
    const denominator = finite(data?.[rule.denominator]);
    if (numerator === null || denominator === null || denominator <= 0) return null;
    return numerator / denominator >= Number(rule.value);
  }

  return compareRule(data, rule);
}

function calculateContractValue(contract, data) {
  if (!contract) return null;

  if (contract.event_type === 'count') {
    if (Object.prototype.hasOwnProperty.call(data, 'rubric_score')) {
      return finite(data.rubric_score);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'prompt_count')) {
      return finite(data.prompt_count);
    }
  }

  if (contract.event_type === 'performance_trial') {
    if (Object.prototype.hasOwnProperty.call(data, 'successful_steps') &&
        Object.prototype.hasOwnProperty.call(data, 'total_steps')) {
      const successful = finite(data.successful_steps);
      const total = finite(data.total_steps);
      if (successful === null || total === null || total <= 0 || successful > total) return null;
      return Math.round((successful / total) * 1000) / 10;
    }
  }

  const success = evaluateSuccess(contract, data);
  if (success === true) return 100;
  if (success === false) return 0;

  return null;
}

function buildContractObservationNotes({ goalCode, eventKey, contract, data, classPeriod, noteText }) {
  const success = evaluateSuccess(contract, data);
  const value = calculateContractValue(contract, data);
  const payload = {
    version: 1,
    goal_code: normalizeGoalCode(goalCode),
    event_key: normalizeEventKey(eventKey),
    event_type: contract?.event_type || null,
    data,
    success,
    value,
  };
  const prefix = `[obs:contract:${encodeURIComponent(JSON.stringify(payload))}]`;
  const period = text(classPeriod, 120);
  const periodMarker = period ? ` [obs-period:${encodeURIComponent(period)}]` : '';
  const note = text(noteText, 1000);
  return `${prefix}${periodMarker}${note ? ` ${note}` : ''}`;
}

function parseContractObservationNotes(notes) {
  const source = text(notes, 8000);
  const match = source.match(/^\[obs:contract:([^\]]+)\]/);
  if (!match) return null;

  try {
    const payload = JSON.parse(decodeURIComponent(match[1]));
    const eventKey = normalizeEventKey(payload?.event_key);
    const goalCode = normalizeGoalCode(payload?.goal_code);
    if (!eventKey || !goalCode) return null;

    const remainder = source.slice(match[0].length).trim();
    const periodMatch = remainder.match(/^\[obs-period:([^\]]+)\](?:\s+|$)/);
    let classPeriod = null;
    let userNote = remainder;
    if (periodMatch) {
      classPeriod = decodeURIComponent(periodMatch[1]).trim() || null;
      userNote = remainder.slice(periodMatch[0].length).trim();
    }

    return { ...payload, event_key: eventKey, goal_code: goalCode, classPeriod, userNote };
  } catch {
    return null;
  }
}

function buildContractDispositionNotes({ disposition, eventKey, classPeriod, noteText }) {
  const normalizedDisposition = text(disposition, 40);
  const normalizedEventKey = normalizeEventKey(eventKey);
  const period = text(classPeriod, 120);
  if (!DISPOSITIONS.has(normalizedDisposition) || !normalizedEventKey || !period) return '';

  const prefix = `[obs:disposition:${normalizedDisposition}|period=${encodeURIComponent(period)}]`;
  const eventMarker = `[obs-contract-event:${encodeURIComponent(normalizedEventKey)}]`;
  const note = text(noteText, 1000);
  return `${prefix} ${eventMarker}${note ? ` ${note}` : ''}`;
}

function parseContractDispositionNotes(notes) {
  const source = text(notes, 8000);
  const dispositionMatch = source.match(/^\[obs:disposition:(absent|no_opportunity)\|period=([^\]]+)\]/);
  if (!dispositionMatch) return null;
  const remainder = source.slice(dispositionMatch[0].length).trim();
  const eventMatch = remainder.match(/^\[obs-contract-event:([^\]]+)\]/);
  if (!eventMatch) return null;

  try {
    const eventKey = normalizeEventKey(decodeURIComponent(eventMatch[1]));
    const classPeriod = decodeURIComponent(dispositionMatch[2]).trim();
    if (!eventKey || !classPeriod) return null;
    return {
      disposition: dispositionMatch[1],
      event_key: eventKey,
      classPeriod,
      userNote: remainder.slice(eventMatch[0].length).trim(),
    };
  } catch {
    return null;
  }
}

module.exports = {
  registry,
  DATE_PATTERN,
  DISPOSITIONS,
  normalizeStudentCode,
  normalizeGoalCode,
  normalizeEventKey,
  normalizeDate,
  getReviewedContract,
  normalizeContractData,
  evaluateSuccess,
  calculateContractValue,
  buildContractObservationNotes,
  parseContractObservationNotes,
  buildContractDispositionNotes,
  parseContractDispositionNotes,
};
