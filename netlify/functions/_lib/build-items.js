/**
 * Canonical server-side buildItemsFromMeta.
 * Builds assignment_items rows from a parsed meta object.
 * Supports meta.days[] (TXT) and meta.questions[] (HTML manifest) formats.
 * dese_codes are not included in the output (not a column on assignment_items).
 */
function buildItemsFromMeta(assignmentId, meta) {
  const items = [];
  if (!meta) return items;

  // Path A: TXT structured format
  if (Array.isArray(meta.days)) {
    for (const day of meta.days) {
      if (day.type === 'questions' && Array.isArray(day.questions)) {
        for (const q of day.questions) {
          items.push({
            assignment_id: assignmentId,
            item_ref: `${day.day_number}_${q.number}`,
            answer_type: q.type || 'mcq',
            points: q.points || 1,
            goal_codes: q.goal_codes || [],
            meta: {
              day: day.day_number,
              question_number: q.number,
              text: q.text,
              choices: q.choices,
              correct: q.correct,
              hint: q.hint,
            },
          });
        }
      } else if (day.type === 'writing_prompt') {
        items.push({
          assignment_id: assignmentId,
          item_ref: `WP_${day.day_number}`,
          answer_type: 'constructed',
          points: day.points || 5,
          goal_codes: day.goal_codes || [],
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

module.exports = { buildItemsFromMeta };
