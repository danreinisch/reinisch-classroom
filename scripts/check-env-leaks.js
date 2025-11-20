#!/usr/bin/env node
/**
 * check-env-leaks.js
 * 
 * Optional post-build check that scans the build output for leaked environment secrets.
 * This helps prevent regression where secret values (like ADMIN_USER_ALIASES, DMIN_USER_ALIASES, 
 * ADMIN_USER, ADMIN_PASS) accidentally appear in the browser bundle.
 * 
 * Also scans backup scripts for hardcoded secrets or dangerous patterns.
 * 
 * By default, exit code 0 (non-fatal) so builds aren't blocked, but warnings are logged to help catch issues.
 * Set LEAK_CHECK_STRICT=1 to enable strict mode which will fail the build (exit code 1) on detected leaks.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

// Configuration
const BUILD_DIR = process.env.NETLIFY_PUBLISH_DIR || process.env.BUILD_DIR || '.';
const STRICT_MODE = process.env.LEAK_CHECK_STRICT === '1';
const CHECK_BACKUP_SCRIPTS = process.env.CHECK_BACKUP_SCRIPTS !== '0'; // Default enabled
const SECRETS_TO_CHECK = [
  { name: 'ADMIN_USER_ALIASES', value: process.env.ADMIN_USER_ALIASES },
  { name: 'DMIN_USER_ALIASES', value: process.env.DMIN_USER_ALIASES },
  { name: 'ADMIN_USER', value: process.env.ADMIN_USER },
  { name: 'ADMIN_PASS', value: process.env.ADMIN_PASS }
];

// Dangerous patterns to check in backup scripts (case-insensitive)
const DANGEROUS_PATTERNS = [
  { pattern: /echo\s+["']?\$\{?[A-Z_]*PASS(WORD)?[A-Z_]*\}?["']?/gi, description: 'Possible password echo' },
  { pattern: /echo\s+["']?\$\{?[A-Z_]*SECRET[A-Z_]*\}?["']?/gi, description: 'Possible secret echo' },
  { pattern: /echo\s+["']?\$\{?[A-Z_]*API[_-]?KEY[A-Z_]*\}?["']?/gi, description: 'Possible API key echo' },
  { pattern: /echo\s+["']?\$\{?[A-Z_]*TOKEN[A-Z_]*\}?["']?/gi, description: 'Possible token echo' },
  { pattern: /echo\s+["']?\$\{?SUPABASE_(SERVICE_)?ROLE_KEY\}?["']?/gi, description: 'Supabase service key echo' },
  { pattern: />\s*["']?\$\{?[A-Z_]*(PASS|SECRET|TOKEN|KEY)[A-Z_]*\}?["']?/gi, description: 'Possible secret redirection to file' },
  // Check for literal hardcoded values that look like secrets
  { pattern: /SUPABASE_KEY\s*=\s*["'][a-zA-Z0-9.]{30,}["']/g, description: 'Hardcoded Supabase key' },
  { pattern: /API_KEY\s*=\s*["'][a-zA-Z0-9]{20,}["']/g, description: 'Hardcoded API key' },
  { pattern: /PASSWORD\s*=\s*["'].+["']/g, description: 'Hardcoded password' },
];

// File extensions to scan
const SCANNABLE_EXTENSIONS = ['.js', '.html', '.css', '.json', '.mjs'];

// Directories to skip
const SKIP_DIRS = ['node_modules', '.git', '.github', 'tests', 'supabase'];

console.log('[check-env-leaks] Starting environment leak check...');
console.log(`[check-env-leaks] Build directory: ${BUILD_DIR}`);
console.log(`[check-env-leaks] Strict mode: ${STRICT_MODE ? 'ENABLED (build will fail on leaks)' : 'DISABLED (warnings only)'}`);
console.log(`[check-env-leaks] Backup script check: ${CHECK_BACKUP_SCRIPTS ? 'ENABLED' : 'DISABLED'}`);

// Filter out undefined/empty secrets
const activeSecrets = SECRETS_TO_CHECK.filter(s => s.value && s.value.trim().length > 0);

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

let leaks = [];
if (activeSecrets.length > 0) {
  leaks = scanDirectory(BUILD_DIR);
} else {
  console.log('[check-env-leaks] No secrets configured to check for in build output.');
}

// Check backup scripts for dangerous patterns
function checkBackupScripts() {
  const backupScriptPaths = [
    'scripts/create-backup.sh',
    '.github/scripts/backup.sh',
    'backup.sh'
  ];
  
  const issues = [];
  
  for (const scriptPath of backupScriptPaths) {
    if (!existsSync(scriptPath)) {
      continue;
    }
    
    try {
      const content = readFileSync(scriptPath, 'utf-8');
      
      for (const { pattern, description } of DANGEROUS_PATTERNS) {
        const matches = content.match(pattern);
        if (matches) {
          for (const match of matches) {
            issues.push({
              file: scriptPath,
              pattern: description,
              match: match.trim(),
              line: content.substring(0, content.indexOf(match)).split('\n').length
            });
          }
        }
      }
    } catch (err) {
      // Skip files that can't be read
      continue;
    }
  }
  
  return issues;
}

let backupIssues = [];
if (CHECK_BACKUP_SCRIPTS) {
  console.log('[check-env-leaks] Checking backup scripts for dangerous patterns...');
  backupIssues = checkBackupScripts();
}

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
  
  if (STRICT_MODE) {
    console.error('[check-env-leaks] ❌ STRICT MODE: Build FAILED due to secret leaks.');
    process.exit(1);
  } else {
    console.warn('[check-env-leaks] This is a WARNING only - build will continue.');
  }
} else {
  console.log('[check-env-leaks] ✓ No secret leaks detected in build output.');
}

if (backupIssues.length > 0) {
  console.warn('[check-env-leaks] ⚠️  WARNING: Potential security issues in backup scripts!');
  console.warn('[check-env-leaks] The following dangerous patterns were detected:');
  console.warn('');
  
  for (const issue of backupIssues) {
    console.warn(`  File: ${issue.file}:${issue.line}`);
    console.warn(`  Issue: ${issue.pattern}`);
    console.warn(`  Match: ${issue.match}`);
    console.warn('');
  }
  
  console.warn('[check-env-leaks] Review these patterns to ensure no secrets are being written to backup files.');
  console.warn('[check-env-leaks] Backup scripts should only store metadata (names/lengths), never values.');
  
  if (STRICT_MODE) {
    console.error('[check-env-leaks] ❌ STRICT MODE: Build FAILED due to backup script issues.');
    process.exit(1);
  } else {
    console.warn('[check-env-leaks] This is a WARNING only - build will continue.');
  }
} else if (CHECK_BACKUP_SCRIPTS) {
  console.log('[check-env-leaks] ✓ No dangerous patterns detected in backup scripts.');
}

// Exit with 0 (non-fatal) unless strict mode detected issues
process.exit(0);
