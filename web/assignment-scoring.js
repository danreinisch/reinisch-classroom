// Assignment Mapping Phase 1: Scoring Engine
// Handles MCQ, Multi-select, Boolean, and Constructed-response scoring

/**
 * Score a single item based on answer type
 * 
 * @param {Object} item - Item definition with answer_type, correct, scoring config
 * @param {*} studentAnswer - Student's answer (format depends on answer_type)
 * @returns {Object} Scoring result { is_correct, earned_points, max_points, detail }
 */
export function scoreItem(item, studentAnswer) {
  const maxPoints = item.points || 1;
  
  // Handle null/undefined student answer
  if (studentAnswer === null || studentAnswer === undefined || studentAnswer === '') {
    return {
      is_correct: false,
      earned_points: 0,
      max_points: maxPoints,
      detail: { reason: 'no_answer' }
    };
  }
  
  let isCorrect = false;
  let detail = {};
  
  switch (item.answer_type) {
    case 'mcq':
      isCorrect = scoreMcq(item.correct, studentAnswer);
      detail.type = 'mcq';
      break;
      
    case 'boolean':
      isCorrect = scoreBoolean(item.correct, studentAnswer);
      detail.type = 'boolean';
      break;
      
    case 'multi':
      isCorrect = scoreMulti(item.correct, studentAnswer);
      detail.type = 'multi';
      break;
      
    case 'constructed': {
      const constructedResult = scoreConstructed(item, studentAnswer);
      isCorrect = constructedResult.is_correct;
      detail = { ...detail, ...constructedResult.detail, type: 'constructed' };
      break;
    }
      
    default:
      console.warn(`[assignment-scoring] Unknown answer_type: ${item.answer_type}`);
      return {
        is_correct: false,
        earned_points: 0,
        max_points: maxPoints,
        detail: { reason: 'unknown_type', type: item.answer_type }
      };
  }
  
  return {
    is_correct: isCorrect,
    earned_points: isCorrect ? maxPoints : 0,
    max_points: maxPoints,
    detail
  };
}

/**
 * Score MCQ (single choice)
 * Case-insensitive exact match
 */
function scoreMcq(correctAnswer, studentAnswer) {
  if (!correctAnswer) return false;
  
  const correct = String(correctAnswer).trim().toLowerCase();
  const student = String(studentAnswer).trim().toLowerCase();
  
  return correct === student;
}

/**
 * Score Boolean (true/false)
 * Case-insensitive, accepts variations
 */
function scoreBoolean(correctAnswer, studentAnswer) {
  // Normalize to boolean
  const normalizeBool = (val) => {
    if (typeof val === 'boolean') return val;
    const str = String(val).trim().toLowerCase();
    if (str === 'true' || str === 't' || str === '1' || str === 'yes') return true;
    if (str === 'false' || str === 'f' || str === '0' || str === 'no') return false;
    return null;
  };
  
  const correct = normalizeBool(correctAnswer);
  const student = normalizeBool(studentAnswer);
  
  if (correct === null || student === null) return false;
  return correct === student;
}

/**
 * Score Multi-select
 * Order-agnostic set equality
 * Phase 1: Full credit or zero (no partial credit)
 */
function scoreMulti(correctAnswer, studentAnswer) {
  // Normalize to arrays
  const normalizeArray = (val) => {
    if (Array.isArray(val)) {
      return val.map(v => String(v).trim().toLowerCase()).sort();
    }
    if (typeof val === 'string') {
      // Handle semicolon or comma-separated
      return val.split(/[;,]/)
        .map(v => v.trim().toLowerCase())
        .filter(v => v.length > 0)
        .sort();
    }
    return [];
  };
  
  const correct = normalizeArray(correctAnswer);
  const student = normalizeArray(studentAnswer);
  
  // Must have same length and all elements match
  if (correct.length !== student.length) return false;
  
  return correct.every((val, idx) => val === student[idx]);
}

/**
 * Score Constructed Response
 * Phase 1: Basic keyword-based scoring
 * - Extract keywords from scoring config (or item.correct if array)
 * - Check if student answer contains >= N keywords (default 2)
 * - Full credit if threshold met, zero otherwise
 */
function scoreConstructed(item, studentAnswer) {
  const answerText = String(studentAnswer).toLowerCase();
  
  // Get keywords from scoring config or default to item.correct if array
  let keywords = [];
  let minKeywords = 2;
  
  if (item.scoring && item.scoring.keywords) {
    keywords = item.scoring.keywords.map(k => String(k).toLowerCase());
    minKeywords = item.scoring.min_keywords || minKeywords;
  } else if (Array.isArray(item.correct)) {
    keywords = item.correct.map(k => String(k).toLowerCase());
  }
  
  // If no keywords configured, cannot score
  if (keywords.length === 0) {
    return {
      is_correct: false,
      detail: {
        reason: 'no_keywords_configured',
        keywords_found: 0,
        keywords_required: minKeywords
      }
    };
  }
  
  // Count how many keywords are found
  let foundCount = 0;
  const foundKeywords = [];
  
  for (const keyword of keywords) {
    if (answerText.includes(keyword)) {
      foundCount++;
      foundKeywords.push(keyword);
    }
  }
  
  const isCorrect = foundCount >= minKeywords;
  
  return {
    is_correct: isCorrect,
    detail: {
      keywords_found: foundCount,
      keywords_required: minKeywords,
      total_keywords: keywords.length,
      found_list: foundKeywords
    }
  };
}

/**
 * Score an entire submission
 * 
 * @param {Array} items - Array of item definitions
 * @param {Object} studentAnswers - Map of item_ref to student answer
 * @returns {Object} Scoring results with per-item breakdown
 */
export function scoreSubmission(items, studentAnswers) {
  console.log('[assignment-scoring] Scoring submission with', items.length, 'items');
  const startTime = performance.now();
  
  const results = [];
  let totalEarned = 0;
  let totalPossible = 0;
  let correctCount = 0;
  
  for (const item of items) {
    const studentAnswer = studentAnswers[item.ref];
    const result = scoreItem(item, studentAnswer);
    
    results.push({
      item_ref: item.ref,
      ...result,
      raw_answer: studentAnswer
    });
    
    totalEarned += result.earned_points;
    totalPossible += result.max_points;
    if (result.is_correct) correctCount++;
  }
  
  const elapsedMs = performance.now() - startTime;
  const percentCorrect = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
  
  console.log(`[assignment-scoring] Scored ${items.length} items in ${elapsedMs.toFixed(1)}ms`);
  console.log(`[assignment-scoring] Result: ${correctCount}/${items.length} correct (${percentCorrect}%)`);
  
  // Warn if scoring took too long (target: < 300ms for 300 items)
  if (items.length > 100 && elapsedMs > 300) {
    console.warn(`[assignment-scoring] Performance warning: ${elapsedMs.toFixed(1)}ms for ${items.length} items (target: <300ms)`);
  }
  
  return {
    results,
    summary: {
      total_items: items.length,
      correct_count: correctCount,
      total_earned: totalEarned,
      total_possible: totalPossible,
      percent_correct: percentCorrect,
      elapsed_ms: elapsedMs
    }
  };
}

/**
 * Compute goal-level rollups from scored results
 * Phase 1: Full credit to each mapped goal (no weighting split)
 * 
 * @param {Array} items - Array of item definitions with mappings
 * @param {Array} scoredResults - Array of scoring results
 * @returns {Object} Goal-level rollups
 */
export function computeGoalRollups(items, scoredResults) {
  console.log('[assignment-rollup] Computing goal-level rollups');
  
  const goalStats = {};
  
  // Build lookup for scored results
  const resultsByRef = {};
  scoredResults.forEach(r => {
    resultsByRef[r.item_ref] = r;
  });
  
  // Aggregate by goal_code
  items.forEach(item => {
    const result = resultsByRef[item.ref];
    if (!result) return;
    
    // Each goal mapped to this item gets full credit
    if (item.goal_codes && item.goal_codes.length > 0) {
      item.goal_codes.forEach(goalCode => {
        if (!goalStats[goalCode]) {
          goalStats[goalCode] = {
            goal_code: goalCode,
            total_earned: 0,
            total_possible: 0,
            item_count: 0
          };
        }
        
        goalStats[goalCode].total_earned += result.earned_points;
        goalStats[goalCode].total_possible += result.max_points;
        goalStats[goalCode].item_count++;
      });
    }
  });
  
  // Compute percent_correct for each goal
  const rollups = Object.values(goalStats).map(stat => ({
    ...stat,
    percent_correct: stat.total_possible > 0
      ? Math.round((stat.total_earned / stat.total_possible) * 100 * 10) / 10
      : 0
  }));
  
  console.log(`[assignment-rollup] Computed rollups for ${rollups.length} goals`);
  
  return rollups;
}

/**
 * Compute DESE standard rollups from scored results
 * 
 * @param {Array} items - Array of item definitions with mappings
 * @param {Array} scoredResults - Array of scoring results
 * @returns {Object} DESE standard rollups
 */
export function computeStandardRollups(items, scoredResults) {
  console.log('[assignment-rollup] Computing DESE standard rollups');
  
  const standardStats = {};
  
  // Build lookup for scored results
  const resultsByRef = {};
  scoredResults.forEach(r => {
    resultsByRef[r.item_ref] = r;
  });
  
  // Aggregate by dese_code
  items.forEach(item => {
    const result = resultsByRef[item.ref];
    if (!result) return;
    
    // Each standard mapped to this item gets full credit
    if (item.dese_codes && item.dese_codes.length > 0) {
      item.dese_codes.forEach(deseCode => {
        if (!standardStats[deseCode]) {
          standardStats[deseCode] = {
            dese_code: deseCode,
            total_earned: 0,
            total_possible: 0,
            item_count: 0
          };
        }
        
        standardStats[deseCode].total_earned += result.earned_points;
        standardStats[deseCode].total_possible += result.max_points;
        standardStats[deseCode].item_count++;
      });
    }
  });
  
  // Compute percent_correct for each standard
  const rollups = Object.values(standardStats).map(stat => ({
    ...stat,
    percent_correct: stat.total_possible > 0
      ? Math.round((stat.total_earned / stat.total_possible) * 100 * 10) / 10
      : 0
  }));
  
  console.log(`[assignment-rollup] Computed rollups for ${rollups.length} DESE standards`);
  
  return rollups;
}
