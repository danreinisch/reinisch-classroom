// Unit tests for parseTxtToMeta function
// Run with: node tests/parse-txt-to-meta.test.cjs

const assert = require('assert');

// Since parseTxtToMeta is not exported, we need to extract and test it
// For now, we'll copy the function here for testing purposes
// NOTE: The regex pattern for detecting special lines must be kept in sync with production code

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

/**
 * Parse TXT assignment content into structured JSON metadata
 * (Copied from teacher-issue-draft.js for testing)
 */
function parseTxtToMeta(txtContent, resolvedClassName, sourceFileName) {
  if (!txtContent || typeof txtContent !== 'string') {
    return null;
  }

  // Find the section for the target class
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

  const meta = {
    source_file: sourceFileName || 'assignment.txt',
    class_name: resolvedClassName,
    days: []
  };

  let currentDay = null;
  let currentQuestion = null;
  let currentSection = 'header';
  
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

      // Check if the next non-empty line is a subtitle
      let nextLineIndex = i + 1;
      while (nextLineIndex < classLines.length && !classLines[nextLineIndex].trim()) {
        nextLineIndex++;
      }
      
      if (nextLineIndex < classLines.length) {
        const nextLine = classLines[nextLineIndex].trim();
        // If the next line is not a special marker, it might be a subtitle
        const nextStripped = nextLine.replace(/^-{2,}\s*/, '').replace(/\s*-{2,}$/, '');
        const isSpecialLine = nextLine.match(/^(Question\s+\d+:|Q\d+:|\d+\.\s|DESE\s+Standard|IEP\s+Goal|[A-Z][).]|[A-Z]:|Correct\s+Answer:|ANSWER:|Answer:|Correct:|Hint:|Writing\s+Prompt:|Writing\s+Structure:|Writing\s+Workshop|REMEMBER\s+YOUR|Hints?(?:\s+FOR)?:)/i)
          || nextStripped.match(/^DAY\s+(\d+)\b/i);
        if (!isSpecialLine && nextLine.length > 0) {
          dayLabel += ' - ' + nextLine;
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
    // NOTE: This regex pair must be kept in sync with the copy in teacher-issue-draft.js.
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

        // Append to question text
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

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error('  Error:', e.message);
    console.error('  Stack:', e.stack);
    process.exit(1);
  }
}

console.log('Running parseTxtToMeta unit tests...\n');

// Test 1: Multi-section file with ==== before and after class name
test('Parse multi-section file with ==== before and after class name', () => {
  const txtContent = `================================================================================
LANGUAGE ARTS 3 SC
================================================================================

DAY 1 QUESTIONS
Chapter 29: Arrival

Question 1: What is the capital of France?
A) London
B) Paris
C) Berlin
Correct Answer: B

================================================================================
LIFE SKILLS LANGUAGE ARTS SC
================================================================================

DAY 2 QUESTIONS

Question 1: What is 2+2?
A) 3
B) 4
C) 5
Correct Answer: B`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');
  
  assert(result !== null, 'Should parse multi-section file');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].label, 'DAY 1 QUESTIONS - Chapter 29: Arrival', 'Should include subtitle');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
  assert.strictEqual(result.days[0].questions[0].text, 'What is the capital of France?', 'Should parse question text');
  assert.strictEqual(result.days[0].questions[0].choices.length, 3, 'Should have 3 choices');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Should parse correct answer');
});

// Test 2: Single section file (no separators)
test('Parse single section file with no separators', () => {
  const txtContent = `DAY 1 QUESTIONS

Question 1: What is the capital of France?
A) London
B) Paris
C) Berlin
Correct Answer: B`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');
  
  assert(result !== null, 'Should parse single-section file');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
});

// Test 3: DAY header without trailing content
test('Parse DAY header without trailing content', () => {
  const txtContent = `DAY 1

Question 1: What is the capital of France?
A) London
B) Paris
Correct Answer: B`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');
  
  assert(result !== null, 'Should parse DAY without trailing content');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].day_number, 1, 'Should parse day number');
});

// Test 4: True/False questions
test('Parse True/False questions', () => {
  const txtContent = `DAY 1 QUESTIONS

Question 1: True or False: The sky is blue.
A) True
B) False
Correct Answer: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');
  
  assert(result !== null, 'Should parse True/False questions');
  assert.strictEqual(result.days[0].questions[0].choices.length, 2, 'Should have 2 choices');
  assert.strictEqual(result.days[0].questions[0].choices[0].text, 'True', 'Should parse True choice');
  assert.strictEqual(result.days[0].questions[0].choices[1].text, 'False', 'Should parse False choice');
});

// Test 5: Multiple days
test('Parse multiple days', () => {
  const txtContent = `DAY 1 QUESTIONS

Question 1: What is 1+1?
A) 1
B) 2
Correct Answer: B

DAY 2 QUESTIONS

Question 1: What is 2+2?
A) 3
B) 4
Correct Answer: B`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');
  
  assert(result !== null, 'Should parse multiple days');
  assert.strictEqual(result.days.length, 2, 'Should have 2 days');
  assert.strictEqual(result.days[0].day_number, 1, 'First day should be day 1');
  assert.strictEqual(result.days[1].day_number, 2, 'Second day should be day 2');
});

// Test 6: Single section file with one separator (header only)
test('Parse single section file with header separator', () => {
  const txtContent = `================================================================================

DAY 1 QUESTIONS

Question 1: What is the capital?
A) Paris
B) London
Correct Answer: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');
  
  assert(result !== null, 'Should parse single-section with header separator');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
});

// Test 7: Class name case insensitive matching
test('Match class name case-insensitively', () => {
  const txtContent = `================================================================================
language arts 3 sc
================================================================================

DAY 1 QUESTIONS

Question 1: Test?
A) Yes
Correct Answer: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');
  
  assert(result !== null, 'Should match class name case-insensitively');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
});

// Test 8: Skip DESE and IEP lines
test('Skip DESE Standard and IEP Goal Code lines', () => {
  const txtContent = `DAY 1 QUESTIONS

DESE Standard(s): 1.2.3
IEP Goal Code(s): ABC123

Question 1: Test?
A) Yes
Correct Answer: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');
  
  assert(result !== null, 'Should parse while skipping DESE/IEP lines');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question (not DESE/IEP)');
});

// Test 9: Mega-split format with 3-equals separator and short alias
test('Parse mega-split format with === separator and short alias', () => {
  const txtContent = `LA 4 SC
===
DAY 1 QUESTIONS - Chapter 29: Arrival

Question 1: How many days did it take to reach the new planet?
A) 5 days
B) 10 days
C) 15 days
Correct Answer: B

Question 2: What was the name of the ship?
A) Explorer
B) Discovery
C) Voyager
Correct Answer: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 4 SC', 'test.txt');
  
  assert(result !== null, 'Should parse mega-split format with short alias');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].label, 'DAY 1 QUESTIONS - Chapter 29: Arrival', 'Should include subtitle');
  assert.strictEqual(result.days[0].questions.length, 2, 'Should have 2 questions');
  assert.strictEqual(result.days[0].questions[0].text, 'How many days did it take to reach the new planet?', 'Should parse first question');
  assert.strictEqual(result.days[0].questions[1].text, 'What was the name of the ship?', 'Should parse second question');
});

// Test 10: Mega-split format with Life Skills LA short alias
test('Parse mega-split format with Life Skills LA short alias', () => {
  const txtContent = `Life Skills LA
===
DAY 1 QUESTIONS

Question 1: What is a good habit?
A) Brushing teeth
B) Skipping meals
Correct Answer: A`;

  const result = parseTxtToMeta(txtContent, 'Life Skills Language Arts SC', 'test.txt');
  
  assert(result !== null, 'Should parse Life Skills LA short alias');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
});

// Test 11: Week 6 format - Q1: style questions with ANSWER: and IEP Goal(s):
test('Parse Week 6 format with Q1: questions, ANSWER: and IEP Goal(s):', () => {
  const txtContent = `DAY 1 QUESTIONS

IEP Goal(s): S016.11.2-1, S019.10.1

Q1: Who attacks Alex at the beginning of the story?
A) A stranger
B) His brother
C) A dog
ANSWER: B

Q2: Where does the story take place?
A) A city
B) A farm
C) A forest
ANSWER: C`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse Week 6 Q1: format');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].questions.length, 2, 'Should have 2 questions');
  assert.strictEqual(result.days[0].questions[0].number, 1, 'First question number should be 1');
  assert.strictEqual(result.days[0].questions[0].text, 'Who attacks Alex at the beginning of the story?', 'Should parse Q1 text');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Should parse ANSWER: B as correct answer');
  assert.strictEqual(result.days[0].questions[1].number, 2, 'Second question number should be 2');
  assert.strictEqual(result.days[0].questions[1].correct, 'C', 'Should parse ANSWER: C as correct answer');
  // Day-level IEP goals (before Q1) should be attached to the day
  assert.deepStrictEqual(result.days[0].goal_codes, ['S016.11.2-1', 'S019.10.1'], 'Day-level IEP goals should be stored on the day');
});

// Test 12: IEP Goal(s): lines after a question are attached to that question
test('IEP Goal(s): lines after a question are stored on that question', () => {
  const txtContent = `DAY 1 QUESTIONS

Q1: Test question?
IEP Goal(s): S016.11.2-1
IEP Goal Code(s): S015.11.1-2
A) Yes
B) No
ANSWER: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse while extracting IEP Goal codes');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
  assert.strictEqual(result.days[0].questions[0].text, 'Test question?', 'Should parse question text correctly');
  assert.deepStrictEqual(result.days[0].questions[0].goal_codes, ['S016.11.2-1', 'S015.11.1-2'], 'Should store both IEP goal codes on the question');
});

// Test 13: Dashed DAY headers from mega-split format
test('Parse dashed DAY headers from mega-split format', () => {
  const txtContent = `LA 1 SC
===
--- DAY 1 QUESTIONS - Chapter 29: Arrival ---

Question 1: How long did it take the team to reach Okrent-ah?
A) 20 days; the horses were slow
B) 47 days; they had many close calls with animals and people
C) 25 days; the weather was bad
Correct Answer: B

--- DAY 4 WRITING PROMPT ---

Writing Prompt: What challenges did Alex and his team face?
Writing Structure:
- Topic Sentence: State the main idea
- Supporting Detail 1
Hints:
- Use at least ONE compound sentence
- Use at least THREE transition words`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 1 SC', 'test.txt');

  assert(result !== null, 'Should parse dashed DAY headers');
  assert.strictEqual(result.days.length, 2, 'Should have 2 days');
  assert.strictEqual(result.days[0].day_number, 1, 'First day should be day 1');
  assert.strictEqual(result.days[0].type, 'questions', 'Day 1 should be questions type');
  assert.strictEqual(result.days[0].questions.length, 1, 'Day 1 should have 1 question');
  assert.strictEqual(result.days[1].day_number, 4, 'Second day should be day 4');
  assert.strictEqual(result.days[1].type, 'writing_prompt', 'Day 4 should be writing_prompt type');
});

test('Parse A: colon-format choices', () => {
  const txtContent = `DAY 1 QUESTIONS

Q1: How many highwaymen attack Alex and his group?
A: Four
B: Six
C: Ten
Answer: B

Q2: What weapon does Werda-ak use?
A: A sword
B: A bow
C: A spear
Answer: C`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse A: colon-format choices');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].questions.length, 2, 'Should have 2 questions');
  assert.strictEqual(result.days[0].questions[0].choices.length, 3, 'Q1 should have 3 choices');
  assert.strictEqual(result.days[0].questions[0].choices[0].letter, 'A', 'First choice letter should be A');
  assert.strictEqual(result.days[0].questions[0].choices[0].text, 'Four', 'First choice text should be Four');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Q1 correct answer should be B');
  assert.strictEqual(result.days[0].questions[1].choices.length, 3, 'Q2 should have 3 choices');
  assert.strictEqual(result.days[0].questions[1].correct, 'C', 'Q2 correct answer should be C');
});

test('Parse mixed A) and A: format choices', () => {
  const txtContent = `DAY 1 QUESTIONS

Question 1: What is the capital?
A) Paris
B) London
Correct Answer: B

DAY 2 QUESTIONS

Q1: What color is the sky?
A: Blue
B: Red
C: Green
Answer: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse mixed format choices');
  assert.strictEqual(result.days.length, 2, 'Should have 2 days');
  assert.strictEqual(result.days[0].questions[0].choices.length, 2, 'Day 1 Q1 should have 2 choices');
  assert.strictEqual(result.days[1].questions[0].choices.length, 3, 'Day 2 Q1 should have 3 choices');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Day 1 correct answer');
  assert.strictEqual(result.days[1].questions[0].correct, 'A', 'Day 2 correct answer');
});

test('Parse WRITING WORKSHOP day type with REMEMBER YOUR WRITING STRUCTURE format', () => {
  const txtContent = `--- DAY 1: CHAPTER 17 - A WHIRLING DERVISH ---

Q1: Who attacks Alex?
A: Soldiers
B: Six highwaymen
C: Wild animals
Answer: B

--- DAY 4: WRITING WORKSHOP ---

WRITING PROMPT: Why does Alex agree to hunt the dandra-ta? Use details from Chapter 19.

REMEMBER YOUR WRITING STRUCTURE:
- Topic Sentence: Tell why Alex agrees
- Supporting Detail 1: What does Alex need?
- Conclusion: Restate your main idea

HINTS FOR YOUR RESPONSE:
- What is blocking Alex's path?
- What will he get if he wins?

Example start: "Alex agrees to hunt the dandra-ta because he needs to cross the lake."`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 1 SC', 'test.txt');

  assert(result !== null, 'Should parse WRITING WORKSHOP day');
  assert.strictEqual(result.days.length, 2, 'Should have 2 days');
  assert.strictEqual(result.days[0].type, 'questions', 'Day 1 should be questions');
  assert.strictEqual(result.days[0].questions.length, 1, 'Day 1 should have 1 question');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Day 1 Q1 correct answer');
  assert.strictEqual(result.days[1].type, 'writing_prompt', 'Day 4 should be writing_prompt');
  assert.strictEqual(result.days[1].day_number, 4, 'Day 4 number');
  assert(result.days[1].prompt.includes('dandra-ta'), 'Should capture writing prompt text');
  assert(result.days[1].structure.length >= 2, 'Should capture at least 2 structure items');
  assert(result.days[1].hints.length >= 1, 'Should capture at least 1 hint');
});

console.log('\n✅ All tests passed!');

test('Parse fill-in-the-blank question with Keywords line mixed with MCQ', () => {
  const txtContent = `DAY 1 QUESTIONS

Question 1: What is the capital of France?
A) London
B) Paris
C) Berlin
Correct Answer: B

Question 2: Explain the relationship between slope and y-intercept.
Keywords: slope;intercept;linear;min:2`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse fill-in-the-blank mixed with MCQ');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].questions.length, 2, 'Should have 2 questions');

  const q1 = result.days[0].questions[0];
  assert.strictEqual(q1.type, 'mcq', 'Q1 should be mcq');
  assert.strictEqual(q1.choices.length, 3, 'Q1 should have 3 choices');
  assert.strictEqual(q1.correct, 'B', 'Q1 correct should be B');

  const q2 = result.days[0].questions[1];
  assert.strictEqual(q2.type, 'fill_in_blank', 'Q2 should be fill_in_blank');
  assert.strictEqual(q2.choices.length, 0, 'Q2 should have 0 choices');
  assert.strictEqual(q2.correct, '', 'Q2 correct should be empty');
  assert.deepStrictEqual(q2.keywords, ['slope', 'intercept', 'linear'], 'Q2 keywords should be parsed');
  assert.strictEqual(q2.min_keywords, 2, 'Q2 min_keywords should be 2');
});

test('Parse fill-in-the-blank question with default min_keywords', () => {
  const txtContent = `DAY 1 QUESTIONS

Question 1: Name two parts of a cell.
Keywords: nucleus;membrane;mitochondria`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse fill-in-the-blank with default min_keywords');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');

  const q1 = result.days[0].questions[0];
  assert.strictEqual(q1.type, 'fill_in_blank', 'Q1 should be fill_in_blank');
  assert.deepStrictEqual(q1.keywords, ['nucleus', 'membrane', 'mitochondria'], 'Q1 keywords should be parsed');
  assert.strictEqual(q1.min_keywords, 2, 'Q1 min_keywords should default to 2');
});

test('Parse fill-in-the-blank with Q1: short format and min:3', () => {
  const txtContent = `DAY 1 QUESTIONS

Q1: Describe photosynthesis.
Keywords: sunlight;water;carbon dioxide;oxygen;min:3`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse Q1: fill-in-the-blank');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');

  const q1 = result.days[0].questions[0];
  assert.strictEqual(q1.type, 'fill_in_blank', 'Q1 should be fill_in_blank');
  assert.deepStrictEqual(q1.keywords, ['sunlight', 'water', 'carbon dioxide', 'oxygen'], 'Q1 keywords should be parsed');
  assert.strictEqual(q1.min_keywords, 3, 'Q1 min_keywords should be 3');
});

test('Parse mixed MCQ and fill-in-the-blank across multiple days', () => {
  const txtContent = `DAY 1 QUESTIONS

Q1: Who wrote Hamlet?
A) Dickens
B) Shakespeare
C) Austen
Answer: B

DAY 2 QUESTIONS

Q1: Describe two themes in Hamlet.
Keywords: revenge;betrayal;mortality;min:2

Q2: Where does Hamlet take place?
A) Denmark
B) England
C) France
Answer: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse mixed MCQ and fill-in-the-blank across days');
  assert.strictEqual(result.days.length, 2, 'Should have 2 days');

  const day1q1 = result.days[0].questions[0];
  assert.strictEqual(day1q1.type, 'mcq', 'Day 1 Q1 should be mcq');
  assert.strictEqual(day1q1.correct, 'B', 'Day 1 Q1 correct should be B');

  const day2q1 = result.days[1].questions[0];
  assert.strictEqual(day2q1.type, 'fill_in_blank', 'Day 2 Q1 should be fill_in_blank');
  assert.deepStrictEqual(day2q1.keywords, ['revenge', 'betrayal', 'mortality'], 'Day 2 Q1 keywords');
  assert.strictEqual(day2q1.min_keywords, 2, 'Day 2 Q1 min_keywords should be 2');

  const day2q2 = result.days[1].questions[1];
  assert.strictEqual(day2q2.type, 'mcq', 'Day 2 Q2 should be mcq');
  assert.strictEqual(day2q2.correct, 'A', 'Day 2 Q2 correct should be A');
});

// ── case:true / case:false parsing tests ─────────────────────────────────────

test('Parse Keywords with case:true sets case_sensitive=true and removes it from keywords', () => {
  const txtContent = `DAY 1 QUESTIONS

Question 1: Name the molecule.
Keywords: DNA;RNA;min:1;case:true`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse successfully');
  const q1 = result.days[0].questions[0];
  assert.strictEqual(q1.type, 'fill_in_blank', 'Should be fill_in_blank');
  assert.deepStrictEqual(q1.keywords, ['DNA', 'RNA'], 'keywords should not contain case:true');
  assert.strictEqual(q1.min_keywords, 1, 'min_keywords should be 1');
  assert.strictEqual(q1.case_sensitive, true, 'case_sensitive should be true');
});

test('Parse Keywords without case flag defaults case_sensitive to false', () => {
  const txtContent = `DAY 1 QUESTIONS

Question 1: Describe the graph.
Keywords: slope;intercept;min:2`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse successfully');
  const q1 = result.days[0].questions[0];
  assert.strictEqual(q1.type, 'fill_in_blank', 'Should be fill_in_blank');
  assert.deepStrictEqual(q1.keywords, ['slope', 'intercept'], 'keywords should be correct');
  assert.strictEqual(q1.min_keywords, 2, 'min_keywords should be 2');
  assert.strictEqual(q1.case_sensitive, false, 'case_sensitive should default to false');
});

test('Parse Keywords with case:false sets case_sensitive=false and removes it from keywords', () => {
  const txtContent = `DAY 1 QUESTIONS

Question 1: Identify the acids.
Keywords: pH;acid;base;case:false`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse successfully');
  const q1 = result.days[0].questions[0];
  assert.strictEqual(q1.type, 'fill_in_blank', 'Should be fill_in_blank');
  assert.deepStrictEqual(q1.keywords, ['pH', 'acid', 'base'], 'keywords should not contain case:false');
  assert.strictEqual(q1.case_sensitive, false, 'case_sensitive should be false');
});

test('Parse Keywords with case:true before min: still parses correctly', () => {
  const txtContent = `DAY 1 QUESTIONS

Question 1: Define the concept.
Keywords: DNA;RNA;case:true;min:2`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse successfully');
  const q1 = result.days[0].questions[0];
  assert.deepStrictEqual(q1.keywords, ['DNA', 'RNA'], 'keywords should be DNA and RNA only');
  assert.strictEqual(q1.min_keywords, 2, 'min_keywords should be 2');
  assert.strictEqual(q1.case_sensitive, true, 'case_sensitive should be true');
});

// ── Week 10 format tests ──────────────────────────────────────────────────────

test('Parse Week 10 bare-number question format with inline tags and A. choices', () => {
  const txtContent = `--- Day 1 — Chapter 29: Arrival ---

1. [MLS.L.4.B] [IG: S001.11.1]
   Break down the word 'pre-car-i-ous-ly' from Chapter 29. How many syllables?
   A. 4 syllables
   B. 5 syllables
   C. 3 syllables
   Correct: B
   Hint: Clap it out slowly — one clap for each part of the word.

2. [MLS.L.4.A] [IG: S001.11.2]
   In Chapter 29, the word 'unnerving' describes the winged lizards. Based on context, what does it mean?
   A. Making someone feel anxious, nervous, or uncomfortable
   B. Making someone feel happy, content, and very relaxed
   C. Making someone feel sleepy, drowsy, and very bored
   Correct: A
   Hint: Read the sentence with this word in it.`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse Week 10 format');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].day_number, 1, 'Day number should be 1');
  assert.strictEqual(result.days[0].type, 'questions', 'Day should be questions type');
  assert.strictEqual(result.days[0].questions.length, 2, 'Should have 2 questions');

  const q1 = result.days[0].questions[0];
  assert.strictEqual(q1.number, 1, 'Q1 number should be 1');
  assert.strictEqual(q1.text, "Break down the word 'pre-car-i-ous-ly' from Chapter 29. How many syllables?", 'Q1 text should be on next line');
  assert.strictEqual(q1.choices.length, 3, 'Q1 should have 3 choices');
  assert.strictEqual(q1.choices[0].letter, 'A', 'First choice letter should be A');
  assert.strictEqual(q1.choices[0].text, '4 syllables', 'First choice text should be "4 syllables"');
  assert.strictEqual(q1.correct, 'B', 'Q1 correct answer should be B');
  assert.strictEqual(q1.hint, 'Clap it out slowly — one clap for each part of the word.', 'Q1 hint should be parsed');
  assert.deepStrictEqual(q1.goal_codes, ['S001.11.1'], 'Q1 should have goal_codes from [IG:] tag');
  assert.deepStrictEqual(q1.dese_codes, ['MLS.L.4.B'], 'Q1 should have dese_codes from [MLS.*] tag');

  const q2 = result.days[0].questions[1];
  assert.strictEqual(q2.number, 2, 'Q2 number should be 2');
  assert.strictEqual(q2.correct, 'A', 'Q2 correct answer should be A');
  assert.deepStrictEqual(q2.goal_codes, ['S001.11.2'], 'Q2 should have goal_codes from [IG:] tag');
  assert.deepStrictEqual(q2.dese_codes, ['MLS.L.4.A'], 'Q2 should have dese_codes from [MLS.*] tag');
});

test('Parse Week 10 "Correct: X" answer format', () => {
  const txtContent = `DAY 1 QUESTIONS

1. What color is the sky?
   A. Blue
   B. Red
   C. Green
   Correct: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse Correct: format');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
  assert.strictEqual(result.days[0].questions[0].correct, 'A', 'Should parse "Correct: A" as correct answer A');
});

test('Parse Week 10 A. period-format choices', () => {
  const txtContent = `DAY 1 QUESTIONS

1. How many syllables in "beautiful"?
   A. 2
   B. 3
   C. 4
   Correct: B`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse A. choice format');
  assert.strictEqual(result.days[0].questions[0].choices.length, 3, 'Should have 3 choices');
  assert.strictEqual(result.days[0].questions[0].choices[0].letter, 'A', 'First choice letter A');
  assert.strictEqual(result.days[0].questions[0].choices[0].text, '2', 'First choice text');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Correct answer B');
});

test('Parse Week 10 multi-line question: tags on one line, text on next line', () => {
  const txtContent = `DAY 1 QUESTIONS

1. [MLS.R.2.A] [IG: S001.11.5]
   What is the main idea of Chapter 29?
   A. Alex arrives on a new planet
   B. Alex leaves his family
   Correct: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse multi-line question');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
  assert.strictEqual(result.days[0].questions[0].text, 'What is the main idea of Chapter 29?', 'Question text should come from next line');
  assert.deepStrictEqual(result.days[0].questions[0].goal_codes, ['S001.11.5'], 'Should have goal_codes');
  assert.deepStrictEqual(result.days[0].questions[0].dese_codes, ['MLS.R.2.A'], 'Should have dese_codes');
});

test('Parse Week 10 question with multiple inline [IG:] and [MLS.*] tags', () => {
  const txtContent = `DAY 4 QUESTIONS

25. [MLS.W.3.A] [MLS.R.3.A] [MLS.L.1.A] [IG: S001.11.3-1] [IG: S001.11.3-2]
   Write 2-3 sentences explaining how the author uses transition words.
   A. Yes
   B. No
   Correct: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse multiple inline tags');
  const q = result.days[0].questions[0];
  assert.strictEqual(q.number, 25, 'Question number should be 25');
  assert.deepStrictEqual(q.goal_codes, ['S001.11.3-1', 'S001.11.3-2'], 'Should have both [IG:] codes');
  assert.deepStrictEqual(q.dese_codes, ['MLS.W.3.A', 'MLS.R.3.A', 'MLS.L.1.A'], 'Should have all [MLS.*] codes');
});

test('Parse Week 10 True/False bare-number question', () => {
  const txtContent = `--- Day 1 — Chapter 29: Arrival ---

6. [MLS.L.1.A] [IG: S001.11.3-3] (True/False)
   True or False: In Chapter 29, 'Run!' is a complete sentence.
   A. True
   B. False
   Correct: A
   Hint: Go back to the chapter and think about whether this word can tell someone to do something.`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse True/False bare-number question');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
  const q = result.days[0].questions[0];
  assert.strictEqual(q.number, 6, 'Question number should be 6');
  assert.strictEqual(q.text, "True or False: In Chapter 29, 'Run!' is a complete sentence.", 'Should get text from next line');
  assert.strictEqual(q.choices.length, 2, 'Should have 2 choices (True/False)');
  assert.strictEqual(q.correct, 'A', 'Correct answer should be A');
  assert.deepStrictEqual(q.goal_codes, ['S001.11.3-3'], 'Should extract [IG:] code');
  assert.deepStrictEqual(q.dese_codes, ['MLS.L.1.A'], 'Should extract [MLS.*] code');
});

test('Parse Week 10 full excerpt with multiple days and questions', () => {
  const txtContent = `--- Day 1 — Chapter 29: Arrival ---

1. [MLS.L.4.B] [IG: S001.11.1]
   Break down the word 'pre-car-i-ous-ly' from Chapter 29. How many syllables?
   A. 4 syllables
   B. 5 syllables
   C. 3 syllables
   Correct: B
   Hint: Clap it out slowly.

2. [MLS.L.4.A] [IG: S001.11.2]
   What does 'unnerving' mean in context?
   A. Anxious or uncomfortable
   B. Happy and content
   C. Sleepy and bored
   Correct: A
   Hint: Read the sentence.

--- Day 4 — Written Response ---

25. [MLS.W.3.A] [IG: S001.11.3-1] (Written Response)
   Write 2-3 sentences about transition words.
   HINTS:
   - Pick one specific word.`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse full Week 10 excerpt');
  assert.strictEqual(result.days.length, 2, 'Should have 2 days');

  const day1 = result.days[0];
  assert.strictEqual(day1.day_number, 1, 'Day 1 number');
  assert.strictEqual(day1.type, 'questions', 'Day 1 should be questions');
  assert.strictEqual(day1.questions.length, 2, 'Day 1 should have 2 questions');
  assert.strictEqual(day1.questions[0].correct, 'B', 'Day 1 Q1 correct');
  assert.strictEqual(day1.questions[1].correct, 'A', 'Day 1 Q2 correct');

  const day2 = result.days[1];
  assert.strictEqual(day2.day_number, 4, 'Day 4 number');
  assert.strictEqual(day2.type, 'writing_prompt', 'Day 4 should be writing_prompt');
});

test('Parse Week 10 Written Response day with bare-number question format', () => {
  const txtContent = `--- Day 4 — Written Response ---

25. [MLS.W.3.A] [MLS.R.3.A] [MLS.L.1.A] [IG: S001.11.3-1] [IG: S001.11.3-2] (Written Response)
   Based on Chapters 29-31, write 2-3 sentences explaining how the author uses transition words to connect ideas. Give a specific example and explain what that word does in the sentence.
   HINTS:
   - Pick one specific word from the chapters (like 'so,' 'but,' 'though,' etc.)
   - Find the sentence it appears in
   - Explain what job that word does between the two ideas`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse Week 10 Written Response day');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');

  const day = result.days[0];
  assert.strictEqual(day.day_number, 4, 'Day number should be 4');
  assert.strictEqual(day.type, 'writing_prompt', 'Day type should be writing_prompt');
  assert(day.prompt && day.prompt.length > 0, 'prompt should be populated');
  assert(day.prompt.includes('Based on Chapters 29-31'), 'prompt should contain the question text');
  assert(day.prompt.includes('transition words'), 'prompt should contain continuation text');
  assert.deepStrictEqual(day.goal_codes, ['S001.11.3-1', 'S001.11.3-2'], 'Should have both [IG:] codes');
  assert.deepStrictEqual(day.dese_codes, ['MLS.W.3.A', 'MLS.R.3.A', 'MLS.L.1.A'], 'Should have all [MLS.*] codes');
  assert.strictEqual(day.hints.length, 3, 'Should have 3 hint bullets');
  assert(day.hints[0].includes("Pick one specific word"), 'First hint should match');
});

test('Warning logged when questions-type day has 0 questions', () => {
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  const txtContent = `DAY 1 QUESTIONS

DAY 2 QUESTIONS

Question 1: What is 1+1?
A) 2
B) 3
Correct Answer: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');
  console.warn = origWarn;

  assert(result !== null, 'Should parse successfully');
  assert.strictEqual(warnings.length, 1, 'Should have 1 warning for empty-questions day');
  assert(warnings[0].includes('Day 1'), 'Warning should mention Day 1');
  assert(warnings[0].includes('0 questions'), 'Warning should mention 0 questions');
});

// Test: Chapter header format ("--- Chapter N: Title ---" → Chapter N as day)
test('Parse Chapter header format into day_number', () => {
  const txtContent = `--- Chapter 35: Harta-ak ---

1. [IG: S002.11.2]
   Based on Chapter 35, what can you figure out?
   A. Choice A
   B. Choice B
   C. Choice C
   Correct: B

--- Chapter 36: Possible Answers ---

2. [IG: S002.11.2]
   In Chapter 36, what can you conclude?
   A. Choice A
   B. Choice B
   C. Choice C
   Correct: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse chapter header format');
  assert.strictEqual(result.days.length, 2, 'Should have 2 chapters as days');
  assert.strictEqual(result.days[0].day_number, 35, 'First chapter should be day 35');
  assert.strictEqual(result.days[0].label, 'Chapter 35: Harta-ak', 'First chapter label should match');
  assert.strictEqual(result.days[0].type, 'questions', 'Chapter day should be questions type');
  assert.strictEqual(result.days[0].questions.length, 1, 'Chapter 35 should have 1 question');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Q1 correct answer should be B');
  assert.strictEqual(result.days[1].day_number, 36, 'Second chapter should be day 36');
  assert.strictEqual(result.days[1].questions.length, 1, 'Chapter 36 should have 1 question');
  assert.strictEqual(result.days[1].questions[0].correct, 'A', 'Q2 correct answer should be A');
});

// Test: Per-student TXT format with multi-line header block containing "Class:" field
test('Parse per-student TXT format with Class: field in === header block', () => {
  const txtContent = `================================================================================
WEEK 12 — Lost in Kragdon-ah (Chapters 35–37)
ELA Theme: Making Inferences / Drawing Conclusions
Student: S002 | Class: Language Arts 3 SC
IEP Goal Codes: S002.11.1, S002.11.2
================================================================================

--- Chapter 35: Harta-ak ---

1. [IG: S002.11.2]
   Based on Chapter 35, what can you figure out?
   A. Choice A
   B. Choice B
   C. Choice C
   Correct: B

--- Chapter 36: Possible Answers ---

2. [IG: S002.11.2]
   In Chapter 36, what can you conclude?
   A. Choice A
   B. Choice B
   C. Choice C
   Correct: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse per-student TXT format');
  assert.strictEqual(result.days.length, 2, 'Should have 2 chapters as days');
  assert.strictEqual(result.days[0].day_number, 35, 'Chapter 35 should be day 35');
  assert.strictEqual(result.days[0].questions.length, 1, 'Chapter 35 should have 1 question');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Q1 correct answer should be B');
  assert.strictEqual(result.days[1].day_number, 36, 'Chapter 36 should be day 36');
  assert.strictEqual(result.days[1].questions.length, 1, 'Chapter 36 should have 1 question');
});

// Test: Per-student TXT format with short alias in Class: field
test('Parse per-student TXT with short alias in Class: field', () => {
  const txtContent = `================================================================================
WEEK 12 — Test Assignment
Student: S007 | Class: LA 3 SC
IEP Goal Codes: S007.11.1
================================================================================

--- Chapter 35: Test Chapter ---

1. [IG: S007.11.1]
   What is the main idea?
   A. Answer A
   B. Answer B
   Correct: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse per-student TXT with short alias in Class: field');
  assert.strictEqual(result.days.length, 1, 'Should have 1 chapter');
  assert.strictEqual(result.days[0].day_number, 35, 'Should be chapter 35');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
});

// Test: Chapter header with em-dash separator ("Chapter N — Title")
test('Parse Chapter header with em-dash separator', () => {
  const txtContent = `--- Chapter 37 — Before the Rescue ---

1. [IG: S002.11.2]
   In Chapter 37, what happens?
   A. Choice A
   B. Choice B
   Correct: B`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse chapter with em-dash separator');
  assert.strictEqual(result.days.length, 1, 'Should have 1 chapter');
  assert.strictEqual(result.days[0].day_number, 37, 'Should be chapter 37');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
});

// ── Chapter header format regression tests (Week 13 parser fix) ───────────────
// These tests cover content shapes that were NOT previously handled and caused
// parseTxtToMeta to return null, which in turn caused the issuance function to
// silently write meta = {} — the root cause of the Week 13 orphaned-row bug.

test('Parse Chapter header with NO separator (Cause and Effect shape)', () => {
  // "Chapter 38 Cause and Effect" — no colon, dash, or em-dash between the
  // chapter number and the subtitle.  This is the Week 13 content shape that
  // previously made the parser return null.
  const txtContent = `Chapter 38 Cause and Effect

1. [IG: S011.13.1-1] [MLS.DESE] What event at the end of Chapter 38 caused the village to flee?
A) A wildfire broke out
B) The river flooded the valley
C) An earthquake destroyed the bridge
Correct: B`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse "Chapter N Title" (no separator) as a chapter header');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].day_number, 38, 'Chapter 38 should become day 38');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Correct answer should be B');
});

test('Parse plural "Chapters N–M" with en-dash range and separator', () => {
  // "Chapters 38–40: Cause and Effect" — en-dash range in chapter number, plural.
  const txtContent = `Chapters 38–40: Cause and Effect

1. [IG: S011.13.1-1] [MLS.DESE] What caused the village to flee?
A) A wildfire
B) A flood
C) An earthquake
Correct: B

2. [IG: S011.13.1-2] [MLS.DESE] [T/F] The villagers were prepared for the flood.
Correct: FALSE`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse "Chapters N–M: Title" header');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].day_number, 38, 'First chapter in range (38) should be used as day number');
  assert.strictEqual(result.days[0].questions.length, 2, 'Should have 2 questions');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Q1 correct answer should be B');
  assert.strictEqual(result.days[0].questions[1].type, 'boolean', 'Q2 should be boolean type');
  assert.strictEqual(result.days[0].questions[1].correct, 'B', 'Q2 correct: FALSE → B');
});

test('Parse standalone "Chapter N" with no title', () => {
  // "Chapter 38" with no title at all — bare chapter number header.
  const txtContent = `Chapter 38

1. What happened in chapter 38?
A) Nothing
B) Something important
Correct: B`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse bare "Chapter N" header');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].day_number, 38, 'Chapter 38 should become day 38');
  assert.strictEqual(result.days[0].questions.length, 1, 'Should have 1 question');
});

test('Parse multi-chapter Cause-and-Effect file (Week 13 realistic shape)', () => {
  // Simulates the actual Week 13 "LOST IN KRAGDON-AH (CHAPTERS 38–40) Cause and Effect"
  // file that reproducibly produced empty meta.  Each chapter uses the no-separator format
  // that caused the original parser failure.
  const txtContent = `Chapter 38 Cause and Effect

1. [IG: S011.13.1-1] [MLS.DESE] What event at the end of Chapter 38 caused the village to flee?
A) A wildfire
B) The river flooded the valley
C) An earthquake
Correct: B

2. [IG: S011.13.1-2] [MLS.DESE] [T/F] The villagers were prepared for the flood in Chapter 38.
Correct: FALSE

Chapter 39 Cause and Effect

1. [IG: S011.13.2-1] [MLS.DESE] In Chapter 39, what caused Kragdon-ah to turn back?
A) He heard a cry for help
B) He saw the storm
C) He was too tired
Correct: A

Chapter 40 Cause and Effect

1. [IG: S011.13.3-1] [MLS.DESE] What was the long-term effect of Kragdon-ah returning in Chapter 40?
A) The village was rebuilt stronger
B) He lost his chance to reach the coast
C) The hunters rewarded him
Correct: A`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'WEEK_13_CAUSE_EFFECT.txt');

  assert(result !== null, 'Should parse Week 13 Cause-and-Effect file with no-separator chapter headers');
  assert.strictEqual(result.days.length, 3, 'Should have 3 days (one per chapter)');

  assert.strictEqual(result.days[0].day_number, 38, 'Chapter 38 → day 38');
  assert.strictEqual(result.days[0].questions.length, 2, 'Chapter 38 should have 2 questions');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Ch38 Q1 correct should be B');
  assert.strictEqual(result.days[0].questions[1].type, 'boolean', 'Ch38 Q2 should be boolean');
  assert.strictEqual(result.days[0].questions[1].correct, 'B', 'Ch38 Q2 correct: FALSE → B');

  assert.strictEqual(result.days[1].day_number, 39, 'Chapter 39 → day 39');
  assert.strictEqual(result.days[1].questions.length, 1, 'Chapter 39 should have 1 question');
  assert.strictEqual(result.days[1].questions[0].correct, 'A', 'Ch39 Q1 correct should be A');

  assert.strictEqual(result.days[2].day_number, 40, 'Chapter 40 → day 40');
  assert.strictEqual(result.days[2].questions.length, 1, 'Chapter 40 should have 1 question');
  assert.strictEqual(result.days[2].questions[0].correct, 'A', 'Ch40 Q1 correct should be A');
});



test('Week 13: [T/F] bracket tag sets type to boolean and strips tag from text', () => {
  const txtContent = `DAY 1 QUESTIONS

1. [IG: S011.13.1-2] [MLS.DESE] [T/F] In Chapter 38, the hunters found Kragdon-ah sleeping.
Correct: TRUE
Hint: Re-read the first paragraph of Chapter 38.`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse [T/F] question');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  const q = result.days[0].questions[0];
  assert.strictEqual(q.number, 1, 'Question number should be 1');
  assert.strictEqual(q.type, 'boolean', 'Question type should be boolean');
  assert(!q.text.includes('[T/F]'), 'Question text should not contain [T/F] tag');
  assert.strictEqual(q.choices.length, 2, 'Should have True/False choices');
  assert.strictEqual(q.choices[0].text, 'True', 'First choice should be True');
  assert.strictEqual(q.choices[1].text, 'False', 'Second choice should be False');
  assert.strictEqual(q.correct, 'A', 'Correct: TRUE maps to choice A (True)');
  assert.strictEqual(q.hint, 'Re-read the first paragraph of Chapter 38.', 'Hint should be parsed');
  assert.deepStrictEqual(q.goal_codes, ['S011.13.1-2'], 'IEP goal codes should be extracted');
  assert.deepStrictEqual(q.dese_codes, ['MLS.DESE'], 'DESE codes should be extracted');
});

test('Week 13: Correct: FALSE parsed correctly for [T/F] question', () => {
  const txtContent = `DAY 1 QUESTIONS

1. [IG: S011.13.1-3] [MLS.DESE] [T/F] The main character chose to leave Kragdon-ah behind.
Correct: FALSE
Hint: Think about what the character valued most.`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse [T/F] FALSE question');
  const q = result.days[0].questions[0];
  assert.strictEqual(q.type, 'boolean', 'Should be boolean type');
  assert.strictEqual(q.choices.length, 2, 'Should have True/False choices');
  assert.strictEqual(q.correct, 'B', 'Correct: FALSE maps to choice B (False)');
});

test('Week 13: [Fill in the Blank] bracket tag sets type and Accepted: parses pipe-separated alternatives', () => {
  const txtContent = `DAY 2 QUESTIONS

3. [IG: S011.13.2-1] [MLS.DESE] [Fill in the Blank] The relationship between the storm and the flood is an example of ___ and effect.
Accepted: cause | causes | cause-and-effect
Hint: Think about the ELA theme of this assignment.`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'test.txt');

  assert(result !== null, 'Should parse [Fill in the Blank] question');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  const q = result.days[0].questions[0];
  assert.strictEqual(q.number, 3, 'Question number should be 3');
  assert.strictEqual(q.type, 'fill_in_blank', 'Question type should be fill_in_blank');
  assert(!q.text.includes('[Fill in the Blank]'), 'Question text should not contain [Fill in the Blank] tag');
  assert.deepStrictEqual(q.accepted, ['cause', 'causes', 'cause-and-effect'], 'Accepted alternatives should be pipe-split');
  assert.strictEqual(q.hint, 'Think about the ELA theme of this assignment.', 'Hint should be parsed');
});

test('Week 13: Mixed MCQ, T/F, and FIB questions across 3 days', () => {
  const txtContent = `DAY 1 QUESTIONS

1. [IG: S011.13.1-1] [MLS.DESE] What event at the end of Chapter 38 caused the village to flee?
A) A wildfire broke out
B) The river flooded the valley
C) An earthquake destroyed the bridge
Correct: B
Hint: Look for the cause-and-effect chain near the end of the chapter.

2. [IG: S011.13.1-2] [MLS.DESE] [T/F] The villagers were prepared for the flood described in Chapter 38.
Correct: FALSE
Hint: Re-read the opening scene.

3. [IG: S011.13.1-3] [MLS.DESE] [Fill in the Blank] Because the bridge was destroyed, the village was ___ from supplies.
Accepted: cut off | isolated | separated
Hint: Think about what the bridge provided.

DAY 2 QUESTIONS

1. [IG: S011.13.2-1] [MLS.DESE] In Chapter 39, what caused Kragdon-ah to turn back?
A) He heard a cry for help
B) He saw the storm approaching
C) He was too tired to continue
Correct: A
Hint: Pay attention to sounds described at the start of the chapter.

2. [IG: S011.13.2-2] [MLS.DESE] [T/F] Kragdon-ah's decision to turn back had no effect on the story's outcome.
Correct: FALSE
Hint: Consider the chain of events that followed.

3. [IG: S011.13.2-3] [MLS.DESE] [Fill in the Blank] Kragdon-ah turned back because he heard a ___ from the valley below.
Accepted: cry | scream | shout | call for help
Hint: Listen carefully to what Kragdon-ah noticed.

DAY 3 QUESTIONS

1. [IG: S011.13.3-1] [MLS.DESE] What was the long-term effect of Kragdon-ah returning to the village in Chapter 40?
A) The village was rebuilt stronger than before
B) He lost his chance to reach the coast
C) The hunters rewarded him with land
Correct: A
Hint: Think about what Kragdon-ah helped the villagers accomplish.

2. [IG: S011.13.3-2] [MLS.DESE] [T/F] Chapter 40 ends with Kragdon-ah leaving the village permanently.
Correct: FALSE
Hint: Re-read the final paragraph.`;

  const result = parseTxtToMeta(txtContent, 'Language Arts 3 SC', 'WEEK_13_MASTER_ALL_STUDENTS (2).txt');

  assert(result !== null, 'Should parse Week 13 3-day mixed format');
  assert.strictEqual(result.days.length, 3, 'Should have 3 days');

  // Day 1 checks
  const day1 = result.days[0];
  assert.strictEqual(day1.day_number, 1, 'Day 1 number');
  assert.strictEqual(day1.questions.length, 3, 'Day 1 should have 3 questions');

  const d1q1 = day1.questions[0];
  assert.strictEqual(d1q1.type, 'mcq', 'Day 1 Q1 should be MCQ');
  assert.strictEqual(d1q1.correct, 'B', 'Day 1 Q1 correct should be B');
  assert.strictEqual(d1q1.choices.length, 3, 'Day 1 Q1 should have 3 choices');

  const d1q2 = day1.questions[1];
  assert.strictEqual(d1q2.type, 'boolean', 'Day 1 Q2 should be boolean');
  assert.strictEqual(d1q2.choices.length, 2, 'Day 1 Q2 should have True/False choices');
  assert.strictEqual(d1q2.correct, 'B', 'Day 1 Q2 correct: FALSE → B');
  assert(!d1q2.text.includes('[T/F]'), 'Day 1 Q2 text should not contain [T/F]');

  const d1q3 = day1.questions[2];
  assert.strictEqual(d1q3.type, 'fill_in_blank', 'Day 1 Q3 should be fill_in_blank');
  assert.deepStrictEqual(d1q3.accepted, ['cut off', 'isolated', 'separated'], 'Day 1 Q3 accepted alternatives');
  assert(!d1q3.text.includes('[Fill in the Blank]'), 'Day 1 Q3 text should not contain [Fill in the Blank]');

  // Day 2 checks
  const day2 = result.days[1];
  assert.strictEqual(day2.day_number, 2, 'Day 2 number');
  assert.strictEqual(day2.questions.length, 3, 'Day 2 should have 3 questions');
  assert.strictEqual(day2.questions[1].type, 'boolean', 'Day 2 Q2 should be boolean');
  assert.strictEqual(day2.questions[1].correct, 'B', 'Day 2 Q2 correct: FALSE → B');
  assert.deepStrictEqual(day2.questions[2].accepted, ['cry', 'scream', 'shout', 'call for help'], 'Day 2 Q3 accepted alternatives');

  // Day 3 checks
  const day3 = result.days[2];
  assert.strictEqual(day3.day_number, 3, 'Day 3 number');
  assert.strictEqual(day3.questions.length, 2, 'Day 3 should have 2 questions');
  assert.strictEqual(day3.questions[0].type, 'mcq', 'Day 3 Q1 should be MCQ');
  assert.strictEqual(day3.questions[1].type, 'boolean', 'Day 3 Q2 should be boolean');
});

test('Week 13: DESE-only student (no [IG:] prefix) with [T/F] and Accepted:', () => {
  // Students S038, S039, S043, S046 have IEP Goal Codes: DESE Only (No ELA IEP Goals).
  // Their questions have only [MLS.DESE] tags with no [IG: ...] prefix.
  const txtContent = `DAY 1 QUESTIONS

1. [MLS.DESE] [T/F] The event in Chapter 38 had a negative effect on the village.
Correct: TRUE
Hint: Think about what happened to the village.

2. [MLS.DESE] [Fill in the Blank] Because the flood came suddenly, the villagers had no time to ___.
Accepted: prepare | escape | evacuate
Hint: Consider what the lack of warning meant for the villagers.

3. [MLS.DESE] What was the primary cause of the flood in Chapter 38?
A) Heavy rainfall upstream
B) A dam breaking
C) The river changing course
Correct: A
Hint: Re-read the description of the storm.`;

  const result = parseTxtToMeta(txtContent, 'Life Skills Language Arts SC', 'WEEK_13_MASTER_ALL_STUDENTS (2).txt');

  assert(result !== null, 'Should parse DESE-only student (no [IG:] codes)');
  assert.strictEqual(result.days.length, 1, 'Should have 1 day');
  assert.strictEqual(result.days[0].questions.length, 3, 'Should have 3 questions');

  const q1 = result.days[0].questions[0];
  assert.strictEqual(q1.type, 'boolean', 'Q1 should be boolean');
  assert.strictEqual(q1.choices.length, 2, 'Q1 should have True/False choices');
  assert.strictEqual(q1.correct, 'A', 'Q1 correct: TRUE → A');
  assert(!q1.goal_codes || q1.goal_codes.length === 0, 'Q1 should have no IEP goal codes');
  assert.deepStrictEqual(q1.dese_codes, ['MLS.DESE'], 'Q1 should have DESE code');

  const q2 = result.days[0].questions[1];
  assert.strictEqual(q2.type, 'fill_in_blank', 'Q2 should be fill_in_blank');
  assert.deepStrictEqual(q2.accepted, ['prepare', 'escape', 'evacuate'], 'Q2 accepted alternatives');

  const q3 = result.days[0].questions[2];
  assert.strictEqual(q3.type, 'mcq', 'Q3 should be MCQ');
  assert.strictEqual(q3.correct, 'A', 'Q3 correct should be A');
});

test('Week 13: round-trip — body extracted by parseStudentSections parses correctly for S011', () => {
  // Simulate the body that parseStudentSections would extract for student S011
  // from the WEEK_13_MASTER_ALL_STUDENTS file (Week 10-style header, body only).
  const s011Body = `DAY 1 QUESTIONS

1. [IG: S011.13.1-1] [MLS.DESE] What event at the end of Chapter 38 caused the villagers to flee?
A) A wildfire
B) A flood
C) An earthquake
Correct: B
Hint: Look for the cause-and-effect chain.

2. [IG: S011.13.1-2] [MLS.DESE] [T/F] The villagers were warned about the flood in advance.
Correct: FALSE
Hint: Re-read the opening scene.

3. [IG: S011.13.1-3] [MLS.DESE] [Fill in the Blank] Because the bridge was destroyed, the village was ___ from supplies.
Accepted: cut off | isolated
Hint: Think about what the bridge provided.

DAY 2 QUESTIONS

1. [IG: S011.13.2-1] [MLS.DESE] In Chapter 39, what caused Kragdon-ah to turn back?
A) He heard a cry for help
B) He saw the storm
C) He was tired
Correct: A
Hint: Pay attention to sounds.`;

  const result = parseTxtToMeta(s011Body, 'Language Arts 3 SC', 'WEEK_13_MASTER_ALL_STUDENTS (2).txt');

  assert(result !== null, 'Should parse S011 section body extracted by parseStudentSections');
  assert.strictEqual(result.days.length, 2, 'Should have 2 days');
  assert.strictEqual(result.days[0].questions.length, 3, 'Day 1 should have 3 questions');
  assert.strictEqual(result.days[1].questions.length, 1, 'Day 2 should have 1 question');

  assert.strictEqual(result.days[0].questions[0].type, 'mcq', 'Day 1 Q1 should be MCQ');
  assert.strictEqual(result.days[0].questions[0].correct, 'B', 'Day 1 Q1 correct is B');

  assert.strictEqual(result.days[0].questions[1].type, 'boolean', 'Day 1 Q2 should be boolean');
  assert.strictEqual(result.days[0].questions[1].choices.length, 2, 'Day 1 Q2 should have True/False choices');
  assert.strictEqual(result.days[0].questions[1].correct, 'B', 'Day 1 Q2 correct: FALSE → B');

  assert.strictEqual(result.days[0].questions[2].type, 'fill_in_blank', 'Day 1 Q3 should be fill_in_blank');
  assert.deepStrictEqual(result.days[0].questions[2].accepted, ['cut off', 'isolated'], 'Day 1 Q3 accepted alternatives');
});
