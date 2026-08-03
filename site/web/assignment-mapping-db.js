// Assignment Mapping Phase 1: Database Operations
// Handles CRUD for assignment items, mappings, and submission answers



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
export async function insertGoalProgress(
  _supabase,
  submissionId,
  studentId,
  assignmentInstanceId,
  goalRollups
) {
  console.log(
    '[assignment-rollup] Sending goal progress through signed boundary for',
    Array.isArray(goalRollups)
      ? goalRollups.length
      : 0,
    'goals'
  );

  try {
    const response = await fetch(
      '/.netlify/functions/teacher-goal-progress',
      {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          action: 'insert_batch',
          submission_id: submissionId,
          student_id: studentId,
          assignment_instance_id: assignmentInstanceId,
          goal_rollups: Array.isArray(goalRollups)
            ? goalRollups
            : []
        })
      }
    );

    const result = await response
      .json()
      .catch(() => ({
        ok: false,
        error: `HTTP ${response.status}`
      }));

    if (!response.ok || result.ok !== true) {
      throw new Error(
        result.error ||
        'Goal-progress rollup request failed'
      );
    }

    return {
      success: true,
      inserted_count:
        Number(result.inserted_count) || 0,
      skipped_count:
        Number(result.skipped_count) || 0
    };
  } catch (error) {
    console.error(
      '[assignment-rollup] Failed to insert goal progress:',
      error
    );

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
