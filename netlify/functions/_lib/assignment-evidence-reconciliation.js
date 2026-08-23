'use strict';

function text(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function requireAssignmentIdentity(
  row,
  {
    requireItem = false,
  } = {},
) {
  if (
    !row ||
    row.source !== 'assignment'
  ) {
    throw new Error(
      'Assignment evidence reconciliation requires source === \'assignment\''
    );
  }

  if (
    !text(row.assignment_instance_id) ||
    !text(row.goal_id)
  ) {
    throw new Error(
      'Assignment evidence reconciliation requires assignment_instance_id and goal_id'
    );
  }

  if (
    requireItem &&
    (
      row.item_id === null ||
      row.item_id === undefined ||
      String(row.item_id).trim() === ''
    )
  ) {
    throw new Error(
      'Assignment item evidence reconciliation requires item_id'
    );
  }
}

function identityParams(
  row,
  {
    includeItem = false,
  } = {},
) {
  const params =
    new URLSearchParams();

  params.set(
    'assignment_instance_id',
    `eq.${row.assignment_instance_id}`,
  );

  params.set(
    'goal_id',
    `eq.${row.goal_id}`,
  );

  if (includeItem) {
    params.set(
      'item_id',
      `eq.${row.item_id}`,
    );
  }

  params.set(
    'source',
    'eq.assignment',
  );

  return params;
}

async function request(
  {
    supabaseUrl,
    serviceRoleKey,
    path,
    method = 'GET',
    body,
    fetchImpl,
  },
) {
  const actualFetch =
    fetchImpl ||
    global.fetch;

  if (
    typeof actualFetch !== 'function'
  ) {
    throw new Error(
      'Assignment evidence reconciliation requires fetch'
    );
  }

  if (
    !text(supabaseUrl) ||
    !text(serviceRoleKey)
  ) {
    throw new Error(
      'Assignment evidence reconciliation requires Supabase server configuration'
    );
  }

  const response =
    await actualFetch(
      `${supabaseUrl}${path}`,
      {
        method,
        headers: {
          apikey: serviceRoleKey,
          Authorization:
            `Bearer ${serviceRoleKey}`,
          'Content-Type':
            'application/json',
          ...(
            method === 'GET'
              ? {}
              : {
                  Prefer:
                    'return=representation',
                }
          ),
        },
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body),
      },
    );

  let data = null;

  if (
    response &&
    response.status !== 204 &&
    typeof response.json === 'function'
  ) {
    try {
      data =
        await response.json();
    } catch {
      data = null;
    }
  }

  if (
    !response ||
    response.ok !== true
  ) {
    const error =
      new Error(
        `Assignment evidence reconciliation failed with status ${
          response?.status || 500
        }`
      );

    error.status =
      response?.status || 500;

    throw error;
  }

  return {
    status: response.status,
    data,
  };
}

async function reconcileOne(
  {
    resource,
    row,
    includeItem = false,
    supabaseUrl,
    serviceRoleKey,
    fetchImpl,
  },
) {
  requireAssignmentIdentity(
    row,
    {
      requireItem: includeItem,
    },
  );

  const identity =
    identityParams(
      row,
      {
        includeItem,
      },
    );

  const lookup =
    new URLSearchParams(
      identity,
    );

  lookup.set(
    'select',
    'id,created_at',
  );

  lookup.set(
    'order',
    'created_at.desc,id.desc',
  );

  const existing =
    await request({
      supabaseUrl,
      serviceRoleKey,
      fetchImpl,
      path:
        `/rest/v1/${resource}?` +
        lookup.toString(),
    });

  const existingRows =
    Array.isArray(existing.data)
      ? existing.data
      : [];

  if (
    existingRows.length > 0
  ) {
    const canonical =
      existingRows[0];

    if (
      canonical?.id === null ||
      canonical?.id === undefined ||
      String(
        canonical.id
      ).trim() === ''
    ) {
      throw new Error(
        'Assignment evidence reconciliation could not resolve canonical row id'
      );
    }

    const updateIdentity =
      new URLSearchParams(
        identity,
      );

    updateIdentity.set(
      'id',
      `eq.${canonical.id}`,
    );

    const updated =
      await request({
        supabaseUrl,
        serviceRoleKey,
        fetchImpl,
        path:
          `/rest/v1/${resource}?` +
          updateIdentity.toString(),
        method: 'PATCH',
        body: row,
      });

    return {
      action: 'updated',
      matched_count:
        existingRows.length,
      rows:
        Array.isArray(updated.data)
          ? updated.data
          : [],
    };
  }

  const inserted =
    await request({
      supabaseUrl,
      serviceRoleKey,
      fetchImpl,
      path:
        `/rest/v1/${resource}`,
      method: 'POST',
      body: row,
    });

  return {
    action: 'inserted',
    matched_count: 0,
    rows:
      Array.isArray(inserted.data)
        ? inserted.data
        : [],
  };
}

async function reconcileAssignmentGoalProgress(
  {
    row,
    supabaseUrl,
    serviceRoleKey,
    fetchImpl,
  },
) {
  return reconcileOne({
    resource: 'goal_progress',
    row,
    includeItem: false,
    supabaseUrl,
    serviceRoleKey,
    fetchImpl,
  });
}

async function reconcileAssignmentGoalDataPoints(
  {
    rows,
    supabaseUrl,
    serviceRoleKey,
    fetchImpl,
  },
) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  const results = [];

  for (const row of safeRows) {
    results.push(
      await reconcileOne({
        resource:
          'goal_data_points',
        row,
        includeItem: true,
        supabaseUrl,
        serviceRoleKey,
        fetchImpl,
      }),
    );
  }

  return results;
}

module.exports = {
  reconcileAssignmentGoalProgress,
  reconcileAssignmentGoalDataPoints,
};
