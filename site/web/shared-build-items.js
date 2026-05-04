/**
 * Extracts [IG: ...] → goalCodes and [MLS: ...] → deseCodes from a hint string.
 * @param {string} hint
 * @returns {{ goalCodes: string[], deseCodes: string[] }}
 */
export function extractCodesFromHint(hint) {
  const goalCodes = [];
  const deseCodes = [];
  if (!hint || typeof hint !== 'string') return { goalCodes, deseCodes };

  const igMatches = hint.matchAll(/\[IG:\s*([^\]]+)\]/g);
  for (const m of igMatches) goalCodes.push(m[1].trim());

  const mlsMatches = hint.matchAll(/\[MLS:\s*([^\]]+)\]/g);
  for (const m of mlsMatches) deseCodes.push(m[1].trim());

  return { goalCodes, deseCodes };
}

/**
 * Maps legacy 'multiple_choice' type to 'mcq' and returns the value or 'mcq'
 * as a fallback, ensuring the DB CHECK constraint is never violated.
 */
function normalizeAnswerType(type) {
  if (type === 'multiple_choice') return 'mcq';
  return type || 'mcq';
}

/**
 * Canonical implementation of buildItemsFromMeta.
 * Builds synthetic assignment_items from assignment metadata.
 *
 * Supports two metadata formats:
 *   Path A: meta.days[].questions[] (TXT structured format)
 *   Path B: meta.questions[] (HTML manifest flat array, fallback)
 *
 * @param {string|number} assignmentId
 * @param {Object} meta
 * @param {Object} [options]
 * @param {string} [options.idPrefix='syn_'] - prefix for synthetic IDs
 * @returns {Array} synthetic item objects
 */
export function buildItemsFromMeta(assignmentId, meta, options = {}) {
  const idPrefix = options.idPrefix != null ? options.idPrefix : 'syn_';
  const items = [];
  if (!meta) return items;

  // Path A: TXT structured format — meta.days[].questions[]
  if (Array.isArray(meta.days)) {
    for (const day of meta.days) {
      if (day.type === 'questions' && Array.isArray(day.questions)) {
        for (const q of day.questions) {
          const item_ref = `${day.day_number}_${q.number}`;
          const { goalCodes, deseCodes } = extractCodesFromHint(q.hint);
          const isFillInBlank = q.type === 'fill_in_blank';
          const isWrittenResponse = q.type === 'written_response';
          items.push({
            id: `${idPrefix}${item_ref}`,
            assignment_id: assignmentId,
            item_ref,
            answer_type: isFillInBlank ? 'constructed' : normalizeAnswerType(q.type),
            points: q.points || 1,
            ...(isFillInBlank ? {
              scoring: {
                keywords: q.keywords || [],
                min_keywords: q.min_keywords || 1,
                ...(q.case_sensitive != null ? { case_sensitive: q.case_sensitive } : {}),
              },
            } : {}),
            meta: {
              day: day.day_number,
              question_number: q.number,
              text: q.text,
              choices: q.choices,
              correct: (isFillInBlank || isWrittenResponse) ? null : q.correct,
              hint: q.hint,
              ...(isFillInBlank ? {
                scoring: {
                  keywords: q.keywords || [],
                  min_keywords: q.min_keywords || 1,
                  ...(q.case_sensitive != null ? { case_sensitive: q.case_sensitive } : {}),
                },
              } : {}),
            },
            goal_codes: q.goal_codes || goalCodes,
            dese_codes: q.dese_codes || deseCodes,
          });
        }
      } else if (day.type === 'writing_prompt') {
        const item_ref = `WP_${day.day_number}`;
        const wpCodes = (day.hints || []).reduce((acc, h) => {
          const { goalCodes, deseCodes } = extractCodesFromHint(h);
          acc.goalCodes.push(...goalCodes);
          acc.deseCodes.push(...deseCodes);
          return acc;
        }, { goalCodes: [], deseCodes: [] });
        items.push({
          id: `${idPrefix}${item_ref}`,
          assignment_id: assignmentId,
          item_ref,
          answer_type: 'constructed',
          points: day.points || 5,
          meta: {
            day: day.day_number,
            type: 'writing_prompt',
            prompt: day.prompt,
            structure: day.structure,
            hints: day.hints,
          },
          goal_codes: day.goal_codes || wpCodes.goalCodes,
          dese_codes: day.dese_codes || wpCodes.deseCodes,
        });
      }
    }
  }

  // Path B: HTML manifest format — meta.questions is a flat array
  if (items.length === 0 && Array.isArray(meta.questions) && meta.questions.length > 0) {
    for (let i = 0; i < meta.questions.length; i++) {
      const q = meta.questions[i];
      const qRef = q.q_ref || (`Q${i + 1}`);
      items.push({
        id: `${idPrefix}${qRef}`,
        assignment_id: assignmentId,
        item_ref: qRef,
        answer_type: q.answer_type || 'constructed',
        points: (typeof q.points === 'number') ? q.points : 1,
        meta: {
          question_number: qRef,
          text: q.label || '',
          correct: (q.correct !== undefined && q.correct !== null) ? q.correct : undefined,
        },
        goal_codes: Array.isArray(q.default_goal_codes) ? q.default_goal_codes : [],
        dese_codes: Array.isArray(q.dese_codes) ? q.dese_codes : [],
      });
    }
  }

  return items;
}
