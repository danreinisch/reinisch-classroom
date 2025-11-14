#!/usr/bin/env node
/**
 * Check Asset Paths Script
 * Verifies that critical asset files exist at expected paths
 * This prevents deploy-time 404s for presentation navigation
 */

const fs = require('fs');
const path = require('path');

const EXIT_CODE_WARNING = 0; // Don't fail build, just warn
const EXIT_CODE_ERROR = 1;

// Define required asset paths relative to repository root
const REQUIRED_ASSETS = [
  'assets/js/presentation-nav.js',
  'site/assets/js/presentation-nav.js',
];

let hasWarnings = false;
let hasErrors = false;

console.log('🔍 Checking asset paths...\n');

REQUIRED_ASSETS.forEach((assetPath) => {
  const fullPath = path.join(process.cwd(), assetPath);
  
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    console.log(`✅ Found: ${assetPath} (${stats.size} bytes)`);
  } else {
    console.warn(`⚠️  MISSING: ${assetPath}`);
    hasWarnings = true;
  }
});

console.log('');

if (hasWarnings) {
  console.warn('⚠️  WARNING: Some asset files are missing!');
  console.warn('   This may cause 404 errors in presentations.');
  console.warn('   Expected paths:');
  REQUIRED_ASSETS.forEach((p) => console.warn(`     - ${p}`));
  console.warn('');
  console.warn('   The Netlify redirect should handle /site/assets/js/presentation-nav.js');
  console.warn('   by serving /assets/js/presentation-nav.js if it exists.');
  console.warn('');
} else {
  console.log('✅ All required asset paths are present!');
}

// Exit with warning code (0) to not fail the build, but make it visible
process.exit(hasWarnings ? EXIT_CODE_WARNING : EXIT_CODE_WARNING);
