// Contract tests for OBS-3 explicit Observation collection cadence.
//
// OBS-3 scope:
// - observation_config.required_per_week
// - safe legacy default of 1
// - configurable range 1..5
// - Monday–Sunday canonical observation evidence reads
// - prior days in the same week count toward cadence
// - offline queued observations count immediately
//
// Explicitly out of scope:
// - observation persistence changes
// - attendance changes
// - progress_entries promoted to evidence
// - disposition persistence
// - multiple observations on the same day
// - reporting redesign

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const studentsPath = path.join(
  __dirname,
  '..',
  'site',
  'web',
  'tc-students.js'
);

const observationPath = path.join(
  __dirname,
  '..',
  'site',
  'web',
  'tc-observation.js'
);

const studentsSource =
  fs.readFileSync(studentsPath, 'utf8');

const observationSource =
  fs.readFileSync(observationPath, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

console.log(
  '\n--- OBS-3 Observation collection cadence contract ---'
);

test(
  'Observation config UI exposes observations-per-week',
  () => {
    assert.ok(
      studentsSource.includes(
        'name="obs_required_per_week"'
      ),
      'Observation config must expose obs_required_per_week'
    );

    assert.ok(
      /Observations?\s+per\s+week/i.test(
        studentsSource
      ),
      'cadence input needs a clear observations-per-week label'
    );
  }
);

test(
  'cadence input is constrained to 1 through 5',
  () => {
    assert.ok(
      /name="obs_required_per_week"[^>]*min="1"[^>]*max="5"|name="obs_required_per_week"[^>]*max="5"[^>]*min="1"/
        .test(studentsSource),
      'cadence input must constrain values to 1..5'
    );
  }
);

test(
  'legacy observation configs render with cadence default 1',
  () => {
    assert.ok(
      /requiredPerWeek\s*=\s*obsConfig\?\.required_per_week\s*\?\?\s*1/
        .test(studentsSource) ||
      /required_per_week\s*\?\?\s*1/
        .test(studentsSource),
      'missing required_per_week must safely render as 1'
    );
  }
);

test(
  'goal form collection stores required_per_week in observation_config',
  () => {
    assert.ok(
      /config\.required_per_week\s*=/.test(
        studentsSource
      ),
      'gatherObservationConfig must persist required_per_week'
    );

    assert.ok(
      /obs_required_per_week/.test(
        studentsSource
      ),
      'gatherObservationConfig must read the cadence field'
    );
  }
);

test(
  'cadence validation rejects values outside 1 through 5',
  () => {
    const validationStart =
      studentsSource.indexOf(
        'function validateObservationConfig'
      );

    const validationEnd =
      studentsSource.indexOf(
        'function renderObservationConfigHtml',
        validationStart
      );

    assert.ok(
      validationStart >= 0 &&
      validationEnd > validationStart,
      'Observation validation section must exist'
    );

    const validation =
      studentsSource.slice(
        validationStart,
        validationEnd
      );

    assert.ok(
      validation.includes(
        'obs_required_per_week'
      ),
      'validation must inspect required-per-week'
    );

    assert.ok(
      /<\s*1/.test(validation) &&
      />\s*5/.test(validation),
      'validation must enforce the 1..5 cadence range'
    );
  }
);

test(
  'bulk Observation Configuration exposes the same observations-per-week cadence',
  () => {
    assert.ok(
      studentsSource.includes(
        'name="bulk_obs_required_per_week"'
      ),
      'bulk config must expose bulk_obs_required_per_week'
    );

    assert.ok(
      /name="bulk_obs_required_per_week"[^>]*min="1"[^>]*max="5"|name="bulk_obs_required_per_week"[^>]*max="5"[^>]*min="1"/
        .test(studentsSource),
      'bulk cadence input must constrain values to 1..5'
    );
  }
);

test(
  'bulk Observation Configuration stores required_per_week',
  () => {
    const gatherStart =
      studentsSource.indexOf(
        'function gatherBulkObsConfigValues'
      );

    const gatherEnd =
      studentsSource.indexOf(
        'function validateBulkObsConfigValues',
        gatherStart
      );

    assert.ok(
      gatherStart >= 0 &&
      gatherEnd > gatherStart,
      'bulk observation gather section must exist'
    );

    const gather =
      studentsSource.slice(
        gatherStart,
        gatherEnd
      );

    assert.ok(
      gather.includes(
        'bulk_obs_required_per_week'
      ),
      'bulk gather must read the cadence field'
    );

    assert.ok(
      /config\.required_per_week\s*=/.test(
        gather
      ),
      'bulk gather must persist required_per_week'
    );
  }
);

test(
  'bulk Observation Configuration validates cadence from 1 through 5',
  () => {
    const validationStart =
      studentsSource.indexOf(
        'function validateBulkObsConfigValues'
      );

    const validationEnd =
      studentsSource.indexOf(
        'function renderBulkObsConfigPanelHtml',
        validationStart
      );

    assert.ok(
      validationStart >= 0 &&
      validationEnd > validationStart,
      'bulk validation section must exist'
    );

    const validation =
      studentsSource.slice(
        validationStart,
        validationEnd
      );

    assert.ok(
      validation.includes(
        'bulk_obs_required_per_week'
      ),
      'bulk validation must inspect cadence'
    );

    assert.ok(
      /<\s*1/.test(validation) &&
      />\s*5/.test(validation),
      'bulk validation must enforce 1..5'
    );
  }
);

test(
  'tray has one cadence resolver with legacy default 1',
  () => {
    assert.ok(
      /function\s+getRequiredPerWeek\s*\(/
        .test(observationSource),
      'tray needs a central getRequiredPerWeek() resolver'
    );

    assert.ok(
      /required_per_week/.test(
        observationSource
      ),
      'tray cadence resolver must read observation_config.required_per_week'
    );

    assert.ok(
      /return\s+1|:\s*1/.test(
        observationSource
      ),
      'legacy cadence must default safely to 1'
    );
  }
);

test(
  'tray passes configured cadence to OBS-1 instead of hardcoding 1',
  () => {
    assert.ok(
      /requiredPerWeek\s*:\s*getRequiredPerWeek\s*\(/.test(
        observationSource
      ) ||
      /const\s+requiredPerWeek\s*=\s*getRequiredPerWeek\s*\(/.test(
        observationSource
      ),
      'computeObservationDueState must receive configured cadence'
    );

    assert.ok(
      !/requiredPerWeek\s*:\s*1\b/.test(
        observationSource
      ),
      'OBS-2 hardcoded requiredPerWeek: 1 must be retired'
    );
  }
);

test(
  'performance criteria remain separate from collection cadence',
  () => {
    assert.ok(
      !/requiredPerWeek\s*:\s*config\.target_window/.test(
        observationSource
      ),
      'target_window must not become collection cadence'
    );

    assert.ok(
      !/requiredPerWeek\s*:\s*config\.target_met/.test(
        observationSource
      ),
      'target_met must not become collection cadence'
    );

    assert.ok(
      !/required_per_week\s*=\s*.*target_window/.test(
        studentsSource
      ),
      'goal editor must not derive cadence from target_window'
    );
  }
);

test(
  'tray has a canonical weekly evidence loader',
  () => {
    assert.ok(
      /function\s+loadRecordedEntriesForWeek\s*\(|async\s+function\s+loadRecordedEntriesForWeek\s*\(/
        .test(observationSource),
      'tray needs loadRecordedEntriesForWeek()'
    );

    assert.ok(
      /db\.listGoalProgress\s*\(\s*\{[\s\S]{0,500}startDate[\s\S]{0,200}endDate/
        .test(observationSource),
      'weekly loader must use a bounded canonical goal_progress date range'
    );
  }
);

test(
  'weekly canonical rows are identified by observation notes',
  () => {
    assert.ok(
      /parseObservationNotes\s*\(\s*entry\.notes\s*\)/
        .test(observationSource),
      'weekly evidence must verify [obs:...] observation notes'
    );
  }
);

test(
  'due-state receives observation entries from multiple dates in the current week',
  () => {
    assert.ok(
      /function\s+getRecordedObservationEntriesForWeek\s*\(/
        .test(observationSource) ||
      /recordedByDate[\s\S]{0,1200}weekStart[\s\S]{0,1200}weekEnd/
        .test(observationSource),
      'due-state needs current-week recorded observation entries, not today only'
    );

    assert.ok(
      /entries\s*:\s*(weeklyEntries|weekEntries|evidenceEntries)/
        .test(observationSource) ||
      /computeObservationDueState\s*\(\s*\{[\s\S]{0,500}entries\s*,/
        .test(observationSource),
      'OBS-1 must receive the current week evidence collection'
    );
  }
);

test(
  'offline queued observations participate in weekly cadence immediately',
  () => {
    assert.ok(
      /readQueue\s*\(\)/.test(
        observationSource
      ),
      'weekly cadence must retain offline queue awareness'
    );

    assert.ok(
      /saved_at|goal_code/.test(
        observationSource
      ),
      'queued observation identity must remain available to weekly evidence projection'
    );
  }
);

test(
  'initial and refresh reads load the current week rather than today only',
  () => {
    assert.ok(
      /await\s+loadRecordedEntriesForWeek\s*\(\s*todayStr\(\)\s*\)/
        .test(observationSource),
      'initial/refresh path must preload current-week evidence'
    );
  }
);

test(
  'historical tray navigation loads the selected instructional week',
  () => {
    const navigateStart =
      observationSource.indexOf(
        'const navigateTo = async (newDate)'
      );

    assert.ok(
      navigateStart >= 0,
      'historical navigation must remain present'
    );

    const navigateSection =
      observationSource.slice(
        navigateStart,
        navigateStart + 1300
      );

    assert.ok(
      navigateSection.includes(
        'loadRecordedEntriesForWeek(newDate)'
      ),
      'historical navigation must load the selected week'
    );
  }
);

test(
  'event-only progress_entries are not promoted into cadence evidence',
  () => {
    assert.ok(
      !/listProgressEntries/.test(
        observationSource
      ),
      'OBS-3 must not add a progress_entries evidence reader'
    );

    assert.ok(
      !/from\(['"]progress_entries['"]\)/.test(
        observationSource
      ),
      'tray must not query progress_entries as weekly evidence'
    );
  }
);

test(
  'OBS-3 leaves observation and attendance write paths intact',
  () => {
    assert.ok(
      observationSource.includes(
        "/.netlify/functions/teacher-sync-observations"
      ),
      'existing observation sync endpoint must remain'
    );

    assert.ok(
      observationSource.includes(
        'db.upsertAttendance({'
      ),
      'existing attendance write remains unchanged in OBS-3'
    );

    assert.ok(
      observationSource.includes(
        "source: 'observation_auto'"
      ),
      'OBS-3 must not silently change attendance behavior'
    );
  }
);

console.log(
  `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.log(
    '\n✗ OBS-3 collection cadence contract is RED as expected'
  );
  process.exit(1);
}

console.log(
  '\n✅ OBS-3 Observation collection cadence contract passed'
);
