// Assignment Mapping Phase 1: Database Operations
// Handles CRUD for assignment items, mappings, and submission answers

/**
 * Returns the starting calendar year of the current school year.
 * Aug–Dec → current year; Jan–Jul → current year - 1.
 * @returns {number}
 */
function getCurrentSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  return month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Insert assignment items and mappings
 * Transactional: all or nothing
 * 
 * @param {Object} supabase - Supabase client
 * @param {number} assignmentId - Assignment ID
 * @param {Array} items - Array of item definitions from parser
 * @returns {Object} Result with item IDs
 */
export async function insertAssignmentItems(supabase, assignmentId, items) {
  console.log('[assignment-mapping] Inserting', items.length, 'items for assignment', assignmentId);
  
  try {
    // Step 1: Insert items into assignment_items
    const itemRecords = items.map(item => ({
      assignment_id: assignmentId,
      item_ref: item.ref,
      answer_type: item.answer_type,
      points: item.points,
      goal_codes: item.goal_codes || [],
      dese_codes: item.dese_codes || [],
      meta: {
        correct: item.correct,
        scoring: item.scoring || {},
        notes: item.notes || ''
      }
    }));
    
    const { data: insertedItems, error: itemsError } = await supabase
      .from('assignment_items')
      .insert(itemRecords)
      .select();
    
    if (itemsError) {
      console.error('[assignment-mapping] Error inserting items:', itemsError);
      throw itemsError;
    }
    
    console.log('[assignment-mapping] Inserted', insertedItems.length, 'items');
    
    // Step 2: Build mappings array
    const mappingRecords = [];
    items.forEach((item, idx) => {
      const itemId = insertedItems[idx]?.id;
      if (!itemId) return;
      
      // Only insert mapping if there are codes to map
      if ((item.dese_codes && item.dese_codes.length > 0) ||
          (item.goal_codes && item.goal_codes.length > 0)) {
        mappingRecords.push({
          item_id: itemId,
          dese_codes: item.dese_codes || [],
          goal_codes: item.goal_codes || [],
          weight: 1.0  // Phase 1: always full credit
        });
      }
    });
    
    // Step 3: Insert mappings if any
    let insertedMappings = [];
    if (mappingRecords.length > 0) {
      const { data: mappings, error: mappingsError } = await supabase
        .from('assignment_item_mappings')
        .insert(mappingRecords)
        .select();
      
      if (mappingsError) {
        console.error('[assignment-mapping] Error inserting mappings:', mappingsError);
        // Try to clean up items on error
        await supabase
          .from('assignment_items')
          .delete()
          .eq('assignment_id', assignmentId);
        throw mappingsError;
      }
      
      insertedMappings = mappings;
      console.log('[assignment-mapping] Inserted', insertedMappings.length, 'mappings');
    }
    
    return {
      success: true,
      items: insertedItems,
      mappings: insertedMappings,
      item_count: insertedItems.length,
      mapping_count: insertedMappings.length
    };
    
  } catch (error) {
    console.error('[assignment-mapping] Failed to insert items:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get assignment items with mappings
 * 
 * @param {Object} supabase - Supabase client
 * @param {number} assignmentId - Assignment ID
 * @returns {Array} Items with mappings
 */
export async function getAssignmentItems(supabase, assignmentId) {
  console.log('[assignment-mapping] Fetching items for assignment', assignmentId);
  
  try {
    // Fetch items
    const { data: items, error: itemsError } = await supabase
      .from('assignment_items')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('item_ref');
    
    if (itemsError) throw itemsError;
    
    if (!items || items.length === 0) {
      return [];
    }
    
    // Fetch mappings for all items
    const itemIds = items.map(i => i.id);
    const { data: mappings, error: mappingsError } = await supabase
      .from('assignment_item_mappings')
      .select('*')
      .in('item_id', itemIds);
    
    if (mappingsError) throw mappingsError;
    
    // Build lookup map
    const mappingsByItemId = {};
    (mappings || []).forEach(m => {
      mappingsByItemId[m.item_id] = m;
    });
    
    // Merge items with mappings
    const result = items.map(item => {
      const mapping = mappingsByItemId[item.id] || {};
      return {
        id: item.id,
        ref: item.item_ref,
        item_ref: item.item_ref,
        answer_type: item.answer_type,
        points: item.points,
        correct: item.meta?.correct,
        scoring: item.meta?.scoring || {},
        notes: item.meta?.notes || '',
        meta: item.meta,
        dese_codes: (mapping.dese_codes && mapping.dese_codes.length > 0) ? mapping.dese_codes : (item.dese_codes || []),
        goal_codes: (mapping.goal_codes && mapping.goal_codes.length > 0) ? mapping.goal_codes : (item.goal_codes || []),
        weight: mapping.weight || 1.0
      };
    });
    
    console.log('[assignment-mapping] Fetched', result.length, 'items');
    return result;
    
  } catch (error) {
    console.error('[assignment-mapping] Error fetching items:', error);
    return [];
  }
}

/**
 * Save submission answers and update submission
 * Transactional: inserts submission_answers and updates submission record
 * 
 * @param {Object} supabase - Supabase client
 * @param {string} submissionId - Submission UUID
 * @param {Array} scoredResults - Scored results from scoring engine
 * @param {Object} summary - Summary stats from scoring
 * @param {Array} goalRollups - Goal-level rollups
 * @param {Array} standardRollups - DESE standard rollups
 * @returns {Object} Result
 */
export async function saveSubmissionAnswers(supabase, submissionId, scoredResults, summary, goalRollups, standardRollups) {
  console.log('[assignment-scoring] Saving', scoredResults.length, 'answers for submission', submissionId);
  
  try {
    // Build submission_answers records
    const answerRecords = scoredResults.map(result => ({
      submission_id: submissionId,
      assignment_item_id: result.item_id,  // Must be provided by caller
      raw_answer: result.raw_answer,
      is_correct: result.is_correct,
      earned_points: result.earned_points,
      max_points: result.max_points
    }));
    
    // Insert submission_answers
    const { data: answers, error: answersError } = await supabase
      .from('submission_answers')
      .insert(answerRecords)
      .select();
    
    if (answersError) {
      console.error('[assignment-scoring] Error saving answers:', answersError);
      throw answersError;
    }
    
    console.log('[assignment-scoring] Saved', answers.length, 'answers');
    
    // Update submission with scores and detail
    const { error: updateError } = await supabase
      .from('submissions')
      .update({
        score_auto: summary.percent_correct,
        score_total: summary.percent_correct,
        detail: {
          per_item: scoredResults.map(r => ({
            item_ref: r.item_ref,
            is_correct: r.is_correct,
            earned_points: r.earned_points,
            max_points: r.max_points
          })),
          per_goal: goalRollups.reduce((acc, g) => {
            acc[g.goal_code] = g.percent_correct;
            return acc;
          }, {}),
          per_standard: standardRollups.reduce((acc, s) => {
            acc[s.dese_code] = s.percent_correct;
            return acc;
          }, {}),
          summary
        }
      })
      .eq('id', submissionId);
    
    if (updateError) {
      console.error('[assignment-scoring] Error updating submission:', updateError);
      throw updateError;
    }
    
    console.log('[assignment-scoring] Updated submission with scores');
    
    return {
      success: true,
      answer_count: answers.length,
      percent_correct: summary.percent_correct
    };
    
  } catch (error) {
    console.error('[assignment-scoring] Failed to save submission answers:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Return the canonical ReinischClassroom school-calendar date.
 * Date-only instructional evidence must use America/Chicago,
 * not UTC truncation.
 */
function getSchoolLocalDate(dateLike = new Date()) {
  const date = dateLike instanceof Date
    ? dateLike
    : new Date(dateLike);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date for school-local formatting');
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Insert goal_progress entries for mapped goals
 * One entry per goal_code with the goal's percent_correct
 * 
 * @param {Object} supabase - Supabase client
 * @param {string} submissionId - Submission UUID
 * @param {string} studentId - Student UUID
 * @param {string} assignmentInstanceId - Assignment instance UUID
 * @param {Array} goalRollups - Goal-level rollups
 * @returns {Object} Result
 */
export async function insertGoalProgress(supabase, submissionId, studentId, assignmentInstanceId, goalRollups) {
  console.log('[assignment-rollup] Inserting goal progress for', goalRollups.length, 'goals');
  
  try {
    // Build progress records
    const progressRecords = goalRollups.map(rollup => ({
      student_id: studentId,
      assignment_instance_id: assignmentInstanceId,
      date: getSchoolLocalDate(),
      value: rollup.percent_correct,
      source: 'assignment',
      collected_by: 'system',
      school_year: getCurrentSchoolYear(),
      meta: { goal_code: rollup.goal_code }
    }));
    
    // For each goal code, find the matching goal_id
    // This requires querying the goals table
    const goalCodes = goalRollups.map(r => r.goal_code);
    
    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('id, code')
      .eq('student_id', studentId)
      .in('code', goalCodes);
    
    if (goalsError) {
      console.error('[assignment-rollup] Error fetching goals:', goalsError);
      throw goalsError;
    }
    
    // Build code -> id map
    const goalIdByCode = {};
    (goals || []).forEach(g => {
      goalIdByCode[g.code] = g.id;
    });
    
    // Update progress records with goal_id
    const validProgressRecords = progressRecords
      .map(rec => {
        const goalId = goalIdByCode[rec.meta.goal_code];
        if (!goalId) {
          console.warn(`[assignment-rollup] Goal not found for code: ${rec.meta.goal_code}`);
          return null;
        }
        return {
          goal_id: goalId,
          student_id: rec.student_id,
          assignment_instance_id: rec.assignment_instance_id,
          date: rec.date,
          value: rec.value,
          source: rec.source,
          collected_by: rec.collected_by,
          school_year: rec.school_year
        };
      })
      .filter(rec => rec !== null);
    
    if (validProgressRecords.length === 0) {
      console.warn('[assignment-rollup] No valid goal mappings found');
      return {
        success: true,
        inserted_count: 0,
        warning: 'No matching goals found for student'
      };
    }
    
    // Insert progress entries
    const { data: progress, error: progressError } = await supabase
      .from('goal_progress')
      .insert(validProgressRecords)
      .select();
    
    if (progressError) {
      console.error('[assignment-rollup] Error inserting progress:', progressError);
      throw progressError;
    }
    
    console.log('[assignment-rollup] Inserted', progress.length, 'progress entries');
    
    return {
      success: true,
      inserted_count: progress.length,
      skipped_count: goalRollups.length - progress.length
    };
    
  } catch (error) {
    console.error('[assignment-rollup] Failed to insert goal progress:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if assignment is version-locked (has submissions)
 * 
 * @param {Object} supabase - Supabase client
 * @param {number} assignmentId - Assignment ID
 * @returns {Object} Lock status
 */
export async function checkVersionLock(supabase, assignmentId) {
  try {
    const { data: assignment, error } = await supabase
      .from('assignments')
      .select('version_locked, first_submission_at')
      .eq('id', assignmentId)
      .single();
    
    if (error) throw error;
    
    return {
      is_locked: assignment.version_locked || false,
      first_submission_at: assignment.first_submission_at
    };
  } catch (error) {
    console.error('[assignment-mapping] Error checking version lock:', error);
    return { is_locked: false };
  }
}

/**
 * Lock assignment version after first submission
 * 
 * @param {Object} supabase - Supabase client
 * @param {number} assignmentId - Assignment ID
 * @returns {Object} Result
 */
export async function lockAssignmentVersion(supabase, assignmentId) {
  console.log('[assignment-mapping] Locking assignment version:', assignmentId);
  
  try {
    const { error } = await supabase
      .from('assignments')
      .update({
        version_locked: true,
        first_submission_at: new Date().toISOString()
      })
      .eq('id', assignmentId)
      .is('first_submission_at', null);  // Only update if not already locked
    
    if (error) throw error;
    
    console.log('[assignment-mapping] Assignment version locked');
    return { success: true };
  } catch (error) {
    console.error('[assignment-mapping] Error locking version:', error);
    return { success: false, error: error.message };
  }
}
