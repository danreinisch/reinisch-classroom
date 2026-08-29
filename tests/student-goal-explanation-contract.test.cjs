'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relative) {
  const absolute =
    path.join(ROOT, relative);

  assert.ok(
    fs.existsSync(absolute),
    `5C3A RED: expected file does not exist yet: ${relative}`
  );

  return fs.readFileSync(
    absolute,
    'utf8'
  );
}

const endpoint =
  read(
    'netlify/functions/student-goal-explanations.js'
  );

const helper =
  read(
    'netlify/functions/_lib/student-goal-explanation.js'
  );

const objectiveReader =
  read(
    'netlify/functions/_lib/objective-progress-reader.js'
  );

assert.match(
  endpoint,
  /requireStudent/,
  'Student explanation endpoint must preserve the signed Student session boundary'
);

assert.match(
  endpoint,
  /httpMethod\s*!==\s*['"]GET['"]/,
  'Student explanation endpoint must be GET-only'
);

assert.match(
  endpoint,
  /\bquarter\b/
);

assert.match(
  endpoint,
  /\bstart\b/
);

assert.match(
  endpoint,
  /\bend\b/,
  'explicit quarter/start/end must be supplied rather than invented server-side'
);

assert.match(
  endpoint,
  /date=gte\.|date.*gte/i,
  'parent evidence query must begin at the authorized quarter start'
);

assert.match(
  endpoint,
  /date=lte\.|date.*lte/i,
  'parent evidence query must end at the authorized quarter end'
);

for (const resource of [
  'goals',
  'goal_progress',
  'goal_data_points',
  'assignment_instances',
]) {
  assert.ok(
    endpoint.includes(
      `/rest/v1/${resource}`
    ),
    `Student explanation endpoint must read ${resource} server-side`
  );
}

assert.match(
  endpoint,
  /goal-objective-registry-reader/,
  'Student explanation endpoint must use the server-only live objective registry reader'
);

assert.doesNotMatch(
  endpoint,
  /goal-objective-catalog/,
  'Student explanation endpoint must no longer depend on the stale 35-row static objective catalog'
);

for (const required of [
  'buildObjectiveRegistryPath',
  'indexObjectiveRegistryRowsByParent',
  'getBrowserObjectivesForParent',
]) {
  assert.ok(
    endpoint.includes(required),
    `Student explanation endpoint must use ${required}`
  );
}

assert.match(
  endpoint,
  /readObjectiveProgress/,
  'objective-aware explanations must reuse the shared 5C1 reader'
);

assert.match(
  endpoint,
  /buildStudentGoalExplanationBundle/,
  'endpoint must return the one normalized explanation bundle'
);

assert.match(
  objectiveReader,
  /evidenceRowsTransform/,
  '5C1 must expose one optional server-side raw-evidence transform for Student release safety'
);

assert.match(
  endpoint,
  /evidenceRowsTransform/,
  'Student explanation reader must use the 5C1 raw-evidence transform before browser projection'
);

assert.ok(
  /Graded/.test(endpoint) &&
  /Reviewed/.test(endpoint),
  'answer review must follow the existing Student Portal Graded/Reviewed release rule'
);

assert.ok(
  /non_instructional/.test(endpoint),
  'non-instructional assignment evidence must be excluded'
);

for (const method of [
  'POST',
  'PATCH',
  'PUT',
  'DELETE',
]) {
  assert.doesNotMatch(
    endpoint,
    new RegExp(
      `method\\s*:\\s*['"]${method}['"]`,
      'i'
    ),
    `5C3A endpoint must never ${method}`
  );
}

assert.doesNotMatch(
  endpoint + helper,
  /sync_goal_objective_registry\s*\(/,
  '5C3A must never activate the objective registry'
);

for (const forbiddenClientPattern of [
  /@supabase\/supabase-js/,
  /\bcreateClient\s*\(/,
  /\bsupabase\s*\.\s*from\s*\(/i,
]) {
  assert.doesNotMatch(
    endpoint + helper,
    forbiddenClientPattern,
    '5C3A server path must not instantiate or use a Supabase JS client'
  );
}

assert.doesNotMatch(
  helper,
  /\bnotes\b\s*:/,
  'browser-safe explanation projection must not expose internal notes'
);

assert.doesNotMatch(
  helper,
  /\bassignment_instance_id\b\s*:/,
  'browser-safe explanation projection must not expose assignment instance UUIDs'
);

assert.doesNotMatch(
  helper,
  /\bitem_id\b\s*:/,
  'browser-safe explanation projection must not expose item IDs'
);

assert.doesNotMatch(
  helper,
  /\bstudent_id\b\s*:/,
  'browser-safe explanation projection must not expose student UUIDs'
);

assert.match(
  helper,
  /quarter_checkpoint_mean/,
  'ordinary goal math must be explicitly labeled'
);

assert.match(
  helper,
  /objective_equal_weight_mean/,
  'objective parent math must be explicitly labeled'
);

assert.match(
  helper,
  /same_quarter_parent_fallback/,
  'fallback math must be explicitly labeled'
);

console.log(
  '✓ Student Goal Explanation server architecture contract'
);
