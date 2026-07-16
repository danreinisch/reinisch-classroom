/* global require */
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('netlify.toml', 'utf8');

const headerBlocks = Array.from(
  source.matchAll(
    /\[\[headers\]\]\s*for\s*=\s*"([^"]+)"\s*\[headers\.values\]\s*Content-Security-Policy\s*=\s*"([^"]*)"/g
  ),
  match => ({
    route: match[1],
    policy: match[2]
  })
);

function requireInlineScriptPolicy(route) {
  const block = headerBlocks.find(
    candidate => candidate.route === route
  );

  assert.ok(
    block,
    `${route} must have a route-specific CSP header block`
  );

  assert.match(
    block.policy,
    /script-src\s+[^;]*'unsafe-inline'/,
    `${route} must permit the existing inline presentation scripts`
  );
}

requireInlineScriptPolicy(
  '/life-skills/presentations-2026-27/*'
);

requireInlineScriptPolicy(
  '/life-skills/presentations/*'
);

console.log(
  'PASS: Current and legacy Life Skills presentation routes permit their existing inline scripts.'
);
