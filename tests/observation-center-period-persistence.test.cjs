'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

const utilsSource =
  read('site/web/obs-utils.js');

const observationSource =
  read('site/web/tc-observation.js');

const serverSource =
  read(
    'netlify/functions/teacher-sync-observations.js'
  );

const cjsUtils =
  utilsSource
    .replace(
      /^export\s+function\s+/gm,
      'function '
    )
    .replace(
      /^export\s+/gm,
      ''
    );

const sandbox = {
  module: { exports: {} },
  encodeURIComponent,
  decodeURIComponent,
};

vm.runInNewContext(
  cjsUtils +
    `
module.exports = {
  parseObservationNotes,
  buildObservationNotes,
};
`,
  sandbox
);

const {
  parseObservationNotes,
  buildObservationNotes,
} = sandbox.module.exports;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

console.log(
  '\n--- OBS-6 numeric observation period persistence ---'
);

test(
  'legacy observation notes remain byte-compatible when no period is supplied',
  () => {
    assert.equal(
      buildObservationNotes(
        'session_outcome',
        { response: 'met' },
        'Good session'
      ),
      '[obs:session_outcome:met] Good session'
    );

    assert.equal(
      buildObservationNotes(
        'tally',
        {
          successful: 3,
          opportunities: 5,
        }
      ),
      '[obs:tally:3/5]'
    );
  }
);

test(
  'buildObservationNotes can append encoded class-period metadata',
  () => {
    assert.equal(
      buildObservationNotes(
        'session_outcome',
        { response: 'met' },
        'Good session',
        'Period 4'
      ),
      '[obs:session_outcome:met] [obs-period:Period%204] Good session'
    );
  }
);

test(
  'period metadata round-trips without leaking into the teacher note',
  () => {
    const notes =
      buildObservationNotes(
        'tally',
        {
          successful: 4,
          opportunities: 5,
        },
        'Needed one reminder',
        'Period 4 / A&B: Skills'
      );

    const parsed =
      parseObservationNotes(notes);

    assert.ok(parsed);
    assert.equal(
      parsed.category,
      'tally'
    );
    assert.equal(
      parsed.rawData,
      '4/5'
    );
    assert.equal(
      parsed.classPeriod,
      'Period 4 / A&B: Skills'
    );
    assert.equal(
      parsed.userNote,
      'Needed one reminder'
    );
  }
);

test(
  'legacy parsed notes do not invent a class period',
  () => {
    const parsed =
      parseObservationNotes(
        '[obs:prompt_count:2] Needed cueing'
      );

    assert.ok(parsed);
    assert.equal(
      parsed.userNote,
      'Needed cueing'
    );

    assert.ok(
      parsed.classPeriod == null,
      'legacy note must not invent period identity'
    );
  }
);

test(
  'normal observation save accepts an explicit period override',
  () => {
    assert.match(
      observationSource,
      /async\s+function\s+saveObservation\s*\([^)]*(periodOverride|classPeriodOverride)/
    );

    assert.match(
      observationSource,
      /buildObservationNotes\s*\([^)]*(periodOverride|classPeriodOverride)/
    );
  }
);

test(
  'all four observation forms forward the period override to normal saves',
  () => {
    for (const functionName of [
      'renderSessionOutcomeForm',
      'renderTallyForm',
      'renderPromptCountForm',
      'renderBehaviorChecklistForm',
    ]) {
      const start =
        observationSource.indexOf(
          `function ${functionName}`
        );

      assert.ok(
        start >= 0,
        `${functionName} missing`
      );

      const nextFunction =
        observationSource.indexOf(
          '\n  function ',
          start + 20
        );

      const end =
        nextFunction >= 0
          ? nextFunction
          : observationSource.length;

      const section =
        observationSource.slice(
          start,
          end
        );

      assert.match(
        section,
        /periodOverride/
      );

      assert.match(
        section,
        /saveObservation\s*\([\s\S]*?periodOverride\s*\)/
      );
    }
  }
);

test(
  'buildGoalCard forwards its explicit period to each category form',
  () => {
    const start =
      observationSource.indexOf(
        'function buildGoalCard'
      );

    const end =
      observationSource.indexOf(
        '// ─── Build Tray Content',
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const section =
      observationSource.slice(
        start,
        end
      );

    for (const functionName of [
      'renderSessionOutcomeForm',
      'renderTallyForm',
      'renderPromptCountForm',
      'renderBehaviorChecklistForm',
    ]) {
      const pattern =
        new RegExp(
          functionName +
          '\\s*\\([\\s\\S]{0,500}periodOverride'
        );

      assert.match(
        section,
        pattern
      );
    }
  }
);

test(
  'persisted canonical numeric evidence remembers parsed class-period identity',
  () => {
    assert.match(
      observationSource,
      /observationEvidencePeriodsByDate/
    );

    assert.match(
      observationSource,
      /parseObservationNotes\s*\(\s*entry\.notes\s*\)[\s\S]{0,700}classPeriod/
    );
  }
);

test(
  'weekly due-state projection prefers persisted numeric period metadata',
  () => {
    const start =
      observationSource.indexOf(
        'function getRecordedObservationEntriesForWeek'
      );

    const end =
      observationSource.indexOf(
        'function getLiveCurrentPeriodLabel',
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const section =
      observationSource.slice(
        start,
        end
      );

    assert.match(
      section,
      /observationEvidencePeriodsByDate/
    );

    assert.match(
      section,
      /classPeriod/
    );
  }
);

test(
  'existing server already stores canonical numeric notes unchanged',
  () => {
    assert.match(
      serverSource,
      /const\s+notes\s*=\s*text\s*\(\s*entry\?\.notes\s*\)/
    );

    assert.match(
      serverSource,
      /notes:\s*notes\s*\|\|\s*null/
    );

    assert.match(
      serverSource,
      /row\.notes\.startsWith\(\s*['"]\[obs:['"]\s*\)/
    );
  }
);

test(
  'real-time Tray retains default no-override call behavior',
  () => {
    const start =
      observationSource.indexOf(
        'function buildTrayContent'
      );

    const end =
      observationSource.indexOf(
        'function updateTrayBadge',
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const section =
      observationSource.slice(
        start,
        end
      );

    assert.match(
      section,
      /buildGoalCard\s*\(\s*item\.goal\s*,\s*date\s*,\s*onAnyRecorded\s*,\s*item\.dueState\s*\)/
    );
  }
);

console.log(
  `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.log(
    '\n✗ OBS-6 numeric period persistence is RED as expected'
  );
  process.exit(1);
}

console.log(
  '\n✅ OBS-6 numeric period persistence passed'
);
