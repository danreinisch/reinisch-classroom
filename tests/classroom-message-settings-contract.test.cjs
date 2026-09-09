const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const shell = fs.readFileSync('site/web/teacher-shell.js', 'utf8');
const settings = fs.readFileSync('site/web/tc-classroom-message.js', 'utf8');
const home = fs.readFileSync('site/web/home-classroom-message.js', 'utf8');
const homepage = fs.readFileSync('site/index.html', 'utf8');

test('Teacher Settings retires the four obsolete homepage managers only on the settings route', () => {
  assert.match(shell, /IS_CLASSROOM_MESSAGE_SETTINGS = location\.pathname\.startsWith\('\/teacher\/settings'\)/);
  for (const marker of ['#laUnit', '#lsCurrentTitle', '#tickerDateFormat', '#countdownsBody']) {
    assert.match(shell, new RegExp(marker.replace('#', '#')));
  }
  assert.match(shell, /classroom-message-utils\.js\?v=20260909-1/);
  assert.match(shell, /tc-classroom-message\.js\?v=20260909-1/);
  assert.match(settings, /removeLegacyHomepageCards/);
  assert.doesNotMatch(settings, /delete\s+homeConfig\.(?:languageArts|lifeSkills|ticker|countdowns)|localStorage\.removeItem\('rc_home_config'/);
});

test('Classroom Message editor exposes teacher controls and preserves the full home_config object', () => {
  for (const id of [
    'classroomMessageSettings', 'classroomMessageEnabled', 'classroomMessageOverride',
    'classroomMessageMonday', 'classroomMessageTuesday', 'classroomMessageWednesday',
    'classroomMessageThursday', 'classroomMessageFriday', 'classroomMessageSpeed',
    'classroomMessagePreviewText', 'saveClassroomMessageBtn',
  ]) {
    assert.match(settings, new RegExp(id));
  }
  assert.match(settings, /utils\.write\(homeConfig, readForm\(\)\)/);
  assert.match(settings, /localStorage\.setItem\('rc_home_config', JSON\.stringify\(homeConfig\)\)/);
  assert.match(settings, /db\.setAppConfig\('home_config', homeConfig\)/);
  assert.doesNotMatch(settings, /SUPABASE_URL|SUPABASE_ANON_KEY|service[_-]?role/i);
});

test('Homepage loads a focused classroom-message layer after the existing dashboard runtime', () => {
  const scripts = [...homepage.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((match) => match[1]);
  const dashboardIndex = scripts.indexOf('/web/home-dashboard.js');
  const utilsIndex = scripts.indexOf('/web/classroom-message-utils.js?v=20260909-1');
  const messageIndex = scripts.indexOf('/web/home-classroom-message.js?v=20260909-1');
  assert.ok(dashboardIndex >= 0);
  assert.ok(utilsIndex > dashboardIndex);
  assert.ok(messageIndex > utilsIndex);
  assert.match(home, /waitForLegacyTicker/);
  assert.match(home, /utils\.normalize\(homeConfig\)/);
  assert.match(home, /utils\.resolve\(config, new Date\(\)\)/);
  assert.match(home, /animationDuration = config\.speed \+ 's'/);
  assert.doesNotMatch(home, /ticker\.items|dateFormat|timeFormat|languageArts|lifeSkills|math-toolkit/);
});
