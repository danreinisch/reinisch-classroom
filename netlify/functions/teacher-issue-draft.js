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
const { getSupabaseConfig } = require('./_lib/supa');

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
        const isSpecialLine = nextLine.match(/^(Question\s+\d+:|Q\d+:|DESE\s+Standard|IEP\s+Goal|[A-Z][):]|Correct\s+Answer:|ANSWER:|Answer:|Hint:|Writing\s+Prompt:|Writing\s+Structure:|Writing\s+Workshop|REMEMBER\s+YOUR|Hints?(?:\s+FOR)?:)/i)
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
          type: 'multiple_choice',
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

      if (currentQuestion) {
        // Check for choices (A), B), C), etc. or A:, B:, C:, etc.)
        const choiceMatch = trimmed.match(/^([A-Z])[):]\s*(.*)$/);
        if (choiceMatch) {
          currentQuestion.choices.push({
            letter: choiceMatch[1],
            text: choiceMatch[2].trim()
          });
          continue;
        }

        // Check for Correct Answer:, ANSWER:, or Answer:
        const correctMatch = trimmed.match(/^(?:Correct\s+)?Answer:\s*([A-Z])/i);
        if (correctMatch) {
          currentQuestion.correct = correctMatch[1];
          continue;
        }

        // Check for Hint:
        const hintMatch = trimmed.match(/^Hint:\s*(.*)$/i);
        if (hintMatch) {
          currentQuestion.hint = hintMatch[1].trim();
          continue;
        }

        // If we're in question section and it's not a special line, append to question text
        if (currentSection === 'question' && !choiceMatch && !correctMatch && !hintMatch) {
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

  // Validate body size (allow up to 100KB for draft content)
  const bodySizeCheck = validateBodySize(event.body, 100);
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

  try {
    // Resolve class name alias (for backward compatibility with old drafts)
    const resolvedClassName = CLASS_ALIASES[draft.className] || draft.className;
    if (CLASS_ALIASES[draft.className]) {
      console.log(`[teacher-issue-draft] [${requestId}] Resolved alias "${draft.className}" → "${resolvedClassName}"`);
    }

    // Step 1: Fetch class by name to get class ID
    const classesUrl = `${SUPABASE_URL}/rest/v1/classes?select=id,name&name=eq.${encodeURIComponent(resolvedClassName)}`;
    
    console.log(`[teacher-issue-draft] [${requestId}] Fetching class by name`);
    
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
    let targetClass = classes[0];

    if (!targetClass) {
      // Auto-create the class if it doesn't exist
      console.log(`[teacher-issue-draft] [${requestId}] Class "${resolvedClassName}" not found, auto-creating...`);
      
      const createClassUrl = `${SUPABASE_URL}/rest/v1/classes`;
      const createClassResponse = await fetch(createClassUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ name: resolvedClassName })
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
      console.log(`[teacher-issue-draft] [${requestId}] Found class: ${targetClass.name} (ID: ${targetClass.id})`);
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
    if (draft.assignment && draft.assignment.kind === "file" && draft.assignment.text) {
      console.log(`[teacher-issue-draft] [${requestId}] Parsing assignment content`);
      parsedMeta = parseTxtToMeta(
        draft.assignment.text,
        resolvedClassName,
        draft.assignment.name || 'assignment.txt'
      );
      
      if (parsedMeta) {
        console.log(`[teacher-issue-draft] [${requestId}] Parsed ${parsedMeta.days.length} day(s) from assignment content`);
      } else {
        console.log(`[teacher-issue-draft] [${requestId}] No structured content found in assignment file`);
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
        console.log(`[teacher-issue-draft] [${requestId}] Updating duplicate assignment meta with ${parsedMeta.days.length} day(s)`);
        
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

    // Step 5b: Create/upsert assignment_items from parsed meta questions and writing prompts
    if (parsedMeta && parsedMeta.days && parsedMeta.days.length > 0) {
      const itemsToUpsert = [];
      for (const day of parsedMeta.days) {
        if (day.type === 'questions' && Array.isArray(day.questions)) {
          for (const q of day.questions) {
            itemsToUpsert.push({
              assignment_id: assignmentId,
              item_ref: `${day.day_number}_${q.number}`,
              answer_type: 'mcq',
              points: 1,
              goal_codes: q.goal_codes || [],
              meta: {
                day: day.day_number,
                question_number: q.number,
                text: q.text,
                choices: q.choices,
                correct: q.correct,
                hint: q.hint
              }
            });
          }
        } else if (day.type === 'writing_prompt') {
          itemsToUpsert.push({
            assignment_id: assignmentId,
            item_ref: `WP_${day.day_number}`,
            answer_type: 'constructed',
            points: 5,
            goal_codes: day.goal_codes || [],
            meta: {
              day: day.day_number,
              type: 'writing_prompt',
              prompt: day.prompt,
              structure: day.structure,
              hints: day.hints
            }
          });
        }
      }

      if (itemsToUpsert.length > 0) {
        console.log(`[teacher-issue-draft] [${requestId}] Creating/updating ${itemsToUpsert.length} assignment_items`);

        // Strip dese_codes before POSTing: assignment_items has no dese_codes column.
        // dese_codes belong only in assignment_item_mappings (see step 5c below).
        const itemsPayload = itemsToUpsert.map(({ dese_codes: _dc, ...item }) => item);

        const itemsUrl = `${SUPABASE_URL}/rest/v1/assignment_items?on_conflict=assignment_id,item_ref`;
        const itemsResponse = await fetch(itemsUrl, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(itemsPayload)
        });

        if (!itemsResponse.ok) {
          const errorText = await itemsResponse.text();
          console.error(`[teacher-issue-draft] [${requestId}] assignment_items upsert failed: ${itemsResponse.status} - ${errorText}`);
          throw new Error(`Failed to create assignment items: ${itemsResponse.status} - ${errorText}`);
        }

        const upsertedItems = await itemsResponse.json();
        console.log(`[teacher-issue-draft] [${requestId}] Successfully upserted ${itemsToUpsert.length} assignment_items`);

        // Step 5c: Populate assignment_item_mappings for items that have goal/DESE codes
        // Use original itemsToUpsert (which has goal_codes from the parser) matched to
        // upserted IDs by item_ref, since the Supabase response may return stale values
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
        let targetStudents = students;
        if (draft.studentCode && typeof draft.studentCode === 'string') {
          const code = draft.studentCode.trim();
          targetStudents = students.filter(s => s.code === code);
          if (targetStudents.length === 0) {
            console.error(`[teacher-issue-draft] [${requestId}] Student ${code} not found in class ${draft.className}`);
            return jsonResponse(event, 404, { ok: false, error: `Student ${code} not found in class ${draft.className}` }, { 'Cache-Control': 'no-store' }, requestId);
          }
          console.log(`[teacher-issue-draft] [${requestId}] Filtered to target student: ${code}`);
        }

        // Step 8: Build instances to upsert
        const instances = targetStudents.map(student => ({
          assignment_id: assignmentId,
          student_id: student.id,
          assigned_at: new Date().toISOString().substring(0, 10),
          due_at: dueAt || null,
          status: 'Assigned',
          settings: {},
          school_year: getCurrentSchoolYear(),
        }));

        // Use upsert with resolution=merge-duplicates for idempotency
        const instancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances`;
        
        console.log(`[teacher-issue-draft] [${requestId}] Upserting ${instances.length} assignment instances`);
        
        const upsertResponse = await fetch(instancesUrl, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(instances)
        });

        if (!upsertResponse.ok) {
          const errorText = await upsertResponse.text();
          console.error(`[teacher-issue-draft] [${requestId}] Upsert failed with status ${upsertResponse.status}: ${errorText}`);
          throw new Error(`Failed to issue assignments: ${upsertResponse.status}`);
        }

        const upsertedInstances = await upsertResponse.json();
        issued_count = upsertedInstances.length;
      }
    }

    console.log(`[teacher-issue-draft] [${requestId}] Successfully issued: ${issued_count} instances created/updated`);
    
    return jsonResponse(
      event,
      200,
      { 
        ok: true, 
        assignment_id: assignmentId,
        issued_count: issued_count
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
