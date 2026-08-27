'use strict';

// Teacher-only, non-mutating child-objective evidence suggestion endpoint.
// Browser identifies only the already-existing Review artifact:
//   { submissionId, itemId }
// All objective identity, max, wording, criteria, student identity, and
// ownership context are resolved independently on the server.

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const {
  requireTeacher,
} = require('./_lib/auth');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  buildObjectiveEvidencePrompt,
  validateObjectiveEvidenceSuggestions,
} = require(
  './_lib/objective-ai-evidence-suggester'
);

const {
  url: SUPABASE_URL,
  key: SUPABASE_SERVICE_ROLE_KEY,
} = getSupabaseConfig();

const {
  SESSION_SECRET,
  OPENAI_API_KEY,
} = process.env;

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value)
  );
}

function canonicalItemId(value) {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return null;
  }

  const result =
    String(value).trim();

  return /^\d+$/.test(result)
    ? result
    : null;
}

async function serviceRead(
  path,
  requestId,
  label
) {
  const response =
    await fetch(
      `${SUPABASE_URL}${path}`,
      {
        method: 'GET',
        headers: {
          apikey:
            SUPABASE_SERVICE_ROLE_KEY,
          Authorization:
            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept:
            'application/json',
        },
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      text
        ? JSON.parse(text)
        : [];
  } catch (error) {
    console.error(
      `[teacher-ai-suggest-objective-evidence] [${requestId}] ${label} returned non-JSON: ${error.message}`
    );

    return {
      ok: false,
      status: response.status,
      rows: [],
    };
  }

  if (!response.ok) {
    console.error(
      `[teacher-ai-suggest-objective-evidence] [${requestId}] ${label} failed:`,
      response.status,
      data
    );

    return {
      ok: false,
      status: response.status,
      rows: [],
    };
  }

  return {
    ok: true,
    status: response.status,
    rows:
      Array.isArray(data)
        ? data
        : [],
  };
}

function extractStudentResponse(
  rawAnswer
) {
  if (
    rawAnswer === null ||
    rawAnswer === undefined
  ) {
    return '';
  }

  if (
    typeof rawAnswer === 'string' ||
    typeof rawAnswer === 'number' ||
    typeof rawAnswer === 'boolean'
  ) {
    return String(rawAnswer)
      .trim();
  }

  if (
    typeof rawAnswer !== 'object' ||
    Array.isArray(rawAnswer)
  ) {
    return '';
  }

  for (
    const key
    of [
      'value',
      'response',
      'answer',
      'text',
    ]
  ) {
    const candidate =
      rawAnswer[key];

    if (
      typeof candidate === 'string' ||
      typeof candidate === 'number' ||
      typeof candidate === 'boolean'
    ) {
      const text =
        String(candidate)
          .trim();

      if (text) {
        return text;
      }
    }
  }

  return '';
}

function resolveQuestionText(
  item
) {
  const meta =
    item &&
    item.meta &&
    typeof item.meta === 'object' &&
    !Array.isArray(item.meta)
      ? item.meta
      : {};

  for (
    const key
    of [
      'question',
      'question_text',
      'prompt',
      'text',
      'label',
    ]
  ) {
    if (
      typeof meta[key] === 'string' &&
      meta[key].trim()
    ) {
      return meta[key]
        .trim();
    }
  }

  return '';
}

async function authorizeAndResolve({
  submissionId,
  itemId,
  teacherId,
  requestId,
}) {
  const submissionResult =
    await serviceRead(
      '/rest/v1/submissions' +
        '?select=id,instance_id' +
        `&id=eq.${encodeURIComponent(submissionId)}` +
        '&limit=1',
      requestId,
      'submissions ownership read'
    );

  if (!submissionResult.ok) {
    return {
      ok: false,
      statusCode: 500,
      error:
        'Authorization check failed',
    };
  }

  const submission =
    submissionResult.rows[0];

  if (
    !submission ||
    !isUuid(
      submission.instance_id
    )
  ) {
    return {
      ok: false,
      statusCode: 404,
      error:
        'Submission not found',
    };
  }

  const instanceResult =
    await serviceRead(
      '/rest/v1/assignment_instances' +
        '?select=id,student_id,assignment_id' +
        `&id=eq.${encodeURIComponent(submission.instance_id)}` +
        '&limit=1',
      requestId,
      'assignment_instances ownership read'
    );

  if (!instanceResult.ok) {
    return {
      ok: false,
      statusCode: 500,
      error:
        'Authorization check failed',
    };
  }

  const instance =
    instanceResult.rows[0];

  if (
    !instance ||
    !isUuid(instance.id) ||
    !isUuid(instance.student_id) ||
    instance.assignment_id ===
      null ||
    instance.assignment_id ===
      undefined
  ) {
    return {
      ok: false,
      statusCode: 404,
      error:
        'Submission not found',
    };
  }

  const assignmentId =
    String(
      instance.assignment_id
    );

  const assignmentResult =
    await serviceRead(
      '/rest/v1/assignments' +
        '?select=id,class_id,type,meta' +
        `&id=eq.${encodeURIComponent(assignmentId)}` +
        '&limit=1',
      requestId,
      'assignments ownership read'
    );

  if (!assignmentResult.ok) {
    return {
      ok: false,
      statusCode: 500,
      error:
        'Authorization check failed',
    };
  }

  const assignment =
    assignmentResult.rows[0];

  if (
    !assignment ||
    !isUuid(
      assignment.class_id
    )
  ) {
    return {
      ok: false,
      statusCode: 404,
      error:
        'Submission not found',
    };
  }

  const classId =
    assignment.class_id;

  const classResult =
    await serviceRead(
      '/rest/v1/classes' +
        '?select=id,teacher_id' +
        `&id=eq.${encodeURIComponent(classId)}` +
        `&teacher_id=eq.${encodeURIComponent(teacherId)}` +
        '&limit=1',
      requestId,
      'classes teacher_id ownership read'
    );

  if (!classResult.ok) {
    return {
      ok: false,
      statusCode: 500,
      error:
        'Authorization check failed',
    };
  }

  if (
    classResult.rows.length === 0
  ) {
    return {
      ok: false,
      statusCode: 404,
      error:
        'Submission not found',
    };
  }

  const enrollmentResult =
    await serviceRead(
      '/rest/v1/class_enrollments' +
        '?select=class_id,student_id,active' +
        `&class_id=eq.${encodeURIComponent(classId)}` +
        `&student_id=eq.${encodeURIComponent(instance.student_id)}` +
        '&active=eq.true' +
        '&limit=1',
      requestId,
      'class_enrollments active=eq.true ownership read'
    );

  if (!enrollmentResult.ok) {
    return {
      ok: false,
      statusCode: 500,
      error:
        'Authorization check failed',
    };
  }

  if (
    enrollmentResult.rows.length ===
    0
  ) {
    return {
      ok: false,
      statusCode: 404,
      error:
        'Submission not found',
    };
  }

  const assignmentMeta =
    assignment.meta &&
    typeof assignment.meta ===
      'object' &&
    !Array.isArray(
      assignment.meta
    )
      ? assignment.meta
      : {};

  if (
    assignmentMeta.manual === true ||
    assignment.type === 'paper'
  ) {
    return {
      ok: false,
      statusCode: 409,
      error:
        'This Review artifact is not eligible for AI evidence suggestion',
    };
  }

  const itemResult =
    await serviceRead(
      '/rest/v1/assignment_items' +
        '?select=id,assignment_id,item_ref,points,meta' +
        `&id=eq.${encodeURIComponent(itemId)}` +
        `&assignment_id=eq.${encodeURIComponent(assignmentId)}` +
        '&limit=1',
      requestId,
      'assignment_items artifact read'
    );

  if (!itemResult.ok) {
    return {
      ok: false,
      statusCode: 500,
      error:
        'Failed to resolve Review item',
    };
  }

  const item =
    itemResult.rows[0];

  if (!item) {
    return {
      ok: false,
      statusCode: 404,
      error:
        'Submission not found',
    };
  }

  const answerResult =
    await serviceRead(
      '/rest/v1/submission_answers' +
        '?select=submission_id,assignment_item_id,raw_answer' +
        `&submission_id=eq.${encodeURIComponent(submissionId)}` +
        `&assignment_item_id=eq.${encodeURIComponent(itemId)}` +
        '&limit=1',
      requestId,
      'submission_answers artifact read'
    );

  if (!answerResult.ok) {
    return {
      ok: false,
      statusCode: 500,
      error:
        'Failed to resolve student response',
    };
  }

  const answer =
    answerResult.rows[0];

  const studentResponse =
    extractStudentResponse(
      answer &&
      answer.raw_answer
    );

  if (!studentResponse) {
    return {
      ok: false,
      statusCode: 409,
      error:
        'No usable student response exists for this Review item',
    };
  }

  const mappingResult =
    await serviceRead(
      '/rest/v1/assignment_item_objectives' +
        '?select=item_id,objective_id,component_label,objective_max,component_order' +
        `&item_id=eq.${encodeURIComponent(itemId)}` +
        '&order=component_order.asc',
      requestId,
      'assignment_item_objectives authoritative mapping read'
    );

  if (!mappingResult.ok) {
    return {
      ok: false,
      statusCode: 500,
      error:
        'Failed to resolve objective mappings',
    };
  }

  const mappings =
    mappingResult.rows;

  if (
    mappings.length === 0
  ) {
    return {
      ok: false,
      statusCode: 409,
      error:
        'No authoritative objective mappings exist for this item',
    };
  }

  const objectiveIds =
    Array.from(
      new Set(
        mappings
          .map(
            mapping =>
              mapping.objective_id
          )
          .filter(
            value =>
              isUuid(value)
          )
      )
    );

  if (
    objectiveIds.length !==
    mappings.length
  ) {
    return {
      ok: false,
      statusCode: 409,
      error:
        'Authoritative objective mappings are incomplete',
    };
  }

  const goalResult =
    await serviceRead(
      '/rest/v1/goal_objectives' +
        '?select=' +
        [
          'id',
          'student_id',
          'code',
          'objective_text',
          'objective_wording_criterion',
          'mastery_field',
          'parent_goal_criterion',
          'measurement_method',
          'active',
        ].join(',') +
        `&student_id=eq.${encodeURIComponent(instance.student_id)}` +
        '&active=eq.true' +
        '&id=in.(' +
        objectiveIds
          .map(
            id =>
              encodeURIComponent(id)
          )
          .join(',') +
        ')',
      requestId,
      'goal_objectives authoritative criterion read'
    );

  if (!goalResult.ok) {
    return {
      ok: false,
      statusCode: 500,
      error:
        'Failed to resolve objective criteria',
    };
  }

  if (
    goalResult.rows.length !==
    objectiveIds.length
  ) {
    return {
      ok: false,
      statusCode: 409,
      error:
        'Objective mapping does not match the authorized student registry',
    };
  }

  const goalById =
    new Map(
      goalResult.rows.map(
        goal => [
          goal.id,
          goal,
        ]
      )
    );

  const objectives =
    mappings
      .map(
        mapping => {
          const goal =
            goalById.get(
              mapping.objective_id
            );

          if (!goal) {
            throw new Error(
              'Objective registry mismatch'
            );
          }

          return {
            component_order:
              Number(
                mapping.component_order
              ),
            component_label:
              mapping.component_label ||
              '',
            objective_max:
              Number(
                mapping.objective_max
              ),
            code:
              goal.code,
            objective_text:
              goal.objective_text,
            objective_wording_criterion:
              goal.objective_wording_criterion,
            mastery_field:
              goal.mastery_field,
            parent_goal_criterion:
              goal.parent_goal_criterion,
            measurement_method:
              goal.measurement_method,
          };
        }
      )
      .sort(
        (a, b) =>
          a.component_order -
          b.component_order
      );

  return {
    ok: true,
    context: {
      submissionId,
      itemId,
      instanceId:
        instance.id,
      studentId:
        instance.student_id,
      item,
      mappings,
      objectives,
      studentResponse,
    },
  };
}

exports.handler =
  async function handler(event) {
    const requestId =
      generateRequestId();

    console.log(
      `[teacher-ai-suggest-objective-evidence] [${requestId}] Request received: ${event.httpMethod}`
    );

    if (
      event.httpMethod ===
      'OPTIONS'
    ) {
      return handleCorsPreFlight(
        event,
        [
          'POST',
          'OPTIONS',
        ],
        [
          'Content-Type',
        ]
      );
    }

    if (
      event.httpMethod !==
      'POST'
    ) {
      return jsonResponse(
        event,
        405,
        {
          ok: false,
          error:
            'Method Not Allowed',
        },
        {},
        requestId
      );
    }

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return jsonResponse(
        event,
        503,
        {
          ok: false,
          error:
            'Persistence layer not configured',
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    if (!SESSION_SECRET) {
      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error:
            'Server not configured',
        },
        {},
        requestId
      );
    }

    const authResult =
      requireTeacher(
        event,
        SESSION_SECRET
      );

    if (!authResult.ok) {
      return jsonResponse(
        event,
        401,
        {
          ok: false,
          error:
            'Unauthorized',
        },
        {},
        requestId
      );
    }

    const teacherId =
      authResult.user &&
      authResult.user.teacherId;

    if (!isUuid(teacherId)) {
      return jsonResponse(
        event,
        403,
        {
          ok: false,
          error:
            'Forbidden',
        },
        {},
        requestId
      );
    }

    const sizeCheck =
      validateBodySize(
        event.body,
        10
      );

    if (!sizeCheck.valid) {
      return jsonResponse(
        event,
        413,
        {
          ok: false,
          error:
            sizeCheck.error,
        },
        {},
        requestId
      );
    }

    const parsed =
      safeJsonParse(
        event.body
      );

    if (!parsed.ok) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            parsed.error,
        },
        {},
        requestId
      );
    }

    const body =
      parsed.data;

    if (
      !body ||
      typeof body !==
        'object' ||
      Array.isArray(body)
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Request body must be an object',
        },
        {},
        requestId
      );
    }

    const allowedFields =
      new Set([
        'submissionId',
        'itemId',
      ]);

    const unexpectedField =
      Object.keys(body)
        .find(
          field =>
            !allowedFields.has(
              field
            )
        );

    if (unexpectedField) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            `Unexpected request field: ${unexpectedField}`,
        },
        {},
        requestId
      );
    }

    const submissionId =
      body.submissionId;

    const itemId =
      canonicalItemId(
        body.itemId
      );

    if (!isUuid(submissionId)) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Invalid submissionId',
        },
        {},
        requestId
      );
    }

    if (!itemId) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Invalid itemId',
        },
        {},
        requestId
      );
    }

    let authorization;

    try {
      authorization =
        await authorizeAndResolve({
          submissionId,
          itemId,
          teacherId,
          requestId,
        });
    } catch (error) {
      console.error(
        `[teacher-ai-suggest-objective-evidence] [${requestId}] authoritative context resolution failed: ${error.message}`
      );

      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error:
            'Failed to resolve Review context',
        },
        {},
        requestId
      );
    }

    if (!authorization.ok) {
      return jsonResponse(
        event,
        authorization.statusCode ||
          500,
        {
          ok: false,
          error:
            authorization.error ||
            'Authorization failed',
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    if (!OPENAI_API_KEY) {
      return jsonResponse(
        event,
        503,
        {
          ok: false,
          error:
            'AI suggestions not configured',
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    const context =
      authorization.context;

    let prompt;

    try {
      prompt =
        buildObjectiveEvidencePrompt({
          studentResponse:
            context.studentResponse,
          questionText:
            resolveQuestionText(
              context.item
            ),
          itemLabel:
            context.item.item_ref ||
            '',
          objectives:
            context.objectives,
        });
    } catch (error) {
      console.error(
        `[teacher-ai-suggest-objective-evidence] [${requestId}] prompt build failed: ${error.message}`
      );

      return jsonResponse(
        event,
        409,
        {
          ok: false,
          error:
            'Objective evidence suggestion context is incomplete',
        },
        {},
        requestId
      );
    }

    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(
        () =>
          controller.abort(),
        15000
      );

    let aiResult;

    try {
      const aiResponse =
        await fetch(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization:
                `Bearer ${OPENAI_API_KEY}`,
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                model:
                  'gpt-4o-mini',
                temperature:
                  0.2,
                max_tokens:
                  900,
                response_format: {
                  type:
                    'json_object',
                },
                messages: [
                  {
                    role:
                      'system',
                    content:
                      prompt,
                  },
                ],
              }),
            signal:
              controller.signal,
          }
        );

      clearTimeout(
        timeoutId
      );

      if (!aiResponse.ok) {
        const text =
          await aiResponse
            .text()
            .catch(
              () => ''
            );

        console.error(
          `[teacher-ai-suggest-objective-evidence] [${requestId}] OpenAI API error ${aiResponse.status}: ${text.slice(0, 200)}`
        );

        return jsonResponse(
          event,
          502,
          {
            ok: false,
            error:
              'AI evidence suggestion failed',
          },
          {},
          requestId
        );
      }

      const payload =
        await aiResponse.json();

      const content =
        payload &&
        payload.choices &&
        payload.choices[0] &&
        payload.choices[0].message &&
        payload.choices[0].message.content;

      if (
        !content ||
        typeof content !==
          'string'
      ) {
        throw new Error(
          'AI returned empty content'
        );
      }

      aiResult =
        JSON.parse(
          content
        );
    } catch (error) {
      clearTimeout(
        timeoutId
      );

      console.error(
        `[teacher-ai-suggest-objective-evidence] [${requestId}] AI request failed: ${error.message}`
      );

      return jsonResponse(
        event,
        502,
        {
          ok: false,
          error:
            'AI evidence suggestion failed',
        },
        {},
        requestId
      );
    }

    let suggestions;

    try {
      suggestions =
        validateObjectiveEvidenceSuggestions({
          mappings:
            context.mappings,
          suggestions:
            aiResult &&
            aiResult.suggestions,
        });
    } catch (error) {
      console.error(
        `[teacher-ai-suggest-objective-evidence] [${requestId}] AI result rejected: ${error.message}`
      );

      return jsonResponse(
        event,
        502,
        {
          ok: false,
          error:
            'AI returned invalid objective evidence suggestions',
        },
        {},
        requestId
      );
    }

    console.log(
      `[teacher-ai-suggest-objective-evidence] [${requestId}] Suggestion ready for ${suggestions.length} mapped components`
    );

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        suggestions,
      },
      {
        'Cache-Control':
          'no-store',
      },
      requestId
    );
  };
