'use strict';

// Teacher-only submission-answer reader.
//
// GET /.netlify/functions/teacher-review-submission-answers?submission_id=<uuid>
//
// Security boundary:
//   signed teacher session
//     -> signed teacherId
//     -> teacher-owned class
//     -> active enrollment
//     -> submission's student
//     -> service-role answer read
//
// The browser is never trusted to establish ownership.

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  requireTeacher,
} = require('./_lib/auth');

const {
  rest,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = require('./_lib/supa');

const {
  SESSION_SECRET,
} = process.env;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ''));
}

async function readJson(response, label) {
  if (!response || response.ok !== true) {
    const status =
      response && Number.isInteger(response.status)
        ? response.status
        : 0;

    let detail = '';

    if (
      response &&
      typeof response.text === 'function'
    ) {
      detail =
        await response
          .text()
          .catch(() => '');
    }

    throw new Error(
      `${label} failed: ${status}` +
      (detail ? ` ${detail.slice(0, 160)}` : '')
    );
  }

  const body = await response.json();

  return Array.isArray(body)
    ? body
    : [];
}

async function fetchOwnedClassIds(teacherId) {
  const response =
    await rest(
      '/rest/v1/classes' +
      '?select=id' +
      `&teacher_id=eq.${encodeURIComponent(teacherId)}`
    );

  const rows =
    await readJson(
      response,
      'Teacher classes query'
    );

  return [
    ...new Set(
      rows
        .map((row) => row && row.id)
        .filter(isUuid)
    ),
  ];
}

async function teacherOwnsStudent(
  teacherId,
  studentId
) {
  const classIds =
    await fetchOwnedClassIds(
      teacherId
    );

  if (classIds.length === 0) {
    return false;
  }

  const response =
    await rest(
      '/rest/v1/class_enrollments' +
      '?select=student_id,active' +
      '&active=eq.true' +
      `&student_id=eq.${encodeURIComponent(studentId)}` +
      '&class_id=in.(' +
      classIds
        .map(encodeURIComponent)
        .join(',') +
      ')' +
      '&limit=1'
    );

  const rows =
    await readJson(
      response,
      'Teacher enrollment query'
    );

  return rows.some(
    (row) =>
      row &&
      row.active !== false &&
      row.student_id === studentId
  );
}

async function fetchSubmission(
  submissionId
) {
  const response =
    await rest(
      '/rest/v1/submissions' +
      '?select=id,instance_id' +
      `&id=eq.${encodeURIComponent(submissionId)}` +
      '&limit=1'
    );

  const rows =
    await readJson(
      response,
      'Submission query'
    );

  return rows[0] || null;
}

async function fetchInstance(
  instanceId
) {
  const response =
    await rest(
      '/rest/v1/assignment_instances' +
      '?select=id,student_id' +
      `&id=eq.${encodeURIComponent(instanceId)}` +
      '&limit=1'
    );

  const rows =
    await readJson(
      response,
      'Assignment instance query'
    );

  return rows[0] || null;
}

async function fetchAnswers(
  submissionId
) {
  const response =
    await rest(
      '/rest/v1/submission_answers' +
      '?select=' +
      [
        'id',
        'submission_id',
        'assignment_item_id',
        'raw_answer',
        'is_correct',
        'earned_points',
        'max_points',
        'teacher_note',
        'scored_at',
        'assignment_items!assignment_item_id(' +
          'id,item_ref,answer_type,points,meta' +
        ')',
      ].join(',') +
      `&submission_id=eq.${encodeURIComponent(submissionId)}`
    );

  return readJson(
    response,
    'Submission answers query'
  );
}

const {
  getObjectiveCandidateItemIds,
} = require(
  './_lib/objective-auto-evidence-writer'
);

async function fetchMappings(itemIds) {
  if (itemIds.length === 0) {
    return [];
  }

  const response =
    await rest(
      '/rest/v1/assignment_item_mappings' +
      '?select=item_id,dese_codes,goal_codes,weight' +
      '&item_id=in.(' +
      itemIds
        .map((id) =>
          encodeURIComponent(String(id))
        )
        .join(',') +
      ')'
    );

  if (!response || response.ok !== true) {
    console.warn(
      '[teacher-review-submission-answers] ' +
      'Mapping enrichment query failed; returning answers without mappings'
    );

    return [];
  }

  const body =
    await response
      .json()
      .catch(() => []);

  return Array.isArray(body)
    ? body
    : [];
}

async function fetchObjectiveMappings(
  itemIds
) {
  if (itemIds.length === 0) {
    return [];
  }

  const response =
    await rest(
      '/rest/v1/assignment_item_objectives' +
        '?select=' +
        [
          'item_id',
          'objective_id',
          'component_label',
          'objective_max',
          'component_order',
        ].join(',') +
        '&item_id=in.(' +
        itemIds
          .map(id =>
            encodeURIComponent(
              String(id)
            )
          )
          .join(',') +
        ')' +
        '&order=component_order.asc'
    );

  if (
    !response ||
    response.ok !== true
  ) {
    console.warn(
      '[teacher-review-submission-answers] ' +
      'Objective mapping enrichment failed'
    );

    return [];
  }

  const body =
    await response
      .json()
      .catch(() => []);

  return Array.isArray(body)
    ? body
    : [];
}

async function fetchObjectiveEvidence(
  instanceId,
  itemIds
) {
  if (itemIds.length === 0) {
    return [];
  }

  const response =
    await rest(
      '/rest/v1/objective_data_points' +
        '?select=' +
        [
          'item_id',
          'objective_id',
          'objective_earned',
          'objective_max',
          'component_label',
        ].join(',') +
        `&assignment_instance_id=eq.${encodeURIComponent(instanceId)}` +
        '&source=eq.assignment' +
        '&item_id=in.(' +
        itemIds
          .map(id =>
            encodeURIComponent(
              String(id)
            )
          )
          .join(',') +
        ')'
    );

  if (
    !response ||
    response.ok !== true
  ) {
    console.warn(
      '[teacher-review-submission-answers] ' +
      'Objective evidence enrichment failed'
    );

    return [];
  }

  const body =
    await response
      .json()
      .catch(() => []);

  return Array.isArray(body)
    ? body
    : [];
}

async function enrichObjectiveComponents(
  answers,
  instanceId
) {
  const safeAnswers =
    Array.isArray(answers)
      ? answers
      : [];

  const candidateItems =
    safeAnswers.map(answer => ({
      id:
        answer.item_id,
      meta:
        answer.meta,
    }));

  const objectiveCandidateItemIds =
    getObjectiveCandidateItemIds(
      candidateItems
    );

  if (
    !(
      objectiveCandidateItemIds.length > 0
    )
  ) {
    return safeAnswers;
  }

  const [
    objectiveMappings,
    objectiveEvidence,
  ] =
    await Promise.all([
      fetchObjectiveMappings(
        objectiveCandidateItemIds
      ),
      fetchObjectiveEvidence(
        instanceId,
        objectiveCandidateItemIds
      ),
    ]);

  const mappingsByItem =
    new Map();

  for (
    const mapping
    of objectiveMappings
  ) {
    const key =
      String(mapping.item_id);

    if (!mappingsByItem.has(key)) {
      mappingsByItem.set(
        key,
        []
      );
    }

    mappingsByItem
      .get(key)
      .push(mapping);
  }

  const evidenceByIdentity =
    new Map();

  for (
    const evidence
    of objectiveEvidence
  ) {
    evidenceByIdentity.set(
      String(evidence.item_id) +
        ':' +
        String(evidence.objective_id),
      evidence
    );
  }

  return safeAnswers.map(answer => {
    const mappingRows =
      mappingsByItem.get(
        String(answer.item_id)
      ) || [];

    if (mappingRows.length === 0) {
      return answer;
    }

    const objective_components =
      mappingRows
        .slice()
        .sort(
          (a, b) =>
            Number(a.component_order) -
            Number(b.component_order)
        )
        .map(mapping => {
          const evidence =
            evidenceByIdentity.get(
              String(mapping.item_id) +
                ':' +
                String(mapping.objective_id)
            );

          return {
            component_order:
              Number(
                mapping.component_order
              ),
            component_label:
              mapping.component_label ||
              null,
            objective_max:
              Number(
                mapping.objective_max
              ),
            objective_earned:
              evidence &&
              evidence.objective_earned !==
                null &&
              evidence.objective_earned !==
                undefined
                ? Number(
                    evidence.objective_earned
                  )
                : null,
          };
        });

    return {
      ...answer,
      objective_components,
    };
  });
}


function flattenAnswers(
  rows,
  mappings
) {
  const mappingsByItemId =
    new Map();

  for (const mapping of mappings) {
    if (
      mapping &&
      mapping.item_id != null
    ) {
      mappingsByItemId.set(
        String(mapping.item_id),
        mapping
      );
    }
  }

  return rows.map((answer) => {
    const nestedItem =
      Array.isArray(
        answer.assignment_items
      )
        ? answer.assignment_items[0]
        : answer.assignment_items;

    const item =
      nestedItem || {};

    const mapping =
      mappingsByItemId.get(
        String(
          answer.assignment_item_id
        )
      ) || {};

    return {
      id: answer.id,
      submission_id:
        answer.submission_id,
      item_id:
        answer.assignment_item_id,
      raw_answer:
        answer.raw_answer,
      is_correct:
        answer.is_correct,
      earned_points:
        answer.earned_points,
      max_points:
        answer.max_points,
      teacher_note:
        answer.teacher_note,
      scored_at:
        answer.scored_at,
      item_ref:
        item.item_ref,
      answer_type:
        item.answer_type,
      points:
        item.points,
      meta:
        item.meta,
      dese_codes:
        mapping.dese_codes || [],
      goal_codes:
        mapping.goal_codes || [],
      weight:
        mapping.weight || 1.0,
    };
  });
}

exports.handler =
  async (event) => {
    const requestId =
      generateRequestId();

    console.log(
      '[teacher-review-submission-answers] ' +
      `[${requestId}] Request received`
    );

    if (
      event.httpMethod === 'OPTIONS'
    ) {
      return handleCorsPreFlight(
        event,
        ['GET', 'OPTIONS'],
        ['Content-Type']
      );
    }

    if (
      event.httpMethod !== 'GET'
    ) {
      return jsonResponse(
        event,
        405,
        {
          ok: false,
          error: 'Method Not Allowed',
        },
        {
          'Cache-Control': 'no-store',
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
          error: 'Server not configured',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }

    const teacherAuth =
      requireTeacher(
        event,
        SESSION_SECRET
      );

    if (!teacherAuth.ok) {
      return jsonResponse(
        event,
        401,
        {
          ok: false,
          error: 'Unauthorized',
        },
        {
          'Cache-Control': 'no-store',
        },
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
          error: 'Service unavailable',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }

    const teacherId =
      teacherAuth.user &&
      teacherAuth.user.teacherId;

    if (!isUuid(teacherId)) {
      console.warn(
        '[teacher-review-submission-answers] ' +
        `[${requestId}] ` +
        'Verified teacher session has no usable teacherId'
      );

      return jsonResponse(
        event,
        403,
        {
          ok: false,
          error: 'Teacher identity unavailable',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }

    const params =
      event.queryStringParameters || {};

    const submissionId =
      String(
        params.submission_id || ''
      ).trim();

    if (!isUuid(submissionId)) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error: 'Invalid submission_id',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }

    try {
      const submission =
        await fetchSubmission(
          submissionId
        );

      if (
        !submission ||
        !isUuid(
          submission.instance_id
        )
      ) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error: 'Submission not found',
          },
          {
            'Cache-Control': 'no-store',
          },
          requestId
        );
      }

      const instance =
        await fetchInstance(
          submission.instance_id
        );

      if (
        !instance ||
        !isUuid(instance.student_id)
      ) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error: 'Submission not found',
          },
          {
            'Cache-Control': 'no-store',
          },
          requestId
        );
      }

      const ownsStudent =
        await teacherOwnsStudent(
          teacherId,
          instance.student_id
        );

      if (!ownsStudent) {
        console.warn(
          '[teacher-review-submission-answers] ' +
          `[${requestId}] ` +
          'Submission outside signed teacher ownership'
        );

        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error: 'Submission not found',
          },
          {
            'Cache-Control': 'no-store',
          },
          requestId
        );
      }

      const answerRows =
        await fetchAnswers(
          submissionId
        );

      const itemIds =
        [
          ...new Set(
            answerRows
              .map(
                (row) =>
                  row &&
                  row.assignment_item_id
              )
              .filter(
                (value) =>
                  value != null
              )
              .map(String)
          ),
        ];

      const mappings =
        await fetchMappings(
          itemIds
        );

      let answers =
      flattenAnswers(
          answerRows,
          mappings
        );

    answers =
      await enrichObjectiveComponents(
        answers,
        submission.instance_id
      );

      console.log(
        '[teacher-review-submission-answers] ' +
        `[${requestId}] ` +
        `Returning ${answers.length} answer(s)`
      );

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          answers,
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    } catch (err) {
      console.error(
        '[teacher-review-submission-answers] ' +
        `[${requestId}] Error:`,
        err
      );

      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error:
            'Failed to fetch submission answers',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }
  };
