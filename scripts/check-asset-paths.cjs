#!/usr/bin/env node
/**
 * Check Asset Paths Script
 * Validates that critical JavaScript assets exist at expected locations
 * 
 * Checks:
 * 1. /assets/js/presentation-nav.js exists (canonical path)
 * 2. /site/assets/js/presentation-nav.js exists (backward compatibility)
 * 3. Both files are identical
 * 
 * Usage: node scripts/check-asset-paths.cjs
 * Exit code: 0 if all checks pass, 1 if any fail
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Calculate file hash
 */
function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Main check function
 */
function main() {
  console.log('🔍 Checking asset paths...\n');
  
  const rootDir = process.cwd();
  const canonicalPath = path.join(rootDir, 'assets', 'js', 'presentation-nav.js');
  const backwardCompatPath = path.join(rootDir, 'site', 'assets', 'js', 'presentation-nav.js');
  
  let hasErrors = false;
  
  // Check canonical path
  if (!fs.existsSync(canonicalPath)) {
    console.log('❌ Canonical path missing: /assets/js/presentation-nav.js');
    hasErrors = true;
  } else {
    console.log('✅ Canonical path exists: /assets/js/presentation-nav.js');
  }
  
  // Check backward compatibility path
  if (!fs.existsSync(backwardCompatPath)) {
    console.log('❌ Backward compatibility path missing: /site/assets/js/presentation-nav.js');
    hasErrors = true;
  } else {
    console.log('✅ Backward compatibility path exists: /site/assets/js/presentation-nav.js');
  }
  
  // If both exist, verify they're identical
  if (fs.existsSync(canonicalPath) && fs.existsSync(backwardCompatPath)) {
    const canonicalHash = getFileHash(canonicalPath);
    const backwardCompatHash = getFileHash(backwardCompatPath);
    
    if (canonicalHash !== backwardCompatHash) {
      console.log('❌ Files are not identical!');
      console.log(`   /assets/js/presentation-nav.js: ${canonicalHash}`);
      console.log(`   /site/assets/js/presentation-nav.js: ${backwardCompatHash}`);
      hasErrors = true;
    } else {
      console.log('✅ Both files are identical (hash: ' + canonicalHash.substring(0, 8) + '...)');
    }
  }
  
  console.log('');
  
  if (hasErrors) {
    console.log('❌ Asset path validation failed!\n');
    console.log('💡 To fix:');
    console.log('   1. Ensure /assets/js/ directory exists');
    console.log('   2. Copy presentation-nav.js to both locations');
    console.log('   3. Keep both files in sync\n');
    process.exit(1);
  } else {
    console.log('✅ All asset path checks passed!\n');
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
