#!/usr/bin/env node
/**
 * check-env-leaks.js
 * 
 * Optional post-build check that scans the build output for leaked environment secrets.
 * This helps prevent regression where secret values (like ADMIN_USER_ALIASES, ADMIN_USER, ADMIN_PASS)
 * accidentally appear in the browser bundle.
 * 
 * Exit code 0 (non-fatal) so builds aren't blocked, but warnings are logged to help catch issues.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Configuration
const BUILD_DIR = process.env.NETLIFY_PUBLISH_DIR || process.env.BUILD_DIR || '.';
const SECRETS_TO_CHECK = [
  { name: 'ADMIN_USER_ALIASES', value: process.env.ADMIN_USER_ALIASES },
  { name: 'ADMIN_USER', value: process.env.ADMIN_USER },
  { name: 'ADMIN_PASS', value: process.env.ADMIN_PASS }
];

// File extensions to scan
const SCANNABLE_EXTENSIONS = ['.js', '.html', '.css', '.json', '.mjs'];

// Directories to skip
const SKIP_DIRS = ['node_modules', '.git', '.github', 'tests', 'supabase'];

console.log('[check-env-leaks] Starting environment leak check...');
console.log(`[check-env-leaks] Build directory: ${BUILD_DIR}`);

// Filter out undefined/empty secrets
const activeSecrets = SECRETS_TO_CHECK.filter(s => s.value && s.value.trim().length > 0);

if (activeSecrets.length === 0) {
  console.log('[check-env-leaks] No secrets configured to check. Skipping scan.');
  process.exit(0);
}

console.log(`[check-env-leaks] Checking for ${activeSecrets.length} secret(s)...`);

// Recursively scan directory for files
function scanDirectory(dir, foundLeaks = []) {
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Skip certain directories
      if (SKIP_DIRS.includes(entry)) {
        continue;
      }
      // Recurse into subdirectories
      scanDirectory(fullPath, foundLeaks);
    } else if (stat.isFile()) {
      // Check if file has a scannable extension
      const hasScannableExt = SCANNABLE_EXTENSIONS.some(ext => entry.endsWith(ext));
      if (!hasScannableExt) {
        continue;
      }
      
      try {
        const content = readFileSync(fullPath, 'utf-8');
        
        // Check each secret
        for (const secret of activeSecrets) {
          if (content.includes(secret.value)) {
            foundLeaks.push({
              file: fullPath,
              secret: secret.name,
              value: secret.value
            });
          }
        }
      } catch (err) {
        // Skip files that can't be read as text
        continue;
      }
    }
  }
  
  return foundLeaks;
}

const leaks = scanDirectory(BUILD_DIR);

if (leaks.length > 0) {
  console.warn('[check-env-leaks] ⚠️  WARNING: Potential secret leaks detected!');
  console.warn('[check-env-leaks] The following files contain literal secret values:');
  console.warn('');
  
  for (const leak of leaks) {
    console.warn(`  File: ${leak.file}`);
    console.warn(`  Secret: ${leak.secret}`);
    console.warn(`  Value: ${leak.value.substring(0, 10)}... (truncated)`);
    console.warn('');
  }
  
  console.warn('[check-env-leaks] These secrets should be removed from browser-delivered code.');
  console.warn('[check-env-leaks] This is a WARNING only - build will continue.');
} else {
  console.log('[check-env-leaks] ✓ No secret leaks detected. Build is clean!');
}

// Always exit with 0 (non-fatal)
process.exit(0);
