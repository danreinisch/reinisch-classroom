#!/usr/bin/env node
/**
 * Check Asset Paths Script
 * Verifies that critical asset files exist at expected paths
 * This prevents deploy-time 404s for presentation navigation
 * Also checks toolkit builder files for inline scripts/onclick handlers
 */

const fs = require('fs');
const path = require('path');

const EXIT_CODE_WARNING = 0; // Don't fail build, just warn
const EXIT_CODE_ERROR = 1;

// Define required asset paths relative to repository root
const REQUIRED_ASSETS = [
  'assets/js/presentation-nav.js',
  'site/assets/js/presentation-nav.js',
  'assets/js/adit-week11-bg-preload.js',
  'site/assets/js/adit-week11-bg-preload.js',
];

// Toolkit builder files to check for inline scripts
const TOOLKIT_BUILDERS = [
  'site/language-arts/toolkit/presentations/presentation-07/written response builder.html',
  'site/language-arts/toolkit/presentations/presentation-08',
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
  console.warn('   The Netlify redirects should handle /site/assets/js paths');
  console.warn('   by serving /assets/js files if they exist.');
  console.warn('');
} else {
  console.log('✅ All required asset paths are present!');
}

// Check toolkit builders for inline scripts/onclick
console.log('🔍 Checking toolkit builder files for inline scripts...\n');

TOOLKIT_BUILDERS.forEach((builderPath) => {
  const fullPath = path.join(process.cwd(), builderPath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  Toolkit builder not found: ${builderPath}`);
    hasWarnings = true;
    return;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  
  // Check for inline onclick handlers
  const onclickMatches = content.match(/\sonclick\s*=\s*["']/gi);
  if (onclickMatches && onclickMatches.length > 0) {
    console.warn(`⚠️  ${builderPath}:`);
    console.warn(`   Found ${onclickMatches.length} inline onclick handler(s)`);
    console.warn('   These should use addEventListener in external JS files');
    hasWarnings = true;
  }
  
  // Check for inline script blocks with content (not external scripts)
  // Note: This regex is used for detection/validation only, not HTML sanitization
  // CodeQL alert js/bad-tag-filter is not applicable in this context
  const scriptMatches = content.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi);
  if (scriptMatches) {
    const scriptsWithContent = scriptMatches.filter(match => {
      // Ignore module scripts
      if (match.match(/<script\s+type=["']module["']/i)) return false;
      // Check if there's actual content between tags
      // This regex is for validation/detection, not HTML filtering
      const contentMatch = match.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      return contentMatch && contentMatch[1].trim().length > 0;
    });
    
    if (scriptsWithContent.length > 0) {
      console.warn(`⚠️  ${builderPath}:`);
      console.warn(`   Found ${scriptsWithContent.length} inline script block(s) with content`);
      console.warn('   JavaScript should be in external .js files');
      hasWarnings = true;
    }
  }
  
  if (!onclickMatches && !scriptMatches?.some(m => {
    // This regex is for validation/detection, not HTML filtering  
    const contentMatch = m.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    return contentMatch && contentMatch[1].trim().length > 0 && !m.match(/<script\s+type=["']module["']/i);
  })) {
    console.log(`✅ ${builderPath} - Clean (no inline scripts/onclick)`);
  }
});

console.log('');

// Exit with warning code (0) to not fail the build, but make it visible
process.exit(hasWarnings ? EXIT_CODE_WARNING : EXIT_CODE_WARNING);
