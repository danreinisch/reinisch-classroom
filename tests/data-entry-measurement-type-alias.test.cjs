const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const root =
  path.join(
    __dirname,
    '..',
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath,
    ),
    'utf8',
  );
}

const browserEntry =
  read(
    'site/web/data-entry.js',
  );

const packageJson =
  read(
    'package.json',
  );

const helperMatch =
  browserEntry.match(
    /function isXOfYMeasurementType\(value\) \{[\s\S]*?\n {2}\}/,
  );

assert.ok(
  helperMatch,
  'external data entry must define an x/y measurement alias helper',
);

const helper =
  helperMatch[0];

assert.ok(
  helper.includes(
    "normalized === 'x/y'",
  ),
  'helper must recognize canonical x/y',
);

assert.ok(
  helper.includes(
    "normalized === 'x_of_y'",
  ),
  'helper must preserve legacy x_of_y compatibility',
);

assert.ok(
  helper.includes(
    '.trim()',
  ) &&
  helper.includes(
    '.toLowerCase()',
  ),
  'measurement aliases must be normalized before comparison',
);

const helperCalls =
  browserEntry.match(
    /isXOfYMeasurementType\(\s*goalData\.measurement_type,\s*\)/g,
  ) || [];

assert.strictEqual(
  helperCalls.length,
  3,
  'all three external data-entry measurement decisions must use the alias helper',
);

const legacyDirectChecks =
  browserEntry.match(
    /goalData\.measurement_type\s*===\s*'x_of_y'/g,
  ) || [];

assert.strictEqual(
  legacyDirectChecks.length,
  0,
  'external data entry must not retain direct x_of_y-only checks',
);

assert.ok(
  packageJson.includes(
    'node tests/data-entry-measurement-type-alias.test.cjs',
  ),
  'measurement alias regression must be registered in test:unit',
);

console.log(
  'PASS: external data-entry x/y measurement alias contract',
);
