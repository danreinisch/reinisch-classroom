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

    // Check for DAY header (trailing content is optional)
    const dayMatch = trimmed.match(/^DAY\s+(\d+)\b(.*)$/i);
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
      let dayLabel = trimmed;
      const dayType = trimmed.toUpperCase().includes('WRITING PROMPT') ? 'writing_prompt' : 'questions';

      // Check if the next non-empty line is a subtitle
      let nextLineIndex = i + 1;
      while (nextLineIndex < classLines.length && !classLines[nextLineIndex].trim()) {
        nextLineIndex++;
      }
      
      if (nextLineIndex < classLines.length) {
        const nextLine = classLines[nextLineIndex].trim();
        // If the next line is not a special marker, it might be a subtitle
        const isSpecialLine = nextLine.match(/^(Question\s+\d+:|DESE\s+Standard|IEP\s+Goal\s+Code|[A-Z]\)|Correct\s+Answer:|Hint:|Writing\s+Prompt:|Writing\s+Structure:|Hints?:)/i);
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

    if (!currentDay) continue;

    // Skip DESE Standard(s) and IEP Goal Code(s) lines
    if (trimmed.startsWith('DESE Standard') || trimmed.startsWith('IEP Goal Code')) {
      continue;
    }

    if (currentDay.type === 'questions') {
      // Check for Question N:
      const questionMatch = trimmed.match(/^Question\s+(\d+):/i);
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
        
        const questionText = trimmed.substring(questionMatch[0].length).trim();
        if (questionText) {
          currentQuestion.text = questionText;
        }
        continue;
      }

      if (currentQuestion) {
        // Check for choices
        const choiceMatch = trimmed.match(/^([A-Z])\)\s*(.*)$/);
        if (choiceMatch) {
          currentQuestion.choices.push({
            letter: choiceMatch[1],
            text: choiceMatch[2].trim()
          });
          continue;
        }

        // Check for Correct Answer
        const correctMatch = trimmed.match(/^Correct\s+Answer:\s*([A-Z])/i);
        if (correctMatch) {
          currentQuestion.correct = correctMatch[1];
          continue;
        }

        // Check for Hint
        const hintMatch = trimmed.match(/^Hint:\s*(.*)$/i);
        if (hintMatch) {
          currentQuestion.hint = hintMatch[1].trim();
          continue;
        }

        // Append to question text
        if (currentSection === 'question' && !choiceMatch && !correctMatch && !hintMatch) {
          if (currentQuestion.text) {
            currentQuestion.text += ' ' + trimmed;
          } else {
            currentQuestion.text = trimmed;
          }
        }
      }
    }
  }

  // Save last day
  if (currentDay) {
    if (currentQuestion && currentDay.type === 'questions') {
      currentDay.questions.push(currentQuestion);
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

console.log('\n✅ All tests passed!');
