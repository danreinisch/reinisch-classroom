'use strict';

/**
 * Apply a stored Work mapping JSON file to parsed assignment metadata.
 *
 * Supported mapping shapes:
 *
 * 1. Flat array:
 * [
 *   { "question_id": "q1", "dese": ["11-12.RL.1.A"], "iep": [] }
 * ]
 *
 * qN refers to the Nth parsed assignment item in reading order. This allows
 * a final q19 entry to target a writing prompt after 18 selected-response items.
 *
 * 2. Work auto-mapping format:
 * {
 *   "sections": [
 *     {
 *       "items": [
 *         { "key": "D1.Q1", "dese": [...], "iep": [...] },
 *         { "key": "D4.WP", "dese": [...], "iep": [...] }
 *       ]
 *     }
 *   ]
 * }
 *
 * 3. Canonical server item refs:
 *   1_1
 *   WP_4
 */

function uniq(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(value => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function extractEntries(mapping) {
  if (Array.isArray(mapping)) {
    return mapping;
  }

  if (!mapping || typeof mapping !== 'object') {
    return [];
  }

  if (Array.isArray(mapping.items)) {
    return mapping.items;
  }

  if (Array.isArray(mapping.sections)) {
    return mapping.sections.flatMap(section =>
      Array.isArray(section && section.items) ? section.items : []
    );
  }

  return [];
}

function flattenMeta(meta) {
  const items = [];
  let writingIndex = 0;

  if (meta && Array.isArray(meta.days)) {
    for (const day of meta.days) {
      if (day.type === 'questions' && Array.isArray(day.questions)) {
        for (const question of day.questions) {
          items.push({
            kind: 'question',
            dayNumber: Number(day.day_number),
            questionNumber: Number(question.number),
            target: question,
          });
        }
      } else if (day.type === 'writing_prompt') {
        writingIndex += 1;
        items.push({
          kind: 'writing_prompt',
          dayNumber: Number(day.day_number),
          writingIndex,
          target: day,
        });
      }
    }
  }

  if (
    items.length === 0 &&
    meta &&
    Array.isArray(meta.questions)
  ) {
    meta.questions.forEach((question, index) => {
      items.push({
        kind: 'html_question',
        questionNumber: index + 1,
        qRef: String(question.q_ref || `Q${index + 1}`),
        target: question,
      });
    });
  }

  return items;
}

function findTarget(flatItems, rawKey) {
  const key = String(rawKey || '').trim();

  if (!key) return null;

  let match;

  // q1, Q19 — sequential parsed item order.
  match = key.match(/^q(\d+)$/i);
  if (match) {
    const index = Number(match[1]) - 1;
    return flatItems[index] || null;
  }

  // D1.Q1
  match = key.match(/^d(\d+)\.q(\d+)$/i);
  if (match) {
    const dayNumber = Number(match[1]);
    const questionNumber = Number(match[2]);

    return flatItems.find(item =>
      item.kind === 'question' &&
      item.dayNumber === dayNumber &&
      item.questionNumber === questionNumber
    ) || null;
  }

  // Canonical TXT item_ref: 1_1
  match = key.match(/^(\d+)_(\d+)$/);
  if (match) {
    const dayNumber = Number(match[1]);
    const questionNumber = Number(match[2]);

    return flatItems.find(item =>
      item.kind === 'question' &&
      item.dayNumber === dayNumber &&
      item.questionNumber === questionNumber
    ) || null;
  }

  // D4.WP
  match = key.match(/^d(\d+)\.wp$/i);
  if (match) {
    const dayNumber = Number(match[1]);

    return flatItems.find(item =>
      item.kind === 'writing_prompt' &&
      item.dayNumber === dayNumber
    ) || null;
  }

  // Canonical writing item_ref: WP_4
  match = key.match(/^wp_(\d+)$/i);
  if (match) {
    const dayNumber = Number(match[1]);

    return flatItems.find(item =>
      item.kind === 'writing_prompt' &&
      item.dayNumber === dayNumber
    ) || null;
  }

  // WR1 — first writing prompt, WR2 — second, etc.
  match = key.match(/^wr(\d+)$/i);
  if (match) {
    const writingIndex = Number(match[1]);

    return flatItems.find(item =>
      item.kind === 'writing_prompt' &&
      item.writingIndex === writingIndex
    ) || null;
  }

  // HTML q_ref exact match.
  return flatItems.find(item =>
    item.kind === 'html_question' &&
    item.qRef.toLowerCase() === key.toLowerCase()
  ) || null;
}

function applyCodes(targetInfo, entry) {
  const deseCodes = uniq(
    entry.dese_codes !== undefined
      ? entry.dese_codes
      : entry.dese
  );

  const goalCodes = uniq(
    entry.goal_codes !== undefined
      ? entry.goal_codes
      : entry.iep
  );

  if (targetInfo.kind === 'html_question') {
    targetInfo.target.default_dese_codes = deseCodes;
    targetInfo.target.default_goal_codes = goalCodes;
  } else {
    targetInfo.target.dese_codes = deseCodes;
    targetInfo.target.goal_codes = goalCodes;
  }
}

function applyExplicitMapping(meta, mappingText) {
  if (
    mappingText === undefined ||
    mappingText === null ||
    String(mappingText).trim() === ''
  ) {
    return {
      meta,
      applied: 0,
      unmatched: [],
      mappingPresent: false,
    };
  }

  let mapping;

  try {
    mapping = JSON.parse(String(mappingText));
  } catch (error) {
    const err = new Error(
      `Explicit mapping JSON is invalid: ${error.message}`
    );
    err.code = 'INVALID_MAPPING_JSON';
    throw err;
  }

  const entries = extractEntries(mapping);
  const flatItems = flattenMeta(meta);

  let applied = 0;
  const unmatched = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    const key =
      entry.question_id ||
      entry.item_ref ||
      entry.key ||
      entry.id;

    const target = findTarget(flatItems, key);

    if (!target) {
      unmatched.push(String(key || '(missing key)'));
      continue;
    }

    applyCodes(target, entry);
    applied += 1;
  }

  return {
    meta,
    applied,
    unmatched,
    mappingPresent: true,
  };
}

module.exports = {
  applyExplicitMapping,
  extractEntries,
  flattenMeta,
  findTarget,
};
