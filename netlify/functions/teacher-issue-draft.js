// Teacher issue draft endpoint
// POST /.netlify/functions/teacher-issue-draft
// Auth: Requires teacher session cookie
// Body: { draft } - Draft object containing title, className, assignmentText, mappingText, etc.
// Returns: { ok, assignment_id, issued_count }
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig, lookupActiveTeacherId } = require('./_lib/supa');
const { buildItemsFromMeta } = require('./_lib/build-items');
const { parseHtmlAssignment } = require('./_lib/parse-html-assignment');

// Class name aliases for backward compatibility with old drafts
const CLASS_ALIASES = {
  "LA 1 SC": "Language Arts 1 SC",
  "LA 2 SC": "Language Arts 2 SC",
  "LA 3 SC": "Language Arts 3 SC",
  "LA 4 SC": "Language Arts 4 SC",
  "Life Skills LA": "Life Skills Language Arts SC",
};

// Build reverse map for looking up short aliases from resolved names
const REVERSE_ALIASES = {};
for (const [short, long] of Object.entries(CLASS_ALIASES)) {
  REVERSE_ALIASES[long] = short;
}

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

/**
 * Returns true if an assignment meta object contains parseable content.
 * Valid meta must have either:
 *   - a non-empty `days` array (TXT-parsed assignments), OR
 *   - a non-empty `html_src` string (HTML assignments).
 * An empty object `{}` or missing/null value is always invalid and must never
 * be persisted as the `meta` of an issued assignment.
 *
 * @param {*} meta - The meta value to validate
 * @returns {boolean}
 */
function hasValidAssignmentMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;
  if (Array.isArray(meta.days) && meta.days.length > 0) return true;
  if (typeof meta.html_src === 'string' && meta.html_src.length > 0) return true;
  return false;
}

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
 * Parse TXT assignment content into structured JSON metadata
 * Extracts class-specific content, day groups, questions, and writing prompts
 * Strips DESE Standard(s) and IEP Goal Code(s) lines (teacher-only data)
 * 
 * @param {string} txtContent - Full raw TXT content from assignment file
 * @param {string} resolvedClassName - Class name to extract (e.g., "Language Arts 3 SC")
 * @param {string} sourceFileName - Original filename for reference
 * @returns {object|null} Parsed meta object or null if no content found
 */
function parseTxtToMeta(txtContent, resolvedClassName, sourceFileName) {
  if (!txtContent || typeof txtContent !== 'string') {
    return null;
  }

  // Find the section for the target class
  // The TXT format has class names BETWEEN ==== separators:
  // ================================================================================
  // LANGUAGE ARTS 3 SC
  // ================================================================================
  // <content>
  // ================================================================================
  // LIFE SKILLS LANGUAGE ARTS SC
  // ================================================================================
  
  const lines = txtContent.split('\n');
  let classStartIndex = -1;
  let classEndIndex = lines.length;
  
  // Strategy 1: Find class name that appears between === separators
  // Check for both resolved name and short alias (e.g., "Language Arts 4 SC" and "LA 4 SC")
  const shortAlias = REVERSE_ALIASES[resolvedClassName] || '';

  // Strategy 0: Per-student format detection
  // In this format, a multi-line header block appears between two === separators.
  // One line in the block contains "Class: <className>" (e.g. "Student: S002 | Class: Language Arts 3 SC").
  // The actual assignment content starts AFTER the closing === of that header block.
  const separatorIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().match(/^={3,}$/)) {
      separatorIndices.push(i);
    }
  }
  for (let si = 0; si < separatorIndices.length - 1; si++) {
    const blockStart = separatorIndices[si] + 1;
    const blockEnd = separatorIndices[si + 1];
    const blockLines = lines.slice(blockStart, blockEnd);
    const hasClassField = blockLines.some(l => {
      const upper = l.trim().toUpperCase();
      if (!upper.includes('CLASS:')) return false;
      return upper.includes(resolvedClassName.toUpperCase()) ||
             (shortAlias && upper.includes(shortAlias.toUpperCase()));
    });
    if (hasClassField) {
      classStartIndex = separatorIndices[si + 1] + 1;
      console.log('[parseTxtToMeta] Per-student format detected, content starts at line', classStartIndex, 'for class', resolvedClassName);
      break;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineUpper = line.toUpperCase();
    const matchesResolvedName = lineUpper.includes(resolvedClassName.toUpperCase());
    const matchesShortAlias = shortAlias && lineUpper.includes(shortAlias.toUpperCase());
    
    if (matchesResolvedName || matchesShortAlias) {
      // Check if this is a section header (has === before OR after it)
      const prevLineIsSeparator = i > 0 && lines[i - 1].trim().match(/^={3,}$/);
      const nextLineIsSeparator = i + 1 < lines.length && lines[i + 1].trim().match(/^={3,}$/);
      
      if (prevLineIsSeparator || nextLineIsSeparator) {
        // Found the class header
        // Content starts after the NEXT === line (the one after the class name)
        let contentStartIdx = i + 1;
        while (contentStartIdx < lines.length && !lines[contentStartIdx].trim().match(/^={3,}$/)) {
          contentStartIdx++;
        }
        if (contentStartIdx < lines.length) {
          contentStartIdx++; // Skip the === line itself
        }
        classStartIndex = contentStartIdx;
        break;
      }
    }
  }
  
  // Fallback Strategy 2: If no class-specific section found, check for fallback scenarios
  if (classStartIndex === -1) {
    const separatorCount = lines.filter(l => l.trim().match(/^={3,}$/)).length;
    
    if (separatorCount === 0) {
      // No separators at all - treat entire file as content for this class
      console.log('[parseTxtToMeta] No === separators found, using entire file as content');
      classStartIndex = 0;
      classEndIndex = lines.length;
    } else if (separatorCount === 1 || separatorCount === 2) {
      // Single section file - use everything after the first separator
      console.log('[parseTxtToMeta] Single section file detected, using it for:', resolvedClassName);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().match(/^={3,}$/)) {
          classStartIndex = i + 1;
          break;
        }
      }
    } else {
      // Multiple sections but no match - return null
      console.log('[parseTxtToMeta] No matching class section found for:', resolvedClassName);
      return null;
    }
  }
  
  // Find where this class section ends (next === line or end of file)
  if (classStartIndex !== -1) {
    for (let i = classStartIndex; i < lines.length; i++) {
      if (lines[i].trim().match(/^={3,}$/)) {
        classEndIndex = i;
        break;
      }
    }
  }
  
  // Extract just this class's content
  const classLines = lines.slice(classStartIndex, classEndIndex);
  const targetSection = classLines.join('\n');

  const meta = {
    source_file: sourceFileName || 'assignment.txt',
    class_name: resolvedClassName,
    days: []
  };

  let currentDay = null;
  let currentQuestion = null;
  let currentSection = 'header'; // 'header', 'question', 'writing_prompt', 'structure', 'hints'
  
  for (let i = 0; i < classLines.length; i++) {
    const line = classLines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Strip decorative dashes wrapping day headers: "--- DAY 1 QUESTIONS ---" → "DAY 1 QUESTIONS"
    const strippedLine = trimmed.replace(/^-{2,}\s*/, '').replace(/\s*-{2,}$/, '');

    // Check for DAY header (trailing content is optional)
    const dayMatch = strippedLine.match(/^DAY\s+(\d+)\b(.*)$/i);
    if (dayMatch) {
      // Save previous question to previous day if exists
      if (currentQuestion && currentDay && currentDay.type === 'questions') {
        currentDay.questions.push(currentQuestion);
      }
      
      // Save previous day if exists
      if (currentDay) {
        if (currentDay.type === 'questions' && currentDay.questions.length === 0) {
          console.warn('[parseTxtToMeta] Day', currentDay.day_number, 'has 0 questions — possible parser issue');
        }
        meta.days.push(currentDay);
      }

      const dayNumber = parseInt(dayMatch[1], 10);
      let dayLabel = strippedLine;
      const upperLine = strippedLine.toUpperCase();
      const dayType = (upperLine.includes('WRITING PROMPT') || upperLine.includes('WRITING WORKSHOP') || upperLine.includes('WRITTEN RESPONSE')) ? 'writing_prompt' : 'questions';

      // Check if the next non-empty line is a subtitle (not a Question/DESE/IEP/choice/answer line)
      let nextLineIndex = i + 1;
      while (nextLineIndex < classLines.length && !classLines[nextLineIndex].trim()) {
        nextLineIndex++;
      }
      
      if (nextLineIndex < classLines.length) {
        const nextLine = classLines[nextLineIndex].trim();
        // If the next line is not a special marker, it might be a subtitle
        // NOTE: This regex pattern is also used in tests/parse-txt-to-meta.test.cjs - keep in sync
        const nextStripped = nextLine.replace(/^-{2,}\s*/, '').replace(/\s*-{2,}$/, '');
        const isSpecialLine = nextLine.match(/^(Question\s+\d+:|Q\d+:|\d+\.\s|DESE\s+Standard|IEP\s+Goal|[A-Z][).]|[A-Z]:|Correct\s+Answer:|ANSWER:|Answer:|Correct:|Hint:|Writing\s+Prompt:|Writing\s+Structure:|Writing\s+Workshop|REMEMBER\s+YOUR|Hints?(?:\s+FOR)?:)/i)
          || nextStripped.match(/^DAY\s+(\d+)\b/i);
        if (!isSpecialLine && nextLine.length > 0) {
          // This is likely a subtitle, append it to the label
          dayLabel += ' - ' + nextLine;
          // Skip this line in the next iteration
          i = nextLineIndex;
        }
      }

      currentDay = {
        label: dayLabel,
        day_number: dayNumber,
        type: dayType
      };

      if (dayType === 'questions') {
        currentDay.questions = [];
      } else {
        currentDay.prompt = '';
        currentDay.structure = [];
        currentDay.hints = [];
      }

      currentSection = 'header';
      currentQuestion = null;
      continue;
    }

    // Check for Chapter header. Supported formats (all case-insensitive, after dash-stripping):
    //   "Chapter 38: Title"                (colon separator)
    //   "Chapter 38 — Title"               (em-dash separator)
    //   "Chapter 38 - Title"               (hyphen separator)
    //   "Chapters 38–40: Cause and Effect" (plural + en-dash range + separator)
    //   "Chapter 38 Cause and Effect"      (no separator — Week 13 Cause and Effect shape)
    //   "Chapter 38"                       (standalone chapter number)
    // Strategy: try with an explicit separator first; fall back to bare "Chapter N [rest]".
    let chapterMatch = strippedLine.match(/^Chapter(?:s)?\s+(\d+)(?:[-–]\d+)?\s*[:–—-]\s*(.*)$/i);
    if (!chapterMatch) {
      // No separator present — treat any trailing text as the chapter subtitle.
      const m = strippedLine.match(/^Chapter(?:s)?\s+(\d+)(?:[-–]\d+)?(?:\s+(.+))?$/i);
      if (m) chapterMatch = m;
    }
    if (chapterMatch) {
      if (currentQuestion && currentDay && currentDay.type === 'questions') {
        currentDay.questions.push(currentQuestion);
      }
      if (currentDay) {
        if (currentDay.type === 'questions' && currentDay.questions.length === 0) {
          console.warn('[parseTxtToMeta] Day', currentDay.day_number, 'has 0 questions — possible parser issue');
        }
        meta.days.push(currentDay);
      }
      currentDay = {
        label: strippedLine,
        day_number: parseInt(chapterMatch[1], 10),
        type: 'questions',
        questions: []
      };
      currentSection = 'header';
      currentQuestion = null;
      continue;
    }

    if (!currentDay) continue;

    // Skip DESE Standard(s) lines
    if (/^DESE\s+Standard/i.test(trimmed)) {
      continue;
    }

    // Parse IEP Goal lines and attach codes to the current question (or day for writing prompts)
    if (/^IEP\s+Goal\b/i.test(trimmed)) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const codesStr = trimmed.substring(colonIdx + 1).trim();
        if (codesStr) {
          const codes = codesStr.split(',').map(c => c.trim()).filter(Boolean);
          if (codes.length > 0) {
            if (currentQuestion) {
              currentQuestion.goal_codes = (currentQuestion.goal_codes || []).concat(codes);
            } else if (currentDay) {
              currentDay.goal_codes = (currentDay.goal_codes || []).concat(codes);
            }
          }
        }
      }
      continue;
    }

    if (currentDay.type === 'questions') {
      // Check for Question N: or QN: format
      const questionMatch = trimmed.match(/^(?:Question\s+|Q)(\d+):/i);
      if (questionMatch) {
        // Save previous question if exists
        if (currentQuestion) {
          currentDay.questions.push(currentQuestion);
        }

        currentQuestion = {
          number: parseInt(questionMatch[1], 10),
          text: '',
          type: 'mcq',
          choices: [],
          correct: '',
          hint: ''
        };
        currentSection = 'question';
        
        // Get question text (rest of the line after "Question N:")
        const questionText = trimmed.substring(questionMatch[0].length).trim();
        if (questionText) {
          currentQuestion.text = questionText;
        }
        continue;
      }

      // Check for bare-number format: "N. [tags] text" or "N. text" (Week 10 format)
      const bareNumberMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (bareNumberMatch) {
        // Save previous question if exists
        if (currentQuestion) {
          currentDay.questions.push(currentQuestion);
        }

        const qNumber = parseInt(bareNumberMatch[1], 10);
        const restOfLine = bareNumberMatch[2] || '';

        // Extract inline [IG: code] tags → goal_codes
        const igCodes = [];
        const igPattern = /\[IG:\s*([^\]]+)\]/g;
        let igMatch;
        while ((igMatch = igPattern.exec(restOfLine)) !== null) {
          igCodes.push(igMatch[1].trim());
        }

        // Extract inline [MLS.*] tags → dese_codes
        const mlsCodes = [];
        const mlsPattern = /\[MLS[^\]]*\]/g;
        let mlsMatch;
        while ((mlsMatch = mlsPattern.exec(restOfLine)) !== null) {
          mlsCodes.push(mlsMatch[0].slice(1, -1).trim());
        }

        // Detect inline type-hint bracket tags: [T/F] → boolean, [Fill in the Blank] → fill_in_blank
        const hasTFBracket = /\[T\/F\]/i.test(restOfLine);
        const hasFIBBracket = /\[Fill\s+in\s+the\s+Blank\]/i.test(restOfLine);
        let inlineType = 'mcq';
        if (hasTFBracket) inlineType = 'boolean';
        else if (hasFIBBracket) inlineType = 'fill_in_blank';

        // Remove all bracket tags and parenthetical type hints to get any remaining text
        const remainingText = restOfLine
          .replace(/\[IG:\s*[^\]]+\]/g, '')
          .replace(/\[MLS[^\]]*\]/g, '')
          .replace(/\[T\/F\]/gi, '')
          .replace(/\[Fill\s+in\s+the\s+Blank\]/gi, '')
          .replace(/\([^)]*\)/g, '')
          .trim();

        currentQuestion = {
          number: qNumber,
          text: remainingText,
          type: inlineType,
          choices: [],
          correct: '',
          hint: ''
        };
        if (igCodes.length > 0) {
          currentQuestion.goal_codes = igCodes;
        }
        if (mlsCodes.length > 0) {
          currentQuestion.dese_codes = mlsCodes;
        }

        currentSection = 'question';
        continue;
      }

      if (currentQuestion) {
        // Check for choices (A), B), C), etc. or A:, B:, C:, etc. or A., B., C., etc.)
        const choiceMatch = trimmed.match(/^([A-Z])[).:]\s*(.*)$/);
        if (choiceMatch) {
          currentQuestion.choices.push({
            letter: choiceMatch[1],
            text: choiceMatch[2].trim()
          });
          continue;
        }

        // Check for Correct: TRUE/FALSE (Week 13 boolean format — must be tested before
        // the single-letter check below because TRUE/FALSE start with letters T/F).
        // Convert to A/B letter choices matching the Week 10 True/False radio-button format
        // so the student portal renders radio buttons and scoring works the same way.
        const correctBoolMatch = trimmed.match(/^(?:Correct\s+Answer|Correct|Answer):\s*(true|false)\b/i);
        if (correctBoolMatch) {
          const isTrue = correctBoolMatch[1].toLowerCase() === 'true';
          currentQuestion.type = 'boolean';
          // Add True/False choices if not already present
          if (currentQuestion.choices.length === 0) {
            currentQuestion.choices = [
              { letter: 'A', text: 'True' },
              { letter: 'B', text: 'False' }
            ];
          }
          currentQuestion.correct = isTrue ? 'A' : 'B';
          continue;
        }

        // Check for Correct Answer:, ANSWER:, Answer:, or Correct: (single-letter MCQ)
        const correctMatch = trimmed.match(/^(?:Correct\s+Answer|Correct|Answer):\s*([A-Z])\b/i);
        if (correctMatch) {
          currentQuestion.correct = correctMatch[1];
          continue;
        }

        // Check for Accepted: a | b | c (Week 13 fill-in-the-blank with pipe-separated alternatives)
        const acceptedMatch = trimmed.match(/^Accepted:\s*(.+)$/i);
        if (acceptedMatch) {
          const alternatives = acceptedMatch[1].split('|').map(a => a.trim()).filter(Boolean);
          currentQuestion.type = 'fill_in_blank';
          currentQuestion.choices = [];
          currentQuestion.correct = '';
          currentQuestion.accepted = alternatives;
          continue;
        }

        // Check for Hint:
        const hintMatch = trimmed.match(/^Hint:\s*(.*)$/i);
        if (hintMatch) {
          currentQuestion.hint = hintMatch[1].trim();
          continue;
        }

        // Check for Keywords: line (fill-in-the-blank question)
        const keywordsMatch = trimmed.match(/^Keywords:\s*(.+)$/i);
        if (keywordsMatch) {
          let keywordsStr = keywordsMatch[1].trim();
          const caseMatch = keywordsStr.match(/;?\s*case:(true|false)/i);
          let caseSensitive = false;
          if (caseMatch) {
            caseSensitive = caseMatch[1].toLowerCase() === 'true';
            keywordsStr = keywordsStr.replace(/;?\s*case:(true|false)/i, '');
          }
          const parts = keywordsStr.split(';').map(p => p.trim()).filter(Boolean);
          let minKeywords = 2;
          const keywords = [];
          for (const part of parts) {
            const minMatch = part.match(/^min:(\d+)$/i);
            if (minMatch) {
              minKeywords = parseInt(minMatch[1], 10);
            } else {
              keywords.push(part);
            }
          }
          currentQuestion.type = 'fill_in_blank';
          currentQuestion.choices = [];
          currentQuestion.correct = '';
          currentQuestion.keywords = keywords;
          currentQuestion.min_keywords = minKeywords;
          currentQuestion.case_sensitive = caseSensitive;
          continue;
        }

        // If we're in question section and it's not a special line, append to question text
        if (currentSection === 'question' && !choiceMatch && !correctBoolMatch && !correctMatch && !acceptedMatch && !hintMatch) {
          if (currentQuestion.text) {
            currentQuestion.text += ' ' + trimmed;
          } else {
            currentQuestion.text = trimmed;
          }
        }
      }
    } else if (currentDay.type === 'writing_prompt') {
      // Check for Writing Prompt:
      if (trimmed.match(/^Writing\s+Prompt:/i)) {
        currentSection = 'prompt';
        const promptText = trimmed.substring(trimmed.indexOf(':') + 1).trim();
        if (promptText) {
          currentDay.prompt = promptText;
        }
        continue;
      }

      // Check for bare-number format: "N. [tags] (Written Response)" (Week 10 format)
      // Require at least one bracket tag to avoid matching plain numbered list lines
      const wpBareNumberMatch = trimmed.match(/^(\d+)\.\s+(.*\[.*)/);
      if (wpBareNumberMatch) {
        const restOfLine = wpBareNumberMatch[2] || '';

        // Extract inline [IG: code] tags → goal_codes
        const igCodes = [];
        const igPattern = /\[IG:\s*([^\]]+)\]/g;
        let igMatch;
        while ((igMatch = igPattern.exec(restOfLine)) !== null) {
          igCodes.push(igMatch[1].trim());
        }

        // Extract inline [MLS.*] tags → dese_codes
        const mlsCodes = [];
        const mlsPattern = /\[MLS[^\]]*\]/g;
        let mlsMatch;
        while ((mlsMatch = mlsPattern.exec(restOfLine)) !== null) {
          mlsCodes.push(mlsMatch[0].slice(1, -1).trim());
        }

        // Remove all bracket tags and parenthetical type hints to get any remaining text
        const remainingText = restOfLine
          .replace(/\[IG:\s*[^\]]+\]/g, '')
          .replace(/\[MLS[^\]]*\]/g, '')
          .replace(/\([^)]*\)/g, '')
          .trim();

        if (igCodes.length > 0) {
          currentDay.goal_codes = igCodes;
        }
        if (mlsCodes.length > 0) {
          currentDay.dese_codes = mlsCodes;
        }
        if (remainingText) {
          currentDay.prompt = remainingText;
        }
        currentSection = 'prompt';
        continue;
      }

      // Check for Writing Structure: or REMEMBER YOUR WRITING STRUCTURE: or REMEMBER YOUR STRUCTURE:
      if (trimmed.match(/^(?:REMEMBER\s+YOUR\s+)?(?:WRITING\s+)?STRUCTURE:/i)) {
        currentSection = 'structure';
        continue;
      }

      // Check for Hints: or HINTS FOR YOUR RESPONSE: or HINTS FOR YOUR WRITING:
      if (trimmed.match(/^Hints?(?:\s+FOR\s+YOUR\s+(?:RESPONSE|WRITING))?:/i)) {
        currentSection = 'hints';
        continue;
      }

      // Append content based on current section
      if (currentSection === 'prompt' && currentDay.prompt) {
        currentDay.prompt += ' ' + trimmed;
      } else if (currentSection === 'prompt') {
        currentDay.prompt = trimmed;
      } else if (currentSection === 'structure' && trimmed.startsWith('-')) {
        currentDay.structure.push(trimmed.substring(1).trim());
      } else if (currentSection === 'hints' && trimmed.startsWith('-')) {
        currentDay.hints.push(trimmed.substring(1).trim());
      }
    }
  }

  // Save last day
  if (currentDay) {
    // Save last question if exists
    if (currentQuestion && currentDay.type === 'questions') {
      currentDay.questions.push(currentQuestion);
    }
    if (currentDay.type === 'questions' && currentDay.questions.length === 0) {
      console.warn('[parseTxtToMeta] Day', currentDay.day_number, 'has 0 questions — possible parser issue');
    }
    meta.days.push(currentDay);
  }

  return meta.days.length > 0 ? meta : null;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-issue-draft] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'POST') {
    console.log(`[teacher-issue-draft] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Validate Content-Type
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json')) {
    console.log(`[teacher-issue-draft] [${requestId}] Invalid Content-Type: ${contentType}`);
    return jsonResponse(event, 400, { ok: false, error: 'Content-Type must be application/json' }, {}, requestId);
  }

  // Validate body size (allow up to 500KB for large HTML assignments with inline content)
  const bodySizeCheck = validateBodySize(event.body, 500);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-issue-draft] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[teacher-issue-draft] [${requestId}] Supabase not configured`);
    return jsonResponse(
      event, 
      503, 
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Check if SESSION_SECRET is configured
  if (!SESSION_SECRET) {
    console.error(`[teacher-issue-draft] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  // Verify teacher session
  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-issue-draft] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-issue-draft] [${requestId}] Authorized user: ${authResult.user.username}`);

  // Parse JSON safely
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-issue-draft] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { draft } = parseResult.data;

  // Validate draft object
  if (!draft || typeof draft !== 'object') {
    console.log(`[teacher-issue-draft] [${requestId}] Missing or invalid draft object`);
    return jsonResponse(event, 400, { ok: false, error: 'draft is required and must be an object' }, {}, requestId);
  }

  // Validate draft has required fields
  if (!draft.title || typeof draft.title !== 'string') {
    console.log(`[teacher-issue-draft] [${requestId}] Missing or invalid draft.title`);
    return jsonResponse(event, 400, { ok: false, error: 'draft.title is required and must be a string' }, {}, requestId);
  }

  if (!draft.className || typeof draft.className !== 'string') {
    console.log(`[teacher-issue-draft] [${requestId}] Missing or invalid draft.className`);
    return jsonResponse(event, 400, { ok: false, error: 'draft.className is required and must be a string' }, {}, requestId);
  }

  console.log(`[teacher-issue-draft] [${requestId}] Issuing draft "${draft.title}" to class "${draft.className}"`);

  const teacherUsername = authResult.user.username;

  try {
    // Resolve class name alias (for backward compatibility with old drafts)
    const resolvedClassName = CLASS_ALIASES[draft.className] || draft.className;
    if (CLASS_ALIASES[draft.className]) {
      console.log(`[teacher-issue-draft] [${requestId}] Resolved alias "${draft.className}" → "${resolvedClassName}"`);
    }

    // Step 1a: Resolve teacher UUID for class scoping and split-by-student validation.
    // First, try to read teacherId from the JWT payload (embedded at login time).
    // Fall back to a runtime lookup for sessions created before this change.
    let teacherUUID = authResult.user.teacherId || null;
    if (teacherUUID) {
      console.log(`[teacher-issue-draft] [${requestId}] Using teacher UUID from JWT for "${teacherUsername}": ${teacherUUID}`);
    } else {
      teacherUUID = await lookupActiveTeacherId();
      if (teacherUUID) {
        console.log(`[teacher-issue-draft] [${requestId}] Resolved active teacher UUID via runtime lookup: ${teacherUUID}`);
      } else {
        console.warn(`[teacher-issue-draft] [${requestId}] No active teacher record found; class lookup will not be teacher-scoped`);
      }
    }

    // For split-by-student drafts, teacher scoping is required to prevent cross-teacher issues.
    if ((!teacherUUID || teacherUUID.trim() === '') && draft.studentCode) {
      console.error(`[teacher-issue-draft] [${requestId}] Cannot issue split-by-student draft without teacher UUID. studentCode="${draft.studentCode}"`);
      return jsonResponse(event, 403, {
        ok: false,
        error: `No active teacher record found. Try logging out and back in. If the problem persists, contact admin to verify the teacher record is active in the database.`,
      }, { 'Cache-Control': 'no-store' }, requestId);
    }

    // Step 1b: Fetch class by name (scoped to teacher when possible) to get class ID.
    // Include teacher_id in select so we can log ownership info.
    let classesUrl;
    if (teacherUUID) {
      classesUrl = `${SUPABASE_URL}/rest/v1/classes?select=id,name,teacher_id&name=eq.${encodeURIComponent(resolvedClassName)}&teacher_id=eq.${encodeURIComponent(teacherUUID)}`;
      console.log(`[teacher-issue-draft] [${requestId}] Fetching class by name scoped to teacher ${teacherUUID}`);
    } else {
      classesUrl = `${SUPABASE_URL}/rest/v1/classes?select=id,name,teacher_id&name=eq.${encodeURIComponent(resolvedClassName)}`;
      console.log(`[teacher-issue-draft] [${requestId}] Fetching class by name (no teacher scope available)`);
    }
    
    const classesResponse = await fetch(classesUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!classesResponse.ok) {
      console.error(`[teacher-issue-draft] [${requestId}] Class query failed with status: ${classesResponse.status}`);
      throw new Error(`Class query failed: ${classesResponse.status}`);
    }

    const classes = await classesResponse.json();

    // Return 409 if multiple classes match (ambiguous class names in the DB)
    if (classes.length > 1) {
      console.error(`[teacher-issue-draft] [${requestId}] Ambiguous: ${classes.length} classes matched name "${resolvedClassName}". Class IDs: ${classes.map(c => c.id).join(', ')}`);
      return jsonResponse(event, 409, {
        ok: false,
        error: `Multiple classes match "${resolvedClassName}". Please contact support to resolve the ambiguity.`,
      }, { 'Cache-Control': 'no-store' }, requestId);
    }

    let targetClass = classes[0];

    // Fallback: if teacher-scoped query returned 0 results, the class may exist with a
    // different or NULL teacher_id (e.g. created before teacher_id was being populated).
    // Retry with a name-only query so existing classes are still found and used.
    if (!targetClass && teacherUUID) {
      console.log(`[teacher-issue-draft] [${requestId}] Teacher-scoped query found no class; falling back to name-only lookup`);
      const fallbackUrl = `${SUPABASE_URL}/rest/v1/classes?select=id,name,teacher_id&name=eq.${encodeURIComponent(resolvedClassName)}&limit=1`;
      const fallbackResponse = await fetch(fallbackUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      if (fallbackResponse.ok) {
        const fallbackClasses = await fallbackResponse.json();
        if (fallbackClasses.length === 1) {
          targetClass = fallbackClasses[0];
          console.log(`[teacher-issue-draft] [${requestId}] Fallback found class "${targetClass.name}" (ID: ${targetClass.id}, teacher_id: ${targetClass.teacher_id || 'null'}); adopting for teacher ${teacherUUID}`);
          // PATCH teacher_id so future teacher-scoped queries find this class directly.
          const patchUrl = `${SUPABASE_URL}/rest/v1/classes?id=eq.${encodeURIComponent(targetClass.id)}`;
          const patchResponse = await fetch(patchUrl, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ teacher_id: teacherUUID })
          });
          if (patchResponse.ok) {
            console.log(`[teacher-issue-draft] [${requestId}] Adopted class "${targetClass.name}" — set teacher_id to ${teacherUUID}`);
          } else {
            console.warn(`[teacher-issue-draft] [${requestId}] Could not adopt class "${targetClass.name}" (PATCH ${patchResponse.status}); continuing anyway`);
          }
        }
      }
    }

    if (!targetClass) {
      // Auto-create the class if it doesn't exist
      console.log(`[teacher-issue-draft] [${requestId}] Class "${resolvedClassName}" not found, auto-creating${teacherUUID ? ` with teacher_id: ${teacherUUID}` : ''}...`);
      
      const createClassUrl = `${SUPABASE_URL}/rest/v1/classes`;
      const createClassResponse = await fetch(createClassUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          name: resolvedClassName,
          ...(teacherUUID ? { teacher_id: teacherUUID } : {}),
        })
      });

      if (!createClassResponse.ok) {
        const errorText = await createClassResponse.text();
        console.error(`[teacher-issue-draft] [${requestId}] Failed to auto-create class: ${createClassResponse.status} - ${errorText}`);
        throw new Error(`Failed to auto-create class "${resolvedClassName}": ${createClassResponse.status}`);
      }

      const createdClasses = await createClassResponse.json();
      targetClass = createdClasses[0];
      
      if (!targetClass) {
        console.error(`[teacher-issue-draft] [${requestId}] Class auto-created but no record returned`);
        throw new Error('Class auto-created but no record returned');
      }

      console.log(`[teacher-issue-draft] [${requestId}] Auto-created class: ${targetClass.name} (ID: ${targetClass.id})`);
    } else {
      console.log(`[teacher-issue-draft] [${requestId}] Found class: ${targetClass.name} (ID: ${targetClass.id}, teacher_id: ${targetClass.teacher_id || 'unset'})`);
    }

    // Step 2: Fetch enrollments for this class
    // Try class_enrollments first (for forward compatibility), then fall back to enrollments table
    let studentIds = [];
    let enrollmentSource = '';
    
    try {
      // Primary: try class_enrollments table (UUID-based junction table)
      const classEnrollmentsUrl = `${SUPABASE_URL}/rest/v1/class_enrollments?select=student_id,students!inner(id,code,name)&class_id=eq.${encodeURIComponent(targetClass.id)}`;
      
      console.log(`[teacher-issue-draft] [${requestId}] Fetching class enrollments from class_enrollments table`);
      
      const classEnrollmentsResponse = await fetch(classEnrollmentsUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      let classEnrollments = [];
      
      if (!classEnrollmentsResponse.ok) {
        console.warn(`[teacher-issue-draft] [${requestId}] class_enrollments query returned ${classEnrollmentsResponse.status}, trying enrollments fallback`);
        
        // Fallback: query enrollments table (text-based student_code + class_id)
        const enrollmentsUrl = `${SUPABASE_URL}/rest/v1/enrollments?select=student_code&class_id=eq.${encodeURIComponent(targetClass.id)}`;
        
        const enrollmentsResponse = await fetch(enrollmentsUrl, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (!enrollmentsResponse.ok) {
          console.warn(`[teacher-issue-draft] [${requestId}] enrollments fallback also returned ${enrollmentsResponse.status}, returning empty student list`);
          studentIds = [];
        } else {
          const enrollments = await enrollmentsResponse.json();
          const studentCodes = enrollments.map(e => e.student_code).filter(Boolean);

          console.log(`[teacher-issue-draft] [${requestId}] Found ${studentCodes.length} student codes from enrollments table, looking up student IDs`);

          // Validate student codes match expected pattern (alphanumeric, hyphen, underscore)
          // This prevents injection by ensuring codes can be safely quoted in the query
          const validCodePattern = /^[a-zA-Z0-9_-]+$/;
          const validCodes = [];
          const invalidCodes = [];
          
          for (const code of studentCodes) {
            if (validCodePattern.test(code)) {
              validCodes.push(code);
            } else {
              invalidCodes.push(code);
            }
          }
          
          if (invalidCodes.length > 0) {
            console.warn(`[teacher-issue-draft] [${requestId}] Found invalid student codes (skipping):`, invalidCodes);
          }

          if (validCodes.length > 0) {
            // Look up students by their codes to get UUIDs
            // For PostgREST 'in' operator with text fields, wrap each value in quotes
            // Since we've validated that codes only contain [a-zA-Z0-9_-], quoting is safe
            const quotedCodes = validCodes.map(code => `"${code}"`);
            const studentsLookupUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code&code=in.(${quotedCodes.join(',')})`;
            
            const studentsLookupResponse = await fetch(studentsLookupUrl, {
              method: 'GET',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              }
            });

            if (!studentsLookupResponse.ok) {
              console.warn(`[teacher-issue-draft] [${requestId}] Students lookup failed with status: ${studentsLookupResponse.status}, returning empty student list`);
              studentIds = [];
            } else {
              const studentsFromCodes = await studentsLookupResponse.json();
              studentIds = studentsFromCodes.map(s => s.id).filter(Boolean);

              if (studentIds.length > 0) {
                enrollmentSource = 'enrollments';
                console.log(`[teacher-issue-draft] [${requestId}] Found ${studentIds.length} student IDs from enrollments table`);
              }
            }
          }
        }
      } else {
        classEnrollments = await classEnrollmentsResponse.json();
        studentIds = classEnrollments.map(e => e.student_id).filter(Boolean);

        if (studentIds.length > 0) {
          enrollmentSource = 'class_enrollments';
          console.log(`[teacher-issue-draft] [${requestId}] Found ${studentIds.length} enrolled students from class_enrollments table`);
        } else {
          // Empty results from class_enrollments, try enrollments fallback
          console.log(`[teacher-issue-draft] [${requestId}] No enrollments in class_enrollments, trying enrollments table`);
          
          const enrollmentsUrl = `${SUPABASE_URL}/rest/v1/enrollments?select=student_code&class_id=eq.${encodeURIComponent(targetClass.id)}`;
          
          const enrollmentsResponse = await fetch(enrollmentsUrl, {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            }
          });

          if (!enrollmentsResponse.ok) {
            console.warn(`[teacher-issue-draft] [${requestId}] enrollments fallback also returned ${enrollmentsResponse.status}, returning empty student list`);
            studentIds = [];
          } else {
            const enrollments = await enrollmentsResponse.json();
            const studentCodes = enrollments.map(e => e.student_code).filter(Boolean);

            console.log(`[teacher-issue-draft] [${requestId}] Found ${studentCodes.length} student codes from enrollments table, looking up student IDs`);

            // Validate student codes match expected pattern (alphanumeric, hyphen, underscore)
            // This prevents injection by ensuring codes can be safely quoted in the query
            const validCodePattern = /^[a-zA-Z0-9_-]+$/;
            const validCodes = [];
            const invalidCodes = [];
            
            for (const code of studentCodes) {
              if (validCodePattern.test(code)) {
                validCodes.push(code);
              } else {
                invalidCodes.push(code);
              }
            }
            
            if (invalidCodes.length > 0) {
              console.warn(`[teacher-issue-draft] [${requestId}] Found invalid student codes (skipping):`, invalidCodes);
            }

            if (validCodes.length > 0) {
              // Look up students by their codes to get UUIDs
              // For PostgREST 'in' operator with text fields, wrap each value in quotes
              // Since we've validated that codes only contain [a-zA-Z0-9_-], quoting is safe
              const quotedCodes = validCodes.map(code => `"${code}"`);
              const studentsLookupUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code&code=in.(${quotedCodes.join(',')})`;
              
              const studentsLookupResponse = await fetch(studentsLookupUrl, {
                method: 'GET',
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json'
                }
              });

              if (!studentsLookupResponse.ok) {
                console.warn(`[teacher-issue-draft] [${requestId}] Students lookup failed with status: ${studentsLookupResponse.status}, returning empty student list`);
                studentIds = [];
              } else {
                const studentsFromCodes = await studentsLookupResponse.json();
                studentIds = studentsFromCodes.map(s => s.id).filter(Boolean);

                if (studentIds.length > 0) {
                  enrollmentSource = 'enrollments';
                  console.log(`[teacher-issue-draft] [${requestId}] Found ${studentIds.length} student IDs from enrollments table`);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[teacher-issue-draft] [${requestId}] Enrollment query error:`, err.message, '— returning empty student list');
      studentIds = [];
    }

    console.log(`[teacher-issue-draft] [${requestId}] Using enrollment source: ${enrollmentSource}`);

    // Step 3: Parse assignment content if it's a file type
    let parsedMeta = null;
    let contentWarning = null;
    if (draft.assignment && draft.assignment.kind === "file" && draft.assignment.text) {
      console.log(`[teacher-issue-draft] [${requestId}] Parsing assignment content`);
      const fileName = draft.assignment.name || 'assignment.txt';
      const isHtmlFile = /\.html?$/i.test(fileName);

      if (isHtmlFile) {
        // For HTML files, store the raw HTML so the student portal can render it
        // in a sandboxed iframe via srcdoc.  Use the regex-based parser to extract
        // questions, goal codes, and correct answers from data-* attributes so that
        // buildItemsFromMeta() Path B can create assignment_items rows.
        try {
          const parsed = parseHtmlAssignment(draft.assignment.text);
          parsedMeta = { html_src: draft.assignment.text, questions: parsed.questions };
          console.log(`[teacher-issue-draft] [${requestId}] HTML file detected — parsed ${parsed.questions.length} question(s) from data-qref attributes (${draft.assignment.text.length} chars)`);
        } catch (err) {
          console.error(`[teacher-issue-draft] [${requestId}] HTML parsing failed:`, err.message);
          parsedMeta = { html_src: draft.assignment.text };
        }
      } else {
        parsedMeta = parseTxtToMeta(
          draft.assignment.text,
          resolvedClassName,
          fileName
        );

        if (parsedMeta) {
          console.log(`[teacher-issue-draft] [${requestId}] Parsed ${parsedMeta.days.length} day(s) from assignment content`);
        } else {
          // Fail loudly: never silently insert an assignment with meta = {}.
          // The parser returned null which means no DAY/Chapter section headers were
          // found.  Returning a 422 here prevents orphaned assignment_instance rows
          // whose associated assignment has empty meta (the root cause of the Week 13
          // "No Content Available" bug).
          const parseErrorMsg =
            `Cannot issue: no structured content was found in "${fileName}". ` +
            `The file must contain "DAY N" or "Chapter N:" section headers ` +
            `(e.g. "DAY 1 QUESTIONS", "Chapter 38: Title"). ` +
            `Check that the file is correctly formatted for class "${resolvedClassName}".`;
          console.error(`[teacher-issue-draft] [${requestId}] ${parseErrorMsg}`);
          return jsonResponse(
            event, 422,
            { ok: false, error: parseErrorMsg },
            { 'Cache-Control': 'no-store' },
            requestId
          );
        }
      }
    }

    // Step 4: Check for duplicate assignment (same title + class_id)
    // If found, reuse that assignment ID instead of creating a new one
    let assignmentId = null;
    let isDuplicate = false;

    const duplicateCheckUrl = `${SUPABASE_URL}/rest/v1/assignments?select=id,meta&title=eq.${encodeURIComponent(draft.title)}&class_id=eq.${encodeURIComponent(targetClass.id)}`;
    
    console.log(`[teacher-issue-draft] [${requestId}] Checking for duplicate assignment`);
    
    const duplicateCheckResponse = await fetch(duplicateCheckUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (duplicateCheckResponse.ok) {
      const existingAssignments = await duplicateCheckResponse.json();
      if (existingAssignments && existingAssignments.length > 0) {
        assignmentId = existingAssignments[0].id;
        isDuplicate = true;
        console.log(`[teacher-issue-draft] [${requestId}] Found duplicate assignment with ID: ${assignmentId}, reusing it`);

        // Guard: if the draft carries no new parseable content AND the existing
        // assignment already has empty meta, re-issuing would create more orphaned
        // instances that the Student Portal cannot render.  Fail loudly instead of
        // silently repeating the same broken issuance.
        if (!parsedMeta && !hasValidAssignmentMeta(existingAssignments[0].meta)) {
          const reissueErrMsg =
            `Cannot re-issue: the existing assignment (ID ${assignmentId}) has empty meta ` +
            `and no new assignment file was provided. ` +
            `Re-upload the assignment TXT file with "DAY N" or "Chapter N:" section headers ` +
            `so that meta.days can be populated.`;
          console.error(`[teacher-issue-draft] [${requestId}] ${reissueErrMsg}`);
          return jsonResponse(
            event, 422,
            { ok: false, error: reissueErrMsg },
            { 'Cache-Control': 'no-store' },
            requestId
          );
        }
      }
    }

    // Step 5: Create or update assignment in Supabase
    if (!assignmentId) {
      // Determine assignment type based on draft's assignment kind
      let assignmentType = "html"; // default
      if (draft.assignment && draft.assignment.kind === "link") {
        assignmentType = "link";
      } else if (draft.assignment && draft.assignment.kind === "file") {
        assignmentType = "html";
      }

      const assignmentData = {
        title: draft.title,
        type: assignmentType,
        series: (draft.assignment && draft.assignment.link) ? draft.assignment.link : null, // For link type, series stores the external URL
        description: draft.notes || null,
        class_id: targetClass.id,
        active: true,
        meta: parsedMeta || {},
        school_year: getCurrentSchoolYear()
      };

      console.log(`[teacher-issue-draft] [${requestId}] Creating new assignment record`);

      const assignmentsUrl = `${SUPABASE_URL}/rest/v1/assignments`;
      const createAssignmentResponse = await fetch(assignmentsUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(assignmentData)
      });

      if (!createAssignmentResponse.ok) {
        const errorText = await createAssignmentResponse.text();
        console.error(`[teacher-issue-draft] [${requestId}] Assignment creation failed: ${createAssignmentResponse.status} - ${errorText}`);
        throw new Error(`Failed to create assignment: ${createAssignmentResponse.status}`);
      }

      const createdAssignments = await createAssignmentResponse.json();
      assignmentId = createdAssignments[0]?.id;

      if (!assignmentId) {
        console.error(`[teacher-issue-draft] [${requestId}] Assignment created but no ID returned`);
        throw new Error('Assignment created but no ID returned');
      }

      console.log(`[teacher-issue-draft] [${requestId}] Created assignment with ID: ${assignmentId}`);
    } else {
      // Update existing assignment with new meta if we have parsed meta
      // Always update to ensure assignment content is current
      if (parsedMeta) {
        const metaSummary = parsedMeta.html_src
          ? `html_src (${parsedMeta.html_src.length} chars)`
          : `${parsedMeta.days ? parsedMeta.days.length : 0} day(s)`;
        console.log(`[teacher-issue-draft] [${requestId}] Updating duplicate assignment meta with ${metaSummary}`);
        
        const updateUrl = `${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}`;
        const updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ meta: parsedMeta })
        });

        if (!updateResponse.ok) {
          console.warn(`[teacher-issue-draft] [${requestId}] Failed to update assignment meta: ${updateResponse.status}`);
        } else {
          console.log(`[teacher-issue-draft] [${requestId}] Successfully updated assignment meta`);
        }
      }
    }

    // Step 5b: Create/upsert assignment_items from parsed meta (handles both TXT days and HTML manifest formats)
    if (parsedMeta) {
      const itemsToUpsert = buildItemsFromMeta(assignmentId, parsedMeta);

      if (itemsToUpsert.length > 0) {
        console.log(`[teacher-issue-draft] [${requestId}] Creating/updating ${itemsToUpsert.length} assignment_items`);

        const itemsUrl = `${SUPABASE_URL}/rest/v1/assignment_items?on_conflict=assignment_id,item_ref`;
        const itemsResponse = await fetch(itemsUrl, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(itemsToUpsert)
        });

        if (!itemsResponse.ok) {
          const errorText = await itemsResponse.text();
          console.error(`[teacher-issue-draft] [${requestId}] assignment_items upsert failed: ${itemsResponse.status} - ${errorText}`);
          throw new Error(`Failed to create assignment items: ${itemsResponse.status} - ${errorText}`);
        }

        const upsertedItems = await itemsResponse.json();
        console.log(`[teacher-issue-draft] [${requestId}] Successfully upserted ${itemsToUpsert.length} assignment_items`);

        // Step 5c: Populate assignment_item_mappings for items that have goal codes or DESE codes.
        // Use original itemsToUpsert (which has goal_codes and dese_codes from the parser) matched
        // to upserted IDs by item_ref, since the Supabase response may return stale values
        // when resolution=merge-duplicates is used.
        const upsertedMap = {};
        (Array.isArray(upsertedItems) ? upsertedItems : []).forEach(item => {
          upsertedMap[item.item_ref] = item;
        });

        const mappingsToUpsert = [];
        for (const original of itemsToUpsert) {
          if (!original.item_ref) continue;
          const upserted = upsertedMap[original.item_ref];
          if (!upserted || !upserted.id) continue;

          const goalCodes = original.goal_codes || [];
          const deseCodes = original.dese_codes || [];

          // Create a mapping row whenever the item has either goal codes or DESE codes.
          // Previously this only triggered on goal_codes, which silently omitted dese_codes
          // for DESE-only students (no IEP goals), causing the skills summary to show no data.
          if (goalCodes.length > 0 || deseCodes.length > 0) {
            mappingsToUpsert.push({
              item_id: upserted.id,
              goal_codes: goalCodes,
              dese_codes: deseCodes,
              weight: 1.0
            });
          }
        }

        if (mappingsToUpsert.length > 0) {
          console.log(`[teacher-issue-draft] [${requestId}] Upserting ${mappingsToUpsert.length} assignment_item_mappings`);

          const mappingsUrl = `${SUPABASE_URL}/rest/v1/assignment_item_mappings?on_conflict=item_id`;
          const mappingsResponse = await fetch(mappingsUrl, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(mappingsToUpsert)
          });

          if (!mappingsResponse.ok) {
            const errorText = await mappingsResponse.text();
            console.warn(`[teacher-issue-draft] [${requestId}] assignment_item_mappings upsert failed: ${mappingsResponse.status} - ${errorText}`);
          } else {
            console.log(`[teacher-issue-draft] [${requestId}] Successfully upserted ${mappingsToUpsert.length} assignment_item_mappings`);
          }
        }

        // Step 5d: Delete stale assignment_items from previous HTML upload versions.
        // Only for HTML assignments with at least one successfully upserted item.
        const isHtmlAssignment = parsedMeta.html_src != null;
        if (isHtmlAssignment && itemsToUpsert.length > 0) {
          const freshItemRefs = itemsToUpsert.map(i => i.item_ref).filter(Boolean);
          if (freshItemRefs.length > 0) {
            try {
              // First: identify stale item IDs before deleting
              const staleItemsUrl = `${SUPABASE_URL}/rest/v1/assignment_items?select=id,item_ref&assignment_id=eq.${assignmentId}&item_ref=not.in.(${freshItemRefs.map(r => encodeURIComponent(r)).join(',')})`;
              const staleItemsResponse = await fetch(staleItemsUrl, {
                method: 'GET',
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                }
              });
              const staleItems = staleItemsResponse.ok
                ? (await staleItemsResponse.json().catch(() => []))
                : [];

              if (staleItems.length > 0) {
                const staleIds = staleItems.map(i => i.id).filter(Boolean);

                // Delete stale mappings first (foreign key dependency)
                if (staleIds.length > 0) {
                  const staleMappingsUrl = `${SUPABASE_URL}/rest/v1/assignment_item_mappings?item_id=in.(${staleIds.join(',')})`;
                  const staleMappingsResponse = await fetch(staleMappingsUrl, {
                    method: 'DELETE',
                    headers: {
                      'apikey': SUPABASE_SERVICE_ROLE_KEY,
                      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                    }
                  });
                  if (!staleMappingsResponse.ok) {
                    console.warn(`[teacher-issue-draft] [${requestId}] Stale mapping cleanup failed: ${staleMappingsResponse.status}`);
                  }
                }

                // Delete stale assignment_items
                const staleDeleteUrl = `${SUPABASE_URL}/rest/v1/assignment_items?assignment_id=eq.${assignmentId}&item_ref=not.in.(${freshItemRefs.map(r => encodeURIComponent(r)).join(',')})`;
                const staleDeleteResponse = await fetch(staleDeleteUrl, {
                  method: 'DELETE',
                  headers: {
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                  }
                });
                if (staleDeleteResponse.ok) {
                  console.log(`[teacher-issue-draft] [${requestId}] Deleted ${staleItems.length} stale assignment_item(s) for re-uploaded HTML`);
                } else {
                  console.warn(`[teacher-issue-draft] [${requestId}] Stale item cleanup failed: ${staleDeleteResponse.status}`);
                }
              }
            } catch (cleanupErr) {
              console.warn(`[teacher-issue-draft] [${requestId}] Stale item cleanup error:`, cleanupErr.message);
            }
          }
        }

      }
    }

    // Step 6: Convert due date to ISO 8601 if provided
    let dueAt = null;
    if (draft.dueAt) {
      try {
        const dueDate = new Date(draft.dueAt);
        if (!isNaN(dueDate.getTime())) {
          dueAt = dueDate.toISOString();
        }
      } catch (err) {
        console.warn(`[teacher-issue-draft] [${requestId}] Invalid due date:`, err);
      }
    }

    // Step 7: Fetch student details to prepare assignment instances
    // If no students enrolled, skip instance creation
    let issued_count = 0;
    
    if (studentIds.length === 0) {
      console.log(`[teacher-issue-draft] [${requestId}] No students enrolled, assignment created but no instances issued`);
    } else {
      // Note: studentIds come from database enrollment query above, already validated as UUIDs by Supabase
      // PostgREST syntax requires wrapping UUIDs in double quotes for `in` operator
      const studentsUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code,name&id=in.(${studentIds.map(id => `"${id}"`).join(',')})`;
      
      console.log(`[teacher-issue-draft] [${requestId}] Fetching student details`);
      
      const studentsResponse = await fetch(studentsUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!studentsResponse.ok) {
        console.error(`[teacher-issue-draft] [${requestId}] Students query failed with status: ${studentsResponse.status}`);
        throw new Error(`Students query failed: ${studentsResponse.status}`);
      }

      const students = await studentsResponse.json();
      
      if (!students || students.length === 0) {
        console.log(`[teacher-issue-draft] [${requestId}] No students found for provided IDs`);
      } else {
        console.log(`[teacher-issue-draft] [${requestId}] Found ${students.length} students`);

        // If the draft targets a specific student (e.g. from "Split by Student"),
        // filter to only that student to avoid issuing to the whole class.
        // This is an explicit enrollment check: the student MUST be present in the
        // enrolled students list for the resolved class.
        let targetStudents = students;
        if (Array.isArray(draft.studentCodes) && draft.studentCodes.length > 0) {
          // Multiple targeted students from the "Student Code(s)" field on the Create Draft form
          const codes = draft.studentCodes.map(c => c.trim().toUpperCase());
          targetStudents = students.filter(s => codes.includes(s.code));
          if (targetStudents.length === 0) {
            console.error(`[teacher-issue-draft] [${requestId}] None of the specified students (${codes.join(', ')}) are enrolled in class "${draft.className}" (resolved: "${resolvedClassName}", class ID: ${targetClass.id}). Enrolled student count: ${students.length}`);
            return jsonResponse(event, 404, { ok: false, error: `None of the specified students (${codes.join(', ')}) are enrolled in your ${draft.className} class. Check enrollment on the Students page.` }, { 'Cache-Control': 'no-store' }, requestId);
          }
          console.log(`[teacher-issue-draft] [${requestId}] Targeted student codes filter — matched ${targetStudents.length} of ${codes.length} specified code(s): ${targetStudents.map(s => s.code).join(', ')}`);
        } else if (draft.studentCode && typeof draft.studentCode === 'string') {
          const code = draft.studentCode.trim();
          targetStudents = students.filter(s => s.code === code);
          if (targetStudents.length === 0) {
            console.error(`[teacher-issue-draft] [${requestId}] Student ${code} is not enrolled in class "${draft.className}" (resolved: "${resolvedClassName}", class ID: ${targetClass.id}). Enrolled student count: ${students.length}`);
            return jsonResponse(event, 404, { ok: false, error: `Student ${code} is not enrolled in your ${draft.className} class. Check enrollment on the Students page.` }, { 'Cache-Control': 'no-store' }, requestId);
          }
          console.log(`[teacher-issue-draft] [${requestId}] Enrollment check passed — filtered to target student: ${code}`);
        }

        // Handle additional student codes (students not on the class roster)
        // These are teacher-specified codes for students who need the assignment but aren't enrolled
        if (Array.isArray(draft.additionalStudentCodes) && draft.additionalStudentCodes.length > 0) {
          const additionalCodes = draft.additionalStudentCodes.map(c => c.trim().toUpperCase()).filter(Boolean);
          if (additionalCodes.length > 0) {
            const additionalStudentsUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code,name&code=in.(${additionalCodes.join(',')})`;
            try {
              const additionalStudentsResponse = await fetch(additionalStudentsUrl, {
                method: 'GET',
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json'
                }
              });
              if (additionalStudentsResponse.ok) {
                const additionalStudents = await additionalStudentsResponse.json();
                if (Array.isArray(additionalStudents) && additionalStudents.length > 0) {
                  const existingCodes = new Set(targetStudents.map(s => s.code));
                  const newStudents = additionalStudents.filter(s => !existingCodes.has(s.code));
                  targetStudents = [...targetStudents, ...newStudents];
                  console.log(`[teacher-issue-draft] [${requestId}] Added ${newStudents.length} additional student(s) not on roster: ${newStudents.map(s => s.code).join(', ')}`);
                }
              }
            } catch (err) {
              console.warn(`[teacher-issue-draft] [${requestId}] Failed to look up additional students:`, err.message);
            }
          }
        }

        // Step 8: Build instances to upsert
        const writingConfig = draft.writingConfig;
        let baseInstanceSettings = {};
        if (writingConfig && writingConfig.paragraph_count != null) {
          const parsedCount = parseInt(writingConfig.paragraph_count, 10);
          if (!Number.isNaN(parsedCount)) {
            const clampedCount = Math.min(5, Math.max(1, parsedCount));
            if (clampedCount > 1) {
              baseInstanceSettings = { writing_config: { paragraph_count: clampedCount } };
            }
          }
        }

        // Per-student writing config overrides from draft (e.g. { S001: { paragraph_count: 2 } })
        const perStudentWritingConfig = (typeof draft.perStudentWritingConfig === 'object' && draft.perStudentWritingConfig !== null && !Array.isArray(draft.perStudentWritingConfig))
          ? draft.perStudentWritingConfig
          : null;

        // Build base instance settings per student (without retry_config yet)
        const baseInstancesByStudent = {};
        const targetStudentIds = targetStudents.map(s => s.id);
        for (const student of targetStudents) {
          let instanceSettings = baseInstanceSettings;
          if (perStudentWritingConfig && perStudentWritingConfig[student.code] != null) {
            const rawPc = parseInt(perStudentWritingConfig[student.code], 10);
            if (!Number.isNaN(rawPc)) {
              const clampedPc = Math.min(5, Math.max(1, rawPc));
              const perStudentWC = { writing_config: { paragraph_count: clampedPc } };
              instanceSettings = { ...baseInstanceSettings, ...perStudentWC };
            }
          }
          baseInstancesByStudent[student.id] = instanceSettings;
        }

        // Look up any existing instances for this assignment + these students
        const quotedStudentIds = targetStudentIds.map(id => `"${id}"`).join(',');
        const existingInstancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?select=id,student_id,settings&assignment_id=eq.${assignmentId}&student_id=in.(${quotedStudentIds})`;
        const existingInstancesResponse = await fetch(existingInstancesUrl, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        const existingInstances = existingInstancesResponse.ok
          ? (await existingInstancesResponse.json().catch(() => []))
          : [];

        const existingByStudentId = {};
        for (const inst of (Array.isArray(existingInstances) ? existingInstances : [])) {
          existingByStudentId[inst.student_id] = inst;
        }

        // For existing instances, fetch most recent submission and correct answers to build retry_config
        const existingInstanceIds = Object.values(existingByStudentId).map(i => i.id);
        let retryConfigByInstanceId = {};
        if (existingInstanceIds.length > 0) {
          const quotedInstanceIds = existingInstanceIds.map(id => `"${id}"`).join(',');

          const submissionsUrl = `${SUPABASE_URL}/rest/v1/submissions?select=id,instance_id,score_total&instance_id=in.(${quotedInstanceIds})&order=submitted_at.desc&limit=100`;
          const submissionsResponse = await fetch(submissionsUrl, {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          const allSubmissions = submissionsResponse.ok
            ? (await submissionsResponse.json().catch(() => []))
            : [];

          const latestSubByInstanceId = {};
          for (const sub of (Array.isArray(allSubmissions) ? allSubmissions : [])) {
            if (!latestSubByInstanceId[sub.instance_id]) {
              latestSubByInstanceId[sub.instance_id] = sub;
            }
          }

          const submissionIds = Object.values(latestSubByInstanceId).map(s => s.id);
          if (submissionIds.length > 0) {
            const quotedSubIds = submissionIds.map(id => `"${id}"`).join(',');
            const subAnswersUrl = `${SUPABASE_URL}/rest/v1/submission_answers?select=submission_id,assignment_item_id,raw_answer,is_correct&submission_id=in.(${quotedSubIds})`;
            const subAnswersResponse = await fetch(subAnswersUrl, {
              method: 'GET',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
              },
            });
            const allSubAnswers = subAnswersResponse.ok
              ? (await subAnswersResponse.json().catch(() => []))
              : [];

            const itemRefsUrl = `${SUPABASE_URL}/rest/v1/assignment_items?select=id,item_ref&assignment_id=eq.${assignmentId}`;
            const itemRefsResponse = await fetch(itemRefsUrl, {
              method: 'GET',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
              },
            });
            const allItems = itemRefsResponse.ok
              ? (await itemRefsResponse.json().catch(() => []))
              : [];

            const itemRefById = {};
            for (const item of (Array.isArray(allItems) ? allItems : [])) {
              itemRefById[item.id] = item.item_ref;
            }

            for (const [instanceId, sub] of Object.entries(latestSubByInstanceId)) {
              const answersForSub = (Array.isArray(allSubAnswers) ? allSubAnswers : []).filter(a => a.submission_id === sub.id);
              const lockedQuestionIds = [];
              const originalAnswers = {};
              for (const ans of answersForSub) {
                const itemRef = itemRefById[ans.assignment_item_id];
                if (!itemRef) continue;
                if (ans.is_correct === true) {
                  lockedQuestionIds.push(itemRef);
                  const answerVal = ans.raw_answer && ans.raw_answer.value != null
                    ? String(ans.raw_answer.value)
                    : null;
                  if (answerVal !== null) {
                    originalAnswers[itemRef] = answerVal;
                  }
                }
              }
              retryConfigByInstanceId[instanceId] = {
                locked_question_ids: lockedQuestionIds,
                original_answers: originalAnswers,
                original_score: sub.score_total != null ? Math.round(sub.score_total) : null,
                retry_initiated_at: new Date().toISOString(),
              };
            }
          }
        }

        // Separate students into those needing INSERT vs UPDATE
        const studentsToInsert = [];
        const instancesToUpdate = [];
        const todayDate = new Date().toISOString().substring(0, 10);

        for (const student of targetStudents) {
          const existingInst = existingByStudentId[student.id];
          const instanceSettings = { ...baseInstancesByStudent[student.id] };

          if (existingInst) {
            const retryConfig = retryConfigByInstanceId[existingInst.id];
            const updatedSettings = { ...instanceSettings };
            if (retryConfig) {
              updatedSettings.retry_config = retryConfig;
              updatedSettings.answers = retryConfig.original_answers;
            }
            instancesToUpdate.push({
              id: existingInst.id,
              assigned_at: todayDate,
              due_at: dueAt || null,
              status: 'Assigned',
              settings: updatedSettings,
              resubmission_count: 0,
              school_year: getCurrentSchoolYear(),
            });
          } else {
            studentsToInsert.push({
              assignment_id: assignmentId,
              student_id: student.id,
              assigned_at: todayDate,
              due_at: dueAt || null,
              status: 'Assigned',
              settings: instanceSettings,
              school_year: getCurrentSchoolYear(),
            });
          }
        }

        // Insert new instances
        if (studentsToInsert.length > 0) {
          const instancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?on_conflict=assignment_id,student_id`;
          console.log(`[teacher-issue-draft] [${requestId}] Inserting ${studentsToInsert.length} new assignment instances`);
          const insertResponse = await fetch(instancesUrl, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(studentsToInsert)
          });
          if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            console.error(`[teacher-issue-draft] [${requestId}] Insert failed with status ${insertResponse.status}: ${errorText}`);
            throw new Error(`Failed to issue assignments: ${insertResponse.status}`);
          }
          const insertedInstances = await insertResponse.json();
          issued_count += Array.isArray(insertedInstances) ? insertedInstances.length : 0;
        }

        // Update existing instances (re-issue with retry_config)
        for (const inst of instancesToUpdate) {
          const { id: instId, ...updatePayload } = inst;
          const updateUrl = `${SUPABASE_URL}/rest/v1/assignment_instances?id=eq.${encodeURIComponent(instId)}`;
          const updateResponse = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify(updatePayload),
          });
          if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            console.error(`[teacher-issue-draft] [${requestId}] Update failed for instance ${instId}: ${updateResponse.status} - ${errorText}`);
            throw new Error(`Failed to update assignment instance: ${updateResponse.status}`);
          }
          issued_count += 1;
        }

        console.log(`[teacher-issue-draft] [${requestId}] Issued ${issued_count} instances (${studentsToInsert.length} new, ${instancesToUpdate.length} re-issued)`);
      }
    }

    console.log(`[teacher-issue-draft] [${requestId}] Successfully issued: ${issued_count} instances created/updated`);
    
    return jsonResponse(
      event,
      200,
      { 
        ok: true, 
        assignment_id: assignmentId,
        issued_count: issued_count,
        ...(contentWarning ? { warning: contentWarning } : {})
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-issue-draft] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: err.message || 'Failed to issue draft' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
