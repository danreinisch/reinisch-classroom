const assert = require('assert');

const {
  applyExplicitMapping,
} = require('../netlify/functions/_lib/apply-explicit-mapping');

function makeMeta() {
  return {
    days: [
      {
        day_number: 1,
        type: 'questions',
        questions: [
          { number: 1, text: 'Q1' },
          { number: 2, text: 'Q2' },
        ],
      },
      {
        day_number: 2,
        type: 'writing_prompt',
        prompt: 'Write something.',
        hints: [],
        structure: [],
      },
    ],
  };
}

console.log('Running explicit mapping bridge tests...\n');

{
  const meta = makeMeta();

  const mapping = JSON.stringify([
    {
      question_id: 'q1',
      dese: ['11-12.RL.1.A'],
      iep: ['TEST.READ.01'],
    },
    {
      question_id: 'q2',
      dese: ['11-12.RL.2.D'],
      iep: [],
    },
    {
      question_id: 'q3',
      dese: ['11-12.RL.1.A', '11-12.RL.2.D'],
      iep: ['TEST.WRITE.01'],
    },
  ]);

  const result = applyExplicitMapping(meta, mapping);

  assert.strictEqual(result.applied, 3);
  assert.deepStrictEqual(result.unmatched, []);

  assert.deepStrictEqual(
    meta.days[0].questions[0].dese_codes,
    ['11-12.RL.1.A']
  );

  assert.deepStrictEqual(
    meta.days[0].questions[0].goal_codes,
    ['TEST.READ.01']
  );

  assert.deepStrictEqual(
    meta.days[0].questions[1].dese_codes,
    ['11-12.RL.2.D']
  );

  assert.deepStrictEqual(
    meta.days[1].dese_codes,
    ['11-12.RL.1.A', '11-12.RL.2.D']
  );

  assert.deepStrictEqual(
    meta.days[1].goal_codes,
    ['TEST.WRITE.01']
  );

  console.log('✓ flat qN mapping applies in parsed item order');
}

{
  const meta = makeMeta();

  const mapping = JSON.stringify({
    version: 1,
    sections: [
      {
        title: 'Language Arts 3 SC',
        items: [
          {
            key: 'D1.Q1',
            dese: ['11-12.RL.1.A'],
            iep: [],
          },
          {
            key: 'D2.WP',
            dese: ['11-12.RL.2.D'],
            iep: ['TEST.WRITE.01'],
          },
        ],
      },
    ],
  });

  const result = applyExplicitMapping(meta, mapping);

  assert.strictEqual(result.applied, 2);

  assert.deepStrictEqual(
    meta.days[0].questions[0].dese_codes,
    ['11-12.RL.1.A']
  );

  assert.deepStrictEqual(
    meta.days[1].dese_codes,
    ['11-12.RL.2.D']
  );

  console.log('✓ Work sections/items mapping applies by D#.Q# and D#.WP');
}

{
  const meta = makeMeta();

  const mapping = JSON.stringify([
    {
      item_ref: '1_2',
      dese_codes: ['11-12.RL.2.D'],
      goal_codes: ['TEST.READ.01'],
    },
    {
      item_ref: 'WP_2',
      dese_codes: ['11-12.RL.1.A'],
      goal_codes: [],
    },
  ]);

  const result = applyExplicitMapping(meta, mapping);

  assert.strictEqual(result.applied, 2);

  assert.deepStrictEqual(
    meta.days[0].questions[1].goal_codes,
    ['TEST.READ.01']
  );

  assert.deepStrictEqual(
    meta.days[1].dese_codes,
    ['11-12.RL.1.A']
  );

  console.log('✓ canonical server item_ref mapping applies');
}

{
  const meta = makeMeta();

  assert.throws(
    () => applyExplicitMapping(meta, '{broken-json'),
    /Explicit mapping JSON is invalid/
  );

  console.log('✓ malformed explicit mapping fails loudly');
}

{
  const meta = makeMeta();

  const result = applyExplicitMapping(
    meta,
    JSON.stringify([
      {
        question_id: 'q999',
        dese: ['11-12.RL.1.A'],
        iep: [],
      },
    ])
  );

  assert.strictEqual(result.applied, 0);
  assert.deepStrictEqual(result.unmatched, ['q999']);

  console.log('✓ unmatched mapping keys are reported');
}

console.log('\n✓ All explicit mapping bridge tests passed!');
