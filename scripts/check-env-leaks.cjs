#!/usr/bin/env node
/**
 * check-env-leaks.js
 * 
 * Scans build output directory for literal occurrences of legacy secret values.
 * Emits warnings (non-fatal) if found to help detect accidental secret exposure.
 * 
 * Usage:
 *   node scripts/check-env-leaks.js
 * 
 * Environment Variables:
 *   BUILD_OUTPUT_DIR - Directory to scan (default: 'site')
 *   ADMIN_USER - Legacy admin username (checked if present)
 *   ADMIN_PASS - Legacy admin password (checked if present)
 *   ADMIN_USER_ALIASES - Legacy admin aliases (checked if present)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const BUILD_OUTPUT_DIR = process.env.BUILD_OUTPUT_DIR || 'site';
const SECRETS_TO_CHECK = [
  { name: 'ADMIN_USER', value: process.env.ADMIN_USER },
  { name: 'ADMIN_PASS', value: process.env.ADMIN_PASS },
  { name: 'ADMIN_USER_ALIASES', value: process.env.ADMIN_USER_ALIASES }
];

// Only check secrets that are defined and not empty
const activeSecrets = SECRETS_TO_CHECK.filter(s => s.value && s.value.trim().length > 0);

if (activeSecrets.length === 0) {
  console.log('✓ No legacy secret values defined in environment - skip leak check');
  process.exit(0);
}

// Check if build output directory exists
const buildDir = path.resolve(process.cwd(), BUILD_OUTPUT_DIR);
if (!fs.existsSync(buildDir)) {
  console.log(`ℹ Build output directory '${BUILD_OUTPUT_DIR}' not found - skip leak check`);
  process.exit(0);
}

console.log(`\n🔍 Scanning build output directory: ${BUILD_OUTPUT_DIR}`);
console.log(`   Checking for ${activeSecrets.length} legacy secret value(s)\n`);

let warningsFound = 0;

/**
 * Recursively scan directory for files
 */
function scanDirectory(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules, .git, etc.
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDirectory(fullPath, results);
      }
    } else if (entry.isFile()) {
      // Only scan text-based files
      const ext = path.extname(entry.name).toLowerCase();
      const textExtensions = ['.html', '.js', '.css', '.json', '.xml', '.txt', '.md', '.svg'];
      if (textExtensions.includes(ext) || !ext) {
        results.push(fullPath);
      }
    }
  }
  
  return results;
}

/**
 * Scan a file for secret values
 */
function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(buildDir, filePath);
    
    for (const secret of activeSecrets) {
      const value = secret.value.trim();
      
      // Skip very short values to avoid false positives
      if (value.length < 4) continue;
      
      if (content.includes(value)) {
        warningsFound++;
        
        // Find line number and context (but don't print the secret value)
        const lines = content.split('\n');
        const matchingLines = [];
        
        lines.forEach((line, idx) => {
          if (line.includes(value)) {
            // Sanitize output: replace secret with placeholder
            const sanitized = line.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]');
            matchingLines.push({
              lineNumber: idx + 1,
              content: sanitized.trim().substring(0, 100) // limit length
            });
          }
        });
        
        console.warn(`⚠️  WARNING: Found ${secret.name} value in build output`);
        console.warn(`   File: ${relativePath}`);
        matchingLines.forEach(m => {
          console.warn(`   Line ${m.lineNumber}: ${m.content}`);
        });
        console.warn('');
      }
    }
  } catch (error) {
    // Ignore binary files or read errors
    if (error.code !== 'ENOENT') {
      // Only warn about unexpected errors
      if (!error.message.includes('EISDIR')) {
        console.warn(`   Skipping ${filePath}: ${error.message}`);
      }
    }
  }
}

// Scan all files
const filesToScan = scanDirectory(buildDir);
console.log(`   Found ${filesToScan.length} file(s) to scan\n`);

for (const file of filesToScan) {
  scanFile(file);
}

// Summary
if (warningsFound === 0) {
  console.log('✅ No legacy secret values found in build output\n');
} else {
  console.log(`\n⚠️  Found ${warningsFound} occurrence(s) of legacy secret values in build output`);
  console.log('   Consider rotating these secrets and verifying they are not referenced in code.\n');
  console.log('   This is a WARNING only - build will continue.\n');
}

// Always exit 0 (non-blocking)
process.exit(0);
