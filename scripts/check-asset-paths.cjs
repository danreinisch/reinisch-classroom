#!/usr/bin/env node
/**
 * Check Asset Paths Script
 * Verifies that critical asset files exist at expected paths
 * This prevents deploy-time 404s for presentation navigation
 * Also checks toolkit builder files for inline scripts/onclick handlers
 * Phase 302B: Added MIME type validation for core JS assets
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

// Core entry points to check for script src references
const ENTRY_POINTS = [
  'site/student/index.html',
  'site/hub/index.html',
  'site/viewer/index.html',
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

console.log('');

// Check core entry points for script references
console.log('🔍 Checking core entry points for JS asset references...\n');

ENTRY_POINTS.forEach((entryPath) => {
  const fullPath = path.join(process.cwd(), entryPath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  Entry point not found: ${entryPath}`);
    hasWarnings = true;
    return;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  
  // Extract script src references
  // Note: This regex is for validation/detection, not HTML filtering
  const scriptSrcMatches = content.match(/<script[^>]*\ssrc=["']([^"']+)["']/gi);
  
  if (!scriptSrcMatches || scriptSrcMatches.length === 0) {
    console.log(`✅ ${entryPath} - No external script references found`);
    return;
  }
  
  console.log(`📄 ${entryPath}:`);
  
  let entryHasIssues = false;
  
  scriptSrcMatches.forEach((match) => {
    // Extract the src value
    const srcMatch = match.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) return;
    
    let scriptSrc = srcMatch[1];
    
    // Skip external URLs
    if (scriptSrc.startsWith('http://') || scriptSrc.startsWith('https://')) {
      return;
    }
    
    // Strip query parameters for file resolution
    const scriptSrcWithoutQuery = scriptSrc.split('?')[0];
    
    // Resolve the script path relative to the site directory
    // Normalize the path: /web/foo.js -> site/web/foo.js, /assets/js/bar.js -> depends on redirects
    let scriptPath = scriptSrcWithoutQuery;
    
    // Remove leading slash
    if (scriptPath.startsWith('/')) {
      scriptPath = scriptPath.substring(1);
    }
    
    // Try to resolve through common paths
    let resolvedPath = null;
    const candidatePaths = [
      path.join(process.cwd(), 'site', scriptPath),
      path.join(process.cwd(), scriptPath),
    ];
    
    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        resolvedPath = candidate;
        break;
      }
    }
    
    if (!resolvedPath) {
      console.warn(`   ⚠️  Script reference ${scriptSrc} cannot be resolved to a file`);
      console.warn(`      This may result in a 404 or return HTML instead of JS`);
      entryHasIssues = true;
      hasWarnings = true;
    } else {
      // Check if it's actually a JS file
      const fileContent = fs.readFileSync(resolvedPath, 'utf8');
      
      // Simple heuristic: if file starts with HTML tags, it's likely HTML not JS
      const looksLikeHtml = /^\s*<!DOCTYPE/i.test(fileContent) || /^\s*<html/i.test(fileContent);
      
      if (looksLikeHtml) {
        console.warn(`   ❌ Script ${scriptSrc} resolves to an HTML file!`);
        console.warn(`      Path: ${path.relative(process.cwd(), resolvedPath)}`);
        console.warn(`      This will cause CSP violations and script errors`);
        entryHasIssues = true;
        hasErrors = true;
      } else {
        console.log(`   ✅ ${scriptSrc} -> valid JS file`);
      }
    }
  });
  
  if (!entryHasIssues) {
    console.log(`   All script references are valid`);
  }
  
  console.log('');
});

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

// Summary
if (hasErrors) {
  console.error('❌ ERRORS found! Some script references resolve to HTML files.');
  console.error('   Fix these issues to prevent CSP violations and runtime errors.\n');
  process.exit(EXIT_CODE_ERROR);
} else if (hasWarnings) {
  console.warn('⚠️  WARNINGS found. Review the issues above.\n');
  process.exit(EXIT_CODE_WARNING);
} else {
  console.log('✅ All checks passed!\n');
  process.exit(EXIT_CODE_WARNING);
}
