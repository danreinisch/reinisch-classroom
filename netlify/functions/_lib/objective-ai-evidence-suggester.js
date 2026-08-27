/* eslint-env node */
'use strict';

const SERVER_OWNED_SUGGESTION_FIELDS =
  new Set([
    'objective_id',
    'objectiveId',
    'objective_code',
    'objectiveCode',
    'component_label',
    'componentLabel',
    'objective_max',
    'objectiveMax',
    'objective_text',
    'objectiveText',
  ]);

function finiteNumber(
  value,
  label
) {
  const number =
    typeof value === 'number'
      ? value
      : Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(
      `${label} must be a finite number`
    );
  }

  return number;
}

function cleanText(
  value,
  maxLength = 1000
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value)
    .replace(
      // eslint-disable-next-line no-control-regex -- intentional removal of ASCII control characters from AI-bound text
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
      ' '
    )
    .trim()
    .slice(0, maxLength);
}

function scrubPii(
  value
) {
  let text =
    cleanText(
      value,
      12000
    );

  text =
    text.replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      '[EMAIL REDACTED]'
    );

  text =
    text.replace(
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
      '[PHONE REDACTED]'
    );

  text =
    text.replace(
      /\b\d{3}-\d{2}-\d{4}\b/g,
      '[ID REDACTED]'
    );

  // Match the existing academic Suggest Grade privacy boundary
  // by also redacting common US street-address patterns.
  text =
    text.replace(
      /\b\d+\s+\w[\w\s]*?\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Way|Court|Ct\.?|Place|Pl\.?)(?=[\s,.]|$)/gi,
      '[ADDRESS REDACTED]'
    );

  return text;
}

function safePromptText(
  value,
  maxLength
) {
  return scrubPii(value)
    .slice(
      0,
      maxLength
    );
}

function authoritativeMappings(
  mappings
) {
  const safeMappings =
    Array.isArray(mappings)
      ? mappings
      : [];

  if (safeMappings.length === 0) {
    throw new Error(
      'No authoritative objective component mappings exist for this item'
    );
  }

  const byOrder =
    new Map();

  for (const mapping of safeMappings) {
    const order =
      Number(
        mapping &&
        mapping.component_order
      );

    if (
      !Number.isInteger(order) ||
      order <= 0
    ) {
      throw new Error(
        'Authoritative component order must be a positive integer'
      );
    }

    if (byOrder.has(order)) {
      throw new Error(
        'Duplicate authoritative component order'
      );
    }

    const maximum =
      finiteNumber(
        mapping.objective_max,
        'Objective max'
      );

    if (maximum <= 0) {
      throw new Error(
        'Objective max must be greater than zero'
      );
    }

    if (
      !mapping.objective_id ||
      typeof mapping.objective_id !==
        'string'
    ) {
      throw new Error(
        'Authoritative objective identity is required'
      );
    }

    byOrder.set(
      order,
      {
        component_order:
          order,
        component_label:
          cleanText(
            mapping.component_label ||
              'Objective component',
            300
          ),
        objective_max:
          maximum,
      }
    );
  }

  return byOrder;
}

function validateObjectiveEvidenceSuggestions({
  mappings,
  suggestions,
}) {
  const mappingByOrder =
    authoritativeMappings(
      mappings
    );

  const safeSuggestions =
    Array.isArray(suggestions)
      ? suggestions
      : [];

  if (
    safeSuggestions.length !==
    mappingByOrder.size
  ) {
    throw new Error(
      'Complete objective evidence suggestion coverage is required'
    );
  }

  const suppliedOrders =
    new Set();

  const validated =
    [];

  for (
    const suggestion
    of safeSuggestions
  ) {
    if (
      !suggestion ||
      typeof suggestion !==
        'object' ||
      Array.isArray(suggestion)
    ) {
      throw new Error(
        'Objective evidence suggestion must be an object'
      );
    }

    for (
      const field
      of SERVER_OWNED_SUGGESTION_FIELDS
    ) {
      if (
        Object.prototype
          .hasOwnProperty
          .call(
            suggestion,
            field
          )
      ) {
        throw new Error(
          `AI suggestion may not supply server-owned field ${field}`
        );
      }
    }

    const order =
      Number(
        suggestion.component_order
      );

    if (
      !Number.isInteger(order) ||
      order <= 0
    ) {
      throw new Error(
        'Suggestion component_order must be a positive integer'
      );
    }

    if (
      suppliedOrders.has(order)
    ) {
      throw new Error(
        'Duplicate suggestion component_order'
      );
    }

    suppliedOrders.add(order);

    const mapping =
      mappingByOrder.get(order);

    if (!mapping) {
      throw new Error(
        `Unknown objective component order ${order}`
      );
    }

    const disposition =
      suggestion
        .suggested_disposition;

    if (
      disposition !== 'scored' &&
      disposition !==
        'not_scorable'
    ) {
      throw new Error(
        'Suggested disposition must be scored or not_scorable'
      );
    }

    const evidenceExcerpt =
      cleanText(
        suggestion.evidence_excerpt,
        500
      );

    const rationale =
      cleanText(
        suggestion.rationale,
        1000
      );

    if (
      disposition ===
      'not_scorable'
    ) {
      if (
        suggestion.suggested_earned !==
          undefined &&
        suggestion.suggested_earned !==
          null
      ) {
        throw new Error(
          'Not Scorable suggestion may not contain an earned value'
        );
      }

      validated.push({
        ...mapping,
        suggested_disposition:
          'not_scorable',
        suggested_earned:
          null,
        evidence_excerpt:
          evidenceExcerpt,
        rationale,
      });

      continue;
    }

    if (
      suggestion.suggested_earned ===
        undefined ||
      suggestion.suggested_earned ===
        null
    ) {
      throw new Error(
        'Scored suggestion requires suggested_earned'
      );
    }

    const earned =
      finiteNumber(
        suggestion
          .suggested_earned,
        'Suggested earned'
      );

    if (
      earned < 0 ||
      earned >
        mapping.objective_max
    ) {
      throw new Error(
        'Suggested earned value is outside the authoritative max range'
      );
    }

    validated.push({
      ...mapping,
      suggested_disposition:
        'scored',
      suggested_earned:
        earned,
      evidence_excerpt:
        evidenceExcerpt,
      rationale,
    });
  }

  for (
    const order
    of mappingByOrder.keys()
  ) {
    if (
      !suppliedOrders.has(order)
    ) {
      throw new Error(
        `Missing objective component order ${order}`
      );
    }
  }

  return validated.sort(
    (a, b) =>
      a.component_order -
      b.component_order
  );
}

function buildObjectiveEvidencePrompt({
  studentResponse,
  questionText,
  itemLabel,
  objectives,
}) {
  const safeResponse =
    safePromptText(
      studentResponse,
      12000
    );

  const safeQuestion =
    safePromptText(
      questionText,
      2000
    );

  const safeLabel =
    safePromptText(
      itemLabel,
      120
    );

  const safeObjectives =
    Array.isArray(objectives)
      ? objectives
      : [];

  if (!safeResponse) {
    throw new Error(
      'Student response is required'
    );
  }

  if (
    safeObjectives.length === 0
  ) {
    throw new Error(
      'Objective context is required'
    );
  }

  const lines = [
    'You are assisting a special education teacher with one narrow task:',
    'reviewing a single student response for evidence of already-mapped IEP child objectives.',
    '',
    'You are NOT assigning the academic grade.',
    'You are NOT determining IEP mastery.',
    'You are NOT creating or changing objective mappings.',
    'You are NOT inferring an objective that is not supplied.',
    '',
    'The teacher remains the final decision-maker.',
    '',
    'IMPORTANT SCORING DISTINCTION:',
    '- "scored" means this artifact provides usable evidence for the component.',
    '- A scored value of 0 is legitimate when the artifact is scorable but demonstrates none of the mapped component.',
    '- "not_scorable" means the artifact does not provide usable evidence for that component.',
    '- Never encode Not Scorable as 0.',
    '',
    'CRITERION SAFETY:',
    'Official objective wording criteria, mastery fields, and parent-goal criteria are preserved separately.',
    'If those values differ, do not reconcile them, choose one, or decide whether the objective is mastered/met.',
    'Use them only as context for what the objective measures.',
    '',
  ];

  if (safeLabel) {
    lines.push(
      `ITEM: ${safeLabel}`
    );
  }

  if (safeQuestion) {
    lines.push(
      `QUESTION: ${safeQuestion}`
    );
  }

  lines.push(
    '',
    'STUDENT RESPONSE:',
    safeResponse,
    '',
    'AUTHORITATIVE MAPPED COMPONENTS:'
  );

  for (
    const objective
    of safeObjectives
  ) {
    const order =
      Number(
        objective.component_order
      );

    const maximum =
      Number(
        objective.objective_max
      );

    lines.push(
      '',
      `Component ${order}`,
      `Label: ${safePromptText(objective.component_label, 300)}`,
      `Evidence scale: 0-${maximum}`,
      `Objective code: ${safePromptText(objective.code, 100)}`,
      `Official objective wording: ${safePromptText(objective.objective_text, 1500)}`,
      `Objective wording criterion: ${safePromptText(objective.objective_wording_criterion || 'Not separately stated', 500)}`,
      `Separate mastery field: ${safePromptText(objective.mastery_field || 'Not separately stated', 500)}`,
      `Parent-goal criterion: ${safePromptText(objective.parent_goal_criterion || 'Not separately stated', 500)}`,
      `Measurement method: ${safePromptText(objective.measurement_method || 'Not separately stated', 500)}`
    );
  }

  lines.push(
    '',
    'For every mapped component, return exactly one suggestion.',
    'Use component_order only as the component identity in your JSON.',
    'Do not return objective UUIDs, objective codes, labels, or max values.',
    '',
    'For scored components:',
    '- suggested_earned must be numeric from 0 through that component evidence scale.',
    '- evidence_excerpt should briefly identify the observable evidence in this response.',
    '- rationale should briefly explain the evidence judgment.',
    '',
    'For not_scorable components:',
    '- omit suggested_earned entirely.',
    '- explain briefly why this response cannot support a defensible measurement.',
    '',
    'Respond ONLY with valid JSON in this structure:',
    '{',
    '  "suggestions": [',
    '    {',
    '      "component_order": 1,',
    '      "suggested_disposition": "scored",',
    '      "suggested_earned": 0,',
    '      "evidence_excerpt": "brief evidence observation",',
    '      "rationale": "brief teacher-facing rationale"',
    '    },',
    '    {',
    '      "component_order": 2,',
    '      "suggested_disposition": "not_scorable",',
    '      "evidence_excerpt": "",',
    '      "rationale": "brief explanation"',
    '    }',
    '  ]',
    '}'
  );

  return lines.join('\n');
}

module.exports = {
  validateObjectiveEvidenceSuggestions,
  buildObjectiveEvidencePrompt,
  scrubPii,
};
