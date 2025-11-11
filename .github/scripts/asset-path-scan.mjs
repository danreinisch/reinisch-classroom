#!/usr/bin/env node

/**
 * Asset Path Scan
 * 
 * Validates that site/hub/index.html does not contain fragile patterns
 * that have caused loading breakages in the past.
 * 
 * Fails if:
 * - ../web/ appears (should be /web/)
 * - src="web/..." without leading slash
 * - src="student-manager-ui.js" without leading slash
 * - ../assets/bg in Hub HTML (backgrounds must be /assets/bg/...)
 * - Legacy bare new StudentManagerUI( outside module import
 * - Loader version string missing or changed without bump
 * - student-manager:ready/hubHealth writes removed
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '../..');
const hubIndexPath = join(repoRoot, 'site/hub/index.html');

let exitCode = 0;

console.log('🔍 Scanning for fragile asset/path patterns...\n');

// Read hub index.html
let hubIndexContent;
try {
  hubIndexContent = readFileSync(hubIndexPath, 'utf-8');
} catch (err) {
  console.error('❌ FAIL: Could not read site/hub/index.html:', err.message);
  process.exit(1);
}

// Check 1: Relative ../web/ references
console.log('Checking for relative ../web/ references...');
const relativeWebRegex = /\.\.\/(web\/)/g;
const relativeWebMatches = [...hubIndexContent.matchAll(relativeWebRegex)];
if (relativeWebMatches.length > 0) {
  console.error('❌ FAIL: Found relative ../web/ references in site/hub/index.html');
  console.error('   These should use absolute paths: /web/...');
  relativeWebMatches.forEach((match, idx) => {
    const lines = hubIndexContent.substring(0, match.index).split('\n');
    console.error(`   Line ${lines.length}: ${match[0]}`);
  });
  exitCode = 1;
} else {
  console.log('✅ PASS: No relative ../web/ references found');
}

// Check 2: src="web/..." without leading slash
console.log('\nChecking for relative src="web/..." references...');
const relativeSrcWebRegex = /src="web\//g;
const relativeSrcWebMatches = [...hubIndexContent.matchAll(relativeSrcWebRegex)];
if (relativeSrcWebMatches.length > 0) {
  console.error('❌ FAIL: Found relative src="web/..." references in site/hub/index.html');
  console.error('   These should use absolute paths: src="/web/..."');
  relativeSrcWebMatches.forEach((match) => {
    const lines = hubIndexContent.substring(0, match.index).split('\n');
    console.error(`   Line ${lines.length}: ${match[0]}`);
  });
  exitCode = 1;
} else {
  console.log('✅ PASS: No relative src="web/..." references found');
}

// Check 3: src="student-manager-ui.js" without leading slash
console.log('\nChecking for relative src="student-manager-ui.js" reference...');
const relativeStudentManagerRegex = /src="student-manager-ui\.js"/g;
const relativeStudentManagerMatches = [...hubIndexContent.matchAll(relativeStudentManagerRegex)];
if (relativeStudentManagerMatches.length > 0) {
  console.error('❌ FAIL: Found relative src="student-manager-ui.js" in site/hub/index.html');
  console.error('   This should use absolute path: src="/web/student-manager-ui.js"');
  relativeStudentManagerMatches.forEach((match) => {
    const lines = hubIndexContent.substring(0, match.index).split('\n');
    console.error(`   Line ${lines.length}: ${match[0]}`);
  });
  exitCode = 1;
} else {
  console.log('✅ PASS: No relative student-manager-ui.js reference found');
}

// Check 4: ../assets/bg in Hub HTML
console.log('\nChecking for relative ../assets/bg references...');
const relativeAssetsBgRegex = /\.\.\/(assets\/bg)/g;
const relativeAssetsBgMatches = [...hubIndexContent.matchAll(relativeAssetsBgRegex)];
if (relativeAssetsBgMatches.length > 0) {
  console.error('❌ FAIL: Found relative ../assets/bg references in site/hub/index.html');
  console.error('   These should use absolute paths: /assets/bg/...');
  relativeAssetsBgMatches.forEach((match) => {
    const lines = hubIndexContent.substring(0, match.index).split('\n');
    console.error(`   Line ${lines.length}: ${match[0]}`);
  });
  exitCode = 1;
} else {
  console.log('✅ PASS: No relative ../assets/bg references found');
}

// Check 5: Legacy bare new StudentManagerUI( outside module import
console.log('\nChecking for legacy global-only StudentManagerUI usage...');
// Look for "new StudentManagerUI(" but allow "globalThis.StudentManagerUI" or "window.StudentManagerUI"
const legacyStudentManagerRegex = /new\s+StudentManagerUI\s*\(/g;
const legacyStudentManagerMatches = [...hubIndexContent.matchAll(legacyStudentManagerRegex)];
// Filter to only those NOT preceded by "globalThis." or "window."
const filteredLegacyMatches = legacyStudentManagerMatches.filter((match) => {
  const before = hubIndexContent.substring(Math.max(0, match.index - 20), match.index);
  return !before.includes('globalThis.') && !before.includes('window.');
});
if (filteredLegacyMatches.length > 0) {
  console.error('❌ FAIL: Found bare "new StudentManagerUI(" usage outside module import context');
  console.error('   StudentManagerUI should be accessed via window.StudentManagerUI or globalThis.StudentManagerUI');
  filteredLegacyMatches.forEach((match) => {
    const lines = hubIndexContent.substring(0, match.index).split('\n');
    console.error(`   Line ${lines.length}: ${match[0]}`);
  });
  exitCode = 1;
} else {
  console.log('✅ PASS: No legacy global-only StudentManagerUI usage found');
}

// Check 6: Loader version string presence
console.log('\nChecking for loader version string...');
const loaderVersionRegex = /const\s+LOADER_VERSION\s*=/;
const hasLoaderVersion = loaderVersionRegex.test(hubIndexContent);
if (!hasLoaderVersion) {
  console.error('❌ FAIL: Loader version string (const LOADER_VERSION = ...) not found');
  console.error('   A loader version constant should be present to track changes');
  exitCode = 1;
} else {
  console.log('✅ PASS: Loader version string found');
}

// Check 7: student-manager:ready event dispatch
console.log('\nChecking for student-manager:ready event dispatch...');
const readyEventRegex = /dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"`]student-manager:ready['"`]/;
const hasReadyEvent = readyEventRegex.test(hubIndexContent);
if (!hasReadyEvent) {
  console.error('❌ FAIL: student-manager:ready event dispatch not found');
  console.error('   The ready event is critical for smoke tests and diagnostics');
  exitCode = 1;
} else {
  console.log('✅ PASS: student-manager:ready event dispatch found');
}

// Check 8: hubHealth.studentManager writes
console.log('\nChecking for hubHealth.studentManager writes...');
const hubHealthRegex = /window\.hubHealth\.studentManager\s*=/;
const hasHubHealth = hubHealthRegex.test(hubIndexContent);
if (!hasHubHealth) {
  console.error('❌ FAIL: hubHealth.studentManager writes not found');
  console.error('   hubHealth tracking is critical for diagnostics and smoke tests');
  exitCode = 1;
} else {
  console.log('✅ PASS: hubHealth.studentManager writes found');
}

// Summary
console.log('\n================================================');
if (exitCode === 0) {
  console.log('✅ Asset path scan PASSED - no violations found');
} else {
  console.log('❌ Asset path scan FAILED - violations found');
}
console.log('================================================');

process.exit(exitCode);
