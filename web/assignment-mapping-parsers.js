// Assignment Mapping Phase 1: TXT and JSON Manifest Parsers
// Handles pipe-delimited TXT and JSON manifest formats for per-question mapping

/**
 * Parse TXT mapping format (pipe-delimited)
 * Format: #question_ref|points|correct|dese_codes|goal_codes|notes[|keywords]
 * - Lines starting with # are comments
 * - Semicolon-separated codes (e.g., "MA.8.EE.1;MA.8.EE.2")
 * - Empty fields allowed (use empty string or dash)
 * - Optional 7th field: semicolon-separated keywords for constructed items
 *   e.g. "slope;intercept;linear;min:2" — min:N sets min_keywords threshold
 * 
 * @param {string} txtContent - Raw TXT content
 * @returns {Object} Parsed manifest with items array
 */
export function parseTxtMapping(txtContent) {
  console.log('[assignment-mapping] Parsing TXT mapping');
  
  const lines = txtContent.split('\n').map(l => l.trim());
  const items = [];
  const errors = [];
  const seenRefs = new Set();
  
  let lineNum = 0;
  for (const line of lines) {
    lineNum++;
    
    // Skip empty lines and comments (but not question refs starting with #)
    if (!line || (line.startsWith('#') && !line.includes('|'))) {
      continue;
    }
    
    // Parse pipe-delimited fields
    const parts = line.split('|').map(p => p.trim());
    
    if (parts.length < 6) {
      errors.push({
        line: lineNum,
        message: `Expected 6 fields (ref|points|correct|dese_codes|goal_codes|notes), got ${parts.length}`,
        content: line
      });
      continue;
    }
    
    let [ref, points, correct, deseCodes, goalCodes, notes] = parts;
    const keywordsRaw = parts.length >= 7 ? parts[6] : '';
    
    // Remove leading # from ref if present
    ref = ref.replace(/^#+/, '').trim();
    
    // Validate ref
    if (!ref) {
      errors.push({
        line: lineNum,
        message: 'Question ref is required',
        content: line
      });
      continue;
    }
    
    // Check for duplicate refs
    if (seenRefs.has(ref)) {
      errors.push({
        line: lineNum,
        message: `Duplicate question ref: ${ref}`,
        content: line
      });
      continue;
    }
    seenRefs.add(ref);
    
    // Parse points
    const pointsNum = parseFloat(points);
    if (isNaN(pointsNum) || pointsNum < 0) {
      errors.push({
        line: lineNum,
        message: `Invalid points value: ${points}`,
        content: line
      });
      continue;
    }
    
    // Parse codes (semicolon-separated)
    const parseCodeArray = (codeStr) => {
      if (!codeStr || codeStr === '-' || codeStr === '') return [];
      return codeStr.split(';')
        .map(c => c.trim())
        .filter(c => c.length > 0);
    };
    
    const deseArray = parseCodeArray(deseCodes);
    const goalArray = parseCodeArray(goalCodes);
    
    // Infer answer_type from correct answer format
    // - If empty/dash: 'constructed'
    // - If contains semicolon: 'multi'
    // - If true/false (case-insensitive): 'boolean'
    // - Otherwise: 'mcq'
    let answerType = 'mcq';
    let correctValue = correct.trim();
    
    if (!correctValue || correctValue === '-') {
      answerType = 'constructed';
      correctValue = null;
    } else if (correctValue.includes(';')) {
      answerType = 'multi';
      // For multi, store as array
      correctValue = correctValue.split(';').map(c => c.trim()).filter(c => c);
    } else if (/^(true|false)$/i.test(correctValue)) {
      answerType = 'boolean';
      correctValue = correctValue.toLowerCase() === 'true';
    }
    
    // Parse optional keywords field (7th field) for constructed items
    let scoring = {};
    if (keywordsRaw && answerType === 'constructed') {
      let keywordsStr = keywordsRaw;
      const caseMatch = keywordsStr.match(/;?\s*case:(true|false)/i);
      let caseSensitive = false;
      if (caseMatch) {
        caseSensitive = caseMatch[1].toLowerCase() === 'true';
        keywordsStr = keywordsStr.replace(/;?\s*case:(true|false)/i, '');
      }
      const keywordParts = keywordsStr.split(';').map(k => k.trim()).filter(k => k.length > 0);
      let minKeywords = 1;
      const keywords = [];
      for (const part of keywordParts) {
        const minMatch = part.match(/^min:(\d+)$/i);
        if (minMatch) {
          minKeywords = parseInt(minMatch[1], 10);
        } else {
          keywords.push(part);
        }
      }
      if (keywords.length > 0) {
        scoring = {
          keywords,
          min_keywords: minKeywords,
          ...(caseSensitive ? { case_sensitive: true } : {}),
        };
        // Set correct to the keywords array as well, providing a fallback for scoreConstructed()
        // which checks item.correct when item.scoring.keywords is absent. Both fields intentionally
        // carry the same data so the item is scoreable via either the client-side or server-side path.
        correctValue = keywords;
      }
    }
    
    items.push({
      ref,
      answer_type: answerType,
      points: pointsNum,
      correct: correctValue,
      dese_codes: deseArray,
      goal_codes: goalArray,
      scoring,
      notes: notes || ''
    });
  }
  
  console.log(`[assignment-mapping] Parsed ${items.length} items from TXT with ${errors.length} errors`);
  
  return {
    format: 'txt',
    items,
    errors,
    valid: errors.length === 0
  };
}

/**
 * Parse and validate JSON manifest
 * Expected structure:
 * {
 *   "title": "Assignment Title",
 *   "version": "1.0",
 *   "items": [
 *     {
 *       "ref": "Q1",
 *       "answer_type": "mcq",
 *       "points": 1,
 *       "correct": "A",
 *       "dese_codes": ["MA.8.EE.1"],
 *       "goal_codes": ["MATH.1", "MATH.2"],
 *       "scoring": { "keywords": ["example"], "min_keywords": 2 }  // optional, for constructed
 *     }
 *   ]
 * }
 * 
 * @param {string} jsonContent - Raw JSON content
 * @returns {Object} Parsed and validated manifest
 */
export function parseJsonManifest(jsonContent) {
  console.log('[assignment-mapping] Parsing JSON manifest');
  
  const errors = [];
  let manifest;
  
  // Parse JSON
  try {
    manifest = JSON.parse(jsonContent);
  } catch (e) {
    return {
      format: 'json',
      items: [],
      errors: [{ message: `Invalid JSON: ${e.message}` }],
      valid: false
    };
  }
  
  // Validate top-level structure
  if (!manifest.items || !Array.isArray(manifest.items)) {
    errors.push({ message: 'Manifest must have "items" array' });
  }
  
  if (!manifest.items || manifest.items.length === 0) {
    errors.push({ message: 'Manifest must have at least one item' });
  }
  
  if (errors.length > 0) {
    return {
      format: 'json',
      manifest,
      items: [],
      errors,
      valid: false
    };
  }
  
  // Validate and normalize items
  const items = [];
  const seenRefs = new Set();
  const validAnswerTypes = ['mcq', 'multi', 'boolean', 'constructed'];
  
  manifest.items.forEach((item, idx) => {
    const itemErrors = [];
    
    // Validate ref
    if (!item.ref || typeof item.ref !== 'string') {
      itemErrors.push(`Item ${idx}: ref is required and must be a string`);
    } else if (seenRefs.has(item.ref)) {
      itemErrors.push(`Item ${idx}: duplicate ref "${item.ref}"`);
    } else {
      seenRefs.add(item.ref);
    }
    
    // Validate answer_type
    if (!item.answer_type) {
      itemErrors.push(`Item ${idx} (${item.ref}): answer_type is required`);
    } else if (!validAnswerTypes.includes(item.answer_type)) {
      itemErrors.push(`Item ${idx} (${item.ref}): invalid answer_type "${item.answer_type}". Must be one of: ${validAnswerTypes.join(', ')}`);
    }
    
    // Validate points
    const points = parseFloat(item.points);
    if (isNaN(points) || points < 0) {
      itemErrors.push(`Item ${idx} (${item.ref}): points must be a non-negative number, got "${item.points}"`);
    }
    
    // Validate code arrays
    const validateCodeArray = (arr, name) => {
      if (arr && !Array.isArray(arr)) {
        itemErrors.push(`Item ${idx} (${item.ref}): ${name} must be an array if provided`);
        return [];
      }
      return arr || [];
    };
    
    const dese_codes = validateCodeArray(item.dese_codes, 'dese_codes');
    const goal_codes = validateCodeArray(item.goal_codes, 'goal_codes');
    
    // Add to errors array
    errors.push(...itemErrors);
    
    // If no errors for this item, add to items array
    if (itemErrors.length === 0) {
      items.push({
        ref: item.ref,
        answer_type: item.answer_type,
        points: points,
        correct: item.correct !== undefined ? item.correct : null,
        dese_codes,
        goal_codes,
        scoring: item.scoring || {},
        notes: item.notes || ''
      });
    }
  });
  
  console.log(`[assignment-mapping] Parsed ${items.length} items from JSON with ${errors.length} errors`);
  
  return {
    format: 'json',
    manifest,
    items,
    errors,
    valid: errors.length === 0,
    title: manifest.title,
    version: manifest.version
  };
}

/**
 * Validate mapping data structure (post-parse validation)
 * 
 * @param {Array} items - Array of parsed items
 * @returns {Object} Validation result with warnings
 */
export function validateMapping(items) {
  const warnings = [];
  const stats = {
    total: items.length,
    byType: {},
    withDese: 0,
    withGoals: 0,
    withBoth: 0,
    withNeither: 0
  };
  
  items.forEach(item => {
    // Count by type
    stats.byType[item.answer_type] = (stats.byType[item.answer_type] || 0) + 1;
    
    // Count mapping coverage
    const hasDese = item.dese_codes && item.dese_codes.length > 0;
    const hasGoals = item.goal_codes && item.goal_codes.length > 0;
    
    if (hasDese) stats.withDese++;
    if (hasGoals) stats.withGoals++;
    if (hasDese && hasGoals) stats.withBoth++;
    if (!hasDese && !hasGoals) {
      stats.withNeither++;
      warnings.push({
        ref: item.ref,
        message: 'Item has no DESE or goal mappings'
      });
    }
    
    // Validate constructed response has keywords if used
    if (item.answer_type === 'constructed') {
      if (!item.scoring || !item.scoring.keywords || item.scoring.keywords.length === 0) {
        warnings.push({
          ref: item.ref,
          message: 'Constructed response item has no keywords for scoring'
        });
      }
    }
  });
  
  // Warn if too many items (performance target: 300)
  if (items.length > 300) {
    warnings.push({
      message: `Assignment has ${items.length} items, which exceeds the Phase 1 performance target of 300`
    });
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
    stats
  };
}
