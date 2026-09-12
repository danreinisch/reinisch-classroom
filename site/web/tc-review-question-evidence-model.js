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

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/gi, ' ');
}

function stripHtml(value) {
  return decodeHtmlEntities(
    String(value ?? '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, ' ')
      .replace(/<button\b[^>]*\btts-btn\b[^>]*>[\s\S]*?<\/button\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function attrValue(tag, name) {
  const match = String(tag || '').match(
    new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i')
  );
  return match ? decodeHtmlEntities(match[2]).trim() : '';
}

function hasBareAttribute(tag, name) {
  return new RegExp(`\\b${escapeRegExp(name)}\\b(?!\\s*=)`, 'i').test(String(tag || ''));
}

function normalizeAnswerType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'multiple-choice' || raw === 'multiple_choice') return 'mcq';
  if (raw === 'constructed-response') return 'constructed';
  return raw;
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
    type: normalizeAnswerType(firstText(question.type, question.answer_type, extras.type)),
    goalCodes: arrayValue(question.goal_codes ?? question.default_goal_codes ?? extras.goalCodes),
    deseCodes: arrayValue(question.dese_codes ?? question.default_dese_codes ?? extras.deseCodes),
  };
}

function questionTextFromHtml(content, openingTag = '') {
  const classNames = [
    'q-prompt',
    'question-prompt',
    'question-text',
    'prompt',
  ];

  for (const className of classNames) {
    const pattern = new RegExp(
      `<([a-z][a-z0-9:-]*)\\b[^>]*class=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1\\s*>`,
      'i'
    );
    const match = pattern.exec(content);
    const text = match ? stripHtml(match[2]) : '';
    if (text) return text;
  }

  return firstText(
    attrValue(openingTag, 'data-question'),
    attrValue(openingTag, 'data-prompt'),
    attrValue(openingTag, 'aria-label')
  );
}

function choicesFromHtml(content) {
  const choices = [];
  const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button\s*>/gi;
  let match;

  while ((match = buttonPattern.exec(content)) !== null) {
    const attrs = match[1] || '';
    const className = attrValue(`<button ${attrs}>`, 'class');
    if (!/(?:^|\s)(?:opt-btn|option-btn|choice-btn|answer-option)(?:\s|$)/i.test(className)) continue;

    const rawText = stripHtml(match[2]);
    if (!rawText) continue;

    const fallbackKey = String.fromCharCode(65 + choices.length);
    const prefix = rawText.match(/^\s*([A-Z0-9]+)\s*[).:-]\s*(.+)$/i);
    const key = firstText(
      attrValue(`<button ${attrs}>`, 'data-value'),
      attrValue(`<button ${attrs}>`, 'value'),
      prefix?.[1],
      fallbackKey
    );
    const text = prefix?.[2]?.trim() || rawText;
    const correct = hasBareAttribute(attrs, 'data-correct')
      || /^(?:true|1|yes)$/i.test(attrValue(`<button ${attrs}>`, 'data-correct'));

    choices.push({ key, value: key, text, rawText, correct });
  }

  return choices;
}

function manifestQuestionsFromHtml(html) {
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;

  while ((match = scriptPattern.exec(html)) !== null) {
    const attrs = match[1] || '';
    if (!/\btype\s*=\s*["']application\/json["']/i.test(attrs)) continue;
    if (!/\bid\s*=\s*["']assignment-manifest["']/i.test(attrs)) continue;
    try {
      const manifest = JSON.parse(match[2]);
      return Array.isArray(manifest?.questions) ? manifest.questions : [];
    } catch (_) {
      return [];
    }
  }

  return [];
}

export function buildHtmlSourceLookup(rawHtml) {
  const html = typeof rawHtml === 'string' ? rawHtml : '';
  const lookup = new Map();
  if (!html.trim()) return lookup;

  manifestQuestionsFromHtml(html).forEach((question, index) => {
    const ref = question?.ref || question?.q_ref || question?.item_ref || `Q${index + 1}`;
    lookup.set(String(ref), makeQuestionRecord(ref, question));
  });

  const matches = [];
  const seen = new Set();
  const qrefPattern = /<[a-z][a-z0-9:-]*\b([^>]*\bdata-qref\s*=\s*(["'])(.*?)\2[^>]*)>/gi;
  let tagMatch;

  while ((tagMatch = qrefPattern.exec(html)) !== null) {
    const ref = decodeHtmlEntities(tagMatch[3]).trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    matches.push({
      ref,
      openingTag: tagMatch[0],
      start: tagMatch.index,
      end: tagMatch.index + tagMatch[0].length,
    });
  }

  matches.forEach((entry, index) => {
    const nextStart = matches[index + 1]?.start ?? html.length;
    const content = html.slice(entry.end, nextStart);
    const choices = choicesFromHtml(content);
    const openingCorrect = attrValue(entry.openingTag, 'data-correct');
    const correctChoice = choices.find(choice => choice.correct);
    const nestedCorrect = content.match(/\bdata-correct\s*=\s*(["'])(.*?)\1/i)?.[2] || '';
    const goalRaw = firstText(
      attrValue(entry.openingTag, 'data-goal'),
      attrValue(entry.openingTag, 'data-iep')
    );
    const deseRaw = attrValue(entry.openingTag, 'data-dese');
    const sourceRecord = makeQuestionRecord(entry.ref, {
      text: questionTextFromHtml(content, entry.openingTag),
      choices: choices.map(choice => ({ key: choice.key, value: choice.value, text: choice.text })),
      correct: openingCorrect || correctChoice?.rawText || decodeHtmlEntities(nestedCorrect) || null,
      answer_type: normalizeAnswerType(attrValue(entry.openingTag, 'data-answer-type')),
      goal_codes: goalRaw ? goalRaw.split(/[;,]/).map(value => value.trim()).filter(Boolean) : [],
      dese_codes: deseRaw ? deseRaw.split(/[;,]/).map(value => value.trim()).filter(Boolean) : [],
    });

    const existing = lookup.get(entry.ref);
    if (!existing) {
      lookup.set(entry.ref, sourceRecord);
      return;
    }

    const existingTextIsPlaceholder = !existing.text || existing.text === entry.ref;
    lookup.set(entry.ref, {
      ...existing,
      text: existingTextIsPlaceholder ? sourceRecord.text : existing.text,
      choices: existing.choices.length ? existing.choices : sourceRecord.choices,
      correct: existing.correct ?? sourceRecord.correct,
      type: existing.type || sourceRecord.type,
      goalCodes: existing.goalCodes.length ? existing.goalCodes : sourceRecord.goalCodes,
      deseCodes: existing.deseCodes.length ? existing.deseCodes : sourceRecord.deseCodes,
    });
  });

  return lookup;
}

function mergeSourceQuestion(existing, source, ref) {
  if (!existing) return source;
  if (!source) return existing;
  const existingTextIsPlaceholder = !existing.text || existing.text === ref;
  return {
    ...existing,
    text: existingTextIsPlaceholder ? source.text : existing.text,
    choices: existing.choices.length ? existing.choices : source.choices,
    correct: existing.correct ?? source.correct,
    type: existing.type || source.type,
    goalCodes: existing.goalCodes.length ? existing.goalCodes : source.goalCodes,
    deseCodes: existing.deseCodes.length ? existing.deseCodes : source.deseCodes,
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

  const htmlLookup = buildHtmlSourceLookup(meta.html_src);
  for (const [ref, source] of htmlLookup.entries()) {
    lookup.set(ref, mergeSourceQuestion(lookup.get(ref), source, ref));
  }

  return lookup;
}

function parseWrappedAnswerString(value) {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw) return value;
  const looksLikeObject = raw.startsWith('{') && raw.endsWith('}');
  const looksLikeArray = raw.startsWith('[') && raw.endsWith(']');
  if (!looksLikeObject && !looksLikeArray) return value;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return value;
  }
}

function unwrapAnswer(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    const parsed = parseWrappedAnswerString(value);
    return parsed === value ? value : unwrapAnswer(parsed);
  }
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return value;
  if (value.value !== undefined) return unwrapAnswer(value.value);
  if (value.answer !== undefined) return unwrapAnswer(value.answer);
  if (value.selected !== undefined) return unwrapAnswer(value.selected);
  if (value.raw_answer !== undefined) return unwrapAnswer(value.raw_answer);
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

function looksLikeCompactChoiceList(parts) {
  return parts.length > 1 && parts.every(part =>
    /^\s*[([]?[a-z0-9]+[\]).:-]?\s*$/i.test(part)
  );
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
  if (raw.includes(',')) {
    const commaParts = raw.split(',');
    if (looksLikeCompactChoiceList(commaParts)) tokens.push(...commaParts);
  }
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
