#!/usr/bin/env node
/**
 * Batch Update Script for Presentation Files
 * 
 * This script updates presentation HTML files to be CSP-compliant by:
 * 1. Adding reference to external presentation-nav.js
 * 2. Removing inline <script> blocks
 * 3. Removing onclick attributes
 * 4. Adding appropriate CSS classes (nav-prev, nav-next, nav-home)
 * 5. Adding aria-label attributes for accessibility
 * 6. Adding data-slide-index and data-slide-total attributes
 * 
 * Usage: node scripts/batch-update-presentations.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

// Configuration
const PRESENTATIONS_DIR = path.join(__dirname, '..', 'site', 'presentations');
const SCRIPT_TAG = '<script src="/site/assets/js/presentation-nav.js" defer></script>';

/**
 * Find all presentation HTML files
 */
function findPresentationFiles(dir) {
  const files = [];
  
  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'index.html') {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

/**
 * Update a single presentation file
 */
function updatePresentationFile(filePath) {
  console.log(`\nProcessing: ${path.relative(process.cwd(), filePath)}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // 1. Add external script reference if not present
  if (!content.includes('presentation-nav.js')) {
    const titleMatch = content.match(/(<title>.*?<\/title>)/);
    if (titleMatch) {
      content = content.replace(titleMatch[0], titleMatch[0] + '\n    ' + SCRIPT_TAG);
      console.log('  ✓ Added external script reference');
      modified = true;
    } else {
      console.log('  ⚠ Could not find <title> tag to insert script');
    }
  }
  
  // 2. Remove inline script blocks (but preserve external scripts)
  const scriptMatches = content.match(/<script(?:\s+[^>]*)?>[\s\S]*?<\/script>/gi) || [];
  for (const script of scriptMatches) {
    if (!script.includes('src=') && script.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1].trim()) {
      content = content.replace(script, '');
      console.log('  ✓ Removed inline script block');
      modified = true;
    }
  }
  
  // 3. Remove onclick attributes and add appropriate classes
  const onclickMatches = content.match(/<button[^>]*onclick[^>]*>/gi) || [];
  for (const button of onclickMatches) {
    let newButton = button;
    
    // Determine button type from onclick content
    if (button.includes('changeSlide(-1)') || button.includes('prevSlide')) {
      newButton = button.replace(/onclick="[^"]*"/, '');
      if (!newButton.includes('nav-prev')) {
        newButton = newButton.replace(/class="([^"]*)"/, 'class="$1 nav-prev"');
      }
      if (!newButton.includes('aria-label')) {
        newButton = newButton.replace(/<button/, '<button aria-label="Previous slide"');
      }
    } else if (button.includes('changeSlide(1)') || button.includes('nextSlide')) {
      newButton = button.replace(/onclick="[^"]*"/, '');
      if (!newButton.includes('nav-next')) {
        newButton = newButton.replace(/class="([^"]*)"/, 'class="$1 nav-next"');
      }
      if (!newButton.includes('aria-label')) {
        newButton = newButton.replace(/<button/, '<button aria-label="Next slide"');
      }
    }
    
    if (newButton !== button) {
      content = content.replace(button, newButton);
      console.log('  ✓ Removed onclick and added classes/aria-label');
      modified = true;
    }
  }
  
  // 4. Update home button/link
  const homeMatches = content.match(/<(?:a|button)[^>]*class="[^"]*home-btn[^"]*"[^>]*>/gi) || [];
  for (const home of homeMatches) {
    if (!home.includes('nav-home')) {
      const newHome = home.replace(/class="([^"]*)"/, 'class="$1 nav-home"');
      content = content.replace(home, newHome);
      console.log('  ✓ Added nav-home class to home button');
      modified = true;
    }
  }
  
  // 5. Add data attributes to presentation container if missing
  if (!content.includes('data-slide-index')) {
    // Try to extract presentation number from path
    const presMatch = filePath.match(/presentation-(\d+)/);
    if (presMatch) {
      const presNum = presMatch[1];
      const containerMatch = content.match(/<div class="presentation-container">/);
      if (containerMatch) {
        const newContainer = `<div class="presentation-container" data-slide-index="${presNum}" data-slide-total="13">`;
        content = content.replace(containerMatch[0], newContainer);
        console.log(`  ✓ Added data-slide-index="${presNum}" and data-slide-total="13"`);
        modified = true;
      }
    }
  }
  
  // Write file if modified
  if (modified) {
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('  ✅ File updated');
    } else {
      console.log('  ℹ DRY RUN: Would update file');
    }
    return true;
  } else {
    console.log('  ℹ No changes needed');
    return false;
  }
}

/**
 * Main function
 */
function main() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }
  
  console.log('Finding presentation files...');
  const presentationFiles = findPresentationFiles(PRESENTATIONS_DIR);
  
  console.log(`\nFound ${presentationFiles.length} presentation files\n`);
  console.log('=' .repeat(60));
  
  let updatedCount = 0;
  
  for (const file of presentationFiles) {
    const updated = updatePresentationFile(file);
    if (updated) updatedCount++;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Complete!`);
  console.log(`   Files processed: ${presentationFiles.length}`);
  console.log(`   Files updated: ${updatedCount}`);
  console.log(`   Files unchanged: ${presentationFiles.length - updatedCount}`);
  
  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

if (require.main === module) {
  main();
}

module.exports = { updatePresentationFile, findPresentationFiles };
