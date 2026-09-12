export function parseAssignmentMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeChoices(rawChoices) {
  if (Array.isArray(rawChoices)) {
    return rawChoices.map((entry, index) => {
      const fallbackKey = String.fromCharCode(65 + index);
      if (entry == null) {
        return { key: fallbackKey, value: fallbackKey, text: '' };
      }
      if (typeof entry !== 'object') {
        return { key: fallbackKey, value: fallbackKey, text: String(entry) };
      }
      const explicitKey = firstText(entry.key, entry.letter, entry.id);
      const displayText = firstText(entry.text, entry.label, entry.answer, entry.value);
      const value = entry.value != null ? String(entry.value) : (explicitKey || fallbackKey);
      return {
        key: explicitKey || fallbackKey,
        value,
        text: displayText || value,
      };
    });
  }

  if (rawChoices && typeof rawChoices === 'object') {
    return Object.entries(rawChoices).map(([key, value]) => {
      const text = value && typeof value === 'object'
        ? firstText(value.text, value.label, value.answer, value.value) || String(key)
        : String(value ?? '');
      return { key: String(key), value: String(key), text };
    });
  }

  return [];
}

export function questionText(question) {
  return firstText(
    question?.text,
    question?.question,
    question?.label,
    question?.prompt,
    question?.stem,
  );
}

function makeQuestionRecord(ref, question = {}, extras = {}) {
  return {
    ref: String(ref || '').trim(),
    text: questionText(question),
    choices: normalizeChoices(
      question.choices ?? question.options ?? question.answers ?? extras.choices
    ),
    correct: question.correct ?? question.answer ?? extras.correct ?? null,
    type: firstText(question.type, question.answer_type, extras.type),
    goalCodes: arrayValue(question.goal_codes ?? question.default_goal_codes ?? extras.goalCodes),
    deseCodes: arrayValue(question.dese_codes ?? question.default_dese_codes ?? extras.deseCodes),
  };
}

export function buildQuestionLookup(assignment) {
  const meta = parseAssignmentMeta(assignment?.meta);
  const lookup = new Map();

  if (Array.isArray(meta.days)) {
    for (const day of meta.days) {
      if (day?.type === 'questions' && Array.isArray(day.questions)) {
        day.questions.forEach((question, index) => {
          const number = question?.number ?? question?.question_number ?? (index + 1);
          const ref = question?.item_ref || question?.q_ref || `${day.day_number}_${number}`;
          lookup.set(String(ref), makeQuestionRecord(ref, question));
        });
      } else if (day?.type === 'writing_prompt') {
        const ref = day.item_ref || `WP_${day.day_number}`;
        lookup.set(String(ref), makeQuestionRecord(ref, {
          ...day,
          text: day.prompt || day.text || '',
          type: 'written_response',
        }));
      }
    }
  }

  if (Array.isArray(meta.questions)) {
    meta.questions.forEach((question, index) => {
      const ref = question?.q_ref || question?.item_ref || question?.ref || `Q${index + 1}`;
      if (!lookup.has(String(ref))) {
        lookup.set(String(ref), makeQuestionRecord(ref, question));
      }
    });
  }

  if (Array.isArray(meta.items)) {
    meta.items.forEach((question, index) => {
      const ref = question?.item_ref || question?.q_ref || question?.ref || `Q${index + 1}`;
      if (!lookup.has(String(ref))) {
        lookup.set(String(ref), makeQuestionRecord(ref, question));
      }
    });
  }

  return lookup;
}

function unwrapAnswer(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return value;
  if (value.value !== undefined) return value.value;
  if (value.answer !== undefined) return value.answer;
  if (value.selected !== undefined) return value.selected;
  if (value.raw_answer !== undefined) return value.raw_answer;
  return value;
}

export function formatAnswer(value) {
  const unwrapped = unwrapAnswer(value);
  if (unwrapped == null || unwrapped === '') return '—';
  if (Array.isArray(unwrapped)) return unwrapped.map(formatAnswer).join(', ');
  if (typeof unwrapped === 'object') {
    try {
      return JSON.stringify(unwrapped);
    } catch (_) {
      return String(unwrapped);
    }
  }
  return String(unwrapped);
}

function normalizedToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\s*[([]?([a-z0-9]+)[\]).:-]?\s*$/i, '$1');
}

export function answerTokens(value) {
  const unwrapped = unwrapAnswer(value);
  if (unwrapped == null) return [];
  if (Array.isArray(unwrapped)) {
    return unwrapped.flatMap(answerTokens).filter(Boolean);
  }
  if (typeof unwrapped === 'object') return [normalizedToken(formatAnswer(unwrapped))].filter(Boolean);

  const raw = String(unwrapped).trim();
  if (!raw) return [];
  const tokens = [raw];
  if (/[;|]/.test(raw)) tokens.push(...raw.split(/[;|]/g));
  return [...new Set(tokens.map(normalizedToken).filter(Boolean))];
}

export function choiceMatches(answer, choice, index = 0) {
  const tokens = answerTokens(answer);
  if (!tokens.length) return false;
  const letter = String.fromCharCode(65 + index);
  const candidates = new Set([
    choice?.key,
    choice?.value,
    choice?.text,
    letter,
    String(index + 1),
    `${letter}) ${choice?.text || ''}`,
    `${letter}. ${choice?.text || ''}`,
  ].map(normalizedToken).filter(Boolean));
  return tokens.some(token => candidates.has(token));
}

export function choicesForQuestion(question, answerType = '') {
  const choices = normalizeChoices(question?.choices || []);
  if (choices.length) return choices;
  if (String(answerType).toLowerCase() === 'boolean') {
    return [
      { key: 'T', value: 'true', text: 'True' },
      { key: 'F', value: 'false', text: 'False' },
    ];
  }
  return [];
}

export function classifyOutcome(pointsText) {
  const match = String(pointsText || '').match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!match) return 'unknown';
  const earned = Number(match[1]);
  const maximum = Number(match[2]);
  if (!Number.isFinite(earned) || !Number.isFinite(maximum) || maximum <= 0) return 'unknown';
  if (earned >= maximum) return 'correct';
  if (earned > 0) return 'partial';
  return 'incorrect';
}
