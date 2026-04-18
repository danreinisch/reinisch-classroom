/**
 * Extracts [IG: ...] → goalCodes and [MLS: ...] → deseCodes from a hint string.
 * @param {string} hint
 * @returns {{ goalCodes: string[], deseCodes: string[] }}
 */
function extractCodesFromHint(hint) {
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
 * Canonical server-side buildItemsFromMeta.
 * Builds assignment_items rows from a parsed meta object.
 * Supports meta.days[] (TXT) and meta.questions[] (HTML manifest) formats.
 */
function buildItemsFromMeta(assignmentId, meta) {
  const items = [];
  if (!meta) return items;

  // Path A: TXT structured format
  if (Array.isArray(meta.days)) {
    for (const day of meta.days) {
      if (day.type === 'questions' && Array.isArray(day.questions)) {
        for (const q of day.questions) {
          const { goalCodes, deseCodes } = extractCodesFromHint(q.hint);
          const isFillInBlank = q.type === 'fill_in_blank';
          // For fill_in_blank: prefer 'accepted' (Week 13 pipe-separated alternatives)
          // over 'keywords' (older semicolon-separated format). When 'accepted' is present,
          // treat each alternative as a keyword with min_keywords=1 (any match is correct).
          let fibKeywords;
          let fibMinKeywords;
          if (isFillInBlank) {
            const hasAccepted = Array.isArray(q.accepted) && q.accepted.length > 0;
            fibKeywords = hasAccepted ? q.accepted : (q.keywords || []);
            fibMinKeywords = hasAccepted ? 1 : (q.min_keywords || 2);
          } else {
            fibKeywords = [];
            fibMinKeywords = 2;
          }
          items.push({
            assignment_id: assignmentId,
            item_ref: `${day.day_number}_${q.number}`,
            answer_type: isFillInBlank ? 'constructed' : normalizeAnswerType(q.type),
            points: q.points || 1,
            goal_codes: q.goal_codes || goalCodes,
            dese_codes: q.dese_codes || deseCodes,
            ...(isFillInBlank ? {
              scoring: {
                keywords: fibKeywords,
                min_keywords: fibMinKeywords,
                ...(q.case_sensitive != null ? { case_sensitive: q.case_sensitive } : {}),
                ...(Array.isArray(q.accepted) && q.accepted.length > 0 ? { accepted: q.accepted } : {}),
              },
            } : {}),
            meta: {
              day: day.day_number,
              question_number: q.number,
              text: q.text,
              choices: q.choices,
              correct: isFillInBlank ? null : q.correct,
              hint: q.hint,
              ...(isFillInBlank ? {
                scoring: {
                  keywords: fibKeywords,
                  min_keywords: fibMinKeywords,
                  ...(q.case_sensitive != null ? { case_sensitive: q.case_sensitive } : {}),
                  ...(Array.isArray(q.accepted) && q.accepted.length > 0 ? { accepted: q.accepted } : {}),
                },
              } : {}),
            },
          });
        }
      } else if (day.type === 'writing_prompt') {
        const wpCodes = (day.hints || []).reduce((acc, h) => {
          const { goalCodes, deseCodes } = extractCodesFromHint(h);
          acc.goalCodes.push(...goalCodes);
          acc.deseCodes.push(...deseCodes);
          return acc;
        }, { goalCodes: [], deseCodes: [] });
        items.push({
          assignment_id: assignmentId,
          item_ref: `WP_${day.day_number}`,
          answer_type: 'constructed',
          points: day.points || 5,
          goal_codes: day.goal_codes || wpCodes.goalCodes,
          dese_codes: day.dese_codes || wpCodes.deseCodes,
          meta: {
            day: day.day_number,
            type: 'writing_prompt',
            prompt: day.prompt,
            structure: day.structure,
            hints: day.hints,
          },
        });
      }
    }
  }

  // Path B: HTML manifest format
  if (items.length === 0 && Array.isArray(meta.questions) && meta.questions.length > 0) {
    for (let i = 0; i < meta.questions.length; i++) {
      const q = meta.questions[i];
      const qRef = q.q_ref || ('Q' + (i + 1));
      items.push({
        assignment_id: assignmentId,
        item_ref: qRef,
        answer_type: q.answer_type || 'constructed',
        points: (typeof q.points === 'number') ? q.points : 1,
        goal_codes: Array.isArray(q.default_goal_codes) ? q.default_goal_codes : [],
        dese_codes: Array.isArray(q.default_dese_codes) ? q.default_dese_codes : [],
        meta: {
          question_number: qRef,
          text: q.label || '',
          correct: (q.correct !== undefined && q.correct !== null) ? q.correct : undefined,
        },
      });
    }
  }

  return items;
}

module.exports = { buildItemsFromMeta, extractCodesFromHint };
