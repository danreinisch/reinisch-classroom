const test = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../site/web/classroom-message-utils.js');

test('legacy migration keeps teacher custom messages but ignores academic ticker categories', () => {
  const config = utils.normalize({
    ticker: {
      speed: 90,
      dateFormat: 'Day, Month DD, YYYY',
      timeFormat: 'h:mm AM/PM',
      items: [
        { category: 'language-arts', text: 'Week 7: Verb Tenses' },
        { category: 'life-skills', text: 'Your Rights & Responsibilities' },
        { category: 'none', text: 'Mindful Monday humans, may your coffee kick in first.' },
        { category: 'none', text: 'A special one-day announcement.' },
      ],
    },
  });

  assert.equal(config.speed, 90);
  assert.equal(config.weekdays.monday, 'Mindful Monday humans, may your coffee kick in first.');
  assert.equal(config.override, 'A special one-day announcement.');
  assert.equal(JSON.stringify(config).includes('Verb Tenses'), false);
  assert.equal(JSON.stringify(config).includes('Rights & Responsibilities'), false);
});

test('explicit classroom-message config never resurrects retired legacy ticker content', () => {
  const config = utils.normalize({
    classroomMessage: {
      enabled: true,
      speed: 60,
      override: '',
      weekdays: { wednesday: 'Halfway there.' },
    },
    ticker: {
      items: [{ category: 'none', text: 'OLD MESSAGE THAT MUST STAY RETIRED' }],
    },
  });

  assert.equal(config.override, '');
  assert.equal(config.weekdays.wednesday, 'Halfway there.');
  assert.equal(JSON.stringify(config).includes('OLD MESSAGE'), false);
});

test('override wins, then weekday text, then the safe fallback', () => {
  const base = {
    enabled: true,
    speed: 45,
    override: '',
    weekdays: { monday: 'Monday message', wednesday: 'Wednesday message' },
  };

  assert.deepEqual(
    utils.resolve({ ...base, override: 'Special announcement' }, new Date('2026-09-09T08:00:00')),
    { text: 'Special announcement', source: 'override', day: '' }
  );
  assert.deepEqual(utils.resolve(base, new Date('2026-09-09T08:00:00')), {
    text: 'Wednesday message', source: 'wednesday', day: 'wednesday',
  });
  assert.equal(utils.resolve(base, new Date('2026-09-12T08:00:00')).text, utils.DEFAULT_MESSAGE);
});

test('disabled messages resolve hidden and speed stays inside the approved range', () => {
  assert.deepEqual(
    utils.resolve({ enabled: false, speed: 45, override: 'Nope', weekdays: {} }, new Date()),
    { text: '', source: 'hidden', day: '' }
  );
  assert.equal(utils.clampSpeed(1), 5);
  assert.equal(utils.clampSpeed(999), 180);
  assert.equal(utils.clampSpeed('not-a-number'), utils.DEFAULT_SPEED);
});
