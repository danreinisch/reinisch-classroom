#!/usr/bin/env node
/**
 * Check Presentations Script
 * Validates presentation HTML files for CSP compliance and proper structure
 * 
 * Checks for:
 * 1. Presence of presentation-nav.js script tag
 * 2. Absence of inline event handlers (onclick, onload, etc.)
 * 3. Presence of required navigation classes (.nav-prev, .nav-next)
 * 4. Background container structure
 * 5. Slide elements with .slide class
 * 
 * Usage: node scripts/check-presentations.cjs
 * Exit code: 0 if all checks pass, 1 if violations found
 */

const fs = require('fs');
const path = require('path');

// Event attributes to check for
const EVENT_ATTRIBUTES = [
  'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover', 'onmousemove', 'onmouseout',
  'onkeydown', 'onkeypress', 'onkeyup',
  'onload', 'onunload', 'onbeforeunload',
  'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
  'onscroll', 'onresize',
  'oninput', 'oninvalid',
  'oncontextmenu', 'ondrag', 'ondrop'
];

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
        // Only walk presentation directories
        if (entry.name.startsWith('presentation-') || currentPath.includes('presentations')) {
          walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        // Include all HTML files that are actual presentation files (not just redirect index.html)
        const content = fs.readFileSync(fullPath, 'utf8');
        // Skip index.html files that are just redirects
        if (entry.name === 'index.html' && content.includes('meta http-equiv="refresh"')) {
          continue;
        }
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

/**
 * Check if file has presentation-nav.js script tag
 */
function checkScriptTag(content) {
  const hasScript = content.includes('presentation-nav.js');
  const hasCorrectPath = content.includes('/assets/js/presentation-nav.js');
  const hasOldPath = content.includes('/site/assets/js/presentation-nav.js');
  
  if (!hasScript) {
    return { pass: false, message: 'Missing presentation-nav.js script tag' };
  }
  if (hasOldPath && !hasCorrectPath) {
    return { pass: false, message: 'Uses old path /site/assets/js/presentation-nav.js, should use /assets/js/presentation-nav.js' };
  }
  return { pass: true };
}

/**
 * Check for inline event attributes
 */
function checkInlineHandlers(content) {
  const violations = [];
  
  for (const attr of EVENT_ATTRIBUTES) {
    const regex = new RegExp(`\\s${attr}\\s*=\\s*["']([^"']+)["']`, 'gi');
    const matches = content.match(regex);
    
    if (matches) {
      violations.push({
        attribute: attr,
        count: matches.length
      });
    }
  }
  
  return violations;
}

/**
 * Check for required navigation classes
 */
function checkNavigationClasses(content) {
  const issues = [];
  
  // Check for navigation buttons/links
  const hasNavigation = content.includes('class="nav-prev"') || 
                        content.includes('class="nav-next"') ||
                        content.match(/class="[^"]*\bnav-prev\b[^"]*"/);
  
  if (!hasNavigation) {
    // Could be a single-slide presentation, check for slides
    const slideMatches = content.match(/class="[^"]*\bslide\b[^"]*"/g);
    if (slideMatches && slideMatches.length > 1) {
      issues.push('Multi-slide presentation missing .nav-prev/.nav-next classes');
    }
  }
  
  return issues;
}

/**
 * Check background container
 */
function checkBackgroundContainer(content) {
  const issues = [];
  
  const hasBgSlideshow = content.includes('id="bgSlideshow"');
  const hasBgClass = content.includes('class="bg-slideshow"') || 
                     content.includes('class="background-slideshow"');
  
  if (hasBgClass && !hasBgSlideshow) {
    issues.push('Background container found but missing id="bgSlideshow"');
  }
  
  return issues;
}

/**
 * Check slide structure
 */
function checkSlideStructure(content) {
  const issues = [];
  
  const slideMatches = content.match(/class="[^"]*\bslide\b[^"]*"/g);
  
  if (!slideMatches || slideMatches.length === 0) {
    // Check for data-slide attribute as alternative
    const dataSlideMatches = content.match(/data-slide/g);
    if (!dataSlideMatches) {
      issues.push('No slides found with .slide class or [data-slide] attribute');
    }
  }
  
  return issues;
}

/**
 * Check a single presentation file
 */
function checkPresentationFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(process.cwd(), filePath);
  
  const checks = {
    scriptTag: checkScriptTag(content),
    inlineHandlers: checkInlineHandlers(content),
    navigationClasses: checkNavigationClasses(content),
    backgroundContainer: checkBackgroundContainer(content),
    slideStructure: checkSlideStructure(content)
  };
  
  // Determine if file passes all checks
  const hasIssues = 
    !checks.scriptTag.pass ||
    checks.inlineHandlers.length > 0 ||
    checks.navigationClasses.length > 0 ||
    checks.backgroundContainer.length > 0 ||
    checks.slideStructure.length > 0;
  
  return {
    path: relativePath,
    hasIssues,
    checks
  };
}

/**
 * Main check function
 */
function main() {
  console.log('🔍 Checking presentation files...\n');
  
  const presentationsDir = path.join(process.cwd(), 'site', 'presentations');
  
  if (!fs.existsSync(presentationsDir)) {
    console.log('⚠️  site/presentations/ directory not found');
    process.exit(1);
  }
  
  const presentationFiles = findPresentationFiles(presentationsDir);
  
  if (presentationFiles.length === 0) {
    console.log('⚠️  No presentation files found to check');
    process.exit(1);
  }
  
  console.log(`Found ${presentationFiles.length} presentation files to check\n`);
  console.log('=' .repeat(70) + '\n');
  
  const results = presentationFiles.map(checkPresentationFile);
  const filesWithIssues = results.filter(r => r.hasIssues);
  
  // Report results
  if (filesWithIssues.length === 0) {
    console.log('✅ All presentation files passed validation!\n');
    console.log('Checks performed:');
    console.log('  ✓ Script tag present with correct path');
    console.log('  ✓ No inline event handlers');
    console.log('  ✓ Navigation classes present');
    console.log('  ✓ Background containers properly configured');
    console.log('  ✓ Slide structure valid');
    console.log(`\n📦 Files checked: ${presentationFiles.length}`);
    process.exit(0);
  } else {
    console.log(`❌ Found issues in ${filesWithIssues.length} file(s):\n`);
    
    for (const result of filesWithIssues) {
      console.log(`📄 ${result.path}:`);
      
      if (!result.checks.scriptTag.pass) {
        console.log(`   ❌ Script: ${result.checks.scriptTag.message}`);
      }
      
      if (result.checks.inlineHandlers.length > 0) {
        console.log(`   ❌ Inline handlers found:`);
        for (const v of result.checks.inlineHandlers) {
          console.log(`      - ${v.attribute}: ${v.count} occurrence(s)`);
        }
      }
      
      if (result.checks.navigationClasses.length > 0) {
        for (const issue of result.checks.navigationClasses) {
          console.log(`   ⚠️  Navigation: ${issue}`);
        }
      }
      
      if (result.checks.backgroundContainer.length > 0) {
        for (const issue of result.checks.backgroundContainer) {
          console.log(`   ⚠️  Background: ${issue}`);
        }
      }
      
      if (result.checks.slideStructure.length > 0) {
        for (const issue of result.checks.slideStructure) {
          console.log(`   ⚠️  Slides: ${issue}`);
        }
      }
      
      console.log('');
    }
    
    console.log('=' .repeat(70));
    console.log(`\n📊 Summary:`);
    console.log(`   Total files checked: ${presentationFiles.length}`);
    console.log(`   Files with issues: ${filesWithIssues.length}`);
    console.log(`   Files passing: ${presentationFiles.length - filesWithIssues.length}`);
    console.log('\n💡 Run scripts/batch-update-presentations.cjs to fix some of these issues automatically.\n');
    
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { checkPresentationFile, findPresentationFiles };
