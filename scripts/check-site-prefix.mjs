#!/usr/bin/env node

/**
 * Check Site Prefix Script
 * 
 * Prevents regression of the /site/assets/ path bug by scanning HTML files
 * in Language Arts and Life Skills directories for incorrect asset references.
 * 
 * The issue: When HTML files reference /site/assets/js/..., the browser
 * receives a 404 because "site/" is the published root directory, not a URL path.
 * 
 * Correct pattern:   /assets/js/unit-grid.js
 * Incorrect pattern: /site/assets/js/unit-grid.js
 * 
 * Exit code 1 if violations found, 0 otherwise.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

// Directories to scan for HTML files
const SCAN_DIRS = [
  'site/language-arts',
  'site/life-skills',
  'site/presentations',
];

// Patterns to detect (these are incorrect and should fail the check)
const FORBIDDEN_PATTERNS = [
  {
    pattern: /src=["']\/site\/assets\/js\/unit-grid\.js["']/g,
    description: 'unit-grid.js with /site/ prefix',
    suggestion: 'Use /assets/js/unit-grid.js instead'
  },
  {
    pattern: /src=["']\/site\/assets\/js\/section-nav\.js["']/g,
    description: 'section-nav.js with /site/ prefix',
    suggestion: 'Use /assets/js/section-nav.js instead'
  },
  {
    pattern: /src=["']\/site\/assets\/js\/presentation-nav\.js["']/g,
    description: 'presentation-nav.js with /site/ prefix',
    suggestion: 'Use /assets/js/presentation-nav.js instead'
  },
  {
    pattern: /href=["']\/site\/assets\/css\//g,
    description: 'CSS file with /site/ prefix',
    suggestion: 'Use /assets/css/... instead'
  },
];

let exitCode = 0;
let totalViolations = 0;

console.log('🔍 Checking for /site/assets/ prefix violations...\n');

/**
 * Recursively find all HTML files in a directory
 */
function findHtmlFiles(dir, files = []) {
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      findHtmlFiles(fullPath, files);
    } else if (entry.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Check a single HTML file for forbidden patterns
 */
function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const relativePath = relative(repoRoot, filePath);
  let fileHasViolations = false;
  
  for (const { pattern, description, suggestion } of FORBIDDEN_PATTERNS) {
    const matches = [...content.matchAll(pattern)];
    
    if (matches.length > 0) {
      if (!fileHasViolations) {
        console.error(`❌ ${relativePath}`);
        fileHasViolations = true;
      }
      
      console.error(`   Found ${matches.length} instance(s) of ${description}`);
      console.error(`   ${suggestion}`);
      
      // Show line numbers for first few matches
      matches.slice(0, 3).forEach((match) => {
        const lines = content.substring(0, match.index).split('\n');
        const lineNum = lines.length;
        const line = content.split('\n')[lineNum - 1].trim();
        console.error(`   Line ${lineNum}: ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
      });
      
      if (matches.length > 3) {
        console.error(`   ... and ${matches.length - 3} more`);
      }
      
      totalViolations += matches.length;
    }
  }
  
  if (fileHasViolations) {
    console.error('');
  }
  
  return fileHasViolations;
}

// Scan all configured directories
for (const scanDir of SCAN_DIRS) {
  const fullScanPath = join(repoRoot, scanDir);
  
  try {
    const htmlFiles = findHtmlFiles(fullScanPath);
    console.log(`Scanning ${htmlFiles.length} HTML files in ${scanDir}/...`);
    
    for (const htmlFile of htmlFiles) {
      if (checkFile(htmlFile)) {
        exitCode = 1;
      }
    }
  } catch (err) {
    // Directory might not exist, that's okay
    console.warn(`⚠️  Could not scan ${scanDir}: ${err.message}`);
  }
}

// Summary
console.log('================================================');
if (exitCode === 0) {
  console.log('✅ No /site/assets/ prefix violations found!');
  console.log('   All asset references use correct paths.');
} else {
  console.error(`❌ Found ${totalViolations} violation(s) across scanned files`);
  console.error('');
  console.error('The /site/ prefix causes 404 errors because "site/" is the');
  console.error('published root directory, not a URL path component.');
  console.error('');
  console.error('Fix: Replace /site/assets/... with /assets/...');
}
console.log('================================================');

process.exit(exitCode);
