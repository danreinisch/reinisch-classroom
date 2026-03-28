/**
 * html-manifest-to-items.js
 * Bridge module: converts manifest questions from detectQuestionsFromHTML()
 * into the items array format required by insertAssignmentItems() so that
 * HTML assignments participate in the same scoring pipeline as TXT assignments.
 */

/**
 * Convert manifest questions (from detectQuestionsFromHTML) to the items array
 * format expected by insertAssignmentItems() in assignment-mapping-db.js.
 *
 * Each manifest question has:
 *   { q_ref, label, skill_tags, points, default_goal_codes, dese_codes, correct, answer_type, per_student_overrides }
 *
 * Each output item needs:
 *   { ref, answer_type, points, correct, dese_codes, goal_codes, scoring, notes }
 *
 * @param {Array} questions - from detectQuestionsFromHTML() Pass 1
 * @returns {Array} items compatible with insertAssignmentItems()
 */
export function manifestQuestionsToItems(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }
  var items = [];
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    if (!q.q_ref) {
      continue;
    }
    items.push({
      ref: q.q_ref,
      answer_type: q.answer_type || 'constructed',
      points: (typeof q.points === 'number') ? q.points : 1,
      correct: (q.correct !== undefined && q.correct !== null) ? q.correct : null,
      dese_codes: Array.isArray(q.dese_codes) ? q.dese_codes : [],
      goal_codes: Array.isArray(q.default_goal_codes) ? q.default_goal_codes : [],
      scoring: q.scoring || {},
      notes: q.label || ''
    });
  }
  return items;
}

/**
 * Build a summary of the conversion for display in the teacher center.
 * @param {Array} items - from manifestQuestionsToItems()
 * @returns {Object} { total_items, total_points, type_breakdown, has_dese, has_goals, coverage }
 */
export function summarizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      total_items: 0,
      total_points: 0,
      type_breakdown: {},
      has_dese: false,
      has_goals: false,
      coverage: 0
    };
  }
  var total_points = 0;
  var type_breakdown = {};
  var has_dese = false;
  var has_goals = false;
  var mapped_count = 0;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    total_points += (typeof item.points === 'number') ? item.points : 1;
    var atype = item.answer_type || 'constructed';
    type_breakdown[atype] = (type_breakdown[atype] || 0) + 1;
    if (Array.isArray(item.dese_codes) && item.dese_codes.length > 0) {
      has_dese = true;
    }
    if (Array.isArray(item.goal_codes) && item.goal_codes.length > 0) {
      has_goals = true;
    }
    if (item.correct !== null && item.correct !== undefined) {
      mapped_count++;
    }
  }
  return {
    total_items: items.length,
    total_points: total_points,
    type_breakdown: type_breakdown,
    has_dese: has_dese,
    has_goals: has_goals,
    coverage: Math.round((mapped_count / items.length) * 100)
  };
}
